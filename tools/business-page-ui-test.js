// The business page (business.html + business-page.js): what each kind of business gets, the tour through real screens
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
  check("kept out of search engines for now", (await p.getAttribute('meta[name="robots"]', "content")) === "noindex");
  const feats = async () => p.$$eval("#feats .feat", fs => fs.filter(f => !f.hidden).map(f => f.querySelector("h3").textContent));
  const r = await feats();
  check("a restaurant's features: quick sell and the wine card, not a price list or a domaine's own wines", r.some(x => /Quick sell/.test(x)) && r.some(x => /wine card/.test(x)) && !r.some(x => /price list|own wines/.test(x)), r.join(" | "));
  check("…and its price is the one marked", (await p.getAttribute("#plans .plan.on", "data-plan")) === "restaurant");
  await p.click('#kinds [data-kind="winemaker"]'); await p.waitForTimeout(150);
  const w = await feats();
  check("a winemaker's: its own wines by vintage, no quick sell for the bar", w.some(x => /own wines/.test(x)) && !w.some(x => /by the bottle or the glass/.test(x)) && (await p.getAttribute("#plans .plan.on", "data-plan")) === "winemaker" && /#winemaker$/.test(p.url()), w.join(" | "));
  // the tour: a slideshow that plays by itself, each screen's callouts one by one
  const slide = () => p.evaluate(() => [document.getElementById("slideT").textContent, document.getElementById("slideImg").getAttribute("src"), document.getElementById("slideN").textContent]);
  const st = () => p.evaluate(() => ({ at: TOUR.at, step: TOUR.step, playing: TOUR.playing, on: [...document.querySelectorAll("#spots .spot")].findIndex(x => x.classList.contains("on")) }));
  check("the tour opens on the inventory, 1 of 11, a sharp screen (twice the pixels)", JSON.stringify(await slide()) === JSON.stringify(["Inventory", "img/business/inventory.webp", "1 of 11"])
    && await p.evaluate(() => document.getElementById("slideImg").naturalWidth >= 2200), JSON.stringify(await slide()));
  const shots = await p.evaluate(() => [...document.getElementById("slides").content.children].map(d => ({ shot: d.dataset.shot, n: d.querySelectorAll("s").length })));
  const files = await p.evaluate(async list => { const out = {};
    for (const d of ["img/business/", "img/business/da/"]) { const j = await (await fetch(d + "tour.json")).json();
      out[d] = await Promise.all(list.map(async ({ shot, n }) => { const r = await fetch(d + shot + ".webp"), sp = (j[shot] || {}).spots || [];
        return r.ok && (await r.blob()).size > 20000 && sp.length === n && sp.every(([x, y, w, h]) => x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 1.001 && y + h <= 1.001); })); }
    return out; }, shots);
  check("every screen is there in English and Danish, with a measured place for each callout", Object.values(files).every(a => a.length === 11 && a.every(Boolean)), JSON.stringify(files));
  // out of view it waits; in view it plays: the screen, then callout 1 ringed with its words
  await p.waitForTimeout(2200);
  check("out of view, it waits", (await st()).step === -1 && (await st()).at === 0, JSON.stringify(await st()));
  await p.evaluate(() => document.getElementById("tour").scrollIntoView()); await p.waitForTimeout(2300);
  const s1 = await st();
  check("in view, it plays: after the screen alone, the first callout is ringed, with its words", s1.at === 0 && s1.step === 0 && s1.on === 0
    && await p.evaluate(() => getComputedStyle(document.querySelector("#spots .bubble.on")).opacity === "1" && /under their minimum/.test(document.querySelector("#spots .bubble.on").textContent)), JSON.stringify(s1));
  check("…and its line in the list beside the screen is marked", await p.evaluate(() => document.querySelector('#callouts [aria-current="true"]').textContent.includes("under their minimum")));
  await p.waitForTimeout(3000);
  check("…then the next callout", (await st()).step === 1);
  // by hand
  await p.click("#next"); await p.waitForTimeout(400);
  check("› shows the next screen: quick sell", (await slide())[0] === "Quick sell" && /quicksell\.webp/.test((await slide())[1]) && (await st()).step === -1);
  await p.click("#prev"); await p.click("#prev"); await p.waitForTimeout(400);
  check("‹ goes back, and round from the first to the last", (await slide())[0] === "The wine atlas" && (await slide())[2] === "11 of 11");
  await p.click('#bars button[data-k="6"]'); await p.waitForTimeout(400);
  check("a step in the bar above jumps to it: what the guest sees, on a phone", (await slide())[0] === "What the guest sees" && await p.evaluate(() => document.getElementById("screen").classList.contains("phone")));
  await p.focus('#bars button[data-k="6"]'); await p.keyboard.press("ArrowRight"); await p.waitForTimeout(400);
  check("…and the arrow keys move on", (await slide())[0] === "On a phone");
  await p.click('#bars button[data-k="3"]'); await p.waitForTimeout(400); await p.click('#callouts button[data-c="2"]'); await p.waitForTimeout(300);
  const s2 = await st();
  check("a callout picked in the list is shown, and the show waits there", s2.at === 3 && s2.step === 2 && s2.on === 2 && !s2.playing && await p.evaluate(() => /Play/.test(document.getElementById("play").getAttribute("aria-label"))), JSON.stringify(s2));
  await p.waitForTimeout(3500);
  check("…still there a while later", JSON.stringify(await st()) === JSON.stringify(s2));
  await p.click("#play"); await p.waitForTimeout(4600);
  check("▶ plays on from there", (await st()).at === 4 && (await st()).playing, JSON.stringify(await st()));
  // Danish
  await p.evaluate(() => I18N.setLang("da")); await p.waitForTimeout(600);
  await p.evaluate(() => TOUR.show(0, { now: true, step: 0 })); await p.waitForTimeout(400);
  check("in Danish: the page, the tour, its callouts and the prices", /Jeres vin, fra kælderen til glasset/.test(await p.textContent("h1")) && (await slide())[0] === "Lager"
    && /Pris efter aftale/.test(await p.textContent("#plans")) && /img\/business\/da\/inventory\.webp/.test((await slide())[1]) && /af 11/.test((await slide())[2])
    && /under deres minimum/.test(await p.textContent("#callouts")), (await slide()).join(" | "));
  await p.evaluate(() => I18N.setLang("en")); await p.waitForTimeout(300);
  // a phone
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  check("on a phone it fits, no sideways scroll", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  check("on a phone the words of the callouts are in the list, not over the screen", await p.evaluate(() => getComputedStyle(document.querySelector("#spots .bubble")).display === "none" && document.querySelectorAll("#callouts button").length === 4));
  // with reduced motion asked for, it doesn't play by itself
  const q = await b.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" }); await q.goto(BASE + "business.html#tour"); await q.waitForTimeout(400);
  await q.evaluate(() => document.getElementById("tour").scrollIntoView()); await q.waitForTimeout(2600);
  check("with reduced motion, it waits for a click", await q.evaluate(() => !TOUR.playing && TOUR.step === -1 && TOUR.at === 0)); await q.close();
  check("nothing is loaded from another site", !other.length, other.join(" "));
  check("no missing files", !bad.length, bad.join(" "));
  check("no page errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
