// system/vtm5e/conflict.js — conflict, as the core prints it (V7; the family's I5/I16 in V5's
// terms). The Storyteller starts and ends a conflict for the whole coterie, in one of the core's
// variants — close combat, ranged combat, social combat, or a one-roll conflict — with the optional
// modules the core offers (Who Goes First?, Surprise Attacks, Three, Two, Done). While one is on,
// a player's sheet grows a Conflict tab: the variant's own pools, read from its rule text, and its
// options. Damage goes to the variant's track: Health for physical conflict, Willpower for social.
//
// Every rule is cited by its corpus id and printed name (check_shape asserts them); the pools are
// the "Attribute + Skill" pairs the variant's rule text names, never a hand-made list.
window.VtmConflict = (function () {
  const { el, button } = window.VttRender;
  const D = window.VtmData;
  const State = () => window.VttState;
  const S = () => State().state;
  const Sheet = () => window.VtmSheet;

  const RULES = {
    conflicts: { id: '#vzOscXIom0xpQhWJCUyoiLV', name: 'Conflicts' },
    turn: { id: '#vIQ2dKdyUPe4RxGwJASvSXX', name: 'The Conflict Turn' },
    pools: { id: '#vve8nXOIH1Y3ZJFLodN1ae1', name: 'Conflict Pools' },
    dodging: { id: '#v9Yx0u6XtOaYfZE7HIm0X8y', name: 'Dodging' },
    multiple: { id: '#vP8yvkgAN6DTy1MZ96CUO4T', name: 'Multiple Opponents' },
    rangedWeapons: { id: '#vAKl3h4BI4COVgdP0cfIEdS', name: 'Ranged Weapons' },
    tracking: { id: '#v8jE9nMR6clPx2zFJRQeRBR', name: 'Tracking Damage' },
    threeTwoDone: { id: '#vqPviq6HgnjZF6GD0A1GF9J', name: 'Three, Two, Done' },
    oneRoll: { id: '#vVwUfd5WKBZizsXhKPjGzxp', name: 'One-Roll Conflicts' },
    whoGoesFirst: { id: '#vc1ijoh5rDxqwwJiCWWkFHE', name: 'Who Goes First?' },
    surprise: { id: '#vXEH07wmNXEkblpuv6hUlrq', name: 'Surprise Attacks' },
    close: { id: '#vVElko0WeEXVEvWeCtLWDo3', name: 'Close Combat' },
    ranged: { id: '#vqeGIZ9hxwbMp2fcFYUlsLk', name: 'Ranged Combat' },
    social: { id: '#vLo5hE9sqUc3Q3Sd9a0lrXV', name: 'Advanced Conflict: Social Combat' },
    socialPool: { id: '#vev31sEC446LDc2MF925vLh', name: 'Social Conflict Pool' },
    socialWin: { id: '#vbqAFOeQRVdXdqWCYLt7OTv', name: 'Winning Social Combat' },
    weapons: { id: '#vAcu44c3N9LaYNIHu3B53vK', name: 'Sample Weapon Ratings' },
  };

  // The variants: which rule texts give the pools, which track takes the damage, which options apply.
  const VARIANTS = [
    { key: 'close', label: 'Physical combat — close', rules: ['close', 'dodging', 'multiple'], track: 'health', options: ['dodge', 'reach', 'opponent'] },
    { key: 'ranged', label: 'Physical combat — ranged', rules: ['ranged', 'rangedWeapons', 'multiple'], track: 'health', options: ['cover', 'range', 'opponent'] },
    { key: 'social', label: 'Social combat', rules: ['social', 'socialPool', 'socialWin'], track: 'willpower', options: [] },
    { key: 'oneRoll', label: 'One-roll conflict', rules: ['oneRoll'], track: null, options: [] },
  ];
  const variant = (k) => VARIANTS.find((x) => x.key === k) || VARIANTS[0];
  // "Every character has an *Initiative* rating equal to their Composure + Awareness." — Who Goes First?
  const INITIATIVE = ['Composure', 'Awareness'];
  // "A character with no available cover subtracts 2 from their defense pool, whereas superior
  //  cover … merits a bonus of 1-2." — Ranged Weapons; "Firing at a target beyond the effective range
  //  of a given weapon incurs a -2 dice penalty." — Ranged Combat; "loses one die from their pool
  //  when they defend against each successive opponent" — Multiple Opponents; "Award the combatant
  //  with the better reach … a bonus die in the first turn" — Close Combat (optional)
  const COVER = [['none', 'No cover', -2], ['limited', 'Limited cover', 0], ['superior1', 'Superior cover', 1], ['superior2', 'Superior cover', 2]];
  const RANGE_PENALTY = -2;
  const REACH_BONUS = 1;
  // "Simply set a difficulty for the opposition based on its power … Difficulty 2 … 4 … 6" and
  // "Adjust the Difficulty by 1" — One-Roll Conflicts
  const ONE_ROLL_DIFFICULTIES = [2, 4, 6];
  // "The first attack with successful surprise should generally be made against a static Difficulty 1"
  const SURPRISE_DIFFICULTY = 1;

  const current = () => S().conflict || null;
  const set = (c) => State().commit('setConflict', [c]);
  const note = (text) => State().commit('appendLog', [{ at: Date.now(), kind: 'conflict', text }]);
  const ruleLink = (k, open) => el('a', { class: 'rule-link', href: '#', onclick: (ev) => { ev.preventDefault(); (open || window.VtmOpenEntity)(RULES[k].id); } }, [RULES[k].name]);

  // A rule's printed text, its book loaded on demand: the DESCRIPTION and its listed items.
  const texts = {};
  function textOf(k) {
    if (texts[k]) return Promise.resolve(texts[k]);
    return D.fetch(RULES[k].id).then((e) => {
      // a list's items (each { value }) come marked as items, so a pool found in one takes the item's
      // own words as what it is for ("Stare down a rival gang uses Resolve + Intimidation.")
      const items = ((e && e.props) || []).filter((p) => p.vk === 'list')
        .map((p) => (p.items || []).map((x) => '• ' + (typeof x === 'string' ? x : x.value)).join('\n')).join('\n');
      texts[k] = [(e && e.desc) || '', items].join('\n');
      return texts[k];
    });
  }
  // The pools a variant's rules name: each "Attribute + Skill" pair both of whose halves the sheet
  // carries, with what the text says it is for ("for unarmed attacks"; an item's own words).
  function poolsIn(text, traitNames) {
    const out = [];
    const re = /([A-Z][a-z]+(?: [A-Z][a-z]+)?) \+ ([A-Z][a-z]+(?: [A-Z][a-z]+)?)/g;
    let m;
    while ((m = re.exec(text))) {
      const a = m[1], b = m[2];
      if (traitNames.indexOf(a) === -1 || traitNames.indexOf(b) === -1) continue;
      const after = /^\s+for ([^,.;]+)/.exec(text.slice(m.index + m[0].length));
      const line = text.slice(text.lastIndexOf('\n', m.index) + 1, m.index).trim();
      // what the pool is for: "… for unarmed attacks", or the list item it is named in; prose around
      // a pool in running text is not a label
      const why = after ? 'for ' + after[1] : line.startsWith('• ') ? line.slice(2).replace(/[;:,]?\s*(use|uses)?\s*$/i, '') : '';
      const pool = a + ' + ' + b;
      const had = out.find((x) => x.pool === pool);
      if (!had) out.push({ pool, a, b, why });
      else if (!had.why && why) had.why = why;
      else if (had.why && why && had.why !== why) out.push({ pool, a, b, why });   // the same pool for another purpose
    }
    return out;
  }

  // ── the Storyteller's panel ────────────────────────────────────────────
  let draft = { variant: 'close', initiative: false, surprise: false, three: true, difficulty: 4, adjust: 0, track: 'health' };
  function renderPanel(container, ctx) {
    const draw = () => {
      container.innerHTML = '';
      const c = current();
      if (!c) return drawStart(container, draw);
      const v = variant(c.variant);
      const party = S().party || [];
      const sc = window.VttSystem && window.VttSystem.scene(window.VttSystem.currentSceneId());
      const cast = sc ? window.VttSystem.cast(sc.id) : [];
      const track = c.track || v.track;
      container.appendChild(el('h4', {}, [v.label, el('span', { class: 'muted small' }, [' · turn ' + c.turn])]));
      container.appendChild(el('div', { class: 'chiprow tight small' }, v.rules.map((k) => ruleLink(k)).concat(c.variant === 'oneRoll' ? [el('span', { class: 'muted' }, ['Difficulty ' + c.difficulty + ' · ' + (track === 'willpower' ? 'Willpower' : 'Health')])] : [])));
      if (c.modules.three && c.turn >= 3) container.appendChild(el('div', { class: 'conflict-note small' }, ['Turn ' + c.turn + ' — ', ruleLink('threeTwoDone'), ': "try to end conflict scenes after three exchanges."']));
      // who acts first: the core's optional Initiative, Composure + Awareness, no test; ties to the players
      if (c.modules.initiative) {
        const rows = party.map((m) => ({ kind: 'pc', id: m.id, name: m.name, init: INITIATIVE.reduce((a, t) => a + (+Sheet().values(m)[t] || 0), 0) }))
          .concat(cast.map((r) => ({ kind: 'npc', id: r.id, name: window.VtmData.recordLabel(r), init: (c.npcInit || {})[r.id] })));
        rows.sort((x, y) => (y.init || 0) - (x.init || 0) || (x.kind === 'pc' ? -1 : 1) - (y.kind === 'pc' ? -1 : 1));
        container.appendChild(el('div', { class: 'prop-k' }, ['Initiative', el('span', { class: 'muted' }, [' · ' + INITIATIVE.join(' + ') + ', no test · ']), ruleLink('whoGoesFirst')]));
        container.appendChild(el('ol', { class: 'items init-order' }, rows.map((r) => el('li', {}, [r.name + ' ',
          r.kind === 'pc' ? el('b', {}, [String(r.init)]) : el('input', { type: 'number', class: 'text num small', min: 0, max: 20, value: r.init == null ? '' : r.init, placeholder: '?', title: 'The Storyteller character’s Initiative',
            onchange: (ev) => { const cc = current(); cc.npcInit = Object.assign({}, cc.npcInit || {}, { [r.id]: ev.target.value === '' ? null : +ev.target.value }); set(cc); } })]))));
      }
      // damage to the variant's track, halved where the rule says so
      container.appendChild(el('div', { class: 'prop-k' }, ['Damage', el('span', { class: 'muted' }, [' · to ' + (track === 'willpower' ? 'Willpower' : 'Health') + ' · ']), ruleLink('tracking')]));
      party.forEach((m) => container.appendChild(damageRow(m, c, track)));
      if (c.variant === 'oneRoll') container.appendChild(oneRollResults(c, party));
      container.appendChild(el('div', { class: 'chiprow tight' }, [
        button('Next turn', () => { const cc = current(); cc.turn += 1; set(cc); note(v.label + ': turn ' + cc.turn); }, 'tiny'),
        button('End the conflict', () => { if (!confirm('End the conflict?')) return; note(v.label + ' ended after ' + c.turn + (c.turn === 1 ? ' turn' : ' turns')); set(null); }, 'ghost tiny'),
      ]));
    };
    ctx.on('state:changed', () => { if (!document.activeElement || !container.contains(document.activeElement) || document.activeElement.tagName === 'BUTTON') draw(); });
    ctx.on('state:remote', () => { if (!document.activeElement || !container.contains(document.activeElement)) draw(); });
    ctx.on('scene:changed', draw);
    draw();
  }
  function drawStart(container, draw) {
    container.appendChild(el('h4', {}, ['Conflict', el('span', { class: 'muted small' }, [' · the Storyteller starts it for the coterie'])]));
    container.appendChild(el('div', { class: 'conflict-variants' }, VARIANTS.map((v) => el('label', { class: 'conflict-variant' + (draft.variant === v.key ? ' on' : '') }, [
      el('input', { type: 'radio', name: 'conflict-variant', checked: draft.variant === v.key || null, onchange: () => { draft.variant = v.key; draw(); } }), ' ', v.label, ' ',
      el('span', { class: 'muted small' }, v.rules.slice(0, 1).map((k) => ruleLink(k))),
    ]))));
    if (draft.variant === 'oneRoll') {
      container.appendChild(el('div', { class: 'chiprow tight' }, [el('span', { class: 'prop-k' }, ['Difficulty'])].concat(ONE_ROLL_DIFFICULTIES.map((n) => button(String(n), () => { draft.difficulty = n; draw(); }, draft.difficulty === n ? 'tiny' : 'ghost tiny')),
        [el('span', { class: 'muted small' }, ['adjust ']), button('−1', () => { draft.adjust = draft.adjust === -1 ? 0 : -1; draw(); }, draft.adjust === -1 ? 'tiny' : 'ghost tiny'), button('+1', () => { draft.adjust = draft.adjust === 1 ? 0 : 1; draw(); }, draft.adjust === 1 ? 'tiny' : 'ghost tiny'),
          el('b', {}, [' = ' + (draft.difficulty + draft.adjust)])])));
      container.appendChild(el('div', { class: 'chiprow tight' }, [el('span', { class: 'prop-k' }, ['Damage to']), button('Health', () => { draft.track = 'health'; draw(); }, draft.track === 'health' ? 'tiny' : 'ghost tiny'), button('Willpower', () => { draft.track = 'willpower'; draw(); }, draft.track === 'willpower' ? 'tiny' : 'ghost tiny')]));
    }
    const opt = (key, label, rule) => el('label', { class: 'small' }, [el('input', { type: 'checkbox', checked: draft[key] || null, onchange: (ev) => { draft[key] = ev.target.checked; } }), ' ' + label + ' ', ruleLink(rule)]);
    container.appendChild(el('div', { class: 'conflict-modules' }, [
      draft.variant === 'oneRoll' ? null : opt('initiative', 'Initiative order', 'whoGoesFirst'),
      draft.variant === 'close' || draft.variant === 'ranged' ? opt('surprise', 'A surprise attack opens it', 'surprise') : null,
      draft.variant === 'oneRoll' ? null : opt('three', 'Three turns and out', 'threeTwoDone'),
    ]));
    container.appendChild(el('div', { class: 'chiprow' }, [button('Start the conflict', () => {
      const v = variant(draft.variant);
      const c = { id: State().genId('cf'), variant: v.key, turn: 1, started: Date.now(), npcInit: {},
        modules: { initiative: !!draft.initiative && v.key !== 'oneRoll', surprise: !!draft.surprise && (v.key === 'close' || v.key === 'ranged'), three: !!draft.three && v.key !== 'oneRoll' } };
      if (v.key === 'oneRoll') { c.difficulty = draft.difficulty + draft.adjust; c.track = draft.track; }
      set(c);
      note('Conflict started: ' + v.label + (c.difficulty ? ' · Difficulty ' + c.difficulty : ''));
    }, '')]));
  }
  // Damage to one character: levels, Superficial or Aggravated, halved as Tracking Damage says
  // ("Unless otherwise stated, divide Superficial damage in half (rounded up) before applying it")
  // … except in a one-roll conflict: "Do not halve Superficial damage in this case." — One-Roll Conflicts
  const dmg = {};   // member id → { n, kind, halve } being set up, per conflict
  function damageRow(m, c, track) {
    const d = dmg[m.id] = dmg[m.id] && dmg[m.id].conflict === c.id ? dmg[m.id] : { conflict: c.id, n: 1, kind: 'sup', halve: c.variant !== 'oneRoll' };
    const levels = d.kind === 'sup' && d.halve ? Math.ceil(d.n / 2) : d.n;
    return el('div', { class: 'chiprow tight dmg-row' }, [
      el('b', {}, [m.name]),
      button('−', () => { d.n = Math.max(1, d.n - 1); window.VttBus.emit('state:changed', {}, { local: true }); }, 'ghost tiny'),
      el('span', { class: 'num' }, [String(d.n)]),
      button('+', () => { d.n += 1; window.VttBus.emit('state:changed', {}, { local: true }); }, 'ghost tiny'),
      button(d.kind === 'sup' ? 'Superficial' : 'Aggravated', () => { d.kind = d.kind === 'sup' ? 'agg' : 'sup'; window.VttBus.emit('state:changed', {}, { local: true }); }, 'ghost tiny'),
      d.kind === 'sup' ? el('label', { class: 'small' }, [el('input', { type: 'checkbox', checked: d.halve || null, onchange: (ev) => { d.halve = ev.target.checked; window.VttBus.emit('state:changed', {}, { local: true }); } }), ' halved']) : null,
      button('Apply ' + levels, () => {
        const mm = (S().party || []).find((x) => x.id === m.id) || m;
        const v = Sheet().values(mm);
        const size = track === 'willpower' ? (+v.Willpower || Sheet().derived(v).Willpower) : (+v.Health || Sheet().derived(v).Health);
        const cur = ((mm.live || {})[track]) || {};
        Sheet().change(mm, { [track]: Sheet().damage(size, cur, d.kind, levels) },
          variant(c.variant).label + ', turn ' + c.turn + ': ' + d.n + ' ' + (d.kind === 'sup' ? 'Superficial' + (d.halve ? ' (halved to ' + levels + ')' : '') : 'Aggravated'));
      }, 'tiny'),
    ]);
  }
  // A one-roll conflict: each character's roll in it, and the damage the rule gives ("the difference
  // between their successes and *twice* the Difficulty")
  function oneRollResults(c, party) {
    const rows = party.map((m) => {
      const l = (S().log || []).filter((e) => e.kind === 'roll' && e.memberId === m.id && e.conflict === c.id && e.mode !== 'rouse');
      const e = l[l.length - 1];
      if (!e) return el('li', {}, [m.name + ': ', el('span', { class: 'muted' }, ['not rolled yet'])]);
      const res = window.VtmDice.evaluate(window.VtmDice.fromEntry(e), c.difficulty);
      const hurt = Math.max(0, 2 * c.difficulty - res.successes);
      return el('li', {}, [m.name + ': ' + res.successes + (res.successes === 1 ? ' success' : ' successes') + ' · ' + (res.successes >= c.difficulty ? 'wins' : 'loses') + ' · damage ' + hurt,
        hurt ? button('Take ' + hurt, () => { const d = dmg[m.id] = { conflict: c.id, n: hurt, kind: (dmg[m.id] || {}).kind || 'sup', halve: false }; window.VttBus.emit('state:changed', {}, { local: true }); }, 'ghost tiny') : null]);
    });
    return el('div', {}, [el('div', { class: 'prop-k' }, ['The rolls', el('span', { class: 'muted' }, [' · ', ruleLink('oneRoll')])]), el('ul', { class: 'items' }, rows),
      el('div', { class: 'muted small' }, ['"This damage can not be mitigated by armor or supernatural means such as Fortitude … Do not halve Superficial damage in this case."'])]);
  }

  // ── the player's Conflict tab ─────────────────────────────────────────
  const picks = {};   // member id → { pool, opts } the conflict pool being set up
  function playerBlock(m, v, roller, o) {
    const c = current();
    if (!c) {
      // the conflict is over: a one-roll conflict's limits come off the roller
      if (roller.limits && roller.limits().noSurge) roller.setLimits({});
      return null;
    }
    const vr = variant(c.variant);
    const open = (o && o.onRule) || window.VtmOpenEntity;
    const disc = {};
    (v.Disciplines || []).forEach((d) => { if (d.Discipline) disc[d.Discipline] = +d.Dots || 0; });
    const traitNames = Sheet().attributes().concat(Sheet().skills(), Object.keys(disc));
    const valueOf = (t) => (t in disc ? disc[t] : +v[t] || 0);
    const pk = picks[m.id] = picks[m.id] && picks[m.id].conflict === c.id ? picks[m.id] : { conflict: c.id, pool: null, opts: { cover: 'limited', opponent: 1 } };
    const box = el('div', { class: 'conflict-tab' });
    box.appendChild(el('div', { class: 'conflict-head' }, [el('b', {}, [vr.label]), el('span', { class: 'muted small' }, [' · turn ' + c.turn]),
      c.variant === 'oneRoll' ? el('span', { class: 'muted small' }, [' · Difficulty ' + c.difficulty + ', no Willpower re-roll or Blood Surge']) : null]));
    if (c.modules.initiative) box.appendChild(el('div', { class: 'small' }, ['Initiative ', el('b', {}, [String(INITIATIVE.reduce((a, t) => a + valueOf(t), 0))]), el('span', { class: 'muted' }, [' (' + INITIATIVE.join(' + ') + ') · ']), ruleLink('whoGoesFirst', open)]));
    // the roller follows the conflict: a one-roll conflict's Difficulty and limits
    if (c.variant === 'oneRoll') { if (!roller.limits().noSurge) { roller.setLimits({ noSurge: true, noReroll: true }); roller.setDifficulty(c.difficulty); } } else if (roller.limits().noSurge) roller.setLimits({});
    const mods = () => {
      const x = [];
      if (pk.opts.dodge) x.push(['Dodging', 0]);
      if (pk.opts.reach && c.turn === 1) x.push(['reach', REACH_BONUS]);
      if (pk.opts.range) x.push(['beyond effective range', RANGE_PENALTY]);
      if (vr.options.indexOf('cover') !== -1 && pk.opts.defending) { const cv = COVER.find((y) => y[0] === pk.opts.cover); if (cv && cv[2]) x.push([cv[1].toLowerCase(), cv[2]]); }
      if (vr.options.indexOf('opponent') !== -1 && pk.opts.defending && pk.opts.opponent > 1) x.push(['opponent ' + pk.opts.opponent, -(pk.opts.opponent - 1)]);
      return x;
    };
    const apply = () => {
      if (!pk.pool) return;
      const x = mods();
      const n = valueOf(pk.pool.a) + valueOf(pk.pool.b) + x.reduce((a, y) => a + y[1], 0);
      roller.setPool(Math.max(0, n), pk.pool.pool + x.map((y) => ' ' + (y[1] > 0 ? '+' : y[1] < 0 ? '−' : '') + (y[1] ? Math.abs(y[1]) + ' ' : '') + y[0]).join(','), true);
    };
    const redraw = () => window.VttBus.emit('state:remote', { view: true }, { local: true });
    const poolBox = el('div', { class: 'conflict-pools' }, [el('span', { class: 'muted small' }, ['Reading the rules…'])]);
    Promise.all(vr.rules.map(textOf)).then((ts) => {
      poolBox.innerHTML = '';
      const pools = poolsIn(ts.join('\n'), traitNames);
      if (!pools.length) poolBox.appendChild(el('div', { class: 'muted small' }, ['The rules name no pool this sheet carries — build it on the Roll tab.']));
      pools.forEach((p) => poolBox.appendChild(el('button', { type: 'button', class: 'sk-row' + (pk.pool && pk.pool.pool === p.pool && pk.pool.why === p.why ? ' on' : ''),
        onclick: () => { pk.pool = p; pk.opts.dodge = /dodg/i.test(p.why); pk.opts.defending = /dodg|defen/i.test(p.why) || pk.opts.defending; apply(); redraw(); } },
        [el('span', {}, [p.pool, p.why ? el('span', { class: 'muted small' }, [' ' + p.why]) : null]), el('span', { class: 'sk-dots' }, [String(valueOf(p.a) + valueOf(p.b))])])));
    });
    box.appendChild(el('div', { class: 'prop-k' }, ['Conflict pools', el('span', { class: 'muted' }, [' · from ']), ...vr.rules.slice(0, 2).map((k, i) => [i ? ', ' : '', ruleLink(k, open)])]));
    box.appendChild(poolBox);
    const toggle = (key, label, rule) => el('label', { class: 'small conflict-opt' }, [el('input', { type: 'checkbox', checked: pk.opts[key] || null, onchange: (ev) => { pk.opts[key] = ev.target.checked; ev.target.blur(); apply(); redraw(); } }), ' ' + label + ' ', rule ? ruleLink(rule, open) : null]);
    // (the player's page never redraws under a focused input, and a checkbox is one: let it go first)
    const opts = [];
    if (vr.options.indexOf('dodge') !== -1 && pk.opts.dodge) opts.push(el('div', { class: 'muted small' }, ['Dodging: "they inflict no damage on the opponent, no matter the margin, if they win." ', ruleLink('dodging', open)]));
    if (vr.options.indexOf('reach') !== -1) opts.push(toggle('reach', 'The better reach (a bonus die in the first turn)', 'close'));
    if (vr.options.indexOf('range') !== -1) opts.push(toggle('range', 'Beyond the weapon’s effective range (−2)', 'ranged'));
    if (vr.options.indexOf('cover') !== -1 || vr.options.indexOf('opponent') !== -1) opts.push(toggle('defending', 'Defending', null));
    if (vr.options.indexOf('cover') !== -1 && pk.opts.defending) opts.push(el('div', { class: 'chiprow tight' }, COVER.map(([k, label, n]) => button(label + (n ? ' ' + (n > 0 ? '+' : '−') + Math.abs(n) : ''), () => { pk.opts.cover = k; apply(); redraw(); }, pk.opts.cover === k ? 'tiny' : 'ghost tiny')).concat([ruleLink('rangedWeapons', open)])));
    if (vr.options.indexOf('opponent') !== -1 && pk.opts.defending) opts.push(el('div', { class: 'chiprow tight' }, [el('span', { class: 'small' }, ['Against opponent']),
      button('−', () => { pk.opts.opponent = Math.max(1, pk.opts.opponent - 1); apply(); redraw(); }, 'ghost tiny'), el('b', { class: 'num' }, [String(pk.opts.opponent)]),
      button('+', () => { pk.opts.opponent += 1; apply(); redraw(); }, 'ghost tiny'), ruleLink('multiple', open)]));
    if (c.modules.surprise && c.turn === 1) opts.push(el('div', { class: 'chiprow tight' }, [button('Surprise attack: Difficulty ' + SURPRISE_DIFFICULTY, () => roller.setDifficulty(SURPRISE_DIFFICULTY), 'ghost tiny'), ruleLink('surprise', open)]));
    if (opts.length) box.appendChild(el('div', { class: 'conflict-opts' }, opts));
    box.appendChild(el('div', { class: 'muted small' }, ['The Storyteller rolls the other side and applies the damage.']));
    return box;
  }

  if (window.VttPanels) window.VttPanels.register('conflict', { label: 'Conflict', render: renderPanel });
  return { RULES, VARIANTS, current, poolsIn, playerBlock };
})();
