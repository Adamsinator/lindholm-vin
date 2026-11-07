// Test data for test accounts (testkit.js): a username starting with "test" gets a Test data button (and an entry in
// the phone's ⋯ menu); others don't. It fills the cellar with exactly the number of bottles asked for, and gives a
// messy sheet (headings in three languages, prices as text, repeated headings, blank rows, a totals line) that the
// import then reads: every heading that means something mapped, the junk rows skipped, the wines in.
//   (cd .. && python3 -m http.server 8765) & node tools/testkit-ui-test.js
"use strict";
const { chromium, devices } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];

let GAS = null;
async function signup(b, devOpt, user) {
  const gas = H({ Ark1: [HEAD] }, { settings: { SIGNUP_CODE: "invite" } }); GAS = gas; const ctx = await b.newContext({ acceptDownloads: true, ...devOpt });
  await require("./turnstile-fake")(ctx);
  await ctx.route(require("./api-route"), async route => { const q = JSON.parse(route.request().postData() || "{}"); await route.fulfill({ contentType: "application/json", body: JSON.stringify(gas.call(q)) }); });
  const p = await ctx.newPage(), errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  await p.goto(BASE); await p.waitForTimeout(400);
  await p.click("#gateToggle"); await p.fill("#gateUser", user); await p.fill("#gatePass", user + "-pass-1"); await p.fill("#gateInvite", "invite"); await p.fill("#gatePass2", user + "-pass-1"); await p.fill("#gateEmail", "someone@example.com"); await p.click("#gateSubmit");
  await p.waitForSelector("#recModal.open", { timeout: 20000 }); await p.check("#recOk"); await p.click("#recDone");
  await p.waitForSelector("#app:not([hidden])", { timeout: 20000 }); await p.waitForTimeout(1200);
  return { ctx, p, errs };
}
const bottles = p => p.evaluate(() => WINES.reduce((s, w) => s + w.left, 0));

(async () => {
  const b = await chromium.launch();
  // an ordinary account: no button, the file isn't even loaded
  const o = await signup(b, { viewport: { width: 1300, height: 900 } }, "ida");
  check("an ordinary account has no Test data button (testkit.js not loaded)", !(await o.p.$("#testBtn")) && !(await o.p.evaluate(() => !!window.TESTKIT)));
  await o.ctx.close();

  const { p, errs } = await signup(b, { viewport: { width: 1300, height: 900 } }, "testkim");
  await p.waitForSelector("#testBtn", { timeout: 5000 }).catch(() => {});
  check("a test account has the Test data button", !!(await p.$(".actions #testBtn")));
  await p.click("#testBtn"); await p.waitForSelector("#testModal.open");
  await p.fill("#testN", "0"); await p.click("#testFill");
  check("0 bottles is refused with a message", /A number from 1 to/.test(await p.textContent("#testErr")) && (await bottles(p)) === 0);
  await p.fill("#testN", "750"); await p.click("#testFill");
  await p.waitForFunction(() => !document.getElementById("testModal").classList.contains("open"), null, { timeout: 30000 }).catch(async e => { console.log("dialog:", await p.textContent("#testErr"), errs); throw e; });
  await p.waitForTimeout(500);
  const n = await bottles(p);
  check("asking for 750 bottles puts exactly 750 in the cellar", n === 750, String(n));
  check("…shown in the list and the overview", await p.evaluate(() => document.querySelectorAll("#rows tr.main").length > 0));

  // waiting: with the server slow, a click's call shows the bottle draining into a glass until the answer comes
  await p.waitForFunction(() => !!document.getElementById("busy"), null, { timeout: 5000 });
  await p.context().route(require("./api-route"), async route => { await new Promise(r => setTimeout(r, 1200)); await route.fallback(); });
  await p.click("#testBtn"); await p.fill("#testN", "5"); await p.click("#testFill");
  await p.waitForTimeout(700);
  const busy = await p.evaluate(() => { const b = document.getElementById("busy"); return { on: !b.hidden, svg: !!b.querySelector("svg animate"), text: b.textContent.trim() }; });
  check("a slow answer after a click: the waiting bottle and glass show, with words for screen readers", busy.on && busy.svg && /moment/i.test(busy.text), JSON.stringify(busy));
  await p.waitForFunction(() => !document.getElementById("testModal").classList.contains("open"), null, { timeout: 30000 });
  check("…and go when it's done", await p.evaluate(() => document.getElementById("busy").hidden));
  await p.evaluate(() => api({ action: "me" })); // not from a click (more than a second and a half after): no waiting shown
  check("a call behind the scenes shows nothing", await p.evaluate(async () => { await new Promise(r => setTimeout(r, 1700)); const t = api({ action: "me" }); await new Promise(r => setTimeout(r, 500)); const on = !document.getElementById("busy").hidden; await t; return !on; }));
  await p.context().unroute(require("./api-route"));
  await p.context().route(require("./api-route"), async route => { const q = JSON.parse(route.request().postData() || "{}"); await route.fulfill({ contentType: "application/json", body: JSON.stringify(GAS.call(q)) }); });
  // the messy sheet: download, then import it
  await p.click("#testBtn"); await p.fill("#testRows", "400");
  const dl = p.waitForEvent("download"); await p.click("#testXlsx"); const f = await dl, file = await f.path();
  check("the messy sheet downloads as .xlsx", /^messy-cellar-400\.xlsx$/.test(f.suggestedFilename()), f.suggestedFilename());
  await p.click("#testClose");
  await p.click("#impBtn"); await p.setInputFiles("#impFile", file); await p.waitForSelector("#impMap:not([hidden])");
  const map = await p.evaluate(() => IMP.fields);
  const want = ["producer", "name", "vintage", "qty", "price", "country", "region", "commune", "type", "grape", "window", "location", "note"];
  check("every heading that means something is mapped (Vinproducent, Ant., Jahrgang, Pris pr. fl., Hvor? …)", want.every((x, i) => map[i] === x), JSON.stringify(map));
  const sum = await p.textContent("#impSum");
  check("…the repeated headings and the totals line aren't counted as wines", !/I alt/.test(await p.textContent("#impPrev")) && /wines/.test(sum), sum);
  const before = await p.evaluate(() => WINES.length);
  const goN = Number(((await p.textContent("#impGo")).match(/[\d.,]+/) || ["0"])[0].replace(/\D/g, ""));
  await p.click("#impGo"); await p.waitForFunction(() => !document.getElementById("impModal").classList.contains("open"), null, { timeout: 30000 }); await p.waitForTimeout(500);
  const after = await p.evaluate(() => WINES.length), toastN = Number(((await p.textContent("#toast")).match(/[\d.,]+/) || ["0"])[0].replace(/\D/g, ""));
  // real producers: some rows are wines already in the cellar, and add their bottles to them instead of a new line
  check("the import takes in the wines it offered (300 or more of the 400 rows; new lines, or bottles added to wines already there)",
    goN >= 300 && toastN === goN && after > before && after - before <= goN, `${goN} offered, ${toastN} imported, ${after - before} new lines`);
  const price = await p.evaluate(() => WINES.filter(w => w.price > 0).length / WINES.length);
  check("prices written as text (\"1.234,00 kr.\", \"DKK 450\", \"450,-\") were read as numbers", price > .8, String(price));
  check("no errors on the computer", !errs.length, errs.slice(0, 3).join(" | "));

  // a phone: the ⋯ menu has it
  const m = await signup(b, { ...devices["iPhone 13"] }, "TestPhone");
  await m.p.waitForFunction(() => !!document.getElementById("testBtn"), null, { timeout: 5000 }).catch(() => {});
  await m.p.click("#pMore"); await m.p.waitForSelector("#moreSheet.open");
  const item = await m.p.$('#moreMenu [data-press="testBtn"]');
  check("on a phone, the ⋯ menu offers Test data (the username's case doesn't matter)", !!item);
  if (item) { await item.click(); await m.p.waitForSelector("#testModal.open", { timeout: 3000 }).catch(() => {}); }
  check("…and opens its dialog", await m.p.evaluate(() => document.getElementById("testModal").classList.contains("open")));
  check("no errors on the phone", !m.errs.length, m.errs.slice(0, 3).join(" | "));
  await b.close();
  const pass = results.filter(Boolean).length; console.log(`\n${pass}/${results.length} passed`); process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
