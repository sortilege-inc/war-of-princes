#!/usr/bin/env python3
"""
build_art.py — the owner's Vampire art pack (~/Downloads/Vampire Symbols, ~/Downloads/Vampire
Logos, supplied 2026-09-23) → assets/art/, reproducibly.

Every mark in the pack (the clan and sect symbols, the dice faces, the logos) is a one-colour
design, black on white or on transparency. They are written as ALPHA MASKS — white ink, the
design in the alpha channel — so the page can tint one file in any colour with CSS
`mask-image` (bone for a regular die, blood for a Hunger die, red for a clan heading) and
nothing is baked in twice. The Discipline sigils are two-tone designs (a white frame round a
red lozenge) and are kept in colour.

    ink   = 1 - min(r, g, b) / 255      white → 0, black → 1, the red dice → ~0.85
    alpha = source alpha × ink           a transparent ground stays transparent
    alpha = alpha × 255 / max(alpha)     the design's darkest ink is full ink, so the red dice
                                         mask as solid as the black ones

Each image is trimmed to its ink, padded, and scaled so its longer side is at most SIZE px.
assets/art/art.js registers what exists (window.VtmArt) and assets/art/SOURCES.json records
where each file came from (path, pixel size, sha256), so a re-run can be checked.

The map below from a clan's name to a file is this tool's (the pack names its folders by
clan); the names are the book's.

    python3 build/build_art.py [<dir holding "Vampire Symbols" and "Vampire Logos">]
"""
import hashlib
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/Downloads")
OUT = os.path.join(HERE, "assets", "art")
SYM = "Vampire Symbols"

# name → source file (relative to SRC). One symbol per clan: the pack's pictorial mark,
# never its type logo, so every clan reads at the same size.
CLANS = {
    "Banu Haqim": SYM + "/Banu Haqim/BanuHaqim_Geometric.png",
    "Brujah": SYM + "/Brujah/VTM_Brujah_icon_black.png",
    "Caitiff": SYM + "/Caitiff/Caitiff_Symbol.png",
    "Gangrel": SYM + "/Gangrel/Gangrel_New1.png",
    "Giovanni": SYM + "/Giovanni/Giovanni_ModernSymbol_2019.png",
    "Hecata": SYM + "/Hecata/Hecata_Symbol_Modern.png",
    "Lasombra": SYM + "/Lasombra/Lasombra_symbol.png",
    "Malkavian": SYM + "/Malkavian/VTM_Malkavian_icon_black.png",
    "The Ministry": SYM + "/The Ministry/MinistrySymbol.png",
    "Nosferatu": SYM + "/Nosferatu/Nosferatu.png",
    "Ravnos": SYM + "/Ravnos/Ravnos-new_symbol.png",
    "Salubri": SYM + "/Salubri/Salubri_Symbol.png",
    "Thin-blood": SYM + "/Thinblood/Thinblood1.png",
    "Toreador": SYM + "/Toreador/Toreador_New1.png",
    "Tremere": SYM + "/Tremere/VTM_Tremere_icon_black.jpg",
    "Tzimisce": SYM + "/Tzimisce/Tzimisce_Symbol.png",
    "Ventrue": SYM + "/Ventrue/Ventrue.png",
    # bloodlines the pack carries
    "Cappadocian": SYM + "/Cappadocian/Cappadocian_Symbol.png",
    "Harbingers of Skulls": SYM + "/Harbingers of Skulls/Harbingers_of_Skulls_Symbol_1.png",
    "Lamia": SYM + "/Lamia/Lamia_Symbol_1.png",
    "Nagaraja": SYM + "/Nagaraja/Nagaraja_Symbol_1.png",
}
SECTS = {
    "Camarilla": SYM + "/Camarilla/VTM_Camarilla_ankh_black.png",
    "Anarch": SYM + "/Anarch/AnachAnkh1.png",
    "Sabbat": SYM + "/Sabbat/Sabbat.png",
    "Society of St. Leopold": SYM + "/Society of St. Leopold/Leopold Sword.png",
}
# the six faces the pack draws; which roll result each stands for is decided in
# system/vtm5e/dice.js against the rules text, not here
DICE = {
    "success": SYM + "/Vampire Dice Symbols/Success.png",
    "critical": SYM + "/Vampire Dice Symbols/Crit.png",
    "messy-critical": SYM + "/Vampire Dice Symbols/MessyCrit.png",
    "bestial-failure": SYM + "/Vampire Dice Symbols/BestialFail.png",
    "teeth": SYM + "/Vampire Dice Symbols/Teeth.png",
    "skull-teeth": SYM + "/Vampire Dice Symbols/SkullTeeth.png",
}
LOGOS = {
    "vampire": "Vampire Logos/VampireLogoNoAnkh2.png",
    "vampire-long": "Vampire Logos/VampireLongLogo.png",
    "ankh": SYM + "/Vampire Ankh/VtM_ankh.png",
}
# colour, not masks: the pack's Discipline lozenges. "Thaumaturgy" is the pack's file name
# for the lozenge V5 prints as Blood Sorcery.
DISCIPLINES = {
    "Animalism": SYM + "/Vampire Discipline Symbols/Animalism-rombo.png",
    "Auspex": SYM + "/Vampire Discipline Symbols/Auspex-rombo.png",
    "Blood Sorcery": SYM + "/Vampire Discipline Symbols/Thaumaturgy-rombo.png",
    "Celerity": SYM + "/Vampire Discipline Symbols/Celerity-rombo.png",
    "Dominate": SYM + "/Vampire Discipline Symbols/Dominate-rombo.png",
    "Fortitude": SYM + "/Vampire Discipline Symbols/Fortitude-rombo.png",
    "Obfuscate": SYM + "/Vampire Discipline Symbols/Obfuscate-rombo.png",
    "Oblivion": SYM + "/Vampire Discipline Symbols/Oblivion-rombo.png",
    "Potence": SYM + "/Vampire Discipline Symbols/Potence-rombo.png",
    "Presence": SYM + "/Vampire Discipline Symbols/Presence-rombo.png",
    "Protean": SYM + "/Vampire Discipline Symbols/Protean-rombo.png",
    "Thin-blood Alchemy": SYM + "/Vampire Discipline Symbols/Thinblood_alchemy.png",
}


def slug(name):
    return "".join(c if c.isalnum() else "-" for c in name.lower()).strip("-").replace("--", "-")


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        h.update(fh.read())
    return h.hexdigest()


def trim(im, pad_frac=0.04):
    box = im.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    if box:
        im = im.crop(box)
    pad = int(max(im.size) * pad_frac)
    out = Image.new("RGBA", (im.size[0] + 2 * pad, im.size[1] + 2 * pad), (255, 255, 255, 0))
    out.paste(im, (pad, pad))
    return out


def fit(im, size):
    w, h = im.size
    k = min(1.0, size / float(max(w, h)))
    return im.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS) if k < 1 else im


def mask(path, size):
    a = np.asarray(Image.open(path).convert("RGBA")).astype(np.float32)
    ink = (255.0 - a[:, :, :3].min(axis=2)) / 255.0
    al = a[:, :, 3] * ink
    top = al.max()
    if top > 0:
        al = al * (255.0 / top)                           # the design's darkest ink is full ink
    al = np.rint(al)
    al[al <= 10] = 0                                      # JPEG ground noise → clear
    out = np.empty(a.shape, dtype=np.uint8)
    out[:, :, :3] = 255
    out[:, :, 3] = al.astype(np.uint8)
    return fit(trim(Image.fromarray(out, "RGBA")), size)


def colour(path, size):
    return fit(trim(Image.open(path).convert("RGBA"), 0.02), size)


def main():
    manifest, register = {}, {"clans": {}, "sects": {}, "dice": {}, "logos": {}, "disciplines": {}}
    groups = [("clans", CLANS, mask, 320), ("sects", SECTS, mask, 320), ("dice", DICE, mask, 160),
              ("logos", LOGOS, mask, 1200), ("disciplines", DISCIPLINES, colour, 192)]
    for group, table, fn, size in groups:
        os.makedirs(os.path.join(OUT, group), exist_ok=True)
        for name, rel in table.items():
            src = os.path.join(SRC, rel)
            if not os.path.exists(src):
                raise SystemExit("build_art: missing %s" % src)
            im = fn(src, size)
            dest = "assets/art/%s/%s.webp" % (group, slug(name))
            im.save(os.path.join(HERE, dest), "WEBP", quality=90, method=6)
            register[group][name] = {"src": dest, "w": im.size[0], "h": im.size[1]}
            manifest[dest] = {"from": rel, "size": list(Image.open(src).size), "sha256": sha(src),
                              "treatment": "alpha mask (white ink)" if fn is mask else "colour"}
    with open(os.path.join(OUT, "SOURCES.json"), "w", encoding="utf-8") as fh:
        json.dump({"pack": "owner-supplied Vampire: The Masquerade art pack, ~/Downloads, 2026-09-23",
                   "files": manifest}, fh, indent=1, ensure_ascii=False, sort_keys=True)
        fh.write("\n")
    with open(os.path.join(OUT, "art.js"), "w", encoding="utf-8") as fh:
        fh.write("/* Generated by build/build_art.py — do not edit by hand. */\n")
        fh.write("window.VtmArt = %s;\n" % json.dumps(register, ensure_ascii=False, sort_keys=True, indent=1))
    total = sum(os.path.getsize(os.path.join(HERE, k)) for k in manifest)
    print("build_art: %d files, %d KB — %s" % (len(manifest), total // 1024,
          ", ".join("%s %d" % (g, len(register[g])) for g in register)))


if __name__ == "__main__":
    main()
