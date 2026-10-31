// Browser test of the cellar app as an installed, offline app (atlas-sw.js, the site's service worker): after one visit
// online, the cellar opens with the network gone, from the device's encrypted copy and the worker's cached files, with
// its wines; back online, it's all still there. A service worker needs a secure origin: Chromium is told to treat
// http://127.0.0.1 as one (app.js leaves the worker off on localhost, where the other tests run).
//   (cd .. && python3 -m http.server 8765) & node tools/offline-ui-test.js
"use strict";
const { chromium } = require("./pw");
const H = require("./gas-harness");
const ORIGIN = (process.env.BASE || "http://localhost:8765/").replace("localhost", "127.0.0.1").replace(/\/$/, ""), BASE = ORIGIN + "/";
const gas = H({ Ark1: [["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"]] },
              { settings: { SIGNUP_CODE: "invite" } });
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };

(async () => {
  const b = await chromium.launch({ args: [`--unsafely-treat-insecure-origin-as-secure=${ORIGIN}`] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await require("./turnstile-fake")(ctx);
  let offline = false;
  await ctx.route(require("./api-route"), async r => { if (offline) return r.abort("internetdisconnected");
    await r.fulfill({ contentType: "application/json", body: JSON.stringify(gas.call(JSON.parse(r.request().postData() || "{}"))) }); });
  const p = await ctx.newPage(), errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("dialog", d => d.accept());
  await p.goto(BASE); await p.waitForTimeout(800);
  await p.click("#gateToggle");
  await p.fill("#gateUser", "anna"); await p.fill("#gatePass", "anna-pass-1"); await p.fill("#gateInvite", "invite"); await p.fill("#gatePass2", "anna-pass-1"); await p.fill("#gateEmail", "a@example.com");
  await p.click("#gateSubmit"); await p.waitForSelector("#recModal.open", { timeout: 20000 }); await p.check("#recOk"); await p.click("#recDone");
  await p.waitForSelector("#app:not([hidden])", { timeout: 20000 });
  await p.click("#addBtn"); await p.fill("#aProducer", "Domaine Roulot"); await p.fill("#aName", "Meursault Perrières"); await p.fill("#aVintage", "2020");
  await p.click('#addForm button[type="submit"]'); await p.waitForTimeout(1500);
  check("the site's service worker is installed from the cellar page", await p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!(r && r.active); }));
  await p.reload(); await p.waitForTimeout(2500); // the worker serves this load, and keeps what it serves
  check("…and serves the page on the next visit", await p.evaluate(() => !!navigator.serviceWorker.controller));
  offline = true; await ctx.setOffline(true);
  await p.reload().catch(e => errs.push("reload: " + e.message)); await p.waitForTimeout(3500);
  const off = await p.evaluate(() => ({ app: !document.getElementById("app").hidden, gate: !document.getElementById("gate").hidden, tbl: document.getElementById("tbl").textContent }));
  check("offline: the cellar opens, not the login, with its wines", off.app && !off.gate && /Domaine Roulot/.test(off.tbl), JSON.stringify({ app: off.app, gate: off.gate }));
  await ctx.setOffline(false); offline = false; await p.reload(); await p.waitForTimeout(2500);
  check("back online: still logged in, nothing lost", await p.evaluate(() => !document.getElementById("app").hidden && /Domaine Roulot/.test(document.getElementById("tbl").textContent)));
  check("no page errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
