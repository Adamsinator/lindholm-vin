// The atlas's sheets on a phone (atlas.js): the vineyard's details and the menu have a handle, and it works as it
// looks. A short drag springs back; the details' handle dragged up takes most of the screen, a little down brings it
// back; far enough down, or a flick, closes the sheet; inside a sheet scrolled down the same finger movement scrolls.
// Real touch events (Chrome's Input.dispatchTouchEvent), on an iPhone 13.
//   (cd .. && python3 -m http.server 8765) & node tools/atlas-sheet-ui-test.js
"use strict";
const { chromium, devices } = require("./pw");
const BASE = process.env.BASE || "http://localhost:8765/";
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const BLANK = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

(async () => {
  const b = await chromium.launch(), errs = [];
  const ctx = await b.newContext({ ...devices["iPhone 13"] });
  await ctx.route(/data\.geopf\.fr|tile|basemaps|arcgisonline/, r => r.fulfill({ contentType: "image/png", body: BLANK })); // the map's tiles: not needed here
  const p = await ctx.newPage(); p.on("pageerror", e => errs.push(e.message));
  const cdp = await ctx.newCDPSession(p);
  const swipe = async (x, y, dy, ms = 250) => { const n = 10, pt = k => [{ x, y: y + dy * k / n }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(0) });
    for (let k = 1; k <= n; k++) { await p.waitForTimeout(ms / n); await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pt(k) }); }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await p.waitForTimeout(500); };
  const top = sel => p.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return [Math.round(r.left + r.width / 3), Math.round(r.top + 14), Math.round(r.height)]; }, sel);
  const open = () => p.evaluate(() => document.body.classList.contains("side-open"));
  const tall = () => p.evaluate(() => document.getElementById("sideWrap").classList.contains("tall"));
  const show = async () => { await p.evaluate(() => { location.hash = "#r=cotedor"; }); await p.waitForTimeout(600);
    await p.evaluate(() => { location.hash = "#r=cotedor&c=laromanee"; }); await p.waitForFunction(() => document.body.classList.contains("side-open"), null, { timeout: 15000 }); await p.waitForTimeout(500); };

  await p.goto(BASE + "atlas.html#r=cotedor&c=laromanee");
  await p.waitForFunction(() => document.body.classList.contains("side-open"), null, { timeout: 30000 }); await p.waitForTimeout(800);
  await p.waitForFunction(() => /smallest/.test(document.getElementById("side").textContent), null, { timeout: 15000 }).catch(() => {});
  check("La Romanée: France's smallest appellation, and why that's no slip (each grand cru is one)", /smallest appellation \(each grand cru is an appellation of its own\)/.test(await p.textContent("#side")), (await p.textContent("#side")).slice(0, 300));

  let [x, y, h0] = await top("#sideWrap");
  await swipe(x, y, 40);
  check("a short drag down springs back", await open() && !(await tall()));
  await swipe(x, y, -160);
  const h1 = (await top("#sideWrap"))[2];
  check("the handle dragged up: the details take most of the screen", await open() && await tall() && h1 > h0 * 1.4, `${h0} → ${h1}`);
  [x, y] = await top("#sideWrap"); await swipe(x, y, 70);
  check("…a little down: back to its size, still open", await open() && !(await tall()));
  [x, y] = await top("#sideWrap"); await swipe(x, y, 220);
  check("far enough down: closed, and the vineyard let go", !(await open()) && await p.evaluate(() => !/[&#]c=/.test(location.hash)), await p.evaluate(() => location.hash));

  // a flick: the finger rests, then moves 90 px fast (short of "far enough": it's the speed that closes it)
  await show(); [x, y] = await top("#sideWrap");
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] }); await p.waitForTimeout(300);
  for (let k = 1; k <= 6; k++) { await p.waitForTimeout(12); await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + k * 15 }] }); }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await p.waitForTimeout(500);
  check("a flick down closes it too", !(await open()));

  // scrolled down inside (tall, then scrolled): a finger moving down from the middle scrolls, the sheet stays
  await show(); [x, y] = await top("#sideWrap"); await swipe(x, y, -160);
  await p.evaluate(() => { document.getElementById("sideWrap").scrollTop = 200; }); await p.waitForTimeout(200);
  const st0 = await p.evaluate(() => document.getElementById("sideWrap").scrollTop);
  const mid = await p.evaluate(() => { const r = document.getElementById("sideWrap").getBoundingClientRect(); return [Math.round(r.left + r.width / 3), Math.round(r.top + r.height / 2)]; });
  await swipe(mid[0], mid[1], 150);
  check("inside a sheet scrolled down the same movement scrolls, and it stays open", st0 > 0 && await open(), `scrollTop ${st0}`);

  // the menu: a sheet with a handle too
  await p.evaluate(() => document.getElementById("menuBtn").click()); await p.waitForTimeout(500);
  const menuOpen = () => p.evaluate(() => !document.getElementById("menuPanel").hidden);
  check("(the menu is open)", await menuOpen());
  [x, y] = await top("#menuPanel"); await swipe(x, y, 220);
  check("the menu: dragged down far enough, closed", !(await menuOpen()));
  check("no page errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
