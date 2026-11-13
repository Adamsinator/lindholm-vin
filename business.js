// AllWine for a business: a restaurant or wine bar, a wine merchant or shop, a winemaker. Loaded by app.js only when the
// account's kind isn't private (Account → What kind of account). The same wines; on top of them:
//  · per wine: the price on the card or price list (with Danish VAT, moms 25 %, included, as a guest sees it), the price
//    by the glass (a restaurant), the supplier (the cellar's "Bought at"), and what that makes: the margin and the mark-up;
//  · in the overview: the stock at cost and at card price, the average margin, what has no price yet, the suppliers;
//    for a winemaker, its own wines by vintage;
//  · the wine card or price list, printable (or saved as a PDF): in stock and priced only, so a sold-out wine leaves it
//    by itself; and online, behind a QR code: sealed in the browser like a shared list (share-crypto.js), and sealed
//    again under the same key when it changes, so the code on the table keeps showing what's on the shelf;
//  · a minimum per wine, and the reorder list it makes, by supplier; the sales of a month as a CSV for the accounts.
// Its own pages, in place of a private cellar's Enjoyed, Wishlist and Journal: Inventory (the first page: the stock to
// count and sell from), the cellar itself, Sales & accounts (the figures, by period) and the wine card or price list.
// Uses app.js's globals (WINES, KIND, api, normalize, tr, esc, kr, fmt…), like the other scripts of the page.
"use strict";
window.BIZ = (() => {
  const VAT = 0.25;
  const WORDS = {
    business:   { stock: "Your stock", sell: "Menu price", card: "Wine card", glass: true },
    restaurant: { stock: "Your stock", sell: "Menu price", card: "Wine card", glass: true },
    merchant:   { stock: "Your stock", sell: "Sale price", card: "Price list", glass: false },
    winemaker:  { stock: "Your cellar", sell: "Cellar-door price", card: "Price list", glass: false },
  };
  const words = () => WORDS[KIND] || WORDS.business;
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
    b.hidden = !on(); b.textContent = tr(words().card);
    pages();
    if (!on()) { const p = $("bizPanel"); if (p) p.hidden = true; }
    if (typeof route === "function") route();
  }

  /* ---------- the pages: tabs at the top and on a phone's bar, and a page for each ---------- */
  const PAGES = () => [["inventory", "Inventory", '<path d="M4 7h16M4 12h16M4 17h10"/><circle cx="19" cy="17" r="1.6"/>'],
    ["accounts", KIND === "winemaker" ? "Accounts" : "Sales & accounts", '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'],
    ["winecard", words().card, '<path d="M6 3h12v18H6z"/><path d="M9 8h6M9 12h6M9 16h4"/>']];
  const PERSONAL = ["enjoyed", "wishlist", "journal"];
  function pages() {
    const tabs = document.querySelector(".gbar .tabs"), pt = $("ptabs"); if (!tabs) return;
    const cellarTab = tabs.querySelector('.tab[data-page="cellar"]'), cellarP = pt && pt.querySelector('button[data-page="cellar"]');
    PAGES().forEach(([id, label, icon], i) => {
      let t = tabs.querySelector(`.tab[data-page="${id}"]`);
      if (!t) { t = document.createElement("button"); t.className = "tab bz-tab"; t.dataset.page = id; t.type = "button";
        i === 0 ? cellarTab.before(t) : (tabs.querySelector('.bz-tab[data-page="accounts"]') || cellarTab).after(t); }
      const staffOff = id === "accounts" && window.ROLE === "staff"; // staff sell and count; the figures are the owner's and the managers'
      t.textContent = tr(label); t.hidden = !on() || staffOff;
      if (pt) { let q = pt.querySelector(`button[data-page="${id}"]`);
        if (!q) { q = document.createElement("button"); q.type = "button"; q.dataset.page = id; q.className = "bz-ptab";
          i === 0 ? cellarP.before(q) : (pt.querySelector('.bz-ptab[data-page="accounts"]') || cellarP).after(q); }
        q.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">${icon}</svg><span>${esc(tr(label))}</span>`; q.hidden = !on() || staffOff; }
      const pid = "page" + id[0].toUpperCase() + id.slice(1);
      if (!$(pid)) { const d = document.createElement("div"); d.id = pid; d.hidden = true; d.className = "bz-page"; $("pageCellar").after(d); }
    });
    // a business keeps its stock here, not a collector's diary
    PERSONAL.forEach(p => { const a = tabs.querySelector(`.tab[data-page="${p}"]`); if (a) a.hidden = on();
      const q = pt && pt.querySelector(`button[data-page="${p}"]`); if (q) q.hidden = on(); });
    document.documentElement.classList.toggle("bz-on", on());
    if (!$("bizPanel")) { const p = document.createElement("section"); p.id = "bizPanel"; p.className = "panel bz-p"; p.hidden = true; $("pageAccounts").appendChild(p); }
    if (!$("bizCard")) { const c = document.createElement("div"); c.id = "bizCard"; c.className = "bz-card"; $("pageWinecard").appendChild(c); }
  }
  // the page app.js's router shows: drawn now, and the wine card printable while it's on screen
  let SHOWN = "";
  function page(name) {
    if (name === "accounts" && window.ROLE === "staff") { location.hash = "inventory"; return; }
    SHOWN = on() ? name : "";
    document.body.classList.toggle("bz-printcard", SHOWN === "winecard");
    if (SHOWN === "inventory") inventory();
    if (SHOWN === "accounts") { overview(WINES.filter(w => w.left > 0));
      // sales made on another device (or a till) since: fetched again when the page is opened, at most once a minute
      if (SALES && Date.now() - salesAt > 60e3) loadSales(true); }
    if (SHOWN === "winecard") renderCard();
  }
  const go = name => { location.hash = name; };
  const cardLabel = () => tr(words().card);

  /* ---------- a wine's business fields, in its details ---------- */
  function detail(w) {
    if (!on()) return "";
    const m = margin(w), W = words();
    const num = (f, label, v) => `<label class="bz-f">${esc(tr(label))}<input class="bz-in" type="number" min="0" step="1" inputmode="decimal" data-f="${f}" data-row="${w.row}" value="${v != null ? v : ""}" placeholder="—"></label>`;
    return `<div class="bz-d">
      ${num("menuPrice", W.sell, w.menuPrice)}
      ${W.glass ? num("glassPrice", "By the glass", w.glassPrice) : ""}
      ${num("left", "In stock", w.left)}
      ${num("par", "Minimum in stock", w.par || null)}
      <label class="bz-f">${esc(tr("Supplier"))}<input class="bz-in" data-f="source" data-row="${w.row}" list="bzSup" value="${esc(w.source)}" placeholder="—"></label>
      <span class="bz-sell">${w.left > 0 || w.openGlasses > 0 ? `<button type="button" class="btn primary" data-sell="bottle" data-row="${w.row}"${w.left > 0 ? "" : " disabled"}>${esc(tr("Sold a bottle"))}</button>` : ""}
        ${W.glass && (w.left > 0 || w.openGlasses > 0) ? `<button type="button" class="btn" data-sell="glass" data-row="${w.row}">${esc(tr("Sold a glass"))}</button>` : ""}
        ${w.openGlasses > 0 ? `<span class="note">${esc((w.openGlasses === 1 ? tr("1 glass left in the open bottle") : tr("{0} glasses left in the open bottle", w.openGlasses)))}</span>` : ""}</span>
      <span class="bz-m">${m ? esc(tr("Margin {0} ({1} a bottle, VAT excluded) · mark-up {2}", pct(m.pct), kr(Math.round(m.gross)), times(m.x)))
        : esc(tr(w.price > 0 ? "Set a price to see the margin" : "Add the cost price to see the margin"))}</span>
    </div>`;
  }
  // saved when the field is left (or Enter): one wine, one field
  document.addEventListener("change", async e => {
    const inp = e.target.closest && e.target.closest(".bz-in"); if (!inp) return;
    const row = Number(inp.dataset.row), f = inp.dataset.f, v = inp.value.trim();
    if (f === "cost" && v === "") { inp.value = inp.defaultValue; return; }
    if (f !== "source" && v !== "" && !(Number(v) >= 0)) { toast(tr(f === "par" || f === "left" ? "The minimum is a number of bottles, 0 or more" : "A price is a number of 0 or more")); return; }
    if (f === "left" && v === "") { inp.value = inp.defaultValue; return; }
    inp.disabled = true;
    try {
      // the stock is the bottles on hand (bought less drunk or sold); the rest are the wine's own fields
      const res = f === "left" ? await api({ action: "setstock", row, left: Math.round(Number(v)) })
        : f === "cost" ? await api({ action: "setprice", row, value: Number(v) })
        : await api({ action: "setinfo", row, fields: { [f]: f === "source" ? v : (v === "" ? "" : Number(v)) } });
      KEEP_OPEN = row; WINES = normalize(res.wines); renderOverview(); renderTable(); renderEnjoyed();
      toast(tr("Saved"));
    } catch (err) { const m = String(err && err.message || err);
      toast(/zero-stock/.test(m) ? tr("Nothing's been sold of it yet: to take it off the stock, delete it") : /bad-action/.test(m) ? tr("Counting stock needs the updated Apps Script (version 49): redeploy Code.gs.") : tr("Could not save: {0}", errText(err)));
      inp.value = inp.defaultValue; inp.disabled = false; }
  });
  /* ---------- "Sold": a bottle, or a glass (a bottle is opened for the first glass), with Undo ---------- */
  let SALES = null, salesBusy = null;
  const glassesKey = () => "vinGlasses:" + String(cfg.user || "").toLowerCase();
  function perBottle() {
    try { const x = window.VAULT && VAULT.active() && VAULT.prefs(); if (x && x.glasses) return Number(x.glasses); } catch (e) {}
    return Number(localStorage.getItem(glassesKey())) || 5;
  }
  function setPerBottle(n) { n = Math.max(2, Math.min(12, Math.round(n) || 5)); try { localStorage.setItem(glassesKey(), n); } catch (e) {}
    if (window.VAULT && VAULT.active()) savePrefs({ glasses: n }).catch(() => {}); }
  let salesAt = 0;
  function loadSales(fresh) {
    if ((SALES && !fresh) || salesBusy) return salesBusy;
    salesBusy = api({ action: "sales" }).then(r => { SALES = r.sales || []; salesAt = Date.now(); salesBusy = null; overview(WINES.filter(w => w.left > 0)); })
      .catch(() => { SALES = []; salesBusy = null; });
    return salesBusy;
  }
  document.addEventListener("click", async e => {
    const b = e.target.closest && e.target.closest("button[data-sell]"); if (!b) return;
    const row = Number(b.dataset.row), unit = b.dataset.sell, w = WINES.find(x => x.row === row); if (!w) return;
    b.disabled = true;
    try {
      const res = await api({ action: "sell", row, unit, per: perBottle() });
      KEEP_OPEN = row; WINES = normalize(res.wines); SALES = res.sales || SALES; renderOverview(); renderTable(); renderEnjoyed();
      const nm = w.producer + (w.name ? " " + w.name : ""), id = res.id;
      notify(tr(unit === "glass" ? "Sold a glass of {0}" : "Sold a bottle of {0}", nm), [{ label: tr("Undo"), fn: async () => {
        try { const r = await api({ action: "unsell", id }); KEEP_OPEN = row; WINES = normalize(r.wines); SALES = r.sales || SALES;
          renderOverview(); renderTable(); renderEnjoyed(); toast(tr("Sale undone")); }
        catch (err) { toast(tr("Could not undo: {0}", errText(err))); } } }]);
    } catch (err) { toast(/None left/.test(String(err && err.message || err)) ? tr("None left in stock") : tr("Could not save: {0}", errText(err))); b.disabled = false; }
  });
  // what the sales say, over a period chosen on the page: what was sold and taken, the profit on it, a chart, the best
  // sellers; and the slow movers (in stock, nothing sold in 90 days)
  let PERIOD = 30;
  const PERIODS = [[7, "Last 7 days"], [30, "Last 30 days"], [90, "Last 90 days"], [365, "Last 12 months"]];
  function salesHTML(cellar) {
    if (!SALES) { loadSales(); return `<h3>${esc(tr("Sales"))}</h3><p class="note">${esc(tr("Loading…"))}</p>`; }
    const per = perBottle(), day = d => new Date(d + "T12:00:00").getTime(), now = Date.now(), D = 864e5;
    const since = n => SALES.filter(s => now - day(s.date) < n * D), eq = s => s.unit === "glass" ? 1 / per : 1;
    const inP = since(PERIOD), money = l => l.reduce((n, s) => n + (s.price || 0), 0), hide = v => SHOW_PRICES ? esc(kr(Math.round(v))) : "···";
    const nB = inP.filter(s => s.unit === "bottle").length, nG = inP.length - nB, eqN = inP.reduce((n, s) => n + eq(s), 0);
    // the profit: the sale without VAT, less what the bottle (or its share, for a glass) cost; sales of a wine with no
    // cost price are left out of it, and said so
    const costOf = s => { const w = WINES.find(x => x.row === s.row); return w && w.price > 0 ? w.price * eq(s) : null; };
    const priced = inP.filter(s => s.price > 0 && costOf(s) != null), netP = priced.reduce((n, s) => n + s.price / (1 + VAT), 0);
    const profit = netP - priced.reduce((n, s) => n + costOf(s), 0), rev = money(inP);
    // the chart: days for a week or a month, weeks for 90 days, months for a year; bottles (glasses as their share)
    const lang = window.I18N ? (I18N.lang === "en" ? "en-GB" : I18N.lang) : "en-GB";
    let buckets;
    if (PERIOD === 365) {
      const m0 = new Date(); buckets = Array.from({ length: 12 }, (_, i) => { const d = new Date(m0.getFullYear(), m0.getMonth() - 11 + i, 15), k = d.toISOString().slice(0, 7);
        return { l: inP.filter(s => s.date.slice(0, 7) === k), t: d.toLocaleDateString(lang, { month: "short" }) }; });
    } else {
      const size = PERIOD === 90 ? 7 : 1, nb = Math.ceil(PERIOD / size);
      buckets = Array.from({ length: nb }, (_, i) => { const lo = (nb - 1 - i) * size, hi = lo + size;
        return { l: inP.filter(s => { const a = (now - day(s.date)) / D; return a >= lo && a < hi; }), t: i === nb - 1 ? tr(size === 7 ? "this week" : "today") : "" }; });
    }
    const n1 = x => x.toLocaleString(window.I18N ? I18N.lang : "en", { maximumFractionDigits: 1 });
    const bmax = Math.max(1, ...buckets.map(b => b.l.reduce((n, s) => n + eq(s), 0)));
    const by = {}; inP.forEach(s => { const k = s.row + "|" + s.producer; (by[k] = by[k] || { s, n: 0, kr: 0 }); by[k].n += eq(s); by[k].kr += s.price || 0; });
    const best = Object.values(by).sort((a, b) => b.n - a.n).slice(0, 8);
    const soldRows = new Set(since(90).map(s => s.row));
    const old = w => !w.acquired || now - new Date(w.acquired + "T12:00:00").getTime() > 90 * D;
    const slow = cellar.filter(w => !soldRows.has(w.row) && old(w)).sort((a, b) => (b.price || 0) * b.left - (a.price || 0) * a.left).slice(0, 8);
    const nm = s => `${esc(s.producer)}${s.name ? " · " + esc(s.name) : ""}${s.vintage ? " " + esc(s.vintage) : ""}`;
    const fig = (n, l, sub) => `<div class="bz-k"><b>${n}</b><span>${esc(l)}</span>${sub ? `<em>${esc(sub)}</em>` : ""}</div>`;
    return `<div class="bz-h"><h3>${esc(tr("Sales"))}</h3>
        <label class="bz-f">${esc(tr("Period"))}<select id="bzPeriod">${PERIODS.map(([d, l]) => `<option value="${d}"${d === PERIOD ? " selected" : ""}>${esc(tr(l))}</option>`).join("")}</select></label></div>
      <div class="bz-ks">
        <div class="bz-k"><b>${esc(fmt(nB))}${words().glass ? ` <small>+ ${esc(fmt(nG))} ${esc(tr("glasses"))}</small>` : ""}</b><span>${esc(tr(words().glass ? "Bottles and glasses sold" : "Bottles sold"))}</span></div>
        ${fig(hide(rev), tr("Sales, VAT included"), SHOW_PRICES ? tr("{0} without VAT", kr(Math.round(rev / (1 + VAT)))) : "")}
        ${fig(priced.length ? hide(profit) : "—", tr("Gross profit, VAT excluded"), priced.length && netP > 0 ? tr("margin {0}", pct(profit / netP)) : "")}
        ${fig(eqN > 0 ? hide(rev / eqN) : "—", tr("Average a bottle sold"))}
      </div>
      ${priced.length < inP.length ? `<p class="note">${esc(tr("{0} of the sales are of wines with no cost price: they're left out of the profit.", fmt(inP.length - priced.length)))}</p>` : ""}
      <div class="bz-wk" style="grid-template-columns:repeat(${buckets.length},minmax(0,1fr))" role="img" aria-label="${esc(tr("Bottles sold over the period"))}">${buckets.map(b => { const n = b.l.reduce((t, s) => t + eq(s), 0);
        return `<span title="${esc((n === 1 ? tr("1 bottle") : tr("{0} bottles", n1(n))) + (SHOW_PRICES ? " · " + kr(Math.round(money(b.l))) : ""))}"><i style="height:${(n / bmax * 100).toFixed(0)}%"></i><em>${esc(b.t)}</em></span>`; }).join("")}</div>
      <div class="bz-cols">
        <div>${best.length ? `<h4>${esc(tr("Best sellers"))}</h4><ul class="bz-sup">${best.map(x => `<li><span>${nm(x.s)}</span><b>${esc(x.n === 1 ? tr("1 bottle") : tr("{0} bottles", n1(x.n)))}${SHOW_PRICES ? ` <small>${esc(kr(Math.round(x.kr)))}</small>` : ""}</b></li>`).join("")}</ul>` : `<p class="note">${esc(tr("No sales in this period."))}</p>`}</div>
        <div>${SALES.length && slow.length ? `<h4>${esc(tr("Slow movers: in stock, nothing sold in 90 days"))}</h4><ul class="bz-sup">${slow.map(w => `<li><span>${nm(w)}</span><b>${esc(btl(fmt(w.left)))}</b></li>`).join("")}</ul>` : ""}</div>
      </div>
      ${SALES.length && SHOW_PRICES ? monthByMonth(eq, costOf, n1) : ""}
      ${SALES.length ? `<p class="bz-exp"><label class="bz-f">${esc(tr("Sales of the month"))}<select id="bzMonth">${months().map(m => `<option value="${m}">${esc(monthName(m))}</option>`).join("")}</select></label>
        <button type="button" class="btn" id="bzSalesCsv">${esc(tr("Download as CSV"))}</button></p>` : ""}
      ${words().glass ? `<label class="bz-f bz-gl">${esc(tr("Glasses in a bottle"))}<input id="bzGlasses" type="number" min="2" max="12" step="1" value="${per}"></label>` : ""}`;
  }
  // month by month, the last 12: what was sold (bottles, glasses as their share), the sales without VAT, the cost of
  // what was sold (today's cost price, as the profit above) and the gross profit, and the same month a year before.
  // A bar a month: the cost below, the profit above, sales of wines with no cost price as a pale top; the line across
  // a bar is the same month a year before. The table under it says it in figures, with each month's CSV.
  function monthByMonth(eq, costOf, n1) {
    const lang = window.I18N ? (I18N.lang === "en" ? "en-GB" : I18N.lang) : "en-GB", now = new Date();
    const key = (y, m) => { const d = new Date(y, m, 15); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };
    const agg = k => { const l = SALES.filter(x => x.date.slice(0, 7) === k), pr = l.filter(x => x.price > 0 && costOf(x) != null);
      const net = l.reduce((t, x) => t + (x.price || 0), 0) / (1 + VAT), pnet = pr.reduce((t, x) => t + x.price / (1 + VAT), 0), cost = pr.reduce((t, x) => t + costOf(x), 0);
      return { k, n: l.reduce((t, x) => t + eq(x), 0), net, pnet, cost, profit: pnet - cost }; };
    const M = Array.from({ length: 12 }, (_, i) => { const y = now.getFullYear(), m = now.getMonth() - 11 + i, a = agg(key(y, m)); a.prev = agg(key(y - 1, m)); return a; });
    const first = M.findIndex(x => x.n > 0 || x.prev.n > 0), rows = first < 0 ? [] : M.slice(first);
    if (!rows.length) return "";
    const short = k => new Date(k + "-15T12:00:00").toLocaleDateString(lang, { month: "short" }), long = k => monthName(k);
    const K = v => kr(Math.round(v)), chg = (a, b) => b > 0 ? (a >= b ? "+" : "−") + pct(Math.abs(a / b - 1)) : "—";
    const anyPrev = rows.some(x => x.prev.net > 0), top = Math.max(1, ...rows.map(x => Math.max(x.net, x.prev.net))), h = v => (v / top * 100).toFixed(1) + "%";
    const bars = rows.map(x => { const c = Math.min(x.cost, x.pnet), pf = Math.max(0, x.pnet - c), un = x.net - x.pnet;
      const tip = `${long(x.k)}: ${K(x.net)} ${tr("without VAT")} · ${tr("profit {0}", K(x.profit))}${x.prev.net > 0 ? " · " + tr("a year before {0}", K(x.prev.net)) : ""}`;
      return `<span title="${esc(tip)}"><i class="c" style="height:${h(c)}"></i><i class="p" style="height:${h(pf)}"></i>${un > 0.5 ? `<i class="u" style="height:${h(un)}"></i>` : ""}
        ${x.prev.net > 0 ? `<b class="ly" style="bottom:${h(x.prev.net)}"></b>` : ""}<em>${esc(short(x.k))}</em></span>`; }).join("");
    const T = rows.reduce((t, x) => ({ n: t.n + x.n, net: t.net + x.net, pnet: t.pnet + x.pnet, profit: t.profit + x.profit, pn: t.pn + x.prev.net }), { n: 0, net: 0, pnet: 0, profit: 0, pn: 0 });
    const tr1 = (lab, x, prevNet, csv) => `<tr><th scope="row">${esc(lab)}</th><td class="mb">${esc(n1(x.n))}</td><td>${esc(K(x.net))}</td><td>${x.pnet > 0 ? esc(K(x.profit)) : "—"}</td>
      <td>${x.pnet > 0 ? esc(pct(x.profit / x.pnet)) : "—"}</td>${anyPrev ? `<td class="my">${esc(chg(x.net, prevNet))}</td>` : ""}<td class="mc">${csv && x.n > 0 ? `<button type="button" class="linkish" data-mcsv="${csv}" aria-label="${esc(tr("Download {0} as CSV", long(csv)))}">CSV</button>` : ""}</td></tr>`;
    return `<h4 class="bz-mmh">${esc(tr("Month by month"))}</h4>
      <div class="bz-mm" style="grid-template-columns:repeat(${rows.length},minmax(0,1fr))" role="img" aria-label="${esc(tr("Sales without VAT by month, the last {0} months: cost of what was sold and the gross profit", rows.length))}">${bars}</div>
      <p class="bz-mmk"><span class="c"></span>${esc(tr("Cost of what was sold"))} <span class="p"></span>${esc(tr("Gross profit"))}${rows.some(x => x.net > x.pnet + 0.5) ? ` <span class="u"></span>${esc(tr("No cost price"))}` : ""}${anyPrev ? ` <span class="ly"></span>${esc(tr("A year before"))}` : ""}</p>
      <div class="bz-scroll"><table class="bz-tab2 bz-mmt"><thead><tr><th>${esc(tr("Month"))}</th><th class="mb">${esc(tr("Bottles"))}</th><th>${esc(tr("Sales, VAT excluded"))}</th><th>${esc(tr("Gross profit"))}</th><th>${esc(tr("Margin"))}</th>${anyPrev ? `<th class="my">${esc(tr("On a year before"))}</th>` : ""}<th class="mc"><span class="sr">CSV</span></th></tr></thead>
      <tbody>${rows.slice().reverse().map((x, i) => tr1(i ? long(x.k) : tr("{0} (so far)", long(x.k)), x, x.prev.net, x.k)).join("")}</tbody>
      ${rows.length > 1 ? `<tfoot>${tr1(tr("{0} months", rows.length), T, rows.every(x => x.prev.net > 0) ? T.pn : 0, "")}</tfoot>` : ""}</table></div>`;
  }
  // the months that have sales, newest first ("2026-10"), and a month's sales as rows for EXPORT.csv: one line a
  // sale, its price with and without VAT and the VAT itself, and a total; a spreadsheet for the bookkeeping
  const months = () => [...new Set((SALES || []).map(s => s.date.slice(0, 7)))].sort().reverse();
  const monthName = m => new Date(m + "-15T12:00:00").toLocaleDateString(window.I18N ? (I18N.lang === "en" ? "en-GB" : I18N.lang) : "en-GB", { month: "long", year: "numeric" });
  const r2 = x => Math.round(x * 100) / 100;
  function salesRows(m) {
    const list = (SALES || []).filter(s => s.date.slice(0, 7) === m);
    const head = [tr("Date"), tr("Producer"), tr("Wine"), tr("Vintage"), tr("Sold"), tr("Price incl. VAT"), tr("Price excl. VAT"), tr("VAT")];
    const rows = list.map(s => { const p = s.price || 0, ex = r2(p / (1 + VAT));
      return [s.date, s.producer, s.name || "", s.vintage || "", tr(s.unit === "glass" ? "a glass" : "a bottle"), r2(p), ex, r2(p - ex)]; });
    const tot = i => r2(rows.reduce((n, r) => n + r[i], 0));
    return [head, ...rows, [tr("Total"), "", "", "", fmt(list.length), tot(5), tot(6), tot(7)]];
  }
  function salesCsv(m) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([EXPORT.csv(salesRows(m))], { type: "text/csv;charset=utf-8" }));
    a.download = `allwine-${tr("sales")}-${m}.csv`;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    toast(tr("Saved {0}", a.download));
  }
  // what to order: every wine with a minimum that has fewer bottles than that (sold out included), by supplier
  function reorder() {
    const by = {};
    WINES.filter(w => w.par > 0 && w.left < w.par).forEach(w => { const k = w.source || ""; (by[k] = by[k] || []).push(w); });
    return Object.entries(by).sort((a, b) => (!a[0]) - (!b[0]) || a[0].localeCompare(b[0]))
      .map(([k, ws]) => [k, ws.sort((a, b) => a.producer.localeCompare(b.producer) || (a.vintage || 0) - (b.vintage || 0))]);
  }
  const wname = w => [w.producer, w.name, w.vintage || "NV"].filter(Boolean).join(" ");
  function reorderText(groups) {
    return groups.map(([k, ws]) => (k || tr("No supplier")) + "\n" + ws.map(w => `  ${w.par - w.left} × ${wname(w)}`).join("\n")).join("\n\n");
  }
  function reorderHTML() {
    const g = reorder(); if (!g.length) return "";
    return `<h3>${esc(tr("To reorder"))}</h3>
      ${g.map(([k, ws]) => `<h4>${esc(k || tr("No supplier"))}</h4><ul class="bz-sup">${ws.map(w => `<li><span>${esc(wname(w))}<small class="bz-have">${esc(tr("{0} of a minimum of {1}", fmt(w.left), fmt(w.par)))}</small></span><b>${esc(tr("order {0}", fmt(w.par - w.left)))}</b></li>`).join("")}</ul>`).join("")}
      <p class="bz-btns"><button type="button" class="btn" id="bzReorderCopy">${esc(tr("Copy the list"))}</button>
        ${g.map(([k]) => `<a class="btn" href="${esc(orderMail(k))}">${esc(tr("Email the order to {0}", k || tr("No supplier")))}</a>`).join("")}
        <button type="button" class="btn" id="bzOrderPrint">${esc(tr("Print the orders"))}</button></p>
      <p class="bz-btns">${g.map(([k]) => `<button type="button" class="btn quiet" data-recv="${esc(k)}">${esc(tr("{0}'s order has come", k || tr("No supplier")))}</button>`).join("")}</p>`;
  }
  // an order for one supplier, as an email to finish and send (the address is the business's to add: we don't keep it)
  function orderText(k) {
    const g = reorder().find(([x]) => x === k); if (!g) return "";
    return tr("Order from {0}", cardTitle()) + "\n\n" + g[1].map(w => `${w.par - w.left} × ${wname(w)}`).join("\n") + "\n\n" + tr("Thank you.");
  }
  const orderMail = k => "mailto:?subject=" + encodeURIComponent(tr("Order from {0}", cardTitle())) + "&body=" + encodeURIComponent(orderText(k));
  function printOrders() {
    let c = $("bzOrders"); if (!c) { c = document.createElement("div"); c.id = "bzOrders"; document.body.appendChild(c); }
    const day = new Date().toLocaleDateString(window.I18N ? (I18N.lang === "en" ? "en-GB" : I18N.lang) : "en-GB");
    c.innerHTML = reorder().map(([k, ws]) => `<article class="bz-po"><h2>${esc(tr("Order"))}: ${esc(k || tr("No supplier"))}</h2>
      <p>${esc(cardTitle())} · ${esc(day)}</p><table><thead><tr><th>${esc(tr("Wine"))}</th><th>${esc(tr("Bottles"))}</th></tr></thead>
      <tbody>${ws.map(w => `<tr><td>${esc(wname(w))}</td><td>${esc(fmt(w.par - w.left))}</td></tr>`).join("")}</tbody></table></article>`).join("");
    document.body.classList.add("bz-orderprint"); window.print(); setTimeout(() => document.body.classList.remove("bz-orderprint"), 500);
  }
  const priceCell = w => on() && w.menuPrice > 0 ? `<small class="bz-mp" title="${esc(tr(words().sell))}">${esc(kr(w.menuPrice))}</small>` : "";

  /* ---------- the overview: money, what's missing, suppliers; a winemaker's own wines ---------- */
  function overview(cellar) {
    if (on()) pages();
    const p = $("bizPanel");
    if (!on()) { if (p) p.hidden = true; return; }
    p.hidden = false;
    if (SHOWN === "inventory") inventory();
    if (SHOWN === "winecard") renderCard();
    tillDraw();
    const W = words(), sum = (a, f) => a.reduce((n, w) => n + f(w), 0);
    const cost = sum(cellar, w => (w.price || 0) * w.left), sale = sum(cellar, w => (w.menuPrice || 0) * w.left);
    const both = cellar.filter(w => margin(w)), net = sum(both, w => margin(w).net * w.left), gross = sum(both, w => margin(w).gross * w.left);
    const noPrice = cellar.filter(w => !(w.menuPrice > 0)), glass = cellar.filter(w => w.glassPrice > 0);
    const sup = {}; cellar.forEach(w => { const k = w.source || ""; if (k) sup[k] = (sup[k] || 0) + w.left; });
    const sups = Object.entries(sup).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const supCost = k => sum(cellar.filter(w => w.source === k), w => (w.price || 0) * w.left);
    // the stock by style: wines, bottles, at cost and at the selling price
    const styles = STYLE_ORDER.concat([...new Set(cellar.map(w => w.style))].filter(s => !STYLE_ORDER.includes(s)))
      .map(s => { const ws = cellar.filter(w => w.style === s); return [s, ws.length, sum(ws, w => w.left), sum(ws, w => (w.price || 0) * w.left), sum(ws, w => (w.menuPrice || 0) * w.left)]; })
      .filter(r => r[1]);
    const money = v => SHOW_PRICES ? esc(kr(Math.round(v))) : "···";
    $("bzSup") || document.body.insertAdjacentHTML("beforeend", '<datalist id="bzSup"></datalist>');
    $("bzSup").innerHTML = Object.keys(sup).sort().map(s => `<option>${esc(s)}</option>`).join("");
    const fig = (n, l) => `<div class="bz-k"><b>${n}</b><span>${esc(l)}</span></div>`;
    let own = "";
    if (KIND === "winemaker" || KIND === "business") { // a business that makes wine names its domaine; its own wines by vintage
      const dom = domaine(), mine = dom ? cellar.filter(w => w.producer.toLowerCase().includes(dom.toLowerCase())) : [];
      const byWine = {}; mine.forEach(w => { const k = w.name || w.producer; (byWine[k] = byWine[k] || []).push(w); });
      own = `<h3>${esc(tr("Your own wines"))}</h3>
        <label class="bz-f bz-dom">${esc(tr("Your domaine, as on the label"))}<input id="bzDom" value="${esc(dom)}" placeholder="${esc(tr("e.g. Domaine Dupont"))}"></label>
        ${dom ? (mine.length ? `<div class="bz-own">${Object.entries(byWine).map(([k, ws]) => `<div><b>${esc(k)}</b> ${ws.sort((a, b) => (a.vintage || 0) - (b.vintage || 0)).map(w => `<span class="bz-v">${esc(w.vintage || "NV")} · ${esc(btl(fmt(w.left)))}</span>`).join(" ")}</div>`).join("")}</div>`
          : `<p class="note">${esc(tr("No wines from {0} in the cellar yet.", dom))}</p>`) : ""}`;
    }
    p.innerHTML = `<h2>${esc(tr(KIND === "restaurant" || KIND === "business" ? "The business" : KIND === "merchant" ? "The shop" : "The domaine"))}</h2>
      ${KIND !== "winemaker" ? salesHTML(cellar) : ""}
      <h3>${esc(tr("The stock"))}</h3>
      <div class="bz-ks">
        ${fig(SHOW_PRICES ? kr(Math.round(cost)) : "···", tr("Stock at cost"))}
        ${fig(SHOW_PRICES ? kr(Math.round(sale)) : "···", tr("Stock at {0}", low(tr(W.sell))))}
        ${fig(both.length ? pct(gross / net) : "—", tr("Average margin, VAT excluded"))}
        ${W.glass ? fig(fmt(glass.length), tr("Wines by the glass")) : ""}
      </div>
      ${noPrice.length ? `<p class="note">${esc(tr(noPrice.length === 1 ? "1 wine in stock has no {1} yet: it's left off the {2}." : "{0} wines in stock have no {1} yet: they're left off the {2}.", fmt(noPrice.length), low(tr(W.sell)), low(tr(W.card))))}${window.ROLE !== "staff" ? ` <button type="button" class="linkish" data-bz="price">${esc(tr("Price from cost…"))}</button>` : ""}</p>` : ""}
      ${styles.length ? `<div class="bz-scroll"><table class="bz-tab2"><thead><tr><th>${esc(tr("Style"))}</th><th>${esc(tr("Wines"))}</th><th>${esc(tr("Bottles"))}</th><th>${esc(tr("At cost"))}</th><th>${esc(tr("At {0}", low(tr(W.sell))))}</th></tr></thead>
        <tbody>${styles.map(([s, n, b, c, v]) => `<tr><td>${esc(tr(STYLE_NAME[s] || s || "—"))}</td><td>${esc(fmt(n))}</td><td>${esc(fmt(b))}</td><td>${money(c)}</td><td>${money(v)}</td></tr>`).join("")}</tbody></table></div>` : ""}
      ${locHTML(cellar, money)}
      ${reorderHTML()}
      ${sups.length ? `<h3>${esc(tr("Suppliers"))}</h3><ul class="bz-sup">${sups.map(([k, n]) => `<li><span>${esc(k)}</span><b>${esc(btl(fmt(n)))} <small>${money(supCost(k))}</small></b></li>`).join("")}</ul>` : ""}
      ${own}
      ${window.ROLE ? "" : `<h3>${esc(tr("Staff logins"))}</h3><div id="bzStaff"><p class="note">${esc(tr("Loading…"))}</p></div>`}
      <p class="bz-foot"><button type="button" class="btn" data-bz="card">${esc(tr(W.card))}</button> <span class="note">${esc(tr("Prices include VAT (moms 25 %); the margin is worked out without it."))}</span></p>`;
    p.querySelector('[data-bz="card"]').onclick = openCard;
    const pb = p.querySelector('[data-bz="price"]'); if (pb) pb.onclick = openPricing;
    const rc = $("bzReorderCopy"); if (rc) rc.onclick = async () => {
      try { await navigator.clipboard.writeText(reorderText(reorder())); toast(tr("Copied")); } catch (e) { toast(tr("Could not copy")); } };
    const op = $("bzOrderPrint"); if (op) op.onclick = printOrders;
    p.querySelectorAll("[data-recv]").forEach(b => b.onclick = () => receiveOrder(b.dataset.recv, b));
    const sc = $("bzSalesCsv"); if (sc) sc.onclick = () => salesCsv($("bzMonth").value);
    p.querySelectorAll("[data-mcsv]").forEach(b => b.onclick = () => salesCsv(b.dataset.mcsv));
    syncCard();
    if (!window.ROLE) staffDraw();
    const pe = $("bzPeriod"); if (pe) pe.onchange = () => { PERIOD = Number(pe.value) || 30; overview(WINES.filter(w => w.left > 0)); };
    const g = $("bzGlasses"); if (g) g.onchange = () => { setPerBottle(Number(g.value)); overview(WINES.filter(w => w.left > 0)); };
    const d = $("bzDom"); if (d) d.onchange = () => { setDomaine(d.value.trim()); overview(WINES.filter(w => w.left > 0)); };
  }
  // where the stock is: each place (the part of "Location" before a comma: "Cellar, shelf 3" is the cellar), its wines,
  // bottles and value at cost
  const placeOf = w => String(w.location || "").split(/[,;/·|]/)[0].trim();
  function locHTML(cellar, money) {
    const by = {}; cellar.forEach(w => { const k = placeOf(w), o = by[k] ??= { n: 0, b: 0, c: 0 }; o.n++; o.b += w.left; o.c += (w.price || 0) * w.left; });
    const rows = Object.entries(by).sort((a, b) => (!a[0]) - (!b[0]) || b[1].b - a[1].b);
    if (rows.length < 2 && !rows.some(([k]) => k)) return "";
    return `<h3>${esc(tr("Stock by location"))}</h3><div class="bz-scroll"><table class="bz-tab2"><thead><tr><th>${esc(tr("Location"))}</th><th>${esc(tr("Wines"))}</th><th>${esc(tr("Bottles"))}</th><th>${esc(tr("At cost"))}</th></tr></thead>
      <tbody>${rows.map(([k, o]) => `<tr><td>${esc(k || tr("No location"))}</td><td>${esc(fmt(o.n))}</td><td>${esc(fmt(o.b))}</td><td>${money(o.c)}</td></tr>`).join("")}</tbody></table></div>`;
  }

  /* ---------- Inventory: the first page. Every wine as a line to count and sell from ---------- */
  const INV = { q: "", show: "stock", sort: "producer", loc: "" };
  const SHOWS = [["stock", "In stock"], ["low", "Below the minimum"], ["out", "Sold out"], ["noprice", "No selling price"], ["all", "All wines"]];
  const SORTS = [["producer", "Producer"], ["stock", "Most in stock"], ["value", "Highest value"], ["margin", "Best margin"]];
  const fold = s => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  function invList() {
    const q = fold(INV.q).trim();
    const pick = { stock: w => w.left > 0 || w.openGlasses > 0, low: w => w.par > 0 && w.left < w.par, out: w => !(w.left > 0), noprice: w => w.left > 0 && !(w.menuPrice > 0), all: () => true }[INV.show] || (() => true);
    const val = w => (w.menuPrice || w.price || 0) * Math.max(0, w.left), mg = w => (margin(w) || { pct: -1 }).pct;
    const cmp = { producer: (a, b) => a.producer.localeCompare(b.producer) || (a.vintage || 0) - (b.vintage || 0), stock: (a, b) => b.left - a.left,
      value: (a, b) => val(b) - val(a), margin: (a, b) => mg(b) - mg(a) }[INV.sort];
    return WINES.filter(pick).filter(w => !INV.loc || placeOf(w) === INV.loc).filter(w => !q || qMatch(q, [w.producer, w.name, w.vintage, w.region, w.country, w.source, w.grape])).sort(cmp);
  }
  function inventory() {
    const box = $("pageInventory"); if (!box || !on()) return;
    const W = words();
    // built again when the kind or the words change (the business words arrive after the first draw, in another language)
    const key = KIND + '|' + tr('Quick sell') + '|' + tr('Search the stock');
    if (box.dataset.kind !== key) {
      box.dataset.kind = key;
      box.innerHTML = `<section class="panel bz-inv"><div class="bz-h"><h2>${esc(tr("Inventory"))}</h2>
          <span class="bz-btns"><button type="button" class="btn primary" data-bz="till">${esc(tr("Quick sell"))}</button><button type="button" class="btn" data-bz="goods">${esc(tr("Goods in"))}</button><button type="button" class="btn" data-bz="count">${esc(tr("Count stock"))}</button>${window.ROLE !== "staff" ? `<button type="button" class="btn" data-bz="price">${esc(tr("Price from cost…"))}</button>` : ""}<button type="button" class="btn" data-bz="add">${esc(tr("＋ Add wine"))}</button><button type="button" class="btn" data-bz="card2">${esc(tr(W.card))}</button></span></div>
        <div class="bz-ks" id="bzInvKs"></div>
        <div class="bz-tools"><input type="search" id="bzInvQ" placeholder="${esc(tr("Search the stock"))}" aria-label="${esc(tr("Search the stock"))}">
          <select id="bzInvShow" aria-label="${esc(tr("Show"))}">${SHOWS.map(([k, l]) => `<option value="${k}">${esc(tr(l))}</option>`).join("")}</select>
          <select id="bzInvSort" aria-label="${esc(tr("Sort by"))}">${SORTS.map(([k, l]) => `<option value="${k}">${esc(tr(l))}</option>`).join("")}</select>
          <select id="bzInvLoc" aria-label="${esc(tr("Location"))}"></select></div>
        <div class="bz-scroll"><table class="bz-inv-t"><thead><tr><th>${esc(tr("Wine"))}</th><th>${esc(tr("In stock"))}</th><th>${esc(tr("Minimum"))}</th><th>${esc(tr("Cost price"))}</th>
          <th>${esc(tr(W.sell))}</th>${W.glass ? `<th>${esc(tr("By the glass"))}</th>` : ""}<th>${esc(tr("Supplier"))}</th><th>${esc(tr("Margin"))}</th><th><span class="sr">${esc(tr("Sell"))}</span></th></tr></thead>
          <tbody id="bzInvBody"></tbody></table></div><p class="note" id="bzInvNote"></p></section>`;
      $("bzInvQ").value = INV.q; $("bzInvShow").value = INV.show; $("bzInvSort").value = INV.sort;
      $("bzInvQ").oninput = () => { INV.q = $("bzInvQ").value; invBody(); };
      $("bzInvShow").onchange = () => { INV.show = $("bzInvShow").value; invBody(); };
      $("bzInvSort").onchange = () => { INV.sort = $("bzInvSort").value; invBody(); };
      $("bzInvLoc").onchange = () => { INV.loc = $("bzInvLoc").value; invBody(); };
      box.querySelector('[data-bz="add"]').onclick = () => $("addBtn").click();
      box.querySelector('[data-bz="till"]').onclick = openTill;
      box.querySelector('[data-bz="goods"]').onclick = openGoods;
      box.querySelector('[data-bz="count"]').onclick = openCount;
      const pz = box.querySelector('[data-bz="price"]'); if (pz) pz.onclick = openPricing;
      box.querySelector('[data-bz="card2"]').onclick = openCard;
      if (!box.dataset.bound) box.dataset.bound = "1", box.addEventListener("click", e => { const o = e.target.closest("[data-open]"); if (!o) return;
        KEEP_OPEN = Number(o.dataset.open); location.hash = "cellar"; renderTable();
        setTimeout(() => { const r = document.querySelector(`#tbl tr.main[data-row="${o.dataset.open}"]`); if (r) r.scrollIntoView({ block: "center" }); }, 60); });
    }
    const cellar = WINES.filter(w => w.left > 0), sum = (a, f) => a.reduce((n, w) => n + f(w), 0);
    const low = WINES.filter(w => w.par > 0 && w.left < w.par).length, money = v => SHOW_PRICES ? esc(kr(Math.round(v))) : "···";
    $("bzInvKs").innerHTML = [[fmt(cellar.length), tr("Wines in stock")], [fmt(sum(cellar, w => w.left)), tr("Bottles")],
      [money(sum(cellar, w => (w.price || 0) * w.left)), tr("Stock at cost")], [money(sum(cellar, w => (w.menuPrice || 0) * w.left)), tr("Stock at {0}", lowc(tr(W.sell)))],
      [fmt(low), tr("Below the minimum")]].map(([n, l], i) => `<div class="bz-k${i === 4 && low ? " bz-warn" : ""}"${i === 4 ? ' data-bz="low"' : ""}><b>${n}</b><span>${esc(l)}</span></div>`).join("");
    // the places the stock is kept, for the location filter (hidden while there's only one)
    const places = [...new Set(WINES.map(placeOf).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    if (INV.loc && !places.includes(INV.loc)) INV.loc = "";
    $("bzInvLoc").innerHTML = `<option value="">${esc(tr("All locations"))}</option>` + places.map(p => `<option${p === INV.loc ? " selected" : ""}>${esc(p)}</option>`).join("");
    $("bzInvLoc").hidden = places.length < 2;
    const lk = $("bzInvKs").querySelector('[data-bz="low"]'); if (lk && low) { lk.tabIndex = 0; lk.onclick = () => { INV.show = "low"; $("bzInvShow").value = "low"; invBody(); }; }
    invBody();
  }
  function invBody() {
    const body = $("bzInvBody"); if (!body) return;
    const W = words(), list = invList();
    // keep the field being typed in (a save redraws the table): found again by its wine and field
    const a = document.activeElement, keep = a && a.dataset && a.dataset.row && body.contains(a) ? [a.dataset.row, a.dataset.f] : null;
    const num = (w, f, v, cls) => `<input class="bz-in bz-n${cls ? " " + cls : ""}" type="number" min="0" step="1" inputmode="decimal" data-f="${f}" data-row="${w.row}" value="${v != null ? v : ""}" placeholder="—" aria-label="${esc(tr({ left: "In stock", par: "Minimum", cost: "Cost price", menuPrice: W.sell, glassPrice: "By the glass" }[f]))}">`;
    body.innerHTML = list.map(w => { const m = margin(w), under = w.par > 0 && w.left < w.par;
      return `<tr class="${under ? "bz-under" : ""}${w.left > 0 ? "" : " bz-out"}">
        <td class="bz-wn"><button type="button" class="linkish" data-open="${w.row}"><b>${esc(w.producer)}</b> ${esc([w.name, w.vintage || "NV"].filter(Boolean).join(" "))}</button><small>${esc([w.region, w.country].filter(Boolean).join(", "))}</small></td>
        <td data-l="${esc(tr("In stock"))}">${num(w, "left", w.left)}${w.openGlasses > 0 ? `<small>${esc(tr(w.openGlasses === 1 ? "+ 1 glass open" : "+ {0} glasses open", w.openGlasses))}</small>` : ""}</td>
        <td data-l="${esc(tr("Minimum"))}">${num(w, "par", w.par || null)}</td>
        <td data-l="${esc(tr("Cost price"))}">${SHOW_PRICES && window.ROLE !== "staff" ? num(w, "cost", w.price || null) : "···"}</td>
        <td data-l="${esc(tr(W.sell))}">${num(w, "menuPrice", w.menuPrice)}</td>
        ${W.glass ? `<td data-l="${esc(tr("By the glass"))}">${num(w, "glassPrice", w.glassPrice)}</td>` : ""}
        <td data-l="${esc(tr("Supplier"))}"><input class="bz-in bz-sp" data-f="source" data-row="${w.row}" list="bzSup" value="${esc(w.source)}" placeholder="—" aria-label="${esc(tr("Supplier"))}"></td>
        <td class="bz-mg" data-l="${esc(tr("Margin"))}">${m ? `${esc(pct(m.pct))}<small>${esc(times(m.x))}</small>` : "—"}</td>
        <td class="bz-sl">${w.left > 0 ? `<button type="button" class="btn" data-sell="bottle" data-row="${w.row}" title="${esc(tr("Sold a bottle"))}">${esc(tr("Bottle"))}</button>` : ""}${W.glass && (w.left > 0 || w.openGlasses > 0) ? `<button type="button" class="btn" data-sell="glass" data-row="${w.row}" title="${esc(tr("Sold a glass"))}">${esc(tr("Glass"))}</button>` : ""}</td></tr>`; }).join("")
      || `<tr><td colspan="9" class="note">${esc(tr(WINES.length ? "No wines match." : "No wines yet: add the first with ＋ Add wine."))}</td></tr>`;
    $("bzInvNote").textContent = tr(list.length === 1 ? "1 wine. Changes are saved when you leave a field." : "{0} wines. Changes are saved when you leave a field.", fmt(list.length));
    if (keep) { const el = body.querySelector(`[data-row="${keep[0]}"][data-f="${keep[1]}"]`); if (el) el.focus(); }
  }
  const lowc = s => low(s);

  /* ---------- goods in, and counting the stock ---------- */
  // the stock set to a number of bottles (setstock keeps what was sold as sold); one wine after another, then redrawn
  async function setStocks(list) { // [{row, left, price?}]
    let res = null, failed = [];
    for (const x of list) {
      try { res = await api({ action: "setstock", row: x.row, left: x.left });
        if (x.price != null) res = await api({ action: "setprice", row: x.row, value: x.price }); }
      catch (e) { failed.push([x.row, String(e && e.message || e)]); }
    }
    if (res) { WINES = normalize(res.wines); renderOverview(); renderTable(); renderEnjoyed(); }
    return failed;
  }
  const failText = f => f.length ? tr("Not saved for {0} wines: {1}", f.length, f.map(([r, m]) => { const w = WINES.find(x => x.row === r); return (w ? w.producer : r) + (/zero-stock/.test(m) ? " (" + tr("nothing sold yet: delete it instead") + ")" : ""); }).join(", ")) : "";
  // an order from a supplier has come: every wine on its reorder line gets what was ordered
  async function receiveOrder(k, btn) {
    const g = reorder().find(([x]) => x === k); if (!g) return;
    const n = g[1].reduce((s, w) => s + (w.par - w.left), 0);
    if (!(await ask(tr("Add the {0} bottles ordered from {1} to the stock?", fmt(n), k || tr("No supplier")), { ok: tr("Add to stock") }))) return;
    btn.disabled = true;
    const failed = await setStocks(g[1].map(w => ({ row: w.row, left: w.par })));
    toast(failed.length ? failText(failed) : (n === 1 ? tr("1 bottle added to the stock") : tr("{0} bottles added to the stock", fmt(n))));
  }
  // a modal of our own, shared by goods in and the count
  function sheet(id, title, body) {
    let m = $(id);
    if (!m) { m = document.createElement("div"); m.id = id; m.className = "modal bz-till"; m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true"); document.body.appendChild(m);
      m.addEventListener("keydown", e => { if (e.key === "Escape") m.classList.remove("open"); }); }
    m.innerHTML = `<div class="card"><div class="bz-h"><h2>${esc(tr(title))}</h2><button type="button" class="btn" data-bz="mclose">${esc(tr("Close"))}</button></div>${body}</div>`;
    m.querySelector('[data-bz="mclose"]').onclick = () => m.classList.remove("open");
    m.classList.add("open"); return m;
  }
  // goods in: find the wine, the bottles that came, and the cost if it changed
  function openGoods() {
    const m = sheet("bzGoods", "Goods in", `<p class="note">${esc(tr("A delivery: find each wine, type the bottles that came (and the cost price if it changed), then Add."))}</p>
      <input type="search" id="bzGoodsQ" placeholder="${esc(tr("Search wine, producer or vintage"))}" aria-label="${esc(tr("Search wine, producer or vintage"))}" autocomplete="off">
      <div class="bz-scroll"><table class="bz-tab2 bz-gin"><thead><tr><th>${esc(tr("Wine"))}</th><th>${esc(tr("In stock"))}</th><th>${esc(tr("Came"))}</th><th>${esc(tr("Cost price"))}</th><th></th></tr></thead><tbody id="bzGoodsB"></tbody></table></div>
      <p class="note">${esc(tr("A wine that isn't here yet: add it with ＋ Add wine."))}</p>`);
    const draw = () => { const q = fold($("bzGoodsQ").value).trim();
      const list = WINES.filter(w => !w.elsewhere).filter(w => !q || qMatch(q, [w.producer, w.name, w.vintage, w.source]))
        .sort((a, b) => a.producer.localeCompare(b.producer)).slice(0, 40);
      $("bzGoodsB").innerHTML = list.map(w => `<tr><td><b>${esc(w.producer)}</b> ${esc([w.name, w.vintage || "NV"].filter(Boolean).join(" "))}<small>${esc(w.source || "")}</small></td>
        <td>${esc(fmt(Math.max(0, w.left)))}</td><td><input class="bz-n" type="number" min="1" step="1" inputmode="numeric" data-gin="${w.row}" aria-label="${esc(tr("Came"))}"></td>
        <td><input class="bz-n" type="number" min="0" step="1" inputmode="decimal" data-gcost="${w.row}" placeholder="${esc(w.price ? fmt(w.price) : "—")}" aria-label="${esc(tr("Cost price"))}"></td>
        <td><button type="button" class="btn primary" data-gadd="${w.row}">${esc(tr("Add"))}</button></td></tr>`).join("") || `<tr><td colspan="5" class="note">${esc(tr("No wines match."))}</td></tr>`; };
    $("bzGoodsQ").oninput = draw; draw(); setTimeout(() => $("bzGoodsQ").focus(), 30);
    m.onclick = async e => { const b = e.target.closest("[data-gadd]"); if (!b) return;
      const row = Number(b.dataset.gadd), w = WINES.find(x => x.row === row), n = Math.round(Number(m.querySelector(`[data-gin="${row}"]`).value)), c = m.querySelector(`[data-gcost="${row}"]`).value;
      if (!(n >= 1)) { toast(tr("Type how many bottles came")); return; }
      b.disabled = true;
      const failed = await setStocks([{ row, left: Math.max(0, w.left) + n, price: c === "" ? null : Number(c) }]);
      toast(failed.length ? failText(failed) : (n === 1 ? tr("1 bottle of {0} added to the stock", w.producer) : tr("{0} bottles of {1} added to the stock", fmt(n), w.producer))); draw(); };
  }
  // menu prices from the cost, many at once: the cost price times a factor (VAT included, as a menu price is), rounded
  // up to the nearest 5, 10, 25 or 50 kr.; the wines without one, or all in stock. A preview first (each wine, its new
  // price and the margin it gives, VAT excluded), then one save, with Undo.
  const PRICING_KEY = () => "vinPricing:" + String(cfg.user || "").toLowerCase();
  function openPricing() {
    const W = words(); let o = { x: 3, step: 10, which: "missing" };
    try { o = Object.assign(o, JSON.parse(localStorage.getItem(PRICING_KEY()) || "{}")); } catch (e) {}
    const m = sheet("bzPricing", "Price from cost…", `<p class="note">${esc(tr("A {0} for each wine in stock from its cost price: the cost times a factor, VAT included, rounded up. Check the list, then Set prices; Undo takes them back.", low(tr(W.sell))))}</p>
      <div class="bz-pform"><label class="bz-f">${esc(tr("Cost price ×"))}<input id="bzPx" type="number" min="1" max="20" step="0.1" inputmode="decimal" value="${o.x}"></label>
        <label class="bz-f">${esc(tr("Round up to"))}<select id="bzPstep">${[1, 5, 10, 25, 50, 100].map(n => `<option value="${n}"${n === o.step ? " selected" : ""}>${esc(n === 1 ? tr("whole kroner") : kr(n))}</option>`).join("")}</select></label>
        <label class="bz-f">${esc(tr("Which wines"))}<select id="bzPwhich"><option value="missing"${o.which === "missing" ? " selected" : ""}>${esc(tr("Those without a {0}", low(tr(W.sell))))}</option><option value="all"${o.which === "all" ? " selected" : ""}>${esc(tr("All in stock (prices already set are replaced)"))}</option></select></label></div>
      <p id="bzPsum" class="bz-psum"></p>
      <div class="bz-scroll"><table class="bz-tab2"><thead><tr><th>${esc(tr("Wine"))}</th><th>${esc(tr("Cost price"))}</th><th>${esc(tr(W.sell))}</th><th>${esc(tr("Margin"))}</th></tr></thead><tbody id="bzPbody"></tbody></table></div>
      <p class="bz-pgo"><button type="button" class="btn primary" id="bzPgo"></button></p>`);
    const plan = () => {
      const x = Number($("bzPx").value), step = Number($("bzPstep").value) || 10, which = $("bzPwhich").value;
      const list = WINES.filter(w => w.left > 0 && w.price > 0 && (which === "all" || !(w.menuPrice > 0)))
        .sort((a, b) => a.producer.localeCompare(b.producer) || String(a.vintage).localeCompare(String(b.vintage)));
      return { x, step, which, ok: x >= 1 && x <= 20, rows: list.map(w => { const v = Math.ceil(w.price * x / step) * step; return { w, v, mg: margin(Object.assign({}, w, { menuPrice: v })) }; }) };
    };
    const draw = () => {
      const P = plan(), noCost = WINES.filter(w => w.left > 0 && !(w.price > 0) && (P.which === "all" || !(w.menuPrice > 0))).length;
      $("bzPbody").innerHTML = P.ok ? P.rows.slice(0, 60).map(({ w, v, mg }) => `<tr><td><b>${esc(w.producer)}</b> ${esc([w.name, w.vintage || "NV"].filter(Boolean).join(" "))}</td>
        <td>${esc(kr(w.price))}</td><td><b>${esc(kr(v))}</b>${w.menuPrice > 0 && w.menuPrice !== v ? ` <small>${esc(tr("was {0}", kr(w.menuPrice)))}</small>` : ""}</td><td>${mg ? esc(pct(mg.pct)) : "—"}</td></tr>`).join("") +
        (P.rows.length > 60 ? `<tr><td colspan="4" class="note">${esc(tr("…and {0} more", fmt(P.rows.length - 60)))}</td></tr>` : "") : "";
      const stock = P.rows.reduce((t, r) => t + r.v * r.w.left, 0), net = P.rows.reduce((t, r) => t + (r.v / (1 + VAT) - r.w.price) * r.w.left, 0);
      $("bzPsum").textContent = !P.ok ? tr("The factor is a number from 1 to 20.") : !P.rows.length ? tr("No wines to price: each in stock already has one, or no cost price.")
        : tr(P.rows.length === 1 ? "1 wine, {1} bottles: {2} at the new prices, {3} over the cost, VAT excluded." : "{0} wines, {1} bottles: {2} at the new prices, {3} over the cost, VAT excluded.", fmt(P.rows.length), fmt(P.rows.reduce((t, r) => t + r.w.left, 0)), kr(Math.round(stock)), kr(Math.round(net)))
          + (noCost ? " " + tr(noCost === 1 ? "1 wine has no cost price and is left as it is." : "{0} wines have no cost price and are left as they are.", fmt(noCost)) : "");
      const go = $("bzPgo"); go.textContent = P.rows.length === 1 ? tr("Set 1 price") : tr("Set {0} prices", fmt(P.rows.length)); go.disabled = !P.ok || !P.rows.length;
      try { localStorage.setItem(PRICING_KEY(), JSON.stringify({ x: P.x, step: P.step, which: P.which })); } catch (e) {}
    };
    ["bzPx", "bzPstep", "bzPwhich"].forEach(id => { $(id).oninput = draw; $(id).onchange = draw; }); draw();
    $("bzPgo").onclick = async () => {
      const P = plan(); if (!P.ok || !P.rows.length) return;
      const before = P.rows.map(({ w }) => ({ row: w.row, fields: { menuPrice: w.menuPrice > 0 ? w.menuPrice : "" } }));
      $("bzPgo").disabled = true;
      try {
        let res; for (let i = 0; i < P.rows.length; i += 2000) // in parts: the server takes up to 5,000 at a time
          res = await api({ action: "setinfomany", edits: P.rows.slice(i, i + 2000).map(({ w, v }) => ({ row: w.row, fields: { menuPrice: v } })) });
        if (!res || !res.wines) res = await api({ action: "data" });
        WINES = normalize(res.wines); renderOverview(); renderTable(); renderEnjoyed(); m.classList.remove("open");
        notify(P.rows.length === 1 ? tr("1 price set") : tr("{0} prices set", fmt(P.rows.length)), [{ label: tr("Undo"), fn: async () => {
          let r; for (let i = 0; i < before.length; i += 2000) r = await api({ action: "setinfomany", edits: before.slice(i, i + 2000) });
          if (!r || !r.wines) r = await api({ action: "data" });
          WINES = normalize(r.wines); renderOverview(); renderTable(); renderEnjoyed(); toast(tr("Prices put back")); } }]);
      } catch (err) { toast(tr("Could not save: {0}", errText(err))); $("bzPgo").disabled = false; }
    };
    setTimeout(() => $("bzPx").focus(), 30);
  }
  // the count: what's on the shelf, beside what the stock says; the differences in bottles and at cost; saved in one go.
  // What's typed is kept if the sheet closes before Save (Escape, Close, a tap beside it), until it's saved or cleared.
  let COUNT = {};
  function openCount() {
    const list = WINES.filter(w => !w.elsewhere && (w.left > 0 || w.par > 0)).sort((a, b) => placeOf(a).localeCompare(placeOf(b)) || a.producer.localeCompare(b.producer));
    const m = sheet("bzCount", "Count stock", `<p class="note">${esc(tr("Type what's on the shelf; a line left empty isn't counted. Nothing is saved until Save the count."))}</p>
      <div class="bz-scroll" style="max-height:52vh"><table class="bz-tab2 bz-cnt"><thead><tr><th>${esc(tr("Location"))}</th><th>${esc(tr("Wine"))}</th><th>${esc(tr("In stock"))}</th><th>${esc(tr("Counted"))}</th><th>${esc(tr("Difference"))}</th></tr></thead>
      <tbody>${list.map(w => `<tr><td>${esc(placeOf(w) || "—")}</td><td><b>${esc(w.producer)}</b> ${esc([w.name, w.vintage || "NV"].filter(Boolean).join(" "))}</td><td>${esc(fmt(Math.max(0, w.left)))}</td>
        <td><input class="bz-n" type="number" min="0" step="1" inputmode="numeric" data-cnt="${w.row}" aria-label="${esc(tr("Counted"))}"></td><td class="bz-dif" data-dif="${w.row}"></td></tr>`).join("")}</tbody></table></div>
      <p id="bzCountSum" class="bz-csum"></p>
      <p class="bz-btns"><button type="button" class="btn primary" data-bz="csave">${esc(tr("Save the count"))}</button><button type="button" class="btn" data-bz="ccsv">${esc(tr("Download the count as CSV"))}</button></p>`);
    const sum = () => { const rows = Object.entries(COUNT).map(([r, n]) => { const w = WINES.find(x => x.row === Number(r)); return { w, d: n - Math.max(0, w.left) }; });
      const off = rows.filter(x => x.d), b = off.reduce((s, x) => s + x.d, 0), v = off.reduce((s, x) => s + x.d * (x.w.price || 0), 0);
      $("bzCountSum").textContent = !rows.length ? "" : tr("{0} counted · {1} differ · {2} bottles · {3} at cost", fmt(rows.length), fmt(off.length), (b > 0 ? "+" : "") + fmt(b), SHOW_PRICES ? (v > 0 ? "+" : "") + kr(Math.round(v)) : "···"); };
    m.oninput = e => { const i = e.target.closest("[data-cnt]"); if (!i) return; const row = Number(i.dataset.cnt), w = WINES.find(x => x.row === row), cell = m.querySelector(`[data-dif="${row}"]`);
      if (i.value === "") { delete COUNT[row]; cell.textContent = ""; } else { COUNT[row] = Math.max(0, Math.round(Number(i.value))); const d = COUNT[row] - Math.max(0, w.left);
        cell.textContent = d ? (d > 0 ? "+" : "") + fmt(d) : "✓"; cell.className = "bz-dif" + (d < 0 ? " neg" : d > 0 ? " pos" : ""); }
      sum(); };
    const kept = Object.keys(COUNT).filter(r => m.querySelector(`[data-cnt="${r}"]`));
    Object.keys(COUNT).forEach(r => { if (!kept.includes(r)) delete COUNT[r]; });
    kept.forEach(r => { const i = m.querySelector(`[data-cnt="${r}"]`); i.value = COUNT[r]; m.oninput({ target: i }); });
    if (kept.length) { const p = document.createElement("p"); p.className = "bz-btns"; p.innerHTML = `<span class="note">${esc(tr("Your count so far is kept: {0} lines", fmt(kept.length)))}</span> <button type="button" class="btn quiet" data-bz="cclear">${esc(tr("Start the count again"))}</button>`;
      m.querySelector("#bzCountSum").before(p); p.querySelector("button").onclick = () => { COUNT = {}; openCount(); }; }
    m.querySelector('[data-bz="csave"]').onclick = async e => { const ch = Object.entries(COUNT).map(([r, n]) => ({ row: Number(r), left: n })).filter(x => x.left !== Math.max(0, WINES.find(w => w.row === x.row).left));
      if (!ch.length) { toast(tr("The count matches the stock")); COUNT = {}; m.classList.remove("open"); return; }
      e.target.disabled = true; const failed = await setStocks(ch); e.target.disabled = false;
      toast(failed.length ? failText(failed) : tr("The count is saved: {0} wines changed", fmt(ch.length))); if (!failed.length) { COUNT = {}; m.classList.remove("open"); } };
    m.querySelector('[data-bz="ccsv"]').onclick = () => { const rows = [[tr("Location"), tr("Producer"), tr("Wine"), tr("Vintage"), tr("In stock"), tr("Counted"), tr("Difference"), tr("Cost price")]]
      .concat(list.filter(w => COUNT[w.row] != null).map(w => [placeOf(w), w.producer, w.name || "", w.vintage || "", Math.max(0, w.left), COUNT[w.row], COUNT[w.row] - Math.max(0, w.left), w.price || ""]));
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([EXPORT.csv(rows)], { type: "text/csv;charset=utf-8" }));
      a.download = `allwine-${tr("count")}-${new Date().toISOString().slice(0, 10)}.csv`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); };
    setTimeout(() => { const i = m.querySelector("[data-cnt]"); if (i) i.focus(); }, 30);
  }

  // Quick sell: a till for service. Type a few letters (or nothing, for the wines by the glass first), tap Bottle or Glass;
  // the sale is saved as from the inventory (sell, with Undo in the bar) and the tiles follow the stock.
  function openTill() {
    let t = $("bzTill");
    if (!t) { t = document.createElement("div"); t.id = "bzTill"; t.className = "modal bz-till"; t.setAttribute("role", "dialog"); t.setAttribute("aria-modal", "true");
      t.innerHTML = `<div class="card"><div class="bz-h"><h2>${esc(tr("Quick sell"))}</h2><button type="button" class="btn" data-bz="tclose">${esc(tr("Close"))}</button></div>
        <input type="search" id="bzTillQ" placeholder="${esc(tr("Search wine, producer or vintage"))}" aria-label="${esc(tr("Search wine, producer or vintage"))}" autocomplete="off">
        <div class="bz-tiles" id="bzTiles"></div></div>`;
      document.body.appendChild(t);
      t.querySelector('[data-bz="tclose"]').onclick = () => t.classList.remove("open");
      t.addEventListener("keydown", e => { if (e.key === "Escape") t.classList.remove("open"); });
      $("bzTillQ").oninput = tillDraw; }
    t.classList.add("open"); $("bzTillQ").value = ""; tillDraw(); setTimeout(() => $("bzTillQ").focus(), 30);
  }
  function tillDraw() {
    const box = $("bzTiles"); if (!box || !$("bzTill").classList.contains("open")) return;
    const W = words(), q = fold($("bzTillQ").value).trim();
    const list = WINES.filter(w => w.left > 0 || w.openGlasses > 0).filter(w => !q || qMatch(q, [w.producer, w.name, w.vintage]))
      .sort((a, b) => (b.glassPrice > 0) - (a.glassPrice > 0) || a.producer.localeCompare(b.producer)).slice(0, 24);
    box.innerHTML = list.map(w => `<div class="bz-tile"><b>${esc(w.producer)}</b><span>${esc([w.name, w.vintage || "NV"].filter(Boolean).join(" "))}</span>
        <small>${esc(btl(fmt(w.left)))}${w.openGlasses > 0 ? " · " + esc(tr(w.openGlasses === 1 ? "+ 1 glass open" : "+ {0} glasses open", w.openGlasses)) : ""}</small>
        <span class="bz-tb">${w.left > 0 ? `<button type="button" class="btn primary" data-sell="bottle" data-row="${w.row}">${esc(tr("Bottle"))}${w.menuPrice > 0 ? " · " + esc(fmt(w.menuPrice)) : ""}</button>` : ""}
        ${W.glass && (w.left > 0 || w.openGlasses > 0) ? `<button type="button" class="btn" data-sell="glass" data-row="${w.row}">${esc(tr("Glass"))}${w.glassPrice > 0 ? " · " + esc(fmt(w.glassPrice)) : ""}</button>` : ""}</span></div>`).join("")
      || `<p class="note">${esc(tr("No wines match."))}</p>`;
  }

  // staff logins: each with its own password, opening this business's cellar; "staff" sells and counts, "manager" also
  // sees the figures. Adding one asks for the owner's password: it unwraps the cellar's key in this browser, to wrap it
  // to the new login's password (VAULT.addStaff); the server never sees the key.
  let STAFF = null;
  async function staffDraw(fresh) {
    const box = $("bzStaff"); if (!box) return;
    if (!STAFF || fresh) { try { STAFF = (await api({ action: "stafflist" })).staff || []; }
      catch (e) { box.innerHTML = `<p class="note">${esc(/bad-action|staff-account/.test(String(e && e.message)) ? tr("Staff logins need the updated Apps Script (version 54): redeploy Code.gs.") : tr("Could not reach the cellar API ({0}).", errText(e)))}</p>`; return; } }
    const RO = { staff: "Staff: sells, counts, takes goods in", manager: "Manager: also sees sales, prices and accounts" };
    const box2 = $("bzStaff"); if (!box2) return;
    box2.innerHTML = `<p class="note">${esc(tr("Your staff log in with their own name and password and work in this cellar. The site shows staff less, but they hold the cellar's key, so add only people you trust."))}</p>
      ${STAFF.length ? `<ul class="bz-sup">${STAFF.map(m => `<li><span><b>${esc(m.user)}</b><small class="bz-have">${esc(m.lastSeen ? tr("last seen {0}", m.lastSeen) : tr("not logged in yet"))}</small></span>
        <span class="bz-btns"><select data-srole="${esc(m.user)}" aria-label="${esc(tr("Role"))}">${Object.keys(RO).map(k => `<option value="${k}"${m.role === k ? " selected" : ""}>${esc(tr(RO[k]))}</option>`).join("")}</select>
        <button type="button" class="btn quiet" data-sdel="${esc(m.user)}">${esc(tr("Remove"))}</button></span></li>`).join("")}</ul>` : ""}
      <form class="bz-staffadd" id="bzStaffAdd"><label class="bz-f">${esc(tr("Username"))}<input id="bzSUser" autocomplete="off" required minlength="3" maxlength="24" pattern="[A-Za-z0-9_.\\-]{3,24}"></label>
        <label class="bz-f">${esc(tr("Their password"))}<input id="bzSPass" type="password" autocomplete="new-password" required minlength="10"></label>
        <label class="bz-f">${esc(tr("Role"))}<select id="bzSRole">${Object.keys(RO).map(k => `<option value="${k}">${esc(tr(RO[k]))}</option>`).join("")}</select></label>
        <label class="bz-f">${esc(tr("Your password"))}<input id="bzSOwn" type="password" autocomplete="current-password" required></label>
        <button type="submit" class="btn primary">${esc(tr("Add a staff login"))}</button><span class="note" id="bzSMsg"></span></form>`;
    $("bzStaffAdd").onsubmit = async e => { e.preventDefault();
      const member = $("bzSUser").value.trim(), memberPass = $("bzSPass").value, role = $("bzSRole").value, pass = $("bzSOwn").value, msg = $("bzSMsg");
      if (memberPass.length < 10) { msg.textContent = tr("Their password: at least 10 characters."); return; }
      const btn = e.target.querySelector("button[type=submit]"); btn.disabled = true; msg.textContent = tr("Adding…");
      try { const r = await VAULT.addStaff({ post, user: cfg.user, pass, member, memberPass, role }); STAFF = r.staff || []; staffDraw(); toast(tr("{0} can log in now", member)); }
      catch (err) { const m = String(err && err.message || err); msg.textContent = /bad-login/.test(m) ? tr("That isn't your password.") : /user-taken/.test(m) ? tr("That username is taken: choose another.")
        : /staff-full/.test(m) ? tr("Ten staff logins is the most.") : /bad-username/.test(m) ? tr("Username: 3–24 letters, numbers, . _ or -.") : tr("Could not save: {0}", m); btn.disabled = false; }
      finally { $("bzSOwn") && ($("bzSOwn").value = ""); } };
    box2.querySelectorAll("[data-sdel]").forEach(b => b.onclick = async () => {
      if (!(await ask(tr("Remove the login {0}? They can no longer open the cellar; the cellar itself isn't touched.", b.dataset.sdel), { ok: tr("Remove"), danger: true }))) return;
      try { STAFF = (await api({ action: "staffdel", member: b.dataset.sdel })).staff || []; staffDraw(); } catch (err) { toast(tr("Could not save: {0}", errText(err))); } });
    box2.querySelectorAll("[data-srole]").forEach(sel => sel.onchange = async () => {
      try { STAFF = (await api({ action: "staffrole", member: sel.dataset.srole, role: sel.value })).staff || []; toast(tr("Saved")); } catch (err) { toast(tr("Could not save: {0}", errText(err))); } });
  }

  const domKey = () => "vinDomaine:" + String(cfg.user || "").toLowerCase();
  function domaine() {
    try { const x = window.VAULT && VAULT.active() && VAULT.prefs(); if (x && typeof x.domaine === "string") return x.domaine; } catch (e) {}
    return localStorage.getItem(domKey()) || "";
  }
  function setDomaine(v) { try { localStorage.setItem(domKey(), v); } catch (e) {} if (window.VAULT && VAULT.active()) savePrefs({ domaine: v }).catch(() => {}); }

  /* ---------- the wine card online: share.html#<id>.<key>, behind a QR code ---------- */
  // Sealed with share-crypto.js like a shared list, kept for a year, and sealed again under the same key whenever what it
  // shows changes (a price, a wine sold out) or a month has gone by, so the printed code never needs replacing. The id
  // and key live in this browser and in the vault's prefs; without them (another browser, before the vault) the card
  // is put online afresh, with a new code.
  const CARD_DAYS = 365, REFRESH = 30 * 864e5;
  const cardKey = () => "vinCardShare:" + String(cfg.user || "").toLowerCase();
  function cardShare() {
    let here = null, vault = null;
    try { here = JSON.parse(localStorage.getItem(cardKey()) || "null"); } catch (e) {}
    try { const x = window.VAULT && VAULT.active() && VAULT.prefs(); if (x && x.cardShare && x.cardShare.id) vault = x.cardShare; } catch (e) {}
    if (vault) return here && here.id === vault.id ? here : { id: vault.id, key: vault.key }; // no sig: sealed again at the next change
    return here && here.id ? here : null;
  }
  function setCardShare(x) {
    try { x ? localStorage.setItem(cardKey(), JSON.stringify(x)) : localStorage.removeItem(cardKey()); } catch (e) {}
    if (window.VAULT && VAULT.active()) savePrefs({ cardShare: x ? { id: x.id, key: x.key } : null }).catch(() => {});
  }
  const cardUrl = x => new URL("share.html#" + x.id + "." + x.key, location.href).href;
  const cardTitle = () => { try { return localStorage.getItem(titleKey()) || tr(words().card); } catch (e) { return tr(words().card); } };
  // what the online card shows: [producer, wine, vintage, region, country, colour, glass price, price, bottles]
  function cardData() {
    const W = words();
    const w = WINES.filter(x => x.left > 0 && x.menuPrice > 0).map(x => [x.producer, [x.name, x.classification].filter(Boolean).join(" · "), x.vintage || "",
      x.region || "", x.country || "", x.style || "", W.glass && x.glassPrice > 0 ? x.glassPrice : null, x.menuPrice, KIND === "merchant" ? x.left : null]);
    return { v: 1, k: "card", kind: KIND, t: cardTitle(), by: cfg.user || "", glass: !!W.glass, w };
  }
  const sigOf = d => JSON.stringify(d);
  let cardBusy = null, cardTimer = 0;
  async function publishCard() {
    if (cardBusy) return cardBusy;
    cardBusy = (async () => {
      if (!window.SHARE_CRYPTO || !window.crypto || !crypto.subtle) throw new Error("old-browser");
      const d = cardData(), sig = sigOf(d), old = cardShare();
      const sealed = await SHARE_CRYPTO.seal(Object.assign({ at: Date.now() }, d), old && old.key);
      let r = null;
      if (old) {
        // withdrawn (here, or in Share) or run out: never a new link behind the owner's back, as the printed code
        // would quietly stop working; the card says it's offline, and putting it online again makes a new code
        try { r = await api({ action: "shareupdate", id: old.id, blob: sealed.blob, days: CARD_DAYS, wines: d.w.length }); }
        catch (e) { if (/share-gone/.test(String(e && e.message || e))) setCardShare(null); throw e; }
        setCardShare({ id: old.id, key: old.key, sig, at: Date.now() }); return cardShare();
      }
      const fresh = await SHARE_CRYPTO.seal(Object.assign({ at: Date.now() }, d));
      r = await api({ action: "shareput", blob: fresh.blob, days: CARD_DAYS, wines: d.w.length });
      setCardShare({ id: r.id, key: fresh.key, sig, at: Date.now() });
      return cardShare();
    })();
    try { return await cardBusy; } finally { cardBusy = null; }
  }
  // after a change: if the card is online and what it shows is different, or it's a month old, seal it again (quietly)
  function syncCard() {
    const x = cardShare(); if (!x || !on()) return;
    if (x.sig === sigOf(cardData()) && Date.now() - (x.at || 0) < REFRESH) return;
    clearTimeout(cardTimer);
    const redraw = () => { const o = $("bzOnline"); if (o) onlineHTML(o); };
    cardTimer = setTimeout(() => publishCard().then(redraw, e => { if (/share-gone/.test(String(e && e.message || e))) { redraw(); toast(tr("The online wine card was withdrawn: its QR code no longer opens it")); } }), 3000);
  }
  async function takeOffline() {
    const x = cardShare(); if (!x) return;
    try { await api({ action: "sharedel", id: x.id }); } catch (e) { if (!/share-gone/.test(String(e && e.message || e))) throw e; }
    setCardShare(null);
  }
  let QR_LOAD = null;
  const loadQR = () => window.qrcode ? Promise.resolve() : (QR_LOAD = QR_LOAD || new Promise((ok, no) => {
    const s = document.createElement("script"); s.src = "vendor/qrcode.js?v=1"; s.onload = ok; s.onerror = () => { QR_LOAD = null; no(new Error("qr")); }; document.head.appendChild(s); }));
  function qrSvg(text) { const q = qrcode(0, "M"); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 4, margin: 4, scalable: true }); }
  const shareErr = m => m === "too-many-shares" ? tr("You have 20 shared lists open: withdraw one first.")
    : m === "share-too-big" ? tr("The card is too big to put online.") : m === "old-browser" ? tr("This browser can't encrypt a shared list.")
    : m === "bad-action" ? tr("The online card needs the updated Apps Script (version 48): redeploy Code.gs.") : tr("Could not save: {0}", m);
  async function onlineHTML(box) {
    const x = cardShare();
    if (!x) {
      box.innerHTML = `<button type="button" class="btn" data-bz="online">${esc(tr("Put it online, with a QR code"))}</button>
        <span class="note">${esc(tr("Guests scan the code and see the card as it is: it follows your prices and stock by itself. It's encrypted in your browser; we can't read it."))}</span>`;
      box.querySelector('[data-bz="online"]').onclick = async e => { e.target.disabled = true;
        try { await publishCard(); onlineHTML(box); } catch (err) { e.target.disabled = false; toast(shareErr(String(err && err.message || err).replace(/^Error: /, ""))); } };
      return;
    }
    const url = cardUrl(x);
    box.innerHTML = `<div class="bz-qr" id="bzQr"></div><div class="bz-on"><b>${esc(tr("Online"))}</b>
        <input class="bz-url" readonly value="${esc(url)}" aria-label="${esc(tr("The card's link"))}">
        <span class="bz-btns"><button type="button" class="btn" data-bz="copy">${esc(tr("Copy link"))}</button>
          <button type="button" class="btn" data-bz="qrprint">${esc(tr("Print the QR code"))}</button>
          <a class="btn" href="${esc(url)}" target="_blank" rel="noopener">${esc(tr("Open"))}</a>
          <button type="button" class="btn quiet" data-bz="offline">${esc(tr("Take it offline"))}</button></span>
        <span class="note">${esc(x.at ? tr("Updated {0}", new Date(x.at).toLocaleString()) : "")}</span></div>`;
    box.querySelector('[data-bz="copy"]').onclick = async () => { try { await navigator.clipboard.writeText(url); toast(tr("Link copied")); } catch (e) { box.querySelector(".bz-url").select(); toast(tr("Select the link and copy it")); } };
    box.querySelector('[data-bz="qrprint"]').onclick = () => { document.body.classList.add("bz-qrprint"); window.print(); setTimeout(() => document.body.classList.remove("bz-qrprint"), 500); };
    box.querySelector('[data-bz="offline"]').onclick = async e => { e.target.disabled = true;
      try { await takeOffline(); toast(tr("Taken offline: the code no longer opens the card")); onlineHTML(box); }
      catch (err) { e.target.disabled = false; toast(tr("Could not withdraw: {0}", String(err && err.message || err))); } };
    try { await loadQR(); const q = $("bzQr"); if (q) q.innerHTML = qrSvg(url) + `<p class="bz-qrt">${esc(cardTitle())}</p><p class="bz-qrn">${esc(tr("Scan for the wine card"))}</p>`; }
    catch (e) { const q = $("bzQr"); if (q) q.textContent = tr("The QR code couldn't load: copy the link instead."); }
  }

  /* ---------- the wine card / price list: on the page, printable ---------- */
  const STYLE_ORDER = ["Bobler", "Hvid", "Rosé", "Rød", "Hedvin"], STYLE_NAME = { Bobler: "Sparkling", Hvid: "White", "Rosé": "Rosé", "Rød": "Red", Hedvin: "Fortified" };
  const titleKey = () => "vinCardTitle:" + String(cfg.user || "").toLowerCase();
  function openCard() { go("winecard"); scrollTo({ top: 0 }); }
  function renderCard() {
    if (!on()) return;
    pages();
    const W = words(), list = WINES.filter(w => w.left > 0 && w.menuPrice > 0);
    const c = $("bizCard");
    // not while the title is being typed
    if (document.activeElement && document.activeElement.id === "bzTitle") return;
    const groups = STYLE_ORDER.concat([...new Set(list.map(w => w.style))].filter(s => !STYLE_ORDER.includes(s)))
      .map(s => [s, list.filter(w => w.style === s).sort((a, b) => (a.country || "").localeCompare(b.country || "") || (a.region || "").localeCompare(b.region || "")
        || a.producer.localeCompare(b.producer) || (a.vintage || 0) - (b.vintage || 0))]).filter(g => g[1].length);
    const title = localStorage.getItem(titleKey()) || tr(W.card);
    c.innerHTML = `<div class="bz-bar"><button type="button" class="btn primary" data-bz="print">${esc(tr("Print or save as PDF"))}</button>
        <span class="note">${esc(tr(list.length === 1 ? "1 wine: in stock and priced. Click the title to change it." : "{0} wines: in stock and priced. Click the title to change it.", fmt(list.length)))}</span></div>
      <div class="bz-online" id="bzOnline"></div>
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
    c.querySelector('[data-bz="print"]').onclick = () => window.print();
    const h = $("bzTitle"); h.onblur = () => { const v = h.textContent.trim(); try { v ? localStorage.setItem(titleKey(), v) : localStorage.removeItem(titleKey()); } catch (e) {} syncCard(); };
    onlineHTML($("bzOnline"));
    h.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); h.blur(); } };
  }

  // the styles, once
  document.head.insertAdjacentHTML("beforeend", `<style>
.bz-d{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:end;margin:10px 0;padding:10px 12px;border-radius:10px;background:var(--card2,rgba(0,0,0,.03));border:1px solid var(--line)}
.bz-f{display:grid;gap:3px;font-size:12px;color:var(--muted)} .bz-f input{width:120px;font:inherit;font-size:14px;color:var(--ink);padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:var(--bg)}
.bz-f input[data-f="source"],.bz-dom input{width:200px}
.bz-m{font-size:13px;color:var(--ink);flex-basis:100%}
.bz-mp{display:block;font-size:11.5px;color:var(--muted)}
.bz-sell{display:flex;flex-wrap:wrap;gap:8px;align-items:center;flex-basis:100%}
.bz-p h4{font-size:12.5px;margin:12px 0 4px;color:var(--muted);font-weight:600} .bz-k small{font-size:13px;font-weight:500;color:var(--muted)}
.bz-wk{display:grid;grid-template-columns:repeat(8,1fr);gap:4px;height:64px;align-items:end;margin:6px 0 2px} .bz-wk span{position:relative;height:100%;display:flex;align-items:flex-end}
.bz-wk i{display:block;width:100%;min-height:2px;border-radius:3px 3px 0 0;background:var(--accent,#7C2D3E)} .bz-wk span:last-child i{background:var(--gold,#A87E2F)}
.bz-wk em{position:absolute;bottom:-16px;right:0;font-size:10.5px;font-style:normal;color:var(--muted);white-space:nowrap} .bz-wk{margin-bottom:20px}
.bz-gl input{width:70px} .bz-exp{display:flex;flex-wrap:wrap;gap:8px;align-items:end} .bz-exp select{font:inherit;font-size:14px;padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink)}
.bz-have{display:block;font-size:11.5px;color:var(--muted)}
.bz-p{margin:0 0 16px} .bz-p h2{margin-top:0} .bz-ks{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin:6px 0 10px}
.bz-k{background:var(--card2,rgba(0,0,0,.03));border-radius:10px;padding:8px 10px} .bz-k b{display:block;font:600 19px/1.15 var(--serif,Georgia);font-variant-numeric:tabular-nums} .bz-k span{font-size:11.5px;color:var(--muted)}
.bz-sup{list-style:none;padding:0;margin:0 0 8px} .bz-sup li{display:flex;justify-content:space-between;border-bottom:1px solid var(--line);padding:4px 0;font-size:13.5px}
.bz-own div{margin:4px 0;font-size:13.5px} .bz-v{display:inline-block;margin:2px 6px 2px 0;padding:1px 7px;border-radius:999px;background:var(--chip,rgba(0,0,0,.05));font-size:12px}
.bz-foot{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.bz-card{padding:4px 0 16px}
.bz-h{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:end;justify-content:space-between} .bz-h h2,.bz-h h3{margin:0}
.bz-k em{display:block;font-style:normal;font-size:11.5px;color:var(--muted)} .bz-warn b{color:var(--accent,#7C2D3E)} .bz-warn{cursor:pointer;outline-offset:2px}
.bz-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:4px 24px}
.bz-tab2{width:100%;border-collapse:collapse;font-size:13.5px;margin:4px 0 10px} .bz-tab2 th{text-align:left;font-weight:600;font-size:12px;color:var(--muted);border-bottom:1px solid var(--line);padding:4px 6px}
.bz-tab2 th{white-space:normal;letter-spacing:.02em} .bz-tab2 td{border-bottom:1px solid var(--line);padding:4px 6px;font-variant-numeric:tabular-nums} .bz-tab2 td+td,.bz-tab2 th+th{text-align:right}
.bz-select,.bz-tools select,.bz-f select{font:inherit;font-size:14px;padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink)}
.bz-tools{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 10px} .bz-tools input{flex:1;min-width:180px;font:inherit;font-size:14px;padding:7px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink)}
.bz-scroll{overflow-x:auto} .bz-inv-t{width:100%;border-collapse:collapse;font-size:13.5px} .bz-tab2,.bz-inv-t{min-width:0}
.bz-pform{display:flex;flex-wrap:wrap;gap:10px 14px;margin:8px 0} .bz-psum{font-size:13.5px;margin:6px 0} #bzPricing .bz-scroll{max-height:46vh;overflow:auto} #bzPricing .bz-f{display:grid;align-content:start} #bzPricing .bz-f input{width:90px;margin:0} .bz-pgo{text-align:right;margin:8px 0 0}
.bz-mm{display:grid;gap:4px;height:140px;align-items:end;margin:6px 0 22px} .bz-mm span{position:relative;height:100%;display:flex;flex-direction:column-reverse}
.bz-mm i{display:block;width:100%;flex:none} .bz-mm i:last-of-type{border-radius:3px 3px 0 0} .bz-mm em{position:absolute;bottom:-17px;left:0;right:0;text-align:center;font-size:10.5px;font-style:normal;color:var(--muted);white-space:nowrap;overflow:hidden}
.bz-mm .c,.bz-mmk .c{background:var(--muted);opacity:.35} .bz-mm .p,.bz-mmk .p{background:var(--accent,#7C2D3E)} .bz-mm .u,.bz-mmk .u{background:var(--gold,#A87E2F);opacity:.45}
.bz-mm .ly{position:absolute;left:-2px;right:-2px;height:0;border-top:2px dashed var(--ink)}
.bz-mmk{font-size:12px;color:var(--muted);display:flex;flex-wrap:wrap;gap:4px 12px;align-items:center;margin:2px 0 6px} .bz-mmk span{display:inline-block;width:12px;height:10px;border-radius:2px;margin-right:-6px}
.bz-mmk .ly{height:0;border-top:2px dashed var(--ink);background:none;border-radius:0} .bz-mmt th[scope=row]{text-align:left;font-weight:500;color:var(--ink);font-size:13.5px;white-space:nowrap;text-transform:none;letter-spacing:0} .bz-mmt td{text-align:right}
@media (max-width:640px){ .bz-mmt{font-size:12.5px} .bz-mmt td,.bz-mmt th{padding:4px 3px;white-space:nowrap} .bz-mmt th[scope=row]{white-space:normal;font-size:12.5px} .bz-mmt thead th{white-space:normal} .bz-mmt .mb,.bz-mmt .my,.bz-mmt .mc{display:none} }
.bz-mmt tfoot td,.bz-mmt tfoot th{font-weight:600;border-top:2px solid var(--line)} .bz-mmt .linkish{background:none;border:0;padding:0;font:inherit;font-size:12px;color:var(--muted);text-decoration:underline;cursor:pointer}
.note .linkish{background:none;border:0;padding:0;font:inherit;color:inherit;text-decoration:underline;cursor:pointer}
@media (max-width:700px){ /* phones: the tab bar has the wine card, the toolbar adds wines, so neither twice; the figures in a compact strip */
  .bz-inv [data-bz="card2"]{display:none} body:has(#pageInventory:not([hidden])) .pfab{display:none}
  .bz-inv .bz-ks{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px} .bz-inv .bz-k{padding:6px 8px} .bz-inv .bz-k b{font-size:16px} .bz-inv .bz-k span{display:block;font-size:11px;line-height:1.25} }
@media (min-width:641px){ .bz-inv-t{min-width:880px} }
.bz-inv-t th{text-align:left;font-size:12px;font-weight:600;color:var(--muted);padding:6px;border-bottom:1px solid var(--line);white-space:nowrap}
.bz-inv-t td{padding:5px 6px;border-bottom:1px solid var(--line);vertical-align:middle}
.bz-inv-t small{display:block;font-size:11.5px;color:var(--muted)} .bz-wn{min-width:200px} .bz-wn .linkish{background:none;border:0;padding:0;font:inherit;color:inherit;text-align:left;cursor:pointer}
.bz-wn .linkish:hover b{text-decoration:underline}
.bz-n{width:78px;font:inherit;font-size:13.5px;padding:5px 6px;border:1px solid var(--line);border-radius:7px;background:var(--bg);color:var(--ink);font-variant-numeric:tabular-nums}
.bz-sp{width:140px;text-align:left;font:inherit;font-size:13.5px;padding:5px 6px;border:1px solid var(--line);border-radius:7px;background:var(--bg);color:var(--ink)}
.bz-under td:first-child{box-shadow:inset 3px 0 var(--accent,#7C2D3E)} .bz-out{opacity:.7} .bz-mg{white-space:nowrap;font-variant-numeric:tabular-nums}
.bz-sl{white-space:nowrap} .bz-sl .btn{padding:4px 9px;font-size:12.5px;margin-right:4px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
/* a page's wide tables scroll or fold inside it, never widening the page (the body is a flex column) */
.bz-till .card{max-width:860px;width:100%} .bz-till input[type=search]{width:100%;box-sizing:border-box;font:inherit;font-size:18px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--ink);margin:8px 0 12px}
.bz-gin small{display:block;font-size:11.5px;color:var(--muted)} .bz-gin td,.bz-cnt td{vertical-align:middle} .bz-gin .bz-n,.bz-cnt .bz-n{width:80px}
.bz-dif{font-variant-numeric:tabular-nums;font-weight:600} .bz-dif.neg{color:#B3261E} .bz-dif.pos{color:#2E7D32} .bz-csum{font-weight:600;margin:8px 0 0}
.bz-staffadd{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:end;margin-top:8px} .bz-staffadd select{font:inherit;font-size:14px;padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink)}
.bz-sup select{font:inherit;font-size:13px;padding:4px 6px;border:1px solid var(--line);border-radius:7px;background:var(--bg);color:var(--ink)}
.bz-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:10px;max-height:60vh;overflow:auto}
.bz-tile{display:grid;gap:3px;padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--card,transparent)} .bz-tile span{font-size:13.5px} .bz-tile small{color:var(--muted);font-size:12px}
.bz-tb{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px} .bz-tb .btn{padding:10px 12px;font-size:14px;flex:1}
#bzOrders{display:none}
@media print{ body.bz-orderprint > *:not(#bzOrders){display:none !important} body.bz-orderprint #bzOrders{display:block}
  .bz-po{break-after:page;font-family:system-ui,sans-serif;color:#111} .bz-po h2{font-size:18pt;margin:0 0 4pt} .bz-po table{width:100%;border-collapse:collapse;margin-top:10pt}
  .bz-po th,.bz-po td{text-align:left;border-bottom:1px solid #bbb;padding:5pt 4pt} .bz-po td+td,.bz-po th+th{text-align:right} }
.bz-page{display:grid;grid-template-columns:minmax(0,1fr)} .bz-page[hidden]{display:none!important}
/* a phone: each wine a card, its fields labelled */
@media (max-width:640px){ .bz-inv-t thead{display:none} .bz-inv-t,.bz-inv-t tbody{display:block}
  .bz-inv-t tr{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:10px 0;border-bottom:1px solid var(--line)}
  .bz-inv-t td{border:0;padding:0;min-width:0} .bz-inv-t td.bz-wn,.bz-inv-t td.bz-sl{grid-column:1/-1} .bz-wn{min-width:0}
  .bz-inv-t td[data-l]::before{content:attr(data-l);display:block;font-size:11px;color:var(--muted);margin-bottom:2px}
  .bz-n,.bz-sp{width:100%;box-sizing:border-box} .bz-under td:first-child{box-shadow:none} .bz-inv-t tr.bz-under{box-shadow:inset 3px 0 var(--accent,#7C2D3E);padding-left:10px}
  .bz-sl .btn{padding:8px 14px} .bz-tools select{flex:1} }
.bz-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;max-width:720px;margin:0 auto 12px}
.bz-sheet{max-width:720px;margin:0 auto;background:#fff;color:#1c1416;padding:40px 48px;border-radius:6px;box-shadow:0 6px 30px rgba(0,0,0,.12);font-family:var(--serif,Georgia),serif}
.bz-sheet h1{text-align:center;font-size:30px;font-weight:600;letter-spacing:.04em;margin:0 0 24px;outline:none} .bz-sheet h1:focus{background:#faf6ef}
.bz-sheet h2{font-size:15px;text-transform:uppercase;letter-spacing:.18em;text-align:center;margin:26px 0 8px;color:#7C2D3E}
.bz-sheet h3{font:600 12px/1.2 system-ui,sans-serif;text-transform:uppercase;letter-spacing:.08em;color:#8a7a80;margin:14px 0 4px}
.bz-l{display:grid;grid-template-columns:1fr auto auto auto auto;gap:4px 14px;align-items:baseline;padding:3px 0;font-size:14.5px}
.bz-w b{font-weight:600} .bz-y,.bz-s,.bz-g,.bz-pr{font-variant-numeric:tabular-nums;text-align:right} .bz-g{color:#8a7a80} .bz-pr{min-width:56px;font-weight:600}
.bz-online{display:flex;flex-wrap:wrap;gap:12px;align-items:center;max-width:720px;margin:0 auto 12px;padding:10px 12px;border:1px solid var(--line);border-radius:10px}
.bz-qr{width:132px;text-align:center} .bz-qr svg{display:block;width:132px;height:132px;background:#fff} .bz-qrt,.bz-qrn{display:none}
.bz-on{display:grid;gap:6px;flex:1;min-width:220px} .bz-url{font:inherit;font-size:13px;padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink);width:100%}
.bz-btns{display:flex;flex-wrap:wrap;gap:6px}
.bz-fine{margin-top:26px;font:12px system-ui,sans-serif;color:#8a7a80;text-align:center}
@media (max-width:600px){ .bz-sheet{padding:24px 16px} .bz-l{grid-template-columns:1fr auto auto;font-size:13.5px} .bz-s,.bz-g{display:none} }
@media print{ body.bz-qrprint .bz-bar, body.bz-qrprint .bz-sheet, body.bz-qrprint .bz-on{display:none !important}
  body.bz-qrprint .bz-online{display:block;border:0;max-width:none} body.bz-qrprint .bz-qr{width:auto;margin:30mm auto 0}
  body.bz-qrprint .bz-qr svg{width:90mm;height:90mm;margin:0 auto} body.bz-qrprint .bz-qrt{display:block;font:600 26px var(--serif,Georgia),serif;margin:10mm 0 2mm}
  body.bz-qrprint .bz-qrn{display:block;font:14px system-ui,sans-serif;color:#555}
  body.bz-printcard:not(.bz-qrprint) .bz-online{display:none !important}
  body.bz-printcard > *:not(#app), body.bz-printcard #app > *:not(#pageWinecard){display:none !important}
  body.bz-printcard .bz-card{padding:0;background:#fff}
  body.bz-printcard .bz-bar{display:none} body.bz-printcard .bz-sheet{box-shadow:none;max-width:none;padding:0} body.bz-printcard .bz-l{break-inside:avoid} }
</style>`);
  setTimeout(apply, 0);
  // its words: only a business needs them, so they come now, not with every page (i18n.js redraws the page in them)
  if (window.I18N) { I18N.onChange(apply); if (I18N.more) I18N.more("business-i18n", "?v=10"); }
  return { refreshSales: () => loadSales(true), apply, detail, priceCell, overview, page, inventory, cardLabel, margin, openCard, salesRows, reorder, reorderText, cardData, publishCard, cardShare };
})();
