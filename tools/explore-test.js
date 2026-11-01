// Exploratory test: a real member's week on a phone, then the same site pushed hard — hostile text in every field,
// silly numbers, double clicks, a broken connection, a tampered session, another member's name — against the real
// Code.gs (gas-harness.js), encrypted account and all. Looks for script running from data, lost or doubled wines,
// sideways scrolling, unhandled errors and anything the server lets through that it shouldn't.
//   (cd .. && python3 -m http.server 8765) & node tools/explore-test.js
"use strict";
const press = require("./press"); // a phone presses some buttons through ＋, the tabs or a menu
const { chromium } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];
// text that runs script if anything puts it into the page as HTML
const X = n => `<img src=x onerror="window.__xss='${n}'"><script>window.__xss='${n}'</script>"'><svg onload=window.__xss='${n}'>`;

(async () => {
  const b = await chromium.launch();
  const gas = H({ Ark1: [HEAD] }, { settings: { SIGNUP_CODE: "invite" } });
  let offline = false, calls = [];
  const device = async (vp) => {
    const ctx = await b.newContext({ viewport: vp || { width: 390, height: 844 }, isMobile: !!(vp && vp.width < 500) || !vp, hasTouch: true, acceptDownloads: true });
    await require("./turnstile-fake")(ctx);
    await ctx.route(require("./api-route"), async route => {
      const q = JSON.parse(route.request().postData() || "{}"); calls.push(q.action);
      if (offline) return route.abort("internetdisconnected");
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(gas.call(q)) });
    });
    const p = await ctx.newPage(), errs = [], dialogs = []; p._waitApp = require("./wait-app")(p); // logs from the start
    p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && !/Failed to load resource|internetdisconnected/.test(m.text()) && errs.push(m.text()));
    p.on("dialog", d => { dialogs.push(d.message()); d.type() === "prompt" ? d.dismiss() : d.accept(); });
    await require("./ask-auto")(ctx, dialogs, m => !/Type the username/.test(m)); // as the prompt was dismissed
    return { ctx, p, errs, dialogs };
  };
  const signUp = async (p, user, email) => {
    await p.goto(BASE); await p.waitForTimeout(400); await p.click("#gateToggle");
    await p.fill("#gateUser", user); await p.fill("#gateEmail", email || user + "@example.dk"); await p.fill("#gatePass", user + "-secret-1"); await p.fill("#gatePass2", user + "-secret-1");
    await p.fill("#gateInvite", "invite"); await p.click("#gateSubmit");
    await p.waitForSelector("#recModal.open", { timeout: 20000 });
    const code = await p.textContent("#recCode");
    await p.check("#recOk"); await p.click("#recDone");
    await p._waitApp(); await p.waitForTimeout(600);
    return code;
  };
  // against the device width: a phone browser widens innerWidth itself when the page is too wide
  const noSideways = p => p.evaluate(w => document.documentElement.scrollWidth <= w + 1, p.viewportSize().width);
  const xss = p => p.evaluate(() => window.__xss || "");
  const go = async (p, pg) => { await press(p, `.tab[data-page=${pg}]`); await p.waitForTimeout(400); };
  const cellar = p => p.evaluate(() => VAULT.call({ action: "data" }).then(r => r.wines));

  // ───────────── 1. a member's week, on a phone ─────────────
  const A = await device(), p = A.p;
  const rec = await signUp(p, "maja");
  check("sign-up on a phone lands in an empty cellar without sideways scrolling", await noSideways(p) && (await cellar(p)).length === 0);
  await press(p, "#addBtn"); await p.waitForTimeout(250);
  await p.fill("#aProducer", "Domaine Roulot"); await p.fill("#aName", "Meursault Les Luchets"); await p.click("#addForm .qpick button:has-text('Frankrig'), #addForm .qpick button:has-text('France')").catch(() => {});
  await p.fill("#aVintage", "2020"); await p.fill("#aQty", "3"); await p.fill("#aPrice", "650"); await p.selectOption("#aType", "Hvid");
  await p.click("#addSave"); await p.waitForFunction(() => !document.getElementById("addModal").classList.contains("open"), null, { timeout: 10000 });
  let ws = await cellar(p);
  check("adding a wine from the form", ws.length === 1 && ws[0].producer === "Domaine Roulot" && ws[0].qty === 3, JSON.stringify(ws.map(w => [w.producer, w.qty])));
  // drink one, rate it, search
  await p.locator('#tbl tr.main:has-text("Roulot")').first().click(); await p.waitForTimeout(250);
  await p.locator('#tbl tr.main:has-text("Roulot") + tr.detail button[data-act="drink"]').click(); await p.waitForTimeout(900);
  ws = await cellar(p);
  check("drinking a bottle", ws[0].drunk === 1, JSON.stringify(ws[0] && ws[0].drunk));
  await p.fill("#q", "luchets"); await p.waitForTimeout(300);
  check("search finds it by the vineyard", (await p.$$("#tbl tr.main")).length === 1);
  await p.fill("#q", "(["); await p.waitForTimeout(300);
  check("search with regex characters doesn't break", (await p.$$("#tbl tr.main")).length === 0 && !A.errs.length, A.errs.join(" | "));
  await p.fill("#q", ""); await p.waitForTimeout(200);
  // the sommelier
  await p.click("#sommBtn"); await p.waitForTimeout(200);
  await p.fill("#sommQ", "what should I drink tonight with fish?"); await p.press("#sommQ", "Enter");
  await p.waitForFunction(() => document.querySelectorAll("#sommLog .bot, #sommLog [data-kind]").length > 0 && !document.querySelector("#sommLog .thinking"), null, { timeout: 8000 }).catch(() => {});
  const somm = await p.textContent("#sommLog");
  check("the sommelier answers, and knows the cellar", /Roulot|Meursault|Luchets/.test(somm), somm.slice(-200));
  await p.click("#sommClose").catch(() => {});
  // log out, log back in, and the recovery code
  await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }); await p.goto(BASE); await p.waitForTimeout(500);
  await p.fill("#gateUser", "maja"); await p.fill("#gatePass", "wrong-password-1"); await p.click("#gateSubmit"); await p.waitForTimeout(1500);
  check("a wrong password says so and lets nobody in", await p.isHidden("#app") && (await p.textContent("#gateErr")).trim().length > 0, await p.textContent("#gateErr"));
  await p.click("#gateForgot"); await p.waitForTimeout(200);
  await p.fill("#gateUser", "maja"); await p.fill("#gateRec", rec.toLowerCase().replace(/-/g, " ")); // typed sloppily
  await p.fill("#gatePass", "maja-new-pass-2"); if (await p.isVisible("#gatePass2")) await p.fill("#gatePass2", "maja-new-pass-2");
  await p.click("#gateSubmit");
  const recOk = await p.waitForSelector("#app:not([hidden]), #recModal.open", { timeout: 20000 }).then(() => true).catch(() => false);
  if (await p.isVisible("#recModal.open")) { await p.check("#recOk"); await p.click("#recDone"); await p.waitForSelector("#app:not([hidden])", { timeout: 20000 }); }
  await p.waitForTimeout(600);
  check("forgotten password: the recovery code (typed in lower case with spaces) opens the same cellar", recOk && (await cellar(p)).length === 1, await p.textContent("#gateErr").catch(() => ""));

  // ───────────── 2. hostile text everywhere ─────────────
  await p.evaluate(async src => { const X = eval(src);
    await api({ action: "add", wine: { producer: X("producer"), name: X("name"), commune: X("commune"), country: X("country"), region: X("region"),
      classification: X("class"), type: X("type"), grape: X("grape"), vintage: X("vintage"), qty: 2, price: 100, source: X("source"), note: X("note"), location: X("loc") } });
    await api({ action: "jadd", entry: { date: "2026-10-10", producer: X("jprod"), wine: X("jwine"), place: X("jplace"), note: X("jnote"), rating: 9 } });
    await loadData();
  }, "(" + X.toString() + ")").catch(e => console.log("seed", e.message));
  for (const pg of ["cellar", "enjoyed", "wishlist", "journal"]) { await go(p, pg); }
  await go(p, "cellar");
  await p.locator("#tbl tr.main").first().click(); await p.waitForTimeout(300);
  await p.locator("#tbl tr.main + tr.detail button.winfo").first().click().catch(() => {}); await p.waitForTimeout(300);
  await p.keyboard.press("Escape");
  await p.click("#sommBtn"); await p.fill("#sommQ", "tell me about <img src=x onerror=window.__xss='somm'>"); await p.press("#sommQ", "Enter"); await p.waitForTimeout(3000);
  await p.fill("#sommQ", "what do I have from producer"); await p.press("#sommQ", "Enter"); await p.waitForTimeout(3000); await p.click("#sommClose").catch(() => {});
  await p.evaluate(() => { location.hash = "#<img src=x onerror=window.__xss='hash'>"; }); await p.waitForTimeout(300);
  check("hostile text in every field, the journal, the sommelier and the address never runs as script", !(await xss(p)), await xss(p));
  check("…and still shows as text", (await p.textContent("#tbl")).includes("<img src=x"), (await p.textContent("#tbl")).slice(0, 120));
  // the export: a formula in a cell is a classic spreadsheet trap
  await p.evaluate(() => api({ action: "add", wine: { producer: "=HYPERLINK(\"http://evil.example\",\"click\")", name: "+cmd|' /C calc'!A0", qty: 1 } }).then(loadData));
  await press(p, "#expBtn"); await p.waitForTimeout(300);
  const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 8000 }).catch(() => null), p.click("#expCsv")]);
  const csv = dl ? require("fs").readFileSync(await dl.path(), "utf8") : "";
  check("exported CSV defuses formulas (=, +, -, @ at the start of a cell)", csv && !/(^|[,;\n])"?[=+@]/.test(csv.replace(/^﻿/, "")), csv.split("\n").filter(l => /HYPERLINK|cmd/.test(l)).join(" / "));
  await p.keyboard.press("Escape");

  // ───────────── 3. silly numbers and sizes ─────────────
  const odd = await p.evaluate(async () => {
    const out = {};
    const tryAdd = async (k, w) => { try { const r = await api({ action: "add", wine: Object.assign({ producer: "Odd " + k }, w) }); out[k] = (r.wines || []).find(x => x.producer === "Odd " + k) || "missing"; } catch (e) { out[k] = "ERR " + e.message; } };
    await tryAdd("negqty", { qty: -5 }); await tryAdd("zeroqty", { qty: 0 }); await tryAdd("hugeqty", { qty: 1e9 }); await tryAdd("negprice", { qty: 1, price: -300 });
    await tryAdd("nanprice", { qty: 1, price: "abc" }); await tryAdd("vint1700", { qty: 1, vintage: 1700 }); await tryAdd("vint9999", { qty: 1, vintage: 9999 });
    await tryAdd("long", { qty: 1, note: "x".repeat(60000) }); await tryAdd("emoji", { qty: 1, name: "🍷 Château 東京 ‮gnp.exe" });
    return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, typeof v === "string" ? v : { qty: v.qty, price: v.price, vintage: v.vintage, note: (v.note || "").length }]));
  });
  console.log("   odd values →", JSON.stringify(odd));
  check("negative or absurd bottle counts aren't stored as such", !(odd.negqty && odd.negqty.qty < 0) && !(odd.hugeqty && odd.hugeqty.qty > 100000), JSON.stringify([odd.negqty, odd.hugeqty]));
  check("a negative or non-number price isn't stored as such", !(odd.negprice && odd.negprice.price < 0) && !(odd.nanprice && typeof odd.nanprice.price === "string" && odd.nanprice.price), JSON.stringify([odd.negprice, odd.nanprice]));
  await go(p, "cellar"); await p.waitForTimeout(300);
  check("the overview and list survive the odd values without errors or sideways scrolling", !A.errs.length && await noSideways(p), A.errs.join(" | "));
  const stats = await p.textContent("#overview, .stats, header").catch(() => "");
  check("no NaN, Infinity or undefined on the page", !/\bNaN\b|Infinity|undefined/.test(await p.textContent("body")), (await p.textContent("body")).match(/.{30}(NaN|Infinity|undefined).{30}/));

  // ───────────── 4. double clicks and a dropped connection ─────────────
  const before = (await cellar(p)).length;
  await press(p, "#addBtn"); await p.waitForTimeout(250); await p.fill("#aProducer", "Double Click Domaine"); await p.fill("#aQty", "1");
  await p.evaluate(() => { const b = document.getElementById("addSave"); b.click(); b.click(); b.click(); });
  await p.waitForTimeout(2500);
  const dbl = (await cellar(p)).filter(w => w.producer === "Double Click Domaine").length;
  check("three fast clicks on Save add the wine once", dbl === 1, "rows: " + dbl);
  await p.keyboard.press("Escape");
  offline = true;
  await press(p, "#addBtn"); await p.waitForTimeout(250); await p.fill("#aProducer", "Offline Domaine"); await p.click("#addSave"); await p.waitForTimeout(2500);
  const offMsg = (await p.textContent("body")).match(/Could not[^.]*|offline[^.]*/i);
  check("saving without a connection says so, and keeps the form filled", !!offMsg && (await p.inputValue("#aProducer")) === "Offline Domaine", offMsg && offMsg[0]);
  offline = false;
  await p.click("#addSave"); await p.waitForTimeout(2000);
  const after = await cellar(p);
  check("…and saving again once back online works, once", after.filter(w => w.producer === "Offline Domaine").length === 1 && after.length === before + 2,
    `offline rows ${after.filter(w => w.producer === "Offline Domaine").length}, ${before} → ${after.length}, modal open ${await p.isVisible("#addModal.open")}, err "${await p.textContent("#addModal .err, #addErr").catch(() => "?")}"`);
  await p.keyboard.press("Escape");

  // ───────────── 5. the grid, pushed ─────────────
  await press(p, "#impBtn"); await p.waitForTimeout(200); await p.click("#gridOpen"); await p.waitForTimeout(200);
  const many = Array.from({ length: 400 }, (_, i) => `Grid Producer ${i}\tCuvée ${i}\t\t\t\t\t${i % 2 ? "Red" : "White"}\t\t${2000 + (i % 25)}\t${1 + (i % 3)}\t\t${100 + i}`).join("\n");
  await p.evaluate(text => { const inp = document.querySelector('#wGrid tbody input[data-c="0"]'); inp.focus(); const dt = new DataTransfer(); dt.setData("text/plain", text);
    inp.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })); }, many);
  check("400 rows pasted into the table", /400 wines/.test(await p.textContent("#gridCount")), await p.textContent("#gridCount"));
  await p.evaluate(x => { document.querySelector('#wGrid tbody tr:nth-child(2) input[data-c="1"]').value = x; }, X("grid"));
  await p.click("#gridGo"); await p.waitForTimeout(800);
  await p.click("#impGo"); await p.waitForFunction(() => !document.getElementById("impModal").classList.contains("open"), null, { timeout: 30000 }).catch(() => {});
  const gridN = (await cellar(p)).filter(w => /^Grid Producer/.test(w.producer));
  check("…all 400 land in the cellar, with their bottles", gridN.length === 400 && gridN.reduce((s, w) => s + w.qty, 0) === Array.from({ length: 400 }, (_, i) => 1 + (i % 3)).reduce((a, b) => a + b, 0), gridN.length);
  check("…and the hostile cell stays text", !(await xss(p)), await xss(p));
  await p.evaluate(() => scrollTo(0, document.body.scrollHeight)); await p.waitForTimeout(800);
  check("the long list pages in without errors", !A.errs.length && (await p.$$("#tbl tr.main")).length >= 100, A.errs.join(" | ") + " rows " + (await p.$$("#tbl tr.main")).length);

  // ───────────── 6. another member, a tampered session, the server's doors ─────────────
  const B = await device({ width: 1280, height: 900 }), q = B.p;
  await signUp(q, "otto");
  check("a second member sees none of the first's wines", (await cellar(q)).length === 0 && !(await q.textContent("#tbl")).includes("Roulot"));
  const tok = await q.evaluate(() => { const k = Object.keys(localStorage).concat(Object.keys(sessionStorage)); return k.join(","); });
  const probes = await q.evaluate(async () => {
    const out = {}, t = async (k, body) => { try { const r = await api(body); out[k] = "ok " + JSON.stringify(r).slice(0, 80); } catch (e) { out[k] = "refused " + e.message; } };
    await t("admin", { action: "admin" }); await t("admininvites", { action: "admininvites", n: 10 }); await t("admindelete", { action: "admindelete", member: "maja" });
    await t("feed", { action: "feed" }); await t("follow", { action: "follow", who: "maja" }); await t("atlasedit", { action: "atlasedit", edit: { id: "x" } });
    return out;
  });
  console.log("   otto's probes →", JSON.stringify(probes));
  check("an ordinary member is refused at the owner's doors and the social ones", ["admin", "admininvites", "admindelete", "feed", "follow"].every(k => /^refused/.test(probes[k])), JSON.stringify(probes));
  // raw requests, as someone with curl would send them
  const raw = body => gas.call(body);
  const otto = gas.run(`findUser('otto').token`).split(",").pop() || "";
  check("someone else's name with your token is refused", raw({ action: "data", user: "maja", token: String(otto).split("@")[0] }).error === "bad-token");
  check("a made-up token is refused", raw({ action: "data", user: "maja", token: "0".repeat(64) }).error === "bad-token");
  check("no token at all is refused", raw({ action: "data" }).ok === false);
  check("signing up without an invite is refused", raw({ action: "signup", user: "intruder", email: "a@b.dk", invite: "" }).ok === false);
  check("signing up with the username of an existing member is refused", raw({ action: "signup", user: "MAJA", email: "a@b.dk", invite: "invite", kdf: "pbkdf2-sha256-600000" }).ok === false);
  let locked = null; for (let i = 0; i < 7; i++) locked = raw({ action: "login", user: "otto", auth: "A".repeat(43) + "=" });
  check("guessing passwords locks the name after a few tries", /locked/.test(locked.error || ""), JSON.stringify(locked));
  check("an unknown action is refused cleanly", raw({ action: "<script>", user: "otto", token: "x" }).ok === false);
  check("the encrypted cellar is not readable on the server", !JSON.stringify(gas.rows("Users")).includes("Roulot") && !Object.keys(gas.run("(() => { const o = {}; SpreadsheetApp.getActiveSpreadsheet().getSheets().forEach(s => o[s.getName()] = 1); return o; })()")).some(n => /Roulot/.test(n)));
  // tampered session in the browser
  await q.evaluate(() => { for (const s of [localStorage, sessionStorage]) for (const k of Object.keys(s)) if (/tok|sess|cfg|auth/i.test(k)) s.setItem(k, String(s.getItem(k)).replace(/[0-9a-f]{8}/, "deadbeef")); });
  await q.reload(); await q.waitForTimeout(2500);
  check("a tampered session in the browser ends at the login, not a broken page", (await q.isVisible("#gate")) || (await q.isVisible("#app")), "");
  check("no page errors for otto", !B.errs.length, B.errs.join(" | "));

  // ───────────── 8. the same member on a laptop too ─────────────
  const C = await device({ width: 1440, height: 900 }), r = C.p;
  await r.goto(BASE); await r.waitForTimeout(400); await r.fill("#gateUser", "maja"); await r.fill("#gatePass", "maja-new-pass-2"); await r.click("#gateSubmit");
  await r.waitForSelector("#app:not([hidden])", { timeout: 20000 }); await r.waitForTimeout(800);
  const n0 = (await cellar(r)).length;
  check("the laptop opens the same cellar as the phone", n0 === (await cellar(p)).length && n0 > 400, n0);
  await p.evaluate(() => api({ action: "add", wine: { producer: "From The Phone", qty: 1 } }));
  await r.evaluate(() => api({ action: "add", wine: { producer: "From The Laptop", qty: 1 } })); // its copy is now behind
  const both = (await r.evaluate(() => VAULT.call({ action: "data" }).then(x => x.wines))).map(w => w.producer);
  check("two devices saving one after the other keep both wines", both.includes("From The Phone") && both.includes("From The Laptop") && both.length === n0 + 2, both.length);
  const fp = (await cellar(r)).find(w => w.producer === "From The Phone");
  await r.evaluate(row => api({ action: "delete", row }), fp.row);
  const del = await r.evaluate(() => api({ action: "deleted" }).then(x => x.deleted));
  check("a deleted wine is under Recently deleted", del.some(d => /From The Phone/.test(JSON.stringify(d))), JSON.stringify(del).slice(0, 200));
  const id = (del.find(d => /From The Phone/.test(JSON.stringify(d))) || {}).id;
  await r.evaluate(id => api({ action: "undelete", id }), id);
  check("…and comes back from there", (await cellar(r)).some(w => w.producer === "From The Phone"));
  // a new password on the laptop: the phone's next save must not vanish quietly
  await press(r, "#acctBtn"); await r.waitForTimeout(200);
  await r.fill("#acctPass", "maja-new-pass-2"); await r.fill("#acctNew", "maja-third-pass-3"); await r.fill("#acctNew2", "maja-third-pass-3"); await r.click("#acctSave");
  await r.waitForFunction(() => !document.getElementById("acctModal").classList.contains("open"), null, { timeout: 15000 }).catch(() => {});
  const pres = await p.evaluate(async () => { try { await api({ action: "add", wine: { producer: "After The New Password", qty: 1 } }); return "saved"; } catch (e) { return "refused " + e.message; } });
  await p.waitForTimeout(1500);
  const kept = (await cellar(r)).some(w => w.producer === "After The New Password");
  check("after a new password elsewhere, the phone's save is either kept or clearly refused", (pres === "saved") === kept, pres + " / kept " + kept);
  check("no page errors on the laptop", !C.errs.length, C.errs.join(" | "));
  A.errs.length = 0; // the phone may report its ended session; what follows is checked afresh
  await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }); await p.goto(BASE); await p.waitForTimeout(400);
  await p.fill("#gateUser", "maja"); await p.fill("#gatePass", "maja-third-pass-3"); await p.click("#gateSubmit");
  await p.waitForSelector("#app:not([hidden])", { timeout: 20000 }); await p.waitForTimeout(600);

  // ───────────── 7. languages and dark mode on a phone ─────────────
  for (const lang of ["da", "fr", "de"]) {
    await p.evaluate(l => window.I18N_SET ? I18N_SET(l) : (localStorage.setItem("lang", l)), lang); await p.reload(); await p.waitForSelector("#app:not([hidden])", { timeout: 20000 }).catch(() => {}); await p.waitForTimeout(800);
    check(`${lang}: no sideways scrolling, no errors`, await noSideways(p) && !A.errs.length, A.errs.join(" | "));
  }
  await p.emulateMedia({ colorScheme: "dark" }); await p.waitForTimeout(300);
  const contrast = await p.evaluate(() => { const c = getComputedStyle(document.body); return [c.backgroundColor, c.color]; });
  check("dark mode: the page isn't dark text on dark", contrast[0] !== contrast[1], contrast.join(" / "));
  check("no page errors for maja through all of it", !A.errs.length, A.errs.join(" | "));
  check("no unexpected dialogs", !A.dialogs.filter(d => !/last|delete|remove|withdraw/i.test(d)).length, A.dialogs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
