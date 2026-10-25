// Runs apps-script/Code.gs in Node against an in-memory spreadsheet and Drive (../gas-fake.js, the same fake the
// browser's vault engine uses), so the tests exercise the real API logic, not a hand-written mock.
//
//   const gas = require("./gas-harness")({ Ark1: [[headers…], [row…], …], Journal: […] });
//   gas.call({ code: "test-code", action: "data" })  → parsed JSON response
//   gas.rows("Ark1")                                   → the bound sheet's current cells
//   gas.rt                                             → the runtime: rt.books, rt.files, rt.tabs(bookId)
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm"), crypto = require("crypto");
const FAKE = require("../gas-fake.js");

module.exports = function harness(tabs, opts = {}) {
  const rt = FAKE.runtime(tabs, {
    today: opts.today || "2026-10-16",
    sheetsText: true, // text and formulas as Sheets stores them
    fetch: opts.fetch, properties: opts.properties,
    // Apps Script gives digests as Java bytes: -128…127
    digest: (alg, str) => [...crypto.createHash(alg).update(String(str), "utf8").digest()].map(b => b > 127 ? b - 256 : b),
  });
  const ctx = { ...rt.globals, console };
  vm.createContext(ctx);
  // the project's two files, as Apps Script loads them (one shared global scope); Code.gs first, to show the
  // order doesn't matter. The test sets its own access code.
  const read = f => fs.readFileSync(path.join(__dirname, "..", "apps-script", f), "utf8");
  vm.runInContext(read("Code.gs") + "\n;globalThis.__handle = handle;", ctx);
  vm.runInContext(read("Settings.gs"), ctx);
  vm.runInContext(`SETTINGS.ACCESS_CODE = ${JSON.stringify("code" in opts ? opts.code : "test-code")};`, ctx);
  if (opts.settings) vm.runInContext(`Object.assign(SETTINGS, ${JSON.stringify(opts.settings)});`, ctx);
  return {
    call: p => JSON.parse(ctx.__handle(JSON.parse(JSON.stringify(p))).s),
    rows: n => rt.book.sheets[n] ? rt.book.sheets[n]._cells.map(r => [...r]) : null,
    sheet: n => rt.book.sheets[n],
    run: code => vm.runInContext(code, ctx), // e.g. run("makeOwner()") — as if from the script editor
    rt,
  };
};
