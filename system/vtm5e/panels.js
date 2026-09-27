// system/vtm5e/panels.js — the Storyteller's panels: Chronicle, Coterie, Inspector, Cast,
// Disciplines, Dice, Rules & Book, Log, Campaign. Registered into the engine's registry; the
// shell (engine/app.js) decides where they show. Every word of rules text shown comes from
// the corpus; a book's text is loaded when a panel first needs it.
(function () {
  const { el, button, debounce, dragSort } = window.VttRender;
  const D = window.VtmData;
  const E = window.VtmEntity;
  const Dice = window.VtmDice;
  const Sheet = window.VtmSheet;
  const State = window.VttState;
  const Panels = window.VttPanels;
  const Sys = () => window.VttSystem;
  const S = () => State.state;
  const MODULE = 'chronicle';

  // a link inside any rendered entity opens it in the Inspector here, not the reader
  window.VtmOpenEntity = (id) => Panels.select({ kind: 'entity', id });

  const currentScene = () => Sys().scene(Sys().currentSceneId());
  const progress = (sceneId) => ((S().progress || {})[MODULE] || {})[sceneId] || { done: false, notes: '' };
  function goTo(sceneId) {
    State.commit('setCurrentScene', [MODULE, sceneId]);
    window.VttBus.emit('scene:changed', { moduleId: MODULE, sceneId });
  }
  const editing = (container) => document.activeElement && /TEXTAREA|INPUT|SELECT/.test(document.activeElement.tagName) && container.contains(document.activeElement);
  const log = (entry) => State.commit('appendLog', [entry]);
  const loading = (what) => el('div', { class: 'muted small' }, ['Opening ' + what + '…']);

  // ── Chronicle: the Storyteller's scenes ────────────────────────────
  function renderChronicle(container, ctx) {
    const draw = () => {
      container.innerHTML = '';
      const scenes = S().scenes || [];
      const cur = currentScene();
      const done = scenes.filter((sc) => progress(sc.id).done).length;
      const add = el('input', { type: 'text', class: 'text small', placeholder: 'A new scene…' });
      const addIt = () => {
        const name = add.value.trim();
        if (!name) return;
        const id = State.genId('sc');
        State.commit('putScene', [{ id, name, cast: [] }]);
        add.value = '';
        if (!cur) goTo(id);
      };
      add.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); addIt(); } });
      container.appendChild(el('h4', {}, [(S().campaign || {}).name || 'The chronicle', el('span', { class: 'muted small' }, [scenes.length ? ' · ' + done + ' of ' + scenes.length + ' scenes done · drag to arrange' : ''])]));
      container.appendChild(el('div', { class: 'chiprow tight' }, [add, button('Add', addIt, 'tiny')]));
      if (!scenes.length) container.appendChild(el('div', { class: 'empty' }, ['No scenes yet. Write the first one above; put Storyteller characters in it from the Cast.']));
      const list = el('div', { class: 'scene-list' }, scenes.map((sc) => {
        const st = progress(sc.id);
        return el('div', { class: 'scene-row' + (cur && cur.id === sc.id ? ' current' : '') + (st.done ? ' done' : ''), 'data-id': sc.id, title: 'Drag to arrange' }, [
          el('span', { class: 'grip', 'aria-hidden': 'true' }, ['⋮⋮']),
          el('input', { type: 'checkbox', checked: st.done || null, title: 'Done', onchange: (ev) => State.commit('setSceneDone', [MODULE, sc.id, ev.target.checked]) }),
          el('button', { class: 'scene-link', type: 'button', onclick: () => goTo(sc.id) }, [sc.name]),
          (sc.cast || []).length ? el('span', { class: 'muted small' }, [sc.cast.length + ' in it']) : null,
        ]);
      }));
      dragSort(list, { item: '.scene-row', onDrop: () => {
        const ids = Array.from(list.querySelectorAll('.scene-row')).map((r) => r.dataset.id);
        State.commit('setScenes', [ids.map((id) => scenes.find((sc) => sc.id === id)).filter(Boolean)]);
      } });
      container.appendChild(list);

      if (cur) {
        const st = progress(cur.id);
        const name = el('input', { type: 'text', class: 'text', value: cur.name, onchange: (ev) => State.commit('putScene', [{ id: cur.id, name: ev.target.value.trim() || cur.name }]) });
        const here = Sys().cast(cur.id);
        container.appendChild(el('section', { class: 'scene' }, [
          el('h4', {}, ['This scene']),
          name,
          el('div', { class: 'chiprow tight' }, [
            button('Open on the table', () => window.open(window.VttConfig.pages.table + '?scene=' + encodeURIComponent(cur.id), (window.VttConfig.channel || 'vtt') + '-table'), 'tiny'),
            el('label', { class: 'small' }, [el('input', { type: 'checkbox', checked: st.done || null, onchange: (ev) => State.commit('setSceneDone', [MODULE, cur.id, ev.target.checked]) }), ' done']),
            button('remove', () => { if (confirm('Remove the scene "' + cur.name + '"?')) State.commit('removeScene', [cur.id]); }, 'ghost tiny'),
          ]),
          el('div', { class: 'prop-k' }, ['In it']),
          here.length ? el('div', { class: 'chiprow tight' }, here.map((r) => el('span', { class: 'chip' }, [
            el('button', { class: 'ref', type: 'button', onclick: () => Panels.select({ kind: 'entity', id: r.id }) }, [D.recordLabel(r)]),
            el('button', { class: 'ref tiny', type: 'button', title: 'take out', onclick: () => State.commit('setSceneCast', [cur.id, (cur.cast || []).filter((x) => x !== r.id)]) }, ['×']),
          ]))) : el('div', { class: 'muted small' }, ['No one yet — the Cast can put someone here.']),
          el('div', { class: 'prop-k' }, ['Storyteller’s notes', el('span', { class: 'muted' }, [' · never sent to players'])]),
          el('textarea', { class: 'text', rows: 6, placeholder: 'What happens here, who wants what, what the Beast might do…', oninput: debounce((ev) => State.commit('setSceneNotes', [MODULE, cur.id, ev.target.value]), 400) }, [st.notes || '']),
        ]));
      }
    };
    ctx.on('state:changed', () => { if (!editing(container)) draw(); });
    ctx.on('state:remote', draw);
    ctx.on('scene:changed', draw);
    draw();
  }

  // ── Coterie: the party ─────────────────────────────────────────────
  function characterLoader(label, cls) {
    const file = el('input', { type: 'file', accept: '.json,application/json', hidden: true, multiple: true });
    file.addEventListener('change', () => {
      const files = Array.from(file.files || []);
      Promise.all(files.map((f) => f.text().then((text) => Sheet.readMember(JSON.parse(text), f.name))))
        .then((members) => {
          members.forEach((m) => State.commit('addPartyMember', [m]));
          if (members.length) Panels.select({ kind: 'party', id: members[members.length - 1].id });
        })
        .catch((e) => alert(e.message))
        .finally(() => (file.value = ''));
    });
    return el('span', {}, [button(label, () => file.click(), cls), file]);
  }

  function renderParty(container, ctx) {
    const draw = () => {
      container.innerHTML = '';
      const party = S().party || [];
      const name = el('input', { type: 'text', class: 'text small', placeholder: 'Character' });
      const player = el('input', { type: 'text', class: 'text small', placeholder: 'Player' });
      const add = () => {
        try {
          const m = Sheet.newMember(name.value, player.value);
          State.commit('addPartyMember', [m]);
          Panels.select({ kind: 'party', id: m.id });
        } catch (e) { alert(e.message); }
      };
      container.appendChild(el('div', { class: 'chiprow tight' }, [name, player, button('Add', add, 'tiny')]));
      container.appendChild(el('div', { class: 'chiprow tight' }, [characterLoader('Load character file(s)…', 'ghost tiny')]));
      if (!party.length) container.appendChild(el('div', { class: 'empty' }, ['No one in the coterie yet.']));
      // a retinue follows its head, indented (engine/ops.js retinue: whoever claims the head plays it)
      const heads = party.filter((m) => !m.retinueOf || !party.some((x) => x.id === m.retinueOf));
      const ordered = [];
      heads.forEach((h) => { ordered.push(h); party.filter((x) => x.retinueOf === h.id).forEach((x) => ordered.push(x)); });
      party.forEach((m) => { if (ordered.indexOf(m) === -1) ordered.push(m); });
      ordered.forEach((m) => container.appendChild(el('div', { class: 'member' + (m.retinueOf ? ' retinue' : '') }, [
        el('button', { class: 'card static-card', type: 'button', onclick: () => Panels.select({ kind: 'party', id: m.id }) }, [
          el('div', { class: 'card-name' }, [m.name]),
          el('div', { class: 'card-meta' }, [Sheet.memberSentence(m)]),
          Sheet.isVampire(Sheet.values(m)) ? el('div', { class: 'hunger-mini' }, Array.from({ length: Dice.HUNGER_MAX }, (_, i) => el('span', { class: 'pip' + (i < Sheet.hunger(m) ? ' on' : '') }))) : null,
        ]),
        // the Storyteller's notes on this character (the People pane's "Behind the Coterie" sections about them)
        window.VttGmText ? window.VttGmText.aboutSections('pc', m.name, draw) : null,
        el('div', { class: 'member-ops' }, [
          el('select', { class: 'scope tiny', title: 'Whose retinue: whoever claims them plays this character too', onchange: (ev) => State.commit('setPartyRetinue', [m.id, ev.target.value || null]) },
            [el('option', { value: '' }, ['serves no one'])].concat(party.filter((x) => x.id !== m.id && !x.retinueOf).map((x) => el('option', { value: x.id, selected: m.retinueOf === x.id || null }, ['retinue of ' + x.name])))),
          button('file', () => Sheet.downloadMember(m), 'ghost tiny'),
          button('remove', () => { if (confirm('Remove ' + m.name + ' from the coterie?')) State.commit('removePartyMember', [m.id]); }, 'ghost tiny'),
        ]),
      ])));
    };
    ctx.on('state:changed', () => { if (!editing(container)) draw(); });
    ctx.on('state:remote', draw);
    draw();
  }

  // ── Inspector ──────────────────────────────────────────────────────
  // A printed pool pressed on a Storyteller character rolls in a roller under the entry,
  // logged under the character's name.
  function renderInspector(container, ctx) {
    let tray = null;
    const pool = (n, label) => {
      if (tray) tray.remove();
      tray = el('div', { class: 'inspector-roll' }, [Dice.roller({ pool: n, hunger: 0, label, who: 'Storyteller', onRoll: log, onRule: window.VtmOpenEntity })]);
      container.prepend(tray);
      tray.querySelector('.roll-btn').click();
    };
    const draw = () => {
      container.innerHTML = '';
      tray = null;
      const sel = Panels.selection();
      if (!sel) return container.appendChild(el('div', { class: 'empty' }, ['Nothing selected. Click a name anywhere — a scene’s cast, a power, a rule, a coterie member.']));
      if (sel.kind === 'entity') {
        const shown = D.entity(sel.id);
        if (!shown) {
          const b = D.bookOf(sel.id);
          if (!b) return container.appendChild(el('div', { class: 'empty' }, ['Not in the books: ' + sel.id]));
          container.appendChild(loading((D.indexBook(b) || {}).label));
          D.ready(b).then(draw);
          return;
        }
        const r = D.record(sel.id);
        // a stat block under a generic sub-heading shows as the whole entry it belongs to
        const e = r && D.generic(r) && shown.parent && D.entity(shown.parent) ? D.entity(shown.parent) : shown;
        const cur = currentScene();
        container.appendChild(el('div', { class: 'chiprow tight' }, [
          cur && r && r.kind === 'character' && (cur.cast || []).indexOf(r.id) === -1 ? button('Put in ' + cur.name, () => State.commit('setSceneCast', [cur.id, (cur.cast || []).concat([r.id])]), 'tiny') : null,
          el('a', { class: 'btn ghost tiny', href: './#books/' + encodeURIComponent(e.book) + '/' + encodeURIComponent(e.id), target: '_blank' }, ['In the reader']),
        ]));
        // the Storyteller's notes on this one (the People pane's sections "about" it)
        const about = window.VttGmText && window.VttGmText.aboutSections('people', r ? r.id : e.id, draw);
        if (about) container.appendChild(about);
        container.appendChild(el('div', { class: 'paper' }, [E.render(e, { onPool: pool, noKids: D.children(e.id).length > 12 })]));
      } else if (sel.kind === 'party') {
        const m = (S().party || []).find((x) => x.id === sel.id);
        const about = m && window.VttGmText && window.VttGmText.aboutSections('pc', m.name, draw);
        if (about) container.appendChild(about);
        container.appendChild(m ? Sys().liveSheet(m, { onRule: window.VtmOpenEntity }) : el('div', { class: 'empty' }, ['That character is no longer in the coterie.']));
      } else container.appendChild(el('div', { class: 'empty' }, ['Nothing to show for ' + sel.kind + '.']));
    };
    ctx.on('select', draw);
    ctx.on('state:changed', () => { const sel = Panels.selection(); if (sel && sel.kind === 'party' && !editing(container)) draw(); });
    ctx.on('state:remote', () => { const sel = Panels.selection(); if (sel && sel.kind === 'party') draw(); });
    draw();
  }

  // ── Cast: every Storyteller character the books print ──────────────
  function renderCast(container, ctx) {
    let q = '';
    let book = '';
    container.innerHTML = '';
    const search = el('input', { type: 'search', class: 'search', placeholder: 'A name, a clan…' });
    const scope = el('select', { class: 'scope' }, [el('option', { value: '' }, ['Every book'])].concat(D.books().filter((b) => b.counts.character).map((b) => el('option', { value: b.id }, [b.label + ' (' + b.counts.character + ')']))));
    const list = el('div');
    const drawList = () => {
      list.innerHTML = '';
      const t = q.toLowerCase();
      const all = D.characters().filter((r) => (!book || r.book === book) && (!t || (D.recordLabel(r) + ' ' + (r.under || '') + ' ' + ((r.fields || {}).Clan || '')).toLowerCase().indexOf(t) !== -1));
      const cur = currentScene();
      list.appendChild(el('div', { class: 'muted small' }, [all.length + ' Storyteller characters' + (cur ? ' · + puts one in ' + cur.name : '')]));
      list.appendChild(el('ul', { class: 'items toc' }, all.slice(0, 300).map((r) => el('li', {}, [
        cur ? el('button', { class: 'ref tiny', type: 'button', title: 'Put in ' + cur.name, onclick: () => { if ((cur.cast || []).indexOf(r.id) === -1) State.commit('setSceneCast', [cur.id, (cur.cast || []).concat([r.id])]); } }, ['+']) : null,
        el('button', { class: 'ref', type: 'button', onclick: () => Panels.select({ kind: 'entity', id: r.id }) }, [D.recordLabel(r)]),
        el('span', { class: 'muted small' }, [' · ' + [(r.fields || {}).Clan, (r.fields || {})['Standard Dice Pools'], (D.indexBook(r.book) || {}).label].filter(Boolean).join(' · ')]),
      ]))));
      if (all.length > 300) list.appendChild(el('div', { class: 'muted small' }, ['… and ' + (all.length - 300) + ' more; narrow the search.']));
    };
    search.addEventListener('input', debounce(() => { q = search.value.trim(); drawList(); }, 150));
    scope.addEventListener('change', () => { book = scope.value; drawList(); });
    container.appendChild(el('div', { class: 'search-row' }, [search, scope]));
    container.appendChild(list);
    ctx.on('scene:changed', drawList);
    drawList();
  }

  // ── Disciplines: powers by Discipline and level ────────────────────
  function renderDisciplines(container, ctx) {
    container.innerHTML = '';
    const art = (window.VtmArt || {}).disciplines || {};
    D.disciplines().forEach((name) => {
      const k = Object.keys(art).find((x) => x.toLowerCase() === name.toLowerCase());
      const mine = D.powers().filter((r) => r.discipline === name);
      const body = el('div');
      [1, 2, 3, 4, 5, null].forEach((lv) => {
        const at = mine.filter((r) => D.levelNumber(r) === lv);
        if (!at.length) return;
        body.appendChild(el('div', { class: 'phase-h' }, [lv ? 'Level ' + lv : 'Level not printed']));
        body.appendChild(el('ul', { class: 'items toc' }, at.map((r) => el('li', {}, [
          el('button', { class: 'ref', type: 'button', onclick: () => Panels.select({ kind: 'entity', id: r.id }) }, [r.name]),
          el('span', { class: 'muted small' }, [' · ' + (r.kind === 'ritual' ? 'ritual · ' : '') + (D.indexBook(r.book) || {}).label]),
        ]))));
      });
      container.appendChild(el('details', { class: 'book' }, [
        el('summary', {}, [k ? el('img', { class: 'disc-icon', src: art[k].src, alt: '' }) : null, name, el('span', { class: 'muted small' }, [' · ' + mine.length])]),
        body,
      ]));
    });
  }

  // ── Dice ───────────────────────────────────────────────────────────
  // Roll for the Storyteller or for a coterie member (whose Hunger the roller then uses and
  // keeps: a failed Rouse Check raises it). Every roll goes to the Log.
  function renderDice(container, ctx) {
    let who = '';
    const draw = () => {
      container.innerHTML = '';
      const party = S().party || [];
      const m = party.find((x) => x.id === who) || null;
      const pick = el('select', { class: 'scope' }, [el('option', { value: '' }, ['The Storyteller'])].concat(party.map((x) => el('option', { value: x.id, selected: x.id === who || null }, [x.name]))));
      pick.addEventListener('change', () => { who = pick.value; draw(); });
      container.appendChild(el('div', { class: 'chiprow tight' }, [el('span', { class: 'prop-k' }, ['Rolling for']), pick]));
      container.appendChild(Dice.roller({
        pool: 5, hunger: m ? Sheet.hunger(m) : 0, who: m ? m.name : 'Storyteller',
        onHunger: m ? (n, cause) => Sheet.setHunger(m, n, cause) : null,
        onRoll: (entry) => log(m ? Object.assign(entry, { memberId: m.id }) : entry),
        onWillpower: m ? (dice) => Sheet.spendWillpower(m, 'Willpower re-roll of ' + dice + (dice === 1 ? ' die' : ' dice')) : null,
        surge: m ? () => Sheet.surgeFor(m) : null,
        onRule: window.VtmOpenEntity,
      }));
    };
    ctx.on('state:remote', () => { if (!editing(container)) draw(); });
    draw();
  }

  // ── Rules & Book ───────────────────────────────────────────────────
  function renderRules(container, ctx) {
    container.innerHTML = '';
    const input = el('input', { type: 'search', class: 'search', placeholder: 'Search the open books… ( / )', autocomplete: 'off' });
    const scope = el('select', { class: 'scope' });
    const note = el('div', { class: 'muted small' });
    const results = el('div', { class: 'results' });
    const browser = el('div', { class: 'browser' });
    const drawScope = () => {
      const v = scope.value;
      scope.innerHTML = '';
      scope.appendChild(el('option', { value: '' }, ['The open books']));
      D.books().forEach((b) => scope.appendChild(el('option', { value: b.id }, [b.label + (D.loaded(b.id) ? '' : ' (open)')])));
      scope.value = v;
    };
    const bookIds = () => (scope.value ? [scope.value] : null);
    function tree(nodes) {
      return el('ul', { class: 'items toc' }, nodes.map((n) => el('li', {}, [
        n.chapter ? el('span', {}, [n.label]) : el('button', { class: 'ref', type: 'button', onclick: () => Panels.select({ kind: 'entity', id: n.id }) }, [n.label]),
        n.kids.length ? el('details', { class: 'chapter' }, [el('summary', { class: 'muted small' }, [n.kids.length + ' under it']), tree(n.kids)]) : null,
      ])));
    }
    function drawBrowser() {
      browser.innerHTML = '';
      const open = D.loadedBooks();
      note.textContent = open.length ? 'Open: ' + open.map((b) => D.indexBook(b).label).join(', ') : 'No book open yet — pick one above.';
      open.filter((b) => !scope.value || b === scope.value).forEach((b) => {
        browser.appendChild(el('details', { class: 'book', open: !!scope.value || null }, [
          el('summary', {}, [D.indexBook(b).label, el('span', { class: 'muted small' }, [' · ' + D.indexBook(b).counts.entities])]),
          tree(D.outline(b)),
        ]));
      });
    }
    const run = debounce(() => {
      results.innerHTML = '';
      const q = input.value.trim();
      browser.hidden = !!q;
      if (q.length < 2) return;
      const hits = D.search(q, bookIds(), 150);
      if (!hits.length) return results.appendChild(el('div', { class: 'empty' }, ['Nothing matches in the open books.']));
      results.appendChild(el('div', { class: 'muted small' }, [hits.length + (hits.length === 1 ? ' result' : ' results')]));
      hits.forEach((e) => results.appendChild(el('div', { class: 'hit' }, [
        e.lore ? el('span', {}, [e.name]) : el('button', { class: 'ref', type: 'button', onclick: () => Panels.select({ kind: 'entity', id: e.id }) }, [e.name]),
        el('span', { class: 'muted small' }, [' · ' + ((D.indexBook(e.book) || {}).label || e.book)]),
        (() => { const ex = D.excerpt(e, q, 60); return ex ? el('div', { class: 'muted small', html: E.inline(ex) }) : null; })(),
      ])));
    }, 150);
    input.addEventListener('input', run);
    scope.addEventListener('change', () => {
      const b = scope.value;
      if (b && !D.loaded(b)) {
        note.textContent = 'Opening ' + D.indexBook(b).label + '…';
        D.ready(b).then(() => { drawScope(); scope.value = b; drawBrowser(); run(); });
      } else { drawBrowser(); run(); }
    });
    drawScope();
    container.appendChild(el('div', { class: 'search-row' }, [input, scope]));
    container.appendChild(el('div', { class: 'chiprow tight' }, [note, button('Open every book', () => { note.textContent = 'Opening every book…'; D.readyAll().then(() => { drawScope(); drawBrowser(); run(); }); }, 'ghost tiny')]));
    container.appendChild(results);
    container.appendChild(browser);
    if (!D.loaded('core')) D.ready('core').then(() => { drawScope(); drawBrowser(); });
    else drawBrowser();
    container.focusSearch = () => input.focus();
  }

  // ── Log ────────────────────────────────────────────────────────────
  function renderLog(container, ctx) {
    const draw = () => {
      container.innerHTML = '';
      const entries = (S().log || []).slice().reverse();
      if (!entries.length) return container.appendChild(el('div', { class: 'empty' }, ['Nothing logged yet.']));
      entries.forEach((x) => container.appendChild(x.kind === 'roll' ? Dice.rollLine(x, window.VtmOpenEntity) : x.kind === 'track' ? Sheet.trackLine(x) : el('div', { class: 'roll-line' }, [
        el('span', { class: 'roll-who' }, [x.kind || 'note']), x.text || JSON.stringify(x),
      ])));
    };
    ctx.on('state:changed', draw);
    ctx.on('state:remote', draw);
    draw();
  }

  // ── Campaign ───────────────────────────────────────────────────────
  function renderCampaign(container, ctx) {
    const draw = () => {
      container.innerHTML = '';
      const c = S().campaign;
      const name = el('input', { type: 'text', value: c.name || '', class: 'text', onchange: (ev) => State.commit('setCampaign', [{ name: ev.target.value }]) });
      container.appendChild(el('div', { class: 'prop' }, [el('div', { class: 'prop-k' }, ['Chronicle']), el('div', { class: 'prop-v' }, [name])]));
      const party = S().party || [];
      container.appendChild(el('h4', {}, ['The coterie', el('span', { class: 'muted small' }, [' · saved in the pack'])]));
      container.appendChild(party.length ? el('ul', { class: 'items' }, party.map((m) => el('li', {}, [
        el('button', { class: 'ref', type: 'button', onclick: () => Panels.select({ kind: 'party', id: m.id }) }, [m.name]),
        el('span', { class: 'muted small' }, [' · ' + Sheet.memberSentence(m)]),
      ]))) : el('div', { class: 'empty' }, ['No one yet.']));
      const list = State.listCampaigns();
      container.appendChild(el('h4', {}, ['Chronicles in this browser']));
      container.appendChild(el('ul', { class: 'items' }, list.map((row) => el('li', {}, [
        row.id === State.id ? el('b', {}, [row.name || row.id]) : el('button', { class: 'ref', type: 'button', onclick: () => { State.switchTo(row.id); location.reload(); } }, [row.name || row.id]),
        row.id !== State.id ? button('remove', () => { if (confirm('Remove "' + row.name + '" from this browser? Save its pack first if you want it back.')) { State.remove(row.id); draw(); } }, 'ghost tiny') : null,
      ]))));
      const file = el('input', { type: 'file', accept: 'application/json', hidden: true, onchange: (ev) => {
        const f = ev.target.files[0];
        if (!f) return;
        f.text().then((txt) => {
          try { State.importPack(JSON.parse(txt)); location.reload(); } catch (e) { alert(e.message); }
        });
      } });
      container.appendChild(el('div', { class: 'chiprow' }, [
        button('New chronicle', () => { const n = prompt('Chronicle name'); if (n) { State.create(n, { campaign: { modules: [MODULE], books: [] } }); location.reload(); } }),
        button('Save pack (download)', () => State.downloadPack()),
        button('Restore pack…', () => file.click(), 'ghost'),
        file,
      ]));
      container.appendChild(el('p', { class: 'muted small' }, ['A pack is the chronicle as an instance: the coterie, the scenes and who is in them, every note and roll, as JSON. Keep packs with the chronicle; this browser is a cache.']));
    };
    ctx.on('state:changed', () => { if (!editing(container)) draw(); });
    draw();
  }

  Panels.register('chronicle', { label: 'Chronicle', render: renderChronicle });
  Panels.register('party', { label: 'Coterie', render: renderParty });
  Panels.register('inspector', { label: 'Inspector', render: renderInspector });
  Panels.register('cast', { label: 'Cast', render: renderCast });
  Panels.register('disciplines', { label: 'Disciplines', render: renderDisciplines });
  Panels.register('dice', { label: 'Dice', render: renderDice });
  Panels.register('rules', { label: 'Rules & Book', render: renderRules });
  Panels.register('log', { label: 'Log', render: renderLog });
  Panels.register('campaign', { label: 'Campaign', render: renderCampaign });

  window.VtmPanels = { currentScene, goTo, characterLoader, MODULE };
})();
