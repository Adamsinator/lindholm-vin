#!/usr/bin/env node
// Outlines for the atlas's village climats, which INAO doesn't delimit → added to burgundy-geo.js
//
//   node tools/cadastre-climats.js        (after tools/inao-import.js, which rewrites burgundy-geo.js; uses curl)
//
// A village climat is a cadastral lieu-dit (La Colombière, Aux Réas…) or, for a clos, a set of named parcels
// (Clos du Château = Vosne AL 105 + 106, 83 a 04 ca, exactly as the domaine gives it; Clos Goillotte = AL 317). Its outline is that lieu-dit
// or those parcels, clipped to village-appellation land, minus anything already drawn as a premier or grand cru
// (part of La Combe Brûlée is the 1er cru Aux Brûlées). Only the climats listed below are touched, and only when
// INAO has no outline for them; anything else that still lacks one is printed. Downloads: Etalab cadastre
// (cadastre.data.gouv.fr, Licence Ouverte), cached in tools/.cadastre-cache.
"use strict";
const fs = require("fs"), path = require("path"), zlib = require("zlib"), { execFileSync } = require("child_process");
const pc = require("./node_modules/polygon-clipping");
const ROOT = path.resolve(__dirname, ".."), GEOF = path.join(ROOT, "burgundy-geo.js");
const CACHE = path.join(__dirname, ".cadastre-cache"); fs.mkdirSync(CACHE, { recursive: true });

// climat id → where its outline comes from: [INSEE, cadastral lieu-dit names…] or {parcels: [INSEE, [section+number…]]}
const SRC = {
  longeroies: ["21390", "BAS DES LONGEROIES", "DESSUS DES LONGEROIES"],
  closduroy: ["21166", "CLOS DU ROY"],                 // Chenôve, inside the Marsannay appellation
  champsalomon: ["21200", "AU CHAMP SALOMON"],         // Couchey
  lajustice: ["21295", "LA JUSTICE"],
  closprieur: ["21295", "CLOS PRIEUR-BAS", "CLOS PRIEUR-HAUT"], // the upper part is premier cru and drawn as such: only village land stays
  barreaux: ["21714", "LES BARREAUX"],
  hautesmaizieres: ["21714", "HAUTES MAIZIERES"],
  raviolles: ["21714", "AUX RAVIOLLES"],
  jachees: ["21714", "AUX JACHEES"],
  chateau: { parcels: ["21714", ["AL105", "AL106"]] },
  goillotte: { parcels: ["21714", ["AL317"]] },      // the walled square on rue de la Goillotte, 55 a 63 ca ("un carré de 0,55 ha", Prieuré-Roch)
  violettes: ["21267", "LES VIOLETTES"],               // Flagey, sold as Vosne-Romanée
  colombiere: ["21714", "LA COLOMBIERE"],
  auxreas: ["21714", "AUX REAS"],
  communes: ["21714", "AUX COMMUNES"],
  chalandins: ["21714", "LES CHALANDINS"],
  bossieres: ["21714", "BOSSIERES"],
  combebrulee: ["21714", "LA COMBE BRULEE"],
};

global.window = {};
require(GEOF);
["burgundy-data.js", "burgundy-data-beaune.js"].forEach(f => require(path.join(ROOT, f)));
const GEO = window.BURG_GEO, C = window.BURG.climats;
const [LON0, LAT0] = GEO.meta.origin, R = 6371000, d2r = Math.PI / 180, KX = d2r * R * Math.cos(LAT0 * d2r), KY = d2r * R;
const toM = ([lon, lat]) => [(lon - LON0) * KX, (lat - LAT0) * KY];
const fold = t => String(t).toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

function fetchLayer(insee, layer) {
  const file = path.join(CACHE, layer === "lieux_dits" ? insee + ".json" : `${insee}-${layer}.json`);
  if (!fs.existsSync(file)) {
    const url = `https://cadastre.data.gouv.fr/data/etalab-cadastre/latest/geojson/communes/${insee.slice(0, 2)}/${insee}/cadastre-${insee}-${layer}.json.gz`;
    fs.writeFileSync(file, zlib.gunzipSync(execFileSync("curl", ["-sSL", "--retry", "6", "--retry-all-errors", "--max-time", "180", url], { maxBuffer: 1 << 28 })).toString());
  }
  return JSON.parse(fs.readFileSync(file, "utf8")).features;
}
const polysOf = g => (g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : []).map(p => p.map(r => r.map(toM)));

// Douglas–Peucker, as tools/inao-import.js does it, so these outlines look like the rest
function dpOpen(ring, tol) {
  if (ring.length < 3) return ring;
  const keep = new Uint8Array(ring.length); keep[0] = keep[ring.length - 1] = 1; const st = [[0, ring.length - 1]];
  while (st.length) { const [i, j] = st.pop(); let best = -1, bd = tol; const [ax, ay] = ring[i], [bx, by] = ring[j], L = Math.hypot(bx - ax, by - ay) || 1;
    for (let k = i + 1; k < j; k++) { const d = Math.abs((bx - ax) * (ay - ring[k][1]) - (ax - ring[k][0]) * (by - ay)) / L; if (d > bd) { bd = d; best = k; } }
    if (best > 0) { keep[best] = 1; st.push([i, best], [best, j]); } }
  return ring.filter((_, k) => keep[k]);
}
const simplify = (r, tol) => { if (r.length < 5) return r; let far = 1, fd = -1;
  r.forEach(([x, y], k) => { const d = Math.hypot(x - r[0][0], y - r[0][1]); if (d > fd) { fd = d; far = k; } });
  return dpOpen(r.slice(0, far + 1), tol).concat(dpOpen(r.slice(far), tol).slice(1)); };
const area = r => Math.abs(r.reduce((s, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return s + x * y2 - x2 * y; }, 0) / 2);
const haOf = mp => mp.reduce((s, p) => s + area(p[0]) - p.slice(1).reduce((t, h) => t + area(h), 0), 0) / 1e4;
const finish = mp => mp.map(p => p.map(r => simplify(r, GEO.meta.tol || 2).map(([x, y]) => [Math.round(x), Math.round(y)])).filter(r => r.length >= 4))
  .filter(p => p.length && area(p[0]) > 50);

const prev = (GEO.meta.cadastral || {});
Object.keys(prev).forEach(id => delete GEO.climats[id]); // re-runnable: start from INAO's own outlines
const villageLand = pc.union(...Object.values(GEO.villages));
const crus = Object.values(GEO.climats).concat(Object.values(GEO.extra || {}).map(x => x.mp));
const cruLand = pc.union(...crus);
const cadastral = {}, report = [];
for (const [id, src] of Object.entries(SRC)) {
  const c = C.find(c => c.id === id);
  if (!c) { report.push(`  ${id}: not an atlas climat any more — remove it from SRC`); continue; }
  if (GEO.climats[id]) { report.push(`  ${id}: INAO has an outline now — remove it from SRC`); continue; }
  let raw, how;
  if (src.parcels) {
    const [insee, ids] = src.parcels;
    const feats = fetchLayer(insee, "parcelles").filter(f => ids.includes(f.properties.section + f.properties.numero));
    if (feats.length !== ids.length) { report.push(`  ${id}: parcels ${ids.join(", ")} not all found in ${insee}`); continue; }
    const reg = feats.reduce((s, f) => s + f.properties.contenance, 0);
    raw = pc.union(...feats.map(f => polysOf(f.geometry)));
    how = `cadastre ${insee} parcels ${ids.join(" + ")} (${reg} m² registered)`;
  } else {
    const [insee, ...names] = src;
    const feats = fetchLayer(insee, "lieux_dits").filter(f => names.includes(fold(f.properties.nom || "")));
    const found = new Set(feats.map(f => fold(f.properties.nom)));
    const lost = names.filter(n => !found.has(n));
    if (lost.length) { report.push(`  ${id}: lieu-dit ${lost.join(", ")} not found in ${insee}`); continue; }
    raw = pc.union(...feats.map(f => polysOf(f.geometry)));
    how = `cadastre ${insee} lieu-dit ${names.join(" + ")}`;
  }
  // a clos is taken whole (its parcels are the climat); a lieu-dit only where it is village vineyard
  const mp = finish(src.parcels ? raw : pc.difference(pc.intersection(raw, villageLand), cruLand));
  if (!mp.length) { report.push(`  ${id}: nothing left on village land`); continue; }
  GEO.climats[id] = mp; cadastral[id] = how;
  report.push(`  ${id.padEnd(16)} ${c.n.padEnd(22)} atlas ${String(c.ha).padStart(5)} ha · outline ${haOf(mp).toFixed(2)} ha · ${how}`);
}
GEO.meta.cadastral = cadastral;
const { meta, ...rest } = GEO;
fs.writeFileSync(GEOF, "// Generated by tools/inao-import.js (+ tools/cadastre-climats.js) — do not edit by hand.\nwindow.BURG_GEO = " + JSON.stringify({ meta, ...rest }) + ";\n");
console.log(`village climats outlined from the cadastre (${Object.keys(cadastral).length}):\n` + report.join("\n"));
const still = C.filter(c => !GEO.climats[c.id]);
console.log(`\nstill without an outline (${still.length}): ` + still.map(c => `${c.n} (${c.v}${c.in ? ", inside " + c.in : ""})`).join("; "));
