// The screenshots for the business page (business.html): a made-up wine bar, "Vinbaren Demo", with made-up wines and
// sales, taken in a browser against the real Apps Script (gas-harness.js). Writes img/business/*.webp, one
// picture a feature (needs Python with Pillow for the WebP).
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

// The pictures: a cut of the app round each feature (its elements, a margin of 14 px), as a phone shows it, at three
// times the pixels, saved as WebP. The business page shows them in a gallery, one feature a card.
const VW = 1120, VH = 700;
const hide = pg => pg.evaluate(() => { ["adminBtn"].forEach(id => { const h = document.getElementById(id); if (h) h.hidden = true; });
  document.querySelectorAll("#toast").forEach(t => t.style.display = "none");
  ["sommBtn", "pFab", "ptabs"].forEach(id => { const e = document.getElementById(id); if (e) e.style.visibility = "hidden"; }); }); // the floating buttons and the bottom bar
// pad: a margin round the picture in the page's own colour (rgb), in pixels of the picture
async function save(buf, name, pad = 0, rgb = "255,255,255") {
  const png = path.join(require("os").tmpdir(), "allwine-" + name + ".png"); fs.writeFileSync(png, buf);
  const py = "import sys;from PIL import Image,ImageOps;im=Image.open(sys.argv[1]).convert('RGB');p=int(sys.argv[3]);c=tuple(int(v) for v in sys.argv[4].split(','))\n" +
    "im=ImageOps.expand(im,border=p,fill=c) if p else im;im.save(sys.argv[2],'WEBP',quality=86,method=6)";
  const r = require("child_process").spawnSync("python3", ["-c", py, png, path.join(OUT, name + ".webp"), String(pad), rgb]);
  if (r.status) throw new Error("webp: " + r.stderr); fs.unlinkSync(png); console.log("wrote", name);
}
async function crop(pg, name, expr, pad = 12) { // pad: css px, added round the cut, not taken from the page
  await hide(pg);
  // the elements' box on the page; scrolled so it's in view, then cut out
  const box = async () => pg.evaluate(x => { const Q = s => document.querySelector(s), QA = s => [...document.querySelectorAll(s)];
    const els = eval(x).filter(Boolean); if (!els.length) return null; const rs = els.map(e => e.getBoundingClientRect());
    const l = Math.min(...rs.map(r => r.left)), t = Math.min(...rs.map(r => r.top)), r = Math.max(...rs.map(r => r.right)), b = Math.max(...rs.map(r => r.bottom));
    return { l, t, r, b }; }, expr);
  let r = await box(); if (!r) throw new Error(name + ": nothing found for " + expr);
  // scroll the page (or the dialog the elements are in) so the box starts near the top
  await pg.evaluate(x => { const Q = s => document.querySelector(s), QA = s => [...document.querySelectorAll(s)]; eval(x).filter(Boolean)[0].scrollIntoView({ block: "center" }); }, expr);
  await pg.waitForTimeout(250); r = await box();
  // the elements exactly (no slivers of their neighbours), the phone's full width less its margins, then the margin added
  const vp = pg.viewportSize(), y = Math.max(0, r.t), x = Math.max(0, Math.min(r.l, 12)), w = Math.min(vp.width - x, Math.max(r.r, vp.width - 12) - x);
  const clip = { x, y, width: w, height: Math.min(vp.height, r.b) - y };
  const rgb = await pg.evaluate(() => (getComputedStyle(document.body).backgroundColor.match(/\d+/g) || [255, 255, 255]).slice(0, 3).join(","));
  if (clip.height < 40 || clip.width < 100) throw new Error(name + ": too small " + JSON.stringify(clip));
  await save(await pg.screenshot({ clip }), name, pad * 3, rgb);
}

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 3 });
  await require("./turnstile-fake")(ctx); await require("./ask-auto")(ctx);
  await ctx.route(require("./api-route"), async route => route.fulfill({ contentType: "application/json", body: JSON.stringify(gas.call(JSON.parse(route.request().postData() || "{}"))) }));
  const p = await ctx.newPage(), errs = []; p.on("pageerror", e => errs.push(e.message));
  await ctx.addInitScript(l => { try { localStorage.setItem("lang", l); localStorage.setItem("vinTips:demo", "0"); localStorage.setItem("vinCopyAsk:demo", String(Date.now())); } catch (e) {} }, LANG); // no first-steps card, no backup reminder over the screens
  await p.goto(BASE); await p.waitForTimeout(500);
  await p.fill("#gateUser", "demo"); await p.fill("#gatePass", "demo-pass-1"); await p.click("#gateSubmit");
  await p.waitForSelector("#recModal.open", { timeout: 20000 }); await p.check("#recOk"); await p.click("#recDone");
  await p.waitForSelector("#app:not([hidden])", { timeout: 30000 }); await p.waitForTimeout(1000);
  await p.click("#acctBtn"); await p.waitForSelector("#acctModal.open"); await p.selectOption("#acctKind", "business"); await p.keyboard.press("Escape"); await p.waitForTimeout(800);
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
  let url = "";
  const go = async (pg, h) => { await pg.evaluate(h => { location.hash = h; }, h); await pg.waitForTimeout(700); await pg.evaluate(() => scrollTo(0, 0)); };
  const closeAll = pg => pg.evaluate(() => { if (window.$ && $("sommPanel") && !$("sommPanel").hidden) sommClose(); document.querySelectorAll(".modal.open").forEach(m => m.classList.remove("open")); });
  // the hero: the inventory on a computer
  await p.setViewportSize({ width: VW, height: VH }); await go(p, "inventory");
  await p.evaluate(() => { const e = document.getElementById("bzInvKs"); scrollTo(0, 0); scrollTo(0, e.getBoundingClientRect().top - 70); }); await p.waitForTimeout(300);
  await hide(p); await save(await p.screenshot(), "inventory");
  // the gallery: each feature cut from the app as a phone shows it (390 px wide, three times the pixels)
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(500);
  await go(p, "inventory");
  await crop(p, "kpis", '[Q("#bzInvKs")]');
  await crop(p, "stock", '[Q("#bzInvBody tr:nth-child(2)")]');
  await p.evaluate(() => document.querySelector('#pageInventory [data-bz="till"]').click()); await p.waitForSelector("#bzTill.open"); await p.fill("#bzTillQ", ""); await p.evaluate(() => document.activeElement.blur()); await p.waitForTimeout(300);
  await crop(p, "quicksell", '[Q("#bzTill h2").closest(".bz-h"), Q("#bzTillQ"), ...QA("#bzTiles .bz-tile").slice(0, 2)]');
  await closeAll(p);
  await p.evaluate(() => document.querySelector('#pageInventory [data-bz="count"]').click()); await p.waitForSelector("#bzCount.open");
  const cnt = await p.$$("#bzCount input[data-cnt]"); if (cnt[0]) await cnt[0].fill("11"); if (cnt[1]) await cnt[1].fill("8"); await p.keyboard.press("Tab"); await p.evaluate(() => document.activeElement.blur()); await p.waitForTimeout(300);
  // on a phone the count's table scrolls sideways and hides the difference: this one at a tablet's width
  await p.setViewportSize({ width: 600, height: 844 }); await p.waitForTimeout(300);
  await crop(p, "count", '[Q("#bzCount thead"), ...QA("#bzCount tbody tr").slice(0, 3)]');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  await closeAll(p);
  await go(p, "accounts"); await p.evaluate(() => $("refreshBtn").click()); await p.waitForTimeout(1800);
  await crop(p, "sales", '[QA("#bizPanel .bz-ks")[0], Q("#bizPanel .bz-wk")]');
  await crop(p, "movers", '[Q("#bizPanel .bz-cols")]');
  const RE = 'Q("#bzReorderCopy").parentElement';
  await crop(p, "reorder", `[${RE}.previousElementSibling.previousElementSibling.previousElementSibling, ${RE}]`);
  const LOC = RE + ".previousElementSibling.previousElementSibling.previousElementSibling.previousElementSibling"; // the table; its heading before it
  await crop(p, "locations", `[${LOC}.previousElementSibling, ${LOC}]`);
  await go(p, "winecard");
  if (!(await p.$("#bzQr svg"))) await p.click('#bizCard [data-bz="online"]'); await p.waitForSelector("#bzQr svg", { timeout: 10000 }); await p.waitForTimeout(300);
  url = await p.inputValue("#bizCard .bz-url");
  // the address as it reads on the real site, not this test server
  await p.evaluate(() => { const i = document.querySelector("#bizCard .bz-url"); i.value = i.value.replace(/^https?:\/\/[^/]+\/(lindholm-vin\/)?/, "https://allwine.dk/"); });
  await crop(p, "winecard", '[Q("#bzQr").closest("div[class]").parentElement]');
  await go(p, "cellar");
  await p.evaluate(() => [...document.querySelectorAll("#tbl tr.main")].find(r => /Léoville Barton/.test(r.textContent)).click()); await p.waitForSelector("tr.detail:not([hidden]) .bz-d", { timeout: 10000 });
  await crop(p, "details", '[Q("tr.detail:not([hidden]) .bz-d")]');
  await p.evaluate(() => { scrollTo(0, 0); $("sommBtn").click(); }); await p.waitForSelector("#sommLog .sm-a");
  await p.fill("#sommQ", LANG === "da" ? "Hvad passer til lam?" : "What goes with lamb?"); await p.press("#sommQ", "Enter");
  await p.waitForFunction(() => !document.querySelector("#sommLog .sm-think") && document.querySelectorAll("#sommLog .sm-a").length >= 2, null, { timeout: 10000 }); await p.waitForTimeout(400);
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  await crop(p, "sommelier", '[[...QA("#sommLog .sm-q, #sommLog .sm-me, #sommLog [class*=sm-u]")].pop() || [...QA("#sommLog .sm-a")].slice(-2)[0], [...QA("#sommLog .sm-a")].pop()]');
  await closeAll(p);
  // a guest's phone, scanning the code
  const g = await ctx.newPage(); await g.setViewportSize({ width: 390, height: 844 }); await g.goto(url); await g.waitForSelector(".card", { timeout: 10000 }); await g.waitForTimeout(400);
  await crop(g, "guest", '[...Q(".card").children].slice(0, 4)'); await g.close();
  await p.goto(BASE + "atlas.html#r=bordeaux"); await p.waitForTimeout(3500);
  await hide(p); await save(await p.screenshot({ clip: { x: 0, y: 0, width: 390, height: 600 } }), "atlas");
  console.log("errors:", errs.length ? errs.join(" | ") : "none");
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
