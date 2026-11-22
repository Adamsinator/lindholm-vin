// A short tour of the cellar page (9 steps): each step lights up the real control, the phone's where it differs (the ＋,
// the ⋯ menu, the bar at the bottom), with a line on what it does. app.js offers it (the welcome card, a one-time note,
// the account menu, index.html#tour) and loads this file only then. Its texts are here, in the four languages.
//   TOUR.start()     Esc, ← and → work; it remembers it was seen (per member, on this device)
(function () {
"use strict";
const STEPS = [
  { k: "hi" },
  { k: "add", at: ["#addBtn", "#pFab"] },
  { k: "imp", at: ["#impBtn", "#pMore"] },
  { k: "wall", at: ["#wall", "#kpis"] },
  { k: "find", at: ["#q"] },
  { k: "somm", at: ["#sommBtn"] },
  { k: "pages", at: [".gbar .tabs", "#ptabs"] },
  { k: "atlas", at: ["a.tablink"] },
  { k: "help", at: ["#helpLink", "#pMe"] },
];
const T = {
  en: { hi: ["Welcome to AllWine", "A one-minute look at what your cellar can do. Leave whenever you like: the tour is in the help menu."],
    add: ["Add a wine", "Type a few letters from the label: region, grape and classification fill in from what it says."],
    imp: ["Import a list", "From Excel, CSV, Vivino or CellarTracker. Rows of the same wine are joined and spellings tidied. Tidy up, next to it, does the same for the cellar later."],
    wall: ["Your cellar at a glance", "Every bottle on the rack, and what's ready now, closing soon or still too young."],
    find: ["Find a wine", "Search anything. Open a wine to drink a bottle, rate it, or set when it's ready."],
    somm: ["Ask the sommelier", "What to open tonight, what goes with lamb, how much wine for ten people: answered from your own cellar."],
    pages: ["Enjoyed, Wishlist, Journal", "What you've drunk, what you'd like to buy, and your tasting notes."],
    atlas: ["The wine atlas", "Every vineyard from the official maps, from Burgundy to Holbæk, with your bottles on them."],
    help: ["Help is here", "Answers and tips, and this tour again whenever you want it."],
    next: "Next", back: "Back", done: "Done", close: "Close the tour", of: "{0} of {1}" },
  da: { hi: ["Velkommen til AllWine", "Et minuts kig på, hvad din kælder kan. Gå ud når du vil: rundvisningen ligger i hjælpemenuen."],
    add: ["Tilføj en vin", "Skriv et par bogstaver fra etiketten: område, drue og klassifikation udfyldes ud fra, hvad der står."],
    imp: ["Importér en liste", "Fra Excel, CSV, Vivino eller CellarTracker. Rækker med samme vin lægges sammen, og stavemåder rettes. Ryd op, ved siden af, gør det samme for kælderen senere."],
    wall: ["Din kælder på et blik", "Hver flaske på reolen, og hvad der er klar nu, snart skal drikkes eller stadig er for ungt."],
    find: ["Find en vin", "Søg på hvad som helst. Åbn en vin for at drikke en flaske, give karakter eller sætte hvornår den er klar."],
    somm: ["Spørg sommelieren", "Hvad skal åbnes i aften, hvad passer til lam, hvor meget vin til ti personer: svaret ud fra din egen kælder."],
    pages: ["Nydt, Ønskeliste, Journal", "Hvad du har drukket, hvad du gerne vil købe, og dine smagsnoter."],
    atlas: ["Vinatlas", "Hver vinmark fra de officielle kort, fra Bourgogne til Holbæk, med dine flasker på."],
    help: ["Hjælpen er her", "Svar og tips, og denne rundvisning igen, når du vil."],
    next: "Næste", back: "Tilbage", done: "Færdig", close: "Luk rundvisningen", of: "{0} af {1}" },
  fr: { hi: ["Bienvenue sur AllWine", "Une minute pour voir ce que fait votre cave. Partez quand vous voulez : la visite est dans le menu d'aide."],
    add: ["Ajouter un vin", "Tapez quelques lettres de l'étiquette : région, cépage et classement se remplissent d'après ce qu'elle dit."],
    imp: ["Importer une liste", "Depuis Excel, CSV, Vivino ou CellarTracker. Les lignes d'un même vin sont réunies et l'orthographe harmonisée. Ranger, à côté, fait de même pour la cave plus tard."],
    wall: ["Votre cave d'un coup d'œil", "Chaque bouteille sur le casier, et ce qui est prêt, à boire bientôt ou encore trop jeune."],
    find: ["Trouver un vin", "Cherchez n'importe quoi. Ouvrez un vin pour boire une bouteille, la noter ou dire quand elle sera prête."],
    somm: ["Demandez au sommelier", "Que ouvrir ce soir, quoi avec l'agneau, combien de vin pour dix : la réponse vient de votre cave."],
    pages: ["Dégustés, Liste d'envies, Journal", "Ce que vous avez bu, ce que vous aimeriez acheter, et vos notes de dégustation."],
    atlas: ["L'atlas des vins", "Chaque vignoble d'après les cartes officielles, de la Bourgogne à Holbæk, avec vos bouteilles dessus."],
    help: ["L'aide est ici", "Réponses et astuces, et cette visite quand vous voulez."],
    next: "Suivant", back: "Retour", done: "Terminé", close: "Fermer la visite", of: "{0} sur {1}" },
  de: { hi: ["Willkommen bei AllWine", "Eine Minute, um zu sehen, was Ihr Keller kann. Gehen Sie jederzeit: Die Tour ist im Hilfemenü."],
    add: ["Einen Wein hinzufügen", "Ein paar Buchstaben vom Etikett: Region, Rebsorte und Klassifikation füllen sich nach dem, was darauf steht."],
    imp: ["Eine Liste importieren", "Aus Excel, CSV, Vivino oder CellarTracker. Zeilen desselben Weins werden zusammengeführt, Schreibweisen vereinheitlicht. Aufräumen, daneben, macht das später für den Keller."],
    wall: ["Ihr Keller auf einen Blick", "Jede Flasche im Regal, und was jetzt bereit ist, bald getrunken werden sollte oder noch zu jung ist."],
    find: ["Einen Wein finden", "Suchen Sie nach allem. Öffnen Sie einen Wein, um eine Flasche zu trinken, ihn zu bewerten oder festzulegen, wann er bereit ist."],
    somm: ["Fragen Sie den Sommelier", "Was heute Abend öffnen, was passt zu Lamm, wie viel Wein für zehn Personen: beantwortet aus Ihrem eigenen Keller."],
    pages: ["Genossen, Wunschliste, Journal", "Was Sie getrunken haben, was Sie kaufen möchten, und Ihre Verkostungsnotizen."],
    atlas: ["Der Weinatlas", "Jeder Weinberg nach den amtlichen Karten, vom Burgund bis Holbæk, mit Ihren Flaschen darauf."],
    help: ["Hier ist die Hilfe", "Antworten und Tipps, und diese Tour, wann immer Sie möchten."],
    next: "Weiter", back: "Zurück", done: "Fertig", close: "Tour schließen", of: "{0} von {1}" },
};
const L = () => T[(window.I18N && I18N.lang) || "en"] || T.en, esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const shown = e => { if (!e) return false; const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && !e.closest("[hidden]"); };
const target = s => (s.at || []).map(q => document.querySelector(q)).find(shown) || null;
// its look, here so the cellar page carries none of it: the page dimmed but for the control, a card beside it
const CSS = `.tour-shade{position:fixed;inset:0;z-index:2000}
.tour-hole{position:fixed;z-index:2001;border-radius:12px;box-shadow:0 0 0 3px var(--gold,#c9a227),0 0 0 9999px rgba(20,10,12,.55);pointer-events:none;transition:all .3s cubic-bezier(.2,.8,.2,1)}
.tour-card{position:fixed;z-index:2002;background:var(--card,#fff);color:var(--ink,#222);border-radius:14px;padding:16px 18px 14px;box-shadow:0 12px 40px rgba(0,0,0,.3);transition:top .3s,left .3s}
.tour-card h3{margin:0 28px 6px 0;font-size:17px} .tour-card p{margin:0 0 12px;line-height:1.45;font-size:14.5px} .tour-card .tour-n{margin:0 0 4px;font-size:12px;color:var(--muted,#777);letter-spacing:.04em}
.tour-x{position:absolute;right:8px;top:6px;border:0;background:none;font-size:22px;line-height:1;color:var(--muted,#777);cursor:pointer;padding:4px 8px}
.tour-b{display:flex;gap:8px;justify-content:flex-end}
@media (prefers-reduced-motion:reduce){.tour-hole,.tour-card{transition:none}}`;
let i = 0, hole = null, card = null, onKey = null, onMove = null, tgt = null;
function place() {
  if (!card) return;
  const pad = 6, vw = innerWidth, vh = innerHeight, cw = Math.min(360, vw - 24);
  card.style.width = cw + "px";
  if (!tgt) { hole.style.cssText = "left:50%;top:50%;width:0;height:0"; card.style.left = (vw - cw) / 2 + "px"; card.style.top = Math.max(12, (vh - card.offsetHeight) / 2) + "px"; return; }
  const r = tgt.getBoundingClientRect();
  hole.style.cssText = `left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + 2 * pad}px;height:${r.height + 2 * pad}px`;
  const ch = card.offsetHeight, below = r.bottom + pad + 12, above = r.top - pad - 12 - ch;
  const top = below + ch < vh - 8 ? below : above > 8 ? above : Math.max(8, vh - ch - 8);
  card.style.top = top + "px"; card.style.left = Math.min(vw - cw - 12, Math.max(12, r.left + r.width / 2 - cw / 2)) + "px";
}
function show(n) {
  i = Math.max(0, Math.min(STEPS.length - 1, n));
  const s = STEPS[i], t = L(), [h, p] = t[s.k], last = i === STEPS.length - 1;
  tgt = target(s);
  card.innerHTML = `<button type="button" class="tour-x" data-t="x" aria-label="${esc(t.close)}">×</button>
    <p class="tour-n">${esc(t.of.replace("{0}", i + 1).replace("{1}", STEPS.length))}</p><h3 id="tourH">${esc(h)}</h3><p>${esc(p)}</p>
    <div class="tour-b">${i ? `<button type="button" class="btn quiet" data-t="back">${esc(t.back)}</button>` : ""}<button type="button" class="btn primary" data-t="${last ? "x" : "next"}">${esc(last ? t.done : t.next)}</button></div>`;
  if (tgt && getComputedStyle(tgt).position !== "fixed" && !tgt.closest(".ptabs")) { const r = tgt.getBoundingClientRect(); if (r.top < 60 || r.bottom > innerHeight - 160) tgt.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }
  place(); setTimeout(place, 350); // after the scroll
  card.querySelector(".tour-b .primary").focus({ preventScroll: true });
}
function end() {
  try { localStorage.setItem(typeof TOUR_KEY === "function" ? TOUR_KEY() : "vinTour", "1") /* app.js's TOUR_KEY: a const, so not on window */; } catch (e) {}
  [hole, card, document.querySelector(".tour-shade")].forEach(e => e && e.remove()); hole = card = tgt = null;
  removeEventListener("keydown", onKey, true); removeEventListener("resize", onMove); removeEventListener("scroll", onMove, true);
  document.body.classList.remove("touring");
}
function start(n) {
  if (card) end();
  if (!document.getElementById("tourCss")) { const st = document.createElement("style"); st.id = "tourCss"; st.textContent = CSS; document.head.appendChild(st); }
  document.body.classList.add("touring");
  const shade = document.createElement("div"); shade.className = "tour-shade"; document.body.appendChild(shade); // takes stray taps: the page waits
  hole = document.createElement("div"); hole.className = "tour-hole"; hole.setAttribute("aria-hidden", "true"); document.body.appendChild(hole);
  card = document.createElement("div"); card.className = "tour-card"; card.setAttribute("role", "dialog"); card.setAttribute("aria-labelledby", "tourH"); document.body.appendChild(card);
  card.addEventListener("click", e => { const b = e.target.closest("[data-t]"); if (!b) return; b.dataset.t === "x" ? end() : show(i + (b.dataset.t === "next" ? 1 : -1)); });
  onKey = e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); end(); } else if (e.key === "ArrowRight") show(i + 1); else if (e.key === "ArrowLeft") show(i - 1); };
  onMove = () => place();
  addEventListener("keydown", onKey, true); addEventListener("resize", onMove); addEventListener("scroll", onMove, true);
  show(n || 0);
}
window.TOUR = { start, end, steps: STEPS.length, step: () => i, open: () => !!card };
})();
