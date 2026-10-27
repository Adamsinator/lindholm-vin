// The 10,000-row list (tools/fixtures/big.xlsx) through the real Import dialog and Tidy up, against the real Code.gs
// (gas-harness.js): on a plain sheet, unmerged, in parts small enough for Apps Script's time limit, then tidied up; and
// into an encrypted cellar, merged, which must still open afterwards. Times each step and checks the page keeps up.
//   python3 tools/make-big-import.py; (cd .. && python3 -m http.server 8765) & node tools/big-import-ui-test.js
"use strict";
const fs = require("fs"), path = require("path");
const { chromium } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const FIX = path.join(__dirname, "fixtures", "big.xlsx");
if (!fs.existsSync(FIX)) require("child_process").execFileSync("python3", [path.join(__dirname, "make-big-import.py")]);
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const ms = t => ((Date.now() - t) / 1000).toFixed(1) + " s";

async function session(b, gas, plain) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const calls = [];
  await require("./turnstile-fake")(ctx);
  await ctx.route(require("./api-route"), async route => {
    const p = JSON.parse(route.request().postData() || "{}"); let r;
    if (plain && p.action === "login") r = { ok: true, user: p.user, token: "tok", v: 26 };
    else if (plain && p.action === "prelogin") r = { ok: false, error: "bad-code", v: 27 };
    else { if (plain) { delete p.user; delete p.token; p.code = "test-code"; } r = gas.call(p); }
    calls.push({ action: p.action, n: (p.wines || p.edits || p.groups || []).length, b: (p.bumps || []).length });
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(r) });
  });
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  await p.goto(BASE); await p.waitForTimeout(400);
  return { ctx, p, calls, errs };
}
async function importBig(p, merge) {
  await p.click("#impBtn"); await p.setInputFiles("#impFile", FIX);
  await p.waitForSelector("#impMap:not([hidden])", { timeout: 60000 });
  if (!merge) { await p.uncheck("#impMerge"); await p.waitForTimeout(300); }
  const label = await p.textContent("#impGo");
  const t = Date.now(); await p.click("#impGo");
  await p.waitForFunction(() => !document.getElementById("impModal").classList.contains("open"), null, { timeout: 300000, polling: 250 });
  return { label, took: Date.now() - t };
}

(async () => {
  const b = await chromium.launch();
  // ── plain sheet ──
  {
    const gas = H({ Ark1: [HEAD] });
    const { ctx, p, calls, errs } = await session(b, gas, true);
    await p.fill("#gateUser", "adam"); await p.fill("#gatePass", "pw"); await p.click("#gateSubmit");
    await p.waitForSelector("#app:not([hidden])", { timeout: 20000 });
    const { label, took } = await importBig(p, false);
    const adds = calls.filter(c => c.action === "addmany");
    check("plain: the dialog offers all 10,000 rows when not merging", /Import 10000 wines|Import 10.000 wines|Import 10,000 wines/.test(label), label);
    check("plain: sent in 25 parts of at most 400", adds.length === 25 && adds.every(c => c.n <= 400), JSON.stringify(adds.map(c => c.n)));
    check("plain: all of it is in the sheet", gas.rows("Ark1").length === 10001, String(gas.rows("Ark1").length));
    console.log("      import", (took / 1000).toFixed(1), "s");
    const shown = await p.$$eval("#rows tr.main", r => r.length);
    check("plain: the table shows a page, with Show more", shown <= 101 && /Showing 100 of/.test(await p.textContent("#rows tr.morerow")), String(shown));
    let t = Date.now(); await p.click("#rows tr.morerow button[data-all]"); await p.waitForTimeout(100);
    const all = await p.$$eval("#rows tr.main", r => r.length);
    console.log("      show all", ms(t), all, "rows");
    t = Date.now(); await p.fill("#q", "Krug"); await p.waitForFunction(() => document.querySelectorAll("#rows tr.main").length < 2000, null, { timeout: 20000 });
    check("plain: search starts again from the top and stays quick", Date.now() - t < 3000 && (await p.$$eval("#rows tr.main", r => r.length)) <= 201, ms(t));
    // opening a wine builds its details then
    await p.click("#rows tr.main >> nth=0"); await p.waitForTimeout(200);
    check("plain: a wine's details are built when it's opened", await p.isVisible("#rows tr.detail:not([hidden]) button.drink"));
    await p.fill("#q", "");
    // Tidy up the 10,000 rows: thousands of merges, in parts
    calls.length = 0; t = Date.now();
    await p.click("#tidyBtn"); await p.waitForSelector("#tidyModal.open"); await p.waitForTimeout(500);
    await p.click("#tidyGo"); await p.waitForFunction(() => !document.getElementById("tidyModal").classList.contains("open"), null, { timeout: 300000, polling: 250 });
    const merges = calls.filter(c => c.action === "mergerows"), edits = calls.filter(c => c.action === "setinfomany");
    const data = gas.call({ code: "test-code", action: "data" }).wines;
    const bottles = data.reduce((s, w) => s + w.qty, 0);
    console.log("      tidy up", ms(t), `· ${edits.length} edit parts (${edits.reduce((s, c) => s + c.n, 0)}), ${merges.length} merge parts (${merges.reduce((s, c) => s + c.n, 0)} groups) → ${data.length} rows`);
    check("plain: Tidy up merges in parts of at most 300", merges.length > 1 && merges.every(c => c.n <= 300) && edits.every(c => c.n <= 800), JSON.stringify(merges.map(c => c.n)));
    const keys = new Set(data.map(w => [w.producer, w.name, w.vintage, w.size].join("|").toLowerCase()));
    check("plain: afterwards each wine is one row, with all 37,477 bottles", keys.size === data.length && bottles === 37477, `${keys.size} keys, ${data.length} rows, ${bottles} bottles`);
    check("plain: no page errors", !errs.length, errs.slice(0, 3).join(" | "));
    await ctx.close();
  }
  // ── encrypted cellar ──
  {
    const gas = H({ Ark1: [HEAD] }, { settings: { SIGNUP_CODE: "invite" } });
    const { ctx, p, calls, errs } = await session(b, gas, false);
    await p.click("#gateToggle");
    await p.fill("#gateUser", "vera"); await p.fill("#gatePass", "vera-pass-1"); await p.fill("#gateInvite", "invite"); await p.fill("#gatePass2", "vera-pass-1"); await p.fill("#gateEmail", "someone@example.com");
    await p.click("#gateSubmit");
    await p.waitForSelector("#recModal.open", { timeout: 20000 }); await p.check("#recOk"); await p.click("#recDone");
    await p.waitForSelector("#app:not([hidden])", { timeout: 20000 });
    const { label, took } = await importBig(p, true);
    console.log("      encrypted import", (took / 1000).toFixed(1), "s,", label);
    const n = await p.evaluate(() => VAULT.call({ action: "data" }).then(r => r.wines.length));
    check("encrypted: the merged list is in (5,321 wines)", n === 5321, String(n));
    check("encrypted: the vault is saved to the server, not the plain tab", calls.some(c => c.action === "vput") && gas.rows("Ark1").length <= 1, JSON.stringify([...new Set(calls.map(c => c.action))]));
    // log in again: the big vault downloads and decrypts
    await p.click("#lockBtn"); await p.waitForTimeout(500);
    await p.goto(BASE); await p.waitForTimeout(400);
    if (await p.isVisible("#gateUser")) {
      await p.fill("#gateUser", "vera"); await p.fill("#gatePass", "vera-pass-1");
      const t = Date.now(); await p.click("#gateSubmit"); await p.waitForSelector("#rows tr.main", { timeout: 60000 });
      console.log("      log in to a 5,321-wine encrypted cellar", ms(t));
      check("encrypted: it opens again after logging in", /5321 wines|5.321 wines|5,321 wines/.test(await p.textContent("#count")), await p.textContent("#count"));
    } else check("encrypted: it opens again after logging in", false, "no login form");
    check("encrypted: no page errors", !errs.length, errs.slice(0, 3).join(" | "));
    await ctx.close();
  }
  await b.close();
  const k = results.filter(Boolean).length; console.log(`\n${k}/${results.length} passed`); process.exit(k === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
