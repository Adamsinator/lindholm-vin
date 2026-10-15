#!/usr/bin/env node
// Every cadastral lieu-dit in the vineyards → burgundy-lieuxdits.js
//
//   node tools/lieuxdits-import.js        (needs burgundy-geo.js and burgundy-topo.js, and curl)
//
// Downloads the Etalab cadastre's lieux-dits (cadastre.data.gouv.fr, Licence Ouverte) for each commune the atlas
// covers, keeps those that lie on appellation land (any INAO outline, village or climat), and writes their simplified
// outlines in the atlas's local metres, with a label point inside each. Names are the cadastre's, given proper
// capitals. Downloads are cached in tools/.cadastre-cache.
"use strict";
const fs = require("fs"), path = require("path"), zlib = require("zlib"), { execFileSync } = require("child_process");
const ROOT = path.resolve(__dirname, ".."), OUT = path.join(ROOT, "burgundy-lieuxdits.js");
const CACHE = path.join(__dirname, ".cadastre-cache"); fs.mkdirSync(CACHE, { recursive: true });
global.window = {};
require(path.join(ROOT, "burgundy-geo.js")); require(path.join(ROOT, "burgundy-topo.js"));
const GEO = window.BURG_GEO, TOPO = window.BURG_TOPO;
const [LON0, LAT0] = GEO.meta.origin, R = 6371000, d2r = Math.PI / 180, KX = d2r * R * Math.cos(LAT0 * d2r), KY = d2r * R;
const toM = ([lon, lat]) => [Math.round((lon - LON0) * KX), Math.round((lat - LAT0) * KY)];

// appellation land: every INAO outline (villages, climats, extras), with bboxes for a quick reject
const AOC = [...Object.values(GEO.villages), ...Object.values(GEO.climats), ...Object.values(GEO.extra || {}).map(x => x.mp)].flatMap(mp => mp).map(p => {
  const xs = p[0].map(q => q[0]), ys = p[0].map(q => q[1]); return { p, bb: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }; });
const inRing = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
const onINAO = (x, y) => AOC.some(({ p, bb }) => x >= bb[0] && x <= bb[2] && y >= bb[1] && y <= bb[3] && inRing(x, y, p[0]) && !p.slice(1).some(h => inRing(x, y, h)));

// Saint-Romain is an AOC village the atlas has no INAO outline for yet: there, IGN's planted-vine areas stand in
const undelta = f => { const o = []; let x = 0, y = 0; for (let i = 0; i < f.length; i += 2) { if (TOPO.meta.delta && i) { x += f[i]; y += f[i + 1]; } else { x = f[i]; y = f[i + 1]; } o.push([x, y]); } return o; };
const VINES = TOPO.vines.map(undelta).map(r => { const xs = r.map(q => q[0]), ys = r.map(q => q[1]); return { r, bb: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }; });
const onVines = (x, y) => VINES.some(({ r, bb }) => x >= bb[0] && x <= bb[2] && y >= bb[1] && y <= bb[3] && inRing(x, y, r));
const BY_VINES = new Set(["21569"]);
const onAOC = (x, y, insee) => onINAO(x, y) || (BY_VINES.has(insee) && onVines(x, y));

function dp(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]];
  while (st.length) { const [i, j] = st.pop(); let best = -1, bd = tol; const [ax, ay] = pts[i], [bx, by] = pts[j], L = Math.hypot(bx - ax, by - ay) || 1;
    for (let k = i + 1; k < j; k++) { const d = Math.abs((bx - ax) * (ay - pts[k][1]) - (ax - pts[k][0]) * (by - ay)) / L; if (d > bd) { bd = d; best = k; } }
    if (best > 0) { keep[best] = 1; st.push([i, best], [best, j]); } }
  return pts.filter((_, k) => keep[k]);
}
const dpRing = (pts, tol) => { if (pts.length < 5) return pts; let far = 1, fd = -1;
  pts.forEach(([x, y], k) => { const d = Math.hypot(x - pts[0][0], y - pts[0][1]); if (d > fd) { fd = d; far = k; } });
  return dp(pts.slice(0, far + 1), tol).concat(dp(pts.slice(far), tol).slice(1)); };
const area = r => Math.abs(r.reduce((s, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return s + x * y2 - x2 * y; }, 0) / 2);
// a label point well inside the ring: best of a coarse grid by distance to the edge
function pole(r) {
  const xs = r.map(q => q[0]), ys = r.map(q => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  let best = null, bd = -1;
  for (let i = 1; i < 12; i++) for (let j = 1; j < 12; j++) {
    const x = x0 + (x1 - x0) * i / 12, y = y0 + (y1 - y0) * j / 12; if (!inRing(x, y, r)) continue;
    let d = Infinity; for (let k = 0, l = r.length - 1; k < r.length; l = k++) { const [ax, ay] = r[l], [bx, by] = r[k], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0; d = Math.min(d, Math.hypot(x - ax - t * dx, y - ay - t * dy)); }
    if (d > bd) { bd = d; best = [Math.round(x), Math.round(y)]; }
  }
  return best || [Math.round((x0 + x1) / 2), Math.round((y0 + y1) / 2)];
}
// "LES HAUTS BEAUX MONTS" → "Les Hauts Beaux Monts", "AUX BRULEES" stays as written (the cadastre drops accents)
const cap = s => s.toLowerCase().split(" ").map((w, i) => (i && /^(de|du|des|d'.*|la|le|les|l'.*|en|sur|sous|et|ou|au|aux|à|ès|dit)$/.test(w)) ? w
  : w.split("-").map(p => p.replace(/^(d'|l')?(.)/, (m, a, b) => (a || "") + b.toUpperCase())).join("-")).join(" ").replace(/^(.)/, m => m.toUpperCase());

// the cadastre writes in capitals without accents: take the spelling from a name the atlas already has, where one matches
const fold = t => String(t).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/œ/g, "oe").replace(/[-'’]/g, " ").replace(/\s+/g, " ").trim();
const SPELL = new Map();
["burgundy-data.js", "burgundy-data-beaune.js"].forEach(f => require(path.join(ROOT, f)));
[...window.BURG.climats.map(c => c.n), ...Object.values(GEO.extra || {}).map(x => x.n), ...TOPO.names.filter(n => n[0] === "l").map(n => n[1])]
  .forEach(n => { if (n && /[^\x00-\x7f]/.test(n) && !SPELL.has(fold(n))) SPELL.set(fold(n), n); });
let respelt = 0;
const spell = n => { const hit = SPELL.get(fold(n)); if (hit && hit !== n) { respelt++; return hit; } return n; };

// cadastre quirks: 'AU CHANIOT DIT"LES FOLATIERES"', 'LE MARSAIN(2EME CANTON)', doubled spaces
const tidy = raw => { const n = raw.replace(/\s*\(/g, " (").replace(/\s*"\s*([^"]*?)\s*"/g, ' "$1"').replace(/\s+/g, " ").trim();
  const m = /^(.*?) dit "(.*)"$/i.exec(n);
  return m ? `${spell(cap(m[1]))} dit « ${spell(cap(m[2]))} »` : spell(cap(n)); };
const out = [], skipped = {};
for (const [insee, nom] of TOPO.communes.map(c => [c[0], c[1]])) {
  const file = path.join(CACHE, insee + ".json");
  if (!fs.existsSync(file)) {
    const url = `https://cadastre.data.gouv.fr/data/etalab-cadastre/latest/geojson/communes/${insee.slice(0, 2)}/${insee}/cadastre-${insee}-lieux_dits.json.gz`;
    try { fs.writeFileSync(file, zlib.gunzipSync(execFileSync("curl", ["-sSL", "--retry", "6", "--retry-all-errors", "--max-time", "120", url], { maxBuffer: 1 << 28 })).toString()); }
    catch (e) { console.log(`  ${insee} ${nom}: no lieux-dits (${String(e.message).slice(0, 80)})`); continue; }
  }
  let n = 0;
  JSON.parse(fs.readFileSync(file, "utf8")).features.forEach(f => {
    const g = f.geometry, name = (f.properties.nom || "").trim(); if (!g || !name) return;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    polys.forEach(p => {
      const r = dpRing(p[0].map(toM), 2.5); if (r.length < 4 || area(r) < 1500) return;
      const pt = pole(r);
      // on appellation land? test the label point and four points between it and the ring's corners
      const xs = r.map(q => q[0]), ys = r.map(q => q[1]), cx = [Math.min(...xs), Math.max(...xs)], cy = [Math.min(...ys), Math.max(...ys)];
      const probes = [pt, ...[[cx[0], cy[0]], [cx[1], cy[0]], [cx[0], cy[1]], [cx[1], cy[1]]].map(([x, y]) => [(x + pt[0]) / 2, (y + pt[1]) / 2])].filter(([x, y]) => inRing(x, y, r));
      if (!probes.some(([x, y]) => onAOC(x, y, insee))) { skipped[insee] = (skipped[insee] || 0) + 1; return; }
      const flat = r.slice(0, -1).flat(), d = flat.map((v, i) => i < 2 ? v : v - flat[i - 2]);
      out.push([insee, tidy(name), pt[0], pt[1], d]); n++;
    });
  });
  console.log(`  ${insee} ${nom}: ${n} lieux-dits on appellation land${skipped[insee] ? `, ${skipped[insee]} outside` : ""}`);
}
const js = "// Generated by tools/lieuxdits-import.js — do not edit by hand.\nwindow.BURG_LIEUXDITS = " + JSON.stringify({
  meta: { source: "Cadastre — lieux-dits (Etalab, cadastre.data.gouv.fr), Licence Ouverte", built: new Date().toISOString().slice(0, 10), delta: true,
    communes: Object.fromEntries(TOPO.communes.map(c => [c[0], c[1]])) }, ld: out }) + ";\n";
fs.writeFileSync(OUT, js);
console.log(`\n${respelt} names respelt with their accents`); console.log(`\nwrote burgundy-lieuxdits.js (${(js.length / 1024).toFixed(0)} KB): ${out.length} lieux-dits`);
