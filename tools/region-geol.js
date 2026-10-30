#!/usr/bin/env node
// BRGM's geological map (BD Charm-50, harmonised 1:50 000) for each French region pack → atlas-<id>-geol.js
//
//   node tools/region-geol.js <folder with the GEO050K_HARM_<dép>.zip files, unzipped or not> chablis [rhone …]   (or "all")
//
// As tools/geol-import.js does for the Côte d'Or. The files are BRGM's departmental maps (InfoTerre; while InfoTerre is
// closed, the byte-identical copies on data.cquest.org/brgm/bd_charm_50/2019/, Licence Ouverte). Both they and the packs
// are in Lambert-93, so no reprojection: a pack's metres are (E − l93[0], l93[1] − N). The départements a pack needs are
// the ones whose map overlaps it. Each département has its own legend, so formations are keyed by BRGM's notation and
// description together, and one met in two départements (the Rhône's granite either side of the river) is one formation.
// Formations are clipped to the boxes round the vineyards (plus a margin), simplified, and written with BRGM's own
// colours (converted from CMYK); for every vineyard the formations under it, by share of its area.
"use strict";
const fs = require("fs"), path = require("path"), cp = require("child_process");
const pc = require("./node_modules/polygon-clipping"), shp = require("./node_modules/shapefile");
const ROOT = path.resolve(__dirname, "..");
const FRENCH = ["chablis", "chalonnaise", "maconnais", "champagne", "alsace", "rhone", "beaujolais", "rhonesud", "bordeaux"];

const area = r => Math.abs(r.reduce((s, [x, y], i) => { const [x2, y2] = r[(i + 1) % r.length]; return s + x * y2 - x2 * y; }, 0) / 2);
const mpArea = mp => mp.reduce((s, p) => s + area(p[0]) - p.slice(1).reduce((t, h) => t + area(h), 0), 0);
const bbox = mp => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; mp.forEach(p => p[0].forEach(([x, y]) => { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); })); return [a, b, c, d]; };
const meets = (p, q) => !(p[2] < q[0] || p[0] > q[2] || p[3] < q[1] || p[1] > q[3]);
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
// BRGM writes its petrographic symbols in a font of its own, so a granite's γ arrives as "ã". Read off the descriptions
// that carry each one (granites ã, gneiss æ, micaschists ñ, leptynites í, microgranites îã, diorites ë, amphibolites ä,
// basalts â, andesites á, rhyolites ó, syenites ô, trachytes ö). A notation with any other such character is left out
// rather than guessed: the description says what the formation is.
const GLYPH = { "ã": "γ", "æ": "ζ", "ñ": "ξ", "í": "λ", "î": "μ", "ë": "η", "ä": "δ", "â": "β", "á": "α", "ó": "ρ", "ô": "σ", "ö": "τ" };
const notation = n => [...n].every(ch => ch.charCodeAt(0) < 127 || GLYPH[ch]) ? [...n].map(ch => GLYPH[ch] || ch).join("") : "";
const clamp = v =>Math.max(0, Math.min(100, v)); // BRGM uses −1 for "none"
const cmyk = (c, m, y, k) => "#" + [c, m, y].map(v => Math.round(255 * (1 - clamp(v) / 100) * (1 - clamp(k) / 100)).toString(16).padStart(2, "0")).join("");

// the departmental maps on hand: GEO050K_HARM_<dép>_S_FGEOL_2154.shp, unzipped from GEO050K_HARM_<dép>.zip if need be
function maps(dir) {
  const work = path.join(dir, ".unz"); fs.mkdirSync(work, { recursive: true });
  for (const z of fs.readdirSync(dir).filter(f => /^GEO050K_HARM_\w+\.zip$/i.test(f))) {
    const d = z.match(/HARM_(\w+)\.zip/i)[1], out = path.join(work, d);
    if (!fs.existsSync(out)) cp.execFileSync("unzip", ["-oqj", path.join(dir, z), "*_S_FGEOL_2154.*", "-d", out]);
  }
  const found = {};
  for (const base of [dir, ...fs.readdirSync(work).map(d => path.join(work, d))])
    for (const f of fs.readdirSync(base)) { const m = f.match(/^GEO050K_HARM_(\w+?)_S_FGEOL_2154\.shp$/i); if (m) found[m[1]] = path.join(base, f); }
  return found;
}

async function build(id, MAPS) {
  global.window = {}; require(path.join(ROOT, `atlas-${id}.js`));
  const P = window.ATLAS_PACKS[id], L = P.meta.l93; if (!L || P.meta.proj) throw new Error(id + ": not a Lambert-93 pack");
  const toP = ([E, N]) => [Math.round(E - L[0]), Math.round(L[1] - N)];
  const outlines = P.climats.map(c => [c.id, c.g]);
  // the area: a box round every part of every vineyard and village appellation, grown by a margin, as one polygon
  const all = outlines.flatMap(([, g]) => g).concat(P.villages.flatMap(v => v.g)), ext0 = bbox(all), span = Math.max(ext0[2] - ext0[0], ext0[3] - ext0[1]);
  const big = span > 40000, MARGIN = big ? 300 : 400, TOL = big ? 12 : 6, MINA = big ? 2500 : 400;
  const boxes = all.map(p => { const b = bbox([p]); return [b[0] - MARGIN, b[1] - MARGIN, b[2] + MARGIN, b[3] + MARGIN]; }).filter(b => (b[2] - b[0]) * (b[3] - b[1]) > 0);
  const AREA = pc.union(...boxes.map(([x0, y0, x1, y1]) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]));
  const ext = boxes.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
  const legend = {}, keyOf = {}, polys = [], used = [];
  for (const [dep, file] of Object.entries(MAPS).sort()) {
    const src = await shp.open(file, file.replace(/\.shp$/i, ".dbf"), { encoding: "latin1" });
    const [e0, n0, e1, n1] = src.bbox, db = [e0 - L[0], L[1] - n1, e1 - L[0], L[1] - n0];
    if (!meets(db, ext)) continue;
    let n = 0;
    for (let r = await src.read(); !r.done; r = await src.read()) {
      const f = r.value, p = f.properties, g = f.geometry; if (!g) continue;
      const parts = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
      const mp = parts.map(pp => pp.map(ring => ring.map(toP)));
      if (!meets(bbox(mp), ext)) continue;
      let clip; try { clip = pc.intersection(mp, AREA); } catch (e) { continue; }
      if (!clip.length) continue;
      const nt = String(p.NOTATION || "").trim(), ds = String(p.DESCR || "").trim().replace(/\s+/g, " "), k0 = nt + "|" + ds;
      const key = keyOf[k0] ??= String(Object.keys(keyOf).length + 1);
      legend[key] ||= [notation(nt), ds,cmyk(+p.C_FOND || 0, +p.M_FOND || 0, +p.J_FOND || 0, +p.N_FOND || 0)];
      polys.push([key, clip, bbox(clip)]); n++;
    }
    if (n) used.push(dep);
  }
  if (!polys.length) { console.log(`${id}: no departmental map covers it (have ${Object.keys(MAPS).join(", ")})`); return; }
  // formations under each vineyard, by share of its area
  const under = {};
  for (const [cid, mp] of outlines) {
    const tot = mpArea(mp), bb = bbox(mp), sh = {};
    for (const [key, gp, gb] of polys) { if (!meets(bb, gb)) continue;
      let a = 0; try { a = mpArea(pc.intersection(mp, gp)); } catch (e) {}
      if (a > 0) sh[key] = (sh[key] || 0) + a; }
    const list = Object.entries(sh).map(([k, a]) => [k, Math.round(100 * a / tot)]).filter(([, p]) => p >= 3).sort((a, b) => b[1] - a[1]).slice(0, 4);
    if (list.length) under[cid] = list;
  }
  // the drawing: delta-encoded simplified rings, grouped by formation
  const delta = f => f.map((v, i) => i < 2 ? v : v - f[i - 2]), shapes = {};
  polys.forEach(([key, mp]) => mp.forEach(pp => pp.forEach(ring => {
    const s = dpRing(ring, TOL); if (s.length < 4 || area(s) < MINA) return;
    (shapes[key] ||= []).push(delta(s.slice(0, -1).flat()));
  })));
  // only the formations that are drawn or under a vineyard go in the legend
  const keep = new Set([...Object.keys(shapes), ...Object.values(under).flatMap(l => l.map(([k]) => k))]);
  Object.keys(legend).forEach(k => { if (!keep.has(k)) delete legend[k]; });
  const meta = { id, source: `BRGM — carte géologique harmonisée 1:50 000 (BD Charm-50), départements ${used.join(", ")}`, deps: used, built: new Date().toISOString().slice(0, 10), delta: true };
  const js = `// Generated by tools/region-geol.js ${id} — do not edit by hand.\nwindow.ATLAS_GEOL = window.ATLAS_GEOL || {};\nwindow.ATLAS_GEOL[${JSON.stringify(id)}] = ${JSON.stringify({ meta, legend, shapes, under })};\n`;
  fs.writeFileSync(path.join(ROOT, `atlas-${id}-geol.js`), js);
  const miss = P.climats.filter(c => !c.unnamed && !under[c.id]).map(c => c.n);
  console.log(`${id}: départements ${used.join(", ")} · ${polys.length} polygons, ${Object.keys(legend).length} formations · ${(js.length / 1024).toFixed(0)} KB · under ${Object.keys(under).length}/${P.climats.length}${miss.length ? " (none under " + miss.slice(0, 6).join(", ") + ")" : ""}`);
  P.climats.filter(c => under[c.id]).sort((a, b) => b.ha - a.ha).slice(0, 3).forEach(c => console.log("  ", c.n, "—", under[c.id].map(([k, p]) => `${legend[k][0]} ${p}% (${legend[k][1].slice(0, 70)})`).join(" | ")));
}

(async () => {
  const [dir, ...ids] = process.argv.slice(2);
  if (!dir || !ids.length) { console.error("usage: node tools/region-geol.js <folder with GEO050K_HARM_*.zip> <region…|all>"); process.exit(1); }
  const MAPS = maps(path.resolve(dir));
  for (const id of ids[0] === "all" ? FRENCH : ids) await build(id, MAPS);
})().catch(err => { console.error(err); process.exit(1); });
