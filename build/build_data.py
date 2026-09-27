#!/usr/bin/env python3
"""
build_data.py — the Vampire: The Masquerade 5e corpora → data/*.js.

Everything the site shows comes from here; nothing is hand-typed. The shape is GENERIC and
hash-keyed — the engine reads it without knowing the game, and system/vtm5e/ interprets it:

    window.VTM5E.index           { system, corpus, counts, books: [ … ] }       data/index.js
    window.VTM5E.records         [ {id, name, book, kind, …} ]                  data/records.js
    window.VTM5E.books[<id>]     { id, label, chapters: [ … ], entities: [root ids] }
    window.VTM5E.entities[<h>]   { id, name, key, book, file, type, parent, slot, children,
                                   desc, props, entries, table, choices, guidance, refs }

What this corpus needs that Troika's did not:

  * **Twenty-one books, 12 MB, on two SHELVES.** One data file per book (`data/<book>.js`),
    loaded on demand by engine/data.js; a page costs only data/index.js and data/records.js
    until it opens a book. A corpus file belongs to a book by its file-name PREFIX
    (`vtm5e-0.5-<book>-<chapter>`); BOOKS below is the prefix map, the only hand-written list
    in the build, and every corpus file must be claimed by exactly one book, by a book on its
    own shelf, or this exits non-zero. The second shelf is titterpig-dsl-vtm5e-3rdparty —
    Storytellers Vault titles and Sortilege's homebrew, kept apart so the site can say which
    text is the publisher's. See SHELVES for what it loads, what it excludes and why.

  * **Chapters in printed order.** Each chapter file opens with `# source: … (pages N-M)`;
    a book's chapters are sorted by that first page (a `.lore` file by its first "printed N").
    The comment is read as it stands — nothing is inferred when it is absent (the BASE).

  * **`.lore` is Markdown, not DSL** (the core's prologue and its handouts, transcribed from
    page images). A lore chapter carries its text verbatim as one string; verify_data.py gates
    it line by line.

  * **Records by shape.** The BASE declares one type (`^"Table"`); a Discipline power, a
    ritual and a Storyteller character are known by the fields the book prints on them. The
    SHAPES below name those fields — by KEY, never by value — and data/records.js lists every
    entity that has one, with its place: the nearest `Level N` heading before it in its file
    and the nearest Discipline heading before it. The Discipline names are the BASE's
    ^"Discipline" ENUM (disciplines_of), not typed here. check_shape.py asserts
    every count against grep over the corpus.

Every string is carried byte-for-byte from the DSL (only DSL escapes resolved); this file
decides shape alone. verify_data.py then proves the round trip in both directions.

    python3 build/build_data.py [<titterpig-dsl-vtm5e/0.5>] [<titterpig-dsl-vtm5e-3rdparty>]
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from parse_dsl import parse_files  # noqa: E402

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_CORPUS = os.path.expanduser("~/Sortilege/Titterpig/DSL/titterpig-dsl-vtm5e/0.5")
DEFAULT_THIRD_PARTY = os.path.expanduser("~/Sortilege/Titterpig/DSL/titterpig-dsl-vtm5e-3rdparty")
FILE_PREFIX = "vtm5e-0.5-"

# ───────────────────────── the shelves ─────────────────────────
#
# Two corpora, one system id. The official corpus is one flat directory of books. The
# third-party repository is one directory per PRODUCT (`<product>/<content version>/`), and
# it holds material this table does not play — so a shelf that names product directories
# must ALSO name, with a reason, every product directory it leaves out. `dirs` and
# `excluded` together have to equal what is on disk, or this build raises: "not loaded"
# may not quietly mean "not noticed".
SHELVES = [
    {"id": "official", "label": "The books", "root": DEFAULT_CORPUS, "note": None},
    {"id": "third-party", "label": "Third-party and homebrew", "root": DEFAULT_THIRD_PARTY,
     "note": "Storytellers Vault titles and this table's own homebrew, shelved apart: none of "
             "it is Renegade Game Studios' text, and a reader should not have to guess which.",
     # Summoned Stories (owner, 2026-09-27): a Storyteller's chronicle documentation - a Road
     # system replacing Humanity and a creation brief - shelved for the table that plays it (War
     # of Princes), opt-in as The Black Hand is: its ACTOR "Cainite" is a character kind the
     # sheet reads, and nothing about it applies to a character that is not one.
     "dirs": ["the-black-hand/0.5", "sortilege/0.5", "summoned-stories/0.5"],
     "excluded": {}},
]

# ───────────────────────── the prefix → book map ─────────────────────────
#
# `label` is this build's own short name for the book (declared as ours to the gate); each
# chapter's own title is its file's NAME, verbatim. Order: the core, the Players Guide, then
# the supplements in the order the corpus's sources.json first lists them.
BOOKS = [
    {"id": "base", "label": "Types and vocabulary", "kind": "base", "prefix": "base"},
    {"id": "core", "label": "Core Rulebook", "kind": "book", "prefix": "core"},
    {"id": "players-guide", "label": "Players Guide", "kind": "book", "prefix": "players-guide"},
    {"id": "anarch", "label": "Anarch", "kind": "book", "prefix": "anarch"},
    {"id": "camarilla", "label": "Camarilla", "kind": "book", "prefix": "camarilla"},
    {"id": "chicago-by-night", "label": "Chicago by Night", "kind": "book", "prefix": "chicago-by-night"},
    {"id": "second-inquisition", "label": "Second Inquisition", "kind": "book", "prefix": "second-inquisition"},
    {"id": "cults-of-the-blood-gods", "label": "Cults of the Blood Gods", "kind": "book", "prefix": "cults-of-the-blood-gods"},
    {"id": "let-the-streets-run-red", "label": "Let the Streets Run Red", "kind": "book", "prefix": "let-the-streets-run-red"},
    {"id": "tattered-facade", "label": "The Tattered Facade", "kind": "book", "prefix": "tattered-facade"},
    {"id": "blood-stained-love", "label": "Blood-Stained Love", "kind": "book", "prefix": "blood-stained-love"},
    {"id": "sabbat", "label": "Sabbat", "kind": "book", "prefix": "sabbat"},
    {"id": "gehenna-war", "label": "The Gehenna War", "kind": "book", "prefix": "gehenna-war"},
    {"id": "in-memoriam", "label": "In Memoriam", "kind": "book", "prefix": "in-memoriam"},
    {"id": "blood-sigils", "label": "Blood Sigils", "kind": "book", "prefix": "blood-sigils"},
    {"id": "children-of-the-blood", "label": "Children of the Blood", "kind": "book", "prefix": "children-of-the-blood"},
    {"id": "bleed", "label": "Bleed and How to Deal With It", "kind": "book", "prefix": "bleed"},
    {"id": "wod-storyteller", "label": "Storyteller System: Expanded Mechanics", "kind": "book", "prefix": "wod-storyteller"},
    # ── Sets 5-8 of the bundle (corpus 23cb8e9, 2026-09-25) ──
    {"id": "chicago-folios", "label": "The Chicago Folios", "kind": "book", "prefix": "chicago-folios"},
    {"id": "forbidden-religions", "label": "Forbidden Religions", "kind": "book", "prefix": "forbidden-religions"},
    {"id": "trails-of-ash-and-bone", "label": "Trails of Ash and Bone", "kind": "book", "prefix": "trails-of-ash-and-bone"},
    {"id": "crimson-gutter", "label": "The Crimson Gutter", "kind": "book", "prefix": "crimson-gutter"},
    {"id": "swansong", "label": "Swansong: Boston by Night", "kind": "book", "prefix": "swansong"},
    {"id": "taste-of-the-moon", "label": "A Taste of the Moon", "kind": "book", "prefix": "taste-of-the-moon"},
    {"id": "auld-sanguine", "label": "Auld Sanguine", "kind": "book", "prefix": "auld-sanguine"},
    {"id": "love-bites", "label": "Love Bites", "kind": "book", "prefix": "love-bites"},
    {"id": "midnight-kiss", "label": "Midnight Kiss", "kind": "book", "prefix": "midnight-kiss"},
    {"id": "reins-of-power", "label": "Reins of Power", "kind": "book", "prefix": "reins-of-power"},
    {"id": "under-a-changing-moon", "label": "Under a Changing Moon", "kind": "book", "prefix": "under-a-changing-moon"},
    {"id": "primogens-gambit", "label": "The Primogen’s Gambit", "kind": "book", "prefix": "primogens-gambit"},
    {"id": "under-the-skin", "label": "Under the Skin", "kind": "book", "prefix": "under-the-skin"},
    {"id": "wine-dark-waters", "label": "Wine-Dark Waters", "kind": "book", "prefix": "wine-dark-waters"},
    {"id": "companion", "label": "The Masquerade Companion", "kind": "book", "prefix": "companion"},
    {"id": "book-of-nod-apocrypha", "label": "The Book of Nod: Apocrypha", "kind": "book", "prefix": "book-of-nod-apocrypha"},
    {"id": "luciana", "label": "Month of Darkness: Luciana", "kind": "book", "prefix": "luciana"},
    {"id": "new-blood-story-guide", "label": "New Blood: Story Guide", "kind": "book", "prefix": "new-blood-story-guide"},
    {"id": "new-blood-reference-guide", "label": "New Blood: Reference Guide", "kind": "book", "prefix": "new-blood-reference-guide"},
    {"id": "new-blood-components", "label": "New Blood: Components", "kind": "book", "prefix": "new-blood-components"},
    {"id": "book-of-nod", "label": "The Book of Nod", "kind": "book", "prefix": "book-of-nod"},
    {"id": "fall-of-london", "label": "The Fall of London", "kind": "book", "prefix": "fall-of-london"},
    {"id": "found-notes", "label": "Found Notes", "kind": "book", "prefix": "found-notes"},
    # ── Set 9 (corpus 94f79bf, 2026-09-25) ──
    {"id": "succubus-club", "label": "Live from the Succubus Club", "kind": "book", "prefix": "succubus-club"},
    {"id": "winters-teeth", "label": "Winter’s Teeth Vol. 1", "kind": "book", "prefix": "winters-teeth"},
    {"id": "errata", "label": "Errata and Rules Update", "kind": "errata", "prefix": "errata"},
    # ── the third-party shelf ──
    {"id": "black-hand", "label": "The Black Hand: Playing the Sabbat", "kind": "book",
     "shelf": "third-party", "prefix": "black-hand"},
    {"id": "sunburners", "label": "Path of the Sun: the Sunburners", "kind": "homebrew",
     "shelf": "third-party", "prefix": "sortilege-sunburners"},
    {"id": "summoned-stories", "label": "Summoned Stories: the Road System", "kind": "homebrew",
     "shelf": "third-party", "prefix": "summoned-stories"},
]
for _b in BOOKS:
    _b.setdefault("shelf", SHELVES[0]["id"])
KINDS = {b["kind"] for b in BOOKS} | {"ttrpg", "lore"}
# Kinds whose chapters have no printed page, legitimately: the BASE is the corpus's own
# vocabulary, and homebrew was never in print. Everywhere else a missing `# source: …
# (pages N-M)` is a conversion defect, and check_shape.py fails on it.
UNPAGED_KINDS = {"base", "homebrew"}
DSL_EXTS = (".ttrpg",)
LORE_EXTS = (".lore",)
# Extensions this build SEES and does not load, each with its reason. Naming them is what
# keeps a file from going missing in silence; the build prints them on every run.
DEFERRED_EXTS = {
    ".arc": "a scenario's FLOW / PHASE / SCENE / CAST — constructs the reader does not carry "
            "yet; shelving one as a book would drop the structure that makes it a scenario",
}

# ───────────────────────── records by shape ─────────────────────────
# Field names the book prints on a record — keys only. A record is the FIRST shape it fits.
SHAPES = [
    # (powers and rituals are declared, BASE 0.5.6 -- TYPED_KINDS; no longer found by their fields)
    ("character", lambda ps: "Standard Dice Pools" in ps or "Secondary Attributes" in ps
     or ("Attributes" in ps and "Skills" in ps)),
]
SHAPE_NAMES = [s[0] for s in SHAPES]
# Records by DECLARED type (BASE 0.5.3): a DEF that EXTENDS ^"Loresheet" is a loresheet, one that
# EXTENDS ^"Loresheet Level" (an Advantage) is one of its levels. The ids are read from BASE.
TYPED_KINDS = {"Loresheet": "loresheet", "Loresheet Level": "loresheet level",
               # BASE 0.5.4: a DEF that EXTENDS ^"Advantage" or one of the types that extend it (Merit,
               # Flaw, Background) is an Advantage the creator offers, from every book
               "Advantage": "advantage", "Merit": "advantage", "Flaw": "advantage", "Background": "advantage",
               # BASE 0.5.6: every power a book prints declares its Discipline and its level; a Ritual, a
               # Ceremony and a Formula are the ritual records (their Ingredients and Process)
               "Discipline Power": "power", "Ritual": "ritual", "Ceremony": "ritual", "Formula": "ritual",
               # BASE 0.5.7: every Predator type a book prints, with its grants (Items); the creator offers
               # the ones of the books a character draws on, loading a book only when it is on
               "Predator Type": "predator"}
# "Level 3", or a label that names what the level holds ("Level 4 Powers", "Level 3
# Ceremonies", "Level 5 Formula" -- Tattered Facade, and the rituals appendices)
LEVEL_HEADING = re.compile(r"^Level \d+( (Powers?|Rituals?|Ceremony|Ceremonies|Formulae?))?$")
DISCIPLINE_TYPE = "Discipline"             # the BASE's vocabulary type: ENUM of the names
CORE_DISCIPLINES = FILE_PREFIX + "core-disciplines.ttrpg"
# scalar fields a record list shows without loading its book
RECORD_FIELDS = {
    "power": ["Cost", "Dice Pools", "Amalgam", "Prerequisite"],
    "ritual": ["Ingredients"],
    "character": ["Clan", "Generation", "Blood Potency", "Humanity", "Standard Dice Pools"],
}

PAGE_RE = re.compile(r"#\s*source:[^\n]*?\(pages?\s+(\d+)")
# a lore file names its page as "printed N" (the core's prologue and handouts) or, under each
# prop, "*<book>, page N.*" (Found Notes)
LORE_PAGE_RE = re.compile(r"printed\s+(\d+)|,\s*page\s+(\d+)\.")


# ───────────────────────── AST accessors ─────────────────────────

def kws(body, name):
    return [x for x in (body or []) if x.get("n") == "kw" and x["kw"] == name]


def kw1(body, name):
    got = kws(body, name)
    return got[0] if got else None


def kwstr(body, name):
    n = kw1(body, name)
    if not n:
        return None
    return next((a["v"] for a in n["args"] if a["k"] == "str"), None)


def kwlist(body, name):
    n = kw1(body, name)
    return (arg(n, "list") or []) if n else []


def arg(node, kind):
    return next((a["v"] for a in (node or {}).get("args", []) if a["k"] == kind), None)


def elem_ref(e):
    if e.get("k") == "ref":
        return {"hash": e["hash"], "name": e["v"]}
    if e.get("k") == "hash":
        return {"hash": e["v"], "name": None}
    if e.get("k") == "caret":
        return {"hash": None, "name": e["v"]}
    return None


def prop_nodes(body):
    """A DEF's properties: the PROPERTIES block's rows, plus any row written directly in
    the body (this corpus writes nearly all of them there)."""
    out = [p for p in (body or []) if p.get("n") == "prop" and p.get("type") != "CHOICE"]
    for b in kws(body, "PROPERTIES"):
        out.extend(p for p in (b.get("body") or []) if p.get("n") == "prop")
    return out


def elem_value(e):
    if e.get("k") == "def":
        return {"vk": "def", "fields": [prop_value(p) for p in prop_nodes(e.get("body"))]}
    if e.get("k") in ("ref", "hash", "caret"):
        return dict(vk="ref", **elem_ref(e))
    return {"vk": "scalar", "value": e["v"]}


def prop_value(p):
    v = {"name": p["name"]}
    t = p.get("type")
    if t == "DEF":
        v["vk"] = "def"
        ext = kw1(p.get("body"), "EXTENDS")
        if ext:
            v["type"] = arg(ext, "caret")
            v["typeHash"] = arg(ext, "hash")
        v["fields"] = [prop_value(x) for x in prop_nodes(p.get("body"))]
        return v
    if t == "LIST":
        v["vk"] = "list"
        if p.get("of"):
            v["of"] = p["of"]
        if p.get("of_hash"):
            v["ofHash"] = p["of_hash"]
        v["items"] = [elem_value(e) for e in p.get("items", [])]
        return v
    if t == "ENUM":
        v["vk"] = "enum"
        if "options" in p:
            v["options"] = p["options"]
        if "value" in p:
            v["value"] = p["value"]
        return v
    if t == "REF":
        v["vk"] = "ref"
        v["ref"] = {"hash": p.get("hash"), "name": p.get("ref")}
        return v
    v["vk"] = "scalar"
    if t and t != "VALUE":
        v["type"] = t
    if "value" in p:
        v["value"] = p["value"]
    for m in ("min", "max", "required", "fixed", "default"):
        if m in p:
            v[m] = p[m]
    return v


# ───────────────────────── entity blocks ─────────────────────────

def refs_of(body):
    """§5c REFERENCES: `"label" -> #hash ^"Name"` lines, stand-off."""
    out = []
    for rb in kws(body, "REFERENCES"):
        for item in (rb.get("body") or []):
            if item.get("n") != "str":
                continue
            for a in item.get("args", []):
                if a["k"] == "ref":
                    out.append({"label": item["v"], "hash": a["hash"], "name": a["v"]})
    return out


def guidance_of(body):
    """§22 GUIDANCE: a sidebar, beside what it CONCERNS."""
    out = []
    for gb in kws(body, "GUIDANCE"):
        for e in kws(gb.get("body"), "ENTRY"):
            out.append({
                "name": arg(e, "caret"), "id": arg(e, "hash"),
                "concerns": [r for r in (elem_ref(x) for x in kwlist(e.get("body"), "CONCERNS")) if r],
                "topics": [x["v"] for x in kwlist(e.get("body"), "TOPICS") if x.get("k") == "str"],
                "text": kwstr(e.get("body"), "TEXT"),
            })
    return out


def choices_of(body):
    out = []
    for cb in kws(body, "CHOICES"):
        for p in (cb.get("body") or []):
            if p.get("n") == "prop" and p.get("type") == "CHOICE":
                out.append({"name": p["name"], "pick": p.get("pick"),
                            "items": [r for r in (elem_ref(e) for e in p.get("items", [])) if r]})
            elif p.get("n") == "str":
                out.append({"rubric": p["v"]})
    return out


def defs_block(body, keyword):
    out = []
    for b in kws(body, keyword):
        for p in (b.get("body") or []):
            if p.get("n") == "prop" and p.get("type") == "DEF":
                out.append(prop_value(p))
            elif p.get("n") == "entity":
                out.append({"vk": "entity", "id": p["hash"], "name": p["name"]})
    return out


def table_of(body):
    """A printed table, cell for cell: COLUMNS then ROWs."""
    tb = kw1(body, "TABLE")
    if not tb:
        return None
    columns = [x["v"] for x in kwlist(tb.get("body"), "COLUMNS")]
    rows = [[x["v"] for x in (arg(r, "list") or [])] for r in kws(tb.get("body"), "ROW")]
    return {"columns": columns, "rows": rows}


def entity_record(e, doc, book, parent_id=None, slot=None):
    body = e["body"]
    props = [prop_value(p) for p in prop_nodes(body)]
    ext = kw1(body, "EXTENDS")
    return {
        "id": e["hash"],
        "name": e["name"],
        "key": e["name"],
        "form": e.get("kind") or "DEF",
        "book": book,
        "file": doc["file"],
        "type": arg(ext, "caret") if ext else None,
        "typeHash": arg(ext, "hash") if ext else None,
        "parent": parent_id,
        "slot": slot,
        "children": [],
        "desc": kwstr(body, "DESCRIPTION"),
        # another name the entity answers to (spec ALIAS: "The Nation of Blood", printed "Descendants of the Baron")
        "aliases": [a["v"] for n in kws(body, "ALIAS") for a in n["args"] if a["k"] == "str"] or None,
        "props": props,
        "entries": defs_block(body, "ENTRIES"),
        "table": table_of(body),
        "choices": choices_of(body),
        # a vocabulary type's options: `^"Discipline" DEF { ENUM ["Animalism", …] }`
        "enum": [x["v"] for x in kwlist(body, "ENUM") if x.get("k") == "str"] or None,
        "guidance": guidance_of(body),
        "refs": refs_of(body),
    }


def collect_entities(doc, book, out, order, body=None, parent=None, slot=None):
    """Every hashed entity anywhere in the tree, keyed by hash, with `parent` the nearest
    enclosing entity and `slot` the keyword block it sat in. `order` receives every id in
    document order (what records by shape read their place from)."""
    ids = []
    for e in (body if body is not None else doc["body"]):
        if e.get("n") == "entity":
            rec = entity_record(e, doc, book, parent["id"] if parent else None, slot)
            if rec["id"] in out:
                raise SystemExit("duplicate entity hash %s (%s and %s)" % (rec["id"], out[rec["id"]]["file"], doc["file"]))
            out[rec["id"]] = rec
            order.append(rec["id"])
            ids.append(rec["id"])
            if parent:
                parent["children"].append(rec["id"])
            collect_entities(doc, book, out, order, e["body"], rec, None)
        elif e.get("n") == "kw" and e.get("body"):
            ids.extend(collect_entities(doc, book, out, order, e["body"], parent, e["kw"]))
    return ids


def corrections_of(doc, book):
    """A corrections layer (spec §13): each top-level MODIFY / OVERRIDE names the entity it
    patches (in another book) and carries its replacement properties and its sidebars. An
    entity nested inside one (the errata's replacement table) is collected as an entity of
    this book like any other; its id is listed here so the reader can show it with the fix."""
    out = []
    for n in doc["body"]:
        if n.get("n") != "kw" or n["kw"] not in ("MODIFY", "OVERRIDE"):
            continue
        body = n.get("body") or []
        out.append({
            "op": n["kw"], "file": doc["file"], "book": book,
            "target": {"hash": arg(n, "hash"), "name": arg(n, "caret")},
            "props": [prop_value(p) for p in prop_nodes(body)],
            "guidance": guidance_of(body),
            "nested": [e["hash"] for e in body if e.get("n") == "entity"],
        })
    return out


# ───────────────────────── files ─────────────────────────

BANNER = ("/* Generated by build/build_data.py from titterpig-dsl-vtm5e/0.5 and\n"
          "   titterpig-dsl-vtm5e-3rdparty — do not edit by hand.\n"
          "   Every string is verbatim from the DSL corpora; regenerate rather than patch. */\n")

REGISTER = """(function(){var d=%s;var T=window.VTM5E=window.VTM5E||{books:{},entities:{},loaded:{}};
T.loaded[d.src]=true;T.books[d.book.id]=d.book;
for(var h in d.entities){T.entities[h]=d.entities[h];}})();
"""


def resolve_roots(argv):
    """The corpus roots this build reads, in shelf order; either may be given on the command
    line (`build_data.py [<official 0.5>] [<third-party repo>]`)."""
    return {sh["id"]: os.path.abspath(os.path.expanduser(argv[i] if len(argv) > i else sh["root"]))
            for i, sh in enumerate(SHELVES)}


def product_dirs(root):
    """A repository's product directories as they are ON DISK: every directory that holds a
    file this build would read or defer. Read from disk, never from the list above — that is
    what lets the list be wrong and be caught."""
    exts = DSL_EXTS + LORE_EXTS + tuple(DEFERRED_EXTS)
    return {os.path.relpath(r, root) for r, _d, files in os.walk(root)
            if any(f.endswith(exts) for f in files)}


def corpus_files(roots):
    """(loaded, deferred): basename → path, over every shelf. The basename is this build's
    file key, so it must be unique across the corpora."""
    loaded, deferred = {}, {}
    for sh in SHELVES:
        root = roots[sh["id"]]
        if sh.get("dirs") is not None:
            named = set(sh["dirs"]) | set(sh.get("excluded", {}))
            on_disk = product_dirs(root)
            if on_disk != named:
                raise SystemExit(
                    "build_data: the %s shelf's product list is out of step with the repository.\n"
                    "  %s\n"
                    "  on disk, named by neither dirs nor excluded: %s\n"
                    "  named here, not on disk: %s"
                    % (sh["id"], root, sorted(on_disk - named) or "none", sorted(named - on_disk) or "none"))
            walk = [os.path.join(root, d) for d in sh["dirs"]]
        else:
            walk = [root]
        for w in walk:
            for r, _dirs, files in os.walk(w):
                for fn in sorted(files):
                    into = deferred if os.path.splitext(fn)[1] in DEFERRED_EXTS else (
                        loaded if fn.endswith(DSL_EXTS + LORE_EXTS) else None)
                    if into is None:
                        continue
                    if fn in into or fn in (loaded if into is deferred else deferred):
                        raise SystemExit("build_data: two corpus files are named %s" % fn)
                    into[fn] = os.path.join(r, fn)
    return loaded, deferred


def book_of(fn):
    """The book a file belongs to: the longest prefix it carries."""
    stem = fn[len(FILE_PREFIX):] if fn.startswith(FILE_PREFIX) else None
    if stem is None:
        return None
    hits = [b for b in BOOKS if stem == b["prefix"] + os.path.splitext(stem)[1]
            or stem.startswith(b["prefix"] + "-")]
    hits.sort(key=lambda b: -len(b["prefix"]))
    return hits[0]["id"] if hits else None


def claimed_files(roots):
    """(loaded, deferred) with every book's `_files` filled. Raises if a corpus file is
    claimed by no book, if a book has no file, or if a file is claimed by a book shelved on
    a different corpus — a prefix that reaches across the shelves is a bug, not a shortcut."""
    loaded, deferred = corpus_files(roots)
    for b in BOOKS:
        b["_files"] = []
    unclaimed, crossed = [], []
    for fn in sorted(loaded):
        bid = book_of(fn)
        if not bid:
            unclaimed.append(fn)
            continue
        b = next(x for x in BOOKS if x["id"] == bid)
        if not loaded[fn].startswith(roots[b["shelf"]] + os.sep):
            crossed.append("%s (claimed by %s, on the %s shelf)" % (fn, bid, b["shelf"]))
            continue
        b["_files"].append(fn)
    empty = [b["id"] for b in BOOKS if not b["_files"]]
    if unclaimed or empty or crossed:
        raise SystemExit("build_data: the prefix → book map is out of step with the corpora.\n"
                         "  in the corpora, claimed by no book: %s\n"
                         "  books with no file: %s\n"
                         "  files claimed across shelves: %s"
                         % (unclaimed or "none", empty or "none", crossed or "none"))
    return loaded, deferred


def first_page(path, lore):
    head = open(path, encoding="utf-8").read(4000)
    m = (LORE_PAGE_RE if lore else PAGE_RE).search(head)
    return int(next(g for g in m.groups() if g)) if m else None


def lore_chapter(path, fn):
    text = open(path, encoding="utf-8").read()
    title = next((ln for ln in text.split("\n") if ln.startswith("# ")), fn)   # the H1 line as written
    return {"file": fn, "kind": "lore", "name": title, "page": first_page(path, True), "text": text}


# ───────────────────────── records by shape ─────────────────────────

def prop_names(e):
    return {p["name"] for p in e["props"]}


def disciplines_of(entities):
    """The Discipline names: the BASE's own vocabulary, `^"Discipline" DEF { ENUM [...] }`
    (PLAN.md D1, declared from the core's Disciplines chapter). Before the BASE declared
    them they were read by two of the book's heading patterns (decision 4); with the nesting
    fixed those patterns also caught labels ("Obfuscate:"), and the declaration is exact."""
    decl = [e for e in entities.values() if e["book"] == "base" and e["name"] == DISCIPLINE_TYPE and e.get("enum")]
    if len(decl) != 1:
        raise SystemExit("build_data: the BASE must declare exactly one ^\"%s\" ENUM (found %d)" % (DISCIPLINE_TYPE, len(decl)))
    return set(decl[0]["enum"])


def param_first(e, name):
    """a level the book offers two of ("LEVEL 1 OR 3 RITUAL": the corpus's PARAMETERS chooser, which
    the reader does not keep): the first, from the level as printed"""
    printed = scalar(e, "Printed " + name) or ""
    m = re.search(r"(\d)", printed)
    return int(m.group(1)) if m else None


def scalar(e, name):
    p = next((x for x in e["props"] if x["name"] == name), None)
    return p.get("value") if p and p.get("vk") in ("scalar", "enum") else None


def records_of(entities, orders, disciplines):
    typed = {e["id"]: TYPED_KINDS[e["name"]] for e in entities.values()
             if e.get("book") == "base" and e["name"] in TYPED_KINDS}
    out = []
    for fn, order in orders:
        level = None
        discipline = None
        for h in order:
            e = entities[h]
            if LEVEL_HEADING.match(e["name"]):
                level = e["name"]
            opens = next((d for d in disciplines if e["name"] == d or e["name"].startswith(d + " ")), None)
            if opens:                    # "Oblivion", "Oblivion Ceremonies", "Thin-Blood Alchemy Formulae"
                discipline, level = opens, None
            if e.get("typeHash") in typed and e.get("book") != "base":   # (BASE's own types are the types, not picks)
                kind = typed[e["typeHash"]]      # (BASE's own Merit, Flaw and Background are the types, not picks)
                rec = {"id": h, "name": e["name"], "book": e["book"], "kind": kind,
                       "under": entities[e["parent"]]["name"] if e["parent"] else None}
                if e.get("aliases"):
                    rec["aliases"] = e["aliases"]
                if kind == "loresheet level":
                    # its dots, and the loresheet it is printed under
                    rec["rating"] = scalar(e, "Rating")
                    rec["loresheet"] = e["parent"]
                elif kind == "advantage":
                    # its declared type, its dots (a Rating, or the printed range), what it sits under
                    rec["type"] = e.get("type")
                    rec["rating"] = scalar(e, "Rating")
                    rec["dots"] = scalar(e, "Dots")
                elif kind == "predator":
                    pass                         # its name, book and section are the record; its grants load with its book
                elif kind in ("power", "ritual"):
                    # where the book puts it, as declared: its Discipline and its level ("Level 3"; a
                    # Ritual the book offers at two levels, "Level 1 or 3", at the first)
                    rec["type"] = e.get("type")
                    rec["discipline"] = scalar(e, "Discipline")
                    lv = scalar(e, "Level") or param_first(e, "Level")
                    rec["level"] = "Level %s" % lv if lv is not None else None
                    if scalar(e, "Printed Level"):
                        rec["printedLevel"] = scalar(e, "Printed Level")
                    fields = {f: scalar(e, f) for f in RECORD_FIELDS[kind] if scalar(e, f) is not None}
                    if fields:
                        rec["fields"] = fields
                else:
                    rec["levels"] = [c for c in e.get("children", []) if entities.get(c, {}).get("typeHash") in typed]
                out.append(rec)
                continue
            ps = prop_names(e)
            kind = next((k for k, test in SHAPES if test(ps)), None)
            if not kind:
                continue
            rec = {"id": h, "name": e["name"], "book": e["book"], "kind": kind,
                   "under": entities[e["parent"]]["name"] if e["parent"] else None}
            if kind in ("power", "ritual"):
                rec["discipline"] = discipline
                rec["level"] = level
            fields = {}
            for f in RECORD_FIELDS[kind]:
                v = scalar(e, f)
                if v is not None:
                    fields[f] = v
            if fields:
                rec["fields"] = fields
            out.append(rec)
    return out


# ───────────────────────── emit ─────────────────────────

def main():
    corpus_roots = resolve_roots(sys.argv[1:])
    data_dir = os.path.join(HERE, "data")
    os.makedirs(data_dir, exist_ok=True)
    paths, deferred = claimed_files(corpus_roots)

    for fn in sorted(os.listdir(data_dir)):
        if fn.endswith(".js"):
            os.remove(os.path.join(data_dir, fn))

    entities = {}
    corrections = []
    orders = []                      # (file, [ids in document order]) in book/chapter order
    books_out = []
    for b in BOOKS:
        chapters = []
        for fn in b["_files"]:
            path = paths[fn]
            if fn.endswith(LORE_EXTS):
                chapters.append(lore_chapter(path, fn))
                continue
            chapters.append({"file": fn, "kind": "ttrpg", "page": first_page(path, False), "_path": path})
        # printed order; a chapter with no printed page keeps its place after those that have one
        chapters.sort(key=lambda c: (c["page"] is None, c["page"] or 0, c["file"]))
        roots = []
        for c in chapters:
            if c["kind"] != "ttrpg":
                continue
            doc = parse_files([c.pop("_path")])[0]
            order = []
            c["container"] = doc["container"]
            c["name"] = kwstr(doc["body"], "NAME")
            c["roots"] = collect_entities(doc, b["id"], entities, order)
            corrections.extend(corrections_of(doc, b["id"]))
            roots.extend(c["roots"])
            orders.append((c["file"], order))
        books_out.append((b, chapters, roots))

    disciplines = disciplines_of(entities)
    records = records_of(entities, orders, disciplines)

    index_books = []
    total = 0
    for b, chapters, roots in books_out:
        rec = {"id": b["id"], "label": b["label"], "kind": b["kind"], "chapters": chapters, "entities": roots}
        mine = {h: e for h, e in entities.items() if e["book"] == b["id"]}
        payload = {"src": "data/%s.js" % b["id"], "book": rec, "entities": mine}
        with open(os.path.join(data_dir, "%s.js" % b["id"]), "w", encoding="utf-8") as fh:
            fh.write(BANNER)
            fh.write(REGISTER % json.dumps(payload, ensure_ascii=False, sort_keys=True))
        total += len(mine)
        counts = {"entities": len(mine), "chapters": len(chapters)}
        for k in SHAPE_NAMES:
            counts[k] = sum(1 for r in records if r["book"] == b["id"] and r["kind"] == k)
        index_books.append({
            "id": b["id"], "label": b["label"], "kind": b["kind"], "shelf": b["shelf"],
            "files": {"main": ["data/%s.js" % b["id"]]},
            "chapters": [{"file": c["file"], "kind": c["kind"], "name": c.get("name"), "page": c["page"]} for c in chapters],
            "counts": counts,
            "bytes": os.path.getsize(os.path.join(data_dir, "%s.js" % b["id"])),
        })

    index = {"system": "vtm5e", "books": index_books, "disciplines": sorted(disciplines),
             "corrections": corrections,
             "shelves": [{"id": s["id"], "label": s["label"], "note": s.get("note")} for s in SHELVES],
             "counts": {"books": len(index_books), "entities": total, "files": len(paths),
                        "records": {k: sum(1 for r in records if r["kind"] == k) for k in SHAPE_NAMES}}}
    with open(os.path.join(data_dir, "index.js"), "w", encoding="utf-8") as fh:
        fh.write(BANNER)
        fh.write("(function(){var T=window.VTM5E=window.VTM5E||{books:{},entities:{},loaded:{}};"
                 "T.index=%s;})();\n" % json.dumps(index, ensure_ascii=False, sort_keys=True))
    with open(os.path.join(data_dir, "records.js"), "w", encoding="utf-8") as fh:
        fh.write(BANNER)
        fh.write("(function(){var T=window.VTM5E=window.VTM5E||{books:{},entities:{},loaded:{}};"
                 "T.records=%s;})();\n" % json.dumps(records, ensure_ascii=False, sort_keys=True))

    print("build_data: %d corpus files → %d books, %d entities; records: %s; %d Discipline headings; %d corrections"
          % (len(paths), len(index_books), total,
             ", ".join("%s %d" % (k, index["counts"]["records"][k]) for k in SHAPE_NAMES), len(disciplines), len(corrections)))
    for sh in SHELVES:
        print("  ── %s (%s)" % (sh["label"], corpus_roots[sh["id"]]))
        for x in [b for b in index_books if b["shelf"] == sh["id"]]:
            c = x["counts"]
            print("  %-24s %3d ch %6d ent %5d KB  %s" % (x["id"], c["chapters"], c["entities"], x["bytes"] // 1024,
                  " · ".join("%s %d" % (k, c[k]) for k in SHAPE_NAMES if c[k])))
        for d, why in sorted(sh.get("excluded", {}).items()):
            print("  %-24s EXCLUDED — %s" % (d, why))
    for fn in sorted(deferred):
        print("  %-24s DEFERRED — %s" % (fn, DEFERRED_EXTS[os.path.splitext(fn)[1]]))


if __name__ == "__main__":
    main()
