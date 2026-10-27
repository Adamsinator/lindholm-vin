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
  // asking: the question, "Thinking…" for about two seconds, then the answer (its opening and hint aside)
  const ask = async q => { const n = (await p.$$("#sommLog .sm-a:not(.sm-think)")).length, t0 = Date.now();
    await p.fill("#sommQ", q); await p.press("#sommQ", "Enter");
    const thinking = await p.waitForSelector("#sommLog .sm-think", { timeout: 1000 }).then(() => true, () => false);
    await p.waitForFunction(n => document.querySelectorAll("#sommLog .sm-a:not(.sm-think)").length > n && !document.querySelector("#sommLog .sm-think"), n, { timeout: 8000 });
    return { thinking, ms: Date.now() - t0 }; };
  const last = () => p.$$eval("#sommLog .sm-a", a => { const c = a[a.length - 1].cloneNode(true); c.querySelectorAll(".sm-lead,.sm-hint").forEach(x => x.remove()); return c.textContent; });
  const t1 = await ask("What grape is Sancerre?");
  check("it thinks before it answers: 'Thinking…', then the answer after about two seconds", t1.thinking && t1.ms >= 1400 && t1.ms < 3500, JSON.stringify(t1));
  check("answers an appellation", /Sauvignon Blanc/.test(await last()) && /Pinot Noir/.test(await last()));
  await ask("where is my rousseau");
  check("answers about the cellar, with the location", /Clos St-Jacques 2016.*Kælder, reol 3/.test(await last()), await last());
  await p.click("#sommChips button:nth-child(2)"); await p.waitForFunction(() => !document.querySelector("#sommLog .sm-think") && document.querySelectorAll("#sommLog .sm-q").length === document.querySelectorAll("#sommLog .sm-a:not(.sm-think)").length - 1, null, { timeout: 8000 });
  check("a suggestion can be clicked", /Côte de Nuits 2005: 98\/100/.test(await last()), await last());
  // a follow-up: the page hands the sommelier the previous question
  await ask("how long can I keep Barolo?");
  await ask("and Barbaresco?");
  check("a follow-up ('and Barbaresco?') answers from the question before", /^Barbaresco: typically at its best/.test((await last()).trim()), (await last()).slice(0, 120));
  await ask("tell me about Egon Müller");
  check("…and it knows producers beyond Burgundy (sommelier-world.js loads)", /Scharzhofberger/.test(await last()));
  // a long answer is shown from the question down, not scrolled to its end
  await ask("what should I drink now?");
  const view = await p.evaluate(() => { const log = document.getElementById("sommLog"), qs = log.querySelectorAll(".sm-q"), q = qs[qs.length - 1];
    const as = log.querySelectorAll(".sm-a"), an = as[as.length - 1];
    return { qTop: q.offsetTop - log.scrollTop, aTop: an.offsetTop - log.scrollTop, aBottom: an.offsetTop + an.offsetHeight - log.scrollTop, h: log.clientHeight }; });
  check("…the answer is read from its start, with the question above it", view.qTop >= -2 && view.aTop > view.qTop && view.aTop < view.h, JSON.stringify(view));
  const tone = await p.$$eval("#sommLog .sm-a", a => ({ leads: a.filter(x => x.querySelector(".sm-lead")).length, hints: a.filter(x => x.querySelector(".sm-hint")).length, n: a.length }));
  check("it talks like a person: an opening line on some answers", tone.leads >= 2, JSON.stringify(tone));
  check("the question is shown as typed, as text", (await p.$$eval("#sommLog .sm-q", q => q.map(x => x.innerHTML))).every(h => !/</.test(h)));
  await ask("<img src=x onerror=window.__x=1>");
  check("typed HTML stays text", await p.evaluate(() => !window.__x && !document.querySelector("#sommLog img")));
  check("nothing went to the server while asking", calls === before, `${calls - before} calls`);
  // in Danish: the answer and the atlas's Danish texts
  await p.evaluate(() => I18N.setLang("da")); await p.waitForTimeout(200);
  await ask("hvem ejer musigny");
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
