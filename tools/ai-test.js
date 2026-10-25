// Tests of the AI helper in Code.gs (the 'ai' and 'aistatus' actions), in Node, with the Anthropic API stubbed: what is
// sent (only the wine's identity, the model, web search, the strict report tool, fallbacks), a paused turn resumed,
// addresses the search never returned dropped, the daily limit and monthly budget, and the error paths.
//   node tools/ai-test.js
"use strict";
const H = require("./gas-harness");
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const J = x => JSON.stringify(x);
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];
const WINE = { producer: "Armand Rousseau", name: "Clos St-Jacques", vintage: 2016, commune: "Gevrey-Chambertin", region: "Bourgogne", country: "Frankrig",
  classification: "1. cru", type: "Rød", size: "", price: 4500, note: "my secret note", rating: 9 };

// a stubbed Messages API: answers are queued per test
let queue = [], sent = [];
const fetch = (url, params) => { sent.push({ url, params, body: JSON.parse(params.payload) }); const r = queue.shift(); return r || { code: 500, body: "{}" }; };
const ok = body => ({ code: 200, body: J(body) });
const usage = (i, o, s) => ({ input_tokens: i, output_tokens: o, server_tool_use: { web_search_requests: s } });
const searchBlocks = [
  { type: "server_tool_use", id: "srv_1", name: "web_search", input: { query: "Rousseau Clos St-Jacques 2016" } },
  { type: "web_search_tool_result", tool_use_id: "srv_1", content: [
    { type: "web_search_result", url: "https://www.jancisrobinson.com/tastings/rousseau-csj-2016", title: "Rousseau CSJ 2016" },
    { type: "web_search_result", url: "https://www.burghound.com/rousseau-2016/", title: "Burghound" }] },
];
const report = { found: true, drinkFrom: 2028, drinkTo: 2045, windowBasis: "Jancis Robinson's window.", summary: "Superb, still young.",
  confidence: "high", reviews: [
    { critic: "Jancis Robinson", score: "18.5/20", vintage: "2016", note: "Deep and long.", url: "https://www.jancisrobinson.com/tastings/rousseau-csj-2016" },
    { critic: "Burghound", score: "96", vintage: "2016", note: "Grand cru quality.", url: "https://www.burghound.com/rousseau-2016" },
    { critic: "Made-up Weekly", score: "99", vintage: "2016", note: "Invented.", url: "https://invented.example/review" },
    { critic: "Domaine newsletter", score: "", vintage: "2016", note: "No address given.", url: "" }] };

(async () => {
  const gas = H({ Ark1: [HEAD] }, { fetch, settings: { AI_DAILY_LIMIT: 2, AI_MONTHLY_USD: 5 } });
  const call = p => gas.call({ code: "test-code", ...p });
  check("off until a key is in the script properties", call({ action: "ai", wine: WINE }).error === "ai-off" && call({ action: "aistatus" }).ai.on === false);
  gas.rt.props.ANTHROPIC_API_KEY = "sk-test-key";
  check("aistatus reports the lookups left", J(call({ action: "aistatus" }).ai) === J({ on: true, left: 2, limit: 2 }));

  // a turn that pauses after searching, then reports
  queue = [ok({ stop_reason: "pause_turn", content: [{ type: "thinking", thinking: "", signature: "sig" }, ...searchBlocks], usage: usage(20000, 400, 1) }),
           ok({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "tu_1", name: "report", input: report }], usage: usage(30000, 900, 0) })];
  sent = [];
  let r = call({ action: "ai", lang: "da", wine: WINE });
  check("a lookup answers", r.ok && r.result.drinkFrom === 2028 && r.result.drinkTo === 2045, J(r));
  const b0 = sent[0].body, h0 = sent[0].params.headers;
  check("…to the Messages API with the key and API version", sent[0].url === "https://api.anthropic.com/v1/messages" && h0["x-api-key"] === "sk-test-key" && h0["anthropic-version"] === "2026-10-21");
  check("…on Claude Opus 5.5, with refusal fallbacks", b0.model === "claude-opus-5-5" && b0.fallbacks === "default" && h0["anthropic-beta"] === "server-side-fallback-2026-07-01");
  check("…with web search and a strict report tool", b0.tools[0].type === "web_search_20260209" && b0.tools[0].max_uses === 5 && b0.tools[1].name === "report" && b0.tools[1].strict === true && b0.tool_choice.type === "auto");
  check("…no thinking switch or sampling parameters (Opus 5.5 rejects them)", !("thinking" in b0) && !("temperature" in b0) && b0.output_config.effort === "medium");
  const msg = b0.messages[0].content;
  check("…only the wine's identity is sent", msg.includes("Armand Rousseau") && msg.includes("Clos St-Jacques") && !/4500|secret|rating/.test(J(sent.map(x => x.body))), msg);
  check("…in the reader's language", /Danish/.test(b0.system));
  check("the paused turn is sent back as it came", J(sent[1].body.messages[1]) === J({ role: "assistant", content: [{ type: "thinking", thinking: "", signature: "sig" }, ...searchBlocks] }) && sent[1].body.messages.length === 2);
  check("a review citing an address the search never returned is dropped", J(r.result.reviews.map(x => x.critic)) === J(["Jancis Robinson", "Burghound", "Domaine newsletter"]), J(r.result.reviews));
  check("…and addresses match without the trailing slash, linking the page as found", r.result.reviews[1].url === "https://www.burghound.com/rousseau-2016/");
  check("…one without an address is kept, unlinked", r.result.reviews.length === 3 && r.result.reviews[2].url === "" && r.result.reviews[2].critic === "Domaine newsletter");
  check("…and say how many results it was based on", r.result.searched === 2 && r.result.confidence === "high");
  const spent = Number(gas.rt.props["ai:month"].split("|")[1]);
  check("the month's spend is estimated from the usage", Math.abs(spent - (50000 * 4e-6 + 1300 * 20e-6 + 0.01)) < 1e-6 && Math.abs(r.cost - spent) < 0.001, spent);
  check("…and nothing about the wine is stored", !/Rousseau|Jacques/.test(J(gas.rt.props)) && !/Rousseau/.test(J(gas.rows("Ark1"))));

  // a model that answers in text first gets one nudge to call the tool
  queue = [ok({ stop_reason: "end_turn", content: [...searchBlocks, { type: "text", text: "It is lovely." }], usage: usage(1000, 50, 1) }),
           ok({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "tu_2", name: "report", input: { ...report, drinkFrom: 2050, drinkTo: 2030, reviews: [] } }], usage: usage(1000, 50, 0) })];
  sent = [];
  r = call({ action: "ai", wine: WINE });
  check("a text-only answer is nudged once to report", r.ok && sent.length === 2 && sent[1].body.messages[2].role === "user");
  check("…and a reversed window is put the right way round", r.result.drinkFrom === 2030 && r.result.drinkTo === 2050);
  check("the daily limit stops the third lookup", call({ action: "ai", wine: WINE }).error === "ai-limit" && call({ action: "aistatus" }).ai.left === 0);

  // a fresh day; error paths
  gas.rt.props["ai:u:cellar"] = "2000-01-01|9";
  queue = [ok({ stop_reason: "refusal", content: [], usage: usage(100, 0, 0) })];
  check("a refusal is reported", call({ action: "ai", wine: WINE }).error === "ai-refused");
  gas.rt.props["ai:u:cellar"] = "";
  queue = [{ code: 401, body: J({ type: "error", error: { type: "authentication_error" } }) }];
  check("a bad key is reported as such", call({ action: "ai", wine: WINE }).error === "ai-key");
  gas.rt.props["ai:u:cellar"] = "";
  queue = [{ code: 529, body: J({ type: "error", error: { type: "overloaded_error" } }) }];
  check("an overloaded API is 'busy'", call({ action: "ai", wine: WINE }).error === "ai-busy");
  gas.rt.props["ai:u:cellar"] = "";
  check("a wine without producer is refused before any call", call({ action: "ai", wine: { name: "x" } }).error === "Producer is required");

  // after a fallback mid-answer, only text and finished searches from before it go back (the API's rule)
  gas.rt.props["ai:u:cellar"] = "";
  queue = [ok({ stop_reason: "pause_turn", content: [
      { type: "thinking", thinking: "", signature: "a" }, { type: "text", text: "Looking." }, ...searchBlocks,
      { type: "server_tool_use", id: "srv_9", name: "web_search", input: {} },
      { type: "fallback", from: { model: "claude-opus-5-5" }, to: { model: "claude-opus-5" } },
      { type: "thinking", thinking: "", signature: "b" }], usage: usage(100, 10, 1) }),
    ok({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "t", name: "report", input: report }], usage: usage(100, 10, 0) })];
  sent = [];
  call({ action: "ai", wine: WINE });
  check("a fallback turn is echoed by the rules", J(sent[1].body.messages[1].content.map(b => b.type)) === J(["text", "server_tool_use", "web_search_tool_result", "thinking"]), J(sent[1].body.messages[1].content.map(b => b.type)));

  // the monthly budget
  gas.rt.props["ai:month"] = gas.rt.props["ai:month"].split("|")[0] + "|5.01"; gas.rt.props["ai:u:cellar"] = "";
  check("the monthly budget stops lookups", call({ action: "ai", wine: WINE }).error === "ai-budget");
  // who may use it
  const g2 = H({ Ark1: [HEAD] }, { fetch, settings: { AI_USERS: "adam" }, properties: { ANTHROPIC_API_KEY: "k" } });
  check("AI_USERS limits who may use it", g2.call({ code: "test-code", action: "ai", wine: WINE }).error === "ai-not-allowed" && g2.call({ code: "test-code", action: "aistatus" }).ai.on === false);
  check("the key is never sent to the site", !/sk-test-key/.test(J([call({ action: "aistatus" }), call({ action: "data" })])));

  const n = results.filter(Boolean).length;
  console.log(`\n${n}/${results.length} passed`);
  process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
