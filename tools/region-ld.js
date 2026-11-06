#!/usr/bin/env node
// The cadastre's lieux-dits for a French region of the wine atlas → atlas-<id>-ld.js (shown by atlas-ld.js).
//
//   node tools/region-ld.js [region …]        (needs curl; all French regions but the Côte d'Or when none is named)
//
// The communes come from geo.api.gouv.fr (their outlines, per département), kept where they reach the region's crus
// and village appellations; each one's lieux-dits from the Etalab cadastre (cadastre.data.gouv.fr, Licence Ouverte),
// cached in tools/.cadastre-cache as tools/lieuxdits-import.js does. A lieu-dit is kept when it lies on a cru or a
// village appellation of the pack (not the regional land around them), simplified to 2.5 m, in the pack's own
// Lambert-93 metres. Names are the cadastre's, in proper capitals, with the accents the region's own names use.
// The Côte d'Or has its own (tools/lieuxdits-import.js, with the terrain measured).
"use strict";
const fs = require("fs"), path = require("path"), zlib = require("zlib"), { execFileSync } = require("child_process");
const ROOT = path.resolve(__dirname, ".."), CACHE = path.join(__dirname, ".cadastre-cache"), GCACHE = path.join(__dirname, ".geoapi-cache");
fs.mkdirSync(CACHE, { recursive: true }); fs.mkdirSync(GCACHE, { recursive: true });
const DEPS = { chablis: ["89"], chalonnaise: ["71"], maconnais: ["71"], champagne: ["51", "02", "10"], alsace: ["67", "68"], bordeaux: ["33"],
  rhone: ["69", "42", "26", "07"], beaujolais: ["69", "71"], rhonesud: ["84", "26", "30", "07"], centreloire: ["18", "58", "36", "45"],
  touraine: ["37", "49", "41"], anjou: ["49"], jura: ["39"], provence: ["83", "13"] };
const ONLY = process.argv.slice(2); for (const r of ONLY) if (!DEPS[r]) { console.error(`no such French region: ${r}`); process.exit(1); }

const L93 = (() => { const a = 6378137, e = 0.0818191910428158, d = Math.PI / 180; // as in atlas.js
  const m = p => Math.cos(p) / Math.sqrt(1 - e * e * Math.sin(p) ** 2), tt = p => Math.tan(Math.PI / 4 - p / 2) / ((1 - e * Math.sin(p)) / (1 + e * Math.sin(p))) ** (e / 2);
  const n = (Math.log(m(44 * d)) - Math.log(m(49 * d))) / (Math.log(tt(44 * d)) - Math.log(tt(49 * d))), F = m(44 * d) / (n * tt(44 * d) ** n), r0 = a * F * tt(46.5 * d) ** n;
  return (lon, lat) => { const r = a * F * tt(lat * d) ** n, th = n * (lon - 3) * d; return [700000 + r * Math.sin(th), 6600000 + r0 - r * Math.cos(th)]; }; })();
const curl = (url, gz) => { const b = execFileSync("curl", ["-sSL", "--fail", "--retry", "6", "--retry-all-errors", "--max-time", "180", url], { maxBuffer: 1 << 29 }); return (gz ? zlib.gunzipSync(b) : b).toString(); };
const inRing = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
const area = r => Math.abs(r.reduce((s, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return s + x * y2 - x2 * y; }, 0) / 2);
const bbOf = r => { let b = [Infinity, Infinity, -Infinity, -Infinity]; r.forEach(([x, y]) => { b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)]; }); return b; };
const meet = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
function dp(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1; const st = [[0, pts.length - 1]];
  while (st.length) { const [i, j] = st.pop(); let best = -1, bd = tol; const [ax, ay] = pts[i], [bx, by] = pts[j], L = Math.hypot(bx - ax, by - ay) || 1;
    for (let k = i + 1; k < j; k++) { const d = Math.abs((bx - ax) * (ay - pts[k][1]) - (ax - pts[k][0]) * (by - ay)) / L; if (d > bd) { bd = d; best = k; } }
    if (best > 0) { keep[best] = 1; st.push([i, best], [best, j]); } }
  return pts.filter((_, k) => keep[k]);
}
const dpRing = (pts, tol) => { if (pts.length < 5) return pts; let far = 1, fd = -1;
  pts.forEach(([x, y], k) => { const d = Math.hypot(x - pts[0][0], y - pts[0][1]); if (d > fd) { fd = d; far = k; } });
  return dp(pts.slice(0, far + 1), tol).concat(dp(pts.slice(far), tol).slice(1)); };
function pole(r) { // a label point well inside: the best of a coarse grid by distance to the edge
  const [x0, y0, x1, y1] = bbOf(r); let best = null, bd = -1;
  for (let i = 1; i < 12; i++) for (let j = 1; j < 12; j++) { const x = x0 + (x1 - x0) * i / 12, y = y0 + (y1 - y0) * j / 12; if (!inRing(x, y, r)) continue;
    let d = Infinity; for (let k = 0, l = r.length - 1; k < r.length; l = k++) { const [ax, ay] = r[l], [bx, by] = r[k], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0; d = Math.min(d, Math.hypot(x - ax - t * dx, y - ay - t * dy)); }
    if (d > bd) { bd = d; best = [Math.round(x), Math.round(y)]; } }
  return best || [Math.round((x0 + x1) / 2), Math.round((y0 + y1) / 2)];
}
// "LES HAUTS BEAUX MONTS" → "Les Hauts Beaux Monts"; accents from the region's own names, word by word, where it only
// ever writes a word one accented way
const cap = s => s.toLowerCase().split(" ").map((w, i) => (i && /^(de|du|des|d'.*|la|le|les|l'.*|en|sur|sous|et|ou|au|aux|à|ès|dit)$/.test(w)) ? w
  : w.split("-").map(p => p.replace(/^(d'|l')?(.)/, (m, a, b) => (a || "") + b.toUpperCase())).join("-")).join(" ").replace(/^(.)/, m => m.toUpperCase());
const fold = t => String(t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe").replace(/[-'’]/g, " ").replace(/\s+/g, " ").trim();

let total = 0;
for (const id of Object.keys(DEPS).filter(r => !ONLY.length || ONLY.includes(r))) {
  global.window = {}; require(path.join(ROOT, `atlas-${id}.js`)); const P = window.ATLAS_PACKS[id];
  try { require(path.join(ROOT, `atlas-${id}-topo.js`)); } catch (e) { /* names only help the spelling */ }
  const T = window.ATLAS_TOPO && window.ATLAS_TOPO[id];
  const [E0, N0] = P.meta.l93, toM = ([lon, lat]) => { const [E, N] = L93(lon, lat); return [Math.round(E - E0), Math.round(N0 - N)]; };
  // the land: crus and village appellations
  const land = [...P.climats, ...P.villages].filter(c => c.g).flatMap(c => c.g).map(p => ({ p, bb: bbOf(p[0]) })), LBB = bbOf(land.flatMap(l => [[l.bb[0], l.bb[1]], [l.bb[2], l.bb[3]]]));
  const onLand = (x, y) => land.some(({ p, bb }) => x >= bb[0] && x <= bb[2] && y >= bb[1] && y <= bb[3] && inRing(x, y, p[0]) && !p.slice(1).some(h => inRing(x, y, h)));
  // spelling: whole names, then single words, from the pack's and the topo's names
  const names = [...P.climats.map(c => c.n), ...P.villages.map(v => v.ap), ...(T && T.names ? T.names.map(n => n[1]) : [])].filter(Boolean);
  const SPELL = new Map(), WORDS = new Map(), PLAIN = new Set();
  names.forEach(n => { if (/[^\x00-\x7f]/.test(n) && !SPELL.has(fold(n))) SPELL.set(fold(n), n);
    String(n).split(/[\s\-'’()«»"]+/).forEach(w => { if (w.length < 3) return; const k = fold(w).replace(/ /g, ""); if (!/[^\x00-\x7f]/.test(w)) { PLAIN.add(k); return; }
      const f = WORDS.get(k) || new Set(); f.add(w.toLowerCase()); WORDS.set(k, f); }); });
  const spell = n => SPELL.get(fold(n)) || n.replace(/[A-Za-z]{3,}/g, w => { const k = w.toLowerCase(), f = WORDS.get(k); if (!f || f.size !== 1 || PLAIN.has(k)) return w; const s = [...f][0]; return w[0] === w[0].toUpperCase() ? s[0].toUpperCase() + s.slice(1) : s; });
  const tidy = raw => { const n = raw.replace(/^\s*\((.*)\)\s*$/, "$1").replace(/\s*\(/g, " (").replace(/\s*"\s*([^"]*?)\s*"/g, ' "$1"').replace(/\s+/g, " ").trim(), m = /^(.*?) dit "(.*)"$/i.exec(n);
    return m ? `${spell(cap(m[1]))} dit « ${spell(cap(m[2]))} »` : spell(cap(n)); };
  // the communes that reach the land
  const communes = {};
  for (const dep of DEPS[id]) {
    const f = path.join(GCACHE, `communes-${dep}.json`);
    if (!fs.existsSync(f)) fs.writeFileSync(f, curl(`https://geo.api.gouv.fr/departements/${dep}/communes?format=geojson&geometry=contour&fields=code,nom`));
    JSON.parse(fs.readFileSync(f, "utf8")).features.forEach(ft => { const g = ft.geometry; if (!g) return;
      const rings = (g.type === "Polygon" ? [g.coordinates] : g.coordinates).map(p => p[0].map(toM)), bb = bbOf(rings.flat());
      if (!meet(bb, LBB)) return;
      // a vertex of the land inside the commune, or a vertex of the commune on the land
      const hit = land.some(({ p, bb: b }) => meet(b, bb) && (p[0].some(([x, y], i) => i % 3 === 0 && rings.some(r => inRing(x, y, r))) || rings.some(r => r.some(([x, y], i) => i % 5 === 0 && x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3] && inRing(x, y, p[0])))));
      if (hit) communes[ft.properties.code] = ft.properties.nom; });
  }
  const out = []; let none = 0;
  for (const insee of Object.keys(communes).sort()) {
    const file = path.join(CACHE, insee + ".json");
    if (!fs.existsSync(file)) { try { fs.writeFileSync(file, curl(`https://cadastre.data.gouv.fr/data/etalab-cadastre/latest/geojson/communes/${insee.slice(0, 2)}/${insee}/cadastre-${insee}-lieux_dits.json.gz`, true)); }
      catch (e) { if (e.status === 22) { none++; continue; } // 404: the commune has no lieux-dits file
        throw new Error(`${id}: ${insee} ${communes[insee]} could not be fetched (curl ${e.status}); run again, the rest is cached`); } }
    JSON.parse(fs.readFileSync(file, "utf8")).features.forEach(f => {
      const g = f.geometry, name = (f.properties.nom || "").trim(); if (!g || !name) return;
      (g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : []).forEach(p => {
        const r = dpRing(p[0].map(toM), 2.5); if (r.length < 4 || area(r) < 1500) return;
        const pt = pole(r), [x0, y0, x1, y1] = bbOf(r);
        const probes = [pt, ...[[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(([x, y]) => [(x + pt[0]) / 2, (y + pt[1]) / 2])].filter(([x, y]) => inRing(x, y, r));
        if (!probes.some(([x, y]) => onLand(x, y))) return;
        const flat = r.slice(0, -1).flat(); out.push([insee, tidy(name), pt[0], pt[1], flat.map((v, i) => i < 2 ? v : v - flat[i - 2])]);
      });
    });
  }
  const used = Object.fromEntries(Object.entries(communes).filter(([k]) => out.some(l => l[0] === k)));
  const js = `// Generated by tools/region-ld.js — do not edit by hand.\nwindow.ATLAS_LD = window.ATLAS_LD || {};\nwindow.ATLAS_LD[${JSON.stringify(id)}] = ${JSON.stringify({
    meta: { source: "Cadastre — lieux-dits (Etalab, cadastre.data.gouv.fr), Licence Ouverte", built: new Date().toISOString().slice(0, 10), delta: true, id,
      fields: ["insee", "name", "label x (m)", "label y (m)", "outline (delta-encoded metres)"], communes: used }, ld: out })};\n`;
  fs.writeFileSync(path.join(ROOT, `atlas-${id}-ld.js`), js); total += js.length;
  console.log(`${id.padEnd(12)} ${Object.keys(communes).length} communes (${none} without a cadastre file), ${out.length} lieux-dits, ${(js.length / 1024).toFixed(0)} KB`);
}
console.log(`wrote ${(total / 1024).toFixed(0)} KB`);
