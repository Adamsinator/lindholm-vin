// Browser test of the region atlas (atlas.html + atlas-chablis.js), with a cellar from the real Code.gs (gas-harness.js):
//   • the region draws: seven grands crus, the premiers crus, the village and regional land, no console errors
//   • a vineyard opens from the list, the search and the address; the names INAO leaves out are marked as inferred
//   • the cellar's Chablis bottles land on their vineyards (and "Only my bottles" shows just those)
//   • "On the map" in the cellar finds the vineyard; "Add a bottle from here" opens the add form filled in
//   • pan and zoom; a phone without sideways scrolling
//   (cd .. && python3 -m http.server 8765) & node tools/region-atlas-ui-test.js
"use strict";
const { chromium } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];
const row = o => HEAD.map(h => o[h] ?? "");
const gas = H({ Ark1: [HEAD,
  row({ Producent: "François Raveneau", Land: "Frankrig", Område: "Bourgogne", Kommune: "Chablis", "Mark/Navn": "Les Clos", Klassifikation: "Grand cru", Type: "Hvid", Årgang: 2019, Antal: 2 }),
  row({ Producent: "William Fèvre", Land: "Frankrig", Område: "Chablis", Kommune: "Chablis", "Mark/Navn": "Montée de Tonnerre", Klassifikation: "1. cru", Type: "Hvid", Årgang: 2020, Antal: 3 }),
  row({ Producent: "Vincent Dauvissat", Land: "Frankrig", Område: "Bourgogne", Kommune: "Chablis", "Mark/Navn": "Chablis", Type: "Hvid", Årgang: 2021, Antal: 1 }),
  row({ Producent: "Armand Rousseau", Land: "Frankrig", Område: "Bourgogne", Kommune: "Gevrey-Chambertin", "Mark/Navn": "Clos St-Jacques", Type: "Rød", Årgang: 2016, Antal: 1 }),
  row({ Producent: "Faiveley", Land: "Frankrig", Område: "Bourgogne", Kommune: "Mercurey", "Mark/Navn": "Clos des Myglands", Klassifikation: "1. cru", Type: "Rød", Årgang: 2019, Antal: 4 }),
  row({ Producent: "Bollinger", Land: "Frankrig", Område: "Champagne", Kommune: "Aÿ", "Mark/Navn": "La Grande Année", Type: "Bobler", Årgang: 2015, Antal: 2 }),
  row({ Producent: "E. Guigal", Land: "Frankrig", Område: "Rhône", Kommune: "Ampuis", "Mark/Navn": "Côte-Rôtie La Mouline", Type: "Rød", Årgang: 2017, Antal: 1 }),
  row({ Producent: "Jean-Louis Chave", Land: "Frankrig", Område: "Rhône", "Mark/Navn": "Hermitage", Type: "Rød", Årgang: 2016, Antal: 2 }),
  row({ Producent: "Alain Graillot", Land: "Frankrig", Område: "Rhône", "Mark/Navn": "Crozes-Hermitage", Type: "Rød", Årgang: 2020, Antal: 3 }),
  row({ Producent: "Zind-Humbrecht", Land: "Frankrig", Område: "Alsace", Kommune: "Thann", "Mark/Navn": "Riesling Grand Cru Rangen de Thann Clos Saint-Urbain", Type: "Hvid", Årgang: 2018, Antal: 1 }),
  row({ Producent: "Château Latour", Land: "Frankrig", Område: "Bordeaux", Kommune: "Pauillac", "Mark/Navn": "Grand Vin", Type: "Rød", Årgang: 2010, Antal: 1 }),
  row({ Producent: "Château Lamothe Guignard", Land: "Frankrig", Område: "Bordeaux", Kommune: "Sauternes", Type: "Hvid", Årgang: 2015, Antal: 2 }),
  row({ Producent: "Pétrus", Land: "Frankrig", Område: "Bordeaux", Kommune: "Pomerol", Type: "Rød", Årgang: 2005, Antal: 1 }),
  row({ Producent: "Dr. Loosen", Land: "Tyskland", Område: "Mosel", "Mark/Navn": "Wehlener Sonnenuhr Riesling Spätlese", Type: "Hvid", Årgang: 2019, Antal: 3 }),
  row({ Producent: "Dönnhoff", Land: "Tyskland", Område: "Nahe", "Mark/Navn": "Niederhäuser Hermannshöhle Riesling GG", Type: "Hvid", Årgang: 2020, Antal: 2 }),
  row({ Producent: "J.-A. Ferret", Land: "Frankrig", Område: "Bourgogne", Kommune: "Pouilly-Fuissé", "Mark/Navn": "Les Crays", Klassifikation: "1. cru", Type: "Hvid", Årgang: 2021, Antal: 2 }),
] });

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1300, height: 900 } });
  await require("./turnstile-fake")(ctx);
  // IGN's relief tiles: a blank tile, so the test doesn't hang on the network (the placement is what's checked)
  const tilesAsked = [];
  await ctx.route(/^https:\/\/(data\.geopf\.fr|sgx\.geodatenzentrum\.de)\//, r => { tilesAsked.push(r.request().url());
    r.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGP4DwABAQEAWk1v8QAAAABJRU5ErkJggg==", "base64") }); });
  // IGN's elevation service for the slope profile (registered after the tiles: the later route wins): a slope rising 100 m
  await ctx.route(/^https:\/\/data\.geopf\.fr\/altimetrie\//, r => { const n = +(r.request().url().match(/sampling=(\d+)/) || [])[1] || 50;
    r.fulfill({ contentType: "application/json", body: JSON.stringify({ elevations: Array.from({ length: n }, (_, i) => ({ z: 150 + 100 * i / (n - 1) })) }) }); });
  await ctx.route(require("./api-route"), async route => {
    const p = JSON.parse(route.request().postData() || "{}");
    let r;
    if (p.action === "login") r = { ok: true, user: p.user, token: "tok", v: 26 };
    else if (p.action === "prelogin") r = { ok: false, error: "bad-code", v: 27 };
    else { delete p.user; delete p.token; p.code = "test-code"; r = gas.call(p); }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(r) });
  });
  const p = await ctx.newPage(), errs = [];
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));

  // logged out first
  // the start page: every region on a map of Europe, listed by country
  await p.goto(BASE + "atlas.html"); await p.waitForTimeout(800);
  const h = await p.evaluate(() => ({ home: document.body.classList.contains("home"), dots: document.querySelectorAll("#map .hd").length,
    list: document.querySelectorAll("#side button[data-go], #side a[href]").length, cl: document.querySelectorAll("#map .cl").length }));
  check("atlas.html opens on Europe: a dot and a list entry for each region, no vineyards drawn", h.home && h.dots >= 16 && h.list >= 16 && h.cl === 0, JSON.stringify(h));
  await p.click('#side button[data-go="mosel"]'); await p.waitForTimeout(2000);
  check("…a region opens from the list", /r=mosel/.test(await p.evaluate(() => location.hash)) && !(await p.evaluate(() => document.body.classList.contains("home"))) && (await p.textContent("#regionName")).includes("Mosel"));
  await p.goBack(); await p.waitForTimeout(600);
  check("…and Back returns to Europe", await p.evaluate(() => document.body.classList.contains("home") && document.querySelectorAll("#map .hd").length > 0));
  await p.goto(BASE + "atlas.html#r=chablis"); await p.reload(); await p.waitForTimeout(1200);
  const n = await p.evaluate(() => ({ gc: document.querySelectorAll("#map .cl.GC").length, pc: document.querySelectorAll("#map .cl.p1").length, list: [...document.querySelectorAll("#side ul.list")].map(u => u.children.length) }));
  check("Chablis draws: seven grands crus and its premiers crus", n.gc === 7 && n.pc >= 10 && n.list[0] === 7, JSON.stringify(n));
  check("…with its area totals", /107[.,]9 ha/.test(await p.textContent("#side")), (await p.textContent("#side")).slice(0, 200));
  check("…and asks to log in for your bottles", /Log in on the Cellar page/.test(await p.textContent("#side")));
  await p.click('#side button[data-c="les_clos"]'); await p.waitForTimeout(300);
  check("a grand cru opens from the list", (await p.textContent("#side h2")) === "Les Clos" && /les_clos/.test(await p.evaluate(() => location.hash)));
  await p.click("#back"); await p.fill("#fSearch", "Vaillons"); await p.dispatchEvent("#fSearch", "change"); await p.waitForTimeout(300);
  check("…a premier cru from the search, marked as named from IGN's place names", (await p.textContent("#side h2")) === "Vaillons" && /IGN's place names/.test(await p.textContent("#side")));
  // the ground under the vineyards: IGN's relief as tiles where the view is, and the roads, rivers and villages
  await p.click("#back"); await p.click("#zHome"); await p.waitForTimeout(900);
  const gr = await p.evaluate(() => {
    const vis = sel => [...document.querySelectorAll(sel)].filter(e => e.style.display !== "none" && getComputedStyle(e).display !== "none");
    const img = document.querySelector("#map .shade image"), m = img && img.getAttribute("transform").match(/matrix\(([-\d. ]+)\)/)[1].split(" ").map(Number);
    return { tiles: document.querySelectorAll("#map .shade image").length, m, roads: document.querySelectorAll("#map .t-fill").length,
      rivers: document.querySelectorAll("#map .t-water").length, names: vis("#map .tn").map(t => t.textContent),
      credit: /IGN \(Géoplateforme/.test(document.getElementById("side").textContent) };
  });
  // a tile at level 13–15 is 1.2–4.9 km wide here; Lambert-93 turns it a little (under 2°) but keeps it square
  const tw = gr.m && Math.hypot(gr.m[0], gr.m[1]) * 256, rot = gr.m && Math.abs(Math.atan2(gr.m[1], gr.m[0]) * 180 / Math.PI);
  check("relief: IGN's hillshade tiles laid under the view, about square and barely turned", gr.tiles > 0 && tilesAsked.length > 0 && tw > 1000 && tw < 5000 && rot < 2
    && Math.abs(Math.hypot(gr.m[2], gr.m[3]) * 256 - tw) < tw * .02, JSON.stringify({ tiles: gr.tiles, asked: tilesAsked.length, tw, rot, view: await p.evaluate(() => st.view), relief: await p.evaluate(() => st.relief) }));
  check("…the roads and rivers drawn, and the villages named — Chablis, Fleys, Chichée among them", gr.roads > 0 && gr.rivers > 0 && ["Chablis", "Fleys", "Chichée"].every(n => gr.names.includes(n)), gr.names.slice(0, 20).join());
  check("…with IGN credited", gr.credit);
  await p.uncheck("#fTopo"); await p.uncheck("#fRelief");
  const off = await p.evaluate(() => [...document.querySelectorAll("#map .topo, #map .shade")].every(g => g.style.display === "none"));
  await p.check("#fTopo"); await p.check("#fRelief");
  check("…and both switch off", off);
  // terrain search: Chablis's grands crus face south-west; "South-facing" (SE–SW) keeps them, and dims the rest
  await p.click("#terrChip"); await p.click('#terrbar [data-preset="south"]'); await p.waitForTimeout(300);
  const ts = await p.evaluate(() => ({ note: (document.querySelector("#side .terrhit") || {}).textContent || "", dim: [...document.querySelectorAll("#map .cl.dim")].map(e => e.dataset.id),
    lit: [...document.querySelectorAll("#map .cl:not(.dim)")].map(e => e.dataset.id), on: [...document.querySelectorAll("#tAsp .on")].map(b => b.textContent).join() }));
  // (Valmur, at 256°, faces west-south-west: it's dimmed, rightly)
  check("terrain search: south-facing (SE·S·SW) keeps Les Clos and Vaudésir, dims Valmur, and lists what matches", ts.on === "SE,S,SW" && ts.lit.includes("les_clos") && ts.lit.includes("vaudesir") && ts.dim.includes("valmur")
    && ts.dim.length > 0 && /vineyards match the terrain search/.test(ts.note), JSON.stringify({ on: ts.on, lit: ts.lit.length, dim: ts.dim.length, note: ts.note.slice(0, 80) }));
  await p.click("#tClear"); check("…and Clear lights them all again", await p.evaluate(() => !document.querySelector("#map .cl.dim")));
  await p.click("#terrChip");
  // compare: Les Clos, then Vaillons
  await p.click('#side button[data-c="les_clos"]'); await p.click("#cmpBtn"); await p.click("#back"); await p.click('#side button[data-c="vaillons"]'); await p.waitForTimeout(300);
  const cm = await p.evaluate(() => [...document.querySelectorAll("#side table.cmpv tr")].map(r => [...r.cells].map(c => c.textContent.trim()).join(" ").trim()));
  check("compare: Les Clos beside Vaillons — class, altitude, the way each faces", cm.length >= 6 && /Les Clos.*Vaillons/.test(cm[0]) && cm.some(r => /^Class Grand cru Premier cru/.test(r)) && cm.some(r => /^Altitude \d+–\d+ m \d+–\d+ m/.test(r)), cm.join(" | "));
  // save the view as an image: Vaillons open, a PNG named after it
  const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 20000 }), p.click("#pngBtn")]);
  const png = require("fs").readFileSync(await dl.path());
  check("'Save this view as an image' gives a PNG of the view, named after the vineyard", dl.suggestedFilename() === "allwine-vaillons-chablis-wine-atlas.png" && png.slice(1, 4).toString() === "PNG" && png.length > 20000,
    dl.suggestedFilename() + " " + png.length);
  await p.click("#cmpEnd"); await p.click("#back"); await p.click("#zHome"); await p.waitForTimeout(300);
  // the slope profile: two clicks across Les Clos, the ground between them from IGN's elevation service
  await p.click("#profBtn");
  const pt = await p.evaluate(() => { const c = st.pack.climats.find(x => x.id === "les_clos"), r = svg.getBoundingClientRect(), [vx, vy, vw, vh] = st.view,
    sc = ([x, y]) => [r.left + (x - vx) / vw * r.width, r.top + (y - vy) / vh * r.height], xs = c.g[0][0].map(q => q[0]), ys = c.g[0][0].map(q => q[1]);
    return [sc([Math.min(...xs) - 200, c.lp[1]]), sc([Math.max(...xs) + 200, c.lp[1]])]; });
  await p.mouse.click(pt[0][0], pt[0][1]); await p.waitForTimeout(150); await p.mouse.click(pt[1][0], pt[1][1]); await p.waitForTimeout(800);
  const pr = await p.evaluate(() => ({ head: (document.querySelector("#profile .phead") || {}).textContent || "", labs: [...document.querySelectorAll("#profile .plab")].map(t => t.textContent), sel: st.sel }));
  check("slope profile: two clicks across Les Clos give IGN's profile, 100 m of relief, the grand cru named on it", /Slope profile/.test(pr.head) && /100 m of relief/.test(pr.head) && pr.labs.includes("Les Clos") && !pr.sel, JSON.stringify(pr));
  await p.click("#profClose"); check("…and it closes", await p.evaluate(() => document.getElementById("profile").hidden && !PROF.on));
  const v0 = await p.evaluate(() => st.view.slice());
  await p.click("#zIn"); const v1 = await p.evaluate(() => st.view.slice());
  await p.mouse.move(400, 400); await p.mouse.down(); await p.mouse.move(500, 450, { steps: 5 }); await p.mouse.up(); const v2 = await p.evaluate(() => st.view.slice());
  check("zoom and pan move the view", v1[2] < v0[2] && (v2[0] !== v1[0] || v2[1] !== v1[1]), JSON.stringify([v0, v1, v2].map(v => v.map(Math.round))));

  // the cellar on the map
  await p.goto(BASE); await p.waitForTimeout(400);
  await p.fill("#gateUser", "adam"); await p.fill("#gatePass", "pw"); await p.click("#gateSubmit");
  await p.waitForSelector("#app:not([hidden])", { timeout: 20000 }); await p.waitForTimeout(800);
  const tr = p.locator('#tbl tr.main:has-text("William Fèvre")').first(); await tr.click(); await p.waitForTimeout(250);
  const href = await p.locator('#tbl tr.main:has-text("William Fèvre") + tr.detail a.atlaslink').getAttribute("href");
  check("a Chablis bottle's 'On the map' goes to the region atlas", /^atlas\.html#r=chablis&w=/.test(href || ""), href);
  check("…a Gevrey still goes to the Burgundy atlas", /^burgundy\.html#c=/.test(await (async () => { await p.locator('#tbl tr.main:has-text("Armand Rousseau")').first().click(); await p.waitForTimeout(200);
    return p.locator('#tbl tr.main:has-text("Armand Rousseau") + tr.detail a.atlaslink').getAttribute("href"); })() || ""));
  await p.goto(BASE + href); await p.waitForTimeout(1800);
  check("…which opens on its vineyard", (await p.textContent("#side h2")) === "Montée de Tonnerre", await p.textContent("#side h2"));
  check("…with the bottles under 'In your cellar'", /In your cellar[\s\S]*William Fèvre/.test(await p.textContent("#side")));
  await p.click("#back"); await p.waitForTimeout(200);
  check("the overview counts what landed on a vineyard, and the rest", /5 bottles across 2 climats/.test(await p.textContent("#side")) && /1 more of this region/.test(await p.textContent("#side")), (await p.textContent("#side")).match(/🍷[^\n]*/));
  await p.check("#fMine"); await p.waitForTimeout(200);
  const lit = await p.$$eval("#map .cl:not(.dim)", es => es.map(e => e.dataset.id).sort().join());
  check("'Only my bottles' leaves just those vineyards", lit === "les_clos,montee_de_tonnerre", lit);
  await p.uncheck("#fMine");
  await p.click('#side button[data-c="les_clos"]'); await p.click("#addHere");
  await p.waitForSelector("#addModal.open", { timeout: 20000 });
  const f = await p.evaluate(() => [aName.value, aCommune.value, aRegion.value, aCountry.value, aClass.value, aType.value].join("|"));
  check("'Add a bottle from here' opens the add form filled in", f === "Les Clos|Chablis|Bourgogne|Frankrig|Grand cru|Hvid", f);

  // the Côte Chalonnaise and the Mâconnais: their appellations, premiers crus and bottles
  await p.goto(BASE + "atlas.html#r=chalonnaise"); await p.waitForTimeout(1800);
  const ch = await p.evaluate(() => ({ pc: st.pack.climats.filter(c => c.c === "1er" && !c.unnamed).length, apps: st.pack.villages.map(v => v.ap).join(), gcBox: document.getElementById("fGC").parentNode.hidden }));
  check("the Côte Chalonnaise: its five appellations and well over a hundred premiers crus, no grand cru filter", ch.pc > 120 && ch.apps === "Bouzeron,Rully,Mercurey,Givry,Montagny" && ch.gcBox, JSON.stringify(ch));
  check("…the Mercurey bottle on Clos des Myglands", /Clos des Myglands[^\n]*🍷 4/.test(await p.textContent("#side")));
  await p.goto(BASE + "atlas.html#r=maconnais&c=les_crays"); await p.waitForTimeout(1800);
  check("the Mâconnais: Pouilly-Fuissé's premier cru Les Crays, with its bottles", (await p.textContent("#side h2")) === "Les Crays" && /J\.-A\. Ferret/.test(await p.textContent("#side")));
  check("…its 22 premiers crus add up to INAO's ≈194 ha", await p.evaluate(() => { const a = st.pack.climats.filter(c => c.c === "1er" && !c.unnamed); return a.length === 22 && Math.abs(a.reduce((s, c) => s + c.ha, 0) - 194) < 4; }));

  // Champagne: villages, not vineyards; the Northern Rhône: whole appellations; Alsace: its 51 grands crus
  await p.goto(BASE + "atlas.html#r=champagne"); await p.waitForTimeout(2500);
  const cp = await p.evaluate(() => ({ gc: st.pack.climats.filter(c => c.c === "GC").length, pc: st.pack.climats.filter(c => c.c === "1er").length,
    gcHa: st.pack.climats.filter(c => c.c === "GC").reduce((s, c) => s + c.ha, 0), heads: [...document.querySelectorAll("#side h3")].map(h => h.textContent) }));
  check("Champagne: 17 grand cru and 42 premier cru villages, about 4 400 ha of grand cru vines, by sub-region", cp.gc === 17 && cp.pc === 42 && Math.abs(cp.gcHa - 4400) < 300
    && cp.heads.includes("Grand cru · Côte des Blancs") && cp.heads.includes("Premier cru · Vallée de la Marne"), JSON.stringify(cp));
  check("…the Bollinger from Aÿ on Aÿ", /Aÿ[^\n]*🍷 2/.test(await p.textContent("#side")));
  await p.click('#side button[data-c="chouilly"]'); await p.waitForTimeout(300);
  check("…Chouilly says its Pinot Noir is only premier cru", /Pinot Noir is rated premier cru/.test(await p.textContent("#side")) && /Vines \(IGN\)/.test(await p.textContent("#side")));
  await p.click('#side button[data-c="ay"]').catch(() => {}); await p.click("#back").catch(() => {}); await p.click('#side button[data-c="ay"]'); await p.click("#addHere");
  await p.waitForSelector("#addModal.open", { timeout: 20000 });
  const fa = await p.evaluate(() => [aName.value, aCommune.value, aRegion.value, aClass.value, aType.value].join("|"));
  check("…'Add a bottle from here' leaves the name for the cuvée: Aÿ, Champagne, grand cru, sparkling", fa === "|Aÿ|Champagne|Grand cru|Bobler", fa);
  await p.goto(BASE + "atlas.html#r=rhone"); await p.waitForTimeout(2500);
  const rh = await p.evaluate(() => ({ n: st.pack.climats.filter(c => c.c === "AOC").map(c => c.n).sort((a, b) => a.localeCompare(b, "fr")).join(), gcBox: document.getElementById("fGC").parentNode.hidden,
    pcBox: document.getElementById("f1er").parentNode.hidden, aoc: !document.getElementById("fAOC").parentNode.hidden, side: document.getElementById("side").textContent }));
  check("the Northern Rhône: its eight cru appellations, with their own filter", rh.n === "Château-Grillet,Condrieu,Cornas,Côte-Rôtie,Crozes-Hermitage,Hermitage,Saint-Joseph,Saint-Péray" && rh.gcBox && rh.pcBox && rh.aoc, JSON.stringify(rh).slice(0, 300));
  check("…Hermitage 145 ha on INAO's map, Château-Grillet under 4", /Hermitage145[.,]5ha/.test(rh.side.replace(/\s+/g, "")) && /Château-Grillet3[.,]79ha/.test(rh.side.replace(/\s+/g, "")));
  check("…Côte-Rôtie, Hermitage and Crozes-Hermitage each get their own bottles", /Côte-Rôtie[^\n]*🍷 1/.test(rh.side) && /Crozes-Hermitage[^\n]*🍷 3/.test(rh.side) && /(^|[^-])Hermitage[^\n]*🍷 2/.test(rh.side), rh.side.match(/[^\n]*🍷[^\n]*/g));
  // measured terrain: Château-Grillet's amphitheatre, steep and facing south-east; Saint-Émilion's too big for a slope
  await p.click('#side button[data-c="chateau_grillet"]'); await p.waitForTimeout(600);
  const gt = (await p.textContent("#side")).replace(/\s+/g, " ");
  check("terrain: Château-Grillet 156–229 m, facing SE, slope over 40 %, from IGN RGE ALTI", /Altitude ?156–229 m/.test(gt) && /Faces ?SE/.test(gt) && /Slope ?4\d %/.test(gt) && /RGE ALTI/.test(gt), gt.slice(0, 400));
  await p.goto(BASE + "atlas.html#r=alsace&c=rangen"); await p.waitForTimeout(2500);
  check("Alsace: 51 grands crus; Rangen with the Zind-Humbrecht on it", await p.evaluate(() => st.pack.climats.filter(c => c.c === "GC").length) === 51 && (await p.textContent("#side h2")) === "Rangen" && /Zind-Humbrecht/.test(await p.textContent("#side")));

  // Bordeaux: 14 cru appellations and the 1855 châteaux as points
  await p.goto(BASE + "atlas.html#r=bordeaux"); await p.waitForTimeout(2500);
  const bx = await p.evaluate(() => ({ aoc: st.pack.climats.filter(c => c.c === "AOC").length, pts: st.pack.points.length, placed: st.pack.points.filter(q => q.p).length,
    drawn: document.querySelectorAll("#map .pt").length, firsts: st.pack.points.filter(q => q.cls === "1855-1").map(q => q.n).join(), side: document.getElementById("side").textContent }));
  check("Bordeaux: 14 cru appellations; the 1855 classification's 88 châteaux, the ones on IGN's map drawn", bx.aoc === 14 && bx.pts === 88 && bx.placed >= 75 && bx.drawn === bx.placed
    && bx.firsts === "Château Lafite Rothschild,Château Latour,Château Margaux,Château Haut-Brion,Château Mouton Rothschild", JSON.stringify(bx).slice(0, 300));
  check("…the Latour on Latour, the Lamothe Guignard not on Lamothe, the Pomerol on Pomerol", /Latour[^\n]*🍷 1/.test(bx.side) && /Lamothe Guignard °[^\n]*🍷 2/.test(bx.side) && !/Lamothe[^ ][^\n]*🍷/.test(bx.side.replace(/Lamothe Guignard[^\n]*/g, ""))
    && /Pomerol[^\n]*🍷 1/.test(bx.side), bx.side.match(/[^\n]*🍷[^\n]*/g));
  await p.click('#side button[data-c="saint_emilion_grand_cru"]'); await p.waitForTimeout(600);
  check("…and a big appellation's slope comes with a word on what it means", /lie of the land/.test(await p.textContent("#side")));
  await p.goto(BASE + "atlas.html#r=bordeaux&c=chateau_latour"); await p.waitForTimeout(2000);
  check("…Château Latour opens as a first growth, and adds a bottle with the château as producer", (await p.textContent("#side h2")) === "Château Latour" && /First growth \(1855\)/.test(await p.textContent("#side")));
  await p.click("#addHere"); await p.waitForSelector("#addModal.open", { timeout: 20000 });
  const fb = await p.evaluate(() => [aProducer.value, aName.value, aCommune.value, aRegion.value, aClass.value, aType.value].join("|"));
  check("…filled in: Château Latour, Pauillac, Bordeaux, Premier grand cru classé, red", fb === "Château Latour||Pauillac|Bordeaux|Premier grand cru classé|Rød", fb);

  // Germany: the Einzellagen of the Weinbergsrolle
  await p.goto(BASE + "atlas.html#r=mosel"); await p.waitForTimeout(2500);
  const mo = await p.evaluate(() => ({ n: st.pack.climats.filter(c => c.c === "EL").length, el: !document.getElementById("fEL").parentNode.hidden, gc: document.getElementById("fGC").parentNode.hidden,
    side: [...document.querySelectorAll("#side h3, #side li")].map(e => e.textContent).join("\n"), src: st.pack.meta.source }));
  check("the Mosel: its 450-odd Einzellagen by Bereich, with their own filter, credited to the Landwirtschaftskammer", mo.n > 440 && mo.n < 462 && mo.el && mo.gc && /Bereich Bernkastel/.test(mo.side)
    && /©Landwirtschaftskammer RLP \(\d{4}\), dl-de\/by-2-0/.test(mo.src), JSON.stringify({ n: mo.n, el: mo.el, src: mo.src }));
  // Germany's ground: basemap.de's relief (in its own level numbering: standard zoom − 5) and the Basis-DLM's villages
  await p.waitForTimeout(1200);
  const mg = await p.evaluate(() => ({ tiles: [...document.querySelectorAll("#map .shade image")].map(i => i.getAttribute("href")),
    names: [...document.querySelectorAll("#map .tn")].map(t => t.textContent), side: document.getElementById("side").innerHTML }));
  const lv = mg.tiles.map(u => +(u.match(/DE_EPSG_3857_ADV\/(\d\d)\//) || [])[1]);
  check("the Mosel's relief: basemap.de's hillshade, at its own levels (standard 8–15 → 03–10)", mg.tiles.length > 0 && lv.every(z => z >= 3 && z <= 10), mg.tiles.slice(0, 2).join(" "));
  // Germany's terrain: Rheinland-Pfalz's 1 m model, on the vineyard land; the terrain search is there too
  const wsu = await p.evaluate(() => st.pack.climats.find(c => c.ap === "Wehlener Sonnenuhr").id);
  await p.click(`#side button[data-c="${wsu}"]`); await p.waitForTimeout(500);
  const wt = (await p.textContent("#side")).replace(/\s+/g, " ");
  check("terrain in Germany: the Wehlener Sonnenuhr faces SSW at over 40 %, from the DGM1, on its vineyard land", /Faces ?SSW/.test(wt) && /Slope ?4\d %/.test(wt) && /Rheinland-Pfalz's 1 m terrain model/.test(wt) && /vineyard land counts/.test(wt)
    && !(await p.evaluate(() => document.getElementById("terrChip").hidden)), wt.slice(0, 400));
  await p.click("#back"); await p.waitForTimeout(300);
  check("…its villages from the Basis-DLM — Bernkastel-Kues, Wehlen, Zeltingen-Rachtig", ["Bernkastel-Kues", "Wehlen", "Zeltingen-Rachtig"].every(n => mg.names.includes(n)));
  check("…and BKG and LVermGeoRP credited, with the licences linked", /GeoBasis-DE \/ <a href="https:\/\/www\.bkg\.bund\.de"[^>]*>BKG<\/a> \(\d{4}\) <a href="https:\/\/creativecommons\.org\/licenses\/by\/4\.0\/"/.test(mg.side)
    && /©GeoBasis-DE \/ LVermGeoRP \(\d{4}\), <a href="https:\/\/www\.govdata\.de\/dl-de\/by-2-0"/.test(mg.side));
  check("…the Loosen lands on Wehlen's Sonnenuhr, not on one of the other four", /Wehlener Sonnenuhr[^\n]*🍷 3/.test(mo.side) && !/(Zeltingen-Rachtiger|Pommerner|Neumagener|Maring-Noviander) Sonnenuhr[^\n]*🍷/.test(mo.side), mo.side.match(/[^\n]*🍷[^\n]*/g));
  await p.click('#side button[data-c="sonnenuhr_wehlen"]'); await p.waitForTimeout(300);
  const ws = await p.textContent("#side");
  check("…Wehlener Sonnenuhr: Großlage Münzlay, 42.6 ha of vines in the register, its outline beside it", /Großlage Münzlay/.test(ws) && /42[.,]6 ha/.test(ws) && /Outline on the map/.test(ws) && /Gemarkung: Wehlen/.test(ws), ws.slice(0, 300));
  await p.click("#addHere"); await p.waitForSelector("#addModal.open", { timeout: 20000 });
  const fw = await p.evaluate(() => [aName.value, aCommune.value, aRegion.value, aCountry.value, aType.value].join("|"));
  check("…'Add a bottle from here' writes it as a label does: Wehlener Sonnenuhr, Mosel, Germany", fw === "Wehlener Sonnenuhr|Bernkastel-Kues|Mosel|Tyskland|Hvid", fw);
  await p.goto(BASE + "atlas.html#r=nahe"); await p.waitForTimeout(2500);
  const nahe = await p.evaluate(() => [...document.querySelectorAll("#side li")].map(e => e.textContent).filter(x => /🍷/.test(x)));
  check("the Nahe: the Dönnhoff 'Niederhäuser' finds Niederhausen's Hermannshöhle", nahe.length === 1 && /Niederhausener Hermannshöhle[^\n]*🍷 2/.test(nahe[0]), JSON.stringify(nahe));

  // a phone
  const q = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  q.on("pageerror", e => errs.push(e.message));
  await q.goto(BASE + "atlas.html#r=chablis&c=valmur"); await q.waitForTimeout(1500);
  check("on a phone: no sideways scrolling, the vineyard open", await q.evaluate(() => document.documentElement.scrollWidth <= 391) && (await q.textContent("#side h2")) === "Valmur");
  check("no console errors", !errs.length, errs.join(" | "));
  await b.close();
  const k = results.filter(Boolean).length; console.log(`\n${k}/${results.length} passed`); process.exit(k === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
