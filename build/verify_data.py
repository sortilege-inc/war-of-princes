#!/usr/bin/env python3
"""
verify_data.py — the content gate, in both directions:

  1. COVERAGE — every string the corpus prints (every STR and every caret name in every DSL
     file, and every non-blank line of every .lore file) reaches data/*.js, except the
     container-header metadata listed in SKIP_KEYWORDS, each with its reason.
  2. FIDELITY — every string in data/*.js came from the corpus. A coverage check alone lets
     invented or mangled text through; a fidelity check alone lets a dropped table through.
     Neither finds what the other does.

Skips are by KEY name only, never by value, and each skipped key says why.

Exit 0 = both clean. Never weaken this to make a build pass: fix the build.

    python3 build/verify_data.py [<titterpig-dsl-vtm5e/0.5>] [<titterpig-dsl-vtm5e-3rdparty>]
"""
import json
import os
import re
import sys
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from parse_dsl import tokenize, unescape, lift_rule_lines  # noqa: E402
from build_data import (BOOKS, KINDS, SHAPE_NAMES, SHELVES, LORE_EXTS, corpus_files,  # noqa: E402
                        resolve_roots)

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SKIP_KEYWORDS = {
    "VERSION": "DSL content version of the source file",
    "SPEC_VERSION": "Titterpig spec version of the source file",
    "RELEASE_DATE": "conversion date of the source file",
    "DEPENDS_ON": "the module identifier of a sibling extension this file is unusable without "
                  "(the Sunburners on The Black Hand's Path template) — a name in the manifest, "
                  "not text the book prints",
}
# Words the DSL grammar itself uses that survive into the data as field labels, not as text.
TYPE_WORDS = {"STRING", "INTEGER", "BOOLEAN", "FLOAT", "TEXT", "DEF", "TEMPLATE", "ACTOR",
              "LIST", "ENUM", "REF", "CHOICE", "VALUE", "EXTENSION", "BASE", "ARC"}
# Keys whose values this build writes itself. By key, never by value.
BUILD_KEYS = {
    "id": "entity, book and record ids",
    "hash": "a reference's target id",
    "typeHash": "the id of the type a DEF EXTENDS",
    "ofHash": "the id bound to a LIST OF type",
    "parent": "the enclosing entity's id",
    "children": "ids of nested entities",
    "roots": "ids of a chapter's top-level entities",
    "entities": "ids of a book's top-level entities",
    "book": "which book this file's data belongs to",
    "file": "the corpus file an entity or chapter came from",
    "src": "this data file's own path",
    "vk": "the shape of a property value (scalar/list/ref/def/enum)",
    "slot": "the DSL keyword block an entity was nested in (GUIDANCE…)",
    "kind": "the book kind, chapter kind or record shape this build assigns",
    "container": "the file's container word (BASE / EXTENSION)",
    "system": "the system id from engine/config.js",
    "form": "the entity's declaration form (DEF / ACTOR)",
    "main": "the data file paths of a book",
    "nested": "ids of the entities a correction carries",
    "op": "a correction's keyword (MODIFY / OVERRIDE)",
    "loresheet": "a Loresheet Level record's loresheet (the id of the DEF it is printed under)",
    "levels": "a Loresheet record's level ids",
}
BLOB = re.compile(r"var d=(\{.*?\});var T=window\.VTM5E", re.S)
INDEX_BLOB = re.compile(r"T\.index=(\{.*\});\}\)\(\);", re.S)
RECORDS_BLOB = re.compile(r"T\.records=(\[.*\]);\}\)\(\);", re.S)
CONTAINERS = ("BASE", "EXTENSION", "ARC", "FRAME", "SETTING", "CAMPAIGN")


def lore_lines(text):
    return [ln for ln in text.split("\n") if ln.strip()]


def corpus_strings(paths):
    """Every string the corpus prints, over an explicit list of corpus file paths."""
    want, skipped = Counter(), Counter()
    for path in sorted(paths):
        text = open(path, encoding="utf-8").read()
        if path.endswith(LORE_EXTS):
            for ln in lore_lines(text):
                want[ln] += 1
            continue
        toks = tokenize(lift_rule_lines(text))
        i = 0
        # the container header: KIND "id" [EXTENDS "parent"] — module identifiers, not text
        if toks and toks[0].kind == "ID" and toks[0].val in CONTAINERS:
            skipped[toks[1].val] += 1
            i = 2
            if len(toks) > 3 and toks[2].kind == "ID" and toks[2].val == "EXTENDS":
                skipped[toks[3].val] += 1
                i = 4
        while i < len(toks):
            t = toks[i]
            if t.kind == "ID" and t.val in SKIP_KEYWORDS:
                j = i + 1
                while j < len(toks) and toks[j].kind in ("STR", "INT"):
                    if toks[j].kind == "STR":
                        skipped[unescape(toks[j].val)] += 1
                    j += 1
                i = j
                continue
            if t.kind == "STR":
                want[unescape(t.val)] += 1
            elif t.kind == "CARET":
                want[t.val] += 1
            i += 1
    return want, skipped


def data_blobs():
    blobs = []
    for fn in sorted(os.listdir(os.path.join(HERE, "data"))):
        if not fn.endswith(".js"):
            continue
        src = open(os.path.join(HERE, "data", fn), encoding="utf-8").read()
        m = BLOB.search(src) or INDEX_BLOB.search(src) or RECORDS_BLOB.search(src)
        if not m:
            raise SystemExit("verify_data: %s is not in the expected shape" % fn)
        blobs.append(json.loads(m.group(1)))
    return blobs


def data_strings(blobs):
    """Every string in data/ — a lore chapter's text counted line by line."""
    got = Counter()

    def walk(n):
        if isinstance(n, dict):
            lore = n.get("kind") == "lore" and isinstance(n.get("text"), str)
            for k, v in n.items():
                if k in BUILD_KEYS and not isinstance(v, (dict, list)):
                    continue
                if k in BUILD_KEYS and isinstance(v, list) and all(isinstance(x, str) for x in v):
                    continue                     # lists of ids / paths; the entity map is a dict
                if lore and k == "text":
                    for ln in lore_lines(v):
                        got[ln] += 1
                    continue
                walk(v)
        elif isinstance(n, list):
            for x in n:
                walk(x)
        elif isinstance(n, str):
            got[n] += 1                          # ids never reach here: they sit under BUILD_KEYS
    for b in blobs:
        walk(b)
    return got


def main():
    loaded, _deferred = corpus_files(resolve_roots(sys.argv[1:]))
    want, skipped = corpus_strings(loaded.values())
    got = data_strings(data_blobs())

    # text this build writes of its own: the book labels, the shelves' own labels and notes,
    # the kinds and record shapes, the data file paths, and the DSL's own type words as
    # field labels.
    ours = set(TYPE_WORDS) | KINDS | set(SHAPE_NAMES) | {b["label"] for b in BOOKS}
    ours |= {"data/%s.js" % b["id"] for b in BOOKS}
    ours |= {s["label"] for s in SHELVES} | {s["id"] for s in SHELVES}
    ours |= {s["note"] for s in SHELVES if s.get("note")}

    missing = sorted(k for k in want if k not in got)
    unsourced = sorted(k for k in got if k not in want and k not in ours and k not in skipped)

    print("verify_data: the corpus prints %d distinct strings (DSL strings and .lore lines; %d header values skipped by keyword)"
          % (len(want), len(skipped)))
    for label, rows in (("UNCOVERED — in the corpus, not in data/", missing),
                        ("UNSOURCED — in data/, not in the corpus", unsourced)):
        if rows:
            print("  %s: %d" % (label, len(rows)))
            for s in rows[:25]:
                print("    %r" % s[:130])
    if not (missing or unsourced):
        print("  %d strings — 0 uncovered · 0 unsourced; every string round-trips" % len(want))
    return 1 if (missing or unsourced) else 0


if __name__ == "__main__":
    sys.exit(main())
