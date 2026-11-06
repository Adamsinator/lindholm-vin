// The Côte d'Or on the Wine atlas's engine (atlas-cotedor*.js, made by tools/cotedor-pack.js from the burgundy-*.js files):
// the pack has every climat burgundy.html draws, with the same owners and areas, moved to the frame the other French
// regions use; it opens at #r=cotedor (and isn't on the start page yet, while it's checked against burgundy.html); a
// climat's panel lists its owners with their shares; a click on an owner keeps only their climats on the map, and the
// total; the cadastre's lieux-dits are listed in a climat's panel, drawn when zoomed in and open with a tap; the map
// turns and the terrain and geology are there.
//   (cd .. && python3 -m http.server 8765) & node tools/cotedor-atlas-ui-test.js
"use strict";
const fs = require("fs"), path = require("path");
const { chromium } = require("./pw");
const BASE = process.env.BASE || "http://localhost:8765/";
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const ROOT = path.join(__dirname, "..");
global.window = {};
["burgundy-data.js", "burgundy-data-beaune.js", "burgundy-geo.js", "atlas-cotedor.js"].forEach(f => require(path.join(ROOT, f)));
const B = window.BURG, GEO = window.BURG_GEO, P = window.ATLAS_PACKS.cotedor;

// ── the pack against its sources ──
const want = B.climats.filter(c => GEO.climats[c.id]), byId = Object.fromEntries(P.climats.map(c => [c.id, c]));
check(`every climat burgundy.html draws is in the pack (${want.length}), and INAO's other named climats too`, want.every(c => byId[c.id]) && P.climats.length === want.length + Object.keys(GEO.extra || {}).length,
  want.filter(c => !byId[c.id]).map(c => c.id).join(", "));
const ownDiff = want.filter(c => JSON.stringify(c.p || []) !== JSON.stringify(byId[c.id].own || []));
check("…each with the same owners and figures", !ownDiff.length, ownDiff.slice(0, 5).map(c => c.id).join(", "));
// the move to Lambert-93 keeps every outline's area (to well under 1 %: both are near-conformal over 50 km); INAO's
// delimitation can be larger than the planted, registered area (Corton-Charlemagne: ~72 ha delimited, 52 ha declared)
const ringArea = r => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return s / 2; };
const haOf = mp => mp.reduce((s, q) => s + Math.abs(ringArea(q[0])) - q.slice(1).reduce((h, r) => h + Math.abs(ringArea(r)), 0), 0) / 1e4;
const areaOff = want.filter(c => { const a = haOf(GEO.climats[c.id]); return a > .05 && Math.abs(byId[c.id].haMap - a) > Math.max(.01 * a, .03); }); // whole metres: a few hundredths of a hectare on the smallest
check("…and each outline keeps its area through the move to Lambert-93 (within 1 %, or 0.03 ha on the smallest)", !areaOff.length, areaOff.slice(0, 5).map(c => `${c.id} ${byId[c.id].haMap}/${haOf(GEO.climats[c.id]).toFixed(2)}`).join(", "));
check("…in Lambert-93 metres like the other French regions (relief, photos, profile and 3D work)", Array.isArray(P.meta.l93) && P.meta.l93.length === 2 && !P.meta.proj);
const stale = ["burgundy-data.js", "burgundy-data-beaune.js", "burgundy-geo.js", "burgundy-extras.js"].filter(f => fs.statSync(path.join(ROOT, f)).mtimeMs > fs.statSync(path.join(ROOT, "atlas-cotedor.js")).mtimeMs + 5000);
check("the pack was made after its sources last changed (else: node tools/cotedor-pack.js)", !stale.length || process.env.CI, stale.join(", "));

(async () => {
  const b = await chromium.launch(), errs = [];
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && !/net::|CORS|Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.route(/^https:\/\/(data\.geopf\.fr|sgx\.geodatenzentrum\.de)\//, r => r.abort());
  await p.goto(BASE + "atlas.html"); await p.waitForTimeout(800);
  check("not on the start page yet (burgundy.html is still the Côte d'Or's page)", !(await p.$('#map [data-id="cotedor"]')) && !(await p.$('#rchips [data-r="cotedor"]')));
  await p.goto(BASE + "atlas.html#r=cotedor&c=richebourg");
  await p.waitForFunction(() => { try { return !!(st.pack && st.view && st.sel === "richebourg"); } catch (e) { return false; } }, null, { timeout: 20000 }); await p.waitForTimeout(500);
  const side = (await p.textContent("#side")).replace(/\s+/g, " ");
  check("#r=cotedor&c=richebourg opens Richebourg, with its description and owners", /Richebourg/.test(side) && /Opulent, spicy/.test(side) && /Owners/.test(side) && /Domaine de la Romanée-Conti\s*3\.51 ha\s*44%/.test(side), side.slice(0, 300));
  check("…and the three colours of the map: grand cru, premier cru, village climat", await p.evaluate(() => ["GC", "p1", "pv"].every(k => document.querySelector("#map .cl." + k))) && /Village climat/.test(await p.textContent("#legend")));
  await p.click('#side button[data-prod="drc"]'); await p.waitForTimeout(600);
  const bar = (await p.textContent(".prodbar")).trim(), shown = await p.evaluate(() => st.pack.climats.filter(c => !c.el.classList.contains("dim")).map(c => c.id));
  check("a click on an owner keeps only their climats on the map, with the count and hectares", /Showing the holdings of Domaine de la Romanée-Conti: \d+ climats · [\d.,]+ ha/.test(bar) && shown.includes("romaneeconti") && shown.includes("latache") && !shown.includes("chambertin"), bar + " · " + shown.join(","));
  await p.click("#prodX"); await p.waitForTimeout(300);
  check("…and ✕ shows every owner again", await p.evaluate(() => st.prod === null && !document.querySelector(".prodbar") && !st.pack.climats.some(c => c.el.classList.contains("dim") && c.c === "GC")));
  check("terrain and geology for the climat, as on burgundy.html", await p.evaluate(() => !!document.querySelector("#side")) && /Altitude/.test(side) && /Geology/.test(side));
  await p.evaluate(() => select("latache", true)); await p.waitForFunction(() => /Historic rankings/.test(document.getElementById("side").textContent), null, { timeout: 15000 }).catch(() => {});
  const hs = (await p.textContent("#side")).replace(/\s+/g, " ");
  check("historic rankings in the panel: La Tâche, tête de cuvée in 1855 and 1920, 1ère classe in 1860", /Lavalle 1855\s*tête de cuvée/i.test(hs) && /Comité de Beaune 1860\s*1ère classe/i.test(hs) && /Rodier 1920\s*tête de cuvée/i.test(hs), hs.slice(0, 300));
  // lieux-dits: listed inside a climat; outlines and names zoomed in; a tap on land outside the climats opens one
  await p.evaluate(() => select("echezeaux", true)); await p.waitForFunction(() => !!document.querySelector("#side .ldlist"), null, { timeout: 15000 }).catch(() => {});
  const ldl = await p.textContent("#side .ldlist").catch(() => "");
  check("a climat's panel lists the cadastre's lieux-dits inside it (Échezeaux: Les Poulaillères, En Orveaux…)", /En Orveaux/.test(ldl) && /Les Treux/.test(ldl) && !/^Echezeaux\b/.test(ldl), ldl);
  check("…drawn on the map with their names, zoomed in", await p.evaluate(() => !!document.querySelector("#map .ldo path.ld") && [...document.querySelectorAll("#map .tn-ld")].some(e => e.style.display !== "none")));
  const pt = await p.evaluate(() => { const L = ATLAS_LD.cotedor.ld; for (let i = 0; i < L.length; i++) { const l = L[i]; if (!climatAt([l[2], l[3]]) && l._a > 30000) return [i, l[1], l[2], l[3]]; } });
  await p.waitForTimeout(600); // the flight to Échezeaux has ended (else it carries the view back)
  await p.evaluate(([, , x, y]) => fit([x - 400, y - 400, x + 400, y + 400]), pt); await p.waitForTimeout(700);
  const sc = await p.evaluate(([, , x, y]) => { const [vx, vy] = rotP([x, y]), r = document.getElementById("map").getBoundingClientRect(), [a, b2, w, h] = st.view; return [r.left + (vx - a) / w * r.width, r.top + (vy - b2) / h * r.height]; }, pt);
  await p.mouse.click(sc[0], sc[1]); await p.waitForTimeout(500);
  const lds = (await p.textContent("#side")).replace(/\s+/g, " ");
  check("a tap on village land, zoomed in, opens the lieu-dit there: area, terrain, appellation", new RegExp("Lieu-dit\\s*" + pt[1]).test(lds) && /Area/.test(lds) && /Village appellation|Regional appellations|Appellation/.test(lds), pt[1] + " · " + lds.slice(0, 200));
  await p.click("#back"); await p.waitForTimeout(200);
  check("…and ← goes back to the region", /Côte d'Or/.test(await p.textContent("#side h2")) && await p.evaluate(() => st.ld === null));
  await p.keyboard.press("]"); await p.waitForTimeout(300);
  check("the map turns here too", await p.evaluate(() => ROT.a === 15));
  await p.evaluate(() => { try { localStorage.removeItem("atlasRot"); } catch (e) {} });
  check("no page errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
