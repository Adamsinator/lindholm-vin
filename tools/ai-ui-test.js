// Browser test of the AI helper in a wine's details, on an encrypted account, against the real Code.gs with the
// Anthropic API stubbed: the consent note, the answer with its sources, "Use as my drink window", "don't ask again",
// and that only the wine's identity leaves the browser.
//   (cd .. && python3 -m http.server 8765) & node tools/ai-ui-test.js
"use strict";
const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const J = x => JSON.stringify(x);
let anthropicBodies = [];
const answer = (from, to) => ({ code: 200, body: J({ stop_reason: "tool_use", usage: { input_tokens: 9000, output_tokens: 600, server_tool_use: { web_search_requests: 2 } }, content: [
  { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "q" } },
  { type: "web_search_tool_result", tool_use_id: "s1", content: [{ type: "web_search_result", url: "https://www.vinous.com/wines/roulot-perrieres-2020", title: "Vinous" }] },
  { type: "tool_use", id: "t1", name: "report", input: { found: true, drinkFrom: from, drinkTo: to, windowBasis: "Vinous gives 2027–2040.", summary: "Tense and saline; give it time.",
    confidence: "medium", reviews: [
      { critic: "Vinous", score: "95", vintage: "2020", note: "Chiselled.", url: "https://www.vinous.com/wines/roulot-perrieres-2020" },
      { critic: "Nobody", score: "100", vintage: "2020", note: "Made up.", url: "https://made-up.example/x" }] } }] }) });
const queue = [];
const gas = H({ Ark1: [["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"]] },
  { settings: { SIGNUP_CODE: "invite" }, properties: { ANTHROPIC_API_KEY: "sk-test" },
    fetch: (url, params) => { anthropicBodies.push(params.payload); return queue.shift(); } });
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const seen = [];
  await ctx.route("https://script.google.com/**", async route => {
    const p = JSON.parse(route.request().postData() || "{}"); seen.push(p);
    await route.fulfill({ contentType: "application/json", body: J(gas.call(p)) });
  });
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  p.on("dialog", d => d.accept());
  await p.goto(BASE); await p.waitForTimeout(400);
  await p.click("#gateToggle");
  await p.fill("#gateUser", "dora"); await p.fill("#gatePass", "dora-pass-1"); await p.fill("#gateInvite", "invite");
  await p.click("#gateSubmit");
  await p.waitForSelector("#recModal.open", { timeout: 20000 }); await p.check("#recOk"); await p.click("#recDone");
  await p.waitForSelector("#app:not([hidden])", { timeout: 20000 });
  for (const [prod, name] of [["Domaine Roulot", "Meursault Perrières"], ["Coche-Dury", "Meursault"]]) {
    await p.click("#addBtn"); await p.fill("#aProducer", prod); await p.fill("#aName", name); await p.fill("#aVintage", "2020");
    await p.fill("#aPrice", "1234"); await p.fill("#aNote", "private-note-xyz");
    await p.click('#addForm button[type="submit"]'); await p.waitForTimeout(900);
  }
  const open = async prod => { await p.click(`#tbl tr.main:has-text("${prod}")`); await p.waitForTimeout(200); };
  await open("Domaine Roulot");
  const ask = p.locator('#tbl button.aiask:visible').first();
  check("the ✨ button shows when the site has a key", await ask.count() === 1);
  await ask.click();
  check("the first click explains what is sent", /nothing else from your cellar/.test(await p.textContent("#tbl .aicard")) && /10 of 10 lookups/.test(await p.textContent("#tbl .aicard")));
  check("…and nothing has been sent yet", anthropicBodies.length === 0);
  queue.push(answer(2027, 2040));
  await p.check("#tbl .aicard .airemember");
  await p.click('#tbl .aicard button[data-ai="go"]');
  await p.waitForSelector("#tbl .aicard .airev", { timeout: 15000 });
  const card = await p.textContent("#tbl .aicard");
  check("the answer shows the window, the summary and the reviews", /Drink window 2027–2040/.test(card) && card.includes("Tense and saline") && card.includes("Vinous · 95"), card);
  check("…a review with an invented source isn't shown", !card.includes("Made up") && (await p.$$eval("#tbl .aicard .airev a", as => as.map(a => a.href))).join() === "https://www.vinous.com/wines/roulot-perrieres-2020");
  check("only the wine's identity reached Anthropic", anthropicBodies.length === 1 && anthropicBodies[0].includes("Meursault Perri") && !/1234|private-note-xyz/.test(anthropicBodies[0]));
  const aiCall = seen.find(x => x.action === "ai");
  check("…and the server", !/1234|private-note-xyz/.test(J(aiCall)) && !("price" in aiCall.wine));
  await p.click('#tbl .aicard button[data-ai="use"]'); await p.waitForTimeout(1200);
  const w = await p.evaluate(() => VAULT.call({ action: "data" }).then(r => r.wines.find(x => x.producer === "Domaine Roulot")));
  check("'Use as my drink window' saves it in the cellar", w.drinkFrom === 2027 && w.drinkTo === 2040, J(w));
  check("…and the card says so", /saved as your window/.test(await p.textContent("#tbl .aicard")));

  // "don't ask again": the next wine goes straight to the search
  queue.push(answer(2030, 2050));
  await open("Coche-Dury");
  await p.locator('#tbl button.aiask:visible').last().click();
  await p.waitForFunction(() => [...document.querySelectorAll("#tbl .aicard")].some(c => /2030–2050/.test(c.textContent)), null, { timeout: 15000 });
  check("'Don't ask me again' skips the note next time", anthropicBodies.length === 2);
  // the daily count is shown and enforced from the server's numbers
  check("the lookups left follow the server", await p.evaluate(() => AI.left) === 8);
  check("no console errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
