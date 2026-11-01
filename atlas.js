// The region atlas (atlas.html): one region pack at a time (atlas-<id>.js, made by tools/region-build.js from INAO's
// outlines), drawn as a map you can pan and zoom, with each vineyard's classification and area, your own bottles on it
// (read here from the cellar this browser is logged in to, decrypted here for an encrypted one) and "Add a bottle
// from here". Burgundy's Côte d'Or keeps its own, richer atlas (burgundy.html).
"use strict";
const t = (window.I18N && window.I18N.t) || ((s, ...a) => s.replace(/\{(\d)\}/g, (m, i) => a[i] ?? ""));
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtHa = v => Number(v).toLocaleString(window.I18N && I18N.lang === "en" ? "en-GB" : (window.I18N ? I18N.lang : "en"), { maximumFractionDigits: v < 10 ? 2 : 1 });
const norm = s => " " + String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim() + " ";

// the regions there are packs for; the Côte d'Or links to its own atlas
// kw: words on a label that put a bottle in the region; regional: what the pack's "regional" land is
const REGIONS = [
  { id: "chablis", name: "Chablis", file: "atlas-chablis.js?v=1", topo: "atlas-chablis-topo.js?v=1", dem: "atlas-chablis-dem.js?v=1", geol: "atlas-chablis-geol.js?v=1", ll: [47.811, 3.796], country: "fr", kind: "Grand cru · premier cru", kw: ["chablis"], regional: "Regional (Petit Chablis…)" },
  { id: "chalonnaise", name: "Côte Chalonnaise", file: "atlas-chalonnaise.js?v=1", topo: "atlas-chalonnaise-topo.js?v=1", dem: "atlas-chalonnaise-dem.js?v=1", geol: "atlas-chalonnaise-geol.js?v=1", ll: [46.782, 4.711], country: "fr", kind: "Premier cru", kw: ["mercurey", "givry", "rully", "montagny", "bouzeron", "chalonnaise"], regional: "Regional (Bourgogne Côte Chalonnaise)" },
  { id: "maconnais", name: "Mâconnais", file: "atlas-maconnais.js?v=1", topo: "atlas-maconnais-topo.js?v=1", dem: "atlas-maconnais-dem.js?v=1", geol: "atlas-maconnais-geol.js?v=1", ll: [46.288, 4.739], country: "fr", kind: "Premier cru", kw: ["pouilly fuisse", "pouilly vinzelles", "pouilly loche", "saint veran", "st veran", "vire clesse", "macon"], regional: "Regional (Mâcon…)" },
  { id: "champagne", name: "Champagne", file: "atlas-champagne.js?v=1", topo: "atlas-champagne-topo.js?v=1", dem: "atlas-champagne-dem.js?v=1", geol: "atlas-champagne-geol.js?v=1", ll: [49.096, 4.035], country: "fr", kind: "Grand and premier cru villages", kw: ["champagne"], village: "Other villages' vines" },
  { id: "alsace", name: "Alsace", file: "atlas-alsace.js?v=1", topo: "atlas-alsace-topo.js?v=1", dem: "atlas-alsace-dem.js?v=1", geol: "atlas-alsace-geol.js?v=1", ll: [48.174, 7.329], country: "fr", kind: "Grand cru", kw: ["alsace", "elsass"], village: "Alsace (the rest of the AOC)" },
  { id: "bordeaux", name: "Bordeaux", file: "atlas-bordeaux.js?v=1", topo: "atlas-bordeaux-topo.js?v=1", dem: "atlas-bordeaux-dem.js?v=1", geol: "atlas-bordeaux-geol.js?v=1", ll: [44.953, -0.587], country: "fr", kind: "Appellations · the 1855 châteaux", kw: ["bordeaux", "pauillac", "margaux", "medoc", "saint julien", "st julien", "saint estephe", "st estephe",
    "pessac", "graves", "sauternes", "barsac", "saint emilion", "st emilion", "pomerol", "fronsac", "listrac", "moulis"], village: "Haut-Médoc, Médoc, Graves" },
  { id: "mosel", name: "Mosel", file: "atlas-mosel.js?v=1", topo: "atlas-mosel-topo.js?v=1", dem: "atlas-mosel-dem.js?v=1", ll: [49.925, 6.968], country: "de", kind: "Einzellagen", kw: ["mosel", "saar", "ruwer"] },
  { id: "nahe", name: "Nahe", file: "atlas-nahe.js?v=1", topo: "atlas-nahe-topo.js?v=1", dem: "atlas-nahe-dem.js?v=1", ll: [49.84, 7.786], country: "de", kind: "Einzellagen", kw: ["nahe"] },
  { id: "pfalz", name: "Pfalz", file: "atlas-pfalz.js?v=1", topo: "atlas-pfalz-topo.js?v=1", dem: "atlas-pfalz-dem.js?v=1", ll: [49.383, 8.158], country: "de", kind: "Einzellagen", kw: ["pfalz", "palatinate"] },
  { id: "rheinhessen", name: "Rheinhessen", file: "atlas-rheinhessen.js?v=1", topo: "atlas-rheinhessen-topo.js?v=1", dem: "atlas-rheinhessen-dem.js?v=1", ll: [49.826, 8.16], country: "de", kind: "Einzellagen", kw: ["rheinhessen"] },
  { id: "mittelrhein", name: "Mittelrhein", file: "atlas-mittelrhein.js?v=1", topo: "atlas-mittelrhein-topo.js?v=1", dem: "atlas-mittelrhein-dem.js?v=1", ll: [50.183, 7.671], country: "de", kind: "Einzellagen", kw: ["mittelrhein"] },
  { id: "ahr", name: "Ahr", file: "atlas-ahr.js?v=1", topo: "atlas-ahr-topo.js?v=1", dem: "atlas-ahr-dem.js?v=1", ll: [50.536, 7.079], country: "de", kind: "Einzellagen", kw: ["ahr"] },
  { id: "rhone", name: "Rhône (north)", file: "atlas-rhone.js?v=1", topo: "atlas-rhone-topo.js?v=1", dem: "atlas-rhone-dem.js?v=1", geol: "atlas-rhone-geol.js?v=1", ll: [45.201, 4.809], country: "fr", kind: "Cru appellations", kw: ["cote rotie", "condrieu", "chateau grillet", "hermitage", "ermitage", "crozes", "saint joseph", "st joseph", "cornas", "saint peray", "st peray"],
    regional: "Regional (Côtes du Rhône)" },
  { id: "beaujolais", name: "Beaujolais", file: "atlas-beaujolais.js?v=1", topo: "atlas-beaujolais-topo.js?v=1", dem: "atlas-beaujolais-dem.js?v=1", geol: "atlas-beaujolais-geol.js?v=1", ll: [46.17, 4.68], country: "fr", kind: "The ten crus",
    kw: ["beaujolais", "brouilly", "chenas", "chiroubles", "fleurie", "julienas", "morgon", "moulin a vent", "regnie", "saint amour", "st amour"], regional: "Beaujolais-Villages" },
  { id: "rhonesud", name: "Rhône (south)", file: "atlas-rhonesud.js?v=1", topo: "atlas-rhonesud-topo.js?v=1", dem: "atlas-rhonesud-dem.js?v=1", geol: "atlas-rhonesud-geol.js?v=1", ll: [44.12, 4.89], country: "fr", kind: "Cru appellations",
    kw: ["chateauneuf du pape", "gigondas", "vacqueyras", "beaumes de venise", "rasteau", "cairanne", "vinsobres", "lirac", "tavel"], regional: "Côtes du Rhône Villages" },
  { id: "centreloire", name: "Centre-Loire", file: "atlas-centreloire.js?v=1", topo: "atlas-centreloire-topo.js?v=1", dem: "atlas-centreloire-dem.js?v=1", geol: "atlas-centreloire-geol.js?v=1", ll: [47.3, 2.55], country: "fr", kind: "Sancerre, Pouilly-Fumé and their neighbours",
    kw: ["sancerre", "pouilly fume", "blanc fume de pouilly", "menetou salon", "quincy", "reuilly", "coteaux du giennois"] },
  { id: "touraine", name: "Touraine & Saumur", file: "atlas-touraine.js?v=1", topo: "atlas-touraine-topo.js?v=1", dem: "atlas-touraine-dem.js?v=1", geol: "atlas-touraine-geol.js?v=1", ll: [47.3, 0.45], country: "fr", kind: "Cru appellations",
    kw: ["vouvray", "montlouis", "chinon", "bourgueil", "saumur champigny"] },
  { id: "anjou", name: "Anjou", file: "atlas-anjou.js?v=1", topo: "atlas-anjou-topo.js?v=1", dem: "atlas-anjou-dem.js?v=1", geol: "atlas-anjou-geol.js?v=1", ll: [47.33, -0.6], country: "fr", kind: "Savennières and the Layon's sweet wines",
    kw: ["savennieres", "coulee de serrant", "roche aux moines", "quarts de chaume", "bonnezeaux", "coteaux du layon"] },
];
// the start page's other places: the Côte d'Or's own, richer atlas, and Piedmont, whose MGA have pages but no map
const ELSEWHERE = [{ id: "burgundy", name: "Côte d'Or", ll: [47.058, 4.839], country: "fr", kind: "The detailed atlas: owners, terrain, geology", href: "burgundy.html" },
  { id: "barolo", name: "Barolo", ll: [44.61, 7.94], country: "it", kind: "MGA · no map", href: "v/{L}/index.html#barolo" },
  { id: "barbaresco", name: "Barbaresco", ll: [44.725, 8.08], country: "it", kind: "MGA · no map", href: "v/{L}/index.html#barbaresco" }];
const COUNTRY = { fr: "France", de: "Germany", it: "Italy" };
const TYPE = { W: "Hvid", R: "Rød", RW: "Rød", S: "Bobler" };
const CLASS = { GC: "Grand cru", "1er": "Premier cru", AOC: "Cru appellation", EL: "Einzellage" };
const st = { region: null, pack: null, sel: null, view: null, show: { GC: true, "1er": true, AOC: true, EL: true, PT: true }, mine: false };
// classified châteaux (Bordeaux's 1855): points on the map, by rank; the classification as it's written on a label
const PTCLASS = { "1855-1": "First growth (1855)", "1855-2": "Second growth (1855)", "1855-3": "Third growth (1855)", "1855-4": "Fourth growth (1855)", "1855-5": "Fifth growth (1855)",
  "sau-0": "Superior first growth (1855)", "sau-1": "First growth, Sauternes (1855)", "sau-2": "Second growth, Sauternes (1855)" };
const PTLABEL = { "1855-1": "Premier grand cru classé", "1855-2": "Deuxième grand cru classé", "1855-3": "Troisième grand cru classé", "1855-4": "Quatrième grand cru classé",
  "1855-5": "Cinquième grand cru classé", "sau-0": "Premier cru supérieur", "sau-1": "Premier cru classé", "sau-2": "Deuxième cru classé" };
const PTSIZE = { "1855-1": 6.5, "1855-2": 5.5, "1855-3": 5, "1855-4": 4.5, "1855-5": 4, "sau-0": 6.5, "sau-1": 5.5, "sau-2": 4.5 };
const pts = () => (st.pack && st.pack.points) || [];
const short = n => n.replace(/^Château /, "");
const cls = c => c.c === "GC" ? "GC" : c.c === "AOC" ? "AOC" : c.unnamed ? "px" : "p1";
const isTop = c => c.c === "GC" || c.c === "AOC"; // drawn and labelled first
const noteOf = c => c.d && (c.d[window.I18N ? I18N.lang : "en"] || c.d.en);
const shown = c => c.c === "EL" ? c.ap : c.n; // a German site is known by its village too: Wehlener Sonnenuhr
const villagesPack = () => /IGN BD TOPO \(zone de végétation/.test(st.pack.meta.source); // Champagne: crus are villages
const CELLAR = { loaded: false, by: {}, other: 0, msg: "Log in on the Cellar page to see your own bottles here." };

const loadScript = src => new Promise((res, rej) => { const el = document.createElement("script"); el.src = src; el.onload = res; el.onerror = () => rej(new Error("load " + src)); document.head.appendChild(el); });

/* ---------- the map: SVG in the pack's metres, a viewBox to pan and zoom ---------- */
const svg = $("map"), NS = "http://www.w3.org/2000/svg";
const el = (name, attrs, parent) => { const e = document.createElementNS(NS, name); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
const pathOf = mp => mp.map(p => p.map(r => "M" + r.map(([x, y]) => x + " " + y).join("L") + "Z").join("")).join("");
let gLabels = null;
function draw() {
  const P = st.pack; svg.innerHTML = ""; shadeTiles.clear(); photoTiles.clear();
  gPhoto = el("g", { class: "photo", "pointer-events": "none" }, svg); // IGN's aerial photos, under everything, when chosen
  // under the vineyards: woods, lakes, built-up areas; over them, faint relief, then rivers, roads and railways
  TG.under = el("g", { class: "topo", "pointer-events": "none" }, svg);
  TG.geol = el("g", { class: "geol", "pointer-events": "none" }, svg); // BRGM's formations, when Geology is on
  const g = el("g", {}, svg);
  el("path", { class: "rg", d: pathOf(P.regional.g) }, g);
  P.villages.forEach(v => el("path", { class: "vl", d: pathOf(v.g) }, g));
  P.climats.forEach(c => { c.el = el("path", { class: "cl " + cls(c), d: pathOf(c.g), "data-id": c.id }, g);
    el("title", {}, c.el).textContent = c.n; });
  gShade = el("g", { class: "shade", "pointer-events": "none" }, svg);
  TG.over = el("g", { class: "topo", "pointer-events": "none" }, svg); TG.names = el("g", { class: "topo", "pointer-events": "none" }, svg);
  const gd = el("g", {}, svg), gp = el("g", {}, svg); gLabels = el("g", {}, svg); // château dots under the labels
  TG.prof = el("g", { class: "prof", "pointer-events": "none" }, svg); PROF.a = PROF.b = null;
  TG.me = el("g", { class: "me", "pointer-events": "none" }, svg); drawMe();
  P.climats.forEach(c => { if (!c.unnamed) c.lb = el("text", { class: "lb " + c.c, x: c.lp[0], y: c.lp[1] }, gLabels); if (c.lb) c.lb.textContent = c.n;
    c.dot = el("circle", { class: "dot", cx: c.lp[0], cy: c.lp[1], r: 0 }, gd); });
  pts().forEach(q => { if (!q.p) return; q.el = el("circle", { class: "pt", cx: q.p[0], cy: q.p[1], r: 0, "data-pt": q.id }, gp); el("title", {}, q.el).textContent = q.n;
    q.lb = el("text", { class: "lb pl", x: q.p[0], y: q.p[1] }, gLabels); q.lb.textContent = short(q.n); });
  if (topoOf()) drawTopo();
  if (geolOf()) drawGeol();
  paint();
}
function paint() {
  const P = st.pack; if (!P) return;
  P.climats.forEach(c => {
    const off = !st.show[c.c] || (st.mine && !CELLAR.by[c.id]) || !terrOk(c);
    c.el.classList.toggle("dim", off); c.el.classList.toggle("sel", st.sel === c.id);
    const b = CELLAR.by[c.id]?.left || 0; c.dot.setAttribute("r", b ? 0 : 0); c.dot.dataset.b = b;
  });
  svg.classList.toggle("geolon", geolShown());
  pts().forEach(q => { if (!q.el) return; q.el.classList.toggle("sel", st.sel === q.id); q.el.classList.toggle("has", !!CELLAR.by[q.id]);
    q.el.classList.toggle("dim", !st.show.PT || (st.mine && !CELLAR.by[q.id])); });
  layoutLabels();
}
// labels and bottle dots keep their size on screen: scaled by the zoom, hidden where they'd crowd
function layoutLabels() {
  const P = st.pack; if (!P || !st.view) return;
  const k = st.view[2] / svg.clientWidth || 1, taken = [];
  P.climats.slice().sort((a, b) => (isTop(a) ? 0 : 1) - (isTop(b) ? 0 : 1) || b.ha - a.ha).forEach(c => {
    const b = Number(c.dot.dataset.b || 0); c.dot.setAttribute("r", b ? (4 + Math.sqrt(b) * 1.6) * k : 0);
    if (!c.lb) return;
    c.lb.style.fontSize = (isTop(c) ? 14.5 : 13) * k + "px"; c.lb.style.strokeWidth = 3 * k + "px"; // style: it outranks the stylesheet
    const w = c.n.length * 7 * k, h = 15 * k, box = [c.lp[0] - w / 2, c.lp[1] - h, c.lp[0] + w / 2, c.lp[1]];
    const hide = !st.show[c.c] || (st.mine && !CELLAR.by[c.id]) || !terrOk(c) || taken.some(o => !(box[2] < o[0] || box[0] > o[2] || box[3] < o[1] || box[1] > o[3]));
    c.lb.style.display = hide ? "none" : ""; if (!hide) taken.push(box);
  });
  // the châteaux: a dot a little bigger for a higher rank; names once you're close enough to read them
  pts().filter(q => q.el).sort((a, b) => PTSIZE[b.cls] - PTSIZE[a.cls]).forEach(q => {
    const off = !st.show.PT || (st.mine && !CELLAR.by[q.id]); q.el.setAttribute("r", off ? 0 : PTSIZE[q.cls] * k);
    q.lb.style.fontSize = 11.5 * k + "px"; q.lb.style.strokeWidth = 3 * k + "px"; q.lb.setAttribute("y", q.p[1] - 8 * k);
    const w = short(q.n).length * 6 * k, h = 13 * k, box = [q.p[0] - w / 2, q.p[1] - 8 * k - h, q.p[0] + w / 2, q.p[1] - 8 * k];
    const hide = off || st.view[2] > 25000 || taken.some(o => !(box[2] < o[0] || box[0] > o[2] || box[3] < o[1] || box[1] > o[3]));
    q.lb.style.display = hide ? "none" : ""; if (!hide) taken.push(box);
  });
}
// the viewBox moves at once; the labels, the map's level of detail and the relief tiles follow on the next frame, or,
// while a finger or the mouse is still moving the map, once it pauses (laying out every label each frame is what made
// a drag stutter on a phone)
let relayRaf = 0, relayT = 0, vbC = null, rectC = null;
const mapview = $("mapview");
// the map's place on the page as laid out, not as the gesture's transform shows it (measured while none is on)
const mapRect = () => mapview.style.transform && rectC ? rectC : (rectC = svg.getBoundingClientRect());
function relayout() { const v = st.view; if (!v) return; layoutLabels(); topoLod(); shadeSoon(); drawMe();
  if (PROF.a && TG.prof) TG.prof.querySelectorAll("circle").forEach(c => c.setAttribute("r", 5 * v[2] / (svg.clientWidth || 800))); }
// while a finger, the wheel or a glide is moving the map, the drawing already on screen is moved and scaled as a picture
// (a CSS transform the compositor does, cheap), and redrawn at the new view once the movement pauses: redrawing a
// region's thousands of paths each frame was what made a drag stutter on a phone
function setView(v, live) {
  st.view = v; cancelAnimationFrame(relayRaf); clearTimeout(relayT);
  if (live && vbC) { const k = vbC[2] / v[2], r = mapRect().width / vbC[2] * k;
    mapview.style.transform = `translate(${((vbC[0] - v[0]) * r).toFixed(1)}px,${((vbC[1] - v[1]) * r).toFixed(1)}px) scale(${k.toFixed(5)})`;
    relayT = setTimeout(commitView, 120); return; }
  commitView();
}
function commitView() {
  clearTimeout(relayT); const v = st.view; if (!v) return;
  vbC = v.slice(); mapview.style.transform = "";
  svg.setAttribute("viewBox", v.map(x => x.toFixed(2)).join(" ")); // not rounded to the metre: 150 m across, that's a visible jump
  cancelAnimationFrame(relayRaf); relayRaf = requestAnimationFrame(relayout); scaleBar();
}
// a quiet scale bar: the longest round distance that fits in about 110 px (the map's units are metres)
function scaleBar() {
  const sb = $("scalebar"), m = svg.getScreenCTM(); sb.hidden = !st.pack || !st.view || !m || !m.a; if (sb.hidden) return;
  const mpp = 1 / Math.hypot(m.a, m.b), L = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000].filter(m => m / mpp <= 110).pop() || 10;
  sb.querySelector("span").style.width = (L / mpp).toFixed(0) + "px"; sb.querySelector("em").textContent = L >= 1000 ? (L / 1000).toLocaleString(window.I18N ? I18N.lang : "en") + " km" : L + " m";
}

/* ---------- the ground around the vineyards (French regions): IGN's relief shading as tiles, and BD TOPO's roads,
   rivers, woods and villages from atlas-<id>-topo.js (tools/region-topo.js), both in the pack's Lambert-93 metres ---------- */
const TG = {}; let gShade = null, gPhoto = null; const shadeTiles = new Map(), photoTiles = new Map();
const pref = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v === "1"; } catch (e) { return d; } };
st.relief = pref("atlasRelief", true); st.topo = pref("atlasTopo", true);
// the map's look: "auto" follows the device's light or dark, or "light", "dark", or "photo" (IGN's aerial photos, France)
st.style = (() => { try { return localStorage.getItem("atlasStyle") || "auto"; } catch (e) { return "auto"; } })();
const PHOTO_URL = (z, x, y) => `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}&FORMAT=image/jpeg`;
const topoOf = () => st.region && window.ATLAS_TOPO && ATLAS_TOPO[st.region.id];
// Lambert-93 (EPSG:2154): conformal conic on GRS80, standard parallels 44° and 49°, origin 46.5° N 3° E (700 000, 6 600 000)
const L93 = (() => { const a = 6378137, e = 0.0818191910428158, d = Math.PI / 180;
  const m = p => Math.cos(p) / Math.sqrt(1 - e * e * Math.sin(p) ** 2), tt = p => Math.tan(Math.PI / 4 - p / 2) / ((1 - e * Math.sin(p)) / (1 + e * Math.sin(p))) ** (e / 2);
  const n = (Math.log(m(44 * d)) - Math.log(m(49 * d))) / (Math.log(tt(44 * d)) - Math.log(tt(49 * d))), F = m(44 * d) / (n * tt(44 * d) ** n), r0 = a * F * tt(46.5 * d) ** n;
  return (lon, lat) => { const r = a * F * tt(lat * d) ** n, th = n * (lon - 3) * d; return [700000 + r * Math.sin(th), 6600000 + r0 - r * Math.cos(th)]; }; })();
// Germany: basemap.de's hillshade (BKG, on the ATKIS DGM5), whose Web Mercator levels are numbered from standard zoom 5
const SHADE_DE = (z, x, y) => `https://sgx.geodatenzentrum.de/wmts_basemapde_schummerung/tile/1.0.0/de_basemapde_web_raster_hillshade/default/DE_EPSG_3857_ADV/${String(z - 5).padStart(2, "0")}/${y}/${x}.png`;
const SHADE_URL = (z, x, y) => `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ELEVATION.ELEVATIONGRIDCOVERAGE.SHADOW&STYLE=estompage_grayscale&TILEMATRIXSET=PM&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}&FORMAT=image/png`;
let shadeT = 0; const shadeSoon = () => { clearTimeout(shadeT); shadeT = setTimeout(shadeUpdate, 250); };
function shadeUpdate() {
  if (!gShade || !st.pack || !st.view) return;
  const M = st.pack.meta, de = M.proj === "eq", photo = st.style === "photo" && !!M.l93;
  svg.classList.toggle("photo", photo); gPhoto.style.display = photo ? "" : "none";
  if (photo) tileLayer(gPhoto, photoTiles, PHOTO_URL, 18);
  // the relief's shading over a photo would only darken it
  const on = st.relief && !photo && (!!M.l93 || de); gShade.style.display = on ? "" : "none";
  if (on) tileLayer(gShade, shadeTiles, de ? SHADE_DE : SHADE_URL, 15); // IGN serves the relief to level 15
}
// a layer of web map tiles (256 px, Web Mercator) laid over the pack's own metres, for the view and a margin round it
function tileLayer(g, tiles, url, zmax) {
  const M = st.pack.meta, de = M.proj === "eq";
  const d2r = Math.PI / 180, O = M.origin, kx = d2r * 6371000 * Math.cos(O[1] * d2r), ky = d2r * 6371000;
  // to the pack's metres: Lambert-93 in France, the local equirectangular grid round meta.origin in Germany
  const toP = de ? (lon, lat) => [(lon - O[0]) * kx, (O[1] - lat) * ky] : (lon, lat) => { const [E, N] = L93(lon, lat); return [E - M.l93[0], M.l93[1] - N]; };
  // the view's corners back to longitude and latitude (Lambert-93 is near enough a plane over a view: two points fix it)
  const [vx, vy, vw, vh] = st.view, [lo0, la0] = st.pack.meta.origin, p0 = toP(lo0, la0), p1 = toP(lo0 + .1, la0 + .1);
  const ax = .1 / (p1[0] - p0[0]), ay = .1 / (p1[1] - p0[1]), toLL = (x, y) => [lo0 + (x - p0[0]) * ax, la0 + (y - p0[1]) * ay];
  const [w, n] = toLL(vx - vw * .1, vy - vh * .1), [e, s] = toLL(vx + vw * 1.1, vy + vh * 1.1), lat = (n + s) / 2;
  const mpp = vw / (svg.clientWidth || 800);
  const z = Math.max(8, Math.min(zmax, Math.round(Math.log2(156543.03 * Math.cos(lat * d2r) / mpp))));
  const N = 2 ** z, tx = lon => Math.floor((lon + 180) / 360 * N), ty = la => Math.floor((1 - Math.log(Math.tan(la * d2r) + 1 / Math.cos(la * d2r)) / Math.PI) / 2 * N);
  const lonOf = x => x / N * 360 - 180, latOf = y => Math.atan(Math.sinh(Math.PI * (1 - 2 * y / N))) / d2r;
  const x0 = tx(Math.min(w, e)), x1 = tx(Math.max(w, e)), y0 = ty(Math.max(n, s)), y1 = ty(Math.min(n, s));
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > 140) return;
  const want = new Set();
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    const k = `${z}/${x}/${y}`; want.add(k); if (tiles.has(k)) continue;
    const TL = toP(lonOf(x), latOf(y)), TR = toP(lonOf(x + 1), latOf(y)), BL = toP(lonOf(x), latOf(y + 1));
    const img = el("image", { href: url(z, x, y), width: 256, height: 256, preserveAspectRatio: "none",
      transform: `matrix(${((TR[0] - TL[0]) / 256).toFixed(5)} ${((TR[1] - TL[1]) / 256).toFixed(5)} ${((BL[0] - TL[0]) / 256).toFixed(5)} ${((BL[1] - TL[1]) / 256).toFixed(5)} ${TL[0].toFixed(1)} ${TL[1].toFixed(1)})` }, g);
    img.addEventListener("error", () => img.remove());
    tiles.set(k, img);
  }
  // other zoom levels go once this one has had a moment to load (checked against the latest view's tiles, not this
  // call's: a quick second zoom mustn't have its new tiles swept away by the first one's timer)
  tiles.want = want; tiles.z = z;
  setTimeout(() => { const W = tiles.want, Z = tiles.z + "/";
    tiles.forEach((img, k) => { if (!W.has(k) && (!k.startsWith(Z) || tiles.size > 240)) { img.remove(); tiles.delete(k); } }); }, 900);
}
// a delta-encoded coordinate list (first point absolute, then steps) → path data
const topoD = (f, close) => { let x = 0, y = 0, d = ""; for (let i = 0; i < f.length; i += 2) { x += f[i]; y += f[i + 1]; d += (i ? "L" : "M") + x + " " + y; } return close ? d + "Z" : d; };
function drawTopo() {
  const T = topoOf(); if (!T || !TG.under) return;
  [TG.under, TG.over, TG.names].forEach(g => g.innerHTML = "");
  // big layers in tiles of a few km, one path each, so the browser can skip what's off-screen
  const tiled = (list, close, cls, g, size = 3000) => { const tiles = new Map();
    list.forEach(f => { const k = Math.floor(f[0] / size) + "," + Math.floor(f[1] / size); tiles.set(k, (tiles.get(k) || "") + topoD(f, close)); });
    tiles.forEach(d => el("path", { class: cls, d, "fill-rule": "evenodd" }, g)); };
  tiled(T.woods, true, "t-wood", TG.under); tiled(T.towns, true, "t-town", TG.under); tiled(T.lakes, true, "t-lake", TG.under);
  tiled(T.water.filter(w => w[0] === 2).map(w => w[1]), false, "t-water t-w2", TG.over);
  tiled(T.water.filter(w => w[0] === 1).map(w => w[1]), false, "t-water t-w1", TG.over);
  const rd = k => T.roads.filter(r => r[0] === k).map(r => r[1]);
  [3, 2, 1].forEach(k => tiled(rd(k), false, "t-case t-r" + k, TG.over)); [3, 2, 1].forEach(k => tiled(rd(k), false, "t-fill t-r" + k, TG.over));
  const rail = T.rail.map(f => topoD(f)).join(""); if (rail) { el("path", { class: "t-rail", d: rail }, TG.over); el("path", { class: "t-rail2", d: rail }, TG.over); }
  // names: towns (1) and villages (2) always, hamlets (3) and farms (4) closer in, rivers in italic
  // a name already on the map nearby — a cru village's own label (Champagne), or IGN naming a town twice — isn't repeated
  const placed = st.pack.climats.filter(c => c.lb).map(c => [norm(c.n), c.lp[0], c.lp[1]]);
  T.names.slice().sort((a, b) => (a[0] === "w" ? 5 : a[0]) - (b[0] === "w" ? 5 : b[0])).forEach(([k, n, x, y]) => {
    const nn = norm(n); if (placed.some(([m, px, py]) => m === nn && Math.hypot(px - x, py - y) < 6000)) return; placed.push([nn, x, y]);
    const e = el("text", { class: "tn tn-" + k, x, y }, TG.names); e.textContent = n; e._k = k; });
  topoLod();
}
// what shows at this zoom: lanes and hamlets close in; names kept clear of the vineyards' own labels and each other
function topoLod() {
  if (!TG.names || !st.view) return;
  const on = st.topo && !!topoOf(), wk = st.view[2] / 1000; // view width, km
  [TG.under, TG.over, TG.names].forEach(g => g.style.display = on ? "" : "none"); if (!on) return;
  svg.classList.toggle("lod-mid", wk < 14); svg.classList.toggle("lod-near", wk < 6);
  const k = st.view[2] / (svg.clientWidth || 800), taken = [];
  if (gLabels) gLabels.querySelectorAll("text").forEach(t => { if (t.style.display === "none") return; const b = t.getBBox && t.getBBox(); if (b && b.width) taken.push([b.x, b.y, b.x + b.width, b.y + b.height]); });
  for (const t of TG.names.children) {
    const kind = t._k, show = kind === 1 || kind === 2 ? wk < (kind === 1 ? 200 : 40) : kind === 3 ? wk < 14 : kind === 4 ? wk < 6 : wk < 8; // streams: close in (the Rhône's side valleys are full of them)
    if (!show) { t.style.display = "none"; continue; }
    const fs = (kind === 1 ? 14 : kind === 2 ? 12.5 : kind === "w" ? 11.5 : 11) * k, x = +t.getAttribute("x"), y = +t.getAttribute("y"), w = t.textContent.length * fs * .55;
    const box = [x - w / 2, y - fs * .6, x + w / 2, y + fs * .6];
    const hide = taken.some(o => !(box[2] < o[0] || box[0] > o[2] || box[3] < o[1] || box[1] > o[3]));
    t.style.display = hide ? "none" : ""; if (hide) continue;
    taken.push(box); t.style.fontSize = fs + "px"; t.style.strokeWidth = 3 * k + "px";
  }
}

/* ---------- geology (French regions): BRGM's 1:50 000 map from atlas-<id>-geol.js (tools/region-geol.js), the formations
   drawn under the vineyards' outlines, and for each vineyard the formations under it by share of its area ---------- */
st.geol = pref("atlasGeol", false);
const geolOf = () => st.region && window.ATLAS_GEOL && ATLAS_GEOL[st.region.id];
const geolShown = () => st.geol && !!geolOf();
function ensureGeol() {
  const R = st.region; if (!R || !R.geol || geolOf() || ensureGeol.busy === R) return;
  ensureGeol.busy = R;
  loadScript(R.geol).then(() => { if (st.region === R) { drawGeol(); paint(); renderLegend(); renderSide(); } }).catch(() => {}).finally(() => { ensureGeol.busy = null; });
}
function drawGeol() {
  const G = geolOf(); if (!G || !TG.geol) return; TG.geol.innerHTML = "";
  Object.entries(G.shapes).forEach(([k, rings]) => el("path", { d: rings.map(f => topoD(f, true)).join(""), fill: G.legend[k][2], "fill-rule": "evenodd" }, TG.geol));
  TG.geol.style.display = st.geol ? "" : "none";
}
// BRGM's notation (γ for granite, j8 for the Kimmeridgian…) and its own description, which is in French
const geolLabel = (G, k) => { const [n, d] = G.legend[k]; return (n ? `<b>${esc(n)}</b> ` : "") + esc(d); };
const geolSw = (G, k) => `<span class="cls" style="background:${G.legend[k][2]}"></span>`;
function geolHtml(c) {
  const G = geolOf(), u = G && G.under[c.id]; if (!u) return "";
  return `<h3>${esc(t("Geology"))}</h3><table class="own geolt">${u.map(([k, p]) => `<tr><td>${geolSw(G, k)}${geolLabel(G, k)}</td><td class="n">${p}%</td></tr>`).join("")}</table>
    <p class="note">${esc(t("Share of the vineyard's area on each formation of BRGM's 1:50 000 geological map; scree, colluvium and river terraces are mapped over the bedrock where they are thick."))}${window.I18N && I18N.lang !== "fr" ? " " + esc(t("BRGM's descriptions, in French.")) : ""}</p>`;
}
// zoom limits: no closer than 150 m across, no further out than three times the region
const MIN_W = 150, maxW = () => st.pack ? (st.pack.meta.bb[2] - st.pack.meta.bb[0]) * 3 : Infinity;
const clampW = w => Math.max(MIN_W, Math.min(w, maxW()));
const svgSize = () => { const r = mapRect(); return [r.width || 800, r.height || 600]; }; // fractional, as laid out
const aspect = () => { const [W, H] = svgSize(); return H / W; };
function fit(bb, pad, ms) {
  const [W, H] = svgSize(), bw = bb[2] - bb[0], bh = bb[3] - bb[1], m = pad ?? .06;
  const w = clampW(Math.max(bw / W, bh / H) * (1 + 2 * m) * W), h = w * aspect(); // a tiny vineyard: centred, at the closest zoom
  const v = [(bb[0] + bb[2]) / 2 - w / 2, (bb[1] + bb[3]) / 2 - h / 2, w, h];
  if (ms && st.view) flyTo(v, ms); else setView(v);
}
// a short eased glide to a view (the zoom buttons, a double-tap, picking a vineyard); none if the system asks for less motion
let flyRaf = 0;
function flyTo(to, ms = 260) {
  cancelAnimationFrame(flyRaf); stopGlide();
  const from = st.view.slice(), t0 = performance.now();
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) ms = 0;
  // zoom eased in log space, so it feels even whether going in or out
  const step = now => { const t = ms ? Math.min(1, (now - t0) / ms) : 1, e = 1 - Math.pow(1 - t, 3);
    const w = from[2] * Math.pow(to[2] / from[2], e), k = (w - from[2]) / ((to[2] - from[2]) || 1);
    const v = [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k, w, w * from[3] / from[2]];
    setView(t < 1 ? v : to, t < 1); if (t < 1) flyRaf = requestAnimationFrame(step); };
  flyRaf = requestAnimationFrame(step);
}
const bbOf = mp => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; mp.forEach(p => p[0].forEach(([x, y]) => { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); })); return [a, b, c, d]; };
// the view at width w with the map point (cx, cy) kept where it is on screen; the width is held to the limits first,
// so at the closest zoom the map stands still instead of sliding away
const zoomBox = (w, cx, cy) => { const [x, y, w0, h0] = st.view, k = clampW(w) / w0; return [cx - (cx - x) * k, cy - (cy - y) * k, w0 * k, h0 * k]; };
function zoomAt(f, cx, cy, ms) {
  if (!st.pack || clampW(st.view[2] * f) === st.view[2]) return; // as far in (or out) as it goes
  const v = zoomBox(st.view[2] * f, cx, cy); if (ms) flyTo(v, ms); else setView(v, true);
}
const toSvg = e => { const r = mapRect(), [x, y, w, h] = st.view; return [x + (e.clientX - r.left) / r.width * w, y + (e.clientY - r.top) / r.height * h]; };
// a mouse wheel's notch is ~100; a trackpad pinch arrives as small ctrl+wheel steps, so those count for more
svg.addEventListener("wheel", e => { if (!st.view) return; e.preventDefault(); stopGlide(); cancelAnimationFrame(flyRaf); const [cx, cy] = toSvg(e);
  const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY; zoomAt(Math.exp(Math.max(-1, Math.min(1, dy * (e.ctrlKey ? .01 : .0016)))), cx, cy); }, { passive: false });
/* touch and mouse, as on a phone map: a drag pans and a flick glides on, slowing; a pinch zooms and pans together,
   keeping the point between the fingers under them; lifting one finger carries on as a pan without a jump; a double-tap
   or double-click zooms in there */
const ptrs = new Map(); let moved = 0, pinch = null, pan = null, trail = [], glideRaf = 0, lastTap = null;
function stopGlide() { cancelAnimationFrame(glideRaf); glideRaf = 0; }
const startPan = (x, y) => { pan = { x, y, v: st.view.slice() }; trail = [[performance.now(), x, y]]; };
function startPinch() { const [a, b] = [...ptrs.values()], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  pinch = { d: Math.max(20, Math.hypot(a[0] - b[0], a[1] - b[1])), w: st.view[2], c: toSvg({ clientX: m[0], clientY: m[1] }) }; pan = null; }
svg.addEventListener("pointerdown", e => { stopGlide(); cancelAnimationFrame(flyRaf); ptrs.set(e.pointerId, [e.clientX, e.clientY]); try { svg.setPointerCapture(e.pointerId); } catch (x) {} svg.classList.add("drag");
  if (ptrs.size === 1) moved = 0;
  if (!st.view) return; // the start page: its dots are links
  if (ptrs.size === 1) startPan(e.clientX, e.clientY); else if (ptrs.size === 2) startPinch(); });
svg.addEventListener("pointermove", e => {
  if (!ptrs.has(e.pointerId) || !st.view) return;
  const [px, py] = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  moved += Math.abs(e.clientX - px) + Math.abs(e.clientY - py);
  const r = mapRect();
  if (ptrs.size === 2 && pinch) { const [a, b] = [...ptrs.values()], d = Math.max(20, Math.hypot(a[0] - b[0], a[1] - b[1]));
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, w = clampW(pinch.w * pinch.d / d), h = w * aspect();
    setView([pinch.c[0] - (mx - r.left) / r.width * w, pinch.c[1] - (my - r.top) / r.height * h, w, h], true); moved += 10; return; }
  if (ptrs.size === 1 && pan) { const [x, y, w, h] = pan.v;
    setView([x - (e.clientX - pan.x) / r.width * w, y - (e.clientY - pan.y) / r.height * h, w, h], true);
    const now = performance.now(); trail.push([now, e.clientX, e.clientY]); while (trail.length > 2 && now - trail[0][0] > 90) trail.shift(); }
});
// after a flick: carry on at the release speed, slowing with a ~325 ms time constant
function glideFrom(vx, vy) { const r = mapRect(); let last = performance.now();
  const step = now => { const dt = Math.min(40, now - last); last = now; const f = Math.exp(-dt / 325); vx *= f; vy *= f;
    const [x, y, w, h] = st.view; setView([x - vx * dt / r.width * w, y - vy * dt / r.height * h, w, h], true);
    if (Math.hypot(vx, vy) > .02) glideRaf = requestAnimationFrame(step); else { glideRaf = 0; setView(st.view); } };
  glideRaf = requestAnimationFrame(step); }
const up = e => { const had = ptrs.size; ptrs.delete(e.pointerId);
  if (had === 2 && ptrs.size === 1 && st.view) { const [x, y] = [...ptrs.values()][0]; startPan(x, y); } // one finger left: pan on from here
  if (ptrs.size < 2) pinch = null;
  if (!ptrs.size) { svg.classList.remove("drag");
    if (pan && moved >= 6 && trail.length >= 2) { const [t0, x0, y0] = trail[0], [t1, x1, y1] = trail[trail.length - 1], dt = Math.max(8, t1 - t0);
      const vx = (x1 - x0) / dt, vy = (y1 - y0) / dt; if (performance.now() - t1 < 60 && Math.hypot(vx, vy) > .25) glideFrom(vx, vy); else if (st.view) setView(st.view); }
    else if (st.view && moved >= 6) setView(st.view);
    pan = null; } };
svg.addEventListener("pointerup", e => { const tgt = document.elementFromPoint(e.clientX, e.clientY), touch = e.pointerType === "touch"; up(e);
  const hd = !st.pack && tgt && tgt.closest && tgt.closest(".hd, .ol"); if (hd) { goTo(hd.dataset.id); return; }
  if (moved >= 6 || !st.pack) return;
  // a second tap close by, soon after: zoom in there (the first tap's selection stands)
  if (touch) { const now = performance.now();
    if (lastTap && now - lastTap[0] < 320 && Math.hypot(e.clientX - lastTap[1], e.clientY - lastTap[2]) < 32) { lastTap = null; const [cx, cy] = toSvg(e); zoomAt(.5, cx, cy, 260); return; }
    lastTap = [now, e.clientX, e.clientY]; }
  if (PROF.on) { profClick(toSvg(e)); return; }
  const q = tgt && tgt.closest && tgt.closest(".pt"), c = tgt && tgt.closest && tgt.closest(".cl"); select(q ? q.dataset.pt : c ? c.dataset.id : null); });
svg.addEventListener("pointercancel", up);
svg.addEventListener("dblclick", e => { if (!st.pack || PROF.on) return; e.preventDefault(); const [cx, cy] = toSvg(e); zoomAt(.5, cx, cy, 260); });
// Safari's own page pinch would fight the map's
["gesturestart", "gesturechange"].forEach(t => svg.addEventListener(t, e => e.preventDefault()));
$("zIn").onclick = () => { const [x, y, w, h] = st.view; zoomAt(.6, x + w / 2, y + h / 2, 220); };
$("zOut").onclick = () => { const [x, y, w, h] = st.view; zoomAt(1 / .6, x + w / 2, y + h / 2, 220); };
$("zHome").onclick = () => fit(st.home, undefined, 320);
/* ---------- where am I: the phone's position on the region's map, and a word on where it is ---------- */
let toastT = 0;
function mapToast(msg) { const b = $("mapToast"); b.textContent = msg; b.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { b.hidden = true; }, 5000); }
// longitude, latitude → the pack's metres: Lambert-93 in France, the local grid round meta.origin in Germany
function toPack(lon, lat) { const M = st.pack.meta;
  if (M.proj === "eq") { const O = M.origin, d = Math.PI / 180; return [(lon - O[0]) * d * 6371000 * Math.cos(O[1] * d), (O[1] - lat) * d * 6371000]; }
  const [E, N] = L93(lon, lat); return [E - M.l93[0], M.l93[1] - N]; }
function drawMe() {
  if (!TG.me) return; TG.me.innerHTML = "";
  if (!st.me || !st.region || st.me.r !== st.region.id || !st.view) return;
  const k = st.view[2] / (svg.clientWidth || 800);
  el("circle", { class: "acc", cx: st.me.p[0], cy: st.me.p[1], r: Math.max(st.me.acc, 9 * k) }, TG.me);
  el("circle", { cx: st.me.p[0], cy: st.me.p[1], r: 7 * k }, TG.me);
}
$("locBtn").onclick = () => {
  if (!navigator.geolocation || !st.pack) return;
  const R = st.region; mapToast(t("Your location") + "…");
  navigator.geolocation.getCurrentPosition(pos => {
    if (st.region !== R) return;
    const p = toPack(pos.coords.longitude, pos.coords.latitude), acc = Math.min(2000, pos.coords.accuracy || 50);
    // far from every vineyard on this map: say how far, and leave the map where it is
    let near = Infinity; st.pack.climats.forEach(c => c.g.forEach(poly => poly[0].forEach(([x, y]) => { const d = Math.hypot(x - p[0], y - p[1]); if (d < near) near = d; })));
    if (near > 5000) { st.me = null; drawMe(); return mapToast(t("You're about {0} km from the nearest vineyard on this map.", Math.round(near / 1000).toLocaleString())); }
    st.me = { r: R.id, p, acc }; const c = climatAt(p);
    mapToast(c ? t("You're in {0}.", shown(c)) : t("You're here — not inside a named vineyard."));
    fit([p[0] - 450, p[1] - 450, p[0] + 450, p[1] + 450], .05, 400); drawMe();
    if (c) select(c.id, false);
  }, () => mapToast(t("Couldn't find your location.")), { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 } /* fresh: walking between vineyards */);
};
/* ---------- the keyboard, on the focused map: arrows pan (Shift: further), + and − zoom, 0 or Home: the whole region ---------- */
svg.setAttribute("tabindex", "0");
svg.addEventListener("keydown", e => {
  if (!st.pack || !st.view || e.ctrlKey || e.metaKey || e.altKey) return;
  const [x, y, w, h] = st.view, f = e.shiftKey ? .5 : .2, pan = { ArrowLeft: [-f * w, 0], ArrowRight: [f * w, 0], ArrowUp: [0, -f * h], ArrowDown: [0, f * h] }[e.key];
  if (pan) flyTo([x + pan[0], y + pan[1], w, h], 160);
  else if (e.key === "+" || e.key === "=") zoomAt(.6, x + w / 2, y + h / 2, 160);
  else if (e.key === "-" || e.key === "_") zoomAt(1 / .6, x + w / 2, y + h / 2, 160);
  else if (e.key === "0" || e.key === "Home") fit(st.home, undefined, 320);
  else return;
  e.preventDefault();
});
$("profBtn").onclick = () => profToggle();
$("pngBtn").onclick = exportPNG;
$("printBtn").onclick = () => window.print();
// the atlas files, packs and relief tiles kept in the browser for a second visit and a patchy connection (atlas-sw.js)
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("atlas-sw.js").catch(() => {});

/* ---------- save the view as an image: the map as drawn (the relief tiles come from another site, so they're left out:
   a canvas that draws them can't be saved), with a band naming the view and its sources ---------- */
async function exportPNG() {
  const btn = $("pngBtn"); if (!st.pack) return; btn.disabled = true;
  try {
    const w = svg.clientWidth, h = svg.clientHeight, sc = 2, [vx, vy, vw, vh] = st.view;
    const clone = svg.cloneNode(true); clone.querySelectorAll(".shade, .prof").forEach(e => e.remove());
    clone.setAttribute("xmlns", NS); clone.setAttribute("width", w); clone.setAttribute("height", h);
    // the page's styles, with the colour tokens resolved (inside a standalone svg :root is the svg itself)
    const cs = getComputedStyle(document.documentElement), css = [...document.querySelectorAll("style")].map(x => x.textContent).join("\n");
    const vars = [...new Set(css.match(/--[a-z0-9-]+/g) || [])].map(v => `${v}:${cs.getPropertyValue(v)}`).join(";");
    const st0 = document.createElementNS(NS, "style"); st0.textContent = `svg{${vars};font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}` + css;
    clone.insertBefore(st0, clone.firstChild);
    const bg = document.createElementNS(NS, "rect"); Object.entries({ x: vx, y: vy, width: vw, height: vh, fill: cs.getPropertyValue("--mapbg") }).forEach(([k, v]) => bg.setAttribute(k, v)); clone.insertBefore(bg, st0.nextSibling);
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }));
    const img = new Image(); await new Promise((ok, fail) => { img.onload = ok; img.onerror = fail; img.src = url; });
    const band = 34, cv = document.createElement("canvas"); cv.width = w * sc; cv.height = (h + band) * sc;
    const x = cv.getContext("2d"); x.scale(sc, sc); x.drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url);
    const c = st.sel && byId(st.sel), title = (c ? shown(c) + " · " : "") + st.pack.meta.name + " · " + t("Wine atlas");
    x.fillStyle = cs.getPropertyValue("--card"); x.fillRect(0, h, w, band); x.fillStyle = cs.getPropertyValue("--ink");
    x.font = "600 14px -apple-system,Segoe UI,Roboto,sans-serif"; x.fillText(title, 12, h + 22);
    x.font = "11px -apple-system,Segoe UI,Roboto,sans-serif"; x.fillStyle = cs.getPropertyValue("--muted"); x.textAlign = "right";
    x.fillText("allwine.dk · " + exportCredit(), w - 12, h + 22);
    const a = document.createElement("a"); a.download = `allwine-${norm(title).trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "atlas"}.png`;
    a.href = cv.toDataURL("image/png"); document.body.appendChild(a); a.click(); a.remove();
  } catch (e) { console.warn("export failed", e); }
  btn.disabled = false;
}
// the sources of what's in the image, short
function exportCredit() {
  const y = new Date().getFullYear(), M = st.pack.meta, topo = st.topo && topoOf();
  if (M.proj === "eq") return t("Einzellagen © Landwirtschaftskammer RLP") + (topo ? ` · © GeoBasis-DE / LVermGeoRP ${y}, dl-de/by-2-0` : "");
  return (villagesPack() ? t("Vines and boundaries © IGN, Licence Ouverte") : t(topo ? "Boundaries © INAO · map data © IGN, Licence Ouverte" : "Boundaries © INAO, Licence Ouverte")) + (geolShown() ? " · " + t("geology © BRGM") : "");
}

/* ---------- slope profile (French regions): two clicks, and IGN's elevation service cuts the ground between them ---------- */
const PROF = { on: false, a: null, b: null, data: null };
// Lambert-93 back to longitude and latitude (the inverse of L93 above), for the points the service is asked about
function L93inv(E, N) {
  const a = 6378137, e = 0.0818191910428158, d = Math.PI / 180, m = p => Math.cos(p) / Math.sqrt(1 - e * e * Math.sin(p) ** 2);
  const tt = p => Math.tan(Math.PI / 4 - p / 2) / ((1 - e * Math.sin(p)) / (1 + e * Math.sin(p))) ** (e / 2);
  const n = (Math.log(m(44 * d)) - Math.log(m(49 * d))) / (Math.log(tt(44 * d)) - Math.log(tt(49 * d))), F = m(44 * d) / (n * tt(44 * d) ** n), r0 = a * F * tt(46.5 * d) ** n;
  const dx = E - 700000, dy = r0 - (N - 6600000), r = Math.hypot(dx, dy), th = Math.atan2(dx, dy), t0 = (r / (a * F)) ** (1 / n);
  let p = Math.PI / 2 - 2 * Math.atan(t0);
  for (let i = 0; i < 8; i++) p = Math.PI / 2 - 2 * Math.atan(t0 * ((1 - e * Math.sin(p)) / (1 + e * Math.sin(p))) ** (e / 2));
  return [th / n / d + 3, p / d];
}
const inRing = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
const climatAt = ([x, y]) => st.pack.climats.filter(c => c.g.some(p => inRing(x, y, p[0]) && !p.slice(1).some(h => inRing(x, y, h)))).sort((a, b) => a.ha - b.ha)[0] || null;
function profDraw() {
  if (!TG.prof) return; TG.prof.innerHTML = ""; if (!PROF.a) return;
  const k = st.view[2] / (svg.clientWidth || 800);
  if (PROF.b) el("line", { class: "profline", x1: PROF.a[0], y1: PROF.a[1], x2: PROF.b[0], y2: PROF.b[1] }, TG.prof);
  [PROF.a, PROF.b].filter(Boolean).forEach(q => el("circle", { class: "profpt", cx: q[0], cy: q[1], r: 5 * k }, TG.prof));
  PROF.dot = el("circle", { class: "profdot", cx: -1e7, cy: -1e7, r: 5 * k }, TG.prof);
}
function profToggle(on) {
  PROF.on = on ?? !PROF.on; $("profBtn").classList.toggle("on", PROF.on); svg.classList.toggle("profiling", PROF.on);
  PROF.a = PROF.b = PROF.data = null; profDraw();
  const box = $("profile"); box.hidden = !PROF.on; if (!PROF.on) return;
  box.innerHTML = `<div class="ph">${esc(t("Click two points on the map to cut a profile across the slope"))}</div><button class="close" id="profClose" aria-label="${esc(t("Close"))}">×</button>`;
  $("profClose").onclick = () => profToggle(false);
}
function profClick(m) {
  if (!PROF.a || PROF.b) { PROF.a = m; PROF.b = null; PROF.data = null; profDraw(); $("profile").innerHTML = `<div class="ph">${esc(t("Now the second point"))}</div><button class="close" id="profClose" aria-label="${esc(t("Close"))}">×</button>`; $("profClose").onclick = () => profToggle(false); return; }
  PROF.b = m; profDraw(); profFetch();
}
async function profFetch() {
  const [E0, N0] = st.pack.meta.l93, ll = ([x, y]) => L93inv(E0 + x, N0 - y), la = ll(PROF.a), lb = ll(PROF.b);
  const len = Math.hypot(PROF.b[0] - PROF.a[0], PROF.b[1] - PROF.a[1]), n = Math.max(20, Math.min(200, Math.round(len / 10)));
  $("profile").innerHTML = `<div class="ph">${esc(t("Measuring the slope…"))}</div>`;
  try {
    const url = `https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevationLine.json?lon=${la[0].toFixed(6)}|${lb[0].toFixed(6)}&lat=${la[1].toFixed(6)}|${lb[1].toFixed(6)}&resource=ign_rge_alti_wld&sampling=${n}&profile_mode=simple`;
    const j = await (await fetch(url)).json();
    PROF.data = (j.elevations || []).map((e, i, arr) => { const f = arr.length > 1 ? i / (arr.length - 1) : 0, m = [PROF.a[0] + (PROF.b[0] - PROF.a[0]) * f, PROF.a[1] + (PROF.b[1] - PROF.a[1]) * f];
      return { d: len * f, z: e.z, m, c: climatAt(m) }; }).filter(q => q.z > -100);
    profChart();
  } catch (e) { $("profile").innerHTML = `<div class="ph">${esc(t("Couldn't reach IGN's elevation service."))}</div><button class="close" id="profClose">×</button>`; $("profClose").onclick = () => profToggle(false); }
}
function profChart() {
  const P = PROF.data, box = $("profile"); if (!P || P.length < 2) return;
  const Wc = 1000, Hc = 150, padL = 34, padB = 16, top = 22, css = getComputedStyle(document.documentElement), tok = v => css.getPropertyValue(v).trim();
  const zs = P.map(q => q.z), z0 = Math.floor(Math.min(...zs) / 10) * 10, z1 = Math.ceil(Math.max(...zs) / 10) * 10 + 10, L = P[P.length - 1].d;
  const X = d => padL + d / L * (Wc - padL - 6), Y = z => top + (1 - (z - z0) / (z1 - z0)) * (Hc - top - padB);
  const col = c => !c ? tok("--rg") : tok({ GC: "--gc", "1er": "--pc", AOC: "--ac", EL: "--pc" }[c.c] || "--pc");
  let g = "";
  for (let i = 0; i < P.length - 1; i++) g += `<path d="M${X(P[i].d).toFixed(1)} ${Hc - padB}L${X(P[i].d).toFixed(1)} ${Y(P[i].z).toFixed(1)}L${X(P[i + 1].d).toFixed(1)} ${Y(P[i + 1].z).toFixed(1)}L${X(P[i + 1].d).toFixed(1)} ${Hc - padB}Z" fill="${col(P[i].c)}"/>`;
  g += `<path d="${P.map((q, i) => (i ? "L" : "M") + X(q.d).toFixed(1) + " " + Y(q.z).toFixed(1)).join("")}" class="pline"/>`;
  // names over runs of the same vineyard that are wide enough to label
  let run = 0;
  for (let i = 1; i <= P.length; i++) if (i === P.length || P[i].c !== P[run].c) { const c = P[run].c, w = X(P[i - 1].d) - X(P[run].d);
    if (c && w > 46) { const mid = Math.floor((run + i - 1) / 2); g += `<text x="${X(P[mid].d).toFixed(1)}" y="${(Y(Math.max(...P.slice(run, i).map(q => q.z))) - 5).toFixed(1)}" class="plab" text-anchor="middle">${esc(shown(c))}</text>`; }
    run = i; }
  for (let z = z0; z <= z1; z += (z1 - z0 > 120 ? 50 : 20)) g += `<text x="${padL - 4}" y="${Y(z) + 3}" class="pax" text-anchor="end">${z}</text><line x1="${padL}" x2="${Wc - 6}" y1="${Y(z)}" y2="${Y(z)}" class="pgrid"/>`;
  const rise = Math.max(...zs) - Math.min(...zs), avg = (100 * Math.abs(P[P.length - 1].z - P[0].z) / L).toFixed(1);
  box.innerHTML = `<div class="phead"><b>${esc(t("Slope profile"))}</b> · ${(L / 1000).toFixed(2)} km · ${Math.round(Math.min(...zs))}–${Math.round(Math.max(...zs))} m · ${esc(t("{0} m of relief, {1} % average gradient", Math.round(rise), avg))}<button class="close" id="profClose" aria-label="${esc(t("Close"))}">×</button></div>
    <svg viewBox="0 0 ${Wc} ${Hc}" preserveAspectRatio="none" class="pchart">${g}<line class="pcur" x1="-9" x2="-9" y1="${top}" y2="${Hc - padB}"/></svg><div class="ptip" id="ptip"></div>`;
  $("profClose").onclick = () => profToggle(false);
  const sv = box.querySelector(".pchart"), cur = sv.querySelector(".pcur"), near = ev => { const r = sv.getBoundingClientRect(), d = ((ev.clientX - r.left) / r.width * Wc - padL) / (Wc - padL - 6) * L; return P.reduce((a, b) => Math.abs(b.d - d) < Math.abs(a.d - d) ? b : a); };
  sv.addEventListener("pointermove", ev => { const q = near(ev); cur.setAttribute("x1", X(q.d)); cur.setAttribute("x2", X(q.d));
    $("ptip").textContent = `${Math.round(q.z)} m · ${q.c ? shown(q.c) + " (" + t(CLASS[q.c.c]) + ")" : t("outside the vineyards")}`;
    if (PROF.dot) { PROF.dot.setAttribute("cx", q.m[0]); PROF.dot.setAttribute("cy", q.m[1]); } });
  sv.addEventListener("click", ev => { const q = near(ev); if (q.c) select(q.c.id, false); });
}
addEventListener("resize", () => { if (st.view) layoutLabels(); });

/* ---------- the side panel ---------- */
const byId = id => st.pack && (st.pack.climats.find(c => c.id === id) || pts().find(q => q.id === id));
function select(id, fly) {
  st.sel = byId(id) ? id : null; if (st.sel) ensureGeol(); paint(); renderSide(); syncHash();
  document.body.classList.toggle("side-open", !!st.sel); // a phone: the vineyard's details slide up
  const c = st.sel && byId(st.sel);
  if (c && fly) { if (c.g) fit(bbOf(c.g), .6, 360); else if (c.p) fit([c.p[0] - 900, c.p[1] - 900, c.p[0] + 900, c.p[1] + 900], .1, 360); }
}
function renderSide() {
  const P = st.pack, side = $("side"); if (!P) return renderHomeSide();
  const c = st.sel && byId(st.sel), R = st.region;
  if (!c) {
    const gc = P.climats.filter(x => x.c === "GC"), pc = P.climats.filter(x => x.c === "1er" && !x.unnamed), aoc = P.climats.filter(x => x.c === "AOC"), many = P.villages.length > 1;
    const sum = list => fmtHa(list.reduce((s, x) => s + x.ha, 0)) + " ha", fact = (l, v) => `<div class="fact"><div class="l">${esc(l)}</div><div class="v">${v}</div></div>`;
    const el = P.climats.filter(x => x.c === "EL");
    const lead = el.length ? t("{0} Einzellagen from the Weinbergsrolle. Click one.", el.length) : villagesPack() ? t("{0} grand cru and {1} premier cru villages, drawn as the vines inside each village (IGN). Click a village.", gc.length, pc.length)
      : aoc.length ? t("{0} cru appellations on INAO's own map. Click one.", aoc.length)
      : gc.length && pc.length ? t("{0} grands crus and {1} premiers crus on INAO's own map. Click a vineyard.", gc.length, pc.length)
      : gc.length ? t("{0} grands crus on INAO's own map. Click a vineyard.", gc.length) : t("{0} premiers crus on INAO's own map. Click a vineyard.", pc.length);
    // the lists: Champagne's by sub-region, the premiers crus by village appellation where there are several
    const groups = (list, label) => { const by = {}; list.forEach(x => (by[x.area || (many ? x.app : "")] ??= []).push(x));
      return Object.entries(by).map(([k, l]) => `<h3>${esc(k ? (many && !x0(l).area ? t("{0} premier cru", k) : t(label + " · {0}", k)) : t(label))}</h3><ul class="list">${l.map(x => row(x)).join("")}</ul>`).join(""); };
    const x0 = l => l[0];
    side.innerHTML = `<h2>${esc(P.meta.name)}</h2>
      <p class="meta">${esc(lead)}</p>
      <div class="facts">${gc.length ? fact(t("Grand cru"), sum(gc)) : ""}${P.climats.some(x => x.c === "1er") ? fact(t("Premier cru"), sum(P.climats.filter(x => x.c === "1er"))) : ""}${aoc.length ? fact(t("Cru appellation"), sum(aoc)) : ""}${el.length ? fact(t("Vines (Weinbergsrolle)"), sum(el.filter(x => x.reg))) : ""}
        ${P.villages.map(v => fact(P.villages.length > 1 || !R.village ? v.ap : t(R.village), fmtHa(v.ha) + " ha")).join("")}
        ${P.regional.ha ? fact(t(R.regional), fmtHa(P.regional.ha) + " ha") : ""}</div>
      ${many && pc.length ? `<p class="note">${esc(t("Village figures are the land outside the premiers crus."))}</p>` : ""}
      ${(P.meta.absent || []).length ? `<p class="note">${esc(t("Not drawn: {0} — INAO's parcel map doesn't have it yet.", P.meta.absent.join(", ")))}</p>` : ""}
      ${terrNote()}
      ${cellarSummary()}
      ${gc.length ? groups(gc, "Grand cru") : ""}${pc.length ? groups(pc, "Premier cru") : ""}
      ${aoc.length ? `<h3>${esc(t("Cru appellation"))}</h3><ul class="list">${aoc.map(x => row(x)).join("")}</ul>` : ""}
      ${Object.entries(el.reduce((o, x) => ((o[x.area] ??= []).push(x), o), {})).map(([k, l]) => `<h3>${esc(t("Bereich {0}", k))}</h3><ul class="list">${l.sort((a, b) => shown(a).localeCompare(shown(b), "de")).map(x => row(x)).join("")}</ul>`).join("")}
      ${Object.keys(PTCLASS).filter(k => pts().some(q => q.cls === k)).map(k => `<h3>${esc(t(PTCLASS[k]))}</h3><ul class="list">${pts().filter(q => q.cls === k).map(q => ptRow(q)).join("")}</ul>`).join("")}
      ${pts().some(q => !q.p) ? `<p class="note">° ${esc(t("Not on IGN's map under its own name, so not drawn."))}</p>` : ""}
      ${pc.some(x => x.inferred) ? `<p class="note">* ${esc(t("INAO's map doesn't name this land; the name comes from IGN's place names inside or next to it."))}</p>` : ""}
      <p class="src">${esc(P.meta.source)}. ${esc(t("Built {0}.", P.meta.built))}${P.meta.l93 ? " " + esc(t("Relief shading and roads, rivers, woods and villages: IGN (Géoplateforme, Licence Ouverte).")) : ""}${R.geol ? " " + esc(t("Geology: BRGM, the harmonised 1:50 000 map (BD Charm-50, Licence Ouverte).")) : ""}${st.style === "photo" && P.meta.l93 ? " " + esc(t("Aerial photos: IGN (Géoplateforme, Licence Ouverte).")) : ""}${P.meta.proj === "eq" ? deCredit() : ""}</p>`;
  } else if (!c.g) { // a classified château
    const bottles = CELLAR.by[c.id];
    side.innerHTML = `<p><button class="btn" id="back">← ${esc(P.meta.name)}</button></p>
      <span class="pill GC">${esc(t(PTCLASS[c.cls]))}</span>
      <h2>${esc(c.n)}</h2>
      <div class="meta">${esc(c.ap)} · ${esc(PTLABEL[c.cls])}</div>
      <p class="note">${esc(c.p ? t("On IGN's map as “{0}”.", c.ign) : t("Not on IGN's map under its own name, so not drawn."))}</p>
      ${bottles ? `<h3>${esc(t("In your cellar"))}</h3>` + bottles.wines.slice(0, 12).map(w => `<div class="cw"><b>${w.left}×</b> ${esc(w.producer)} · ${esc(w.name || "")} ${esc(String(w.vintage || ""))}</div>`).join("") : ""}
      <p><button class="btn primary" id="addHere">＋ ${esc(t("Add a bottle from here"))}</button></p>
      <p class="src">${esc(t("The 1855 classification; châteaux placed on IGN BD TOPO (Licence Ouverte)."))}</p>`;
    $("back").onclick = () => select(null);
    $("addHere").onclick = () => addFromAtlas(c, R);
  } else {
    const parent = c.parent && byId(c.parent), bottles = CELLAR.by[c.id];
    side.innerHTML = `<p><button class="btn" id="back">← ${esc(P.meta.name)}</button></p>
      <span class="pill ${cls(c)}">${esc(t(CLASS[c.c]))}</span>
      <h2>${esc(shown(c))}</h2>
      <div class="meta">${esc(c.c === "EL" ? c.n : c.ap)}${parent ? " · " + esc(t("within {0}", parent.n)) : ""}${c.gl ? " · " + esc(t("Großlage {0}", c.gl)) : ""}</div>
      ${c.c === "EL" ? `<div class="facts"><div class="fact"><div class="l">${esc(t("Vines (Weinbergsrolle)"))}</div><div class="v">${c.reg ? fmtHa(c.ha) + " ha" : "—"}</div></div>
        <div class="fact"><div class="l">${esc(t("Outline on the map"))}</div><div class="v">${fmtHa(c.haMap)} ha</div></div></div>
        <p class="note">${esc(t("Gemarkung: {0}", c.gm.join(", ")))} · ${esc(t("Bereich {0}", c.area))}</p>`
      : `<div class="facts"><div class="fact"><div class="l">${esc(t(villagesPack() ? "Vines (IGN)" : "INAO area"))}</div><div class="v">${fmtHa(c.ha)} ha</div></div>
        <div class="fact"><div class="l">${esc(t("Acres"))}</div><div class="v">${(c.ha * 2.471).toFixed(c.ha < 4 ? 1 : 0)}</div></div></div>`}
      ${st.cmpWith && st.cmpWith !== c.id && byId(st.cmpWith) && byId(st.cmpWith).g ? compareHtml(byId(st.cmpWith), c) : ""}
      ${st.cmpWith === c.id ? `<p class="note">${esc(t("Now pick another vineyard to compare with."))}</p>` : ""}
      ${terrainHtml(c)}
      ${geolHtml(c)}
      ${noteOf(c) ? `<p class="note">${esc(noteOf(c))}</p>` : ""}
      ${c.inferred ? `<p class="note">${esc(t("INAO's map gives this land only as premier cru; the name comes from IGN's place names inside or next to it ({0}).", (c.places || []).join(", ")))}</p>` : ""}
      ${c.partInferred ? `<p class="note">${esc(t("Part of this outline is premier cru land INAO leaves unnamed, joined to it by IGN's place names ({0}).", c.partInferred.join(", ")))}</p>` : ""}
      ${c.unnamed ? `<p class="note">${esc(t("INAO's map gives this land only as premier cru, and no place name ties it to a climat."))}</p>` : ""}
      ${bottles ? `<h3>${esc(t("In your cellar"))}</h3>` + bottles.wines.slice(0, 12).map(w => `<div class="cw"><b>${w.left}×</b> ${esc(w.producer)} · ${esc(w.name || "")} ${esc(String(w.vintage || ""))}</div>`).join("") : ""}
      ${c.unnamed ? "" : `<p><button class="btn primary" id="addHere">＋ ${esc(t("Add a bottle from here"))}</button> ${st.cmpWith ? "" : `<button class="btn" id="cmpBtn">⇄ ${esc(t("Compare"))}</button>`}</p>`}
      <p class="src">${esc(P.meta.source)}.</p>`;
    $("back").onclick = () => select(null);
    const ah = $("addHere"); if (ah) ah.onclick = () => addFromAtlas(c, R);
    const cb = $("cmpBtn"); if (cb) cb.onclick = () => { st.cmpWith = c.id; renderSide(); };
    const ce = $("cmpEnd"); if (ce) ce.onclick = () => { st.cmpWith = null; renderSide(); };
  }
  side.querySelectorAll("button[data-c]").forEach(b => b.onclick = () => select(b.dataset.c, true));
}
// measured terrain (atlas-<id>-dem.js, tools/region-dem.js): [alt p5, alt p95, mean alt, slope %, aspect °, consistency %, samples, grid step m]
const demOf = id => window.ATLAS_DEM && ATLAS_DEM[id];
const WINDS = { en: "N NNE NE ENE E ESE SE SSE S SSW SW WSW W WNW NW NNW", da: "N NNØ NØ ØNØ Ø ØSØ SØ SSØ S SSV SV VSV V VNV NV NNV", fr: "N NNE NE ENE E ESE SE SSE S SSO SO OSO O ONO NO NNO", de: "N NNO NO ONO O OSO SO SSO S SSW SW WSW W WNW NW NNW" };
const wind = deg => (WINDS[window.I18N ? I18N.lang : "en"] || WINDS.en).split(" ")[Math.round(deg / 22.5) % 16];
function terrainHtml(c) {
  const D = demOf(st.region.id), m = D && D.c[c.id]; if (!m) return "";
  const asp = m[3] < 1.5 ? t("flat") : (m[5] < 55 ? t("varied") + " · " : "") + wind(m[4]), wide = m[7] > 120;
  return `<div class="facts" title="${esc(t("Altitude and slope measured from IGN's elevation model"))}">
      <div class="fact"><div class="l">${esc(t("Altitude"))}</div><div class="v">${m[0]}–${m[1]} m</div></div>
      <div class="fact"><div class="l">${esc(t("Faces"))}</div><div class="v">${esc(asp)}</div></div>
      <div class="fact"><div class="l">${esc(t("Slope"))}</div><div class="v">${m[3].toFixed(m[3] < 10 ? 1 : 0)} %</div></div>
      <div class="fact"><div class="l">${esc(t("Mean altitude"))}</div><div class="v">${m[2]} m</div></div></div>
    <p class="note">${esc(t(st.pack.meta.proj === "eq" ? "Terrain: Rheinland-Pfalz's 1 m terrain model (DGM1), {0} points sampled inside the outline; altitude is the 5th–95th percentile." : "Terrain: IGN RGE ALTI®, {0} points sampled inside the outline; altitude is the 5th–95th percentile.", m[6]))}${m[8] ? " " + esc(t("Only the outline's vineyard land counts (the Basis-DLM's Weingarten), not the woods, plateau or village inside it.")) : ""}${wide ? " " + esc(t("The points are {0} m apart here, so the slope is the lie of the land, not the steepness of a single vineyard.", m[7])) : ""}</p>`;
}
// Germany's map: basemap.de's relief (as its terms ask: BKG and the licence linked) and the Basis-DLM of Rheinland-Pfalz
const deCredit = () => { const y = new Date().getFullYear();
  return ` ${esc(t("Relief"))}: © GeoBasis-DE / <a href="https://www.bkg.bund.de" target="_blank" rel="noopener">BKG</a> (${y}) <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>.`
    + ` ${esc(t("Roads, rivers, villages; altitude and slope"))}: ©GeoBasis-DE / LVermGeoRP (${y}), <a href="https://www.govdata.de/dl-de/by-2-0" target="_blank" rel="noopener">dl-de/by-2-0</a>, <a href="https://www.lvermgeo.rlp.de" target="_blank" rel="noopener">www.lvermgeo.rlp.de</a> [${esc(t("data edited"))}].`; };
/* ---------- terrain search (French regions, from the measured terrain): faces, altitude, slope, size ---------- */
st.terr = { asp: new Set(), altMin: null, altMax: null, slope: null, size: null };
const terrActive = () => { const T = st.terr; return !!(T.asp.size || T.altMin != null || T.altMax != null || T.slope != null || T.size != null); };
function terrOk(c) {
  if (!terrActive()) return true;
  const D = st.region && demOf(st.region.id), d = D && D.c[c.id], T = st.terr; if (!d) return false;
  if (T.asp.size && (d[3] < 1.5 || !T.asp.has(Math.round(d[4] / 45) % 8))) return false;
  if (T.altMin != null && d[1] < T.altMin) return false;
  if (T.altMax != null && d[0] > T.altMax) return false;
  if (T.slope != null && d[3] < T.slope) return false;
  return !(T.size != null && c.ha > T.size);
}
const ASP8 = { en: "N NE E SE S SW W NW", da: "N NØ Ø SØ S SV V NV", fr: "N NE E SE S SO O NO", de: "N NO O SO S SW W NW" };
function terrSync() {
  const T = st.terr, names = (ASP8[window.I18N ? I18N.lang : "en"] || ASP8.en).split(" ");
  $("tAsp").innerHTML = names.map((n, i) => `<button type="button" data-a="${i}" class="${T.asp.has(i) ? "on" : ""}">${n}</button>`).join("");
  $("tAsp").querySelectorAll("[data-a]").forEach(b => b.onclick = () => { const i = +b.dataset.a; T.asp.has(i) ? T.asp.delete(i) : T.asp.add(i); terrSync(); paint(); renderSide(); });
  $("tAltMin").value = T.altMin ?? ""; $("tAltMax").value = T.altMax ?? ""; $("tSlope").value = T.slope ?? ""; $("tSize").value = T.size ?? "";
  $("terrChip").classList.toggle("on", terrActive() || !$("terrbar").hidden);
}
const terrClear = () => { const T = st.terr; T.asp.clear(); T.altMin = T.altMax = T.slope = T.size = null; };
// the quick picks are the region's own top quarter: a steep slope in Champagne isn't one in the Côte-Rôtie
const quart = k => { const D = demOf(st.region.id), v = Object.values(D ? D.c : {}).map(d => d[k]).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length * .75)] : null; };
$("terrChip").onclick = () => { const bar = $("terrbar"); bar.hidden = !bar.hidden; $("terrChip").setAttribute("aria-expanded", !bar.hidden); terrSync(); };
[["tAltMin", "altMin"], ["tAltMax", "altMax"], ["tSlope", "slope"], ["tSize", "size"]].forEach(([id, k]) => $(id).addEventListener("input", ev => {
  const v = ev.target.value; st.terr[k] = v === "" ? null : +v; terrSync(); paint(); renderSide(); }));
document.querySelectorAll("#terrbar [data-preset]").forEach(b => b.onclick = () => { const T = st.terr; terrClear();
  ({ steep: () => T.slope = Math.round(quart(3)), high: () => T.altMin = Math.round(quart(2)), south: () => [3, 4, 5].forEach(i => T.asp.add(i)), small: () => T.size = 1 })[b.dataset.preset]();
  terrSync(); paint(); renderSide(); });
$("tClear").onclick = () => { terrClear(); terrSync(); paint(); renderSide(); };
const terrNote = () => { if (!terrActive()) return ""; const n = st.pack.climats.filter(c => !c.unnamed && terrOk(c));
  return `<p class="note terrhit">${esc(t("{0} vineyards match the terrain search.", n.length))} ${n.slice(0, 40).map(c => `<button class="plink" data-c="${esc(c.id)}">${esc(shown(c))}</button>`).join(", ")}${n.length > 40 ? " …" : ""}</p>`; };

/* ---------- compare two vineyards ---------- */
function compareHtml(a, b) {
  const D = demOf(st.region.id) || { c: {} }, dem = c => D.c[c.id], bot = c => CELLAR.by[c.id] ? CELLAR.by[c.id].left : 0;
  const rows = [[t("Class"), c => esc(t(CLASS[c.c]))], [t("Appellation"), c => esc(c.c === "EL" ? (c.gl ? t("Großlage {0}", c.gl) : "—") : c.ap)],
    [t("Area"), c => c.c === "EL" && !c.reg ? "—" : fmtHa(c.ha) + " ha"]]
    .concat(dem(a) || dem(b) ? [[t("Altitude"), c => dem(c) ? `${dem(c)[0]}–${dem(c)[1]} m` : "—"],
      [t("Faces"), c => dem(c) ? (dem(c)[3] < 1.5 ? t("flat") : (dem(c)[5] < 55 ? t("varied") + " · " : "") + wind(dem(c)[4])) : "—"],
      [t("Slope"), c => dem(c) ? `${dem(c)[3]} %` : "—"], [t("Mean altitude"), c => dem(c) ? `${dem(c)[2]} m` : "—"]] : [])
    .concat(geolOf() ? [[t("Geology"), c => { const G = geolOf(), u = G.under[c.id]; return u ? u.slice(0, 2).map(([k, p]) => `${geolSw(G, k)}${esc(G.legend[k][0] || G.legend[k][1].split(/[,(;]/)[0])} ${p}%`).join("<br>") : "—"; }]] : [])
    .concat(CELLAR.loaded ? [[t("In your cellar"), c => bot(c) ? `🍷 ${bot(c)}` : "—"]] : []);
  return `<h3>${esc(t("Compare"))}</h3><table class="own cmpv"><thead><tr><th></th>${[a, b].map(c => `<th><button class="plink" data-c="${esc(c.id)}">${esc(shown(c))}</button></th>`).join("")}</tr></thead>
    <tbody>${rows.map(([l, f]) => `<tr><td>${esc(l)}</td><td>${f(a)}</td><td>${f(b)}</td></tr>`).join("")}</tbody></table>
    <p><button class="btn" id="cmpEnd">${esc(t("Stop comparing"))}</button></p>`;
}
const ptRow = q => `<li><button data-c="${esc(q.id)}">${esc(short(q.n))}${q.p ? "" : " °"}</button><span>${esc(q.ap)}${CELLAR.by[q.id] ? " · 🍷 " + CELLAR.by[q.id].left : ""}</span></li>`;
const row = x => `<li><button data-c="${esc(x.id)}">${esc(shown(x))}${x.inferred ? " *" : ""}</button><span>${fmtHa(x.ha)} ha${CELLAR.by[x.id] ? " · 🍷 " + CELLAR.by[x.id].left : ""}</span></li>`;
function cellarSummary() {
  if (!CELLAR.loaded) return `<p class="note">${esc(t(CELLAR.msg))}</p>`;
  const n = Object.values(CELLAR.by).reduce((s, b) => s + b.left, 0), nc = Object.keys(CELLAR.by).length;
  return `<p class="note">🍷 ${esc(nc ? t(n > 1 ? "{0} bottles across {1} climats" : "{0} bottle in {1} climat", n, nc) : t("No bottles matched to a climat yet."))}${CELLAR.other ? " · " + esc(t("{0} more of this region's wines without a named climat", CELLAR.other)) : ""}</p>`;
}
// "Add a bottle from here": the cellar's add form, filled in (handed over in localStorage, read once by index.html)
function addFromAtlas(c, R) {
  if (!c.g) { // a château: the producer is the château, the classification as on its label
    const pre = { name: "", producer: c.n, commune: c.ap, classification: PTLABEL[c.cls], region: st.pack.meta.region, country: st.pack.meta.country,
      type: /^sau/.test(c.cls) ? "Hvid" : "Rød", at: Date.now() };
    try { localStorage.setItem("vinAddPrefill", JSON.stringify(pre)); } catch (e) {}
    location.href = "index.html#add"; return;
  }
  // a cru appellation or a Champagne village is where the wine is from, not its name
  const pre = { name: c.c === "AOC" || c.n === c.app || villagesPack() ? "" : shown(c), commune: c.app, classification: { GC: "Grand cru", "1er": "1. cru" }[c.c] || "", region: st.pack.meta.region, country: st.pack.meta.country,
    type: TYPE[c.col] || "Hvid", producer: "", at: Date.now() };
  try { localStorage.setItem("vinAddPrefill", JSON.stringify(pre)); } catch (e) {}
  location.href = "index.html#add";
}

/* ---------- your bottles ---------- */
const apiUrl = () => (window.WINE_CONFIG && window.WINE_CONFIG.API_URL) || localStorage.getItem("vinApi") || "";
async function vaultData(api, user, token) {
  for (const f of ["gas-fake.js?v=7", "vault-crypto.js?v=3", "vault-engine.js?v=1", "vault.js?v=22"]) await loadScript(f);
  const dek = await window.VCRYPTO.recall(user); if (!dek) throw new Error("token");
  const post = async p => (await fetch(api, { method: "POST", body: JSON.stringify(p), redirect: "follow" })).json();
  await window.VAULT.start({ post, user, token, dek });
  return window.VAULT.call({ action: "data" });
}
// a bottle's vineyard: the region's name somewhere on it, then the longest climat name (or, for one named from IGN's
// place names, one of those) in its wine or commune
function matchWine(w) {
  const R = st.region, all = norm([w.region, w.commune, w.name, w.classification].join(" ")), label = norm([w.name, w.commune].join(" "));
  if (!R.kw.some(k => all.includes(" " + k + " ")) && !R.kw.some(k => norm(w.region).includes(k))) return { region: false };
  // a classified château by its name on the bottle (producer or wine): the longest name wins (Lamothe Guignard over Lamothe)
  const who = norm([w.producer, w.name].join(" "));
  let pt = null;
  for (const q of pts()) { const k = norm(short(q.n)).trim(); if (k.length > 3 && who.includes(" " + k + " ") && (!pt || k.length > pt.k)) pt = { q, k: k.length }; }
  if (pt) return { region: true, c: pt.q };
  let best = null;
  for (const c of st.pack.climats) {
    if (c.unnamed) continue;
    // a climat whose appellation is on the label too beats a namesake elsewhere (Clos du Roy, in Mercurey and Montagny)
    // (a German site: one of its villages on the label, "Wehlen", "Niederhäuser" for Niederhausen; without it the site's
    // name alone isn't enough, there are five Sonnenuhrs)
    const own = all.includes(norm(c.app)) || (c.gm || []).some(g => { const k = norm(g).trim().split(" ")[0]; return k.length > 3 && all.includes(" " + k.slice(0, Math.max(4, k.length - 2))); });
    if (c.c === "EL" && !own) continue;
    for (const a of [c.n].concat(c.inferred ? c.places || [] : [], c.aka || [])) { const k = norm(a).trim(), sc = k.length + (own ? 100 : 0);
      // short names (Aÿ, Oger) only from the commune field, where they stand alone
      if ((k.length > 3 && label.includes(" " + k + " ") || norm(w.commune).trim() === k) && (!best || sc > best.k)) best = { c, k: sc }; }
  }
  return { region: true, c: best && best.c };
}
async function loadCellar() {
  const api = apiUrl(), user = localStorage.getItem("vinUser") || "", token = localStorage.getItem("vinToken") || "";
  if (!api || !token) return;
  CELLAR.msg = "Loading your cellar…"; renderSide();
  try {
    const data = localStorage.getItem("vinVault") === "1" ? await vaultData(api, user, token)
      : await (await fetch(api, { method: "POST", body: JSON.stringify({ user, token, action: "data" }), redirect: "follow" })).json();
    if (!data.ok) throw new Error(data.error || "error");
    CELLAR.wines = data.wines || []; place(); CELLAR.loaded = true;
  } catch (err) { CELLAR.msg = /token|code|cellar/.test(err.message) ? "Your session expired — log in on the Cellar page, then reload." : "Couldn't reach the cellar right now."; }
  paint(); renderSide();
}
function place() {
  CELLAR.by = {}; CELLAR.other = 0; if (!CELLAR.wines || !st.pack) return;
  CELLAR.wines.forEach(r => {
    const qty = Number(r.qty) || 1, drunk = String(r.drunk).trim().toLowerCase() === "x" ? qty : Math.min(qty, Number(r.drunk) || 0), left = qty - drunk;
    if (left <= 0) return;
    const w = { producer: String(r.producer || ""), name: String(r.name || ""), commune: String(r.commune || ""), region: String(r.region || ""), classification: String(r.classification || ""), vintage: r.vintage, left };
    const m = matchWine(w);
    if (m.c) { const b = CELLAR.by[m.c.id] ??= { left: 0, wines: [] }; b.left += left; b.wines.push(w); } else if (m.region) CELLAR.other += left;
  });
}

/* ---------- region, hash, filters ---------- */
/* ---------- the start page: Europe, a dot for every region ---------- */
const allPlaces = () => REGIONS.concat(ELSEWHERE);
function goTo(id) {
  const x = allPlaces().find(r => r.id === id); if (!x) return;
  if (x.href) location.href = x.href.replace("{L}", window.I18N ? I18N.lang : "en"); else location.hash = "#r=" + id;
}
function showHome() {
  st.region = null; st.pack = null; st.sel = null; st.view = null; $("scalebar").hidden = true;
  document.title = "AllWine — " + t("Wine atlas"); $("regionName").textContent = ""; $("fRegion").value = "";
  document.body.classList.add("home");
  // France, Germany and the north of Italy, on a plain grid (longitude shrunk by the cosine of 47°)
  const W = 1000, lo0 = -2.6, lo1 = 13.6, la0 = 43.3, la1 = 51.7, k = W / ((lo1 - lo0) * Math.cos(47 * Math.PI / 180)), H = Math.round((la1 - la0) * k);
  const xy = ([lo, la]) => [((lo - lo0) * Math.cos(47 * Math.PI / 180) * k).toFixed(1), ((la1 - la) * k).toFixed(1)];
  clearTimeout(relayT); mapview.style.transform = ""; vbC = null; // no region's gesture left over
  svg.innerHTML = "";
  // framed on the regions, not the whole sheet: on a phone they'd be specks. Room for the labels, which run east, and
  // for the breadcrumb above; the land and relief go on beyond the frame where the screen is wider than it
  // (a phone draws the labels bigger, see atlas.html, so it needs more room at the sides)
  const phone = matchMedia("(max-width: 760px)").matches, pad = phone ? [100, 70, 175, 50] : [70, 70, 130, 50];
  const P = allPlaces().map(r => xy([r.ll[1], r.ll[0]]).map(Number)), bx = [Math.min(...P.map(p => p[0])) - pad[0], Math.min(...P.map(p => p[1])) - pad[1]];
  svg.setAttribute("viewBox", `${bx[0].toFixed(0)} ${bx[1].toFixed(0)} ${(Math.max(...P.map(p => p[0])) + pad[2] - bx[0]).toFixed(0)} ${(Math.max(...P.map(p => p[1])) + pad[3] - bx[1]).toFixed(0)}`);
  svg.setAttribute("role", "group"); svg.setAttribute("aria-label", t("Map of the wine regions")); // its dots are links: a group, not an image
  const g = el("g", {}, svg), clip = el("clipPath", { id: "landClip" }, el("defs", {}, g));
  for (const [n, ring] of Object.entries(window.EUROPE_LANDS || {})) {
    const d = "M" + ring.map(xy).map(q => q.join(" ")).join("L") + "Z";
    el("path", { class: "land" + (/^(France|Germany|Italy)/.test(n) ? " on" : ""), d }, g); el("path", { d }, clip); }
  // the lie of the land: Natural Earth's shaded relief (public domain), cut to the same frame, over the land only
  const [rx0, ry0] = xy([-6, 53]).map(Number), [rx1, ry1] = xy([16, 41.5]).map(Number); // the image's corners
  el("image", { href: "atlas-relief-eu.webp", x: rx0, y: ry0, width: rx1 - rx0, height: ry1 - ry0, preserveAspectRatio: "none", class: "relief", "clip-path": "url(#landClip)", "aria-hidden": "true" }, g);
  // where each region's vineyards are (atlas-outlines.js, built from the regions' own maps), loaded with the page's first view
  const ols = el("g", { class: "ols", "aria-hidden": "true" }, g);
  const outline = () => { for (const r of allPlaces()) { const rings = (window.ATLAS_OUTLINES || {})[r.id]; if (!rings) continue;
    el("path", { class: "ol" + (r.href ? " out" : ""), "data-id": r.id, "fill-rule": "evenodd", d: rings.map(q => "M" + q.map(xy).map(p => p.join(" ")).join("L") + "Z").join("") }, ols); } };
  if (window.ATLAS_OUTLINES) outline(); else loadScript("atlas-outlines.js?v=1").then(() => { if (!st.pack && ols.isConnected) outline(); }).catch(() => {});
  // a region's outline and its dot light up together
  const hot = (e, on) => { const x = e.target.closest && e.target.closest("[data-id]"); if (x) svg.querySelectorAll(`[data-id="${x.dataset.id}"]`).forEach(n => n.classList.toggle("hot", on)); };
  g.addEventListener("pointerover", e => hot(e, true)); g.addEventListener("pointerout", e => hot(e, false));
  for (const r of allPlaces()) {
    const [x, y] = xy([r.ll[1], r.ll[0]]), a = el("g", { class: "hd" + (r.href ? " out" : ""), "data-id": r.id, tabindex: 0, role: "link", "aria-label": r.name }, g);
    el("circle", { cx: x, cy: y, r: r.id === "burgundy" ? 6.5 : 5 }, a); // small: the outline shows the region
    // labels west of the dot where the Rhine regions crowd, east elsewhere
    // (and under it for Touraine, between Anjou and the Centre-Loire)
    // (on a phone's bigger labels Nahe goes under its dot, clear of the Mosel's)
    const below = r.id === "touraine" || phone && r.id === "nahe", west = !below && ["nahe", "mosel", "ahr", "maconnais", "chalonnaise", "barolo", "anjou"].includes(r.id);
    const lb = el("text", { x: below ? x : +x + (west ? -12 : 12), y: +y + (below ? (phone ? 30 : 22) : phone ? 7 : 4), "text-anchor": below ? "middle" : west ? "end" : "start" }, a); lb.textContent = r.name;
    a.onkeydown = e => { if (e.key === "Enter") goTo(r.id); };
  }
  renderLegend(); renderHomeSide(); document.body.classList.remove("side-open"); renderCrumb();
}
function renderHomeSide() {
  const by = c => allPlaces().filter(r => r.country === c);
  $("side").innerHTML = `<h2>${esc(t("Wine atlas"))}</h2>
    <p class="meta">${esc(t("Every region here is drawn from its official map: INAO's for France, the Weinbergsrolle for Germany. Pick one."))}</p>
    ${Object.entries(COUNTRY).map(([c, n]) => `<h3>${esc(t(n))}</h3><ul class="list">${by(c).map(r => `<li><button data-go="${r.id}">${esc(r.name)}${r.href ? " ↗" : ""}</button><span>${esc(t(r.kind))}</span></li>`).join("")}</ul>`).join("")}
    ${cellarSummaryHome()}
    <p class="src">${esc(t("The outlines are where each region's vineyards are, from its own map. Relief: Natural Earth (public domain)."))}</p>`;
  $("side").querySelectorAll("button[data-go]").forEach(b => b.onclick = () => goTo(b.dataset.go));
}
const cellarSummaryHome = () => CELLAR.loaded ? "" : `<p class="note">${esc(t(CELLAR.msg))}</p>`;

function syncHash() {
  const h = "#r=" + st.region.id + (st.sel ? "&c=" + st.sel : "");
  if (location.hash !== h) history.replaceState(null, "", location.pathname + location.search + h);
}
async function openRegion(id, sel) {
  const R = REGIONS.find(r => r.id === id) || REGIONS[0];
  if (!(window.ATLAS_PACKS && ATLAS_PACKS[R.id])) {
    // a pack that doesn't come (GitHub Pages answers 503 now and then): once more after a moment, then say so
    try { await loadScript(R.file).catch(() => new Promise(r => setTimeout(r, 1500)).then(() => loadScript(R.file))); }
    catch (e) {
      $("side").innerHTML = `<h2>${esc(R.name)}</h2><p class="note">${esc(t("Couldn't load this region's map. Check the connection and try again."))}</p><p><button class="btn" id="retryRegion">${esc(t("Try again"))}</button></p>`;
      $("retryRegion").onclick = () => openRegion(id, sel); return;
    }
  }
  document.body.classList.remove("home"); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", t("Vineyard map"));
  st.region = R; st.pack = ATLAS_PACKS[R.id]; st.sel = null; $("fRegion").value = R.id; $("regionName").textContent = " · " + st.pack.meta.name;
  document.body.classList.remove("side-open"); renderCrumb(); applyStyle(); // aerial photos: France only
  $("t3dBtn").hidden = !st.pack.meta.l93; // IGN's heights: France only
  document.title = "AllWine — " + st.pack.meta.name + " · " + t("Wine atlas");
  // start on the crus (the regional land around them can be far bigger, and long and thin)
  st.home = bbOf(st.pack.climats.flatMap(c => c.g));
  for (const [f, k] of [["fGC", "GC"], ["f1er", "1er"], ["fAOC", "AOC"], ["fEL", "EL"]]) $(f).parentNode.hidden = !st.pack.climats.some(c => c.c === k);
  $("fPts").parentNode.hidden = !pts().length;
  place(); draw(); fit(st.home); renderLegend();
  $("fRelief").parentNode.hidden = !st.pack.meta.l93 && st.pack.meta.proj !== "eq";
  $("fTopo").parentNode.hidden = !R.topo; $("fGeol").parentNode.hidden = !R.geol; if (st.geol) ensureGeol();
  st.cmpWith = null; terrClear(); $("terrbar").hidden = true; $("terrChip").hidden = !R.dem; terrSync();
  $("profBtn").hidden = !st.pack.meta.l93; $("locBtn").hidden = !navigator.geolocation; if (PROF.on) profToggle(false); // the profile needs IGN's elevation service: France only
  if (R.topo && !topoOf()) loadScript(R.topo).then(() => { if (st.region === R) drawTopo(); }).catch(() => {});
  if (R.dem && !demOf(R.id)) loadScript(R.dem).then(() => { if (st.region === R) { renderSide(); paint(); } }).catch(() => {});
  if (sel && byId(sel)) select(sel, true); else { renderSide(); syncHash(); }
}
function renderLegend() {
  const P = st.pack; if (!P) { $("legend").innerHTML = ""; return; }
  if (geolShown()) { const G = geolOf(), tot = {};
    P.climats.filter(c => st.show[c.c] && G.under[c.id]).forEach(c => G.under[c.id].forEach(([k, p]) => tot[k] = (tot[k] || 0) + p * c.ha));
    $("legend").innerHTML = `<b>${esc(t("Geology (BRGM 1:50 000)"))}</b>` + Object.entries(tot).sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([k]) => `<span class="gl"><i style="background:${G.legend[k][2]}"></i><em>${geolLabel(G, k)}</em></span>`).join(""); return; }
  const has = k => P.climats.some(c => c.c === k);
  $("legend").innerHTML = [has("GC") && ["var(--gc)", "Grand cru"], has("1er") && ["var(--pc)", "Premier cru"], has("AOC") && ["var(--ac)", "Cru appellation"], has("EL") && ["var(--pc)", "Einzellage"],
    P.climats.some(c => c.unnamed) && ["var(--pcx)", "Premier cru, unnamed by INAO"],
    P.villages.length && ["var(--vc)", st.region.village || (P.villages.length > 1 ? "Village appellations" : P.villages[0].ap)], P.regional.ha && ["var(--rg)", st.region.regional],
    pts().length && ["var(--ink)", "Classified château (1855)"]].filter(Boolean)
    .map(([c, n]) => `<span><i style="background:${c}"></i>${esc(t(n))}</span>`).join("") + (CELLAR.loaded ? `<span><i style="background:var(--gold);border-radius:50%"></i>${esc(t("Bottles in your cellar"))}</span>` : "");
}
$("fRegion").innerHTML = `<option value="">${esc(t("All regions"))}</option>` + REGIONS.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join("") + `<option value="burgundy">${esc(t("Côte d'Or (Burgundy atlas) ↗"))}</option>`;
$("fRegion").onchange = e => { const v = e.target.value; if (v === "burgundy") { location.href = "burgundy.html"; return; } location.hash = v ? "#r=" + v : ""; };
$("fGC").onchange = e => { st.show.GC = e.target.checked; paint(); };
$("f1er").onchange = e => { st.show["1er"] = e.target.checked; paint(); };
$("fAOC").onchange = e => { st.show.AOC = e.target.checked; paint(); };
$("fEL").onchange = e => { st.show.EL = e.target.checked; paint(); };
$("fPts").onchange = e => { st.show.PT = e.target.checked; paint(); };
$("fMine").onchange = e => { st.mine = e.target.checked; paint(); };
const keep = (k, v) => { try { localStorage.setItem(k, v ? "1" : "0"); } catch (e) {} };
$("fRelief").checked = st.relief; $("fRelief").onchange = e => { st.relief = e.target.checked; keep("atlasRelief", st.relief); shadeUpdate(); };
$("fGeol").checked = st.geol; $("fGeol").onchange = e => { st.geol = e.target.checked; keep("atlasGeol", st.geol); if (st.geol) ensureGeol();
  if (TG.geol) TG.geol.style.display = st.geol ? "" : "none"; paint(); renderLegend(); };
$("fTopo").checked = st.topo; $("fTopo").onchange = e => { st.topo = e.target.checked; keep("atlasTopo", st.topo); topoLod(); };
/* ---------- search: this region's vineyards first, then every other region's and the Côte d'Or's (atlas-index.js,
   fetched when the box is first used), as a list under the box that works by touch and with ↑ ↓ Enter Esc ---------- */
const sBox = $("fSearch"), sList = $("gRes"), INDEX_SRC = "atlas-index.js?v=1";
let sHits = [], sAt = -1;
const placeName = id => (allPlaces().find(r => r.id === id) || {}).name || id;
const loadIndex = () => window.ATLAS_INDEX ? Promise.resolve() : (loadIndex.p ||= loadScript(INDEX_SRC).catch(() => { loadIndex.p = null; }));
// an entry: [name, place, id, class, commune, (an MGA's page), (other names)]
const hitClass = e => PTCLASS[e[3]] ? t(PTCLASS[e[3]]) : e[3] === "V" ? t("Village") : e[3] === "MGA" || e[3] === "MGAV" ? "MGA" : t(CLASS[e[3]] || e[3]);
function sFind(q) {
  const k = norm(q).trim(); if (k.length < 2) return [];
  const here = st.region ? st.region.id : null, out = [];
  // the open region's own, straight from its pack (so it works before the index is in)
  if (st.pack) st.pack.climats.filter(c => !c.unnamed).concat(pts()).forEach(c => out.push([shown(c), here, c.id, c.c === "PT" || !c.g ? c.cls : c.c, c.c === "EL" ? c.n : c.app || "", null, c.aka || []]));
  (window.ATLAS_INDEX || []).forEach(e => { if (e[1] !== here) out.push(e); });
  const score = e => { const names = [e[0], ...(Array.isArray(e[e.length - 1]) ? e[e.length - 1] : [])].map(norm);
    const best = Math.min(...names.map(n => n.startsWith(" " + k) ? 0 : n.includes(" " + k) ? 1 : n.includes(k) ? 2 : 9));
    return best === 9 ? null : best * 10 + (e[1] === here ? 0 : 5) + Math.min(4, e[0].length / 20); };
  return out.map(e => [score(e), e]).filter(([s]) => s != null).sort((a, b) => a[0] - b[0]).slice(0, 8).map(([, e]) => e);
}
function sRender() {
  sHits = sFind(sBox.value); sAt = sHits.length ? 0 : -1;
  if (!sBox.value.trim() || norm(sBox.value).trim().length < 2) { sList.hidden = true; sBox.setAttribute("aria-expanded", "false"); return; }
  sList.innerHTML = sHits.length ? sHits.map((e, i) => `<li role="option" id="gr${i}" data-i="${i}" aria-selected="${i === sAt}"><b>${esc(e[0])}</b><small>${esc([e[1] === (st.region && st.region.id) ? "" : placeName(e[1]), hitClass(e), e[4]].filter(Boolean).join(" · "))}</small></li>`).join("")
    : `<li class="none">${esc(t(window.ATLAS_INDEX ? "No vineyard by that name." : "Searching…"))}</li>`;
  sList.hidden = false; sBox.setAttribute("aria-expanded", "true"); sBox.setAttribute("aria-activedescendant", sAt >= 0 ? "gr" + sAt : "");
}
function sGo(e) {
  sList.hidden = true; sBox.value = ""; sBox.blur(); sBox.setAttribute("aria-expanded", "false");
  if (st.region && e[1] === st.region.id) return select(e[2], true);
  if (e[1] === "burgundy") return void (location.href = "burgundy.html#c=" + encodeURIComponent(e[2]));
  if (REGIONS.some(r => r.id === e[1])) return void (location.hash = "#r=" + e[1] + "&c=" + encodeURIComponent(e[2]));
  location.href = `v/${window.I18N ? I18N.lang : "en"}/${e[5]}.html`; // Barolo, Barbaresco: the MGA's page
}
sBox.addEventListener("focus", () => { loadIndex().then(() => { if (document.activeElement === sBox) sRender(); }); });
sBox.addEventListener("input", sRender);
sBox.addEventListener("keydown", ev => {
  if (ev.key === "ArrowDown" || ev.key === "ArrowUp") { if (!sHits.length) return; ev.preventDefault(); sAt = (sAt + (ev.key === "ArrowDown" ? 1 : sHits.length - 1)) % sHits.length;
    sList.querySelectorAll("li[data-i]").forEach(li => li.setAttribute("aria-selected", +li.dataset.i === sAt)); sBox.setAttribute("aria-activedescendant", "gr" + sAt); }
  else if (ev.key === "Enter" && !sList.hidden && sHits[sAt]) { ev.preventDefault(); sGo(sHits[sAt]); }
  else if (ev.key === "Escape") { sList.hidden = true; sBox.setAttribute("aria-expanded", "false"); }
});
// pointerdown, not click: the box keeps the focus (and a phone its keyboard) until the choice is made
sList.addEventListener("pointerdown", ev => { const li = ev.target.closest("li[data-i]"); if (li) { ev.preventDefault(); sGo(sHits[+li.dataset.i]); } });
sBox.addEventListener("blur", () => setTimeout(() => { sList.hidden = true; sBox.setAttribute("aria-expanded", "false"); }, 150));
// a name typed whole and confirmed (or picked from elsewhere): this region's vineyard of that name
sBox.addEventListener("change", e => { if (!st.pack) return; const q = norm(e.target.value); const all = st.pack.climats.concat(pts()), c = all.find(x => norm(shown(x)) === q) || all.find(x => norm(x.n) === q) || all.find(x => !x.unnamed && norm(shown(x)).includes(q.trim())); if (c) { select(c.id, true); e.target.value = ""; } });
if (window.I18N) { I18N.picker && document.querySelectorAll("[data-langpick]").forEach(I18N.picker); I18N.onChange(() => { renderSide(); renderLegend(); }); }

// #r=chablis&c=les_clos, or &w=<a wine's name> from the cellar's "On the map": its vineyard if the atlas knows it
async function fromHash() {
  const q = new URLSearchParams(location.hash.slice(1)), r = q.get("r");
  if (!r || !REGIONS.some(x => x.id === r)) { if (st.region || !svg.childNodes.length) showHome(); return; } // no region: the start page
  if (!st.region || st.region.id !== r) await openRegion(r, q.get("c"));
  else if ((q.get("c") || null) !== st.sel) select(q.get("c"), true);
  if (q.get("w") && st.region) { const m = matchWine({ region: st.region.kw[0], name: q.get("w") }); if (m.c) select(m.c.id, true); else syncHash(); }
}
/* ---------- the map as an app: where you are as a breadcrumb, the map's look and layers in a panel, and on a phone the
   map is the screen: the regions as chips at the bottom, search behind a button, the controls in a round column, the
   vineyard's details sliding up from the bottom ---------- */
const PHONE = matchMedia("(max-width:760px)");
const REGION_DOT = { fr: "var(--gc)", de: "var(--gold)", it: "var(--ac)" };
function renderCrumb() {
  const c = $("crumb"); if (!c) return;
  if (!st.pack) { c.innerHTML = `<span>${esc(t("Europe"))}</span><span class="n">· ${esc(t("{0} regions", allPlaces().length))}</span>`; }
  else { const n = st.pack.climats.filter(x => !x.unnamed).length;
    c.innerHTML = `<button type="button" data-home>${esc(t("Europe"))}</button><span class="sep">›</span><button type="button" data-info>${esc(st.pack.meta.name)}</button><span class="n">· ${esc(t("{0} vineyards", n))}</span>`; }
  const h = c.querySelector("[data-home]"); if (h) h.onclick = () => { location.hash = ""; };
  const i = c.querySelector("[data-info]"); if (i) i.onclick = () => { if (st.sel) select(null); renderSide(); document.body.classList.add("side-open"); };
  renderChips();
}
function renderChips() {
  const box = $("rchips"); if (!box) return;
  const cur = st.region ? st.region.id : "";
  box.innerHTML = `<button type="button" data-r="" class="${cur ? "" : "on"}"><i style="--c:var(--accent)"></i>${esc(t("All regions"))}</button>`
    + allPlaces().map(r => `<button type="button" data-r="${r.id}" class="${r.id === cur ? "on" : ""}"><i style="--c:${REGION_DOT[r.country] || "var(--accent)"}"></i>${esc(r.name)}${r.href ? " ↗" : ""}</button>`).join("");
  box.querySelectorAll("button").forEach(b => b.onclick = () => { if (!b.dataset.r) location.hash = ""; else goTo(b.dataset.r); });
  const on = box.querySelector(".on"); if (on) on.scrollIntoView({ block: "nearest", inline: "center" });
}
// the map's look, remembered on this device
function applyStyle(v) {
  if (v) { st.style = v; try { localStorage.setItem("atlasStyle", v); } catch (e) {} }
  document.documentElement.dataset.map = st.style === "photo" ? "light" : st.style === "auto" ? "" : st.style;
  if (!document.documentElement.dataset.map) delete document.documentElement.dataset.map;
  const fr = !st.pack || !!st.pack.meta.l93;
  document.querySelectorAll("#styles button").forEach(b => { b.setAttribute("aria-checked", b.dataset.style === st.style); if (b.dataset.style === "photo") b.disabled = !!st.pack && !fr; });
  $("photoNote").hidden = !(st.style === "photo" || (st.pack && !fr));
  shadeUpdate();
}
$("styles").addEventListener("click", e => { const b = e.target.closest("button[data-style]"); if (b && !b.disabled) { applyStyle(b.dataset.style); if (st.pack) renderSide(); } });
// panels: one open at a time; Escape, ✕ or a tap on the map closes them
function openPanel(id) { ["stylePanel", "menuPanel"].forEach(p => $(p).hidden = p !== id); if (id === "stylePanel") applyStyle(); }
function closePanels() { $("stylePanel").hidden = true; $("menuPanel").hidden = true; }
$("styleBtn").onclick = () => $("stylePanel").hidden ? openPanel("stylePanel") : closePanels();
$("menuBtn").onclick = () => $("menuPanel").hidden ? openPanel("menuPanel") : closePanels();
document.querySelectorAll(".panel [data-close]").forEach(b => b.onclick = closePanels);
$("sideX").onclick = () => { document.body.classList.remove("side-open"); if (st.sel) select(null); };
addEventListener("keydown", e => { if (e.key === "Escape") { closePanels(); document.body.classList.remove("side-open"); } });
svg.addEventListener("pointerdown", () => { if (PHONE.matches) closePanels(); });
// a phone: the filters, the terrain bar and the legend move into the Map panel, the search box under its button
const SPOT = { tb: document.querySelector(".wrap > .toolbar"), terr: $("terrbar"), legend: $("legend") };
const HOME = { tb: [SPOT.tb.parentNode, SPOT.tb.nextSibling], terr: [SPOT.terr.parentNode, SPOT.terr.nextSibling], legend: [SPOT.legend.parentNode, SPOT.legend.nextSibling] };
const SBOX = document.querySelector(".toolbar .sbox"), SBOX_HOME = [SBOX.parentNode, SBOX.nextSibling];
function placeForScreen() {
  if (PHONE.matches) { $("pFilters").append(SPOT.tb, SPOT.terr, SPOT.legend); $("srch").append(SBOX); }
  else { for (const k of ["tb", "terr", "legend"]) HOME[k][0].insertBefore(SPOT[k], HOME[k][1]); SBOX_HOME[0].insertBefore(SBOX, SBOX_HOME[1]); $("srch").hidden = true; }
}
PHONE.addEventListener("change", placeForScreen); placeForScreen();
$("srchBtn").onclick = () => { const s = $("srch"); s.hidden = !s.hidden; if (!s.hidden) $("fSearch").focus(); };
$("fSearch").addEventListener("keydown", e => { if (e.key === "Enter" && PHONE.matches) setTimeout(() => { $("srch").hidden = true; }, 50); });
$("gRes").addEventListener("pointerdown", () => { if (PHONE.matches) setTimeout(() => { $("srch").hidden = true; }, 50); }); // a result is chosen on pointerdown
// the open sheet's height, for the controls to sit above it
const sheetH = () => document.body.style.setProperty("--sheet", (document.body.classList.contains("side-open") && PHONE.matches ? $("sideWrap").offsetHeight : 0) + "px");
new ResizeObserver(sheetH).observe($("sideWrap")); new MutationObserver(sheetH).observe(document.body, { attributes: true, attributeFilter: ["class"] });
if (window.I18N) I18N.onChange(() => renderCrumb());
applyStyle(); renderCrumb();
/* ---------- the view in 3D (terrain3d.js): the pack's Lambert-93 metres back to longitude and latitude, as a plane
   fitted round the middle of the view (Lambert-93 is near enough flat over a view) ---------- */
function viewToLL() {
  const M = st.pack.meta, O = M.origin, toP = (lon, lat) => { const [E, N] = L93(lon, lat); return [E - M.l93[0], M.l93[1] - N]; };
  const fit = (lo, la) => { const a = toP(lo, la), b = toP(lo + .01, la), c = toP(lo, la + .01);
    const m11 = (b[0] - a[0]) / .01, m21 = (b[1] - a[1]) / .01, m12 = (c[0] - a[0]) / .01, m22 = (c[1] - a[1]) / .01, det = m11 * m22 - m12 * m21;
    return (x, y) => { const dx = x - a[0], dy = y - a[1]; return [lo + (m22 * dx - m12 * dy) / det, la + (-m21 * dx + m11 * dy) / det]; }; };
  const [x, y, w, h] = st.view, mid = fit(O[0], O[1])(x + w / 2, y + h / 2);
  return fit(mid[0], mid[1]);
}
// terrain3d.js is loaded only when it's asked for: most visits never tilt the map
$("t3dBtn").onclick = async () => { if (!st.pack || !st.view) return; closePanels();
  if (!window.TERRAIN3D) { try { await loadScript("terrain3d.js?v=1"); } catch (e) { return; } }
  TERRAIN3D.open({ svg, view: st.view.slice(), toLL: viewToLL(), labels: '.lb.GC, .lb.AOC, .lb[class~="1er"]', title: st.pack.meta.name + " · 3D" }); };
// a link or Back that only changes the hash doesn't reload the page
addEventListener("hashchange", () => { fromHash().then(() => { if (st.pack) { place(); paint(); renderSide(); } }); });
fromHash().then(loadCellar);
