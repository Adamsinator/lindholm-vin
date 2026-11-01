// The wine rack in a big cellar (app.js, renderRack): past 150 bottles one drawn bottle stands for a case of 6, past a
// thousand for 12, the rack says so, a tap on one tells what's in it, and the regions are shelves that filter the list.
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
  check("1,206 bottles: the rack says each drawn bottle is 12", /1.206/.test(r.n) && !r.unitHid && /= 12 bottles/.test(r.unit), JSON.stringify(r));
  await p.click("#rackMore"); await p.waitForTimeout(200);
  const all = await p.$$eval("#rack button.btl", bs => bs.length);
  check("…all of it in 101 drawn bottles (1,206 ÷ 12, rounded up), not 1,206", all === 101, String(all));
  const first = await p.$eval("#rack button.btl", x => x.getAttribute("aria-label"));
  check("…each says what it stands for: 12 bottles, the most pressing wine first (the old rosé)", /^12 bottles: Tempier/.test(first), first);
  await p.click("#rack button.btl >> nth=0"); await p.waitForTimeout(300);
  const card = await p.textContent("#rackCard");
  check("…and a tap says what's in that case", /stands for 12/.test(card) && /Tempier/.test(card) && /other wine|Château|Cave|Domaine/.test(card), card.slice(0, 200));
  await p.keyboard.press("Escape");
  const sh = await p.$$eval("#rackShelves button", bs => bs.map(x => x.dataset.region + ":" + x.querySelector("b").textContent));
  check("the regions as shelves, biggest first", sh.length >= 5 && /^Bordeaux:400/.test(sh[0]) && /^Bourgogne:300/.test(sh[1]), sh.join());
  await p.click('#rackShelves button[data-region="Mosel"]'); await p.waitForTimeout(400);
  check("…a shelf filters the list to that region", (await p.inputValue("#fRegion")) === "Mosel" && await p.evaluate(() => SHOWN.length === 25 && SHOWN.every(w => w.region === "Mosel")));
  await p.click("#clear");
  check("nothing wider than the screen, no errors", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth) && !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
