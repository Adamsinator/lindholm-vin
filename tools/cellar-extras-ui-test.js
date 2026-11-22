// Browser test of the cellar's smaller conveniences:
//   • the value over time under "Bought and drunk by year", from purchase and drink dates (checked month by month)
//   • the Undo bar closes when a dialog is opened after it, and stays when something inside an open dialog raised it
//   • the admin page says which Code.gs the server runs against the one this site expects, and how to deploy
//   • on a phone, an opened wine's actions fill their rows, and its location field's example fits
//   (cd .. && python3 -m http.server 8765) & node tools/cellar-extras-ui-test.js
"use strict";
const { chromium, devices } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };

(async () => {
  const gas = H({ Ark1: [HEAD] }, { settings: { SIGNUP_CODE: "invite" } }), b = await chromium.launch(); let oldApi = false;
  const ctxFor = async opt => { const ctx = await b.newContext(opt); await require("./turnstile-fake")(ctx); await require("./ask-auto")(ctx);
    await ctx.route(require("./api-route"), r => { const q = JSON.parse(r.request().postData() || "{}"), res = gas.call(q); if (oldApi && q.action === "admin") res.v = 58;
      r.fulfill({ contentType: "application/json", body: JSON.stringify(res) }); }); return ctx; };
  const signup = async (p, user) => {
    await p.goto(BASE); await p.waitForTimeout(400); await p.click("#gateToggle");
    await p.fill("#gateUser", user); await p.fill("#gatePass", user + "-pass-1"); await p.fill("#gateInvite", "invite"); await p.fill("#gatePass2", user + "-pass-1"); await p.fill("#gateEmail", user + "@example.com");
    await p.click("#gateSubmit"); await p.waitForSelector("#recModal.open", { timeout: 20000 }); await p.check("#recOk"); await p.click("#recDone");
    await p.waitForSelector("#app:not([hidden])", { timeout: 20000 }); await p.waitForTimeout(800); await p.keyboard.press("Escape"); await p.keyboard.press("Escape"); };

  // ── a computer ──
  const ctx = await ctxFor({ viewport: { width: 1300, height: 950 } }), p = await ctx.newPage(), errs = [];
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  await signup(p, "ole");
  gas.run(`setUser(findUser('ole'), 'OldSheet', SpreadsheetApp.getActiveSpreadsheet().getId())`); // the owner
  // two bottles of A at 100 kr. bought January 2024, one drunk June 2025; one of B at 500 kr. bought March 2025 (valued
  // 800); C has no purchase date
  await p.evaluate(async () => {
    await api({ action: "add", wine: { producer: "Domaine A", country: "Frankrig", region: "Bourgogne", qty: 2, price: 100, acquired: "2024-01-10" } });
    await api({ action: "add", wine: { producer: "Domaine B", country: "Frankrig", region: "Bourgogne", qty: 1, price: 500, acquired: "2025-03-05" } });
    await api({ action: "add", wine: { producer: "Domaine C", country: "Frankrig", region: "Bourgogne", qty: 1, price: 300 } });
    await loadData(true);
    const a = WINES.find(w => w.producer === "Domaine A"), bb = WINES.find(w => w.producer === "Domaine B");
    await api({ action: "drink", row: a.row, qty: 1 }); await api({ action: "setdate", row: a.row, field: "drunkDate", value: "2025-06-01" });
    await api({ action: "setvalue", row: bb.row, value: 800 }); await api({ action: "setdate", row: (WINES.find(w => w.producer === "Domaine C") || {}).row, field: "acquired", value: "" }).catch(() => {});
    await loadData(true); });
  await p.reload(); await p.waitForSelector("#app:not([hidden])", { timeout: 30000 }); await p.waitForTimeout(1500); await p.keyboard.press("Escape");
  await p.evaluate(() => { const d = document.getElementById("overview"); if (d && d.tagName === "DETAILS") d.open = true; });
  await p.waitForSelector("#valTime", { state: "attached", timeout: 10000 });
  const vt = await p.evaluate(() => ({ k: document.querySelector("#valTime .vt-k").textContent.replace(/\s+/g, " "), note: document.querySelector("#valTime .ph").textContent,
    tips: Object.fromEntries([...document.querySelectorAll("#valTime circle title")].map(t => t.textContent.split(": "))) }));
  const tip = m => vt.tips[m] || "";
  check("value over time: February 2025, two bottles of A at 100 kr.", /^200 kr/.test(tip("Feb 2025")), JSON.stringify(vt.tips).slice(0, 300));
  check("…July 2025, one of A drunk, B bought: 600 kr.", /^600 kr/.test(tip("Jul 2025")), tip("Jul 2025"));
  check("…now 600 kr. at cost, 900 kr. at your values (B valued 800)", /at cost now 600 kr/.test(vt.k) && /at your values 900 kr/.test(vt.k), vt.k);
  check("…the wine without a purchase date is said to be left out", /1 wine without a purchase date or price isn't in it/.test(vt.note), vt.note);
  // no wine with a value set: the panel is the curve alone, called what it is, and its change said as bottles, not prices
  // the 12-month change with purchases and drinking left out (modified Dietz), worked out here: B's value runs from 500 kr.
  // on its purchase date to 800 on its valuation date at a steady rate; a year ago A (one bottle left) stood at its price
  const dz = await p.evaluate(() => { const b = WINES.find(w => w.producer === "Domaine B"), e = b.valueLog[b.valueLog.length - 1];
    const F = s => { const [y, m, d] = s.split("-").map(Number); return y * 12 + m - 1 + (d - 1) / 30.5; }, now = F(todayStr()), t0 = now - 12;
    const vB0 = 500 * Math.pow(e.v / 500, (t0 - F(b.acquired)) / (F(e.d) - F(b.acquired))), B = vB0 + 100, E = e.v + 100;
    return { want: Math.round((E - B) / B * 1000) / 10, line: document.querySelector("#valTime .vt-r") && document.querySelector("#valTime .vt-r").textContent }; });
  check("…the 12-month change, purchases and drinking left out, is the money-weighted one worked out by hand", dz.line && new RegExp("^\\+" + String(dz.want).replace(".", "[.,]") + " %").test(dz.line), JSON.stringify(dz));
  const noVal = await p.evaluate(() => { const keep = WINES.map(w => [w.value, w.valueLog]); WINES.forEach(w => { w.value = null; w.valueLog = []; }); renderOverview();
    const r = { h3: document.querySelector("#valTime h3").textContent, h2: getComputedStyle(document.querySelector("#worthPanel > h2")).display, k: document.querySelector("#valTime .vt-k").textContent.replace(/\s+/g, " ") };
    WINES.forEach((w, i) => { [w.value, w.valueLog] = keep[i]; }); renderOverview(); return r; });
  check("…with no values set: \"What the cellar cost, over time\", the value-against-price heading hidden, the change put down to bottles bought and drunk",
    noVal.h3 === "What the cellar cost, over time" && noVal.h2 === "none" && /on a year ago, from bottles bought and drunk/.test(noVal.k), JSON.stringify(noVal));

  // a wine's valuations, in its details: one added with a date and where it came from, listed, then taken out
  await p.evaluate(() => { const d = document.getElementById("overview"); if (d && d.tagName === "DETAILS") d.open = false; });
  await p.click('#rows tr.main:has-text("Domaine A")'); await p.waitForSelector("#rows tr.detail:not([hidden]) details.vlog", { timeout: 8000 });
  const vl = '#rows tr.detail:not([hidden]) details.vlog';
  await p.click(vl + " summary"); await p.fill(vl + " .vd", "2025-09-01"); await p.fill(vl + " .vv", "150"); await p.fill(vl + " .vs", "Wine-Searcher");
  const ws = await p.getAttribute(vl + " .vws", "href");
  await p.click(vl + " .vgo"); await p.waitForFunction(() => (WINES.find(w => w.producer === "Domaine A").valueLog || []).length === 1, null, { timeout: 10000 }).catch(() => {});
  const added = await p.evaluate(() => WINES.find(w => w.producer === "Domaine A").valueLog);
  await p.waitForSelector(vl + " li", { timeout: 8000 }).catch(() => {});
  const shown = await p.textContent(vl).catch(() => "");
  check("a wine's details: a valuation added with its date and source, the newest listed, its value the wine's value",
    JSON.stringify(added) === JSON.stringify([{ d: "2025-09-01", v: 150, s: "Wine-Searcher" }]) && /150 kr/.test(shown) && /Wine-Searcher/.test(shown), JSON.stringify(added) + " | " + shown.slice(0, 160));
  check("…a link looks the wine up on Wine-Searcher (the person's own search, nothing sent by the site)", /^https:\/\/www\.wine-searcher\.com\/find\/domaine\+a$/.test(ws || ""), ws);
  if (await p.isVisible(vl + " .vdel")) { await p.click(vl + " .vdel"); await p.waitForFunction(() => !(WINES.find(w => w.producer === "Domaine A").valueLog || []).length, null, { timeout: 10000 }).catch(() => {}); }
  check("…and taken out again", await p.evaluate(() => !(WINES.find(w => w.producer === "Domaine A").valueLog || []).length && WINES.find(w => w.producer === "Domaine A").value == null));

  // the Undo bar and dialogs
  await p.evaluate(() => notify("Renamed", [{ label: "Undo", fn() {} }])); await p.waitForTimeout(600);
  check("(the Undo bar shows)", await p.isVisible("#actbar"));
  await p.click("#expBtn"); await p.waitForSelector("#expModal.open"); await p.waitForTimeout(200);
  check("a dialog opened after the Undo bar came up: the bar closes", await p.isHidden("#actbar"));
  await p.evaluate(() => notify("Saved inside", [{ label: "Undo", fn() {} }])); await p.waitForTimeout(600);
  check("…a bar raised while the dialog is open stays", await p.isVisible("#actbar"));
  await p.click("#expCancel"); await p.evaluate(() => closeNotify());

  // the admin page: the server's Code.gs against this site's
  await p.click("#adminBtn"); await p.waitForFunction(() => document.getElementById("adminApi") && document.getElementById("adminApi").textContent, null, { timeout: 10000 });
  const want = Number((require("fs").readFileSync(require("path").join(__dirname, "..", "apps-script", "Code.gs"), "utf8").match(/const API_VERSION = (\d+)/) || [])[1]);
  const a1 = await p.textContent("#adminApi");
  check(`admin: the server runs version ${want}, as the site expects`, a1.includes(`version ${want}, as this site expects`), a1);
  await p.evaluate(() => document.querySelectorAll(".modal.open").forEach(m => m.classList.remove("open")));
  oldApi = true;
  await p.click("#adminBtn"); await p.waitForFunction(() => /expects/.test(document.getElementById("adminApi").textContent) && /58/.test(document.getElementById("adminApi").textContent), null, { timeout: 10000 });
  const a2 = await p.evaluate(() => ({ t: document.getElementById("adminApi").textContent, old: document.getElementById("adminApi").classList.contains("old") }));
  check("…an older one: says so, with the steps to deploy", a2.old && a2.t.includes(`version 58; this site expects ${want}`) && /Manage deployments/.test(a2.t) && /Extensions → Apps Script/.test(a2.t), a2.t);
  oldApi = false;
  check("no page errors (computer)", !errs.length, errs.join(" | "));
  await ctx.close();

  // ── a phone: an opened wine's actions and location field ──
  const pc = await ctxFor({ ...devices["iPhone 13"] }), q = await pc.newPage(), errs2 = [];
  q.on("pageerror", e => errs2.push(e.message));
  await signup(q, "pia");
  await q.evaluate(async () => { await api({ action: "add", wine: { producer: "Domaine Smoke", name: "Les Tests", country: "Frankrig", region: "Bourgogne", qty: 3, price: 450 } }); await loadData(true); });
  await q.click('#tbl tr.main:has-text("Domaine Smoke")'); await q.waitForTimeout(500);
  const lay = await q.evaluate(() => { const d = document.querySelector("#tbl tr.detail:not([hidden]) .dact"), box = d.getBoundingClientRect();
    const vis = [...d.children].filter(x => x.offsetParent); return { row: Math.round(box.width), w: vis.map(x => Math.round(x.getBoundingClientRect().width)), tops: vis.map(x => Math.round(x.getBoundingClientRect().top)),
      ph: document.querySelector("#tbl tr.detail:not([hidden]) .setloc").placeholder }; });
  const last = lay.w[lay.w.length - 1], alone = lay.tops.filter(t => t === lay.tops[lay.tops.length - 1]).length === 1;
  check("phone: the drink button and a last button alone on its row fill the row; the two side by side share it", lay.w[0] >= lay.row - 2 && (!alone || last >= lay.row - 2) && lay.w[1] === lay.w[2], JSON.stringify(lay));
  check("…and the location field's example is short enough to show", lay.ph === "e.g. Rack 2", lay.ph);
  check("no page errors (phone)", !errs2.length, errs2.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
