// Browser test of the Source / bought at suggestions in the add and edit forms: the places the account's own wines came
// from, the most used first; another account on the same device sees only its own, and logging out empties the list.
//   (cd .. && python3 -m http.server 8765) & node tools/source-ui-test.js
"use strict";
const { chromium } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };

(async () => {
  const gas = H({ Ark1: [HEAD] }, { settings: { SIGNUP_CODE: "invite" } }), b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await require("./turnstile-fake")(ctx); await require("./ask-auto")(ctx);
  const calls = []; // the last calls and answers, for the message should a sign-up not finish
  await ctx.route(require("./api-route"), r => { const q = JSON.parse(r.request().postData() || "{}"), res = gas.call(q);
    calls.push(q.action + " → " + (res.ok ? "ok" : res.error)); if (calls.length > 6) calls.shift();
    return r.fulfill({ contentType: "application/json", body: JSON.stringify(res) }); });
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  await p.goto(BASE); await p.waitForTimeout(400);
  // the login form puts the cursor in the username a moment after it shows, but not over a field already being typed in
  // (on a slow machine that moment came late, and the email typed went into the username: "bodilbodil@example.com")
  const kept = await p.evaluate(async () => { showGate(""); const f = document.getElementById("gatePass"); f.focus(); await new Promise(r => setTimeout(r, 150)); return document.activeElement === f; });
  check("the login form doesn't take the cursor from a field already in use", kept);
  const signup = async user => {
    await p.click("#gateToggle"); await p.fill("#gateUser", user); await p.fill("#gatePass", user + "-pass-1"); await p.fill("#gateInvite", "invite");
    await p.fill("#gatePass2", user + "-pass-1"); await p.fill("#gateEmail", user + "@example.com"); await p.click("#gateSubmit");
    // (it timed out now and then in CI on the second sign-up, never here: should it again, say what the form shows)
    await p.waitForSelector("#recModal.open", { timeout: 20000 }).catch(async e => {
      const g = await p.evaluate(() => ({ mode: GATE_MODE, msg: document.getElementById("gateErr").textContent, user: document.getElementById("gateUser").value,
        filled: ["gatePass", "gatePass2", "gateInvite", "gateEmail"].map(id => document.getElementById(id).value.length), submitDisabled: document.getElementById("gateSubmit").disabled,
        codeShown: !document.getElementById("gateCodeWrap").hidden, gate: !document.getElementById("gate").hidden }));
      console.log("  sign-up of " + user + " didn't finish: " + JSON.stringify(g) + " · last calls: " + calls.join(", ")); throw e; });
    await p.check("#recOk"); await p.click("#recDone"); await p.waitForSelector("#app:not([hidden])"); await p.waitForTimeout(800);
    await p.keyboard.press("Escape"); await p.keyboard.press("Escape");
  };
  const add = (wines) => p.evaluate(async ws => { for (const w of ws) await api({ action: "add", wine: { country: "Frankrig", region: "Bourgogne", qty: 1, ...w } }); await loadData(true); }, wines);
  const offered = async id => { await p.waitForFunction(() => !!document.getElementById("srcList"), null, { timeout: 8000 });
    await p.focus("#" + id); await p.waitForTimeout(100);
    return p.evaluate(id => { const el = document.getElementById(id); return { list: el.getAttribute("list"), opts: [...document.querySelectorAll("#srcList option")].map(o => o.value) }; }, id); };
  const logout = async () => { await p.evaluate(() => { document.querySelectorAll(".modal.open").forEach(m => m.classList.remove("open")); document.getElementById("lockBtn").click(); }); await p.waitForSelector("#gateSubmit:visible"); };

  // anna: three wines from Vinimportøren, one from Peytz
  await signup("anna");
  await add([{ producer: "Armand Rousseau", source: "Vinimportøren" }, { producer: "Domaine Leflaive", source: "Vinimportøren" }, { producer: "Domaine Ponsot", source: "Vinimportøren" },
    { producer: "Clos Rougeard", source: "Peytz kandidatfest" }, { producer: "Dönnhoff" }]);
  await p.click("#addBtn"); await p.waitForSelector("#addModal.open");
  let a = await offered("aSource");
  check("Add wine: Source suggests anna's own places, the most used first", a.list === "srcList" && JSON.stringify(a.opts) === JSON.stringify(["Vinimportøren", "Peytz kandidatfest"]), JSON.stringify(a));
  await p.fill("#aProducer", "Domaine Huet"); await p.fill("#aSource", "Peytz kandidatfest"); await p.click("#addSave"); await p.waitForTimeout(900);
  await p.evaluate(() => openInfo(WINES.find(w => w.producer === "Dönnhoff"))); await p.waitForSelector("#iModal.open");
  a = await offered("iSource");
  check("Edit details: the same, with the wine just added counted (two Peytz now)", a.list === "srcList" && JSON.stringify(a.opts) === JSON.stringify(["Vinimportøren", "Peytz kandidatfest"]), JSON.stringify(a));
  await p.click("#iCancel");
  await logout();
  check("logging out empties the list", await p.evaluate(() => document.getElementById("srcList").children.length === 0));

  // bodil, on the same device: only her own
  await signup("bodil");
  await add([{ producer: "Giacomo Conterno", source: "Supervin" }]);
  await p.click("#addBtn"); await p.waitForSelector("#addModal.open");
  a = await offered("aSource");
  check("another account on the same device sees only its own places", JSON.stringify(a.opts) === JSON.stringify(["Supervin"]), JSON.stringify(a));
  await p.keyboard.press("Escape"); await logout();

  // anna again: hers again
  await p.fill("#gateUser", "anna"); await p.fill("#gatePass", "anna-pass-1"); await p.click("#gateSubmit");
  await p.waitForSelector("#app:not([hidden])", { timeout: 30000 }); await p.waitForTimeout(1200); await p.keyboard.press("Escape");
  await p.click("#addBtn"); await p.waitForSelector("#addModal.open");
  a = await offered("aSource");
  check("…and anna, back, sees hers again (Vinimportøren 3, Peytz 2)", JSON.stringify(a.opts) === JSON.stringify(["Vinimportøren", "Peytz kandidatfest"]) && !a.opts.includes("Supervin"), JSON.stringify(a));
  check("no page errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
