// Browser test of Italy in the wine atlas (atlas-barolo.js, atlas-barbaresco.js, from tools/region-build.js → tools/region-it.js:
// Piedmont's vineyard register, the cadastral parcels fit for each DOCG, by commune):
//   • the packs: Barolo's 11 communes, La Morra the largest; Barbaresco's Neive, Barbaresco, Treiso and Alba; credited
//   • the region: its communes, the note that they are whole parcels, the link to the MGA as a list; no relief yet
//   • a search for an MGA goes to its page, not to the map; Italy is mapped on the start page
//   (cd .. && python3 -m http.server 8765) & node tools/italy-atlas-ui-test.js
"use strict";
const { chromium } = require("./pw");
const BASE = process.env.BASE || "http://localhost:8765/";
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
global.window = {}; require("../atlas-barolo.js"); require("../atlas-barbaresco.js");
const B = window.ATLAS_PACKS.barolo, BB = window.ATLAS_PACKS.barbaresco;
const top = P => P.climats.slice().sort((a, b) => b.ha - a.ha).map(c => c.n);
check("Barolo: its eleven communes, La Morra, Monforte and Serralunga the largest", B.climats.length === 11 && B.climats.every(c => c.c === "CM" && c.ap === "Barolo DOCG" && c.parcels > 0) && top(B).slice(0, 3).join() === "La Morra,Monforte d'Alba,Serralunga d'Alba", top(B).join());
check("…about 2 900 ha of parcels (the vines, about 2 200 ha, are a part of them)", (t => t > 2600 && t < 3200)(B.climats.reduce((s, c) => s + c.ha, 0)));
check("Barbaresco: Neive, Barbaresco, Treiso and Alba", top(BB).join() === "Neive,Barbaresco,Treiso,Alba" && BB.climats.every(c => c.ap === "Barbaresco DOCG"), top(BB).join());
check("…both credited to Regione Piemonte's register, CC BY 4.0", [B, BB].every(P => /Regione Piemonte/.test(P.meta.source) && /CC BY 4\.0/.test(P.meta.source) && P.meta.register === 2025));

(async () => {
  const b = await chromium.launch(), errs = [], tiles = [];
  const page = async opt => { const p = await (await b.newContext(opt)).newPage(); p.on("pageerror", e => errs.push(e.message));
    await p.route(/^https:\/\/(data\.geopf\.fr|sgx\.geodatenzentrum\.de|mapsneu\.wien\.gv\.at|servicios\.idee\.es|geomap\.reteunitaria\.piemonte\.it)\//, r => { tiles.push(new URL(r.request().url()).hostname); r.abort(); }); return p; };
  const p = await page({ viewport: { width: 1300, height: 900 } });
  await p.goto(BASE + "atlas.html#r=barolo"); await p.waitForFunction(() => /Barolo/.test(document.getElementById("regionName").textContent), null, { timeout: 30000 }); await p.waitForTimeout(800);
  const side = await p.textContent("#side");
  check("Barolo opens with its communes, the note that they are whole parcels, and the MGA as a list", /11 communes/.test(side) && /La Morra/.test(side) && /whole cadastral parcels/i.test(side)
    && await p.evaluate(() => /v\/en\/index\.html#barolo$/.test((document.querySelector('#side a[href*="index.html#barolo"]') || {}).href || "")), side.slice(0, 300));
  check("…the breadcrumb Europe › Italy › Barolo · 11 communes; no relief (none open the atlas can use yet), its toggle hidden, no other country's tiles", /Europe\s*›\s*Italy\s*›\s*Barolo\s*·\s*11 communes/.test(await p.textContent("#crumb")) && !tiles.length && await p.isHidden("#fRelief"), [...new Set(tiles)].join() + " " + await p.textContent("#crumb"));
  await p.goto(BASE + "atlas.html#r=barolo&c=la_morra"); await p.reload(); await p.waitForTimeout(1500);
  const lm = await p.evaluate(() => ({ h: (document.querySelector("#side h2") || {}).textContent, t: document.getElementById("side").textContent }));
  check("a commune: La Morra, its parcels fit for Barolo DOCG and their count", lm.h === "La Morra" && /Parcels fit for Barolo DOCG/.test(lm.t) && /\b2\d{3}\b/.test(lm.t), JSON.stringify(lm).slice(0, 300));
  await p.fill("#fSearch", "Cannubi"); await p.waitForTimeout(800);
  const hit = await p.$("#gRes li[data-i]"); if (hit) { await Promise.all([p.waitForURL(/v\/en\/barolo-cannubi/, { timeout: 15000 }).catch(() => {}), hit.dispatchEvent("pointerdown")]); }
  check("a search for an MGA (Cannubi) goes to its page, not into the map", /v\/en\/barolo-cannubi\.html/.test(p.url()), p.url());
  const q = await page({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await q.goto(BASE + "atlas.html"); await q.waitForTimeout(1500);
  const it = await q.evaluate(() => (document.querySelector('#map .cn.on[data-c="it"]') || {}).textContent || "");
  check("the start page has Italy among the mapped countries, with its two regions", /Italy\s*2 regions/.test(it), it);
  check("no console errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
