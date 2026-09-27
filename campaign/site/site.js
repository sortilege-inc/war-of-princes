// campaign/site/site.js — War of Princes' own tabs on the VTT's site, ahead of the books: Home,
// The Setting, The Coterie, Dramatis Personae, The Chronicle, The Household. Loaded at the `site`
// stage (engine/instance.js), after the system's tabs and before engine/site.js renders.
//
// Each tab draws its page as it was moved from the old campaign site (campaign/build/
// move_pages.py → campaign/docs/, bundled into campaign/data/docs.js), inside an element its
// scoped stylesheet reaches (campaign/data/docs.css). The old pages' scripts are the functions
// below, called after a tab is drawn: the site re-renders a tab rather than reloading the page,
// so anything they put on window removes itself once its element is gone.
(function () {
  const { el } = window.VttRender;
  const DOCS = window.WopDocs || {};

  document.querySelectorAll('a.brand').forEach((a) => a.setAttribute('href', '#home'));
  document.querySelectorAll('.brand-sub').forEach((n) => (n.textContent = 'a Vampire: the Dark Ages chronicle · London, 1242'));

  // a listener on window that goes when `node` leaves the page
  function whileShown(node, type, fn) {
    const wrapped = (ev) => { if (!node.isConnected) { window.removeEventListener(type, wrapped); return; } fn(ev); };
    window.addEventListener(type, wrapped, { passive: true });
  }

  function doc(container, tab, envoy) {
    const box = el('div', { class: 'wop-doc doc-' + tab + (envoy ? ' wop-envoy' : '') });
    box.innerHTML = DOCS[tab] || '';
    container.appendChild(el('div', { class: 'page wop-page' }, [box]));
    return box;
  }

  // ── The Chronicle: the floating contents, from its sessions and scenes (was the page's script) ──
  // A scene is addressed as #chronicle/<session>-<n>; opening that route scrolls to it.
  function chronicleContents(box, path, ctx) {
    const blocks = Array.from(box.querySelectorAll('.session-block'));
    if (!blocks.length) return;
    const slug = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const text = (n, sel) => { const x = n.querySelector(sel); return x ? x.textContent.trim() : ''; };
    const toc = el('nav', { class: 'chron-toc', 'aria-label': 'Chronicle contents' }, [el('div', { class: 'toc-head' }, ['The Chronicle'])]);
    const ul = el('ul', { class: 'toc-sessions' });
    toc.appendChild(ul);
    const scenes = [];
    const jump = (id) => (ev) => { ev.preventDefault(); const t = box.querySelector('#' + CSS.escape(id)); if (t) t.scrollIntoView({ behavior: 'smooth' }); history.replaceState(null, '', ctx.href('chronicle', [id])); };
    blocks.forEach((block, bi) => {
      const num = text(block, '.session-num');
      const name = text(block, '.session-name');
      const sid = block.id || slug(num) || 'session-' + bi;
      block.id = sid;
      const li = el('li', { class: 'toc-session' });
      const a = el('a', { href: ctx.href('chronicle', [sid]), onclick: jump(sid) }, [num || 'Session', name ? el('span', { class: 'toc-sub' }, [name]) : null]);
      const ch = el('ul', { class: 'toc-chapters' });
      block.querySelectorAll('.scene').forEach((scene, si) => {
        const idx = text(scene, '.scene-idx').replace(/\.$/, '');
        const title = text(scene, '.scene-title') || 'Scene ' + (si + 1);
        const scid = sid + '-' + (si + 1);
        scene.id = scid;
        const ca = el('a', { href: ctx.href('chronicle', [scid]), onclick: jump(scid) }, [idx ? el('span', { class: 'cn' }, [idx]) : null, title]);
        ch.appendChild(el('li', {}, [ca]));
        scenes.push({ el: scene, li, link: ca });
      });
      li.appendChild(a);
      li.appendChild(ch);
      ul.appendChild(li);
    });
    box.appendChild(toc);
    const lis = Array.from(ul.querySelectorAll('.toc-session'));
    const update = () => {
      const offset = 110;   // a scene counts as "current" once its top passes this line
      let cur = scenes[0];
      scenes.forEach((s) => { if (s.el.getBoundingClientRect().top <= offset) cur = s; });
      lis.forEach((l) => l.classList.toggle('active', l === cur.li));
      scenes.forEach((s) => s.link.classList.toggle('current', s === cur));
    };
    whileShown(toc, 'scroll', update);
    whileShown(toc, 'resize', update);
    update();
    if (path[0]) { const t = box.querySelector('#' + CSS.escape(path[0])); if (t) setTimeout(() => t.scrollIntoView(), 0); }
  }

  // ── The Household: its four panels behind the page's own tab buttons (was switchTab) ──
  // #household/<panel> opens a panel: tomi, graf, allies, herd.
  const PANELS = ['tomi', 'graf', 'allies', 'herd'];
  function householdTabs(box, path, ctx) {
    const btns = Array.from(box.querySelectorAll('.tab-btn'));
    const show = (id) => {
      btns.forEach((b, i) => { b.classList.toggle('active', PANELS[i] === id); b.setAttribute('aria-selected', PANELS[i] === id ? 'true' : 'false'); });
      box.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + id));
    };
    btns.forEach((b, i) => {
      b.removeAttribute('onclick');
      b.addEventListener('click', () => { show(PANELS[i]); history.replaceState(null, '', ctx.href('household', [PANELS[i]])); });
    });
    if (PANELS.indexOf(path[0]) !== -1) show(path[0]);
    if (window.WopHousehold) window.WopHousehold.sheets(box, ctx);   // the characters' sheets (campaign/site/household.js)
  }

  const tab = (id, label, envoy, after) => ({
    id, label, group: 'campaign',
    render(container, path, ctx) {
      const box = doc(container, id, envoy);
      if (after) after(box, path || [], ctx);
    },
  });
  const tabs = window.VttSiteTabs = window.VttSiteTabs || [];
  tabs.unshift(
    tab('home', 'War of Princes', true),
    tab('setting', 'The Setting', true),
    tab('coterie', 'The Coterie', true),
    tab('people', 'Dramatis Personae', true),
    tab('chronicle', 'The Chronicle', true, chronicleContents),
    tab('household', 'The Household', false, householdTabs),
  );
})();
