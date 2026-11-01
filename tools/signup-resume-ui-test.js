// Browser test of sign-up on a phone that leaves the page to save the recovery code in a password manager, against
// the real Code.gs (gas-harness.js). Two things go wrong on real phones, and neither may leave a page that doesn't load:
//   • the phone reloads the page while the code is on screen: the login then says the account was made, with the
//     username filled in, and logging in works
//   • Safari leaves IndexedDB hanging after the browser was in the background: sign-up, a reload and a later login
//     still get through (the device's copy and the kept key are a convenience, not a must)
//   (cd .. && python3 -m http.server 8765) & node tools/signup-resume-ui-test.js
"use strict";
const press = require("./press"); // a phone presses some buttons through ＋, the tabs or a menu
const { chromium } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];

async function phone(b, gas, hangIDB) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await require("./turnstile-fake")(ctx);
  await ctx.route(require("./api-route"), async route => { const q = JSON.parse(route.request().postData() || "{}");
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(gas.call(q)) }); });
  // an IndexedDB that never answers, as Safari's can after the browser was in the background
  if (hangIDB) await ctx.addInitScript(() => { indexedDB.open = () => ({}); });
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  return { ctx, p, errs };
}
async function signUp(p, user, pass) {
  await p.goto(BASE); await p.waitForTimeout(400);
  await p.click("#gateToggle"); await p.fill("#gateUser", user); await p.fill("#gatePass", pass); await p.fill("#gateInvite", "invite"); await p.fill("#gatePass2", pass); await p.fill("#gateEmail", "someone@example.com"); await p.click("#gateSubmit");
  await p.waitForSelector("#recModal.open", { timeout: 20000 });
}
const shown = p => p.evaluate(() => ({ gate: !document.getElementById("gate").hidden, app: !document.getElementById("app").hidden }));

(async () => {
  const b = await chromium.launch();

  // ── the page reloads while the recovery code is on screen ──
  { const gas = H({ Ark1: [HEAD] }, { settings: { SIGNUP_CODE: "invite" } });
    const { ctx, p, errs } = await phone(b, gas, false);
    await signUp(p, "frede", "frede-pass-1");
    await p.reload(); await p.waitForTimeout(1500);
    const s = await shown(p), msg = await p.textContent("#gateErr");
    check("a reload during the recovery code lands on the login, not a blank page", s.gate && !s.app, JSON.stringify(s));
    check("…which says the account was made and fills in the username", /frede is created/.test(msg) && (await p.inputValue("#gateUser")) === "frede", msg);
    check("…and points to a new recovery code under Account", /new one under Account/.test(msg));
    await p.fill("#gatePass", "frede-pass-1"); await p.click("#gateSubmit");
    check("…and logging in opens the new cellar", await p.waitForSelector("#app:not([hidden])", { timeout: 20000 }).then(() => true, () => false));
    await press(p, "#acctBtn"); await p.waitForTimeout(200);
    check("…where Account has 'New recovery code'", await p.isVisible("#acctRec"));
    await p.keyboard.press("Escape");
    await press(p, "#lockBtn"); await p.waitForTimeout(400); await p.reload(); await p.waitForTimeout(800);
    check("the note shows only once (not after a later logout and reload)", !/is created/.test(await p.textContent("#gateErr")), await p.textContent("#gateErr"));
    check("no console errors", !errs.length, errs.join(" | "));
    await ctx.close(); }

  // ── IndexedDB hangs ──
  { const gas = H({ Ark1: [HEAD] }, { settings: { SIGNUP_CODE: "invite" } });
    const { ctx, p, errs } = await phone(b, gas, true);
    await signUp(p, "gerda", "gerda-pass-1");
    await p.check("#recOk"); const t0 = Date.now(); await p.click("#recDone");
    const opened = await p.waitForSelector("#app:not([hidden])", { timeout: 20000 }).then(() => true, () => false);
    check(`with IndexedDB hanging, sign-up still opens the cellar (in ${((Date.now() - t0) / 1000).toFixed(1)} s)`, opened);
    if (!opened) { console.log("(the cellar never opened: the rest can't run)"); await b.close(); process.exit(1); }
    await press(p, "#addBtn"); await p.fill("#aProducer", "Domaine Roulot"); await p.click('#addForm button[type="submit"]');
    check("…and a wine can be added", await p.waitForFunction(() => document.querySelector("#tbl").textContent.includes("Roulot"), null, { timeout: 15000 }).then(() => true, () => false));
    await p.reload();
    const back = await p.waitForFunction(() => !document.getElementById("gate").hidden || !document.getElementById("app").hidden, null, { timeout: 15000 }).then(() => true, () => false);
    check("…a reload shows the login or the cellar, never a page that doesn't load", back, JSON.stringify(await shown(p)));
    if (!(await shown(p)).app) { await p.fill("#gateUser", "gerda"); await p.fill("#gatePass", "gerda-pass-1"); await p.click("#gateSubmit"); }
    const again = await p.waitForSelector("#app:not([hidden])", { timeout: 25000 }).then(() => true, () => false);
    check("…and the cellar opens again, with the wine", again && await p.waitForFunction(() => document.querySelector("#tbl").textContent.includes("Roulot"), null, { timeout: 15000 }).then(() => true, () => false));
    check("no console errors", !errs.length, errs.join(" | "));
    await ctx.close(); }

  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
