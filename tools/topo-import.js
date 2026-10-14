#!/usr/bin/env node
// IGN Géoplateforme (BD TOPO, contours) → burgundy-topo.js: the map furniture of the atlas's surveyed map.
//
//   node tools/topo-import.js            (needs burgundy-geo.js from inao-import.js, and curl)
//
// Downloads, for the strip of the Côte covered by burgundy-geo.js plus a margin: roads and tracks, railways,
// streams, woods and planted vines, buildings, 5 m contour lines, place names (villages, hamlets, lieux-dits)
// and commune boundaries. Requests go cell by cell (~2 km) and are cached in tools/.topo-cache, so a rerun is
// quick and offline. Coordinates are written in the same local metres as burgundy-geo.js, rounded and
// simplified. Data: IGN, Licence Ouverte (Etalab 2.0).
"use strict";
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, ".."), OUT = path.join(ROOT, "burgundy-topo.js");
const CACHE = path.join(__dirname, ".topo-cache"); fs.mkdirSync(CACHE, { recursive: true });
const WFS = "https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&OUTPUTFORMAT=application/json&SRSNAME=EPSG:4326";

global.window = {};
require(path.join(ROOT, "burgundy-geo.js"));
const GEO = window.BURG_GEO; if (!GEO) { console.error("burgundy-geo.js has no outlines — run inao-import.js first"); process.exit(1); }
const [LON0, LAT0] = GEO.meta.origin, R = 6371000, d2r = Math.PI / 180, KX = d2r * R * Math.cos(LAT0 * d2r), KY = d2r * R;
const toM = ([lon, lat]) => [Math.round((lon - LON0) * KX), Math.round((lat - LAT0) * KY)];
const toLL = ([x, y]) => [LON0 + x / KX, LAT0 + y / KY];

// ── the area: 2 km cells near any surveyed outline ──────────────────────────────────────────────────────────
const MARGIN = 700, CELL = 2000;
const boxes = [...Object.values(GEO.climats), ...Object.values(GEO.villages)].flatMap(mp => mp.map(p => {
  const xs = p[0].map(q => q[0]), ys = p[0].map(q => q[1]);
  return [Math.min(...xs) - MARGIN, Math.min(...ys) - MARGIN, Math.max(...xs) + MARGIN, Math.max(...ys) + MARGIN];
}));
const ext = boxes.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
const cells = [];
for (let x = ext[0]; x < ext[2]; x += CELL) for (let y = ext[1]; y < ext[3]; y += CELL) {
  const c = [x, y, x + CELL, y + CELL];
  if (boxes.some(b => b[0] < c[2] && b[2] > c[0] && b[1] < c[3] && b[3] > c[1])) cells.push(c);
}
const inArea = ([x, y]) => boxes.some(b => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]);
console.log(`${cells.length} cells of ${CELL / 1000} km`);

// ── download (curl honours the proxy; node's fetch doesn't), six requests at a time, cached per cell ──────────
const { execFile } = require("child_process");
const curl = url => new Promise((ok, fail) => execFile("curl", ["-sS", "--max-time", "180", "--retry", "8", "--retry-all-errors", "--retry-delay", "2", url],
  { maxBuffer: 1 << 30 }, (e, out) => e ? fail(e) : ok(out)));
const cacheFile = (layer, cell) => path.join(CACHE, `${layer.replace(/\W/g, "_")}_${cell[0]}_${cell[1]}.json`);
async function fetchCell(layer, cell, props) {
  const file = cacheFile(layer, cell); if (fs.existsSync(file)) return;
  const [lo0, la0] = toLL([cell[0], cell[1]]), [lo1, la1] = toLL([cell[2], cell[3]]), feats = [];
  for (let start = 0; ; start += 5000) {
    const url = `${WFS}&TYPENAMES=${layer}&BBOX=${la0.toFixed(6)},${lo0.toFixed(6)},${la1.toFixed(6)},${lo1.toFixed(6)},urn:ogc:def:crs:EPSG::4326&COUNT=5000&STARTINDEX=${start}` + (props ? `&PROPERTYNAME=${props}` : "");
    let j = null;
    for (let tries = 0; !j; tries++) {
      try { j = JSON.parse(await curl(url)); }
      catch (e) { if (tries >= 5) throw new Error(`${layer} ${cell}: ${String(e.message).slice(0, 200)}`); await new Promise(r => setTimeout(r, 2000 * (tries + 1))); }
    }
    feats.push(...(j.features || []));
    if (!j.features || j.features.length < 5000) break;
  }
  fs.writeFileSync(file, JSON.stringify(feats));
}
async function download(jobs) {
  let i = 0, done = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (i < jobs.length) { const [l, c, p] = jobs[i++]; await fetchCell(l, c, p); if (++done % 25 === 0) console.log(`  downloaded ${done}/${jobs.length}`); }
  }));
  console.log(`  downloaded ${jobs.length} cell × layer requests`);
}
function all(layer) {
  const seen = new Set(), out = [];
  cells.forEach(c => JSON.parse(fs.readFileSync(cacheFile(layer, c), "utf8")).forEach(f => {
    const id = f.id || JSON.stringify(f.geometry).slice(0, 80); if (!seen.has(id)) { seen.add(id); out.push(f); } }));
  console.log(`  ${layer}: ${out.length} features`);
  return out;
}
const LAYERS = [
  ["BDTOPO_V3:troncon_de_route", "geometrie,nature,importance,cpx_numero"], ["BDTOPO_V3:troncon_de_voie_ferree", "geometrie,nature"],
  ["BDTOPO_V3:troncon_hydrographique", "geometrie,persistance"], ["BDTOPO_V3:zone_de_vegetation", "geometrie,nature"],
  ["BDTOPO_V3:batiment", "geometrie,nature"], ["ELEVATION.CONTOUR.LINE:courbe", ""],
  ["BDTOPO_V3:toponymie", "geometrie,classe_de_l_objet,nature_de_l_objet,graphie_du_toponyme"], ["BDTOPO_V3:commune", "geometrie,code_insee,nom_officiel"],
];

// ── geometry ────────────────────────────────────────────────────────────────────────────────────────────────
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
const lines = g => !g ? [] : g.type === "LineString" ? [g.coordinates] : g.type === "MultiLineString" ? g.coordinates : [];
const rings = g => !g ? [] : g.type === "Polygon" ? g.coordinates : g.type === "MultiPolygon" ? g.coordinates.flat() : [];
const flat = pts => pts.flat();
// lines are clipped to the area (runs of points inside it, one point of overlap either side)
const lineRuns = (coords, tol) => {
  const pts = coords.map(toM), runs = []; let cur = null;
  pts.forEach((q, i) => {
    const inside = inArea(q) || (i > 0 && inArea(pts[i - 1])) || (i + 1 < pts.length && inArea(pts[i + 1]));
    if (inside) { (cur = cur || []).push(q); } else if (cur) { runs.push(cur); cur = null; }
  });
  if (cur) runs.push(cur);
  return runs.map(r => dp(r, tol)).filter(r => r.length >= 2).map(flat);
};
const line = (coords, tol) => { const r = lineRuns(coords, tol); return r.length ? r : null; };
// a closed ring is simplified as two halves, split at the point farthest from its start (a plain DP would collapse it)
const dpRing = (pts, tol) => {
  if (pts.length < 5) return pts;
  let far = 1, fd = -1; pts.forEach(([x, y], k) => { const d = Math.hypot(x - pts[0][0], y - pts[0][1]); if (d > fd) { fd = d; far = k; } });
  return dp(pts.slice(0, far + 1), tol).concat(dp(pts.slice(far), tol).slice(1));
};
const ring = (coords, tol, minArea) => {
  const p = dpRing(coords.map(toM), tol); if (p.length < 4) return null;
  const a = Math.abs(p.reduce((s, [x, y], i) => { const [x2, y2] = p[(i + 1) % p.length]; return s + x * y2 - x2 * y; }, 0) / 2);
  return a >= minArea && p.some(inArea) ? flat(p.slice(0, -1)) : null;
};

(async () => {
await download(LAYERS.flatMap(([l, p]) => cells.map(c => [l, c, p])));
// ── layers ──────────────────────────────────────────────────────────────────────────────────────────────────
const out = { meta: { source: "IGN — BD TOPO® and contour lines (Géoplateforme, Licence Ouverte)", built: new Date().toISOString().slice(0, 10), origin: [LON0, LAT0] } };

// roads: 1 main (importance 1–2), 2 road (3–4), 3 lane (5), 4 track (chemin / route empierrée)
out.roads = [];
const refs = {};
all("BDTOPO_V3:troncon_de_route", "geometrie,nature,importance,cpx_numero").forEach(f => {
  const { nature, importance, cpx_numero } = f.properties;
  if (["Sentier", "Escalier", "Piste cyclable", "Bac ou liaison maritime"].includes(nature)) return;
  const cls = +importance <= 2 ? 1 : +importance <= 4 ? 2 : (nature === "Chemin" || nature === "Route empierrée") ? 4 : 3;
  lines(f.geometry).forEach(l => (line(l, 3) || []).forEach(c => { out.roads.push([cls, c]); if (cpx_numero && cls <= 2) (refs[cpx_numero] = refs[cpx_numero] || []).push(c); }));
});
// one label point per numbered road per ~3 km: the middle of its longest piece in that stretch
out.refs = [];
Object.entries(refs).forEach(([num, segs]) => {
  const placed = [];
  segs.sort((a, b) => b.length - a.length).forEach(c => {
    if (c.length < 8) return;
    const m = (c.length / 4 | 0) * 2, x = c[m], y = c[m + 1], x2 = c[m + 2], y2 = c[m + 3];
    if (placed.some(([px, py]) => Math.hypot(px - x, py - y) < 3000)) return;
    placed.push([x, y]); out.refs.push([num, x, y, Math.round(Math.atan2(y2 - y, x2 - x) * 180 / Math.PI)]);
  });
});
out.rail = [];
all("BDTOPO_V3:troncon_de_voie_ferree", "geometrie,nature").forEach(f => lines(f.geometry).forEach(l => (line(l, 4) || []).forEach(c => out.rail.push(c))));
out.water = [];
all("BDTOPO_V3:troncon_hydrographique", "geometrie,persistance").forEach(f => lines(f.geometry).forEach(l => (line(l, 4) || []).forEach(c => out.water.push([f.properties.persistance === "Permanent" ? 1 : 2, c]))));

// woods and planted vines (BD TOPO's vegetation zones)
out.woods = []; out.vines = [];
all("BDTOPO_V3:zone_de_vegetation", "geometrie,nature").forEach(f => {
  const n = f.properties.nature || "";
  const tgt = n === "Vigne" ? out.vines : /Forêt|Bois|Lande ligneuse/.test(n) ? out.woods : null; if (!tgt) return;
  rings(f.geometry).forEach(r => { const c = ring(r, 6, 600); if (c) tgt.push(c); });
});

// buildings: outer rings, simplified to 1 m, sheds under 12 m² dropped
out.bld = [];
all("BDTOPO_V3:batiment", "geometrie,nature").forEach(f => {
  const g = f.geometry, polys = !g ? [] : g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
  polys.forEach(p => { const c = ring(p[0], 1.5, 20); if (c) out.bld.push(c); });
});

// contour lines every 5 m; [altitude, major?, coords]
out.cont = [];
all("ELEVATION.CONTOUR.LINE:courbe").forEach(f => lines(f.geometry).forEach(l => {
  (line(l, 4) || []).forEach(c => out.cont.push([f.properties.altitude, f.properties.importance === "1" ? 1 : 0, c]));
}));

// names: villages and hamlets, lieux-dits, streams; [kind, name, x, y]  kind: v village, h hamlet, l lieu-dit, w water, f wood
const cap = s => s.split(" ").map((w, i) => (i && /^(de|du|des|d'.*|la|le|les|l'.*|en|sur|sous|et|au|aux|à|ès)$/.test(w)) ? w
  : w.split("-").map(p => p.replace(/^(d'|l')?(.)/, (m, a, b) => (a || "") + b.toUpperCase())).join("-")).join(" ")
  .replace(/^(D'|L')/, m => m.toUpperCase()).replace(/^(.)/, m => m.toUpperCase());
out.names = [];
const seenName = new Set();
all("BDTOPO_V3:toponymie", "geometrie,classe_de_l_objet,nature_de_l_objet,graphie_du_toponyme").forEach(f => {
  const { classe_de_l_objet: cl, nature_de_l_objet: nat, graphie_du_toponyme: t } = f.properties;
  if (!t || !f.geometry || f.geometry.type !== "Point") return;
  const kind = cl === "Zone d'habitation" ? (/Ville|Chef-lieu|Commune/.test(nat || "") || /Quartier/.test(nat || "") ? "v" : nat === "Lieu-dit habité" || nat === "Habitation" ? "h" : "h")
    : cl === "Lieu-dit non habité" ? (nat === "Bois" || nat === "Forêt" ? "f" : "l") : cl === "Cours d'eau" ? "w" : null;
  if (!kind) return;
  const [x, y] = toM(f.geometry.coordinates); if (!inArea([x, y])) return;
  const name = cap(t.trim()), k = kind + name + Math.round(x / 300) + Math.round(y / 300);
  if (seenName.has(k)) return; seenName.add(k);
  out.names.push([kind, name, x, y]);
});

// commune boundaries (for "where am I") — the Côte d'Or and Saône-et-Loire communes the outlines touch
out.communes = [];
all("BDTOPO_V3:commune", "geometrie,code_insee,nom_officiel").forEach(f => {
  const { code_insee, nom_officiel } = f.properties; if (!/^(21|71)/.test(code_insee)) return;
  const rs = rings(f.geometry).map(r => ring(r, 8, 1e4)).filter(Boolean);
  if (rs.length) out.communes.push([code_insee, nom_officiel, rs]);
});

// delta-encode every coordinate list (first point absolute, then steps): small numbers, about half the size
const delta = f => f.map((v, i) => i < 2 ? v : v - f[i - 2]);
out.meta.delta = true;
["rail", "woods", "vines", "bld"].forEach(k => out[k] = out[k].map(delta));
out.roads = out.roads.map(([c, f]) => [c, delta(f)]); out.water = out.water.map(([c, f]) => [c, delta(f)]);
out.cont = out.cont.map(([a, m, f]) => [a, m, delta(f)]); out.communes = out.communes.map(([i, n, rs]) => [i, n, rs.map(delta)]);
const js = "// Generated by tools/topo-import.js — do not edit by hand.\nwindow.BURG_TOPO = " + JSON.stringify(out) + ";\n";
fs.writeFileSync(OUT, js);
const kb = n => (n / 1024).toFixed(0) + " KB", size = k => kb(JSON.stringify(out[k]).length);
console.log(`\nwrote burgundy-topo.js (${kb(js.length)}):`);
["roads", "rail", "water", "woods", "vines", "bld", "cont", "names", "communes", "refs"].forEach(k => console.log(`  ${k.padEnd(9)} ${String(out[k].length).padStart(6)}  ${size(k)}`));
})().catch(e => { console.error(e.message); process.exit(1); });
