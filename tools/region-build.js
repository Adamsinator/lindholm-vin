#!/usr/bin/env node
// A region pack for the region atlas (atlas.html): INAO's vineyard outlines for one wine region, from IGN's
// Géoplateforme (WFS layer AOC-VITICOLES:aire_parcellaire, Licence Ouverte), named, merged and simplified.
//
//   node tools/region-build.js chablis            (needs curl; downloads are cached in tools/.region-cache)
//
// Each INAO record is a piece of land with the list of appellations it may carry ("Chablis,Chablis premier cru,
// Chablis premier cru Vosgros,Petit Chablis"). Its place in the pack is the highest of them:
//   a named grand cru → that climat · a named premier cru → that climat · the premier cru with no name given →
//   one area per patch, named after IGN's place names (BD TOPO) that lie inside it · the village appellation →
//   "village" layer · anything else of the region's (Petit Chablis…) → "regional" layer.
// The regions and their appellations are in REGIONS below; nothing is guessed beyond them.
// Output: ../atlas-<id>.js (coordinates in metres from the pack's origin, rounded, simplified to ~3 m).
"use strict";
const fs = require("fs"), path = require("path"), { execFile } = require("child_process");
const pc = require("./node_modules/polygon-clipping");
const ROOT = path.resolve(__dirname, ".."), CACHE = path.join(__dirname, ".region-cache"); fs.mkdirSync(CACHE, { recursive: true });
const TOL = Number(process.env.TOL || 3);

// bbox: [south, west, north, east] (what to fetch); apps: the region's village appellations, each with its premiers
// crus (and grands crus) as INAO writes them ("Mercurey premier cru Clos des Myglands"), the colour its climats usually
// are (R, W, RW), and for Chablis the names that belong to each premier cru; regional: the appellations drawn as
// "regional" land. Anything else on INAO's map inside the box (other regions' appellations) is left out.
const REGIONS = {
  chablis: { name: "Chablis", country: "Frankrig", region: "Bourgogne", bbox: [47.70, 3.60, 47.92, 3.98],
    apps: [{ ap: "Chablis", gc: "Chablis Grand Cru", col: "W",
      // the 17 premiers crus and the 23 names that may be sold under them (INAO, cahier des charges de l'AOC Chablis
      // premier cru), as the place names on IGN's map spell them: a patch INAO leaves unnamed takes the climat whose
      // place name lies inside it or within 600 m, and is marked as inferred
      groups: { "Montée de Tonnerre": ["montee de tonnerre", "chapelot", "pied d alou", "brechain"], "Mont de Milieu": ["mont de milieu"],
        "Fourchaume": ["fourchaume", "vaupulent", "cote de fontenay", "vaulorent", "homme mort"],
        "Vaillons": ["vaillons", "chatains", "seche", "beugnons", "les lys", "melinots", "roncieres", "epinottes"],
        "Montmains": ["montmains", "foret", "butteaux"], "Côte de Léchet": ["lechet"], "Beauroy": ["beauroy", "boroy", "troesmes", "cote de savant"],
        "Vau Ligneau": ["vau ligneau", "vauligneau"], "Vau de Vey": ["vau de vey", "vaux ragons"], "Vaucoupin": ["vaucoupin"],
        "Vosgros": ["vosgros", "vaugiraut"], "Les Fourneaux": ["fourneaux", "morein", "pres girots"], "Côte de Vaubarousse": ["vaubarousse"],
        "Berdiot": ["berdiot"], "Chaume de Talvat": ["talvat"], "Côte de Jouan": ["jouan"], "Les Beauregards": ["beauregards", "cuissy"] } }],
    regional: [/^Petit Chablis$/] },
  chalonnaise: { name: "Côte Chalonnaise", country: "Frankrig", region: "Bourgogne", bbox: [46.60, 4.55, 46.95, 4.82],
    apps: [{ ap: "Bouzeron", col: "W" }, { ap: "Rully", col: "RW" }, { ap: "Mercurey", col: "RW" }, { ap: "Givry", col: "RW" }, { ap: "Montagny", col: "W" }],
    regional: [/^Bourgogne Côte Chalonnaise$/] },
  maconnais: { name: "Mâconnais", country: "Frankrig", region: "Bourgogne", bbox: [46.20, 4.60, 46.55, 4.90],
    apps: [{ ap: "Pouilly-Fuissé", col: "W" }, { ap: "Pouilly-Vinzelles", col: "W" }, { ap: "Pouilly-Loché", col: "W" }, { ap: "Saint-Véran", col: "W" }, { ap: "Viré-Clessé", col: "W" }],
    regional: [/^Mâcon/] },
  // the 51 grands crus, each its own appellation ("Alsace grand cru Rangen"); the rest is AOC Alsace
  alsace: { name: "Alsace", country: "Frankrig", region: "Alsace", bbox: [47.78, 7.0, 48.66, 7.56], bgTol: 4,
    apps: [{ ap: "Alsace", gc: "Alsace Grand Cru", col: "W" }], regional: [] },
  // the Northern Rhône has no crus inside its appellations: each cru appellation is itself the "climat" (c: "AOC"),
  // as INAO spells it (inao) under the name on the label (ap); the Côtes du Rhône around them is the regional land
  rhone: { name: "Rhône (north)", country: "Frankrig", region: "Rhône", bbox: [44.90, 4.60, 45.55, 4.95], bgTol: 5,
    apps: [{ ap: "Côte-Rôtie", inao: "Côte Rôtie", col: "R", cru: true }, { ap: "Condrieu", col: "W", cru: true }, { ap: "Château-Grillet", col: "W", cru: true },
      { ap: "Hermitage", inao: "Hermitage ou Ermitage ou l'Hermitage ou l'Ermitage", col: "RW", cru: true }, { ap: "Cornas", col: "R", cru: true },
      { ap: "Crozes-Hermitage", inao: "Crozes-Hermitage ou Crozes-Ermitage", col: "RW", cru: true }, { ap: "Saint-Joseph", col: "RW", cru: true },
      { ap: "Saint-Péray", col: "W", cru: true }],
    regional: [/^Côtes du Rhône$/] },
  // the Beaujolais: its ten crus, each an appellation of its own (as the Northern Rhône's are), on the Beaujolais-Villages land
  beaujolais: { name: "Beaujolais", country: "Frankrig", region: "Beaujolais", bbox: [46.05, 4.55, 46.30, 4.80], bgTol: 5,
    apps: [{ ap: "Saint-Amour", col: "R", cru: true }, { ap: "Juliénas", col: "R", cru: true }, { ap: "Chénas", col: "R", cru: true },
      { ap: "Moulin-à-Vent", col: "R", cru: true }, { ap: "Fleurie", col: "R", cru: true }, { ap: "Chiroubles", col: "R", cru: true },
      { ap: "Morgon", col: "R", cru: true }, { ap: "Régnié", col: "R", cru: true }, { ap: "Côte de Brouilly", col: "R", cru: true },
      { ap: "Brouilly", col: "R", cru: true }],
    regional: [/^Beaujolais Villages$/] },
  // the Southern Rhône: its cru appellations, on the Côtes du Rhône Villages land (the named villages with it)
  rhonesud: { name: "Rhône (south)", country: "Frankrig", region: "Rhône", bbox: [43.95, 4.60, 44.36, 5.12], bgTol: 6,
    apps: [{ ap: "Châteauneuf-du-Pape", col: "RW", cru: true }, { ap: "Gigondas", col: "R", cru: true }, { ap: "Vacqueyras", col: "RW", cru: true },
      { ap: "Beaumes de Venise", col: "R", cru: true }, { ap: "Rasteau", col: "R", cru: true }, { ap: "Cairanne", col: "RW", cru: true },
      { ap: "Vinsobres", col: "R", cru: true }, { ap: "Lirac", col: "RW", cru: true }, { ap: "Tavel", col: "R", cru: true }],
    regional: [/^Côtes du Rhône Villages/],
    // INAO's parcel map (aire_parcellaire) has no Vacqueyras: not by any spelling, nor round the village (checked 2026-10)
    absent: ["Vacqueyras"] },
  // the Loire, in three maps. Each appellation is its own "climat", as in the Rhône; where two share land (the
  // Savennières crus inside Savennières, Quarts de Chaume inside the Coteaux du Layon) the first listed wins.
  // Centre-Loire: Sancerre and Pouilly-Fumé across the river, Menetou-Salon, Quincy and Reuilly to the west
  centreloire: { name: "Centre-Loire", country: "Frankrig", region: "Loire", bbox: [47.0, 1.95, 47.75, 3.1], bgTol: 5,
    apps: [{ ap: "Sancerre", col: "RW", cru: true }, { ap: "Pouilly-Fumé", inao: "Pouilly-Fumé ou Blanc Fumé de Pouilly", col: "W", cru: true, aka: ["Blanc Fumé de Pouilly"] },
      { ap: "Menetou-Salon", col: "RW", cru: true }, { ap: "Quincy", col: "W", cru: true }, { ap: "Reuilly", col: "RW", cru: true },
      { ap: "Coteaux du Giennois", col: "RW", cru: true }],
    regional: [] },
  // Touraine's crus and Saumur-Champigny next to Chinon (Saint-Nicolas-de-Bourgueil before Bourgueil)
  touraine: { name: "Touraine & Saumur", country: "Frankrig", region: "Loire", bbox: [47.08, -0.2, 47.48, 1.0], bgTol: 5,
    apps: [{ ap: "Vouvray", col: "W", cru: true }, { ap: "Montlouis-sur-Loire", col: "W", cru: true, aka: ["Montlouis"] },
      { ap: "Saint-Nicolas-de-Bourgueil", col: "R", cru: true }, { ap: "Bourgueil", col: "R", cru: true }, { ap: "Chinon", col: "R", cru: true },
      { ap: "Saumur-Champigny", col: "R", cru: true }],
    regional: [] },
  // Anjou: Savennières and its two crus on the north bank; on the Layon, Quarts de Chaume (grand cru since 2011),
  // Bonnezeaux, and the Coteaux du Layon with its premier cru Chaume
  anjou: { name: "Anjou", country: "Frankrig", region: "Loire", bbox: [47.15, -0.85, 47.45, -0.35], bgTol: 5,
    apps: [{ ap: "Coulée de Serrant", col: "W", cru: true, aka: ["Savennières Coulée de Serrant"] },
      { ap: "Savennières Roche aux Moines", col: "W", cru: true, aka: ["Roche aux Moines"] }, { ap: "Savennières", col: "W", cru: true },
      { ap: "Quarts de Chaume", col: "W", cru: true, cls: "GC" }, { ap: "Bonnezeaux", col: "W", cru: true }, { ap: "Coteaux du Layon", col: "W" }],
    regional: [] },
  // Bordeaux: the cru appellations (each its own climat, as in the Rhône) over Haut-Médoc, Médoc and Graves; the
  // classified châteaux are points, placed on IGN's châteaux (BD TOPO, nature "Château") inside their appellation.
  // A parcel's first appellation in this list wins (Barsac before Sauternes, Canon-Fronsac before Fronsac); the Bordeaux / Bordeaux supérieur land under everything is left out (it's most of the Gironde)
  bordeaux: { name: "Bordeaux", country: "Frankrig", region: "Bordeaux", bbox: [44.45, -1.0, 45.55, 0.0], bgTol: 6,
    apps: [{ ap: "Saint-Estèphe", col: "R", cru: true }, { ap: "Pauillac", col: "R", cru: true }, { ap: "Saint-Julien", col: "R", cru: true },
      { ap: "Margaux", col: "R", cru: true }, { ap: "Listrac-Médoc", col: "R", cru: true }, { ap: "Moulis-en-Médoc", inao: "Moulis ou Moulis-en-Médoc", col: "R", cru: true },
      { ap: "Pessac-Léognan", col: "RW", cru: true }, { ap: "Barsac", col: "W", cru: true }, { ap: "Sauternes", col: "W", cru: true },
      { ap: "Saint-Émilion Grand Cru", inao: "Saint-Emilion grand cru", col: "R", cru: true }, { ap: "Pomerol", col: "R", cru: true },
      { ap: "Lalande-de-Pomerol", col: "R", cru: true }, { ap: "Canon-Fronsac", inao: "Canon Fronsac", col: "R", cru: true }, { ap: "Fronsac", col: "R", cru: true },
      { ap: "Haut-Médoc", col: "R" }, { ap: "Médoc", col: "R" }, { ap: "Graves", col: "RW" }],
    regional: [],
    // the 1855 classification: the red wines of the Médoc (and Haut-Brion), and the sweet wines of Sauternes and
    // Barsac; each with its appellation (where to look for it on IGN's map) and any other name it goes by there
    points: { "1855-1": ["Lafite Rothschild|Pauillac", "Latour|Pauillac", "Margaux|Margaux", "Haut-Brion|Pessac-Léognan", "Mouton Rothschild|Pauillac"],
      "1855-2": ["Rauzan-Ségla|Margaux", "Rauzan-Gassies|Margaux", "Léoville Las Cases|Saint-Julien", "Léoville Poyferré|Saint-Julien", "Léoville Barton|Saint-Julien",
        "Durfort-Vivens|Margaux", "Gruaud Larose|Saint-Julien", "Lascombes|Margaux", "Brane-Cantenac|Margaux", "Pichon Baron|Pauillac|Pichon-Longueville",
        "Pichon Longueville Comtesse de Lalande|Pauillac|Pichon-Longueville-Comtesse-de-Lalande", "Ducru-Beaucaillou|Saint-Julien", "Cos d'Estournel|Saint-Estèphe", "Montrose|Saint-Estèphe"],
      "1855-3": ["Kirwan|Margaux", "d'Issan|Margaux", "Lagrange|Saint-Julien", "Langoa Barton|Saint-Julien", "Giscours|Margaux", "Malescot St. Exupéry|Margaux|Malescot-Saint-Exupéry",
        "Cantenac Brown|Margaux", "Boyd-Cantenac|Margaux", "Palmer|Margaux", "La Lagune|Haut-Médoc", "Desmirail|Margaux", "Calon-Ségur|Saint-Estèphe", "Ferrière|Margaux",
        "Marquis d'Alesme|Margaux|Marquis d'Alesme Becker"],
      "1855-4": ["Saint-Pierre|Saint-Julien", "Talbot|Saint-Julien", "Branaire-Ducru|Saint-Julien", "Duhart-Milon|Pauillac", "Pouget|Margaux", "La Tour Carnet|Haut-Médoc",
        "Lafon-Rochet|Saint-Estèphe", "Beychevelle|Saint-Julien", "Prieuré-Lichine|Margaux", "Marquis de Terme|Margaux"],
      "1855-5": ["Pontet-Canet|Pauillac", "Batailley|Pauillac", "Haut-Batailley|Pauillac", "Grand-Puy-Lacoste|Pauillac", "Grand-Puy Ducasse|Pauillac", "Lynch-Bages|Pauillac",
        "Lynch-Moussas|Pauillac", "Dauzac|Margaux", "d'Armailhac|Pauillac|Mouton Baronne Philippe", "du Tertre|Margaux", "Haut-Bages Libéral|Pauillac", "Pédesclaux|Pauillac",
        "Belgrave|Haut-Médoc", "Camensac|Haut-Médoc", "Cos Labory|Saint-Estèphe", "Clerc Milon|Pauillac", "Croizet-Bages|Pauillac", "Cantemerle|Haut-Médoc"],
      "sau-0": ["d'Yquem|Sauternes|Yquem"],
      "sau-1": ["La Tour Blanche|Sauternes", "Lafaurie-Peyraguey|Sauternes", "Clos Haut-Peyraguey|Sauternes|Haut-Peyraguey", "Rayne Vigneau|Sauternes|Rayne-Vigneau", "Suduiraut|Sauternes",
        "Coutet|Barsac", "Climens|Barsac", "Guiraud|Sauternes", "Rieussec|Sauternes", "Rabaud-Promis|Sauternes", "Sigalas Rabaud|Sauternes"],
      "sau-2": ["de Myrat|Barsac|Myrat", "Doisy Daëne|Barsac", "Doisy-Dubroca|Barsac", "Doisy-Védrines|Barsac", "d'Arche|Sauternes|Arche", "Filhot|Sauternes", "Broustet|Barsac",
        "Nairac|Barsac", "Caillou|Barsac", "Suau|Barsac", "de Malle|Sauternes|Malle", "Romer|Sauternes", "Romer du Hayot|Sauternes", "Lamothe|Sauternes", "Lamothe Guignard|Sauternes|Lamothe-Guignard"] } },
  // Germany (Rhineland-Palatinate): every Einzellage of the Weinbergsrolle, from the Landwirtschaftskammer's own
  // download (dl-de/by-2-0, credit below), one pack per Anbaugebiet. No classification on it: the VDP's Grosse Lage
  // is a private association's, not the law's. Rheingau is Hessen's, which hasn't published its register.
  mosel: { name: "Mosel", country: "Tyskland", region: "Mosel", kind: "lagen", gebiet: "Mosel" },
  nahe: { name: "Nahe", country: "Tyskland", region: "Nahe", kind: "lagen", gebiet: "Nahe" },
  pfalz: { name: "Pfalz", country: "Tyskland", region: "Pfalz", kind: "lagen", gebiet: "Pfalz" },
  rheinhessen: { name: "Rheinhessen", country: "Tyskland", region: "Rheinhessen", kind: "lagen", gebiet: "Rheinhessen" },
  mittelrhein: { name: "Mittelrhein", country: "Tyskland", region: "Mittelrhein", kind: "lagen", gebiet: "Mittelrhein" },
  ahr: { name: "Ahr", country: "Tyskland", region: "Ahr", kind: "lagen", gebiet: "Ahr" },
  // INAO's map has no Champagne: its delimitation was never published as data. Its grands and premiers crus are whole
  // villages (the échelle des crus), so a cru here is the vines (IGN BD TOPO, nature "Vigne") inside that village's
  // boundary (IGN ADMIN EXPRESS; the old commune where it has since merged: Aÿ, Oger, Vertus, Coligny…); the other
  // vines in the box are the "village" land
  champagne: { name: "Champagne", country: "Frankrig", region: "Champagne", bbox: [48.80, 3.80, 49.32, 4.35], kind: "villages", col: "S", cruTol: 10, bgTol: 8, minHa: 0.5,
    crus: {
      GC: { "Montagne de Reims": ["Ambonnay", "Beaumont-sur-Vesle", "Bouzy", "Louvois", "Mailly-Champagne", "Puisieulx", "Sillery", "Verzenay", "Verzy"],
        "Côte des Blancs": ["Avize", "Chouilly", "Cramant", "Le Mesnil-sur-Oger", "Oger", "Oiry"], "Vallée de la Marne": ["Aÿ", "Tours-sur-Marne"] },
      "1er": { "Montagne de Reims": ["Bezannes", "Billy-le-Grand", "Chamery", "Chigny-les-Roses", "Cormontreuil", "Coulommes-la-Montagne", "Écueil", "Jouy-lès-Reims",
          "Les Mesneux", "Ludes", "Montbré", "Pargny-lès-Reims", "Rilly-la-Montagne", "Sacy", "Sermiers", "Taissy", "Trépail", "Trois-Puits", "Vaudemange",
          "Ville-Dommange", "Villers-Allerand", "Villers-aux-Nœuds", "Villers-Marmery", "Vrigny"],
        "Côte des Blancs": ["Bergères-lès-Vertus", "Coligny|Val-des-Marais", "Cuis", "Étréchy", "Grauves", "Vertus", "Villeneuve-Renneville-Chevigny", "Voipreux"],
        "Vallée de la Marne": ["Avenay-Val-d'Or", "Bisseuil", "Champillon", "Cumières", "Dizy", "Hautvillers", "Mareuil-sur-Aÿ", "Mutigny", "Pierry", "Tauxières-Mutry"] } },
    notes: { chouilly: { en: "Grand cru for its Chardonnay; its Pinot Noir is rated premier cru.", fr: "Grand cru pour son chardonnay ; son pinot noir est classé premier cru.",
        de: "Grand Cru für seinen Chardonnay; sein Pinot Noir gilt als Premier Cru.", da: "Grand cru for sin chardonnay; dens pinot noir er klassificeret premier cru." },
      coligny: { en: "Drawn with the boundary of Val-des-Marais, the commune Coligny merged into, so its neighbours' few vines are included.",
        fr: "Dessiné avec les limites de Val-des-Marais, la commune où Coligny a fusionné : les quelques vignes des voisins y sont comprises.",
        de: "Mit den Grenzen von Val-des-Marais gezeichnet, der Gemeinde, in der Coligny aufging; die wenigen Reben der Nachbarorte sind mit dabei.",
        da: "Tegnet med grænsen for Val-des-Marais, den kommune Coligny er lagt sammen med, så naboernes få vinstokke er med." },
      tours_sur_marne: { en: "Grand cru for its Pinot Noir; its Chardonnay is rated premier cru.", fr: "Grand cru pour son pinot noir ; son chardonnay est classé premier cru.",
        de: "Grand Cru für seinen Pinot Noir; sein Chardonnay gilt als Premier Cru.", da: "Grand cru for sin pinot noir; dens chardonnay er klassificeret premier cru." } } },
};

const id = process.argv[2], R = REGIONS[id];
if (!R) { console.error("usage: node tools/region-build.js <" + Object.keys(REGIONS).join("|") + ">"); process.exit(1); }

// ── download (curl honours the proxy), cached ─────────────────────────────────────────────────────────────────
const curl = url => new Promise((ok, fail) => execFile("curl", ["-sS", "--max-time", "240", "--retry", "6", "--retry-all-errors", "--retry-delay", "3", url],
  { maxBuffer: 1 << 30 }, (e, out) => e ? fail(e) : ok(out)));
async function wfs(layer, extra, name, cql) { // cql: a filter on top of the box (WFS can't take both BBOX and CQL_FILTER),
  // or [filter, geometry field] for a layer whose geometry isn't called "geometrie"
  const file = path.join(CACHE, `${id}-${name}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const [s, w, n, e] = R.bbox, feats = [];
  const [f, geom] = Array.isArray(cql) ? cql : [cql, "geometrie"]; // CQL's BBOX takes longitude first
  const where = cql ? `&CQL_FILTER=${encodeURIComponent(`(${f}) AND BBOX(${geom},${w},${s},${e},${n},'EPSG:4326')`)}`
    : `&BBOX=${s},${w},${n},${e},urn:ogc:def:crs:EPSG::4326`;
  for (let start = 0; ; start += 1000) {
    const url = `https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=${layer}&OUTPUTFORMAT=application/json`
      + `${where}&SRSNAME=EPSG:2154&COUNT=1000&STARTINDEX=${start}${extra || ""}`;
    const d = JSON.parse(await curl(url));
    feats.push(...d.features); process.stderr.write(`  ${name}: ${feats.length}/${d.numberMatched}\n`);
    if (d.features.length < 1000) break;
  }
  fs.writeFileSync(file, JSON.stringify(feats));
  return feats;
}

// ── geometry: Lambert-93 (EPSG:2154, metres, asked for as such) from the region's centre; y grows southwards ───
const lat0 = R.bbox ? (R.bbox[0] + R.bbox[2]) / 2 : 0, lon0 = R.bbox ? (R.bbox[1] + R.bbox[3]) / 2 : 0; // (the German packs set their own)
let E0 = null, N0 = null; // set from the data's own middle
const toM = ([e, n]) => [e - E0, N0 - n];
const polysOf = g => g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
const inM = g => polysOf(g).map(p => p.map(r => r.map(toM)));
function simplify(pts, tol) { // Douglas–Peucker on a closed ring: split at the point farthest from the first, so
  if (pts.length < 5) return pts; // the two halves each have a proper chord (a closed ring's own chord has no length)
  const [x0, y0] = pts[0]; let far = 1;
  pts.forEach(([x, y], i) => { if (Math.hypot(x - x0, y - y0) > Math.hypot(pts[far][0] - x0, pts[far][1] - y0)) far = i; });
  return dp(pts.slice(0, far + 1), tol).concat(dp(pts.slice(far), tol).slice(1));
}
function dp(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / L; if (d > md) { md = d; mi = i; } }
    if (md > tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const ringArea = r => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return s / 2; };
const polyHa = mp => mp.reduce((s, p) => s + Math.abs(ringArea(p[0])) - p.slice(1).reduce((h, r) => h + Math.abs(ringArea(r)), 0), 0) / 1e4;
const union = list => list.length ? pc.union(...list) : [];
const tidy = (mp, tol = TOL) => mp.map(p => p.map(r => simplify(r, tol).map(([x, y]) => [Math.round(x), Math.round(y)])).filter(r => r.length >= 4)).filter(p => p.length);
const inside = ([x, y], ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j];
  if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
const inPoly = (pt, p) => inside(pt, p[0]) && !p.slice(1).some(h => inside(pt, h));
const label = mp => { // a point inside the biggest piece: its ring's centroid if inside, else the midpoint of the widest row
  const p = mp.slice().sort((a, b) => Math.abs(ringArea(b[0])) - Math.abs(ringArea(a[0])))[0]; if (!p) return [0, 0];
  const r = p[0]; let cx = 0, cy = 0; r.forEach(([x, y]) => { cx += x; cy += y; }); cx /= r.length; cy /= r.length;
  if (inPoly([cx, cy], p)) return [Math.round(cx), Math.round(cy)];
  const ys = r.map(q => q[1]), y = (Math.min(...ys) + Math.max(...ys)) / 2, xs = [];
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y)) xs.push(xi + (y - yi) * (xj - xi) / (yj - yi)); }
  xs.sort((a, b) => a - b); return [Math.round((xs[0] + xs[1]) / 2), Math.round(y)];
};
const RANK = { GC: 0, "1er": 1, AOC: 2, EL: 3 };
const slug = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const proper = s => s.replace(/^(les?|la|l')\s/i, m => m.charAt(0).toUpperCase() + m.slice(1).toLowerCase()).replace(/^./, c => c.toUpperCase());

// ── Champagne: a cru is a village; its land is the vines inside the village's boundary ──────────────────────────
async function villagesBuild() {
  const vines = await wfs("BDTOPO_V3:zone_de_vegetation", "&SORTBY=cleabs", "vines", "nature='Vigne'");
  // where a village has merged into a new commune (Aÿ into Aÿ-Champagne, Oger and Vertus into Blancs-Coteaux), the
  // old commune is kept as a "commune déléguée". Coligny merged into Val-des-Marais before IGN's oldest map (2017) and
  // kept none, so "Coligny|Val-des-Marais" takes the merged commune's boundary, and says so
  const layers = [[await wfs("ADMINEXPRESS-COG.LATEST:commune_associee_ou_deleguee", "&SORTBY=cleabs", "delegated"), "nom_officiel"],
    [await wfs("ADMINEXPRESS-COG.LATEST:commune", "&SORTBY=cleabs", "communes"), "nom_officiel"],
    [await wfs("ADMINEXPRESS-COG.2017:commune", "&SORTBY=id", "communes2017", ["insee_dep='51'", "geom"]), "nom_com"]];
  { let e0 = Infinity, e1 = -Infinity, n0 = Infinity, n1 = -Infinity;
    vines.forEach(f => polysOf(f.geometry).forEach(p => p[0].forEach(([e, n]) => { if (e < e0) e0 = e; if (e > e1) e1 = e; if (n < n0) n0 = n; if (n > n1) n1 = n; })));
    E0 = Math.round((e0 + e1) / 2); N0 = Math.round((n0 + n1) / 2); }
  const k = t => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/œ/g, "oe").toLowerCase().replace(/[^a-z]+/g, " ").trim();
  const vp = vines.flatMap(f => inM(f.geometry)).map(p => ({ p, bb: p[0].reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]) }));
  const climats = [], crusLand = [], missing = [];
  for (const [c, areas] of Object.entries(R.crus)) for (const [area, names] of Object.entries(areas)) for (let n of names) {
    const [name, where] = n.split("|"); n = name;
    let f = null; for (const [list, field] of layers) { f = list.find(x => k(String(x.properties[field] || "")) === k(where || n)); if (f) break; }
    if (!f) { missing.push(n); continue; }
    const commune = inM(f.geometry), cb = commune.flatMap(p => p[0]).reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
    const near = vp.filter(v => v.bb[0] < cb[2] && v.bb[2] > cb[0] && v.bb[1] < cb[3] && v.bb[3] > cb[1]).map(v => [v.p]);
    const land = near.length ? pc.intersection(commune, union(near)) : [];
    crusLand.push(commune);
    // thousands of small vine patches: drawn coarser, without the specks (the area counts them all)
    const m = tidy(land, R.cruTol).filter(p => polyHa([p]) >= R.minHa); if (!m.length) { missing.push(n + " (no vines)"); continue; }
    climats.push(Object.assign({ id: slug(n), n, c, ap: c === "GC" ? "Champagne Grand Cru" : "Champagne Premier Cru", app: n, area, col: R.col,
      ha: +polyHa(land).toFixed(2), lp: label(m), g: m }, R.notes[slug(n)] ? { d: R.notes[slug(n)] } : {}, where ? { within: where } : {}));
  }
  if (missing.length) throw new Error("not found on IGN's map: " + missing.join(", "));
  // the other vines: BD TOPO's patches don't overlap, so they're kept as they are (one union of 11 000 patches is
  // more than polygon-clipping manages); a patch belongs to a cru village when its middle lies in one
  const inCru = p => { const r = p[0]; let x = 0, y = 0; r.forEach(q => { x += q[0]; y += q[1]; }); x /= r.length; y /= r.length;
    return crusLand.some(mp => mp.some(poly => inPoly([x, y], poly))); };
  const others = vp.filter(v => !inCru(v.p)).map(v => v.p);
  return { climats, villages: [{ ap: "Champagne", ha: +polyHa(others).toFixed(1), g: tidy(others, TOL * R.bgTol).filter(p => polyHa([p]) >= R.minHa * 3) }], regionalLand: [] };
}

// ── Germany: the Einzellagen of the Weinbergsrolle (Landwirtschaftskammer Rheinland-Pfalz, GeoJSON in WGS84) ────
// Outside France, so no Lambert-93: metres east and south of the pack's middle on a local equirectangular grid
// (meta.proj "eq", meta.origin), good to a few metres across one Anbaugebiet
const LAGEN_URL = "https://geodaten.lwk-rlp.de/cgi-bin/qgis_mapserv.fcgi?MAP=/home/qgis/projects/gg_wfslvermgeo_lokal.qgs&SERVICE=WFS&VERSION=1.3.0&REQUEST=GetFeature&outputFormat=geojson&typeName=weinlagen_recht";
async function lagenBuild() {
  const file = path.join(CACHE, "de-weinlagen.json");
  if (!fs.existsSync(file)) fs.writeFileSync(file, await curl(LAGEN_URL));
  // "Einzellagenfrei in GL …" is vineyard land in no Einzellage: not a site, so left out
  const all = JSON.parse(fs.readFileSync(file, "utf8")).features.filter(f => f.properties.anbaugebiet === R.gebiet && !/^Einzellagenfrei/.test(f.properties.wlg_name || ""));
  let lo0 = Infinity, lo1 = -Infinity, la0 = Infinity, la1 = -Infinity;
  all.forEach(f => polysOf(f.geometry).forEach(p => p[0].forEach(([x, y]) => { lo0 = Math.min(lo0, x); lo1 = Math.max(lo1, x); la0 = Math.min(la0, y); la1 = Math.max(la1, y); })));
  const O = [+((lo0 + lo1) / 2).toFixed(4), +((la0 + la1) / 2).toFixed(4)], d2r = Math.PI / 180, RE = 6371000, kx = d2r * RE * Math.cos(O[1] * d2r), ky = d2r * RE;
  const m = ([x, y]) => [(x - O[0]) * kx, (O[1] - y) * ky];
  const num = v => { const n = parseFloat(String(v || "").replace(",", ".")); return isFinite(n) ? n : null; };
  // the name on a label: the village made an adjective (Wehlen → Wehlener Sonnenuhr); the matcher also takes the
  // village's own name, which covers the irregular ones (Niederhausen → Niederhäuser)
  const adj = g => g.replace(/\s*\(.*\)$/, "").replace(/^Bad /, "") + "er";
  const climats = all.map(f => {
    const p = f.properties, gm = String(p.gemarkungen || "").split(/,\s*/).filter(Boolean).map(x => x.charAt(0).toUpperCase() + x.slice(1)) /* "ürzig" → "Ürzig" */, mp = polysOf(f.geometry).map(q => q.map(r => r.map(m)));
    const g = tidy(mp, 5), reg = num(p.rebflaeche); // whole hillsides: 5 m is plenty
    return g.length && { id: slug(p.wlg_name + " " + (gm[0] || p.wlg_nr)), n: String(p.wlg_name), c: "EL", ap: gm.length === 1 ? adj(gm[0]) + " " + p.wlg_name : String(p.wlg_name),
      app: String(p.gemeinde || "").split(/,\s*/)[0], area: String(p.bereich || "").replace(/^Ber(eich|\.) /, ""), gl: p.grosslage && p.grosslage !== "-" ? String(p.grosslage) : "",
      gm, nr: String(p.wlg_nr), col: "W", ha: reg ?? +polyHa(mp).toFixed(1), haMap: +polyHa(mp).toFixed(1), reg: reg != null, lp: label(g), g, aka: gm.map(x => adj(x) + " " + p.wlg_name) };
  }).filter(Boolean);
  climats.forEach(c => { let i = 2; const base = c.id; while (climats.filter(x => x.id === c.id).length > 1) c.id = base + "_" + i++; });
  const year = new Date().getFullYear();
  return { climats, villages: [], regionalLand: [], meta: { proj: "eq", origin: O, l93: null,
    source: `Einzellagen: ©Landwirtschaftskammer RLP (${year}), dl-de/by-2-0, weinlagen.lwk-rlp.de [Daten bearbeitet]` } };
}

(async () => {
  if (R.kind === "lagen") {
    console.error(`${R.name}: the Einzellagen of the Weinbergsrolle`);
    return finish(await lagenBuild());
  }
  if (R.kind === "villages") {
    console.error(`${R.name}: the cru villages' vines from IGN`);
    return finish(await villagesBuild());
  }
  console.error(`${R.name}: INAO outlines from IGN`);
  // paged requests need a stable order: by the layer's own key
  const feats = await wfs("AOC-VITICOLES:aire_parcellaire", "&SORTBY=gml_id", "inao");
  const places = await wfs("BDTOPO_V3:lieu_dit_non_habite", "&SORTBY=cleabs", "places");
  { let e0 = Infinity, e1 = -Infinity, n0 = Infinity, n1 = -Infinity; // loops: a spread of millions of points overflows the stack
    feats.forEach(f => polysOf(f.geometry).forEach(p => p[0].forEach(([e, n]) => { if (e < e0) e0 = e; if (e > e1) e1 = e; if (n < n0) n0 = n; if (n > n1) n1 = n; })));
    E0 = Math.round((e0 + e1) / 2); N0 = Math.round((n0 + n1) / 2); }
  // each piece of land goes where its highest appellation puts it: a named grand cru, a named premier cru, an unnamed
  // premier cru, its village appellation, or the regional land
  const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const A = R.apps.map(a => Object.assign({}, a, { gcRe: a.gc ? new RegExp("^" + esc(a.gc) + " (.+)$", "i") : null,
    pcRe: new RegExp("^" + esc(a.ap) + " premier cru (.+)$", "i"), pcAnyRe: new RegExp("^" + esc(a.ap) + " premier cru$", "i"), vRe: new RegExp("^" + esc(a.inao || a.ap) + "$", "i"),
    gcs: {}, pcs: {}, pcAny: [], village: [] }));
  const regionalLand = [];
  for (const f of feats) {
    const apps = String(f.properties.denom || "").split(",").map(s => s.trim()), geo = inM(f.geometry);
    let done = false;
    for (const a of A) {
      const gc = a.gcRe ? apps.map(x => (x.match(a.gcRe) || [])[1]).filter(Boolean) : [], pcn = apps.map(x => (x.match(a.pcRe) || [])[1]).filter(Boolean);
      if (gc.length) gc.forEach(n => (a.gcs[n] ??= []).push(geo));
      else if (pcn.length) pcn.forEach(n => (a.pcs[n] ??= []).push(geo));
      else if (apps.some(x => a.pcAnyRe.test(x))) a.pcAny.push(geo);
      else if (apps.some(x => a.vRe.test(x))) a.village.push(geo);
      else continue;
      done = true; break;
    }
    if (!done && apps.some(x => R.regional.some(re => re.test(x)))) regionalLand.push(geo);
  }
  const climats = [];
  const add = (a, n, c, ap, mp, extra, tol) => { const m = tidy(mp, tol); if (!m.length) return;
    climats.push(Object.assign({ id: slug(n), n, c, ap, app: a.ap, col: a.col, ha: +polyHa(mp).toFixed(2), lp: label(m), g: m }, extra || {})); };
  const key = t => " " + t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]+/g, " ").trim() + " ";
  const pts = places.map(f => ({ n: proper(String(f.properties.toponyme || "").trim()), p: toM(f.geometry.coordinates) })).filter(x => x.n);
  const distTo = (pt, patch) => inPoly(pt, patch) ? 0 : patch[0].reduce((m, [x, y]) => Math.min(m, Math.hypot(x - pt[0], y - pt[1])), Infinity);
  for (const a of A) {
    const PC = a.ap + " Premier Cru";
    for (const [n, list] of Object.entries(a.gcs)) add(a, n, "GC", a.gc + " " + n, union(list));
    for (const [n, list] of Object.entries(a.pcs)) add(a, n, "1er", PC + " " + n, union(list));
    const groupOf = n => { const k = key(n); return Object.keys(a.groups || {}).find(g => a.groups[g].some(w => k.includes(" " + w))); };
    // the premier cru land INAO gives no name: each patch takes the climat whose place name (IGN) lies inside it, or
    // within 600 m of it (only where the region lists its names: Chablis); the rest stay "unnamed", with the place nearest
    const inferred = {}, unnamed = [], slivers = [];
    for (const patch of union(a.pcAny)) {
    const ha = polyHa([patch]);
    const near = pts.map(x => ({ n: x.n, d: distTo(x.p, patch) })).filter(x => x.d <= 600).sort((a, b) => a.d - b.d);
    const hit = near.find(x => groupOf(x.n));
    if (hit) (inferred[groupOf(hit.n)] ??= { g: [], places: new Set() }).g.push(patch), inferred[groupOf(hit.n)].places.add(hit.n);
    else if (ha < 1) slivers.push(patch);
    else unnamed.push({ patch, near: (near[0] || {}).n || "" });
  }
  // a climat INAO names itself may also have unnamed patches: those join it
    for (const [g, v] of Object.entries(inferred)) {
      const own = climats.find(c => c.app === a.ap && c.c === "1er" && key(c.n) === key(g));
      if (own) { const mp = union([own.g, ...v.g.map(p => [p])]); own.g = tidy(mp); own.ha = +polyHa(mp).toFixed(2); own.lp = label(own.g); own.partInferred = [...v.places]; }
      else add(a, g, "1er", PC + " " + g, union(v.g.map(p => [p])), { inferred: true, places: [...v.places] });
    }
    unnamed.forEach((u, i) => add(a, `${PC} (${u.near ? "near " + u.near : i + 1})`, "1er", PC, [u.patch], { unnamed: true, near: u.near }));
    if (slivers.length) add(a, `${PC} (small plots)`, "1er", PC, union(slivers.map(p => [p])), { unnamed: true });
    // the names INAO gives inside a bigger climat (Vaupulent in Fourchaume): which one
    climats.forEach(c => { if (c.app !== a.ap || c.c !== "1er" || c.unnamed) return; const g = groupOf(c.n); if (g && key(g) !== key(c.n)) c.parent = slug(g); });
    if (a.cru) add(a, a.ap, a.cls || "AOC", a.ap, union(a.village), a.aka ? { aka: a.aka } : null, TOL * 3); // a cru appellation is its own climat (whole hillsides: drawn coarser)
  }
  const villageLand = Object.fromEntries(A.filter(a => !a.cru).map(a => [a.ap, union(a.village)]));
  const villages = A.filter(a => !a.cru).map(a => ({ ap: a.ap, ha: +polyHa(villageLand[a.ap]).toFixed(1), g: tidy(villageLand[a.ap], TOL * (R.bgTol || 2)) })).filter(v => v.g.length);
  const points = R.points ? await placePoints(climats, villageLand) : null;
  finish({ climats, villages, regionalLand, points });
})().catch(e => { console.error(e); process.exit(1); });

// ── classified châteaux: each on IGN's château of that name (BD TOPO zone_d_habitation, nature "Château") that lies
// in its appellation or within 1.5 km of it; one that isn't found keeps its place in the list, without a point ──
async function placePoints(climats, villageLand) {
  const ch = await wfs("BDTOPO_V3:zone_d_habitation", "&SORTBY=cleabs", "chateaux", "nature='Château'");
  const pkey = t => " " + t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\bst\b/g, "saint")
    .split(" ").filter(w => w && !["chateau", "de", "du", "d", "la", "le", "les", "l", "des"].includes(w)).join(" ") + " ";
  const mid = mp => { let x = 0, y = 0, n = 0; mp.forEach(p => p[0].forEach(q => { x += q[0]; y += q[1]; n++; })); return [x / n, y / n]; };
  const cand = ch.map(f => ({ n: String(f.properties.toponyme || "").trim(), p: mid(inM(f.geometry)) })).filter(c => c.n).map(c => Object.assign(c, { k: pkey(c.n) }));
  const near = (pt, land) => land.some(p => inPoly(pt, p)) || land.some(p => p[0].some(([x, y]) => Math.hypot(x - pt[0], y - pt[1]) < 1500));
  const out = [], missing = [];
  // the same name first; else IGN's name holding all of ours (and at most two words more)
  const find = (list, keys) => list.find(c => keys.includes(c.k)) || list.find(c => keys.some(k => { const a = k.trim().split(" "), b = c.k.trim().split(" ");
    return a.every(w => b.includes(w)) && b.length <= a.length + 2; }));
  for (const [cls, list] of Object.entries(R.points)) for (const e of list) {
    const [name, ap, ...alias] = e.split("|"), keys = [name, ...alias].map(pkey);
    const land = (climats.find(c => c.c === "AOC" && c.n === ap) || {}).g || villageLand[ap] || [];
    let hit = find(cand.filter(c => near(c.p, land)), keys);
    // many châteaux are on IGN's map as an inhabited place ("Lieu-dit habité: Château Rieussec"): look the name up there
    if (!hit) {
      const word = name.split(/[^\p{L}]+/u).filter(w => w.length > 2 && !/^(Château|Clos)$/.test(w)).sort((a, b) => b.length - a.length)[0]; // as IGN writes it, accents and all
      const more = await wfs("BDTOPO_V3:zone_d_habitation", "&SORTBY=cleabs", "place-" + word, `toponyme ILIKE '%${word.replace(/'/g, "''")}%'`);
      hit = find(more.map(f => ({ n: String(f.properties.toponyme || "").trim(), p: mid(inM(f.geometry)) })).filter(c => c.n && near(c.p, land)).map(c => Object.assign(c, { k: pkey(c.n) })), keys);
    }
    const n = /^(Clos|Château) /.test(name) ? name : "Château " + name;
    if (!hit) missing.push(n);
    out.push(Object.assign({ id: slug(n), n, cls, ap }, hit ? { p: hit.p.map(Math.round), ign: hit.n } : {}));
  }
  console.error(`${out.length - missing.length} of ${out.length} classified châteaux placed${missing.length ? "; not found: " + missing.join(", ") : ""}`);
  return out;
}

function finish({ climats, villages, regionalLand, points, meta }) {
  // the same name in two appellations (Clos du Roy) gets the appellation in its id
  climats.forEach(c => { if (climats.filter(x => x.id === c.id).length > 1) c.id = slug(c.app + " " + c.n); });
  climats.forEach(c => { let i = 2; const base = c.id; while (climats.filter(x => x.id === c.id).length > 1) c.id = base + "_" + i++; });
  // the background land is drawn coarser than the crus (it's there for context, and it's most of the file)
  const regional = tidy(union(regionalLand), TOL * Math.max(5, (R.bgTol || 2) * 2)).filter(p => polyHa([p]) > 0.5);
  const all = climats.flatMap(c => c.g).concat(...villages.map(v => v.g), regional).flatMap(p => p[0]);
  const bb = all.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
  const pack = { meta: { id, name: R.name, country: R.country, region: R.region, built: new Date().toISOString().slice(0, 10), origin: [lon0, lat0], l93: [E0, N0], bb, ...(R.absent ? { absent: R.absent } : {}), ...(meta || {}),
      ...(meta && meta.source ? {} : { source: R.kind === "villages" ? "Vines: IGN BD TOPO (zone de végétation « Vigne »); village boundaries: IGN ADMIN EXPRESS (Licence Ouverte); crus: the échelle des crus"
        : "INAO — Délimitation parcellaire des AOC viticoles, via IGN Géoplateforme (Licence Ouverte); place names: IGN BD TOPO (Licence Ouverte)" }) },
    climats: climats.sort((a, b) => RANK[a.c] - RANK[b.c] || a.n.localeCompare(b.n, "fr")),
    villages, regional: { ha: +polyHa(union(regionalLand)).toFixed(1), g: regional }, ...(points ? { points } : {}) };
  const out = path.join(ROOT, `atlas-${id}.js`);
  fs.writeFileSync(out, `// Generated by tools/region-build.js ${id} — do not edit by hand.\nwindow.ATLAS_PACKS = window.ATLAS_PACKS || {};\nwindow.ATLAS_PACKS[${JSON.stringify(id)}] = ${JSON.stringify(pack)};\n`);
  const aocN = climats.filter(c => c.c === "AOC").length, gcN = climats.filter(c => c.c === "GC").length, pcN = climats.filter(c => c.c === "1er" && !c.unnamed && !c.inferred).length,
    infN = climats.filter(c => c.inferred).length, unN = climats.filter(c => c.unnamed).length;
  const elN = climats.filter(c => c.c === "EL").length;
  if (elN) { console.error(`${path.basename(out)}: ${elN} Einzellagen · ${(fs.statSync(out).size / 1024).toFixed(0)} KB`); return; }
  console.error(`${path.basename(out)}: ${aocN ? aocN + " cru appellations, " : ""}${gcN} grands crus, ${pcN} premiers crus named by INAO, ${infN} named from IGN place names, ${unN} unnamed, `
    + `villages ${villages.map(v => v.ap + " " + v.ha).join(", ")} ha, regional ${pack.regional.ha} ha · ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
}
