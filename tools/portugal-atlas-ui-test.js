// Browser test of Portugal in the wine atlas (atlas-douro.js, from tools/region-build.js douro → tools/region-pt.js:
// the Douro's statute's parishes drawn from DGT's CAOP 2025, the vines from DGT's COS 2023):
//   • the pack: municipalities' vines in the three sub-regions; Cima Corgo the most; the statute's parishes all found
//   • the region: its lists by sub-region, the note on what COS counts as vineyard, the estates not drawn
//   • a municipality: its vine land, its parishes, the merged ones drawn whole; Portugal on the start page
//   (cd .. && python3 -m http.server 8765) & node tools/portugal-atlas-ui-test.js
"use strict";
const { chromium } = require("./pw");
const BASE = process.env.BASE || "http://localhost:8765/";
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
global.window = {}; require("../atlas-douro.js");
const P = window.ATLAS_PACKS.douro, C = P.climats, by = z => C.filter(c => c.area === z).reduce((s, c) => s + c.ha, 0);
check("the Douro: the vines of about 20 municipalities in Baixo Corgo, Cima Corgo and Douro Superior", C.length >= 18 && C.every(c => c.c === "DV" && /^(Baixo Corgo|Cima Corgo|Douro Superior)$/.test(c.area) && c.parishes.length), C.length);
check("…Cima Corgo has the most vineyard land; all of it about 50 000–70 000 ha (COS's, the planted vines some 44 000)", by("Cima Corgo") > by("Baixo Corgo") && by("Cima Corgo") > by("Douro Superior") && (t => t > 50000 && t < 70000)(C.reduce((s, c) => s + c.ha, 0)), [by("Baixo Corgo"), by("Cima Corgo"), by("Douro Superior")].map(Math.round).join());
check("…Pinhão and Favaios among Alijó's parishes; Vila Real's own parish only in part", C.find(c => c.n === "Alijó").parishes.some(x => /Pinhão/.test(x)) && C.find(c => c.n === "Alijó").parishes.includes("Favaios")
  && (C.find(c => c.n === "Vila Real").part || []).includes("Nossa Senhora da Conceição"), JSON.stringify(C.find(c => c.n === "Vila Real")?.part));
check("…the named estates listed, the sources credited (DGT, CC BY 4.0)", P.meta.estates.length === 3 && /CAOP 2025/.test(P.meta.source) && /COS 2023/.test(P.meta.source) && /CC BY 4\.0/.test(P.meta.source));
(async () => {
  const b = await chromium.launch(), errs = [];
  const page = async opt => { const p = await (await b.newContext(opt)).newPage(); p.on("pageerror", e => errs.push(e.message)); await p.route(/^https:\/\//, r => r.abort()); return p; };
  const p = await page({ viewport: { width: 1300, height: 900 } });
  await p.goto(BASE + "atlas.html#r=douro"); await p.waitForFunction(() => /Douro/.test(document.getElementById("regionName").textContent), null, { timeout: 30000 }); await p.waitForTimeout(800);
  const side = await p.textContent("#side"), h3 = await p.$$eval("#side h3", x => x.map(h => h.textContent));
  check("the region: its sub-regions' lists, the note on COS's vineyard land, the estates not drawn", ["Baixo Corgo", "Cima Corgo", "Douro Superior"].every(z => h3.includes(z)) && /44 000 ha of vines/.test(side) && /Not drawn: the estates/.test(side), JSON.stringify(h3));
  check("…Europe › Portugal › Douro", /Europe\s*›\s*Portugal\s*›\s*Douro/.test(await p.textContent("#crumb")));
  await p.goto(BASE + "atlas.html#r=douro&c=alijo"); await p.reload(); await p.waitForTimeout(1500);
  const a = await p.evaluate(() => ({ h: (document.querySelector("#side h2") || {}).textContent, t: document.getElementById("side").textContent }));
  check("a municipality: Alijó, Cima Corgo, its vineyard land and parishes; its merged parishes are all the statute's, so none drawn beyond it", a.h === "Alijó" && /Cima Corgo/.test(a.t) && /Vineyard land \(COS 2023\)/.test(a.t) && /Parishes: .*Favaios/.test(a.t) && !/Merged since 2013 and drawn whole/.test(a.t), a.t.slice(0, 400));
  const cz = C.find(c => c.n === "Carrazeda de Ansiães");
  await p.goto(BASE + "atlas.html#r=douro&c=" + cz.id); await p.reload(); await p.waitForTimeout(1500);
  check("…Carrazeda de Ansiães: a merged parish drawn whole, with Selores, which the statute doesn't name", /Merged since 2013 and drawn whole: .*Lavandeira, Beira Grande e Selores \(also Selores\)/.test(await p.textContent("#side")));
  const q = await page({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await q.goto(BASE + "atlas.html"); await q.waitForTimeout(1500);
  check("the start page has Portugal among the mapped countries", /Portugal\s*1 region(?!s)/.test(await q.evaluate(() => (document.querySelector('#map .cn.on[data-c="pt"]') || {}).textContent || "")));
  check("no console errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
