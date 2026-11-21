// Tuscany for tools/region-build.js: its great red wines' communes, from the region's own vineyard register: ARTEA,
// "Vigneti Regione Toscana" (dati.toscana.it, CC BY): every plot of vines, as planted (not a cadastral parcel), with its
// planting year and whether it's farmed organically; the varieties from the register's "base ampelografica".
// The register doesn't say which wine a plot is for, so a commune is the unit; a commune only partly in a wine's zone
// is drawn whole and says so. Only shapes, areas, years, the organic flag and varieties are kept: never a grower's id.
//   Monte Mario / Italy zone 1 (Gauss–Boaga) → WGS84 with EPSG's Italian mainland transformation (EPSG:1660).
"use strict";
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const YEAR = 2025, UPDATED = "2026/02/26", BASE = "https://dati.toscana.it/dataset/4775eb89-4a16-4687-9956-82e7b96604ab/resource";
const SHP = `${BASE}/d8a8a37f-08d4-4748-b0da-6d75d6f80263/download/vigneti${YEAR}.zip`, AMP = `${BASE}/4e1f911f-f8e4-4530-81da-7cc60a3d5b4b/download/opendatabaseampelografica${YEAR}.csv`;
// each wine: its communes, true where all of it is in the zone (the disciplinari)
const WINES = [
  ["Chianti Classico DOCG", { "CASTELLINA IN CHIANTI": true, "GAIOLE IN CHIANTI": true, "GREVE IN CHIANTI": true, "RADDA IN CHIANTI": true,
    "BARBERINO TAVARNELLE": false, "CASTELNUOVO BERARDENGA": false, "POGGIBONSI": false, "SAN CASCIANO IN VAL DI PESA": false }],
  ["Brunello di Montalcino DOCG", { "MONTALCINO": false }], // the commune since 2017 also has San Giovanni d'Asso, outside the zone
  ["Vino Nobile di Montepulciano DOCG", { "MONTEPULCIANO": false }], // the land fit for it, 250–600 m (2025)
  ["Bolgheri DOC", { "CASTAGNETO CARDUCCI": false }], // east of the old Via Aurelia
];
const WHY = { "MONTALCINO": "Since 2017 the commune also takes in San Giovanni d'Asso, which is outside the Brunello zone.",
  "MONTEPULCIANO": "The rules take the commune's land fit for the wine, between 250 and 600 m.",
  "CASTAGNETO CARDUCCI": "The rules take the commune east of the old Via Aurelia." };

// Gauss–Boaga (International 1924, central meridian 9°, false easting 1 500 000) → Monte Mario lon/lat → WGS84
function gb(E, N) {
  const a = 6378388, f = 1 / 297, e2 = f * (2 - f), ep2 = e2 / (1 - e2), k0 = .9996, d = Math.PI / 180;
  const x = E - 1500000, M = N / k0, mu = M / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256)), e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu) + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const C1 = ep2 * Math.cos(p1) ** 2, T1 = Math.tan(p1) ** 2, N1 = a / Math.sqrt(1 - e2 * Math.sin(p1) ** 2), R1 = a * (1 - e2) / (1 - e2 * Math.sin(p1) ** 2) ** 1.5, D = x / (N1 * k0);
  const lat = p1 - (N1 * Math.tan(p1) / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4 / 24 + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6 / 720);
  const lon = 9 * d + (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5 / 120) / Math.cos(p1);
  // Monte Mario → WGS84: geocentric, then EPSG:1660 (position vector: tx −104.1, ty −49.1, tz −9.9 m; rx 0.971″, ry −2.917″,
  // rz 0.714″; −11.68 ppm)
  const Nn = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2), X = Nn * Math.cos(lat) * Math.cos(lon), Y = Nn * Math.cos(lat) * Math.sin(lon), Z = Nn * (1 - e2) * Math.sin(lat);
  const s = 1 - 11.68e-6, as = Math.PI / 180 / 3600, rx = .971 * as, ry = -2.917 * as, rz = .714 * as;
  const X2 = -104.1 + s * (X - rz * Y + ry * Z), Y2 = -49.1 + s * (rz * X + Y - rx * Z), Z2 = -9.9 + s * (-ry * X + rx * Y + Z);
  const A = 6378137, F = 1 / 298.257223563, E2 = F * (2 - F), p = Math.hypot(X2, Y2); let la = Math.atan2(Z2, p * (1 - E2));
  for (let i = 0; i < 5; i++) { const Nw = A / Math.sqrt(1 - E2 * Math.sin(la) ** 2); la = Math.atan2(Z2 + E2 * Nw * Math.sin(la), p); }
  return [Math.atan2(Y2, X2) / d, la / d];
}
// a shapefile's polygons (type 5) and its table, record by record
function readShp(base) {
  const shp = fs.readFileSync(base + ".shp"), dbf = fs.readFileSync(base + ".dbf"), out = [];
  const n = dbf.readUInt32LE(4), hl = dbf.readUInt16LE(8), rl = dbf.readUInt16LE(10), fields = [];
  for (let o = 32; dbf[o] !== 0x0d; o += 32) fields.push([dbf.toString("latin1", o, o + 11).replace(/\0.*$/, ""), dbf[o + 16]]);
  let o = 100;
  for (let i = 0; i < n; i++) {
    const len = shp.readUInt32BE(o + 4) * 2, c = o + 8, type = shp.readInt32LE(c), rec = {};
    let p = hl + i * rl + 1; for (const [nm, l] of fields) { rec[nm] = dbf.toString("latin1", p, p + l).trim(); p += l; }
    if (type === 5) { const np = shp.readInt32LE(c + 36), nPts = shp.readInt32LE(c + 40), parts = [], pts = c + 44 + 4 * np;
      for (let k = 0; k < np; k++) parts.push(shp.readInt32LE(c + 44 + 4 * k));
      rec.rings = parts.map((s, k) => { const e = k + 1 < np ? parts[k + 1] : nPts, r = []; for (let j = s; j < e; j++) r.push([shp.readDoubleLE(pts + 16 * j), shp.readDoubleLE(pts + 16 * j + 8)]); return r; }); }
    out.push(rec); o = c + len;
  }
  return out;
}
const title = s => s.toLowerCase().replace(/(^|[\s'-])([a-zà-ú])/g, (m, a, b) => a + b.toUpperCase()).replace(/ (In|Di|Val|Del|Della|D') /g, m => m.toLowerCase());

async function toscanaBuild(H) {
  const { CACHE, union, tidy, polyHa, label, slug } = H, dir = path.join(CACHE, "it-toscana"), base = path.join(dir, `Vigneti${YEAR}`), amp = path.join(dir, `ampelo${YEAR}.csv`);
  if (!fs.existsSync(base + ".shp")) { fs.mkdirSync(dir, { recursive: true }); const zip = path.join(dir, `vigneti${YEAR}.zip`);
    if (!fs.existsSync(zip)) execFileSync("curl", ["-sS", "--fail", "-L", "--max-time", "900", "-o", zip, SHP]); execFileSync("unzip", ["-o", "-q", zip, "-d", dir]); }
  if (!fs.existsSync(amp)) execFileSync("curl", ["-sS", "--fail", "-L", "--max-time", "900", "-o", amp, AMP]);
  const want = new Map(); WINES.forEach(([ap, cs]) => Object.entries(cs).forEach(([c, whole]) => want.set(c, { ap, whole })));
  const recs = readShp(base).filter(r => want.has(r.comune) && r.rings && (r.DataFineVa || "9999") >= UPDATED); // still planted when the register was last updated
  // the varieties, by commune: the share of the area each takes (only the rows of plots still planted)
  const live = new Set(recs.map(r => r.IdColtivaz)), vars = new Map();
  const lines = fs.readFileSync(amp, "latin1").split(/\r?\n/), head = lines[0].split(","), col = k => head.indexOf(k);
  for (const l of lines.slice(1)) { const c = l.split(","); if (c.length < head.length || !live.has(c[col("IdColtivazione")])) continue;
    const com = c[col("comune")], v = c[col("Varieta")].replace(/\.?\[\d+\]$/, "").replace(/ (nero|bianco|rosso|grigio|rosa|n|b|g|r|rs)\.?$/i, "").trim(), m2 = Number(c[col("Superficie")]) || 0;
    if (!vars.has(com)) vars.set(com, new Map()); vars.get(com).set(v, (vars.get(com).get(v) || 0) + m2); }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  recs.forEach(r => { r.ll = r.rings.map(rg => rg.map(([E, N]) => gb(E, N))); r.ll.forEach(rg => rg.forEach(([x, y]) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; })); });
  const O = [+((x0 + x1) / 2).toFixed(4), +((y0 + y1) / 2).toFixed(4)];
  const d2r = Math.PI / 180, kx = d2r * 6371000 * Math.cos(O[1] * d2r), ky = d2r * 6371000, m = ([x, y]) => [(x - O[0]) * kx, (O[1] - y) * ky];
  const climats = [];
  for (const [com, { ap, whole }] of want) {
    const rs = recs.filter(r => r.comune === com); if (!rs.length) { console.error("  · no vines in " + com); continue; }
    const mp = union(rs.map(r => r.ll.map(rg => rg.map(m)))), g = tidy(mp, 3), ha = rs.reduce((s, r) => s + Number(r.Sup_mq || 0), 0) / 1e4;
    const org = rs.filter(r => r.Biologico === "biologico").reduce((s, r) => s + Number(r.Sup_mq || 0), 0) / 1e4;
    const yrs = rs.map(r => Number(r.AnnoImpian)).filter(y => y > 1900 && y <= YEAR).sort((a, b) => a - b), V = vars.get(com) || new Map(), vt = [...V.values()].reduce((a, b) => a + b, 0);
    const name = title(com);
    climats.push({ id: slug(name), n: name, c: "CM", ap, app: name, parcels: rs.length, ha: +ha.toFixed(1), organic: +(100 * org / ha).toFixed(0),
      planted: yrs.length ? yrs[Math.floor(yrs.length / 2)] : null, grapes: [...V.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([v, s]) => [v, Math.round(100 * s / vt)]),
      ...(whole ? {} : { part: WHY[com] || "Only part of the commune is in the zone." }), lp: label(g), g, aka: [name, com] });
  }
  console.error(`  ${recs.length} plots in ${climats.length} communes, ${climats.reduce((s, c) => s + c.ha, 0).toFixed(0)} ha`);
  return { climats, villages: [], regionalLand: [], meta: { proj: "eq", origin: O, l93: null, shade: "none", register: YEAR, plots: true,
    source: `Vines: ARTEA, Vigneti Regione Toscana (${YEAR}; dati.toscana.it), CC BY [data edited]` } };
}
module.exports = { toscanaBuild, gb, readShp };
