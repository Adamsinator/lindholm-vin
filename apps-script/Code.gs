/**
 * Lindholm Vin — cellar API (Google Apps Script)
 *
 * Attach this to the Google Sheet that holds the cellar:
 *   Extensions → Apps Script → paste this file → set the code below →
 *   Deploy → New deployment → Web app → Execute as: Me → Who has access: Anyone
 *
 * The sheet itself stays private. This script is the only way in, and it
 * refuses everything without the access code.
 */

// ── EDIT THIS ─────────────────────────────────────────────────────────────────
const ACCESS_CODE = 'CHANGE-ME';        // code to open the site
const SHEET_NAME  = 'Ark1';             // tab name that holds the wine list
// CellarTracker (optional) — powers the "Sync values" button in the site.
// Your CT handle + password; valuations arrive in the currency chosen in your
// CellarTracker preferences, so set that to DKK. Leave empty to disable.
const CT_USER     = '';
const CT_PASSWORD = '';
// ─────────────────────────────────────────────────────────────────────────────

const API_VERSION = 7; // returned in every response; used to verify deployments

// Column headers in row 1 of the sheet, mapped to API field names.
const HEADERS = {
  producer: 'Producent',
  country: 'Land',
  region: 'Område',
  commune: 'Kommune',
  name: 'Mark/Navn',
  classification: 'Klassifikation',
  type: 'Type',
  grape: 'Drue',
  vintage: 'Årgang',
  qty: 'Antal',
  price: 'Pris kr (WS)',
  drunk: 'Drukket',
  source: 'Kilde',
  note: 'Note',
};

// Optional own-score column in the wine tab; auto-created on first rating.
const RATING_HEADER = 'Rating';

// Optional CellarTracker columns; auto-created when first used.
const CT_ID_HEADER    = 'CT iWine';       // the wine's id on CellarTracker
const CT_VALUE_HEADER = 'Værdi kr (CT)';  // community average value, filled by ctsync

function doGet(e) { return handle((e && e.parameter) || {}); }

function doPost(e) {
  let p = {};
  try { p = JSON.parse(e.postData.contents); } catch (err) {}
  return handle(p);
}

function handle(p) {
  if (String(p.code || '') !== ACCESS_CODE) return json({ ok: false, error: 'bad-code' });

  try {
    switch (p.action) {
      case 'data':
        return json({ ok: true, wines: readAll(), ctLast: ctLastInfo() });
      case 'add':
        addWine(p.wine || {});
        return json({ ok: true, wines: readAll() });
      case 'drink':
        markDrunk(Number(p.row), Number(p.qty) || 1);
        return json({ ok: true, wines: readAll() });
      case 'undrink':
        markDrunk(Number(p.row), -(Number(p.qty) || 1));
        return json({ ok: true, wines: readAll() });
      case 'delete':
        deleteWine(Number(p.row));
        return json({ ok: true, wines: readAll() });
      case 'rate':
        rateWine(Number(p.row), p.rating);
        return json({ ok: true, wines: readAll() });
      case 'setct':
        setCtId(Number(p.row), p.ctid);
        return json({ ok: true, wines: readAll() });
      case 'ctsync':
        return json({ ok: true, ct: syncCellarTracker(), wines: readAll() });
      case 'journal':
        return json({ ok: true, entries: readJournal() });
      case 'jadd':
        addJournal(p.entry || {});
        return json({ ok: true, entries: readJournal() });
      case 'jdelete':
        deleteJournal(Number(p.row));
        return json({ ok: true, entries: readJournal() });
      default:
        return json({ ok: false, error: 'bad-action' });
    }
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function sheet() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sh) throw new Error('Sheet tab "' + SHEET_NAME + '" not found');
  return sh;
}

function colIndexes(sh) {
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const idx = {};
  for (const [field, header] of Object.entries(HEADERS)) {
    const i = head.indexOf(header);
    if (i === -1) throw new Error('Missing column "' + header + '" in row 1');
    idx[field] = i;
  }
  idx.rating = head.indexOf(RATING_HEADER); // -1 until first rating creates it
  idx.ctid   = head.indexOf(CT_ID_HEADER);  // -1 until first CT link creates them
  idx.value  = head.indexOf(CT_VALUE_HEADER);
  return idx;
}

function readAll() {
  const sh = sheet();
  const idx = colIndexes(sh);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const values = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  const wines = [];
  values.forEach((r, i) => {
    if (!String(r[idx.producer]).trim()) return; // skip empty rows
    const w = { row: i + 2 }; // 1-based sheet row, header is row 1
    for (const field of Object.keys(HEADERS)) {
      let v = r[idx[field]];
      if (v instanceof Date) v = v.getFullYear(); // vintage cells sometimes parse as dates
      w[field] = v === null || v === undefined ? '' : v;
    }
    w.rating = idx.rating >= 0 ? (r[idx.rating] === null || r[idx.rating] === undefined ? '' : r[idx.rating]) : '';
    w.ctid   = idx.ctid   >= 0 ? String(r[idx.ctid] === null || r[idx.ctid] === undefined ? '' : r[idx.ctid]).trim() : '';
    w.value  = idx.value  >= 0 ? (r[idx.value] === null || r[idx.value] === undefined ? '' : r[idx.value]) : '';
    wines.push(w);
  });
  return wines;
}

function addWine(wine) {
  const sh = sheet();
  const idx = colIndexes(sh);
  const row = new Array(sh.getLastColumn()).fill('');
  for (const field of Object.keys(HEADERS)) {
    if (wine[field] !== undefined && wine[field] !== null && wine[field] !== '') {
      row[idx[field]] = wine[field];
    }
  }
  if (!String(row[idx.producer]).trim()) throw new Error('Producer is required');
  sh.appendRow(row);
}

function markDrunk(rowNum, n) {
  const sh = sheet();
  const idx = colIndexes(sh);
  if (!rowNum || rowNum < 2 || rowNum > sh.getLastRow()) throw new Error('Bad row');
  const qtyCell = sh.getRange(rowNum, idx.qty + 1);
  const drunkCell = sh.getRange(rowNum, idx.drunk + 1);
  const qty = Number(qtyCell.getValue()) || 1;
  let drunk = drunkCell.getValue();
  drunk = String(drunk).trim().toLowerCase() === 'x' ? qty : Number(drunk) || 0;
  drunkCell.setValue(Math.min(qty, Math.max(0, drunk + n)));
}

function ensureRatingCol(sh) {
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  let i = head.indexOf(RATING_HEADER);
  if (i === -1) {
    i = head.findIndex(h => !String(h).trim()); // first empty header cell
    if (i === -1) i = head.length;
    sh.getRange(1, i + 1).setValue(RATING_HEADER);
  }
  return i;
}

function rateWine(rowNum, rating) {
  const sh = sheet();
  if (!rowNum || rowNum < 2 || rowNum > sh.getLastRow()) throw new Error('Bad row');
  const i = ensureRatingCol(sh);
  const empty = rating === '' || rating === null || rating === undefined;
  const v = empty ? '' : Math.max(1, Math.min(10, Number(rating) || 0));
  sh.getRange(rowNum, i + 1).setValue(v || '');
}

function deleteWine(rowNum) {
  const sh = sheet();
  if (!rowNum || rowNum < 2 || rowNum > sh.getLastRow()) throw new Error('Bad row');
  sh.deleteRow(rowNum);
}

// ── CellarTracker valuation sync ─────────────────────────────────────────────
// Pulls your CellarTracker cellar (the "List" table) and writes each wine's
// community average value (per bottle) into the sheet. A wine is matched to CT
// by a stored iWine id when present, else by producer + vintage + cuvée; a fresh
// match stores the iWine back so later syncs are exact.

function ensureCol(sh, header) {
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  let i = head.indexOf(header);
  if (i === -1) {
    i = head.findIndex(h => !String(h).trim()); // first empty header cell
    if (i === -1) i = head.length;
    sh.getRange(1, i + 1).setValue(header);
  }
  return i;
}

function setCtId(rowNum, ctid) {
  const sh = sheet();
  if (!rowNum || rowNum < 2 || rowNum > sh.getLastRow()) throw new Error('Bad row');
  const i = ensureCol(sh, CT_ID_HEADER);
  sh.getRange(rowNum, i + 1).setValue(ctid == null ? '' : String(ctid).trim());
}

// producer|vintage|cuvée, accent- and punctuation-insensitive; NV/blank collapse.
function ctKey(producer, vintage, wine) {
  const norm = s => String(s == null ? '' : s).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
  let v = String(vintage == null ? '' : vintage).trim();
  const m = v.match(/\d{4}/);
  v = m ? m[0] : 'nv'; // "1998", else NV / blank / non-vintage
  if (v === '1000' || v === '1001') v = 'nv'; // CellarTracker's non-vintage sentinel
  return norm(producer) + '|' + v + '|' + norm(wine);
}

function ctNumber(x) {
  if (x == null) return NaN;
  const n = Number(String(x).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? NaN : n;
}

function fetchCtList() {
  if (!CT_USER || !CT_PASSWORD) throw new Error('CellarTracker not configured');
  const url = 'https://www.cellartracker.com/xlquery.asp'
    + '?User=' + encodeURIComponent(CT_USER)
    + '&Password=' + encodeURIComponent(CT_PASSWORD)
    + '&Format=xml&Table=List';
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  const code = res.getResponseCode();
  const body = res.getContentText();
  if (code !== 200) throw new Error('CellarTracker HTTP ' + code);
  const head = body.slice(0, 200);
  if (head.indexOf('<') !== 0 && head.indexOf('<?xml') === -1)
    throw new Error('CellarTracker rejected the request (check user/password)');
  let doc;
  try { doc = XmlService.parse(body); }
  catch (e) { throw new Error('CellarTracker returned an unexpected response'); }
  const rows = [];
  collectCtRows(doc.getRootElement(), rows);
  return rows;
}

// Depth-first: any element whose children include iWine/Wine/Producer is one row.
function collectCtRows(el, out) {
  const kids = el.getChildren();
  const o = {};
  let looksLikeRow = false;
  kids.forEach(c => {
    const name = c.getName();
    o[name] = c.getText();
    if (name === 'iWine' || name === 'Wine' || name === 'Producer') looksLikeRow = true;
  });
  if (looksLikeRow) { out.push(o); return; }
  kids.forEach(c => collectCtRows(c, out));
}

function syncCellarTracker() {
  const rows = fetchCtList();
  const byId = {}, byKey = {};
  rows.forEach(o => {
    const rec = {
      iWine: String(o.iWine || '').trim(),
      value: ctNumber(o.Valuation),
      producer: o.Producer || '', wine: o.Wine || '', vintage: o.Vintage || '',
    };
    if (rec.iWine) byId[rec.iWine] = rec;
    const k = ctKey(rec.producer, rec.vintage, rec.wine);
    if (!(k in byKey) || (isNaN(byKey[k].value) && !isNaN(rec.value))) byKey[k] = rec;
  });

  const sh = sheet();
  ensureCol(sh, CT_ID_HEADER);
  ensureCol(sh, CT_VALUE_HEADER);
  const idx = colIndexes(sh); // re-read; the two columns may have just been created
  const last = sh.getLastRow();

  const info = { at: new Date().toISOString(), matched: 0, valued: 0, total: 0, ctRows: rows.length };
  if (last >= 2) {
    const width = sh.getLastColumn();
    const data = sh.getRange(2, 1, last - 1, width).getValues();
    const valOut = [], idOut = [];
    data.forEach(r => {
      const producer = String(r[idx.producer] || '').trim();
      if (!producer) { valOut.push([r[idx.value]]); idOut.push([r[idx.ctid]]); return; }
      info.total++;
      let vintage = r[idx.vintage];
      if (vintage instanceof Date) vintage = vintage.getFullYear();
      const name = String(r[idx.name] || '').trim();
      let id = String(r[idx.ctid] == null ? '' : r[idx.ctid]).trim();
      const rec = (id && byId[id]) ? byId[id] : byKey[ctKey(producer, vintage, name)];
      if (rec) {
        info.matched++;
        if (!id && rec.iWine) id = rec.iWine; // learn the id for next time
        if (!isNaN(rec.value)) { info.valued++; valOut.push([rec.value]); }
        else valOut.push([r[idx.value]]); // CT has no value → keep whatever was there
      } else {
        valOut.push([r[idx.value]]);
      }
      idOut.push([id]);
    });
    sh.getRange(2, idx.value + 1, valOut.length, 1).setValues(valOut);
    sh.getRange(2, idx.ctid + 1, idOut.length, 1).setValues(idOut);
  }

  PropertiesService.getDocumentProperties().setProperty('ctLast', JSON.stringify(info));
  return info;
}

function ctLastInfo() {
  const configured = !!(CT_USER && CT_PASSWORD);
  let last = null;
  try {
    const raw = PropertiesService.getDocumentProperties().getProperty('ctLast');
    if (raw) last = JSON.parse(raw);
  } catch (e) {}
  return { configured: configured, last: last };
}

// ── Journal (tasting log) — lives in its own tab, auto-created on first use ──
const JOURNAL_SHEET = 'Journal';
const JHEADERS = { date: 'Dato', producer: 'Producent', wine: 'Vin', vintage: 'Årgang',
                   place: 'Sted', rating: 'Rating', note: 'Note' };

function journalSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(JOURNAL_SHEET);
  if (!sh) {
    sh = ss.insertSheet(JOURNAL_SHEET);
    sh.appendRow(Object.values(JHEADERS));
  }
  return sh;
}

function readJournal() {
  const sh = journalSheet();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const idx = {};
  for (const [f, h] of Object.entries(JHEADERS)) idx[f] = head.indexOf(h);
  const values = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  const out = [];
  values.forEach((r, i) => {
    const e = { row: i + 2 };
    for (const f of Object.keys(JHEADERS)) {
      let v = idx[f] >= 0 ? r[idx[f]] : '';
      if (v instanceof Date) v = Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      e[f] = v === null || v === undefined ? '' : v;
    }
    if (String(e.producer).trim() || String(e.wine).trim() || String(e.note).trim()) out.push(e);
  });
  return out;
}

function addJournal(e) {
  const sh = journalSheet();
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const row = new Array(sh.getLastColumn()).fill('');
  for (const [f, h] of Object.entries(JHEADERS)) {
    const i = head.indexOf(h);
    if (i >= 0 && e[f] !== undefined && e[f] !== null && e[f] !== '') row[i] = e[f];
  }
  if (!row.some(v => String(v).trim())) throw new Error('Empty entry');
  sh.appendRow(row);
}

function deleteJournal(rowNum) {
  const sh = journalSheet();
  if (!rowNum || rowNum < 2 || rowNum > sh.getLastRow()) throw new Error('Bad row');
  sh.deleteRow(rowNum);
}

function json(obj) {
  obj.v = API_VERSION;
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
