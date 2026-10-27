// Browser test of a big cellar and of a customised overview, against the real Code.gs (gas-harness.js), on an
// encrypted account:
//   • the list shows 100 wines, and the next 100 come by themselves when the end scrolls near; "Show all" shows the rest
//   • the overview starts with a calm few panels; "Customise" adds, moves and removes them, and Reset puts it back
//   • the layout is kept on the device and in the vault, so a second device that logs in gets the same
//   (cd .. && python3 -m http.server 8765) & node tools/customise-ui-test.js
"use strict";
const { chromium } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];
const P = [["Domaine Roulot", "Bourgogne", "Meursault", "Perrières", "1er Cru", "Hvid", "Chardonnay"], ["Armand Rousseau", "Bourgogne", "Gevrey-Chambertin", "Clos St-Jacques", "1er Cru", "Rød", "Pinot Noir"],
  ["Krug", "Champagne", "Reims", "Grande Cuvée", "", "Mousserende", "Chardonnay"], ["Giacomo Conterno", "Piemonte", "Monforte d'Alba", "Barolo Cascina Francia", "", "Rød", "Nebbiolo"]];
const WINES = Array.from({ length: 250 }, (_, i) => { const p = P[i % 4], y = 1990 + i % 33;
  return { producer: p[0] + (i >= 4 ? " " + Math.floor(i / 4) : ""), country: "Frankrig", region: p[1], commune: p[2], name: p[3], classification: p[4], type: p[5], grape: p[6],
    vintage: y, qty: 2, drunk: i % 5 === 0 ? 1 : 0, price: [150, 420, 900, 2200][i % 4], value: i % 3 === 0 ? 1000 : undefined, drinkFrom: y + 3, drinkTo: y + 30 + i % 9 }; });

async function device(b, gas) {
  const ctx = await b.newContext({ viewport: { width: 1500, height: 900 } });
  await require("./turnstile-fake")(ctx);
  await ctx.route(require("./api-route"), async route => { const q = JSON.parse(route.request().postData() || "{}");
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(gas.call(q)) }); });
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  return { ctx, p, errs };
}
const rows = p => p.$$eval("#rows tr.main", t => t.length);
// the overview's panels that show, in order
const shown = (p, id) => p.$$eval(`#${id} .side-body > [data-panel]`, els => els.filter(e => !e.classList.contains("off")).map(e => e.dataset.panel));
const visible = (p, id) => p.$$eval(`#${id} .side-body > [data-panel]`, els => els.filter(e => e.offsetParent !== null).map(e => e.dataset.panel));
const act = (p, id, a, k) => p.click(`#${id} .custed button[data-act="${a}"]${k ? `[data-k="${k}"]` : ""}`);

(async () => {
  const b = await chromium.launch();
  const gas = H({ Ark1: [HEAD] }, { settings: { SIGNUP_CODE: "invite" } });

  // ── device one: sign up, fill the cellar ──
  const one = await device(b, gas), p = one.p;
  await p.goto(BASE); await p.waitForTimeout(400);
  await p.click("#gateToggle"); await p.fill("#gateUser", "hanne"); await p.fill("#gatePass", "hanne-pass-1"); await p.fill("#gateInvite", "invite"); await p.fill("#gatePass2", "hanne-pass-1"); await p.fill("#gateEmail", "someone@example.com"); await p.click("#gateSubmit");
  await p.waitForSelector("#recModal.open", { timeout: 20000 }); await p.check("#recOk"); await p.click("#recDone");
  await p.waitForSelector("#app:not([hidden])", { timeout: 20000 });
  await p.evaluate(async w => { await api({ action: "addmany", wines: w, bumps: [] }); await loadData(); }, WINES);
  await p.waitForTimeout(500);

  // big cellar: 100 at a time, more as the end scrolls near
  check("the list starts with 100 wines", (await rows(p)) === 100, String(await rows(p)));
  check("…and says how many there are", /Showing 100 of 250/.test(await p.textContent("#rows tr.morerow")));
  await p.locator("#rows tr.morerow").scrollIntoViewIfNeeded(); await p.waitForTimeout(400);
  const after = await rows(p);
  check("scrolling to the end loads the next 100 by itself", after === 200, String(after));
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.click("#rows tr.morerow button[data-all]"); await p.waitForTimeout(200);
  check("'Show all' shows the rest", (await rows(p)) === 250 && !(await p.$("#rows tr.morerow")), String(await rows(p)));
  await p.fill("#q", "Krug"); await p.waitForTimeout(300);
  check("a search starts again from the top, over the whole cellar", (await rows(p)) === 62 && !(await p.$("#rows tr.morerow")), String(await rows(p)));
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.fill("#q", ""); await p.waitForTimeout(300);
  check("…and clearing it shows 100 again", (await rows(p)) === 100, String(await rows(p)));

  // the calm default
  const DEF = ["insights", "press", "regions", "map", "vintages", "worth"];
  check("the overview starts with six panels, the map among them", JSON.stringify(await shown(p, "overview")) === JSON.stringify(DEF), (await shown(p, "overview")).join());
  check("…and only those are on screen", JSON.stringify(await visible(p, "overview")) === JSON.stringify(DEF), (await visible(p, "overview")).join());
  check("the editor is closed until Customise", await p.isHidden("#overview .custed") && await p.isVisible("#overview .custbtn"));

  await p.click("#overview .custbtn");
  check("Customise opens the editor, with the panels to add", await p.isVisible("#overview .custed") &&
    (await p.$$eval("#overview .custed button[data-act=on]", bs => bs.map(x => x.dataset.k))).join() === "producers,styles,buy,bands,hist");
  check("…where the first can't move up nor the last down",
    await p.isDisabled('#overview .custed button[data-act="up"][data-k="insights"]') && await p.isDisabled('#overview .custed button[data-act="down"][data-k="worth"]'));
  await act(p, "overview", "on", "producers"); await p.waitForTimeout(150);
  check("＋ adds a panel at the end, drawn", (await shown(p, "overview")).slice(-1)[0] === "producers" && (await p.$$eval("#producers > *", e => e.length)) > 0);
  await act(p, "overview", "up", "producers"); await act(p, "overview", "up", "producers"); await p.waitForTimeout(150);
  check("↑ moves it up", JSON.stringify(await shown(p, "overview")) === JSON.stringify(["insights", "press", "regions", "map", "producers", "vintages", "worth"]), (await shown(p, "overview")).join());
  check("…and the keyboard stays on the same button", await p.evaluate(() => document.activeElement.dataset.k === "producers" && document.activeElement.dataset.act === "up"));
  await act(p, "overview", "off", "regions"); await act(p, "overview", "down", "insights"); await p.waitForTimeout(150);
  const MINE = ["press", "insights", "map", "producers", "vintages", "worth"];
  check("✕ removes one, ↓ moves one down", JSON.stringify(await shown(p, "overview")) === JSON.stringify(MINE), (await shown(p, "overview")).join());
  check("…and the page shows them in that order", JSON.stringify(await visible(p, "overview")) === JSON.stringify(MINE), (await visible(p, "overview")).join());
  await act(p, "overview", "done");
  check("Done closes the editor", await p.isHidden("#overview .custed"));

  // Enjoyed has its own
  await p.goto(BASE + "#enjoyed"); await p.waitForSelector("#pageEnjoyed:not([hidden])", { timeout: 20000 }); await p.waitForTimeout(400);
  check("Enjoyed starts with its three", (await shown(p, "eOverview")).join() === "estyles,eproducers,etime", (await shown(p, "eOverview")).join());
  await p.click("#eOverview .custbtn"); await act(p, "eOverview", "off", "etime"); await act(p, "eOverview", "done");
  check("…and one can go", (await shown(p, "eOverview")).join() === "estyles,eproducers");
  await p.waitForTimeout(1800); // the vault save waits a moment for more changes

  // ── device two: the same account, logged in afresh ──
  const two = await device(b, gas), q = two.p;
  await q.goto(BASE); await q.waitForTimeout(400);
  await q.fill("#gateUser", "hanne"); await q.fill("#gatePass", "hanne-pass-1"); await q.click("#gateSubmit");
  await q.waitForSelector("#app:not([hidden])", { timeout: 20000 }); await q.waitForTimeout(600);
  check("another device gets the same layout, from the vault", JSON.stringify(await shown(q, "overview")) === JSON.stringify(MINE) &&
    (await shown(q, "eOverview")).join() === "estyles,eproducers", (await shown(q, "overview")).join() + " / " + (await shown(q, "eOverview")).join());
  const rec = gas.call({ action: "vget", user: "hanne", token: await q.evaluate(() => cfg.token) });
  check("…kept encrypted (no panel names in the stored record)", rec.records && rec.records["meta:prefs"] && /^v1\./.test(rec.records["meta:prefs"].data) &&
    !/producers|insights/.test(JSON.stringify(rec.records)), Object.keys(rec.records || {}).join());
  await q.click("#overview .custbtn"); await act(q, "overview", "reset"); await q.waitForTimeout(150);
  check("Reset to default puts the six back", JSON.stringify(await shown(q, "overview")) === JSON.stringify(DEF), (await shown(q, "overview")).join());
  await q.reload(); await q.waitForSelector("#app:not([hidden])", { timeout: 20000 }); await q.waitForTimeout(600);
  check("…and stays so after a reload", JSON.stringify(await shown(q, "overview")) === JSON.stringify(DEF), (await shown(q, "overview")).join());
  check("the cellar is untouched by all of it", (await q.evaluate(() => WINES.length)) === 250);

  check("no console errors", !one.errs.length && !two.errs.length, one.errs.concat(two.errs).join(" | "));
  await b.close();
  const ok = results.filter(Boolean).length;
  console.log(`\n${ok}/${results.length} passed`);
  process.exit(ok === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
