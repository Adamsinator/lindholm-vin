// Browser test of adding several wines in a table, against the real Code.gs (gas-harness.js):
//   • the table opens from the add-a-wine dialog and from Import
//   • typing, Enter to the next row, rows pasted from a spreadsheet, removing a row
//   • "Check the wines" goes through the import's own check (a wine already in the cellar is found), then they're added
//   (cd .. && python3 -m http.server 8765) & node tools/grid-ui-test.js
"use strict";
const { chromium } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];

(async () => {
  const b = await chromium.launch();
  const gas = H({ Ark1: [HEAD] }, { settings: { SIGNUP_CODE: "invite" } });
  const ctx = await b.newContext({ viewport: { width: 1200, height: 900 } });
  await require("./turnstile-fake")(ctx);
  await ctx.route(require("./api-route"), async route => { const q = JSON.parse(route.request().postData() || "{}");
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(gas.call(q)) }); });
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  await p.goto(BASE); await p.waitForTimeout(400);
  await p.click("#gateToggle"); await p.fill("#gateUser", "ida"); await p.fill("#gateEmail", "ida@example.dk"); await p.fill("#gatePass", "ida-secret-1"); await p.fill("#gatePass2", "ida-secret-1");
  await p.fill("#gateInvite", "invite"); await p.click("#gateSubmit");
  await p.waitForSelector("#recModal.open", { timeout: 20000 }); await p.check("#recOk"); await p.click("#recDone");
  await p.waitForSelector("#app:not([hidden])", { timeout: 20000 });
  await p.evaluate(async () => { await api({ action: "addmany", bumps: [], wines: [{ producer: "Armand Rousseau", name: "Clos St-Jacques", vintage: 2016, qty: 1, region: "Bourgogne", country: "Frankrig", type: "Rød" }] }); await loadData(); });

  // from the add-a-wine dialog
  await p.click("#addBtn"); await p.waitForTimeout(200); await p.click("#addMany"); await p.waitForTimeout(200);
  check("'Several at once' opens the table, with five empty rows", await p.isVisible("#impGrid") && (await p.$$("#wGrid tbody tr")).length === 5 && await p.isHidden("#addModal.open"));
  const cell = (r, c) => `#wGrid tbody tr:nth-child(${r}) input[data-c="${c}"]`;
  check("it has every field the add-a-wine form has", (await p.$$eval("#wGrid thead th", t => t.map(x => x.textContent).filter(Boolean))).join("|")
    === "Producer *|Vineyard / cuvée|Commune|Country|Region|Classification|Type|Grape|Vintage|Bottles|Format|Price per bottle (kr.)|Source / bought at|Acquired|Location|Note",
    (await p.$$eval("#wGrid thead th", t => t.map(x => x.textContent))).join("|"));
  await p.fill(cell(1, 0), "Domaine Roulot"); await p.fill(cell(1, 1), "Meursault Perrières"); await p.fill(cell(1, 2), "Meursault"); await p.fill(cell(1, 3), "France");
  await p.fill(cell(1, 5), "1er Cru"); await p.fill(cell(1, 6), "White"); await p.fill(cell(1, 7), "Chardonnay"); await p.fill(cell(1, 8), "2019"); await p.fill(cell(1, 9), "2");
  await p.fill(cell(1, 10), "Magnum"); await p.fill(cell(1, 11), "1800"); await p.fill(cell(1, 12), "Philipson"); await p.fill(cell(1, 13), "2024-05-01"); await p.fill(cell(1, 15), "Birthday");
  await p.press(cell(1, 11), "Enter");
  check("Enter goes to the same column of the next row", await p.evaluate(() => document.activeElement.closest("tr").rowIndex === 2 && document.activeElement.dataset.c === "11"));
  // three rows pasted from a spreadsheet into row 2
  await p.focus(cell(2, 0));
  await p.evaluate(sel => { const dt = new DataTransfer(); dt.setData("text/plain", "Krug\tGrande Cuvée\t\tFrance\tChampagne\t\tSparkling\t\tNV\t3\t\t1650\t\t\tKøleskab\nArmand Rousseau\tClos St-Jacques\tGevrey-Chambertin\t\t\t\t\t\t2016\t2\t\t4500\t\t\t\t\nGiacomo Conterno\tBarolo Francia\t\tItaly\tPiemonte\t\tRed\tNebbiolo\t2017\t4\t\t950\t\t\tKælder\n");
    document.querySelector(sel).dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); }, cell(2, 0));
  check("rows pasted from a spreadsheet spread over the table", (await p.inputValue(cell(2, 1))) === "Grande Cuvée" && (await p.inputValue(cell(4, 0))) === "Giacomo Conterno" && (await p.inputValue(cell(3, 9))) === "2" && (await p.inputValue(cell(4, 14))) === "Kælder",
    [await p.inputValue(cell(2, 1)), await p.inputValue(cell(4, 0))].join());
  check("…and the count follows", /4 wines/.test(await p.textContent("#gridCount")), await p.textContent("#gridCount"));
  await p.fill(cell(5, 0), "Delete me"); await p.click("#wGrid tbody tr:nth-child(5) .gdel"); await p.waitForTimeout(100);
  check("a row can be removed", /4 wines/.test(await p.textContent("#gridCount")) && !(await p.$$eval("#wGrid input", is => is.some(i => i.value === "Delete me"))));

  await p.click("#gridGo"); await p.waitForTimeout(500);
  check("'Check the wines' shows the import's check", await p.isVisible("#impMap") && await p.isHidden("#impGrid") && (await p.textContent("#impName")) === "Typed in the table");
  check("…which finds the one already in the cellar", /1 of these are already in your cellar/.test(await p.textContent("#impDupLbl")), await p.textContent("#impDupLbl"));
  await p.click("#impBack"); await p.waitForTimeout(150);
  check("'Back to the table' keeps what was typed", await p.isVisible("#impGrid") && (await p.inputValue(cell(4, 0))) === "Giacomo Conterno" && /Add several wines/.test(await p.textContent("#impTitle")));
  await p.click("#gridGo"); await p.waitForTimeout(500);
  check("…and offers to import the rest", /Import [34] wines/.test(await p.textContent("#impGo")), await p.textContent("#impGo"));
  await p.click("#impGo"); await p.waitForFunction(() => !document.getElementById("impModal").classList.contains("open"), null, { timeout: 15000 });
  const got = await p.evaluate(() => WINES.map(w => [w.producer, w.name, w.vintage, w.qty, w.price, w.location].join("|")));
  check("the wines are in the cellar, as typed (the commune out of the wine's name, as an import does)", got.some(x => x === "Domaine Roulot|Perrières|2019|2|1800|") && got.some(x => /^Krug\|Grande Cuvée\|NV\|3\|1650\|Køleskab$/.test(x))
    && got.some(x => /^Giacomo Conterno\|Barolo Francia\|2017\|4\|950\|Kælder$/.test(x)), got.join(" ; "));
  const roulot = await p.evaluate(() => { const w = WINES.find(x => x.producer === "Domaine Roulot"); return [w.commune, w.country, w.classification, w.style, w.grape, w.size, w.source, w.acquired, w.note].join("|"); });
  check("…with every other field too (type and format in the words you'd type)", /^Meursault\|Frankrig\|1\. cru\|Hvid\|Chardonnay\|Magnum\|Philipson\|2024-05-01\|Birthday$/.test(roulot), roulot);
  const types = await p.evaluate(() => WINES.filter(w => /Krug|Conterno/.test(w.producer)).map(w => w.style + "/" + w.country).sort().join());
  check("…and the pasted rows' type and country", types === "Bobler/Frankrig,Rød/Italien", types);
  check("…and the Rousseau got its two bottles added, not a second row", got.filter(x => x.startsWith("Armand Rousseau|Clos St-Jacques|2016")).length === 1 &&
    got.find(x => x.startsWith("Armand Rousseau")).split("|")[3] === "3", got.find(x => x.startsWith("Armand Rousseau")));

  // from Import too
  await p.click("#impBtn"); await p.waitForTimeout(200);
  check("Import offers the table when there's no file", await p.isVisible("#gridOpen"));
  await p.click("#gridOpen"); await p.waitForTimeout(150);
  check("…and opens it empty", await p.isVisible("#impGrid") && (await p.$$eval("#wGrid input", is => is.every(i => !i.value))) && await p.isDisabled("#gridGo"));
  check("no console errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
