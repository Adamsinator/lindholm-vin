/**
 * AllWine — cellar API (Google Apps Script)
 *
 * Attach this to the Google Sheet that holds the cellar:
 *   Extensions → Apps Script → paste this file as Code.gs, and add a second file Settings.gs (see below) →
 *   Deploy → New deployment → Web app → Execute as: Me → Who has access: Anyone
 *
 * The sheet itself stays private. This script is the only way in, and it
 * refuses everything without a valid login (or the legacy access code).
 *
 * Since API 28 every account's cellar, journal, wishlist and journal photos are encrypted in the browser
 * (vault-crypto.js / vault.js in the site): this script stores ciphertext for them and never sees a password.
 * The private actions below still run — in the browser, on the decrypted copy (vault-engine.js); here they answer
 * 'vaulted' for an encrypted account. See "Privacy: encrypted cellars" in the README.
 *
 * ── YOUR SETTINGS ARE IN Settings.gs, NOT HERE ────────────────────────────────
 * Your access code, sheet name, invite code and atlas editors live in a second file in this project, Settings.gs
 * (template: apps-script/Settings.gs in the repo). Apps Script shares one global scope across a project's files,
 * so this file reads them from there — and updating means replacing this file only; your settings stay put.
 *
 *   ACCESS_CODE    legacy single-user code for the bound sheet. '' (or the placeholder 'CHANGE-ME') turns it off;
 *                  accounts (username + password) don't need it.
 *   SHEET_NAME     the tab that holds the wine list (default 'Ark1')
 *   SIGNUP_CODE    an optional shared invite code; better: personal single-use codes in the "Invites" tab (run
 *                  makeInvites() from the editor). With neither, signups are off
 *   MAX_USERS      the most accounts there can be (default 50)
 *   SESSION_DAYS   a login lasts this many days without use (default 30)
 *   BACKUP_KEEP    how many weeks of daily backups to keep (default 8); RESTORE_USER / RESTORE_FROM for restoreFromBackup()
 *   ATLAS_EDITORS  who may correct vineyard holdings in the Burgundy atlas: '' = anyone signed in,
 *                  or a comma-separated list of usernames, e.g. 'adam,anna'
 *   OWNER_USER / OWNER_PASSWORD   only for the one-time makeOwner() setup of your own account (see below)
 * ─────────────────────────────────────────────────────────────────────────────
 */
const DEFAULT_SETTINGS = { ACCESS_CODE: '', SHEET_NAME: 'Ark1', SIGNUP_CODE: '', ATLAS_EDITORS: '', OWNER_USER: '', OWNER_PASSWORD: '',
  MAX_USERS: '50', SESSION_DAYS: '30', SOCIAL: '', BACKUP_KEEP: '8', RESTORE_USER: '', RESTORE_FROM: '', GATEWAY_SECRET: '', REPORT_EMAIL: '' };
// Read at call time (not load time), so it doesn't matter in which order Apps Script loads the two files.
function setting(key) {
  const s = (typeof SETTINGS === 'object' && SETTINGS) || {};
  const v = s[key] !== undefined && s[key] !== null ? s[key] : DEFAULT_SETTINGS[key];
  return String(v === undefined || v === null ? '' : v).trim();
}
// The legacy code only works once you've set a real one: the placeholder from the template is public.
function accessCode() { const c = setting('ACCESS_CODE'); return c === 'CHANGE-ME' ? '' : c; }

const API_VERSION = 45; // returned in every response; used to verify deployments

// Per-request spreadsheet for the authenticated user. Set in handle(); every
// sheet helper reads it via ss(). Falls back to the bound (owner's) spreadsheet.
let CTX = null;
let CTX_USER = null; // authenticated username (for the shared social feed)
let CTX_ACCOUNT = null; // the signed-in account's Users record (null for the legacy access code)
// True when this file runs inside the browser's vault engine (vault-engine.js) on a user's decrypted cellar rather
// than on the server; the engine declares it before loading this file.
// With GATEWAY_SECRET set, only requests that came through the Cloudflare Worker (worker/index.js) are served: it adds
// the secret to each one. Others are refused straight away, before any spreadsheet is opened. The browser's own copy
// of this file (vault-engine.js) never needs it.
function throughGateway(p) {
  const secret = setting('GATEWAY_SECRET'), sent = String(p._gw || '');
  delete p._gw;
  return !secret || inEngine() || safeEqual(sent, secret);
}
function inEngine() { return typeof ENGINE !== 'undefined' && ENGINE === true; }
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

// Optional bottle format ("Magnum", "Balthazar", …), auto-created on first use.
// Blank means an ordinary 75 cl bottle, so existing sheets need no migration.
const SIZE_HEADER = 'Størrelse';

// Optional drink-window columns (years), auto-created on first use.
const DRINK_FROM_HEADER = 'Drik fra';
const DRINK_TO_HEADER    = 'Drik til';

// Marks a row for a wine drunk elsewhere (a restaurant, a friend's table) that was never in the cellar.
// Set by enjoyAdd; older rows without it are recognised by shape (1 bottle, drunk, no acquired date).
const ELSEWHERE_HEADER = 'Drukket ude';

// Where the bottles are ("Kælder, reol 3, hylde 2", "Køleskab række 4"); free text, auto-created on first use.
const LOCATION_HEADER = 'Placering';

// A business account (a restaurant, a shop, a domaine): the price on the wine card or price list and the price by the
// glass (the supplier is the Kilde column). Optional columns, auto-created on first use, so a private cellar never sees them.
const BIZ_HEADERS = { menuPrice: 'Menupris', glassPrice: 'Glaspris' };
const BIZ_NUM = ['menuPrice', 'glassPrice'];
// a price as stored: blank, or a number of 0 or more (anything else is refused, not guessed at)
function bizValue(f, v) {
  if (v === undefined || v === null || String(v).trim() === '') return '';
  if (BIZ_NUM.indexOf(f) === -1) return plainText(v);
  const n = Number(String(v).replace(',', '.')); if (!isFinite(n) || n < 0) throw new Error('Bad price');
  return Math.round(n * 100) / 100;
}
function ensureBiz(sh, fields) { Object.keys(BIZ_HEADERS).forEach(f => { if (fields.some(x => x && f in x && String(x[f] == null ? '' : x[f]).trim() !== '')) ensureCol(sh, BIZ_HEADERS[f]); }); }

// The wine fields the site may edit in place (rename, fix a commune, set a classification…).
const INFO_FIELDS = ['producer', 'name', 'commune', 'classification', 'region', 'country', 'grape', 'type', 'vintage', 'source', 'note', 'location', 'menuPrice', 'glassPrice'];

function today() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function ymd(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return v === null || v === undefined ? '' : String(v).trim();
}

// The functions you run from the editor return their message for the tests and also print it, since the editor's
// execution log shows only what is printed, not what a function returns.
function told(msg) { console.log(msg); return msg; }

/**
 * Run this ONCE from the Apps Script editor to grant the permissions the web app
 * needs (Sheets + Drive). Pick "authorize" in the toolbar's function dropdown,
 * press Run, and approve the dialog (Advanced → Go to project → Allow). Photo
 * upload fails until this is done, because saving a photo writes to your Drive.
 */
function authorize() {
  SpreadsheetApp.getActiveSpreadsheet().getName(); // Sheets scope
  photoFolder();                                   // Drive scope (creates the photos folder)
  return told('Authorized. You can close this.');
}

function doGet(e) { const p = Object.assign({}, (e && e.parameter) || {}); return throughGateway(p) ? handle(p) : json({ ok: false, error: 'gateway' }); }

function doPost(e) {
  let p = {};
  const body = e && e.postData ? String(e.postData.contents || '') : '';
  if (body.length > REQUEST_MAX) return json({ ok: false, error: 'too-big' });
  try { p = JSON.parse(body); } catch (err) {}
  if (!p || typeof p !== 'object') p = {};
  if (!throughGateway(p)) { logEvent('gateway', '', 'POST without the secret'); return json({ ok: false, error: 'gateway' }); }
  return handle(p);
}

function handle(p) {
  CTX = null;

  // Account actions need no session.
  const open = { signup: doSignup, login: doLogin, prelogin: doPrelogin, recoverstart: doRecoverStart, recover: doRecover };
  // counts from the page (which pages, how often): no session needed, nothing that names anyone
  if (p.action === 'hits') { countStats(pageHits(p.ev)); return json({ ok: true }); }
  // an error in a visitor's browser (API 44): which page, file and line, and the message, never who or anything from a cellar
  if (p.action === 'clienterr') { logClientError(p); return json({ ok: true }); }
  // a shared list, by its link's id (API 44): only ciphertext, which the link's key (never sent here) opens
  if (p.action === 'shareget') { try { return json(shareGet(String(p.id || ''))); } catch (err) { return json({ ok: false, error: String(err) }); } }
  // the admin's public key (public by nature), for a browser to wrap a new or recovered account's key to it
  if (p.action === 'adminkey') { const h = adminHelpKey(); return json(Object.assign({ ok: true }, h || {})); }
  if (open[p.action]) { try { return open[p.action](p); } catch (err) { return json({ ok: false, error: String(err) }); } }
  // The Burgundy atlas is public reference data, so its corrections can be read without a session.
  if (p.action === 'atlas')  { countStats({ atlas: 1 }); try { return json({ ok: true, edits: readAtlas(false) }); } catch (err) { return json({ ok: false, error: String(err) }); } }

  // Authenticate: a multi-user token scopes to that user's own spreadsheet;
  // otherwise fall back to the legacy single access code + the bound spreadsheet.
  CTX_USER = null; CTX_ACCOUNT = null;
  if (p.token || p.user) {
    const u = authToken(p);
    if (!u) return json({ ok: false, error: 'bad-token' });
    try { CTX = SpreadsheetApp.openById(u.spreadsheetId); }
    catch (err) { return json({ ok: false, error: 'no-cellar' }); }
    CTX_USER = u.username; CTX_ACCOUNT = u;
    // an encrypted account's private data lives only in its vault: the server never reads or writes it in the clear
    if (u.state === 'done' && PRIVATE_ACTIONS[p.action] && p.action !== 'photo') return json({ ok: false, error: 'vaulted' });
    if (u.state === 'migrating' && PRIVATE_ACTIONS[p.action] && p.action !== 'photo') return json({ ok: false, error: 'migrating' });
  } else {
    const code = accessCode();
    if (!code || String(p.code || '') !== code) return json({ ok: false, error: 'bad-code' });
    // the legacy code can't unlock an encrypted cellar, so it stops working once the owner's cellar is encrypted
    if (!inEngine() && ownerVaulted()) return json({ ok: false, error: 'vaulted' });
    CTX = SpreadsheetApp.getActiveSpreadsheet();
    CTX_USER = inEngine() ? 'engine' : 'cellar';
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
      case 'deleted':
        return json({ ok: true, deleted: listDeleted() });
      case 'undelete':
        undeleteWine(String(p.id || ''));
        return json({ ok: true, wines: readAll(), deleted: listDeleted() });
      case 'rate':
        rateWine(Number(p.row), p.rating);
        return json({ ok: true, wines: readAll() });
      case 'setvalue':
        setValue(Number(p.row), p.value);
        return json({ ok: true, wines: readAll() });
      case 'setprice':
        setPrice(Number(p.row), p.value);
        return json({ ok: true, wines: readAll() });
      case 'setdate':
        setDate(Number(p.row), String(p.field || ''), p.value);
        return json({ ok: true, wines: readAll() });
      case 'setsize':
        setSize(Number(p.row), p.value);
        return json({ ok: true, wines: readAll() });
      case 'setwindow':
        setWindow(Number(p.row), p.from, p.to);
        return json({ ok: true, wines: readAll() });
      case 'setinfo':
        setInfo(Number(p.row), p.fields || {});
        if (p.old && p.journal) renameJournal(p.old, p.fields || {});
        return json({ ok: true, wines: readAll(), entries: readJournal() });
      case 'enjoysync':
        enjoySync(Number(p.row), p.entry || {});
        return json({ ok: true, wines: readAll() });
      case 'classfill':
        classFill(p.wines || [], p.journal || []);
        return json({ ok: true, wines: readAll(), entries: readJournal() });
      case 'enjoyadd':
        enjoyAdd(p.entry || {});
        return json({ ok: true, wines: readAll() });
      case 'addmany':
        addMany(p.wines || [], p.bumps || []);
        return json({ ok: true, wines: readAll() });
      case 'setinfomany':
        setInfoMany(p.edits || []);
        return json({ ok: true, wines: readAll() });
      case 'mergerows':
        mergeRows(p.groups || []);
        return json({ ok: true, wines: readAll() });
      // who you are: the page shows the admin page only to the owner
      case 'me':
        return json({ ok: true, user: CTX_USER, owner: isOwnerAccount(CTX_ACCOUNT), help: helpFor(CTX_ACCOUNT) });
      // this account's data key wrapped to the admin's public key (done in the browser): the admin can help it back in
      case 'escrow': {
        const u = CTX_ACCOUNT, h = adminHelpKey();
        if (!u || !u.kdf || isOwnerAccount(u)) return json({ ok: false, error: 'no-account' });
        if (!h || String(p.adminKid || '') !== h.kid) return json({ ok: false, error: 'stale-admin-key' });
        if (!/^[A-Za-z0-9+/=]{300,1200}$/.test(String(p.wrapAdmin || ''))) return json({ ok: false, error: 'bad-keys' });
        setUser(u, 'WrapAdmin', String(p.wrapAdmin)); setUser(u, 'AdminKid', h.kid);
        return json({ ok: true });
      }
      // the owner's admin page: the members and the invite codes, never anything from a cellar
      case 'admin': case 'admininvites': case 'adminrevoke': case 'admindelete':
      case 'adminkeyset': case 'adminkeyget': case 'adminescrow': case 'adminrecovery':
        if (!isOwnerAccount(CTX_ACCOUNT)) return json({ ok: false, error: 'not-owner' });
        if (p.action === 'adminkeyset') return adminKeySet(p);
        if (p.action === 'adminkeyget') return json({ ok: true, pub: CTX_ACCOUNT.adminPub || '', key: CTX_ACCOUNT.adminKey || '', kid: CTX_ACCOUNT.adminKid || '' });
        if (p.action === 'adminescrow') {
          const t = findUser(String(p.member || ''));
          if (!t || isOwnerAccount(t)) return json({ ok: false, error: 'no-user' });
          if (!t.wrapAdmin || t.adminKid !== CTX_ACCOUNT.adminKid) return json({ ok: false, error: 'no-help-yet' });
          return json({ ok: true, wrapAdmin: t.wrapAdmin, kid: t.adminKid });
        }
        if (p.action === 'adminrecovery') return adminRecovery(p);
        if (p.action === 'admininvites') addInvites(Number(p.n) || 1, String(p.note || ''));
        if (p.action === 'adminrevoke') revokeInvite(String(p.code || ''));
        if (p.action === 'admindelete') { // the same clean-up as deleting your own account; never the owner's
          const t = findUser(String(p.member || ''));
          if (!t) return json({ ok: false, error: 'no-user' });
          if (isOwnerAccount(t)) return json({ ok: false, error: 'owner-account' });
          removeAccount(t);
        }
        return json(adminView());
      // the feed and follows only with SOCIAL: 'on' — off, nobody sees posts, follows or who else has an account
      case 'feed': case 'feedpost': case 'feeddelete': case 'feedcheer': case 'feedcomment': case 'follow': case 'unfollow':
        if (setting('SOCIAL') !== 'on') return json({ ok: false, error: 'social-off' });
        return social(p);

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
      case 'atlasedit':
        addAtlasEdit(p.edit || {});
        return json({ ok: true, edits: readAtlas(true) });
      case 'upgrade':   return doUpgrade(p);
      case 'changepw':  return doChangePw(p);
      case 'newrec':    return doNewRecovery(p);
      case 'deleteaccount': return doDeleteAccount(p);
      case 'shareput':  return json(sharePut(p));
      case 'sharelist': return json({ ok: true, shares: shareList() });
      case 'sharedel':  shareDel(String(p.id || '')); return json({ ok: true, shares: shareList() });
      case 'vexport':   return json({ ok: true, ...vaultExport() });
      case 'vget':      return json({ ok: true, records: readVault(vaultBook()), state: CTX_ACCOUNT.state });
      case 'vput':      { const ver = writeVault(vaultBook(), String(p.key || ''), Number(p.ver) || 0, String(p.data || '')); countStats({ save: 1 }); return json({ ok: true, ver: ver }); }
      case 'vphotoput': return json({ ok: true, id: vaultPhotoPut(String(p.data || '')) });
      case 'vphotoget': return json({ ok: true, data: vaultPhotoGet(String(p.id || '')) });
      case 'vphotodel': vaultPhotoDel(String(p.id || '')); return json({ ok: true });
      case 'vfinish':   return doVaultFinish(p);
      default:
        return json({ ok: false, error: 'bad-action' });
    }
  } catch (err) {
    const m = String(err);
    if (!/too-many|stale/.test(m)) logEvent('error', CTX_USER, (p.action || '') + ': ' + m);
    return json({ ok: false, error: m });
  }
}

// ── Limits against abuse ─────────────────────────────────────────────────────
// Apps Script never sees a caller's IP address, so limits count per account (or, for sign-up, for everyone) in the
// script cache, which forgets on its own. Each limit is generous for a person and tight for a script.
const REQUEST_MAX = 12000000;   // characters in one request (a vault record is at most 8 MB)
const PHOTO_MAX = 5000000;      // characters in one photo (the site sends ~0.5 MB; encrypted ones a little more)
const VAULT_KEYS_MAX = 16;      // records in an encrypted cellar (it uses a handful: tab:Ark1, tab:Journal …)
const VAULT_PARTS_MAX = 600;    // 40 000-character parts in one, ~24 MB
const LOGIN_TRIES = 5, LOCK_SECONDS = 900;          // wrong passwords before a username waits 15 minutes
const SIGNUPS_PER_HOUR = 5, BAD_INVITES_PER_HOUR = 20;
const RATES = { post: [30, 21600], comment: [100, 21600], photo: [60, 21600], atlas: [100, 21600], follow: [200, 21600] }; // [max, seconds]
function scriptCache() { return typeof CacheService !== 'undefined' ? CacheService.getScriptCache() : null; }
function peekCount(key) { const c = scriptCache(); return c ? Number(c.get(key)) || 0 : 0; }
function bumpCount(key, seconds) { const c = scriptCache(); if (!c) return 0; const n = peekCount(key) + 1; c.put(key, String(n), seconds); return n; }
// one more of something an account does: refused past its limit
function rateLimit(kind) {
  const r = RATES[kind]; if (!r || inEngine()) return;
  if (bumpCount('rl:' + kind + ':' + normUser(CTX_USER || 'cellar'), r[1]) > r[0]) { logEvent('rate-limit', CTX_USER, kind); throw new Error('too-many'); }
}

// ── Watching it run (API 36): unusual events go to a "Log" tab (time, kind, user, detail) — lockouts, refused
// requests, errors, sign-ups — at most LOG_PER_HOUR of each kind an hour, so a flood can't turn into a flood of writes,
// and only the newest LOG_KEEP rows are kept. dailyReport() (installDailyReport() runs it every morning) emails the
// owner when the last day's counts pass ALERTS, the accounts near MAX_USERS, or the newest backup is over 8 days old.
const LOG_SHEET = 'Log', LOG_COLS = ['Time', 'Kind', 'User', 'Detail'], LOG_KEEP = 1000, LOG_PER_HOUR = 50;
const ALERTS = { signup: 3, lockout: 3, error: 5, 'rate-limit': 20, gateway: 10, 'signup-busy': 1, 'client-error': 10 };
function logSheet() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  let sh = book.getSheetByName(LOG_SHEET);
  if (!sh) { sh = book.insertSheet(LOG_SHEET); sh.appendRow(LOG_COLS); }
  return sh;
}
function logEvent(kind, user, detail) {
  if (inEngine()) return;
  try {
    if (bumpCount('log:' + kind, 3600) > LOG_PER_HOUR) return;
    const sh = logSheet();
    sh.appendRow([new Date(), kind, clip(user, 40), clip(detail, 300)]);
    const extra = sh.getLastRow() - 1 - LOG_KEEP;
    if (extra > 100) sh.deleteRows(2, extra); // trim now and then, not on every write
  } catch (err) { /* the log never breaks a request */ }
}
function lastDay(now) {
  const sh = logSheet(), last = sh.getLastRow(), since = now - 864e5, out = [];
  if (last < 2) return out;
  sh.getRange(2, 1, last - 1, LOG_COLS.length).getValues().forEach(r => {
    const t = r[0] instanceof Date ? r[0].getTime() : Date.parse(r[0]);
    if (t >= since) out.push({ time: t, kind: String(r[1]), user: String(r[2] || ''), detail: String(r[3] || '') });
  });
  return out;
}
function dailyReport() {
  const now = Date.now(), events = lastDay(now), counts = {};
  events.forEach(e => { counts[e.kind] = (counts[e.kind] || 0) + 1; });
  const why = Object.keys(ALERTS).filter(k => (counts[k] || 0) >= ALERTS[k]).map(k => k + ': ' + counts[k] + ' in 24 hours');
  const users = listUsers().length, cap = Math.max(1, Number(setting('MAX_USERS')) || 50);
  if (users >= 0.9 * cap) why.push('accounts: ' + users + ' of ' + cap);
  const it = backupsFolder().getFolders(), dirs = [];
  while (it.hasNext()) dirs.push(it.next().getName());
  const hasSchedule = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'backupNow');
  let newest = dirs.sort().pop(), age = newest ? (now - Date.parse(newest)) / 864e5 : null;
  // backups are daily: with a schedule (even the old weekly one) the check makes one when the newest is over a day old
  if (hasSchedule && (age === null || age > 1)) {
    try { backupNow(); const it2 = backupsFolder().getFolders(), d2 = []; while (it2.hasNext()) d2.push(it2.next().getName());
      newest = d2.sort().pop(); age = newest ? (now - Date.parse(newest)) / 864e5 : null; } catch (err) { logEvent('error', '', 'backup: ' + err); }
  }
  if (hasSchedule && (age === null || age > 2)) why.push('backups: ' + (newest ? 'newest is ' + newest : 'none yet'));
  try { sharePrune(); } catch (err) { logEvent('error', '', 'shares: ' + err); } // expired shared lists go
  const summary = Object.keys(counts).sort().map(k => k + ' ' + counts[k]).join(', ') || 'no events';
  if (!why.length) return told('All quiet: ' + summary + '; ' + users + ' accounts.');
  const lines = ['AllWine noticed something in the last 24 hours:', ''].concat(why.map(w => '• ' + w), ['', 'Latest events:'],
    events.slice(-15).reverse().map(e => Utilities.formatDate(new Date(e.time), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') +
      '  ' + e.kind + (e.user ? '  ' + e.user : '') + (e.detail ? '  ' + e.detail : '')),
    ['', 'The full list is in the "Log" tab of the master sheet.']);
  MailApp.sendEmail(reportTo(), 'AllWine: ' + why[0], lines.join('\n'));
  return told('Emailed ' + reportTo() + ': ' + why.join('; '));
}
// ── Shared lists (API 44): a member shares a read-only list of wines by a link. The browser encrypts the list
// (AES-GCM, a fresh key) and sends only the ciphertext; the key is in the link after the #, which a browser never sends,
// so neither this server nor the gateway can read a shared list. Kept: an id (128 random bits), the owner, the dates,
// the number of wines, and the ciphertext across up to SHARE_PARTS cells (a cell holds 50,000 characters). At most
// SHARE_MAX live per member, for 1–365 days; expired ones go at the next share and in the daily check.
const SHARES_SHEET = 'Shares', SHARE_COLS = ['Id', 'Owner', 'Created', 'Expires', 'Wines'], SHARE_PARTS = 8, SHARE_CELL = 49000, SHARE_MAX = 20;
function sharesSheet(make) {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  let sh = book.getSheetByName(SHARES_SHEET);
  if (!sh && make !== false) { sh = book.insertSheet(SHARES_SHEET); sh.appendRow(SHARE_COLS.concat(Array.from({ length: SHARE_PARTS }, (_, i) => 'Data' + (i + 1)))); }
  return sh;
}
const shareLive = (r, now) => Number(r[3]) > now;
function shareRows() { const sh = sharesSheet(false); if (!sh || sh.getLastRow() < 2) return []; return sh.getRange(2, 1, sh.getLastRow() - 1, SHARE_COLS.length + SHARE_PARTS).getValues(); }
function sharePrune() { const sh = sharesSheet(false), now = Date.now(); if (sh) dropRows(sh, r => r[0] && !shareLive(r, now)); }
function sharePut(p) {
  if (!CTX_ACCOUNT) throw new Error('account-only');
  const blob = String(p.blob || ''), days = Math.round(Number(p.days)), wines = Math.max(0, Math.round(Number(p.wines) || 0));
  if (!/^[A-Za-z0-9_-]{24,}$/.test(blob)) throw new Error('bad-share');
  if (blob.length > SHARE_PARTS * SHARE_CELL) throw new Error('share-too-big');
  if (!(days >= 1 && days <= 365)) throw new Error('bad-share');
  const lock = typeof LockService !== 'undefined' ? LockService.getScriptLock() : null; if (lock) lock.waitLock(20000);
  try {
    sharePrune();
    const who = normUser(CTX_USER), now = Date.now();
    if (shareRows().filter(r => normUser(r[1]) === who && shareLive(r, now)).length >= SHARE_MAX) throw new Error('too-many-shares');
    const id = randToken().slice(0, 32); // 128 random bits, hex
    const parts = Array.from({ length: SHARE_PARTS }, (_, i) => blob.slice(i * SHARE_CELL, (i + 1) * SHARE_CELL));
    const sh = sharesSheet(true), row = sh.getLastRow() + 1;
    // all text: a part could start with '=' or '+' (base64url can't, but nothing is left to chance) and dates stay numbers
    sh.getRange(row, 1, 1, SHARE_COLS.length + SHARE_PARTS).setNumberFormat('@')
      .setValues([[id, CTX_USER, String(now), String(now + days * 864e5), String(wines)].concat(parts)]);
    logEvent('share', CTX_USER, wines + ' wines, ' + days + ' days');
    return { ok: true, id: id, created: now, expires: now + days * 864e5, shares: shareList() };
  } finally { if (lock) lock.releaseLock(); }
}
function shareList() {
  const who = normUser(CTX_USER), now = Date.now();
  return shareRows().filter(r => normUser(r[1]) === who && shareLive(r, now))
    .map(r => ({ id: String(r[0]), created: Number(r[2]), expires: Number(r[3]), wines: Number(r[4]) }));
}
function shareDel(id) {
  const sh = sharesSheet(false), who = normUser(CTX_USER); if (!sh || !id) return;
  dropRows(sh, r => String(r[0]) === id && normUser(r[1]) === who);
}
function shareGet(id) {
  if (!/^[0-9a-f]{32}$/.test(id)) return { ok: false, error: 'share-gone' };
  const r = shareRows().find(x => String(x[0]) === id);
  if (!r || !shareLive(r, Date.now())) return { ok: false, error: 'share-gone' };
  return { ok: true, blob: r.slice(SHARE_COLS.length).map(String).join(''), created: Number(r[2]), expires: Number(r[3]), wines: Number(r[4]) };
}
function reportTo() { return setting('REPORT_EMAIL') || Session.getEffectiveUser().getEmail(); }
// Run once from the editor: check every morning at about 07:00 (running it again doesn't add a second schedule).
// Sends one email now, so you can see the alerts will arrive.
function installDailyReport() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'dailyReport').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('dailyReport').timeBased().everyDays(1).atHour(7).create();
  MailApp.sendEmail(reportTo(), 'AllWine: daily check installed',
    'From now on AllWine checks every morning and emails you here only when something looks unusual (many sign-ups, lockouts, errors or refused requests, accounts near the limit, or a missing backup).');
  return told('Daily check scheduled (about 07:00); a test email went to ' + reportTo() + '.');
}
const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
// A report from a visitor's browser (i18n.js sends at most three a page): the page, the script's file name and line,
// and the message with any address or long number taken out, into the Log as 'client-error' (the daily report counts them)
const CLIENT_PAGES = { cellar: 1, atlas: 1, burgundy: 1, domaine: 1, privacy: 1, share: 1 };
function logClientError(p) {
  const page = CLIENT_PAGES[p.page] ? p.page : 'other';
  const src = String(p.src || '').split(/[?#]/)[0].split('/').pop().replace(/[^\w.-]/g, '').slice(0, 60);
  const line = Math.max(0, Math.min(1e6, Math.floor(Number(p.line) || 0)));
  const msg = clip(String(p.msg || '').replace(/https?:\/\/\S+/g, '<url>').replace(/\S+@\S+/g, '<email>').replace(/\d{5,}/g, '#'), 160);
  if (msg) logEvent('client-error', '', page + ' ' + (src ? src + ':' + line + ' ' : '') + msg);
}

// ── Accounts (registry + per-user spreadsheet) ───────────────────────────────
// A "Users" tab in the bound (owner's) spreadsheet is the registry. Each row is
// one account: a salted password hash and the id of that user's own private
// spreadsheet. Passwords are never stored in the clear. Signups need the SIGNUP_CODE setting.

const USERS_SHEET = 'Users';
// Kdf … OldSheet belong to encrypted accounts (API 28): the browser's key-derivation settings and salt, the data key
// wrapped by the password and by the recovery code (useless without them), the recovery code's salt and its login key
// hashed, the vault spreadsheet, and the migration state ('' plain, 'migrating', 'done') with the plain sheet it left.
const USER_COLS = ['Username', 'Salt', 'Hash', 'SpreadsheetId', 'Token', 'Created',
                   'Kdf', 'KdfSalt', 'WrapKey', 'WrapRec', 'RecSalt', 'RecHash', 'VaultId', 'State', 'OldSheet', 'Email', 'LastSeen',
                   'WrapAdmin', 'AdminKid', 'AdminPub', 'AdminKey'];
const UCOL = {}; USER_COLS.forEach((c, i) => { UCOL[c] = i + 1; });

function usersSheet() {
  const book = SpreadsheetApp.getActiveSpreadsheet(); // registry always lives in the bound book
  let sh = book.getSheetByName(USERS_SHEET);
  if (!sh) { sh = book.insertSheet(USERS_SHEET); sh.appendRow(USER_COLS); return sh; }
  // a registry from before API 28 lacks the encryption columns: add their headers (existing rows read them as blank)
  const head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String);
  if (head.length < USER_COLS.length) sh.getRange(1, 1, 1, USER_COLS.length).setValues([USER_COLS]);
  return sh;
}
function setUser(u, field, value) { usersSheet().getRange(u.row, UCOL[field]).setValue(value); u[field.charAt(0).toLowerCase() + field.slice(1)] = value; }

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
      const c = k => String(rows[i][UCOL[k] - 1] === undefined ? '' : rows[i][UCOL[k] - 1]);
      return { row: i + 2, username: rows[i][0], salt: String(rows[i][1]),
               hash: String(rows[i][2]), spreadsheetId: String(rows[i][3]),
               token: String(rows[i][4]), kdf: c('Kdf'), kdfSalt: c('KdfSalt'), wrapKey: c('WrapKey'),
               wrapRec: c('WrapRec'), recSalt: c('RecSalt'), recHash: c('RecHash'), vaultId: c('VaultId'),
               state: c('State'), oldSheet: c('OldSheet'), email: c('Email'), lastSeen: c('LastSeen'),
               wrapAdmin: c('WrapAdmin'), adminKid: c('AdminKid'), adminPub: c('AdminPub'), adminKey: c('AdminKey') };
    }
  }
  return null;
}

function randToken() { return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''); }

// The Token cell holds up to MAX_TOKENS recent session tokens, newest last, so
// a phone and a laptop can be signed in at once. A cell written by an older
// version holds a single token and parses as a one-item list — nothing to migrate.
// Sessions still expire on their own: the site signs out after 60 idle minutes.
// Each is stored as "token@time" (ms) and lapses after SESSION_DAYS without use; the time is refreshed at most once a
// day, so a busy session doesn't write to the sheet on every request. A token from before API 34 has no time and is
// stamped on its next use.
const MAX_TOKENS = 5, SESSION_REFRESH_MS = 864e5;
function sessionMs() { return Math.max(1, Number(setting('SESSION_DAYS')) || 30) * 864e5; }
function tokenList(cell) {
  return String(cell || '').split(',').map(t => t.trim()).filter(Boolean)
    .map(t => { const i = t.lastIndexOf('@'); return i > 0 ? { t: t.slice(0, i), at: Number(t.slice(i + 1)) || 0 } : { t: t, at: 0 }; });
}
const tokenCell = list => list.map(x => x.t + '@' + x.at).join(', ');
const liveTokens = list => { const now = Date.now(); return list.filter(x => !x.at || now - x.at <= sessionMs()); };

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

// The folder that holds the master (bound) spreadsheet — everything is kept
// inside it. Just move the master sheet into a folder in Drive and the rest
// follows; falls back to My Drive root if it sits loose.
function masterFolder() {
  const parents = DriveApp.getFileById(SpreadsheetApp.getActiveSpreadsheet().getId()).getParents();
  return parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
}

// The folder holding the CURRENT user's spreadsheet: their own subfolder for a
// signed-up user, or the master folder for the owner. Photos are kept here too.
function userFolder() {
  const parents = DriveApp.getFileById(ss().getId()).getParents();
  return parents.hasNext() ? parents.next() : masterFolder();
}

// Create a fresh private spreadsheet for a new account inside its own subfolder
// of the master folder, seeded with the wine header row. Folders created before
// the AllWine rename keep their old names — everything binds by file id, so the
// name is cosmetic and existing accounts are unaffected.
function createUserSpreadsheet(username) {
  const folder = masterFolder().createFolder('AllWine — ' + username);
  const book = SpreadsheetApp.create('AllWine — ' + username);
  const sh = book.getSheets()[0];
  sh.setName(setting('SHEET_NAME'));
  sh.appendRow(Object.values(HEADERS)); // Producent, Land, Område, …
  DriveApp.getFileById(book.getId()).moveTo(folder); // tuck the sheet into its folder
  return book.getId();
}

// Sign-up (API 28): the browser sends a login key derived from the password, never the password itself, plus the
// account's data key wrapped two ways. The new account gets an empty vault spreadsheet of its own.
// Sign-up needs a personal invite from the "Invites" tab (used up by the account it creates) or the shared SIGNUP_CODE,
// and stops at MAX_USERS accounts. At most SIGNUPS_PER_HOUR a hour, and a burst of wrong codes pauses sign-up for
// everyone for an hour, so neither a leaked code nor guessing can flood the Drive with accounts.
function doSignup(p) {
  const lock = typeof LockService !== 'undefined' ? LockService.getScriptLock() : null;
  if (lock) lock.waitLock(20000);
  let out; SIGNED_UP = false;
  try { out = signupLocked(p); } finally { if (lock) lock.releaseLock(); }
  if (SIGNED_UP) countStats({ signup: 1 }); // counted once the lock is free
  return out;
}
let SIGNED_UP = false;
function signupLocked(p) {
  const shared = setting('SIGNUP_CODE'), code = String(p.code || '').trim();
  const invite = findInvite(code);
  if (!invite && !shared && !hasInvites()) return json({ ok: false, error: 'signup-disabled' });
  if (peekCount('signups') >= SIGNUPS_PER_HOUR || peekCount('badinvites') >= BAD_INVITES_PER_HOUR) { logEvent('signup-busy', p.user, ''); return json({ ok: false, error: 'signup-busy' }); }
  if (!invite && !(shared && code === shared)) { bumpCount('badinvites', 3600); return json({ ok: false, error: 'bad-invite' }); }
  if (p.pass !== undefined || !p.auth) return json({ ok: false, error: 'update-site' }); // a page from before encryption
  const username = String(p.user || '').trim();
  if (!/^[a-zA-Z0-9_.-]{3,24}$/.test(username)) return json({ ok: false, error: 'bad-username' });
  // the email is for the owner, to know who signed up (the Users tab and the admin page); nobody else sees it
  if (p.email === undefined) return json({ ok: false, error: 'update-site' }); // a page from before the email field
  const email = String(p.email || '').trim();
  if (email.length > 120 || !/^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ ok: false, error: 'bad-email' });
  if (!validKeys(p)) return json({ ok: false, error: 'bad-keys' });
  if (findUser(username)) return json({ ok: false, error: 'user-taken' });
  if (listUsers().length >= Math.max(1, Number(setting('MAX_USERS')) || 50)) return json({ ok: false, error: 'signup-full' });
  bumpCount('signups', 3600);

  const salt = randToken(), token = randToken();
  const folder = masterFolder().createFolder('AllWine — ' + username);
  const vaultId = createVaultBook(username, folder);
  const row = new Array(USER_COLS.length).fill('');
  const put = (k, v) => { row[UCOL[k] - 1] = v; };
  put('Username', username); put('Salt', salt); put('Hash', hashPass(salt, p.auth)); put('SpreadsheetId', vaultId);
  put('Token', token + '@' + Date.now()); put('Created', today()); put('Kdf', String(p.kdf)); put('KdfSalt', String(p.kdfSalt));
  put('WrapKey', String(p.wrapKey)); put('WrapRec', String(p.wrapRec)); put('RecSalt', String(p.recSalt));
  put('RecHash', hashPass(salt, p.recAuth)); put('VaultId', vaultId); put('State', 'done'); put('Email', email);
  usersSheet().appendRow(row);
  SIGNED_UP = true;
  if (invite) useInvite(invite, username);
  logEvent('signup', username, invite ? 'invite' : 'shared code');
  return json({ ok: true, user: username, token: token, state: 'done' });
}

// The feed and follows (only with the SOCIAL setting on)
function social(p) {
  switch (p.action) {
      case 'feed':
        return json({ ok: true, social: true, feed: readFeed(200), me: CTX_USER, users: listUsers(), follows: myFollows() });
      case 'feedpost':
        addFeed(p.entry || {});
        return json({ ok: true, feed: readFeed(200), me: CTX_USER, follows: myFollows() });
      case 'feeddelete':
        deleteFeed(Number(p.row));
        return json({ ok: true, feed: readFeed(200), me: CTX_USER, follows: myFollows() });
      case 'feedcheer':
        feedCheer(String(p.id || ''));
        return json({ ok: true, feed: readFeed(200), me: CTX_USER, follows: myFollows() });
      case 'feedcomment':
        addFeedComment(String(p.id || ''), p.text || '');
        return json({ ok: true, feed: readFeed(200), me: CTX_USER, follows: myFollows() });
      case 'follow':
        setFollow(String(p.target || ''), true); // not p.user: that's the signed-in account
        return json({ ok: true, follows: myFollows() });
      case 'unfollow':
        setFollow(String(p.target || ''), false);
        return json({ ok: true, follows: myFollows() });
  }
}
// Personal invites: a tab of codes in the bound sheet. A code works once; its row then records who used it and when.
// Make some with makeInvites() from the editor, or type your own codes into the Code column.
const INVITES_SHEET = 'Invites', INVITE_COLS = ['Code', 'Note', 'Created', 'UsedBy', 'UsedAt'];
const inviteKey = c => String(c || '').trim().toUpperCase().replace(/[\s-]+/g, '');
function invitesSheet(create) {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  let sh = book.getSheetByName(INVITES_SHEET);
  if (!sh && create) { sh = book.insertSheet(INVITES_SHEET); sh.appendRow(INVITE_COLS); }
  return sh;
}
function inviteRows() {
  const sh = invitesSheet(false); if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, INVITE_COLS.length).getValues().map((r, i) => ({ row: i + 2, code: r[0], usedBy: String(r[3] || '') }));
}
function hasInvites() { return inviteRows().some(r => inviteKey(r.code) && !r.usedBy); }
function findInvite(code) {
  const k = inviteKey(code); if (k.length < 6) return null;
  return inviteRows().find(r => !r.usedBy && safeEqual(inviteKey(r.code), k)) || null;
}
function useInvite(inv, username) { invitesSheet(false).getRange(inv.row, 4, 1, 2).setValues([[username, new Date()]]); }
// Run from the editor: five new codes in the Invites tab, returned to the log so you can send one to each friend.
function newInviteCode() {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let c = 'AW-'; for (let i = 0; i < 8; i++) { if (i === 4) c += '-'; c += A.charAt(Math.floor(Math.random() * A.length)); }
  return c;
}
// n new single-use codes (1–10 at a time), with a note of who they're for → the codes
function addInvites(n, note) {
  const sh = invitesSheet(true), codes = [], k = Math.max(1, Math.min(10, Math.floor(n) || 1));
  for (let i = 0; i < k; i++) { const c = newInviteCode(); codes.push(c); sh.appendRow([c, String(note || '').slice(0, 60), new Date(), '', '']); }
  return codes;
}
function makeInvites() { return told('New invite codes (each works once): ' + addInvites(5, '').join(', ')); }
// an unused code stops working (it stays in the tab, marked)
function revokeInvite(code) {
  const k = inviteKey(code), r = inviteRows().find(x => inviteKey(x.code) === k && !x.usedBy);
  if (r) invitesSheet(false).getRange(r.row, 4, 1, 2).setValues([['(revoked)', new Date()]]);
}
// What the owner's admin page shows. Dates as yyyy-MM-dd; a cellar's contents are not here (and couldn't be: encrypted).
function adminView() {
  const fmtDay = v => v instanceof Date ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(v || '').slice(0, 10);
  const sh = usersSheet(), last = sh.getLastRow();
  const rows = last >= 2 ? sh.getRange(2, 1, last - 1, USER_COLS.length).getValues() : [];
  const c = (r, k) => r[UCOL[k] - 1];
  const used = {}; inviteRows().forEach(x => { if (x.usedBy) used[normUser(x.usedBy)] = x.code; });
  const h = adminHelpKey(), adminKid = h ? h.kid : '';
  const users = rows.filter(r => String(r[0]).trim()).map(r => ({ user: String(r[0]), email: String(c(r, 'Email') || ''), created: fmtDay(c(r, 'Created')),
    lastSeen: fmtDay(c(r, 'LastSeen')), encrypted: String(c(r, 'State')) === 'done', invite: used[normUser(r[0])] || '',
    owner: isOwnerAccount({ spreadsheetId: String(c(r, 'SpreadsheetId')), oldSheet: String(c(r, 'OldSheet') || '') }),
    helpReady: !!adminKid && String(c(r, 'AdminKid') || '') === adminKid && !!String(c(r, 'WrapAdmin') || '') }));
  const ish = invitesSheet(false), ilast = ish ? ish.getLastRow() : 0;
  const invites = ilast >= 2 ? ish.getRange(2, 1, ilast - 1, INVITE_COLS.length).getValues().filter(r => String(r[0]).trim())
    .map(r => ({ code: String(r[0]), note: String(r[1] || ''), created: fmtDay(r[2]), usedBy: String(r[3] || ''), usedAt: fmtDay(r[4]) })) : [];
  return { ok: true, users, invites, max: Math.max(1, Number(setting('MAX_USERS')) || 50), stats: readStats(30), adminKid: adminKid };
}
// ---------- account help from the admin ----------
// The owner's browser makes a key pair once (Admin → Account help). Its public half and fingerprint sit in the owner's
// row; the private half too, but encrypted with the owner's own data key, so the server can't use it. Each member's
// browser wraps the member's data key to the public half (WrapAdmin) at sign-up, at a password login or recovery, or
// when asked for the password once. To help a member back in, the owner's browser unwraps that, makes a fresh recovery
// code and sends only the new wrapped copy (adminrecovery); the member then uses "Forgot password?" with the code.
// the owner's row, found in one read of the Users tab (this runs on every login)
function ownerRow() {
  const sh = usersSheet(), last = sh.getLastRow(), master = SpreadsheetApp.getActiveSpreadsheet().getId();
  if (last < 2) return null;
  const rows = sh.getRange(2, 1, last - 1, USER_COLS.length).getValues();
  const i = rows.findIndex(r => String(r[UCOL.SpreadsheetId - 1]) === master || String(r[UCOL.OldSheet - 1] || '') === master);
  return i < 0 ? null : findUser(rows[i][0]);
}
function adminHelpKey() { const o = ownerRow(); return o && o.adminPub && o.adminKid ? { pub: o.adminPub, kid: o.adminKid } : null; }
// what a member's browser needs to (re)wrap its key: nothing for the owner, nor once it's wrapped to the current key
function helpFor(u) {
  if (!u || !u.kdf || isOwnerAccount(u)) return undefined;
  const h = adminHelpKey();
  return h && u.adminKid !== h.kid ? h : undefined;
}
function adminKeySet(p) {
  const o = CTX_ACCOUNT;
  if (o.adminKid && !p.replace) return json({ ok: false, error: 'admin-key-exists' });
  const pub = String(p.pub || ''), key = String(p.key || ''), kid = String(p.kid || '');
  if (!/^[A-Za-z0-9+/=]{300,1200}$/.test(pub) || !/^v1\.[A-Za-z0-9+/=]{1000,8000}$/.test(key) || !/^[0-9a-f]{32}$/.test(kid)) return json({ ok: false, error: 'bad-keys' });
  setUser(o, 'AdminPub', pub); setUser(o, 'AdminKey', key); setUser(o, 'AdminKid', kid);
  logEvent('admin-key', o.username, 'account help turned on, key ' + kid.slice(0, 8));
  return json({ ok: true, kid: kid });
}
// a fresh recovery code for a member, made in the owner's browser: the member's own old code stops working
function adminRecovery(p) {
  const t = findUser(String(p.member || ''));
  if (!t || isOwnerAccount(t) || !t.kdf) return json({ ok: false, error: 'no-user' });
  const b64ish = v => /^[A-Za-z0-9+/=]{16,200}$/.test(String(v || ''));
  if (!b64ish(p.wrapRec) || !b64ish(p.recSalt) || !b64ish(p.recAuth)) return json({ ok: false, error: 'bad-keys' });
  setUser(t, 'WrapRec', String(p.wrapRec)); setUser(t, 'RecSalt', String(p.recSalt)); setUser(t, 'RecHash', hashPass(t.salt, p.recAuth));
  cleared(t.username); // a member locked out by wrong codes can try the new one at once
  logEvent('admin-recovery', t.username, 'a recovery code made by the admin');
  return json(adminView());
}

function validKeys(p) {
  const b64ish = v => /^[A-Za-z0-9+/=]{16,200}$/.test(String(v || ''));
  return /^pbkdf2-sha256-\d{6,7}$/.test(String(p.kdf || '')) && b64ish(p.kdfSalt) && b64ish(p.auth) && b64ish(p.wrapKey)
    && b64ish(p.wrapRec) && b64ish(p.recSalt) && b64ish(p.recAuth);
}

// Which key-derivation salt to use for a username. An unknown name gets a stable made-up salt, so the answer doesn't
// tell who has an account; an account from before encryption answers 'legacy' and still logs in with its password,
// once, to be upgraded.
function doPrelogin(p) {
  const u = findUser(p.user);
  if (u && !u.kdf) return json({ ok: true, legacy: true });
  if (u) return json({ ok: true, kdf: u.kdf, kdfSalt: u.kdfSalt });
  return json({ ok: true, kdf: 'pbkdf2-sha256-600000', kdfSalt: fakeSalt(p.user) });
}
function fakeSalt(user) {
  return hashPass(SpreadsheetApp.getActiveSpreadsheet().getId(), 'salt|' + normUser(user)).slice(0, 22) + '==';
}

function addSession(u) {
  const token = randToken();
  // Add this session rather than replacing the last one, dropping the oldest once we're past MAX_TOKENS.
  const live = liveTokens(tokenList(u.token)).concat({ t: token, at: Date.now() }).slice(-MAX_TOKENS);
  usersSheet().getRange(u.row, UCOL.Token).setValue(tokenCell(live));
  return token;
}

// Guessing passwords: after LOGIN_TRIES wrong ones a username (known or not, so the answer gives nothing away) waits
// LOCK_SECONDS, counted from the last wrong try. The right password resets the count.
const failKey = user => 'fail:' + normUser(user);
const lockedOut = user => peekCount(failKey(user)) >= LOGIN_TRIES;
function failed(user, error) {
  if (bumpCount(failKey(user), LOCK_SECONDS) === LOGIN_TRIES) logEvent('lockout', user, LOGIN_TRIES + ' wrong passwords');
  return json({ ok: false, error: error });
}
function cleared(user) { const c = scriptCache(); if (c) c.remove(failKey(user)); }
function doLogin(p) {
  if (lockedOut(p.user)) return json({ ok: false, error: 'locked' });
  const u = findUser(p.user);
  const salt = u ? u.salt : 'x';                 // still hash on miss to blur timing
  if (u && u.kdf) {
    // an encrypted account: only the derived login key opens it; a plain password is refused, so it never travels
    const ok = p.auth && safeEqual(hashPass(salt, p.auth), u.hash);
    if (!ok) return failed(p.user, 'bad-login');
    cleared(p.user);
    countStats({ login: 1 });
    return json({ ok: true, user: u.username, token: addSession(u), wrapKey: u.wrapKey, state: u.state || 'done', help: helpFor(u) });
  }
  const ok = u && p.pass !== undefined && safeEqual(hashPass(salt, p.pass || ''), u.hash);
  hashPass(salt, String(p.auth || ''));
  if (!ok) return failed(p.user, 'bad-login');
  cleared(p.user);
  return json({ ok: true, user: u.username, token: addSession(u), legacy: true });
}

// An account from before encryption, signed in with its password once more: store its new keys and give it an
// empty vault. Its plain sheet stays until the browser has copied everything into the vault and checked it
// (vaultExport → vput → vfinish).
function doUpgrade(p) {
  const u = CTX_ACCOUNT;
  if (!u) return json({ ok: false, error: 'no-account' });
  if (u.kdf) return json({ ok: false, error: 'already-upgraded' });
  if (!validKeys(p)) return json({ ok: false, error: 'bad-keys' });
  const owner = u.spreadsheetId === SpreadsheetApp.getActiveSpreadsheet().getId();
  const folder = owner ? masterFolder() : userFolder();
  const vaultId = createVaultBook(u.username, folder);
  setUser(u, 'Kdf', String(p.kdf)); setUser(u, 'KdfSalt', String(p.kdfSalt));
  setUser(u, 'WrapKey', String(p.wrapKey)); setUser(u, 'WrapRec', String(p.wrapRec)); setUser(u, 'RecSalt', String(p.recSalt));
  setUser(u, 'RecHash', hashPass(u.salt, p.recAuth)); setUser(u, 'Hash', hashPass(u.salt, p.auth));
  setUser(u, 'VaultId', vaultId); setUser(u, 'State', 'migrating'); setUser(u, 'OldSheet', u.spreadsheetId);
  return json({ ok: true, state: 'migrating' });
}

// Password change while signed in: the browser re-wraps the same data key under the new password.
function doChangePw(p) {
  const u = CTX_ACCOUNT;
  if (!u || !u.kdf) return json({ ok: false, error: 'no-account' });
  if (lockedOut(u.username)) return json({ ok: false, error: 'locked' });
  if (!p.oldAuth || !safeEqual(hashPass(u.salt, p.oldAuth), u.hash)) return failed(u.username, 'bad-login');
  if (!/^[A-Za-z0-9+/=]{16,200}$/.test(String(p.auth || '')) || !/^[A-Za-z0-9+/=]{16,200}$/.test(String(p.wrapKey || ''))
      || !/^[A-Za-z0-9+/=]{16,200}$/.test(String(p.kdfSalt || ''))) return json({ ok: false, error: 'bad-keys' });
  setUser(u, 'KdfSalt', String(p.kdfSalt)); setUser(u, 'WrapKey', String(p.wrapKey)); setUser(u, 'Hash', hashPass(u.salt, p.auth));
  usersSheet().getRange(u.row, UCOL.Token).setValue(p.token ? String(p.token) + '@' + Date.now() : ''); // other devices are signed out
  return json({ ok: true });
}

// A fresh recovery code (the old one stops working): the browser, holding the password, wraps the data key again.
function doNewRecovery(p) {
  const u = CTX_ACCOUNT;
  if (!u || !u.kdf) return json({ ok: false, error: 'no-account' });
  if (lockedOut(u.username)) return json({ ok: false, error: 'locked' });
  if (!p.oldAuth || !safeEqual(hashPass(u.salt, p.oldAuth), u.hash)) return failed(u.username, 'bad-login');
  const ok = v => /^[A-Za-z0-9+/=]{16,200}$/.test(String(v || ''));
  if (!ok(p.wrapRec) || !ok(p.recSalt) || !ok(p.recAuth)) return json({ ok: false, error: 'bad-keys' });
  setUser(u, 'WrapRec', String(p.wrapRec)); setUser(u, 'RecSalt', String(p.recSalt)); setUser(u, 'RecHash', hashPass(u.salt, p.recAuth));
  return json({ ok: true });
}

// Delete my account (API 36), with the password once more. Its files go to the owner's Drive trash (which empties itself
// after 30 days): the account's own folder (its vault or cellar spreadsheet, journal and vault photos), or the files
// one by one if they sit elsewhere. Its feed posts, comments and follows (both ways) are removed and its cheers taken
// back; invites it used and atlas corrections it made stay, signed "(deleted account)". Daily backups keep a copy
// until they rotate out (BACKUP_KEEP weeks). The owner's own account, whose cellar is the master sheet, can't be
// deleted this way.
const GONE = '(deleted account)';
function dropRows(sh, test) {
  const last = sh.getLastRow(); if (last < 2) return 0;
  const rows = sh.getRange(2, 1, last - 1, Math.max(1, sh.getLastColumn())).getValues();
  let n = 0;
  for (let i = rows.length - 1; i >= 0; i--) if (test(rows[i])) { sh.deleteRow(i + 2); n++; }
  return n;
}
function relabel(sh, col, who) {
  const last = sh.getLastRow(); if (last < 2 || col < 0) return;
  const r = sh.getRange(2, col + 1, last - 1, 1), v = r.getValues();
  if (v.some(x => normUser(x[0]) === who)) r.setValues(v.map(x => [normUser(x[0]) === who ? GONE : x[0]]));
}
function doDeleteAccount(p) {
  const u = CTX_ACCOUNT;
  if (!u) return json({ ok: false, error: 'no-account' });
  const masterId = SpreadsheetApp.getActiveSpreadsheet().getId();
  if (u.spreadsheetId === masterId || u.oldSheet === masterId) return json({ ok: false, error: 'owner-account' });
  if (lockedOut(u.username)) return json({ ok: false, error: 'locked' });
  const ok = u.kdf ? p.auth && safeEqual(hashPass(u.salt, p.auth), u.hash) : p.pass !== undefined && safeEqual(hashPass(u.salt, p.pass || ''), u.hash);
  if (!ok) return failed(u.username, 'bad-login');
  removeAccount(u);
  return json({ ok: true });
}
// An account and everything it left behind: its Drive files (trashed, so 30 days in the bin), its feed posts and
// follows, and its name on its invite code and in the atlas. The Users row goes last.
function removeAccount(u) {
  const masterId = SpreadsheetApp.getActiveSpreadsheet().getId();
  const lock = typeof LockService !== 'undefined' ? LockService.getScriptLock() : null;
  if (lock) lock.waitLock(20000);
  try {
    const who = normUser(u.username), master = masterFolder().getId();
    // the files: the account's own folder if it has one, else each file
    const ids = [u.vaultId, u.spreadsheetId, u.oldSheet].filter(id => id && id !== masterId);
    const folders = {};
    ids.forEach(id => { try {
      const f = DriveApp.getFileById(id), ps = f.getParents(), parent = ps.hasNext() ? ps.next() : null;
      if (parent && parent.getId() !== master && parent.getName() === 'AllWine — ' + u.username) folders[parent.getId()] = parent;
      else f.setTrashed(true);
    } catch (err) { /* already gone */ } });
    Object.keys(folders).forEach(id => folders[id].setTrashed(true));
    // the shared tabs
    const feed = feedSheet(), idx = feedIdx(feed);
    dropRows(feed, r => normUser(r[idx.From]) === who);
    if (idx.Cheers >= 0 && feed.getLastRow() > 1) {
      const r = feed.getRange(2, idx.Cheers + 1, feed.getLastRow() - 1, 1), v = r.getValues();
      r.setValues(v.map(x => [String(x[0] || '').split(',').map(t => t.trim()).filter(t => t && normUser(t) !== who).join(', ')]));
    }
    dropRows(fcmtSheet(), r => normUser(r[2]) === who);
    const shares = sharesSheet(false); if (shares) dropRows(shares, r => normUser(r[1]) === who);
    dropRows(followsSheet(), r => normUser(r[0]) === who || normUser(r[1]) === who);
    const inv = invitesSheet(false); if (inv) relabel(inv, INVITE_COLS.indexOf('UsedBy'), who);
    relabel(atlasSheet(), ATLAS_COLS.indexOf('User'), who);
    const now = findUser(u.username); // the row may have moved while we waited for the lock
    if (now) usersSheet().deleteRow(now.row);
  } finally { if (lock) lock.releaseLock(); }
}

// Forgotten password: the recovery code unwraps the data key in the browser (the server hands out the wrapped key
// and its salt, useless without the code) and proves itself with its own login key; the browser then sets a new
// password. All sessions end.
function doRecoverStart(p) {
  const u = findUser(p.user);
  if (u && u.kdf) return json({ ok: true, recSalt: u.recSalt, wrapRec: u.wrapRec });
  return json({ ok: true, recSalt: fakeSalt('rec|' + p.user), wrapRec: fakeSalt('wrap|' + p.user) + fakeSalt('w2|' + p.user) });
}
function doRecover(p) {
  if (lockedOut(p.user)) return json({ ok: false, error: 'locked' });
  const u = findUser(p.user);
  const salt = u ? u.salt : 'x';
  const ok = u && u.kdf && p.recAuth && safeEqual(hashPass(salt, p.recAuth), u.recHash);
  if (!ok) return failed(p.user, 'bad-recovery');
  cleared(p.user);
  if (!/^[A-Za-z0-9+/=]{16,200}$/.test(String(p.auth || '')) || !/^[A-Za-z0-9+/=]{16,200}$/.test(String(p.wrapKey || ''))
      || !/^[A-Za-z0-9+/=]{16,200}$/.test(String(p.kdfSalt || ''))) return json({ ok: false, error: 'bad-keys' });
  setUser(u, 'KdfSalt', String(p.kdfSalt)); setUser(u, 'WrapKey', String(p.wrapKey)); setUser(u, 'Hash', hashPass(u.salt, p.auth));
  usersSheet().getRange(u.row, UCOL.Token).setValue('');
  return json({ ok: true, user: u.username, token: addSession(findUser(u.username)), wrapKey: String(p.wrapKey), state: u.state, help: helpFor(u) });
}

// Usage numbers for the owner's admin page: a row a day in the "Stats" tab, a column per event. Only counts — never
// a name, an address or anything from a cellar (it's encrypted anyway). The server counts logins, members active
// that day, sign-ups, cellar saves and atlas visits; the page adds which pages it showed and how often.
const STATS_SHEET = 'Stats', STATS_KEEP = 400;
const STATS_COLS = { active: 'Active members', login: 'Logins', signup: 'Sign-ups', save: 'Cellar saves', atlas: 'Atlas visits',
  cellar: 'Cellar page', enjoyed: 'Enjoyed page', wishlist: 'Wishlist page', journal: 'Journal page', import: 'Imports',
  sommelier: 'Sommelier questions', export: 'Exports' };
const STATS_FROM_PAGE = ['cellar', 'enjoyed', 'wishlist', 'journal', 'import', 'sommelier', 'export'];
// what a page may report, at most 50 of each per call: a page can't inflate the server's own counts
function pageHits(ev) {
  const out = {};
  if (ev && typeof ev === 'object') STATS_FROM_PAGE.forEach(k => { const n = Math.round(Number(ev[k])); if (n > 0) out[k] = Math.min(50, n); });
  return out;
}
function countStats(ev) {
  if (inEngine()) return;
  const keys = Object.keys(ev || {}).filter(k => STATS_COLS[k] && Number(ev[k]) > 0);
  if (!keys.length) return;
  const lock = typeof LockService !== 'undefined' ? LockService.getScriptLock() : null;
  if (lock && !lock.tryLock(3000)) return; // a count is never worth holding a request up
  try {
    const book = SpreadsheetApp.getActiveSpreadsheet();
    let sh = book.getSheetByName(STATS_SHEET);
    const want = ['Date'].concat(Object.keys(STATS_COLS).map(k => STATS_COLS[k]));
    if (!sh) { sh = book.insertSheet(STATS_SHEET); sh.appendRow(want); }
    const head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String);
    want.forEach(c => { if (head.indexOf(c) < 0) { head.push(c); sh.getRange(1, head.length).setValue(c); } });
    const day = today(), last = sh.getLastRow();
    let row = last;
    if (last < 2 || ymd(sh.getRange(last, 1).getValue()) !== day) { row = last + 1; sh.getRange(row, 1).setNumberFormat('@').setValue(day); }
    const vals = sh.getRange(row, 1, 1, head.length).getValues()[0];
    keys.forEach(k => { const i = head.indexOf(STATS_COLS[k]); vals[i] = (Number(vals[i]) || 0) + Math.round(Number(ev[k])); });
    sh.getRange(row, 2, 1, head.length - 1).setValues([vals.slice(1)]);
    if (sh.getLastRow() - 1 > STATS_KEEP + 30) sh.deleteRows(2, sh.getLastRow() - 1 - STATS_KEEP);
  } catch (err) { /* a count never breaks a request */ } finally { if (lock) lock.releaseLock(); }
}
// The last n days for the admin page, oldest first, every day present (0 where nothing was counted)
function readStats(n) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(STATS_SHEET), by = {};
  if (sh && sh.getLastRow() >= 2) {
    const all = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues(), head = all[0].map(String);
    all.slice(1).forEach(r => { const o = {}; Object.keys(STATS_COLS).forEach(k => { const i = head.indexOf(STATS_COLS[k]); o[k] = i >= 0 ? Number(r[i]) || 0 : 0; }); by[ymd(r[0])] = o; });
  }
  // calendar days back from today, counted at noon UTC: steps of 24 hours would skip or repeat a day around a
  // change to or from summer time
  const days = [], t = today().split('-').map(Number);
  for (let d = n - 1; d >= 0; d--) {
    const day = Utilities.formatDate(new Date(Date.UTC(t[0], t[1] - 1, t[2] - d, 12)), 'UTC', 'yyyy-MM-dd');
    days.push(Object.assign({ day: day }, Object.keys(STATS_COLS).reduce((o, k) => (o[k] = (by[day] || {})[k] || 0, o), {})));
  }
  return days;
}

// Validate {user, token}; returns the user record or null.
function authToken(p) {
  const u = findUser(p.user);
  if (!u || !u.token || !p.token) return null;
  const list = tokenList(u.token), hit = list.find(x => safeEqual(p.token, x.t));
  if (!hit) return null;
  const now = Date.now(), live = liveTokens(list);
  if (live.indexOf(hit) < 0) { usersSheet().getRange(u.row, UCOL.Token).setValue(tokenCell(live)); return null; } // lapsed
  if (!hit.at || now - hit.at > SESSION_REFRESH_MS) { hit.at = now; usersSheet().getRange(u.row, UCOL.Token).setValue(tokenCell(live)); }
  // the day an account was last used, for the owner's admin page: written at most once a day, as text
  const day = today();
  if (u.lastSeen !== day) { try { usersSheet().getRange(u.row, UCOL.LastSeen).setNumberFormat('@').setValue(day); u.lastSeen = day; } catch (err) {} countStats({ active: 1 }); }
  return u;
}
// The owner: the account whose cellar is (or was, before encryption) this bound spreadsheet
function isOwnerAccount(u) {
  const master = SpreadsheetApp.getActiveSpreadsheet().getId();
  return !!u && (u.spreadsheetId === master || u.oldSheet === master);
}

// Run ONCE from the editor to give yourself an account whose cellar is THIS (the bound) spreadsheet, so your
// existing wines carry over: put OWNER_USER and OWNER_PASSWORD in Settings.gs, pick makeOwner in the function
// dropdown, Run — then blank OWNER_PASSWORD again. Accounts are kept in the "Users" tab, so an existing account
// (yours included) is never touched by this or by updating the script.
function makeOwner() {
  const username = setting('OWNER_USER'), password = setting('OWNER_PASSWORD');
  if (!username || !password) return told('Set OWNER_USER and OWNER_PASSWORD in Settings.gs first.');
  if (password.length < 8 || password === 'change-this') return told('Pick a real password (8+ characters) for OWNER_PASSWORD.');
  if (findUser(username)) return told('Account "' + username + '" already exists — nothing changed. Blank OWNER_PASSWORD in Settings.gs.');
  const salt = randToken();
  usersSheet().appendRow([username, salt, hashPass(salt, password),
                          SpreadsheetApp.getActiveSpreadsheet().getId(), randToken() + '@' + Date.now(), today()]);
  return told('Owner account "' + username + '" created, pointing at this spreadsheet. Now blank OWNER_PASSWORD in Settings.gs.');
}

// ── Encrypted vault (API 28) ─────────────────────────────────────────────────
// An encrypted account keeps its cellar, journal and wishlist as ciphertext in a spreadsheet of its own, one "Vault"
// tab of [Key, Ver, Updated, Part, Data] rows: each private tab is a record (key "tab:Ark1", "tab:Journal", …),
// split over rows of at most 40 000 characters. The browser decrypts them, runs this same file's cellar logic on the
// plain copy (vault-engine.js), and writes back the records that changed. Ver makes a write from a stale copy fail
// instead of overwriting another device's change. Journal photos are encrypted files in a "Vault" folder.
const PRIVATE_ACTIONS = { data: 1, add: 1, drink: 1, undrink: 1, delete: 1, deleted: 1, undelete: 1, rate: 1, setvalue: 1, setprice: 1, setdate: 1,
  setsize: 1, setwindow: 1, setinfo: 1, enjoysync: 1, classfill: 1, enjoyadd: 1, addmany: 1, setinfomany: 1, mergerows: 1, journal: 1, jadd: 1, jedit: 1,
  jdelete: 1, wish: 1, wadd: 1, wedit: 1, wdelete: 1, wtocellar: 1, photo: 1 };
const VAULT_TAB = 'Vault';
const VAULT_COLS = ['Key', 'Ver', 'Updated', 'Part', 'Data'];
const VAULT_PART = 40000, VAULT_MAX = 8000000;

function createVaultBook(username, folder) {
  const book = SpreadsheetApp.create('AllWine vault — ' + username);
  const sh = book.getSheets()[0];
  sh.setName(VAULT_TAB);
  sh.appendRow(VAULT_COLS);
  DriveApp.getFileById(book.getId()).moveTo(folder);
  return book.getId();
}
function vaultBook() {
  const u = CTX_ACCOUNT;
  if (!u || !u.vaultId) throw new Error('no-vault');
  return SpreadsheetApp.openById(u.vaultId);
}
function vaultSheet(book) {
  const sh = book.getSheetByName(VAULT_TAB);
  if (!sh) throw new Error('no-vault');
  return sh;
}
function readVault(book) {
  const sh = vaultSheet(book), last = sh.getLastRow(), out = {};
  if (last < 2) return out;
  const rows = sh.getRange(2, 1, last - 1, VAULT_COLS.length).getValues();
  const parts = {};
  rows.forEach(r => {
    const k = String(r[0]); if (!k) return;
    (parts[k] = parts[k] || []).push({ i: Number(r[3]) || 0, d: String(r[4] || ''), v: Number(r[1]) || 0, t: r[2] });
  });
  Object.keys(parts).forEach(k => {
    const ps = parts[k].sort((a, b) => a.i - b.i);
    out[k] = { ver: ps[0].v, data: ps.map(x => x.d).join(''), updated: feedTime(ps[0].t) };
  });
  return out;
}
function writeVault(book, key, baseVer, data) {
  if (!/^[a-z]+:[^\n]{1,80}$/.test(key)) throw new Error('bad-key');
  if (!/^v1\.[A-Za-z0-9+/=]+$/.test(data)) throw new Error('not-encrypted'); // only ciphertext is ever stored here
  if (data.length > VAULT_MAX) throw new Error('too-big');
  const lock = typeof LockService !== 'undefined' ? LockService.getScriptLock() : null;
  if (lock) lock.waitLock(20000);
  try {
    const sh = vaultSheet(book), last = sh.getLastRow();
    const rows = last >= 2 ? sh.getRange(2, 1, last - 1, 2).getValues() : [];
    let cur = 0; const mine = [];
    rows.forEach((r, i) => { if (String(r[0]) === key) { mine.push(i + 2); cur = Number(r[1]) || 0; } });
    if (cur !== baseVer) throw new Error('stale');
    // an encrypted cellar holds a handful of records; refuse more, and more than ~24 MB in all
    const keys = {}; rows.forEach(r => { keys[String(r[0])] = 1; }); keys[key] = 1;
    if (Object.keys(keys).length > VAULT_KEYS_MAX || rows.length - mine.length + Math.ceil(data.length / VAULT_PART) > VAULT_PARTS_MAX) throw new Error('too-big');
    // the old parts go bottom up, next-door rows together; the new ones in one write (a big cellar is ~70 parts)
    for (let i = mine.length - 1; i >= 0;) { let j = i; while (j > 0 && mine[j - 1] === mine[j] - 1) j--; sh.deleteRows(mine[j], i - j + 1); i = j - 1; }
    const ver = cur + 1, now = new Date(), parts = [];
    for (let i = 0, part = 0; i < data.length; i += VAULT_PART, part++) parts.push([key, ver, now, part, data.slice(i, i + VAULT_PART)]);
    if (parts.length) {
      const at = sh.getLastRow() + 1, need = at + parts.length - 1 - sh.getMaxRows();
      if (need > 0) sh.insertRowsAfter(sh.getMaxRows(), need);
      sh.getRange(at, 1, parts.length, 5).setValues(parts);
    }
    return ver;
  } finally { if (lock) lock.releaseLock(); }
}

// Journal photos of an encrypted account: ciphertext in a "Vault" folder next to its vault. Only files in that folder
// are served or deleted, so the API can't be used to read anything else in Drive.
function vaultPhotoFolder() {
  const parents = DriveApp.getFileById(vaultBook().getId()).getParents();
  const parent = parents.hasNext() ? parents.next() : masterFolder();
  const it = parent.getFoldersByName('Vault');
  return it.hasNext() ? it.next() : parent.createFolder('Vault');
}
function vaultPhotoFile(id) {
  const f = DriveApp.getFileById(id), folder = vaultPhotoFolder().getId(), parents = f.getParents();
  while (parents.hasNext()) if (parents.next().getId() === folder) return f;
  throw new Error('Unknown photo');
}
function vaultPhotoPut(data) {
  if (!/^v1\.[A-Za-z0-9+/=]+$/.test(data)) throw new Error('not-encrypted');
  if (data.length > PHOTO_MAX) throw new Error('too-big');
  rateLimit('photo');
  return vaultPhotoFolder().createFile('enc-' + Utilities.getUuid() + '.txt', data, MimeType.PLAIN_TEXT).getId();
}
function vaultPhotoGet(id) { return vaultPhotoFile(id).getBlob().getDataAsString(); }
function vaultPhotoDel(id) { try { vaultPhotoFile(id).setTrashed(true); } catch (err) {} }

// Migration, step 1: the plain private tabs of an account being upgraded, exactly as stored (dates as yyyy-MM-dd),
// for the browser to encrypt. Only while the account is 'migrating'.
function vaultExport() {
  const u = CTX_ACCOUNT;
  if (!u || u.state !== 'migrating') throw new Error('not-migrating');
  const tabs = {}, book = ss();
  [setting('SHEET_NAME'), JOURNAL_SHEET, WISHLIST_SHEET].forEach(name => {
    const sh = book.getSheetByName(name);
    if (!sh) return;
    const lr = sh.getLastRow(), lc = sh.getLastColumn();
    tabs[name] = lr && lc ? sh.getRange(1, 1, lr, lc).getValues().map(r => r.map(v => v instanceof Date ? ymd(v) : v)) : [];
  });
  const photos = tabs[JOURNAL_SHEET] ? Object.keys(journalPhotoIds()) : [];
  return { tabs: tabs, sheetName: setting('SHEET_NAME'), photos: photos };
}

// Migration, last step: the browser has written the vault and read it back. The plain copy goes: a friend's own
// spreadsheet and its journal photos to the Drive trash (Drive empties it after 30 days); in the owner's master book
// the private tabs are cleared, since that book also holds the shared Users, Feed and atlas tabs.
function doVaultFinish(p) {
  const u = CTX_ACCOUNT;
  if (!u || u.state !== 'migrating') return json({ ok: false, error: 'not-migrating' });
  if (p.verified !== true) return json({ ok: false, error: 'not-verified' });
  const book = ss(), photos = book.getSheetByName(JOURNAL_SHEET) ? journalPhotoIds() : {}, shared = feedPhotoIds();
  Object.keys(photos).forEach(id => { if (!shared[id]) trashPhoto(id); });
  const master = SpreadsheetApp.getActiveSpreadsheet().getId();
  if (u.spreadsheetId === master) {
    const main = book.getSheetByName(setting('SHEET_NAME'));
    if (main) main.clear();
    [JOURNAL_SHEET, WISHLIST_SHEET].forEach(n => { const sh = book.getSheetByName(n); if (sh) book.deleteSheet(sh); });
  } else {
    try { DriveApp.getFileById(u.spreadsheetId).setTrashed(true); } catch (err) {}
  }
  setUser(u, 'SpreadsheetId', u.vaultId);
  setUser(u, 'State', 'done');
  return json({ ok: true, state: 'done' });
}

// The legacy access code opens the master book's plain cellar; once the owner's cellar is encrypted there is none.
function ownerVaulted() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(USERS_SHEET);
  if (!sh || sh.getLastRow() < 2) return false;
  const master = SpreadsheetApp.getActiveSpreadsheet().getId();
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, USER_COLS.length).getValues();
  return rows.some(r => String(r[UCOL.OldSheet - 1]) === master && String(r[UCOL.State - 1]) === 'done');
}

// ── Social feed (shared across all accounts) ─────────────────────────────────
// One "Feed" tab in the bound (owner's) spreadsheet holds everyone's shared
// bottles. Posting is opt-in per item; prices are never included. A post can be
// addressed to one user (the "To" column) or left open to everyone.
const FEED_SHEET = 'Feed';
const FEED_COLS = ['Id', 'Time', 'From', 'Type', 'Producer', 'Wine', 'Vintage', 'Region', 'Rating', 'Note', 'To', 'Cheers', 'Photo'];
const FOLLOWS_SHEET = 'Follows';
const FCMT_SHEET = 'FeedComments';
const FCMT_COLS = ['PostId', 'Time', 'From', 'Text'];

function feedSheet() {
  const book = SpreadsheetApp.getActiveSpreadsheet(); // shared — always the master book
  let sh = book.getSheetByName(FEED_SHEET);
  if (!sh) { sh = book.insertSheet(FEED_SHEET); sh.appendRow(FEED_COLS); return sh; }
  // add any columns a pre-existing Feed tab is missing (e.g. Id/Cheers from an older version)
  const head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String);
  FEED_COLS.forEach(c => { if (head.indexOf(c) === -1) { sh.getRange(1, head.length + 1).setValue(c); head.push(c); } });
  return sh;
}
function feedIdx(sh) {
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const m = {}; FEED_COLS.forEach(c => m[c] = head.indexOf(c)); return m;
}

function feedTime(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm");
  return String(v || '');
}

// Newest first, capped to `limit`; each post carries its cheers + comments.
function readFeed(limit) {
  const sh = feedSheet();
  const idx = feedIdx(sh);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const start = Math.max(2, last - (limit || 200) + 1);
  const rows = sh.getRange(start, 1, last - start + 1, sh.getLastColumn()).getValues();
  const comments = readFeedComments();
  const g = (r, c) => idx[c] >= 0 ? r[idx[c]] : '';
  const out = rows.map((r, i) => {
    const id = String(g(r, 'Id') || '');
    const cheers = String(g(r, 'Cheers') || '').split(',').map(s => s.trim()).filter(Boolean);
    return {
      row: start + i, id, time: feedTime(g(r, 'Time')), from: String(g(r, 'From') || ''), type: String(g(r, 'Type') || ''),
      producer: String(g(r, 'Producer') || ''), wine: String(g(r, 'Wine') || ''), vintage: g(r, 'Vintage') === '' ? '' : g(r, 'Vintage'),
      region: String(g(r, 'Region') || ''), rating: g(r, 'Rating') === '' ? '' : g(r, 'Rating'),
      note: String(g(r, 'Note') || ''), to: String(g(r, 'To') || ''), photo: String(g(r, 'Photo') || ''),
      cheers: cheers, comments: comments[id] || [],
    };
  }).filter(e => e.producer || e.wine || e.note || e.photo);
  out.reverse();
  return out;
}

function addFeed(e) {
  const from = CTX_USER || 'cellar';
  if (!String(e.producer || '').trim() && !String(e.wine || '').trim() && !String(e.note || '').trim() && !e.photo)
    throw new Error('Empty post');
  rateLimit('post'); if (e.photo) rateLimit('photo');
  e = { producer: clip(e.producer, 120), wine: clip(e.wine, 160), vintage: clip(e.vintage, 12), region: clip(e.region, 80),
    rating: e.rating === '' || e.rating == null ? '' : Math.max(1, Math.min(10, Math.round(Number(e.rating) || 0))) || '',
    note: clip(e.note, 2000), to: clip(e.to, 40), type: ['bought', 'drank', 'note'].indexOf(e.type) >= 0 ? e.type : 'note', photo: e.photo };
  const sh = feedSheet(), idx = feedIdx(sh), row = new Array(sh.getLastColumn()).fill('');
  const set = (c, v) => { if (idx[c] >= 0) row[idx[c]] = v; };
  set('Id', Utilities.getUuid().slice(0, 8));
  set('Time', new Date()); set('From', from); set('Type', String(e.type || 'note'));
  set('Producer', e.producer || ''); set('Wine', e.wine || ''); set('Vintage', e.vintage || '');
  set('Region', e.region || ''); set('Rating', e.rating || ''); set('Note', e.note || ''); set('To', e.to || '');
  if (e.photo) set('Photo', savePhoto(e.photo, photoName({ date: '', producer: e.producer, wine: e.wine })));
  sh.appendRow(row);
}

// Feed photo ids (so getPhoto will serve them, same as journal photos).
function feedPhotoIds() {
  const sh = feedSheet(), idx = feedIdx(sh), last = sh.getLastRow(), ids = {};
  if (idx.Photo < 0 || last < 2) return ids;
  sh.getRange(2, idx.Photo + 1, last - 1, 1).getValues().forEach(r => {
    const v = String(r[0] || '').trim(); if (v) ids[v] = true;
  });
  return ids;
}

// Toggle the current user's 🍷 cheer on a post (found by its stable id).
function feedCheer(id) {
  id = String(id || ''); if (!id) throw new Error('Bad id');
  const sh = feedSheet(), idx = feedIdx(sh), last = sh.getLastRow();
  if (idx.Id < 0 || idx.Cheers < 0 || last < 2) return;
  const ids = sh.getRange(2, idx.Id + 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) {
      const cell = sh.getRange(i + 2, idx.Cheers + 1);
      const list = String(cell.getValue() || '').split(',').map(s => s.trim()).filter(Boolean);
      const me = String(CTX_USER || '').toLowerCase();
      const pos = list.findIndex(u => u.toLowerCase() === me);
      if (pos >= 0) list.splice(pos, 1); else list.push(CTX_USER || 'cellar');
      cell.setValue(list.join(', '));
      return;
    }
  }
}

function deleteFeed(rowNum) {
  const sh = feedSheet(), idx = feedIdx(sh);
  if (!rowNum || rowNum < 2 || rowNum > sh.getLastRow()) throw new Error('Bad row');
  const from = String(sh.getRange(rowNum, idx.From + 1).getValue() || '').trim().toLowerCase();
  if (from !== String(CTX_USER || '').trim().toLowerCase()) throw new Error('not-your-post');
  sh.deleteRow(rowNum);
}

// ── Feed comments (own tab, keyed by the post's stable id) ────────────────────
function fcmtSheet() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  let sh = book.getSheetByName(FCMT_SHEET);
  if (!sh) { sh = book.insertSheet(FCMT_SHEET); sh.appendRow(FCMT_COLS); }
  return sh;
}
function readFeedComments() {
  const sh = fcmtSheet(), last = sh.getLastRow(), g = {};
  if (last < 2) return g;
  sh.getRange(2, 1, last - 1, FCMT_COLS.length).getValues().forEach(r => {
    const id = String(r[0] || ''); if (!id) return;
    (g[id] = g[id] || []).push({ time: feedTime(r[1]), from: String(r[2] || ''), text: String(r[3] || '') });
  });
  return g;
}
function addFeedComment(id, text) {
  id = String(id || '').slice(0, 40); text = clip(text, 500);
  if (!id || !text) throw new Error('Empty comment');
  rateLimit('comment');
  fcmtSheet().appendRow([id, new Date(), CTX_USER || 'cellar', text]);
}

// ── Following (who each user follows) — a shared "Follows" tab ────────────────
function followsSheet() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  let sh = book.getSheetByName(FOLLOWS_SHEET);
  if (!sh) { sh = book.insertSheet(FOLLOWS_SHEET); sh.appendRow(['Follower', 'Following']); }
  return sh;
}
// Usernames the current user follows.
function myFollows() {
  const sh = followsSheet(), last = sh.getLastRow(), me = String(CTX_USER || '').toLowerCase();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 2).getValues()
    .filter(r => String(r[0]).trim().toLowerCase() === me)
    .map(r => String(r[1]).trim()).filter(Boolean);
}
function setFollow(target, on) {
  target = String(target || '').trim();
  const me = String(CTX_USER || '').trim();
  if (!target || target.toLowerCase() === me.toLowerCase()) throw new Error('Bad target');
  if (on && !listUsers().some(n => n.toLowerCase() === target.toLowerCase())) throw new Error('Bad target'); // only real accounts
  rateLimit('follow');
  const sh = followsSheet(), last = sh.getLastRow();
  const rows = last > 1 ? sh.getRange(2, 1, last - 1, 2).getValues() : [];
  const at = rows.findIndex(r => String(r[0]).trim().toLowerCase() === me.toLowerCase()
    && String(r[1]).trim().toLowerCase() === target.toLowerCase());
  if (on && at < 0) sh.appendRow([me, target]);
  else if (!on && at >= 0) sh.deleteRow(at + 2);
}

// Usernames of all accounts (for the "send to" picker). Names only, no secrets.
function listUsers() {
  const sh = usersSheet();
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0]).trim()).filter(Boolean);
}

function sheet() {
  const name = setting('SHEET_NAME');
  const sh = ss().getSheetByName(name);
  if (!sh) throw new Error('Sheet tab "' + name + '" not found');
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
  idx.size      = head.indexOf(SIZE_HEADER);
  idx.drinkFrom = head.indexOf(DRINK_FROM_HEADER);
  idx.drinkTo   = head.indexOf(DRINK_TO_HEADER);
  idx.elsewhere = head.indexOf(ELSEWHERE_HEADER);
  idx.location  = head.indexOf(LOCATION_HEADER);
  for (const f of Object.keys(BIZ_HEADERS)) idx[f] = head.indexOf(BIZ_HEADERS[f]);
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
    w.size = idx.size >= 0 ? String(r[idx.size] === null || r[idx.size] === undefined ? '' : r[idx.size]).trim() : '';
    w.drinkFrom = idx.drinkFrom >= 0 ? (r[idx.drinkFrom] === null || r[idx.drinkFrom] === undefined ? '' : r[idx.drinkFrom]) : '';
    w.drinkTo   = idx.drinkTo   >= 0 ? (r[idx.drinkTo]   === null || r[idx.drinkTo]   === undefined ? '' : r[idx.drinkTo])   : '';
    w.elsewhere = idx.elsewhere >= 0 && String(r[idx.elsewhere]).trim() !== '' && String(r[idx.elsewhere]).trim() !== '0';
    w.location = idx.location >= 0 ? String(r[idx.location] === null || r[idx.location] === undefined ? '' : r[idx.location]).trim() : '';
    for (const f of Object.keys(BIZ_HEADERS)) { const v = idx[f] >= 0 ? r[idx[f]] : ''; w[f] = v === null || v === undefined ? '' : (BIZ_NUM.indexOf(f) >= 0 || typeof v !== 'string' ? v : v.trim()); }
    wines.push(w);
  });
  return wines;
}

function addWine(wine) {
  const sh = sheet();
  ensureCol(sh, ACQUIRED_HEADER);
  if (String(wine.size || '').trim()) ensureCol(sh, SIZE_HEADER);
  if (String(wine.location || '').trim()) ensureCol(sh, LOCATION_HEADER);
  ensureBiz(sh, [wine]);
  const idx = colIndexes(sh);
  const row = new Array(sh.getLastColumn()).fill('');
  for (const field of Object.keys(HEADERS)) {
    if (wine[field] !== undefined && wine[field] !== null && wine[field] !== '') {
      row[idx[field]] = wine[field];
    }
  }
  if (!String(row[idx.producer]).trim()) throw new Error('Producer is required');
  // the form only sends sensible numbers, but the server doesn't count on it: 1–9999 bottles, a price of 0 or more
  row[idx.qty] = Math.min(MAX_BOTTLES, Math.max(1, Math.round(Number(wine.qty) || 1)));
  const pr = Number(wine.price);
  row[idx.price] = wine.price === '' || wine.price == null || !isFinite(pr) || pr < 0 ? '' : pr;
  for (const f of Object.keys(HEADERS)) if (typeof row[idx[f]] === 'string') row[idx[f]] = plainText(row[idx[f]]);
  row[idx.acquired] = ymd(wine.acquired) || today();
  if (idx.size >= 0 && String(wine.size || '').trim()) row[idx.size] = String(wine.size).trim();
  if (idx.location >= 0 && String(wine.location || '').trim()) row[idx.location] = String(wine.location).trim();
  for (const f of Object.keys(BIZ_HEADERS)) if (idx[f] >= 0) row[idx[f]] = bizValue(f, wine[f]);
  sh.appendRow(row);
}

// Record a wine you drank but never owned (e.g. at a restaurant) as an
// already-drunk row: qty 1, drunk 1, no acquired date — shows in Enjoyed but
// not in the live cellar.
function enjoyAdd(e) {
  if (!String(e.producer || '').trim()) throw new Error('Producer is required');
  const sh = sheet();
  ensureCol(sh, RATING_HEADER);
  ensureCol(sh, DRUNK_DATE_HEADER);
  ensureCol(sh, ELSEWHERE_HEADER);
  if (String(e.size || '').trim()) ensureCol(sh, SIZE_HEADER);
  const idx = colIndexes(sh);
  const row = new Array(sh.getLastColumn()).fill('');
  const set = (f, v) => { if (idx[f] >= 0 && v !== undefined && v !== null && v !== '') row[idx[f]] = v; };
  set('producer', e.producer);
  set('name', e.wine !== undefined ? e.wine : e.name);
  set('region', e.region); set('country', e.country); set('grape', e.grape);
  set('type', e.type); set('vintage', e.vintage); set('price', e.price);
  set('source', e.place !== undefined ? e.place : e.source); set('note', e.note);
  set('size', String(e.size || '').trim());
  set('commune', e.commune); set('classification', e.classification);
  row[idx.elsewhere] = 1;
  row[idx.qty] = 1;
  row[idx.drunk] = 1;
  row[idx.drunkDate] = ymd(e.drunkDate || e.date) || today();
  if (idx.rating >= 0 && e.rating !== '' && e.rating !== null && e.rating !== undefined)
    row[idx.rating] = Math.max(1, Math.min(10, Number(e.rating) || 0));
  sh.appendRow(row);
}

// Bulk import (the site's Import dialog reads the file in the browser): appends the new wines in one write, and adds
// bottles to rows already in the cellar ("bumps": {row, qty, drunk}). The optional columns are created as needed.
const IMPORT_MAX = 5000;
const MAX_BOTTLES = 9999; // of one wine: more is a typo
// text is kept as text: Sheets would run "=IMPORTXML(…)" as a formula (the encrypted vault has no formulas to run)
function plainText(v) { v = String(v).trim(); return !inEngine() && /^[=+@]/.test(v) ? "'" + v : v; }
// the same for a value that may be a number or a date: only text is touched
const asText = v => typeof v === 'string' ? plainText(v) : v;
const IMPORT_COLS = { rating: RATING_HEADER, value: VALUE_HEADER, drunkDate: DRUNK_DATE_HEADER, size: SIZE_HEADER, drinkFrom: DRINK_FROM_HEADER, drinkTo: DRINK_TO_HEADER, elsewhere: ELSEWHERE_HEADER, location: LOCATION_HEADER };
function addMany(wines, bumps) {
  if (!Array.isArray(wines) || !Array.isArray(bumps)) throw new Error('Bad import');
  if (wines.length + bumps.length > IMPORT_MAX) throw new Error('Too many rows (at most ' + IMPORT_MAX + ')');
  const blank = v => v === undefined || v === null || String(v).trim() === '';
  wines.forEach(w => { if (!w || blank(w.producer)) throw new Error('Producer is required'); });
  const sh = sheet();
  ensureCol(sh, ACQUIRED_HEADER);
  Object.keys(IMPORT_COLS).forEach(f => { if (wines.some(w => !blank(w[f]))) ensureCol(sh, IMPORT_COLS[f]); });
  ensureBiz(sh, wines);
  const idx = colIndexes(sh), width = sh.getLastColumn(), last = sh.getLastRow();
  const count = v => Math.min(MAX_BOTTLES, Math.max(0, Math.round(Number(v) || 0)));
  bumps.forEach(b => { const r = Number(b.row); if (!r || r < 2 || r > last) throw new Error('Bad row'); });
  // the bottle columns are read once, then only written (one read per bump would flush every write)
  const qtys = bumps.length ? sh.getRange(2, idx.qty + 1, last - 1, 1).getValues() : [];
  const drunks = bumps.length ? sh.getRange(2, idx.drunk + 1, last - 1, 1).getValues() : [];
  bumps.forEach(b => {
    const r = Number(b.row);
    const qc = sh.getRange(r, idx.qty + 1), dc = sh.getRange(r, idx.drunk + 1);
    const q0 = Number(qtys[r - 2][0]) || 1, d0raw = drunks[r - 2][0];
    const d0 = String(d0raw).trim().toLowerCase() === 'x' ? q0 : Math.min(q0, Number(d0raw) || 0);
    const q = count(b.qty), d = Math.min(count(b.drunk), q);
    qc.setValue(q0 + q); qtys[r - 2][0] = q0 + q; // the same row twice adds up
    if (d || String(d0raw).trim().toLowerCase() === 'x') { dc.setValue(d0 + d); drunks[r - 2][0] = d0 + d; }
  });
  if (!wines.length) return;
  const num = v => { const n = Number(v); return isFinite(n) && n >= 0 ? n : ''; };
  const text = plainText;
  const rows = wines.map(w => {
    const row = new Array(width).fill('');
    for (const f of Object.keys(HEADERS)) if (!blank(w[f])) row[idx[f]] = typeof w[f] === 'string' ? text(w[f]) : w[f];
    const qty = Math.max(1, count(w.qty));
    row[idx.qty] = qty;
    row[idx.drunk] = Math.min(qty, count(w.drunk)) || '';
    if (!blank(w.price)) row[idx.price] = num(w.price);
    if (!blank(w.acquired)) row[idx.acquired] = ymd(w.acquired);
    if (!blank(w.rating)) row[idx.rating] = Math.max(1, Math.min(10, Number(w.rating) || 0));
    if (!blank(w.value)) row[idx.value] = num(w.value);
    if (!blank(w.drunkDate)) row[idx.drunkDate] = ymd(w.drunkDate);
    if (!blank(w.size)) row[idx.size] = String(w.size).trim();
    if (!blank(w.drinkFrom)) row[idx.drinkFrom] = num(w.drinkFrom);
    if (!blank(w.drinkTo)) row[idx.drinkTo] = num(w.drinkTo);
    if (!blank(w.elsewhere) && Number(w.elsewhere)) row[idx.elsewhere] = 1;
    for (const f of Object.keys(BIZ_HEADERS)) if (idx[f] >= 0 && !blank(w[f])) { try { row[idx[f]] = bizValue(f, w[f]); } catch (e) { row[idx[f]] = ''; } }
    if (!blank(w.location)) row[idx.location] = text(String(w.location));
    return row;
  });
  const need = last + rows.length - sh.getMaxRows(); // a range can't reach past the sheet's rows (appendRow grows it, getRange doesn't)
  if (need > 0) sh.insertRowsAfter(sh.getMaxRows(), need);
  sh.getRange(last + 1, 1, rows.length, width).setValues(rows);
}

// "Tidy up" in the site: many setInfo edits at once ({row, fields}). Only the cells that change are written, so a formula
// elsewhere in the sheet is left alone.
function setInfoMany(edits) {
  if (!Array.isArray(edits) || edits.length > IMPORT_MAX) throw new Error('Bad edits');
  const sh = sheet(), last = sh.getLastRow();
  if (edits.some(e => e && e.fields && 'location' in e.fields)) ensureCol(sh, LOCATION_HEADER);
  ensureBiz(sh, edits.map(e => e && e.fields));
  edits.forEach(e => { const r = Number(e && e.row); if (!r || r < 2 || r > last) throw new Error('Bad row');
    if (e.fields && 'producer' in e.fields && !String(e.fields.producer || '').trim()) throw new Error('Producer is required'); });
  const idx = colIndexes(sh); // read once: thousands of edits fit in one call
  edits.forEach(e => writeInfo(sh, idx, Number(e.row), e.fields || {}));
}

// Rows that hold the same wine, joined into the first ({keep, drop: [rows]}): bottles and drunk bottles add up, price and
// value become the bottle-weighted mean, notes, locations and sources are kept side by side, the earliest acquired and
// latest drunk dates win. The other rows are then deleted.
function mergeRows(groups) {
  if (!Array.isArray(groups) || groups.length > IMPORT_MAX) throw new Error('Bad groups');
  const sh = sheet(), last = sh.getLastRow(), idx = colIndexes(sh), width = sh.getLastColumn();
  const seen = {};
  groups.forEach(g => {
    const rows = [Number(g && g.keep)].concat((g && g.drop || []).map(Number));
    if (rows.length < 2) throw new Error('Bad groups');
    rows.forEach(r => { if (!r || r < 2 || r > last || seen[r]) throw new Error('Bad row'); seen[r] = 1; });
  });
  const val = (row, i) => i >= 0 ? row[i] : '';
  const blank = v => v === '' || v === null || v === undefined;
  const all = sh.getRange(2, 1, last - 1, width).getValues(); // one read, then only writes
  const drops = [];
  groups.forEach(g => {
    const rows = [Number(g.keep)].concat(g.drop.map(Number));
    const data = rows.map(r => all[r - 2]);
    const qty = data.map(d => Number(val(d, idx.qty)) || 1);
    const drunk = data.map((d, i) => String(val(d, idx.drunk)).trim().toLowerCase() === 'x' ? qty[i] : Math.min(qty[i], Number(val(d, idx.drunk)) || 0));
    const sumQ = qty.reduce((a, b) => a + b, 0), sumD = drunk.reduce((a, b) => a + b, 0);
    const mean = i => { let w = 0, s = 0; data.forEach((d, j) => { const v = val(d, i); if (!blank(v) && isFinite(Number(v))) { s += Number(v) * qty[j]; w += qty[j]; } });
      return w ? Math.round(s / w * 100) / 100 : ''; };
    const join = i => { const out = []; data.forEach(d => { String(val(d, i) || '').split(' · ').forEach(x => { x = x.trim(); if (x && out.indexOf(x) < 0) out.push(x); }); }); return out.join(' · '); };
    const pick = (i, better) => { let b = ''; data.forEach(d => { const v = ymd(val(d, i)); if (v && (!b || better(v, b))) b = v; }); return b; };
    const set = (i, v) => { if (i >= 0) sh.getRange(rows[0], i + 1).setValue(v); };
    set(idx.qty, sumQ); set(idx.drunk, sumD || '');
    set(idx.price, mean(idx.price)); if (idx.value >= 0) set(idx.value, mean(idx.value));
    [idx.note, idx.source, idx.location].forEach(i => { if (i >= 0) set(i, plainText(join(i))); });
    if (idx.acquired >= 0) set(idx.acquired, pick(idx.acquired, (a, b) => a < b));
    if (idx.drunkDate >= 0) set(idx.drunkDate, pick(idx.drunkDate, (a, b) => a > b));
    if (idx.rating >= 0) { const rs = data.map(d => Number(val(d, idx.rating))).filter(x => x > 0); if (rs.length) set(idx.rating, Math.max.apply(null, rs)); }
    // fields the kept row lacks, from the others
    ['commune', 'region', 'country', 'classification', 'type', 'grape', 'size', 'drinkFrom', 'drinkTo'].forEach(f => {
      const i = idx[f]; if (i === undefined || i < 0 || !blank(val(data[0], i))) return;
      const d = data.find(x => !blank(val(x, i))); if (d) set(i, val(d, i));
    });
    g.drop.forEach(r => drops.push(Number(r)));
  });
  // bottom up, so the rows above keep their numbers; next-door rows go in one deleteRows
  drops.sort((a, b) => b - a);
  for (let i = 0; i < drops.length;) {
    let j = i; while (j + 1 < drops.length && drops[j + 1] === drops[j] - 1) j++;
    sh.deleteRows(drops[j], j - i + 1); i = j + 1;
  }
}

// Edit a wine's descriptive fields in place (only the INFO_FIELDS given; producer can't be blanked).
function setInfo(rowNum, fields) {
  const sh = sheet();
  if (!rowNum || rowNum < 2 || rowNum > sh.getLastRow()) throw new Error('Bad row');
  if ('location' in fields) ensureCol(sh, LOCATION_HEADER);
  ensureBiz(sh, [fields]);
  writeInfo(sh, colIndexes(sh), rowNum, fields);
}
// only writes, so many of them in a row are sent to the sheet together (a read in between would flush each one)
function writeInfo(sh, idx, rowNum, fields) {
  if ('producer' in fields && !String(fields.producer || '').trim()) throw new Error('Producer is required');
  INFO_FIELDS.forEach(f => {
    if (!(f in fields)) return;
    let v = fields[f] === null || fields[f] === undefined ? '' : fields[f];
    if (typeof v === 'string') v = v.trim();
    if (f === 'vintage' && /^\d{4}$/.test(String(v))) v = Number(v);
    if (f in BIZ_HEADERS) { if (idx[f] < 0) return; v = bizValue(f, v); } // a blank on a column that isn't there yet: nothing to write
    sh.getRange(rowNum, idx[f] + 1).setValue(asText(v));
  });
}

// Journal entries that were logged under a wine's old name follow it to the new one.
// Matched on producer + wine + vintage, ignoring case and spacing; only the identity fields change.
function renameJournal(old, fields) {
  const sh = journalSheet(), last = sh.getLastRow();
  if (last < 2) return 0;
  const k = v => String(v === null || v === undefined ? '' : v).trim().toLowerCase().replace(/\s+/g, ' ');
  const map = { producer: 'producer', name: 'wine', vintage: 'vintage', country: 'country', region: 'region', grape: 'grape', commune: 'commune', classification: 'classification' };
  // create the journal columns the new values need
  const want = {}; Object.entries(map).forEach(([wf, jf]) => { if (wf in fields) want[jf] = fields[wf]; });
  ensureJournalCols(sh, want);
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const col = jf => head.indexOf(JHEADERS[jf]);
  const rows = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  let n = 0;
  rows.forEach((r, i) => {
    const same = k(r[col('producer')]) === k(old.producer) && k(r[col('wine')]) === k(old.wine)
      && (col('vintage') < 0 ? !k(old.vintage) : k(r[col('vintage')]) === k(old.vintage));
    if (!same) return;
    Object.entries(want).forEach(([jf, v]) => { const c = col(jf); if (c >= 0) sh.getRange(i + 2, c + 1).setValue(v === null || v === undefined ? '' : asText(v)); });
    n++;
  });
  return n;
}

// Keep a journal-created Enjoyed row (one bottle, drunk, never owned) in step with its entry after an edit.
// Refuses any other row, so a cellar wine is never overwritten from the journal.
function enjoySync(rowNum, e) {
  const sh = sheet();
  if (!rowNum || rowNum < 2 || rowNum > sh.getLastRow()) throw new Error('Bad row');
  ensureCol(sh, DRUNK_DATE_HEADER);
  const idx = colIndexes(sh);
  const cell = f => sh.getRange(rowNum, idx[f] + 1);
  const qty = Number(cell('qty').getValue()) || 1, drunkRaw = String(cell('drunk').getValue()).trim().toLowerCase();
  const drunk = drunkRaw === 'x' ? qty : Number(drunkRaw) || 0;
  const acquired = idx.acquired >= 0 ? String(sh.getRange(rowNum, idx.acquired + 1).getValue()).trim() : '';
  const marked = idx.elsewhere >= 0 && String(sh.getRange(rowNum, idx.elsewhere + 1).getValue()).trim() !== '';
  if (!(qty === 1 && drunk === 1 && (marked || !acquired))) throw new Error('Not a journal-created row');
  const put = (f, v) => { if (v !== undefined) cell(f).setValue(v === null ? '' : asText(v)); };
  put('producer', e.producer); put('name', e.wine); put('vintage', e.vintage);
  put('region', e.region); put('country', e.country); put('grape', e.grape);
  if (e.commune !== undefined) put('commune', e.commune);
  if (e.classification !== undefined) put('classification', e.classification);
  put('source', e.place); put('note', e.note);
  if (e.date) sh.getRange(rowNum, idx.drunkDate + 1).setValue(ymd(e.date));
  if (e.rating !== undefined) { const i = ensureCol(sh, RATING_HEADER); sh.getRange(rowNum, i + 1).setValue(e.rating === '' ? '' : Math.max(1, Math.min(10, Number(e.rating) || 0))); }
  if (e.price !== undefined) sh.getRange(rowNum, idx.price + 1).setValue(e.price === '' ? '' : Math.max(0, Number(e.price) || 0));
}

// Fill in blank classifications in one go (the site suggests them from the wine's name and commune).
// Never overwrites one already set.
function classFill(wines, entries) {
  const sh = sheet(), idx = colIndexes(sh), lastW = sh.getLastRow();
  (wines || []).forEach(({ row, value }) => {
    if (!row || row < 2 || row > lastW || !String(value || '').trim()) return;
    const c = sh.getRange(row, idx.classification + 1);
    if (!String(c.getValue()).trim()) c.setValue(plainText(value));
  });
  if (!(entries || []).length) return;
  const js = journalSheet(), i = ensureCol(js, JHEADERS.classification), lastJ = js.getLastRow();
  entries.forEach(({ row, value }) => {
    if (!row || row < 2 || row > lastJ || !String(value || '').trim()) return;
    const c = js.getRange(row, i + 1);
    if (!String(c.getValue()).trim()) c.setValue(plainText(value));
  });
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

// A deleted wine isn't gone at once: the row goes to a "Slettet" tab, with its headings, for DELETED_DAYS days, and
// "Recently deleted" in the cellar puts it back (the same columns, matched by heading). In an encrypted cellar the
// tab is one more encrypted tab of the vault.
const DELETED_SHEET = 'Slettet', DELETED_DAYS = 30;
function deletedSheet(create) {
  const book = ss(); let sh = book.getSheetByName(DELETED_SHEET);
  if (!sh && create) { sh = book.insertSheet(DELETED_SHEET); sh.appendRow(['Slettet', 'Id', 'Overskrifter', 'Række']); }
  return sh;
}
function deleteWine(rowNum) {
  const sh = sheet();
  if (!rowNum || rowNum < 2 || rowNum > sh.getLastRow()) throw new Error('Bad row');
  const cols = sh.getLastColumn();
  const head = sh.getRange(1, 1, 1, cols).getValues()[0], row = sh.getRange(rowNum, 1, 1, cols).getValues()[0];
  const plain = v => v instanceof Date ? ymd(v) : v;
  deletedSheet(true).appendRow([new Date().toISOString(), Utilities.getUuid(), JSON.stringify(head.map(plain)), JSON.stringify(row.map(plain))]);
  sh.deleteRow(rowNum);
  purgeDeleted();
}
// the kept rows, newest first, as wines (what the list shows)
function deletedRows() {
  const sh = deletedSheet(false); if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, 4).getValues().map((r, i) => {
    let head = [], row = []; try { head = JSON.parse(r[2]); row = JSON.parse(r[3]); } catch (e) {}
    return { at: String(r[0] instanceof Date ? r[0].toISOString() : r[0]), id: String(r[1]), head, row, sheetRow: i + 2 };
  });
}
function listDeleted() {
  const pick = (d, h) => { const i = d.head.indexOf(h); return i >= 0 ? d.row[i] : ''; };
  return deletedRows().map(d => ({ id: d.id, at: d.at, producer: pick(d, HEADERS.producer), name: pick(d, HEADERS.name), vintage: pick(d, HEADERS.vintage),
    qty: pick(d, HEADERS.qty), drunk: pick(d, HEADERS.drunk) })).reverse();
}
function purgeDeleted() {
  const sh = deletedSheet(false); if (!sh) return;
  const old = Date.now() - DELETED_DAYS * 864e5;
  deletedRows().filter(d => !(Date.parse(d.at) >= old)).reverse().forEach(d => sh.deleteRow(d.sheetRow)); // bottom up
}
function undeleteWine(id) {
  const d = deletedRows().find(x => x.id === id);
  if (!d) throw new Error('not-found');
  const sh = sheet();
  // every heading the row had, in today's columns (a column it had that the sheet has lost comes back)
  d.head.forEach(h => { if (String(h).trim()) ensureCol(sh, String(h)); });
  const now = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  sh.appendRow(now.map(h => { const i = d.head.indexOf(h); return i >= 0 ? d.row[i] : ''; }));
  deletedSheet(false).deleteRow(d.sheetRow);
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

// Set what a bottle cost. Needed because a wine can reach the sheet through a
// journal entry, where the price is often only remembered later.
function setPrice(rowNum, value) {
  const sh = sheet();
  if (!rowNum || rowNum < 2 || rowNum > sh.getLastRow()) throw new Error('Bad row');
  const idx = colIndexes(sh);
  const empty = value === '' || value === null || value === undefined;
  const v = empty ? '' : Math.max(0, Number(value) || 0);
  sh.getRange(rowNum, idx.price + 1).setValue(v);
}

// Set a bottle's format. Blank means an ordinary 75 cl bottle.
function setSize(rowNum, value) {
  const sh = sheet();
  if (!rowNum || rowNum < 2 || rowNum > sh.getLastRow()) throw new Error('Bad row');
  const i = ensureCol(sh, SIZE_HEADER);
  sh.getRange(rowNum, i + 1).setValue(String(value || '').trim());
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
                   country: 'Land', region: 'Område', commune: 'Kommune', classification: 'Klassifikation', grape: 'Drue',
                   place: 'Sted', rating: 'Rating', price: 'Pris', note: 'Note', photo: 'Foto' };

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
    if (i >= 0 && e[f] !== undefined && e[f] !== null && e[f] !== '') row[i] = asText(e[f]);
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
    if (i >= 0) sh.getRange(rowNum, i + 1).setValue(e[f] === undefined || e[f] === null ? '' : asText(e[f]));
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
// Each user's photos live in a "Journalfotos" folder next to their own sheet —
// so a user's photos sit inside their own subfolder. The site asks for a photo
// by file id and only ids present in that user's Journal are served, so the API
// can't be used to read other files in Drive.

const PHOTO_FOLDER = 'Journalfotos';
function photoFolder() {
  const parent = userFolder();
  const it = parent.getFoldersByName(PHOTO_FOLDER);
  return it.hasNext() ? it.next() : parent.createFolder(PHOTO_FOLDER);
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
  if (b64.length > PHOTO_MAX) throw new Error('too-big');
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
  // only serve photos that appear in this user's journal or in the shared feed (an encrypted account's journal photos
  // are encrypted files, fetched with vphotoget; its journal isn't readable here)
  const vaulted = CTX_ACCOUNT && CTX_ACCOUNT.state === 'done';
  if (!feedPhotoIds()[id] && (vaulted || !journalPhotoIds()[id])) throw new Error('Unknown photo');
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
    if (i >= 0 && e[f] !== undefined && e[f] !== null && e[f] !== '') row[i] = asText(e[f]);
  }
  sh.appendRow(row);
}

function updateWishlist(rowNum, e) {
  const sh = wishlistSheet();
  if (!rowNum || rowNum < 2 || rowNum > sh.getLastRow()) throw new Error('Bad row');
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  for (const [f, h] of Object.entries(WHEADERS)) {
    const i = head.indexOf(h);
    if (i >= 0) sh.getRange(rowNum, i + 1).setValue(e[f] === undefined || e[f] === null ? '' : asText(e[f]));
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

// ── Burgundy atlas corrections (shared, in the master book) ──────────────────
// An append-only log: the newest row for a (climat, producer) pair wins, and
// "remove" deletes that holding from the map. The site applies them over the
// holdings shipped in burgundy-data.js, so nothing is lost if a row is wrong —
// delete the row and the original figure comes back.
const ATLAS_SHEET = 'AtlasEdits';
const ATLAS_COLS = ['Time', 'User', 'Climat', 'Producer', 'Ha', 'Kind', 'Since', 'Action', 'Note'];
function atlasSheet() {
  const book = SpreadsheetApp.getActiveSpreadsheet(); // shared — always the master book
  let sh = book.getSheetByName(ATLAS_SHEET);
  if (!sh) { sh = book.insertSheet(ATLAS_SHEET); sh.appendRow(ATLAS_COLS); }
  return sh;
}
function readAtlas(withUser) { // usernames only go to signed-in callers
  const sh = atlasSheet(), last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, ATLAS_COLS.length).getValues().map(r => ({
    time: feedTime(r[0]), user: withUser ? String(r[1] || '') : '', climat: String(r[2] || ''), producer: String(r[3] || ''),
    ha: r[4] === '' ? null : Number(r[4]), kind: String(r[5] || ''), since: r[6] === '' ? null : Number(r[6]),
    action: String(r[7] || 'set'), note: String(r[8] || ''),
  })).filter(e => e.climat && e.producer);
}
function addAtlasEdit(e) {
  const who = CTX_USER || 'cellar';
  rateLimit('atlas');
  const allowed = setting('ATLAS_EDITORS').split(',').map(normUser).filter(Boolean);
  if (allowed.length && allowed.indexOf(normUser(who)) === -1) throw new Error('not-an-atlas-editor');
  const climat = String(e.climat || '').trim(), producer = String(e.producer || '').trim().slice(0, 80);
  if (!/^[a-z0-9_]{2,40}$/.test(climat) || !producer) throw new Error('bad-edit');
  const action = e.action === 'remove' ? 'remove' : 'set';
  const ha = e.ha === '' || e.ha == null ? '' : Number(e.ha);
  if (ha !== '' && !(ha >= 0 && ha < 200)) throw new Error('bad-ha');
  const kind = ['', 'f', 's'].indexOf(String(e.kind || '')) >= 0 ? String(e.kind || '') : '';
  const since = e.since === '' || e.since == null ? '' : Math.round(Number(e.since));
  if (since !== '' && !(since > 1000 && since < 2200)) throw new Error('bad-since');
  atlasSheet().appendRow([new Date(), who, climat, producer, ha, kind, since, action, String(e.note || '').slice(0, 400)]);
}

// ── Backups ──────────────────────────────────────────────────────────────────
// backupNow() copies the master spreadsheet (accounts, invites, feed, follows, atlas corrections, your own cellar) and
// every account's spreadsheet — its encrypted vault, or a plain cellar from before encryption — into a dated folder
// under "Backups" next to the master sheet, with a manifest of what is where, and keeps the newest BACKUP_KEEP.
// installDailyBackup() runs it every night at about 04:00, and the daily check makes one if the newest is more than a
// day old. Backups are kept for BACKUP_KEEP weeks. Encrypted cellars stay encrypted in the copies: only
// their owners' passwords or recovery codes open them. Journal photos are files in Drive and aren't copied.
function backupsFolder() {
  const root = masterFolder(), it = root.getFoldersByName('Backups');
  return it.hasNext() ? it.next() : root.createFolder('Backups');
}
function backupNow() {
  const master = SpreadsheetApp.getActiveSpreadsheet(), masterId = master.getId();
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm");
  const dir = backupsFolder().createFolder(stamp), lines = ['AllWine backup ' + stamp, ''];
  const copy = (id, name) => { const f = DriveApp.getFileById(id).makeCopy(name, dir); lines.push(name + '\t' + f.getId()); };
  copy(masterId, 'master');
  let n = 0, failed = 0;
  readUsers().forEach(u => {
    const ids = {};
    if (u.vaultId) ids[u.vaultId] = 'vault';
    if (u.spreadsheetId && u.spreadsheetId !== masterId && !ids[u.spreadsheetId]) ids[u.spreadsheetId] = 'cellar';
    Object.keys(ids).forEach(id => {
      try { copy(id, normUser(u.username) + ' — ' + ids[id]); n++; }
      catch (err) { failed++; lines.push('could not copy ' + u.username + ' ' + ids[id] + ': ' + err); }
    });
  });
  dir.createFile('manifest.txt', lines.join('\n'), MimeType.PLAIN_TEXT);
  // keep BACKUP_KEEP weeks of them (the folder names sort by date), and always the newest 7
  const weeks = Math.max(1, Number(setting('BACKUP_KEEP')) || 8), cutoff = Date.now() - weeks * 7 * 864e5, all = [], it = backupsFolder().getFolders();
  while (it.hasNext()) all.push(it.next());
  all.sort((a, b) => b.getName() < a.getName() ? -1 : 1).slice(7).filter(f => !(Date.parse(f.getName()) >= cutoff)).forEach(f => f.setTrashed(true));
  return told('Backup ' + stamp + ': the master sheet and ' + n + ' account spreadsheet(s)' + (failed ? ', ' + failed + ' could not be copied (see manifest.txt)' : '') + '.');
}
// Run once from the editor: back up every night at about 04:00 (running it again doesn't add a second schedule).
function installDailyBackup() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'backupNow').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('backupNow').timeBased().everyDays(1).atHour(4).create();
  return told('Daily backup scheduled (every night ~04:00). ' + backupNow());
}
// the old weekly schedule, now daily
function installWeeklyBackup() { return installDailyBackup(); }
// Put one account back as it was in a backup: set RESTORE_USER and RESTORE_FROM (the backup folder's name, e.g.
// 2026-11-01T04:00) in Settings.gs, run this, then blank them again. The account then uses a copy of the backed-up
// spreadsheet (its current one is kept, renamed "replaced"), and its devices are signed out so they reload.
function restoreFromBackup() {
  const user = normUser(setting('RESTORE_USER')), from = setting('RESTORE_FROM');
  if (!user || !from) return told('Set RESTORE_USER and RESTORE_FROM in Settings.gs first.');
  const u = findUser(user); if (!u) return told('No account "' + user + '".');
  const dirs = backupsFolder().getFoldersByName(from); if (!dirs.hasNext()) return told('No backup folder "' + from + '" in Backups.');
  const kind = u.vaultId ? 'vault' : 'cellar', files = dirs.next().getFilesByName(user + ' — ' + kind);
  if (!files.hasNext()) return told('That backup has no ' + kind + ' for "' + user + '".');
  const currentId = u.vaultId || u.spreadsheetId, current = DriveApp.getFileById(currentId);
  const parents = current.getParents(), home = parents.hasNext() ? parents.next() : masterFolder();
  const restored = files.next().makeCopy('AllWine ' + kind + ' — ' + u.username, home);
  current.setName(current.getName() + ' (replaced ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd') + ')');
  if (u.vaultId) setUser(u, 'VaultId', restored.getId());
  if (u.spreadsheetId === currentId) setUser(u, 'SpreadsheetId', restored.getId());
  usersSheet().getRange(u.row, UCOL.Token).setValue('');
  return told('Restored ' + kind + ' of "' + u.username + '" from ' + from + '. Blank RESTORE_USER and RESTORE_FROM again.');
}
function readUsers() {
  return listUsers().map(findUser).filter(Boolean);
}

function json(obj) {
  obj.v = API_VERSION;
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
