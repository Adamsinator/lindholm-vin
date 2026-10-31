// Size budgets, so the site's speed doesn't creep back: what each page loads before it can be used (its HTML, the
// scripts it names, and the dictionary and texts i18n.js adds for Danish, the language most visitors read), and each
// file a map fetches later, gzipped as GitHub Pages serves them. A budget that fails means something grew: make it
// smaller or load it later — or, if it has to be bigger, raise the budget here on purpose.
//   node tools/size-test.js
"use strict";
const fs = require("fs"), path = require("path"), zlib = require("zlib");
const R = path.join(__dirname, "..");
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const gz = f => zlib.gzipSync(fs.readFileSync(path.join(R, f)), { level: 9 }).length;
const KB = n => Math.round(n / 1024);

// KB gzipped (2026-11: index 245, atlas 76, burgundy 468, domaine 329, privacy 37, 404 1)
const PAGES = { "index.html": 270, "atlas.html": 90, "burgundy.html": 520, "domaine.html": 360, "privacy.html": 45, "404.html": 5 };
for (const [page, budget] of Object.entries(PAGES)) {
  const html = fs.readFileSync(path.join(R, page), "utf8");
  const files = [...html.matchAll(/<script src="([^"?]+)/g)].map(m => m[1]);
  const extra = ((html.match(/<meta name="i18n-extra" content="([^"]*)"/) || [])[1] || "").split(/\s+/).filter(f => /-da\.js/.test(f)).map(f => f.split("?")[0]);
  if (files.includes("i18n.js")) extra.push("i18n-da.js");
  const all = [page, ...files, ...extra], total = all.reduce((s, f) => s + gz(f), 0);
  const top = all.map(f => [f, gz(f)]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([f, n]) => `${f} ${KB(n)}`).join(", ");
  check(`${page}: ${KB(total)} KB before it's usable (budget ${budget})`, KB(total) <= budget, `largest: ${top}`);
}
// the files the maps fetch as they're needed: none over 650 KB gzipped (the Côte d'Or's roads and relief, 584, is the largest)
const big = fs.readdirSync(R).filter(f => /^(atlas-|burgundy-).*\.js$/.test(f)).map(f => [f, gz(f)]).filter(([, n]) => KB(n) > 650);
check("no map file over 650 KB gzipped", !big.length, big.map(([f, n]) => `${f} ${KB(n)}`).join(", "));
const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
