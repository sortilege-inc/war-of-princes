/* ============================================================
   dice.js — reusable animated dice roller (no dependencies)
   ------------------------------------------------------------
   Game-agnostic and result-first: the caller decides the values
   (so game logic / tallies stay authoritative and testable) and
   this module only animates toward them. Drop dice.js + dice.css
   into any static site and theme via the --dice-* CSS variables.

   Dice.roll({
     mount:       HTMLElement,           // container to render into (cleared)
     dice:        [ { sides, value?, tag?, faces?, rerolled? }, ... ],
     duration:    650,                   // ms of tumble before settling
     stagger:     45,                    // ms between each die settling
     animateOnly: [i, ...],              // only these indices tumble;
                                         //   undefined = all, [] = none (instant)
     classify:    function(die){...},    // -> extra class string per die
     renderFace:  function(die){...},    // -> face text/glyph (default: value or faces[value-1])
     onSettle:    function(dice){...}     // called once, with the final dice
   })  ->  { stage, dice, cancel() }

   Each die object carries { sides, value, tag, el, index, ... }.
   ============================================================ */
(function (global) {
  "use strict";

  function reduceMotion() {
    return !!(global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }
  function rnd(sides) { return 1 + Math.floor(Math.random() * sides); }

  function faceText(die, renderFace) {
    if (renderFace) return renderFace(die);
    if (die.faces && die.faces.length) return die.faces[(die.value - 1) % die.faces.length];
    return String(die.value);
  }
  function writeFace(die, text) {
    if (die.numEl) die.numEl.textContent = text;   // shaped dice keep their <svg>
    else die.el.textContent = text;
  }
  function shapeSVG(shape) {
    if (shape === "d10") {
      return '<svg class="dice-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
             '<polygon class="dice-poly" points="50,3 96,38 78,97 22,97 4,38"/>' +
             '<path class="dice-facet" d="M50,3 L50,55 M4,38 L50,55 L96,38 M22,97 L50,55 L78,97"/>' +
             '</svg>';
    }
    return "";
  }

  function roll(opts) {
    var mount = opts.mount;
    if (!mount) throw new Error("Dice.roll: opts.mount is required");
    if (mount._dice && mount._dice.cancel) mount._dice.cancel(); // cancel any in-flight roll here

    var duration = opts.duration != null ? opts.duration : 650;
    var stagger  = opts.stagger  != null ? opts.stagger  : 45;
    var classify = opts.classify || function () { return ""; };
    var renderFace = opts.renderFace;
    var animateOnly = opts.animateOnly;          // undefined | [] | [indices]
    var animate = !reduceMotion();

    var dice = (opts.dice || []).map(function (spec, i) {
      var sides = spec.sides || 10;
      return {
        sides: sides,
        value: (spec.value != null) ? spec.value : rnd(sides),
        tag: spec.tag || "",
        shape: spec.shape || opts.shape || "square",
        faces: spec.faces,
        rerolled: !!spec.rerolled,
        index: i
      };
    });

    var stage = document.createElement("div");
    stage.className = "dice-stage";
    dice.forEach(function (die) {
      var el = document.createElement("div");
      el.className = "dice-die shape-" + die.shape + (die.tag ? " " + die.tag : "");
      var svg = shapeSVG(die.shape);
      if (svg) { el.innerHTML = svg + '<span class="dice-num"></span>'; die.numEl = el.querySelector(".dice-num"); }
      die.el = el;
      stage.appendChild(el);
    });
    mount.innerHTML = "";
    mount.appendChild(stage);

    var timers = [], intervals = [], remaining = dice.length, finished = false;

    function settle(die) {
      var cls = "dice-die shape-" + die.shape + " settling";
      if (die.tag) cls += " " + die.tag;
      var extra = classify(die);
      if (extra) cls += " " + extra;
      if (die.rerolled) cls += " rerolled";
      die.el.className = cls;   // note: className swap keeps the die's <svg>/<span> children
      writeFace(die, faceText(die, renderFace));
    }
    function finish() {
      if (finished) return;
      finished = true;
      if (opts.onSettle) opts.onSettle(dice);
    }
    function shouldAnimate(die) {
      if (!animate) return false;
      if (!animateOnly) return true;             // undefined -> all
      return animateOnly.indexOf(die.index) !== -1;
    }

    dice.forEach(function (die) {
      if (!shouldAnimate(die)) {
        settle(die);
        if (--remaining === 0) finish();
        return;
      }
      die.el.classList.add("rolling");
      var iv = setInterval(function () { writeFace(die, String(rnd(die.sides))); }, 70);
      intervals.push(iv);
      var t = setTimeout(function () {
        clearInterval(iv);
        settle(die);
        if (--remaining === 0) finish();
      }, duration + die.index * stagger);
      timers.push(t);
    });

    // safety net so onSettle always fires even if a timer is dropped
    timers.push(setTimeout(finish, duration + dice.length * stagger + 250));

    var handle = {
      stage: stage,
      dice: dice,
      cancel: function () { intervals.forEach(clearInterval); timers.forEach(clearTimeout); }
    };
    mount._dice = handle;
    return handle;
  }

  global.Dice = { roll: roll };
})(window);
