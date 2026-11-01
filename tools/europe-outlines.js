// The Wine atlas's start page draws each region as an outline, not only a dot. The outline is where its vineyards are:
// every region pack (and the Côte d'Or's survey) is laid on a grid of about 1.5 km, the cells its vineyards touch are
// taken, joined across gaps of a few km, and the edge of that is traced, simplified and rounded off. Writes
// atlas-outlines.js: { id: [[[lon, lat], …], …] } — one or more rings per region, drawn with even-odd fill.
//   node tools/europe-outlines.js
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..");
const d = Math.PI / 180;

function L93inv(E, N) { // as atlas.js
  const a = 6378137, e = 0.0818191910428158, m = p => Math.cos(p) / Math.sqrt(1 - e * e * Math.sin(p) ** 2);
  const tt = p => Math.tan(Math.PI / 4 - p / 2) / ((1 - e * Math.sin(p)) / (1 + e * Math.sin(p))) ** (e / 2);
  const n = (Math.log(m(44 * d)) - Math.log(m(49 * d))) / (Math.log(tt(44 * d)) - Math.log(tt(49 * d))), F = m(44 * d) / (n * tt(44 * d) ** n), r0 = a * F * tt(46.5 * d) ** n;
  const dx = E - 700000, dy = r0 - (N - 6600000), r = Math.hypot(dx, dy), th = Math.atan2(dx, dy), t0 = (r / (a * F)) ** (1 / n);
  let p = Math.PI / 2 - 2 * Math.atan(t0);
  for (let i = 0; i < 8; i++) p = Math.PI / 2 - 2 * Math.atan(t0 * ((1 - e * Math.sin(p)) / (1 + e * Math.sin(p))) ** (e / 2));
  return [th / n / d + 3, p / d];
}
const load = f => { const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx); return ctx.window; };

// every region's rings, in longitude and latitude
const src = fs.readFileSync(path.join(ROOT, "atlas.js"), "utf8");
const regions = [...src.matchAll(/\{ id: "([a-z]+)", name: "[^"]*", file: "([^"?]+)/g)].map(m => ({ id: m[1], file: m[2] }));
const sets = {};
for (const r of regions) {
  const P = load(r.file).ATLAS_PACKS[r.id], M = P.meta, O = M.origin;
  const toLL = M.proj === "eq" ? ([x, y]) => [O[0] + x / (d * 6371000 * Math.cos(O[1] * d)), O[1] - y / (d * 6371000)]
    : ([x, y]) => L93inv(M.l93[0] + x, M.l93[1] - y);
  sets[r.id] = P.climats.flatMap(c => c.g.map(p => p[0].map(toLL)));
}
{ const G = load("burgundy-geo.js").BURG_GEO, [LON0, LAT0] = G.meta.origin, KX = d * 6371000 * Math.cos(LAT0 * d), KY = d * 6371000;
  sets.burgundy = Object.values(G.climats).flatMap(c => c.map(p => p[0].map(([x, y]) => [LON0 + x / KX, LAT0 + y / KY]))); }

const DLA = 0.0135, DLO = DLA / Math.cos(47 * d); // ≈ 1.5 km square
const out = {};
for (const [id, rings] of Object.entries(sets)) {
  const cells = new Set(), key = (i, j) => i + "," + j;
  for (const r of rings) for (let k = 0; k < r.length; k++) { // the ring's edges, every ~200 m
    const [a, b] = [r[k], r[(k + 1) % r.length]], n = Math.max(1, Math.ceil(Math.hypot((b[0] - a[0]) / DLO, (b[1] - a[1]) / DLA) * 8));
    for (let s = 0; s < n; s++) { const lo = a[0] + (b[0] - a[0]) * s / n, la = a[1] + (b[1] - a[1]) * s / n; cells.add(key(Math.floor(lo / DLO), Math.floor(la / DLA))); }
  }
  // closing: grow by 2 cells (bridges gaps up to ~6 km), then shrink by 1 — the outline sits a cell outside the vines
  const grow = (S, R) => { const o = new Set(); for (const c of S) { const [i, j] = c.split(",").map(Number);
    for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) if (a * a + b * b <= R * R + R) o.add(key(i + a, j + b)); } return o; };
  const shrink = (S, R) => { const o = new Set(); for (const c of S) { const [i, j] = c.split(",").map(Number); let ok = true;
    for (let a = -R; a <= R && ok; a++) for (let b = -R; b <= R; b++) if (a * a + b * b <= R * R + R && !S.has(key(i + a, j + b))) { ok = false; break; }
    if (ok) o.add(c); } return o; };
  const S = shrink(grow(cells, 2), 1);
  // the cells' outer edges, chained into loops (directed so the filled side is on the left)
  const next = new Map(), E = (x0, y0, x1, y1) => { const k = x0 + "," + y0; (next.get(k) || next.set(k, []).get(k)).push([x1, y1]); };
  for (const c of S) { const [i, j] = c.split(",").map(Number);
    if (!S.has(key(i, j - 1))) E(i, j, i + 1, j); if (!S.has(key(i + 1, j))) E(i + 1, j, i + 1, j + 1);
    if (!S.has(key(i, j + 1))) E(i + 1, j + 1, i, j + 1); if (!S.has(key(i - 1, j))) E(i, j + 1, i, j); }
  const loops = [];
  for (const [k0] of next) while (next.get(k0) && next.get(k0).length) {
    const loop = []; let k = k0;
    while (next.get(k) && next.get(k).length) { const [x, y] = next.get(k).pop(); loop.push(k.split(",").map(Number)); k = x + "," + y; }
    if (loop.length >= 4) loops.push(loop);
  }
  // simplify (Douglas–Peucker, in cells), round off (Chaikin), back to degrees
  const dp = (pts, tol) => { if (pts.length < 3) return pts; let m = 0, mi = 0; const [a, b] = [pts[0], pts[pts.length - 1]], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    for (let i = 1; i < pts.length - 1; i++) { const dd = Math.abs((b[0] - a[0]) * (a[1] - pts[i][1]) - (a[0] - pts[i][0]) * (b[1] - a[1])) / L; if (dd > m) { m = dd; mi = i; } }
    return m > tol ? dp(pts.slice(0, mi + 1), tol).slice(0, -1).concat(dp(pts.slice(mi), tol)) : [a, b]; };
  const chaikin = p => p.flatMap((a, i) => { const b = p[(i + 1) % p.length]; return [[.75 * a[0] + .25 * b[0], .75 * a[1] + .25 * b[1]], [.25 * a[0] + .75 * b[0], .25 * a[1] + .75 * b[1]]]; });
  out[id] = loops.map(l => { const h = Math.floor(l.length / 2), s = dp(l.slice(0, h + 1), .8).slice(0, -1).concat(dp(l.slice(h).concat([l[0]]), .8).slice(0, -1));
    const r = chaikin(s.length >= 3 ? s : l).map(([i, j]) => [+(i * DLO).toFixed(2), +(j * DLA).toFixed(2)]); // 0.01° ≈ 1 km ≈ a pixel there
    return r.filter((p, i) => { const q = r[(i + r.length - 1) % r.length]; return p[0] !== q[0] || p[1] !== q[1]; }); });
  console.log(id.padEnd(12), rings.length + " rings →", out[id].length + " loops,", out[id].reduce((n, l) => n + l.length, 0) + " points");
}
fs.writeFileSync(path.join(ROOT, "atlas-outlines.js"), "// Generated by tools/europe-outlines.js — do not edit by hand. Where each region's vineyards are, for the start\n" +
  "// page's map: [lon, lat] rings, even-odd. From the regions' own maps (INAO, Licence Ouverte; the Weinbergsrolle, dl-de/by-2-0).\n" +
  "window.ATLAS_OUTLINES = " + JSON.stringify(out) + ";\n");
console.log("atlas-outlines.js", fs.statSync(path.join(ROOT, "atlas-outlines.js")).size, "bytes");
