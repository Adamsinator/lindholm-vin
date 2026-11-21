// Browser test of Denmark in the wine atlas (atlas-danmark.js, from tools/region-build.js danmark → tools/region-dk.js:
// Landbrugsstyrelsen's field map's vines by municipality, the four PGI wine areas and the PDOs from DAGI):
//   • the pack: municipalities' vines in Jylland, Fyn, Sjælland and Bornholm; Holbæk with Njord; the PDOs' areas
//   • the region: its lists by wine area, the PDOs with their status, the note on what the field map holds
//   • a municipality: Holbæk's fields, its share of the Odsherred parishes, Njord; Denmark on the start page
//   (cd .. && python3 -m http.server 8765) & node tools/denmark-atlas-ui-test.js
"use strict";
const { chromium } = require("./pw");
const BASE = process.env.BASE || "http://localhost:8765/";
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
global.window = {}; require("../atlas-danmark.js");
const P = window.ATLAS_PACKS.danmark, C = P.climats, V = P.villages, by = z => C.filter(c => c.area === z).reduce((s, c) => s + c.ha, 0);
const tot = C.reduce((s, c) => s + c.ha, 0), hb = C.find(c => c.n === "Holbæk");
check("Denmark: the vines of 50–80 municipalities in Jylland, Fyn, Sjælland and Bornholm, 150–400 ha in all", C.length >= 50 && C.length <= 80 && C.every(c => c.c === "DV" && /^(Jylland|Fyn|Sjælland|Bornholm)$/.test(c.area) && c.fields > 0) && tot > 150 && tot < 400, C.length + " " + tot);
check("…Sjælland has the most; every area has some", by("Sjælland") > by("Jylland") && ["Jylland", "Fyn", "Sjælland", "Bornholm"].every(z => by(z) > 0), ["Jylland", "Fyn", "Sjælland", "Bornholm"].map(by).map(Math.round).join());
check("…Holbæk, id holbaek, with Njord in its notes and part of it in the Odsherred parishes", hb && hb.id === "holbaek" && /Njord/.test(hb.notes.join(" ")) && hb.pdo && hb.pdo.Odsherred > 0, JSON.stringify(hb && { id: hb.id, pdo: hb.pdo }));
const pd = Object.fromEntries(V.filter(v => v.kind === "pdo").map(v => [v.ap, v]));
check("…the PDOs: Dons registered (its cadastral district, about 850 ha), Røsnæs applied for, Odsherred proposed", pd.Dons && pd.Dons.status === "registered" && pd.Dons.ha > 800 && pd.Dons.ha < 900
  && pd["Røsnæs"].status === "applied" && pd.Odsherred.status === "proposed" && C.find(c => c.n === "Kalundborg").pdo["Røsnæs"] > 0, JSON.stringify(Object.values(pd).map(v => [v.ap, v.status, v.ha])));
check("…the four PGI areas drawn; the sources credited, and no farm's CVR or journal number kept", ["Jylland", "Fyn", "Sjælland", "Bornholm"].every(z => V.some(v => v.ap === z && v.kind === "pgi" && v.g.length))
  && /Landbrugsstyrelsen/.test(P.meta.source) && /DAGI/.test(P.meta.source) && !/CVR|Journalnr|Marknr/.test(JSON.stringify(P)));
require("../atlas-holbaek.js"); require("../atlas-holbaek-topo.js"); require("../atlas-kw.js");
const HB = window.ATLAS_PACKS.holbaek, T = window.ATLAS_TOPO.holbaek, hbc = n => HB.climats.find(c => c.n === n);
check("Holbæk & Odsherred close up: the vines by parish; Tuse Næs and Røsnæs in their PDOs' parishes", HB.meta.unit === "parishes" && HB.climats.length >= 10 && HB.climats.every(c => c.c === "DV" && c.fields > 0)
  && hbc("Tuse Næs") && hbc("Tuse Næs").pdo.Odsherred > 0 && hbc("Røsnæs") && hbc("Røsnæs").pdo["Røsnæs"] > 0, HB.climats.map(c => c.n).join());
check("…its towns and villages named from the cadastre (Holbæk, Kalundborg, Nykøbing Sj. as towns), Njord in its notes", ["Holbæk", "Kalundborg", "Nykøbing Sj."].every(n => T.names.some(x => x[0] === 1 && x[1] === n))
  && T.names.length > 100 && /Matriklen/.test(T.meta.source) && /Njord/.test(HB.meta.notes.join(" ")));
check("…relief from Copernicus GLO-30 for the close-up, GLO-90 for Denmark, both credited", /GLO-30/.test(window.ATLAS_RELIEF.holbaek.credit) && /GLO-90/.test(window.ATLAS_RELIEF.danmark.credit)
  && require("fs").existsSync(require("path").join(__dirname, "..", "atlas-holbaek-relief.webp")) && require("fs").existsSync(require("path").join(__dirname, "..", "atlas-danmark-relief.webp")));
(async () => {
  const b = await chromium.launch(), errs = [];
  const page = async opt => { const p = await (await b.newContext(opt)).newPage(); p.on("pageerror", e => errs.push(e.message)); await p.route(/^https:\/\//, r => r.abort()); return p; };
  const p = await page({ viewport: { width: 1300, height: 900 } });
  await p.goto(BASE + "atlas.html#r=danmark"); await p.waitForFunction(() => /Danmark/.test(document.getElementById("regionName").textContent), null, { timeout: 30000 }); await p.waitForTimeout(800);
  const side = await p.textContent("#side"), h3 = await p.$$eval("#side h3", x => x.map(h => h.textContent));
  check("the region: its wine areas' lists, the PDOs with their status, the note on the field map", ["Sjælland", "Jylland", "Fyn", "Bornholm"].every(z => h3.includes(z)) && h3.some(h => /PDO/.test(h))
    && /Dons\s*· registered 2018/.test(side) && /Røsnæs\s*· applied for, 2026/.test(side) && /not on the register/.test(side) && /declared for farm support/.test(side), JSON.stringify(h3));
  check("…the PDO areas outlined over the wine areas, and a legend for them", await p.evaluate(() => document.querySelectorAll("#map path.vl.pdo").length === 3 && /PDO area/.test(document.getElementById("legend").textContent)));
  check("…Europe › Denmark › Danmark", /Europe\s*›\s*Denmark\s*›\s*Danmark/.test(await p.textContent("#crumb")));
  await p.goto(BASE + "atlas.html#r=danmark&c=holbaek"); await p.reload(); await p.waitForTimeout(1500);
  const a = await p.evaluate(() => ({ h: (document.querySelector("#side h2") || {}).textContent, t: document.getElementById("side").textContent }));
  check("Holbæk: Sjælland, its vine fields, its share of the Odsherred PDO's parishes, Njord", a.h === "Holbæk" && /Sjælland/.test(a.t) && /Vine fields \(2025\)/.test(a.t) && /in the area of the Odsherred PDO/.test(a.t) && /Njord: Sune Albertsen/.test(a.t), a.t.slice(0, 400));
  await p.goto(BASE + "atlas.html#r=holbaek"); await p.reload(); await p.waitForTimeout(2000);
  const z = await p.evaluate(() => ({ crumb: document.getElementById("crumb").textContent, side: document.getElementById("side").textContent, img: (document.querySelector("#map g.shade image.pre") || { getAttribute: () => "" }).getAttribute("href"),
    towns: [...document.querySelectorAll("#map text.tn-1")].map(t => t.textContent), legend: document.getElementById("legend").textContent }));
  check("the close-up: Europe › Denmark › Holbæk & Odsherred · its parishes, its relief, its towns named, PDOs listed, no village-appellation legend", /Holbæk & Odsherred\s*· \d+ parishes/.test(z.crumb)
    && z.img === "atlas-holbaek-relief.webp?v=1" && z.towns.includes("Holbæk") && /Røsnæs\s*· applied for/.test(z.side) && /Njord/.test(z.side) && !/Village appellations/.test(z.legend), JSON.stringify(z).slice(0, 400));
  const d = await page({ viewport: { width: 1300, height: 900 }, locale: "da-DK" });
  await d.addInitScript(() => { try { localStorage.setItem("lang", "da"); } catch (e) {} });
  await d.goto(BASE + "atlas.html#r=danmark&c=holbaek"); await d.waitForTimeout(2500);
  check("…in Danish too", /Vinmarker \(2025\)/.test(await d.textContent("#side")) && /Njord: Sune Albertsens vingård/.test(await d.textContent("#side")));
  const q = await page({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await q.goto(BASE + "atlas.html"); await q.waitForTimeout(1500);
  check("the start page has Denmark among the mapped countries", /Denmark\s*2 regions/.test(await q.evaluate(() => (document.querySelector('#map .cn.on[data-c="dk"]') || {}).textContent || "")));
  check("no console errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
