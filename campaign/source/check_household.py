#!/usr/bin/env python3
"""
check_household.py — every character file in campaign/characters/ against the table's record.

    python3 campaign/source/check_household.py          # exit 1 on any mismatch
    python3 campaign/source/check_household.py --plant  # prove it: plant faults, expect each named

Shares no code with convert_household.py. The household page is read here as a tree (the standard
library's HTML parser), not by patterns over its source; each character's panel or card is found by
its heading, and every value the page prints is compared with the file, both ways:

  * each Attribute and Skill the page prints is in the file at that value (Archery and Riding as
    Firearms and Drive, the campaign's relabelled traits), and no Skill the page does not print
    has a dot in the file;
  * each specialty, each Discipline with its dots and powers, each Merit and Flaw with its dots,
    the page prints is in the file, and nothing else is;
  * Health, Willpower, Hunger, Blood Potency, Generation, the Road and its rating, the sire, the
    dates, the domitor.

And against the books (the VTT's built data/): every power a file names resolves to a power or
ritual of that Discipline (a trailing "(note)" aside), every Advantage and Flaw name before its
bracket is one a book prints, the Road is a Road the Road System heads, and each file's template
is the ACTOR its kind needs.
"""
import json
import os
import re
import sys
from html.parser import HTMLParser

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
PAGE = os.path.join(ROOT, "campaign", "household", "index.html")
CHARS = os.path.join(ROOT, "campaign", "characters")

RENAMED = {"Archery": "Firearms", "Riding": "Drive"}     # the campaign's house rule (campaign/dsl)
LANGUAGE = "Linguistics"                                # the book's name for a "Language: X" line


class Node:
    def __init__(self, tag, attrs, parent):
        self.tag, self.attrs, self.parent, self.kids, self.chunks = tag, dict(attrs), parent, [], []

    @property
    def cls(self):
        return (self.attrs.get("class") or "").split()

    def text(self):
        out = []
        def walk(n):
            for c in n.chunks:
                if isinstance(c, str):
                    out.append(c)
                else:
                    walk(c)
        walk(self)
        return re.sub(r"\s+", " ", "".join(out)).strip()

    def find(self, cls=None, tag=None):
        res = []
        def walk(n):
            for c in n.kids:
                if (cls is None or cls in c.cls) and (tag is None or c.tag == tag):
                    res.append(c)
                walk(c)
        walk(self)
        return res


class Tree(HTMLParser):
    VOID = {"img", "br", "hr", "meta", "link", "input", "source", "wbr"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("root", {}, None)
        self.cur = self.root

    def handle_starttag(self, tag, attrs):
        n = Node(tag, attrs, self.cur)
        self.cur.kids.append(n)
        self.cur.chunks.append(n)
        if tag == "br":
            self.cur.chunks.append(" ")
        if tag not in self.VOID:
            self.cur = n

    def handle_endtag(self, tag):
        n = self.cur
        while n is not None and n.tag != tag:
            n = n.parent
        if n is not None and n.parent is not None:
            self.cur = n.parent

    def handle_data(self, data):
        self.cur.chunks.append(data)


def load_page():
    t = Tree()
    t.feed(open(PAGE, encoding="utf-8").read())
    return t.root


def by_id(root, i):
    hit = []
    def walk(n):
        if n.attrs.get("id") == i:
            hit.append(n)
        for c in n.kids:
            walk(c)
    walk(root)
    return hit[0]


def data_blob(book):
    s = open(os.path.join(ROOT, "data", book + ".js"), encoding="utf-8").read()
    return json.loads(s[s.index("var d=") + 6:s.index(";var T=window.VTM5E")])


def records():
    s = open(os.path.join(ROOT, "data", "records.js"), encoding="utf-8").read()
    m = re.search(r"(\[\{.*\}\])", s, re.S)
    return json.loads(m.group(1))


def expected_merits(card):
    """[(name before any bracket or colon, dots, flaw)] as the page prints them."""
    out, flaw = [], False
    for n in card.find(tag="div"):
        if "mf-group-label" in n.cls:
            flaw = "flaw" in n.cls
        elif "mf-item" in n.cls:
            pts = n.find(cls="mf-pts")[0].text()
            name = n.text()[len(pts):].strip()
            out.append((name, int(pts), flaw))
    return out


def base_name(n):
    return re.sub(r":.*$", "", re.sub(r"\s*\(.*\)$", "", n)).strip()


class Check:
    def __init__(self):
        self.n, self.bad = 0, []

    def eq(self, who, what, got, want):
        self.n += 1
        if got != want:
            self.bad.append("%s — %s: file %r, page %r" % (who, what, got, want))


def merit_matches(page_name, line):
    """The page's line and the file's line are one Advantage: the book's name (Language → Linguistics;
    a Mawla the page files as a Flaw is The Gehenna War's Secret Master), and the page's own
    words kept in the bracket unless they only restate the rule."""
    fname = line.get("Name", "")
    if page_name.startswith("Language:"):
        return fname == "%s (%s)" % (LANGUAGE, page_name.split(":", 1)[1].strip())
    if page_name == "Mawla (Secret Master)":
        return fname == "Secret Master"
    b = base_name(page_name).lower()
    return fname.lower() == b or fname.lower().startswith(b + " (")


def check_values(c, who, v, attrs, skills, specs):
    for k, n in attrs.items():
        c.eq(who, k, v.get(k), n)
    for k, n in skills.items():
        c.eq(who, k, v.get(RENAMED.get(k, k)), n)
    printed = {RENAMED.get(k, k) for k in skills}
    for k in ["Athletics", "Brawl", "Craft", "Drive", "Firearms", "Melee", "Larceny", "Stealth", "Survival",
              "Animal Ken", "Etiquette", "Insight", "Intimidation", "Leadership", "Performance", "Persuasion",
              "Streetwise", "Subterfuge", "Academics", "Awareness", "Finance", "Investigation", "Medicine",
              "Occult", "Politics", "Science", "Technology"]:
        if k not in printed:
            c.eq(who, k + " (unprinted)", v.get(k), 0)
    c.eq(who, "Specialties", sorted((s["Skill"], s["Specialty"]) for s in v.get("Specialties", [])), sorted(specs))


def check_merits(c, who, v, card):
    want = expected_merits(card)
    got = v.get("Advantages & Flaws", [])
    c.eq(who, "number of Advantages and Flaws", len(got), len(want))
    for i, (name, dots, flaw) in enumerate(want):
        line = got[i] if i < len(got) else {}
        c.eq(who, "Advantage %d (%s) name" % (i + 1, name), merit_matches(name, line), True)
        c.eq(who, "Advantage %d (%s) dots" % (i + 1, name), line.get("Dots"), dots)
        c.eq(who, "Advantage %d (%s) flaw" % (i + 1, name), line.get("Flaw"), flaw)


def check_books(c, who, v, recs, road_names):
    powers = {(r["discipline"], r["name"]) for r in recs if r["kind"] in ("power", "ritual")}
    adv = {r["name"] for r in recs if r["kind"] in ("advantage", "loresheet level")}
    for d in v.get("Disciplines", []):
        for p in d.get("Powers", []):
            bare = re.sub(r"\s*\([^()]*\)$", "", p)
            c.eq(who, "power %s resolves in %s" % (p, d["Discipline"]), (d["Discipline"], bare) in powers, True)
    for a in v.get("Advantages & Flaws", []):
        c.eq(who, "Advantage %s is a book's" % a["Name"], base_name(a["Name"]) in adv, True)
        if a.get("Advantage"):
            r = [x for x in recs if x["id"] == a["Advantage"]]
            c.eq(who, "Advantage %s's id is that loresheet level" % a["Name"], bool(r) and r[0]["name"] == a["Name"], True)
    if "Road" in v:
        c.eq(who, "Road is one the Road System heads", v["Road"] in road_names, True)


def run(files, plant=False):
    root = load_page()
    recs = records()
    ss = data_blob("summoned-stories")["entities"]
    road_names = {e["name"] for e in ss.values() if re.match(r"^Road of [^:]+ \(\w+\)$", e["name"] or "")}
    c = Check()

    # ── Tomisława ──
    tomi = by_id(root, "tab-tomi")
    v = files["tomislawa"]["values"]
    who = "Tomisława"
    c.eq(who, "template (Cainite)", files["tomislawa"]["templateId"], "#vssCainite0000000001")
    attrs = {a.find(cls="attr-name")[0].text(): int(a.find(cls="attr-val")[0].text()) for a in tomi.find(cls="attr-card")}
    skills, specs = {}, []
    for row in tomi.find(cls="skill-row"):
        nm = row.find(cls="skill-name")[0]
        em = nm.find(tag="em")
        name = nm.text()[: len(nm.text()) - len(em[0].text())].strip() if em else nm.text()
        skills[name] = int(row.find(cls="skill-val")[0].text())
        if em:
            specs.append((RENAMED.get(name, name), em[0].text().strip("()")))
    check_values(c, who, v, attrs, skills, specs)
    der = {d.find(cls="derived-label")[0].text(): d.find(cls="derived-val")[0].text() for d in tomi.find(cls="derived-cell")}
    for k in ("Health", "Willpower", "Hunger", "Blood Potency"):
        c.eq(who, k, v.get(k), int(der[k]))
    c.eq(who, "Road Rating", v.get("Road Rating"), int(der["Road"]))
    c.eq(who, "Generation", v.get("Generation"), int(re.match(r"\d+", der["Generation"]).group(0)))
    idents = {}
    dts = tomi.find(tag="dt")
    for dt in dts:
        dd = dt.parent.kids[dt.parent.kids.index(dt) + 1]
        idents[dt.text()] = dd.text()
    c.eq(who, "Sire", v.get("Sire"), idents["Sire"])
    c.eq(who, "Apparent age", v.get("Apparent age"), re.search(r"Apparent Age (\d+)", idents["Embraced"]).group(1))
    c.eq(who, "True age", v.get("True age"), re.search(r"True Age (\d+)", idents["Embraced"]).group(1))
    cap = tomi.find(cls="portrait-caption")[0].text()
    c.eq(who, "Date of birth", v.get("Date of birth"), re.search(r"b\. (\d{4})", cap).group(1))
    c.eq(who, "Date of death", v.get("Date of death"), re.search(r"Embraced (\d{4})", cap).group(1))
    c.eq(who, "Road is the Road of Kings", (v.get("Road") or "").startswith(tomi.find(cls="char-subtitle")[0].text().split("·")[0].strip()), True)
    for blk in tomi.find(cls="disc-block"):
        dname = re.sub(r"\s*\(.*\)$", "", blk.find(cls="disc-name")[0].text())
        dots = blk.find(cls="disc-rating")[0].text().count("●")
        row = [d for d in v.get("Disciplines", []) if d["Discipline"] == dname]
        c.eq(who, dname + " dots", row[0]["Dots"] if row else None, dots)
        titles = [re.sub(r"\s*·.*$", "", t.text()) for t in blk.find(cls="power-title")]
        want = [re.sub(r"^Koldunic Sorcery — (\w+)$", r"Koldunic Sorcery (\1)", t).replace("'", "’").replace(" (Fleshcrafting)", "") for t in titles]
        got = [p for p in (row[0]["Powers"] if row else [])][: len(want)]
        c.eq(who, dname + " powers", got, want)
    rituals = [re.sub(r"\s*·.*$", "", n.find(cls="power-title")[0].text()) for n in tomi.find(cls="power-item") if "ritual" in n.cls]
    bs = [d for d in v.get("Disciplines", []) if d["Discipline"] == "Blood Sorcery"]
    c.eq(who, "rituals", bs[0]["Powers"][-len(rituals):] if bs else None, rituals)
    c.eq(who, "Disciplines count", len(v.get("Disciplines", [])), len(tomi.find(cls="disc-block")))
    check_merits(c, who, v, tomi)
    check_books(c, who, v, recs, road_names)
    # her Clan Bane: the Players Guide's Tzimisce Bane and, Twice-cursed, its Cursed Courtesy, as printed
    pg = data_blob("players-guide")["entities"]
    tz = [e for e in pg.values() if e.get("name") == "Tzimisce" and "players-guide-clans" in (e.get("file") or "")]
    bane = [pg[k]["desc"] for t in tz for k in t.get("children", []) if pg.get(k, {}).get("name") == "Bane"]
    cc = [e["desc"] for e in pg.values() if e.get("name") == "Tzimisce: Cursed Courtesy"]
    c.eq(who, "Clan Bane (the book's two banes)", v.get("Clan Bane"), "\n\n".join(bane[:1] + cc[:1]))
    # her Predator type: the page has none; her PDF sheet's "Łowy (Montero)" names the book's type
    pdf = os.path.join(os.path.dirname(ROOT), "war-of-princes-support", "archive", "reference", "pcs", "Tomisława z Białowieży.pdf")
    if os.path.exists(pdf):
        import subprocess
        dump = subprocess.run(["pdftk", pdf, "dump_data_fields_utf8"], capture_output=True, text=True).stdout
        pt = re.search(r"FieldName: Predator type\n(?:.*\n)*?FieldValue: (.*)", dump).group(1)
        c.eq(who, "Predator (the PDF sheet's)", v.get("Predator"), re.search(r"\((.+)\)", pt).group(1))
        c.eq(who, "Predator is a book's Predator type", any(r["kind"] == "predator" and r["name"] == v.get("Predator") for r in recs), True)

    # ── the Graf ──
    graf = by_id(root, "tab-graf")
    v = files["graf"]["values"]
    who = "the Graf"
    c.eq(who, "template (Ghoul)", files["graf"]["templateId"], "#vtm5Ghoul00000000001")
    c.eq(who, "Name", v.get("Name"), graf.find(cls="char-name")[0].text())
    c.eq(who, "Domitor", v.get("Domitor"), "Tomisława z Białowieży")
    attrs = {a.find(cls="attr-name")[0].text(): int(a.find(cls="attr-val")[0].text()) for a in graf.find(cls="attr-card")}
    skills = {r.find(cls="skill-name")[0].text(): int(r.find(cls="skill-val")[0].text()) for r in graf.find(cls="skill-row")}
    check_values(c, who, v, attrs, skills, [])
    der = {d.find(cls="derived-label")[0].text(): d.find(cls="derived-val")[0].text() for d in graf.find(cls="derived-cell")}
    for k in ("Health", "Willpower"):
        c.eq(who, k, v.get(k), int(der[k]))
    pw = graf.find(cls="power-title")[0].text()          # Cloud Memory · Dominate 1
    name, disc, n = re.match(r"^(.*?) · (\w+) (\d)$", pw).groups()
    c.eq(who, "Disciplines", v.get("Disciplines"), [{"Discipline": disc, "Dots": int(n), "Powers": [name]}])
    check_merits(c, who, v, graf)
    check_books(c, who, v, recs, road_names)

    # ── the four and the herd ──
    abbr = {"STR": "Strength", "DEX": "Dexterity", "STA": "Stamina", "CHA": "Charisma", "MAN": "Manipulation",
            "COM": "Composure", "INT": "Intelligence", "WIT": "Wits", "RES": "Resolve"}
    seen = {"tomislawa", "graf"}
    for pid in ("tab-allies", "tab-herd"):
        for card in by_id(root, pid).find(cls="ally-card"):
            h = card.find(cls="ally-name")[0]
            name = h.text()[: len(h.text()) - len(h.find(cls="handle")[0].text())].strip()
            key = [k for k, f in files.items() if f["values"]["Name"] == name]
            c.eq(name, "has a file", len(key), 1)
            if not key:
                continue
            seen.add(key[0])
            f = files[key[0]]
            v = f["values"]
            c.eq(name, "template (Mortal)", f["templateId"], "#vtm5Mortal0000000001")
            c.eq(name, "Concept", v.get("Concept"), card.find(cls="ally-subtitle")[0].text())
            rows = card.find(cls="ally-stats-row")
            stat = lambda s: (s.text().rsplit(" ", 1)[0], int(s.find(tag="strong")[0].text()))
            attrs = {abbr[k]: n for k, n in map(stat, rows[0].find(cls="ally-stat"))}
            skills = dict(map(stat, rows[1].find(cls="ally-stat")))
            check_values(c, name, v, attrs, skills, [])
            check_merits(c, name, v, card)
            check_books(c, name, v, recs, road_names)
    c.eq("the household", "files with no one on the page", sorted(set(files) - seen), [])
    return c


def load_files():
    out = {}
    for f in sorted(os.listdir(CHARS)):
        if f.endswith(".vtm5e-character.json"):
            out[f[: -len(".vtm5e-character.json")]] = json.load(open(os.path.join(CHARS, f), encoding="utf-8"))
    return out


def main():
    if "--plant" in sys.argv:
        faults = [
            ("Tomisława's Occult 4 → 3", lambda F: F["tomislawa"]["values"].__setitem__("Occult", 3)),
            ("Tomisława's Road rating 7 → 6", lambda F: F["tomislawa"]["values"].__setitem__("Road Rating", 6)),
            ("a Koldunic bond dropped", lambda F: F["tomislawa"]["values"]["Disciplines"][2]["Powers"].pop(1)),
            ("Twice-Cursed dropped", lambda F: F["tomislawa"]["values"]["Advantages & Flaws"].pop(9)),
            ("the Graf's Archery written as nothing", lambda F: F["graf"]["values"].__setitem__("Firearms", 0)),
            ("Kuncze given an unprinted Skill", lambda F: F["kuncze"]["values"].__setitem__("Stealth", 2)),
            ("an invented Merit on Elżbieta", lambda F: F["elzbieta"]["values"]["Advantages & Flaws"].append({"Name": "Iron Will", "Dots": 1, "Flaw": False})),
            ("a power no book prints", lambda F: F["graf"]["values"]["Disciplines"][0]["Powers"].__setitem__(0, "Cloud Memories")),
            ("her Clan Bane cut short", lambda F: F["tomislawa"]["values"].__setitem__("Clan Bane", F["tomislawa"]["values"]["Clan Bane"][:200])),
            ("a Flaw written in the page's spelling", lambda F: F["kuncze"]["values"]["Advantages & Flaws"][3].__setitem__("Name", "Weak-Willed")),
        ]
        caught = 0
        for label, plant in faults:
            F = load_files()
            plant(F)
            c = run(F)
            hit = bool(c.bad)
            caught += hit
            print("  planted: %-42s → %s" % (label, ("FAIL (caught): " + c.bad[0]) if hit else "PASSED (not caught)"))
        print("check_household --plant: %d of %d faults caught" % (caught, len(faults)))
        return 0 if caught == len(faults) else 1
    c = run(load_files())
    for b in c.bad:
        print("  MISMATCH " + b)
    print("check_household: %d checks, %s" % (c.n, "all match" if not c.bad else "%d mismatch(es)" % len(c.bad)))
    return 1 if c.bad else 0


if __name__ == "__main__":
    sys.exit(main())
