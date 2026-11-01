// AllWine for a business: a restaurant or wine bar, a wine merchant or shop, a winemaker. Loaded by app.js only when the
// account's kind isn't private (Account → What kind of account). The same wines; on top of them:
//  · per wine: the price on the card or price list (with Danish VAT, moms 25 %, included, as a guest sees it), the price
//    by the glass (a restaurant), the supplier (the cellar's "Bought at"), and what that makes: the margin and the mark-up;
//  · in the overview: the stock at cost and at card price, the average margin, what has no price yet, the suppliers;
//    for a winemaker, its own wines by vintage;
//  · the wine card or price list, printable (or saved as a PDF): in stock and priced only, so a sold-out wine leaves it
//    by itself.
// Uses app.js's globals (WINES, KIND, api, normalize, tr, esc, kr, fmt…), like the other scripts of the page.
"use strict";
window.BIZ = (() => {
  const VAT = 0.25;
  const WORDS = {
    restaurant: { stock: "Your stock", sell: "Menu price", card: "Wine card", glass: true },
    merchant:   { stock: "Your stock", sell: "Sale price", card: "Price list", glass: false },
    winemaker:  { stock: "Your cellar", sell: "Cellar-door price", card: "Price list", glass: false },
  };
  const words = () => WORDS[KIND] || WORDS.restaurant;
  // a word inside a sentence: lower case, except in German, where a noun keeps its capital
  const low = s => window.I18N && I18N.lang === "de" ? s : s.toLowerCase();
  const on = () => KIND !== "private";
  // the margin on a sale: the price without VAT, less what the bottle cost; and the mark-up, the price over the cost
  function margin(w) {
    if (!(w.price > 0) || !(w.menuPrice > 0)) return null;
    const net = w.menuPrice / (1 + VAT);
    return { net, gross: net - w.price, pct: (net - w.price) / net, x: w.menuPrice / w.price };
  }
  const pct = x => (x * 100).toLocaleString(window.I18N ? I18N.lang : "en", { maximumFractionDigits: 0 }) + " %";
  const times = x => "× " + x.toLocaleString(window.I18N ? I18N.lang : "en", { maximumFractionDigits: 1 });

  /* ---------- words and the wine card's button ---------- */
  function apply() {
    const t = $("wallTitle"); if (t) trSet(on() ? words().stock : "Your cellar", t);
    let b = $("bizCardBtn");
    if (!b) { b = document.createElement("button"); b.className = "btn"; b.id = "bizCardBtn"; b.type = "button";
      $("addBtn").after(b); b.addEventListener("click", openCard); }
    b.hidden = !on(); b.textContent = "🧾 " + tr(words().card);
    if (!on()) { const p = $("bizPanel"); if (p) p.hidden = true; }
  }
  const cardLabel = () => tr(words().card);

  /* ---------- a wine's business fields, in its details ---------- */
  function detail(w) {
    if (!on()) return "";
    const m = margin(w), W = words();
    const num = (f, label, v) => `<label class="bz-f">${esc(tr(label))}<input class="bz-in" type="number" min="0" step="1" inputmode="decimal" data-f="${f}" data-row="${w.row}" value="${v != null ? v : ""}" placeholder="—"></label>`;
    return `<div class="bz-d">
      ${num("menuPrice", W.sell, w.menuPrice)}
      ${W.glass ? num("glassPrice", "By the glass", w.glassPrice) : ""}
      <label class="bz-f">${esc(tr("Supplier"))}<input class="bz-in" data-f="source" data-row="${w.row}" list="bzSup" value="${esc(w.source)}" placeholder="—"></label>
      <span class="bz-m">${m ? esc(tr("Margin {0} ({1} a bottle, VAT excluded) · mark-up {2}", pct(m.pct), kr(Math.round(m.gross)), times(m.x)))
        : esc(tr(w.price > 0 ? "Set a price to see the margin" : "Add the cost price to see the margin"))}</span>
    </div>`;
  }
  // saved when the field is left (or Enter): one wine, one field
  document.addEventListener("change", async e => {
    const inp = e.target.closest && e.target.closest(".bz-in"); if (!inp) return;
    const row = Number(inp.dataset.row), f = inp.dataset.f, v = inp.value.trim();
    if (f !== "source" && v !== "" && !(Number(v) >= 0)) { toast(tr("A price is a number of 0 or more")); return; }
    inp.disabled = true;
    try {
      const res = await api({ action: "setinfo", row, fields: { [f]: f === "source" ? v : (v === "" ? "" : Number(v)) } });
      KEEP_OPEN = row; WINES = normalize(res.wines); renderOverview(); renderTable(); renderEnjoyed();
      toast(tr("Saved"));
    } catch (err) { toast(tr("Could not save: {0}", errText(err))); inp.disabled = false; }
  });
  const priceCell = w => on() && w.menuPrice > 0 ? `<small class="bz-mp" title="${esc(tr(words().sell))}">${esc(kr(w.menuPrice))}</small>` : "";

  /* ---------- the overview: money, what's missing, suppliers; a winemaker's own wines ---------- */
  function overview(cellar) {
    let p = $("bizPanel");
    if (!on()) { if (p) p.hidden = true; return; }
    if (!p) { p = document.createElement("section"); p.id = "bizPanel"; p.className = "panel bz-p"; $("wall").after(p); }
    p.hidden = false;
    const W = words(), sum = (a, f) => a.reduce((n, w) => n + f(w), 0);
    const cost = sum(cellar, w => (w.price || 0) * w.left), sale = sum(cellar, w => (w.menuPrice || 0) * w.left);
    const both = cellar.filter(w => margin(w)), net = sum(both, w => margin(w).net * w.left), gross = sum(both, w => margin(w).gross * w.left);
    const noPrice = cellar.filter(w => !(w.menuPrice > 0)), glass = cellar.filter(w => w.glassPrice > 0);
    const sup = {}; cellar.forEach(w => { const k = w.source || ""; if (k) sup[k] = (sup[k] || 0) + w.left; });
    const sups = Object.entries(sup).sort((a, b) => b[1] - a[1]).slice(0, 5);
    $("bzSup") || document.body.insertAdjacentHTML("beforeend", '<datalist id="bzSup"></datalist>');
    $("bzSup").innerHTML = Object.keys(sup).sort().map(s => `<option>${esc(s)}</option>`).join("");
    const fig = (n, l) => `<div class="bz-k"><b>${n}</b><span>${esc(l)}</span></div>`;
    let own = "";
    if (KIND === "winemaker") {
      const dom = domaine(), mine = dom ? cellar.filter(w => w.producer.toLowerCase().includes(dom.toLowerCase())) : [];
      const byWine = {}; mine.forEach(w => { const k = w.name || w.producer; (byWine[k] = byWine[k] || []).push(w); });
      own = `<h3>${esc(tr("Your own wines"))}</h3>
        <label class="bz-f bz-dom">${esc(tr("Your domaine, as on the label"))}<input id="bzDom" value="${esc(dom)}" placeholder="${esc(tr("e.g. Domaine Dupont"))}"></label>
        ${dom ? (mine.length ? `<div class="bz-own">${Object.entries(byWine).map(([k, ws]) => `<div><b>${esc(k)}</b> ${ws.sort((a, b) => (a.vintage || 0) - (b.vintage || 0)).map(w => `<span class="bz-v">${esc(w.vintage || "NV")} · ${esc(btl(fmt(w.left)))}</span>`).join(" ")}</div>`).join("")}</div>`
          : `<p class="note">${esc(tr("No wines from {0} in the cellar yet.", dom))}</p>`) : ""}`;
    }
    p.innerHTML = `<h2>${esc(tr(KIND === "restaurant" ? "The business" : KIND === "merchant" ? "The shop" : "The domaine"))}</h2>
      <div class="bz-ks">
        ${fig(SHOW_PRICES ? kr(Math.round(cost)) : "···", tr("Stock at cost"))}
        ${fig(SHOW_PRICES ? kr(Math.round(sale)) : "···", tr("Stock at {0}", low(tr(W.sell))))}
        ${fig(both.length ? pct(gross / net) : "—", tr("Average margin, VAT excluded"))}
        ${W.glass ? fig(fmt(glass.length), tr("Wines by the glass")) : ""}
      </div>
      ${noPrice.length ? `<p class="note">${esc(tr(noPrice.length === 1 ? "1 wine in stock has no {1} yet: it's left off the {2}." : "{0} wines in stock have no {1} yet: they're left off the {2}.", fmt(noPrice.length), low(tr(W.sell)), low(tr(W.card))))}</p>` : ""}
      ${sups.length ? `<h3>${esc(tr("Suppliers"))}</h3><ul class="bz-sup">${sups.map(([k, n]) => `<li><span>${esc(k)}</span><b>${esc(btl(fmt(n)))}</b></li>`).join("")}</ul>` : ""}
      ${own}
      <p class="bz-foot"><button type="button" class="btn" data-bz="card">🧾 ${esc(tr(W.card))}</button> <span class="note">${esc(tr("Prices include VAT (moms 25 %); the margin is worked out without it."))}</span></p>`;
    p.querySelector('[data-bz="card"]').onclick = openCard;
    const d = $("bzDom"); if (d) d.onchange = () => { setDomaine(d.value.trim()); overview(WINES.filter(w => w.left > 0)); };
  }
  const domKey = () => "vinDomaine:" + String(cfg.user || "").toLowerCase();
  function domaine() {
    try { const x = window.VAULT && VAULT.active() && VAULT.prefs(); if (x && typeof x.domaine === "string") return x.domaine; } catch (e) {}
    return localStorage.getItem(domKey()) || "";
  }
  function setDomaine(v) { try { localStorage.setItem(domKey(), v); } catch (e) {} if (window.VAULT && VAULT.active()) savePrefs({ domaine: v }).catch(() => {}); }

  /* ---------- the wine card / price list: on the page, printable ---------- */
  const STYLE_ORDER = ["Bobler", "Hvid", "Rosé", "Rød"], STYLE_NAME = { Bobler: "Sparkling", Hvid: "White", "Rosé": "Rosé", "Rød": "Red" };
  const titleKey = () => "vinCardTitle:" + String(cfg.user || "").toLowerCase();
  function openCard() {
    const W = words(), list = WINES.filter(w => w.left > 0 && w.menuPrice > 0);
    let c = $("bizCard");
    if (!c) { c = document.createElement("div"); c.id = "bizCard"; c.className = "bz-card"; c.setAttribute("role", "dialog"); c.setAttribute("aria-modal", "true"); document.body.appendChild(c); }
    const groups = STYLE_ORDER.concat([...new Set(list.map(w => w.style))].filter(s => !STYLE_ORDER.includes(s)))
      .map(s => [s, list.filter(w => w.style === s).sort((a, b) => (a.country || "").localeCompare(b.country || "") || (a.region || "").localeCompare(b.region || "")
        || a.producer.localeCompare(b.producer) || (a.vintage || 0) - (b.vintage || 0))]).filter(g => g[1].length);
    const title = localStorage.getItem(titleKey()) || tr(W.card);
    c.innerHTML = `<div class="bz-bar"><button type="button" class="btn primary" data-bz="print">🖨 ${esc(tr("Print or save as PDF"))}</button>
        <button type="button" class="btn" data-bz="close">${esc(tr("Close"))}</button>
        <span class="note">${esc(tr(list.length === 1 ? "1 wine: in stock and priced. Click the title to change it." : "{0} wines: in stock and priced. Click the title to change it.", fmt(list.length)))}</span></div>
      <article class="bz-sheet">
        <h1 contenteditable="true" spellcheck="false" id="bzTitle">${esc(title)}</h1>
        ${groups.length ? groups.map(([s, ws]) => {
          let reg = "";
          return `<h2>${esc(tr(STYLE_NAME[s] || s))}</h2>` + ws.map(w => {
            const r = [w.region, w.country].filter(Boolean).join(", "), head = r !== reg ? `<h3>${esc(r)}</h3>` : ""; reg = r;
            return head + `<div class="bz-l"><span class="bz-w"><b>${esc(w.producer)}</b> ${esc([w.name, w.classification].filter(Boolean).join(" · "))}</span>
              <span class="bz-y">${esc(w.vintage || "NV")}</span>
              ${KIND === "merchant" ? `<span class="bz-s">${esc(btl(fmt(w.left)))}</span>` : ""}
              ${W.glass ? `<span class="bz-g">${w.glassPrice > 0 ? esc(fmt(w.glassPrice)) : ""}</span>` : ""}
              <span class="bz-pr">${esc(fmt(w.menuPrice))}</span></div>`; }).join("");
        }).join("") : `<p class="note">${esc(tr("No wines with a {0} yet: set one in a wine's details.", low(tr(W.sell))))}</p>`}
        <p class="bz-fine">${esc(tr("Prices in kr. including VAT."))}${W.glass ? " " + esc(tr("The first price is by the glass.")) : ""}</p>
      </article>`;
    c.hidden = false; document.body.classList.add("bz-open");
    const close = () => { c.hidden = true; document.body.classList.remove("bz-open"); };
    c.querySelector('[data-bz="close"]').onclick = close;
    c.querySelector('[data-bz="print"]').onclick = () => window.print();
    const h = $("bzTitle"); h.onblur = () => { const v = h.textContent.trim(); try { v ? localStorage.setItem(titleKey(), v) : localStorage.removeItem(titleKey()); } catch (e) {} };
    h.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); h.blur(); } };
    c.onkeydown = e => { if (e.key === "Escape" && e.target !== h) close(); };
    c.querySelector('[data-bz="print"]').focus();
  }

  // the styles, once
  document.head.insertAdjacentHTML("beforeend", `<style>
.bz-d{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:end;margin:10px 0;padding:10px 12px;border-radius:10px;background:var(--card2,rgba(0,0,0,.03));border:1px solid var(--line)}
.bz-f{display:grid;gap:3px;font-size:12px;color:var(--muted)} .bz-f input{width:120px;font:inherit;font-size:14px;color:var(--ink);padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:var(--bg)}
.bz-f input[data-f="source"],.bz-dom input{width:200px}
.bz-m{font-size:13px;color:var(--ink);flex-basis:100%}
.bz-mp{display:block;font-size:11.5px;color:var(--muted)}
.bz-p{margin:0 0 16px} .bz-p h2{margin-top:0} .bz-ks{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin:6px 0 10px}
.bz-k{background:var(--card2,rgba(0,0,0,.03));border-radius:10px;padding:8px 10px} .bz-k b{display:block;font:600 19px/1.15 var(--serif,Georgia);font-variant-numeric:tabular-nums} .bz-k span{font-size:11.5px;color:var(--muted)}
.bz-sup{list-style:none;padding:0;margin:0 0 8px} .bz-sup li{display:flex;justify-content:space-between;border-bottom:1px solid var(--line);padding:4px 0;font-size:13.5px}
.bz-own div{margin:4px 0;font-size:13.5px} .bz-v{display:inline-block;margin:2px 6px 2px 0;padding:1px 7px;border-radius:999px;background:var(--chip,rgba(0,0,0,.05));font-size:12px}
.bz-foot{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.bz-card{position:fixed;inset:0;z-index:60;overflow:auto;background:var(--bg);padding:16px} .bz-card[hidden]{display:none}
.bz-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;max-width:720px;margin:0 auto 12px}
.bz-sheet{max-width:720px;margin:0 auto;background:#fff;color:#1c1416;padding:40px 48px;border-radius:6px;box-shadow:0 6px 30px rgba(0,0,0,.12);font-family:var(--serif,Georgia),serif}
.bz-sheet h1{text-align:center;font-size:30px;font-weight:600;letter-spacing:.04em;margin:0 0 24px;outline:none} .bz-sheet h1:focus{background:#faf6ef}
.bz-sheet h2{font-size:15px;text-transform:uppercase;letter-spacing:.18em;text-align:center;margin:26px 0 8px;color:#7C2D3E}
.bz-sheet h3{font:600 12px/1.2 system-ui,sans-serif;text-transform:uppercase;letter-spacing:.08em;color:#8a7a80;margin:14px 0 4px}
.bz-l{display:grid;grid-template-columns:1fr auto auto auto auto;gap:4px 14px;align-items:baseline;padding:3px 0;font-size:14.5px}
.bz-w b{font-weight:600} .bz-y,.bz-s,.bz-g,.bz-pr{font-variant-numeric:tabular-nums;text-align:right} .bz-g{color:#8a7a80} .bz-pr{min-width:56px;font-weight:600}
.bz-fine{margin-top:26px;font:12px system-ui,sans-serif;color:#8a7a80;text-align:center}
@media (max-width:600px){ .bz-sheet{padding:24px 16px} .bz-l{grid-template-columns:1fr auto auto;font-size:13.5px} .bz-s,.bz-g{display:none} }
@media print{ body.bz-open > *:not(#bizCard){display:none !important} body.bz-open .bz-card{position:static;padding:0;overflow:visible;background:#fff}
  body.bz-open .bz-bar{display:none} body.bz-open .bz-sheet{box-shadow:none;max-width:none;padding:0} body.bz-open .bz-l{break-inside:avoid} }
</style>`);
  setTimeout(apply, 0);
  return { apply, detail, priceCell, overview, cardLabel, margin, openCard };
})();
