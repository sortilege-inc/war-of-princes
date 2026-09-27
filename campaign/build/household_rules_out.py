#!/usr/bin/env python3
"""
household_rules_out.py — the rules text out of the household page, once (owner, 2026-09-27: "All
the rules-text should be assumed incorrect").

    python3 campaign/build/household_rules_out.py

The household page (campaign/docs/household.html, as moved) printed its characters' numbers, their
Discipline powers and their Merits and Flaws in its own words - tooltips, power summaries, a
"Mechanical Note". Those numbers now live in the character files (campaign/characters/, converted
and checked from the page as it was: campaign/source/household.html), and the rules text is the
books'. Each such block is replaced here by a mount the Household tab fills at runtime
(campaign/site/household.js) from the character file and the books:

  <div class="wop-sheet" data-character="<file>" data-part="attributes|skills|powers|advantages|stats">
  <span class="wop-sheet" data-character="tomislawa" data-part="road|guideline">   (the masthead rows)
  <div class="wop-book" data-name="Herd">                                           (the Herd note)

Everything else - the portraits, the prose, the tarot, the handling notes - is left as it was, and
proven so: the text outside the replaced blocks is identical before and after, whitespace aside. Run once; it
refuses a page that has already been through it.
"""
import os
import re
import sys
from html.parser import HTMLParser

CAMPAIGN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOC = os.path.join(CAMPAIGN, "docs", "household.html")
SLUG = str.maketrans("ąćęłńóśźżĄĆĘŁŃÓŚŹŻ", "acelnoszzACELNOSZZ")
PANEL_FILE = {"tab-tomi": "tomislawa", "tab-graf": "graf"}
SECTION_PARTS = {"Attributes": ["attributes"], "Skills": ["skills"], "Disciplines &amp; Powers": ["powers"],
                 "Merits &amp; Flaws": ["advantages"], "Power, Merits &amp; Flaws": ["powers", "advantages"]}


def close_of(html, i):
    """The index just past the </div> that closes the <div …> opening at i."""
    depth, k = 0, i
    for m in re.finditer(r"<div\b|</div>", html[i:]):
        depth += 1 if m.group(0) == "<div" else -1
        if depth == 0:
            return i + m.end()
    raise SystemExit("unbalanced <div> at %d" % i)


def mount(file, part, tag="div"):
    return '<%s class="wop-sheet" data-character="%s" data-part="%s"></%s>' % (tag, file, part, tag)


class Text(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out = []

    def handle_data(self, d):
        self.out.append(d)


def text_of(html):
    t = Text()
    t.feed(html)
    return re.sub(r"\s+", " ", "".join(t.out)).strip()


def main():
    html = open(DOC, encoding="utf-8").read()
    if 'class="wop-sheet"' in html:
        raise SystemExit("household_rules_out: already applied")
    cuts = []          # (start, end, replacement)

    for pid, file in PANEL_FILE.items():
        p0 = html.index('<div id="%s"' % pid)
        p1 = close_of(html, p0)
        # the masthead's Road and Moral Guideline rows (Tomisława's)
        for label, part in (("Road", "road"), ("Moral Guideline", "guideline")):
            m = re.compile(r"<dt>%s</dt>\s*<dd>(.*?)</dd>" % re.escape(label), re.S).search(html, p0, p1)
            if m:
                cuts.append((m.start(1), m.end(1), mount(file, part, "span")))
        for m in re.finditer(r'<section class="section">', html[p0:p1]):
            s0 = p0 + m.start()
            s1 = html.index("</section>", s0)
            title = re.search(r'<h2 class="section-title">(.*?)</h2>', html[s0:s1]).group(1)
            if title not in SECTION_PARTS:
                continue
            rule = html.index('<div class="section-rule">', s0)
            body0 = close_of(html, rule)
            cuts.append((body0, s1, "\n      " + "\n      ".join(mount(file, p) for p in SECTION_PARTS[title]) + "\n    "))

    for m in re.finditer(r'<div class="ally-card">', html):
        c0 = m.start()
        c1 = close_of(html, c0)
        card = html[c0:c1]
        name = re.search(r'<h3 class="ally-name">(.*?)<span', card).group(1).strip()
        file = re.sub(r"[^a-z0-9]+", "-", name.translate(SLUG).lower()).strip("-")
        rows = [r.start() for r in re.finditer(r'<div class="ally-stats-row">', card)]
        r_end = close_of(html, c0 + rows[-1])
        cuts.append((c0 + rows[0], r_end, mount(file, "stats")))
        g = card.find('<div class="mf-grid"')
        if g != -1:
            cuts.append((c0 + g, close_of(html, c0 + g), mount(file, "advantages")))

    m = re.search(r'<div class="callout-label">Mechanical Note — Herd 3</div>\s*<p class="callout-body">.*?</p>', html, re.S)
    b = html.index('<p class="callout-body">', m.start())
    cuts.append((b, m.end(), '<div class="wop-book" data-name="Herd"></div>'))

    cuts.sort()
    for a, b in zip(cuts, cuts[1:]):
        if a[1] > b[0]:
            raise SystemExit("overlapping cuts at %d" % b[0])
    out, kept_old, kept_new, last = [], [], [], 0
    for s, e, rep in cuts:
        out.append(html[last:s])
        kept_old.append(html[last:s])
        out.append(rep)
        last = e
    out.append(html[last:])
    new = "".join(out)
    # the proof: outside the cuts, the text is what it was
    rest_old = text_of("\x00".join(kept_old + [html[last:]]))
    rest_new = re.sub(r"\s+", " ", text_of(re.sub(r'<(div|span) class="wop-(sheet|book)"[^>]*></\1>', "\x00", new))).strip()
    # (whitespace aside: a mount stands where a block of markup stood, so the spaces around it move)
    squeeze = lambda t: re.sub(r"\s+", "", t.replace("\x00", ""))
    if squeeze(rest_old) != squeeze(rest_new):
        raise SystemExit("household_rules_out: the text outside the cuts changed — nothing written")
    left = {k: len(re.findall(k, new)) for k in ("data-tip", 'class="power-body"', 'class="mf-item"', 'class="attr-card"', 'class="ally-stat"', 'class="skill-row"', 'class="derived-cell"')}
    with open(DOC, "w", encoding="utf-8") as fh:
        fh.write(new)
    print("household_rules_out: %d blocks replaced by mounts (%d sheets, %d book notes); text outside them identical (whitespace aside); left in the page: %s"
          % (len(cuts), new.count('class="wop-sheet"'), new.count('class="wop-book"'), left))
    return 0 if not any(left.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
