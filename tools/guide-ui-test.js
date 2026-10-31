// The help a member gets (help.html, the first-steps card and the ? buttons), in a browser against the real Apps
// Script (gas-harness.js): the card shows what's done and goes once wines and a drink window are in, or when hidden;
// the ? buttons open the right part of the help page; the page has every section, in each language.
//   (cd .. && python3 -m http.server 8765) & node tools/guide-ui-test.js
"use strict";
const { chromium } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note", "Anskaffet", "Drukket dato", "Rating"];
const row = o => HEAD.map(h => o[h] ?? "");
const gas = H({
  Ark1: [HEAD, row({ Producent: "Armand Rousseau", Land: "Frankrig", Område: "Bourgogne", Kommune: "Gevrey-Chambertin", "Mark/Navn": "Clos St-Jacques", Type: "Rød", Årgang: 2016, Antal: 3 })],
  Journal: [["Dato", "Producent", "Vin", "Årgang", "Land", "Område", "Drue", "Sted", "Rating", "Pris", "Note", "Foto"]],
}, { settings: { OWNER_USER: "adam", OWNER_PASSWORD: "owner-pass-1" } });
gas.run("makeOwner()");
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await require("./turnstile-fake")(ctx);
  await ctx.route(require("./api-route"), async route => route.fulfill({ contentType: "application/json", body: JSON.stringify(gas.call(JSON.parse(route.request().postData() || "{}"))) }));
  const errs = [], watch = p => { p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text())); };
  const p = await ctx.newPage(); watch(p);
  await p.goto(BASE); await p.waitForTimeout(500);
  await p.fill("#gateUser", "adam"); await p.fill("#gatePass", "owner-pass-1"); await p.click("#gateSubmit");
  await p.waitForSelector("#recModal.open", { timeout: 20000 }); await p.check("#recOk"); await p.click("#recDone");
  await p.waitForSelector("#app:not([hidden])", { timeout: 30000 }); await p.waitForTimeout(1200);
  const tips = () => p.evaluate(() => ({ shown: !document.getElementById("tips").hidden,
    done: [...document.querySelectorAll("#tips li.done")].map(l => l.dataset.tip) }));

  let t = await tips();
  check("a member with wines but no drink window sees the first steps, the first one ticked", t.shown && t.done.join() === "wines", JSON.stringify(t));
  await p.click("#tipsClose"); await p.reload(); await p.waitForSelector("#app:not([hidden])", { timeout: 30000 }); await p.waitForTimeout(1200);
  check("hidden, it stays hidden after a reload", !(await tips()).shown);
  await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("vinTips:")).forEach(k => localStorage.removeItem(k)));
  await p.evaluate(() => loadData(true)); await p.waitForTimeout(500);
  check("…and back when that's undone", (await tips()).shown);
  await p.evaluate(() => api({ action: "setwindow", row: WINES[0].row, from: 2024, to: 2040 }).then(() => loadData(true))); await p.waitForTimeout(800);
  check("with wines and a drink window, the card goes by itself", !(await tips()).shown);

  check("the header's ? opens the help page in a new tab", (await p.getAttribute("#helpLink", "href")) === "help.html" && (await p.getAttribute("#helpLink", "target")) === "_blank");
  await p.click("#tidyBtn"); await p.waitForSelector("#tidyModal.open");
  check("a dialog's ? opens its own section (Tidy up)", (await p.getAttribute("#tidyTitle .qhint", "href")) === "help.html#tidy" && await p.isVisible("#tidyTitle .qhint"));
  await p.evaluate(() => document.querySelectorAll(".modal.open").forEach(m => m.classList.remove("open")));
  await p.click("#impBtn"); await p.click("#gridOpen");
  check("the import's title changes to the table and keeps its ?", /Add several wines/.test(await p.textContent("#impTitle")) && !!(await p.$("#impTitle .qhint")));
  await p.evaluate(() => document.querySelectorAll(".modal.open").forEach(m => m.classList.remove("open")));
  await p.click("#tbl tbody tr.main >> nth=0"); await p.waitForTimeout(300);
  check("a wine's drink window has a ? to the drink-window help", (await p.getAttribute(".winwrap .qhint", "href")) === "help.html#windows");

  // the help page
  const h = await ctx.newPage(); watch(h);
  await h.goto(BASE + "help.html#windows"); await h.waitForTimeout(400);
  const ids = await h.$$eval("section[id]", s => s.map(x => x.id)), toc = await h.$$eval("nav.toc a", a => a.map(x => x.getAttribute("href").slice(1)));
  check("every section is in the contents, and every ? lands on one", ids.length >= 12 && JSON.stringify(ids) === JSON.stringify(toc)
    && ["start", "import", "tidy", "windows", "share", "export", "atlas"].every(i => ids.includes(i)), JSON.stringify(ids));
  check("the section asked for is the one in view", await h.evaluate(() => { const r = document.getElementById("windows").getBoundingClientRect(); return r.top >= 0 && r.top < 120; }));
  const english = await h.$$eval("[data-i18n]", e => e.map(x => x.textContent.trim()));
  for (const l of ["da", "fr", "de"]) {
    await h.click(`[data-langpick] button[data-lang="${l}"]`); await h.waitForFunction(x => document.documentElement.lang === x, l, { timeout: 5000 });
    const now = await h.$$eval("[data-i18n]", e => e.map(x => x.textContent.trim()));
    const same = now.filter((x, i) => x === english[i] && !/^(← AllWine|Journal|Questions)$/.test(x));
    check(`switched to ${l}, the whole page is in it`, !same.length, same.slice(0, 3).join(" | "));
  }
  await h.click('[data-langpick] button[data-lang="en"]');
  const f = await ctx.newPage(); watch(f);
  await f.goto(BASE + "help.html?lang=fr"); await f.waitForTimeout(300);
  check("opened in French straight away, the page's own texts are there too", (await f.textContent("h1")) === "Aide" && /Pour commencer/.test(await f.textContent("#start h2")));
  await f.goto(BASE + "atlas.html"); await f.waitForTimeout(300);
  check("the atlas has a ? to the atlas help", (await f.getAttribute(".hright .helpq-d", "href")) === "help.html#atlas");
  await f.evaluate(() => localStorage.setItem("lang", "en"));
  check("no page errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
