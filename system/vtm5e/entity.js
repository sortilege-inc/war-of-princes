// system/vtm5e/entity.js — one entity, as the book holds it.
//
// Generic by design: an entity is rendered from its own text, properties, table and sidebars,
// so a rule, a clan, a power, a loresheet and a Storyteller character all come out without
// this file naming any of them. Every string shown is the book's; the only words added are
// the property names, which are the corpus's own labels too, and a few labels of this tool's.
//
// What is drawn rather than printed as text, the string in data/ untouched:
//   * the book's Markdown emphasis (`*…*`, `**…**`) — set as emphasis;
//   * the book's die glyphs, written by the conversion as "[Regular Die: Critical]" — drawn
//     with the art pack's face (the text stays as the title / aria-label);
//   * a Storyteller character's printed pools ("Physical 4, Social 3") — each a button that
//     rolls it, when the page provides a roller (opts.onPool).
// The errata (index.corrections) are shown beside the rule they correct.
window.VtmEntity = (function () {
  const { el, esc } = window.VttRender;
  const D = window.VtmData;
  const Dice = () => window.VtmDice;

  // Said as the entity's opening quotation, not listed as a field.
  const QUOTES = ['Epigraph', 'Quote', 'Epitaph'];
  // A character's printed pools: each part "Name N" is a pool.
  const POOL_FIELDS = ['Standard Dice Pools', 'Exceptional Dice Pools', 'Secondary Attributes', 'Attributes', 'Skills', 'Disciplines'];
  // A power's printed fields, drawn together after its text in the order the entity carries them.
  const POWER_FIELDS = ['Cost', 'Activation Cost', 'Dice Pools', 'Dice Pool', 'Amalgam', 'Prerequisite', 'Prerequisite Power', 'Ingredients', 'Process', 'System', 'Duration'];

  // ── the text ───────────────────────────────────────────────────────
  function inline(s) {
    let h = esc(s);
    h = h.replace(Dice().TOKEN, (m, kind, word) => Dice().tokenHtml(kind, word));
    h = h.replace(/\*\*\*(.+?)\*\*\*/g, '<b><i>$1</i></b>');
    h = h.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    h = h.replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\w)/g, '$1<i>$2</i>');
    h = h.replace(/■/g, '<span class="endmark">■</span>');
    return h;
  }

  // \n\n is a paragraph break, \n a line break; nothing is added or reflowed.
  function prose(text, cls) {
    if (text == null || text === '') return null;
    const wrap = el('div', { class: cls || 'prose' });
    String(text).split(/\n\s*\n/).forEach((p) => wrap.appendChild(el('p', { html: inline(p).replace(/\n/g, '<br>') })));
    return wrap;
  }

  // A .lore chapter: Markdown as the conversion wrote it (headings, rules, emphasis;
  // a single newline is a soft wrap, a blank line a paragraph).
  function lore(text) {
    const wrap = el('div', { class: 'prose lore' });
    String(text).split(/\n\s*\n/).forEach((block) => {
      const b = block.replace(/^\n+|\n+$/g, '');
      if (!b) return;
      const h = /^(#{1,4})\s+(.*)$/.exec(b);
      if (h && b.indexOf('\n') === -1) return wrap.appendChild(el('h' + Math.min(6, h[1].length + 2), { html: inline(h[2]) }));
      if (/^-{3,}$/.test(b.trim())) return wrap.appendChild(el('hr'));
      wrap.appendChild(el('p', { html: inline(b.replace(/\n/g, ' ')) }));
    });
    return wrap;
  }

  // A reference to another entity: a link when the reader can open it, the name otherwise.
  function link(ref) {
    const label = (ref && ref.name) || '';
    if (!ref || !ref.hash) return el('span', {}, [label]);
    return el('a', {
      class: 'ref', href: '#', onclick: (ev) => {
        ev.preventDefault();
        if (window.VtmOpenEntity) window.VtmOpenEntity(ref.hash);
      },
    }, [label]);
  }

  // ── values ─────────────────────────────────────────────────────────
  function defLine(fields) {
    return el('span', { class: 'defline' }, (fields || []).map((f, i) => [i ? ' · ' : null,
      f.vk === 'ref' ? link(f.ref) : el('span', { html: inline(f.value == null ? '' : String(f.value)) })]));
  }

  function value(p) {
    if (p.vk === 'ref') return link(p.ref);
    if (p.vk === 'list') {
      if (!p.items || !p.items.length) return null;
      return el('ul', { class: 'items' }, p.items.map((it) => el('li', {}, [
        it.vk === 'ref' ? link(it) : it.vk === 'def' ? defLine(it.fields) : el('span', { html: inline(String(it.value)) }),
      ])));
    }
    if (p.vk === 'def') return fields(p.fields);
    if (p.value === undefined) return null;
    if (typeof p.value === 'boolean') return el('span', {}, [p.value ? 'yes' : 'no']);
    return prose(String(p.value), 'prose');
  }

  function fields(list) {
    return el('div', { class: 'fields' }, (list || []).map((f) => {
      const v = value(f);
      return v ? el('div', { class: 'prop' }, [el('div', { class: 'prop-k' }, [f.name]), el('div', { class: 'prop-v' }, [v])]) : null;
    }));
  }

  // A type's declaration (the BASE), not an instance's value.
  function isDeclaration(p) {
    return p.value === undefined && p.vk !== 'list' && p.vk !== 'def' && p.vk !== 'ref';
  }

  // A printed pool line, each "Name N" a button when the page can roll.
  function poolValue(p, e, onPool) {
    if (!onPool || typeof p.value !== 'string') return value(p);
    const pools = Dice().poolsIn(p.value);
    if (!pools.length) return value(p);
    // the printed string stays whole; the buttons sit on its parts
    const parts = p.value.split(/([,;])/);
    const r = D.record(e.id);
    const who = r ? D.recordLabel(r) : e.name;
    return el('div', { class: 'pool-line' }, parts.map((part) => {
      const m = /^(\s*)([A-Z][A-Za-z’' ()/-]*?)\s+(\d{1,2})(\s*)$/.exec(part);
      if (!m) return part;
      return [m[1], el('button', { type: 'button', class: 'pool', title: 'Roll ' + m[2].trim() + ' (' + m[3] + ')', onclick: () => onPool(+m[3], who + ' · ' + m[2].trim(), e) }, [m[2] + ' ' + m[3]]), m[4]];
    }));
  }

  // ── a printed table, cell for cell ─────────────────────────────────
  function table(t) {
    if (!t) return null;
    return el('div', { class: 'table-wrap' }, [el('table', { class: 'printed' }, [
      t.columns && t.columns.length ? el('thead', {}, [el('tr', {}, t.columns.map((c) => el('th', { html: inline(String(c)) })))]) : null,
      el('tbody', {}, t.rows.map((r) => el('tr', {}, r.map((c) => el('td', { html: inline(String(c)) }))))),
    ])]);
  }

  // §22 GUIDANCE: the sidebar beside what it concerns. An erratum says so.
  function guidance(g) {
    const errata = (g.topics || []).indexOf('errata') !== -1;
    const designer = (g.topics || []).some((t) => /designer/i.test(t));
    return el('aside', { class: 'guidance' + (errata ? ' errata' : '') + (designer ? ' designer' : '') }, [
      el('div', { class: 'guidance-k' }, [errata ? (designer ? 'Errata — designer’s comment' : 'Errata') : (g.name || 'Sidebar')]),
      g.text ? prose(g.text) : el('div', { class: 'muted small' }, ['(the sidebar’s title only; the corpus carries no text for it)']),
    ]);
  }

  // The errata that correct this entity: their replacement fields, sidebars and tables.
  function correctionsOf(e) {
    const list = D.corrections(e.id);
    if (!list.length) return null;
    return el('section', { class: 'corrections' }, list.map((c) => el('div', { class: 'correction' }, [
      el('div', { class: 'corr-h' }, ['Errata and Rules Update', el('span', { class: 'muted small' }, [' · corrects ' + c.target.name])]),
      c.props.length ? el('div', { class: 'fields errata-fields' }, c.props.map((p) => el('div', { class: 'prop' }, [el('div', { class: 'prop-k' }, [p.name]), el('div', { class: 'prop-v' }, [value(p)])]))) : null,
      ...c.guidance.map(guidance),
      ...c.nested.map((id) => {
        const n = D.entity(id);
        return n ? el('div', { class: 'nested' }, [render(n)]) : el('div', { class: 'muted small' }, ['(the replacement ' + id + ' is in the Errata book — open it to see it)']);
      }),
    ])));
  }

  function kindOf(e) {
    const r = D.record(e.id);
    return r ? r.kind : null;
  }

  function subline(e) {
    const r = D.record(e.id);
    const bits = [];
    if (r && (r.kind === 'power' || r.kind === 'ritual')) bits.push([r.discipline, r.level].filter(Boolean).join(' · ') || null);
    if (r && r.kind === 'character' && r.under) bits.push(r.under);
    const b = D.indexBook(e.book);
    if (b) bits.push(b.label);
    return bits.filter(Boolean).join(' · ');
  }

  // The whole entity: its heading, its quotation, its text, its fields, its table, its
  // sidebars, its errata, and what hangs under it.
  // opts: { bare, noKids, depth, onPool }
  function render(e, opts) {
    const o = opts || {};
    const depth = o.depth || 0;
    const kind = kindOf(e);
    const box = el('article', { class: 'entity' + (kind ? ' rec-' + kind : '') + (e.type ? ' type-' + e.type.toLowerCase() : '') + (depth ? ' depth-' + Math.min(depth, 4) : '') });
    if (!o.bare) {
      box.appendChild(el(depth ? 'h' + Math.min(6, 3 + depth) : 'h3', { class: 'entity-h' }, [e.name]));
      // another name it answers to (ALIAS): the Cults of the Blood Gods prints The Nation of Blood as Descendants of the Baron
      if (e.aliases && e.aliases.length) box.appendChild(el('div', { class: 'entity-alias muted small' }, ['Also called ' + e.aliases.join(', ')]));
      if (!depth) {
        const sub = subline(e);
        if (sub) box.appendChild(el('div', { class: 'entity-sub' }, [sub]));
      }
    }
    const props = e.props || [];
    props.filter((p) => QUOTES.indexOf(p.name) !== -1 && p.value).forEach((p) => {
      box.appendChild(el('blockquote', { class: 'epigraph' + (p.name === 'Epitaph' ? ' epitaph' : '') }, [prose(String(p.value))]));
    });

    if (e.desc) box.appendChild(prose(e.desc));

    // a power's printed fields, in the order the book prints them, after its text, as one box
    const head = kind === 'power' || kind === 'ritual' ? props.filter((p) => POWER_FIELDS.indexOf(p.name) !== -1 && typeof p.value === 'string') : [];
    if (head.length) box.appendChild(el('dl', { class: 'power-head' }, head.map((p) => [el('dt', {}, [p.name]), el('dd', {}, [prose(p.value)])])));

    const rest = props.filter((p) => QUOTES.indexOf(p.name) === -1 && head.indexOf(p) === -1);
    const stat = kind === 'character';
    const grid = el('div', { class: stat ? 'statblock' : 'fields' });
    rest.forEach((p) => {
      if (isDeclaration(p)) {
        grid.appendChild(el('div', { class: 'prop decl' }, [
          el('div', { class: 'prop-k' }, [p.name]),
          el('div', { class: 'prop-v muted small' }, [[p.type || p.vk, p.required ? 'required' : null].filter(Boolean).join(' ')]),
        ]));
        return;
      }
      const v = stat && POOL_FIELDS.indexOf(p.name) !== -1 ? poolValue(p, e, o.onPool) : value(p);
      if (!v) return;
      grid.appendChild(el('div', { class: 'prop' }, [el('div', { class: 'prop-k' }, [p.name]), el('div', { class: 'prop-v' }, [v])]));
    });
    if (grid.childNodes.length) box.appendChild(grid);

    const t = table(e.table);
    if (t) box.appendChild(t);
    (e.guidance || []).forEach((g) => box.appendChild(guidance(g)));
    const corr = correctionsOf(e);
    if (corr) box.appendChild(corr);

    const kids = D.children(e.id);
    if (kids.length && !o.noKids) kids.forEach((k) => box.appendChild(render(k, { depth: depth + 1, onPool: o.onPool })));
    return box;
  }

  // A card for a grid: the name, one line of what it is, the start of its text.
  function card(e, onclick, meta) {
    const text = e.desc || '';
    return el('button', { class: 'card', type: 'button', onclick }, [
      el('div', { class: 'card-name' }, [e.name]),
      meta ? el('div', { class: 'card-meta' }, [meta]) : null,
      text ? el('div', { class: 'card-text', html: inline(text.split(/\n\s*\n/)[0]) }) : null,
    ]);
  }

  return { render, card, prose, lore, inline, link, table, guidance };
})();
