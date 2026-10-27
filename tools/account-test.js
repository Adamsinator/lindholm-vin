// Tests of "Delete my account" and of the event log with its daily report (apps-script/Code.gs, API 37), in Node
// against the real Code.gs (gas-harness.js), with the browser's own vault code as the client.
//   node tools/account-test.js
"use strict";
const H = require("./gas-harness");
const VC = require("../vault-crypto.js");
const VAULT = require("../vault.js");
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];
const quiet = f => { const log = console.log; console.log = () => {}; try { return f(); } finally { console.log = log; } }; // told() prints

(async () => {
  const gas = H({ Ark1: [HEAD] }, { settings: { SIGNUP_CODE: "", OWNER_USER: "adam", OWNER_PASSWORD: "owner-pass-1" } });
  const post = async p => gas.call(p);
  const codes = quiet(() => gas.run("makeInvites()")).match(/AW-[A-Z0-9]{4}-[A-Z0-9]{4}/g);
  const accounts = {};
  for (const [user, pass] of [["anna", "anna-pass-1"], ["bodil", "bodil-pass-12"]]) {
    const k = await VAULT.newKeys(pass);
    const r = await post({ action: "signup", user, code: codes.shift(), ...k.fields });
    accounts[user] = { token: r.token, pass };
  }
  const as = (user, p) => post({ user, token: accounts[user].token, ...p });
  // anna's traces in the shared tabs
  await as("bodil", { action: "feedpost", entry: { type: "drank", producer: "Roulot", wine: "Meursault", note: "bodil's" } });
  await as("anna", { action: "feedpost", entry: { type: "drank", producer: "Leflaive", wine: "Pucelles", note: "anna's" } });
  const bodilPost = (await as("bodil", { action: "feed" })).feed.find(e => e.from === "bodil");
  await as("anna", { action: "feedcheer", id: bodilPost.id });
  await as("anna", { action: "feedcomment", id: bodilPost.id, text: "lovely" });
  await as("bodil", { action: "feedcomment", id: bodilPost.id, text: "thanks" });
  await as("anna", { action: "follow", target: "bodil", on: true });
  await as("bodil", { action: "follow", target: "anna", on: true });
  await as("anna", { action: "atlasedit", edit: { climat: "musigny", producer: "Vogüé", ha: 7.12 } });
  const annaVault = gas.rows("Users").find(r => r[0] === "anna")[12];
  const fileOf = id => Object.values(gas.rt.files).find(f => f.id === id) || gas.rt.files[id];
  const annaFolder = gas.run(`DriveApp.getFileById(${JSON.stringify(annaVault)}).getParents().next().getName()`);
  const annaFolderId = gas.run(`DriveApp.getFileById(${JSON.stringify(annaVault)}).getParents().next().getId()`);
  check("setup: anna has a vault in her own folder", annaFolder === "AllWine — anna", annaFolder);
  check("setup: her atlas correction is saved", (gas.rows("AtlasEdits") || []).some(x => x[1] === "anna"), JSON.stringify(gas.rows("AtlasEdits")));

  // ── deleting ──
  const pre = await post({ action: "prelogin", user: "anna" });
  const wrong = await VC.fromPassword("not-her-password", pre.kdfSalt, pre.kdf);
  let r = await as("anna", { action: "deleteaccount", auth: wrong.auth });
  check("a wrong password deletes nothing", r.error === "bad-login" && gas.rows("Users").some(x => x[0] === "anna"));
  r = await as("anna", { action: "deleteaccount" });
  check("…nor does no password", r.error === "bad-login" && gas.rows("Users").some(x => x[0] === "anna"));
  await VAULT.deleteAccount({ post, user: "anna", token: accounts.anna.token, pass: "anna-pass-1" });
  check("with her password the account is gone from Users", !gas.rows("Users").some(x => x[0] === "anna") && gas.rows("Users").some(x => x[0] === "bodil"));
  const folderTrashed = gas.run(`DriveApp.getFolderById(${JSON.stringify(annaFolderId)}).isTrashed()`);
  check("…her folder (vault, photos) is in the Drive trash", folderTrashed === true, String(folderTrashed));
  const bodilVault = gas.rows("Users").find(x => x[0] === "bodil")[12];
  check("…bodil's files are untouched", gas.run(`DriveApp.getFileById(${JSON.stringify(bodilVault)}).getParents().next().isTrashed()`) === false);
  const feed = (await as("bodil", { action: "feed" })).feed;
  check("…her feed posts are removed, bodil's stay", !feed.some(e => e.from === "anna") && feed.some(e => e.from === "bodil"));
  const bp = feed.find(e => e.id === bodilPost.id);
  check("…her cheer is taken back", bp && !bp.cheers.includes("anna"), JSON.stringify(bp && bp.cheers));
  check("…her comment is removed, bodil's stays", bp && !bp.comments.some(c => c.from === "anna") && bp.comments.some(c => c.from === "bodil"));
  check("…follows both ways are gone", !gas.rows("Follows").slice(1).some(x => x.includes("anna")), JSON.stringify(gas.rows("Follows")));
  check("…the invite she used is signed '(deleted account)'", gas.rows("Invites").some(x => x[3] === "(deleted account)") && !gas.rows("Invites").some(x => x[3] === "anna"));
  check("…and so is her atlas correction", gas.rows("AtlasEdits").some(x => x[1] === "(deleted account)") && !gas.rows("AtlasEdits").some(x => x[1] === "anna"), JSON.stringify(gas.rows("AtlasEdits")));
  r = await as("anna", { action: "vget" });
  check("her session no longer works", r.ok === false, JSON.stringify(r));
  check("…and she can't log in", await VAULT.login({ post, user: "anna", pass: "anna-pass-1" }).then(x => !!x.legacy, e => e.message === "bad-login"));
  check("nothing of her cellar was ever in the clear", !JSON.stringify(gas.rt.books).includes("anna-pass-1"));

  // the owner's account, whose cellar is the master sheet, can't be deleted this way
  quiet(() => gas.run("makeOwner()"));
  const lo = await post({ action: "login", user: "adam", pass: "owner-pass-1" });
  r = await post({ user: "adam", token: lo.token, action: "deleteaccount", pass: "owner-pass-1" });
  check("the owner's account is refused", r.error === "owner-account" && gas.rows("Users").some(x => x[0] === "adam"));

  // ── the event log and the daily report ──
  const logRows = () => (gas.rows("Log") || [[]]).slice(1);
  check("sign-ups were logged", logRows().filter(x => x[1] === "signup").length === 2);
  for (const u of ["x1", "x2", "x3"]) for (let i = 0; i < 5; i++) await post({ action: "login", user: u, auth: "wrong-key-wrong-key" });
  check("a lockout is logged once per username, at the 5th wrong try", logRows().filter(x => x[1] === "lockout").length === 3, JSON.stringify(logRows().map(x => x[1])));
  await as("bodil", { action: "jdelete", row: 99 });
  const g2 = H({ Ark1: [HEAD] }, { settings: { GATEWAY_SECRET: "s".repeat(40) } });
  g2.post('{"action":"atlas"}');
  check("a request without the gateway secret is logged", (g2.rows("Log") || []).some(x => x[1] === "gateway"));
  let out = quiet(() => g2.run("dailyReport()"));
  check("a quiet day sends no email", /^All quiet/.test(out) && g2.rt.mails.length === 0, out);
  out = quiet(() => gas.run("dailyReport()"));
  check("3 lockouts in a day: the owner gets an email", gas.rt.mails.length === 1 && /lockout: 3/.test(gas.rt.mails[0].subject + gas.rt.mails[0].body), out);
  check("…to the script owner's address, listing the events", gas.rt.mails[0].to === "owner@example.com" && /x1/.test(gas.rt.mails[0].body) && /Log/.test(gas.rt.mails[0].body));
  gas.run("SETTINGS.REPORT_EMAIL = 'alerts@example.com'");
  quiet(() => gas.run("dailyReport()"));
  check("REPORT_EMAIL sends it elsewhere", gas.rt.mails[1].to === "alerts@example.com");
  gas.sheet("Log")._cells.slice(1).forEach(r => { r[0] = new Date(Date.now() - 25 * 3600e3); }); // the events are a day old
  out = quiet(() => gas.run("dailyReport()"));
  check("a day later the same events no longer count", /^All quiet/.test(out) && gas.rt.mails.length === 2, out);
  // a backup schedule without a recent backup
  gas.run(`ScriptApp.newTrigger('backupNow').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(4).create(); backupsFolder().createFolder('2020-01-05T04:00')`);
  out = quiet(() => gas.run("dailyReport()"));
  check("a backup older than 8 days is reported", /backups: newest is 2020-01-05/.test(out) && gas.rt.mails.length === 3, out);
  // the schedule
  out = quiet(() => gas.run("installDailyReport()"));
  quiet(() => gas.run("installDailyReport()"));
  const daily = gas.run("ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'dailyReport').map(t => t.spec)");
  check("installDailyReport schedules it once, daily at 7, and sends a test email", daily.length === 1 && daily[0].days === 1 && daily[0].hour === 7
    && gas.rt.mails.filter(m => /daily check installed/.test(m.subject)).length === 2, JSON.stringify(daily));
  // a flood can't flood the sheet
  const before = logRows().length;
  for (let i = 0; i < 80; i++) gas.run("logEvent('rate-limit', 'flooder', 'post')");
  check("at most 50 events of a kind an hour are written", logRows().length - before === 50, String(logRows().length - before));
  gas.run("for (let i = 0; i < 1250; i++) logEvent('k' + i, '', '')");
  const n = logRows().length;
  check("only about the newest 1000 rows are kept", n >= 1000 && n <= 1101, String(n));

  const passed = results.filter(Boolean).length; console.log(`\n${passed}/${results.length} passed`); process.exit(passed === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
