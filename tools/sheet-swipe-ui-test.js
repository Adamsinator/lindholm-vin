// Swiping the phone's sheets closed (app.js): on a phone every dialog is a sheet with a handle; dragging it down far
// enough closes it, as a tap beside it does; a short drag springs back; the recovery code, which must be
// acknowledged, springs back too; inside a sheet scrolled down, the same finger movement scrolls instead.
// Real touch events (Chrome's Input.dispatchTouchEvent), on an iPhone 13.
//   (cd .. && python3 -m http.server 8765) & node tools/sheet-swipe-ui-test.js
"use strict";
const { chromium, devices } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];

(async () => {
  const b = await chromium.launch(), gas = H({ Ark1: [HEAD] }, { settings: { SIGNUP_CODE: "invite" } }), errs = [];
  const ctx = await b.newContext({ ...devices["iPhone 13"] });
  await require("./turnstile-fake")(ctx);
  await ctx.route(require("./api-route"), async route => { const q = JSON.parse(route.request().postData() || "{}"); await route.fulfill({ contentType: "application/json", body: JSON.stringify(gas.call(q)) }); });
  const p = await ctx.newPage(); p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  const cdp = await ctx.newCDPSession(p);
  // a finger: down at (x, y), moved by dy in steps over ms, then up
  const swipe = async (x, y, dy, ms = 250) => { const n = 10, pt = k => [{ x, y: y + dy * k / n }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(0) });
    for (let k = 1; k <= n; k++) { await p.waitForTimeout(ms / n); await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(k) }); }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await p.waitForTimeout(500); };
  const cardTop = id => p.evaluate(id => { const r = document.querySelector(`#${id} > .card`).getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top)]; }, id);
  const isOpen = id => p.evaluate(id => document.getElementById(id).classList.contains("open"), id);

  await p.goto(BASE); await p.waitForTimeout(400);
  await p.tap("#gateToggle"); await p.fill("#gateUser", "sofie"); await p.fill("#gatePass", "sofie-pass-1"); await p.fill("#gateInvite", "invite"); await p.fill("#gatePass2", "sofie-pass-1"); await p.fill("#gateEmail", "someone@example.com"); await p.tap("#gateSubmit");
  await p.waitForSelector("#recModal.open", { timeout: 20000 }); await p.waitForTimeout(400);
  // the recovery code must be acknowledged: a swipe doesn't take it away
  let [x, y] = await cardTop("recModal"); await swipe(x, y + 14, 300);
  check("the recovery code springs back from a swipe (it must be acknowledged)", await isOpen("recModal") && await p.evaluate(() => document.querySelector("#recModal > .card").style.transform === ""));
  await p.check("#recOk"); await p.tap("#recDone"); await p.waitForSelector("#app:not([hidden])", { timeout: 20000 }); await p.waitForTimeout(400);

  // the account menu, by its handle
  await p.tap("#pMe"); await p.waitForTimeout(400); check("the account menu opens as a sheet", await isOpen("meSheet"));
  [x, y] = await cardTop("meSheet"); await swipe(x, y + 12, 40);
  check("a short drag springs back", await isOpen("meSheet") && await p.evaluate(() => document.querySelector("#meSheet > .card").style.transform === ""));
  await swipe(x, y + 12, 260);
  check("a drag down by the handle closes it", !(await isOpen("meSheet")));
  await p.tap("#pMe"); await p.waitForTimeout(400); [x, y] = await cardTop("meSheet");
  await swipe(x, y + 60, 120, 80);
  check("…and so does a quick flick from inside it", !(await isOpen("meSheet")));

  // a finger that rests first, then flicks: a flick, by its speed at the end
  await p.tap("#pMe"); await p.waitForTimeout(400); [x, y] = await cardTop("meSheet");
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y + 60 }] }); await p.waitForTimeout(600);
  for (let k = 1; k <= 6; k++) { await p.waitForTimeout(12); await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + 60 + k * 15 }] }); }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await p.waitForTimeout(500);
  check("…and a flick after the finger rested a moment", !(await isOpen("meSheet")));

  // sheets a tap beside doesn't close: Account (its Close), and a business sheet (quick sell and the like)
  await p.evaluate(() => document.getElementById("acctBtn").click()); await p.waitForSelector("#acctModal.open"); await p.waitForTimeout(400);
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  [x, y] = await cardTop("acctModal"); await swipe(x, y + 12, 260);
  check("Account, which a tap beside doesn't close, closes with a drag (its own Close)", !(await isOpen("acctModal")));
  await p.evaluate(() => { const m = document.createElement("div"); m.id = "bzT"; m.className = "modal bz-till open";
    m.innerHTML = '<div class="card"><div class="bz-h"><h2>Quick sell</h2><button type="button" class="btn" data-bz="tclose">Close</button></div><p style="height:300px">…</p></div>';
    document.body.appendChild(m); m.querySelector("[data-bz=tclose]").onclick = () => m.classList.remove("open"); });
  await p.waitForTimeout(400); [x, y] = await cardTop("bzT"); await swipe(x, y + 12, 260);
  check("…and a business sheet the same way", !(await isOpen("bzT")));

  // a long sheet (Add a wine): scrolled down, the finger scrolls; at its top, it closes
  await p.evaluate(() => document.querySelector(".pfab").click()); await p.waitForSelector("#addModal.open"); await p.waitForTimeout(400);
  await p.evaluate(() => { document.querySelector("#addModal > .card").scrollTop = 300; });
  [x, y] = await cardTop("addModal"); await swipe(x, y + 220, 200);
  const st = await p.evaluate(() => document.querySelector("#addModal > .card").scrollTop);
  check("scrolled down inside Add a wine, the finger scrolls it, not closes it", await isOpen("addModal") && st < 300, String(st));
  await p.evaluate(() => { document.querySelector("#addModal > .card").scrollTop = 0; }); await p.waitForTimeout(100);
  [x, y] = await cardTop("addModal"); await swipe(x, y + 12, 260);
  check("at its top, a drag by the handle closes it", !(await isOpen("addModal")));
  // a computer: no handle, no gesture (the dialogs aren't sheets there)
  check("no errors on the page", !errs.length, errs.slice(0, 3).join(" | "));
  await b.close();
  const pass = results.filter(Boolean).length; console.log(`\n${pass}/${results.length} passed`); process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
