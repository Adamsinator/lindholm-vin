#!/usr/bin/env node
// A pre-rendered relief for a region no tile service shades for us (Piedmont): the pack's box with a margin, shaded from
// an open terrain model by tools/hillshade.py, written as atlas-<id>-relief.webp beside the pack. Prints the box, which
// atlas.js's REGIONS entry carries as relief: { src, ll: [lon0, lat0, lon1, lat1] }.
//   node tools/region-relief.js <id> <dtm.tif> [metres a pixel]
// The terrain: Regione Piemonte, DTM 25 (ICE 2009–2011), CC BY 4.0 — DTM25_2009-2011_PIEMONTE_ICE.zip from datigeo-piem-download.it.
"use strict";
const path = require("path"), { execFileSync } = require("child_process");
const [id, tif, res = "10"] = process.argv.slice(2);
if (!id || !tif) { console.error("usage: node tools/region-relief.js <id> <dtm.tif> [metres a pixel]"); process.exit(1); }
global.window = {}; require(path.join(__dirname, "..", `atlas-${id}.js`));
const P = window.ATLAS_PACKS[id], O = P.meta.origin, d = Math.PI / 180, kx = d * 6371000 * Math.cos(O[1] * d), ky = d * 6371000;
let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
for (const c of P.climats) for (const p of c.g) for (const [x, y] of p[0]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
const m = Math.max(1500, (x1 - x0) * 0.12), ll = [O[0] + (x0 - m) / kx, O[1] - (y1 + m) / ky, O[0] + (x1 + m) / kx, O[1] - (y0 - m) / ky].map(v => +v.toFixed(4));
const out = path.join(__dirname, "..", `atlas-${id}-relief.webp`);
console.error(execFileSync("python3", ["-I", path.join(__dirname, "hillshade.py"), tif, ...ll.map(String), out, res]).toString().trim());
console.log(JSON.stringify({ src: `atlas-${id}-relief.webp?v=1`, ll }));
