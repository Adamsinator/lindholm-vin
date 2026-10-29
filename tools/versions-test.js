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

// …and a file whose content changed on this branch has to be asked for at a new version, or phones keep the old one
// (it happened: atlas.js changed twice at v8). Compared with main; skipped where main can't be had (no git, offline).
{ const { execSync } = require("child_process"), run = c => execSync(c, { cwd: R, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 28 }).toString(), sh = c => run(c).trim();
  let base = null;
  try { try { sh("git rev-parse --verify -q origin/main"); } catch (e) { sh("git fetch -q --no-tags --depth=200 origin main:refs/remotes/origin/main"); }
    base = sh("git merge-base HEAD origin/main"); } catch (e) { console.log("(skipped the changed-file check: main isn't available here)"); }
  if (base) { // main against the files as they are on disk (committed or not)
    const at = (f, rev) => { try { return run(`git show ${rev}:${f}`); } catch (e) { return null; } }; // untrimmed: compared byte for byte
    const was = {}; // file → version main asks for
    for (const page of ["index.html", "burgundy.html", "domaine.html", "privacy.html", "atlas.html", "burgundy.js", "atlas.js"]) {
      const txt = at(page, base); if (!txt) continue;
      for (const m of txt.matchAll(/["=]([\w./-]+\.js)\?v=(\d+)"/g)) was[m[1]] = m[2];
    }
    const stale = Object.entries(seen).filter(([file, vs]) => { const v = Object.keys(vs)[0]; if (!was[file] || was[file] !== v) return false;
      const a = at(file, base), b = fs.existsSync(path.join(R, file)) ? read(file) : null; return a !== null && b !== null && a !== b; }).map(([f, vs]) => `${f} (still v${Object.keys(vs)[0]})`);
    check("every script changed since main is asked for at a new ?v=", !stale.length, stale.join(", "));
  }
}
const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
