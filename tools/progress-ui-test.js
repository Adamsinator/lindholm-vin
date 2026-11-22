// Browser test that AllWine says what it's doing when something takes a while (app.js progressIn, atlas.js), against
// the real Code.gs (gas-harness.js) with a 2,500-wine cellar and, where it matters, a slowed-down server:
//   • a slow first load says so in words after 2 s; Show all on a big cellar says it's drawing them; Tidy up opens
//     saying it's looking through them; an export says it's preparing the file; the sommelier says it's getting its
//     notes; an atlas region says it's loading its map
//   (cd .. && python3 -m http.server 8765) & node tools/progress-ui-test.js
"use strict";
const { chromium } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];
const rows = Array.from({ length: 2500 }, (_, i) => ["Domaine " + (i % 300), "Frankrig", "Bourgogne", "", "Cuvée " + i, "", "Rød", "Pinot Noir", 2000 + i % 20, 1 + i % 3, 300, "", "", ""]);
(async () => {
  const b = await chromium.launch(), gas = H({ Ark1: [HEAD, ...rows] }), errs = [];
  const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } }); let slow = 0;
  await require("./turnstile-fake")(ctx);
  await ctx.route(require("./api-route"), async r => { const p = JSON.parse(r.request().postData() || "{}"); let x;
    if (p.action === "login") x = { ok: true, user: p.user, token: "tok", v: 26 }; else if (p.action === "prelogin") x = { ok: false, error: "bad-code" };
    else { delete p.user; delete p.token; p.code = "test-code"; x = gas.call(p); }
    if (slow && /data|journal|wish/.test(p.action)) await new Promise(ok => setTimeout(ok, slow));
    await r.fulfill({ contentType: "application/json", body: JSON.stringify(x) }); });
  const p = await ctx.newPage(); p.on("pageerror", e => errs.push(e.message));
  await p.goto(BASE); await p.fill("#gateUser", "adam"); await p.fill("#gatePass", "pw");
  slow = 3500; await p.click("#gateSubmit");
  await p.waitForTimeout(2600); const said = await p.isVisible("#spinSlow") && await p.textContent("#spinSlow");
  check("a slow first load: after 2 s it says so in words", /Still fetching your cellar/.test(said || ""), String(said));
  await p.waitForSelector("#content:not([hidden])", { timeout: 20000 }); slow = 0;
  check("…and the words go once the cellar is there", !(await p.isVisible("#spinSlow")));
  await p.waitForTimeout(500);
  // Show all
  // what the button said, caught as it changes (the table may be drawn before a look afterwards)
  await p.evaluate(() => { window.__said = []; new MutationObserver(() => { const b = document.querySelector("#rows tr.morerow button[data-all]"); if (b) window.__said.push(b.textContent); })
    .observe(document.getElementById("rows"), { subtree: true, childList: true, characterData: true }); });
  await p.click("#rows tr.morerow button[data-all]"); await p.waitForTimeout(100); const sa = (await p.evaluate(() => window.__said)).join(" | ");
  check("Show all on 2,500 wines: the button says it's drawing them", /Showing all 2[.,]?500/.test(sa), sa);
  await p.waitForFunction(() => document.querySelectorAll("#rows tr.main").length > 2000, null, { timeout: 30000 });
  // Tidy up
  await p.click("#tidyBtn"); await p.waitForSelector("#tidyModal.open", { timeout: 20000 });
  const ti = await p.textContent("#tidyProg");
  check("Tidy up on a big cellar opens saying it's looking through them", /Looking through 2[.,]?500 wines/.test(ti), ti);
  await p.waitForFunction(() => document.getElementById("tidyProg").hidden, null, { timeout: 30000 });
  check("…then fills in, the words gone", (await p.textContent("#tidyIntro")).length > 10);
  await p.click("#tidyCancel");
  // export
  slow = 800; await p.click("#expBtn"); await p.waitForSelector("#expModal.open"); await p.click("#expCsv"); await p.waitForTimeout(150);
  const ex = await p.textContent("#expCsv"); await p.waitForFunction(() => !document.getElementById("expModal").classList.contains("open"), null, { timeout: 20000 }).catch(() => {}); slow = 0;
  check("an export: the button says it's preparing the file, then is itself again", /Preparing the file/.test(ex) && !/Preparing/.test(await p.textContent("#expCsv")), ex);
  // the sommelier
  await p.route(/sommelier-data\.js/, async r => { await new Promise(ok => setTimeout(ok, 1200)); await r.continue(); });
  await p.click("#sommBtn"); await p.waitForTimeout(300); const so = await p.textContent("#sommLog");
  check("the sommelier's first open says it's getting its notes", /Getting the sommelier's notes/.test(so), so);
  await p.waitForFunction(() => !/Getting the sommelier/.test(document.getElementById("sommLog").textContent) && document.getElementById("sommLog").children.length, null, { timeout: 20000 });
  check("…then greets, the words gone", true);
  // the atlas
  const a = await b.newPage(); await a.route(/atlas-cotedor\.js/, async r => { await new Promise(ok => setTimeout(ok, 1500)); await r.continue(); });
  await a.goto(BASE + "atlas.html"); await a.waitForTimeout(600); await a.goto(BASE + "atlas.html#r=cotedor"); await a.waitForTimeout(500);
  const cr = await a.textContent("#crumb");
  check("an atlas region says it's loading its map", /Loading the map of Côte d'Or/.test(cr), cr);
  await a.waitForFunction(() => /vineyards/.test(document.getElementById("crumb").textContent), null, { timeout: 30000 });
  check("…then shows it", true);
  check("no page errors", !errs.length, errs.join(" | "));
  await b.close();
  const k = results.filter(Boolean).length; console.log(`\n${k}/${results.length} passed`); process.exit(k === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
