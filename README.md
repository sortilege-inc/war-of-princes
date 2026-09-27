# War of Princes

A *Vampire: the Dark Ages* chronicle run on V5 — London, 1242, under the domain of Mithras — and
its table: the campaign's site (the setting, the coterie, the dramatis personae, the chronicle,
the household of Białowieży) inside the VtM5e VTT, with the household playable by
Tomisława's player.

An **instance** of [`sortilege-vtt-vtm5e`](https://github.com/sortilege-inc/sortilege-vtt-vtm5e):
the VTT owns the root; this campaign owns `campaign/` and the per-deployment root files
(`engine/config.js`, `worker/wrangler.jsonc`, `README.md`, `CNAME`, `.gitignore`,
`.claude/launch.json`, `.gitattributes`). Plan and decision log: [`campaign/PLAN.md`](campaign/PLAN.md).

Pull the VTT with a merge, never a rebase:

```bash
git config merge.ours.driver true   # once per clone
git fetch upstream && git merge upstream/main
```
