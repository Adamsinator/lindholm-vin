// Tests of the bulk import, in Node: import.js on the sample files in tools/fixtures (python3 tools/make-import-fixtures.py
// writes them), the value parsers, and the 'addmany' action in the real Code.gs, both on a plain sheet and through an
// encrypted cellar (vault.js runs Code.gs on the decrypted copy).
//   node tools/import-test.js
"use strict";
const fs = require("fs"), path = require("path");
const I = require("../import.js");
const H = require("./gas-harness");
const VAULT = require("../vault.js");
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];
const file = name => { const b = fs.readFileSync(path.join(__dirname, "fixtures", name)); return { name, size: b.length, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) }; };
const load = async name => { const book = await I.read(file(name)); const s = book.sheets[0]; const t = I.table(s.rows); return { book, t, ...I.build(s.rows, t.header, t.columns.map(c => c.field)) }; };
const J = x => JSON.stringify(x);

(async () => {
  // ── the owner's own layout, as an Excel workbook with a title row above the headings ──
  let r = await load("owner.xlsx");
  check("xlsx: both sheets read", r.book.kind === "xlsx" && r.book.sheets.map(s => s.name).join() === "Ark1,Noter");
  check("xlsx: headings found under the title row", r.t.header === 2, r.t.header);
  check("xlsx: every Danish heading maps to its field", J(r.t.columns.map(c => c.field)) === J(["producer", "country", "region", "commune", "name", "classification", "type", "grape", "vintage", "qty", "price", "drunk", "source", "note", "acquired"]), J(r.t.columns.map(c => c.field)));
  const [rousseau, leflaive, krug] = r.wines;
  check("xlsx: numbers, decimals and dates", rousseau.qty === 3 && rousseau.drunk === 1 && rousseau.price === 4500.5 && rousseau.acquired === "2021-03-14", J(rousseau));
  check("xlsx: a vintage typed as a date is the year", leflaive.vintage === 2019, J(leflaive));
  check("xlsx: 'x' in Drukket means all drunk", leflaive.drunk === 2);
  check("xlsx: '1er cru' becomes the site's '1. cru'", leflaive.classification === "1. cru");
  check("xlsx: NV and Danish letters", krug.vintage === "NV" && krug.note === "æøå ÆØÅ" && krug.name === "Grande Cuvée 170ème", J(krug));
  check("xlsx: blank rows skipped, a row without producer counted", r.wines.length === 3 && r.skipped.noProducer === 1, J(r.skipped));

  // ── other people's layouts ──
  r = await load("cellartracker.csv");
  const [roumier, boll] = r.wines;
  check("CellarTracker: quoted commas, '1,250.00', 750ml", roumier.price === 1250 && roumier.qty === 2 && !roumier.size, J(roumier));
  check("CellarTracker: 'Wine' trimmed to the climat, appellation split", roumier.name === "Les Amoureuses" && roumier.commune === "Chambolle-Musigny" && roumier.classification === "1. cru", J(roumier));
  check("CellarTracker: Burgundy → Bourgogne, France → Frankrig, Red → Rød", roumier.region === "Bourgogne" && roumier.country === "Frankrig" && roumier.type === "Rød");
  check("CellarTracker: drink window, valuation", roumier.drinkFrom === 2025 && roumier.drinkTo === 2045 && roumier.value === 3000);
  check("CellarTracker: vintage 1001 is NV, 1.5L is a magnum, sparkling", boll.vintage === "NV" && boll.size === "Magnum" && boll.type === "Bobler", J(boll));
  check("CellarTracker: the community score isn't my rating", r.wines.every(w => w.rating === undefined));
  r = await load("vivino.csv");
  check("Vivino: 5-point rating → 1–10, average rating ignored", r.wines[0].rating === 9 && r.wines[1].rating === 10 && r.t.columns.find(c => c.label === "Average rating").field === "", J(r.wines.map(w => w.rating)));
  check("Vivino: Lebanon → Libanon, Germany → Tyskland, review → note", r.wines[0].country === "Libanon" && r.wines[1].country === "Tyskland" && r.wines[0].note === "Lovely and old");
  r = await load("danish.csv");
  check("Danish CSV: ';' and Windows-1252 decoded", r.book.delimiter === ";" && r.wines[0].producer === "Château Léoville Barton" && r.wines[1].source === "Kjær & Sommerfeldt", J(r.wines[0]));
  check("Danish CSV: '1.250,00 kr' and '189,95'", r.wines[0].price === 1250 && r.wines[1].price === 189.95);
  check("Danish CSV: Tilbage → drunk = Antal − Tilbage", r.wines[0].qty === 6 && r.wines[0].drunk === 2 && r.wines[1].drunk === 0);
  check("Danish CSV: Drikkevindue '2025-35', Størrelse Magnum", r.wines[0].drinkFrom === 2025 && r.wines[0].drinkTo === 2035 && r.wines[0].size === "Magnum");
  r = await load("tabbed.txt");
  check("TXT with tabs: 'ja' in Drunk", r.book.kind === "tsv" && r.wines[0].drunk === 3 && r.wines[1].drunk === 0, J(r.wines));
  r = await load("lines.txt");
  check("TXT list: '3 x Roulot - Meursault Perrières 2020'", J(r.wines[0]) === J({ qty: 3, vintage: 2020, producer: "Domaine Roulot", name: "Meursault Perrières", drunk: 0, src: 1 }), J(r.wines[0]));
  check("TXT list: '(2 fl)' at the end, comma split", r.wines[1].qty === 2 && r.wines[1].producer === "Raveneau" && r.wines[1].name === "Chablis Grand Cru Les Clos", J(r.wines[1]));
  check("TXT list: NV", r.wines[2].vintage === "NV");

  // ── a workbook whose writer prefixes every tag (<x:row>) ──
  {
    const zlib = require("zlib");
    const parts = { "xl/workbook.xml": '<x:workbook xmlns:x="m" xmlns:r="r"><x:sheets><x:sheet name="Wines" sheetId="1" r:id="rId1"/></x:sheets></x:workbook>',
      "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      "xl/worksheets/sheet1.xml": '<x:worksheet><x:sheetData><x:row r="1"><x:c r="A1" t="inlineStr"><x:is><x:t>Producer</x:t></x:is></x:c><x:c r="B1" t="inlineStr"><x:is><x:t>Vintage</x:t></x:is></x:c></x:row>'
        + '<x:row r="2"><x:c r="A2" t="inlineStr"><x:is><x:t>Dujac &amp; Fils</x:t></x:is></x:c><x:c r="C2"><x:v>2018</x:v></x:c></x:row></x:sheetData></x:worksheet>' };
    // a minimal zip: deflated entries, then the central directory
    const local = [], central = []; let off = 0;
    for (const [name, xml] of Object.entries(parts)) {
      const data = zlib.deflateRawSync(Buffer.from(xml)), nb = Buffer.from(name);
      const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(8, 8); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(Buffer.byteLength(xml), 22); h.writeUInt16LE(nb.length, 26);
      const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(8, 10); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(Buffer.byteLength(xml), 24); c.writeUInt16LE(nb.length, 28); c.writeUInt32LE(off, 42);
      local.push(h, nb, data); central.push(c, nb); off += 30 + nb.length + data.length;
    }
    const cd = Buffer.concat(central), e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(central.length / 2, 8); e.writeUInt16LE(central.length / 2, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
    const zipBuf = Buffer.concat([...local, cd, e]);
    const book = await I.read({ name: "x.xlsx", size: zipBuf.length, arrayBuffer: async () => zipBuf.buffer.slice(zipBuf.byteOffset, zipBuf.byteOffset + zipBuf.length) });
    check("xlsx with prefixed tags and inline strings", J(book.sheets[0].rows) === J([["Producer", "Vintage"], ["Dujac & Fils", "", 2018]]), J(book.sheets));
  }

  // ── value parsers ──
  check("numbers", J(["1.250,00 kr", "1,250.50", "189,95", "DKK 2 500", "1.500", "2.5", "€ 45", "abc", "1.234.567"].map(I.num)) === J([1250, 1250.5, 189.95, 2500, 1500, 2.5, 45, null, 1234567]), J(["1.250,00 kr", "1,250.50", "189,95", "DKK 2 500", "1.500", "2.5", "€ 45", "abc", "1.234.567"].map(I.num)));
  check("dates", J(["24.12.2025", "24/12/2025", "12/24/2025", "2025-1-5", 45000, "2019", "31.02"].map(I.isoDate)) === J(["2025-12-24", "2025-12-24", "2025-12-24", "2025-01-05", "2023-03-15", "2019-01-01", ""]), J(["24.12.2025", "24/12/2025", "12/24/2025", "2025-1-5", 45000, "2019", "31.02"].map(I.isoDate)));
  check("formats", J(["75cl", "750 ml", "0,75 l", "37.5", "1.5L", "150 cl", "3L", "Dobbelt magnum", "halv", "6 l", "Imperial"].map(I.size)) === J(["", "", "", "Half", "Magnum", "Magnum", "Jeroboam", "Jeroboam", "Half", "Methuselah", "Methuselah"]), J(["75cl", "750 ml", "0,75 l", "37.5", "1.5L", "150 cl", "3L", "Dobbelt magnum", "halv", "6 l", "Imperial"].map(I.size)));
  check("types", J(["Rød", "red", "Rouge", "White - Sweet/Dessert", "Rosé", "Champagne", "Mousserende", "Orange"].map(I.wineType)) === J(["Rød", "Rød", "Rød", "Hvid", "Rose", "Bobler", "Bobler", "Orange"]));
  check("location headings (CellarTracker's Location and Bin, Danish, German)", ["Location", "Bin", "Placering", "Lagerort", "Hylde"].every(h => (I.matchHeader(h) || {}).field === "location"));
  check("German headings", ["Weingut", "Jahrgang", "Rebsorte", "Anzahl Flaschen", "Preis pro Flasche", "Getrunken am", "Bemerkung", "Flaschengröße", "Trinkfenster", "Bestand"].map(h => (I.matchHeader(h) || {}).field || "-").join() === "producer,vintage,grape,qty,price,drunkDate,note,size,window,left");
  {
    const rows = [["Producer", "Wine", "Location", "Bin"], ["Roulot", "Meursault", "Cellar", "A3"]];
    const t = I.table(rows), w = I.build(rows, t.header, t.columns.map(c => c.field)).wines[0];
    check("Location and Bin both map, joined", w.location === "Cellar · A3", J(t.columns.map(c => c.field)));
  }
  check("headings", ["Antal flasker", "Pris pr. flaske", "Årgang", "Mark/Navn", "Drukket dato", "Average rating"].map(h => (I.matchHeader(h) || {}).field || "-").join() === "qty,price,vintage,name,drunkDate,-");

  // ── duplicates ──
  const existing = [{ row: 2, producer: "Domaine Roulot", name: "Meursault Perrières", vintage: 2020, size: "" }, { row: 3, producer: "Krug", name: "Grande Cuvée", vintage: "NV", size: "", elsewhere: true }];
  const d = I.dedupe([{ producer: "domaine roulot", name: "Meursault Perrieres", vintage: 2020, qty: 3, drunk: 1 }, { producer: "Domaine Roulot", name: "Meursault Perrières", vintage: 2020, qty: 2, drunk: 0 }, { producer: "Krug", name: "Grande Cuvée", vintage: "NV", qty: 1 }], existing);
  check("duplicates match across case and accents, not wines drunk elsewhere", d.dupes.length === 2 && d.fresh.length === 1);
  check("…and become one bump per row", J(I.bumps(d.dupes)) === J([{ row: 2, qty: 5, drunk: 1 }]));

  // ── addmany on a plain sheet (the real Code.gs) ──
  const gas = H({ Ark1: [HEAD, ["Domaine Roulot", "Frankrig", "Bourgogne", "Meursault", "Meursault Perrières", "1. cru", "Hvid", "Chardonnay", 2020, 2, 900, "x", "", ""]] });
  const own = (await load("owner.xlsx")).wines.map(I.clean);
  const ct = (await load("cellartracker.csv")).wines.map(I.clean);
  let res = gas.call({ code: "test-code", action: "addmany", wines: [...own, ...ct], bumps: [{ row: 2, qty: 3, drunk: 1 }] });
  check("addmany writes all the wines", res.ok && res.wines.length === 6, J(res).slice(0, 300));
  const roul = res.wines.find(w => w.row === 2);
  check("…the bump adds bottles to an 'x' row (all drunk) and keeps the drunk ones", roul.qty === 5 && roul.drunk === 3, J(roul));
  const head = gas.rows("Ark1")[0];
  check("…the optional columns are created", ["Anskaffet", "Værdi kr", "Størrelse", "Drik fra", "Drik til"].every(h => head.includes(h)), J(head));
  const rr = res.wines.find(w => w.producer === "Domaine Georges Roumier");
  check("…a CellarTracker wine reads back like one added by hand", rr.name === "Les Amoureuses" && rr.classification === "1. cru" && rr.drinkFrom === 2025 && rr.value === 3000 && rr.acquired === "", J(rr));
  check("…a drunk-out row stays a cellar row", res.wines.find(w => w.producer === "Domaine Leflaive").drunk === 2);
  check("addmany refuses a wine without producer", /Producer is required/.test(gas.call({ code: "test-code", action: "addmany", wines: [{ name: "x" }] }).error));
  check("addmany refuses a bump on a bad row", /Bad row/.test(gas.call({ code: "test-code", action: "addmany", wines: [], bumps: [{ row: 99, qty: 1 }] }).error));
  check("addmany refuses more than 5000 rows", /Too many/.test(gas.call({ code: "test-code", action: "addmany", wines: new Array(5001).fill({ producer: "x" }) }).error));
  gas.call({ code: "test-code", action: "addmany", wines: [{ producer: "=IMPORTXML(\"http://x\")", name: "+1" }] });
  check("text that looks like a formula is stored as text", !gas.sheet("Ark1")._formulas.length && gas.rows("Ark1").some(r => r[0] === "=IMPORTXML(\"http://x\")" && r[4] === "+1"), J(gas.sheet("Ark1")._formulas));
  const before = gas.rows("Ark1").length;
  res = gas.call({ code: "test-code", action: "addmany", wines: Array.from({ length: 1500 }, (_, i) => ({ producer: "P" + i, qty: 1 })) });
  check("a big import goes in in one write (the sheet grows to fit)", res.ok && gas.rows("Ark1").length === before + 1500, res.error);

  // ── addmany in an encrypted cellar ──
  const g2 = H({ Ark1: [HEAD] }, { settings: { SIGNUP_CODE: "invite" } });
  const post = async p => g2.call(p);
  const keys = await VAULT.newKeys("pass-1234");
  const su = await post({ action: "signup", user: "bodil", code: "invite", ...keys.fields });
  await VAULT.start({ post, user: "bodil", token: su.token, dek: keys.dek });
  res = await VAULT.call({ action: "addmany", wines: own, bumps: [] });
  check("encrypted cellar: addmany runs in the browser engine", res.ok && res.wines.length === 3, J(res).slice(0, 200));
  res = await VAULT.call({ action: "addmany", wines: [], bumps: [{ row: 2, qty: 1, drunk: 0 }] });
  check("…bumps too", res.wines.find(w => w.row === 2).qty === 4);
  res = await VAULT.call({ action: "add", wine: { producer: "'t Kruisje", note: "=not a formula" } });
  check("…text is kept exactly as written in the vault", res.wines.some(w => w.producer === "'t Kruisje" && w.note === "=not a formula"));
  const stored = JSON.stringify(Object.values(g2.rt.books).map(b => Object.values(b.sheets).map(s => s._cells)));
  check("…and the server holds none of it in the clear", !/Rousseau|Leflaive|Krug/.test(stored));

  const n = results.filter(Boolean).length;
  console.log(`\n${n}/${results.length} passed`);
  process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
