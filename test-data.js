// Test wines for a test account (Admin → Test users; Account → Test data): plausible bottles across the regions the
// app knows, so every list, chart, filter and atlas link has something to show. Loaded only when asked for.
//   TESTDATA.wines(n, kind) → n wines in the shape of a bulk import (addmany)
"use strict";
(function (root) {
  // [producer, wine, country, region, commune, classification, type, grape, price low, price high]
  const W = [
    ["Armand Rousseau", "Clos Saint-Jacques", "Frankrig", "Bourgogne", "Gevrey-Chambertin", "1. cru", "Rød", "Pinot Noir", 2200, 4800],
    ["Domaine Ponsot", "Clos de la Roche Vieilles Vignes", "Frankrig", "Bourgogne", "Morey-Saint-Denis", "Grand Cru", "Rød", "Pinot Noir", 2500, 5200],
    ["Sylvain Cathiard", "Aux Malconsorts", "Frankrig", "Bourgogne", "Vosne-Romanée", "1. cru", "Rød", "Pinot Noir", 2400, 4200],
    ["Domaine Leflaive", "Les Pucelles", "Frankrig", "Bourgogne", "Puligny-Montrachet", "1. cru", "Hvid", "Chardonnay", 1400, 2600],
    ["Domaine Roulot", "Meursault", "Frankrig", "Bourgogne", "Meursault", "", "Hvid", "Chardonnay", 700, 1300],
    ["Domaine de Montille", "Taillepieds", "Frankrig", "Bourgogne", "Volnay", "1. cru", "Rød", "Pinot Noir", 650, 1100],
    ["William Fèvre", "Les Clos", "Frankrig", "Bourgogne", "Chablis", "Grand Cru", "Hvid", "Chardonnay", 600, 1000],
    ["Raveneau", "Montée de Tonnerre", "Frankrig", "Bourgogne", "Chablis", "1. cru", "Hvid", "Chardonnay", 900, 1800],
    ["Domaine Faiveley", "Clos des Myglands", "Frankrig", "Bourgogne", "Mercurey", "1. cru", "Rød", "Pinot Noir", 250, 400],
    ["Château-Fuissé", "Le Clos", "Frankrig", "Bourgogne", "Pouilly-Fuissé", "1. cru", "Hvid", "Chardonnay", 300, 500],
    ["Jean Foillard", "Morgon Côte du Py", "Frankrig", "Beaujolais", "Morgon", "", "Rød", "Gamay", 220, 320],
    ["Château Thivin", "Côte de Brouilly", "Frankrig", "Beaujolais", "Côte de Brouilly", "", "Rød", "Gamay", 160, 240],
    ["Château Latour", "Grand Vin", "Frankrig", "Bordeaux", "Pauillac", "1er Grand Cru Classé", "Rød", "Cabernet Sauvignon", 5000, 9000],
    ["Château Léoville Las Cases", "Grand Vin", "Frankrig", "Bordeaux", "Saint-Julien", "2ème Grand Cru Classé", "Rød", "Cabernet Sauvignon", 1600, 2800],
    ["Château Palmer", "Grand Vin", "Frankrig", "Bordeaux", "Margaux", "3ème Grand Cru Classé", "Rød", "Merlot", 2200, 3600],
    ["Château Climens", "Barsac", "Frankrig", "Bordeaux", "Barsac", "1er Cru Classé", "Hvid", "Sémillon", 500, 900],
    ["E. Guigal", "Côte-Rôtie Brune et Blonde", "Frankrig", "Rhône", "Côte-Rôtie", "", "Rød", "Syrah", 450, 700],
    ["Jean-Louis Chave", "Hermitage", "Frankrig", "Rhône", "Hermitage", "", "Rød", "Syrah", 1800, 3000],
    ["Château de Beaucastel", "Châteauneuf-du-Pape", "Frankrig", "Rhône", "Châteauneuf-du-Pape", "", "Rød", "Grenache", 450, 750],
    ["Domaine Tempier", "La Migoua", "Frankrig", "Provence", "Bandol", "", "Rød", "Mourvèdre", 380, 550],
    ["Jean Macle", "Château-Chalon", "Frankrig", "Jura", "Château-Chalon", "", "Hvid", "Savagnin", 450, 650],
    ["Domaine Vacheron", "Les Romains", "Frankrig", "Loire", "Sancerre", "", "Hvid", "Sauvignon Blanc", 280, 420],
    ["Domaine Huet", "Le Haut-Lieu Sec", "Frankrig", "Loire", "Vouvray", "", "Hvid", "Chenin Blanc", 250, 380],
    ["Clos Rougeard", "Le Bourg", "Frankrig", "Loire", "Saumur-Champigny", "", "Rød", "Cabernet Franc", 1200, 2000],
    ["Zind-Humbrecht", "Rangen Clos Saint-Urbain Riesling", "Frankrig", "Alsace", "Thann", "Grand Cru", "Hvid", "Riesling", 450, 700],
    ["Krug", "Grande Cuvée", "Frankrig", "Champagne", "Reims", "", "Bobler", "Chardonnay", 1400, 1900],
    ["Bollinger", "La Grande Année", "Frankrig", "Champagne", "Aÿ", "Grand Cru", "Bobler", "Pinot Noir", 900, 1300],
    ["Egly-Ouriet", "Brut Rosé Grand Cru", "Frankrig", "Champagne", "Ambonnay", "Grand Cru", "Rose", "Pinot Noir", 700, 1000],
    ["Egon Müller", "Scharzhofberger Kabinett", "Tyskland", "Mosel", "Wiltingen", "Kabinett", "Hvid", "Riesling", 450, 800],
    ["J.J. Prüm", "Wehlener Sonnenuhr Spätlese", "Tyskland", "Mosel", "Wehlen", "Spätlese", "Hvid", "Riesling", 350, 600],
    ["Dönnhoff", "Hermannshöhle GG", "Tyskland", "Nahe", "Niederhausen", "Grosses Gewächs", "Hvid", "Riesling", 450, 650],
    ["Keller", "Kirchspiel GG", "Tyskland", "Rheinhessen", "Westhofen", "Grosses Gewächs", "Hvid", "Riesling", 700, 1200],
    ["Giacomo Conterno", "Barolo Cascina Francia", "Italien", "Piemonte", "Monforte d'Alba", "", "Rød", "Nebbiolo", 1300, 2200],
    ["Bruno Giacosa", "Barbaresco Asili", "Italien", "Piemonte", "Barbaresco", "", "Rød", "Nebbiolo", 900, 1600],
    ["Biondi-Santi", "Brunello di Montalcino", "Italien", "Toscana", "Montalcino", "", "Rød", "Sangiovese", 800, 1400],
    ["Tenuta San Guido", "Sassicaia", "Italien", "Toscana", "Bolgheri", "", "Rød", "Cabernet Sauvignon", 1800, 2800],
    ["López de Heredia", "Viña Tondonia Reserva", "Spanien", "Rioja", "Haro", "Reserva", "Rød", "Tempranillo", 350, 550],
    ["Vega Sicilia", "Valbuena 5°", "Spanien", "Ribera del Duero", "Valbuena de Duero", "", "Rød", "Tempranillo", 1000, 1500],
    ["Quinta do Noval", "Vintage Port", "Portugal", "Douro", "Pinhão", "", "Rød", "Touriga Nacional", 700, 1200],
    ["F.X. Pichler", "Kellerberg Smaragd", "Østrig", "Wachau", "Dürnstein", "Smaragd", "Hvid", "Grüner Veltliner", 450, 700],
  ];
  const SUPPLIERS = ["Vinimportøren", "Kjærgaard", "Philipson Wine", "Laudrup Vin", "Juul's Vin", "Direkte fra producenten"];
  const PLACES = ["Kælder, reol 1", "Kælder, reol 2", "Kælder, reol 3", "Vinkøleskab", "Lager"];
  // a seeded random, so a run is varied but the same n gives the same cellar (easy to compare)
  function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
  function wines(n, kind) {
    const r = rng(n * 7919 + (kind || "").length), pick = a => a[Math.floor(r() * a.length)];
    const Y = new Date().getFullYear(), biz = kind && kind !== "private", glass = kind === "restaurant", out = [];
    // the list in a shuffled order, so ten wines already span the regions
    const order = W.map((_, i) => i); for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    for (let i = 0; i < n; i++) {
      const [producer, name, country, region, commune, classification, type, grape, lo, hi] = W[order[i % W.length]];
      const vintage = type === "Bobler" && r() < 0.4 ? "" : Y - 2 - Math.floor(r() * 18);
      const price = Math.round((lo + r() * (hi - lo)) / 10) * 10;
      // drink windows: some past, most open now, some still young; a few left to the app's estimate
      const v = typeof vintage === "number" ? vintage : Y - 3, w = r();
      const drinkFrom = w < 0.15 ? "" : w < 0.3 ? v + 2 : w < 0.85 ? Math.min(Y - 1, v + 3) : Y + 1 + Math.floor(r() * 5);
      const drinkTo = drinkFrom === "" ? "" : w < 0.3 ? Y - 1 - Math.floor(r() * 3) : drinkFrom + 6 + Math.floor(r() * 14);
      const qty = biz ? 1 + Math.floor(r() * 24) : 1 + Math.floor(r() * 6);
      const acquired = `${Y - Math.floor(r() * 4)}-${String(1 + Math.floor(r() * 12)).padStart(2, "0")}-${String(1 + Math.floor(r() * 28)).padStart(2, "0")}`;
      const x = { producer, name, vintage, country, region, commune, classification, type, grape, qty, price, acquired,
        drinkFrom, drinkTo, location: pick(PLACES), source: biz ? pick(SUPPLIERS) : (r() < 0.5 ? pick(SUPPLIERS) : "") };
      if (biz) {
        const card = Math.round(price * (2.2 + r() * 1.2) / 5) * 5;
        if (r() < 0.85) x.menuPrice = card;
        if (glass && r() < 0.35) x.glassPrice = Math.round(card / 4.5 / 5) * 5;
        if (r() < 0.6) x.par = Math.floor(r() * 7);
      }
      out.push(x);
    }
    return out;
  }
  root.TESTDATA = { wines };
  if (typeof module !== "undefined") module.exports = root.TESTDATA;
})(typeof window !== "undefined" ? window : globalThis);

// ── the buttons (Admin → Test users; Account → Test data), with app.js's globals ──
(function (root) {
  if (typeof document === "undefined") return;
  const T = root.TESTDATA, A = "abcdefghjkmnpqrstuvwxyz23456789";
  const rnd = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => A[b % A.length]).join("");
  async function makeUser(kind) {
    const out = $("adminTestOut"); $("adminErr").textContent = tr("Making the keys…");
    const user = `test-${kind}-${rnd(4)}`, pass = rnd(14);
    const k = await VAULT.newKeys(pass);
    ADMIN = await api(Object.assign({ action: "admintestuser", member: user }, k.fields));
    try { localStorage.setItem("vinKind:" + user, kind); } catch (e) {} // its kind, when it first logs in on this device
    $("adminErr").textContent = ""; renderAdmin();
    out.innerHTML = `<p>${esc(tr("Test user made. Log in with it in a private window:"))}</p>
      <p class="code">${esc(user)}<br>${esc(pass)}</p>
      <p><button type="button" class="btn" id="adminTestCopy">${esc(tr("Copy"))}</button> <span class="ph">${esc(tr("In a private window, set its kind under Account (here it's set already)."))}</span></p>`;
    $("adminTestCopy").onclick = async () => { try { await navigator.clipboard.writeText(user + "\n" + pass); toast(tr("Copied")); } catch (e) { window.prompt(tr("Copy"), user + " " + pass); } };
  }
  async function clearUsers() {
    const list = ((ADMIN && ADMIN.users) || []).filter(u => u.test);
    if (!list.length) { toast(tr("No test users")); return; }
    if (!(await ask(tr("Remove all {0} test users and everything in them?", list.length), { ok: tr("Remove") }))) return;
    for (const u of list) { $("adminErr").textContent = tr("Removing {0}…", u.user); ADMIN = await api({ action: "admindelete", member: u.user }); }
    $("adminErr").textContent = ""; $("adminTestOut").innerHTML = ""; renderAdmin(); toast(tr("Test users removed"));
  }
  // in parts, as the import does: a plain sheet takes a few hundred rows a call, an encrypted cellar thousands
  async function addWines(n) {
    const msg = $("acctTestMsg"), list = T.wines(n, KIND), size = window.VAULT && VAULT.active() ? 4000 : 400;
    let done = 0;
    for (let i = 0; i < list.length; i += size) {
      msg.textContent = tr("Adding… {0} of {1}", fmt(done), fmt(list.length));
      const res = await api({ action: "addmany", wines: list.slice(i, i + size), bumps: [] });
      done = Math.min(list.length, i + size); WINES = normalize(res.wines);
    }
    renderOverview(); renderTable(); renderEnjoyed(); msg.textContent = tr("{0} test wines added", fmt(done));
  }
  T.ui = { makeUser, clearUsers, addWines };
})(typeof window !== "undefined" ? window : globalThis);
