// Browser test of the add-a-wine form's lists and the cellar's average, against the real Code.gs (gas-harness.js):
//   • the classification list follows the country: AOC / Premier cru / Grand cru for France, the Prädikat for
//     Germany, DOCG for Italy; "Other…" takes free text; a value a wine already has (Special club) stays
//   • a Spätlese's estimated drink window comes from its Prädikat
//   • quick picks fill Country and Location with one tap
//   • the average bottle counts only bottles with a price
//   • the privacy page is linked from the cellar when logged in
//   (cd .. && python3 -m http.server 8765) & node tools/addform-ui-test.js
"use strict";
const { chromium } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];

(async () => {
  const b = await chromium.launch();
  const gas = H({ Ark1: [HEAD] }, { settings: { SIGNUP_CODE: "invite" } });
  const ctx = await b.newContext({ viewport: { width: 1300, height: 900 } });
  await require("./turnstile-fake")(ctx);
  await ctx.route(require("./api-route"), async route => { const q = JSON.parse(route.request().postData() || "{}");
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(gas.call(q)) }); });
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  await p.goto(BASE); await p.waitForTimeout(400);
  await p.click("#gateToggle"); await p.fill("#gateUser", "greta"); await p.fill("#gatePass", "greta-pass-1"); await p.fill("#gateInvite", "invite"); await p.click("#gateSubmit");
  await p.waitForSelector("#recModal.open", { timeout: 20000 }); await p.check("#recOk"); await p.click("#recDone");
  await p.waitForSelector("#app:not([hidden])", { timeout: 20000 });
  await p.evaluate(async () => { await api({ action: "addmany", bumps: [], wines: [
    { producer: "Domaine A", name: "Bourgogne", country: "Frankrig", region: "Bourgogne", type: "Rød", vintage: 2020, qty: 1, price: 150, location: "Kælder, reol 1" },
    { producer: "Domaine B", name: "Bourgogne", country: "Frankrig", region: "Bourgogne", type: "Rød", vintage: 2020, qty: 1, location: "Kælder, reol 1" },
    { producer: "Krug", name: "Clos du Mesnil", country: "Frankrig", region: "Champagne", type: "Mousserende", vintage: 2008, qty: 1, classification: "Special club", price: 0 } ] });
    await loadData(); SHOW_PRICES = true; renderOverview(); });
  await p.waitForTimeout(300);

  // the average bottle: one at 150 and one without a price is 150, not 75
  const kpi = await p.$$eval("#kpis .kpi", ks => ks.map(k => k.textContent.replace(/\s+/g, " ").trim()).find(t => /Avg\. bottle/.test(t)) || "");
  check("the average bottle counts only bottles with a price (150, not 75)", /Avg\. bottle\s*150 kr\./.test(kpi) && /over 1 btl\. with a price/.test(kpi), kpi);

  // the form: France by default
  await p.click("#addBtn"); await p.waitForTimeout(200);
  const opts = () => p.$$eval("#aClass option", os => os.map(o => o.textContent));
  check("France: AOC, Premier cru, Grand cru — no Special club", JSON.stringify(await opts()) === JSON.stringify(["—", "AOC", "Premier cru", "Grand cru", "Other…"]), (await opts()).join(", "));
  check("quick picks for the country, the usual ones first", (await p.$$eval('.qpick[data-for="aCountry"] button', bs => bs.map(x => x.textContent))).slice(0, 4).join() === "Frankrig,Italien,Spanien,Tyskland");
  check("…and your own places for the location", (await p.$$eval('.qpick[data-for="aLocation"] button', bs => bs.map(x => x.textContent))).join() === "Kælder, reol 1");
  await p.click('.qpick[data-for="aCountry"] button:has-text("Italien")'); await p.waitForTimeout(100);
  check("a quick pick fills the country, and Italy's list follows", (await p.inputValue("#aCountry")) === "Italien" && (await opts()).includes("DOCG"), (await opts()).join(", "));
  await p.click('.qpick[data-for="aCountry"] button:has-text("Tyskland")'); await p.waitForTimeout(100);
  const de = await opts();
  check("…Kabinett, Spätlese, Auslese, TBA, Eiswein and GG are there", ["Kabinett", "Spätlese", "Auslese", "Trockenbeerenauslese", "Eiswein", "Grosses Gewächs"].every(x => de.includes(x)), de.join(", "));
  await p.fill("#aProducer", "Joh. Jos. Prüm"); await p.fill("#aName", "Wehlener Sonnenuhr"); await p.fill("#aVintage", "2015");
  await p.fill("#aRegion", "Mosel"); await p.fill("#aGrape", "Riesling"); await p.selectOption("#aClass", "Spätlese");
  await p.click('.qpick[data-for="aLocation"] button'); await p.waitForTimeout(100);
  check("a quick pick fills the location", (await p.inputValue("#aLocation")) === "Kælder, reol 1");
  await p.click('#addForm button[type="submit"]'); await p.waitForTimeout(1200);
  const prum = await p.evaluate(() => { const w = WINES.find(x => /Prüm/.test(x.producer)); return w && { cls: w.classification, win: drinkWindow(w), loc: w.location }; });
  check("saved as a Spätlese, in its place", prum && prum.cls === "Spätlese" && prum.loc === "Kælder, reol 1", JSON.stringify(prum));
  check("…and its window comes from the Prädikat (a 2015 Spätlese: 2018–2040)", prum && prum.win.from === 2018 && prum.win.to === 2040, JSON.stringify(prum && prum.win));

  // Other…: anything as text
  await p.click("#addBtn"); await p.waitForTimeout(200);
  await p.fill("#aProducer", "Château Lynch-Bages"); await p.fill("#aVintage", "2010"); await p.fill("#aRegion", "Bordeaux"); await p.press("#aRegion", "Tab");
  check("Bordeaux adds its crus to France's list", (await opts()).includes("Cru classé") && (await opts()).includes("Cru bourgeois"), (await opts()).join(", "));
  await p.selectOption("#aClass", "__other");
  check("'Other…' opens a text field under the list", await p.isVisible("#aClass ~ .clsother"));
  await p.fill("#aClass ~ .clsother", "5ème cru classé"); await p.click('#addForm button[type="submit"]'); await p.waitForTimeout(1200);
  check("…and the text is what's saved", (await p.evaluate(() => (WINES.find(x => /Lynch/.test(x.producer)) || {}).classification)) === "5ème cru classé");

  // an old value stays: the Krug's Special club in its edit form
  await p.evaluate(() => openInfo(WINES.find(x => x.producer === "Krug")));
  await p.waitForTimeout(300);
  const ic = await p.$eval("#iClass", s => s.value).catch(() => "(no edit form)");
  check("a value a wine already has stays (Special club)", ic === "Special club", ic);
  await p.keyboard.press("Escape");

  // the privacy page from inside the cellar
  check("the privacy page is linked from the cellar when logged in", await p.isVisible('.appfoot a[href="privacy.html"]'));
  check("no console errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
