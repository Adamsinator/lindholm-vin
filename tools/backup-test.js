// Tests of the backups in apps-script/Code.gs (daily, kept BACKUP_KEEP weeks) and of Recently deleted, in Node: the real Code.gs as the server (gas-harness.js) and the real
// browser modules as the client, so an encrypted cellar is backed up, changed, restored, and opened again with the
// owner's password — the restore is only proven once the restored copy decrypts.
//   node tools/backup-test.js
"use strict";
const H = require("./gas-harness");
const VC = require("../vault-crypto.js");
const VAULT = require("../vault.js");
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];

(async () => {
  const gas = H({ Ark1: [HEAD, ["Armand Rousseau", "Frankrig", "Bourgogne", "", "Clos St-Jacques", "", "Rød", "Pinot Noir", 2016, 3, 4500, "", "", ""]] },
                { settings: { SIGNUP_CODE: "invite", BACKUP_KEEP: "3" }, today: new Date().toISOString().slice(0, 10) }); // backups are dated by the real clock
  const post = async p => gas.call(p);
  const setSetting = (k, v) => gas.run(`SETTINGS.${k} = ${JSON.stringify(v)};`);
  const backupDirs = () => Object.values(gas.rt.files).length && gas.run(`(() => { const out = []; const it = backupsFolder().getFolders(); while (it.hasNext()) out.push(it.next().getName()); return out.sort(); })()`);

  // two encrypted accounts with a wine each
  const open = async (user, pass) => {
    const pre = await post({ action: "prelogin", user }), pk = await VC.fromPassword(pass, pre.kdfSalt, pre.kdf);
    const r = await post({ action: "login", user, auth: pk.auth });
    await VAULT.start({ post, user, token: r.token, dek: await VC.unwrap(r.wrapKey, pk.kek, false) });
    return r;
  };
  for (const [user, pass, wine] of [["anna", "anna-pass-1", "Les Pucelles"], ["bodil", "bodil-pass-12", "Barolo Francia"]]) {
    const k = await VAULT.newKeys(pass);
    const s = await post({ action: "signup", user, code: "invite", ...k.fields });
    await VAULT.start({ post, user, token: s.token, dek: k.dek });
    await VAULT.call({ action: "add", wine: { producer: user === "anna" ? "Domaine Leflaive" : "Giacomo Conterno", name: wine, vintage: 2019, qty: 2 } });
  }

  // ── a backup ──
  const printed = [], log0 = console.log; console.log = m => printed.push(String(m));
  const msg = gas.run("backupNow()");
  console.log = log0;
  check("backupNow() copies the master sheet and both vaults", /the master sheet and 2 account/.test(msg), msg);
  check("…and prints it, for the editor's execution log", printed.length === 1 && printed[0] === msg, JSON.stringify(printed));
  const dirs = backupDirs();
  check("…into a dated folder under Backups", dirs.length === 1 && /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(dirs[0]), JSON.stringify(dirs));
  const names = gas.run(`(() => { const out = []; const it = backupsFolder().getFoldersByName(${JSON.stringify(dirs[0])}).next().getFiles(); while (it.hasNext()) out.push(it.next().getName()); return out.sort(); })()`);
  check("…with a manifest", JSON.stringify(names) === JSON.stringify(["anna — vault", "bodil — vault", "manifest.txt", "master"]), JSON.stringify(names));
  const copyOf = name => { const f = Object.values(gas.rt.files).find(x => x.name === name && x.book); return f && f.book; };
  check("the master copy holds the accounts and the owner's wines", (() => { const b = copyOf("master"); return b && b.sheets.Users && b.sheets.Ark1._cells.some(r => r[0] === "Armand Rousseau"); })());
  const all = JSON.stringify(Object.values(gas.rt.books).map(b => Object.values(b.sheets).map(s => s._cells)));
  check("the copies hold nothing in the clear", !/Leflaive|Pucelles|Conterno|anna-pass/.test(all));

  // ── anna's cellar changes after the backup; then she wants it back as it was ──
  await open("anna", "anna-pass-1");
  await VAULT.call({ action: "add", wine: { producer: "Krug", name: "Grande Cuvée", qty: 1 } });
  await VAULT.call({ action: "delete", row: 2 }); // the Leflaive, by mistake
  let w = (await VAULT.call({ action: "data" })).wines.map(x => x.producer);
  check("after the backup: Leflaive deleted, Krug added", JSON.stringify(w) === JSON.stringify(["Krug"]), JSON.stringify(w));
  check("restore needs its settings", /Set RESTORE_USER/.test(gas.run("restoreFromBackup()")));
  setSetting("RESTORE_USER", "anna"); setSetting("RESTORE_FROM", "1999-01-01T00:00");
  check("…and a backup that exists", /No backup folder/.test(gas.run("restoreFromBackup()")));
  setSetting("RESTORE_FROM", dirs[0]);
  const rm = gas.run("restoreFromBackup()");
  check("restoreFromBackup() puts anna's vault back", /Restored vault of "anna"/.test(rm), rm);
  check("…signs her devices out, so they reload", (await post({ action: "vget", user: "anna", token: VAULT.token ? VAULT.token() : "x" })).error === "bad-token"
    || String(gas.rows("Users").find(r => r[0] === "anna")[4]) === "");
  await open("anna", "anna-pass-1");
  w = (await VAULT.call({ action: "data" })).wines.map(x => x.producer);
  check("…and her password opens the restored cellar: Leflaive is back, Krug gone", JSON.stringify(w) === JSON.stringify(["Domaine Leflaive"]), JSON.stringify(w));
  await open("bodil", "bodil-pass-12");
  w = (await VAULT.call({ action: "data" })).wines.map(x => x.producer);
  check("bodil's cellar is untouched", JSON.stringify(w) === JSON.stringify(["Giacomo Conterno"]), JSON.stringify(w));
  check("her replaced vault is kept, renamed", Object.values(gas.rt.files).some(f => /^AllWine vault — anna \(replaced \d{4}-\d\d-\d\d\)$/.test(f.name) && !f.trashed));
  check("she can keep using it: a new wine saves", (await VAULT.call({ action: "add", wine: { producer: "Ruinart", qty: 1 } })).ok);

  // ── a daily schedule, and BACKUP_KEEP weeks of backups ──
  const sched = gas.run("installDailyBackup()");
  const spec = () => gas.run("ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'backupNow').map(t => t.spec)");
  check("installDailyBackup() schedules backupNow every night at 4 (and backs up now)", /Daily backup scheduled/.test(sched) && spec().length === 1 && spec()[0].days === 1 && spec()[0].hour === 4, sched + " " + JSON.stringify(spec()));
  gas.run("installDailyBackup()");
  check("…running it again doesn't add a second schedule", spec().length === 1);
  check("…and the old installWeeklyBackup() now makes it daily too", /Daily backup scheduled/.test(gas.run("installWeeklyBackup()")) && spec().length === 1 && spec()[0].days === 1);
  // a backup every day for the last 25 days, and five from January; BACKUP_KEEP is 3 (weeks)
  const day = n => { const d = new Date(Date.now() - n * 864e5); return d.toISOString().slice(0, 10) + "T04:00"; };
  gas.run(`(${JSON.stringify(Array.from({ length: 25 }, (_, i) => day(i + 1)))}).concat(["2026-01-04T04:00", "2026-01-11T04:00", "2026-01-18T04:00", "2026-01-25T04:00", "2026-02-01T04:00"]).forEach(n => backupsFolder().createFolder(n))`);
  gas.run("backupNow()");
  const left = backupDirs();
  check("backups are kept for BACKUP_KEEP weeks (3): the last 21 days stay, older ones go", !left.some(n => n.startsWith("2026-01") || n === day(23)) && left.includes(day(20)) && new Set(left).size >= 20 && new Set(left).size <= 23, JSON.stringify(left));
  // the newest 7 always stay, however old
  gas.run("(() => { const it = backupsFolder().getFolders(); while (it.hasNext()) it.next().setTrashed(true); })()");
  gas.run(`["2025-01-01T04:00","2025-01-02T04:00","2025-01-03T04:00","2025-01-04T04:00","2025-01-05T04:00","2025-01-06T04:00","2025-01-07T04:00","2025-01-08T04:00"].forEach(n => backupsFolder().createFolder(n))`);
  gas.run("backupNow()");
  check("…but the newest 7 always stay, however old", backupDirs().length === 7, JSON.stringify(backupDirs()));
  // the daily check makes a backup when the newest is over a day old
  gas.run("(() => { const it = backupsFolder().getFolders(); while (it.hasNext()) it.next().setTrashed(true); })()");
  gas.run(`backupsFolder().createFolder(${JSON.stringify(day(3))})`);
  const lg = console.log; console.log = () => {}; gas.run("dailyReport()"); console.log = lg;
  const newest = backupDirs().slice(-1)[0];
  check("the daily check backs up when the newest backup is more than a day old", newest > day(1) && backupDirs().length === 2, JSON.stringify(backupDirs()));

  // ── a deleted wine is kept 30 days and can be put back (an encrypted cellar) ──
  await VAULT.call({ action: "add", wine: { producer: "Domaine Roulot", name: "Perrières", vintage: 2020, qty: 3, price: 900 } });
  let ws = (await VAULT.call({ action: "data" })).wines, rw = ws.find(x => x.producer === "Domaine Roulot");
  await VAULT.call({ action: "setvalue", row: rw.row, value: 1500 });
  await VAULT.call({ action: "setinfo", row: rw.row, fields: { location: "Reol A" } }).catch(() => {});
  const before = (await VAULT.call({ action: "data" })).wines.find(x => x.producer === "Domaine Roulot");
  await VAULT.call({ action: "delete", row: before.row });
  ws = (await VAULT.call({ action: "data" })).wines;
  check("deleting takes the wine out of the cellar", !ws.some(x => x.producer === "Domaine Roulot"));
  let del = (await VAULT.call({ action: "deleted" })).deleted;
  check("…and keeps it in Recently deleted", del.length === 1 && del[0].producer === "Domaine Roulot" && String(del[0].vintage) === "2020" && Number(del[0].qty) === 3, JSON.stringify(del));
  // a reload: the kept wine is part of the encrypted vault
  const relog = await open("bodil", "bodil-pass-12"); // the session here is bodil's
  del = (await VAULT.call({ action: "deleted" })).deleted;
  check("…kept in the encrypted vault (still there after a new login)", relog.ok && del.length === 1, JSON.stringify(del));
  check("…and stored encrypted, never in the clear", !JSON.stringify(gas.rt.books).includes("Perrières"));
  const r = await VAULT.call({ action: "undelete", id: del[0].id });
  const back = r.wines.find(x => x.producer === "Domaine Roulot");
  const same = k => String(back && back[k]) === String(before[k]);
  check("Restore puts it back exactly as it was: bottles, price, value, place", back && ["name", "vintage", "qty", "price", "value", "location", "region"].every(same) && r.deleted.length === 0,
    JSON.stringify({ back, before }));
  check("…and an unknown id is refused", await VAULT.call({ action: "undelete", id: "nope" }).then(() => false, e => /not-found/.test(e.message)));

  // ── a plain cellar (the owner's master sheet): the same, and after 30 days it's gone for good ──
  const g3 = H({ Ark1: [HEAD, ["Krug", "Frankrig", "Champagne", "", "Grande Cuvée", "", "Mousserende", "", "NV", 2, 1650, "", "", ""], ["Salon", "Frankrig", "Champagne", "", "Le Mesnil", "", "Mousserende", "", 2013, 1, 9000, "", "", ""]] });
  g3.call({ code: "test-code", action: "delete", row: 2 });
  check("a plain cellar keeps a deleted wine in its 'Slettet' tab", (g3.rows("Slettet") || []).length === 2 && g3.call({ code: "test-code", action: "deleted" }).deleted[0].producer === "Krug");
  g3.sheet("Slettet")._cells[1][0] = new Date(Date.now() - 31 * 864e5).toISOString(); // a month ago
  g3.call({ code: "test-code", action: "delete", row: 2 });
  const d3 = g3.call({ code: "test-code", action: "deleted" }).deleted;
  check("…and after 30 days it's gone for good (the newer one stays)", d3.length === 1 && d3[0].producer === "Salon", JSON.stringify(d3));
  const r3 = g3.call({ code: "test-code", action: "undelete", id: d3[0].id });
  check("…restore works there too", r3.ok && r3.wines.some(x => x.producer === "Salon" && Number(x.price) === 9000), JSON.stringify(r3).slice(0, 300));

  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
