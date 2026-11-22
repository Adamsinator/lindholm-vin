// Browser test of the atlas by touch on a phone (atlas.js's pointer handling), with real touch events (CDP):
//   • a pinch zooms, and a hand turning a little as it spreads doesn't turn the map; a deliberate twist does
//   • one finger: a double tap zooms in (and opens nothing); a double tap held and dragged down zooms in, as phone maps do
//   • a single tap opens the vineyard after a moment, fitted above its sheet; the back gesture closes the sheet and stays
//     on the map; the ‹ in the breadcrumb goes one level up: the region to its country, the country to Europe
//   (cd .. && python3 -m http.server 8765) & node tools/atlas-touch-ui-test.js
"use strict";
const { chromium } = require("./pw");
const BASE = process.env.BASE || "http://localhost:8765/";
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
(async () => {
  const b = await chromium.launch(), errs = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const p = await ctx.newPage(); p.on("pageerror", e => errs.push(e.message)); await p.route(/^https:\/\//, r => r.abort());
  await p.goto(BASE + "atlas.html"); await p.waitForTimeout(500);
  await p.goto(BASE + "atlas.html#r=cotedor"); await p.waitForFunction(() => typeof st === "object" && st.region && st.region.id === "cotedor" && st.view, null, { timeout: 30000 }); await p.waitForTimeout(800);
  const cdp = await ctx.newCDPSession(p), touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
  const W = () => p.evaluate(() => st.view[2]), cx = 195, cy = 420, two = (d, a) => [[cx - d / 2 * Math.cos(a), cy - d / 2 * Math.sin(a)], [cx + d / 2 * Math.cos(a), cy + d / 2 * Math.sin(a)]];
  const pinch = async (d0, d1, turn) => { await touch("touchStart", two(d0, .5)); for (let i = 1; i <= 12; i++) { await touch("touchMove", two(d0 + (d1 - d0) * i / 12, .5 + turn * Math.PI / 180 * i / 12)); await p.waitForTimeout(16); } await touch("touchEnd", []); await p.waitForTimeout(500); };
  const tap = async (x, y) => { await touch("touchStart", [[x, y]]); await touch("touchEnd", []); };
  let w = await W(); await pinch(60, 200, 18);
  const z = w / await W(), turn = await p.evaluate(() => ROT.a);
  check("a pinch zooms in (about 3×), and the hand turning 18° as it spreads leaves the map north up", z > 2.5 && z < 4 && turn === 0, z.toFixed(2) + " " + turn);
  await pinch(150, 150, 40);
  check("…a deliberate twist (40°, no zoom) turns it", Math.abs(await p.evaluate(() => ROT.a)) >= 30, await p.evaluate(() => ROT.a));
  await p.evaluate(() => { rotateTo(0); fit(st.home); }); await p.waitForTimeout(600);
  w = await W(); await tap(120, 200); await p.waitForTimeout(120); await tap(120, 200); await p.waitForTimeout(600);
  check("a double tap zooms in 2×, and opens no vineyard on the way", Math.abs(w / await W() - 2) < .1 && await p.evaluate(() => !st.sel && !document.body.classList.contains("side-open")), (w / await W()).toFixed(2));
  w = await W(); await tap(120, 200); await p.waitForTimeout(120); await touch("touchStart", [[120, 200]]);
  for (let i = 1; i <= 10; i++) { await touch("touchMove", [[120, 200 + i * 12]]); await p.waitForTimeout(16); } await touch("touchEnd", []); await p.waitForTimeout(500);
  check("…a double tap held and dragged down zooms in with one finger, and opens nothing", w / await W() > 1.8 && await p.evaluate(() => !st.sel), (w / await W()).toFixed(2));
  await p.evaluate(() => fit(bbOf(st.pack.climats.find(c => c.id === "latache").g), 2)); await p.waitForTimeout(600);
  const at = await p.evaluate(() => { const r = st.pack.climats.find(c => c.id === "latache").el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await tap(at[0], at[1]); await p.waitForTimeout(60);
  const early = await p.evaluate(() => st.sel); await p.waitForTimeout(1000);
  const box = await p.evaluate(() => { const r = st.pack.climats.find(c => c.id === "latache").el.getBoundingClientRect(), s = document.getElementById("sideWrap").getBoundingClientRect(); return [st.sel, r.top, r.bottom, s.top]; });
  check("a single tap opens the vineyard a moment later (a second tap would have made it a zoom)", !early && box[0] === "latache", JSON.stringify([early, box[0]]));
  check("…and the map fits it in the space above its sheet", box[1] > 0 && box[2] < box[3], JSON.stringify(box));
  await p.goBack(); await p.waitForTimeout(700);
  check("the back gesture closes the vineyard and stays on the map", await p.evaluate(() => !st.sel && !document.body.classList.contains("side-open") && st.region && st.region.id === "cotedor"));
  await p.click(".crumb [data-up]"); await p.waitForTimeout(1000);
  const c1 = await p.evaluate(() => [location.hash, !!st.region]);
  await p.click(".crumb [data-up]"); await p.waitForTimeout(1000);
  check("the ‹ in the breadcrumb: the region to France, France to Europe (where it goes away)", c1[0] === "#c=fr" && !c1[1] && await p.evaluate(() => location.hash === "" && !document.querySelector(".crumb [data-up]")), JSON.stringify(c1));
  const dk = await b.newPage({ viewport: { width: 1300, height: 900 } }); await dk.goto(BASE + "atlas.html#r=cotedor"); await dk.waitForTimeout(1500);
  check("…on a computer the breadcrumb is as before, without it", await dk.evaluate(() => { const u = document.querySelector(".crumb [data-up]"); return !u || getComputedStyle(u).display === "none"; }));
  check("no page errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
