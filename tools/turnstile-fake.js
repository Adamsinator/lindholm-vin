// A stand-in for Cloudflare's Turnstile widget, for the browser tests: served from Turnstile's own address (so the
// pages' CSP is tested as it will be), it "solves" at once with Cloudflare's dummy token and counts its resets.
//   await require("./turnstile-fake")(ctx)
"use strict";
const FAKE = `window.turnstile = {
  render(sel, o) { const el = document.querySelector(sel); el.textContent = "[human check]"; window.__ts = { key: o.sitekey, resets: 0 }; return "w1"; },
  getResponse() { return "XXXX.DUMMY.TOKEN.XXXX"; }, reset() { window.__ts.resets++; } };`;
module.exports = ctx => ctx.route(/challenges\.cloudflare\.com\/turnstile/, route => route.fulfill({ contentType: "text/javascript", body: FAKE }));
