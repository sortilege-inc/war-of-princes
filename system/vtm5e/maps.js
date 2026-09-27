// system/vtm5e/maps.js — relationship and scene maps on a canvas (V9, owner 2026-09-24): the
// core's Relationship Map, Blood Sigils' Scene Map, a Sabbat Pack Map. People and places as
// boxes (name, clan / Path, a caption), labelled arrows between them, drawn by the Storyteller
// and the players as a feature of its own. The state is system/vtm5e/ops.js `relmaps`.
//
// Two halves in one file:
//   the Maps panel (gm/index.html)   the Storyteller's list: new, open, show / hide, delete, and
//                                    a map started from Blood Sigils' own example
//   the canvas (gm/maps.html)        one map, full window: Cytoscape.js (MIT, assets/vendor)
//                                    draws it; drag to place, tap to edit, Connect to draw an
//                                    arrow. ?map=<id> opens a map; ?view=player is what a player
//                                    sees, and a player's session opens it that way too
//
// What the book says the map is drawn with, the canvas draws: the core's colours ("Black
// denotes player character names, locations, and notes" … read from the corpus for the key), an
// arrow "from the dominant party to the weaker party" or none between equals, and each party's
// own descriptor "close to their name" (Arrows and Descriptors). Old truths are crossed out, not
// erased ("you scribble in new names and cross out old truths").
(function () {
  const { el, button, debounce } = window.VttRender;
  const State = window.VttState;
  const Bus = window.VttBus;
  const CFG = window.VttConfig || {};
  const D = window.VtmData;
  const S = () => State.state;
  const PAGE = (CFG.pages && CFG.pages.maps) || 'gm/maps.html';

  const RULES = {
    relationshipMap: { id: '#vWIiLr2xLdOwEKUD3sk4S9E', name: 'The Relationship Map', book: 'core' },
    arrows: { id: '#vPEMzl0SN0kaEQmqnkh7bSl', name: 'Arrows and Descriptors', book: 'core' },
    starting: { id: '#voBvWMTo1d3yFdr1MlwYY71', name: 'Starting the Map', book: 'core' },
    sceneMapping: { id: '#vtZgsN3nsuNn88MB1e5hIOT', name: 'Scene Mapping', book: 'blood-sigils' },
    stepOne: { id: '#vl0mNBVZKNn6XHvPddIOwqR', name: 'Scene Map: Step One', book: 'blood-sigils' },
    stepFour: { id: '#vP24eNW85FNL7RoVI4WKqGF', name: 'Scene Map: Step Four', book: 'blood-sigils' },
    stepFive: { id: '#v6Kw1t7mzkdNi48vhwAgwP9', name: 'Scene Map: Step Five', book: 'blood-sigils' },
    stepSeven: { id: '#vYbkZhiPIkxpEPsgEj5mQ93', name: 'Scene Map: Step Seven', book: 'blood-sigils' },
    deepTrouble: { id: '#vXAhuAeakCR81WYgWX0yAa7', name: 'Deep Trouble', book: 'blood-sigils' },
  };
  const MAP_KINDS = [['relationship', 'Relationship Map'], ['scene', 'Scene Map'], ['pack', 'Pack Map']];
  const KINDS = [['pc', 'Player character'], ['kindred', 'Kindred'], ['mortal', 'Mortal'], ['place', 'Place'], ['note', 'Note'], ['other', 'Unmarked']];
  const kindLabel = (k, list) => ((list || KINDS).find((x) => x[0] === k) || [k, k])[1];
  const maps = () => S().relmaps || [];
  const mapById = (id) => maps().find((m) => m.id === id) || null;
  const newId = (p) => State.genId(p);

  // ── from the book: Blood Sigils' Scene Map as its steps print it ─────────────────────────
  // Step Seven's table is the finished map (Name, Clan, Caption, Connections "→ Louis (teacher)";
  // several split by "; "). Who is who is the steps' own: Step One's rows are "the stars of the
  // show" (the player characters) and the rows new in Step Five are its locations. The rest
  // carry their clan where the book prints one (Kindred) and are left unmarked where it does not
  // — the book never says a name is a mortal, so the map does not either. Deep Trouble's rows
  // are the checkbox tracks.
  function fromBloodSigils() {
    return D.ready('blood-sigils').then(() => {
      const rows = (r) => { const e = D.entity(RULES[r].id); return e && e.table ? e.table.rows : null; };
      const seven = rows('stepSeven');
      if (!seven) throw new Error('Blood Sigils’ Scene Map is not in the data.');
      const stars = (rows('stepOne') || []).map((r) => r[0]);
      const before = (rows('stepFour') || []).map((r) => r[0]);
      const places = (rows('stepFive') || []).map((r) => r[0]).filter((n) => before.indexOf(n) === -1);
      const ids = {};
      const nodes = seven.map(([name, clan, caption]) => {
        const id = ids[name] = newId('n');
        const kind = stars.indexOf(name) !== -1 ? 'pc' : places.indexOf(name) !== -1 ? 'place' : clan ? 'kindred' : 'other';
        return { id, name, kind, clan: clan || '', caption: caption || '', x: 0, y: 0 };
      });
      const edges = [];
      seven.forEach(([name, , , links]) => String(links || '').split(/;\s*/).forEach((l) => {
        const m = l.match(/^→\s*(.+?)(?:\s*\(([^)]*)\))?\s*$/);
        if (m && ids[m[1]]) edges.push({ id: newId('e'), from: ids[name], to: ids[m[1]], arrow: 'to', label: m[2] || '' });
      }));
      const tracks = (rows('deepTrouble') || []).map(([name, boxes]) => ({ id: newId('t'), name, boxes: (String(boxes).match(/[☐☑☒■]/g) || []).length || 5, filled: (String(boxes).match(/[☑☒■]/g) || []).length }));
      // positions are left at 0: the canvas arranges a map whose boxes all sit there, once
      return { id: newId('rm'), name: D.entity(RULES.deepTrouble.id) ? RULES.deepTrouble.name : 'Scene Map', kind: 'scene', hidden: false, nodes, edges, tracks };
    });
  }

  const openRule = (r) => {
    if (window.VttPanels && window.VttPanels.select && document.getElementById('main')) window.VttPanels.select({ kind: 'entity', id: r.id });
    else Bus.emit('select', { kind: 'entity', id: r.id });
  };
  const ruleLink = (key, label) => el('button', { class: 'ref', type: 'button', onclick: () => openRule(RULES[key]) }, [label || RULES[key].name]);
  const openPage = (id, player) => window.open(PAGE + '?map=' + encodeURIComponent(id) + (player ? '&view=player' : ''), (CFG.channel || 'vtt') + '-maps');

  // ══ the Maps panel (the Storyteller's page) ═══════════════════════════════════════════════
  function renderPanel(container, ctx) {
    const editing = () => document.activeElement && container.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
    const draw = () => {
      container.innerHTML = '';
      container.appendChild(el('p', { class: 'muted small' }, ['Relationship and scene maps, drawn together at the table. See ', ruleLink('relationshipMap'), ' · ', ruleLink('arrows'), ' · ', ruleLink('sceneMapping'), '.']));
      const list = maps();
      if (!list.length) container.appendChild(el('div', { class: 'empty' }, ['No maps yet.']));
      list.forEach((m) => container.appendChild(el('div', { class: 'relmap-row' + (m.hidden ? ' hidden-map' : '') }, [
        el('div', {}, [el('strong', {}, [m.name]), el('span', { class: 'muted small' }, [' · ' + kindLabel(m.kind, MAP_KINDS) + ' · ' + m.nodes.length + ' on it, ' + m.edges.length + ' connections' + (m.hidden ? ' · hidden from the players' : '')])]),
        el('div', { class: 'chiprow tight' }, [
          button('Open', () => openPage(m.id), 'tiny'),
          button(m.hidden ? 'Show the players' : 'Hide from the players', () => { State.commit('setRelMapMeta', [m.id, { hidden: !m.hidden }]); draw(); }, 'ghost tiny'),
          button('Delete', () => { if (confirm('Delete the map “' + m.name + '”? This cannot be undone.')) { State.commit('removeRelMap', [m.id]); draw(); } }, 'ghost tiny'),
        ]),
      ])));
      const name = el('input', { type: 'text', class: 'text small', placeholder: 'New map’s name' });
      const kind = el('select', { class: 'scope' }, MAP_KINDS.map(([k, l]) => el('option', { value: k }, [l])));
      const hidden = el('input', { type: 'checkbox' });
      const create = () => {
        const m = { id: newId('rm'), name: name.value.trim() || kindLabel(kind.value, MAP_KINDS), kind: kind.value, hidden: hidden.checked, nodes: [], edges: [], tracks: [] };
        State.commit('putRelMap', [m]);
        name.value = '';
        name.blur();
        draw();
        openPage(m.id);
      };
      name.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') create(); });
      container.appendChild(el('div', { class: 'relmap-new' }, [name, kind, el('label', { class: 'small' }, [hidden, ' hidden']), button('New map', create, 'tiny')]));
      container.appendChild(el('div', { class: 'chiprow tight' }, [
        button('Start from Blood Sigils’ Scene Map', () => fromBloodSigils().then((m) => { State.commit('putRelMap', [m]); draw(); openPage(m.id); }).catch((e) => alert(e.message)), 'ghost tiny'),
      ]));
    };
    ctx.on('state:remote', () => { if (!editing()) draw(); });
    ctx.on('state:changed', (p, meta) => { if (meta && meta.remote && !editing()) draw(); });
    draw();
  }
  if (window.VttPanels && document.getElementById('main')) window.VttPanels.register('relmaps', { label: 'Maps', render: renderPanel });

  // ══ the canvas (gm/maps.html) ════════════════════════════════════════════════════════════
  const stage = document.getElementById('relmap-cy');
  if (!stage || !window.cytoscape) {
    window.VtmMaps = { RULES, fromBloodSigils, openPage };
    return;
  }
  const params = new URLSearchParams(location.search);
  const Session = window.VttSession;
  const PLAYER = params.get('view') === 'player' || !!(Session && Session.role && Session.role() === 'player');
  if (PLAYER) document.body.classList.add('player');
  const toolbar = document.getElementById('relmap-toolbar');
  const side = document.getElementById('relmap-side');
  const tracksBox = document.getElementById('relmap-tracks');
  const hint = document.getElementById('relmap-hint');

  let mapId = params.get('map') || State.ui('relmap') || null;
  let selected = null;          // { kind: 'node'|'edge', id }
  let connectFrom = null;       // Connect: the node an arrow starts from, or true (waiting for it)
  let legendOpen = false;
  const current = () => mapById(mapId) || (mapId = (maps()[0] || {}).id || null, mapById(mapId));

  // the core's colours, on the book's paper
  const C = { ink: '#1a1618', ink2: '#4b4246', red: '#9c0a1d', blue: '#1d4f91', paper: '#f6f2eb', white: '#ffffff', sel: '#c8102e' };
  const FILL = { pc: C.ink, kindred: C.red, mortal: C.blue };
  const logo = (clan) => { const a = (window.VtmArt || {}).clans || {}; const k = Object.keys(a).find((x) => x.toLowerCase() === String(clan || '').toLowerCase()); return k ? a[k].src : null; };

  // A box's text, wrapped here (so its size is known): the name, then what the book writes
  // beside it (clan, Path, sect position, year of Embrace — "Sires"), then the caption.
  const measure = document.createElement('canvas').getContext('2d');
  function wrap(text, font, max) {
    measure.font = font;
    const out = [];
    String(text).split('\n').forEach((para) => {
      let line = '';
      para.split(/\s+/).filter(Boolean).forEach((w) => {
        const t = line ? line + ' ' + w : w;
        if (line && measure.measureText(t).width > max) { out.push(line); line = w; } else line = t;
      });
      out.push(line);
    });
    return out;
  }
  const fontOf = (kind) => (kind === 'note' ? 'italic 500 16px "Cormorant Garamond", serif' : kind === 'pc' ? '600 14px Cabin, sans-serif' : '600 13px Cabin, sans-serif');
  function nodeData(n) {
    const FONT = fontOf(n.kind);
    const facts = [n.clan, n.path, n.sect, n.embrace ? 'Embraced ' + n.embrace : ''].filter(Boolean).join(' · ');
    const lines = wrap(n.name || '—', FONT, 170).concat(facts ? wrap(facts, FONT, 170) : [], n.caption ? wrap(n.caption, FONT, 170) : []);
    let w = 0;
    measure.font = FONT;
    lines.forEach((l) => { w = Math.max(w, measure.measureText(l).width); });
    const img = FILL[n.kind] ? logo(n.clan) : null;
    return { id: n.id, label: lines.join('\n'), w: Math.max(70, Math.ceil(w) + 22), h: lines.length * 17 + 16 + (img ? 30 : 0), img: img || 'none', kind: n.kind || 'other' };
  }
  const edgeData = (e) => ({ id: e.id, source: e.from, target: e.to, label: e.label || '', sl: e.fromLabel || '', tl: e.toLabel || '' });

  const cy = window.cytoscape({
    container: stage,
    wheelSensitivity: 0.3,
    minZoom: 0.05,
    maxZoom: 3,
    boxSelectionEnabled: false,
    style: [
      { selector: 'node', style: { shape: 'round-rectangle', width: 'data(w)', height: 'data(h)', label: 'data(label)', 'text-wrap': 'wrap', 'text-valign': 'center', 'text-halign': 'center', 'font-family': 'Cabin, sans-serif', 'font-weight': 600, 'font-size': 13, 'line-height': 1.3, 'background-color': C.paper, 'border-width': 1.5, 'border-color': C.ink2, color: C.ink } },
      { selector: 'node[kind = "pc"]', style: { 'background-color': C.ink, 'border-color': C.ink, color: C.paper, 'font-size': 14 } },
      { selector: 'node[kind = "kindred"]', style: { 'background-color': C.red, 'border-color': C.red, color: C.white } },
      { selector: 'node[kind = "mortal"]', style: { 'background-color': C.blue, 'border-color': C.blue, color: C.white } },
      { selector: 'node[kind = "place"]', style: { shape: 'cut-rectangle', 'border-width': 2, 'border-color': C.ink } },
      { selector: 'node[kind = "note"]', style: { 'background-opacity': 0, 'border-width': 0, 'font-style': 'italic', 'font-family': 'Cormorant Garamond, serif', 'font-size': 16, 'font-weight': 500 } },
      { selector: 'node[kind = "other"]', style: { 'border-style': 'dashed' } },
      { selector: 'node[img != "none"]', style: { 'background-image': 'data(img)', 'background-fit': 'none', 'background-width': 24, 'background-height': 24, 'background-position-y': 8, 'background-clip': 'none', 'text-margin-y': 14 } },
      { selector: 'node.struck', style: { opacity: 0.4, 'border-style': 'dashed' } },
      { selector: 'node:selected', style: { 'border-width': 3, 'border-color': C.sel, 'overlay-opacity': 0 } },
      { selector: 'node.from', style: { 'border-width': 4, 'border-color': C.sel, 'border-style': 'double' } },
      { selector: 'edge', style: { width: 1.6, 'curve-style': 'bezier', 'control-point-step-size': 60, 'line-color': C.ink2, 'target-arrow-color': C.ink2, 'source-arrow-color': C.ink2, 'arrow-scale': 1.2, label: 'data(label)', 'source-label': 'data(sl)', 'target-label': 'data(tl)', 'source-text-offset': 58, 'target-text-offset': 58, 'font-family': 'Cabin, sans-serif', 'font-size': 11, color: C.ink, 'text-wrap': 'wrap', 'text-max-width': 150, 'text-background-color': C.paper, 'text-background-opacity': 0.92, 'text-background-padding': 2 } },
      { selector: 'edge.arrow', style: { 'target-arrow-shape': 'triangle' } },
      { selector: 'edge.struck', style: { opacity: 0.4, 'line-style': 'dashed' } },
      { selector: 'edge:selected', style: { 'line-color': C.sel, 'target-arrow-color': C.sel, width: 3, 'overlay-opacity': 0 } },
    ],
  });

  // ── the state onto the canvas: by id, so a redraw never moves what someone is dragging ──
  function sync() {
    const m = current();
    const want = {};
    if (m) {
      m.nodes.forEach((n) => {
        want[n.id] = true;
        const d = nodeData(n);
        const c = cy.getElementById(n.id);
        if (c.nonempty()) {
          c.data(d);
          if (!c.grabbed()) c.position({ x: +n.x || 0, y: +n.y || 0 });
        } else cy.add({ group: 'nodes', data: d, position: { x: +n.x || 0, y: +n.y || 0 } });
        cy.getElementById(n.id).toggleClass('struck', !!n.struck);
      });
      m.edges.forEach((e) => {
        want[e.id] = true;
        const c = cy.getElementById(e.id);
        if (c.nonempty() && (c.data('source') !== e.from || c.data('target') !== e.to)) c.remove();
        if (cy.getElementById(e.id).nonempty()) cy.getElementById(e.id).data(edgeData(e));
        else cy.add({ group: 'edges', data: edgeData(e) });
        cy.getElementById(e.id).toggleClass('arrow', e.arrow !== 'none').toggleClass('struck', !!e.struck);
      });
    }
    cy.elements().forEach((x) => { if (!want[x.id()]) x.remove(); });
    cy.nodes().removeClass('from');
    if (connectFrom && connectFrom !== true) cy.getElementById(connectFrom).addClass('from');
    if (selected && cy.getElementById(selected.id).empty()) selected = null;
  }

  // an edit here is drawn at once (a commit tells the other windows, not this one)
  const commit = (name, args) => { State.commit(name, [mapId].concat(args)); redraw(); };
  const nodeOf = (id) => (current() || { nodes: [] }).nodes.find((n) => n.id === id) || null;
  const edgeOf = (id) => (current() || { edges: [] }).edges.find((e) => e.id === id) || null;
  const nameOf = (id) => (nodeOf(id) || {}).name || '—';

  // somewhere free near the middle of the view
  function freeSpot() {
    const ext = cy.extent();
    const cx = (ext.x1 + ext.x2) / 2;
    const cyy = (ext.y1 + ext.y2) / 2;
    for (let r = 0; r < 12; r++) {
      for (let a = 0; a < 8; a++) {
        const x = cx + r * 90 * Math.cos(a * Math.PI / 4);
        const y = cyy + r * 70 * Math.sin(a * Math.PI / 4);
        if (!cy.nodes().some((n) => Math.abs(n.position('x') - x) < 110 && Math.abs(n.position('y') - y) < 60)) return { x, y };
        if (r === 0) break;
      }
    }
    return { x: cx, y: cyy };
  }
  function addNode(patch) {
    if (!current()) return;
    const p = freeSpot();
    const n = Object.assign({ id: newId('n'), name: '', kind: 'other', x: Math.round(p.x), y: Math.round(p.y) }, patch);
    commit('putRelNode', [n]);
    selected = { kind: 'node', id: n.id };
    redraw();
    const f = side.querySelector('input[data-f="name"]');
    if (f && !patch.name) f.focus();
  }
  function addCoterie() {
    const m = current();
    if (!m) return;
    (S().party || []).forEach((p) => {
      if (m.nodes.some((n) => n.member === p.id)) return;
      const c = p.character || {};
      const v = p.values || c.values || c;   // as sheet.js valuesOf reads a character file
      addNode({ name: v.Name || p.name || 'Character', kind: 'pc', clan: v.Clan || '', member: p.id });
    });
  }
  function layout(then) {
    const l = cy.layout({ name: 'cose', animate: false, nodeDimensionsIncludeLabels: true, idealEdgeLength: () => 170, nodeRepulsion: () => 400000, nodeOverlap: 40, componentSpacing: 120, padding: 40, randomize: true });
    l.one('layoutstop', () => {
      commit('moveRelNodes', [cy.nodes().map((n) => [n.id(), n.position('x'), n.position('y')])]);
      cy.fit(undefined, 40);
      if (then) then();
    });
    l.run();
  }

  // ── gestures ──
  cy.on('tap', 'node', (ev) => {
    const id = ev.target.id();
    if (connectFrom === true) { connectFrom = id; redraw(); return; }
    if (connectFrom && connectFrom !== id) {
      const e = { id: newId('e'), from: connectFrom, to: id, arrow: 'to', label: '' };
      commit('putRelEdge', [e]);
      connectFrom = null;
      selected = { kind: 'edge', id: e.id };
      redraw();
      const f = side.querySelector('input[data-f="label"]');
      if (f) f.focus();
      return;
    }
    selected = { kind: 'node', id };
    redraw();
  });
  cy.on('tap', 'edge', (ev) => { selected = { kind: 'edge', id: ev.target.id() }; connectFrom = null; redraw(); });
  cy.on('tap', (ev) => { if (ev.target === cy) { selected = null; if (connectFrom !== true) connectFrom = null; redraw(); } });
  cy.on('dragfree', 'node', () => {
    const moved = cy.nodes().filter((n) => { const k = nodeOf(n.id()); return k && (Math.round(n.position('x')) !== k.x || Math.round(n.position('y')) !== k.y); });
    if (moved.length) commit('moveRelNodes', [moved.map((n) => [n.id(), n.position('x'), n.position('y')])]);
  });
  document.addEventListener('keydown', (ev) => {
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if (ev.key === 'Escape') { connectFrom = null; selected = null; redraw(); }
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && selected) { ev.preventDefault(); removeSelected(); }
  });
  function removeSelected() {
    if (!selected) return;
    if (selected.kind === 'node') commit('removeRelNode', [selected.id]);
    else commit('removeRelEdge', [selected.id]);
    selected = null;
    redraw();
  }

  // ── the toolbar ──
  const group = (kids, cls) => el('div', { class: 'group' + (cls ? ' ' + cls : '') }, kids);
  function buildToolbar() {
    toolbar.innerHTML = '';
    const m = current();
    const pick = el('select', { class: 'vtt-select', title: 'Show another map', onchange: (ev) => { mapId = ev.target.value; State.ui('relmap', mapId); selected = null; connectFrom = null; redraw(); cy.fit(undefined, 40); } },
      maps().length ? maps().map((x) => el('option', { value: x.id, selected: x.id === mapId || null }, [x.name + (x.hidden ? ' (hidden)' : '')])) : [el('option', {}, ['No maps yet'])]);
    const newMap = () => {
      const name = prompt('The new map’s name', 'Relationship Map');
      if (name == null) return;
      const x = { id: newId('rm'), name: name.trim() || 'Relationship Map', kind: 'relationship', hidden: false, nodes: [], edges: [], tracks: [] };
      State.commit('putRelMap', [x]);
      mapId = x.id;
      State.ui('relmap', mapId);
      redraw();
    };
    toolbar.appendChild(group([el('span', { class: 'muted' }, ['Map']), pick, button('New', newMap, 'ghost')]));
    if (!m) { toolbar.appendChild(group([el('span', { class: 'muted' }, [PLAYER ? 'Your Storyteller has shown no maps yet — start one with New.' : 'Start a map with New, or from the Maps panel.'])])); return; }
    toolbar.appendChild(group([
      el('span', { class: 'muted' }, ['Add']),
      button('Person', () => addNode({ kind: 'other' }), 'ghost'),
      button('Place', () => addNode({ kind: 'place' }), 'ghost'),
      button('Note', () => addNode({ kind: 'note' }), 'ghost'),
      (S().party || []).length ? button('The coterie', addCoterie, 'ghost') : null,
    ]));
    toolbar.appendChild(group([
      el('button', { class: 'btn ghost' + (connectFrom ? ' active' : ''), type: 'button', title: 'Tap the dominant party, then the other', onclick: () => { connectFrom = connectFrom ? null : (selected && selected.kind === 'node' ? selected.id : true); redraw(); } }, ['Connect']),
    ]));
    const gm = PLAYER ? [] : [
      el('label', { title: 'A hidden map is yours alone' }, [el('input', { type: 'checkbox', checked: m.hidden || null, onchange: (ev) => State.commit('setRelMapMeta', [m.id, { hidden: ev.target.checked }]) }), 'Hidden']),
      button('Rename', () => { const n = prompt('Rename the map', m.name); if (n && n.trim()) State.commit('setRelMapMeta', [m.id, { name: n.trim() }]); }, 'ghost'),
      el('select', { class: 'vtt-select', title: 'What kind of map', onchange: (ev) => State.commit('setRelMapMeta', [m.id, { kind: ev.target.value }]) }, MAP_KINDS.map(([k, l]) => el('option', { value: k, selected: k === m.kind || null }, [l]))),
      button('Private copy', () => {
        const x = JSON.parse(JSON.stringify(m));
        x.id = newId('rm');
        x.name = m.name + ' (private)';
        x.hidden = true;
        State.commit('putRelMap', [x]);
        mapId = x.id;
        State.ui('relmap', mapId);
        redraw();
      }, 'ghost'),
      button('Delete', () => { if (confirm('Delete the map “' + m.name + '”? This cannot be undone.')) { State.commit('removeRelMap', [m.id]); mapId = null; selected = null; redraw(); } }, 'ghost'),
    ];
    if (gm.length) toolbar.appendChild(group(gm));
    toolbar.appendChild(group([
      el('button', { class: 'btn ghost' + (legendOpen ? ' active' : ''), type: 'button', onclick: () => { legendOpen = !legendOpen; redraw(); } }, ['Key']),
      button('Arrange', () => { if (!m.nodes.length || confirm('Arrange every box afresh? The places you dragged them to are lost.')) layout(); }, 'ghost'),
      button('Fit', () => cy.fit(undefined, 40), 'ghost'),
      button('Image', () => {
        const a = el('a', { href: cy.png({ full: true, scale: 2, bg: C.paper }), download: (m.name || 'map').replace(/[^\w -]+/g, '') + '.png' });
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, 'ghost'),
    ], 'last'));
  }

  // ── the side: the key, or what is selected ──
  const field = (label, input) => el('label', { class: 'relmap-f' }, [el('span', { class: 'prop-k' }, [label]), input]);
  function text(f, value, onSet, attrs) {
    return el('input', Object.assign({ type: 'text', class: 'text small', 'data-f': f, value: value || '', onchange: (ev) => onSet(ev.target.value.trim()), onkeydown: (ev) => { if (ev.key === 'Enter') ev.target.blur(); } }, attrs || {}));
  }
  const PHONE = window.matchMedia('(max-width: 760px)');
  function buildSide() {
    side.innerHTML = '';
    const m = current();
    // on a phone the paper keeps the screen: the side shows what is selected, or the key on asking
    side.hidden = PHONE.matches && !legendOpen && !(selected && m);
    if (legendOpen || !selected || !m) {
      side.appendChild(el('h4', {}, ['Key']));
      const core = D.entity(RULES.relationshipMap.id);
      const items = core ? (D.val(core, 'Items') || []).map((x) => x.value) : [];
      side.appendChild(el('div', { class: 'relmap-key' }, [
        el('div', {}, [el('span', { class: 'sw pc' }), 'Player character']),
        el('div', {}, [el('span', { class: 'sw kindred' }), 'Kindred']),
        el('div', {}, [el('span', { class: 'sw mortal' }), 'Mortal']),
        el('div', {}, [el('span', { class: 'sw place' }), 'Place']),
        el('div', {}, [el('span', { class: 'sw other' }), 'Unmarked']),
      ]));
      if (items.length) side.appendChild(el('ul', { class: 'relmap-rules small' }, items.map((t) => el('li', {}, [t]))));
      side.appendChild(el('p', { class: 'small muted' }, [PLAYER ? '' : ruleLink('relationshipMap'), PLAYER ? '' : ' · ', PLAYER ? '' : ruleLink('arrows'), PLAYER ? '' : ' · ', PLAYER ? '' : ruleLink('sceneMapping')]));
      side.appendChild(el('p', { class: 'small muted' }, ['Tap a box or an arrow to edit it. Connect, then tap the dominant party and the other, draws an arrow; Delete removes what is selected.']));
      return;
    }
    if (selected.kind === 'node') {
      const n = nodeOf(selected.id);
      if (!n) return;
      const set = (patch) => commit('putRelNode', [Object.assign({ id: n.id }, patch)]);
      const clans = Object.keys((window.VtmArt || {}).clans || {});
      side.appendChild(el('h4', {}, [n.name || 'New box']));
      side.appendChild(field('Name', text('name', n.name, (v) => set({ name: v }), { list: 'relmap-records', placeholder: 'A name — or one from the books' })));
      side.appendChild(el('datalist', { id: 'relmap-records' }, D.records().filter((r) => r.kind === 'character').slice(0, 600).map((r) => el('option', { value: r.name }, [(D.indexBook(r.book) || {}).label || r.book]))));
      side.appendChild(field('Kind', el('select', { class: 'scope', onchange: (ev) => { ev.target.blur(); set({ kind: ev.target.value }); } }, KINDS.map(([k, l]) => el('option', { value: k, selected: k === (n.kind || 'other') || null }, [l])))));
      side.appendChild(field('Clan', text('clan', n.clan, (v) => set({ clan: v }), { list: 'relmap-clans' })));
      side.appendChild(el('datalist', { id: 'relmap-clans' }, clans.map((c) => el('option', { value: c }))));
      side.appendChild(field('Path', text('path', n.path, (v) => set({ path: v }), { placeholder: 'Path of Enlightenment' })));
      side.appendChild(field('Sect position', text('sect', n.sect, (v) => set({ sect: v }))));
      side.appendChild(field('Year of Embrace', text('embrace', n.embrace, (v) => set({ embrace: v }))));
      side.appendChild(field('Caption', el('textarea', { class: 'text small', rows: 3, 'data-f': 'caption', onchange: (ev) => set({ caption: ev.target.value.trim() }) }, [n.caption || ''])));
      side.appendChild(el('label', { class: 'small' }, [el('input', { type: 'checkbox', checked: n.struck || null, onchange: (ev) => set({ struck: ev.target.checked }) }), ' crossed out']));
      const rec = D.records().find((r) => r.kind === 'character' && r.name === n.name) || null;
      const links = [];
      if (n.member) links.push(PLAYER ? null : button('Their sheet', () => Bus.emit('select', { kind: 'party', id: n.member }), 'ghost tiny'));
      if (rec) links.push(button('In ' + ((D.indexBook(rec.book) || {}).label || rec.book), () => (PLAYER ? window.open('./#books/' + encodeURIComponent(rec.book) + '/' + encodeURIComponent(rec.id), (CFG.channel || 'vtt') + '-reader') : Bus.emit('select', { kind: 'entity', id: rec.id })), 'ghost tiny'));
      side.appendChild(el('div', { class: 'chiprow tight' }, links.concat([
        button('Connect from here', () => { connectFrom = n.id; redraw(); }, 'ghost tiny'),
        button('Delete', removeSelected, 'ghost tiny'),
      ])));
      return;
    }
    const e = edgeOf(selected.id);
    if (!e) return;
    const set = (patch) => commit('putRelEdge', [Object.assign({ id: e.id }, patch)]);
    const a = nameOf(e.from);
    const b = nameOf(e.to);
    side.appendChild(el('h4', {}, [a + (e.arrow === 'none' ? ' — ' : ' → ') + b]));
    side.appendChild(field('Who holds the power', el('select', { class: 'scope', onchange: (ev) => {
      const cur = edgeOf(e.id) || e;   // as it is now, not as it was when the side was drawn
      ev.target.blur();
      if (ev.target.value === 'none') set({ arrow: 'none' });
      else if (ev.target.value === 'to') set({ arrow: 'to' });
      else set({ arrow: 'to', from: cur.to, to: cur.from, fromLabel: cur.toLabel || '', toLabel: cur.fromLabel || '' });
    } }, [
      el('option', { value: 'to', selected: e.arrow !== 'none' || null }, [a + ' over ' + b]),
      el('option', { value: 'swap' }, [b + ' over ' + a]),
      el('option', { value: 'none', selected: e.arrow === 'none' || null }, ['Equals (no arrow)']),
    ])));
    side.appendChild(field('On the line', text('label', e.label, (v) => set({ label: v }), { placeholder: 'e.g. sire, teacher, touchstone' })));
    side.appendChild(field(a + '’s descriptor', text('fromLabel', e.fromLabel, (v) => set({ fromLabel: v }), { placeholder: 'close to ' + a })));
    side.appendChild(field(b + '’s descriptor', text('toLabel', e.toLabel, (v) => set({ toLabel: v }), { placeholder: 'close to ' + b })));
    side.appendChild(el('label', { class: 'small' }, [el('input', { type: 'checkbox', checked: e.struck || null, onchange: (ev) => set({ struck: ev.target.checked }) }), ' crossed out']));
    side.appendChild(el('div', { class: 'chiprow tight' }, [button('Delete', removeSelected, 'ghost tiny')]));
    if (!PLAYER) side.appendChild(el('p', { class: 'small muted' }, [ruleLink('arrows')]));
  }

  // ── the tracks: Blood Sigils' "Deep Trouble" checkboxes, on any map ──
  // folded on a phone until opened; the choice holds across redraws
  let tracksOpen = !window.matchMedia('(max-width: 760px)').matches;
  function buildTracks() {
    tracksBox.innerHTML = '';
    const m = current();
    tracksBox.hidden = !m;
    if (!m) return;
    const box = el('details', { open: tracksOpen || null, ontoggle: (ev) => { tracksOpen = ev.target.open; } }, [el('summary', {}, ['Tracks' + (m.tracks.length ? ' (' + m.tracks.length + ')' : '')])]);
    const list = el('div', { class: 'relmap-tracks-list' });
    box.appendChild(list);
    tracksBox.appendChild(box);
    m.tracks.forEach((t) => list.appendChild(el('div', { class: 'relmap-track' }, [
      el('span', { class: 'relmap-track-name' }, [t.name]),
      el('span', { class: 'relmap-boxes' }, Array.from({ length: t.boxes || 5 }, (_, i) => el('button', { type: 'button', class: 'relmap-box' + (i < (t.filled || 0) ? ' on' : ''), title: (i + 1) + ' of ' + t.boxes,
        onclick: () => commit('putRelTrack', [{ id: t.id, filled: (t.filled || 0) === i + 1 ? i : i + 1 }]) }))),
      el('button', { type: 'button', class: 'relmap-x', title: 'Remove this track', onclick: () => { if (confirm('Remove the track “' + t.name + '”?')) commit('removeRelTrack', [t.id]); } }, ['×']),
    ])));
    list.appendChild(el('button', { type: 'button', class: 'btn ghost tiny', onclick: () => {
      const name = prompt('The track’s name');
      if (!name || !name.trim()) return;
      const n = parseInt(prompt('How many boxes?', '5'), 10);
      commit('putRelTrack', [{ id: newId('t'), name: name.trim(), boxes: Math.min(10, Math.max(1, n || 5)), filled: 0 }]);
    } }, ['+ Track']));
  }

  function syncHint() {
    const m = current();
    if (!m) { hint.textContent = ''; return; }
    hint.textContent = connectFrom === true ? 'Connect: tap the dominant party (or the first of two equals)…'
      : connectFrom ? 'Connect: now tap ' + nameOf(connectFrom) + '’s other party · Esc cancels'
        : m.nodes.length + ' on the map · drag to place · wheel or pinch zooms · drag the paper to pan';
  }

  // a map started from the book arrives with every box at 0: arrange it the first time it shows
  const arranged = {};
  function arrangeNew() {
    const m = current();
    if (!m || arranged[m.id] || !m.nodes.length || !m.nodes.every((n) => !n.x && !n.y)) return;
    arranged[m.id] = true;
    layout();
  }

  const editingSide = () => side.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  function redraw() {
    sync();
    cy.nodes().unselect();
    cy.edges().unselect();
    if (selected) cy.getElementById(selected.id).select();
    buildToolbar();
    if (!editingSide()) buildSide();
    buildTracks();
    syncHint();
    document.title = ((current() || {}).name || 'Maps') + ' — ' + (window.VttConfig.title || 'Vampire: The Masquerade');
    arrangeNew();
  }

  Bus.on('state:remote', () => redraw());
  Bus.on('state:changed', (p, meta) => { if (meta && meta.remote) redraw(); });

  // ── boot: the core is read for the key; a map started from the book is arranged once ──
  redraw();
  cy.fit(undefined, 40);
  // the canvas has its final size only once the page has laid out (and again on a resize)
  requestAnimationFrame(() => { cy.resize(); cy.fit(undefined, 40); });
  window.addEventListener('resize', debounce(() => { cy.resize(); redraw(); }, 150));
  D.ready('core').then(() => { if (!editingSide()) buildSide(); });
  window.VtmMaps = { RULES, fromBloodSigils, openPage, cy, redraw, current, layout };
})();
