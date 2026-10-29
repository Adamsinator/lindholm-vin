#!/usr/bin/env node
// IGN BD TOPO → atlas-<id>-topo.js: the map furniture under a French region's vineyards in the Wine atlas — roads,
// railways, rivers and lakes, woods, built-up areas and the names of villages, hamlets and rivers. The relief under
// it is IGN's hillshade, fetched by the page as tiles (atlas.js); this file is only what's drawn as vectors.
//
//   node tools/region-topo.js chablis [champagne …]     (or "all"; needs atlas-<id>.js from region-build.js, and curl)
//
// Asked for in Lambert-93 (EPSG:2154), the pack's own grid, so nothing is reprojected here: x = E − E0, y = N0 − N.
// Only the ground near the vineyards is fetched (cells of a few km touching an outline, plus a margin), cached in
// tools/.topo-cache. Data: IGN, Licence Ouverte (Etalab 2.0).
"use strict";
const fs = require("fs"), path = require("path"), { execFile } = require("child_process");
const ROOT = path.resolve(__dirname, ".."), CACHE = path.join(__dirname, ".topo-cache"); fs.mkdirSync(CACHE, { recursive: true });
const WFS = "https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&OUTPUTFORMAT=application/json&SRSNAME=EPSG:2154";
const FRENCH = ["chablis", "chalonnaise", "maconnais", "champagne", "alsace", "rhone", "bordeaux"];

// how much to draw: the small regions get their lanes and hamlets too; Bordeaux, the size of a département, doesn't
const DETAIL = { chablis: 2, chalonnaise: 2, maconnais: 2, rhone: 2, alsace: 1, champagne: 1, bordeaux: 0 };

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
  const P = window.ATLAS_PACKS[id], [E0, N0] = P.meta.l93, D = DETAIL[id] ?? 1;
  if (!E0 || P.meta.proj) throw new Error(id + ": not a Lambert-93 pack");
  const toM = ([e, n]) => [Math.round(e - E0), Math.round(N0 - n)];

  // the ground: cells touching a vineyard (with a margin); big regions in bigger cells
  const MARGIN = D ? 1500 : 2500, CELL = D === 2 ? 3000 : 5000;
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

  const cacheFile = (layer, c) => path.join(CACHE, `l93_${layer.replace(/\W/g, "_")}_${Math.round(E0 + c[0])}_${Math.round(N0 - c[3])}_${CELL}.json`); // absolute: the south-west corner
  async function fetchCell(layer, props, c) {
    const file = cacheFile(layer, c); if (fs.existsSync(file)) return;
    // the cell in Lambert-93: west, south, east, north (y grows southwards in the pack)
    const w = E0 + c[0], e = E0 + c[2], s = N0 - c[3], n = N0 - c[1], feats = [];
    for (let start = 0; ; start += 5000) {
      const url = `${WFS}&TYPENAMES=${layer}&BBOX=${w},${s},${e},${n},urn:ogc:def:crs:EPSG::2154&COUNT=5000&STARTINDEX=${start}&PROPERTYNAME=${props}`;
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
  const LAYERS = [
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

  const out = { meta: { id, source: "IGN — BD TOPO® (Géoplateforme, Licence Ouverte)", built: new Date().toISOString().slice(0, 10), delta: true } };
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
    polys(f.geometry).forEach(p => { const r = ring(p[0], T * 1.5, D === 2 ? 12000 : 25000); if (r) out.woods.push(r); }); });
  // built-up areas (IGN's real footprints; the "fictif" ones are placeholders around a name) and their names
  out.towns = []; out.names = [];
  const seen = new Set(), maxImp = D === 2 ? 4 : 3;
  all(LAYERS[5][0]).forEach(f => { const { toponyme: tn, importance, fictif, nature } = f.properties, imp = +importance || 9;
    const ps = polys(f.geometry);
    if (!fictif && imp <= 5) ps.forEach(p => { const r = ring(p[0], T, 3000); if (r) out.towns.push(r); });
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

  const js = `// Generated by tools/region-topo.js ${id} — do not edit by hand.\nwindow.ATLAS_TOPO = window.ATLAS_TOPO || {};\nwindow.ATLAS_TOPO[${JSON.stringify(id)}] = ${JSON.stringify(out)};\n`;
  fs.writeFileSync(path.join(ROOT, `atlas-${id}-topo.js`), js);
  const kb = n => (n / 1024).toFixed(0) + " KB";
  console.log(`  wrote atlas-${id}-topo.js (${kb(js.length)}): ` + ["roads", "rail", "water", "lakes", "woods", "towns", "names"].map(k => `${k} ${out[k].length} (${kb(JSON.stringify(out[k]).length)})`).join(", "));
}

(async () => {
  const ids = process.argv.slice(2); if (!ids.length) { console.error("usage: node tools/region-topo.js <region…|all>"); process.exit(1); }
  for (const id of ids[0] === "all" ? FRENCH : ids) await build(id);
})().catch(e => { console.error(e.message); process.exit(1); });
