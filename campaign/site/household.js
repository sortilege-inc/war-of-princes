// campaign/site/household.js — the Household tab's numbers and rules, drawn from the character
// files and the books (owner, 2026-09-27: the page's own rules text is not to be trusted).
//
// The page (campaign/docs/household.html) keeps its portraits and prose; where it printed a
// character's traits, Discipline powers and Merits and Flaws it now holds a mount
// (campaign/build/household_rules_out.py), filled here:
//
//   data-part  attributes · skills   Tomisława's and the Graf's, as the page laid them out
//              stats                 an ally's or a vessel's line of Attributes and Skills
//              powers                each Discipline and power the file names; each power's text
//                                    is the book's, as printed, under it
//              advantages            each Merit and Flaw the file names, the book's text under it
//              road · guideline      Tomisława's Road at her rating, from the Road System
//   .wop-book  data-name             the book's own entry (the Herd note)
//
// The numbers are the character files' (campaign/characters/, converted from the table's record
// and checked by campaign/source/check_household.py), so the page and the VTT's sheets can never
// disagree. Labels are the sheet's (VtmSheet.label: the campaign's Archery and Riding).
window.WopHousehold = (function () {
  const { el } = window.VttRender;
  const D = window.VtmData;
  const Sheet = window.VtmSheet;
  const files = {};

  const load = (id) => (files[id] = files[id] || fetch('campaign/characters/' + id + '.vtm5e-character.json').then((r) => r.json()));
  const label = (n) => (Sheet && Sheet.label ? Sheet.label(n) : n);
  const ATTRS = [['Physical', ['Strength', 'Dexterity', 'Stamina']], ['Social', ['Charisma', 'Manipulation', 'Composure']], ['Mental', ['Intelligence', 'Wits', 'Resolve']]];
  const ABBR = { Strength: 'STR', Dexterity: 'DEX', Stamina: 'STA', Charisma: 'CHA', Manipulation: 'MAN', Composure: 'COM', Intelligence: 'INT', Wits: 'WIT', Resolve: 'RES' };
  const SKILLS = ['Athletics', 'Brawl', 'Craft', 'Drive', 'Firearms', 'Melee', 'Larceny', 'Stealth', 'Survival', 'Animal Ken', 'Etiquette', 'Insight', 'Intimidation', 'Leadership', 'Performance', 'Persuasion', 'Streetwise', 'Subterfuge', 'Academics', 'Awareness', 'Finance', 'Investigation', 'Medicine', 'Occult', 'Politics', 'Science', 'Technology'];
  const ordinal = (n) => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');
  // a character's Skills with dots, the highest first (the page's own order), each with its specialties
  const skillsOf = (v) => SKILLS.map((k, i) => ({ k, n: +v[k] || 0, i })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n || a.i - b.i)
    .map((x) => ({ name: x.k, n: x.n, specs: (v.Specialties || []).filter((s) => s.Skill === x.k).map((s) => s.Specialty) }));

  // ── the book's own text for an entity: its description, its printed fields, what is printed under it ──
  function printed(e, depth) {
    const box = el('div', { class: 'rules-verbatim' });
    if (e.desc) box.appendChild(window.VtmEntity ? window.VtmEntity.prose(e.desc) : el('p', {}, [e.desc]));
    (e.props || []).forEach((p) => {
      if (p.name === 'Discipline' || p.name === 'Level' || p.name === 'Rating' || p.name === 'Dots') return;
      const val = p.vk === 'list' ? (p.items || []).map((x) => (x && typeof x === 'object' ? x.value : x)).join('; ') : p.value;
      if (val != null && val !== '') box.appendChild(el('p', {}, [el('strong', {}, [p.name.replace(/:$/, '') + ': ']), String(val)]));
    });
    if ((depth || 0) < 2) D.children(e.id).forEach((k) => { box.appendChild(el('p', {}, [el('strong', {}, [k.name])])); box.appendChild(printed(k, (depth || 0) + 1)); });
    return box;
  }
  // a <details> whose body is the book's text, fetched (with its book) the first time it opens
  function asPrinted(id, summary) {
    const body = el('div', {}, [el('p', { class: 'muted' }, ['…'])]);
    const d = el('details', { class: 'power-full' }, [el('summary', {}, [summary || 'As printed']), body]);
    let done = false;
    d.addEventListener('toggle', () => {
      if (!d.open || done) return;
      done = true;
      D.fetch(id).then((e) => { body.innerHTML = ''; body.appendChild(e ? printed(e) : el('p', {}, ['(its book is not on this site)'])); });
    });
    return d;
  }
  const bookOf = (r) => ((D.indexBook && D.indexBook(r.book)) || {}).label || r.book;

  // the record a name on a sheet takes (the book's name before any bracket), the core's first
  function advantageRecord(line) {
    if (line.Advantage) return D.records().find((r) => r.id === line.Advantage) || null;
    const base = String(line.Name).replace(/\s*\(.*\)$/, '').toLowerCase();
    return D.records().find((r) => (r.kind === 'advantage' || r.kind === 'loresheet level') && r.name.toLowerCase() === base) || null;
  }
  function powerRecord(disc, name) {
    const bare = String(name).replace(/\s*\([^()]*\)$/, '');
    return D.powers().find((r) => r.discipline === disc && (r.name === name || r.name === bare)) || null;
  }

  // ── the parts ──
  function attributes(v) {
    const kind = Sheet.kindOf(v);
    const grid = el('div', { class: 'attr-grid' });
    ATTRS.forEach(([g, names]) => {
      grid.appendChild(el('div', { class: 'attr-group-label' }, [g]));
      names.forEach((n) => grid.appendChild(el('div', { class: 'attr-card' }, [el('div', { class: 'attr-name' }, [n]), el('div', { class: 'attr-val' }, [String(+v[n] || 0)])])));
    });
    const d = Sheet.derived(v);
    const cells = [['Health', v.Health || d.Health], ['Willpower', v.Willpower || d.Willpower]];
    if (Sheet.isVampire(v)) cells.push(['Hunger', +v.Hunger || 0], ['Blood Potency', +v['Blood Potency'] || 0]);
    if (kind === 'cainite') cells.push(['Road', +v['Road Rating'] || 0]);
    else cells.push(['Humanity', +v.Humanity || 0]);
    if (v.Generation) cells.push(['Generation', ordinal(+v.Generation)]);
    const row = el('div', { class: 'derived-row' }, cells.map(([k, n]) => el('div', { class: 'derived-cell' }, [el('span', { class: 'derived-label' }, [k]), el('span', { class: 'derived-val' }, [String(n)])])));
    return [grid, row];
  }
  function skills(v) {
    const list = skillsOf(v);
    const half = Math.ceil(list.length / 2);
    const row = (s) => el('div', { class: 'skill-row' }, [el('span', { class: 'skill-name' }, [label(s.name), ...s.specs.map((x) => el('em', { class: 'wop-spec' }, [' (' + x + ')']))]), el('span', { class: 'skill-val' }, [String(s.n)])]);
    return [el('div', { class: 'skills-cols' }, [el('div', {}, list.slice(0, half).map(row)), el('div', {}, list.slice(half).map(row))])];
  }
  function stats(v) {
    return [
      el('div', { class: 'ally-stats-row' }, ATTRS.reduce((a, [, ns]) => a.concat(ns), []).map((n) => el('span', { class: 'ally-stat' }, [ABBR[n] + ' ', el('strong', {}, [String(+v[n] || 0)])]))),
      el('div', { class: 'ally-stats-row' }, skillsOf(v).map((s) => el('span', { class: 'ally-stat' }, [label(s.name) + (s.specs.length ? ' (' + s.specs.join(', ') + ')' : '') + ' ', el('strong', {}, [String(s.n)])]))),
    ];
  }
  function powers(v) {
    return (v.Disciplines || []).map((d) => el('div', { class: 'disc-block' }, [
      el('div', { class: 'disc-header' }, [el('span', { class: 'disc-name' }, [d.Discipline]), el('span', { class: 'disc-rating' }, ['●'.repeat(+d.Dots || 0)])]),
      ...(d.Powers || []).map((name) => {
        const r = powerRecord(d.Discipline, name);
        return el('div', { class: 'power-item' + (r && r.kind === 'ritual' ? ' ritual' : '') }, [
          el('div', { class: 'power-title' }, [name, r ? el('span', { class: 'wop-meta' }, [' · ' + (r.level || '') + ' · ' + bookOf(r)]) : el('span', { class: 'wop-meta' }, [' · not found in the books'])]),
          r ? asPrinted(r.id, r.kind === 'ritual' ? 'The ritual, as printed' : 'The power, as printed') : null,
        ]);
      }),
    ]));
  }
  function advantages(v) {
    const lines = v['Advantages & Flaws'] || [];
    const col = (flaw) => el('div', {}, [el('div', { class: 'mf-group-label ' + (flaw ? 'flaw' : 'merit') }, [flaw ? 'Flaws' : 'Merits'])].concat(
      lines.filter((a) => !!a.Flaw === flaw).map((a) => {
        const r = advantageRecord(a);
        return el('div', { class: 'mf-item' }, [el('span', { class: 'mf-pts' }, [String(a.Dots)]), ' ' + a.Name,
          r ? asPrinted(r.id, bookOf(r)) : null]);
      })));
    const hasFlaws = lines.some((a) => a.Flaw);
    return [el('div', { class: 'mf-grid' }, [col(false), hasFlaws ? col(true) : el('div')])];
  }
  function road(v) {
    const e = D.loaded('summoned-stories') ? D.all(['summoned-stories']).find((x) => x.key === v.Road + ': Rating ' + (+v['Road Rating'] || 0)) : null;
    const aura = D.loaded('summoned-stories') ? D.all(['summoned-stories']).find((x) => x.key === 'Aura') : null;
    const w = /^Road of (?:the )?(\S+)/.exec(v.Road || '');
    return [v.Road + ' ' + (+v['Road Rating'] || 0), aura && w && D.text(aura, w[1]) ? el('em', {}, [' · Aura: ' + D.text(aura, w[1])]) : null].concat(e ? [] : []);
  }
  function guideline(v) {
    const e = D.loaded('summoned-stories') ? D.all(['summoned-stories']).find((x) => x.key === v.Road + ': Rating ' + (+v['Road Rating'] || 0)) : null;
    return e ? [D.text(e, 'Moral Guideline') || '', D.text(e, 'Rationale') ? el('em', {}, [' — ' + D.text(e, 'Rationale')]) : null] : [];
  }
  const PARTS = { attributes, skills, stats, powers, advantages, road, guideline };

  // Fill every mount in the drawn page. The books the sheet reads come first (the core for its
  // groupings, the Road System for a Cainite), then each character file once.
  function sheets(box) {
    const mounts = Array.from(box.querySelectorAll('.wop-sheet[data-character]'));
    const ids = Array.from(new Set(mounts.map((m) => m.getAttribute('data-character'))));
    const books = ['base', 'core', 'players-guide', 'errata', 'summoned-stories'].filter((b) => D.books().some((x) => x.id === b));
    D.ready(books).then(() => Promise.all(ids.map(load))).then((got) => {
      const byId = {};
      ids.forEach((id, i) => (byId[id] = Sheet.complete(got[i].values)));
      mounts.forEach((m) => {
        const v = byId[m.getAttribute('data-character')];
        const f = PARTS[m.getAttribute('data-part')];
        m.innerHTML = '';
        if (v && f) f(v).filter(Boolean).forEach((n) => m.appendChild(typeof n === 'string' ? document.createTextNode(n) : n));
      });
      box.querySelectorAll('.wop-book[data-name]').forEach((m) => {
        const name = m.getAttribute('data-name');
        const r = D.records().find((x) => x.kind === 'advantage' && x.name === name && x.book === 'core');
        if (!r) return;
        D.fetch(r.id).then((e) => { m.innerHTML = ''; m.appendChild(el('p', { class: 'callout-body' }, ['The core rulebook’s ' + name + ', as printed:'])); m.appendChild(printed(e)); });
      });
    });
  }

  return { sheets };
})();
