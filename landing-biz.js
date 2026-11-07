// Further down the front page (the gate, when nobody is logged in): AllWine for business, a card that leads to
// business.html. Its look and words are here, loaded only for the front page, so the cellar's first load stays as it was.
"use strict";
(function () {
  const W = {
    da: { kick: "Til erhverv", h: "Til restauranter, vinbarer, butikker og vingårde", p: "Lageret, I tæller og sælger fra, salg og avancer pr. periode, og et vinkort, der holder sig selv opdateret, online med en QR-kode.", go: "Se hvordan det virker →" },
    fr: { kick: "Pour les pros", h: "Pour les restaurants, bars à vin, cavistes et domaines", p: "Le stock que vous comptez et vendez, les ventes et les marges par période, et une carte des vins qui se tient à jour, en ligne avec un QR code.", go: "Voir comment ça marche →" },
    de: { kick: "Für Betriebe", h: "Für Restaurants, Weinbars, Läden und Weingüter", p: "Der Bestand, den Sie zählen und verkaufen, Umsatz und Margen je Zeitraum, und eine Weinkarte, die sich selbst aktuell hält, online mit QR-Code.", go: "So funktioniert es →" },
    en: { kick: "For business", h: "For restaurants, wine bars, shops and domaines", p: "The stock you count and sell from, sales and margins by period, and a wine card that keeps itself up to date, online with a QR code.", go: "See how it works →" },
  };
  const land = document.querySelector("#gate .landing"); if (!land || document.getElementById("bizband")) return;
  document.head.insertAdjacentHTML("beforeend", `<style>
.bizband{display:grid;grid-template-columns:minmax(0,220px) minmax(0,1fr);gap:32px;align-items:center;margin:40px 0 0;padding:24px 0 0;border-top:2px solid var(--ink);color:var(--ink);text-decoration:none}
.gate a.bizband{color:var(--ink)} .bizband img{width:100%;height:auto;border:1px solid var(--line);display:block}
.bizband .kick{font-size:12.5px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--accent)}
.bizband h2{font-family:var(--serif);font-size:clamp(22px,2.4vw,30px);margin:6px 0 8px} .bizband p{margin:0 0 12px;color:var(--muted);max-width:640px} .bizband .open{color:var(--accent);font-weight:600}
.bizband:hover .open{text-decoration:underline}
@media (max-width:640px){ .bizband{grid-template-columns:1fr;gap:18px} .bizband img{max-width:220px} }</style>`);
  const a = document.createElement("a"); a.className = "bizband"; a.id = "bizband"; a.href = "business.html";
  const draw = () => { const w = W[(window.I18N && I18N.lang) || "en"] || W.en, l = (window.I18N && I18N.lang) === "da" ? "da/" : "";
    a.innerHTML = `<img src="img/business/${l}quicksell.webp" alt="" width="1146" height="1248" loading="lazy" decoding="async">
      <div><span class="kick">${w.kick}</span><h2>${w.h}</h2><p>${w.p}</p><span class="open">${w.go}</span></div>`; };
  draw(); const foot = land.querySelector("[data-sitefoot]"); foot ? land.insertBefore(a, foot) : land.appendChild(a); // above the footer
  if (window.I18N && I18N.onChange) I18N.onChange(draw);
})();
