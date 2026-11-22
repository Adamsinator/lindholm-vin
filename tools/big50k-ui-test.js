// A 50,000-row list (tools/fixtures/big50000.xlsx: the 10,000-row test's 7,000 wines, repeated as a merchant's export
// would) through the real Import dialog against the real Code.gs (gas-harness.js), on a plain sheet:
//   • joined (the default): every row is read and every bottle arrives, as one row per wine; the cap of 25,000 new rows
//     counts wines after joining (before, the file was cut at 25,000 rows and half its bottles left out)
//   • not joined: 25,000 rows go in, and the dialog says so
//   • the parts but the last don't ask for the whole cellar back (API 66: quiet)
//   python3 tools/make-big-import.py 50000; (cd .. && python3 -m http.server 8765) & node tools/big50k-ui-test.js
"use strict";
const fs = require("fs"), path = require("path");
const { chromium } = require("./pw");
const H = require("./gas-harness");
global.window = global.window || {};
const I = require("../import.js");
const BASE = process.env.BASE || "http://localhost:8765/";
const FIX = path.join(__dirname, "fixtures", "big50000.xlsx");
if (!fs.existsSync(FIX)) require("child_process").execFileSync("python3", [path.join(__dirname, "make-big-import.py"), "50000"]);
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const ms = t => ((Date.now() - t) / 1000).toFixed(1) + " s";

async function session(b, gas) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }), calls = [];
  await require("./turnstile-fake")(ctx);
  await ctx.route(require("./api-route"), async route => {
    const p = JSON.parse(route.request().postData() || "{}"); let r;
    if (p.action === "login") r = { ok: true, user: p.user, token: "tok", v: 26 };
    else if (p.action === "prelogin") r = { ok: false, error: "bad-code", v: 27 };
    else { delete p.user; delete p.token; p.code = "test-code"; r = gas.call(p); }
    calls.push({ action: p.action, n: (p.wines || []).length, wines: !!r.wines });
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(r) });
  });
  const p = await ctx.newPage(), errs = [];
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  await p.goto(BASE); await p.waitForTimeout(400);
  await p.fill("#gateUser", "adam"); await p.fill("#gatePass", "pw"); await p.click("#gateSubmit");
  await p.waitForSelector("#app:not([hidden])", { timeout: 20000 });
  return { ctx, p, calls, errs };
}
async function openFile(p) { await p.click("#impBtn"); await p.setInputFiles("#impFile", FIX); await p.waitForSelector("#impMap:not([hidden])", { timeout: 120000 }); await p.waitForTimeout(300); }
const go = async p => { const t = Date.now(); await p.click("#impGo"); await p.waitForFunction(() => !document.getElementById("impModal").classList.contains("open"), null, { timeout: 600000, polling: 250 }); return ms(t); };

(async () => {
  // what the file holds, read as the dialog reads it
  const buf = fs.readFileSync(FIX), book = await I.read({ name: "big50000.xlsx", size: buf.length, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) });
  const rows = book.sheets[0].rows, tb = I.table(rows), built = I.build(rows, tb.header, tb.columns.map(c => c.field));
  const inFile = built.wines.reduce((s, w) => s + w.qty, 0);
  check("every one of the 50,000 rows is read (the file was cut at 25,000)", built.wines.length === 50000 && !built.truncated, built.wines.length + " " + built.truncated);
  const b = await chromium.launch();
  {
    const gas = H({ Ark1: [HEAD] }), { ctx, p, calls, errs } = await session(b, gas);
    await p.click("#impBtn"); await p.setInputFiles("#impFile", FIX); await p.waitForTimeout(150);
    const reading = await p.textContent("#impProg"); await p.waitForSelector("#impMap:not([hidden])", { timeout: 120000 }); await p.waitForTimeout(300);
    check("opening the file: the dialog says it's reading it, then how many rows it's joining", /Reading big50000\.xlsx|Read 50[.,]?0\d\d rows/.test(reading), reading);
    const label = await p.textContent("#impGo"), n = Number(label.replace(/\D/g, ""));
    await p.click("#impGo"); await p.waitForTimeout(80); const sending = await p.textContent("#impProg");
    await p.waitForFunction(() => !document.getElementById("impModal").classList.contains("open"), null, { timeout: 600000, polling: 250 });
    check("sending: the dialog counts the wines as they go, with a bar", /Importing… [\d.,]+ of [\d.,]+/.test(sending), sending);
    const took = "–", data = gas.call({ code: "test-code", action: "data" }).wines, bottles = data.reduce((s, w) => s + w.qty, 0);
    const adds = calls.filter(c => c.action === "addmany");
    console.log(`      joined: ${label} in ${took}, ${adds.length} parts → ${data.length} rows, ${bottles} bottles (the file: ${inFile})`);
    check("joined: one row per wine, a few thousand, well under the cap", n > 5000 && n < 7100 && data.length === n, label + " " + data.length);
    check("…and every bottle in the file arrives", bottles === inFile, bottles + " vs " + inFile);
    check("…only the last part asks for the cellar back", adds.length > 1 && adds.slice(0, -1).every(c => !c.wines) && adds[adds.length - 1].wines, JSON.stringify(adds.map(c => c.wines)));
    check("…and the page shows them all", new RegExp(String(n).replace(/\B(?=(\d{3})+$)/g, "[.,]?")).test(await p.textContent("#count")), await p.textContent("#count"));
    check("joined: no page errors", !errs.length, errs.slice(0, 3).join(" | "));
    await ctx.close();
  }
  {
    const gas = H({ Ark1: [HEAD] }), { ctx, p, errs } = await session(b, gas);
    await openFile(p); await p.uncheck("#impMerge"); await p.waitForTimeout(50); const busy = await p.textContent("#impProg"); await p.waitForFunction(() => document.getElementById("impProg").hidden, null, { timeout: 60000 });
    const label = await p.textContent("#impGo"), sum = await p.textContent("#impSum");
    check("not joined: while it goes through the 50,000 rows again, the dialog says so", /Going through 50[.,]?0\d\d rows/.test(busy), busy);
    check("not joined: 25,000 rows offered, and the dialog says why", /Import 25[.,]?000 wines/.test(label) && /Only the first 25[.,]?000 wines are imported at a time/.test(sum), label + " | " + sum);
    const took = await go(p);
    console.log(`      not joined: ${label} in ${took}`);
    check("not joined: 25,000 rows in the sheet", gas.rows("Ark1").length === 25001, String(gas.rows("Ark1").length));
    check("not joined: no page errors", !errs.length, errs.slice(0, 3).join(" | "));
    await ctx.close();
  }
  await b.close();
  const k = results.filter(Boolean).length; console.log(`\n${k}/${results.length} passed`); process.exit(k === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
