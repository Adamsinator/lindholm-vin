// The static vineyard pages (tools/pages-build.js) against the data they come from, and as a search engine reads them:
//   • the pages on disk are exactly what the data gives (nobody forgot to rebuild them), and every language has every word
//   • each page has a title, a description, its canonical URL, an hreflang link to each language, valid schema.org data
//     with coordinates in its region, and no "undefined" or "NaN"
//   • every link between the pages, and into the atlases, points at a file that exists
//   • sitemap.xml lists every page, robots.txt points at it, and no public page says noindex
//   • spot checks: Romanée-Conti where IGN puts it, with its owner, in Danish; Les Clos into the Chablis atlas
//   node tools/pages-test.js
"use strict";
const fs = require("fs"), path = require("path");
const R = path.join(__dirname, "..");
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const { build, ALL, LANGS, OUT, SITE, T } = require("./pages-build");
const files = build();

const stale = Object.keys(files).filter(f => { const p = path.join(R, f); return !fs.existsSync(p) || fs.readFileSync(p, "utf8") !== files[f]; });
const extra = LANGS.flatMap(L => fs.readdirSync(path.join(R, OUT, L)).map(f => `${OUT}/${L}/${f}`)).filter(f => !(f in files));
check("the pages on disk are what the data gives (else: node tools/pages-build.js)", !stale.length && !extra.length, [...stale, ...extra].slice(0, 5).join(", "));
const keys = Object.keys(T.en).sort().join();
check("every language has every word", LANGS.every(L => Object.keys(T[L]).sort().join() === keys && T[L].dirs.length === 8), LANGS.filter(L => Object.keys(T[L]).sort().join() !== keys).join());
check("every vineyard has its own address", new Set(ALL.map(v => v.slug)).size === ALL.length);
check("about 2 750 vineyards, châteaux, Einzellagen and MGA across eighteen regions", ALL.length > 2700 && new Set(ALL.map(v => v.set)).size === 18, ALL.length);

const pages = Object.keys(files).filter(f => f.endsWith(".html"));
const bad = { head: [], ld: [], geo: [], junk: [], links: [] };
const exists = rel => fs.existsSync(path.join(R, rel));
for (const f of pages) {
  const s = files[f], L = f.split("/")[1], file = f.split("/")[2];
  const alts = [...s.matchAll(/<link rel="alternate" hreflang="([\w-]+)" href="([^"]+)">/g)];
  if (!/<title>[^<]{10,}<\/title>/.test(s) || !/<meta name="description" content="[^"]{40,}">/.test(s) || !s.includes(`<link rel="canonical" href="${SITE}${f}">`) || !s.startsWith(`<!doctype html>\n<html lang="${L}">`)
      || alts.length !== 5 || !LANGS.every(l => alts.some(a => a[1] === l && a[2] === `${SITE}${OUT}/${l}/${file}`))) bad.head.push(f);
  let ld; try { ld = JSON.parse(s.match(/<script type="application\/ld\+json">(.*?)<\/script>/)[1]); } catch (e) { bad.ld.push(f); }
  const place = ld && (ld["@graph"] || []).find(x => x["@type"] === "Place");
  const mga = /Disciplinari di produzione DOCG Barolo/.test(s); // Barolo and Barbaresco's MGA: no outlines, so no coordinates
  if (file !== "index.html" && !mga && (!place || !(place.geo.latitude > 43.8 && place.geo.latitude < 50.7 && place.geo.longitude > -1.2 && place.geo.longitude < 8.5))) bad.geo.push(f);
  if (/undefined|NaN|\{\d\}|\[object/.test(s.replace(/<svg class="map".*?<\/svg>/s, ""))) bad.junk.push(f);
  for (const [, h] of s.matchAll(/href="([^"#?]+)[^"]*"/g)) {
    if (/^(https?:|data:)/.test(h)) continue;
    const rel = path.posix.normalize(path.posix.join(path.posix.dirname(f), h)).replace(/\/$/, "/index.html").replace(/^\.\.?\/?$/, "index.html");
    if (!exists(rel) && !(rel in files)) bad.links.push(f + " → " + h);
  }
}
check(`each of ${pages.length} pages has its title, description, canonical and hreflang links`, !bad.head.length, bad.head.slice(0, 3).join(", "));
check("each page's schema.org data parses", !bad.ld.length, bad.ld.slice(0, 3).join(", "));
check("each vineyard's coordinates lie in its French or German wine region", !bad.geo.length, bad.geo.slice(0, 3).join(", "));
check("no page says undefined, NaN or {0}", !bad.junk.length, bad.junk.slice(0, 3).join(", "));
check("every link points at a file that exists", !bad.links.length, bad.links.slice(0, 3).join(", "));

const sm = files["sitemap.xml"], locs = new Set([...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]));
check("the sitemap lists every page and the atlases", pages.every(f => locs.has(SITE + f)) && locs.has(SITE) && locs.has(SITE + "burgundy.html") && locs.has(SITE + "atlas.html"), locs.size);
check("the sitemap stays under Google's 50 000 URLs and 50 MB", locs.size < 50000 && Buffer.byteLength(sm) < 50e6);
check("robots.txt allows the site and points at the sitemap", /User-agent: \*/.test(files["robots.txt"]) && !/Disallow: \/\s*$/m.test(files["robots.txt"]) && files["robots.txt"].includes(`Sitemap: ${SITE}sitemap.xml`));
const pub = ["index.html", "burgundy.html", "atlas.html", "domaine.html", "privacy.html"];
check("no public page tells search engines to stay away", pub.every(f => !/noindex/.test(fs.readFileSync(path.join(R, f), "utf8"))), pub.filter(f => /noindex/.test(fs.readFileSync(path.join(R, f), "utf8"))).join());

// spot checks
const rc = files[`${OUT}/da/romanee-conti.html`] || "";
const rcLd = JSON.parse((rc.match(/ld\+json">(.*?)<\/script>/) || [, "{}"])[1]), rcGeo = ((rcLd["@graph"] || [])[0] || {}).geo || {};
check("Romanée-Conti sits where IGN's map puts it (47.1616 N, 4.9497 E, within 150 m)", Math.abs(rcGeo.latitude - 47.1616) < .0014 && Math.abs(rcGeo.longitude - 4.9497) < .002, JSON.stringify(rcGeo));
check("Romanée-Conti in Danish: grand cru, 1,81 ha, owned by the DRC, and a link to it on the map", rc.includes("<h1>Romanée-Conti</h1>") && rc.includes("1,81 ha") && rc.includes("Domaine de la Romanée-Conti") && rc.includes('href="../../burgundy.html?lang=da#c=romaneeconti"') && rc.includes('<html lang="da">'));
const lc = files[`${OUT}/fr/les-clos.html`] || "";
check("Les Clos in French: Chablis Grand Cru, 27,1 ha, into the Chablis atlas, with Blanchot as a neighbour", lc.includes("Chablis Grand Cru Les Clos") && lc.includes("27,1 ha") && lc.includes('href="../../atlas.html?lang=fr#r=chablis&c=les_clos"') && /<a href="blanchot\.html"><path class="nb"/.test(lc), (lc.match(/\d+,\d ha/) || [])[0]);
const inferred = ALL.find(v => v.inferred);
check("a name INAO's map leaves out says it's inferred", inferred && files[`${OUT}/en/${inferred.slug}.html`].includes("INAO&#39;s map leaves this parcel unnamed"), inferred && inferred.slug);
const hub = files[`${OUT}/en/index.html`];
check("the vineyard index links every vineyard, by region", ALL.every(v => hub.includes(`href="${v.slug}.html"`)) && ["burgundy", "chablis", "chalonnaise", "maconnais", "champagne", "alsace", "rhone", "bordeaux", "mosel", "nahe", "pfalz", "rheinhessen", "mittelrhein", "ahr", "barolo", "barbaresco"].every(r => hub.includes(`id="${r}"`)));
const geoOf = f => ((JSON.parse((files[f].match(/ld\+json">(.*?)<\/script>/) || [, "{}"])[1])["@graph"] || [])[0] || {}).geo || {};
const ch = files[`${OUT}/en/chouilly.html`] || "", chG = geoOf(`${OUT}/en/chouilly.html`);
check("Chouilly: a Champagne grand cru village, its note on Pinot Noir, drawn from IGN's vines, east of Épernay", ch.includes("Champagne Grand Cru") && ch.includes("its Pinot Noir is rated premier cru")
  && ch.includes("IGN BD TOPO") && ch.includes("One of the 6 grand cru villages of Côte des Blancs") && chG.latitude > 49.0 && chG.latitude < 49.05 && chG.longitude > 3.97 && chG.longitude < 4.05, JSON.stringify(chG));
const he = files[`${OUT}/fr/hermitage.html`] || "", heG = geoOf(`${OUT}/fr/hermitage.html`);
check("Hermitage in French: a cru appellation of 145,5 ha above Tain-l'Hermitage, with no commune line", he.includes("Appellation cru") && he.includes("145,5 ha") && !he.includes("<dt>Commune</dt>")
  && heG.latitude > 45.06 && heG.latitude < 45.09 && heG.longitude > 4.82 && heG.longitude < 4.86, JSON.stringify(heG));
const la = files[`${OUT}/en/chateau-latour.html`] || "", laG = geoOf(`${OUT}/en/chateau-latour.html`);
check("Château Latour: a first growth of 1855 in Pauillac, where IGN puts it, among its neighbours", la.includes("Premier grand cru classé") && la.includes("<dd>Pauillac</dd>")
  && Math.abs(laG.latitude - 45.177) < .003 && Math.abs(laG.longitude + 0.744) < .004 && /<a href="chateau-pichon-baron\.html"><circle class="pt"/.test(la) && la.includes('href="../../atlas.html?lang=en#r=bordeaux&c=chateau_latour"'), JSON.stringify(laG));
const ws = files[`${OUT}/de/wehlener-sonnenuhr.html`] || "", wsLd = JSON.parse((ws.match(/ld\+json">(.*?)<\/script>/) || [, "{}"])[1]), wsP = (wsLd["@graph"] || [])[0] || {};
check("Wehlener Sonnenuhr in German: its Großlage and Gemarkung, 42,6 ha of vines, in Germany, where the register puts it (49.945 N 7.047 E), credited to the Landwirtschaftskammer", ws.includes("<h1>Wehlener Sonnenuhr</h1>")
  && ws.includes("<dd>Münzlay</dd>") && ws.includes("<dd>Wehlen</dd>") && ws.includes("42,6 ha") && JSON.stringify(wsP).includes('"Deutschland"') && ws.includes("©Landwirtschaftskammer RLP")
  && Math.abs(wsP.geo.latitude - 49.9453) < .003 && Math.abs(wsP.geo.longitude - 7.0474) < .004, JSON.stringify(wsP.geo));
check("every German page carries the Landwirtschaftskammer's credit and licence", pages.filter(f => /Weinbergsrolle/.test(files[f])).every(f => files[f].includes("dl-de/by-2-0")));
// Barolo and Barbaresco: the MGA from the rules, a page each, and the cellar's link lands on it
global.window.PIEMONTE_MGA || require("../piemonte-mga.js");
const P = global.window.PIEMONTE_MGA.docg;
check("the rules' MGA: Barolo 170 and 11 village mentions, Barbaresco 66", P.barolo.mga.length === 170 && P.barolo.villages.length === 11 && P.barbaresco.mga.length === 66,
  [P.barolo.mga.length, P.barolo.villages.length, P.barbaresco.mga.length].join("/"));
check("…the text's slips put right: Gallaretto and Garretti, Monforte d'Alba, Rabajà, and Ca' Grossa kept", ["Gallaretto", "Garretti"].every(n => P.barolo.mga.some(m => m.n === n))
  && P.barolo.villages.some(v => v.n === "Monforte d'Alba") && P.barbaresco.mga.some(m => m.n === "Rabajà" && m.official === "Rabaja'") && P.barbaresco.mga.some(m => m.n === "Ca' Grossa"));
const cb = files[`${OUT}/de/barolo-cannubi-boschis.html`] || "";
check("Barolo Cannubi Boschis in German: Nebbiolo 100%, 38 months (18 in wood), 8 t/ha, also labelled Barolo Cannubi, no map, in Italy", cb.includes("<h1>Barolo Cannubi Boschis</h1>")
  && cb.includes("Nebbiolo 100%") && cb.includes("38 Monate, davon 18 im Holz") && cb.includes("8 t/ha") && cb.includes("<dd>Barolo Cannubi</dd>") && !cb.includes('<svg class="map"') && cb.includes('"Italien"'));
const slugOf = s => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/œ/g, "oe").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); // as app.js's pageSlug
const labels = Object.values(P).flatMap(D => D.mga.map(m => `${D.name} ${m.n}`).concat(D.villages.map(v => `${D.name} ${v.official}`)));
check(`the cellar's link (app.js pageSlug) finds the page of every one of the ${labels.length} MGA`, labels.every(l => files[`${OUT}/en/${slugOf(l)}.html`]), labels.filter(l => !files[`${OUT}/en/${slugOf(l)}.html`]).slice(0, 4).join(", "));
const ra = files[`${OUT}/de/rangen.html`] || "";
check("Rangen in German: one of Alsace's 51 grands crus, into the Alsace atlas", ra.includes("Teil der 51 Grands Crus in Elsass") && ra.includes('href="../../atlas.html?lang=de#r=alsace&c=rangen"'));

const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
