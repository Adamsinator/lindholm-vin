// The business page (business.html): the kind of business picks what's shown and which price is marked; the tour is a
// slideshow of real screens that plays by itself and rings what each is about (img/business, made by tools/shot-demo.js).
"use strict";
(() => {
  const $ = id => document.getElementById(id), t = s => (window.I18N ? I18N.t(s) : s);
  // the kind: the features for it, its price marked; remembered in the address (#restaurant, #merchant, #winemaker)
  function setKind(k) {
    document.querySelectorAll("#kinds button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.kind === k)));
    document.querySelectorAll("#feats .feat").forEach(f => { f.hidden = !f.dataset.for.split(" ").includes(k); });
    document.querySelectorAll("#plans .plan").forEach(p => p.classList.toggle("on", p.dataset.plan === k));
  }
  $("kinds").addEventListener("click", e => { const b = e.target.closest("button[data-kind]"); if (!b) return; setKind(b.dataset.kind); history.replaceState(null, "", "#" + b.dataset.kind); });
  const fromHash = () => { const k = location.hash.slice(1); setKind(["restaurant", "merchant", "winemaker"].includes(k) ? k : (document.querySelector('#kinds [aria-pressed="true"]') || {}).dataset?.kind || "restaurant"); };
  fromHash(); window.addEventListener("hashchange", fromHash);

  // the tour: a slideshow of real screens (img/business, made by tools/shot-demo.js with tour.json, where each screen's
  // callouts are). It plays by itself once it's in view: each screen, then its callouts one by one, the thing ringed
  // and the rest dimmed; then the next. A click on a step or a callout, a swipe, the arrow keys, or ❚❚ take over.
  const slides = [...$("slides").content.children].map(d => ({ shot: d.dataset.shot, title: d.querySelector("b").textContent.trim(), text: d.querySelector("i").textContent.trim(),
    callouts: [...d.querySelectorAll("s")].map(x => x.textContent.trim()) }));
  const SHOTS = ["da"], lang = () => (window.I18N ? I18N.lang : "en"), dir = () => "img/business/" + (SHOTS.includes(lang()) ? lang() + "/" : "");
  const TOURS = {}, tour = () => TOURS[dir()] || {};
  const loadTour = d => TOURS[d] ? Promise.resolve() : fetch(d + "tour.json").then(r => r.ok ? r.json() : {}).catch(() => ({})).then(j => { TOURS[d] = j; });
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const FIRST = 1600, EACH = 2900, LAST = 1500, BARE = 5600; // ms: the screen alone, each callout, after the last, a screen without callouts
  let at = 0, step = -1, playing = !reduce.matches, inView = false, t0 = 0, left = 0, timer = 0, raf = 0;
  const esc = s => String(s).replace(/[<&"]/g, c => ({ "<": "&lt;", "&": "&amp;", '"': "&quot;" })[c]);
  const spotsOf = i => ((tour()[slides[i].shot] || {}).spots || []).slice(0, slides[i].callouts.length);
  // how long this step stays: the screen alone, then each callout
  const dur = () => { const n = spotsOf(at).length; return !n ? BARE : step < 0 ? FIRST : step === n - 1 ? EACH + LAST : EACH; };

  $("bars").innerHTML = slides.map((s, k) => `<button type="button" data-k="${k}"><span><i></i></span></button>`).join("");
  function bars() {
    $("bars").querySelectorAll("button").forEach((b, k) => { b.classList.toggle("done", k < at); b.setAttribute("aria-label", `${k + 1}. ${t(slides[k].title)}`);
      if (k === at) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current"); if (k !== at) b.querySelector("i").style.width = ""; });
  }
  // the share of this slide that has passed, for its bar
  function progress() {
    const n = spotsOf(at).length, total = n ? FIRST + n * EACH + LAST : BARE;
    const before = !n || step < 0 ? 0 : FIRST + step * EACH, spent = dur() - left + (playing && inView && timer ? performance.now() - t0 : 0);
    const i = $("bars").querySelector(`[data-k="${at}"] i`); if (i) i.style.width = Math.min(100, (before + spent) / total * 100) + "%";
    if (playing && inView) raf = requestAnimationFrame(progress);
  }
  function stop() { clearTimeout(timer); timer = 0; cancelAnimationFrame(raf); }
  function run() {
    stop(); if (!playing || !inView) { progress(); return; }
    t0 = performance.now(); timer = setTimeout(advance, left); raf = requestAnimationFrame(progress);
  }
  function advance() {
    const n = spotsOf(at).length;
    if (step < n - 1) { step++; drawSpots(); left = dur(); run(); } else show(at + 1);
  }
  function pause() { if (timer) left = Math.max(0, left - (performance.now() - t0)); stop(); progress(); }
  function setPlaying(on) { playing = on; $("play").textContent = on ? "❚❚" : "▶"; $("play").setAttribute("aria-label", t(on ? "Pause" : "Play")); if (on) run(); else pause(); }

  // the callouts on the screen: the ring (and the rest dimmed) for the one that's on, with its words beside it
  function drawSpots() {
    const s = slides[at], sp = spotsOf(at);
    $("spots").innerHTML = sp.map(([x, y, w, h], k) => {
      const pad = 0.6; // per cent: a little room round the thing
      const box = `left:${x * 100 - pad}%;top:${y * 100 - pad * 1.6}%;width:${w * 100 + 2 * pad}%;height:${h * 100 + 3.2 * pad}%`;
      // the words go below the ring if there's room, else above; left-aligned with it, kept inside the screen
      const below = y + h < 0.7, bx = Math.min(Math.max(x * 100, 2), 56);
      const bub = `left:${bx}%;${below ? `top:calc(${(y + h) * 100 + 2}% + 10px)` : `bottom:calc(${(1 - y) * 100 + 2}% + 10px)`}`;
      return `<div class="spot${k === step ? " on" : ""}" style="${box}"><b>${k + 1}</b></div><div class="bubble${k === step ? " on" : ""}" style="${bub}">${esc(t(s.callouts[k]))}</div>`;
    }).join("");
    $("callouts").querySelectorAll("button").forEach((b, k) => b.setAttribute("aria-current", String(k === step)));
  }
  function show(i, opt = {}) {
    stop(); at = (i + slides.length) % slides.length; step = opt.step ?? -1;
    const s = slides[at], d = tour()[s.shot] || {}, scr = $("screen"), img = $("slideImg");
    const swap = () => {
      img.src = dir() + s.shot + ".webp"; img.width = (d.w || 1120) * 2; img.height = (d.h || 700) * 2;
      img.alt = t(s.title) + ": " + t(s.text); scr.className = "screen" + (d.phone ? " phone" : "");
      drawSpots(); requestAnimationFrame(() => scr.classList.remove("out"));
    };
    if (reduce.matches || opt.now) swap(); else { scr.classList.add("out"); setTimeout(swap, 180); }
    $("slideN").textContent = t("{0} of {1}").replace("{0}", at + 1).replace("{1}", slides.length);
    $("slideT").textContent = t(s.title); $("slideP").textContent = t(s.text);
    $("callouts").innerHTML = s.callouts.map((c, k) => `<li><button type="button" data-c="${k}" aria-current="${k === step}"><i>${k + 1}</i><span>${esc(t(c))}</span></button></li>`).join("");
    $("callouts").hidden = !s.callouts.length;
    bars(); left = dur(); run();
    // the next screen, fetched ahead
    const n = new Image(); n.src = dir() + slides[(at + 1) % slides.length].shot + ".webp";
  }
  $("prev").onclick = () => show(at - 1); $("next").onclick = () => show(at + 1);
  $("bars").addEventListener("click", e => { const b = e.target.closest("button[data-k]"); if (b) show(Number(b.dataset.k)); });
  // a callout picked by hand: shown, and the show waits there
  $("callouts").addEventListener("click", e => { const b = e.target.closest("button[data-c]"); if (!b) return; setPlaying(false); step = Number(b.dataset.c); drawSpots(); });
  $("play").onclick = () => setPlaying(!playing);
  $("full").onclick = () => { const box = $("tourBox"); if (document.fullscreenElement) document.exitFullscreen(); else if (box.requestFullscreen) box.requestFullscreen().catch(() => {}); };
  if (!document.fullscreenEnabled) $("full").hidden = true;
  $("tourBox").addEventListener("keydown", e => {
    if (e.target.closest("input,select,textarea")) return;
    if (e.key === "ArrowRight") { e.preventDefault(); show(at + 1); } else if (e.key === "ArrowLeft") { e.preventDefault(); show(at - 1); }
    else if (e.key === " " && !e.target.closest("button")) { e.preventDefault(); setPlaying(!playing); } });
  let x0 = null;
  $("stage").addEventListener("pointerdown", e => { x0 = e.clientX; });
  $("stage").addEventListener("pointerup", e => { if (x0 == null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 40) show(at + (dx < 0 ? 1 : -1)); });
  // it plays only while it's on the screen and the tab is open
  const seen = () => { const r = $("stage").getBoundingClientRect(); return !document.hidden && r.bottom > innerHeight * 0.25 && r.top < innerHeight * 0.75; };
  const watch = () => { const v = seen(); if (v === inView) return; inView = v; if (v) run(); else pause(); };
  if ("IntersectionObserver" in window) new IntersectionObserver(watch, { threshold: [0, 0.25, 0.5, 0.75, 1] }).observe($("stage"));
  addEventListener("scroll", watch, { passive: true }); document.addEventListener("visibilitychange", watch);
  const start = () => loadTour(dir()).then(() => { show(at, { now: true, step }); watch(); });
  setPlaying(playing); start();
  if (window.I18N) I18N.onChange(() => { const h = document.querySelector(".hero img"); if (h) h.src = dir() + "inventory.webp"; start(); });
  const hero = document.querySelector(".hero img"); if (hero) hero.src = dir() + "inventory.webp";
  window.TOUR = { show, get at() { return at; }, get step() { return step; }, get playing() { return playing; }, setPlaying }; // for the tests
})();
