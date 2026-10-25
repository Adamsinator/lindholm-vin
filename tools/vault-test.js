// End-to-end test of encrypted accounts, in Node: the real Code.gs as the server (gas-harness.js) and the real
// browser modules (vault-crypto.js, vault-engine.js, vault.js) as the client.
//   node tools/vault-test.js
"use strict";
const H = require("./gas-harness");
const VC = require("../vault-crypto.js");
const VAULT = require("../vault.js");
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];
const plainWine = ["Armand Rousseau", "Frankrig", "Bourgogne", "Gevrey-Chambertin", "Clos St-Jacques", "", "Rød", "Pinot Noir", 2016, 3, 4500, 0, "", "secret note"];

(async () => {
  const gas = H({ Ark1: [HEAD, plainWine], Journal: [["Dato", "Producent", "Vin", "Foto"], ["2025-12-24", "Armand Rousseau", "Clos St-Jacques", "phOLD"]] },
                { settings: { SIGNUP_CODE: "invite", OWNER_USER: "adam", OWNER_PASSWORD: "owner-pass-1" } });
  const post = async p => gas.call(p);
  const everything = () => JSON.stringify(Object.values(gas.rt.books).filter(b => !b.trashed).map(b => Object.values(b.sheets).map(s => s._cells)));

  // ── a friend signs up: nothing readable ever reaches the server ──
  const keys = await VAULT.newKeys("friend-pass");
  let r = await post({ action: "signup", user: "anna", code: "invite", ...keys.fields });
  check("signup with derived keys", r.ok && r.state === "done", JSON.stringify(r));
  check("signup refuses a plain password (old page)", (await post({ action: "signup", user: "bo", code: "invite", pass: "x123456" })).error === "update-site");
  await VAULT.start({ post, user: "anna", token: r.token, dek: keys.dek });
  r = await VAULT.call({ action: "add", wine: { producer: "Domaine Leflaive", name: "Les Pucelles", vintage: 2019, qty: 2, price: 1900, region: "Bourgogne", country: "Frankrig", note: "anna-private" } });
  check("add a wine in the vault", r.ok && r.wines.length === 1 && r.wines[0].producer === "Domaine Leflaive");
  r = await VAULT.call({ action: "drink", row: 2, qty: 1 });
  check("drink a bottle", r.wines[0].drunk === 1);
  r = await VAULT.call({ action: "jadd", entry: { date: "2026-10-20", producer: "Domaine Leflaive", wine: "Les Pucelles", rating: 9, note: "anna-tasting", photo: "data:image/jpeg;base64,QUJDREVGRw==" } });
  check("journal entry with a photo", r.ok && r.entries.length === 1 && !!r.entries[0].photo);
  const pic = await VAULT.call({ action: "photo", id: r.entries[0].photo });
  check("…photo comes back decrypted", pic.photo === "data:image/jpeg;base64,QUJDREVGRw==");
  const all = everything() + JSON.stringify(Object.values(gas.rt.files).map(f => Buffer.from(f.bytes.map(x => x & 255)).toString("utf8")));
  check("server holds no wine, note or photo in the clear", !/Leflaive|Pucelles|anna-private|anna-tasting|QUJDREVGRw/.test(all));
  check("…and no password", !/friend-pass/.test(all));
  check("server refuses plain private actions for this account", (await post({ action: "data", user: "anna", token: VAULT.user() && keys && (await post({ action: "login", user: "anna", auth: keys.fields.auth })).token })).error === "vaulted");

  // ── signing in again with the password: same cellar ──
  const pre = await post({ action: "prelogin", user: "anna" });
  const pk = await VC.fromPassword("friend-pass", pre.kdfSalt, pre.kdf);
  r = await post({ action: "login", user: "anna", auth: pk.auth });
  check("login with the derived key", r.ok && !!r.wrapKey);
  check("login refuses a plain password for an encrypted account", (await post({ action: "login", user: "anna", pass: "friend-pass" })).error === "bad-login");
  check("prelogin of an unknown name looks like a real account", (await post({ action: "prelogin", user: "nobody" })).kdfSalt.length > 10);
  let dek = await VC.unwrap(r.wrapKey, pk.kek, false);
  await VAULT.start({ post, user: "anna", token: r.token, dek });
  r = await VAULT.call({ action: "data" });
  check("…the cellar decrypts on a new session", r.wines.length === 1 && r.wines[0].qty - r.wines[0].drunk === 1, JSON.stringify(r.wines));

  // ── two devices: a stale write is refused and redone on fresh data ──
  const t2 = (await post({ action: "login", user: "anna", auth: pk.auth })).token;
  const VAULT2 = (() => { delete require.cache[require.resolve("../vault.js")]; return require("../vault.js"); })();
  await VAULT2.start({ post, user: "anna", token: t2, dek });
  await VAULT2.call({ action: "rate", row: 2, rating: 8 });
  r = await VAULT.call({ action: "setprice", row: 2, value: 2100 });
  check("second device's change isn't lost", r.wines[0].rating === 8 && r.wines[0].price === 2100, JSON.stringify(r.wines[0]));

  // ── forgotten password: the recovery code sets a new one ──
  const rs = await post({ action: "recoverstart", user: "anna" });
  const rk = await VC.fromRecovery(keys.recoveryCode.toLowerCase(), rs.recSalt);
  const dekX = await VC.unwrap(rs.wrapRec, rk.kek, true);
  const ns = VC.newSalt(), nk = await VC.fromPassword("new-pass", ns);
  r = await post({ action: "recover", user: "anna", recAuth: rk.auth, auth: nk.auth, kdfSalt: ns, wrapKey: await VC.wrap(dekX, nk.kek) });
  check("recovery code resets the password", r.ok);
  check("wrong recovery code is refused", (await post({ action: "recover", user: "anna", recAuth: (await VC.fromRecovery("AAAA-BBBB", rs.recSalt)).auth, auth: nk.auth, kdfSalt: ns, wrapKey: "x".repeat(40) })).error === "bad-recovery");
  const pre2 = await post({ action: "prelogin", user: "anna" });
  const pk2 = await VC.fromPassword("new-pass", pre2.kdfSalt);
  r = await post({ action: "login", user: "anna", auth: pk2.auth });
  dek = await VC.unwrap(r.wrapKey, pk2.kek, false);
  await VAULT.start({ post, user: "anna", token: r.token, dek });
  check("…and the same cellar opens with the new password", (await VAULT.call({ action: "data" })).wines[0].producer === "Domaine Leflaive");

  // ── account changes through vault.js ──
  const tok = (await VAULT.login({ post, user: "anna", pass: "new-pass" })).token;
  await VAULT.changePassword({ post, user: "anna", token: tok, oldPass: "new-pass", newPass: "third-pass" });
  let li = await VAULT.login({ post, user: "anna", pass: "third-pass" });
  check("password change keeps the cellar", !!li.dek && (await (async () => { await VAULT.start({ post, user: "anna", token: li.token, dek: li.dek }); return (await VAULT.call({ action: "data" })).wines.length === 1; })()));
  check("…the old password no longer works", await VAULT.login({ post, user: "anna", pass: "new-pass" }).then(() => false, e => e.message === "bad-login"));
  const code2 = await VAULT.newRecovery({ post, user: "anna", token: li.token, pass: "third-pass" });
  const rec = await VAULT.recover({ post, user: "anna", code: code2, newPass: "fourth-pass" });
  check("a new recovery code works", !!rec.dek);
  check("…and the first one doesn't any more", await VAULT.recover({ post, user: "anna", code: keys.recoveryCode, newPass: "x-pass-5" }).then(() => false, e => e.message === "bad-recovery"));

  // ── the owner's plain cellar migrates into a vault ──
  gas.run("makeOwner()");
  const pre3 = await post({ action: "prelogin", user: "adam" });
  check("old account answers legacy", pre3.legacy === true);
  r = await post({ action: "login", user: "adam", pass: "owner-pass-1" });
  check("old account logs in with its password once", r.ok && r.legacy === true);
  const ok3 = await VAULT.newKeys("owner-pass-1");
  const up = await post({ user: "adam", token: r.token, action: "upgrade", ...ok3.fields });
  check("upgrade stores the keys", up.ok && up.state === "migrating");
  check("while migrating, plain writes are refused", (await post({ user: "adam", token: r.token, action: "add", wine: { producer: "x" } })).error === "migrating");
  // the old journal photo: give the fake Drive a real file for it
  const fold = gas.rt.globals.DriveApp.getRootFolder().createFolder("Journalfotos");
  const f = fold.createFile({ b: [65, 66, 67], m: "image/jpeg", n: "old.jpg" });
  gas.sheet("Journal")._cells[1][3] = f.getId();
  const mig = await VAULT.migrate({ post, user: "adam", token: r.token, dek: ok3.dek });
  check("migration copies tabs and photos", mig.tabs.includes("Ark1") && mig.tabs.includes("Journal") && mig.photos === 1, JSON.stringify(mig));
  check("…the plain wine tab is cleared", gas.rows("Ark1").length === 0);
  check("…the plain journal tab is gone", gas.rows("Journal") === null);
  check("…the plain photo is in the trash", gas.rt.files[f.getId()].trashed === true);
  check("…shared tabs stay", !!gas.rows("Users") && gas.rows("Users").length >= 3);
  check("…the legacy access code stops working", (await post({ code: "test-code", action: "data" })).error === "vaulted");
  await VAULT.start({ post, user: "adam", token: r.token, dek: ok3.dek });
  r = await VAULT.call({ action: "data" });
  check("…and the owner's cellar opens from the vault", r.wines.length === 1 && r.wines[0].producer === "Armand Rousseau" && r.wines[0].note === "secret note");
  const j = await VAULT.call({ action: "journal" });
  const jp = await VAULT.call({ action: "photo", id: j.entries[0].photo });
  check("…with its journal photo, re-encrypted", jp.photo === "data:image/jpeg;base64,QUJD", jp.photo);
  check("…and the shared feed still works", (await VAULT.call({ action: "feed" })).ok);

  const n = results.filter(Boolean).length;
  console.log(`\n${n}/${results.length} passed`);
  process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
