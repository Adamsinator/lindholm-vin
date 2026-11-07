// The screenshots for the business page (business.html): a made-up wine bar, "Vinbaren Demo", with made-up wines and
// sales, taken in a browser against the real Apps Script (gas-harness.js). Writes img/business/*.webp and tour.json
// (needs Python with Pillow for the WebP).
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

// Each screen: the view at twice the pixels (sharp on a retina screen), saved as WebP, and where its callouts are, as
// fractions of the picture (tour.json, read by business-page.js): the tour rings what each slide is about.
const VW = 1120, VH = 700, TOUR = {};
let SFX = ""; // "-m": the phone's screens (390 × 624, as tall as the tour's frame on a phone)
async function take(pg, name, { top, spots = [], phone = false }) {
  name += SFX;
  await pg.evaluate(() => { const h = document.getElementById("adminBtn"); if (h) h.hidden = true; document.querySelectorAll("#toast").forEach(t => t.style.display = "none");
    ["sommBtn", "pFab"].forEach(id => { const e = document.getElementById(id); if (e) e.style.visibility = "hidden"; }); }); // the floating buttons would cover the screen
  if (top) await pg.evaluate(([x, off]) => { const Q = s => document.querySelector(s), QA = s => [...document.querySelectorAll(s)];
    const e = x.startsWith("Q") ? eval(x) : Q(x); if (!e) throw new Error("no " + x); scrollTo(0, 0); scrollTo(0, Math.max(0, e.getBoundingClientRect().top + off)); }, top);
  await pg.waitForTimeout(300);
  const vp = pg.viewportSize();
  const rects = await pg.evaluate(list => list.map(x => { const Q = s => document.querySelector(s), QA = s => [...document.querySelectorAll(s)];
    const e = eval(x); if (!e || (Array.isArray(e) && !e.length)) return null; const els = Array.isArray(e) ? e : [e], rs = els.map(n => n.getBoundingClientRect());
    // not ringed if something else (a bar fixed at the bottom, a dialog) lies over its middle
    const r0 = rs[0], hit = document.elementFromPoint(r0.left + r0.width / 2, r0.top + Math.min(r0.height / 2, 12)); if (!hit || !els.some(n => n.contains(hit) || hit.contains(n))) return null;
    const l = Math.min(...rs.map(r => r.left)), t = Math.min(...rs.map(r => r.top)), rr = Math.max(...rs.map(r => r.right)), bb = Math.max(...rs.map(r => r.bottom)); return [l, t, rr - l, bb - t]; }), spots);
  const f = n => Math.round(n * 1e4) / 1e4;
  const out = rects.map((r, i) => { if (!r || !r[2] || r[1] < 0 || r[1] + r[3] > vp.height + 1 || r[0] < 0 || r[0] + r[2] > vp.width + 1) {
      if (SFX) return null; throw new Error(`${name}: callout ${i + 1} not in view (${spots[i]}): ${JSON.stringify(r)}`); }
    return [f(r[0] / vp.width), f(r[1] / vp.height), f(r[2] / vp.width), f(r[3] / vp.height)]; });
  const png = path.join(require("os").tmpdir(), "allwine-" + name + ".png"); await pg.screenshot({ path: png });
  const r = require("child_process").spawnSync("python3", ["-c", "import sys;from PIL import Image;Image.open(sys.argv[1]).convert('RGB').save(sys.argv[2],'WEBP',quality=84,method=6)", png, path.join(OUT, name + ".webp")]);
  if (r.status) throw new Error("webp: " + r.stderr); fs.unlinkSync(png);
  TOUR[name] = { w: vp.width, h: vp.height, ...(phone ? { phone: true } : {}), spots: out }; console.log("wrote", name, out.length ? out.length + " callouts" : "");
}

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  await require("./turnstile-fake")(ctx); await require("./ask-auto")(ctx);
  await ctx.route(require("./api-route"), async route => route.fulfill({ contentType: "application/json", body: JSON.stringify(gas.call(JSON.parse(route.request().postData() || "{}"))) }));
  const p = await ctx.newPage(), errs = []; p.on("pageerror", e => errs.push(e.message));
  await ctx.addInitScript(l => { try { localStorage.setItem("lang", l); localStorage.setItem("vinTips:demo", "0"); localStorage.setItem("vinCopyAsk:demo", String(Date.now())); } catch (e) {} }, LANG); // no first-steps card, no backup reminder over the screens
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
  let url = "";
  const go = async (pg, h) => { await pg.evaluate(h => { location.hash = h; }, h); await pg.waitForTimeout(700); await pg.evaluate(() => scrollTo(0, 0)); };
  // the screens, once for a computer and once for a phone
  async function screens() {
    await p.evaluate(() => { if (!$("sommPanel").hidden) sommClose(); document.querySelectorAll(".modal.open").forEach(m => m.classList.remove("open")); });
    await go(p, "inventory");
    await take(p, "inventory", { top: ["#bzInvKs", -70], spots: [
      'Q("#bzInvKs").lastElementChild', 'Q("#bzInvBody tr:nth-child(2) td:nth-child(2)")', 'Q("#bzInvBody tr:nth-child(1) td:nth-last-child(2)")', 'Q("#bzInvBody tr:nth-child(1) td:last-child")'] });
    await go(p, ""); await p.evaluate(() => document.querySelector('#pageInventory [data-bz="till"]').click()); await p.waitForSelector("#bzTill.open"); await p.fill("#bzTillQ", ""); await p.waitForTimeout(300);
    await take(p, "quicksell", { spots: ['Q("#bzTillQ")', 'Q("#bzTiles .bz-tile .bz-tb")', 'Q("#bzTiles .bz-tile small")'] });
    await p.keyboard.press("Escape"); await p.waitForTimeout(200);
    // counting the stock: two shelves typed in, the differences shown before anything is saved
    await p.evaluate(() => document.querySelector('#pageInventory [data-bz="count"]').click()); await p.waitForSelector("#bzCount.open");
    const cnt = await p.$$("#bzCount input[data-cnt]"); if (cnt[0]) await cnt[0].fill("11"); if (cnt[1]) await cnt[1].fill("8"); await p.keyboard.press("Tab"); await p.evaluate(() => document.activeElement.blur()); await p.waitForTimeout(300);
    await take(p, "count", { spots: ['QA("#bzCount input[data-cnt]")[0]', 'Q("#bzCount .bz-dif:not(:empty)")', 'Q("#bzCountSum")'] });
    await p.keyboard.press("Escape"); await p.waitForTimeout(200);
    await go(p, "accounts"); await p.evaluate(() => $("refreshBtn").click()); await p.waitForTimeout(1800);
    await take(p, "accounts", { top: ['Q("#bizPanel .bz-h")', -12], spots: ['QA("#bizPanel .bz-ks")[0].children[2]', 'Q("#bizPanel .bz-wk")', '[...Q("#bizPanel .bz-cols").lastElementChild.children]'] });
    // where the stock is, and what to reorder (the buttons' row, its list, its supplier, the heading, the table above it)
    const RE = 'Q("#bzReorderCopy").parentElement';
    await take(p, "reorder", { top: [RE + '.previousElementSibling.previousElementSibling.previousElementSibling.previousElementSibling.previousElementSibling', -12],
      spots: [RE + '.previousElementSibling.previousElementSibling.previousElementSibling.previousElementSibling', RE + '.previousElementSibling', RE] });
    await go(p, "winecard"); await p.waitForTimeout(600);
    if (!(await p.$("#bzQr svg"))) await p.click('#bizCard [data-bz="online"]'); await p.waitForSelector("#bzQr svg", { timeout: 10000 }); await p.waitForTimeout(300);
    url = await p.inputValue("#bizCard .bz-url");
    // the address as it reads on the real site, not this test server
    await p.evaluate(() => { const i = document.querySelector("#bizCard .bz-url"); i.value = i.value.replace(/^https?:\/\/[^/]+\/(lindholm-vin\/)?/, "https://allwine.dk/"); });
    await take(p, "winecard", { top: ['Q("#bizCard")', -10], spots: ['Q("#bzQr")', '[...QA("#bizCard td, #bizCard span, #bizCard div")].find(e => !e.children.length && e.textContent.trim() === "125").parentElement', 'Q("#bizCard [data-bz=print]")'] });
    await go(p, "cellar"); await p.waitForTimeout(800);
    await p.evaluate(() => { if (!document.querySelector("#tbl tr.detail:not([hidden]) .bz-d")) [...document.querySelectorAll("#tbl tr.main")].find(r => /Léoville Barton/.test(r.textContent)).click(); }); await p.waitForSelector('tr.detail:not([hidden]) .bz-d', { timeout: 10000 });
    await p.evaluate(() => document.activeElement && document.activeElement.blur());
    await take(p, "details", { top: SFX ? ['Q("tr.detail:not([hidden]) .bz-d")', -16] : ['Q("#tbl tr.detail:not([hidden])").previousElementSibling', -118], // below the filters, which stay at the top
      spots: ['Q("tr.detail:not([hidden]) .bz-m")', 'Q("tr.detail:not([hidden]) .bz-sell")', 'Q("tr.detail:not([hidden]) .winwrap")'] });
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.evaluate(() => $("sommBtn").click()); await p.waitForSelector("#sommLog .sm-a"); if ((await p.$$("#sommLog .sm-a")).length < 2) { await p.fill("#sommQ", LANG === "da" ? "Hvad passer til lam?" : "What goes with lamb?"); await p.press("#sommQ", "Enter"); }
    await p.waitForFunction(() => !document.querySelector("#sommLog .sm-think") && document.querySelectorAll("#sommLog .sm-a").length >= 2, null, { timeout: 10000 });
    await p.evaluate(() => { const l = $("sommLog"); l.scrollTop = l.scrollHeight; document.activeElement && document.activeElement.blur(); }); await p.waitForTimeout(400);
    await take(p, "sommelier", { spots: ['[...QA("#sommLog .sm-a")].pop()'] });
    await p.keyboard.press("Escape");
  }
  await p.setViewportSize({ width: VW, height: VH }); await p.waitForTimeout(400); await screens();
  SFX = "-m"; await p.setViewportSize({ width: 390, height: 624 }); await p.waitForTimeout(600); await screens(); SFX = "";
  // a guest's phone, scanning the code; and the inventory on a phone
  const g = await ctx.newPage(); await g.setViewportSize({ width: 390, height: 780 }); await g.goto(url); await g.waitForSelector(".card", { timeout: 10000 }); await g.waitForTimeout(400);
  await take(g, "guest", { phone: true }); await g.close();
  await p.setViewportSize({ width: 390, height: 780 }); await p.evaluate(() => { if (!$("sommPanel").hidden) sommClose(); }); await go(p, "inventory");
  await take(p, "phone", { phone: true });
  await p.setViewportSize({ width: VW, height: VH });
  await p.goto(BASE + "atlas.html#r=bordeaux"); await p.waitForTimeout(3500); await p.waitForSelector("#rWines .grp li", { timeout: 10000 }).catch(() => {});
  await take(p, "atlas", {});
  SFX = "-m"; await p.setViewportSize({ width: 390, height: 624 }); await p.reload(); await p.waitForTimeout(3500); await take(p, "atlas", {}); SFX = "";
  fs.writeFileSync(path.join(OUT, "tour.json"), JSON.stringify(TOUR) + "\n"); console.log("wrote tour.json");
  console.log("errors:", errs.length ? errs.join(" | ") : "none");
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
