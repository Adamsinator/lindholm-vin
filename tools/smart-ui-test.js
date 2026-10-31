// The cellar doing more of the work, in a browser against the real Apps Script (gas-harness.js): the add form fills
// in what the atlas knows about a vineyard named in the wine; an estimated drink window becomes the wine's own with
// one tap; drinking a bottle offers Undo and a rating; deleting needs no confirmation and can be undone; the site's
// own question replaces the browser's OK / Cancel; the page shows the shape of the cellar while it loads.
//   (cd .. && python3 -m http.server 8765) & node tools/smart-ui-test.js
"use strict";
const { chromium } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note", "Anskaffet", "Drukket dato", "Rating"];
const row = o => HEAD.map(h => o[h] ?? "");
const gas = H({
  Ark1: [HEAD,
    row({ Producent: "Armand Rousseau", Land: "Frankrig", Område: "Bourgogne", Kommune: "Gevrey-Chambertin", "Mark/Navn": "Clos St-Jacques", Klassifikation: "1. cru", Type: "Rød", Drue: "Pinot Noir", Årgang: 2016, Antal: 3 }),
    row({ Producent: "Giacomo Conterno", Land: "Italien", Område: "Piemonte", "Mark/Navn": "Barolo Francia", Type: "Rød", Drue: "Nebbiolo", Årgang: 2013, Antal: 2 })],
  Journal: [["Dato", "Producent", "Vin", "Årgang", "Land", "Område", "Drue", "Sted", "Rating", "Pris", "Note", "Foto"]],
  Ønskeliste: [["Producent", "Vin", "Årgang", "Land", "Område", "Pris", "Note", "Tilføjet"], ["Coche-Dury", "Meursault", "2019", "Frankrig", "Bourgogne", "", "", "2026-01-01"]],
}, { settings: { OWNER_USER: "adam", OWNER_PASSWORD: "owner-pass-1" } });
gas.run("makeOwner()");
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await require("./turnstile-fake")(ctx);
  const asked = []; let answer = false; await require("./ask-auto")(ctx, asked, () => answer);
  let slow = false;
  await ctx.route(require("./api-route"), async route => {
    const q = JSON.parse(route.request().postData() || "{}");
    if (slow && q.action === "data") await new Promise(r => setTimeout(r, 1500));
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(gas.call(q)) });
  });
  const errs = [], p = await ctx.newPage(); p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  p.on("dialog", d => { errs.push("browser dialog: " + d.message()); d.dismiss(); });
  await p.goto(BASE); await p.waitForTimeout(500);
  await p.fill("#gateUser", "adam"); await p.fill("#gatePass", "owner-pass-1"); await p.click("#gateSubmit");
  await p.waitForSelector("#recModal.open", { timeout: 20000 }); await p.check("#recOk"); await p.click("#recDone");
  await p.waitForSelector("#app:not([hidden])", { timeout: 30000 }); await p.waitForTimeout(1200);
  const wine = prod => p.evaluate(n => WINES.find(w => w.producer === n), prod);

  // the shape of the cellar while it loads
  // an encrypted cellar opens in the browser, so the wait is made there
  const loading = p.evaluate(() => { const real = api; api = q => new Promise(r => setTimeout(() => r(real(q)), 1500)); return loadData().finally(() => { api = real; }); });
  await p.waitForTimeout(400);
  check("while loading: grey shapes for the totals and the list, the words kept for screen readers",
    await p.isVisible("#spin .sk-kpis") && (await p.$$("#spin .sk-rows i")).length >= 5 && /Fetching the cellar/.test(await p.textContent("#spin .sr")));
  await loading;
  check("…then the cellar", await p.isHidden("#spin") && await p.isVisible("#content"));

  // the atlas fills in
  await p.click("#addBtn"); await p.waitForSelector("#addModal.open");
  await p.fill("#aProducer", "Domaine Méo-Camuzet"); await p.fill("#aName", "Clos de Vougeot");
  await p.waitForFunction(() => !document.getElementById("aFillNote").hidden, null, { timeout: 8000 }).catch(() => {});
  const f = await p.evaluate(() => ({ c: aCommune.value, r: aRegion.value, k: aCountry.value, cls: aClass.value, note: aFillNote.textContent }));
  check("a vineyard in the wine's name: the atlas fills commune, region, country and classification", f.c === "Vougeot" && f.r === "Bourgogne" && f.k === "Frankrig" && /grand/i.test(f.cls), JSON.stringify(f));
  check("…and says where it came from", /atlas \(Clos de Vougeot\)/.test(f.note), f.note);
  await p.fill("#aCommune", ""); await p.fill("#aRegion", "Something else"); await p.fill("#aName", "Meursault Perrières"); await p.waitForTimeout(200);
  const g = await p.evaluate(() => ({ c: aCommune.value, r: aRegion.value }));
  check("it never overwrites what's typed, and picks the Perrières in the village named", g.c === "Meursault" && g.r === "Something else", JSON.stringify(g));
  await p.fill("#aName", "Cuvée Prestige"); await p.fill("#aCommune", ""); await p.waitForTimeout(200);
  check("a name the atlas doesn't know fills nothing", (await p.inputValue("#aCommune")) === "");
  await p.keyboard.press("Escape");

  // one tap: the estimate becomes the wine's own window
  await p.click('#tbl tbody tr.main:has-text("Giacomo Conterno")'); await p.waitForTimeout(300);
  const use = p.locator('#tbl tr.main:has-text("Giacomo Conterno") + tr.detail .usewin');
  const est = await use.textContent();
  check("an estimated window offers itself", /Use \d{4}–\d{4}/.test(est), est);
  await use.click(); await p.waitForTimeout(800);
  const cw = await wine("Giacomo Conterno"), m = est.match(/(\d{4})–(\d{4})/);
  check("…one tap makes it the wine's own", cw.drinkFrom === Number(m[1]) && cw.drinkTo === Number(m[2]), JSON.stringify([cw.drinkFrom, cw.drinkTo]));

  // drinking: Undo and a rating
  await p.click('#tbl tbody tr.main:has-text("Armand Rousseau")'); await p.waitForTimeout(300);
  await p.click('#tbl tr.main:has-text("Armand Rousseau") + tr.detail button[data-act="drink"]'); await p.waitForSelector("#actbar:not([hidden])");
  check("drinking a bottle: the bar offers Undo and five stars", /Skål/.test(await p.textContent("#actMsg")) && /Undo/.test(await p.textContent("#actBtns")) && (await p.$$("#actbar .stars button")).length === 5);
  await p.click("#actbar .stars button >> nth=3"); await p.waitForTimeout(800);
  check("…a tap on the fourth star rates it 8 of 10", (await wine("Armand Rousseau")).rating === 8, JSON.stringify(await wine("Armand Rousseau")));
  await p.click('#tbl tr.main:has-text("Armand Rousseau") + tr.detail button[data-act="drink"]'); await p.waitForTimeout(900);
  const left = (await wine("Armand Rousseau")).left;
  await p.click('#actBtns button:has-text("Undo")'); await p.waitForTimeout(900);
  check("…Undo puts the bottle back", (await wine("Armand Rousseau")).left === left + 1, `${left} → ${(await wine("Armand Rousseau")).left}`);

  // deleting: no question, Undo
  await p.click('#tbl tbody tr.main:has-text("Giacomo Conterno")'); await p.waitForTimeout(300);
  await p.click('#tbl tr.main:has-text("Giacomo Conterno") + tr.detail button[data-act="delete"]'); await p.waitForTimeout(1200);
  check("deleting asks nothing and is done", !asked.length && !(await wine("Giacomo Conterno")) && /Deleted Giacomo Conterno/.test(await p.textContent("#actMsg")),
    JSON.stringify({ asked, gone: !(await wine("Giacomo Conterno")), msg: await p.textContent("#actMsg") }));
  await p.click('#actBtns button:has-text("Undo")'); await p.waitForTimeout(1000);
  check("…Undo brings it back", !!(await wine("Giacomo Conterno")));

  // the site's own question
  await p.click('.tab[data-page="wishlist"]'); await p.waitForTimeout(800);
  answer = false; await p.click(".wdel >> nth=0"); await p.waitForTimeout(600);
  check("removing a wish asks in the page, not the browser; Cancel keeps it", asked.some(a => /Remove this wish/.test(a)) && (await p.$$(".wdel")).length === 1);
  answer = true; await p.click(".wdel >> nth=0"); await p.waitForTimeout(900);
  check("…OK removes it", (await p.$$(".wdel")).length === 0);
  await p.evaluate(() => { ask("Testing Escape?"); }); await p.waitForSelector("#askModal.open").catch(() => {});
  // ask-auto answers at once; this checks the dialog closes either way
  await p.waitForTimeout(300);
  check("the question closes when answered", !(await p.isVisible("#askModal.open")));

  const one = await p.evaluate(() => { WINES = WINES.filter(w => w.left > 0).slice(0, 1); renderOverview(); return document.getElementById("kpis").textContent; });
  check("one wine says so, in the singular", /1 different wine(?!s)/.test(one), one.slice(0, 200));
  check("no page errors, and no browser dialogs", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
