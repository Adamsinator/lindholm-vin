#!/usr/bin/env node
// INAO vineyard boundaries → burgundy-geo.js for the atlas's "surveyed" map.
//
//   cd tools && npm install          (once)
//   node tools/inao-import.js [data/inao]
//
// Reads every .geojson / .json / .shp (+ .dbf) file in the folder — the INAO "Délimitation parcellaire
// des AOC viticoles" export, whole or cut down to the Côte d'Or communes. GeoJSON is WGS84 lon/lat;
// shapefiles may be Lambert-93 (EPSG:2154) and are converted. Each feature is a cadastral parcel tagged
// with its appellation (`app`) and, for premiers crus and Corton's climats, a named place (`denom`).
//
// Parcels are merged into one outline per atlas climat, matched by name and commune, and village-AOC
// parcels into one outline per commune strip. Anything that can't be matched is listed — nothing is
// guessed. Output: ../burgundy-geo.js (coordinates in metres, rounded, simplified to ~2 m).
"use strict";
const fs = require("fs"), path = require("path");
const pc = require("./node_modules/polygon-clipping");

const ROOT = path.resolve(__dirname, "..");
const DIR = path.resolve(process.argv[2] || path.join(ROOT, "data/inao"));
const OUT = path.join(ROOT, "burgundy-geo.js");
const TOL = Number(process.env.TOL || 2); // simplification tolerance, metres

// ── load the atlas data ───────────────────────────────────────────────────────────────────────────
global.window = {};
["burgundy-data.js", "burgundy-data-beaune.js"].forEach(f => require(path.join(ROOT, f)));
const { villages: V, climats: C } = window.BURG;

const norm = t => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe")
  .replace(/[-'’.,«»()]/g, " ").replace(/\bst\b/g, "saint").replace(/\bste\b/g, "sainte").replace(/\s+/g, " ").trim();
const ART = /^(les|la|le|aux|au|en|l|a la|au dessus des|a)\s+/;
const bare = t => norm(t).replace(ART, "");

// appellation (village AOC) names → atlas commune strips
const APP_VILLAGE = {
  "marsannay": "marsannay", "fixin": "fixin", "gevrey chambertin": "gevrey", "morey saint denis": "morey",
  "chambolle musigny": "chambolle", "vougeot": "vougeot", "vosne romanee": "vosne", "nuits saint georges": "nuits",
  "cote de nuits villages": "cdnv", "ladoix": "corton", "aloxe corton": "corton", "pernand vergelesses": "corton",
  "savigny les beaune": "savigny", "chorey les beaune": "chorey", "beaune": "beaune", "pommard": "pommard",
  "volnay": "volnay", "monthelie": "monthelie", "auxey duresses": "monthelie", "meursault": "meursault",
  "puligny montrachet": "puligny", "chassagne montrachet": "chassagne", "saint aubin": "staubin",
  "santenay": "santenay", "maranges": "maranges",
};
// premier cru climats sold under another village's name
const ALSO = { flagey: ["vosne romanee"], premeaux: ["nuits saint georges"], corton: ["aloxe corton", "ladoix", "pernand vergelesses"],
  monthelie: ["monthelie", "auxey duresses"], meursault: ["meursault", "volnay"], vosne: ["vosne romanee"] };

// ── Lambert-93 → WGS84 (GRS80, LCC 2SP: φ1 44°, φ2 49°, φ0 46.5°, λ0 3°, X0 700 km, Y0 6600 km) ──────
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

// ── read features ───────────────────────────────────────────────────────────────────────────────
async function readAll() {
  if (!fs.existsSync(DIR)) { console.error("No folder " + DIR); process.exit(1); }
  const files = fs.readdirSync(DIR).filter(f => /\.(geo)?json$|\.shp$/i.test(f));
  if (!files.length) { console.error("No .geojson/.json/.shp files in " + DIR); process.exit(1); }
  const feats = [];
  for (const f of files) {
    const full = path.join(DIR, f);
    if (/\.shp$/i.test(f)) {
      const shp = require("./node_modules/shapefile");
      const src = await shp.open(full, full.replace(/\.shp$/i, ".dbf"), { encoding: "utf-8" });
      for (let r = await src.read(); !r.done; r = await src.read()) if (inArea(r.value)) feats.push(r.value);
    } else {
      const j = JSON.parse(fs.readFileSync(full, "utf8"));
      (j.type === "FeatureCollection" ? j.features : [j]).filter(inArea).forEach(x => feats.push(x));
    }
    console.log(`read ${f}: ${feats.length} features so far`);
  }
  return feats;
}
// the national file covers all of France: keep the Côte d'Or (21) and Saône-et-Loire (71, for Maranges) by INSEE code
const DEPTS = ["21", "71"];
function inArea(f) {
  const code = String(pick(f.properties, ["insee", "code_insee", "insee_com"]) || "");
  return !code || DEPTS.includes(code.slice(0, 2));
}
const pick = (props, names) => { for (const k of Object.keys(props || {})) if (names.includes(k.toLowerCase())) return props[k]; return ""; };

// polygons of a feature as [[ring…]…] in lon/lat
function polys(g) {
  if (!g) return [];
  const list = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
  const projected = list.length && Math.abs(list[0][0][0][0]) > 180; // Lambert-93 metres
  return projected ? list.map(p => p.map(r => r.map(L93))) : list;
}

// ── geometry helpers (local metres around the Côte d'Or) ────────────────────────────────────────
const LAT0 = 47.1, LON0 = 4.85, R = 6371000, d2r = Math.PI / 180;
const toM = ([lon, lat]) => [(lon - LON0) * d2r * R * Math.cos(LAT0 * d2r), (lat - LAT0) * d2r * R];
function simplify(ring, tol) { // Douglas–Peucker on a closed ring: split at the point farthest from the start
  if (ring.length < 5) return ring;
  let far = 1, fd = -1;
  ring.forEach(([x, y], k) => { const dd = Math.hypot(x - ring[0][0], y - ring[0][1]); if (dd > fd) { fd = dd; far = k; } });
  const a = dpOpen(ring.slice(0, far + 1), tol), b = dpOpen(ring.slice(far), tol);
  return a.concat(b.slice(1));
}
function dpOpen(ring, tol) {
  if (ring.length < 3) return ring;
  const keep = new Uint8Array(ring.length); keep[0] = keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop(); let best = -1, bd = tol;
    const [ax, ay] = ring[i], [bx, by] = ring[j], L = Math.hypot(bx - ax, by - ay) || 1;
    for (let k = i + 1; k < j; k++) { const dd = Math.abs((bx - ax) * (ay - ring[k][1]) - (ax - ring[k][0]) * (by - ay)) / L; if (dd > bd) { bd = dd; best = k; } }
    if (best > 0) { keep[best] = 1; stack.push([i, best], [best, j]); }
  }
  return ring.filter((_, k) => keep[k]);
}
const area = r => Math.abs(r.reduce((s, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return s + x * y2 - x2 * y; }, 0) / 2);
function finish(mp) { // multipolygon (metres) → simplified, rounded, small slivers dropped
  return mp.map(p => p.map(r => simplify(r, TOL).map(([x, y]) => [Math.round(x), Math.round(y)])).filter(r => r.length >= 4))
    .filter(p => p.length && area(p[0]) > 20);
}

// ── match parcels to climats ────────────────────────────────────────────────────────────────────
const byName = new Map();
C.forEach(c => { [norm(c.n), bare(c.n), bare(c.n.replace(/^Corton /, ""))].forEach(k => { if (!byName.has(k)) byName.set(k, []); byName.get(k).push(c); }); });
const villageOf = c => [norm(VIL(c.v).n.split(" · ")[0]), ...(ALSO[c.v] || []), ...(ALSO[c.geo] || [])];
const VIL = id => V.find(v => v.id === id);

// INAO spellings that differ from the atlas's (normalised, without the leading article)
const ALIAS = {
  "petis monts": "les petits monts", "raignots": "aux reignots", "rouges": "les rouges du dessus",
  "saints georges": "les saint georges", "clos arlot": "clos de l arlot",
  "combe au moine": "combe aux moines", "bussiere": "clos de la bussiere", "cents vignes": "les cent vignes",
  "grands epenots": "les epenots", "petits epenots": "les epenots", "rugiens bas": "les rugiens", "rugiens hauts": "les rugiens",
  "taille pieds": "taillepieds", "champs fulliots": "les champs fulliot", "porusot": "les poruzots",
  "cailleret": "les caillerets", "en cailleret": "les caillerets", "embazees": "les embrazees", "clos de tavannes": "clos tavannes",
};
function matchFeature(app, denom) {
  const A = norm(app).replace(/ ou .*$/, "").replace(/ (premier|1er) cru$/, "").replace(/ grand cru$/, "");
  // INAO repeats the appellation as the denomination ("La Tâche" / "La Tâche"), and spells premiers crus in full
  // ("Vosne-Romanée premier cru Les Suchots"); Corton's climats read "Corton Les Bressandes"
  let D = norm(denom).replace(/ ou .*$/, "");
  if (D === A) D = "";
  else if (D.startsWith(A + " ")) {
    D = D.slice(A.length + 1).replace(/^(premier|1er) cru\b ?/, "");
    if (!D) return { skip: app + " premier cru (whole area)" };
  }
  if (D) { // a named premier cru, or a Corton climat
    // several climats share a name (Les Bressandes in Corton and in Beaune), so gather them all, then pick by commune
    // an INAO spelling variant (ALIAS) is only tried when the name itself finds nothing in this commune
    for (const name of [D, ALIAS[bare(D)]].filter(Boolean)) {
      const hits = [...new Set([...(byName.get(name) || []), ...(byName.get(bare(name)) || [])])].filter(c => c.c !== "V");
      const inVillage = hits.filter(c => c.grp === "corton" ? A === "corton" : villageOf(c).some(v => A.startsWith(v)));
      if (inVillage.length) return { climat: [...inVillage].sort((a, b) => (a.in ? 1 : 0) - (b.in ? 1 : 0))[0] };
    }
    // not on the atlas yet: keep it as an extra premier cru (or Corton climat) of its commune, named as INAO spells it
    const vil = A === "corton" ? "corton" : A === "blagny" ? "meursault" : APP_VILLAGE[A];
    const name = String(denom).replace(/ ou .*$/, "").replace(new RegExp("^" + String(app).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s+", "i"), "")
      .replace(/^(premier|1er) cru\s+/i, "").trim();
    // "Marsannay rosé", "… rouge et blanc": colour labels, not places
    if (/^\(?(ros[ée]|rouge|blanc)(\s|\)|$)/i.test(name)) return { skip: `${app} ${name} (colour, not a climat)` };
    return { unmatched: `${app} — ${denom}`, extra: vil && name ? { v: vil, n: name, c: A === "corton" ? "GC" : "1er", ap: String(app).replace(/ ou .*$/, "") } : null };
  }
  if (!D && A === "corton") return { skip: "Corton (whole grand cru area)" };
  const gc = C.find(c => c.c === "GC" && !c.in && (norm(c.n) === A || norm(c.n).replace(/^(le|la) /, "") === A.replace(/^(le|la) /, "")));
  if (gc) return { climat: gc };
  if (APP_VILLAGE[A]) return { village: APP_VILLAGE[A] };
  return { skip: A }; // regional Bourgogne, Crémant, Hautes-Côtes… not on the atlas
}

(async () => {
  const feats = await readAll();
  const groups = new Map(), unmatched = new Map(), skipped = new Map(), exAp = {};
  for (const f of feats) {
    const pr = f.properties || {};
    const app = pick(pr, ["app", "appellation", "nom_app", "libelle_app", "lbl_aoc"]), denom = pick(pr, ["denom", "denomination", "lieu_dit", "nom_denom", "libelle_denom"]);
    const m = matchFeature(app, denom);
    if (m.extra) { const k = "x:" + m.extra.v + "|" + m.extra.c + "|" + m.extra.n; exAp[k] = m.extra.ap; const g = groups.get(k) || []; polys(f.geometry).forEach(p => g.push(p.map(r => r.map(toM)))); groups.set(k, g); continue; }
    const key = m.climat ? "c:" + m.climat.id : m.village ? "v:" + m.village : null;
    if (!key) { const tgt = m.unmatched ? unmatched : skipped, k = m.unmatched || m.skip; tgt.set(k, (tgt.get(k) || 0) + 1); continue; }
    const g = groups.get(key) || []; polys(f.geometry).forEach(p => g.push(p.map(r => r.map(toM)))); groups.set(key, g);
  }
  const out = { climats: {}, villages: {}, extra: {} };
  let n = 0;
  for (const [key, list] of groups) {
    let u = list.length > 1 ? pc.union(...list.map(p => [p])) : [list[0]];
    u = finish(u); if (!u.length) continue;
    const [kind, id] = key.split(/:(.*)/s);
    if (kind === "x") { const [v, c, nm] = id.split("|"); out.extra["x_" + v + "_" + (c === "GC" ? "gc_" : "") + bare(nm).replace(/[^a-z0-9]+/g, "_")] = { n: nm, v, c, ap: exAp[key], mp: u }; }
    else (kind === "c" ? out.climats : out.villages)[id] = u;
    n++;
    if (n % 50 === 0 || n === groups.size) console.log(`merged ${n}/${groups.size}`);
  }
  const meta = { source: "INAO — Délimitation parcellaire des AOC viticoles (data.gouv.fr, Licence Ouverte)", built: new Date().toISOString().slice(0, 10),
    tol: TOL, origin: [LON0, LAT0] };
  // Clos de Bèze may be sold as Chambertin, so INAO's Chambertin area includes it: take it out again
  if (out.climats.chambertin && out.climats.beze) out.climats.chambertin = finish(pc.difference(out.climats.chambertin, out.climats.beze));
  // Mazoyères may be sold as Charmes and INAO publishes one area for both. Split it at the east–west line that gives
  // the atlas's area ratio (Charmes lies north, towards Gevrey) — an approximation, flagged in the output.
  const approx = [];
  const ch = out.climats.charmes, mz = out.climats.mazoyeres;
  if (ch && mz && JSON.stringify(ch) === JSON.stringify(mz)) {
    const cC = C.find(c => c.id === "charmes"), cM = C.find(c => c.id === "mazoyeres"), share = cC.ha / (cC.ha + cM.ha);
    const ys = ch.flatMap(p => p[0].map(q => q[1])), ylo = Math.min(...ys) - 1, yhi = Math.max(...ys) + 1;
    const xs = ch.flatMap(p => p[0].map(q => q[0])), xlo = Math.min(...xs) - 1, xhi = Math.max(...xs) + 1;
    const box = (a, b) => [[[xlo, a], [xhi, a], [xhi, b], [xlo, b], [xlo, a]]];
    const haOf = mp => mp.reduce((s, p) => s + area(p[0]) - p.slice(1).reduce((t, h) => t + area(h), 0), 0);
    const total = haOf(ch); let lo = ylo, hi = yhi;
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (haOf(pc.intersection(ch, box(mid, yhi))) > share * total) lo = mid; else hi = mid; }
    out.climats.charmes = finish(pc.intersection(ch, box(lo, yhi)));
    out.climats.mazoyeres = finish(pc.intersection(ch, box(ylo, lo)));
    approx.push("charmes", "mazoyeres");
  }
  meta.approx = approx;
  // extras: one lying mostly inside an atlas climat is a named part of it (Chassagne's Morgeot holds La Boudriotte,
  // Les Grands Clos…): kept, nested in that climat and drawn on top; one inside another extra is a clos within it
  const haOf2 = mp => mp.reduce((s, p) => s + area(p[0]) - p.slice(1).reduce((t, h) => t + area(h), 0), 0);
  const variants = [];
  Object.entries(out.extra).forEach(([id, x]) => {
    const a0 = haOf2(x.mp); x.ha = +(a0 / 1e4).toFixed(2);
    for (const c of C) { const mp = out.climats[c.id]; if (!mp) continue;
      const ov = haOf2(pc.intersection(x.mp, mp)); if (ov > a0 * .5) { variants.push(`${x.n} (${x.v}) in ${c.n}`); x.in = c.id; return; } }
  });
  const ex = Object.entries(out.extra);
  ex.forEach(([id, x]) => { const a0 = haOf2(x.mp);
    if (x.in) return;
    const host = ex.find(([id2, y]) => id2 !== id && y.v === x.v && haOf2(y.mp) > a0 && haOf2(pc.intersection(x.mp, y.mp)) > a0 * .8);
    if (host) x.in = host[0]; });
  console.log(`\nINAO premiers crus / Corton climats added as extras: ${Object.keys(out.extra).length}`);
  if (variants.length) console.log(`  nested inside atlas climats (${variants.length}): ${variants.join("; ")}`);
  console.log("");
  const missing = C.filter(c => !out.climats[c.id]);
  // derived hectares, to compare with the atlas's figures
  const ha = mp => mp.reduce((s, p) => s + area(p[0]) - p.slice(1).reduce((t, h) => t + area(h), 0), 0) / 1e4;
  const cmp = C.filter(c => out.climats[c.id]).map(c => [c.id, c.ha, +ha(out.climats[c.id]).toFixed(2)]).filter(([, a, b]) => Math.abs(a - b) > Math.max(.3, a * .2));
  fs.writeFileSync(OUT, "// Generated by tools/inao-import.js — do not edit by hand.\nwindow.BURG_GEO = " + JSON.stringify({ meta, ...out }) + ";\n");
  console.log(`\nwrote ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB): ${Object.keys(out.climats).length} climats, ${Object.keys(out.villages).length} commune areas`);
  console.log(`\nAtlas climats without a surveyed outline (${missing.length}) — village lieux-dits and enclaves are expected here:`);
  console.log("  " + missing.map(c => `${c.n} (${c.v}${c.in ? ", enclave" : ""}, ${c.c})`).join("\n  "));
  if (unmatched.size) { console.log(`\nINAO names not matched to a climat (${unmatched.size}) — add them to the atlas or fix spelling:`); [...unmatched].sort().forEach(([k, n]) => console.log(`  ${k}  (${n} parcels)`)); }
  if (cmp.length) { console.log(`\nArea differs from the atlas by >20% — check the climat or its ha:`); cmp.forEach(([id, a, b]) => console.log(`  ${id}: atlas ${a} ha, survey ${b} ha`)); }
  console.log(`\nskipped appellations (not on the atlas): ${[...skipped.keys()].slice(0, 20).join(", ")}${skipped.size > 20 ? "…" : ""}`);
})();
