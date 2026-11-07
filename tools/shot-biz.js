// Screenshots of a restaurant's pages (Inventory, Sales & accounts, Wine card) for a look by eye; not part of the suite.
//   (cd .. && python3 -m http.server 8765) & node tools/shot-biz.js [outdir]
"use strict";
const { chromium } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const OUT = process.argv[2] || ".";
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note", "Anskaffet", "Drukket dato", "Rating"];
const row = o => HEAD.map(h => o[h] ?? "");
const W = [["Armand Rousseau", "Bourgogne", "Clos St-Jacques", "Rød", 2016, 6, 300], ["Domaine Leflaive", "Bourgogne", "Les Pucelles", "Hvid", 2012, 4, 500],
  ["Bollinger", "Champagne", "La Grande Année", "Bobler", 2014, 12, 400], ["G. Conterno", "Piemonte", "Barolo Francia", "Rød", 2017, 3, 650],
  ["Egon Müller", "Mosel", "Scharzhofberger Kabinett", "Hvid", 2021, 8, 280], ["Taylor's", "Douro", "20 Year Old Tawny", "Hedvin", "", 2, 350]];
const gas = H({ Ark1: [HEAD, ...W.map(([pr, reg, n, t, y, q, c]) => row({ Producent: pr, Land: "Frankrig", Område: reg, "Mark/Navn": n, Type: t, Årgang: y, Antal: q, "Pris kr (WS)": c, Kilde: q > 5 ? "Vinimportøren" : "Bichel" }))],
  Journal: [["Dato", "Producent", "Vin", "Årgang", "Land", "Område", "Drue", "Sted", "Rating", "Pris", "Note", "Foto"]] }, { settings: { OWNER_USER: "adam", OWNER_PASSWORD: "owner-pass-1" } });
gas.run("makeOwner()");
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
  await require("./turnstile-fake")(ctx); await require("./ask-auto")(ctx);
  await ctx.route(require("./api-route"), async route => route.fulfill({ contentType: "application/json", body: JSON.stringify(gas.call(JSON.parse(route.request().postData() || "{}"))) }));
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.goto(BASE); await p.waitForTimeout(500);
  await p.fill("#gateUser", "adam"); await p.fill("#gatePass", "owner-pass-1"); await p.click("#gateSubmit");
  await p.waitForSelector("#recModal.open", { timeout: 20000 }); await p.check("#recOk"); await p.click("#recDone");
  await p.waitForSelector("#app:not([hidden])", { timeout: 30000 }); await p.waitForTimeout(1000);
  await p.click("#acctBtn"); await p.waitForSelector("#acctModal.open"); await p.selectOption("#acctKind", "business"); await p.keyboard.press("Escape"); await p.waitForTimeout(800);
  await p.evaluate(async () => {
    const set = { "Armand Rousseau": [900, 150, 4], "Domaine Leflaive": [1100, 0, 2], Bollinger: [850, 120, 6], "G. Conterno": [1400, 0, 4], "Egon Müller": [520, 95, 6], "Taylor's": [750, 70, 1] };
    for (const w of WINES) { const v = set[w.producer]; if (!v) continue;
      await api({ action: "setinfo", row: w.row, fields: { menuPrice: v[0], glassPrice: v[1] || "", par: v[2] } }); }
    for (const pr of ["Bollinger", "Bollinger", "Egon Müller", "Armand Rousseau"]) { const w = WINES.find(x => x.producer === pr); await api({ action: "sell", row: w.row, unit: "bottle", per: 5 }); }
    for (let i = 0; i < 4; i++) { const w = WINES.find(x => x.producer === "Egon Müller"); await api({ action: "sell", row: w.row, unit: "glass", per: 5 }); }
    const r = await api({ action: "data" }); WINES = normalize(r.wines); renderOverview(); renderTable();
  });
  await p.evaluate(() => { location.hash = ""; }); await p.waitForTimeout(600);
  await p.screenshot({ path: OUT + "/biz-inventory.png", fullPage: true });
  await p.click('.tab[data-page="accounts"]'); await p.click("#refreshBtn"); await p.waitForTimeout(1500);
  await p.screenshot({ path: OUT + "/biz-accounts.png", fullPage: true });
  await p.click('.tab[data-page="winecard"]'); await p.waitForTimeout(800);
  await p.screenshot({ path: OUT + "/biz-card.png", fullPage: true });
  await p.setViewportSize({ width: 390, height: 844 }); await p.click('#ptabs button[data-page="inventory"]'); await p.waitForTimeout(600);
  await p.screenshot({ path: OUT + "/biz-phone.png", fullPage: false });
  for (const pg of ["inventory", "cellar", "accounts", "winecard"]) { await p.click(`#ptabs button[data-page="${pg}"]`); await p.waitForTimeout(400);
    console.log(pg, "page width on a phone:", await p.evaluate(() => document.documentElement.scrollWidth)); }
  console.log("errors:", errs.length ? errs.join(" | ") : "none");
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
