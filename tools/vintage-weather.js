#!/usr/bin/env node
// Météo-France daily station data (Côte d'Or) → per-vintage weather for the atlas's vintage view.
//
//   node tools/vintage-weather.js <folder with Q_21_*_RR-T-Vent.csv.gz and Q_21_*_autres-parametres.csv.gz>
//
// The files are Météo-France's open "données climatologiques de base quotidiennes" for department 21
// (meteo.data.gouv.fr / object.files.data.gouv.fr/meteofrance, Licence Ouverte). Dijon-Longvic is the reference
// (complete 1950–today); the vineyard stations add local readings where they have them: Marsannay-la-Côte for the
// Côte de Nuits, Savigny-lès-Beaune for the Côte de Beaune.
//
// Per year and station: growing-season (Apr–Sep) mean temperature and its anomaly against 1991–2020, the Huglin
// index, days ≥ 30 °C and ≥ 35 °C, Apr–Sep and September rain, spring frost nights (Tmin ≤ −1 °C, 1 Apr–15 May)
// with the latest date, and days with hail reported (Apr–Sep). Writes vintage-weather.json next to the inputs.
"use strict";
const fs = require("fs"), path = require("path"), zlib = require("zlib");
const DIR = path.resolve(process.argv[2] || ".");
const STATIONS = { "21473001": "dijon", "21390001": "marsannay", "21590001": "savigny", "21010001": "aloxe" };

const days = {}; // station -> date -> {rr,tn,tx,tm,hail}
const rows = (file, f) => {
  const txt = zlib.gunzipSync(fs.readFileSync(file)).toString("latin1").split("\n"), head = txt[0].split(";");
  const ix = Object.fromEntries(head.map((h, i) => [h.trim(), i]));
  for (let i = 1; i < txt.length; i++) { const r = txt[i].split(";"); if (r.length < 6 || !STATIONS[r[0]]) continue; f(r, ix); }
};
const num = v => v === undefined || v === "" ? null : +v;
fs.readdirSync(DIR).filter(f => /RR-T-Vent\.csv\.gz$/.test(f)).forEach(f => rows(path.join(DIR, f), (r, ix) => {
  const st = STATIONS[r[0]], d = r[ix.AAAAMMJJ], o = ((days[st] ||= {})[d] ||= {});
  o.rr = num(r[ix.RR]); o.tn = num(r[ix.TN]); o.tx = num(r[ix.TX]); o.tm = num(r[ix.TM]) ?? (o.tn != null && o.tx != null ? (o.tn + o.tx) / 2 : null);
}));
fs.readdirSync(DIR).filter(f => /autres-parametres\.csv\.gz$/.test(f)).forEach(f => rows(path.join(DIR, f), (r, ix) => {
  const st = STATIONS[r[0]], d = r[ix.AAAAMMJJ], g = num(r[ix.GRELE]);
  if (g != null) ((days[st] ||= {})[d] ||= {}).hail = g;
}));

function season(st, y) {
  const D = days[st] || {}, get = (m, d) => D[`${y}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`];
  const dim = m => new Date(y, m, 0).getDate();
  let n = 0, tsum = 0, hug = 0, h30 = 0, h35 = 0, rain = 0, rainN = 0, sep = 0, sepN = 0, frost = 0, lastFrost = null, hail = 0, hailN = 0, minSpring = null;
  for (let m = 4; m <= 9; m++) for (let d = 1; d <= dim(m); d++) {
    const o = get(m, d); if (!o) continue;
    if (o.tm != null && o.tx != null) { n++; tsum += o.tm; hug += Math.max(0, ((o.tm - 10) + (o.tx - 10)) / 2); }
    if (o.tx != null && m >= 6 && m <= 8) { if (o.tx >= 30) h30++; if (o.tx >= 35) h35++; }
    if (o.rr != null) { rain += o.rr; rainN++; if (m === 9) { sep += o.rr; sepN++; } }
    if (o.tn != null && (m === 4 || (m === 5 && d <= 15))) { if (minSpring == null || o.tn < minSpring) minSpring = o.tn; if (o.tn <= -1) { frost++; lastFrost = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`; } }
    if (o.hail != null) { hailN++; if (o.hail > 0) hail++; }
  }
  if (n < 160) return null; // need most of the 183 days for a fair season figure
  const r1 = x => Math.round(x * 10) / 10;
  return { tgs: r1(tsum / n), huglin: Math.round(hug * 1.05), h30, h35, rain: rainN > 170 ? Math.round(rain) : null, sep: sepN > 27 ? Math.round(sep) : null,
    frost, lastFrost, minSpring: minSpring == null ? null : r1(minSpring), hail: hailN > 100 ? hail : null };
}

const out = { meta: { source: "Météo-France, données climatologiques de base quotidiennes (Côte-d'Or), Licence Ouverte", built: new Date().toISOString().slice(0, 10),
  stations: { dijon: "Dijon-Longvic (219 m, reference)", marsannay: "Marsannay-la-Côte (280 m, Côte de Nuits)", savigny: "Savigny-lès-Beaune (246 m, Côte de Beaune)", aloxe: "Aloxe-Corton (273 m)" },
  fields: { tgs: "Apr–Sep mean °C", anom: "vs 1991–2020", huglin: "Huglin index", h30: "days ≥30 °C Jun–Aug", h35: "days ≥35 °C", rain: "Apr–Sep rain mm", sep: "September rain mm",
    frost: "nights ≤ −1 °C, 1 Apr–15 May", lastFrost: "latest of those", minSpring: "coldest spring night °C", hail: "days with hail reported Apr–Sep" } }, years: {} };
const ys = []; for (let y = 1950; y <= new Date().getFullYear(); y++) ys.push(y);
Object.values(STATIONS).forEach(st => {
  const per = Object.fromEntries(ys.map(y => [y, season(st, y)]).filter(([, v]) => v));
  const norm = ys.filter(y => y >= 1991 && y <= 2020 && per[y]).map(y => per[y].tgs);
  const base = norm.length >= 20 ? norm.reduce((a, b) => a + b, 0) / norm.length : null;
  Object.entries(per).forEach(([y, v]) => { if (base != null) v.anom = Math.round((v.tgs - base) * 10) / 10; ((out.years[y] ||= {})[st] = v); });
  console.log(`${st}: ${Object.keys(per).length} seasons${base != null ? `, 1991–2020 Apr–Sep mean ${base.toFixed(2)} °C` : ""}`);
});
fs.writeFileSync(path.join(DIR, "vintage-weather.json"), JSON.stringify(out));
for (const y of [2003, 2016, 2019, 2020, 2021, 2022, 2024, 2025]) if (out.years[y]) console.log(y, JSON.stringify(out.years[y].dijon), out.years[y].savigny ? "savigny frost " + out.years[y].savigny.frost + " last " + out.years[y].savigny.lastFrost : "");
