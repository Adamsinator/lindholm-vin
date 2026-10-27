// Client-side encryption for AllWine accounts (Web Crypto; the same file runs in Node for the tests).
//
// The password never leaves the browser. PBKDF2 turns it into 64 bytes: the first half is a key-encryption key that
// unwraps the account's random data key, the second half a login key the server checks (and stores only hashed). The
// data key (AES-256-GCM) encrypts the cellar, journal, wishlist and journal photos, so the server — and whoever runs it
// — holds ciphertext only. A recovery code shown once at sign-up wraps the same data key, so a forgotten password
// isn't the end of the cellar; losing both is.
//
//   const k = await VCRYPTO.fromPassword(pass, salt)      → {kek, auth}
//   const dek = await VCRYPTO.newDataKey(); const w = await VCRYPTO.wrap(dek, k.kek)
//   const s = await VCRYPTO.encrypt(dek, "text", "adam|tab:Ark1"); await VCRYPTO.decrypt(dek, s, "adam|tab:Ark1")
(function (root) {
"use strict";
const C = (typeof crypto !== "undefined" && crypto.subtle) ? crypto : require("crypto").webcrypto;
const S = C.subtle;
const ITER = 600000, REC_ITER = 210000;
const KDF = "pbkdf2-sha256-" + ITER;
const enc = new TextEncoder(), dec = new TextDecoder();

function b64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(s) { const b = atob(String(s)); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
const random = n => C.getRandomValues(new Uint8Array(n));
const newSalt = () => b64(random(16));

async function stretch(secret, saltB64, iter) {
  const base = await S.importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await S.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unb64(saltB64), iterations: iter }, base, 512));
  const kek = await S.importKey("raw", bits.slice(0, 32), "AES-KW", false, ["wrapKey", "unwrapKey"]);
  return { kek, auth: b64(bits.slice(32)) };
}
const fromPassword = (pass, saltB64, kdf) => stretch(String(pass), saltB64, kdf && /-(\d+)$/.test(kdf) ? +kdf.match(/-(\d+)$/)[1] : ITER);

// Recovery code: 20 random bytes in Crockford base32, grouped in fours (32 characters). Typing it back, case,
// spaces, dashes and the look-alikes O/I/L don't matter.
const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function recoveryCode() {
  const b = random(20); let bits = 0, val = 0, out = "";
  for (const x of b) { val = (val << 8) | x; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  return out.match(/.{4}/g).join("-");
}
const normCode = c => String(c || "").toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
const fromRecovery = (code, saltB64) => stretch(normCode(code), saltB64, REC_ITER);

const newDataKey = () => S.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
const wrap = async (dek, kek) => b64(await S.wrapKey("raw", dek, kek, "AES-KW"));
// extractable only while re-wrapping (password change, recovery); a session key can't be read out
const unwrap = (w, kek, extractable) => S.unwrapKey("raw", unb64(w), kek, "AES-KW", { name: "AES-GCM", length: 256 }, !!extractable, ["encrypt", "decrypt"]);

// "v1." + base64(12-byte iv ‖ ciphertext+tag); `aad` binds a blob to its user and slot, so one can't be swapped for another
async function encrypt(dek, text, aad) {
  const iv = random(12);
  const ct = new Uint8Array(await S.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(aad || "") }, dek, enc.encode(text)));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return "v1." + b64(out);
}
async function decrypt(dek, s, aad) {
  if (!/^v1\./.test(s)) throw new Error("not-encrypted");
  const u = unb64(s.slice(3));
  const pt = await S.decrypt({ name: "AES-GCM", iv: u.slice(0, 12), additionalData: enc.encode(aad || "") }, dek, u.slice(12));
  return dec.decode(pt);
}

// The session's data key, kept in IndexedDB (non-extractable) so a reload doesn't ask for the password again;
// cleared on sign-out and after the 60-minute idle sign-out.
const DB = "allwine-vault", STORE = "keys";
// Safari on a phone can leave IndexedDB hanging after the browser was in the background (a trip to the password
// manager): every use gives up after a few seconds, so the page carries on without the kept key instead of waiting
const IDB_WAIT = 4000;
const idbWait = p => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("idb-timeout")), IDB_WAIT))]);
function idb() {
  return idbWait(new Promise((res, rej) => { const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error("idb-blocked")); }));
}
// keeping the key is a convenience (no password after a reload): when it can't be kept, sign-in goes on without it
async function keep(user, dek) { if (typeof indexedDB === "undefined") return; try { const db = await idb();
  await idbWait(new Promise((res, rej) => { const t = db.transaction(STORE, "readwrite"); t.objectStore(STORE).put(dek, String(user).toLowerCase()); t.oncomplete = res; t.onerror = () => rej(t.error); })); } catch (e) {} }
async function recall(user) { if (typeof indexedDB === "undefined") return null; try { const db = await idb();
  return await idbWait(new Promise(res => { const r = db.transaction(STORE).objectStore(STORE).get(String(user).toLowerCase()); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); })); } catch (e) { return null; } }
async function forget(user) { if (typeof indexedDB === "undefined") return; try { const db = await idb();
  await idbWait(new Promise(res => { const t = db.transaction(STORE, "readwrite"); const s = t.objectStore(STORE); user ? s.delete(String(user).toLowerCase()) : s.clear(); t.oncomplete = res; t.onerror = res; })); } catch (e) {} }

const api = { KDF, ITER, newSalt, fromPassword, recoveryCode, normCode, fromRecovery, newDataKey, wrap, unwrap, encrypt, decrypt, keep, recall, forget, b64, unb64 };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else root.VCRYPTO = api;
})(typeof window !== "undefined" ? window : globalThis);
