// The desk. Everything on the page that types tells it when it starts and stops,
// and the character at the bottom of the screen reads that to know whether to
// type or play. Pulling his plug cuts the power: whatever is typing stops where
// it is and carries on when the power is back.
window.__desk = (function () {
  var watchers = [], waiting = [];
  function tell() { for (var i = 0; i < watchers.length; i++) watchers[i](desk); }
  var desk = {
    typing: 0,
    power: true,
    begin: function () { desk.typing++; tell(); },
    end: function () { desk.typing = Math.max(0, desk.typing - 1); tell(); },
    // true when the caller has to stop here; it is called again once the power is back
    held: function (again) { if (desk.power) return false; waiting.push(again); return true; },
    setPower: function (on) {
      if (desk.power === on) return;
      desk.power = on;
      if (on) { var w = waiting; waiting = []; for (var i = 0; i < w.length; i++) w[i](); }
      tell();
    },
    watch: function (fn) { watchers.push(fn); }
  };
  return desk;
})();

// Navigation: the menu button on small screens, and marking the section in view.
(function () {
  var toggle = document.querySelector(".nav__toggle");
  var links = document.getElementById("nav-links");
  if (!links) return;

  function setOpen(open) {
    links.classList.toggle("is-open", open);
    if (toggle) toggle.setAttribute("aria-expanded", open ? "true" : "false");
  }
  if (toggle) {
    toggle.addEventListener("click", function () { setOpen(!links.classList.contains("is-open")); });
    links.addEventListener("click", function (e) { if (e.target.closest("a")) setOpen(false); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && links.classList.contains("is-open")) { setOpen(false); toggle.focus(); }
    });
  }

  if (!("IntersectionObserver" in window)) return;
  var byId = {};
  Array.prototype.forEach.call(links.querySelectorAll('a[href^="#"]'), function (a) {
    byId[a.getAttribute("href").slice(1)] = a;
  });
  var spy = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      for (var id in byId) byId[id].removeAttribute("aria-current");
      if (byId[entry.target.id]) byId[entry.target.id].setAttribute("aria-current", "true");
    });
  }, { rootMargin: "-35% 0px -60% 0px" });
  Array.prototype.forEach.call(document.querySelectorAll("main > section[id]"), function (s) { spy.observe(s); });
})();

// Skills: switch between the moving belts and a still layout that shows every chip.
(function () {
  var lanes = document.getElementById("lanes");
  var toggle = lanes && lanes.querySelector(".lanes__toggle");
  if (!toggle) return;
  toggle.addEventListener("click", function () {
    var still = lanes.classList.toggle("is-still");
    toggle.setAttribute("aria-pressed", still ? "true" : "false");
    toggle.textContent = still ? "Back to the sliders" : "Show all at once";
  });
})();

// The lamp: a small green light that follows the mouse over the whole page.
// Panels near it catch the light on their rim, and project cards also lean
// toward it. Mouse only; with reduced motion the cards stay flat.
(function () {
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  var flat = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var REACH = 170; // how far from a panel the lamp still lights its rim, in px

  var lamp = document.createElement("div");
  lamp.className = "lamp";
  lamp.setAttribute("aria-hidden", "true");
  document.body.appendChild(lamp);

  var panels = Array.prototype.slice.call(document.querySelectorAll(".card, .term, .hero__photo"));
  var x = -999, y = -999, frame = 0;

  function paint() {
    frame = 0;
    lamp.style.transform = "translate3d(" + x + "px," + y + "px,0)";
    panels.forEach(function (el) {
      var r = el.getBoundingClientRect();
      var near = x > r.left - REACH && x < r.right + REACH && y > r.top - REACH && y < r.bottom + REACH;
      if (near !== !!el._near) { el._near = near; el.classList.toggle("is-near", near); }
      if (!near) return;
      el.style.setProperty("--mx", (x - r.left).toFixed(0) + "px");
      el.style.setProperty("--my", (y - r.top).toFixed(0) + "px");
      if (flat || !el._over) return;
      // wide cards lean less, so the far edge never swings out of reach
      var max = 5 * Math.min(1, 520 / r.width);
      var px = Math.min(1, Math.max(0, (x - r.left) / r.width));
      var py = Math.min(1, Math.max(0, (y - r.top) / r.height));
      el.style.setProperty("--ry", ((px - 0.5) * 2 * max).toFixed(2) + "deg");
      el.style.setProperty("--rx", ((0.5 - py) * 2 * max).toFixed(2) + "deg");
    });
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(paint); }

  document.addEventListener("pointermove", function (e) {
    if (e.pointerType === "touch") return;
    x = e.clientX; y = e.clientY;
    lamp.classList.add("is-on");
    schedule();
  });
  // the page moves under a still mouse when it scrolls, so the rims need a refresh
  window.addEventListener("scroll", schedule, { passive: true });
  document.documentElement.addEventListener("pointerleave", function () { lamp.classList.remove("is-on"); });

  Array.prototype.forEach.call(document.querySelectorAll(".projects .card"), function (card) {
    card.addEventListener("pointerenter", function (e) {
      if (e.pointerType === "touch") return;
      card._over = true;
      card.classList.add("is-lit");
    });
    card.addEventListener("pointerleave", function () {
      card._over = false;
      card.classList.remove("is-lit");
      card.style.setProperty("--rx", "0deg");
      card.style.setProperty("--ry", "0deg");
    });
  });
})();

// The mouse pointer: a green dot exactly under the mouse and a ring that trails a
// little behind it, widens over anything that can be pressed and tightens on a
// click. Mouse only. With reduced motion the ring keeps up instead of trailing.
(function () {
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches || !window.requestAnimationFrame) return;
  var direct = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var PRESS = "a, button, summary, select, label[for], [role='button'], input, textarea";
  var root = document.documentElement;

  function make(name) {
    var el = document.createElement("div");
    el.className = "cursor " + name;
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
    return el;
  }
  var dot = make("cursor__dot"), ring = make("cursor__ring");
  var x = 0, y = 0, rx = 0, ry = 0, frame = 0, last = 0, shown = false;

  function paint(now) {
    frame = 0;
    // the ring closes the gap by time, not by frame, so it trails the same on any screen
    var dt = last ? Math.min(250, now - last) : 16;
    last = now;
    var k = direct ? 1 : 1 - Math.exp(-dt / 55);
    rx += (x - rx) * k; ry += (y - ry) * k;
    if (Math.abs(x - rx) < 0.1 && Math.abs(y - ry) < 0.1) { rx = x; ry = y; }
    dot.style.transform = "translate3d(" + x + "px," + y + "px,0)";
    ring.style.transform = "translate3d(" + rx.toFixed(1) + "px," + ry.toFixed(1) + "px,0)";
    if (rx !== x || ry !== y) frame = requestAnimationFrame(paint);   // runs only until the ring has caught up
    else last = 0;
  }
  function show(on) {
    shown = on;
    root.classList.toggle("has-cursor", on);
    dot.classList.toggle("is-on", on);
    ring.classList.toggle("is-on", on);
  }

  document.addEventListener("pointermove", function (e) {
    if (e.pointerType === "touch") return;
    x = e.clientX; y = e.clientY;
    if (!shown) { rx = x; ry = y; show(true); }
    var over = e.target && e.target.closest ? e.target : null;
    ring.classList.toggle("is-link", !!(over && over.closest(PRESS)));
    var ink = !!(over && over.closest(".btn--solid, .skip"));   // on a green button the pointer turns dark to stay visible
    dot.classList.toggle("is-ink", ink);
    ring.classList.toggle("is-ink", ink);
    var away = !!(over && over.closest(".b-plug-hit"));  // over the character's plug the pointer is a hand
    dot.classList.toggle("is-away", away);
    ring.classList.toggle("is-away", away);
    if (!frame) frame = requestAnimationFrame(paint);
  });
  document.addEventListener("pointerdown", function (e) {
    if (e.pointerType === "touch") { show(false); return; }   // a finger on a touch laptop: back to no pointer
    ring.classList.add("is-down");
  });
  document.addEventListener("pointerup", function () { ring.classList.remove("is-down"); });
  root.addEventListener("pointerleave", function () { show(false); });
  window.addEventListener("blur", function () { ring.classList.remove("is-down"); });
})();

// Typing on scroll: headings are typed like commands as they come into view,
// and paragraphs print after them, fast. The full text stays in the page the
// whole time (untyped letters are only transparent), so layout never jumps and
// screen readers and search engines read it normally. Each piece types once.
(function () {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var DESK = window.__desk;
  var HEADINGS = ".block__head h2";
  var PARAGRAPHS = ".hero__tag, .hero__lede, .hero__open, .block__head p, .card__what, .card__role, " +
    ".card__points li, .services p, .timeline p, .lanes__note";

  // Wraps the element's text (or, when it starts with a label, the text after it)
  function prepare(el) {
    var node = null;
    if (!el.children.length) node = el.firstChild;
    else if (el.lastChild && el.lastChild.nodeType === 3 && el.lastChild.textContent.trim()) node = el.lastChild;
    if (!node || node.nodeType !== 3) return null;
    var text = node.textContent;
    var done = document.createElement("span"), caret = document.createElement("span"), wait = document.createElement("span");
    done.className = "type-done";
    caret.className = "caret type-caret"; caret.setAttribute("aria-hidden", "true"); caret.hidden = true;
    wait.className = "type-wait"; wait.textContent = text;
    el.replaceChild(wait, node);
    el.insertBefore(caret, wait);
    el.insertBefore(done, caret);
    return { text: text, done: done, caret: caret, wait: wait };
  }
  // total: how long the whole piece should take, whatever its length
  function type(part, total, hold) {
    var len = part.text.length, n = 0, tick = 16;
    var perTick = Math.max(1, Math.ceil(len / (total / tick)));
    if (perTick === 1) tick = Math.max(16, Math.min(60, total / Math.max(1, len)));
    part.caret.hidden = false;
    DESK.begin();
    (function step() {
      if (DESK.held(step)) return;
      n = Math.min(len, n + perTick);
      part.done.textContent = part.text.slice(0, n);
      part.wait.textContent = part.text.slice(n);
      if (n < len) return setTimeout(step, tick);
      DESK.end();
      setTimeout(function () { part.caret.hidden = true; }, hold);
    })();
  }
  function duration(part, heading) {
    return heading ? Math.min(1150, 250 + part.text.length * 75) : Math.max(700, Math.min(2400, part.text.length * 14));
  }

  // The hero name types first; the lines under it wait their turn.
  var nameEl = document.getElementById("hero-name");
  var heroReady = Date.now() + (nameEl ? 350 + nameEl.textContent.length * 105 + 150 : 0);

  // shows a piece whole, with no typing
  function finish(part) {
    part.done.textContent = part.text;
    part.wait.textContent = "";
    part.caret.hidden = true;
  }

  var queue = [], draining = false;
  function drain() {
    draining = true;
    if (DESK.held(drain)) return;                       // no power: the next piece waits with the rest
    // Whatever has left the screen since it was queued is shown whole, so the
    // text in front of the reader never waits its turn behind text they have
    // already scrolled past. All positions are read first, then the page is changed.
    var h = window.innerHeight, gone = [];
    queue = queue.filter(function (item) {
      var r = item.el.getBoundingClientRect();
      if (r.bottom > 0 && r.top < h) return true;
      gone.push(item);
      return false;
    });
    gone.forEach(function (item) { finish(item.part); });
    if (!queue.length) { draining = false; return; }
    draining = true;
    var item = queue.shift();
    type(item.part, duration(item.part, item.heading), item.heading ? 120 : 0);
    // a long backlog (a fast scroll) speeds up, so nothing waits blank for long
    setTimeout(drain, item.heading ? duration(item.part, true) + 140 : Math.max(40, Math.min(190, 1200 / (queue.length + 1))));
  }

  // Everything still waiting to be typed. A plain position check finds what is
  // on screen: it runs on scroll and on a slow timer, so no piece of text can
  // be left invisible because an event was missed.
  var pending = [];
  function sweep() {
    if (!pending.length) return;
    var limit = window.innerHeight * 0.94, now = Date.now(), shown = [], past = [];
    pending = pending.filter(function (el) {
      var r = el.getBoundingClientRect();
      if (r.bottom <= 0 && r.height) { past.push(el); return false; }   // scrolled past before its turn came
      if (el._hero && now < heroReady) return true;
      if (r.top < limit && r.bottom > 0) { shown.push(el); return false; }
      return true;
    });
    past.forEach(function (el) { finish(el._type.part); });
    if (!pending.length) clearInterval(timer);
    if (!shown.length) return;
    // page order, so a heading types before the paragraph under it
    shown.sort(function (a, b) { return a.compareDocumentPosition(b) & 4 ? -1 : 1; });
    shown.forEach(function (el) { queue.push(el._type); });
    if (!draining) drain();
  }

  function watch(selector, heading) {
    Array.prototype.forEach.call(document.querySelectorAll(selector), function (el) {
      var part = prepare(el);
      if (!part) return;
      el._type = { part: part, heading: heading, el: el };
      el._hero = !!el.closest(".hero");
      pending.push(el);
    });
  }
  watch(HEADINGS, true);
  watch(PARAGRAPHS, false);

  var throttle = 0;
  window.addEventListener("scroll", function () {
    if (throttle) return;
    throttle = setTimeout(function () { throttle = 0; sweep(); }, 90);
  }, { passive: true });
  window.addEventListener("resize", sweep);
  var timer = setInterval(sweep, 500);
  sweep();
})();

// Back to top: the round button waits out of sight until the hero has scrolled away.
(function () {
  var btn = document.querySelector(".to-top");
  var hero = document.querySelector(".hero");
  if (!btn || !hero || !("IntersectionObserver" in window)) { if (btn) btn.classList.add("is-shown"); return; }
  new IntersectionObserver(function (entries) {
    btn.classList.toggle("is-shown", !entries[0].isIntersecting);
  }).observe(hero);
})();

// The name in the hero types itself once when the page opens, like a command.
(function () {
  var el = document.getElementById("hero-name");
  if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var text = el.textContent, n = 0;
  el.textContent = "";
  var done = document.createElement("span"), caret = document.createElement("span"), wait = document.createElement("span");
  caret.className = "caret hero__caret"; caret.setAttribute("aria-hidden", "true");
  wait.className = "type-wait"; wait.textContent = text;
  el.append(done, caret, wait);
  var DESK = window.__desk;
  DESK.begin();
  setTimeout(function tick() {
    if (DESK.held(tick)) return;
    n++;
    done.textContent = text.slice(0, n);
    wait.textContent = text.slice(n);
    if (n < text.length) setTimeout(tick, 105);
    else DESK.end();
  }, 350);
})();

// The sky behind the page. Two looks, chosen in the dashboard:
//   "maths": numbers, equations and maths symbols (the default)
//   "space": planets, stars, astronauts, ships and rockets
// or it can be switched off. Whatever is there floats slowly on its own all the
// time, drifts faster at different speeds as the page scrolls, and when the
// mouse comes near it turns and slides away,
// then eases back. Decorative only: hidden from screen readers, never in the
// way of a click, and still when motion is reduced.
(function () {
  var mode = "maths";
  try { mode = JSON.parse(document.getElementById("site-data").textContent).sky || "maths"; } catch (e) {}
  var set = window.SKY_ICONS;
  if (mode === "off" || !set || !set[mode]) return;

  var EQUATIONS = ["E = mc²", "a² + b² = c²", "y = mx + b", "x² + y² = r²", "A = πr²", "F = ma",
    "sin²θ + cos²θ = 1", "f(x) = x²", "Δ = b² − 4ac", "√2 ≈ 1.414", "1 + 1 = 2", "2ⁿ", "n!",
    "π ≈ 3.14159", "e ≈ 2.718", "φ = 1.618", "∑ n = n(n+1)/2", "log₂ 8 = 3", "dy/dx", "∫ x dx = x²/2",
    "3x + 2 = 11", "7 × 8 = 56", "0.1 + 0.2", "x → ∞", "42", "1024", "3.14", "0", "1", "13", "99", "360°",
    "(a + b)² = a² + 2ab + b²", "x = (−b ± √Δ) / 2a", "V = ⁴⁄₃ πr³", "C = 2πr", "i² = −1", "1, 1, 2, 3, 5, 8, 13", "tan θ = sin θ / cos θ", "ln e = 1", "lim x → 0", "∂f/∂x", "5! = 120", "2³ = 8", "9 ÷ 3 = 3", "√16 = 4", "a/b = c/d", "P(A ∩ B)", "cos 60° = ½", "e^(iπ) + 1 = 0", "Σx / n", "|x| ≥ 0", "y = ax² + bx + c", "d = vt", "aⁿ × aᵐ = aⁿ⁺ᵐ", "sin 30° = ½", "πr²h", "x³ − 1", "12 × 12 = 144", "≈", "≡", "∴", "0.5", "7", "64", "2048"];

  var sky = document.createElement("div");
  sky.className = "sky sky--" + mode;
  sky.setAttribute("aria-hidden", "true");
  document.body.insertBefore(sky, document.body.firstChild);

  var wrap = function (icon) {
    return '<svg viewBox="' + icon.v + '" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + icon.b + "</svg>";
  };

  // a small fixed-seed generator, so the sky looks the same on every visit
  var seed = 20261122;
  function rnd() { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }

  // the layer is as tall as the screen with the phone's address bar hidden, so its
  // height stays the same when that bar slides in and out during a scroll
  var W = window.innerWidth, H = sky.offsetHeight || window.innerHeight;
  var count = W < 640 ? 32 : W < 1100 ? 56 : 86;
  var icons = set[mode], items = [], iconAt = 0, textAt = 0;
  for (var n = 0; n < count; n++) {
    var el = document.createElement("span");
    el.className = "sky__item" + (n % 5 === 0 ? " sky__item--green" : "");
    // in the maths look, two pieces in five are a written number or equation
    var written = mode === "maths" && (n % 5 === 1 || n % 5 === 3);
    var w, h;
    if (written) {
      el.className += " sky__text";
      el.textContent = EQUATIONS[textAt++ % EQUATIONS.length];
      el.style.fontSize = (13 + Math.round(rnd() * 9)) + "px";
      sky.appendChild(el);
      w = el.offsetWidth; h = el.offsetHeight;
    } else {
      el.innerHTML = wrap(icons[iconAt++ % icons.length]);
      w = h = 20 + Math.round(rnd() * 26);
      el.style.width = el.style.height = w + "px";
      sky.appendChild(el);
    }
    items.push({
      el: el, w: w, h: h,
      x: 0.02 + ((n * 0.61803) % 1) * 0.96,   // spread evenly across the width
      py: rnd() * (H + 160) - 80,             // where it is down the screen, in px
      depth: 0.07 + rnd() * 0.33,             // how fast it drifts with the scroll
      turn: written ? (rnd() - 0.5) * 0.03 : (rnd() - 0.5) * 0.16,   // spin per pixel scrolled; writing barely tilts
      sway: rnd() * 6.28, dir: rnd() < 0.5 ? -1 : 1,
      ox: 0, oy: 0, vx: 0, vy: 0, rot: written ? (rnd() - 0.5) * 16 : (rnd() - 0.5) * 50, spin: 0, near: false, written: written
    });
  }

  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var mx = -9999, my = -9999, last = 0, t = 0, lastSy = 0;
  var REACH = 160, PUSH = 2.2, SPRING = 0.03, DRAG = 0.86;

  function place(time) {
    // t is the seconds the sky has been on screen; a long gap (a hidden tab) counts as one frame
    var dt = last ? Math.min(0.05, (time - last) / 1000) : 0;
    t += dt; last = time;
    var sy = still ? 0 : window.scrollY, loop = H + 160, scrolled = sy - lastSy;
    lastSy = sy;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      // where it would sit with no mouse nearby: floating up on its own, faster while the
      // page scrolls, with a slow sway from side to side. Each piece is moved on from where
      // it was, and goes round to the bottom once it is off the top, so a change in the
      // screen's size never throws the whole sky to new places.
      var bx = it.x * W + Math.sin(sy / 260 + t * 0.35 + it.sway) * 20 * it.dir;
      it.py = ((((it.py - scrolled * it.depth - dt * (6 + it.depth * 45) + 80) % loop) + loop) % loop) - 80;
      var by = it.py;
      // icons turn slowly all the time; writing only rocks a little, so it stays readable
      var idle = it.written ? Math.sin(t * 0.4 + it.sway) * 4 : t * it.turn * 70;
      if (!still) {
        var dx = bx + it.ox - mx, dy = by + it.oy - my, d = Math.sqrt(dx * dx + dy * dy);
        if (d < REACH) {
          var f = (1 - d / REACH) * PUSH, inv = 1 / (d || 1);
          it.vx += dx * inv * f; it.vy += dy * inv * f;
          if (!it.near) { it.near = true; it.dir = -it.dir; it.spin += (dx < 0 ? -1 : 1) * (it.written ? 2 : 7); } // new heading
        } else it.near = false;
        it.vx += -it.ox * SPRING; it.vy += -it.oy * SPRING;
        it.vx *= DRAG; it.vy *= DRAG; it.spin *= 0.94;
        it.ox += it.vx; it.oy += it.vy; it.rot += it.spin;
      }
      it.el.style.transform = "translate3d(" + (bx + it.ox - it.w / 2).toFixed(1) + "px," + (by + it.oy - it.h / 2).toFixed(1) +
        "px,0) rotate(" + (it.rot + sy * it.turn + idle).toFixed(1) + "deg)";
    }
    // keeps going on its own; the browser pauses these frames while the tab is hidden
    if (!still) requestAnimationFrame(place);
  }

  place(0);
  if (still) return;
  window.addEventListener("resize", function () { W = window.innerWidth; H = sky.offsetHeight || window.innerHeight; });
  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    document.addEventListener("pointermove", function (e) { if (e.pointerType !== "touch") { mx = e.clientX; my = e.clientY; } });
    document.documentElement.addEventListener("pointerleave", function () { mx = my = -9999; });
  }
})();

// Phone screenshots: the status bar above each one takes the colour of the top
// of the screenshot, the way an app colours the status bar on a real phone.
// Without this the bar stays black, which is the stylesheet's own colour.
(function () {
  var shots = document.querySelectorAll(".mock__phone img");
  function tint(img) {
    if (!img.naturalWidth) return;
    try {
      var c = document.createElement("canvas");
      c.width = c.height = 1;
      var ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, img.naturalWidth, 4, 0, 0, 1, 1);   // the top four rows, averaged
      var p = ctx.getImageData(0, 0, 1, 1).data;
      img.style.backgroundColor = "rgb(" + p[0] + "," + p[1] + "," + p[2] + ")";
    } catch (e) { /* the picture cannot be read (opened from a file): the bar stays black */ }
  }
  for (var i = 0; i < shots.length; i++) {
    if (shots[i].complete) tint(shots[i]);
    else shots[i].addEventListener("load", function () { tint(this); });
  }
})();

// Pixel reveal. Each picture starts under a grid of small squares in the site's
// own colours. When it scrolls into view the squares dissolve along one
// direction with a ragged leading edge, and the cover is then taken away for
// good. Which pictures, the direction, the colours, the square size, the speed
// and how ragged the edge is all come from the dashboard's general settings.
// With reduced motion, or with the setting off, pictures simply show.
(function () {
  var cfg = null;
  try { cfg = JSON.parse(document.getElementById("site-data").textContent).reveal; } catch (e) {}
  if (!cfg || !window.requestAnimationFrame || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var which = cfg.images === "projects" ? ".mock img" : cfg.images === "photo" ? ".hero__photo img" : ".mock img, .hero__photo img";
  var imgs = document.querySelectorAll(which);
  if (!imgs.length) return;

  var css = getComputedStyle(document.documentElement);
  var tone = function (name, fallback) { return (css.getPropertyValue(name) || "").trim() || fallback; };
  // the site's colours as numbers, read off a spare canvas so any CSS colour works
  var probe = document.createElement("canvas").getContext && document.createElement("canvas").getContext("2d");
  if (!probe) return;
  var rgb = function (color) {
    probe.clearRect(0, 0, 1, 1); probe.fillStyle = color; probe.fillRect(0, 0, 1, 1);
    var d = probe.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  };
  var GREEN = rgb(tone("--green", "#4fe08a"));
  var DARK = [rgb(tone("--panel", "#101712")), rgb(tone("--line", "#1f2b23")), rgb(tone("--ink", "#0a0f0c"))];   // most squares, some, a few
  var GLOW = 0.05;   // in the mixed look, squares this close to dissolving light up green
  var ease = function (x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; };
  var pending = [], timer = 0;

  // The cover canvas holds one pixel per square and is stretched over the picture
  // with hard edges, so even a fine grain of thousands of dots costs one small
  // image write a frame.
  function draw(it) {
    var g = it.grid;
    if (!g) return;
    var px = g.image.data, p = it.p, n = g.at.length;
    for (var i = 0, o = 0; i < n; i++, o += 4) {
      var left = g.at[i] - p;                 // how long until this square goes
      if (left <= 0 && p > 0) { px[o + 3] = 0; continue; }
      var c = cfg.color === "green" || (cfg.color === "mix" && p > 0 && left < GLOW) ? GREEN : DARK[g.shade[i]];
      px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255;
    }
    it.ctx.putImageData(g.image, 0, 0);
  }

  // Reading the page's layout and changing it are kept apart: pictures are
  // measured first, then covers are placed. Mixing the two would make the browser
  // lay the whole page out again for every picture.
  function measure(it) {
    var img = it.img;
    return { w: img.offsetWidth, h: img.offsetHeight, x: img.offsetLeft, y: img.offsetTop, round: getComputedStyle(img).borderRadius };
  }
  // sizes the cover to the picture and deals each square the moment it dissolves
  function place(it, m) {
    if (!m.w || !m.h || (m.w === it.w && m.h === it.h && m.x === it.x && m.y === it.y)) return;
    it.w = m.w; it.h = m.h; it.x = m.x; it.y = m.y;
    var s = it.canvas.style, w = m.w, h = m.h;
    s.left = m.x + "px"; s.top = m.y + "px"; s.width = w + "px"; s.height = h + "px";
    s.borderRadius = m.round;
    var size = Math.max(2, Math.min(cfg.size, w / 12));   // small pictures (the phone) get smaller squares
    var cols = Math.max(1, Math.ceil(w / size)), rows = Math.max(1, Math.ceil(h / size)), rag = cfg.edge / 100;
    it.canvas.width = cols; it.canvas.height = rows;
    var at = new Float32Array(cols * rows), shade = new Uint8Array(cols * rows), i = 0;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++, i++) {
        var along = cfg.dir === "up" || cfg.dir === "down" ? (rows > 1 ? r / (rows - 1) : 0) : (cols > 1 ? c / (cols - 1) : 0);
        if (cfg.dir === "up" || cfg.dir === "left") along = 1 - along;
        at[i] = along * (1 - rag) + Math.random() * rag;
        var n = Math.random();
        shade[i] = n < 0.7 ? 0 : n < 0.92 ? 1 : 2;
      }
    }
    it.grid = { at: at, shade: shade, image: it.ctx.createImageData(cols, rows) };
    draw(it);
  }
  function placeAll(list) {
    var sizes = list.map(measure);
    for (var i = 0; i < list.length; i++) place(list[i], sizes[i]);
  }

  var resized = window.ResizeObserver ? new ResizeObserver(function (entries) {
    placeAll(entries.map(function (e) { return e.target._cover; }).filter(function (it) { return it && !it.done; }));
  }) : null;

  function finish(it) {
    it.done = true;
    if (resized) resized.unobserve(it.img);
    if (it.canvas.parentNode) it.canvas.parentNode.removeChild(it.canvas);
  }
  function run(it) {
    requestAnimationFrame(function step(now) {
      if (!it.start) it.start = now;
      var x = Math.min(1, (now - it.start) / (cfg.dur * 1000));
      it.p = ease(x);
      if (x >= 1) return finish(it);
      draw(it);
      requestAnimationFrame(step);
    });
  }

  // The browser reports when a covered picture comes into view, so nothing is
  // measured while the page scrolls.
  var seen = window.IntersectionObserver ? new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) if (entries[i].isIntersecting && entries[i].target._cover) entries[i].target._cover.seen = true;
    start();
  }, { rootMargin: "0px 0px -10% 0px" }) : null;

  // starts every covered picture that has come into view and has finished loading
  function start() {
    pending = pending.filter(function (it) {
      if (!it.seen || !it.img.complete) return true;
      if (seen) seen.unobserve(it.img);
      if (it.img.naturalWidth) run(it); else finish(it);   // a picture that failed to load is just uncovered
      return false;
    });
    if (!pending.length) {
      clearInterval(timer);
      if (seen) seen.disconnect();
    }
  }
  // A slow position check behind the observer, so a picture can never be left
  // covered because a report was missed (or the browser has no observer).
  function check() {
    var limit = window.innerHeight * 0.9;
    for (var i = 0; i < pending.length; i++) {
      if (pending[i].seen) continue;
      var r = pending[i].img.getBoundingClientRect();
      if (r.width && r.top < limit && r.bottom > 0) pending[i].seen = true;
    }
    start();
  }

  var k, boxes = [], fixed = [];
  for (k = 0; k < imgs.length; k++) { boxes.push(imgs[k].parentNode); fixed.push(getComputedStyle(imgs[k].parentNode).position !== "static"); }
  for (k = 0; k < imgs.length; k++) {
    var canvas = document.createElement("canvas"), ctx = canvas.getContext && canvas.getContext("2d");
    if (!ctx) break;
    canvas.className = "reveal-cover";
    canvas.setAttribute("aria-hidden", "true");
    if (!fixed[k]) boxes[k].style.position = "relative";
    boxes[k].appendChild(canvas);
    var it = { img: imgs[k], canvas: canvas, ctx: ctx, p: 0, start: 0, grid: null, done: false, seen: false, w: 0, h: 0, x: 0, y: 0 };
    imgs[k]._cover = it;
    pending.push(it);
  }
  placeAll(pending);
  pending.forEach(function (it) {
    if (resized) resized.observe(it.img);
    if (seen) seen.observe(it.img);
    it.img.addEventListener("load", start);
    it.img.addEventListener("error", start);
  });
  timer = setInterval(check, seen ? 1500 : 300);
  if (!seen) check();
})();

// The hero terminal. Everything it prints comes from the page's own content,
// which build.mjs embeds in the #site-data script tag.
(function () {
  var out = document.getElementById("term-out");
  var form = document.getElementById("term-form");
  var input = document.getElementById("term-in");
  var chips = document.getElementById("term-chips");
  if (!out || !form || !input) return;

  var DATA = {};
  try { DATA = JSON.parse(document.getElementById("site-data").textContent) || {}; } catch (e) {}

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var PROJECTS = {};
  (DATA.projects || []).forEach(function (p) { PROJECTS[p[0]] = p[1]; });
  var SECTIONS = DATA.sections || [];
  var CONTACT = DATA.contact || [];
  var hasProjects = Object.keys(PROJECTS).length > 0;

  function line(cls, html) {
    var p = document.createElement("p");
    p.className = cls;
    p.innerHTML = html;
    out.appendChild(p);
    out.scrollTop = out.scrollHeight;
    return p;
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function go(id) {
    var el = document.getElementById(id);
    if (!el) return false;
    el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    return true;
  }
  function highlight(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.classList.add("is-target");
    setTimeout(function () { el.classList.remove("is-target"); }, 2600);
  }
  function listProjects() {
    if (!hasProjects) return "No projects listed yet.";
    return Object.keys(PROJECTS).map(function (k) {
      return "<b>" + esc(k) + "</b>  " + esc(PROJECTS[k]);
    }).join("\n");
  }

  var COMMANDS = {
    help: function () {
      return [
        "<b>whoami</b>          who this is",
        "<b>ls</b>              list the sections",
        "<b>ls projects</b>     list the projects",
        "<b>open</b> &lt;project&gt;  jump to a project",
        "<b>cd</b> &lt;section&gt;    jump to a section",
        "<b>skills</b>          what I build with",
        "<b>contact</b>         how to reach me",
        "<b>clear</b>           empty the screen"
      ].join("\n");
    },
    whoami: function () { return esc(DATA.whoami || ""); },
    ls: function (arg) {
      if (!arg) return SECTIONS.map(function (s) { return "<b>" + esc(s) + "/</b>"; }).join("  ");
      var a = arg.replace(/\/$/, "");
      if (a === "projects") return listProjects();
      if (SECTIONS.indexOf(a) > -1) return "Nothing to list here. Try <b>cd " + esc(a) + "</b>.";
      return null;
    },
    projects: function () { go("projects"); return listProjects(); },
    open: function (arg) {
      var a = (arg || "").replace(/\/$/, "");
      if (!PROJECTS[a]) return { err: "No project called \"" + esc(a) + "\". Run ls projects to see the names." };
      go("p-" + a); highlight("p-" + a);
      return "Opening <b>" + esc(a) + "</b>.";
    },
    cd: function (arg) {
      var a = (arg || "").replace(/^~\//, "").replace(/\/$/, "");
      if (!a || a === "~") { go("top"); return "Back at the top."; }
      if (PROJECTS[a]) return COMMANDS.open(a);
      if (SECTIONS.indexOf(a) === -1) return { err: "No section called \"" + esc(a) + "\". Run ls to see them." };
      go(a);
      return "Moved to <b>~/" + esc(a) + "</b>.";
    },
    skills: function () {
      var s = DATA.skills || [];
      return s.length ? esc(s.slice(0, 4).join("\n")) : "Nothing listed yet.";
    },
    contact: function () {
      if (!CONTACT.length) return "No contact details listed yet.";
      go("contact");
      return CONTACT.map(function (c) {
        return "<b>" + esc(c[0]) + "</b>  <a href=\"" + esc(c[1]) + "\" target=\"_blank\" rel=\"noopener\">" + esc(c[2]) + "</a>";
      }).join("\n");
    },
    cv: function () {
      if (!DATA.cv) return "No CV file here yet. Try <b>contact</b>.";
      go("contact");
      return "The CV download is in the contact section.";
    },
    resume: function () { return COMMANDS.cv(); },
    clear: function () { out.innerHTML = ""; return ""; }
  };

  function run(raw) {
    var text = raw.trim();
    if (!text) return;
    line("cmd", esc(text));
    var parts = text.split(/\s+/);
    var name = parts[0].toLowerCase();
    var arg = parts.slice(1).join(" ").toLowerCase();
    var fn = Object.prototype.hasOwnProperty.call(COMMANDS, name) ? COMMANDS[name] : null;
    var res = fn ? fn(arg) : null;
    if (res === null || res === undefined) {
      line("err", "Command not found: " + esc(text) + ". Type help to see what works.");
    } else if (res && res.err) {
      line("err", res.err);
    } else if (res) {
      line("out", res);
    }
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    run(input.value);
    input.value = "";
  });
  if (chips) chips.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-cmd]");
    if (b) run(b.getAttribute("data-cmd"));
  });
  document.getElementById("term").addEventListener("click", function (e) {
    if (!e.target.closest("a, button") && !String(window.getSelection())) input.focus({ preventScroll: true });
  });

  // Intro: type two commands once, then hand the prompt to the visitor.
  var intro = hasProjects ? ["whoami", "ls projects"] : ["whoami", "help"];
  if (reduced) { intro.forEach(run); return; }

  input.disabled = true;
  function typeCmd(i) {
    if (i >= intro.length) { input.disabled = false; return; }
    var cmd = intro[i], n = 0;
    var p = line("cmd", "<span class=\"caret\"></span>");
    window.__desk.begin();
    (function tick() {
      if (window.__desk.held(tick)) return;
      n++;
      p.innerHTML = esc(cmd.slice(0, n)) + "<span class=\"caret\"></span>";
      if (n < cmd.length) return setTimeout(tick, 55);
      window.__desk.end();
      setTimeout(function () {
        p.remove();
        run(cmd);
        setTimeout(function () { typeCmd(i + 1); }, 380);
      }, 320);
    })();
  }
  setTimeout(function () { typeCmd(0); }, 500);
})();

// The character at the bottom right. He types while the page's text is being
// typed, and when it has been quiet for a moment he takes a controller from
// under the desk and plays. Pull his plug (the mouse turns into a hand over it,
// and he looks round) and the laptop dies, the page's typing stops, and he
// throws a slipper that grows towards the middle of the screen, hits the glass,
// cracks it and drops. Then he tugs the cable, the plug goes back in, and
// everything carries on. The second pull earns two slippers; after the third he
// keeps hold of the cable for a while and the plug will not come out.
// With reduced motion he sits still and the plug is only a drawing.
(function () {
  var wrap = document.querySelector(".buddy");
  var DESK = window.__desk;
  if (!wrap || !DESK) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { wrap.classList.add("is-still"); return; }

  var POSES = ["typing", "idle", "reach", "gaming", "win", "shock", "grab", "windup", "throw", "tug", "guard"];
  var gen = 0;            // goes up whenever he changes his mind, so steps planned earlier are dropped
  var busy = false;       // in the middle of the plug scene
  var playing = false;    // the controller is what he goes back to when nothing is being typed
  var guarding = false, pulls = 0, idleTimer = 0, winTimer = 0;

  function pose(name) { for (var i = 0; i < POSES.length; i++) wrap.classList.toggle("is-" + POSES[i], POSES[i] === name); }
  function has(name) { return wrap.classList.contains("is-" + name); }
  function flag(name, on) { wrap.classList.toggle(name, on); }
  function later(ms, fn) { var g = gen; setTimeout(function () { if (g === gen) fn(); }, ms); }

  function toTyping() {
    gen++; clearTimeout(idleTimer); clearTimeout(winTimer);
    if (!playing) { pose("typing"); return; }
    playing = false;
    pose("reach");                                     // puts the controller back under the desk first
    later(300, function () { flag("has-pad", false); pose("typing"); });
  }
  function toGaming() {
    gen++; clearTimeout(idleTimer);
    playing = true;
    pose("reach");
    later(400, function () { flag("has-pad", true); pose("gaming"); cheer(); });
  }
  // every so often he wins something
  function cheer() {
    clearTimeout(winTimer);
    winTimer = setTimeout(function () {
      if (busy || !has("gaming")) return;
      var g = gen;
      pose("win");
      setTimeout(function () { if (g === gen && !busy) { pose("gaming"); cheer(); } }, 950);
    }, 6000 + Math.random() * 6000);
  }
  // keyboard or controller, from what the page is doing
  function settle() {
    if (busy || guarding) return;
    clearTimeout(idleTimer);
    if (DESK.typing > 0) { if (!has("typing")) toTyping(); return; }
    if (playing) { if (!has("gaming") && !has("win") && !has("reach")) toGaming(); return; }
    // typing has just stopped: hands rest after half a second, the controller comes out after a second more
    idleTimer = setTimeout(function () {
      if (busy || guarding || DESK.typing > 0) return;
      gen++; pose("idle");
      idleTimer = setTimeout(function () { if (!busy && !guarding && DESK.typing === 0) toGaming(); }, 1000);
    }, 500);
  }
  function resume() {
    busy = false;
    if (DESK.typing > 0) { playing = false; gen++; pose("typing"); }
    else if (playing) toGaming();
    else { gen++; pose("idle"); settle(); }
  }

  // ---------- the slipper ----------
  var SLIPPER = "<svg viewBox='0 0 100 44' aria-hidden='true' focusable='false'>" +
    "<path d='M4 22C4 8 18 4 34 5H70C88 5 96 12 96 22S88 39 70 39H34C18 40 4 36 4 22Z'/>" +
    "<path class='b-line' d='M76 14v16M83 16v12M89 19v6'/>" +
    "<path d='M26 22Q42 5 67 5L67 11Q46 12 34 22Q46 32 67 33L67 39Q42 39 26 22Z'/>" +
    "<circle cx='30' cy='22' r='2.4'/></svg>";

  function at(x, y, scale, deg) {
    return "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px) translate(-50%,-50%) scale(" + scale.toFixed(3) + ") rotate(" + deg + "deg)";
  }
  function launch(nth) {
    var vw = window.innerWidth, vh = window.innerHeight;
    var r = wrap.querySelector(".b-hand--near").getBoundingClientRect();
    var sx = r.left + r.width / 2, sy = r.top + r.height / 2;
    var tx = vw / 2 + (nth ? vw * 0.13 : -vw * 0.05), ty = vh / 2 + (nth ? -vh * 0.09 : vh * 0.03);
    var big = Math.min(vw, vh) * 0.6 / 100;            // the element is 100px wide
    var el = document.createElement("div");
    el.className = "buddy-fly";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = SLIPPER;
    if (!el.animate) { impact(tx, ty); return; }
    el.style.transform = at(sx, sy, 0.2, -40);
    document.body.appendChild(el);
    var spin = nth ? -380 : 400;
    // Plain timers decide when it hits and when it is gone, so a browser that is
    // drawing slowly (a tab in the background) still gets the hit and the clean-up.
    el.animate([{ transform: at(sx, sy, 0.2, -40) }, { transform: at(tx, ty, big, spin) }],
      { duration: 620, easing: "cubic-bezier(0.5, 0, 0.85, 0.6)", fill: "forwards" });
    setTimeout(function () {
      impact(tx, ty);
      el.animate([
        { transform: at(tx, ty, big, spin), offset: 0 },
        { transform: at(tx, ty + 8, big * 0.95, spin + 4), offset: 0.2 },
        { transform: at(tx - 30, vh + big * 70, big * 0.9, spin + 70), offset: 1 }
      ], { duration: 1150, easing: "cubic-bezier(0.6, 0, 1, 0.7)", fill: "forwards" });
    }, 620);
    setTimeout(function () { el.remove(); }, 620 + 1150 + 60);
  }
  // the screen takes the hit: the page jolts and the glass cracks
  function impact(x, y) {
    var shake = [{ transform: "translate(0,0)" }, { transform: "translate(-7px,5px)" }, { transform: "translate(6px,-4px)" },
      { transform: "translate(-4px,3px)" }, { transform: "translate(2px,-1px)" }, { transform: "translate(0,0)" }];
    Array.prototype.forEach.call(document.querySelectorAll("body > header, body > main, body > footer"), function (el) {
      if (el.animate) el.animate(shake, { duration: 360, easing: "ease-out" });
    });
    crack(x, y);
  }
  function crack(x, y) {
    var NS = "http://www.w3.org/2000/svg";
    var size = Math.min(window.innerWidth, window.innerHeight) * 0.95;
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "buddy-crack");
    svg.setAttribute("viewBox", "-100 -100 200 200");
    svg.setAttribute("aria-hidden", "true");
    svg.style.left = x + "px"; svg.style.top = y + "px"; svg.style.width = svg.style.height = size + "px";
    function line(d, thin) {
      var p = document.createElementNS(NS, "path");
      p.setAttribute("d", d);
      p.setAttribute("pathLength", "1");
      if (thin) p.setAttribute("class", "b-thin");
      svg.appendChild(p);
    }
    var rays = 9 + Math.floor(Math.random() * 3), inner = [], outer = [];
    for (var i = 0; i < rays; i++) {
      var a = (i / rays) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      var len = 48 + Math.random() * 50, steps = 3 + Math.floor(Math.random() * 2), d = "M0 0", px = 0, py = 0;
      for (var s = 1; s <= steps; s++) {
        var aa = a + (Math.random() - 0.5) * 0.3, rr = len * s / steps;
        px = Math.cos(aa) * rr; py = Math.sin(aa) * rr;
        d += "L" + px.toFixed(1) + " " + py.toFixed(1);
        if (s === 1) inner.push([px, py]);
        if (s === 2) outer.push([px, py]);
      }
      line(d, false);
      if (Math.random() < 0.65) {                        // a short side crack
        var ba = a + (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5), bl = 8 + Math.random() * 14;
        line("M" + (px * 0.6).toFixed(1) + " " + (py * 0.6).toFixed(1) + "l" + (Math.cos(ba) * bl).toFixed(1) + " " + (Math.sin(ba) * bl).toFixed(1), true);
      }
    }
    // the rings that join the cracks round the point of the hit; the outer one has gaps
    [inner, outer].forEach(function (ring, which) {
      for (var k = 0; k < ring.length; k++) {
        if (which && Math.random() < 0.4) continue;
        var p1 = ring[k], p2 = ring[(k + 1) % ring.length];
        line("M" + p1[0].toFixed(1) + " " + p1[1].toFixed(1) + "L" + p2[0].toFixed(1) + " " + p2[1].toFixed(1), true);
      }
    });
    document.body.appendChild(svg);
    setTimeout(function () { svg.remove(); }, 2600);
  }

  // ---------- the plug ----------
  function pull() {
    if (busy) return;
    if (guarding) {                                      // he has hold of the cable: a shake of the head, no more
      flag("is-no", true);
      setTimeout(function () { flag("is-no", false); }, 700);
      return;
    }
    busy = true; gen++; pulls++;
    clearTimeout(idleTimer); clearTimeout(winTimer);
    flag("is-watch", false); flag("has-pad", false);
    flag("is-unplugged", true); flag("is-off", true);
    DESK.setPower(false);

    var throws = pulls >= 2 ? 2 : 1, t = 460;
    pose("shock");
    for (var i = 0; i < throws; i++) {
      (function (nth, start) {
        later(start, function () { pose("grab"); });
        later(start + 380, function () { flag("has-slipper", true); pose("windup"); });
        later(start + 720, function () { pose("throw"); flag("has-slipper", false); launch(nth); });
      })(i, t);
      t += 980;
    }
    t += 1300;                                           // the last slipper is in the air, then on the glass
    later(t, function () { pose("tug"); });
    later(t + 380, function () { flag("is-unplugged", false); });
    later(t + 780, function () { flag("is-off", false); DESK.setPower(true); });
    later(t + 1150, function () {
      if (pulls < 3) { resume(); return; }
      busy = false; guarding = true;
      pose("guard");
      setTimeout(function () { guarding = false; pulls = 0; resume(); }, 20000);
    });
  }

  var hit = wrap.querySelector(".b-plug-hit");
  if (hit) {
    hit.addEventListener("pointerenter", function (e) { if (!busy && e.pointerType !== "touch") flag("is-watch", true); });
    hit.addEventListener("pointerleave", function () { flag("is-watch", false); });
    hit.addEventListener("click", pull);
  }

  DESK.watch(settle);
  pose(DESK.typing > 0 ? "typing" : "idle");
  settle();
})();
