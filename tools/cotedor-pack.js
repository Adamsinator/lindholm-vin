#!/usr/bin/env node
// The Côte d'Or's data (burgundy-*.js, the detailed atlas's own files) → region packs for the Wine atlas, so the one
// engine (atlas.js) can show it: atlas-cotedor.js (climats with their owners, villages), -topo.js, -dem.js, -geol.js.
//
//   node tools/cotedor-pack.js
//
// Nothing is fetched: the geometry is the same INAO / IGN / BRGM data burgundy.html draws, moved from its local grid
// (metres east and north of 4.85° E, 47.1° N, on an equirectangular plane) into the frame the other French regions use
// (Lambert-93 metres from the pack's reference point, y pointing south), so IGN's relief tiles, aerial photos, the
// slope profile and the 3D view work as they do everywhere else. Re-run it whenever a burgundy-*.js file changes.
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "..");
global.window = {};
["burgundy-data.js", "burgundy-data-beaune.js", "burgundy-detail.js", "burgundy-geo.js", "burgundy-extras.js", "burgundy-names.js",
  "burgundy-dem.js", "burgundy-geol.js", "burgundy-topo.js"].forEach(f => require(path.join(ROOT, f)));
const B = window.BURG, GEO = window.BURG_GEO, EX = window.BURG_EXTRAS || {}, DEM = window.BURG_DEM, GEOL = window.BURG_GEOL, TOPO = window.BURG_TOPO;

// ── from the Côte d'Or grid to Lambert-93 ──
const d2r = Math.PI / 180, RE = 6371000, [LON0, LAT0] = GEO.meta.origin;
const toLL = ([x, y]) => [LON0 + x / (d2r * RE * Math.cos(LAT0 * d2r)), LAT0 + y / (d2r * RE)];
const L93 = (() => { const a = 6378137, e = 0.0818191910428158, d = Math.PI / 180; // as in atlas.js
  const m = p => Math.cos(p) / Math.sqrt(1 - e * e * Math.sin(p) ** 2), tt = p => Math.tan(Math.PI / 4 - p / 2) / ((1 - e * Math.sin(p)) / (1 + e * Math.sin(p))) ** (e / 2);
  const n = (Math.log(m(44 * d)) - Math.log(m(49 * d))) / (Math.log(tt(44 * d)) - Math.log(tt(49 * d))), F = m(44 * d) / (n * tt(44 * d) ** n), r0 = a * F * tt(46.5 * d) ** n;
  return (lon, lat) => { const r = a * F * tt(lat * d) ** n, th = n * (lon - 3) * d; return [700000 + r * Math.sin(th), 6600000 + r0 - r * Math.cos(th)]; }; })();
const [E0, N0] = L93(LON0, LAT0).map(Math.round);
const P = q => { const [E, N] = L93(...toLL(q)); return [Math.round(E - E0), Math.round(N0 - N)]; };
const mpP = mp => mp.map(p => p.map(r => r.map(P)));
// delta-encoded lists (first point absolute, then steps), as both formats keep their lines
const undelta = f => { const o = []; let x = 0, y = 0; for (let i = 0; i < f.length; i += 2) { x += f[i]; y += f[i + 1]; o.push([x, y]); } return o; };
const delta = pts => { const o = []; let px = 0, py = 0; pts.forEach(([x, y], i) => { o.push(i ? x - px : x, i ? y - py : y); px = x; py = y; }); return o; };
const reline = f => delta(undelta(f).map(P));

// ── geometry helpers (as tools/region-build.js) ──
const ringArea = r => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return s / 2; };
const inside = ([x, y], ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j];
  if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
const inPoly = (pt, p) => inside(pt, p[0]) && !p.slice(1).some(h => inside(pt, h));
const label = mp => {
  const p = mp.slice().sort((a, b) => Math.abs(ringArea(b[0])) - Math.abs(ringArea(a[0])))[0]; if (!p) return [0, 0];
  const r = p[0]; let cx = 0, cy = 0; r.forEach(([x, y]) => { cx += x; cy += y; }); cx /= r.length; cy /= r.length;
  if (inPoly([cx, cy], p)) return [Math.round(cx), Math.round(cy)];
  const ys = r.map(q => q[1]), y = (Math.min(...ys) + Math.max(...ys)) / 2, xs = [];
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y)) xs.push(xi + (y - yi) * (xj - xi) / (yj - yi)); }
  xs.sort((a, b) => a - b); return [Math.round((xs[0] + xs[1]) / 2), Math.round(y)];
};
const polyHa = mp => mp.reduce((s, p) => s + Math.abs(ringArea(p[0])) - p.slice(1).reduce((h, r) => h + Math.abs(ringArea(r)), 0), 0) / 1e4;

// ── the pack: every climat with an outline, its owners and notes; the village appellations as the land around ──
const V = Object.fromEntries(B.villages.map(v => [v.id, v]));
const vname = id => (V[id] && V[id].n) || id;
const COLS = { R: "R", W: "W", RW: "RW" };
const climats = [], missing = [];
B.climats.forEach(c => {
  const g0 = GEO.climats[c.id]; if (!g0) { missing.push(c.id); return; }
  const g = mpP(g0), app = vname(c.v);
  const ap = c.c === "GC" ? c.n : c.c === "1er" ? `${app} 1er Cru ${c.n}` : app;
  climats.push(Object.assign({ id: c.id, n: c.n, c: c.c === "V" ? "V" : c.c, ap, app, col: COLS[c.col] || c.col || "R", ha: c.ha, haMap: +polyHa(g).toFixed(2), lp: label(g), g, v: c.v },
    c.p && c.p.length ? { own: c.p } : {}, c.mono ? { mono: c.mono } : {}, c.d ? { d: c.d } : {}, c.detail ? { detail: c.detail } : {}));
});
// INAO's other named climats (premiers crus and village climats burgundy-data.js doesn't describe), with the holdings
// burgundy-extras.js has for them
Object.entries(GEO.extra || {}).forEach(([id, x]) => {
  const g = mpP(x.mp), app = vname(x.v), c = x.c === "GC" ? "GC" : x.c === "1er" ? "1er" : "V";
  const hold = (EX.holdings || {})[id];
  climats.push(Object.assign({ id, n: x.n, c, ap: x.ap || (c === "1er" ? `${app} 1er Cru ${x.n}` : app), app, col: "R", ha: +polyHa(g).toFixed(2), lp: label(g), g, v: x.v, x: 1 },
    hold && hold.length ? { own: hold } : {}));
});
const RANK = { GC: 0, "1er": 1, V: 2 };
climats.sort((a, b) => RANK[a.c] - RANK[b.c] || a.n.localeCompare(b.n, "fr"));
const villages = Object.entries(GEO.villages || {}).map(([id, mp]) => ({ id, n: vname(id), g: mpP(mp) }));
const all = climats.flatMap(c => c.g).concat(...villages.map(v => v.g)).flatMap(p => p[0]);
const bb = all.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
const today = new Date().toISOString().slice(0, 10);
const pack = { meta: { id: "cotedor", name: "Côte d'Or", country: "Frankrig", region: "Bourgogne", built: today, origin: [LON0, LAT0], l93: [E0, N0], bb, kind: "cotedor",
    source: GEO.meta.source + "; owners: AllWine's compiled list (domaine sites, trade press), approximate" },
  climats, villages, regional: { ha: 0, g: [] }, producers: B.producers };
const write = (file, global, obj) => { const js = `// Generated by tools/cotedor-pack.js from the burgundy-*.js files — do not edit by hand.\nwindow.${global} = window.${global} || {};\nwindow.${global}["cotedor"] = ${JSON.stringify(obj)};\n`;
  fs.writeFileSync(path.join(ROOT, file), js); console.log(`wrote ${file} (${(js.length / 1024).toFixed(0)} KB)`); };
write("atlas-cotedor.js", "ATLAS_PACKS", pack);

// ── terrain per climat: the same figures (the 8th field, the sampling grid, the Côte d'Or file doesn't keep) ──
const demC = {}; Object.entries(DEM.c || {}).forEach(([id, v]) => { demC[id] = v.concat(v.length < 8 ? [null] : []); });
write("atlas-cotedor-dem.js", "ATLAS_DEM", { meta: Object.assign({}, DEM.meta, { id: "cotedor" }), c: demC });

// ── geology: the formations' outlines moved; what lies under each climat as it was ──
const shapes = {}; Object.entries(GEOL.shapes).forEach(([k, list]) => { shapes[k] = list.map(reline); });
write("atlas-cotedor-geol.js", "ATLAS_GEOL", { meta: Object.assign({}, GEOL.meta, { id: "cotedor" }), legend: GEOL.legend, shapes, under: GEOL.under });

// ── the map furniture: roads (tracks left out, as elsewhere), railways, streams, woods, place names ──
const NAMEK = { v: 2, h: 3, q: 4, w: "w" }; // villages, hamlets, quarters and mills, streams (lieux-dits come with their own layer)
const topo = { meta: { id: "cotedor", source: TOPO.meta.source, built: today, delta: true },
  roads: TOPO.roads.filter(([k]) => k <= 3).map(([k, f]) => [k, reline(f)]),
  rail: TOPO.rail.map(reline),
  water: TOPO.water.map(([k, f]) => [k, reline(f)]),
  lakes: [], woods: TOPO.woods.map(reline), towns: [],
  names: TOPO.names.filter(([k]) => k in NAMEK).map(([k, n, x, y]) => [NAMEK[k], n, ...P([x, y])]) };
write("atlas-cotedor-topo.js", "ATLAS_TOPO", topo);
console.log(`${climats.length} climats (${climats.filter(c => c.x).length} INAO extras), ${villages.length} villages; no outline for: ${missing.join(", ") || "none"}`);
