// Browser test of the Import dialog against the real Code.gs (gas-harness.js), on an encrypted account: an Excel
// workbook, the column matching, a second import of the same file (duplicates: skip / add bottles), a text list, and the
// message for an old .xls file.
//   (cd .. && python3 -m http.server 8765) & node tools/import-ui-test.js
"use strict";
const path = require("path");
const { chromium } = require("./pw");
const H = require("./gas-harness");
const IMPORT = require("../import.js");
const fs = require("fs");
const BASE = process.env.BASE || "http://localhost:8765/";
const FIX = n => path.join(__dirname, "fixtures", n);
const gas = H({ Ark1: [["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"]] },
              { settings: { SIGNUP_CODE: "invite" } });
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  await require("./ask-auto")(ctx);
  const seen = [];
  await require("./turnstile-fake")(ctx);
  await ctx.route(require("./api-route"), async route => {
    const p = JSON.parse(route.request().postData() || "{}"); seen.push(p);
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(gas.call(p)) });
  });
  const p = await ctx.newPage(); const errs = [];
  const closed = () => p.waitForFunction(() => !document.getElementById("impModal").classList.contains("open"), null, { timeout: 15000 });
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  p.on("dialog", d => d.accept());
  await p.goto(BASE); await p.waitForTimeout(400);
  await p.click("#gateToggle");
  await p.fill("#gateUser", "carla"); await p.fill("#gatePass", "carla-pass-1"); await p.fill("#gateInvite", "invite"); await p.fill("#gatePass2", "carla-pass-1"); await p.fill("#gateEmail", "someone@example.com");
  await p.click("#gateSubmit");
  await p.waitForSelector("#recModal.open", { timeout: 20000 });
  await p.check("#recOk"); await p.click("#recDone");
  await p.waitForSelector("#app:not([hidden])", { timeout: 20000 });

  // an Excel workbook in the owner's layout
  await p.click("#impBtn");
  check("the dialog says the file stays in the browser", /never uploaded/.test(await p.textContent("#impLock")));
  await p.setInputFiles("#impFile", FIX("owner.xlsx"));
  await p.waitForSelector("#impMap:not([hidden])");
  check("headings found in row 3", /row 3/.test(await p.textContent("#impHint")), await p.textContent("#impHint"));
  check("the sheet picker offers both sheets", (await p.$$eval("#impSheet option", o => o.length)) === 2 && await p.isVisible("#impSheet"));
  const fields = await p.$$eval("#impCols select", s => s.map(x => x.value));
  check("each column is matched", fields.join() === "producer,country,region,commune,name,classification,type,grape,vintage,qty,price,drunk,source,note,acquired", fields.join());
  check("the preview shows the wines", (await p.textContent("#impPrev")).includes("Armand Rousseau") && /3 wines · 6 bottles/.test(await p.textContent("#impSum")), await p.textContent("#impSum"));
  check("a row without producer is reported", /1 row without a producer/.test(await p.textContent("#impSum")));
  // unmap the price column: the preview follows
  const priceCell = () => p.textContent("#impPrev tbody tr:first-child td:nth-child(7)");
  const priceBefore = await priceCell();
  await p.selectOption('#impCols select[data-col="10"]', "");
  check("changing a column updates the preview", /4.?500/.test(priceBefore) && (await priceCell()) === "", priceBefore);
  await p.selectOption('#impCols select[data-col="10"]', "price");
  check("the button counts the wines", (await p.textContent("#impGo")) === "Import 3 wines");
  await p.click("#impGo");
  await closed(); await p.waitForTimeout(500);
  const tbl = await p.textContent("#tbl");
  check("the wines are in the cellar", tbl.includes("Armand Rousseau") && tbl.includes("Krug"), tbl.slice(0, 200));
  check("the file itself was never sent", !seen.some(x => JSON.stringify(x).includes("Min vinkælder")) && !seen.some(x => /addmany/.test(JSON.stringify(x))));
  check("the server holds the wines only encrypted", !/Rousseau|Krug/.test(JSON.stringify(seen)));

  // the same file again: all three are duplicates
  await p.click("#impBtn"); await p.setInputFiles("#impFile", FIX("owner.xlsx")); await p.waitForSelector("#impMap:not([hidden])");
  check("a second import spots the wines already there", await p.isVisible("#impDup") && /3 of these are already in your cellar/.test(await p.textContent("#impDupLbl")));
  check("…marked in the preview", (await p.$$("#impPrev .dup")).length === 3);
  await p.check('input[name="impDup"][value="skip"]');
  check("skipping them leaves nothing to import", await p.isDisabled("#impGo"));
  await p.check('input[name="impDup"][value="add"]');
  await p.click("#impGo"); await closed(); await p.waitForTimeout(500);
  const counts = await p.evaluate(() => VAULT.call({ action: "data" }).then(r => r.wines.map(w => w.producer + ":" + w.qty + "/" + (Number(w.drunk) || 0))));
  check("adding bottles doubles them on the same rows", counts.join() === "Armand Rousseau:6/2,Domaine Leflaive:4/4,Krug:2/0", counts.join());

  // export: both files download, and read back as the same cellar
  await p.click("#expBtn");
  check("export says the file isn't encrypted", /isn't encrypted/.test(await p.textContent("#expLock")));
  const before = seen.length;
  let dl = p.waitForEvent("download"); await p.click("#expXlsx"); let f = await dl;
  check("Excel export downloads", /^allwine-carla-\d{4}-\d{2}-\d{2}\.xlsx$/.test(f.suggestedFilename()), f.suggestedFilename());
  const readBack = async f => { const buf = fs.readFileSync(await f.path()); const book = await IMPORT.read({ name: f.suggestedFilename(), size: buf.length, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) });
    const t = IMPORT.table(book.sheets[0].rows); return { book, wines: IMPORT.build(book.sheets[0].rows, t.header, t.columns.map(c => c.field)).wines }; };
  let back = await readBack(f);
  check("…with cellar, journal and wishlist, and the wines in it", back.book.sheets.map(x => x.name).join() === "Kælder,Journal,Ønskeliste" && back.wines.map(w => w.producer + ":" + w.qty).join() === "Armand Rousseau:6,Domaine Leflaive:4,Krug:2", back.wines.map(w => w.producer + ":" + w.qty).join());
  check("…nothing readable was sent to make it", !/Rousseau|Krug/.test(JSON.stringify(seen.slice(before))));
  await p.click("#expBtn"); dl = p.waitForEvent("download"); await p.click("#expCsv"); f = await dl;
  back = await readBack(f);
  check("CSV export reads back the same", /\.csv$/.test(f.suggestedFilename()) && back.wines.length === 3 && back.wines[0].price === 4500.5, JSON.stringify(back.wines[0]));

  // a plain list of wines in a text file
  await p.click("#impBtn"); await p.setInputFiles("#impFile", FIX("lines.txt")); await p.waitForSelector("#impMap:not([hidden])");
  check("a text list is read one wine per line", (await p.$$eval("#impCols select", s => s.map(x => x.value))).join() === "line" && (await p.textContent("#impPrev")).includes("Meursault Perrières"));
  await p.click("#impBack");
  check("'Choose another file' goes back", await p.isVisible("#impDrop"));

  // an old Excel file
  await p.setInputFiles("#impFile", { name: "cellar.xls", mimeType: "application/vnd.ms-excel", buffer: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]) });
  await p.waitForTimeout(300);
  check("an .xls file gets advice to save as .xlsx or CSV", /Save As/.test(await p.textContent("#impErr")), await p.textContent("#impErr"));

  // in Danish
  await p.evaluate(() => I18N.setLang("da")); await p.waitForTimeout(200);
  await p.click("#impCancel"); await p.click("#impBtn"); await p.setInputFiles("#impFile", FIX("danish.csv")); await p.waitForSelector("#impMap:not([hidden])");
  check("the dialog follows the language", /Importér 2 vine/.test(await p.textContent("#impGo")) && /Overskrifter fundet/.test(await p.textContent("#impHint")), await p.textContent("#impGo"));

  // in German
  await p.evaluate(() => I18N.setLang("de")); await p.waitForTimeout(200);
  await p.click("#impCancel"); await p.click("#impBtn"); await p.setInputFiles("#impFile", FIX("danish.csv")); await p.waitForSelector("#impMap:not([hidden])");
  check("…and in German", /2 Weine importieren/.test(await p.textContent("#impGo")) && /Überschriften in Zeile 1/.test(await p.textContent("#impHint")), await p.textContent("#impGo"));
  await p.evaluate(() => I18N.setLang("en"));

  // phone width: no sideways scrolling of the page
  await p.setViewportSize({ width: 375, height: 800 }); await p.waitForTimeout(200);
  check("fits a phone screen", await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  check("no console errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
