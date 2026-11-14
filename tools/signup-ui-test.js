// Browser test of sign-up, against the real Code.gs (gas-harness.js):
//   • sign-up asks for an email (only the owner sees it), the password twice, with an eye that shows both
//   • the username rule, the email and the password rule (10+ characters, not the username, not a common one) are
//     checked in the page, before anything is sent
//   • a taken username says so; a good sign-up keeps the email in the Users tab
//   • logging in asks for none of it
//   (cd .. && python3 -m http.server 8765) & node tools/signup-ui-test.js
"use strict";
const { chromium } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];

(async () => {
  const b = await chromium.launch();
  const gas = H({ Ark1: [HEAD] }, { settings: { SIGNUP_CODE: "invite" } });
  const ctx = await b.newContext({ viewport: { width: 420, height: 900 } });
  await require("./turnstile-fake")(ctx);
  let signups = 0;
  await ctx.route(require("./api-route"), async route => { const q = JSON.parse(route.request().postData() || "{}"); if (q.action === "signup") signups++;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(gas.call(q)) }); });
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  await p.goto(BASE); await p.waitForTimeout(400);
  check("logging in asks only for username and password", await p.isHidden("#gateEmailWrap") && await p.isHidden("#gatePass2Wrap") && await p.isHidden("#gatePassHint"));
  await p.click("#gateToggle"); await p.waitForTimeout(150);
  check("sign-up offers no kind of account yet: every new member gets a private cellar", await p.isHidden("#gateKindWrap"));
  check("sign-up asks for an email and the password twice, with the rules shown",
    await p.isVisible("#gateEmail") && await p.isVisible("#gatePass2") && /At least 10 characters/.test(await p.textContent("#gatePassHint")) && /3–24 letters/.test(await p.textContent("#gateUserHint")));
  check("…and says only the owner sees the email", /Only the owner sees it/.test(await p.textContent("#gateEmailHint")));

  const tryWith = async (o) => {
    for (const [id, v] of Object.entries(o)) await p.fill("#" + id, v);
    await p.click("#gateSubmit"); await p.waitForTimeout(250); return (await p.textContent("#gateErr")).trim(); };
  const good = { gateUser: "hugo", gateEmail: "hugo@example.dk", gatePass: "a long secret 42", gatePass2: "a long secret 42", gateInvite: "invite" };
  let e = await tryWith({ ...good, gateUser: "hu go!" });
  check("a bad username is caught in the page", /3–24 letters/.test(e) && signups === 0, e);
  e = await tryWith({ ...good, gateEmail: "hugo-at-example" });
  check("…a bad email", /email address/.test(e) && signups === 0, e);
  e = await tryWith({ ...good, gatePass: "short1", gatePass2: "short1" });
  check("…a password under 10 characters", /at least 10 characters/.test(e) && signups === 0, e);
  e = await tryWith({ ...good, gateUser: "hugohugohugo", gatePass: "HugoHugoHugo", gatePass2: "HugoHugoHugo" });
  check("…the username as the password", /username as the password/.test(e) && signups === 0, e);
  e = await tryWith({ ...good, gatePass: "password123", gatePass2: "password123" });
  check("…a common password", /too easy to guess/.test(e) && signups === 0, e);
  e = await tryWith({ ...good, gatePass2: "a long secret 43" });
  check("…two passwords that differ", /aren't the same/.test(e) && signups === 0, e);
  await p.fill("#gatePass2", "a long secret 42"); await p.waitForTimeout(100);
  check("the second field says when they match", /✓ The passwords match/.test(await p.textContent("#gateMatch")));
  await p.click("#gateEye");
  check("the eye shows both passwords as text", (await p.getAttribute("#gatePass", "type")) === "text" && (await p.getAttribute("#gatePass2", "type")) === "text" &&
    (await p.getAttribute("#gateEye", "aria-pressed")) === "true");
  await p.click("#gateEye");
  check("…and hides them again", (await p.getAttribute("#gatePass", "type")) === "password");

  await tryWith(good);
  await p.waitForSelector("#recModal.open", { timeout: 20000 });
  const users = gas.rows("Users"), col = users[0].indexOf("Email");
  check("a good sign-up goes through, once, and the email is in the Users tab", signups === 1 && users.some(r => r[0] === "hugo" && r[col] === "hugo@example.dk"), String(signups));
  await p.check("#recOk"); await p.click("#recDone"); await p.waitForSelector("#app:not([hidden])", { timeout: 20000 });

  // a taken name, from a second browser
  const ctx2 = await b.newContext({ viewport: { width: 420, height: 900 } }); await require("./turnstile-fake")(ctx2);
  await ctx2.route(require("./api-route"), async route => { const q = JSON.parse(route.request().postData() || "{}");
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(gas.call(q)) }); });
  const p2 = await ctx2.newPage(); await p2.goto(BASE); await p2.waitForTimeout(400); await p2.click("#gateToggle");
  for (const [id, v] of Object.entries({ ...good, gateUser: "Hugo", gateEmail: "other@example.dk" })) await p2.fill("#" + id, v);
  await p2.click("#gateSubmit"); await p2.waitForFunction(() => /taken/.test(document.getElementById("gateErr").textContent), null, { timeout: 15000 }).catch(() => {});
  check("a taken username (in any case) says so, and to choose another", /taken: choose another/.test(await p2.textContent("#gateErr")), await p2.textContent("#gateErr"));

  // a click on Create account before the "are you human" check is done (a slow connection, or a test's quick click)
  // waits for it and carries on, instead of being lost: here the check takes 2.5 s to arrive
  const ctx3 = await b.newContext({ viewport: { width: 420, height: 900 } });
  await ctx3.route(/challenges\.cloudflare\.com\/turnstile/, async route => { await new Promise(r => setTimeout(r, 2500));
    await route.fulfill({ contentType: "text/javascript", body: `window.turnstile = { render(s) { document.querySelector(s).textContent = "[human check]"; return "w1"; }, getResponse() { return "XXXX.DUMMY.TOKEN.XXXX"; }, reset() {} };` }); });
  await ctx3.route(require("./api-route"), async route => route.fulfill({ contentType: "application/json", body: JSON.stringify(gas.call(JSON.parse(route.request().postData() || "{}"))) }));
  const p3 = await ctx3.newPage(); p3.on("pageerror", e => errs.push(e.message));
  await p3.goto(BASE); await p3.click("#gateToggle");
  await p3.fill("#gateUser", "early"); await p3.fill("#gatePass", "early-pass-1"); await p3.fill("#gateInvite", "invite"); await p3.fill("#gatePass2", "early-pass-1"); await p3.fill("#gateEmail", "early@example.com");
  await p3.click("#gateSubmit"); await p3.waitForTimeout(400);
  const waiting = await p3.textContent("#gateErr");
  const done = await p3.waitForSelector("#recModal.open", { timeout: 15000 }).then(() => true, () => false);
  check("Create account clicked before the human check is done: it says to wait, then signs up by itself", /are you human/.test(waiting) && done, JSON.stringify({ waiting, done, now: await p3.textContent("#gateErr") }));
  await ctx3.close();

  check("no console errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
