// Tests of the export, in Node: export.js on a cellar read from the real Code.gs (gas-harness.js), the workbook checked by
// an independent reader (Python's openpyxl), the CSV by Python's csv module, and both imported back (import.js +
// addmany) into an empty cellar to compare wine by wine.
//   node tools/export-test.js
"use strict";
const fs = require("fs"), path = require("path"), os = require("os"), { spawnSync } = require("child_process");
const E = require("../export.js"), I = require("../import.js"), H = require("./gas-harness");
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const J = x => JSON.stringify(x);
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];

(async () => {
  // a cellar with the awkward cases: 'x' in Drukket, NV, a magnum, decimals, ratings ≤ 5, a wine drunk elsewhere,
  // text with ; " and a line break, text that looks like a formula, Danish letters, dates
  const gas = H({ Ark1: [HEAD,
    ["Armand Rousseau", "Frankrig", "Bourgogne", "Gevrey-Chambertin", "Clos St-Jacques", "1. cru", "Rød", "Pinot Noir", 2016, 3, 4500.5, 1, "Philipson", 'gave; "fin"\nlinje 2'],
    ["Domaine Leflaive", "Frankrig", "Bourgogne", "Puligny-Montrachet", "Les Pucelles", "1. cru", "Hvid", "Chardonnay", 2019, 2, 1900, "x", "", ""],
    ["Krug", "Frankrig", "Champagne", "", "Grande Cuvée", "", "Hvid", "", "NV", 1, 1650, "", "", "=HYPERLINK(\"x\")"],
    ["Bærtelsen & Søn", "Danmark", "Fyn", "", "Æblevin", "", "Hvid", "", 2023, 6, 99.95, 0, "", "øl og ål"]] });
  const call = p => gas.call({ code: "test-code", ...p });
  call({ action: "rate", row: 2, rating: 4 }); call({ action: "rate", row: 3, rating: 5 });
  call({ action: "setsize", row: 4, value: "Magnum" }); call({ action: "setvalue", row: 2, value: 6000 });
  call({ action: "setwindow", row: 2, from: 2026, to: 2040 }); call({ action: "setinfo", row: 2, fields: { location: "Kælder, reol 3 · hylde 2" } }); call({ action: "setdate", row: 2, field: "acquired", value: "2021-03-14" });
  call({ action: "enjoyadd", entry: { producer: "Noma", wine: "Husets", rating: 3, date: "2025-11-02" } });
  call({ action: "jadd", entry: { date: "2026-01-05", producer: "Krug", wine: "Grande Cuvée", rating: 9, note: "smuk" } });
  call({ action: "wadd", entry: { producer: "Coche-Dury", wine: "Corton-Charlemagne", vintage: 2017, price: 15000 } });
  const wines = call({ action: "data" }).wines;
  const sheets = [{ name: "Kælder", rows: E.cellar(wines) }, { name: "Journal", rows: E.journal(call({ action: "journal" }).entries) },
                  { name: "Ønskeliste", rows: E.wishlist(call({ action: "wish" }).items) }];
  check("cellar table: the owner's headings", sheets[0].rows[0].slice(0, 14).join() === HEAD.join() && sheets[0].rows.length === 6);
  check("…'x' becomes the number of bottles", sheets[0].rows[2][11] === 2);
  check("crc32", E.crc32(new TextEncoder().encode("123456789")) === 0xcbf43926);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allwine-export-"));
  const xfile = path.join(dir, "cellar.xlsx"), cfile = path.join(dir, "cellar.csv");
  fs.writeFileSync(xfile, E.xlsx(sheets)); fs.writeFileSync(cfile, E.csv(sheets[0].rows));

  // ── an independent reader ──
  const py = spawnSync("python3", ["-I", "-c", `
import json, sys, csv, openpyxl
wb = openpyxl.load_workbook(sys.argv[1])
ws = wb["Kælder"]
rows = [[c.value.isoformat()[:10] if hasattr(c.value, "isoformat") else c.value for c in r] for r in ws.iter_rows()]
f = open(sys.argv[2], encoding="utf-8-sig", newline=""); c = list(csv.reader(f, delimiter=";"))
print(json.dumps({"sheets": wb.sheetnames, "rows": rows, "freeze": ws.freeze_panes, "bold": ws["A1"].font.b,
  "dateType": type(ws["Q2"].value).__name__, "j": [[c.value for c in r] for r in wb["Journal"].iter_rows()][1][:3], "csv": c}, default=str))
`, xfile, cfile], { encoding: "utf8" });
  if (py.status !== 0) console.log(py.stderr);
  const o = JSON.parse(py.stdout || "{}");
  check("openpyxl opens the workbook with three sheets", J(o.sheets) === J(["Kælder", "Journal", "Ønskeliste"]), J(o.sheets));
  check("…headings bold, top row frozen", o.bold === true && o.freeze === "A2");
  check("…numbers are numbers, dates are dates", o.rows[1][10] === 4500.5 && o.rows[1][8] === 2016 && o.dateType === "datetime" && o.rows[1][16] === "2021-03-14", J(o.rows[1]));
  check("…text with ; quotes and a line break survives", o.rows[1][13] === 'gave; "fin"\nlinje 2');
  check("…a formula-looking note stays text", o.rows[3][13] === '=HYPERLINK("x")');
  check("…the location column", o.rows[0][22] === "Placering" && o.rows[1][22] === "Kælder, reol 3 · hylde 2", J(o.rows[1]));
  check("…Danish letters", o.rows[4][0] === "Bærtelsen & Søn" && o.rows[4][13] === "øl og ål");
  check("…the journal sheet", J(o.j) === J(["2026-01-05 00:00:00", "Krug", "Grande Cuvée"]) || (String(o.j[0]).startsWith("2026-01-05") && o.j[1] === "Krug"), J(o.j));
  check("Python's csv reads the CSV in columns", o.csv.length === 6 && o.csv[0].length === 23 && o.csv[1][13] === 'gave; "fin"\nlinje 2' && o.csv[1][10] === "4500,5", J(o.csv[1]));
  check("…formula-looking text is guarded in the CSV", o.csv[3][13] === "'=HYPERLINK(\"x\")");

  // ── round trip: export → import into an empty cellar → the same wines ──
  const fileOf = p => { const b = fs.readFileSync(p); return { name: path.basename(p), size: b.length, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) }; };
  const strip = w => { const o = { ...w }; delete o.row; return o; };
  for (const [label, f] of [["xlsx", xfile], ["csv", cfile]]) {
    const book = await I.read(fileOf(f));
    const t = I.table(book.sheets[0].rows);
    const built = I.build(book.sheets[0].rows, t.header, t.columns.map(c => c.field));
    check(`${label}: every column maps back`, t.columns.every(c => c.field), t.columns.filter(c => !c.field).map(c => c.label).join());
    const g2 = H({ Ark1: [HEAD] });
    const res = g2.call({ code: "test-code", action: "addmany", wines: built.wines.map(I.clean), bumps: [] });
    const a = wines.map(strip), b = res.wines.map(strip);
    const same = (k, x, y) => String(x) === String(y) || (k === "drunk" && !Number(x) && !Number(y)); // 0 and blank read the same
    const diff = a.map((w, i) => Object.keys(w).filter(k => !same(k, w[k], b[i] && b[i][k])).map(k => `${w.producer}.${k}: ${J(w[k])} → ${J(b[i] && b[i][k])}`)).flat();
    // 'x' in Drukket comes back as the number of bottles, which reads the same in the site
    const real = diff.filter(d => !/Leflaive\.drunk: "x" → 2/.test(d));
    check(`${label}: round trip gives the same cellar`, res.ok && b.length === a.length && !real.length, real.join(" | ") || res.error);
    check(`${label}: …and plants no formula`, !g2.sheet("Ark1")._formulas.length, J(g2.sheet("Ark1")._formulas));
  }
  // the workbook's first sheet is the one the importer picks
  const book = await I.read(fileOf(xfile));
  check("the importer reads all three sheets of an exported workbook", book.sheets.length === 3);
  fs.rmSync(dir, { recursive: true, force: true });

  const n = results.filter(Boolean).length;
  console.log(`\n${n}/${results.length} passed`);
  process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
