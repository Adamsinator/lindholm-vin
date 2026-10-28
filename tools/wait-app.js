// Wait for the cellar to open after a sign-up or login (#app shown). When it doesn't, say what the page was doing —
// the gate's message, which dialogs were open, the last requests and console lines — so a failure on CI (which this
// session can't watch) can be diagnosed from its log. Use: const waitApp = require("./wait-app")(page); await waitApp();
"use strict";
module.exports = function (p) {
  const log = [];
  p.on("console", m => { log.push(`console.${m.type()}: ${m.text()}`.slice(0, 200)); if (log.length > 30) log.shift(); });
  p.on("request", r => { if (r.method() === "POST") { log.push("POST " + (r.postData() || "").slice(0, 80)); if (log.length > 30) log.shift(); } });
  return async (timeout = 20000) => {
    try { await p.waitForSelector("#app:not([hidden])", { timeout }); }
    catch (e) {
      const s = await p.evaluate(() => ({ gateErr: (document.getElementById("gateErr") || {}).textContent, gate: !document.getElementById("gate").hidden,
        modals: [...document.querySelectorAll(".modal.open")].map(m => m.id), spin: (document.getElementById("spin") || {}).textContent })).catch(x => ({ evalFailed: String(x) }));
      console.log("waitApp: the cellar didn't open — " + JSON.stringify(s) + "\n  last: " + log.slice(-12).join("\n        "));
      throw e;
    }
  };
};
