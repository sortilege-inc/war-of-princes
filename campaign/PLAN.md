# War of Princes × sortilege-vtt-vtm5e — plan and decision log

A *Vampire: the Dark Ages* chronicle run on V5 — London, 1242, under Mithras — in which the owner
plays **Tomisława z Białowieży** (Tzimisce koldun) and her household. The Storyteller's own rules
are *Summoned Stories* (a Road system in Humanity's place, and a creation brief), on the
third-party shelf. Built as an **instance** of `sortilege-vtt-vtm5e`, after
[Blood & Other Drugs](../../../2025-2026%20Blood%20%26%20Other%20Drugs/blood-and-other-drugs) and
[Fall of London](../../../2023-2024%20Fall%20of%20London/fall-of-london-2023). Process:
`~/Sortilege/VTT/INSTANCES.md`.

Status words: **PROPOSED** (awaiting the owner), **(owner)** decided, **landed** built and proven.

## What was on disk (read 2026-09-27)

| Input | State |
|---|---|
| `sortilege-inc/war-of-princes` | **PUBLIC**, Pages from `main` at warofprinces.sortilege.online: a hand-built static site (Setting, Coterie, Dramatis Personae, Chronicle Sessions 0–4, Household with a localStorage tracker layer) |
| The household page | Tomisława, the Graf, four allies, eight herd — stat blocks, powers and Merit/Flaw text written in the page's own words (tooltips, summaries) |
| Tomisława's PDF sheet | `../war-of-princes-support/archive/reference/pcs/` — a filled form; names its player, so never in the repo |
| The homebrew | `titterpig-dsl-vtm5e-3rdparty/summoned-stories/0.5` — the Road System and the creation brief, generated and gated; **excluded** from the VTT's shelf until now |
| The corpus | no sheet type for a ghoul or a mortal (only `ACTOR "Kindred"`, and The Black Hand's Sabbat Kindred) |
| The VTT | one character per player (the Worker's claim table: one token → one member) |

## Owner decisions (2026-09-27)

- **O1 — Mortal and Ghoul in the BASE.** `ACTOR "Mortal"` and `ACTOR "Ghoul"`, from the Companion Part III, declared in the official corpus so every instance can seat retainers and ghouls.
- **O2 — Summoned Stories shelved upstream, opt-in.** On the third-party shelf like The Black Hand: a player opts in on the creator, a table allows it (`creation.roads`).
- **O3 — The household page is the record** where it and Tomisława's PDF disagree.
- **O4 — Archery and Riding relabelled in this campaign** (a house-rule `MODIFY`), Firearms and Drive underneath.
- **O5 — The whole household is playable by Tomisława's player.**
- **O6 — The rules text on the old site is assumed wrong**: replaced by the books'.

## Milestones

| # | Where | What | Proof |
|---|---|---|---|
| **U1** | `titterpig-dsl-vtm5e` | BASE 0.5.8: `ACTOR "Mortal"`, `ACTOR "Ghoul"` (EXTENDS Mortal + Domitor + Disciplines) | **landed** `938c9bc` (local). `gates.sh` → ALL GATES PASS (validator 328 files 0/0; 2,868 reference sites 0/0; every coverage manifest PASS) |
| **U2** | `titterpig-dsl-vtm5e-3rdparty` | Summoned Stories' `ACTOR "Cainite"` (hand-authored): the Kindred + `^"Road"` + `^"Road Rating"` | **landed** `d85a2ba` (local). `gates.sh` → ALL GATES PASS |
| **U3** | `sortilege-vtt-vtm5e` | Five character kinds on the sheet; Summoned Stories shelved; the creator's Road option and the table's switch; **retinues** (`retinueOf`, `setPartyRetinue`, `Ops.permits` asks for the retinue); a trait relabel read from a campaign `MODIFY` (`^"Label"`); a power's bracketed note resolves by the book's name | **landed** `26a03ec`, `37f70a6`, `f43aa69` (local; its PLAN.md decisions 40–41). `build.sh` OK (47 books, 15,063 entities, `check_shape` 52 — the new four proven by a planted fault). Node: 7 permission cases. Browser, two origins: a player claiming a Cainite gets its ghoul and mortal as tabs; the ghoul's Health mark and roll (0 Hunger dice) reach the Storyteller; the same player's change to someone else's character is refused by the room; the creator makes a Cainite (Road Rating 7 from the brief, no Humanity) |
| **M1** | here | The fork: `git mv` into `campaign/`; merge upstream with unrelated histories; the boundary | **landed** `da76ea5` (54 files, all `R100`, 0 insertions/deletions), `e3ffe63` (merge — no collisions), `bfed54c` (boundary). **Proven by making it fail** in a throwaway clone: a fake upstream change to `engine/config.js` and `index.html` — without the driver `CONFLICT (content): Merge conflict in engine/config.js`; with it, title stays *War of Princes*, `index.html` takes the change |
| **M2** | here | The house rule and the household | **landed** `42224bd`. Layer: `build_layer` OK — 10 strings 0/0, 2 corrections, 4 references resolve; the DSL validator 0/0 with both corpora. Household: `convert_household.py` → 14 files (Tomisława as Cainite, the Graf as Ghoul, 12 Mortals), rerun byte-identical; `check_household.py` (a tree reading, no shared code) **781 checks, all match**; `--plant` **10 of 10 faults caught** |
| **M3** | here | The old pages as site tabs; their rules text out | **landed** `23ad944`, `507f6d0`. `move_pages.py`: 6 pages, **text identical**, every link a tab, every image on disk; a planted change caught — run before the old pages were deleted. `build_docs.py` scopes envoy.css and the pages' own styles. `household_rules_out.py`: 27 blocks → mounts, the text outside them identical (whitespace aside), **0** tooltips / power summaries / stat or merit lines left. Browser: every tab renders, 0 broken images, the chronicle's contents rebuilt (52 links), the household's panels route (`#household/graf`), all 27 mounts filled from the files and the books, Archery/Riding on the Graf, no horizontal scroll at 375px, 0 app console errors |
| **M4** | here | The first pack; the old tracker state carried over | **landed** (this commit). `build_seed.py`: 16 members (12 in Tomisława's retinue), Veins of the Earth available, Roads allowed. Browser (8751 + Worker 8803, two origins): the seed fills a fresh table once past the veil; the claim screen reads "with a retinue of 12"; claiming Tomisława shows all 13 as tabs; a planted `wop.table.v1` carries over on claim (her Health 2 Superficial, Willpower 1 Aggravated, Hunger 3, a Stain, XP 12/5, her note; the Graf's Health) and the Storyteller sees it; Kuncze's empty marks are not sent; it records itself and does not run twice |
| **M5** | here | Deploy (owner: "push and deploy") | **landed 2026-09-27.** Corpora `938c9bc` / `d85a2ba` and the VTT `f43aa69` pushed (each remote = local; nobody else had pushed). Worker `war-of-princes` deployed (version 5d1dc94a) → https://war-of-princes.sortilege.workers.dev; `curl` POST /session: warofprinces.sortilege.online 200, sortilege-inc.github.io 200, a foreign origin 403. `main` fast-forwarded to `vtt-instance` and pushed; `.nojekyll` added |

## Deploy — done 2026-09-27 (M5); kept as the order to repeat

In order:

1. `titterpig-dsl-vtm5e` (`938c9bc`) and `titterpig-dsl-vtm5e-3rdparty` (`d85a2ba`): `git pull --rebase --autostash origin main && git push`.
2. `sortilege-vtt-vtm5e` (`26a03ec`, `37f70a6`, `f43aa69`): push. **Its engine ops changed** (retinues): each sibling instance's Worker must be redeployed when that instance next merges upstream.
3. Here: `git remote set-url upstream git@github.com:sortilege-inc/sortilege-vtt-vtm5e.git && git fetch upstream` (the merges were made from the local clone), then fast-forward `main` to `vtt-instance` and push. **This is the point of publication of the VTT's `data/`** (the books) at warofprinces.sortilege.online, as the siblings already publish them. Add `.nojekyll` (B&OD: Jekyll dies on docs' front matter).
4. `cd worker && npx wrangler deploy` (Worker `war-of-princes`, ALLOWED_ORIGIN the custom domain and github.io); put its URL in `engine/config.js worker.deployed`.

## Open

- **Méabh, Eustace, Oscar** are seated by name with their Roads unrecorded, until their sheets arrive.
- **The Setting page** is the old site's retelling of the brief, not the brief's own words (which are on the shelf). Left as prose; it could be rebuilt from the brief verbatim.
- **Upstream gaps for mortals and ghouls:** the creator makes Kindred kinds only; Advancement prices by the Kindred's costs (a ghoul's level-1 powers at 10 XP each are not priced).
- **The chronicle** is now `campaign/docs/chronicle.html`: a new session is written there, as before, and `bash campaign/build/build.sh` rebuilds the tabs.

## Decision log

| When | Kind | Decision | Why |
|---|---|---|---|
| 2026-09-27 | owner | O1–O6 | asked with the legwork and a recommendation; each answered |
| 2026-09-27 | autonomous, naming | The Road character is `ACTOR "Cainite"` | The brief's own word for its vampires; the Black Hand precedent names an ACTOR for what its book calls the character |
| 2026-09-27 | autonomous, method | A Cainite's Humanity and Touchstones & Convictions are left off its sheet (named constant, citing the brief), not removed from the ACTOR | EXTENDS cannot remove a field; the brief says both are replaced / not used |
| 2026-09-27 | autonomous, method | A character's kind is read from the field that marks it (Road Rating, Path of Enlightenment, Domitor; a Mortal is Attributes with no Clan and no Blood Potency) | The existing Sabbat rule works that way; a file needs no extra marker to be read |
| 2026-09-27 | autonomous, method | **Retinue**, not multi-claim: a member names its head (`retinueOf`); the permission rule is asked for the claimed character, then its retinue | No op had to change; the Worker's one-claim table stands; the head's player keeps one claim |
| 2026-09-27 | autonomous, method | The fork merged from the **local** VTT clone | Its three upstream commits are not pushed (push only when asked) |
| 2026-09-27 | autonomous, scope | The old 0.4 Road/chargen copies and `rules/` removed from the repo | The gated corpus (Summoned Stories 0.5) replaces them; identical copies stay in `../war-of-princes-support/dsl/` |
| 2026-09-27 | autonomous, fidelity | **Names are the books'**: Language → Linguistics (the language in brackets); *Mawla (Secret Master)* (a Flaw) → The Gehenna War's **Secret Master**; *Twice-Cursed / Weak-Willed / Risk-Taker / Eat Food* written as the books spell them; the page's bracketed restatements of a rule (*Herd (7–15 vessels…)*, *Stake Bait (staking = Final Death…)*) dropped | The corpus is canon; the page's own summary of a rule is the rules text O6 retires |
| 2026-09-27 | autonomous, fidelity | **Koldunic Sorcery (Earth / Water / Air)**: the book's one Level 1 power, taken three times, each with its element | *Blood Sigils*: "A koldun character can command multiple elements only by taking the Koldunic Sorcery power multiple times." The old page had them as Levels 1–3 |
| 2026-09-27 | autonomous, fidelity | Her Predator type **Montero**, from her PDF sheet ("Łowy (Montero)"; the page has none); "Łowy" kept in her Notes | O3 makes the page the record where the two disagree; here only the sheet speaks |
| 2026-09-27 | autonomous, fidelity | Her Clan Bane is the Players Guide's **Tzimisce Bane and Cursed Courtesy**, as printed | She is Twice-cursed; the creator fills the field from the book the same way |
| 2026-09-27 | autonomous, method | The household page kept **byte for byte** as `campaign/source/household.html`; the character files are converted and checked from it | INSTANCES: keep the original records in `source/` and check every version against them |
| 2026-09-27 | autonomous, method | The old pages **moved, not rewritten**, then the household's rules text taken out in a separate, proven step | Each step has its own proof; the move's text identity would mean nothing if the edit were folded in |
| 2026-09-27 | autonomous, scope | **Piers is not seated** in the party (his file stays) | The Chronicle's Session Four ends his life |
| 2026-09-27 | autonomous, scope | **No GM material seeded** | The owner plays in this chronicle; its Storyteller's prep is not in any source here |
| 2026-09-27 | **owner ruling** | **The Graf's Health and Willpower by the rule** (6 and 6: Stamina 3 + 3, Composure 4 + Resolve 2), not the page's 5 and 5; **Humanity 7** for the ghoul and the mortals stands; the rest of the open list is fine. `convert_household.py` derives them, `check_household.py` expects the rule (781 all match; the page's 5 planted back is caught, 11/11) | The owner's answers |
| 2026-09-27 | **owner request** | **The creator makes mortals and ghouls** | Built upstream (sortilege-vtt-vtm5e), pulled here |
| 2026-09-27 | autonomous, method | The old tracker state (`wop.table.v1`) is carried over **on claim, once**, into the claimed character and its retinue only | INSTANCES step 4; it lives at the same origin as the deployed site |
