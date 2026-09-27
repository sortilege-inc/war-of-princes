// system/vtm5e/ops.js — the ops Vampire adds to the engine's, registered with the same call
// and shared the same way (engine/ops.js). Loaded by the browser after engine/ops.js, and
// imported by the Worker beside it, so the room applies the very same functions. Ids travel
// in the args; applying an op is deterministic everywhere, and the room never rolls.
//
//   scenes  [ { id, name, cast:[entityIds] } ]   the Storyteller's own scenes, in play order —
//                                                no official book ships an .arc (PLAN.md D2
//                                                would bring The Black Hand's two), so a
//                                                scene is whatever the Storyteller writes;
//                                                done, notes and the current one use the
//                                                engine's scene ops under moduleId 'chronicle'
//   gmNotes, arc, threads                        the Storyteller's own pack state (setGmNotes,
//                                                setArc, setThreads — system/vtm5e/gm-panes.js),
//                                                never shared
//   party[].versions                             archived copies of a character
//                                                (archivePartyVersion, the player's own)
//   loresheets [ids]                              the loresheets the Storyteller made available
//                                                (setLoresheets; shared, the Storyteller's to set)
//   creation { blackHand, roads }                how the chronicle's characters may be made
//                                                (setCreation; shared, the Storyteller's to set)
//   relmaps [ { id, name, nodes, edges, … } ]    relationship and scene maps (V9, below; shared,
//                                                drawn by everyone, a hidden one the Storyteller's)
//   A party member's live state is the engine's setPartyLive: { hunger } until the corpus
//   declares the character (PLAN.md D1).
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('../../engine/ops.js'));
  else factory(root.VttOps);
})(typeof self !== 'undefined' ? self : this, function (Ops) {
  Ops.shared(['scenes']);

  Ops.register('setScenes', (s, list) => {
    s.scenes = (list || []).slice();
  });
  Ops.register('putScene', (s, scene) => {
    if (!s.scenes) s.scenes = [];
    const i = s.scenes.findIndex((x) => x.id === scene.id);
    if (i === -1) s.scenes.push(scene);
    else s.scenes[i] = Object.assign({}, s.scenes[i], scene);
  });
  Ops.register('removeScene', (s, id) => {
    s.scenes = (s.scenes || []).filter((x) => x.id !== id);
  });
  // who is in a scene: Storyteller characters from the books (records.js ids)
  Ops.register('setSceneCast', (s, sceneId, ids) => {
    const sc = (s.scenes || []).find((x) => x.id === sceneId);
    if (sc) sc.cast = (ids || []).slice();
  });

  // A party member's archived versions (the sheet's version history): a copy of the character
  // and its trackers, appended, never edited. A player may archive their own character.
  Ops.register('archivePartyVersion', (s, id, version) => {
    const m = (s.party || []).find((x) => x.id === id);
    if (!m || !version || !version.id) return;
    if (!m.versions) m.versions = [];
    if (!m.versions.some((x) => x.id === version.id)) m.versions.push(version);
  }, (s, me, a) => a[0] === me);

  // Advancement (system/vtm5e/advance.js): the character as it was kept as a version, the advanced
  // one made current, and the experience it cost — one op, so the room never holds half of it. A
  // player may advance their own character.
  Ops.register('advancePartyMember', (s, id, adv) => {
    const m = (s.party || []).find((x) => x.id === id);
    if (!m || !adv || !adv.character || !adv.version || !adv.version.id) return;
    if (!m.versions) m.versions = [];
    if (!m.versions.some((x) => x.id === adv.version.id)) m.versions.push(adv.version);
    m.character = adv.character;
    if (adv.live) m.live = Object.assign({}, m.live || {}, adv.live);
  }, (s, me, a) => a[0] === me);

  // The loresheets the Storyteller has made available to this chronicle's characters, by
  // loresheet id (records.js kind 'loresheet'). "Availability … explicitly granted by the GM …
  // By default none are" (owner). Shared: a player's sheet offers only these; only the
  // Storyteller may set it.
  Ops.shared(['loresheets']);
  Ops.register('setLoresheets', (s, ids) => { s.loresheets = (ids || []).filter((x) => typeof x === 'string'); });

  // How this chronicle's characters may be made (owner, 2026-09-25): { blackHand } — whether a
  // player may walk The Black Hand's Quick Character Creation (p. 107) and make a Sabbat Kindred
  // instead of the core's summary. Off unless the Storyteller turns it on; shared, because a
  // player's page offers it; only the Storyteller may set it.
  Ops.shared(['creation']);
  // each switch set on its own keeps the others (a table may allow The Black Hand, Summoned Stories' Roads, both)
  Ops.register('setCreation', (s, c) => { const m = Object.assign({}, s.creation || {}, c || {}); s.creation = { blackHand: !!m.blackHand, roads: !!m.roads }; });

  // The conflict the Storyteller has started for the coterie (system/vtm5e/conflict.js): its
  // variant, turn, modules, a one-roll conflict's Difficulty and track. Shared; the Storyteller's.
  Ops.shared(['conflict']);
  Ops.register('setConflict', (s, c) => { s.conflict = c ? JSON.parse(JSON.stringify(c)) : null; });

  // Relationship and scene maps (V9, system/vtm5e/maps.js): the core's Relationship Map, Blood
  // Sigils' Scene Map, a Sabbat Pack Map — people and places, and labelled arrows between them.
  //   relmaps [ { id, name, kind, hidden, nodes:[…], edges:[…], tracks:[…] } ]
  //     node  { id, name, kind (pc|kindred|mortal|place|note|other), clan, path, sect, embrace,
  //             caption, x, y, member (a party id), record (an entity id), struck }
  //     edge  { id, from, to, arrow (to|none), label, fromLabel, toLabel, struck } — the arrow
  //           points from the dominant party to the weaker; none where they are equals (core,
  //           "Arrows and Descriptors"); fromLabel and toLabel are each party's own descriptor
  //     track { id, name, boxes, filled } — Blood Sigils' "Deep Trouble" checkboxes
  // Shared, and drawn by the Storyteller and the players alike (owner, 2026-09-24). A hidden map
  // is the Storyteller's alone ("perhaps on a private version of the scene map", Blood Sigils,
  // Step Six): never in a player's view, and no op on it is forwarded. Only the Storyteller hides,
  // shows or deletes a map; a player may add one, shown.
  Ops.shared(['relmaps']);
  const NODE_KEYS = ['id', 'name', 'kind', 'clan', 'path', 'sect', 'embrace', 'caption', 'x', 'y', 'member', 'record', 'struck'];
  const EDGE_KEYS = ['id', 'from', 'to', 'arrow', 'label', 'fromLabel', 'toLabel', 'struck'];
  const TRACK_KEYS = ['id', 'name', 'boxes', 'filled'];
  const pick = (o, keys) => { const out = {}; keys.forEach((k) => { if (o && o[k] !== undefined) out[k] = o[k]; }); return out; };
  const relmap = (s, id) => (s.relmaps || []).find((m) => m.id === id) || null;
  const cleanMap = (m) => ({ id: m.id, name: String(m.name || 'Map'), kind: m.kind || 'relationship', hidden: !!m.hidden,
    nodes: (m.nodes || []).map((n) => pick(n, NODE_KEYS)), edges: (m.edges || []).map((e) => pick(e, EDGE_KEYS)), tracks: (m.tracks || []).map((t) => pick(t, TRACK_KEYS)) });
  const upsert = (list, item) => { const i = list.findIndex((x) => x.id === item.id); if (i === -1) list.push(item); else list[i] = Object.assign({}, list[i], item); };
  const onShownMap = (s, me, a) => { const m = relmap(s, a[0]); return !!m && !m.hidden; };
  const ifShown = (name) => (s, a) => { const m = relmap(s, a[0]); return m && !m.hidden ? { name, args: a } : null; };
  // a whole map, as players get it: a map made hidden is taken from them, one shown is sent whole
  const wholeForPlayers = (s, id) => { const m = relmap(s, id); return m && !m.hidden ? { name: 'putRelMap', args: [m] } : { name: 'removeRelMap', args: [id] }; };

  Ops.register('putRelMap', (s, map) => {
    if (!map || !map.id) return;
    if (!s.relmaps) s.relmaps = [];
    upsert(s.relmaps, cleanMap(map));
  }, (s, me, a) => !!a[0] && !relmap(s, a[0].id) && !a[0].hidden, (s, a) => wholeForPlayers(s, a[0] && a[0].id));
  Ops.register('setRelMapMeta', (s, id, patch) => {
    const m = relmap(s, id);
    if (m) Object.assign(m, pick(patch, ['name', 'kind', 'hidden']));
  }, null, (s, a) => wholeForPlayers(s, a[0]));
  Ops.register('removeRelMap', (s, id) => { s.relmaps = (s.relmaps || []).filter((m) => m.id !== id); });
  Ops.register('putRelNode', (s, mapId, node) => {
    const m = relmap(s, mapId);
    if (m && node && node.id) upsert(m.nodes, pick(node, NODE_KEYS));
  }, onShownMap, ifShown('putRelNode'));
  // positions after a drag or a layout: [[id, x, y], …]
  Ops.register('moveRelNodes', (s, mapId, moves) => {
    const m = relmap(s, mapId);
    if (!m) return;
    (moves || []).forEach(([id, x, y]) => { const n = m.nodes.find((k) => k.id === id); if (n) { n.x = Math.round(x); n.y = Math.round(y); } });
  }, onShownMap, ifShown('moveRelNodes'));
  Ops.register('removeRelNode', (s, mapId, id) => {
    const m = relmap(s, mapId);
    if (!m) return;
    m.nodes = m.nodes.filter((n) => n.id !== id);
    m.edges = m.edges.filter((e) => e.from !== id && e.to !== id);
  }, onShownMap, ifShown('removeRelNode'));
  Ops.register('putRelEdge', (s, mapId, edge) => {
    const m = relmap(s, mapId);
    if (!m || !edge || !edge.id) return;
    const e = Object.assign({}, m.edges.find((x) => x.id === edge.id) || {}, pick(edge, EDGE_KEYS));
    if (m.nodes.some((n) => n.id === e.from) && m.nodes.some((n) => n.id === e.to)) upsert(m.edges, e);
  }, onShownMap, ifShown('putRelEdge'));
  Ops.register('removeRelEdge', (s, mapId, id) => {
    const m = relmap(s, mapId);
    if (m) m.edges = m.edges.filter((e) => e.id !== id);
  }, onShownMap, ifShown('removeRelEdge'));
  Ops.register('putRelTrack', (s, mapId, track) => {
    const m = relmap(s, mapId);
    if (m && track && track.id) upsert(m.tracks, pick(track, TRACK_KEYS));
  }, onShownMap, ifShown('putRelTrack'));
  Ops.register('removeRelTrack', (s, mapId, id) => {
    const m = relmap(s, mapId);
    if (m) m.tracks = m.tracks.filter((t) => t.id !== id);
  }, onShownMap, ifShown('removeRelTrack'));
  Ops.playerFilter((doc) => {
    if (doc.relmaps) doc.relmaps = doc.relmaps.filter((m) => !m.hidden);
    return doc;
  });

  // The Storyteller's own pack state (the family's I9): free notes, the arc, open threads. Never
  // shared: no player may send them, none is in a player's view, and none is forwarded.
  // They are local (PLAYBOOK §4b.2): kept in this browser's pack and never sent to a session's room.
  // `gm` is the Storyteller's own sections (overview, places, people, pc, rules, threadsNote,
  // questions — engine/gm-text.js); the arc's scenes carry sessions and beats.
  const gmOnly = () => null;
  const LOCAL = { local: true };
  const copy = (x) => JSON.parse(JSON.stringify(x == null ? null : x));
  Ops.register('setGm', (s, where, value) => { if (!s.gm) s.gm = {}; s.gm[String(where)] = copy(value); }, null, gmOnly, LOCAL);
  Ops.register('setGmNotes', (s, text) => { s.gmNotes = String(text || ''); }, null, gmOnly, LOCAL);
  Ops.register('setArc', (s, list) => { s.arc = copy(list || []); }, null, gmOnly, LOCAL);
  Ops.register('setThreads', (s, list) => { s.threads = copy(list || []); }, null, gmOnly, LOCAL);

  return Ops;
});
