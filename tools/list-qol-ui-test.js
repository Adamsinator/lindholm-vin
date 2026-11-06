// The cellar list's conveniences (app.js): it remembers its filters and sort on this device (not the search), per
// user, and lets go of a filter the cellar no longer has; keys on a computer (/ search, N add, ↓ from the search into
// the list, ↑ ↓ wine to wine, not while typing); Select several wines, move them to a location or drink a bottle of
// each with one Undo; and on a phone, swipe a wine left to drink a bottle (a short swipe doesn't).
//   (cd .. && python3 -m http.server 8765) & node tools/list-qol-ui-test.js
"use strict";
const { chromium, devices } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];
const WINES = [
  { producer: "Domaine A", name: "Bourgogne", country: "Frankrig", region: "Bourgogne", type: "Rød", vintage: 2020, qty: 3, price: 200, location: "Kælder, reol 1" },
  { producer: "Domaine B", name: "Chablis", country: "Frankrig", region: "Bourgogne", type: "Hvid", vintage: 2022, qty: 2, price: 150, location: "Kælder, reol 1" },
  { producer: "Weingut C", name: "Riesling", country: "Tyskland", region: "Mosel", type: "Hvid", vintage: 2021, qty: 1, price: 120, location: "Køleskab" },
  { producer: "Bodega D", name: "Rioja", country: "Spanien", region: "Rioja", type: "Rød", vintage: 2018, qty: 2, price: 90 }];

async function signup(b, devOpt, user) {
  const gas = H({ Ark1: [HEAD] }, { settings: { SIGNUP_CODE: "invite" } }), ctx = await b.newContext(devOpt);
  await require("./turnstile-fake")(ctx);
  await ctx.route(require("./api-route"), async route => { const q = JSON.parse(route.request().postData() || "{}"); await route.fulfill({ contentType: "application/json", body: JSON.stringify(gas.call(q)) }); });
  const p = await ctx.newPage(), errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  await p.goto(BASE); await p.waitForTimeout(400);
  await p.click("#gateToggle"); await p.fill("#gateUser", user); await p.fill("#gatePass", user + "-pass-1"); await p.fill("#gateInvite", "invite"); await p.fill("#gatePass2", user + "-pass-1"); await p.fill("#gateEmail", "someone@example.com"); await p.click("#gateSubmit");
  await p.waitForSelector("#recModal.open", { timeout: 20000 }); await p.check("#recOk"); await p.click("#recDone");
  await p.waitForSelector("#app:not([hidden])", { timeout: 20000 });
  await p.evaluate(async w => { await api({ action: "addmany", bumps: [], wines: w }); await loadData(); }, WINES); await p.waitForTimeout(400);
  return { ctx, p, errs };
}
const rows = p => p.$$eval("#rows tr.main", t => t.map(r => r.querySelector("td").textContent.trim()));
const W = (p, prod) => p.evaluate(n => { const w = window.WINES.find(x => x.producer === n); return w && { left: w.left, drunk: w.drunk, location: w.location }; }, prod);

(async () => {
  const b = await chromium.launch();
  // ── a computer ──
  const { p, errs } = await signup(b, { viewport: { width: 1300, height: 900 } }, "lotte");
  check("four wines in the list", (await rows(p)).length === 4);
  await p.selectOption("#fCountry", "Frankrig"); await p.waitForTimeout(200);
  await p.evaluate(() => document.querySelector('th[data-k="vintage"]') && document.querySelector('th[data-k="vintage"]').click()); await p.waitForTimeout(200);
  await p.fill("#q", "chablis"); await p.waitForTimeout(250);
  await p.reload(); await p.waitForSelector("#app:not([hidden])", { timeout: 20000 }); await p.waitForTimeout(700);
  const kept = await p.evaluate(() => ({ c: $("fCountry").value, q: $("q").value, k: state.sortK, n: document.querySelectorAll("#rows tr.main").length, clear: $("clear").classList.contains("show") }));
  check("after a reload: the country filter and the sort are kept, the search isn't", kept.c === "Frankrig" && kept.k === "vintage" && kept.q === "" && kept.n === 2 && kept.clear, JSON.stringify(kept));
  // a remembered filter the cellar no longer has is let go
  await p.evaluate(() => { localStorage.setItem("vinList:" + cfg.user, JSON.stringify({ country: "Portugal", sortK: "price", sortDir: -1, status: "cellar", region: "", style: "", ready: "", loc: "" })); });
  await p.reload(); await p.waitForSelector("#app:not([hidden])", { timeout: 20000 }); await p.waitForTimeout(700);
  check("a remembered country the cellar no longer has is let go (all four shown)", (await rows(p)).length === 4 && (await p.inputValue("#fCountry")) === "", String((await rows(p)).length));
  // keys
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  await p.keyboard.press("/"); check("/ goes to the search", await p.evaluate(() => document.activeElement === $("q")));
  await p.keyboard.type("n"); check("…where N is just a letter", (await p.inputValue("#q")) === "n" && !(await p.evaluate(() => $("addModal").classList.contains("open"))));
  await p.fill("#q", ""); await p.waitForTimeout(200);
  await p.keyboard.press("ArrowDown"); const f1 = await p.evaluate(() => document.activeElement.matches("#rows tr.main:first-child"));
  await p.keyboard.press("ArrowDown"); const f2 = await p.evaluate(() => [...document.querySelectorAll("#rows tr.main")].indexOf(document.activeElement));
  await p.keyboard.press("ArrowUp"); const f3 = await p.evaluate(() => [...document.querySelectorAll("#rows tr.main")].indexOf(document.activeElement));
  check("↓ from the search into the list, then ↓ ↑ wine to wine", f1 && f2 === 1 && f3 === 0, JSON.stringify([f1, f2, f3]));
  await p.keyboard.press("ArrowUp"); check("↑ from the first wine goes back to the search", await p.evaluate(() => document.activeElement === $("q")));
  await p.evaluate(() => document.activeElement.blur()); await p.keyboard.press("n"); await p.waitForTimeout(200);
  check("N adds a wine", await p.evaluate(() => $("addModal").classList.contains("open")));
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);
  // Select: move two to a new place, drink one of each of two, Undo
  await p.click("#selBtn"); await p.waitForTimeout(150);
  check("Select shows the bar, nothing chosen yet", await p.isVisible("#selBar") && /Tap the wines/.test(await p.textContent("#selN")) && await p.isDisabled("#selMove"));
  const rowOf = n => p.$(`#rows tr.main:has-text("${n}")`);
  await (await rowOf("Domaine A")).click(); await (await rowOf("Weingut C")).click(); await p.waitForTimeout(150);
  check("tapping wines chooses them (and doesn't open them)", /2 wines chosen/.test(await p.textContent("#selN")) && !(await p.$("#rows tr.detail:not([hidden])")), await p.textContent("#selN"));
  await p.click("#selMove"); await p.waitForSelector("#moveModal.open"); await p.fill("#moveTo", "Garage, kasse 2"); await p.click("#moveSave"); await p.waitForTimeout(900);
  check("Move to…: both moved, the others untouched", (await W(p, "Domaine A")).location === "Garage, kasse 2" && (await W(p, "Weingut C")).location === "Garage, kasse 2" && (await W(p, "Domaine B")).location === "Kælder, reol 1");
  check("…and Select ends", !(await p.isVisible("#selBar")) && !(await p.evaluate(() => document.body.classList.contains("selecting"))));
  await p.click("#selBtn"); await (await rowOf("Domaine A")).click(); await (await rowOf("Bodega D")).click();
  await p.click("#selDrink"); await p.waitForSelector("#askModal.open"); await p.click("#askOk").catch(async () => { await p.evaluate(() => ASK_DONE(true)); }); await p.waitForTimeout(1200);
  const d1 = [await W(p, "Domaine A"), await W(p, "Bodega D")];
  check("Drink one of each: a bottle of each gone", d1[0].left === 2 && d1[1].left === 1, JSON.stringify(d1));
  const undo = await p.$('#actbar button:has-text("Undo")'); if (undo) await undo.click(); await p.waitForTimeout(1200);
  const d2 = [await W(p, "Domaine A"), await W(p, "Bodega D")];
  check("…and one Undo puts both back", !!undo && d2[0].left === 3 && d2[1].left === 2, JSON.stringify(d2));
  check("no errors on the computer", !errs.length, errs.slice(0, 3).join(" | "));

  // ── a phone: swipe left to drink ──
  const m = await signup(b, { ...devices["iPhone 13"] }, "mikkel"), q = m.p, cdp = await m.ctx.newCDPSession(q);
  const swipe = async (x, y, dx) => { const n = 10;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let k = 1; k <= n; k++) { await q.waitForTimeout(20); await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + dx * k / n, y }] }); }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await q.waitForTimeout(1000); };
  await q.evaluate(() => { const r = [...document.querySelectorAll("#rows tr.main")].find(x => /Domaine B/.test(x.textContent)); r.scrollIntoView({ block: "center" }); });
  await q.waitForTimeout(400);
  const box = await q.evaluate(() => { const r = [...document.querySelectorAll("#rows tr.main")].find(x => /Domaine B/.test(x.textContent)).getBoundingClientRect(); return [Math.round(r.right - 30), Math.round(r.top + r.height / 2)]; });
  await swipe(box[0], box[1], -50);
  check("a short swipe on a wine does nothing", (await W(q, "Domaine B")).left === 2);
  await swipe(box[0], box[1], -180);
  check("a swipe to the left drinks a bottle", (await W(q, "Domaine B")).left === 1);
  check("…with Undo offered, as from the button", !!(await q.$('#actbar button:has-text("Undo")')));
  check("no errors on the phone", !m.errs.length, m.errs.slice(0, 3).join(" | "));
  await b.close();
  const pass = results.filter(Boolean).length; console.log(`\n${pass}/${results.length} passed`); process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
