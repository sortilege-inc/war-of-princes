#!/usr/bin/env python3
"""
convert_household.py — Tomisława's household, from the table's own record, as VTT character files.

    python3 campaign/source/convert_household.py

The source is the household page as the table wrote it (campaign/household/index.html — owner,
2026-09-27: "the household page" is the record where it and Tomisława's PDF sheet disagree). What
the page does not carry and her PDF sheet does (her Predator type) is read from the sheet's form
fields, which live beside the repo in the support archive and never in it (the sheet names its
player).

Writes campaign/characters/<id>.vtm5e-character.json, one per character, in the file shape the
VTT's sheet reads and writes (system/vtm5e/sheet.js fileOf): Tomisława as Summoned Stories'
ACTOR "Cainite", the Graf as the BASE's "Ghoul", the four allies and the eight of the herd as its
"Mortal".

What this converter decides, each named once here and reported on every run:

  * Names are the books'. A trait the page names another way is written under the book's name
    with the page's own words in brackets, as the Blood & Other Drugs instance does (ADVANTAGE_NAMES).
    The page's own bracketed gloss of what a rule does ("staking = Final Death, not torpor") is
    rules text in the page's words, and is not carried (RULES_GLOSS): the VTT shows the book's.
  * Archery and Riding are Firearms and Drive: the campaign's house rule relabels them on the
    sheet (campaign/dsl), so the value is written under the core's trait (SKILL_NAMES).
  * A power taken three times is written three times, each with the element the page names
    ("Koldunic Bonds: Earth · Water · Air").
  * What the page leaves blank is left blank - except Humanity for the ghoul and the mortals,
    which the Companion starts at 7 ("Mortals begin play with a Humanity value of 7"; "Ghouls
    start play with Humanity at 7") and the page never records (HUMANITY_START).

The file is regenerated, never hand-edited. check_household.py re-derives every value from the
page by a different reading and compares.
"""
import html
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
PAGE = os.path.join(ROOT, "campaign", "household", "index.html")
OUT = os.path.join(ROOT, "campaign", "characters")
PDF = os.path.join(os.path.dirname(ROOT), "war-of-princes-support", "archive", "reference", "pcs",
                   "Tomisława z Białowieży.pdf")

CAINITE = "#vssCainite0000000001"
GHOUL = "#vtm5Ghoul00000000001"
MORTAL = "#vtm5Mortal0000000001"
CHRONICLE = "War of Princes"
DOMITOR = "Tomisława z Białowieży"
HUMANITY_START = 7

ATTR_ABBR = {"STR": "Strength", "DEX": "Dexterity", "STA": "Stamina", "CHA": "Charisma", "MAN": "Manipulation",
             "COM": "Composure", "INT": "Intelligence", "WIT": "Wits", "RES": "Resolve"}
SKILL_NAMES = {"Archery": "Firearms", "Riding": "Drive"}
SKILLS = ["Athletics", "Brawl", "Craft", "Drive", "Firearms", "Melee", "Larceny", "Stealth", "Survival",
          "Animal Ken", "Etiquette", "Insight", "Intimidation", "Leadership", "Performance", "Persuasion",
          "Streetwise", "Subterfuge", "Academics", "Awareness", "Finance", "Investigation", "Medicine",
          "Occult", "Politics", "Science", "Technology"]

# the page's name → (the book's name, the page's own words kept in brackets or None)
ADVANTAGE_NAMES = {
    "Language": ("Linguistics", "keep"),          # "Language: Old Polish" → Linguistics (Old Polish)
    "Status": ("Status", "keep"),                 # "Status: Known" → Status (Known)
    "Resources": ("Resources", "keep"),
    "Allies": ("Allies", "keep"),                 # "Allies: Effectiveness (the four)" → Allies (Effectiveness: the four)
    "Folkloric Block": ("Folkloric Block", "keep"),
    "Mawla (Secret Master)": ("Secret Master", None),   # a Flaw: The Gehenna War's Secret Master
}
# a bracket that restates what the rule does, in the page's words - dropped (the sheet shows the book's)
RULES_GLOSS = {
    "Herd": "7–15 vessels, two Resonances",
    "Twice-Cursed": "both Tzimisce banes",
    "Stake Bait": "staking = Final Death, not torpor",
}
# a loresheet level is an Advantage of its own, referenced by id (BASE 0.5.3)
LORESHEET_LEVELS = {"Seeking a Vein": "#vsvtjqmwfyTxr191Q284Lb8"}   # Blood Sigils, Veins of the Earth

POWER_NAMES = {"Domitor's Favor": "Domitor’s Favor", "Vicissitude (Fleshcrafting)": "Vicissitude"}
# the Road as the Road System heads it
ROADS = {"Road of Kings": "Road of Kings (Scions)"}
# Her Clan Bane, as the books print it (the creator's own reading: a clan's "Bane" entity). She is
# Twice-Cursed, so both: the Players Guide's Tzimisce Bane and its variant, Cursed Courtesy.
BANES = [("players-guide", "#vqMv5p7LHtZUEow5nBFUyKV"), ("players-guide", "#vNuP0QL6cSSAA8PXQEwqGwB")]

notes = []


def text(s):
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def panel(page, pid):
    i = page.index('<div id="%s" class="tab-panel' % pid)
    j = page.find('<div id="tab-', i + 10)
    return page[i:j if j != -1 else len(page)]


_book_names = None


def book_name(name):
    """The book's own spelling of an Advantage or Flaw the page names (the VTT's built records):
    the page may capitalise what the book does not ("Twice-Cursed" is printed "Twice-cursed")."""
    global _book_names
    if _book_names is None:
        s = open(os.path.join(ROOT, "data", "records.js"), encoding="utf-8").read()
        recs = json.loads(s[s.index("T.records=") + len("T.records="):s.rindex("];") + 1])
        _book_names = {}
        for r in recs:
            if r["kind"] in ("advantage", "loresheet level"):
                _book_names.setdefault(r["name"].lower(), r["name"])
    got = _book_names.get(name.lower())
    if got is None:
        raise SystemExit("convert_household: no book prints an Advantage or Flaw named %r" % name)
    if got != name:
        notes.append("%s → %s (the book's spelling)" % (name, got))
    return got


def advantage(raw_name, dots, flaw):
    name, gloss = raw_name, None
    m = re.match(r"^(.*?)(?::\s*(.+)|\s*\(([^()]+)\))$", raw_name)
    if raw_name in ADVANTAGE_NAMES:
        name = ADVANTAGE_NAMES[raw_name][0]
        notes.append("%s → %s" % (raw_name, name))
    elif m:
        base, after = m.group(1).strip(), (m.group(2) or m.group(3)).strip()
        if base in RULES_GLOSS and RULES_GLOSS[base] == after:
            name = base
            notes.append("%s: the page's gloss of the rule dropped" % raw_name)
        else:
            book = ADVANTAGE_NAMES.get(base, (base, "keep"))[0]
            # a bracket inside the page's words becomes a colon, so the note is one bracket
            name = "%s (%s)" % (book, re.sub(r"\s*\(([^()]+)\)$", r": \1", after))
            if book != base or m.group(2):
                notes.append("%s → %s" % (raw_name, name))
    m2 = re.match(r"^(.*?)(\s*\(.*\))?$", name)
    name = book_name(m2.group(1)) + (m2.group(2) or "")
    line = {"Name": name, "Dots": dots, "Flaw": flaw}
    if name in LORESHEET_LEVELS:
        line["Advantage"] = LORESHEET_LEVELS[name]
    return line


def merits_flaws(block):
    """Every mf-item in order, each under the Merits or Flaws label that last preceded it."""
    out, kind = [], None
    for m in re.finditer(r'<div class="mf-group-label (merit|flaw)">|<div class="mf-item"[^>]*><span class="mf-pts">(\d)</span>\s*([^<]+)</div>', block):
        if m.group(1):
            kind = m.group(1)
        else:
            out.append(advantage(text(m.group(3)), int(m.group(2)), kind == "flaw"))
    return out


def blank_skills(v):
    for s in SKILLS:
        v.setdefault(s, 0)


def skill_rows(block):
    """Tomisława's and the Graf's skill-rows: name, an optional specialty in <em>, the value."""
    skills, specs = {}, []
    for inner, val in re.findall(r'<div class="skill-row"><span class="skill-name">(.*?)</span><span class="skill-val">(\d)</span></div>', block):
        em = re.search(r"<em[^>]*>\((.*?)\)</em>", inner)
        name = text(re.sub(r"<em.*?</em>", "", inner))
        name = SKILL_NAMES.get(name, name)
        skills[name] = int(val)
        if em:
            specs.append({"Skill": name, "Specialty": text(em.group(1))})
    return skills, specs


def attr_cards(block):
    return {text(n): int(v) for n, v in re.findall(r'<div class="attr-name">(.*?)</div><div class="attr-val">(\d)</div>', block)}


def derived(block):
    return {text(k): text(v) for k, v in re.findall(r'<span class="derived-label">(.*?)</span><span class="derived-val">(.*?)</span>', block)}


def pdf_fields():
    """Tomisława's PDF sheet's filled form fields (pdftk), or {} if the sheet is not beside the repo."""
    if not os.path.exists(PDF):
        return {}
    dump = subprocess.run(["pdftk", PDF, "dump_data_fields_utf8"], capture_output=True, text=True, check=True).stdout
    out, name = {}, None
    for line in dump.splitlines():
        if line.startswith("FieldName: "):
            name = line[len("FieldName: "):]
        elif line.startswith("FieldValue: ") and name:
            out[name] = line[len("FieldValue: "):]
    return out


def book_entity(book, eid):
    """An entity of the VTT's built data (data/<book>.js), read as the build wrote it."""
    blob = open(os.path.join(ROOT, "data", book + ".js"), encoding="utf-8").read()
    d = json.loads(re.search(r"var d=(\{.*\});var T=window\.VTM5E", blob, re.S).group(1))
    return d["entities"][eid]


def file_of(template, values, live=None):
    return {"kind": "sortilege-vtt-character", "v": 2, "system": "vtm5e", "templateId": template,
            "name": values["Name"], "values": values, "live": live or {}}


def tomislawa(page, pdf):
    p = panel(page, "tab-tomi")
    ident = dict((text(k), v) for k, v in re.findall(r"<dt>(.*?)</dt>\s*<dd>(.*?)</dd>", p))
    eyebrow = text(re.search(r'<div class="name-eyebrow">(.*?)</div>', p).group(1))   # Tzimisce · 10th Generation · Blood Potency 2
    clan, gen, bp = [x.strip() for x in eyebrow.split("·")]
    caption = text(re.search(r'<div class="portrait-caption">(.*?)</div>', p).group(1))  # … · b. 1212, Embraced 1230
    born, embraced = re.search(r"b\. (\d{4}), Embraced (\d{4})", caption).groups()
    emb = text(ident["Embraced"])      # 1230 · Apparent Age 18 · True Age 30
    apparent = re.search(r"Apparent Age (\d+)", emb).group(1)
    true_age = re.search(r"True Age (\d+)", emb).group(1)
    subtitle = text(re.search(r'<p class="char-subtitle">(.*?)</p>', p).group(1))   # Road of Kings · Via Regalis · Chronicle: …
    road = ROADS[subtitle.split("·")[0].strip()]
    road_rating = int(re.match(r"Via Regalis (\d+)", text(ident["Road"])).group(1))
    d = derived(p)
    v = {"Name": "Tomisława z Białowieży", "Chronicle": CHRONICLE, "Clan": clan,
         "Sire": text(ident["Sire"]), "Generation": int(re.match(r"(\d+)", gen).group(1)),
         "Blood Potency": int(bp.split()[-1]), "Hunger": int(d["Hunger"])}
    v.update(attr_cards(p))
    v["Health"], v["Willpower"] = int(d["Health"]), int(d["Willpower"])
    blank_skills(v)
    sk, specs = skill_rows(p)
    v.update(sk)
    v["Specialties"] = specs
    # Disciplines: each disc-block's name and dots, then its power-items; the rituals follow a
    # "Rituals" cluster label and are Blood Sorcery's. "Koldunic Sorcery — Earth" is the book's
    # Koldunic Sorcery taken for Earth: written "Koldunic Sorcery (Earth)".
    head, _, rit = p.partition('<div class="cluster-label">Rituals</div>')
    title = lambda t: POWER_NAMES.get(text(t), text(t))
    discs = []
    for block in head.split('<div class="disc-block">')[1:]:
        dname = re.sub(r"\s*\(.*\)$", "", text(re.search(r'<span class="disc-name">(.*?)</span>', block).group(1)))
        dots = text(re.search(r'<span class="disc-rating">(.*?)</span>', block).group(1)).count("●")
        powers = []
        for t in re.findall(r'<div class="power-title">(.*?)<span', block):
            t = title(t)
            m = re.match(r"^Koldunic Sorcery — (\w+)$", t)
            powers.append("Koldunic Sorcery (%s)" % m.group(1) if m else t)
        discs.append({"Discipline": dname, "Dots": dots, "Powers": powers})
    rituals = [title(t) for t in re.findall(r'<div class="power-title">(.*?)<span', rit.split("</section>")[0])]
    for d_ in discs:
        if d_["Discipline"] == "Blood Sorcery":
            d_["Powers"] += rituals
    v["Disciplines"] = discs
    v["Road"], v["Road Rating"] = road, road_rating
    v["Advantages & Flaws"] = merits_flaws(p)
    if any(a["Name"].lower() == "twice-cursed" for a in v["Advantages & Flaws"]):
        v["Clan Bane"] = "\n\n".join(book_entity(b, e)["desc"] for b, e in BANES)
    v["True age"], v["Apparent age"], v["Date of birth"], v["Date of death"] = true_age, apparent, born, embraced
    # the page carries no Predator type; her PDF sheet does: "Łowy (Montero)" - the table's word, then the book's type
    pt = pdf.get("Predator type", "")
    m = re.match(r"^(.*?)\s*\((.+)\)$", pt)
    if m:
        v["Predator"] = m.group(2)
        v["Notes"] = "Predator type on her sheet: %s." % pt
        notes.append("Predator: %s → %s (the PDF sheet; the page has none)" % (pt, m.group(2)))
    else:
        notes.append("Predator: not written — the PDF sheet is not beside the repo")
    return "tomislawa", file_of(CAINITE, v, {"hunger": v["Hunger"]})


def graf(page):
    p = panel(page, "tab-graf")
    title = text(re.search(r'<h1 class="char-name">(.*?)</h1>', p).group(1))       # Graf Światosław Odrowąż
    caption = text(re.search(r'<div class="portrait-caption">(.*?)</div>', p).group(1))
    concept = text(re.search(r'<p class="char-subtitle">(.*?)</p>', p).group(1))
    d = derived(p)
    v = {"Name": title, "Concept": concept, "Chronicle": CHRONICLE, "Domitor": DOMITOR}
    v.update(attr_cards(p))
    v["Health"], v["Willpower"] = int(d["Health"]), int(d["Willpower"])
    blank_skills(v)
    sk, specs = skill_rows(p)
    v.update(sk)
    v["Specialties"] = specs
    # "Cloud Memory · Dominate 1": the power, its Discipline, the dot a ghoul counts as having
    powers = re.findall(r'<div class="power-title">(.*?)<span[^>]*>\s*·\s*(\w+) (\d)</span>', p)
    v["Disciplines"] = [{"Discipline": disc, "Dots": int(n), "Powers": [text(t)]} for t, disc, n in powers]
    v["Humanity"] = HUMANITY_START
    v["Advantages & Flaws"] = merits_flaws(p)
    v["Date of birth"] = re.search(r"b\. (\d{4})", caption).group(1)
    return "graf", file_of(GHOUL, v)


def cards(page, pid):
    p = panel(page, pid)
    for card in re.split(r'<div class="ally-card">', p)[1:]:
        name = text(re.search(r'<h3 class="ally-name">(.*?)<span', card).group(1))
        handle = text(re.search(r'<span class="handle">(.*?)</span>', card).group(1))
        concept = text(re.search(r'<p class="ally-subtitle">(.*?)</p>', card).group(1))
        rows = re.findall(r'<div class="ally-stats-row">(.*?)</div>', card, re.S)
        v = {"Name": name, "Concept": concept, "Chronicle": CHRONICLE}
        for k, n in re.findall(r'<span class="ally-stat">(.*?) <strong>(\d)</strong></span>', rows[0]):
            v[ATTR_ABBR[k]] = int(n)
        blank_skills(v)
        for k, n in re.findall(r'<span class="ally-stat">(.*?) <strong>(\d)</strong></span>', rows[1]):
            v[SKILL_NAMES.get(text(k), text(k))] = int(n)
        v["Specialties"] = []
        v["Humanity"] = HUMANITY_START
        v["Advantages & Flaws"] = merits_flaws(card) if 'class="mf-grid"' in card else []
        v["Notes"] = "Called %s." % handle
        yield name, v


def slug(name):
    table = str.maketrans("ąćęłńóśźżĄĆĘŁŃÓŚŹŻ", "acelnoszzACELNOSZZ")
    return re.sub(r"[^a-z0-9]+", "-", name.translate(table).lower()).strip("-")


def main():
    page = open(PAGE, encoding="utf-8").read()
    pdf = pdf_fields()
    out = [tomislawa(page, pdf), graf(page)]
    for name, v in cards(page, "tab-allies"):
        if name == "Piers":
            # the table's record keeps him; the chronicle's Session Four ends his life
            v["Notes"] += " Died in the hunt (the Chronicle, Session Four)."
        out.append((slug(name), file_of(MORTAL, v)))
    for name, v in cards(page, "tab-herd"):
        out.append((slug(name), file_of(MORTAL, v)))
    os.makedirs(OUT, exist_ok=True)
    written = set()
    for key, f in out:
        path = os.path.join(OUT, "%s.vtm5e-character.json" % key)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(f, fh, ensure_ascii=False, indent=2)
            fh.write("\n")
        written.add(os.path.basename(path))
    stale = [x for x in os.listdir(OUT) if x.endswith(".vtm5e-character.json") and x not in written]
    for x in stale:
        os.remove(os.path.join(OUT, x))
    print("convert_household: %d characters → campaign/characters/%s" % (len(out), " (removed stale: %s)" % ", ".join(stale) if stale else ""))
    for n in sorted(set(notes)):
        print("  " + n)


if __name__ == "__main__":
    sys.exit(main())
