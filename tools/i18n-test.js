// Checks that every language has every string: the UI dictionaries in i18n.js (Danish, German, French), the atlas
// texts (burgundy-i18n-*.js) and the vintage notes (burgundy-vintages.js), with the same {0} placeholders and the same
// list lengths as the source.
//   node tools/i18n-test.js
"use strict";
const fs = require("fs"), path = require("path");
const R = f => path.join(__dirname, "..", f);
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const ph = s => (String(s).match(/\{\d\}/g) || []).sort().join();

// UI: one dictionary file per language (i18n-da.js…), loaded by i18n.js
const src = fs.readFileSync(R("i18n.js"), "utf8");
const dict = l => { const w = {}; new Function("window", fs.readFileSync(R(`i18n-${l}.js`), "utf8"))(w); return w.I18N_DICT[l]; };
const D = { da: dict("da"), de: dict("de"), fr: dict("fr") };
check("i18n.js names each dictionary file", ["da", "fr", "de"].every(l => new RegExp(`${l}: "i18n-${l}\\.js\\?v=\\d+"`).test(src)));
const all = new Set(Object.values(D).flatMap(Object.keys));
for (const [l, d] of Object.entries(D)) {
  const missing = [...all].filter(k => !(k in d));
  check(`UI ${l}: every string translated (${Object.keys(d).length})`, !missing.length, missing.slice(0, 5).join(" | "));
  const bad = Object.entries(d).filter(([k, v]) => ph(k) !== ph(v)).map(([k]) => k);
  check(`UI ${l}: placeholders kept`, !bad.length, bad.slice(0, 5).join(" | "));
  const empty = Object.entries(d).filter(([, v]) => !String(v).trim()).map(([k]) => k);
  check(`UI ${l}: no empty strings`, !empty.length, empty.join(" | "));
}
check("the picker offers German", /\{id:"de", n:"Deutsch"\}/.test(src) && /\n  de: `<svg/.test(src));
// every t("…")/tr("…") literal in the front-end has a translation
const used = new Set();
for (const f of ["app.js", "burgundy.js", "domaine.js", "vault.js", "atlas.js"]) {
  const s = fs.readFileSync(R(f), "utf8");
  for (const m of s.matchAll(/\b(?:tr|t|trSet)\("((?:[^"\\]|\\.)+)"/g)) used.add(JSON.parse('"' + m[1] + '"'));
}
for (const f of ["index.html", "burgundy.html", "domaine.html", "privacy.html", "atlas.html"]) {
  const s = fs.readFileSync(R(f), "utf8");
  for (const m of s.matchAll(/<([a-z0-9]+)\b[^>]*\bdata-i18n(?=[\s>])[^>]*>([^<]+)</g)) used.add(m[2].trim().replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&"));
  // placeholders, tooltips and aria labels marked for translation
  for (const m of s.matchAll(/<[a-z0-9]+\b[^>]*>/g)) for (const [attr, mark] of [["placeholder", "data-i18n-ph"], ["title", "data-i18n-title"], ["aria-label", "data-i18n-aria"]]) {
    const v = m[0].match(new RegExp(`\\b${attr}="([^"]*)"`)); if (v && m[0].includes(mark)) used.add(v[1].replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&"));
  }
}
const untranslated = [...used].filter(k => !(k in D.de) && /[a-z]{3}/i.test(k));
check(`every t()/tr() string in the code is in the dictionaries (${used.size})`, !untranslated.length, untranslated.length + " missing: " + untranslated.slice(0, 8).join(" | "));
if (process.env.MISSING) require("fs").writeFileSync(process.env.MISSING, JSON.stringify(untranslated, null, 1));

// atlas texts: German and French mirror the Danish file's structure
global.window = {};
["burgundy-i18n-da.js", "burgundy-i18n-fr.js", "burgundy-i18n-de.js"].forEach(f => require(R(f)));
const A = window.BURG_I18N;
for (const l of ["de", "fr"]) {
  const miss = [];
  for (const sec in A.da) for (const k in A.da[sec]) {
    const a = A.da[sec][k], b = (A[l][sec] || {})[k];
    if (b === undefined) { miss.push(sec + "." + k); continue; }
    if (typeof a === "object") for (const f in a) {
      if (!(f in b)) miss.push(`${sec}.${k}.${f}`);
      else if (Array.isArray(a[f]) && a[f].length !== b[f].length) miss.push(`${sec}.${k}.${f} (length)`);
    }
  }
  check(`atlas ${l}: every description`, !miss.length, miss.slice(0, 5).join(" | "));
}
// vintage notes
require(R("burgundy-vintages.js"));
const V = window.BURG_VINTAGES.i18n;
for (const l of ["de", "fr"]) {
  const miss = Object.keys(V.da).filter(k => !(k in (V[l] || {})));
  check(`vintage notes ${l}: all ${Object.keys(V.da).length}`, !miss.length, miss.slice(0, 3).join(" | "));
}

const n = results.filter(Boolean).length;
console.log(`\n${n}/${results.length} passed`);
process.exit(n === results.length ? 0 : 1);
