// Turning the wine atlas's map, and the locator (atlas.js): ] and the panel's buttons turn the map about the region's
// centre while the place in the middle of the screen stays put; labels stay upright; the compass shows north and puts
// it up again; a vineyard picked on a turned map lands in view; the slope profile's clicks land where they're made; the
// turn is kept for the next visit; the locator shows once zoomed in, with the view outlined (turned with the map), and
// a click on it moves the view there. On a phone the locator stays out of the way.
//   (cd .. && python3 -m http.server 8765) & node tools/atlas-turn-ui-test.js
"use strict";
const { chromium } = require("./pw");
const BASE = process.env.BASE || "http://localhost:8765/";
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };

(async () => {
  const b = await chromium.launch(), errs = [];
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && !/net::|CORS|Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.route(/^https:\/\/(data\.geopf\.fr|sgx\.geodatenzentrum\.de)\//, r => r.abort()); // no tiles from outside
  await p.goto(BASE + "atlas.html#r=chablis"); await p.evaluate(() => { try { localStorage.removeItem("atlasRot"); } catch (e) {} }); await p.reload();
  await p.waitForFunction(() => { try { return !!(st.pack && st.view); } catch (e) { return false; } }, null, { timeout: 20000 }); await p.waitForTimeout(800);
  check("north up to begin with: the compass says so", await p.evaluate(() => ROT.a === 0 && !document.querySelector("#map .turn").hasAttribute("transform")) && (await p.getAttribute("#compass", "title")) === "North is up");
  const mid0 = await p.evaluate(() => { const [x, y, w, h] = st.view; return unrotP([x + w / 2, y + h / 2]); });
  await p.keyboard.press("]"); await p.keyboard.press("]"); await p.waitForTimeout(400);
  const s = await p.evaluate(() => ({ a: ROT.a, tr: document.querySelector("#map .turn").getAttribute("transform"), mid: (() => { const [x, y, w, h] = st.view; return unrotP([x + w / 2, y + h / 2]); })(),
    lb: [...document.querySelectorAll("#map .lb")].filter(e => e.style.display !== "none").map(e => e.getAttribute("transform")) }));
  check("] turns the map 15° at a time, clockwise", s.a === 30 && /^rotate\(30 /.test(s.tr), JSON.stringify(s.a) + " " + s.tr);
  check("…about the middle of the screen, which stays where it was", Math.hypot(s.mid[0] - mid0[0], s.mid[1] - mid0[1]) < 1, JSON.stringify([mid0, s.mid]));
  check("…with every shown label turned back, so it reads upright", s.lb.length > 5 && s.lb.every(t => /^rotate\(-30 /.test(t)), s.lb.slice(0, 3).join(" | "));
  const ang = await p.evaluate(() => { const t = document.querySelector("#map .lb:not([style*='none'])"), m = t.getScreenCTM(); return Math.round(Math.atan2(m.b, m.a) * 180 / Math.PI); });
  check("…as the screen shows it (0° on screen)", Math.abs(ang) < 1, String(ang));
  check("the compass points north and says the map is turned", /Turned 30°/.test(await p.getAttribute("#compass", "title")) && /rotate\(-30\)/.test(await p.getAttribute("#compass .needle", "transform")));
  // a vineyard picked on the turned map is in view
  await p.evaluate(() => select(st.pack.climats.find(c => c.c === "GC").id, true)); await p.waitForTimeout(800);
  const inView = await p.evaluate(() => { const c = st.pack.climats.find(c => c.id === st.sel), r = c.el.getBoundingClientRect(), m = document.getElementById("map").getBoundingClientRect();
    return r.left >= m.left - 2 && r.right <= m.right + 2 && r.top >= m.top - 2 && r.bottom <= m.bottom + 2 && r.width > 60; });
  check("a vineyard picked on a turned map is framed in view", inView);
  // the slope profile's points go where the clicks are
  await p.evaluate(() => { const b = document.getElementById("profBtn"); if (b.hidden) b.hidden = false; }); await p.click("#profBtn");
  const mb = await p.$eval("#map", e => { const r = e.getBoundingClientRect(); return [r.left + r.width * .4, r.top + r.height * .5]; });
  await p.mouse.click(mb[0], mb[1]); await p.waitForTimeout(200);
  const pt = await p.$eval("#map .profpt", e => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  check("on a turned map the slope profile's point lands under the click", Math.hypot(pt[0] - mb[0], pt[1] - mb[1]) < 3, JSON.stringify([mb, pt]));
  await p.click("#profBtn");
  // kept for the next visit, and the compass puts north up
  await p.reload(); await p.waitForFunction(() => { try { return !!(st.pack && st.view); } catch (e) { return false; } }, null, { timeout: 20000 }); await p.waitForTimeout(500);
  check("the turn is kept for the next visit", await p.evaluate(() => ROT.a) === 30);
  await p.click("#compass"); await p.waitForTimeout(400);
  check("a click on the compass puts north up again", await p.evaluate(() => ROT.a === 0 && !document.querySelector("#map .turn").hasAttribute("transform")));
  await p.click("#styleBtn"); await p.click("#rotL"); await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  check("the Map panel's ⟲ turns it left", await p.evaluate(() => ROT.a) === -15);
  // the locator
  await p.click("#zHome"); await p.waitForTimeout(600);
  check("the locator stays hidden while the whole region is on screen", await p.isHidden("#locator"));
  for (let i = 0; i < 3; i++) { await p.click("#zIn"); await p.waitForTimeout(450); }
  await p.waitForTimeout(400);
  check("…and shows once you've zoomed in", await p.isVisible("#locator"));
  const vp = await p.$eval("#locator .lo-v", e => e.getAttribute("points").split(" ").map(q => q.split(",").map(Number)));
  const side = (a, c) => Math.atan2(c[1] - a[1], c[0] - a[0]) * 180 / Math.PI;
  check("…the view outlined on it, turned as the map is (−15°)", vp.length === 4 && Math.abs(side(vp[0], vp[1]) - 15) < 1, JSON.stringify(vp));
  const v0 = await p.evaluate(() => st.view.slice()), lb = await p.$eval("#locator", e => { const r = e.getBoundingClientRect(); return [r.left + r.width * .15, r.top + r.height * .5]; });
  await p.mouse.click(lb[0], lb[1]); await p.waitForTimeout(700);
  const v1 = await p.evaluate(() => st.view.slice());
  check("a click on the locator moves the view there, at the same zoom", Math.hypot(v1[0] - v0[0], v1[1] - v0[1]) > 300 && Math.abs(v1[2] - v0[2]) < 1, JSON.stringify([v0, v1]));
  await p.evaluate(() => { try { localStorage.removeItem("atlasRot"); } catch (e) {} });
  // a phone: no locator in the way
  const f = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  f.on("pageerror", e => errs.push("phone: " + e.message));
  await f.route(/^https:\/\/(data\.geopf\.fr|sgx\.geodatenzentrum\.de)\//, r => r.abort());
  await f.goto(BASE + "atlas.html#r=chablis"); await f.waitForFunction(() => { try { return !!(st.pack && st.view); } catch (e) { return false; } }, null, { timeout: 20000 });
  await f.evaluate(() => { const [x, y, w, h] = st.view; zoomAt(.2, x + w / 2, y + h / 2); }); await f.waitForTimeout(600); // a phone pinches: no zoom buttons
  check("on a phone the locator stays out of the way, and the compass is there", await f.isHidden("#locator") && await f.isVisible("#compass"));
  check("…and nothing scrolls sideways", await f.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  check("no page errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
