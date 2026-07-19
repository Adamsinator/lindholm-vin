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
const ACCESS_CODE = 'CHANGE-ME';        // legacy single-user code (still works — see below)
const SHEET_NAME  = 'Ark1';             // tab name that holds the wine list
// Multi-user: share this invite code with friends so they can create their own
// account. Each account gets its own private spreadsheet. Set to '' to turn
// signups off. Leave ACCESS_CODE working for your own existing setup.
const SIGNUP_CODE = '';                 // e.g. 'POUR-2026'; '' disables new signups
// ─────────────────────────────────────────────────────────────────────────────

const API_VERSION = 16; // returned in every response; used to verify deployments

// Per-request spreadsheet for the authenticated user. Set in handle(); every
// sheet helper reads it via ss(). Falls back to the bound (owner's) spreadsheet.
let CTX = null;
function ss() { return CTX || SpreadsheetApp.getActiveSpreadsheet(); }

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

// Optional current-value column (what a bottle is worth now — your own figure);
// auto-created the first time you set a value in the site.
const VALUE_HEADER = 'Værdi kr';

// Optional date columns, auto-created on demand: when the wine was acquired
// (set on add), and when it was last drunk (set when a bottle is marked drunk).
const ACQUIRED_HEADER   = 'Anskaffet';
const DRUNK_DATE_HEADER = 'Drukket dato';

// Optional drink-window columns (years), auto-created on first use.
const DRINK_FROM_HEADER = 'Drik fra';
const DRINK_TO_HEADER    = 'Drik til';

function today() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function ymd(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return v === null || v === undefined ? '' : String(v).trim();
}

/**
 * Run this ONCE from the Apps Script editor to grant the permissions the web app
 * needs (Sheets + Drive). Pick "authorize" in the toolbar's function dropdown,
 * press Run, and approve the dialog (Advanced → Go to project → Allow). Photo
 * upload fails until this is done, because saving a photo writes to your Drive.
 */
function authorize() {
  SpreadsheetApp.getActiveSpreadsheet().getName(); // Sheets scope
  photoFolder();                                   // Drive scope (creates the photos folder)
  return 'Authorized. You can close this.';
}

function doGet(e) { return handle((e && e.parameter) || {}); }

function doPost(e) {
  let p = {};
  try { p = JSON.parse(e.postData.contents); } catch (err) {}
  return handle(p);
}

function handle(p) {
  CTX = null;

  // Account actions need no session.
  if (p.action === 'signup') { try { return doSignup(p); } catch (err) { return json({ ok: false, error: String(err) }); } }
  if (p.action === 'login')  { try { return doLogin(p);  } catch (err) { return json({ ok: false, error: String(err) }); } }

  // Authenticate: a multi-user token scopes to that user's own spreadsheet;
  // otherwise fall back to the legacy single access code + the bound spreadsheet.
  if (p.token || p.user) {
    const u = authToken(p);
    if (!u) return json({ ok: false, error: 'bad-token' });
    try { CTX = SpreadsheetApp.openById(u.spreadsheetId); }
    catch (err) { return json({ ok: false, error: 'no-cellar' }); }
  } else {
    if (String(p.code || '') !== ACCESS_CODE) return json({ ok: false, error: 'bad-code' });
    CTX = SpreadsheetApp.getActiveSpreadsheet();
  }

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
      case 'rate':
        rateWine(Number(p.row), p.rating);
        return json({ ok: true, wines: readAll() });
      case 'setvalue':
        setValue(Number(p.row), p.value);
        return json({ ok: true, wines: readAll() });
      case 'setdate':
        setDate(Number(p.row), String(p.field || ''), p.value);
        return json({ ok: true, wines: readAll() });
      case 'setwindow':
        setWindow(Number(p.row), p.from, p.to);
        return json({ ok: true, wines: readAll() });
      case 'journal':
        return json({ ok: true, entries: readJournal() });
      case 'jadd':
        addJournal(p.entry || {});
        return json({ ok: true, entries: readJournal() });
      case 'jedit':
        updateJournal(Number(p.row), p.entry || {});
        return json({ ok: true, entries: readJournal() });
      case 'jdelete':
        deleteJournal(Number(p.row));
        return json({ ok: true, entries: readJournal() });
      case 'photo':
        return json({ ok: true, photo: getPhoto(String(p.id || '')) });
      case 'wish':
        return json({ ok: true, items: readWishlist() });
      case 'wadd':
        addWishlist(p.entry || {});
        return json({ ok: true, items: readWishlist() });
      case 'wedit':
        updateWishlist(Number(p.row), p.entry || {});
        return json({ ok: true, items: readWishlist() });
      case 'wdelete':
        deleteWishlist(Number(p.row));
        return json({ ok: true, items: readWishlist() });
      case 'wtocellar':
        wishToCellar(Number(p.row));
        return json({ ok: true, wines: readAll(), items: readWishlist() });
      default:
        return json({ ok: false, error: 'bad-action' });
    }
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// ── Accounts (registry + per-user spreadsheet) ───────────────────────────────
// A "Users" tab in the bound (owner's) spreadsheet is the registry. Each row is
// one account: a salted password hash and the id of that user's own private
// spreadsheet. Passwords are never stored in the clear. Signups need SIGNUP_CODE.

const USERS_SHEET = 'Users';
const USER_COLS = ['Username', 'Salt', 'Hash', 'SpreadsheetId', 'Token', 'Created'];

function usersSheet() {
  const book = SpreadsheetApp.getActiveSpreadsheet(); // registry always lives in the bound book
  let sh = book.getSheetByName(USERS_SHEET);
  if (!sh) { sh = book.insertSheet(USERS_SHEET); sh.appendRow(USER_COLS); }
  return sh;
}

function normUser(s) { return String(s || '').trim().toLowerCase(); }

// Return {row, username, salt, hash, spreadsheetId, token} for a username, or null.
function findUser(username) {
  const u = normUser(username);
  if (!u) return null;
  const sh = usersSheet();
  const last = sh.getLastRow();
  if (last < 2) return null;
  const rows = sh.getRange(2, 1, last - 1, USER_COLS.length).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (normUser(rows[i][0]) === u) {
      return { row: i + 2, username: rows[i][0], salt: String(rows[i][1]),
               hash: String(rows[i][2]), spreadsheetId: String(rows[i][3]),
               token: String(rows[i][4]) };
    }
  }
  return null;
}

function randToken() { return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''); }

function hashPass(salt, pass) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(salt) + '|' + String(pass));
  return Utilities.base64Encode(bytes);
}

// Constant-ish comparison (avoids trivial early-exit timing leaks).
function safeEqual(a, b) {
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Create a fresh private spreadsheet for a new account, seeded with the wine
// header row. It lives in the script owner's Drive; the script reaches it by id.
function createUserSpreadsheet(username) {
  const book = SpreadsheetApp.create('Lindholm Vin — ' + username);
  const sh = book.getSheets()[0];
  sh.setName(SHEET_NAME);
  sh.appendRow(Object.values(HEADERS)); // Producent, Land, Område, …
  return book.getId();
}

function doSignup(p) {
  if (!SIGNUP_CODE) return json({ ok: false, error: 'signup-disabled' });
  if (String(p.code || '') !== SIGNUP_CODE) return json({ ok: false, error: 'bad-invite' });
  const username = String(p.user || '').trim();
  if (!/^[a-zA-Z0-9_.-]{3,24}$/.test(username)) return json({ ok: false, error: 'bad-username' });
  if (String(p.pass || '').length < 6) return json({ ok: false, error: 'weak-pass' });
  if (findUser(username)) return json({ ok: false, error: 'user-taken' });

  const salt = randToken();
  const token = randToken();
  const spreadsheetId = createUserSpreadsheet(username);
  usersSheet().appendRow([username, salt, hashPass(salt, p.pass), spreadsheetId, token, today()]);
  return json({ ok: true, user: username, token: token });
}

function doLogin(p) {
  const u = findUser(p.user);
  const salt = u ? u.salt : 'x';                 // still hash on miss to blur timing
  const ok = u && safeEqual(hashPass(salt, p.pass || ''), u.hash);
  if (!ok) return json({ ok: false, error: 'bad-login' });
  const token = randToken();
  usersSheet().getRange(u.row, 5).setValue(token); // rotate token on each login
  return json({ ok: true, user: u.username, token: token });
}

// Validate {user, token}; returns the user record or null.
function authToken(p) {
  const u = findUser(p.user);
  if (!u || !u.token || !p.token) return null;
  return safeEqual(p.token, u.token) ? u : null;
}

// Run ONCE from the editor to give yourself an account whose cellar is THIS
// (the bound) spreadsheet, so your existing wines carry over. Edit the two
// values, pick makeOwner in the dropdown, Run.
function makeOwner() {
  const username = 'adam';        // ← your login name
  const password = 'change-this'; // ← your password (change immediately after)
  if (findUser(username)) return 'That username already exists — nothing changed.';
  const salt = randToken();
  usersSheet().appendRow([username, salt, hashPass(salt, password),
                          SpreadsheetApp.getActiveSpreadsheet().getId(), randToken(), today()]);
  return 'Owner account "' + username + '" created, pointing at this spreadsheet.';
}

function sheet() {
  const sh = ss().getSheetByName(SHEET_NAME);
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
  idx.rating    = head.indexOf(RATING_HEADER); // -1 until first rating creates it
  idx.value     = head.indexOf(VALUE_HEADER);  // -1 until first value creates it
  idx.acquired  = head.indexOf(ACQUIRED_HEADER);
  idx.drunkDate = head.indexOf(DRUNK_DATE_HEADER);
  idx.drinkFrom = head.indexOf(DRINK_FROM_HEADER);
  idx.drinkTo   = head.indexOf(DRINK_TO_HEADER);
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
    w.value  = idx.value  >= 0 ? (r[idx.value] === null || r[idx.value] === undefined ? '' : r[idx.value]) : '';
    w.acquired  = idx.acquired  >= 0 ? ymd(r[idx.acquired])  : '';
    w.drunkDate = idx.drunkDate >= 0 ? ymd(r[idx.drunkDate]) : '';
    w.drinkFrom = idx.drinkFrom >= 0 ? (r[idx.drinkFrom] === null || r[idx.drinkFrom] === undefined ? '' : r[idx.drinkFrom]) : '';
    w.drinkTo   = idx.drinkTo   >= 0 ? (r[idx.drinkTo]   === null || r[idx.drinkTo]   === undefined ? '' : r[idx.drinkTo])   : '';
    wines.push(w);
  });
  return wines;
}

function addWine(wine) {
  const sh = sheet();
  ensureCol(sh, ACQUIRED_HEADER);
  const idx = colIndexes(sh);
  const row = new Array(sh.getLastColumn()).fill('');
  for (const field of Object.keys(HEADERS)) {
    if (wine[field] !== undefined && wine[field] !== null && wine[field] !== '') {
      row[idx[field]] = wine[field];
    }
  }
  if (!String(row[idx.producer]).trim()) throw new Error('Producer is required');
  row[idx.acquired] = ymd(wine.acquired) || today();
  sh.appendRow(row);
}

function markDrunk(rowNum, n) {
  const sh = sheet();
  ensureCol(sh, DRUNK_DATE_HEADER);
  const idx = colIndexes(sh);
  if (!rowNum || rowNum < 2 || rowNum > sh.getLastRow()) throw new Error('Bad row');
  const qtyCell = sh.getRange(rowNum, idx.qty + 1);
  const drunkCell = sh.getRange(rowNum, idx.drunk + 1);
  const qty = Number(qtyCell.getValue()) || 1;
  let drunk = drunkCell.getValue();
  drunk = String(drunk).trim().toLowerCase() === 'x' ? qty : Number(drunk) || 0;
  const newDrunk = Math.min(qty, Math.max(0, drunk + n));
  drunkCell.setValue(newDrunk);
  const dateCell = sh.getRange(rowNum, idx.drunkDate + 1);
  if (newDrunk === 0) dateCell.setValue('');        // all bottles back in the cellar
  else if (n > 0) dateCell.setValue(today());       // a bottle was just drunk
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

// ── Current value (your own per-bottle figure) ───────────────────────────────
// A wine's current market worth, entered in the site. Stored in its own column,
// auto-created the first time you set one; blank means "no value tracked".

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

function setValue(rowNum, value) {
  const sh = sheet();
  if (!rowNum || rowNum < 2 || rowNum > sh.getLastRow()) throw new Error('Bad row');
  const i = ensureCol(sh, VALUE_HEADER);
  const empty = value === '' || value === null || value === undefined;
  const v = empty ? '' : Math.max(0, Number(value) || 0);
  sh.getRange(rowNum, i + 1).setValue(v);
}

// Set a wine's drink window (years). Blank clears an end.
function setWindow(rowNum, from, to) {
  const sh = sheet();
  if (!rowNum || rowNum < 2 || rowNum > sh.getLastRow()) throw new Error('Bad row');
  const yr = v => {
    if (v === '' || v === null || v === undefined) return '';
    const n = Math.round(Number(v));
    if (!n || n < 1900 || n > 2100) throw new Error('Bad year');
    return n;
  };
  const f = yr(from), t = yr(to);
  const fi = ensureCol(sh, DRINK_FROM_HEADER), ti = ensureCol(sh, DRINK_TO_HEADER);
  sh.getRange(rowNum, fi + 1).setValue(f);
  sh.getRange(rowNum, ti + 1).setValue(t);
}

// Edit a wine's acquired ("acquired") or last-drunk ("drunkDate") date.
function setDate(rowNum, field, value) {
  const header = field === 'acquired' ? ACQUIRED_HEADER
               : field === 'drunkDate' ? DRUNK_DATE_HEADER : null;
  if (!header) throw new Error('Bad field');
  const sh = sheet();
  if (!rowNum || rowNum < 2 || rowNum > sh.getLastRow()) throw new Error('Bad row');
  const v = value === null || value === undefined ? '' : String(value).trim();
  if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('Bad date (use YYYY-MM-DD)');
  const i = ensureCol(sh, header);
  sh.getRange(rowNum, i + 1).setValue(v);
}

// ── Journal (tasting log) — lives in its own tab, auto-created on first use ──
const JOURNAL_SHEET = 'Journal';
const JHEADERS = { date: 'Dato', producer: 'Producent', wine: 'Vin', vintage: 'Årgang',
                   country: 'Land', region: 'Område', grape: 'Drue',
                   place: 'Sted', rating: 'Rating', note: 'Note', photo: 'Foto' };

function journalSheet() {
  const book = ss();
  let sh = book.getSheetByName(JOURNAL_SHEET);
  if (!sh) {
    sh = book.insertSheet(JOURNAL_SHEET);
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
  ensureJournalCols(sh, e);
  // a photo (base64 data URL) is saved to Drive first; only its file id goes in the row
  let fileId = '';
  if (e.photo) { ensureCol(sh, JHEADERS.photo); fileId = savePhoto(e.photo, photoName(e)); }
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const row = new Array(sh.getLastColumn()).fill('');
  for (const [f, h] of Object.entries(JHEADERS)) {
    if (f === 'photo') continue; // handled above; never write the base64 into a cell
    const i = head.indexOf(h);
    if (i >= 0 && e[f] !== undefined && e[f] !== null && e[f] !== '') row[i] = e[f];
  }
  if (fileId) { const i = head.indexOf(JHEADERS.photo); if (i >= 0) row[i] = fileId; }
  if (!row.some(v => String(v).trim())) throw new Error('Empty entry');
  sh.appendRow(row);
}

// Update an existing entry in place. Text fields are overwritten from `e`; the
// photo is replaced when `e.photo` (a new data URL) is given, removed when
// `e.photoRemove` is set, and otherwise left untouched.
function updateJournal(rowNum, e) {
  const sh = journalSheet();
  if (!rowNum || rowNum < 2 || rowNum > sh.getLastRow()) throw new Error('Bad row');
  ensureJournalCols(sh, e);
  if (e.photo || e.photoRemove) ensureCol(sh, JHEADERS.photo);
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const photoCol = head.indexOf(JHEADERS.photo);
  const oldId = photoCol >= 0 ? String(sh.getRange(rowNum, photoCol + 1).getValue() || '').trim() : '';
  let newId = oldId;
  if (e.photo) { newId = savePhoto(e.photo, photoName(e)); if (oldId) trashPhoto(oldId); }
  else if (e.photoRemove) { if (oldId) trashPhoto(oldId); newId = ''; }
  for (const [f, h] of Object.entries(JHEADERS)) {
    if (f === 'photo') continue;
    const i = head.indexOf(h);
    if (i >= 0) sh.getRange(rowNum, i + 1).setValue(e[f] === undefined || e[f] === null ? '' : e[f]);
  }
  if (photoCol >= 0) sh.getRange(rowNum, photoCol + 1).setValue(newId);
}

function deleteJournal(rowNum) {
  const sh = journalSheet();
  if (!rowNum || rowNum < 2 || rowNum > sh.getLastRow()) throw new Error('Bad row');
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const i = head.indexOf(JHEADERS.photo);
  if (i >= 0) trashPhoto(String(sh.getRange(rowNum, i + 1).getValue() || '').trim());
  sh.deleteRow(rowNum);
}

function trashPhoto(id) {
  if (!id) return;
  try { DriveApp.getFileById(id).setTrashed(true); } catch (err) {}
}

// Create columns (on demand) for the non-photo fields this entry actually fills.
function ensureJournalCols(sh, e) {
  for (const [f, h] of Object.entries(JHEADERS)) {
    if (f === 'photo') continue;
    if (e[f] !== undefined && e[f] !== null && e[f] !== '') ensureCol(sh, h);
  }
}

// ── Journal photos (stored privately in Drive, served through this API) ───────
// Photos live in a private Drive folder in your account — never shared. The site
// asks for a photo by its file id and only ids present in the Journal are served,
// so the API can't be used to read other files in your Drive.

function photoFolder() {
  const props = PropertiesService.getDocumentProperties();
  const saved = props.getProperty('photoFolderId');
  if (saved) { try { return DriveApp.getFolderById(saved); } catch (err) {} }
  const folder = DriveApp.createFolder('Lindholm Vin – Journalfotos');
  props.setProperty('photoFolderId', folder.getId());
  return folder;
}

function photoName(e) {
  const bits = [e.date, e.producer, e.wine].map(x => String(x || '').trim()).filter(Boolean);
  return (bits.join(' – ') || 'foto') + '.jpg';
}

// Accepts a data URL ("data:image/jpeg;base64,…") or bare base64; returns the file id.
function savePhoto(dataUrl, name) {
  let b64 = String(dataUrl || ''), mime = 'image/jpeg';
  const comma = b64.indexOf(',');
  if (b64.slice(0, 5) === 'data:' && comma >= 0) {
    mime = (b64.slice(5, comma).split(';')[0]) || mime;
    b64 = b64.slice(comma + 1);
  }
  if (!b64) throw new Error('Empty photo');
  const blob = Utilities.newBlob(Utilities.base64Decode(b64), mime, name || 'foto.jpg');
  return photoFolder().createFile(blob).getId();
}

function journalPhotoIds() {
  const sh = journalSheet();
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const i = head.indexOf(JHEADERS.photo);
  const ids = {};
  const last = sh.getLastRow();
  if (i < 0 || last < 2) return ids;
  sh.getRange(2, i + 1, last - 1, 1).getValues().forEach(r => {
    const v = String(r[0] || '').trim(); if (v) ids[v] = true;
  });
  return ids;
}

function getPhoto(id) {
  if (!id) throw new Error('No photo id');
  if (!journalPhotoIds()[id]) throw new Error('Unknown photo'); // only serve journal photos
  const blob = DriveApp.getFileById(id).getBlob();
  return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
}

// ── Wishlist — wines you want to buy; its own tab, auto-created on first use ──
const WISHLIST_SHEET = 'Ønskeliste';
const WHEADERS = { producer: 'Producent', wine: 'Vin', vintage: 'Årgang',
                   region: 'Område', price: 'Målpris kr', note: 'Note' };

function wishlistSheet() {
  const book = ss();
  let sh = book.getSheetByName(WISHLIST_SHEET);
  if (!sh) { sh = book.insertSheet(WISHLIST_SHEET); sh.appendRow(Object.values(WHEADERS)); }
  return sh;
}

function readWishlist() {
  const sh = wishlistSheet();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const idx = {};
  for (const [f, h] of Object.entries(WHEADERS)) idx[f] = head.indexOf(h);
  const values = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  const out = [];
  values.forEach((r, i) => {
    const e = { row: i + 2 };
    for (const f of Object.keys(WHEADERS)) {
      let v = idx[f] >= 0 ? r[idx[f]] : '';
      if (v instanceof Date) v = v.getFullYear();
      e[f] = v === null || v === undefined ? '' : v;
    }
    if (String(e.producer).trim() || String(e.wine).trim()) out.push(e);
  });
  return out;
}

function addWishlist(e) {
  if (!String(e.producer || '').trim()) throw new Error('Producer is required');
  const sh = wishlistSheet();
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const row = new Array(sh.getLastColumn()).fill('');
  for (const [f, h] of Object.entries(WHEADERS)) {
    const i = head.indexOf(h);
    if (i >= 0 && e[f] !== undefined && e[f] !== null && e[f] !== '') row[i] = e[f];
  }
  sh.appendRow(row);
}

function updateWishlist(rowNum, e) {
  const sh = wishlistSheet();
  if (!rowNum || rowNum < 2 || rowNum > sh.getLastRow()) throw new Error('Bad row');
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  for (const [f, h] of Object.entries(WHEADERS)) {
    const i = head.indexOf(h);
    if (i >= 0) sh.getRange(rowNum, i + 1).setValue(e[f] === undefined || e[f] === null ? '' : e[f]);
  }
}

function deleteWishlist(rowNum) {
  const sh = wishlistSheet();
  if (!rowNum || rowNum < 2 || rowNum > sh.getLastRow()) throw new Error('Bad row');
  sh.deleteRow(rowNum);
}

// Buy it: copy a wishlist row into the cellar (1 bottle) and remove the wish.
function wishToCellar(rowNum) {
  const it = readWishlist().find(x => x.row === rowNum);
  if (!it) throw new Error('Wish not found');
  addWine({ producer: it.producer, name: it.wine, region: it.region,
            vintage: it.vintage, price: it.price, qty: 1 });
  deleteWishlist(rowNum);
}

function json(obj) {
  obj.v = API_VERSION;
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
