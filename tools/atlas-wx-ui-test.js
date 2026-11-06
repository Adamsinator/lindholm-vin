// The growing seasons in the wine atlas (atlas-wx.js, atlas-<id>-wx.js from tools/region-weather.js): every region
// but the Côte d'Or has a weather file, and its figures hold together (each station's 1991–2020 differences average
// out to zero, seasons are temperatures a vineyard has, Huglin follows the warmth); a region's panel shows the
// warming chart, one season at a time (◀ ▶, a bar or a year in the table picks one) and the last 20; it reads in
// Danish, then French when the language changes; the Côte d'Or keeps its own chart, now with the 2026 season.
//   (cd .. && python3 -m http.server 8765) & node tools/atlas-wx-ui-test.js
"use strict";
const fs = require("fs"), path = require("path");
const { chromium } = require("./pw");
const BASE = process.env.BASE || "http://localhost:8765/";
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const R = f => path.join(__dirname, "..", f);

// ── the files ──
const src = fs.readFileSync(R("atlas.js"), "utf8");
const regs = [...src.matchAll(/\{ id: "([a-z]+)", name: "[^"]+", file: "[^"]+", (wx: "([^"]+)", )?/g)].map(m => ({ id: m[1], wx: m[3] }));
check("every region but the Côte d'Or has a weather file", regs.length >= 20 && regs.every(r => r.id === "cotedor" ? !r.wx : r.wx === `atlas-${r.id}-wx.js?v=1` || /^atlas-[a-z]+-wx\.js\?v=\d+$/.test(r.wx)), regs.filter(r => !r.wx).map(r => r.id).join());
const W = {}; regs.filter(r => r.wx).forEach(r => { const w = {}; new Function("window", fs.readFileSync(R(r.wx.split("?")[0]), "utf8"))(w); W[r.id] = w.ATLAS_WX[r.id]; });
const bad = [], F = W.chablis.f, ix = k => F.indexOf(k);
for (const [id, w] of Object.entries(W)) w.st.forEach((S, i) => {
  const ys = Object.keys(w.y[i]).map(Number), v = y => w.y[i][y];
  if (ys.length < (i ? 25 : 38)) bad.push(`${id}/${S.n}: only ${ys.length} seasons`);
  if (S.norm == null) bad.push(`${id}/${S.n}: no normal`);
  const nm = ys.filter(y => y >= 1991 && y <= 2020).map(y => v(y)[ix("anom")]), mean = nm.reduce((a, b) => a + b, 0) / nm.length;
  if (Math.abs(mean) > .06) bad.push(`${id}/${S.n}: 1991–2020 differences average ${mean.toFixed(3)}`);
  ys.forEach(y => { const r = v(y), tg = r[ix("tgs")], hg = r[ix("hug")];
    if (!(tg > 12 && tg < 25) || !(hg > 1000 && hg < 3600) || Math.abs(r[ix("anom")] - (tg - S.norm)) > .11) bad.push(`${id}/${S.n} ${y}: ${r}`);
    if (r[ix("h35")] != null && r[ix("h35")] > r[ix("h30")]) bad.push(`${id}/${S.n} ${y}: more days ≥ 35 than ≥ 30`);
    if (r[ix("frost")] && !/^0[45]-\d\d$/.test(r[ix("lf")])) bad.push(`${id}/${S.n} ${y}: last frost ${r[ix("lf")]}`); });
  // warmer seasons have higher Huglin: the two rise together
  const xs = ys.map(y => v(y)[ix("tgs")]), hs = ys.map(y => v(y)[ix("hug")]), mx = xs.reduce((a, b) => a + b) / xs.length, mh = hs.reduce((a, b) => a + b) / hs.length;
  const cor = xs.reduce((s, x, j) => s + (x - mx) * (hs[j] - mh), 0) / Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0) * hs.reduce((s, h) => s + (h - mh) ** 2, 0));
  if (cor < .9) bad.push(`${id}/${S.n}: Huglin and warmth correlate only ${cor.toFixed(2)}`);
});
check("each station's seasons hold together (normal, differences, Huglin, heat days, frost dates)", !bad.length, bad.slice(0, 6).join(" | "));
check("the south is warmer than the north: Orange's normal above Trier's by more than 3 °C", W.rhonesud.st[0].norm - W.mosel.st[0].norm > 3, `${W.rhonesud.st[0].norm} vs ${W.mosel.st[0].norm}`);
check("2003 stands out as hot in Bordeaux and the Mosel, 2021 as cool in Champagne", W.bordeaux.y[0][2003][ix("anom")] > 1 && W.mosel.y[0][2003][ix("anom")] > 1 && W.champagne.y[0][2021][ix("anom")] < 0);
check("every source is credited: Météo-France (Licence Ouverte) or DWD (CC BY 4.0)", Object.values(W).every(w => w.meta.src.every(s => /Licence Ouverte|CC BY 4\.0/.test(s)) && w.st.every(S => /^(mf|dwd)$/.test(S.src))));

(async () => {
  const b = await chromium.launch(), errs = [];
  const p = await b.newPage({ viewport: { width: 1280, height: 860 } });
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && !/net::|CORS|Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.route(/^https:\/\/(data\.geopf\.fr|sgx\.geodatenzentrum\.de)\//, r => r.abort());
  await p.goto(BASE + "atlas.html#r=champagne"); await p.waitForSelector("#side .wx", { timeout: 20000 });
  const n = Object.values(W.champagne.y[0]).filter(r => r[ix("anom")] != null).length, last = Math.max(...Object.keys(W.champagne.y[0]).map(Number));
  const s0 = await p.evaluate(() => ({ bars: document.querySelectorAll(".wx .warmchart rect").length, y: document.querySelector(".wx .vyear b").textContent, rows: document.querySelectorAll(".wx .wxtab tbody tr").length,
    head: document.querySelector(".wx h3").textContent, src: document.querySelector(".wx .src").textContent, note: document.querySelector(".wx .note").textContent }));
  check("Champagne's panel: the growing seasons, a bar a season", s0.head === "The growing seasons" && s0.bars === n, JSON.stringify(s0));
  check("…starting at the latest season, with the last 20 in the table", +s0.y === last && s0.rows === 20, s0.y + " " + s0.rows);
  check("…naming the station, its normal and the trend", /Fagnières \(Châlons\)/.test(s0.note) && /1991–2020 average \(\d+\.\d °C\)/.test(s0.note) && /[+−]\d\.\d °C per decade/.test(s0.note), s0.note);
  check("…and crediting Météo-France", /Météo-France.*Licence Ouverte.*Fagnières/.test(s0.src), s0.src);
  await p.click('.wx [data-wstep="-1"]'); await p.waitForTimeout(150);
  check("◀ goes a season back", +(await p.textContent(".wx .vyear b")) === last - 1);
  await p.click('.wx .wxtab button[data-wy="2021"]'); await p.waitForTimeout(150);
  const s1 = await p.evaluate(() => ({ y: document.querySelector(".wx .vyear b").textContent, box: document.querySelector(".wx .vyearbox").innerText, on: document.querySelector(".wx .wxtab tr.on button").textContent }));
  check("a year in the table opens that season, marked in the table", s1.y === "2021" && s1.on === "2021", JSON.stringify(s1));
  check("…with its figures: temperature, Huglin and its class, heat, rain, frost", /Apr–Sep \d+\.\d °C \(−\d\.\d\)/.test(s1.box) && /Huglin \d{4}, (cool|temperate|warm temperate)/.test(s1.box) && /mm rain Apr–Sep/.test(s1.box) && /(frost nights? after 1 April \(last \d+\/[45]\)|no spring frost)/.test(s1.box), s1.box);
  await p.click('.wx .warmchart rect[data-wy="2003"]', { force: true }); await p.waitForTimeout(150);
  check("a bar in the chart opens its season", (await p.textContent(".wx .vyear b")) === "2003");
  check("…and says how it ranks", /number \d+ of \d+ seasons, warmest first|the warmest season/.test(await p.textContent(".wx .vyearbox")));
  // a vineyard's panel has no season box; back to the region brings it back
  await p.evaluate(() => select(st.pack.climats[0].id)); await p.waitForTimeout(200);
  check("a vineyard's panel leaves the seasons out", !(await p.$("#side .wx")));
  await p.evaluate(() => select(null)); await p.waitForTimeout(200);
  check("…and the region's brings them back, on the same season", (await p.textContent(".wx .vyear b")) === "2003");
  // languages: Danish, then French
  await p.click(".langpick [data-lang=da]"); await p.waitForSelector("#side .wx"); await p.waitForTimeout(300);
  const da = await p.evaluate(() => ({ h: document.querySelector(".wx h3").textContent, box: document.querySelector(".wx .vyearbox").innerText }));
  check("in Danish", da.h === "Vækstsæsonerne" && /apr\.–sep\./.test(da.box), JSON.stringify(da));
  await p.click(".langpick [data-lang=fr]"); await p.waitForTimeout(800);
  const fr = await p.evaluate(() => document.querySelector(".wx h3") && document.querySelector(".wx h3").textContent);
  check("…then French, picked after", fr === "Les saisons de végétation", String(fr));
  await p.click(".langpick [data-lang=en]"); await p.waitForTimeout(500);
  // a German region: DWD's credit, two stations in Rheinhessen
  await p.goto("about:blank"); await p.goto(BASE + "atlas.html#r=rheinhessen"); await p.waitForSelector("#side .wx", { timeout: 20000 });
  const rh = await p.evaluate(() => ({ src: document.querySelector(".wx .src").textContent, st: [...document.querySelectorAll(".wx .vyearbox .note b")].map(e => e.textContent) }));
  check("Rheinhessen: both its stations, credited to the DWD", rh.st.join() === "Alzey,Worms" && /Deutscher Wetterdienst \(CC BY 4\.0\)/.test(rh.src), JSON.stringify(rh));
  // the Côte d'Or: its own chart (with the ratings), now reaching the 2026 season, and no second one
  await p.goto("about:blank"); await p.goto(BASE + "atlas.html#r=cotedor"); await p.waitForSelector("#side .warmchart", { timeout: 25000 });
  const cd = await p.evaluate(() => ({ wx: !!document.querySelector("#side .wx"), y2026: [...document.querySelectorAll("#side .warmchart title")].some(e => /^2026:/.test(e.textContent)) }));
  check("the Côte d'Or keeps its own chart, now with 2026, and no second one", !cd.wx && cd.y2026, JSON.stringify(cd));
  // a phone: the panel fits
  const m = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  m.on("pageerror", e => errs.push(e.message));
  await m.route(/^https:\/\/(data\.geopf\.fr|sgx\.geodatenzentrum\.de)\//, r => r.abort());
  await m.goto(BASE + "atlas.html#r=mosel"); await m.waitForSelector("#side .wx", { timeout: 20000 });
  const fit = await m.evaluate(() => { const s = document.getElementById("side"), w = document.querySelector(".wx"); return { sw: s.scrollWidth, cw: s.clientWidth, tw: document.querySelector(".wxtab").getBoundingClientRect().width, ww: w.getBoundingClientRect().width }; });
  check("on a phone the panel, its chart and its table fit the width", fit.sw <= fit.cw + 1 && fit.tw <= fit.ww + 1, JSON.stringify(fit));
  check("no errors on the page", !errs.length, errs.slice(0, 3).join(" | "));
  await b.close();
  const pass = results.filter(Boolean).length; console.log(`\n${pass}/${results.length} passed`); process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
