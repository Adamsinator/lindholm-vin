// The business page (business.html + business-page.js): what each kind of business gets, the tour (a gallery of cards cut from the real app)
// (img/business, made by tools/shot-demo.js), the prices; in four languages, on a phone, nothing loaded from elsewhere,
// and kept out of search engines until business accounts open.
//   (cd .. && python3 -m http.server 8765) & node tools/business-page-ui-test.js
"use strict";
const { chromium } = require("./pw");
const BASE = process.env.BASE || "http://localhost:8765/";
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };

(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [], other = [], bad = [];
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  p.on("request", r => { if (!r.url().startsWith(BASE) && !r.url().startsWith("data:")) other.push(r.url()); });
  p.on("response", r => { if (r.status() >= 400) bad.push(r.status() + " " + r.url()); });
  await p.goto(BASE + "business.html"); await p.waitForTimeout(800);
  check("open to search engines now (no noindex), and in the sitemap", !(await p.$('meta[name="robots"]')) && require("fs").readFileSync(require("path").join(__dirname, "..", "sitemap.xml"), "utf8").includes("https://allwine.dk/business.html"));
  const feats = await p.$$eval("#feats .feat", fs => fs.map(f => f.querySelector("h3").textContent));
  check("one business account, everything in it: quick sell, the wine card, its own wines, reordering", !(await p.$("#kinds")) && feats.some(x => /Quick sell/.test(x)) && feats.some(x => /wine card/.test(x)) && feats.some(x => /own wines/.test(x)) && feats.some(x => /Reorder/.test(x)), feats.join(" | "));
  check("…and one price for it, beside the free private cellar", JSON.stringify(await p.$$eval("#plans .plan", ps => ps.map(x => x.dataset.plan))) === JSON.stringify(["private", "business"]) && (await p.getAttribute("#plans .plan.on", "data-plan")) === "business");
  // the tour: a gallery of cards, one feature each, moved sideways
  const card = k => p.evaluate(k => { const c = document.querySelectorAll("#track .gcard")[k]; return c && [c.querySelector("h3").textContent, c.querySelector("img").getAttribute("src")]; }, k);
  const nCards = await p.evaluate(() => document.querySelectorAll("#track .gcard").length);
  check("the tour is 13 cards, one feature each, the first the stock at a glance", nCards === 13 && JSON.stringify(await card(0)) === JSON.stringify(["Stock at a glance", "img/business/kpis.webp"]), nCards + " " + JSON.stringify(await card(0)));
  check("…no numbered rings or autoplay any more", !(await p.$("#spots, #play, .spot")));
  const shots = await p.evaluate(() => [...document.getElementById("slides").content.children].map(d => d.dataset.shot));
  const sizes = await p.evaluate(async list => { const out = [];
    for (const d of ["img/business/", "img/business/da/"]) for (const s of list) { const r = await fetch(d + s + ".webp"); out.push(r.ok ? (await r.blob()).size : 0); } return out; }, shots);
  check("every card's picture is there in English and Danish", sizes.length === 26 && sizes.every(x => x > 8000), JSON.stringify(sizes));
  const sharp = await p.evaluate(async () => { const i = document.querySelector("#track .gcard img"); await i.decode().catch(() => {}); return i.naturalWidth / i.clientWidth; });
  check("…sharp: at least twice the pixels it's shown at", sharp >= 2, String(sharp));
  await p.evaluate(() => document.getElementById("tour").scrollIntoView());
  const nav = () => p.evaluate(() => ({ at: TOUR.at, prev: document.getElementById("prev").disabled, next: document.getElementById("next").disabled, dot: [...document.querySelectorAll("#dots button")].findIndex(b => b.getAttribute("aria-current") === "true") }));
  const n0 = await nav();
  check("it starts at the first card: ‹ off, its dot marked", n0.at === 0 && n0.prev && !n0.next && n0.dot === 0, JSON.stringify(n0));
  await p.click("#next"); await p.waitForTimeout(800);
  const n1 = await nav();
  check("› moves one card on, and ‹ comes on", n1.at === 1 && !n1.prev && n1.dot === 1, JSON.stringify(n1));
  await p.click('#dots button[data-k="6"]'); await p.waitForTimeout(900);
  check("a dot moves to its card (reordering)", (await nav()).at === 6 && (await p.evaluate(() => document.querySelectorAll("#track .gcard")[6].querySelector("h3").textContent)) === "Reordering", JSON.stringify(await nav()));
  await p.evaluate(() => TOUR.go(12)); await p.waitForTimeout(900);
  check("at the end › goes off", (await nav()).next, JSON.stringify(await nav()));
  // Danish
  await p.evaluate(() => I18N.setLang("da")); await p.waitForTimeout(600);
  check("in Danish: the page, the cards, their pictures and the prices", /Jeres vin, fra kælderen til glasset/.test(await p.textContent("h1")) && (await card(0))[0] === "Lageret på et øjeblik"
    && /img\/business\/da\/kpis\.webp/.test((await card(0))[1]) && /Pris efter aftale/.test(await p.textContent("#plans")), JSON.stringify(await card(0)));
  await p.evaluate(() => I18N.setLang("en")); await p.waitForTimeout(300);
  // a phone
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  check("on a phone it fits, no sideways scroll", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  check("on a phone a card takes most of the width, the next one peeking in", await p.evaluate(() => { const c = document.querySelector("#track .gcard").getBoundingClientRect(); return c.width > innerWidth * .75 && c.width < innerWidth * .9; }));
  check("…and the picture at the top keeps its shape (not squeezed to the width)", await p.evaluate(() => { const i = document.querySelector(".hero img"); return Math.abs(i.clientWidth / i.clientHeight - i.naturalWidth / i.naturalHeight) < 0.02; }));
  // the front page, logged out: further down, a card for business; and every page's footer links to it
  const f = await b.newPage({ viewport: { width: 1280, height: 900 } }); await f.goto(BASE); await f.waitForSelector("#bizband", { timeout: 10000 }).catch(() => {});
  const band = await f.evaluate(() => { const a = document.getElementById("bizband"); return a && { href: a.getAttribute("href"), h: a.querySelector("h2").textContent, below: a.getBoundingClientRect().top > document.getElementById("gateForm").getBoundingClientRect().top }; });
  check("the front page shows AllWine for business further down, linking here", band && band.href === "business.html" && /restaurants/.test(band.h) && band.below, JSON.stringify(band));
  check("…and the footer of every page links to it", await f.evaluate(() => [...document.querySelectorAll(".sitefoot a")].some(a => a.getAttribute("href") === "business.html")));
  await f.close();
  check("nothing is loaded from another site", !other.length, other.join(" "));
  check("no missing files", !bad.length, bad.join(" "));
  check("no page errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
