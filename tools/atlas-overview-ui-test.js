// Browser test of what the atlas shows from afar and as you come closer (atlas.js layoutLabels, the start map):
//   • the Côte d'Or's first view: its villages and a few grands crus named, the vineyards outlined bold, no premier cru
//     named; closer in, the premiers crus; a phone's first view keeps the names on screen
//   • Holbæk & Odsherred: far out a dot by each parish's vines, which picks the parish; closer in only the fields
//   • the start map: a dot where each region is, its name on hover, a click straight into it
//   (cd .. && python3 -m http.server 8765) & node tools/atlas-overview-ui-test.js
"use strict";
const { chromium } = require("./pw");
const BASE = process.env.BASE || "http://localhost:8765/";
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const shown = sel => [...document.querySelectorAll(sel)].filter(t => t.style.display !== "none" && getComputedStyle(t).display !== "none");
(async () => {
  const b = await chromium.launch(), errs = [];
  const page = async opt => { const p = await (await b.newContext(opt)).newPage(); p.on("pageerror", e => errs.push(e.message)); await p.route(/^https:\/\//, r => r.abort()); return p; };
  const ready = async (p, h) => { await p.goto(BASE + "atlas.html" + h); await p.reload(); // (a new hash alone doesn't reload the page)
    await p.waitForFunction(id => typeof st === "object" && st.region && st.region.id === id && st.view && document.querySelectorAll("#map .cl").length > 5, h.match(/r=(\w+)/)[1], { timeout: 30000 }); await p.waitForTimeout(700); };
  const p = await page({ viewport: { width: 1366, height: 900 } });
  await ready(p, "#r=cotedor");
  const far = await p.evaluate(s => { const shown = eval(s), inView = t => { const r = t.getBoundingClientRect(), m = document.getElementById("map").getBoundingClientRect(); return r.right > m.left && r.left < m.right && r.bottom > m.top && r.top < m.bottom; };
    const lb = shown("#map .lb").filter(inView); return { all: lb.length, vn: lb.filter(t => t.matches(".vn")).map(t => t.textContent), p1: lb.filter(t => t.matches(".lb[class~='1er'], .lb.pv")).length,
      gc: lb.filter(t => t.matches(".lb.GC")).length, far: document.getElementById("map").classList.contains("far") }; }, String(shown));
  check("the Côte d'Or from afar: its villages named (Gevrey, Vosne, Meursault…) and a few grands crus, no premier cru or village climat",
    far.vn.length >= 12 && ["Gevrey-Chambertin", "Nuits-Saint-Georges", "Meursault", "Pommard"].every(n => far.vn.includes(n)) && far.gc >= 2 && far.gc <= 12 && far.p1 === 0 && far.all <= 35, JSON.stringify(far));
  check("…the vineyards, slivers at this scale, drawn bold", far.far);
  const near = await p.evaluate(s => { const shown = eval(s), c = st.pack.climats.find(c => c.id === "latache"), b = bbOf(c.g), w = 5000, h = w * st.view[3] / st.view[2];
    setView([(b[0] + b[2]) / 2 - w / 2, (b[1] + b[3]) / 2 - h / 2, w, h]); layoutLabels(); const m = document.getElementById("map").getBoundingClientRect();
    const lb = shown("#map .lb").filter(t => { const r = t.getBoundingClientRect(); return r.right > m.left && r.left < m.right && r.bottom > m.top && r.top < m.bottom; });
    return { p1: lb.filter(t => t.matches(".lb[class~='1er']")).length, gc: lb.filter(t => t.matches(".lb.GC")).map(t => t.textContent), far: document.getElementById("map").classList.contains("far") }; }, String(shown));
  check("…5 km across Vosne: the premiers crus named too, and the grands crus around La Tâche; no longer drawn bold", near.p1 >= 8 && ["La Tâche", "Richebourg", "Romanée-Conti"].every(n => near.gc.includes(n)) && !near.far, JSON.stringify(near));
  const ph = await page({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ready(ph, "#r=cotedor");
  const cut = await ph.evaluate(s => { const m = document.getElementById("map").getBoundingClientRect(); return eval(s)("#map .lb").map(t => [t.textContent, t.getBoundingClientRect()]).filter(([, r]) => r.width && r.bottom > m.top + 60 && r.top < m.bottom - 80)
    .filter(([, r]) => r.left < m.left - 1 || r.right > m.right + 1).map(([n]) => n); }, String(shown));
  check("a phone's first view of the Côte d'Or: no name cut off at the screen's edge", !cut.length, cut.join(", "));
  await ready(p, "#r=holbaek");
  const dots = await p.evaluate(() => [...document.querySelectorAll("#map .vd")].map(c => [c.dataset.id, +c.getAttribute("r") / (st.view[2] / document.getElementById("map").clientWidth)]));
  const ros = dots.find(d => d[0] === "rosnaes") || dots.slice().sort((a, b) => b[1] - a[1])[0];
  check("Holbæk & Odsherred from afar: a dot for each parish's vines, the larger vineyards larger", dots.length >= 10 && dots.every(d => d[1] >= 4) && ros[1] > 10, JSON.stringify(dots.slice(0, 5)));
  const id = await p.evaluate(() => { const c = [...document.querySelectorAll("#map .vd")].sort((a, b) => b.getAttribute("r") - a.getAttribute("r"))[0], r = c.getBoundingClientRect(); return [c.dataset.id, r.x + r.width / 2, r.y + r.height / 2]; });
  await p.mouse.click(id[1], id[2]); await p.waitForTimeout(500);
  check("…a click on its dot picks the parish", await p.evaluate(i => st.sel === i, id[0]), id[0]);
  const closer = await p.evaluate(() => { const w = 3000, v = st.view; setView([v[0] + v[2] / 2 - w / 2, v[1] + v[3] / 2 - w * v[3] / v[2] / 2, w, w * v[3] / v[2]]); layoutLabels(); return [...document.querySelectorAll("#map .vd")].filter(c => +c.getAttribute("r") > 0).length; });
  check("…3 km across, the fields themselves and no dots", closer === 0, closer);
  await p.goto(BASE + "atlas.html"); await p.waitForSelector("#map .hd circle"); await p.waitForTimeout(600);
  const hd = await p.evaluate(() => { const v = [...document.querySelectorAll("#map .hd")].filter(g => getComputedStyle(g).display !== "none"); return [v.length, v.filter(g => getComputedStyle(g.querySelector("text")).display !== "none").length]; });
  check("the start map: a dot where each region is, their names left for hover", hd[0] >= 30 && hd[1] === 0, JSON.stringify(hd));
  const cd = await p.evaluate(() => { const r = document.querySelector('#map .hd[data-id="cotedor"] circle').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await p.mouse.move(cd[0], cd[1]); await p.waitForTimeout(150);
  const hov = await p.evaluate(() => getComputedStyle(document.querySelector('#map .hd[data-id="cotedor"] text')).display !== "none");
  await p.mouse.click(cd[0], cd[1]); await p.waitForFunction(() => typeof st === "object" && st.region && st.region.id === "cotedor", null, { timeout: 15000 }).catch(() => {});
  check("…its name on hover, and a click opens the region", hov && await p.evaluate(() => !!(st.region && st.region.id === "cotedor")));
  check("no page errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
