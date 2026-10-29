// Accessibility of the site's pages, by axe-core (the WCAG 2 A and AA rules it can check): the cellar logged out and
// in, the Wine atlas's start page and a French and a German region, the Côte d'Or atlas, a domaine and a vineyard
// page; in light and dark mode, on a desktop and a phone. axe can't judge everything (whether a label makes sense,
// keyboard order), but colour contrast, names, roles and ARIA it checks well, and it's what broke before.
//   (cd .. && python3 -m http.server 8765) & node tools/a11y-ui-test.js        (needs: npm i --no-save axe-core@4.10.2)
"use strict";
const fs = require("fs"), path = require("path");
const { chromium } = require("./pw"), H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
let AXE;
for (const p of [path.join(__dirname, "node_modules/axe-core/axe.min.js"), path.join(__dirname, "../node_modules/axe-core/axe.min.js")]) if (fs.existsSync(p)) { AXE = fs.readFileSync(p, "utf8"); break; }
if (!AXE) try { AXE = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8"); } catch (e) { console.error("axe-core isn't installed: npm i --no-save axe-core@4.10.2"); process.exit(1); }

const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];
const row = o => HEAD.map(h => o[h] ?? "");
const gas = H({ Ark1: [HEAD, row({ Producent: "Armand Rousseau", Land: "Frankrig", Område: "Bourgogne", Kommune: "Gevrey-Chambertin", "Mark/Navn": "Clos St-Jacques", Klassifikation: "1. cru", Type: "Rød", Årgang: 2016, Antal: 1, "Pris kr (WS)": 2400 }),
  row({ Producent: "Dr. Loosen", Land: "Tyskland", Område: "Mosel", "Mark/Navn": "Wehlener Sonnenuhr Riesling Spätlese", Type: "Hvid", Årgang: 2019, Antal: 3, "Pris kr (WS)": 300 })] });
const PAGES = ["atlas.html", "atlas.html#r=chablis", "atlas.html#r=mosel", "burgundy.html", "domaine.html?p=drc", "v/en/chateau-grillet.html"];

const axe = async p => { await p.addScriptTag({ content: AXE });
  return p.evaluate(async () => (await axe.run(document, { runOnly: ["wcag2a", "wcag2aa"] })).violations
    .map(v => `${v.id} ×${v.nodes.length}: ${v.nodes.slice(0, 2).map(n => n.html.slice(0, 70)).join(" ; ")}`)); };
(async () => {
  const b = await chromium.launch();
  for (const [w, h, dev, schemes] of [[1300, 900, "desktop", ["light", "dark"]], [390, 844, "phone", ["light"]]]) for (const scheme of schemes) {
    // bypassCSP: axe goes in as an inline script, which the pages' policy rightly refuses (csp-ui-test checks the policy)
    const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, bypassCSP: true });
    await require("./turnstile-fake")(ctx);
    await ctx.route(/geopf|geodatenzentrum/, r => r.abort()); // relief tiles and elevations: not part of what's checked
    await ctx.route(require("./api-route"), async route => { const q = JSON.parse(route.request().postData() || "{}"); let r;
      if (q.action === "login") r = { ok: true, user: q.user, token: "tok", v: 26 }; else if (q.action === "prelogin") r = { ok: false, error: "bad-code", v: 27 };
      else { delete q.user; delete q.token; q.code = "test-code"; r = gas.call(q); } await route.fulfill({ contentType: "application/json", body: JSON.stringify(r) }); });
    const p = await ctx.newPage(), tag = `${dev}, ${scheme}`;
    await p.goto(BASE); await p.waitForTimeout(500);
    let v = await axe(p); check(`the cellar's login (${tag})`, !v.length, v.join(" | "));
    await p.fill("#gateUser", "adam"); await p.fill("#gatePass", "pw"); await p.click("#gateSubmit");
    await p.waitForSelector("#app:not([hidden])", { timeout: 20000 }); await p.waitForTimeout(1200);
    v = await axe(p); check(`the cellar with its wines, charts and map (${tag})`, !v.length, v.join(" | "));
    for (const pg of PAGES) { await p.goto(BASE + pg); await p.waitForTimeout(pg.startsWith("burgundy") ? 2500 : 1500);
      v = await axe(p); check(`${pg} (${tag})`, !v.length, v.join(" | ")); }
    await ctx.close();
  }
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
