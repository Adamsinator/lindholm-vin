// Browser test of the tour of the cellar page (tour.js, offered by app.js), against the real Code.gs (gas-harness.js):
//   • a new member: the welcome card offers it; a member who knows the page: a one-time note, gone once taken or declined
//   • 9 steps, each lighting up its control (the phone's own: the ＋, the ⋯ menu, the bar at the bottom); back, next,
//     Esc; seen is remembered; the account menu and index.html#tour (the help page's link) start it again; in Danish too
//   (cd .. && python3 -m http.server 8765) & node tools/tour-ui-test.js
"use strict";
const { chromium } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note", "Drik fra", "Drik til"];
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
async function session(b, rows, vp) {
  const gas = H({ Ark1: [HEAD, ...rows] }), ctx = await b.newContext(vp || { viewport: { width: 1366, height: 900 } }), errs = [];
  await require("./turnstile-fake")(ctx);
  await ctx.route(require("./api-route"), async r => { const p = JSON.parse(r.request().postData() || "{}"); let x;
    if (p.action === "login") x = { ok: true, user: p.user, token: "tok", v: 26 }; else if (p.action === "prelogin") x = { ok: false, error: "bad-code" };
    else { delete p.user; delete p.token; p.code = "test-code"; x = gas.call(p); } await r.fulfill({ contentType: "application/json", body: JSON.stringify(x) }); });
  const p = await ctx.newPage(); p.on("pageerror", e => errs.push(e.message));
  await p.goto(BASE); await p.fill("#gateUser", "adam"); await p.fill("#gatePass", "pw"); await p.click("#gateSubmit");
  // (it timed out once in CI, never here: should it again, say what the page shows)
  await p.waitForSelector("#content:not([hidden])", { timeout: 20000 }).catch(async e => {
    const g = await Promise.race([p.evaluate(() => ({ url: location.href, ready: document.readyState, gate: !document.getElementById("gate").hidden, msg: document.getElementById("gateErr").textContent,
      app: !document.getElementById("app").hidden, spin: document.getElementById("spin").textContent.trim().slice(0, 80) })).catch(x => x.message.split("\n")[0]), new Promise(r => setTimeout(() => r("the page didn't answer in 5 s"), 5000))]);
    console.log("  the login didn't finish: " + JSON.stringify(g) + " · errors: " + errs.join(" | ")); throw e; });
  await p.waitForTimeout(500);
  return { ctx, p, errs };
}
// the card's step, and whether the lit-up hole is round the control it names
const state = p => p.evaluate(() => { const c = document.querySelector(".tour-card"), h = document.querySelector(".tour-hole"); if (!c) return null;
  const hr = h.getBoundingClientRect(), cr = c.getBoundingClientRect();
  return { n: c.querySelector(".tour-n").textContent, h: c.querySelector("h3").textContent, hole: [hr.left, hr.top, hr.right, hr.bottom], card: [cr.left, cr.top, cr.right, cr.bottom], vw: innerWidth, vh: innerHeight }; });
const around = async (p, s, sel) => { const r = await p.evaluate(q => { const e = [...document.querySelectorAll(q)].find(e => e.getBoundingClientRect().width); if (!e) return null; const b = e.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; }, sel);
  return !!r && r[0] > s.hole[0] && r[0] < s.hole[2] && r[1] > s.hole[1] && r[1] < s.hole[3]; };
const onScreen = s => s.card[0] >= 0 && s.card[2] <= s.vw && s.card[1] >= 0 && s.card[3] <= s.vh;
const WINE = ["Krug", "Frankrig", "Champagne", "", "Grande Cuvée", "", "Mousserende", "", "NV", 2, 1800, "", "", "", 2024, 2034];
(async () => {
  const b = await chromium.launch();
  {
    const { ctx, p, errs } = await session(b, []);
    check("a new member: the welcome card offers the tour, and no separate note", await p.isVisible("#tipsTour") && !(await p.isVisible("#tourNote")));
    check("…and it doesn't start by itself (nothing over the page)", !(await p.$(".tour-card")));
    await ctx.close();
  }
  {
    const { ctx, p, errs } = await session(b, [WINE]);
    check("a member who knows the page: a one-time note offers it", await p.isVisible("#tourNote") && !(await p.isVisible("#tips")));
    await p.click("#tourGo"); await p.waitForSelector(".tour-card");
    let s = await state(p);
    check("step 1 of 9: welcome, the card in the middle", /1 of 9/.test(s.n) && /Welcome/.test(s.h) && onScreen(s) && !(await p.isVisible("#tourNote")), JSON.stringify(s));
    const want = [null, "#addBtn", "#impBtn", "#wall", "#q", "#sommBtn", ".gbar .tabs", "a.tablink", "#helpLink"], bad = [];
    for (let k = 1; k < 9; k++) { await p.click(".tour-card .primary"); await p.waitForTimeout(500); s = await state(p);
      if (!new RegExp(`${k + 1} of 9`).test(s.n) || !(await around(p, s, want[k])) || !onScreen(s)) bad.push(k + 1 + " " + s.h); }
    check("…each next step lights up its control, its card on screen", !bad.length, bad.join(" | "));
    check("…the last says Done", /Done/.test(await p.textContent(".tour-card .primary")));
    check("…the last step has no Skip, the others do", !(await p.$(".tour-card .tour-skip")));
    await p.click(".tour-card [data-t=back]"); await p.waitForTimeout(300);
    check("…Back goes a step back", /8 of 9/.test((await state(p)).n));
    await p.keyboard.press("ArrowLeft"); await p.waitForTimeout(300); const kb = (await state(p)).n; await p.keyboard.press("Escape"); await p.waitForTimeout(200);
    check("…the arrow keys step through it; Esc ends it", /7 of 9/.test(kb) && !(await p.$(".tour-card")) && !(await p.$(".tour-shade")), kb);
    await p.reload(); await p.waitForSelector("#content:not([hidden])"); await p.waitForTimeout(400);
    check("seen is remembered: no note after a reload", !(await p.isVisible("#tourNote")));
    await p.goto(BASE + "index.html#tour"); await p.waitForSelector(".tour-card", { timeout: 15000 }).catch(() => {});
    check("index.html#tour (the help page's link) starts it again", !!(await p.$(".tour-card")) && !/#tour/.test(p.url()));
    await p.keyboard.press("Escape");
    await ctx.close();
  }
  {
    const { ctx, p } = await session(b, [WINE]);
    await p.click("#tourNo"); await p.waitForTimeout(200); await p.reload(); await p.waitForSelector("#content:not([hidden])"); await p.waitForTimeout(400);
    check("“Not now” puts the note away for good", !(await p.isVisible("#tourNote")));
    await p.click("#tourBtn", { force: true }).catch(() => p.evaluate(() => document.getElementById("tourBtn").click())); await p.waitForSelector(".tour-card");
    await p.click(".tour-card .primary"); await p.click(".tour-card .primary"); await p.waitForTimeout(300); // to Import: no list to import, so skip the rest
    const sk = await p.textContent(".tour-card .tour-skip"); await p.click(".tour-card .tour-skip"); await p.waitForTimeout(200);
    check("“Skip tour” on any step (here Import) ends it at once", sk === "Skip tour" && !(await p.$(".tour-card")) && !(await p.$(".tour-shade")), sk);
    await ctx.close();
  }
  {
    const { ctx, p, errs } = await session(b, [WINE], { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await p.click("#pMe"); await p.waitForSelector("#meSheet.open"); await p.click('#meMenu [data-press="tourBtn"]'); await p.waitForSelector(".tour-card", { timeout: 10000 });
    const want = { 2: "#pFab", 3: "#pMore", 4: "#wall", 6: "#sommBtn", 7: "#ptabs", 9: "#pMe" }, bad = [];
    for (let k = 2; k <= 9; k++) { await p.click(".tour-card .primary"); await p.waitForTimeout(600); const s = await state(p);
      if (!onScreen(s)) bad.push(k + " off screen"); if (want[k] && !(await around(p, s, want[k]))) bad.push(k + " " + s.h); }
    check("a phone, from the account menu: the ＋, the ⋯ menu, the bar at the bottom and the account button lit up, each card on screen", !bad.length, bad.join(" | "));
    check("a phone: no page errors", !errs.length, errs.join(" | "));
    await ctx.close();
  }
  {
    const { ctx, p, errs } = await session(b, [WINE]);
    await p.evaluate(() => I18N.setLang("da")); await p.waitForTimeout(300);
    await p.evaluate(() => { localStorage.removeItem("vinTour:adam"); }); await p.click("#tourBtn", { force: true }).catch(() => p.evaluate(() => document.getElementById("tourBtn").click()));
    await p.waitForSelector(".tour-card"); const s = await state(p);
    check("in Danish: “Velkommen til AllWine”, “1 af 9”", /Velkommen/.test(s.h) && /1 af 9/.test(s.n), JSON.stringify(s));
    check("no page errors", !errs.length, errs.join(" | "));
    await ctx.close();
  }
  await b.close();
  const k = results.filter(Boolean).length; console.log(`\n${k}/${results.length} passed`); process.exit(k === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
