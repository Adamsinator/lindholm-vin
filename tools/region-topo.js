#!/usr/bin/env node
// The map furniture under a region's vineyards in the Wine atlas → atlas-<id>-topo.js: roads, railways, rivers and
// lakes, woods, built-up areas and the names of villages, hamlets and rivers. The relief under it is hillshade the
// page fetches as tiles (atlas.js); this file is only what's drawn as vectors.
//
//   node tools/region-topo.js chablis [mosel …]     (or "all"; needs atlas-<id>.js from region-build.js, and curl)
//
// France: IGN BD TOPO (Licence Ouverte), asked for in Lambert-93 (EPSG:2154), the pack's own grid, so nothing is
// reprojected: x = E − E0, y = N0 − N. Germany: the Basis-DLM of Rheinland-Pfalz (©GeoBasis-DE / LVermGeoRP,
// dl-de/by-2-0), as GeoJSON in WGS84, put on the pack's local grid (meta.proj "eq"). Only the ground near the vineyards
// is fetched (cells of a few km touching an outline, plus a margin), cached in tools/.topo-cache.
"use strict";
const fs = require("fs"), path = require("path"), { execFile } = require("child_process");
const ROOT = path.resolve(__dirname, ".."), CACHE = path.join(__dirname, ".topo-cache"); fs.mkdirSync(CACHE, { recursive: true });
const WFS = "https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&OUTPUTFORMAT=application/json&SRSNAME=EPSG:2154";
const FRENCH = ["chablis", "chalonnaise", "maconnais", "champagne", "alsace", "rhone", "bordeaux", "beaujolais", "rhonesud"];
const GERMAN = ["mosel", "nahe", "pfalz", "rheinhessen", "mittelrhein", "ahr"];
const DLM = "https://geo5.service24.rlp.de/wfs/basisdlm_shape_rp.fcgi?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&OUTPUTFORMAT=application/json;%20subtype=geojson&SRSNAME=EPSG:4326";

// how much to draw: the small regions get their lanes and hamlets too; Bordeaux, the size of a département, doesn't
const DETAIL = { chablis: 2, chalonnaise: 2, maconnais: 1, rhone: 1, alsace: 1, champagne: 1, bordeaux: 0, beaujolais: 1, rhonesud: 1, mosel: 1, nahe: 1, pfalz: 1, rheinhessen: 1, mittelrhein: 1, ahr: 2 };

const curl = url => new Promise((ok, fail) => execFile("curl", ["-sS", "--max-time", "240", "--retry", "8", "--retry-all-errors", "--retry-delay", "2", url],
  { maxBuffer: 1 << 30 }, (e, out) => e ? fail(e) : ok(out)));

function dp(pts, tol) { // Douglas–Peucker on an open line
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [i, j] = st.pop(); let best = -1, bd = tol;
    const [ax, ay] = pts[i], [bx, by] = pts[j], L = Math.hypot(bx - ax, by - ay) || 1;
    for (let k = i + 1; k < j; k++) { const d = Math.abs((bx - ax) * (ay - pts[k][1]) - (ax - pts[k][0]) * (by - ay)) / L; if (d > bd) { bd = d; best = k; } }
    if (best > 0) { keep[best] = 1; st.push([i, best], [best, j]); }
  }
  return pts.filter((_, k) => keep[k]);
}
const dpRing = (pts, tol) => { // a closed ring as two halves, split at the point farthest from its start
  if (pts.length < 5) return pts;
  let far = 1, fd = -1; pts.forEach(([x, y], k) => { const d = Math.hypot(x - pts[0][0], y - pts[0][1]); if (d > fd) { fd = d; far = k; } });
  return dp(pts.slice(0, far + 1), tol).concat(dp(pts.slice(far), tol).slice(1));
};
const lines = g => !g ? [] : g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : [];
const polys = g => !g ? [] : g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
const delta = f => f.map((v, i) => i < 2 ? v : v - f[i - 2]); // first point absolute, then steps
const cap = s => s.split(" ").map((w, i) => (i && /^(de|du|des|d'.*|la|le|les|l'.*|en|sur|sous|et|au|aux|à|ès)$/.test(w)) ? w
  : w.split("-").map(p => p.replace(/^(d'|l')?(.)/, (m, a, b) => (a || "") + b.toUpperCase())).join("-")).join(" ")
  .replace(/^(D'|L')/, m => m.toUpperCase()).replace(/^(.)/, m => m.toUpperCase());

async function build(id) {
  global.window = {}; require(path.join(ROOT, `atlas-${id}.js`));
  const P = window.ATLAS_PACKS[id], D = DETAIL[id] ?? 1, de = P.meta.proj === "eq", [E0, N0] = P.meta.l93 || [];
  if (!de && !E0) throw new Error(id + ": neither a Lambert-93 nor a German pack");
  // Germany: metres east and south of meta.origin on the pack's equirectangular grid (as region-build.js makes it)
  const O = P.meta.origin, d2r = Math.PI / 180, kx = d2r * 6371000 * Math.cos(O[1] * d2r), ky = d2r * 6371000;
  const toM = de ? ([lon, lat]) => [Math.round((lon - O[0]) * kx), Math.round((O[1] - lat) * ky)] : ([e, n]) => [Math.round(e - E0), Math.round(N0 - n)];

  // the ground: cells touching a vineyard (with a margin); big regions in bigger cells
  const MARGIN = D ? 1500 : 2500, CELL = ["chablis", "chalonnaise", "maconnais", "rhone"].includes(id) || de ? 3000 : 5000; // (the cache is by cell)
  const boxes = P.climats.concat(P.villages).flatMap(c => c.g).concat(P.regional.g).map(p => {
    const xs = p[0].map(q => q[0]), ys = p[0].map(q => q[1]);
    return [Math.min(...xs) - MARGIN, Math.min(...ys) - MARGIN, Math.max(...xs) + MARGIN, Math.max(...ys) + MARGIN];
  }).concat((P.points || []).filter(q => q.p).map(q => [q.p[0] - MARGIN, q.p[1] - MARGIN, q.p[0] + MARGIN, q.p[1] + MARGIN]));
  const ext = boxes.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
  const cells = [];
  for (let x = Math.floor(ext[0] / CELL) * CELL; x < ext[2]; x += CELL) for (let y = Math.floor(ext[1] / CELL) * CELL; y < ext[3]; y += CELL) {
    const c = [x, y, x + CELL, y + CELL];
    if (boxes.some(b => b[0] < c[2] && b[2] > c[0] && b[1] < c[3] && b[3] > c[1])) cells.push(c);
  }
  const inArea = ([x, y]) => boxes.some(b => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]);
  console.log(`${id}: ${cells.length} cells of ${CELL / 1000} km`);

  const cacheFile = (layer, c) => path.join(CACHE, de ? `dlm_${id}_${layer.replace(/\W/g, "_")}_${c[0]}_${c[1]}_${CELL}.json` // the pack's grid
    : `l93_${layer.replace(/\W/g, "_")}_${Math.round(E0 + c[0])}_${Math.round(N0 - c[3])}_${CELL}.json`); // absolute: the south-west corner
  async function fetchCell(layer, props, c) {
    const file = cacheFile(layer, c); if (fs.existsSync(file)) return;
    // the cell in Lambert-93: west, south, east, north (y grows southwards in the pack); in Germany latitude first
    const w = E0 + c[0], e = E0 + c[2], s = N0 - c[3], n = N0 - c[1], feats = [];
    const bbox = de ? `${(O[1] - c[3] / ky).toFixed(6)},${(O[0] + c[0] / kx).toFixed(6)},${(O[1] - c[1] / ky).toFixed(6)},${(O[0] + c[2] / kx).toFixed(6)},urn:ogc:def:crs:EPSG::4326`
      : `${w},${s},${e},${n},urn:ogc:def:crs:EPSG::2154`;
    for (let start = 0; ; start += 5000) {
      const url = de ? `${DLM}&TYPENAMES=vermkv:${layer}&BBOX=${bbox}&COUNT=5000&STARTINDEX=${start}`
        : `${WFS}&TYPENAMES=${layer}&BBOX=${bbox}&COUNT=5000&STARTINDEX=${start}&PROPERTYNAME=${props}`;
      let j = null;
      for (let tries = 0; !j; tries++) {
        try { j = JSON.parse(await curl(url)); if (!j.features) throw new Error(JSON.stringify(j).slice(0, 200)); }
        catch (err) { j = null; if (tries >= 5) throw new Error(`${layer} ${c}: ${String(err.message).slice(0, 200)}`); await new Promise(r => setTimeout(r, 2000 * (tries + 1))); }
      }
      feats.push(...j.features);
      if (j.features.length < 5000) break;
    }
    fs.writeFileSync(file, JSON.stringify(feats));
  }
  const LAYERS = de ? [["Verkehr_VER01_L"], ["Verkehr_VER03_L"], ["Gewaesser_GEW01_L"], ["Gewaesser_GEW01_F"], ["Vegetation_VEG02_F"], ["Siedlungen_SIE01_F"]] : [
    ["BDTOPO_V3:troncon_de_route", "geometrie,nature,importance,cpx_numero"], ["BDTOPO_V3:troncon_de_voie_ferree", "geometrie,nature,etat_de_l_objet"],
    ["BDTOPO_V3:troncon_hydrographique", "geometrie,persistance,classe_de_largeur,position_par_rapport_au_sol"],
    ["BDTOPO_V3:surface_hydrographique", "geometrie,nature,persistance"], ["BDTOPO_V3:zone_de_vegetation", "geometrie,nature"],
    ["BDTOPO_V3:zone_d_habitation", "geometrie,nature,toponyme,importance,fictif"], ["BDTOPO_V3:toponymie", "geometrie,classe_de_l_objet,graphie_du_toponyme"],
  ];
  const jobs = LAYERS.flatMap(([l, p]) => cells.map(c => [l, p, c])); let i = 0, done = 0;
  await Promise.all(Array.from({ length: 6 }, async () => { while (i < jobs.length) { const [l, p, c] = jobs[i++]; await fetchCell(l, p, c); if (++done % 50 === 0) console.log(`  ${done}/${jobs.length}`); } }));
  const all = layer => { const seen = new Set(), out = [];
    cells.forEach(c => JSON.parse(fs.readFileSync(cacheFile(layer, c), "utf8")).forEach(f => { const k = f.id || JSON.stringify(f.geometry).slice(0, 80); if (!seen.has(k)) { seen.add(k); out.push(f); } }));
    return out; };

  // a line is kept where it runs through the area (one point of overlap either side), simplified
  const runs = (coords, tol) => { const pts = coords.map(toM), out = []; let cur = null;
    pts.forEach((q, k) => { const ins = inArea(q) || (k > 0 && inArea(pts[k - 1])) || (k + 1 < pts.length && inArea(pts[k + 1]));
      if (ins) (cur = cur || []).push(q); else if (cur) { out.push(cur); cur = null; } });
    if (cur) out.push(cur);
    return out.map(r => dp(r, tol)).filter(r => r.length >= 2).map(r => delta(r.flat())); };
  const ring = (coords, tol, minArea) => { const p = dpRing(coords.map(toM), tol); if (p.length < 4) return null;
    const a = Math.abs(p.reduce((s, [x, y], k) => { const [x2, y2] = p[(k + 1) % p.length]; return s + x * y2 - x2 * y; }, 0) / 2);
    return a >= minArea && p.some(inArea) ? delta(p.slice(0, -1).flat()) : null; };
  const T = D === 2 ? 5 : D === 1 ? 7 : 10; // simplification, metres

  const out = { meta: { id, built: new Date().toISOString().slice(0, 10), delta: true, source: de ? `Basis-DLM: ©GeoBasis-DE / LVermGeoRP (${new Date().getFullYear()}), dl-de/by-2-0, www.lvermgeo.rlp.de [Daten bearbeitet]` : "IGN — BD TOPO® (Géoplateforme, Licence Ouverte)" } };
  if (de) dlmLayers(); else bdTopoLayers();
  function dlmLayers() {
  // roads by what they're dedicated as (wdm): 1 Autobahn and Bundesstraße, 2 Landes- and Kreisstraße, 3 the village's own
  out.roads = [];
  all(LAYERS[0][0]).forEach(f => { const w = +f.properties.wdm, k = w === 1301 || w === 1303 ? 1 : w === 1305 || w === 1306 ? 2 : 3;
    if (k === 3 && D < 2) return;
    lines(f.geometry).forEach(l => runs(l, T).forEach(c => out.roads.push([k, c]))); });
  out.rail = [];
  all(LAYERS[1][0]).forEach(f => lines(f.geometry).forEach(l => runs(l, T).forEach(c => out.rail.push(c))));
  // streams as their axes; the Mosel, the Rhine and the lakes as areas (whose axes would sit inside them)
  out.water = [];
  // (unnamed ones — field drains, ditches — only at the finest detail: the Mosel alone has ten thousand)
  all(LAYERS[2][0]).forEach(f => { if (!f.properties.nam && D < 2) return; lines(f.geometry).forEach(l => runs(l, T).forEach(c => out.water.push([2, c]))); });
  out.lakes = [];
  const rv = {}, rname = (n, x, y) => { const L = rv[n] = rv[n] || []; if (L.some(([a, b]) => Math.hypot(a - x, b - y) < 6000)) return; L.push([x, y]); out.names.push(["w", n, x, y]); };
  out.names = [];
  all(LAYERS[3][0]).forEach(f => polys(f.geometry).forEach(p => { const r = ring(p[0], T, D ? 5000 : 20000); if (r) out.lakes.push(r); }));
  out.woods = [];
  all(LAYERS[4][0]).forEach(f => polys(f.geometry).forEach(p => { const r = ring(p[0], T * (D === 2 ? 1.5 : 2.5), [250000, 50000, 12000][D]); if (r) out.woods.push(r); }));
  // villages: the Ortslage, the built-up area, named; ranked by its size (a town over 3 km², a hamlet under 0.15 km²)
  out.towns = [];
  const seen = new Set();
  all(LAYERS[5][0]).forEach(f => { const tn = f.properties.nam, ps = polys(f.geometry), pm = ps.map(p => p[0].map(toM));
    ps.forEach(p => { const r = ring(p[0], T, 3000); if (r) out.towns.push(r); });
    const big = pm.sort((a, b) => b.length - a.length)[0]; if (!tn || !big) return;
    const km2 = pm.reduce((s, r) => s + Math.abs(r.reduce((t, [x, y], k) => { const [x2, y2] = r[(k + 1) % r.length]; return t + x * y2 - x2 * y; }, 0) / 2), 0) / 1e6;
    const imp = km2 > 3 ? 1 : km2 > .15 ? 2 : 3; if (imp === 3 && D < 2 && km2 < .05) return;
    const x = Math.round(big.reduce((s, q) => s + q[0], 0) / big.length), y = Math.round(big.reduce((s, q) => s + q[1], 0) / big.length);
    if (!inArea([x, y])) return; const k = tn + Math.round(x / 500) + Math.round(y / 500); if (seen.has(k)) return; seen.add(k);
    out.names.push([imp, tn, x, y]); });
  // river names: along the axes (a stream's middle) and on the big rivers' areas (the middle of the piece)
  all(LAYERS[2][0]).forEach(f => { const n = f.properties.nam; if (!n || /graben$/i.test(n)) return;
    lines(f.geometry).forEach(l => { const q = toM(l[l.length >> 1]); if (inArea(q)) rname(n, q[0], q[1]); }); });
  all(LAYERS[3][0]).forEach(f => { const n = f.properties.nam; if (!n) return;
    polys(f.geometry).forEach(p => { const r = p[0].map(toM), q = r[r.length >> 1]; if (inArea(q)) rname(n, q[0], q[1]); }); });
  }
  function bdTopoLayers() {
  // roads: 1 main (importance 1–2), 2 road (3–4), 3 lane (5); tracks only for the small regions' lanes level
  out.roads = [];
  all(LAYERS[0][0]).forEach(f => { const { nature, importance } = f.properties, imp = +importance || 6;
    if (["Sentier", "Escalier", "Piste cyclable", "Bac ou liaison maritime", "Chemin", "Route empierrée"].includes(nature)) return;
    const k = imp <= 2 ? 1 : imp <= 4 ? 2 : 3;
    if (k === 3 && D < 2) return; if (D === 0 && imp === 4) return;
    lines(f.geometry).forEach(l => runs(l, T).forEach(c => out.roads.push([k, c]))); });
  out.rail = [];
  all(LAYERS[1][0]).forEach(f => { if (f.properties.etat_de_l_objet && f.properties.etat_de_l_objet !== "En service") return;
    lines(f.geometry).forEach(l => runs(l, T).forEach(c => out.rail.push(c))); });
  // rivers: 1 wide (over 15 m: drawn as a surface too), 2 permanent stream; intermittent ditches dropped; underground skipped
  out.water = [];
  all(LAYERS[2][0]).forEach(f => { const { persistance, classe_de_largeur: w, position_par_rapport_au_sol: pos } = f.properties;
    if (persistance !== "Permanent" || (pos && +pos < 0)) return;
    const k = /Plus de 50|Entre 15 et 50/.test(w || "") ? 1 : 2;
    lines(f.geometry).forEach(l => runs(l, T).forEach(c => out.water.push([k, c]))); });
  out.lakes = [];
  all(LAYERS[3][0]).forEach(f => { if (f.properties.persistance === "Intermittent") return;
    polys(f.geometry).forEach(p => { const r = ring(p[0], T, D ? 5000 : 20000); if (r) out.lakes.push(r); }); });
  out.woods = [];
  all(LAYERS[4][0]).forEach(f => { if (!/Forêt|Bois|Lande ligneuse/.test(f.properties.nature || "")) return;
    polys(f.geometry).forEach(p => { const r = ring(p[0], T * (D === 2 ? 1.5 : 2.5), [250000, 50000, 12000][D]); if (r) out.woods.push(r); }); });
  // built-up areas (IGN's real footprints; the "fictif" ones are placeholders around a name) and their names
  out.towns = []; out.names = [];
  const seen = new Set(), maxImp = D === 2 ? 4 : 3;
  all(LAYERS[5][0]).forEach(f => { const { toponyme: tn, importance, fictif, nature } = f.properties, imp = +importance || 9;
    const ps = polys(f.geometry);
    if (!fictif && imp <= 5) ps.forEach(p => { const r = ring(p[0], T, D ? 3000 : 20000); if (r) out.towns.push(r); });
    if (!tn || imp > maxImp || /Ruines|Moulin/.test(nature || "") && imp > 2) return;
    // the name at the middle of the biggest piece
    const big = ps.map(p => p[0].map(toM)).sort((a, b) => b.length - a.length)[0]; if (!big) return;
    const x = Math.round(big.reduce((s, q) => s + q[0], 0) / big.length), y = Math.round(big.reduce((s, q) => s + q[1], 0) / big.length);
    if (!inArea([x, y])) return;
    const name = /^[a-zé]/.test(tn) ? cap(tn) : tn, k = name + Math.round(x / 500) + Math.round(y / 500); if (seen.has(k)) return; seen.add(k);
    out.names.push([Math.min(imp, 4), name, x, y]); });
  // river names (IGN places a point along each named stretch): kind "w"; one per river every 6 km
  const rv = {};
  all(LAYERS[6][0]).forEach(f => { const { classe_de_l_objet: cl, graphie_du_toponyme: tn } = f.properties;
    if (cl !== "Cours d'eau" || !tn || !f.geometry || f.geometry.type !== "Point") return;
    if (/^(fossé|canal d'irrigation|bief|rigole)\b|\d/i.test(tn)) return; // the numbered drainage ditches ("Fossé 01 de Poinchy")
    const [x, y] = toM(f.geometry.coordinates); if (!inArea([x, y])) return;
    const L = rv[tn] = rv[tn] || []; if (L.some(([a, b]) => Math.hypot(a - x, b - y) < 6000)) return; L.push([x, y]);
    out.names.push(["w", cap(tn), x, y]); });
  }

  const js = `// Generated by tools/region-topo.js ${id} — do not edit by hand.\nwindow.ATLAS_TOPO = window.ATLAS_TOPO || {};\nwindow.ATLAS_TOPO[${JSON.stringify(id)}] = ${JSON.stringify(out)};\n`;
  fs.writeFileSync(path.join(ROOT, `atlas-${id}-topo.js`), js);
  const kb = n => (n / 1024).toFixed(0) + " KB";
  console.log(`  wrote atlas-${id}-topo.js (${kb(js.length)}): ` + ["roads", "rail", "water", "lakes", "woods", "towns", "names"].map(k => `${k} ${out[k].length} (${kb(JSON.stringify(out[k]).length)})`).join(", "));
}

(async () => {
  const ids = process.argv.slice(2); if (!ids.length) { console.error("usage: node tools/region-topo.js <region…|all>"); process.exit(1); }
  for (const id of ids[0] === "all" ? FRENCH.concat(GERMAN) : ids[0] === "germany" ? GERMAN : ids) await build(id);
})().catch(e => { console.error(e.message); process.exit(1); });
