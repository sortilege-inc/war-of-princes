// system/vtm5e/sheet.js — the character sheet, derived from the corpus's ACTOR "Kindred" at
// runtime (PLAYBOOK §1b): the declared fields, in declared order (the printed sheet's order),
// each drawn by its declared type — an INTEGER with a range is a row of dots, one without a
// ceiling a tracker's size, a STRING a line, a LIST OF STRING numbered lines, a LIST OF a
// declared row type (Discipline Rating, Specialty, Advantage Line) rows of that type's own
// fields, a reference to a vocabulary type (Discipline) a pick from its ENUM.
//
// Grouping is read from the book too: a run of dotted fields is labelled by the heading the
// core's Characters chapter prints them under ("Physical Attributes" › Strength, Dexterity,
// Stamina). The Blood Potency figures the sheet prints (Blood Surge … Bane Severity) are the
// Errata's replacement chart's row for the character's Blood Potency, shown with its heads.
//
// Also here: the live sheet for play — the Health and Willpower trackers, Hunger, Stains, the
// Remorse test, and pools built from the sheet into the roller. Every number the rules state
// only in prose is a named constant citing its sentence.
window.VtmSheet = (function () {
  const { el, button, debounce } = window.VttRender;
  const D = window.VtmData;
  const Dice = window.VtmDice;
  const State = () => window.VttState;

  const ACTOR = 'Kindred';
  const FILE_KIND = 'sortilege-vtt-character';
  const BOOKS = ['base', 'core', 'errata'];           // what the sheet reads
  // Before the corpus declared the character (PLAN.md D1) a member carried this id; a file
  // with it still reads.
  const OLD_TEMPLATE_ID = 'vtm5e-character';

  // ── numbers the rules state only in prose, each citing its sentence ──
  // "Health = Stamina + 3; Willpower = Composure + Resolve." — core, Character Creation summary
  const HEALTH_FROM = ['Stamina', 3];
  const WILLPOWER_FROM = ['Composure', 'Resolve'];
  // "Mark each level of Superficial damage on the character sheet by making a “/” on one box
  //  on the track. Mark Aggravated damage on the character sheet by making an “X” on the
  //  tracker." — Tracking Damage
  const MARK = { sup: '/', agg: 'X' };
  // "Impaired characters lose two dice from all relevant dice pools: Physical pools from
  //  Impaired Health, Social, and Mental pools from Impaired Willpower" — Impairment
  const IMPAIRED_PENALTY = 2;
  // "Roll a number of dice equal to the unmarked, unfilled dots on the Humanity tracker … The
  //  minimum number of dice in a Remorse roll is one" — Remorse
  const REMORSE_MIN = 1;
  const RULES = {
    tracking: '#v8jE9nMR6clPx2zFJRQeRBR', impairment: '#vR5WBtRjY1pxZfQzeTZRC7E', end: '#v4ZWtiGxAi9yO4oUiLHzX0o',
    stains: '#vPN2qKBKdNPwqeNyBOhmBWQ', remorse: '#vCx8XSdcpAugFiLrkHyerHH', degeneration: '#vCsEENnhpvC3uJZZcjag2jb',
  };

  // ── the declaration, read at runtime ──
  const decl = (name) => D.declaration(name);
  const actor = () => decl(ACTOR);
  // A Sabbat character (owner, 2026-09-25) is The Black Hand's ACTOR "Sabbat Kindred": the core's
  // Kindred and the one field it adds, the Path of Enlightenment walked. A character is one when its
  // values hold that field; its sheet then needs The Black Hand in memory (booksFor).
  const SABBAT = 'Sabbat Kindred';
  const SABBAT_BOOK = 'black-hand';
  const sabbatDecl = () => kindDecl('sabbat');
  const has = (v, k) => !!v && Object.prototype.hasOwnProperty.call(v, k);
  const isSabbat = (v) => has(v, 'Path of Enlightenment');

  // ── the character's kind: an ACTOR the corpus declares, and the book that declares it ──
  // A character is the core's Kindred unless its values hold the field that marks another kind:
  // The Black Hand's Sabbat Kindred (its Path), Summoned Stories' Cainite (its Road, which that
  // chronicle's brief puts in Humanity's place), or the BASE's Ghoul (their domitor) and Mortal
  // (Attributes and no clan and no Blood Potency - the Kindred's own fields). Every kind's sheet
  // is its ACTOR's fields, with the fields of the ACTOR it EXTENDS first.
  const KINDS = {
    kindred: { actor: ACTOR, book: 'base', label: 'Kindred', vampire: true },
    sabbat: { actor: SABBAT, book: SABBAT_BOOK, label: 'Kindred', vampire: true, marker: 'Path of Enlightenment' },
    cainite: { actor: 'Cainite', book: 'summoned-stories', label: 'Cainite', vampire: true, marker: 'Road Rating', also: ['Road'] },
    ghoul: { actor: 'Ghoul', book: 'base', label: 'Ghoul', vampire: false, marker: 'Domitor' },
    mortal: { actor: 'Mortal', book: 'base', label: 'Mortal', vampire: false },
  };
  // "Humanity: This is replaced by the Road system." / "Touchstones and Convictions: We will not
  // be using Touchstones or Convictions" - Summoned Stories, Character Creation
  const NOT_ON = { cainite: ['Humanity', 'Touchstones & Convictions'] };
  function kindOf(v) {
    if (has(v, 'Road Rating')) return 'cainite';
    if (isSabbat(v)) return 'sabbat';
    if (has(v, 'Domitor')) return 'ghoul';
    if (has(v, 'Strength') && !has(v, 'Clan') && !has(v, 'Blood Potency')) return 'mortal';
    return 'kindred';
  }
  const kindKey = (k) => (KINDS[k] ? k : Object.keys(KINDS).find((x) => KINDS[x].actor === k) || 'kindred');
  const isVampire = (v) => KINDS[kindOf(v)].vampire;
  const findActor = (book, key) => (D.loaded(book) ? D.all([book]).find((e) => e.form === 'ACTOR' && e.key === key) || null : null);
  function kindDecl(k) {
    const K = KINDS[kindKey(k)];
    return K.actor === ACTOR ? actor() : findActor(K.book, K.actor);
  }
  // an ACTOR's fields and its parents', the parent's first (an ACTOR EXTENDS by its name)
  function propsOf(e) {
    if (!e) return [];
    const parent = e.type ? (e.type === ACTOR ? actor() : findActor('base', e.type)) : null;
    return propsOf(parent).concat(e.props || []);
  }
  const booksFor = (v) => { const b = KINDS[kindOf(v)].book; return b === 'base' ? BOOKS : BOOKS.concat([b]); };
  const templateId = (v) => (kindDecl(kindOf(v)) || actor() || {}).id || '#vtm5Kindred000000001';
  // the track a character's Beast is held by: Humanity, or a Cainite's Road rating
  const morality = (v) => (kindOf(v) === 'cainite' ? { key: 'Road Rating', label: v.Road || 'Road' } : { key: 'Humanity', label: 'Humanity' });

  // A trait's name on the sheet: its own, or the one a campaign's house rule gives it - a MODIFY on
  // the core's entity for the trait that sets ^"Label" (an instance's layer; a Dark Ages table's
  // Archery for Firearms). The value stays under the trait's own name; only what the sheet prints
  // changes, so a pool, a power's Dice Pools and a character file read as before.
  let labels = null;
  function label(name) {
    if (!labels) {
      labels = {};
      (D.index().corrections || []).forEach((c) => {
        const l = (c.props || []).find((p) => p.name === 'Label' && typeof p.value === 'string');
        if (l && c.target && c.target.name && !(c.target.name in labels)) labels[c.target.name] = l.value;
      });
    }
    return labels[name] || name;
  }

  // Where the core's Characters chapter prints a field: the heading its entity sits under.
  let parentOf = null;
  function groupOf(name) {
    if (!parentOf) {
      parentOf = {};
      D.all(['core']).filter((e) => /core-characters/.test(e.file)).forEach((e) => {
        if (e.parent && !(e.name in parentOf)) parentOf[e.name] = D.entity(e.parent) ? D.entity(e.parent).name : null;
      });
    }
    return parentOf[name] || null;
  }

  // One entry per declared field: { name, kind, min, max, of, fields, required }.
  function fieldSpec(p) {
    const s = { name: p.name, required: !!p.required, min: p.min, max: p.max };
    if (p.vk === 'ref') {
      const t = p.ref && decl(p.ref.name);
      // a vocabulary (an ENUM type) is picked from its names; a reference to a printed entity
      // (the Advantage Line's Advantage: a Loresheet Level) is an id, set by its own picker
      s.kind = t && t.enum ? 'enum' : t ? 'entity' : 'text';
      s.options = t && t.enum ? t.enum.slice() : null;
      s.refType = p.ref ? p.ref.name : null;
    } else if (p.vk === 'list' && p.of && p.of !== 'STRING') {
      s.kind = 'rows';
      s.of = p.of;
      s.fields = ((decl(p.of) || {}).props || []).map(fieldSpec);
    } else if (p.vk === 'list') s.kind = 'lines';
    else if (p.type === 'INTEGER') s.kind = p.max != null && p.max <= 10 ? 'dots' : 'number';
    else if (p.type === 'BOOLEAN') { s.kind = 'flag'; s.default = !!p.default; }
    else s.kind = 'text';
    return s;
  }
  const spec = () => ((actor() || {}).props || []).map(fieldSpec);
  // a kind's fields, in declared order (a Kindred when its book is not in memory yet)
  function specOfKind(k) {
    const kk = kindKey(k);
    const d = kindDecl(kk);
    const specs = d ? propsOf(d).map(fieldSpec) : spec();
    const off = NOT_ON[kk] || [];
    return specs.filter((x) => off.indexOf(x.name) === -1);
  }
  // a character's own fields: its kind's
  const specFor = (v) => specOfKind(kindOf(v));
  const field = (name) => spec().find((s) => s.name === name) || null;

  // kind: a kind's key or its ACTOR's name (SABBAT for a Sabbat character; its book must be in memory)
  function blank(kind) {
    const v = {};
    specOfKind(kind || 'kindred').forEach((s) => {
      v[s.name] = s.kind === 'rows' || s.kind === 'lines' ? [] : s.kind === 'dots' ? (s.min || 0) : s.kind === 'number' ? null : s.kind === 'flag' ? s.default : '';
    });
    return v;
  }
  function complete(v) {
    const k = kindOf(v);
    const out = blank(k);
    // a character stays its kind even before the book that declares it is in memory
    const K = KINDS[k];
    [K.marker].concat(K.also || []).filter(Boolean).forEach((f) => { if (!has(out, f)) out[f] = ''; });
    if (k === 'mortal') { delete out.Clan; delete out['Blood Potency']; }
    Object.keys(v || {}).forEach((k2) => { if (v[k2] != null && (NOT_ON[k] || []).indexOf(k2) === -1) out[k2] = Array.isArray(v[k2]) ? v[k2].slice() : v[k2]; });
    return out;
  }

  // the dotted fields the sheet sets from 1 (Attributes) and from 0 (Skills), by declaration
  const attributes = () => spec().filter((s) => s.kind === 'dots' && s.min === 1 && s.max === 5).map((s) => s.name);
  // (a Skill is one the core prints under a Skills heading: Hunger is dotted 0-5 too, and is not one)
  const skills = () => spec().filter((s) => s.kind === 'dots' && s.min === 0 && s.max === 5 && /Skills$/i.test(groupOf(s.name) || '')).map((s) => s.name);

  // Health and Willpower from the summary's formulas
  function derived(v) {
    const n = (k) => +v[k] || 0;
    return { Health: n(HEALTH_FROM[0]) + HEALTH_FROM[1], Willpower: n(WILLPOWER_FROM[0]) + n(WILLPOWER_FROM[1]) };
  }

  // ── the Errata's Blood Potency chart: the row for this Blood Potency ──
  function potencyRow(bp) {
    const c = (D.index().corrections || []).find((x) => x.target && x.target.name === 'Blood Potency' && x.nested && x.nested.length);
    if (!c) return null;
    let table = null;
    c.nested.forEach((id) => {
      const walk = (e) => { if (!e) return; if (e.table) table = table || e.table; D.children(e.id).forEach(walk); };
      walk(D.entity(id));
    });
    if (!table) return null;
    const row = table.rows.find((r) => String(r[0]).trim() === String(bp));
    return row ? { columns: table.columns, row } : null;
  }

  // A Blood Surge's dice for this character: the chart's Blood Surge cell for their Blood Potency
  // ("Add 2 dice"), read, never restated. null when the chart has no such row.
  function surgeFor(m) {
    const v = values(memberNow(m));
    const pr = potencyRow(v['Blood Potency'] || 0);
    if (!pr) return null;
    const k = pr.columns.findIndex((c) => /blood surge/i.test(c));
    const cell = k >= 0 ? String(pr.row[k] || '') : '';
    const n = /Add\s+(\d+)\s+di(?:e|ce)/i.exec(cell);
    return n ? { dice: +n[1], text: cell } : null;
  }

  // ── Discipline powers in play ──
  // The chart's figures for this Blood Potency, by head: "Add 1 die" → 1, "Level 2 and below" → 2.
  function potencyFigure(v, head) {
    const pr = potencyRow(v['Blood Potency'] || 0);
    if (!pr) return 0;
    const k = pr.columns.findIndex((c) => c.toLowerCase() === head);
    const m = /(\d+)/.exec(k >= 0 ? String(pr.row[k] || '') : '');
    return m ? +m[1] : 0;
  }
  // A power's printed Cost as a count of Rouse Checks, where it states one plainly ("One Rouse
  // Check", "Two Rouse Checks", "1 Rouse Check"); anything else ("One or more…", a paragraph) is
  // shown as printed and rolled by hand.
  const COUNT = { one: 1, two: 2, three: 3, 1: 1, 2: 2, 3: 3 };
  function rouseCount(cost) {
    const m = /^(one|two|three|[123]) rouse checks?\.?$/i.exec(String(cost || '').trim());
    return m ? COUNT[m[1].toLowerCase()] : 0;
  }
  // A power's printed Dice Pools as the pools it can roll: the acting side (before "vs"), each
  // alternative ("A + B, C + D", "… or …") that names only traits this sheet carries.
  function poolsOf(text, v) {
    const acting = String(text || '').split(/\s+vs\.?\s+/i)[0];
    const disc = {};
    (v.Disciplines || []).forEach((d) => { if (d.Discipline) disc[d.Discipline] = +d.Dots || 0; });
    const known = (t) => attributes().indexOf(t) !== -1 || skills().indexOf(t) !== -1 || t in disc;
    return acting.split(/,\s*(?:or\s+)?|\s+or\s+/i).map((alt) => alt.replace(/\s*\([^)]*\)\s*/g, ' ').trim())
      .filter((alt) => /^[A-Z][\w ]*(\s\+\s[A-Z][\w ]*)+$/.test(alt))
      .map((alt) => alt.split(/\s\+\s/).map((t) => t.trim()))
      .filter((terms) => terms.every(known))
      .map((terms) => ({ label: terms.join(' + '), terms, dice: terms.reduce((a, t) => a + (t in disc ? disc[t] : +v[t] || 0), 0) }));
  }
  function powersBlock(m, v, roller, o) {
    const rows = (v.Disciplines || []).filter((d) => d.Discipline && (d.Powers || []).length);
    if (!rows.length) return null;
    // "Add one die to your dice pools when using or resisting discipline powers." and "Roll two
    // dice and pick the highest when rolling a Rouse Check for discipline powers of level 2 and
    // below." — Blood Potency; the figures are the chart's row
    // A ghoul has no Blood Potency and no Hunger: the power's Cost is shown as printed ("Ghouls who
    // use powers above level 1 ... take 1 point of Aggravated damage to their Health instead of
    // making a Rouse Check" - core, Ghouls)
    const vamp = isVampire(v);
    const bonus = vamp ? potencyFigure(v, 'discipline power bonus') : 0;
    const reroll = vamp ? potencyFigure(v, 'discipline rouse check re-roll') : 0;
    const open = (id) => (o.onRule || window.VtmOpenEntity)(id);
    return el('div', { class: 'powers' }, [
      el('div', { class: 'prop-k' }, ['Disciplines', vamp ? el('span', { class: 'muted' }, [' · Blood Potency ' + (v['Blood Potency'] || 0) + ': +' + bonus + ' to power pools, Rouse re-roll ' + (reroll ? 'at level ' + reroll + ' and below' : 'none')]) : null]),
      ...rows.map((d) => el('div', { class: 'power-disc' }, [
        el('div', { class: 'power-disc-h' }, [d.Discipline + ' ', el('span', { class: 'muted small' }, ['●'.repeat(+d.Dots || 0)])]),
        ...(d.Powers || []).map((name) => {
          // a power taken more than once carries the table's note in brackets ("Koldunic Sorcery
          // (Earth)" - the book: "A koldun character can command multiple elements only by taking
          // the Koldunic Sorcery power multiple times"); the book's name is what it resolves by
          const r = D.powers().find((x) => x.discipline === d.Discipline && x.name === name)
            || D.powers().find((x) => x.discipline === d.Discipline && x.name === String(name).replace(/\s*\([^()]*\)$/, ''));
          if (!r) return el('div', { class: 'power-card muted' }, [name + ' (not found in the books)']);
          const f = r.fields || {};
          const lvl = D.levelNumber(r);
          const n = vamp ? rouseCount(f.Cost) : 0;
          const twoDice = !!(reroll && lvl != null && lvl <= reroll);
          const pools = poolsOf(f['Dice Pools'], v);
          return el('div', { class: 'power-card' }, [
            el('div', { class: 'chiprow tight' }, [
              el('button', { class: 'ref', type: 'button', title: 'Its printed text', onclick: () => open(r.id) }, [name]),
              el('span', { class: 'muted small' }, [r.level || '']),
            ]),
            el('div', { class: 'small' }, [el('b', {}, ['Cost: ']), f.Cost || '—',
              n ? button('Rouse' + (n > 1 ? ' ×' + n : '') + (twoDice ? ' (two dice, keep the highest)' : ''), () => { for (let i = 0; i < n; i++) roller.rouse({ twoDice, for: name }); }, 'ghost tiny') : null]),
            f['Dice Pools'] ? el('div', { class: 'small' }, [el('b', {}, ['Dice Pools: ']), f['Dice Pools'],
              ...pools.map((pl) => button('Roll ' + pl.label + ' ' + (pl.dice + bonus), () => {
                roller.setPool(pl.dice + bonus, name + ': ' + pl.label + (bonus ? ' + ' + bonus + ' (Blood Potency)' : ''));
                roller.scrollIntoView({ block: 'nearest' });
              }, 'ghost tiny'))]) : null,
          ]);
        }),
      ])),
    ]);
  }

  // ── a sentence for who this is ──
  function traits(v) {
    const k = kindOf(v);
    if (k === 'ghoul') return ['Ghoul', v.Domitor ? 'domitor ' + v.Domitor : null, v.Concept || null].filter(Boolean);
    if (k === 'mortal') return ['Mortal', v.Concept || null].filter(Boolean);
    return [v.Clan, v.Predator ? v.Predator : null, v.Generation ? v.Generation + 'th Generation' : null, k === 'cainite' && v.Road ? v.Road + ' ' + (+v['Road Rating'] || 0) : null].filter(Boolean);
  }
  function sentence(v) {
    const bits = traits(v);
    return [(v.Name || 'An unnamed ' + KINDS[kindOf(v)].label)].concat(bits.length ? [bits.join(' · ')] : []).join(', ');
  }

  // ── controls ──
  function dots(value, min, max, onchange, cls) {
    return el('span', { class: 'dots' + (cls ? ' ' + cls : ''), role: 'radiogroup' }, Array.from({ length: max }, (_, i) => el('button', {
      type: 'button', class: 'dot' + (i < (value || 0) ? ' on' : ''), title: String(i + 1), 'aria-label': String(i + 1),
      onclick: onchange ? () => onchange(value === i + 1 && i + 1 > (min || 0) ? i : Math.max(min || 0, i + 1)) : null,
      disabled: onchange ? null : 'disabled',
    })));
  }

  function input(s, value, onchange) {
    if (s.kind === 'dots') return dots(value, s.min, s.max, onchange);
    if (s.kind === 'number') return el('input', { type: 'number', class: 'text num', value: value == null ? '' : value, min: s.min != null ? s.min : null, max: s.max != null ? s.max : null, onchange: (ev) => onchange(ev.target.value === '' ? null : +ev.target.value) });
    if (s.kind === 'enum') return el('select', { class: 'scope', onchange: (ev) => onchange(ev.target.value || null) }, [el('option', { value: '' }, ['—'])].concat(s.options.map((o) => el('option', { value: o, selected: o === value || null }, [o]))));
    if (s.kind === 'flag') return el('input', { type: 'checkbox', checked: value ? 'checked' : null, onchange: (ev) => onchange(ev.target.checked) });
    return el('input', { type: 'text', class: 'text', value: value || '', oninput: debounce((ev) => onchange(ev.target.value), 250) });
  }

  // A Discipline row's powers: the power records of that Discipline at or below its dots.
  function powersFor(discipline, dotsN) {
    return D.powers().filter((r) => r.discipline === discipline && (D.levelNumber(r) == null || D.levelNumber(r) <= (dotsN || 0)));
  }

  // ── Loresheet levels on the sheet: each an Advantage of its own (corpus BASE 0.5.3) ──
  // Offered only from the loresheets the Storyteller has made available (campaign state
  // `loresheets`; none by default, and none where there is no campaign — the public creator).
  const available = () => new Set(((window.VttState && window.VttState.state) || {}).loresheets || []);
  const loresheetLevels = () => { const on = available(); return D.records().filter((r) => r.kind === 'loresheet level' && on.has(r.loresheet)); };
  // [Name] [Dots] [Loresheet] [Text] — the text from the level's own entity, its book loaded on demand
  function levelLine(row, onremove) {
    const r = D.records().find((x) => x.id === row.Advantage) || {};
    const text = el('div', { class: 'lore-text small' }, [el('span', { class: 'muted' }, ['…'])]);
    D.fetch(row.Advantage).then((e) => { text.innerHTML = ''; text.appendChild(e && e.desc ? window.VtmEntity.prose(e.desc) : el('span', { class: 'muted' }, ['(its text is not in the books loaded)'])); });
    return el('div', { class: 'lore-level' }, [
      el('div', { class: 'chiprow tight' }, [
        el('b', {}, [row.Name || r.name || '']),
        el('span', { class: 'lore-dots' }, ['●'.repeat(+row.Dots || r.rating || 0)]),
        el('button', { class: 'ref small', type: 'button', onclick: () => (window.VtmOpenEntity || (() => {}))(r.loresheet) }, [r.under || 'Loresheet']),
        onremove ? button('remove', onremove, 'ghost tiny') : null,
      ]),
      text,
    ]);
  }

  function rowsEditor(s, rows, onchange) {
    const box = el('div', { class: 'rows' });
    const draw = () => {
      box.innerHTML = '';
      rows.forEach((row, i) => {
        if (s.of === 'Advantage Line' && row.Advantage) {
          box.appendChild(levelLine(row, () => { rows.splice(i, 1); onchange(rows.slice()); draw(); }));
          return;
        }
        const line = el('div', { class: 'row-line' });
        s.fields.forEach((f) => {
          if (f.kind === 'entity') return;           // set by its own picker, below
          const set = (val) => { rows[i] = Object.assign({}, rows[i], { [f.name]: val }); onchange(rows.slice()); if (f.kind === 'enum' || f.kind === 'dots') draw(); };
          if (f.kind === 'lines' && s.of === 'Discipline Rating') {
            const have = row[f.name] || [];
            const opts = powersFor(row.Discipline, row.Dots);
            line.appendChild(el('div', { class: 'row-powers' }, [
              el('span', { class: 'prop-k' }, [f.name]),
              ...have.map((p, k) => el('span', { class: 'chip' }, [p, el('button', { type: 'button', class: 'ref tiny', onclick: () => { const h = have.slice(); h.splice(k, 1); set(h); draw(); } }, ['×'])])),
              opts.length ? el('select', { class: 'scope', onchange: (ev) => { if (ev.target.value) { set(have.concat([ev.target.value])); draw(); } } }, [el('option', { value: '' }, ['+ a power…'])].concat(
                opts.filter((r) => have.indexOf(r.name) === -1).map((r) => el('option', { value: r.name }, [(r.level ? r.level + ' · ' : '') + r.name + ' (' + (D.indexBook(r.book) || {}).label + ')'])))) : null,
            ]));
            return;
          }
          if (f.kind === 'lines') {
            line.appendChild(el('input', { type: 'text', class: 'text', placeholder: f.name, value: (row[f.name] || []).join(', '), onchange: (ev) => set(ev.target.value.split(',').map((x) => x.trim()).filter(Boolean)) }));
            return;
          }
          line.appendChild(el('label', { class: 'row-field' }, [el('span', { class: 'prop-k' }, [f.name]), input(f, row[f.name], set)]));
        });
        line.appendChild(button('remove', () => { rows.splice(i, 1); onchange(rows.slice()); draw(); }, 'ghost tiny'));
        box.appendChild(line);
      });
      box.appendChild(button('+ ' + s.of, () => { const r = {}; s.fields.forEach((f) => { r[f.name] = f.kind === 'lines' ? [] : f.kind === 'dots' ? (f.min || 0) : f.kind === 'flag' ? f.default : null; }); rows.push(r); onchange(rows.slice()); draw(); }, 'ghost tiny'));
      if (s.of === 'Advantage Line') {
        const taken = new Set(rows.map((r) => r.Advantage).filter(Boolean));
        const levels = loresheetLevels().filter((r) => !taken.has(r.id));
        if (levels.length) {
          const pick = el('select', { class: 'scope lore-pick' }, [el('option', { value: '' }, ['+ a loresheet level…'])].concat(levels.map((r) => el('option', { value: r.id }, [r.under + ' · ' + '●'.repeat(r.rating || 0) + ' ' + r.name]))));
          pick.addEventListener('change', () => {
            const r = levels.find((x) => x.id === pick.value);
            if (!r) return;
            rows.push({ Name: r.name, Dots: r.rating, Flaw: false, Advantage: r.id });
            onchange(rows.slice()); draw();
          });
          box.appendChild(pick);
        } else box.appendChild(el('div', { class: 'muted small' }, [available().size ? 'Every level of the available loresheets is taken.' : 'No loresheets are available — the Storyteller makes them available.']));
      }
    };
    draw();
    return box;
  }

  function linesEditor(s, lines, onchange) {
    const box = el('div', { class: 'lines' });
    const draw = () => {
      box.innerHTML = '';
      lines.forEach((t, i) => box.appendChild(el('div', { class: 'row-line' }, [
        el('input', { type: 'text', class: 'text', value: t, oninput: debounce((ev) => { lines[i] = ev.target.value; onchange(lines.slice()); }, 250) }),
        button('remove', () => { lines.splice(i, 1); onchange(lines.slice()); draw(); }, 'ghost tiny'),
      ])));
      box.appendChild(button('+ a line', () => { lines.push(''); onchange(lines.slice()); draw(); }, 'ghost tiny'));
    };
    draw();
    return box;
  }

  // ── the sheet: every declared field, in order; a run of dots labelled by its heading ──
  // opts: { edit(values) → called with the new values; readOnly; only: [field names] }
  function render(values, opts) {
    const o = opts || {};
    const v = complete(values);
    const set = (k, val) => { v[k] = val; if (o.edit) o.edit(Object.assign({}, v)); };
    const box = el('div', { class: 'vsheet' });
    const specs = o.only ? specFor(v).filter((x) => o.only.indexOf(x.name) !== -1) : specFor(v);
    let i = 0;
    while (i < specs.length) {
      const s = specs[i];
      if (s.kind === 'dots' && (s.max || 0) <= 5 && groupOf(s.name)) {
        // a run of dotted fields: grouped by the heading each sits under in the core
        const run = [];
        while (i < specs.length && specs[i].kind === 'dots' && specs[i].max <= 5 && groupOf(specs[i].name)) run.push(specs[i++]);
        const groups = [];
        run.forEach((f) => {
          const g = groupOf(f.name);
          if (!groups.length || groups[groups.length - 1].label !== g) groups.push({ label: g, fields: [] });
          groups[groups.length - 1].fields.push(f);
        });
        box.appendChild(el('div', { class: 'dot-groups' }, groups.map((g) => el('div', { class: 'dot-group' }, [
          el('div', { class: 'group-h' }, [g.label]),
          ...g.fields.map((f) => el('div', { class: 'dot-row' }, [el('span', { class: 'dot-k', title: label(f.name) !== f.name ? f.name : null }, [label(f.name)]), o.readOnly ? dots(v[f.name], f.min, f.max) : input(f, v[f.name], (val) => set(f.name, val))])),
        ]))));
        continue;
      }
      i++;
      let control;
      if (s.kind === 'rows') control = o.readOnly ? readRows(s, v[s.name]) : rowsEditor(s, (v[s.name] || []).slice(), (rows) => set(s.name, rows));
      else if (s.kind === 'lines') control = o.readOnly ? el('ul', { class: 'items' }, (v[s.name] || []).filter(Boolean).map((t) => el('li', {}, [t]))) : linesEditor(s, (v[s.name] || []).slice(), (lines) => set(s.name, lines));
      else if (o.readOnly) control = s.kind === 'dots' ? dots(v[s.name], s.min, s.max) : el('span', {}, [v[s.name] == null || v[s.name] === '' ? '—' : String(v[s.name])]);
      else control = input(s, v[s.name], (val) => set(s.name, val));
      const hint = s.name in derived(v) ? el('span', { class: 'muted small' }, [' ' + (s.name === 'Health' ? HEALTH_FROM[0] + ' + ' + HEALTH_FROM[1] : WILLPOWER_FROM.join(' + ')) + ' = ' + derived(v)[s.name]]) : null;
      box.appendChild(el('div', { class: 'prop sheet-field f-' + s.kind }, [el('div', { class: 'prop-k' }, [s.name, s.required ? ' *' : '']), el('div', { class: 'prop-v' }, [control, hint])]));
      if (s.name === 'Blood Potency') {
        const pr = potencyRow(v['Blood Potency'] || 0);
        if (pr) box.appendChild(el('div', { class: 'potency' }, [
          el('div', { class: 'group-h' }, ['Blood Potency ' + (v['Blood Potency'] || 0) + ' · the Errata and Rules Update chart']),
          el('dl', { class: 'power-head' }, pr.columns.slice(1).map((c, k) => [el('dt', {}, [c]), el('dd', {}, [pr.row[k + 1] || '—'])])),
        ]));
      }
    }
    return box;
  }

  function readRows(s, rows) {
    return el('ul', { class: 'items' }, (rows || []).map((r) => (s.of === 'Advantage Line' && r.Advantage ? el('li', {}, [levelLine(r, null)]) : el('li', {}, [s.fields.map((f) => {
      if (f.kind === 'entity') return null;
      const x = r[f.name];
      if (x == null || x === '' || (Array.isArray(x) && !x.length)) return null;
      if (f.kind === 'dots') return ' ' + '●'.repeat(x) + '○'.repeat(Math.max(0, (f.max || 5) - x));
      if (f.kind === 'flag') return x ? ' (' + f.name + ')' : null;
      return (Array.isArray(x) ? ' — ' + x.join(', ') : ' ' + x);
    }).filter(Boolean).join('').trim()]))));
  }

  // ── a character file ──
  // extra: { versions, log } — a character's archived versions and its log travel in its file
  function fileOf(values, live, extra) {
    const x = extra || {};
    return { kind: FILE_KIND, v: 2, system: 'vtm5e', templateId: templateId(values), name: values.Name || 'Unnamed', values: complete(values), live: live || {},
      versions: x.versions && x.versions.length ? x.versions : undefined, log: x.log && x.log.length ? x.log : undefined };
  }
  function download(obj, name) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = String(name || 'kindred').replace(/[^\w.-]+/g, '-').toLowerCase() + '.vtm5e-character.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  const genId = () => 'pc-' + Math.random().toString(36).slice(2, 10);

  // A character file → its values (a v1 file from before D1 held only name and player).
  function valuesOf(obj) {
    if (obj.values) return complete(obj.values);
    const c = obj.character || {};
    return complete(Object.assign({}, c.values || c, { Name: obj.name || c.Name || c.name }));
  }

  function readMember(obj, fileName) {
    if (!obj || typeof obj !== 'object') throw new Error((fileName || 'That file') + ' is not a character file.');
    if (obj.system && obj.system !== 'vtm5e') throw new Error((fileName || 'That file') + ' is a ' + obj.system + ' character, not a Vampire one.');
    const values = valuesOf(obj);
    const name = String(values.Name || obj.name || '').trim();
    if (!name) throw new Error((fileName || 'That file') + ' has no character name.');
    values.Name = name;
    const m = { id: genId(), templateId: (isSabbat(values) && obj.templateId) || templateId(values), name, source: { kind: 'file', name: fileName || null }, character: values, live: Object.assign({ hunger: +values.Hunger || 0 }, obj.live || {}), notes: '' };
    if (Array.isArray(obj.versions) && obj.versions.length) m.versions = obj.versions;
    // what the file's log held (earlier sessions): kept with the member, shown before this table's
    if (Array.isArray(obj.log) && obj.log.length) m.history = obj.log.map((e) => Object.assign({}, e, { memberId: undefined }));
    return m;
  }
  function newMember(name, player) {
    const n = String(name || '').trim();
    if (!n) throw new Error('A character needs a name.');
    const values = blank();
    values.Name = n;
    if (player) values.player = String(player).trim();
    return { id: genId(), templateId: templateId(), name: n, source: { kind: 'table' }, character: values, live: { hunger: 0 }, notes: '' };
  }
  // an archived version on screen withholds the file: the file is always the live character
  const downloadMember = (m) => {
    if (isViewingArchive(m)) return window.alert('“' + m.name + '” is showing an archived version. Return to Current to download the character file.');
    download(fileOf(m.character || {}, m.live, { versions: m.versions || [], log: logOf(m) }), m.name);
  };
  // a character's log: what its file brought, then this table's entries for it
  function logOf(m) {
    const here = ((State().state || {}).log || []).filter((x) => (x.kind === 'roll' || x.kind === 'track') && x.memberId === m.id);
    const seen = new Set(here.map((x) => x.at + '|' + x.kind));
    return (m.history || []).filter((x) => !seen.has(x.at + '|' + x.kind)).concat(here);
  }

  // a member's sheet now: its file's values, overlaid by any edit made in play (live.sheet)
  // (a member held before the ACTOR — v1, decision 12 — carries only {name, player})
  const values = (m) => {
    const v = Object.assign({}, m.character || {}, (m.live || {}).sheet || {});
    if (!v.Name) v.Name = m.name || v.name || '';
    return complete(v);
  };
  const hunger = (m) => Math.max(0, Math.min(Dice.HUNGER_MAX, +((m.live || {}).hunger || 0)));
  // under the member's name (the heading), so it says what they are, not who
  // a character made with The Black Hand says so, and says when this table has not allowed it
  // (and a loresheet level whose loresheet the Storyteller has not made available)
  const unavailableLoresheets = (v) => {
    const st = ((State() || {}).state) || {};
    const on = new Set(st.loresheets || []);
    const recs = D.records();
    const names = [];
    (v['Advantages & Flaws'] || []).forEach((r) => {
      const lv = r.Advantage && recs.find((x) => x.id === r.Advantage && x.kind === 'loresheet level');
      if (lv && !on.has(lv.loresheet)) { const ls = recs.find((x) => x.id === lv.loresheet); if (ls && names.indexOf(ls.name) === -1) names.push(ls.name); }
    });
    return names;
  };
  const sourceNote = (v) => {
    const bits = [];
    if (isSabbat(v)) bits.push(' · The Black Hand' + ((((State() || {}).state || {}).creation || {}).blackHand ? '' : ' (not allowed at this table)'));
    if (kindOf(v) === 'cainite') bits.push(' · Summoned Stories' + ((((State() || {}).state || {}).creation || {}).roads ? '' : ' (not allowed at this table)'));
    const ls = unavailableLoresheets(v);
    if (ls.length) bits.push(' · ' + ls.join(', ') + ' (loresheet not available here)');
    return bits.join('');
  };
  const memberSentence = (m) => { const v = values(m); return (traits(v).join(' · ') || KINDS[kindOf(v)].label) + sourceNote(v) + (isVampire(v) ? ' · Hunger ' + hunger(m) : '') + (v.player ? ' · played by ' + v.player : ''); };

  // Every change to a character's trackers is one event in the log, with its cause: the live
  // patch and a { kind: 'track' } entry naming each track's before and after. A player may send
  // both for their own character (setPartyLive, appendLog with their memberId).
  const TRACK_LABEL = { hunger: 'Hunger', health: 'Health', willpower: 'Willpower', stains: 'Stains', Humanity: 'Humanity', xpEarned: 'Total Experience', xpSpent: 'Spent Experience' };
  const NOT_TRACKS = ['sheet', 'xpLedger'];
  const trackText = (k, v) => (k === 'health' || k === 'willpower' ? (v && (v.sup || v.agg) ? [v.sup ? v.sup + ' Superficial' : null, v.agg ? v.agg + ' Aggravated' : null].filter(Boolean).join(', ') : 'unmarked') : String(v == null ? 0 : v));
  function change(m, patch, cause) {
    const cur = (live0(m));
    const now = (State().state.party || []).find((x) => x.id === m.id) || m;
    // XP held only on the sheet (Total / Spent Experience) is its "before" until play changes it
    const before = (k) => (cur[k] != null ? cur[k] : k === 'xpEarned' ? xp(now).earned : k === 'xpSpent' ? xp(now).spent : cur[k]);
    const changes = Object.keys(patch).filter((k) => NOT_TRACKS.indexOf(k) === -1 && trackText(k, before(k)) !== trackText(k, patch[k]))
      .map((k) => [TRACK_LABEL[k] || k, trackText(k, before(k)), trackText(k, patch[k])]);
    State().commit('setPartyLive', [m.id, patch]);
    if (changes.length) State().commit('appendLog', [{ at: Date.now(), kind: 'track', memberId: m.id, who: m.name || null, changes, cause: cause || null }]);
  }
  const live0 = (m) => ((State().state.party || []).find((x) => x.id === m.id) || m).live || {};
  // a tracker event in the log: "Hunger 1 → 2 · Rouse Check failed (3)"
  const trackLine = (x) => el('div', { class: 'roll-line track-line' }, [
    el('span', { class: 'roll-who' }, [x.who || 'A character']),
    el('span', { class: 'small' }, [(x.changes || []).map((c) => c[0] + ' ' + c[1] + ' → ' + c[2]).join(' · ')]),
    x.cause ? el('span', { class: 'muted small' }, [x.cause]) : null,
  ]);
  function setHunger(m, n, cause) { change(m, { hunger: Math.max(0, Math.min(Dice.HUNGER_MAX, n)) }, cause); }
  function setLive(m, patch, cause) { change(m, patch, cause || 'marked on the sheet'); }

  // Damage to a tracker of `size` boxes, level by level (Tracking Damage, Impairment):
  // "Mark each level of Superficial damage on the character sheet by making a “/” … Mark
  //  Aggravated damage … by making an “X”"; once full, "For every level of damage of either kind
  //  … that a character takes while Impaired, convert one previously sustained Superficial damage
  //  to Aggravated damage on a one-for-one basis." Halving is the caller's (a spent point of
  //  Willpower is already "a level of Superficial damage").
  function damage(size, t, kind, levels) {
    let sup = (t && t.sup) || 0, agg = (t && t.agg) || 0;
    for (let i = 0; i < levels; i++) {
      if (sup + agg < size) { if (kind === 'agg') agg++; else sup++; }
      else if (sup > 0) { sup--; agg++; }
    }
    return { sup, agg };
  }

  // ── trackers ──
  // A tracker's boxes: `size` boxes, Aggravated marked first from the left, then Superficial.
  function tracker(size, t, onchange) {
    const agg = Math.min(size, t.agg || 0);
    const sup = Math.min(size - agg, t.sup || 0);
    const boxes = Array.from({ length: size }, (_, i) => (i < agg ? 'agg' : i < agg + sup ? 'sup' : ''));
    return el('span', { class: 'tracker' }, boxes.map((k, i) => el('button', {
      type: 'button', class: 'tbox ' + k, title: k === 'agg' ? 'Aggravated' : k === 'sup' ? 'Superficial' : 'empty',
      // click cycles the box: empty → Superficial → Aggravated → empty
      onclick: onchange ? () => {
        const next = { sup, agg };
        if (k === '') next.sup = sup + 1;
        else if (k === 'sup') { next.sup = sup - 1; next.agg = agg + 1; }
        else next.agg = agg - 1;
        onchange(next);
      } : null,
    }, [k ? MARK[k] : ''])));
  }
  const impaired = (size, t) => size > 0 && ((t.sup || 0) + (t.agg || 0)) >= size;

  // Humanity with its Stains: dots from the left, Stains checked from the right.
  function humanityTrack(h, stains, onStains, label) {
    return el('span', { class: 'tracker humanity' }, Array.from({ length: 10 }, (_, i) => {
      const stained = i >= 10 - stains;
      const k = i < h ? 'dot-on' : stained ? 'stain' : '';
      return el('button', { type: 'button', class: 'tbox ' + k, title: k === 'stain' ? 'Stain' : i < h ? (label || 'Humanity') : 'empty',
        onclick: onStains ? () => onStains(stained ? Math.max(0, stains - 1) : Math.min(10 - h, 10 - i)) : null,
      }, [k === 'stain' ? '/' : k === 'dot-on' ? '●' : '']);
    }));
  }

  // ── a Cainite's Road at its rating (Summoned Stories, The Road System) ──
  // "The Road rating determines the level of sin the character recognizes, as well as all sins
  // listed below that rating" - Degeneration. The Road's entry at the character's rating (its
  // Moral Guideline, Rationale and Effects) and the Road's Aura, each read from the book.
  const ROAD_BOOK = KINDS.cainite.book;
  const roadEntity = (key) => (D.loaded(ROAD_BOOK) ? D.all([ROAD_BOOK]).find((e) => e.key === key) || null : null);
  const roadAt = (road, n) => (road ? roadEntity(road + ': Rating ' + n) : null);
  // The Aura entity prints one line per Road ("Kings" - "Air of Authority"), keyed by the word the
  // Road's heading names it by ("Road of Kings (Scions)")
  function auraOf(road) {
    const a = roadEntity('Aura');
    const w = /^Road of (?:the )?(\S+)/.exec(road || '');
    return a && w ? D.text(a, w[1]) : null;
  }
  function roadBlock(v, o) {
    if (kindOf(v) !== 'cainite' || !v.Road) return null;
    const n = +v['Road Rating'] || 0;
    const e = roadAt(v.Road, n);
    const aura = auraOf(v.Road);
    const auraE = roadEntity('Aura');
    const open = (id) => (o.onRule || window.VtmOpenEntity)(id);
    return el('div', { class: 'road-block' }, [
      el('div', { class: 'prop-k' }, [v.Road + ' · ' + n]),
      e ? el('dl', { class: 'power-head' }, ['Moral Guideline', 'Rationale'].filter((k) => D.text(e, k)).map((k) => [el('dt', {}, [k]), el('dd', {}, [D.text(e, k)])])) : null,
      e && (D.val(e, 'Effects') || []).length ? el('ul', { class: 'items small' }, D.val(e, 'Effects').map((t) => el('li', {}, [t && typeof t === 'object' ? String(t.value) : String(t)]))) : null,
      aura ? el('div', { class: 'small' }, [el('b', {}, ['Aura: ']), auraE ? el('button', { class: 'ref', type: 'button', title: 'Aura, as printed', onclick: () => open(auraE.id) }, [aura]) : aura]) : null,
      e ? el('button', { class: 'ref small', type: 'button', onclick: () => open(e.id) }, ['The Hierarchy of Sins']) : null,
    ]);
  }

  // One roller per member (and per page role), kept across redraws — the panels redraw on
  // every state change, a roll's own log entry is one.
  const rollers = {};
  function rollerFor(m, o) {
    const key = m.id + (o.player ? ':player' : ':gm');
    let r = rollers[key];
    if (!r) {
      const id = m.id;
      r = rollers[key] = Dice.roller({
        pool: 4, hunger: hunger(m), who: m.name, living: !isVampire(values(m)),
        onRule: o.onRule || window.VtmOpenEntity,
        onHunger: (n, cause) => setHunger({ id, name: m.name }, n, cause),
        // a roll made while a conflict is on is that conflict's (the one-roll results read it)
        onRoll: (entry) => State().commit('appendLog', [Object.assign(entry, { memberId: id }, (State().state.conflict ? { conflict: State().state.conflict.id } : {}))]),
        onWillpower: (dice) => spendWillpower({ id, name: m.name }, 'Willpower re-roll of ' + dice + (dice === 1 ? ' die' : ' dice')),
        surge: isVampire(values(m)) ? () => surgeFor({ id }) : null,
      });
    } else {
      if (r.hunger() !== hunger(m)) r.setHunger(hunger(m));
      else r.refresh();
    }
    return r;
  }

  // "A spent point of Willpower counts as having sustained a level of Superficial damage to
  //  Willpower" — Willpower
  function spendWillpower(m, cause) {
    const cur = (State().state.party || []).find((x) => x.id === m.id) || m;
    const v = values(cur);
    const size = +v.Willpower || derived(v).Willpower;
    change(cur, { willpower: damage(size, live0(cur).willpower || {}, 'sup', 1) }, cause);
  }

  // ── Experience ──
  // The ACTOR's Total Experience is XP earned and its Spent Experience XP spent; play changes
  // either (live.xpEarned, live.xpSpent), and a spend adds its cost to spent and a line to the
  // ledger — cost, what it bought, a note, the date — logged. A printed ^"Experience Ledger"
  // ("cost · what · note · when", an instance's layer) is the ledger until play adds to it.
  function xp(m) {
    const lv = m.live || {};
    const v = values(m);
    const earned = lv.xpEarned != null ? +lv.xpEarned : (+v['Total Experience'] || 0);
    const spent = lv.xpSpent != null ? +lv.xpSpent : (+v['Spent Experience'] || 0);
    const printed = (v['Experience Ledger'] || []).map((x) => { const q = String(x).split(' · '); return { cost: parseInt(q[0], 10) || 0, what: q[1] || '', note: q[2] || null, when: q[3] || null }; });
    return { earned, spent, available: earned - spent, ledger: lv.xpLedger || printed };
  }
  const memberNow = (m) => (State().state.party || []).find((x) => x.id === m.id) || m;
  function xpBlock(m, ro) {
    const x = xp(m);
    const adj = (key, d) => { const cur = xp(memberNow(m)); change(memberNow(m), { [key]: Math.max(0, (key === 'xpEarned' ? cur.earned : cur.spent) + d) }, key === 'xpEarned' ? 'experience awarded' : 'corrected by hand'); };
    const cost = el('input', { class: 'text num small', type: 'number', min: 1, placeholder: 'cost' });
    const what = el('input', { class: 'text small', type: 'text', placeholder: 'on what (Brawl 2 → 3, a Discipline power…)' });
    const note = el('input', { class: 'text small', type: 'text', placeholder: 'note' });
    const stat = (label, key, n) => el('span', { class: 'xp-stat' }, [el('span', { class: 'prop-k' }, [label]),
      ro || !key ? null : button('−', () => adj(key, -1), 'ghost tiny'), el('b', { class: 'num' }, [String(n)]), ro || !key ? null : button('+', () => adj(key, 1), 'ghost tiny')]);
    return el('div', { class: 'xp' }, [
      el('div', { class: 'chiprow tight' }, [stat('Total Experience', 'xpEarned', x.earned), stat('Spent', 'xpSpent', x.spent), stat('Available', null, x.available)]),
      x.ledger.length ? el('ul', { class: 'items xp-ledger' }, x.ledger.map((e) => el('li', {}, [el('b', { class: 'num' }, [String(e.cost)]), ' ', e.what, e.note ? el('em', { class: 'muted' }, [' ' + e.note]) : null, e.when ? el('span', { class: 'muted small' }, [' · ' + e.when]) : null]))) : null,
      // Advancement: its own page, priced from the core's Trait Costs (system/vtm5e/advance.js)
      ro || !window.VtmAdvance ? null : el('div', { class: 'chiprow tight' }, [button('Advancement…', () => window.VtmAdvance.open(memberNow(m)), 'tiny'), el('span', { class: 'muted small' }, ['buy dots at the core’s Trait Costs'])]),
      ro ? null : el('div', { class: 'chiprow tight' }, [cost, what, note, button('Spend', () => {
        const n = parseInt(cost.value || '0', 10);
        if (!(n > 0) || !what.value.trim()) return;
        const mm = memberNow(m);
        const cur = xp(mm);
        const line = { cost: n, what: what.value.trim(), note: note.value.trim() || null, when: new Date().toISOString().slice(0, 10) };
        change(mm, { xpLedger: cur.ledger.concat([line]), xpSpent: cur.spent + n }, 'spent on ' + line.what + (line.note ? ' (' + line.note + ')' : ''));
      }, 'ghost tiny')]),
    ]);
  }

  // ── Versions ──
  // An archived copy of the character and its trackers, read-only; the picker shows one in place
  // of the live sheet (a view in this window — the member does not change). Archiving is an op
  // (system/vtm5e/ops.js archivePartyVersion), so the room keeps it with the member.
  const viewing = {};
  const versionsOf = (m) => m.versions || [];
  const isViewingArchive = (m) => !!viewing[m.id] && versionsOf(m).some((x) => x.id === viewing[m.id]);
  function archive(m) {
    const mm = memberNow(m);
    const label = window.prompt('Name this version (it is kept read-only):', 'Version ' + (versionsOf(mm).length + 1));
    if (!label) return;
    const snap = JSON.parse(JSON.stringify({ character: mm.character || {}, live: mm.live || {} }));
    State().commit('archivePartyVersion', [mm.id, { id: State().genId('v'), label, date: new Date().toISOString().slice(0, 10), character: snap.character, live: snap.live }]);
    State().commit('appendLog', [{ at: Date.now(), kind: 'track', memberId: mm.id, who: mm.name, changes: [], cause: 'archived this version as “' + label + '”' }]);
  }
  const redrawAll = () => window.VttBus.emit('state:remote', { view: true }, { local: true });
  function versionPicker(m, noArchive) {
    const vs = versionsOf(m);
    const sel = el('select', { class: 'scope tiny', title: 'The live sheet, or an archived version (read-only)' },
      [el('option', { value: '' }, ['Current'])].concat(vs.map((x) => el('option', { value: x.id, selected: viewing[m.id] === x.id || null }, [x.label + (x.date ? ' · ' + x.date : '')]))));
    sel.addEventListener('change', () => { viewing[m.id] = sel.value || null; redrawAll(); });
    return el('div', { class: 'chiprow tight version-pick' }, [vs.length ? sel : null, noArchive ? null : button('Archive this version…', () => archive(m), 'ghost tiny')]);
  }
  function archived(m, o) {
    const ver = versionsOf(m).find((x) => x.id === viewing[m.id]);
    const am = { id: m.id, name: m.name, character: ver.character, live: ver.live || {} };
    const v = values(am);
    const lv = am.live;
    const box = el('div', { class: 'sheet live archived' });
    box.appendChild(el('div', { class: 'sheet-head' }, [el('h2', { class: 'chapter-h' }, [m.name]), el('div', { class: 'entity-sub' }, [memberSentence(am)])]));
    box.appendChild(versionPicker(m));
    box.appendChild(el('div', { class: 'archive-banner' }, ['Viewing “' + ver.label + '”' + (ver.date ? ' (' + ver.date + ')' : '') + ' — archived, read-only. Its file waits until you return to Current.']));
    const mo = morality(v);
    const h = +v[mo.key] || 0;
    box.appendChild(el('div', { class: 'trackers' }, [
      el('div', { class: 'track' }, [el('span', { class: 'prop-k' }, ['Health']), tracker(+v.Health || derived(v).Health, lv.health || {}, null)]),
      el('div', { class: 'track' }, [el('span', { class: 'prop-k' }, ['Willpower']), tracker(+v.Willpower || derived(v).Willpower, lv.willpower || {}, null)]),
      el('div', { class: 'track' }, [el('span', { class: 'prop-k' }, [mo.label]), humanityTrack(h, +lv.stains || 0, null, mo.label)]),
    ]));
    box.appendChild(xpBlock(am, true));
    box.appendChild(el('details', { class: 'sheet-details', open: o.player ? 'open' : null }, [el('summary', {}, ['The sheet']), render(v, { edit: null })]));
    return box;
  }

  // Build a pool from the sheet: an Attribute plus a Skill or a Discipline.
  function poolBuilder(m, roller) {
    const v = values(m);
    const live = m.live || {};
    const sheetH = +v.Health || derived(v).Health;
    const sheetW = +v.Willpower || derived(v).Willpower;
    const attrSel = el('select', { class: 'scope' }, [el('option', { value: '' }, ['Attribute…'])].concat(attributes().map((a) => el('option', { value: a }, [a + ' ' + (v[a] || 0)]))));
    const second = el('select', { class: 'scope' }, [el('option', { value: '' }, ['+ Skill or Discipline…'])].concat(
      skills().map((s) => el('option', { value: 'S:' + s }, [label(s) + ' ' + (v[s] || 0)])),
      (v.Disciplines || []).filter((d) => d.Discipline).map((d) => el('option', { value: 'D:' + d.Discipline }, [d.Discipline + ' ' + (d.Dots || 0)])),
    ));
    const note = el('span', { class: 'muted small' });
    const apply = () => {
      const a = attrSel.value;
      if (!a) return;
      let n = +v[a] || 0;
      let what = a;
      const s2 = second.value;
      if (s2.startsWith('S:')) { n += +v[s2.slice(2)] || 0; what += ' + ' + label(s2.slice(2)); }
      if (s2.startsWith('D:')) { const d = (v.Disciplines || []).find((x) => x.Discipline === s2.slice(2)); n += +(d && d.Dots) || 0; what += ' + ' + s2.slice(2); }
      // Impairment: Physical pools from a full Health tracker, Social and Mental from Willpower
      const g = groupOf(a) || '';
      let pen = 0;
      if (/Physical/.test(g) && impaired(sheetH, live.health || {})) pen = IMPAIRED_PENALTY;
      if (/Social|Mental/.test(g) && impaired(sheetW, live.willpower || {})) pen = IMPAIRED_PENALTY;
      note.textContent = pen ? ' Impaired: −' + pen : '';
      roller.setPool(Math.max(0, n - pen), what + (pen ? ' (Impaired −' + pen + ')' : ''));
    };
    attrSel.addEventListener('change', apply);
    second.addEventListener('change', apply);
    return el('div', { class: 'chiprow tight' }, [el('span', { class: 'prop-k' }, ['Pool']), attrSel, second, note]);
  }

  // The live panel: trackers, Hunger, Humanity and Stains, the roller, the sheet, notes.
  // opts: { player, onRule }
  function live(m, opts) {
    const o = opts || {};
    if (isViewingArchive(m)) return archived(m, o);
    const v = values(m);
    const lv = m.live || {};
    const box = el('div', { class: 'sheet live' + (o.player ? ' player' : '') });
    // Each block belongs to a pane. On a phone the player's page shows one pane at a time behind a
    // bar at the bottom (assets/css/vtm5e-gm.css, ≤ 640px); everywhere else every block shows.
    const add = (node, pane) => { if (node) { if (node.setAttribute) node.setAttribute('data-pane', pane); box.appendChild(node); } return node; };
    add(el('div', { class: 'sheet-head' }, [el('h2', { class: 'chapter-h' }, [m.name]), el('div', { class: 'entity-sub' }, [memberSentence(m)])]), 'play');
    const hSize = +v.Health || derived(v).Health;
    const wSize = +v.Willpower || derived(v).Willpower;
    const ruleLink = (id, label) => el('a', { class: 'rule-link small', href: '#', onclick: (ev) => { ev.preventDefault(); (o.onRule || window.VtmOpenEntity)(id); } }, [label]);
    const mo = morality(v);
    const h = +v[mo.key] || 0;
    const stains = +lv.stains || 0;
    add(el('div', { class: 'trackers' }, [
      el('div', { class: 'track' }, [el('span', { class: 'prop-k' }, ['Health']), tracker(hSize, lv.health || {}, (t) => setLive(m, { health: t })), impaired(hSize, lv.health || {}) ? el('span', { class: 'verdict-bit blood' }, ['Impaired']) : null]),
      el('div', { class: 'track' }, [el('span', { class: 'prop-k' }, ['Willpower']), tracker(wSize, lv.willpower || {}, (t) => setLive(m, { willpower: t })), impaired(wSize, lv.willpower || {}) ? el('span', { class: 'verdict-bit blood' }, ['Impaired']) : null]),
      el('div', { class: 'track' }, [el('span', { class: 'prop-k' }, [mo.label]), humanityTrack(h, stains, (n) => setLive(m, { stains: n }), mo.label),
        stains > 10 - h ? el('span', { class: 'verdict-bit blood' }, ['Degeneration']) : null,
        stains ? button('Remorse test', () => {
          const n = Math.max(REMORSE_MIN, 10 - h - stains);
          const dice = Dice.rollPool(n, 0, true);
          const res = Dice.evaluate(dice, null);
          State().commit('appendLog', [Object.assign(Dice.entry({ who: m.name, label: 'Remorse', pool: n, hunger: 0, difficulty: 1, dice }), { memberId: m.id })]);
          const values2 = Object.assign({}, v);
          if (res.successes < 1) values2[mo.key] = Math.max(0, h - 1);
          const lost = values2[mo.key] !== v[mo.key];
          change(m, lost ? { stains: 0, sheet: values2 } : { stains: 0 }, 'Remorse test: ' + res.successes + (res.successes === 1 ? ' success' : ' successes') + (lost ? ' — ' + mo.label + ' ' + h + ' → ' + values2[mo.key] : ''));
        }, 'ghost tiny') : null]),
      // the how-to line is the Storyteller's; the player's copy shows no working (owner, I12)
      o.player ? null : el('div', { class: 'muted small' }, ['Click a box: empty → ', MARK.sup, ' Superficial → ', MARK.agg, ' Aggravated. ', ruleLink(RULES.tracking, 'Tracking Damage'), ' · ', ruleLink(RULES.impairment, 'Impairment'), ' · ', ruleLink(RULES.stains, 'Stains'), ' · ', ruleLink(RULES.remorse, 'Remorse')]),
    ]), 'play');
    add(roadBlock(v, o), 'play');
    const roller = rollerFor(m, o);
    if (o.player) {
      if (window.VtmConflict) add(window.VtmConflict.playerBlock(m, v, roller, o), 'conflict');
      add(powersBlock(m, v, roller, o), 'play');
      add(loresheetCards(v), 'play');
      // the table's order (owner, I14): what it is for, the Difficulty, the dice — then the traits
      add(roller, 'roll');
      add(traitLists(m, v, roller), 'roll');
      const mine = logOf(m).filter((x) => x.kind === 'roll').slice(-5).reverse();
      if (mine.length) add(el('div', { class: 'roll-log' }, mine.map((x) => Dice.rollLine(x, o.onRule || window.VtmOpenEntity))), 'roll');
      add(el('div', { class: 'xp-box' }, [el('div', { class: 'prop-k' }, ['Experience']), xpBlock(m, false)]), 'sheet');
      if (versionsOf(m).length) add(versionPicker(m, true), 'sheet');
      add(el('div', { class: 'player-sheet' }, [render(v, { edit: (nv) => updateValues(m, nv) })]), 'sheet');
      add(el('div', { class: 'player-notes' }, [el('div', { class: 'prop-k' }, ['My notes']),
        el('textarea', { class: 'text', rows: 5, placeholder: 'Only you and the Storyteller see these', oninput: debounce((ev) => State().commit('setPartyPlayerNotes', [m.id, ev.target.value]), 400) }, [m.playerNotes || ''])]), 'sheet');
      panes(m, box, roller);
      return box;
    }
    box.appendChild(versionPicker(m));
    const rb = roadBlock(v, o);
    if (rb) box.appendChild(rb);
    box.appendChild(poolBuilder(m, roller));
    box.appendChild(roller);
    const pw = powersBlock(m, v, roller, o);
    if (pw) box.appendChild(pw);
    box.appendChild(el('details', { class: 'sheet-details xp-details' }, [el('summary', {}, ['Experience · ' + xp(m).available + ' available']), xpBlock(m, false)]));
    const history = logOf(m);
    if (history.length) box.appendChild(el('details', { class: 'sheet-details' }, [el('summary', {}, ['This character’s log (' + history.length + ')']),
      el('div', { class: 'char-log' }, history.slice().reverse().map((x) => (x.kind === 'roll' ? Dice.rollLine(x, o.onRule || window.VtmOpenEntity) : trackLine(x))))]));
    box.appendChild(el('details', { class: 'sheet-details' }, [
      el('summary', {}, ['The sheet']),
      render(v, { edit: o.gmEdit !== false ? (nv) => updateValues(m, nv) : null }),
    ]));
    box.appendChild(el('div', { class: 'prop-k' }, ['Storyteller’s notes', el('span', { class: 'muted' }, [' · never sent to players'])]));
    box.appendChild(el('textarea', { class: 'text', rows: 4, oninput: debounce((ev) => State().commit('setPartyNotes', [m.id, ev.target.value]), 400) }, [m.notes || '']));
    box.appendChild(el('div', { class: 'prop-k' }, ['The player’s notes']));
    box.appendChild(el('textarea', { class: 'text', rows: 3, readonly: 'readonly' }, [m.playerNotes || '']));
    box.appendChild(el('div', { class: 'chiprow' }, [button('Download character file', () => downloadMember(m), 'ghost tiny')]));
    return box;
  }

  // ── the player's page on a phone: the traits as lists, the panes and the bar ──
  // The Roll tab's traits (owner, I17): each group under a short-ruled name, its traits with their
  // dots on the right. Tapped, an Attribute is the pool's first half, a Skill or Discipline its
  // second; tapped again, it is taken out. The pool follows (with Impairment, as poolBuilder).
  const picks = {};   // member id → { a, b } the traits picked for the pool
  function traitLists(m, v, roller) {
    const pk = picks[m.id] = picks[m.id] || { a: null, b: null };
    const live = (memberNow(m).live) || {};
    const sheetH = +v.Health || derived(v).Health;
    const sheetW = +v.Willpower || derived(v).Willpower;
    const disc = {};
    (v.Disciplines || []).forEach((d) => { if (d.Discipline) disc[d.Discipline] = +d.Dots || 0; });
    const valueOf = (t) => (t in disc ? disc[t] : +v[t] || 0);
    const apply = () => {
      if (!pk.a && !pk.b) return;
      const n = (pk.a ? valueOf(pk.a) : 0) + (pk.b ? valueOf(pk.b) : 0);
      const g = pk.a ? groupOf(pk.a) || '' : '';
      let pen = 0;
      if (/Physical/.test(g) && impaired(sheetH, live.health || {})) pen = IMPAIRED_PENALTY;
      if (/Social|Mental/.test(g) && impaired(sheetW, live.willpower || {})) pen = IMPAIRED_PENALTY;
      roller.setPool(Math.max(0, n - pen), [pk.a, pk.b].filter(Boolean).map(label).join(' + ') + (pen ? ' (Impaired −' + pen + ')' : ''), true);
    };
    const row = (t, key) => el('button', { type: 'button', class: 'sk-row' + (pk[key] === t ? ' on' : ''),
      onclick: () => { pk[key] = pk[key] === t ? null : t; apply(); window.VttBus.emit('state:remote', { view: true }, { local: true }); } },
      [el('span', {}, [label(t)]), el('span', { class: 'sk-dots' }, ['●'.repeat(valueOf(t)) + '○'.repeat(Math.max(0, 5 - valueOf(t)))])]);
    const groups = (names) => {
      const by = [];
      names.forEach((t) => { const g = groupOf(t) || ''; let x = by.find((y) => y[0] === g); if (!x) by.push(x = [g, []]); x[1].push(t); });
      return by;
    };
    const list = el('div', { class: 'skill-list' });
    groups(attributes()).forEach(([g, ts]) => { list.appendChild(el('div', { class: 'sg-h' }, [g || 'Attributes'])); ts.forEach((t) => list.appendChild(row(t, 'a'))); });
    groups(skills()).forEach(([g, ts]) => { list.appendChild(el('div', { class: 'sg-h' }, [g || 'Skills'])); ts.forEach((t) => list.appendChild(row(t, 'b'))); });
    const ds = Object.keys(disc);
    if (ds.length) { list.appendChild(el('div', { class: 'sg-h' }, ['Disciplines'])); ds.forEach((t) => list.appendChild(row(t, 'b'))); }
    return list;
  }
  // the loresheet levels a character holds, as on the sheet: [Name] [Dots] [Loresheet] [Text]
  function loresheetCards(v) {
    const rows = (v['Advantages & Flaws'] || []).filter((r) => r.Advantage);
    return rows.length ? el('div', { class: 'lore-cards' }, [el('div', { class: 'prop-k' }, ['Loresheets'])].concat(rows.map((r) => levelLine(r, null)))) : null;
  }
  const PANES = [['play', 'Play'], ['conflict', 'Conflict'], ['roll', 'Roll'], ['sheet', 'Sheet']];
  const inConflict = {};   // member id → the conflict the last draw had (its tab opens once)
  const paneOf = {};   // member id → the pane showing; kept across the page's redraws
  const shown = {};    // member id → the pane switcher of the sheet on the page now
  function panes(m, box, roller) {
    const nav = el('nav', { class: 'pane-nav', 'aria-label': 'Sheet sections' });
    // on the Roll tab the bar's Roll rolls (red); elsewhere it opens the tab
    const show = (p, scroll) => {
      paneOf[m.id] = p;
      box.setAttribute('data-show', p);
      nav.querySelectorAll('button').forEach((b) => {
        b.classList.toggle('on', b.getAttribute('data-for') === p);
        b.classList.toggle('go', b.getAttribute('data-for') === 'roll' && p === 'roll');
      });
      if (scroll) window.scrollTo(0, 0);
    };
    // the Storyteller starts a conflict: its tab appears and opens; it ends: the tab goes, back to Play
    const c = (State().state || {}).conflict;
    if (c && inConflict[m.id] !== c.id) paneOf[m.id] = 'conflict';
    if (!c && paneOf[m.id] === 'conflict') paneOf[m.id] = 'play';
    inConflict[m.id] = c ? c.id : null;
    PANES.filter(([p]) => p !== 'conflict' || c).forEach(([p, label]) => nav.appendChild(el('button', { type: 'button', 'data-for': p, onclick: () => {
      if (p === 'roll' && paneOf[m.id] === 'roll' && roller.roll) {
        roller.roll();
        setTimeout(() => { const d = roller.querySelector('.dice-row'); if (d && d.isConnected) d.scrollIntoView({ block: 'center' }); }, 60);
      } else show(p, true);
    } }, [label])));
    box.appendChild(nav);
    shown[m.id] = show;
    show(paneOf[m.id] || 'play', false);
    // a power's Roll sets up the pool: take the player to it. The roller outlives the page's
    // redraws (rollerFor keeps one per member), so it is wrapped once
    if (!roller.panesWrapped) {
      const setPool = roller.setPool;
      roller.setPool = (n, label, stay) => { setPool(n, label); if (!stay && paneOf[m.id] !== 'roll' && shown[m.id]) shown[m.id]('roll', true); };
      roller.panesWrapped = true;
    }
  }

  // An edit made in play rides in the member's live state (the engine's setPartyLive, which a
  // player may send for their own character); the file's values stay as they were loaded.
  function updateValues(m, nv) {
    State().commit('setPartyLive', [m.id, { sheet: nv }]);
  }

  return {
    ACTOR, BOOKS, FILE_KIND, OLD_TEMPLATE_ID, HEALTH_FROM, WILLPOWER_FROM, RULES, SABBAT, SABBAT_BOOK, isSabbat, booksFor, sabbatDecl, unavailableLoresheets,
    spec, field, blank, complete, attributes, skills, derived, potencyRow, groupOf, sentence, render,
    fileOf, download, readMember, newMember, downloadMember, values, hunger, setHunger, change, damage, spendWillpower, trackLine,
    xp, logOf, isViewingArchive, versionsOf, surgeFor, potencyRow,
    memberSentence, live, powersFor, templateId, label, KINDS, kindOf, isVampire, morality, specOfKind, specFor,
  };
})();
