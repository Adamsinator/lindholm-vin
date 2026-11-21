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
  const gas = H({ Ark1: [HEAD] }, { settings: { SIGNUP_CODE: "", OWNER_USER: "adam", OWNER_PASSWORD: "owner-pass-1", SOCIAL: "on" } });
  const post = async p => gas.call(p);
  const codes = quiet(() => gas.run("makeInvites()")).match(/AW-[A-Z0-9]{4}-[A-Z0-9]{4}/g);
  const accounts = {};
  for (const [user, pass] of [["anna", "anna-pass-1"], ["bodil", "bodil-pass-12"]]) {
    const k = await VAULT.newKeys(pass);
    const r = await post({ action: "signup", email: "someone@example.com", user, code: codes.shift(), ...k.fields });
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
  const until = await VAULT.deleteAccount({ post, user: "anna", token: accounts.anna.token, pass: "anna-pass-1" });
  const SC = gas.run("UCOL.Status") - 1, annaRow = () => gas.rows("Users").find(x => x[0] === "anna");
  check("with her password the account is marked deleted, and kept 30 days (API 64)", annaRow() && annaRow()[SC] === "deleted" && /^\d{4}-\d{2}-\d{2}$/.test(until), JSON.stringify(until));
  check("…meanwhile she can't log in, and is told so (only with the right password)", await VAULT.login({ post, user: "anna", pass: "anna-pass-1" }).then(() => "in", e => e.message) === "deleted"
    && await VAULT.login({ post, user: "anna", pass: "wrong-pass-9" }).then(() => "in", e => e.message) === "bad-login");
  check("…her files are still there", gas.run(`DriveApp.getFolderById(${JSON.stringify(annaFolderId)}).isTrashed()`) === false);
  gas.sheet("Users").getRange(gas.rows("Users").findIndex(x => x[0] === "anna") + 1, SC + 2).setValue(String(Date.now() - 31 * 864e5));
  gas.run("purgeDeletedAccounts()");
  check("31 days on, the daily check purges it: the account is gone from Users", !gas.rows("Users").some(x => x[0] === "anna") && gas.rows("Users").some(x => x[0] === "bodil"));
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

  // ── the owner's controls (API 64): block, sign out everywhere, delete with 30 days to undo, delete now ──
  const own = p => post({ user: "adam", token: lo.token, ...p }), bodilIn = () => VAULT.login({ post, user: "bodil", pass: "bodil-pass-12" }).then(x => "in", e => e.message);
  const bTok = (await VAULT.login({ post, user: "bodil", pass: "bodil-pass-12" })).token;
  let A = await own({ action: "adminblock", member: "bodil", on: true });
  check("blocking: bodil is listed as blocked, her session ends and she can't log in", A.users.find(u => u.user === "bodil").status === "blocked"
    && (await post({ user: "bodil", token: bTok, action: "vver" })).error === "bad-token" && await bodilIn() === "blocked");
  A = await own({ action: "adminblock", member: "bodil", on: false });
  check("…unblocked, she logs in again with everything", !A.users.find(u => u.user === "bodil").status && await bodilIn() === "in");
  const t2 = (await VAULT.login({ post, user: "bodil", pass: "bodil-pass-12" })).token;
  await own({ action: "adminsignout", member: "bodil" });
  check("signing her out everywhere ends her sessions, nothing else", (await post({ user: "bodil", token: t2, action: "vver" })).error === "bad-token" && await bodilIn() === "in");
  A = await own({ action: "admindelete", member: "bodil" });
  const bd = A.users.find(u => u.user === "bodil");
  check("removing: kept and marked deleted, with the day she goes for good", bd && bd.status === "deleted" && /^\d{4}-\d{2}-\d{2}$/.test(bd.purge) && await bodilIn() === "deleted", JSON.stringify(bd));
  A = await own({ action: "adminrestore", member: "bodil" });
  check("…undone within the 30 days, she's back, cellar and all", !A.users.find(u => u.user === "bodil").status && await bodilIn() === "in"
    && (await post({ user: "bodil", token: (await VAULT.login({ post, user: "bodil", pass: "bodil-pass-12" })).token, action: "vget" })).ok === true); // a fresh session: the old ones ended
  check("the owner's actions are listed on the admin page", ["blocked bodil", "unblocked bodil", "signed out bodil", "deleted bodil", "restored bodil"].every(w => A.log.some(x => x.what.startsWith(w))), JSON.stringify(A.log.map(x => x.what)));
  check("…and none of it works on the owner's own account", (await own({ action: "adminblock", member: "adam", on: true })).error === "owner-account");
  await own({ action: "admindelete", member: "bodil" }); A = await own({ action: "adminpurge", member: "bodil" });
  check("deleting for good at once: gone from Users", !A.users.some(u => u.user === "bodil") && !gas.rows("Users").some(x => x[0] === "bodil"));

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
  const dirs = gas.run("(() => { const o = [], it = backupsFolder().getFolders(); while (it.hasNext()) o.push(it.next().getName()); return o.sort(); })()");
  check("an old backup (2020) makes the daily check back up now", dirs.length === 2 && dirs[0] === "2020-01-05T04:00" && dirs[1] > "2026", JSON.stringify(dirs));
  // (this harness dates its files 2026-10-16, days before the real clock, so the fresh backup still counts as old)
  check("…and it reports when the newest is still not from the last 2 days", /backups: newest is 2026/.test(out) && gas.rt.mails.length === 3, out);
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
