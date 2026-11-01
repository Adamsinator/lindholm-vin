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
  row({ Producent: "Marcel Lapierre", Land: "Frankrig", Område: "Beaujolais", "Mark/Navn": "Morgon", Type: "Rød", Årgang: 2022, Antal: 3 }),
  row({ Producent: "Château de Beaucastel", Land: "Frankrig", Område: "Rhône", "Mark/Navn": "Châteauneuf-du-Pape", Type: "Rød", Årgang: 2016, Antal: 2 }),
  row({ Producent: "Domaine Vacheron", Land: "Frankrig", Område: "Loire", Kommune: "Sancerre", "Mark/Navn": "Les Romains", Type: "Hvid", Årgang: 2021, Antal: 2 }),
  row({ Producent: "Nicolas Joly", Land: "Frankrig", Område: "Loire", "Mark/Navn": "Savennières Coulée de Serrant", Type: "Hvid", Årgang: 2017, Antal: 1 }),
  row({ Producent: "Domaine Huet", Land: "Frankrig", Område: "Loire", Kommune: "Vouvray", "Mark/Navn": "Le Haut-Lieu Sec", Type: "Hvid", Årgang: 2020, Antal: 3 }),
  row({ Producent: "J.-A. Ferret", Land: "Frankrig", Område: "Bourgogne", Kommune: "Pouilly-Fuissé", "Mark/Navn": "Les Crays", Klassifikation: "1. cru", Type: "Hvid", Årgang: 2021, Antal: 2 }),
] });

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1300, height: 900 }, permissions: ["geolocation"] });
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
  // the search on the start page looks in every region: "Wehlener" finds the Mosel's Sonnenuhr, and Enter goes there
  await p.click("#fSearch"); await p.fill("#fSearch", "wehlener sonn"); await p.waitForTimeout(800);
  const hits = await p.evaluate(() => [...document.querySelectorAll("#gRes li")].map(li => li.textContent));
  check("the start page's search finds a vineyard in any region: Wehlener Sonnenuhr, in the Mosel", /^Wehlener SonnenuhrMosel/.test(hits[0] || ""), hits.slice(0, 3).join(" | "));
  await p.press("#fSearch", "Enter"); await p.waitForTimeout(2500);
  check("…and Enter opens it there", /r=mosel&c=/.test(await p.evaluate(() => location.hash)) && (await p.textContent("#side h2")) === "Wehlener Sonnenuhr", await p.evaluate(() => location.hash));
  await p.goto(BASE + "atlas.html"); await p.waitForTimeout(800);
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
  // geology (BRGM 1:50 000): the formations under the outlines, the legend led by Chablis's Kimmeridgian, and Les Clos's own
  await p.check("#fGeol"); await p.waitForTimeout(1500);
  const geo = await p.evaluate(() => ({ paths: document.querySelectorAll("#map .geol path").length, on: document.getElementById("map").classList.contains("geolon"),
    legend: document.getElementById("legend").textContent, src: document.getElementById("side").textContent }));
  check("geology: BRGM's formations drawn under the vineyards, the legend led by the Kimmeridgian, in English", geo.paths > 5 && geo.on && /^Geology \(BRGM 1:50 000\)j8 Limestone and marl · Middle–upper Kimmeridgian/.test(geo.legend)
    && /Geology: BRGM/.test(geo.src), JSON.stringify(geo).slice(0, 300));
  await p.evaluate(() => select("les_clos", false)); await p.waitForTimeout(300);
  const lc = (await p.textContent("#side")).replace(/\s+/g, " ");
  check("…Les Clos: mostly Kimmeridgian, by share of its area, translated, the French a hover away", /Geology ?j8 Limestone and marl · Middle–upper Kimmeridgian[^%]*\d{2}%/.test(lc) && /shortened and translated/.test(lc)
    && await p.evaluate(() => /Calcaires et marnes à Exogyra virgula/.test(document.querySelector("#side .geolt span[title]").title)), lc.slice(lc.indexOf("Geology"), lc.indexOf("Geology") + 300));
  await p.uncheck("#fGeol"); await p.evaluate(() => select(null));
  check("…and it switches off", await p.evaluate(() => document.querySelector("#map .geol").style.display === "none" && !document.getElementById("map").classList.contains("geolon") && !/Kimm/.test(document.getElementById("legend").textContent)));
  // inside a region the search puts its own first, and still finds the others: Les Clos here, the Côte d'Or's Chambertin
  await p.click("#fSearch"); await p.fill("#fSearch", "les clos"); await p.waitForTimeout(800);
  const lc0 = await p.evaluate(() => [...document.querySelectorAll("#gRes li")].map(li => li.textContent));
  await p.fill("#fSearch", "chambertin"); await p.waitForTimeout(400);
  const ch0 = await p.evaluate(() => [...document.querySelectorAll("#gRes li")].map(li => li.textContent));
  check("in Chablis, 'les clos' is this region's Les Clos first; 'chambertin' finds the Côte d'Or's", /^Les ClosGrand cru/.test(lc0[0] || "") && ch0.some(x => /^ChambertinCôte d'Or/.test(x)), lc0[0] + " | " + ch0.slice(0, 2).join(" | "));
  await p.press("#fSearch", "Escape"); await p.fill("#fSearch", ""); await p.evaluate(() => document.activeElement.blur());
  // where am I: a phone inside Les Clos is told so, and the map goes there with a dot; one in Copenhagen is told how far
  const lcLL = await p.evaluate(() => { const c = st.pack.climats.find(x => x.id === "les_clos"), [E0, N0] = st.pack.meta.l93; return L93inv(E0 + c.lp[0], N0 - c.lp[1]); });
  await ctx.setGeolocation({ longitude: lcLL[0], latitude: lcLL[1], accuracy: 20 }); await p.click("#locBtn"); await p.waitForTimeout(1200);
  const me = await p.evaluate(() => ({ toast: document.getElementById("mapToast").textContent, dot: document.querySelectorAll("#map .me circle").length, sel: st.sel }));
  check("'Where am I?' inside Les Clos: says so, opens it and puts a dot there", me.toast === "You're in Les Clos." && me.dot === 2 && me.sel === "les_clos", JSON.stringify(me));
  await ctx.setGeolocation({ longitude: 12.57, latitude: 55.68 }); await p.click("#locBtn"); await p.waitForTimeout(800);
  check("…and from Copenhagen, how far the nearest vineyard is", /You're about [\d,. ]+ km from the nearest vineyard on this map\./.test(await p.textContent("#mapToast")), await p.textContent("#mapToast"));
  // the keyboard on the focused map: → pans a fifth of the width, + zooms in, 0 goes back to the whole region
  await p.focus("#map"); const k0 = await p.evaluate(() => st.view.slice());
  await p.keyboard.press("ArrowRight"); await p.waitForTimeout(350); const k1 = await p.evaluate(() => st.view.slice());
  await p.keyboard.press("+"); await p.waitForTimeout(350); const k2 = await p.evaluate(() => st.view.slice());
  await p.keyboard.press("0"); await p.waitForTimeout(500); const k3 = await p.evaluate(() => st.view.slice());
  check("the keyboard: → pans, + zooms in, 0 shows the whole region", Math.abs((k1[0] - k0[0]) / k0[2] - .2) < .01 && Math.abs(k2[2] / k1[2] - .6) < .01 && k3[2] > k2[2],
    JSON.stringify([k0, k1, k2, k3].map(v => v.map(Math.round))));
  await p.evaluate(() => select(null)); await p.waitForTimeout(200); // back to the overview for what follows
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
  await p.click("#zIn"); await p.waitForTimeout(400); const v1 = await p.evaluate(() => st.view.slice()); // the zoom glides (220 ms)
  await p.mouse.move(400, 400); await p.mouse.down(); await p.mouse.move(500, 450, { steps: 5 }); await p.mouse.up(); const v2 = await p.evaluate(() => st.view.slice());
  check("zoom and pan move the view", Math.abs(v1[2] / v0[2] - .6) < .01 && (v2[0] !== v1[0] || v2[1] !== v1[1]), JSON.stringify([v0, v1, v2].map(v => v.map(Math.round))));

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
  check("…the Mercurey bottle on Clos des Myglands", /Clos des Myglands[^\n]*in your cellar: 4/.test(await p.textContent("#side")));
  await p.goto(BASE + "atlas.html#r=maconnais&c=les_crays"); await p.waitForTimeout(1800);
  check("the Mâconnais: Pouilly-Fuissé's premier cru Les Crays, with its bottles", (await p.textContent("#side h2")) === "Les Crays" && /J\.-A\. Ferret/.test(await p.textContent("#side")));
  check("…its 22 premiers crus add up to INAO's ≈194 ha", await p.evaluate(() => { const a = st.pack.climats.filter(c => c.c === "1er" && !c.unnamed); return a.length === 22 && Math.abs(a.reduce((s, c) => s + c.ha, 0) - 194) < 4; }));

  // Champagne: villages, not vineyards; the Northern Rhône: whole appellations; Alsace: its 51 grands crus
  await p.goto(BASE + "atlas.html#r=champagne"); await p.waitForTimeout(2500);
  const cp = await p.evaluate(() => ({ gc: st.pack.climats.filter(c => c.c === "GC").length, pc: st.pack.climats.filter(c => c.c === "1er").length,
    gcHa: st.pack.climats.filter(c => c.c === "GC").reduce((s, c) => s + c.ha, 0), heads: [...document.querySelectorAll("#side h3")].map(h => h.textContent) }));
  check("Champagne: 17 grand cru and 42 premier cru villages, about 4 400 ha of grand cru vines, by sub-region", cp.gc === 17 && cp.pc === 42 && Math.abs(cp.gcHa - 4400) < 300
    && cp.heads.includes("Grand cru · Côte des Blancs") && cp.heads.includes("Premier cru · Vallée de la Marne"), JSON.stringify(cp));
  check("…the Bollinger from Aÿ on Aÿ", /Aÿ[^\n]*in your cellar: 2/.test(await p.textContent("#side")));
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
  check("…Côte-Rôtie, Hermitage and Crozes-Hermitage each get their own bottles", /Côte-Rôtie[^\n]*in your cellar: 1/.test(rh.side) && /Crozes-Hermitage[^\n]*in your cellar: 3/.test(rh.side) && /(^|[^-])Hermitage[^\n]*in your cellar: 2/.test(rh.side), rh.side.match(/[^\n]*in your cellar[^\n]*/g));
  // measured terrain: Château-Grillet's amphitheatre, steep and facing south-east; Saint-Émilion's too big for a slope
  await p.click('#side button[data-c="chateau_grillet"]'); await p.waitForTimeout(600);
  const gt = (await p.textContent("#side")).replace(/\s+/g, " ");
  check("terrain: Château-Grillet 156–229 m, facing SE, slope over 40 %, from IGN RGE ALTI", /Altitude ?156–229 m/.test(gt) && /Faces ?SE/.test(gt) && /Slope ?4\d %/.test(gt) && /RGE ALTI/.test(gt), gt.slice(0, 400));
  // the Beaujolais's ten crus and the Southern Rhône's, from INAO's map (Vacqueyras isn't on it: said so)
  await p.goto(BASE + "atlas.html#r=beaujolais"); await p.waitForTimeout(2500);
  const bj = await p.evaluate(() => ({ n: st.pack.climats.map(c => c.n).sort((a, b) => a.localeCompare(b, "fr")).join(), side: document.getElementById("side").textContent }));
  check("the Beaujolais: its ten crus, the Lapierre Morgon on Morgon", bj.n === "Brouilly,Chénas,Chiroubles,Côte de Brouilly,Fleurie,Juliénas,Morgon,Moulin-à-Vent,Régnié,Saint-Amour"
    && /Morgon[^\n]*in your cellar: 3/.test(bj.side), bj.n + " | " + (bj.side.match(/[^\n]*in your cellar[^\n]*/g) || []).join(" / "));
  // a vineyard's panel fetches the geology even with the layer off: Fleurie on granite, BRGM's γ written as γ
  await p.evaluate(() => select("fleurie", false)); await p.waitForTimeout(1500);
  const fl = (await p.textContent("#side")).replace(/\s+/g, " ");
  check("…Fleurie: on granite, with BRGM's symbol for it (γ)", /Geology[^%]*γ[^%]*Granite[^%]*\d{2}%/.test(fl), fl.slice(fl.indexOf("Geology"), fl.indexOf("Geology") + 200));
  await p.goto(BASE + "atlas.html#r=rhonesud"); await p.waitForTimeout(2500);
  const rs = await p.evaluate(() => ({ n: st.pack.climats.length, side: document.getElementById("side").textContent }));
  check("the Southern Rhône: eight cru appellations, the Beaucastel on Châteauneuf-du-Pape, and Vacqueyras said to be missing", rs.n === 8 && /Châteauneuf-du-Pape[^\n]*in your cellar: 2/.test(rs.side) && /Not drawn: Vacqueyras/.test(rs.side),
    rs.n + " | " + (rs.side.match(/[^\n]*(in your cellar|Not drawn)[^\n]*/g) || []).join(" / "));
  // the Loire, in three maps: each appellation its own cru on INAO's map, the bottles on theirs
  await p.goto(BASE + "atlas.html#r=centreloire"); await p.waitForTimeout(2500);
  const cl = await p.evaluate(() => ({ n: st.pack.climats.map(c => c.n).sort((a, b) => a.localeCompare(b, "fr")).join(), side: document.getElementById("side").textContent }));
  check("the Centre-Loire: Sancerre, Pouilly-Fumé and four more; the Vacheron on Sancerre", cl.n === "Coteaux du Giennois,Menetou-Salon,Pouilly-Fumé,Quincy,Reuilly,Sancerre" && /Sancerre[^\n]*in your cellar: 2/.test(cl.side),
    cl.n + " | " + (cl.side.match(/[^\n]*in your cellar[^\n]*/g) || []).join(" / "));
  await p.goto(BASE + "atlas.html#r=anjou"); await p.waitForTimeout(2500);
  const an = await p.evaluate(() => ({ gc: st.pack.climats.filter(c => c.c === "GC").map(c => c.n).join(), pc: st.pack.climats.filter(c => c.c === "1er").map(c => c.n).join(),
    cs: (st.pack.climats.find(c => c.n === "Coulée de Serrant") || {}).ha, side: document.getElementById("side").textContent }));
  check("Anjou: Quarts de Chaume the grand cru, Chaume the premier cru, Coulée de Serrant's 7 ha with the Joly on it, not on Savennières", an.gc === "Quarts de Chaume" && an.pc === "Chaume"
    && Math.abs(an.cs - 7) < 0.5 && /Coulée de Serrant[^\n]*in your cellar: 1/.test(an.side) && !/(^|\n)\s*Savennières[^\n]*in your cellar/.test(an.side), JSON.stringify({ gc: an.gc, pc: an.pc, cs: an.cs, b: an.side.match(/[^\n]*in your cellar[^\n]*/g) }));
  await p.goto(BASE + "atlas.html#r=touraine&c=vouvray"); await p.waitForTimeout(2500);
  check("Touraine & Saumur: Vouvray with the Huet on it", (await p.textContent("#side h2")) === "Vouvray" && /Domaine Huet/.test(await p.textContent("#side")));
  await p.goto(BASE + "atlas.html#r=alsace&c=rangen"); await p.waitForTimeout(2500);
  check("Alsace: 51 grands crus; Rangen with the Zind-Humbrecht on it", await p.evaluate(() => st.pack.climats.filter(c => c.c === "GC").length) === 51 && (await p.textContent("#side h2")) === "Rangen" && /Zind-Humbrecht/.test(await p.textContent("#side")));

  // Bordeaux: 14 cru appellations and the 1855 châteaux as points
  await p.goto(BASE + "atlas.html#r=bordeaux"); await p.waitForTimeout(2500);
  const bx = await p.evaluate(() => ({ aoc: st.pack.climats.filter(c => c.c === "AOC").length, pts: st.pack.points.length, placed: st.pack.points.filter(q => q.p).length,
    drawn: document.querySelectorAll("#map .pt").length, firsts: st.pack.points.filter(q => q.cls === "1855-1").map(q => q.n).join(), side: document.getElementById("side").textContent }));
  check("Bordeaux: 14 cru appellations; the 1855 classification's 88 châteaux, the ones on IGN's map drawn", bx.aoc === 14 && bx.pts === 88 && bx.placed >= 75 && bx.drawn === bx.placed
    && bx.firsts === "Château Lafite Rothschild,Château Latour,Château Margaux,Château Haut-Brion,Château Mouton Rothschild", JSON.stringify(bx).slice(0, 300));
  check("…the Latour on Latour, the Lamothe Guignard not on Lamothe, the Pomerol on Pomerol", /Latour[^\n]*in your cellar: 1/.test(bx.side) && /Lamothe Guignard °[^\n]*in your cellar: 2/.test(bx.side) && !/Lamothe[^ ][^\n]*in your cellar/.test(bx.side.replace(/Lamothe Guignard[^\n]*/g, ""))
    && /Pomerol[^\n]*in your cellar: 1/.test(bx.side), bx.side.match(/[^\n]*in your cellar[^\n]*/g));
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
  check("…the Loosen lands on Wehlen's Sonnenuhr, not on one of the other four", /Wehlener Sonnenuhr[^\n]*in your cellar: 3/.test(mo.side) && !/(Zeltingen-Rachtiger|Pommerner|Neumagener|Maring-Noviander) Sonnenuhr[^\n]*in your cellar/.test(mo.side), mo.side.match(/[^\n]*in your cellar[^\n]*/g));
  await p.click('#side button[data-c="sonnenuhr_wehlen"]'); await p.waitForTimeout(300);
  const ws = await p.textContent("#side");
  check("…Wehlener Sonnenuhr: Großlage Münzlay, 42.6 ha of vines in the register, its outline beside it", /Großlage Münzlay/.test(ws) && /42[.,]6 ha/.test(ws) && /Outline on the map/.test(ws) && /Gemarkung: Wehlen/.test(ws), ws.slice(0, 300));
  await p.click("#addHere"); await p.waitForSelector("#addModal.open", { timeout: 20000 });
  const fw = await p.evaluate(() => [aName.value, aCommune.value, aRegion.value, aCountry.value, aType.value].join("|"));
  check("…'Add a bottle from here' writes it as a label does: Wehlener Sonnenuhr, Mosel, Germany", fw === "Wehlener Sonnenuhr|Bernkastel-Kues|Mosel|Tyskland|Hvid", fw);
  await p.goto(BASE + "atlas.html#r=nahe"); await p.waitForTimeout(2500);
  const nahe = await p.evaluate(() => [...document.querySelectorAll("#side li")].map(e => e.textContent).filter(x => /in your cellar/.test(x)));
  check("the Nahe: the Dönnhoff 'Niederhäuser' finds Niederhausen's Hermannshöhle", nahe.length === 1 && /Niederhausener Hermannshöhle[^\n]*in your cellar: 2/.test(nahe[0]), JSON.stringify(nahe));

  // a phone
  const q = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  q.on("pageerror", e => errs.push(e.message));
  await q.goto(BASE + "atlas.html#r=chablis&c=valmur"); await q.waitForTimeout(1500);
  check("on a phone: no sideways scrolling, the vineyard open", await q.evaluate(() => document.documentElement.scrollWidth <= 391) && (await q.textContent("#side h2")) === "Valmur");
  // touch, as on a phone map: a pinch zooms and pans together with the point under the fingers staying under them,
  // lifting a finger hands over to a pan without a jump, a double-tap zooms in, and at the closest zoom nothing slides
  const mr = await q.evaluate(() => { const b = document.getElementById("map").getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; });
  const [mx, my] = mr;
  const fire = (type, id, x, y) => q.evaluate(([type, id, x, y]) => document.getElementById("map").dispatchEvent(new PointerEvent(type,
    { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: "touch", isPrimary: id === 1 })), [type, id, x, y]);
  const at = (x, y) => q.evaluate(([x, y]) => { const s = document.getElementById("map"), p = new DOMPoint(x, y).matrixTransform(s.getScreenCTM().inverse()); return [p.x, p.y, st.view[2]]; }, [x, y]);
  const pxOff = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) / b[2] * 390; // screen px at that zoom
  await q.click("#zHome"); await q.waitForTimeout(500);
  const t0 = await at(mx, my);
  await fire("pointerdown", 1, mx - 40, my); await fire("pointerdown", 2, mx + 40, my);
  for (let i = 1; i <= 10; i++) { await fire("pointermove", 1, mx - 40 - 4 * i, my); await fire("pointermove", 2, mx + 40 + 4 * i, my); }
  for (let i = 1; i <= 6; i++) { await fire("pointermove", 1, mx - 80 + 10 * i, my); await fire("pointermove", 2, mx + 80 + 10 * i, my); }
  await q.waitForTimeout(300); const t1 = await at(mx + 60, my);
  check("touch: a pinch zooms ×2 and the point under the fingers follows them", Math.abs(t0[2] / t1[2] - 2) < .02 && pxOff(t0, t1) < 1.5, `×${(t0[2] / t1[2]).toFixed(2)}, ${pxOff(t0, t1).toFixed(1)} px`);
  await fire("pointerup", 2, mx + 140, my); const h0 = await at(mx, my); await fire("pointermove", 1, mx - 19, my); await q.waitForTimeout(300); const h1 = await at(mx + 1, my);
  await fire("pointerup", 1, mx - 19, my); await q.waitForTimeout(300);
  check("…lifting a finger carries on as a pan, without a jump", pxOff(h0, h1) < 1.5, `${pxOff(h0, h1).toFixed(1)} px`);
  const d0 = (await at(mx, my))[2];
  for (let i = 0; i < 2; i++) { await fire("pointerdown", 1, mx, my); await fire("pointerup", 1, mx, my); await q.waitForTimeout(80); }
  await q.waitForTimeout(500);
  check("…a double-tap zooms in ×2", Math.abs(d0 / (await at(mx, my))[2] - 2) < .02);
  const l0 = await at(mx, my);
  await fire("pointerdown", 1, mx - 10, my); await fire("pointerdown", 2, mx + 10, my);
  for (let i = 1; i <= 60; i++) { await fire("pointermove", 1, mx - 10 - 6 * i, my); await fire("pointermove", 2, mx + 10 + 6 * i, my); }
  await q.waitForTimeout(300); const l1 = await at(mx, my); await fire("pointerup", 1, mx, my); await fire("pointerup", 2, mx, my);
  check("…and pinching past the closest zoom (150 m across) leaves the map where it is", Math.round(l1[2]) === 150 && pxOff(l0, l1) < 1.5, `${l1[2].toFixed(0)} m, ${pxOff(l0, l1).toFixed(1)} px`);
  check("no console errors", !errs.length, errs.join(" | "));
  await b.close();
  const k = results.filter(Boolean).length; console.log(`\n${k}/${results.length} passed`); process.exit(k === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
