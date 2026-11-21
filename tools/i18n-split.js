// The shared dictionaries (i18n-da.js, i18n-fr.js, i18n-de.js) are loaded on every page, but most of their words are
// the cellar's. This moves the words only the cellar page uses into i18n-cellar-<lang>.js, which index.html names in
// its <meta name="i18n-extra">, so the atlas and the other pages load less.
// A word stays shared when its text appears anywhere outside the cellar's own files: every other page, and every script
// those pages (or the atlas, lazily) load. "The cellar's own files" are the scripts index.html and app.js load that no
// other page or script asks for. Run again whenever words are added; it only ever moves words to the cellar's file
// when nothing else mentions them, and moves them back when something does.
//   node tools/i18n-split.js [--check]   (--check: change nothing, exit 1 if a word is in the wrong file)
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const R = path.join(__dirname, ".."), rd = f => fs.readFileSync(path.join(R, f), "utf8");
const LANGS = ["da", "fr", "de"], check = process.argv.includes("--check");
const isDict = f => /(^|-)i18n(-[a-z]+)?-(da|fr|de)\.js$/.test(f) || f === "i18n.js";
const html = fs.readdirSync(R).filter(f => f.endsWith(".html"));
const js = fs.readdirSync(R).filter(f => f.endsWith(".js") && !isDict(f));
const refs = s => [...s.matchAll(/["'`]([\w.-]+\.js)(?:\?v=\d+)?["'`]/g)].map(m => m[1]).filter(f => js.includes(f)); // quoted: a src or a load, not a comment
// the scripts each page loads, and those scripts load in turn (not the service worker's list of what to keep offline)
const reach = start => { const seen = new Set(), todo = [...start]; while (todo.length) { const f = todo.pop(); if (seen.has(f)) continue; seen.add(f);
  if (f.endsWith(".js") && f !== "app.js" && f !== "atlas-sw.js") refs(rd(f)).forEach(x => todo.push(x)); } return seen; };
const cellarStart = refs(rd("index.html")).concat("app.js", ...refs(rd("app.js")));
const others = reach(html.filter(f => f !== "index.html").flatMap(f => refs(rd(f))));
const cellarOnly = [...reach(cellarStart)].filter(f => !others.has(f) && f !== "i18n.js");
// big data that never holds a UI word: left out of the search to keep it quick
const corpus = html.filter(f => f !== "index.html").concat(js.filter(f => !cellarOnly.includes(f) && !/^atlas-[a-z]+(-(topo|ld|dem|geol|wx|bld|own))?\.js$/.test(f) && fs.statSync(path.join(R, f)).size < 3e6))
  .map(f => rd(f)).join("\n");
const ent = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// as a whole: "Red" isn't mentioned by "Reduce" (a word boundary where the text starts or ends with a letter or digit)
const rx = k => new RegExp((/^\w/.test(k) ? "(?<![\\w])" : "") + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + (/\w$/.test(k) ? "(?![\\w])" : ""));
const mentioned = k => [k, JSON.stringify(k).slice(1, -1), ent(k)].some(x => corpus.includes(x) && rx(x).test(corpus));
const load = f => { const w = { I18N_DICT: {} }; if (fs.existsSync(path.join(R, f))) vm.runInNewContext(rd(f), { window: w }); return w.I18N_DICT; };
let wrong = 0;
for (const l of LANGS) {
  const sharedF = `i18n-${l}.js`, cellarF = `i18n-cellar-${l}.js`;
  const S = load(sharedF)[l] || {}, C = load(cellarF)[l] || {}, all = { ...C, ...S };
  const keep = {}, move = {};
  for (const [k, v] of Object.entries(all)) (mentioned(k) ? keep : move)[k] = v;
  const nowWrong = Object.keys(move).filter(k => k in S).length + Object.keys(keep).filter(k => k in C).length; wrong += nowWrong;
  console.error(`${l}: ${Object.keys(keep).length} shared, ${Object.keys(move).length} only the cellar's${nowWrong ? ` (${nowWrong} to move)` : ""}`);
  if (check) continue;
  // the shared file keeps its header: only the dictionary's entries are rewritten
  const src = rd(sharedF), body = o => Object.entries(o).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(",\n");
  const pre = `// The cellar page's own words in ${({ da: "Danish", fr: "French", de: "German" })[l]} (index.html), split from i18n-${l}.js by tools/i18n-split.js:\n// the words no other page uses. Loaded after i18n-${l}.js (index.html's <meta name="i18n-extra">) and added to its dictionary.\n`;
  fs.writeFileSync(path.join(R, cellarF), pre + `window.I18N_DICT = window.I18N_DICT || {};\nObject.assign(window.I18N_DICT.${l} = window.I18N_DICT.${l} || {}, {\n${body(move)}\n});\n`);
  fs.writeFileSync(path.join(R, sharedF), sharedHeader(src, l) + `{\n${body(keep)}\n};\n`);
}
function sharedHeader(src, l) { // everything up to the dictionary object's opening brace
  const i = src.search(new RegExp(`I18N_DICT(\\.${l}|\\[["']${l}["']\\])\\s*=\\s*\\{`)); if (i < 0) throw new Error(`i18n-${l}.js: can't find its dictionary`);
  return src.slice(0, src.indexOf("{", i)); }
if (process.argv.includes("--files")) console.error("the cellar's own: " + cellarOnly.join(" ") + "\nalso elsewhere: " + [...reach(cellarStart)].filter(f => others.has(f)).join(" "));
if (check && wrong) { console.error(`${wrong} words in the wrong file: run node tools/i18n-split.js`); process.exit(1); }
