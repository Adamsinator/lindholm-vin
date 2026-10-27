// Browser test of the account pieces of the cellar page, against the real Code.gs (gas-harness.js): the language
// picker in the top bar, dialog titles that follow it while open, Google's error texts in plain words, the privacy
// page, and "Delete my account" — which leaves nothing of the account on the server or in the browser.
//   (cd .. && python3 -m http.server 8765) & node tools/account-ui-test.js
"use strict";
const { chromium } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const gas = H({ Ark1: [["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"]] },
              { settings: { SIGNUP_CODE: "invite" } });
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await require("./turnstile-fake")(ctx);
  await ctx.route(require("./api-route"), async route => { const q = JSON.parse(route.request().postData() || "{}");
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(gas.call(q)) }); });
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  p.on("dialog", d => d.accept());
  await p.goto(BASE); await p.waitForTimeout(400);
  await p.click("#gateToggle");
  await p.fill("#gateUser", "cleo"); await p.fill("#gatePass", "cleo-pass-1"); await p.fill("#gateInvite", "invite"); await p.fill("#gatePass2", "cleo-pass-1"); await p.fill("#gateEmail", "someone@example.com"); await p.click("#gateSubmit");
  await p.waitForSelector("#recModal.open", { timeout: 20000 }); await p.check("#recOk"); await p.click("#recDone");
  await p.waitForSelector("#app:not([hidden])", { timeout: 20000 });

  // ── the language picker in the top bar ──
  check("the top bar has the language picker once logged in", await p.isVisible("header.top .langpick") && (await p.$$("header.top .langpick button")).length === 4);
  await p.click('header.top .langpick button[data-lang="da"]'); await p.waitForTimeout(200);
  check("…and it switches the page to Danish", (await p.textContent('.tab[data-page="cellar"]')).trim() === "Kælder");
  await p.click('header.top .langpick button[data-lang="en"]'); await p.waitForTimeout(200);

  // ── a dialog title follows the picker while the dialog is open ──
  await p.click('.tab[data-page="wishlist"]'); await p.waitForTimeout(300);
  await p.click("#wAddBtn"); await p.waitForTimeout(200);
  check("the wishlist dialog opens in English", (await p.textContent("#wTitle")).trim() === "Add to wishlist");
  await p.evaluate(() => I18N.setLang("da")); await p.waitForTimeout(200);
  check("…and its title turns Danish while open", (await p.textContent("#wTitle")).trim() === "Tilføj til ønskelisten", await p.textContent("#wTitle"));
  await p.evaluate(() => I18N.setLang("en")); await p.keyboard.press("Escape"); await p.waitForTimeout(150);

  // ── error texts ──
  const said = await p.evaluate(() => [
    errText(new Error("Exception: Service invoked too many times for one day: urlfetch.")),
    errText(new Error("Error: Exception: You do not have permission to call SpreadsheetApp.openById")),
    errText(new Error("too-many")), errText(new Error("stale")), errText(new Error("Failed to fetch")), errText(new Error("bad-row 7")),
  ]);
  check("Google's quota and timeout messages read as plain words", /Google's servers are busy/.test(said[0]), said[0]);
  check("…and a permission error too", /isn't allowed to do that/.test(said[1]), said[1]);
  check("…the API's own codes", /a lot in a short time/.test(said[2]) && /another device/.test(said[3]) && /didn't answer/.test(said[4]), said.slice(2, 5).join(" | "));
  check("…anything else as it came", said[5] === "bad-row 7");
  await p.evaluate(() => I18N.setLang("da"));
  check("…in the chosen language", /Googles servere/.test(await p.evaluate(() => errText(new Error("Exception: Service invoked too many times")))));
  await p.evaluate(() => I18N.setLang("en"));

  // ── the privacy page ──
  check("the Account dialog links to the privacy page", await p.evaluate(() => !!document.querySelector('#acctModal a[href="privacy.html"]')));
  const pv = await ctx.newPage(); const pvErrs = []; pv.on("console", m => m.type() === "error" && pvErrs.push(m.text()));
  await pv.goto(BASE + "privacy.html"); await pv.waitForTimeout(300);
  check("the privacy page opens, says where data lives and how to delete it", /Google Drive/.test(await pv.textContent("body")) && /Delete my account/.test(await pv.textContent("body")));
  await pv.click('.langpick button[data-lang="da"]'); await pv.waitForTimeout(200);
  check("…in Danish too", (await pv.textContent("h1")).trim() === "Privatliv" && /Datatilsynet/.test(await pv.textContent("body")));
  check("…with no errors under its CSP", !pvErrs.length, pvErrs.join(" | "));
  await pv.evaluate(() => I18N.setLang("en")); await pv.close();

  // ── delete my account ──
  await p.click('.tab[data-page="cellar"]');
  await p.click("#addBtn"); await p.fill("#aProducer", "Domaine Roulot"); await p.click('#addForm button[type="submit"]'); await p.waitForTimeout(800);
  await p.click("#acctBtn"); await p.waitForTimeout(150);
  await p.click("#acctDelete"); await p.waitForTimeout(200);
  check("deleting asks for the password first", /current password/i.test(await p.textContent("#acctErr")) && gas.rows("Users").some(r => r[0] === "cleo"));
  await p.fill("#acctPass", "wrong-password"); await p.click("#acctDelete"); await p.waitForTimeout(1500);
  check("…a wrong one is refused and nothing is deleted", /Wrong username or password/.test(await p.textContent("#acctErr")) && gas.rows("Users").some(r => r[0] === "cleo"), await p.textContent("#acctErr"));
  await p.fill("#acctPass", "cleo-pass-1"); await p.click("#acctDelete");
  await p.waitForSelector("#gate:not([hidden])", { timeout: 15000 }).catch(() => {});
  check("with the right one the account is deleted and the login shows", await p.isVisible("#gatePass") && /deleted/.test(await p.textContent("#gateErr")) && !gas.rows("Users").some(r => r[0] === "cleo"), await p.textContent("#gateErr"));
  const left = await p.evaluate(() => new Promise(res => {
    const keys = Object.keys(localStorage).filter(k => /^vin(Feed|Kdf|Token|User|Vault)/.test(k));
    const r = indexedDB.open("allwine-cache", 1); r.onsuccess = () => { const g = r.result.transaction("vault").objectStore("vault").get("cleo"); g.onsuccess = () => res({ keys, cache: !!g.result }); };
  }));
  check("…and nothing of it is left in the browser", !left.keys.length && !left.cache, JSON.stringify(left));
  check("no console errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
