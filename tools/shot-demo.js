// The screenshots for the business page (business.html): a made-up wine bar, "Vinbaren Demo", with made-up wines and
// sales, taken in a browser against the real Apps Script (gas-harness.js). Writes img/business/*.jpg.
//   (cd .. && python3 -m http.server 8765) & node tools/shot-demo.js [da]   (da: the Danish screens, into img/business/da)
"use strict";
const path = require("path"), fs = require("fs");
const { chromium } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const LANG = process.argv[2] || "en";
const OUT = path.join(__dirname, "..", "img", "business", ...(LANG === "en" ? [] : [LANG])); fs.mkdirSync(OUT, { recursive: true });
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note", "Anskaffet"];
const row = o => HEAD.map(h => o[h] ?? "");
// producer, country, region, commune, name, type, grape, vintage, bottles, cost, supplier, [menu, glass, minimum], location
const W = [
  ["Bollinger", "Frankrig", "Champagne", "Aÿ", "Special Cuvée", "Bobler", "Pinot Noir, Chardonnay", "NV", 18, 320, "Vinimportøren", [795, 125, 12], "Bar fridge"],
  ["Pierre Gimonnet", "Frankrig", "Champagne", "Cuis", "1er Cru Blanc de Blancs", "Bobler", "Chardonnay", "NV", 12, 260, "Vinimportøren", [650, 110, 6], "Bar fridge"],
  ["Domaine Leflaive", "Frankrig", "Bourgogne", "Puligny-Montrachet", "Les Pucelles", "Hvid", "Chardonnay", 2019, 6, 1450, "Bichel", [3900, 0, 3], "Cellar, shelf 1"],
  ["William Fèvre", "Frankrig", "Bourgogne", "Chablis", "Montée de Tonnerre", "Hvid", "Chardonnay", 2021, 12, 310, "Bichel", [795, 120, 6], "Cellar, shelf 1"],
  ["Dr. Loosen", "Tyskland", "Mosel", "Bernkastel", "Wehlener Sonnenuhr Kabinett", "Hvid", "Riesling", 2022, 18, 165, "Vinimportøren", [495, 85, 12], "Bar fridge"],
  ["Domaine Tempier", "Frankrig", "Provence", "Bandol", "Rosé", "Rosé", "Mourvèdre", 2023, 12, 240, "Bichel", [595, 95, 6], "Cellar, shelf 2"],
  ["Armand Rousseau", "Frankrig", "Bourgogne", "Gevrey-Chambertin", "Clos St-Jacques", "Rød", "Pinot Noir", 2017, 4, 2100, "Bichel", [5200, 0, 2], "Cellar, shelf 3"],
  ["Marcel Lapierre", "Frankrig", "Beaujolais", "Villié-Morgon", "Morgon", "Rød", "Gamay", 2022, 24, 150, "Vinimportøren", [450, 80, 12], "Cellar, shelf 2"],
  ["Château Léoville Barton", "Frankrig", "Bordeaux", "Saint-Julien", "", "Rød", "Cabernet Sauvignon, Merlot", 2016, 6, 720, "Bichel", [1795, 0, 3], "Cellar, shelf 3"],
  ["Giacomo Conterno", "Italien", "Piemonte", "Monforte d'Alba", "Barolo Francia", "Rød", "Nebbiolo", 2017, 3, 980, "Vinimportøren", [2450, 0, 4], "Cellar, shelf 3"],
  ["La Rioja Alta", "Spanien", "Rioja", "Haro", "Viña Ardanza Reserva", "Rød", "Tempranillo", 2016, 12, 230, "Vinimportøren", [650, 105, 6], "Cellar, shelf 2"],
  ["Taylor's", "Portugal", "Douro", "", "20 Year Old Tawny", "Hedvin", "Touriga Nacional", "", 4, 380, "Bichel", [950, 75, 2], "Bar"],
];
const ago = d => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
const gas = H({ Ark1: [HEAD, ...W.map(([pr, c, reg, com, n, t, g, y, q, cost, sup]) => row({ Producent: pr, Land: c, Område: reg, Kommune: com, "Mark/Navn": n, Type: t, Drue: g, Årgang: y, Antal: q, "Pris kr (WS)": cost, Kilde: sup, Anskaffet: ago(120) }))],
  Journal: [["Dato", "Producent", "Vin", "Årgang", "Land", "Område", "Drue", "Sted", "Rating", "Pris", "Note", "Foto"]] }, { settings: { OWNER_USER: "demo", OWNER_PASSWORD: "demo-pass-1" } });
gas.run("makeOwner()");

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await require("./turnstile-fake")(ctx); await require("./ask-auto")(ctx);
  await ctx.route(require("./api-route"), async route => route.fulfill({ contentType: "application/json", body: JSON.stringify(gas.call(JSON.parse(route.request().postData() || "{}"))) }));
  const p = await ctx.newPage(), errs = []; p.on("pageerror", e => errs.push(e.message));
  const shot = async (name, el) => { await p.evaluate(() => { const h = document.getElementById("adminBtn"); if (h) h.hidden = true; document.querySelectorAll("#toast").forEach(t => t.style.display = "none"); });
    await (el ? (await p.$(el)).screenshot({ path: path.join(OUT, name + ".jpg"), type: "jpeg", quality: 78 }) : p.screenshot({ path: path.join(OUT, name + ".jpg"), type: "jpeg", quality: 78 })); console.log("wrote", name); };
  await ctx.addInitScript(l => { try { localStorage.setItem("lang", l); } catch (e) {} }, LANG);
  await p.goto(BASE); await p.waitForTimeout(500);
  await p.fill("#gateUser", "demo"); await p.fill("#gatePass", "demo-pass-1"); await p.click("#gateSubmit");
  await p.waitForSelector("#recModal.open", { timeout: 20000 }); await p.check("#recOk"); await p.click("#recDone");
  await p.waitForSelector("#app:not([hidden])", { timeout: 30000 }); await p.waitForTimeout(1000);
  await p.click("#acctBtn"); await p.waitForSelector("#acctModal.open"); await p.selectOption("#acctKind", "restaurant"); await p.keyboard.press("Escape"); await p.waitForTimeout(800);
  // prices, glass prices, minimums and locations; then a month of sales
  await p.evaluate(async (W) => {
    for (const [pr, , , , , , , , , , , [menu, glass, par], loc] of W) { const w = WINES.find(x => x.producer === pr);
      await api({ action: "setinfo", row: w.row, fields: { menuPrice: menu, glassPrice: glass || "", par, location: loc } }); }
    WINES = normalize((await api({ action: "data" })).wines);
    const sells = [["Bollinger", "glass", 14], ["Bollinger", "bottle", 5], ["Dr. Loosen", "glass", 18], ["Dr. Loosen", "bottle", 4], ["Marcel Lapierre", "glass", 16], ["Marcel Lapierre", "bottle", 7],
      ["William Fèvre", "bottle", 4], ["William Fèvre", "glass", 8], ["La Rioja Alta", "bottle", 4], ["Domaine Tempier", "bottle", 3], ["Château Léoville Barton", "bottle", 2], ["Taylor's", "glass", 6], ["Pierre Gimonnet", "bottle", 3]];
    // spread over the last four weeks: the page's clock is set back for each sale (the vault's engine dates it by it)
    const Real = Date; let k = 0;
    for (const [pr, unit, n] of sells) for (let i = 0; i < n; i++) { const w = WINES.find(x => x.producer === pr), at = Real.now() - ((k++ * 7919) % 27 + (k % 3 === 0 ? 0 : 1)) * 864e5;
      window.Date = class extends Real { constructor(...a) { super(...(a.length ? a : [at])); } static now() { return at; } };
      try { await api({ action: "sell", row: w.row, unit, per: 5 }); } finally { window.Date = Real; } }
    WINES = normalize((await api({ action: "data" })).wines); renderOverview(); renderTable();
  }, W);
  await p.evaluate(() => { try { localStorage.setItem("vinCardTitle:demo", "Vinbaren Demo"); } catch (e) {} location.hash = ""; }); await p.waitForTimeout(600);
  await shot("inventory");
  await p.click('[data-bz="till"]'); await p.waitForSelector("#bzTill.open"); await p.fill("#bzTillQ", ""); await p.waitForTimeout(300);
  await shot("quicksell"); await p.keyboard.press("Escape");
  await p.click('.tab[data-page="accounts"]'); await p.click("#refreshBtn"); await p.waitForTimeout(1800);
  await shot("accounts");
  await p.click('.tab[data-page="winecard"]'); await p.waitForTimeout(600);
  await p.click('#bizCard [data-bz="online"]'); await p.waitForSelector("#bzQr svg", { timeout: 10000 }); await p.waitForTimeout(300);
  await shot("winecard");
  const url = await p.inputValue("#bizCard .bz-url");
  await p.click('.tab[data-page="cellar"]'); await p.waitForTimeout(800);
  await shot("cellar");
  await p.click('#tbl tr.main:has-text("Léoville Barton")'); await p.waitForSelector('tr.detail:not([hidden]) .wstyle .ssb', { timeout: 10000 }).catch(() => {});
  await p.evaluate(() => document.querySelector('tr.detail:not([hidden])').scrollIntoView({ block: "center" })); await p.waitForTimeout(300);
  await shot("details");
  await p.click("#sommBtn"); await p.waitForSelector("#sommLog .sm-a"); await p.fill("#sommQ", LANG === "da" ? "Hvad passer til lam?" : "What goes with lamb?"); await p.press("#sommQ", "Enter");
  await p.waitForFunction(() => !document.querySelector("#sommLog .sm-think") && document.querySelectorAll("#sommLog .sm-a").length >= 2, null, { timeout: 10000 }); await p.waitForTimeout(400);
  await shot("sommelier"); await p.keyboard.press("Escape");
  // a guest's phone, scanning the code; and the inventory on a phone
  const g = await ctx.newPage(); await g.setViewportSize({ width: 390, height: 780 }); await g.goto(url); await g.waitForSelector(".card", { timeout: 10000 }); await g.waitForTimeout(400);
  await g.screenshot({ path: path.join(OUT, "guest.jpg"), type: "jpeg", quality: 74 }); console.log("wrote guest"); await g.close();
  await p.setViewportSize({ width: 390, height: 780 }); await p.click('#ptabs button[data-page="inventory"]'); await p.waitForTimeout(600);
  await shot("phone");
  await p.setViewportSize({ width: 1280, height: 800 });
  await p.goto(BASE + "atlas.html#r=bordeaux"); await p.waitForTimeout(3500); await p.waitForSelector("#rWines .grp li", { timeout: 10000 }).catch(() => {});
  await shot("atlas");
  console.log("errors:", errs.length ? errs.join(" | ") : "none");
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
