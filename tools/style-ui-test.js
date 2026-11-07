// The "Cellar by taste" panel (style.js, from the sommelier's grape data), in a browser against the real Apps Script
// (gas-harness.js): it maps the bottles by body and acidity and filters the list by a bubble; the grape data is fetched
// only when it's needed. A wine's details no longer have a style card or a serving card to print.
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

  // a wine's details: no style card any more (a grape's profile says little about a producer's wine), no serving card
  await p.click('#tbl tr.main:has-text("Lynch-Bages")'); await p.waitForTimeout(1000);
  check("a wine's details have no style card and no serving card to print", await p.isVisible(det("Lynch-Bages")) && !(await p.$(det("Lynch-Bages") + " .wstyle")) && !(await p.$("[data-scard]")));
  if (process.argv[2]) await (await p.$('[data-panel="taste"]')).screenshot({ path: process.argv[2] + "-taste.png" });
  // Danish
  await p.evaluate(() => I18N.setLang("da")); await p.waitForTimeout(400);
  check("in Danish", /Kælderen efter smag/.test(await p.textContent('[data-panel="taste"]')));
  check("no page errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
