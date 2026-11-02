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

  check("a private cellar: no business panel, no wine card, nothing extra loaded", await p.evaluate(() => !window.BIZ && !document.getElementById("bizPanel") && document.documentElement.dataset.kind === "private"
    && ![...document.scripts].some(s => /business/.test(s.src))));
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

  // a minimum, and the reorder list it makes, by supplier
  await p.click('#tbl tr.main:has-text("Armand Rousseau")').catch(() => {}); await p.waitForTimeout(300);
  if (!(await p.isVisible(`${det} .bz-in[data-f="par"]`))) { await p.click('#tbl tr.main:has-text("Armand Rousseau")'); await p.waitForTimeout(300); }
  await p.fill(`${det} .bz-in[data-f="par"]`, "6"); await p.press(`${det} .bz-in[data-f="par"]`, "Tab"); await p.waitForTimeout(900);
  const ro = await p.textContent("#bizPanel");
  check("a minimum of 6 with 1 left: the reorder list, under its supplier, says order 5", /To reorder/.test(ro) && /Vinimportøren/.test(ro) && /order 5/.test(ro) && /1 of a minimum of 6/.test(ro), ro.slice(ro.indexOf("To reorder"), ro.indexOf("To reorder") + 200));
  check("…saved in the script's new Minimum column", (await p.evaluate(async () => (await api({ action: "data" })).wines.find(w => w.producer === "Armand Rousseau").par)) === 6);
  check("…and copied as plain text, by supplier", await p.evaluate(() => BIZ.reorderText(BIZ.reorder())) === "Vinimportøren\n  5 × Armand Rousseau Clos St-Jacques 2016");

  // in Danish: the business words come in their own file, fetched only now that it's a business
  await p.evaluate(() => I18N.setLang("da")); await p.waitForTimeout(800);
  const daP = await p.textContent("#bizPanel");
  check("…in Danish too, from business-i18n-da.js, fetched only for a business", (await p.textContent("#wallTitle")) === "Dit lager" && /Skal bestilles/.test(daP) && /bestil 5/.test(daP)
    && await p.evaluate(() => [...document.scripts].some(s => /business-i18n-da\.js/.test(s.src))), daP.slice(0, 200));
  await p.evaluate(() => I18N.setLang("en")); await p.waitForTimeout(500);

  // the month's sales as a CSV: 1 bottle at 900 and 2 glasses at 150 = 1,200 with VAT, 960 without, 240 VAT
  const mon = await p.evaluate(() => document.getElementById("bzMonth").value);
  const rows = await p.evaluate(m => BIZ.salesRows(m), mon);
  const tot = rows[rows.length - 1];
  check("the month's sales: a line a sale, and the total with and without VAT", rows.length === 5 && tot[5] === 1200 && tot[6] === 960 && tot[7] === 240, JSON.stringify(tot));
  const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 5000 }), p.click("#bzSalesCsv")]);
  const csv = require("fs").readFileSync(await dl.path(), "utf8");
  check("…downloaded as a CSV a Danish Excel opens (semicolons, decimal commas)", dl.suggestedFilename() === `allwine-sales-${mon}.csv` && /^\uFEFFDate;Producer;Wine/.test(csv) && /Total;;;;3;1200;960;240/.test(csv), csv.slice(0, 200));

  // the card online, behind a QR code: it follows the prices by itself, under the same link
  await p.click("#bizCardBtn"); await p.waitForTimeout(300);
  await p.click('#bizCard [data-bz="online"]'); await p.waitForSelector("#bzQr svg", { timeout: 10000 });
  const url = await p.inputValue("#bizCard .bz-url");
  check("Put it online: a link and a QR code", /share\.html#[0-9a-f]{32}\.[A-Za-z0-9_-]{43}$/.test(url) && await p.isVisible("#bzQr svg"), url);
  await p.emulateMedia({ media: "print" });
  check("…the card's printout leaves the online box out", await p.evaluate(() => getComputedStyle(document.getElementById("bzOnline")).display === "none"));
  await p.evaluate(() => document.body.classList.add("bz-qrprint"));
  check("…and Print the QR code prints only the code and the title", await p.evaluate(() => getComputedStyle(document.querySelector(".bz-sheet")).display === "none" && getComputedStyle(document.querySelector("#bzQr svg")).display !== "none"));
  await p.evaluate(() => document.body.classList.remove("bz-qrprint")); await p.emulateMedia({ media: "screen" });
  const g = await ctx.newPage(); g.on("pageerror", e => errs.push("share: " + e.message));
  await g.goto(url); await g.waitForSelector(".card", { timeout: 10000 });
  let gt = await g.textContent(".card");
  check("a guest scans it: the card, its title, the prices, nothing unpriced", /Restaurant Kronborg/.test(gt) && /Armand Rousseau/.test(gt) && /900/.test(gt) && /150/.test(gt) && !/Leflaive/.test(gt), gt.slice(0, 300));
  await p.click('#bizCard [data-bz="close"]');
  await p.fill(`${det} .bz-in[data-f="menuPrice"]`, "950"); await p.press(`${det} .bz-in[data-f="menuPrice"]`, "Tab"); await p.waitForTimeout(4500);
  await g.reload(); await g.waitForSelector(".card", { timeout: 10000 }); gt = await g.textContent(".card");
  check("…a new menu price: the same link shows it a few seconds later", /950/.test(gt) && !/900/.test(gt), gt.slice(0, 300));
  await p.click("#bizCardBtn"); await p.waitForTimeout(300);
  check("…and the card says it's still the same link", (await p.inputValue("#bizCard .bz-url")) === url);
  await p.click('#bizCard [data-bz="offline"]'); await p.waitForSelector('#bizCard [data-bz="online"]', { timeout: 5000 });
  await g.reload(); await g.waitForTimeout(1200);
  check("Take it offline: the code no longer opens the card", /isn't shared any more/.test(await g.textContent("main")));
  // online again, then withdrawn somewhere else (Share's list): the next change doesn't quietly make a new code
  await p.click('#bizCard [data-bz="online"]'); await p.waitForSelector("#bzQr svg", { timeout: 10000 });
  const url2 = await p.inputValue("#bizCard .bz-url");
  check("…put online again: a new code", url2 !== url && /share\.html#/.test(url2));
  await p.evaluate(async () => api({ action: "sharedel", id: BIZ.cardShare().id }));
  await p.click('#bizCard [data-bz="close"]');
  await p.fill(`${det} .bz-in[data-f="menuPrice"]`, "960"); await p.press(`${det} .bz-in[data-f="menuPrice"]`, "Tab"); await p.waitForTimeout(4500);
  check("withdrawn elsewhere: the next change says so, and makes no new link behind the owner's back",
    await p.evaluate(() => !BIZ.cardShare()) && /withdrawn/.test(await p.textContent("#toast")) && (await p.evaluate(async () => (await api({ action: "sharelist" })).shares.length)) === 0);
  await p.fill(`${det} .bz-in[data-f="menuPrice"]`, "950"); await p.press(`${det} .bz-in[data-f="menuPrice"]`, "Tab"); await p.waitForTimeout(900);
  await g.close();

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
    && await p.evaluate(() => WINES.length === 3 && WINES.find(w => w.producer === "Armand Rousseau").menuPrice === 950));
  check("no page errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
