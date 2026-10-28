// The encrypted account's session: decrypts the vault, runs the cellar's private actions in the browser
// (vault-engine.js, the same Code.gs the server runs) and writes back, encrypted, the tabs an action changed. Shared
// things — the feed, follows, atlas corrections — still go to the server as before. Also: the one-time migration of
// a plain account into its vault, checked before the plain copy is let go.
//
//   await VAULT.start({ post, user, token, dek, codeUrl })   → opens the vault
//   await VAULT.call({ action: "add", wine })               → the same response the server would give
//   await VAULT.migrate({ post, user, token, dek, onStep })  → plain sheet → vault, verified, then vfinish
//
// Speed: each request to Apps Script takes 2–3 seconds, so the vault's records (ciphertext only) are kept on the
// device: start() opens the cellar from that copy at once and fetches the server's copy in the background
// (onRefresh() when it differed). The password's key-derivation salt is remembered per username, which saves the
// prelogin request.
(function (root) {
"use strict";
const node = typeof module !== "undefined" && module.exports;
const VC = node ? require("./vault-crypto.js") : root.VCRYPTO;
const VE = node ? require("./vault-engine.js") : root.VAULT_ENGINE;

const PRIVATE = new Set(["data", "add", "drink", "undrink", "delete", "deleted", "undelete", "rate", "setvalue", "setprice", "setdate", "setsize",
  "setwindow", "setinfo", "enjoysync", "classfill", "enjoyadd", "addmany", "setinfomany", "mergerows", "journal", "jadd", "jedit", "jdelete",
  "wish", "wadd", "wedit", "wdelete", "wtocellar"]);
const SHARED_TABS = ["Journal", "Ønskeliste", "Slettet"]; // plus the wine tab (meta.sheetName); nothing else is ever stored
let S = null; // { post, user, token, dek, engine, sheetName, vers: {key: ver}, src, photoCache, recs, busy, writes }

// ── The device's copy of the vault: the server's records as they are, encrypted (useless without the password) ──
const CDB = "allwine-cache", CSTORE = "vault";
// like the key store (vault-crypto.js), it gives up after a few seconds rather than hang the page: without it the
// cellar comes from the server, only slower
const CDB_WAIT = 4000;
const cdbWait = p => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("idb-timeout")), CDB_WAIT))]);
function cdb() {
  return cdbWait(new Promise((res, rej) => { const r = indexedDB.open(CDB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(CSTORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error("idb-blocked")); }));
}
async function cacheGet(user) {
  if (node || typeof indexedDB === "undefined") return null;
  try { const db = await cdb(); return await cdbWait(new Promise(res => { const r = db.transaction(CSTORE).objectStore(CSTORE).get(String(user).toLowerCase());
    r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); })); } catch (e) { return null; }
}
// writes to the copy go one after another, in the order they were asked for, so an older copy never lands last
let cacheQ = Promise.resolve();
function cacheWrite(fn) {
  if (node || typeof indexedDB === "undefined") return Promise.resolve();
  return (cacheQ = cacheQ.then(async () => { try { const db = await cdb(); await cdbWait(new Promise(res => {
    const t = db.transaction(CSTORE, "readwrite"); fn(t.objectStore(CSTORE)); t.oncomplete = res; t.onerror = res; t.onabort = res; })); } catch (e) {} }));
}
function cachePut(user, records) {
  const snap = JSON.parse(JSON.stringify(records)); // as it is now: later saves queue their own
  return cacheWrite(st => st.put({ records: snap, saved: Date.now() }, String(user).toLowerCase()));
}
function forgetCache(user) {
  if (user) saltDrop(user);
  return cacheWrite(st => { user ? st.delete(String(user).toLowerCase()) : st.clear(); });
}
// the key-derivation settings of an account that logged in on this device (not secret: the server gives them to anyone)
const saltKey = user => "vinKdf:" + String(user).toLowerCase();
function saltGet(user) { try { const v = JSON.parse(localStorage.getItem(saltKey(user)) || "null"); return v && v.kdfSalt ? v : null; } catch (e) { return null; } }
function saltPut(user, pre) { try { localStorage.setItem(saltKey(user), JSON.stringify({ kdf: pre.kdf, kdfSalt: pre.kdfSalt })); } catch (e) {} }
function saltDrop(user) { try { localStorage.removeItem(saltKey(user)); } catch (e) {} }

const aad = (user, key) => String(user).toLowerCase() + "|" + key;
async function srv(post, params) {
  const r = await post(params);
  if (!r.ok) { const e = new Error(String(r.error || "unknown-error").replace(/^Error: /, "")); e.data = r; throw e; }
  return r;
}
let SRC = null;
async function codeSource(url) {
  if (SRC) return SRC;
  if (node) SRC = require("fs").readFileSync(require("path").join(__dirname, "apps-script", "Code.gs"), "utf8");
  else { const res = await fetch(url || "apps-script/Code.gs?v=42"); if (!res.ok) throw new Error("engine-load " + res.status); SRC = await res.text(); }
  return SRC;
}
const keepTabs = (all, sheetName) => Object.fromEntries(Object.entries(all).filter(([n]) => n === sheetName || SHARED_TABS.includes(n)));

// Read and decrypt the whole vault: {sheetName, tabs, vers, records}
async function load(post, user, token, dek) {
  const r = await srv(post, { user, token, action: "vget" });
  return Object.assign(await decode(user, dek, r.records || {}), { state: r.state });
}
async function decode(user, dek, records) {
  const vers = {}, tabs = {}; let sheetName = "Ark1", prefs = null;
  for (const [key, rec] of Object.entries(records)) {
    vers[key] = rec.ver;
    const plain = JSON.parse(await VC.decrypt(dek, rec.data, aad(user, key)));
    if (key === "meta:cellar") sheetName = plain.sheetName || sheetName;
    else if (key === "meta:prefs") prefs = plain;
    else if (key.slice(0, 4) === "tab:") tabs[key.slice(4)] = plain;
  }
  return { sheetName, tabs, vers, records, prefs };
}
async function put(post, user, token, dek, vers, key, value) {
  const data = await VC.encrypt(dek, JSON.stringify(value), aad(user, key));
  const r = await srv(post, { user, token, action: "vput", key, ver: vers[key] || 0, data });
  vers[key] = r.ver;
  if (S && S.user === user && S.recs) { S.recs[key] = { ver: r.ver, data }; cachePut(user, S.recs); }
}

// Open the vault: from the device's copy when there is one (and o.fresh isn't set), then the server's copy in the
// background; otherwise from the server.
async function start(o) {
  const cached = o.fresh ? null : await cacheGet(o.user);
  let v = null;
  if (cached && cached.records) { try { v = await decode(o.user, o.dek, cached.records); } catch (e) { v = null; } } // another key: ignore it
  const fromCache = !!v;
  const [src] = await Promise.all([codeSource(o.codeUrl), fromCache ? null : load(o.post, o.user, o.token, o.dek).then(x => { v = x; })]);
  openWith(o, v, src);
  if (!fromCache) cachePut(o.user, v.records);
  if (!S.vers["meta:cellar"]) await put(S.post, S.user, S.token, S.dek, S.vers, "meta:cellar", { sheetName: S.sheetName });
  if (fromCache) S.synced = refresh(o, S);
  else S.synced = Promise.resolve(false);
  return true;
}
function openWith(o, v, src) {
  // a brand-new vault has no wine tab yet: start it with the column headers the server would give a new sheet
  if (!v.tabs[v.sheetName]) v.tabs[v.sheetName] = [];
  S = { post: o.post, user: o.user, token: o.token, dek: o.dek, sheetName: v.sheetName, vers: v.vers, src, photoCache: {},
        recs: Object.assign({}, v.records), prefs: v.prefs || null, busy: 0, writes: 0, onRefresh: o.onRefresh, onLost: o.onLost, today: o.today,
        engine: VE.create(src, v.tabs, { sheetName: v.sheetName, today: o.today }) };
  if (!v.tabs[v.sheetName].length) { // seed the headers the way createUserSpreadsheet did
    const H = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];
    S.engine = VE.create(src, { [v.sheetName]: [H] }, { sheetName: v.sheetName, today: o.today });
  }
}
// The server's copy, after opening from the device's: swap it in if it differs and nothing was saved meanwhile
// (a save from the older copy fails as 'stale' and reloads anyway). → true when the cellar changed
const idle = async mine => { while (mine.busy && S === mine) await new Promise(r => setTimeout(r, 50)); };
async function refresh(o, mine) {
  for (let tries = 0; tries < 3; tries++) {
    await idle(mine);
    const writes = mine.writes;
    let r;
    try { r = await srv(o.post, { user: o.user, token: o.token, action: "vget" }); }
    catch (e) { // offline: keep the device's copy; signed out on the server (session expired): say so
      if (S === mine && /^(bad-token|bad-code|no-cellar|vaulted)$/.test(e.message)) { S = null; if (mine.onLost) try { mine.onLost(e); } catch (x) {} }
      return false;
    }
    await idle(mine);
    if (S !== mine) return false;
    if (mine.writes !== writes) continue; // a save happened meanwhile: ask again
    const recs = r.records || {}, same = JSON.stringify(Object.keys(recs).sort().map(k => [k, recs[k].ver])) ===
      JSON.stringify(Object.keys(mine.recs).sort().map(k => [k, mine.recs[k].ver]));
    cachePut(o.user, recs);
    if (same) return false;
    const v = await decode(o.user, o.dek, recs);
    await idle(mine);
    if (S !== mine) return false;
    if (mine.writes !== writes) continue;
    openWith(Object.assign({}, o, { onRefresh: mine.onRefresh, onLost: mine.onLost }), v, mine.src);
    S.synced = Promise.resolve(true);
    if (S.onRefresh) try { S.onRefresh(); } catch (e) {}
    return true;
  }
  return false;
}
const active = () => !!S;
// The account's preferences (the overview's layout): one small encrypted record beside the cellar, never wines
const prefs = () => (S ? S.prefs : null);
async function setPrefs(value) {
  if (!S) return;
  const mine = S; mine.prefs = JSON.parse(JSON.stringify(value)); mine.writes++;
  try { await put(mine.post, mine.user, mine.token, mine.dek, mine.vers, "meta:prefs", mine.prefs); }
  catch (err) { // saved from another device meanwhile: this one is newer, so write over it
    if (err.message !== "stale" || S !== mine) throw err;
    const r = await srv(mine.post, { user: mine.user, token: mine.token, action: "vget" });
    mine.vers["meta:prefs"] = ((r.records || {})["meta:prefs"] || {}).ver || 0;
    await put(mine.post, mine.user, mine.token, mine.dek, mine.vers, "meta:prefs", mine.prefs);
  }
}
function stop() { S = null; }

async function call(params, retried) {
  if (!S) throw new Error("vault-closed");
  const a = params.action;
  if (a === "photo") return { ok: true, photo: await photo(String(params.id || "")) };
  if (!PRIVATE.has(a)) return srv(S.post, { user: S.user, token: S.token, ...params });
  const mine = S; mine.busy++;
  try { return await runPrivate(params, retried); } finally { mine.busy--; }
}
async function runPrivate(params, retried) {
  const p = JSON.parse(JSON.stringify(params));
  // a new journal photo: encrypt and upload it first; the engine stores its file id
  const e = p.entry;
  if (e && typeof e.photo === "string" && e.photo.slice(0, 5) === "data:") {
    const data = await VC.encrypt(S.dek, e.photo, aad(S.user, "photo"));
    const up = await srv(S.post, { user: S.user, token: S.token, action: "vphotoput", data });
    S.photoCache[up.id] = e.photo; e.photo = "vault:" + up.id;
  }
  const snap = S.engine.tabs(), before = keepTabs(snap, S.sheetName), saved = new Set();
  const { res, trashed } = S.engine.run(p);
  if (!res.ok) { const err = new Error(res.error || "unknown-error"); err.data = res; throw err; }
  const after = keepTabs(S.engine.tabs(), S.sheetName);
  try {
    for (const [name, rows] of Object.entries(after))
      if (JSON.stringify(rows) !== JSON.stringify(before[name])) { S.writes++; await put(S.post, S.user, S.token, S.dek, S.vers, "tab:" + name, rows); saved.add(name); }
  } catch (err) {
    // another device changed the vault since we read it: reload and do the action again on the fresh copy, once
    if (err.message === "stale" && !retried) {
      await start({ post: S.post, user: S.user, token: S.token, dek: S.dek, fresh: true, onRefresh: S.onRefresh, onLost: S.onLost });
      const res = await runPrivate(params, true);
      if (S.onRefresh) try { S.onRefresh(); } catch (e) {} // the screen shows the older copy: redraw from the fresh one
      return res;
    }
    // it never reached the server (no connection, say): the working copy goes back to what the server has, so the
    // change isn't kept here unsaved — and done twice when it's tried again
    const back = Object.assign({}, snap); for (const n of saved) back[n] = after[n];
    S.engine = VE.create(S.src, back, { sheetName: S.sheetName, today: S.today });
    throw err;
  }
  for (const id of trashed) { delete S.photoCache[id]; srv(S.post, { user: S.user, token: S.token, action: "vphotodel", id }).catch(() => {}); }
  return res;
}

// A journal photo of an encrypted account is an encrypted file; a feed photo (shared on purpose) is a plain one
async function photo(id) {
  if (S.photoCache[id]) return S.photoCache[id];
  try {
    const r = await srv(S.post, { user: S.user, token: S.token, action: "vphotoget", id });
    return (S.photoCache[id] = await VC.decrypt(S.dek, r.data, aad(S.user, "photo")));
  } catch (err) {
    const r = await srv(S.post, { user: S.user, token: S.token, action: "photo", id });
    return r.photo;
  }
}

// ── Keys for a new or upgraded account ──
// → { fields for signup/upgrade, recoveryCode, dek (session key) }
async function newKeys(pass) {
  const kdfSalt = VC.newSalt(), recSalt = VC.newSalt(), code = VC.recoveryCode();
  const [pk, rk, dekX] = await Promise.all([VC.fromPassword(pass, kdfSalt), VC.fromRecovery(code, recSalt), VC.newDataKey()]);
  const wrapKey = await VC.wrap(dekX, pk.kek), wrapRec = await VC.wrap(dekX, rk.kek);
  const dek = await VC.unwrap(wrapKey, pk.kek, false); // the session copy can't be read out
  // dekX only to wrap it to the admin's key once the account exists (escrow below); not kept
  return { fields: { kdf: VC.KDF, kdfSalt, auth: pk.auth, wrapKey, wrapRec, recSalt, recAuth: rk.auth }, recoveryCode: code, dek, dekX };
}

// ── Account changes, with the current password (the session key itself can't be read out) ──
async function unlockFor(post, user, pass) {
  const pre = await srv(post, { action: "prelogin", user });
  const pk = await VC.fromPassword(pass, pre.kdfSalt, pre.kdf);
  const r = await srv(post, { action: "login", user, auth: pk.auth }); // proves the password; also a fresh session
  return { pk, dekX: await VC.unwrap(r.wrapKey, pk.kek, true), token: r.token };
}
async function changePassword(o) {
  const { post, user, token, oldPass, newPass } = o;
  const { pk, dekX } = await unlockFor(post, user, oldPass);
  const kdfSalt = VC.newSalt(), nk = await VC.fromPassword(newPass, kdfSalt);
  await srv(post, { user, token, action: "changepw", oldAuth: pk.auth, auth: nk.auth, kdfSalt, wrapKey: await VC.wrap(dekX, nk.kek) });
  saltPut(user, { kdf: VC.KDF, kdfSalt });
}
async function newRecovery(o) {
  const { post, user, token, pass } = o;
  const { pk, dekX } = await unlockFor(post, user, pass);
  const recSalt = VC.newSalt(), code = VC.recoveryCode(), rk = await VC.fromRecovery(code, recSalt);
  await srv(post, { user, token, action: "newrec", oldAuth: pk.auth, wrapRec: await VC.wrap(dekX, rk.kek), recSalt, recAuth: rk.auth });
  return code;
}
// Delete the account, proven with the password once more; then nothing of it is left on this device either
async function deleteAccount(o) {
  const { post, user, token, pass } = o;
  const pre = await srv(post, { action: "prelogin", user });
  const pk = await VC.fromPassword(pass, pre.kdfSalt, pre.kdf);
  await srv(post, { user, token, action: "deleteaccount", auth: pk.auth });
  await forgetCache(user);
  if (S && S.user === user) S = null;
}
// Forgotten password: unlock with the recovery code, set a new password → {token, dek}
async function recover(o) {
  const { post, user, code, newPass } = o;
  const rs = await srv(post, { action: "recoverstart", user });
  const rk = await VC.fromRecovery(code, rs.recSalt);
  let dekX; try { dekX = await VC.unwrap(rs.wrapRec, rk.kek, true); } catch (e) { throw new Error("bad-recovery"); }
  const kdfSalt = VC.newSalt(), nk = await VC.fromPassword(newPass, kdfSalt);
  const wrapKey = await VC.wrap(dekX, nk.kek);
  const r = await srv(post, { action: "recover", user, recAuth: rk.auth, auth: nk.auth, kdfSalt, wrapKey, turnstile: o.turnstile || "" });
  saltPut(user, { kdf: VC.KDF, kdfSalt });
  if (r.help) await escrow({ post, user: r.user, token: r.token, dekX, help: r.help });
  return { token: r.token, user: r.user, state: r.state, dek: await VC.unwrap(wrapKey, nk.kek, false) };
}
// Sign in to an encrypted account → {token, user, state, dek}; or {legacy:true} for an account still to upgrade
// With the salt this device remembers for the username, the prelogin request is skipped; if the password then
// doesn't match (it was changed on another device, so the salt is new), the server's salt is fetched and tried once.
async function login(o) {
  const { post, user, pass } = o;
  const known = saltGet(user);
  let pre = known;
  if (!pre) {
    pre = await post({ action: "prelogin", user });
    if (!pre.ok || (pre.v || 0) < 28) return { oldServer: true };
    if (pre.legacy) return { legacy: true };
  }
  const attempt = async p => {
    const pk = await VC.fromPassword(pass, p.kdfSalt, p.kdf);
    const r = await srv(post, { action: "login", user, auth: pk.auth });
    saltPut(user, p);
    if (r.help) await escrow({ post, user: r.user, token: r.token, dekX: await VC.unwrap(r.wrapKey, pk.kek, true), help: r.help });
    return { token: r.token, user: r.user, state: r.state, dek: await VC.unwrap(r.wrapKey, pk.kek, false) };
  };
  try { return await attempt(pre); }
  catch (err) {
    if (!known || err.message !== "bad-login") throw err;
    saltDrop(user);
    const fresh = await post({ action: "prelogin", user });
    if (!fresh.ok || fresh.legacy || fresh.kdfSalt === known.kdfSalt) throw err;
    return attempt(fresh);
  }
}

// ── Migration: plain sheet → vault ──
// Reads the plain tabs once, re-encrypts the journal photos, writes everything to the vault, reads it all back and
// compares, and only then tells the server to let the plain copy go. Safe to run again after an interruption.
async function migrate(o) {
  const step = o.onStep || (() => {});
  const { post, user, token, dek } = o;
  step("export");
  const ex = await srv(post, { user, token, action: "vexport" });
  const tabs = ex.tabs || {}, sheetName = ex.sheetName || "Ark1";
  const j = tabs.Journal;
  const sent = {};
  if (j && j.length > 1) {
    const col = j[0].indexOf("Foto");
    const ids = col >= 0 ? j.slice(1).map(r => String(r[col] || "").trim()).filter(Boolean) : [];
    // three at a time: each photo is two requests of 2–3 seconds
    const uniq = [...new Set(ids)], newId = {};
    let done = 0, next = 0;
    step("photos", 0, uniq.length);
    const worker = async () => {
      while (next < uniq.length) {
        const id = uniq[next++];
        const pic = (await srv(post, { user, token, action: "photo", id })).photo;
        const data = await VC.encrypt(dek, pic, aad(user, "photo"));
        const up = await srv(post, { user, token, action: "vphotoput", data });
        sent[up.id] = pic; newId[id] = up.id;
        step("photos", ++done, uniq.length);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    j.slice(1).forEach(r => { const id = String(r[col] || "").trim(); if (newId[id]) r[col] = newId[id]; });
  }
  step("write");
  const cur = await load(post, user, token, dek).catch(() => ({ vers: {} })); // a resumed run overwrites its own partial copy
  const vers = cur.vers || {};
  await put(post, user, token, dek, vers, "meta:cellar", { sheetName });
  for (const [name, rows] of Object.entries(tabs)) await put(post, user, token, dek, vers, "tab:" + name, rows);
  step("verify");
  const back = await load(post, user, token, dek);
  for (const [name, rows] of Object.entries(tabs))
    if (JSON.stringify(back.tabs[name]) !== JSON.stringify(rows)) throw new Error("verify-failed: " + name);
  if (back.sheetName !== sheetName) throw new Error("verify-failed: meta");
  await Promise.all(Object.entries(sent).map(async ([id, pic]) => {
    const r = await srv(post, { user, token, action: "vphotoget", id });
    if (await VC.decrypt(dek, r.data, aad(user, "photo")) !== pic) throw new Error("verify-failed: photo");
  }));
  step("finish");
  await srv(post, { user, token, action: "vfinish", verified: true });
  return { tabs: Object.keys(tabs), photos: Object.keys(sent).length };
}

const rememberSalt = (user, fields) => saltPut(user, fields);
const synced = () => (S && S.synced) || Promise.resolve(false);
// ── Account help from the admin ──
// Only to the admin key this site trusts: the fingerprint pinned in config.js, or with no pin, the first one this
// browser saw. A server that tried to slip in a key of its own gets nothing wrapped to it.
async function trustedHelp(help) {
  if (!help || !help.pub || !/^[0-9a-f]{32}$/.test(String(help.kid || ""))) return null;
  if (await VC.keyId(help.pub) !== help.kid) return null;
  const pin = (root.WINE_CONFIG && root.WINE_CONFIG.ADMIN_KID) || "";
  if (pin) return pin === help.kid ? help : null;
  let seen = ""; try { seen = root.localStorage.getItem("vinAdminKid") || ""; } catch (e) {}
  if (seen && seen !== help.kid) return null;
  try { root.localStorage.setItem("vinAdminKid", help.kid); } catch (e) {}
  return help;
}
// wrap this account's (extractable) data key to the admin's public key → true when done; never fails a sign-in
async function escrow(o) {
  try {
    const help = await trustedHelp(o.help || await o.post({ action: "adminkey" }));
    if (!help) return false;
    await srv(o.post, { user: o.user, token: o.token, action: "escrow", wrapAdmin: await VC.wrapForAdmin(o.dekX, help.pub), adminKid: help.kid });
    return true;
  } catch (e) { return false; }
}
// a session that came back without the password (kept key): the password once, to do the same
async function escrowWithPassword(o) {
  const { dekX, token } = await unlockFor(o.post, o.user, o.pass);
  if (S && S.user === o.user) S.token = token;
  return { ok: await escrow({ post: o.post, user: o.user, token, dekX, help: o.help }), token };
}
// the owner, in the vault: turn account help on (a key pair; the private half encrypted with the owner's data key)
async function adminSetup() {
  if (!S) throw new Error("vault-closed");
  const k = await VC.newAdminKeys();
  const key = await VC.encrypt(S.dek, k.priv, aad(S.user, "adminkey"));
  await srv(S.post, { user: S.user, token: S.token, action: "adminkeyset", pub: k.pub, key, kid: k.kid });
  try { root.localStorage.setItem("vinAdminKid", k.kid); } catch (e) {}
  return k.kid;
}
// the owner helps a member back in: a fresh recovery code for them, made here → the code (shown once)
async function adminHelp(member) {
  if (!S) throw new Error("vault-closed");
  const g = await srv(S.post, { user: S.user, token: S.token, action: "adminkeyget" });
  if (!g.key) throw new Error("no-admin-key");
  const priv = await VC.decrypt(S.dek, g.key, aad(S.user, "adminkey"));
  const e = await srv(S.post, { user: S.user, token: S.token, action: "adminescrow", member });
  const dekX = await VC.unwrapAsAdmin(e.wrapAdmin, priv);
  const code = VC.recoveryCode(), recSalt = VC.newSalt(), rk = await VC.fromRecovery(code, recSalt);
  const r = await srv(S.post, { user: S.user, token: S.token, action: "adminrecovery", member, wrapRec: await VC.wrap(dekX, rk.kek), recSalt, recAuth: rk.auth });
  return { code, admin: r };
}

const api = { start, stop, active, prefs, setPrefs, call, newKeys, migrate, login, recover, changePassword, newRecovery, forgetCache, rememberSalt, deleteAccount, synced, PRIVATE,
  escrow, escrowWithPassword, adminSetup, adminHelp, trustedHelp,
  user: () => S && S.user };
if (node) module.exports = api;
else root.VAULT = api;
})(typeof window !== "undefined" ? window : globalThis);
