// A person using an opened wine, many times over, at random: rate it, value it, its format, where it lies, when it
// was bought, its drink window (typed, or the estimate taken), drink a bottle (and Undo, or not), put one back, more or
// fewer bottles (Edit details), a journal note, another like this; and at the end delete one and Undo. After each step
// every wine is compared with what should be (so a change landing on the wrong wine shows too), and the panel with
// what it shows; then a reload, and all of it again from what was saved.
//   (cd .. && python3 -m http.server 8765) & node tools/detail-ui-test.js [desk|phone] [steps] [seed]
const { chromium, devices } = require("./pw");
const H = require("./gas-harness");
const OUT = require("os").tmpdir() + "/allwine-detail-";
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];
const K = ["rating", "value", "size", "location", "acquired", "drinkFrom", "drinkTo", "left", "qty", "drunk"];
const S = v => v == null ? "" : String(v);
let fails = 0, passes = 0; const log = [];
const bad = (m) => { fails++; log.push("FAIL " + m); console.log("FAIL " + m); };

(async () => {
  const only = process.argv[2], STEPS = Number(process.argv[3]) || 40; let seed = Number(process.argv[4]) || 202;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, pick = a => a[Math.floor(rnd() * a.length)], int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const b = await chromium.launch();
  for (const [tag, opt] of [["desk", { viewport: { width: 1300, height: 950 } }], ["phone", { ...devices["iPhone 13"] }]].filter(x => !only || x[0] === only)) {
    const gas = H({ Ark1: [HEAD] }, { settings: { SIGNUP_CODE: "invite" } });
    const ctx = await b.newContext(opt); await require("./turnstile-fake")(ctx); await require("./ask-auto")(ctx);
    await ctx.route(require("./api-route"), r => r.fulfill({ contentType: "application/json", body: JSON.stringify(gas.call(JSON.parse(r.request().postData() || "{}"))) }));
    const p = await ctx.newPage(); const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
    await p.goto((process.env.BASE || "http://localhost:8765/")); await p.waitForTimeout(400);
    const user = "testmonkey" + tag;
    await p.click("#gateToggle"); await p.fill("#gateUser", user); await p.fill("#gatePass", user + "-pass-1"); await p.fill("#gateInvite", "invite"); await p.fill("#gatePass2", user + "-pass-1"); await p.fill("#gateEmail", "x@example.com"); await p.click("#gateSubmit");
    await p.waitForSelector("#recModal.open", { timeout: 20000 }); await p.check("#recOk"); await p.click("#recDone"); await p.waitForSelector("#app:not([hidden])"); await p.waitForTimeout(800);
    await p.waitForFunction(() => !!window.TESTKIT, null, { timeout: 8000 });
    await p.evaluate(async () => { await loadJS("test-data.js?v=5"); await api({ action: "addmany", wines: TESTKIT.wines(150) }); await loadData(true); });
    await p.keyboard.press("Escape"); await p.keyboard.press("Escape");
    const stored = () => p.evaluate(async () => normalize((await api({ action: "data" })).wines).map(w => ({ row: w.row, producer: w.producer, name: w.name, vintage: w.vintage,
      rating: w.rating, value: w.value, size: w.size, location: w.location, acquired: w.acquired, drinkFrom: w.drinkFrom, drinkTo: w.drinkTo, left: w.left, qty: w.qty, drunk: w.drunk })));
    let model = await stored(); const byRow = r => model.find(w => w.row === r);
    const jCount = () => p.evaluate(() => (window.JENTRIES || (typeof JENTRIES !== "undefined" ? JENTRIES : null) || []).length);
    // compare every wine with the model; a few tries while the save lands
    const verify = async (what) => {
      let diff = [];
      for (let t = 0; t < 12; t++) {
        const now = await stored(); diff = [];
        if (now.length !== model.length) diff.push(`wines ${now.length} ≠ ${model.length}`);
        for (const m of model) { const n = now.find(w => w.row === m.row); if (!n) { diff.push("row " + m.row + " missing"); continue; }
          for (const k of K) if (S(n[k]) !== S(m[k])) diff.push(`row ${m.row} ${m.producer}: ${k} ${S(n[k])} ≠ ${S(m[k])}`); }
        if (!diff.length) { passes++; return true; }
        await p.waitForTimeout(250);
      }
      bad(`${tag} ${what}: ${diff.slice(0, 4).join("; ")}`); model = await stored(); return false; // carry on from what's there
    };
    // open a wine as a person would: search its producer, tap its line
    const open = async (w) => {
      await p.keyboard.press("Escape");
      if (await p.isHidden("#pageCellar")) { moved.push(await p.evaluate(() => location.hash || "(none)")); await p.evaluate(() => { location.hash = ""; }); await p.waitForTimeout(400); }
      await p.fill("#q", w.producer); await p.waitForTimeout(250);
      const tr = p.locator(`#tbl tr.main[data-row="${w.row}"]`);
      await tr.scrollIntoViewIfNeeded();
      if ((await tr.getAttribute("aria-expanded")) !== "true") { await tr.click(); await p.waitForTimeout(250); }
      return p.locator(`#tbl tr.main[data-row="${w.row}"] + tr.detail`);
    };
    const shown = async (w, sel, want, what) => { // the panel, drawn again, shows the new value
      const det = await open(w); const v = await det.locator(sel).first().inputValue().catch(() => "?");
      if (S(v) !== S(want)) bad(`${tag} ${what}: the panel shows "${v}", should be "${want}"`); else passes++;
    };
    const counts = {}, moved = [];
    // the same wine on two rows (bought twice): a journal note from the second drinks from the second, not the first
    await (async () => { const w = model.find(x => x.left > 0 && x.name);
      await p.evaluate(async w => { await api({ action: "add", wine: { producer: w.producer, name: w.name, vintage: w.vintage, country: "Frankrig", region: "Bourgogne", qty: 2 } }); await loadData(true); }, w);
      model = await stored(); const twin = model[model.length - 1], first = byRow(w.row), det = await open(twin);
      await det.locator("button.jlog").click(); await p.waitForSelector("#jModal.open"); await p.selectOption("#jRating", "8"); await p.click("#jSave"); await p.waitForTimeout(900);
      twin.left--; twin.drunk++; if (!twin.rating) twin.rating = 8;
      await verify("a note from the second of two rows of the same wine drinks from that row (" + w.producer + "; the first stays " + first.left + ")"); })()
      .catch(e => bad(`${tag} two rows: ${e.message.split("\n")[0]}`));
    // Edit details, a new count typed at once: the count is saved and the name isn't touched (the Name field used to take
    // the focus 40 ms after opening, and the digits with it)
    for (const w of model.filter(x => x.left > 0).slice(0, 6)) { const det = await open(w), m = byRow(w.row);
      await det.locator("button.winfo").click(); await p.waitForSelector("#iModal.open"); await p.fill("#iLeft", String(m.left + 1)); await p.click("#iSave"); await p.waitForTimeout(600);
      m.left++; m.qty++; const n = (await stored()).find(x => x.row === w.row);
      if (n.name !== w.name || S(n.vintage) !== S(w.vintage)) bad(`${tag} a quick edit renamed ${w.producer} "${w.name}" → "${n.name}"`); else passes++;
      await verify("a quick edit of " + w.producer); await p.keyboard.press("Escape"); }
    for (let step = 0; step < STEPS; step++) {
      const inCellar = model.filter(w => w.left > 0);
      const w = pick(inCellar), acts = ["rate", "value", "size", "location", "acquired", "window", "estimate", "drink", "drink", "undrink", "stock", "journal", "like"];
      let act = pick(acts); if (act === "undrink" && !(w.drunk > 0)) act = "drink";
      counts[act] = (counts[act] || 0) + 1;
      const det = await open(w), m = byRow(w.row), label = `step ${step} ${act} on ${w.producer} ${w.vintage || ""} (row ${w.row})`;
      try {
        if (act === "rate") { const v = pick(["", ...Array.from({ length: 10 }, (_, i) => String(i + 1))]); await det.locator("select.rate").selectOption(v); m.rating = v ? Number(v) : null;
          await verify(label); await shown(w, "select.rate", v, label); }
        else if (act === "value") { if (!(await det.locator("input.setval").count())) continue; const v = String(int(100, 9000)); await det.locator("input.setval").fill(v); await det.locator("input.setval").press("Tab"); m.value = Number(v);
          await verify(label); await shown(w, "input.setval", v, label); }
        else if (act === "size") { const opts = await det.locator("select.setsize option").evaluateAll(o => o.map(x => x.value)); const v = pick(opts); await det.locator("select.setsize").selectOption(v); m.size = v;
          await verify(label); await shown(w, "select.setsize", v, label); }
        else if (act === "location") { const v = pick(["Kælder, reol 2", "Garage", "Skab A, hylde 3", ""]); await det.locator("input.setloc").fill(v); await det.locator("input.setloc").press("Tab"); m.location = v;
          await verify(label); await shown(w, "input.setloc", v, label); }
        else if (act === "acquired") { const v = `20${int(15, 25)}-0${int(1, 9)}-1${int(0, 9)}`; await det.locator('input.setdate[data-field="acquired"]').fill(v); await p.waitForTimeout(100); m.acquired = v;
          await verify(label); await shown(w, 'input.setdate[data-field="acquired"]', v, label); }
        else if (act === "window") { const f = int(2018, 2030), t = f + int(1, 25);
          await det.locator('.setwin[data-end="from"]').fill(String(f)); await det.locator('.setwin[data-end="to"]').fill(String(t)); await det.locator('.setwin[data-end="to"]').press("Enter");
          m.drinkFrom = f; m.drinkTo = t; await verify(label); await shown(w, '.setwin[data-end="to"]', t, label); }
        else if (act === "estimate") { const u = det.locator("button.usewin"); if (!(await u.count())) { counts[act]--; continue; }
          const f = Number(await u.getAttribute("data-from")), t = Number(await u.getAttribute("data-to")); await u.click(); m.drinkFrom = f; m.drinkTo = t; await verify(label); }
        else if (act === "drink") { await det.locator('button[data-act="drink"]').click(); await p.waitForTimeout(400); m.left--; m.drunk++;
          await verify(label);
          if (rnd() < 0.5) { await p.locator("#actBtns button").first().click(); m.left++; m.drunk--; await verify(label + " → Undo"); } }
        else if (act === "undrink") { await det.locator('button[data-act="undrink"]').click(); m.left++; m.drunk--; await verify(label); }
        else if (act === "stock") { const nl = Math.max(m.drunk > 0 ? 0 : 1, m.left + pick([-2, -1, 1, 2, 3])); await det.locator("button.winfo").click(); await p.waitForSelector("#iModal.open");
          if (Number(await p.inputValue("#iLeft")) !== m.left) bad(`${tag} ${label}: Edit details shows ${await p.inputValue("#iLeft")} in the cellar, should be ${m.left}`);
          await p.fill("#iLeft", String(nl));
          await p.click("#iSave"); await p.waitForTimeout(500); m.qty = m.drunk + nl; m.left = nl; await verify(label + ` (${nl} in the cellar)`); }
        else if (act === "journal") { const j0 = await jCount(); await det.locator("button.jlog").click(); await p.waitForSelector("#jModal.open, #jModal:not([hidden])", { timeout: 4000 }).catch(() => {});
          const jr = int(5, 10); await p.fill("#jNote", "Monkey note " + step); await p.selectOption("#jRating", String(jr));
          // already drunk today: the form says so ("Already in Enjoyed") and doesn't drink another; else the box is ticked
          const done = await p.isHidden("#jEnjoyWrap"), def = await p.isChecked("#jEnjoy");
          // "already drunk today" is the bottle of this wine drunk today: the opened row if it was, else its twin's
          const tgt = done ? await p.evaluate(r => { const t = WINES.find(w => w.row === r), today = todayStr(), same = w => w.producer === t.producer && w.name === t.name && String(w.vintage) === String(t.vintage);
            const d = w => w.drunk > 0 && w.drunkDate === today; return (d(t) ? t : WINES.find(w => same(w) && d(w)) || {}).row; }, w.row) : w.row;
          if (done && !tgt) bad(`${tag} ${label}: "Already in Enjoyed", but no bottle of it was drunk today`);
          if (!done && !def) bad(`${tag} ${label}: "Also mark a bottle as drunk" isn't ticked for a wine in the cellar`);
          if (done && !(await p.isVisible("#jEnjoyDone"))) bad(`${tag} ${label}: neither the box nor "Already in Enjoyed"`);
          let tick = !done && rnd() < 0.6; if (!done && !tick) await p.uncheck("#jEnjoy");
          await p.click("#jSave"); await p.waitForTimeout(900);
          // the note's score becomes the wine's when it had none: a bottle drunk now, or one drunk earlier today
          if (tick) { m.left--; m.drunk++; } const mt = byRow(tgt) || m; if ((tick || done) && !mt.rating) mt.rating = jr;
          const j1 = await jCount(); if (j1 !== j0 + 1) bad(`${tag} ${label}: journal ${j0} → ${j1}`); else passes++; await verify(label); }
        else if (act === "like") { await det.locator("button.wlike").click(); await p.waitForSelector("#addModal.open");
          if ((await p.inputValue("#aProducer")) !== w.producer) bad(`${tag} ${label}: the form has "${await p.inputValue("#aProducer")}"`);
          const q = int(1, 4); await p.fill("#aQty", String(q)); await p.fill("#aVintage", String(int(2005, 2022))); await p.click("#addSave"); await p.waitForTimeout(900);
          const now = await stored(); const nw = now.find(x => !model.some(y => y.row === x.row));
          if (!nw || nw.producer !== w.producer || nw.qty !== q) bad(`${tag} ${label}: new wine ${JSON.stringify(nw)}`); else { passes++; model.push(nw); }
          await verify(label); }
      } catch (e) { bad(`${tag} ${label}: ${e.message.split("\n")[0]}`); await p.screenshot({ path: OUT + tag + "-fail-" + step + ".png" }); model = await stored(); }
      await p.keyboard.press("Escape").catch(() => {});
    }
    // delete one, then Undo: it's back, as it was
    await (async () => { const w = pick(model.filter(x => x.left > 0)), det = await open(w), n0 = model.length;
      await det.locator('button[data-act="delete"]').click(); await p.waitForTimeout(900);
      const gone = await stored(); if (gone.length !== n0 - 1) bad(`${tag} delete: ${n0} → ${gone.length}`); else passes++;
      await p.locator("#actBtns button").first().click(); await p.waitForTimeout(1200);
      const back = await stored(); const same = back.find(x => x.producer === w.producer && S(x.vintage) === S(w.vintage) && K.every(k => k === "row" || S(x[k]) === S(byRow(w.row)[k])));
      if (back.length !== n0 || !same) bad(`${tag} delete → Undo: ${back.length} wines, the same wine back: ${!!same}`); else passes++;
      model = back; })().catch(e => bad(`${tag} delete: ${e.message.split("\n")[0]}`));
    // a reload: everything as it was saved
    await p.reload(); await p.waitForSelector("#app:not([hidden])", { timeout: 30000 }); await p.waitForTimeout(1500);
    const after = await p.evaluate(() => WINES.map(w => ({ row: w.row, rating: w.rating, value: w.value, size: w.size, location: w.location, acquired: w.acquired, drinkFrom: w.drinkFrom, drinkTo: w.drinkTo, left: w.left, qty: w.qty, drunk: w.drunk })));
    const d = model.flatMap(m => { const a = after.find(x => x.row === m.row); return !a ? ["row " + m.row + " gone"] : K.filter(k => S(a[k]) !== S(m[k])).map(k => `row ${m.row} ${k} ${S(a[k])}≠${S(m[k])}`); });
    if (after.length !== model.length || d.length) bad(`${tag} after a reload: ${after.length} wines; ${d.slice(0, 4).join("; ")}`); else passes++;
    if (errs.length) bad(`${tag} page errors: ${errs.slice(0, 3).join(" | ")}`);
    console.log(tag, "actions:", JSON.stringify(counts), "left the cellar page after:", moved.length, [...new Set(moved)].join(","));
    await ctx.close();
  }
  await b.close();
  console.log(`\n${passes}/${passes + fails} passed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
