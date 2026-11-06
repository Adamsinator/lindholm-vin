#!/usr/bin/env node
// Daily station weather → each atlas region's growing seasons, one small file per region (atlas-<id>-wx.js).
//
//   node tools/region-weather.js <Météo-France folder> <DWD folder> [region …]
//
// Météo-France: the open "données climatologiques de base quotidiennes", per département (Q_<dd>_*_RR-T-Vent.csv.gz,
// Q_<dd>_*_autres-parametres.csv.gz for hail; meteo.data.gouv.fr, Licence Ouverte 2.0).
// DWD: the daily climate records (opendata.dwd.de/climate_environment/CDC/observations_germany/climate/daily/kl,
// tageswerte_KL_<id>_*_hist.zip and _akt.zip; CC BY 4.0, "Datenbasis: Deutscher Wetterdienst").
// The Côte d'Or keeps its own file (tools/vintage-weather.js → burgundy-vintages.js), with the same figures.
//
// Per year and station, April–September: mean temperature and its difference from the station's own 1991–2020
// mean, the Huglin index (latitude factor k), days ≥ 30 °C and ≥ 35 °C (June–August), rain and September's rain,
// spring frost nights (Tmin ≤ −1 °C, 1 April–15 May) with the latest of them and the coldest, and days hail was
// reported (Météo-France's manned stations only). A season needs 160 of its 183 days; a sum missing a few days is
// scaled up to the whole season.
"use strict";
const fs = require("fs"), path = require("path"), zlib = require("zlib"), { execFileSync } = require("child_process");
const [MF, DWD, ...ONLY] = process.argv.slice(2);
if (!MF || !DWD) { console.error("usage: node tools/region-weather.js <Météo-France folder> <DWD folder> [region …]"); process.exit(1); }

// the stations: the first is the region's reference (its warming chart); all have long, near-complete records in
// or next to the vineyards. lat for the Huglin factor.
const REG = {
  chablis: [["mf", "89068001", "Chablis", 141, 47.82]],
  chalonnaise: [["mf", "71464001", "Saint-Maurice-lès-Couches", 300, 46.88]],
  maconnais: [["mf", "71105001", "Mâcon", 219, 46.29]],
  champagne: [["mf", "51242001", "Fagnières (Châlons)", 105, 48.94]],
  alsace: [["mf", "68205001", "Colmar-Meyenheim", 207, 47.93], ["mf", "68066001", "Colmar (INRAE)", 202, 48.06]],
  bordeaux: [["mf", "33281001", "Bordeaux-Mérignac", 47, 44.83], ["mf", "33314005", "Pauillac", 26, 45.21]],
  rhone: [["mf", "26295001", "Saint-Barthélemy-de-Vals", 203, 45.17]],
  beaujolais: [["mf", "69264001", "Villefranche-sur-Saône", 174, 45.99]],
  rhonesud: [["mf", "84087001", "Orange", 57, 44.14], ["mf", "84031001", "Carpentras", 98, 44.08]],
  centreloire: [["mf", "18033001", "Bourges", 161, 47.06]],
  touraine: [["mf", "37179001", "Tours", 108, 47.44], ["mf", "49328001", "Saumur", 69, 47.25]],
  anjou: [["mf", "49020001", "Angers-Beaucouzé", 50, 47.48], ["mf", "49328001", "Saumur", 69, 47.25]],
  jura: [["mf", "39362001", "Lons-le-Saunier", 298, 46.69]],
  provence: [["mf", "13001009", "Aix-en-Provence", 173, 43.53], ["mf", "83035001", "Le Castellet", 417, 43.25]],
  mosel: [["dwd", "05100", "Trier-Petrisberg", 261, 49.75]],
  nahe: [["dwd", "04301", "Bad Kreuznach", 102, 49.85]],
  pfalz: [["dwd", "01072", "Bad Dürkheim", 107, 49.47]],
  rheinhessen: [["dwd", "00150", "Alzey", 215, 49.73], ["dwd", "05692", "Worms", 88, 49.61]],
  mittelrhein: [["dwd", "01580", "Geisenheim (Rheingau, by Bingen)", 111, 49.99]],
  ahr: [["dwd", "03490", "Bad Neuenahr-Ahrweiler", 111, 50.53]],
};
const SRC = { mf: "Météo-France, données climatologiques de base quotidiennes (Licence Ouverte 2.0)", dwd: "Deutscher Wetterdienst, Climate Data Center (CC BY 4.0)" };
// Huglin's latitude factor: 1.02 at 40–42° to 1.06 at 48–50°
const kOf = lat => lat < 42 ? 1.02 : lat < 44 ? 1.03 : lat < 46 ? 1.04 : lat < 48 ? 1.05 : 1.06;

const num = v => { if (v === undefined) return null; v = String(v).trim(); return v === "" || v === "-999" ? null : +v; };
const cache = {}; // "mf:id" / "dwd:id" -> date -> {rr,tn,tx,tm,hail}
function mfDays(id) {
  const dep = id.slice(0, 2), D = {}, files = fs.readdirSync(MF).filter(f => f.startsWith(`Q_${dep}_`) && !/avant-1949/.test(f)).sort();
  if (!files.length) throw new Error(`no Météo-France files for département ${dep} in ${MF}`);
  const each = (f, cb) => { const txt = zlib.gunzipSync(fs.readFileSync(path.join(MF, f))).toString("latin1").split("\n"), ix = Object.fromEntries(txt[0].split(";").map((h, i) => [h.trim(), i]));
    for (let i = 1; i < txt.length; i++) { if (!txt[i].startsWith(id + ";")) continue; cb(txt[i].split(";"), ix); } };
  files.filter(f => /RR-T-Vent/.test(f)).forEach(f => each(f, (r, ix) => { const o = (D[r[ix.AAAAMMJJ]] ||= {});
    o.rr = num(r[ix.RR]); o.tn = num(r[ix.TN]); o.tx = num(r[ix.TX]); o.tm = num(r[ix.TM]) ?? (o.tn != null && o.tx != null ? (o.tn + o.tx) / 2 : null); }));
  files.filter(f => /autres-parametres/.test(f)).forEach(f => each(f, (r, ix) => { const g = num(r[ix.GRELE]); if (g != null) (D[r[ix.AAAAMMJJ]] ||= {}).hail = g; }));
  return D;
}
function dwdDays(id) {
  const D = {}, files = fs.readdirSync(DWD).filter(f => f.startsWith(`tageswerte_KL_${id}_`)).sort((a, b) => /_akt/.test(a) - /_akt/.test(b)); // historical first, then recent
  if (!files.length) throw new Error(`no DWD files for station ${id} in ${DWD}`);
  files.forEach(f => { const zip = path.join(DWD, f), list = execFileSync("unzip", ["-Z1", zip]).toString().split("\n"), prod = list.find(n => /^produkt_klima_tag/.test(n));
    const txt = execFileSync("unzip", ["-p", zip, prod], { maxBuffer: 1 << 28 }).toString("latin1").split("\n"), ix = Object.fromEntries(txt[0].split(";").map((h, i) => [h.trim(), i]));
    for (let i = 1; i < txt.length; i++) { const r = txt[i].split(";"); if (r.length < 10) continue; const d = r[ix.MESS_DATUM].trim();
      if (D[d] && /_akt/.test(f)) continue; // the checked historical record wins where both have the day
      const tn = num(r[ix.TNK]), tx = num(r[ix.TXK]); D[d] = { rr: num(r[ix.RSK]), tn, tx, tm: num(r[ix.TMK]) ?? (tn != null && tx != null ? (tn + tx) / 2 : null) }; } });
  return D;
}
const days = (src, id) => cache[src + ":" + id] ||= (src === "mf" ? mfDays(id) : dwdDays(id));

const r1 = x => Math.round(x * 10) / 10;
function season(D, y, k) {
  const p2 = n => String(n).padStart(2, "0"), dim = m => new Date(y, m, 0).getDate();
  let n = 0, tsum = 0, hug = 0, h30 = 0, h35 = 0, hN = 0, rain = 0, rainN = 0, sep = 0, sepN = 0, frost = 0, lastFrost = null, minSpring = null, hail = 0, hailN = 0;
  for (let m = 4; m <= 9; m++) for (let d = 1; d <= dim(m); d++) {
    const o = D[`${y}${p2(m)}${p2(d)}`]; if (!o) continue;
    if (o.tm != null && o.tx != null) { n++; tsum += o.tm; hug += Math.max(0, ((o.tm - 10) + (o.tx - 10)) / 2); }
    if (o.tx != null && m >= 6 && m <= 8) { hN++; if (o.tx >= 30) h30++; if (o.tx >= 35) h35++; }
    if (o.rr != null) { rain += o.rr; rainN++; if (m === 9) { sep += o.rr; sepN++; } }
    if (o.tn != null && (m === 4 || (m === 5 && d <= 15))) { if (minSpring == null || o.tn < minSpring) minSpring = o.tn; if (o.tn <= -1) { frost++; lastFrost = `${p2(m)}-${p2(d)}`; } }
    if (o.hail != null) { hailN++; if (o.hail > 0) hail++; }
  }
  if (n < 160) return null;
  return { tgs: r1(tsum / n), hug: Math.round(hug * k * 183 / n), h30: hN >= 85 ? Math.round(h30 * 92 / hN) : null, h35: hN >= 85 ? Math.round(h35 * 92 / hN) : null,
    rain: rainN >= 170 ? Math.round(rain * 183 / rainN) : null, sep: sepN >= 27 ? Math.round(sep * 30 / sepN) : null,
    frost, lf: lastFrost, tmin: minSpring == null ? null : r1(minSpring), hail: hailN >= 150 ? hail : null };
}

const F = ["tgs", "anom", "hug", "h30", "h35", "rain", "sep", "frost", "lf", "tmin", "hail"];
const now = new Date(), Y1 = now.getFullYear() - (now.getMonth() < 9 ? 1 : 0); // a season counts once October has come
const built = now.toISOString().slice(0, 10);
let total = 0;
Object.entries(REG).filter(([r]) => !ONLY.length || ONLY.includes(r)).forEach(([r, stations]) => {
  const out = { meta: { built, k: {}, src: [...new Set(stations.map(s => SRC[s[0]]))] }, st: [], f: F, y: {} };
  stations.forEach(([src, id, n, alt, lat], i) => {
    const D = days(src, id), k = kOf(lat), per = {};
    for (let y = 1950; y <= Y1; y++) { const s = season(D, y, k); if (s) per[y] = s; }
    const nm = Object.keys(per).filter(y => y >= 1991 && y <= 2020).map(y => per[y].tgs), mean = nm.length >= 24 ? nm.reduce((a, b) => a + b, 0) / nm.length : null;
    Object.values(per).forEach(s => s.anom = mean == null ? null : r1(s.tgs - mean));
    const ys = Object.keys(per).map(Number);
    if (!ys.length) throw new Error(`${r}: ${n} (${id}) has no complete season`);
    out.st.push({ n, alt, src, id, from: Math.min(...ys), norm: mean == null ? null : r1(mean), k });
    out.y[i] = Object.fromEntries(ys.map(y => [y, F.map(f => per[y][f] ?? null)]));
    // sanity: a season's mean must be a temperature a vineyard has; Huglin between 1000 (cool) and 3500 (hot)
    Object.entries(per).forEach(([y, s]) => { if (s.tgs < 10 || s.tgs > 25 || s.hug < 900 || s.hug > 3600) throw new Error(`${r} ${n} ${y}: implausible season ${JSON.stringify(s)}`); });
    console.log(`${r.padEnd(12)} ${n.padEnd(34)} ${ys.length} seasons ${Math.min(...ys)}–${Math.max(...ys)}${mean == null ? " · no 1991–2020 normal" : ` · normal ${r1(mean)} °C`} · ${Y1}: ${per[Y1] ? per[Y1].tgs + " °C, Huglin " + per[Y1].hug : "—"}`);
  });
  const body = `// Generated by tools/region-weather.js — do not edit by hand.\n(window.ATLAS_WX ||= {})[${JSON.stringify(r)}] = ${JSON.stringify(out)};\n`;
  fs.writeFileSync(path.join(__dirname, "..", `atlas-${r}-wx.js`), body); total += body.length;
});
console.log(`wrote ${Math.round(total / 1024)} KB`);
