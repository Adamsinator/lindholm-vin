// Tests of the backups in apps-script/Code.gs, in Node: the real Code.gs as the server (gas-harness.js) and the real
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
                { settings: { SIGNUP_CODE: "invite", BACKUP_KEEP: "3" } });
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
  const msg = gas.run("backupNow()");
  check("backupNow() copies the master sheet and both vaults", /the master sheet and 2 account/.test(msg), msg);
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

  // ── a schedule, and only the newest backups are kept ──
  const sched = gas.run("installWeeklyBackup()");
  check("installWeeklyBackup() schedules backupNow weekly (and backs up now)", /Weekly backup scheduled/.test(sched) && gas.run("ScriptApp.getProjectTriggers().length") === 1, sched);
  gas.run("installWeeklyBackup()");
  check("…running it again doesn't add a second schedule", gas.run("ScriptApp.getProjectTriggers().length") === 1);
  // five older backups, a week apart; the next backup keeps only the newest BACKUP_KEEP (3), its own included
  gas.run(`["2026-01-04T04:00", "2026-01-11T04:00", "2026-01-18T04:00", "2026-01-25T04:00", "2026-02-01T04:00"].forEach(n => backupsFolder().createFolder(n))`);
  gas.run("backupNow()");
  const left = backupDirs();
  check("only the newest BACKUP_KEEP (3) backups are kept", left.length === 3 && !left.some(n => n.startsWith("2026-01")), JSON.stringify(left));

  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
