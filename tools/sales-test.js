// Tests of a business's sales in apps-script/Code.gs, run against the real file in Node (gas-harness.js): each sale
// keeps what it cost when it was sold (API 58: a bottle's cost price, or a glass's share of it), so a later cost price
// leaves the profit of earlier sales as it was; a Sales tab from before that column reads as before and gets it.
//   node tools/sales-test.js
"use strict";
const H = require("./gas-harness");
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];
const wine = (producer, qty, cost) => [producer, "Frankrig", "Champagne", "", "Cuvée", "", "Mousserende", "", 2015, qty, cost, "", "", ""];

// a new Sales tab: the cost of a bottle, a glass's share (6 to the bottle), none when the wine has no cost price
let gas = H({ Ark1: [HEAD, wine("Bollinger", 6, 420), wine("Krug", 2, "")] });
const sell = (row, unit, per = 5) => gas.run(`sellOne(${row}, ${JSON.stringify(unit)}, ${per})`);
const sales = () => gas.run("readSales()");
const b1 = sell(2, "bottle"), g1 = sell(2, "glass", 6), k1 = sell(3, "bottle");
let s = sales();
check("a new Sales tab has the cost column", gas.rows("Salg")[0].join() === "Dato,Id,Række,Producent,Vin,Årgang,Enhed,Pris,Åbnede flaske,Kostpris", JSON.stringify(gas.rows("Salg")[0]));
check("a bottle sold keeps its cost price: 420", s.find(x => x.id === b1).cost === 420, JSON.stringify(s));
check("…a glass its share of it: 420 / 6 = 70", s.find(x => x.id === g1).cost === 70, JSON.stringify(s));
check("…a wine with no cost price, none", s.find(x => x.id === k1).cost === null, JSON.stringify(s));
// the cost price goes up: the sales before keep what they cost then
gas.run(`sheet().getRange(2, 11).setValue(500)`);
const b2 = sell(2, "bottle"); s = sales();
check("a new cost price: the sale before keeps 420, the one after has 500", s.find(x => x.id === b1).cost === 420 && s.find(x => x.id === b2).cost === 500, JSON.stringify(s.map(x => x.cost)));
gas.run(`unsell(${JSON.stringify(b2)})`);
check("undoing a sale still works, and puts the bottle back", !sales().some(x => x.id === b2) && gas.rows("Ark1")[1][11] === 2, JSON.stringify(gas.rows("Ark1")[1]));

// a Sales tab from before API 58 (nine columns): read as before, with no cost; the next sale adds the column
gas = H({ Ark1: [HEAD, wine("Bollinger", 6, 420)], Salg: [["Dato", "Id", "Række", "Producent", "Vin", "Årgang", "Enhed", "Pris", "Åbnede flaske"],
  ["2026-10-01", "old-1", 2, "Bollinger", "Cuvée", 2015, "flaske", 1050, 1]] });
s = sales();
check("an old Sales tab reads as before: the sale, with no cost", s.length === 1 && s[0].id === "old-1" && s[0].price === 1050 && s[0].cost === null, JSON.stringify(s));
const n1 = sell(2, "bottle"); s = sales();
check("…the next sale adds the cost column's heading and its cost", gas.rows("Salg")[0][9] === "Kostpris" && s.find(x => x.id === n1).cost === 420 && s.find(x => x.id === "old-1").cost === null, JSON.stringify(gas.rows("Salg")));
gas.run(`unsell("old-1")`);
check("…and an old sale can still be undone", !sales().some(x => x.id === "old-1") && sales().length === 1);
check("the API says 58", gas.call({ action: "ping" }).v === 58 || gas.call({ action: "nothing" }).v === 58);

const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
