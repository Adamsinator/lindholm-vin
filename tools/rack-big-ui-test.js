// The wine rack in a big cellar (app.js, renderRack): past 150 bottles one drawn bottle stands for one WINE, with how many
// bottles of it ("×6"), the rack says so, a tap opens that wine and only that, and the regions are shelves that filter
// the list.
//   (cd .. && python3 -m http.server 8765) & node tools/rack-big-ui-test.js
"use strict";
const { chromium } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note", "Anskaffet", "Drukket dato", "Rating"];
const row = o => HEAD.map(h => o[h] ?? "");
const rows = [HEAD];
// 1,206 bottles: 400 Bordeaux, 300 Bourgogne, 200 Champagne, 150 Mosel, 150 Rhône, and a few
const add = (o, n) => rows.push(row(Object.assign({ Land: "Frankrig", Type: "Rød", Årgang: 2016 }, o, { Antal: n })));
for (let i = 0; i < 40; i++) add({ Producent: "Château " + i, Område: "Bordeaux", "Mark/Navn": "Grand Vin" }, 10);
for (let i = 0; i < 50; i++) add({ Producent: "Domaine " + i, Område: "Bourgogne", "Mark/Navn": "Village", Type: i % 2 ? "Rød" : "Hvid" }, 6);
for (let i = 0; i < 20; i++) add({ Producent: "Maison " + i, Område: "Champagne", "Mark/Navn": "Brut", Type: "Bobler" }, 10);
for (let i = 0; i < 25; i++) add({ Producent: "Weingut " + i, Land: "Tyskland", Område: "Mosel", "Mark/Navn": "Riesling Kabinett", Type: "Hvid" }, 6);
for (let i = 0; i < 25; i++) add({ Producent: "Cave " + i, Område: "Rhône", "Mark/Navn": "Côte-Rôtie" }, 6);
add({ Producent: "Tempier", Område: "Provence", "Mark/Navn": "Bandol Rosé", Type: "Rosé", Årgang: 2015 }, 6);
const gas = H({ Ark1: rows, Journal: [["Dato", "Producent", "Vin", "Årgang", "Land", "Område", "Drue", "Sted", "Rating", "Pris", "Note", "Foto"]] }, { settings: { OWNER_USER: "adam", OWNER_PASSWORD: "owner-pass-1" } });
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
  await p.waitForSelector("#app:not([hidden])", { timeout: 30000 }); await p.waitForTimeout(1500);

  const r = await p.evaluate(() => ({ n: document.getElementById("wallN").textContent, unit: document.getElementById("rackUnit").textContent, unitHid: document.getElementById("rackUnit").hidden,
    drawn: document.querySelectorAll("#rack button.btl").length, more: document.getElementById("rackMore").textContent }));
  check("1,206 bottles: the rack says each drawn bottle is one wine", /1.206/.test(r.n) && !r.unitHid && /each drawn bottle is one wine/.test(r.unit), JSON.stringify(r));
  await p.click("#rackMore"); await p.waitForTimeout(200);
  const all = await p.$$eval("#rack button.btl", bs => bs.length);
  check("…all of it in 161 drawn bottles, one per wine, not 1,206", all === 161, String(all));
  const first = await p.$eval("#rack button.btl", x => [x.getAttribute("aria-label"), x.querySelector(".cnt") && x.querySelector(".cnt").textContent, x.getAttribute("style")]);
  check("…the most pressing wine first (the old rosé), rosé-coloured, marked ×6", /^Tempier · Bandol Rosé 2015 · 6/.test(first[0]) && first[1] === "×6" && /b-rose/.test(first[2]), JSON.stringify(first));
  await p.click("#rack button.btl >> nth=0"); await p.waitForTimeout(300);
  const card = await p.textContent("#rackCard");
  check("…and a tap opens that wine, and no other", /Tempier/.test(card) && /6 btl/.test(card) && !/Château|Cave|Domaine|Maison|Weingut/.test(card), card.slice(0, 200));
  await p.keyboard.press("Escape");
  const sh = await p.$$eval("#rackShelves button", bs => bs.map(x => x.dataset.region + ":" + x.querySelector("b").textContent));
  check("the regions as shelves, biggest first", sh.length >= 5 && /^Bordeaux:400/.test(sh[0]) && /^Bourgogne:300/.test(sh[1]), sh.join());
  await p.click('#rackShelves button[data-region="Mosel"]'); await p.waitForTimeout(400);
  check("…a shelf filters the list to that region", (await p.inputValue("#fRegion")) === "Mosel" && await p.evaluate(() => SHOWN.length === 25 && SHOWN.every(w => w.region === "Mosel")));
  const fr = await p.evaluate(() => ({ n: document.getElementById("wallN").textContent, sub: document.getElementById("wallSub").textContent, drawn: document.querySelectorAll("#rack button.btl").length,
    all: [...document.querySelectorAll("#rack button.btl")].every(b => /Weingut/.test(b.title)) }));
  check("…and the rack follows the filter: only the Mosel's 150 bottles, said to be out of 1,206", fr.n === "150" && /of 1.206 bottles, as filtered/.test(fr.sub) && fr.drawn > 0 && fr.all, JSON.stringify(fr));
  await p.click("#clear"); await p.waitForTimeout(300);
  check("…cleared: the whole cellar again", (await p.textContent("#wallN")) === "1.206" && !/as filtered/.test(await p.textContent("#wallSub")));
  check("nothing wider than the screen, no errors", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth) && !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
