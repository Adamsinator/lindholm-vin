// Shared lists (the cellar's "Share", share.html): a list is sealed in the browser with a fresh AES-GCM key, after
// gzip where the browser has CompressionStream, and only the ciphertext goes to the server. The key travels in the
// link after the # (share.html#<id>.<key>), which a browser never sends anywhere, so neither the server nor the
// gateway can read a shared list.
//   const { blob, key } = await SHARE_CRYPTO.seal(object)    → base64url strings
//   const object = await SHARE_CRYPTO.open(blob, key)
// The blob: 1 byte version (1), 1 byte flags (1 = gzipped), 12 bytes IV, then the AES-GCM ciphertext and tag.
(function (root) {
"use strict";
const b64u = bytes => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const unb64u = s => { const b = atob(String(s).replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)); const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i); return out; };
const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
const canZip = typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";

async function seal(obj) {
  const raw = new TextEncoder().encode(JSON.stringify(obj));
  const body = canZip ? await pipe(raw, new CompressionStream("gzip")) : raw;
  const keyBytes = crypto.getRandomValues(new Uint8Array(32)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, body));
  const out = new Uint8Array(2 + 12 + ct.length); out[0] = 1; out[1] = canZip ? 1 : 0; out.set(iv, 2); out.set(ct, 14);
  return { blob: b64u(out), key: b64u(keyBytes) };
}
async function open(blob, keyText) {
  const all = unb64u(blob), keyBytes = unb64u(keyText);
  if (all[0] !== 1 || keyBytes.length !== 32) throw new Error("bad-share");
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  const body = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: all.subarray(2, 14) }, key, all.subarray(14)));
  if (all[1] & 1 && !canZip) throw new Error("old-browser");
  const raw = all[1] & 1 ? await pipe(body, new DecompressionStream("gzip")) : body;
  return JSON.parse(new TextDecoder().decode(raw));
}
root.SHARE_CRYPTO = { seal, open, b64u, unb64u };
})(typeof window !== "undefined" ? window : globalThis);
