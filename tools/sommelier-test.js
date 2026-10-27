// Tests of the sommelier (sommelier.js) in Node, with the atlas data loaded as the page loads it: questions in the four
// languages about appellations, grapes, Burgundy vineyards and owners, vintages, serving, decanting, food and the
// cellar; typos; and that every answer is escaped and in the asked language.
//   node tools/sommelier-test.js
"use strict";
const path = require("path");
global.window = {};
["burgundy-data.js", "burgundy-data-beaune.js", "burgundy-vintages.js", "burgundy-i18n-da.js", "burgundy-i18n-de.js", "burgundy-i18n-fr.js", "notes.js"]
  .forEach(f => { try { require(path.join(__dirname, "..", f)); } catch (e) {} });
const S = require("../sommelier.js"), D = require("../sommelier-data.js");
const results = []; const check = (name, ok, extra = "") => { results.push(ok); console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };

const wines = [
  { row: 2, producer: "Armand Rousseau", name: "Clos St-Jacques", commune: "Gevrey-Chambertin", region: "Bourgogne", country: "Frankrig", style: "Rød", grape: "Pinot Noir", vintage: 2016, qty: 3, drunk: 0, left: 3, price: 4500, location: "Kælder, reol 3" },
  { row: 3, producer: "Domaine Leflaive", name: "Les Pucelles", commune: "Puligny-Montrachet", region: "Bourgogne", country: "Frankrig", style: "Hvid", grape: "Chardonnay", vintage: 2014, qty: 2, drunk: 0, left: 2, price: 1900, location: "" },
  { row: 4, producer: "Giacomo Conterno", name: "Barolo Francia", commune: "", region: "Piemonte", country: "Italien", style: "Rød", grape: "Nebbiolo", vintage: 2017, qty: 4, drunk: 1, left: 3, price: 950, location: "Køleskab" },
  { row: 5, producer: "Château Lynch-Bages", name: "", commune: "Pauillac", region: "Bordeaux", country: "Frankrig", style: "Rød", grape: "Cabernet Sauvignon, Merlot", vintage: 2005, qty: 6, drunk: 0, left: 6, price: 1200, location: "Kælder, reol 1" },
  { row: 6, producer: "Krug", name: "Grande Cuvée", commune: "", region: "Champagne", country: "Frankrig", style: "Bobler", grape: "", vintage: "NV", qty: 1, drunk: 1, left: 0, price: 1650, location: "" },
];
const readiness = w => typeof w.vintage !== "number" ? null : w.vintage <= 2010 ? { k: "now", soon: false } : w.vintage === 2014 ? { k: "past" } : { k: "young" };
const ctx = (lang, extra) => Object.assign({ lang, wines, burg: window.BURG, vint: window.BURG_VINTAGES, burgI18n: window.BURG_I18N[lang] || null, readiness,
  window: w => typeof w.vintage === "number" ? { from: w.vintage + 8, to: w.vintage + 25 } : null, notes: window.PRODUCER_NOTES }, extra || {});
const ask = (lang, q, extra) => S.answer(q, ctx(lang, extra)).html;
const text = h => h.replace(/<\/?(p|li|ul)>/g, " ").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const has = (lang, q, re, extra) => { const h = text(ask(lang, q, extra)); return [re.test(h), h.slice(0, 260)]; };
const t = (name, lang, q, re, extra) => { const [ok, h] = has(lang, q, re, extra); check(`${name}: [${lang}] ${q}`, ok, h); };

// the two examples from the request
t("appellation grapes", "en", "what grape is sancerre", /Sancerre.*Loire.*White: Sauvignon Blanc.*Red \/ rosé: Pinot Noir/);
t("Burgundy vintage", "en", "is 2005 a good year for red cote de nuits?", /Red Côte de Nuits 2005: 98\/100 — outstanding/);
// in the other languages
t("…Danish", "da", "Hvilken drue er Sancerre?", /Sancerre er en appellation i Loire, Frankrig.*Hvid: Sauvignon Blanc/);
t("…French", "fr", "Quel cépage pour le Sancerre ?", /Sancerre est une appellation de Loire, France.*Blanc : Sauvignon Blanc/);
t("…German", "de", "Welche Rebsorte ist Sancerre?", /Sancerre ist eine Appellation in Loire, Frankreich.*Weiß: Sauvignon Blanc/);
t("…Danish vintage", "da", "Er 2005 en god årgang for rød Côte de Nuits?", /Rød Côte de Nuits 2005: 98\/100 — fremragende.*Tør, sund årgang|Rød Côte de Nuits 2005: 98\/100/);
t("…German vintage", "de", "Ist 2005 ein guter Jahrgang für rote Côte de Nuits?", /Rote Côte de Nuits 2005: 98\/100 – herausragend/);
// spelling slips
t("typo in an appellation", "da", "hvilken drue er sancere", /Sancerre er en appellation/);
t("typo in a grape", "en", "tell me about nebiolo", /Nebbiolo is a red grape from Piedmont/);
// Burgundy colours and côtes
t("white Burgundy", "en", "2014 white burgundy", /White Côte de Beaune 2014/);
t("a commune picks its côte", "en", "how was 2010 in Volnay", /Red Côte de Beaune 2010/);
t("a white appellation picks white", "en", "Meursault 2017?", /White Côte de Beaune 2017/);
t("white Côte de Nuits explained", "en", "2019 white cote de nuits", /only — its few whites|for red only/);
// other regions
t("right bank from Pomerol", "en", "Pomerol 2015 vintage", /Right Bank .* 2015: ★★★★★ — outstanding/);
t("left bank from Pauillac", "fr", "2015 est-il un bon millésime à Pauillac ?", /rive gauche .* 2015 : ★★★★☆ — très bon/);
t("Barolo", "de", "Wie war 2016 in Barolo?", /Piemont \(Barolo, Barbaresco\) 2016: ★★★★★/);
t("Napa 2020 smoke", "en", "napa 2020", /2020: ★☆☆☆☆ — poor/);
t("Port not declared", "en", "2012 port vintage", /2012 was not a general declaration year/);
t("a year alone", "en", "how was 2010", /2010 around the wine world.*Bordeaux, Left Bank.*Rioja/);
// the atlas
t("a premier cru", "en", "Les Amoureuses", /premier cru in Chambolle-Musigny, 5.4 ha.*Largest listed owners: Robert Groffier 1.09 ha/);
t("who owns a grand cru", "en", "Who owns Musigny?", /Musigny is a grand cru in Chambolle-Musigny.*Comte Georges de Vogüé 7.14 ha/);
t("…with the Danish description", "da", "hvem ejer musigny", /Den mest silkebløde|grand cru i Chambolle-Musigny/);
t("a name two vineyards share", "en", "la romanee", /Several vineyards are called La Romanée.*Vosne-Romanée — grand cru.*Chassagne-Montrachet — premier cru/);
t("a monopole", "en", "Romanée-Conti", /grand cru in Vosne-Romanée.*A monopole of Domaine de la Romanée-Conti/);
t("a name several vineyards share", "en", "perrieres", /Several vineyards are called Les Perrières.*Meursault.*Puligny-Montrachet/);
t("…narrowed by the commune", "en", "Meursault Perrières", /Les Perrières is a premier cru in Meursault/);
t("a producer", "en", "what is Domaine Leflaive", /Domaine Leflaive.*Holdings on the atlas: Chevalier-Montrachet 1.92 ha.*In your cellar: 2 bottles/);
// grapes and regions
t("a grape profile", "en", "Tell me about Nebbiolo", /medium-bodied, high acidity, firm tannins.*cherry, rose, tar.*Barolo, Barbaresco/);
t("…in German", "de", "Was ist Riesling?", /Riesling ist eine weiße Rebsorte aus Mosel.*hohe Säure/);
t("synonyms", "en", "what is Spätburgunder", /Pinot Noir is a red grape/);
t("a region", "en", "tell me about rioja", /Rioja.*Tempranillo/);
// glossary
t("glossary", "en", "What is a monopole?", /owned entirely by one producer/);
t("…German", "de", "Was ist Spätlese?", /deutschen Prädikate/);
t("…Danish", "da", "hvad betyder premier cru", /Andet trin blandt Bourgognes marker/);
// serving, decanting, keeping
t("serve a light white", "fr", "À quelle température servir un Chablis ?", /Servez Chablis à 8–10 °C/);
t("serve a full red", "en", "what temperature for Barolo", /Barolo at 16–18 °C/);
t("serve red Burgundy", "en", "how warm should I serve Volnay", /Volnay at 13–15 °C .*Pinot Noir and red Burgundy 14–16 °C/);
t("decant Barolo", "en", "Should I decant Barolo?", /1–3 hours/);
t("decant Burgundy", "en", "decant a young burgundy?", /rarely need it/);
t("decant an old bottle", "da", "skal jeg dekantere en gammel flaske", /Gamle flasker/);
t("opened bottle", "en", "how long does an opened bottle keep", /3–5 days/);
t("storage", "de", "Wie soll ich Wein lagern?", /10–14 °C/);
// food
t("lamb", "da", "hvad passer til lam?", /Til lam: Bordeaux.*Fra din kælder, klar nu:.*Lynch-Bages/);
t("roast pork, Danish words", "da", "hvad skal jeg drikke til flæskesteg", /Til flæskesteg: Pinot Noir.*halvtør Riesling/);
t("'and' in English isn't duck", "en", "what goes with salmon and dill", /With salmon: white Burgundy/);
t("duck in Danish", "da", "vin til and", /Til and: Pinot Noir/);
t("blue cheese before cheese", "en", "wine with blue cheese", /Sauternes, Tokaji/);
t("Christmas", "da", "hvilken vin til julemiddag", /and og flæskesteg: Pinot Noir/);
t("no dish named", "en", "what goes well with it", /Which dish\?/);
// your cellar
t("drink now", "en", "What should I drink now?", /Ready to drink.*Leflaive Les Pucelles 2014.*past its window.*Lynch-Bages 2005/);
t("…German", "de", "Was soll ich heute Abend öffnen?", /Jetzt trinkreif/);
t("where is", "en", "where is my rousseau", /Armand Rousseau Clos St-Jacques 2016 · 3 bottles · 📍 Kælder, reol 3/);
t("where, no location", "da", "hvor er min leflaive", /Les Pucelles 2014 · 2 flasker · 📍 ingen placering/);
t("how many red", "da", "hvor mange flasker rødvin har jeg", /Du har 12 flasker \(3 vine\) — rød/);
t("how many of a region", "en", "how many bottles of burgundy do I have", /5 bottles \(2 wines\) — Burgundy/);
t("how many in all", "en", "how many bottles do I have", /14 bottles \(4 wines\).*By style: red 12, white 2/);
t("do I have, drunk-out ones don't count", "en", "do I have any Krug", /can't find/);
t("do I have", "fr", "ai-je du Barolo ?", /Oui — 1 vin.*Conterno/);
t("most expensive", "en", "my most expensive wine", /most expensive.*Armand Rousseau.*4.500 kr./);
t("oldest", "en", "what's my oldest wine", /oldest vintages.*Lynch-Bages 2005/);
t("value", "en", "what is my cellar worth", /14 bottles; at what you paid that is 27.350 kr\.$/);
t("not logged in", "en", "where is my rousseau", /Log in to your cellar/, { wines: null });
// help, unknown
t("greeting", "da", "hej", /Jeg er kælderens sommelier/);
t("empty question", "fr", "", /Je suis le sommelier/);
t("unknown", "en", "qwertyuiop", /don't know that one yet.*Try asking/);

// how long wines keep
t("ageing", "en", "how long can I keep Barolo?", /Barolo.*8–30 years after the vintage/);
t("ageing, with a year", "en", "how long can i keep a 2010 bonnes mares", /Bonnes-Mares.*10–30 years.*A 2010 would be at its best about 2020–2040/);
t("ageing, a village", "en", "how long does Meursault keep", /Meursault.*3–10 years/);
t("ageing, the note", "da", "hvor længe kan jeg gemme chablis", /Chablis.*3–10 år.*grands crus 8–20/);
t("ageing, drink young", "en", "how long can I keep prosecco", /Prosecco.*best young, within 2 years/);
t("ageing, Burgundy's levels", "en", "how long can I keep burgundy", /regional wines 2–6 years, village 4–12.*grand cru 10–30/);
t("ageing, a grape", "fr", "combien de temps garder un pinot noir", /Pinot Noir.*3 à 12 ans/);
t("ageing, German", "de", "wie lange kann ich barolo lagern", /Barolo.*8–30 Jahre/);
t("ageing, your own", "en", "how long can I keep my rousseau", /drink windows.*Clos St-Jacques 2016.*drink 2024–2041/);
t("an opened bottle is not ageing", "de", "wie lange hält ein geöffneter wein", /Nach dem Öffnen/);
t("storing is not ageing", "de", "Wie soll ich Wein lagern?", /10–14 °C/);
// the best years
t("best vintages, Burgundy", "en", "best vintages for red cote de nuits", /best vintages for red Côte de Nuits.*2015 98.*2005 98/);
t("best vintages, a chart", "da", "bedste årgange for champagne", /Champagne \(årgang\).*2012.*2008.*2002/);
t("a good vintage, no year", "en", "what is a good champagne vintage", /best vintages for Champagne/);
// comparisons, places, terms, facts
t("difference between two terms", "en", "what is the difference between premier cru and grand cru", /Premier cru.*second tier.*Grand cru.*top classification/);
t("X vs Y", "da", "barolo vs barbaresco", /Barolo er en appellation.*Barbaresco er en appellation/);
t("where is a place not in the cellar", "en", "where is chablis", /Chablis is an appellation in Burgundy/);
t("soil", "en", "what soil is in chablis", /Kimmeridgian limestone and marl/);
t("style and soil on the card", "fr", "parle-moi de pauillac", /graves sur calcaire.*Lafite, Latour, Mouton/);
t("how long it keeps on the card", "en", "tell me about pauillac", /Keeps: typically 10–30 years/);
t("glasses", "en", "what glass for burgundy", /wide bowl for Pinot Noir/);
t("glasses per bottle, not the cellar", "da", "hvor mange glas i en flaske", /fem glas á 15 cl/);
t("calories", "en", "how many calories in wine", /90–100 kcal/);
t("bottle sizes", "de", "was ist eine magnum", /Magnum 1,5 l/);
t("a producer's nickname", "en", "what is DRC", /Domaine de la Romanée-Conti/);
t("brett", "en", "what does brett mean in wine", /wild yeast/);
t("a typo of German 'lange' is not Langhe", "de", "wie lange kann ich chablis lagern", /Chablis/);

// safety: what is typed is never HTML
const h = ask("en", '<img src=x onerror=alert(1)> where is my <b>rousseau</b>');
check("typed HTML is never echoed as HTML", !/<img|<b>rousseau/i.test(h), h);
const h2 = S.answer("qwerty <script>x</script>", ctx("en")).html;
check("…nor in the unknown answer", !/<script/i.test(h2));
// ── recommendations, budgets and opinions ──
{ let [ok, h] = has("en", "Can you recommend a wine from piemonte", /Worth buying[\s\S]*Barolo/);
  check("'recommend a wine from Piemonte': Piemonte wines to buy (your Barolo 2017 isn't ready, so it isn't offered)", ok && !/Burgundy ·|From your own cellar/.test(h), h);
  [ok, h] = has("en", "recommend a Bordeaux", /From your own cellar[\s\S]*Lynch-Bages[\s\S]*Worth buying[\s\S]*Bordeaux/);
  check("…your own ready bottles come first", ok, h);
  [ok, h] = has("en", "recommend a white burgundy under 60 euros", /Worth buying for up to €60/);
  const prices = [...h.matchAll(/€(\d+)/g)].map(m => +m[1]).slice(1);
  check("…a white Burgundy under 60 €: only white Burgundy at or under the budget", ok && prices.length && prices.every(x => x <= 63) && /Chablis|Mâcon/.test(h), h);
  [ok, h] = has("en", "If i gave you 1000 euros which wine would you buy", /For €1,000 I'd buy one great bottle[\s\S]*Or make it six bottles/);
  check("…'1000 euros, which wine would you buy': one great bottle, or six", ok && !/From your own cellar/.test(h), h);
  check("…starting from what you drink most (Bordeaux in this cellar)", /You drink a lot of Bordeaux[\s\S]*Lafite/.test(h), h);
  [ok, h] = has("da", "anbefal en champagne under 500 kr", /højst €67 \(≈ 500 kr\.\)/);
  check("…in Danish, a budget in kroner is read and shown in both currencies", ok && /Champagne/.test(h), h);
  [ok, h] = has("en", "what Riesling should I buy", /Worth buying[\s\S]*Riesling/);
  check("…by grape", ok && !/Chardonnay ·|Pinot Noir ·/.test(h), h);
  [ok, h] = has("de", "Empfiehl einen Barolo unter 100 €", /Kaufenswert bis €100/);
  check("…in German", ok, h); }
{ let [ok, h] = has("en", "Do you prefer white burgundy or white wine from denmark", /If I had to choose: White Burgundy/);
  check("'white Burgundy or Danish white?': an opinion, with reasons", ok && /Solaris/.test(h) && /keeps/i.test(h), h);
  [ok, h] = has("da", "Foretrækker du hvid bourgogne eller dansk hvidvin?", /Hvis jeg skulle vælge: Hvid Bourgogne[\s\S]*Danmark har også/);
  check("…in Danish, 'dansk' is Denmark", ok, h);
  [ok, h] = has("en", "Barolo or Barbaresco?", /If I had to choose: Barolo[\s\S]*Barbaresco has its moments/);
  check("'Barolo or Barbaresco?' without 'prefer' is a choice too", ok, h);
  [ok, h] = has("en", "Bordeaux or Burgundy?", /If I had to choose: Bordeaux[\s\S]*close call[\s\S]*cellar tips it/);
  check("…two great regions: a close call that your cellar tips", ok, h);
  [ok, h] = has("en", "red or white tonight?", /Ready to drink from your cellar/);
  check("'red or white tonight?' goes to what's ready in the cellar", ok, h); }
{ let [ok, h] = has("en", "is red cote de nuits from 15 or 13 best", /2015, by far: 98\/100 against 90\/100[\s\S]*2013[\s\S]*hats off/);
  check("'red Côte de Nuits 15 or 13': 2015 by far, what each year was like, and hats off to a fine 2013", ok && !/2013, by far/.test(h), h);
  [ok, h] = has("en", "2010 or 2005 for red Côte de Nuits?", /2005, clearly: 98\/100 against 95\/100/);
  check("…a smaller gap says 'clearly', with no hat-tip for a great year", ok && !/hats off/.test(h), h);
  [ok, h] = has("da", "er rød côte de nuits fra 15 eller 13 bedst?", /2015, med længder[\s\S]*hatten af/);
  check("…in Danish", ok, h);
  [ok, h] = has("en", "Barolo 2010 vs 2014", /2010, by far: ★★★★★/);
  check("…other regions from the star charts", ok, h);
  check("'under 50 euros' is not read as the years 2050", !/2050/.test(text(ask("en", "recommend a champagne under 50 euros")))); }
check("every pick names a region the site knows", (() => { const KB = require("../wine-kb.js"); const ok = new Set([...KB.regions.map(r => r.n), ...KB.countries.map(c => c.n)]); return D.picks.every(pk => ok.has(pk.region) && pk.eur > 0 && "rwsdf".includes(pk.col)); })());

// every phrase in all four languages
const missing = Object.entries(S.SAY).filter(([k, v]) => !Array.isArray(v) || v.length !== 4 || v.some(x => x === "" && !["tannin"].includes(k)));
check("every phrase has four languages", !missing.length, missing.map(m => m[0]).join());
check("food suggestions in four languages", D.food.every(f => ["en", "da", "fr", "de"].every(l => f.wines[l] && f.label[l])));
// speed
const t0 = Date.now(); for (let i = 0; i < 50; i++) S.answer(["what grape is sancerre", "where is my rousseau", "2005 cote de nuits", "lamb"][i % 4], ctx("en"));
const ms = (Date.now() - t0) / 50;
check(`answers are instant (${ms.toFixed(1)} ms each)`, ms < 50);

// ── smarter: the dish over "tonight", the year against how long a wine keeps, the cellar's top and its due bottles ──
t("a dish beats 'tonight'", "en", "what should I drink tonight with steak", /With beef or steak: Cabernet.*From your cellar, ready now: Château Lynch-Bages/);
t("…with sushi", "en", "what is a good wine with sushi", /With sushi: Riesling Kabinett/);
t("a young vintage of a named wine", "en", "is 2019 Barolo ready", /Barolo 2019 is probably still too young: it should be at its best about 2027–2049.*2019: ★★★★★/);
t("…a ready one", "en", "is 2005 Barolo ready?", /Barolo 2005 should be in its window now, about 2013–2035/);
t("…in Danish", "da", "er 2019 Barolo klar?", /Barolo 2019 er nok stadig for ung/);
t("what you have most of", "en", "which producer do I have most of", /Most of your cellar, by producer: Château Lynch-Bages · 6 bottles/);
t("…by region, in Danish", "da", "hvilken region har jeg flest af", /Det meste i din kælder, efter område: Bordeaux · 6 flasker/);
t("the most valuable bottle", "en", "what is my most valuable bottle", /most valuable bottles.*Armand Rousseau Clos St-Jacques 2016.*4\.500 kr/);
const Y = new Date().getFullYear(), soonWin = w => w.producer === "Château Lynch-Bages" ? { from: 2013, to: Y } : w.producer === "Domaine Leflaive" ? { from: 2018, to: Y - 2 } : { from: 2030, to: 2045 };
t("what must be drunk this year", "da", "hvilke vine skal drikkes i år", new RegExp(`Disse bør drikkes inden udgangen af ${Y} \\(8 flasker\\).*Domaine Leflaive Les Pucelles 2014.*forbi vinduet siden ${Y - 2}.*Lynch-Bages 2005.*vinduet lukker ${Y}`), { window: soonWin });
t("what is past its peak", "en", "which of my wines are past their peak", /Past their drink window \(2 bottles\) — open these first: Domaine Leflaive Les Pucelles 2014/);
t("…in German, with the window", "de", "Welche Weine sind über dem Höhepunkt?", new RegExp(`Domaine Leflaive Les Pucelles 2014.*Fenster seit ${Y - 2} vorbei`), { window: soonWin });
t("…and nothing due says what's next", "en", "which of my wines need drinking soon", new RegExp(`Nothing in your cellar closes its window before the end of ${Y + 1}`));
// producers beyond Burgundy, in every language
t("a Mosel producer", "en", "tell me about Egon Müller", /Egon Müller · Mosel.*Scharzhofberger/);
t("…a Piedmont producer you own", "en", "tell me about Giacomo Conterno", /Monfortino.*In your cellar: 3 bottles · 1 wine/);
t("…Champagne, in Danish", "da", "fortæl om Krug", /Krug · Champagne Huset, hvor al vin gæres/);
t("…in French", "fr", "Parlez-moi de Gaja", /Gaja · Piémont Angelo Gaja a mis le Barbaresco/);
t("…two side by side", "en", "Krug or Bollinger?", /Krug · Champagne.*Bollinger · Champagne/);
t("…and in the cellar", "en", "do I have any Lynch-Bages", /Yes — 1 wine: Château Lynch-Bages 2005/);
const noKeller = text(ask("de", "Was soll ich heute Abend aus meinem Keller trinken?")), noWeil = text(ask("de", "Ich frage, weil ich Gäste habe: was passt zu Lamm?"));
check("German 'Keller' (cellar) isn't the producer Keller", !/Rheinhessen|G-Max/.test(noKeller), noKeller.slice(0, 160));
check("…nor 'weil' (because) Robert Weil", !/Kiedrich/.test(noWeil) && /Lamm/.test(noWeil), noWeil.slice(0, 160));
// more terms
t("Chablis's grands crus", "en", "what are the grand crus of Chablis", /seven climats — Blanchot, Bougros, Les Clos, Grenouilles, Les Preuses, Valmur and Vaudésir/);
t("a classification named with its place", "en", "what is the Bordeaux 1855 classification", /1855 classification ranked the Médoc/);
t("why Burgundy costs so much", "da", "hvorfor er bourgogne så dyr", /Lidt vin, og hele verden vil have den/);
t("the Beaujolais crus", "en", "what are the beaujolais crus", /Saint-Amour, Juliénas, Chénas, Moulin-à-Vent/);
t("Wachau's categories", "de", "Was ist Smaragd?", /Steinfeder.*Federspiel.*Smaragd/);
t("an everyday short name is the appellation", "en", "what is Brunello", /Brunello di Montalcino is an appellation in Tuscany/);
// value
t("a good-value Burgundy", "en", "what is a good value Burgundy", /Marsannay, Fixin.*Good-value bottles worth looking for: .*Bourgogne/);
t("…cheap Bordeaux in Danish", "da", "billig Bordeaux", /Médocs crus bourgeois.*Gode køb/);
// follow-ups: the previous question with the year or the wine swapped
const S2 = S, fu = (lang, a, b) => { const r1 = S2.answer(a, ctx(lang)); const r2 = S2.answer(b, ctx(lang, { prev: r1.asked })); return [r2.asked, text(r2.html)]; };
let [asked, ans] = fu("en", "is 2015 a good year for red cote de nuits", "and 2013?");
check("a follow-up swaps the year: 'and 2013?'", /2013/.test(asked) && /Red Côte de Nuits 2013: \d+\/100/.test(ans), asked + " → " + ans.slice(0, 120));
[asked, ans] = fu("da", "hvor længe kan jeg lagre Barolo", "hvad med Barbaresco?");
check("…or the wine: 'hvad med Barbaresco?'", /barbaresco/.test(asked) && /^Barbaresco: typisk bedst/.test(ans), asked + " → " + ans.slice(0, 120));
[asked, ans] = fu("en", "is 2015 a good year for red cote de nuits", "what goes with lamb?");
check("…but a new question stays a new question", asked === "what goes with lamb?" && /With lamb/.test(ans), asked);
// the data: every producer, term and value tip in all four languages, every alias reachable
const WD = require("../sommelier-world.js");
check(`world data: ${WD.producers.length} producers, ${WD.terms.length} terms, ${Object.keys(WD.value).length} value tips, all in four languages`,
  [...WD.producers, ...WD.terms, ...Object.values(WD.value).map(text => ({ text }))].every(x => ["en", "da", "fr", "de"].every(l => String(x.text[l] || "").length > 20)));
const unreached = WD.producers.filter(pr => !S.findEntities(pr.n, window.BURG).some(e => e.type === "wproducer" && e.ref === pr)).map(pr => pr.n);
check("…and every producer is found by its own name", !unreached.length, unreached.join(", "));

const n = results.filter(Boolean).length;
console.log(`\n${n}/${results.length} passed`);
process.exit(n === results.length ? 0 : 1);
