// Service worker for the Burgundy atlas: keeps its heavy data files and IGN's relief tiles in the browser, so a second
// visit opens at once and works on a patchy connection. It only answers for atlas files and relief tiles; everything
// else (the cellar app, its API) goes straight to the network as if it weren't here.
"use strict";
const DATA = "atlas-data-v1", TILES = "atlas-tiles-v1", MAX_TILES = 800;
const isAtlas = u => u.origin === location.origin && /\/(burgundy[^/]*\.js|i18n\.js|atlas-preview\.jpg)$/.test(u.pathname);
const isPage = u => u.origin === location.origin && /\/burgundy\.html$/.test(u.pathname);
const isTile = u => u.hostname === "data.geopf.fr" && u.pathname === "/wmts" && /ELEVATION\.ELEVATIONGRIDCOVERAGE\.SHADOW/.test(u.search);

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", ev => ev.waitUntil((async () => {
  for (const k of await caches.keys()) if (![DATA, TILES].includes(k) && k.startsWith("atlas-")) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener("fetch", ev => {
  if (ev.request.method !== "GET") return;
  const u = new URL(ev.request.url);
  if (isPage(u)) ev.respondWith(networkFirst(ev.request));
  else if (isAtlas(u)) ev.respondWith(staleWhileRevalidate(ev, u));
  else if (isTile(u)) ev.respondWith(cacheFirst(ev.request));
});

// atlas files carry ?v= versions: serve the cached copy, refresh it in the background, and drop older versions
async function staleWhileRevalidate(ev, u) {
  const cache = await caches.open(DATA), hit = await cache.match(ev.request);
  const fresh = fetch(ev.request).then(async res => {
    if (res.ok) {
      await cache.put(ev.request, res.clone());
      for (const req of await cache.keys()) { const k = new URL(req.url); if (k.pathname === u.pathname && k.search !== u.search) await cache.delete(req); }
    }
    return res;
  }).catch(() => hit);
  if (hit) { ev.waitUntil(fresh); return hit; }
  return fresh;
}
// the page itself: always the latest when online (so a new version shows at once), the cached copy when offline
async function networkFirst(req) {
  const cache = await caches.open(DATA);
  try { const res = await fetch(req); if (res.ok) await cache.put(req, res.clone()); return res; }
  catch (e) { return (await cache.match(req, { ignoreSearch: true })) || Response.error(); }
}
async function cacheFirst(req) {
  const cache = await caches.open(TILES), hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    await cache.put(req, res.clone());
    const keys = await cache.keys(); if (keys.length > MAX_TILES) for (const k of keys.slice(0, keys.length - MAX_TILES)) await cache.delete(k);
  }
  return res;
}
