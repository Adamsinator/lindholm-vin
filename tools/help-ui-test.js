// Browser test of account help from the admin (API 42), against the real Code.gs (gas-harness.js), encrypted accounts:
//   • the owner turns it on (a key pair; the private half stored encrypted with the owner's own key)
//   • a member signed up before is ready after a password login; one who signs up after is ready at once; one whose
//     session comes back without the password is asked for it once
//   • the owner makes a fresh recovery code, and the member gets back into the same cellar with it
//   • what the server holds stays ciphertext, the old code stops working, members can't use the owner's doors, and
//     a browser wraps nothing to a key other than the one pinned in config.js
//   (cd .. && python3 -m http.server 8765) & node tools/help-ui-test.js
"use strict";
const { chromium } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];

(async () => {
  const b = await chromium.launch();
  const gas = H({ Ark1: [HEAD] }, { settings: { SIGNUP_CODE: "invite" } });
  const device = async () => {
    const ctx = await b.newContext({ viewport: { width: 1200, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
    await require("./turnstile-fake")(ctx);
    // the site pins the real owner's key (config.js ADMIN_KID); this test makes an owner key of its own, so its
    // browsers get config.js without the pin (trust on first use), and the pin itself is checked below
    await ctx.route(/\/config\.js(\?|$)/, async route => { const r = await route.fetch();
      await route.fulfill({ response: r, body: (await r.text()).replace(/ADMIN_KID: "[0-9a-f]*"/, 'ADMIN_KID: ""') }); });
    await ctx.route(require("./api-route"), async route => { const q = JSON.parse(route.request().postData() || "{}");
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(gas.call(q)) }); });
    const p = await ctx.newPage(), errs = [];
    p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
    p.on("dialog", d => d.accept());
    return { ctx, p, errs };
  };
  const inApp = p => p.waitForSelector("#app:not([hidden])", { timeout: 20000 });
  const signUp = async (p, user) => {
    await p.goto(BASE); await p.waitForTimeout(400); await p.click("#gateToggle");
    await p.fill("#gateUser", user); await p.fill("#gateEmail", user + "@example.dk"); await p.fill("#gatePass", user + "-secret-1"); await p.fill("#gatePass2", user + "-secret-1");
    await p.fill("#gateInvite", "invite"); await p.click("#gateSubmit");
    await p.waitForSelector("#recModal.open", { timeout: 20000 });
    const code = await p.textContent("#recCode");
    await p.check("#recOk"); await p.click("#recDone"); await inApp(p); await p.waitForTimeout(600);
    return code;
  };
  const logIn = async (p, user, pass) => {
    await p.goto(BASE); await p.waitForTimeout(400);
    await p.fill("#gateUser", user); await p.fill("#gatePass", pass); await p.click("#gateSubmit"); await inApp(p); await p.waitForTimeout(600);
  };
  const row = name => gas.run(`(() => { const u = findUser(${JSON.stringify(name)}); return u ? { wrapAdmin: u.wrapAdmin, adminKid: u.adminKid, adminKey: u.adminKey, adminPub: u.adminPub } : null; })()`);
  const openAdmin = async p => { await p.evaluate(() => { document.getElementById("adminModal").classList.remove("open"); document.getElementById("adminHelp").innerHTML = ""; }); await p.click("#adminBtn");
    await p.waitForFunction(() => document.querySelector("#adminHelp").children.length > 0, null, { timeout: 10000 }); };

  // the owner, and a member from before account help
  const O = await device(), o = O.p;
  await signUp(o, "ole");
  gas.run(`setUser(findUser('ole'), 'OldSheet', SpreadsheetApp.getActiveSpreadsheet().getId())`);
  const P = await device(), p = P.p;
  const piaOldCode = await signUp(p, "pia");
  await p.evaluate(() => api({ action: "add", wine: { producer: "Domaine Roulot", name: "Meursault Perrières", vintage: 2019, qty: 2 } }).then(loadData));
  check("before account help, no member's key is wrapped to anything", !row("pia").wrapAdmin);

  await o.reload(); await inApp(o); await o.waitForTimeout(800);
  await openAdmin(o);
  check("the owner is offered account help", await o.isVisible("#helpSetup"));
  await o.click("#helpSetup");
  await o.waitForFunction(() => /\bOn\b/.test(document.getElementById("adminHelp").textContent), null, { timeout: 20000 });
  const ole = row("ole"), kid = ole.adminKid;
  check("…it's on, with a key fingerprint shown", /^[0-9a-f]{32}$/.test(kid) && (await o.textContent("#adminHelp")).includes(kid), kid);
  check("…the private half is stored encrypted (ciphertext only), the public half beside it", /^v1\./.test(ole.adminKey) && !/MII/.test(ole.adminKey.slice(0, 8)) && ole.adminPub.length > 300);
  check("…pia, from before, is ready only after her next login", await o.isVisible('#adminUsers li:has-text("pia") .hwait'));

  // pia logs in with her password on a new device → ready
  const P2 = await device(), p2 = P2.p;
  await logIn(p2, "pia", "pia-secret-1");
  check("a member's password login wraps her key to the owner's", row("pia").wrapAdmin && row("pia").adminKid === kid, JSON.stringify(row("pia")).slice(0, 120));
  check("…and the owner's page shows her as ready", await (async () => { await openAdmin(o); return o.isVisible('#adminUsers button[data-help="pia"]'); })());

  // a new member is ready at once
  const K = await device();
  await signUp(K.p, "kim");
  check("a member who signs up now is ready at once", row("kim").adminKid === kid && !!row("kim").wrapAdmin);

  // liv: signed up before, keeps her session (a kept key, no password) → asked once
  gas.run(`setUser(findUser('ole'), 'AdminKid', ''); setUser(findUser('ole'), 'AdminPub', '')`); // help off for a moment…
  const L = await device(), l = L.p;
  await signUp(l, "liv");
  gas.run(`setUser(findUser('ole'), 'AdminKid', ${JSON.stringify(kid)}); setUser(findUser('ole'), 'AdminPub', ${JSON.stringify(ole.adminPub)})`); // …and on again
  check("(liv signed up while it was off, so she isn't ready)", !row("liv").wrapAdmin);
  await l.reload(); await inApp(l);
  await l.waitForSelector("#helpModal.open", { timeout: 10000 }).catch(() => {});
  check("a member back without her password is asked for it once", await l.isVisible("#helpModal.open"));
  await l.fill("#helpPass", "wrong-password-9"); await l.click("#helpGo"); await l.waitForTimeout(1500);
  check("…a wrong password says so", /didn't match/.test(await l.textContent("#helpErr")) && !row("liv").wrapAdmin, await l.textContent("#helpErr"));
  await l.fill("#helpPass", "liv-secret-1"); await l.click("#helpGo");
  await l.waitForFunction(() => !document.getElementById("helpModal").classList.contains("open"), null, { timeout: 15000 }).catch(() => {});
  check("…the right one sets it up, and she stays signed in", row("liv").adminKid === kid && await l.isVisible("#app") && (await l.evaluate(() => api({ action: "data" }).then(r => r.ok))), JSON.stringify(row("liv")).slice(0, 80));

  // the doors stay shut to members
  const piaTok = await p2.evaluate(() => cfg.token);
  const raw = q => gas.call(Object.assign({ user: "pia", token: piaTok }, q));
  check("a member can't fetch another's wrapped key, the owner's key, or make a code", ["adminescrow", "adminkeyget", "adminrecovery", "adminkeyset"].every(a => raw({ action: a, member: "kim" }).error === "not-owner"));
  check("a key wrapped to a stale admin key is refused", raw({ action: "escrow", wrapAdmin: "A".repeat(512), adminKid: "0".repeat(32) }).error === "stale-admin-key");
  check("the site pins the owner's key fingerprint", /ADMIN_KID: "[0-9a-f]{32}"/.test(require("fs").readFileSync(require("path").join(__dirname, "..", "config.js"), "utf8")));
  check("a browser wraps nothing to a key other than the pinned one", await p2.evaluate(async k => { window.WINE_CONFIG.ADMIN_KID = "f".repeat(32); const r = await VAULT.trustedHelp(k); delete window.WINE_CONFIG.ADMIN_KID; return r === null; }, { pub: ole.adminPub, kid }));
  check("…nor to one whose fingerprint doesn't match it", await p2.evaluate(async k => (await VAULT.trustedHelp({ pub: k.pub, kid: "a".repeat(32) })) === null, { pub: ole.adminPub }));

  // pia loses everything; the owner helps her back in
  await openAdmin(o);
  await o.click('#adminUsers button[data-help="pia"]');
  await o.waitForSelector("#helpCode", { timeout: 20000 });
  const newCode = (await o.textContent("#helpCode")).trim();
  check("the owner gets a fresh recovery code for pia", /^[0-9A-Z]{4}(-[0-9A-Z]{4}){7}$/.test(newCode), newCode);
  await o.click("#helpCopy"); await o.waitForTimeout(200);
  check("…and a message to send her", (await o.evaluate(() => navigator.clipboard.readText())).includes(newCode));
  check("…it's logged", gas.rows("Log").some(r => r[1] === "admin-recovery" && r[2] === "pia"));

  const P3 = await device(), p3 = P3.p;
  const forgot = async (code, pass) => {
    await p3.goto(BASE); await p3.waitForTimeout(400); await p3.click("#gateForgot"); await p3.waitForTimeout(200);
    await p3.fill("#gateUser", "pia"); await p3.fill("#gateRec", code); await p3.fill("#gatePass", pass); if (await p3.isVisible("#gatePass2")) await p3.fill("#gatePass2", pass);
    await p3.click("#gateSubmit");
    return p3.waitForSelector("#app:not([hidden]), #recModal.open", { timeout: 15000 }).then(() => true).catch(() => false);
  };
  check("pia's own old recovery code no longer works", !(await forgot(piaOldCode, "pia-new-pass-2")) && await p3.isHidden("#app"));
  check("the code from the owner gets her in with a new password", await forgot(newCode, "pia-new-pass-2"));
  if (await p3.isVisible("#recModal.open")) { await p3.check("#recOk"); await p3.click("#recDone"); }
  await inApp(p3); await p3.waitForTimeout(600);
  const ws = await p3.evaluate(() => api({ action: "data" }).then(r => r.wines.map(w => w.producer)));
  check("…into the same cellar, wines and all", ws.includes("Domaine Roulot"), ws.join());
  check("…and she can log in with the new password afterwards", await (async () => { const Q = await device(); await logIn(Q.p, "pia", "pia-new-pass-2"); return Q.p.isVisible("#app"); })());
  check("nothing readable of any cellar is on the server", !JSON.stringify(gas.rows("Users")).includes("Roulot") && !JSON.stringify(gas.rows("Log")).includes("Roulot"));

  check("no console errors", ![O, P, P2, K, L, P3].some(d => d.errs.length), [O, P, P2, K, L, P3].flatMap(d => d.errs).join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
