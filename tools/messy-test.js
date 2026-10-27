// Tests of the import on bad data, and of "Tidy up" on a messy cellar, in Node: the same steps the Import dialog takes
// (import.js reads and maps, tidy.js corrects and merges, the duplicates are looked up), then the rows go through the
// real Code.gs; and the cellar clean-up's setinfomany / mergerows on a plain sheet and in an encrypted cellar.
//   node tools/messy-test.js
"use strict";
const fs = require("fs"), path = require("path");
global.window = {};
["burgundy-data.js", "burgundy-data-beaune.js", "notes.js"].forEach(f => { try { require(path.join(__dirname, "..", f)); } catch (e) {} });
const I = require("../import.js"), T = require("../tidy.js"), H = require("./gas-harness"), VAULT = require("../vault.js");
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const J = x => JSON.stringify(x);
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];
const B = window.BURG;
const tidier = cellar => T.create({ producers: [...new Set([...cellar.map(w => w.producer), ...Object.values(B.producers)])], names: B.climats.map(c => c.n),
  communes: B.villages.flatMap(v => String(v.n).split(" · ")).filter(n => n.length > 5) });
const file = name => { const b = fs.readFileSync(path.join(__dirname, "fixtures", name)); return { name, size: b.length, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) }; };

(async () => {
  const book = await I.read(file("messy.xlsx")), rows = book.sheets[0].rows;
  const t = I.table(rows);
  check("headings with typos are found and matched", t.header === 2 && J(t.columns.map(c => c.field)) === J(["producer", "name", "vintage", "qty", "price", "location", "region", "country", "grape"]), J(t.columns.map(c => c.label + ":" + c.field)));
  const built = I.build(rows, t.header, t.columns.map(c => c.field));
  check("the repeated heading, the total and the blank row are left out", built.skipped.headers === 1 && built.skipped.totals === 1 && built.wines.length === 12, J(built.skipped) + " " + built.wines.length);
  check("an Excel error is an empty price", built.wines.find(w => /Margaux/i.test(w.producer)).price === undefined);

  const existing = [{ row: 2, producer: "Domaine Leflaive", name: "Puligny-Montrachet 1er Cru Les Pucelles", vintage: 2019, size: "", qty: 1, drunk: 0 }];
  const tz = tidier(existing).wines(built.wines, { existing });
  const fix = (f, from) => (tz.fixes.find(x => x.field === f && x.from === from) || {}).to;
  const regionOf = p => tz.wines.filter(w => p.test(w.producer)).map(w => w.region);
  check("'bourgugndy', 'Burgundy', 'BURGUNDY', 'Bourgogne' all end up Bourgogne", fix("region", "bourgugndy") === "Bourgogne" && regionOf(/roulot|leflaive|bonneau/i).every(r => r === "Bourgogne"), J(regionOf(/roulot|leflaive|bonneau/i)));
  check("'Bordeux', 'piedmont', 'Napa', 'rheinhessen'", fix("region", "Bordeux") === "Bordeaux" && regionOf(/conterno/i).every(r => r === "Piemonte") && fix("region", "Napa") === "Napa Valley" && fix("region", "rheinhessen") === "Rheinhessen", J(tz.fixes.filter(f => f.field === "region")));
  check("countries in the cellar's words: 'frankriig', 'France', 'Italy', 'Untied States'", fix("country", "frankriig") === "Frankrig" && tz.wines.every(w => ["Frankrig", "Italien", "USA", "Tyskland"].includes(w.country)) && fix("country", "Untied States") === "USA", J(tz.wines.map(w => w.country)));
  check("grapes spelled right: 'chardonay', 'Cabernet Sauvignion, Merlot', 'Reisling'", fix("grape", "chardonay") === "Chardonnay" && fix("grape", "Cabernet Sauvignion, Merlot") === "Cabernet Sauvignon, Merlot" && fix("grape", "Reisling") === "Riesling");
  check("shouting and lower case → Title Case, accents back", fix("producer", "DOMAINE ROULOT") === "Domaine Roulot" && fix("producer", "CHATEAU MARGAUX") === "Château Margaux" && fix("name", "meursault perrieres") === "Meursault Perrières", J(tz.fixes.filter(f => f.field !== "region").slice(0, 12)));
  check("'Roulot' becomes the 'Domaine Roulot' the rest of the file uses", fix("producer", "Roulot") === "Domaine Roulot");
  check("'domaine leflaive' takes the cellar's spelling", tz.wines.find(w => /leflaive/i.test(w.producer)).producer === "Domaine Leflaive");
  check("a typo of a producer joins the right spelling", fix("producer", "Bonneau du Matray") === "Bonneau du Martray");
  check("stray spaces go", tz.wines.find(w => /Conterno/.test(w.producer)).producer === "Giacomo Conterno" && tz.wines.find(w => /Conterno/.test(w.producer)).name === "Barolo Francia");

  const mg = T.merge(tz.wines);
  const roul = mg.wines.find(w => w.producer === "Domaine Roulot");
  check("three Roulot rows become one wine with 6 bottles", mg.wines.filter(w => w.producer === "Domaine Roulot").length === 1 && roul.qty === 6, J(roul));
  check("…price is the bottle-weighted mean of the priced rows: (3·1250 + 2·1350)/5 = 1290", roul.price === 1290, roul.price);
  check("…both locations kept", roul.location === "Kælder A · Kælder B", roul.location);
  const marg = mg.wines.filter(w => w.producer === "Château Margaux");
  check("two Château Margaux rows → one, 3 bottles, the only price", marg.length === 1 && marg[0].qty === 3 && marg[0].price === 8000, J(marg));
  check("Conterno 3 + 1 bottles → 4; Bonneau du Martray 2 + 1 → 3 at (2·2100 + 2400)/3 = 2200", mg.wines.find(w => /Conterno/.test(w.producer)).qty === 4 && mg.wines.find(w => /Bonneau/.test(w.producer)).qty === 3 && mg.wines.find(w => /Bonneau/.test(w.producer)).price === 2200);
  check("12 rows → 7 wines", mg.wines.length === 7 && mg.merged === 5, mg.wines.length + " " + mg.merged);
  const d = I.dedupe(mg.wines, existing, T.mergeKey);
  check("the Pucelles already in the cellar is spotted despite capitals", d.dupes.length === 1 && d.dupes[0].row === 2);
  check("turning a fix off keeps the original", tidier(existing).wines(built.wines, { existing, off: new Set(["region|bourgugndy"]) }).wines.some(w => w.region === "bourgugndy"));
  check("nothing is merged that isn't the same wine", T.merge([{ producer: "A", name: "X", vintage: 2019, qty: 1 }, { producer: "A", name: "X", vintage: 2020, qty: 1 }, { producer: "A", name: "X", vintage: 2019, size: "Magnum", qty: 1 }]).merged === 0);

  // into the sheet
  const gas = H({ Ark1: [HEAD] });
  const res = gas.call({ code: "test-code", action: "addmany", wines: d.fresh.map(I.clean), bumps: [] });
  check("the clean list goes in", res.ok && res.wines.length === 6 && res.wines.find(w => w.producer === "Domaine Roulot").region === "Bourgogne", J(res).slice(0, 200));

  // ── tidy up a messy cellar ──
  const messy = [HEAD.concat(["Placering"]),
    ["DOMAINE ROULOT", "France", "Burgundy", "Meursault", "Meursault Perrieres", "1. cru", "Hvid", "Chardonay", 2020, 3, 1250, 1, "", "a", "Kælder A"],
    ["Domaine Roulot", "Frankrig", "Bourgogne", "Meursault", "Meursault Perrières", "1. cru", "Hvid", "Chardonnay", 2020, 2, 1350, 0, "", "b", "Kælder B"],
    ["Roulot", "Frankrig", "bourgogne", "Meursault", "Meursault", "", "Hvid", "Chardonnay", 2019, 6, 450, 2, "", "", ""],
    ["Armand Rousseau", "Frankrig", "Bourgogne", "Gevrey-Chambertin", "Chambertin", "Grand cru", "Rød", "Pinot Noir", 2016, 1, 9000, 0, "", "", ""]];
  const g2 = H({ Ark1: messy });
  const wines = g2.call({ code: "test-code", action: "data" }).wines.map(w => ({ ...w, style: w.type }));
  const tc = tidier([]).wines(wines.map(w => ({ ...w })), {});
  const edits = []; tc.wines.forEach((w, i) => { const f = {}; for (const k of ["producer", "name", "commune", "region", "country", "grape", "source", "location"]) if (String(w[k] || "") !== String(wines[i][k] || "")) f[k] = w[k]; if (Object.keys(f).length) edits.push({ row: w.row, fields: f }); });
  check("tidy finds the fixes in the cellar (and leaves the clean rows alone)", edits.length === 2 && J(edits.map(e => e.row)) === "[2,4]" && edits[0].fields.name === "Meursault Perrières" && edits[1].fields.producer === "Domaine Roulot", J(edits));
  // one producer written three ways, with and without accents and prefix: each spelling is one fix to the same final
  // name, and the accents are kept (a user's cellar after importing a tasting list)
  { const meo = [{ producer: "Domaine Meo-Camuzet" }, { producer: "Meo-Camuzet" }, { producer: "Francois Cotat" }, { producer: "Méo-Camuzet" }, { producer: "François Cotat" }];
    const tm = tidier(meo).wines(meo.map(w => ({ ...w })), {});
    check("three spellings of Méo-Camuzet become one, with its accents", tm.wines.filter((w, i) => i !== 2 && i !== 4).every(w => w.producer === "Domaine Méo-Camuzet") && tm.wines[2].producer === "François Cotat", J(tm.wines.map(w => w.producer)));
    check("…each shown once, from what was written to where it ends (no fix of a fix)", tm.fixes.length === 4 && tm.fixes.every(f => f.to === "Domaine Méo-Camuzet" || f.to === "François Cotat") && !tm.fixes.some(f => f.from === "François Cotat"), J(tm.fixes));
    const tOff = tidier(meo).wines(meo.map(w => ({ ...w })), { off: new Set(["producer|Méo-Camuzet"]) });
    check("…and unticking one leaves just that one as written", tOff.wines[3].producer === "Méo-Camuzet" && tOff.wines[1].producer === "Domaine Méo-Camuzet", J(tOff.wines.map(w => w.producer)));
    // on an import the cellar's spelling still wins, so the cellar keeps one spelling
    const ti = tidier([{ producer: "Meo-Camuzet" }]).wines([{ producer: "Méo-Camuzet" }], { existing: [{ producer: "Meo-Camuzet" }] });
    check("…but an imported 'Méo-Camuzet' takes the cellar's 'Meo-Camuzet'", ti.wines[0].producer === "Meo-Camuzet", J(ti.wines)); }
  let r2 = g2.call({ code: "test-code", action: "setinfomany", edits });
  check("setinfomany writes them", r2.ok && r2.wines.filter(w => w.producer === "Domaine Roulot").length === 3 && r2.wines.every(w => w.region === "Bourgogne" && w.country === "Frankrig"), J(r2.wines.map(w => [w.producer, w.region, w.country, w.grape])));
  const by = new Map(); tc.wines.forEach(w => { const k = T.mergeKey(w); by.set(k, (by.get(k) || []).concat(w.row)); });
  const groups = [...by.values()].filter(x => x.length > 1).map(x => ({ keep: x[0], drop: x.slice(1) }));
  check("the same wine in two rows is found (not the 2019 village wine)", J(groups) === J([{ keep: 2, drop: [3] }]), J(groups));
  r2 = g2.call({ code: "test-code", action: "mergerows", groups });
  const m2 = r2.wines.find(w => w.name === "Meursault Perrières");
  check("mergerows joins them: 5 bottles, 1 drunk, price (3·1250 + 2·1350)/5 = 1290, notes and places kept", r2.ok && r2.wines.length === 3 && m2.qty === 5 && Number(m2.drunk) === 1 && m2.price === 1290 && m2.note === "a · b" && m2.location === "Kælder A · Kælder B", J(m2));
  check("…and the rows below moved up intact", r2.wines.find(w => w.producer === "Armand Rousseau").row === 4);
  check("mergerows refuses a row used twice", /Bad row/.test(g2.call({ code: "test-code", action: "mergerows", groups: [{ keep: 2, drop: [3] }, { keep: 3, drop: [4] }] }).error));
  check("setinfomany refuses a bad row", /Bad row/.test(g2.call({ code: "test-code", action: "setinfomany", edits: [{ row: 99, fields: { region: "x" } }] }).error));

  // the same in an encrypted cellar
  const g3 = H({ Ark1: [HEAD] }, { settings: { SIGNUP_CODE: "invite" } });
  const post = async p => g3.call(p);
  const keys = await VAULT.newKeys("pass-1234");
  const su = await post({ action: "signup", email: "someone@example.com", user: "tidyuser", code: "invite", ...keys.fields });
  await VAULT.start({ post, user: "tidyuser", token: su.token, dek: keys.dek });
  await VAULT.call({ action: "addmany", wines: [{ producer: "Roulot", name: "Meursault", vintage: 2019, qty: 2, price: 400 }, { producer: "roulot", name: "Meursault", vintage: 2019, qty: 1, price: 500 }], bumps: [] });
  let rv = await VAULT.call({ action: "setinfomany", edits: [{ row: 3, fields: { producer: "Roulot" } }] });
  rv = await VAULT.call({ action: "mergerows", groups: [{ keep: 2, drop: [3] }] });
  check("encrypted cellar: tidy and merge run in the browser", rv.ok && rv.wines.length === 1 && rv.wines[0].qty === 3 && Math.abs(rv.wines[0].price - 433.33) < 0.01, J(rv.wines));

  const n = results.filter(Boolean).length;
  console.log(`\n${n}/${results.length} passed`);
  process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
