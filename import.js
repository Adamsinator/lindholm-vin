// Bulk import of a cellar list: reads an Excel workbook (.xlsx), a CSV or a text file in the browser, finds the header
// row, guesses which column is which (Danish, English and French headings, plus the usual cellar-app exports), and
// turns each row into a wine for the 'addmany' action. Nothing is uploaded as a file: the rows go through the same
// path as "Add wine", so an encrypted cellar stays encrypted.
//
//   const book = await IMPORT.read(file)                 → { kind, sheets: [{ name, rows: [[cell…]…] }] }
//   const t = IMPORT.table(book.sheets[0].rows)          → { header: row index or -1, columns: [{ label, field, sample }] }
//   const r = IMPORT.build(rows, t.header, fields)       → { wines: [...], skipped: {noProducer, zero} }
//   const d = IMPORT.dedupe(r.wines, existingWines)      → { fresh, dupes: [{ wine, row }] }
// A cell is a string, number, boolean, or {date: "YYYY-MM-DD", serial} for an Excel cell formatted as a date.
(function (root) {
"use strict";

const MAX_FILE = 20 * 1024 * 1024;   // bytes
const MAX_PART = 200 * 1024 * 1024;  // uncompressed size of one part of a workbook (a zip bomb guard)
const MAX_ROWS = 25000;

// ── zip (just enough for .xlsx) ─────────────────────────────────────────────────
async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== "undefined") {
    const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  return new Uint8Array(require("zlib").inflateRawSync(bytes));
}
function unzip(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("not-zip");
  const n = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = {};
  const dec = new TextDecoder("utf-8");
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("bad-zip");
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
    p += 46 + nl + xl + cl;
    if (csize === 0xffffffff || usize > MAX_PART) throw new Error("too-big");
    const data = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
    const raw = u8.subarray(data, data + csize);
    files[name.replace(/^\/+/, "")] = async () => {
      if (method === 0) return raw;
      if (method === 8) return inflateRaw(raw);
      throw new Error("zip-method");
    };
  }
  return files;
}

// ── xlsx ────────────────────────────────────────────────────────────────────────
const ENT = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
const unxml = s => String(s).replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) =>
  e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENT[e] !== undefined ? ENT[e] : m));
const attrs = s => { const a = {}; String(s).replace(/([\w:]+)\s*=\s*("([^"]*)"|'([^']*)')/g, (m, k, v, d, q) => { a[k] = unxml(d !== undefined ? d : q); }); return a; };
const texts = s => { let out = ""; String(s).replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").replace(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g, (m, t) => { out += t ? unxml(t) : ""; }); return out; };
const colNum = ref => { let n = 0; for (const ch of String(ref).replace(/\d+$/, "")) n = n * 26 + (ch.toUpperCase().charCodeAt(0) - 64); return n - 1; };
const DATE_FMT = new Set([14, 15, 16, 17, 22, 27, 30, 36, 45, 46, 47, 50, 57]);
function isDateFormat(code) {
  const c = String(code).replace(/"[^"]*"|\\.|\[[^\]]*\]/g, ""); // quoted text, escapes, [colours]/[conditions]
  return /[dy]/i.test(c) || (/m/i.test(c) && !/[#0?]/.test(c));
}
function serialDate(n, d1904) {
  const ms = Math.round((n - (d1904 ? 24107 : 25569)) * 86400000);
  const d = new Date(ms); if (isNaN(d)) return "";
  return d.toISOString().slice(0, 10);
}
async function readXlsx(buf) {
  const z = unzip(buf), dec = new TextDecoder("utf-8");
  // some writers prefix every tag (<x:row>, <x:c>); attributes like r:id keep theirs
  const text = async name => z[name] ? dec.decode(await z[name]()).replace(/<(\/?)[A-Za-z][\w.-]*:(?=[A-Za-z])/g, "<$1") : "";
  const wb = await text("xl/workbook.xml");
  if (!wb) throw new Error("not-xlsx");
  const d1904 = /<workbookPr\b[^>]*date1904\s*=\s*"(1|true)"/i.test(wb);
  const rels = {};
  (await text("xl/_rels/workbook.xml.rels")).replace(/<Relationship\b([^>]*)\/?>/g, (m, a) => { const r = attrs(a); rels[r.Id] = r.Target; });
  const shared = [];
  (await text("xl/sharedStrings.xml")).replace(/<si\b[^>]*>([\s\S]*?)<\/si>/g, (m, s) => { shared.push(texts(s)); });
  const styles = await text("xl/styles.xml"), fmts = {};
  styles.replace(/<numFmt\b([^>]*)\/?>/g, (m, a) => { const r = attrs(a); fmts[r.numFmtId] = r.formatCode; });
  const xfDate = [];
  const cx = (styles.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/) || [])[1] || "";
  cx.replace(/<xf\b([^>]*?)\/?>/g, (m, a) => { const id = Number(attrs(a).numFmtId || 0); xfDate.push(DATE_FMT.has(id) || (id >= 164 && isDateFormat(fmts[id] || ""))); });
  const sheets = [];
  const list = [];
  wb.replace(/<sheet\b([^>]*)\/?>/g, (m, a) => { list.push(attrs(a)); });
  for (const s of list) {
    let target = rels[s["r:id"]] || "";
    target = target.startsWith("/") ? target.slice(1) : "xl/" + target.replace(/^\.\//, "");
    const xml = await text(target);
    if (!xml) continue;
    const rows = [];
    let rn = 0;
    xml.replace(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g, (m, ra, body) => {
      const r = attrs(ra); rn = r.r ? Number(r.r) - 1 : rn;
      if (rn >= MAX_ROWS + 50) return;
      const cells = [];
      let cn = 0;
      String(body || "").replace(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, (m2, ca, cb) => {
        const a = attrs(ca); cn = a.r ? colNum(a.r) : cn;
        const v = ((cb || "").match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        let val = "";
        if (a.t === "s") val = shared[Number(v)] !== undefined ? shared[Number(v)] : "";
        else if (a.t === "inlineStr") val = texts(cb || "");
        else if (a.t === "str" || a.t === "e") val = a.t === "e" ? "" : unxml(v || "");
        else if (a.t === "b") val = v === "1";
        else if (a.t === "d") val = { date: String(v || "").slice(0, 10), serial: null };
        else if (v !== undefined && v !== "") {
          const num = Number(v);
          val = xfDate[Number(a.s || 0)] ? { date: serialDate(num, d1904), serial: num } : num;
        }
        cells[cn] = val; cn++;
      });
      for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = "";
      rows[rn] = cells; rn++;
    });
    for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
    sheets.push({ name: s.name || "Sheet " + (sheets.length + 1), rows, hidden: s.state === "hidden" || s.state === "veryHidden" });
  }
  return { kind: "xlsx", sheets };
}

// ── CSV / text ──────────────────────────────────────────────────────────────────
function decodeText(u8) {
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder("utf-16le").decode(u8.subarray(2));
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder("utf-16be").decode(u8.subarray(2));
  try { return new TextDecoder("utf-8", { fatal: true }).decode(u8).replace(/^﻿/, ""); }
  catch (e) { return new TextDecoder("windows-1252").decode(u8); } // Excel's "CSV" on a Danish Windows
}
function splitDelimited(text, d) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += ch;
    } else if (ch === '"' && cell === "") q = true;
    else if (ch === d) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
      if (rows.length > MAX_ROWS + 50) return rows;
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
function sniff(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 30);
  let best = null, score = 0;
  for (const d of ["\t", ";", ",", "|"]) {
    const counts = lines.map(l => splitDelimited(l, d)[0].length - 1);
    const freq = {}; counts.forEach(c => { if (c > 0) freq[c] = (freq[c] || 0) + 1; });
    const top = Object.entries(freq).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    if (!top) continue;
    const s = top[1] + Math.min(Number(top[0]), 20) / 100; // lines agreeing, then more columns
    if (s > score) { score = s; best = d; }
  }
  return lines.length && score >= Math.max(1, lines.length * 0.5) ? best : null;
}
function readText(u8, name) {
  const text = decodeText(u8);
  const d = sniff(text);
  if (!d) return { kind: "lines", sheets: [{ name, rows: text.split(/\r?\n/).filter(l => l.trim()).slice(0, MAX_ROWS + 50).map(l => [l.trim()]) }] };
  return { kind: d === "\t" ? "tsv" : "csv", delimiter: d, sheets: [{ name, rows: splitDelimited(text, d) }] };
}

async function read(file) {
  if (file.size > MAX_FILE) throw new Error("too-big");
  const buf = new Uint8Array(await file.arrayBuffer());
  const name = String(file.name || "");
  const zip = buf[0] === 0x50 && buf[1] === 0x4b;
  if (zip || /\.xlsx$|\.xlsm$/i.test(name)) {
    if (!zip) throw new Error("not-xlsx");
    return readXlsx(buf);
  }
  if (buf[0] === 0xd0 && buf[1] === 0xcf) throw new Error("old-xls");     // Excel 97–2003 (.xls)
  if (/\.(xls|numbers|ods)$/i.test(name)) throw new Error("old-xls");
  return readText(buf, name.replace(/\.[^.]+$/, "") || "file");
}

// ── columns ─────────────────────────────────────────────────────────────────────
const norm = s => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/æ/g, "ae").replace(/ø/g, "o").replace(/å/g, "a").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, " ").trim();
// The fields a column can fill. "left" (bottles still there) and "window" ("2025–2035") are turned into qty/drunk and
// drinkFrom/drinkTo; "line" is a whole wine written as one line of text.
const FIELDS = ["producer", "name", "commune", "region", "country", "classification", "type", "grape", "vintage", "qty",
  "left", "drunk", "price", "value", "source", "note", "rating", "acquired", "drunkDate", "size", "drinkFrom", "drinkTo", "window", "elsewhere", "location", "line"];
const TEXT_FIELDS = new Set(["producer", "name", "commune", "region", "country", "classification", "type", "grape", "source", "note", "location"]);
const SYN = {
  producer: ["weingut", "winzer", "produzent", "hersteller", "producent", "producer", "producteur", "produttore", "productor", "erzeuger", "winery", "vinhus", "domaine", "domain", "estate", "maker", "house", "chateau", "vingard", "vigneron", "brand"],
  name: ["wein", "weinname", "lage", "bezeichnung", "mark navn", "mark", "navn", "name", "wine", "wine name", "vin", "vinnavn", "vinens navn", "cuvee", "vineyard", "climat", "lieu dit", "designation", "label", "betegnelse", "nom", "nom du vin", "etiket"],
  commune: ["gemeinde", "ort", "dorf", "kommune", "commune", "village", "landsby", "appellation", "aoc", "aop", "sub appellation", "cru village"],
  region: ["anbaugebiet", "gebiet", "weinregion", "weinbaugebiet", "omrade", "region", "area", "wine region", "vinomrade", "distrikt", "district"],
  country: ["herkunftsland", "land", "country", "pays", "nation", "origin", "oprindelsesland"],
  classification: ["qualitatsstufe", "pradikat", "einstufung", "klassifikation", "classification", "class", "klasse", "cru", "rang", "level", "kvalitet", "quality", "niveau"],
  type: ["weinart", "art", "weinfarbe", "type", "farve", "color", "colour", "couleur", "style", "stil", "wine type", "vintype", "kind"],
  grape: ["rebsorte", "rebsorten", "traube", "trauben", "drue", "druer", "grape", "grapes", "varietal", "variety", "varietals", "cepage", "cepages", "druesort", "drueart", "blend"],
  vintage: ["argang", "vintage", "year", "millesime", "annee", "aar", "ar", "annata", "jahrgang"],
  qty: ["anzahl", "menge", "stuck", "anzahl flaschen", "antal", "qty", "quantity", "bottles", "flasker", "antal flasker", "count", "number", "stk", "nombre", "quantite", "units", "fl", "bouteilles", "purchased"],
  left: ["bestand", "vorrat", "ubrig", "noch da", "im keller", "tilbage", "remaining", "left", "on hand", "beholdning", "i kaelder", "in cellar", "in stock", "stock", "restant", "bottles left", "flasker tilbage"],
  drunk: ["getrunken", "geoffnet", "drukket", "drunk", "consumed", "opened", "abnet", "bu", "bues", "drukne"],
  price: ["preis", "einkaufspreis", "kaufpreis", "preis pro flasche", "pris", "price", "pris kr", "pris kr ws", "cost", "kostpris", "indkobspris", "prix", "purchase price", "paid", "bottle price", "pris pr flaske", "my price", "wine price"],
  value: ["wert", "marktwert", "aktueller wert", "vaerdi", "vaerdi kr", "value", "valuation", "market value", "current value", "valeur", "est value", "estimated value", "auction value"],
  source: ["handler", "bezugsquelle", "gekauft bei", "lieferant", "weinhandler", "kilde", "source", "bought at", "kobt hos", "store", "shop", "merchant", "supplier", "leverandor", "forhandler", "vendor", "retailer", "fournisseur", "caviste", "importer", "importor"],
  note: ["notiz", "notizen", "bemerkung", "bemerkungen", "verkostungsnotiz", "note", "noter", "notes", "comment", "comments", "kommentar", "kommentarer", "bemaerkning", "bemaerkninger", "remarks", "description", "beskrivelse", "your review", "my notes", "tasting note", "tasting notes", "smagsnote"],
  rating: ["bewertung", "punkte", "meine bewertung", "rating", "score", "points", "point", "karakter", "bedommelse", "my rating", "your rating", "my score", "personal rating"],
  acquired: ["gekauft am", "kaufdatum", "erworben", "erworben am", "anskaffet", "acquired", "purchased on", "purchase date", "date purchased", "bought", "kobt", "kobsdato", "kobt dato", "indkobt", "date achat", "date d achat", "added"],
  drunkDate: ["getrunken am", "trinkdatum", "drukket dato", "drunk date", "date drunk", "consumed date", "consumption date", "drukket den", "date bu", "opened on", "date opened", "last drunk"],
  size: ["flaschengrosse", "grosse", "inhalt", "storrelse", "size", "format", "bottle size", "flaskestorrelse", "volume", "cl", "contenance", "taille", "flaske"],
  drinkFrom: ["trinken ab", "trinkreif ab", "drik fra", "drink from", "begin consume", "beginconsume", "ready from", "drinking window start", "drink window from", "from", "fra", "start", "a partir de", "apogee debut"],
  drinkTo: ["trinken bis", "haltbar bis", "drik til", "drink to", "drink by", "end consume", "endconsume", "drink before", "drinking window end", "drink window to", "until", "til", "end", "jusqu a", "apogee fin"],
  location: ["placering", "location", "lokation", "plads", "bin", "hylde", "reol", "rack", "shelf", "cellar location", "storage", "opbevaring",
    "emplacement", "casier", "rangement", "lagerort", "standort", "fach", "regal", "lagerplatz", "where", "hvor"],
  elsewhere: ["drukket ude", "drunk elsewhere", "elsewhere", "not from cellar", "bu ailleurs"],
  window: ["trinkfenster", "trinkreife", "drikkevindue", "drink window", "drinking window", "window", "vindue", "fenetre", "fenetre de degustation", "apogee", "drink"],
};
// headings that look like a field but aren't (Vivino's community average, CellarTracker's community score, links…)
const IGNORE = new Set(["average rating", "community score", "ct score", "link to wine", "label image", "scan date", "id", "iwine", "barcode", "image", "photo", "foto", "link", "url", "regional wine style", "sub region", "subregion"]);
const LOOKUP = {}; for (const [f, list] of Object.entries(SYN)) list.forEach((s, i) => { if (!(s in LOOKUP)) LOOKUP[s] = { f, i }; });

function matchHeader(label) {
  const a = norm(label), b = norm(String(label).replace(/\([^)]*\)/g, ""));
  if (!a || IGNORE.has(a) || IGNORE.has(b)) return null;
  for (const h of [a, b]) if (LOOKUP[h]) return { field: LOOKUP[h].f, score: 100 - LOOKUP[h].i };
  // containment: every word of a synonym appears in the heading ("Antal flasker i alt" → qty)
  const words = new Set(a.split(" "));
  let best = null;
  for (const [s, { f }] of Object.entries(LOOKUP)) {
    const sw = s.split(" ");
    if (sw.length === 1 && s.length < 4) continue;
    if (sw.every(w => words.has(w))) { const sc = 10 + s.length; if (!best || sc > best.score) best = { field: f, score: sc }; }
  }
  if (best) return best;
  // a typo in the heading ("Producnet", "Vintgae", "Pirce"): one slip in a short word, two in a long one, and only
  // if every close heading points to the same field
  if (a.length < 5) return null;
  const max = a.length < 9 ? 1 : 2;
  let d0 = max + 1, field = null, tie = false;
  for (const [s, { f }] of Object.entries(LOOKUP)) {
    if (s.length < 5 || Math.abs(s.length - a.length) > max) continue;
    const d = osa(a, s);
    if (d < d0) { d0 = d; field = f; tie = false; } else if (d === d0 && f !== field) tie = true;
  }
  return d0 <= max && !tie ? { field, score: 5 - d0 } : null;
}
// edit distance with swapped neighbours counting as one slip
function osa(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}
// a spreadsheet's error values (#N/A, #REF! …) are empty cells
const XL_ERROR = /^#(N\/A|REF!|VALUE!|DIV\/0!|NAME\?|NUM!|NULL!|SPILL!|CALC!|FIELD!|BLOCKED!|GETTING_DATA)$/i;
const cellStr = c => c == null ? "" : typeof c === "object" ? (c.date || "") : (s => XL_ERROR.test(s) ? "" : s)(String(c).trim().replace(/^'(?=[=+@])/, ""));
// a row that sums the others ("Total", "I alt", "Summe") isn't a wine
const TOTAL = /^(total|totals|totalt|sum|summe|sum total|i alt|ialt|alt i alt|gesamt|insgesamt|total general|grand total|subtotal|sous total|zwischensumme|in all)\b/;
const looksYear = c => { const n = typeof c === "number" ? c : (/^\d{4}$/.test(cellStr(c)) ? Number(cellStr(c)) : NaN); return n >= 1900 && n <= 2100; };

// Which row is the header, and which field each column fills.
function table(rows) {
  rows = rows || [];
  let header = -1, bestHits = 1;
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const hits = (rows[r] || []).filter(c => typeof c === "string" && matchHeader(c)).length;
    if (hits > bestHits) { bestHits = hits; header = r; }
  }
  const width = rows.reduce((m, r) => Math.max(m, (r || []).length), 0);
  const body = rows.slice(header + 1).filter(r => (r || []).some(c => cellStr(c) !== ""));
  const columns = [];
  for (let c = 0; c < width; c++) {
    const label = header >= 0 ? cellStr(rows[header][c]) : "";
    const sample = body.map(r => cellStr(r[c])).filter(Boolean).slice(0, 3);
    columns.push({ label: label || colName(c), field: "", sample, match: header >= 0 ? matchHeader(label) : null });
  }
  // each field goes to its best column, best matches first
  const taken = new Set();
  columns.map((col, i) => ({ i, m: col.match })).filter(x => x.m).sort((x, y) => y.m.score - x.m.score)
    .forEach(({ i, m }) => { if (!taken.has(m.field) || m.field === "location") { taken.add(m.field); columns[i].field = m.field; } });
  // a list without headings: one text column is a list of wines, a column of years is the vintage
  if (header < 0) {
    if (width === 1) columns[0].field = "line";
    else columns.forEach(col => { if (!taken.has("vintage") && col.sample.length && body.slice(0, 20).every(r => !cellStr(r[columns.indexOf(col)]) || looksYear(r[columns.indexOf(col)]))) { col.field = "vintage"; taken.add("vintage"); } });
  }
  columns.forEach(c => delete c.match);
  return { header, columns, rows: body.length };
}
const colName = c => { let s = ""; c++; while (c) { s = String.fromCharCode(65 + (c - 1) % 26) + s; c = Math.floor((c - 1) / 26); } return s; };

// ── values ──────────────────────────────────────────────────────────────────────
function num(c) {
  if (typeof c === "number") return isFinite(c) ? c : null;
  if (typeof c === "boolean" || c == null || typeof c === "object") return null;
  let s = String(c).toLowerCase().replace(/ |\s/g, "").replace(/kr\.?|dkk|eur|€|\$|usd|£|gbp|sek|nok|chf|,-|\.-$/g, "");
  if (!/\d/.test(s)) return null;
  s = s.replace(/[^0-9.,-]/g, "");
  const lc = s.lastIndexOf(","), ld = s.lastIndexOf(".");
  if (lc >= 0 && ld >= 0) s = lc > ld ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (lc >= 0) s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  else if (ld >= 0 && /^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}
function vintage(c) {
  if (c && typeof c === "object") return c.serial >= 1800 && c.serial <= 2100 ? c.serial : Number(String(c.date).slice(0, 4)) || "";
  if (typeof c === "number") return c === 1001 ? "NV" : (c >= 1800 && c <= 2100 ? Math.round(c) : "");
  const s = cellStr(c);
  if (s === "1001") return "NV"; // CellarTracker's NV
  if (/^(n\.?\s?v\.?|non[- ]?vintage|sans annee|uden argang|uden årgang|ingen|-)$/i.test(s)) return "NV";
  const m = s.match(/\b(1[89]\d\d|20\d\d)\b/);
  return m ? Number(m[1]) : (/^\s*nv\b/i.test(s) ? "NV" : "");
}
function isoDate(c) {
  if (c && typeof c === "object") return c.date || "";
  if (typeof c === "number") return c > 20000 && c < 80000 ? serialDate(c, false) : (c >= 1900 && c <= 2100 ? c + "-01-01" : "");
  const s = cellStr(c);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
  if (m) {
    let d = Number(m[1]), mo = Number(m[2]); const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    if (mo > 12 && d <= 12) [d, mo] = [mo, d]; // 12/24/2025
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return "";
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  m = s.match(/^(1[89]\d\d|20\d\d)$/);
  return m ? m[1] + "-01-01" : "";
}
const NONE = /^(unknown|n\/a|na|-|–|—|ukendt|inconnu|none|ingen)$/i; // placeholders some apps export
const yes = s => /^(x|ja|j|yes|y|oui|true|1|✓|✔|drukket|drunk)$/i.test(String(s).trim());
const has = (s, words) => words.some(w => new RegExp("\\b" + w + "\\b").test(s));
function wineType(c) {
  const s = norm(c);
  if (!s) return "";
  if (has(s, ["mousserende", "sparkling", "champagne", "cremant", "cava", "prosecco", "bobler", "petillant", "sekt", "spumante", "franciacorta", "mousseux", "petnat", "pet nat", "fizz", "perlwein", "schaumwein"])) return "Bobler";
  if (has(s, ["rose", "rosado", "rosato", "rosevin", "blush"])) return "Rose";
  if (has(s, ["rod", "rodvin", "red", "rouge", "rosso", "tinto", "rot", "rotwein"])) return "Rød";
  if (has(s, ["hvid", "hvidvin", "white", "blanc", "bianco", "blanco", "weiss", "weisswein", "branco"])) return "Hvid";
  const t = cellStr(c);
  return t.charAt(0).toUpperCase() + t.slice(1);
}
const COUNTRY = { france: "Frankrig", frankreich: "Frankrig", frankrig: "Frankrig", italy: "Italien", italie: "Italien", italia: "Italien", italien: "Italien",
  spain: "Spanien", espagne: "Spanien", espana: "Spanien", spanien: "Spanien", germany: "Tyskland", allemagne: "Tyskland", deutschland: "Tyskland", tyskland: "Tyskland",
  portugal: "Portugal", austria: "Østrig", autriche: "Østrig", osterreich: "Østrig", ostrig: "Østrig", "united states": "USA", usa: "USA", us: "USA", "etats unis": "USA",
  australia: "Australien", australie: "Australien", australien: "Australien", "new zealand": "New Zealand", "nouvelle zelande": "New Zealand",
  "south africa": "Sydafrika", "afrique du sud": "Sydafrika", sydafrika: "Sydafrika", argentina: "Argentina", argentine: "Argentina", chile: "Chile", chili: "Chile",
  hungary: "Ungarn", hongrie: "Ungarn", ungarn: "Ungarn", greece: "Grækenland", grece: "Grækenland", graekenland: "Grækenland", lebanon: "Libanon", liban: "Libanon",
  switzerland: "Schweiz", suisse: "Schweiz", schweiz: "Schweiz", england: "England", "united kingdom": "England", uk: "England", slovenia: "Slovenien", slovenie: "Slovenien",
  neuseeland: "New Zealand", sudafrika: "Sydafrika", griechenland: "Grækenland", "vereinigte staaten": "USA",
  georgia: "Georgien", georgie: "Georgien", croatia: "Kroatien", croatie: "Kroatien", canada: "Canada", israel: "Israel", denmark: "Danmark", danemark: "Danmark", danmark: "Danmark" };
const REGION = { burgundy: "Bourgogne", bourgogne: "Bourgogne", burgund: "Bourgogne", bordeaux: "Bordeaux", champagne: "Champagne", rhone: "Rhône", "rhone valley": "Rhône",
  "northern rhone": "Rhône", "southern rhone": "Rhône", "vallee du rhone": "Rhône", loire: "Loire", "loire valley": "Loire", "vallee de la loire": "Loire",
  alsace: "Alsace", beaujolais: "Beaujolais", jura: "Jura", savoie: "Savoie", savoy: "Savoie", languedoc: "Languedoc", "languedoc roussillon": "Languedoc",
  elsass: "Alsace", toskana: "Toscana", rhonetal: "Rhône",
  provence: "Provence", piedmont: "Piemonte", piemonte: "Piemonte", piemont: "Piemonte", tuscany: "Toscana", toscana: "Toscana", toscane: "Toscana", mosel: "Mosel", moselle: "Mosel" };
const BURGUNDY_SUB = /^(cote de nuits|cote de beaune|cote d or|cote chalonnaise|maconnais|chablis|hautes cotes)/;
function classification(c) {
  const s = norm(c);
  if (!s) return "";
  if (/^(1er|1 er|premier|1|pc)( cru)?$|^1 cru$|^premier cru|^1er cru/.test(s)) return "1. cru";
  if (/^(grand cru|gc)$|^grand cru/.test(s)) return "Grand cru";
  if (/^(village|villages|aoc|aop|ac|regional|regionale)$/.test(s)) return "AOC";
  return cellStr(c);
}
const SIZES = [[18.75, "Piccolo"], [37.5, "Half"], [75, ""], [150, "Magnum"], [300, "Jeroboam"], [450, "Rehoboam"], [600, "Methuselah"], [900, "Salmanazar"], [1200, "Balthazar"], [1500, "Nebuchadnezzar"]];
const SIZE_WORD = { magnum: "Magnum", jeroboam: "Jeroboam", "double magnum": "Jeroboam", "dobbelt magnum": "Jeroboam", dobbeltmagnum: "Jeroboam", rehoboam: "Rehoboam",
  methuselah: "Methuselah", mathusalem: "Methuselah", imperial: "Methuselah", imperiale: "Methuselah", salmanazar: "Salmanazar", balthazar: "Balthazar",
  nebuchadnezzar: "Nebuchadnezzar", nabuchodonosor: "Nebuchadnezzar", half: "Half", halv: "Half", halvflaske: "Half", demi: "Half", "half bottle": "Half",
  "demi bouteille": "Half", piccolo: "Piccolo", split: "Piccolo", quart: "Piccolo", bottle: "", flaske: "", standard: "", normal: "", bouteille: "" };
function size(c) {
  const s = norm(c);
  if (!s) return "";
  if (s in SIZE_WORD) return SIZE_WORD[s];
  const raw = cellStr(c).toLowerCase().replace(",", ".");
  const m = raw.match(/(\d+(?:\.\d+)?)\s*(ml|cl|l|ltr|liter|litre)?\b/);
  if (!m) { for (const [w, v] of Object.entries(SIZE_WORD)) if (w.length > 4 && s.includes(w)) return v; return ""; }
  let n = Number(m[1]); const u = m[2] || "";
  const cl = u === "ml" ? n / 10 : u === "cl" ? n : u ? n * 100 : n < 20 ? n * 100 : n < 200 ? n : n / 10;
  let best = null;
  for (const [v, k] of SIZES) if (Math.abs(v - cl) / v < 0.08) best = k;
  return best === null ? "" : best;
}
function windowYears(c) {
  const s = cellStr(c);
  const m = s.match(/(\d{4})\s*(?:-|–|—|to|til|à|a|\/)\s*(\d{2,4})/i);
  if (m) { const a = Number(m[1]); let b = Number(m[2]); if (b < 100) b = Math.floor(a / 100) * 100 + b; return [a, b]; }
  const y = s.match(/\b(19\d\d|20\d\d)\b/);
  return y ? [Number(y[1]), ""] : ["", ""];
}
// "3 x Domaine Roulot – Meursault Perrières 2020", "Roulot, Meursault 2020 (2 fl)"
function parseLine(s) {
  s = String(s || "").trim();
  const w = {};
  let m = s.match(/^(\d{1,3})\s*(?:x|×|stk\.?|fl\.?|btl\.?|bottles?|flasker)\s+/i) || s.match(/^(\d{1,3})\s+(?=\D)/);
  if (m && Number(m[1]) < 1800) { w.qty = Number(m[1]); s = s.slice(m[0].length); }
  m = s.match(/[\s(,]*(?:x\s*(\d{1,3})|(\d{1,3})\s*(?:x|×|stk\.?|fl\.?|btl\.?|bottles?|flasker))\)?\s*$/i);
  if (m) { w.qty = Number(m[1] || m[2]); s = s.slice(0, m.index); }
  m = s.match(/\b(1[89]\d\d|20\d\d)\b|\bN\.?V\.?\b/i);
  if (m) { w.vintage = /^n/i.test(m[0]) ? "NV" : Number(m[1]); s = (s.slice(0, m.index) + " " + s.slice(m.index + m[0].length)); }
  s = s.replace(/\s+/g, " ").replace(/[\s,;:–—-]+$/, "").trim();
  const sep = s.match(/\s[–—-]\s|,\s*|:\s+|\s\|\s/);
  if (sep) { w.producer = s.slice(0, sep.index).trim(); w.name = s.slice(sep.index + sep[0].length).trim(); }
  else w.producer = s;
  return w;
}

// ── rows → wines ────────────────────────────────────────────────────────────────
// fields[i] is the field column i fills ("" to leave it out). Several columns on one text field are joined.
function build(rows, header, fields) {
  const body = (rows || []).slice(header + 1);
  const col = f => fields.map((x, i) => x === f ? i : -1).filter(i => i >= 0);
  const one = f => col(f)[0];
  const at = (r, f) => { const i = one(f); return i === undefined ? undefined : r[i]; };
  // ratings may be on a 5-point (Vivino) or 100-point scale; the site uses 1–10
  const rIdx = one("rating");
  const rMax = rIdx === undefined ? 0 : body.reduce((m, r) => Math.max(m, num(r[rIdx]) || 0), 0);
  // …except the site's own "Rating" column (an exported cellar), which is 1–10 already
  const own = rIdx !== undefined && header >= 0 && norm(cellStr((rows[header] || [])[rIdx])) === "rating";
  const rScale = v => rMax > 10 ? Math.max(1, Math.min(10, (v - 50) / 5)) : rMax <= 5 && !own ? v * 2 : v;
  const wines = [], skipped = { noProducer: 0, zero: 0, totals: 0, headers: 0 };
  const headKey = header >= 0 ? (rows[header] || []).map(c => norm(cellStr(c))).join("|") : null;
  body.forEach((r, n) => {
    r = r || [];
    if (!r.some(c => cellStr(c) !== "")) return;
    // the heading row repeated further down (a list pasted together from several sheets)
    if (headKey && r.map(c => norm(cellStr(c))).join("|") === headKey) { skipped.headers++; return; }
    { const p = one("producer") !== undefined ? norm(cellStr(r[one("producer")])) : "", first = norm(cellStr(r.find(c => cellStr(c) !== "")));
      if (TOTAL.test(p) || (!p && TOTAL.test(first))) { skipped.totals++; return; } }
    const w = {};
    if (one("line") !== undefined) Object.assign(w, parseLine(cellStr(r[one("line")])));
    for (const f of TEXT_FIELDS) {
      const parts = col(f).map(i => cellStr(r[i])).filter(s => s && !NONE.test(s));
      if (parts.length) w[f] = (w[f] ? w[f] + " " : "") + parts.join(f === "location" ? " · " : " ");
    }
    if (w.type !== undefined) w.type = wineType(w.type);
    if (w.country !== undefined) w.country = COUNTRY[norm(w.country)] || w.country;
    if (w.region !== undefined) { const k = norm(w.region); w.region = REGION[k] || (BURGUNDY_SUB.test(k) ? "Bourgogne" : w.region); }
    if (w.classification !== undefined) w.classification = classification(w.classification);
    // an appellation like "Chambolle-Musigny 1er Cru" is a commune plus a classification
    if (w.commune) {
      const m = w.commune.match(/\s+(1er cru|1 er cru|premier cru|1\. cru|grand cru)$/i);
      if (m) { if (!w.classification) w.classification = classification(m[1]); w.commune = w.commune.slice(0, m.index); }
      if (w.region && norm(w.commune) === norm(w.region)) delete w.commune; // "Champagne", "Champagne"
    }
    // "Wine" columns that repeat the producer and the appellation: "Domaine Roumier Chambolle-Musigny 1er Cru Les Amoureuses"
    if (w.name) {
      let s = w.name;
      const cut = p => {
        if (!p || !norm(s).startsWith(norm(p) + " ")) return false;
        s = s.trim().split(/\s+/).slice(p.trim().split(/\s+/).length).join(" ").replace(/^[,–—-]\s*/, "");
        return true;
      };
      cut(w.producer);
      if (cut(w.commune)) { const c = s.match(/^(1er cru|premier cru|grand cru)\b/i); if (c) cut(c[0]); }
      if (s.trim()) w.name = s.trim();
    }
    if (at(r, "vintage") !== undefined) { const v = vintage(at(r, "vintage")); if (v !== "") w.vintage = v; }
    // bottles: qty and drunk, or qty and "left", or "left" only
    const q = num(at(r, "qty")), left = num(at(r, "left")), dr = at(r, "drunk");
    let qty = q !== null ? Math.round(q) : (w.qty != null ? w.qty : null);
    let drunk = 0;
    if (dr !== undefined && cellStr(dr) !== "") {
      const dn = num(dr);
      if (dr && typeof dr === "object") { drunk = qty || 1; if (!w.drunkDate) w.drunkDate = dr.date; }
      else if (dn !== null && !/^\d{4}-\d{2}-\d{2}$/.test(cellStr(dr))) drunk = Math.round(dn);
      else if (isoDate(dr)) { drunk = qty || 1; w.drunkDate = isoDate(dr); }
      else if (yes(dr)) drunk = qty || 1;
    }
    if (left !== null) {
      if (qty === null) qty = Math.round(left) + drunk;
      else if (dr === undefined || cellStr(dr) === "") drunk = Math.max(0, qty - Math.round(left));
    }
    if (qty === null) qty = 1;
    if (qty <= 0) { skipped.zero++; return; }
    if (!w.producer) { skipped.noProducer++; return; }
    w.qty = qty; w.drunk = Math.max(0, Math.min(drunk, qty));
    for (const f of ["price", "value"]) { const v = num(at(r, f)); if (v !== null && v >= 0) w[f] = Math.round(v * 100) / 100; }
    { const v = num(at(r, "rating")); if (v !== null && v > 0) w.rating = Math.round(rScale(v) * 10) / 10; }
    for (const f of ["acquired", "drunkDate"]) { const v = at(r, f); if (v !== undefined && isoDate(v)) w[f] = isoDate(v); }
    if (at(r, "size") !== undefined) { const s = size(at(r, "size")); if (s) w.size = s; }
    if (at(r, "window") !== undefined) { const [a, b] = windowYears(at(r, "window")); if (a) w.drinkFrom = a; if (b) w.drinkTo = b; }
    for (const f of ["drinkFrom", "drinkTo"]) { const v = at(r, f); if (v !== undefined) { const y = windowYears(v)[0]; if (y) w[f] = y; } }
    if (at(r, "elsewhere") !== undefined && cellStr(at(r, "elsewhere")) && (yes(cellStr(at(r, "elsewhere"))) || num(at(r, "elsewhere")) > 0)) w.elsewhere = 1;
    if (w.drinkFrom && w.drinkTo && w.drinkTo < w.drinkFrom) [w.drinkFrom, w.drinkTo] = [w.drinkTo, w.drinkFrom];
    w.src = header + 2 + n; // the row number in the file, for the preview
    wines.push(w);
  });
  return { wines: wines.slice(0, MAX_ROWS), skipped, truncated: wines.length > MAX_ROWS };
}

// ── already in the cellar? ─────────────────────────────────────────────────────
const key = w => [norm(w.producer), norm(w.name), String(w.vintage || "").toLowerCase(), String(w.size || "").toLowerCase()].join("|");
function dedupe(wines, existing, keyOf) {
  keyOf = keyOf || key;
  const have = new Map();
  (existing || []).forEach(e => { if (!e.elsewhere) { const k = keyOf(e); if (!have.has(k)) have.set(k, e.row); } });
  const fresh = [], dupes = [];
  wines.forEach(w => { const row = have.get(keyOf(w)); if (row) dupes.push({ wine: w, row }); else fresh.push(w); });
  return { fresh, dupes };
}
// "add bottles to the existing row": one bump per row
function bumps(dupes) {
  const by = new Map();
  dupes.forEach(({ wine, row }) => { const b = by.get(row) || { row, qty: 0, drunk: 0 }; b.qty += wine.qty; b.drunk += wine.drunk || 0; by.set(row, b); });
  return [...by.values()];
}
const clean = w => { const o = {}; for (const [k, v] of Object.entries(w)) if (k !== "src" && k !== "rows" && v !== "" && v != null) o[k] = v; return o; };

const api = { read, readText: (u8, name) => readText(u8, name || "file"), readXlsx, table, build, dedupe, bumps, clean, FIELDS, matchHeader, parseLine, num, vintage, isoDate, size, wineType, MAX_ROWS };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else root.IMPORT = api;
})(typeof window !== "undefined" ? window : globalThis);
