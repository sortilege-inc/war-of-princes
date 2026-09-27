// system/vtm5e/data.js — accessors over the generated corpus (window.VTM5E from data/*.js).
// The only file that knows the data's shape; the reader, the tabs, the panels and the dice
// ask here.
//
// Two things worth saying about this corpus:
//   * It is eighteen books (11 MB). data/index.js and data/records.js come with every page;
//     a book's entities arrive when something asks for them (VtmData.ready → engine/data.js).
//   * The BASE declares one type. A Discipline power, a ritual and a Storyteller character are
//     RECORDS found by the fields the book prints on them (build_data.SHAPES); records.js
//     lists them with a few fields and their place, so a list can be drawn before its book is
//     loaded.
window.VtmData = (function () {
  const EMPTY = { books: {}, entities: {}, loaded: {}, index: { books: [], corrections: [] }, records: [] };
  const T = () => window.VTM5E || EMPTY;
  const Data = () => window.VttData;

  const index = () => T().index || EMPTY.index;
  const books = () => (index().books || []).slice();
  const indexBook = (id) => (index().books || []).find((b) => b.id === id) || null;
  const book = (id) => T().books[id] || null;
  const loaded = (id) => !!book(id);
  const entity = (id) => T().entities[id] || null;
  const records = () => T().records || [];
  const record = (id) => records().find((r) => r.id === id) || null;
  const disciplines = () => (index().disciplines || []).slice();

  // Load one or more books; resolves when their entities are in memory.
  function ready(ids) {
    const list = (Array.isArray(ids) ? ids : [ids]).filter((id) => id && indexBook(id));
    return Data().ready(list, ['main']);
  }
  const readyAll = () => ready(books().map((b) => b.id));
  const loadedBooks = () => books().filter((b) => loaded(b.id)).map((b) => b.id);

  // Which book an id lives in, before that book is loaded: a record knows; a correction's
  // target is always in the core.
  function bookOf(id) {
    const e = entity(id);
    if (e) return e.book;
    const r = record(id);
    return r ? r.book : null;
  }
  // Make sure an id's book is loaded, then give the entity.
  function fetch(id) {
    const b = bookOf(id);
    if (entity(id)) return Promise.resolve(entity(id));
    if (!b) return Promise.resolve(null);
    return ready(b).then(() => entity(id));
  }

  function children(id) {
    const e = entity(id);
    return e ? e.children.map(entity).filter(Boolean) : [];
  }

  function prop(e, name) {
    return (e && (e.props || []).find((p) => p.name === name)) || null;
  }
  function val(e, name) {
    const p = prop(e, name);
    if (!p) return undefined;
    if (p.vk === 'scalar' || p.vk === 'enum') return p.value;
    if (p.vk === 'ref') return p.ref;
    if (p.vk === 'list') return p.items;
    return p;
  }
  const text = (e, name) => {
    const v = val(e, name);
    return typeof v === 'string' ? v : null;
  };

  // Every entity of a set of loaded books, each book's chapters in order, depth first.
  function all(bookIds) {
    const out = [];
    (bookIds || loadedBooks()).forEach((bid) => {
      const b = book(bid);
      if (!b) return;
      const walk = (ids) => ids.forEach((id) => { const e = entity(id); if (e) { out.push(e); walk(e.children); } });
      b.chapters.forEach((c) => walk(c.roots || []));
    });
    return out;
  }
  // The BASE's declaration of a type (the base book must be loaded): the entity whose key is
  // the type's name and that EXTENDS nothing.
  const declaration = (name) => all(['base']).find((e) => e.key === name && !e.type) || null;

  // ── a chapter's display title ──────────────────────────────────────
  // The chapter's own title is its file's NAME, "Vampire: The Masquerade - <Book> - <Chapter>";
  // shown here as its last segment. A lore chapter's is its first heading line.
  function chapterTitle(c) {
    if (c.kind === 'lore') return String(c.name || c.file).replace(/^#\s+/, '');
    const n = String(c.name || c.file);
    const parts = n.split(' - ');
    return parts[parts.length - 1];
  }

  // ── a book's outline: chapters, then each chapter's entity tree ────
  const outlineCache = {};
  function outline(bid) {
    if (outlineCache[bid]) return outlineCache[bid].roots;
    const b = book(bid);
    if (!b) return [];
    const map = {};
    const build = (e, parent, depth) => {
      const n = { id: e.id, entity: e, label: e.name, depth, parent, kids: [] };
      map[e.id] = n;
      children(e.id).forEach((k) => n.kids.push(build(k, n, depth + 1)));
      return n;
    };
    const roots = b.chapters.map((c) => {
      const n = { id: 'ch:' + c.file, chapter: c, label: chapterTitle(c), page: c.page, depth: 0, parent: null, kids: [] };
      map[n.id] = n;
      (c.roots || []).map(entity).filter(Boolean).forEach((e) => n.kids.push(build(e, n, 1)));
      return n;
    });
    outlineCache[bid] = { roots, map };
    return roots;
  }
  function node(bid, id) {
    outline(bid);
    return (outlineCache[bid] && outlineCache[bid].map[id]) || null;
  }
  function trail(bid, id) {
    const out = [];
    let n = node(bid, id);
    while (n) {
      out.unshift(n);
      n = n.parent;
    }
    return out;
  }

  // ── corrections: the errata beside what they correct ───────────────
  const corrections = (id) => (index().corrections || []).filter((c) => c.target && c.target.hash === id);

  // ── records ────────────────────────────────────────────────────────
  const powers = () => records().filter((r) => r.kind === 'power' || r.kind === 'ritual');
  const characters = () => records().filter((r) => r.kind === 'character');
  // A stat block the books print under a generic sub-heading (Chicago by Night's 115
  // "Mask and Mien:") is known by the heading it sits under: a name three or more records
  // share is not a name.
  let shared = null;
  function generic(r) {
    if (!shared) {
      shared = {};
      records().forEach((x) => { shared[x.name] = (shared[x.name] || 0) + 1; });
    }
    return shared[r.name] >= 3 && !!r.under;
  }
  const recordLabel = (r) => (generic(r) ? r.under : r.name);

  // "Level 3" → 3; a record the corpus lost its level for → null
  const levelNumber = (r) => {
    const m = /^Level (\d+)(?: (?:Powers?|Rituals?|Ceremony|Ceremonies|Formulae?))?$/.exec(r.level || '');   // as build_data.LEVEL_HEADING
    return m ? +m[1] : null;
  };

  // ── headings by name (the Clans view): whole-word matches in loaded books ──
  function headingsNamed(word, bookIds) {
    const re = new RegExp('(^|[^A-Za-z])' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(s|’s)?([^A-Za-z]|$)');
    const out = [];
    (bookIds || loadedBooks()).forEach((bid) => {
      const b = book(bid);
      if (!b) return;
      const walk = (ids) => ids.forEach((id) => {
        const e = entity(id);
        if (!e) return;
        if (re.test(e.name)) out.push(e);
        walk(e.children);
      });
      b.chapters.forEach((c) => walk(c.roots || []));
    });
    return out;
  }

  // ── search (the loaded books, and the records always) ──────────────
  function searchText(e) {
    const parts = [e.name].concat(e.aliases || [], [e.desc || '']);   // an ALIAS finds it too
    (e.props || []).forEach((p) => {
      if ((p.vk === 'scalar' || p.vk === 'enum') && typeof p.value === 'string') parts.push(p.value);
      if (p.vk === 'list') (p.items || []).forEach((it) => {
        if (it.vk === 'scalar') parts.push(String(it.value));
      });
    });
    if (e.table) e.table.rows.forEach((r) => parts.push(r.join(' ')));
    (e.guidance || []).forEach((g) => parts.push((g.name || '') + ' ' + (g.text || '')));
    return parts.join('\n');
  }
  const cache = new Map();
  function search(query, bookIds, limit) {
    const q = String(query || '').trim().toLowerCase();
    if (q.length < 2) return [];
    const hits = [];
    (bookIds || loadedBooks()).forEach((bid) => {
      const b = book(bid);
      if (!b) return;
      const walk = (ids) => ids.forEach((id) => {
        const e = entity(id);
        if (!e) return;
        let t = cache.get(id);
        if (t === undefined) {
          t = searchText(e).toLowerCase();
          cache.set(id, t);
        }
        const inName = e.name.toLowerCase().indexOf(q) !== -1;
        if (inName || t.indexOf(q) !== -1) hits.push({ e, score: inName ? 0 : 1 });
        walk(e.children);
      });
      b.chapters.forEach((c) => {
        if (c.kind === 'lore' && c.text.toLowerCase().indexOf(q) !== -1) hits.push({ e: { id: 'ch:' + c.file, name: chapterTitle(c), book: bid, lore: c }, score: 1 });
        walk(c.roots || []);
      });
    });
    hits.sort((a, b) => a.score - b.score);
    return hits.slice(0, limit || 200).map((h) => h.e);
  }
  function excerpt(e, query, n) {
    const t = e.lore ? e.lore.text : searchText(e);
    const i = t.toLowerCase().indexOf(String(query).toLowerCase());
    if (i < 0) return null;
    const a = Math.max(0, i - (n || 60));
    const b = Math.min(t.length, i + String(query).length + (n || 60));
    return (a ? '…' : '') + t.slice(a, b).replace(/\n+/g, ' ') + (b < t.length ? '…' : '');
  }
  const searchRecords = (query) => {
    const q = String(query || '').trim().toLowerCase();
    return q.length < 2 ? [] : records().filter((r) => (r.name + ' ' + (generic(r) ? r.under : '')).toLowerCase().indexOf(q) !== -1);
  };

  // An art path as an absolute URL: a mask's url() set through a CSS variable resolves against
  // the stylesheet that uses it, not the page, so a relative path would miss.
  const artUrl = (src) => new URL(src, document.baseURI).href;

  // ── clans: a heading in a Clans chapter (core, Players Guide) that prints a "Bane" under it ──
  // Its in-clan Disciplines are the headings under its "Disciplines" heading (check_shape asserts
  // three for every clan; the Players Guide once held the first as a field — decision 28).
  function clans() {
    const out = [];
    all(['core', 'players-guide']).forEach((e) => {
      if (!/clans|caitiff|thin-blooded/.test(e.file)) return;
      if (children(e.id).some((k) => k.name === 'Bane') && !out.some((c) => c.name === e.name)) out.push({ name: e.name, entity: e, book: e.book });
    });
    return out;
  }
  function clanDisciplines(name) {
    const c = clans().find((x) => x.name === name);
    const d = c && children(c.entity.id).find((k) => k.name === 'Disciplines');
    const names = d ? children(d.id).map((k) => k.name) : [];
    const known = disciplines();
    return known.filter((n) => names.indexOf(n) !== -1);   // in the BASE's order
  }

  // ── the clanless: the core's Caitiff and Thin-Blooded chapters, which print no clan heading with
  // a Bane under it, so clans() never finds them. The Caitiff chapter prints its "Disciplines" and
  // "Bane" as headings of their own; the Thin-Blooded chapter its "Clan" and "Disciplines" under
  // "Thin-Blood Characteristics", and no bane ("never suffers any specific clan bane").
  function clanless() {
    const out = [];
    const top = (re, name) => all(['core']).find((e) => re.test(e.file) && e.name === name && !e.parent) || null;
    const cai = top(/core-caitiff/, 'The Caitiff');
    if (cai) out.push({ name: 'Caitiff', entity: cai, book: cai.book, bane: top(/core-caitiff/, 'Bane'), about: [top(/core-caitiff/, 'Disciplines')].filter(Boolean) });
    const tb = top(/core-thin-blooded/, 'The Thin-Blooded');
    const tc = top(/core-thin-blooded/, 'Thin-Blood Characteristics');
    const under = (n) => (tc ? children(tc.id).find((k) => k.name === n) : null);
    if (tb) out.push({ name: 'Thin-blood', entity: tb, book: tb.book, bane: null, about: [under('Clan'), under('Disciplines')].filter(Boolean) });
    return out;
  }
  // A clan's Banes: its own (the clan's "Bane" heading), then the Players Guide's "Clan Bane
  // Variants" (pp. 56-59) printed for it ("Brujah: Violence"), each { name, text, id, book }
  function clanBanes(name) {
    const out = [];
    const c = clans().find((x) => x.name === name);
    const b = c && children(c.entity.id).find((k) => k.name === 'Bane');
    if (b) out.push({ name: 'Bane', text: b.desc || '', id: b.id, book: b.book });
    all(loadedBooks()).filter((x) => x.name === 'Clan Bane Variants').forEach((v) => children(v.id).forEach((k) => {
      const m = /^([^:]+):\s*(.+)$/.exec(k.name);
      if (!m) return;
      const who = m[1].trim();
      if (name === who || name.startsWith(who) || who.startsWith(name)) out.push({ name: m[2], text: k.desc || '', id: k.id, book: k.book });
    }));
    return out;
  }
  // Every Thin-Blood Merit and Flaw the loaded books print, each { name, text, id } ("They have no
  // dot value"). The core prints them as fields of its "Thin-blood Merits" / "Thin-blood Flaws";
  // the Players Guide as headings of their own, under "New Thin-Blood Merits and Flaws" (p. 135)
  // and again in its summary appendix. A name printed twice keeps its fullest text.
  function thinBloodTraits() {
    const e = all(['core']).find((x) => x.name === 'Thin-Blood Merits and Flaws');
    const out = { entity: e || null, merits: [], flaws: [] };
    const add = (list, t) => {
      const i = list.findIndex((x) => x.name.toLowerCase() === t.name.toLowerCase());
      if (i === -1) list.push(t); else if ((t.text || '').length > (list[i].text || '').length) list[i] = Object.assign({}, t, { name: list[i].name });
    };
    all(loadedBooks()).forEach((x) => {
      const m = /^Thin-Blood (Merits|Flaws)$/i.exec(x.name);
      if (!m) return;
      const list = m[1].toLowerCase() === 'merits' ? out.merits : out.flaws;
      (x.props || []).filter((q) => q.vk === 'scalar' && q.value).forEach((q) => add(list, { name: q.name, text: q.value, id: x.id }));
      children(x.id).forEach((k) => add(list, { name: k.name, text: k.desc || '', id: k.id }));
    });
    return out;
  }

  return {
    clans, clanDisciplines, clanless, thinBloodTraits, clanBanes,
    artUrl, T, index, books, indexBook, book, loaded, loadedBooks, entity, records, record, disciplines,
    ready, readyAll, bookOf, fetch, children, all, declaration, prop, val, text, chapterTitle, outline, node, trail,
    corrections, powers, characters, levelNumber, generic, recordLabel, headingsNamed, search, excerpt, searchRecords,
  };
})();
