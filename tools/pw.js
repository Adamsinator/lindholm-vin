// Playwright for the browser tests: the project's own install (npm i playwright, as in CI), or the one that comes
// with this machine's Node.
//
// Two guards for every browser suite, against a test that waits forever without saying on what:
//  - a request handler (context.route / page.route) that throws leaves Playwright's request paused for good, and the
//    page's fetch never answers: its promise can even be garbage-collected, which Playwright reports as "Execution
//    context was destroyed, most likely because of a navigation". Here a handler that throws aborts its request (the
//    page gets a network error, as from a real outage) and the suite says so on a FAIL line.
//  - if the suite fails, the requests still unanswered are listed (method, address, API action, how long), so a hang
//    names what it hangs on.
"use strict";
let pw;
try { pw = require("playwright"); }
catch (e) { pw = require("/opt/node22/lib/node_modules/playwright"); }

const T0 = Date.now(), PENDING = new Map(), THREW = [];
const age = t => ((Date.now() - t) / 1000).toFixed(1) + " s";
function describe(req) {
  let action = ""; try { const b = req.postData(); if (b && b[0] === "{") action = JSON.parse(b).action || ""; } catch (e) {}
  return `${req.method()} ${req.url().slice(0, 120)}${action ? ` (action ${action})` : ""}`;
}
function watch(ctx) {
  if (ctx.__guarded) return ctx; ctx.__guarded = true;
  const mine = new Set();
  ctx.on("request", r => { PENDING.set(r, Date.now()); mine.add(r); });
  const done = r => { PENDING.delete(r); mine.delete(r); };
  ctx.on("requestfinished", done); ctx.on("requestfailed", done);
  ctx.on("close", () => mine.forEach(r => PENDING.delete(r))); // a closed context's requests aren't waited on
  const wrap = target => { const route = target.route.bind(target);
    target.route = (url, handler, opts) => route(url, async (rt, req) => {
      try { return await handler(rt, req); }
      catch (err) {
        THREW.push(`${age(T0)} a request handler threw on ${describe(rt.request())}: ${String(err && err.message || err).split("\n")[0]}`);
        try { await rt.abort("failed"); } catch (e) {} // already handled, or the page is gone
      }
    }, opts); };
  wrap(ctx); ctx.on("page", p => wrap(p)); ctx.pages().forEach(wrap);
  return ctx;
}
const launch = pw.chromium.launch.bind(pw.chromium);
pw.chromium.launch = async (...a) => {
  const b = await launch(...a), nc = b.newContext.bind(b), np = b.newPage.bind(b);
  b.newContext = async (...o) => watch(await nc(...o));
  b.newPage = async (...o) => { const p = await np(...o); watch(p.context()); return p; };
  return b;
};
process.on("exit", code => {
  if (!code) return;
  THREW.forEach(t => console.log("FAIL " + t));
  const open = [...PENDING].filter(([, t]) => Date.now() - t > 1500).map(([r, t]) => `${describe(r)} for ${age(t)}`);
  if (open.length) console.log("FAIL still waiting on: " + open.slice(0, 8).join(" | "));
});
module.exports = pw;
