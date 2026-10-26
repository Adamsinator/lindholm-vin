// Tests of the API gateway (worker/index.js) in Node, in front of the real Code.gs (gas-harness.js) with
// GATEWAY_SECRET set: requests through it are served and direct ones refused, the IP limits hold (with Cloudflare's
// rate limiting binding and with the Worker's own counter), Turnstile guards sign-up and recovery, only the site's
// address gets answers, and a broken upstream doesn't leak through.
//   node tools/worker-test.js
"use strict";
const fs = require("fs"), path = require("path");
const H = require("./gas-harness");
const VAULT = require("../vault.js");
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };

const API = "https://script.google.com/macros/s/TEST/exec", SITE = "https://allwine.dk", SECRET = "gw-" + "x".repeat(40);
const PASS_KEY = "1x0000000000000000000000000000000AA", FAIL_KEY = "2x0000000000000000000000000000000AA"; // Cloudflare's test secrets
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];

(async () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "worker", "index.js"), "utf8");
  const W = (await import("data:text/javascript," + encodeURIComponent(src))).default;
  const gas = H({ Ark1: [HEAD] }, { settings: { SIGNUP_CODE: "invite", GATEWAY_SECRET: SECRET } });

  // what the Worker sends on: Apps Script (the harness's doPost) and Turnstile's siteverify
  const sent = []; let upstreamDown = false, verifies = 0;
  global.fetch = async (url, init = {}) => {
    if (url === API) {
      if (upstreamDown) return new Response("<html>Google error</html>", { status: 500 });
      sent.push(JSON.parse(init.body));
      return new Response(JSON.stringify(gas.post(init.body)), { headers: { "Content-Type": "application/json" } });
    }
    if (/siteverify$/.test(url)) {
      verifies++;
      const f = init.body, ok = f.get("secret") === PASS_KEY && !!f.get("response");
      return new Response(JSON.stringify({ success: ok, "error-codes": ok ? [] : ["invalid-input-response"] }));
    }
    throw new Error("unexpected fetch " + url);
  };
  let clock = 1e12;
  const envBase = { API_URL: API, GATEWAY_SECRET: SECRET };
  const call = async (body, { ip = "1.1.1.1", origin = SITE, method = "POST", env = envBase, headers = {} } = {}) => {
    const h = { ...(origin ? { Origin: origin } : {}), "CF-Connecting-IP": ip, ...headers };
    const req = new Request("https://allwine-api.example.workers.dev/", { method, headers: h, ...(method === "POST" || method === "PUT" ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}) });
    const res = await W.fetch(req, env, {}, clock);
    const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch (e) {}
    return { status: res.status, json, text, cors: res.headers.get("Access-Control-Allow-Origin") };
  };

  // ── through the gateway, and around it ──
  let r = await call({ action: "atlas" });
  check("a request through the Worker is served", r.status === 200 && r.json.ok === true && r.json.v >= 35, r.text.slice(0, 120));
  check("…with the site allowed to read the answer", r.cors === SITE);
  check("…and the secret added on the way", sent[sent.length - 1]._gw === SECRET);
  check("a request straight to Apps Script, without the secret, is refused", gas.post('{"action":"atlas"}').error === "gateway");
  check("…and with a wrong one", gas.post(JSON.stringify({ action: "atlas", _gw: "guess" })).error === "gateway");
  check("…also as a GET", gas.get({ action: "atlas" }).error === "gateway");
  r = await call({ action: "atlas", _gw: "client-made-this-up" });
  check("a secret sent by the caller is replaced, not passed on", r.json.ok === true && sent[sent.length - 1]._gw === SECRET);
  check("the secret doesn't reach the API's own code", !JSON.stringify(gas.rt.books).includes(SECRET));

  // ── who and what it answers ──
  r = await call({ action: "atlas" }, { origin: "https://evil.example" });
  check("another site's page gets a refusal", r.status === 403 && !r.cors);
  r = await call({ action: "atlas" }, { origin: "https://www.allwine.dk" });
  check("www.allwine.dk is the site too", r.status === 200 && r.cors === "https://www.allwine.dk");
  r = await call({ action: "atlas" }, { origin: null });
  check("a request with no Origin (not a browser) is still served, within the limits", r.status === 200 && r.json.ok);
  r = await call(null, { method: "OPTIONS" });
  check("the browser's preflight is answered", r.status === 204 && r.cors === SITE);
  r = await call(null, { method: "GET" });
  check("a GET just says what this is", r.status === 200 && /AllWine API gateway/.test(r.text));
  r = await call({ action: "atlas" }, { method: "PUT" });
  check("other methods are refused", r.status === 405);
  r = await call("{not json");
  check("a body that isn't JSON is refused before Apps Script", r.status === 400 && r.json.error === "bad-request");
  const n0 = sent.length;
  r = await call({ action: "atlas" }, { headers: { "Content-Length": "13000000" } });
  check("a body over 12 MB is refused by its size alone", r.status === 413 && r.json.error === "too-big" && sent.length === n0);
  r = await call({ action: "atlas" }, { env: { API_URL: API } });
  check("without its secret the Worker refuses to forward", r.status === 500 && r.json.error === "gateway-setup");

  // ── IP limits: the Worker's own counter ──
  clock += 120e3;
  let codes = [];
  for (let i = 0; i < 12; i++) codes.push((await call({ action: "prelogin", user: "nobody" }, { ip: "2.2.2.2" })).status);
  check("10 logins a minute per IP, then 429", codes.slice(0, 10).every(c => c === 200) && codes[10] === 429 && codes[11] === 429, codes.join(","));
  r = await call({ action: "prelogin", user: "nobody" }, { ip: "2.2.2.2" });
  check("…which the site can read as 'too many'", r.json.error === "too-many" && r.cors === SITE);
  r = await call({ action: "prelogin", user: "nobody" }, { ip: "3.3.3.3" });
  check("…without touching another address", r.status === 200);
  r = await call({ action: "atlas" }, { ip: "2.2.2.2" });
  check("…or the same address's other requests", r.status === 200);
  clock += 61e3;
  r = await call({ action: "prelogin", user: "nobody" }, { ip: "2.2.2.2" });
  check("…and a minute later it can log in again", r.status === 200);
  codes = [];
  for (let i = 0; i < 125; i++) codes.push((await call({ action: "atlas" }, { ip: "4.4.4.4" })).status);
  check("120 requests a minute per IP in all, then 429", codes.slice(0, 120).every(c => c === 200) && codes.slice(120).every(c => c === 429), codes.filter(c => c !== 200).length + " refused");

  // ── IP limits: Cloudflare's rate limiting binding, when it's there ──
  const keys = [];
  const binding = max => { const n = {}; return { limit: async ({ key }) => { keys.push(key); n[key] = (n[key] || 0) + 1; return { success: n[key] <= max }; } }; };
  const envB = { ...envBase, LIMIT_ALL: binding(1000), LIMIT_AUTH: binding(2) };
  codes = [];
  for (let i = 0; i < 3; i++) codes.push((await call({ action: "login", user: "x", auth: "y" }, { ip: "5.5.5.5", env: envB })).status);
  check("the binding's limits are used when bound", codes.join() === "200,200,429" && keys.includes("auth:5.5.5.5") && keys.includes("all:5.5.5.5"), codes.join() + " " + keys.join());
  const broken = { ...envBase, LIMIT_ALL: { limit: async () => { throw new Error("down"); } } };
  r = await call({ action: "atlas" }, { ip: "6.6.6.6", env: broken });
  check("a failing binding falls back to the Worker's own counter", r.status === 200);

  // ── Turnstile on sign-up and recovery ──
  const envT = { ...envBase, TURNSTILE_SECRET: PASS_KEY };
  const before = sent.length;
  r = await call({ action: "signup", user: "bodil", pass: "bodil-pass-1", code: "invite" }, { ip: "7.7.7.7", env: envT });
  check("sign-up without the human check is refused before Apps Script", r.json.error === "human-check" && sent.length === before);
  const k = await VAULT.newKeys("bodil-pass-1");
  r = await call({ action: "signup", user: "bodil", code: "invite", turnstile: "XXXX.DUMMY.TOKEN.XXXX", ...k.fields }, { ip: "7.7.7.7", env: envT });
  check("…and with it the account is made", r.json.ok === true && !!r.json.token, r.text.slice(0, 160));
  check("…with the token kept from Apps Script", !("turnstile" in sent[sent.length - 1]));
  r = await call({ action: "signup", user: "carl", code: "invite", turnstile: "XXXX.DUMMY.TOKEN.XXXX", ...k.fields }, { ip: "7.7.7.7", env: { ...envBase, TURNSTILE_SECRET: FAIL_KEY } });
  check("a token Turnstile rejects is refused", r.json.error === "human-check");
  r = await call({ action: "recover", user: "bodil" }, { ip: "7.7.7.7", env: envT });
  check("recovery needs the check too", r.json.error === "human-check");
  const v0 = verifies;
  r = await call({ action: "login", user: "bodil", auth: "z" }, { ip: "7.7.7.7", env: envT });
  check("logging in doesn't (it stays one quick request)", verifies === v0 && r.json.error === "bad-login");
  r = await call({ action: "signup", user: "dora", code: "invite", ...k.fields }, { ip: "7.7.7.8" });
  check("without TURNSTILE_SECRET there's no check", r.json.ok === true);

  // ── a broken upstream ──
  upstreamDown = true;
  r = await call({ action: "atlas" }, { ip: "8.8.8.8" });
  check("Google's error page becomes a short JSON error", r.status === 502 && r.json.error === "upstream" && !/Google error/.test(r.text) && r.cors === SITE);
  upstreamDown = false;

  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
