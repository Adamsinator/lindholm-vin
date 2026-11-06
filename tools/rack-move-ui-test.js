// The wine rack moves like the overview's other panels on a phone, too: while it's first it sits above the figures,
// as it always has; ↓ in Customise puts it below the next panel, on screen as well as in the list; it stays there
// after a reload; ↑ brings it back to the top; ✕ takes it away and ＋ brings it back. (A computer: customise-ui-test.)
//   (cd .. && python3 -m http.server 8765) & node tools/rack-move-ui-test.js
"use strict";
const { chromium, devices } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];

// where the rack is: above the figures, or the how-manyth of the overview's shown panels
const where = p => p.evaluate(() => { const wall = document.getElementById("wall"), kp = document.getElementById("kpis");
  const shown = [...document.querySelectorAll("#overview .side-body > [data-panel]")].filter(e => !e.classList.contains("off") && e.offsetParent !== null).map(e => e.dataset.panel);
  return { aboveFigures: wall.nextElementSibling === kp, inPanels: shown.indexOf("rack"), shown: shown.slice(0, 4), visible: wall.offsetParent !== null && !wall.classList.contains("off"),
    beforeNext: (() => { const n = document.querySelector("#overview .side-body > [data-panel]:not(.off):not(#wall)"); return n ? !!(wall.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING) : null; })() }; });

(async () => {
  const b = await chromium.launch(), gas = H({ Ark1: [HEAD] }, { settings: { SIGNUP_CODE: "invite" } }), errs = [];
  const ctx = await b.newContext({ ...devices["iPhone 13"] });
  await require("./turnstile-fake")(ctx);
  await ctx.route(require("./api-route"), async route => { const q = JSON.parse(route.request().postData() || "{}"); await route.fulfill({ contentType: "application/json", body: JSON.stringify(gas.call(q)) }); });
  const p = await ctx.newPage(); p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  await p.goto(BASE); await p.waitForTimeout(400);
  await p.tap("#gateToggle"); await p.fill("#gateUser", "rasmus"); await p.fill("#gatePass", "rasmus-pass-1"); await p.fill("#gateInvite", "invite"); await p.fill("#gatePass2", "rasmus-pass-1"); await p.fill("#gateEmail", "someone@example.com"); await p.tap("#gateSubmit");
  await p.waitForSelector("#recModal.open", { timeout: 20000 }); await p.check("#recOk"); await p.tap("#recDone");
  await p.waitForSelector("#app:not([hidden])", { timeout: 20000 });
  await p.evaluate(async () => { await api({ action: "addmany", bumps: [], wines: [
    { producer: "Domaine A", name: "Bourgogne", country: "Frankrig", region: "Bourgogne", type: "Rød", vintage: 2020, qty: 3 },
    { producer: "Domaine B", name: "Chablis", country: "Frankrig", region: "Bourgogne", type: "Hvid", vintage: 2022, qty: 2 } ] }); await loadData(); });
  await p.waitForTimeout(500);
  const w0 = await where(p);
  check("on a phone, the rack starts on top, above the figures", w0.aboveFigures && w0.visible, JSON.stringify(w0));
  // Customise: ↓ on the rack
  await p.evaluate(() => document.querySelector("#overview .custbtn").click()); await p.waitForTimeout(200);
  await p.evaluate(() => document.querySelector('#overview .custed button[data-act="down"][data-k="rack"]').click()); await p.waitForTimeout(300);
  const w1 = await where(p);
  check("↓ moves it: no longer above the figures, second among the panels on screen", !w1.aboveFigures && w1.inPanels === 1 && w1.visible && w1.beforeNext === false, JSON.stringify(w1));
  await p.reload(); await p.waitForSelector("#app:not([hidden])", { timeout: 20000 }); await p.waitForTimeout(700);
  const w2 = await where(p);
  check("…and it stays there after a reload", !w2.aboveFigures && w2.inPanels === 1, JSON.stringify(w2));
  await p.evaluate(() => document.querySelector("#overview .custbtn").click()); await p.waitForTimeout(200);
  await p.evaluate(() => document.querySelector('#overview .custed button[data-act="up"][data-k="rack"]').click()); await p.waitForTimeout(300);
  const w3 = await where(p);
  check("↑ brings it back on top, above the figures", w3.aboveFigures && w3.visible, JSON.stringify(w3));
  const off = await p.evaluate(() => { const x = document.querySelector('#overview .custed button[data-act="off"][data-k="rack"]'); if (x) x.click(); return !!x; }); await p.waitForTimeout(300);
  const w4 = await where(p);
  check("✕ takes it away", off && !w4.visible && !w4.aboveFigures, JSON.stringify(w4));
  await p.evaluate(() => document.querySelector('#overview .custed button[data-act="on"][data-k="rack"]').click()); await p.waitForTimeout(300);
  check("…and ＋ brings it back", (await where(p)).visible);
  check("no errors on the page", !errs.length, errs.slice(0, 3).join(" | "));
  await b.close();
  const pass = results.filter(Boolean).length; console.log(`\n${pass}/${results.length} passed`); process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
