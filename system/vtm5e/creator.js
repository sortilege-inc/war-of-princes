// system/vtm5e/creator.js — making a character: the core rulebook's own Character Creation
// summary (the Session Zero sidebar, printed 136-137), walked step by step.
//
// The steps ARE the summary's paragraphs: each paragraph that opens in capitals ("CORE
// CONCEPT", "ATTRIBUTES", "SKILLS" … "SEA OF TIME") starts a step, and the paragraphs after
// it belong to it; the text is shown verbatim beside the step's controls. Every number the
// creator checks is PARSED from those sentences — "Take one Attribute at 4; three Attributes
// at 3; four Attributes at 2; one Attribute at 1", the three Skill distributions, "Put two
// dots in one and one dot in the other", "Spend 7 points on Advantages, and take 2 points of
// Flaws", "Select one to three Convictions", "Set your Humanity to 7" — so a corrected corpus
// corrects the creator. It counts and warns; it refuses nothing the book does not.
//
// The controls are the sheet's (system/vtm5e/sheet.js), over the ACTOR "Kindred" fields each
// step names. Which fields a step sets is this tool's (STEP_FIELDS); nothing else is.
//
// Third-party options (owner, 2026-09-25): a draft may use the third-party shelf's books — ticked
// by the player, with an acknowledgment that the character is playable only where the Storyteller
// allows those sources (the campaign's creation.blackHand says whether a table does). The Black
// Hand ADDS to the core's walk, never replaces it. Taking the book is not taking the sect (owner,
// 2026-10-07): with it on, its Discipline powers are offered to any character, and the player
// MAY then make the character Sabbat -- only a Sabbat character takes its Sabbat Predator types
// and a Path of Enlightenment (with Touchstone Ritae) beside Convictions and Touchstones, its own
// Quick Character Creation text for those two steps shown beside the core's, and is The Black
// Hand's ACTOR "Sabbat Kindred" (the Kindred and its Path; Sheet.isSabbat).
// Summoned Stories (owner, 2026-09-27) is the other kind of option: its brief REPLACES a step's
// fields - "Humanity: This is replaced by the Road system", "We will not be using Touchstones or
// Convictions" - so a draft using it is Summoned Stories' ACTOR "Cainite", which takes a Road and
// its rating ("Start with rating of 7", read from the brief's Starting Rating) in their place. A
// Road and a Path are two answers to one question; a draft takes one book or the other.
//
// Mortals and ghouls (owner, 2026-09-27): chosen on the Sources step, they are walked through the
// Companion's own "Creating a Mortal Character" / "Creating a Ghoul Character" (Part III), each of
// its headings a step, its text beside the controls. Where the Companion's step is the core's -
// Attributes, Skills, Advantages, Convictions - the same controls are used, their numbers parsed
// from the Companion's sentences; a ghoul's Skills follow the core's Quick Skills Assignment, as
// the Companion directs; a ghoul's Disciplines step takes a domitor and one level-1 power. The
// character is the BASE's ACTOR "Mortal" or "Ghoul" (Sheet.kindOf).
//
// The walk's order (owner, 2026-10-07): the summary's, except that Disciplines comes after
// Predator, so the Predator's Discipline dot is on the card before the clan's dots are placed.
// A step that opens a choice at an earlier one -- the Sea of Time's experience (a Discipline dot
// wants its power; a Skill a free specialty), its band (2 more points of Advantages and of Flaws,
// a point less Humanity) -- marks that earlier step as pending: its flag in the step list, its
// checks, and a note at the top of both steps saying which opened what. Every earlier step counts
// only its own placements; the dots a later step gave are shown beside them, fixed
// (VtmCreatorGuides.laterDots).
window.VtmCreator = (function () {
  const { el, button, debounce } = window.VttRender;
  const D = window.VtmData;
  const E = window.VtmEntity;
  const Sheet = window.VtmSheet;
  const G = () => window.VtmCreatorGuides;

  const ROSTER = (window.VttConfig.storagePrefix || 'sortilege-vtt') + ':site:roster';

  // number words as the summary spells them
  const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const num = (w) => (/^\d+$/.test(w) ? +w : WORDS[String(w).toLowerCase()]);

  // A step's fields on the sheet (the tool's mapping from the summary's headings to the
  // ACTOR's labels); a step with a group key takes a whole kind of field.
  const STEP_FIELDS = {
    'CORE CONCEPT': ['Name', 'Concept', 'Chronicle', 'Ambition', 'Desire', 'Notes'],   // Notes (owner, 2026-10-07): the walk's one free-text place
    'CLAN AND SIRE': ['Clan', 'Sire', 'Sire Clan', 'Clan Bane'],
    ATTRIBUTES: ['@attributes'],
    SKILLS: ['@skills', 'Specialties'],
    DISCIPLINES: ['Disciplines'],
    PREDATOR: ['Predator'],
    ADVANTAGES: ['Advantages & Flaws'],
    'CONVICTIONS AND TOUCHSTONES': ['Path of Enlightenment', 'Road', 'Road Rating', 'Touchstones & Convictions', 'Chronicle Tenets', 'Humanity'],
    'SEA OF TIME': ['Generation', 'Blood Potency', 'Total Experience', 'Spent Experience'],
    // the Companion's walk (mortals and ghouls)
    'GHOUL DISCIPLINES': ['Domitor', 'Disciplines'],
    NOTE: [],                              // a heading that sets nothing (the text alone)
  };
  // What The Black Hand adds to a core step: the core step, and the heading under its Quick
  // Character Creation (p. 107) whose text is shown beside the core's
  const BH_ADDS = { PREDATOR: 'Predator Type', 'CONVICTIONS AND TOUCHSTONES': 'Path of Enlightenment' };
  const BH_BOOK = 'black-hand';
  const SUN_BOOK = 'sunburners';
  const SS_BOOK = 'summoned-stories';
  const isCainite = (v) => Sheet.kindOf(v) === 'cainite';
  // the Roads the Road System prints: a Road heading with its Hierarchy of Sins under it
  function roads() {
    if (!D.loaded(SS_BOOK)) return [];
    return D.all([SS_BOOK]).filter((e) => /^Road of [^:]+$/.test(e.name) && D.children(e.id).some((k) => /Hierarchy of Sins$/.test(k.name)))
      .map((e) => ({ name: e.name, entity: e }));
  }
  // "Start with rating of 7." - the brief's Roads, its Starting Rating
  function roadStart() {
    const e = D.loaded(SS_BOOK) ? D.all([SS_BOOK]).find((x) => x.key === 'Roads' && D.val(x, 'Starting Rating') != null) : null;
    return e ? +D.val(e, 'Starting Rating') : null;
  }

  // ── the summary, read from the core ──
  function summaryParas() {
    const core = D.all(['core']).filter((e) => /core-characters/.test(e.file));
    const texts = [];
    core.forEach((e) => (e.guidance || []).forEach((g) => { if (g.text) texts.push(g.text); }));
    const start = texts.findIndex((t) => /^CORE CONCEPT\b/.test(t));
    if (start === -1) return [];
    const paras = [];
    for (let i = start; i < texts.length; i++) {
      texts[i].split(/\n\s*\n/).forEach((p, j) => {
        p = p.trim();
        // a word the page break split ("Preda-" | "tor type."): one paragraph, as printed
        if (j === 0 && paras.length && /[a-z]-$/.test(paras[paras.length - 1]) && /^[a-z]/.test(p)) paras[paras.length - 1] = paras[paras.length - 1].slice(0, -1) + p;
        else paras.push(p);
      });
      if (paras.some((p) => /^SEA OF TIME\b/.test(p)) && /Each player spends 35|experience points\.?$/.test(texts[i])) break;
      if (i > start + 4) break;
    }
    return paras.filter(Boolean);
  }
  function steps() {   // the core's walk
    const out = [];
    summaryParas().forEach((p) => {
      const m = /^([A-Z][A-Z ]{3,}[A-Z])\b\s*(.*)$/s.exec(p);
      if (m && STEP_FIELDS[m[1].trim()] !== undefined) out.push({ key: m[1].trim(), paras: [m[2] || ''] });
      else if (out.length) out[out.length - 1].paras.push(p);
    });
    // Disciplines after Predator (owner): the Predator's Discipline dot is placed before the clan's
    const d = out.findIndex((x) => x.key === 'DISCIPLINES'), p = out.findIndex((x) => x.key === 'PREDATOR');
    if (d !== -1 && p > d) out.splice(p, 0, out.splice(d, 1)[0]);
    return out.map((s) => Object.assign(s, { text: s.paras.filter(Boolean).join('\n\n') }));
  }
  // ── the Companion's walk for a mortal or a ghoul ──
  const COMPANION = 'companion';
  const LIVING = { mortal: 'Creating a Mortal Character', ghoul: 'Creating a Ghoul Character' };
  // each Companion heading → the core step whose controls it uses (NOTE: its text only)
  const COMPANION_STEP = {
    'Character Concept': 'CORE CONCEPT', 'Set Your Attributes': 'ATTRIBUTES', 'Choose Your Skills': 'SKILLS',
    Advantages: 'ADVANTAGES', 'Convictions & Touchstones': 'CONVICTIONS AND TOUCHSTONES',
  };
  const living = (v) => { const k = Sheet.kindOf(v); return k === 'mortal' || k === 'ghoul' ? k : null; };
  function companionSteps(kind) {
    const top = D.loaded(COMPANION) ? D.all([COMPANION]).find((e) => e.name === LIVING[kind]) : null;
    if (!top) return [];
    // an entity's words as paragraphs: its description, each printed field "Name: value", each
    // heading under it "Name: its description" (the Skill distributions: "Balanced: Three Skills at 3 …")
    const paras = (e) => [].concat(String(e.desc || '').split(/\n\s*\n/),
      (e.props || []).filter((p) => p.vk === 'scalar').map((p) => p.name + ': ' + p.value),
      (e.props || []).filter((p) => p.vk === 'list').map((p) => (p.items || []).map((x) => (x && x.value) || x).join('\n\n')),
      D.children(e.id).map((k) => k.name + ': ' + (k.desc || ''))).map((x) => String(x).trim()).filter(Boolean);
    const core = steps();
    return D.children(top.id).map((e) => {
      let key = COMPANION_STEP[e.name] || 'NOTE';
      if (e.name === 'Disciplines and Predator Type' && kind === 'ghoul') key = 'GHOUL DISCIPLINES';
      let ps = paras(e);
      // "use the Quick Skills Assignment method (see Vampire: The Masquerade, p. 147)": the core's step
      if (key === 'SKILLS' && !skillDistributions(ps).length) { const c = core.find((x) => x.key === 'SKILLS'); if (c) ps = ps.concat(c.paras); }
      return { key, label: e.name, entity: e, kids: true, paras: ps, text: ps.join('\n\n') };
    });
  }

  // the heading The Black Hand's Quick Character Creation prints for what it adds to a core step
  function bhAdds(key) {
    const q = BH_ADDS[key] && D.loaded(BH_BOOK) ? D.all([BH_BOOK]).find((e) => e.name === 'Quick Character Creation') : null;
    return q ? D.children(q.id).find((k) => k.name === BH_ADDS[key]) || null : null;
  }

  // ── what the sentences say ──
  function attributeSpread(text) {
    const out = {};
    let m;
    const re = /(\w+) Attributes? at (\d)/g;
    while ((m = re.exec(text))) out[m[2]] = (out[m[2]] || 0) + num(m[1]);
    // the Companion's table: "Best Attribute 4 Dots Three Attributes 3 Dots Four Attributes 2 Dots Worst Attribute 1 Dot"
    const re2 = /(Best|Worst|\w+) Attributes? (\d) Dots?/g;
    if (!Object.keys(out).length) while ((m = re2.exec(text))) out[m[2]] = (out[m[2]] || 0) + (/^(Best|Worst)$/.test(m[1]) ? 1 : num(m[1]));
    return out;                                           // { "4": 1, "3": 3, "2": 4, "1": 1 }
  }
  function skillDistributions(paras) {
    const out = [];
    paras.forEach((p) => {
      const m = /^([a-z][a-z ]+):\s*(.+)$/i.exec(p);
      if (!m) return;
      const spread = {};
      let x;
      const re = /(\w+) Skills? at (\d)/g;
      while ((x = re.exec(m[2]))) spread[x[2]] = (spread[x[2]] || 0) + num(x[1]);
      if (Object.keys(spread).length) out.push({ name: m[1].trim(), text: p, spread });
    });
    return out;
  }
  function freeSpecialties(text) {
    const m = /free specialties to ([^.]+?) Skills/.exec(text);
    const named = m ? m[1].split(/,\s*|\s+and\s+/).map((x) => x.replace(/^and\s+/, '').trim()).filter(Boolean) : [];
    const more = /Take (\w+) more free specialty/.exec(text);
    return { named, more: more ? num(more[1]) : 0 };
  }
  function disciplineDots(text) {
    const m = /Put (\w+) dots in one and (\w+) dot in the other/.exec(text);
    return m ? [num(m[1]), num(m[2])] : null;
  }
  function advantagePoints(text) {
    // the core: "Spend 7 points on Advantages, and take 2 points of Flaws"; the Companion: "Mortals take 7
    // points of Advantages and 2 points of Flaws"
    const m = /Spend (\d+) points on Advantages, and take (\d+) points of Flaws/.exec(text) || /take (\d+) points of Advantages and (\d+) points of Flaws/.exec(text);
    return m ? { advantages: +m[1], flaws: +m[2] } : null;
  }
  function convictions(text) {
    // the core: "Select one to three"; The Black Hand: "…and one to three Convictions"; the Companion's ghoul: "choose one to three of each"
    const m = /(?:Select|and) (\w+) to (\w+) Convictions/.exec(text) || /choose (\w+) to (\w+) of each/.exec(text);
    // the core: "Set your Humanity to 7"; the Companion: "Mortals start with Humanity at 7", "Ghouls start play with Humanity at 7"
    const h = /Set your Humanity to (\d+)/.exec(text) || /start (?:play )?with Humanity at (\d+)/.exec(text);
    return { min: m ? num(m[1]) : null, max: m ? num(m[2]) : null, humanity: h ? +h[1] : null };
  }

  // ── the book behind the picks ──
  // clans and their in-clan Disciplines: VtmData's (shared with Advancement)
  const clans = () => D.clans();
  const clanNamed = (name) => clans().find((c) => c.name === name) || null;
  const clanDisciplines = (name) => D.clanDisciplines(name);
  // Caitiff and thin-bloods: the core's own chapters (VtmData.clanless); a thin-blood has no bane
  const clanlessNamed = (name) => D.clanless().find((c) => c.name === name) || null;
  const isThin = (v) => /^thin-?blood/i.test(v.Clan || '');
  function clanBane(name) {
    const cl = clanlessNamed(name);
    if (cl) return cl.bane ? cl.bane.desc : '';
    const c = clanNamed(name);
    const b = c && D.children(c.entity.id).find((k) => k.name === 'Bane');
    return b ? b.desc : null;
  }
  // a sentence the core prints outside the summary (the step-by-step chapter), found by its words
  const sentences = {};
  function bookSentence(key, re) {
    if (!(key in sentences)) {
      let hit = null;
      D.all(['core']).some((e) => { const m = re.exec(e.desc || ''); if (m) hit = m[0].trim(); return !!m; });
      sentences[key] = hit;
    }
    return sentences[key];
  }
  const noPredator = () => bookSentence('predator', /[^.]*\bdo not select a Predator type[^.]*\./);
  const powerPerDot = () => bookSentence('power', /Remember to also pick a power for each dot\.(?: \(See p\. \d+\.\))?/);
  const lackingSkill = () => bookSentence('lacking', /If a Predator type adds a specialty for which you lack the matching Skill[^.]*\./);
  const thinForbidden = () => bookSentence('forbidden', /No thin-blood can buy [^.]*during character creation\./);
  // Predator types: every one a book prints (BASE 0.5.7 Predator Type, a record each in the index),
  // from the books this character draws on (step 0's Sources; The Black Hand's only for a Sabbat
  // character). A name printed in several books is offered once, from the first book in shelf
  // order (the core, then the Players Guide); "Predator Type: Roadside Killer" is offered by its name.
  // A book not yet loaded is loaded, and the step redrawn (predatorBooks).
  const predName = (n) => n.replace(/^Predator Type:\s*/, '');
  function predatorRecords(v, meta) {
    const order = D.books().map((b) => b.id);
    return D.records().filter((r) => r.kind === 'predator' && G() && G().bookOn(meta || {}, r.book)
        && (r.book !== BH_BOOK || Sheet.isSabbat(v)))
      .sort((a, b) => order.indexOf(a.book) - order.indexOf(b.book));
  }
  function predatorBooks(v, meta) {
    return [...new Set(predatorRecords(v, meta).map((r) => r.book))].filter((b) => !D.loaded(b));
  }
  function predators(v, meta) {
    const out = [];
    predatorRecords(v, meta).forEach((r) => {
      const e = D.loaded(r.book) ? D.entity(r.id) : null;
      if (e && !out.some((p) => p.name === predName(r.name))) out.push({ name: predName(r.name), entity: e, book: r.book });
    });
    return out;
  }

  // The Paths of Enlightenment: every heading on the third-party shelf that carries a "Path
  // Compulsion" (The Black Hand's five, and a homebrew Path written on its template)
  function paths(sources) {
    return D.all([BH_BOOK].concat((sources || []).indexOf(SUN_BOOK) !== -1 ? [SUN_BOOK] : []).filter((b) => D.loaded(b))).filter((e) => (e.props || []).some((x) => x.name === 'Path Compulsion'))
      .map((e) => ({ name: e.name, entity: e, book: e.book }));
  }

  // ── the roster: drafts in this browser ──
  function load() { try { return JSON.parse(localStorage.getItem(ROSTER) || '{"current":null,"drafts":{}}'); } catch (e) { return { current: null, drafts: {} }; } }
  function save(r) { try { localStorage.setItem(ROSTER, JSON.stringify(r)); } catch (e) { /* no storage */ } }
  const newId = () => 'draft-' + Math.random().toString(36).slice(2, 9);

  // ── the walk ──
  let stepIndex = 0;
  let view = 'steps';   // 'steps' | 'sheet'
  let opts = {};
  // o (a player's page): { blackHand: the Storyteller allows The Black Hand's walk, done(values):
  // the button that takes the character to the table }
  function render(container, path, ctx, o) {
    opts = o || {};
    const page = el('div', { class: 'page creator' });
    container.appendChild(page);
    page.appendChild(el('div', { class: 'loading' }, ['Opening the Core Rulebook and the Players Guide…']));
    const sabbatDraft = Object.values(load().drafts || {}).some((d) => Sheet.isSabbat(d));
    const roadDraft = Object.values(load().drafts || {}).some((d) => isCainite(d));
    const books = Sheet.BOOKS.concat(['players-guide'], opts.blackHand || sabbatDraft ? [BH_BOOK, 'sunburners'].filter((b) => D.books().some((x) => x.id === b)) : [],
      opts.roads || roadDraft ? [SS_BOOK].filter((b) => D.books().some((x) => x.id === b)) : []);
    D.ready(books).then(() => { page.innerHTML = ''; draw(page); });
  }

  // The page is rebuilt on every edit so the checks and derived values follow the draft; a rebuild
  // replaces the box being typed in, so the focused field is found again by its place among the
  // page's fields and given back its caret, and the scroll stays put.
  function keepFocus(page, rebuild) {
    const fields = () => Array.from(page.querySelectorAll('input, textarea, select'));
    const a = document.activeElement;
    const i = a && page.contains(a) ? fields().indexOf(a) : -1;
    const sel = i !== -1 && typeof a.selectionStart === 'number' ? [a.selectionStart, a.selectionEnd] : null;
    const y = window.scrollY;
    rebuild();
    window.scrollTo(0, y);
    const b = i === -1 ? null : fields()[i];
    if (!b || b.tagName !== a.tagName || b.type !== a.type) return;
    b.focus({ preventScroll: true });
    if (sel) b.setSelectionRange(sel[0], sel[1]);
    else if (b.type === 'number') { b.type = 'text'; b.setSelectionRange(b.value.length, b.value.length); b.type = 'number'; } // a number box hides its caret: put it at the end
  }

  const draw = (page) => keepFocus(page, () => drawNow(page));
  function drawNow(page) {
    const roster = load();
    if (!roster.current || !roster.drafts[roster.current]) {
      const id = newId();
      roster.drafts[id] = Sheet.blank();
      roster.current = id;
      save(roster);
    }
    const v = roster.drafts[roster.current];
    const kind = living(v);
    if (kind && !D.loaded(COMPANION)) {
      page.innerHTML = '';
      page.appendChild(el('div', { class: 'loading' }, ['Opening the Companion…']));
      D.ready([COMPANION]).then(() => draw(page));
      return;
    }
    const st = kind ? companionSteps(kind) : steps();
    if (Sheet.isSabbat(v) && !D.loaded(BH_BOOK)) {
      page.innerHTML = '';
      page.appendChild(el('div', { class: 'loading' }, ['Opening The Black Hand…']));
      D.ready([BH_BOOK]).then(() => draw(page));
      return;
    }
    if (isCainite(v) && !D.loaded(SS_BOOK)) {
      page.innerHTML = '';
      page.appendChild(el('div', { class: 'loading' }, ['Opening Summoned Stories…']));
      D.ready([SS_BOOK]).then(() => draw(page));
      return;
    }
    const commit = (nv) => { roster.drafts[roster.current] = nv; save(roster); };
    // the creator's own bookkeeping for this draft (the chosen distribution, the Predator's applied
    // grants), kept beside it in the roster, never in the character
    roster.meta = roster.meta || {};
    const meta = roster.meta[roster.current] || {};
    // a third-party book the draft draws on without being Sabbat (The Black Hand's powers only)
    const tpNeed = G() ? [BH_BOOK, SUN_BOOK].filter((b) => D.books().some((x) => x.id === b) && G().bookOn(meta, b) && !D.loaded(b)) : [];
    if (tpNeed.length) {
      page.innerHTML = '';
      page.appendChild(el('div', { class: 'loading' }, ['Opening ' + tpNeed.map((b) => (D.indexBook(b) || {}).label || b).join(', ') + '…']));
      D.ready(tpNeed).then(() => draw(page));
      return;
    }
    const setMeta = (patch, values) => {
      roster.meta[roster.current] = Object.assign({}, meta, patch);
      if (values) {
        const nv = Object.assign({}, v, values);
        Object.keys(nv).forEach((k) => { if (nv[k] === undefined) delete nv[k]; });   // a field taken away, not blanked
        roster.drafts[roster.current] = nv;
      }
      save(roster);
      draw(page);
    };
    page.innerHTML = '';
    page.appendChild(el('h2', { class: 'chapter-h' }, ['Making a character']));
    // the roster
    page.appendChild(el('div', { class: 'chiprow' }, [
      el('select', { class: 'scope', onchange: (ev) => { roster.current = ev.target.value; save(roster); draw(page); } },
        Object.keys(roster.drafts).map((id) => el('option', { value: id, selected: id === roster.current || null }, [(roster.drafts[id].Name || 'An unnamed ' + Sheet.KINDS[Sheet.kindOf(roster.drafts[id])].label) + (Sheet.isSabbat(roster.drafts[id]) ? ' · Sabbat' : '') + (living(roster.drafts[id]) && roster.drafts[id].Name ? ' · ' + Sheet.KINDS[Sheet.kindOf(roster.drafts[id])].label : '')]))),
      button('New character', () => { const id = newId(); roster.drafts[id] = Sheet.blank(); roster.current = id; save(roster); stepIndex = 0; draw(page); }, 'ghost tiny'),
      opts.done ? button('Take this character to the table', () => opts.done(v), 'tiny') : null,
      button('Download character file', () => Sheet.download(Sheet.fileOf(v, { hunger: +v.Hunger || 0 }), v.Name), 'tiny'),
      button('Remove', () => { if (confirm('Remove ' + (v.Name || 'this character') + ' from this browser?')) { delete roster.drafts[roster.current]; delete roster.meta[roster.current]; roster.current = Object.keys(roster.drafts)[0] || null; save(roster); draw(page); } }, 'ghost tiny'),
    ]));
    const changeSources = (m, values) => {
      const need = [BH_BOOK].concat((m.sources || []).indexOf(SUN_BOOK) !== -1 ? [SUN_BOOK] : []).filter((b) => !D.loaded(b));
      const go = () => setMeta(m, values);
      if (need.length && m.thirdParty) D.ready(need).then(go); else go();
    };
    if (!st.length) {
      page.appendChild(el('div', { class: 'empty' }, [kind ? 'The Companion’s ' + LIVING[kind] + ' was not found in the data.' : 'The core’s Character Creation summary was not found in the data.']));
      return;
    }
    // step 0 is the sources; then the summary's steps, under their own names in title case
    const walk = [{ key: 'SOURCES', label: 'Sources', n: 0 }].concat(st.map((x, i) => Object.assign({}, x, { label: x.label || titleCase(x.key), n: i + 1 })));
    if (stepIndex >= walk.length) stepIndex = 0;
    // two views: the walk, and the character sheet as it stands
    page.appendChild(el('div', { class: 'creator-tabs', role: 'tablist' }, [['steps', 'Step by step'], ['sheet', 'Character sheet']].map(([id, label]) =>
      el('button', { type: 'button', role: 'tab', class: 'creator-tab' + (view === id ? ' on' : ''), 'aria-selected': view === id ? 'true' : 'false', onclick: () => { view = id; draw(page); } }, [label]))));
    if (view === 'sheet') {
      page.appendChild(sheetView(v, meta, () => { view = 'steps'; draw(page); }));
      return;
    }
    // the step list: ✓ done, • still to do, ! a later step opened a choice here
    const all = walk.map((x) => checks(x, v, meta));
    const pendingOf = (i) => all[i].filter((c) => !c.ok && c.pending);
    const stepOf = (key) => walk.findIndex((x) => x.key === key);
    page.appendChild(el('ol', { class: 'steps' }, walk.map((x, i) => {
      const pend = pendingOf(i);
      const flag = el('span', { class: 'step-flag' + (pend.length ? ' pending' : '') }, [pend.length ? '!' : all[i].some((c) => !c.ok) ? '•' : '✓']);
      if (pend.length) flag.title = 'A later step opened a choice here: ' + pend.map((c) => c.text).join(' ');
      return el('li', { class: (i === stepIndex ? 'active' : '') + (pend.length ? ' pending' : '') }, [
        el('span', { class: 'step-n' }, [x.n + '.']),
        el('button', { type: 'button', class: 'ref', onclick: () => { stepIndex = i; draw(page); } }, [x.label]),
        flag,
      ]);
    })));
    const s = walk[stepIndex];
    // the right pane: what the book says, what this step has put on the sheet, and the checks
    const adds = Sheet.isSabbat(v) ? bhAdds(s.key) : null;
    const cs = all[stepIndex];
    const said = stepSummary(s, v, meta);
    const side = el('aside', { class: 'creator-book' }, [el('div', { class: 'group-h' }, [s.label])]
      .concat(s.key === 'SOURCES' ? [E.prose(SOURCES_TEXT)] : [s.entity ? E.render(s.entity, { noKids: !s.kids }) : E.prose(smallCaps(s.text))])
      .concat(adds ? [el('div', { class: 'group-h bh-adds' }, [((D.indexBook(BH_BOOK) || {}).label || 'The Black Hand') + ' adds · ' + adds.name]), E.render(adds, { noKids: true })] : [])
      .concat([el('div', { class: 'group-h side-h' }, ['On your sheet from this step'])], [said.length ? el('ul', { class: 'step-said' }, said.map((x) => el('li', {}, [el('span', { class: 'said-k' }, [x[0]]), ' ', x[1]]))) : el('p', { class: 'small said-none' }, ['Nothing yet.'])])
      .concat(cs.length ? [el('div', { class: 'group-h side-h' }, ['Checks']), el('ul', { class: 'checks' }, cs.map((c) => el('li', { class: c.ok ? 'ok' : c.pending ? 'warn pending' : 'warn' }, [c.text])))] : []));
    const main = el('div', { class: 'creator-step' });
    // a choice a later step opened here, and -- on that later step -- where it opened one
    const go = (i) => button(walk[i].label + ' →', () => { stepIndex = i; draw(page); }, 'ghost tiny');
    const mine = pendingOf(stepIndex);
    if (mine.length) main.appendChild(el('div', { class: 'pending-note' }, [el('div', { class: 'prop-k' }, ['A later step opened a choice here'])]
      .concat(mine.map((c) => el('div', { class: 'small' }, [c.text, ' ', el('span', { class: 'muted' }, ['(opened by ']), go(stepOf(c.pending)), el('span', { class: 'muted' }, [')'])])))));
    const opened = walk.map((x, i) => ({ i, cs: pendingOf(i).filter((c) => c.pending === s.key) })).filter((x) => x.i !== stepIndex && x.cs.length);
    if (opened.length) main.appendChild(el('div', { class: 'pending-note' }, [el('div', { class: 'prop-k' }, ['This step opened a choice at an earlier one'])]
      .concat(opened.map((x) => el('div', { class: 'small' }, [go(x.i), ' ', x.cs.map((c) => c.text).join(' ')])))));
    if (s.key === 'SOURCES') main.appendChild(sourcesStep(v, meta, changeSources, setMeta, (k) => {
      // another kind: the draft starts again as one, keeping who it is
      const keep = ['Name', 'Concept', 'Chronicle', 'Ambition', 'Desire'];
      const had = Object.keys(v).some((f) => keep.indexOf(f) === -1 && v[f] != null && v[f] !== '' && !(Array.isArray(v[f]) && !v[f].length) && !(typeof v[f] === 'number' && v[f] <= 1));
      if (had && !window.confirm('Make ' + (v.Name || 'this character') + ' a ' + Sheet.KINDS[k].label.toLowerCase() + '? Everything but the name and concept starts again.')) return;
      const nv = Sheet.blank(k);
      keep.forEach((f) => { if (v[f] != null) nv[f] = v[f]; });
      roster.drafts[roster.current] = nv;
      roster.meta[roster.current] = {};
      save(roster);
      stepIndex = 0;
      draw(page);
    }));
    else main.appendChild(stepControls(s, v, (nv) => { commit(nv); draw(page); }, meta, setMeta));
    main.appendChild(el('div', { class: 'chiprow' }, [
      stepIndex > 0 ? button('← ' + walk[stepIndex - 1].label, () => { stepIndex--; draw(page); }, 'ghost tiny') : null,
      stepIndex < walk.length - 1 ? button(walk[stepIndex + 1].label + ' →', () => { stepIndex++; draw(page); }, 'tiny') : null,
    ]));
    page.appendChild(el('div', { class: 'creator-cols' }, [main, side]));
  }

  // ── what the page says in its own words (not the book's) ──
  const SOURCES_TEXT = 'Every character is made with the Core Rulebook’s Character Creation, the Players Guide adding its clans and Predator types.\n\n'
    + 'The other books add Advantages, loresheets, powers and rituals; turn off any this character should not draw on.\n\n'
    + 'Third-party books add options to those steps — they never replace them. A character that uses one is playable only where the Storyteller allows it.';
  // Small caps the book prints as lower case ("jack of all trades", "CLAN AND SIRE") in title case
  const MINOR = /^(a|an|and|the|of|to|in|on|or|for|at|by|with)$/;
  function titleCase(t) {
    return String(t || '').toLowerCase().split(/(\s+)/).map((w, k) => (k && MINOR.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join('');
  }
  // a summary paragraph's small-caps run-in label ("jack of all trades:", "childer:") in title case
  const smallCaps = (text) => String(text || '').split('\n\n').map((p) => p.replace(/^([a-z][a-z ,'’-]{1,40}):/, (m, l) => titleCase(l) + ':')).join('\n\n');

  // ── the right pane's account of a step: what it has put on the sheet ──
  const DOT = '●';
  function stepSummary(s, v, meta) {
    const out = [];
    const put = (k, x) => { if (x != null && x !== '' && !(Array.isArray(x) && !x.length)) out.push([k, x]); };
    if (s.key === 'SOURCES') {
      const tp = D.books().filter((b) => b.shelf === 'third-party' && G() && G().bookOn(meta || {}, b.id)).map((b) => b.label + (b.id === BH_BOOK ? (Sheet.isSabbat(v) ? ' (Sabbat)' : ' (powers only)') : ''));
      put('Rules', ['Core Rulebook', 'Players Guide'].concat(tp).join(' · '));
      if ((meta || {}).books) put('Books', ['Core Rulebook', 'Players Guide'].concat(meta.books.map((id) => (D.indexBook(id) || {}).label || id)).join(' · '));
      return out;
    }
    const names = [];
    (STEP_FIELDS[s.key] || []).forEach((f) => {
      if (f === '@attributes') names.push.apply(names, Sheet.attributes());
      else if (f === '@skills') names.push.apply(names, Sheet.skills());
      else names.push(f);
    });
    if (s.key === 'ATTRIBUTES') {
      const at = Sheet.attributes().filter((n) => (+v[n] || 1) > 1).sort((a, b) => (+v[b] || 0) - (+v[a] || 0));
      at.forEach((n) => put(n, DOT.repeat(+v[n])));
      if (at.length) { const d = Sheet.derived(v); put('Health', String(d.Health)); put('Willpower', String(d.Willpower)); }
      return out;
    }
    if (s.key === 'SKILLS') {
      Sheet.skills().filter((n) => (+v[n] || 0) > 0).sort((a, b) => (+v[b] || 0) - (+v[a] || 0)).forEach((n) => put(n, DOT.repeat(+v[n])));
      put('Specialties', (v.Specialties || []).filter((r) => r.Specialty).map((r) => r.Skill + ' (' + r.Specialty + ')').join(', '));
      return out;
    }
    if (s.key === 'PREDATOR') {
      put('Predator type', v.Predator);
      const cur = predators(v, meta).find((p) => p.name === v.Predator);
      const pred = (meta || {}).pred;
      if (cur && pred && pred.name === v.Predator && G()) {
        const gs = G().grantsOf(cur.entity);
        Object.keys(pred.applied || {}).sort((a, b) => a - b).forEach((k) => put('Grant ' + (+k + 1), G().describe(gs[k], pred.applied[k])));
      }
      return out;
    }
    names.forEach((n) => {
      const x = v[n];
      // each Discipline on its own line, its dots and the powers taken for them
      if (n === 'Disciplines') (x || []).filter((d) => d.Discipline).forEach((d) => put(d.Discipline, DOT.repeat(+d.Dots || 0) + ((d.Powers || []).length ? ' — ' + d.Powers.join(', ') : ' — no power yet')));
      else if (n === 'Advantages & Flaws') {
        const theirs = (G() ? G().fromPredator(meta || {}).advantages : []).map((r) => JSON.stringify(r));
        (x || []).filter((r) => r.Name).forEach((r) => {
          const k = theirs.indexOf(JSON.stringify(r)); if (k !== -1) theirs.splice(k, 1);
          put(r.Flaw ? 'Flaw' : 'Advantage', r.Name + ' ' + DOT.repeat(+r.Dots || 0) + (k !== -1 ? ' (from the Predator type)' : ''));
        });
      } else if (Array.isArray(x)) put(n, x.filter(Boolean).join(' · '));
      else if (n === 'Clan Bane' && x) put(n, String(x).length > 90 ? String(x).slice(0, 90) + '…' : x);
      else if (typeof x === 'number' || (x !== '' && x != null)) put(n, String(x));
    });
    return out;
  }

  // ── the character sheet as it stands, laid out as the printed sheet is ──
  function sheetView(v, meta, back) {
    const d = Sheet.derived(v);
    const w = Object.assign({}, v, { Health: v.Health || d.Health, Willpower: v.Willpower || d.Willpower });
    const part = (names) => Sheet.render(w, { readOnly: true, only: names.filter((n) => Sheet.specFor(w).some((x) => x.name === n)) });
    const sec = (title, node) => el('section', { class: 'cs-sec' }, [el('div', { class: 'cs-h' }, [title]), node]);
    const top = ['Concept', 'Predator', 'Chronicle', 'Ambition', 'Clan', 'Sire', 'Sire Clan', 'Desire', 'Generation', 'Domitor'].concat(Sheet.isSabbat(w) ? ['Path of Enlightenment'] : [], isCainite(w) ? ['Road', 'Road Rating'] : [])
      .filter((n) => Sheet.specFor(w).some((x) => x.name === n));
    return el('div', { class: 'creator-sheet' }, [
      el('div', { class: 'sheet-head' }, [
        el('div', { class: 'sheet-name' }, [w.Name || 'An unnamed ' + Sheet.KINDS[Sheet.kindOf(w)].label]),
        el('dl', { class: 'cs-top' }, top.map((n) => [el('dt', {}, [n]), el('dd', {}, [w[n] == null || w[n] === '' ? '—' : String(w[n])])]).reduce((a, x) => a.concat(x), [])),
      ]),
      sec('Attributes', part(Sheet.attributes().concat(['Health', 'Willpower']))),
      sec('Skills', part(Sheet.skills())),
      el('div', { class: 'cs-cols' }, [
        el('div', {}, [sec('Disciplines', part(['Disciplines'])), sec('Specialties', part(['Specialties']))]),
        el('div', {}, [sec('Advantages & Flaws', part(['Advantages & Flaws'])), sec('Touchstones & Convictions', part(['Touchstones & Convictions', 'Chronicle Tenets']))]),
      ]),
      el('div', { class: 'cs-cols' }, [
        el('div', {}, [sec('Humanity and Blood', part(['Humanity', 'Blood Potency']))]),
        el('div', {}, [sec('Clan Bane', part(['Clan Bane'])), sec('Experience', part(['Total Experience', 'Spent Experience']))]),
      ]),
      el('details', { class: 'cs-more' }, [el('summary', {}, ['Profile and notes']), part(['True age', 'Apparent age', 'Date of birth', 'Date of death', 'Appearance', 'Distinguishing features', 'History', 'Notes'])]),
      el('div', { class: 'chiprow' }, [button('← Back to the steps', back, 'ghost tiny')]),
    ]);
  }


  // Third-party options: a checkbox, the shelf's books to use, and the acknowledgment. The Black
  // Hand's book takes effect with all three; the draft becomes a Sabbat Kindred only when the player
  // also makes the character Sabbat (meta.sabbat), and untaking either clears what being Sabbat
  // added -- the Path, a Sabbat Predator type -- after asking.
  // Step 0: the sources. The Core Rulebook always; third-party books by the player's choice.
  function sourcesStep(v, meta, change, setMeta, setKind) {
    const k = Sheet.kindOf(v);
    const cur = k === 'mortal' || k === 'ghoul' ? k : 'kindred';
    const hasCompanion = D.books().some((b) => b.id === COMPANION);
    const kinds = el('div', { class: 'third-party on kind-pick' }, [el('div', { class: 'prop-k' }, ['What you are making'])].concat(
      [['kindred', 'A vampire', 'the Core Rulebook’s Character Creation'], ['ghoul', 'A ghoul', 'The Masquerade Companion’s ' + LIVING.ghoul], ['mortal', 'A mortal', 'The Masquerade Companion’s ' + LIVING.mortal]]
        .filter((x) => x[0] === 'kindred' || hasCompanion)
        .map(([id, label, how]) => el('label', { class: 'tp-row tp-source' }, [
          el('input', { type: 'radio', name: 'creator-kind', checked: id === cur || null, onchange: () => { if (id !== cur) setKind(id === 'kindred' ? null : id); } }),
          ' ', el('b', {}, [label]), el('span', { class: 'muted small' }, [' — ' + how]),
        ]))));
    return el('div', {}, [
      kinds,
      booksBlock(meta, setMeta),
      cur === 'kindred' ? thirdParty(v, meta, change) : null,
      loresheetsBlock(v, meta, setMeta),
    ]);
  }
  // The official books this character draws on (owner: "Sources should allow you to toggle any of
  // the sources made available"): each book that prints character options -- Advantages,
  // loresheets, powers, rituals -- with what it offers; the core always. meta.books lists the ones
  // on; unset, every one is. The finder, the loresheets and the Discipline powers follow it.
  const OFFERS = [['advantage', 'Advantage', 'Advantages'], ['loresheet', 'loresheet', 'loresheets'], ['power', 'power', 'powers'], ['ritual', 'ritual', 'rituals']];
  function booksBlock(meta, setMeta) {
    const recs = D.records();
    const offers = {};
    recs.forEach((r) => { if (OFFERS.some((o) => o[0] === r.kind)) { const b = offers[r.book] = offers[r.book] || {}; b[r.kind] = (b[r.kind] || 0) + 1; } });
    const books = D.books().filter((b) => b.shelf !== 'third-party' && b.kind === 'book' && offers[b.id]);
    const always = (id) => G().ALWAYS.indexOf(id) !== -1;
    const others = books.filter((b) => !always(b.id)).map((b) => b.id);
    const on = meta.books ? meta.books.filter((id) => others.indexOf(id) !== -1) : others.slice();
    const put = (ids) => setMeta({ books: ids });
    const said = (id) => OFFERS.filter((o) => offers[id][o[0]]).map((o) => offers[id][o[0]] + ' ' + (offers[id][o[0]] === 1 ? o[1] : o[2])).join(' · ');
    const box = el('div', { class: 'third-party on books-on' });
    box.appendChild(el('div', { class: 'prop-k' }, ['The books · ' + (on.length + books.length - others.length) + ' of ' + books.length + ' on']));
    box.appendChild(el('div', { class: 'chiprow tight' }, [button('All', () => put(others.slice()), 'ghost tiny'), button('Only the core and the Players Guide', () => put([]), 'ghost tiny')]));
    books.forEach((b) => {
      const core = always(b.id);
      const is = core || on.indexOf(b.id) !== -1;
      box.appendChild(el('label', { class: 'tp-row tp-source' }, [
        el('input', { type: 'checkbox', checked: is || null, disabled: core ? 'disabled' : null, onchange: (ev) => put(ev.target.checked ? on.concat([b.id]) : on.filter((x) => x !== b.id)) }),
        ' ', el('b', {}, [b.label]), el('span', { class: 'muted small' }, [' — ' + (core ? 'always · ' : '') + said(b.id)]),
      ]));
    });
    return box;
  }
  // Loresheets, as third-party books are: the player picks the ones this character may draw on
  // (each, or all), acknowledging that a loresheet is played only where the Storyteller allows it
  // (the campaign's loresheets). Their levels are then offered on the Advantages step.
  function loresheetsBlock(v, meta, setMeta) {
    const all = D.records().filter((r) => r.kind === 'loresheet');
    if (!all.length) return el('span', {});
    const cur = Object.assign({ on: false, ids: [], ack: false }, meta.lore || {});
    const apply = (patch) => setMeta({ lore: Object.assign({}, cur, patch) });
    const box = el('div', { class: 'third-party' + (cur.on ? ' on' : '') });
    box.appendChild(el('label', { class: 'tp-row' }, [el('input', { type: 'checkbox', checked: cur.on || null, onchange: (ev) => apply({ on: ev.target.checked }) }), ' Use loresheets',
      el('span', { class: 'muted small' }, [' — ' + all.length + ' in the books; the core: “The Storyteller always has the final word on which Loresheets are available for player characters.”'])]));
    if (!cur.on) return box;
    // which loresheets: found and taken level by level in the Advantages step's finder (owner:
    // "loresheets should show as a filter in the same interface as the rest")
    box.appendChild(el('label', { class: 'tp-row tp-ack' }, [el('input', { type: 'checkbox', checked: cur.ack || null, onchange: (ev) => apply({ ack: ev.target.checked }) }),
      ' I understand a loresheet can be played only where my Storyteller allows it.']));
    if (cur.ack) box.appendChild(el('p', { class: 'muted small tp-source' }, ['Loresheets are now a filter in the Advantages step’s finder.']));
    return box;
  }
  function thirdParty(v, meta, change) {
    const shelf = D.books().filter((b) => b.shelf === 'third-party');
    if (!shelf.length) return el('span', {});
    const sabbat = Sheet.isSabbat(v);
    const cainite = isCainite(v);
    const cur = { thirdParty: meta.thirdParty != null ? meta.thirdParty : sabbat || cainite, sources: meta.sources || (sabbat ? [BH_BOOK] : cainite ? [SS_BOOK] : []), ack: meta.ack != null ? meta.ack : sabbat || cainite,
      sabbat: meta.sabbat != null ? meta.sabbat : sabbat };
    const apply = (patch) => {
      const m = Object.assign({}, cur, patch);
      // a Road and a Path answer one question: the book just ticked wins
      const ticked = (patch.sources || []).filter((x) => cur.sources.indexOf(x) === -1);
      if (ticked.indexOf(SS_BOOK) !== -1) m.sources = m.sources.filter((x) => x !== BH_BOOK && x !== SUN_BOOK);
      if (ticked.indexOf(BH_BOOK) !== -1) m.sources = m.sources.filter((x) => x !== SS_BOOK);
      if (m.sources.indexOf(BH_BOOK) === -1) m.sabbat = false;   // no book, no Sabbat character
      if (!m.sabbat) m.sources = m.sources.filter((x) => x !== SUN_BOOK);   // the Sunburners' Path is written on The Black Hand's, for a Sabbat character
      const want = !!(m.thirdParty && m.ack && m.sources.indexOf(BH_BOOK) !== -1 && m.sabbat);
      const wantRoad = !!(m.thirdParty && m.ack && m.sources.indexOf(SS_BOOK) !== -1);
      const values = {};
      if (wantRoad && !cainite) {
        // the brief's replacements: a Road and its starting rating, no Humanity, no Touchstones or Convictions
        if (!D.loaded(SS_BOOK)) { D.ready([SS_BOOK]).then(() => apply(patch)); return; }
        Object.assign(values, { Road: '', 'Road Rating': roadStart() || 0, Humanity: undefined, 'Touchstones & Convictions': undefined });
      }
      if (!wantRoad && cainite) {
        if (v.Road && !window.confirm('Without Summoned Stories, ' + (v.Name || 'this character') + ' loses the Road (' + v.Road + '). Go on?')) return;
        Object.assign(values, { Road: undefined, 'Road Rating': undefined });
      }
      if (want && !sabbat) values['Path of Enlightenment'] = '';
      const sabbatPred = v.Predator && / \(Sabbat Only\)$/.test(v.Predator);
      const sunPath = v['Path of Enlightenment'] && m.sources.indexOf(SUN_BOOK) === -1 && paths([SUN_BOOK]).some((p) => p.book === SUN_BOOK && p.name === v['Path of Enlightenment']);
      if (!want && sabbat) {
        const lose = [v['Path of Enlightenment'] ? 'the Path (' + v['Path of Enlightenment'] + ')' : null, sabbatPred ? 'the Predator type (' + v.Predator + ')' : null].filter(Boolean);
        if (lose.length && !window.confirm((m.sources.indexOf(BH_BOOK) !== -1 && m.thirdParty && m.ack ? 'Not Sabbat' : 'Without The Black Hand') + ', ' + (v.Name || 'this character') + ' loses ' + lose.join(' and ') + '. Go on?')) return;
        values['Path of Enlightenment'] = undefined;
        if (sabbatPred) { values.Predator = ''; m.pred = null; }
      } else if (sunPath) values['Path of Enlightenment'] = '';
      change(m, Object.keys(values).length ? values : null);
    };
    const box = el('div', { class: 'third-party' + (cur.thirdParty ? ' on' : '') });
    box.appendChild(el('label', { class: 'tp-row' }, [el('input', { type: 'checkbox', checked: cur.thirdParty || null, onchange: (ev) => apply({ thirdParty: ev.target.checked }) }), ' Use third-party options']));
    if (!cur.thirdParty) return box;
    shelf.forEach((b) => {
      const on = cur.sources.indexOf(b.id) !== -1;
      const needsBH = b.id === SUN_BOOK && !(cur.sources.indexOf(BH_BOOK) !== -1 && cur.sabbat);
      const what = b.id === BH_BOOK ? 'its Discipline powers; and, for a Sabbat character, Sabbat Predator types and a Path of Enlightenment with Touchstone Ritae' : b.id === SUN_BOOK ? 'homebrew: the Path of the Sun, for The Black Hand’s Paths (a Sabbat character)'
        : b.id === SS_BOOK ? 'a chronicle’s house rules: a Road and its rating in place of Humanity, and no Touchstones or Convictions' : '';
      box.appendChild(el('label', { class: 'tp-row tp-source' + (needsBH ? ' muted' : '') }, [
        el('input', { type: 'checkbox', checked: on || null, disabled: needsBH ? 'disabled' : null, onchange: (ev) => apply({ sources: ev.target.checked ? cur.sources.concat([b.id]) : cur.sources.filter((x) => x !== b.id) }) }),
        ' ', el('b', {}, [b.label]), what ? el('span', { class: 'muted small' }, [' — ' + what]) : null,
      ]));
      // the book is an option; the sect is the player's further choice
      if (b.id === BH_BOOK && on) box.appendChild(el('label', { class: 'tp-row tp-source tp-sub' }, [
        el('input', { type: 'checkbox', checked: cur.sabbat || null, onchange: (ev) => apply({ sabbat: ev.target.checked }) }),
        ' Make this character Sabbat', el('span', { class: 'muted small' }, [' — The Black Hand’s Sabbat Kindred: its Predator types and a Path of Enlightenment. Unticked, the character takes only the book’s Discipline powers.']),
      ]));
    });
    box.appendChild(el('label', { class: 'tp-row tp-ack' }, [el('input', { type: 'checkbox', checked: cur.ack || null, onchange: (ev) => apply({ ack: ev.target.checked }) }),
      ' I understand this character can be played only where my Storyteller allows these sources.']));
    if (cur.sources.length && !cur.ack) box.appendChild(el('p', { class: 'muted small' }, ['Tick the acknowledgment and the options take effect.']));
    // on a player's page, whether this table allows it
    if (opts.where === 'play' && sabbat) box.appendChild(el('p', { class: 'small' }, [opts.blackHand ? '✓ Your Storyteller allows The Black Hand at this table.' : opts.joined ? 'Your Storyteller has not allowed The Black Hand at this table yet (their Loresheets panel).' : 'Whether this table allows The Black Hand shows once you have joined.']));
    if (opts.where === 'play' && cainite) box.appendChild(el('p', { class: 'small' }, [opts.roads ? '✓ Your Storyteller allows Summoned Stories’ Roads at this table.' : opts.joined ? 'Your Storyteller has not allowed Summoned Stories’ Roads at this table yet (their Loresheets panel).' : 'Whether this table allows the Roads shows once you have joined.']));
    return box;
  }

  // ── the Clan Curse thin-blood Flaw: the sire's clan, and that clan's Bane ──
  // "You must pick a Clan Bane to suffer from … You can only pick the Brujah or Gangrel Bane if you
  // possess the Bestial Temper Flaw, and the Tremere Bane only if you have the Catenating Blood
  // Merit." The limits are read from that text; the Banes are the clan's own and the Players
  // Guide's variants for it (VtmData.clanBanes). The sire's clan goes on the sheet (Sire Clan).
  const CLAN_CURSE = 'Clan Curse';
  function curseLimits(text) {
    const out = {};
    const re = /(?:pick|and) the ([A-Z][A-Za-z]+(?: or [A-Z][A-Za-z]+)?) Bane (?:only )?if you (?:possess|have) the ([A-Z][\w-]+(?: [A-Z][\w-]+)*) (Flaw|Merit)/g;
    let m;
    while ((m = re.exec(text))) m[1].split(' or ').forEach((c) => { out[c] = { name: m[2], flaw: m[3] === 'Flaw' }; });
    return out;
  }
  function clanCurse(v, rows, tb, set) {
    const t = tb.flaws.find((x) => x.name === CLAN_CURSE) || { text: '' };
    const limits = curseLimits(t.text);
    const holds = (need) => rows.some((r) => r.Name === need.name && !!r.Flaw === need.flaw);
    const allowed = (c) => { const k = Object.keys(limits).find((x) => c === x || c.startsWith(x)); return !k || holds(limits[k]); };
    const box = el('div', { class: 'curse' }, [el('div', { class: 'prop-k' }, ['Clan Curse — your sire’s clan and its Bane']), el('p', { class: 'small' }, [t.text])]);
    const cl = clans();
    box.appendChild(el('div', { class: 'chiprow tight' }, [el('select', { class: 'scope', onchange: (ev) => set({ 'Sire Clan': ev.target.value, 'Clan Bane': '' }) },
      [el('option', { value: '' }, ['the sire’s clan…'])].concat(cl.map((c) => el('option', { value: c.name, disabled: allowed(c.name) ? null : 'disabled', selected: c.name === v['Sire Clan'] || null },
        [c.name + (allowed(c.name) ? '' : ' — needs ' + limits[Object.keys(limits).find((x) => c.name === x || c.name.startsWith(x))].name)]))))]));
    if (v['Sire Clan']) {
      const banes = D.clanBanes(v['Sire Clan']);
      box.appendChild(el('div', { class: 'dist-cards' }, banes.map((b) => el('button', { type: 'button', class: 'dist-card' + (v['Clan Bane'] === b.text ? ' on' : ''), onclick: () => set({ 'Clan Bane': b.text }) }, [
        el('div', { class: 'dist-name' }, [v['Sire Clan'] + (b.name === 'Bane' ? ' · Bane' : ' · ' + b.name)]),
        el('div', { class: 'small' }, [b.text.length > 260 ? b.text.slice(0, 260) + '…' : b.text]),
        el('div', { class: 'muted small' }, [(D.indexBook(b.book) || {}).label || b.book]),
      ]))));
    }
    return box;
  }

  // the controls for one step: the sheet's own, restricted to the step's fields
  function stepControls(s, v, commit, meta, setMeta) {
    const box = el('div', {});
    const names = [];
    (STEP_FIELDS[s.key] || []).forEach((f) => {
      if (f === '@attributes') names.push.apply(names, Sheet.attributes());
      else if (f === '@skills') names.push.apply(names, Sheet.skills());
      else names.push(f);
    });
    const sub = {};
    names.forEach((n) => { sub[n] = v[n]; });
    const set = (nv) => commit(Object.assign({}, v, nv, derivedFor(s, Object.assign({}, v, nv))));
    const ctx = { v, meta: meta || {}, set, setMeta: (m, values) => setMeta(m, values ? Object.assign({}, values, derivedFor(s, Object.assign({}, v, values))) : null) };
    const hidden = [];   // the step's fields a guide draws instead of the sheet
    if (s.key === 'ATTRIBUTES' && G()) {
      const later = G().laterDots(meta);
      box.appendChild(G().allocator(Sheet.attributes(), v, attributeSpread(s.text), 1, set, 'Attributes', later.traits, later.by.traits));
      hidden.push.apply(hidden, Sheet.attributes());
    }
    if (s.key === 'DISCIPLINES' && G() && !isThin(v)) {
      box.appendChild(G().disciplines(ctx, { clan: v.Clan ? clanDisciplines(v.Clan) : [] }));
      hidden.push('Disciplines');
    }
    if (s.key === 'ADVANTAGES' && G()) {
      box.appendChild(G().advantages(ctx, { redraw: () => setMeta({}) }));
      hidden.push('Advantages & Flaws');
    }
    if (s.key === 'SKILLS' && G()) {
      box.appendChild(G().skills(ctx, skillDistributions(s.paras), freeSpecialties(s.text)));
      hidden.push.apply(hidden, Sheet.skills());
    }
    const pv = G() ? G().fromPredator(ctx.meta) : { humanity: 0, potency: 0, advantages: [] };
    if (s.key === 'CONVICTIONS AND TOUCHSTONES' && convictions(s.text).humanity != null) {
      const h = convictions(s.text).humanity + pv.humanity + bandOf(meta).humanity;
      if (+v.Humanity !== h) box.appendChild(el('div', { class: 'chiprow tight' }, [button('Set Humanity to ' + h, () => set({ Humanity: h }), 'tiny'),
        pv.humanity || bandOf(meta).humanity ? el('span', { class: 'muted small' }, [convictions(s.text).humanity + [pv.humanity ? (pv.humanity > 0 ? ', plus ' : ', less ') + Math.abs(pv.humanity) + ' from your Predator type' : '', bandOf(meta).humanity ? ', less ' + Math.abs(bandOf(meta).humanity) + ' from the Sea of Time' : ''].join('')]) : null]));
    }
    if (s.key === 'SEA OF TIME' && G()) {
      box.appendChild(G().seaOfTime(ctx, s, { thin: isThin(v), potency: pv.potency }));
      hidden.push('Generation', 'Blood Potency', 'Total Experience', 'Spent Experience');
    }
    // the step's own picks from the book
    if (s.key === 'CLAN AND SIRE') {
      const cl = clans();
      box.appendChild(el('div', { class: 'prop' }, [el('div', { class: 'prop-k' }, ['Clan']), el('div', { class: 'prop-v' }, [
        el('select', { class: 'scope', onchange: (ev) => { const b = clanBane(ev.target.value); set({ Clan: ev.target.value, 'Clan Bane': b != null ? b : v['Clan Bane'] }); } },
          [el('option', { value: '' }, ['—'])].concat(cl.map((c) => el('option', { value: c.name, selected: c.name === v.Clan || null }, [c.name + ' (' + (D.indexBook(c.book) || {}).label + ')'])))
            .concat(D.clanless().length ? [el('optgroup', { label: 'Without a clan' }, D.clanless().map((c) => el('option', { value: c.name, selected: c.name === v.Clan || null }, [c.name + ' (' + (D.indexBook(c.book) || {}).label + ')'])))] : [])),
        v.Clan && clanDisciplines(v.Clan).length ? el('div', { class: 'muted small' }, ['Clan Disciplines: ' + clanDisciplines(v.Clan).join(', ')]) : null,
        clanlessNamed(v.Clan) ? el('div', { class: 'small' }, clanlessNamed(v.Clan).about.map((a) => el('div', {}, [el('div', { class: 'prop-k' }, [a.name]), E.prose(a.desc)]))) : null,
      ])]));
    }
    if (s.key === 'CONVICTIONS AND TOUCHSTONES' && Sheet.isSabbat(v)) {
      const ps = paths((meta || {}).sources || [BH_BOOK]);
      const cur = ps.find((x) => x.name === v['Path of Enlightenment']);
      box.appendChild(el('div', { class: 'prop' }, [el('div', { class: 'prop-k' }, ['Path of Enlightenment']), el('div', { class: 'prop-v' }, [
        el('select', { class: 'scope', onchange: (ev) => set({ 'Path of Enlightenment': ev.target.value }) }, [el('option', { value: '' }, ['— none (a Path is The Black Hand’s option)'])]
          .concat(ps.map((x) => el('option', { value: x.name, selected: x.name === v['Path of Enlightenment'] || null }, [x.name + ' (' + ((D.indexBook(x.book) || {}).label || x.book) + ')'])))),
      ])]));
      if (cur) box.appendChild(el('details', { class: 'paper' }, [el('summary', {}, [cur.name + ', as printed']), E.render(cur.entity, { noKids: true })]));
    }
    if (s.key === 'CONVICTIONS AND TOUCHSTONES' && isCainite(v)) {
      const rs = roads();
      const cur = rs.find((x) => x.name === v.Road);
      const brief = D.loaded(SS_BOOK) ? D.all([SS_BOOK]).find((x) => x.key === 'Roads' && D.val(x, 'Starting Rating') != null) : null;
      if (brief) box.appendChild(el('details', { class: 'paper', open: 'open' }, [el('summary', {}, ['Summoned Stories: Roads, as the brief prints it']), E.render(brief, { noKids: true })]));
      box.appendChild(el('div', { class: 'prop' }, [el('div', { class: 'prop-k' }, ['Road']), el('div', { class: 'prop-v' }, [
        el('select', { class: 'scope', onchange: (ev) => set({ Road: ev.target.value }) }, [el('option', { value: '' }, ['—'])]
          .concat(rs.map((x) => el('option', { value: x.name, selected: x.name === v.Road || null }, [x.name])))),
      ])]));
      if (cur) box.appendChild(el('details', { class: 'paper' }, [el('summary', {}, [cur.name + ', as printed']), E.render(cur.entity, { noKids: true })]));
    }
    if (s.key === 'GHOUL DISCIPLINES') {
      // "Upon becoming a ghoul, the character gains a level-1 Discipline power in a Discipline possessed
      // by their domitor ... always count as having a single dot" (the step's own text, beside)
      const row = (v.Disciplines || [])[0] || {};
      const discs = ((Sheet.specFor(v).find((x) => x.name === 'Disciplines') || {}).fields || []).find((f) => f.name === 'Discipline');
      const names = (discs && discs.options) || [];
      const pw = row.Discipline ? D.powers().filter((r) => r.discipline === row.Discipline && D.levelNumber(r) === 1 && r.kind === 'power') : [];
      const put = (d, p) => set({ Disciplines: d ? [{ Discipline: d, Dots: 1, Powers: p ? [p] : [] }] : [] });
      box.appendChild(el('div', { class: 'prop' }, [el('div', { class: 'prop-k' }, ['Discipline']), el('div', { class: 'prop-v' }, [
        el('select', { class: 'scope', onchange: (ev) => put(ev.target.value, null) }, [el('option', { value: '' }, ['—'])].concat(names.map((n) => el('option', { value: n, selected: n === row.Discipline || null }, [n])))),
      ])]));
      if (row.Discipline) box.appendChild(el('div', { class: 'prop' }, [el('div', { class: 'prop-k' }, ['Its level-1 power']), el('div', { class: 'prop-v' }, [
        el('select', { class: 'scope', onchange: (ev) => put(row.Discipline, ev.target.value || null) }, [el('option', { value: '' }, ['—'])].concat(
          pw.map((r) => el('option', { value: r.name, selected: (row.Powers || [])[0] === r.name || null }, [r.name + ' (' + ((D.indexBook(r.book) || {}).label || r.book) + ')'])))),
      ])]));
      hidden.push('Disciplines');
    }
    if (s.key === 'PREDATOR' && G()) {
      const need = predatorBooks(v, meta);
      if (need.length) {
        box.appendChild(el('p', { class: 'muted' }, ['Opening the Predator types of ' + need.map((b) => (D.indexBook(b) || {}).label || b).join(', ') + '…']));
        D.ready(need).then(() => setMeta({}));
      } else box.appendChild(G().predator(ctx, predators(v, meta), lackingSkill()));
    }
    if (s.key === 'ADVANTAGES' && isThin(v)) {
      const tb = D.thinBloodTraits();
      const rows = v['Advantages & Flaws'] || [];
      const has = (n, flaw) => rows.some((r) => r.Name === n && !!r.Flaw === flaw);
      const toggle = (n, flaw) => set(Object.assign({ 'Advantages & Flaws': has(n, flaw) ? rows.filter((r) => !(r.Name === n && !!r.Flaw === flaw)) : rows.concat([{ Name: n, Dots: 0, Flaw: flaw }]) },
        n === CLAN_CURSE && has(n, flaw) ? { 'Clan Bane': '' } : {}));
      const chips = (list, flaw) => el('div', { class: 'chiprow tight' }, list.map((t) => { const b = button(t.name + (has(t.name, flaw) ? ' ✓' : ''), () => toggle(t.name, flaw), has(t.name, flaw) ? 'tiny' : 'ghost tiny'); b.title = t.text || ''; return b; }));
      if (tb.entity) box.appendChild(el('div', { class: 'muted small' }, [tb.entity.desc]));
      box.appendChild(el('div', { class: 'prop' }, [el('div', { class: 'prop-k' }, ['Thin-blood Merits']), el('div', { class: 'prop-v' }, [chips(tb.merits, false)])]));
      box.appendChild(el('div', { class: 'prop' }, [el('div', { class: 'prop-k' }, ['Thin-blood Flaws']), el('div', { class: 'prop-v' }, [chips(tb.flaws, true)])]));
      if (has(CLAN_CURSE, true)) box.appendChild(clanCurse(v, rows, tb, set));
    }
    // the sheet's fields for the step (Clan/Predator/Path drawn above as picks; Attributes and Skills by the guides)
    const shown = names.filter((n) => hidden.indexOf(n) === -1 && !(s.key === 'CLAN AND SIRE' && n === 'Clan') && !(s.key === 'PREDATOR' && n === 'Predator') && n !== 'Path of Enlightenment' && n !== 'Road');
    if (s.key === 'SKILLS' && shown.length) box.appendChild(el('div', { class: 'prop-k' }, ['Every specialty']));
    const full = Object.assign({}, v);
    const part = Sheet.render(full, { edit: (nv) => set(pick(nv, shown)), only: shown });
    box.appendChild(part);
    return box;
  }
  const pick = (o, keys) => keys.reduce((a, k) => { a[k] = o[k]; return a; }, {});
  // the Sea of Time band chosen (its Advantages, Flaws, Humanity and experience), or nothing
  function bandOf(meta) {
    const sea = steps().find((x) => x.key === 'SEA OF TIME');
    return (sea && G() ? G().seaBands(sea.paras) : []).find((b) => b.name === (meta || {}).band) || { name: '', adv: 0, flaws: 0, humanity: 0, xp: 0 };
  }

  // values a step fills in from the book when its fields change
  function derivedFor(s, v) {
    const out = {};
    if (s.key === 'ATTRIBUTES') {
      const d = Sheet.derived(v);
      out.Health = d.Health;
      out.Willpower = d.Willpower;
    }
    return out;
  }

  // what the step's sentences ask, against the draft
  function checks(s, v, meta) {
    const out = [];
    // a later step may legally add dots (the Predator's Skill dot, its Discipline dot, the Sea of
    // Time's experience): the earlier step's check counts only its own placements. A check that
    // fails only because a later step opened a choice here carries pending: that step's key.
    const later = G() ? G().laterDots(meta || {}) : { traits: {}, disciplines: {}, by: { traits: {}, disciplines: {} }, specialties: [] };
    const SEA = 'SEA OF TIME';
    const pv = G() ? G().fromPredator(meta || {}) : { humanity: 0, potency: 0, advantages: [] };
    const band = bandOf(meta);
    const count = (fields, min) => {
      const c = {};
      fields.forEach((f) => { const n = (+v[f] || 0) - (later.traits[f] || 0); if (n > min) c[n] = (c[n] || 0) + 1; });
      return c;
    };
    const spreadText = (sp) => Object.keys(sp).sort().reverse().map((k) => sp[k] + ' at ' + k).join(', ');
    const same = (a, b) => JSON.stringify(Object.keys(a).sort().map((k) => [k, a[k]])) === JSON.stringify(Object.keys(b).sort().map((k) => [k, b[k]]));
    if (s.key === 'SOURCES') {
      const tp = (meta || {}).thirdParty != null ? meta.thirdParty : Sheet.isSabbat(v);
      const ack = (meta || {}).ack != null ? meta.ack : Sheet.isSabbat(v);
      const src = ((meta || {}).sources || (Sheet.isSabbat(v) ? [BH_BOOK] : []));
      const lore = (meta || {}).lore || {};
      if (lore.on) out.push({ ok: !!lore.ack, text: lore.ack ? 'Loresheets in the Advantages finder; playable where the Storyteller allows them.' : 'Tick the loresheets acknowledgment for them to take effect.' });
      out.push({ ok: true, text: (meta || {}).books ? (meta.books.length + 2) + ' official books on.' : 'Every official book on.' });
      if (!tp) out.push({ ok: true, text: 'No third-party options.' });
      else if (!src.length) out.push({ ok: false, text: 'Choose the third-party books to use, or untick third-party options.' });
      else out.push({ ok: !!ack, text: ack ? 'Third-party options in effect; playable where the Storyteller allows them.' : 'Tick the acknowledgment for the options to take effect.' });
      if (tp && ack && src.indexOf(BH_BOOK) !== -1) out.push({ ok: true, text: Sheet.isSabbat(v) ? 'A Sabbat character (The Black Hand’s Sabbat Kindred).' : 'The Black Hand’s powers only; not a Sabbat character.' });
    }
    if (s.key === 'CORE CONCEPT') out.push({ ok: !!v.Name, text: v.Name ? 'Named ' + v.Name : 'A name is required (the sheet declares it so).' });
    if (s.key === 'GHOUL DISCIPLINES') {
      const rows = (v.Disciplines || []).filter((d) => d.Discipline);
      out.push({ ok: !!v.Domitor, text: v.Domitor ? 'Domitor: ' + v.Domitor : 'Name the domitor: the ghoul’s Discipline is one they possess.' });
      out.push({ ok: rows.length === 1 && +rows[0].Dots === 1 && (rows[0].Powers || []).length === 1,
        text: rows.length ? rows[0].Discipline + ' · ' + ((rows[0].Powers || [])[0] || 'no power yet') + ' (one level-1 power; a ghoul counts as having a single dot)' : 'Pick a Discipline and its level-1 power.' });
    }
    if (s.key === 'CLAN AND SIRE') out.push({ ok: !!v.Clan, text: v.Clan ? 'Clan: ' + v.Clan : 'Pick a clan.' });
    if (s.key === 'ATTRIBUTES') {
      const want = attributeSpread(s.text);
      const have = count(Sheet.attributes(), 0);
      out.push({ ok: same(want, have), text: 'The book: ' + spreadText(want) + '. This sheet: ' + (spreadText(have) || 'none set') + '.' });
      const d = Sheet.derived(v);
      out.push({ ok: true, text: 'Health ' + d.Health + ' (' + Sheet.HEALTH_FROM.join(' + ') + '), Willpower ' + d.Willpower + ' (' + Sheet.WILLPOWER_FROM.join(' + ') + ').' });
    }
    if (s.key === 'SKILLS') {
      const have = count(Sheet.skills(), 0);
      const ds = skillDistributions(s.paras);
      const chosen = ds.find((d) => d.name === (meta || {}).skillDist);
      if (chosen) out.push({ ok: same(chosen.spread, have), text: titleCase(chosen.name) + ': ' + spreadText(chosen.spread) + '. This sheet: ' + (spreadText(have) || 'none set') + '.' });
      else {
        const match = ds.find((d) => same(d.spread, have));
        out.push({ ok: !!match, text: match ? 'Matches ' + titleCase(match.name) + '.' : 'Choose a distribution: ' + ds.map((d) => titleCase(d.name)).join(', ') + '.' });
      }
      const fs = freeSpecialties(s.text);
      const specs = (v.Specialties || []).filter((x) => x.Specialty).map((x) => x.Skill);
      const missing = fs.named.filter((n) => (+v[n] || 0) > 0 && specs.indexOf(n) === -1);
      // a Skill whose every dot the Sea of Time bought: the experience opened its free specialty
      const opened = missing.filter((n) => (+v[n] || 0) - (later.traits[n] || 0) <= 0);
      out.push({ ok: !missing.length, pending: missing.length && opened.length === missing.length ? SEA : null,
        text: 'Free specialties for ' + fs.named.join(', ') + (fs.more ? ', and ' + fs.more + ' more' : '') + (missing.length ? ' — still to add: ' + missing.join(', ') + (opened.length ? ' (bought at the Sea of Time)' : '') : '') + '.' });
    }
    if (s.key === 'DISCIPLINES' && isThin(v)) {
      const none = /Thin-blood(?: character)?s have no (?:intrinsic )?Disciplines\./.exec(s.text);
      const extra = (v.Disciplines || []).filter((d) => (+d.Dots || 0) > 0 && d.Discipline !== 'Thin-Blood Alchemy').map((d) => d.Discipline);
      if (none) out.push({ ok: !extra.length, text: none[0] + (extra.length ? ' This sheet: ' + extra.join(', ') + '.' : '') });
    } else if (s.key === 'DISCIPLINES') {
      const want = disciplineDots(s.text);
      const have = (v.Disciplines || []).map((d) => (+d.Dots || 0) - (later.disciplines[d.Discipline] || 0)).filter((n) => n > 0).sort().reverse();
      if (want) out.push({ ok: JSON.stringify(have) === JSON.stringify(want.slice().sort().reverse()), text: 'The book: ' + want.join(' and ') + ' dots. This sheet: ' + (have.join(' and ') || 'none') + '.' });
      const short = (v.Disciplines || []).filter((d) => d.Discipline && (d.Powers || []).length < (+d.Dots || 0));
      const unpowered = short.map((d) => d.Discipline + ' (' + (d.Powers || []).length + ' of ' + (+d.Dots || 0) + ')');
      // powered up to the dots bought with experience: the Sea of Time opened the rest
      const xpOf = (d) => ((meta || {}).xpBuys || []).filter((b) => b.kind === 'discipline' && b.key === d.Discipline).reduce((a, b) => a + (+b.to - +b.from), 0);
      const opened = short.filter((d) => xpOf(d) && (d.Powers || []).length >= (+d.Dots || 0) - xpOf(d));
      if ((v.Disciplines || []).some((d) => d.Discipline)) out.push({ ok: !unpowered.length, pending: short.length && opened.length === short.length ? SEA : null,
        text: (powerPerDot() || 'A power for each dot.') + (unpowered.length ? ' Still to take: ' + unpowered.join(', ') + (opened.length ? ' — ' + opened.map((d) => d.Discipline + ' ' + (+d.Dots)).join(', ') + ' bought at the Sea of Time' : '') + '.' : '') });
      if (v.Clan && clanDisciplines(v.Clan).length) {
        // a Discipline only another step gave (the Predator's, experience's) is not this step's choice
        const off = (v.Disciplines || []).filter((d) => d.Discipline && clanDisciplines(v.Clan).indexOf(d.Discipline) === -1 && (+d.Dots || 0) - (later.disciplines[d.Discipline] || 0) > 0).map((d) => d.Discipline);
        out.push({ ok: !off.length || /Caitiff/.test(v.Clan), text: off.length ? off.join(', ') + ' is not among ' + v.Clan + '’s ' + clanDisciplines(v.Clan).join(', ') + '.' : 'Clan Disciplines: ' + clanDisciplines(v.Clan).join(', ') + '.' });
      }
    }
    if (s.key === 'PREDATOR' && isThin(v) && !v.Predator && noPredator()) out.push({ ok: true, text: noPredator() });
    else if (s.key === 'PREDATOR') {
      const cur = predators(v, meta).find((p) => p.name === v.Predator);
      const n = cur && G() ? G().grantsOf(cur.entity).length : 0;
      const done = Object.keys((((meta || {}).pred || {}).name === v.Predator && (meta || {}).pred.applied) || {}).length;
      out.push({ ok: !!v.Predator && done >= n, text: v.Predator ? v.Predator + ': ' + done + ' of ' + n + ' grants applied.' : 'Pick a Predator type.' });
    }
    if (s.key === 'ADVANTAGES') {
      const want = advantagePoints(s.text);
      // the Predator's own Advantages and Flaws are "in addition to" these points
      const theirs = pv.advantages.map((r) => JSON.stringify(r));
      const rows = (v['Advantages & Flaws'] || []).filter((r) => { const k = theirs.indexOf(JSON.stringify(r)); if (k === -1) return true; theirs.splice(k, 1); return false; });
      const adv = rows.filter((r) => !r.Flaw).reduce((a, r) => a + (+r.Dots || 0), 0);
      const fl = rows.filter((r) => r.Flaw).reduce((a, r) => a + (+r.Dots || 0), 0);
      // experience spent on an Advantage's dots is not creation's points
      const xpDots = ((meta || {}).xpBuys || []).filter((b) => b.kind === 'advantage').length;
      // right but for the band's extra points: the Sea of Time opened them
      const bandOpened = want && (band.adv || band.flaws) && adv - xpDots >= want.advantages && adv - xpDots <= want.advantages + band.adv && fl >= want.flaws;
      if (want) out.push({ ok: adv - xpDots === want.advantages + band.adv && fl >= want.flaws + band.flaws, pending: bandOpened ? SEA : null, text: 'The book: ' + want.advantages + ' points of Advantages, ' + want.flaws + ' points of Flaws ' + (living(v) ? '' : '(besides the Predator’s)') + '' + (band.adv || band.flaws ? '; ' + titleCase(band.name) + ' add ' + band.adv + ' and ' + band.flaws : '') + '. This sheet: ' + (adv - xpDots) + ' and ' + fl + '.' });
      // what the books forbid this character, read from their own sentences: the clan's Bane ("Ravnos
      // characters cannot take the No Haven Flaw at character creation"), an Advantage's text
      // ("Ventrue may not take this Merit"; "You cannot take Lifelike if you take this Flaw")
      const held = (v['Advantages & Flaws'] || []).filter((r) => r.Name);
      const has = (n) => held.some((r) => r.Name.toLowerCase() === String(n).trim().toLowerCase());
      const barred = [];
      const bane = String(v['Clan Bane'] || '');
      let bm; const bre = /([A-Z][\w ]*?) characters cannot take the ([A-Z][\w’' -]*?) (Flaw|Merit|Background|Advantage) at character creation\./g;
      while ((bm = bre.exec(bane))) if (v.Clan && bm[1].trim() === v.Clan && has(bm[2])) barred.push(bm[0]);
      held.forEach((r) => {
        const e = r.Advantage && D.loaded((D.records().find((q) => q.id === r.Advantage) || {}).book) ? D.entity(r.Advantage) : null;
        const t = String((e && e.desc) || '');
        const cm = /([A-Z][\w ]*?) may not take this (Merit|Flaw|Background)\./.exec(t);
        if (cm && v.Clan && cm[1].trim() === v.Clan) barred.push(r.Name + ': “' + cm[0] + '”');
        let xm; const xre = /You cannot take ([A-Z][\w’' -]*?) if you take this (Flaw|Merit)\./g;
        while ((xm = xre.exec(t))) if (has(xm[1])) barred.push(r.Name + ': “' + xm[0] + '”');
      });
      if (barred.length) out.push({ ok: false, text: 'The books forbid: ' + barred.join(' · ') });
      const tm = /Thin-blood characters must take between (\w+) and (\w+) Thin-Blood Merits and the same number of Thin-Blood Flaws\./i.exec(s.text);
      if (isThin(v) && tm) {
        const tb = D.thinBloodTraits();
        const m = rows.filter((r) => !r.Flaw && tb.merits.some((t) => t.name === r.Name)).length;
        const f = rows.filter((r) => r.Flaw && tb.flaws.some((t) => t.name === r.Name)).length;
        out.push({ ok: m >= num(tm[1]) && m <= num(tm[2]) && m === f, text: tm[0] + ' This sheet: ' + m + ' and ' + f + '.' });
      }
      if (isThin(v) && rows.some((r) => r.Name === CLAN_CURSE && r.Flaw)) out.push({ ok: !!(v['Sire Clan'] && v['Clan Bane']), text: v['Sire Clan'] && v['Clan Bane'] ? 'Clan Curse: ' + v['Sire Clan'] + '’s Bane, at Bane Severity 1.' : 'Clan Curse: pick your sire’s clan and its Bane.' });
      const fb = isThin(v) && thinForbidden();
      if (fb) {
        const names = /buy (.+) during/.exec(fb)[1].split(/,\s*(?:or\s+)?|\s+or\s+/).map((x) => x.trim()).filter(Boolean);
        const bad = rows.filter((r) => !r.Flaw && names.some((n) => new RegExp('^' + n + '\\b', 'i').test(r.Name || ''))).map((r) => r.Name);
        out.push({ ok: !bad.length, text: fb + (bad.length ? ' This sheet: ' + bad.join(', ') + '.' : '') });
      }
    }
    if (s.key === 'SEA OF TIME') {
      out.push({ ok: !!(meta || {}).band, text: (meta || {}).band ? 'The coterie are ' + titleCase(meta.band) + '.' : 'Decide with the Storyteller how old the coterie are.' });
      if (band.xp) { const sp = ((meta || {}).xpBuys || []).reduce((a, b) => a + b.cost, 0); out.push({ ok: sp === band.xp, text: 'Spend ' + band.xp + ' experience points. Spent: ' + sp + '.' }); }
      // the band's Generation and Blood Potency (a thin-blood's are checked below, from its own line)
      const gl = !isThin(v) && G() ? (band.gens || []).filter((g) => !g.thin) : [];
      if (gl.length) {
        const gen = parseInt(v.Generation, 10), bp = +v['Blood Potency'] || 0;
        const fits = gl.some((g) => g.gens.indexOf(gen) !== -1 && bp === g.bp + pv.potency);
        out.push({ ok: fits, text: gl.map((g) => g.text).join(' · ') + '. This sheet: Generation ' + (v.Generation || '—') + ', Blood Potency ' + bp + '.' });
      }
    }
    if (s.key === 'SEA OF TIME' && isThin(v)) {
      const g = /((?:\d+th,?\s*(?:or\s+)?)+)Generation \(thin-bloods\): Blood Potency (\d+)/.exec(s.text);
      const bh = /(\d+)\+ Generation Thinblood: Blood Potency (\d+)/.exec(s.text);   // The Black Hand's "14+ Generation Thinblood: Blood Potency 0"
      if (bh && !g) {
        const gen = parseInt(v.Generation, 10);
        out.push({ ok: gen >= +bh[1] && +v['Blood Potency'] === +bh[2], text: bh[0] + '. This sheet: Generation ' + (v.Generation || '—') + ', Blood Potency ' + (v['Blood Potency'] != null ? v['Blood Potency'] : '—') + '.' });
      }
      if (g) {
        const gens = g[1].match(/\d+/g).map(Number);
        const gen = parseInt(v.Generation, 10);
        out.push({ ok: gens.indexOf(gen) !== -1 && +v['Blood Potency'] === +g[2], text: g[0] + '. This sheet: Generation ' + (v.Generation || '—') + ', Blood Potency ' + (v['Blood Potency'] != null ? v['Blood Potency'] : '—') + '.' });
      }
    }
    if (s.key === 'CONVICTIONS AND TOUCHSTONES' && Sheet.isSabbat(v)) {
      const add = bhAdds(s.key);
      const least = add && /at least one of these has to be a Path Conviction/.exec(add.desc || '');
      out.push({ ok: true, text: v['Path of Enlightenment'] ? 'Path: ' + v['Path of Enlightenment'] + (least ? ' — ' + least[0] + ', each with a Touchstone Ritae.' : '.') : 'No Path of Enlightenment (The Black Hand’s option).' });
    }
    if (s.key === 'CONVICTIONS AND TOUCHSTONES' && isCainite(v)) {
      const st = roadStart();
      out.push({ ok: !!v.Road, text: v.Road ? 'Road: ' + v.Road + '.' : 'Choose a Road (Summoned Stories).' });
      if (st != null) out.push({ ok: +v['Road Rating'] === st, text: 'Road rating ' + st + ' (the brief’s Starting Rating). This sheet: ' + (v['Road Rating'] || 0) + '.' });
    }
    if (s.key === 'CONVICTIONS AND TOUCHSTONES' && !isCainite(v)) {
      const c = convictions(s.text);
      const n = (v['Touchstones & Convictions'] || []).filter(Boolean).length;
      if (c.min != null) out.push({ ok: n >= c.min && n <= c.max, text: c.min + ' to ' + c.max + ' Convictions, each with a ' + (v['Path of Enlightenment'] ? 'Touchstone Ritae or a Touchstone' : 'Touchstone') + '. This sheet: ' + n + '.' });
      const hum = (c.humanity || 0) + pv.humanity + band.humanity;
      if (c.humanity != null) out.push({ ok: +v.Humanity === hum, pending: band.humanity && +v.Humanity === (c.humanity || 0) + pv.humanity ? SEA : null, text: 'Humanity ' + c.humanity + ' (the book)' + (pv.humanity || band.humanity ? ', ' + hum + ' with ' + [pv.humanity ? 'your Predator type' : '', band.humanity ? 'the Sea of Time (' + titleCase(band.name) + ')' : ''].filter(Boolean).join(' and ') : '') + '. This sheet: ' + (v.Humanity || 0) + '.' });
    }
    return out;
  }

  return { render, steps, bhAdds, paths, roads, roadStart, attributeSpread, skillDistributions, freeSpecialties, disciplineDots, advantagePoints, convictions, clans, clanDisciplines, clanBane, predators };
})();
