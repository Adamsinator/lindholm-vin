// What the atlas's service worker (atlas-sw.js) keeps in the browser and what it leaves to the network: the atlas
// pages, scripts, region packs and relief tiles (IGN's, basemap.de's) yes; the cellar app, its vault and its API no.
//   node tools/atlas-sw-test.js
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const handlers = {}, ctx = { self: { addEventListener: (k, f) => handlers[k] = f, skipWaiting() {}, clients: {} }, location: { origin: "https://allwine.dk" }, caches: {}, fetch() {}, URL };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "atlas-sw.js"), "utf8") + "\n;this.T = { isAtlas, isPage, isTile };", ctx);
const { isAtlas, isPage, isTile } = ctx.T, u = s => new URL(s, "https://allwine.dk/");
const yes = ["atlas.js?v=8", "atlas-mosel.js?v=1", "atlas-chablis-topo.js?v=1", "atlas-rhone-dem.js?v=1", "europe-lands.js?v=1", "burgundy.js?v=45", "i18n.js?v=55"];
const no = ["app.js?v=58", "vault.js?v=9", "atlas-sw.js", "config.js", "https://allwine-api.adamlenzing.workers.dev/x"];
check("keeps the atlas's scripts and every region's pack, map detail and terrain", yes.every(s => isAtlas(u(s))), yes.filter(s => !isAtlas(u(s))).join());
check("…but not the cellar app, its vault, the API or the service worker itself", no.every(s => !isAtlas(u(s))), no.filter(s => isAtlas(u(s))).join());
check("the atlas pages, the Côte d'Or's and the regions', fresh from the network first", ["atlas.html", "burgundy.html", "domaine.html"].every(s => isPage(u(s))) && !isPage(u("index.html")));
check("relief tiles from IGN and from basemap.de", isTile(u("https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&LAYER=ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW&TILEMATRIX=14"))
  && isTile(u("https://sgx.geodatenzentrum.de/wmts_basemapde_schummerung/tile/1.0.0/de_basemapde_web_raster_hillshade/default/DE_EPSG_3857_ADV/10/11120/17025.png"))
  && !isTile(u("https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevationLine.json?lon=4")) && !isTile(u("https://data.geopf.fr/wfs/ows?SERVICE=WFS")));
const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
