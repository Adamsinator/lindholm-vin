// A business account (business.js, Code.gs's optional business columns), in a browser against the real Apps Script:
// Account → What kind of account → a restaurant. The cellar becomes the stock; a wine gets a menu price, a price by the
// glass and a supplier, which give its margin (VAT excluded) and mark-up; the overview has the stock at cost and at menu
// price; the wine card lists what's in stock and priced, ready to print. A business has pages of its own: Inventory
// first (count, price and sell from one table), the cellar, Sales & accounts (by period), the wine card; no Enjoyed,
// Wishlist or Journal. A winemaker names its domaine and sees its own wines by vintage; back to private, and it's all
// gone again.
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
  await p.selectOption("#acctKind", "business"); await p.waitForFunction(() => !!window.BIZ && !!document.getElementById("bizPanel"), null, { timeout: 5000 }).catch(() => {});
  await p.keyboard.press("Escape"); await p.waitForTimeout(400);
  const tabs = async () => p.$$eval(".gbar .tabs .tab", ts => ts.filter(t => !t.hidden).map(t => t.dataset.page).join(","));
  check("Account → a restaurant: its own pages, Inventory first; no Enjoyed, Wishlist or Journal", (await tabs()) === "inventory,cellar,accounts,winecard"
    && await p.isVisible("#pageInventory") && await p.isHidden("#pageCellar"), await tabs());
  check("…the same on a phone's bar", await p.$$eval("#ptabs button[data-page]", ts => ts.filter(t => !t.hidden).map(t => t.dataset.page).join(",")) === "inventory,cellar,accounts,winecard");
  await p.evaluate(() => { location.hash = "journal"; }); await p.waitForTimeout(300);
  check("…and the journal's address opens the inventory instead", await p.isVisible("#pageInventory") && await p.isHidden("#pageJournal"));
  await p.evaluate(() => { location.hash = ""; }); await p.waitForTimeout(300);
  const inv = await p.textContent("#pageInventory");
  check("the inventory: every wine in stock as a line, with the stock, the cost and what it's worth (3×300 + 2×500 + 2×400 = 2,700)",
    (await p.$$("#bzInvBody tr")).length === 3 && /Armand Rousseau/.test(inv) && /2\.700 kr/.test(inv) && /Bottles/.test(inv), inv.slice(0, 300));
  await p.fill("#bzInvQ", "pucel"); await p.waitForTimeout(150);
  check("…searched as you type", (await p.$$("#bzInvBody tr")).length === 1 && /Leflaive/.test(await p.textContent("#bzInvBody")));
  await p.fill("#bzInvQ", ""); await p.waitForTimeout(150);
  await p.click('.tab[data-page="cellar"]'); await p.waitForTimeout(300);
  check("the cellar is still there, as the stock, with a wine card button",
    (await p.textContent("#wallTitle")) === "Your stock" && await p.isVisible("#bizCardBtn") && /Wine card/.test(await p.textContent("#bizCardBtn")) && await p.isHidden("#bizPanel"));
  check("…the price is now the cost price", await p.evaluate(() => /Stock at cost/.test(document.getElementById("bizPanel").textContent)));
  check("…and the panel says no wine has a menu price yet", /3 wines in stock have no menu price yet/.test(await p.textContent("#bizPanel")));

  // open Rousseau and price it
  await p.click('#tbl tr.main:has-text("Armand Rousseau")'); await p.waitForTimeout(300);
  const det = '#tbl tr.detail:not([hidden])';
  check("a wine's details: menu price, by the glass and supplier", await p.isVisible(`${det} .bz-in[data-f="menuPrice"]`) && await p.isVisible(`${det} .bz-in[data-f="glassPrice"]`) && await p.isVisible(`${det} .bz-in[data-f="source"]`));
  check("…and no journal there: a business sells, it doesn't keep a diary", !(await p.$(`${det} .jlog`)));
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
  await p.click('.tab[data-page="accounts"]'); await p.waitForTimeout(400);
  check("Sales & accounts is a page of its own", await p.isVisible("#bizPanel") && await p.isHidden("#pageCellar"));
  const acc = await p.textContent("#bizPanel");
  check("…the profit on what was sold: 1,200 kr. is 960 without VAT, less 300 + 2/5 × 300 = 420 cost: 540, margin 56 %",
    /540 kr/.test(acc) && /56 %/.test(acc) && /960 kr\. without VAT/.test(acc), acc.slice(0, 500));
  check("…and the stock by style", /Style/.test(acc) && /Red/.test(acc) && /White/.test(acc) && /Sparkling/.test(acc));
  await p.selectOption("#bzPeriod", "365"); await p.waitForTimeout(200);
  check("…a year's view: twelve months in the chart", (await p.$$("#bizPanel .bz-wk span")).length === 12 && (await p.inputValue("#bzPeriod")) === "365");
  await p.selectOption("#bzPeriod", "7"); await p.waitForTimeout(200);
  check("…a week's: seven days", (await p.$$("#bizPanel .bz-wk span")).length === 7);
  await p.click('.tab[data-page="cellar"]'); await p.waitForTimeout(300);
  await p.click("#bizCardBtn"); await p.waitForTimeout(400);
  const card = await p.textContent("#bizCard .bz-sheet");
  check("the wine card: its own page, what's in stock and priced, with the glass price; the unpriced left off", await p.isVisible("#bizCard") && await p.isHidden("#pageCellar") && /Armand Rousseau/.test(card) && /900/.test(card) && /150/.test(card) && !/Leflaive/.test(card) && /Red/.test(card), card.slice(0, 300));
  await p.click("#bzTitle"); await p.keyboard.press("Control+A"); await p.keyboard.type("Restaurant Kronborg"); await p.keyboard.press("Enter");
  await p.click('.tab[data-page="inventory"]'); await p.waitForTimeout(200); await p.click('.tab[data-page="winecard"]'); await p.waitForTimeout(300);
  check("…its title can be changed and is kept", (await p.textContent("#bzTitle")) === "Restaurant Kronborg");
  await p.emulateMedia({ media: "print" });
  check("…and printing shows only the card", await p.evaluate(() => getComputedStyle(document.querySelector(".gbar")).display === "none" && getComputedStyle(document.querySelector("header.top")).display === "none"
    && getComputedStyle(document.querySelector(".bz-sheet")).display !== "none" && getComputedStyle(document.querySelector(".bz-bar")).display === "none"));
  await p.emulateMedia({ media: "screen" });
  await p.click('.tab[data-page="cellar"]'); await p.waitForTimeout(300);
  await p.emulateMedia({ media: "print" });
  check("…but only while it's the page on screen", await p.evaluate(() => getComputedStyle(document.querySelector(".gbar")).display !== "none" || getComputedStyle(document.getElementById("pageCellar")).display !== "none"));
  await p.emulateMedia({ media: "screen" });

  // the stock itself, counted: the bottles on hand, set straight in the details
  await p.click('#tbl tr.main:has-text("Armand Rousseau")').catch(() => {}); await p.waitForTimeout(300);
  if (!(await p.isVisible(`${det} .bz-in[data-f="left"]`))) { await p.click('#tbl tr.main:has-text("Armand Rousseau")'); await p.waitForTimeout(300); }
  check("the details show what's in stock, before the minimum", (await p.inputValue(`${det} .bz-in[data-f="left"]`)) === "1"
    && await p.evaluate(() => { const d = document.querySelector('#tbl tr.detail:not([hidden])'); const a = d.querySelector('[data-f="left"]'), b = d.querySelector('[data-f="par"]'); return !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING); }));
  await p.fill(`${det} .bz-in[data-f="left"]`, "4"); await p.press(`${det} .bz-in[data-f="left"]`, "Tab"); await p.waitForTimeout(900);
  check("…counting 4 bottles: 4 in stock, the bottle and glasses sold still sold", await p.evaluate(() => { const w = WINES.find(w => w.producer === "Armand Rousseau"); return w.left === 4 && w.drunk === 2; }),
    JSON.stringify(await p.evaluate(() => { const w = WINES.find(w => w.producer === "Armand Rousseau"); return [w.qty, w.drunk, w.left]; })));
  await p.fill(`${det} .bz-in[data-f="left"]`, "1"); await p.press(`${det} .bz-in[data-f="left"]`, "Tab"); await p.waitForTimeout(900);

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
  // the inventory's buttons and headings were drawn before the Danish words came: drawn again once they're here
  await p.click('.tab[data-page="inventory"]'); await p.waitForTimeout(400);
  const invDa = await p.evaluate(() => [document.querySelector('#pageInventory [data-bz="till"]').textContent, document.getElementById("bzInvQ").placeholder]);
  check("…the inventory's buttons and search in Danish as well (drawn again when the words arrive)", invDa[0] === "Hurtigsalg" && /^Søg/.test(invDa[1]), JSON.stringify(invDa));
  await p.evaluate(() => I18N.setLang("en")); await p.waitForTimeout(500);

  // the month's sales as a CSV: 1 bottle at 900 and 2 glasses at 150 = 1,200 with VAT, 960 without, 240 VAT
  const mon = await p.evaluate(() => document.getElementById("bzMonth").value);
  const rows = await p.evaluate(m => BIZ.salesRows(m), mon);
  const tot = rows[rows.length - 1];
  check("the month's sales: a line a sale, and the total with and without VAT", rows.length === 5 && tot[5] === 1200 && tot[6] === 960 && tot[7] === 240, JSON.stringify(tot));
  await p.click('.tab[data-page="accounts"]'); await p.waitForTimeout(300);
  const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 5000 }), p.click("#bzSalesCsv")]);
  const csv = require("fs").readFileSync(await dl.path(), "utf8");
  check("…downloaded as a CSV a Danish Excel opens (semicolons, decimal commas)", dl.suggestedFilename() === `allwine-sales-${mon}.csv` && /^\uFEFFDate;Producer;Wine/.test(csv) && /Total;;;;3;1200;960;240/.test(csv), csv.slice(0, 200));

  // the inventory: count, price and sell from its lines, and its filter for what's under the minimum
  await p.click('.tab[data-page="inventory"]'); await p.waitForTimeout(300);
  const ir = '#bzInvBody tr:has-text("Domaine Leflaive")';
  await p.fill(`${ir} [data-f="menuPrice"]`, "1000"); await p.press(`${ir} [data-f="menuPrice"]`, "Tab"); await p.waitForTimeout(900);
  check("a selling price set in the inventory: saved, the margin beside it (1,000 → 800 net, less 500: 38 %, × 2)",
    (await p.evaluate(async () => (await api({ action: "data" })).wines.find(w => w.producer === "Domaine Leflaive").menuPrice)) === 1000 && /38 %/.test(await p.textContent(`${ir} .bz-mg`)), await p.textContent(`${ir} .bz-mg`));
  check("…and the cursor stays in the line, at the next field", await p.evaluate(() => document.activeElement && document.activeElement.dataset.f === "glassPrice" && document.activeElement.closest("tr").textContent.includes("Leflaive")));
  await p.fill(`${ir} [data-f="cost"]`, "450"); await p.press(`${ir} [data-f="cost"]`, "Tab"); await p.waitForTimeout(900);
  check("…the cost price too", (await p.evaluate(async () => (await api({ action: "data" })).wines.find(w => w.producer === "Domaine Leflaive").price)) === 450);
  await p.fill(`${ir} [data-f="left"]`, "5"); await p.press(`${ir} [data-f="left"]`, "Tab"); await p.waitForTimeout(900);
  check("…and the stock counted", await p.evaluate(() => WINES.find(w => w.producer === "Domaine Leflaive").left === 5));
  await p.click(`${ir} button[data-sell="bottle"]`); await p.waitForTimeout(900);
  check("…sold from its line", await p.evaluate(() => WINES.find(w => w.producer === "Domaine Leflaive").left === 4) && /Sold a bottle of Domaine Leflaive/.test(await p.textContent("#actMsg")));
  await p.click("#actBtns button"); await p.waitForTimeout(900);
  await p.selectOption("#bzInvShow", "low"); await p.waitForTimeout(150);
  check("…'below the minimum' shows only Rousseau (1 of 6)", (await p.$$("#bzInvBody tr")).length === 1 && /Armand Rousseau/.test(await p.textContent("#bzInvBody")));
  await p.selectOption("#bzInvShow", "stock"); await p.waitForTimeout(150);
  await p.click('#bzInvBody tr:has-text("Armand Rousseau") [data-open]'); await p.waitForTimeout(500);
  check("…and a wine's name opens it in the cellar", await p.isVisible("#pageCellar") && await p.isVisible('#tbl tr.detail:not([hidden]) .bz-in[data-f="menuPrice"]'));

  // where the stock is: by location on the accounts page, and a filter for it in the inventory
  await p.evaluate(async () => { for (const [pr, loc] of [["Armand Rousseau", "Cellar, shelf 3"], ["Domaine Leflaive", "Cellar, shelf 1"], ["Bollinger", "Bar fridge"]]) {
    const w = WINES.find(x => x.producer === pr); await api({ action: "setinfo", row: w.row, fields: { location: loc } }); }
    WINES = normalize((await api({ action: "data" })).wines); renderOverview(); renderTable(); });
  await p.click('.tab[data-page="accounts"]'); await p.waitForTimeout(400);
  const lt = await p.textContent("#bizPanel");
  check("Stock by location: the cellar (its shelves together) and the bar fridge, with bottles", /Stock by location/.test(lt) && /Cellar\s*2\s*\d+/.test(lt) && /Bar fridge\s*1\s*2/.test(lt), lt.slice(lt.indexOf("Stock by location"), lt.indexOf("Stock by location") + 160));
  await p.click('.tab[data-page="inventory"]'); await p.waitForTimeout(300);
  await p.selectOption("#bzInvLoc", "Bar fridge"); await p.waitForTimeout(150);
  check("…and the inventory filters by it", (await p.$$("#bzInvBody tr")).length === 1 && /Bollinger/.test(await p.textContent("#bzInvBody")));
  await p.selectOption("#bzInvLoc", ""); await p.waitForTimeout(150);
  // Quick sell: a till with big buttons and a search
  await p.click('[data-bz="till"]'); await p.waitForSelector("#bzTill.open", { timeout: 3000 });
  await p.fill("#bzTillQ", "rouss"); await p.waitForTimeout(150);
  check("Quick sell: a search for a few letters finds the wine, with Bottle and Glass at their prices", (await p.$$("#bzTiles .bz-tile")).length === 1
    && /Bottle · 9[05]0/.test(await p.textContent("#bzTiles")) && /Glass · 150/.test(await p.textContent("#bzTiles")), await p.innerHTML("#bzTiles"));
  const gl0 = await p.evaluate(() => { const w = WINES.find(w => w.producer === "Armand Rousseau"); return [w.left, w.openGlasses]; });
  await p.click('#bzTiles button[data-sell="glass"]'); await p.waitForTimeout(900);
  const gl1 = await p.evaluate(() => { const w = WINES.find(w => w.producer === "Armand Rousseau"); return [w.left, w.openGlasses]; });
  check("…a tap sells a glass, and the tile follows the stock", (gl1[1] === gl0[1] - 1 || (gl1[0] === gl0[0] - 1)) && /Sold a glass of Armand Rousseau/.test(await p.textContent("#actMsg")), JSON.stringify([gl0, gl1]));
  await p.click("#actBtns button"); await p.waitForTimeout(900);
  await p.keyboard.press("Escape"); await p.waitForTimeout(200);
  check("…and Escape closes it", !(await p.isVisible("#bzTill")));
  // orders to suppliers: an email ready to send, and a printout per supplier
  await p.click('.tab[data-page="accounts"]'); await p.waitForTimeout(300);
  const mail = await p.getAttribute('#bizPanel a[href^="mailto:"]', "href");
  check("an order to the supplier as an email, ready to send: 5 × the wine", /^mailto:\?subject=/.test(mail) && decodeURIComponent(mail).includes("5 × Armand Rousseau Clos St-Jacques 2016"), decodeURIComponent(mail || ""));
  await p.evaluate(() => { window.print = () => { window.__po = document.getElementById("bzOrders").textContent; }; });
  await p.click("#bzOrderPrint"); await p.waitForTimeout(200);
  check("…and printed, a page per supplier", /Order: Vinimportøren/.test(await p.evaluate(() => window.__po || "")) && /Armand Rousseau Clos St-Jacques 2016\s*5/.test(await p.evaluate(() => window.__po || "")));
  // the order has come: the bottles ordered are added to the stock
  await p.click('#bizPanel [data-recv="Vinimportøren"]'); await p.waitForTimeout(1500);
  check("an order that has come: Rousseau back to its minimum of 6", await p.evaluate(() => WINES.find(w => w.producer === "Armand Rousseau").left === 6) && !/To reorder/.test(await p.textContent("#bizPanel")));
  await p.evaluate(async () => { const w = WINES.find(x => x.producer === "Armand Rousseau"); WINES = normalize((await api({ action: "setstock", row: w.row, left: 1 })).wines); renderOverview(); });
  // goods in: a delivery, wine by wine, with the new cost price
  await p.click('.tab[data-page="inventory"]'); await p.waitForTimeout(300);
  await p.click('[data-bz="goods"]'); await p.waitForSelector("#bzGoods.open", { timeout: 3000 });
  await p.fill("#bzGoodsQ", "bolli"); await p.waitForTimeout(150);
  check("Goods in: a search finds the wine", (await p.$$("#bzGoodsB tr")).length === 1 && /Bollinger/.test(await p.textContent("#bzGoodsB")));
  const bo = await p.evaluate(() => WINES.find(w => w.producer === "Bollinger").row);
  await p.fill(`[data-gin="${bo}"]`, "6"); await p.fill(`[data-gcost="${bo}"]`, "420"); await p.click(`[data-gadd="${bo}"]`); await p.waitForTimeout(1500);
  const bw = await p.evaluate(async () => normalize((await api({ action: "data" })).wines).find(w => w.producer === "Bollinger"));
  check("…6 bottles came at 420: 8 in stock, the cost 420", bw.left === 8 && bw.price === 420, JSON.stringify([bw.left, bw.price]));
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);
  // the count: what's on the shelf, the differences, then saved
  await p.click('[data-bz="count"]'); await p.waitForSelector("#bzCount.open", { timeout: 3000 });
  await p.fill(`[data-cnt="${bo}"]`, "7"); await p.waitForTimeout(100);
  const lf = await p.evaluate(() => WINES.find(w => w.producer === "Domaine Leflaive").row);
  await p.fill(`[data-cnt="${lf}"]`, String(await p.evaluate(() => WINES.find(w => w.producer === "Domaine Leflaive").left)));
  check("the count shows each difference and the sum: Bollinger 1 short (−420 kr. at cost), Leflaive right", /^-1$|^−1$/.test((await p.textContent(`[data-dif="${bo}"]`)).trim().replace("−", "-")) && (await p.textContent(`[data-dif="${lf}"]`)).trim() === "✓"
    && /2 counted · 1 differ · -1 bottles · -420 kr\./.test(await p.textContent("#bzCountSum")), await p.textContent("#bzCountSum"));
  const [cdl] = await Promise.all([p.waitForEvent("download", { timeout: 5000 }), p.click('[data-bz="ccsv"]')]);
  const ccsv = require("fs").readFileSync(await cdl.path(), "utf8");
  check("…downloaded as a CSV", /Bollinger;.*;8;7;-1;420/.test(ccsv), ccsv.slice(0, 300));
  await p.click('[data-bz="csave"]'); await p.waitForTimeout(1500);
  check("…and saved: Bollinger 7 in stock", (await p.evaluate(async () => normalize((await api({ action: "data" })).wines).find(w => w.producer === "Bollinger").left)) === 7 && !(await p.isVisible("#bzCount")));
  await p.click('.tab[data-page="cellar"]'); await p.waitForTimeout(300);

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
  check("a guest scans it: the card, its title, the prices, nothing unpriced", /Restaurant Kronborg/.test(gt) && /Armand Rousseau/.test(gt) && /900/.test(gt) && /150/.test(gt) && !/Bollinger/.test(gt), gt.slice(0, 300));
  await p.click('.tab[data-page="cellar"]'); await p.waitForTimeout(300);
  if (!(await p.isVisible(`${det} .bz-in[data-f="menuPrice"]`))) { await p.click('#tbl tr.main:has-text("Armand Rousseau")'); await p.waitForTimeout(300); }
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
  await p.click('.tab[data-page="cellar"]'); await p.waitForTimeout(300);
  if (!(await p.isVisible(`${det} .bz-in[data-f="menuPrice"]`))) { await p.click('#tbl tr.main:has-text("Armand Rousseau")'); await p.waitForTimeout(300); }
  await p.fill(`${det} .bz-in[data-f="menuPrice"]`, "960"); await p.press(`${det} .bz-in[data-f="menuPrice"]`, "Tab"); await p.waitForTimeout(4500);
  check("withdrawn elsewhere: the next change says so, and makes no new link behind the owner's back",
    await p.evaluate(() => !BIZ.cardShare()) && /withdrawn/.test(await p.textContent("#toast")) && (await p.evaluate(async () => (await api({ action: "sharelist" })).shares.length)) === 0);
  await p.fill(`${det} .bz-in[data-f="menuPrice"]`, "950"); await p.press(`${det} .bz-in[data-f="menuPrice"]`, "Tab"); await p.waitForTimeout(900);
  await g.close();

  // a phone: the business pages fit, the inventory's lines folded into cards
  await p.setViewportSize({ width: 390, height: 844 });
  const wide = [];
  for (const pg of ["inventory", "accounts", "winecard"]) { await p.click(`#ptabs button[data-page="${pg}"]`); await p.waitForTimeout(300);
    const w = await p.evaluate(() => document.documentElement.scrollWidth); if (w > 391) wide.push(pg + " " + w); }
  check("on a phone every business page fits, no sideways scroll", !wide.length, wide.join(", "));
  await p.setViewportSize({ width: 1400, height: 900 }); await p.click('.tab[data-page="cellar"]'); await p.waitForTimeout(300);

  // a business that makes wine: names its domaine and sees its own wines by vintage
  await p.click('.tab[data-page="accounts"]'); await p.waitForTimeout(300);
  await p.fill("#bzDom", "Rousseau"); await p.press("#bzDom", "Tab"); await p.waitForTimeout(300);
  check("a business that makes wine names its domaine and sees its own wines by vintage", /Clos St-Jacques/.test(await p.textContent("#bizPanel")) && /2016 · 1/.test(await p.textContent("#bizPanel")));
  // an account of before, kept as a winemaker in the vault: opens as the one business kind
  await p.evaluate(() => VAULT.setPrefs(Object.assign({}, VAULT.prefs(), { kind: "winemaker" })));
  await p.evaluate(() => { location.hash = ""; }); await p.reload(); await p.waitForSelector("#app:not([hidden])", { timeout: 30000 }); await p.waitForTimeout(1500);
  check("the domaine is kept in the encrypted vault's prefs, not only on this device", await p.evaluate(() => VAULT.active() && VAULT.prefs().domaine === "Rousseau"));
  check("a restaurant, merchant or winemaker of before opens as a business, on the inventory", await p.evaluate(() => KIND === "business" && !!window.BIZ) && await p.isVisible("#pageInventory"));
  await p.click("#acctBtn"); await p.waitForSelector("#acctModal.open"); await p.selectOption("#acctKind", "private"); await p.keyboard.press("Escape"); await p.waitForTimeout(400);
  check("back to private: the business pages, the button and the extra fields are gone; Enjoyed, Wishlist and Journal are back; the wines are the same",
    (await tabs()) === "cellar,enjoyed,wishlist,journal" && await p.isVisible("#pageCellar") && await p.isHidden("#bizPanel") && await p.isHidden("#bizCardBtn") && (await p.textContent("#wallTitle")) === "Your cellar"
    && await p.evaluate(() => WINES.length === 3 && WINES.find(w => w.producer === "Armand Rousseau").menuPrice === 950));
  check("no page errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
