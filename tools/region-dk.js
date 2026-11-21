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
  "Holbæk": ["Njord: Sune Albertsen's vineyard about 10 km south of Holbæk, founded in 2010, known for its Pinot Noir Précoce (Frühburgunder).",
    "Tuse Næs, north of the town, is inside the parishes of the proposed Odsherred PDO."],
};
const dk = s => String(s).replace(/æ/g, "ae").replace(/Æ/g, "Ae").replace(/ø/g, "oe").replace(/Ø/g, "Oe").replace(/å/g, "aa").replace(/Å/g, "Aa");

async function get(curl, CACHE, name, url) {
  const file = path.join(CACHE, `dk-${name}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const d = JSON.parse(await curl(url)); // the field map answers in ISO-8859-1: its crop names may garble, only numbers are kept if (d.error) throw new Error(name + ": " + JSON.stringify(d.error));
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
      munHa: +polyHa(k.g).toFixed(0), ...(Object.keys(inPdo).length ? { pdo: inPdo } : {}), ...(NOTES[k.n] ? { notes: NOTES[k.n] } : {}), lp: label(gg), g: gg, aka: [k.n, dk(k.n)] });
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
module.exports = { denmarkBuild, areaOf };
