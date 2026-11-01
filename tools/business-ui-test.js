// A business account (business.js, Code.gs's optional business columns), in a browser against the real Apps Script:
// Account → What kind of account → a restaurant. The cellar becomes the stock; a wine gets a menu price, a price by the
// glass and a supplier, which give its margin (VAT excluded) and mark-up; the overview has the stock at cost and at menu
// price; the wine card lists what's in stock and priced, ready to print. A winemaker names its domaine and sees its own
// wines by vintage; back to private, and it's all gone again.
//   (cd .. && python3 -m http.server 8765) & node tools/business-ui-test.js
"use strict";
const { chromium } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note", "Anskaffet", "Drukket dato", "Rating"];
const row = o => HEAD.map(h => o[h] ?? "");
const gas = H({
  Ark1: [HEAD,
    row({ Producent: "Armand Rousseau", Land: "Frankrig", Område: "Bourgogne", "Mark/Navn": "Clos St-Jacques", Type: "Rød", Årgang: 2016, Antal: 3, "Pris kr (WS)": 300 }),
    row({ Producent: "Domaine Leflaive", Land: "Frankrig", Område: "Bourgogne", "Mark/Navn": "Les Pucelles", Type: "Hvid", Årgang: 2012, Antal: 2, "Pris kr (WS)": 500 }),
    row({ Producent: "Bollinger", Land: "Frankrig", Område: "Champagne", "Mark/Navn": "La Grande Année", Type: "Bobler", Årgang: 2014, Antal: 2, "Pris kr (WS)": 400 })],
  Journal: [["Dato", "Producent", "Vin", "Årgang", "Land", "Område", "Drue", "Sted", "Rating", "Pris", "Note", "Foto"]],
}, { settings: { OWNER_USER: "adam", OWNER_PASSWORD: "owner-pass-1" } });
gas.run("makeOwner()");
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
  await require("./turnstile-fake")(ctx); await require("./ask-auto")(ctx);
  await ctx.route(require("./api-route"), async route => route.fulfill({ contentType: "application/json", body: JSON.stringify(gas.call(JSON.parse(route.request().postData() || "{}"))) }));
  const errs = [], p = await ctx.newPage(); p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  await p.goto(BASE); await p.waitForTimeout(500);
  await p.fill("#gateUser", "adam"); await p.fill("#gatePass", "owner-pass-1"); await p.click("#gateSubmit");
  await p.waitForSelector("#recModal.open", { timeout: 20000 }); await p.check("#recOk"); await p.click("#recDone");
  await p.waitForSelector("#app:not([hidden])", { timeout: 30000 }); await p.waitForTimeout(1200);

  check("a private cellar: no business panel, no wine card, nothing extra loaded", await p.evaluate(() => !window.BIZ && !document.getElementById("bizPanel") && document.documentElement.dataset.kind === "private"));
  await p.click("#acctBtn"); await p.waitForSelector("#acctModal.open");
  await p.selectOption("#acctKind", "restaurant"); await p.waitForFunction(() => !!window.BIZ && !!document.getElementById("bizPanel"), null, { timeout: 5000 }).catch(() => {});
  await p.keyboard.press("Escape"); await p.waitForTimeout(400);
  check("Account → a restaurant: the cellar becomes the stock, with a wine card button and the business panel",
    (await p.textContent("#wallTitle")) === "Your stock" && await p.isVisible("#bizCardBtn") && /Wine card/.test(await p.textContent("#bizCardBtn")) && await p.isVisible("#bizPanel"));
  check("…the price is now the cost price", await p.evaluate(() => /Stock at cost/.test(document.getElementById("bizPanel").textContent)));
  check("…and the panel says no wine has a menu price yet", /3 wines in stock have no menu price yet/.test(await p.textContent("#bizPanel")));

  // open Rousseau and price it
  await p.click('#tbl tr.main:has-text("Armand Rousseau")'); await p.waitForTimeout(300);
  const det = '#tbl tr.detail:not([hidden])';
  check("a wine's details: menu price, by the glass and supplier", await p.isVisible(`${det} .bz-in[data-f="menuPrice"]`) && await p.isVisible(`${det} .bz-in[data-f="glassPrice"]`) && await p.isVisible(`${det} .bz-in[data-f="source"]`));
  await p.fill(`${det} .bz-in[data-f="menuPrice"]`, "900"); await p.press(`${det} .bz-in[data-f="menuPrice"]`, "Tab"); await p.waitForTimeout(900);
  await p.fill(`${det} .bz-in[data-f="glassPrice"]`, "150"); await p.press(`${det} .bz-in[data-f="glassPrice"]`, "Tab"); await p.waitForTimeout(900);
  await p.fill(`${det} .bz-in[data-f="source"]`, "Vinimportøren"); await p.press(`${det} .bz-in[data-f="source"]`, "Tab"); await p.waitForTimeout(900);
  // straight from the script, as a fresh load reads them
  const rw = await p.evaluate(async () => { const r = await api({ action: "data" }); return (r.wines || []).find(w => w.producer === "Armand Rousseau") || {}; });
  check("…saved by the script and read back from its new columns", rw.menuPrice === 900 && rw.glassPrice === 150 && rw.source === "Vinimportøren", JSON.stringify({ m: rw.menuPrice, g: rw.glassPrice, s: rw.source }));
  // 900 incl. 25 % VAT = 720 net; cost 300; margin 420 = 58 %; mark-up 900/300 = × 3
  const m = await p.textContent(`${det} .bz-m`);
  check("…the margin worked out without VAT: 900 → 720 net, less 300 = 420 a bottle, 58 %; mark-up × 3", /58 %/.test(m) && /420/.test(m) && /× 3/.test(m), m);
  check("…the menu price under the cost in the list", /900/.test(await p.textContent('#tbl tr.main:has-text("Armand Rousseau") .c-price')));
  const panel = await p.textContent("#bizPanel");
  check("the panel: stock at cost (3×300 + 2×500 + 2×400 = 2,700) and at menu price (2,700), margin 58 %, one by the glass, the supplier",
    /2\.700 kr/.test(panel) && /Stock at menu price/.test(panel) && /58 %/.test(panel) && /Vinimportøren/.test(panel) && /2 wines in stock have no menu price/.test(panel), panel.slice(0, 400));

  // selling: a bottle, then glasses (5 to a bottle): the first glass opens a bottle, the stock goes down by the bottle
  await p.click(`${det} button[data-sell="bottle"]`); await p.waitForTimeout(900);
  check("Sold a bottle: one bottle less in stock, and the bar says so with Undo", await p.evaluate(() => WINES.find(w => w.producer === "Armand Rousseau").left === 2)
    && /Sold a bottle of Armand Rousseau/.test(await p.textContent("#actMsg")) && /Undo/.test(await p.textContent("#actBtns")));
  await p.click("#actBtns button"); await p.waitForTimeout(900);
  check("…Undo puts it back", await p.evaluate(() => WINES.find(w => w.producer === "Armand Rousseau").left === 3));
  await p.click(`${det} button[data-sell="bottle"]`); await p.waitForTimeout(900);
  for (let i = 0; i < 2; i++) { await p.click(`${det} button[data-sell="glass"]`); await p.waitForTimeout(800); }
  const st = await p.evaluate(() => { const w = WINES.find(w => w.producer === "Armand Rousseau"); return [w.left, w.openGlasses]; });
  check("two glasses: a second bottle opened, 3 glasses left in it (5 to a bottle)", st[0] === 1 && st[1] === 3 && /3 glasses left in the open bottle/.test(await p.textContent(det)), JSON.stringify(st));
  const sp = await p.textContent("#bizPanel");
  check("…the panel: 1 bottle + 2 glasses this week, 900 + 2 × 150 = 1,200 kr. taken, Rousseau the best seller (1.4 bottles)",
    /1\s*\+ 2 glasses/.test(sp) && /1\.200 kr/.test(sp) && /Best sellers/.test(sp) && /1[.,]4 bottles/.test(sp), sp.slice(sp.indexOf("Sales"), sp.indexOf("Sales") + 400));
  await p.click("#bizCardBtn"); await p.waitForTimeout(400);
  const card = await p.textContent("#bizCard .bz-sheet");
  check("the wine card: what's in stock and priced, with the glass price; the unpriced left off", await p.isVisible("#bizCard") && /Armand Rousseau/.test(card) && /900/.test(card) && /150/.test(card) && !/Leflaive/.test(card) && /Red/.test(card), card.slice(0, 300));
  await p.click("#bzTitle"); await p.keyboard.press("Control+A"); await p.keyboard.type("Restaurant Kronborg"); await p.keyboard.press("Enter");
  await p.click('#bizCard [data-bz="close"]'); await p.click("#bizCardBtn"); await p.waitForTimeout(200);
  check("…its title can be changed and is kept", (await p.textContent("#bzTitle")) === "Restaurant Kronborg");
  await p.emulateMedia({ media: "print" });
  check("…and printing shows only the card", await p.evaluate(() => getComputedStyle(document.getElementById("app")).display === "none" && getComputedStyle(document.querySelector(".bz-sheet")).display !== "none"));
  await p.emulateMedia({ media: "screen" }); await p.keyboard.press("Escape"); await p.click('#bizCard [data-bz="close"]').catch(() => {});

  // a winemaker
  await p.click("#acctBtn"); await p.waitForSelector("#acctModal.open"); await p.selectOption("#acctKind", "winemaker"); await p.keyboard.press("Escape"); await p.waitForTimeout(400);
  check("a winemaker: a price list, no glass price", /Price list/.test(await p.textContent("#bizCardBtn")) && !(await p.$('tr.detail:not([hidden]) .bz-in[data-f="glassPrice"]')));
  await p.fill("#bzDom", "Rousseau"); await p.press("#bzDom", "Tab"); await p.waitForTimeout(300);
  check("…names its domaine and sees its own wines by vintage", /Clos St-Jacques/.test(await p.textContent("#bizPanel")) && /2016 · 1/.test(await p.textContent("#bizPanel")));

  await p.reload(); await p.waitForSelector("#app:not([hidden])", { timeout: 30000 }); await p.waitForTimeout(1500);
  check("…kept in the encrypted vault's prefs (with the domaine), not only on this device", await p.evaluate(() => VAULT.active() && VAULT.prefs().kind === "winemaker" && VAULT.prefs().domaine === "Rousseau"));
  check("the kind is kept after a reload", await p.evaluate(() => KIND === "winemaker" && !!window.BIZ) && await p.isVisible("#bizPanel"));
  await p.click("#acctBtn"); await p.waitForSelector("#acctModal.open"); await p.selectOption("#acctKind", "private"); await p.keyboard.press("Escape"); await p.waitForTimeout(400);
  check("back to private: the panel, the button and the extra fields are gone; the wines are the same", await p.isHidden("#bizPanel") && await p.isHidden("#bizCardBtn") && (await p.textContent("#wallTitle")) === "Your cellar"
    && await p.evaluate(() => WINES.length === 3 && WINES.find(w => w.producer === "Armand Rousseau").menuPrice === 900));
  check("no page errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
