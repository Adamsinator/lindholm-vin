// Runs apps-script/Code.gs in Node against an in-memory spreadsheet, so the browser tests exercise the real API
// logic (not a hand-written mock). Only the bits of the Apps Script runtime the cellar API uses are faked.
//
//   const gas = require("./gas-harness")({ Ark1: [[headers…], [row…], …], Journal: […] });
//   gas.call({ code: "test-code", action: "data" })  → parsed JSON response
//   gas.rows("Ark1")                                   → the sheet's current cells
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");

function makeSheet(name, rows) {
  const cells = rows.map(r => [...r]);
  const lastRow = () => { for (let r = cells.length; r > 0; r--) if (cells[r - 1].some(v => v !== "" && v != null)) return r; return 0; };
  const lastCol = () => cells.reduce((m, r) => { for (let c = r.length; c > 0; c--) if (r[c - 1] !== "" && r[c - 1] != null) return Math.max(m, c); return m; }, 0);
  const at = (r, c) => { while (cells.length < r) cells.push([]); const row = cells[r - 1]; while (row.length < c) row.push(""); return row; };
  const sh = {
    getName: () => name,
    getLastRow: lastRow,
    getLastColumn: lastCol,
    appendRow(vals) { cells.splice(lastRow(), cells.length - lastRow()); cells.push([...vals]); return sh; },
    deleteRow(r) { cells.splice(r - 1, 1); },
    getRange(r, c, nr = 1, nc = 1) {
      return {
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => { const row = cells[r - 1 + i] || []; const v = row[c - 1 + j]; return v === undefined ? "" : v; })),
        getValue: () => { const row = cells[r - 1] || []; const v = row[c - 1]; return v === undefined ? "" : v; },
        setValue(v) { at(r, c)[c - 1] = v; return this; },
        setValues(vs) { vs.forEach((row, i) => row.forEach((v, j) => { at(r + i, c + j)[c + j - 1] = v; })); return this; },
      };
    },
    _cells: cells,
  };
  return sh;
}

module.exports = function harness(tabs, opts = {}) {
  const book = { sheets: {}, id: "book1" };
  Object.entries(tabs).forEach(([n, rows]) => { book.sheets[n] = makeSheet(n, rows); });
  const ss = {
    getId: () => book.id,
    getSheetByName: n => book.sheets[n] || null,
    insertSheet: n => (book.sheets[n] = makeSheet(n, [])),
  };
  const pad = n => String(n).padStart(2, "0");
  const today = opts.today || "2026-10-16";
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, openById: () => ss },
    Session: { getScriptTimeZone: () => "Europe/Copenhagen" },
    Utilities: {
      formatDate(d, tz, fmt) {
        // the API only asks for these two shapes; "today" is pinned so tests are repeatable
        const isNow = Math.abs(d.getTime() - Date.now()) < 60000;
        const [y, m, dd] = isNow ? today.split("-").map(Number) : [d.getFullYear(), d.getMonth() + 1, d.getDate()];
        if (fmt === "yyyy-MM-dd") return `${y}-${pad(m)}-${pad(dd)}`;
        return `${y}-${pad(m)}-${pad(dd)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      },
      getUuid: () => require("crypto").randomUUID(),
      newBlob: (b, m, n) => ({ b, m, n }), base64Decode: s => Buffer.from(s, "base64"),
      // Apps Script gives digests as Java bytes: -128…127
      DigestAlgorithm: { SHA_256: "sha256" }, Charset: { UTF_8: "utf8" },
      base64Encode: b => Buffer.from((Array.isArray(b) ? b : [...b]).map(x => x & 255)).toString("base64"),
      computeDigest: (alg, str) => [...require("crypto").createHash(alg).update(String(str), "utf8").digest()].map(b => b > 127 ? b - 256 : b),
    },
    DriveApp: { getFileById: () => ({ setTrashed() {}, getParents: () => ({ hasNext: () => false }), getBlob: () => ({ getBytes: () => [], getContentType: () => "image/jpeg" }), moveTo() {} }),
      getRootFolder: () => ({ getFoldersByName: () => ({ hasNext: () => false }), createFolder: () => ({ createFile: () => ({ getId: () => "ph1" }) }) }) },
    ContentService: { createTextOutput: s => ({ s, setMimeType() { return this; } }), MimeType: { JSON: "json" } },
    console,
  };
  vm.createContext(ctx);
  // the project's two files, as Apps Script loads them (one shared global scope); Code.gs first, to show the
  // order doesn't matter. The test sets its own access code.
  const read = f => fs.readFileSync(path.join(__dirname, "..", "apps-script", f), "utf8");
  vm.runInContext(read("Code.gs") + "\n;globalThis.__handle = handle;", ctx);
  vm.runInContext(read("Settings.gs"), ctx);
  vm.runInContext(`SETTINGS.ACCESS_CODE = ${JSON.stringify("code" in opts ? opts.code : "test-code")};`, ctx);
  return {
    call: p => JSON.parse(ctx.__handle(JSON.parse(JSON.stringify(p))).s),
    rows: n => book.sheets[n] ? book.sheets[n]._cells.map(r => [...r]) : null,
    sheet: n => book.sheets[n],
    run: code => vm.runInContext(code, ctx), // e.g. run("makeOwner()") — as if from the script editor
  };
};
