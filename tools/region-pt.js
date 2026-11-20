// Portugal for tools/region-build.js: the Douro (Região Demarcada do Douro). Its statute (Decreto-Lei 173/2009, annex
// I, as republished by Decreto-Lei 97/2020, article 3) lists the parishes of its three sub-regions as they were in
// 1921; the parishes are drawn from DGT's CAOP 2025 (CC BY 4.0), where a parish merged since 2013 ("União das
// freguesias de …") is drawn whole and says which of its old parishes the statute doesn't name. The vines are DGT's
// land-use map, COS 2023 (class 2.2.1.1 Vinhas, CC BY 4.0), inside those parishes; one site a municipality and
// sub-region. Estates the statute names one by one (in Lamego, Mirandela and Vila Flor) are listed, not drawn.
"use strict";
const fs = require("fs"), path = require("path");
const API = "https://ogcapi.dgterritorio.gov.pt/collections", BBOX = "-8.05,40.85,-6.65,41.55";
// the statute's list: sub-region → municipality → its parishes ("*" the whole municipality)
const DOURO = {
  "Baixo Corgo": { "Mesão Frio": "*", "Peso da Régua": "*", "Santa Marta de Penaguião": "*",
    "Vila Real": "Abaças|Ermida|Folhadela|Guiães|Mateus|Nogueira|Nossa Senhora da Conceição|Parada de Cunhos|São Dinis|São Pedro",
    "Armamar": "Aldeias|Armamar|Folgosa|Fontelo|Santo Adrião|Vacalar|Vila Seca",
    "Lamego": "Cambres|Ferreiros de Avões|Figueira|Parada do Bispo|Penajoia|Samodães|Sande|Santa Maria de Almacave|Sé|Valdigem",
    "Resende": "Barrô" },
  "Cima Corgo": { "Alijó": "Alijó|Amieiro|Carlão|Casal de Loivos|Castedo|Cotas|Favaios|Pegarinhos|Pinhão|Sanfins do Douro|Santa Eugénia|São Mamede de Riba Tua|Vale de Mendiz|Vilar de Maçada|Vilarinho de Cotas",
    "Murça": "Candedo|Murça|Noura",
    "Sabrosa": "Celeirós|Covas do Douro|Gouvães do Douro|Gouvinhas|Paços|Paradela de Guiães|Provesende|Sabrosa|São Cristóvão do Douro|São Martinho de Anta|Souto Maior|Vilarinho de São Romão",
    "São João da Pesqueira": "Castanheiro do Sul|Espinhosa|Ervedosa do Douro|Nagozelo do Douro|Paredes da Beira|São João da Pesqueira|Soutelo do Douro|Trevões|Vale de Figueira|Valongo dos Azeites|Várzea de Trevões|Vilarouco",
    "Tabuaço": "Adorigo|Barcos|Desejosa|Granjinha|Pereiro|Santa Leocádia|Sendim|Tabuaço|Távora|Valença do Douro",
    "Carrazeda de Ansiães": "Beira Grande|Castanheiro do Norte|Carrazeda de Ansiães|Lavandeira|Linhares|Parambos|Pereiros|Pinhal do Norte|Pombal|Ribalonga|Seixo de Ansiães|Vilarinho de Castanheira" },
  "Douro Superior": { "Alfândega da Fé": "Vilarelhos", "Freixo de Espada à Cinta": "Freixo de Espada à Cinta|Ligares|Mazouco|Poiares",
    "Torre de Moncorvo": "Açoreira|Adeganha|Cabeça Boa|Horta|Lousa|Peredo dos Castelhanos|Torre de Moncorvo|Urros",
    "Vila Flor": "Assares|Freixiel|Lodões|Roios|Sampaio|Santa Comba da Vilariça|Seixo de Manhoses|Vale Frechoso|Vilarinho das Azenhas|Vila Flor",
    "Figueira de Castelo Rodrigo": "Escalhão", "Mêda": "Fontelonga|Longroiva|Meda|Poço do Canto", "Vila Nova de Foz Côa": "*" },
};
const ESTATES = ["Quintas de Foutoura, do Prado and das Várzeas (Várzea de Abrunhais, Lamego)", "Properties in Frechas, Avantos, Carvalhais and Romeu (Mirandela)",
  "Quintas da Peça and das Trigueiras and the properties of Vimieiro (Vilas Boas, Vila Flor)"];
const PART = { "Nossa Senhora da Conceição": "only in part" }; // as the statute says
// the statute's 1921 names as today's parishes have them (a spelling, or a town's parishes now one)
const ALIAS = { "nossa senhora da conceicao": "vila real", "sao dinis": "vila real", "sao pedro": "vila real", "santa maria de almacave": "almacave",
  "sao mamede de riba tua": "sao mamede de ribatua", "sao martinho de anta": "sao martinho de antas", "vilarinho de castanheira": "vilarinho da castanheira",
  "horta": "horta da vilarica", "santa comba da vilarica": "santa comba de vilarica", "fontelonga": "fonte longa" };
const norm = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
// a parish's old parishes: "União das freguesias de A, B e C", "Vila Real (Nossa Senhora da Conceição, São Pedro e São Dinis)"
const parts = n => { const m = n.match(/\(([^)]+)\)/); const s = (m ? m[1] : n).replace(/^União das freguesias de /i, "");
  return s.split(/,\s*|\s+e\s+/).map(x => x.trim()).filter(Boolean); };

async function all(curl, CACHE, name, q) {
  const file = path.join(CACHE, `pt-${name}.json`); if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const out = [];
  for (let off = 0; ; off += 100) { const d = JSON.parse(await curl(`${API}/${q}&f=json&limit=100&offset=${off}&bbox=${BBOX}`)); out.push(...d.features);
    process.stderr.write(`  ${name}: ${out.length}/${d.numberMatched}\n`); if (d.features.length < 100) break; }
  fs.writeFileSync(file, JSON.stringify(out)); return out;
}
async function douroBuild(H) {
  const { CACHE, curl, polysOf, union, tidy, polyHa, label, slug } = H, log = [];
  const fregs = await all(curl, CACHE, "freguesias", "freguesias/items?"), vines = await all(curl, CACHE, "vinhas-2023", "cos2023v1/items?cos23_n4_c=2.2.1.1");
  // the statute's parishes in today's: each today's parish whose old parishes include one the statute lists
  const groups = []; // { sub, mun, fregs: [{ f, extra: [old parishes not listed] }] }
  for (const [sub, muns] of Object.entries(DOURO)) for (const [mun, list] of Object.entries(muns)) {
    const inMun = fregs.filter(f => norm(f.properties.municipio) === norm(mun)); if (!inMun.length) { log.push(`no municipality ${mun}`); continue; }
    const asked = list === "*" ? null : list.split("|"), want = asked && asked.map(x => ALIAS[norm(x)] || norm(x)), got = [], found = new Set();
    for (const f of inMun) { const ps = parts(f.properties.freguesia), hit = want ? ps.filter(p => want.includes(norm(p))) : ps;
      if (!hit.length) continue; hit.forEach(p => found.add(norm(p)));
      const olds = asked ? asked.filter(x => hit.some(p => norm(p) === (ALIAS[norm(x)] || norm(x)))) : hit;
      got.push({ f, name: f.properties.freguesia, extra: want ? ps.filter(p => !want.includes(norm(p))) : [], part: olds.filter(p => PART[p]) }); }
    if (want) want.filter(w => !found.has(w)).forEach(w => log.push(`${mun}: no parish ${w}`));
    groups.push({ sub, mun, fregs: got });
  }
  // to metres round the middle
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  groups.forEach(g => g.fregs.forEach(({ f }) => polysOf(f.geometry).forEach(p => p[0].forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }))));
  const O = [+((x0 + x1) / 2).toFixed(4), +((y0 + y1) / 2).toFixed(4)], d2r = Math.PI / 180, kx = d2r * 6371000 * Math.cos(O[1] * d2r), ky = d2r * 6371000;
  const m = ([x, y]) => [(x - O[0]) * kx, (O[1] - y) * ky], inM = g => polysOf(g).map(p => p.map(r => r.map(m)));
  const bb = mp => { let a = [Infinity, Infinity, -Infinity, -Infinity]; mp.forEach(p => p[0].forEach(([x, y]) => { a = [Math.min(a[0], x), Math.min(a[1], y), Math.max(a[2], x), Math.max(a[3], y)]; })); return a; };
  const meet = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
  const V = vines.flatMap(v => inM(v.geometry)).map(p => ({ p, b: bb([p]) }));
  const pc = require("./node_modules/polygon-clipping");
  const climats = [], zones = {};
  for (const g of groups) { if (!g.fregs.length) continue;
    const land = union(g.fregs.flatMap(({ f }) => inM(f.geometry))), lb = bb(land);
    (zones[g.sub] ||= []).push(...land);
    const cand = V.filter(v => meet(v.b, lb)).map(v => v.p), mp = cand.length ? pc.intersection(land, cand.length > 1 ? union(cand) : cand) : [];
    const gg = tidy(mp, 4), ha = polyHa(mp); if (!gg.length) { log.push(`${g.mun} (${g.sub}): no vines on COS 2023`); continue; }
    const whole = g.fregs.filter(x => x.extra.length).map(x => `${x.name} (also ${x.extra.join(", ")})`), part = g.fregs.flatMap(x => x.part);
    climats.push({ id: slug(g.mun + (Object.values(DOURO).filter(s => s[g.mun]).length > 1 ? " " + g.sub : "")), n: g.mun, c: "DV", ap: "Douro DOC", app: g.mun, area: g.sub,
      parishes: g.fregs.map(x => x.name), ...(whole.length ? { whole } : {}), ...(part.length ? { part } : {}), parishHa: +polyHa(land).toFixed(0),
      ha: +ha.toFixed(1), lp: label(gg), g: gg, aka: [g.mun] });
  }
  const villages = Object.entries(zones).map(([z, ps]) => { const mp = union(ps); return { ap: z, ha: +polyHa(mp).toFixed(0), g: tidy(mp, 40) }; });
  log.forEach(l => console.error("  · " + l));
  return { climats, villages, regionalLand: [], meta: { proj: "eq", origin: O, l93: null, shade: "none", estates: ESTATES,
    source: "Parishes: the Douro's statute (Decreto-Lei 173/2009, annex I, art. 3, as republished by Decreto-Lei 97/2020), drawn from DGT's CAOP 2025; vines: DGT, COS 2023 (class 2.2.1.1 Vinhas); both CC BY 4.0 [data edited]" } };
}
module.exports = { douroBuild, parts };
