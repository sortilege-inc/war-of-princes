// system/vtm5e/advance.js — Advancement (V8; the family's I16, as the L5R5e VTT has it): a page of
// its own over the sheet. Exit leaves the character as it was; Save archives it as a version
// ("Before advancement", or the name given) and makes the advanced character the current one — the
// op advancePartyMember (system/vtm5e/ops.js), a player's own character only. XP is never
// overspent.
//
// The prices are the core's Trait Costs table, read from the corpus ("Trait Costs: Experience",
// printed 151 — the core prints it twice with the same numbers, and the corpus holds it once,
// owner ruling 2026-09-24), found by its rows: "New level x 5" for an Attribute, "New level x 3" a Skill, "3" a
// Specialty, "New level x 5 / 7 / 6" a Discipline in-clan / other / Caitiff, "Ritual level x 3",
// "Formula level x 3", "3 per dot" an Advantage, "New level x 10" Blood Potency. "“New level” on
// that table means the level of Trait you want to buy … You cannot skip ahead" (Sea of Time), so
// every purchase is one dot.
//
// Which Discipline price applies is the corpus's too: in-clan = the Disciplines under the clan's
// own heading (VtmData.clanDisciplines); Caitiff "can learn any Discipline at the same price"
// (core, Caitiff); "Any thin-blood vampire can learn Thin-Blood Alchemy at the in-clan experience
// rate" (Players Guide).
window.VtmAdvance = (function () {
  const { el, button } = window.VttRender;
  const D = window.VtmData;
  const Sheet = () => window.VtmSheet;
  const State = () => window.VttState;

  const RULES = {
    experience: { id: '#vrHCXd0vLGMPgLyWdXtvaXW', name: 'Experience and Improvement' },
    seaOfTime: { id: '#v1HvNJoPRrmGtRAkhEChbjg', name: 'Sea of Time' },
  };
  const ROW = {   // the table's row labels, as printed (matched without regard to case)
    attribute: 'Increase Attribute', skill: 'Increase Skill', specialty: 'New Specialty',
    clan: 'Clan Discipline', other: 'Other Discipline', caitiff: 'Caitiff Discipline',
    ritual: 'Blood Sorcery Ritual', formula: 'Thin-blood Formula', advantage: 'Advantage', potency: 'Blood Potency',
  };

  // The Trait Costs table → { key: { times } | { perDot } | { fixed } }, or null where the core
  // printing it whole is not loaded
  function costs() {
    const want = Object.keys(ROW).map((k) => ROW[k].toLowerCase());
    const t = D.all(['core']).map((e) => e.table).find((tb) => {
      if (!tb) return false;
      const labels = tb.rows.map((r) => String(r[0] || '').toLowerCase());
      return want.every((w) => labels.indexOf(w) !== -1);
    });
    if (!t) return null;
    const out = { table: t };
    Object.keys(ROW).forEach((k) => {
      const row = t.rows.find((r) => String(r[0] || '').toLowerCase() === ROW[k].toLowerCase());
      const cell = String(row[1] || '');
      let m;
      if ((m = /x\s*(\d+)/i.exec(cell))) out[k] = { times: +m[1], text: cell };
      else if ((m = /^(\d+)\s+per dot$/i.exec(cell))) out[k] = { perDot: +m[1], text: cell };
      else if ((m = /^(\d+)$/.exec(cell.trim()))) out[k] = { fixed: +m[1], text: cell };
    });
    return out;
  }
  const price = (c, n) => (!c ? null : c.times ? c.times * n : c.perDot ? c.perDot * n : c.fixed);

  // which Discipline row prices a Discipline for this character, and why
  function disciplineRate(v, name) {
    const clan = String(v.Clan || '').trim();
    if (/caitiff/i.test(clan)) return { key: 'caitiff', why: 'Caitiff' };
    if (/thin-?blood/i.test(clan) && name === 'Thin-Blood Alchemy') return { key: 'clan', why: 'in-clan rate for a thin-blood (Players Guide)' };
    if (D.clanDisciplines(clan).indexOf(name) !== -1) return { key: 'clan', why: 'in-clan' };
    return { key: 'other', why: 'out-of-clan' };
  }

  // A purchase: { kind, key, to, cost, what, extra }. The advanced character is the one it started
  // as with the purchases applied in order, so taking one back is a recomputation.
  function apply(base, buys) {
    const v = JSON.parse(JSON.stringify(base));
    const discRow = (name) => {
      v.Disciplines = v.Disciplines || [];
      let r = v.Disciplines.find((x) => x.Discipline === name);
      if (!r) { r = { Discipline: name, Dots: 0, Powers: [] }; v.Disciplines.push(r); }
      r.Powers = r.Powers || [];
      return r;
    };
    buys.forEach((b) => {
      if (b.kind === 'attribute' || b.kind === 'skill') v[b.key] = b.to;
      else if (b.kind === 'potency') v['Blood Potency'] = b.to;
      else if (b.kind === 'discipline') { const r = discRow(b.key); r.Dots = b.to; if (b.extra && b.extra.power) r.Powers.push(b.extra.power); }
      else if (b.kind === 'ritual' || b.kind === 'formula') discRow(b.extra.discipline).Powers.push(b.key);
      else if (b.kind === 'specialty') (v.Specialties = v.Specialties || []).push({ Skill: b.extra.skill, Specialty: b.key });
      else if (b.kind === 'advantage') {
        v['Advantages & Flaws'] = v['Advantages & Flaws'] || [];
        const r = v['Advantages & Flaws'].find((x) => !x.Flaw && !x.Advantage && x.Name === b.key);
        if (r) r.Dots = b.to; else v['Advantages & Flaws'].push({ Name: b.key, Dots: b.to, Flaw: false });
      } else if (b.kind === 'loresheet') (v['Advantages & Flaws'] = v['Advantages & Flaws'] || []).push({ Name: b.key, Dots: b.to, Flaw: false, Advantage: b.extra.id });
    });
    // Health and Willpower follow their Attributes ("Health = Stamina + 3; Willpower = Composure +
    // Resolve") where the sheet held them at the formula's value
    const S = Sheet();
    const was = S.derived(base);
    const now = S.derived(v);
    ['Health', 'Willpower'].forEach((k) => { if (!+base[k] || +base[k] === was[k]) v[k] = now[k]; });
    return v;
  }

  function open(m) {
    if (document.querySelector('.advance-page')) return;
    const holder = el('div', { class: 'advance-page', role: 'dialog', 'aria-label': 'Advancement' }, [el('div', { class: 'adv-body' }, [el('p', { class: 'muted' }, ['Reading the core’s Trait Costs…'])])]);
    document.body.appendChild(holder);
    document.body.classList.add('advancing');
    D.ready(['core', 'players-guide']).then(() => page(m, holder)).catch((e) => { holder.innerHTML = ''; holder.appendChild(el('p', {}, [e.message, ' ', button('Close', () => { holder.remove(); document.body.classList.remove('advancing'); }, 'ghost')])); });
  }

  function page(m, box) {
    const S = Sheet();
    const memberNow = () => (State().state.party || []).find((x) => x.id === m.id) || m;
    const start = memberNow();
    const base = S.values(start);
    const x0 = S.xp(start);
    const C = costs();
    let earned = x0.earned;
    let label = 'Before advancement';
    const buys = [];
    const close = () => { box.remove(); document.body.classList.remove('advancing'); };
    const cur = () => apply(base, buys);
    const spent = () => x0.spent + buys.reduce((a, b) => a + b.cost, 0);
    const lastOf = (kind, key) => { for (let i = buys.length - 1; i >= 0; i--) if (buys[i].kind === kind && buys[i].key === key) return i; return -1; };
    const take = (kind, key) => { const i = lastOf(kind, key); if (i !== -1) { buys.splice(i, 1); draw(); } };
    const buy = (b) => { buys.push(b); draw(); };
    const openRule = (r) => (window.VtmOpenEntity || (() => {}))(r.id);
    const rule = (r) => el('button', { class: 'ref small', type: 'button', onclick: () => openRule(r) }, [r.name]);

    function save() {
      if (earned - spent() < 0) return;   // never more than the XP there is
      if (!buys.length) { if (earned !== x0.earned) S.change(memberNow(), { xpEarned: earned }, 'experience awarded'); close(); return; }
      const when = new Date().toISOString().slice(0, 10);
      const lines = buys.map((b) => ({ cost: b.cost, what: b.what, note: null, when }));
      const now = memberNow();
      const version = { id: State().genId('v'), label: label.trim() || 'Before advancement', date: when, character: JSON.parse(JSON.stringify(now.character || {})), live: JSON.parse(JSON.stringify(now.live || {})) };
      State().commit('advancePartyMember', [m.id, { version, character: cur(), live: { sheet: null, xpEarned: earned, xpSpent: spent(), xpLedger: x0.ledger.concat(lines) } }]);
      State().commit('appendLog', [{ at: Date.now(), kind: 'track', memberId: m.id, who: now.name || null,
        changes: [['Spent Experience', String(x0.spent), String(spent())]].concat(earned !== x0.earned ? [['Total Experience', String(x0.earned), String(earned)]] : []),
        cause: 'advanced: ' + lines.map((l) => l.what + ' (' + l.cost + ')').join(', ') + ' · archived as “' + version.label + '”' }]);
      close();
      window.VttBus.emit('state:remote', { view: true }, { local: true });
    }

    const dots = (n, max) => el('span', { class: 'adv-dots' }, ['●'.repeat(n) + '○'.repeat(Math.max(0, (max || 5) - n))]);
    // one row: the trait, − (takes back this page's last dot of it), its dots, + (the next dot, priced)
    function stepRow(label0, n, max, kind, key, cost, what, extra) {
      const mine = lastOf(kind, key) !== -1;
      const can = n < max && cost != null;
      return el('div', { class: 'adv-row' + (mine ? ' bought' : '') }, [
        el('span', { class: 'adv-k' }, [label0]),
        el('span', { class: 'adv-step' }, [
          el('button', { class: 'step', type: 'button', 'aria-label': 'Take back', disabled: mine ? null : true, onclick: () => take(kind, key) }, ['−']),
          dots(n, max),
          el('button', { class: 'step', type: 'button', 'aria-label': 'Buy the next dot', disabled: can ? null : true, onclick: () => buy({ kind, key, to: n + 1, cost, what: what(n), extra: extra ? extra() : null }) }, ['+']),
        ]),
        el('span', { class: 'adv-cost muted small' }, [can ? cost + ' XP' : '']),
      ]);
    }
    const section = (title, kids, open0) => el('details', { class: 'adv-sec', open: open0 ? true : null }, [el('summary', {}, [title])].concat(kids));
    const groups = (names) => {
      const by = [];
      names.forEach((t) => { const g = S.groupOf(t) || ''; let x = by.find((y) => y[0] === g); if (!x) by.push(x = [g, []]); x[1].push(t); });
      return by;
    };
    const opened = {};   // the sections open, kept across redraws
    const keepOpen = (sec, id) => { if (id in opened) sec.open = opened[id]; sec.addEventListener('toggle', () => { opened[id] = sec.open; }); return sec; };

    function draw() {
      const v = cur();
      const avail = earned - spent();
      box.innerHTML = '';
      const saveBtn = button('Save', save, 'btn adv-save');
      saveBtn.disabled = avail < 0 || (!buys.length && earned === x0.earned);
      box.appendChild(el('div', { class: 'adv-bar' }, [button('Exit', close, 'ghost'), el('h2', {}, ['Advancement']), saveBtn]));
      const body = el('div', { class: 'adv-body' });
      box.appendChild(body);
      body.appendChild(el('div', { class: 'adv-head' }, [el('b', {}, [start.name || base.Name || 'The character']), el('span', { class: 'muted small' }, [' · ', rule(RULES.experience), ' · ', rule(RULES.seaOfTime)])]));
      if (!C) { body.appendChild(el('p', { class: 'empty' }, ['The core’s Trait Costs table is not in the data, so nothing can be priced.'])); return; }

      // Experience, and what is being bought
      body.appendChild(el('div', { class: 'adv-xp' }, [
        el('span', { class: 'adv-x' }, [el('span', { class: 'prop-k' }, ['Earned']), el('button', { class: 'step', type: 'button', disabled: earned > 0 ? null : true, onclick: () => { earned -= 1; draw(); } }, ['−']), el('b', {}, [String(earned)]), el('button', { class: 'step', type: 'button', onclick: () => { earned += 1; draw(); } }, ['+'])]),
        el('span', { class: 'adv-x' }, [el('span', { class: 'prop-k' }, ['Spent']), el('b', {}, [String(spent())])]),
        el('span', { class: 'adv-x' + (avail < 0 ? ' over' : '') }, [el('span', { class: 'prop-k' }, ['Available']), el('b', {}, [String(avail)])]),
      ]));
      if (buys.length) {
        body.appendChild(el('div', { class: 'adv-review' }, [
          el('div', { class: 'prop-k' }, ['This advancement']),
          el('ul', { class: 'items' }, buys.map((b, i) => el('li', {}, [el('b', { class: 'num' }, [String(b.cost)]), ' ', b.what, i === buys.length - 1 ? button('take back', () => { buys.pop(); draw(); }, 'ghost tiny') : null]))
            .concat(['Health', 'Willpower'].filter((k) => +v[k] !== +(base[k] || S.derived(base)[k])).map((k) => el('li', { class: 'muted' }, [k + ' ' + (+(base[k] || S.derived(base)[k])) + ' → ' + v[k] + ' (it follows its Attributes)'])))),
          el('label', { class: 'small adv-label' }, ['Keep the character as it was, named ', el('input', { class: 'text small', type: 'text', value: label, oninput: (ev) => { label = ev.target.value; } })]),
        ]));
      }

      // Attributes and Skills: "New level x 5", "New level x 3"
      const attrs = groups(S.attributes()).map(([g, ts]) => el('div', { class: 'adv-group' }, [el('div', { class: 'sg-h' }, [g || 'Attributes'])].concat(ts.map((t) => {
        const n = +v[t] || 1;
        return stepRow(t, n, 5, 'attribute', t, price(C.attribute, n + 1), (k) => t + ' ' + k + ' → ' + (k + 1));
      }))));
      body.appendChild(keepOpen(section('Attributes · ' + C.attribute.text, attrs, true), 'attributes'));
      const skl = groups(S.skills()).map(([g, ts]) => el('div', { class: 'adv-group' }, [el('div', { class: 'sg-h' }, [g || 'Skills'])].concat(ts.map((t) => {
        const n = +v[t] || 0;
        return stepRow(t, n, 5, 'skill', t, price(C.skill, n + 1), (k) => t + ' ' + k + ' → ' + (k + 1));
      }))));
      body.appendChild(keepOpen(section('Skills · ' + C.skill.text, skl), 'skills'));

      // Specialties: "3"
      const spSkill = el('select', { class: 'scope' }, S.skills().map((t) => el('option', { value: t }, [t + (+v[t] ? ' (' + v[t] + ')' : '')])));
      const spName = el('input', { class: 'text small', type: 'text', placeholder: 'the specialty' });
      const spec = [
        el('ul', { class: 'items' }, (v.Specialties || []).map((x) => el('li', {}, [x.Skill + ' (' + x.Specialty + ')', lastOf('specialty', x.Specialty) !== -1 && buys[lastOf('specialty', x.Specialty)].extra.skill === x.Skill ? button('take back', () => take('specialty', x.Specialty), 'ghost tiny') : null]))),
        el('div', { class: 'adv-add' }, [spSkill, spName, button('Add · ' + price(C.specialty, 1) + ' XP', () => {
          const s = spName.value.trim();
          if (!s) return;
          buy({ kind: 'specialty', key: s, to: 1, cost: price(C.specialty, 1), what: 'Specialty: ' + spSkill.value + ' (' + s + ')', extra: { skill: spSkill.value } });
        }, 'ghost tiny')]),
      ];
      body.appendChild(keepOpen(section('Specialties · ' + C.specialty.text, spec), 'specialties'));

      // Disciplines: in-clan / other / Caitiff, a power for each dot bought
      const held = (v.Disciplines || []).filter((r) => r.Discipline);
      const disc = held.map((r) => {
        const rate = disciplineRate(v, r.Discipline);
        const n = +r.Dots || 0;
        const row = stepRow(r.Discipline, n, 5, 'discipline', r.Discipline, price(C[rate.key], n + 1), (k) => r.Discipline + ' ' + k + ' → ' + (k + 1), () => ({ power: null }));
        row.appendChild(el('span', { class: 'adv-why muted small' }, [rate.why + ' · ' + C[rate.key].text]));
        const i = lastOf('discipline', r.Discipline);
        const kids = [row];
        if (i !== -1) {
          const b = buys[i];
          const have = new Set(r.Powers || []);
          const options = S.powersFor(r.Discipline, b.to).filter((p) => p.kind === 'power' && (!have.has(p.name) || p.name === (b.extra || {}).power));
          if (options.length) kids.push(el('label', { class: 'adv-power small' }, ['The power this dot brings: ', el('select', { class: 'scope', onchange: (ev) => { b.extra = { power: ev.target.value || null }; b.what = r.Discipline + ' ' + (b.to - 1) + ' → ' + b.to + (b.extra.power ? ' (' + b.extra.power + ')' : ''); draw(); } },
            [el('option', { value: '' }, ['— choose later'])].concat(options.map((p) => el('option', { value: p.name, selected: p.name === (b.extra || {}).power || null }, [p.name + ' · ' + p.level + ' · ' + ((D.indexBook(p.book) || {}).label || p.book)]))))]));
        }
        return el('div', { class: 'adv-disc' }, kids);
      });
      const unheld = D.disciplines().filter((n) => !held.some((r) => r.Discipline === n));
      const newDisc = el('select', { class: 'scope' }, [el('option', { value: '' }, ['A new Discipline…'])].concat(unheld.map((n) => { const r = disciplineRate(v, n); return el('option', { value: n }, [n + ' · ' + price(C[r.key], 1) + ' XP (' + r.why + ')']); })));
      newDisc.addEventListener('change', () => { const n = newDisc.value; if (!n) return; const r = disciplineRate(v, n); buy({ kind: 'discipline', key: n, to: 1, cost: price(C[r.key], 1), what: n + ' 0 → 1', extra: { power: null } }); });
      body.appendChild(keepOpen(section('Disciplines · in-clan ' + C.clan.text + ', other ' + C.other.text + ', Caitiff ' + C.caitiff.text, disc.concat([el('div', { class: 'adv-add' }, [newDisc])])), 'disciplines'));

      // Rituals and formulae: "Ritual level x 3", "Formula level x 3" — at or below the Discipline's dots
      const rit = [];
      [['Blood Sorcery', 'ritual', 'Ritual'], ['Thin-Blood Alchemy', 'formula', 'Formula']].forEach(([dname, kind, word]) => {
        const r = (v.Disciplines || []).find((x) => x.Discipline === dname);
        if (!r || !(+r.Dots)) return;
        const have = new Set(r.Powers || []);
        const opts = S.powersFor(dname, +r.Dots).filter((p) => p.kind === 'ritual' && D.levelNumber(p) != null && !have.has(p.name));
        const pick = el('select', { class: 'scope' }, [el('option', { value: '' }, [word === 'Ritual' ? 'A ritual…' : 'A formula…'])].concat(opts.map((p) => el('option', { value: p.id }, [p.name + ' · ' + p.level + ' · ' + price(C[kind], D.levelNumber(p)) + ' XP']))));
        pick.addEventListener('change', () => { const p = opts.find((x) => x.id === pick.value); if (p) buy({ kind, key: p.name, to: D.levelNumber(p), cost: price(C[kind], D.levelNumber(p)), what: word + ': ' + p.name + ' (level ' + D.levelNumber(p) + ')', extra: { discipline: dname } }); });
        rit.push(el('div', { class: 'adv-add' }, [el('span', { class: 'adv-k' }, [dname + ' ' + r.Dots]), pick, el('span', { class: 'muted small' }, [C[kind].text])]));
      });
      if (rit.length) body.appendChild(keepOpen(section('Rituals and formulae', rit), 'rituals'));

      // Advantages: "3 per dot" — a line's next dot, a new line, a level of an available loresheet
      const lines = (v['Advantages & Flaws'] || []).filter((x) => !x.Flaw && !x.Advantage && x.Name);
      const adv = lines.map((x) => { const n = +x.Dots || 0; return stepRow(x.Name, n, 5, 'advantage', x.Name, price(C.advantage, 1), (k) => x.Name + ' ' + k + ' → ' + (k + 1)); });
      const aName = el('input', { class: 'text small', type: 'text', placeholder: 'a Merit or Background' });
      adv.push(el('div', { class: 'adv-add' }, [aName, button('Add · ' + price(C.advantage, 1) + ' XP a dot', () => {
        const nm = aName.value.trim();
        if (!nm || lines.some((x) => x.Name === nm)) return;
        buy({ kind: 'advantage', key: nm, to: 1, cost: price(C.advantage, 1), what: nm + ' 0 → 1' });
      }, 'ghost tiny')]));
      const on = new Set((State().state || {}).loresheets || []);
      const taken = new Set((v['Advantages & Flaws'] || []).map((x) => x.Advantage).filter(Boolean));
      const levels = D.records().filter((r) => r.kind === 'loresheet level' && on.has(r.loresheet) && !taken.has(r.id));
      if (on.size) {
        const lp = el('select', { class: 'scope' }, [el('option', { value: '' }, ['A loresheet level…'])].concat(levels.map((r) => el('option', { value: r.id }, [r.under + ' · ' + r.name + ' ' + '●'.repeat(r.rating) + ' · ' + price(C.advantage, r.rating) + ' XP']))));
        lp.addEventListener('change', () => { const r = levels.find((x) => x.id === lp.value); if (r) buy({ kind: 'loresheet', key: r.name, to: r.rating, cost: price(C.advantage, r.rating), what: 'Loresheet: ' + r.under + ' · ' + r.name, extra: { id: r.id } }); });
        adv.push(el('div', { class: 'adv-add' }, [lp]));
      } else adv.push(el('p', { class: 'muted small' }, ['No loresheets are available — the Storyteller makes them available.']));
      body.appendChild(keepOpen(section('Advantages · ' + C.advantage.text, adv), 'advantages'));

      // Blood Potency: "New level x 10"
      const bp = +v['Blood Potency'] || 0;
      body.appendChild(keepOpen(section('Blood Potency · ' + C.potency.text, [stepRow('Blood Potency', bp, 10, 'potency', 'Blood Potency', price(C.potency, bp + 1), (k) => 'Blood Potency ' + k + ' → ' + (k + 1))]), 'potency'));
    }
    draw();
    window.scrollTo(0, 0);
  }

  return { open, costs, apply, disciplineRate, RULES };
})();
