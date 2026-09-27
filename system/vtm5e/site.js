// system/vtm5e/site.js — what Vampire puts on the site: the books, the clans, the
// Disciplines, the Storyteller characters, the dice, and search. Every word of rules text
// comes from titterpig-dsl-vtm5e/0.5 through data/; this file decides what is listed where.
// A book's text is loaded when a tab first needs it (VtmData.ready).
window.VttSiteTabs = (function () {
  const { el, debounce } = window.VttRender;
  const D = window.VtmData;
  const E = window.VtmEntity;
  const Dice = window.VtmDice;
  const Art = () => window.VtmArt || { clans: {}, sects: {}, disciplines: {}, dice: {}, logos: {} };
  const Site = () => window.VttSite;

  // a link inside any rendered entity opens that entity in the reader
  window.VtmOpenEntity = (id) => {
    const b = D.bookOf(id);
    if (b) Site().go('books', [b, id]);
    else D.fetch(id).then((e) => e && Site().go('books', [e.book, id]));
  };
  const openRule = (id) => window.VtmOpenEntity(id);

  const mark = (entry, cls) => entry ? el('span', { class: 'mark ' + (cls || ''), style: '--mark:url("' + D.artUrl(entry.src) + '")', role: 'img' }) : null;
  const loading = (what) => el('div', { class: 'loading' }, [mark(Art().logos.ankh, 'spin'), ' Opening ' + what + '…']);

  // render into `page` once the books are in memory
  function withBooks(page, ids, what, fn) {
    const need = (Array.isArray(ids) ? ids : [ids]).filter((id) => !D.loaded(id));
    if (!need.length) return fn();
    page.appendChild(loading(what));
    D.ready(ids).then(() => {
      page.innerHTML = '';
      fn();
    }).catch((e) => { page.innerHTML = ''; page.appendChild(el('div', { class: 'empty' }, [e.message])); });
  }

  const kb = (n) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB');

  // ── the shelf ──────────────────────────────────────────────────────
  // Which shelf a book stands on. `campaign` is an instance's own layer
  // (build/build_layer.py) and stands on its own, ahead of everything; every other book
  // names its shelf in the index (build_data.py SHELVES) and an older build named none,
  // in which case it is one of the official books.
  const CAMPAIGN = 'campaign';
  const shelfOf = (b) => (b.kind === 'campaign' ? CAMPAIGN : (b.shelf || 'official'));

  function renderShelf(page, ctx) {
    const idx = D.index();
    const all = D.books();
    // The hero line describes THE BOOKS — the official corpus, the base included, carried
    // verbatim. It is summed from those books' own counts rather than taken from the
    // corpus total and reduced, so a shelf added later cannot silently skew it.
    const official = all.filter((b) => shelfOf(b) === 'official');
    const sum = (k) => official.reduce((n, b) => n + (b.counts[k] || 0), 0);
    page.appendChild(el('div', { class: 'hero' }, [
      mark(Art().logos.vampire, 'hero-logo'),
      el('p', { class: 'hero-sub' }, [
        String(official.filter((b) => b.kind !== 'base').length) + ' books, generated verbatim from the corpus — ',
        String(sum('entities')) + ' entries, ',
        String(sum('power')) + ' Discipline powers, ',
        String(sum('ritual')) + ' rituals and formulae, ',
        String(sum('character')) + ' Storyteller characters.',
      ]),
    ]));
    const card = (b) => {
      const c = b.counts;
      return el('a', { class: 'shelf-book' + (b.kind === 'errata' ? ' errata' : '') + (b.kind === 'campaign' ? ' campaign' : '') + (shelfOf(b) === 'third-party' ? ' third-party' : ''), href: ctx.href('books', [b.id]) }, [
        el('div', { class: 'shelf-title' }, [b.label]),
        el('div', { class: 'shelf-meta' }, [
          [c.chapters + ' chapters', c.entities + ' entries', c.power ? c.power + ' powers' : null, c.character ? c.character + ' characters' : null].filter(Boolean).join(' · '),
        ]),
        el('div', { class: 'shelf-size' }, [kb(b.bytes)]),
      ]);
    };
    // the campaign's own layer first, then the shelves in the order the build declares them
    const groups = [{ id: CAMPAIGN, label: 'This campaign', note: null }].concat(idx.shelves || [{ id: 'official', label: 'The books', note: null }]);
    const shown = groups.filter((g) => all.some((b) => shelfOf(b) === g.id && b.kind !== 'base'));
    shown.forEach((g) => {
      const books = all.filter((b) => shelfOf(b) === g.id && b.kind !== 'base');
      if (shown.length > 1) page.appendChild(el('h2', { class: 'shelf-group' }, [g.label]));
      if (g.note) page.appendChild(el('p', { class: 'muted small shelf-note' }, [g.note]));
      const shelf = el('div', { class: 'shelf' });
      books.forEach((b) => shelf.appendChild(card(b)));
      page.appendChild(shelf);
    });
    const base = all.find((b) => b.kind === 'base');
    if (base) page.appendChild(el('p', { class: 'muted small' }, ['Under the hood: ', el('a', { href: ctx.href('books', [base.id]) }, [base.label]), ' — the corpus BASE, the types every book instantiates.']));
  }

  // ── the reader ─────────────────────────────────────────────────────
  function contains(n, id) {
    return n.kids.some((k) => k.id === id || contains(k, id));
  }
  function outlineTree(bid, nodes, openId, ctx, depth) {
    return el('ul', { class: 'toc' + (depth ? '' : ' toc-top') }, nodes.map((n) => {
      const open = openId && (n.id === openId || contains(n, openId));
      const a = el('a', { class: 'ref' + (n.id === openId ? ' active' : ''), href: ctx.href('books', [bid, n.id]) }, [
        n.chapter && n.page != null ? el('span', { class: 'toc-page' }, [String(n.page)]) : null, n.label,
      ]);
      return el('li', {}, [
        n.kids.length ? el('details', { open: open || null }, [el('summary', {}, [a]), outlineTree(bid, n.kids, openId, ctx, (depth || 0) + 1)]) : a,
      ]);
    }));
  }

  function contentsOf(bid, n, ctx, title) {
    if (!n || !n.kids.length) return null;
    return el('div', { class: 'contents' }, [
      el('h4', {}, [title || 'In this section']),
      el('ul', { class: 'items' }, n.kids.map((k) => el('li', {}, [el('a', { class: 'ref', href: ctx.href('books', [bid, k.id]) }, [k.label])]))),
    ]);
  }

  const DEEP = 8;           // more nested headings than this: the text, then a list of what is under it
  function readingPage(bid, n, ctx) {
    const wrap = el('div', {});
    const t = D.trail(bid, n.id);
    wrap.appendChild(el('div', { class: 'crumbs' }, t.slice(0, -1).map((x, i) => [i ? ' › ' : null, el('a', { href: ctx.href('books', [bid, x.id]) }, [x.label])])));
    if (n.chapter) {
      const c = n.chapter;
      wrap.appendChild(el('h2', { class: 'chapter-h' }, [n.label]));
      wrap.appendChild(el('div', { class: 'entity-sub' }, [c.page != null ? 'from page ' + c.page : '', c.kind === 'lore' ? ' · transcribed in-world material' : '']));
      if (c.kind === 'lore') {
        wrap.appendChild(E.lore(c.text));
        return wrap;
      }
      if (n.kids.length <= 3) n.kids.forEach((k) => wrap.appendChild(E.render(k.entity, { noKids: k.kids.length > DEEP, onPool: pagePool })));
      else wrap.appendChild(contentsOf(bid, n, ctx, 'In this chapter'));
      return wrap;
    }
    const deep = n.kids.length > DEEP;
    wrap.appendChild(E.render(n.entity, { noKids: deep, onPool: pagePool }));
    if (deep) wrap.appendChild(contentsOf(bid, n, ctx));
    // the next heading, so a chapter reads on
    const flat = [];
    const walk = (ns) => ns.forEach((x) => { flat.push(x); walk(x.kids); });
    walk(D.outline(bid));
    const i = flat.findIndex((x) => x.id === n.id);
    let j = i + 1;
    if (!deep) while (j < flat.length && contains(n, flat[j].id)) j++;
    if (flat[j]) wrap.appendChild(el('div', { class: 'next' }, ['Next: ', el('a', { class: 'ref', href: ctx.href('books', [bid, flat[j].id]) }, [flat[j].label])]));
    return wrap;
  }

  // a pool pressed on a character in the reader rolls in a small tray at the foot of the page
  let tray = null;
  function pagePool(n, label) {
    if (!tray) {
      tray = el('div', { class: 'tray' });
      document.body.appendChild(tray);
    }
    tray.innerHTML = '';
    tray.appendChild(el('div', { class: 'tray-h' }, [label, el('button', { type: 'button', class: 'btn ghost tiny', onclick: () => { tray.remove(); tray = null; } }, ['close'])]));
    const r = Dice.roller({ pool: n, hunger: 0, label, onRule: openRule });
    tray.appendChild(r);
    r.querySelector('.roll-btn').click();
  }

  function renderBooks(container, path, ctx) {
    const page = el('div', { class: 'page' });
    container.appendChild(page);
    const bid = path[0] && D.indexBook(path[0]) ? path[0] : null;
    if (!bid) return renderShelf(page, ctx);
    const meta = D.indexBook(bid);
    withBooks(page, bid, meta.label, () => {
      // the shelf this book stands on is named in the crumb: a third-party title must not sit
      // under "The books" as though the publisher had printed it
      const g = ((D.index().shelves || []).concat([{ id: CAMPAIGN, label: 'This campaign' }])).find((x) => x.id === shelfOf(meta));
      page.appendChild(el('div', { class: 'crumbs' }, [el('a', { href: ctx.href('books', []) }, ['The books']),
        g && g.id !== 'official' ? [' › ', g.label] : null, ' › ', meta.label]));
      const openId = path[1] && D.node(bid, path[1]) ? path[1] : null;
      const results = el('div', { class: 'results' });
      const q = el('input', { type: 'search', class: 'search', placeholder: 'Search ' + meta.label + '…' });
      q.addEventListener('input', debounce(() => showHits(results, q.value.trim(), [bid], ctx), 250));
      const toc = el('nav', { class: 'site-toc' }, [q, results, outlineTree(bid, D.outline(bid), openId, ctx, 0)]);
      const n = openId ? D.node(bid, openId) : null;
      const body = el('div', { class: 'site-reader' }, [n ? readingPage(bid, n, ctx) : bookFront(bid, meta, ctx)]);
      page.appendChild(el('div', { class: 'reader' }, [toc, body]));
      const active = toc.querySelector('a.active');
      if (active) setTimeout(() => active.scrollIntoView({ block: 'center' }), 0);
    });
  }

  function bookFront(bid, meta, ctx) {
    const c = meta.counts;
    return el('div', {}, [
      el('h2', { class: 'chapter-h' }, [meta.label]),
      el('div', { class: 'entity-sub' }, [[c.chapters + ' chapters', c.entities + ' entries'].join(' · ')]),
      el('div', { class: 'contents' }, [
        el('h4', {}, ['Contents']),
        el('ul', { class: 'items chapters' }, D.outline(bid).map((n) => el('li', {}, [
          el('a', { class: 'ref', href: ctx.href('books', [bid, n.id]) }, [n.label]),
          n.page != null ? el('span', { class: 'muted small' }, [' · p. ' + n.page]) : null,
        ]))),
      ]),
    ]);
  }

  function showHits(results, term, bookIds, ctx) {
    results.innerHTML = '';
    if (term.length < 2) return;
    const hits = D.search(term, bookIds, 2000);
    const shown = hits.slice(0, 80);
    results.appendChild(el('div', { class: 'muted small' }, [hits.length + ' hits' + (hits.length > shown.length ? ' — the first ' + shown.length : '')]));
    shown.forEach((h) => {
      const ex = D.excerpt(h, term, 60);
      results.appendChild(el('div', { class: 'hit' }, [
        el('a', { class: 'ref', href: ctx.href('books', [h.book, h.id]) }, [h.name]),
        el('span', { class: 'etype' }, [(D.indexBook(h.book) || {}).label || h.book]),
        ex ? el('div', { class: 'muted small', html: E.inline(ex) }) : null,
      ]));
    });
  }

  // ── clans ──────────────────────────────────────────────────────────
  // The marks are the art pack's; what the books say is found by the clan's name in their
  // headings. The words searched for are this tool's (a name as the books spell it).
  const CLAN_WORDS = {
    Malkavian: ['Malkavian'], 'The Ministry': ['Ministry', 'Setite'], 'Thin-blood': ['Thin-blood', 'Thin-Blood', 'Thin-blooded', 'Thin-Blooded'],
    'Banu Haqim': ['Banu Haqim'], Caitiff: ['Caitiff'],
  };
  const BLOODLINES = ['Cappadocian', 'Harbingers of Skulls', 'Lamia', 'Nagaraja'];
  const CLAN_BOOKS = ['core', 'players-guide'];
  const clanChapter = (e) => /clans|caitiff|thin-blooded|ministry|hecata|lasombra/.test(e.file);

  function renderClans(container, path, ctx) {
    const page = el('div', { class: 'page' });
    container.appendChild(page);
    const name = path[0] && Art().clans[path[0]] ? path[0] : null;
    if (!name) {
      page.appendChild(el('h2', { class: 'chapter-h' }, ['The Clans']));
      const grid = (names) => el('div', { class: 'marks' }, names.map((n) => el('a', { class: 'mark-card', href: ctx.href('clans', [n]) }, [mark(Art().clans[n], 'clan-mark'), el('div', { class: 'mark-name' }, [n])])));
      const clans = Object.keys(Art().clans).filter((n) => BLOODLINES.indexOf(n) === -1).sort();
      page.appendChild(grid(clans));
      page.appendChild(el('h4', {}, ['Bloodlines']));
      page.appendChild(grid(BLOODLINES.filter((n) => Art().clans[n])));
      page.appendChild(el('h4', {}, ['Sects and hunters']));
      page.appendChild(el('div', { class: 'marks' }, Object.keys(Art().sects).map((n) => el(ctx.isOpen('search') ? 'a' : 'div', { class: 'mark-card', href: ctx.isOpen('search') ? ctx.href('search', [n]) : null }, [mark(Art().sects[n], 'clan-mark'), el('div', { class: 'mark-name' }, [n])]))));
      return;
    }
    const all = path[1] === 'all';
    withBooks(page, all ? D.books().map((b) => b.id) : CLAN_BOOKS, all ? 'every book' : 'the Core Rulebook and the Players Guide', () => {
      page.appendChild(el('div', { class: 'crumbs' }, [el('a', { href: ctx.href('clans', []) }, ['The Clans']), ' › ', name]));
      const words = CLAN_WORDS[name] || [name];
      const seen = new Set();
      const hits = [];
      words.forEach((w) => D.headingsNamed(w, all ? null : CLAN_BOOKS).forEach((e) => { if (!seen.has(e.id)) { seen.add(e.id); hits.push(e); } }));
      const lead = hits.find((e) => clanChapter(e) && words.some((w) => e.name === w || e.name === w + 's')) || hits.find((e) => clanChapter(e)) || hits[0];
      page.appendChild(el('div', { class: 'clan-head' }, [mark(Art().clans[name], 'clan-big'), el('h2', { class: 'chapter-h' }, [name])]));
      const cols = el('div', { class: 'reader' });
      const list = el('nav', { class: 'site-toc' }, [
        el('div', { class: 'muted small' }, [hits.length + ' headings name the ' + (BLOODLINES.indexOf(name) !== -1 ? 'bloodline' : 'clan') + (all ? ' across every book' : ' in the Core Rulebook and the Players Guide')]),
        all ? null : el('button', { type: 'button', class: 'btn ghost tiny', onclick: () => ctx.go('clans', [name, 'all']) }, ['Look in every book (' + kb(D.books().reduce((s, b) => s + b.bytes, 0)) + ')']),
      ]);
      let bookNow = null;
      const ul = el('ul', { class: 'toc' });
      hits.forEach((e) => {
        if (e.book !== bookNow) {
          bookNow = e.book;
          ul.appendChild(el('li', { class: 'toc-phase' }, [(D.indexBook(e.book) || {}).label]));
        }
        ul.appendChild(el('li', {}, [el('a', { class: 'ref', href: ctx.href('books', [e.book, e.id]) }, [e.name])]));
      });
      list.appendChild(ul);
      cols.appendChild(list);
      cols.appendChild(el('div', { class: 'site-reader' }, [lead ? E.render(lead, { noKids: D.children(lead.id).length > DEEP }) : el('div', { class: 'empty' }, ['No heading names ' + name + ' here.'])]));
      page.appendChild(cols);
    });
  }

  // ── Disciplines ────────────────────────────────────────────────────
  const artFor = (name) => {
    const d = Art().disciplines;
    const k = Object.keys(d).find((x) => x.toLowerCase() === String(name).toLowerCase());
    return k ? d[k] : null;
  };
  // the filter both Discipline pages share (owner: "the disciplines section should be filterable"):
  // a name or any printed word, the Discipline, the level, the kind, the book
  const discState = { q: '', disc: '', level: '', kind: '', book: '' };
  const kindOf = (r) => (r.kind === 'power' ? 'power' : r.discipline === 'Oblivion' ? 'ceremony' : r.discipline === 'Thin-Blood Alchemy' ? 'formula' : 'ritual');
  function discFilter(recs, onChange, withDisc) {
    const text = (r) => (r.name + ' ' + (r.under || '') + ' ' + Object.values(r.fields || {}).join(' ')).toLowerCase();
    const test = (r) => {
      const t = discState.q.toLowerCase();
      return (!withDisc || !discState.disc || r.discipline === discState.disc) && (!discState.level || String(D.levelNumber(r) || '') === discState.level)
        && (!discState.kind || kindOf(r) === discState.kind) && (!discState.book || r.book === discState.book) && (!t || text(r).indexOf(t) !== -1);
    };
    const q = el('input', { type: 'search', class: 'search', placeholder: 'A name, or any word the entry prints…', value: discState.q });
    const opt = (key, first, list) => {
      const sel = el('select', { class: 'scope' }, [el('option', { value: '' }, [first])].concat(list.map((o) => el('option', { value: o[0], selected: discState[key] === o[0] || null }, [o[1]]))));
      sel.addEventListener('change', () => { discState[key] = sel.value; onChange(); });
      return sel;
    };
    const books = D.books().filter((b) => recs.some((r) => r.book === b.id));
    const bar = el('div', { class: 'chiprow disc-filter' }, [q,
      withDisc ? opt('disc', 'Every Discipline', D.disciplines().map((n) => [n, n])) : null,
      opt('level', 'Every level', [1, 2, 3, 4, 5].map((n) => [String(n), 'Level ' + n])),
      opt('kind', 'Every kind', [['power', 'Powers'], ['ritual', 'Rituals'], ['ceremony', 'Ceremonies'], ['formula', 'Formulae']]),
      opt('book', 'Every book', books.map((b) => [b.id, b.label]))]);
    q.addEventListener('input', debounce(() => { discState.q = q.value.trim(); onChange(); }, 150));
    return { bar, test };
  }
  function renderDisciplines(container, path, ctx) {
    const page = el('div', { class: 'page' });
    container.appendChild(page);
    const names = D.disciplines();
    const name = path[0] && names.indexOf(path[0]) !== -1 ? path[0] : null;
    const recs = D.powers();
    if (!name) {
      page.appendChild(el('h2', { class: 'chapter-h' }, ['Disciplines']));
      page.appendChild(el('p', { class: 'muted' }, ['Every power, ritual, ceremony and formula the books print, by Discipline and level — ', String(recs.length), ' in all, from ', String(new Set(recs.map((r) => r.book)).size), ' books.']));
      page.appendChild(el('div', { class: 'marks' }, names.map((n) => el('a', { class: 'mark-card disc', href: ctx.href('disciplines', [n]) }, [
        artFor(n) ? el('img', { class: 'disc-mark', src: artFor(n).src, alt: '' }) : null,
        el('div', { class: 'mark-name' }, [n]),
        el('div', { class: 'muted small' }, [recs.filter((r) => r.discipline === n).length + ' entries']),
      ]))));
      const found = el('div', {});
      const count = el('span', { class: 'muted small' });
      const f = discFilter(recs, () => draw(), true);
      const draw = () => { const hit = recs.filter(f.test); count.textContent = hit.length + ' of ' + recs.length; found.innerHTML = ''; found.appendChild(recordTable(hit, ctx, true)); };
      page.appendChild(el('h4', {}, ['Every entry']));
      f.bar.appendChild(count);
      page.appendChild(f.bar);
      page.appendChild(found);
      draw();
      const lost = recs.filter((r) => !r.discipline || !r.level);
      if (lost.length) {
        page.appendChild(el('h4', {}, ['Not placed by Discipline and level', el('span', { class: 'muted small' }, [' · ' + lost.length])]));
        page.appendChild(el('p', { class: 'muted small' }, ['The corpus does not place these under a Discipline and a level.']));
        page.appendChild(recordTable(lost, ctx, true));
      }
      return;
    }
    page.appendChild(el('div', { class: 'crumbs' }, [el('a', { href: ctx.href('disciplines', []) }, ['Disciplines']), ' › ', name]));
    page.appendChild(el('div', { class: 'clan-head' }, [artFor(name) ? el('img', { class: 'disc-big', src: artFor(name).src, alt: '' }) : null, el('h2', { class: 'chapter-h' }, [name])]));
    const mine = recs.filter((r) => r.discipline === name);
    const cols = el('div', { class: 'reader' });
    const side = el('nav', { class: 'site-toc' });
    const view = el('div', { class: 'site-reader' });
    const openId = path[1] || null;
    const listed = el('div', {});
    const count = el('div', { class: 'muted small' });
    const f = discFilter(mine, () => drawSide(), false);
    const drawSide = () => {
      listed.innerHTML = '';
      const hit = mine.filter(f.test);
      count.textContent = hit.length + ' of ' + mine.length;
      [1, 2, 3, 4, 5, null].forEach((lv) => {
        const at = hit.filter((r) => D.levelNumber(r) === lv);
        if (!at.length) return;
        listed.appendChild(el('div', { class: 'toc-phase' }, [lv ? 'Level ' + lv : 'Level not printed']));
        listed.appendChild(el('ul', { class: 'toc' }, at.map((r) => el('li', {}, [
          el('a', { class: 'ref' + (r.id === openId ? ' active' : ''), href: ctx.href('disciplines', [name, r.id]) }, [r.name]),
          el('span', { class: 'muted small' }, [' · ' + (r.kind === 'power' ? '' : kindOf(r) + ' · ') + (D.indexBook(r.book) || {}).label]),
        ]))));
      });
    };
    side.appendChild(f.bar);
    side.appendChild(count);
    side.appendChild(listed);
    drawSide();
    cols.appendChild(side);
    cols.appendChild(view);
    page.appendChild(cols);
    if (openId && D.record(openId)) {
      withBooks(view, D.record(openId).book, (D.indexBook(D.record(openId).book) || {}).label, () => view.appendChild(E.render(D.entity(openId))));
    } else {
      // the Discipline's own chapter entry in the core, when it has one
      withBooks(view, 'core', 'the Core Rulebook', () => {
        const own = D.headingsNamed(name, ['core']).find((e) => e.name === name && /disciplines/.test(e.file));
        view.appendChild(own ? E.render(own, { noKids: true }) : el('div', { class: 'empty' }, ['The core prints no chapter entry for ' + name + '; its powers are listed at the left.']));
        view.appendChild(recordTable(mine, ctx, false));
      });
    }
  }

  function recordTable(list, ctx, withDisc) {
    return el('div', { class: 'table-wrap' }, [el('table', { class: 'records' }, [
      el('thead', {}, [el('tr', {}, [el('th', {}, ['Name']), withDisc ? el('th', {}, ['Discipline']) : null, el('th', {}, ['Level']), el('th', {}, ['Cost']), el('th', {}, ['Dice Pools']), el('th', {}, ['Book'])])]),
      el('tbody', {}, list.map((r) => el('tr', {}, [
        el('td', {}, [el('a', { class: 'ref', href: ctx.href('disciplines', [r.discipline || '-', r.id]), onclick: (ev) => { if (!r.discipline) { ev.preventDefault(); window.VtmOpenEntity(r.id); } } }, [r.name])]),
        withDisc ? el('td', {}, [r.discipline || '—']) : null,
        el('td', {}, [r.level || '—']),
        el('td', { html: E.inline((r.fields || {}).Cost || (r.fields || {}).Ingredients || '') }),
        el('td', { html: E.inline((r.fields || {})['Dice Pools'] || '') }),
        el('td', { class: 'muted small' }, [(D.indexBook(r.book) || {}).label]),
      ]))),
    ])]);
  }

  // ── Storyteller characters ─────────────────────────────────────────
  const castState = { q: '', book: '', kind: '' };
  const isQuick = (r) => !!(r.fields && r.fields['Standard Dice Pools']);
  function renderCharacters(container, path, ctx) {
    const page = el('div', { class: 'page' });
    container.appendChild(page);
    const openId = path[0] && D.record(path[0]) ? path[0] : null;
    if (openId) {
      const r = D.record(openId);
      page.appendChild(el('div', { class: 'crumbs' }, [el('a', { href: ctx.href('characters', []) }, ['Storyteller characters']), ' › ', D.recordLabel(r)]));
      withBooks(page, r.book, (D.indexBook(r.book) || {}).label, () => {
        // a stat block under a generic sub-heading opens as the whole entry it belongs to
        const e = D.entity(openId);
        const shown = D.generic(r) && e.parent && D.entity(e.parent) ? D.entity(e.parent) : e;
        page.appendChild(el('div', { class: 'crumbs' }, [el('a', { href: ctx.href('characters', []) }, ['Storyteller characters']), ' › ', D.recordLabel(r), ' · ', el('a', { href: ctx.href('books', [r.book, shown.id]) }, ['in the book'])]));
        page.appendChild(el('div', { class: 'site-reader solo' }, [E.render(shown, { onPool: pagePool })]));
        page.appendChild(el('p', { class: 'muted small' }, ['Press a printed pool to roll it.']));
      });
      return;
    }
    const all = D.characters();
    page.appendChild(el('h2', { class: 'chapter-h' }, ['Storyteller characters']));
    page.appendChild(el('p', { class: 'muted' }, ['Every stat block the books print — mortals, animals, ghouls, hunters and Kindred. Open one to roll its pools.']));
    const q = el('input', { type: 'search', class: 'search', placeholder: 'A name…', value: castState.q });
    const bk = el('select', { class: 'scope' }, [el('option', { value: '' }, ['Every book'])].concat(D.books().filter((b) => b.counts.character).map((b) => el('option', { value: b.id, selected: castState.book === b.id || null }, [b.label + ' (' + b.counts.character + ')']))));
    const kd = el('select', { class: 'scope' }, [['', 'Every kind'], ['full', 'Printed Attributes and Skills'], ['quick', 'Printed standard pools']].map((o) => el('option', { value: o[0], selected: castState.kind === o[0] || null }, [o[1]])));
    const count = el('span', { class: 'muted small' });
    const body = el('tbody');
    function apply() {
      const t = castState.q.toLowerCase();
      const rows = all.filter((r) => (!castState.book || r.book === castState.book) && (!castState.kind || (castState.kind === 'quick') === isQuick(r))
        && (!t || (r.name + ' ' + (r.under || '') + ' ' + ((r.fields || {}).Clan || '')).toLowerCase().indexOf(t) !== -1));
      count.textContent = rows.length + ' of ' + all.length;
      body.innerHTML = '';
      rows.forEach((r) => body.appendChild(el('tr', {}, [
        el('td', {}, [el('a', { class: 'ref', href: ctx.href('characters', [r.id]) }, [D.recordLabel(r)])]),
        el('td', { class: 'muted small' }, [D.generic(r) ? r.name : (r.under || '')]),
        el('td', {}, [(r.fields || {}).Clan || '']),
        el('td', { class: 'num' }, [(r.fields || {})['Blood Potency'] || '']),
        el('td', { class: 'small', html: E.inline((r.fields || {})['Standard Dice Pools'] || '') }),
        el('td', { class: 'muted small' }, [(D.indexBook(r.book) || {}).label]),
      ])));
    }
    q.addEventListener('input', debounce(() => { castState.q = q.value.trim(); apply(); }, 150));
    bk.addEventListener('change', () => { castState.book = bk.value; apply(); });
    kd.addEventListener('change', () => { castState.kind = kd.value; apply(); });
    page.appendChild(el('div', { class: 'chiprow' }, [q, bk, kd, count]));
    page.appendChild(el('div', { class: 'table-wrap' }, [el('table', { class: 'records' }, [
      el('thead', {}, [el('tr', {}, ['Name', 'Under', 'Clan', 'Blood Potency', 'Standard Dice Pools', 'Book'].map((h) => el('th', {}, [h])))]),
      body,
    ])]));
    apply();
  }

  // ── the dice ───────────────────────────────────────────────────────
  function renderDice(container, path, ctx) {
    const page = el('div', { class: 'page' });
    container.appendChild(page);
    page.appendChild(el('h2', { class: 'chapter-h' }, ['The dice']));
    page.appendChild(el('div', { class: 'dice-page' }, [Dice.roller({ pool: 5, hunger: 1, onRule: openRule })]));
    const rules = el('div', { class: 'dice-rules' });
    page.appendChild(rules);
    withBooks(rules, 'core', 'the Core Rulebook', () => {
      [Dice.RULES.results, Dice.RULES.criticals, Dice.RULES.hungerDice].forEach((r) => {
        const e = D.entity(r.id);
        if (e) rules.appendChild(E.render(e, { noKids: true }));
      });
    });
  }

  // ── search ─────────────────────────────────────────────────────────
  const searchState = { q: '' };
  function renderSearch(container, path, ctx) {
    const page = el('div', { class: 'page' });
    container.appendChild(page);
    if (path[0]) searchState.q = path[0];
    page.appendChild(el('h2', { class: 'chapter-h' }, ['Search the books']));
    const loadedNote = el('div', { class: 'muted small' });
    const recHits = el('div', { class: 'results' });
    const results = el('div', { class: 'results' });
    const q = el('input', { type: 'search', class: 'search wide', placeholder: 'A rule, a power, a name…', value: searchState.q });
    const loadAll = el('button', { type: 'button', class: 'btn ghost tiny', onclick: () => { loadAll.disabled = true; loadAll.textContent = 'Opening every book…'; D.readyAll().then(run); } }, ['Search every book (' + kb(D.books().reduce((s, b) => s + b.bytes, 0)) + ')']);
    function run() {
      const t = searchState.q;
      const n = D.loadedBooks().length;
      loadedNote.textContent = n ? 'Full text of the ' + n + ' open ' + (n === 1 ? 'book' : 'books') + ': ' + D.loadedBooks().map((b) => D.indexBook(b).label).join(', ') + '.' : 'No book is open yet — powers and characters are found by name below; open the books for the full text.';
      loadAll.hidden = n === D.books().length;
      recHits.innerHTML = '';
      const rs = D.searchRecords(t);
      if (rs.length) {
        recHits.appendChild(el('h4', {}, ['Powers, rituals and characters by name']));
        rs.slice(0, 60).forEach((r) => recHits.appendChild(el('div', { class: 'hit' }, [
          el('a', { class: 'ref', href: r.kind === 'character' ? ctx.href('characters', [r.id]) : ctx.href('disciplines', [r.discipline || '-', r.id]), onclick: (ev) => { if (r.kind !== 'character' && !r.discipline) { ev.preventDefault(); window.VtmOpenEntity(r.id); } } }, [D.recordLabel(r)]),
          el('span', { class: 'etype' }, [r.kind]),
          el('span', { class: 'muted small' }, [' · ' + [r.discipline, r.level, r.under].filter(Boolean).join(' · ') + ' · ' + D.indexBook(r.book).label]),
        ])));
      }
      showHits(results, t, null, ctx);
    }
    q.addEventListener('input', debounce(() => { searchState.q = q.value.trim(); run(); }, 250));
    page.appendChild(q);
    page.appendChild(el('div', { class: 'chiprow' }, [loadedNote, loadAll]));
    page.appendChild(recHits);
    page.appendChild(results);
    run();
    setTimeout(() => q.focus(), 0);
  }

  return [
    { id: 'books', label: 'The books', render: renderBooks, books: true },
    { id: 'clans', label: 'Clans', render: renderClans },
    { id: 'disciplines', label: 'Disciplines', render: renderDisciplines },
    { id: 'create', label: 'Making a character', render: (c, path, ctx) => window.VtmCreator.render(c, path, ctx) },
    { id: 'characters', label: 'Storyteller characters', render: renderCharacters },
    { id: 'dice', label: 'Dice', render: renderDice },
    { id: 'search', label: 'Search', render: renderSearch, books: true },
  ];
})();
