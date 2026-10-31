// Tests of the limits against abuse in apps-script/Code.gs (API 34), run against the real file in Node
// (gas-harness.js), with the script cache's clock moved forward where a limit should lift:
// personal single-use invites, the account cap and the sign-up rate; locking a username after wrong passwords or
// recovery codes; sessions that lapse after SESSION_DAYS; and size and rate limits on what accounts can store.
//   node tools/abuse-test.js
"use strict";
const H = require("./gas-harness");
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];
const B64 = s => Buffer.from(String(s).padEnd(24, "x")).toString("base64");
// what the site sends for a new encrypted account (only the shapes matter to the server)
const keys = (user, pass) => ({ kdf: "pbkdf2-sha256-600000", kdfSalt: B64("salt" + user), auth: B64("auth" + user + pass), wrapKey: B64("wrap" + user),
  wrapRec: B64("wraprec" + user), recSalt: B64("recsalt" + user), recAuth: B64("rec" + user) });
const signup = (gas, user, code, pass = "pw") => gas.call({ action: "signup", email: "someone@example.com", user, code, ...keys(user, pass) });
const login = (gas, user, pass = "pw") => gas.call({ action: "login", user, auth: keys(user, pass).auth });
const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;

// ── invites ──
{
  const gas = H({ Ark1: [HEAD] }, { settings: { SOCIAL: "on", SIGNUP_CODE: "" } });
  check("no shared code and no invites: sign-up is off", signup(gas, "anna", "whatever").error === "signup-disabled");
  const made = gas.run("makeInvites()"), codes = made.match(/AW-[A-Z2-9]{4}-[A-Z2-9]{4}/g) || [];
  check("makeInvites() makes five codes in an Invites tab", codes.length === 5 && gas.rows("Invites").length === 6, made);
  check("a wrong code is refused", signup(gas, "anna", "AW-XXXX-XXXX").error === "bad-invite");
  const r = signup(gas, "anna", codes[0].toLowerCase().replace(/-/g, " "));
  check("an invite works however it's typed (case, spaces)", r.ok, JSON.stringify(r));
  check("…and records who used it", gas.rows("Invites")[1][3] === "anna");
  check("…once: the same code can't make a second account", signup(gas, "bob", codes[0]).error === "bad-invite");
  check("the other codes still work", signup(gas, "bob", codes[1]).ok);
}
{
  const gas = H({ Ark1: [HEAD] }, { settings: { SOCIAL: "on", SIGNUP_CODE: "shared-code", MAX_USERS: "3" } });
  check("the shared SIGNUP_CODE still works", signup(gas, "user1", "shared-code").ok && signup(gas, "user2", "shared-code").ok);
  check("…up to MAX_USERS accounts", signup(gas, "user3", "shared-code").ok && signup(gas, "user4", "shared-code").error === "signup-full");
}
{
  const gas = H({ Ark1: [HEAD] }, { settings: { SOCIAL: "on", SIGNUP_CODE: "shared-code", MAX_USERS: "100" } });
  const ok = [1, 2, 3, 4, 5].map(i => signup(gas, "sign" + i, "shared-code").ok);
  check("five sign-ups in an hour go through", ok.every(Boolean));
  check("…the sixth waits", signup(gas, "sign6", "shared-code").error === "signup-busy");
  gas.advance(HOUR + MIN);
  check("…and goes through an hour later", signup(gas, "sign6", "shared-code").ok);
  for (let i = 0; i < 20; i++) signup(gas, "guess" + i, "guess-" + i);
  check("20 wrong codes pause sign-up for everyone, right code too", signup(gas, "sign7", "shared-code").error === "signup-busy");
  gas.advance(HOUR + MIN);
  check("…for an hour", signup(gas, "sign7", "shared-code").ok);
}

// ── guessing passwords ──
{
  const gas = H({ Ark1: [HEAD] }, { settings: { SOCIAL: "on", SIGNUP_CODE: "c" } });
  signup(gas, "vera", "c", "right");
  check("the right password logs in", login(gas, "vera", "right").ok);
  for (let i = 0; i < 4; i++) login(gas, "vera", "wrong" + i);
  check("four wrong tries, then the right one: in, and the count resets", login(gas, "vera", "right").ok);
  for (let i = 0; i < 4; i++) login(gas, "vera", "wrong" + i);
  check("…so four more wrong ones don't lock it", login(gas, "vera", "right").ok);
  for (let i = 0; i < 5; i++) login(gas, "vera", "wrong" + i);
  check("five wrong tries lock the username, even with the right password", login(gas, "vera", "right").error === "locked");
  gas.advance(10 * MIN);
  check("…still locked after 10 minutes", login(gas, "vera", "right").error === "locked");
  gas.advance(6 * MIN);
  check("…open again after 15", login(gas, "vera", "right").ok);
  for (let i = 0; i < 5; i++) login(gas, "nobody", "x" + i);
  check("an unknown username locks the same way (nothing to learn from the answer)", login(gas, "nobody", "x").error === "locked");
  for (let i = 0; i < 5; i++) gas.call({ action: "recover", user: "vera", recAuth: B64("guess" + i), auth: B64("a"), wrapKey: B64("w"), kdfSalt: B64("k") });
  check("guessing recovery codes locks too", gas.call({ action: "recover", user: "vera", recAuth: keys("vera").recAuth, auth: B64("a"), wrapKey: B64("w"), kdfSalt: B64("k") }).error === "locked");
}

// ── sessions ──
{
  const gas = H({ Ark1: [HEAD] }, { settings: { SOCIAL: "on", SIGNUP_CODE: "c", SESSION_DAYS: "30" } });
  const s = signup(gas, "tom", "c");
  const cell = () => String(gas.rows("Users")[1][4]);
  check("a session is stored with its time", new RegExp("^" + s.token + "@\\d{13}$").test(cell()), cell());
  const feed = tok => gas.call({ action: "feed", user: "tom", token: tok });
  check("…and works", feed(s.token).ok);
  const users = gas.sheet("Users");
  users.getRange(2, 5).setValue(s.token);
  check("a session from before API 34 (no time) still works", feed(s.token).ok);
  check("…and is stamped on its first use", /@\d{13}$/.test(cell()), cell());
  users.getRange(2, 5).setValue(s.token + "@" + (Date.now() - 31 * DAY));
  check("a session unused for 31 days has lapsed", feed(s.token).error === "bad-token");
  check("…and is removed", !cell().includes(s.token), cell());
  const l = login(gas, "tom");
  users.getRange(2, 5).setValue(l.token + "@" + (Date.now() - 2 * DAY));
  check("one used two days ago works", feed(l.token).ok);
  check("…and its time moves to now", Math.abs(Number(cell().split("@")[1]) - Date.now()) < 60000, cell());
}

// ── what an account can store ──
{
  const gas = H({ Ark1: [HEAD] }, { settings: { SOCIAL: "on", SIGNUP_CODE: "c" } });
  const a = signup(gas, "amy", "c"), b = signup(gas, "ben", "c");
  const as = p => gas.call({ user: "amy", token: a.token, ...p });
  const r = as({ action: "feedpost", entry: { producer: "x".repeat(500), note: "n".repeat(5000), type: "drank", rating: 99 } });
  const post = r.feed && r.feed[0];
  check("feed text is cut to size", post && post.producer.length === 120 && post.note.length === 2000 && Number(post.rating) === 10, JSON.stringify(post).slice(0, 200));
  let n = 1; while (n < 30 && as({ action: "feedpost", entry: { note: "hi " + n } }).ok) n++;
  check("30 posts in six hours go through", n === 30, String(n));
  check("…the 31st waits", /too-many/.test(as({ action: "feedpost", entry: { note: "one more" } }).error || ""));
  gas.advance(6 * HOUR + MIN);
  check("…until six hours later", as({ action: "feedpost", entry: { note: "later" } }).ok);
  const id = as({ action: "feed" }).feed[0].id;
  as({ action: "feedcomment", id, text: "c".repeat(900) });
  check("a comment is cut to 500 characters", (as({ action: "feed" }).feed[0].comments || [])[0].text.length === 500);
  check("following someone who doesn't exist is refused", /Bad target/.test(as({ action: "follow", target: "ghost" }).error || ""));
  const f = as({ action: "follow", target: "ben" });
  check("following a real account works (it sends the target as 'target', not 'user')", f.ok && f.follows.includes("ben"), JSON.stringify(f));
  check("a photo over 5 MB is refused", /too-big/.test(as({ action: "feedpost", entry: { note: "pic", photo: "data:image/jpeg;base64," + "A".repeat(5000004) } }).error || ""));
  check("an encrypted photo over 5 MB is refused", /too-big/.test(as({ action: "vphotoput", data: "v1." + "A".repeat(5000000) }).error || ""));
  const put = (key, ver) => as({ action: "vput", key, ver, data: "v1.QUJD" });
  let k = 0; while (k < 16 && put("tab:T" + k, 0).ok) k++;
  check("an encrypted cellar holds 16 records", k === 16, String(k));
  check("…not a 17th", /too-big/.test(put("tab:T16", 0).error || ""));
  check("…but its records can still be rewritten", put("tab:T3", 1).ok);
}
{
  // a request bigger than 12 MB never reaches the code
  const gas = H({ Ark1: [HEAD] }, { settings: { SOCIAL: "on", SIGNUP_CODE: "c" } });
  const out = JSON.parse(gas.run(`doPost({ postData: { contents: "x".repeat(12000001) } }).getContent()`));
  check("a request over 12 MB is refused before it's read", out.error === "too-big", JSON.stringify(out));
}

// ── sign-up asks for an email, for the owner only ──
{
  const gas = H({ Ark1: [HEAD] }, { settings: { SIGNUP_CODE: "c" } });
  const noMail = gas.call({ action: "signup", user: "olga", code: "c", ...keys("olga", "pw") });
  check("a sign-up without an email (an old page) is asked to reload", noMail.error === "update-site", JSON.stringify(noMail));
  const badMail = gas.call({ action: "signup", user: "olga", code: "c", email: "not-an-email", ...keys("olga", "pw") });
  check("…a wrong email is refused", badMail.error === "bad-email", JSON.stringify(badMail));
  const ok = gas.call({ action: "signup", user: "olga", code: "c", email: "olga@example.dk", ...keys("olga", "pw") });
  const users = gas.rows("Users"), col = users[0].indexOf("Email");
  check("…a good one is kept in the Users tab", ok.ok && col >= 0 && users.some(r => r[0] === "olga" && r[col] === "olga@example.dk"), JSON.stringify(users[0]));
  const t = login(gas, "olga").token, seen = ["data", "status", "prelogin"].map(a => JSON.stringify(gas.call({ user: "olga", token: t, action: a })));
  check("…and no answer sends it back", seen.every(x => !/olga@example/.test(x)), seen.find(x => /olga@example/.test(x)) || "");
}

// ── the owner's admin page: members and invite codes, for the owner only ──
{
  const gas = H({ Ark1: [HEAD] }, { settings: { SIGNUP_CODE: "c" } });
  gas.call({ action: "signup", user: "ole", code: "c", email: "ole@example.dk", ...keys("ole", "pw") });
  gas.call({ action: "signup", user: "pia", code: "c", email: "pia@example.dk", ...keys("pia", "pw") });
  gas.run(`setUser(findUser('ole'), 'OldSheet', SpreadsheetApp.getActiveSpreadsheet().getId())`); // ole's cellar was the master sheet: the owner
  const ole = login(gas, "ole").token, pia = login(gas, "pia").token;
  const asOle = p => gas.call({ user: "ole", token: ole, ...p }), asPia = p => gas.call({ user: "pia", token: pia, ...p });
  check("'me' tells the owner apart", asOle({ action: "me" }).owner === true && asPia({ action: "me" }).owner === false);
  const pa = ["admin", "admininvites", "adminrevoke"].map(a => asPia({ action: a, n: 3, code: "x" }));
  check("…and nobody else gets the admin page or its actions", pa.every(r => r.error === "not-owner"), JSON.stringify(pa));
  const v = asOle({ action: "admin" }), ub = Object.fromEntries(v.users.map(u => [u.user, u]));
  check("the admin page lists the members with email, sign-up date and last seen", v.ok && ub.pia && ub.pia.email === "pia@example.dk" && /^\d{4}-\d{2}-\d{2}$/.test(ub.pia.created) && /^\d{4}-\d{2}-\d{2}$/.test(ub.pia.lastSeen), JSON.stringify(v.users));
  check("…and nothing from a cellar", !/"(wines|tabs|records|wrapKey|salt|hash|token)"/i.test(JSON.stringify(v)), Object.keys(ub.pia).join());
  const made = asOle({ action: "admininvites", n: 3, note: "Peter and Anne" }), codes = made.invites.filter(i => !i.usedBy);
  check("it makes invite codes with a note", codes.length === 3 && codes.every(i => /^AW-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(i.code) && i.note === "Peter and Anne"), JSON.stringify(made.invites));
  check("…at most 10 at a time", asOle({ action: "admininvites", n: 500 }).invites.length === 13);
  const rv = asOle({ action: "adminrevoke", code: codes[0].code }), gone = rv.invites.find(i => i.code === codes[0].code);
  check("a withdrawn code is marked, and no longer signs anyone up", gone.usedBy === "(revoked)" &&
    gas.call({ action: "signup", user: "quinn", code: codes[0].code, email: "q@example.dk", ...keys("quinn", "pw") }).ok !== true && !!gas.call({ action: "signup", user: "quinn", code: codes[1].code, email: "q@example.dk", ...keys("quinn", "pw") }).ok);
  const used = asOle({ action: "admin" }).invites.find(i => i.code === codes[1].code);
  check("…a used code says who used it", used.usedBy === "quinn", JSON.stringify(used));
}

// ── private by default: no feed, no follows, and nobody learns who else has an account ──
{
  const gas = H({ Ark1: [HEAD] }, { settings: { SIGNUP_CODE: "c" } });
  signup(gas, "anna", "c"); signup(gas, "bodil", "c");
  const t = login(gas, "anna").token, as = p => gas.call({ user: "anna", token: t, ...p });
  const off = ["feed", "feedpost", "feeddelete", "feedcheer", "feedcomment", "follow", "unfollow"].map(a => [a, as({ action: a, entry: { type: "drank", producer: "X" }, target: "bodil", id: "x", row: 2 })]);
  check("with SOCIAL off, every feed and follow action is refused", off.every(([, r]) => r.ok === false && r.error === "social-off"), JSON.stringify(off.filter(([, r]) => r.error !== "social-off")));
  const seen = ["data", "journal", "wish", "deleted", "status"].map(a => JSON.stringify(as({ action: a })));
  check("…and no answer anna gets names bodil", seen.every(x => !/bodil/.test(x)), seen.find(x => /bodil/.test(x)) || "");
  const on = H({ Ark1: [HEAD] }, { settings: { SIGNUP_CODE: "c", SOCIAL: "on" } });
  signup(on, "anna", "c"); const t2 = login(on, "anna").token;
  const f = on.call({ user: "anna", token: t2, action: "feed" });
  check("with SOCIAL 'on' the feed answers, and says so", f.ok && f.social === true, JSON.stringify(f).slice(0, 120));
}

// error reports from visitors' browsers (API 44): logged without a session, cleaned of addresses, emails and long numbers
{
  const gas = H({ Ark1: [HEAD] }, { settings: { SIGNUP_CODE: "x" } });
  const r = gas.call({ action: "clienterr", page: "cellar", src: "https://allwine.dk/app.js?v=60#x", line: 1234,
    msg: "Cannot read 'x' of undefined at https://evil.example/a?b=1 for anna@example.com, card 4111111111111111" });
  const r2 = gas.call({ action: "clienterr", page: "<script>", src: "../../etc/passwd", line: -5, msg: "boom" });
  const log = gas.rows("Log").filter(row => row[1] === "client-error").map(row => String(row[3]));
  check("an error report is logged without a session, as 'client-error'", r.ok && r2.ok && log.length === 2, JSON.stringify(log));
  check("…with the page, the file name and line, and the message cleaned of addresses, emails and long numbers",
    log[0] === "cellar app.js:1234 Cannot read 'x' of undefined at <url> for <email> card #", log[0]);
  check("…and an unknown page or a path in the file name made harmless", log[1] === "other passwd:0 boom", log[1]);
}

const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
