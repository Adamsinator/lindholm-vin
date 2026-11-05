// Adds countries to europe-lands.js (the cellar's map of where your wines come from, and the atlas's start page) from
// Natural Earth's 50m countries (public domain), simplified about as much as the outlines already there. Countries
// already in the file are kept as they are; one entry per ring, the extra rings as "Name~1", "Name~2"…
//   curl -o ne50.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson
//   node tools/lands-add.js ne50.geojson
"use strict";
const fs = require("fs"), path = require("path");
const OUT = path.join(__dirname, "..", "europe-lands.js");
const SRC = process.argv[2]; if (!SRC) { console.error("usage: node tools/lands-add.js ne_50m_admin_0_countries.geojson"); process.exit(1); }
// the Balkans and the east, so that Greece, Romania, Bulgaria, Serbia… show, and the map has no hole where they are
const ADD = { Greece: "Greece", Romania: "Romania", Bulgaria: "Bulgaria", Serbia: "Republic of Serbia", Bosnia: "Bosnia and Herzegovina",
  Montenegro: "Montenegro", Albania: "Albania", "North Macedonia": "North Macedonia", Kosovo: "Kosovo", Moldova: "Moldova" };
const TOL = 0.12, MIN_AREA = 0.15; // degrees: Douglas-Peucker tolerance; rings smaller than this (deg²) are dropped

function dp(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) { const [a, b] = st.pop(); let md = 0, mi = -1;
    const [x1, y1] = pts[a], [x2, y2] = pts[b], L = Math.hypot(x2 - x1, y2 - y1) || 1e-9;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((y2 - y1) * pts[i][0] - (x2 - x1) * pts[i][1] + x2 * y1 - y2 * x1) / L; if (d > md) { md = d; mi = i; } }
    if (md > tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); } }
  return pts.filter((_, i) => keep[i]);
}
const area = r => Math.abs(r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
const r2 = v => Math.round(v * 100) / 100;

const ne = JSON.parse(fs.readFileSync(SRC, "utf8"));
const w = {}; new Function("window", fs.readFileSync(OUT, "utf8"))(w);
const lands = w.EUROPE_LANDS;
for (const [key, neName] of Object.entries(ADD)) {
  if (Object.keys(lands).some(k => k.replace(/~\d+$/, "") === key)) continue;
  const f = ne.features.find(x => [x.properties.NAME, x.properties.ADMIN, x.properties.NAME_LONG].includes(neName));
  if (!f) { console.error("not in Natural Earth: " + neName); continue; }
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  const rings = polys.map(p => p[0]).filter(r => area(r) >= MIN_AREA).sort((a, b) => area(b) - area(a))
    .map(r => { const s = dp(r.slice(0, -1), TOL).map(([x, y]) => [r2(x), r2(y)]); return s; }).filter(r => r.length >= 4);
  rings.forEach((r, i) => { lands[i ? `${key}~${i}` : key] = r; });
  console.log(key, rings.map(r => r.length).join("+"), "points");
}
const head = fs.readFileSync(OUT, "utf8").split("window.EUROPE_LANDS")[0];
fs.writeFileSync(OUT, head + "window.EUROPE_LANDS = {\n" + Object.entries(lands).map(([k, v]) => `  ${/^[A-Za-z]+$/.test(k) ? k : JSON.stringify(k)}:${JSON.stringify(v)},`).join("\n") + "\n};\n");
