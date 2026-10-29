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
  row({ Producent: "J.-A. Ferret", Land: "Frankrig", Område: "Bourgogne", Kommune: "Pouilly-Fuissé", "Mark/Navn": "Les Crays", Klassifikation: "1. cru", Type: "Hvid", Årgang: 2021, Antal: 2 }),
] });

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1300, height: 900 } });
  await require("./turnstile-fake")(ctx);
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
  await p.goto(BASE + "atlas.html"); await p.waitForTimeout(1200);
  const n = await p.evaluate(() => ({ gc: document.querySelectorAll("#map .cl.GC").length, pc: document.querySelectorAll("#map .cl.p1").length, list: [...document.querySelectorAll("#side ul.list")].map(u => u.children.length) }));
  check("Chablis draws: seven grands crus and its premiers crus", n.gc === 7 && n.pc >= 10 && n.list[0] === 7, JSON.stringify(n));
  check("…with its area totals", /107[.,]9 ha/.test(await p.textContent("#side")), (await p.textContent("#side")).slice(0, 200));
  check("…and asks to log in for your bottles", /Log in on the Cellar page/.test(await p.textContent("#side")));
  await p.click('#side button[data-c="les_clos"]'); await p.waitForTimeout(300);
  check("a grand cru opens from the list", (await p.textContent("#side h2")) === "Les Clos" && /les_clos/.test(await p.evaluate(() => location.hash)));
  await p.click("#back"); await p.fill("#fSearch", "Vaillons"); await p.dispatchEvent("#fSearch", "change"); await p.waitForTimeout(300);
  check("…a premier cru from the search, marked as named from IGN's place names", (await p.textContent("#side h2")) === "Vaillons" && /IGN's place names/.test(await p.textContent("#side")));
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
  await p.goto(BASE + "atlas.html#r=bordeaux&c=chateau_latour"); await p.waitForTimeout(2000);
  check("…Château Latour opens as a first growth, and adds a bottle with the château as producer", (await p.textContent("#side h2")) === "Château Latour" && /First growth \(1855\)/.test(await p.textContent("#side")));
  await p.click("#addHere"); await p.waitForSelector("#addModal.open", { timeout: 20000 });
  const fb = await p.evaluate(() => [aProducer.value, aName.value, aCommune.value, aRegion.value, aClass.value, aType.value].join("|"));
  check("…filled in: Château Latour, Pauillac, Bordeaux, Premier grand cru classé, red", fb === "Château Latour||Pauillac|Bordeaux|Premier grand cru classé|Rød", fb);

  // a phone
  const q = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  q.on("pageerror", e => errs.push(e.message));
  await q.goto(BASE + "atlas.html#r=chablis&c=valmur"); await q.waitForTimeout(1500);
  check("on a phone: no sideways scrolling, the vineyard open", await q.evaluate(() => document.documentElement.scrollWidth <= 391) && (await q.textContent("#side h2")) === "Valmur");
  check("no console errors", !errs.length, errs.join(" | "));
  await b.close();
  const k = results.filter(Boolean).length; console.log(`\n${k}/${results.length} passed`); process.exit(k === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
