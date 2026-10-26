// A small stand-in for the bits of the Google Apps Script runtime that apps-script/Code.gs uses: spreadsheets held
// in memory, and a Drive of folders and files. Two users: tools/gas-harness.js runs the real Code.gs in Node against
// it for the tests (the server side, vault and all), and vault-engine.js runs the same Code.gs in the browser against a
// user's decrypted cellar, so the cellar logic exists once.
//
//   const rt = GAS_FAKE.runtime({ Ark1: [[headers…], [row…]], Journal: […] }, { today: "2026-10-16" })
//   rt.globals → { SpreadsheetApp, Utilities, Session, DriveApp, ContentService } to run Code.gs with
//   rt.tabs()  → { name: [[cells…]…] } the bound book's current contents; rt.drive → the files, for tests
(function (root) {
"use strict";

function makeSheet(name, rows, onRename, sheetsText) {
  const cells = rows.map(r => [...r]);
  const lastRow = () => { for (let r = cells.length; r > 0; r--) if (cells[r - 1].some(v => v !== "" && v != null)) return r; return 0; };
  const lastCol = () => cells.reduce((m, r) => { for (let c = r.length; c > 0; c--) if (r[c - 1] !== "" && r[c - 1] != null) return Math.max(m, c); return m; }, 0);
  // sheetsText (the test harness): as in Sheets, a leading apostrophe keeps text as text and isn't part of the value,
  // and "=…" would become a formula. The vault engine stores text exactly as given.
  const formulas = [];
  const put = v => { if (!sheetsText || typeof v !== "string") return v; if (v[0] === "'") return v.slice(1); if (v[0] === "=") formulas.push(v); return v; };
  const at = (r, c) => { while (cells.length < r) cells.push([]); const row = cells[r - 1]; while (row.length < c) row.push(""); return row; };
  const sh = {
    getName: () => name,
    setName(n) { const old = name; name = n; if (onRename) onRename(old, n); return sh; },
    getLastRow: lastRow,
    getLastColumn: lastCol,
    getMaxRows: () => Math.max(cells.length, 1),
    insertRowsAfter(r, n) { for (let i = 0; i < n; i++) cells.splice(r, 0, []); return sh; },
    appendRow(vals) { cells.splice(lastRow(), cells.length - lastRow()); cells.push([...vals]); return sh; },
    deleteRow(r) { cells.splice(r - 1, 1); },
    deleteRows(r, n) { cells.splice(r - 1, n); },
    clear() { cells.length = 0; return sh; },
    getRange(r, c, nr = 1, nc = 1) {
      return {
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => { const row = cells[r - 1 + i] || []; const v = row[c - 1 + j]; return v === undefined ? "" : v; })),
        getValue: () => { const row = cells[r - 1] || []; const v = row[c - 1]; return v === undefined ? "" : v; },
        setValue(v) { at(r, c)[c - 1] = put(v); return this; },
        setValues(vs) {
          if (vs.length > 1 && r + vs.length - 1 > Math.max(cells.length, 1)) throw new Error("Those rows are out of bounds."); // as Sheets does
          vs.forEach((row, i) => row.forEach((v, j) => { at(r + i, c + j)[c + j - 1] = put(v); })); return this; },
      };
    },
    _cells: cells,
    _formulas: formulas,
  };
  return sh;
}

const pad = n => String(n).padStart(2, "0");
function base64Encode(bytes) {
  const u8 = Uint8Array.from(bytes, x => x & 255);
  if (typeof Buffer !== "undefined") return Buffer.from(u8).toString("base64");
  let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function base64Decode(s) {
  if (typeof Buffer !== "undefined") return [...Buffer.from(s, "base64")];
  const b = atob(s); return Array.from(b, ch => ch.charCodeAt(0));
}
const utf8 = s => typeof TextEncoder !== "undefined" ? [...new TextEncoder().encode(s)] : [...Buffer.from(s, "utf8")];
const unutf8 = b => typeof TextDecoder !== "undefined" ? new TextDecoder().decode(Uint8Array.from(b, x => x & 255)) : Buffer.from(b).toString("utf8");

// opts.today pins "today" (tests); opts.digest(alg, str) → signed bytes, for password hashing (Node tests only)
// opts.sheetsText: store text as Sheets does (a leading apostrophe dropped, "=…" noted as a formula), for the harness
function runtime(tabs, opts) {
  opts = opts || {};
  let n = 0; const nid = p => p + (++n);
  // ── Drive: folders and files; a spreadsheet is a file too, so it can be moved and trashed ──
  const files = {}, folders = {};
  function folderApi(id) {
    const f = folders[id];
    const api = {
      getId: () => id, getName: () => f.name,
      getParents: () => iter(f.parent ? [folderApi(f.parent)] : []),
      getFoldersByName: name => iter(Object.values(folders).filter(x => x.parent === id && x.name === name).map(x => folderApi(x.id))),
      createFolder: name => { const fid = nid("fold"); folders[fid] = { id: fid, name, parent: id }; return folderApi(fid); },
      createFile: (a, content, mime) => {
        const fid = nid("file");
        files[fid] = a && a.b !== undefined ? { id: fid, name: a.n, bytes: a.b, mime: a.m, folder: id, trashed: false }
          : { id: fid, name: String(a), bytes: utf8(String(content)), mime: mime || "text/plain", folder: id, trashed: false };
        return fileApi(fid);
      },
    };
    return api;
  }
  function fileApi(id) {
    const f = files[id]; if (!f) throw new Error("No item with the given ID could be found");
    return {
      getId: () => id, getName: () => f.name, isTrashed: () => f.trashed,
      setTrashed(t) { f.trashed = !!t; if (f.book) f.book.trashed = !!t; return this; },
      getParents: () => iter(f.folder ? [folderApi(f.folder)] : []),
      moveTo(folder) { f.folder = folder.getId(); return this; },
      getBlob: () => ({ getBytes: () => f.bytes, getContentType: () => f.mime, getDataAsString: () => unutf8(f.bytes) }),
    };
  }
  const iter = list => { let i = 0; return { hasNext: () => i < list.length, next: () => list[i++] }; };
  const rootId = "root"; folders[rootId] = { id: rootId, name: "My Drive", parent: null };
  const masterFolder = folderApi(rootId).createFolder("AllWine");

  // ── Spreadsheets ──
  const books = {};
  function makeBook(tabsIn, name) {
    const id = nid("book");
    const book = { sheets: {}, order: [], id, name, trashed: false };
    const rename = (old, nw) => { book.sheets[nw] = book.sheets[old]; delete book.sheets[old]; book.order = book.order.map(x => x === old ? nw : x); };
    const add = (nm, rows) => { book.sheets[nm] = makeSheet(nm, rows || [], rename, !!opts.sheetsText); book.order.push(nm); return book.sheets[nm]; };
    Object.entries(tabsIn || {}).forEach(([nm, rows]) => add(nm, rows));
    book.api = {
      getId: () => id, getName: () => name,
      getSheetByName: nm => book.sheets[nm] || null,
      getSheets: () => book.order.map(nm => book.sheets[nm]).filter(Boolean),
      insertSheet: nm => add(nm, []),
      deleteSheet: sh => { const nm = sh.getName(); delete book.sheets[nm]; book.order = book.order.filter(x => x !== nm); },
    };
    books[id] = book;
    files[id] = { id, name, bytes: [], mime: "application/vnd.google-apps.spreadsheet", folder: masterFolder.getId(), trashed: false, book };
    return book;
  }
  const bound = makeBook(tabs, "AllWine");
  const SpreadsheetApp = {
    getActiveSpreadsheet: () => bound.api,
    openById: id => { const b = books[id]; if (!b || b.trashed) throw new Error("not found"); return b.api; },
    create: name => { const b = makeBook({ Sheet1: [] }, name); files[b.id].folder = rootId; return b.api; },
  };
  const Utilities = {
    formatDate(d, tz, fmt) {
      const isNow = opts.today && Math.abs(d.getTime() - Date.now()) < 60000;
      const [y, m, dd] = isNow ? opts.today.split("-").map(Number) : [d.getFullYear(), d.getMonth() + 1, d.getDate()];
      if (fmt === "yyyy-MM-dd") return `${y}-${pad(m)}-${pad(dd)}`;
      return `${y}-${pad(m)}-${pad(dd)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    },
    getUuid: () => (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : "u-" + nid(""),
    newBlob: (b, m, nm) => ({ b, m, n: nm }),
    base64Decode, base64Encode,
    DigestAlgorithm: { SHA_256: "sha256" }, Charset: { UTF_8: "utf8" },
    computeDigest: (alg, str) => { if (!opts.digest) throw new Error("no digest in this runtime"); return opts.digest(alg, str); },
  };
  const DriveApp = { getFileById: fileApi, getRootFolder: () => folderApi(rootId), getFolderById: folderApi };
  const ContentService = { createTextOutput: s => ({ s, setMimeType() { return this; }, getContent() { return s; } }), MimeType: { JSON: "json" } };
  const Session = { getScriptTimeZone: () => opts.tz || "Europe/Copenhagen" };
  const MimeType = { PLAIN_TEXT: "text/plain" };
  const LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
  // CacheService: values that expire after their time-to-live (opts.now lets a test move the clock)
  const cacheStore = new Map(), now = () => (opts.now ? opts.now() : Date.now());
  const scriptCache = {
    get: k => { const e = cacheStore.get(k); if (!e) return null; if (e.until <= now()) { cacheStore.delete(k); return null; } return e.v; },
    put: (k, v, ttl) => { cacheStore.set(k, { v: String(v), until: now() + 1000 * Math.min(21600, ttl || 600) }); },
    remove: k => { cacheStore.delete(k); },
  };
  const CacheService = { getScriptCache: () => scriptCache };
  return {
    book: bound, books, files,
    globals: { SpreadsheetApp, Utilities, Session, DriveApp, ContentService, MimeType, LockService, CacheService },
    tabs: (id) => { const b = id ? books[id] : bound; return Object.fromEntries(b.order.filter(nm => b.sheets[nm]).map(nm => [nm, b.sheets[nm]._cells.map(r => [...r])])); },
  };
}

const api = { makeSheet, runtime, base64Encode, base64Decode };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else root.GAS_FAKE = api;
})(typeof window !== "undefined" ? window : globalThis);
