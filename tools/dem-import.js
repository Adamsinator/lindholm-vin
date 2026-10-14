#!/usr/bin/env node
// Measured altitude, slope and aspect for every surveyed climat → burgundy-dem.js
//
//   node tools/dem-import.js            (needs burgundy-geo.js; uses curl and IGN's elevation service)
//
// Samples IGN's RGE ALTI® (1–5 m terrain model, Géoplateforme altimetry API) on a grid inside each climat's
// outline; local gradients between neighbouring samples give the mean slope and the direction the climat faces. Altitudes are the 5th–95th percentile band, so a stray ditch or wall doesn't stretch the range.
// Output per climat id: [alt low, alt high, mean alt, slope %, aspect ° (0 = north, 90 = east), consistency %, samples].
// Responses are cached in tools/.dem-cache.
"use strict";
const fs = require("fs"), path = require("path"), { execFile } = require("child_process");
const ROOT = path.resolve(__dirname, ".."), OUT = path.join(ROOT, "burgundy-dem.js");
const CACHE = path.join(__dirname, ".dem-cache"); fs.mkdirSync(CACHE, { recursive: true });
const API = "https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?resource=ign_rge_alti_wld&zonly=true";

global.window = {};
require(path.join(ROOT, "burgundy-geo.js"));
const GEO = window.BURG_GEO;
const [LON0, LAT0] = GEO.meta.origin, R = 6371000, d2r = Math.PI / 180, KX = d2r * R * Math.cos(LAT0 * d2r), KY = d2r * R;
const toLL = ([x, y]) => [LON0 + x / KX, LAT0 + y / KY];

const inRing = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
const inPoly = (x, y, mp) => mp.some(p => inRing(x, y, p[0]) && !p.slice(1).some(h => inRing(x, y, h)));
const area = r => Math.abs(r.reduce((s, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return s + x * y2 - x2 * y; }, 0) / 2);

// a grid inside each outline: ~10 m spacing for small climats, coarser for big ones, 12–90 points
const outlines = { ...GEO.climats, ...Object.fromEntries(Object.entries(GEO.extra || {}).map(([id, x]) => [id, x.mp])) };
const jobs = Object.entries(outlines).map(([id, mp]) => {
  const a = mp.reduce((s, p) => s + area(p[0]), 0), step = Math.max(8, Math.sqrt(a / 60));
  const xs = mp.flatMap(p => p[0].map(q => q[0])), ys = mp.flatMap(p => p[0].map(q => q[1]));
  const pts = [];
  for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step)
    for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step) if (inPoly(x, y, mp)) pts.push([x, y]);
  return { id, pts: pts.slice(0, 120), step };
}).filter(j => j.pts.length >= 3);

const curl = url => new Promise((ok, fail) => execFile("curl", ["-sS", "--max-time", "120", "--retry", "8", "--retry-all-errors", "--retry-delay", "2", url],
  { maxBuffer: 1 << 26 }, (e, out) => e ? fail(e) : ok(out)));
async function elev(id, pts) {
  const file = path.join(CACHE, id + ".json");
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const z = [];
  for (let i = 0; i < pts.length; i += 60) {
    const ll = pts.slice(i, i + 60).map(toLL);
    const url = `${API}&lon=${ll.map(p => p[0].toFixed(6)).join("|")}&lat=${ll.map(p => p[1].toFixed(6)).join("|")}`;
    let j = null;
    for (let t = 0; !j; t++) { try { j = JSON.parse(await curl(url)); if (!j.elevations) throw new Error(JSON.stringify(j).slice(0, 200)); } catch (e) { j = null; if (t >= 4) throw e; await new Promise(r => setTimeout(r, 2000 * (t + 1))); } }
    z.push(...j.elevations.map(v => typeof v === "object" ? v.z : v));
  }
  fs.writeFileSync(file, JSON.stringify(z));
  return z;
}

(async () => {
  console.log(`${jobs.length} climats, ${jobs.reduce((s, j) => s + j.pts.length, 0)} sample points`);
  const out = {};
  let i = 0, done = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (i < jobs.length) {
      const { id, pts, step } = jobs[i++], z = await elev(id, pts);
      const ok = pts.map((p, k) => [p[0], p[1], z[k]]).filter(q => q[2] > -100);
      if (++done % 50 === 0) console.log(`  ${done}/${jobs.length}`);
      if (ok.length < 3) continue;
      // local gradients on the sample grid (central differences where both neighbours are inside, else one-sided):
      // the mean of their lengths is the slope; their circular mean is the way the climat faces, and the length of that
      // mean (0–1) says how consistent it is — low for climats that wrap round a hill, like Corton-Charlemagne
      const n = ok.length, mz = ok.reduce((s, q) => s + q[2], 0) / n, key = (x, y) => Math.round(x / step * 2) + "," + Math.round(y / step * 2);
      const at = new Map(ok.map(q => [key(q[0], q[1]), q[2]]));
      const zAt = (x, y) => at.get(key(x, y));
      let sl = 0, ux = 0, uy = 0, ng = 0;
      ok.forEach(([x, y, zz]) => {
        const e = zAt(x + step, y), w = zAt(x - step, y), nn = zAt(x, y + step), so = zAt(x, y - step);
        const gx = e != null && w != null ? (e - w) / (2 * step) : e != null ? (e - zz) / step : w != null ? (zz - w) / step : null;
        const gy = nn != null && so != null ? (nn - so) / (2 * step) : nn != null ? (nn - zz) / step : so != null ? (zz - so) / step : null;
        if (gx == null || gy == null) return;
        const g = Math.hypot(gx, gy); sl += g; ng++;
        if (g > 0.01) { ux += -gx / g * g; uy += -gy / g * g; } // downhill unit vector, weighted by steepness
      });
      const slope = ng ? sl / ng * 100 : 0, aspect = (Math.atan2(ux, uy) * 180 / Math.PI + 360) % 360, consist = sl ? Math.hypot(ux, uy) / sl : 0;
      const zs = ok.map(q => q[2]).sort((p, q) => p - q), pct = f => zs[Math.min(zs.length - 1, Math.max(0, Math.round(f * (zs.length - 1))))];
      out[id] = [Math.round(pct(.05)), Math.round(pct(.95)), Math.round(mz), +slope.toFixed(1), Math.round(aspect), Math.round(consist * 100), n];
    }
  }));
  const meta = { source: "IGN — RGE ALTI® via the Géoplateforme altimetry service (Licence Ouverte)", built: new Date().toISOString().slice(0, 10),
    fields: ["alt low (p5, m)", "alt high (p95, m)", "mean alt (m)", "mean slope %", "aspect ° (faces; 0 = N, 90 = E)", "aspect consistency %", "samples"] };
  fs.writeFileSync(OUT, "// Generated by tools/dem-import.js — do not edit by hand.\nwindow.BURG_DEM = " + JSON.stringify({ meta, c: out }) + ";\n");
  console.log(`wrote burgundy-dem.js: ${Object.keys(out).length} climats`);
  ["latache", "romaneeconti", "chambertin", "montrachet", "cortoncharlemagne", "closvougeot"].forEach(id => out[id] && console.log(`  ${id}: ${out[id].join(" · ")}`));
})().catch(e => { console.error(e.message); process.exit(1); });
