// Browser test of the fast login on an encrypted account (real Code.gs through gas-harness.js, every request delayed
// like Apps Script's 2–3 seconds, here 700 ms): a reload opens the cellar from the device's encrypted copy before any
// request returns, a login on a known device makes one request before the cellar shows, the server's newer copy
// replaces the device's in the background, a changed password still logs in, a lost session goes back to the login,
// "Stay signed in" sets how long a quiet session lasts, and signing out forgets the device's copy.
//   (cd .. && python3 -m http.server 8765) & node tools/fast-login-ui-test.js
"use strict";
const { chromium } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const LAG = 700;
let hold = null; // while set, every request waits for it: what shows then came from the device
const gas = H({ Ark1: [["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"]] },
              { settings: { SIGNUP_CODE: "invite" } });
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };

(async () => {
  const b = await chromium.launch();
  const device = async () => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
    const seen = [];
    await require("./turnstile-fake")(ctx);
    await ctx.route(require("./api-route"), async route => {
      const q = JSON.parse(route.request().postData() || "{}"); seen.push(q.action);
      if (hold) await hold.promise;
      await new Promise(r => setTimeout(r, LAG));
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(gas.call(q)) });
    });
    const p = await ctx.newPage(); const errs = [];
    p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
    return { ctx, p, seen, errs };
  };
  const A = await device(), p = A.p;
  const wines = pg => pg.$$eval("#tbl tr.main", rows => rows.map(r => r.textContent));
  const login = async (pg, pass) => { await pg.fill("#gateUser", "anna"); await pg.fill("#gatePass", pass); await pg.click("#gateSubmit"); };

  await p.goto(BASE); await p.waitForTimeout(300);
  check("'Stay signed in' is offered, ticked", await p.isVisible("#gateStay") && await p.isChecked("#gateStay"));
  await p.click("#gateToggle");
  await p.fill("#gateInvite", "invite"); await login(p, "anna-pass-1");
  await p.waitForSelector("#recModal.open", { timeout: 20000 }); await p.check("#recOk"); await p.click("#recDone");
  await p.waitForSelector("#app:not([hidden])", { timeout: 20000 });
  await p.click("#addBtn"); await p.fill("#aProducer", "Domaine Roulot"); await p.fill("#aName", "Meursault"); await p.fill("#aVintage", "2020");
  await p.click('#addForm button[type="submit"]'); await p.waitForFunction(() => document.querySelector("#tbl").textContent.includes("Roulot"), null, { timeout: 10000 });
  await p.waitForTimeout(2 * LAG + 300); // the save reaches the server

  // ── a reload: the cellar from the device's copy, before any request has come back ──
  A.seen.length = 0;
  hold = {}; hold.promise = new Promise(r => { hold.release = r; });
  const t0 = Date.now();
  await p.reload();
  const shown = await p.waitForFunction(() => document.querySelector("#tbl") && document.querySelector("#tbl").textContent.includes("Roulot"), null, { timeout: 10000 }).then(() => true, () => false);
  const reloadMs = Date.now() - t0;
  hold.release(); hold = null;
  check(`a reload shows the cellar while the server hasn't answered yet (${reloadMs} ms)`, shown);
  check("…without the password", !(await p.isVisible("#gate")) || await p.isHidden("#gate"));
  await p.waitForTimeout(LAG + 400);
  check("…and checks the server's copy in the background", A.seen.includes("vget"), JSON.stringify(A.seen));
  check("…while the device keeps only ciphertext", await p.evaluate(() => new Promise(res => {
    const r = indexedDB.open("allwine-cache", 1); r.onsuccess = () => { const g = r.result.transaction("vault").objectStore("vault").get("anna");
      g.onsuccess = () => { const s = JSON.stringify(g.result || {}); res(s.includes("v1.") && !/Roulot|Meursault/.test(s)); }; };
  })));

  // ── another device adds a wine; this one picks it up in the background ──
  const B = await device();
  await B.p.goto(BASE); await B.p.waitForTimeout(300); await login(B.p, "anna-pass-1");
  await B.p.waitForSelector("#app:not([hidden])", { timeout: 20000 });
  await B.p.click("#addBtn"); await B.p.fill("#aProducer", "Domaine Leflaive"); await B.p.fill("#aName", "Pucelles");
  await B.p.click('#addForm button[type="submit"]'); await B.p.waitForTimeout(3 * LAG + 500);
  await p.reload(); await p.waitForFunction(() => document.querySelector("#tbl").textContent.includes("Roulot"), null, { timeout: 10000 });
  const first = (await wines(p)).join(" ");
  await p.waitForFunction(() => document.querySelector("#tbl").textContent.includes("Leflaive"), null, { timeout: 6000 }).catch(() => {});
  check("the other device's wine appears once the server's copy is in", !first.includes("Leflaive") && (await wines(p)).join(" ").includes("Leflaive"), first);
  // a save made from an older copy still lands: B adds, A (not yet refreshed) adds too
  await B.p.click("#addBtn"); await B.p.fill("#aProducer", "Coche-Dury"); await B.p.click('#addForm button[type="submit"]'); await B.p.waitForTimeout(3 * LAG + 500);
  await p.click("#addBtn"); await p.fill("#aProducer", "Raveneau"); await p.click('#addForm button[type="submit"]');
  await p.waitForFunction(() => /Raveneau/.test(document.querySelector("#tbl").textContent) && /Coche-Dury/.test(document.querySelector("#tbl").textContent), null, { timeout: 15000 }).catch(() => {});
  const both = (await wines(p)).join(" ");
  check("…and a save from the older copy keeps both devices' wines", /Raveneau/.test(both) && /Coche-Dury/.test(both) && /Leflaive/.test(both), both);

  // ── a quiet session past its limit: one request before the cellar shows ──
  await p.evaluate(() => localStorage.setItem("vinActive", String(Date.now() - 31 * 24 * 3600e3)));
  await p.reload(); await p.waitForSelector("#gate:not([hidden])", { timeout: 5000 });
  check("after 30 quiet days the password is asked again", await p.isVisible("#gatePass"));
  A.seen.length = 0;
  const t1 = Date.now();
  await login(p, "anna-pass-1");
  await p.waitForFunction(() => document.querySelector("#tbl").textContent.includes("Raveneau") && !document.querySelector("#app").hidden, null, { timeout: 20000 })
    .catch(async e => { console.log("state when it timed out:", JSON.stringify({ err: await p.textContent("#gateErr"), app: await p.isVisible("#app"), seen: A.seen, tbl: (await p.textContent("#tbl")).slice(0, 300), errs: A.errs })); throw e; });
  const loginMs = Date.now() - t1, before = A.seen.slice();
  check(`a login on this device needs one request before the cellar shows (${loginMs} ms, ${LAG} a request)`, before[0] === "login" && !before.includes("prelogin"), JSON.stringify(before) + " " + loginMs + " ms");

  // ── the password changed on the other device: the remembered salt is stale, the login still works ──
  await B.p.click("#acctBtn"); await B.p.fill("#acctPass", "anna-pass-1"); await B.p.fill("#acctNew", "anna-pass-2");
  await B.p.click('#acctForm button[type="submit"]'); await B.p.waitForTimeout(6 * LAG + 1500);
  await p.click("#lockBtn").catch(() => {}); // sign-out here forgets the copy; put the old salt back to test the stale case
  await p.evaluate(() => localStorage.setItem("vinKdf:anna", JSON.stringify({ kdf: "pbkdf2-sha256-600000", kdfSalt: "AAAAAAAAAAAAAAAAAAAAAA==" })));
  check("signing out forgets the device's copy", await p.evaluate(() => new Promise(res => {
    const r = indexedDB.open("allwine-cache", 1); r.onsuccess = () => { const g = r.result.transaction("vault").objectStore("vault").get("anna"); g.onsuccess = () => res(!g.result); }; })));
  A.seen.length = 0;
  await login(p, "anna-pass-2");
  await p.waitForSelector("#app:not([hidden])", { timeout: 20000 });
  check("with a stale remembered salt the new password still logs in", JSON.stringify(A.seen.slice(0, 3)) === JSON.stringify(["login", "prelogin", "login"]), JSON.stringify(A.seen));
  await p.waitForFunction(() => document.querySelector("#tbl").textContent.includes("Raveneau"), null, { timeout: 10000 }).catch(() => {});
  check("…and opens the same cellar", (await wines(p)).join(" ").includes("Raveneau"));

  // ── the server dropped the session: back to the login, not a cellar that can't save ──
  await p.waitForTimeout(LAG + 300);
  gas.run(`usersSheet().getRange(findUser('anna').row, UCOL.Token).setValue('')`);
  await p.reload();
  await p.waitForSelector("#gate:not([hidden])", { timeout: 6000 }).catch(() => {});
  check("a session the server no longer knows goes back to the login", await p.isVisible("#gatePass"));

  // ── without 'Stay signed in', an hour's quiet signs out ──
  await p.uncheck("#gateStay"); await login(p, "anna-pass-2"); await p.waitForSelector("#app:not([hidden])", { timeout: 20000 });
  await p.evaluate(() => localStorage.setItem("vinActive", String(Date.now() - 2 * 3600e3)));
  await p.reload(); await p.waitForSelector("#gate:not([hidden])", { timeout: 5000 }).catch(() => {});
  check("unticked, two quiet hours ask for the password", await p.isVisible("#gatePass") && !(await p.isChecked("#gateStay")));
  await p.check("#gateStay"); await login(p, "anna-pass-2"); await p.waitForSelector("#app:not([hidden])", { timeout: 20000 });
  await p.evaluate(() => localStorage.setItem("vinActive", String(Date.now() - 2 * 3600e3)));
  await p.reload(); await p.waitForFunction(() => document.querySelector("#tbl").textContent.includes("Raveneau"), null, { timeout: 6000 }).catch(() => {});
  check("ticked, two quiet hours don't", !(await p.isVisible("#gatePass")) && (await wines(p)).join(" ").includes("Raveneau"));

  check("no console errors", !A.errs.length && !B.errs.length, A.errs.concat(B.errs).join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
