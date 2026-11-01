// The site's legal side (legal.html, site-foot.js, site-info.js, privacy.html): who runs AllWine (the details Danish law
// asks for: name, address, e-mail, CVR), the terms, copyright and the data's licences, the note on local storage instead
// of cookies, and a footer on every page that leads there; Danish by default for Danish readers (it's the version that
// applies), English otherwise.
//   (cd .. && python3 -m http.server 8765) & node tools/legal-ui-test.js
"use strict";
const { chromium } = require("./pw");
const BASE = process.env.BASE || "http://localhost:8765/";
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };

(async () => {
  const b = await chromium.launch(), errs = [];
  const page = async (opt = {}) => { const c = await b.newContext({ viewport: { width: 1200, height: 900 } });
    await c.route(require("./api-route"), r => r.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: false, error: "offline" }) })); // no real API in a test
    if (opt.lang) await c.addInitScript(l => localStorage.setItem("lang", l), opt.lang);
    if (opt.info) await c.route(/site-info\.js/, r => r.fulfill({ contentType: "application/javascript", body: "window.SITE_INFO = " + JSON.stringify(opt.info) + ";" }));
    const p = await c.newPage(); p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text())); return p; };

  // English reader, nothing filled in yet
  let p = await page({ lang: "en" }); await p.goto(BASE + "legal.html"); await p.waitForTimeout(500);
  check("English: the English text, saying the Danish one applies", await p.isVisible('[data-l="en"]') && await p.isHidden('[data-l="da"]') && /the Danish version applies/.test(await p.textContent('[data-l="en"] .lead')));
  check("…not yet a business: it says a private person in Denmark runs it", /private person in Denmark/.test(await p.textContent('[data-who="en"]')));
  check("…terms, not-advice, copyright with every data source, local storage, accessibility and contact", await p.evaluate(() => ["terms", "advice", "copy", "storage", "a11y", "contact"].every(k => !!document.getElementById("en-" + k)))
    && await p.evaluate(() => { const t = document.getElementById("en-copy").textContent; return ["INAO", "IGN", "BRGM", "Landwirtschaftskammer", "GeoBasis-DE", "Natural Earth", "Licence Ouverte", "dl-de/by-2-0", "CC BY 4.0"].every(w => t.includes(w)); }));
  check("…no cookies, and why local storage needs no consent", /sets no cookies/.test(await p.textContent("#en-storage")) && /cookie order/.test(await p.textContent("#en-storage")));
  const ft = await p.textContent(".sitefoot");
  check("…the footer: © and the year, About & terms, Privacy & cookies, Data & licences", new RegExp("© .*" + new Date().getFullYear() + " AllWine").test(ft) && /About & terms/.test(ft) && /Privacy & cookies/.test(ft) && /Data & licences/.test(ft), ft);
  await p.close();

  // a Danish reader, and the details filled in
  p = await page({ lang: "da", info: { name: "AllWine v/ Test Testesen", address: "Vingade 1, 1000 København K", email: "kontakt@allwine.dk", cvr: "12345678", since: 2026 } });
  await p.goto(BASE + "legal.html"); await p.waitForTimeout(500);
  const who = await p.textContent('[data-who="da"]');
  check("Danish: the Danish text, with name, address, e-mail and CVR as the law asks", await p.isVisible('[data-l="da"]') && await p.isHidden('[data-l="en"]') && /Test Testesen/.test(who) && /Vingade 1/.test(who) && /kontakt@allwine\.dk/.test(who) && /12345678/.test(who) && !/privatperson/.test(who), who);
  check("…and the footer carries the name, the CVR and the e-mail", /AllWine v\/ Test Testesen · CVR 12345678/.test(await p.textContent(".sitefoot")) && /Om og vilkår/.test(await p.textContent(".sitefoot")) && await p.isVisible('.sitefoot a[href="mailto:kontakt@allwine.dk"]'));
  await p.close();

  // every page leads there
  for (const [path, sel] of [["index.html", "#gate .sitefoot, .sitefoot"], ["privacy.html", ".sitefoot"], ["help.html", ".sitefoot"], ["burgundy.html", ".sitefoot"]]) {
    p = await page({ lang: "en" }); await p.goto(BASE + path); await p.waitForTimeout(path === "burgundy.html" ? 2500 : 700);
    check(`${path}: a footer with About & terms`, await p.evaluate(s => [...document.querySelectorAll(s)].some(f => /About & terms/.test(f.textContent) && f.querySelector('a[href="legal.html"]')), sel)); await p.close(); }
  p = await page({ lang: "en" }); await p.goto(BASE + "privacy.html"); await p.waitForTimeout(500);
  const pv = await p.textContent("body");
  check("privacy: who is responsible, the legal basis, the US suppliers and the transfer basis, and your rights", /data controller/.test(pv) && /6\(1\)\(b\)/.test(pv) && /Data Privacy Framework/.test(pv) && /Your rights/.test(pv) && /Datatilsynet/.test(pv)); await p.close();
  p = await page({ lang: "da" }); await p.goto(BASE + "privacy.html"); await p.waitForTimeout(900);
  check("privacy in Danish: its own texts come with it (privacy-i18n-da.js)", /Hvem er ansvarlig/.test(await p.textContent("body")) && /Dine rettigheder/.test(await p.textContent("body"))); await p.close();
  p = await page({ lang: "en" }); await p.goto(BASE + "atlas.html"); await p.waitForTimeout(1000);
  check("atlas: the menu leads to About & terms", await p.evaluate(() => !!document.querySelector('#menuPanel a[href="legal.html"]')));
  check("the icon is AllWine's own (logo.svg), not an emoji", await p.evaluate(() => document.querySelector('link[rel="icon"]').getAttribute("href") === "logo.svg")); await p.close();
  check("no page errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
