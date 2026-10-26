// Cleans up wine data, for the importer and for "Tidy up" on the cellar: one spelling for one thing.
//   • spelling slips and other languages' names: "bourgugndy", "Burgundy", "Burgund" → Bourgogne; "France" → Frankrig;
//     "Cabernet Sauvignion" → Cabernet Sauvignon; "Vosne-Romanee" → Vosne-Romanée (wine-kb.js, the atlas's communes)
//   • SHOUTED or all-lower text in names → Title Case ("DOMAINE DE LA ROMANEE-CONTI" → "Domaine de la Romanée-Conti")
//   • one producer written several ways ("Domaine Roulot", "DOMAINE ROULOT", "Roulot") → the spelling the cellar or
//     the rest of the file already uses
// Every change is reported, so the person can see it and turn it off.
//
//   const T = TIDY.create({ producers: [...known names], communes: [...] })
//   T.wines(list, { existing, off }) → { wines, fixes: [{ field, from, to, n }] }   (off: Set of "field|from")
//   T.fix(field, value) → the corrected value
//   TIDY.mergeKey(w); TIDY.merge(list) → { wines, merged }   rows of the same wine as one
(function (root) {
"use strict";
const KB = (typeof module !== "undefined" && module.exports) ? require("./wine-kb.js") : root.WINE_KB;
const norm = KB.norm;

// optimal-string-alignment distance (Levenshtein plus swapped neighbours), stopping early past max
function dist(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null, prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + c);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v; if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev2 = prev; prev = cur;
  }
  return prev[b.length];
}
// how many slips a name of this length may have; short names must match exactly
const slack = n => n < 5 ? 0 : n < 8 ? 1 : n < 13 ? 2 : 3;

// A vocabulary: exact matches by normalised spelling, then the nearest name if it is close and unambiguous.
function vocab(entries) {
  const exact = new Map(), keys = [];
  entries.forEach(([spelling, canon]) => {
    const k = norm(spelling); if (!k) return;
    if (!exact.has(k)) { exact.set(k, canon); keys.push([k, canon]); }
  });
  return v => {
    const k = norm(v); if (!k) return null;
    if (exact.has(k)) return exact.get(k);
    const max = slack(k.length); if (!max) return null;
    let best = max + 1, hit = null, tie = false;
    for (const [kk, canon] of keys) {
      if (Math.abs(kk.length - k.length) > max || kk[0] !== k[0] && kk.slice(-2) !== k.slice(-2)) continue;
      const d = dist(k, kk, Math.min(best, max));
      if (d < best) { best = d; hit = canon; tie = false; } else if (d === best && canon !== hit) tie = true;
    }
    return best <= max && !tie ? hit : null;
  };
}

// ── Title Case for names that were typed in capitals or all in lower case ──
const SMALL = new Set(["de", "du", "des", "et", "en", "sur", "sous", "di", "del", "della", "dei", "degli", "von", "van", "der", "den", "y", "e", "i", "am", "im", "zu", "und", "of", "the", "and", "lès"]);
const ARTICLE = new Set(["la", "le", "les", "l"]);     // lower case only after de/du/des: "Clos de la Roche", but "Les Pucelles"
const HYPHEN_SMALL = new Set(["lès", "les", "sur", "sous", "en", "de", "du", "des", "la", "le", "et", "aux"]); // Savigny-lès-Beaune
// label words that lose their accent when typed in capitals
const ACCENT = { chateau: "Château", chateaux: "Châteaux", cote: "Côte", cotes: "Côtes", cremant: "Crémant", cuvee: "Cuvée", reserve: "Réserve",
  selection: "Sélection", elevage: "Élevage", eleve: "Élevé", saint_emilion: "Saint-Émilion", romanee: "Romanée", echezeaux: "Échezeaux" };
const KEEP = new Set(["AOC", "AOP", "DOC", "DOCG", "DO", "DOCa", "IGT", "IGP", "VDP", "GG", "VV", "NV", "USA", "DRC", "MV", "LBV", "VT", "SGN", "AVA", "II", "III", "IV", "XO", "PX"]);
function titleCase(s) {
  s = String(s);
  const letters = s.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "");
  if (letters.length < 3) return s;
  const upper = letters === letters.toUpperCase(), lower = letters === letters.toLowerCase();
  if (!upper && !lower) return s; // mixed case: the person meant it
  let prevWord = "";
  return s.split(/(\s+)/).map((w, i, all) => {
    if (/^\s+$/.test(w)) return w;
    const before = prevWord; prevWord = w.toLowerCase();
    if (KEEP.has(w.toUpperCase()) && upper) return w.toUpperCase();
    if (/^\d/.test(w)) return w.toLowerCase(); // 1er, 2ème
    const first = all.slice(0, i).every(x => /^\s*$/.test(x));
    return w.split(/([-'’])/).map((p, j, parts) => {
      if (/^[-'’]$/.test(p) || !p) return p;
      const lo = p.toLowerCase();
      if (!first && j === 0 && parts.length === 1 && (SMALL.has(lo) || ARTICLE.has(lo) && /^(de|du|des|sur|sous|à|a)$/.test(before))) return lo;
      if (j > 0 && HYPHEN_SMALL.has(lo) && parts[j + 1] !== undefined) return lo;
      if ((lo === "d" || lo === "l") && parts[j + 1] && /['’]/.test(parts[j + 1])) return (first && j === 0) ? lo.toUpperCase() : lo; // d'Or, l'Arlot
      if (ACCENT[lo]) return ACCENT[lo];
      return lo.charAt(0).toUpperCase() + lo.slice(1);
    }).join("");
  }).join("");
}

// producer names compared without the usual prefixes, so "Domaine Roulot" and "Roulot" are the same producer
const PREFIX = /^(domaine|dom|domaines|chateau|ch|clos du domaine|weingut|bodegas?|bodega|tenuta|azienda agricola|azienda|cantina|cantine|maison|champagne|cave|caves|quinta|herdade|weinbau|winery|estate|vignobles?|famille|les vins de) /;
const prodKey = s => { let k = norm(s); for (let i = 0; i < 2; i++) k = k.replace(PREFIX, ""); return k; };
// The kind of house a written prefix says: "Domaine Leroy" and "Maison Leroy" are the estate and the négociant, two
// producers; "Dom." is Domaine, "Ch." Château. "" when there's no prefix.
const PREFIX_KIND = { dom: "domaine", domaines: "domaine", ch: "chateau", bodegas: "bodega", caves: "cave", vignoble: "vignobles", azienda: "azienda agricola", cantine: "cantina" };
const prodKind = s => { const m = norm(s).match(PREFIX); return m ? PREFIX_KIND[m[1]] || m[1] : ""; };
// who a producer is: the name without its prefix, and the kind of house when one is written
const prodId = s => prodKey(s) + "#" + prodKind(s);

const STRUCT = ["producer", "name", "commune", "region", "country", "grape", "source", "location"];
function create(opts) {
  opts = opts || {};
  const country = vocab([].concat(...KB.countries.map(c => [[c.n, c.n], ...Object.values(c.names).map(x => [x, c.n]), ...c.alias.map(x => [x, c.n])])));
  const region = vocab([].concat(...KB.regions.map(r => [[r.n, r.n], ...Object.values(r.names).map(x => [x, r.n]), ...r.alias.map(x => [x, r.n])])));
  // a grape keeps the name it was written under (Shiraz stays Shiraz), only spelled right
  const grape = vocab([].concat(...KB.grapes.map(g => [[g.n, g.n], ...g.syn.map(x => [x, x])])));
  const communeList = [...KB.apps.map(a => a.n), ...(opts.communes || [])];
  const commune = vocab(communeList.map(n => [n, n]).concat(communeList.map(n => [n.replace(/-/g, " "), n])));
  const known = new Map(); (opts.producers || []).forEach(p => { const k = norm(p); if (k && !known.has(k)) known.set(k, p); });
  // vineyard names with their accents, keyed without the article ("Perrieres" → "Perrières")
  const ART = /^(les|la|le|l|aux|au|en) /;
  const climat = new Map(); (opts.names || []).forEach(n => { const k = norm(n).replace(ART, ""); const v = String(n).replace(/^(Les|La|Le|L'|Aux|Au|En) /, "");
    if (!k) return; if (climat.has(k) && climat.get(k) !== v) climat.set(k, null); else climat.set(k, v); });
  const communesByLen = communeList.map(n => [norm(n), n]).sort((a, b) => b[0].length - a[0].length);
  function fixName(t) {
    // a commune at the start, in its proper spelling: "Vosne Romanee Les Suchots" → "Vosne-Romanée Les Suchots"
    const k = norm(t);
    let head = "", tail = t;
    for (const [ck, cn] of communesByLen) {
      if (k === ck) return cn;
      if (k.startsWith(ck + " ")) { const n = ck.split(" ").length, words = t.split(/[\s-]+/); if (words.length > n) { head = cn + " "; tail = words.slice(n).join(" "); } break; }
    }
    // the vineyard part with its accents, keeping the article as written
    const m = tail.match(/^((?:1er Cru |Premier Cru |Grand Cru )?(?:Les |La |Le |L'|Aux |Au |En )?)(.+)$/i);
    const hit = m && climat.get(norm(m[2]));
    return head + (hit ? m[1] + hit : tail);
  }

  function fixGrape(v) {
    const parts = String(v).split(/\s*(?:,|\/|\+|&|;| og | and | und | et )\s*/i).filter(Boolean);
    if (!parts.length) return v;
    const out = parts.map(p => grape(p) || titleCase(p.trim()));
    return out.join(", ");
  }
  function fix(field, v) {
    if (v == null || v === "") return v;
    let s = String(v).replace(/\s+/g, " ").trim();
    if (field === "country") return country(s) || titleCase(s);
    if (field === "region") return region(s) || titleCase(s);
    if (field === "grape") return fixGrape(s);
    if (field === "commune") return commune(s) || titleCase(s);
    // a producer the cellar or the atlas knows, in its spelling, unless that only drops accents ("Méo-Camuzet" stays)
    if (field === "producer") { const t = titleCase(s), k = known.get(norm(t)); return k && score(k) >= score(t) ? k : t; }
    if (field === "name") return fixName(titleCase(s));
    if (STRUCT.includes(field)) return titleCase(s);
    return v;
  }

  // the most used spelling of each producer, preferring one the cellar already has. A name without a prefix joins the
  // one house of that name ("Roulot" → "Domaine Roulot"), but not when there are two ("Leroy": Domaine or Maison?), and
  // houses of different kinds are never joined
  function producerMap(list, existing) {
    const groups = new Map();
    const add = (name, weight) => { const k = prodId(name); if (k[0] === "#") return; const g = groups.get(k) || new Map(); g.set(name, (g.get(name) || 0) + weight); groups.set(k, g); };
    (existing || []).forEach(w => add(w.producer, 1000)); // the cellar's own spelling wins
    list.forEach(w => add(w.producer, 1));
    const alias = new Map(), kinds = new Map();
    for (const k of groups.keys()) { const [root, kind] = k.split("#"); if (kind) (kinds.get(root) || kinds.set(root, []).get(root)).push(k); }
    for (const [k, g] of [...groups]) {
      const [root, kind] = k.split("#"), to = kinds.get(root);
      if (kind || !to || to.length !== 1) continue;
      const big = groups.get(to[0]); for (const [n, w] of g) big.set(n, (big.get(n) || 0) + w);
      groups.delete(k); alias.set(k, to[0]);
    }
    // a typo of a heavier group of the same kind joins it ("bonneau du matray" → "bonneau du martray"); two producers
    // the cellar already has separately are never joined, and short names must match exactly
    const weight = k => [...groups.get(k).values()].reduce((a, b) => a + b, 0);
    const keys = [...groups.keys()].sort((a, b) => weight(b) - weight(a));
    keys.forEach((k, i) => {
      const [root, kind] = k.split("#"), max = root.length >= 16 ? 2 : root.length >= 8 ? 1 : 0; if (!max) return;
      for (const big of keys.slice(0, i)) {
        if (alias.has(big) || (weight(k) >= 1000 && weight(big) >= 1000)) continue;
        const [broot, bkind] = big.split("#");
        if (bkind === kind && dist(root, broot, max) <= max) { alias.set(k, big); break; }
      }
    });
    const pick = new Map();
    for (const [k, g] of groups) {
      // prefer the cellar's spelling, then the full name with its prefix, then the most used, then mixed case with accents
      const own = w => w >= 1000 ? 1 : 0, full = n => prodKind(n) ? 1 : 0;
      const [best, bw] = [...g.entries()].sort((a, b) => own(b[1]) - own(a[1]) || full(b[0]) - full(a[0]) || b[1] - a[1] || score(b[0]) - score(a[0]))[0];
      // …written with the accents another spelling of the same name has ("Meo-Camuzet" + "Méo-Camuzet" → "Domaine
      // Méo-Camuzet"); on an import only from the cellar's own spellings, so the cellar stays one spelling
      const [pre, root] = splitPrefix(best);
      const accented = [...g.entries()].filter(([, w]) => own(w) >= own(bw)).map(([n]) => splitPrefix(n)[1])
        .filter(r => norm(r) === norm(root) && score(r) > score(root)).sort((a, b) => score(b) - score(a))[0];
      pick.set(k, accented ? pre + accented : best);
    }
    const res = k => { for (let i = 0; i < 3 && alias.has(k); i++) k = alias.get(k); return k; };
    return n => pick.get(res(prodId(n))) || n;
  }
  // "Domaine Meo-Camuzet" → ["Domaine ", "Meo-Camuzet"]: the written prefix (as many words as PREFIX matched) and the rest
  const splitPrefix = n => { let pre = ""; const m = norm(n).match(PREFIX); if (m) { const k = m[0].trim().split(" ").length, parts = String(n).split(/(\s+)/);
    if (parts.length > 2 * k) pre = parts.slice(0, 2 * k).join(""); } return [pre, String(n).slice(pre.length)]; };
  const score = s => (/[a-z]/.test(s) && /[A-Z]/.test(s) ? 4 : 0) + (/[^\x00-\x7f]/.test(s) ? 2 : 0) + s.length / 100;
  // one spelling per name and commune within the same producer ("Perrieres" and "Perrières" → the accented one)
  function spellingMap(list, field) {
    const groups = new Map();
    list.forEach(w => { const v = w[field]; if (!v) return; const k = prodKey(w.producer) + "|" + norm(v); const g = groups.get(k) || new Map(); g.set(v, (g.get(v) || 0) + 1); groups.set(k, g); });
    const pick = new Map();
    for (const [k, g] of groups) pick.set(k, [...g.entries()].sort((a, b) => score(b[0]) - score(a[0]) || b[1] - a[1])[0][0]);
    return w => pick.get(prodKey(w.producer) + "|" + norm(w[field])) || w[field];
  }

  function wines(list, o) {
    o = o || {}; const off = o.off || new Set();
    const tally = new Map();
    const note = (field, from, to) => { if (String(from) === String(to)) return false; const k = field + "|" + from; if (off.has(k)) return false;
      const t = tally.get(k) || { field, from: String(from), to: String(to), n: 0 }; t.n++; tally.set(k, t); return true; };
    // the steps run one after another, but each value is reported once, from what was written to where it ends up
    // ("Méo-Camuzet" → "Domaine Méo-Camuzet", not a fix and then a fix of the fix), and turned off as one
    const step1 = list.map(w => {
      const o2 = Object.assign({}, w);
      for (const f of STRUCT) if (o2[f] != null && o2[f] !== "") o2[f] = fix(f, o2[f]);
      return o2;
    });
    const prod = producerMap(step1, o.existing);
    step1.forEach(w => { if (w.producer) w.producer = prod(w.producer); });
    for (const f of ["name", "commune"]) { const m = spellingMap(step1.concat((o.existing || []).map(e => ({ producer: prod(e.producer), [f]: e[f] }))), f);
      step1.forEach(w => { if (w[f]) w[f] = m(w); }); }
    step1.forEach((w, i) => { for (const f of STRUCT) { const was = list[i][f]; if (was == null || was === "") continue; if (!note(f, was, w[f])) w[f] = was; } });
    // a "Wine" that is just the commune again isn't a cuvée name when the commune is given
    return { wines: step1, fixes: [...tally.values()].sort((a, b) => b.n - a.n || a.field.localeCompare(b.field)) };
  }
  return { wines, fix, titleCase, prodKey };
}

// ── rows that are the same wine ──
// a "wine name" that only repeats the commune is no name ("Roulot, Meursault, Meursault" = "Roulot, –, Meursault")
const nameKey = w => { const n = norm(w.name); return n && n === norm(w.commune) ? "" : n; };
const mergeKey = w => [prodId(w.producer), nameKey(w), String(w.vintage || "").toLowerCase(), String(w.size || "").toLowerCase()].join("|");
function merge(list) {
  const by = new Map(), out = [];
  let merged = 0;
  list.forEach(w => {
    const k = mergeKey(w), m = by.get(k);
    if (!m) { const c = Object.assign({}, w, { rows: [w.src].filter(x => x != null) }); by.set(k, c); out.push(c); return; }
    merged++;
    const qa = Number(m.qty) || 1, qb = Number(w.qty) || 1;
    // price and value are per bottle: the bottle-weighted mean of the rows that have one
    for (const f of ["price", "value"]) {
      if (w[f] == null) continue;
      if (m[f] == null) m[f] = w[f];
      else { const wa = m["_" + f] != null ? m["_" + f] : qa; m[f] = Math.round((m[f] * wa + w[f] * qb) / (wa + qb) * 100) / 100; m["_" + f] = wa + qb; }
    }
    m.qty = qa + qb; m.drunk = (Number(m.drunk) || 0) + (Number(w.drunk) || 0);
    for (const f of ["note", "location", "source"]) if (w[f] && !String(m[f] || "").split(" · ").includes(w[f])) m[f] = m[f] ? m[f] + " · " + w[f] : w[f];
    for (const f of ["commune", "region", "country", "classification", "type", "grape"]) if (!m[f] && w[f]) m[f] = w[f];
    if (w.acquired && (!m.acquired || w.acquired < m.acquired)) m.acquired = w.acquired;
    if (w.drunkDate && (!m.drunkDate || w.drunkDate > m.drunkDate)) m.drunkDate = w.drunkDate;
    if (w.rating != null) m.rating = m.rating != null ? Math.max(m.rating, w.rating) : w.rating;
    for (const f of ["drinkFrom", "drinkTo"]) if (m[f] == null && w[f] != null) m[f] = w[f];
    if (w.src != null) m.rows.push(w.src);
  });
  out.forEach(w => { delete w._price; delete w._value; if (w.rows && w.rows.length < 2) delete w.rows; });
  return { wines: out, merged };
}

const api = { create, merge, mergeKey, dist, titleCase, prodKey, prodId };
if (typeof module !== "undefined" && module.exports) module.exports = api;
else root.TIDY = api;
})(typeof window !== "undefined" ? window : globalThis);
