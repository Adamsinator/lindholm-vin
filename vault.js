// The encrypted account's session: decrypts the vault, runs the cellar's private actions in the browser
// (vault-engine.js, the same Code.gs the server runs) and writes back, encrypted, the tabs an action changed. Shared
// things — the feed, follows, atlas corrections — still go to the server as before. Also: the one-time migration of
// a plain account into its vault, checked before the plain copy is let go.
//
//   await VAULT.start({ post, user, token, dek, codeUrl })   → opens the vault
//   await VAULT.call({ action: "add", wine })               → the same response the server would give
//   await VAULT.migrate({ post, user, token, dek, onStep })  → plain sheet → vault, verified, then vfinish
(function (root) {
"use strict";
const node = typeof module !== "undefined" && module.exports;
const VC = node ? require("./vault-crypto.js") : root.VCRYPTO;
const VE = node ? require("./vault-engine.js") : root.VAULT_ENGINE;

const PRIVATE = new Set(["data", "add", "drink", "undrink", "delete", "rate", "setvalue", "setprice", "setdate", "setsize",
  "setwindow", "setinfo", "enjoysync", "classfill", "enjoyadd", "addmany", "setinfomany", "mergerows", "journal", "jadd", "jedit", "jdelete",
  "wish", "wadd", "wedit", "wdelete", "wtocellar"]);
const SHARED_TABS = ["Journal", "Ønskeliste"]; // plus the wine tab (meta.sheetName); nothing else is ever stored
let S = null; // { post, user, token, dek, engine, sheetName, vers: {key: ver}, src, photoCache }

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
  else { const res = await fetch(url || "apps-script/Code.gs?v=33"); if (!res.ok) throw new Error("engine-load " + res.status); SRC = await res.text(); }
  return SRC;
}
const keepTabs = (all, sheetName) => Object.fromEntries(Object.entries(all).filter(([n]) => n === sheetName || SHARED_TABS.includes(n)));

// Read and decrypt the whole vault: {sheetName, tabs, vers}
async function load(post, user, token, dek) {
  const r = await srv(post, { user, token, action: "vget" });
  const vers = {}, tabs = {}; let sheetName = "Ark1";
  for (const [key, rec] of Object.entries(r.records || {})) {
    vers[key] = rec.ver;
    const plain = JSON.parse(await VC.decrypt(dek, rec.data, aad(user, key)));
    if (key === "meta:cellar") sheetName = plain.sheetName || sheetName;
    else if (key.slice(0, 4) === "tab:") tabs[key.slice(4)] = plain;
  }
  return { sheetName, tabs, vers, state: r.state };
}
async function put(post, user, token, dek, vers, key, value) {
  const data = await VC.encrypt(dek, JSON.stringify(value), aad(user, key));
  const r = await srv(post, { user, token, action: "vput", key, ver: vers[key] || 0, data });
  vers[key] = r.ver;
}

async function start(o) {
  const v = await load(o.post, o.user, o.token, o.dek);
  const src = await codeSource(o.codeUrl);
  // a brand-new vault has no wine tab yet: start it with the column headers the server would give a new sheet
  if (!v.tabs[v.sheetName]) v.tabs[v.sheetName] = [];
  S = { post: o.post, user: o.user, token: o.token, dek: o.dek, sheetName: v.sheetName, vers: v.vers, src, photoCache: {},
        engine: VE.create(src, v.tabs, { sheetName: v.sheetName, today: o.today }) };
  if (!v.tabs[v.sheetName].length) { // seed the headers the way createUserSpreadsheet did
    const H = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];
    S.engine = VE.create(src, { [v.sheetName]: [H] }, { sheetName: v.sheetName, today: o.today });
  }
  if (!S.vers["meta:cellar"]) await put(S.post, S.user, S.token, S.dek, S.vers, "meta:cellar", { sheetName: S.sheetName });
  return true;
}
const active = () => !!S;
function stop() { S = null; }

async function call(params, retried) {
  if (!S) throw new Error("vault-closed");
  const a = params.action;
  if (a === "photo") return { ok: true, photo: await photo(String(params.id || "")) };
  if (!PRIVATE.has(a)) return srv(S.post, { user: S.user, token: S.token, ...params });
  const p = JSON.parse(JSON.stringify(params));
  // a new journal photo: encrypt and upload it first; the engine stores its file id
  const e = p.entry;
  if (e && typeof e.photo === "string" && e.photo.slice(0, 5) === "data:") {
    const data = await VC.encrypt(S.dek, e.photo, aad(S.user, "photo"));
    const up = await srv(S.post, { user: S.user, token: S.token, action: "vphotoput", data });
    S.photoCache[up.id] = e.photo; e.photo = "vault:" + up.id;
  }
  const before = keepTabs(S.engine.tabs(), S.sheetName);
  const { res, trashed } = S.engine.run(p);
  if (!res.ok) { const err = new Error(res.error || "unknown-error"); err.data = res; throw err; }
  const after = keepTabs(S.engine.tabs(), S.sheetName);
  try {
    for (const [name, rows] of Object.entries(after))
      if (JSON.stringify(rows) !== JSON.stringify(before[name])) await put(S.post, S.user, S.token, S.dek, S.vers, "tab:" + name, rows);
  } catch (err) {
    // another device changed the vault since we read it: reload and do the action again on the fresh copy, once
    if (err.message === "stale" && !retried) { await start({ post: S.post, user: S.user, token: S.token, dek: S.dek }); return call(params, true); }
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
  return { fields: { kdf: VC.KDF, kdfSalt, auth: pk.auth, wrapKey, wrapRec, recSalt, recAuth: rk.auth }, recoveryCode: code, dek };
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
}
async function newRecovery(o) {
  const { post, user, token, pass } = o;
  const { pk, dekX } = await unlockFor(post, user, pass);
  const recSalt = VC.newSalt(), code = VC.recoveryCode(), rk = await VC.fromRecovery(code, recSalt);
  await srv(post, { user, token, action: "newrec", oldAuth: pk.auth, wrapRec: await VC.wrap(dekX, rk.kek), recSalt, recAuth: rk.auth });
  return code;
}
// Forgotten password: unlock with the recovery code, set a new password → {token, dek}
async function recover(o) {
  const { post, user, code, newPass } = o;
  const rs = await srv(post, { action: "recoverstart", user });
  const rk = await VC.fromRecovery(code, rs.recSalt);
  let dekX; try { dekX = await VC.unwrap(rs.wrapRec, rk.kek, true); } catch (e) { throw new Error("bad-recovery"); }
  const kdfSalt = VC.newSalt(), nk = await VC.fromPassword(newPass, kdfSalt);
  const wrapKey = await VC.wrap(dekX, nk.kek);
  const r = await srv(post, { action: "recover", user, recAuth: rk.auth, auth: nk.auth, kdfSalt, wrapKey });
  return { token: r.token, user: r.user, state: r.state, dek: await VC.unwrap(wrapKey, nk.kek, false) };
}
// Sign in to an encrypted account → {token, user, state, dek}; or {legacy:true} for an account still to upgrade
async function login(o) {
  const { post, user, pass } = o;
  const pre = await post({ action: "prelogin", user });
  if (!pre.ok || (pre.v || 0) < 28) return { oldServer: true };
  if (pre.legacy) return { legacy: true };
  const pk = await VC.fromPassword(pass, pre.kdfSalt, pre.kdf);
  const r = await srv(post, { action: "login", user, auth: pk.auth });
  return { token: r.token, user: r.user, state: r.state, dek: await VC.unwrap(r.wrapKey, pk.kek, false) };
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
    let done = 0;
    for (const id of ids) {
      step("photos", ++done, ids.length);
      const pic = (await srv(post, { user, token, action: "photo", id })).photo;
      const data = await VC.encrypt(dek, pic, aad(user, "photo"));
      const up = await srv(post, { user, token, action: "vphotoput", data });
      sent[up.id] = pic;
      j.slice(1).forEach(r => { if (String(r[col] || "").trim() === id) r[col] = up.id; });
    }
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
  for (const [id, pic] of Object.entries(sent)) {
    const r = await srv(post, { user, token, action: "vphotoget", id });
    if (await VC.decrypt(dek, r.data, aad(user, "photo")) !== pic) throw new Error("verify-failed: photo");
  }
  step("finish");
  await srv(post, { user, token, action: "vfinish", verified: true });
  return { tabs: Object.keys(tabs), photos: Object.keys(sent).length };
}

const api = { start, stop, active, call, newKeys, migrate, login, recover, changePassword, newRecovery, PRIVATE, user: () => S && S.user };
if (node) module.exports = api;
else root.VAULT = api;
})(typeof window !== "undefined" ? window : globalThis);
