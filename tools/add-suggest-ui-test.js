// Browser test of the Add form's suggestions (wine-kb.js suggest + burgundy-match.js place, wired in app.js) and of
// the wider page: a red Burgundy is Pinot Noir and a white one Chardonnay, Bourgogne Aligoté is Aligoté, Mosel is a
// white Riesling from Germany, a climat finds its commune; suggested fields follow what you change until you type in
// them yourself; and what's saved is what the form showed. Against the real Code.gs (gas-harness.js).
//   (cd .. && python3 -m http.server 8765) & node tools/add-suggest-ui-test.js        SHOTS=dir for screenshots
"use strict";
const { chromium } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/", SHOTS = process.env.SHOTS || "";
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];
const gas = H({ Ark1: [HEAD, ["Armand Rousseau", "Frankrig", "Bourgogne", "Gevrey-Chambertin", "Clos St-Jacques", "1. cru", "Rød", "Pinot Noir", 2016, 3, 4500, "", "", ""]] });
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await require("./turnstile-fake")(ctx);
  await ctx.route(require("./api-route"), async route => { const p = JSON.parse(route.request().postData() || "{}"); let r;
    if (p.action === "login") r = { ok: true, user: p.user, token: "tok", v: 26 }; else if (p.action === "prelogin") r = { ok: false, error: "bad-code", v: 27 };
    else { delete p.user; delete p.token; p.code = "test-code"; r = gas.call(p); }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(r) }); });
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  await p.goto(BASE); await p.waitForTimeout(400);
  await p.fill("#gateUser", "adam"); await p.fill("#gatePass", "pw"); await p.click("#gateSubmit");
  await p.waitForSelector("#rows tr.main", { timeout: 20000 });

  // the wider page
  const wrap = await p.$eval(".wrap", e => e.getBoundingClientRect().width);
  check("the page uses the width of a laptop screen (was 1100 px)", wrap > 1340, String(wrap));
  if (SHOTS) await p.screenshot({ path: SHOTS + "/wide-1440.png" });
  await p.setViewportSize({ width: 1920, height: 1000 });
  const w2 = await p.$eval(".wrap", e => e.getBoundingClientRect().width);
  check("…and stops at a readable 1640 px on a big screen", w2 === 1640, String(w2));
  if (SHOTS) await p.screenshot({ path: SHOTS + "/wide-1920.png" });
  await p.setViewportSize({ width: 375, height: 800 });
  check("…with no sideways scroll on a phone", await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  if (SHOTS) await p.screenshot({ path: SHOTS + "/phone.png" });
  await p.setViewportSize({ width: 1280, height: 900 });

  const v = id => p.inputValue(id);
  const open = async () => { await p.evaluate(() => { document.getElementById("addModal").classList.remove("open"); addReset(); }); await p.click("#addBtn"); await p.waitForTimeout(100); };
  const type = async (id, s) => { await p.fill(id, s); await p.waitForTimeout(60); };
  const state = async () => ({ commune: await v("#aCommune"), region: await v("#aRegion"), country: await v("#aCountry"), grape: await v("#aGrape"), type: await v("#aType"), cls: await v("#aClass") });

  await open();
  check("an empty form keeps Frankrig and Red, and says nothing", (await v("#aCountry")) === "Frankrig" && (await v("#aType")) === "Rød" && !(await p.isVisible("#aSuggest")));
  await type("#aRegion", "Mosel");
  let s = await state();
  check("Mosel → white Riesling from Tyskland", s.grape === "Riesling" && s.type === "Hvid" && s.country === "Tyskland", JSON.stringify(s));
  check("…and the form says where it came from", /Suggested from Mosel: .*grape.*colour/.test(await p.textContent("#aSuggest")), await p.textContent("#aSuggest"));
  check("…marked as suggested", await p.$eval("#aGrape", e => e.classList.contains("sg")));
  await type("#aRegion", "");
  s = await state();
  check("clearing the region takes the suggestions back", s.grape === "" && s.type === "Rød" && s.country === "Frankrig" && !(await p.isVisible("#aSuggest")), JSON.stringify(s));

  await open(); await type("#aRegion", "Bourgogne");
  s = await state();
  check("a Burgundy is red Pinot Noir by default", s.grape === "Pinot Noir" && s.type === "Rød", JSON.stringify(s));
  await p.selectOption("#aType", "Hvid"); await p.waitForTimeout(60);
  check("…choose white and it becomes Chardonnay", (await v("#aGrape")) === "Chardonnay");
  await type("#aName", "Bourgogne Aligoté");
  check("…unless it's Bourgogne Aligoté", (await v("#aGrape")) === "Aligoté");
  await type("#aGrape", "Chardonnay, Aligoté"); await type("#aName", "Bourgogne");
  check("a grape you type yourself is left alone", (await v("#aGrape")) === "Chardonnay, Aligoté");

  await open(); await type("#aCommune", "Meursault");
  s = await state();
  check("Meursault is white Chardonnay (its main wine)", s.grape === "Chardonnay" && s.type === "Hvid" && s.region === "Bourgogne", JSON.stringify(s));

  await open(); await type("#aName", "Clos St-Jacques");
  s = await state();
  check("a climat finds its commune, region, grape and classification", s.commune === "Gevrey-Chambertin" && s.region === "Bourgogne" && s.grape === "Pinot Noir" && s.cls === "1. cru", JSON.stringify(s));
  await open(); await type("#aCommune", "Puligny-Montrachet"); await type("#aName", "Les Pucelles");
  s = await state();
  check("Les Pucelles in Puligny → white Chardonnay, 1. cru", s.grape === "Chardonnay" && s.type === "Hvid" && s.cls === "1. cru", JSON.stringify(s));
  await open(); await type("#aRegion", "Champagne");
  check("Champagne is sparkling", (await v("#aType")) === "Bobler");
  await open(); await type("#aName", "Barolo Cannubi");
  s = await state();
  check("Barolo → Nebbiolo, Piemonte, Italien", s.grape === "Nebbiolo" && s.region === "Piemonte" && s.country === "Italien", JSON.stringify(s));
  await open(); await type("#aGrape", "Riesling");
  check("a white grape typed makes it white", (await v("#aType")) === "Hvid");

  // the known-wine autofill still comes first
  await open(); await type("#aProducer", "Armand Rousseau"); await type("#aName", "Clos St-Jacques");
  check("a wine you have fills in from the cellar", /Filled in .* from your Clos St-Jacques 2016/.test(await p.textContent("#aFillNote")), await p.textContent("#aFillNote"));

  // what's saved is what the form showed
  await open(); await type("#aProducer", "Egon Müller"); await type("#aName", "Scharzhofberger Kabinett"); await type("#aRegion", "Mosel"); await type("#aVintage", "2019");
  await p.click('#addForm button[type="submit"]'); await p.waitForTimeout(800);
  const row = gas.call({ code: "test-code", action: "data" }).wines.find(w => w.producer === "Egon Müller");
  check("saved: Tyskland, Mosel, Hvid, Riesling", row && row.country === "Tyskland" && row.region === "Mosel" && row.type === "Hvid" && row.grape === "Riesling", JSON.stringify(row));
  await p.click("#addBtn"); await p.waitForTimeout(100);
  check("the form starts clean after adding", (await v("#aGrape")) === "" && (await v("#aCountry")) === "Frankrig" && !(await p.isVisible("#aSuggest")));
  // in Danish
  await p.evaluate(() => { addReset(); return I18N.setLang("da"); }); await type("#aRegion", "Mosel");
  check("the note follows the language", /Foreslået ud fra Mosel: .*drue/.test(await p.textContent("#aSuggest")), await p.textContent("#aSuggest"));
  check("no console errors", !errs.length, errs.join(" | "));
  check("on a desktop the fields keep the browser's own suggestion list", (await p.getAttribute("#eaProducer", "list")) === "jProducers");

  // on a phone: the Enjoyed form with its own suggestion lists (the browser's datalist is a strip above the keyboard),
  // and filled in from where the wine is from, as the cellar's Add form is
  const pc = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await require("./turnstile-fake")(pc);
  await pc.route(require("./api-route"), async route => { const q = JSON.parse(route.request().postData() || "{}"); let r;
    if (q.action === "login") r = { ok: true, user: q.user, token: "tok", v: 26 }; else if (q.action === "prelogin") r = { ok: false, error: "bad-code", v: 27 };
    else { delete q.user; delete q.token; q.code = "test-code"; r = gas.call(q); }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(r) }); });
  const m = await pc.newPage(), merrs = []; m.on("pageerror", e => merrs.push(e.message));
  await m.goto(BASE); await m.waitForTimeout(400);
  await m.fill("#gateUser", "adam"); await m.fill("#gatePass", "pw"); await m.tap("#gateSubmit");
  await m.waitForSelector("#app:not([hidden])", { timeout: 20000 }); await m.waitForTimeout(600);
  await m.evaluate(() => { location.hash = "#enjoyed"; }); await m.waitForTimeout(400);
  await m.tap("#eAddBtn"); await m.waitForTimeout(200);
  await m.type("#eaProducer", "rous"); await m.waitForTimeout(150);
  const tl = await m.evaluate(() => { const ul = document.getElementById("eaProducer-tl"); return { shown: ul && !ul.hidden, items: ul ? [...ul.children].map(li => li.textContent) : [], list: document.getElementById("eaProducer").getAttribute("list") }; });
  check("phone: the producer field lists the cellar's producers that contain what's typed — 'rous' finds Armand Rousseau", tl.shown && tl.items.includes("Armand Rousseau") && tl.list === null, JSON.stringify(tl));
  await m.tap("#eaProducer-tl li"); await m.waitForTimeout(150);
  check("…a tap fills it in and closes the list", (await m.inputValue("#eaProducer")) === "Armand Rousseau" && await m.evaluate(() => document.getElementById("eaProducer-tl").hidden));
  await m.fill("#eaProducer", ""); await m.type("#eaProducer", "fevre"); await m.waitForTimeout(150);
  await m.evaluate(() => { document.getElementById("jProducers").innerHTML += "<option>William Fèvre</option>"; document.getElementById("eaProducer").dispatchEvent(new Event("input")); });
  await m.waitForTimeout(150);
  check("…accents and case aside: 'fevre' finds William Fèvre", (await m.evaluate(() => [...document.getElementById("eaProducer-tl").children].map(li => li.textContent))).includes("William Fèvre"));
  await m.fill("#eaProducer", "Domaine Fourrier"); await m.type("#eaWine", "Gevrey-Chambertin Combe aux Moines"); await m.waitForTimeout(300);
  const ea = { region: await m.inputValue("#eaRegion"), grape: await m.inputValue("#eaGrape"), type: await m.inputValue("#eaType"), note: await m.isVisible("#eaSuggest") ? await m.textContent("#eaSuggest") : "" };
  check("phone: the Enjoyed form fills in from where the wine is from — Gevrey-Chambertin: Bourgogne, Pinot Noir, red", ea.region === "Bourgogne" && /Pinot Noir/i.test(ea.grape) && ea.type === "Rød" && /Suggested from/.test(ea.note), JSON.stringify(ea));
  check("phone: no sideways scroll with the form and a list open", await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  if (SHOTS) { await m.fill("#eaProducer", ""); await m.type("#eaProducer", "a"); await m.waitForTimeout(200); await m.screenshot({ path: SHOTS + "/phone-enjoyed.png" }); }
  check("phone: no page errors", !merrs.length, merrs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
