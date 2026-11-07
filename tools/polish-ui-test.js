// Findings of a site-wide check, kept fixed (real Code.gs through gas-harness.js): search ignores accents and word order;
// one bottle is "1 bottle"; a price like 149.95 is accepted; Tab stays in an open dialog and focus goes back to what
// opened it; the journal's edit and delete buttons are finger-sized on a touch screen; a stock count that's half typed
// survives the sheet closing, until it's saved.
//   (cd .. && python3 -m http.server 8765) & node tools/polish-ui-test.js
"use strict";
const { chromium } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];
const row = o => HEAD.map(h => o[h] ?? "");
const gas = H({ Ark1: [HEAD,
  row({ Producent: "Château Léoville Barton", Land: "Frankrig", Område: "Bordeaux", Kommune: "Saint-Julien", Type: "Rød", Drue: "Cabernet Sauvignon", Årgang: 2016, Antal: 6, "Pris kr (WS)": 720 }),
  row({ Producent: "Marcel Lapierre", Land: "Frankrig", Område: "Beaujolais", "Mark/Navn": "Morgon", Type: "Rød", Drue: "Gamay", Årgang: 2022, Antal: 1, "Pris kr (WS)": 150 })],
  Journal: [["Dato", "Producent", "Vin", "Årgang", "Land", "Område", "Drue", "Sted", "Rating", "Pris", "Note", "Foto"], ["2026-10-01", "Marcel Lapierre", "Morgon", 2021, "Frankrig", "Beaujolais", "Gamay", "Home", 8, 150, "Lovely", ""]] },
  { settings: { OWNER_USER: "eva", OWNER_PASSWORD: "eva-pass-123" } });
gas.run("makeOwner()");
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };

async function open(b, errs, opts = {}) {
  const ctx = await b.newContext({ viewport: { width: 1366, height: 850 }, ...opts });
  await require("./turnstile-fake")(ctx); await require("./ask-auto")(ctx);
  await ctx.route(require("./api-route"), async route => route.fulfill({ contentType: "application/json", body: JSON.stringify(gas.call(JSON.parse(route.request().postData() || "{}"))) }));
  const p = await ctx.newPage(); p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  await p.goto(BASE); await p.waitForTimeout(400);
  await p.fill("#gateUser", "eva"); await p.fill("#gatePass", "eva-pass-123"); await p.click("#gateSubmit");
  if (await p.waitForSelector("#recModal.open", { timeout: 8000 }).then(() => true).catch(() => false)) { await p.check("#recOk"); await p.click("#recDone"); }
  await p.waitForSelector("#app:not([hidden])", { timeout: 30000 }); await p.waitForTimeout(800);
  if (await p.isVisible("#helpLater").catch(() => false)) await p.click("#helpLater");
  return p;
}
const rows = p => p.$$eval("#tbl tr.main", r => r.length);

(async () => {
  const b = await chromium.launch(), errs = [];
  const p = await open(b, errs);
  // search
  await p.fill("#q", "chateau leoville"); await p.waitForTimeout(250);
  check("search ignores accents: 'chateau leoville' finds Château Léoville Barton", (await rows(p)) === 1 && /Léoville/.test(await p.textContent("#tbl")));
  await p.fill("#q", "MORGON lapierre"); await p.waitForTimeout(250);
  check("…and case and word order: 'MORGON lapierre' finds Marcel Lapierre's Morgon", (await rows(p)) === 1 && /Lapierre/.test(await p.textContent("#tbl")));
  await p.fill("#q", "morgon bordeaux"); await p.waitForTimeout(250);
  check("…while every word must match", (await rows(p)) === 0);
  await p.fill("#q", ""); await p.waitForTimeout(250);
  // plurals
  const labels = await p.$$eval("#regions .rbar, #producers .rbar", bs => bs.map(x => x.getAttribute("aria-label")));
  check("one bottle reads '1 bottle', not '1 bottles'", labels.some(l => /: 1 bottle$/.test(l)) && !labels.some(l => /\b1 bottles/.test(l)), labels.join(" | "));
  // price with øre
  await p.click("#addBtn"); await p.waitForSelector("#addModal.open");
  await p.fill("#aProducer", "Domaine Test"); await p.fill("#aVintage", "2020"); await p.fill("#aPrice", "149.95");
  check("a price like 149.95 is a valid price", await p.$eval("#aPrice", e => e.checkValidity()));
  // Tab stays in the dialog
  await p.focus("#aProducer"); let out = 0;
  for (let i = 0; i < 70; i++) { await p.keyboard.press("Tab"); if (!(await p.evaluate(() => !!document.activeElement.closest("#addModal")))) out++; }
  for (let i = 0; i < 10; i++) { await p.keyboard.press("Shift+Tab"); if (!(await p.evaluate(() => !!document.activeElement.closest("#addModal")))) out++; }
  check("Tab and Shift+Tab stay in the open dialog", out === 0, out + " steps left it");
  await p.keyboard.press("Escape"); await p.waitForTimeout(200);
  check("…and closing it puts focus back on the button that opened it", await p.evaluate(() => document.activeElement.id) === "addBtn", await p.evaluate(() => document.activeElement.id));
  await p.click("#addBtn"); await p.waitForSelector("#addModal.open"); await p.fill("#aProducer", "Domaine Test"); await p.fill("#aVintage", "2020"); await p.fill("#aPrice", "149.95"); await p.click("#addSave");
  await p.waitForFunction(() => WINES.some(w => w.producer === "Domaine Test"), null, { timeout: 15000 }).catch(() => {});
  check("…and the wine is saved at 149.95", await p.evaluate(() => (WINES.find(w => w.producer === "Domaine Test") || {}).price) === 149.95, String(await p.evaluate(() => (WINES.find(w => w.producer === "Domaine Test") || {}).price)));
  // a phone with a finger
  const f = await open(b, errs, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await f.click('#ptabs button[data-page="journal"]'); await f.waitForSelector(".jedit", { timeout: 10000 });
  const sz = await f.$$eval(".jedit, .jdel", bs => bs.map(x => { const r = x.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
  check("on a touch screen the journal's edit and delete buttons are at least 24 × 24 px", sz.length >= 2 && sz.every(([w, h]) => w >= 24 && h >= 24), JSON.stringify(sz));
  check("…and nothing scrolls sideways", await f.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  // a business: the count survives the sheet closing
  await p.click("#acctBtn"); await p.waitForSelector("#acctModal.open"); await p.selectOption("#acctKind", "business"); await p.keyboard.press("Escape"); await p.waitForTimeout(800);
  await p.click('.tab[data-page="inventory"]').catch(() => {}); await p.waitForSelector('[data-bz="count"]', { timeout: 10000 });
  await p.click('[data-bz="count"]'); await p.waitForSelector("#bzCount.open");
  const r0 = await p.$eval("#bzCount [data-cnt]", i => i.dataset.cnt);
  await p.fill(`#bzCount [data-cnt="${r0}"]`, "4"); await p.keyboard.press("Escape"); await p.waitForTimeout(200);
  check("a half-typed stock count closes with Escape…", !(await p.isVisible("#bzCount.open")));
  await p.click('[data-bz="count"]'); await p.waitForSelector("#bzCount.open");
  check("…and is still there when the count is opened again", (await p.inputValue(`#bzCount [data-cnt="${r0}"]`)) === "4" && /kept/.test(await p.textContent("#bzCount")) && (await p.textContent(`#bzCount [data-dif="${r0}"]`)).trim() !== "");
  await p.click('#bzCount [data-bz="cclear"]'); await p.waitForTimeout(150);
  check("…'Start the count again' empties it", (await p.inputValue(`#bzCount [data-cnt="${r0}"]`)) === "" && !/kept/.test(await p.textContent("#bzCount")));
  await p.fill(`#bzCount [data-cnt="${r0}"]`, "4"); await p.click('#bzCount [data-bz="csave"]');
  await p.waitForFunction(r => WINES.find(w => w.row === Number(r)).left === 4, r0, { timeout: 15000 }).catch(() => {});
  await p.click('[data-bz="count"]'); await p.waitForSelector("#bzCount.open");
  check("…and once saved, the next count starts empty", (await p.inputValue(`#bzCount [data-cnt="${r0}"]`)) === "" && await p.evaluate(r => WINES.find(w => w.row === Number(r)).left === 4, r0));
  await p.keyboard.press("Escape");
  // the till's search
  await p.click('[data-bz="till"]'); await p.waitForSelector("#bzTill.open"); await p.fill("#bzTillQ", "morgon marcel"); await p.waitForTimeout(200);
  check("quick sell's search ignores word order too", (await p.$$eval("#bzTiles .bz-tile", t => t.map(x => x.textContent))).some(t => /Lapierre/.test(t)));
  check("no page errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
