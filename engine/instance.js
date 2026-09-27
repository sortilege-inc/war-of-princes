// engine/instance.js — what an instance adds, loaded at named points in the upstream pages.
//
// An instance is a campaign repo that is a fork of this VTT (see PLAN.md, "Instances"). It
// never edits an upstream file; it declares its own scripts in engine/config.js, which it owns:
//
//   instance: {
//     styles: ['campaign/site/campaign.css'],          // written once, at the first stage
//     stages: {
//       data:  ['campaign/data/index.js'],             // after data/records.js — every page
//       site:  ['campaign/site/site.js'],              // after the system's site tabs, before engine/site.js
//       gm:    ['campaign/site/gm.js'],                // after the system's panels, before engine/app.js
//       table: [], play: [], maps: [],                 // before the table's, the player's and the maps' boot
//     },
//   }
//
// Each upstream page carries <script src="engine/instance.js" data-stage="…"> at those points.
// The scripts are written into the page where the tag stands, so they run in order, before
// the next upstream script, exactly as if the page listed them: a campaign book merged at
// `data` is already in the index when the system reads it, and a tab pushed onto
// window.VttSiteTabs at `site` is there when the site first renders. Nothing waits and nothing
// re-renders. Upstream itself declares no instance, and every tag is then a no-op.
(function () {
  const me = document.currentScript;
  const stage = me && me.getAttribute('data-stage');
  const inst = (window.VttConfig || {}).instance || null;
  if (!inst || !stage) return;
  const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  if (!window.__vttInstanceStyled) {
    window.__vttInstanceStyled = true;
    (inst.styles || []).forEach((href) => document.write('<link rel="stylesheet" href="' + attr(href) + '">'));
  }
  ((inst.stages || {})[stage] || []).forEach((src) => document.write('<script src="' + attr(src) + '"><\/script>'));
})();
