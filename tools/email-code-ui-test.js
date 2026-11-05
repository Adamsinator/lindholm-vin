// Sign-up proves the email address (API 54), in a browser against the real Code.gs (gas-harness.js, which records the
// mail instead of sending it): the first submit mails a 6-digit code and shows a field for it; a wrong code is refused,
// the right one creates the account; no code is mailed without a valid invite; a new address asks for a new code; three
// codes an hour to one address at most. With VERIFY_EMAIL off, sign-up asks for no code; and an older Apps Script
// (before API 54) signs up as before.
//   (cd .. && python3 -m http.server 8765) & node tools/email-code-ui-test.js
"use strict";
const { chromium } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];
const codeIn = m => (String(m && m.subject || "").match(/\d{6}/) || [""])[0];

async function page(b, gas, map) {
  const ctx = await b.newContext({ viewport: { width: 420, height: 900 } });
  await require("./turnstile-fake")(ctx);
  const seen = [];
  await ctx.route(require("./api-route"), async route => { const q = JSON.parse(route.request().postData() || "{}"); seen.push(q.action);
    const r = gas.call(q); await route.fulfill({ contentType: "application/json", body: JSON.stringify(map ? map(q, r) : r) }); });
  const p = await ctx.newPage(), errs = [];
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  await p.goto(BASE); await p.waitForTimeout(400); await p.click("#gateToggle"); await p.waitForTimeout(150);
  return { p, seen, errs };
}
const fill = async (p, o) => { for (const [id, v] of Object.entries(o)) await p.fill("#" + id, v); };
const submit = async p => { await p.click("#gateSubmit"); await p.waitForTimeout(400); return (await p.textContent("#gateErr")).trim(); };
const good = { gateUser: "hugo", gateEmail: "hugo@example.dk", gatePass: "a long secret 42", gatePass2: "a long secret 42", gateInvite: "invite" };

(async () => {
  const b = await chromium.launch();
  const gas = H({ Ark1: [HEAD] }, { settings: { SIGNUP_CODE: "invite", VERIFY_EMAIL: "on" } });
  const A = await page(b, gas), p = A.p;
  check("the email field says a code will be mailed to it", /A code is mailed to it/.test(await p.textContent("#gateEmailHint")));
  // no invite, no mail
  await fill(p, { ...good, gateInvite: "wrong" }); let e = await submit(p);
  check("without a valid invite no code is mailed", /invite code isn't right/.test(e) && gas.rt.mails.length === 0 && await p.isHidden("#gateCodeWrap"), e);
  // the code
  await fill(p, good); e = await submit(p);
  const m1 = gas.rt.mails[gas.rt.mails.length - 1];
  check("the first submit mails a 6-digit code to the address, and shows a field for it", m1 && m1.to === "hugo@example.dk" && /^\d{6}$/.test(codeIn(m1)) && await p.isVisible("#gateCode")
    && /sent a 6-digit code to hugo@example\.dk/.test(await p.textContent("#gateCodeHint")) && !A.seen.includes("signup"), JSON.stringify(m1));
  check("…in the language of the page", /code is/.test(m1.subject) && /valid for 15 minutes/.test(m1.body));
  check("…and no account yet", !(gas.rows("Users") || []).some(r => r[0] === "hugo"));
  e = await submit(p);
  check("submitting again without the code asks for it", /6-digit code/.test(e) && !A.seen.includes("signup"), e);
  await p.fill("#gateCode", codeIn(m1) === "000000" ? "111111" : "000000"); e = await submit(p);
  check("a wrong code is refused", /code isn't right/.test(e) && !(gas.rows("Users") || []).some(r => r[0] === "hugo"), e);
  await p.click("#gateCodeAgain"); await p.waitForTimeout(500);
  const m2 = gas.rt.mails[gas.rt.mails.length - 1];
  check("Send a new code mails another", gas.rt.mails.length === 2 && codeIn(m2) && m2.to === "hugo@example.dk");
  await p.fill("#gateCode", codeIn(m1)); e = await submit(p);
  check("…and the old code no longer works", /code isn't right/.test(e), e);
  await p.fill("#gateCode", codeIn(m2)); await p.click("#gateSubmit");
  const ok = await p.waitForSelector("#recModal.open", { timeout: 20000 }).then(() => true).catch(() => false);
  check("the right code creates the account", ok && (gas.rows("Users") || []).some(r => r[0] === "hugo"));
  // three an hour to one address
  const B = await page(b, gas), q = B.p;
  await fill(q, { ...good, gateUser: "hugo2" }); await submit(q);
  e = await submit(q).then(() => q.click("#gateCodeAgain")).then(() => q.waitForTimeout(500)).then(() => q.textContent("#gateErr"));
  check("a fourth code to the same address in an hour is refused", /Several codes have gone to that address/.test(e) && gas.rt.mails.length === 3, e + " · " + gas.rt.mails.length);
  // a new address forgets the code field
  await q.fill("#gateEmail", "other@example.dk"); await q.waitForTimeout(100);
  check("changing the address hides the code field (it was for the other one)", await q.isHidden("#gateCodeWrap"));
  // off
  const gas2 = H({ Ark1: [HEAD] }, { settings: { SIGNUP_CODE: "invite", VERIFY_EMAIL: "off" } });
  const C = await page(b, gas2);
  await fill(C.p, { ...good, gateUser: "anna" }); await C.p.click("#gateSubmit");
  check("with VERIFY_EMAIL off, sign-up asks for no code", await C.p.waitForSelector("#recModal.open", { timeout: 20000 }).then(() => true).catch(() => false) && gas2.rt.mails.length === 0);
  // an older Apps Script: no emailcode, answers v 53
  const gas3 = H({ Ark1: [HEAD] }, { settings: { SIGNUP_CODE: "invite", VERIFY_EMAIL: "off" } });
  const D = await page(b, gas3, (q, r) => q.action === "emailcode" ? { ok: false, error: "bad-code", v: 53 } : r);
  await fill(D.p, { ...good, gateUser: "bodil" }); await D.p.click("#gateSubmit");
  const dOk = await D.p.waitForSelector("#recModal.open", { timeout: 20000 }).then(() => true).catch(() => false);
  check("an older Apps Script (API 53) signs up as before", dOk, (await D.p.textContent("#gateErr")) + " " + JSON.stringify(D.seen));
  check("no page errors", ![...A.errs, ...B.errs, ...C.errs, ...D.errs].length, [...A.errs, ...B.errs, ...C.errs, ...D.errs].join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
