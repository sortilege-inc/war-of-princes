// system/vtm5e/gm-panes.js — the Storyteller's own panes (the family standard, PLAYBOOK §4b.2, on
// sortilege-vtt-l5r5e I19 by way of sortilege-vtt-tor2e): Scenes (the chronicle's arc — sessions, a
// card per scene with its beats, the questions for the table, and "Play it" into the Chronicle),
// Threads (with what happened to each in play, and the current scene's cast with what their records
// print), People (with an About picker: whom a section is about, shown in the Inspector and the
// Coterie), Loresheets, and the Notes document an instance may name. Overview (premise, rulings, free
// notes, a search), Places and Settings are the engine's (engine/gm-panes.js), which registers only
// what this file does not. Everything here is the Storyteller's own pack state (system/vtm5e/ops.js:
// gm, gmNotes, arc, threads — local ops, never sent to a session's room); the text is the GM's small
// Markdown with its SET / OPEN / SOURCE … tags (engine/gm-text.js). V5 has no encounter arithmetic,
// so L5R5e's and TOR2e's encounter builder has no counterpart here.
(function () {
  const { el, button, debounce } = window.VttRender;
  const D = window.VtmData;
  const E = window.VtmEntity;
  const State = window.VttState;
  const G = window.VttGmText;
  const Panels = window.VttPanels;
  const Sys = () => window.VttSystem;
  const S = () => State.state;
  const CFG = window.VttConfig || {};
  const editing = (c) => document.activeElement && /TEXTAREA|INPUT|SELECT/.test(document.activeElement.tagName) && c.contains(document.activeElement);
  const newId = (p) => State.genId(p);
  const redrawOn = (ctx, container, draw) => {
    ctx.on('state:changed', () => { if (!editing(container)) draw(); });
    ctx.on('state:remote', () => { if (!editing(container)) draw(); });
    ctx.on('gm:reveal', draw);
  };

  // ── Notes: an authored document (the instance names it: VttConfig.notes = { src, title, class, gate })
  // rendered, and the Storyteller's free notes below it. A gate (the document's spoiler warning)
  // stands in front of it until the Storyteller passes it, once per page load. A .html document is
  // the instance's own fragment and goes in as it is, under its class; anything else is Markdown ──
  let docCache = null;
  let gatePassed = false;
  function renderNotes(container, ctx) {
    const draw = () => {
      container.innerHTML = '';
      const n = CFG.notes || null;
      if (n && n.src && n.gate && !gatePassed) {
        container.appendChild(el('h4', {}, [n.title || 'Notes']));
        container.appendChild(el('div', { class: 'paper notes-gate' }, [
          n.gate.title ? el('div', { class: 'notes-gate-title' }, [n.gate.title]) : null,
          n.gate.text ? el('p', {}, [n.gate.text]) : null,
          button(n.gate.enter || 'Show', () => { gatePassed = true; draw(); }, 'tiny'),
        ]));
      } else if (n && n.src) {
        const box = el('div', { class: 'paper notes-doc' + (n.class ? ' ' + n.class : '') }, [el('div', { class: 'muted loading' }, ['Reading ' + (n.title || n.src) + '…'])]);
        container.appendChild(el('h4', {}, [n.title || 'Notes']));
        container.appendChild(box);
        const show = (text) => { box.innerHTML = ''; if (/\.html?$/.test(n.src)) box.innerHTML = text; else box.appendChild(E.prose(text)); };
        if (docCache != null) show(docCache);
        else fetch(n.src).then((r) => (r.ok ? r.text() : Promise.reject(new Error(r.status)))).then((t) => { docCache = t; show(t); })
          .catch((e) => { box.innerHTML = ''; box.appendChild(el('div', { class: 'empty' }, ['Could not read ' + n.src + ' (' + e.message + ').'])); });
      }
      container.appendChild(el('h4', {}, ['Free notes', el('span', { class: 'muted small' }, [' · saved with the pack, never sent to players'])]));
      container.appendChild(el('textarea', { class: 'text notes-free', rows: 10, placeholder: 'Jot as you play…', oninput: debounce((ev) => State.commit('setGmNotes', [ev.target.value]), 400) }, [S().gmNotes || '']));
    };
    ctx.on('state:remote', () => { if (!editing(container)) draw(); });
    draw();
  }

  // ── Scenes: the chronicle's arc — the Storyteller's plan ───────────────
  // arc = [{ id, title, session, summary, text, sections: [beat], played, sceneId }]. Sessions are
  // its groups; a session whose scenes are all played folds to one line. The Chronicle's scenes are
  // shared (a player sees the one in play), so what is only planned lives here, and "Play it" makes
  // an entry a Chronicle scene — its text becomes that scene's Storyteller's notes when those are empty.
  const arc = () => JSON.parse(JSON.stringify(S().arc || []));
  const setArc = (list) => State.commit('setArc', [list]);
  const MODULE = 'chronicle';
  const sessionOpen = {};
  function playIt(id) {
    const l = arc();
    const i = l.findIndex((y) => y.id === id);
    const x = l[i];
    let sc = x.sceneId && Sys().scene(x.sceneId);
    if (!sc) {
      const sid = newId('sc');
      State.commit('putScene', [{ id: sid, name: x.title || 'A scene', cast: [] }]);
      l[i] = Object.assign({}, x, { sceneId: sid });
      setArc(l);
      sc = Sys().scene(sid);
    }
    const prog = ((S().progress || {})[MODULE] || {})[sc.id] || {};
    const text = [x.summary, x.text].filter(Boolean).join('\n\n');
    if (text && !prog.notes) State.commit('setSceneNotes', [MODULE, sc.id, text]);
    window.VtmPanels.goTo(sc.id);
  }
  function renderScenes(container, ctx) {
    const draw = () => {
      container.innerHTML = '';
      const list = arc();
      const played = list.filter((x) => x.played).length;
      container.appendChild(el('h4', {}, ['The arc', el('span', { class: 'muted small' }, [' · ' + list.length + (list.length === 1 ? ' scene, ' : ' scenes, ') + played + ' played'])]));
      if (!list.length) container.appendChild(el('div', { class: 'empty' }, ['Nothing planned yet. What is only planned stays here; “Play it” puts a scene in the Chronicle.']));
      const groups = [];
      list.forEach((x, i) => {
        const g = groups[groups.length - 1];
        if (g && g.name === (x.session || null)) g.items.push([x, i]);
        else groups.push({ name: x.session || null, items: [[x, i]] });
      });
      const opts = {
        redraw: draw, save: setArc, subLabel: 'Beat',
        cls: (x) => 'arc-card' + (x.played ? ' played' : ''),
        badges: (x) => (x.played ? el('span', { class: 'chip' }, ['Played']) : null),
        before: (x) => (x.summary ? el('p', { class: 'arc-summary' }, [x.summary]) : el('span')),
        actions: (x) => el('span', {}, [
          button(x.sceneId && Sys().scene(x.sceneId) ? 'Go to it' : 'Play it', () => playIt(x.id), 'tiny'),
          button(x.played ? 'Not played' : 'Mark played', () => { const l = arc(); const at = l.findIndex((y) => y.id === x.id); l[at].played = !x.played; setArc(l); }, 'ghost tiny'),
        ]),
        fields: (d) => el('div', { class: 'chiprow tight' }, [
          el('input', { class: 'text', type: 'text', value: d.session || '', placeholder: 'Session (groups the scenes)', oninput: (ev) => (d.session = ev.target.value.trim() || undefined) }),
          el('input', { class: 'text wide', type: 'text', value: d.summary || '', placeholder: 'One line: what the scene is', oninput: (ev) => (d.summary = ev.target.value.trim() || undefined) }),
        ]),
      };
      const next = list.find((x) => !x.played);
      groups.forEach((g) => {
        const key = g.name || '';
        const allPlayed = g.items.every(([x]) => x.played);
        const isOpen = sessionOpen[key] != null ? sessionOpen[key] : !allPlayed;
        container.appendChild(el('button', { class: 'arc-session' + (allPlayed ? ' played' : ''), type: 'button', 'aria-expanded': isOpen ? 'true' : 'false', onclick: () => { sessionOpen[key] = !isOpen; draw(); } }, [
          el('span', { class: 'gm-caret', 'aria-hidden': 'true' }, [isOpen ? '▾' : '▸']), ' ', g.name || 'Scenes',
          el('span', { class: 'muted small' }, [' · ' + g.items.length + (g.items.length === 1 ? ' scene' : ' scenes') + (allPlayed ? ', played' : '')]),
        ]));
        if (!isOpen) return;
        g.items.forEach(([x, i]) => {
          if (G.open[x.id] == null) G.open[x.id] = !!next && next.id === x.id;
          container.appendChild(G.editingId[x.id] ? G.sectionEditor(x, i, list, opts) : G.sectionView(x, opts));
        });
      });
      // a new scene joins the last session unless named otherwise
      const last = list.length ? list[list.length - 1].session : undefined;
      const t = el('input', { class: 'text', type: 'text', placeholder: 'Plan a scene…' });
      const add = () => {
        if (!t.value.trim()) return;
        const x = { id: newId('arc'), title: t.value.trim(), session: last, text: '', played: false };
        G.editingId[x.id] = true; G.open[x.id] = true;
        setArc(arc().concat([x]));
        draw();
      };
      t.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); add(); } });
      container.appendChild(el('div', { class: 'chiprow tight gm-add' }, [t, button('Add', add, 'tiny')]));
      // the questions to put to the players, asked or not
      const qs = Object.assign({ note: '', items: [] }, (S().gm || {}).questions || {});
      const setQs = (patch) => State.commit('setGm', ['questions', Object.assign({}, qs, patch)]);
      container.appendChild(el('h4', { 'data-gm-id': 'questions' }, ['Questions for the table', el('span', { class: 'muted small' }, [' · ' + qs.items.filter((x) => !x.asked).length + ' not yet asked'])]));
      container.appendChild(G.note(() => qs.note, (v) => setQs({ note: v }), 'Add a note on the questions', draw));
      container.appendChild(el('ul', { class: 'gm-questions' }, qs.items.map((x, i) => el('li', { class: x.asked ? 'asked' : '', 'data-gm-id': x.id }, [
        el('input', { type: 'checkbox', checked: x.asked || null, title: 'Asked', onchange: (ev) => { const l = qs.items.slice(); l[i] = Object.assign({}, x, { asked: ev.target.checked }); setQs({ items: l }); } }),
        el('span', { class: 'gm-q', html: G.inline(x.text || '') }),
        button('×', () => setQs({ items: qs.items.filter((_, j) => j !== i) }), 'ghost tiny'),
      ]))));
      const nq = el('input', { class: 'text', type: 'text', placeholder: 'Add a question…' });
      container.appendChild(el('div', { class: 'chiprow tight gm-add' }, [nq, button('Add', () => { if (nq.value.trim()) setQs({ items: qs.items.concat([{ id: newId('q'), text: nq.value.trim(), asked: false }]) }); }, 'tiny')]));
      G.reveal(container);
    };
    redrawOn(ctx, container, draw);
    draw();
  }

  // ── Threads · NPCs: what is in play, and who is in the current scene ─────
  // threads = [{ id, title, text, sections, open, notes }] — notes are what happened to it in play
  const threads = () => JSON.parse(JSON.stringify(S().threads || []));
  const setThreads = (l) => State.commit('setThreads', [l]);
  // what a Storyteller character's record prints, in the book's own field names
  const NPC_FIELDS = ['Clan', 'Generation', 'Blood Potency', 'Humanity', 'Standard Dice Pools'];
  const npcLine = (r) => NPC_FIELDS.filter((k) => r.fields && r.fields[k] != null && r.fields[k] !== '').map((k) => k + ' ' + r.fields[k]).join(' · ');
  function renderThreads(container, ctx) {
    const draw = () => {
      container.innerHTML = '';
      const ts = threads();
      container.appendChild(el('h4', { 'data-gm-id': 'threads-note' }, ['Threads', el('span', { class: 'muted small' }, [' · ' + ts.filter((x) => x.open !== false).length + ' open, ' + ts.filter((x) => x.open === false).length + ' closed'])]));
      container.appendChild(G.note(() => (S().gm || {}).threadsNote, (v) => State.commit('setGm', ['threadsNote', v]), 'Add a note on the threads', draw));
      const upd = (x, patch) => { const l = threads(); const at = l.findIndex((y) => y.id === x.id); l[at] = Object.assign({}, l[at], patch); setThreads(l); };
      G.sections(container, ts, {
        redraw: draw, save: setThreads, addLabel: 'Open a thread…', fresh: () => ({ open: true }),
        cls: (x) => 'thread' + (x.open === false ? ' closed' : ''),
        badges: (x) => (x.open === false ? el('span', { class: 'chip' }, ['Closed']) : null),
        after: (x) => el('div', { class: 'thread-notes' }, [
          el('div', { class: 'prop-k' }, ['In play']),
          el('textarea', { class: 'text', rows: 2, placeholder: 'What has happened to it at the table…', oninput: debounce((ev) => upd(x, { notes: ev.target.value }), 400) }, [x.notes || '']),
        ]),
        actions: (x) => button(x.open === false ? 'Reopen' : 'Close', () => upd(x, { open: x.open === false }), 'ghost tiny'),
      });

      // NPCs: the scene's cast, each with what its record prints
      const sc = Sys().scene(Sys().currentSceneId());
      container.appendChild(el('h4', {}, ['In this scene', el('span', { class: 'muted small' }, [sc ? ' · ' + sc.name : ' · no scene'])]));
      const here = sc ? Sys().cast(sc.id) : [];
      container.appendChild(here.length ? el('ul', { class: 'items npc-list' }, here.map((r) => el('li', {}, [
        el('button', { class: 'ref', type: 'button', onclick: () => Panels.select({ kind: 'entity', id: r.id }) }, [D.recordLabel(r)]),
        el('span', { class: 'muted small' }, [' ' + npcLine(r)]),
      ]))) : el('div', { class: 'muted small' }, [sc ? 'No one yet — the Cast puts Storyteller characters in a scene.' : 'No scene in play — the Chronicle, or an arc entry’s “Play it”.']));
      G.reveal(container);
    };
    redrawOn(ctx, container, draw);
    ctx.on('scene:changed', draw);
    draw();
  }

  // ── People: the chronicle's people, and the Storyteller's notes on the characters ──
  // The engine's People pane (engine/gm-panes.js) has no way to say whom a section is about; here each
  // section's editor names them — a Storyteller character from the books or the chronicle's own layer,
  // or a member of the Coterie — and the section then shows in the Inspector and on the Coterie card.
  function aboutField(d, kind) {
    d.about = (d.about || []).slice();
    const box = el('div', { class: 'chiprow tight gm-about-edit' });
    const draw = () => {
      box.innerHTML = '';
      box.appendChild(el('span', { class: 'prop-k' }, ['About']));
      d.about.forEach((k, i) => {
        const r = kind === 'pc' ? null : D.record(k);
        box.appendChild(el('span', { class: 'chip' }, [r ? r.name : k, el('button', { class: 'ref tiny', type: 'button', title: 'remove', onclick: () => { d.about.splice(i, 1); draw(); } }, ['×'])]));
      });
      if (kind === 'pc') {
        const sel = el('select', { class: 'scope tiny', 'aria-label': 'About a member of the Coterie' }, [el('option', { value: '' }, ['+ a member of the Coterie…'])].concat((S().party || []).filter((m) => d.about.indexOf(m.name) === -1).map((m) => el('option', { value: m.name }, [m.name]))));
        sel.addEventListener('change', () => { if (sel.value) { d.about.push(sel.value); draw(); } });
        box.appendChild(sel);
      } else {
        const q = el('input', { type: 'search', class: 'text', placeholder: '+ a Storyteller character', 'aria-label': 'About someone' });
        const hits = el('span', { class: 'gm-about-hits' });
        q.addEventListener('input', debounce(() => {
          hits.innerHTML = '';
          const t = q.value.trim().toLowerCase();
          if (t.length < 2) return;
          D.records().filter((r) => r.kind === 'character' && r.name.toLowerCase().indexOf(t) !== -1 && d.about.indexOf(r.id) === -1).slice(0, 8)
            .forEach((r) => hits.appendChild(button('+ ' + r.name + ' · ' + ((D.indexBook(r.book) || {}).label || r.book), () => { d.about.push(r.id); draw(); }, 'ghost tiny')));
        }, 150));
        box.appendChild(q);
        box.appendChild(hits);
      }
    };
    draw();
    return box;
  }
  function renderPeople(container, ctx) {
    const draw = () => {
      container.innerHTML = '';
      container.appendChild(el('h4', { 'data-gm-id': 'people' }, ['The chronicle’s people']));
      G.sections(container, G.list('people'), { redraw: draw, save: (l) => G.setList('people', l), addLabel: 'Add someone…', fields: (d) => aboutField(d, 'people') });
      container.appendChild(el('h4', { 'data-gm-id': 'pc' }, ['Behind the Coterie', el('span', { class: 'muted small' }, [' · never sent to players'])]));
      G.sections(container, G.list('pc'), { redraw: draw, save: (l) => G.setList('pc', l), addLabel: 'Add a note on a character…', fields: (d) => aboutField(d, 'pc') });
      G.reveal(container);
    };
    redrawOn(ctx, container, draw);
    draw();
  }

  // ── Loresheets: which the chronicle's characters may take ──────────────
  // Every loresheet in the books (records.js kind 'loresheet', declared by the corpus's BASE),
  // by book; the Storyteller marks the ones available. None are, until marked.
  function renderLoresheets(container, ctx) {
    let q = '';
    const draw = () => {
      container.innerHTML = '';
      const on = new Set(S().loresheets || []);
      const all = D.records().filter((r) => r.kind === 'loresheet');
      // a checkbox keeps focus, and a pane never redraws under focus: draw here
      const set = (id, yes) => { const l = (S().loresheets || []).filter((x) => x !== id); if (yes) l.push(id); State.commit('setLoresheets', [l]); draw(); };
      // how the characters may be made: The Black Hand's own walk, for a Sabbat chronicle
      const bh = D.books().find((b) => b.id === 'black-hand');
      if (bh) {
        const yes = !!(S().creation || {}).blackHand;
        container.appendChild(el('h4', {}, ['Making characters']));
        container.appendChild(el('label', { class: 'lore-row' + (yes ? ' on' : '') }, [
          el('input', { type: 'checkbox', checked: yes || null, onchange: (ev) => { State.commit('setCreation', [{ blackHand: ev.target.checked }]); draw(); } }),
          ' Allow characters made with ' + bh.label + '’s options',
          el('span', { class: 'muted small' }, [' · Sabbat Predator types, a Path of Enlightenment; a character using them says so in the party, and says when it is not allowed']),
        ]));
      }
      // Summoned Stories' Road System: a Road in Humanity's place (its ACTOR "Cainite")
      const ss = D.books().find((b) => b.id === 'summoned-stories');
      if (ss) {
        const yes = !!(S().creation || {}).roads;
        if (!bh) container.appendChild(el('h4', {}, ['Making characters']));
        container.appendChild(el('label', { class: 'lore-row' + (yes ? ' on' : '') }, [
          el('input', { type: 'checkbox', checked: yes || null, onchange: (ev) => { State.commit('setCreation', [{ roads: ev.target.checked }]); draw(); } }),
          ' Allow characters made with ' + ss.label + '’s options',
          el('span', { class: 'muted small' }, [' · a Road and its rating in place of Humanity; a character using them says so in the party, and says when it is not allowed']),
        ]));
      }
      container.appendChild(el('h4', {}, ['Loresheets', el('span', { class: 'muted small' }, [' · ' + on.size + ' of ' + all.length + ' available to the characters'])]));
      const search = el('input', { type: 'search', class: 'search', placeholder: 'Find a loresheet…', value: q });
      search.addEventListener('input', debounce(() => { q = search.value.trim().toLowerCase(); draw(); search.focus(); }, 200));
      container.appendChild(search);
      if (on.size) container.appendChild(el('div', { class: 'chiprow tight' }, [button('None available', () => State.commit('setLoresheets', [[]]), 'ghost tiny')]));
      const byBook = {};
      all.filter((r) => !q || r.name.toLowerCase().indexOf(q) !== -1).forEach((r) => (byBook[r.book] = byBook[r.book] || []).push(r));
      D.books().forEach((b) => {
        const rs = byBook[b.id];
        if (!rs) return;
        container.appendChild(el('div', { class: 'lore-book' }, [
          el('div', { class: 'prop-k' }, [b.label, el('span', { class: 'muted' }, [' · ' + rs.filter((r) => on.has(r.id)).length + ' of ' + rs.length])]),
          ...rs.map((r) => el('label', { class: 'lore-row' + (on.has(r.id) ? ' on' : '') }, [
            el('input', { type: 'checkbox', checked: on.has(r.id) || null, onchange: (ev) => set(r.id, ev.target.checked) }),
            ' ', el('button', { class: 'ref', type: 'button', onclick: (ev) => { ev.preventDefault(); Panels.select({ kind: 'entity', id: r.id }); } }, [r.name]),
            el('span', { class: 'muted small' }, [' · ' + (r.levels || []).length + ' levels']),
          ])),
        ]));
      });
    };
    ctx.on('state:changed', () => { if (!editing(container)) draw(); });
    ctx.on('state:remote', () => { if (!editing(container)) draw(); });
    draw();
  }

  Panels.register('people', { label: 'People', render: renderPeople });
  Panels.register('loresheets', { label: 'Loresheets', render: renderLoresheets });
  Panels.register('notes', { label: 'Notes', render: renderNotes });
  Panels.register('scenes', { label: 'Scenes', render: renderScenes });
  Panels.register('threads', { label: 'Threads · NPCs', render: renderThreads });
})();
