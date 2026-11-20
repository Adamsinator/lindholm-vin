// Italy for tools/region-build.js: Piedmont's DOCG wines from the region's own vineyard register, "Vini – indicazione
// dell'idoneità alla D.O. su mosaicatura catastale di riferimento regionale" (Regione Piemonte, CC BY 4.0): every
// cadastral parcel with vines fit for a DO wine, and which. One site per commune: the parcels fit for the wine, joined.
// The register doesn't say which MGA (the named vineyards) a parcel is in, so the communes are the units; the parcels
// are whole cadastral parcels, of which the vines are a part.
"use strict";
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const YEAR = 2025;
const URL_ = `https://www.datigeo-piem-download.it/direct/Geoportale/RegionePiemonte/AGRICOLTURA/ViniVitigni/IDONEITA_PRODUZIONE_VINO_DO_${YEAR}-EPSG32632-GPKG.zip`;
const WINES = { barolo: { vino: "BAROLO", table: "VINI ROSSI" }, barbaresco: { vino: "BARBARESCO", table: "VINI ROSSI" } };

// WGS84 / UTM 32N → longitude, latitude
function utm32(E, N) {
  const a = 6378137, f = 1 / 298.257223563, e2 = f * (2 - f), ep2 = e2 / (1 - e2), k0 = .9996, d = Math.PI / 180;
  const x = E - 500000, M = N / k0, mu = M / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256)), e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu) + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const C1 = ep2 * Math.cos(p1) ** 2, T1 = Math.tan(p1) ** 2, N1 = a / Math.sqrt(1 - e2 * Math.sin(p1) ** 2), R1 = a * (1 - e2) / (1 - e2 * Math.sin(p1) ** 2) ** 1.5, D = x / (N1 * k0);
  const lat = p1 - (N1 * Math.tan(p1) / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4 / 24 + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6 / 720);
  const lon = 9 * d + (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5 / 120) / Math.cos(p1);
  return [lon / d, lat / d];
}
// a GeoPackage geometry: its header, then WKB (polygons and multipolygons)
function gpkgPolys(b) {
  const env = (b[3] >> 1) & 7, w = b.subarray(8 + [0, 32, 48, 48, 64][env]), out = [];
  const read = o => { const le = w[o] === 1, u32 = p => le ? w.readUInt32LE(p) : w.readUInt32BE(p), f64 = p => le ? w.readDoubleLE(p) : w.readDoubleBE(p), typ = u32(o + 1) % 1000; o += 5;
    if (typ === 3) { const n = u32(o); o += 4; const rings = [];
      for (let i = 0; i < n; i++) { const k = u32(o); o += 4; const r = []; for (let j = 0; j < k; j++) { r.push([f64(o), f64(o + 8)]); o += 16; } rings.push(r); }
      out.push(rings); return o; }
    if (typ === 6) { const n = u32(o); o += 4; for (let i = 0; i < n; i++) o = read(o); return o; }
    throw new Error("geometry type " + typ); };
  read(0); return out;
}
async function parcelsBuild(H, key) {
  const { CACHE, union, tidy, polyHa, label, slug } = H, W = WINES[key], dir = path.join(CACHE, "it-vini"), gpkg = path.join(dir, `IDONEITA_PRODUZIONE_VINO_DO_${YEAR}.gpkg`);
  if (!fs.existsSync(gpkg)) { fs.mkdirSync(dir, { recursive: true }); const zip = path.join(dir, "vini.zip");
    execFileSync("curl", ["-sS", "--fail", "--max-time", "900", "-o", zip, URL_]); execFileSync("unzip", ["-o", "-q", zip, "-d", dir]); }
  const { DatabaseSync } = require("node:sqlite"), db = new DatabaseSync(gpkg, { readOnly: true });
  const rows = db.prepare(`select geom, nome_comune from "${W.table} ${YEAR}" where vino = ?`).all(W.vino);
  if (!rows.length) throw new Error(`no parcels for ${W.vino}`);
  const by = new Map(); rows.forEach(r => { const ps = gpkgPolys(Buffer.from(r.geom)).map(p => p.map(rg => rg.map(([E, N]) => utm32(E, N)))); if (!by.has(r.nome_comune)) by.set(r.nome_comune, []); by.get(r.nome_comune).push(...ps); });
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; // a loop: too many points to spread into Math.min
  for (const ps of by.values()) for (const p of ps) for (const [x, y] of p[0]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const O = [+((x0 + x1) / 2).toFixed(4), +((y0 + y1) / 2).toFixed(4)];
  const d2r = Math.PI / 180, kx = d2r * 6371000 * Math.cos(O[1] * d2r), ky = d2r * 6371000, m = ([x, y]) => [(x - O[0]) * kx, (O[1] - y) * ky];
  const climats = [...by.entries()].map(([n, ps]) => { const mp = union(ps.map(p => p.map(r => r.map(m)))), g = tidy(mp, 3), name = n.replace(/'$/, "");
    return g.length && { id: slug(name), n: name, c: "CM", ap: key === "barolo" ? "Barolo DOCG" : "Barbaresco DOCG", app: name, parcels: rows.filter(r => r.nome_comune === n).length,
      ha: +polyHa(mp).toFixed(1), lp: label(g), g, aka: [name] }; }).filter(Boolean);
  console.error(`  ${rows.length} parcels in ${climats.length} communes`);
  return { climats, villages: [], regionalLand: [], meta: { proj: "eq", origin: O, l93: null, shade: "none", register: YEAR, // no open relief tiles for Piedmont the atlas can use yet
    source: `Parcels: Regione Piemonte, Vini – indicazione dell'idoneità alla D.O. su mosaicatura catastale di riferimento regionale ${YEAR}, CC BY 4.0 [data edited]` } };
}
module.exports = { parcelsBuild, utm32, gpkgPolys };
