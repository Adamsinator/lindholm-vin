// Browser test of Spain in the wine atlas (atlas-rioja.js, from tools/region-build.js rioja → tools/region-es.js:
// Rioja's viñedos singulares from the Ministry's orders, their parcels from SIGPAC):
//   • the pack: over 140 vineyards of class VS, each with its municipality, zone, order and file number; the three
//     zones; the ones whose parcels SIGPAC no longer has, named rather than guessed
//   • the region opens with its count, the zones' lists and the note of those not drawn; its relief is IGN's
//   • a vineyard from a link: its pill, municipality and zone, area, and the order that recognised it
//   • the start page: Spain among the mapped countries; a tap on it, Rioja
//   (cd .. && python3 -m http.server 8765) & node tools/spain-atlas-ui-test.js
"use strict";
const { chromium } = require("./pw");
const BASE = process.env.BASE || "http://localhost:8765/";
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };

global.window = {}; require("../atlas-rioja.js");
const P = window.ATLAS_PACKS.rioja, C = P.climats;
check("over 140 viñedos singulares, all class VS, ids unique", C.length > 140 && C.every(c => c.c === "VS") && new Set(C.map(c => c.id)).size === C.length, C.length);
check("…each with its municipality, zone, order and file number", C.every(c => c.app && /^Rioja (Alta|Alavesa|Oriental)$/.test(c.area) && /^Orden APA\/\d+\/20\d\d$/.test(c.order) && /^VS \d+(-\d+)?\/20\d\d$/.test(c.exp)),
  JSON.stringify(C.find(c => !(c.app && c.area && c.order && c.exp))));
check("…their areas as recognised: under 25 ha each, about 250–320 ha in all", C.every(c => c.ha > 0.05 && c.ha < 25) && (t => t > 250 && t < 320)(C.reduce((s, c) => s + c.ha, 0)), C.reduce((s, c) => s + c.ha, 0).toFixed(1));
check("the three zones, Rioja Oriental the largest", P.villages.map(v => v.ap).sort().join() === "Rioja Alavesa,Rioja Alta,Rioja Oriental" && P.villages.find(v => v.ap === "Rioja Oriental").ha === Math.max(...P.villages.map(v => v.ha)));
check("…the vineyards whose parcels SIGPAC no longer has are named, not drawn", Array.isArray(P.meta.unmapped) && P.meta.unmapped.length < 20 && P.meta.unmapped.every(n => !C.some(c => c.n === n)), JSON.stringify(P.meta.unmapped));
check("…and the sources credited (BOE, FEGA, IGN; CC BY 4.0)", /BOE/.test(P.meta.source) && /FEGA/.test(P.meta.source) && /Instituto Geográfico Nacional/.test(P.meta.source) && /CC BY 4\.0/.test(P.meta.source));
const ch = C.find(c => c.n === "Las Cabezadas de Matadula");
check("Las Cabezadas de Matadula (the first order's VS 1) is in Labastida, Rioja Alavesa", ch && ch.app === "Labastida" && ch.area === "Rioja Alavesa" && ch.exp === "VS 1/2019", JSON.stringify(ch && { app: ch.app, area: ch.area, exp: ch.exp }));

(async () => {
  const b = await chromium.launch(), errs = [], tiles = [];
  const page = async opt => { const p = await (await b.newContext(opt)).newPage(); p.on("pageerror", e => errs.push(e.message));
    await p.route(/^https:\/\/(data\.geopf\.fr|sgx\.geodatenzentrum\.de|mapsneu\.wien\.gv\.at|servicios\.idee\.es)\//, r => { tiles.push(new URL(r.request().url()).hostname); r.abort(); }); return p; };
  const p = await page({ viewport: { width: 1300, height: 900 } });
  await p.goto(BASE + "atlas.html#r=rioja"); await p.waitForFunction(() => /Rioja/.test(document.getElementById("regionName").textContent), null, { timeout: 30000 }); await p.waitForTimeout(800);
  const side = await p.textContent("#side");
  check("Rioja opens with its count, the zones' lists and the note of those not drawn", /1\d\d viñedos singulares/.test(side) && /Rioja Alta/.test(side) && /Rioja Alavesa/.test(side) && /Rioja Oriental/.test(side) && /renumbered in SIGPAC/.test(side), side.slice(0, 300));
  check("…the filter is offered; the breadcrumb is Europe › Spain › Rioja", await p.isVisible("#fVS") && /Europe\s*›\s*Spain\s*›\s*Rioja/.test(await p.textContent("#crumb")), await p.textContent("#crumb"));
  check("…its relief is IGN's, and only IGN's", tiles.includes("servicios.idee.es") && tiles.every(h => h === "servicios.idee.es"), [...new Set(tiles)].join());
  check("…credited, and not Rhineland-Palatinate's or Austria's", /Instituto Geográfico Nacional/.test(side) && !/LVermGeoRP|GeoBasis-DE|basemap\.at/.test(side), side.slice(-400));
  const id = C.find(c => c.n === "Las Cabezadas de Matadula").id;
  await p.goto(BASE + "atlas.html#r=rioja&c=" + id); await p.reload();
  await p.waitForFunction(() => /Matadula/.test((document.querySelector("#side h2") || {}).textContent || ""), null, { timeout: 30000 }).catch(() => {});
  const v = await p.evaluate(() => ({ h: (document.querySelector("#side h2") || {}).textContent, pill: (document.querySelector("#side .pill") || {}).textContent, t: document.getElementById("side").textContent }));
  check("a link opens the vineyard: its pill, Labastida · Rioja Alavesa, area and the order", v.h === "Las Cabezadas de Matadula" && /Viñedo singular/.test(v.pill) && /Labastida · Rioja Alavesa/.test(v.t) && /\d ha/.test(v.t) && /Orden APA\/816\/2019 \(BOE\), VS 1\/2019/.test(v.t), JSON.stringify(v).slice(0, 400));
  await p.fill("#fSearch", "Matadula"); await p.waitForTimeout(600);
  check("the search finds it", await p.evaluate(() => [...document.querySelectorAll("#gRes li")].some(li => /Matadula/.test(li.textContent))));

  const q = await page({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await q.goto(BASE + "atlas.html"); await q.waitForTimeout(1500);
  const es = await q.evaluate(() => (document.querySelector('#map .cn.on[data-c="es"]') || {}).textContent || "");
  check("the start page names Spain among the mapped countries, with its one region", /Spain\s*1 region(?!s)/.test(es), es);
  await q.tap('#map .cn.on[data-c="es"]'); await q.waitForTimeout(1200);
  const home = await q.evaluate(() => ({ hash: location.hash, on: [...document.querySelectorAll("#map .hd.on")].map(x => x.dataset.id).join(), wide: document.documentElement.scrollWidth - innerWidth }));
  check("…a tap on it shows Rioja, nothing wider than the screen", home.hash === "#c=es" && home.on === "rioja" && home.wide <= 0, JSON.stringify(home));
  check("no console errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
