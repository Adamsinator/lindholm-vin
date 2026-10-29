// Browser test of the static vineyard pages (v/<lang>/*.html, from tools/pages-build.js):
//   • a page shows its outline and facts with its stylesheet, under its own strict CSP, with no console errors
//   • a phone reads it without sideways scrolling
//   • "Open on the interactive map" opens the Burgundy atlas, or the region atlas, on that vineyard and in that language
//   • the sign-in page links to the vineyard index in the language you picked
//   (cd .. && python3 -m http.server 8765) & node tools/pages-ui-test.js
"use strict";
const { chromium } = require("./pw");
const BASE = process.env.BASE || "http://localhost:8765/";
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1200, height: 900 } });
  // the sign-in page talks to the API at once (usage counts, the account-help key): answer it here, never the real one
  await ctx.route(require("./api-route"), route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: false, error: "test", v: 42 }) }));
  const p = await ctx.newPage(), errs = [];
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));

  await p.goto(BASE + "v/de/romanee-conti.html");
  const s = await p.evaluate(() => ({ h1: document.querySelector("h1").textContent, lang: document.documentElement.lang,
    styled: getComputedStyle(document.querySelector("h1")).fontFamily.includes("Georgia"),
    me: document.querySelector("svg.map .me")?.getBBox().width || 0, nb: document.querySelectorAll("svg.map .nb").length,
    facts: [...document.querySelectorAll("dl.facts dt")].map(e => e.textContent) }));
  check("Romanée-Conti in German draws its outline among its neighbours, styled", s.h1 === "Romanée-Conti" && s.lang === "de" && s.styled && s.me > 20 && s.nb >= 4, JSON.stringify(s));
  check("its facts: appellation, commune, area, colour, altitude, slope", ["Appellation", "Gemeinde", "Fläche", "Farbe", "Höhe", "Hangneigung"].every(k => s.facts.includes(k)), s.facts.join());

  await p.click("a.btn.primary");
  await p.waitForFunction(() => /Romanée-Conti/.test(document.getElementById("side")?.textContent || "") && document.documentElement.lang === "de", null, { timeout: 15000 }).catch(() => {});
  const bg = await p.evaluate(() => ({ url: location.href, lang: document.documentElement.lang, side: (document.getElementById("side")?.textContent || "").slice(0, 80) }));
  check("the map button opens the Burgundy atlas on Romanée-Conti, in German", /burgundy\.html\?lang=de#c=romaneeconti/.test(bg.url) && bg.lang === "de" && /Romanée-Conti/.test(bg.side), JSON.stringify(bg));

  await p.goto(BASE + "v/fr/clos-des-myglands.html");
  await p.click("a.btn.primary");
  await p.waitForFunction(() => /Myglands/.test(document.querySelector("#side h2")?.textContent || ""), null, { timeout: 15000 }).catch(() => {});
  const at = await p.evaluate(() => ({ url: location.href, lang: document.documentElement.lang, h2: document.querySelector("#side h2")?.textContent }));
  check("a Mercurey premier cru opens the region atlas on itself, in French", /atlas\.html\?lang=fr#r=chalonnaise&c=/.test(at.url) && at.lang === "fr" && /Clos des Myglands/.test(at.h2 || ""), JSON.stringify(at));

  await p.goto(BASE + "v/da/index.html");
  const hub = await p.evaluate(() => ({ n: document.querySelectorAll("ul.links a").length, h2: [...document.querySelectorAll("h2")].map(e => e.textContent) }));
  check("the Danish index lists the vineyards of all sixteen regions (with Barolo and Barbaresco)", hub.n > 2650 && hub.h2.length === 16, JSON.stringify(hub.h2));
  await p.click('ul.links a[href="les-clos.html"]');
  check("…and its links open the vineyard", await p.evaluate(() => document.querySelector("h1").textContent === "Les Clos"));

  // the sign-in page, in French
  await p.goto(BASE + "index.html?lang=fr"); await p.waitForTimeout(600);
  const gl = await p.evaluate(() => { const a = document.getElementById("gateVineyards"); return { href: a?.getAttribute("href"), text: a?.textContent, lang: document.documentElement.lang }; });
  check("the sign-in page links to the French vineyard index", gl.href === "v/fr/index.html" && /grands crus/.test(gl.text || "") && gl.lang === "fr", JSON.stringify(gl));
  await p.evaluate(() => window.I18N.setLang("en"));
  check("…and follows a change of language", await p.evaluate(() => document.getElementById("gateVineyards").getAttribute("href")) === "v/en/index.html");

  const phone = await b.newContext({ viewport: { width: 375, height: 740 }, isMobile: true, hasTouch: true });
  const q = await phone.newPage();
  for (const f of ["v/fr/corton-charlemagne.html", "v/da/index.html", "v/de/aux-boudots.html"]) {
    await q.goto(BASE + f);
    const w = await q.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
    check(`a phone reads ${f} without sideways scrolling`, w[0] <= w[1] + 1, w.join(" > "));
  }
  check("no console errors (and nothing the pages' CSP refused)", !errs.length, errs.slice(0, 3).join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
