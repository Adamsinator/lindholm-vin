// Denmark for tools/region-build.js: the vines of Danish wine, by municipality and wine area.
//   · the vines: Landbrugsstyrelsen's field map (Marker 2025, crop code 530 "Vindrue"), the fields farmers declare each
//     year; only the shapes, the crop and the area are kept (never the farm's CVR or journal number);
//   · the four PGI wine areas (Jylland, Fyn, Sjælland, Bornholm) as their product specifications define them, from
//     municipalities (DAGI, Styrelsen for Dataforsyning og Infrastruktur, free geographic data);
//   · the PDOs: Dons (registered 2018, the cadastral district "Dons By, Almind"), Røsnæs (applied for: the parishes
//     Røsnæs and Raklev) and Odsherred (a 2023 specification: 14 parishes), from DAGI parishes and the cadastre.
// DAGI and the cadastre are read from Vejdirektoratet's public map server (kort.vd.dk), which serves them as published.
"use strict";
const fs = require("fs"), path = require("path");
const FVM = "https://geodata.fvm.dk/geoserver/Marker/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=Marker:Marker_2025&outputFormat=application/json&srsName=EPSG:4326&count=5000&CQL_FILTER=Afgkode=530";
const VD = "https://kort.vd.dk/server/rest/services/Grunddata";
const DAGI = VD + "/Danmarks_Administrative_Geografiske_Inddelinger/MapServer";
// the PGI areas (product specifications, rev. 2013): Fyn is Funen "med naturligt tilhørende øer", Bornholm the
// regional municipality, Sjælland Region Sjælland and Region Hovedstaden but Bornholm, Jylland the rest
const FYN = new Set([410, 420, 430, 440, 450, 461, 479, 480, 482, 492]), BORNHOLM = 400, CHRISTIANSOE = 411;
const areaOf = k => k.KommuneKode === BORNHOLM ? "Bornholm" : FYN.has(k.KommuneKode) ? "Fyn" : k.RegionsKode === 1084 || k.RegionsKode === 1085 ? "Sjælland" : "Jylland";
const PDO = [
  { ap: "Dons", status: "registered", year: 2018, ejerlav: "Dons By, Almind", wines: "sparkling", grapes: ["Solaris"] },
  { ap: "Røsnæs", status: "applied", year: 2026, parishes: ["Røsnæs", "Raklev"], wines: "white, sparkling, rosé, fortified", grapes: ["Solaris", "Souvignier Gris", "Johanniter", "Muscaris", "Pinot Noir", "Cabernet Cantor", "Rondo", "Monarch", "Léon Millot"] },
  { ap: "Odsherred", status: "proposed", year: 2023, parishes: ["Asnæs", "Egebjerg", "Fårevejle", "Grevinge", "Højby", "Nykøbing S", "Nørre Asmindrup", "Odden", "Rørvig", "Vallekilde", "Hørve", "Tuse Næs", "Sejerø", "Føllenslev-Særslev"], wines: "white", grapes: ["Solaris"] },
];
// what's said about a municipality's wine, from published sources (legal.html lists them)
const NOTES = {
  "Holbæk": ["Njord: Sune Albertsen's vineyard by Tølløse, about 10 km south of Holbæk, founded in 2010: some 5 ha on south-facing hills of sand and gravel, mostly Pinot Noir Précoce (Frühburgunder), farmed on organic and biodynamic principles.", "Njord's vines aren't in the field map: none of its fields is declared as vines, so it is marked by its address on Sophienholmvej.",
    "Tuse Næs, north of the town, is inside the parishes of the proposed Odsherred PDO."],
};
const dk = s => String(s).replace(/æ/g, "ae").replace(/Æ/g, "Ae").replace(/ø/g, "oe").replace(/Ø/g, "Oe").replace(/å/g, "aa").replace(/Å/g, "Aa");

async function get(curl, CACHE, name, url) {
  const file = path.join(CACHE, `dk-${name}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const d = JSON.parse(await curl(url)); // the field map answers in ISO-8859-1: its crop names may garble, only numbers are kept
  if (d.error) throw new Error(name + ": " + JSON.stringify(d.error));
  fs.writeFileSync(file, JSON.stringify(d)); return d;
}

async function denmarkBuild(H) {
  const { CACHE, curl, polysOf, union, tidy, polyHa, label, slug } = H, log = [];
  const fields = (await get(curl, CACHE, "marker-2025-vin", FVM)).features.filter(f => f.properties.Afgkode === 530 && f.geometry);
  const kom = (await get(curl, CACHE, "kommuner", `${DAGI}/7/query?where=1%3D1&outFields=Navn,KommuneKode,RegionsKode&outSR=4326&maxAllowableOffset=0.0002&f=geojson`)).features
    .filter(k => k.properties.KommuneKode !== CHRISTIANSOE);
  const sogne = (await get(curl, CACHE, "sogne-nwsj", `${DAGI}/52/query?where=1%3D1&geometry=10.8,55.55,11.95,56.0&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=Navn,Sognekode&outSR=4326&f=geojson`)).features;
  const dons = (await get(curl, CACHE, "ejerlav-dons", `${VD}/Matriklen_gaeldende/MapServer/13/query?where=EjerlavsKode%3D1150552&outFields=EjerlavsNavn,EjerlavsKode&outSR=4326&f=geojson`)).features;
  // to metres round the middle of Denmark
  const O = [11.0, 56.0], d2r = Math.PI / 180, kx = d2r * 6371000 * Math.cos(O[1] * d2r), ky = d2r * 6371000;
  const m = ([x, y]) => [(x - O[0]) * kx, (O[1] - y) * ky], inM = g => polysOf(g).map(p => p.map(r => r.map(m)));
  const bb = mp => { let a = [Infinity, Infinity, -Infinity, -Infinity]; mp.forEach(p => p[0].forEach(([x, y]) => { a = [Math.min(a[0], x), Math.min(a[1], y), Math.max(a[2], x), Math.max(a[3], y)]; })); return a; };
  const inside = ([x, y], mp) => mp.some(p => { let c = false; for (const r of p) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; });
  const pc = require("./node_modules/polygon-clipping");
  // the municipalities, in metres, with their wine area
  const K = kom.map(k => { const g = inM(k.geometry); return { n: k.properties.Navn, code: k.properties.KommuneKode, area: areaOf(k.properties), g, b: bb(g) }; });
  // each field to the municipality its middle is in
  const F = fields.map(f => { const g = inM(f.geometry), b = bb(g), mid = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
    const k = K.find(k => mid[0] >= k.b[0] && mid[0] <= k.b[2] && mid[1] >= k.b[1] && mid[1] <= k.b[3] && inside(mid, k.g))
      || K.reduce((a, k) => { const d = Math.hypot(mid[0] - (k.b[0] + k.b[2]) / 2, mid[1] - (k.b[1] + k.b[3]) / 2); return !a || d < a.d ? { k, d } : a; }, null).k;
    return { g, mid, k, ha: Number(f.properties.IMK_areal) || polyHa(g) }; });
  // the PDO areas
  const pdo = PDO.map(P => { let g;
    if (P.ejerlav) g = union(dons.flatMap(f => inM(f.geometry)));
    else { const got = sogne.filter(s => P.parishes.includes(s.properties.Navn)), names = new Set(got.map(s => s.properties.Navn));
      P.parishes.filter(p => !names.has(p)).forEach(p => log.push(`${P.ap}: no parish ${p}`)); g = union(got.flatMap(s => inM(s.geometry))); }
    return { ...P, g, ha: +polyHa(g).toFixed(0) }; });
  const climats = [];
  for (const k of K) { const fs_ = F.filter(f => f.k === k); if (!fs_.length) continue;
    const mp = union(fs_.flatMap(f => f.g)), gg = tidy(mp, 2), inPdo = {};
    pdo.forEach(P => { const ha = fs_.filter(f => inside(f.mid, P.g)).reduce((s, f) => s + f.ha, 0); if (ha) inPdo[P.ap] = +ha.toFixed(1); });
    climats.push({ id: slug(dk(k.n)), n: k.n, c: "DV", ap: k.area, app: k.n, area: k.area, fields: fs_.length, ha: +fs_.reduce((s, f) => s + f.ha, 0).toFixed(1),
      munHa: +polyHa(k.g).toFixed(0), hit: tidy(k.g, 250).filter(p => polyHa([p]) > 50), ...(Object.keys(inPdo).length ? { pdo: inPdo } : {}), ...(NOTES[k.n] ? { notes: NOTES[k.n] } : {}), lp: label(gg), g: gg, aka: [k.n, dk(k.n)] });
  }
  Object.keys(NOTES).filter(n => !climats.some(c => c.n === n)).forEach(n => log.push(`no vines found in ${n}`));
  const zones = {}; K.forEach(k => (zones[k.area] ||= []).push(...k.g));
  const villages = ["Jylland", "Fyn", "Sjælland", "Bornholm"].map(z => { const mp = union(zones[z]); return { ap: z, kind: "pgi", ha: +polyHa(mp).toFixed(0), g: tidy(mp, 60).filter(p => polyHa([p]) > 30) }; })
    .concat(pdo.map(P => ({ ap: P.ap, kind: "pdo", status: P.status, year: P.year, wines: P.wines, grapes: P.grapes, ha: P.ha, g: tidy(P.g, 15) })));
  log.forEach(l => console.error("  · " + l));
  console.error(`  ${fields.length} vine fields, ${F.reduce((s, f) => s + f.ha, 0).toFixed(1)} ha; PDO areas ${pdo.map(P => P.ap + " " + P.ha + " ha").join(", ")}`);
  return { climats, villages, regionalLand: [], meta: { proj: "eq", origin: O, l93: null, shade: "none", fieldsYear: 2025,
    source: "Vines: Landbrugsstyrelsen (Styrelsen for Grøn Arealomlægning og Vandmiljø), Marker 2025, crop 530 Vindrue; municipalities, parishes and the cadastral district: DAGI and Matriklen, Styrelsen for Dataforsyning og Infrastruktur (free geographic data) [data edited]; wine areas: Fødevarestyrelsen's product specifications" } };
}

// ── Holbæk & Odsherred, close up ────────────────────────────────────────────────────────────────────────────────────
// The same fields, by parish, in a box round Holbæk, Odsherred and Røsnæs; the land from DAGI's municipalities; town and
// village names from the cadastre's districts ("Holbæk Bygrunde" a town, "Tuse By, Tuse" a village), written as the
// region's topo layer (atlas-holbaek-topo.js).
const HB = [10.85, 55.55, 11.95, 55.99]; // lon0, lat0, lon1, lat1
async function holbaekBuild(H) {
  const { CACHE, curl, polysOf, union, tidy, polyHa, label, slug } = H, log = [];
  const box = `${HB[0]},${HB[1]},${HB[2]},${HB[3]}`, q = `geometry=${box}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&outSR=4326&f=geojson`;
  const fields = (await get(curl, CACHE, "marker-2025-vin", FVM)).features.filter(f => f.properties.Afgkode === 530 && f.geometry);
  const kom = (await get(curl, CACHE, "kommuner", `${DAGI}/7/query?where=1%3D1&outFields=Navn,KommuneKode,RegionsKode&outSR=4326&maxAllowableOffset=0.0002&f=geojson`)).features;
  const sogne = (await get(curl, CACHE, "sogne-hb", `${DAGI}/52/query?where=1%3D1&outFields=Navn,Sognekode&maxAllowableOffset=0.0001&${q}`)).features;
  const post = (await get(curl, CACHE, "post-hb", `${DAGI}/35/query?where=1%3D1&outFields=Navn&returnGeometry=false&geometry=${box}&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects&f=json`)).features.map(f => f.attributes.Navn);
  const lav = (await get(curl, CACHE, "ejerlav-hb", `${VD}/Matriklen_gaeldende/MapServer/13/query?where=1%3D1&outFields=EjerlavsNavn&maxAllowableOffset=0.0001&${q}`)).features;
  const O = [+((HB[0] + HB[2]) / 2).toFixed(3), +((HB[1] + HB[3]) / 2).toFixed(3)], d2r = Math.PI / 180, kx = d2r * 6371000 * Math.cos(O[1] * d2r), ky = d2r * 6371000;
  const m = ([x, y]) => [(x - O[0]) * kx, (O[1] - y) * ky], inM = g => polysOf(g).map(p => p.map(r => r.map(m)));
  const bb = mp => { let a = [Infinity, Infinity, -Infinity, -Infinity]; mp.forEach(p => p[0].forEach(([x, y]) => { a = [Math.min(a[0], x), Math.min(a[1], y), Math.max(a[2], x), Math.max(a[3], y)]; })); return a; };
  const inside = ([x, y], mp) => mp.some(p => { let c = false; for (const r of p) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; });
  const [bx0, by1] = m([HB[0], HB[1]]), [bx1, by0] = m([HB[2], HB[3]]), frame = [[[[bx0, by0], [bx1, by0], [bx1, by1], [bx0, by1], [bx0, by0]]]];
  const pc = require("./node_modules/polygon-clipping");
  const S = sogne.map(f => { const g = inM(f.geometry); return { n: f.properties.Navn, g, b: bb(g) }; });
  const K = kom.map(k => { const g = inM(k.geometry); return { n: k.properties.Navn, g, b: bb(g) }; }).filter(k => k.b[0] < bx1 && k.b[2] > bx0 && k.b[1] < by1 && k.b[3] > by0);
  const at = (L, p) => L.find(k => p[0] >= k.b[0] && p[0] <= k.b[2] && p[1] >= k.b[1] && p[1] <= k.b[3] && inside(p, k.g));
  const F = fields.map(f => { const g = inM(f.geometry), b = bb(g), mid = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; return { g, mid, ha: Number(f.properties.IMK_areal) || polyHa(g) }; })
    .filter(f => f.mid[0] > bx0 && f.mid[0] < bx1 && f.mid[1] > by0 && f.mid[1] < by1).map(f => ({ ...f, s: at(S, f.mid), k: at(K, f.mid) })).filter(f => f.s);
  const pdoOf = n => PDO.filter(P => (P.parishes || []).includes(n)).map(P => P.ap);
  const climats = [];
  for (const s of S) { const fs_ = F.filter(f => f.s === s); if (!fs_.length) continue;
    const gg = tidy(union(fs_.flatMap(f => f.g)), 1.5), muns = [...new Set(fs_.map(f => f.k && f.k.n).filter(Boolean))], ha = fs_.reduce((a, f) => a + f.ha, 0), pd = pdoOf(s.n);
    climats.push({ id: slug(dk(s.n)), n: s.n, c: "DV", ap: muns[0] || "", app: s.n, area: muns[0] || "", fields: fs_.length, ha: +ha.toFixed(1),
      ...(pd.length ? { pdo: Object.fromEntries(pd.map(k => [k, +ha.toFixed(1)])) } : {}), lp: label(gg), g: gg, hit: tidy(s.g, 40).filter(p => polyHa([p]) > 5), aka: [s.n, dk(s.n), s.n + " sogn"] });
  }
  const land = pc.intersection(union(K.flatMap(k => k.g)), frame);
  const villages = PDO.filter(P => P.parishes).map(P => { const g = union(S.filter(s => P.parishes.includes(s.n)).flatMap(s => s.g)), cut = g.length ? pc.intersection(g, frame) : [];
    return { ap: P.ap, kind: "pdo", status: P.status, year: P.year, wines: P.wines, grapes: P.grapes, ha: +polyHa(g).toFixed(0), g: tidy(cut, 10) }; }).filter(v => v.g.length);
  // the topo layer: towns and villages from the cadastre's districts, the towns' cores drawn
  const names = [], towns = [], area = g => polyHa(g);
  for (const f of lav) { const nm = String(f.properties.EjerlavsNavn || ""), g = inM(f.geometry); if (!g.length) continue;
    const town = nm.match(/^(.+?) Bygrunde$/), vil = nm.match(/^(.+?) By, (.+)$/), b = bb(g), c = [Math.round((b[0] + b[2]) / 2), Math.round((b[1] + b[3]) / 2)];
    if (c[0] < bx0 || c[0] > bx1 || c[1] < by0 || c[1] > by1) continue;
    if (town) { names.push([1, town[1].replace(/ S\.$/, " Sj."), c[0], c[1]]); tidy(g, 8).forEach(p => towns.push(p[0])); }
    else if (vil) names.push([post.includes(vil[1]) || post.includes(vil[1].replace(/^Store /, "St. ")) ? 2 : 3, vil[1], c[0], c[1]]); }
  // Njord, by its address (njordvingaard.dk: Sophienholmvej 57, Tølløse), placed on Sophienholmvej as OpenStreetMap has it
  const nj = m([11.6975, 55.622]); names.push(["v", "● Njord", Math.round(nj[0]), Math.round(nj[1])]);
  const flat = r => r.flatMap(([x, y], i) => i ? [Math.round(x - r[i - 1][0]), Math.round(y - r[i - 1][1])] : [Math.round(x), Math.round(y)]);
  const topo = { meta: { id: "holbaek", built: new Date().toISOString().slice(0, 10), delta: true,
    source: "Town and village names and towns: Matriklen (ejerlav), © Styrelsen for Dataforsyning og Infrastruktur (free geographic data) [data edited]; Njord's road: © OpenStreetMap contributors (ODbL)" },
    roads: [], rail: [], water: [], lakes: [], woods: [], names: names.sort((a, b) => String(a[0]).localeCompare(String(b[0])) || a[1].localeCompare(b[1], "da")), towns: towns.map(flat) };
  fs.writeFileSync(path.join(__dirname, "..", "atlas-holbaek-topo.js"), `// Generated by tools/region-build.js holbaek — do not edit by hand.\nwindow.ATLAS_TOPO = window.ATLAS_TOPO || {};\nwindow.ATLAS_TOPO["holbaek"] = ${JSON.stringify(topo)};\n`);
  log.forEach(l => console.error("  · " + l));
  console.error(`  ${F.length} vine fields in ${climats.length} parishes, ${F.reduce((s, f) => s + f.ha, 0).toFixed(1)} ha; ${names.length} place names (${names.filter(n => n[0] === 1).map(n => n[1]).join(", ")})`);
  return { climats, villages, regionalLand: land, meta: { proj: "eq", origin: O, l93: null, shade: "none", fieldsYear: 2025, unit: "parishes",
    notes: ["Njord: Sune Albertsen's vineyard by Tølløse, about 10 km south of Holbæk, founded in 2010: some 5 ha on south-facing hills of sand and gravel, mostly Pinot Noir Précoce (Frühburgunder), farmed on organic and biodynamic principles.", "Njord's vines aren't in the field map: none of its fields is declared as vines, so it is marked by its address on Sophienholmvej."],
    source: "Vines: Landbrugsstyrelsen (Styrelsen for Grøn Arealomlægning og Vandmiljø), Marker 2025, crop 530 Vindrue; parishes and municipalities: DAGI, Styrelsen for Dataforsyning og Infrastruktur (free geographic data) [data edited]; the PDOs' parishes: Fødevarestyrelsen's product specifications; town and village names: Matriklen (SDFI)" } };
}
module.exports = { denmarkBuild, holbaekBuild, areaOf };
