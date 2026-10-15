// Shared by dem-import.js and lieuxdits-import.js: sample IGN's RGE ALTI® elevation service on a grid of points and
// summarise it as [alt low (p5), alt high (p95), mean alt, slope %, aspect °, aspect consistency %, samples].
"use strict";
const fs = require("fs"), path = require("path"), { execFile } = require("child_process");
const API = "https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?resource=ign_rge_alti_wld&zonly=true";
module.exports = (CACHE, toLL) => {
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


  // pts on a square grid of spacing step (metres); z the elevations, -99999 where the service has none
  function stats(pts, step, z) {
      const ok = pts.map((p, k) => [p[0], p[1], z[k]]).filter(q => q[2] > -100);
      if (ok.length < 3) return null;
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
      return [Math.round(pct(.05)), Math.round(pct(.95)), Math.round(mz), +slope.toFixed(1), Math.round(aspect), Math.round(consist * 100), n];
  }
  // a grid inside a multipolygon: ~8 m or coarser so it holds about `target` points (at most `max`)
  function grid(mp, inPoly, area, target = 60, max = 120) {
    const a = mp.reduce((s, p) => s + area(p[0]), 0), step = Math.max(8, Math.sqrt(a / target));
    const xs = mp.flatMap(p => p[0].map(q => q[0])), ys = mp.flatMap(p => p[0].map(q => q[1])), pts = [];
    for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step)
      for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step) if (inPoly(x, y, mp)) pts.push([x, y]);
    return { pts: pts.slice(0, max), step };
  }
  return { elev, stats, grid };
};
