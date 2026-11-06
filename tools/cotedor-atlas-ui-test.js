// The Côte d'Or on the Wine atlas's engine (atlas-cotedor*.js, made by tools/cotedor-pack.js from the burgundy-*.js files):
// the pack has every climat burgundy.html draws, with the same owners and areas, moved to the frame the other French
// regions use; it opens at #r=cotedor (and isn't on the start page yet, while it's checked against burgundy.html); a
// climat's panel lists its owners with their shares; a click on an owner keeps only their climats on the map, and the
// total; the cadastre's lieux-dits are listed in a climat's panel, drawn when zoomed in and open with a tap; the map
// turns and the terrain and geology are there.
//   (cd .. && python3 -m http.server 8765) & node tools/cotedor-atlas-ui-test.js
"use strict";
const fs = require("fs"), path = require("path");
const { chromium } = require("./pw");
const BASE = process.env.BASE || "http://localhost:8765/";
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const ROOT = path.join(__dirname, "..");
global.window = {};
["burgundy-data.js", "burgundy-data-beaune.js", "burgundy-geo.js", "atlas-cotedor.js"].forEach(f => require(path.join(ROOT, f)));
const B = window.BURG, GEO = window.BURG_GEO, P = window.ATLAS_PACKS.cotedor;

// ── the pack against its sources ──
const want = B.climats.filter(c => GEO.climats[c.id]), byId = Object.fromEntries(P.climats.map(c => [c.id, c]));
check(`every climat burgundy.html draws is in the pack (${want.length}), and INAO's other named climats too`, want.every(c => byId[c.id]) && P.climats.length === want.length + Object.keys(GEO.extra || {}).length,
  want.filter(c => !byId[c.id]).map(c => c.id).join(", "));
const ownDiff = want.filter(c => JSON.stringify(c.p || []) !== JSON.stringify(byId[c.id].own || []));
check("…each with the same owners and figures", !ownDiff.length, ownDiff.slice(0, 5).map(c => c.id).join(", "));
// the move to Lambert-93 keeps every outline's area (to well under 1 %: both are near-conformal over 50 km); INAO's
// delimitation can be larger than the planted, registered area (Corton-Charlemagne: ~72 ha delimited, 52 ha declared)
const ringArea = r => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return s / 2; };
const haOf = mp => mp.reduce((s, q) => s + Math.abs(ringArea(q[0])) - q.slice(1).reduce((h, r) => h + Math.abs(ringArea(r)), 0), 0) / 1e4;
const areaOff = want.filter(c => { const a = haOf(GEO.climats[c.id]); return a > .05 && Math.abs(byId[c.id].haMap - a) > Math.max(.01 * a, .03); }); // whole metres: a few hundredths of a hectare on the smallest
check("…and each outline keeps its area through the move to Lambert-93 (within 1 %, or 0.03 ha on the smallest)", !areaOff.length, areaOff.slice(0, 5).map(c => `${c.id} ${byId[c.id].haMap}/${haOf(GEO.climats[c.id]).toFixed(2)}`).join(", "));
check("…in Lambert-93 metres like the other French regions (relief, photos, profile and 3D work)", Array.isArray(P.meta.l93) && P.meta.l93.length === 2 && !P.meta.proj);
const stale = ["burgundy-data.js", "burgundy-data-beaune.js", "burgundy-geo.js", "burgundy-extras.js"].filter(f => fs.statSync(path.join(ROOT, f)).mtimeMs > fs.statSync(path.join(ROOT, "atlas-cotedor.js")).mtimeMs + 5000);
check("the pack was made after its sources last changed (else: node tools/cotedor-pack.js)", !stale.length || process.env.CI, stale.join(", "));

(async () => {
  const b = await chromium.launch(), errs = [];
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && !/net::|CORS|Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.route(/^https:\/\/(data\.geopf\.fr|sgx\.geodatenzentrum\.de)\//, r => r.abort());
  await p.goto(BASE + "atlas.html"); await p.waitForTimeout(800);
  check("not on the start page yet (burgundy.html is still the Côte d'Or's page)", !(await p.$('#map [data-id="cotedor"]')) && !(await p.$('#rchips [data-r="cotedor"]')));
  await p.goto(BASE + "atlas.html#r=cotedor&c=richebourg");
  await p.waitForFunction(() => { try { return !!(st.pack && st.view && st.sel === "richebourg"); } catch (e) { return false; } }, null, { timeout: 20000 }); await p.waitForTimeout(500);
  const side = (await p.textContent("#side")).replace(/\s+/g, " ");
  check("#r=cotedor&c=richebourg opens Richebourg, with its description and owners", /Richebourg/.test(side) && /Opulent, spicy/.test(side) && /Owners/.test(side) && /Domaine de la Romanée-Conti\s*3\.51 ha\s*44%/.test(side), side.slice(0, 300));
  check("…and the three colours of the map: grand cru, premier cru, village climat", await p.evaluate(() => ["GC", "p1", "pv"].every(k => document.querySelector("#map .cl." + k))) && /Village climat/.test(await p.textContent("#legend")));
  await p.click('#side button[data-prod="drc"]'); await p.waitForTimeout(600);
  const bar = (await p.textContent(".prodbar")).trim(), shown = await p.evaluate(() => st.pack.climats.filter(c => !c.el.classList.contains("dim")).map(c => c.id));
  check("a click on an owner keeps only their climats on the map, with the count and hectares", /Showing the holdings of Domaine de la Romanée-Conti: \d+ climats · [\d.,]+ ha/.test(bar) && shown.includes("romaneeconti") && shown.includes("latache") && !shown.includes("chambertin"), bar + " · " + shown.join(","));
  await p.fill("#prodCmp", "Domaine Leroy"); await p.dispatchEvent("#prodCmp", "change"); await p.waitForTimeout(500);
  const ct = (await p.textContent("#cmpTable").catch(() => "")).replace(/\s+/g, " ");
  check("Compare with another owner: their holdings side by side, with the totals", /Compare two producers/.test(ct) && /Domaine de la Romanée-Conti/.test(ct) && /Domaine Leroy/.test(ct) && /Richebourg\s*Vosne-Romanée\s*3\.51 ha\s*0\.78 ha/.test(ct), ct.slice(0, 300));
  check("…and both owners' climats on the map", await p.evaluate(() => !byId("musigny").el.classList.contains("dim") && !byId("latache").el.classList.contains("dim")));
  await p.click("#prodX"); await p.waitForTimeout(300);
  check("…and ✕ shows every owner again", await p.evaluate(() => st.prod === null && !document.querySelector(".prodbar") && !st.pack.climats.some(c => c.el.classList.contains("dim") && c.c === "GC")));
  await p.evaluate(() => select(null)); await p.waitForFunction(() => /Who owns the grands crus/.test(document.getElementById("side").textContent), null, { timeout: 10000 }).catch(() => {});
  check("the region's panel: who owns the grands crus, a bar per grand cru coloured by its biggest owners", /Who owns the grands crus/.test(await p.textContent("#side")) && (await p.$$("#side .gcrow")).length >= 30 && !!(await p.$('#side .gclegend [data-prod="drc"]')));
  await p.evaluate(() => select("richebourg"));
  check("terrain and geology for the climat, as on burgundy.html", await p.evaluate(() => !!document.querySelector("#side")) && /Altitude/.test(side) && /Geology/.test(side));
  await p.evaluate(() => select("latache", true)); await p.waitForFunction(() => /Historic rankings/.test(document.getElementById("side").textContent), null, { timeout: 15000 }).catch(() => {});
  const hs = (await p.textContent("#side")).replace(/\s+/g, " ");
  check("historic rankings in the panel: La Tâche, tête de cuvée in 1855 and 1920, 1ère classe in 1860", /Lavalle 1855\s*tête de cuvée/i.test(hs) && /Comité de Beaune 1860\s*1ère classe/i.test(hs) && /Rodier 1920\s*tête de cuvée/i.test(hs), hs.slice(0, 300));
  // vintages and "colour the vineyards by"
  await p.evaluate(() => select("chambertin", true)); await p.waitForFunction(() => /Vintages · Côte de Nuits red/.test(document.getElementById("side").textContent), null, { timeout: 15000 }).catch(() => {});
  check("a climat's panel has its Côte's vintage chart (Chambertin: Côte de Nuits red), best years first", /Vintages · Côte de Nuits red/.test(await p.textContent("#side")) && !!(await p.$("#side .vchart .vbar")));
  await p.click("#styleBtn"); await p.waitForFunction(() => document.querySelectorAll("#fColor option").length > 6, null, { timeout: 10000 }).catch(() => {});
  const opts = await p.$$eval("#fColor option", o => o.map(x => x.value));
  check("Colour the vineyards by: the generic measures and the Côte d'Or's own", ["class", "alt", "slope", "faces", "size", "cellar", "commune", "owners", "history", "vintage"].every(k => opts.includes(k)), opts.join(","));
  await p.selectOption("#fColor", "vintage"); await p.keyboard.press("Escape"); await p.waitForTimeout(500);
  await p.click('#side [data-vy="2005"]'); await p.waitForTimeout(500);
  const yb = (await p.textContent("#side .vyearbox").catch(() => "")).replace(/\s+/g, " ");
  check("by vintage: a year picked from the chart colours the map, and the panel tells its story (2005: 98, drought)", await p.evaluate(() => st.vy === 2005 && st.color === "vintage") && /2005/.test(yb) && /98/.test(yb) && /Drought/.test(yb), yb.slice(0, 200));
  const f1 = await p.evaluate(() => byId("chambertin").el.style.fill), f2 = await p.evaluate(() => byId("montrachet").el.style.fill);
  check("…each climat by its own Côte and colour's rating, with ◀ ▶ in the legend", !!f1 && !!f2 && /2005/.test(await p.textContent("#legend")));
  await p.click('#legend [data-vstep="1"]'); await p.waitForTimeout(300);
  check("…and ▶ steps to the next vintage", await p.evaluate(() => st.vy === 2006));
  await p.click("#styleBtn"); await p.selectOption("#fColor", "class"); await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  check("…and Classification puts the usual colours back", await p.evaluate(() => !byId("chambertin").el.style.fill));
  // lieux-dits: listed inside a climat; outlines and names zoomed in; a tap on land outside the climats opens one
  await p.evaluate(() => select("echezeaux", true)); await p.waitForFunction(() => !!document.querySelector("#side .ldlist"), null, { timeout: 15000 }).catch(() => {});
  const ldl = await p.textContent("#side .ldlist").catch(() => "");
  check("a climat's panel lists the cadastre's lieux-dits inside it (Échezeaux: Les Poulaillères, En Orveaux…)", /En Orveaux/.test(ldl) && /Les Treux/.test(ldl) && !/^Echezeaux\b/.test(ldl), ldl);
  check("…drawn on the map with their names, zoomed in", await p.evaluate(() => !!document.querySelector("#map .ldo path.ld") && [...document.querySelectorAll("#map .tn-ld")].some(e => e.style.display !== "none")));
  const pt = await p.evaluate(() => { const L = ATLAS_LD.cotedor.ld; for (let i = 0; i < L.length; i++) { const l = L[i]; if (!climatAt([l[2], l[3]]) && l._a > 30000) return [i, l[1], l[2], l[3]]; } });
  await p.waitForTimeout(600); // the flight to Échezeaux has ended (else it carries the view back)
  await p.evaluate(([, , x, y]) => fit([x - 400, y - 400, x + 400, y + 400]), pt); await p.waitForTimeout(700);
  const sc = await p.evaluate(([, , x, y]) => { const [vx, vy] = rotP([x, y]), r = document.getElementById("map").getBoundingClientRect(), [a, b2, w, h] = st.view; return [r.left + (vx - a) / w * r.width, r.top + (vy - b2) / h * r.height]; }, pt);
  await p.mouse.click(sc[0], sc[1]); await p.waitForTimeout(500);
  const lds = (await p.textContent("#side")).replace(/\s+/g, " ");
  check("a tap on village land, zoomed in, opens the lieu-dit there: area, terrain, appellation", new RegExp("Lieu-dit\\s*" + pt[1]).test(lds) && /Area/.test(lds) && /Village appellation|Regional appellations|Appellation/.test(lds), pt[1] + " · " + lds.slice(0, 200));
  await p.click("#back"); await p.waitForTimeout(200);
  check("…and ← goes back to the region", /Côte d'Or/.test(await p.textContent("#side h2")) && await p.evaluate(() => st.ld === null));
  // the extras from burgundy.html: red / white and monopoles, monopoles' and walled clos' outlines, buildings, the Côtes
  // and communes to jump to, the vintage table
  await p.evaluate(() => select(null)); await p.waitForSelector(".cdjump", { timeout: 10000 });
  check("a Red / White choice and Monopoles in the filter bar (the Côte d'Or's only)", await p.isVisible("#cdFilters") && await p.isVisible("#cdMono"));
  await p.click('#cdFilters [data-cdcol="W"]'); await p.waitForTimeout(300);
  check("…White keeps the white climats (Montrachet), not the red (Chambertin)", await p.evaluate(() => !byId("montrachet").el.classList.contains("dim") && byId("chambertin").el.classList.contains("dim")));
  await p.click('#cdFilters [data-cdcol=""]'); await p.check("#cdMono"); await p.waitForTimeout(300);
  const monoN = await p.evaluate(() => st.pack.climats.filter(c => !c.el.classList.contains("dim")).map(c => c.mono ? 1 : 0)), monoAll = monoN.every(Boolean) && monoN.length > 20;
  check("…Monopoles keeps only them", monoAll, monoN.length + " shown"); await p.uncheck("#cdMono"); await p.waitForTimeout(200);
  check("monopoles dashed and walled clos outlined on the map, both in the legend", await p.evaluate(() => document.querySelectorAll("#map .cdmono").length > 20 && document.querySelectorAll("#map .cdwall").length > 20) && /Monopole/.test(await p.textContent("#legend")) && /Walled clos/.test(await p.textContent("#legend")));
  check("the region's panel: Côte de Nuits / Côte de Beaune, a commune to go to, the last 25 vintages", (await p.$$(".cdjump [data-cote]")).length === 2 && (await p.$$("#cdVil option")).length > 20 && (await p.$$(".vtab tbody tr")).length === 25);
  await p.selectOption("#cdVil", "vosne"); await p.waitForTimeout(600);
  check("…a commune picked opens it", await p.evaluate(() => st.vsel === "vosne") && /Vosne-Romanée/.test(await p.textContent("#side h2")));
  await p.evaluate(() => { const [x, y, w, h] = st.view; zoomAt(.3, x + w / 2, y + h / 2); }); await p.waitForFunction(() => document.querySelectorAll("#map .t-bld").length > 0, null, { timeout: 15000 }).catch(() => {});
  check("buildings come in zoomed close (IGN)", await p.evaluate(() => document.querySelectorAll("#map .t-bld").length > 0));
  await p.click("#back"); await p.waitForTimeout(200);
  // burgundy.html's links: #v= a commune, #p= an owner, #l= a lieu-dit by its old key, #color=vintage&y=
  global.window.BURG_LIEUXDITS || require(path.join(ROOT, "burgundy-lieuxdits.js")); const L0 = window.BURG_LIEUXDITS.ld[100], lkey = `${L0[0]}:${L0[2]}:${L0[3]}`;
  const fresh = async h => { const q = await b.newPage({ viewport: { width: 1440, height: 900 } }); q.on("pageerror", x => errs.push(h + ": " + x.message));
    await q.route(/^https:\/\/(data\.geopf\.fr|sgx\.geodatenzentrum\.de)\//, r => r.abort()); await q.goto(BASE + "atlas.html#r=cotedor&" + h); await q.waitForTimeout(2500);
    const r = await q.evaluate(() => ({ vsel: st.vsel, prod: st.prod, ld: st.ld, color: st.color, vy: st.vy, h2: (document.querySelector("#side h2") || {}).textContent })); await q.close(); return r; };
  let r = await fresh("v=gevrey");
  check("#v=gevrey opens the commune: its climats, appellation and vintages", r.vsel === "gevrey" && r.h2 === "Gevrey-Chambertin", JSON.stringify(r));
  r = await fresh("v=flagey");
  check("…and a commune drawn with its neighbour (Flagey) still opens", r.vsel === "flagey" && /Flagey/.test(r.h2), JSON.stringify(r));
  r = await fresh("p=drc");
  check("#p=drc shows the owner's holdings", r.prod === "drc", JSON.stringify(r));
  r = await fresh("l=" + lkey);
  check("#l= with burgundy.html's own key opens that lieu-dit (" + L0[1] + ")", r.ld != null && r.h2 === L0[1], JSON.stringify(r));
  r = await fresh("color=vintage&y=2005");
  check("#color=vintage&y=2005 colours the map by that vintage", r.color === "vintage" && r.vy === 2005, JSON.stringify(r));
  // the search box finds owners and lieux-dits too
  await p.fill("#fSearch", "meo-camu"); await p.waitForTimeout(300);
  const sh = await p.$$eval("#gRes li[data-i]", ls => ls.map(l => l.textContent));
  check("search finds an owner (Méo-Camuzet), marked as one", sh.some(x => /Méo-Camuzet/.test(x) && /Owner/.test(x)), sh.join(" | "));
  await p.press("#fSearch", "Enter"); await p.waitForTimeout(500);
  check("…and picking it shows their holdings", await p.evaluate(() => st.prod === "meo") && /Showing the holdings of Méo-Camuzet/.test(await p.textContent("#side")));
  await p.click("#prodX"); await p.fill("#fSearch", "loachauss"); await p.waitForTimeout(300);
  const sl = await p.$$eval("#gRes li[data-i]", ls => ls.map(l => l.textContent));
  check("…and a lieu-dit (Les Loächausses), with its commune", sl.some(x => /Loächausses/.test(x) && /Flagey|Vosne/.test(x) && /Lieu-dit/.test(x)), sl.join(" | "));
  await p.press("#fSearch", "Enter"); await p.waitForTimeout(600);
  check("…which opens it on the map", await p.evaluate(() => st.ld != null) && /Lieu-dit/.test(await p.textContent("#side")));
  await p.click("#back").catch(() => {});
  await p.keyboard.press("]"); await p.waitForTimeout(300);
  check("the map turns here too", await p.evaluate(() => ROT.a === 15));
  await p.evaluate(() => { try { localStorage.removeItem("atlasRot"); } catch (e) {} });
  // corrections: through the cellar's sheet (the real Code.gs), by someone logged in on the Cellar page
  const SHEET_ATLAS = (require("fs").readFileSync(path.join(ROOT, "apps-script", "Code.gs"), "utf8").match(/const ATLAS_SHEET = '([^']+)'/) || [])[1];
  const H = require("./gas-harness"), HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];
  const row = o => HEAD.map(h => o[h] ?? "");
  const gas = H({ Ark1: [HEAD, row({ Producent: "Armand Rousseau", Land: "Frankrig", Område: "Bourgogne", Kommune: "Gevrey-Chambertin", "Mark/Navn": "Chambertin", Klassifikation: "Grand cru", Type: "Rød", Årgang: 2017, Antal: 2 }),
    row({ Producent: "Cathiard", Land: "Frankrig", Område: "Bourgogne", Kommune: "Vosne-Romanée", "Mark/Navn": "Les Suchots", Klassifikation: "1. cru", Type: "Rød", Årgang: 2019, Antal: 3 }),
    row({ Producent: "Some Domaine", Land: "Frankrig", Område: "Bourgogne", Kommune: "Gevrey-Chambertin", "Mark/Navn": "Gevrey-Chambertin", Type: "Rød", Årgang: 2020, Antal: 1 })] },
    { settings: { OWNER_USER: "eva", OWNER_PASSWORD: "eva-pass-123" } }); gas.run("makeOwner()");
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); await require("./turnstile-fake")(ctx);
  await ctx.route(require("./api-route"), r => r.fulfill({ contentType: "application/json", body: JSON.stringify(gas.call(JSON.parse(r.request().postData() || "{}"))) }));
  await ctx.route(/^https:\/\/(data\.geopf\.fr|sgx\.geodatenzentrum\.de)\//, r => r.abort());
  const e = await ctx.newPage(); e.on("pageerror", x => errs.push("edit: " + x.message));
  await e.goto(BASE + "atlas.html#r=cotedor&c=richebourg"); await e.waitForTimeout(1500);
  check("logged out, the panel says how to correct a figure", /Log in on the Cellar page and you can correct it here/.test(await e.textContent("#side")));
  await e.goto(BASE); await e.waitForTimeout(400); await e.fill("#gateUser", "eva"); await e.fill("#gatePass", "eva-pass-123"); await e.click("#gateSubmit");
  if (await e.waitForSelector("#recModal.open", { timeout: 15000 }).then(() => true).catch(() => false)) { await e.check("#recOk"); await e.click("#recDone"); }
  await e.waitForSelector("#app:not([hidden])", { timeout: 30000 });
  await e.goto(BASE + "atlas.html#r=cotedor&c=richebourg"); await e.waitForSelector('#side [data-ed="drc"]', { timeout: 15000 });
  await e.click('#side [data-ed="drc"]'); await e.waitForSelector("#edForm");
  check("logged in, ✎ by an owner opens the form with their figure", (await e.inputValue("#edP")) === "Domaine de la Romanée-Conti" && (await e.inputValue("#edHa")) === "3.51");
  await e.fill("#edHa", "3.6"); await e.fill("#edN", "domaine website, 2026"); await e.click('#edForm button[type="submit"]');
  await e.waitForFunction(() => !document.getElementById("edForm"), null, { timeout: 15000 }).catch(() => {});
  const sv = (await e.textContent("#side")).replace(/\s+/g, " ");
  check("…a saved correction shows at once, marked as corrected", /Domaine de la Romanée-Conti\s*✎ corrected.*3\.6 ha/.test(sv), sv.slice(0, 400));
  const arow = (gas.rows(SHEET_ATLAS) || []).find(r => r[2] === "richebourg" && r[3] === "drc") || [];
  check("…and is stored in the sheet with who made it (the name isn't given out to anyone not logged in)", arow[1] === "eva" && +arow[4] === 3.6 && /domaine website/.test(arow[8])
    && (gas.call({ action: "atlas" }).edits || []).every(x => !x.user), JSON.stringify(arow));
  await e.reload(); await e.waitForFunction(() => /✎ corrected/.test(document.getElementById("side").textContent), null, { timeout: 15000 }).catch(() => {});
  check("…for everyone who opens the atlas", /3\.6 ha/.test(await e.textContent("#side")));
  await e.click('#side [data-ed="leroy"]'); await e.waitForSelector("#edForm"); await e.fill("#edN", "sold, 2026"); await e.click("#edRemove");
  await e.waitForFunction(() => /Removed by correction/.test(document.getElementById("side").textContent), null, { timeout: 15000 }).catch(() => {});
  await e.waitForFunction(() => CELLAR.loaded, null, { timeout: 15000 }).catch(() => {});
  const by = await e.evaluate(() => Object.fromEntries(Object.entries(CELLAR.by).map(([k, v]) => [k, v.left])));
  check("your bottles land on their climats, by burgundy.html's matcher (a village wine stays off Chambertin)", by.chambertin === 2 && by.suchots === 3 && Object.keys(by).length === 2, JSON.stringify(by));
  check("Remove this producer takes them off the list, with a note", /Removed by correction: Domaine Leroy/.test(await e.textContent("#side")) && !(await e.$('#side [data-prod="leroy"]')));
  await p.goto(BASE + "atlas.html#r=chablis"); await p.waitForTimeout(1500);
  check("Chablis doesn't show the Côte d'Or's filters", !(await p.isVisible("#cdFilters").catch(() => false)));
  check("no page errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
