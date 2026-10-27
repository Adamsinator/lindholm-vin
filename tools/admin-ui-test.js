// Browser test of the owner's admin page, against the real Code.gs (gas-harness.js):
//   • only the owner gets the Admin button; another member doesn't
//   • it lists the members with email, signed up and last seen, and nothing from a cellar
//   • it makes invite codes with a note, copies a ready invitation, and withdraws a code
//   (cd .. && python3 -m http.server 8765) & node tools/admin-ui-test.js
"use strict";
const { chromium } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];

(async () => {
  const b = await chromium.launch();
  const gas = H({ Ark1: [HEAD] }, { settings: { SIGNUP_CODE: "invite" } });
  const device = async () => {
    const ctx = await b.newContext({ viewport: { width: 1200, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
    await require("./turnstile-fake")(ctx);
    await ctx.route(require("./api-route"), async route => { const q = JSON.parse(route.request().postData() || "{}");
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(gas.call(q)) }); });
    const p = await ctx.newPage(), errs = [];
    p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
    return { p, errs };
  };
  const signUp = async (p, user) => {
    await p.goto(BASE); await p.waitForTimeout(400); await p.click("#gateToggle");
    await p.fill("#gateUser", user); await p.fill("#gateEmail", user + "@example.dk"); await p.fill("#gatePass", user + "-secret-1"); await p.fill("#gatePass2", user + "-secret-1");
    await p.fill("#gateInvite", "invite"); await p.click("#gateSubmit");
    await p.waitForSelector("#recModal.open", { timeout: 20000 }); await p.check("#recOk"); await p.click("#recDone");
    await p.waitForSelector("#app:not([hidden])", { timeout: 20000 }); await p.waitForTimeout(600);
  };

  const A = await device(), p = A.p;
  await signUp(p, "ole");
  check("an ordinary member has no Admin button", await p.isHidden("#adminBtn"));
  gas.run(`setUser(findUser('ole'), 'OldSheet', SpreadsheetApp.getActiveSpreadsheet().getId())`); // ole is the owner
  const B = await device(); await signUp(B.p, "pia");
  await p.reload(); await p.waitForSelector("#app:not([hidden])", { timeout: 20000 }); await p.waitForTimeout(800);
  check("the owner has one", await p.isVisible("#adminBtn"));
  check("…and pia still doesn't", await B.p.isHidden("#adminBtn"));

  await p.click("#adminBtn"); await p.waitForFunction(() => document.querySelectorAll("#adminUsers li").length >= 2, null, { timeout: 10000 });
  const rows = await p.$$eval("#adminUsers li", rs => rs.map(r => r.textContent.replace(/\s+/g, " ").trim()));
  check("it lists the members with email, signed up and last seen", rows.some(r => /^pia · pia@example\.dk Signed up \d{4}-\d{2}-\d{2} · Last seen \d{4}-\d{2}-\d{2}$/.test(r)) && rows.some(r => /^ole · ole@example\.dk/.test(r)), rows.join(" | "));
  check("…and says how many there are of the most", /2 of at most 50/.test(await p.textContent("#adminCount")), await p.textContent("#adminCount"));

  await p.selectOption("#adminN", "2"); await p.fill("#adminNote", "Peter and Anne"); await p.click('#adminNew button[type="submit"]');
  await p.waitForFunction(() => document.querySelectorAll("#adminInvites .code").length >= 2, null, { timeout: 10000 });
  const codes = await p.$$eval("#adminInvites li:not(.used) .code", t => t.map(x => x.textContent));
  check("it makes invite codes, with the note", codes.length === 2 && /Peter and Anne/.test(await p.textContent("#adminInvites")), codes.join());
  await p.click(`#adminInvites button[data-copy="${codes[0]}"]`); await p.waitForTimeout(200);
  const clip = await p.evaluate(() => navigator.clipboard.readText());
  check("'Copy invitation' copies the link and the code", clip.includes(codes[0]) && /localhost:8765/.test(clip) && /works once/.test(clip), clip);
  p.once("dialog", d => d.accept());
  await p.click(`#adminInvites button[data-revoke="${codes[1]}"]`);
  await p.waitForFunction(c => [...document.querySelectorAll("#adminInvites li.used")].some(r => r.textContent.includes(c) && /withdrawn/.test(r.textContent)), codes[1], { timeout: 10000 });
  check("'Withdraw' marks the code as withdrawn", true);
  check("nothing from a cellar is on the page", !/Krug|Ark1|wrapKey/.test(await p.textContent("#adminModal")));

  check("no console errors", !A.errs.length && !B.errs.length, A.errs.concat(B.errs).join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
