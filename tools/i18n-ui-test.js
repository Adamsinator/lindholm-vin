// Browser test of the cellar app in Danish, German and French (i18n.js + the tr() calls in app.js): the page, a wine's
// details, the dialogs and the other pages follow the language picker, switching redraws what's on screen, the data
// underneath stays in the sheet's own words (Rød, Hvid, "cellar"), and no English is left where the interface talks.
//   (cd .. && python3 -m http.server 8765) & node tools/i18n-ui-test.js
"use strict";
const { chromium } = require("./pw");
const H = require("./gas-harness");
const BASE = process.env.BASE || "http://localhost:8765/";
const HEAD = ["Producent", "Land", "Område", "Kommune", "Mark/Navn", "Klassifikation", "Type", "Drue", "Årgang", "Antal", "Pris kr (WS)", "Drukket", "Kilde", "Note"];
const gas = H({ Ark1: [HEAD,
  ["Domaine Leflaive", "Frankrig", "Bourgogne", "Puligny-Montrachet", "Les Pucelles", "1. cru", "Hvid", "Chardonnay", 2014, 2, 1900, 1, "", ""],
  ["Giacomo Conterno", "Italien", "Piemonte", "", "Barolo Francia", "", "Rød", "Nebbiolo", 2017, 4, 950, "", "", ""],
  ["Château Lynch-Bages", "Frankrig", "Bordeaux", "Pauillac", "", "", "Rød", "Cabernet Sauvignon", 2005, 6, 1200, "", "", ""]] }, { settings: { SOCIAL: "on" } });
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
// words that only English uses, to find text the sweep missed (names of wines and places are left out of the scan)
const EN = /\b(the|and|your|you|with|from|click|bottles?|wines|enjoyed|cellar|(?<!-)value|price|search|filter|show|hide|edit|delete|save|cancel|more|not|yet|this|that|is|are|by|per|month|any|add|drink|drunk|ready|young|past|peak|soon|estimated|window|bought|drank|everyone|nothing|could|account|place|photo|remove|what|where|when|how|average|scores?|ratings?)\b/i;

(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await require("./turnstile-fake")(ctx);
  await ctx.route(require("./api-route"), async route => { const p = JSON.parse(route.request().postData() || "{}"); let r;
    if (p.action === "login") r = { ok: true, user: p.user, token: "tok", v: 26 }; else if (p.action === "prelogin") r = { ok: false, error: "bad-code", v: 27 };
    else { delete p.user; delete p.token; p.code = "test-code"; r = gas.call(p); }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(r) }); });
  const p = await ctx.newPage(); const errs = [];
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  await p.goto(BASE); await p.waitForTimeout(400);
  await p.evaluate(() => I18N.setLang("da"));
  await p.fill("#gateUser", "adam"); await p.fill("#gatePass", "pw"); await p.click("#gateSubmit");
  await p.waitForSelector("#rows tr.main", { timeout: 20000 }); await p.waitForTimeout(500);
  const txt = sel => p.textContent(sel);
  // English left in what the interface itself says (wine and place names excluded)
  const leftovers = () => p.evaluate(re => { const R = new RegExp(re, "i"), out = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const vis = el => { for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden" || e.hidden) return false; } return true; };
    while (w.nextNode()) { const n = w.currentNode, t = n.textContent.trim(), el = n.parentElement;
      if (!t || !el || el.closest("script,style,.prod,.wname,.rb-name,.dlabel,.dw-label,.jwine,#sommLog,header.top h1") || !vis(el)) continue;
      if (R.test(t)) out.push(t); }
    document.querySelectorAll("[placeholder],[title],[aria-label]").forEach(e => { if (!vis(e)) return; ["placeholder", "title", "aria-label"].forEach(a => { const v = e.getAttribute(a); if (v && R.test(v) && !/Lynch|Leflaive|Conterno/.test(v)) out.push("@" + a + " " + v); }); });
    return [...new Set(out)]; }, EN.source);

  check("Danish: the totals", /Flasker i kælderen/.test(await txt("#kpis")) && /Kælderens værdi/.test(await txt("#kpis")), await txt("#kpis"));
  check("Danish: the table and its count", /Producent/.test(await txt("#tbl thead")) && /3 vine · 11 fl\./.test(await txt("#count")), await txt("#count"));
  check("Danish: tabs, filters and buttons", /Nydt/.test(await txt(".tabs, nav")) && (await p.$eval("#fStatus", s => s.options[s.selectedIndex].textContent)) === "I kælderen" && /Tilføj vin/.test(await txt("#addBtn")));
  check("Danish: the date of the last update", /^Opdateret \d+\. okt\. 2026/.test(await txt("#stamp")), await txt("#stamp"));
  await p.click("#rows tr.main:has-text('Leflaive')"); await p.waitForTimeout(300);
  const det = await txt("#rows tr.detail:not([hidden])");
  check("Danish: a wine's details", /Markér 1 flaske som drukket/.test(det) && /Drikkevindue/.test(det) && /Ret oplysninger/.test(det), det.slice(0, 200));
  check("Danish: the producer's reputation note", /biodynamisk pioner/.test(det), det.slice(0, 300));
  let left = await leftovers();
  check("Danish: no English left on the cellar page", !left.length, left.slice(0, 6).join(" | "));
  // a toast
  await p.click("#rows tr.detail:not([hidden]) button[data-act=drink]"); await p.waitForTimeout(700);
  check("Danish: messages", /Skål! Flasken er markeret som drukket|Det var din sidste/.test(await txt("#actMsg")) && /Fortryd/.test(await txt("#actBtns")), await txt("#actbar"));

  // switching redraws what's on screen
  await p.evaluate(() => I18N.setLang("de")); await p.waitForTimeout(300);
  check("German: switching redraws the totals and the table", /Flaschen im Keller/.test(await txt("#kpis")) && /Erzeuger/.test(await txt("#tbl thead")) && /2 Weine · 10 Fl\./.test(await txt("#count")), await txt("#count")); // Leflaive's last bottle was drunk above
  check("German: the price button and the date", /Preise ausblenden/.test(await txt("#priceBtn")) && /^Aktualisiert \d+\. Okt\. 2026/.test(await txt("#stamp")), await txt("#stamp"));
  left = await leftovers();
  check("German: no English left on the cellar page", !left.length, left.slice(0, 6).join(" | "));
  for (const [pg, sel] of [["enjoyed", "#pageEnjoyed"], ["wishlist", "#pageWishlist"], ["journal", "#pageJournal"], ["feed", "#pageFeed"]]) {
    await p.click(`.tab[data-page=${pg}]`); await p.waitForTimeout(700);
  }
  await p.click(`.tab[data-page=enjoyed]`); await p.waitForTimeout(500);
  check("German: the Enjoyed page", /Flaschen genossen/.test(await txt("#eKpis")) && /Anderswo getrunken/.test(await txt("#eKpis")), await txt("#eKpis"));
  left = await leftovers();
  check("German: no English left on the Enjoyed page", !left.length, left.slice(0, 6).join(" | "));
  await p.click(`.tab[data-page=journal]`); await p.waitForTimeout(500);
  check("German: the journal", /Noch keine Einträge/.test(await txt("#jList")), await txt("#jList"));
  await p.click(`.tab[data-page=cellar]`); await p.waitForTimeout(300);

  // French: the Add form, and what is saved stays in the sheet's words
  await p.evaluate(() => I18N.setLang("fr")); await p.waitForTimeout(200);
  await p.click("#addBtn"); await p.waitForTimeout(200);
  check("French: the Add form", /Producteur \*/.test(await txt("#addForm")) && (await p.$eval("#aType", s => [...s.options].map(o => o.textContent + "=" + o.value).join())) === "Rouge=Rød,Blanc=Hvid,Rosé=Rose,Effervescent=Bobler",
    await p.$eval("#aType", s => [...s.options].map(o => o.textContent + "=" + o.value).join()));
  left = await leftovers();
  check("French: no English left in the Add form", !left.length, left.slice(0, 6).join(" | "));
  await p.fill("#aProducer", "Egon Müller"); await p.fill("#aName", "Scharzhofberger Kabinett"); await p.fill("#aRegion", "Mosel"); await p.fill("#aVintage", "2019");
  await p.click('#addForm button[type="submit"]'); await p.waitForTimeout(800);
  const row = gas.call({ code: "test-code", action: "data" }).wines.find(w => w.producer === "Egon Müller");
  check("French: what's saved is in the sheet's words (Hvid, Tyskland)", row && row.type === "Hvid" && row.country === "Tyskland", JSON.stringify(row));
  check("French: the toast", /ajouté à la cave/.test(await txt("#toast")), await txt("#toast"));
  check("the status filter still filters by its value", (await p.$eval("#fStatus", s => s.value)) === "cellar");
  // and back to English
  await p.evaluate(() => I18N.setLang("en")); await p.waitForTimeout(300);
  check("English again", /Bottles in cellar/.test(await txt("#kpis")) && /Producer/.test(await txt("#tbl thead")) && /^Updated /.test(await txt("#stamp")));
  check("no console errors", !errs.length, errs.join(" | "));
  await b.close();
  const n = results.filter(Boolean).length; console.log(`\n${n}/${results.length} passed`); process.exit(n === results.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
