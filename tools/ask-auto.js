// For the browser tests: answers the site's own questions (app.js, ask(): #askModal) the way a page.on("dialog")
// handler answered the browser's confirm() before. Each question's text goes into log; answer(text) decides: true
// (OK, typing what's asked for when it wants a name typed) or false (Cancel). Call once per browser context.
//   await require("./ask-auto")(ctx, dialogs, () => answer);
module.exports = async (ctx, log = [], answer = () => true) => {
  await ctx.exposeBinding("__askSeen", (src, msg) => { log.push(msg); return !!answer(msg); });
  await ctx.addInitScript(() => {
    addEventListener("DOMContentLoaded", () => {
      const m = document.getElementById("askModal"); if (!m) return;
      new MutationObserver(async () => {
        if (!m.classList.contains("open") || m.dataset.auto) return; m.dataset.auto = "1";
        const yes = await window.__askSeen(document.getElementById("askMsg").textContent);
        const inp = document.getElementById("askInput");
        if (yes && !inp.hidden) { inp.value = inp.placeholder; inp.dispatchEvent(new Event("input")); }
        document.getElementById(yes ? "askOk" : "askCancel").click(); delete m.dataset.auto;
      }).observe(m, { attributes: true, attributeFilter: ["class"] });
    });
  });
};
