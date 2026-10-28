// The ?v= cache numbers have to agree wherever a file is loaded, or a phone keeps running an old cached copy:
// every page that loads a script asks for the same version, the atlas loads the vault's scripts at the cellar's
// versions, and the vault runs the Code.gs of the current API_VERSION.
//   node tools/versions-test.js
"use strict";
const fs = require("fs"), path = require("path");
const R = path.join(__dirname, "..");
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const read = f => fs.readFileSync(path.join(R, f), "utf8");

const seen = {}; // file → { version: [where] }
const note = (file, v, where) => { ((seen[file] ??= {})[v] ??= []).push(where); };
for (const page of ["index.html", "burgundy.html", "domaine.html", "privacy.html", "atlas.html"]) {
  for (const m of read(page).matchAll(/<script src="([\w./-]+\.js)\?v=(\d+)"/g)) note(m[1], m[2], page);
}
for (const js of ["burgundy.js", "atlas.js"]) for (const m of read(js).matchAll(/"([\w.-]+\.js)\?v=(\d+)"/g)) note(m[1], m[2], js);
for (const [file, vs] of Object.entries(seen)) {
  const keys = Object.keys(vs);
  check(`${file} is asked for at one version everywhere`, keys.length === 1, keys.map(k => `v${k} in ${vs[k].join(", ")}`).join(" · "));
}
const api = (read("apps-script/Code.gs").match(/const API_VERSION = (\d+);/) || [])[1];
const engine = (read("vault.js").match(/apps-script\/Code\.gs\?v=(\d+)/) || [])[1];
check("the vault runs the Code.gs of the current API_VERSION", api && api === engine, `API_VERSION ${api}, vault loads v${engine}`);

const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
