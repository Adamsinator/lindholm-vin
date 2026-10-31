// What the atlas's service worker (atlas-sw.js) keeps in the browser and what it leaves to the network: the atlas
// pages, scripts, region packs and relief tiles (IGN's, basemap.de's) yes; the cellar app, its vault and its API no.
//   node tools/atlas-sw-test.js
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const handlers = {}, ctx = { self: { addEventListener: (k, f) => handlers[k] = f, skipWaiting() {}, clients: {} }, location: { origin: "https://allwine.dk" }, caches: {}, fetch() {}, URL };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "atlas-sw.js"), "utf8") + "\n;this.T = { isAtlas, isPage, isTile, isVersioned, isAsset };", ctx);
const { isAtlas, isPage, isTile, isVersioned, isAsset } = ctx.T, u = s => new URL(s, "https://allwine.dk/");
const kept = x => isAtlas(x) || isVersioned(x) || isAsset(x);
const yes = ["atlas.js?v=8", "atlas-mosel.js?v=1", "atlas-chablis-topo.js?v=1", "atlas-rhone-dem.js?v=1", "europe-lands.js?v=1", "burgundy.js?v=45", "i18n.js?v=55"];
const app = ["app.js?v=60", "vault.js?v=20", "config.js?v=9", "apps-script/Code.gs?v=43", "i18n-da.js?v=1", "manifest.json", "icon-512.png"];
const no = ["atlas-sw.js", "config.js", "app.js", "https://allwine-api.adamlenzing.workers.dev/x", "v/en/les-clos.html", "https://cdn.example.com/x.js?v=1"];
check("keeps the atlas's scripts and every region's pack, map detail and terrain", yes.every(s => isAtlas(u(s))), yes.filter(s => !isAtlas(u(s))).join());
check("…the cellar app's versioned scripts, the vault's Code.gs and the home-screen icon", app.every(s => kept(u(s))), app.filter(s => !kept(u(s))).join());
check("…but not the API, the service worker itself, an unversioned script or another site's", no.every(s => !kept(u(s))), no.filter(s => kept(u(s))).join());
check("the pages, the cellar's included, fresh from the network first", ["", "index.html", "privacy.html", "atlas.html", "burgundy.html", "domaine.html", "share.html"].every(s => isPage(u(s))) && !isPage(u("v/en/index.html")));
check("relief tiles from IGN and from basemap.de", isTile(u("https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&LAYER=ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW&TILEMATRIX=14"))
  && isTile(u("https://sgx.geodatenzentrum.de/wmts_basemapde_schummerung/tile/1.0.0/de_basemapde_web_raster_hillshade/default/DE_EPSG_3857_ADV/10/11120/17025.png"))
  && !isTile(u("https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevationLine.json?lon=4")) && !isTile(u("https://data.geopf.fr/wfs/ows?SERVICE=WFS")));
const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
