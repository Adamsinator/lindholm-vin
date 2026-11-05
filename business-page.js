// The business page (business.html): the kind of business picks what's shown and which price is marked; the tour is a
// slideshow of real screens (img/business, made by tools/shot-demo.js), clicked through, by keys, or swiped.
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

  // the tour
  const slides = [...$("slides").content.children].map(d => ({ img: d.dataset.img, phone: d.hasAttribute("data-phone"), title: d.querySelector("b").textContent.trim(), text: d.querySelector("i").textContent.trim() }));
  let at = 0;
  // the screens in the page's language where we have them (img/business/da), else the English ones
  const SHOTS = ["da"], src = u => { const l = window.I18N ? I18N.lang : "en"; return SHOTS.includes(l) ? u.replace("img/business/", "img/business/" + l + "/") : u; };
  function show(i, focus) {
    at = (i + slides.length) % slides.length; const s = slides[at], img = $("slideImg");
    img.classList.add("fade");
    const swap = () => { img.src = src(s.img); img.alt = t(s.title) + ": " + t(s.text); img.className = s.phone ? "phone" : ""; };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) swap(); else setTimeout(swap, 120);
    $("slideN").textContent = t("{0} of {1}").replace("{0}", at + 1).replace("{1}", slides.length);
    $("slideT").textContent = t(s.title); $("slideP").textContent = t(s.text);
    $("steps").innerHTML = slides.map((x, k) => `<li><button type="button" data-k="${k}"${k === at ? ' aria-current="true"' : ""}>${k + 1}. ${t(x.title).replace(/[<&]/g, c => c === "<" ? "&lt;" : "&amp;")}</button></li>`).join("");
    if (focus) { const b = $("steps").querySelector(`[data-k="${at}"]`); if (b) b.focus(); }
    // the next screen, fetched ahead so the click shows it at once
    const n = new Image(); n.src = src(slides[(at + 1) % slides.length].img);
    const hero = document.querySelector(".hero img"); if (hero) hero.src = src("img/business/inventory.jpg");
  }
  $("slideImg").addEventListener("load", () => $("slideImg").classList.remove("fade"));
  $("prev").onclick = () => show(at - 1); $("next").onclick = () => show(at + 1);
  $("steps").addEventListener("click", e => { const b = e.target.closest("button[data-k]"); if (b) show(Number(b.dataset.k)); });
  $("tourBox").addEventListener("keydown", e => { if (e.key === "ArrowRight") { e.preventDefault(); show(at + 1, true); } if (e.key === "ArrowLeft") { e.preventDefault(); show(at - 1, true); } });
  let x0 = null;
  $("stage").addEventListener("pointerdown", e => { x0 = e.clientX; });
  $("stage").addEventListener("pointerup", e => { if (x0 == null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 40) show(at + (dx < 0 ? 1 : -1)); });
  show(0);
  if (window.I18N) I18N.onChange(() => show(at));
})();
