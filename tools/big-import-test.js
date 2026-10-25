// A 10,000-row import, end to end in Node: the file (tools/fixtures/big.xlsx, from make-big-import.py) is read,
// mapped, corrected and merged as the Import dialog does it, then written through the real Code.gs in the parts the
// site sends; a second import of the same list adds bottles to the rows already there; and Tidy up's merges, sent in
// parts, give the same cellar as one big merge. Checks that nothing is lost or counted twice, and how long it takes.
//   python3 tools/make-big-import.py && node tools/big-import-test.js
"use strict";
const fs = require("fs"), path = require("path");
global.window = {};
["burgundy-data.js", "burgundy-data-beaune.js"].forEach(f => require(path.join(__dirname, "..", f)));
const I = require("../import.js"), T = require("../tidy.js"), H = require("./gas-harness");
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const J = x => JSON.stringify(x);
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];
const B = window.BURG;
const FIX = path.join(__dirname, "fixtures", "big.xlsx");
if (!fs.existsSync(FIX)) require("child_process").execFileSync("python3", [path.join(__dirname, "make-big-import.py")]);
const file = () => { const b = fs.readFileSync(FIX); return { name: "big.xlsx", size: b.length, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) }; };
const tidier = cellar => T.create({ producers: [...new Set([...cellar.map(w => w.producer), ...Object.values(B.producers)])], names: B.climats.map(c => c.n),
  communes: B.villages.flatMap(v => String(v.n).split(" · ")).filter(n => n.length > 5) });
const sum = (l, f) => l.reduce((s, w) => s + (Number(w[f]) || 0), 0);
// what the site sends (app.js impRun / tidyRun): parts of 400 new wines on a plain sheet
const send = (gas, wines, bumps, size) => { let calls = 0, r;
  for (let i = 0; i < bumps.length; i += 1000) { r = gas.call({ code: "test-code", action: "addmany", wines: [], bumps: bumps.slice(i, i + 1000) }); calls++; if (!r.ok) return r; }
  for (let i = 0; i < wines.length; i += size) { r = gas.call({ code: "test-code", action: "addmany", wines: wines.slice(i, i + size), bumps: [] }); calls++; if (!r.ok) return r; }
  return Object.assign(r, { calls }); };

(async () => {
  let t0 = Date.now();
  const book = await I.read(file()), rows = book.sheets[0].rows, tb = I.table(rows);
  const built = I.build(rows, tb.header, tb.columns.map(c => c.field));
  const tRead = Date.now() - t0;
  check("all 10,000 rows are read (no cut at 5,000)", built.wines.length === 10000 && !built.truncated, built.wines.length + " " + built.truncated);
  check("the 3 repeated headings and the totals row are left out", built.skipped.headers === 3 && built.skipped.totals === 1, J(built.skipped));
  const inFile = sum(built.wines, "qty");
  t0 = Date.now();
  const tz = tidier([]).wines(built.wines, { existing: [] }), mg = T.merge(tz.wines);
  const tTidy = Date.now() - t0;
  check("reading, mapping, correcting and merging 10,000 rows takes under 5 s", tRead + tTidy < 5000, `read ${tRead} ms, tidy+merge ${tTidy} ms`);
  console.log(`      read ${tRead} ms · tidy + merge ${tTidy} ms · ${tz.fixes.length} corrections · ${mg.merged} rows merged into others → ${mg.wines.length} wines`);
  check("every bottle is kept through the corrections and the merge", sum(mg.wines, "qty") === inFile && sum(tz.wines, "qty") === inFile, `${sum(mg.wines, "qty")} vs ${inFile}`);
  check("every region spelling ends up one name", J([...new Set(mg.wines.map(w => w.region))].sort()) === J(["Bordeaux", "Bourgogne", "Champagne", "Loire", "Mosel", "Piemonte", "Rhône", "Ribera del Duero"]), J([...new Set(mg.wines.map(w => w.region))]));
  check("shouting and stray spaces are gone from the producers", mg.wines.every(w => w.producer === w.producer.trim() && w.producer !== w.producer.toUpperCase()));
  const kind = n => T.prodId(n).split("#")[1];
  const crossed = tz.fixes.filter(f => f.field === "producer" && kind(f.from) && kind(f.from) !== kind(f.to));
  check("houses of different kinds are never joined (Domaine X ≠ Maison X)", !crossed.length, J(crossed.slice(0, 5)));
  const mk = new Set(mg.wines.map(T.mergeKey));
  check("after merging, each wine is one row", mk.size === mg.wines.length);
  const prices = mg.wines.filter(w => w.rows && w.price != null);
  check("merged prices stay within the rows' prices", prices.every(w => w.price >= 150 && w.price <= 6500), J(prices.find(w => !(w.price >= 150 && w.price <= 6500))));

  // ── into a plain sheet, unmerged: 10,000 rows in parts of 400 ──
  const gas = H({ Ark1: [HEAD] });
  const clean = tz.wines.map(I.clean);
  t0 = Date.now();
  let r = send(gas, clean, [], 400);
  check("10,000 wines are written in 25 parts", r.ok && r.calls === 25 && gas.rows("Ark1").length === 10001, J(r).slice(0, 200));
  console.log(`      the real Code.gs (in the fake sheet): ${Date.now() - t0} ms for 25 calls`);
  const back = gas.call({ code: "test-code", action: "data" }).wines;
  check("…and read back with every bottle", back.length === 10000 && sum(back, "qty") === inFile, `${back.length} · ${sum(back, "qty")}`);
  check("…with their locations", back.filter(w => w.location).length === tz.wines.filter(w => w.location).length);
  check("one call is refused above 5,000 rows, as the site never sends", gas.call({ code: "test-code", action: "addmany", wines: clean.slice(0, 5001), bumps: [] }).error === "Error: Too many rows (at most 5000)");

  // ── the same list again: merged, and every wine is already there → bottles are added to the existing rows ──
  const tz2 = tidier(back).wines(built.wines, { existing: back }), mg2 = T.merge(tz2.wines);
  const d = I.dedupe(mg2.wines, back, T.mergeKey);
  check("importing the list again finds every wine already in the cellar", d.fresh.length === 0 && d.dupes.length === mg2.wines.length, `${d.fresh.length} fresh, ${d.dupes.length} dupes`);
  const bumps = I.bumps(d.dupes);
  r = send(gas, [], bumps, 400);
  const back2 = gas.call({ code: "test-code", action: "data" }).wines;
  check(`${bumps.length} rows get their bottles added (in ${Math.ceil(bumps.length / 1000)} parts), and no row is added`, r.ok && back2.length === 10000 && sum(back2, "qty") === 2 * inFile, `${back2.length} · ${sum(back2, "qty")} vs ${2 * inFile}`);

  // ── Tidy up on that 10,000-row cellar: merges in parts of 300 groups give the same result as one big call ──
  const groupsOf = ws => { const by = new Map(); ws.forEach(w => { const k = T.mergeKey(w); (by.get(k) || by.set(k, []).get(k)).push(w.row); });
    return [...by.values()].filter(rs => rs.length > 1).map(rs => ({ keep: rs[0], drop: rs.slice(1) })); };
  const snapshot = gas.rows("Ark1");
  const tzc = tidier(back2).wines(back2, { existing: back2 });
  const groups = groupsOf(tzc.wines.map((w, i) => Object.assign(w, { row: back2[i].row })));
  const one = H({ Ark1: snapshot.map(r => [...r]) }); const r1 = one.call({ code: "test-code", action: "mergerows", groups });
  const parts = H({ Ark1: snapshot.map(r => [...r]) });
  let gone = []; const moved = x => { let n = 0; for (const g of gone) if (g < x) n++; return x - n; };
  let rp, calls = 0; t0 = Date.now();
  for (let i = 0; i < groups.length; i += 300) {
    rp = parts.call({ code: "test-code", action: "mergerows", groups: groups.slice(i, i + 300).map(g => ({ keep: moved(g.keep), drop: g.drop.map(moved) })) }); calls++;
    if (!rp.ok) break;
    gone = gone.concat(groups.slice(i, i + 300).flatMap(g => g.drop)).sort((a, b) => a - b);
  }
  check(`Tidy up merges ${groups.length} groups in ${calls} parts`, r1.ok && rp.ok && groups.length > 1000, J(rp).slice(0, 200));
  console.log(`      ${Date.now() - t0} ms for the parts`);
  check("…the parts leave the same cellar as one merge", J(parts.rows("Ark1")) === J(one.rows("Ark1")));
  const after = parts.call({ code: "test-code", action: "data" }).wines;
  check("…with every bottle and one row per wine", sum(after, "qty") === 2 * inFile && after.length === 10000 - groups.reduce((s, g) => s + g.drop.length, 0), `${sum(after, "qty")} · ${after.length}`);

  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
