// Which Burgundy climat is a wine from? Shared by the atlas (burgundy.js, to put your bottles on the map) and the
// cellar app (app.js, to suggest a wine's classification). Reads the climat names on the label against the atlas's
// climats; commune names are taken out first, so "Gevrey-Chambertin" stays a village wine and doesn't count as
// Chambertin, and a premier cru needs its commune on the label (there are three Les Cras).
//
//   const M = BURG_MATCH.make(climats, villages)   // climats: [{id, n, c:"GC"|"1er"|"V", v, geo, inner}], villages: [{id, n}]
//   M.match({name, commune})  → {c: climat or null, vil: village id or undefined}
//   BURG_MATCH.classify(wine) → {cls:"Grand cru"|"1. cru"|"AOC", why, climat} or null   (uses window.BURG + BURG_NAMES)
(function(){
"use strict";
const norm = t => String(t||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/œ/g,"oe").replace(/[-'’.,«»()]/g," ")
  .replace(/\bst\b/g,"saint").replace(/\bste\b/g,"sainte").replace(/\s+/g," ").trim();
const STRIP = ["gevrey chambertin","chambolle musigny","vosne romanee","morey saint denis","nuits saint georges","flagey echezeaux","premeaux prissey",
  "puligny montrachet","chassagne montrachet","aloxe corton","pernand vergelesses","savigny les beaune","chorey les beaune","auxey duresses","saint aubin"];
const ARTICLE = /^(les|la|le|aux|au|en|l)\s+/;
const STRIP_RE = STRIP.map(t => new RegExp(`(?<= )${t}(?= )`, "g"));

function make(C, V){
  const VILLAGE_KEYS = V.map(v => [v.id, norm(v.n.split(" · ")[0])]).concat([["flagey","flagey echezeaux"],["nuits","nuits saint georges"],["premeaux","premeaux prissey"],["cdnv","cote de nuits villages"],
    ["corton","aloxe corton"],["corton","pernand vergelesses"],["corton","ladoix"],["monthelie","auxey duresses"],["monthelie","monthelie"],["monthelie","saint romain"],["meursault","volnay santenots"]]);
  const ALIASES = C.map(c => {
    const full = norm(c.n), a = [full];
    if(c.c!=="GC"){ const s = full.replace(ARTICLE,""); if(s!==full && s.length>=5) a.push(s); }
    if(c.id==="closvougeot") a.push("clos vougeot");
    if(c.id==="montrachet") a.push("montrachet");
    if(c.c==="GC" && /^corton /.test(full)) a.push(full.replace(/^corton (les |le |la )?/, "corton "));
    if(c.id==="beze") a.push("clos de beze","chambertin clos de beze");
    if(c.id==="closstjacques") a.push("clos saint jacques");
    if(c.id==="laromanee") a.splice(0, a.length, "la romanee");
    return {c, a};
  });
  function match(w){
    const commune = norm(w.commune), name = norm(w.name), all = " "+name+" "+commune+" ";
    let stripped = all; STRIP_RE.forEach(re => stripped = stripped.replace(re, "")); // lookarounds: back-to-back repeats are all removed
    const vil = VILLAGE_KEYS.filter(([,k]) => all.includes(" "+k+" ")).map(([id])=>id);
    let best = null;
    for(const {c,a} of ALIASES){
      for(const al of a){
        if(!stripped.includes(" "+al+" ")) continue;
        if(c.c!=="GC"){ // a premier cru / village climat needs its commune on the label (Les Cras exists three times)
          const ok = vil.includes(c.v) || (c.v==="flagey" && vil.includes("vosne")) || (c.v==="premeaux" && vil.includes("nuits")) || (c.geo==="flagey" && vil.includes("vosne"));
          if(!ok) continue;
        }
        if(!best || al.length > best.len || (al.length===best.len && c.inner)) best = {c, len:al.length};
      }
    }
    return {c: best && best.c, vil: vil[0]};
  }
  return {match};
}

// The cellar's own words for classification ("Grand cru", "1. cru", "AOC"); anything else is kept as written.
const CLS = {GC:"Grand cru", "1er":"1. cru", V:"AOC"};
// what a written classification means, whatever its spelling ("1er Cru", "Premier cru", "1. cru" → 1er)
function classKey(s){
  const n = norm(s);
  if(!n) return "";
  if(/^grand cru/.test(n)) return "GC";
  if(/^(1er|1 er|1|premier) cru/.test(n)) return "1er";
  if(/^(aoc|aop|village|villages|regional|bourgogne)$/.test(n)) return "V";
  return n;
}
let DEFAULT = null;
function defaultMatcher(){
  if(DEFAULT || !window.BURG) return DEFAULT;
  const B = window.BURG, X = (window.BURG_NAMES && window.BURG_NAMES.climats) || [];
  const ids = new Set(B.climats.map(c => c.id));
  // the atlas's climats, plus INAO's other premiers crus (burgundy-names.js), which the atlas draws but has no notes for
  const C = B.climats.map(c => ({id:c.id, n:c.n, c:c.c, v:c.v, geo:c.geo, inner:!!c.in}))
    .concat(X.filter(x => !ids.has(x[0])).map(([id, n, c, v, inn]) => ({id, n, c, v, inner:!!inn})));
  DEFAULT = make(C, B.villages);
  return DEFAULT;
}
// A suggested classification for a cellar or journal wine, from what's written on it, or null when there's no evidence.
function classify(w){
  const name = String(w.name || w.wine || ""), commune = String(w.commune || "");
  // the label says so itself
  const k = classKey((name.match(/\b(grand cru|1er cru|1 er cru|premier cru|1\. ?cru)\b/i) || [])[0] || "");
  if(k==="GC" || k==="1er") return {cls:CLS[k], why:"label"};
  const M = defaultMatcher(); if(!M) return null;
  const burgundy = /bourgogne|burgund|bourgogne|cote d.?or|chablis/i.test(String(w.region||"")) || !w.region;
  if(!burgundy) return null;
  const m = M.match({name, commune});
  if(m.c) return {cls:CLS[m.c.c] || CLS.V, why:"climat", climat:m.c.n};
  if(m.vil && (commune || name)) return {cls:CLS.V, why:"village"};
  return null;
}
window.BURG_MATCH = {make, norm, classify, classKey, CLS};
})();
