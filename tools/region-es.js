// Spain for tools/region-build.js: Rioja's viñedos singulares, the single vineyards the Ministry of Agriculture has
// recognised within the DOCa, one Orden APA a year in the BOE (2019–2025). Each order's annex gives a vineyard's parcels
// as SIGPAC references (province, municipality, polygon, parcel, enclosure), some only in part, by a ring of
// coordinates; the enclosures themselves come from SIGPAC's open API (FEGA, CC BY 4.0). The DOCa's three zones are
// drawn from the municipalities its pliego de condiciones lists (IGN's administrative units, CC BY 4.0).
"use strict";
const fs = require("fs"), path = require("path");

// the orders, oldest first: a later order that lists a vineyard again (a new name, its delimitation after an
// enlargement) restates it whole, so the newest listing is the vineyard
const ORDERS = [["BOE-A-2019-11186", "Orden APA/816/2019"], ["BOE-A-2020-9446", "Orden APA/780/2020"], ["BOE-A-2021-8011", "Orden APA/468/2021"],
  ["BOE-A-2022-13770", "Orden APA/794/2022"], ["BOE-A-2023-17245", "Orden APA/873/2023"], ["BOE-A-2024-15839", "Orden APA/808/2024"], ["BOE-A-2025-11177", "Orden APA/571/2025"]];
const RENAMED = { "122/2021": "Nivarius Valdesabril" }; // BOE-A-2021-9611 corrects the 2021 order's «Proelio Valdesabril»
// the pliego's zones (its section 4). Names that are villages of another municipality go to it (Barriobusto and
// Labraza: Oyón; Salinillas de Buradón: Labastida; Bergasilla: Bergasa; Molinos de Ocón: Ocón); Miranda de Ebro has only the enclave of
// El Ternero in the DOCa, so it's left out; Ocón and Santa Engracia del Jubera are drawn whole (the pliego takes part)
const ZONES = {
  "Rioja Alta": ["26", "Ábalos|Alesanco|Alesón|Anguciana|Arenzana de Abajo|Arenzana de Arriba|Azofra|Badarán|Bañares|Baños de Río Tobía|Baños de Rioja|Berceo|Bezares|Bobadilla|Briñas|Briones|Camprovín|Canillas de Río Tuerto|Cañas|Cárdenas|Casalarreina|Castañares de Rioja|Cellorigo|Cenicero|Cidamón|Cihuri|Cirueña|Cordovín|Cuzcurrita de Río Tirón|Daroca de Rioja|Entrena|Estollo|Foncea|Fonzaleche|Fuenmayor|Galbárruli|Gimileo|Haro|Hervías|Herramélluri|Hormilla|Hormilleja|Hornos de Moncalvillo|Huércanos|Lardero|Leiva|Logroño|Manjarrés|Matute|Medrano|Nájera|Navarrete|Ochánduri|Ollauri|Rodezno|Sajazarra|San Asensio|San Millán de Yécora|San Torcuato|San Vicente de la Sonsierra|Santa Coloma|Sojuela|Sorzano|Sotés|Tirgo|Tormantos|Torrecilla sobre Alesanco|Torremontalbo|Treviana|Tricio|Uruñuela|Ventosa|Villalba de Rioja|Villar de Torre|Villarejo|Zarratón"],
  "Rioja Oriental": ["26|31", "Agoncillo|Aguilar del Río Alhama|Albelda de Iregua|Alberite|Alcanadre|Aldeanueva de Ebro|Alfaro|Arnedillo|Arnedo|Arrúbal|Ausejo|Autol|Bergasa|Calahorra|Cervera del Río Alhama|Clavijo|Cornago|Corera|El Redal|El Villar de Arnedo|Galilea|Grávalos|Herce|Igea|Lagunilla del Jubera|Leza de Río Leza|Murillo de Río Leza|Muro de Aguas|Nalda|Ocón|Pradejón|Préjano|Quel|Ribafrecha|Rincón de Soto|Santa Engracia del Jubera|Santa Eulalia Bajera|Tudelilla|Villamediana de Iregua|Villarroya|Andosilla|Aras|Bargota|Azagra|Mendavia|San Adrián|Sartaguda|Viana"],
  "Rioja Alavesa": ["01", "Baños de Ebro|Elvillar|Lanciego|Navaridas|Villabuena de Álava|Labastida|Lapuebla de Labarca|Oyón|Yécora|Kripan|Labraza|Leza|Moreda de Álava|Samaniego|Elciego|Laguardia"],
};
const PROV = { "álava": "01", alava: "01", "la rioja": "26", navarra: "31", burgos: "09" };
const norm = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();
// the orders' spellings that differ from IGN's names
const ALIAS = { "el ciego": "elciego", "elvillar de alava": "elvillar", "villabuena de alava": "villabuena de alava", "cripan": "kripan", "ocon": "ocon", "leza del rio leza": "leza de rio leza",
  "baños del rio tobia": "banos de rio tobia", "banos del rio tobia": "banos de rio tobia", "lagunilla de jubera": "lagunilla del jubera" };

// ── the orders' annexes: their tables, rowspans spread out ───────────────────────────────────────────────────────
const text = h => h.replace(/<(p|br)\b[^>]*>/gi, " ").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
  .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
function tables(html) {
  return (html.match(/<table[\s\S]*?<\/table>/gi) || []).map(t => { const grid = [], pend = {};
    for (const tr of t.match(/<tr[\s\S]*?<\/tr>/gi) || []) { const cells = (tr.match(/<t[dh]\b[^>]*>[\s\S]*?<\/t[dh]>/gi) || []).map(c => ({
        v: text(c), rs: +((c.match(/rowspan="(\d+)"/) || [])[1] || 1), cs: +((c.match(/colspan="(\d+)"/) || [])[1] || 1), th: /^<th/i.test(c) }));
      const row = []; let ci = 0;
      while (cells.length || pend[ci]) {
        if (pend[ci]) { row.push(pend[ci].v); if (--pend[ci].n <= 0) delete pend[ci]; ci++; continue; }
        const c = cells.shift(); for (let k = 0; k < c.cs; k++) { row.push(c.v); if (c.rs > 1) pend[ci] = { v: c.v, n: c.rs - 1 }; ci++; }
      }
      grid.push({ th: /<th/i.test(tr), row });
    }
    return grid; });
}
// "502.834,87" (thousands and a decimal comma), "530086.1758" (a decimal point), "570.195" (thousands only)
const num = s => { s = String(s).replace(/\s/g, "").replace(/:/g, ".");
  if (s.includes(",")) return +s.replace(/\./g, "").replace(",", ".");
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return +s.replace(/\./g, "");
  return +s; };
// ETRS89 / UTM 30N → longitude, latitude (GRS80; ETRS89 is WGS84 to well within a metre here)
function utm30(E, N) {
  const a = 6378137, f = 1 / 298.257222101, e2 = f * (2 - f), ep2 = e2 / (1 - e2), k0 = .9996, d = Math.PI / 180;
  const x = E - 500000, M = N / k0, mu = M / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256)), e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu) + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const C1 = ep2 * Math.cos(p1) ** 2, T1 = Math.tan(p1) ** 2, N1 = a / Math.sqrt(1 - e2 * Math.sin(p1) ** 2), R1 = a * (1 - e2) / (1 - e2 * Math.sin(p1) ** 2) ** 1.5, D = x / (N1 * k0);
  const lat = p1 - (N1 * Math.tan(p1) / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4 / 24 + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6 / 720);
  const lon = -3 * d + (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5 / 120) / Math.cos(p1);
  return [lon / d, lat / d];
}
// a ring given in an annex: "X: 502.834,87;Y:4.709.933,79 X: …", or UTM pairs in brackets; the odd slip in a northing
// (1.692.168 for 4.692.168) put right, and logged
function ring(s, log) {
  const pts = [...s.matchAll(/X\s*:\s*([\d.,:\s]+?)\s*[;,]?\s*Y\s*:\s*([\d.,:]+\d)/gi)].map(m => { let E = num(m[1]), N = num(m[2]);
    if (N < 4e6 && N > 1e6) { log.push(`northing ${m[2]} read as ${N + 3e6}`); N += 3e6; } return [E, N]; }).filter(([E, N]) => E > 4e5 && E < 7e5 && N > 4.5e6 && N < 4.9e6);
  if (pts.length < 3) return null;
  const r = pts.map(([E, N]) => utm30(E, N)); r.push(r[0]); return r;
}
// a ring in degrees, minutes and seconds (the 2021 order's footnotes): [deg, min, sec, N, deg, min, sec, W] a point
const dmsRing = rows => { const r = rows.map(c => { const v = c.slice(1).map(x => num(x)); return [-(v[4] + v[5] / 60 + v[6] / 3600), v[0] + v[1] / 60 + v[2] / 3600]; }); r.push(r[0]); return r; };
// "17,19", "384-386", "152;78", "614," → parcels; a short range is a range, a long one two parcels ("56-108")
const parcels = s => String(s).split(/[,;]|\sy\s/).map(x => x.trim()).filter(Boolean).flatMap(x => { const m = x.match(/^(\d+)\s*-\s*(\d+)$/);
  if (m) { const a = +m[1], b = +m[2]; return b - a > 0 && b - a <= 5 ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : [a, b]; } const n = parseInt(x, 10); return isNaN(n) ? [] : [n]; });
// "1", "1.", "2 y 3", "1,13,14 y 16", "" (the whole parcel), "1(2)" (footnote 2: a part, by coordinates), "5 PARCIAL ETRS…"
const enclosures = s => { const head = String(s).split(/PARCIAL|ETRS|Coordenadas|UTM|X\s*:/i)[0].replace(/\(\d+\)/g, ""); const ns = head.split(/[,;]|\sy\s/).map(x => parseInt(x, 10)).filter(n => !isNaN(n)); return ns.length ? ns : null; };
const titleCase = s => s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s(«"'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\b(De|Del|La|Las|Los|Y|El)\b(?!$)/g, w => w.toLowerCase()).replace(/^./, c => c.toUpperCase()) : s;

async function orders(CACHE, curl, log) {
  const all = new Map();
  for (const [boe, ref] of ORDERS) {
    const file = path.join(CACHE, `es-${boe}.html`);
    if (!fs.existsSync(file)) fs.writeFileSync(file, await curl(`https://www.boe.es/diario_boe/txt.php?id=${boe}`));
    const T = tables(fs.readFileSync(file, "utf8")), main = T[0], hd = main.filter(r => r.th).pop().row;
    const col = re => hd.findIndex(h => re.test(h)), cP = col(/provincia/i), cM = col(/municipio/i), cPo = col(/pol[ií]gono/i), cPa = col(/parcela/i), cR = col(/recinto/i);
    const got = new Map();
    for (const { th, row } of main) { if (th) continue; const m = row[0].match(/VS\s*-?\s*(\d+(?:-\d+)?)(?:\s*\/\s*(\d{4}))?/i); if (!m) continue;
      const key = m[1] + "/" + (m[2] || "2019"), v = got.get(key) || { key, name: titleCase(row[1].replace(/\s*,\s*\./g, ".").replace(/[.,\s]+$/, "").trim()), order: ref, boe, parts: [] }; got.set(key, v);
      const prov = PROV[norm(row[cP]).replace(/\s*$/, "")] || PROV[norm(row[cP]).split(" ").pop()] || (/rioja/i.test(row[cP]) ? "26" : /lava/i.test(row[cP]) ? "01" : /navarra/i.test(row[cP]) ? "31" : null);
      const foot = (row[cR].match(/\((\d)\)/) || [])[1], part = { prov, mun: row[cM].replace(/\.$/, ""), pol: parseInt(row[cPo], 10), parcels: parcels(row[cPa]), rec: enclosures(row[cR]) };
      const r = /X\s*:/i.test(row[cR]) ? ring(row[cR], log) : foot && +foot > 1 && T[+foot - 1] ? dmsRing(T[+foot - 1].filter(x => !x.th && /Punto/i.test(x.row[0])).map(x => x.row)) : null;
      if (r) part.ring = r; v.parts.push(part); }
    for (const [k, v] of got) { if (all.has(k)) log.push(`${k} restated by ${ref}`); all.set(k, v); }
  }
  for (const [k, n] of Object.entries(RENAMED)) if (all.has(k)) all.get(k).name = n;
  return [...all.values()];
}

// ── IGN's municipalities (INSPIRE administrative units, GML, lat lon) for the DOCa's box ─────────────────────────────
async function municipalities(CACHE, curl, key = "rioja", bbox = "41.9,-3.3,42.85,-1.5") {
  const file = path.join(CACHE, `es-${key}-municipios.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const out = [];
  for (let start = 0; ; start += 200) {
    const gml = String(await curl(`https://www.ign.es/wfs-inspire/unidades-administrativas?service=WFS&version=2.0.0&request=GetFeature&typeNames=au:AdministrativeUnit&count=200&startIndex=${start}&bbox=${bbox},urn:ogc:def:crs:EPSG::4326`));
    const units = gml.split(/<au:AdministrativeUnit\b/).slice(1);
    for (const u of units) { const code = (u.match(/<au:nationalCode>(\d+)</) || [])[1] || ""; if (code.length !== 11 || /00000$/.test(code)) continue; // municipalities only (the country, regions and provinces end 00000)
      const name = text((u.match(/<gn:text>([^<]*)</) || [])[1] || ""), polys = [];
      for (const pg of u.split(/<gml:Polygon\b/).slice(1)) { const rings = [...pg.split(/<\/gml:Polygon>/)[0].matchAll(/<gml:posList[^>]*>([^<]*)</g)].map(m => { const v = m[1].trim().split(/\s+/).map(Number), r = [];
          for (let i = 0; i < v.length; i += 2) r.push([v[i + 1], v[i]]); return r; }); if (rings.length) polys.push(rings); }
      out.push({ ine: code.slice(-5), name, polys }); }
    process.stderr.write(`  IGN municipalities: ${out.length}\n`);
    if (units.length < 200) break;
  }
  fs.writeFileSync(file, JSON.stringify(out)); return out;
}
// a name from the orders or the pliego → IGN's municipality, in its province ("Labastida/Bastida", "Oyón-Oion")
function finder(munis) {
  const alts = m => norm(m.name).split(/\s*[/-]\s*|\s{2,}/).concat([norm(m.name)]);
  return (name, prov) => { let n = norm(name); n = ALIAS[n] || n; if (/^(barriobusto|labraza)$/.test(n)) n = "oyon"; if (n === "salinillas de buradon") n = "labastida"; if (n === "bergasilla") n = "bergasa"; if (n === "molinos de ocon") n = "ocon";
    const inP = munis.filter(m => !prov || prov.split("|").includes(m.ine.slice(0, 2)));
    return inP.find(m => alts(m).includes(n)) || inP.find(m => alts(m).some(a => a.replace(/ de alava$/, "") === n.replace(/ de alava$/, ""))) || inP.find(m => norm(m.name).startsWith(n + " ")) || null; };
}

const inRing = ([x, y], r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
// ── SIGPAC's enclosures for a parcel (FEGA's OGC API, CC BY 4.0), cached ────────────────────────────────────────────
async function enclosuresOf(CACHE, curl, prov, mun, pol, par) {
  const dir = path.join(CACHE, "es-sigpac"), file = path.join(dir, `${prov}-${mun}-${pol}-${par}.json`); fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(file)) { const d = JSON.parse(await curl(`https://sigpac-hubcloud.es/ogcapi/collections/recintos/items?f=json&limit=200&provincia=${+prov}&municipio=${+mun}&poligono=${pol}&parcela=${par}`));
    fs.writeFileSync(file, JSON.stringify(d.features.map(f => ({ rec: f.properties.recinto, g: f.geometry })))); }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

async function riojaBuild(H) {
  const { CACHE, curl, polysOf, union, tidy, polyHa, label, slug } = H, log = [];
  const vs = await orders(CACHE, curl, log), munis = await municipalities(CACHE, curl), find = finder(munis);
  // the zones, by municipality
  const zoneOf = {}, zoneMunis = {};
  for (const [z, [prov, list]] of Object.entries(ZONES)) { zoneMunis[z] = [];
    for (const n of list.split("|")) { const m = find(n, prov); if (!m) { log.push(`zone ${z}: no municipality ${n}`); continue; } if (!zoneMunis[z].includes(m)) zoneMunis[z].push(m); zoneOf[m.ine] = z; } }
  // the vineyards' shapes, in longitude and latitude
  const sites = [], unmapped = [];
  for (const v of vs) { const polys = [], miss = []; let muni = null;
    const ms = [];
    for (const p of v.parts) { const m = find(p.mun, p.prov); if (!m) { miss.push(`municipality ${p.mun}`); continue; } muni = muni || m; if (!ms.includes(m)) ms.push(m);
      if (p.ring) { polys.push([p.ring]); continue; }
      for (const par of p.parcels) { const es = await enclosuresOf(CACHE, curl, m.ine.slice(0, 2), m.ine.slice(2), p.pol, par), want = es.filter(e => !p.rec || p.rec.includes(e.rec));
        // the parcel's enclosures renumbered since the order: the whole parcel; the parcel itself gone: not drawn
        const use = want.length ? want : es; if (!want.length && es.length) log.push(`VS ${v.key} ${v.name}: ${m.name} ${p.pol}/${par} has no enclosure ${p.rec.join("+")} now; the whole parcel drawn`);
        if (!es.length) miss.push(`${m.name} ${p.pol}/${par}`); use.forEach(e => polys.push(...polysOf(e.g))); } }
    if (miss.length) log.push(`VS ${v.key} ${v.name}: not found ${miss.join(", ")}`);
    if (polys.length && muni) sites.push({ v, muni, ms, polys, part: miss.length > 0 }); else { log.push(`VS ${v.key} ${v.name}: left out (nothing to draw)`); unmapped.push(v.name); }
  }
  // to metres round the middle
  const all = Object.values(zoneMunis).flat().flatMap(m => m.polys.flatMap(p => p[0]));
  const lo = all.map(p => p[0]), la = all.map(p => p[1]), O = [+((Math.min(...lo) + Math.max(...lo)) / 2).toFixed(4), +((Math.min(...la) + Math.max(...la)) / 2).toFixed(4)];
  const d2r = Math.PI / 180, kx = d2r * 6371000 * Math.cos(O[1] * d2r), ky = d2r * 6371000, m_ = ([x, y]) => [(x - O[0]) * kx, (O[1] - y) * ky];
  const climats = sites.map(({ v, muni, ms, polys, part }) => { const mp = union(polys.map(p => p.map(r => r.map(m_)))), g = tidy(mp, 1.5);
    // its municipality: of those the order names, the one the vineyard as drawn lies in (a vineyard can straddle two)
    const lp = label(g), at = [O[0] + lp[0] / kx, O[1] - lp[1] / ky], home = ms.find(m => m.polys.some(pg => inRing(at, pg[0]))) || muni;
    const app = home.name.split(/\s*\/\s*/)[0];
    return g.length && { id: slug(v.name), n: v.name, c: "VS", ap: "Viñedo singular", app, area: zoneOf[home.ine] || zoneOf[muni.ine] || "", exp: "VS " + v.key, order: v.order, boe: v.boe,
      ha: +polyHa(mp).toFixed(2), lp, g, aka: [v.name, app + " " + v.name], ...(part ? { partial: true } : {}) }; }).filter(Boolean);
  const villages = Object.entries(zoneMunis).map(([z, ms]) => { const mp = union(ms.flatMap(m => m.polys.map(p => p.map(r => r.map(m_))))); return { ap: z, ha: +polyHa(mp).toFixed(0), g: tidy(mp, 60) }; });
  log.forEach(l => console.error("  · " + l));
  return { climats, villages, regionalLand: [], meta: { proj: "eq", origin: O, l93: null, shade: "es", unmapped: unmapped.sort((a, b) => a.localeCompare(b, "es")),
    source: `Viñedos singulares: Ministerio de Agricultura, Pesca y Alimentación, Órdenes APA 2019–2025 (BOE); parcels: SIGPAC, Fondo Español de Garantía Agraria (FEGA), CC BY 4.0; zones: the DOCa Rioja's pliego de condiciones, municipalities © Instituto Geográfico Nacional, CC BY 4.0 [data edited]` } };
}

// ── regions drawn by municipality: Ribera del Duero (its pliego lists the INE codes of its municipalities and their
// villages, 2020) and Priorat (nine municipalities whole, and the north of Falset and the east of El Molar) ─────────
// "INE|name|villages": a municipality with villages named is only partly in the DO (those villages); it's drawn whole
const RIBERA = "09003|Adrada de Haza|\n09017|Anguix|\n09018|Aranda de Duero|\n09035|Baños de Valdearados|\n09051|Berlangas de Roa|\n09064|Caleruega|Caleruega\n09065|Campillo de Aranda|\n09085|Castrillo de la Vega|\n09117|Cueva de Roa (La)|\n09131|Fresnillo de las Dueñas|\n09136|Fuentecén|\n09137|Fuentelcésped|\n09138|Fuentelisendo|Fuentelisendo\n09139|Fuentemolinos|\n09140|Fuentenebro|Fuentenebro\n09141|Fuentespina|\n09151|Gumiel de Izán|\n09152|Gumiel de Mercado|\n09155|Haza|Haza\n09160|Hontangas|\n09164|Hontoria de Valdearados|\n09168|Horra (La)|\n09170|Hoyales de Roa|Hoyales de Roa\n09199|Mambrilla de Castrejón|\n09218|Milagros|Milagros\n09228|Moradillo de Roa|\n09229|Nava de Roa|Nava de Roa\n09235|Olmedillo de Roa|\n09253|Pardilla|\n09256|Pedrosa de Duero|\n09261|Peñaranda de Duero|\n09279|Quemada|\n09281|Quintana del Pidio|Quintana del Pidio\n09321|Roa|Roa\n09337|San Juan del Monte|\n09339|San Martín de Rubiales|San Martín de Rubiales\n09345|Santa Cruz de la Salceda|Santa Cruz de la Salceda\n09365|Sequera de Haza (La)|\n09369|Sotillo de la Ribera|\n09380|Terradillos de Esgueva|\n09387|Torregalindo|\n09391|Tórtoles de Esgueva|Tórtoles de Esgueva+Villovela de Esgueva\n09396|Tubilla del Lago|\n09400|Vadocondes|\n09403|Valdeande|\n09405|Valdezate|\n09421|Vid y Barrios (La)|\n09428|Villaescusa de Roa|\n09438|Villalba de Duero|Villalba de Duero\n09440|Villalbilla de Gumiel|Villalbilla de Gumiel\n09451|Villanueva de Gumiel|\n09464|Villatuelda|\n09483|Zazuar|\n40014|Aldehorno|\n40099|Honrubia de la Cuesta|\n40130|Montejo de la Vega de la|\n40229|Villaverde de Montejo|\n42007|Alcubilla de Avellaneda|\n42043|Burgo de Osma-Ciudad de Osma|Alcubilla del Marqués\n42058|Castillejo de Robledo|Castillejo de Robledo\n42103|Langa de Duero|\n42116|Miño de San Esteban|Miño de San Esteban\n42162|San Esteban de Gormaz|\n47022|Bocos de Duero|\n47033|Canalejas de Peñafiel|\n47038|Castrillo de Duero|\n47059|Curiel de Duero|\n47063|Fompedraza|\n47080|Manzanillo|\n47103|Olivares de Duero|\n47106|Olmos de Peñafiel|\n47114|Peñafiel|\n47116|Pesquera de Duero|\n47118|Piñel de Abajo|\n47119|Piñel de Arriba|\n47127|Quintanilla de Arriba|\n47129|Quintanilla de Onésimo|\n47131|Rábano|\n47137|Roturas|\n47170|Torre de Peñafiel|\n47179|Valbuena de Duero|\n47180|Valdearcos de la Vega|";
const MUNI_REGIONS = {
  ribera: { bbox: "41.2,-4.8,42.0,-2.7", source: "Municipalities: the DOP Ribera del Duero's pliego de condiciones (2020, its section 4); boundaries © Instituto Geográfico Nacional, CC BY 4.0 [data edited]",
    list: () => RIBERA.split("\n").map(l => { const [ine, name, v] = l.split("|"); return { ine, name, villages: v ? v.split("+") : null }; }),
    area: { "09": "Burgos", "40": "Segovia", "42": "Soria", "47": "Valladolid" } },
  priorat: { bbox: "41.05,0.65,41.32,0.95", source: "Municipalities: the DOQ Priorat (nine whole, and the north of Falset and the east of El Molar, as the Consell Regulador describes it); boundaries © Instituto Geográfico Nacional, CC BY 4.0 [data edited]",
    list: () => ["Bellmunt del Priorat", "Gratallops", "el Lloar", "la Morera de Montsant", "Poboleda", "Porrera", "Torroja del Priorat", "la Vilella Alta", "la Vilella Baixa"].map(name => ({ prov: "43", name, villages: null }))
      .concat([{ prov: "43", name: "Falset", villages: ["Masos de Falset"] }, { prov: "43", name: "el Molar", villages: ["Les Solanes del Molar"] }]),
    area: {} },
};
async function muniBuild(H, key) {
  const { CACHE, curl, union, tidy, polyHa, label, slug } = H, R = MUNI_REGIONS[key], log = [];
  const munis = await municipalities(CACHE, curl, key, R.bbox), find = finder(munis), sel = [];
  for (const x of R.list()) { const m = x.ine ? munis.find(u => u.ine === x.ine) : find(x.name, x.prov); if (!m) { log.push(`no municipality ${x.ine || ""} ${x.name}`); continue; } sel.push({ x, m }); }
  const all = sel.flatMap(({ m }) => m.polys.flatMap(p => p[0])), lo = all.map(p => p[0]), la = all.map(p => p[1]);
  const O = [+((Math.min(...lo) + Math.max(...lo)) / 2).toFixed(4), +((Math.min(...la) + Math.max(...la)) / 2).toFixed(4)];
  const d2r = Math.PI / 180, kx = d2r * 6371000 * Math.cos(O[1] * d2r), ky = d2r * 6371000, m_ = ([x, y]) => [(x - O[0]) * kx, (O[1] - y) * ky];
  const climats = sel.map(({ x, m }) => { const mp = union(m.polys.map(p => p.map(r => r.map(m_)))), g = tidy(mp, 15), n = m.name.split(/\s*\/\s*/)[0];
    return { id: slug(n), n, c: "MU", ap: "Municipio", app: n, area: R.area[m.ine.slice(0, 2)] || "", ine: m.ine, ha: +polyHa(mp).toFixed(0), lp: label(g), g, aka: [n],
      ...(x.villages ? { villages: x.villages } : {}) }; });
  log.forEach(l => console.error("  · " + l));
  return { climats, villages: [], regionalLand: [], meta: { proj: "eq", origin: O, l93: null, shade: "es", source: R.source } };
}
module.exports = { riojaBuild, muniBuild, utm30, num, parcels, enclosures, tables };
