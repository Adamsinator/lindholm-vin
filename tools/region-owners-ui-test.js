// Owners in a region without the Côte d'Or's tools (atlas-owners.js, atlas-<id>-own.js from tools/region-owners.js
// and data/owners/<id>.json): every holding names its domaine's own page; the built file is the list as it stands;
// a climat's panel shows its owners with their areas, shares and source links, says what the figures cover, and says
// so when there are none; the region's panel says how many climats have owners; it reads in Danish; and a visit to
// the Côte d'Or first doesn't put its tools in Chablis's place (nor the other way round).
//   (cd .. && python3 -m http.server 8765) & node tools/region-owners-ui-test.js
"use strict";
const fs = require("fs"), path = require("path");
const { chromium } = require("./pw");
const BASE = process.env.BASE || "http://localhost:8765/";
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const R = f => path.join(__dirname, "..", f);

const D = JSON.parse(fs.readFileSync(R("data/owners/chablis.json"), "utf8")), w = {};
new Function("window", fs.readFileSync(R("atlas-chablis-own.js"), "utf8"))(w); const B = w.ATLAS_OWN_DATA.chablis;
check("the built file is the sourced list as it stands (re-run tools/region-owners.js after editing it)", JSON.stringify(Object.fromEntries(Object.entries(D.holdings).map(([k, v]) => [k, v.map(r => [r[0], r[1], r[2], r[3] || ""])]))) === JSON.stringify(B.own) && B.checked === D.checked);
const rows = Object.values(D.holdings).flat();
check("every holding has its domaine's own page (no merchants, no press)", rows.every(r => /^https:\/\//.test(r[2])) && rows.every(r => !/decanter|winewithseth|bbr\.com|idealwine|vinous|wine-searcher|jancisrobinson|burghound/i.test(r[2])), rows.filter(r => !/^https:/.test(r[2])).map(r => r[0]).join());
check("all seven grands crus have owners on file", ["blanchot", "bougros", "grenouilles", "les_clos", "preuses", "valmur", "vaudesir"].every(k => (D.holdings[k] || []).length));
check("the figures read from the pages: Laroche 4.34 ha of Blanchot, La Chablisienne 7.2 ha of Grenouilles", D.holdings.blanchot.some(r => r[0] === "laroche" && r[1] === 4.34) && D.holdings.grenouilles.some(r => r[0] === "chablisienne" && r[1] === 7.2));
// Alsace: the same rule, from Zind-Humbrecht's, Weinbach's and Trimbach's own pages
const DA = JSON.parse(fs.readFileSync(R("data/owners/alsace.json"), "utf8")), wa = {};
new Function("window", fs.readFileSync(R("atlas-alsace-own.js"), "utf8"))(wa); const BA = wa.ATLAS_OWN_DATA.alsace;
check("Alsace: the built file is its sourced list as it stands", JSON.stringify(Object.fromEntries(Object.entries(DA.holdings).map(([k, v]) => [k, v.map(r => [r[0], r[1], r[2], r[3] || ""])]))) === JSON.stringify(BA.own) && BA.checked === DA.checked);
const rowsA = Object.values(DA.holdings).flat();
check("…every holding on a domaine's own site, the figures as its pages give them (Trimbach 1.67 ha of Rosacker, Zind-Humbrecht 2.4 ha of Brand)",
  rowsA.every(r => /^https:\/\/www\.(zindhumbrecht\.fr|domaineweinbach\.com|trimbach\.fr)\//.test(r[2])) && DA.holdings.rosacker.some(r => r[0] === "trimbach" && r[1] === 1.67) && DA.holdings.brand.some(r => r[0] === "zind_humbrecht" && r[1] === 2.4));

(async () => {
  const b = await chromium.launch(), errs = [];
  const p = await b.newPage({ viewport: { width: 1280, height: 860 } });
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && !/net::|CORS|Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.route(/^https:\/\/(data\.geopf\.fr|sgx\.geodatenzentrum\.de)\//, r => r.abort());
  const open = async (hash, until) => { await p.goto("about:blank"); await p.goto(BASE + "atlas.html#" + hash); await p.waitForFunction(until, null, { timeout: 25000 }); await p.waitForTimeout(300); };
  // the Côte d'Or first, so its tools are loaded when Chablis opens
  await open("r=cotedor&c=latache", () => { try { return st.pack && st.sel === "latache" && !!document.querySelector("#side table.own"); } catch (e) { return false; } });
  check("the Côte d'Or's own owners panel, as before", /Domaine de la Romanée-Conti/.test(await p.textContent("#side table.own")));
  await p.evaluate(() => { location.hash = "#r=chablis&c=blanchot"; });
  await p.waitForFunction(() => { try { return st.region.id === "chablis" && st.sel === "blanchot" && !!document.querySelector("#side table.own"); } catch (e) { return false; } }, null, { timeout: 25000 });
  const bl = await p.evaluate(() => ({ rows: [...document.querySelectorAll("#side table.own tr")].map(r => r.innerText.replace(/\s+/g, " ").trim()), note: document.querySelector("#side table.own").previousElementSibling.textContent,
    link: (() => { const a = document.querySelector("#side table.own a.srcl"); return a && { href: a.href, target: a.target, rel: a.rel }; })(), src: [...document.querySelectorAll("#side .src")].map(e => e.textContent).join(" | "), edit: !!document.querySelector("#side .edbtn") }));
  check("then Chablis: Blanchot's owners, largest first, with areas and shares", /^Domaine Laroche ↗ 4[.,]34 ha 33%$/.test(bl.rows[0]) && /Long-Depaquit.*1[.,]65 ha 12%/.test(bl.rows[1]) && bl.rows.some(r => /Billaud-Simon ↗ holder/.test(r)), JSON.stringify(bl.rows));
  check("…each with a link to its own page, opened apart", bl.link && bl.link.href === "https://larochewines.com/cuvee/la-reserve-de-lobediencerie/" && bl.link.target === "_blank" && /noopener/.test(bl.link.rel), JSON.stringify(bl.link));
  check("…saying what the figures cover and where they come from", /account for 5[.,]99 of 13[.,]22? ha \(45%\)/.test(bl.note) && /own website says, checked 2026-11-06/.test(bl.src), bl.note + " | " + bl.src);
  check("…and none of the Côte d'Or's tools (no correcting here)", !bl.edit);
  await p.evaluate(() => select(st.pack.climats.find(c => c.c === "1er").id)); await p.waitForTimeout(300);
  check("a premier cru: no owners on file, said plainly", /No ownership details on file for this climat\./.test(await p.textContent("#side")));
  await p.evaluate(() => select(null)); await p.waitForTimeout(300);
  check("the region's panel: owners on file for 7 climats", /Owners on file for 7 climats, from the domaines' own websites\./.test(await p.textContent("#side")));
  await p.click(".langpick [data-lang=da]"); await p.waitForTimeout(600);
  await p.evaluate(() => select("grenouilles")); await p.waitForTimeout(400);
  const da = await p.evaluate(() => ({ h: [...document.querySelectorAll("#side h3")].map(e => e.textContent), src: [...document.querySelectorAll("#side .src")].map(e => e.textContent).join(" ") }));
  check("in Danish", da.h.includes("Ejere") && /egen hjemmeside/.test(da.src), JSON.stringify(da));
  await p.click(".langpick [data-lang=en]"); await p.waitForTimeout(400);
  // and back to the Côte d'Or: its panel again
  await p.evaluate(() => { location.hash = "#r=cotedor&c=latache"; });
  await p.waitForFunction(() => { try { return st.region.id === "cotedor" && st.sel === "latache" && !!document.querySelector("#side table.own"); } catch (e) { return false; } }, null, { timeout: 25000 });
  check("back on the Côte d'Or, its own panel again", /Domaine de la Romanée-Conti/.test(await p.textContent("#side table.own")) && !/own website says/.test(await p.textContent("#side")));
  check("no errors on the page", !errs.length, errs.slice(0, 3).join(" | "));
  await b.close();
  const pass = results.filter(Boolean).length; console.log(`\n${pass}/${results.length} passed`); process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
