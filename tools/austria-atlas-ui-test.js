// Browser test of Austria in the wine atlas (atlas-noe.js and atlas-burgenland.js, from tools/region-build.js noe /
// burgenland: the Rieden Lower Austria and Burgenland have decreed, from their own open data):
//   • the packs load whole: their rings, stored as steps from the point before, come back as points; every id unique
//   • Lower Austria opens with its Rieden counted and the note that it is still mapping them; Burgenland without it
//   • a Ried from a link: Achleiten in Weißenkirchen, its pill "Ried", its municipality, area and cadastral municipality
//   • the same name in several villages (the Kellerbergs) stays apart; the search finds a Ried by name
//   • the start page names Austria; a tap on it shows its two regions; no console errors, no sideways scroll
//   (cd .. && python3 -m http.server 8765) & node tools/austria-atlas-ui-test.js
"use strict";
const { chromium } = require("./pw");
const BASE = process.env.BASE || "http://localhost:8765/";
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };

// ── the packs ──
global.window = {}; require("../atlas-noe.js"); require("../atlas-burgenland.js");
const N = window.ATLAS_PACKS.noe, B = window.ATLAS_PACKS.burgenland;
const pts = P => P.climats.every(c => c.g.length && c.g.every(p => p.every(r => r.length >= 4 && r.every(q => Array.isArray(q) && q.length === 2 && q.every(Number.isFinite)))));
check("both packs load with their rings as points", pts(N) && pts(B));
check("…over 2,500 Rieden in Lower Austria and 900 in Burgenland, all of class RD", N.climats.length > 2500 && B.climats.length > 900 && N.climats.concat(B.climats).every(c => c.c === "RD"), `${N.climats.length} ${B.climats.length}`);
check("…every id unique and plain (ß as ss)", [N, B].every(P => new Set(P.climats.map(c => c.id)).size === P.climats.length && P.climats.every(c => /^[a-z0-9_]+$/.test(c.id))));
const ach = N.climats.find(c => c.id === "weissenkirchen_in_der_wachau_achleiten");
check("Achleiten is in Weißenkirchen, about 27 ha, its names put back as the pack loads", ach && ach.app === "Weißenkirchen in der Wachau" && ach.ha > 20 && ach.ha < 35 && ach.ap === "Ried Achleiten" && ach.aka.includes("Weißenkirchen in der Wachau Achleiten"), JSON.stringify(ach && { app: ach.app, ha: ach.ha, ap: ach.ap }));
check("…and both credit their Land's open data (CC BY 4.0)", /Land Niederösterreich.*CC BY 4\.0/.test(N.meta.source) && /Land Burgenland.*CC BY 4\.0/.test(B.meta.source));

(async () => {
  const b = await chromium.launch(), errs = [];
  const tiles = [];
  const page = async opt => { const p = await (await b.newContext(opt)).newPage(); p.on("pageerror", e => errs.push(e.message));
    await p.route(/^https:\/\/(data\.geopf\.fr|sgx\.geodatenzentrum\.de|mapsneu\.wien\.gv\.at)\//, r => { tiles.push(new URL(r.request().url()).hostname); r.abort(); }); return p; };
  const p = await page({ viewport: { width: 1300, height: 900 } });
  await p.goto(BASE + "atlas.html#r=noe"); await p.waitForFunction(() => /Niederösterreich/.test(document.getElementById("regionName").textContent), null, { timeout: 30000 }); await p.waitForTimeout(800);
  const side = await p.textContent("#side");
  check("Lower Austria opens with its Rieden counted and the note that not all are mapped yet", /2[,.]?\d{3} Rieden/.test(side) && /still mapping its Rieden/.test(side), side.slice(0, 200));
  check("…the Ried filter is offered", await p.isVisible("#fRD"));
  check("…its relief is basemap.at's, never Germany's or France's", tiles.includes("mapsneu.wien.gv.at") && tiles.every(h => h === "mapsneu.wien.gv.at"), [...new Set(tiles)].join());
  check("…credited, with the Land's Rieden, and not Rhineland-Palatinate's", /Relief: basemap\.at \(CC BY 4\.0\)/.test(side) && /Land Niederösterreich/.test(side) && !/LVermGeoRP|GeoBasis-DE|Landwirtschaftskammer/.test(side), side.slice(-400));
  check("…its weather is GeoSphere Austria's", await p.waitForFunction(() => /GeoSphere Austria/.test(document.getElementById("side").textContent), null, { timeout: 15000 }).then(() => true, () => false));
  await p.goto(BASE + "atlas.html#r=noe&c=weissenkirchen_in_der_wachau_achleiten"); await p.reload();
  await p.waitForFunction(() => /Achleiten/.test((document.querySelector("#side h2") || {}).textContent || ""), null, { timeout: 30000 }).catch(() => {});
  const sel = await p.evaluate(() => ({ h: (document.querySelector("#side h2") || {}).textContent, t: document.getElementById("side").textContent }));
  check("a link opens Achleiten: pill Ried, Weißenkirchen, its area and cadastral municipality", sel.h === "Achleiten" && /Ried/.test(sel.t) && /Weißenkirchen in der Wachau/.test(sel.t) && /\d+(\.\d+)? ha/.test(sel.t) && /Cadastral municipality: /.test(sel.t), JSON.stringify(sel).slice(0, 300));
  await p.fill("#fSearch", "Kellerberg"); await p.waitForTimeout(700);
  const hits = await p.evaluate(() => [...document.querySelectorAll("#gRes [role=option], #gRes li, #gRes button")].map(x => x.textContent.replace(/\s+/g, " ").trim()).filter(x => /Kellerberg/.test(x)));
  check("the search finds the Kellerbergs, each with its village", hits.length >= 5 && hits.some(x => /Dürnstein/.test(x)) && hits.some(x => /Langenlois/.test(x)), JSON.stringify(hits.slice(0, 6)));

  await p.goto(BASE + "atlas.html#r=burgenland"); await p.reload(); await p.waitForFunction(() => /Burgenland/.test(document.getElementById("regionName").textContent), null, { timeout: 30000 }); await p.waitForTimeout(600);
  const bs = await p.textContent("#side");
  check("Burgenland opens with its Rieden and no note of missing ones", /\d{3} Rieden/.test(bs) && !/still mapping/.test(bs), bs.slice(0, 200));

  // the start page, on a phone: Austria named among the mapped countries; a tap on it, its two regions
  const q = await page({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await q.goto(BASE + "atlas.html"); await q.waitForTimeout(1500);
  const eu = await q.evaluate(() => (document.querySelector('#map .cn.on[data-c="at"]') || {}).textContent || "");
  check("the start page names Austria with its two regions", /Austria\s*2 regions/.test(eu), eu);
  await q.tap('#map .cn.on[data-c="at"]'); await q.waitForTimeout(1200);
  const home = await q.evaluate(() => ({ hash: location.hash, on: [...document.querySelectorAll("#map .hd.on")].map(x => x.dataset.id).sort().join(), scale: document.getElementById("map").getScreenCTM().a,
    font: document.querySelector('#map .hd.on text').getBoundingClientRect().height, wide: document.documentElement.scrollWidth - innerWidth, list: [...document.querySelectorAll("#side li button")].map(b => b.textContent) }));
  check("…a tap on it: Lower Austria and Burgenland, readable, nothing wider than the screen", home.hash === "#c=at" && home.on === "burgenland,noe" && home.font >= 10 && home.wide <= 0, JSON.stringify(home));
  check("…and the list has just those two", home.list.length === 2 && home.list.some(x => /Niederösterreich/.test(x)), JSON.stringify(home.list));
  check("no console errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
