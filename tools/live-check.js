#!/usr/bin/env node
// A daily look at the live site (.github/workflows/live-check.yml), so a break is found before a user finds it:
//   • the pages, the sitemap and the 404 page answer as they should
//   • every script, dictionary and icon the pages ask for is there, at the version asked for
//   • the live pages are the ones on main, and the API runs the Code.gs of main's API_VERSION (a deploy not done)
//   • the API answers, and refuses another site
//   • the cellar, the atlas and the Côte d'Or open in a browser without an error (when Playwright is installed)
// Nothing is written anywhere: no login, no account, only questions any visitor's browser asks.
//   node tools/live-check.js [--out report.md]
"use strict";
const fs = require("fs"), path = require("path");
const SITE = process.env.SITE || "https://allwine.dk/", ROOT = path.join(__dirname, "..");
const results = []; const check = (name, ok, extra = "") => { results.push({ name, ok, extra }); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const get = async (u, opt) => { try { const r = await fetch(new URL(u, SITE), { redirect: "follow", ...opt }); return { status: r.status, text: await r.text() }; } catch (e) { return { status: 0, text: String(e.message) }; } };

(async () => {
  // ── pages ──
  const PAGES = ["", "atlas.html", "burgundy.html", "domaine.html", "privacy.html", "v/en/index.html", "v/da/les-clos.html", "sitemap.xml", "robots.txt", "manifest.json"];
  const page = {};
  for (const p of PAGES) { page[p] = await get(p); check(`/${p} answers 200`, page[p].status === 200, String(page[p].status)); }
  const nf = await get("no-such-page-" + Date.now());
  check("a missing page gets the site's own 404", nf.status === 404 && /Page not found/.test(nf.text), String(nf.status));

  // ── every file the pages ask for, at its version ──
  const wanted = new Set();
  for (const p of ["", "atlas.html", "burgundy.html", "domaine.html", "privacy.html"]) {
    const html = page[p].text || "";
    for (const m of html.matchAll(/<script src="([^"]+)"/g)) wanted.add(m[1]);
    for (const m of html.matchAll(/<meta name="i18n-extra" content="([^"]*)"/g)) m[1].split(/\s+/).filter(Boolean).forEach(f => wanted.add(f));
  }
  // the dictionaries i18n.js names, and the atlas's region packs
  const i18n = await get([...wanted].find(f => /^i18n\.js/.test(f)) || "i18n.js");
  for (const m of (i18n.text || "").matchAll(/"(i18n-[a-z]{2}\.js\?v=\d+)"/g)) wanted.add(m[1]);
  const atlasJs = await get([...wanted].find(f => /^atlas\.js/.test(f)) || "atlas.js");
  for (const m of (atlasJs.text || "").matchAll(/"(atlas-[\w-]+\.js\?v=\d+)"/g)) wanted.add(m[1]);
  const missing = [];
  await Promise.all([...wanted].filter(f => !/^https?:/.test(f)).map(async f => { const r = await get(f, { method: "HEAD" }); if (r.status !== 200) missing.push(`${f} (${r.status})`); }));
  check(`every script and data file the pages ask for is there (${wanted.size})`, !missing.length, missing.slice(0, 10).join(", "));

  // ── the live site is main ──
  const stale = ["index.html", "atlas.html", "burgundy.html"].filter(p => { const live = page[p === "index.html" ? "" : p].text, repo = fs.readFileSync(path.join(ROOT, p), "utf8"); return live !== repo; });
  check("the live pages are the ones on main", !stale.length, stale.join(", ") + " differ (a deploy still running, or one that failed)");

  // ── the API ──
  const cfg = (await get("config.js")).text || "", API = (cfg.match(/API_URL:\s*"([^"]+)"/) || [])[1];
  const repoApi = +(fs.readFileSync(path.join(ROOT, "apps-script/Code.gs"), "utf8").match(/const API_VERSION = (\d+);/) || [])[1];
  if (!API) check("config.js names the API", false, "no API_URL");
  else {
    const r = await get(API, { method: "POST", headers: { Origin: SITE.replace(/\/$/, "") }, body: JSON.stringify({ action: "nope" }) });
    let j = null; try { j = JSON.parse(r.text); } catch (e) {}
    check("the API answers", r.status === 200 && j && j.ok === false && j.error === "bad-code", `${r.status} ${String(r.text).slice(0, 120)}`);
    check(`the API runs main's Code.gs (API ${repoApi})`, j && j.v === repoApi, j ? `the API reports v${j.v}: deploy Code.gs (Manage deployments → ✏️ → New version)` : "no answer");
    const evil = await get(API, { method: "POST", headers: { Origin: "https://example.com" }, body: JSON.stringify({ action: "nope" }) });
    check("…and refuses another site", evil.status === 403, String(evil.status));
  }

  // ── in a browser ──
  let pw = null; try { pw = require("./pw"); } catch (e) {}
  if (pw) {
    const b = await pw.chromium.launch(), ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    for (const [p, ready] of [["", "#gate, #app"], ["atlas.html#r=chablis", "#map .cl"], ["burgundy.html", "#map path"]]) {
      const pg = await ctx.newPage(), errs = [];
      pg.on("pageerror", e => errs.push(e.message));
      pg.on("response", r => { if (r.status() >= 400 && new URL(r.url()).origin === new URL(SITE).origin) errs.push(r.status() + " " + r.url()); });
      let ok = true; try { await pg.goto(new URL(p, SITE).href, { timeout: 45000 }); await pg.waitForSelector(ready, { timeout: 30000, state: "attached" }); await pg.waitForTimeout(2500); } catch (e) { ok = false; errs.push(e.message.split("\n")[0]); }
      check(`/${p.split("#")[0]} opens in a browser without an error`, ok && !errs.length, errs.slice(0, 3).join(" | "));
      await pg.close();
    }
    await b.close();
  } else console.log("(Playwright isn't installed here: the browser checks were skipped)");

  const bad = results.filter(r => !r.ok), out = process.argv.indexOf("--out");
  if (out > 0) fs.writeFileSync(process.argv[out + 1], `Live check of ${SITE} on ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC: `
    + (bad.length ? `${bad.length} of ${results.length} checks failed.\n\n` + bad.map(r => `- **${r.name}**: ${r.extra}`).join("\n") : `all ${results.length} checks passed.`) + "\n");
  console.log(`\n${results.length - bad.length}/${results.length} passed`); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
