#!/usr/bin/env node
// Measured altitude, slope and aspect for each Einzellage of a German region pack → atlas-<id>-dem.js, as
// tools/region-dem.js does for France: a grid of points inside each outline (dem-lib.js), their heights from
// Rheinland-Pfalz's 1 m terrain model (DGM1, ©GeoBasis-DE / LVermGeoRP, dl-de/by-2-0; read by de-dem-sample.py),
// local gradients between neighbouring samples for the slope and the way it faces.
// An Einzellage's legal outline is often twice its vines (the plateau above, woods, the village), so the points are
// kept to its vineyard land: the Basis-DLM's farmland marked "Weingarten" (veg 1040), where at least a dozen fall.
//
//   node tools/de-dem.js mosel [nahe …]   (or "all"; needs python3 with tifffile and imagecodecs: PY=… to pick one)
//
// Heights are cached per region in tools/.dem-cache (the tiles themselves aren't kept).
"use strict";
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const ROOT = path.resolve(__dirname, ".."), CACHE = path.join(__dirname, ".dem-cache"); fs.mkdirSync(CACHE, { recursive: true });
const GERMAN = ["mosel", "nahe", "pfalz", "rheinhessen", "mittelrhein", "ahr"];
const PY = process.env.PY || "python3";

// ETRS89 → UTM zone 32N (EPSG:25832): transverse Mercator on GRS80, Krüger's series to n⁴ (checked against PROJ to the mm)
const utm32 = (() => { const a = 6378137, f = 1 / 298.257222101, n = f / (2 - f), k0 = 0.9996, d = Math.PI / 180, l0 = 9 * d;
  const A = a / (1 + n) * (1 + n * n / 4 + n ** 4 / 64);
  const al = [n / 2 - 2 * n * n / 3 + 5 * n ** 3 / 16 + 41 * n ** 4 / 180, 13 * n * n / 48 - 3 * n ** 3 / 5 + 557 * n ** 4 / 1440, 61 * n ** 3 / 240 - 103 * n ** 4 / 140, 49561 * n ** 4 / 161280];
  return (lon, lat) => { const p = lat * d, l = lon * d - l0, s = 2 * Math.sqrt(n) / (1 + n);
    const t = Math.sinh(Math.atanh(Math.sin(p)) - s * Math.atanh(s * Math.sin(p)));
    const xi = Math.atan2(t, Math.cos(l)), eta = Math.atanh(Math.sin(l) / Math.sqrt(1 + t * t));
    let x = eta, y = xi; al.forEach((c, j) => { const k = 2 * (j + 1); x += c * Math.cos(k * xi) * Math.sinh(k * eta); y += c * Math.sin(k * xi) * Math.cosh(k * eta); });
    return [500000 + k0 * A * x, k0 * A * y]; }; })();
{ const [E, N] = utm32(7.05, 49.945); if (Math.abs(E - 360094.450) > .01 || Math.abs(N - 5534338.207) > .01) throw new Error("UTM check"); } // PROJ's figures

const inRing = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
const inPoly = (x, y, mp) => mp.some(p => inRing(x, y, p[0]) && !p.slice(1).some(h => inRing(x, y, h)));
const area = r => Math.abs(r.reduce((s, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return s + x * y2 - x2 * y; }, 0) / 2);

// the Basis-DLM's vineyard land for the pack, fetched in 3 km cells (cached as region-topo.js caches them)
const DLM = "https://geo5.service24.rlp.de/wfs/basisdlm_shape_rp.fcgi?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&OUTPUTFORMAT=application/json;%20subtype=geojson&SRSNAME=EPSG:4326&TYPENAMES=vermkv:Vegetation_VEG01_F";
function vineLand(id, P, toM) {
  const O = P.meta.origin, d2r = Math.PI / 180, kx = d2r * 6371000 * Math.cos(O[1] * d2r), ky = d2r * 6371000, CELL = 3000;
  const bb = P.climats.flatMap(c => c.g.flatMap(p => p[0])).reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [1e9, 1e9, -1e9, -1e9]);
  const boxes = P.climats.map(c => c.g.flatMap(p => p[0])).map(r => [Math.min(...r.map(q => q[0])), Math.min(...r.map(q => q[1])), Math.max(...r.map(q => q[0])), Math.max(...r.map(q => q[1]))]);
  const polys = [];
  for (let x = Math.floor(bb[0] / CELL) * CELL; x < bb[2]; x += CELL) for (let y = Math.floor(bb[1] / CELL) * CELL; y < bb[3]; y += CELL) {
    if (!boxes.some(b => b[0] < x + CELL && b[2] > x && b[1] < y + CELL && b[3] > y)) continue;
    const file = path.join(__dirname, ".topo-cache", `dlm_${id}_Vegetation_VEG01_F_${x}_${y}_${CELL}.json`);
    if (!fs.existsSync(file)) {
      const bbox = `${(O[1] - (y + CELL) / ky).toFixed(6)},${(O[0] + x / kx).toFixed(6)},${(O[1] - y / ky).toFixed(6)},${(O[0] + (x + CELL) / kx).toFixed(6)},urn:ogc:def:crs:EPSG::4326`;
      let j = null;
      for (let t = 0; !j && t < 6; t++) try { j = JSON.parse(execFileSync("curl", ["-sS", "--max-time", "180", `${DLM}&BBOX=${bbox}&COUNT=5000`], { maxBuffer: 1 << 28 }).toString()); if (!j.features) j = null; } catch (e) { j = null; }
      if (!j) throw new Error(`${id}: the Basis-DLM's farmland for cell ${x},${y} wouldn't come`);
      fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(j.features));
    }
    JSON.parse(fs.readFileSync(file, "utf8")).forEach(f => { if (+f.properties.veg !== 1040 || !f.geometry) return;
      (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates).forEach(pp => polys.push(pp.map(r => r.map(toM)))); });
  }
  // a coarse index: 250 m buckets → the vine polygons touching them
  const B = 250, idx = new Map();
  polys.forEach((p, i) => { const xs = p[0].map(q => q[0]), ys = p[0].map(q => q[1]);
    for (let bx = Math.floor(Math.min(...xs) / B); bx <= Math.floor(Math.max(...xs) / B); bx++) for (let by = Math.floor(Math.min(...ys) / B); by <= Math.floor(Math.max(...ys) / B); by++) {
      const k = bx + "," + by; (idx.get(k) || idx.set(k, []).get(k)).push(i); } });
  console.log(`  ${polys.length} pieces of vineyard land (Basis-DLM, veg 1040)`);
  return (x, y) => (idx.get(Math.floor(x / B) + "," + Math.floor(y / B)) || []).some(i => inRing(x, y, polys[i][0]) && !polys[i].slice(1).some(h => inRing(x, y, h)));
}

function build(id) {
  global.window = {}; require(path.join(ROOT, `atlas-${id}.js`));
  const P = window.ATLAS_PACKS[id], O = P.meta.origin; if (P.meta.proj !== "eq") throw new Error(id + ": not a German pack");
  const d2r = Math.PI / 180, kx = d2r * 6371000 * Math.cos(O[1] * d2r), ky = d2r * 6371000;
  // the pack's y grows southwards; dem-lib wants it northwards (its aspect is atan2(east, north))
  const north = mp => mp.map(p => p.map(r => r.map(([x, y]) => [x, -y])));
  const toLL = ([x, yN]) => [O[0] + x / kx, O[1] + yN / ky];
  const { stats, grid } = require("./dem-lib.js")(CACHE, toLL);
  const inVines = vineLand(id, P, ([lon, lat]) => [(lon - O[0]) * kx, (O[1] - lat) * ky]); // in the pack's own metres (y south)
  // a finer grid where the outline is mostly not vines, so enough points land on the vines; then only those, if a dozen do
  let onVines = 0;
  const jobs = P.climats.map(c => { const ratio = c.reg && c.ha ? Math.min(6, Math.max(1, c.haMap / c.ha)) : 1;
    const g = grid(north(c.g), inPoly, area, Math.round(80 * ratio), Math.round(160 * ratio)), v = g.pts.filter(([x, yN]) => inVines(x, -yN));
    if (v.length >= 12) { onVines++; return { id: c.id, pts: v, step: g.step, vines: true }; } return { id: c.id, ...g }; }).filter(j => j.pts.length >= 3);
  const all = jobs.flatMap(j => j.pts.map(q => utm32(...toLL(q))));
  console.log(`${id}: ${jobs.length} Einzellagen (${onVines} measured on their vineyard land), ${all.length} sample points`);
  const file = path.join(CACHE, `rlp-${id}.json`);
  let z = fs.existsSync(file) && JSON.parse(fs.readFileSync(file, "utf8"));
  if (!z || z.length !== all.length) {
    z = JSON.parse(execFileSync(PY, [path.join(__dirname, "de-dem-sample.py")], { input: JSON.stringify(all), maxBuffer: 1 << 28, stdio: ["pipe", "pipe", "inherit"] }).toString());
    fs.writeFileSync(file, JSON.stringify(z));
  }
  const out = {}; let k = 0;
  jobs.forEach(({ id: cid, pts, step }) => { const zz = z.slice(k, k + pts.length).map(v => v == null ? -99999 : v); k += pts.length;
    const r = stats(pts, step, zz); if (r) out[cid] = r.concat(Math.round(step), jobs.find(j => j.id === cid).vines ? 1 : 0); });
  const year = new Date().getFullYear();
  const meta = { id, source: `DGM1: ©GeoBasis-DE / LVermGeoRP (${year}), dl-de/by-2-0, www.lvermgeo.rlp.de [Daten bearbeitet]`, built: new Date().toISOString().slice(0, 10),
    fields: ["alt low (p5, m)", "alt high (p95, m)", "mean alt (m)", "mean slope %", "aspect ° (faces; 0 = N, 90 = E)", "aspect consistency %", "samples", "grid step (m)", "on vineyard land (1) or the whole outline (0)"],
    vines: "Basis-DLM: ©GeoBasis-DE / LVermGeoRP, dl-de/by-2-0 (Landwirtschaft, Weingarten)" };
  fs.writeFileSync(path.join(ROOT, `atlas-${id}-dem.js`), `// Generated by tools/de-dem.js ${id} — do not edit by hand.\nwindow.ATLAS_DEM = window.ATLAS_DEM || {};\nwindow.ATLAS_DEM[${JSON.stringify(id)}] = ${JSON.stringify({ meta, c: out })};\n`);
  const show = ["Wehlener Sonnenuhr", "Bernkasteler Doctor", "Ürziger Würzgarten", "Niederhäuser Hermannshöhle", "Forster Kirchenstück", "Bopparder Hamm Feuerlay"].map(n => P.climats.find(c => c.ap === n)).filter(c => c && out[c.id]);
  console.log(`  wrote atlas-${id}-dem.js: ${Object.keys(out).length}/${P.climats.length}` + show.map(c => `; ${c.ap} ${out[c.id].slice(0, 5).join("/")}`).join(""));
}
const ids = process.argv.slice(2); if (!ids.length) { console.error("usage: node tools/de-dem.js <region…|all>"); process.exit(1); }
for (const id of ids[0] === "all" ? GERMAN : ids) build(id);
