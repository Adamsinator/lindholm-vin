// Browser test of the import's corrections and "Tidy up", on an encrypted account against the real Code.gs: a messy
// workbook (typos, shouting, the same wine on several rows), one correction turned off, then a cellar with
// inconsistent spellings and a wine in two rows tidied in one go.
//   (cd .. && python3 -m http.server 8765) & node tools/tidy-ui-test.js
"use strict";
const path = require("path");
const { chromium } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const gas = H({ Ark1: [["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"]] },
              { settings: { SIGNUP_CODE: "invite" } });
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await require("./turnstile-fake")(ctx);
  await ctx.route(require("./api-route"), async route => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(gas.call(JSON.parse(route.request().postData() || "{}"))) });
  });
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  p.on("dialog", d => d.accept());
  const closed = id => p.waitForFunction(i => !document.getElementById(i).classList.contains("open"), id, { timeout: 15000 });
  await p.goto(BASE); await p.waitForTimeout(400);
  await p.click("#gateToggle");
  await p.fill("#gateUser", "erik"); await p.fill("#gatePass", "erik-pass-1"); await p.fill("#gateInvite", "invite");
  await p.click("#gateSubmit");
  await p.waitForSelector("#recModal.open", { timeout: 20000 }); await p.check("#recOk"); await p.click("#recDone");
  await p.waitForSelector("#app:not([hidden])", { timeout: 20000 });

  // a messy workbook
  await p.click("#impBtn"); await p.setInputFiles("#impFile", path.join(__dirname, "fixtures", "messy.xlsx")); await p.waitForSelector("#impMap:not([hidden])");
  const fixes = await p.textContent("#impFixes");
  check("the corrections are listed", /“bourgugndy” → “Bourgogne”/.test(fixes) && /“DOMAINE ROULOT” → “Domaine Roulot”/.test(fixes) && /“Reisling” → “Riesling”/.test(fixes), fixes.slice(0, 300));
  check("…and the merge is offered", await p.isVisible("#impMergeWrap") && /5 rows join others/.test(await p.textContent("#impMergeLbl")), await p.textContent("#impMergeLbl"));
  check("12 rows become 7 wines", /7 wines · /.test(await p.textContent("#impSum")) && /1 total row/.test(await p.textContent("#impSum")), await p.textContent("#impSum"));
  // keep "Reisling" as typed
  await p.uncheck('#impFixes input[data-fix="grape|Reisling"]'); await p.waitForTimeout(150);
  check("a correction can be turned off", (await p.$$eval('#impFixes input[data-fix="grape|Reisling"]', x => x.map(c => c.checked))).join() === "false");
  await p.uncheck("#impMerge"); await p.waitForTimeout(150);
  check("merging can be turned off", /12 wines · /.test(await p.textContent("#impSum")));
  await p.check("#impMerge"); await p.waitForTimeout(150);
  await p.click("#impGo"); await closed("impModal"); await p.waitForTimeout(600);
  const W = () => p.evaluate(() => VAULT.call({ action: "data" }).then(r => r.wines));
  let ws = await W();
  const roul = ws.find(w => w.producer === "Domaine Roulot");
  check("the import: 7 wines, Roulot as one row of 6 at the bottle-weighted 1290", ws.length === 7 && roul.qty === 6 && roul.price === 1290 && roul.region === "Bourgogne", JSON.stringify(roul));
  check("…the correction left off stayed off", ws.find(w => /Keller/.test(w.producer)).grape === "Reisling");

  // a cellar that has drifted: added by hand in other spellings, and a wine in two rows
  for (const [prod, name, vint, region] of [["ROULOT", "MEURSAULT PERRIERES", "2020", "burgundy"], ["Château Margaux", "", "2015", "Bordeaux"]]) {
    await p.click("#addBtn"); await p.fill("#aProducer", prod); await p.fill("#aName", name); await p.fill("#aVintage", vint); await p.fill("#aRegion", region);
    await p.click('#addForm button[type="submit"]'); await p.waitForTimeout(900);
  }
  await p.click("#tidyBtn"); await p.waitForTimeout(300);
  const tf = await p.textContent("#tidyFixes"), td = await p.textContent("#tidyDups");
  check("tidy offers the spellings", /“ROULOT” → “Domaine Roulot”/.test(tf) && /“burgundy” → “Bourgogne”/.test(tf) && /“MEURSAULT PERRIERES” → “Meursault Perrières”/.test(tf), tf);
  check("…and the wines in two rows", /Domaine Roulot/.test(td) && /Château Margaux/.test(td) && /2 rows: 6 \+ 1 bottles/.test(td), td);
  // leave Château Margaux's two rows as they are
  const margKey = await p.$$eval("#tidyDups label", ls => { const l = ls.find(x => /Margaux/.test(x.textContent)); return l.querySelector("input").dataset.grp; });
  await p.uncheck(`#tidyDups input[data-grp="${margKey}"]`); await p.waitForTimeout(150);
  check("the button counts what will happen", /join 1 groups/.test(await p.textContent("#tidyGo")), await p.textContent("#tidyGo"));
  await p.click("#tidyGo"); await closed("tidyModal"); await p.waitForTimeout(600);
  ws = await W();
  const r2 = ws.filter(w => w.producer === "Domaine Roulot" && w.vintage === 2020);
  check("after tidying: one Roulot Perrières 2020 with 7 bottles", r2.length === 1 && r2[0].qty === 7 && r2[0].name === "Meursault Perrières", JSON.stringify(r2));
  check("…regions consistent", ws.every(w => !w.region || ["Bourgogne", "Bordeaux", "Piemonte", "Napa Valley", "Rheinhessen"].includes(w.region)), JSON.stringify(ws.map(w => w.region)));
  check("…and the group left unticked kept its two rows", ws.filter(w => w.producer === "Château Margaux").length === 2);
  await p.click("#tidyBtn"); await p.waitForTimeout(300);
  check("tidy again: only the group left alone remains", /Château Margaux/.test(await p.textContent("#tidyDups")) && (await p.$$("#tidyFixes label")).length === 0);
  await p.click("#tidyCancel");
  check("no console errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
