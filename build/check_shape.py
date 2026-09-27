#!/usr/bin/env python3
"""
check_shape.py — the gate verify_data.py cannot be.

verify_data proves every string round-trips. It does NOT prove a string landed on the right
field: a value that parses loose in a body is present in the data and attached to nothing,
and every string still round-trips. So this asserts the SHAPES the site reads, against counts
taken from the corpus itself — grep, or a line scanner that shares no code with the parser —
never a number typed here. Deliberately specific: if a parser or build change displaces a
field, this says which.

    python3 build/check_shape.py [<titterpig-dsl-vtm5e/0.5>] [<titterpig-dsl-vtm5e-3rdparty>]
"""
import glob
import json
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_data import (BOOKS, FILE_PREFIX, SHAPES, SHELVES, LEVEL_HEADING,  # noqa: E402
                        DEFERRED_EXTS, UNPAGED_KINDS, claimed_files, resolve_roots)
from verify_data import BLOB, INDEX_BLOB, RECORDS_BLOB, HERE  # noqa: E402

FAILS = []
COUNT = [0]


def check(label, got, want):
    ok = got == want
    COUNT[0] += 1
    print("  %-66s %s%s" % (label, got, "" if ok else "   EXPECTED %s  ← FAIL" % (want,)))
    if not ok:
        FAILS.append(label)


def load():
    ents, books, index, records = {}, {}, None, None
    for fn in sorted(os.listdir(os.path.join(HERE, "data"))):
        if not fn.endswith(".js"):
            continue
        src = open(os.path.join(HERE, "data", fn), encoding="utf-8").read()
        m = BLOB.search(src)
        if m:
            d = json.loads(m.group(1))
            ents.update(d["entities"])
            books[d["book"]["id"]] = d["book"]
        elif INDEX_BLOB.search(src):
            index = json.loads(INDEX_BLOB.search(src).group(1))
        else:
            records = json.loads(RECORDS_BLOB.search(src).group(1))
    return ents, books, index, records


def grep_count(paths, pattern):
    """How many lines of the corpus match — the source's own count."""
    out = subprocess.run(["grep", "-c", "-E", pattern] + sorted(paths), capture_output=True, text=True)
    return sum(int(line.rsplit(":", 1)[-1] or 0) for line in out.stdout.strip().split("\n") if line)


# ── an independent reader: DEF blocks and the property names printed in them ──
# a DEF, or an ACTOR declaration (the BASE's #… ACTOR "Kindred" DEF {, from the printed sheet)
DEF_LINE = re.compile(r'^\s*(#[A-Za-z0-9]+)\s+(?:\^|ACTOR\s+)"((?:[^"\\]|\\.)*)"\s+DEF\s*\{\s*$')
PROP_LINE = re.compile(r'^\s*\^"((?:[^"\\]|\\.)*)"\s+(STRING|INTEGER|LIST|BOOLEAN|ENUM)\b')
STR_RE = re.compile(r'"(?:[^"\\]|\\.)*"')


def scan(path):
    """[(hash, name, {prop names}, file)] in file order, by brace depth over quote-stripped
    lines. Only props printed at the entity's own depth count (a TABLE's or a GUIDANCE's
    rows are one level deeper)."""
    out, stack, depth = [], [], 0
    for line in open(path, encoding="utf-8"):
        bare = STR_RE.sub('""', line.split(" #", 1)[0] if not DEF_LINE.match(line) else line)
        m = DEF_LINE.match(line)
        if m:
            rec = (m.group(1), m.group(2).replace('\\"', '"'), set(), os.path.basename(path))
            out.append(rec)
            depth += 1
            stack.append((depth, rec))
            continue
        p = PROP_LINE.match(line)
        if p and stack and stack[-1][0] == depth:
            stack[-1][1][2].add(p.group(1))
        depth += bare.count("{") - bare.count("}")
        while stack and stack[-1][0] > depth:
            stack.pop()
    return out


def main():
    roots = resolve_roots(sys.argv[1:])
    paths, deferred = claimed_files(roots)
    ttrpg = [p for p in paths.values() if p.endswith(".ttrpg")]
    ents, books, index, records = load()
    print("check_shape: the fields the site reads, against the corpora's own counts")

    # ── the shelves ──
    check("shelves in the index = the SHELVES map", [s["id"] for s in index["shelves"]], [s["id"] for s in SHELVES])
    check("every book names a declared shelf", sorted({b["shelf"] for b in index["books"]} - {s["id"] for s in SHELVES}), [])
    for s in SHELVES:
        mine = [b["id"] for b in BOOKS if b["shelf"] == s["id"]]
        check("the %s shelf's books all read from its own root" % s["id"],
              [f for bid in mine for b in BOOKS if b["id"] == bid for f in b["_files"]
               if not paths[f].startswith(roots[s["id"]] + os.sep)], [])
    check("every deferred file is deferred by a declared extension",
          sorted({os.path.splitext(f)[1] for f in deferred} - set(DEFERRED_EXTS)), [])

    # ── the books and their chapters ──
    files = sorted(paths)
    prefixes = {b["prefix"] for b in BOOKS}
    check("books in the index = the BOOKS map", len(index["books"]), len(BOOKS))
    check("chapters across the books = corpus files", sum(len(b["chapters"]) for b in books.values()), len(files))
    check("lore chapters = .lore files", sum(1 for b in books.values() for c in b["chapters"] if c["kind"] == "lore"), sum(1 for f in paths if f.endswith(".lore")))
    lore_ok = all(c["text"] == open(paths[c["file"]], encoding="utf-8").read()
                  for b in books.values() for c in b["chapters"] if c["kind"] == "lore")
    check("every lore chapter's text is its file, byte for byte", lore_ok, True)
    paged = [b for b in books.values() if b["kind"] not in UNPAGED_KINDS]
    unpaged = [c["file"] for b in paged for c in b["chapters"] if c["page"] is None]
    check("chapters with no printed page (outside the BASE and homebrew)", unpaged, [])
    order_ok = all([c["page"] for c in b["chapters"]] == sorted(c["page"] for c in b["chapters"]) for b in paged)
    check("every book's chapters in printed-page order", order_ok, True)
    check("every chapter file carries its book's prefix", all(
        any(c["file"].startswith(FILE_PREFIX + b["prefix"]) for bb in BOOKS if bb["id"] == bid for b in [bb])
        for bid, b in books.items() for c in b["chapters"]), True)

    # ── entities and what they carry ──
    check("entities = hashed DEF and ACTOR lines in the corpus", len(ents), grep_count(ttrpg, r'^\s*#[A-Za-z0-9]+ (\^|ACTOR )".*" DEF \{$'))
    check("entities with a DESCRIPTION = DESCRIPTION lines", sum(1 for e in ents.values() if e["desc"] is not None),
          grep_count(ttrpg, r'^\s*DESCRIPTION "'))
    corr = index["corrections"]
    check("GUIDANCE entries (entities + corrections) = ENTRY lines",
          sum(len(e["guidance"]) for e in ents.values()) + sum(len(c["guidance"]) for c in corr),
          grep_count(ttrpg, r'^\s*ENTRY \^"'))
    check("GUIDANCE entries with TEXT = TEXT lines",
          sum(1 for e in ents.values() for g in e["guidance"] if g["text"] is not None) + sum(1 for c in corr for g in c["guidance"] if g["text"] is not None),
          grep_count(ttrpg, r'^\s*TEXT "'))
    check("printed tables = TABLE blocks", sum(1 for e in ents.values() if e["table"]), grep_count(ttrpg, r'^\s*TABLE \{'))
    check("table rows = ROW lines", sum(len(e["table"]["rows"]) for e in ents.values() if e["table"]), grep_count(ttrpg, r'^\s*ROW \['))
    check("table headers = COLUMNS lines", sum(1 for e in ents.values() if e["table"] and e["table"]["columns"]), grep_count(ttrpg, r'^\s*COLUMNS \['))
    check("tables typed ^\"Table\" (the BASE's one type)", sum(1 for e in ents.values() if e["type"] == "Table"), grep_count(ttrpg, r'^\s*EXTENDS #vtm5Table000000000001 \^"Table"'))
    check("corrections = MODIFY / OVERRIDE lines", len(corr), grep_count(ttrpg, r'^\s*(MODIFY|OVERRIDE) #'))
    check("every correction names a target that is in the data", all(c["target"]["hash"] in ents for c in corr), True)
    check("the replacement Lingering Kiss carries its 4 printed fields", [p["name"] for c in corr if c["target"]["name"] == "Lingering Kiss" for p in c["props"]],
          ["Cost", "System", "Duration", "Restrictions"])

    # ── records by shape, against the independent scanner ──
    scanned = []
    for path in sorted(ttrpg):
        scanned.extend(scan(path))
    check("the scanner sees every entity", len(scanned), len(ents))
    for kind, test in SHAPES:
        want = [h for h, _n, ps, _f in scanned if next((k for k, t in SHAPES if t(ps)), None) == kind]
        got = [r["id"] for r in records if r["kind"] == kind]
        check("%s records = scanned DEFs of that shape (count)" % kind, len(got), len(want))
        check("%s records = scanned DEFs of that shape (same ids)" % kind, sorted(got) == sorted(want), True)
    # ── records by declared type (BASE 0.5.3), against the corpus's own EXTENDS lines ──
    for kind, word in (("loresheet", "Loresheet"), ("loresheet level", "Loresheet Level")):
        check("%s records = DEFs that EXTEND ^\"%s\"" % (kind, word), sum(1 for r in records if r["kind"] == kind),
              grep_count(ttrpg, r'^\s*EXTENDS #\S+ \^"%s"$' % word))
    # powers, Rituals, Ceremonies and Formulae (BASE 0.5.6): each declared, with its Discipline and level
    check("power records = DEFs that EXTEND ^\"Discipline Power\"", sum(1 for r in records if r["kind"] == "power"),
          grep_count([p for p in ttrpg if os.path.basename(p) != "vtm5e-0.5-base.ttrpg"], r'^\s*EXTENDS #\S+ \^"Discipline Power"$'))
    check("ritual records = DEFs that EXTEND ^\"Ritual\", ^\"Ceremony\" or ^\"Formula\"", sum(1 for r in records if r["kind"] == "ritual"),
          grep_count(ttrpg, r'^\s*EXTENDS #\S+ \^"(Ritual|Ceremony|Formula)"$'))
    check("every power and ritual names one of the BASE's Disciplines and a level 1-5",
          [r["name"] for r in records if r["kind"] in ("power", "ritual") and (r.get("discipline") not in index["disciplines"] or not re.match(r"^Level [1-5]$", r.get("level") or ""))], [])
    check("predator records = DEFs that EXTEND ^\"Predator Type\"", sum(1 for r in records if r["kind"] == "predator"),
          grep_count([p for p in ttrpg if os.path.basename(p) != "vtm5e-0.5-base.ttrpg"], r'^\s*EXTENDS #\S+ \^"Predator Type"$'))
    check("advantage records = DEFs that EXTEND ^\"Advantage\", ^\"Merit\", ^\"Flaw\" or ^\"Background\"", sum(1 for r in records if r["kind"] == "advantage"),
          grep_count([p for p in ttrpg if os.path.basename(p) != "vtm5e-0.5-base.ttrpg"], r'^\s*EXTENDS #\S+ \^"(Advantage|Merit|Flaw|Background)"$'))
    check("every advantage record carries its type", all(r.get("type") in ("Advantage", "Merit", "Flaw", "Background") for r in records if r["kind"] == "advantage"), True)
    levels = [r for r in records if r["kind"] == "loresheet level"]
    check("every loresheet level names its loresheet, and is one of its levels",
          all(r["loresheet"] in ents and r["id"] in next((x.get("levels", []) for x in records if x["id"] == r["loresheet"]), []) for r in levels), True)
    check("every loresheet level carries its dots (1-5)", all(isinstance(r.get("rating"), int) and 1 <= r["rating"] <= 5 for r in levels), True)
    by_id = {r["id"]: r for r in records}
    check("every record's name is its entity's", all(ents[r["id"]]["name"] == r["name"] for r in records), True)

    # the core's Discipline chapter, read by the scanner: each power's Discipline and level
    core = scan(paths[FILE_PREFIX + "core-disciplines.ttrpg"])
    level, disc, want = None, None, {}
    names = set(index["disciplines"])
    for h, n, ps, _f in core:
        if LEVEL_HEADING.match(n):
            level = n
        if n in names:
            disc, level = n, None
        if h in by_id and by_id[h]["kind"] in ("power", "ritual"):
            want[h] = (disc, level)
    got = {h: (by_id[h].get("discipline"), by_id[h].get("level")) for h in want}
    check("core Discipline powers and rituals placed as the scanner reads them", got == want, True)
    check("core powers with no Discipline or no level", sorted(by_id[h]["name"] for h, v in got.items() if None in v and by_id[h]["kind"] == "power"), [])
    # the BASE's ^"Discipline" ENUM, read off its line independently of the parser
    base_src = open(paths[FILE_PREFIX + "base.ttrpg"], encoding="utf-8").read()
    m = re.search(r'\^"Discipline" DEF \{(?:\s*#[^\n]*)*\s*ENUM \[([^\]]*)\]', base_src)
    check("Discipline names = the BASE's ^\"Discipline\" ENUM (%d)" % len(index["disciplines"]), sorted(index["disciplines"]),
          sorted(re.findall(r'"([^"]+)"', m.group(1))) if m else None)
    check("every core Discipline heading followed by Characteristics is a declared name",
          sorted({n for i, (h, n, ps, f) in enumerate(core[:-1]) if core[i + 1][1] == "Characteristics" and n != "Characteristics"} - set(index["disciplines"])), [])
    # every clan (a clans chapter's heading that prints a Bane; core, Players Guide) names three
    # in-clan Disciplines as headings under its "Disciplines" — as the creator and Advancement read
    # them (VtmData.clanDisciplines). The Players Guide once held the first as a field (decision 28).
    kids = lambda e: [ents[c] for c in e.get("children", []) if c in ents]
    clans = [e for e in ents.values() if e["book"] in ("core", "players-guide") and re.search(r"clans", e.get("file", "")) and any(k["name"] == "Bane" for k in kids(e))]
    short = sorted({e["name"] for e in clans if len([k for d in kids(e) if d["name"] == "Disciplines" for k in kids(d) if k["name"] in index["disciplines"]]) != 3})
    check("every clan names three in-clan Disciplines as headings (%d clans)" % len({e["name"] for e in clans}), short, [])
    oblivion = sum(1 for r in records if r.get("discipline") == "Oblivion" and r["kind"] == "power")
    check("Oblivion powers found (Chicago by Night, Cults, Players Guide…) > 0", oblivion > 0, True)
    # a Sabbat character (system/vtm5e/sheet.js SABBAT): The Black Hand's ACTOR extends the core's
    # Kindred and adds exactly the Path of Enlightenment
    sab = [e for e in ents.values() if e.get("form") == "ACTOR" and e["name"] == "Sabbat Kindred"]
    check("The Black Hand's ACTOR \"Sabbat Kindred\" extends Kindred, adding the Path of Enlightenment",
          [(e["book"], e["type"], [p["name"] for p in e["props"]]) for e in sab], [("black-hand", "Kindred", ["Path of Enlightenment"])])
    # the other kinds the sheet reads (sheet.js KINDS): the BASE's Mortal and its Ghoul, and
    # Summoned Stories' Cainite, whose Road the sheet reads in Humanity's place
    kinds = {e["name"]: (e["book"], e.get("type"), [p["name"] for p in e["props"]]) for e in ents.values()
             if e.get("form") == "ACTOR" and e["name"] in ("Mortal", "Ghoul", "Cainite")}
    check("the BASE's ACTOR \"Mortal\" carries Attributes, Skills and Humanity, and no clan, Hunger or Blood Potency",
          [kinds.get("Mortal", ("", None, []))[0]] + [f in kinds.get("Mortal", ("", None, []))[2] for f in ("Strength", "Athletics", "Humanity", "Clan", "Hunger", "Blood Potency")],
          ["base", True, True, True, False, False, False])
    check("the BASE's ACTOR \"Ghoul\" extends Mortal, adding its Domitor and Disciplines",
          kinds.get("Ghoul"), ("base", "Mortal", ["Domitor", "Disciplines"]))
    check("Summoned Stories' ACTOR \"Cainite\" extends Kindred, adding the Road and its rating",
          kinds.get("Cainite"), ("summoned-stories", "Kindred", ["Road", "Road Rating"]))
    roads = sorted(e["name"] for e in ents.values() if e["book"] == "summoned-stories" and re.match(r"Road of .+: Rating \d+$", e["name"]))
    check("every Road prints ratings 10-1 (sheet.js roadAt reads '<Road>: Rating N')", len(roads), 40)
    # the price a ghoul pays for a level-1 power (advance.js ghoulPowerCost reads it from this sentence)
    gp = [re.search(r"purchase additional level-1 powers at the cost of (\d+) experience points each", e.get("desc") or "").group(1)
          for e in ents.values() if e["book"] == "companion" and re.search(r"purchase additional level-1 powers at the cost of \d+ experience points each", e.get("desc") or "")]
    check("the Companion prints a ghoul's price for a level-1 power once (advance.js ghoulPowerCost)", gp, ["10"])
    qcc = [e for e in ents.values() if e["book"] == "black-hand" and e["name"] == "Quick Character Creation"]
    # what the creator shows beside the core's step when The Black Hand is used (creator.js BH_ADDS)
    check("The Black Hand's Quick Character Creation prints what the creator adds (Predator Type, Path of Enlightenment)",
          sorted(n for n in (ents[k]["name"] for q in qcc for k in q["children"]) if n in ("Predator Type", "Path of Enlightenment")),
          ["Path of Enlightenment", "Predator Type"])

    # ── the book's die glyphs, carried as the conversion wrote them ──
    tokens = re.compile(r"\[(Regular|Hunger) Die: [A-Za-z ]+\]")
    seen = set()
    for e in ents.values():
        for s in [e["desc"] or ""] + [g["text"] or "" for g in e["guidance"]]:
            seen.update(m.group(0) for m in tokens.finditer(s))
    raw = subprocess.run(["grep", "-ohE", r"\[(Regular|Hunger) Die: [A-Za-z ]+\]"] + sorted(ttrpg), capture_output=True, text=True).stdout.split("\n")
    check("die-glyph tokens in the data = in the corpus", sorted(seen), sorted({x for x in raw if x}))

    # ── the rules the dice roller cites (system/vtm5e/dice.js RULES), by id and printed name ──
    # the dice roller's rules, the conflict rules (V7) and Advancement's (V8)
    dice_js = "".join(open(os.path.join(HERE, "system", "vtm5e", f), encoding="utf-8").read() for f in ("dice.js", "conflict.js", "advance.js"))
    cited = re.findall(r"\{ id: '(#[A-Za-z0-9]+)', name: '([^']+)' \}", dice_js)
    check("rules the dice cite (%d) are in the core under those names" % len(cited),
          [(h, n) for h, n in cited if not (h in ents and ents[h]["name"] == n and ents[h]["book"] == "core")], [])

    # ── the rules the maps cite (system/vtm5e/maps.js RULES: the core's and Blood Sigils'), by id, name and book ──
    maps_js = open(os.path.join(HERE, "system", "vtm5e", "maps.js"), encoding="utf-8").read()
    mcited = re.findall(r"\{ id: '(#[A-Za-z0-9]+)', name: '([^']+)', book: '([a-z-]+)' \}", maps_js)
    check("rules the maps cite (%d) are in their books under those names" % len(mcited),
          [(h, n, b) for h, n, b in mcited if not (h in ents and ents[h]["name"] == n and ents[h]["book"] == b)], [])

    print("check_shape: %s (%d assertions)" % ("OK" if not FAILS else "FAILED: " + ", ".join(FAILS), COUNT[0]))
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(main())
