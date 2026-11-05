// Staff logins of a business (API 54), in two browsers against the real Code.gs (gas-harness.js): the owner adds one
// from Sales & accounts with its own password (the cellar's key wrapped to the new login's password in the browser);
// the staff login opens the same cellar, sees the inventory and quick sell but not the accounts page or the cost
// prices, and can't delete the account; a sale it makes reaches the owner's device; the owner changes its role and
// removes it, and the cellar is left as it was.
//   (cd .. && python3 -m http.server 8765) & node tools/staff-ui-test.js
"use strict";
const { chromium } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];
const row = o => HEAD.map(h => o[h] ?? "");
const gas = H({ Ark1: [HEAD,
  row({ Producent: "Bollinger", Land: "Frankrig", Område: "Champagne", "Mark/Navn": "Special Cuvée", Type: "Bobler", Årgang: "NV", Antal: 6, "Pris kr (WS)": 320 }),
  row({ Producent: "Marcel Lapierre", Land: "Frankrig", Område: "Beaujolais", "Mark/Navn": "Morgon", Type: "Rød", Årgang: 2022, Antal: 12, "Pris kr (WS)": 150 })],
  Journal: [["Dato", "Producent", "Vin", "Årgang", "Land", "Område", "Drue", "Sted", "Rating", "Pris", "Note", "Foto"]] }, { settings: { OWNER_USER: "adam", OWNER_PASSWORD: "owner-pass-1" } });
gas.run("makeOwner()");
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
async function browser(b, errs, tag) {
  const ctx = await b.newContext({ viewport: { width: 1300, height: 900 } });
  await require("./turnstile-fake")(ctx); await require("./ask-auto")(ctx);
  await ctx.route(require("./api-route"), async route => route.fulfill({ contentType: "application/json", body: JSON.stringify(gas.call(JSON.parse(route.request().postData() || "{}"))) }));
  const p = await ctx.newPage(); p.on("pageerror", e => errs.push(tag + ": " + e.message)); p.on("console", m => m.type() === "error" && errs.push(tag + ": " + m.text()));
  return p;
}
const login = async (p, user, pass) => { await p.goto(BASE); await p.waitForTimeout(400); await p.fill("#gateUser", user); await p.fill("#gatePass", pass); await p.click("#gateSubmit"); };

(async () => {
  const b = await chromium.launch(), errs = [];
  const o = await browser(b, errs, "owner");
  await login(o, "adam", "owner-pass-1");
  await o.waitForSelector("#recModal.open", { timeout: 20000 }); await o.check("#recOk"); await o.click("#recDone");
  await o.waitForSelector("#app:not([hidden])", { timeout: 30000 }); await o.waitForTimeout(1000);
  await o.click("#acctBtn"); await o.waitForSelector("#acctModal.open"); await o.selectOption("#acctKind", "restaurant"); await o.keyboard.press("Escape"); await o.waitForTimeout(600);
  await o.click('.tab[data-page="accounts"]'); await o.waitForSelector("#bzStaffAdd", { timeout: 10000 });
  check("the owner sees Staff logins on Sales & accounts", /Staff logins/.test(await o.textContent("#bizPanel")) && /hold the cellar's key/.test(await o.textContent("#bzStaff")));
  // a wrong owner password: nothing made
  await o.fill("#bzSUser", "bar-anna"); await o.fill("#bzSPass", "anna long pass 1"); await o.fill("#bzSOwn", "not my password"); await o.click("#bzStaffAdd button[type=submit]"); await o.waitForTimeout(1500);
  check("adding a staff login needs the owner's own password", /isn't your password/.test(await o.textContent("#bzSMsg")) && !(gas.rows("Users") || []).some(r => r[0] === "bar-anna"), await o.textContent("#bzSMsg"));
  await o.fill("#bzSUser", "bar-anna"); await o.fill("#bzSPass", "anna long pass 1"); await o.selectOption("#bzSRole", "staff"); await o.fill("#bzSOwn", "owner-pass-1"); await o.click("#bzStaffAdd button[type=submit]");
  await o.waitForFunction(() => /bar-anna/.test(document.getElementById("bzStaff").textContent) && !document.getElementById("bzSMsg"), null, { timeout: 15000 }).catch(() => {});
  const U = gas.rows("Users"), H0 = U[0], ra = U.find(r => r[0] === "bar-anna") || [], rad = U.find(r => r[0] === "adam");
  check("…then it's made: its own login key and wrapped key, the business's vault, role staff, parent adam", !!ra.length && ra[H0.indexOf("VaultId")] === rad[H0.indexOf("VaultId")]
    && ra[H0.indexOf("Role")] === "staff" && ra[H0.indexOf("Parent")] === "adam" && ra[H0.indexOf("WrapKey")] && ra[H0.indexOf("WrapKey")] !== rad[H0.indexOf("WrapKey")] && !ra[H0.indexOf("WrapRec")]);
  check("…and listed, not logged in yet", /bar-anna/.test(await o.textContent("#bzStaff")) && /not logged in yet/.test(await o.textContent("#bzStaff")));
  // the staff login
  const s = await browser(b, errs, "staff");
  await login(s, "bar-anna", "anna long pass 1");
  await s.waitForSelector("#app:not([hidden])", { timeout: 30000 }).catch(async () => { console.log("STAFF LOGIN:", await s.textContent("#gateErr"), errs.join(" | "));
    console.log("DIRECT:", await s.evaluate(async () => { try { const li = await VAULT.login({ post, user: "bar-anna", pass: "anna long pass 1" }); await VAULT.start({ post, user: li.user, token: li.token, dek: li.dek, records: li.records, ...VAULT_HOOKS }); return "ok " + Object.keys(li.records || {}).join(","); } catch (e) { return "ERR " + e.message + " " + (e.stack || "").slice(0, 600); } })); }); await s.waitForTimeout(1500);
  check("the staff login opens the business's cellar, on its inventory", await s.isVisible("#pageInventory") && /Bollinger/.test(await s.textContent("#bzInvBody")) && /Lapierre/.test(await s.textContent("#bzInvBody")));
  check("…without the accounts page", await s.evaluate(() => ROLE === "staff") && (await s.$$eval(".gbar .tabs .tab", ts => ts.filter(t => !t.hidden).map(t => t.dataset.page).join(","))) === "inventory,cellar,winecard");
  await s.evaluate(() => { location.hash = "accounts"; }); await s.waitForTimeout(300);
  check("…not even by its address", await s.isVisible("#pageInventory") && !(await s.isVisible("#bizPanel")));
  check("…no cost prices, and no way to delete the account or make a recovery code", !(await s.$('#bzInvBody [data-f="cost"]')) && await s.isHidden("#acctDelete") && await s.isHidden("#acctRec"));
  const del = await s.evaluate(async () => { try { await api({ action: "deleteaccount", auth: "x".repeat(44) }); return "done"; } catch (e) { return e.message; } });
  check("…and the server refuses a staff login's account deletion", /staff-account/.test(del), del);
  // a sale from the bar reaches the owner
  await s.click('[data-bz="till"]'); await s.waitForSelector("#bzTill.open"); await s.fill("#bzTillQ", "boll"); await s.waitForTimeout(150);
  await s.click('#bzTiles button[data-sell="bottle"]'); await s.waitForTimeout(1500); await s.keyboard.press("Escape");
  check("the staff login sells a bottle: 5 Bollinger left", await s.evaluate(() => WINES.find(w => w.producer === "Bollinger").left === 5));
  await o.evaluate(() => VAULT.checkFresh()); await o.waitForTimeout(800);
  check("…and the owner's device picks it up when it checks (the vault's versions changed)", await o.evaluate(() => WINES.find(w => w.producer === "Bollinger").left === 5));
  check("…while an unchanged vault isn't fetched again", (await o.evaluate(() => VAULT.checkFresh())) === false);
  // role, then removed
  await o.click('.tab[data-page="inventory"]'); await o.waitForTimeout(200); await o.click('.tab[data-page="accounts"]'); await o.waitForSelector('#bzStaff [data-srole="bar-anna"]', { timeout: 10000 });
  await o.selectOption('#bzStaff [data-srole="bar-anna"]', "manager"); await o.waitForTimeout(800);
  check("the owner makes her a manager", (gas.rows("Users").find(r => r[0] === "bar-anna") || [])[H0.indexOf("Role")] === "manager");
  await o.click('#bzStaff [data-sdel="bar-anna"]'); await o.waitForTimeout(1500);
  check("…then removes her: the login is gone, the owner's vault and wines are not", !gas.rows("Users").some(r => r[0] === "bar-anna") && gas.rows("Users").some(r => r[0] === "adam")
    && await o.evaluate(async () => normalize((await api({ action: "data" })).wines).length === 2));
  const vid = (gas.rows("Users").find(r => r[0] === "adam") || [])[H0.indexOf("VaultId")];
  check("…and the business's vault file isn't in the bin", gas.rt.files[vid] && !gas.rt.files[vid].trashed);
  const s2 = await browser(b, errs, "staff2");
  await login(s2, "bar-anna", "anna long pass 1"); await s2.waitForTimeout(2500);
  check("…and she can no longer log in", /Wrong username or password/.test(await s2.textContent("#gateErr")), await s2.textContent("#gateErr"));
  check("no page errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
