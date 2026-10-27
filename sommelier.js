// The sommelier: answers wine questions from what the site already knows, without calling any AI service.
//   • "What grape is Sancerre?"  → wine-kb.js (appellations, grapes, regions)
//   • "Is 2005 a good year for red Côte de Nuits?" → the atlas's Burgundy chart (burgundy-vintages.js), or the
//     consensus charts in sommelier-data.js for other regions
//   • "What is Les Amoureuses?" "Who owns Musigny?" → the atlas (burgundy-data*.js)
//   • "What goes with lamb?" "How cold should I serve Chablis?" "Should I decant Barolo?" "What is a monopole?"
//   • about your own cellar: "What should I drink now?" "Where is my Rousseau?" "How many bottles of Burgundy?"
// It reads the question in English, Danish, French or German, whatever the page language, and answers in the
// page language.
//
//   SOMMELIER.answer(question, { lang, wines, burg, vint, burgI18n, readiness, window, notes }) → { html, chips }
(function (root) {
"use strict";
const node = typeof module !== "undefined" && module.exports;
const KB = node ? require("./wine-kb.js") : root.WINE_KB;
const D = node ? require("./sommelier-data.js") : root.SOMM_DATA;
const norm = KB.norm;
const L = ["en", "da", "fr", "de"];
const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ── what the sommelier says ──
const SAY = {
  hello: ["I'm the cellar's sommelier. I know grapes and appellations, Burgundy's vineyards and owners, vintages, serving and food — and your own cellar. Nothing you ask leaves this page.",
    "Jeg er kælderens sommelier. Jeg kender druer og appellationer, Bourgognes marker og ejere, årgange, servering og mad — og din egen kælder. Intet, du spørger om, forlader siden.",
    "Je suis le sommelier de la cave. Je connais cépages et appellations, les climats bourguignons et leurs propriétaires, les millésimes, le service et les accords — et votre cave. Rien de ce que vous demandez ne quitte cette page.",
    "Ich bin der Sommelier des Kellers. Ich kenne Rebsorten und Appellationen, Burgunds Lagen und Besitzer, Jahrgänge, Service und Speisen – und Ihren eigenen Keller. Nichts, was Sie fragen, verlässt diese Seite."],
  tryAsk: ["Try asking:", "Prøv at spørge:", "Essayez :", "Fragen Sie zum Beispiel:"],
  unknown: ["I don't know that one yet. I can answer about grapes, appellations, Burgundy vineyards, vintages, serving, food pairing and your cellar.",
    "Det kender jeg ikke endnu. Jeg kan svare om druer, appellationer, Bourgognes marker, årgange, servering, mad og vin — og din kælder.",
    "Je ne connais pas encore cela. Je peux répondre sur les cépages, les appellations, les climats de Bourgogne, les millésimes, le service, les accords et votre cave.",
    "Das weiß ich noch nicht. Ich kann Fragen zu Rebsorten, Appellationen, Burgunder Lagen, Jahrgängen, Service, Speisen und Ihrem Keller beantworten."],
  red: ["red", "rød", "rouge", "rot"], white: ["white", "hvid", "blanc", "weiß"], rose: ["rosé", "rosé", "rosé", "Rosé"],
  sparkling: ["sparkling", "mousserende", "effervescent", "Schaumwein"], sweet: ["sweet", "sød", "liquoreux", "süß"], fortified: ["fortified", "hedvin", "muté", "Likörwein"],
  appIs: ["<b>{0}</b> is an appellation in {1}.", "<b>{0}</b> er en appellation i {1}.", "<b>{0}</b> est une appellation de {1}.", "<b>{0}</b> ist eine Appellation in {1}."],
  madeFrom: ["{0}: {1}", "{0}: {1}", "{0} : {1}", "{0}: {1}"],
  grapeIs: ["<b>{0}</b> is a {1} grape from {2}.", "<b>{0}</b> er en {1} drue fra {2}.", "Le <b>{0}</b> est un cépage {1} originaire de {2}.", "<b>{0}</b> ist eine {1} Rebsorte aus {2}."],
  grapeIsNoHome: ["<b>{0}</b> is a {1} grape.", "<b>{0}</b> er en {1} drue.", "Le <b>{0}</b> est un cépage {1}.", "<b>{0}</b> ist eine {1} Rebsorte."],
  redG: ["red", "blå", "noir", "rote"], whiteG: ["white", "grøn", "blanc", "weiße"],
  style: ["Style: {0}.", "Stil: {0}.", "Style : {0}.", "Stil: {0}."],
  aromas: ["Typical aromas: {0}.", "Typiske aromaer: {0}.", "Arômes typiques : {0}.", "Typische Aromen: {0}."],
  alsoCalled: ["Also on labels as {0}.", "Står også på etiketter som {0}.", "Aussi appelé {0} sur les étiquettes.", "Auf Etiketten auch {0}."],
  grownIn: ["Look for it in {0}.", "Find den i {0}.", "On le trouve en {0}.", "Zu finden in {0}."],
  body: [["light-bodied", "medium-bodied", "full-bodied"], ["let", "mellemfyldig", "fyldig"], ["léger", "moyennement corsé", "corsé"], ["leicht", "mittelkräftig", "kräftig"]],
  acid: [["soft acidity", "medium acidity", "high acidity"], ["blød syre", "middel syre", "høj syre"], ["acidité douce", "acidité moyenne", "acidité vive"], ["milde Säure", "mittlere Säure", "hohe Säure"]],
  tannin: [["", "light tannins", "medium tannins", "firm tannins"], ["", "lette tanniner", "middel tanniner", "faste tanniner"], ["", "tanins légers", "tanins moyens", "tanins fermes"], ["", "leichte Tannine", "mittlere Tannine", "feste Tannine"]],
  regionIs: ["<b>{0}</b> is a wine region in {1}.", "<b>{0}</b> er et vinområde i {1}.", "<b>{0}</b> est une région viticole de {1}.", "<b>{0}</b> ist ein Weinbaugebiet in {1}."],
  mainApps: ["Main appellations: {0}.", "Vigtigste appellationer: {0}.", "Principales appellations : {0}.", "Wichtigste Appellationen: {0}."],
  mainGrapes: ["Main grapes: {0}.", "Vigtigste druer: {0}.", "Principaux cépages : {0}.", "Wichtigste Rebsorten: {0}."],
  inCellar: ["In your cellar: {0}.", "I din kælder: {0}.", "Dans votre cave : {0}.", "In Ihrem Keller: {0}."],
  bottles: ["{0} bottles", "{0} flasker", "{0} bouteilles", "{0} Flaschen"], bottle1: ["1 bottle", "1 flaske", "1 bouteille", "1 Flasche"],
  wines: ["{0} wines", "{0} vine", "{0} vins", "{0} Weine"], wine1: ["1 wine", "1 vin", "1 vin", "1 Wein"],
  gc: ["grand cru", "grand cru", "grand cru", "Grand Cru"], pc: ["premier cru", "premier cru", "premier cru", "Premier Cru"], vc: ["village climat", "village-climat", "climat de village", "Village-Climat"],
  climatIs: ["<b>{0}</b> is a {1} in {2}, {3} ha.", "<b>{0}</b> er en {1} i {2}, {3} ha.", "<b>{0}</b> est un {1} de {2}, {3} ha.", "<b>{0}</b> ist ein {1} in {2}, {3} ha."],
  climatMany: ["Several vineyards are called <b>{0}</b>:", "Flere marker hedder <b>{0}</b>:", "Plusieurs climats s'appellent <b>{0}</b> :", "Mehrere Lagen heißen <b>{0}</b>:"],
  owners: ["Largest listed owners: {0}.", "Største ejere på listen: {0}.", "Principaux propriétaires listés : {0}.", "Größte aufgeführte Besitzer: {0}."],
  monopole: ["A monopole of {0}.", "En monopole tilhørende {0}.", "Un monopole de {0}.", "Ein Monopol von {0}."],
  openAtlas: ["Open it in the atlas ↗", "Åbn i atlasset ↗", "Ouvrir dans l'atlas ↗", "Im Atlas öffnen ↗"],
  producerIs: ["<b>{0}</b>", "<b>{0}</b>", "<b>{0}</b>", "<b>{0}</b>"],
  holdings: ["Holdings on the atlas: {0}.", "Besiddelser i atlasset: {0}.", "Parcelles dans l'atlas : {0}.", "Besitz im Atlas: {0}."],
  vintBurg: ["<b>{0} {1}</b>: {2}/100 — {3}.", "<b>{0} {1}</b>: {2}/100 — {3}.", "<b>{0} {1}</b> : {2}/100 — {3}.", "<b>{0} {1}</b>: {2}/100 – {3}."],
  vintStars: ["<b>{0} {1}</b>: {2} — {3}.", "<b>{0} {1}</b>: {2} — {3}.", "<b>{0} {1}</b> : {2} — {3}.", "<b>{0} {1}</b>: {2} – {3}."],
  drinking: ["Drinking: {0}.", "Drikkes: {0}.", "À boire : {0}.", "Trinkreife: {0}."],
  basis: ["AllWine's consensus of {0} published charts{1}.", "AllWines konsensus af {0} offentliggjorte årgangstabeller{1}.", "Consensus AllWine de {0} tableaux publiés{1}.", "AllWines Konsens aus {0} veröffentlichten Jahrgangstabellen{1}."],
  estimate: [" (an estimate)", " (et skøn)", " (une estimation)", " (eine Schätzung)"],
  roughChart: ["A rough consensus of the published charts (1–5 stars) — a guide to the year, not to every bottle.", "En grov konsensus af de offentliggjorte årgangstabeller (1–5 stjerner) — en guide til året, ikke til hver flaske.", "Un consensus approximatif des tableaux publiés (1 à 5 étoiles) — un guide de l'année, pas de chaque bouteille.", "Ein grober Konsens der veröffentlichten Tabellen (1–5 Sterne) – ein Hinweis auf das Jahr, nicht auf jede Flasche."],
  notRated: ["I have no rating for {0} {1}.", "Jeg har ingen vurdering af {0} {1}.", "Je n'ai pas de note pour {0} {1}.", "Für {0} {1} habe ich keine Bewertung."],
  notDeclared: ["{0} was not a general declaration year for Vintage Port.", "{0} var ikke et generelt deklareret år for vintage port.", "{0} n'a pas été une année de déclaration générale pour le Porto Vintage.", "{0} war kein allgemeines Deklarationsjahr für Vintage Port."],
  yearSummary: ["<b>{0}</b> around the wine world:", "<b>{0}</b> rundt i vinverdenen:", "<b>{0}</b> dans le monde du vin :", "<b>{0}</b> in der Weinwelt:"],
  q5: ["outstanding", "fremragende", "exceptionnel", "herausragend"], q4: ["very good", "meget god", "très bon", "sehr gut"], q3: ["good", "god", "bon", "gut"],
  q2: ["mixed", "svingende", "irrégulier", "durchwachsen"], q1: ["poor", "svag", "faible", "schwach"],
  b96: ["outstanding", "fremragende", "exceptionnel", "herausragend"], b92: ["excellent", "fremragende", "excellent", "ausgezeichnet"], b88: ["very good", "meget god", "très bon", "sehr gut"],
  b84: ["good", "god", "bon", "gut"], b80: ["mixed", "svingende", "irrégulier", "durchwachsen"], b0: ["weak", "svag", "faible", "schwach"],
  nuitsRed: ["red Côte de Nuits", "rød Côte de Nuits", "Côte de Nuits rouge", "rote Côte de Nuits"], beauneRed: ["red Côte de Beaune", "rød Côte de Beaune", "Côte de Beaune rouge", "rote Côte de Beaune"],
  beauneWhite: ["white Côte de Beaune", "hvid Côte de Beaune", "Côte de Beaune blanc", "weiße Côte de Beaune"],
  nuitsWhiteNote: ["The chart rates the Côte de Nuits for red only — its few whites follow the Côte de Beaune whites closely.", "Tabellen vurderer kun Côte de Nuits for rødvin — de få hvidvine følger Côte de Beaunes hvide tæt.", "Le tableau ne note la Côte de Nuits qu'en rouge — ses rares blancs suivent de près ceux de la Côte de Beaune.", "Die Tabelle bewertet die Côte de Nuits nur für Rotwein – ihre wenigen Weißen folgen eng den Weißen der Côte de Beaune."],
  yourWines: ["Your {0} wines from {1}: {2}.", "Dine {0}-vine fra {1}: {2}.", "Vos vins de {0} en {1} : {2}.", "Ihre Weine aus {0}, Jahrgang {1}: {2}."],
  serveTitle: ["Serving temperatures:", "Serveringstemperaturer:", "Températures de service :", "Trinktemperaturen:"],
  serveFor: ["Serve {0} at <b>{1}</b> ({2}).", "Servér {0} ved <b>{1}</b> ({2}).", "Servez {0} à <b>{1}</b> ({2}).", "{0} bei <b>{1}</b> servieren ({2})."],
  serveTip: ["A bottle warms about 1–2 °C every 10 minutes in a warm room; better slightly too cold than too warm.", "En flaske bliver ca. 1–2 °C varmere hvert 10. minut i en varm stue; hellere lidt for kold end for varm.", "Une bouteille se réchauffe de 1 à 2 °C toutes les 10 minutes dans une pièce chaude ; mieux vaut un peu trop frais que trop chaud.", "Eine Flasche erwärmt sich im warmen Raum um etwa 1–2 °C alle 10 Minuten; lieber etwas zu kalt als zu warm."],
  decantYoung: ["Young, firm reds ({0}) open up with 1–3 hours in a decanter.", "Unge, faste rødvine ({0}) åbner sig med 1–3 timer i karaffel.", "Les rouges jeunes et fermes ({0}) s'ouvrent après 1 à 3 heures en carafe.", "Junge, feste Rote ({0}) öffnen sich mit 1–3 Stunden in der Karaffe."],
  decantPinot: ["Pinot Noir and red Burgundy rarely need it: at most a short decant for a young, closed bottle — pour carefully instead.", "Pinot Noir og rød Bourgogne har sjældent brug for det: højst en kort tur i karaffel for en ung, lukket flaske — skænk hellere forsigtigt.", "Le Pinot Noir et le bourgogne rouge en ont rarement besoin : au plus une courte aération pour une bouteille jeune et fermée — versez plutôt avec soin.", "Pinot Noir und roter Burgunder brauchen es selten: höchstens kurz für eine junge, verschlossene Flasche – lieber vorsichtig einschenken."],
  decantOld: ["Old bottles (20+ years): stand the bottle upright a day ahead, decant just before serving to leave the sediment behind, and drink soon — the fragile aromas fade.", "Gamle flasker (20+ år): stil flasken op en dag i forvejen, dekantér lige før servering for at efterlade bundfaldet, og drik den snart — de skrøbelige aromaer forsvinder.", "Vieilles bouteilles (20 ans et plus) : redressez la bouteille la veille, décantez juste avant de servir pour laisser le dépôt, et buvez vite — les arômes fragiles s'estompent.", "Alte Flaschen (20+ Jahre): einen Tag vorher aufrecht stellen, kurz vor dem Servieren dekantieren, um das Depot zurückzulassen, und bald trinken – die zarten Aromen verfliegen."],
  decantPort: ["Vintage Port and unfiltered wines throw a heavy sediment: always decant.", "Vintage port og ufiltrerede vine har meget bundfald: dekantér altid.", "Le Porto Vintage et les vins non filtrés ont un dépôt important : toujours décanter.", "Vintage Port und unfiltrierte Weine haben viel Depot: immer dekantieren."],
  decantWhite: ["Whites seldom need it, though a young, tight white Burgundy or Chenin can gain from 30 minutes.", "Hvidvin har sjældent brug for det, men en ung, stram hvid Bourgogne eller Chenin kan vinde ved 30 minutter.", "Les blancs en ont rarement besoin, mais un jeune bourgogne blanc ou un Chenin serré peut gagner 30 minutes d'aération.", "Weißweine brauchen es selten, aber ein junger, straffer weißer Burgunder oder Chenin kann von 30 Minuten profitieren."],
  storage: ["Keep wine at a steady 10–14 °C, 60–75 % humidity, dark and still, bottles with corks lying down. Steadiness matters more than the exact degree.", "Opbevar vin ved stabile 10–14 °C, 60–75 % luftfugtighed, mørkt og roligt, flasker med prop liggende. Stabilitet betyder mere end den præcise grad.", "Gardez le vin à 10–14 °C constants, 60–75 % d'humidité, dans le noir et sans vibrations, les bouteilles bouchées couchées. La stabilité compte plus que le degré exact.", "Wein bei gleichmäßigen 10–14 °C, 60–75 % Luftfeuchte, dunkel und ruhig lagern, Flaschen mit Korken liegend. Gleichmäßigkeit zählt mehr als das genaue Grad."],
  opened: ["After opening, with the cork back in and in the fridge: sparkling 1–3 days (with a stopper), whites and rosé 3–5 days, reds 3–5 days (take them out an hour before), sweet wines about a week, Port and sherry: fino 2–3 days, tawny and oloroso several weeks.", "Efter åbning, med proppen i og i køleskabet: mousserende 1–3 dage (med champagneprop), hvidvin og rosé 3–5 dage, rødvin 3–5 dage (tag den ud en time før), søde vine omkring en uge, portvin og sherry: fino 2–3 dage, tawny og oloroso flere uger.", "Après ouverture, rebouché et au réfrigérateur : effervescents 1 à 3 jours (avec un bouchon adapté), blancs et rosés 3 à 5 jours, rouges 3 à 5 jours (sortez-les une heure avant), liquoreux environ une semaine ; fino 2 à 3 jours, tawny et oloroso plusieurs semaines.", "Nach dem Öffnen, verschlossen im Kühlschrank: Schaumwein 1–3 Tage (mit Verschluss), Weiß und Rosé 3–5 Tage, Rot 3–5 Tage (eine Stunde vorher herausnehmen), Süßwein etwa eine Woche; Fino 2–3 Tage, Tawny und Oloroso mehrere Wochen."],
  pairFor: ["With {0}: {1}.", "Til {0}: {1}.", "Avec {0} : {1}.", "Zu {0}: {1}."],
  pairCellar: ["From your cellar, ready now:", "Fra din kælder, klar nu:", "De votre cave, prêt à boire :", "Aus Ihrem Keller, jetzt trinkreif:"],
  pairCellarAny: ["From your cellar:", "Fra din kælder:", "De votre cave :", "Aus Ihrem Keller:"],
  pairWhich: ["Which dish? I know beef, lamb, game, duck, roast pork, chicken, fish, salmon, shellfish, sushi, spicy food, pasta, mushrooms, cheese, blue cheese, desserts and Christmas dinner.", "Hvilken ret? Jeg kender oksekød, lam, vildt, and, flæskesteg, kylling, fisk, laks, skaldyr, sushi, stærk mad, pasta, svampe, ost, blåskimmelost, dessert og julemiddag.", "Quel plat ? Je connais le bœuf, l'agneau, le gibier, le canard, le porc, le poulet, le poisson, le saumon, les fruits de mer, les sushis, l'épicé, les pâtes, les champignons, le fromage, le bleu, les desserts et Noël.", "Welches Gericht? Ich kenne Rind, Lamm, Wild, Ente, Schweinebraten, Huhn, Fisch, Lachs, Meeresfrüchte, Sushi, Scharfes, Pasta, Pilze, Käse, Blauschimmelkäse, Desserts und das Weihnachtsessen."],
  drinkNow: ["Ready to drink from your cellar ({0}):", "Klar til at drikke fra din kælder ({0}):", "Prêts à boire dans votre cave ({0}) :", "Jetzt trinkreif aus Ihrem Keller ({0}):"],
  pastPeak: ["past its window", "forbi vinduet", "après sa fenêtre", "über dem Fenster"], soon: ["drink soon", "drik snart", "à boire bientôt", "bald trinken"],
  nothingReady: ["Nothing is in its drinking window right now. The next to open: {0}.", "Intet er i sit drikkevindue lige nu. De næste at åbne: {0}.", "Rien n'est dans sa fenêtre en ce moment. Les prochains à ouvrir : {0}.", "Gerade ist nichts im Trinkfenster. Als Nächstes: {0}."],
  fromYear: ["from {0}", "fra {0}", "à partir de {0}", "ab {0}"],
  count: ["You have <b>{0}</b> ({1}){2}.", "Du har <b>{0}</b> ({1}){2}.", "Vous avez <b>{0}</b> ({1}){2}.", "Sie haben <b>{0}</b> ({1}){2}."],
  countOf: [" — {0}", " — {0}", " — {0}", " – {0}"],
  byStyle: ["By style: {0}.", "Fordelt på stil: {0}.", "Par style : {0}.", "Nach Stil: {0}."],
  where: ["Here's where they are:", "Her er de:", "Voici où ils sont :", "Hier liegen sie:"],
  noLoc: ["no location set", "ingen placering", "pas d'emplacement", "kein Lagerort"],
  haveYes: ["Yes — {0}:", "Ja — {0}:", "Oui — {0} :", "Ja – {0}:"],
  haveNo: ["No, I can't find {0} in your cellar.", "Nej, jeg kan ikke finde {0} i din kælder.", "Non, je ne trouve pas {0} dans votre cave.", "Nein, {0} finde ich in Ihrem Keller nicht."],
  noCellar: ["Log in to your cellar and I can answer about your own bottles.", "Log ind i din kælder, så kan jeg svare om dine egne flasker.", "Connectez-vous à votre cave et je pourrai parler de vos bouteilles.", "Melden Sie sich in Ihrem Keller an, dann kann ich über Ihre Flaschen sprechen."],
  emptyCellar: ["Your cellar is empty so far.", "Din kælder er tom indtil videre.", "Votre cave est vide pour l'instant.", "Ihr Keller ist noch leer."],
  priciest: ["Your most expensive bottles:", "Dine dyreste flasker:", "Vos bouteilles les plus chères :", "Ihre teuersten Flaschen:"],
  oldest: ["Your oldest vintages:", "Dine ældste årgange:", "Vos plus vieux millésimes :", "Ihre ältesten Jahrgänge:"],
  worth: ["Your cellar holds {0} bottles; at what you paid that is {1}{2}.", "Din kælder rummer {0} flasker; til købsprisen er det {1}{2}.", "Votre cave compte {0} bouteilles ; au prix d'achat, cela fait {1}{2}.", "Ihr Keller hat {0} Flaschen; zum Kaufpreis sind das {1}{2}."],
  ageFor: ["<b>{0}</b>: typically at its best <b>{1}–{2} years</b> after the vintage.", "<b>{0}</b>: typisk bedst <b>{1}–{2} år</b> efter høståret.", "<b>{0}</b> : en général à son meilleur <b>{1} à {2} ans</b> après le millésime.", "<b>{0}</b>: typischerweise <b>{1}–{2} Jahre</b> nach dem Jahrgang am besten."],
  ageYoung: ["<b>{0}</b>: best young, within <b>{1} years</b> of the vintage.", "<b>{0}</b>: bedst ung, inden for <b>{1} år</b> efter høståret.", "<b>{0}</b> : meilleur jeune, dans les <b>{1} ans</b> qui suivent le millésime.", "<b>{0}</b>: am besten jung, binnen <b>{1} Jahren</b> nach dem Jahrgang."],
  ageYear: ["A {0} would be at its best about <b>{1}–{2}</b>.", "En {0}'er er bedst omkring <b>{1}–{2}</b>.", "Un {0} serait à son meilleur vers <b>{1}–{2}</b>.", "Ein {0}er ist etwa <b>{1}–{2}</b> am besten."],
  ageTip: ["That is a typical good bottle: the best producers and years keep longer, and whether you like young fruit or mature flavours matters as much.", "Det gælder en typisk god flaske: de bedste producenter og år holder længere, og om du kan lide ung frugt eller modne smage betyder lige så meget.", "C'est vrai d'une bonne bouteille typique : les meilleurs domaines et millésimes vont plus loin, et votre goût pour le fruit jeune ou les arômes évolués compte autant.", "Das gilt für eine typische gute Flasche: die besten Erzeuger und Jahre halten länger, und ob Sie junge Frucht oder gereifte Aromen mögen, zählt ebenso."],
  ageTiers: ["Burgundy keeps by level: regional wines 2–6 years, village 4–12 (whites 3–10), premier cru 7–20 (5–15), grand cru 10–30 (8–20).", "Bourgogne holder efter niveau: regionale vine 2–6 år, landsby 4–12 (hvide 3–10), premier cru 7–20 (5–15), grand cru 10–30 (8–20).", "La Bourgogne se garde selon le niveau : régionales 2 à 6 ans, villages 4 à 12 (blancs 3 à 10), premiers crus 7 à 20 (5 à 15), grands crus 10 à 30 (8 à 20).", "Burgund hält je nach Stufe: regionale Weine 2–6 Jahre, Village 4–12 (Weiße 3–10), Premier Cru 7–20 (5–15), Grand Cru 10–30 (8–20)."],
  ageYours: ["Your bottles and their drink windows:", "Dine flasker og deres drikkevinduer:", "Vos bouteilles et leurs fenêtres de dégustation :", "Ihre Flaschen und ihre Trinkfenster:"],
  ageWhich: ["Which wine? Name an appellation, a grape or one of your bottles — for example \"How long can I keep Barolo?\"", "Hvilken vin? Nævn en appellation, en drue eller en af dine flasker — fx \"Hvor længe kan jeg lagre Barolo?\"", "Quel vin ? Citez une appellation, un cépage ou une de vos bouteilles — par exemple « Combien de temps garder un Barolo ? »", "Welcher Wein? Nennen Sie eine Appellation, eine Rebsorte oder eine Ihrer Flaschen – etwa „Wie lange kann ich Barolo lagern?“"],
  keeps: ["Keeps: typically {0}–{1} years.", "Holdbarhed: typisk {0}–{1} år.", "Garde : en général {0} à {1} ans.", "Lagerfähig: typischerweise {0}–{1} Jahre."],
  bestFor: ["The best vintages for {0}:", "De bedste årgange for {0}:", "Les meilleurs millésimes pour {0} :", "Die besten Jahrgänge für {0}:"],
  windowTo: ["drink {0}–{1}", "drik {0}–{1}", "à boire {0}–{1}", "trinken {0}–{1}"],
  worthNow: [", and {0} at the values you've set", ", og {0} efter de værdier, du har sat", ", et {0} selon les valeurs que vous avez indiquées", ", und {0} nach den von Ihnen gesetzten Werten"],
  recCellar: ["From your own cellar, ready to drink:", "Fra din egen kælder, klar til at drikke:", "De votre propre cave, prêts à boire :", "Aus Ihrem eigenen Keller, trinkreif:"],
  recBuy: ["Worth buying{0}:", "Værd at købe{0}:", "À acheter{0} :", "Kaufenswert{0}:"],
  recUpTo: [" for up to {0} a bottle", " til højst {0} flasken", " jusqu'à {0} la bouteille", " bis {0} pro Flasche"],
  recOne: ["For {0} I'd buy one great bottle:", "For {0} ville jeg købe én stor flaske:", "Avec {0}, j'achèterais une grande bouteille :", "Für {0} würde ich eine große Flasche kaufen:"],
  recSix: ["Or make it six bottles at about {0} each:", "Eller gør det til seks flasker til ca. {0} stykket:", "Ou six bouteilles à environ {0} chacune :", "Oder sechs Flaschen zu je etwa {0}:"],
  recTaste: ["You drink a lot of {0}, so I started there.", "Du drikker meget {0}, så jeg startede der.", "Vous buvez beaucoup de {0}, j'ai donc commencé par là.", "Sie trinken viel {0}, also habe ich dort angefangen."],
  recNone: ["I have no picks for that yet. Try a region (Burgundy, Barolo, Champagne, Rioja, Mosel …), a grape or a budget.", "Jeg har ingen forslag til det endnu. Prøv et område (Bourgogne, Barolo, Champagne, Rioja, Mosel …), en drue eller et budget.", "Je n'ai pas encore de suggestion pour cela. Essayez une région (Bourgogne, Barolo, Champagne, Rioja, Moselle …), un cépage ou un budget.", "Dafür habe ich noch keine Empfehlung. Versuchen Sie eine Region (Burgund, Barolo, Champagne, Rioja, Mosel …), eine Rebsorte oder ein Budget."],
  recPrices: ["Rough shop prices for a recent vintage; older vintages and magnums cost more, and prices move.", "Cirka butikspriser for en nyere årgang; ældre årgange og magnummer koster mere, og priserne flytter sig.", "Prix indicatifs en boutique pour un millésime récent ; les vieux millésimes et les magnums coûtent plus, et les prix bougent.", "Ungefähre Ladenpreise für einen jüngeren Jahrgang; ältere Jahrgänge und Magnums kosten mehr, und Preise ändern sich."],
  prefPick: ["If I had to choose: <b>{0}</b>.", "Hvis jeg skulle vælge: <b>{0}</b>.", "S'il fallait choisir : <b>{0}</b>.", "Wenn ich wählen müsste: <b>{0}</b>."],
  prefDeeper: ["It has more depth, and it keeps far longer.", "Den har mere dybde, og den holder meget længere.", "Il a plus de profondeur et se garde bien plus longtemps.", "Er hat mehr Tiefe und hält viel länger."],
  prefClose: ["A close call: both are among the world's great wines. Your cellar tips it.", "Tæt løb: begge hører til verdens store vine. Din kælder afgør det.", "Match serré : tous deux comptent parmi les grands vins du monde. Votre cave fait pencher la balance.", "Knappe Sache: beide gehören zu den großen Weinen der Welt. Ihr Keller gibt den Ausschlag."],
  prefCloseNo: ["A close call: both are among the world's great wines.", "Tæt løb: begge hører til verdens store vine.", "Match serré : tous deux comptent parmi les grands vins du monde.", "Knappe Sache: beide gehören zu den großen Weinen der Welt."],
  prefOther: ["{0} has its moments too: {1}", "{0} har også sine øjeblikke: {1}", "{0} a aussi ses moments : {1}", "Auch {0} hat seine Momente: {1}"],
  prefKeeps: ["keeps {0}–{1} years", "holder {0}–{1} år", "se garde {0} à {1} ans", "hält {0}–{1} Jahre"],
  prefPrice: ["about {0}–{1} a bottle", "ca. {0}–{1} flasken", "environ {0} à {1} la bouteille", "etwa {0}–{1} pro Flasche"],
  prefYours: ["In your cellar: {0}.", "I din kælder: {0}.", "Dans votre cave : {0}.", "In Ihrem Keller: {0}."],
  prefTaste: ["In the end it's your glass: taste them side by side.", "I sidste ende er det dit glas: smag dem side om side.", "Au fond, c'est votre verre : goûtez-les côte à côte.", "Am Ende ist es Ihr Glas: probieren Sie sie nebeneinander."],
  prefOne: ["Name two and I'll pick one — for example \"Barolo or Barbaresco?\"", "Nævn to, så vælger jeg — fx \"Barolo eller Barbaresco?\"", "Citez-en deux et je choisis — par exemple « Barolo ou Barbaresco ? »", "Nennen Sie zwei, und ich wähle – etwa „Barolo oder Barbaresco?“"],
};
const say = (lang, key, ...a) => { const v = SAY[key]; const s = v ? (v[Math.max(0, L.indexOf(lang))] || v[0]) : key;
  return String(s).replace(/\{(\d)\}/g, (m, i) => a[i] == null ? "" : a[i]).replace(/\.\.$/, "."); };
const sayArr = (lang, key) => SAY[key][Math.max(0, L.indexOf(lang))];
const cap = s => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const kr = n => Math.round(n).toLocaleString("da-DK") + " kr.";

// ── words that tell what is asked (normalised; any of the four languages) ──
const W = {
  vintage: ["vintage", "vintages", "good year", "great year", "bad year", "argang", "argange", "godt ar", "gode ar", "millesime", "millesimes", "annee", "bonne annee", "jahrgang", "jahrgange", "gutes jahr", "how was", "hvordan var", "comment etait", "wie war"],
  temp: ["temperature", "temp", "serve", "serving", "servere", "servering", "serveringstemperatur", "temperatur", "servir", "service", "servieren", "trinktemperatur", "how cold", "how warm", "hvor kold", "hvor varm", "chill", "kold", "kolde"],
  decant: ["decant", "decanting", "decanter", "dekanter", "dekantere", "dekantering", "karaffel", "carafe", "carafer", "decanter", "dekantieren", "karaffe", "breathe", "lufte", "aerate", "aerer", "aerer"],
  storage: ["store", "storing", "storage", "cellar temperature", "opbevar", "opbevare", "opbevaring", "conserver", "conservation", "stocker", "lagern", "lagerung", "aufbewahren", "humidity", "luftfugtighed", "humidite", "luftfeuchtigkeit"],
  opened: ["opened", "open bottle", "after opening", "keep after", "abnet", "abnede", "efter abning", "ouverte", "ouvert", "entamee", "geoffnet", "angebrochen", "nach dem offnen", "how long does", "how long will", "hvor laenge", "combien de temps", "wie lange"],
  pair: ["goes with", "go with", "goes well", "go well", "well with", "what wine with", "wine with", "vin til", "vin avec", "wein zu", "pair", "pairing", "match with", "with dinner", "eat with", "drink with", "serve with", "passer til", "passer med", "til maden", "drikke til", "avec", "accord", "accorder", "accompagner", "passt zu", "passen zu", "dazu", "zum essen", "trinken zu"],
  drinkNow: ["drink now", "tonight", "this evening", "ce soir", "ready", "drinkable", "ready to drink", "open tonight", "should i open", "should i drink", "what to drink", "what to open", "drikke nu", "drikkeklar", "drikkeklare", "klar til", "skal jeg abne", "skal jeg drikke", "i aften", "a boire", "pret a boire", "que boire", "quoi ouvrir", "ouvrir ce soir", "trinkreif", "jetzt trinken", "soll ich offnen", "soll ich trinken", "heute abend"],
  howMany: ["how many", "how much", "hvor mange", "hvor meget", "combien", "wie viele", "wie viel", "number of", "antal", "count"],
  where: ["where is", "where are", "where s", "wheres", "hvor er", "hvor star", "hvor ligger", "ou est", "ou sont", "wo ist", "wo sind", "wo liegt", "wo liegen", "wo steht", "find my", "find min", "find mine"],
  have: ["do i have", "have i got", "have i", "har jeg", "ai je", "est ce que j ai", "habe ich", "hab ich"],
  pricey: ["most expensive", "priciest", "dyreste", "plus cher", "plus chers", "plus chere", "teuerste", "teuersten"],
  oldest: ["oldest", "aeldste", "plus vieux", "plus vieille", "alteste", "altesten"],
  worth: ["worth", "value of my", "vaerdi", "vaerd", "valeur", "wert", "what is my cellar"],
  help: ["help", "hjaelp", "aide", "hilfe", "hello", "hi", "hej", "bonjour", "hallo", "what can you", "hvad kan du", "que sais tu", "que peux tu", "was kannst du"],
  my: ["my", "mine", "min", "mit", "mine", "mon", "ma", "mes", "mein", "meine", "meinen", "i have", "jeg har", "j ai", "ich habe", "cellar", "kaelder", "cave", "keller"],
  red: ["red", "reds", "rod", "rode", "rodvin", "rouge", "rouges", "rot", "rote", "roten", "rotwein", "rosso", "tinto"],
  white: ["white", "whites", "hvid", "hvide", "hvidvin", "blanc", "blancs", "weiss", "weisse", "weissen", "weisswein", "bianco", "blanco"],
  sparkling: ["sparkling", "bubbles", "mousserende", "bobler", "effervescent", "petillant", "schaumwein", "sekt", "champagne"],
  rose: ["rose", "rosé", "rosevin"],
  sweet: ["sweet", "dessert wine", "sod", "sode", "dessertvin", "liquoreux", "moelleux", "suss", "susswein"],
  oldW: ["old", "aged", "mature", "gammel", "gamle", "moden", "vieux", "vieille", "alt", "alte", "gereift"],
  age: ["how long can i keep", "how long should i keep", "how long to keep", "how long will it keep", "how long can i age", "how long to age", "how long can it age", "how long can you keep",
    "how long does it keep", "how long can", "how long should", "how long to", "keep for", "age for", "ageing potential", "aging potential", "ageing", "aging", "ageworthy", "age worthy", "cellar for", "can i cellar", "when to drink",
    "when should i drink", "when should i open", "lagre", "lagres", "lagring", "lagringspotentiale", "holdbar", "holdbarhed", "hvor laenge kan", "hvor laenge skal", "hvor laenge holder", "hvornar skal jeg drikke",
    "hvornar skal jeg abne", "potentiel de garde", "garde", "garder", "vieillir", "vieillissement", "combien de temps garder", "combien de temps se garde", "quand boire", "quand ouvrir",
    "lagern", "lagerfahig", "lagerpotenzial", "lagerfahigkeit", "wie lange lagern", "wie lange halt", "wie lange kann", "reifepotenzial", "wann trinken", "wann offnen"],
  openedStrong: ["opened", "open bottle", "after opening", "once open", "abnet", "abnede", "abnede flaske", "efter abning", "ouverte", "ouvert", "entamee", "entame", "geoffnet", "geoffnete", "geoffneter", "geoffneten",
    "angebrochen", "angebrochene", "angebrochener", "nach dem offnen"],
  best: ["best vintage", "best vintages", "best year", "best years", "greatest vintages", "great vintages", "top vintages", "good vintages", "best recent vintages", "bedste argang", "bedste argange", "bedste ar",
    "gode argange", "store argange", "meilleur millesime", "meilleurs millesimes", "meilleures annees", "grands millesimes", "beste jahrgang", "beste jahrgange", "beste jahre", "gute jahrgange", "grosse jahrgange"],
  compare: ["difference", "differences", "vs", "versus", "compare", "compared", "comparison", "forskel", "forskellen", "forskellene", "sammenlign", "sammenligne", "comparer", "comparaison",
    "unterschied", "unterschiede", "vergleich", "vergleichen"],
  recommend: ["recommend", "recommendation", "recommendations", "suggest", "suggestion", "suggestions", "which wine should", "what wine should", "would you buy", "should i buy", "what to buy", "worth buying", "buy", "buying",
    "give me a wine", "a good wine", "a nice wine", "pick a wine", "pick me", "anbefal", "anbefale", "anbefaling", "anbefalinger", "foresla", "forslag", "hvilken vin skal", "hvad skal jeg kobe", "kobe", "kob",
    "en god vin", "recommande", "recommander", "conseille", "conseiller", "conseil", "suggere", "acheter", "quel vin acheter", "un bon vin", "empfehlen", "empfiehl", "empfehlung", "vorschlag", "kaufen",
    "welchen wein", "einen guten wein"],
  prefer: ["prefer", "do you like", "which is better", "what is better", "whats better", "better", "favourite", "favorite", "which one would you", "would you rather", "foretraekker", "kan du bedst lide",
    "hvad er bedst", "hvilken er bedst", "bedre", "yndlings", "prefere", "preferes", "preferez", "prefereriez", "mieux", "lequel", "laquelle", "lieber", "bevorzugst", "bevorzugen", "besser", "liebsten", "welcher ist"],
  soil: ["soil", "soils", "geology", "jord", "jordbund", "jordbunden", "jordtype", "jordtyper", "sol", "sols", "geologie", "terre", "terres", "boden", "boeden", "untergrund"],
};
const hasW = (t, key) => W[key].some(p => (" " + t + " ").includes(" " + p + " "));

// ── an index of everything that can be named ──
let IDX = null, IDX_FOR = null;
const NOMATCH = new Set(["langhe", "rolle", "steen", "melon", "breton", "bouchet", "cot", "morillon", "favorita", "pigato", "listan", "mansois", "jaen", "calabrese", "auxerrois", "naturé", "nature", "meunier", "macabeu", "malvoisie", "sercial", "boal", "bual",
  "port", "porto", "sherry", "asti", "toro", "etna", "cava", "nahe", "ahr", "wien", "graves", "baden", "franken", "jura", "corse", "marche", "puglia", "vaud", "washington", "oregon", "santorini", "madeira", "navarra", "alsace", "loire", "champagne", "beaujolais", "bordeaux", "bourgogne", "chablis", "rioja", "mosel", "douro", "barolo", "napa"]);
// "Danish white", "dansk hvidvin", "vin danois": a country by its adjective
const ADJ = { Danmark: ["danish", "dansk", "danske", "danois", "danoise", "danish wine", "danischer", "danisch", "danische"],
  Frankrig: ["french", "fransk", "franske", "francais", "francaise", "franzosisch", "franzosischer", "franzosische"],
  Italien: ["italian", "italiensk", "italienske", "italien", "italienne", "italienisch", "italienischer", "italienische"],
  Spanien: ["spanish", "spansk", "spanske", "espagnol", "espagnole", "spanisch", "spanischer", "spanische"],
  Tyskland: ["german", "tysk", "tyske", "allemand", "allemande", "deutsch", "deutscher", "deutsche"],
  Portugal: ["portuguese", "portugisisk", "portugisiske", "portugais", "portugaise", "portugiesisch", "portugiesischer"],
  "Østrig": ["austrian", "ostrigsk", "ostrigske", "autrichien", "autrichienne", "osterreichisch", "osterreichischer"],
  England: ["english", "engelsk", "engelske", "anglais", "anglaise", "englisch", "englischer"] };
function buildIndex(burg) {
  const entries = [];
  const add = (name, type, ref, opts) => { const k = norm(name); if (!k || k.length < 3) return; entries.push({ k, n: k.split(" ").length, type, ref, fuzzy: !(opts && opts.exact) && !NOMATCH.has(k) && k.length >= 6 }); };
  KB.apps.forEach(a => add(a.n, "app", a));
  KB.grapes.forEach(g => { add(g.n, "grape", g); g.syn.forEach(s => add(s, "grape", g, { exact: NOMATCH.has(norm(s)) })); });
  KB.regions.forEach(r => { add(r.n, "region", r); Object.values(r.names).forEach(x => add(x, "region", r)); r.alias.forEach(x => add(x, "region", r)); });
  KB.countries.forEach(c => { Object.values(c.names).forEach(x => add(x, "country", c, { exact: true })); c.alias.forEach(x => add(x, "country", c, { exact: true }));
    (ADJ[c.n] || []).forEach(x => add(x, "country", c, { exact: true })); });
  D.glossary.forEach(g => g.alias.forEach(a => add(a, "term", g, { exact: a.length < 6 })));
  if (burg) {
    (burg.climats || []).forEach(c => { add(c.n, "climat", c); const bare = c.n.replace(/^(Les|La|Le|L'|Aux|Au|En) /, ""); if (bare !== c.n && norm(bare).length >= 5) add(bare, "climat", c); });
    (burg.villages || []).forEach(v => String(v.n).split(" · ").forEach(n => add(n, "village", v)));
    (D.producerAlias || []).forEach(pa => { const key = Object.keys(burg.producers || {}).find(k => burg.producers[k] === pa.n); if (key) pa.alias.forEach(x => add(x, "producer", { key, n: pa.n }, { exact: true })); });
    Object.entries(burg.producers || {}).forEach(([key, n]) => { add(n, "producer", { key, n }); const bare = n.replace(/^(Domaine|Maison|Château|Clos) (des |du |de la |de l'|de |d')?/, ""); if (bare !== n && norm(bare).length >= 5) add(bare, "producer", { key, n }); });
  }
  entries.sort((a, b) => b.n - a.n || b.k.length - a.k.length);
  return entries;
}
function osa(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) { let best = 1e9;
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      if (d[i][j] < best) best = d[i][j]; }
    if (best > max) return max + 1; }
  return d[a.length][b.length];
}
// every named thing in the question: exact matches first (longest wins), then near misses for what's left
function findEntities(text, idx) {
  const words = text.split(" ").filter(Boolean), used = new Array(words.length).fill(false), out = [];
  const take = (i, n, e, exact) => { for (let j = i; j < i + n; j++) used[j] = true; out.push({ type: e.type, ref: e.ref, at: i, exact }); };
  for (const e of idx) for (let i = 0; i + e.n <= words.length; i++) {
    if (used.slice(i, i + e.n).some(Boolean)) continue;
    if (words.slice(i, i + e.n).join(" ") === e.k) { take(i, e.n, e, true); }
  }
  for (const e of idx) { if (!e.fuzzy) continue; const max = e.k.length >= 10 ? 2 : 1;
    for (let i = 0; i + e.n <= words.length; i++) {
      if (used.slice(i, i + e.n).some(Boolean)) continue;
      const w = words.slice(i, i + e.n).join(" ");
      if (w.length < 5 || w[0] !== e.k[0]) continue;
      if (osa(w, e.k, max) <= max) take(i, e.n, e, false);
    } }
  return out.sort((a, b) => a.at - b.at);
}

// ── small helpers ──
const regionName = (lang, siteName) => { const r = KB.regions.find(x => x.n === siteName); if (r) return r.names[lang] || r.n; const c = KB.countries.find(x => x.n === siteName); return c ? (c.names[lang] || c.n) : siteName; };
const countryOfRegion = n => { const r = KB.regions.find(x => x.n === n); return r ? r.country : (KB.countries.find(c => c.n === n) ? n : ""); };
const colourWord = (lang, c) => say(lang, { r: "red", w: "white", p: "rose", s: "sparkling", d: "sweet", f: "fortified" }[c]);
const listJoin = (lang, arr) => { if (arr.length < 2) return arr.join(""); const and = { en: " and ", da: " og ", fr: " et ", de: " und " }[lang] || " and "; return arr.slice(0, -1).join(", ") + and + arr[arr.length - 1]; };
const bottlesTxt = (lang, n) => n === 1 ? say(lang, "bottle1") : say(lang, "bottles", n);
const winesTxt = (lang, n) => n === 1 ? say(lang, "wine1") : say(lang, "wines", n);
const left = w => (w.left != null ? w.left : (Number(w.qty) || 0) - (Number(w.drunk) || 0));
const wineLine = (lang, w, withLoc) => `<b>${esc(w.producer)}</b> ${esc([w.name, w.vintage].filter(Boolean).join(" "))} <span class="sm-m">· ${esc(bottlesTxt(lang, left(w)))}${withLoc ? " · 📍 " + esc(w.location || say(lang, "noLoc")) : (w.location ? " · 📍 " + esc(w.location) : "")}</span>`;
const ul = items => `<ul>${items.map(i => `<li>${i}</li>`).join("")}</ul>`;
const p = s => `<p>${s}</p>`;
const villageCote = (burg, vid) => { if (!burg || !burg.villages || !burg.cotes) return null; let cur = burg.cotes[0].id;
  for (const v of burg.villages) { const k = burg.cotes.find(x => x.first === v.id); if (k) cur = k.id; if (v.id === vid) return cur; } return null; };
const appVillage = (burg, appName) => { if (!burg) return null; const k = norm(appName);
  const v = (burg.villages || []).find(x => String(x.n).split(" · ").some(n => norm(n) === k || k.startsWith(norm(n)) || norm(n).startsWith(k.split(" ")[0])));
  return v ? v.id : null; };

// ── answers ──
function aboutApp(lang, a, ctx) {
  const reg = a.region, ctry = countryOfRegion(reg);
  const where = reg === ctry || !ctry ? regionName(lang, reg) : `${regionName(lang, reg)}, ${regionName(lang, ctry)}`;
  const lines = a.wines.map(w => say(lang, "madeFrom", w.cols.map(c => colourWord(lang, c)).join(" / ").replace(/^./, m => m.toUpperCase()), listJoin(lang, w.grapes)));
  let html = p(say(lang, "appIs", esc(a.n), esc(where))) + ul(lines.map(esc));
  const note = D.appNotes && D.appNotes[a.n]; if (note) html += p(esc(note[lang] || note.en));
  const ag = ageOf([{ type: "app", ref: a }], "", ctx); if (ag && !ag.tiers) html += p(`<span class="sm-m">${esc(say(lang, "keeps", ag.lo, ag.hi))}</span>`);
  const vid = reg === "Bourgogne" && appVillage(ctx.burg, a.n);
  const V = vid && ctx.burg.villages.find(v => v.id === vid);
  if (V) { const tx = (ctx.burgI18n && ctx.burgI18n.villages && ctx.burgI18n.villages[vid]) || {}; html += p(esc(tx.note || V.note || "")) + p(`<span class="sm-m">${esc(tx.aoc || V.aoc || "")}</span> <a href="burgundy.html#v=${esc(vid)}" target="_blank" rel="noopener">${esc(say(lang, "openAtlas"))}</a>`); }
  return html + cellarLine(lang, ctx, w => norm(w.commune) === norm(a.n) || norm(w.name).startsWith(norm(a.n)));
}
function aboutGrape(lang, g, ctx) {
  const pr = D.profiles.find(x => x.n === g.n);
  const col = say(lang, g.col === "r" ? "redG" : "whiteG");
  let html = p(pr ? say(lang, "grapeIs", esc(g.n), col, esc(regionName(lang, pr.home))) : say(lang, "grapeIsNoHome", esc(g.n), col));
  if (pr) {
    const i = Math.max(0, L.indexOf(lang));
    const st = [SAY.body[i][pr.b - 1], SAY.acid[i][pr.a - 1], pr.t ? SAY.tannin[i][pr.t] : ""].filter(Boolean).join(", ");
    html += p(say(lang, "style", esc(st)) + " " + say(lang, "aromas", esc(pr.ar.map(k => (D.AROMA[k] || {})[lang] || k).join(", "))));
  }
  if (g.syn.length) html += p(say(lang, "alsoCalled", esc(listJoin(lang, g.syn.slice(0, 5)))));
  const apps = KB.apps.filter(a => a.wines.some(w => w.grapes.some(x => x === g.n || g.syn.includes(x)))).map(a => a.n);
  if (apps.length) html += p(say(lang, "grownIn", esc(listJoin(lang, apps.slice(0, 8)))));
  return html + cellarLine(lang, ctx, w => String(w.grape || "").split(/,\s*|\s*\/\s*/).some(x => norm(x) === norm(g.n) || g.syn.some(s => norm(s) === norm(x))));
}
function aboutRegion(lang, r, ctx) {
  let html = p(say(lang, "regionIs", esc(r.names[lang] || r.n), esc(regionName(lang, r.country))));
  const apps = KB.apps.filter(a => a.region === r.n);
  if (apps.length) html += p(say(lang, "mainApps", esc(listJoin(lang, apps.slice(0, 12).map(a => a.n)))));
  const cnt = new Map(); apps.forEach(a => a.wines.forEach(w => w.grapes.forEach(g => cnt.set(g, (cnt.get(g) || 0) + 1))));
  const top = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(x => x[0]);
  if (top.length) html += p(say(lang, "mainGrapes", esc(listJoin(lang, top))));
  return html + cellarLine(lang, ctx, w => w.region === r.n);
}
function aboutClimat(lang, cs, ctx) {
  const B = ctx.burg, P = B.producers || {};
  const one = c => {
    const v = (B.villages || []).find(x => x.id === c.v), cls = c.c === "GC" ? say(lang, "gc") : c.c === "1er" ? say(lang, "pc") : say(lang, "vc");
    let html = p(say(lang, "climatIs", esc(c.n), cls, esc(v ? v.n : c.v), String(c.ha).replace(".", lang === "en" ? "." : ",")));
    const cols = [c.col.includes("R") ? colourWord(lang, "r") + ": Pinot Noir" : "", c.col.includes("W") ? colourWord(lang, "w") + ": Chardonnay" : ""].filter(Boolean);
    html += ul(cols.map(x => esc(x.replace(/^./, m => m.toUpperCase()))));
    const d = (ctx.burgI18n && ctx.burgI18n.climats && ctx.burgI18n.climats[c.id]) || c.d;
    if (d) html += p(esc(d));
    const own = (c.p || []).filter(x => x[1] != null).sort((a, b) => b[1] - a[1]);
    if ((c.p || []).length === 1) html += p(say(lang, "monopole", esc(P[c.p[0][0]] || c.p[0][0])));
    else if (own.length) html += p(say(lang, "owners", esc(own.slice(0, 5).map(x => `${P[x[0]] || x[0]} ${String(x[1]).replace(".", lang === "en" ? "." : ",")} ha`).join(", "))));
    return html + p(`<a href="burgundy.html#c=${esc(c.id)}" target="_blank" rel="noopener">${esc(say(lang, "openAtlas"))}</a>`);
  };
  if (cs.length === 1) return one(cs[0]) + cellarLine(lang, ctx, w => norm(w.name).includes(norm(cs[0].n.replace(/^(Les|La|Le|L'|Aux|Au|En) /, ""))));
  const vn = id => ((B.villages || []).find(x => x.id === id) || {}).n || id;
  return p(say(lang, "climatMany", esc(cs[0].n))) + ul(cs.map(c => `${esc(vn(c.v))} — ${c.c === "GC" ? say(lang, "gc") : c.c === "1er" ? say(lang, "pc") : say(lang, "vc")}, ${String(c.ha)} ha · <a href="burgundy.html#c=${esc(c.id)}" target="_blank" rel="noopener">atlas ↗</a>`));
}
function aboutProducer(lang, pr, ctx) {
  const B = ctx.burg, prof = (B.profiles || {})[pr.key] || {}, tx = (ctx.burgI18n && ctx.burgI18n.profiles && ctx.burgI18n.profiles[pr.key]) || {};
  let html = p(say(lang, "producerIs", esc(pr.n)) + (prof.kind ? ` <span class="sm-m">· ${esc(tx.kind || prof.kind)}</span>` : ""));
  if (tx.note || prof.note) html += p(esc(tx.note || prof.note));
  const notes = ctx.notes || {}; const nk = Object.keys(notes).find(k => norm(k) === norm(pr.n) || norm(pr.n).includes(norm(k)));
  if (nk && !(tx.note || prof.note)) html += p(esc(notes[nk][1]));
  const held = (B.climats || []).map(c => { const h = (c.p || []).find(x => x[0] === pr.key); return h ? [c, h[1]] : null; }).filter(Boolean)
    .sort((a, b) => (b[0].c === "GC") - (a[0].c === "GC") || (b[1] || 0) - (a[1] || 0));
  if (held.length) html += p(say(lang, "holdings", esc(held.slice(0, 8).map(([c, h]) => c.n + (h ? ` ${String(h).replace(".", lang === "en" ? "." : ",")} ha` : "")).join(", ") + (held.length > 8 ? " …" : ""))))
    + p(`<a href="burgundy.html#p=${esc(pr.key)}" target="_blank" rel="noopener">${esc(say(lang, "openAtlas"))}</a>`);
  const key = norm(pr.n).replace(/^(domaine|maison|chateau) /, "");
  return html + cellarLine(lang, ctx, w => norm(w.producer).includes(key) || key.includes(norm(w.producer).replace(/^(domaine|maison|chateau) /, "")), true);
}
function cellarLine(lang, ctx, test, list) {
  const ws = (ctx.wines || []).filter(w => left(w) > 0 && test(w));
  if (!ws.length) return "";
  const b = ws.reduce((s, w) => s + left(w), 0);
  return p(say(lang, "inCellar", esc(bottlesTxt(lang, b) + " · " + winesTxt(lang, ws.length)))) + (list ? ul(ws.slice(0, 6).map(w => wineLine(lang, w))) : "");
}

// vintages
const qWord = (lang, s) => say(lang, "q" + s);
const bWord = (lang, n) => say(lang, n >= 96 ? "b96" : n >= 92 ? "b92" : n >= 88 ? "b88" : n >= 84 ? "b84" : n >= 80 ? "b80" : "b0");
const stars = s => "★".repeat(s) + "☆".repeat(5 - s);
function burgundyVintage(lang, y, cats, ctx) {
  const V = ctx.vint; if (!V || !V.years || !V.years[y]) return null;
  const tx = s => ((V.i18n || {})[lang] || {})[s] || s;
  const name = { nuits_red: "nuitsRed", beaune_red: "beauneRed", beaune_white: "beauneWhite" };
  const out = cats.map(cat => {
    const r = V.years[y][cat];
    if (!r) return p(say(lang, "notRated", esc(say(lang, name[cat])), y));
    const [score, est, note, drink, src] = r;
    return p(say(lang, "vintBurg", esc(cap(say(lang, name[cat]))), y, score, esc(bWord(lang, score))) + " " + esc(tx(note)))
      + p(say(lang, "drinking", esc(tx(drink))) + ` <span class="sm-m">${esc(say(lang, "basis", (src || []).length, est ? say(lang, "estimate") : ""))}</span>`);
  });
  return out.join("") + p(`<a href="burgundy.html#color=vintage&amp;y=${y}" target="_blank" rel="noopener">${esc(say(lang, "openAtlas"))}</a>`);
}
function chartVintage(lang, y, ids) {
  return ids.map(id => { const c = D.charts.find(x => x.id === id), s = c.years[y];
    if (!s) return p(id === "port" ? say(lang, "notDeclared", y) : say(lang, "notRated", esc(c.names[lang]), y));
    return p(say(lang, "vintStars", esc(cap(c.names[lang])), y, `<span class="sm-st">${stars(s)}</span>`, esc(qWord(lang, s)))); }).join("") + p(`<span class="sm-m">${esc(say(lang, "roughChart"))}</span>`);
}
const RIGHT = ["Saint-Émilion", "Pomerol", "Lalande-de-Pomerol", "Fronsac", "Castillon"], SWEETB = ["Sauternes", "Barsac"];
const NRHONE = ["Côte-Rôtie", "Condrieu", "Château-Grillet", "Saint-Joseph", "Crozes-Hermitage", "Hermitage", "Cornas", "Saint-Péray"];
function chartsFor(ents, text) {
  for (const e of ents) {
    const app = e.type === "app" ? e.ref : null, reg = e.type === "region" ? e.ref.n : app ? app.region : null;
    if (app && RIGHT.includes(app.n)) return ["bdx_right"];
    if (app && SWEETB.includes(app.n)) return ["sauternes"];
    if (reg === "Bordeaux") return app ? ["bdx_left"] : ["bdx_left", "bdx_right"];
    if (reg === "Champagne") return ["champagne"];
    if (reg === "Rhône") return app ? [NRHONE.includes(app.n) ? "rhone_n" : "rhone_s"] : ["rhone_n", "rhone_s"];
    if (reg === "Piemonte") return ["barolo"];
    if (reg === "Toscana") return ["tuscany"];
    if (reg === "Rioja") return ["rioja"];
    if (["Mosel", "Rheingau", "Nahe", "Pfalz", "Rheinhessen"].includes(reg) || (e.type === "country" && e.ref.n === "Tyskland")) return ["riesling_de"];
    if (["Napa Valley", "Californien", "Sonoma"].includes(reg)) return ["napa"];
    if (reg === "Douro" || (app && /^Port/.test(app.n))) return ["port"];
  }
  if (/\bport\b|\bportvin\b|\bporto\b/.test(text)) return ["port"];
  return null;
}
function burgundyCats(ents, text) {
  const red = hasW(text, "red"), white = hasW(text, "white");
  let cote = /cote de nuits|nuits/.test(text) && !/nuits saint georges/.test(text) ? "nuits" : /cote de beaune/.test(text) ? "beaune" : null;
  let isBurg = !!cote || ents.some(e => (e.type === "region" && e.ref.n === "Bourgogne") || (e.type === "app" && e.ref.region === "Bourgogne") || e.type === "climat" || e.type === "village");
  if (!isBurg) return null;
  let cols = null;
  for (const e of ents) {
    if (cote) break;
    const vid = e.type === "climat" ? e.ref.v : e.type === "village" ? e.ref.id : e.type === "app" ? e.__vid : null;
    if (vid) cote = e.__cote || null;
    // an appellation's main wine decides (Meursault: white, though it makes a little red)
    if (e.type === "climat") cols = e.ref.col; if (e.type === "app") cols = e.ref.wines[0].cols.join("").toUpperCase();
  }
  const wantR = red || (!white && (!cols || /R/.test(cols))), wantW = white || (!red && cols && /W/.test(cols) && !/R/.test(cols));
  const cats = [];
  if (cote !== "beaune" && wantR) cats.push("nuits_red");
  if (cote !== "nuits" && wantR) cats.push("beaune_red");
  if (cote !== "nuits" && (wantW || (!red && !white && !cols))) cats.push("beaune_white");
  if (cote === "nuits" && white && !red) cats.push("__nuits_white");
  return cats;
}

// ── the question → an answer ──
function answer(q, ctx) {
  ctx = ctx || {};
  const lang = L.includes(ctx.lang) ? ctx.lang : "en";
  const text = norm(q).replace(/\b(st|ste)\b/g, "saint");
  if (IDX_FOR !== ctx.burg || !IDX) { IDX = buildIndex(ctx.burg); IDX_FOR = ctx.burg; }
  const ents = findEntities(text, IDX);
  ents.forEach(e => { if (e.type === "app" && ctx.burg) { e.__vid = appVillage(ctx.burg, e.ref.n); e.__cote = e.__vid && villageCote(ctx.burg, e.__vid); }
    if (e.type === "climat" && ctx.burg) e.__cote = villageCote(ctx.burg, e.ref.v); if (e.type === "village" && ctx.burg) e.__cote = villageCote(ctx.burg, e.ref.id); });
  const years = [...String(q).matchAll(/\b(19[4-9]\d|20[0-3]\d)\b/g)].map(m => Number(m[1]));
  const wines = ctx.wines || null;
  const res = html => ({ html, chips: chips(lang, ctx) });
  if (!text) return res(help(lang, ctx));
  // a Burgundy appellation that is also a grand cru (Musigny, Chambertin) is the vineyard
  if (ctx.burg) ents.forEach(e => { if (e.type !== "app" || e.ref.region !== "Bourgogne") return;
    const k = norm(e.ref.n), c = ctx.burg.climats.find(x => norm(x.n) === k || norm(x.n.replace(/^(Les|La|Le|L'|Aux|Au|En) /, "")) === k);
    if (c && c.c === "GC") { e.type = "climat"; e.ref = c; } });
  const named = ents.filter(e => ["climat", "app", "producer", "grape", "region", "term", "village", "country"].includes(e.type));

  // "do you prefer white Burgundy or Danish white?" — an opinion, with reasons
  const either = named.length >= 2 && / (or|eller|ou|oder) /.test(" " + text + " ") && text.split(" ").length <= 9; // "Barolo or Barbaresco?"
  if ((hasW(text, "prefer") || either) && named.length >= 2) { const pr = prefer(lang, named, text, ctx); if (pr) return res(pr); }
  // "recommend a wine from Piemonte", "a white Burgundy under 50 €", "what would you buy for 1000 euros?"
  if (hasW(text, "recommend") || (budgetOf(q) && /wine|vin|wein|bottle|flaske|bouteille|flasche/.test(text))) return res(recommend(lang, ents, text, q, ctx));
  // "what's the difference between premier cru and grand cru" — both, one after the other
  if (hasW(text, "compare")) { const two = [];
    named.forEach(e => { if (two.length < 2 && !two.some(x => x.ref === e.ref)) two.push(e); });
    if (two.length === 2) return res(two.map(e => short(lang, e, ctx)).join("")); }
  // the best years for a place
  if (!years.length && (hasW(text, "best") || (hasW(text, "vintage") && named.length))) { const b = bestVintages(lang, ents, text, ctx); if (b) return res(b); }
  // how long it keeps
  // "how long can I keep Barolo", and "how long does Meursault keep" — a named wine and no opened bottle
  if ((hasW(text, "age") || (hasW(text, "opened") && named.some(e => e.type !== "term"))) && !hasW(text, "openedStrong")) {
    const a = ageAnswer(lang, [...ents].sort((x, y) => (y.exact ? 1 : 0) - (x.exact ? 1 : 0)), text, years, ctx); if (a) return res(a); }
  // "how many glasses in a bottle", "what is a magnum": a term asked about, not the cellar
  const term0 = ents.find(e => e.type === "term");
  const mineQ = hasW(text, "have") || / (my|mine|min|mit|mon|ma|mes|mein|meine|meinen) /.test(" " + text + " ");

  // about your cellar
  const cellarQ = hasW(text, "drinkNow") || hasW(text, "howMany") || hasW(text, "where") || hasW(text, "have") || hasW(text, "pricey") || hasW(text, "oldest") || (hasW(text, "worth") && hasW(text, "my"));
  if (cellarQ && term0 && !mineQ) return res(p(esc(term0.ref.text[lang] || term0.ref.text.en)));
  const geo = named.find(e => ["app", "region", "climat", "village", "country"].includes(e.type));
  if (cellarQ && !(hasW(text, "pair") && foodOf(text))) {
    if (!wines) return res(p(say(lang, "noCellar")));
    const inCellar = wines.filter(w => left(w) > 0);
    if (!inCellar.length) return res(p(say(lang, "emptyCellar")));
    if (hasW(text, "drinkNow")) return res(drinkNow(lang, ctx, inCellar));
    if (hasW(text, "pricey")) return res(p(say(lang, "priciest")) + ul(inCellar.filter(w => w.price).sort((a, b) => b.price - a.price).slice(0, 5).map(w => wineLine(lang, w) + ` <span class="sm-m">· ${kr(w.price)}</span>`)));
    if (hasW(text, "oldest")) return res(p(say(lang, "oldest")) + ul(inCellar.filter(w => typeof w.vintage === "number").sort((a, b) => a.vintage - b.vintage).slice(0, 5).map(w => wineLine(lang, w))));
    if (hasW(text, "worth")) { const b = inCellar.reduce((s, w) => s + left(w), 0), paid = inCellar.reduce((s, w) => s + (w.price || 0) * left(w), 0), val = inCellar.reduce((s, w) => s + (w.value || w.price || 0) * left(w), 0);
      return res(p(say(lang, "worth", b, kr(paid), inCellar.some(w => w.value) ? say(lang, "worthNow", kr(val)) : ""))); }
    const sel = selectWines(text, ents, years, inCellar, lang);
    if (hasW(text, "howMany")) {
      const b = sel.list.reduce((s, w) => s + left(w), 0);
      let html = p(say(lang, "count", esc(bottlesTxt(lang, b)), esc(winesTxt(lang, sel.list.length)), sel.label ? say(lang, "countOf", esc(sel.label)) : ""));
      if (!sel.label) { const by = {}; sel.list.forEach(w => { const k = w.style || "?"; by[k] = (by[k] || 0) + left(w); });
        html += p(say(lang, "byStyle", esc(Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${styleWord(lang, k)} ${n}`).join(", ")))); }
      return res(html);
    }
    // "where is Chablis" with no Chablis in the cellar: where the place is
    if (!sel.list.length && hasW(text, "where") && !mineQ && geo) return res(short(lang, geo, ctx));
    if (!sel.label) return res(p(say(lang, "haveNo", esc(q.replace(/^.*?\b(my|min|mine|mon|ma|mes|mein|meine)\b\s*/i, "").replace(/[?!.]+$/, "") || "…"))));
    if (!sel.list.length) return res(p(say(lang, "haveNo", esc(sel.label))));
    return res(p(hasW(text, "where") ? say(lang, "where") : say(lang, "haveYes", esc(winesTxt(lang, sel.list.length)))) + ul(sel.list.slice(0, 10).map(w => wineLine(lang, w, true))));
  }

  // vintages
  if (years.length && (hasW(text, "vintage") || ents.some(e => ["app", "region", "climat", "village", "country"].includes(e.type)) || /nuits|beaune|bordeaux|burgund|bourgogne|barolo|rioja/.test(text))) {
    const y = years[0], bc = burgundyCats(ents, text);
    if (bc) { const note = bc.includes("__nuits_white") ? p(say(lang, "nuitsWhiteNote")) : "";
      const cats = bc.filter(c => !c.startsWith("__")); const r = burgundyVintage(lang, y, cats.length ? cats : ["beaune_white"], ctx);
      if (r) return res(note + r + yourVintage(lang, ctx, y, w => w.region === "Bourgogne", regionName(lang, "Bourgogne"))); }
    const ch = chartsFor(ents, text);
    if (ch) return res(chartVintage(lang, y, ch));
    return res(yearSummary(lang, y, ctx));
  }

  if (hasW(text, "decant")) return res(decant(lang, ents, text, years));
  if (hasW(text, "temp") && !hasW(text, "storage")) return res(serve(lang, ents, text));
  if (hasW(text, "opened")) return res(p(say(lang, "opened")));
  if (hasW(text, "storage")) return res(p(say(lang, "storage")));
  const food = foodOf(text);
  if (food || hasW(text, "pair")) return res(pairing(lang, food, ctx));

  // something named
  const pick = t => ents.filter(e => e.type === t);
  // the soil of a place
  if (hasW(text, "soil")) { const a = pick("app")[0]; const nt = a && D.appNotes[a.ref.n]; if (nt) return res(p(`<b>${esc(a.ref.n)}</b>`) + p(esc(nt[lang] || nt.en))); }
  // "what glass for Burgundy", "kimmeridgian soil in Chablis": a term named before anything else is the question
  if (term0 && named.every(e => e === term0 || e.at > term0.at)) return res(p(esc(term0.ref.text[lang] || term0.ref.text.en)));
  const climats = pick("climat").map(e => e.ref);
  if (climats.length && ctx.burg) { const name = norm(climats[0].n.replace(/^(Les|La|Le|L'|Aux|Au|En) /, ""));
    const same = ctx.burg.climats.filter(c => norm(c.n.replace(/^(Les|La|Le|L'|Aux|Au|En) /, "")) === name);
    const inVillage = same.filter(c => ents.some(e => (e.type === "village" && e.ref.id === c.v) || (e.type === "app" && e.__vid === c.v)));
    return res(aboutClimat(lang, inVillage.length ? inVillage : same, ctx)); }
  const app = pick("app")[0]; if (app) return res(aboutApp(lang, app.ref, ctx));
  const prod = pick("producer")[0]; if (prod && ctx.burg) return res(aboutProducer(lang, prod.ref, ctx));
  const grape = pick("grape")[0]; if (grape) return res(aboutGrape(lang, grape.ref, ctx));
  const region = pick("region")[0]; if (region) return res(aboutRegion(lang, region.ref, ctx));
  const term = pick("term")[0]; if (term) return res(p(esc(term.ref.text[lang] || term.ref.text.en)));
  const village = pick("village")[0];
  if (village && ctx.burg) { const v = village.ref, tx = (ctx.burgI18n && ctx.burgI18n.villages && ctx.burgI18n.villages[v.id]) || {};
    return res(p(`<b>${esc(v.n)}</b>`) + p(esc(tx.note || v.note || "")) + p(`<span class="sm-m">${esc(tx.aoc || v.aoc || "")}</span> <a href="burgundy.html#v=${esc(v.id)}" target="_blank" rel="noopener">${esc(say(lang, "openAtlas"))}</a>`)); }
  if (hasW(text, "help")) return res(help(lang, ctx));
  return res(p(say(lang, "unknown")) + p(say(lang, "tryAsk")) + ul(examples(lang, ctx).map(esc)));
}

// ── recommendations: from your cellar first, then wines worth buying (sommelier-data.js PICKS) ──
const EUR_DKK = 7.46, EUR_USD = 1.08;
const eur = (lang, e) => { const r = e >= 1000 ? Math.round(e / 100) * 100 : e >= 100 ? Math.round(e / 10) * 10 : Math.round(e);
  return "€" + r.toLocaleString(lang === "en" ? "en-GB" : "da-DK") + (lang === "da" ? ` (≈ ${kr(e * EUR_DKK)})` : ""); };
// "under 500 kr", "1000 euros", "€80", "$100" → the most a bottle may cost, in euros
function budgetOf(q) {
  const t = String(q).toLowerCase(), num = x => Number(String(x).replace(/[.,\s](?=\d{3}\b)/g, "").replace(",", "."));
  let m = t.match(/(?:€|eur\b|euro?s?\b)\s*(\d[\d.,\s]*)/) || t.match(/(\d[\d.,]*)\s*(?:€|eur\b|euros?\b)/);
  if (m) return num(m[1]);
  m = t.match(/(\d[\d.,]*)\s*(?:kr\b|kr\.|kroner|dkk)/) || t.match(/(?:dkk|kr\.?)\s*(\d[\d.,]*)/); if (m) return num(m[1]) / EUR_DKK;
  m = t.match(/\$\s*(\d[\d.,]*)/) || t.match(/(\d[\d.,]*)\s*(?:\$|usd|dollars?)/); if (m) return num(m[1]) / EUR_USD;
  return null;
}
const colourOfText = text => hasW(text, "sparkling") ? "s" : hasW(text, "sweet") ? "d" : hasW(text, "red") ? "r" : hasW(text, "white") ? "w" : /\bport|portvin|porto|sherry\b/.test(text) ? "f" : null;
const PICK_STYLE = { r: "Rød", w: "Hvid", s: "Bobler", d: "Hvid", f: "Rød" };
// what a question narrows to: a place, a colour, a grape
function scopeOf(ents, text) {
  const geo = ents.find(e => ["app", "region", "climat", "village", "country"].includes(e.type));
  const grape = ents.find(e => e.type === "grape");
  let region = null, country = null, label = "";
  if (geo) { if (geo.type === "country") { country = geo.ref.n; label = geo.ref.names.en ? null : ""; }
    else if (geo.type === "region") region = geo.ref.n; else if (geo.type === "app") region = geo.ref.region; else region = "Bourgogne"; }
  return { geo, region, country, grape: grape && grape.ref, col: colourOfText(text) };
}
const pickFits = (pk, sc) => (!sc.region || pk.region === sc.region) && (!sc.country || pk.region === sc.country || countryOfRegion(pk.region) === sc.country)
  && (!sc.col || pk.col === sc.col) && (!sc.grape || pk.grape === sc.grape.n || sc.grape.syn.includes(pk.grape));
// the regions you drink most, by bottles (in the cellar and enjoyed)
function tasteOf(ctx) {
  const by = new Map(); (ctx.wines || []).forEach(w => { if (!w.region) return; const n = (Number(w.qty) || 0) || 1; by.set(w.region, (by.get(w.region) || 0) + n); });
  return [...by.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]).filter(r => D.picks.some(pk => pk.region === r));
}
function recommend(lang, ents, text, q, ctx) {
  const sc = scopeOf(ents, text), budget = budgetOf(q), buying = /\b(buy|buying|kobe|kob|acheter|kaufen|gave you|gav dig|give you)\b/.test(text);
  let html = "", taste = null;
  // your own bottles that fit and are ready, best first
  if (!buying && ctx.wines) {
    const ready = ctx.wines.filter(w => left(w) > 0).filter(w => {
      const r = ctx.readiness && ctx.readiness(w); if (r && r.k !== "now" && r.k !== "past") return false;
      if (sc.region && w.region !== sc.region) return false; if (sc.country && w.country !== sc.country) return false;
      if (sc.col && PICK_STYLE[sc.col] && w.style !== PICK_STYLE[sc.col]) return false;
      if (sc.grape && !(norm(w.grape).includes(norm(sc.grape.n)) || sc.grape.syn.some(x => norm(w.grape).includes(norm(x))))) return false;
      if (budget && (w.value || w.price) && (w.value || w.price) > budget * EUR_DKK) return false;
      return true; }).sort((a, b) => (b.value || b.price || 0) - (a.value || a.price || 0)).slice(0, 3);
    if (ready.length) html += p(say(lang, "recCellar")) + ul(ready.map(w => wineLine(lang, w)));
  }
  // wines to buy
  let picks = D.picks.filter(pk => pickFits(pk, sc));
  if (!sc.region && !sc.country && !sc.grape) { const t = tasteOf(ctx); if (t.length) { taste = t[0]; const mine = picks.filter(pk => pk.region === taste); if (mine.length >= 2) picks = mine; else taste = null; } }
  if (!picks.length) return html || p(say(lang, "recNone"));
  let chosen;
  if (budget) {
    const under = picks.filter(pk => pk.eur <= budget * 1.05).sort((a, b) => b.eur - a.eur);
    chosen = (under.length ? under : picks.sort((a, b) => a.eur - b.eur)).slice(0, 3);
  } else {
    // one from each price band, cheapest first: an everyday bottle up to a special one
    const bands = [[0, 30], [30, 70], [70, 200], [200, 600], [600, 1e9]], out = [];
    bands.forEach(([lo, hi]) => { const b = picks.filter(pk => pk.eur >= lo && pk.eur < hi); if (b.length) out.push(b[Math.floor(b.length / 2)]); });
    chosen = out.slice(0, 4);
  }
  const line = pk => `<b>${esc(pk.wine)}</b> <span class="sm-m">· ${esc(regionName(lang, pk.region))} · ${esc(pk.grape)} · ${esc(eur(lang, pk.eur))}</span>`;
  if (taste) html += p(say(lang, "recTaste", esc(regionName(lang, taste))));
  if (budget && budget >= 150 && buying) {
    html += p(say(lang, "recOne", esc(eur(lang, budget)))) + ul(chosen.map(line));
    const share = budget / 6, near = picks.filter(pk => pk.eur <= share * 1.1 && pk.eur >= share * 0.35);
    const six = (near.length ? near : picks.filter(pk => pk.eur <= share * 1.1)).sort((a, b) => b.eur - a.eur).slice(0, 3);
    if (six.length) html += p(say(lang, "recSix", esc(eur(lang, budget / 6)))) + ul(six.map(line));
  } else html += p(say(lang, "recBuy", budget ? say(lang, "recUpTo", esc(eur(lang, budget))) : "")) + ul(chosen.map(line));
  return html + p(`<span class="sm-m">${esc(say(lang, "recPrices"))}</span>`);
}
// ── "do you prefer white Burgundy or Danish white?": pick one, and say why ──
function profileOf(lang, e, col, ctx) {
  if (e.type === "app" && KB.regions.some(r => r.n === e.ref.n)) e = { type: "region", ref: KB.regions.find(r => r.n === e.ref.n) };
  const app = e.type === "app" ? e.ref : null;
  const region = e.type === "region" ? e.ref.n : e.type === "app" ? e.ref.region : e.type === "country" ? e.ref.n : e.type === "climat" || e.type === "village" ? "Bourgogne" : null;
  const base = e.type === "region" || e.type === "country" ? (e.ref.names[lang] || e.ref.n) : (e.ref.n || "");
  const name = (col === "w" || col === "r") && e.type !== "grape" && e.type !== "country" ? cap(colourWord(lang, col)) + " " + base : base; // "White Burgundy"
  const sc = { region: e.type === "country" ? null : region, country: e.type === "country" ? e.ref.n : null, col, grape: e.type === "grape" ? e.ref : null };
  const pk = D.picks.filter(x => pickFits(x, sc) && (!app || norm(x.wine).includes(norm(app.n)))).map(x => x.eur);
  // a region or a country keeps as long as its appellations do, from the simplest to the greatest
  let keeps = null;
  if (e.type === "region" || e.type === "country") {
    const regs = e.type === "region" ? [e.ref.n] : KB.regions.filter(r => r.country === e.ref.n).map(r => r.n);
    const rows = KB.apps.filter(a => regs.includes(a.region) && (!col || a.wines.some(w => w.cols.includes(col)))).map(a => ageRow(a.n)).filter(Boolean);
    if (regs.includes("Bourgogne")) rows.push(...["REG", "V", "1er", "GC"].map(t => ageRow(`@${t}-${col === "w" ? "W" : "R"}`)).filter(Boolean));
    if (rows.length) keeps = [Math.min(...rows.map(r => r.lo)), Math.max(...rows.map(r => r.hi))];
  }
  if (!keeps) { const ag = ageOf([e], col === "w" ? "white" : col === "r" ? "red" : "", ctx); keeps = ag && !ag.tiers ? [ag.lo, ag.hi] : null; }
  const note = e.type === "country" && D.countryNotes[e.ref.n] ? D.countryNotes[e.ref.n][lang] : "";
  const lo = pk.length ? Math.min(...pk) : 0, hi = pk.length ? Math.max(...pk) : 0;
  const range = lang === "da" ? [kr(lo * EUR_DKK).replace(/ kr\.$/, ""), kr(hi * EUR_DKK)] : [eur(lang, lo), eur(lang, hi)];
  const bits = [keeps ? say(lang, "prefKeeps", Math.max(1, keeps[0]), keeps[1]) : "", pk.length ? say(lang, "prefPrice", range[0], range[1]) : ""].filter(Boolean);
  const colOk = w => !col || !PICK_STYLE[col] || w.style === PICK_STYLE[col];
  const inCellar = (ctx.wines || []).filter(w => colOk(w) && (app ? norm(w.commune) === norm(app.n) || norm(w.name).includes(norm(app.n))
      : (region && (w.region === region || w.country === region)) || (sc.grape && norm(w.grape).includes(norm(sc.grape.n)))))
    .reduce((s, w) => s + ((Number(w.qty) || 0) || 1), 0);
  // how far it goes with age counts most; a typical (median) price says something about depth, the top price little
  const mid = pk.length ? [...pk].sort((x, y) => x - y)[Math.floor(pk.length / 2)] : 20;
  const score = (keeps ? keeps[1] : 5) + Math.log10(mid) * 5;
  return { e, name, bits, note, inCellar, score, keepsHi: keeps ? keeps[1] : 5 };
}
function prefer(lang, named, text, ctx) {
  const two = []; named.forEach(e => { if (two.length < 2 && !two.some(x => x.ref === e.ref) && e.type !== "term") two.push(e); });
  if (two.length < 2) return two.length ? null : p(say(lang, "prefOne"));
  const col = colourOfText(text);
  let [a, b] = two.map(e => profileOf(lang, e, col, ctx)).sort((x, y) => y.score - x.score);
  // two greats (both keep 25 years and more) or nearly the same: what you drink decides
  const close = (a.keepsHi >= 25 && b.keepsHi >= 25) || a.score - b.score < 3;
  if (close && b.inCellar > a.inCellar) [a, b] = [b, a];
  const describe = x => x.note || cap(listJoin(lang, x.bits)) + ".";
  let html = p(say(lang, "prefPick", esc(a.name)));
  html += close ? p(esc(say(lang, a.inCellar > b.inCellar ? "prefClose" : "prefCloseNo")) + " " + esc(describe(a)))
    : p(esc(describe(a)) + (a.keepsHi - b.keepsHi >= 8 ? " " + esc(say(lang, "prefDeeper")) : ""));
  html += p(say(lang, "prefOther", esc(b.name), esc(describe(b))));
  const have = [a, b].filter(x => x.inCellar);
  if (have.length) html += p(say(lang, "prefYours", esc(have.map(x => `${x.name} ${bottlesTxt(lang, x.inCellar)}`).join(", "))));
  return html + p(`<span class="sm-m">${esc(say(lang, "prefTaste"))}</span>`);
}

// a short card for one named thing (comparisons, "where is …")
function short(lang, e, ctx) {
  if (e.type === "term") return p(`<b>${esc(cap(e.ref.alias[0]))}</b>: ` + esc(e.ref.text[lang] || e.ref.text.en));
  if (e.type === "app") return aboutApp(lang, e.ref, Object.assign({}, ctx, { wines: null }));
  if (e.type === "grape") return aboutGrape(lang, e.ref, Object.assign({}, ctx, { wines: null }));
  if (e.type === "region") return aboutRegion(lang, e.ref, Object.assign({}, ctx, { wines: null }));
  if (e.type === "climat" && ctx.burg) return aboutClimat(lang, [e.ref], Object.assign({}, ctx, { wines: null }));
  if (e.type === "producer" && ctx.burg) return aboutProducer(lang, e.ref, Object.assign({}, ctx, { wines: null }));
  if (e.type === "village" && ctx.burg) { const v = e.ref, tx = (ctx.burgI18n && ctx.burgI18n.villages && ctx.burgI18n.villages[v.id]) || {};
    return p(`<b>${esc(v.n)}</b>`) + p(esc(tx.note || v.note || "")) + p(`<a href="burgundy.html#v=${esc(v.id)}" target="_blank" rel="noopener">${esc(say(lang, "openAtlas"))}</a>`); }
  if (e.type === "country") return p(`<b>${esc(e.ref.names[lang] || e.ref.n)}</b>`);
  return "";
}
// how long a named wine keeps: {label, lo, hi, note} from sommelier-data.js's table, or {tiers} for Burgundy as a whole
const ageRow = key => D.ageing.find(a => a.keys.includes(key));
const BURG_REGIONAL = ["Bourgogne", "Hautes-Côtes de Nuits", "Hautes-Côtes de Beaune", "Côte de Nuits-Villages", "Côte de Beaune-Villages", "Coteaux Bourguignons"];
function ageOf(ents, text, ctx) {
  const white = hasW(text, "white"), red = hasW(text, "red");
  const colOf = cs => white && /W/i.test(cs) ? "W" : red && /R/i.test(cs) ? "R" : /R/i.test(cs) ? "R" : "W";
  for (const e of ents) {
    if (e.type === "climat") { const t = e.ref.c === "GC" ? "GC" : e.ref.c === "1er" ? "1er" : "V", r = ageRow(`@${t}-${colOf(e.ref.col || "R")}`);
      if (r) return { label: e.ref.n, lo: r.lo, hi: r.hi, note: r.note }; }
    if (e.type === "app") { const a = e.ref, own = ageRow(a.n);
      if (own) return { label: a.n, lo: own.lo, hi: own.hi, note: own.note };
      if (a.region === "Bourgogne") { const main = a.wines[0].cols.join("").toUpperCase(), c = white ? "W" : red ? "R" : main.includes("R") ? "R" : "W";
        const tier = BURG_REGIONAL.includes(a.n) ? "REG" : (ctx.burg && appVillage(ctx.burg, a.n)) || a.wines.length ? "V" : "REG";
        const r = ageRow(`@${tier}-${c}`); if (r) return { label: a.n, lo: r.lo, hi: r.hi, note: null }; } }
    if (e.type === "village") { const r = ageRow(`@V-${white ? "W" : "R"}`); if (r) return { label: e.ref.n.split(" · ")[0], lo: r.lo, hi: r.hi, note: null }; }
    if (e.type === "region") { if (e.ref.n === "Bourgogne") return { tiers: true, label: e.ref.n };
      const r = ageRow(e.ref.n); if (r) return { label: e.ref.names ? e.ref.n : e.ref.n, lo: r.lo, hi: r.hi, note: r.note }; }
    if (e.type === "grape") { const r = ageRow("g:" + e.ref.n); if (r) return { label: e.ref.n, lo: r.lo, hi: r.hi, note: r.note }; }
  }
  return null;
}
function ageAnswer(lang, ents, text, years, ctx) {
  // your own bottles first, when the question is about them
  const mine = / (my|mine|min|mit|mon|ma|mes|mein|meine|meinen) /.test(" " + text + " ");
  if (mine && ctx.wines) { const sel = selectWines(text, ents, years, ctx.wines.filter(w => left(w) > 0), lang);
    if (sel.label && sel.list.length) return p(say(lang, "ageYours")) + ul(sel.list.slice(0, 8).map(w => { const win = ctx.window && ctx.window(w);
      return wineLine(lang, w) + (win && win.from ? ` <span class="sm-m">· ${esc(say(lang, "windowTo", win.from, win.to || "?"))}</span>` : ""); })); }
  const ag = ageOf(ents, text, ctx);
  if (!ag) return ents.length || hasW(text, "storage") || hasW(text, "opened") ? null : p(say(lang, "ageWhich"));
  if (ag.tiers) return p(say(lang, "ageTiers")) + p(`<span class="sm-m">${esc(say(lang, "ageTip"))}</span>`);
  let html = p(ag.hi <= 3 ? say(lang, "ageYoung", esc(ag.label), ag.hi) : say(lang, "ageFor", esc(ag.label), ag.lo, ag.hi));
  if (ag.note) html += p(esc(ag.note[lang] || ag.note.en));
  if (years.length) html += p(say(lang, "ageYear", years[0], years[0] + ag.lo, years[0] + ag.hi));
  return html + p(`<span class="sm-m">${esc(say(lang, "ageTip"))}</span>`);
}
// the best years of a place: Burgundy from the atlas's chart (95+), the rest from the star charts (★★★★★)
function bestVintages(lang, ents, text, ctx) {
  const bc = burgundyCats(ents, text), V = ctx.vint && ctx.vint.years;
  if (bc && V) { const name = { nuits_red: "nuitsRed", beaune_red: "beauneRed", beaune_white: "beauneWhite" };
    const cats = bc.filter(c => !c.startsWith("__")); if (!cats.length) cats.push("beaune_white");
    return cats.map(cat => { const ys = Object.keys(V).map(Number).filter(y => V[y][cat]).sort((a, b) => V[b][cat][0] - V[a][cat][0] || b - a);
      const top = ys.filter(y => V[y][cat][0] >= 95); const list = (top.length >= 4 ? top : ys.slice(0, 6)).slice(0, 8).sort((a, b) => b - a);
      return p(say(lang, "bestFor", esc(say(lang, name[cat])))) + p(list.map(y => `<b>${y}</b> <span class="sm-m">${V[y][cat][0]}</span>`).join(" · ")); }).join("")
      + p(`<a href="burgundy.html#color=vintage" target="_blank" rel="noopener">${esc(say(lang, "openAtlas"))}</a>`); }
  const ch = chartsFor(ents, text); if (!ch) return null;
  return ch.map(id => { const c = D.charts.find(x => x.id === id), ys = Object.keys(c.years).map(Number);
    let top = ys.filter(y => c.years[y] === 5); if (top.length < 3) top = ys.filter(y => c.years[y] >= 4);
    return p(say(lang, "bestFor", esc(c.names[lang]))) + p(top.sort((a, b) => b - a).slice(0, 10).map(y => `<b>${y}</b>`).join(" · ")); }).join("")
    + p(`<span class="sm-m">${esc(say(lang, "roughChart"))}</span>`);
}
function styleWord(lang, s) { return ({ "Rød": say(lang, "red"), "Hvid": say(lang, "white"), "Bobler": say(lang, "sparkling"), "Rosé": say(lang, "rose") })[s] || s; }
// which wines a cellar question is about: named things, colours, a vintage, or words from producers and names
function selectWines(text, ents, years, list, lang) {
  let out = list, label = [];
  const styleF = hasW(text, "red") ? "Rød" : hasW(text, "white") ? "Hvid" : hasW(text, "sparkling") ? "Bobler" : hasW(text, "rose") ? "Rosé" : null;
  if (styleF) { out = out.filter(w => w.style === styleF); label.push(styleWord(lang, styleF)); }
  if (years.length) { out = out.filter(w => w.vintage === years[0]); label.push(String(years[0])); }
  const named = ents.filter(e => ["app", "region", "country", "grape", "climat", "village", "producer"].includes(e.type));
  if (named.length) {
    named.forEach(e => {
      const f = { app: w => norm(w.commune) === norm(e.ref.n) || norm(w.name).includes(norm(e.ref.n)), region: w => w.region === e.ref.n, country: w => w.country === e.ref.n,
        grape: w => norm(w.grape).includes(norm(e.ref.n)) || e.ref.syn.some(s => norm(w.grape).includes(norm(s))),
        climat: w => norm(w.name).includes(norm(e.ref.n.replace(/^(Les|La|Le|L'|Aux|Au|En) /, ""))), village: w => norm(w.commune) === norm(e.ref.n) || norm(w.name).includes(norm(e.ref.n)),
        producer: w => norm(w.producer).includes(norm(e.ref.n).replace(/^(domaine|maison|chateau) /, "")) }[e.type];
      const before = out; out = out.filter(f); if (!out.length && e.type === "producer") out = before.filter(w => norm(w.producer).split(" ").some(t => t.length > 3 && norm(e.ref.n).includes(t)));
      label.push(e.type === "region" || e.type === "country" ? regionName(lang, e.ref.n) : e.ref.n);
    });
  } else {
    // plain words: anything left after the question words that appears in a producer, name, commune or location
    const stop = new Set([...Object.values(W).flat().flatMap(x => x.split(" ")), "the", "a", "an", "of", "do", "i", "is", "are", "my", "any", "some", "bottles", "bottle", "flasker", "flaske", "vin", "vine", "wine", "wines", "jeg", "har", "af", "en", "et", "de", "le", "la", "les", "des", "du", "un", "une", "j", "ai", "ich", "habe", "der", "die", "das", "von", "ein", "eine", "noch", "stadig", "still", "left", "tilbage", "reste", "ubrig", "there", "der", "er", "ist", "est", "il", "y"]);
    const words = text.split(" ").filter(t => t.length > 2 && !stop.has(t) && !/^\d+$/.test(t));
    if (words.length) { const hay = w => norm([w.producer, w.name, w.commune, w.region, w.grape, w.location, w.note, w.size].join(" "));
      const hits = out.filter(w => words.every(t => hay(w).split(" ").some(x => x === t || (t.length > 4 && x.startsWith(t)) || (t.length >= 6 && osa(x, t, 1) <= 1))));
      if (hits.length || words.length) { out = hits; label.push(words.join(" ")); } }
  }
  return { list: out.sort((a, b) => String(a.producer).localeCompare(b.producer) || (a.vintage || 0) - (b.vintage || 0)), label: label.filter(Boolean).join(" ") };
}
function drinkNow(lang, ctx, list) {
  const rd = w => (ctx.readiness ? ctx.readiness(w) : null);
  const ready = list.map(w => ({ w, r: rd(w) })).filter(x => x.r && (x.r.k === "now" || x.r.k === "past"));
  const order = x => x.r.k === "past" ? 0 : x.r.soon ? 1 : 2;
  ready.sort((a, b) => order(a) - order(b) || ((ctx.window && ctx.window(a.w) || {}).to || 9999) - ((ctx.window && ctx.window(b.w) || {}).to || 9999));
  if (ready.length) {
    const b = ready.reduce((s, x) => s + left(x.w), 0);
    return p(say(lang, "drinkNow", esc(bottlesTxt(lang, b)))) + ul(ready.slice(0, 10).map(x => wineLine(lang, x.w) + (x.r.k === "past" ? ` <span class="sm-warn">· ${esc(say(lang, "pastPeak"))}</span>` : x.r.soon ? ` <span class="sm-warn">· ${esc(say(lang, "soon"))}</span>` : "")))
      + (ready.length > 10 ? p(`<span class="sm-m">+ ${ready.length - 10}</span>`) : "");
  }
  const young = list.map(w => ({ w, win: ctx.window ? ctx.window(w) : null })).filter(x => x.win && x.win.from).sort((a, b) => a.win.from - b.win.from).slice(0, 3);
  return p(say(lang, "nothingReady", esc(young.map(x => `${x.w.producer} ${x.w.vintage || ""} (${say(lang, "fromYear", x.win.from)})`).join("; ") || "—")));
}
function yourVintage(lang, ctx, y, test, label) {
  const ws = (ctx.wines || []).filter(w => left(w) > 0 && w.vintage === y && test(w));
  return ws.length ? p(say(lang, "yourWines", esc(label), y, "")) + ul(ws.slice(0, 6).map(w => wineLine(lang, w))) : "";
}
function yearSummary(lang, y, ctx) {
  const rows = [];
  const V = ctx.vint && ctx.vint.years && ctx.vint.years[y];
  if (V) [["nuits_red", "nuitsRed"], ["beaune_red", "beauneRed"], ["beaune_white", "beauneWhite"]].forEach(([k, n]) => { if (V[k]) rows.push(`${esc(cap(say(lang, n)))}: ${V[k][0]}/100 — ${esc(bWord(lang, V[k][0]))}`); });
  D.charts.forEach(c => { if (c.years[y]) rows.push(`${esc(c.names[lang])}: <span class="sm-st">${stars(c.years[y])}</span> ${esc(qWord(lang, c.years[y]))}`); });
  if (!rows.length) return p(say(lang, "notRated", "", y));
  return p(say(lang, "yearSummary", y)) + ul(rows) + p(`<span class="sm-m">${esc(say(lang, "roughChart"))}</span>`);
}
function serve(lang, ents, text) {
  const k = styleKey(ents, text);
  const rows = D.serve.filter(s => !k || s.k === k);
  if (k && rows.length === 1) { const s = rows[0]; const what = (ents.find(e => ["app", "grape", "region", "climat"].includes(e.type)) || {}).ref;
    return p(say(lang, "serveFor", esc(what ? (what.n || (what.names && what.names[lang])) : s.label[lang].toLowerCase()), s.temp, esc(s.note[lang]))) + p(`<span class="sm-m">${esc(say(lang, "serveTip"))}</span>`); }
  return p(say(lang, "serveTitle")) + ul(D.serve.map(s => `${esc(s.label[lang])}: <b>${s.temp}</b> <span class="sm-m">(${esc(s.note[lang])})</span>`)) + p(`<span class="sm-m">${esc(say(lang, "serveTip"))}</span>`);
}
// the serving style of what was named: S sparkling, Wl/Wf light/full white, Rl/Rf light/full red, D sweet, F fortified
function styleKey(ents, text) {
  const FULLW = ["Chardonnay", "Viognier", "Marsanne", "Roussanne", "Sémillon", "Chenin Blanc", "Pinot Gris", "Gewürztraminer"];
  const LIGHTR = ["Pinot Noir", "Gamay", "Cabernet Franc", "Zweigelt", "Poulsard", "Trousseau", "Frappato", "Nerello Mascalese", "Cinsault"];
  for (const e of ents) {
    if (e.type === "app") { const w = e.ref.wines[0], c = w.cols[0];
      if (c === "s") return "S"; if (c === "d") return "D"; if (c === "f") return "F";
      if (c === "w" && !hasW(text, "red")) return w.grapes.some(g => FULLW.includes(g)) && !["Chablis", "Petit Chablis", "Sancerre", "Pouilly-Fumé", "Muscadet", "Muscadet Sèvre et Maine"].includes(e.ref.n) ? "Wf" : "Wl";
      const rw = e.ref.wines.find(x => x.cols.includes("r")); if (rw) return rw.grapes.some(g => LIGHTR.includes(g)) ? "Rl" : "Rf";
      return "Wl"; }
    if (e.type === "grape") { const g = e.ref; if (g.col === "w") return FULLW.includes(g.n) ? "Wf" : "Wl"; return LIGHTR.includes(g.n) ? "Rl" : "Rf"; }
    if (e.type === "climat") return /R/.test(e.ref.col) && !hasW(text, "white") ? "Rl" : "Wf";
  }
  if (hasW(text, "sparkling")) return "S"; if (hasW(text, "sweet")) return "D"; if (/\bport|portvin|sherry|porto\b/.test(text)) return "F";
  if (hasW(text, "rose")) return "Wl"; if (hasW(text, "white")) return "Wf"; if (hasW(text, "red")) return "Rf";
  return null;
}
function decant(lang, ents, text, years) {
  const old = hasW(text, "oldW") || (years.length && years[0] <= new Date().getFullYear() - 20);
  const k = styleKey(ents, text), names = ents.map(e => e.ref.n).filter(Boolean);
  const isPinot = ents.some(e => (e.type === "grape" && ["Pinot Noir", "Gamay"].includes(e.ref.n)) || (e.type === "app" && ["Bourgogne", "Beaujolais"].includes(e.ref.region)) || e.type === "climat") || /burgund|bourgogne|pinot/.test(text);
  const isPort = /\bport|portvin|porto\b/.test(text) || ents.some(e => e.type === "app" && /^Port/.test(e.ref.n));
  const out = [];
  if (isPort) out.push(say(lang, "decantPort"));
  else if (old) out.push(say(lang, "decantOld"));
  else if (isPinot) out.push(say(lang, "decantPinot"));
  else if (k === "Wl" || k === "Wf" || k === "S") out.push(say(lang, "decantWhite"));
  else out.push(say(lang, "decantYoung", esc(names.length ? listJoin(lang, names.slice(0, 2)) : "Barolo, Bordeaux, Hermitage")));
  if (!old && !isPort && !names.length) out.push(say(lang, "decantPinot"), say(lang, "decantOld"));
  return out.map(p).join("");
}
function foodOf(text) {
  const t = " " + text + " ";
  let best = null, at = 1e9;
  D.food.forEach(f => f.keys.forEach(k => { const kk = norm(k); if (!kk) return; const i = t.indexOf(" " + kk + " "); if (i >= 0 && (i < at || (best && kk.length > 6 && i === at))) { best = f; at = i; } }));
  // blue cheese before cheese, Christmas before duck/pork when both are named
  if (best && /bla ?skimmel|blue cheese|roquefort|stilton|gorgonzola|bleu|blauschimmel/.test(text)) best = D.food.find(f => f.keys.includes("roquefort"));
  if (/jul|christmas|noel|weihnacht/.test(text)) best = D.food.find(f => f.keys.includes("christmas"));
  return best;
}
function pairing(lang, f, ctx) {
  if (!f) return p(say(lang, "pairWhich"));
  let html = p(say(lang, "pairFor", esc(f.label[lang]), esc(f.wines[lang])));
  const ws = (ctx.wines || []).filter(w => left(w) > 0);
  if (ws.length) {
    const m = f.match, gr = w => String(w.grape || "").split(/,\s*/).map(norm);
    const fits = ws.filter(w => (m.g || []).some(g => gr(w).includes(norm(g))) || (m.r || []).includes(w.region) && (!m.s || styleOk(m.s, w)));
    const ready = fits.filter(w => { const r = ctx.readiness && ctx.readiness(w); return !r || r.k === "now" || r.k === "past"; });
    const pickList = (ready.length ? ready : fits).slice(0, 5);
    if (pickList.length) html += p(say(lang, ready.length ? "pairCellar" : "pairCellarAny", "")) + ul(pickList.map(w => wineLine(lang, w)));
  }
  return html;
}
const styleOk = (s, w) => ({ R: "Rød", W: "Hvid", S: "Bobler", P: "Rosé" })[s] ? w.style === ({ R: "Rød", W: "Hvid", S: "Bobler", P: "Rosé" })[s] : true;

function examples(lang, ctx) {
  const prod = ((ctx.wines || []).find(w => left(w) > 0 && w.producer) || {}).producer;
  const E = {
    en: ["What grape is Sancerre?", "Is 2005 a good year for red Côte de Nuits?", "What should I drink now?", "What goes with lamb?", prod ? `Where is my ${prod}?` : "Who owns Musigny?", "What is a monopole?", "How cold should I serve Chablis?", "Should I decant Barolo?", "How long can I keep Barolo?", "Recommend a Barolo under 100 €", "Barolo or Barbaresco?"],
    da: ["Hvilken drue er Sancerre?", "Er 2005 en god årgang for rød Côte de Nuits?", "Hvad skal jeg drikke nu?", "Hvad passer til lam?", prod ? `Hvor er min ${prod}?` : "Hvem ejer Musigny?", "Hvad er en monopole?", "Hvor kold skal Chablis serveres?", "Skal Barolo dekanteres?", "Hvor længe kan jeg lagre Barolo?", "Anbefal en Barolo under 800 kr", "Barolo eller Barbaresco?"],
    fr: ["Quel cépage pour le Sancerre ?", "2005 est-il un bon millésime pour la Côte de Nuits rouge ?", "Que boire maintenant ?", "Quel vin avec l'agneau ?", prod ? `Où est mon ${prod} ?` : "Qui possède le Musigny ?", "Qu'est-ce qu'un monopole ?", "À quelle température servir un Chablis ?", "Faut-il carafer un Barolo ?", "Combien de temps garder un Barolo ?", "Conseille-moi un Barolo à moins de 100 €", "Barolo ou Barbaresco ?"],
    de: ["Welche Rebsorte ist Sancerre?", "Ist 2005 ein guter Jahrgang für rote Côte de Nuits?", "Was soll ich jetzt trinken?", "Was passt zu Lamm?", prod ? `Wo ist mein ${prod}?` : "Wem gehört Musigny?", "Was ist ein Monopol?", "Wie kalt serviert man Chablis?", "Soll ich Barolo dekantieren?", "Wie lange kann ich Barolo lagern?", "Empfiehl einen Barolo unter 100 €", "Barolo oder Barbaresco?"],
  };
  return E[lang] || E.en;
}
function help(lang, ctx) { return p(say(lang, "hello")) + p(say(lang, "tryAsk")) + ul(examples(lang, ctx).map(esc)); }
function chips(lang, ctx) { return examples(lang, ctx).slice(0, 4); }

const api = { answer, findEntities: (q, burg) => findEntities(norm(q), buildIndex(burg)), SAY, examples };
if (node) module.exports = api;
else root.SOMMELIER = api;
})(typeof window !== "undefined" ? window : globalThis);
