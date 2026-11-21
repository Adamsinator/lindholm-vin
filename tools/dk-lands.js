// Denmark's outline in europe-lands.js, from DAGI's municipalities (Styrelsen for Dataforsyning og Infrastruktur, free
// geographic data) instead of Natural Earth's 50m one, which is too coarse for the atlas's map of Denmark: its vineyards
// fell in the sea. The islands of more than MIN_KM2, simplified to about 2 km. Needs tools/.region-cache/dk-kommuner.json
// (made by `node tools/region-build.js danmark`).
//   node tools/dk-lands.js
"use strict";
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, ".."), FILE = path.join(ROOT, "europe-lands.js"), MIN_KM2 = 200, TOL = 0.03;
const pc = require("./node_modules/polygon-clipping");
const kom = JSON.parse(fs.readFileSync(path.join(__dirname, ".region-cache", "dk-kommuner.json"), "utf8")).features;
const polys = kom.flatMap(f => f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates);
const land = pc.union(...polys.map(p => [p]));
const km2 = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  return Math.abs(a / 2) * 111.32 * 111.32 * Math.cos(56 * Math.PI / 180); };
function simplify(pts, tol) { // Douglas–Peucker
  if (pts.length < 3) return pts; const [a, b] = [pts[0], pts[pts.length - 1]]; let md = 0, mi = 0;
  for (let i = 1; i < pts.length - 1; i++) { const [x, y] = pts[i], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-12;
    const dd = Math.abs(dy * x - dx * y + b[0] * a[1] - b[1] * a[0]) / L; if (dd > md) { md = dd; mi = i; } }
  return md > tol ? simplify(pts.slice(0, mi + 1), tol).slice(0, -1).concat(simplify(pts.slice(mi), tol)) : [a, b];
}
const rings = land.map(p => p[0]).filter(r => km2(r) >= MIN_KM2).sort((a, b) => km2(b) - km2(a))
  .map(r => { const h = r.length >> 1; return simplify(r.slice(0, h + 1), TOL).slice(0, -1).concat(simplify(r.slice(h), TOL)); }) // a closed ring in two halves
  .map(r => r.map(([x, y]) => [+x.toFixed(2), +y.toFixed(2)])).filter(r => r.length >= 4);
let src = fs.readFileSync(FILE, "utf8");
src = src.replace(/^ {2}"?Denmark(~\d+)?"?:\[.*\],?\n/gm, ""); // the old ones, a line each
const lines = rings.map((r, i) => `  ${i ? `"Denmark~${i}"` : "Denmark"}:${JSON.stringify(r)},\n`).join("");
src = src.replace(/^( {2}"?United Kingdom"?:)/m, lines + "$1");
if (!/Natural Earth.*DAGI|DAGI/.test(src.split("\n").slice(0, 3).join("\n")))
  src = src.replace(/^(\/\/ Wine atlas's start page\.[^\n]*)$/m, "$1\n// Denmark's islands: DAGI, Styrelsen for Dataforsyning og Infrastruktur (free geographic data), simplified (tools/dk-lands.js).");
fs.writeFileSync(FILE, src);
console.error(`Denmark: ${rings.length} islands, ${rings.reduce((s, r) => s + r.length, 0)} points`);
