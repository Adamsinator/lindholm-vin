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
  await p.click("#gateToggle"); await p.fill("#gateUser", "dora"); await p.fill("#gatePass", "dora-pass-1"); await p.fill("#gateInvite", "invite"); await p.click("#gateSubmit");
  await p.waitForSelector("#recModal.open", { timeout: 20000 }); await p.check("#recOk"); await p.click("#recDone");
  await p.waitForSelector("#app:not([hidden])", { timeout: 20000 });
  await p.evaluate(async w => { await api({ action: "addmany", wines: w, bumps: [] }); await loadData(); }, wines);
  await p.waitForTimeout(800);
  const box = sel => p.$eval(sel, e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, w: r.width, h: r.height }; });

  // ── wide screen ──
  const list = await box("#pageCellar .tablewrap"), side = await box("#overview");
  check("the wine list starts within the first screen", list.y < 700, JSON.stringify(list));
  check("…with the overview in a column to its right", side.x > list.x + list.w - 1 && Math.abs(side.y - list.y) < 200, JSON.stringify({ list, side }));
  check("…which stays in view while the list scrolls", await p.$eval("#overview", e => getComputedStyle(e).position) === "sticky");
  const rowH = await p.$$eval("#tbl tr.main", rs => rs.slice(0, 20).map(r => r.getBoundingClientRect().height));
  check("one line per wine", Math.max(...rowH) < 50, JSON.stringify(rowH));
  check("the totals sit in one strip", await p.$$eval("#kpis .kpi", ks => new Set(ks.map(k => Math.round(k.getBoundingClientRect().y))).size === 1));
  const height = await p.evaluate(() => document.documentElement.scrollHeight);
  check(`the page is far shorter than before (${height} px for 120 wines, was ~11 000)`, height < 6500, String(height));
  check("'Collection over time' is hidden while no wine has an acquired date", await p.$eval("#histPanel", e => e.hidden));
  check("the map is folded until asked for", !(await p.$eval("#mapFold", e => e.open)));
  await p.click("#mapFold summary"); await p.waitForTimeout(200);
  check("…and opens on a click", await p.$eval("#mapFold", e => e.open) && await p.isVisible("#map"));
  check("the drink-window chips sit above the list", await p.isVisible("#prioPanel") && (await box("#prioPanel")).y < list.y);

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
  const card = await p.$eval("#tbl tr.main", r => { const c = [...r.children].map(td => td.getBoundingClientRect()); return { h: r.getBoundingClientRect().height, nameW: c[0].width, rowW: r.getBoundingClientRect().width, vintY: c[1].y, nameY: c[0].y }; });
  check("phone rows are two-line cards: the wine across the full width, numbers below", card.nameW > card.rowW * 0.9 && card.vintY > card.nameY && card.h < 110, JSON.stringify(card));
  check("the filters scroll away on a phone", await p.$eval("#pageCellar .filters", e => getComputedStyle(e).position) === "static");

  // ── the journal as a grid ──
  await p.setViewportSize({ width: 1650, height: 1000 });
  for (let i = 0; i < 4; i++) await p.evaluate(n => api({ action: "jadd", entry: { date: "2026-10-1" + n, producer: "Krug", wine: "Grande Cuvée", rating: 8, note: "fine" } }), i);
  await p.click('.tab[data-page="journal"]'); await p.evaluate(() => { JENTRIES = null; loadJournal(); }); await p.waitForTimeout(800);
  const jy = await p.$$eval("#jList .jentry", es => es.map(e => Math.round(e.getBoundingClientRect().y)));
  check("journal entries sit side by side on a wide screen", jy.length === 4 && new Set(jy).size < 4, JSON.stringify(jy));
  check("no console errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
