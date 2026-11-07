// The business page (business.html): one business account, everything included; the tour is a
// gallery of cards, one feature each, with a cut of the real app (img/business, made by tools/shot-demo.js).
"use strict";
(() => {
  const $ = id => document.getElementById(id), t = s => (window.I18N ? I18N.t(s) : s);
  // the tour: a gallery of cards, one feature each (img/business, cut from the app by tools/shot-demo.js), swiped or
  // scrolled sideways; the arrows and the dots move a card at a time
  const cards = [...$("slides").content.children].map(d => ({ shot: d.dataset.shot, kick: d.querySelector("u").textContent.trim(), title: d.querySelector("b").textContent.trim(), text: d.querySelector("i").textContent.trim() }));
  const SHOTS = ["da"], lang = () => (window.I18N ? I18N.lang : "en"), dir = () => "img/business/" + (SHOTS.includes(lang()) ? lang() + "/" : "");
  const esc = s => String(s).replace(/[<&"]/g, c => ({ "<": "&lt;", "&": "&amp;", '"': "&quot;" })[c]);
  const track = $("track");
  function draw() {
    track.innerHTML = cards.map((c, k) => `<article class="gcard" aria-roledescription="slide" aria-label="${esc(t("{0} of {1}").replace("{0}", k + 1).replace("{1}", cards.length))}">
      <div class="gt"><div class="kick">${esc(t(c.kick))}</div><h3>${esc(t(c.title))}</h3><p>${esc(t(c.text))}</p></div>
      <div class="gi"><img src="${dir()}${c.shot}.webp" alt="${esc(t(c.title))}" ${k > 2 ? 'loading="lazy"' : ""} decoding="async"></div></article>`).join("");
    $("dots").innerHTML = cards.map((c, k) => `<button type="button" data-k="${k}" aria-label="${esc(t(c.title))}"></button>`).join("");
    const hero = document.querySelector(".hero img"); if (hero) hero.src = dir() + "inventory.webp";
    mark();
  }
  const step = () => { const a = track.children[0], b = track.children[1]; return a && b ? b.offsetLeft - a.offsetLeft : 300; };
  // the card at the left edge: its dot marked; the arrows off at the ends
  const at = () => Math.round(track.scrollLeft / step());
  function mark() {
    const i = at(), end = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
    $("dots").querySelectorAll("button").forEach((b, k) => b.setAttribute("aria-current", String(k === i)));
    $("prev").disabled = track.scrollLeft <= 4; $("next").disabled = end;
  }
  const go = i => track.scrollTo({ left: Math.max(0, Math.min(cards.length - 1, i)) * step() });
  $("prev").onclick = () => go(at() - 1); $("next").onclick = () => go(at() + 1);
  $("dots").addEventListener("click", e => { const b = e.target.closest("button[data-k]"); if (b) go(Number(b.dataset.k)); });
  let raf = 0; track.addEventListener("scroll", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(mark); }, { passive: true });
  addEventListener("resize", mark);
  draw();
  if (window.I18N) I18N.onChange(draw);
  window.TOUR = { go, get at() { return at(); }, count: cards.length }; // for the tests
})();
