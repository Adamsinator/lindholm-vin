// Tests of shared lists in apps-script/Code.gs (API 44), run against the real file in Node (gas-harness.js): a member
// stores a list (ciphertext only: the key is in the link, after the #, and never sent), anyone with the link's id gets
// it back until it expires or is withdrawn, no one else can list or withdraw it, a member keeps at most 20, and they
// go with the account.
//   node tools/share-test.js
"use strict";
const H = require("./gas-harness");
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];
const B64 = s => Buffer.from(String(s).padEnd(24, "x")).toString("base64");
const keys = (user, pass) => ({ kdf: "pbkdf2-sha256-600000", kdfSalt: B64("salt" + user), auth: B64("auth" + user + pass), wrapKey: B64("wrap" + user),
  wrapRec: B64("wraprec" + user), recSalt: B64("recsalt" + user), recAuth: B64("rec" + user) });
const DAY = 864e5;

const gas = H({ Ark1: [HEAD] }, { settings: { SIGNUP_CODE: "code", MAX_USERS: "10" } });
const mk = u => { const r = gas.call({ action: "signup", email: "x@example.com", user: u, code: "code", ...keys(u, "pw") }); return { user: u, token: r.token }; };
const anna = mk("anna"), bob = mk("bob");
const as = (who, p) => gas.call({ user: who.user, token: who.token, ...p });
const blob = "A".repeat(30) + "_-xyz" + "B".repeat(120000); // ciphertext, base64url; bigger than one cell

const put = as(anna, { action: "shareput", blob, days: 30, wines: 12 });
check("a member shares a list: an id of 128 random bits, and the expiry", put.ok && /^[0-9a-f]{32}$/.test(put.id) && Math.abs(put.expires - put.created - 30 * DAY) < 1000, JSON.stringify(put).slice(0, 160));
const got = gas.call({ action: "shareget", id: put.id });
check("anyone with the link's id gets the same ciphertext back, without a session (split over cells and joined)", got.ok && got.blob === blob && got.wines === 12, JSON.stringify({ ok: got.ok, len: (got.blob || "").length }));
check("the server keeps no title and nothing readable: only the id, owner, dates, count and ciphertext",
  JSON.stringify(gas.rows("Shares")[0]) === JSON.stringify(["Id", "Owner", "Created", "Expires", "Wines", "Data1", "Data2", "Data3", "Data4", "Data5", "Data6", "Data7", "Data8"]));
check("an unknown or malformed id is simply gone", gas.call({ action: "shareget", id: "0".repeat(32) }).error === "share-gone" && gas.call({ action: "shareget", id: "../x" }).error === "share-gone");
check("the owner sees it listed; someone else doesn't", as(anna, { action: "sharelist" }).shares.length === 1 && as(bob, { action: "sharelist" }).shares.length === 0);
as(bob, { action: "sharedel", id: put.id });
check("…and someone else can't withdraw it", gas.call({ action: "shareget", id: put.id }).ok);
check("not something that isn't base64url, too big, or for 0 or 400 days", ["shareput"].every(a =>
  /bad-share/.test(as(anna, { action: a, blob: "<script>", days: 30 }).error) && /share-too-big/.test(as(anna, { action: a, blob: "A".repeat(8 * 49000 + 1), days: 30 }).error)
  && /bad-share/.test(as(anna, { action: a, blob, days: 0 }).error) && /bad-share/.test(as(anna, { action: a, blob, days: 400 }).error)));
check("a session is needed to share", /bad-token|bad-code/.test(gas.call({ action: "shareput", blob, days: 30 }).error));
const del = as(anna, { action: "sharedel", id: put.id });
check("the owner withdraws it: the link stops working", del.ok && del.shares.length === 0 && gas.call({ action: "shareget", id: put.id }).error === "share-gone");
// expiry
const short = as(anna, { action: "shareput", blob: "C".repeat(40), days: 1, wines: 1 });
{ const cells = gas.sheet("Shares")._cells, row = cells.find(r => r[0] === short.id); row[3] = String(Date.now() - 1000); } // its day has passed
check("after its days it's gone, and the next share clears it out", gas.call({ action: "shareget", id: short.id }).error === "share-gone"
  && as(anna, { action: "shareput", blob: "D".repeat(40), days: 7 }).ok && !gas.rows("Shares").some(r => r[0] === short.id));
// at most 20 live
let last; for (let i = 0; i < 25; i++) last = as(bob, { action: "shareput", blob: "E".repeat(40), days: 7 });
check("at most 20 live shared lists a member", /too-many-shares/.test(last.error) && as(bob, { action: "sharelist" }).shares.length === 20, last.error);
// they go with the account
as(bob, { action: "deleteaccount", auth: keys("bob", "pw").auth });
check("deleting an account removes its shared lists", !gas.rows("Shares").some(r => r[1] === "bob"), JSON.stringify(gas.rows("Shares").map(r => r[1])));
const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
