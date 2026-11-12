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
//
// The German regions (all in Rhineland-Palatinate) take the Landesamt für Geologie und Bergbau's GÜK300 instead
// (Geologische Übersichtskarte 1:300 000, WFS, Datenlizenz Deutschland – Namensnennung 2.0):
//   node tools/region-geol.js --de mosel [nahe …]   (or "--de all")
// Its descriptions are German: each unit's stratigraphy and petrography stay as LGB writes them (the hover, and what a
// German reader sees), with a short label in English, Danish and French read off their words (rock types, then the
// age), as geol-gloss.js does for BRGM's French. LGB's data has no colours, so each unit is coloured by its period
// (the ICS chart's colours), neighbours of one period told apart by a shade.
"use strict";
const fs = require("fs"), path = require("path"), cp = require("child_process");
const pc = require("./node_modules/polygon-clipping"), shp = require("./node_modules/shapefile");
const ROOT = path.resolve(__dirname, "..");
const FRENCH = ["chablis", "chalonnaise", "maconnais", "champagne", "alsace", "rhone", "beaujolais", "rhonesud", "bordeaux", "centreloire", "touraine", "anjou", "jura", "provence"];

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

// ── Germany: LGB Rheinland-Pfalz, GÜK300 ──
const GERMAN = ["mosel", "nahe", "pfalz", "rheinhessen", "mittelrhein", "ahr"];
const GUEK = "https://mapserver.lgb-rlp.de/cgi-bin/mc_guek300?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=ms:geologische_uebersichtskarte300&SRSNAME=urn:ogc:def:crs:EPSG::4326&BBOX=";
const unent = s => { let t = String(s || ""), prev; do { prev = t; t = t.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n))
  .replace(/&([aeiou])(acute|grave|circ|uml);/gi, (m, v, k) => ({ acute: { a: "á", e: "é", i: "í", o: "ó", u: "ú" }, grave: { a: "à", e: "è", i: "ì", o: "ò", u: "ù" }, circ: { a: "â", e: "ê", i: "î", o: "ô", u: "û" }, uml: { a: "ä", e: "ë", i: "ï", o: "ö", u: "ü" } }[k.toLowerCase()][v.toLowerCase()] || m)); } while (t !== prev); return t.replace(/\s+/g, " ").trim(); };
// German rock words → [en, da, fr], in the order the petrography names them, at most three
const DE_ROCK = [
  [/tonschiefer|schiefer\b|dachschiefer/, "Slate", "Skifer", "Ardoise"], [/quarzit/, "Quartzite", "Kvartsit", "Quartzite"],
  [/sandstein/, "Sandstone", "Sandsten", "Grès"], [/siltstein/, "Siltstone", "Siltsten", "Siltite"], [/tonstein/, "Claystone", "Lersten", "Argilite"],
  [/konglomerat/, "Conglomerate", "Konglomerat", "Conglomérat"], [/brekzie/, "Breccia", "Breccie", "Brèche"],
  [/kalkstein/, "Limestone", "Kalksten", "Calcaire"], [/mergel/, "Marl", "Mergel", "Marne"], [/dolomit/, "Dolomite", "Dolomit", "Dolomie"],
  [/löss|löß/, "Loess", "Løss", "Lœss"], [/lehm/, "Loam", "Lerjord", "Limon argileux"], [/\bkies/, "Gravel", "Grus", "Gravier"],
  [/\bsand\b|\bsand,|sande\b|\bsand-/, "Sand", "Sand", "Sable"], [/\bton\b|\bton,|\bton-|tone\b/, "Clay", "Ler", "Argile"], [/schluff/, "Silt", "Silt", "Limon"],
  [/rhyolith/, "Rhyolite", "Rhyolit", "Rhyolite"], [/andesit/, "Andesite", "Andesit", "Andésite"], [/basalt|basanit/, "Basalt", "Basalt", "Basalte"],
  [/trachyt/, "Trachyte", "Trakyt", "Trachyte"], [/\btuff/, "Tuff", "Tuf", "Tuf"], [/bims/, "Pumice", "Pimpsten", "Ponce"], [/diabas|spilit/, "Diabase", "Diabas", "Diabase"],
  [/gneis/, "Gneiss", "Gnejs", "Gneiss"], [/granit/, "Granite", "Granit", "Granite"], [/torf/, "Peat", "Tørv", "Tourbe"], [/gips/, "Gypsum", "Gips", "Gypse"],
];
// the age: the most particular word the stratigraphy uses, first match in this order → [en, da, fr]
const DE_AGE = [
  [/holozän/, "Holocene", "Holocæn", "Holocène"], [/pleistozän/, "Pleistocene", "Pleistocæn", "Pléistocène"],
  [/pliozän/, "Pliocene", "Pliocæn", "Pliocène"], [/miozän/, "Miocene", "Miocæn", "Miocène"], [/oligozän/, "Oligocene", "Oligocæn", "Oligocène"], [/eozän/, "Eocene", "Eocæn", "Éocène"],
  [/keuper/, "Keuper (Triassic)", "Keuper (trias)", "Keuper (Trias)"], [/muschelkalk/, "Muschelkalk (Triassic)", "Muschelkalk (trias)", "Muschelkalk (Trias)"], [/buntsandstein/, "Buntsandstein (Triassic)", "Buntsandstein (trias)", "Buntsandstein (Trias)"],
  [/zechstein/, "Zechstein (Permian)", "Zechstein (perm)", "Zechstein (Permien)"], [/rotliegend/, "Rotliegend (Permian)", "Rotliegend (perm)", "Rotliegend (Permien)"],
  [/unterdevon/, "Lower Devonian", "Nedre devon", "Dévonien inférieur"], [/mitteldevon/, "Middle Devonian", "Mellem devon", "Dévonien moyen"], [/oberdevon/, "Upper Devonian", "Øvre devon", "Dévonien supérieur"],
  [/quartär/, "Quaternary", "Kvartær", "Quaternaire"], [/tertiär/, "Tertiary", "Tertiær", "Tertiaire"], [/jura\b/, "Jurassic", "Jura", "Jurassique"], [/trias/, "Triassic", "Trias", "Trias"],
  [/permokarbon/, "Permo-Carboniferous", "Perm-karbon", "Permo-Carbonifère"], [/perm\b/, "Permian", "Perm", "Permien"], [/karbon/, "Carboniferous", "Karbon", "Carbonifère"],
  [/devon/, "Devonian", "Devon", "Dévonien"], [/silur/, "Silurian", "Silur", "Silurien"], [/ordovizium/, "Ordovician", "Ordovicium", "Ordovicien"],
];
// ICS chart colours, by the same words
const ICS = [[/holozän/, "#fef2e0"], [/pleistozän/, "#fff2ae"], [/quartär/, "#f9f97f"], [/pliozän|miozän/, "#ffe619"], [/oligozän|eozän|paläozän/, "#fd9a52"], [/tertiär/, "#ffe619"],
  [/jura\b/, "#34b2c9"], [/keuper/, "#bd8cc3"], [/muschelkalk/, "#b168b1"], [/buntsandstein/, "#983999"], [/trias/, "#812b92"], [/rotliegend|perm/, "#f04028"],
  [/karbon/, "#67a599"], [/unterdevon/, "#e5ac4d"], [/mitteldevon/, "#f1c868"], [/oberdevon/, "#f1e19d"], [/devon/, "#cb8c37"], [/silur/, "#b3e1b6"], [/ordovizium/, "#009270"]];
function deLabel(strat, petro, nt) {
  // a unit with no description of its own: LGB's "gew" is water (Gewässer)
  if (!strat && !petro) return nt === "gew" ? { en: "Water", da: "Vand", fr: "Eau" } : { en: "", da: "", fr: "" };
  // German leaves the shared end off a list of compounds ("Ton-, Silt- und Sandstein"): put it back on each
  const p = petro.toLowerCase().replace(/\b(ton|silt|sand|kalk|quarz)-(?=(?:[^.;:]*?,\s*\w+-)*[^.;:]*?\b\w*(stein|schiefer)\b)/g, (m, w, end) => w + end + " "),
    st = strat.toLowerCase();
  // the unit's own name says slate (Hunsrückschiefer, Wissenbach-Schiefer): that is the rock, whatever its petrography lists first
  const named = /schiefer/.test(st) && !/schiefer/.test(p) ? [DE_ROCK[0]] : [];
  const rocks = named.concat(DE_ROCK.map(r => [p.search(r[0]), r]).filter(([i]) => i >= 0).sort((a, b) => a[0] - b[0]).map(([, r]) => r));
  const uniq = []; rocks.forEach(r => { if (!uniq.includes(r)) uniq.push(r); }); const R = uniq.slice(0, 3), age = DE_AGE.find(([re]) => re.test(st));
  const AND = [" and ", " og ", " et "];
  return ["en", "da", "fr"].reduce((o, lang, L) => {
    const w = R.map((r, i) => i ? r[1 + L].toLowerCase() : r[1 + L]);
    const head = !w.length ? "" : w.length === 1 ? w[0] : w.slice(0, -1).join(", ") + AND[L] + w.at(-1);
    const a = age ? age[1 + L] : "";
    o[lang] = head && a ? `${head} · ${a}` : head || a; return o; }, {});
}
const shade = (hex, i) => { if (!i) return hex; const f = [1, .9, 1.08, .82, 1.14][i % 5]; // neighbours of one period, told apart
  return "#" + [1, 3, 5].map(j => Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(j, j + 2), 16) * f))).toString(16).padStart(2, "0")).join(""); };
function curlTo(url, file) { if (!fs.existsSync(file)) fs.writeFileSync(file, cp.execFileSync("curl", ["-sS", "--max-time", "300", "--retry", "5", "--retry-all-errors", url], { maxBuffer: 1 << 30 })); return fs.readFileSync(file, "utf8"); }
// the units overlapping the pack, from LGB's WFS (cached), projected onto the pack's grid → [{nt, ds, label, colour, mp}]
function guekFeatures(id, P) {
  const O = P.meta.origin, d2r = Math.PI / 180, RE = 6371000, kx = d2r * RE * Math.cos(O[1] * d2r), ky = d2r * RE, bb = P.meta.bb, M = 2000;
  const lon = x => O[0] + x / kx, lat = y => O[1] - y / ky, toP = ([la, lo]) => [Math.round((lo - O[0]) * kx), Math.round((O[1] - la) * ky)];
  const box = [lat(bb[3] + M), lon(bb[0] - M), lat(bb[1] - M), lon(bb[2] + M)].map(v => v.toFixed(5)).join(",") + ",urn:ogc:def:crs:EPSG::4326";
  const dir = path.join(__dirname, ".geol-cache"); fs.mkdirSync(dir, { recursive: true });
  const gml = curlTo(GUEK + box, path.join(dir, `guek300-${id}.gml`));
  const feats = gml.split(/<ms:geologische_uebersichtskarte300 /).slice(1), out = [];
  const field = (f, k) => unent((f.match(new RegExp(`<ms:${k}>([\\s\\S]*?)</ms:${k}>`)) || [])[1]);
  for (const f of feats) {
    const strat = field(f, "STRATIGRAFIE"), petro = field(f, "PETROGRAFIE"), nt = field(f, "LABEL");
    // each gml:Polygon: its exterior and interior rings, "lat lon lat lon …"
    const mp = (f.match(/<gml:Polygon[\s\S]*?<\/gml:Polygon>/g) || []).map(poly => (poly.match(/<gml:posList[^>]*>([^<]+)</g) || []).map(pl => {
      const v = pl.replace(/<gml:posList[^>]*>/, "").trim().split(/\s+/).map(Number), r = []; for (let i = 0; i + 1 < v.length; i += 2) r.push(toP([v[i], v[i + 1]])); return r; }).filter(r => r.length >= 4));
    if (mp.length) out.push({ nt, ds: [strat, petro].filter(Boolean).join(": "), label: deLabel(strat, petro, nt), base: nt === "gew" && !strat ? "#b7d4ea" : (ICS.find(([re]) => re.test(strat.toLowerCase())) || [0, "#d9d9d9"])[1], mp });
  }
  return out;
}

async function build(id, MAPS) {
  global.window = {}; require(path.join(ROOT, `atlas-${id}.js`));
  const P = window.ATLAS_PACKS[id], L = P.meta.l93, DE = MAPS === "de"; if (!DE && (!L || P.meta.proj)) throw new Error(id + ": not a Lambert-93 pack");
  if (DE && P.meta.proj !== "eq") throw new Error(id + ": not a German pack");
  const toP = ([E, N]) => [Math.round(E - L[0]), Math.round(L[1] - N)];
  const outlines = P.climats.map(c => [c.id, c.g]);
  // the area: a box round every part of every vineyard and village appellation, grown by a margin, as one polygon
  const all = outlines.flatMap(([, g]) => g).concat(P.villages.flatMap(v => v.g)), ext0 = bbox(all), span = Math.max(ext0[2] - ext0[0], ext0[3] - ext0[1]);
  const big = span > 40000, MARGIN = big ? 300 : 400, TOL = big ? 12 : 6, MINA = big ? 2500 : 400;
  const boxes = all.map(p => { const b = bbox([p]); return [b[0] - MARGIN, b[1] - MARGIN, b[2] + MARGIN, b[3] + MARGIN]; }).filter(b => (b[2] - b[0]) * (b[3] - b[1]) > 0);
  const AREA = pc.union(...boxes.map(([x0, y0, x1, y1]) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]));
  const ext = boxes.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
  const legend = {}, keyOf = {}, polys = [], used = [];
  const labels = {}, period = {};
  if (DE) {
    let n = 0;
    for (const f of guekFeatures(id, P)) {
      let clip; try { clip = pc.intersection(f.mp, AREA); } catch (e) { continue; }
      if (!clip.length) continue;
      const k0 = f.nt + "|" + f.ds, key = keyOf[k0] ??= String(Object.keys(keyOf).length + 1);
      if (!legend[key]) { const i = period[f.base] = (period[f.base] ?? -1) + 1; legend[key] = [f.nt, f.ds, shade(f.base, i)]; labels[key] = f.label; }
      polys.push([key, clip, bbox(clip)]); n++;
    }
    if (n) used.push("GÜK300");
  }
  for (const [dep, file] of DE ? [] : Object.entries(MAPS).sort()) {
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
    for (const [key, gp, gb] of polys) { if (!meets(bb, gb) || (DE && legend[key][0] === "gew")) continue; // the map's river under a riverside site: no vines stand in it
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
  if (DE) Object.keys(legend).forEach(k => legend[k].push(labels[k]));
  const year = new Date().getFullYear();
  const meta = DE ? { id, source: `LGB Rheinland-Pfalz — Geologische Übersichtskarte 1:300 000 (GÜK300)`, deps: used, built: new Date().toISOString().slice(0, 10), delta: true,
      credit: `©Landesamt für Geologie und Bergbau Rheinland-Pfalz (${year}), dl-de/by-2-0, www.lgb-rlp.de [Daten bearbeitet]`,
      // its own words, as the shared dictionaries are the first page's: the legend's title and the note under a site's geology
      text: { title: { en: "Geology (LGB 1:300 000)", da: "Geologi (LGB 1:300 000)", de: "Geologie (LGB 1:300 000)", fr: "Géologie (LGB 1:300 000)" },
        note: { en: "Share of the site's area on each unit of the Rhineland-Palatinate geological survey's 1:300 000 map. At that scale a unit is a few hundred metres across at the least: the rock beneath a site, not its plots.",
          da: "Andel af lagens areal på hver enhed af Rheinland-Pfalz' geologiske kort i 1:300 000. I den skala er en enhed mindst et par hundrede meter bred: bjergarten under lagen, ikke dens parceller.",
          de: "Anteil der Lagenfläche an jeder Einheit der Geologischen Übersichtskarte 1:300 000 des LGB Rheinland-Pfalz. In diesem Maßstab ist eine Einheit mindestens einige hundert Meter breit: das Gestein unter der Lage, nicht ihre Parzellen.",
          fr: "Part de la surface du site sur chaque unité de la carte géologique au 1:300 000 du service géologique de Rhénanie-Palatinat. À cette échelle, une unité mesure au moins quelques centaines de mètres : la roche sous le site, pas ses parcelles." },
        // (not in German: there the descriptions are LGB's own words)
        orig: { en: "LGB's descriptions are in German: shown here shortened and translated; point at one for the original.",
          da: "LGB's beskrivelser er på tysk: vist her forkortet og oversat; peg på en for originalen.",
          fr: "Les descriptions du LGB sont en allemand : présentées ici abrégées et traduites ; pointez-en une pour l'original." } } }
    : { id, source: `BRGM — carte géologique harmonisée 1:50 000 (BD Charm-50), départements ${used.join(", ")}`, deps: used, built: new Date().toISOString().slice(0, 10), delta: true };
  const js = `// Generated by tools/region-geol.js ${id} — do not edit by hand.\nwindow.ATLAS_GEOL = window.ATLAS_GEOL || {};\nwindow.ATLAS_GEOL[${JSON.stringify(id)}] = ${JSON.stringify({ meta, legend, shapes, under })};\n`;
  fs.writeFileSync(path.join(ROOT, `atlas-${id}-geol.js`), js);
  const miss = P.climats.filter(c => !c.unnamed && !under[c.id]).map(c => c.n);
  console.log(`${id}: ${DE ? "" : "départements "}${used.join(", ")} · ${polys.length} polygons, ${Object.keys(legend).length} formations · ${(js.length / 1024).toFixed(0)} KB · under ${Object.keys(under).length}/${P.climats.length}${miss.length ? " (none under " + miss.slice(0, 6).join(", ") + ")" : ""}`);
  P.climats.filter(c => under[c.id]).sort((a, b) => b.ha - a.ha).slice(0, 3).forEach(c => console.log("  ", c.n, "—", under[c.id].map(([k, p]) => `${legend[k][0]} ${p}% (${legend[k][1].slice(0, 70)})`).join(" | ")));
}

(async () => {
  const [dir, ...ids] = process.argv.slice(2);
  if (!dir || !ids.length) { console.error("usage: node tools/region-geol.js <folder with GEO050K_HARM_*.zip> <region…|all>\n       node tools/region-geol.js --de <region…|all>"); process.exit(1); }
  if (dir === "--de") { for (const id of ids[0] === "all" ? GERMAN : ids) await build(id, "de"); return; }
  const MAPS = maps(path.resolve(dir));
  for (const id of ids[0] === "all" ? FRENCH : ids) await build(id, MAPS);
})().catch(err => { console.error(err); process.exit(1); });
