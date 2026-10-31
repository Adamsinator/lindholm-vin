// A shared list end to end, in a browser against the real Apps Script (gas-harness.js): an encrypted account shares
// its cellar from the "Share list" dialog, the server gets ciphertext only, the link opens the list on share.html
// (search, prices when chosen, no notes when not), a link cut short or with the wrong key says so, and withdrawing it
// in the cellar stops the link working.
//   (cd .. && python3 -m http.server 8765) & node tools/share-ui-test.js
"use strict";
const { chromium } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note", "Anskaffet", "Drukket dato", "Rating"];
const row = o => HEAD.map(h => o[h] ?? "");
const gas = H({
  Ark1: [HEAD,
    row({ Producent: "Armand Rousseau", Land: "Frankrig", Område: "Bourgogne", Kommune: "Gevrey-Chambertin", "Mark/Navn": "Clos St-Jacques", Type: "Rød", Årgang: 2016, Antal: 3, "Pris kr (WS)": 4500, Note: "secret note" }),
    row({ Producent: "Sylvain Cathiard", Land: "Frankrig", Område: "Bourgogne", Kommune: "Vosne-Romanée", "Mark/Navn": "Aux Malconsorts", Type: "Rød", Årgang: 2017, Antal: 1, "Pris kr (WS)": 3200 }),
    row({ Producent: "Domaine Ponsot", Land: "Frankrig", Område: "Bourgogne", Kommune: "Morey-Saint-Denis", "Mark/Navn": "Clos de la Roche", Type: "Rød", Årgang: 2010, Antal: 1, Drukket: 1 }),
    row({ Producent: "Giacomo Conterno", Land: "Italien", Område: "Piemonte", Kommune: "Monforte d'Alba", "Mark/Navn": "Barolo Cascina Francia", Type: "Rød", Årgang: 2013, Antal: 2, "Pris kr (WS)": 2500 }),
  ],
  Journal: [["Dato", "Producent", "Vin", "Årgang", "Land", "Område", "Drue", "Sted", "Rating", "Pris", "Note", "Foto"]],
}, { settings: { OWNER_USER: "adam", OWNER_PASSWORD: "owner-pass-1" } });
gas.run("makeOwner()");
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await require("./turnstile-fake")(ctx);
  await ctx.route(require("./api-route"), async route => {
    const r = gas.call(JSON.parse(route.request().postData() || "{}"));
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(r) });
  });
  const errs = [], watch = p => { p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text())); };
  const p = await ctx.newPage(); watch(p);
  await p.goto(BASE); await p.waitForTimeout(500);
  await p.fill("#gateUser", "adam"); await p.fill("#gatePass", "owner-pass-1"); await p.click("#gateSubmit");
  await p.waitForSelector("#recModal.open", { timeout: 20000 }); await p.check("#recOk"); await p.click("#recDone");
  await p.waitForSelector("#app:not([hidden])", { timeout: 30000 }); await p.waitForTimeout(1500);

  await p.click("#lsBtn"); await p.waitForSelector("#lsModal.open");
  check("the dialog counts the wines in the cellar now (not the drunk one)", /^3 wines, 6 bottles$/.test(await p.textContent("#lsCount")), await p.textContent("#lsCount"));
  check("…with a title to start from, notes and prices off", (await p.inputValue("#lsName")).includes("adam") && !(await p.isChecked("#lsNotes")) && !(await p.isChecked("#lsPrices")));
  await p.fill("#lsName", "Til fredag"); await p.selectOption("#lsScope", "all"); await p.check("#lsPrices"); await p.selectOption("#lsDays", "7");
  await p.click("#lsGo"); await p.waitForSelector("#lsOut:not([hidden])", { timeout: 15000 });
  const link = await p.inputValue("#lsLink");
  check("a link comes back: share.html#<id>.<key>", /\/share\.html#[0-9a-f]{32}\.[A-Za-z0-9_-]{43}$/.test(link), link);
  const sheet = gas.rows("Shares"), blob = sheet[1] ? sheet[1].slice(5).join("") : "";
  check("the server keeps ciphertext only: no title, wine, price or key in the sheet", sheet.length === 2 && blob.length > 50
    && !/Til fredag|Rousseau|4500/.test(JSON.stringify(sheet)) && !JSON.stringify(sheet).includes(link.split(".").pop()), JSON.stringify(sheet).slice(0, 200));
  check("the dialog lists it under Your shared lists", (await p.textContent("#lsList")).includes("Til fredag") && !(await p.isHidden("#lsListH")));

  const s = await ctx.newPage(); watch(s);
  await s.goto(link); await s.waitForSelector("table", { timeout: 15000 });
  check("the link opens the list: title and counts", (await s.textContent("h1")) === "Til fredag" && /3 wines, 6 bottles/.test(await s.textContent(".meta")) && /Shared by adam/.test(await s.textContent(".meta")));
  check("…every wine still in the cellar, prices because they were chosen", (await s.$$("tbody tr")).length === 3 && (await s.textContent("tbody")).includes("Armand Rousseau") && (await s.textContent("thead")).includes("Price") && (await s.textContent("tbody")).includes("4.500 kr") && (await s.textContent("tbody")).includes("France"));
  check("…and no notes, because they weren't", !(await s.textContent("body")).includes("secret note"));
  await s.fill("#q", "barolo"); await s.waitForTimeout(100);
  check("the search narrows it, and keeps the focus in the box", (await s.$$("tbody tr")).length === 1 && await s.evaluate(() => document.activeElement.id === "q"));
  await s.click('[data-langpick] button[data-lang="da"]').catch(() => {}); await s.waitForFunction(() => document.documentElement.lang === "da", null, { timeout: 5000 }).catch(() => {});
  check("…and it speaks Danish", /flasker/.test(await s.textContent(".meta")) && (await s.textContent("thead")).includes("Årgang"), await s.textContent(".meta"));

  check("the language choice is kept for the next page", await s.evaluate(() => localStorage.getItem("lang")) === "da");
  await s.click('[data-langpick] button[data-lang="en"]'); await s.waitForFunction(() => document.documentElement.lang === "en", null, { timeout: 5000 });
  const t = await ctx.newPage(); watch(t);
  await t.goto(link.replace(/\.[^.]+$/, "")); await t.waitForSelector(".state");
  check("a link cut short says so", /isn't complete/.test(await t.textContent(".state")));
  await t.goto(BASE + "share.html#" + link.split("#")[1].replace(/\.[^.]+$/, "." + "A".repeat(43))); await t.reload(); await t.waitForSelector(".state");
  check("the wrong key says the link doesn't open it", /doesn't open the list/.test(await t.textContent(".state")), await t.textContent(".state"));

  await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("vinShares:")).forEach(k => localStorage.removeItem(k))); // as after a logout, or on another device
  await p.click("#lsCancel"); await p.click("#lsBtn"); await p.waitForFunction(() => /another device/.test(document.querySelector("#lsList").textContent), null, { timeout: 10000 }).catch(() => {});
  check("a list this browser has no key for still shows, to withdraw (no link to copy)", /another device/.test(await p.textContent("#lsList")) && !(await p.$("#lsList [data-copy]")) && !!(await p.$("#lsList [data-del]")));
  await p.click("#lsList [data-del]"); await p.waitForFunction(() => !document.querySelector("#lsList li"), null, { timeout: 10000 });
  check("withdrawing it in the cellar: gone from the list and the sheet", gas.rows("Shares").length <= 1 && await p.isHidden("#lsListH"));
  await t.goto(link); await t.reload(); await t.waitForSelector(".state");
  check("…and the link says it isn't shared any more", /isn't shared any more/.test(await t.textContent(".state")));
  check("no page errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
