// engine/data.js — the corpus is too big to load per page, so a book's data arrives on
// demand. Generic: this file knows about "books" and "files", never about a game.
//
//   VttData.index()                 the index (data/index.js, loaded with the page)
//   VttData.books()                 every book record in the index, in the index's order
//   VttData.book(id)                one index record (title, kind, files) — not its content
//   VttData.has(id, channel)        is that book's channel already in memory?
//   VttData.ready(ids, channels)    → Promise, resolved once every id's channels are loaded
//
// A channel is a named slice of a book's data ('main' is the entities; a system may ship
// others — a large corpus may keep its margin notes out of 'main' so a page that never
// reads them never pays for them). Each data file is a self-registering script: it writes
// into the global the config names and is therefore idempotent on reload.
window.VttData = (function () {
  const CFG = window.VttConfig || {};
  const GLOBAL = CFG.dataGlobal || 'VTTDATA';
  const store = () => window[GLOBAL] || null;

  const pending = {};      // src → Promise (one <script> per file, however many ask)

  function index() {
    const T = store();
    return (T && T.index) || { books: [], counts: {} };
  }

  function books() {
    return (index().books || []).slice();
  }

  function book(id) {
    return (index().books || []).find((b) => b.id === id) || null;
  }

  function filesFor(id, channel) {
    const b = book(id);
    if (!b) return [];
    const f = b.files || {};
    return (f[channel] || []).slice();
  }

  function has(id, channel) {
    const T = store();
    if (!T) return false;
    const files = filesFor(id, channel || 'main');
    return files.length > 0 && files.every((src) => (T.loaded || {})[src]);
  }

  function load(src) {
    const T = store();
    if (T && (T.loaded || {})[src]) return Promise.resolve();
    if (pending[src]) return pending[src];
    pending[src] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = false;                       // keep the corpus's file order
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('VttData: could not load ' + src));
      document.head.appendChild(s);
    });
    return pending[src];
  }

  // ids: a book id or a list of them. channels: a channel name or a list ('main' by default).
  function ready(ids, channels) {
    const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
    const chans = channels ? (Array.isArray(channels) ? channels : [channels]) : ['main'];
    const srcs = [];
    list.forEach((id) => chans.forEach((c) => filesFor(id, c).forEach((src) => {
      if (srcs.indexOf(src) === -1) srcs.push(src);
    })));
    return Promise.all(srcs.map(load)).then(() => undefined);
  }

  return { index, books, book, filesFor, has, ready };
})();
