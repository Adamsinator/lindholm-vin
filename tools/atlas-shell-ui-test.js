// The atlas as a map app (atlas.html, atlas.js): a breadcrumb of where you are, the map's look (automatic, light, dark,
// IGN's aerial photos under the vineyards in France), and on a phone the map as the whole screen: regions as chips at
// the bottom, search behind a button, the filters in the Map panel, the vineyard's details sliding up with the
// controls staying above them.
//   (cd .. && python3 -m http.server 8765) & node tools/atlas-shell-ui-test.js
"use strict";
const { chromium } = require("./pw");
const BASE = process.env.BASE || "http://localhost:8765/";
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };

(async () => {
  const b = await chromium.launch(), errs = [];
  // no map tiles from IGN in a test: an empty image answers, and the requests are counted
  const tiles = [];
  const ctxOf = async opt => { const c = await b.newContext(opt);
    // and IGN's heights made up: a slope rising to the west, so the 3D view has something to show
    await c.route(/data\.geopf\.fr\/altimetrie/, r => { const u = new URL(r.request().url()), lon = u.searchParams.get("lon").split("|").map(Number);
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ elevations: lon.map(x => 200 + (5 - x) * 2000) }) }); });
    await c.route(/data\.geopf\.fr\/wmts/, r => { tiles.push(r.request().url()); r.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64") }); });
    return c; };

  // ── a phone ──
  const q = await (await ctxOf({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  q.on("pageerror", e => errs.push(e.message)); q.on("console", m => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await q.goto(BASE + "atlas.html"); await q.waitForTimeout(1200);
  check("phone, start page: the breadcrumb says Europe and how many regions", /Europe/i.test(await q.textContent("#crumb")) && /\d+ regions/i.test(await q.textContent("#crumb")));
  const box = await q.evaluate(() => { const r = document.querySelector(".mapbox").getBoundingClientRect(); return [r.width, r.height, innerWidth, innerHeight]; });
  check("…the map is the whole screen, the header gone", box[0] === box[2] && box[1] === box[3] && await q.isHidden("header.top"), JSON.stringify(box));
  const chips = await q.$$eval("#rchips button", bs => bs.map(x => x.textContent));
  check("…the regions as chips at the bottom, 'All regions' first and lit", chips.length > 15 && /All regions/.test(chips[0]) && /Chablis/.test(chips.join()) && await q.isVisible("#rchips button.on"));
  await q.tap('#rchips button[data-r="chablis"]'); await q.waitForFunction(() => !!st.pack && st.region.id === "chablis", null, { timeout: 10000 }); await q.waitForTimeout(600);
  check("a chip opens its region; the breadcrumb follows with the count of vineyards", /Chablis/.test(await q.textContent("#crumb")) && /\d+ vineyards/i.test(await q.textContent("#crumb")) && (await q.getAttribute("#rchips button.on", "data-r")) === "chablis");
  check("…the filters aren't on the page but in the Map panel", await q.evaluate(() => !!document.querySelector("#pFilters .toolbar #fGC") && !!document.querySelector("#pFilters #legend")) && await q.isHidden("#stylePanel"));
  await q.tap("#styleBtn"); await q.waitForTimeout(300);
  check("the map button opens the Map panel from the bottom", await q.isVisible("#stylePanel") && await q.evaluate(() => Math.abs(document.getElementById("stylePanel").getBoundingClientRect().bottom - innerHeight) <= 2));
  await q.tap('#styles button[data-style="dark"]'); await q.waitForTimeout(200);
  check("Dark: the map's colours turn dark, remembered", (await q.evaluate(() => document.documentElement.dataset.map)) === "dark" && (await q.evaluate(() => localStorage.getItem("atlasStyle"))) === "dark"
    && (await q.getAttribute('#styles button[data-style="dark"]', "aria-checked")) === "true");
  await q.tap('#stylePanel [data-close]'); await q.waitForTimeout(200);
  await q.tap("#srchBtn"); await q.waitForTimeout(200);
  check("search sits behind its button, the box there and focused", await q.isVisible("#srch #fSearch") && await q.evaluate(() => document.activeElement.id === "fSearch"));
  await q.fill("#fSearch", "Valmur"); await q.waitForTimeout(400); await q.tap("#gRes li >> nth=0"); await q.waitForTimeout(900);
  check("…a result opens the vineyard; its details slide up and the search goes", (await q.textContent("#side h2")) === "Valmur" && await q.evaluate(() => document.body.classList.contains("side-open")) && await q.isHidden("#srch"));
  const lift = await q.evaluate(() => { const z = document.querySelector(".mapbox .zoom").getBoundingClientRect(), s = document.getElementById("sideWrap").getBoundingClientRect(); return [Math.round(z.bottom), Math.round(s.top)]; });
  check("…the round controls stay above the details, in reach", lift[0] <= lift[1], JSON.stringify(lift));
  await q.tap("#sideX"); await q.waitForTimeout(400);
  check("✕ closes the details", !(await q.evaluate(() => document.body.classList.contains("side-open"))));
  await q.tap("#crumb [data-info]"); await q.waitForTimeout(300);
  check("the region's name in the breadcrumb opens the region's overview", await q.evaluate(() => document.body.classList.contains("side-open")) && (await q.textContent("#side h2")) === "Chablis");
  await q.tap("#menuBtn"); await q.waitForTimeout(200);
  check("the menu: the cellar, the Côte d'Or atlas, help and the languages", /Your cellar/.test(await q.textContent("#menuPanel")) && (await q.$$("#menuPanel .langpick button")).length === 4);
  check("phone: nothing wider than the screen", await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await q.evaluate(() => localStorage.removeItem("atlasStyle"));

  // ── a wide screen ──
  const d = await (await ctxOf({ viewport: { width: 1300, height: 850 } })).newPage();
  d.on("pageerror", e => errs.push(e.message));
  await d.goto(BASE + "atlas.html#r=chablis"); await d.waitForTimeout(2000);
  check("wide screen: the toolbar and legend where they were, the breadcrumb on the map", await d.evaluate(() => !!document.querySelector(".wrap > .toolbar #fGC") && !!document.querySelector(".mapbox > #legend")) && await d.isVisible("#crumb") && await d.isHidden("#rchips"));
  await d.click("#styleBtn"); await d.waitForTimeout(200); tiles.length = 0;
  await d.click('#styles button[data-style="photo"]'); await d.waitForTimeout(1200);
  const ph = await d.evaluate(() => ({ cls: document.getElementById("map").classList.contains("photo"), n: document.querySelectorAll("#map g.photo image").length, shade: getComputedStyle(document.querySelector("#map g.shade")).display }));
  check("Aerial photo: IGN's photos laid under the vineyards, the relief shading off", ph.cls && ph.n > 0 && ph.shade === "none" && tiles.some(u => /ORTHOIMAGERY\.ORTHOPHOTOS/.test(u)), JSON.stringify(ph));
  check("…and credited in the region's sources", /Aerial photos: IGN/.test(await d.textContent("#side")));
  // the view in 3D
  await d.click('#styles button[data-style="auto"]').catch(() => {}); await d.evaluate(() => { document.getElementById("stylePanel").hidden = true; });
  check("a French region offers 3D", await d.isVisible("#t3dBtn"));
  await d.click("#t3dBtn"); await d.waitForFunction(() => document.querySelector(".t3d-s") && document.querySelector(".t3d-s").hidden, null, { timeout: 20000 }).catch(() => {}); await d.waitForTimeout(1200);
  const t3 = await d.evaluate(() => { const c = document.querySelector(".t3d canvas"), g = c.getContext("2d"), px = g.getImageData(0, 0, c.width, c.height).data; let n = 0;
    for (let i = 0; i < px.length; i += 4 * 97) if (px[i + 3] > 0) n++; return { open: !document.querySelector(".t3d").hidden, drawn: n, title: document.querySelector(".t3d-t").textContent, credit: document.querySelector(".t3d-cr").textContent }; });
  check("…which lifts the view onto the ground: the block drawn, named, the heights credited", t3.open && t3.drawn > 200 && /Chablis · 3D/.test(t3.title) && /IGN, RGE ALTI/.test(t3.credit), JSON.stringify(t3));
  await d.keyboard.press("Escape"); await d.waitForTimeout(200);
  check("…and Escape is back on the map", await d.evaluate(() => document.querySelector(".t3d").hidden));
  await d.goto(BASE + "atlas.html#r=mosel"); await d.waitForTimeout(2500);
  check("…nor 3D: IGN's heights stop at the border", await d.isHidden("#t3dBtn"));
  check("in Germany there are no photos: the choice is greyed out, the map drawn as usual", await d.evaluate(() => document.querySelector('#styles button[data-style="photo"]').disabled && !document.getElementById("map").classList.contains("photo")));
  await d.evaluate(() => localStorage.removeItem("atlasStyle"));
  check("no page errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
