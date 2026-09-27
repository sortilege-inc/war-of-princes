#!/usr/bin/env python3
"""
build_seed.py — the campaign's first pack (campaign/pack/seed.json): what a fresh table opens with.

    python3 campaign/build/build_seed.py

engine/state.js fills a campaign from it only where the campaign has never had a thing — a whole
key, a party member by id, a field — so a table already in play is never overwritten, and a member
the table removed is not re-added.

  party       Tomisława and her household, each from its character file (campaign/characters/),
              every one of the household in her retinue (retinueOf), so whoever claims her plays
              them all (owner, 2026-09-27: "support the entire household as playable for
              Tomisława's player"). Piers is not seated: the Chronicle's Session Four ends his life;
              his file stays. The rest of the coterie - Méabh, Eustace, Oscar - are seated by name,
              as Cainites with their Roads unrecorded, until their players' sheets arrive.
  loresheets  the loresheets a character here takes a level of: Blood Sigils' Veins of the Earth
              (Tomisława's Seeking a Vein).
  creation    { roads: true } - this chronicle's characters are made on Summoned Stories' Road System.

There is no GM material: the owner plays in this chronicle and does not run it.
"""
import json
import os
import sys

CAMPAIGN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHARS = os.path.join(CAMPAIGN, "characters")
OUT = os.path.join(CAMPAIGN, "pack", "seed.json")

HEAD = "tomislawa"
ORDER = ["tomislawa", "graf", "kuncze", "bartusz", "andrzej", "przeclaw", "tomasz", "milosz", "elzbieta",
         "bronislawa", "bogdan", "dobrawa", "wojtek"]
NOT_SEATED = {"piers": "died in the hunt (the Chronicle, Session Four)"}
# the coterie's other three, by the names the site gives them (campaign/docs/coterie.html)
COTERIE = [("meabh", "Méabh"), ("eustace", "Eustace"), ("oscar", "Oscar")]
LORESHEETS = ["#vcv4aUgMxiEpOxPpvS90JC0"]      # Blood Sigils: Veins of the Earth
CAINITE = "#vssCainite0000000001"


def main():
    files = {f[: -len(".vtm5e-character.json")]: json.load(open(os.path.join(CHARS, f), encoding="utf-8"))
             for f in os.listdir(CHARS) if f.endswith(".vtm5e-character.json")}
    missing = sorted(set(files) - set(ORDER) - set(NOT_SEATED))
    if missing:
        raise SystemExit("build_seed: character files neither seated nor excused: %s" % ", ".join(missing))
    party = []
    for key in ORDER:
        f = files[key]
        m = {"id": "wop-" + key, "templateId": f["templateId"], "name": f["name"],
             "source": {"kind": "file", "name": "campaign/characters/%s.vtm5e-character.json" % key},
             "character": f["values"], "live": f.get("live") or {}, "notes": ""}
        if key != HEAD:
            m["retinueOf"] = "wop-" + HEAD
        party.append(m)
    for key, name in COTERIE:
        party.append({"id": "wop-" + key, "templateId": CAINITE, "name": name, "source": {"kind": "table"},
                      "character": {"Name": name, "Chronicle": "War of Princes", "Road": "", "Road Rating": 0,
                                    "Notes": "Sheet not yet recorded."},
                      "live": {}, "notes": ""})
    pack = {"kind": "sortilege-vtt-campaign", "version": 1, "party": party,
            "loresheets": LORESHEETS, "creation": {"blackHand": False, "roads": True}}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(pack, fh, ensure_ascii=False, indent=1)
        fh.write("\n")
    print("build_seed: %d party members (%d in Tomisława's retinue; not seated: %s), %d loresheet(s), Roads allowed → campaign/pack/seed.json"
          % (len(party), sum(1 for m in party if m.get("retinueOf")), ", ".join("%s — %s" % kv for kv in NOT_SEATED.items()), len(LORESHEETS)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
