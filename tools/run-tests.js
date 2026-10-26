// Every test suite, one after the other, as CI runs them (.github/workflows/tests.yml) and as you can run them
// before a pull request. Serves the repo on :8765 itself for the browser tests, prints one line per suite and a
// summary, and exits 1 if any suite failed.
//   node tools/run-tests.js            all suites
//   node tools/run-tests.js --node     only the Node suites (no browser needed)
//   node tools/run-tests.js abuse vault-ui …   only the suites named
"use strict";
const http = require("http"), fs = require("fs"), path = require("path"), { spawn } = require("child_process");
const ROOT = path.join(__dirname, ".."), PORT = 8765;
const NODE = ["i18n-test", "import-test", "export-test", "messy-test", "vault-test", "sommelier-test", "big-import-test", "abuse-test", "backup-test"];
const BROWSER = ["import-ui-test", "tidy-ui-test", "vault-ui-test", "sommelier-ui-test", "add-suggest-ui-test", "i18n-ui-test",
  "cellar-flow-test", "cellar-flow-test:vault", "big-import-ui-test", "fast-login-ui-test", "smoke-test"];
const args = process.argv.slice(2);
let suites = args.includes("--node") ? NODE : NODE.concat(BROWSER);
const named = args.filter(a => !a.startsWith("--"));
if (named.length) suites = suites.filter(s => named.some(n => s === n || s === n + "-test" || s.startsWith(n + "-test:")));

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".png": "image/png",
  ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".gs": "text/plain", ".webmanifest": "application/manifest+json" };
function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let f = decodeURIComponent(req.url.split("?")[0]); if (f.endsWith("/")) f += "index.html";
      const file = path.join(ROOT, path.normalize(f).replace(/^(\.\.[/\\])+/, ""));
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end("not found"); }
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
      fs.createReadStream(file).pipe(res);
    });
    srv.once("error", () => resolve(null)); // something already serves the port: use it
    srv.listen(PORT, () => resolve(srv));
  });
}
function run(suite) {
  const [name, variant] = suite.split(":");
  return new Promise(resolve => {
    const t0 = Date.now(), env = { ...process.env, ...(variant === "vault" ? { VAULT: "1" } : {}) };
    const child = spawn(process.execPath, [path.join(__dirname, name + ".js")], { cwd: ROOT, env });
    let out = ""; child.stdout.on("data", d => { out += d; }); child.stderr.on("data", d => { out += d; });
    const timer = setTimeout(() => { out += "\n(timed out after 15 minutes)"; child.kill("SIGKILL"); }, 15 * 60000);
    child.on("close", code => {
      clearTimeout(timer);
      const tally = (out.match(/(\d+)\/(\d+) passed/g) || []).pop() || (/NO FINDINGS/.test(out) ? "no findings" : "");
      resolve({ suite, ok: code === 0, tally, secs: Math.round((Date.now() - t0) / 1000), out });
    });
  });
}

(async () => {
  const needsServer = suites.some(s => BROWSER.includes(s));
  const srv = needsServer ? await serve() : null;
  const results = [];
  for (const s of suites) {
    const r = await run(s); results.push(r);
    console.log(`${r.ok ? "✓" : "✗"} ${s.padEnd(24)} ${r.tally.padEnd(14)} ${r.secs}s`);
    if (!r.ok) {
      const lines = r.out.split("\n"), hits = lines.filter(l => /FAIL|Error|error|timed out/.test(l)).slice(0, 15);
      console.log((hits.length ? hits : lines.filter(l => l.trim()).slice(-15)).map(l => "    " + l).join("\n")); // else its last lines
    }
  }
  if (srv) srv.close();
  const bad = results.filter(r => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} suites passed` + (bad.length ? ` — failed: ${bad.map(r => r.suite).join(", ")}` : ""));
  process.exit(bad.length ? 1 : 0);
})();
