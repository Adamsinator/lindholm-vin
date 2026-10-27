// Browser test of the sommelier panel on an encrypted account (real Code.gs through gas-harness.js): it opens, loads
// its data only then, answers about the cellar and the atlas, follows the language picker, sends nothing to the server,
// and fits a phone.
//   (cd .. && python3 -m http.server 8765) & node tools/sommelier-ui-test.js
"use strict";
const { chromium } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const gas = H({ Ark1: [["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"]] },
              { settings: { SIGNUP_CODE: "invite" } });
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  let calls = 0; const loaded = [];
  await require("./turnstile-fake")(ctx);
  await ctx.route(require("./api-route"), async route => { calls++; await route.fulfill({ contentType: "application/json", body: JSON.stringify(gas.call(JSON.parse(route.request().postData() || "{}"))) }); });
  const p = await ctx.newPage(); const errs = [];
  p.on("request", r => loaded.push(r.url()));
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  await p.goto(BASE); await p.waitForTimeout(400);
  check("no sommelier button on the login screen", !(await p.isVisible("#sommBtn")));
  await p.click("#gateToggle");
  await p.fill("#gateUser", "fiona"); await p.fill("#gatePass", "fiona-pass-1"); await p.fill("#gateInvite", "invite");
  await p.click("#gateSubmit");
  await p.waitForSelector("#recModal.open", { timeout: 20000 }); await p.check("#recOk"); await p.click("#recDone");
  await p.waitForSelector("#app:not([hidden])", { timeout: 20000 });
  await p.click("#addBtn"); await p.fill("#aProducer", "Armand Rousseau"); await p.fill("#aName", "Clos St-Jacques"); await p.fill("#aVintage", "2016");
  await p.fill("#aRegion", "Bourgogne"); await p.fill("#aLocation", "Kælder, reol 3"); await p.click('#addForm button[type="submit"]'); await p.waitForTimeout(1000);

  check("the button shows with the cellar", await p.isVisible("#sommBtn"));
  check("its data isn't loaded until it opens", !loaded.some(u => /sommelier/.test(u)));
  await p.click("#sommBtn");
  await p.waitForSelector("#sommLog .sm-a", { timeout: 10000 });
  check("it opens with a greeting and suggestions", /sommelier/i.test(await p.textContent("#sommLog")) && (await p.$$("#sommChips button")).length === 4);
  const before = calls;
  await p.fill("#sommQ", "What grape is Sancerre?"); await p.press("#sommQ", "Enter"); await p.waitForTimeout(300);
  let last = () => p.$$eval("#sommLog .sm-a", a => a[a.length - 1].textContent);
  check("answers an appellation", /Sauvignon Blanc/.test(await last()) && /Pinot Noir/.test(await last()));
  await p.fill("#sommQ", "where is my rousseau"); await p.press("#sommQ", "Enter"); await p.waitForTimeout(300);
  check("answers about the cellar, with the location", /Clos St-Jacques 2016.*Kælder, reol 3/.test(await last()), await last());
  await p.click("#sommChips button:nth-child(2)"); await p.waitForTimeout(300);
  check("a suggestion can be clicked", /Côte de Nuits 2005: 98\/100/.test(await last()), await last());
  // a follow-up: the page hands the sommelier the previous question
  await p.fill("#sommQ", "how long can I keep Barolo?"); await p.press("#sommQ", "Enter"); await p.waitForTimeout(300);
  await p.fill("#sommQ", "and Barbaresco?"); await p.press("#sommQ", "Enter"); await p.waitForTimeout(300);
  check("a follow-up ('and Barbaresco?') answers from the question before", /^Barbaresco: typically at its best/.test((await last()).trim()), (await last()).slice(0, 120));
  await p.fill("#sommQ", "tell me about Egon Müller"); await p.press("#sommQ", "Enter"); await p.waitForTimeout(300);
  check("…and it knows producers beyond Burgundy (sommelier-world.js loads)", /Scharzhofberger/.test(await last()));
  check("the question is shown as typed, as text", (await p.$$eval("#sommLog .sm-q", q => q.map(x => x.innerHTML))).every(h => !/</.test(h)));
  await p.fill("#sommQ", "<img src=x onerror=window.__x=1>"); await p.press("#sommQ", "Enter"); await p.waitForTimeout(300);
  check("typed HTML stays text", await p.evaluate(() => !window.__x && !document.querySelector("#sommLog img")));
  check("nothing went to the server while asking", calls === before, `${calls - before} calls`);
  // in Danish: the answer and the atlas's Danish texts
  await p.evaluate(() => I18N.setLang("da")); await p.waitForTimeout(200);
  await p.fill("#sommQ", "hvem ejer musigny"); await p.press("#sommQ", "Enter"); await p.waitForTimeout(800);
  check("follows the language, with the atlas's Danish text", /grand cru i Chambolle-Musigny/.test(await last()) && loaded.some(u => /burgundy-i18n-da/.test(u)), await last());
  check("the panel's own words are Danish", /Spørg sommelieren|Sommelier/.test(await p.textContent("#sommPanel")) && (await p.getAttribute("#sommQ", "placeholder")).startsWith("Spørg"));
  await p.press("#sommQ", "Escape"); await p.waitForTimeout(150);
  check("Escape closes it and brings the button back", !(await p.isVisible("#sommPanel")) && await p.isVisible("#sommBtn"));
  await p.evaluate(() => I18N.setLang("en"));
  // phone
  await p.setViewportSize({ width: 375, height: 760 }); await p.click("#sommBtn"); await p.waitForTimeout(200);
  const box = await p.$eval("#sommPanel", e => { const r = e.getBoundingClientRect(); return [r.width, r.height]; });
  check("full screen on a phone, no sideways scroll", box[0] === 375 && await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), JSON.stringify(box));
  check("the conversation is kept", (await p.$$("#sommLog .sm-a")).length >= 5);
  check("no console errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
