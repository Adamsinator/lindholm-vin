// Export of a cellar to a file the browser saves: an Excel workbook (.xlsx: cellar, journal and wishlist as sheets) or
// a CSV of the cellar. The columns are the owner's sheet layout, so an exported file imports straight back (import.js).
// Built here from the decrypted data; nothing goes to the server.
//
//   EXPORT.cellar(rawWines) / .journal(entries) / .wishlist(items)  → [[heading…], [cell…]…]
//   EXPORT.xlsx([{ name, rows }])  → Uint8Array          EXPORT.csv(rows)  → string (";" and decimal commas, as Danish Excel)
// A cell is a string, a number, or {date: "YYYY-MM-DD"}.
(function (root) {
"use strict";

const CELLAR = [["producer", "Producent"], ["country", "Land"], ["region", "Område"], ["commune", "Kommune"], ["name", "Mark/Navn"],
  ["classification", "Klassifikation"], ["type", "Type"], ["grape", "Drue"], ["vintage", "Årgang"], ["qty", "Antal"], ["price", "Pris kr (WS)"],
  ["drunk", "Drukket"], ["source", "Kilde"], ["note", "Note"], ["rating", "Rating"], ["value", "Værdi kr"], ["acquired", "Anskaffet"],
  ["drunkDate", "Drukket dato"], ["size", "Størrelse"], ["drinkFrom", "Drik fra"], ["drinkTo", "Drik til"], ["elsewhere", "Drukket ude"], ["location", "Placering"]];
const JOURNAL = [["date", "Dato"], ["producer", "Producent"], ["wine", "Vin"], ["vintage", "Årgang"], ["country", "Land"], ["region", "Område"],
  ["commune", "Kommune"], ["classification", "Klassifikation"], ["grape", "Drue"], ["place", "Sted"], ["rating", "Rating"], ["price", "Pris"], ["note", "Note"]];
const WISH = [["producer", "Producent"], ["wine", "Vin"], ["vintage", "Årgang"], ["region", "Område"], ["price", "Målpris kr"], ["note", "Note"]];
const DATES = new Set(["acquired", "drunkDate", "date"]);
const NUMS = new Set(["qty", "price", "drunk", "rating", "value", "drinkFrom", "drinkTo"]);

function cell(f, v) {
  if (v === null || v === undefined || v === "") return "";
  if (DATES.has(f)) { const s = String(v).slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? { date: s } : s; }
  if (f === "vintage") return /^\d{4}$/.test(String(v).trim()) ? Number(v) : String(v).trim();
  if (NUMS.has(f)) { const n = Number(v); return isFinite(n) ? n : String(v); }
  return String(v).trim();
}
const table = (cols, list, fix) => [cols.map(c => c[1]), ...(list || []).map(x => { x = fix ? fix(x) : x; return cols.map(([f]) => cell(f, x[f])); })];
const cellar = wines => table(CELLAR, wines, w => {
  const qty = Number(w.qty) || 1;
  const d = String(w.drunk).trim().toLowerCase() === "x" ? qty : Math.min(qty, Number(w.drunk) || 0);
  return Object.assign({}, w, { qty, drunk: d || "", elsewhere: w.elsewhere ? 1 : "" });
});
const journal = entries => table(JOURNAL, entries);
const wishlist = items => table(WISH, items);

// ── CSV ─────────────────────────────────────────────────────────────────────────
// Semicolons and decimal commas, so a Danish Excel opens it in columns; a BOM so it reads the file as UTF-8.
function csv(rows) {
  const q = c => {
    if (c && typeof c === "object") return c.date;
    if (typeof c === "number") return String(c).replace(".", ",");
    let s = String(c);
    if (/^[=+@]/.test(s)) s = "'" + s; // a spreadsheet would run it as a formula
    return /[";\r\n]/.test(s) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return "﻿" + rows.map(r => r.map(q).join(";")).join("\r\n") + "\r\n";
}

// ── xlsx ────────────────────────────────────────────────────────────────────────
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
// a zip of stored (uncompressed) entries: all an .xlsx needs, and no compressor to ship
function zip(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  let off = 0;
  const now = new Date(), dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1),
    dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const [name, text] of files) {
    const data = enc.encode(text), nb = enc.encode(name), crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(10, dosTime, true); h.setUint16(12, dosDate, true);
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nb.length, true);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(12, dosTime, true); c.setUint16(14, dosDate, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nb.length, true); c.setUint32(42, off, true);
    parts.push(new Uint8Array(h.buffer), nb, data); central.push(new Uint8Array(c.buffer), nb);
    off += 30 + nb.length + data.length;
  }
  const cdSize = central.reduce((s, a) => s + a.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(e.buffer)];
  const out = new Uint8Array(all.reduce((s, a) => s + a.length, 0));
  let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}
const xml = s => String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const colRef = c => { let s = ""; c++; while (c) { s = String.fromCharCode(65 + (c - 1) % 26) + s; c = Math.floor((c - 1) / 26); } return s; };
const serial = iso => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d) / 86400000 + 25569; };
function sheetXml(rows) {
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const widths = Array.from({ length: width }, (_, c) => Math.min(48, Math.max(8, ...rows.slice(0, 400).map(r => {
    const v = r[c]; return v && typeof v === "object" ? 11 : String(v == null ? "" : v).length + 2;
  }))));
  const body = rows.map((r, i) => {
    const cells = r.map((v, c) => {
      const ref = colRef(c) + (i + 1), s = i === 0 ? ' s="2"' : "";
      if (v === "" || v === null || v === undefined) return "";
      if (typeof v === "number" && isFinite(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`;
      if (v && typeof v === "object" && /^\d{4}-\d{2}-\d{2}$/.test(v.date)) return `<c r="${ref}" s="1"><v>${serial(v.date)}</v></c>`;
      return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xml(v && typeof v === "object" ? v.date : v)}</t></is></c>`;
    }).join("");
    return `<row r="${i + 1}">${cells}</row>`;
  }).join("");
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    + (width ? `<cols>${widths.map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "")
    + `<sheetData>${body}</sheetData></worksheet>`;
}
function xlsx(sheets) {
  const used = new Set();
  const names = sheets.map((s, i) => {
    let n = String(s.name || "Sheet " + (i + 1)).replace(/[\[\]:*?\/\\]/g, " ").slice(0, 31).trim() || "Sheet " + (i + 1);
    while (used.has(n.toLowerCase())) n = n.slice(0, 28) + " " + (i + 1);
    used.add(n.toLowerCase()); return n;
  });
  const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const files = [
    ["[Content_Types].xml", head + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + names.map((n, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")
      + "</Types>"],
    ["_rels/.rels", head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ["xl/workbook.xml", head + `<workbook ${NS} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>`
      + names.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") + "</sheets></workbook>"],
    ["xl/_rels/workbook.xml.rels", head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + names.map((n, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")
      + `<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    // styles: 0 normal, 1 date (built-in format 14), 2 bold heading
    ["xl/styles.xml", head + `<styleSheet ${NS}><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>`
      + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
      + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
      + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>'],
    ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s.rows || [])]),
  ];
  return zip(files);
}

const api = { cellar, journal, wishlist, csv, xlsx, crc32 };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else root.EXPORT = api;
})(typeof window !== "undefined" ? window : globalThis);
