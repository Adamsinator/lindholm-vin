// A big cellar (1,300 wines, ~5,000 bottles, made up here) drawn without anything cut off or overlapping: no label or
// bubble outside its chart (the map, the cellar by taste, the vintages); the vintage chart drawn for the width its
// panel really has, not for 980 px squeezed down; the Europe map colours the countries instead of piling bubbles
// on them; on Enjoyed the table fills its column at 1,400 px with the region column given no width (not removed,
// which left Safari an empty column at the end), and no empty "drunk over time" frame when nothing has a date; a
// wine's details have no style card. Also how long the redraws take with that many wines.
//   (cd .. && python3 -m http.server 8765) & node tools/big-cellar-ui-test.js
"use strict";
const { chromium } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];

// a deterministic made-up cellar: the main regions, vintages 1990–2023, some drunk (with no date)
function cellar() {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, pick = a => a[Math.floor(rnd() * a.length)];
  const AREAS = [["Frankrig", "Bourgogne", ["Gevrey-Chambertin", "Volnay", "Meursault", "Beaune"], "Rød"], ["Frankrig", "Bordeaux", ["Pauillac", "Margaux"], "Rød"],
    ["Frankrig", "Champagne", ["Cramant", "Aÿ"], "Bobler"], ["Frankrig", "Rhône", ["Hermitage", "Cornas"], "Rød"], ["Italien", "Piemonte", ["Barolo"], "Rød"],
    ["Spanien", "Rioja", [""], "Rød"], ["Tyskland", "Mosel", ["Wehlen", "Graach"], "Hvid"], ["Østrig", "Wachau", ["Spitz"], "Hvid"], ["USA", "Californien", ["Napa Valley"], "Rød"]];
  const out = []; let n = 0;
  while (n < 5000) { const [c, r, cs, t] = pick(AREAS), have = Math.min(5000 - n, pick([1, 1, 2, 3, 6, 12])), drunk = rnd() < .15 ? 1 : 0;
    out.push({ producer: "Domaine " + pick(["Mor", "Laur", "Val", "Font", "Gras"]) + pick(["eau", "ière", "and", "ot"]) + " " + out.length, name: pick(["Réserve", "Les Charmes", "Cuvée", ""]),
      country: c, region: r, commune: pick(cs), type: t, vintage: 1990 + Math.floor(rnd() * 34), qty: have + drunk, drunk, price: 100 + Math.round(rnd() * 900) });
    n += have; }
  return out;
}

(async () => {
  const b = await chromium.launch(), gas = H({ Ark1: [HEAD] }, { settings: { SIGNUP_CODE: "invite" } });
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 } });
  await require("./turnstile-fake")(ctx);
  await ctx.route(require("./api-route"), async route => { const q = JSON.parse(route.request().postData() || "{}"); await route.fulfill({ contentType: "application/json", body: JSON.stringify(gas.call(q)) }); });
  const p = await ctx.newPage(), errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  await p.goto(BASE); await p.waitForTimeout(400);
  await p.click("#gateToggle"); await p.fill("#gateUser", "bigtest"); await p.fill("#gatePass", "bigtest-pass-1"); await p.fill("#gateInvite", "invite"); await p.fill("#gatePass2", "bigtest-pass-1"); await p.fill("#gateEmail", "a@example.com"); await p.click("#gateSubmit");
  await p.waitForSelector("#recModal.open", { timeout: 20000 }); await p.check("#recOk"); await p.click("#recDone"); await p.waitForSelector("#app:not([hidden])");
  // in parts, as the import sends them; then a fresh login (the cellar drawn from the start, as a person sees it)
  await p.evaluate(async w => { for (let i = 0; i < w.length; i += 400) await api({ action: "addmany", bumps: [], wines: w.slice(i, i + 400) }); }, cellar());
  await p.reload(); await p.waitForSelector("#app:not([hidden])", { timeout: 30000 }); await p.waitForTimeout(1500);
  const bottles = await p.evaluate(() => WINES.reduce((s, w) => s + w.left, 0));
  check("about 5,000 bottles in the cellar", bottles === 5000, String(bottles));
  const outside = await p.evaluate(() => { const out = [];
    document.querySelectorAll("#overview svg").forEach(svg => { const sb = svg.getBoundingClientRect(); if (!sb.width) return;
      svg.querySelectorAll("text, circle").forEach(t => { const r = t.getBoundingClientRect(); if (!r.width) return;
        if (r.left < sb.left - 1 || r.right > sb.right + 1 || r.top < sb.top - 1 || r.bottom > sb.bottom + 1) out.push(((svg.closest("[data-panel]") || {}).dataset || {}).panel + ": " + (t.textContent || t.tagName).slice(0, 20)); }); });
    return [...new Set(out)]; });
  check("nothing in the overview's charts is drawn outside them (map, cellar by taste, vintages)", !outside.length, JSON.stringify(outside.slice(0, 6)));
  const v = await p.evaluate(() => { const s = $("vintChart"); return { box: s.parentElement.clientWidth, vb: +s.getAttribute("viewBox").split(" ")[2] }; });
  check("the vintage chart is drawn for its panel's real width (not 980 px squeezed down)", v.box > 0 && Math.abs(v.box - v.vb) < 2, JSON.stringify(v));
  const vt = await p.evaluate(() => [...document.querySelectorAll("#vintChart .vaxis")].map(t => t.textContent).filter(Boolean));
  check("…its years thinned to whole ones it has room for (1990, 1995 …), none cut to two digits", vt.length >= 5 && vt.every(y => /^(19|20)\d\d$|^NV$/.test(y)), JSON.stringify(vt));
  const eu = await p.evaluate(() => ({ dots: document.querySelectorAll("#map .dot[data-country]").length, lands: [...new Set([...document.querySelectorAll("#map .land.has")].map(l => l.dataset.country))].length }));
  check("the Europe map colours the countries (France, Italy, Spain, Germany, Austria), no bubbles on them", eu.dots === 0 && eu.lands === 5, JSON.stringify(eu));
  await p.evaluate(() => { MAP_VIEW = "country:France"; renderMap(); }); await p.waitForTimeout(300);
  const fr = await p.evaluate(() => { const r = [...document.querySelectorAll("#map .dot[data-region]")].map(c => +c.getAttribute("r")), lb = [...document.querySelectorAll("#map .dlabel")].map(t => t.getBoundingClientRect());
    const overlap = lb.some((a, i) => lb.some((b, j) => j > i && !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom))); return { maxR: Math.max(...r), overlap }; });
  check("France's regions: bubbles capped (the biggest no more than 24), no two labels on each other", fr.maxR <= 24.1 && !fr.overlap, JSON.stringify(fr));
  await p.evaluate(() => { MAP_VIEW = "europe"; renderMap(); });
  // on a computer the list scrolls in its own box: the page ends with its footer (the CVR) a short scroll away
  const box = await p.evaluate(async () => { const w = document.querySelector("#pageCellar .tablewrap"), rows = () => document.querySelectorAll("#tbl tr.main").length;
    const r0 = rows(); scrollTo(0, document.documentElement.scrollHeight); await new Promise(r => setTimeout(r, 300));
    const foot = [...document.querySelectorAll(".sitefoot")].find(f => f.offsetParent), fr = foot && foot.getBoundingClientRect();
    w.scrollTop = w.scrollHeight; await new Promise(r => setTimeout(r, 1200));
    return { scrolls: w.scrollHeight > w.clientHeight, pageH: document.documentElement.scrollHeight, footSeen: !!fr && fr.top < innerHeight && fr.bottom > 0, r0, r1: rows() }; });
  check("the wine list scrolls in its own box, and the page's footer is in reach (not after thousands of rows)", box.scrolls && box.footSeen && box.pageH < 6000, JSON.stringify(box));
  check("…and scrolling to the box's end brings the next wines", box.r1 > box.r0, JSON.stringify(box));
  await p.evaluate(() => scrollTo(0, 0));
  // a wine's details: no style card
  await p.click("#rows tr.main"); await p.waitForTimeout(600);
  check("a wine's details have no style card", !(await p.$("#rows .wstyle")));
  // Enjoyed at 1,400 px: the table fills its column, the region column has no width, no empty chart frame
  await p.setViewportSize({ width: 1400, height: 900 }); await p.evaluate(() => { location.hash = "#enjoyed"; }); await p.waitForTimeout(1200);
  const en = await p.evaluate(() => { const t = document.getElementById("eTbl"), th = t.querySelector("thead th:nth-child(3)"); return { t: Math.round(t.getBoundingClientRect().width), wrap: Math.round(t.parentElement.getBoundingClientRect().width),
    region: Math.round(th.getBoundingClientRect().width), cols: t.querySelectorAll("thead th").length, frame: getComputedStyle(document.getElementById("eTime")).display }; });
  check("Enjoyed at 1,400 px: the table fills its column, the region column given no width (still there, for Safari)", en.t === en.wrap && en.region === 0 && en.cols === 7, JSON.stringify(en));
  check("…and no empty \"drunk over time\" frame when nothing drunk has a date", en.frame === "none", en.frame);
  const ms = await p.evaluate(() => { const t = f => { const a = performance.now(); f(); return performance.now() - a; }; return Math.round(Math.max(t(renderOverview), t(renderTable), t(renderEnjoyed))); });
  check("redrawing the overview, the list or Enjoyed takes well under half a second", ms < 500, ms + " ms");
  check("no errors on the page", !errs.length, errs.slice(0, 3).join(" | "));
  await b.close();
  const pass = results.filter(Boolean).length; console.log(`\n${pass}/${results.length} passed`); process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
