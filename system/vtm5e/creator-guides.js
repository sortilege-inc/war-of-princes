// system/vtm5e/creator-guides.js — the creator's guided steps (system/vtm5e/creator.js): placing
// Attributes and Skills against the spread the book prints, the free specialties, and walking a
// Predator type's grants one by one.
//
// Every number and name comes from the book's own sentences, parsed by the creator (the spread
// "one Attribute at 4; three Attributes at 3…", a distribution "Balanced: Three Skills at 3…",
// "Add free specialties to Academics, Craft…"), or from the Predator type's printed list of
// grants, shown verbatim beside the control that applies it. A grant this file cannot read is
// never guessed at: it is offered as a line for the Notes, as printed.
//
// A guide changes the draft through ctx.set(values patch) and keeps its own bookkeeping — which
// distribution was chosen, what a Predator grant added (so it can be undone, and so the Predator's
// Advantages do not count against the 7 points) — through ctx.setMeta(patch), in the creator's
// roster beside the draft, never in the character's values (never in the file).
window.VtmCreatorGuides = (function () {
  const { el, button, debounce } = window.VttRender;
  const D = window.VtmData;
  const Sheet = window.VtmSheet;

  const DOT = '●';
  const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5 };
  const num = (w) => (/^\d+$/.test(w) ? +w : WORDS[String(w).toLowerCase()] || null);
  // the book prints the distributions' names in small caps, which reach the data in lower case
  const MINOR = /^(a|an|and|the|of|to|in|on|or|for|at|by|with)$/;
  const titleCase = (t) => String(t || '').toLowerCase().split(/(\s+)/).map((w, k) => (k && MINOR.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join('');
  const say = (n) => ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] || String(n);

  // ── placing dots against a printed spread ──
  // spread { "4": 1, "3": 3, "2": 4, "1": 1 } — how many traits the book puts at each level.
  // base: the level a trait sits at when nothing is placed (1 for Attributes, 0 for Skills).
  // A level's button is spent when as many traits hold it as the book allows; clicking the level a
  // trait already holds returns it to the base.
  // bonus { trait: dots a later step legally added } — shown beside the trait, never counted here
  function allocator(names, v, spread, base, set, label, bonus) {
    const plus = bonus || {};
    const levels = Object.keys(spread).map(Number).sort((a, b) => b - a);
    const counted = levels.filter((l) => l !== base);
    const have = {};
    const own = (n) => Math.max(base, (+v[n] || base) - (plus[n] || 0));
    names.forEach((n) => { const x = own(n); have[x] = (have[x] || 0) + 1; });
    const need = (l) => spread[l] || 0;
    // what is still to place, and what is over
    const left = counted.map((l) => ({ l, left: need(l) - (have[l] || 0) }));
    const chip = (x) => el('span', { class: 'alloc-chip' + (x.left === 0 ? ' done' : x.left < 0 ? ' over' : '') }, [
      DOT.repeat(x.l) + ' ' + (x.left === 0 ? '✓' : x.left > 0 ? say(x.left) + ' to place' : say(-x.left) + ' too many'),
    ]);
    const rest = 'the rest stay at ' + base + (need(base) ? ' (the book: ' + say(need(base)) + ' at ' + base + ')' : '');
    const tally = el('div', { class: 'alloc-tally' }, [el('span', { class: 'prop-k' }, [label + ' still to place'])].concat(left.map(chip), [el('span', { class: 'muted small' }, [rest])]));
    const groups = [];
    names.forEach((n) => {
      const g = Sheet.groupOf(n) || '';
      if (!groups.length || groups[groups.length - 1].g !== g) groups.push({ g, names: [] });
      groups[groups.length - 1].names.push(n);
    });
    const row = (n) => {
      const cur = own(n);
      return el('div', { class: 'alloc-row' + (cur !== base ? ' placed' : '') }, [
        el('span', { class: 'alloc-name' }, [n, plus[n] ? el('span', { class: 'alloc-plus' }, [' +' + plus[n] + ' from the Predator type']) : null]),
        el('span', { class: 'alloc-levels' }, counted.map((l) => {
          const on = cur === l;
          const b = button(String(l), () => set({ [n]: (on ? base : l) + (plus[n] || 0) }), 'tiny' + (on ? '' : ' ghost'));
          b.title = on ? 'Back to ' + base : 'Put ' + n + ' at ' + l;
          if (!on && (have[l] || 0) >= need(l)) b.disabled = true;
          return b;
        })),
      ]);
    };
    return el('div', { class: 'alloc' }, [tally, el('div', { class: 'alloc-groups' }, groups.map((g) => el('div', { class: 'alloc-group' }, [g.g ? el('div', { class: 'group-h' }, [g.g]) : null].concat(g.names.map(row)))))]);
  }

  // ── Skills: pick the distribution, then place against it ──
  function skills(ctx, dists, free) {
    const { v, meta, set, setMeta } = ctx;
    const box = el('div', {});
    const chosen = dists.find((d) => d.name === meta.skillDist) || null;
    box.appendChild(el('div', { class: 'prop-k' }, ['Your Skill distribution']));
    box.appendChild(el('div', { class: 'dist-cards' }, dists.map((d) => el('button', {
      type: 'button', class: 'dist-card' + (chosen === d ? ' on' : ''), onclick: () => setMeta({ skillDist: chosen === d ? null : d.name }),
    }, [el('div', { class: 'dist-name' }, [titleCase(d.name)]), el('div', { class: 'small' }, [d.text.replace(/^[^:]*:\s*/, '').split(/\s*Add free specialties/)[0]])]))));
    if (!chosen) {
      box.appendChild(el('p', { class: 'muted' }, ['Choose one, and the Skills below are placed against it.']));
      return box;
    }
    box.appendChild(allocator(Sheet.skills(), v, chosen.spread, 0, set, 'Skills', predatorDots(meta).traits));
    box.appendChild(specialties(ctx, free));
    return box;
  }

  // the free specialties: one for each named Skill the character has, and "one more"
  function specialties(ctx, free) {
    const { v, meta, set } = ctx;
    const rows = (v.Specialties || []).slice();
    // a specialty a Predator grant added is not a free one
    const fromPredator = new Set(Object.values((meta.pred || {}).applied || {}).reduce((a, rec) => a.concat((rec.rows || []).filter(([f]) => f === 'Specialties').map(([, r]) => r.Skill + '|' + r.Specialty)), []));
    const own = rows.filter((r) => !fromPredator.has(r.Skill + '|' + r.Specialty));
    const box = el('div', { class: 'spec-guide' }, [el('div', { class: 'prop-k' }, ['Free specialties'])]);
    const write = (skill, text, i) => {
      const next = rows.slice();
      if (i === -1) { if (text != null) next.push({ Skill: skill, Specialty: text }); } else if (text != null) next[i] = { Skill: skill, Specialty: text }; else next.splice(i, 1);
      set({ Specialties: next });
    };
    free.named.forEach((skill) => {
      const has = (+v[skill] || 0) > 0;
      const i = rows.findIndex((r) => r.Skill === skill && !fromPredator.has(r.Skill + '|' + r.Specialty));
      box.appendChild(el('div', { class: 'spec-row' + (!has ? ' muted' : i !== -1 ? ' done' : '') }, [
        el('span', { class: 'alloc-name' }, [skill]),
        has ? el('input', { type: 'text', class: 'text', placeholder: 'a specialty in ' + skill, value: i !== -1 ? rows[i].Specialty : '', oninput: debounce((ev) => write(skill, ev.target.value.trim() || (i === -1 ? '' : null), i), 300) })
          : el('span', { class: 'small' }, ['no dots — no free specialty']),
      ]));
    });
    for (let k = 0; k < free.more; k++) {
      const named = new Set(free.named);
      const extra = own.filter((r) => !named.has(r.Skill));
      const r = extra[k] || null;
      const i = r ? rows.indexOf(r) : -1;
      const withDots = Sheet.skills().filter((sk) => (+v[sk] || 0) > 0 && !named.has(sk));
      const pickSkill = el('select', { class: 'scope', onchange: (ev) => write(ev.target.value, ev.target.value ? (r ? r.Specialty : '') : null, i) }, [el('option', { value: '' }, ['a Skill…'])].concat(withDots.map((sk) => el('option', { value: sk, selected: r && r.Skill === sk || null }, [sk]))));
      box.appendChild(el('div', { class: 'spec-row' + (r && r.Specialty ? ' done' : '') }, [
        el('span', { class: 'alloc-name' }, ['One more']), pickSkill,
        el('input', { type: 'text', class: 'text', placeholder: 'its specialty', value: r ? r.Specialty : '', disabled: r ? null : 'disabled', oninput: debounce((ev) => write(r.Skill, ev.target.value.trim(), i), 300) }),
      ]));
    }
    return box;
  }

  // ── details from the books, opened on demand ──
  // A <details> whose body is an entity as printed, its book loaded when first opened.
  const E = () => window.VtmEntity;
  // Is a book one this character draws on? The core always; another official book unless step 0's
  // Sources turned it off (meta.books: the official books on; none set = every one); a third-party
  // book only when its options were taken and acknowledged there.
  const ALWAYS = ['core', 'players-guide', 'base', 'errata'];   // the walk itself reads the core and the Players Guide
  function bookOn(meta, id) {
    const m = meta || {};
    const b = D.indexBook(id) || {};
    if (ALWAYS.indexOf(id) !== -1) return true;
    if (b.shelf === 'third-party') return !!(m.thirdParty && m.ack && (m.sources || []).indexOf(id) !== -1);
    return !m.books || m.books.indexOf(id) !== -1;
  }
  function detailsOf(summary, id, book, extra) {
    const box = el('details', { class: 'book-details' }, [el('summary', {}, summary)]);
    let filled = false;
    box.addEventListener('toggle', () => {
      if (!box.open || filled) return;
      filled = true;
      const body = el('div', { class: 'book-details-body' }, [el('div', { class: 'muted small' }, ['Opening…'])]);
      box.appendChild(body);
      (book && !D.loaded(book) ? D.ready([book]) : Promise.resolve()).then(() => {
        body.innerHTML = '';
        const e = D.entity(id);
        if (e) body.appendChild(E().render(e, { noKids: true }));
        if (extra) body.appendChild(extra());
      });
    });
    return box;
  }

  // ── Disciplines: each with its description, and its powers to take, with theirs ──
  // A Discipline's own chapter heading: the one carrying its Characteristics or its levels.
  function disciplineEntity(name) {
    const hs = D.all(['core', 'players-guide']).filter((e) => e.name === name && D.children(e.id).some((k) => k.name === 'Characteristics' || /^Level \d/.test(k.name)));
    return hs.find((e) => D.children(e.id).some((k) => k.name === 'Characteristics')) || hs[0] || null;
  }
  function disciplines(ctx, o) {
    const { v, set } = ctx;
    const rows = (v.Disciplines || []).map((r) => Object.assign({}, r, { Powers: (r.Powers || []).slice() }));
    const write = (next) => set({ Disciplines: next });
    const plus = predatorDots(ctx.meta).disciplines;
    const box = el('div', { class: 'disc-guide' });
    const known = D.disciplines();
    const ordered = (o.clan || []).concat(known.filter((n) => (o.clan || []).indexOf(n) === -1));
    rows.forEach((r, i) => {
      const own = Math.max(0, (+r.Dots || 0) - (plus[r.Discipline] || 0));
      const ent = r.Discipline ? disciplineEntity(r.Discipline) : null;
      const card = el('div', { class: 'disc-card' });
      card.appendChild(el('div', { class: 'disc-head' }, [
        el('select', { class: 'scope', onchange: (ev) => { const n = rows.slice(); n[i] = { Discipline: ev.target.value, Dots: r.Dots || 1, Powers: [] }; write(n); } },
          [el('option', { value: '' }, ['a Discipline…'])].concat(ordered.map((n) => el('option', { value: n, selected: n === r.Discipline || null }, [n + ((o.clan || []).indexOf(n) !== -1 ? ' (in-clan)' : '')])))),
        el('span', { class: 'alloc-levels' }, [1, 2, 3, 4, 5].map((l) => {
          const on = own === l;
          return button(String(l), () => { const n = rows.slice(); n[i] = Object.assign({}, r, { Dots: (on ? 0 : l) + (plus[r.Discipline] || 0) }); write(n); }, 'tiny' + (on ? '' : ' ghost'));
        })),
        plus[r.Discipline] ? el('span', { class: 'alloc-plus' }, ['+' + plus[r.Discipline] + ' from the Predator type']) : null,
        button('remove', () => { const n = rows.slice(); n.splice(i, 1); write(n); }, 'ghost tiny'),
      ]));
      if (ent) card.appendChild(detailsOf(['About ' + r.Discipline], ent.id, ent.book));
      if (r.Discipline && (+r.Dots || 0) > 0) {
        const avail = Sheet.powersFor(r.Discipline, +r.Dots).filter((x) => (x.kind === 'power' || x.kind === 'ritual') && bookOn(ctx.meta, x.book));
        const byLevel = {};
        avail.forEach((x) => { const l = D.levelNumber(x) || 0; (byLevel[l] = byLevel[l] || []).push(x); });
        const taken = new Set(r.Powers);
        card.appendChild(el('div', { class: 'prop-k' }, ['Powers · ' + r.Powers.length + ' taken for ' + (+r.Dots) + ' dot' + (+r.Dots === 1 ? '' : 's')]));
        Object.keys(byLevel).map(Number).sort((a, b) => a - b).forEach((l) => {
          card.appendChild(el('div', { class: 'power-level' }, [l ? 'Level ' + l : 'Other']));
          byLevel[l].forEach((x) => {
            const has = taken.has(x.name);
            const bk = (D.indexBook(x.book) || {}).label || x.book;
            const take = button(has ? 'taken ✓' : 'take', () => { const n = rows.slice(); n[i] = Object.assign({}, r, { Powers: has ? r.Powers.filter((q) => q !== x.name) : r.Powers.concat([x.name]) }); write(n); }, has ? 'tiny' : 'ghost tiny');
            card.appendChild(el('div', { class: 'power-row' + (has ? ' on' : '') }, [take, detailsOf([x.name, el('span', { class: 'muted small' }, [' · ' + bk + (x.kind === 'ritual' ? ' · ritual' : '')])], x.id, x.book)]));
          });
        });
      }
      box.appendChild(card);
    });
    box.appendChild(button('+ a Discipline', () => write(rows.concat([{ Discipline: '', Dots: 1, Powers: [] }])), 'ghost tiny'));
    return box;
  }

  // ── Advantages: the books' Merits, Backgrounds and Flaws, found, read and taken ──
  // Each is a typed entity (BASE Advantage / Merit / Flaw / Background) with its Rating, or a
  // printed range ("• to •••", "(• or ••)"). The core's full entries come first; the Players
  // Guide's summary sheet adds the rest of the line's, each citing its book and page.
  let advQuery = '', advKind = 'all', advBook = 'all';
  function advantageCatalogue() {
    // every book's, from the records index (data/records.js): no book is loaded to list them
    const order = D.books().map((b) => b.id);
    const out = [], seen = {};
    D.records().filter((r) => r.kind === 'advantage').sort((a, b) => order.indexOf(a.book) - order.indexOf(b.book)).forEach((r) => {
      const dots = r.dots || '';
      const flaw = r.type === 'Flaw' || /\bFlaw\b/i.test(dots) || /\bFlaws?$/i.test(r.under || '');
      const k = r.name.toLowerCase() + '|' + flaw;
      const groups = String(dots).split(/\s+(?:to|or)\s+/).map((g) => (g.match(/[•●]/g) || []).length).filter(Boolean);
      // five dots at most (owner, 2026-09-25): the Players Guide's master list prints Allies "• to ••••••"
      const choices = (r.rating ? [+r.rating] : groups.length === 2 && /\bto\b/.test(dots) ? Array.from({ length: groups[1] - groups[0] + 1 }, (_, n) => groups[0] + n) : groups).filter((n) => n <= 5);
      const x = { r, name: r.name, flaw, kind: flaw ? 'Flaw' : r.type === 'Background' ? 'Background' : 'Merit', choices, dots, parent: r.under || '', books: [r.book] };
      // a name printed in several books is one entry, citing each (the core's text first)
      // (the dots from whichever book prints them: the core's "Allies" heading has none, the Players
      // Guide's summary line "• to •••••")
      if (seen[k]) { const s = seen[k]; if (s.books.indexOf(r.book) === -1) s.books.push(r.book); if (!s.choices.length && choices.length) Object.assign(s, { choices, dots }); return; }
      seen[k] = x;
      out.push(x);
    });
    return out;
  }
  // the fullest printed entry of that name (the core's, over a summary line)
  const fullest = (name) => D.all(['core', 'players-guide']).filter((e) => e.name === name && e.desc).sort((a, b) => b.desc.length - a.desc.length)[0] || null;
  function advantages(ctx, o) {
    const { v, set } = ctx;
    const rows = (v['Advantages & Flaws'] || []).slice();
    const theirs = fromPredator(ctx.meta).advantages.map((r) => JSON.stringify(r));
    const box = el('div', { class: 'adv-guide' });
    // what the character has, each readable
    box.appendChild(el('div', { class: 'prop-k' }, ['Your Advantages and Flaws']));
    if (!rows.length) box.appendChild(el('p', { class: 'muted small' }, ['None yet — find them below.']));
    rows.forEach((r, i) => {
      const t = theirs.indexOf(JSON.stringify(r));
      const rec = r.Advantage ? D.records().find((q) => q.id === r.Advantage) : null;
      const f = rec ? { id: rec.id, book: rec.book } : fullest(r.Name);
      box.appendChild(el('div', { class: 'adv-row' }, [
        el('span', { class: 'adv-name' }, [(r.Flaw ? 'Flaw · ' : '') + r.Name]),
        el('span', { class: 'alloc-levels' }, [1, 2, 3, 4, 5].map((l) => button(String(l), () => { const n = rows.slice(); n[i] = Object.assign({}, r, { Dots: +r.Dots === l ? 0 : l }); set({ 'Advantages & Flaws': n }); }, 'tiny' + (+r.Dots === l ? '' : ' ghost')))),
        t !== -1 ? el('span', { class: 'muted small' }, ['from the Predator type']) : button('remove', () => { const n = rows.slice(); n.splice(i, 1); set({ 'Advantages & Flaws': n }); }, 'ghost tiny'),
        f ? detailsOf(['details'], f.id, f.book) : null,
      ]));
    });
    // the finder: every book's Merits, Backgrounds and Flaws -- and, where step 0 took them up,
    // the loresheets -- filtered by type and by book
    const lore = ctx.meta.lore || {};
    const loreOn = !!(lore.on && lore.ack);
    const recs = D.records();
    const cat = advantageCatalogue().concat(loreOn ? recs.filter((r) => r.kind === 'loresheet').map((r) => ({ r, name: r.name, kind: 'Loresheet', books: [r.book], parent: '', choices: [], dots: '' })) : [])
      .map((x) => Object.assign({}, x, { books: x.books.filter((b) => bookOn(ctx.meta, b)) })).filter((x) => x.books.length);
    const kinds = ['all', 'Merit', 'Background', 'Flaw'].concat(loreOn ? ['Loresheet'] : []);
    if (kinds.indexOf(advKind) === -1) advKind = 'all';
    const bookIds = D.books().map((b) => b.id).filter((id) => cat.some((x) => x.books.indexOf(id) !== -1));
    const q = el('input', { type: 'search', class: 'search', placeholder: 'Find a Merit, Background, Flaw' + (loreOn ? ' or loresheet' : '') + '…', value: advQuery });
    q.addEventListener('input', debounce(() => { advQuery = q.value; o.redraw(); }, 250));
    box.appendChild(el('div', { class: 'prop-k adv-find' }, ['Find in the books']));
    box.appendChild(el('div', { class: 'chiprow tight' }, [q].concat(kinds.map((k) => button(k === 'all' ? 'All' : k + 's', () => { advKind = k; o.redraw(); }, advKind === k ? 'tiny' : 'ghost tiny')))));
    box.appendChild(el('div', { class: 'chiprow tight' }, [el('span', { class: 'muted small' }, ['Source']),
      el('select', { class: 'scope', onchange: (ev) => { advBook = ev.target.value; o.redraw(); } }, [el('option', { value: 'all' }, ['every book'])]
        .concat(bookIds.map((id) => el('option', { value: id, selected: advBook === id || null }, [(D.indexBook(id) || {}).label || id]))))]));
    const ql = advQuery.trim().toLowerCase();
    const hits = cat.filter((x) => (advKind === 'all' || x.kind === advKind) && (advBook === 'all' || x.books.indexOf(advBook) !== -1)
      && (!ql || x.name.toLowerCase().indexOf(ql) !== -1 || x.parent.toLowerCase().indexOf(ql) !== -1
        || ((x.r && x.r.aliases) || []).some((a) => a.toLowerCase().indexOf(ql) !== -1)));   // either name finds it
    const shown = hits.slice(0, 40);
    const list = el('div', { class: 'adv-list' });
    const bookLabel = (x) => x.books.map((b) => (D.indexBook(b) || {}).label || b).join(', ');
    shown.forEach((x) => {
      if (x.kind === 'Loresheet') {
        // a loresheet: its levels, each read and taken like any Advantage
        const levels = recs.filter((r) => r.kind === 'loresheet level' && r.loresheet === x.r.id).sort((a, b) => (a.rating || 0) - (b.rating || 0));
        const card = el('div', { class: 'adv-hit adv-lore' }, [detailsOf([el('b', {}, [x.name]), el('span', { class: 'muted small' }, [((x.r.aliases || []).length ? ' (also ' + x.r.aliases.join(', ') + ')' : '') + ' · Loresheet · ' + levels.length + ' levels · ' + bookLabel(x)])], x.r.id, x.r.book)]);
        const lv = el('div', { class: 'lore-levels' });
        levels.forEach((l) => {
          const i = rows.findIndex((r) => r.Advantage === l.id);
          lv.appendChild(el('div', { class: 'power-row' + (i !== -1 ? ' on' : '') }, [
            button(i !== -1 ? 'taken ✓' : '+ ' + DOT.repeat(l.rating || 0), () => { const n = rows.slice(); if (i !== -1) n.splice(i, 1); else n.push({ Name: l.name, Dots: l.rating || 0, Flaw: false, Advantage: l.id }); set({ 'Advantages & Flaws': n }); }, i !== -1 ? 'tiny' : 'ghost tiny'),
            detailsOf([l.name], l.id, l.book),
          ]));
        });
        list.appendChild(el('div', {}, [card, lv]));
        return;
      }
      const add = (dots) => set({ 'Advantages & Flaws': rows.concat([{ Name: x.name, Dots: dots, Flaw: x.flaw, Advantage: x.r.id }]) });
      const adds = x.choices.length ? x.choices.map((d) => button('+ ' + DOT.repeat(d), () => add(d), 'ghost tiny')) : [button('+ add', () => add(0), 'ghost tiny')];
      list.appendChild(el('div', { class: 'adv-hit' }, [
        detailsOf([el('b', {}, [x.name]), el('span', { class: 'muted small' }, [' · ' + x.kind + (x.parent && !/^(Merits|Flaws|Backgrounds)$/.test(x.parent) ? ' · ' + x.parent : '') + (x.dots ? ' · ' + x.dots : '') + ' · ' + bookLabel(x)])], x.r.id, x.r.book),
        el('span', { class: 'chiprow tight' }, adds),
      ]));
    });
    box.appendChild(list);
    box.appendChild(el('p', { class: 'muted small' }, [hits.length > shown.length ? 'Showing ' + shown.length + ' of ' + hits.length + ' — narrow the search.' : hits.length + ' found.']));
    return box;
  }

  // ── Sea of Time: the coterie's age, its Generation and Blood Potency, and experience spent ──
  // The summary's own paragraphs: a band opens "childer:" / "neonates:" / "ancillae:", and the
  // lines under it say its Generations ("12th or 13th Generation: Blood Potency 1"), what each player
  // spends ("Each player spends 15 experience points") and adds ("adds 2 points of Advantages",
  // "subtracts 1 Humanity"). Spending is Advancement's (system/vtm5e/advance.js): the core's Trait
  // Costs table, read, and its purchases -- each one undone on its own.
  function seaBands(paras) {
    const bands = [];
    (paras || []).forEach((p) => {
      const m = /^([a-z][a-z ]+):\s*(.*)$/.exec(p);   // the bands' small caps reach the data in lower case
      if (m && !/Generation/i.test(m[1])) { bands.push({ name: m[1], text: m[2], lines: [], gens: [], xp: 0, adv: 0, flaws: 0, humanity: 0 }); return; }
      const b = bands[bands.length - 1];
      if (!b || !/[a-z]/.test(p)) return;         // the next section's heading ("TRAIT COSTS: EXPERIENCE") is no band's
      b.lines.push(p);
      let x;
      if ((x = /^((?:\d+\w\w,?\s*(?:or\s+)?)+)Generation(\s*\(thin-bloods\))?:\s*Blood Potency (\d+)/i.exec(p))) b.gens.push({ gens: x[1].match(/\d+/g).map(Number), thin: !!x[2], bp: +x[3], text: p });
      if ((x = /spends (\d+) experience points/i.exec(p))) b.xp = +x[1];
      if ((x = /adds (\d+) points? of Advantages/i.exec(p))) b.adv = +x[1];
      if ((x = /adds (\d+) points? of Flaws/i.exec(p))) b.flaws = +x[1];
      if ((x = /subtracts (\d+) Humanity/i.exec(p))) b.humanity = -x[1];
    });
    return bands;
  }
  function seaOfTime(ctx, s, o) {
    const { v, meta, set, setMeta } = ctx;
    const bands = seaBands(s.paras);
    const box = el('div', {});
    const band = bands.find((b) => b.name === meta.band) || null;
    box.appendChild(el('div', { class: 'prop-k' }, ['Your coterie are']));
    box.appendChild(el('div', { class: 'dist-cards' }, bands.map((b) => el('button', {
      type: 'button', class: 'dist-card' + (band === b ? ' on' : ''),
      onclick: () => { if (band === b) return; if ((meta.xpBuys || []).length && !window.confirm('Changing the coterie’s age takes back the experience already spent. Go on?')) return;
        let nv = Object.assign({}, v); (meta.xpBuys || []).slice().reverse().forEach((u) => { nv = undoBuy(nv, u); });
        setMeta({ band: b.name, xpBuys: [] }, Object.assign(nv, { 'Total Experience': b.xp || null, 'Spent Experience': b.xp ? 0 : null })); },
    }, [el('div', { class: 'dist-name' }, [titleCase(b.name)]), el('div', { class: 'small' }, [b.text]),
        el('div', { class: 'small muted' }, [b.lines.join(' · ')])]))));
    if (!band) return box;
    // Generation and Blood Potency, as the band prints them (a thin-blood's line only for a thin-blood)
    const gens = band.gens.filter((g) => g.thin === !!o.thin);
    if (gens.length) {
      box.appendChild(el('div', { class: 'prop-k' }, ['Generation and Blood Potency']));
      box.appendChild(el('div', { class: 'chiprow tight' }, gens.reduce((a, g) => a.concat(g.gens.map((n) => {
        const bp = g.bp + (o.potency || 0);
        const on = +v.Generation === n && +v['Blood Potency'] === bp;
        return button(n + 'th Generation · Blood Potency ' + bp, () => set({ Generation: n, 'Blood Potency': bp }), on ? 'tiny' : 'ghost tiny');
      })), [])));
      if (o.potency) box.appendChild(el('p', { class: 'muted small' }, ['Blood Potency includes the ' + o.potency + ' your Predator type adds.']));
    }
    if (!band.xp) return box;
    // experience, spent at the Trait Costs table's prices
    const A = window.VtmAdvance;
    const C = A && A.costs();
    if (!C) { box.appendChild(el('p', { class: 'muted' }, ['The core’s Trait Costs table is not in the data, so nothing can be priced.'])); return box; }
    const buys = meta.xpBuys || [];
    const spent = buys.reduce((a, b) => a + b.cost, 0);
    const left = band.xp - spent;
    const price = (c, n) => (!c ? null : c.times ? c.times * n : c.perDot ? c.perDot * n : c.fixed);
    const buy = (b) => {
      if (b.cost > left) return;
      const nv = A.apply(v, [b]);
      setMeta({ xpBuys: buys.concat([Object.assign({}, b, { from: b.from })]) }, Object.assign(nv, { 'Spent Experience': spent + b.cost, 'Total Experience': band.xp }));
    };
    box.appendChild(el('div', { class: 'xp-bar' }, [el('span', { class: 'prop-k' }, ['Experience']), el('b', {}, [left + ' of ' + band.xp + ' left']),
      el('span', { class: 'muted small' }, [' — ' + band.lines.find((l) => /experience points/i.test(l))])]));
    const sec = (title, kids) => box.appendChild(el('details', { class: 'xp-sec', open: 'open' }, [el('summary', {}, [title])].concat(kids)));
    const btn = (label, b) => { const x = button(label + ' · ' + b.cost + ' XP', () => buy(b), 'ghost tiny'); if (b.cost > left) x.disabled = true; return x; };
    const traits = (names, kind, c, max) => el('div', { class: 'chiprow tight' }, names.filter((n) => (+v[n] || 0) < max).map((n) => {
      const to = (+v[n] || 0) + 1;
      return btn(n + ' ' + (to - 1) + '→' + to, { kind, key: n, from: to - 1, to, cost: price(c, to), what: n + ' ' + (to - 1) + ' → ' + to });
    }));
    sec('Attributes · ' + C.attribute.text, [traits(Sheet.attributes(), 'attribute', C.attribute, 5)]);
    sec('Skills · ' + C.skill.text, [traits(Sheet.skills(), 'skill', C.skill, 5)]);
    // a specialty: a Skill the character has, and its name
    const sk = el('select', { class: 'scope' }, Sheet.skills().filter((n) => (+v[n] || 0) > 0).map((n) => el('option', { value: n }, [n])));
    const sp = el('input', { type: 'text', class: 'text', placeholder: 'the specialty' });
    const spBtn = button('Add · ' + price(C.specialty, 1) + ' XP', () => { if (sp.value.trim()) buy({ kind: 'specialty', key: sp.value.trim(), cost: price(C.specialty, 1), what: 'Specialty: ' + sk.value + ' (' + sp.value.trim() + ')', extra: { skill: sk.value } }); }, 'ghost tiny');
    if (price(C.specialty, 1) > left) spBtn.disabled = true;
    sec('Specialties · ' + C.specialty.text, [el('div', { class: 'chiprow tight' }, [sk, sp, spBtn])]);
    // Disciplines: each held, and a new one
    const known = D.disciplines();
    const held = (v.Disciplines || []).filter((d) => d.Discipline);
    const dBtns = held.filter((d) => (+d.Dots || 0) < 5).map((d) => {
      const rate = A.disciplineRate(v, d.Discipline); const to = (+d.Dots || 0) + 1;
      return btn(d.Discipline + ' ' + (to - 1) + '→' + to + ' (' + rate.why + ')', { kind: 'discipline', key: d.Discipline, from: to - 1, to, cost: price(C[rate.key], to), what: d.Discipline + ' ' + (to - 1) + ' → ' + to });
    });
    const nd = el('select', { class: 'scope' }, [el('option', { value: '' }, ['a new Discipline…'])].concat(known.filter((n) => !held.some((d) => d.Discipline === n)).map((n) => {
      const rate = A.disciplineRate(v, n); return el('option', { value: n }, [n + ' · ' + price(C[rate.key], 1) + ' XP (' + rate.why + ')']);
    })));
    nd.addEventListener('change', () => { const n = nd.value; if (!n) return; const rate = A.disciplineRate(v, n); buy({ kind: 'discipline', key: n, from: 0, to: 1, cost: price(C[rate.key], 1), what: n + ' 0 → 1' }); });
    sec('Disciplines · in-clan ' + C.clan.text + ', other ' + C.other.text + ', Caitiff ' + C.caitiff.text, [el('div', { class: 'chiprow tight' }, dBtns.concat([nd])), el('p', { class: 'muted small' }, ['Take a power for each new dot on the Disciplines step.'])]);
    // Advantages: a dot more on one held
    const advs = (v['Advantages & Flaws'] || []).filter((r) => !r.Flaw && r.Name && !r.Advantage && (+r.Dots || 0) < 5);
    sec('Advantages · ' + C.advantage.text, [el('div', { class: 'chiprow tight' }, advs.map((r) => btn(r.Name + ' ' + (+r.Dots || 0) + '→' + ((+r.Dots || 0) + 1), { kind: 'advantage', key: r.Name, from: +r.Dots || 0, to: (+r.Dots || 0) + 1, cost: price(C.advantage, 1), what: r.Name + ' ' + (+r.Dots || 0) + ' → ' + ((+r.Dots || 0) + 1) })))]);
    if (!o.thin) sec('Blood Potency · ' + C.potency.text, [el('div', { class: 'chiprow tight' }, [(+v['Blood Potency'] || 0) < 10 ? btn('Blood Potency ' + (+v['Blood Potency'] || 0) + '→' + ((+v['Blood Potency'] || 0) + 1), { kind: 'potency', key: 'Blood Potency', from: +v['Blood Potency'] || 0, to: (+v['Blood Potency'] || 0) + 1, cost: price(C.potency, (+v['Blood Potency'] || 0) + 1), what: 'Blood Potency ' + (+v['Blood Potency'] || 0) + ' → ' + ((+v['Blood Potency'] || 0) + 1) }) : null])]);
    // what has been bought, each undone on its own
    if (buys.length) {
      box.appendChild(el('div', { class: 'prop-k' }, ['Spent']));
      box.appendChild(el('ol', { class: 'grants' }, buys.map((b, k) => el('li', { class: 'grant done' }, [el('span', {}, [b.what + ' · ' + b.cost + ' XP ']),
        button('undo', () => { const nv = undoBuy(v, b); const rest = buys.filter((_, j) => j !== k); setMeta({ xpBuys: rest }, Object.assign(nv, { 'Spent Experience': rest.reduce((a, x) => a + x.cost, 0) })); }, 'ghost tiny')]))));
    }
    box.appendChild(el('details', { class: 'paper' }, [el('summary', {}, ['Trait Costs, as printed']), el('table', { class: 'plain' }, C.table.rows.map((r) => el('tr', {}, r.map((c) => el('td', {}, [String(c)])))))]));
    return box;
  }
  // a purchase taken back: the trait returns to what it was before it
  function undoBuy(v, b) {
    const nv = JSON.parse(JSON.stringify(v));
    if (b.kind === 'attribute' || b.kind === 'skill') nv[b.key] = b.from;
    else if (b.kind === 'potency') nv['Blood Potency'] = b.from;
    else if (b.kind === 'discipline') { const r = (nv.Disciplines || []).find((d) => d.Discipline === b.key); if (r) { if (b.from) r.Dots = b.from; else nv.Disciplines = nv.Disciplines.filter((d) => d !== r); } }
    else if (b.kind === 'specialty') { const i = (nv.Specialties || []).findIndex((x) => x.Skill === b.extra.skill && x.Specialty === b.key); if (i !== -1) nv.Specialties.splice(i, 1); }
    else if (b.kind === 'advantage') { const r = (nv['Advantages & Flaws'] || []).find((x) => !x.Flaw && x.Name === b.key); if (r) r.Dots = b.from; }
    return nv;
  }

  // ── a Predator type's grants, read ──
  // Each printed line becomes a grant of a kind this file can apply, or a note:
  //   specialty   "Add a specialty: Intimidation (Stickups) or Brawl (Grappling)"
  //   discipline  "Gain one dot of Celerity or Potence" (and "…of Oblivion and gain one dot of Fortitude or Potence")
  //   humanity    "Lose one dot of Humanity" / "Lose two dots of Humanity" / "Gain one dot of Humanity"
  //   potency     "Increase Blood Potency by one"
  //   split       "Spend three dots between the Fame and Herd Backgrounds"
  //   advantage   a Merit, Flaw or Background with its printed dots, or a choice of them
  //   note        anything else, as printed ("Slake one extra Hunger when you hunt alone")
  const ADV_WORD = /\b(Merit|Flaw|Advantage|Background)s?\b|[•●]|\bdots? of\b/;
  // category labels the book prints before the named Merit or Flaw ("Feeding Merit: Iron Gullet")
  const CATEGORY = /^(Feeding|Looks|Mythic|Haven|Influence|Herd|Retainers?|Mask|Substance Use|Bonding)$/i;
  const dotsIn = (t) => (t.match(/[•●]/g) || []).length;
  const stripParens = (t) => t.replace(/\s*\([^)]*\)/g, '').trim();

  function advantageOption(t) {
    const flaw = /\bFlaw\b/.test(t);
    let dots = dotsIn(t);
    const w = /\b(one|two|three|four|five) (?:additional )?dots? of (?:the )?(.+?)(?: Background)?$/i.exec(t);   // "two additional dots of migrating Herd"
    if (!dots && w) dots = num(w[1]);
    let name;
    if (w && !dotsIn(t)) name = w[2].replace(/^either\s+/i, '');
    else {
      // "Gain the Flaw Prey Exclusion (locals)", "Gain an Adversary (••)": the article and the kind are not the name
      const s = t.replace(/^(?:Gain\s+)?(?:either\s+)?(?:the\s+|an?\s+)?(?:(?:Merit|Flaw|Background|Advantage)\s+(?=[A-Z]))?/i, '');
      // the words before the printed dots ("Dark Secret (Mortal Ties)", "Feeding Merit: Iron Gullet")
      const before = s.split(/\s*\(?[•●]/)[0].replace(/:\s*$/, '').trim();
      // the words after them: a name ("Beautiful", "Prey Exclusion (mortals)"), not a description
      let after = ((/[•●]+\)?\s*(.*)$/.exec(s) || [])[1] || '').replace(/[.■]+\s*$/, '').trim();
      if (after.split(/\s+/).length > 4) after = after.split(/\s*\(/)[0];
      const shortAfter = after && after.split(/\s+/).length <= 4 && !/^[:(]/.test(after) && !/^(\w+\s+)?(Merit|Flaw)\b/.test(after) ? after : '';
      const [label, afterColon] = before.split(/:\s*/);
      const bare = (label || '').replace(/\s*\b(Merit|Flaw|Advantage|Background)\b\s*$/i, '').trim();
      if (afterColon) name = afterColon;
      else if (shortAfter) name = CATEGORY.test(bare) || !bare ? shortAfter : bare + ' (' + shortAfter + ')';
      else name = bare || s;
      name = name.replace(/\s*\b(Feeding|Mythic|Looks|Haven|Retainer|Mask)?\s*(Merit|Flaw|Advantage)\s*$/i, '').replace(/[•●]/g, '').replace(/\(\s*\)/g, '').replace(/^one\s+\w+\s+Flaw$/i, '').replace(/\s+/g, ' ').trim();
    }
    name = name.charAt(0).toUpperCase() + name.slice(1);
    // no dots in the grant: the rating the books give that Advantage, where it has one (Prey Exclusion ●)
    if (!dots) { const r = D.records().find((x) => x.kind === 'advantage' && x.rating && x.name === stripParens(name)); if (r) dots = +r.rating; }
    return { name, dots, flaw, text: t };
  }
  // "A or B": a choice only where each side names an Advantage of its own; "A and B" (each with its
  // dots) is both, in one choice. A choice is a list of Advantage lines.
  const own = (p) => dotsIn(p) || /\b(Merit|Flaw)\b/.test(p);
  function advantageOptions(t) {
    // "Gain three dots of Domain or Status, representing …": one of the two, each at those dots (the
    // rest of the line is what they represent; the grant keeps it as printed)
    const pick = /^Gain\s+(one|two|three|four|five) (?:additional )?dots? of ([A-Z][\w ]*?) or ([A-Z][\w ]*?)(?:,.*)?$/.exec(t);
    if (pick) return [pick[2], pick[3]].map((n) => [{ name: n.trim(), dots: num(pick[1]), flaw: false, text: t }]);
    const body = t.replace(/^Gain\s+(?:either\s+)?/i, '');
    const parts = body.split(/,?\s+or\s+(?:the\s+)?/);
    const choices = parts.length > 1 && parts.every(own) ? parts : [body];
    // "Gain one Haven Flaw: Creepy (•) or Haunted (•)": the Flaw said once is both sides'
    const allFlaws = /\bFlaw\b/.test(t) && !/\bMerit\b/.test(t);
    return choices.map((c) => {
      const both = c.split(/\s+and\s+/);
      return (both.length > 1 && both.every((p) => dotsIn(p)) ? both : [c]).map((p) => Object.assign(advantageOption('Gain ' + p), allFlaws ? { flaw: true } : {}));
    });
  }

  function parseGrant(t) {
    let m;
    if ((m = /^Add a specialty:?\s*(.+)$/i.exec(t))) {          // (Let the Streets Run Red prints no colon)
      return { kind: 'specialty', options: m[1].split(/,\s*(?:or\s+)?|\s+or\s+/).map((o) => { const x = /^(.+?)\s*\((.+)\)\s*$/.exec(o.trim()); return x ? { skill: x[1].trim(), spec: x[2].trim() } : null; }).filter(Boolean) };
    }
    if ((m = /^(Lose|Gain) (\w+) dots? of Humanity\.?$/i.exec(t))) return { kind: 'humanity', delta: (m[1].toLowerCase() === 'lose' ? -1 : 1) * num(m[2]) };
    if ((m = /^Increase (?:your )?Blood Potency by (\w+)\.?$/i.exec(t))) return { kind: 'potency', delta: num(m[1]) };
    const known = D.disciplines();
    const segs = t.split(/\s+and\s+gain\s+/i).map((sg) => /^(?:(?:Gain|Add)\s+)?one dot of (.+?)\.?$/i.exec(sg.trim()));   // "Add one dot of Fortitude or Protean"
    if (segs.every(Boolean)) {
      const sets = segs.map((x) => x[1].split(/\s+or\s+/).map((o) => ({ name: stripParens(o), text: o.trim() })));
      if (sets.every((s) => s.every((o) => known.indexOf(o.name) !== -1))) return { kind: 'discipline', sets };
    }
    if ((m = /^(?:Spend|Distribute) (\w+) dots between the (.+?) and (.+?) (Backgrounds|Flaws)\.?$/i.exec(t))) {
      return { kind: 'split', dots: num(m[1]), names: [m[2], m[3]], flaw: /Flaws/i.test(m[4]) };
    }
    if (/^Gain\b/i.test(t) && ADV_WORD.test(t)) return { kind: 'advantage', options: advantageOptions(t) };
    return { kind: 'note' };
  }
  const grantsOf = (entity) => (D.val(entity, 'Items') || []).map((x) => (x && typeof x === 'object' ? x.value : x)).map((t) => Object.assign({ text: t }, parseGrant(t)));

  // ── applying a grant, and undoing it ──
  // An application is recorded as the changes it made: { rows: [[field, row]], fields: [[field, from, to]], notes, humanity, potency }.
  function applyGrant(v, g, choice) {
    const patch = {}, rec = { rows: [], fields: [], choice };
    const rows = (f) => (patch[f] = patch[f] || (v[f] || []).slice());
    const addRow = (f, r) => { rows(f).push(r); rec.rows.push([f, r]); };
    if (g.kind === 'specialty') {
      const o = g.options[choice];
      // "If a Predator type adds a specialty for which you lack the matching Skill, gain a dot in that Skill instead."
      if ((+v[o.skill] || 0) > 0) addRow('Specialties', { Skill: o.skill, Specialty: o.spec });
      else { patch[o.skill] = (+v[o.skill] || 0) + 1; rec.fields.push([o.skill, +v[o.skill] || 0, patch[o.skill]]); }
    } else if (g.kind === 'discipline') {
      const names = g.sets.map((s, k) => (s.length === 1 ? s[0].name : s[(choice || [])[k]].name));
      const ds = rows('Disciplines');
      names.forEach((n) => {
        const i = ds.findIndex((d) => d.Discipline === n);
        if (i === -1) { const r = { Discipline: n, Dots: 1, Powers: [] }; ds.push(r); rec.rows.push(['Disciplines', r]); } else { ds[i] = Object.assign({}, ds[i], { Dots: (+ds[i].Dots || 0) + 1 }); rec.fields.push(['Disciplines:' + n, +ds[i].Dots - 1, +ds[i].Dots]); }
      });
    } else if (g.kind === 'advantage') {
      g.options[choice].forEach((o) => addRow('Advantages & Flaws', { Name: o.name, Dots: o.dots || 0, Flaw: o.flaw }));
    } else if (g.kind === 'split') {
      g.names.forEach((n) => addRow('Advantages & Flaws', { Name: n, Dots: 0, Flaw: g.flaw }));
    } else if (g.kind === 'note') {
      patch.Notes = ((v.Notes || '').trim() ? v.Notes.trim() + '\n' : '') + g.text;
      rec.note = g.text;
    } else if (g.kind === 'humanity') rec.humanity = g.delta;
    else if (g.kind === 'potency') rec.potency = g.delta;
    return { patch, rec };
  }
  function undoGrant(v, rec) {
    const patch = {};
    (rec.rows || []).forEach(([f, r]) => {
      const list = (patch[f] || v[f] || []).slice();
      const i = list.findIndex((x) => JSON.stringify(x) === JSON.stringify(r));
      if (i !== -1) list.splice(i, 1);
      patch[f] = list;
    });
    (rec.fields || []).forEach(([f, from]) => {
      if (f.indexOf('Disciplines:') === 0) {
        const n = f.slice(12), list = (patch.Disciplines || v.Disciplines || []).slice(), i = list.findIndex((d) => d.Discipline === n);
        if (i !== -1) list[i] = Object.assign({}, list[i], { Dots: from });
        patch.Disciplines = list;
      } else patch[f] = from;
    });
    if (rec.note) patch.Notes = (v.Notes || '').split('\n').filter((l) => l !== rec.note).join('\n');
    return patch;
  }

  // what the Predator's applied grants added to dotted traits — a Skill it gave a dot in place of a
  // specialty, a Discipline — so the earlier steps count only their own placements
  function predatorDots(meta) {
    const traits = {}, disciplines = {};
    Object.values((meta.pred || {}).applied || {}).forEach((rec) => {
      (rec.fields || []).forEach(([f, from, to]) => {
        if (f.indexOf('Disciplines:') === 0) disciplines[f.slice(12)] = (disciplines[f.slice(12)] || 0) + (to - from);
        else traits[f] = (traits[f] || 0) + (to - from);
      });
      (rec.rows || []).forEach(([f, r]) => { if (f === 'Disciplines') disciplines[r.Discipline] = (disciplines[r.Discipline] || 0) + (+r.Dots || 0); });
    });
    return { traits, disciplines };
  }
  // the Predator's applied grants: what they add that the other steps must count or expect
  function fromPredator(meta) {
    const applied = Object.values((meta.pred || {}).applied || {});
    return {
      advantages: applied.reduce((a, r) => a.concat((r.rows || []).filter(([f]) => f === 'Advantages & Flaws').map(([, x]) => x)), []),
      humanity: applied.reduce((a, r) => a + (r.humanity || 0), 0),
      potency: applied.reduce((a, r) => a + (r.potency || 0), 0),
    };
  }

  // ── the Predator step ──
  function predator(ctx, types, rule) {
    const { v, meta, set, setMeta } = ctx;
    const box = el('div', {});
    const pred = meta.pred && meta.pred.name === v.Predator ? meta.pred : { name: v.Predator || null, applied: {} };
    const undoAll = () => {
      let cur = Object.assign({}, v), patch = {};
      Object.values(pred.applied || {}).forEach((rec) => { const p = undoGrant(cur, rec); Object.assign(patch, p); cur = Object.assign(cur, p); });
      return patch;
    };
    const choose = (name) => {
      if (name === v.Predator) return;
      const applied = Object.keys(pred.applied || {}).length;
      if (applied && !window.confirm('Changing the Predator type takes back the ' + applied + ' grant' + (applied === 1 ? '' : 's') + ' already applied. Go on?')) return;
      const patch = undoAll();
      setMeta({ pred: { name: name || null, applied: {} } }, Object.assign(patch, { Predator: name }));
    };
    // each type as the book prints it: its name, its book, its description (the chosen one whole)
    box.appendChild(el('div', { class: 'prop-k' }, ['Predator type']));
    box.appendChild(el('div', { class: 'dist-cards pred-cards' }, types.map((p) => el('button', {
      type: 'button', class: 'dist-card' + (p.name === v.Predator ? ' on' : ''), onclick: () => choose(p.name === v.Predator ? '' : p.name),
    }, [el('div', { class: 'dist-name' }, [p.name]), el('div', { class: 'muted small' }, [(D.indexBook(p.entity.book) || {}).label || p.entity.book]),
        p.entity.desc ? el('div', { class: 'pred-desc' + (p.name === v.Predator ? '' : ' clamp') }, [E().prose(p.entity.desc)]) : null]))));
    const cur = types.find((p) => p.name === v.Predator);
    if (!cur) return box;
    const grants = grantsOf(cur.entity);
    const done = Object.keys(pred.applied || {}).length;
    box.appendChild(el('div', { class: 'prop-k' }, [cur.name + ' grants · ' + done + ' of ' + grants.length + ' applied']));
    const apply = (i, choice) => {
      const { patch, rec } = applyGrant(v, grants[i], choice);
      setMeta({ pred: { name: pred.name || v.Predator, applied: Object.assign({}, pred.applied, { [i]: rec }) } }, patch);
    };
    const undo = (i) => {
      const patch = undoGrant(v, pred.applied[i]);
      const a = Object.assign({}, pred.applied); delete a[i];
      setMeta({ pred: { name: pred.name || v.Predator, applied: a } }, patch);
    };
    const list = el('ol', { class: 'grants' });
    grants.forEach((g, i) => {
      const rec = (pred.applied || {})[i];
      const controls = [];
      if (rec) {
        controls.push(el('span', { class: 'grant-done' }, ['✓ ' + describe(g, rec)]), button('undo', () => undo(i), 'ghost tiny'));
      } else if (g.kind === 'specialty') {
        g.options.forEach((o, k) => controls.push(button(o.skill + ' (' + o.spec + ')' + ((+v[o.skill] || 0) > 0 ? '' : ' → a dot in ' + o.skill), () => apply(i, k), 'ghost tiny')));
      } else if (g.kind === 'discipline') {
        // one choice per "or"; a single Discipline is given with the choice
        const pick = g.sets.map((s) => (s.length === 1 ? 0 : null));
        const holder = el('span', { class: 'chiprow tight' });
        const draw = () => {
          holder.innerHTML = '';
          g.sets.forEach((s, k) => {
            if (s.length === 1) holder.appendChild(el('span', { class: 'small' }, [s[0].name + ' +1 and']));
            else s.forEach((o, j) => holder.appendChild(button(o.name + (pick[k] === j ? ' ✓' : ''), () => { pick[k] = j; if (pick.every((x) => x != null)) apply(i, pick.slice()); else draw(); }, pick[k] === j ? 'tiny' : 'ghost tiny')));
          });
          if (g.sets.every((s) => s.length === 1)) holder.appendChild(button('Apply', () => apply(i, pick.slice()), 'ghost tiny'));
        };
        draw();
        controls.push(holder);
      } else if (g.kind === 'advantage') {
        g.options.forEach((c, k) => controls.push(button('Add ' + c.map(label).join(' + '), () => apply(i, k), 'ghost tiny')));
      } else if (g.kind === 'split') {
        controls.push(button('Add ' + g.names.join(' and ') + ' lines', () => apply(i, 0), 'ghost tiny'), el('span', { class: 'muted small' }, [' then share the ' + say(g.dots) + ' dots between them on the Advantages step']));
      } else if (g.kind === 'humanity' || g.kind === 'potency') {
        controls.push(button('Apply', () => apply(i, 0), 'ghost tiny'), el('span', { class: 'muted small' }, [g.kind === 'humanity' ? ' counted when you set Humanity' : ' counted when you set Blood Potency']));
      } else {
        controls.push(button('Add to the Notes', () => apply(i, 0), 'ghost tiny'));
      }
      list.appendChild(el('li', { class: 'grant' + (rec ? ' done' : '') }, [el('div', { class: 'grant-text' }, [g.text]), el('div', { class: 'chiprow tight' }, controls)]));
    });
    box.appendChild(list);
    if (rule) box.appendChild(el('p', { class: 'muted small' }, [rule]));
    return box;
  }
  const label = (o) => o.name + (o.dots ? ' ' + DOT.repeat(o.dots) : '') + (o.flaw ? ' (Flaw)' : '');
  function describe(g, rec) {
    if (g.kind === 'specialty') { const o = g.options[rec.choice]; return rec.fields.length ? 'a dot in ' + o.skill + ' (no ' + o.skill + ' to take the specialty)' : o.skill + ' (' + o.spec + ')'; }
    if (g.kind === 'discipline') return g.sets.map((s, k) => (s.length === 1 ? s[0].name : s[(rec.choice || [])[k]].name) + ' +1').join(', ');
    if (g.kind === 'advantage') return g.options[rec.choice].map(label).join(' + ') + ' on the Advantages';
    if (g.kind === 'split') return g.names.join(' and ') + ' on the Advantages';
    if (g.kind === 'humanity') return (rec.humanity > 0 ? '+' : '') + rec.humanity + ' Humanity';
    if (g.kind === 'potency') return '+' + rec.potency + ' Blood Potency';
    return 'in the Notes';
  }

  return { bookOn, ALWAYS, seaOfTime, seaBands, detailsOf, allocator, skills, predator, disciplines, advantages, grantsOf, parseGrant, fromPredator, predatorDots, describe, titleCase };
})();
