#!/usr/bin/env python3
"""
move_pages.py — the old campaign site's pages moved into the VTT's site tabs, once
(~/Sortilege/VTT/INSTANCES.md, "Move the old pages, don't rewrite them").

    python3 campaign/build/move_pages.py            # move, then prove; exit 1 if the proof fails
    python3 campaign/build/move_pages.py --plant    # prove the proof: a planted change must fail it

Each page's content is taken into campaign/docs/<doc>.html: the body, with the site's own chrome
dropped - the top nav, the breadcrumb, the footer, the scripts (a page's script is re-made as a
function the tab calls: campaign/site/site.js). Its links are rewritten to the tabs (#<tab>), its
images to campaign/assets/portraits/, and each page's own <style> is kept as
campaign/docs/<doc>.css beside envoy.css (campaign/build/build_docs.py scopes them).

The proof, run before any old page is deleted: the text of each new doc equals the text of the
old page's content (the same chrome dropped, read by the standard library's HTML parser), every
link is a tab of the site or an outside address, and every image is a file on disk.
"""
import os
import re
import sys
from html.parser import HTMLParser

CAMPAIGN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(CAMPAIGN, "docs")
PORTRAITS = "campaign/assets/portraits/"

# old page (under campaign/) → the doc it becomes, which is also its tab's id
PAGES = [("index.html", "home"), ("setting/index.html", "setting"), ("coterie/index.html", "coterie"),
         ("dramatis-personae/index.html", "people"), ("chronicle/index.html", "chronicle"),
         ("household/index.html", "household")]
TAB_OF = {"index.html": "home", "setting": "setting", "coterie": "coterie", "dramatis-personae": "people",
          "chronicle": "chronicle", "household": "household"}

CHROME = [
    re.compile(r'<nav class="topnav">.*?</nav>\s*', re.S),
    re.compile(r'<p class="crumb">.*?</p>\s*', re.S),
    re.compile(r'<footer class="doc-foot">.*?</footer>\s*', re.S),
    re.compile(r"<script\b.*?</script>\s*", re.S),
]


def body_of(page):
    return re.search(r"<body[^>]*>(.*)</body>", page, re.S).group(1)


def drop_chrome(html):
    for rx in CHROME:
        html = rx.sub("", html)
    return html


def link(href):
    """An old page's link → the tab it names; an outside address stays."""
    if re.match(r"^(https?:|mailto:)", href):
        return href
    path = re.sub(r"^(\.\./)+", "", href)
    if path in ("index.html", ""):
        return "#home"
    top = path.split("/")[0]
    if top in TAB_OF and path.endswith("index.html"):
        return "#" + TAB_OF[top]
    raise SystemExit("move_pages: a link with no tab: %r" % href)


def src(s):
    name = re.sub(r"^(\.\./)+", "", s)
    if "/" in name:
        raise SystemExit("move_pages: an image outside the site root: %r" % s)
    return PORTRAITS + name


def rewrite(html):
    html = re.sub(r'href="([^"]*)"', lambda m: 'href="%s"' % link(m.group(1)), html)
    html = re.sub(r'src="([^"]*)"', lambda m: 'src="%s"' % src(m.group(1)), html)
    return html


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


def prove(plant=False):
    bad = []
    root = os.path.dirname(CAMPAIGN)
    for old, doc in PAGES:
        page = open(os.path.join(CAMPAIGN, old), encoding="utf-8").read()
        want = text_of(drop_chrome(body_of(page)))
        new = open(os.path.join(DOCS, doc + ".html"), encoding="utf-8").read()
        if plant and doc == "chronicle":
            new = new.replace("Brother Larkin", "Brother Larkins", 1)
        got = text_of(new)
        if got != want:
            i = next((k for k in range(min(len(got), len(want))) if got[k] != want[k]), min(len(got), len(want)))
            bad.append("%s: text differs from %s at %d: …%s… vs …%s…" % (doc, old, i, got[i - 30:i + 30], want[i - 30:i + 30]))
        for h in re.findall(r'href="([^"]*)"', new):
            if not (re.match(r"^https?:", h) or h[1:] in TAB_OF.values()):
                bad.append("%s: link %r is no tab" % (doc, h))
        for s in re.findall(r'src="([^"]*)"', new):
            if not os.path.isfile(os.path.join(root, s)):
                bad.append("%s: image %r is not on disk" % (doc, s))
        print("  %-10s %6d characters of text, identical: %s; %d links, %d images" % (
            doc, len(got), got == want, len(re.findall(r'href="', new)), len(re.findall(r'src="', new))))
    return bad


def move():
    os.makedirs(DOCS, exist_ok=True)
    for old, doc in PAGES:
        page = open(os.path.join(CAMPAIGN, old), encoding="utf-8").read()
        styles = re.findall(r"<style>(.*?)</style>", re.search(r"<head>(.*?)</head>", page, re.S).group(1), re.S)
        if styles:
            with open(os.path.join(DOCS, doc + ".css"), "w", encoding="utf-8") as fh:
                fh.write("/* moved from campaign/%s's <style> (campaign/build/move_pages.py) */\n" % old)
                fh.write("\n".join(s.strip("\n") for s in styles) + "\n")
        with open(os.path.join(DOCS, doc + ".html"), "w", encoding="utf-8") as fh:
            fh.write(rewrite(drop_chrome(body_of(page))).strip() + "\n")


def main():
    plant = "--plant" in sys.argv
    if not plant:
        move()
    bad = prove(plant)
    for b in bad:
        print("  FAIL " + b)
    print("move_pages: %s" % ("proof FAILED (%d)" % len(bad) if bad else "every page's text identical, every link a tab, every image on disk"))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
