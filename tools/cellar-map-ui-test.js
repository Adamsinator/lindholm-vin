// The cellar's map of where the wines come from, in a browser against the real Apps Script (gas-harness.js): wines from
// countries beyond the first seven show too. Croatia, Hungary and Greece get a dot on the Europe map (Greece and the
// Balkans have outlines now), their regions a dot on the country's map; the USA, Australia and a wine with no country
// go in a row along the bottom, "Beyond the map", and a click there filters the list.
//   (cd .. && python3 -m http.server 8765) & node tools/cellar-map-ui-test.js [screenshot.png]
"use strict";
const { chromium } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note", "Anskaffet", "Drukket dato", "Rating"];
const row = o => HEAD.map(h => o[h] ?? "");
const W = [["Armand Rousseau", "Frankrig", "Bourgogne", "Rød", 3], ["Kozlović", "Kroatien", "Istria", "Hvid", 4], ["Saints Hills", "Croatia", "Dalmatia", "Rød", 2],
  ["Royal Tokaji", "Ungarn", "Tokaj", "Hvid", 2], ["Sigalas", "Grækenland", "Santorini", "Hvid", 3], ["Ridge", "USA", "Californien", "Rød", 6],
  ["Penfolds", "Australien", "Barossa", "Rød", 2], ["Mystery Bottle", "", "", "Rød", 1]];
const gas = H({ Ark1: [HEAD, ...W.map(([pr, c, reg, t, q]) => row({ Producent: pr, Land: c, Område: reg, Type: t, Årgang: 2019, Antal: q, "Pris kr (WS)": 200 }))],
  Journal: [["Dato", "Producent", "Vin", "Årgang", "Land", "Område", "Drue", "Sted", "Rating", "Pris", "Note", "Foto"]] }, { settings: { OWNER_USER: "adam", OWNER_PASSWORD: "owner-pass-1" } });
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

  const dots = () => p.$$eval("#map .land.has[data-country]", ds => [...new Set(ds.map(d => d.dataset.country))].sort().join(","));
  check("the Europe map: Croatia (Danish and English spellings together), Hungary and Greece coloured, beside France", (await dots()) === "Croatia,France,Greece,Hungary", await dots());
  check("…the more bottles, the deeper the colour (Croatia's 6 deeper than Hungary's 2)", await p.evaluate(() => { const o = k => +document.querySelector(`#map .land.has[data-country="${k}"]`).style.fillOpacity; return o("Croatia") > o("Hungary") && o("Hungary") > 0; }));
  const txt = await p.textContent("#map");
  check("…Croatia's dot counts both its wines: 6 bottles", /Kroatien|Croatia/.test(txt) && await p.evaluate(() => [...document.querySelectorAll("#map .dlabel")].some(t => /Croatia|Kroatien/.test(t.textContent) && /6/.test(t.nextElementSibling.textContent))));
  check("…Greece and the Balkans have outlines", await p.evaluate(() => ["Greece", "Romania", "Bulgaria", "Serbia", "Albania"].every(k => document.querySelector(`#map .land[data-country="${k}"]`))));
  check("…the rest of the world in a row along the bottom: the USA, Australia, and the wine with no country",
    /Beyond the map/.test(txt) && await p.evaluate(() => [...document.querySelectorAll("#map .far")].map(g => g.dataset.far).join("|")) === "USA|Australien|", await p.evaluate(() => [...document.querySelectorAll("#map .far")].map(g => g.dataset.far).join("|")));
  check("…with their bottles: USA · 6, Australia · 2 (its name in the interface language), No country · 1", /USA · 6/.test(txt) && /Austral(ia|ien) · 2/.test(txt) && /No country · 1/.test(txt), txt.slice(-120));
  await p.click('#map .far[data-far="USA"] circle'); await p.waitForTimeout(300);
  check("a click on the USA filters the list to its wine", await p.evaluate(() => state.country === "USA") && (await p.$$("#tbl tr.main")).length === 1 && /Ridge/.test(await p.textContent("#tbl")));
  await p.click('#map .far[data-far="USA"] circle'); await p.waitForTimeout(300);
  check("…and again shows them all", await p.evaluate(() => state.country === "") && (await p.$$("#tbl tr.main")).length === 8);
  await p.evaluate(() => document.querySelector('#map .land.has[data-country="Croatia"]').dispatchEvent(new MouseEvent("click", { bubbles: true }))); await p.waitForTimeout(400);
  const regs = await p.$$eval("#map .dot[data-region]", ds => ds.map(d => d.dataset.region).sort().join(","));
  check("Croatia's own map: Istria and Dalmatia placed", regs === "Dalmatia,Istria" && /Croatia — regions|Kroatien/.test(await p.textContent("#mapTitle")), regs);
  await p.click("#mapBack"); await p.waitForTimeout(300);
  await p.evaluate(() => document.querySelector('#map .land.has[data-country="Greece"]').dispatchEvent(new MouseEvent("click", { bubbles: true }))); await p.waitForTimeout(400);
  check("…Greece's: Santorini", (await p.$$eval("#map .dot[data-region]", ds => ds.map(d => d.dataset.region).join(","))) === "Santorini");
  await p.click("#mapBack"); await p.waitForTimeout(300);
  // colour by: bottles (as before), value (what they cost), or ready to drink now
  await p.waitForSelector("#mapFold .mapctl [data-by]", { timeout: 8000 });
  const fr = () => p.evaluate(() => { const t = [...document.querySelectorAll("#map .dlabel")].find(x => /France|Frankrig/.test(x.textContent)); return t ? t.nextElementSibling.textContent : ""; });
  check("the map can be coloured by bottles, value or what's ready now; bottles first: France 3 btl.", (await fr()) === "3 btl." && (await p.$$("#mapFold .mapctl [data-by]")).length === 3, await fr());
  await p.click('#mapFold [data-by="value"]'); await p.waitForTimeout(300);
  check("…by value: France's three bottles at 200 kr. are 600 kr.", (await fr()) === "600 kr." && await p.evaluate(() => localStorage.getItem("mapBy") === "value"), await fr());
  await p.click('#mapFold [data-by="ready"]'); await p.waitForTimeout(300);
  const rd = await fr(), want = await p.evaluate(() => WINES.filter(w => /Frank/.test(w.country) && w.left > 0 && (readiness(w) || {}).k === "now").reduce((t, w) => t + w.left, 0));
  check("…by what's ready to drink now (as the Drink now filter counts it)", rd === `${want} ready now`, rd + " / " + want);
  await p.click('#mapFold [data-by="bottles"]'); await p.waitForTimeout(300);
  // the larger map: a sheet of its own, the drawing in it, back when it closes
  const w0 = await p.$eval("#map", m => m.getBoundingClientRect().width);
  await p.click("#mapFold .mapctl .big"); await p.waitForSelector("#mapSheet.open");
  const big = await p.evaluate(() => ({ inside: !!document.querySelector("#mapSheet #map"), w: document.getElementById("map").getBoundingClientRect().width }));
  check("⤢ opens the map larger, in a sheet of its own", big.inside && big.w > w0 * 1.4 && big.w > 800, JSON.stringify({ w0, ...big }));
  check("…without a second ⤢ inside it", await p.$eval("#mapSheet .mapctl .big", b => getComputedStyle(b).display === "none"));
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  check("…Esc puts it back in its place", !(await p.$("#mapSheet.open")) && !!(await p.$("#mapFold #map")) && !!(await p.$("#mapFold .mapctl")));
  // a region with an atlas of its own offers it: a Mosel Riesling, Germany, then the Mosel dot
  await p.evaluate(async () => { await api({ action: "add", wine: { producer: "Dr. Loosen", name: "Wehlener Sonnenuhr", country: "Tyskland", region: "Mosel", type: "Hvid", vintage: 2019, qty: 2, price: 250 } }); await loadData(true); });
  await p.waitForTimeout(600);
  await p.evaluate(() => document.querySelector('#map .land.has[data-country="Germany"]').dispatchEvent(new MouseEvent("click", { bubbles: true }))); await p.waitForTimeout(400);
  check("…no atlas link before a region is chosen", !(await p.$("#mapbar .maplink")));
  await p.evaluate(() => document.querySelector('#map .dot[data-region="Mosel"]').dispatchEvent(new MouseEvent("click", { bubbles: true }))); await p.waitForTimeout(500);
  const ml = await p.evaluate(() => { const a = document.querySelector("#mapbar .maplink"); return a ? [a.getAttribute("href"), a.textContent] : null; });
  check("a region with an atlas of its own offers it: Open Mosel in the atlas ↗", ml && ml[0] === "atlas.html#r=mosel" && ml[1] === "Open Mosel in the atlas ↗", JSON.stringify(ml));
  await p.evaluate(() => { MAP_VIEW = "europe"; state.region = ""; renderMap(); }); await p.waitForTimeout(300);
  if (process.argv[2]) await (await p.$("#map")).screenshot({ path: process.argv[2] });
  await p.evaluate(() => I18N.setLang("da")); await p.waitForTimeout(500);
  check("in Danish: Uden for kortet, Intet land", /Uden for kortet/.test(await p.textContent("#map")) && /Intet land · 1/.test(await p.textContent("#map")));
  check("…and the map's controls in Danish", (await p.textContent("#mapFold .mapctl")).includes("Farve efter") && (await p.textContent("#mapFold .mapctl")).includes("Større kort"));
  await p.evaluate(() => I18N.setLang("en"));
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(400);
  check("on a phone the map fits", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  check("no page errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
