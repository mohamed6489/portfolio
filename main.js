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

// Typing on scroll: headings are typed like commands as they come into view,
// and paragraphs print after them, fast. The full text stays in the page the
// whole time (untyped letters are only transparent), so layout never jumps and
// screen readers and search engines read it normally. Each piece types once.
(function () {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

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
    (function step() {
      n = Math.min(len, n + perTick);
      part.done.textContent = part.text.slice(0, n);
      part.wait.textContent = part.text.slice(n);
      if (n < len) return setTimeout(step, tick);
      setTimeout(function () { part.caret.hidden = true; }, hold);
    })();
  }
  function duration(part, heading) {
    return heading ? Math.min(900, 200 + part.text.length * 60) : Math.max(550, Math.min(1900, part.text.length * 11));
  }

  // The hero name types first; the lines under it wait their turn.
  var nameEl = document.getElementById("hero-name");
  var heroReady = Date.now() + (nameEl ? 350 + nameEl.textContent.length * 85 + 150 : 0);

  var queue = [], draining = false;
  function drain() {
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
    var limit = window.innerHeight * 0.94, now = Date.now(), shown = [];
    pending = pending.filter(function (el) {
      if (el._hero && now < heroReady) return true;
      var r = el.getBoundingClientRect();
      if (r.top < limit && r.bottom > 0) { shown.push(el); return false; }
      return true;
    });
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
      el._type = { part: part, heading: heading };
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
  setTimeout(function tick() {
    n++;
    done.textContent = text.slice(0, n);
    wait.textContent = text.slice(n);
    if (n < text.length) setTimeout(tick, 85);
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

  var W = window.innerWidth, H = window.innerHeight;
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
      y: rnd(),                               // 0..1 of the looping height
      depth: 0.07 + rnd() * 0.33,             // how fast it drifts with the scroll
      turn: written ? (rnd() - 0.5) * 0.03 : (rnd() - 0.5) * 0.16,   // spin per pixel scrolled; writing barely tilts
      sway: rnd() * 6.28, dir: rnd() < 0.5 ? -1 : 1,
      ox: 0, oy: 0, vx: 0, vy: 0, rot: written ? (rnd() - 0.5) * 16 : (rnd() - 0.5) * 50, spin: 0, near: false, written: written
    });
  }

  var still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var mx = -9999, my = -9999, last = 0, t = 0;
  var REACH = 160, PUSH = 2.2, SPRING = 0.03, DRAG = 0.86;

  function place(time) {
    // t is the seconds the sky has been on screen; a long gap (a hidden tab) counts as one frame
    if (last) t += Math.min(0.05, (time - last) / 1000);
    last = time;
    var sy = still ? 0 : window.scrollY, loop = H + 160;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      // where it would sit with no mouse nearby: floating up on its own, faster while the
      // page scrolls, looping, with a slow sway from side to side
      var bx = it.x * W + Math.sin(sy / 260 + t * 0.35 + it.sway) * 20 * it.dir;
      var by = ((((it.y * loop - sy * it.depth - t * (6 + it.depth * 45)) % loop) + loop) % loop) - 80;
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
  window.addEventListener("resize", function () { W = window.innerWidth; H = window.innerHeight; });
  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    document.addEventListener("pointermove", function (e) { if (e.pointerType !== "touch") { mx = e.clientX; my = e.clientY; } });
    document.documentElement.addEventListener("pointerleave", function () { mx = my = -9999; });
  }
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
    (function tick() {
      n++;
      p.innerHTML = esc(cmd.slice(0, n)) + "<span class=\"caret\"></span>";
      if (n < cmd.length) return setTimeout(tick, 55);
      setTimeout(function () {
        p.remove();
        run(cmd);
        setTimeout(function () { typeCmd(i + 1); }, 380);
      }, 320);
    })();
  }
  setTimeout(function () { typeCmd(0); }, 500);
})();
