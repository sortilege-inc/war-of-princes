// engine/play.js — the player's page: join a room by code, claim a character, play
// from its sheet. Everything it shows arrives over the session socket into the same
// State the GM's page uses; the sheet itself is the system's (VttSystem.liveSheet).
(function () {
  const { el, button } = window.VttRender;
  const State = window.VttState;
  const Bus = window.VttBus;
  const Session = window.VttSession;
  const Sys = window.VttSystem;
  const CFG = window.VttConfig;

  if (CFG && CFG.title) {
    document.title = CFG.title + ' — play';
    document.querySelectorAll('.brand-title').forEach((n) => (n.textContent = CFG.title));
  }

  const main = document.getElementById('play-main');
  const statusEl = document.getElementById('play-status');
  const params = new URLSearchParams(location.search);

  function status(s) {
    statusEl.innerHTML = '';
    if (!s.active) {
      statusEl.appendChild(el('span', { class: 'muted' }, ['not in a session']));
      return;
    }
    statusEl.appendChild(el('span', { class: 'chip' + (s.connected ? ' on' : '') }, [s.connected ? 'connected' : s.status]));
    statusEl.appendChild(el('span', { class: 'muted' }, [el('span', { class: 'room-k' }, [' room ']), el('b', {}, [s.info.code])]));
    statusEl.appendChild(button('Leave', () => { Session.leave(); render(); }, 'ghost tiny'));
  }

  // ── bring your own character ───────────────────────────────────────
  // A character file (the site's creator writes one) can be loaded before joining or on the
  // claim screen. It waits here until the room is online, then joins the party and is
  // claimed in one go — and it waits out a reload, in this tab.
  const PENDING_KEY = (CFG.storagePrefix || 'sortilege-vtt') + ':play:pending';
  let pending = (() => {
    try {
      return JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null');
    } catch (e) {
      return null;
    }
  })();
  function setPending(m) {
    pending = m;
    try {
      if (m) sessionStorage.setItem(PENDING_KEY, JSON.stringify(m));
      else sessionStorage.removeItem(PENDING_KEY);
    } catch (e) {
      /* no storage */
    }
  }
  function seatPending() {
    const s = Session.current();
    if (!pending || !s.active || !s.connected || s.info.memberId) return false;
    const m = pending;
    setPending(null);
    State.commit('addPartyMember', [m]);
    Session.claim(m.id);
    return true;
  }
  function characterLoader(note) {
    // a system may have something to tell the player about the character (Sys.memberNotice)
    const noticeFor = (m) => { const t = Sys.memberNotice && Sys.memberNotice(m); if (t) msg.appendChild(el('div', { class: 'small' }, [t])); };
    const file = el('input', { type: 'file', accept: '.json,application/json', hidden: true });
    const msg = el('div', { class: 'muted' }, [pending ? `${pending.name} is ready — they take their seat when you join.` : '']);
    file.addEventListener('change', () => {
      const f = file.files && file.files[0];
      if (!f) return;
      f.text().then((text) => {
        const m = Sys.readCharacter(JSON.parse(text), f.name);
        setPending(m);
        if (!seatPending()) msg.textContent = `${m.name} is ready — they take their seat when you join.`;
        else msg.textContent = `${m.name} is at the table.`;
        noticeFor(m);
      }).catch((e) => (msg.textContent = e.message)).finally(() => (file.value = ''));
    });
    // a system with a creator also makes one here (Sys.makeCharacter): the same walk the site's
    // creator runs, with what the campaign allows, taken to the table like a loaded file
    const maker = el('div', { class: 'play-maker' });
    const seat = (m) => {
      setPending(m);
      maker.innerHTML = '';
      msg.textContent = seatPending() ? `${m.name} is at the table.` : `${m.name} is ready — they take their seat when you join.`;
      noticeFor(m);
    };
    const make = Sys.makeCharacter ? button('Make a character…', () => { if (maker.firstChild) maker.innerHTML = ''; else Sys.makeCharacter(maker, seat, { joined: !!(Session.current().active && Session.current().connected) }); }, 'ghost') : null;
    return el('div', {}, [
      el('div', { class: 'chiprow' }, [button(pending ? 'Load a different character file…' : 'Load my character file…', () => file.click(), 'ghost'), make, el('span', { class: 'muted' }, [note]), file]),
      msg,
      maker,
    ]);
  }

  function joinScreen() {
    const code = el('input', { type: 'text', class: 'text code-input', placeholder: 'Room code', maxlength: '8', autocapitalize: 'characters', value: (params.get('s') || '').toUpperCase() });
    const msg = el('div', { class: 'muted' });
    const go = button('Join', () => {
      const c = code.value.trim().toUpperCase();
      if (!/^[A-Z0-9]{4,8}$/.test(c)) {
        msg.textContent = 'That doesn’t look like a room code.';
        return;
      }
      Session.join(c);
      render();
    });
    return el('div', { class: 'play-card' }, [
      el('h1', {}, ['Join the table']),
      el('p', {}, ['Your GM gave you a room code. Enter it to claim your character — or bring the one you made.']),
      el('div', { class: 'chiprow' }, [code, go]),
      msg,
      characterLoader('made on the site’s character creator; it joins the party when you do'),
      Session.configured() ? null : el('div', { class: 'muted' }, ['Sessions aren’t configured on this deployment yet.']),
    ]);
  }

  function claimScreen(s) {
    const party = State.state.party || [];
    const cards = party.map((m) => {
      const claimed = s.claims[m.id];
      const b = button(claimed ? `Claimed by ${claimed.name}` : 'Claim', () => Session.claim(m.id), claimed ? 'ghost' : '');
      b.disabled = !!claimed;
      // a member of someone's retinue is played by whoever claims its head
      const head = m.retinueOf && party.find((x) => x.id === m.retinueOf);
      const n = party.filter((x) => x.retinueOf === m.id).length;
      return el('div', { class: 'card static' }, [el('div', { class: 'card-name' }, [m.name]), el('div', { class: 'card-sub' }, [Sys.memberSubtitle(m)]),
        head ? el('div', { class: 'muted small' }, ['plays with ' + head.name]) : n ? el('div', { class: 'muted small' }, ['with a retinue of ' + n]) : null, b]);
    });
    return el('div', { class: 'play-card' }, [
      el('h1', {}, ['Who are you?']),
      party.length ? el('div', { class: 'cards' }, cards) : el('p', { class: 'muted' }, [s.connected ? 'The GM hasn’t added any characters yet.' : 'Connecting…']),
      characterLoader('made on the site’s character creator'),
    ]);
  }

  const PHONE = window.matchMedia('(max-width: 640px)');
  let menuOpen = null;   // the player's own choice, kept across redraws
  let playing = null;    // which of the player's characters is on screen: the claimed one or one of its retinue
  function sheetScreen(s) {
    const party = State.state.party || [];
    const head = party.find((x) => x.id === s.info.memberId);
    if (!head) return el('div', { class: 'play-card' }, [el('p', { class: 'muted' }, ['Your character isn’t in the party any more.'])]);
    // the claimed character, then its retinue (engine/ops.js retinue): one player, the whole household
    const mine = [head].concat(party.filter((x) => x.retinueOf === head.id && x.id !== head.id));
    const m = mine.find((x) => x.id === playing) || head;
    playing = m.id;
    const who = mine.length > 1 ? el('div', { class: 'chiprow tight play-who', role: 'tablist', 'aria-label': 'Your characters' }, mine.map((x) =>
      el('button', { type: 'button', class: 'btn tiny' + (x.id === m.id ? '' : ' ghost'), 'aria-selected': String(x.id === m.id), onclick: () => { playing = x.id; render(); window.scrollTo(0, 0); } }, [x.name]))) : null;
    const bar = el('div', { class: 'chiprow play-bar' }, [
      el('a', { class: 'btn ghost', href: CFG.pages.table + '?view=player', target: (CFG.channel || 'vtt') + '-player' }, ['Open the table']),
      // relationship and scene maps (system/vtm5e/maps.js), where the system has them
      CFG.pages.maps ? el('a', { class: 'btn ghost', href: CFG.pages.maps + '?view=player', target: (CFG.channel || 'vtt') + '-maps' }, ['Open the maps']) : null,
      button('Download my character', () => Sys.downloadCharacter(m), 'ghost'),   // as played, right now — the file the join screen takes back
      button('Release character', () => Session.unclaim(head.id), 'ghost'),
    ]);
    // everyone's rolls and named actions, newest first — the GM's log as the room shares it
    const feedItems = (State.state.log || []).slice(-10).reverse();
    const feed = el('section', { class: 'table-feed' }, [
      el('h4', {}, ['At the table', el('span', { class: 'muted' }, [feedItems.length ? '' : ' · nothing rolled yet'])]),
      el('div', { class: 'roll-log' }, feedItems.map((x) => x.kind === 'roll' && Sys.rollLine ? Sys.rollLine(x) : el('div', { class: 'roll-line' + (x.kind === 'roll' ? '' : ' action') }, [x.text || `${x.who || ''} · ${x.axis || ''} ${x.band || ''}`.trim()]))),
    ]);
    const clocks = (State.state.clocks || []).filter((c) => c.visible !== false);
    const strip = clocks.length ? el('div', { class: 'clock-strip' }, clocks.map((c) => el('div', { class: 'clock-row' }, [el('div', { class: 'track-head' }, [el('span', { class: 'track-name' }, [c.name]), el('span', { class: 'muted' }, [`${c.filled} / ${c.segments}`])]), el('div', { class: 'boxes clock' }, Array.from({ length: c.segments }, (_, i) => el('span', { class: 'box' + (i < c.filled ? ' on' : '') })))]))) : null;
    // on a phone the three fold into one line (assets/css/vtm5e-gm.css); wider, they stand open as before
    const menu = el('details', { class: 'play-menu', open: (menuOpen != null ? menuOpen : !PHONE.matches) || null }, [el('summary', {}, ['Table · file · release']), bar]);
    menu.addEventListener('toggle', () => { menuOpen = menu.open; });
    return el('div', { class: 'play-card wide' }, [who, menu, strip, feed, Sys.liveSheet(m, { player: true })]);
  }

  function render() {
    const s = Session.current();
    status(s);
    if (document.activeElement && /TEXTAREA|INPUT/.test(document.activeElement.tagName) && main.contains(document.activeElement)) return;
    main.innerHTML = '';
    if (s.active && !s.connected) {
      main.appendChild(el('div', { class: 'banner warn' }, [
        el('b', {}, [s.status === 'connecting' ? 'Connecting to the table…' : 'Lost the table — reconnecting…']),
        ' What you change now reaches the GM when the connection is back. ',
        button('Retry now', () => Session.reconnect(), 'ghost tiny'),
      ]));
    }
    if (!s.active) main.appendChild(joinScreen());
    else if (!s.info.memberId) main.appendChild(claimScreen(s));
    else main.appendChild(sheetScreen(s));
  }

  Session.onChange(() => {
    seatPending();     // a character loaded before joining takes its seat once the room is online
    render();
  });
  Bus.on('state:remote', () => render());
  Bus.on('state:changed', () => render());
  Bus.on('session:error', (p) => {
    const note = el('div', { class: 'muted session-error' }, [p.message]);
    main.prepend(note);
    setTimeout(() => note.remove(), 4000);
  });

  document.addEventListener('keydown', (ev) => {
    if (!(ev.ctrlKey || ev.metaKey) || ev.key.toLowerCase() !== 'z' || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    ev.preventDefault();
    if (ev.shiftKey) State.redo();
    else State.undo();
  });

  render();
  // a join link names its room: follow it, even from a room this browser is still in
  const linked = params.get('s') && String(params.get('s')).toUpperCase();
  if (linked && (!Session.current().active || Session.current().info.code !== linked)) {
    if (Session.current().active) Session.leave();
    Session.join(linked);
    render();
  }
})();
