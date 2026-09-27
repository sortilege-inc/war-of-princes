// campaign/site/play-import.js — the old household page's trackers, carried into play once.
//
// Before the VTT, the household page kept each character's marks in this browser, under
// "wop.table.v1" (a page at the same origin, so its storage is readable here):
//   { <old id>: { health: [0|1|2 …], willpower: [0|1|2 …], hunger, road: { rating, stains },
//                 xp: { earned, spent }, notes } }
// where 1 is a Superficial box and 2 an Aggravated one. When this browser's player has claimed a
// character, each of their characters (the claimed one and its retinue) that the old page tracked
// takes those marks - once: "wop.table.v1.imported" remembers it, and a mark left at its empty
// value is not sent. Loaded at the `play` stage (engine/instance.js). INSTANCES.md, step 4.
(function () {
  const OLD = 'wop.table.v1';
  const DONE = OLD + '.imported';
  // the old page's ids → this table's (campaign/build/build_seed.py)
  const IDS = { tomi: 'wop-tomislawa', graf: 'wop-graf', kuncze: 'wop-kuncze', bartusz: 'wop-bartusz', andrzej: 'wop-andrzej',
    przeclaw: 'wop-przeclaw', tomasz: 'wop-tomasz', milosz: 'wop-milosz', elzbieta: 'wop-elzbieta', bronislawa: 'wop-bronislawa',
    bogdan: 'wop-bogdan', dobrawa: 'wop-dobrawa', wojtek: 'wop-wojtek' };
  const read = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const boxes = (arr) => ({ sup: (arr || []).filter((x) => x === 1).length, agg: (arr || []).filter((x) => x === 2).length });

  function carry() {
    const S = window.VttSession && window.VttSession.current();
    if (!S || !S.connected || !S.info || !S.info.memberId || read(DONE)) return;
    let old;
    try { old = JSON.parse(read(OLD) || 'null'); } catch (e) { old = null; }
    if (!old || typeof old !== 'object') return;
    const party = (window.VttState.state.party || []);
    const mine = new Set([S.info.memberId].concat(party.filter((m) => m.retinueOf === S.info.memberId).map((m) => m.id)));
    let n = 0;
    Object.keys(IDS).forEach((oldId) => {
      const t = old[oldId];
      const m = party.find((x) => x.id === IDS[oldId]);
      if (!t || !m || !mine.has(m.id)) return;
      const patch = {};
      const h = boxes(t.health), w = boxes(t.willpower);
      if (h.sup || h.agg) patch.health = h;
      if (w.sup || w.agg) patch.willpower = w;
      if (t.hunger != null && t.hunger !== ((m.live || {}).hunger || 0)) patch.hunger = t.hunger;
      if (t.road && t.road.stains) patch.stains = t.road.stains;
      if (t.road && t.road.rating != null && t.road.rating !== (m.character || {})['Road Rating']) patch.sheet = Object.assign({}, m.character, (m.live || {}).sheet, { 'Road Rating': t.road.rating });
      if (t.xp && (t.xp.earned || t.xp.spent)) { patch.xpEarned = t.xp.earned || 0; patch.xpSpent = t.xp.spent || 0; }
      if (Object.keys(patch).length) {
        window.VttState.commit('setPartyLive', [m.id, patch]);
        window.VttState.commit('appendLog', [{ at: Date.now(), kind: 'track', memberId: m.id, who: m.name, changes: [], cause: 'carried over from the old household page' }]);
        n++;
      }
      if (t.notes && !m.playerNotes) window.VttState.commit('setPartyPlayerNotes', [m.id, t.notes]);
    });
    try { localStorage.setItem(DONE, new Date().toISOString() + ' · ' + n + ' character(s)'); } catch (e) { /* no storage */ }
  }
  const wait = () => (window.VttSession ? window.VttSession.onChange(carry) : setTimeout(wait, 200));
  wait();
})();
