// End-to-end: the cellar app in a browser, talking to the real Apps Script (apps-script/Code.gs, run in Node by
// gas-harness.js against an in-memory sheet). Walks the hand-offs between the cellar, Enjoyed and the journal and
// checks the sheet after each step.
//
//   (cd .. && python3 -m http.server 8765) & node tools/cellar-flow-test.js
//   MODE=vault node tools/cellar-flow-test.js   — the same walk on an encrypted account: an owner account from before
//                                                 encryption logs in, is upgraded and migrated, then everything runs
//                                                 in the browser's vault; checks read the cellar back through the page
"use strict";
const { chromium } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note", "Anskaffet", "Drukket dato", "Rating"];
const row = o => HEAD.map(h => o[h] ?? "");
const VAULT_MODE = process.env.MODE === "vault";
const gas = H({
  Ark1: [HEAD,
    row({ Producent: "Armand Rousseau", Land: "Frankrig", Område: "Bourgogne", Kommune: "Gevrey-Chambertin", "Mark/Navn": "Clos St-Jacques", Type: "Rød", Drue: "Pinot Noir", Årgang: 2016, Antal: 3, "Pris kr (WS)": 4500, Anskaffet: "2020-03-01" }),
    row({ Producent: "Sylvain Cathiard", Land: "Frankrig", Område: "Bourgogne", Kommune: "Vosne-Romanée", "Mark/Navn": "Aux Malconsorts", Type: "Rød", Drue: "Pinot Noir", Årgang: 2017, Antal: 1, "Pris kr (WS)": 3200, Anskaffet: "2021-05-01" }),
    row({ Producent: "Domaine Ponsot", Land: "Frankrig", Område: "Bourgogne", Kommune: "Morey-Saint-Denis", "Mark/Navn": "Clos de la Roche Vieilles Vignes", Klassifikation: "Grand Cru", Type: "Rød", Årgang: 2010, Antal: 1, Drukket: 1, "Drukket dato": "2025-12-24", Anskaffet: "2015-01-01" }),
    row({ Producent: "Giacomo Conterno", Land: "Italien", Område: "Piemonte", Kommune: "Monforte d'Alba", "Mark/Navn": "Barolo Cascina Francia", Type: "Rød", Drue: "Nebbiolo", Årgang: 2013, Antal: 2, "Pris kr (WS)": 2500, Anskaffet: "2019-01-01" }),
  ],
  Journal: [["Dato", "Producent", "Vin", "Årgang", "Land", "Område", "Drue", "Sted", "Rating", "Pris", "Note", "Foto"]],
}, VAULT_MODE ? { settings: { OWNER_USER: "adam", OWNER_PASSWORD: "owner-pass-1" } } : {});
if (VAULT_MODE) gas.run("makeOwner()");
const TODAY = "2026-10-16";
const SHOTS = process.env.SHOTS || ""; // a folder: screenshots of the forms and the Enjoyed page
const results = []; const check = (name, ok, extra = "") => { results.push([ok, name]); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
let PAGE = null;
const wines = async () => VAULT_MODE ? PAGE.evaluate(() => VAULT.call({ action: "data" }).then(r => r.wines)) : gas.call({ code: "test-code", action: "data" }).wines;
const journal = async () => VAULT_MODE ? PAGE.evaluate(() => VAULT.call({ action: "journal" }).then(r => r.entries)) : gas.call({ code: "test-code", action: "journal" }).entries;
const W = async (prod, name) => (await (await wines())).find(w => w.producer === prod && (name == null || w.name === name));

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(`{ const D = Date; const fixed = new D("${TODAY}T18:00:00").getTime(); Date = class extends D { constructor(...a){ super(...(a.length ? a : [fixed])); } static now(){ return fixed; } }; }`);
  await require("./turnstile-fake")(ctx);
  await ctx.route(require("./api-route"), async route => {
    const p = JSON.parse(route.request().postData() || "{}");
    let r;
    if (VAULT_MODE) r = gas.call(p); // the real server, accounts and all
    else if (p.action === "login") r = { ok: true, user: p.user, token: "tok", v: 26 };
    else if (p.action === "prelogin") r = { ok: false, error: "bad-code", v: 27 }; // an older Apps Script: the plain flow
    else { delete p.user; delete p.token; p.code = "test-code"; r = gas.call(p); }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(r) });
  });
  const p = await ctx.newPage(); const errs = []; PAGE = p;
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  const dialogs = []; let answer = true;
  p.on("dialog", d => { dialogs.push(d.message()); answer ? d.accept() : d.dismiss(); });
  await p.goto(BASE); await p.waitForTimeout(500);
  await p.fill("#gateUser", "adam"); await p.fill("#gatePass", VAULT_MODE ? "owner-pass-1" : "pw"); await p.click("#gateSubmit");
  if (VAULT_MODE) {
    await p.waitForSelector("#recModal.open", { timeout: 20000 });
    check("upgrade shows a recovery code", /^[0-9A-Z]{4}(-[0-9A-Z]{4}){7}$/.test(await p.textContent("#recCode")));
    check("…Continue waits for 'I've saved it'", await p.isDisabled("#recDone"));
    await p.check("#recOk"); await p.click("#recDone");
    await p.waitForSelector("#app:not([hidden])", { timeout: 30000 });
    await p.waitForTimeout(1500);
    check("migration empties the plain wine tab", gas.rows("Ark1").length === 0);
  }
  await p.waitForTimeout(1500);
  // open a wine's detail unless it's already open (the app keeps the row you're working on open)
  const openRow = async (scope, prod) => { const tr = p.locator(`${scope} tr.main:has-text("${prod}")`).first();
    if((await tr.getAttribute("aria-expanded")) !== "true"){ await tr.click(); await p.waitForTimeout(250); } };
  const detail = (scope, prod) => p.locator(`${scope} tr.main:has-text("${prod}") + tr.detail`);
  const go = async pg => { await p.click(`.tab[data-page=${pg}]`); await p.waitForTimeout(400); };

  // 1. mark a bottle drunk in the cellar, then journal it the same day → no second bottle
  await openRow("#tbl", "Armand Rousseau");
  await detail("#tbl", "Armand Rousseau").locator('button[data-act="drink"]').click(); await p.waitForTimeout(600);
  check("cellar: one bottle marked drunk", (await W("Armand Rousseau")).drunk === 1);
  await openRow("#tbl", "Armand Rousseau");
  await detail("#tbl", "Armand Rousseau").locator("button.jlog").click(); await p.waitForTimeout(300);
  check("journal form knows the bottle is already in Enjoyed", await p.isVisible("#jEnjoyDone") && !(await p.isVisible("#jEnjoyWrap")));
  check("journal form suggests 1. cru for Clos St-Jacques", (await p.inputValue("#jClass")) === "1. cru", await p.inputValue("#jClass"));
  await p.selectOption("#jRating", "9"); await p.fill("#jNote", "Lovely."); await p.click("#jSave"); await p.waitForTimeout(800);
  check("…and saving it doesn't drink a second bottle", (await W("Armand Rousseau")).drunk === 1, "drunk=" + (await W("Armand Rousseau")).drunk);
  check("…the score carries to the cellar wine", (await W("Armand Rousseau")).rating === 9, "rating=" + (await W("Armand Rousseau")).rating);
  check("…the entry is saved with its classification and commune", (await journal()).some(e => e.producer === "Armand Rousseau" && e.classification === "1. cru" && e.commune === "Gevrey-Chambertin"));

  // 2. last bottle: the app offers a journal entry; saving it adds nothing to Enjoyed
  await go("cellar");
  const nBefore = (await wines()).length;
  await openRow("#tbl", "Sylvain Cathiard");
  await detail("#tbl", "Sylvain Cathiard").locator('button[data-act="drink"]').click(); await p.waitForTimeout(1200);
  check("last bottle prompts for a journal note", dialogs.some(d => /last .*Cathiard/.test(d)));
  await p.waitForSelector("#jModal.open", { timeout: 3000 }).catch(() => {});
  check("…the form says it's already in Enjoyed", await p.isVisible("#jEnjoyDone"));
  await p.click("#jSave"); await p.waitForTimeout(800);
  check("…and no duplicate Enjoyed row appears", (await wines()).length === nBefore, `${nBefore} → ${(await wines()).length}`);

  // 3. a wine drunk elsewhere, via the journal: one Enjoyed row, classified
  await go("journal"); await p.click("#jAddBtn"); await p.waitForTimeout(300);
  await p.fill("#jProducer", "Domaine Bizot"); await p.fill("#jWine", "Echezeaux"); await p.fill("#jVintage", "2019");
  await p.fill("#jRegion", "Bourgogne"); await p.fill("#jPlace", "Noma"); await p.fill("#jPrice", "5000"); await p.waitForTimeout(150);
  check("elsewhere: Échezeaux suggested as Grand cru", (await p.inputValue("#jClass")) === "Grand cru");
  if(SHOTS) await p.locator("#jForm").screenshot({ path: SHOTS + "/flow-journal-form.png" });
  check("elsewhere: 'Also add to Enjoyed' on by default", await p.isChecked("#jEnjoy"));
  await p.click("#jSave"); await p.waitForTimeout(900);
  let bz = (await W("Domaine Bizot"));
  check("…one Enjoyed row, marked as drunk elsewhere", bz && bz.elsewhere === true && bz.qty === 1 && bz.drunk === 1 && bz.classification === "Grand cru" && bz.price === 5000 && bz.source === "Noma");

  // 4. rename + re-date the entry: the Enjoyed row follows, no new row
  await p.click('.jentry:has-text("Domaine Bizot") .jedit'); await p.waitForTimeout(300);
  check("editing: 'Also add' is not pre-ticked", !(await p.isVisible("#jEnjoyWrap")) || !(await p.isChecked("#jEnjoy")));
  await p.fill("#jWine", "Échezeaux"); await p.fill("#jVintage", "2018"); await p.fill("#jDate", "2026-10-12"); await p.click("#jSave"); await p.waitForTimeout(900);
  const bzs = (await wines()).filter(w => w.producer === "Domaine Bizot");
  check("…the Enjoyed row was renamed and re-dated, not duplicated", bzs.length === 1 && bzs[0].name === "Échezeaux" && bzs[0].vintage === 2018 && bzs[0].drunkDate === "2026-10-12", JSON.stringify(bzs.map(w => [w.name, w.vintage, w.drunkDate])));

  // 5. undo drink isn't offered on a wine drunk elsewhere (it would invent a cellar bottle)
  await go("enjoyed"); await openRow("#eTbl", "Domaine Bizot");
  const dz = detail("#eTbl", "Domaine Bizot");
  check("Enjoyed: no 'Undo drink' for a wine drunk elsewhere", (await dz.locator('button[data-act="undrink"]').count()) === 0);
  check("Enjoyed: it offers 'Remove from Enjoyed' instead", /Remove from Enjoyed/.test(await dz.locator('button[data-act="delete"]').textContent()));

  // 6. deleting the journal entry offers to take the Enjoyed row with it
  await go("journal"); dialogs.length = 0;
  await p.click('.jentry:has-text("Domaine Bizot") .jdel'); await p.waitForTimeout(1200);
  check("delete asks about Enjoyed too", dialogs.some(d => /remove .*Bizot.* from Enjoyed/i.test(d)), dialogs.join(" | "));
  check("…and removes the Enjoyed row", !(await W("Domaine Bizot")));

  // 7. rename a cellar wine: its journal entry follows
  await go("cellar"); await openRow("#tbl", "Armand Rousseau");
  await detail("#tbl", "Armand Rousseau").locator("button.winfo").click(); await p.waitForTimeout(300);
  check("details editor offers to rename the journal entry", await p.isVisible("#iJWrap"));
  if(SHOTS) await p.locator("#iForm").screenshot({ path: SHOTS + "/flow-details.png" });
  await p.fill("#iName", "Clos Saint-Jacques"); await p.click("#iSave"); await p.waitForTimeout(900);
  check("…wine renamed", !!(await W("Armand Rousseau", "Clos Saint-Jacques")));
  check("…journal entry renamed with it", (await journal()).some(e => e.producer === "Armand Rousseau" && e.wine === "Clos Saint-Jacques"));

  // 8. fill in classifications the app can tell from names (and leave others alone)
  await go("enjoyed");
  const fillShown = await p.isVisible("#eFill");
  if(SHOTS){ await p.evaluate(() => document.querySelector("#eFill details")?.setAttribute("open", "")); await p.screenshot({ path: SHOTS + "/flow-enjoyed.png", fullPage: true }); }
  check("Enjoyed offers to fill in classifications", fillShown);
  if (fillShown){ await p.click("#eFillGo"); await p.waitForTimeout(900); }
  check("…Malconsorts filled as 1. cru", (await W("Sylvain Cathiard")).classification === "1. cru", (await W("Sylvain Cathiard")).classification);
  check("…Barolo left blank (no evidence)", (await W("Giacomo Conterno")).classification === "");
  check("…Clos St-Jacques (blank, suggested) filled as 1. cru", (await W("Armand Rousseau")).classification === "1. cru", (await W("Armand Rousseau")).classification);
  check("…one already set is left exactly as written", (await W("Domaine Ponsot")).classification === "Grand Cru", (await W("Domaine Ponsot")).classification);

  // 9. autofill from a wine already logged
  await go("journal"); await p.click("#jAddBtn"); await p.waitForTimeout(300);
  await p.fill("#jProducer", "Armand Rousseau"); await p.fill("#jWine", "Clos Saint-Jacques"); await p.waitForTimeout(150);
  check("autofill: region, commune, grape from the cellar", (await p.inputValue("#jRegion")) === "Bourgogne" && (await p.inputValue("#jCommune")) === "Gevrey-Chambertin" && (await p.inputValue("#jGrape")) === "Pinot Noir");
  check("autofill: says what it filled", /Filled in/.test(await p.textContent("#jFillNote")));
  await p.click("#jCancel");

  // 10. editing an old entry for a cellar bottle doesn't drink another one
  const drunk0 = (await W("Armand Rousseau")).drunk;
  await p.click('.jentry:has-text("Armand Rousseau") .jedit'); await p.waitForTimeout(300);
  await p.fill("#jNote", "Lovely. Better the next day."); await p.click("#jSave"); await p.waitForTimeout(900);
  check("editing a cellar entry keeps the bottle count", (await W("Armand Rousseau")).drunk === drunk0, `${drunk0} → ${(await W("Armand Rousseau")).drunk}`);

  // 11. add a wine I've had (Enjoyed page) with classification + country
  await go("enjoyed"); await p.click("#eAddBtn"); await p.waitForTimeout(300);
  await p.fill("#eaProducer", "Domaine Leflaive"); await p.fill("#eaWine", "Chevalier-Montrachet"); await p.fill("#eaVintage", "2014"); await p.fill("#eaRegion", "Bourgogne"); await p.waitForTimeout(150);
  check("add-a-wine suggests Grand cru", (await p.inputValue("#eaClass")) === "Grand cru");
  await p.click("#eaSave"); await p.waitForTimeout(900);
  const lf = (await W("Domaine Leflaive"));
  check("…saved with classification, marked elsewhere", lf && lf.classification === "Grand cru" && lf.elsewhere === true);

  check("no console errors", !errs.length, errs.join(" | "));
  if (VAULT_MODE) {
    const stored = JSON.stringify(Object.values(gas.rt.books).filter(b => !b.trashed).map(b => Object.entries(b.sheets).filter(([n]) => !["Users", "Feed", "Follows", "FeedComments", "AtlasEdits"].includes(n)).map(([, sh]) => sh._cells)));
    check("vault: the server holds no wine, note or name in the clear", !/Rousseau|Cathiard|Ponsot|Conterno|Lovely|Échezeaux|Bizot/.test(stored), stored.slice(0, 200));
  }
  const fail = results.filter(r => !r[0]).length;
  console.log(`\n${results.length - fail}/${results.length} passed`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
