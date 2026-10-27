// Browser test of the cellar page's layout with 120 wines (real Code.gs through gas-harness.js): the list starts in
// the first screen with the overview in a column beside it, one line per wine, the List / Timeline switch, the
// overview folding above the list on narrower screens, two-line cards and no sideways scroll on a phone, and the
// Journal as a grid of cards.
//   (cd .. && python3 -m http.server 8765) & node tools/layout-ui-test.js
"use strict";
const { chromium } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const gas = H({ Ark1: [["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"]] },
              { settings: { SIGNUP_CODE: "invite" } });
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const P = [["Domaine des Comtes Lafon", "Bourgogne", "Meursault", "Perrières", "1er Cru", "Hvid", "Chardonnay"], ["Armand Rousseau", "Bourgogne", "Gevrey-Chambertin", "Clos St-Jacques", "1er Cru", "Rød", "Pinot Noir"],
  ["Krug", "Champagne", "Reims", "Grande Cuvée", "", "Mousserende", "Chardonnay"], ["Giacomo Conterno", "Piemonte", "Monforte d'Alba", "Barolo Cascina Francia", "", "Rød", "Nebbiolo"]];
const wines = Array.from({ length: 120 }, (_, i) => { const p = P[i % P.length];
  return { producer: p[0], country: "Frankrig", region: p[1], commune: p[2], name: p[3], classification: p[4], type: p[5], grape: p[6], vintage: 2000 + i % 24, qty: 1 + i % 3, price: 500 + i * 10 }; });

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1650, height: 1000 } });
  await require("./turnstile-fake")(ctx);
  await ctx.route(require("./api-route"), async route => { const q = JSON.parse(route.request().postData() || "{}");
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(gas.call(q)) }); });
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  await p.goto(BASE); await p.waitForTimeout(400);
  await p.click("#gateToggle"); await p.fill("#gateUser", "dora"); await p.fill("#gatePass", "dora-pass-1"); await p.fill("#gateInvite", "invite"); await p.fill("#gatePass2", "dora-pass-1"); await p.fill("#gateEmail", "someone@example.com"); await p.click("#gateSubmit");
  await p.waitForSelector("#recModal.open", { timeout: 20000 }); await p.check("#recOk"); await p.click("#recDone");
  await p.waitForSelector("#app:not([hidden])", { timeout: 20000 });
  await p.evaluate(async w => { await api({ action: "addmany", wines: w, bumps: [] }); await loadData(); }, wines);
  await p.waitForTimeout(800);
  const box = sel => p.$eval(sel, e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, w: r.width, h: r.height }; });

  // every panel on (the default shows five), so all of them are checked
  await p.evaluate(() => ["overview", "eOverview"].forEach(id => setLayout(id, panelEls(id).map(e => e.dataset.panel)))); await p.waitForTimeout(300);
  // ── wide screen ──
  const list = await box("#pageCellar .tablewrap"), side = await box("#overview");
  check("the wine list starts within the first screen", list.y < 700, JSON.stringify(list));
  check("…with the overview in a column to its right", side.x > list.x + list.w - 1 && Math.abs(side.y - list.y) < 200, JSON.stringify({ list, side }));
  check("…which stays in view while the list scrolls", await p.$eval("#overview", e => getComputedStyle(e).position) === "sticky");
  const rowH = await p.$$eval("#tbl tr.main", rs => rs.slice(0, 20).map(r => r.getBoundingClientRect().height));
  check("one line per wine", Math.max(...rowH) < 50, JSON.stringify(rowH));
  const cut = await p.$$eval("#tbl thead th", ths => ths.filter(t => t.scrollWidth > t.clientWidth + 1).map(t => t.textContent.trim()));
  check("every column heading shows in full", !cut.length, cut.join(" | "));
  const cw = await p.$$eval("#tbl th", ths => ths.map(t => Math.round(t.getBoundingClientRect().width)));
  check("…and the wine keeps a fair share of the row (not squeezed by the producer)", cw[1] >= 180 && cw[1] >= cw[0] * 0.6, JSON.stringify(cw));
  check("the totals sit in one strip", await p.$$eval("#kpis .kpi", ks => new Set(ks.map(k => Math.round(k.getBoundingClientRect().y))).size === 1));
  const height = await p.evaluate(() => document.documentElement.scrollHeight);
  check(`the page is far shorter than before (${height} px for 120 wines, was ~11 000)`, height < 6500, String(height));
  check("'Collection over time' is hidden while no wine has an acquired date", await p.$eval("#histPanel", e => e.hidden));
  check("the map shows, open, without a click", await p.isVisible("#map") && (await p.$$("#map *")).length > 3);
  check("the drink-window chips sit above the list", await p.isVisible("#prioPanel") && (await box("#prioPanel")).y < list.y);

  // ── the columns: producer, wine, commune, vintage, region, bottles, price ──
  const heads = await p.$$eval("#tbl thead th", ts => ts.filter(t => t.offsetWidth > 0).map(t => t.dataset.k));
  check("the list has its own columns for producer, wine, commune, vintage and region", JSON.stringify(heads) === JSON.stringify(["producer", "name", "commune", "vintage", "region", "left", "price"]), JSON.stringify(heads));
  const first = await p.$eval("#tbl tr.main", r => ({ prod: r.querySelector(".c-prod").innerText.trim(), wine: r.querySelector(".c-wine").innerText.trim(), comm: r.querySelector(".c-comm").innerText.trim(), reg: r.querySelector(".c-reg").innerText.trim() }));
  check("…each in its own cell", first.prod && !first.prod.includes(first.wine.split(" ")[0] + " " + (first.wine.split(" ")[1] || "")) && first.comm && /Frankrig|Bourgogne|Champagne|Piemonte/.test(first.reg), JSON.stringify(first));
  await p.click('#tbl th[data-k="commune"]'); await p.waitForTimeout(200);
  const comms = await p.$$eval("#tbl tr.main .c-comm", cs => cs.slice(0, 40).map(c => c.textContent.trim()));
  check("sorting by commune puts the communes in order", comms.every((c, i) => !i || comms[i - 1].localeCompare(c) <= 0), comms.slice(0, 8).join(" | "));
  await p.click('#tbl th[data-k="price"]'); await p.click('#tbl th[data-k="price"]'); await p.waitForTimeout(150);
  await p.evaluate(async () => { await api({ action: "add", wine: { producer: "Skærsøgaard", name: "Solaris", country: "Danmark", region: "", type: "Hvid", qty: 1 } }).catch(() => {}); await loadData(); });
  await p.waitForTimeout(400);
  const opts = await p.$$eval("#fCountry option", os => os.map(o => o.value));
  check("a country filter lists the cellar's countries", !(await p.$eval("#fCountry", e => e.hidden)) && opts.includes("Frankrig") && opts.includes("Danmark"), JSON.stringify(opts));
  await p.selectOption("#fCountry", "Danmark"); await p.waitForTimeout(200);
  const dk = await p.$$eval("#tbl tr.main .c-prod", cs => cs.map(c => c.textContent));
  check("…and filters by it", dk.length === 1 && /Skærsøgaard/.test(dk[0]), JSON.stringify(dk));
  await p.selectOption("#fCountry", ""); await p.waitForTimeout(200);

  // ── the four extra views in the overview ──
  const sums = await p.evaluate(() => {
    const n = id => [...document.querySelectorAll("#" + id + " .rb-n")].reduce((s, e) => s + (parseInt(e.textContent.replace(/\D+/g, " ").trim().split(" ")[0], 10) || 0), 0);
    const cellar = WINES.filter(w => w.left > 0);
    return { press: n("press"), pressWant: cellar.filter(w => { const d = drinkWindow(w); return d && d.to != null; }).reduce((s, w) => s + w.left, 0),
      pressShown: !document.getElementById("pressPanel").hidden, worthShown: !document.getElementById("worthPanel").hidden };
  });
  check("'When they need drinking' counts every bottle with a window, once", sums.pressShown && sums.press === sums.pressWant && sums.press > 0, JSON.stringify(sums));
  check("…and 'Value against what you paid' stays away while no wine has a value", !sums.worthShown);
  // a bar filters the list to the bottles whose window closes then, like the other charts
  const bar = await p.$("#press .kbar[data-closes]:not([data-closes=past]):not([data-closes=later])");
  const want = await bar.evaluate(el => { const k = el.dataset.closes; return { k, label: el.querySelector(".rb-name").textContent, n: parseInt(el.querySelector(".rb-n").textContent, 10) }; });
  await bar.click(); await p.waitForTimeout(200);
  const got = await p.evaluate(k => ({ rows: [...document.querySelectorAll("#tbl tr.main")].length, all: WINES.filter(w => w.left > 0 && closesIn(w, k)),
    shown: [...document.querySelectorAll("#tbl tr.main")].map(r => Number(r.dataset.row)), count: document.getElementById("count").textContent,
    active: document.querySelector("#press .kbar.active") && document.querySelector("#press .kbar.active").dataset.closes }), want.k);
  check("a click on 'When they need drinking' filters the list to that year", got.rows === got.all.length && got.all.reduce((s, w) => s + w.left, 0) === want.n &&
    got.all.every(w => got.shown.includes(w.row)) && got.active === want.k && got.count.includes(want.label), JSON.stringify({ want, rows: got.rows, count: got.count, active: got.active }));
  await bar.click(); await p.waitForTimeout(200);
  check("…and a second click takes the filter off", !(await p.$("#press .kbar.active")) && (await p.$$("#tbl tr.main")).length > got.rows);
  await bar.click(); await p.click("#clear"); await p.waitForTimeout(200);
  check("…as does Clear filters", !(await p.$("#press .kbar.active")) && (await p.evaluate(() => state.closes)) === "");
  if (!(await p.evaluate(() => SHOW_PRICES))) await p.click("#priceBtn");
  const band = await p.evaluate(() => ({ shown: !document.getElementById("bandPanel").hidden,
    sum: [...document.querySelectorAll("#bands .rb-n")].reduce((s, e) => s + parseInt(e.textContent, 10), 0),
    want: WINES.filter(w => w.left > 0 && w.price > 0).reduce((s, w) => s + w.left, 0) }));
  check("'Price bands' puts every priced bottle in one band", band.shown && band.sum === band.want, JSON.stringify(band));
  await p.evaluate(async () => { const w = WINES.find(x => x.left > 0 && x.price); await api({ action: "setvalue", row: w.row, value: w.price * 2 }); await loadData(true); });
  await p.waitForTimeout(400);
  const worth = await p.evaluate(() => ({ shown: !document.getElementById("worthPanel").hidden, txt: document.getElementById("worth").textContent }));
  check("…and a value set (twice the price) brings 'Value against what you paid': +100 %", worth.shown && /\+100 %/.test(worth.txt), worth.txt.slice(0, 200));
  await p.click("#priceBtn");

  // ── list / timeline ──
  await p.click("#viewTl"); await p.waitForTimeout(300);
  check("Timeline shows the drink windows instead of the table", await p.isVisible("#dwPanel") && !(await p.isVisible("#pageCellar .tablewrap")));
  await p.reload(); await p.waitForSelector("#app:not([hidden])"); await p.waitForTimeout(1200);
  check("…and is remembered after a reload", await p.isVisible("#dwPanel") && await p.$eval("#viewTl", e => e.classList.contains("on")));
  await p.click("#viewList"); await p.waitForTimeout(300);
  check("List brings the table back", await p.isVisible("#pageCellar .tablewrap") && !(await p.isVisible("#dwPanel")));

  // ── a narrower screen: the overview folds above the list ──
  await p.setViewportSize({ width: 1024, height: 800 }); await p.waitForTimeout(300);
  check("at 1024 px the overview is a closed fold above the list", !(await p.$eval("#overview", e => e.open)) && (await box("#overview")).y < (await box("#pageCellar .tablewrap")).y);
  await p.click("#overview .side-sum"); await p.waitForTimeout(300);
  check("…that opens on a tap, charts drawn", await p.isVisible("#regions") && (await p.$$("#regions *")).length > 3);
  await p.reload(); await p.waitForSelector("#app:not([hidden])"); await p.waitForTimeout(1200);
  check("…and stays open next time", await p.$eval("#overview", e => e.open));

  // ── phone ──
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(400);
  check("no sideways scroll on a phone", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  const card = await p.$eval("#tbl tr.main", r => { const b = sel => r.querySelector(sel).getBoundingClientRect(); return { h: r.getBoundingClientRect().height, nameW: b(".c-prod").width, rowW: r.getBoundingClientRect().width, vintY: b(".c-vint").y, nameY: b(".c-prod").y }; });
  check("phone rows are two-line cards: the wine across the full width, numbers below", card.nameW > card.rowW * 0.9 && card.vintY > card.nameY && card.h < 110, JSON.stringify(card));
  check("the filters scroll away on a phone", await p.$eval("#pageCellar .filters", e => getComputedStyle(e).position) === "static");

  // ── Enjoyed: a bottle you didn't buy (a tasting) counts at its value ──
  await p.evaluate(async () => { await api({ action: "addmany", wines: [{ producer: "Domaine du Comte Liger-Belair", name: "La Romanée", vintage: 2011, size: "Magnum", qty: 1, drunk: 1, drunkDate: "2026-10-24", elsewhere: 1, value: 125000 },
    { producer: "Krug", name: "Clos du Mesnil", vintage: 2002, qty: 1, drunk: 1, drunkDate: "2026-10-23", elsewhere: 1, price: 9000, value: 12000 }], bumps: [] }); await loadData(); });
  await p.click('.tab[data-page="cellar"]'); if (!(await p.evaluate(() => SHOW_PRICES))) await p.click("#priceBtn");
  await p.click('.tab[data-page="enjoyed"]'); await p.fill("#eq", "la romanée"); await p.waitForTimeout(300);
  const cell = await p.$eval("#eRows tr.main td:last-child", td => td.textContent.trim()).catch(() => "");
  check("Enjoyed shows the value of a bottle with no price, marked as a value", /≈\s*125[.,\s]?000/.test(cell), cell);
  await p.fill("#eq", "clos du mesnil"); await p.waitForTimeout(300);
  const krug = await p.$eval("#eRows tr.main td:last-child", td => td.textContent.trim()).catch(() => "");
  check("…and what you paid when there is a price", /^9[.,\s]?000/.test(krug) && !/≈/.test(krug), krug);
  const kpi = await p.$$eval("#eKpis .kpi", ks => ks.map(k => k.textContent).join(" | "));
  check("…and 'Value enjoyed' counts both, saying so", /134[.,\s]?000/.test(kpi) && /value where none was paid/.test(kpi), kpi);
  await p.fill("#eq", "");

  // ── the journal as a grid ──
  await p.setViewportSize({ width: 1650, height: 1000 });
  for (const w of [1650, 1280]) {
    await p.setViewportSize({ width: w, height: 1000 }); await p.click('.tab[data-page="enjoyed"]'); await p.waitForTimeout(300);
    const cols = await p.$$eval("#eTbl thead th", ts => ts.map(t => Math.round(t.getBoundingClientRect().width)));
    check(`Enjoyed at ${w} px: the wine has the room, the small columns stay small (${cols.join(" · ")})`, cols[0] >= 320 && cols[4] <= 60 && cols[0] > cols.slice(1).reduce((a, b) => Math.max(a, b), 0) * 2.3, cols.join(","));
  }
  await p.setViewportSize({ width: 1650, height: 1000 });
  for (let i = 0; i < 4; i++) await p.evaluate(n => api({ action: "jadd", entry: { date: "2026-10-1" + n, producer: "Krug", wine: "Grande Cuvée", rating: 8, note: "fine" } }), i);
  await p.click('.tab[data-page="journal"]'); await p.evaluate(() => { JENTRIES = null; loadJournal(); }); await p.waitForTimeout(800);
  const jy = await p.$$eval("#jList .jentry", es => es.map(e => Math.round(e.getBoundingClientRect().y)));
  check("journal entries sit side by side on a wide screen", jy.length === 4 && new Set(jy).size < 4, JSON.stringify(jy));
  check("no console errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
