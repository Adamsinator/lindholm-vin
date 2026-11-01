// The cellar as an app, in a browser against the real Apps Script (gas-harness.js): the wine rack shows a bottle for
// every bottle (a big cellar a few rows and "+ N more"), its capsule amber when it's time, and a tap opens the wine; on
// a wide screen it sits in the overview column, so the list doesn't move down. On a phone: a slim top bar (⋯ and your
// initial), the pages as tabs at the bottom, ＋ adding on whichever page you're on, the tools and the account in menus
// that slide up, and the wines as cards.
//   (cd .. && python3 -m http.server 8765) & node tools/shell-ui-test.js
"use strict";
const { chromium } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note", "Anskaffet", "Drukket dato", "Rating"];
const row = o => HEAD.map(h => o[h] ?? "");
const Y = new Date().getFullYear();
const gas = H({
  Ark1: [HEAD,
    row({ Producent: "Armand Rousseau", Land: "Frankrig", Område: "Bourgogne", "Mark/Navn": "Clos St-Jacques", Type: "Rød", Årgang: 2016, Antal: 3 }),
    row({ Producent: "Domaine Leflaive", Land: "Frankrig", Område: "Bourgogne", "Mark/Navn": "Les Pucelles", Type: "Hvid", Årgang: 2012, Antal: 2 }),
    row({ Producent: "Bollinger", Land: "Frankrig", Område: "Champagne", "Mark/Navn": "La Grande Année", Type: "Bobler", Årgang: 2014, Antal: 2 }),
    row({ Producent: "Tempier", Land: "Frankrig", Område: "Provence", "Mark/Navn": "Bandol Rosé", Type: "Rosé", Årgang: 2015, Antal: 2 }), // long past its window
    row({ Producent: "Many Bottles", Land: "Frankrig", Område: "Bordeaux", "Mark/Navn": "Grand Vin", Type: "Rød", Årgang: 2020, Antal: 60 })],
  Journal: [["Dato", "Producent", "Vin", "Årgang", "Land", "Område", "Drue", "Sted", "Rating", "Pris", "Note", "Foto"]],
}, { settings: { OWNER_USER: "adam", OWNER_PASSWORD: "owner-pass-1" } });
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

  // ── wide screen ──
  check("wide screen: the rack sits in the overview column, the list where it was", await p.evaluate(() => !!document.querySelector("#overview .side-body > #wall")) && await p.isVisible("#wall") && await p.isVisible("#kpis"));
  const wall = await p.evaluate(() => ({ n: document.getElementById("wallN").textContent, b: document.querySelectorAll("#rack button.btl").length,
    more: document.getElementById("rackMore").textContent, hid: document.getElementById("rackMore").hidden }));
  check("69 bottles: the count, a few rows of them and '+ N more'", wall.n === "69" && wall.b > 8 && wall.b < 69 && !wall.hid && new RegExp(`\\+ ${69 - wall.b} more bottles`).test(wall.more), JSON.stringify(wall));
  await p.click("#rackMore"); await p.waitForTimeout(200);
  check("…which shows all of them", (await p.$$("#rack button.btl")).length === 69 && /Show fewer/.test(await p.textContent("#rackMore")));
  check("colours by type: white, red, rosé, sparkling all on the rack", await p.evaluate(() => ["b-white", "b-red", "b-rose", "b-spark"].every(c => [...document.querySelectorAll("#rack button.btl")].some(b => b.getAttribute("style").includes(c)))));
  await p.click("#rackMore");
  const first = await p.evaluate(() => { const b = document.querySelector("#rack button.btl"); return { cls: b.className, t: b.title }; });
  check("the most pressing first: the 2015 rosé, long past its window, with the amber capsule", /past/.test(first.cls) && /Tempier/.test(first.t), JSON.stringify(first));
  await p.click("#rack button.btl >> nth=0"); await p.waitForTimeout(700);
  check("a tap on a bottle opens that wine in the list", await p.evaluate(() => { const r = document.querySelector('#tbl tr.main:has(+ tr.detail:not([hidden]))'); return !!r && /Tempier/.test(r.textContent); }));
  await p.click('#wallStats button[data-ready="past"]'); await p.waitForTimeout(400);
  check("a figure under the rack filters the list to those wines", (await p.inputValue("#fReady")) === "past" && await p.evaluate(() => SHOWN.length >= 1 && SHOWN.every(w => readiness(w).k === "past") && SHOWN.some(w => w.producer === "Tempier")));
  await p.click("#clear"); check("on a wide screen: no phone tabs, no ＋, no ⋯", await p.isHidden("#ptabs") && await p.isHidden("#pFab") && await p.isHidden("#pMore"));

  // ── phone ──
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(500);
  check("phone: the rack above the cellar, the totals it replaces hidden", await p.evaluate(() => document.getElementById("wall").nextElementSibling === document.getElementById("kpis")) && await p.isVisible("#wall") && await p.isHidden("#kpis"));
  check("…a slim top bar: ⋯ and the initial, the old buttons gone from it", await p.isVisible("#pMore") && (await p.textContent("#pMe")) === "A" && await p.isHidden("#acctBtn") && await p.isHidden("#lockBtn") && await p.isHidden(".gbar .tabs"));
  check("…the pages as tabs at the bottom, Cellar lit", await p.isVisible("#ptabs") && (await p.getAttribute("#ptabs button.on", "data-page")) === "cellar");
  check("…the cellar's buttons in a menu, not on the page", await p.isHidden("#pageCellar > .actions"));
  const card = await p.evaluate(() => { const r = getComputedStyle(document.querySelector("#tbl tr.main")); return r.borderTopLeftRadius; });
  check("…each wine a card", parseFloat(card) >= 10, card);
  await p.click("#pFab"); await p.waitForSelector("#addModal.open", { timeout: 3000 }).catch(() => {}); await p.waitForTimeout(450); // it slides up
  const sheet = await p.evaluate(() => { const c = document.querySelector("#addModal .card").getBoundingClientRect(); return { bottom: Math.round(c.bottom), h: innerHeight }; });
  check("＋ on the cellar adds a wine, in a panel that slides up from the bottom", await p.isVisible("#addModal.open") && Math.abs(sheet.bottom - sheet.h) <= 2, JSON.stringify(sheet));
  await p.keyboard.press("Escape");
  await p.click("#pMore"); await p.waitForSelector("#moreSheet.open");
  const items = await p.$$eval("#moreMenu [data-press]", b => b.map(x => x.dataset.press));
  check("⋯ holds import, export, share, tidy up, tonight, prices and refresh", ["impBtn", "expBtn", "lsBtn", "tidyBtn", "tonightBtn", "priceBtn", "refreshBtn"].every(i => items.includes(i)), items.join());
  await p.click('#moreMenu [data-press="impBtn"]'); await p.waitForSelector("#impModal.open", { timeout: 3000 }).catch(() => {});
  check("…and each item does what its button did (Import opens)", await p.isVisible("#impModal.open") && await p.isHidden("#moreSheet.open"));
  await p.keyboard.press("Escape");
  await p.click("#pMe"); await p.waitForSelector("#meSheet.open");
  const me = await p.textContent("#meSheet");
  check("your initial holds the account, admin, help, privacy, log out and the languages", /Account/.test(me) && /Admin/.test(me) && /Help and tips/.test(me) && /Log out/.test(me) && (await p.$$("#meSheet .langpick button")).length === 4, me.slice(0, 160));
  await p.click('#meMenu [data-press="acctBtn"]'); await p.waitForSelector("#acctModal.open", { timeout: 3000 }).catch(() => {});
  check("…Account opens the account", await p.isVisible("#acctModal.open")); await p.keyboard.press("Escape");
  await p.click('#ptabs button[data-page="enjoyed"]'); await p.waitForTimeout(500);
  check("the Enjoyed tab opens Enjoyed, and lights up", await p.isVisible("#pageEnjoyed") && (await p.getAttribute("#ptabs button.on", "data-page")) === "enjoyed");
  await p.click("#pFab"); await p.waitForSelector("#eaModal.open", { timeout: 3000 }).catch(() => {});
  check("…where ＋ adds a wine you've had", await p.isVisible("#eaModal.open")); await p.keyboard.press("Escape");
  check("the atlas is a tab too", (await p.getAttribute("#ptabs a", "href")) === "atlas.html");
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check("nothing wider than the phone", overflow <= 0, String(overflow));
  check("no page errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
