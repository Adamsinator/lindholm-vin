// Test data for test accounts (a username starting with "test"; app.js loads this file only for them): fill the
// cellar with a number of bottles of real producers' wines, or download a messy sheet to try the import with, the way
// real lists come (merchant exports glued together, CellarTracker, hand-kept Excel). Also runs in Node,
// for the tests: TESTKIT.wines(n) and TESTKIT.messy(n) are plain functions.
(function (root) {
"use strict";

// a small seeded random, so the same numbers give the same cellar
function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

// The producers and their wines are real ones (test-data.js's list, the same as Account → Test data): only the
// vintages, the bottles, the prices and the places are made up.
const REAL = () => { const T = root.TESTDATA || (typeof require === "function" ? require("./test-data.js") : null); return T && T.REAL || []; };
const SOURCES = ["Juul's", "Holte Vinlager", "Kjær & Sommerfeldt", "Auktion", "Ved domænet", "Gave", ""];

// n bottles in the cellar, as the site's own rows (what api addmany takes): ~4 bottles a wine, a few already drunk,
// most with a price and a place, seven in ten with a drink window (the rest get the site's estimate)
function wines(n, seed = 2026) {
  const R = rng(seed), pick = a => a[Math.floor(R() * a.length)], L = REAL(); if (!L.length) throw new Error("test-data.js isn't loaded");
  const out = []; let left = n;
  while (left > 0) {
    const [producer, name, country, region, commune, classification, type, grape, lo, hi] = pick(L);
    const vintage = type === "Bobler" && R() < .5 ? "NV" : 1990 + Math.floor(R() * 34);
    const have = Math.min(left, pick([1, 1, 1, 2, 2, 3, 3, 6, 6, 12])), drunk = have > 1 && R() < .2 ? 1 : 0;
    const w = { producer, name, country, region, commune, grape, type, classification, vintage, qty: have + drunk, drunk,
      price: R() < .92 ? Math.round((lo + R() * (hi - lo)) / 5) * 5 : "",
      location: R() < .85 ? `Kælder, reol ${1 + Math.floor(R() * 12)}, hylde ${1 + Math.floor(R() * 8)}` : pick(["Køleskab", "Garage", ""]), source: pick(SOURCES) };
    if (typeof vintage === "number" && R() < .7) { w.drinkFrom = vintage + 3 + Math.floor(R() * 5); w.drinkTo = w.drinkFrom + 6 + Math.floor(R() * 20); }
    out.push(w); left -= have;
  }
  return out;
}

// A messy sheet of about n rows, as people's lists really come: headings in three languages and in odd words, the
// wine's name and vintage in one cell, prices as text ("1.234,50 kr.", "DKK 450", "450,-"), "6 fl." for bottles,
// regions spelt wrong and in capitals, stray spaces, a heading repeated where two exports were glued together,
// blank rows, #N/A cells, a picture and a link column, and a totals line at the end. → [[cell…]…] for EXPORT.
function messy(n, seed = 1855) {
  const R = rng(seed), pick = a => a[Math.floor(R() * a.length)];
  const HEAD = ["Vinproducent", "Wine / Cuvée", "Jahrgang", "Ant.", "Pris pr. fl.", "Country", "Region / Område", "Village", "Type", "Rebsorte", "Drink window", "Hvor?", "Notes", "Billede", "Link"];
  const SPELL = { Bourgogne: ["Bourgogne", "Burgundy", "BOURGOGNE", "bourgonge", "Bourgogne "], Bordeaux: ["Bordeaux", "bordeuax", "BORDEAUX"], Piemonte: ["Piemonte", "Piedmont", "Piemont"],
    Mosel: ["Mosel", "Moselle", "Mosel-Saar-Ruwer"], Champagne: ["Champagne", "champagne"], Rioja: ["Rioja", "RIOJA"], Rhône: ["Rhône", "Rhone", "Northern Rhone"] };
  const COUNTRY = { Frankrig: ["France", "Frankrig", "FR", "Frankreich"], Italien: ["Italy", "Italien"], Spanien: ["Spain", "Spanien", "España"], Tyskland: ["Germany", "Tyskland", "Deutschland"],
    Østrig: ["Austria", "Østrig"], Portugal: ["Portugal"], USA: ["USA", "United States"] };
  const TYPE = { Rød: ["Red", "Rød", "rot", "R"], Hvid: ["White", "Hvid", "weiss", "W"], Bobler: ["Sparkling", "Mousserende", "Champagne"], Rosé: ["Rosé", "Rose"], Hedvin: ["Port", "Hedvin"] };
  const price = p => p === "" ? pick(["", "#N/A", "-"]) : pick([`${p.toLocaleString("da-DK")},00 kr.`, `DKK ${p}`, `${p},-`, String(p), `kr ${p}`, `${p} DKK`]);
  const qty = q => pick([String(q), `${q} fl.`, `${q} btl`, `${q} bottles`, q]);
  const base = wines(n * 6, seed + 1), rows = [HEAD];
  for (let i = 0; rows.length < n && i < base.length; i++) {
    const w = base[i], ws = (s, k) => (R() < .12 ? String(s).toUpperCase() : String(s)) + (R() < .1 ? " " : ""); // shouting and stray spaces
    const nameCell = R() < .35 ? `${w.name}${w.name ? " " : ""}${w.vintage}` : w.name;     // the vintage in the name, sometimes
    const vintageCell = nameCell !== w.name ? "" : (w.vintage === "NV" ? pick(["NV", "n.v.", "", "Non-vintage"]) : R() < .08 ? `'${String(w.vintage).slice(2)}` : w.vintage);
    const win = w.drinkFrom ? pick([`${w.drinkFrom}-${w.drinkTo}`, `${w.drinkFrom}–${w.drinkTo}`, `${w.drinkFrom} - ${w.drinkTo}`]) : "";
    const row = [ws(w.producer), nameCell, vintageCell, qty(w.qty - w.drunk), price(w.price), pick(COUNTRY[w.country] || [w.country]), ws(pick(SPELL[w.region] || [w.region])),
      w.commune, pick(TYPE[w.type] || [w.type]), w.grape, win, w.location, R() < .1 ? pick(["gave fra far", "til nytår", "købt på auktion", "#N/A"]) : "", R() < .3 ? "IMG_" + (1000 + i) + ".jpg" : "", R() < .2 ? "https://example.com/w/" + i : ""];
    rows.push(row);
    if (R() < .06) rows.push(row.map((c, j) => j === 3 ? qty(1 + Math.floor(R() * 3)) : c)); // the same wine again, bought another time
    if (R() < .015) rows.push(HEAD.map(h => R() < .3 ? h.toUpperCase() : h));                // a heading where two lists were glued
    if (R() < .03) rows.push(HEAD.map(() => ""));                                            // a blank row
  }
  rows.push(["I alt", "", "", "", "", "", "", "", "", "", "", "", "", "", ""]);             // a totals line
  return rows;
}

// ── in the page: a "Test data" button by the others, and its dialog ──
// its words live here, not in the site's dictionaries: only test accounts load them
const WORDS = {
  "da": {
  "Test data": "Testdata",
  "A messy sheet to import": "Et rodet ark at importere",
  "A number from 1 to {0}": "Et tal fra 1 til {0}",
  "Add the bottles": "Tilføj flaskerne",
  "Adding… {0} of {1}": "Tilføjer… {0} af {1}",
  "Bottles to add": "Antal flasker",
  "Download .csv": "Hent .csv",
  "Download .xlsx": "Hent .xlsx",
  "Fill the cellar": "Fyld kælderen",
  "Headings in three languages, prices as text, “6 fl.”, regions spelt wrong, a heading repeated, blank rows, #N/A and a totals line: download it, then try it with Import.": "Overskrifter på tre sprog, priser som tekst, “6 fl.”, stavefejl i områderne, en gentaget overskrift, tomme rækker, #N/A og en totallinje: hent det, og prøv det så med Importér.",
  "Rows": "Rækker",
  "Stopped after {0} of {1} wines: {2}": "Stoppede efter {0} af {1} vine: {2}",
  "{0} bottles added": "{0} flasker tilføjet",
  "Close": "Luk"
  },
  "fr": {
  "Test data": "Données de test",
  "A messy sheet to import": "Une feuille en désordre à importer",
  "A number from 1 to {0}": "Un nombre de 1 à {0}",
  "Add the bottles": "Ajouter les bouteilles",
  "Adding… {0} of {1}": "Ajout… {0} sur {1}",
  "Bottles to add": "Bouteilles à ajouter",
  "Download .csv": "Télécharger .csv",
  "Download .xlsx": "Télécharger .xlsx",
  "Fill the cellar": "Remplir la cave",
  "Headings in three languages, prices as text, “6 fl.”, regions spelt wrong, a heading repeated, blank rows, #N/A and a totals line: download it, then try it with Import.": "Des en-têtes en trois langues, des prix en texte, « 6 fl. », des régions mal orthographiées, un en-tête répété, des lignes vides, des #N/A et une ligne de total : téléchargez-la, puis essayez-la avec Importer.",
  "Rows": "Lignes",
  "Stopped after {0} of {1} wines: {2}": "Arrêté après {0} vins sur {1} : {2}",
  "{0} bottles added": "{0} bouteilles ajoutées",
  "Close": "Fermer"
  },
  "de": {
  "Test data": "Testdaten",
  "A messy sheet to import": "Eine chaotische Tabelle zum Importieren",
  "A number from 1 to {0}": "Eine Zahl von 1 bis {0}",
  "Add the bottles": "Flaschen hinzufügen",
  "Adding… {0} of {1}": "Wird hinzugefügt… {0} von {1}",
  "Bottles to add": "Anzahl Flaschen",
  "Download .csv": ".csv herunterladen",
  "Download .xlsx": ".xlsx herunterladen",
  "Fill the cellar": "Keller füllen",
  "Headings in three languages, prices as text, “6 fl.”, regions spelt wrong, a heading repeated, blank rows, #N/A and a totals line: download it, then try it with Import.": "Überschriften in drei Sprachen, Preise als Text, „6 fl.“, falsch geschriebene Regionen, eine wiederholte Überschrift, leere Zeilen, #N/A und eine Summenzeile: herunterladen und dann mit Importieren ausprobieren.",
  "Rows": "Zeilen",
  "Stopped after {0} of {1} wines: {2}": "Abgebrochen nach {0} von {1} Weinen: {2}",
  "{0} bottles added": "{0} Flaschen hinzugefügt",
  "Close": "Schließen"
  }
  };
function tr(s, ...a) { const l = window.I18N && I18N.lang, w = (WORDS[l] || {})[s] || s; return w.replace(/\{(\d)\}/g, (m, i) => a[i] ?? ""); }
function mount() {
  const $ = id => document.getElementById(id); // api, loadData, toast, fmt: app.js's, shared by the page's scripts
  if ($("testBtn")) return;
  const btn = document.createElement("button"); btn.className = "btn"; btn.id = "testBtn"; btn.type = "button"; btn.textContent = "🧪 " + tr("Test data");
  const bar = document.querySelector(".actions"); if (bar) bar.appendChild(btn);
  const m = document.createElement("div"); m.className = "modal"; m.id = "testModal"; m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true"); m.setAttribute("aria-labelledby", "testTitle");
  m.innerHTML = `<div class="card">
    <h2 id="testTitle">${tr("Test data")}</h2>
    <h3>${tr("Fill the cellar")}</h3>
    <label for="testN">${tr("Bottles to add")}</label><input id="testN" type="number" min="1" max="20000" step="1" value="1000" inputmode="numeric">
    <div class="mact" style="justify-content:flex-start"><button type="button" class="btn primary" id="testFill">${tr("Add the bottles")}</button></div>
    <h3>${tr("A messy sheet to import")}</h3>
    <p class="hint">${tr("Headings in three languages, prices as text, “6 fl.”, regions spelt wrong, a heading repeated, blank rows, #N/A and a totals line: download it, then try it with Import.")}</p>
    <label for="testRows">${tr("Rows")}</label><input id="testRows" type="number" min="1" max="10000" step="1" value="500" inputmode="numeric">
    <div class="mact" style="justify-content:flex-start"><button type="button" class="btn" id="testXlsx">${tr("Download .xlsx")}</button><button type="button" class="btn" id="testCsv">${tr("Download .csv")}</button></div>
    <div class="jerr" id="testErr" role="alert" hidden></div>
    <div class="mact"><button type="button" class="btn" id="testClose">${tr("Close")}</button></div></div>`;
  document.body.appendChild(m);
  const close = () => m.classList.remove("open"), err = t => { $("testErr").textContent = t || ""; $("testErr").hidden = !t; };
  btn.addEventListener("click", () => { err(""); m.classList.add("open"); setTimeout(() => $("testN").focus(), 40); });
  $("testClose").addEventListener("click", close);
  m.addEventListener("click", e => { if (e.target === m) close(); });
  const num = (id, max) => { const v = Math.floor(Number($(id).value)); return v >= 1 && v <= max ? v : 0; };
  $("testFill").addEventListener("click", async () => {
    const n = num("testN", 20000); if (!n) return err(tr("A number from 1 to {0}", "20.000"));
    if (!root.TESTDATA) await loadJS("test-data.js?v=5"); // the real producers
    const b = $("testFill"), rows = wines(n, Date.now() % 100000).map(w => window.IMPORT && IMPORT.clean ? IMPORT.clean(w) : w);
    const big = window.VAULT && VAULT.active() ? 4000 : 400; b.disabled = true; err(""); let done = 0;
    try {
      for (let i = 0; i < rows.length; i += big) { b.textContent = tr("Adding… {0} of {1}", fmt(done), fmt(rows.length)); await api({ action: "addmany", bumps: [], wines: rows.slice(i, i + big) }); done += Math.min(big, rows.length - i); }
      await loadData(true); close(); toast(tr("{0} bottles added", fmt(n)));
    } catch (e) { err(tr("Stopped after {0} of {1} wines: {2}", done, rows.length, String(e && e.message || e))); }
    b.disabled = false; b.textContent = tr("Add the bottles");
  });
  const dl = async kind => { if (!root.TESTDATA) await loadJS("test-data.js?v=5"); const n = num("testRows", 10000); if (!n) return err(tr("A number from 1 to {0}", "10.000")); err("");
    const rows = messy(n, Date.now() % 100000), blob = kind === "csv" ? new Blob([EXPORT.csv(rows)], { type: "text/csv;charset=utf-8" })
      : new Blob([EXPORT.xlsx([{ name: "Min kælder", rows }])], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `messy-cellar-${n}.${kind}`; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); };
  $("testXlsx").addEventListener("click", () => dl("xlsx")); $("testCsv").addEventListener("click", () => dl("csv"));
}

const kit = { wines, messy, mount, label: () => tr("Test data"), WORDS };
if (typeof module === "object" && module.exports) module.exports = kit;
else root.TESTKIT = kit;
})(typeof window !== "undefined" ? window : this);
