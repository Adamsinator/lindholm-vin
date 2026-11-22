// A wine's dated valuations (Code.gs API 67, "Værdihistorik"), through the real Code.gs (gas-harness.js): a value on a
// date with its source, the one of a date replaced, one taken out, all cleared; the current value always the newest;
// a value without a date is today's; a future date refused; an import's value is today's valuation; merging two rows
// of a wine joins their valuations, one a date; a source can't start a formula.
//   node tools/value-log-test.js
"use strict";
const H = require("./gas-harness");
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];
const gas = H({ Ark1: [HEAD, ["Armand Rousseau", "Frankrig", "Bourgogne", "Gevrey-Chambertin", "Clos St-Jacques", "1er Cru", "Rød", "Pinot Noir", 2016, 3, 1500, "", "", ""],
  ["Armand Rousseau", "Frankrig", "Bourgogne", "Gevrey-Chambertin", "Clos St-Jacques", "1er Cru", "Rød", "Pinot Noir", 2016, 1, 1700, "", "", ""]] });
const call = p => gas.call(Object.assign({ code: "test-code" }, p));
const w2 = () => call({ action: "data" }).wines.find(w => w.row === 2), today = "2026-10-16"; // the harness's today (gas-harness.js)
let r = call({ action: "setvalue", row: 2, value: 2400, date: "2025-03-01", source: "Wine-Searcher" });
check("a value on a date, with its source", r.ok && w2().valueLog === "2025-03-01=2400 Wine-Searcher" && Number(w2().value) === 2400, JSON.stringify(w2()));
call({ action: "setvalue", row: 2, value: 2900, date: "2026-06-01", source: "Christie's" });
call({ action: "setvalue", row: 2, value: 2100, date: "2024-01-15" });
check("…several, oldest first; the current value is the newest, not the last typed", w2().valueLog === "2024-01-15=2100; 2025-03-01=2400 Wine-Searcher; 2026-06-01=2900 Christie's" && Number(w2().value) === 2900, w2().valueLog);
call({ action: "setvalue", row: 2, value: 2500, date: "2025-03-01", source: "Wine-Searcher" });
check("…the one of a date replaced, not doubled", (w2().valueLog.match(/2025-03-01/g) || []).length === 1 && /2025-03-01=2500/.test(w2().valueLog), w2().valueLog);
call({ action: "setvalue", row: 2, value: "", date: "2026-06-01" });
check("…one taken out: the current value falls back to the newest left", !/2026-06-01/.test(w2().valueLog) && Number(w2().value) === 2500, JSON.stringify([w2().value, w2().valueLog]));
call({ action: "setvalue", row: 2, value: 2600 });
check("…a value without a date is today's", new RegExp(today + "=2600$").test(w2().valueLog) && Number(w2().value) === 2600, w2().valueLog);
r = call({ action: "setvalue", row: 2, value: 3000, date: "2026-10-17" });
check("…a date after today is refused", !r.ok && /Bad date/.test(r.error || ""), JSON.stringify(r));
r = call({ action: "setvalue", row: 2, value: 3000, date: "1st of May" });
check("…and one that isn't a date", !r.ok && /Bad date/.test(r.error || ""), JSON.stringify(r));
call({ action: "setvalue", row: 2, value: 1, date: "2025-01-01", source: "=HYPERLINK(\"x\");2025-02-02=9" });
check("…a source can't start a formula or slip in a valuation of its own", !/=HYPERLINK|2025-02-02=9/.test(w2().valueLog) && /2025-01-01=1 HYPERLINK/.test(w2().valueLog), w2().valueLog);
call({ action: "setvalue", row: 2, value: "", date: "2025-01-01" });
// merging the two rows of the wine
call({ action: "setvalue", row: 3, value: 2800, date: "2026-02-01", source: "auction" });
call({ action: "setvalue", row: 3, value: 9999, date: "2025-03-01" });
r = call({ action: "mergerows", groups: [{ keep: 2, drop: [3] }] });
const m = r.wines.find(w => w.row === 2);
check("merging the wine's two rows joins their valuations, one a date (the kept row's), the newest the current value",
  r.ok && r.wines.length === 1 && /2024-01-15=2100/.test(m.valueLog) && /2025-03-01=2500/.test(m.valueLog) && !/9999/.test(m.valueLog) && /2026-02-01=2800 auction/.test(m.valueLog) && Number(m.value) === 2600, JSON.stringify([m.value, m.valueLog]));
call({ action: "setvalue", row: 2, value: "" });
check("clearing the value clears its valuations: the wine isn't valued any more", w2().valueLog === "" && w2().value === "", JSON.stringify([w2().value, w2().valueLog]));
r = call({ action: "addmany", wines: [{ producer: "Krug", name: "Grande Cuvée", qty: 2, price: 1500, value: 1900 }], bumps: [] });
const k = r.wines.find(w => w.producer === "Krug");
check("an imported value is today's valuation", k && k.valueLog === today + "=1900" && Number(k.value) === 1900, JSON.stringify(k && [k.value, k.valueLog]));
const rows = gas.rows("Ark1"), col = rows[0].indexOf("Værdihistorik"), cell = rows.find(x => x[0] === "Krug")[col];
check("the sheet holds the history as text, as written (Sheets keeps the apostrophe out of the value)", typeof cell === "string" && cell === "2026-10-16=1900", JSON.stringify(cell));
const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
