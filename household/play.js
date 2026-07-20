/* ============================================================
   The Table — interactive play layer (household characters only)
   Implements the V5 mechanics compiled in
   ../rules/vtm5e-war-of-princes.resolved.json :
     - dice pool (Attribute + Skill), success on 6+, criticals on
       pairs of 10s (+2 each pair), Hunger dice, messy criticals,
       bestial failures, Willpower re-roll (up to 3 non-Hunger dice)
     - Willpower & Health tracks (superficial / aggravated + mend)
     - Road morality track (in place of Humanity) for Tomisława
   Tracker state persists in localStorage and exports/imports as JSON.
   ============================================================ */
(function () {
  "use strict";

  var ATTR_ORDER = ["Strength","Dexterity","Stamina","Charisma","Manipulation","Composure","Intelligence","Wits","Resolve"];

  // Character data extracted from the household dossier, augmented with
  // Road/Hunger/Blood Potency (Tomisława) and the Graf's one Discipline.
  var CHARACTERS = [
    { id:"tomi", name:"Tomisława z Białowieży", type:"vampire", section:"household",
      health:5, willpower:5, hunger:1, bloodPotency:2,
      road:{ name:"Road of Kings", aura:"Via Regalis", rating:7, guideline:"Behaving shamefully before your peers" },
      attributes:{Strength:2,Dexterity:2,Stamina:2,Charisma:2,Manipulation:4,Composure:3,Intelligence:3,Wits:1,Resolve:2},
      skills:{Etiquette:3,Intimidation:3,Leadership:3,Politics:3,Occult:4,Persuasion:2,Subterfuge:2,Survival:2,Craft:2,Academics:1,Medicine:1},
      disciplines:[{name:"Dominate",rating:2,powers:["Compel","Domitor's Favor"]},{name:"Protean",rating:2,powers:["Eyes of the Beast","Vicissitude (Fleshcrafting)"]},{name:"Blood Sorcery (Koldunic)",rating:3,powers:["Koldunic Sorcery — Earth","Koldunic Sorcery — Water","Koldunic Sorcery — Air"]}] },

    { id:"graf", name:"Graf Światosław", type:"ghoul", section:"household",
      health:5, willpower:5,
      attributes:{Strength:3,Dexterity:2,Stamina:3,Charisma:3,Manipulation:1,Composure:4,Intelligence:2,Wits:2,Resolve:2},
      skills:{Athletics:3,"Animal Ken":3,Archery:3,Brawl:2,Melee:2,Riding:2,Awareness:2,Intimidation:2,Etiquette:1,Leadership:1,Politics:1,Finance:1,Medicine:1,Academics:1,Science:1},
      disciplines:[{name:"Dominate",rating:1,powers:["Cloud Memory"]}] },

    { id:"kuncze", name:"Kuncze", type:"mortal", section:"allies",
      attributes:{Strength:3,Dexterity:2,Stamina:3,Charisma:1,Manipulation:1,Composure:2,Intelligence:1,Wits:1,Resolve:2},
      skills:{Athletics:3,Melee:3,Intimidation:3,Survival:2,Etiquette:2}, disciplines:[] },
    { id:"bartusz", name:"Bartusz", type:"mortal", section:"allies",
      attributes:{Strength:1,Dexterity:1,Stamina:1,Charisma:3,Manipulation:2,Composure:3,Intelligence:1,Wits:2,Resolve:2},
      skills:{"Animal Ken":3,Etiquette:3,Riding:3,Medicine:2,Persuasion:2,Craft:2}, disciplines:[] },
    { id:"andrzej", name:"Andrzej", type:"mortal", section:"allies",
      attributes:{Strength:1,Dexterity:2,Stamina:1,Charisma:1,Manipulation:2,Composure:1,Intelligence:3,Wits:3,Resolve:2},
      skills:{Awareness:3,Investigation:3,Survival:3,Insight:2,Larceny:2,"Animal Ken":2,Subterfuge:2}, disciplines:[] },
    { id:"piers", name:"Piers", type:"mortal", section:"allies",
      attributes:{Strength:3,Dexterity:3,Stamina:2,Charisma:1,Manipulation:1,Composure:2,Intelligence:1,Wits:2,Resolve:1},
      skills:{Archery:3,Awareness:3,Survival:3,"Animal Ken":2,Athletics:2,Streetwise:2}, disciplines:[] },

    { id:"przeclaw", name:"Przecław", type:"mortal", section:"herd",
      attributes:{Strength:2,Dexterity:1,Stamina:1,Charisma:1,Manipulation:3,Composure:2,Intelligence:3,Wits:2,Resolve:1},
      skills:{Etiquette:3,Finance:3,Politics:3,Larceny:2,Leadership:2,Persuasion:2,Subterfuge:2,Insight:1,Riding:1,Intimidation:1,Melee:1,Archery:1}, disciplines:[] },
    { id:"tomasz", name:"Tomasz", type:"mortal", section:"herd",
      attributes:{Strength:1,Dexterity:2,Stamina:1,Charisma:1,Manipulation:1,Composure:1,Intelligence:1,Wits:1,Resolve:2},
      skills:{Brawl:2,Etiquette:2,Performance:2,Athletics:1,Awareness:1,Riding:1,Larceny:1,Archery:1}, disciplines:[] },
    { id:"milosz", name:"Miłosz", type:"mortal", section:"herd",
      attributes:{Strength:1,Dexterity:2,Stamina:3,Charisma:2,Manipulation:2,Composure:1,Intelligence:1,Wits:1,Resolve:3},
      skills:{Athletics:3,Riding:3,Survival:3,Etiquette:2,Performance:2,Persuasion:2,Politics:2,"Animal Ken":1,Brawl:1,Insight:1,Technology:1,Archery:1}, disciplines:[] },
    { id:"elzbieta", name:"Elżbieta", type:"mortal", section:"herd",
      attributes:{Strength:1,Dexterity:1,Stamina:1,Charisma:2,Manipulation:3,Composure:2,Intelligence:1,Wits:3,Resolve:2},
      skills:{Etiquette:3,Insight:3,Occult:3,Investigation:2,Larceny:2,Politics:2,Subterfuge:2,Athletics:1,Brawl:1,Performance:1,Persuasion:1,Streetwise:1}, disciplines:[] },
    { id:"bronislawa", name:"Bronisława", type:"mortal", section:"herd",
      attributes:{Strength:1,Dexterity:2,Stamina:1,Charisma:1,Manipulation:2,Composure:3,Intelligence:3,Wits:2,Resolve:1},
      skills:{Etiquette:3,Craft:3,Performance:3,Awareness:2,Insight:2,Leadership:2,Persuasion:2,Investigation:1,Medicine:1,Occult:1,Stealth:1,Subterfuge:1}, disciplines:[] },
    { id:"bogdan", name:"Bogdan", type:"mortal", section:"herd",
      attributes:{Strength:2,Dexterity:1,Stamina:3,Charisma:1,Manipulation:2,Composure:3,Intelligence:1,Wits:2,Resolve:1},
      skills:{"Animal Ken":3,Awareness:3,Riding:3,Streetwise:2,Survival:2,Subterfuge:2,Technology:2,Brawl:1,Etiquette:1,Intimidation:1,Larceny:1,Melee:1}, disciplines:[] },
    { id:"dobrawa", name:"Dobrawa", type:"mortal", section:"herd",
      attributes:{Strength:3,Dexterity:2,Stamina:3,Charisma:2,Manipulation:1,Composure:1,Intelligence:1,Wits:1,Resolve:2},
      skills:{Craft:3,Investigation:3,Subterfuge:3,"Animal Ken":2,Intimidation:2,Larceny:2,Stealth:2,Awareness:1,Finance:1,Leadership:1,Medicine:1,Science:1}, disciplines:[] },
    { id:"wojtek", name:"Wojtek", type:"mortal", section:"herd",
      attributes:{Strength:1,Dexterity:2,Stamina:1,Charisma:1,Manipulation:1,Composure:1,Intelligence:1,Wits:2,Resolve:1},
      skills:{"Animal Ken":2,Craft:2,Streetwise:2,Awareness:1,Finance:1,Medicine:1,Larceny:1,Stealth:1}, disciplines:[] }
  ];
  var BY_ID = {};
  CHARACTERS.forEach(function (c) {
    c.maxHealth = c.health || (c.attributes.Stamina + 3);       // V5: Stamina + 3
    c.maxWillpower = c.willpower || (c.attributes.Resolve + c.attributes.Composure); // Resolve + Composure
    BY_ID[c.id] = c;
  });

  var SECTIONS = [["household","The Household"],["allies","The Four Allies"],["herd","The Herd"]];
  var STORE_KEY = "wop.table.v1";

  // ---- persistent tracker state -----------------------------------------
  var state = load();
  function blankState(c) {
    return {
      health: new Array(c.maxHealth).fill(0),      // 0 empty, 1 superficial, 2 aggravated
      willpower: new Array(c.maxWillpower).fill(0),
      hunger: (c.type === "vampire") ? (c.hunger || 0) : null,
      road: c.road ? { rating: c.road.rating, stains: 0 } : null,
      xp: (c.type === "vampire") ? { earned: 0, spent: 0 } : null
    };
  }
  function ensure(c) {
    var s = state[c.id];
    if (!s) { s = state[c.id] = blankState(c); }
    // keep track lengths in sync with sheet
    if (s.health.length !== c.maxHealth) s.health = resize(s.health, c.maxHealth);
    if (s.willpower.length !== c.maxWillpower) s.willpower = resize(s.willpower, c.maxWillpower);
    if (c.type === "vampire" && (s.hunger === null || s.hunger === undefined)) s.hunger = c.hunger || 0;
    if (c.road && !s.road) s.road = { rating: c.road.rating, stains: 0 };
    if (c.type === "vampire" && !s.xp) s.xp = { earned: 0, spent: 0 };
    return s;
  }
  function resize(arr, n) { var out = new Array(n).fill(0); for (var i=0;i<Math.min(arr.length,n);i++) out[i]=arr[i]; return out; }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {} }
  function load() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; } }

  // ---- dice ------------------------------------------------------------
  function d10() { return 1 + Math.floor(Math.random() * 10); }
  function rollPool(regular, hunger) {
    var dice = [];
    for (var i=0;i<regular;i++) dice.push({ v:d10(), hunger:false, rerolled:false });
    for (var j=0;j<hunger;j++) dice.push({ v:d10(), hunger:true, rerolled:false });
    return dice;
  }
  function tally(dice) {
    var succ = 0, tens = 0, hungerTens = 0, hungerOnes = 0;
    dice.forEach(function (d) {
      if (d.v >= 6) succ++;
      if (d.v === 10) { tens++; if (d.hunger) hungerTens++; }
      if (d.v === 1 && d.hunger) hungerOnes++;
    });
    var critPairs = Math.floor(tens / 2);
    var total = succ + critPairs * 2;               // each pair of 10s = +2 bonus
    return {
      successes: total,
      critPairs: critPairs,
      messy: critPairs >= 1 && hungerTens >= 1,
      bestial: hungerOnes >= 1,
      hungerOnes: hungerOnes
    };
  }

  // ---- rendering -------------------------------------------------------
  var root, drawer, bodyEl, selectEl;
  var current = CHARACTERS[0].id;
  var lastRoll = null; // { char, dice, wpRerollsUsed, mode, label, applied }
  var rollOutEl = null; // current roll-output container (set by roller)

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  function build() {
    var btn = el("button", "pl-toggle");
    btn.innerHTML = '<span class="pl-die">&#9860;</span> The Table';
    btn.addEventListener("click", function () { drawer.classList.toggle("open"); });

    drawer = el("aside", "pl-drawer");
    var head = el("div", "pl-head");
    head.appendChild(el("span", "pl-title", "The Table"));
    var impBtn = el("button", "pl-iconbtn", "&#8681;"); impBtn.title = "Import JSON";
    var expBtn = el("button", "pl-iconbtn", "&#8679;"); expBtn.title = "Export JSON";
    var closeBtn = el("button", "pl-iconbtn", "&times;"); closeBtn.title = "Close";
    impBtn.addEventListener("click", doImport);
    expBtn.addEventListener("click", doExport);
    closeBtn.addEventListener("click", function () { drawer.classList.remove("open"); });
    head.appendChild(impBtn); head.appendChild(expBtn); head.appendChild(closeBtn);
    drawer.appendChild(head);

    bodyEl = el("div", "pl-body");
    selectEl = el("select", "pl-select");
    SECTIONS.forEach(function (sec) {
      var group = el("optgroup"); group.label = sec[1];
      CHARACTERS.filter(function (c) { return c.section === sec[0]; }).forEach(function (c) {
        var o = el("option"); o.value = c.id; o.textContent = c.name; group.appendChild(o);
      });
      selectEl.appendChild(group);
    });
    selectEl.value = current;
    selectEl.addEventListener("change", function () { current = selectEl.value; lastRoll = null; renderChar(); });
    bodyEl.appendChild(selectEl);

    var charWrap = el("div", "pl-charwrap");
    bodyEl.appendChild(charWrap);
    drawer.appendChild(bodyEl);

    document.body.appendChild(btn);
    document.body.appendChild(drawer);
    renderChar();
  }

  function renderChar() {
    var c = BY_ID[current];
    var s = ensure(c);
    var w = drawer.querySelector(".pl-charwrap");
    w.innerHTML = "";

    var typeLabel = c.type === "vampire" ? "Tzimisce · Kindred" : (c.type === "ghoul" ? "Ghoul · Retainer" : "Mortal");
    w.appendChild(el("div", "pl-chartype", typeLabel));

    // ---- trackers
    w.appendChild(sectionLabel("Health", "Superficial · Aggravated"));
    w.appendChild(boxTrack(c, s, "health"));
    w.appendChild(sectionLabel("Willpower", "click to mark / clear"));
    w.appendChild(boxTrack(c, s, "willpower"));

    if (c.type === "vampire") {
      w.appendChild(sectionLabel("Hunger", "0–5"));
      w.appendChild(hungerRow(c, s));
    }
    if (c.road) {
      w.appendChild(sectionLabel("Road", c.road.aura));
      w.appendChild(roadBlock(c, s));
    }
    if (c.type === "vampire") {
      w.appendChild(sectionLabel("Experience", "earned · spent"));
      w.appendChild(xpBlock(c, s));
    }

    // ---- disciplines (display only)
    if (c.disciplines && c.disciplines.length) {
      w.appendChild(sectionLabel("Disciplines", ""));
      var dl = el("div", "pl-disc");
      dl.innerHTML = c.disciplines.map(function (d) {
        return "<b>" + d.name + " " + dots(d.rating) + "</b> — " + d.powers.join(", ");
      }).join("<br>");
      w.appendChild(dl);
    }

    // ---- dice roller
    w.appendChild(sectionLabel("Roll", "Attribute + Skill / Discipline"));
    w.appendChild(roller(c, s));
  }

  function xpBlock(c, s) {
    var wrap = el("div", "pl-track");
    var avail = el("div", "pl-track-note");
    function updateAvail() { avail.textContent = (s.xp.earned - s.xp.spent) + " available"; }
    function stepper(label, key) {
      var row = el("div", "pl-stepper"); row.style.marginBottom = "0.3rem";
      var minus = el("button", null, "−"), val = el("span", "pl-val", String(s.xp[key])), plus = el("button", null, "+");
      row.appendChild(el("span", "pl-sub", label)); row.appendChild(minus); row.appendChild(val); row.appendChild(plus);
      minus.addEventListener("click", function () { s.xp[key] = Math.max(0, s.xp[key] - 1); val.textContent = s.xp[key]; updateAvail(); save(); });
      plus.addEventListener("click", function () { s.xp[key] += 1; val.textContent = s.xp[key]; updateAvail(); save(); });
      return row;
    }
    wrap.appendChild(stepper("Earned", "earned"));
    wrap.appendChild(stepper("Spent", "spent"));
    updateAvail();
    wrap.appendChild(avail);
    return wrap;
  }

  function sectionLabel(txt, sub) {
    var e = el("div", "pl-lbl");
    e.appendChild(el("span", null, txt));
    if (sub) e.appendChild(el("span", "pl-sub", sub));
    return e;
  }
  function dots(n) { return new Array(n + 1).join("●"); }

  function boxTrack(c, s, key) {
    var wrap = el("div", "pl-track");
    wrap.setAttribute("data-track", key);
    var boxes = el("div", "pl-boxes");
    var arr = s[key];
    arr.forEach(function (v, i) {
      var b = el("button", "pl-box");
      paintBox(b, v);
      b.addEventListener("click", function () {
        arr[i] = (arr[i] + 1) % 3;
        paintBox(b, arr[i]);
        updateTrackNote(wrap, arr);
        save();
      });
      boxes.appendChild(b);
    });
    wrap.appendChild(boxes);
    var note = el("div", "pl-track-note");
    wrap.appendChild(note);
    updateTrackNote(wrap, arr);
    return wrap;
  }
  function paintBox(b, v) {
    b.className = "pl-box" + (v === 1 ? " superficial" : v === 2 ? " aggravated" : "");
    b.innerHTML = v === 1 ? '<span class="pl-mark">/</span>' : v === 2 ? '<span class="pl-mark">✕</span>' : "";
  }
  function updateTrackNote(wrap, arr) {
    var sup = arr.filter(function (v) { return v === 1; }).length;
    var agg = arr.filter(function (v) { return v === 2; }).length;
    var free = arr.length - sup - agg;
    var note = wrap.querySelector(".pl-track-note");
    var msg = sup + " superficial · " + agg + " aggravated · " + free + " unmarked";
    if (free === 0 && arr.length) msg += (agg === arr.length ? " — incapacitated / torpor" : " — Impaired");
    note.textContent = msg;
  }
  // repaint a tracker's boxes in place (used after a Willpower spend, so the
  // dice animation isn't torn down by a full re-render)
  function refreshTrack(key, s) {
    var wrap = drawer.querySelector('.pl-track[data-track="' + key + '"]');
    if (!wrap) return;
    var boxes = wrap.querySelectorAll(".pl-box");
    s[key].forEach(function (v, i) { if (boxes[i]) paintBox(boxes[i], v); });
    updateTrackNote(wrap, s[key]);
  }

  function hungerRow(c, s) {
    var wrap = el("div", "pl-track"); wrap.setAttribute("data-track", "hunger");
    var pips = el("div", "pl-pips");
    function paint() {
      pips.innerHTML = "";
      for (var i = 1; i <= 5; i++) {
        var p = el("button", "pl-pip" + (i <= s.hunger ? " on" : ""));
        (function (val) {
          p.addEventListener("click", function () { s.hunger = (s.hunger === val ? val - 1 : val); paint(); save(); });
        })(i);
        pips.appendChild(p);
      }
    }
    paint();
    wrap.appendChild(pips);
    return wrap;
  }
  function refreshHunger() {
    var c = BY_ID[current], s = ensure(c);
    var old = drawer.querySelector('.pl-track[data-track="hunger"]');
    if (old) old.replaceWith(hungerRow(c, s));
  }
  function refreshRoad() {
    var c = BY_ID[current], s = ensure(c);
    var old = drawer.querySelector('.pl-track[data-track="road"]');
    if (old) old.replaceWith(roadBlock(c, s));
  }

  function roadBlock(c, s) {
    var wrap = el("div", "pl-track"); wrap.setAttribute("data-track", "road");
    wrap.appendChild(el("div", "pl-road-name", c.road.name + " · " + s.road.rating));
    // rating pips 0..10
    var pips = el("div", "pl-pips");
    for (var i = 1; i <= 10; i++) {
      var p = el("button", "pl-pip road" + (i <= s.road.rating ? " on" : ""));
      (function (val) {
        p.addEventListener("click", function () { s.road.rating = (s.road.rating === val ? val - 1 : val); save(); refreshRoad(); });
      })(i);
      pips.appendChild(p);
    }
    wrap.appendChild(pips);
    // stains stepper
    var st = el("div", "pl-stepper"); st.style.marginTop = "0.5rem";
    var minus = el("button", null, "−"), val = el("span", "pl-val", String(s.road.stains)), plus = el("button", null, "+");
    st.appendChild(el("span", "pl-sub", "Stains")); st.appendChild(minus); st.appendChild(val); st.appendChild(plus);
    minus.addEventListener("click", function () { s.road.stains = Math.max(0, s.road.stains - 1); val.textContent = s.road.stains; save(); });
    plus.addEventListener("click", function () { s.road.stains += 1; val.textContent = s.road.stains; save(); });
    wrap.appendChild(st);
    wrap.appendChild(el("div", "pl-road-guide", "“" + c.road.guideline + "”"));
    return wrap;
  }

  function roller(c, s) {
    var wrap = el("div", "pl-roller");

    // ---- quick checks (preset pools) ----
    var qa = el("div", "pl-quick");
    function qbtn(label, fn) { var b = el("button", "pl-qbtn", label); b.addEventListener("click", fn); qa.appendChild(b); }
    if (c.type === "vampire") {
      qbtn("Rouse", function () { doRouse(c, s); });
      qbtn("Predator", function () { commitPool(c, s, (c.attributes.Intelligence || 0) + (c.skills.Leadership || 0), "Predator — Intelligence + Leadership"); });
      qbtn("Frenzy", function () { commitPool(c, s, c.maxWillpower, "Frenzy Resistance — Willpower"); });
      if (c.road) qbtn("Remorse", function () { doRemorse(c, s); });
    }
    qbtn("Willpower", function () { commitPool(c, s, (c.attributes.Resolve || 0) + (c.attributes.Composure || 0), "Willpower — Resolve + Composure"); });
    wrap.appendChild(qa);

    // ---- pool builder (Attribute + Skill / Discipline) ----
    var pick = el("div", "pl-pick");
    var aSel = el("select"), sSel = el("select");
    aSel.appendChild(optu("— Attribute —", ""));
    ATTR_ORDER.forEach(function (a) { if (c.attributes[a] != null) aSel.appendChild(optu(a + " (" + c.attributes[a] + ")", a)); });
    sSel.appendChild(optu("— Skill / Discipline —", ""));
    var gS = document.createElement("optgroup"); gS.label = "Skills";
    Object.keys(c.skills).sort().forEach(function (sk) { gS.appendChild(optu(sk + " (" + c.skills[sk] + ")", "s:" + sk)); });
    sSel.appendChild(gS);
    if (c.disciplines && c.disciplines.length) {
      var gD = document.createElement("optgroup"); gD.label = "Disciplines / Rituals";
      c.disciplines.forEach(function (d) { gD.appendChild(optu(d.name + " (" + d.rating + ")", "d:" + d.name)); });
      sSel.appendChild(gD);
    }
    pick.appendChild(aSel); pick.appendChild(sSel);
    wrap.appendChild(pick);

    // modifier + pool total
    var poolrow = el("div", "pl-poolrow");
    var step = el("div", "pl-stepper");
    var mMinus = el("button", null, "−"), mVal = el("span", "pl-val", "0"), mPlus = el("button", null, "+");
    step.appendChild(el("span", "pl-sub", "Mod")); step.appendChild(mMinus); step.appendChild(mVal); step.appendChild(mPlus);
    var total = el("span", "pl-pool-total");
    var hungerNote = el("span", "pl-hungernote");
    poolrow.appendChild(step); poolrow.appendChild(total); poolrow.appendChild(hungerNote);
    wrap.appendChild(poolrow);

    var mod = 0;
    function secondVal() {
      var v = sSel.value; if (!v) return 0;
      if (v.indexOf("s:") === 0) return c.skills[v.slice(2)] || 0;
      if (v.indexOf("d:") === 0) { var d = c.disciplines.filter(function (x) { return x.name === v.slice(2); })[0]; return d ? d.rating : 0; }
      return 0;
    }
    function pool() { var a = aSel.value ? c.attributes[aSel.value] : 0; return Math.max(0, a + secondVal() + mod); }
    function refresh() {
      var p = pool();
      var hd = (c.type === "vampire") ? Math.min(s.hunger || 0, p) : 0;
      total.innerHTML = "Pool <b>" + p + "</b>";
      hungerNote.textContent = hd ? (hd + " hunger " + (hd === 1 ? "die" : "dice")) : "";
    }
    aSel.addEventListener("change", refresh); sSel.addEventListener("change", refresh);
    mMinus.addEventListener("click", function () { mod--; mVal.textContent = mod; refresh(); });
    mPlus.addEventListener("click", function () { mod++; mVal.textContent = mod; refresh(); });
    refresh();

    var rollBtn = el("button", "pl-rollbtn", "Roll");
    wrap.appendChild(rollBtn);
    var out = el("div", "pl-out");
    wrap.appendChild(out);
    rollOutEl = out;

    rollBtn.addEventListener("click", function () {
      var a = aSel.value, sTxt = sSel.value ? sSel.options[sSel.selectedIndex].text.replace(/\s*\(\d+\)$/, "") : "";
      var label = (a && sTxt) ? (a + " + " + sTxt) : (a || sTxt || "Roll");
      commitPool(c, s, pool(), label);
    });

    if (lastRoll && lastRoll.char === c.id) renderRoll(out, c, s, []); // settled, no animation on rebuild
    return wrap;
  }

  // build dice for a straight pool (Hunger dice for vampires) and roll
  function commitPool(c, s, n, label) {
    var hd = (c.type === "vampire") ? Math.min(s.hunger || 0, n) : 0;
    commitRoll(c, s, rollPool(n - hd, hd), "pool", label);
  }
  function commitRoll(c, s, dice, mode, label) {
    lastRoll = { char: c.id, dice: dice, wpRerollsUsed: (mode === "rouse" || mode === "remorse") ? 1 : 0, mode: mode, label: label, applied: false };
    renderRoll(rollOutEl, c, s); // animate the whole pool
  }
  function doRouse(c, s) {
    var v = d10(), failed = v < 6;
    if (failed) { s.hunger = Math.min(5, (s.hunger || 0) + 1); save(); refreshHunger(); }
    commitRoll(c, s, [{ v: v, hunger: false, rerolled: false }], "rouse", "Rouse Check");
  }
  function doRemorse(c, s) {
    var n = Math.max(1, 10 - s.road.rating - s.road.stains);
    var dice = []; for (var i = 0; i < n; i++) dice.push({ v: d10(), hunger: false, rerolled: false });
    commitRoll(c, s, dice, "remorse", "Remorse — " + n + (n === 1 ? " die" : " dice"));
  }

  // per-die styling for the animated dice (success / critical / bestial)
  function classifyDie(die) {
    var cls = [];
    if (die.value >= 6) cls.push("succ");
    if (die.value === 10) cls.push("crit");
    if (die.tag === "hunger" && die.value === 1) cls.push("bestial");
    return cls.join(" ");
  }

  function renderRoll(out, c, s, animateOnly) {
    out.innerHTML = "";
    var stage = el("div", "pl-stage");
    var score = el("div", "pl-score");
    out.appendChild(stage);
    out.appendChild(score);

    var specs = lastRoll.dice.map(function (d) {
      return { sides: 10, value: d.v, tag: d.hunger ? "hunger" : "", rerolled: d.rerolled };
    });
    Dice.roll({
      mount: stage,
      dice: specs,
      shape: "d10",                      // pentagonal-trapezohedron faces
      animateOnly: animateOnly,          // undefined = animate all, [] = none, [i…] = subset
      duration: 600,
      stagger: 45,
      classify: classifyDie,
      onSettle: function () { drawScore(score, out, c, s); }
    });
  }

  function drawScore(score, out, c, s) {
    score.innerHTML = "";
    if (lastRoll.label) score.appendChild(el("div", "pl-rolllabel", lastRoll.label));
    if (lastRoll.mode === "rouse") return drawRouse(score, c, s);
    if (lastRoll.mode === "remorse") return drawRemorse(score, c, s);

    var dice = lastRoll.dice;
    var t = tally(dice);

    var res = el("div", "pl-result");
    res.innerHTML = '<span class="pl-succcount">' + t.successes + '</span> <span class="pl-succlabel">' + (t.successes === 1 ? "success" : "successes") + '</span>';
    score.appendChild(res);

    var flags = el("div", "pl-flags");
    if (t.successes === 0) {
      flags.appendChild(el("span", "pl-flag bestial", t.bestial ? "Bestial Failure" : "Total Failure"));
    } else if (t.messy) {
      flags.appendChild(el("span", "pl-flag messy", "Messy Critical"));
    } else if (t.critPairs >= 1) {
      flags.appendChild(el("span", "pl-flag crit", "Critical"));
    }
    score.appendChild(flags);

    // Willpower re-roll: up to 3 non-Hunger dice, once per roll
    var canReroll = lastRoll.wpRerollsUsed === 0 && dice.some(function (d) { return !d.hunger; });
    var rr = el("button", "pl-subbtn", "Willpower re-roll (≤3 dice, −1 WP)");
    rr.style.marginTop = "0.6rem";
    if (!canReroll) rr.setAttribute("disabled", "disabled");
    rr.addEventListener("click", function () {
      var idxs = [];
      dice.forEach(function (d, i) { if (!d.hunger && d.v < 6) idxs.push(i); });
      dice.forEach(function (d, i) { if (!d.hunger && d.v >= 6 && idxs.length < 3) idxs.push(i); });
      idxs = idxs.slice(0, 3);
      idxs.forEach(function (i) { dice[i].v = d10(); dice[i].rerolled = true; });
      lastRoll.wpRerollsUsed = 1;
      markWillpowerSpent(c, s);
      refreshTrack("willpower", s);       // update WP boxes in place (don't tear down the roll)
      renderRoll(out, c, s, idxs);         // re-animate only the rerolled dice
    });
    score.appendChild(rr);
  }

  function drawRouse(score, c, s) {
    var v = lastRoll.dice[0].v, ok = v >= 6;
    var res = el("div", "pl-result");
    res.innerHTML = ok
      ? '<span class="pl-succlabel">Success — no Hunger gained</span>'
      : '<span class="pl-succlabel">Failure — <b style="color:var(--pl-blood-pale)">Hunger +1</b></span>';
    score.appendChild(res);
    score.appendChild(el("div", "pl-io-note", "A Rouse Check covers waking, mending, Blood Surge, activating powers, and rousing the Blood."));
  }

  function drawRemorse(score, c, s) {
    var t = tally(lastRoll.dice);
    var held = t.successes >= 1;
    var res = el("div", "pl-result");
    res.innerHTML = '<span class="pl-succcount">' + t.successes + '</span> <span class="pl-succlabel">' + (held ? "— Remorse holds" : "— degeneration") + '</span>';
    score.appendChild(res);
    var apply = el("button", "pl-subbtn", held ? "Apply: clear Stains" : "Apply: −1 Road, clear Stains");
    apply.style.marginTop = "0.6rem";
    if (lastRoll.applied) apply.setAttribute("disabled", "disabled");
    apply.addEventListener("click", function () {
      if (lastRoll.applied) return;
      if (!held) s.road.rating = Math.max(0, s.road.rating - 1);
      s.road.stains = 0; lastRoll.applied = true; save(); refreshRoad();
      apply.setAttribute("disabled", "disabled");
    });
    score.appendChild(apply);
  }

  function markWillpowerSpent(c, s) {
    // mark one superficial Willpower box (first unmarked)
    var i = s.willpower.indexOf(0);
    if (i === -1) i = s.willpower.indexOf(1); // else upgrade a superficial to aggravated
    if (i !== -1) s.willpower[i] = Math.min(2, s.willpower[i] + 1);
    save();
  }

  // ---- export / import -------------------------------------------------
  function exportText() {
    return JSON.stringify({ app: "war-of-princes/the-table", version: 1, characters: state }, null, 2);
  }
  function doExport() {
    var text = exportText();
    try {
      var blob = new Blob([text], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "war-of-princes-table.json";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    } catch (e) {}
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function () {});
    }
  }
  function applyImport(text) {
    try {
      var data = JSON.parse(text);
      var chars = data && data.characters ? data.characters : data;
      if (chars && typeof chars === "object" && !Array.isArray(chars)) {
        state = chars; save(); renderChar();
        return true;
      }
      window.alert("That doesn't look like exported tracker state.");
    } catch (e) { window.alert("Could not parse JSON: " + e.message); }
    return false;
  }
  function doImport() {
    var input = document.createElement("input");
    input.type = "file"; input.accept = "application/json,.json";
    input.style.display = "none";
    input.addEventListener("change", function () {
      var f = input.files && input.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () { applyImport(String(r.result)); input.remove(); };
      r.readAsText(f);
    });
    document.body.appendChild(input);
    input.click();
  }

  function optu(label, value) { var o = document.createElement("option"); o.textContent = label; o.value = value; return o; }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build);
  else build();
})();
