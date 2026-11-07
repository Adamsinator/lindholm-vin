// More of the cellar's conveniences: Undo after editing a wine's details (the fields, the bottles and the price come
// back); a reminder to keep a copy of the cellar on this device (ten wines or more, no export here for 90 days, at
// most once a month, and not after an export); and on a phone, pulling the page down from the top fetches the cellar
// again (a short pull doesn't).
//   (cd .. && python3 -m http.server 8765) & node tools/qol3-ui-test.js
"use strict";
const { chromium, devices } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];
const twelve = Array.from({ length: 12 }, (_, i) => ({ producer: "Domaine " + String.fromCharCode(65 + i), name: "Cuvée", country: "Frankrig", region: "Bourgogne", type: "Rød", vintage: 2015 + (i % 8), qty: 2, price: 100 + i, location: "Kælder" }));

async function signup(b, devOpt, user, wines) {
  const gas = H({ Ark1: [HEAD] }, { settings: { SIGNUP_CODE: "invite" } }), ctx = await b.newContext(devOpt), calls = [];
  await require("./turnstile-fake")(ctx);
  await ctx.route(require("./api-route"), async route => { const q = JSON.parse(route.request().postData() || "{}"); calls.push(q.action); await route.fulfill({ contentType: "application/json", body: JSON.stringify(gas.call(q)) }); });
  const p = await ctx.newPage(), errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  await p.goto(BASE); await p.waitForTimeout(400);
  await p.click("#gateToggle"); await p.fill("#gateUser", user); await p.fill("#gatePass", user + "-pass-1"); await p.fill("#gateInvite", "invite"); await p.fill("#gatePass2", user + "-pass-1"); await p.fill("#gateEmail", "someone@example.com"); await p.click("#gateSubmit");
  await p.waitForSelector("#recModal.open", { timeout: 20000 }); await p.check("#recOk"); await p.click("#recDone");
  await p.waitForSelector("#app:not([hidden])", { timeout: 20000 });
  await p.evaluate(async w => { await api({ action: "addmany", bumps: [], wines: w }); await loadData(); }, wines); await p.waitForTimeout(400);
  return { ctx, p, errs, calls };
}
const W = (p, prod) => p.evaluate(n => { const w = WINES.find(x => x.producer === n); return w && { name: w.name, location: w.location, left: w.left, price: w.price }; }, prod);

(async () => {
  const b = await chromium.launch();
  const { p, errs } = await signup(b, { viewport: { width: 1300, height: 900 } }, "ida", twelve);
  // Undo an edit
  await p.evaluate(() => openInfo(WINES.find(x => x.producer === "Domaine A")));
  // the dialog puts the cursor in the name a moment after it opens: wait for that, or a fill elsewhere can be cut in two
  await p.waitForSelector("#iModal.open"); await p.waitForFunction(() => document.activeElement === $("iName")); await p.fill("#iName", "Vieilles Vignes"); await p.fill("#iLocation", "Garage"); await p.fill("#iLeft", "5"); await p.fill("#iPrice", "300");
  await p.click("#iSave"); await p.waitForTimeout(1000);
  const ed = await W(p, "Domaine A");
  check("an edit saves name, location, bottles and price", ed.name === "Vieilles Vignes" && ed.location === "Garage" && ed.left === 5 && Number(ed.price) === 300, JSON.stringify(ed));
  const undo = await p.$('#actbar button:has-text("Undo")'); check("…and offers Undo", !!undo);
  if (undo) await undo.click(); await p.waitForTimeout(1500);
  const un = await W(p, "Domaine A");
  check("Undo puts all four back", un.name === "Cuvée" && un.location === "Kælder" && un.left === 2 && Number(un.price) === 100, JSON.stringify(un));
  // the reminder: none at first (asked now), none within the month, offered after; not after an export
  const remind = async () => { await p.reload(); await p.waitForSelector("#app:not([hidden])", { timeout: 20000 }); await p.waitForTimeout(6500);
    const t = await p.evaluate(() => $("actbar").hidden ? "" : $("actMsg").textContent); await p.evaluate(() => closeNotify()); return t; };
  const t1 = await remind();
  check("twelve wines and never a copy kept here: the reminder is offered", /Keep a copy of your cellar on this device/.test(t1), t1);
  const t2 = await remind();
  check("…but not again on the next visit (at most once a month)", !/copy of your cellar/.test(t2), t2);
  await p.evaluate(() => { localStorage.setItem("vinCopyAsk:" + cfg.user, String(Date.now() - 31 * 864e5)); localStorage.setItem("vinCopy:" + cfg.user, String(Date.now() - 100 * 864e5)); });
  const t3 = await remind();
  check("a month on, with the last copy 100 days old: offered again, saying it's been a while", /been a while since you kept a copy/.test(t3), t3);
  await p.evaluate(() => { localStorage.setItem("vinCopyAsk:" + cfg.user, String(Date.now() - 31 * 864e5)); localStorage.setItem("vinCopy:" + cfg.user, String(Date.now() - 5 * 864e5)); });
  const t4 = await remind();
  check("a copy kept five days ago: no reminder", !/copy of your cellar/.test(t4), t4);
  await p.evaluate(() => localStorage.removeItem("vinCopy:" + cfg.user));
  await p.click("#expBtn"); await p.waitForSelector("#expModal.open"); const dl = p.waitForEvent("download", { timeout: 10000 }).catch(() => null);
  await p.click("#expCsv"); await dl; await p.waitForTimeout(400);
  check("an export records that a copy was kept here", await p.evaluate(() => Date.now() - Number(localStorage.getItem("vinCopy:" + cfg.user)) < 60000));
  check("no errors on the computer", !errs.length, errs.slice(0, 3).join(" | "));

  // ── a phone: pull to refresh ──
  const m = await signup(b, { ...devices["iPhone 13"] }, "jonas", twelve.slice(0, 3)), q = m.p, cdp = await m.ctx.newCDPSession(q);
  const pull = async dy => { const x = 200, y = 160, n = 10;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let k = 1; k <= n; k++) { await q.waitForTimeout(20); await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + dy * k / n }] }); }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await q.waitForTimeout(1200); };
  await q.evaluate(() => window.scrollTo(0, 0)); await q.waitForTimeout(200);
  await q.evaluate(() => { window.__refreshed = 0; $("refreshBtn").addEventListener("click", () => window.__refreshed++); });
  const count = () => q.evaluate(() => window.__refreshed); // what ↻ Refresh fetches depends on the account (the vault's "me", or "data")
  const n0 = await count();
  await pull(60); const n1 = await count();
  check("a short pull from the top doesn't refresh", n1 === n0, `${n0} → ${n1}`);
  await pull(240); const n2 = await count();
  check("a long pull from the top fetches the cellar again", n2 === n0 + 1, `${n0} → ${n2}`);
  await q.evaluate(() => window.scrollTo(0, 400)); await q.waitForTimeout(200); await pull(240);
  check("scrolled down, the same pull just scrolls", (await count()) === n2);
  check("no errors on the phone", !m.errs.length, m.errs.slice(0, 3).join(" | "));
  await b.close();
  const pass = results.filter(Boolean).length; console.log(`\n${pass}/${results.length} passed`); process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
