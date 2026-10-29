// Browser test of the cellar and the Burgundy atlas linked both ways, against the real Code.gs (gas-harness.js):
//   • a Burgundy bottle has "On the map", straight to its vineyard; a Champagne goes to the Champagne atlas
//   • the atlas shows the bottle under "In your cellar", and "Add a bottle from here" opens the cellar's add form
//     filled in with the vineyard (and the producer being mapped), once
//   • the overview's Burgundy map links to the atlas
//   (cd .. && python3 -m http.server 8765) & node tools/atlas-link-ui-test.js
"use strict";
const { chromium } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];
const row = o => HEAD.map(h => o[h] ?? "");
const gas = H({ Ark1: [HEAD,
  row({ Producent: "Armand Rousseau", Land: "Frankrig", Område: "Bourgogne", Kommune: "Gevrey-Chambertin", "Mark/Navn": "Clos St-Jacques", Type: "Rød", Årgang: 2016, Antal: 2 }),
  row({ Producent: "Domaine Leflaive", Land: "Frankrig", Område: "Bourgogne", Kommune: "Puligny-Montrachet", "Mark/Navn": "Village", Type: "Hvid", Årgang: 2020, Antal: 1 }),
  row({ Producent: "Krug", Land: "Frankrig", Område: "Champagne", "Mark/Navn": "Grande Cuvée", Type: "Bobler", Årgang: "NV", Antal: 1 }),
] });

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await require("./turnstile-fake")(ctx);
  await ctx.route(require("./api-route"), async route => {
    const p = JSON.parse(route.request().postData() || "{}");
    let r;
    if (p.action === "login") r = { ok: true, user: p.user, token: "tok", v: 26 };
    else if (p.action === "prelogin") r = { ok: false, error: "bad-code", v: 27 }; // an older Apps Script: the plain flow
    else { delete p.user; delete p.token; p.code = "test-code"; r = gas.call(p); }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(r) });
  });
  const p = await ctx.newPage(), errs = [];
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  await p.goto(BASE); await p.waitForTimeout(400);
  await p.fill("#gateUser", "adam"); await p.fill("#gatePass", "pw"); await p.click("#gateSubmit");
  await p.waitForSelector("#app:not([hidden])", { timeout: 20000 }); await p.waitForTimeout(1000);

  const open = async prod => { const tr = p.locator(`#tbl tr.main:has-text("${prod}")`).first(); if ((await tr.getAttribute("aria-expanded")) !== "true") { await tr.click(); await p.waitForTimeout(250); } return p.locator(`#tbl tr.main:has-text("${prod}") + tr.detail`); };
  const rou = await open("Armand Rousseau");
  const href = await rou.locator("a.atlaslink").getAttribute("href").catch(() => null);
  check("a Burgundy bottle has 'On the map', to its vineyard", href === "burgundy.html#c=closstjacques", href);
  const lef = await open("Domaine Leflaive");
  check("…one with only a village goes to the village", /^burgundy\.html#v=/.test(await lef.locator("a.atlaslink").getAttribute("href").catch(() => "")));
  const krug = await open("Krug");
  const kh = await krug.locator("a.atlaslink").getAttribute("href").catch(() => null);
  check("…a Champagne goes to the Champagne atlas", /^atlas\.html#r=champagne&w=/.test(kh || ""), kh);

  await p.evaluate(() => { MAP_VIEW = "Bourgogne"; renderMap(); });
  check("the overview's Burgundy map links to the atlas", await p.isVisible("#mapAtlas") && (await p.getAttribute("#mapAtlas", "href")) === "burgundy.html");
  await p.evaluate(() => { MAP_VIEW = "europe"; renderMap(); });
  check("…the Europe view doesn't", await p.isHidden("#mapAtlas"));

  // into the atlas
  await (await open("Armand Rousseau")).locator("a.atlaslink").click();
  await p.waitForURL(/burgundy\.html#c=closstjacques/); await p.waitForSelector("#side h2", { timeout: 20000 }); await p.waitForTimeout(1500);
  check("the atlas opens on the vineyard", /Clos Saint-Jacques|Clos St-Jacques/.test(await p.textContent("#side h2")), await p.textContent("#side h2"));
  check("…with the bottles under 'In your cellar'", /In your cellar[\s\S]*Armand Rousseau/.test(await p.textContent("#side")));
  await p.click("#addHere");
  await p.waitForURL(/index\.html/); await p.waitForSelector("#addModal.open", { timeout: 20000 });
  const f = await p.evaluate(() => ({ name: aName.value, commune: aCommune.value, region: aRegion.value, country: aCountry.value, cls: aClass.value, type: aType.value, producer: aProducer.value, hash: location.hash }));
  check("'Add a bottle from here' opens the add form filled in with the vineyard",
    f.name === "Clos Saint-Jacques" && f.commune === "Gevrey-Chambertin" && f.region === "Bourgogne" && f.country === "Frankrig" && f.cls === "1. cru" && f.type === "Rød", JSON.stringify(f));
  check("…and the address is tidied", f.hash === "");
  await p.keyboard.press("Escape"); await p.reload(); await p.waitForSelector("#app:not([hidden])", { timeout: 20000 }); await p.waitForTimeout(800);
  check("…only once", await p.isHidden("#addModal.open"));

  // with a producer being mapped, the producer comes along
  const prodKey = "rousseau"; // burgundy-data.js: producers
  await p.goto(BASE + "burgundy.html#c=chambertin&p=" + prodKey); await p.waitForSelector("#addHere", { timeout: 20000 }); await p.waitForTimeout(800);
  check("…in the atlas the button names the producer being mapped", prodKey && /Rousseau/.test(await p.textContent("#addHere")), prodKey + " " + await p.textContent("#addHere").catch(() => ""));
  await p.click("#addHere"); await p.waitForSelector("#addModal.open", { timeout: 20000 });
  check("…and fills in the producer too", /Rousseau/.test(await p.inputValue("#aProducer")) && (await p.inputValue("#aName")) === "Chambertin" && (await p.inputValue("#aClass")) === "Grand cru",
    await p.inputValue("#aProducer") + " / " + await p.inputValue("#aName") + " / " + await p.inputValue("#aClass"));
  check("an old hand-over (over ten minutes) is ignored", await p.evaluate(() => { localStorage.setItem("vinAddPrefill", JSON.stringify({ name: "X", at: Date.now() - 700000 })); document.getElementById("addModal").classList.remove("open"); takePrefill(); return !document.getElementById("addModal").classList.contains("open") && !localStorage.getItem("vinAddPrefill"); }));

  check("no console errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
