// Static vineyard pages for search engines: one page per named vineyard on the atlases (the Côte d'Or's climats
// and INAO's other premiers crus, plus the region packs), in English, French, German and Danish. Each page has
// the vineyard's outline drawn from INAO's map with its neighbours, its facts, a link into the interactive map,
// hreflang and canonical links, and schema.org data. Also writes v/<lang>/index.html, sitemap.xml and robots.txt.
// The pages have no scripts: they're just text a search engine (or a person) can read.
//   node tools/pages-build.js            write the pages
//   node tools/pages-build.js --check    exit 1 if the pages on disk aren't what the data gives (the test runs this)
"use strict";
const fs = require("fs"), path = require("path");
const R = path.join(__dirname, ".."), OUT = "v", SITE = "https://allwine.dk/";
const LANGS = ["en", "fr", "de", "da"];

global.window = {};
for (const f of ["burgundy-data.js", "burgundy-data-beaune.js", "burgundy-detail.js", "burgundy-geo.js", "burgundy-dem.js",
  "burgundy-extras.js", "burgundy-i18n-fr.js", "burgundy-i18n-de.js", "burgundy-i18n-da.js"]) require(path.join(R, f));
const PACKS = ["chablis", "chalonnaise", "maconnais", "champagne", "alsace", "rhone"];
for (const id of PACKS) require(path.join(R, `atlas-${id}.js`));

// ── words ────────────────────────────────────────────────────────────────────────────────────────
const T = {
  en: { GC: "Grand cru", "1er": "Premier cru", V: "Village climat", R: "Red", W: "White", RW: "Red & white", S: "Sparkling",
    GCp: "grands crus", "1erp": "premiers crus", Vp: "village climats", oneOf: "One of the {0} {1} of {2} on INAO's map, which together cover {3} ha.",
    app: "Appellation", commune: "Commune", area: "Area", colour: "Colour", alt: "Altitude", slope: "Slope", faces: "Faces",
    soil: "Soil", owners: "Owners", open: "Open on the interactive map", track: "Keep track of your own bottles in AllWine",
    nearby: "Nearby vineyards", all: "All vineyards", home: "AllWine", vineyards: "Vineyards", leased: "leased", map: "Outline of {0} on INAO's map, with its neighbours",
    inferred: "INAO's map leaves this parcel unnamed; the name is taken from the place names within it and around it.",
    desc: "{0}: {2}, {3} ha ({4}). Its exact outline {5}{6}.",
    descMore: ", altitude, slope and owners", descPack: ", its neighbours and the other crus of {0}",
    hubTitle: "Vineyard atlas: every grand cru and premier cru", hubDesc: "Every grand cru and premier cru of Burgundy (the Côte d'Or, Chablis, the Côte Chalonnaise, the Mâconnais), the grands crus of Alsace, Champagne's cru villages and the Northern Rhône's crus, drawn from INAO's and IGN's maps, with altitude, slope and owners.",
    hubLead: "Every named vineyard on AllWine's atlases, drawn from INAO's delimitation. Open any of them on the interactive map, or match your own bottles to them.",
    source: "Outlines: INAO, Délimitation parcellaire des AOC viticoles (Licence Ouverte). Altitude and slope: IGN RGE ALTI®. Owners: published sources, rounded.",
    sourcePack: "Outlines: INAO, Délimitation parcellaire des AOC viticoles, via IGN's Géoplateforme (Licence Ouverte).",
    burgundy: "Burgundy", france: "France", cote: "Côte d'Or", privacy: "Privacy", lang: "Language",
        GCv: "grand cru villages", "1erv": "premier cru villages",
    oneOfVines: "One of the {0} {1} of {2}, whose vines together cover {3} ha.",
    AOC: "Cru appellation", AOCp: "cru appellations", onInao: "on INAO's map", onIgn: "from IGN's map of the vines inside the village", mapVines: "The vines of {0} (IGN), with its neighbours",
    sourceVines: "Vines: IGN BD TOPO (vegetation « Vigne »); village boundaries: IGN ADMIN EXPRESS (Licence Ouverte). The cru villages: the échelle des crus.",
    dirs: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] },
  fr: { GC: "Grand cru", "1er": "Premier cru", V: "Climat village", R: "Rouge", W: "Blanc", RW: "Rouge et blanc", S: "Effervescent",
    GCp: "grands crus", "1erp": "premiers crus", Vp: "climats village", oneOf: "L'un des {0} {1} de {2} sur la carte de l'INAO, qui couvrent ensemble {3} ha.",
    app: "Appellation", commune: "Commune", area: "Surface", colour: "Couleur", alt: "Altitude", slope: "Pente", faces: "Exposition",
    soil: "Sol", owners: "Propriétaires", open: "Voir sur la carte interactive", track: "Suivez vos propres bouteilles dans AllWine",
    nearby: "Climats voisins", all: "Tous les climats", home: "AllWine", vineyards: "Climats", leased: "en fermage", map: "Contour de {0} sur la carte de l'INAO, avec ses voisins",
    inferred: "La carte de l'INAO ne nomme pas cette parcelle ; le nom vient des lieux-dits qu'elle contient et qui l'entourent.",
    desc: "{0} : {2}, {3} ha ({4}). Son contour exact {5}{6}.",
    descMore: ", altitude, pente et propriétaires", descPack: ", ses voisins et les autres crus de {0}",
    hubTitle: "Atlas des climats : tous les grands crus et premiers crus", hubDesc: "Tous les grands crus et premiers crus de Bourgogne (Côte-d'Or, Chablis, Côte chalonnaise, Mâconnais), les grands crus d'Alsace, les villages crus de Champagne et les crus du Rhône septentrional, d'après les cartes de l'INAO et de l'IGN, avec altitude, pente et propriétaires.",
    hubLead: "Tous les climats nommés des atlas d'AllWine, d'après la délimitation de l'INAO. Ouvrez-les sur la carte interactive ou rattachez-y vos propres bouteilles.",
    source: "Contours : INAO, Délimitation parcellaire des AOC viticoles (Licence Ouverte). Altitude et pente : IGN RGE ALTI®. Propriétaires : sources publiées, arrondies.",
    sourcePack: "Contours : INAO, Délimitation parcellaire des AOC viticoles, via la Géoplateforme de l'IGN (Licence Ouverte).",
    burgundy: "Bourgogne", france: "France", cote: "Côte-d'Or", privacy: "Confidentialité", lang: "Langue",
        GCv: "villages grand cru", "1erv": "villages premier cru",
    oneOfVines: "L'un des {0} {1} de {2}, dont les vignes couvrent ensemble {3} ha.",
    AOC: "Appellation cru", AOCp: "appellations crus", onInao: "sur la carte de l'INAO", onIgn: "d'après la carte des vignes de l'IGN", mapVines: "Les vignes de {0} (IGN), avec ses voisins",
    sourceVines: "Vignes : IGN BD TOPO (végétation « Vigne ») ; limites des villages : IGN ADMIN EXPRESS (Licence Ouverte). Les villages crus : l'échelle des crus.",
    dirs: ["N", "NE", "E", "SE", "S", "SO", "O", "NO"] },
  de: { GC: "Grand Cru", "1er": "Premier Cru", V: "Village-Lage", R: "Rot", W: "Weiß", RW: "Rot & weiß", S: "Schaumwein",
    GCp: "Grands Crus", "1erp": "Premiers Crus", Vp: "Village-Lagen", oneOf: "Teil der {0} {1} in {2} auf der INAO-Karte, die zusammen {3} ha umfassen.",
    app: "Appellation", commune: "Gemeinde", area: "Fläche", colour: "Farbe", alt: "Höhe", slope: "Hangneigung", faces: "Ausrichtung",
    soil: "Boden", owners: "Besitzer", open: "Auf der interaktiven Karte öffnen", track: "Verwalten Sie Ihre eigenen Flaschen in AllWine",
    nearby: "Benachbarte Lagen", all: "Alle Lagen", home: "AllWine", vineyards: "Lagen", leased: "gepachtet", map: "Umriss von {0} auf der INAO-Karte, mit den Nachbarlagen",
    inferred: "Die INAO-Karte nennt diese Parzelle nicht; der Name stammt von den Flurnamen in ihr und um sie herum.",
    desc: "{0}: {2}, {3} ha ({4}). Der genaue Umriss {5}{6}.",
    descMore: ", Höhe, Hangneigung und Besitzer", descPack: ", seine Nachbarn und die anderen Crus von {0}",
    hubTitle: "Lagenatlas: alle Grands Crus und Premiers Crus", hubDesc: "Alle Grands Crus und Premiers Crus Burgunds (Côte d'Or, Chablis, Côte Chalonnaise, Mâconnais), die Grands Crus des Elsass, die Cru-Dörfer der Champagne und die Crus der nördlichen Rhône, nach den Karten von INAO und IGN, mit Höhe, Hangneigung und Besitzern.",
    hubLead: "Alle benannten Lagen der AllWine-Atlanten, nach der Abgrenzung des INAO. Öffnen Sie jede auf der interaktiven Karte oder ordnen Sie ihr Ihre eigenen Flaschen zu.",
    source: "Umrisse: INAO, Délimitation parcellaire des AOC viticoles (Licence Ouverte). Höhe und Neigung: IGN RGE ALTI®. Besitzer: veröffentlichte Quellen, gerundet.",
    sourcePack: "Umrisse: INAO, Délimitation parcellaire des AOC viticoles, über die Géoplateforme des IGN (Licence Ouverte).",
    burgundy: "Burgund", france: "Frankreich", cote: "Côte d'Or", privacy: "Datenschutz", lang: "Sprache",
        GCv: "Grand-Cru-Dörfer", "1erv": "Premier-Cru-Dörfer",
    oneOfVines: "Eines der {0} {1} in {2}, deren Reben zusammen {3} ha umfassen.",
    AOC: "Cru-Appellation", AOCp: "Cru-Appellationen", onInao: "auf der INAO-Karte", onIgn: "nach der IGN-Karte der Reben im Dorf", mapVines: "Die Reben von {0} (IGN), mit den Nachbarn",
    sourceVines: "Reben: IGN BD TOPO (Vegetation « Vigne »); Gemeindegrenzen: IGN ADMIN EXPRESS (Licence Ouverte). Die Cru-Dörfer: die Échelle des crus.",
    dirs: ["N", "NO", "O", "SO", "S", "SW", "W", "NW"] },
  da: { GC: "Grand cru", "1er": "Premier cru", V: "Village-climat", R: "Rød", W: "Hvid", RW: "Rød & hvid", S: "Mousserende",
    GCp: "grands crus", "1erp": "premiers crus", Vp: "village-climats", oneOf: "En af de {0} {1} i {2} på INAO's kort, som tilsammen dækker {3} ha.",
    app: "Appellation", commune: "Kommune", area: "Areal", colour: "Farve", alt: "Højde", slope: "Hældning", faces: "Vender mod",
    soil: "Jord", owners: "Ejere", open: "Åbn på det interaktive kort", track: "Hold styr på dine egne flasker i AllWine",
    nearby: "Nabomarker", all: "Alle vinmarker", home: "AllWine", vineyards: "Vinmarker", leased: "forpagtet", map: "Omridset af {0} på INAO's kort, med naboerne",
    inferred: "INAO's kort giver ikke parcellen et navn; navnet kommer fra stednavnene i og omkring den.",
    desc: "{0}: {2}, {3} ha ({4}). Det præcise omrids {5}{6}.",
    descMore: ", højde, hældning og ejere", descPack: ", naboerne og de andre crus i {0}",
    hubTitle: "Vinmarksatlas: alle grands crus og premiers crus", hubDesc: "Alle grands crus og premiers crus i Bourgogne (Côte d'Or, Chablis, Côte Chalonnaise, Mâconnais), Alsaces grands crus, Champagnes cru-landsbyer og den nordlige Rhônes crus, tegnet efter INAO's og IGN's kort, med højde, hældning og ejere.",
    hubLead: "Alle navngivne vinmarker på AllWines atlas, tegnet efter INAO's afgrænsning. Åbn dem på det interaktive kort, eller knyt dine egne flasker til dem.",
    source: "Omrids: INAO, Délimitation parcellaire des AOC viticoles (Licence Ouverte). Højde og hældning: IGN RGE ALTI®. Ejere: offentliggjorte kilder, afrundet.",
    sourcePack: "Omrids: INAO, Délimitation parcellaire des AOC viticoles, via IGN's Géoplateforme (Licence Ouverte).",
    burgundy: "Bourgogne", france: "Frankrig", cote: "Côte d'Or", privacy: "Privatliv", lang: "Sprog",
        GCv: "grand cru-landsbyer", "1erv": "premier cru-landsbyer",
    oneOfVines: "En af de {0} {1} i {2}, hvis vinstokke tilsammen dækker {3} ha.",
    AOC: "Cru-appellation", AOCp: "cru-appellationer", onInao: "på INAO's kort", onIgn: "efter IGN's kort over vinstokkene i landsbyen", mapVines: "Vinstokkene i {0} (IGN), med naboerne",
    sourceVines: "Vinstokke: IGN BD TOPO (vegetation « Vigne »); landsbygrænser: IGN ADMIN EXPRESS (Licence Ouverte). Cru-landsbyerne: échelle des crus.",
    dirs: ["N", "NØ", "Ø", "SØ", "S", "SV", "V", "NV"] },
};
const NAMES = { en: "English", fr: "Français", de: "Deutsch", da: "Dansk" };
const fmt = (s, ...a) => s.replace(/\{(\d)\}/g, (m, i) => a[i] ?? "");
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ha = (v, l) => (v >= 10 ? v.toFixed(1) : v.toFixed(2)).replace(".", l === "en" ? "." : ",");
const slug = s => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/œ/g, "oe").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ── coordinates → WGS84 ──────────────────────────────────────────────────────────────────────────
const D2R = Math.PI / 180, RE = 6371000;
const burgLL = ([x, y]) => [4.85 + x / (D2R * RE * Math.cos(47.1 * D2R)), 47.1 + y / (D2R * RE)]; // burgundy-geo.js metres, y north
const L93 = (() => { // Lambert-93 → WGS84 (GRS80, LCC 2SP), as in inao-import.js
  const a = 6378137, e = 0.0818191910428158;
  const t = p => Math.tan(Math.PI / 4 - p / 2) / Math.pow((1 - e * Math.sin(p)) / (1 + e * Math.sin(p)), e / 2);
  const m = p => Math.cos(p) / Math.sqrt(1 - e * e * Math.sin(p) ** 2);
  const p1 = 44 * D2R, p2 = 49 * D2R, p0 = 46.5 * D2R, l0 = 3 * D2R;
  const n = (Math.log(m(p1)) - Math.log(m(p2))) / (Math.log(t(p1)) - Math.log(t(p2)));
  const F = m(p1) / (n * Math.pow(t(p1), n)), r0 = a * F * Math.pow(t(p0), n);
  return ([x, y]) => {
    const dx = x - 700000, dy = r0 - (y - 6600000), r = Math.sign(n) * Math.hypot(dx, dy);
    const tt = Math.pow(r / (a * F), 1 / n), lon = Math.atan2(dx, dy) / n + l0;
    let lat = Math.PI / 2 - 2 * Math.atan(tt);
    for (let i = 0; i < 8; i++) lat = Math.PI / 2 - 2 * Math.atan(tt * Math.pow((1 - e * Math.sin(lat)) / (1 + e * Math.sin(lat)), e / 2));
    return [lon / D2R, lat / D2R];
  };
})();

// ── geometry (all shapes held as multipolygons in metres, y north) ──────────────────────────────
function bbox(mp) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const poly of mp) for (const ring of poly) for (const [x, y] of ring) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
}
function centroid(mp) { // area-weighted, over the outer rings
  let A = 0, cx = 0, cy = 0;
  for (const poly of mp) { const r = poly[0]; for (let i = 0; i < r.length; i++) { const [a, b] = r[i], [c, d] = r[(i + 1) % r.length], f = a * d - c * b; A += f; cx += (a + c) * f; cy += (b + d) * f; } }
  if (!A) { const b = bbox(mp); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; }
  return [cx / (3 * A), cy / (3 * A)];
}
function dp(pts, tol) { // Douglas–Peucker on an open line
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [i, j] = st.pop(), [ax, ay] = pts[i], [bx, by] = pts[j], L = Math.hypot(bx - ax, by - ay) || 1;
    let best = -1, bd = tol;
    for (let k = i + 1; k < j; k++) { const d = Math.abs((bx - ax) * (ay - pts[k][1]) - (ax - pts[k][0]) * (by - ay)) / L; if (d > bd) { bd = d; best = k; } }
    if (best > 0) { keep[best] = 1; st.push([i, best], [best, j]); }
  }
  return pts.filter((p, k) => keep[k]);
}
function simplifyRing(r, tol) { // a closed ring: split at the point farthest from the first, so it can't collapse
  if (r.length < 5) return r;
  let far = 1, fd = -1; for (let k = 1; k < r.length; k++) { const d = Math.hypot(r[k][0] - r[0][0], r[k][1] - r[0][1]); if (d > fd) { fd = d; far = k; } }
  const out = [...dp(r.slice(0, far + 1), tol).slice(0, -1), ...dp([...r.slice(far), r[0]], tol).slice(0, -1)];
  return out.length >= 3 ? out : r;
}
function pathD(mp, tol, ox, oy) { // SVG path in a frame with y down, origin (ox, oy) at the top left
  let s = "";
  for (const poly of mp) for (const ring of poly) {
    const pts = simplifyRing(ring, tol).map(([x, y]) => [Math.round(x - ox), Math.round(oy - y)]);
    const dd = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
    if (dd.length < 3) continue;
    s += "M" + dd[0].join(" ") + "l" + dd.slice(1).map((p, i) => (p[0] - dd[i][0]) + " " + (p[1] - dd[i][1])).join(" ").replace(/ -/g, "-") + "z";
  }
  return s;
}

// ── the vineyards ────────────────────────────────────────────────────────────────────────────────
const B = window.BURG, G = window.BURG_GEO, DEM = window.BURG_DEM.c, X = window.BURG_EXTRAS, I = window.BURG_I18N;
const VIL = Object.fromEntries(B.villages.map(v => [v.id, v]));
const PROD = { ...X.producers, ...B.producers };
const ALL = [];
const CL = Object.fromEntries(B.climats.map(c => [c.id, c]));
const burgApp = c => { // the name on the label: appellation(c) in burgundy.js
  const vn = c.v === "flagey" || c.geo === "flagey" ? "Vosne-Romanée" : c.v === "premeaux" ? "Nuits-Saint-Georges" : c.v === "cdnv" ? "Côte de Nuits-Villages" : VIL[c.v].n;
  if (c.ap) return c.c === "1er" ? `${c.ap} 1er Cru « ${c.n} »` : `${c.ap} « ${c.n} »`;
  if (c.c === "GC") return c.in && CL[c.in] ? `${CL[c.in].n} (grand cru)` : `${c.n} Grand Cru`;
  if (c.c === "1er") return `${vn} 1er Cru « ${c.n} »`;
  return `${vn} « ${c.n} »`;
};
for (const c of B.climats) {
  const mp = G.climats[c.id] || (c.in && G.climats[c.in]); if (!mp) continue;
  ALL.push({ set: "burgundy", id: c.id, n: c.n, c: c.c, col: c.col, ha: c.ha, app: burgApp(c), commune: VIL[c.v].n, group: c.v,
    mp, own: !!G.climats[c.id], dem: DEM[c.id], soil: c.detail && c.detail.soil, owners: c.p || [],
    note: { en: c.d, fr: I.fr.climats[c.id], de: I.de.climats[c.id], da: I.da.climats[c.id] },
    soilT: { fr: I.fr.detail?.[c.id]?.soil, de: I.de.detail?.[c.id]?.soil, da: I.da.detail?.[c.id]?.soil },
    map: `burgundy.html?lang={L}#c=${c.id}` });
}
for (const [id, x] of Object.entries(G.extra)) {
  if (!VIL[x.v] || CL[id]) continue;
  const c = { id, n: x.n, v: x.v, c: x.c, ap: x.ap, in: x.in };
  ALL.push({ set: "burgundy", id, n: x.n, c: x.c, col: "", ha: x.ha, app: burgApp(c), commune: x.ap && x.c === "1er" ? x.ap : VIL[x.v].n, group: x.v,
    mp: x.mp, own: true, dem: DEM[id], owners: (X.holdings[id] || []).map(([k, h, kind]) => [k, h, kind || ""]),
    note: { en: X.notes[id] }, soilT: {}, map: `burgundy.html?lang={L}#c=${id}` });
}
for (const pid of PACKS) {
  const P = window.ATLAS_PACKS[pid], [E0, N0] = P.meta.l93;
  for (const c of P.climats) {
    if (c.unnamed || /small plots/.test(c.n)) continue;
    // Alsace's grands crus span communes, a Rhône cru is its own appellation and a Champagne cru is the village itself
    const commune = c.c === "AOC" || c.app === c.n || pid === "alsace" ? "" : c.app;
    ALL.push({ set: pid, id: c.id, n: c.n, c: c.c, col: c.col, ha: c.ha, app: c.ap, commune, group: c.area || commune, vines: !!c.area,
      mp: c.g.map(poly => poly.map(r => r.map(([x, y]) => [x, -y]))), own: true, inferred: !!c.inferred, note: c.d || {}, soilT: {}, owners: [],
      ll: p => L93([E0 + p[0], N0 + p[1]]), map: `atlas.html?lang={L}#r=${pid}&c=${encodeURIComponent(c.id)}` });
  }
}
// each pack's name, and the wine region it belongs to, in each language
const NAME = { alsace: { en: "Alsace", fr: "Alsace", de: "Elsass", da: "Alsace" }, rhone: { en: "Northern Rhône", fr: "Rhône septentrional", de: "Nördliche Rhône", da: "Nordlige Rhône" } };
const AREA = { burgundy: { en: "Burgundy", fr: "Bourgogne", de: "Burgund", da: "Bourgogne" }, champagne: { en: "Champagne", fr: "Champagne", de: "Champagne", da: "Champagne" },
  alsace: NAME.alsace, rhone: { en: "Rhône Valley", fr: "Vallée du Rhône", de: "Rhônetal", da: "Rhônedalen" } };
const AREA_OF = { burgundy: "burgundy", chablis: "burgundy", chalonnaise: "burgundy", maconnais: "burgundy", champagne: "champagne", alsace: "alsace", rhone: "rhone" };
const regionName = (set, L) => set === "burgundy" ? T[L].cote : (NAME[set] || {})[L] || window.ATLAS_PACKS[set].meta.name;
const areaName = (set, L) => AREA[AREA_OF[set]][L];
const groupName = (v, L) => v.set === "burgundy" ? VIL[v.group].n : v.group || regionName(v.set, L);
for (const v of ALL) {
  v.bb = bbox(v.mp); v.cen = centroid(v.mp);
  [v.lon, v.lat] = (v.ll || burgLL)(v.cen);
}
// slugs: the vineyard's name; the commune in front where two share a name; the id where even that's not enough
{
  const base = v => slug(v.n), cnt = {};
  ALL.forEach(v => cnt[base(v)] = (cnt[base(v)] || 0) + 1);
  const two = v => cnt[base(v)] > 1 ? slug(v.commune.split(" · ")[0]) + "-" + base(v) : base(v), cnt2 = {};
  ALL.forEach(v => cnt2[two(v)] = (cnt2[two(v)] || 0) + 1);
  const CLS = { GC: "grand-cru", "1er": "premier-cru", V: "village" }, three = v => two(v) + "-" + CLS[v.c], cnt3 = {};
  ALL.forEach(v => cnt3[three(v)] = (cnt3[three(v)] || 0) + 1);
  ALL.forEach(v => v.slug = cnt2[two(v)] === 1 ? two(v) : cnt3[three(v)] === 1 ? three(v) : two(v) + "-" + slug(v.id));
}
const RANK = { GC: 0, "1er": 1, V: 2 };
const order = (a, b) => (RANK[a.c] - RANK[b.c]) || a.n.localeCompare(b.n, "fr");

// ── page parts ───────────────────────────────────────────────────────────────────────────────────
const CSS = `:root{--bg:#F7F4F1;--card:#FFF;--ink:#2A2126;--muted:#756A70;--line:#E7DFDD;--accent:#7C2D3E;--accent-ink:#FFF;--gc:#8E2C45;--gc-ink:#FFF;--pc:#D88E7C;--pc-ink:#3A1A21;--nb:#E9DFD6;--mapbg:#F4F1EA}
@media (prefers-color-scheme:dark){:root{--bg:#171114;--card:#221A1F;--ink:#EFE7E8;--muted:#A5949C;--line:#382C32;--accent:#C86A7C;--accent-ink:#1D1216;--gc:#B6475F;--gc-ink:#FFF4F6;--pc:#8A4E44;--pc-ink:#FBE9E4;--nb:#3A2F2B;--mapbg:#1E181B}}
*{box-sizing:border-box}html,body{margin:0}body{background:var(--bg);color:var(--ink);font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.wrap{max-width:860px;margin:0 auto;padding:18px 16px 60px}a{color:var(--accent)}
header{display:flex;justify-content:space-between;align-items:baseline;gap:8px 16px;flex-wrap:wrap;border-bottom:2px solid var(--ink);padding-bottom:8px}
.logo{font:600 26px "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;color:inherit;text-decoration:none}.logo em{color:var(--accent)}
nav.lang{display:flex;gap:10px;font-size:14px}nav.lang a[aria-current]{color:var(--ink);font-weight:700;text-decoration:none}
.crumbs{font-size:13.5px;color:var(--muted);margin:12px 0 0}.crumbs a{color:var(--muted)}
h1{font:600 clamp(30px,5vw,42px)/1.15 "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;margin:8px 0 2px}
.app{font-style:italic;color:var(--muted);margin:0 0 8px}
.pill{display:inline-block;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:3px 9px;border-radius:999px;background:var(--line);margin-right:4px}
.pill.GC{background:var(--gc);color:var(--gc-ink)}.pill.p1{background:var(--pc);color:var(--pc-ink)}
svg.map{width:100%;height:auto;max-height:440px;background:var(--mapbg);border:1px solid var(--line);border-radius:10px;margin:14px 0;display:block}
svg.map path{stroke:var(--bg);stroke-width:1.2;vector-effect:non-scaling-stroke}svg.map .nb{fill:var(--nb)}svg.map a:hover .nb{fill:var(--pc)}svg.map .me{fill:var(--gc);stroke:var(--ink);stroke-width:2}
dl.facts{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px 16px;margin:14px 0}
dl.facts div{border-top:1px solid var(--line);padding-top:4px}dt{font-size:12.5px;color:var(--muted)}dd{margin:0;font:19px "Iowan Old Style",Georgia,serif}
table{border-collapse:collapse;width:100%;font-size:15px}td{padding:5px 0;border-top:1px solid var(--line)}td.n{text-align:right;white-space:nowrap}
h3{font-size:16px;margin:16px 0 4px}
h2{font-size:13px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin:26px 0 8px}
.cta{display:flex;flex-wrap:wrap;gap:10px;margin:22px 0}.btn{display:inline-block;padding:10px 16px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--ink);text-decoration:none;font-weight:600}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink)}
ul.links{list-style:none;padding:0;margin:0;columns:2 220px;column-gap:24px}ul.links li{padding:3px 0;break-inside:avoid}ul.links small{color:var(--muted)}
.src{font-size:12.5px;color:var(--muted);margin-top:30px;border-top:1px solid var(--line);padding-top:10px}`;
const url = (L, file) => `${SITE}${OUT}/${L}/${file}`;
function head(L, file, title, desc, ld) {
  return `<!doctype html>
<html lang="${L}">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self'; img-src data:; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url(L, file)}">
${LANGS.map(l => `<link rel="alternate" hreflang="${l}" href="${url(l, file)}">`).join("\n")}
<link rel="alternate" hreflang="x-default" href="${url("en", file)}">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${url(L, file)}">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🍷</text></svg>">
<link rel="stylesheet" href="../page.css">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>
</head>
<body><div class="wrap">
<header><a class="logo" href="../../">All<em>Wine</em></a><nav class="lang" aria-label="${T[L].lang}">${LANGS.map(l => `<a href="../${l}/${file}" hreflang="${l}" lang="${l}"${l === L ? ' aria-current="page"' : ""}>${NAMES[l]}</a>`).join("")}</nav></header>
`;
}
const foot = (L, src) => `<p class="src">${esc(src)} · <a href="../../privacy.html">${T[L].privacy}</a></p>
</div></body>
</html>
`;
const dir8 = (deg, L) => T[L].dirs[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
const pillCls = c => c === "GC" ? "GC" : c === "1er" ? "p1" : "";

function mapSvg(v, L) {
  const [x0, y0, x1, y1] = v.bb, span = Math.max(x1 - x0, y1 - y0), pad = Math.max(span * .45, 160);
  let w = x1 - x0 + 2 * pad, h = y1 - y0 + 2 * pad;
  if (w < h * 1.25) w = h * 1.25; if (h < w * .5) h = w * .5; // never a sliver: between 2:1 and 5:4
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, ox = cx - w / 2, oy = cy + h / 2;
  const view = [ox, cy - h / 2, ox + w, oy], tol = Math.max(w, h) / 500;
  const nb = SET[v.set].filter(o => o !== v && o.own && o.bb[0] < view[2] && o.bb[2] > view[0] && o.bb[1] < view[3] && o.bb[3] > view[1]);
  const parts = nb.map(o => `<a href="${o.slug}.html"><path class="nb" d="${pathD(o.mp, tol * 3, ox, oy)}"><title>${esc(o.n)}</title></path></a>`);
  return `<svg class="map" viewBox="0 0 ${Math.round(w)} ${Math.round(h)}" role="img" aria-label="${esc(fmt(v.vines ? T[L].mapVines : T[L].map, v.n))}" xmlns="http://www.w3.org/2000/svg">${parts.join("")}<path class="me" d="${pathD(v.mp, tol, ox, oy)}"><title>${esc(v.n)}</title></path></svg>`;
}
const SET = {}; ALL.forEach(v => (SET[v.set] ??= []).push(v));
const nearest = v => SET[v.set].filter(o => o !== v).map(o => [Math.hypot(o.cen[0] - v.cen[0], o.cen[1] - v.cen[1]), o]).sort((a, b) => a[0] - b[0]).slice(0, 8).map(a => a[1]);

function page(v, L) {
  const t = T[L], cls = t[v.c] || t.V, file = v.slug + ".html", reg = regionName(v.set, L), area = areaName(v.set, L);
  const where = [v.commune, v.set === "burgundy" ? reg : area].filter((x, i, a) => x && a.indexOf(x) === i).join(", ");
  const desc = fmt(t.desc, v.app === v.n ? v.n : `${v.n} — ${v.app}`, "", cls, ha(v.ha, L), where, v.vines ? t.onIgn : t.onInao, v.set === "burgundy" ? t.descMore : fmt(t.descPack, reg));
  const title = `${v.n} · ${v.c === "V" ? v.commune : cls} · ${reg} | AllWine`;
  const crumbs = [[t.home, "../../"], [t.vineyards, "index.html"], [reg, `index.html#${v.set}`], [v.n]];
  const ld = { "@context": "https://schema.org", "@graph": [
    { "@type": "Place", "@id": url(L, file) + "#place", name: v.n, alternateName: v.app, description: desc, url: url(L, file),
      geo: { "@type": "GeoCoordinates", latitude: +v.lat.toFixed(5), longitude: +v.lon.toFixed(5) },
      containedInPlace: (in_ => v.commune ? { "@type": "Place", name: v.commune.split(" · ")[0], containedInPlace: in_ } : in_)({ "@type": "AdministrativeArea", name: area, containedInPlace: { "@type": "Country", name: t.france } }),
      additionalProperty: [{ "@type": "PropertyValue", name: t.area, value: v.ha, unitCode: "HAR" }, { "@type": "PropertyValue", name: t.app, value: v.app }] },
    { "@type": "BreadcrumbList", itemListElement: crumbs.map(([n, h], i) => ({ "@type": "ListItem", position: i + 1, name: n, ...(h ? { item: new URL(h, url(L, file)).href } : {}) })) }] };
  const facts = [[t.app, v.app], v.commune && [t.commune, v.commune], [t.area, ha(v.ha, L) + " ha"]].filter(Boolean);
  if (v.col) facts.push([t.colour, t[v.col]]);
  if (v.dem) {
    const [lo, hi, , sl, asp, cons] = v.dem;
    facts.push([t.alt, `${Math.round(lo)}–${Math.round(hi)} m`], [t.slope, `${Math.round(sl)} %`]);
    if (cons >= 40 && sl >= 2) facts.push([t.faces, dir8(asp, L)]);
  }
  const note = L === "en" ? v.note.en : v.note[L], soil = L === "en" ? v.soil : v.soilT[L];
  const owners = [...v.owners].filter(([k]) => PROD[k]).sort((a, b) => (a[2] === "s") - (b[2] === "s") || (b[1] ?? -1) - (a[1] ?? -1));
  const nb = nearest(v), peers = SET[v.set].filter(o => o.group === v.group && o.c === v.c);
  const oneOf = peers.length > 1 ? fmt(v.vines ? t.oneOfVines : t.oneOf, peers.length, t[v.c + (v.vines ? "v" : "p")], groupName(v, L), ha(peers.reduce((a, o) => a + o.ha, 0), L)) : "";
  return head(L, file, title, desc, ld) + `<p class="crumbs">${crumbs.map(([n, h]) => h ? `<a href="${h}">${esc(n)}</a>` : esc(n)).join(" › ")}</p>
<h1>${esc(v.n)}</h1>
<p class="app">${esc(v.app)}</p>
<p><span class="pill ${pillCls(v.c)}">${esc(cls)}</span>${v.col ? `<span class="pill">${esc(t[v.col])}</span>` : ""}</p>
${mapSvg(v, L)}
<dl class="facts">${facts.map(([k, x]) => `<div><dt>${esc(k)}</dt><dd>${esc(x)}</dd></div>`).join("")}</dl>
${note ? `<p>${esc(note)}</p>\n` : ""}${oneOf ? `<p>${esc(oneOf)}</p>\n` : ""}${soil ? `<p><b>${t.soil}:</b> ${esc(soil)}</p>\n` : ""}${v.inferred ? `<p>${esc(t.inferred)}</p>\n` : ""}${owners.length ? `<h2>${t.owners}</h2>
<table>${owners.map(([k, h, kind]) => `<tr><td>${esc(PROD[k])}${kind === "f" ? ` <small>(${t.leased})</small>` : ""}</td><td class="n">${h != null && kind !== "s" ? ha(h, L) + " ha" : ""}</td></tr>`).join("")}</table>\n` : ""}<p class="cta"><a class="btn primary" href="../../${v.map.replace("{L}", L)}">${t.open} →</a><a class="btn" href="../../">${t.track}</a></p>
<h2>${t.nearby}</h2>
<ul class="links">${nb.map(o => `<li><a href="${o.slug}.html">${esc(o.n)}</a> <small>${esc([t[o.c] || t.V, o.commune].filter(Boolean).join(" · "))}</small></li>`).join("")}</ul>
` + foot(L, v.set === "burgundy" ? t.source : v.vines ? t.sourceVines : t.sourcePack);
}

function hub(L) {
  const t = T[L], file = "index.html", sets = ["burgundy", ...PACKS];
  const ld = { "@context": "https://schema.org", "@type": "CollectionPage", name: t.hubTitle, description: t.hubDesc, url: url(L, file) };
  let body = `<p class="crumbs"><a href="../../">${t.home}</a> › ${t.vineyards}</p>\n<h1>${esc(t.hubTitle)}</h1>\n<p>${esc(t.hubLead)}</p>\n`;
  for (const s of sets) {
    const groups = {}; SET[s].forEach(v => (groups[v.group] ??= []).push(v));
    const keys = s === "burgundy" ? B.villages.map(v => v.id).filter(k => groups[k]) : Object.keys(groups).sort((a, b) => a.localeCompare(b, "fr"));
    const one = keys.length === 1; // a region of one group (Alsace, the Rhône) needs no sub-heading
    body += `<h2 id="${s}">${esc(regionName(s, L))}</h2>\n`;
    for (const k of keys) {
      body += `${one ? "" : `<h3>${esc(groupName(groups[k][0], L))}</h3>\n`}<ul class="links">${groups[k].sort(order).map(v => `<li><a href="${v.slug}.html">${esc(v.n)}</a> <small>${esc(t[v.c] || t.V)}</small></li>`).join("")}</ul>\n`;
    }
  }
  return head(L, file, `${t.hubTitle} | AllWine`, t.hubDesc, ld) + body + foot(L, t.source);
}

// ── everything ───────────────────────────────────────────────────────────────────────────────────
function build() {
  const files = { [`${OUT}/page.css`]: CSS + "\n" };
  for (const L of LANGS) {
    files[`${OUT}/${L}/index.html`] = hub(L);
    for (const v of ALL) files[`${OUT}/${L}/${v.slug}.html`] = page(v, L);
  }
  const top = ["", "burgundy.html", "atlas.html", "privacy.html"];
  const alt = f => LANGS.map(l => `<xhtml:link rel="alternate" hreflang="${l}" href="${url(l, f)}"/>`).join("") + `<xhtml:link rel="alternate" hreflang="x-default" href="${url("en", f)}"/>`;
  files["sitemap.xml"] = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${top.map(f => `<url><loc>${SITE}${f}</loc></url>`).join("\n")}
${["index.html", ...ALL.map(v => v.slug + ".html")].flatMap(f => LANGS.map(L => `<url><loc>${url(L, f)}</loc>${alt(f)}</url>`)).join("\n")}
</urlset>
`;
  files["robots.txt"] = `User-agent: *
Disallow: /tools/
Disallow: /worker/

Sitemap: ${SITE}sitemap.xml
`;
  return files;
}

if (require.main === module) {
  const files = build(), check = process.argv.includes("--check");
  const onDisk = new Set(LANGS.flatMap(L => { const d = path.join(R, OUT, L); return fs.existsSync(d) ? fs.readdirSync(d).map(f => `${OUT}/${L}/${f}`) : []; }));
  const stale = [...onDisk].filter(f => !(f in files)), diff = Object.keys(files).filter(f => { const p = path.join(R, f); return !fs.existsSync(p) || fs.readFileSync(p, "utf8") !== files[f]; });
  if (check) {
    if (diff.length || stale.length) { console.log(`FAIL pages are out of date: ${diff.length} differ, ${stale.length} stale (${[...diff, ...stale].slice(0, 5).join(", ")}) — run node tools/pages-build.js`); process.exit(1); }
    console.log(`PASS ${Object.keys(files).length} pages and files match the data`); process.exit(0);
  }
  for (const f of stale) fs.unlinkSync(path.join(R, f));
  for (const f of diff) { fs.mkdirSync(path.dirname(path.join(R, f)), { recursive: true }); fs.writeFileSync(path.join(R, f), files[f]); }
  const bytes = Object.values(files).reduce((s, x) => s + Buffer.byteLength(x), 0);
  console.log(`${ALL.length} vineyards × ${LANGS.length} languages: ${Object.keys(files).length} files, ${(bytes / 1e6).toFixed(1)} MB; ${diff.length} written, ${stale.length} removed`);
}
module.exports = { build, ALL, LANGS, OUT, SITE, T };
