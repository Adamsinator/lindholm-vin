// A wine's style at a glance (style.js, from the sommelier's grape data), in a browser against the real Apps Script
// (gas-harness.js): a wine's details show its body, acidity and tannin as bars, its aromas, how to serve it and the
// wines like it in the cellar; a serving card prints; the "Cellar by taste" panel maps the bottles by body and acidity
// and filters the list by a bubble. The grape data is fetched only when it's needed.
//   (cd .. && python3 -m http.server 8765) & node tools/style-ui-test.js [screenshot-prefix]
"use strict";
const { chromium } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];
const row = o => HEAD.map(h => o[h] ?? "");
const gas = H({ Ark1: [HEAD,
  row({ Producent: "Château Lynch-Bages", Land: "Frankrig", Område: "Bordeaux", Kommune: "Pauillac", Type: "Rød", Drue: "Cabernet Sauvignon, Merlot", Årgang: 2005, Antal: 6, "Pris kr (WS)": 900 }),
  row({ Producent: "Château Léoville Barton", Land: "Frankrig", Område: "Bordeaux", Kommune: "Saint-Julien", Type: "Rød", Drue: "Cabernet Sauvignon", Årgang: 2016, Antal: 3, "Pris kr (WS)": 700 }),
  row({ Producent: "Domaine Leflaive", Land: "Frankrig", Område: "Bourgogne", Kommune: "Puligny-Montrachet", "Mark/Navn": "Les Pucelles", Type: "Hvid", Årgang: 2017, Antal: 2, "Pris kr (WS)": 1500 }),
  row({ Producent: "Dr. Loosen", Land: "Tyskland", Område: "Mosel", "Mark/Navn": "Wehlener Sonnenuhr Kabinett", Type: "Hvid", Drue: "Riesling", Årgang: 2021, Antal: 4, "Pris kr (WS)": 200 }),
  row({ Producent: "Mystery", Land: "", Område: "", Type: "Rød", Årgang: 2019, Antal: 1 })],
  Journal: [["Dato", "Producent", "Vin", "Årgang", "Land", "Område", "Drue", "Sted", "Rating", "Pris", "Note", "Foto"]] }, { settings: { OWNER_USER: "adam", OWNER_PASSWORD: "owner-pass-1" } });
gas.run("makeOwner()");
const det = name => `#tbl tr.main:has-text("${name}") + tr.detail`; // a wine's own details (others stay open)
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
  await require("./turnstile-fake")(ctx); await require("./ask-auto")(ctx);
  await ctx.route(require("./api-route"), async route => route.fulfill({ contentType: "application/json", body: JSON.stringify(gas.call(JSON.parse(route.request().postData() || "{}"))) }));
  const errs = [], loaded = [], p = await ctx.newPage(); p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  p.on("request", r => loaded.push(r.url()));
  await p.goto(BASE); await p.waitForTimeout(500);
  await p.fill("#gateUser", "adam"); await p.fill("#gatePass", "owner-pass-1"); await p.click("#gateSubmit");
  await p.waitForSelector("#recModal.open", { timeout: 20000 }); await p.check("#recOk"); await p.click("#recDone");
  await p.waitForSelector("#app:not([hidden])", { timeout: 30000 }); await p.waitForTimeout(1200);
  check("the grape data isn't fetched with the page", !loaded.some(u => /style\.js|sommelier-data/.test(u)));

  // the panel: drawn when it comes into view
  await p.evaluate(() => document.getElementById("tasteMap").scrollIntoView()); await p.waitForSelector("#tasteMap .tc", { timeout: 10000 }).catch(() => {});
  const cells = await p.$$eval("#tasteMap .tc", gs => gs.map(g => g.dataset.cell + "=" + g.querySelector("text").textContent).sort().join(" "));
  check("Cellar by taste: the bottles by body and acidity (the Bordeaux full and fresh, the Riesling light and crisp)", /3,2=9/.test(cells) && /1,3=4/.test(cells), cells);
  check("…and the bottle with no known grape is said not to be placed", /1 bottle without a known grape isn.t placed/.test(await p.textContent("#tasteMap")));
  await p.click('#tasteMap .tc[data-cell="3,2"]'); await p.waitForTimeout(300);
  const rows = await p.$$eval("#tbl tr.main", rs => rs.map(r => r.textContent));
  check("a bubble filters the list to its wines", rows.length === 2 && rows.every(t => /Lynch-Bages|Léoville/.test(t)), rows.length + "");
  await p.click("#clear"); await p.waitForTimeout(300);
  check("…and Clear shows them all again", (await p.$$("#tbl tr.main")).length === 5 && !(await p.$("#tasteMap .tc.on")));

  // a wine's details
  await p.click('#tbl tr.main:has-text("Lynch-Bages")'); await p.waitForSelector(det("Lynch-Bages") + " .wstyle .ssb", { timeout: 10000 }).catch(() => {});
  const card = await p.textContent(det("Lynch-Bages") + " .wstyle").catch(() => "");
  check("a red's style card: body, acidity and tannin, its aromas", (await p.$$(det("Lynch-Bages") + " .wstyle .ssb")).length === 3 && /blackcurrant|plum/.test(card), card.slice(0, 200));
  check("…how to serve it: 16–18 °C in a Bordeaux glass; a 2005 is old enough to stand up a day and decant off the sediment", /16–18 °C/.test(card) && /Bordeaux glass/.test(card) && /sediment/.test(card), card);
  check("…the wines like it in the cellar: the other Bordeaux, not the Riesling", /Like it in your cellar:.*Léoville Barton/.test(card) && !/Loosen/.test(card), card);
  if (process.argv[2]) { await (await p.$(det("Lynch-Bages") + " .wstyle")).screenshot({ path: process.argv[2] + "-card.png" });
    await (await p.$('[data-panel="taste"]')).screenshot({ path: process.argv[2] + "-taste.png" }); }
  await p.click(det("Lynch-Bages") + " .wstyle [data-sopen]"); await p.waitForTimeout(500);
  check("…and a click opens that wine", (await p.getAttribute('#tbl tr.main:has-text("Léoville")', "aria-expanded")) === "true" && await p.isVisible(det("Léoville")));
  await p.click('#tbl tr.main:has-text("Leflaive")'); await p.waitForSelector(det("Leflaive") + ' .wstyle .ssb', { timeout: 10000 }).catch(() => {});
  const wcard = await p.textContent(det("Leflaive") + " .wstyle").catch(() => "");
  check("a white with no grape written: Chardonnay from its appellation (Puligny-Montrachet), no tannin bar, served as a full white", (await p.$$(det("Leflaive") + " .wstyle .ssb")).length === 2
    && /Chardonnay/.test(wcard) && /10–13 °C/.test(wcard), wcard.slice(0, 260));
  await p.click('#tbl tr.main:has-text("Mystery")'); await p.waitForTimeout(1200);
  check("a wine with nothing to go on shows no card", await p.isVisible(det("Mystery")) && !(await p.$(det("Mystery") + " .wstyle")));
  // the serving card
  await p.click('#tbl tr.main:has-text("Loosen")'); await p.waitForSelector(det("Loosen") + ' [data-scard]', { timeout: 10000 }).catch(() => {});
  await p.evaluate(() => { window.print = () => { window.__printed = document.getElementById("styleCards").textContent; }; });
  await p.click(det("Loosen") + ' [data-scard]'); await p.waitForTimeout(400);
  const printed = await p.evaluate(() => window.__printed || "");
  check("a serving card prints: the wine, 8–10 °C, the glass, its style and what it goes with", /Dr. Loosen/.test(printed) && /8–10 °C/.test(printed) && /white-wine glass/.test(printed) && /Goes with/.test(printed), printed.slice(0, 300));
  await p.emulateMedia({ media: "print" }); await p.evaluate(() => document.body.classList.add("style-print"));
  check("…and only the card is on the printed page", await p.evaluate(() => getComputedStyle(document.getElementById("app")).display === "none" && getComputedStyle(document.getElementById("styleCards")).display === "block"));
  await p.evaluate(() => document.body.classList.remove("style-print")); await p.emulateMedia({ media: "screen" });
  // Danish
  await p.evaluate(() => I18N.setLang("da")); await p.waitForTimeout(400);
  await p.click('#tbl tr.main:has-text("Loosen")'); await p.waitForTimeout(300); await p.click('#tbl tr.main:has-text("Loosen")'); await p.waitForTimeout(800);
  check("in Danish", /Stil i korte træk/.test(await p.textContent(det("Loosen") + " .wstyle").catch(() => "")) && /Kælderen efter smag/.test(await p.textContent('[data-panel="taste"]')));
  check("no page errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
