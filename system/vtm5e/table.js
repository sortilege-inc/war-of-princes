// system/vtm5e/table.js — what Vampire tells the table (engine/vtt.js) and the player's page
// (engine/play.js): which scenes are in play, what can stand on the table, what a token's
// state reads as, and how a character file becomes a party member. The engine never asks the
// corpus directly.
//
// The module is the Storyteller's own chronicle (system/vtm5e/ops.js `scenes`): no official
// book ships an .arc. It ships no maps: a map is whatever image the Storyteller sets on a
// scene, and who is in a scene is who the Storyteller has put there from the books.
window.VttSystem = (function () {
  const D = window.VtmData;
  const Sheet = window.VtmSheet;
  const State = window.VttState;
  const S = () => State.state;

  const MODULE = 'chronicle';

  const scenes = () => (S().scenes || []).map((sc) => ({ id: sc.id, name: sc.name, phase: null, moduleId: MODULE }));
  const scene = (id) => (S().scenes || []).find((sc) => sc.id === id) || null;

  function currentSceneId() {
    const cur = (S().current || {})[MODULE];
    const all = S().scenes || [];
    return (all.find((s) => s.id === cur) || all[0] || {}).id || null;
  }

  // who is in a scene: records (always in memory) — their book loads when opened
  const cast = (sceneId) => ((scene(sceneId) || {}).cast || []).map((id) => D.record(id)).filter(Boolean);

  const maps = () => [];
  const mapDef = () => null;
  const defaultMapId = (sceneId) => sceneId;
  const legend = () => null;
  const mapAssets = () => [];

  function tokenSources() {
    const groups = [];
    const party = (S().party || []).map((m) => ({ id: 'tk-' + m.id, label: m.name, kind: 'party', owner: m.id, ref: m.id }));
    if (party.length) groups.push({ label: 'The coterie', items: party });
    const sc = scene(currentSceneId());
    const here = sc ? cast(sc.id).map((r) => ({ label: D.recordLabel(r), kind: 'cast', ref: r.id })) : [];
    if (here.length) groups.push({ label: sc.name, items: here });
    return groups;
  }

  const COLORS = { party: '#c8102e', cast: '#ece4d6', marker: '#7a6f6d' };

  // the rings a token may wear (the table's options menu) and a dozen generic faces for an NPC with
  // no art (assets/tokens/npc/) — ported from sortilege-vtt-teeth (2026-10-09)
  const PALETTE = [
    { name: 'Green', color: '#4f6b3a' }, { name: 'Red', color: '#8f1d22' }, { name: 'Black', color: '#1a1613' }, { name: 'Grey', color: '#6b6154' },
    { name: 'Ochre', color: '#b9842a' }, { name: 'Blue', color: '#2f4f6b' }, { name: 'Violet', color: '#5b3a6b' }, { name: 'Teal', color: '#2f6b5e' }, { name: 'Rust', color: '#a1481e' }, { name: 'Bone', color: '#efe6d3' },
  ];
  function tokenPalette() {
    return PALETTE.map((c) => Object.assign({}, c));
  }
  const ICONS = ['person', 'hood', 'helm', 'crown', 'mitre', 'hat', 'skull', 'wolf', 'crow', 'boar', 'hound', 'purse'];
  function tokenIcons() {
    return ICONS.map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1), image: 'assets/tokens/npc/' + id + '.svg' }));
  }
  const tokenColor = (t) => COLORS[t.kind] || COLORS.marker;
  // a token's word: a coterie member's Hunger; a Storyteller character's printed line
  function tokenStatus(t) {
    if (t.kind === 'party') {
      const m = (S().party || []).find((x) => x.id === t.owner);
      return m ? { text: 'Hunger ' + Sheet.hunger(m), pips: [] } : null;
    }
    const r = t.kind === 'cast' && t.ref ? D.record(t.ref) : null;
    if (!r) return null;
    const f = r.fields || {};
    return { text: f['Standard Dice Pools'] || [f.Clan, f['Blood Potency'] != null ? 'BP ' + f['Blood Potency'] : null].filter(Boolean).join(' · ') || '', pips: [] };
  }

  function selectToken(t) {
    if (t.kind === 'party') window.VttBus.emit('select', { kind: 'party', id: t.owner });
    else if (t.kind === 'cast' && t.ref) window.VttBus.emit('select', { kind: 'entity', id: t.ref });
  }
  const tokenMenu = () => null;

  const readCharacter = (obj, fileName) => Sheet.readMember(obj, fileName);
  const downloadCharacter = (m) => Sheet.downloadMember(m);
  // the sheet reads the BASE, the core (its groupings) and the Errata (the Blood Potency
  // chart); until they are in memory the panel says so and fills in when they arrive
  // (a Sabbat character's also reads The Black Hand, which declares it — Sheet.booksFor)
  function liveSheet(m, opts) {
    const books = Sheet.booksFor(Sheet.values(m));
    if (books.every((b) => D.loaded(b))) return Sheet.live(m, opts);
    const box = window.VttRender.el('div', { class: 'muted' }, ['Opening the sheet…']);
    D.ready(books).then(() => { if (box.parentNode) box.replaceWith(Sheet.live(m, opts)); });
    return box;
  }
  const memberSubtitle = (m) => Sheet.memberSentence(m);
  // Making a character on a player's page (the creator, system/vtm5e/creator.js): The Black
  // Hand's walk is offered where the Storyteller turned it on (creation.blackHand); done(member)
  // takes the character to the table as a loaded file would.
  // what a player is told when a character arrives: one made with The Black Hand needs the table to allow it
  function memberNotice(m) {
    const v = Sheet.values(m);
    const out = [];
    if (Sheet.isSabbat(v) && !((S() || {}).creation || {}).blackHand) out.push(m.name + ' is made with The Black Hand’s options: playable here once your Storyteller allows them.');
    if (Sheet.kindOf(v) === 'cainite' && !((S() || {}).creation || {}).roads) out.push(m.name + ' is made with Summoned Stories’ Road System: playable here once your Storyteller allows it.');
    const ls = Sheet.unavailableLoresheets(v);
    if (ls.length) out.push(m.name + ' draws on ' + ls.join(', ') + ': playable here once your Storyteller makes ' + (ls.length === 1 ? 'that loresheet' : 'those loresheets') + ' available.');
    return out.join(' ') || null;
  }
  function makeCharacter(container, done, o) {
    if (!window.VtmCreator) return false;
    window.VtmCreator.render(container, [], null, {
      where: 'play', joined: !!(o && o.joined),
      blackHand: !!((S() || {}).creation || {}).blackHand,
      roads: !!((S() || {}).creation || {}).roads,
      done: (v) => { try { done(Sheet.readMember(Sheet.fileOf(v, { hunger: +v.Hunger || 0 }), null)); } catch (e) { window.alert(e.message); } },
    });
    return true;
  }

  // an entity or record by id, for the Storyteller's notes (engine/gm-text.js "About")
  const byId = (id) => { const r = D.record(id); if (r) return { id: r.id, name: r.name }; const e = D.entity(id); return e ? { id: e.id, name: e.name } : null; };

  return {
    byId,
    MODULE, scenes, scene, currentSceneId, cast, maps, mapDef, defaultMapId, legend, mapAssets,
    tokenSources, tokenColor, tokenPalette, tokenIcons, tokenStatus, selectToken, tokenMenu,
    liveSheet, readCharacter, downloadCharacter, memberSubtitle, makeCharacter, memberNotice,
  };
})();
