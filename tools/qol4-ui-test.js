// "Another like this" and the calendar of closing windows (app.js, cellar-qol.js): a wine's Another like this opens
// Add with everything but the vintage, bottles and price; "Put the closing windows in my calendar" saves a valid
// .ics with a reminder (and an alert the day before) for each wine whose window ends this year or in the next two,
// none for the others, lines folded and commas escaped as the format asks.
//   (cd .. && python3 -m http.server 8765) & node tools/qol4-ui-test.js
"use strict";
const fs = require("fs");
const { chromium } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];
const Y = new Date().getFullYear();

(async () => {
  const b = await chromium.launch(), gas = H({ Ark1: [HEAD] }, { settings: { SIGNUP_CODE: "invite" } });
  const ctx = await b.newContext({ viewport: { width: 1300, height: 900 }, acceptDownloads: true });
  await require("./turnstile-fake")(ctx);
  await ctx.route(require("./api-route"), async route => { const q = JSON.parse(route.request().postData() || "{}"); await route.fulfill({ contentType: "application/json", body: JSON.stringify(gas.call(q)) }); });
  const p = await ctx.newPage(), errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  await p.goto(BASE); await p.waitForTimeout(400);
  await p.click("#gateToggle"); await p.fill("#gateUser", "karen"); await p.fill("#gatePass", "karen-pass-1"); await p.fill("#gateInvite", "invite"); await p.fill("#gatePass2", "karen-pass-1"); await p.fill("#gateEmail", "someone@example.com"); await p.click("#gateSubmit");
  await p.waitForSelector("#recModal.open", { timeout: 20000 }); await p.check("#recOk"); await p.click("#recDone");
  await p.waitForSelector("#app:not([hidden])", { timeout: 20000 });
  await p.evaluate(async y => { await api({ action: "addmany", bumps: [], wines: [
    { producer: "Domaine Closing", name: "Les Grands Champs, Vieilles Vignes", country: "Frankrig", region: "Bourgogne", commune: "Volnay", type: "Rød", grape: "Pinot Noir", vintage: 2012, qty: 2, price: 300, location: "Kælder, reol 2" },
    { producer: "Weingut Später", name: "Riesling", country: "Tyskland", region: "Mosel", type: "Hvid", vintage: y - 1, qty: 1, price: 150 },
    { producer: "Bodega Lejos", name: "Gran Reserva", country: "Spanien", region: "Rioja", type: "Rød", vintage: y - 2, qty: 3 } ] });
    await loadData(); }, Y);
  await p.waitForTimeout(500);
  // give the first a window ending next year, the second one in ten years, the third none
  await p.evaluate(async y => { const set = async (prod, from, to) => { const w = WINES.find(x => x.producer === prod); const r = await api({ action: "setwindow", row: w.row, from, to }).catch(() => null); if (r && r.wines) { WINES = normalize(r.wines); } };
    await set("Domaine Closing", y - 3, y + 1); await set("Weingut Später", y, y + 10); renderTable(); }, Y);
  const wins = await p.evaluate(() => WINES.map(w => { const d = drinkWindow(w); return [w.producer, d && d.to]; }));
  // Another like this
  await p.evaluate(() => showWine(WINES.find(x => x.producer === "Domaine Closing"))); await p.waitForTimeout(400);
  await p.click('#rows tr.detail:not([hidden]) button.wlike'); await p.waitForSelector("#addModal.open");
  const f = await p.evaluate(() => Object.fromEntries(["aProducer", "aName", "aRegion", "aCommune", "aGrape", "aLocation", "aVintage", "aType"].map(id => [id, $(id).value])));
  check("Another like this: Add opens with the wine's producer, name, region, commune, grape, location and type", f.aProducer === "Domaine Closing" && f.aName === "Les Grands Champs, Vieilles Vignes" && f.aRegion === "Bourgogne" && f.aCommune === "Volnay" && f.aGrape === "Pinot Noir" && f.aLocation === "Kælder, reol 2" && f.aType === "Rød", JSON.stringify(f));
  check("…and the vintage left for you", f.aVintage === "" && await p.evaluate(() => document.activeElement === $("aVintage")));
  await p.keyboard.press("Escape"); await p.waitForTimeout(200);
  // the calendar
  const closing = wins.filter(([, to]) => to != null && to >= Y && to <= Y + 2).map(([n]) => n);
  const dl = p.waitForEvent("download", { timeout: 10000 }); await p.evaluate(() => $("icsBtn").click()); const d = await dl;
  const ics = fs.readFileSync(await d.path(), "utf8");
  const ev = ics.split("BEGIN:VEVENT").length - 1;
  check(`the calendar file: one event per wine closing within three years (${closing.join(", ") || "none"})`, d.suggestedFilename() === "allwine-drink-windows.ics" && ev === closing.length && ev >= 1, `${ev} events · windows ${JSON.stringify(wins)}`);
  check("…a valid calendar: CRLF lines, VCALENDAR around it, an alert the day before", /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/.test(ics) && /END:VCALENDAR\r\n$/.test(ics) && ics.split("\r\n").every(l => !/\n/.test(l)) && /TRIGGER:-P1D/.test(ics));
  check("…its lines folded at 75 octets and commas escaped", ics.split("\r\n").every(l => Buffer.byteLength(l) <= 75) && /Grands Champs\\, Vieilles/.test(ics.replace(/\r\n /g, "")));
  check("…dated on the wine's last year (or soon, if that day has passed)", /DTSTART;VALUE=DATE:\d{8}/.test(ics) && (() => { const m = ics.match(/DTSTART;VALUE=DATE:(\d{4})/); return m && +m[1] >= Y && +m[1] <= Y + 2; })());
  check("no errors on the page", !errs.length, errs.slice(0, 3).join(" | "));
  await b.close();
  const pass = results.filter(Boolean).length; console.log(`\n${pass}/${results.length} passed`); process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
