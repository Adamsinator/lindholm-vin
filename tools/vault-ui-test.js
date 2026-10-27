// Browser test of the encrypted-account screens against the real Code.gs (gas-harness.js): sign-up with the recovery
// code, a reload that reopens the vault, logout forgetting the key, a password change, and recovery.
//   (cd .. && python3 -m http.server 8765) & node tools/vault-ui-test.js
"use strict";
const { chromium } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const gas = H({ Ark1: [["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"]] },
              { settings: { SIGNUP_CODE: "invite" } });
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const seen = [];
  await require("./turnstile-fake")(ctx);
  await ctx.route(require("./api-route"), async route => {
    const p = JSON.parse(route.request().postData() || "{}"); seen.push(p);
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(gas.call(p)) });
  });
  // the atlas's relief tiles come from IGN, which answers 404 for some of them now and then: a blank tile instead,
  // so this test doesn't depend on a third party being up
  const BLANK = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  await ctx.route(/data\.geopf\.fr\/wmts/, route => route.fulfill({ contentType: "image/png", body: BLANK }));
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  p.on("dialog", d => d.accept());
  p.on("response", r => r.status() >= 400 && errs.push(r.status() + " " + r.url())); // which file, when one is missing
  await p.goto(BASE); await p.waitForTimeout(400);

  // sign up
  await p.click("#gateToggle");
  await p.fill("#gateUser", "anna"); await p.fill("#gatePass", "anna-pass-1"); await p.fill("#gateInvite", "invite");
  await p.click("#gateSubmit");
  await p.waitForSelector("#recModal.open", { timeout: 20000 });
  const code = (await p.textContent("#recCode")).trim();
  check("sign-up shows a recovery code", /^[0-9A-Z]{4}(-[0-9A-Z]{4}){7}$/.test(code), code);
  const dl = p.waitForEvent("download"); await p.click("#recSave"); const file = await dl;
  check("…which can be saved as a file", /allwine-recovery-anna\.txt/.test(file.suggestedFilename()));
  await p.check("#recOk"); await p.click("#recDone");
  await p.waitForSelector("#app:not([hidden])", { timeout: 20000 });
  check("no password was sent to the server", !seen.some(x => JSON.stringify(x).includes("anna-pass-1")));
  check("the Account button shows", await p.isVisible("#acctBtn"));

  // add a wine through the normal form
  await p.click("#addBtn"); await p.fill("#aProducer", "Domaine Roulot"); await p.fill("#aName", "Meursault Perrières");
  await p.fill("#aVintage", "2020"); await p.click('#addForm button[type="submit"]'); await p.waitForTimeout(1200);
  check("adding a wine works on the encrypted cellar", (await p.textContent("#tbl")).includes("Domaine Roulot"));

  // a location for the bottle: inline in the details, shown in the table, filterable and searchable
  await p.click('#tbl tr.main:has-text("Domaine Roulot")'); await p.waitForTimeout(200);
  await p.fill("#tbl input.setloc", "Kælder, reol 3, hylde 2"); await p.press("#tbl input.setloc", "Tab"); await p.waitForTimeout(1200);
  check("a location can be set in the details", (await p.textContent("#tbl")).includes("📍 Kælder, reol 3, hylde 2"));
  check("…and the filter offers its place", (await p.$$eval("#fLoc option", o => o.map(x => x.textContent))).includes("Kælder") && await p.isVisible("#fLoc"));
  await p.selectOption("#fLoc", "-"); await p.waitForTimeout(200);
  check("…'No location yet' hides it", !(await p.textContent("#tbl")).includes("Domaine Roulot"));
  await p.selectOption("#fLoc", "Kælder"); await p.waitForTimeout(200);
  check("…its place shows it", (await p.textContent("#tbl")).includes("Domaine Roulot"));
  await p.selectOption("#fLoc", ""); await p.fill("#q", "hylde 2"); await p.waitForTimeout(200);
  check("…and search finds it", (await p.textContent("#tbl")).includes("Domaine Roulot"));
  await p.fill("#q", ""); await p.dispatchEvent("#q", "input"); await p.waitForTimeout(200);
  // the edit dialog: location, source and note; sparkling stays sparkling
  await p.click('#tbl tr.main:has-text("Domaine Roulot")'); await p.waitForTimeout(150);
  if (!(await p.isVisible("#tbl button.winfo"))) { await p.click('#tbl tr.main:has-text("Domaine Roulot")'); await p.waitForTimeout(150); }
  await p.click("#tbl button.winfo");
  // the dialog puts the cursor in the name 40 ms after it opens: wait for that, or typing the note can land in the
  // name on a busy machine (it did once in the full suite: "Meursault Perrièrestil nytår")
  await p.waitForFunction(() => document.activeElement && document.activeElement.id === "iName", null, { timeout: 3000 }).catch(() => {});
  check("the edit dialog shows the location", (await p.inputValue("#iLocation")) === "Kælder, reol 3, hylde 2");
  await p.fill("#iLocation", "Køleskab, række 4"); await p.fill("#iNote", "til nytår"); await p.selectOption("#iType", "Bobler");
  await p.click("#iSave"); await p.waitForTimeout(1500);
  const saved = await p.evaluate(() => WINES.find(w => w.producer === "Domaine Roulot"));
  check("…and saves location, note and a sparkling type", saved.location === "Køleskab, række 4" && saved.note === "til nytår" && saved.style === "Bobler", JSON.stringify(saved));

  // reload: the session key is kept for this session
  await p.reload(); await p.waitForTimeout(2500);
  check("a reload reopens the cellar without the password", await p.isVisible("#app") && (await p.textContent("#tbl")).includes("Domaine Roulot"));

  // the atlas reads the encrypted cellar too
  await p.goto(BASE + "burgundy.html"); await p.waitForTimeout(6000);
  check("the atlas shows the encrypted cellar's bottles", await p.isVisible("#cellarChip"));
  await p.goto(BASE); await p.waitForTimeout(2500);

  // change password
  await p.click("#acctBtn"); await p.fill("#acctPass", "anna-pass-1"); await p.fill("#acctNew", "anna-pass-2");
  await p.click("#acctSave"); await p.waitForTimeout(3500);
  check("password change closes the dialog", !(await p.isVisible("#acctModal")), await p.textContent("#acctErr"));

  // logout forgets the key: a reload asks for the password
  await p.click("#lockBtn"); await p.waitForTimeout(500);
  await p.reload(); await p.waitForTimeout(800);
  check("after logout the gate shows", await p.isVisible("#gate"));
  const kept = await p.evaluate(() => VCRYPTO.recall("anna").then(k => !!k));
  check("…and the key is gone from the browser", kept === false);

  // the old password fails, the new one works
  await p.fill("#gateUser", "anna"); await p.fill("#gatePass", "anna-pass-1"); await p.click("#gateSubmit"); await p.waitForTimeout(3000);
  check("old password is refused", /Wrong username or password/.test(await p.textContent("#gateErr")), await p.textContent("#gateErr"));

  // forgot password: recovery code + new password
  await p.click("#gateForgot");
  await p.fill("#gateUser", "anna"); await p.fill("#gateRec", code.toLowerCase()); await p.fill("#gatePass", "anna-pass-3");
  await p.click("#gateSubmit");
  await p.waitForSelector("#app:not([hidden])", { timeout: 20000 }); await p.waitForTimeout(1500);
  check("recovery opens the same cellar", (await p.textContent("#tbl")).includes("Domaine Roulot"));
  check("no console errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
