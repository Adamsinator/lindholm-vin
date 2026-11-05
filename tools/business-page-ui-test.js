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
  // the tour
  const slide = () => p.evaluate(() => [document.getElementById("slideT").textContent, document.getElementById("slideImg").getAttribute("src"), document.getElementById("slideN").textContent]);
  check("the tour opens on the inventory, 1 of 10", JSON.stringify(await slide()) === JSON.stringify(["Inventory", "img/business/inventory.jpg", "1 of 10"]), JSON.stringify(await slide()));
  await p.click("#next"); await p.waitForTimeout(300);
  check("› shows the next screen: quick sell", (await slide())[0] === "Quick sell" && /quicksell\.jpg/.test((await slide())[1]));
  await p.click("#prev"); await p.click("#prev"); await p.waitForTimeout(300);
  check("‹ goes back, and round from the first to the last", (await slide())[0] === "The wine atlas" && (await slide())[2] === "10 of 10");
  await p.click('#steps button[data-k="4"]'); await p.waitForTimeout(300);
  check("a step in the list jumps to it: what the guest sees, a phone screen", (await slide())[0] === "What the guest sees" && await p.evaluate(() => document.getElementById("slideImg").className === "phone"));
  await p.focus('#steps button[data-k="4"]'); await p.keyboard.press("ArrowRight"); await p.waitForTimeout(300);
  check("…and the arrow keys move on", (await slide())[0] === "On a phone");
  const imgs = await p.evaluate(() => [...document.getElementById("slides").content.children].map(d => d.dataset.img));
  const sizes = await p.evaluate(async list => Promise.all(list.map(async u => { const r = await fetch(u); return r.ok ? (await r.blob()).size : 0; })), imgs);
  check("every screen of the tour is there", sizes.length === 10 && sizes.every(n => n > 20000), JSON.stringify(sizes));
  // Danish
  await p.evaluate(() => I18N.setLang("da")); await p.waitForTimeout(600);
  check("in Danish: the page, the tour and the prices", /Jeres vin, fra kælderen til glasset/.test(await p.textContent("h1")) && /^(Vinkortet|Lager|Hurtigsalg|På en telefon|Det gæsten ser)$/.test((await slide())[0])
    && /Pris efter aftale/.test(await p.textContent("#plans")) && /af 10/.test((await slide())[2]), (await slide()).join(" | "));
  await p.evaluate(() => I18N.setLang("en")); await p.waitForTimeout(300);
  // a phone
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  check("on a phone it fits, no sideways scroll", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  check("nothing is loaded from another site", !other.length, other.join(" "));
  check("no missing files", !bad.length, bad.join(" "));
  check("no page errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
