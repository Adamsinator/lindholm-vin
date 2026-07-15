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
// ─────────────────────────────────────────────────────────────────────────────

const API_VERSION = 4; // returned in every response; used to verify deployments

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
        return json({ ok: true, wines: readAll() });
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

function deleteWine(rowNum) {
  const sh = sheet();
  if (!rowNum || rowNum < 2 || rowNum > sh.getLastRow()) throw new Error('Bad row');
  sh.deleteRow(rowNum);
}

function json(obj) {
  obj.v = API_VERSION;
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
