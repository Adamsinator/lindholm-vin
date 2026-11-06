// Lieux-dits in the French regions beyond the Côte d'Or (atlas-<id>-ld.js from tools/region-ld.js, shown by
// atlas-ld.js): every French region has them, each one's label inside its own outline and on a cru or a village
// appellation, named in proper capitals and with its commune; on the map they come zoomed in, a climat's panel lists
// those inside it, one opens with its commune and the cadastre's credit, and the search finds them.
//   (cd .. && python3 -m http.server 8765) & node tools/region-ld-ui-test.js
"use strict";
const fs = require("fs"), path = require("path");
const { chromium } = require("./pw");
const BASE = process.env.BASE || "http://localhost:8765/";
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const R = f => path.join(__dirname, "..", f);

const src = fs.readFileSync(R("atlas.js"), "utf8");
const regs = src.slice(src.indexOf("const REGIONS"), src.indexOf("const PREVIEW")).split("\n  { id: ").slice(1).map(e => ({ id: e.match(/^"([a-z]+)"/)[1], ld: (e.match(/\bld: "([^"]+)"/) || [])[1], c: (e.match(/country: "([a-z]+)"/) || [])[1] }));
const fr = regs.filter(r => r.c === "fr");
check("every French region has its lieux-dits, no German one", fr.length >= 15 && fr.every(r => r.ld) && regs.filter(r => r.c === "de").every(r => !r.ld), JSON.stringify(regs.filter(r => (r.c === "fr") !== !!r.ld).map(r => r.id)));
const inRing = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
const ring = f => { const o = []; let x = 0, y = 0; for (let i = 0; i < f.length; i += 2) { x += f[i]; y += f[i + 1]; o.push([x, y]); } return o; };
const bad = [], counts = {};
for (const r of fr.filter(r => r.id !== "cotedor")) {
  const w = {}; new Function("window", fs.readFileSync(R(r.ld.split("?")[0]), "utf8"))(w); const L = w.ATLAS_LD[r.id]; counts[r.id] = L.ld.length;
  if (L.ld.length < 40) bad.push(`${r.id}: only ${L.ld.length}`);
  if (!/Etalab.*Licence Ouverte/.test(L.meta.source)) bad.push(`${r.id}: source`);
  L.ld.forEach(l => { if (!L.meta.communes[l[0]]) bad.push(`${r.id}: ${l[1]} has no commune`);
    if (!l[1] || l[1] === l[1].toUpperCase() || /^\(.*\)$/.test(l[1]) || /\s{2}/.test(l[1])) bad.push(`${r.id}: name "${l[1]}"`);
    if (!inRing(l[2], l[3], ring(l[4]))) bad.push(`${r.id}: ${l[1]}'s label outside its outline`); });
}
check("each lieu-dit: a commune, a name in proper capitals, its label inside its outline", !bad.length, bad.slice(0, 6).join(" | "));
console.log("  " + Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(" · "));

(async () => {
  const b = await chromium.launch(), errs = [];
  const p = await b.newPage({ viewport: { width: 1280, height: 860 } });
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && !/net::|CORS|Failed to load resource/.test(m.text()) && errs.push(m.text()));
  await p.route(/^https:\/\/(data\.geopf\.fr|sgx\.geodatenzentrum\.de)\//, r => r.abort());
  // a climat with lieux-dits of other names inside it: Montée de Tonnerre's or else the first that has some
  await p.goto(BASE + "atlas.html#r=chablis"); await p.waitForFunction(() => { try { return st.pack && st.region.id === "chablis"; } catch (e) { return false; } }, null, { timeout: 20000 });
  await p.evaluate(() => ATLAS_LDUI.want()); await p.waitForFunction(() => ATLAS_LDUI.loaded(), null, { timeout: 20000 });
  const cid = await p.evaluate(() => { const ids = st.pack.climats.map(c => c.id); for (const id of ["montee_de_tonnerre", ...ids]) { const c = byId(id); if (c && /ldlist/.test(ATLAS_LDUI.listHtml(c))) return id; } return null; });
  await p.evaluate(id => select(id, true), cid); await p.waitForSelector("#side .ldlist", { timeout: 15000 });
  const list = await p.$$eval("#side .ldlist button", bs => bs.map(x => x.textContent));
  check(`a climat's panel (${cid}) lists the lieux-dits inside it`, list.length >= 1, JSON.stringify(list));
  await p.waitForTimeout(900); /* the flight to the climat ends first */
  await p.evaluate(() => { const c = byId(st.sel), [x, y] = c.lp; setView([x - 900, y - 600, 1800, 1200]); }); await p.waitForTimeout(500);
  const drawn = await p.evaluate(() => ({ out: document.querySelectorAll("#map .ldo path").length, shown: getComputedStyle(document.querySelector("#map .ldo")).display, names: [...document.querySelectorAll("#map .tn-ld")].filter(e => e.style.display !== "none").length }));
  check("zoomed in, their outlines and names are on the map", drawn.out > 0 && drawn.shown !== "none" && drawn.names > 0, JSON.stringify(drawn));
  await p.click("#side .ldlist button"); await p.waitForTimeout(300);
  const one = await p.evaluate(() => ({ pill: document.querySelector("#side .pill").textContent, meta: document.querySelector("#side .meta").textContent, src: document.querySelector("#side .src").textContent, facts: [...document.querySelectorAll("#side .fact .l")].map(e => e.textContent) }));
  check("one opens: a lieu-dit in its commune, with its area", one.pill === "Lieu-dit" && /Chablis/.test(one.meta) && one.facts.join() === "Area", JSON.stringify(one));
  check("…credited to the cadastre, with no terrain it doesn't have", /^Outline: cadastre \(Etalab, Licence Ouverte\)\.$/.test(one.src), one.src);
  await p.click("#side #back"); await p.waitForTimeout(200);
  check("back goes to the region", !!(await p.$("#side .wx, #side h2")) && !(await p.$("#side .pill")) || (await p.textContent("#side h2")) === "Chablis");
  // the search: a lieu-dit in Bordeaux (Saint-Émilion), typed without its accents
  await p.goto("about:blank"); await p.goto(BASE + "atlas.html#r=bordeaux"); await p.waitForFunction(() => { try { return st.pack && st.region.id === "bordeaux"; } catch (e) { return false; } }, null, { timeout: 20000 });
  await p.evaluate(() => ATLAS_LDUI.want()); await p.waitForFunction(() => ATLAS_LDUI.loaded(), null, { timeout: 20000 });
  const name = await p.evaluate(() => { const L = ATLAS_LD.bordeaux; const l = L.ld.find(x => /[éèê]/.test(x[1]) && x[1].length > 8) || L.ld[0]; return l[1]; });
  await p.fill("#fSearch", name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()); await p.waitForTimeout(400);
  const hits = await p.$$eval("#gRes [role=option], #gRes li, #gRes button", els => els.map(e => e.textContent)).catch(() => []);
  check(`the search finds a lieu-dit typed without accents (${name})`, hits.some(h => h.includes(name)), JSON.stringify(hits.slice(0, 5)));
  check("no errors on the page", !errs.length, errs.slice(0, 3).join(" | "));
  await b.close();
  const pass = results.filter(Boolean).length; console.log(`\n${pass}/${results.length} passed`); process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
