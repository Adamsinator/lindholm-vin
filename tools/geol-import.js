#!/usr/bin/env node
// BRGM geological map (BD Charm-50, harmonised 1:50 000, Côte-d'Or) → burgundy-geol.js
//
//   node tools/geol-import.js <folder with GEO050K_HARM_021_S_FGEOL_2154.shp/.dbf>
//
// The file comes from BRGM's InfoTerre downloads (GEO050K_HARM_021.zip). Formations are clipped to the strip the
// atlas's INAO outlines cover (plus a margin), simplified, and written in the atlas's local metres with BRGM's own
// colours (converted from CMYK). For every climat it also records the formations under it, with their share of its
// area — the bedrock (and mapped superficial deposits) the panel names.
"use strict";
const fs = require("fs"), path = require("path");
const pc = require("./node_modules/polygon-clipping");
const ROOT = path.resolve(__dirname, ".."), DIR = path.resolve(process.argv[2] || "."), OUT = path.join(ROOT, "burgundy-geol.js");
global.window = {};
require(path.join(ROOT, "burgundy-geo.js"));
const GEO = window.BURG_GEO;
const [LON0, LAT0] = GEO.meta.origin, R = 6371000, d2r = Math.PI / 180, KX = d2r * R * Math.cos(LAT0 * d2r), KY = d2r * R;

// Lambert-93 → WGS84 (as in inao-import.js) → atlas metres
const L93 = (() => {
  const a = 6378137, e = 0.0818191910428158, d = Math.PI / 180;
  const t = p => Math.tan(Math.PI / 4 - p / 2) / Math.pow((1 - e * Math.sin(p)) / (1 + e * Math.sin(p)), e / 2);
  const m = p => Math.cos(p) / Math.sqrt(1 - e * e * Math.sin(p) ** 2);
  const p1 = 44 * d, p2 = 49 * d, p0 = 46.5 * d, l0 = 3 * d;
  const n = (Math.log(m(p1)) - Math.log(m(p2))) / (Math.log(t(p1)) - Math.log(t(p2)));
  const F = m(p1) / (n * Math.pow(t(p1), n)), r0 = a * F * Math.pow(t(p0), n);
  return ([x, y]) => {
    const dx = x - 700000, dy = r0 - (y - 6600000), r = Math.sign(n) * Math.hypot(dx, dy);
    const tt = Math.pow(r / (a * F), 1 / n), lon = Math.atan2(dx, dy) / n + l0;
    let lat = Math.PI / 2 - 2 * Math.atan(tt);
    for (let i = 0; i < 8; i++) lat = Math.PI / 2 - 2 * Math.atan(tt * Math.pow((1 - e * Math.sin(lat)) / (1 + e * Math.sin(lat)), e / 2));
    return [lon / d, lat / d];
  };
})();
const toM = q => { const [lon, lat] = L93(q); return [Math.round((lon - LON0) * KX), Math.round((lat - LAT0) * KY)]; };

// the area: every surveyed outline grown by 400 m, as one polygon to clip against
const MARGIN = 400;
const boxes = [...Object.values(GEO.climats), ...Object.values(GEO.villages)].flatMap(mp => mp.map(p => {
  const xs = p[0].map(q => q[0]), ys = p[0].map(q => q[1]);
  return [Math.min(...xs) - MARGIN, Math.min(...ys) - MARGIN, Math.max(...xs) + MARGIN, Math.max(...ys) + MARGIN];
}));
const AREA = pc.union(...boxes.map(([x0, y0, x1, y1]) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]));
const ext = boxes.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);

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
const mpArea = mp => mp.reduce((s, p) => s + area(p[0]) - p.slice(1).reduce((t, h) => t + area(h), 0), 0);
const clamp = v => Math.max(0, Math.min(100, v)); // BRGM uses −1 for "none"
const cmyk = (c, m, y, k) => "#" + [c, m, y].map(v => Math.round(255 * (1 - clamp(v) / 100) * (1 - clamp(k) / 100)).toString(16).padStart(2, "0")).join("");

(async () => {
  const shp = require("./node_modules/shapefile");
  const file = fs.readdirSync(DIR).find(f => /_S_FGEOL_2154\.shp$/i.test(f));
  const src = await shp.open(path.join(DIR, file), path.join(DIR, file.replace(/\.shp$/i, ".dbf")), { encoding: "latin1" });
  const legend = {}, polys = [];
  for (let r = await src.read(); !r.done; r = await src.read()) {
    const f = r.value, p = f.properties, g = f.geometry; if (!g) continue;
    const parts = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    const mp = parts.map(pp => pp.map(ring => ring.map(toM)));
    const xs = mp.flatMap(pp => pp[0].map(q => q[0])), ys = mp.flatMap(pp => pp[0].map(q => q[1]));
    if (Math.max(...xs) < ext[0] || Math.min(...xs) > ext[2] || Math.max(...ys) < ext[1] || Math.min(...ys) > ext[3]) continue;
    let clip; try { clip = pc.intersection(mp, AREA); } catch (e) { continue; }
    if (!clip.length) continue;
    const code = String(p.CODE_LEG || p.CODE);
    legend[code] ||= [p.NOTATION || "", (p.DESCR || "").trim(), cmyk(+p.C_FOND || 0, +p.M_FOND || 0, +p.J_FOND || 0, +p.N_FOND || 0)];
    polys.push([code, clip]);
  }
  console.log(`${polys.length} formation polygons in the area, ${Object.keys(legend).length} formations`);
  // formations under each climat (atlas + INAO extras), by share of its area
  const outlines = { ...GEO.climats, ...Object.fromEntries(Object.entries(GEO.extra || {}).map(([id, x]) => [id, x.mp])) };
  const under = {};
  Object.entries(outlines).forEach(([id, mp]) => {
    const tot = mpArea(mp), sh = {};
    const xs = mp.flatMap(pp => pp[0].map(q => q[0])), ys = mp.flatMap(pp => pp[0].map(q => q[1])), bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    polys.forEach(([code, gp]) => {
      const gx = gp.flatMap(pp => pp[0].map(q => q[0])), gy = gp.flatMap(pp => pp[0].map(q => q[1]));
      if (Math.max(...gx) < bb[0] || Math.min(...gx) > bb[2] || Math.max(...gy) < bb[1] || Math.min(...gy) > bb[3]) return;
      let a = 0; try { a = mpArea(pc.intersection(mp, gp)); } catch (e) {}
      if (a > 0) sh[code] = (sh[code] || 0) + a;
    });
    const list = Object.entries(sh).map(([c, a]) => [c, Math.round(100 * a / tot)]).filter(([, p]) => p >= 3).sort((a, b) => b[1] - a[1]).slice(0, 4);
    if (list.length) under[id] = list;
  });
  // output: delta-encoded simplified rings, grouped by formation
  const delta = f => f.map((v, i) => i < 2 ? v : v - f[i - 2]);
  const byCode = {};
  polys.forEach(([code, mp]) => mp.forEach(pp => pp.forEach(ring => {
    const s = dpRing(ring, 5); if (s.length < 4 || area(s) < 300) return;
    (byCode[code] ||= []).push(delta(s.slice(0, -1).flat()));
  })));
  const out = { meta: { source: "BRGM — carte géologique harmonisée 1:50 000 (BD Charm-50), Côte-d'Or", built: new Date().toISOString().slice(0, 10), delta: true },
    legend, shapes: byCode, under };
  const js = "// Generated by tools/geol-import.js — do not edit by hand.\nwindow.BURG_GEOL = " + JSON.stringify(out) + ";\n";
  fs.writeFileSync(OUT, js);
  console.log(`wrote burgundy-geol.js (${(js.length / 1024).toFixed(0)} KB), formations under ${Object.keys(under).length} climats`);
  ["latache", "chambertin", "montrachet", "cortoncharlemagne", "closvougeot"].forEach(id => under[id] && console.log(" ", id, under[id].map(([c, p]) => `${legend[c][0]} ${p}% (${legend[c][1].slice(0, 60)})`).join(" | ")));
})().catch(e => { console.error(e); process.exit(1); });
