// Tests of the usage numbers in apps-script/Code.gs (API 41), run against the real file in Node (gas-harness.js):
// the server's own counts (sign-ups, logins, members active a day, cellar saves, atlas visits), what a page may
// report (only page counts, at most 50 each a call), a row a day in the Stats tab, and the admin page's 30 days.
//   node tools/stats-test.js
"use strict";
const H = require("./gas-harness");
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];
const B64 = s => Buffer.from(String(s).padEnd(24, "x")).toString("base64");
const keys = user => ({ kdf: "pbkdf2-sha256-600000", kdfSalt: B64("salt" + user), auth: B64("auth" + user), wrapKey: B64("wrap" + user),
  wrapRec: B64("wraprec" + user), recSalt: B64("recsalt" + user), recAuth: B64("rec" + user) });

const gas = H({ Ark1: [HEAD] }, { settings: { SIGNUP_CODE: "invite" } });
const col = name => { const s = gas.rows("Stats"); if (!s) return null; const i = s[0].indexOf(name); return s.length > 1 ? Number(s[s.length - 1][i]) || 0 : 0; };

check("nothing counted, no Stats tab", gas.rows("Stats") === null);
const a = gas.call({ action: "signup", email: "a@example.dk", user: "anna", code: "invite", ...keys("anna") });
gas.call({ action: "signup", email: "bodil@example.dk", user: "bodil", code: "invite", ...keys("bodil") });
check("two sign-ups are counted", a.ok && col("Sign-ups") === 2, JSON.stringify(gas.rows("Stats")));
const l = gas.call({ action: "login", user: "anna", auth: keys("anna").auth });
gas.call({ action: "login", user: "anna", auth: "wrong-wrong-wrong-wrong=" });
check("a login is counted, a failed one isn't", l.ok && col("Logins") === 1, col("Logins"));
for (let i = 0; i < 3; i++) gas.call({ action: "vget", user: "anna", token: l.token });
gas.call({ action: "vget", user: "bodil", token: a.ok ? gas.run("findUser('bodil').token").split("@")[0] : "" });
check("members active today: each once, however often they come", col("Active members") === 2, col("Active members"));
gas.call({ action: "vput", user: "anna", token: l.token, key: "tab:Ark1", ver: 0, data: "v1.c2VjcmV0LWNpcGhlcnRleHQtLS0t" });
check("a cellar save is counted (and nothing of it is stored in Stats)", col("Cellar saves") === 1 && !JSON.stringify(gas.rows("Stats")).includes("c2VjcmV0"), col("Cellar saves"));
gas.call({ action: "atlas" }); gas.call({ action: "atlas" });
check("atlas visits are counted without a session", col("Atlas visits") === 2);
gas.call({ action: "hits", ev: { cellar: 3, sommelier: 2, enjoyed: "1" } });
check("a page's counts are added", col("Cellar page") === 3 && col("Sommelier questions") === 2 && col("Enjoyed page") === 1);
gas.call({ action: "hits", ev: { cellar: 10000, login: 500, signup: 9, active: 99, save: 7, atlas: 40, "<script>": 1, journal: -5, wishlist: "x" } });
check("…at most 50 of each a call", col("Cellar page") === 53, col("Cellar page"));
check("…and a page can't touch the server's own counts", col("Logins") === 1 && col("Sign-ups") === 2 && col("Active members") === 2 && col("Cellar saves") === 1 && col("Atlas visits") === 2);
check("…nor add columns of its own, or negative counts", !gas.rows("Stats")[0].some(h => /script/.test(h)) && col("Journal page") === 0 && col("Wishlist page") === 0);
check("one row for the day", gas.rows("Stats").length === 2 && gas.rows("Stats")[1][0] === "2026-10-16", JSON.stringify(gas.rows("Stats").map(r => r[0])));
check("a hit with nothing in it is fine", gas.call({ action: "hits" }).ok && gas.call({ action: "hits", ev: "nonsense" }).ok);

// the owner's view: 30 days, oldest first, today last
gas.run(`setUser(findUser('anna'), 'OldSheet', SpreadsheetApp.getActiveSpreadsheet().getId())`);
const ad = gas.call({ action: "admin", user: "anna", token: l.token });
check("the admin page gets the last 30 days", ad.ok && ad.stats.length === 30 && ad.stats[29].day === "2026-10-16" && ad.stats[29].cellar === 53 && ad.stats[0].cellar === 0, JSON.stringify(ad.stats && ad.stats.slice(-2)));
check("…and a member doesn't", gas.call({ action: "admin", user: "bodil", token: gas.run("findUser('bodil').token").split("@")[0] }).error === "not-owner");

// across the end of summer time (25 October 2026 in Copenhagen) every calendar day appears once
{
  const days = gas.run(`(() => { const d = readStats(60).map(x => x.day); return { n: d.length, uniq: new Set(d).size, first: d[0], last: d[59] }; })()`);
  check("60 days back across a summer-time change: each day once, none skipped", days.n === 60 && days.uniq === 60 && days.first === "2026-08-18" && days.last === "2026-10-16", JSON.stringify(days));
}
const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
