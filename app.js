/* AllWine — cellar app. Data comes from the Apps Script API; nothing is stored here. */
"use strict";

// The interface language (i18n.js): tr(englishText, a, b) gives it in the chosen language, {0} {1} filled in.
const tr = (window.I18N && window.I18N.t) || ((s, ...a) => a.length ? s.replace(/\{(\d)\}/g, (m, i) => a[i] ?? "") : s);
// Text set from code that should follow the language picker: marked for I18N.apply, which re-translates it on a change
function trSet(key, el){ if(!el) return; el.setAttribute("data-i18n", key); el.dataset.i18n = key; el.textContent = tr(key); }
const I18N_LOCALE = () => ({en:"en-GB", fr:"fr-FR", de:"de-DE"})[window.I18N && I18N.lang] || "da-DK";

const TIER_LABEL = {legend:"Icon", top:"Top tier", solid:"Well regarded"};
const STYLES = ["Rød","Hvid","Bobler","Rosé"];
const STYLE_EN = {"Rød":"Red","Hvid":"White","Bobler":"Sparkling","Rosé":"Rosé"};
const STYLE_VAR = {"Rød":"--c-red","Hvid":"--c-white","Bobler":"--c-spark","Rosé":"--c-rose"};
// history markers coloured by wine: red = red, white = white, gold = sparkling, pink = rosé
const HIST_COLOR = {"Rød":"var(--h-red)","Hvid":"var(--h-white)","Bobler":"var(--h-gold)","Rosé":"var(--h-rose)"};
const COUNTRY_FIX = {"Franrkig":"Frankrig","Fankrig":"Frankrig"};
const REGION_FIX = {"Cote-de-Rhone":"Rhône","Cotes du Rhone":"Rhône","Laungedoc":"Languedoc","Bearn":"Béarn"};
const CLASS_FIX = {"1. Cru":"1. cru","1. cr":"1. cru"};

/* ---------- bottle formats ---------- */
// What the wine is actually held in. A blank size means an ordinary 75 cl
// bottle, so nothing needs migrating. Format is recorded and displayed only —
// it deliberately does not touch drink windows.
const FORMATS = [
  {key:"Piccolo",        l:0.1875, note:"18,75 cl"},
  {key:"Half",           l:0.375,  note:"37,5 cl"},
  {key:"Bottle",         l:0.75,   note:"75 cl"},
  {key:"Magnum",         l:1.5,    note:"1,5 L"},
  {key:"Jeroboam",       l:3,      note:"3 L"},
  {key:"Rehoboam",       l:4.5,    note:"4,5 L"},
  {key:"Methuselah",     l:6,      note:"6 L"},
  {key:"Salmanazar",     l:9,      note:"9 L"},
  {key:"Balthazar",      l:12,     note:"12 L"},
  {key:"Nebuchadnezzar", l:15,     note:"15 L"},
];
// Spellings that might already be sitting in the sheet, incl. the Danish ones.
const FORMAT_ALIAS = {"flaske":"Bottle","standard":"Bottle","normal":"Bottle","0,75":"Bottle","0.75":"Bottle",
  "halv":"Half","halvflaske":"Half","demi":"Half","piccolo":"Piccolo","split":"Piccolo",
  "dobbeltmagnum":"Jeroboam","dobbelt magnum":"Jeroboam","double magnum":"Jeroboam",
  "mathusalem":"Methuselah","imperiale":"Methuselah","imperial":"Methuselah","nabuchodonosor":"Nebuchadnezzar"};
const FORMAT_BY = {};
FORMATS.forEach(f=>{ FORMAT_BY[f.key.toLowerCase()] = f; FORMAT_BY[f.note.toLowerCase()] = f; });
const BOTTLE = FORMATS.find(f=>f.key==="Bottle");
function formatOf(w){
  const raw = String((w&&w.size)||"").trim().toLowerCase();
  if(!raw) return BOTTLE;
  return FORMAT_BY[raw] || FORMAT_BY[String(FORMAT_ALIAS[raw]||"").toLowerCase()] || BOTTLE;
}
const isStdBottle = w => formatOf(w) === BOTTLE;
const fmtLitres = n => new Intl.NumberFormat("da-DK",{maximumFractionDigits:1}).format(n);
const fmtChip = w => isStdBottle(w) ? "" :
  `<span class="fmt" title="${esc(formatOf(w).note)}">${esc(tr(formatOf(w).key))}</span>`;

const fmt = n => new Intl.NumberFormat("da-DK",{maximumFractionDigits:0}).format(n);
const kr = n => fmt(n)+" kr.";
const fmtDate = s => { const d=new Date(String(s).slice(0,10)+"T12:00:00");
  return isNaN(d)?String(s):d.toLocaleDateString(I18N_LOCALE(),{day:"numeric",month:"short",year:"numeric"}); };

// A date in the browser's own timezone. toISOString() gives the UTC date, which
// is still yesterday in Copenhagen between midnight and 01:00/02:00 — exactly
// when a bottle tends to get logged.
const ymdLocal = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const todayStr = () => ymdLocal(new Date());

// A rough drink window estimated from the wine's type, origin and vintage.
// Deliberately generic (grape/region/cru level → an ageing span) — a starting
// point you can override per wine. Returns {from,to} or null.
function baseWindow(w){
  const style=w.style, reg=normName(w.region), grape=normName(w.grape), cls=normName(w.classification);
  const v = typeof w.vintage==="number" ? w.vintage : null;
  const has=(s,arr)=>arr.some(a=>s.includes(a));
  const grand = cls.includes("grand"), premier = cls.includes("1") && cls.includes("cru");
  const span=(lo,hi)=>({from:v+lo, to:v+hi});
  // sparkling / champagne
  if(style==="Bobler" || has(reg,["champagne"])){
    if(v==null){ // NV: no vintage to age from, so estimate from the purchase year
      const ay=/^\d{4}/.test(String(w.acquired))?Number(String(w.acquired).slice(0,4)):null;
      if(!ay) return null;
      // good NV keeps for years; grande-marque / grower houses a bit longer
      const tier=(typeof PRODUCER_NOTES!=="undefined" && PRODUCER_NOTES[w.producer]) ? PRODUCER_NOTES[w.producer][0] : null;
      const yrs = tier==="legend" ? 12 : tier==="top" ? 10 : 8;
      return {from:ay, to:ay+yrs};
    }
    // vintage champagne ages long, and late disgorgement (which we can't see) extends it further
    return span(4, grand?40:30);
  }
  if(style==="Rosé") return v!=null ? span(0,2) : null;   // drink young
  if(v==null) return null;                                // still wines need a vintage
  // Beaujolais — cru gamay ages a decade, generic drinks young
  if(has(reg,["beaujolais"]))
    return (grand||premier||cls.includes("cru")) ? span(2,12) : span(1,5);
  // Burgundy (and neighbours) — by colour and cru level. Good Burgundy ages long:
  // grand cru reds routinely 30+ yrs, top whites 20–30 (premox notwithstanding).
  if(has(reg,["bourgogne","chablis","macon","cote de","cotes de","cote d"])){
    if(style==="Hvid") return grand?span(4,30):premier?span(3,22):span(2,14);
    return grand?span(8,40):premier?span(5,30):span(3,22);
  }
  // Piemonte / Nebbiolo — Barolo & Barbaresco are decades-long agers
  if(has(reg,["piemonte","barolo","barbaresco","langhe"]) || grape.includes("nebbiolo"))
    return has(reg,["barbaresco"]) ? span(5,28) : span(6,32);
  if(has(reg,["bordeaux","medoc","pomerol","saint","pauillac","margaux","graves","pessac"]) || has(grape,["cabernet","merlot"]))
    return (grand||cls.includes("classe"))?span(6,32):span(4,18);
  if(has(reg,["rhone","rhône","cornas","hermitage","cote rotie","côte rôtie","gigondas","chateauneuf","châteauneuf"]) || grape.includes("syrah"))
    return has(reg,["hermitage","cornas","cote rotie","côte rôtie"]) ? span(5,28) : span(4,20);
  // Riesling — Mosel/Saar & German/Alsace whites age superbly, often 20–40 yrs
  if(grape.includes("riesling") || has(reg,["mosel","saar","ruwer","rheingau","nahe","pfalz","rheinhessen","alsace"])){
    // the German ripeness level says much about how long it keeps: a Kabinett is lighter, a TBA nearly immortal
    if(has(cls,["beerenauslese","eiswein","tba"]) || /\bba\b/.test(cls)) return span(8,50);
    if(cls.includes("auslese")) return span(5,30);
    if(cls.includes("spatlese")) return span(3,25);
    if(cls.includes("kabinett")) return span(2,15);
    if(has(cls,["grosses gewachs","gg","grosse lage"])) return span(3,20);
    return grand?span(3,35):span(3,25);
  }
  return style==="Hvid" ? span(1,6) : span(2,10);         // generic white / red
}

// Icon/top producers make wines that outlive the generic region+cru estimate —
// a Lafon village Meursault or a Roumier village Chambolle ages far longer than
// the appellation average — so push the drink-window's close out for them, in proportion to the wine's own span
// (a share, not a fixed number of years: +14 years made a village wine from an icon last 36 years)
const TIER_STRETCH = {legend:0.35, top:0.2, solid:0.15};
function defaultWindow(w){
  const d = baseWindow(w);
  if(!d || d.to==null) return d;
  // No bonus where a great address doesn't add years: rosé, and non-vintage bubbles.
  const noBonus = w.style==="Rosé" || (w.style==="Bobler" && typeof w.vintage!=="number");
  const tier = (typeof PRODUCER_NOTES!=="undefined" && PRODUCER_NOTES[w.producer]) ? PRODUCER_NOTES[w.producer][0] : null;
  const bonus = noBonus || d.from==null ? 0 : Math.round((d.to - d.from) * (TIER_STRETCH[tier] || 0));
  if(bonus){ d.to += bonus; if(d.from!=null && d.to - d.from > 45) d.to = d.from + 45; } // sane ceiling
  return d;
}

// The window in effect for a wine: your own if set, else the estimate.
function drinkWindow(w){
  if(w.drinkFrom!=null || w.drinkTo!=null) return {from:w.drinkFrom, to:w.drinkTo, est:false};
  const d = defaultWindow(w);
  return d ? {from:d.from, to:d.to, est:true} : null;
}

// Drink-window readiness for a wine, relative to the current year.
function readiness(w, now){
  const win = drinkWindow(w);
  if(!win) return null;
  const y = now || new Date().getFullYear();
  const {from,to,est} = win;
  if(from!=null && y < from) return {k:"young", label:tr("Too young"), soon:from===y+1, est};
  if(to!=null && y > to) return {k:"past", label:tr("Past peak"), soon:false, est};
  const soon = to!=null && (to - y) <= 1; // closing this year or next
  return {k:"now", label: soon?tr("Drink soon"):tr("Drink now"), soon, est};
}
const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const $ = id => document.getElementById(id);
const btl = n => tr("{0} btl.", n); // "12 btl." — fl. in Danish
// a producer's reputation note (notes.js) in the interface language (notes-i18n.js), or the English
const noteText = t => (((window.PRODUCER_NOTES_I18N||{})[window.I18N && I18N.lang])||{})[t] || t;
const nBottles = n => n===1 ? tr("1 bottle") : tr("{0} bottles", n);
const nWines = n => n===1 ? tr("1 wine") : tr("{0} wines", n);

let WINES = [];          // normalized
let KEEP_OPEN = null;    // row number of the expanded detail, kept open across re-renders
let SHOW_PRICES = localStorage.getItem("vinHidePrices") !== "1"; // prices shown by default
const state = {q:"", country:"", region:"", style:"", status:"cellar", ready:"", loc:"", closes:"", sortK:"price", sortDir:-1};
// a location's first part ("Kælder" of "Kælder, reol 3, hylde 2") is the place the filter offers
const locPlace = l => String(l||"").split(/[,;/·|]/)[0].trim();

/* ---------- config / auth ---------- */
const cfg = {
  // the site's own setting wins: an address saved in this browser (from before config.js had one) is only a fallback
  api: (window.WINE_CONFIG && window.WINE_CONFIG.API_URL) || localStorage.getItem("vinApi") || "",
  user: localStorage.getItem("vinUser") || "",
  token: localStorage.getItem("vinToken") || "",
};

// Raw POST that returns the parsed response (never throws on ok:false) — used by
// the login/signup gate, which needs to read the error itself.
async function post(params){
  const res = await fetch(cfg.api, {method:"POST", body:JSON.stringify(params), redirect:"follow"});
  if(!res.ok){ // the API gateway answers its refusals ("too-many", "too-big" …) in JSON, like the API does
    let data = null; try{ data = await res.json(); }catch(e){}
    if(data && data.error) return data;
    throw new Error("HTTP "+res.status);
  }
  return res.json();
}

// Usage numbers for the owner's admin page: which pages were shown, imports, sommelier questions, exports — counts
// only, sent in a batch now and then (and when the page is left), never with a name or anything from the cellar
const HITS = {};
function hit(k){ if(!cfg.token) return; HITS[k] = (HITS[k]||0) + 1; if(Object.values(HITS).reduce((a,b)=>a+b, 0) >= 20) flushHits(); }
function flushHits(leaving){
  const ev = Object.assign({}, HITS); if(!Object.keys(ev).length || !cfg.api) return;
  for(const k in HITS) delete HITS[k];
  try{ fetch(cfg.api, {method:"POST", body:JSON.stringify({action:"hits", ev}), keepalive:!!leaving}).catch(()=>{}); }catch(e){}
}
addEventListener("pagehide", ()=>flushHits(true));
document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState === "hidden") flushHits(true); });

async function api(params){
  // an encrypted account: the cellar's own actions run here on the decrypted copy (vault.js); shared ones go out
  if(window.VAULT && VAULT.active()) return VAULT.call(params);
  const data = await post({user:cfg.user, token:cfg.token, ...params});
  if(!data.ok){ const e = new Error(data.error || "unknown-error"); e.data = data; throw e; }
  return data;
}
// Auth errors that mean "the session is no longer valid → show the gate".
const AUTH_ERRORS = new Set(["bad-token","bad-code","no-cellar","vaulted","migrating","vault-closed"]);

function normalize(rows){
  return rows.map(r=>{
    const country = COUNTRY_FIX[String(r.country).trim()] || String(r.country).trim();
    let region = String(r.region).trim();
    region = REGION_FIX[region] || region;
    const cls = CLASS_FIX[String(r.classification).trim()] || String(r.classification).trim();
    let vintage = r.vintage;
    if(typeof vintage === "string"){ const n = parseInt(vintage,10); vintage = isNaN(n) ? vintage.trim() : n; }
    const qty = Number(r.qty) || 1;
    let drunk = r.drunk;
    drunk = String(drunk).trim().toLowerCase()==="x" ? qty : (Number(drunk)||0);
    drunk = Math.min(drunk, qty);
    const type = String(r.type).trim();
    // "Mousserende" is how the edit form used to save a sparkling wine; any spelling of it is sparkling
    const style = region==="Champagne" ? "Bobler" : ({"Rød":"Rød","Hvid":"Hvid","Rose":"Rosé","Rosé":"Rosé","Bobler":"Bobler","Mousserende":"Bobler"}[type] || type || "Rød");
    return {
      row:r.row, producer:String(r.producer).trim(), country, region,
      commune:String(r.commune).trim(), name:String(r.name).trim(),
      classification:cls, style, grape:String(r.grape).trim(),
      vintage, qty, drunk, left:qty-drunk,
      price: (r.price===null||r.price===""||r.price===undefined) ? null : Number(r.price),
      rating: (r.rating===null||r.rating===""||r.rating===undefined) ? null : Number(r.rating),
      value: (r.value===null||r.value===""||r.value===undefined) ? null : Number(r.value),
      acquired: String(r.acquired||"").slice(0,10),
      drunkDate: String(r.drunkDate||"").slice(0,10),
      drinkFrom: (r.drinkFrom===null||r.drinkFrom===""||r.drinkFrom===undefined) ? null : Number(r.drinkFrom),
      drinkTo: (r.drinkTo===null||r.drinkTo===""||r.drinkTo===undefined) ? null : Number(r.drinkTo),
      size:String(r.size||"").trim(),
      source:String(r.source).trim(), note:String(r.note).trim(),
      elsewhere: r.elsewhere===true,
      location:String(r.location||"").trim(),
    };
  });
}

/* ---------- classification: what the sheet says, or a suggestion from the wine's name (burgundy-match.js) ---------- */
// The suggestion reads the label against the Burgundy atlas's climats: "Clos St-Jacques" + Gevrey → 1. cru,
// "Chambertin" → Grand cru, "Gevrey-Chambertin" → village (AOC). Elsewhere only an explicit "Grand cru"/"1er cru"
// on the label counts. Nothing is written to the sheet until you save a form or press "Fill them in".
const clsKey = c => window.BURG_MATCH ? BURG_MATCH.classKey(c) : String(c||"").trim().toLowerCase();
const CLASS_MEMO = new Map(); // the same name, commune and region always give the same guess
function suggestClass(w){
  if(!window.BURG_MATCH) return null;
  const q = {name: w.name!=null ? w.name : w.wine, commune:w.commune, region:w.region}, k = q.name+"|"+q.commune+"|"+q.region;
  if(!CLASS_MEMO.has(k)){ if(CLASS_MEMO.size > 50000) CLASS_MEMO.clear(); CLASS_MEMO.set(k, BURG_MATCH.classify(q)); }
  return CLASS_MEMO.get(k);
}
function classShown(w){
  const c = String(w.classification||"").trim();
  if(c) return {txt:c, est:false};
  const sg = suggestClass(w);
  return sg ? {txt:sg.cls, est:true, sg} : null;
}
// " · Grand cru" after a wine's name; a suggested one is marked ≈ and dashed. Plain AOC isn't worth the space.
function classChip(w){
  const c = classShown(w); if(!c || clsKey(c.txt)==="V") return "";
  return c.est ? ` · <b class="clsest" title="${esc(tr("Suggested from {0} — not saved yet", c.sg.climat||tr("the label")))}">≈ ${esc(c.txt)}</b>` : " · <b>"+esc(c.txt)+"</b>";
}
// A wine drunk somewhere else and never in the cellar: marked by the API since v26; older rows by their shape.
const isElsewhere = w => w.elsewhere || (w.qty===1 && w.drunk===1 && !w.acquired);

/* ---------- tooltip / toast ---------- */
const tip = $("tip");
function showTip(html,x,y){ tip.innerHTML=html; tip.style.opacity=1;
  const r=tip.getBoundingClientRect();
  tip.style.left=Math.min(x+14, innerWidth-r.width-8)+"px";
  tip.style.top=Math.max(4,(y-r.height-10))+"px"; }
function hideTip(){ tip.style.opacity=0; }
let toastT;
// the server's limits, said in words wherever an error message shows their code
const LIMIT_MSG = {"too-many":"You've done that a lot in a short time — wait a while and try again.", "too-big":"That's too large to save."};
const limitText = m => String(m).replace(/\b(too-many|too-big)\b/, c => tr(LIMIT_MSG[c]));
// An error as a person should read it: the API's codes and Google's usual exception texts (quotas, timeouts, locks,
// permissions) in plain words, in the chosen language; anything else as it came, without "Error:"/"Exception:".
const ERR_TEXT = [
  [/^(too-many|too-big)$/, m => tr(LIMIT_MSG[m])],
  [/^stale$/, () => tr("Changed on another device meanwhile. Reload and try again.")],
  [/^(upstream|Failed to fetch|NetworkError.*|Load failed|HTTP 5\d\d)$/i, () => tr("The cellar's server didn't answer. Try again in a moment.")],
  [/^(gateway|origin|gateway-setup)$/, () => tr("The site's server isn't set up right. Tell the owner.")],
  [/Service invoked too many times|Rate Limit Exceeded|too many (requests|times)|Exceeded maximum execution time|timed out|Lock timeout|could not obtain lock|server error occurred|Service unavailable|temporarily unavailable|Address unavailable/i,
    () => tr("Google's servers are busy right now. Try again in a minute.")],
  [/permission|not authori[sz]ed|access denied|authorization is required/i, () => tr("The cellar's server isn't allowed to do that. Tell the owner.")],
];
function errText(err){
  const m = String(err && err.message !== undefined ? err.message : err || "").replace(/^(Error|Exception|TypeError):\s*/i, "").replace(/^Exception:\s*/i, "").trim();
  for(const [re, f] of ERR_TEXT) if(re.test(m)) return f(m);
  return m;
}
function toast(msg){ msg = limitText(msg); const t=$("toast"); t.textContent=msg; t.style.opacity=1;
  clearTimeout(toastT); toastT=setTimeout(()=>t.style.opacity=0, 2600); }

// What just happened, with what can follow it: notify(msg, [{label, fn}], {extra: element, ms}). A button runs its
// action and closes the bar; it goes by itself after a while unless a pointer or the keyboard is in it.
let ACT_T = null;
function notify(msg, actions = [], opt = {}){
  const bar = $("actbar"); clearTimeout(ACT_T); $("toast").style.opacity = 0;
  $("actMsg").textContent = limitText(msg);
  const ex = $("actExtra"); ex.innerHTML = ""; if(opt.extra) ex.appendChild(opt.extra);
  const bs = $("actBtns"); bs.innerHTML = "";
  actions.forEach(a=>{ const b = document.createElement("button"); b.type = "button"; b.textContent = a.label;
    b.addEventListener("click", ()=>{ closeNotify(); a.fn(); }); bs.appendChild(b); });
  bar.hidden = false;
  const later = () => { clearTimeout(ACT_T); ACT_T = setTimeout(()=>{ if(!bar.matches(":hover, :focus-within")) closeNotify(); else later(); }, opt.ms || 8000); };
  later();
}
function closeNotify(){ clearTimeout(ACT_T); $("actbar").hidden = true; }
$("actClose").addEventListener("click", closeNotify);
// The site's own question instead of the browser's OK / Cancel: await ask(text, {ok, danger, typed}) → true / false.
// With typed, OK waits until that exact text is typed (for what can't be undone).
let ASK_DONE = null;
function ask(msg, opt = {}){
  if(ASK_DONE) ASK_DONE(false);
  const m = $("askModal"), ok = $("askOk"), inp = $("askInput");
  $("askMsg").textContent = msg;
  ok.textContent = opt.ok || tr("OK"); ok.classList.toggle("danger", !!opt.danger); $("askCancel").textContent = opt.cancel || tr("Cancel");
  inp.hidden = !opt.typed; inp.value = ""; inp.placeholder = opt.typed || ""; ok.disabled = !!opt.typed;
  inp.oninput = () => { ok.disabled = inp.value.trim().toLowerCase() !== String(opt.typed).toLowerCase(); };
  m.classList.add("open"); (opt.typed ? inp : ok).focus();
  return new Promise(res => { ASK_DONE = v => { ASK_DONE = null; m.classList.remove("open"); res(v); }; });
}
$("askForm").addEventListener("submit", e=>{ e.preventDefault(); if(ASK_DONE && !$("askOk").disabled) ASK_DONE(true); });
$("askCancel").addEventListener("click", ()=>{ if(ASK_DONE) ASK_DONE(false); });
$("askModal").addEventListener("click", e=>{ if(e.target===$("askModal") && ASK_DONE) ASK_DONE(false); });
// Escape closes it like any dialog: that's a no
new MutationObserver(()=>{ if(!$("askModal").classList.contains("open") && ASK_DONE) ASK_DONE(false); }).observe($("askModal"), {attributes:true, attributeFilter:["class"]});

/* ---------- four more views of the cellar: when it needs drinking, value against price, buying and drinking by
   year, price bands. Each panel shows only once there's something to show (and money only with Show prices). ---------- */
function kbar(label, n, max, txt, cls, closes){
  const k = closes!=null ? ` data-closes="${esc(closes)}" role="button" tabindex="0" title="${esc(tr("Show these in the list"))}"` : "";
  return `<div class="kbar${cls?" "+cls:""}"${k}><span class="rb-name">${esc(label)}</span><span class="rb-track"><span class="rb-fill" style="width:${max?Math.max(1.5,n/max*100):0}%"></span></span><span class="rb-n">${esc(txt)}</span></div>`;
}
// the drinking-pressure chart's filter: the year a wine's drink window closes ("past", "later", or a year)
function closeBuckets(Y){
  const out = [{k:"past", lo:-Infinity, hi:Y-1, label:tr("Past")}, {k:String(Y), lo:Y, hi:Y, label:String(Y)}, {k:String(Y+1), lo:Y+1, hi:Y+1, label:String(Y+1)}];
  for(let a = Y+2; a <= Y+5; a += 2) out.push({k:a+"-"+(a+1), lo:a, hi:a+1, label:a+"–"+String(a+1).slice(2)});
  for(let a = Y+6; a <= Y+21; a += 5) out.push({k:a+"-"+(a+4), lo:a, hi:a+4, label:a+"–"+String(a+4).slice(2)});
  out.push({k:"later", lo:Y+26, hi:Infinity, label:tr("Later")});
  return out;
}
function closesIn(w, k){
  const win = drinkWindow(w); if(!win || win.to==null) return false;
  const b = closeBuckets(new Date().getFullYear()).find(x=>x.k===k);
  return !!b && win.to >= b.lo && win.to <= b.hi;
}
function renderMore(cellar){
  const Y = new Date().getFullYear();
  // 1. drinking pressure: the year each bottle's window closes (past ones first, then this year and the next ten)
  // this year and next one by one, then two years at a time, then five: long-lived wines spread out instead of
  // all landing in "Later"
  const CB = closeBuckets(Y), cnt = new Map();
  cellar.forEach(w=>{ const win = drinkWindow(w); if(!win || win.to==null) return;
    const b = CB.find(x=>win.to >= x.lo && win.to <= x.hi); if(b) cnt.set(b.k, (cnt.get(b.k)||0) + w.left); });
  const rows = CB.filter(b=>cnt.get(b.k)).map(b=>[b.label, cnt.get(b.k), b.hi <= Y+1 ? "warn" : "", b.k]);
  $("pressPanel").hidden = rows.length < 2;
  const pm = Math.max(1, ...rows.map(r=>r[1]));
  $("press").innerHTML = rows.map(([l,n,c,k])=>kbar(l, n, pm, btl(n), c, k)).join("");
  // a click shows those bottles in the list, like the other charts; again, and the filter goes
  $("press").querySelectorAll(".kbar[data-closes]").forEach(el=>{
    const go = ()=>{ const k = el.dataset.closes; state.closes = state.closes===k ? "" : k;
      if(state.closes){ state.status="cellar"; $("fStatus").value="cellar"; } renderTable(); };
    el.addEventListener("click", go);
    el.addEventListener("keydown", e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); go(); } });
  });
  // 2. value against price: only bottles with both, so the two sums compare like with like
  const both = cellar.filter(w=>w.value!=null && w.price);
  $("worthPanel").hidden = !both.length;
  if(both.length){
    if(!SHOW_PRICES) $("worth").innerHTML = `<p class="ph">🔒 ${esc(tr("press Show prices"))}</p>`;
    else {
      const paid = both.reduce((s,w)=>s+w.price*w.left,0), now = both.reduce((s,w)=>s+w.value*w.left,0), d = now - paid;
      const pct = paid ? Math.round(d / paid * 100) : 0;
      const gain = both.map(w=>({w, g:(w.value - w.price) * w.left})).sort((a,b)=>b.g-a.g);
      const line = x => `<li><span>${esc(x.w.producer)} ${esc([x.w.name, x.w.vintage].filter(Boolean).join(" "))}</span><span class="${x.g>=0?"up":"down"}">${x.g>=0?"+":"−"}${kr(Math.abs(x.g))}</span></li>`;
      $("worth").innerHTML = `<div class="wsum"><div><b>${kr(paid)}</b><span>${esc(tr("paid"))}</span></div><div><b>${kr(now)}</b><span>${esc(tr("worth now"))}</span></div>
        <div><b class="${d>=0?"up":"down"}">${d>=0?"+":"−"}${kr(Math.abs(d))}</b><span>${d>=0?"+":""}${pct} %</span></div></div>
        <p class="ph">${esc(tr("{0} of {1} bottles have a value", fmt(both.reduce((s,w)=>s+w.left,0)), fmt(cellar.reduce((s,w)=>s+w.left,0))))}</p>
        ${gain.length > 1 ? `<p class="ph">${esc(tr("Biggest gains"))}</p><ul class="wlist">${gain.slice(0,5).filter(x=>x.g>0).map(line).join("")}</ul>` : ""}`;
    }
  }
  // 3. bought and drunk by year: bottles in (acquired) and out (drunk date), the last ten years with any
  const inY = new Map(), outY = new Map(), spent = new Map();
  WINES.forEach(w=>{ const a = parseInt(String(w.acquired||"").slice(0,4),10), d = parseInt(String(w.drunkDate||"").slice(0,4),10);
    if(a){ inY.set(a, (inY.get(a)||0) + (w.qty||0)); spent.set(a, (spent.get(a)||0) + (w.price||0) * (w.qty||0)); }
    if(d) outY.set(d, (outY.get(d)||0) + (w.drunk||0)); });
  const years = [...new Set([...inY.keys(), ...outY.keys()])].sort((a,b)=>b-a).slice(0, 10);
  $("buyPanel").hidden = !inY.size;
  const bm = Math.max(1, ...years.map(y=>Math.max(inY.get(y)||0, outY.get(y)||0)));
  $("buy").innerHTML = years.map(y=>{ const i = inY.get(y)||0, o = outY.get(y)||0;
    return `<div class="kbar kbar2"><span class="rb-name">${y}</span><span class="rb-track"><span class="rb-fill" style="width:${i?Math.max(1.5,i/bm*100):0}%"></span><span class="rb-fill out" style="width:${o?Math.max(1.5,o/bm*100):0}%"></span></span>
      <span class="rb-n">+${fmt(i)} / −${fmt(o)}${SHOW_PRICES && spent.get(y) ? `<br>${esc(kr(spent.get(y)))}` : ""}</span></div>`; }).join("");
  // 4. price bands (in kroner, what one bottle cost)
  const B = [[0,200,"< 200"],[200,500,"200–500"],[500,1500,"500–1.500"],[1500,5000,"1.500–5.000"],[5000,1e12,"5.000 +"]];
  const priced = cellar.filter(w=>w.price>0);
  $("bandPanel").hidden = priced.length < 3;
  if(!SHOW_PRICES) $("bands").innerHTML = `<p class="ph">🔒 ${esc(tr("press Show prices"))}</p>`;
  else { const cnt = B.map(([lo,hi])=>priced.filter(w=>w.price>=lo && w.price<hi).reduce((s,w)=>s+w.left,0)), mx = Math.max(1, ...cnt);
    $("bands").innerHTML = B.map(([,,l],i)=>cnt[i] ? kbar(l + " kr", cnt[i], mx, btl(cnt[i]), "wide") : "").join(""); }
}

/* ---------- overview (rebuilt on every data load) ---------- */
function renderOverview(){
  renderTips();
  const cellar = WINES.filter(w=>w.left>0);
  renderRack(cellar);
  const bottlesLeft = cellar.reduce((s,w)=>s+w.left,0);
  const drunk = WINES.reduce((s,w)=>s+w.drunk,0);
  const iconWines = cellar.filter(w=>PRODUCER_NOTES[w.producer]?.[0]==="legend");
  const iconCount = iconWines.reduce((s,w)=>s+w.left,0);
  // name the icon producers actually in the cellar, most bottles first
  const iconBy = {}; iconWines.forEach(w=>{ iconBy[w.producer]=(iconBy[w.producer]||0)+w.left; });
  const iconNames = Object.entries(iconBy).sort((a,b)=>b[1]-a[1]).map(([p])=>p);
  const iconHint = iconNames.length ? esc(iconNames.slice(0,3).join(", "))+(iconNames.length>3?"…":"") : tr("none in the cellar yet");

  const litres = cellar.reduce((s,w)=>s+formatOf(w).l*w.left,0);
  const anyBig = cellar.some(w=>!isStdBottle(w));
  const kpis = [
    [tr("Bottles in cellar"), fmt(bottlesLeft),
      (cellar.length===1 ? tr("1 different wine") : tr("{0} different wines", cellar.length))+(anyBig?" · "+fmtLitres(litres)+" L":""), ""],
  ];
  if(SHOW_PRICES){
    const valueLeft = cellar.reduce((s,w)=>s+(w.price||0)*w.left,0);
    kpis.push([tr("Cellar value"), kr(valueLeft), tr("at purchase price"), ""]);
    // the average over the bottles that have a price: one at 150 and one with none averages 150, not 75
    const pricedLeft = cellar.reduce((s,w)=>s+(w.price>0?w.left:0),0);
    kpis.push([tr("Avg. bottle"), kr(pricedLeft?valueLeft/pricedLeft:0),
      pricedLeft < bottlesLeft ? tr("over {0} with a price", btl(fmt(pricedLeft))) : tr("cellar average"), ""]);
    const valued = cellar.filter(w=>w.value!=null);
    if(valued.length){
      const market = valued.reduce((s,w)=>s+w.value*w.left,0);
      const paid = valued.reduce((s,w)=>s+(w.price||0)*w.left,0);
      const nBtl = valued.reduce((s,w)=>s+w.left,0);
      kpis.push([tr("Current value"), kr(market),
        tr("{0} of {1} wines valued", valued.length, cellar.length)+" · "+btl(fmt(nBtl)), ""]);
      if(paid>0){
        const gain = market-paid, pct = Math.round(gain/paid*100);
        kpis.push([(gain>=0?tr("Unrealised gain"):tr("Unrealised loss")),
          (gain>=0?"+":"−")+kr(Math.abs(gain)),
          tr("vs. paid on valued wines")+(isFinite(pct)?" · "+(gain>=0?"+":"−")+Math.abs(pct)+"%":""),
          ""]);
      }
    }
  }else{
    kpis.push([tr("Cellar value"), "🔒 "+tr("hidden"), tr("press Show prices above"), "locked"]);
  }
  kpis.push([tr("Icon-producer bottles"), fmt(iconCount), iconHint, ""]);
  kpis.push([tr("Enjoyed so far"), fmt(drunk), tr("bottles drunk"), ""]);
  $("kpis").innerHTML = kpis.map(([l,v,h,c])=>
    `<div class="kpi ${c}"><div class="lbl">${l}</div><div class="val">${v}</div><div class="hint">${h}</div></div>`).join("");

  /* regions */
  const regAgg = {};
  cellar.forEach(w=>{ const r=regAgg[w.region] ??= {b:0,v:0}; r.b+=w.left; r.v+=(w.price||0)*w.left; });
  const regs = Object.entries(regAgg).sort((a,b)=>b[1].b-a[1].b);
  const topRegs = regs.slice(0,8);
  const rest = regs.slice(8);
  if(rest.length) topRegs.push([tr("Other ({0} regions)", rest.length),
    {b:rest.reduce((s,r)=>s+r[1].b,0), v:rest.reduce((s,r)=>s+r[1].v,0), other:true}]);
  const maxB = topRegs.length ? topRegs[0][1].b : 1;
  $("regions").innerHTML = topRegs.map(([name,r])=>`
    <button class="rbar" data-region="${r.other?"":esc(name)}" aria-label="${esc(name)}: ${esc(tr("{0} bottles", r.b))}">
      <span class="rb-name">${esc(name)}</span>
      <span class="rb-track"><span class="rb-fill" style="width:${Math.max(1.5,r.b/maxB*100)}%"></span></span>
      <span class="rb-n">${btl(r.b)}</span>
    </button>`).join("");
  document.querySelectorAll(".rbar").forEach(el=>{
    el.addEventListener("mousemove",e=>{
      const label = el.querySelector(".rb-name").textContent;
      const r = topRegs.find(t=>t[0]===label)[1];
      showTip(`<b>${esc(label)}</b><br>${esc(tr("{0} bottles", r.b))}${SHOW_PRICES?" · "+kr(r.v):""}`,e.clientX,e.clientY);
    });
    el.addEventListener("mouseleave",hideTip);
    el.addEventListener("click",()=>{ const name=el.dataset.region; if(!name) return;
      state.region = state.region===name ? "" : name;
      $("fRegion").value = state.region; renderTable(); });
  });

  renderMore(cellar);

  /* styles */
  const styAgg = {};
  cellar.forEach(w=>{ styAgg[w.style]=(styAgg[w.style]||0)+w.left; });
  const styList = STYLES.filter(s=>styAgg[s]);
  drawPie(styList, styAgg, bottlesLeft);
  $("slegend").innerHTML = styList.map(s=>`
    <button data-style="${s}"><span class="dot" style="background:var(${STYLE_VAR[s]})"></span>
    <span>${tr(STYLE_EN[s])}</span><span class="n">${btl(styAgg[s])} · ${Math.round(styAgg[s]/Math.max(1,bottlesLeft)*100)}%</span></button>`).join("");
  document.querySelectorAll("#slegend button").forEach(el=>
    el.addEventListener("click",()=>{ const s=el.dataset.style;
      state.style = state.style===s ? "" : s;
      $("fStyle").value = state.style; renderTable(); }));

  /* producers */
  const prodAgg = {};
  cellar.forEach(w=>{ const p=prodAgg[w.producer] ??= {b:0,v:0,n:0}; p.b+=w.left; p.v+=(w.price||0)*w.left; p.n++; });
  const prods = Object.entries(prodAgg).sort((a,b)=>b[1].b-a[1].b);
  const topProds = prods.slice(0,10);
  const maxPB = topProds.length ? topProds[0][1].b : 1;
  $("producers").innerHTML = topProds.map(([name,p])=>`
    <button class="rbar" data-prod="${esc(name)}" aria-label="${esc(name)}: ${esc(tr("{0} bottles", p.b))}">
      <span class="rb-name">${esc(name)}</span>
      <span class="rb-track"><span class="rb-fill" style="width:${Math.max(1.5,p.b/maxPB*100)}%"></span></span>
      <span class="rb-n">${btl(p.b)}</span>
    </button>`).join("") + (prods.length>10?`<div class="morep">${esc(tr("+ {0} more producers — use the search box", prods.length-10))}</div>`:"");
  document.querySelectorAll("#producers .rbar").forEach(el=>{
    const name = el.dataset.prod, p = prodAgg[name];
    el.addEventListener("mousemove",e=>showTip(`<b>${esc(name)}</b><br>${esc(nBottles(p.b))} · ${esc(nWines(p.n))}${SHOW_PRICES?" · "+kr(p.v):""}`,e.clientX,e.clientY));
    el.addEventListener("mouseleave",hideTip);
    el.addEventListener("click",()=>{
      state.q = state.q.trim()===name ? "" : name;
      $("q").value = state.q; renderTable(); });
  });

  updateMap(cellar);
  drawHistory();
  renderInsights(cellar);
  renderPriorities(cellar);

  /* vintage histogram */
  const byV = {};
  cellar.forEach(w=>{ const k = typeof w.vintage==="number" ? w.vintage : "NV";
    (byV[k] ??= {b:0,wines:[]}).b += w.left; byV[k].wines.push(w); });
  const years = Object.keys(byV).filter(k=>k!=="NV").map(Number).sort((a,b)=>a-b);
  const keys = [...years, ...(byV.NV?["NV"]:[])];
  // as wide as its box really is (the side column, or a full row), so labels keep their size
  const W=Math.max(300, Math.round(($("vintChart").parentElement||{}).clientWidth || 980)), H=W<600?160:190, P={l:8,r:8,t:14,b:22};
  const maxV = Math.max(1,...keys.map(k=>byV[k].b));
  const bw = (W-P.l-P.r)/Math.max(1,keys.length);
  const svg = $("vintChart");
  svg.setAttribute("viewBox",`0 0 ${W} ${H}`);
  let html="";
  keys.forEach((k,i)=>{
    const d=byV[k], h=Math.max(3,d.b/maxV*(H-P.t-P.b)), x=P.l+i*bw, y=H-P.b-h;
    html+=`<g class="vcol" data-k="${k}">
      <rect x="${x+bw*0.12}" y="${P.t}" width="${bw*0.76}" height="${H-P.t-P.b}" fill="transparent"></rect>
      <rect class="bar" x="${x+bw*0.12}" y="${y}" width="${bw*0.76}" height="${h}" rx="3"></rect>
      <text class="vnum" x="${x+bw/2}" y="${y-4}" text-anchor="middle">${d.b}</text>
      <text class="vaxis" x="${x+bw/2}" y="${H-7}" text-anchor="middle">${typeof k==="number"?String(k).slice(2):"NV"}</text>
    </g>`;
  });
  svg.innerHTML = html;
  svg.querySelectorAll(".vcol").forEach(g=>{
    const k = g.dataset.k, d = byV[k==="NV"?"NV":Number(k)];
    g.addEventListener("mousemove",e=>{
      const names = d.wines.slice(0,3).map(w=>w.producer).join(", ");
      showTip(`<b>${k==="NV"?esc(tr("Non-vintage")):k}</b><br>${esc(nBottles(d.b))} · ${esc(nWines(d.wines.length))}<br><span style="opacity:.75">${esc(names)}${d.wines.length>3?"…":""}</span>`,e.clientX,e.clientY);
    });
    g.addEventListener("mouseleave",hideTip);
    g.addEventListener("click",()=>{ $("q").value = state.q = (k==="NV"?"NV":k); renderTable(); });
  });

  /* filter dropdown options (preserve selection) */
  const ctrys = [...new Set(WINES.filter(w=>w.left>0||state.status!=="cellar").map(w=>w.country).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const selC = $("fCountry");
  selC.hidden = ctrys.length < 2 && !state.country; // one country is no choice
  selC.innerHTML = `<option value="">${esc(tr("All countries"))}</option>` + ctrys.map(c=>`<option${state.country===c?" selected":""}>${esc(c)}</option>`).join("");
  const selR = $("fRegion");
  selR.innerHTML = `<option value="">${esc(tr("All regions"))}</option>` +
    regs.map(([name])=>`<option${state.region===name?" selected":""}>${esc(name)}</option>`).join("");
  const selS = $("fStyle");
  selS.innerHTML = `<option value="">${esc(tr("All styles"))}</option>` +
    STYLES.map(s=>`<option value="${s}"${state.style===s?" selected":""}>${tr(STYLE_EN[s])}</option>`).join("");

  const places = [...new Set(WINES.filter(w=>w.left>0||state.status!=="cellar").map(w=>locPlace(w.location)).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const selL = $("fLoc");
  if(places.length || state.loc){
    selL.hidden = false;
    selL.innerHTML = `<option value="">${esc(tr("All locations"))}</option>` + places.map(p=>`<option${state.loc===p?" selected":""}>${esc(p)}</option>`).join("")
      + `<option value="-"${state.loc==="-"?" selected":""}>${esc(tr("No location yet"))}</option>`;
  } else selL.hidden = true;
  $("locList").innerHTML = [...new Set(WINES.map(w=>w.location).filter(Boolean))].sort().map(l=>`<option>${esc(l)}</option>`).join("");

  /* datalists in the add form */
  $("regionsList").innerHTML = [...new Set(WINES.map(w=>w.region).filter(Boolean))].sort().map(r=>`<option>${esc(r)}</option>`).join("");
  $("countries").innerHTML = [...new Set(WINES.map(w=>w.country).filter(Boolean))].sort().map(r=>`<option>${esc(r)}</option>`).join("");
  $("grapes").innerHTML = [...new Set(WINES.map(w=>w.grape).filter(Boolean))].sort().map(r=>`<option>${esc(r)}</option>`).join("");
  renderQuickPicks();
}

/* ---------- style pie ---------- */
function donutArc(cx,cy,R,r,a0,a1){
  if(a1-a0 >= 2*Math.PI-0.001){
    return `M ${cx} ${cy-R} A ${R} ${R} 0 1 1 ${(cx-0.01).toFixed(2)} ${cy-R} L ${(cx-0.01).toFixed(2)} ${cy-r} A ${r} ${r} 0 1 0 ${cx} ${cy-r} Z`;
  }
  const large=(a1-a0)>Math.PI?1:0;
  const x0=cx+R*Math.cos(a0),y0=cy+R*Math.sin(a0),x1=cx+R*Math.cos(a1),y1=cy+R*Math.sin(a1);
  const xi=cx+r*Math.cos(a1),yi=cy+r*Math.sin(a1),xj=cx+r*Math.cos(a0),yj=cy+r*Math.sin(a0);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} L ${xi.toFixed(2)} ${yi.toFixed(2)} A ${r} ${r} 0 ${large} 0 ${xj.toFixed(2)} ${yj.toFixed(2)} Z`;
}
function drawPie(styList, styAgg, total){
  const svg=$("stylePie"); if(!svg) return;
  const C=115,R=100,IR=60;
  svg.setAttribute("viewBox","0 0 230 230");
  let a0=-Math.PI/2, html="";
  styList.forEach(st=>{
    const a1=a0+(styAgg[st]/Math.max(1,total))*2*Math.PI;
    html+=`<path class="pslice" data-style="${st}" d="${donutArc(C,C,R,IR,a0,a1)}" style="fill:var(${STYLE_VAR[st]})"></path>`;
    a0=a1;
  });
  html+=`<text class="pcen" x="${C}" y="${C+2}" text-anchor="middle">${fmt(total)}</text>
    <text class="pcen2" x="${C}" y="${C+22}" text-anchor="middle">${esc(tr("bottles"))}</text>`;
  svg.innerHTML=html;
  svg.querySelectorAll(".pslice").forEach(pl=>{
    const st=pl.dataset.style;
    pl.addEventListener("mousemove",e=>showTip(`<b>${tr(STYLE_EN[st])}</b><br>${btl(styAgg[st])} · ${Math.round(styAgg[st]/Math.max(1,total)*100)}%`,e.clientX,e.clientY));
    pl.addEventListener("mouseleave",hideTip);
    pl.addEventListener("click",()=>{ state.style = state.style===st ? "" : st;
      $("fStyle").value = state.style; renderTable(); });
  });
}

/* ---------- cellar insights ---------- */
function renderInsights(cellar){
  const el=$("insights"); if(!el) return;
  const items=[];
  const vintaged=cellar.filter(w=>typeof w.vintage==="number");
  if(vintaged.length){ const o=vintaged.reduce((a,b)=>b.vintage<a.vintage?b:a);
    items.push([tr("Oldest vintage"), o.vintage, esc(o.producer)]); }
  if(SHOW_PRICES){ const priced=cellar.filter(w=>w.price);
    if(priced.length){ const p=priced.reduce((a,b)=>b.price>a.price?b:a);
      items.push([tr("Priciest bottle"), kr(p.price), esc(p.producer)]); } }
  const reg={}; cellar.forEach(w=>{ if(w.region) reg[w.region]=(reg[w.region]||0)+w.left; });
  const topR=Object.entries(reg).sort((a,b)=>b[1]-a[1])[0];
  if(topR) items.push([tr("Top region"), esc(topR[0]), btl(topR[1])]);
  const gr={}; cellar.forEach(w=>{ if(w.grape) gr[w.grape]=(gr[w.grape]||0)+w.left; });
  const tg=Object.entries(gr).sort((a,b)=>b[1]-a[1])[0];
  if(tg) items.push([tr("Top grape"), esc(tg[0]), btl(tg[1])]);
  const rated=cellar.filter(w=>w.rating!=null);
  if(rated.length){ const avg=rated.reduce((s,w)=>s+w.rating,0)/rated.length;
    items.push([tr("Average score"), avg.toFixed(1)+"/10", tr("{0} rated", rated.length)]); }
  const windowed=cellar.filter(w=>readiness(w));
  if(windowed.length){ const ready=cellar.filter(w=>{const r=readiness(w);return r&&r.k==="now";}).reduce((s,w)=>s+w.left,0);
    items.push([tr("Ready to drink"), btl(fmt(ready)), tr("in their window now")]); }
  el.innerHTML = items.map(([l,v,h])=>`<div class="ins"><div class="ins-l">${l}</div><div class="ins-v">${v}</div><div class="ins-h">${h}</div></div>`).join("");
  const panel = el.closest(".panel"); if(panel) panel.hidden = !items.length;
}

// The bottles to open first, by name: past their window (the longest past first), then the ones closing this year or
// next (the soonest first), then those in their window; a tap opens the wine in the list
function renderOpenNext(cellar){
  const box=$("openNext"); if(!box) return;
  const y=new Date().getFullYear(), rank={past:0, soon:1, now:2};
  const list=cellar.filter(w=>w.left>0).map(w=>{ const r=readiness(w); if(!r || r.k==="young") return null; const win=drinkWindow(w);
    return {w, r, win, k:r.k==="now" ? (r.soon?"soon":"now") : r.k}; }).filter(Boolean)
    .sort((a,b)=>rank[a.k]-rank[b.k] || (a.win.to??9999)-(b.win.to??9999) || (b.w.value||b.w.price||0)-(a.w.value||a.w.price||0)).slice(0,5);
  box.hidden=!list.length;
  box.innerHTML=list.map(({w,r,win,k},i)=>`<li class="${k}"><button type="button" data-i="${i}"><span>${esc(w.producer)}${w.name?" · "+esc(w.name):""}${typeof w.vintage==="number"?" "+w.vintage:""}</span>`
    +`<small>${esc(r.label)} · ${win.from??"?"}–${win.to??"?"}${r.est?" ("+esc(tr("estimated"))+")":""} · ${esc(btl(w.left))}</small></button></li>`).join("");
  box.querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>{ const {w,k}=list[+b.dataset.i];
    // show it in the list under the same chip, opened
    state.status="cellar"; $("fStatus").value="cellar"; state.ready=k; $("fReady").value=k; state.q=""; $("q").value="";
    showWine(w); }));
}
// a wine opened in the list and brought into view (the list's filters cleared if they'd hide it)
function showWine(w){
  KEEP_OPEN=w.row; renderTable();
  if(!SHOWN.some(x=>x.row===w.row)){ $("clear").click(); KEEP_OPEN=w.row; renderTable(); }
  const row=document.querySelector(`#tbl tr.main[data-row="${w.row}"]`); if(row){ row.scrollIntoView({behavior:"smooth",block:"center"}); row.focus({preventScroll:true}); }
}

/* ---------- the wine rack: a bottle for each bottle in the cellar, coloured by type, the most pressing first (past their
   window, then closing soon, in it, too young); the capsule is amber when it's time. A tap opens the wine. A big cellar
   shows a few rows and "+ N more". ---------- */
const RACK_COL = {"Rød":"var(--b-red)","Hvid":"var(--b-white)","Rosé":"var(--b-rose)","Bobler":"var(--b-spark)"};
const BOTTLE_SVG = `<svg viewBox="0 0 64 20" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><path class="gl" d="M3 3.5h33c4 0 6.5 2.6 9.5 4.3h6V12h-6c-3 1.9-5.5 4.5-9.5 4.5H3C1.6 16.5 1 15.4 1 14V6c0-1.4.6-2.5 2-2.5z"/><rect class="cp" x="51" y="7.3" width="11" height="5.4" rx="1.4"/><path d="M5 6.5h28" stroke="rgba(255,255,255,.35)" stroke-width="1.4" stroke-linecap="round"/></svg>`;
let RACK_ALL = false;
const rackKey = w => { const r = readiness(w); return !r ? "none" : r.k==="now" ? (r.soon?"soon":"now") : r.k; };
function placeWall(){
  const wall = $("wall"), side = document.querySelector("#overview .side-body"); if(!wall || !side) return;
  if(matchMedia("(min-width:1181px)").matches){ if(wall.parentNode !== side) side.insertBefore(wall, side.firstChild); }
  else if(wall.nextElementSibling !== $("kpis")) $("kpis").parentNode.insertBefore(wall, $("kpis"));
}
matchMedia("(min-width:1181px)").addEventListener("change", ()=>{ placeWall(); renderRack(WINES.filter(w=>w.left>0)); });
function renderRack(cellar){
  const wall = $("wall"); if(!wall) return; placeWall(); closeRackCard();
  const bottles = cellar.reduce((n,w)=>n+w.left,0);
  wall.hidden = !bottles; if(!bottles) return;
  const order = {past:0, soon:1, now:2, none:3, young:4};
  const all = cellar.slice().sort((a,b)=>order[rackKey(a)]-order[rackKey(b)] || (a.drinkTo??drinkWindow(a)?.to??9999)-(b.drinkTo??drinkWindow(b)?.to??9999))
    .flatMap(w=>Array.from({length:w.left}, ()=>w));
  const R = $("rack"), width = R.clientWidth || 320, cols = Math.max(4, Math.floor((width - 20 + 6) / (52 + 6)));
  // a few bottles over the rows aren't worth a "more" button: they're shown
  const rows = matchMedia("(max-width:700px)").matches ? 7 : 5, room = all.length <= cols*(rows+1) ? all.length : cols*rows, cap = RACK_ALL ? all.length : room;
  // empty places show room left in the rack, only when every bottle is in view
  const shown = all.slice(0, cap), slots = cap < all.length ? cap : Math.max(cols*2, Math.ceil((shown.length + 1) / cols) * cols);
  const motion = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  let html = "";
  for(let i=0; i<slots; i++){ const w = shown[i];
    if(!w){ html += `<span class="btl slot">${BOTTLE_SVG}</span>`; continue; }
    const k = rackKey(w), nm = `${w.producer}${w.name?" · "+w.name:""}${typeof w.vintage==="number"?" "+w.vintage:""}`, r = readiness(w);
    html += `<button type="button" class="btl ${k}" data-row="${w.row}" style="--c:${RACK_COL[w.style]||"var(--b-red)"};animation-delay:${motion?Math.min(i,60)*18:0}ms" title="${esc(nm)}" aria-label="${esc(nm+(r?" — "+r.label:""))}">${BOTTLE_SVG}</button>`; }
  R.innerHTML = html;
  const more = $("rackMore"); more.hidden = room >= all.length;
  more.textContent = RACK_ALL ? tr("Show fewer") : tr("+ {0} more bottles", fmt(all.length - cap));
  const val = cellar.reduce((n,w)=>n+(w.price||0)*w.left,0);
  $("wallN").textContent = fmt(bottles);
  $("wallSub").textContent = (bottles===1 ? tr("bottle") : tr("bottles")) + (SHOW_PRICES && val ? " · " + kr(val) : "");
  // each figure counts exactly what its filter in the list shows
  const n = f => cellar.filter(w=>{ const r = readiness(w); return r && f(r); }).reduce((t,w)=>t+w.left,0);
  const past = n(r=>r.k==="past");
  $("wallStats").innerHTML = [["now", n(r=>r.k==="now"), tr("ready now")], past ? ["past", past, tr("past their best")] : ["soon", n(r=>r.soon), tr("closing soon")], ["young", n(r=>r.k==="young"), tr("still too young")]]
    .map(([k,n,l])=>`<button type="button" data-ready="${k}"><b>${fmt(n)}</b><span>${esc(l)}</span></button>`).join("");
}
// a tap on a bottle: a small card by it (the wine, its window, Drink a bottle, Show in the list); the page stays put
$("rack").addEventListener("click", e=>{ const b = e.target.closest("button.btl"); if(!b) return; const w = WINES.find(x=>x.row===Number(b.dataset.row)); if(w) rackCard(w, b); });
function rackCard(w, b){
  const card = $("rackCard"), r = readiness(w), win = drinkWindow(w);
  if(!card.hidden && card.dataset.row === String(w.row)){ closeRackCard(); return; }
  card.dataset.row = w.row;
  const where = [w.commune, w.region, w.country].filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i).join(", ");
  card.innerHTML = `<button type="button" class="rc-x" aria-label="${esc(tr("Close"))}">✕</button>
    <span class="rc-k ${r ? (r.k==="now" && r.soon ? "soon" : r.k) : ""}">${r ? esc(r.label) : ""}${r && r.est ? " · " + esc(tr("estimated")) : ""}</span>
    <b class="rc-p">${esc(w.producer)}</b>
    <span class="rc-w">${esc([w.name, typeof w.vintage==="number" ? w.vintage : (w.vintage||"NV")].filter(Boolean).join(" · "))}</span>
    <span class="rc-m">${esc([where, win ? `${win.from??"?"}–${win.to??"?"}` : "", btl(fmt(w.left)), SHOW_PRICES && w.price ? kr(w.price) : ""].filter(Boolean).join(" · "))}</span>
    <span class="rc-a"><button type="button" class="btn primary" data-rc="drink">🍷 ${esc(tr("Drink a bottle"))}</button><button type="button" class="btn" data-rc="list">${esc(tr("Show in the list"))}</button></span>`;
  card.hidden = false;
  // by the bottle, inside the rack's panel: under it, or over it when there's no room below
  const wall = $("wall").getBoundingClientRect(), br = b.getBoundingClientRect(), cw = Math.min(300, wall.width - 16);
  card.style.width = cw + "px";
  const left = Math.max(8, Math.min(br.left - wall.left + br.width/2 - cw/2, wall.width - cw - 8));
  const below = br.bottom - wall.top + 8, h = card.offsetHeight;
  card.style.left = left + "px"; card.style.top = (below + h > wall.height + 40 ? br.top - wall.top - h - 8 : below) + "px";
  card.querySelector(".rc-x").onclick = closeRackCard;
  card.querySelector('[data-rc="drink"]').onclick = ev => { closeRackCard(); rowAction("drink", w.row, ev.currentTarget); };
  card.querySelector('[data-rc="list"]').onclick = () => { closeRackCard(); showWine(w); };
  card.querySelector('[data-rc="drink"]').focus({preventScroll:true});
}
function closeRackCard(){ const c = $("rackCard"); if(c){ c.hidden = true; c.dataset.row = ""; } }
document.addEventListener("pointerdown", e=>{ if(!e.target.closest("#rackCard, #rack button.btl")) closeRackCard(); });
document.addEventListener("keydown", e=>{ if(e.key==="Escape") closeRackCard(); });
$("rackMore").addEventListener("click", ()=>{ RACK_ALL = !RACK_ALL; renderRack(WINES.filter(w=>w.left>0)); });
$("wallStats").addEventListener("click", e=>{ const b = e.target.closest("button[data-ready]"); if(!b) return;
  state.status="cellar"; $("fStatus").value="cellar"; state.ready=b.dataset.ready; $("fReady").value=b.dataset.ready; renderTable();
  const t = $("tbl"); if(t) t.scrollIntoView({behavior:"smooth", block:"start"}); });
let RACK_W = 0; new ResizeObserver(()=>{ const w = $("rack").clientWidth; if(w && Math.abs(w-RACK_W) > 30){ RACK_W = w; if(WINES.length) renderRack(WINES.filter(x=>x.left>0)); } }).observe($("rack"));
// Actionable "what should I drink" chips — click one to filter the table by readiness.
function renderPriorities(cellar){
  const el=$("priorities"); if(!el) return;
  const cat={past:0, soon:0, now:0, young:0};
  cellar.forEach(w=>{ const r=readiness(w); if(!r) return;
    const k = r.k==="now" ? (r.soon?"soon":"now") : r.k; cat[k]+=w.left; });
  const defs=[
    ["past","past",tr("Past peak — drink up")],
    ["soon","soon",tr("Closing soon")],
    ["now","now",tr("Drink now")],
    ["young","young",tr("Too young")],
  ];
  const chips=defs.filter(([k])=>cat[k]>0).map(([k,fval,label])=>
    `<button class="prio ${k}" data-ready="${fval}"><span class="prio-n">${fmt(cat[k])}</span> ${label}</button>`).join("");
  el.innerHTML = chips || `<span class="ins-h">${esc(tr("Set drink windows on your wines to see priorities here."))}</span>`;
  const panel=el.closest(".chipbar"); if(panel) panel.hidden = !chips;
  renderOpenNext(cellar);
  el.querySelectorAll(".prio").forEach(b=>b.addEventListener("click",()=>{
    state.status="cellar"; $("fStatus").value="cellar";
    state.ready=b.dataset.ready; $("fReady").value=b.dataset.ready;
    renderTable();
    const t=$("tbl"); if(t) t.scrollIntoView({behavior:"smooth",block:"center"});
  }));
}

/* ---------- collection over time ---------- */
// Pure: turn wines into dated +acquire / -drunk events and a running total.
function buildHistory(wines, now){
  now = now || Date.now();
  const parse = s => { const d = new Date(String(s||"").slice(0,10)+"T12:00:00"); return isNaN(d)?null:d.getTime(); };
  const ev = []; let withAcq=0, withoutAcq=0, drinkEvents=0;
  wines.forEach(w=>{
    const a = parse(w.acquired);
    // A row the journal created for a wine we never owned (1 bottle, drunk, no
    // acquired date) is undated on purpose — nagging about it can never be resolved.
    const neverOwned = w.qty===1 && w.drunk===1;
    if(a===null){ if(w.qty>0 && !neverOwned) withoutAcq++; return; }
    withAcq++;
    ev.push({t:a, d:w.qty, kind:"acq", w});
    const dd = parse(w.drunkDate);
    if(dd!==null && w.drunk>0){ ev.push({t:dd, d:-w.drunk, kind:"drink", w}); drinkEvents++; }
  });
  ev.sort((x,y)=> x.t-y.t || (x.kind==="acq"?-1:1)); // same-day acquisitions before drinks
  let cum=0; const points=[];
  ev.forEach(e=>{ cum+=e.d; points.push({t:e.t, cum, d:e.d, kind:e.kind, w:e.w}); });
  return { events:ev, points, cum, withAcq, withoutAcq, drinkEvents,
           tMin: ev.length?ev[0].t:now, tMax: now,
           max: points.reduce((m,p)=>Math.max(m,p.cum),0) };
}

function drawHistory(){
  const svg=$("histChart"), cap=$("histCap"); if(!svg) return;
  const H = buildHistory(WINES);
  $("histPanel").hidden = !H.events.length; // an empty box until wines have an acquired date
  if(!H.events.length){
    svg.innerHTML=""; svg.removeAttribute("viewBox");
    cap.textContent = tr("Add an “Acquired” date to your wines (in the sheet, or when adding one) to see the collection grow over time.");
    return;
  }
  const W=980,Hh=250,P={l:26,r:16,t:20,b:30};
  let tMin=H.tMin, tMax=Math.max(H.tMax, H.points[H.points.length-1].t);
  if(tMax<=tMin) tMax = tMin + 30*864e5;
  const padT=(tMax-tMin)*0.03; tMin-=padT; tMax+=padT; // keep first/last glyphs off the edge
  const maxY=Math.max(1,H.max);
  const X=t=>P.l+(t-tMin)/(tMax-tMin)*(W-P.l-P.r);
  const Y=v=>Hh-P.b-(v/maxY)*(Hh-P.t-P.b);

  let parts=[];
  // faint year ticks
  const y0=new Date(tMin).getFullYear(), y1=new Date(tMax).getFullYear();
  for(let y=y0; y<=y1; y++){
    const tx=new Date(y+"-01-01T12:00:00").getTime();
    if(tx<tMin||tx>tMax) continue;
    parts.push(`<line class="hist-grid" x1="${X(tx).toFixed(1)}" y1="${P.t}" x2="${X(tx).toFixed(1)}" y2="${(Hh-P.b).toFixed(1)}"/>
      <text class="hist-axis" x="${X(tx).toFixed(1)}" y="${Hh-10}" text-anchor="middle">${y}</text>`);
  }
  parts.push(`<line class="hist-base" x1="${P.l}" y1="${Y(0).toFixed(1)}" x2="${(W-P.r).toFixed(1)}" y2="${Y(0).toFixed(1)}"/>
    <text class="hist-axis" x="2" y="${(Y(maxY)+3).toFixed(1)}">${maxY}</text>`);

  // smooth cumulative line + soft area (the aggregate)
  let d=`M ${X(tMin).toFixed(1)} ${Y(0).toFixed(1)}`, prev=0;
  H.points.forEach(p=>{ d+=` L ${X(p.t).toFixed(1)} ${Y(prev).toFixed(1)} L ${X(p.t).toFixed(1)} ${Y(p.cum).toFixed(1)}`; prev=p.cum; });
  d+=` L ${X(tMax).toFixed(1)} ${Y(prev).toFixed(1)}`;
  parts.push(`<path class="hist-area" d="${d} L ${X(tMax).toFixed(1)} ${Y(0).toFixed(1)} L ${X(tMin).toFixed(1)} ${Y(0).toFixed(1)} Z"/>`);
  parts.push(`<path class="hist-line" d="${d}"/>`);

  // event markers: ＋ added / − drunk, coloured by wine style
  H.points.forEach(p=>{
    const a=4.5, cx=X(p.t), cy=Y(p.cum), col=HIST_COLOR[p.w.style]||"var(--muted)";
    const hz=`M ${(cx-a).toFixed(1)} ${cy.toFixed(1)} H ${(cx+a).toFixed(1)}`;
    const gd = p.kind==="acq" ? `${hz} M ${cx.toFixed(1)} ${(cy-a).toFixed(1)} V ${(cy+a).toFixed(1)}` : hz;
    parts.push(`<g class="hist-ev" data-t="${p.t}" data-d="${p.d}" data-cum="${p.cum}"
        data-style="${esc(tr(STYLE_EN[p.w.style])||p.w.style||"")}" data-w="${esc((p.w.producer||"")+(p.w.name?" · "+p.w.name:""))}">
      <path class="hist-halo" d="${gd}"/>
      <path class="hist-glyph" style="stroke:${col}" d="${gd}"/>
      <circle class="hist-hit" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="10"/></g>`);
  });

  svg.setAttribute("viewBox",`0 0 ${W} ${Hh}`);
  svg.innerHTML=parts.join("");
  svg.querySelectorAll(".hist-ev").forEach(g=>{
    g.addEventListener("mousemove",e=>{
      const n=Number(g.dataset.d), when=fmtDate(ymdLocal(new Date(Number(g.dataset.t))));
      const what = n>0 ? tr("added {0}", n) : tr("drunk {0}", -n);
      showTip(`<b>${when}</b> · ${esc(g.dataset.style)}<br>${esc(what)} — ${esc(g.dataset.w)}<br><span style="opacity:.75">${esc(tr("{0} in cellar after", g.dataset.cum))}</span>`,e.clientX,e.clientY);
    });
    g.addEventListener("mouseleave",hideTip);
  });

  const bits=[H.withAcq===1 ? tr("1 wine on the timeline") : tr("{0} wines on the timeline", H.withAcq), tr("{0} drunk", H.drinkEvents)];
  if(H.withoutAcq) bits.push(tr("{0} without an acquired date (not shown)", H.withoutAcq));
  cap.textContent = bits.join(" · ");
}

/* ---------- the cellar's two views: the list, or its drink windows on a timeline (same filters) ---------- */
let CELLAR_VIEW = (()=>{ try{ return localStorage.getItem("vinView")==="timeline" ? "timeline" : "list"; }catch(e){ return "list"; } })();
function setCellarView(v){
  CELLAR_VIEW = v; try{ localStorage.setItem("vinView", v); }catch(e){}
  $("viewList").classList.toggle("on", v==="list"); $("viewList").setAttribute("aria-selected", v==="list");
  $("viewTl").classList.toggle("on", v==="timeline"); $("viewTl").setAttribute("aria-selected", v==="timeline");
  document.querySelector("#pageCellar .tablewrap").hidden = v==="timeline";
  if(WINES.length) renderTable(); else $("dwPanel").hidden = v!=="timeline";
}
$("viewList").addEventListener("click", ()=>setCellarView("list"));
$("viewTl").addEventListener("click", ()=>setCellarView("timeline"));
setCellarView(CELLAR_VIEW);

/* The overview column: always open beside the list on wide screens; on narrower ones a fold above it that
   remembers whether you left it open. Its charts are drawn for the width they get, so they redraw when it opens. */
const WIDE = matchMedia("(min-width:1181px)");
const OVERVIEWS = [["overview", () => renderOverview()], ["eOverview", () => renderEnjoyed()]];
function syncOverview(){
  let keep = false; try{ keep = localStorage.getItem("vinOverview")==="1"; }catch(e){}
  OVERVIEWS.forEach(([id]) => { $(id).open = WIDE.matches || keep; });
}
OVERVIEWS.forEach(([id, redraw]) => $(id).addEventListener("toggle", ()=>{
  if(!WIDE.matches){ try{ localStorage.setItem("vinOverview", $(id).open ? "1" : "0"); }catch(e){} }
  if($(id).open && WINES.length) redraw();
}));
(WIDE.addEventListener ? WIDE.addEventListener("change", syncOverview) : WIDE.addListener(syncOverview));
syncOverview();

/* The overview's panels: which show, and in what order. A calm default of a few; "Customise" moves, removes and adds
   them. Saved per account on this device and, for an encrypted account, in its vault (encrypted), so the layout follows
   to the phone. Only what shows changes: the wines don't. */
const PANEL_DEFAULT = { overview: ["insights","press","regions","map","vintages","worth"], eOverview: ["estyles","eproducers","etime"] };
let LAYOUT = {}, layoutT = null;
const layoutKey = () => "vinLayout:" + String(cfg.user||"").toLowerCase();
const panelEls = id => [...$(id).querySelectorAll(".side-body > [data-panel]")];
function layoutOf(id){
  const keys = panelEls(id).map(e=>e.dataset.panel), L = LAYOUT[id];
  return Array.isArray(L) ? L.filter((k,i)=>keys.includes(k) && L.indexOf(k)===i) : PANEL_DEFAULT[id].slice();
}
function loadLayout(){
  if(layoutT) return; // a change of ours is still on its way to the vault: keep it
  // the vault's copy or this device's, whichever was changed last (a reload can beat the save to the vault)
  let v = null, d = null;
  try{ const x = window.VAULT && VAULT.active() && VAULT.prefs(); if(x && x.layout && typeof x.layout==="object") v = x.layout; }catch(e){}
  try{ const x = JSON.parse(localStorage.getItem(layoutKey()) || "null"); if(x && typeof x==="object") d = x; }catch(e){}
  const L = v && d ? ((d.at||0) > (v.at||0) ? d : v) : (v || d);
  LAYOUT = L || {};
  if(L && L===d && v!==d && window.VAULT && VAULT.active()) VAULT.setPrefs({layout: LAYOUT}).catch(()=>{});
  Object.keys(PANEL_DEFAULT).forEach(applyLayout);
}
function applyLayout(id){
  const body = $(id).querySelector(".side-body"), on = layoutOf(id), els = panelEls(id);
  const at = Object.fromEntries(els.map(e=>[e.dataset.panel, e]));
  on.forEach(k=>body.appendChild(at[k]));
  els.filter(e=>!on.includes(e.dataset.panel)).forEach(e=>body.appendChild(e));
  els.forEach(e=>e.classList.toggle("off", !on.includes(e.dataset.panel)));
  renderCustom(id);
}
function setLayout(id, list){
  if(list) LAYOUT[id] = list; else delete LAYOUT[id];
  LAYOUT.at = Date.now();
  applyLayout(id);
  if(WINES.length) (id==="overview" ? renderOverview : renderEnjoyed)(); // a panel coming back is drawn for its width
  try{ localStorage.setItem(layoutKey(), JSON.stringify(LAYOUT)); }catch(e){}
  clearTimeout(layoutT); layoutT = setTimeout(saveLayout, 1200);
}
function saveLayout(){
  clearTimeout(layoutT); layoutT = null;
  if(window.VAULT && VAULT.active()) VAULT.setPrefs({layout: LAYOUT}).catch(()=>{});
}
// leaving the page before the save: send it now
document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState==="hidden" && layoutT) saveLayout(); });
function renderCustom(id){
  const ed = $(id).querySelector(".custed"); if(ed.hidden) return;
  const on = layoutOf(id), rest = panelEls(id).map(e=>e.dataset.panel).filter(k=>!on.includes(k));
  const el = k => $(id).querySelector(`.side-body > [data-panel="${k}"]`);
  const name = k => { const h = el(k).querySelector("h2"); return h ? h.textContent.trim() : k; };
  const label = k => `<span>${esc(name(k))}${el(k).hidden ? ` <span class="ph">· ${esc(tr("nothing to show yet"))}</span>` : ""}</span>`;
  const b = (act, k, sym, aria, off) => `<button type="button" class="ibtn" data-act="${act}" data-k="${k}" aria-label="${esc(aria)}" title="${esc(aria)}"${off?" disabled":""}>${sym}</button>`;
  ed.innerHTML = `<h3>${esc(tr("Shown, in this order"))}</h3><ul class="custlist">` + (on.length ? on.map((k,i)=>`<li>${label(k)}${
      b("up", k, "↑", tr("Move {0} up", name(k)), i===0)}${b("down", k, "↓", tr("Move {0} down", name(k)), i===on.length-1)}${b("off", k, "✕", tr("Remove {0}", name(k)))}</li>`).join("")
      : `<li><span class="ph">${esc(tr("Nothing shown — add a chart below"))}</span></li>`) + `</ul>` +
    (rest.length ? `<h3>${esc(tr("＋ Add a chart"))}</h3><ul class="custlist">` + rest.map(k=>`<li>${label(k)}${b("on", k, "＋", tr("Add {0}", name(k)))}</li>`).join("") + `</ul>` : "") +
    `<div class="custact"><button type="button" class="btn quiet" data-act="reset">${esc(tr("Reset to default"))}</button><button type="button" class="btn primary" data-act="done">${esc(tr("Done"))}</button></div>`;
}
Object.keys(PANEL_DEFAULT).forEach(id=>{
  const btn = $(id).querySelector(".custbtn"), ed = $(id).querySelector(".custed");
  const open = show => { ed.hidden = !show; btn.setAttribute("aria-expanded", String(show)); btn.hidden = show; renderCustom(id); };
  btn.addEventListener("click", ()=>{ open(true); const f = ed.querySelector("button:not(:disabled)"); if(f) f.focus(); });
  ed.addEventListener("click", e=>{
    const t = e.target.closest("button[data-act]"); if(!t) return;
    const act = t.dataset.act, k = t.dataset.k, on = layoutOf(id), i = on.indexOf(k);
    if(act==="done"){ open(false); btn.focus(); return; }
    if(act==="reset") setLayout(id, null);
    else if(act==="off") setLayout(id, on.filter(x=>x!==k));
    else if(act==="on") setLayout(id, on.concat(k));
    else if(act==="up" && i>0){ on.splice(i-1, 0, on.splice(i,1)[0]); setLayout(id, on); }
    else if(act==="down" && i>=0 && i<on.length-1){ on.splice(i+1, 0, on.splice(i,1)[0]); setLayout(id, on); }
    // keep the keyboard where it was: the same button on the same panel, or the next one that's there
    const same = ed.querySelector(`button[data-act="${act}"][data-k="${k}"]:not(:disabled)`) || ed.querySelector(`button[data-k="${k}"]:not(:disabled)`) || ed.querySelector("button:not(:disabled)");
    if(same) same.focus();
  });
});

/* ---------- when-to-drink timeline (respects the current table filters) ---------- */
function drawDrinkTimeline(list){
  const el=$("dwtl"), panel=$("dwPanel"); if(!el) return;
  const wins = list.filter(w=>w.left>0 && readiness(w)).map(w=>({w, win:drinkWindow(w), rd:readiness(w)}));
  if(panel) panel.hidden = CELLAR_VIEW!=="timeline";
  if(!wins.length){ el.innerHTML = `<p class="ph">${esc(tr("Set drink windows on your wines to see them on the timeline."))}</p>`; $("dwCount").textContent=""; return; }
  const now=new Date().getFullYear();
  let lo=now, hi=now;
  wins.forEach(({win})=>{ if(win.from!=null){lo=Math.min(lo,win.from);hi=Math.max(hi,win.from);}
    if(win.to!=null){lo=Math.min(lo,win.to);hi=Math.max(hi,win.to);} });
  lo=Math.min(lo,now)-1; hi=Math.max(hi,now)+1;
  const span=Math.max(1,hi-lo), pct=y=>((y-lo)/span)*100, nowPct=pct(now);
  wins.sort((a,b)=>((b.win.to??hi)-(a.win.to??hi)) || ((b.win.from??lo)-(a.win.from??lo)));
  const rows = wins.map(({w,win,rd})=>{
    const l=Math.max(0,pct(win.from??lo)), r=Math.min(100,pct(win.to??hi));
    const cls = rd.k==="now" && rd.soon ? "soon" : rd.k;
    const label=`${esc(w.producer)}${typeof w.vintage==="number"?" "+w.vintage:""}`;
    return `<div class="dwrow" data-row="${w.row}">
      <div class="dw-label" title="${esc(w.producer)}${w.name?" · "+esc(w.name):""}">${label}</div>
      <div class="dw-track">
        <div class="dw-bar ${cls}${rd.est?" est":""}" style="left:${l.toFixed(1)}%;width:${Math.max(1.5,r-l).toFixed(1)}%"
          title="${win.from??"?"}–${win.to??"?"} · ${esc(rd.label)}${rd.est?" ("+esc(tr("estimated"))+")":""}"></div>
        <div class="dw-now" style="left:${nowPct.toFixed(1)}%"></div>
      </div></div>`;
  }).join("");
  // Fit the tick count to the track width so years don't crowd on narrow (mobile) screens.
  const labelCol = window.matchMedia("(max-width:640px)").matches ? 110 : 150;
  const trackW = Math.max(120, (el.clientWidth||el.parentElement.clientWidth||480) - labelCol - 10);
  const maxTicks = Math.max(3, Math.min(10, Math.floor(trackW/48)));
  const short = window.matchMedia("(max-width:640px)").matches; // ’24 instead of 2024 on mobile
  const fmtYr = y => short ? "’"+String(y).slice(-2) : String(y);
  const step=Math.max(1,Math.ceil(span/maxTicks)); const ticks=[];
  for(let y=Math.ceil(lo/step)*step; y<=hi; y+=step){ const p=pct(y);
    if(p<2 || p>97 || Math.abs(p-nowPct)<7) continue; // avoid clipping / the today line
    ticks.push(`<span class="dw-tick" style="left:${p.toFixed(1)}%">${fmtYr(y)}</span>`); }
  el.innerHTML = `<div class="dwrow dw-axis"><div class="dw-label"></div>
    <div class="dw-track dw-axis-track">${ticks.join("")}
      <span class="dw-nowlabel" style="left:${nowPct.toFixed(1)}%">${fmtYr(now)}</span>
      <div class="dw-now" style="left:${nowPct.toFixed(1)}%"></div></div></div>${rows}`;
  $("dwCount").textContent = nWines(wins.length);
  el.querySelectorAll(".dwrow[data-row]").forEach(r=>r.addEventListener("click",()=>{
    const w=WINES.find(x=>x.row===Number(r.dataset.row));
    if(w){ state.q=w.producer; $("q").value=w.producer; renderTable(); }
  }));
}

/* ---------- table ---------- */
function searchLinks(w){
  const q = [w.producer, w.name!==w.commune?w.name:"", w.commune, typeof w.vintage==="number"?w.vintage:""]
    .filter(Boolean).join(" ");
  const enc = encodeURIComponent(q);
  return `<a target="_blank" rel="noopener" href="https://www.vivino.com/search/wines?q=${enc}">${esc(tr("Ratings on Vivino ↗"))}</a>
    <a target="_blank" rel="noopener" href="https://www.wine-searcher.com/find/${enc.replace(/%20/g,"+")}">${esc(tr("Scores & prices on Wine-Searcher ↗"))}</a>`;
}

// Journal entries that plausibly belong to this cellar wine.
function journalFor(w){
  const np = s => normName(String(s||""));
  const wp = np(w.producer);
  if(!wp) return [];
  return (JENTRIES||[]).filter(e=>{
    if(np(e.producer)!==wp) return false;
    const nameMatch = e.wine && w.name && np(e.wine)===np(w.name);
    const vintMatch = String(e.vintage||"")!=="" && String(e.vintage)===String(w.vintage);
    return nameMatch || vintMatch || (!e.wine && !String(e.vintage||""));
  }).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
}

function journalHTML(w){
  const js = journalFor(w);
  if(!js.length) return "";
  const rows = js.slice(0,3).map(e=>{
    const bits = [fmtDate(e.date)];
    if(e.place) bits.push("📍 "+esc(e.place));
    if(e.rating) bits.push(e.rating+"/10 🍷");
    const head = bits.join(" · ");
    return `<div class="wj"><span class="wj-h">${head}</span>${e.note?`<span class="wj-n">${esc(e.note)}</span>`:""}</div>`;
  }).join("");
  const more = js.length>3 ? `<button class="wj-more" data-page="journal">${esc(tr("+ {0} more in the Journal ↗", js.length-3))}</button>` : "";
  return `<div class="wjournal"><div class="k">${esc(tr("From your journal"))}</div>${rows}${more}</div>`;
}

function detailHTML(w){
  const pn = PRODUCER_NOTES[w.producer];
  const cells = [
    ["Commune", w.commune],["Classification", w.classification || (suggestClass(w) ? "≈ "+suggestClass(w).cls+" ("+tr("suggested")+")" : "")],["Grape", w.grape],
    ["Format", isStdBottle(w) ? "" : tr(formatOf(w).key)+" · "+formatOf(w).note],
    ["Bought", btl(w.qty)],["Enjoyed", w.drunk?btl(w.drunk):""],["Source", w.source],
    ["Price", SHOW_PRICES && w.price ? kr(w.price) : ""],["Location", w.location],
  ].filter(c=>c[1]).map(([k,v])=>`<div><div class="k">${esc(tr(k))}</div>${esc(v)}</div>`).join("");
  return `<div class="dgrid">${cells}</div>
    ${w.note?`<div class="unote">“${esc(w.note)}” — ${esc(tr("cellar note"))}</div>`:""}
    ${pn?`<div class="pnote"><b>${esc(w.producer)}</b> · ${esc(tr(TIER_LABEL[pn[0]]))} — ${esc(noteText(pn[1]))}</div>`:""}
    ${journalHTML(w)}
    <div class="links">
      ${w.left>0?`<button class="drink" data-act="drink" data-row="${w.row}">🍷 ${esc(tr("Mark 1 bottle as drunk"))}</button>`:""}
      ${w.drunk>0 && !w.elsewhere?`<button class="drink" data-act="undrink" data-row="${w.row}" title="${isElsewhere(w)?esc(tr("Puts the bottle in your cellar")):""}">↩︎ ${esc(tr("Undo drink"))}</button>`:""}
      <label class="ratewrap">${esc(tr("My score"))}
        <select class="rate" data-row="${w.row}">
          <option value="">—</option>
          ${Array.from({length:10},(_,i)=>`<option value="${i+1}"${w.rating===i+1?" selected":""}>${i+1}</option>`).join("")}
        </select></label>
      ${SHOW_PRICES?`<label class="valwrap">${esc(tr("Value kr"))}
        <input class="setval" type="number" min="0" step="1" inputmode="numeric"
          data-row="${w.row}" value="${w.value!=null?w.value:""}" placeholder="—"></label>`:""}
      <label class="sizewrap">${esc(tr("Format"))}
        <select class="setsize" data-row="${w.row}">
          ${FORMATS.map(f=>`<option value="${f.key==="Bottle"?"":esc(f.key)}"${formatOf(w).key===f.key?" selected":""}>${esc(tr(f.key))} · ${esc(f.note)}</option>`).join("")}
        </select></label>
      ${isElsewhere(w)?"":`<label class="locwrap">📍 ${esc(tr("Location"))}
        <input class="setloc" list="locList" data-row="${w.row}" value="${esc(w.location)}" placeholder="${esc(tr("e.g. Cellar, shelf 2"))}"></label>`}
      <label class="datewrap">${esc(tr("Acquired"))}
        <input class="setdate" type="date" data-field="acquired" data-row="${w.row}" value="${esc(w.acquired||"")}"></label>
      ${w.drunk>0?`<label class="datewrap">${esc(tr("Last drunk"))}
        <input class="setdate" type="date" data-field="drunkDate" data-row="${w.row}" value="${esc(w.drunkDate||"")}"></label>`:""}
      ${(()=>{const est=defaultWindow(w), r=readiness(w);
        const ph=(x,d)=>x!=null?"≈"+x:d;
        return `<span class="winwrap">${esc(tr("Drink window"))}
        <input class="setwin" type="number" inputmode="numeric" placeholder="${ph(est&&est.from,esc(tr("from")))}" data-end="from" data-row="${w.row}" value="${w.drinkFrom??""}">
        <span class="wsep">–</span>
        <input class="setwin" type="number" inputmode="numeric" placeholder="${ph(est&&est.to,esc(tr("to")))}" data-end="to" data-row="${w.row}" value="${w.drinkTo??""}"><a class="qhint" href="help.html#windows" target="_blank" rel="noopener" title="${esc(tr("How this works"))}" aria-label="${esc(tr("How this works"))}">?</a>
        ${r?`<span class="rbadge ${r.k}${r.est?" est":""}">${r.label}</span>`:""}
        ${r&&r.est&&est&&est.from!=null&&est.to!=null?`<button type="button" class="usewin" data-row="${w.row}" data-from="${est.from}" data-to="${est.to}">✓ ${esc(tr("Use {0}–{1}", est.from, est.to))}</button>`:""}
        ${r&&r.est?`<span class="est-note">${esc(tr("estimated · type to set your own"))}</span>`:""}</span>`;})()}
      <button class="jlog" data-row="${w.row}">📓 ${esc(tr("Log in journal"))}</button>
      <button class="fshare" data-row="${w.row}">📣 ${esc(tr("Share"))}</button>
      ${atlasLink(w)}
      ${searchLinks(w)}
      <button class="winfo" data-row="${w.row}">✏️ ${esc(tr("Edit details"))}</button>
      <button class="drink del" data-act="delete" data-row="${w.row}">${isElsewhere(w) ? "🗑 "+esc(tr("Remove from Enjoyed")) : "🗑 "+esc(tr("Delete wine"))}</button>
    </div>`;
}

// a Burgundy the atlas knows: straight to its vineyard (or village) on the map
// the region atlas's packs (atlas.js REGIONS): a wine naming the region goes there, and the atlas finds its vineyard
const ATLAS_REGIONS = [{id:"chablis", re:/\bchablis\b/i}, {id:"chalonnaise", re:/\b(mercurey|givry|rully|montagny|bouzeron)\b|chalonnaise/i},
  {id:"maconnais", re:/pouilly[- ](fuiss|vinzelles|loch)|saint[- ]v[ée]ran|\bst[- ]v[ée]ran|vir[ée][- ]cless|m[aâ]con/i},
  {id:"champagne", re:/champagne/i}, {id:"alsace", re:/\balsace\b|\belsass\b/i},
  {id:"bordeaux", re:/bordeaux|pauillac|margaux|m[ée]doc|saint[- ]julien|\bst[- ]julien|saint[- ]est[eè]phe|\bst[- ]est[eè]phe|pessac|\bgraves\b|sauternes|barsac|saint[- ][ée]milion|\bst[- ][ée]milion|pomerol|fronsac|listrac|moulis/i},
  {id:"mosel", re:/\bmosel\b|\bsaar\b|\bruwer\b/i}, {id:"nahe", re:/\bnahe\b/i}, {id:"pfalz", re:/\bpfalz\b|palatinate/i},
  {id:"rheinhessen", re:/rheinhessen/i}, {id:"mittelrhein", re:/mittelrhein/i}, {id:"ahr", re:/\bahr\b/i},
  {id:"rhone", re:/c[oô]te[- ]r[oô]tie|condrieu|ch[aâ]teau[- ]grillet|\b(crozes[- ])?(h|)ermitage\b|saint[- ]joseph|\bst[- ]joseph|\bcornas\b|saint[- ]p[ée]ray/i},
  // after the Mâconnais: Saint-Véran is grown in Saint-Amour-Bellevue too
  {id:"beaujolais", re:/beaujolais|brouilly|\bch[ée]nas\b|chiroubles|fleurie|juli[ée]nas|\bmorgon\b|moulin[- ][aà][- ]vent|r[ée]gni[ée]|saint[- ]amour|\bst[- ]amour/i},
  {id:"rhonesud", re:/ch[aâ]teauneuf[- ]du[- ]pape|gigondas|vacqueyras|beaumes[- ]de[- ]venise|\brasteau\b|cairanne|vinsobres|\blirac\b|\btavel\b/i},
  {id:"centreloire", re:/sancerre|pouilly[- ]fum[ée]|blanc[- ]fum[ée][- ]de[- ]pouilly|menetou[- ]salon|\bquincy\b|\breuilly\b|coteaux[- ]du[- ]giennois/i},
  {id:"touraine", re:/vouvray|montlouis|\bchinon\b|bourgueil|saumur[- ]champigny/i},
  {id:"anjou", re:/savenni[eè]res|coul[ée]e[- ]de[- ]serrant|roche[- ]aux[- ]moines|quarts[- ]de[- ]chaume|bonnezeaux|coteaux[- ]du[- ]layon/i}];
// Barolo and Barbaresco: no map (the MGA outlines aren't open data), but each MGA has its own page (piemonte-mga.js,
// tools/pages-build.js). A bottle's MGA: the denomination on it, then the longest MGA name (or one of its other names)
// standing as words in its name; a village mention ("del comune di La Morra") only when the label says so
const pageSlug = s => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/œ/g, "oe").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
function mgaOf(w){
  const P = window.PIEMONTE_MGA; if(!P) return null;
  const k = s => " " + pageSlug(s).replace(/-/g, " ") + " ", all = k([w.name, w.commune, w.region, w.classification].join(" ")), name = k(w.name);
  const id = /\sbarbaresco\s/.test(all) ? "barbaresco" : /\sbarolo\s/.test(all) ? "barolo" : null; if(!id) return null;
  const D = P.docg[id]; let best = null;
  for(const m of D.mga) for(const n of [m.n, ...(m.aka || [])]){ const x = k(n); if(name.includes(x) && x.trim() !== id && (!best || x.length > best.k)) best = {m, k: x.length, label: `${D.name} ${m.n}`}; }
  for(const m of D.villages){ const x = k("comune di " + m.n); if(name.includes(x) && (!best || x.length > best.k)) best = {m, k: x.length, label: `${D.name} ${m.official}`}; }
  return best && {docg: D.name, label: best.label, slug: pageSlug(best.label)};
}
function atlasLink(w){
  const mg = mgaOf(w);
  if(mg) return `<a class="atlaslink" href="v/${window.I18N ? I18N.lang : "en"}/${mg.slug}.html">📖 ${esc(tr("{0}: the MGA", mg.label))}</a>`;
  const rg = ATLAS_REGIONS.find(r => r.re.test([w.region, w.commune, w.name].join(" ")));
  if(rg) return `<a class="atlaslink" href="atlas.html#r=${rg.id}&w=${encodeURIComponent([w.name, w.commune].filter(Boolean).join(" "))}">🗺 ${esc(tr("On the map"))}</a>`;
  const at = window.BURG_MATCH && BURG_MATCH.where ? BURG_MATCH.where(w) : null;
  return at ? `<a class="atlaslink" href="burgundy.html#${at.c ? "c="+encodeURIComponent(at.c) : "v="+encodeURIComponent(at.v)}">🗺 ${esc(tr("On the map"))}</a>` : "";
}
// the atlas's "Add a bottle from here": open the add form filled in (once, and only if it's fresh)
function takePrefill(){
  let pre = null;
  try{ pre = JSON.parse(localStorage.getItem("vinAddPrefill") || "null"); localStorage.removeItem("vinAddPrefill"); }catch(e){}
  if(location.hash === "#add") history.replaceState(null, "", location.pathname + location.search);
  if(!pre || !(Date.now() - (pre.at||0) < 600000)) return;
  $("addBtn").click();
  const set = (id, v) => { if(v){ const el = $(id); el.value = v; el.dispatchEvent(new Event("input", {bubbles:true})); el.dispatchEvent(new Event("change", {bubbles:true})); } };
  set("aCountry", pre.country); set("aRegion", pre.region); set("aCommune", pre.commune); set("aName", pre.name); set("aProducer", pre.producer);
  if(pre.type) $("aType").value = pre.type;
  if(pre.classification){ $("aClass").value = matchOpt($("aClass"), pre.classification); $("aClass").dataset.auto = ""; }
  (pre.producer ? $("aVintage") : $("aProducer")).focus();
}

let SHOWN = []; // the wines the list shows now (the share dialog offers them)
function renderTable(){
  const q = state.q.trim().toLowerCase();
  let list = WINES.filter(w=>{
    if(state.status==="cellar" && w.left===0) return false;
    if(state.status==="drunk" && w.drunk===0) return false;
    if(state.country && w.country!==state.country) return false;
    if(state.region && w.region!==state.region) return false;
    if(state.closes && !closesIn(w, state.closes)) return false;
    if(state.style && w.style!==state.style) return false;
    if(state.loc && (state.loc==="-" ? w.location : locPlace(w.location)!==state.loc)) return false;
    if(state.ready){
      const rd = readiness(w);
      if(state.ready==="soon"){ if(!(rd && rd.soon)) return false; }
      else if(!(rd && rd.k===state.ready)) return false;
    }
    if(q){
      const hay = [w.producer,w.name,w.commune,w.region,w.grape,w.classification,String(w.vintage),w.note,w.location].join(" ").toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });
  SHOWN = list;
  const k=state.sortK, dir=state.sortDir;
  list.sort((a,b)=>{
    let va=a[k], vb=b[k];
    if(k==="vintage"){ va = typeof va==="number"?va:9999; vb = typeof vb==="number"?vb:9999; }
    if(typeof va==="string") return va.localeCompare(vb)*dir;
    return ((va??0)-(vb??0))*dir;
  });
  document.querySelectorAll("th[data-k] .arr").forEach(s=>s.textContent="");
  const th=document.querySelector(`th[data-k="${k}"] .arr`); if(th) th.textContent = dir>0?"▲":"▼";

  const bl = list.reduce((s,w)=>s+(state.status==="drunk"?w.drunk:w.left),0);
  let countTxt = `${nWines(list.length)} · ${btl(fmt(bl))}`;
  if(SHOW_PRICES){
    const vl = list.reduce((s,w)=>s+(w.price||0)*(state.status==="drunk"?w.drunk:w.left),0);
    countTxt += ` · ${kr(vl)}`;
  }
  if(state.closes){ const b = closeBuckets(new Date().getFullYear()).find(x=>x.k===state.closes);
    countTxt += " · " + tr("window closes {0}", b ? (/^\d/.test(b.label) ? b.label : b.label.toLowerCase()) : state.closes); }
  $("count").textContent = countTxt;
  $("clear").classList.toggle("show", !!(q||state.country||state.region||state.style||state.ready||state.loc||state.closes||state.status!=="cellar"));
  document.querySelectorAll("#press .kbar[data-closes]").forEach(el=>el.classList.toggle("active", el.dataset.closes===state.closes));
  drawDrinkTimeline(list);

  document.querySelectorAll(".rbar").forEach(el=>el.classList.toggle("active", el.dataset.region===state.region && !!state.region));
  document.querySelectorAll("#slegend button").forEach(el=>el.classList.toggle("active", el.dataset.style===state.style && !!state.style));
  document.querySelectorAll("#stylePie .pslice").forEach(el=>el.classList.toggle("on", el.dataset.style===state.style && !!state.style));
  document.querySelectorAll("#producers .rbar").forEach(el=>el.classList.toggle("active", el.dataset.prod===state.q.trim() && !!state.q.trim()));
  syncMapActive();

  const shown = pageOf(list, "cellar");
  $("rows").innerHTML = shown.map((w,i)=>{
    const pn = PRODUCER_NOTES[w.producer];
    const badge = pn?`<span class="badge ${pn[0]}">${tr(TIER_LABEL[pn[0]])}</span>`:"";
    const rd = w.left>0 ? readiness(w) : null;
    const rwin = rd ? drinkWindow(w) : null;
    const rbadge = rd?`<span class="rbadge ${rd.k}${rd.est?" est":""}" title="${esc(rd.est ? tr("Estimated drink window {0} — set your own in the wine", `${rwin.from??"?"}–${rwin.to??"?"}`) : tr("Your drink window {0}", `${rwin.from??"?"}–${rwin.to??"?"}`))}">${esc(rd.label)}</span>`:"";
    const nm = [w.name, w.commune && w.commune!==w.name ? w.commune : ""].filter(Boolean).join(" · ");
    // the colour as a dot before the wine (the style has its filter and its chart)
    const dot = `<span class="sdot" title="${esc(tr(STYLE_EN[w.style])||w.style||"")}" style="background:var(${STYLE_VAR[w.style]||"--muted"})"></span>`;
    const wine = `${fmtChip(w)}${esc(w.name)}${classChip(w)}${w.rating?` · <span class="myscore">${w.rating}/10</span>`:""}`;
    const loc = w.location ? `<span class="wloc">📍 ${esc(w.location)}</span>` : "";
    const where = w.region ? esc(w.region) + (w.country ? `<span class="ctry"> · ${esc(w.country)}</span>` : "") : esc(w.country);
    return `<tr class="main${w.left===0?" gone":""}" data-i="${i}" data-row="${w.row}" tabindex="0" aria-level="1" aria-expanded="false">
      <td class="c-prod"><span class="prod">${esc(w.producer)}</span>${badge}${rbadge}<br class="ponly"><span class="wname ponly">${dot}${fmtChip(w)}${esc(nm)}${classChip(w)}${w.rating?` · <span class="myscore">${w.rating}/10</span>`:""}</span>${loc?`<br class="ponly"><span class="ponly">${loc}</span>`:""}</td>
      <td class="c-wine"><span class="wname">${dot}${wine}</span>${loc}</td>
      <td class="c-comm">${esc(w.commune && w.commune!==w.name ? w.commune : "")}</td>
      <td class="num c-vint">${esc(w.vintage||"—")}</td>
      <td class="c-reg">${where}</td>
      <td class="num c-qty">${state.status==="drunk"?w.drunk:w.left}</td>
      <td class="num c-price">${SHOW_PRICES ? (w.price?kr(w.price):"—") : "···"}</td>
    </tr>
    <tr class="detail" aria-level="2" hidden><td colspan="7"></td></tr>`;
  }).join("") + moreRow(list.length, shown.length, 7, "cellar");
  if(!list.length){
    const anyWines = WINES.some(w=>w.left>0);
    const msg = !anyWines ? esc(tr("Your cellar is empty — press ＋ Add wine to start building it."))
              : esc(tr("No wines match these filters."));
    $("rows").innerHTML = `<tr><td colspan="7" class="emptyrow">${msg}</td></tr>`;
  }

  bindWineRows("#rows");
}

// Wire up expand + per-row controls for a wine table (cellar or enjoyed).
function bindWineRows(scope){
  document.querySelectorAll(`${scope} tr.main`).forEach(row=>{
    const open = ()=>{ const d=row.nextElementSibling; const show=d.hidden; if(show) fillDetail(d, row); d.hidden=!show;
      row.setAttribute("aria-expanded",String(show)); KEEP_OPEN = show ? Number(row.dataset.row) : null; };
    row.addEventListener("click",e=>{ if(e.target.closest("a,button,select,input,label")) return; open(); });
    row.addEventListener("keydown",e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); open(); } });
  });
  // keep the actively-edited row expanded through re-renders
  if(KEEP_OPEN!=null){
    const row=document.querySelector(`${scope} tr.main[data-row="${KEEP_OPEN}"]`);
    if(row && row.nextElementSibling){ fillDetail(row.nextElementSibling, row); row.nextElementSibling.hidden=false; row.setAttribute("aria-expanded","true"); }
  }
  const more = (tbl, all) => { PAGE_SIZE[tbl].n = all ? Infinity : PAGE_SIZE[tbl].n + PAGE_STEP; tbl==="cellar" ? renderTable() : renderEnjoyed(); };
  document.querySelectorAll(`${scope} tr.morerow button`).forEach(b=>b.addEventListener("click",()=>more(b.dataset.tbl, b.dataset.all)));
  // the next rows come by themselves as the end of the list scrolls near (the buttons stay, for keyboards and old browsers)
  const mr = document.querySelector(`${scope} tr.morerow`), tbl = mr && mr.querySelector("button").dataset.tbl;
  if(tbl && window.IntersectionObserver){
    if(PAGE_OBS[tbl]) PAGE_OBS[tbl].disconnect();
    // a short wait, so a tap on the row's own buttons (or a quick scroll past) isn't overtaken by a redraw
    let near = false, t = null;
    PAGE_OBS[tbl] = new IntersectionObserver(es=>{ near = es[es.length-1].isIntersecting; clearTimeout(t);
      if(near) t = setTimeout(()=>{ if(near && mr.isConnected){ PAGE_OBS[tbl].disconnect(); more(tbl); } }, 250); }, {rootMargin:"0px 0px 600px 0px"});
    PAGE_OBS[tbl].observe(mr);
  }
}
// A wine's details are built when its row is first opened: a big cellar would otherwise build thousands of them on
// every render (and every keystroke in the search).
function fillDetail(d, row){
  const td = d.firstElementChild; if(!td || td.childElementCount) return;
  const w = WINES.find(x=>x.row===Number(row.dataset.row)); if(!w) return;
  td.innerHTML = detailHTML(w); bindDetail(td);
}
// The tables show a page at a time, and scrolling to the end (or "Show more") adds the next; changing the search, a
// filter or the sort starts again from the top.
const PAGE_STEP = 100, PAGE_SIZE = {cellar:{n:PAGE_STEP, key:""}, enjoyed:{n:PAGE_STEP, key:""}}, PAGE_OBS = {};
function pageOf(list, tbl){
  const ps = PAGE_SIZE[tbl], key = JSON.stringify(tbl==="cellar" ? state : eState);
  if(key!==ps.key){ ps.key = key; ps.n = PAGE_STEP; }
  // the open wine stays in view even when it's further down
  const n = ps.n, i = KEEP_OPEN!=null ? list.findIndex(w=>w.row===KEEP_OPEN) : -1;
  return i >= n ? list.slice(0, n).concat(list[i]) : list.slice(0, n);
}
function moreRow(total, shown, cols, tbl){
  if(shown >= total) return "";
  const step = Math.min(PAGE_STEP, total - shown);
  return `<tr class="morerow"><td colspan="${cols}">${esc(tr("Showing {0} of {1} wines", fmt(shown), fmt(total)))}
    <button type="button" class="btn" data-tbl="${tbl}">${esc(tr("Show {0} more", fmt(step)))}</button>
    <button type="button" class="btn quiet" data-tbl="${tbl}" data-all="1">${esc(tr("Show all"))}</button></td></tr>`;
}
function bindDetail(root){
  root.querySelectorAll("button.drink").forEach(b=>
    b.addEventListener("click",()=>rowAction(b.dataset.act, Number(b.dataset.row), b)));
  root.querySelectorAll("select.rate").forEach(sel=>
    sel.addEventListener("change",()=>rateWine(Number(sel.dataset.row), sel.value, sel)));
  root.querySelectorAll("select.setsize").forEach(sel=>
    sel.addEventListener("change",()=>setSizeApi(Number(sel.dataset.row), sel.value, sel)));
  root.querySelectorAll("input.setval").forEach(inp=>
    inp.addEventListener("change",()=>setValueApi(Number(inp.dataset.row), inp.value, inp)));
  root.querySelectorAll("input.setdate").forEach(inp=>
    inp.addEventListener("change",()=>setDateApi(Number(inp.dataset.row), inp.dataset.field, inp.value, inp)));
  root.querySelectorAll("input.setwin").forEach(inp=>
    inp.addEventListener("change",()=>setWindowApi(inp)));
  root.querySelectorAll("input.setloc").forEach(inp=>
    inp.addEventListener("change",()=>setLocationApi(Number(inp.dataset.row), inp.value, inp)));
  root.querySelectorAll(".wj-more").forEach(b=>
    b.addEventListener("click",()=>{ location.hash="journal"; }));
  root.querySelectorAll("button.jlog").forEach(b=>
    b.addEventListener("click",()=>{
      const w = WINES.find(x=>x.row===Number(b.dataset.row));
      openJournalModal(w ? {producer:w.producer, wine:w.name, vintage:w.vintage,
        country:w.country, region:w.region, grape:w.grape, commune:w.commune, classification:w.classification} : null);
    }));
  root.querySelectorAll("button.winfo").forEach(b=>
    b.addEventListener("click",()=>{ const w = WINES.find(x=>x.row===Number(b.dataset.row)); if(w) openInfo(w); }));
  root.querySelectorAll("button.fshare").forEach(b=>
    b.addEventListener("click",async()=>{
      const w = WINES.find(x=>x.row===Number(b.dataset.row));
      await ensureFeedUsers();
      openShareModal(w ? {type: w.drunk>0?"drank":"bought", producer:w.producer, wine:w.name,
        vintage:w.vintage, region:w.region, rating:w.rating||""} : null);
    }));
}

/* ---------- actions ---------- */
let LOADED_AT = null; // when the cellar was last fetched, for "Updated …" in the interface language
function stampText(){ if(LOADED_AT) $("stamp").textContent = tr("Updated {0}", LOADED_AT.toLocaleString(I18N_LOCALE(),{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})); }
const SPIN0 = $("spin").innerHTML; // the loading shapes, put back after an error
async function loadData(quiet){
  if(!quiet){ const sp = $("spin"); if(!sp.classList.contains("skel")){ sp.innerHTML = SPIN0; sp.classList.add("skel"); I18N.apply(sp); }
    sp.hidden = false; $("content").hidden = true; }
  if(cfg.user){ $("who").textContent = cfg.user; $("who").hidden = false; $("pMe").textContent = cfg.user.trim().charAt(0).toUpperCase() || "·"; }
  try{
    const res = await api({action:"data"});
    WINES = normalize(res.wines);
    loadLayout();
    $("priceBtn").textContent = SHOW_PRICES ? tr("Hide prices") : tr("Show prices");
    renderOverview(); renderTable(); renderEnjoyed();
    LOADED_AT = new Date(); stampText();
    $("spin").hidden = true; $("content").hidden = false;
    loadJournalSilently(); loadFeedSilently(); refreshDeleted(); checkOwner(); takePrefill();
  }catch(err){
    if(AUTH_ERRORS.has(err.message)){ forgetAuth(); setGateMode("login"); showGate(tr("Your session expired — log in again.")); }
    else { $("spin").classList.remove("skel"); $("spin").textContent = tr("Could not reach the cellar API ({0}). Check your connection and refresh.", errText(err)); }
  }
}

// Fetch the journal once in the background so wine details can show its entries.
async function loadJournalSilently(){
  if(JENTRIES){ renderTable(); renderEnjoyed(); return; }
  try{
    const res = await api({action:"journal"});
    JENTRIES = res.entries || [];
    renderTable(); renderEnjoyed();
  }catch(err){ /* journal is optional here */ }
}

async function rateWine(row, val, sel){
  sel.disabled = true;
  try{
    const res = await api({action:"rate", row, rating: val===""?"":Number(val)});
    WINES = normalize(res.wines);
    renderOverview(); renderTable(); renderEnjoyed();
    toast(val==="" ? tr("Score cleared") : tr("Scored {0}/10 🍷", val));
  }catch(err){ toast(tr("Could not save score: {0}", errText(err))); }
  sel.disabled = false;
}

async function setValueApi(row, val, inp){
  inp.disabled = true;
  const clean = val===""? "" : Math.max(0, Number(val)||0);
  try{
    const res = await api({action:"setvalue", row, value: clean});
    WINES = normalize(res.wines);
    renderOverview(); renderTable(); renderEnjoyed();
    toast(clean==="" ? tr("Value cleared") : tr("Value set to {0}", kr(clean)));
  }catch(err){ toast(tr("Could not save value: {0}", errText(err))); }
  inp.disabled = false;
}

async function setSizeApi(row, val, sel){
  sel.disabled = true;
  try{
    const res = await api({action:"setsize", row, value: val});
    WINES = normalize(res.wines);
    renderOverview(); renderTable(); renderEnjoyed();
    toast(val ? tr("Format set to {0}", tr(val)) : tr("Back to a standard bottle"));
  }catch(err){ toast(tr("Could not save format: {0}", errText(err))); }
  sel.disabled = false;
}

// one tap: the estimate becomes the wine's own window
document.addEventListener("click", e=>{
  const b = e.target.closest("button.usewin"); if(!b) return;
  const wrap = b.closest(".winwrap");
  wrap.querySelector('.setwin[data-end="from"]').value = b.dataset.from; wrap.querySelector('.setwin[data-end="to"]').value = b.dataset.to;
  b.disabled = true; setWindowApi(wrap.querySelector(".setwin"));
});
async function setWindowApi(inp){
  const row = Number(inp.dataset.row);
  const wrap = inp.closest(".winwrap");
  const ins = wrap.querySelectorAll(".setwin");
  const from = wrap.querySelector('.setwin[data-end="from"]').value;
  const to = wrap.querySelector('.setwin[data-end="to"]').value;
  ins.forEach(x=>x.disabled=true);
  try{
    const res = await api({action:"setwindow", row, from, to});
    WINES = normalize(res.wines);
    renderOverview(); renderTable(); renderEnjoyed();
    toast((from||to) ? tr("Drink window saved") : tr("Drink window cleared"));
  }catch(err){ toast(tr("Could not save window: {0}", errText(err))); }
  ins.forEach(x=>x.disabled=false);
}

async function setLocationApi(row, val, inp){
  inp.disabled = true;
  try{
    const res = await api({action:"setinfo", row, fields:{location:String(val||"").trim()}});
    KEEP_OPEN = row; WINES = normalize(res.wines);
    renderOverview(); renderTable(); renderEnjoyed();
    toast(String(val||"").trim() ? tr("Location saved") : tr("Location cleared"));
  }catch(err){ toast(tr("Could not save location: {0}", errText(err))); inp.disabled = false; }
}

async function setDateApi(row, field, val, inp){
  inp.disabled = true;
  const acq = field==="acquired";
  try{
    const res = await api({action:"setdate", row, field, value: val||""});
    WINES = normalize(res.wines);
    renderOverview(); renderTable(); renderEnjoyed();
    toast(acq ? (val ? tr("Acquired date updated") : tr("Acquired date cleared")) : (val ? tr("Last-drunk date updated") : tr("Last-drunk date cleared")));
  }catch(err){ toast(tr("Could not save date: {0}", errText(err))); }
  inp.disabled = false;
}

async function rowAction(act, row, btn){
  const w = WINES.find(x=>x.row===row);
  const name = w ? `${w.producer}${w.name?" "+w.name:""}${w.vintage?" "+w.vintage:""}` : tr("this wine");
  const wasLast = act==="drink" && w && w.left===1;
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = tr("Updating…");
  try{
    const res = await api({action:act, row, qty:1});
    WINES = normalize(res.wines);
    // Deleting a row shifts every row below it up, so the remembered row number
    // now points at a different wine — forget it rather than expand a stranger.
    if(act==="delete") KEEP_OPEN = null;
    renderOverview(); renderTable(); renderEnjoyed();
    if(act==="drink") afterDrink(row, w, wasLast);
    else if(act==="undrink") toast(tr("Bottle back in the cellar 🍾"));
    else afterDelete(w, name);
  }catch(err){ toast(tr("Could not update: {0}", errText(err))); btn.disabled=false; btn.textContent=label; }
}
// Drunk: Undo, and how was it (the wine's 1–10 rating, as five stars); the last bottle offers a tasting note
function afterDrink(row, w, wasLast){
  const nw = WINES.find(x=>x.row===row) || w;
  const nm = `${nw.producer}${nw.name?" "+nw.name:""}${nw.vintage?" "+nw.vintage:""}`;
  const stars = document.createElement("span"); stars.className = "stars"; stars.setAttribute("role", "group"); stars.setAttribute("aria-label", tr("How was it?"));
  for(let i=1; i<=5; i++){ const b = document.createElement("button"); b.type = "button"; b.textContent = "★"; b.dataset.v = i*2;
    b.title = b.ariaLabel = tr("{0} of 10", i*2); if((nw.rating||0) >= i*2) b.classList.add("on");
    b.addEventListener("click", async ()=>{ stars.querySelectorAll("button").forEach(x=>x.classList.toggle("on", Number(x.dataset.v) <= i*2));
      try{ const r = await api({action:"rate", row, rating:i*2}); WINES = normalize(r.wines); renderTable(); renderEnjoyed(); toast(tr("Rated {0} of 10", i*2)); }
      catch(err){ toast(tr("Could not save rating: {0}", errText(err))); } });
    stars.appendChild(b); }
  const acts = [{label:tr("Undo"), fn:()=>{ const b = document.querySelector(`#tbl button[data-act="undrink"][data-row="${row}"]`) || document.createElement("button"); rowAction("undrink", row, b); }}];
  if(wasLast) acts.push({label:tr("Write a tasting note"), fn:()=>openJournalModal({producer:nw.producer, wine:nw.name, vintage:nw.vintage,
    country:nw.country, region:nw.region, grape:nw.grape, commune:nw.commune, classification:nw.classification})});
  notify(wasLast ? tr("That was your last {0} 🍷", nm) : tr("Skål! Bottle marked as drunk 🍷"), acts, {extra:stars, ms:10000});
}
// Deleted at once (nothing to confirm): Undo brings it back from Recently deleted, where it stays 30 days anyway
async function afterDelete(w, name){
  const enjoyed = w && isElsewhere(w);
  await refreshDeleted();
  const d = DELETED[0]; // newest first
  notify(enjoyed ? tr("Removed {0} from Enjoyed", name) : tr("Deleted {0}", name),
    d ? [{label:tr("Undo"), fn:()=>undeleteNow(d.id)}] : [], {ms:10000});
}
async function undeleteNow(id){
  try{ const r = await api({action:"undelete", id}); WINES = normalize(r.wines); renderOverview(); renderTable(); renderEnjoyed(); refreshDeleted(); toast(tr("Put back")); }
  catch(err){ toast(tr("Could not put it back: {0}", errText(err))); }
}

async function addWine(e){
  e.preventDefault();
  const btn = $("addSave"); btn.disabled = true; btn.textContent = tr("Adding…");
  const v = id => $(id).value.trim();
  const wine = {
    producer:v("aProducer"), name:v("aName"), commune:v("aCommune"),
    country:v("aCountry"), region:v("aRegion"), classification:clsValue("aClass"),
    type:v("aType"), grape:v("aGrape"), size:$("aSize").value,
    vintage: /^\d{4}$/.test(v("aVintage")) ? Number(v("aVintage")) : v("aVintage"),
    qty: Number(v("aQty"))||1,
    price: v("aPrice")===""? "" : Number(v("aPrice")),
    acquired: v("aAcquired"), source:v("aSource"), note:v("aNote"), location:v("aLocation"),
  };
  try{
    const res = await api({action:"add", wine});
    WINES = normalize(res.wines);
    renderOverview(); renderTable(); renderEnjoyed();
    $("addModal").classList.remove("open");
    addReset();
    toast(tr("{0} added to the cellar", wine.producer));
  }catch(err){ toast(tr("Could not add: {0}", errText(err))); }
  btn.disabled = false; btn.textContent = tr("Add to cellar");
}

/* ---------- gate ---------- */
let GATE_MODE = "login"; // or "signup"
if(window.I18N) window.I18N.onChange(() => setGateMode(GATE_MODE));
// the static vineyard pages come in each language (tools/pages-build.js)
const vineyardsLink = () => { const el = $("gateVineyards"); if(el && window.I18N) el.href = `v/${window.I18N.lang}/index.html`; };
vineyardsLink(); if(window.I18N) window.I18N.onChange(vineyardsLink);
function showGate(msg){
  $("app").hidden = true; $("gate").hidden = false;
  $("who").hidden = true; $("who").textContent = "";
  $("gateApiWrap").hidden = !!cfg.api;
  $("gateErr").textContent = msg||"";
  // On phones the atlas sits above the login; focusing would pop the keyboard and scroll past it.
  if(matchMedia("(min-width: 821px)").matches) setTimeout(()=>$("gateUser").focus(), 50);
}
function setGateMode(mode){
  GATE_MODE = mode;
  const signup = mode==="signup", recover = mode==="recover";
  $("gateInviteWrap").hidden = !signup;
  $("gateRecWrap").hidden = !recover;
  $("gateForgot").hidden = mode!=="login";
  trSet(signup ? "Create your own cellar. You'll need an invite code."
    : recover ? "Enter your recovery code and choose a new password."
    : "Your private cellar. Log in to continue.", $("gateLead"));
  trSet(signup ? "Create account" : recover ? "Set new password" : "Log in", $("gateSubmit"));
  trSet(signup || recover ? "Have an account? Log in" : "Need an account? Sign up", $("gateToggle"));
  $("gatePass").setAttribute("autocomplete", signup || recover ? "new-password" : "current-password");
  // a new password is typed twice and has to pass the rule; sign-up also asks for an email
  $("gateEmailWrap").hidden = !signup; $("gateUserHint").hidden = !signup;
  $("gatePass2Wrap").hidden = !(signup || recover); $("gatePassHint").hidden = !(signup || recover);
  $("gatePass2").value = ""; $("gateMatch").textContent = "";
  trSet(recover ? "New password" : "Password", document.querySelector('label[for="gatePass"]'));
  $("gateErr").textContent = "";
  humanShow(signup || recover);
}
// "Are you human" (Cloudflare Turnstile) on sign-up and recovery, when config.js has a site key; the API gateway
// (worker/index.js) checks the token. Loaded only when one of those forms opens.
const HUMAN = { key: (window.WINE_CONFIG && window.WINE_CONFIG.TURNSTILE_SITE_KEY) || "", id: null, loading: null };
function humanShow(on){
  $("gateHuman").hidden = !(on && HUMAN.key);
  if(!on || !HUMAN.key) return;
  if(!HUMAN.loading) HUMAN.loading = loadJS("https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit");
  HUMAN.loading.then(()=>{ if(HUMAN.id===null) HUMAN.id = window.turnstile.render("#gateHuman", {sitekey:HUMAN.key, "refresh-expired":"auto"}); })
    .catch(()=>{ HUMAN.loading = null; });
}
function humanToken(){ try{ return HUMAN.id!==null ? (window.turnstile.getResponse(HUMAN.id) || "") : ""; }catch(e){ return ""; } }
function humanReset(){ try{ if(HUMAN.id!==null) window.turnstile.reset(HUMAN.id); }catch(e){} } // a token works once
// The rules for a new account, checked in the page (the server checks the username and email again; it never sees
// the password). A password: at least 10 characters, not the username, not one of the passwords everyone tries.
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,24}$/, EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const COMMON_PASS = new Set(("password password1 password12 password123 password1234 passw0rd 1234567890 0123456789 123456789a 1q2w3e4r5t "
  + "qwertyuiop qwerty1234 qwerty12345 asdfghjkl1 zxcvbnm123 iloveyou12 letmein123 welcome123 abcdefghij abc1234567 "
  + "football12 baseball12 sunshine12 princess12 dragon1234 monkey1234 master1234 trustno1234 superman12 starwars12 "
  + "adgangskode kodeord123 kodeordet1 hemmelig12 sommer2024 sommer2025 sommer2026 vinter2025 vinter2026 danmark123 "
  + "allwine123 allwinevin wine123456 winewinewine vinvinvin1 champagne1 bourgogne1 burgundy12 bordeaux12").split(" "));
function passProblem(pass, user){
  const p = String(pass || ""), low = p.toLowerCase();
  if(p.length < 10) return tr("Use a password of at least 10 characters.");
  if(user && low === String(user).trim().toLowerCase()) return tr("Don't use your username as the password.");
  if(COMMON_PASS.has(low) || /^(.)\1+$/.test(p) || "01234567890123456789".includes(p) || "abcdefghijklmnopqrstuvwxyz".includes(low))
    return tr("That password is too easy to guess — pick another.");
  return "";
}
// the eye shows both password fields as text, and says when the two match
$("gateEye").addEventListener("click", ()=>{ const show = $("gatePass").type === "password";
  ["gatePass","gatePass2"].forEach(id=>{ $(id).type = show ? "text" : "password"; });
  $("gateEye").setAttribute("aria-pressed", String(show)); const k = show ? "Hide password" : "Show password"; $("gateEye").setAttribute("aria-label", tr(k)); $("gateEye").title = tr(k); });
function gateMatch(){
  const a = $("gatePass").value, b = $("gatePass2").value, m = $("gateMatch");
  if(!b){ m.textContent = ""; m.className = "fhint"; return; }
  const same = a === b; m.textContent = same ? "✓ " + tr("The passwords match") : tr("The two passwords aren't the same.");
  m.className = "fhint " + (same ? "ok" : "bad");
}
$("gatePass").addEventListener("input", gateMatch); $("gatePass2").addEventListener("input", gateMatch);
$("gateUser").addEventListener("blur", ()=>{ if(GATE_MODE!=="signup") return; const u = $("gateUser").value.trim(), h = $("gateUserHint");
  h.classList.toggle("bad", !!u && !USERNAME_RE.test(u)); });

// Friendly text for the error codes the API returns.
const AUTH_MSG = {
  "bad-login":"Wrong username or password.", "bad-invite":"That invite code isn't right, or it has already been used.",
  "locked":"Too many wrong tries — wait 15 minutes and try again.", "signup-full":"There's no room for new accounts right now. Ask the owner.",
  "signup-busy":"Too many sign-ups just now — try again in an hour.",
  "signup-disabled":"Signups are closed right now.", "user-taken":"That username is taken — choose another.", "bad-email":"Enter your email address.",
  "bad-username":"Username: 3–24 letters, numbers, . _ or -.", "weak-pass":"Use a password of at least 6 characters.",
  "no-cellar":"Your cellar couldn't be opened. Contact the owner.",
  "human-check":"The \"are you human\" check didn't go through. Wait for it to finish and try again.",
  "gateway":"The site's server isn't set up right. Tell the owner.", "origin":"The site's server isn't set up right. Tell the owner.",
  "upstream":"The cellar's server didn't answer. Try again in a moment.",
  "too-many":"You've done that a lot in a short time — wait a while and try again.",
  "bad-recovery":"That recovery code doesn't match this account.", "update-site":"Reload the page — the site has been updated.",
  "vaulted":"This cellar is encrypted: log in with your username and password.",
  "bad-keys":"Something went wrong preparing your keys. Reload and try again.",
};
const authMsg = code => AUTH_MSG[code] ? tr(AUTH_MSG[code]) : tr("Could not sign in ({0}).", code);
function forgetAuth(){
  if(window.VCRYPTO) VCRYPTO.forget(cfg.user); // the session's unlocked key goes with the session
  try{ localStorage.removeItem("vinShares:" + String(cfg.user||"").toLowerCase()); }catch(e){} // and the shared lists' links
  if(window.VAULT) VAULT.stop();
  localStorage.removeItem("vinVault"); $("acctBtn").hidden = true;
  localStorage.removeItem("vinUser"); localStorage.removeItem("vinToken"); localStorage.removeItem("vinActive");
  cfg.user=""; cfg.token="";
  // Drop the previous user's cached data so the next login can't see it (the
  // journal/wishlist loaders short-circuit on these).
  WINES=[]; JENTRIES=null; WITEMS=null; KEEP_OPEN=null; FEED=null; FEED_USERS=[]; FEED_FOLLOWS=[]; FEED_VIEW="all"; FEED_OPEN.clear();
  const b=$("feedBadge"); if(b) b.hidden=true;
}
// the site's service worker (atlas-sw.js): the cellar app opens at once on a second visit, installs on a phone's home
// screen, and opens offline from the device's encrypted copy; the API itself is never cached
// (not on localhost, where the tests run against files that change under them; tools/offline-ui-test.js uses 127.0.0.1)
if("serviceWorker" in navigator && window.isSecureContext && location.hostname !== "localhost") navigator.serviceWorker.register("atlas-sw.js").catch(() => {});
function enterApp(){ $("gate").hidden = true; $("app").hidden = false; markActive(); loadData(); route(); recReminder(); }
// every four months or so (not on the first visit: sign-up showed the code), ask whether the recovery code is still at
// hand; "Make a new one" opens Account, where the password makes a fresh code
const REC_EVERY = 120 * 864e5;
function recReminder(){
  if(localStorage.getItem("vinVault")!=="1" || !cfg.user) return;
  const k = "vinRecChk:" + cfg.user.toLowerCase(), last = Number(localStorage.getItem(k)) || 0;
  if(!last){ localStorage.setItem(k, Date.now()); return; }
  $("recNote").hidden = Date.now() - last < REC_EVERY;
}
$("recHave").addEventListener("click", () => { localStorage.setItem("vinRecChk:" + cfg.user.toLowerCase(), Date.now()); $("recNote").hidden = true; });
$("recNew").addEventListener("click", () => { $("acctBtn").click(); $("acctErr").textContent = tr("Enter your password, then choose New recovery code."); });

$("gateToggle").addEventListener("click", ()=> setGateMode(GATE_MODE==="login" ? "signup" : "login"));
$("gateForgot").addEventListener("click", ()=> setGateMode("recover"));

/* ---------- encrypted accounts (vault-crypto.js, vault.js) ---------- */
// Shown once, after sign-up or an upgrade: the code that unlocks the cellar if the password is forgotten.
function showRecoveryCode(code){
  return new Promise(done=>{
    $("recCode").textContent = code; $("recOk").checked = false; $("recDone").disabled = true;
    $("recModal").classList.add("open");
    $("recOk").onchange = ()=>{ $("recDone").disabled = !$("recOk").checked; };
    $("recCopy").onclick = async ()=>{ try{ await navigator.clipboard.writeText(code); toast(tr("Copied")); }catch(e){ toast(tr("Select the code and copy it")); } };
    $("recSave").onclick = ()=>{
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([tr("AllWine recovery code for {0}", cfg.user)+":\n\n"+code+"\n"], {type:"text/plain"}));
      a.download = "allwine-recovery-"+cfg.user+".txt"; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
    };
    $("recDone").onclick = ()=>{ $("recModal").classList.remove("open"); done(); };
  });
}
async function openVault(user, token, dek){
  cfg.user = user; cfg.token = token;
  localStorage.setItem("vinUser", user); localStorage.setItem("vinToken", token); localStorage.setItem("vinVault", "1");
  await VCRYPTO.keep(user, dek);
  await VAULT.start({post, user, token, dek, ...VAULT_HOOKS});
  $("acctBtn").hidden = false;
}
// The vault opens from the device's encrypted copy; when the server's copy turns out newer, redraw from it
const VAULT_HOOKS = {
  onRefresh(){
    JENTRIES = null; WITEMS = null; loadData(true);
    if(location.hash==="#journal" || location.hash==="#wishlist") route();
  },
  onLost(){ forgetAuth(); setGateMode("login"); showGate(tr("Your session expired — log in again.")); },
};
const STEP_MSG = { export:"Reading your cellar…", photos:"Encrypting journal photos ({0} of {1})…", write:"Encrypting your cellar…",
  verify:"Checking the encrypted copy…", finish:"Removing the unencrypted copy…" };
async function migrateNow(user, token, dek){
  await VAULT.migrate({post, user, token, dek, onStep:(k, i, n)=>{ $("gateErr").textContent = tr(STEP_MSG[k] || k, i, n); }});
}

// Sign-up, login (with a one-time upgrade of an account from before encryption) and recovery → true when signed in
async function gateEncrypted(mode, user, pass){
  if(mode==="signup"){
    const pre = await post({action:"prelogin", user});
    if(!pre.ok || (pre.v||0) < 28) return false; // an older Apps Script: the plain sign-up below
    $("gateErr").textContent = tr("Creating your keys…");
    const k = await VAULT.newKeys(pass);
    const data = await post({action:"signup", user, email:$("gateEmail").value.trim(), code:$("gateInvite").value.trim(), turnstile:humanToken(), ...k.fields});
    if(!data.ok) throw new Error(data.error);
    cfg.user = data.user; VAULT.rememberSalt(data.user, k.fields);
    await VAULT.escrow({post, user:data.user, token:data.token, dekX:k.dekX}); // account help, when the owner has it on
    // the account exists from here: if the phone reloads the page while the code is on screen (a trip to the
    // password manager), the login says so instead of looking like nothing happened
    try{ sessionStorage.setItem("vinNewAccount", data.user); }catch(e){}
    await showRecoveryCode(k.recoveryCode);
    try{ sessionStorage.removeItem("vinNewAccount"); }catch(e){}
    await openVault(data.user, data.token, k.dek);
    return true;
  }
  if(mode==="recover"){
    const code = $("gateRec").value.trim();
    if(!code) throw new Error("bad-recovery");
    $("gateErr").textContent = tr("Unlocking with your recovery code…");
    const r = await VAULT.recover({post, user, code, newPass:pass, turnstile:humanToken()});
    await openVault(r.user, r.token, r.dek);
    if(r.state==="migrating") await migrateNow(r.user, r.token, r.dek);
    return true;
  }
  $("gateErr").textContent = tr("Unlocking your cellar…");
  const li = await VAULT.login({post, user, pass});
  if(li.oldServer) return false;
  if(li.legacy){
    // an account from before encryption: sign in with the password one last time, then encrypt everything
    const data = await post({action:"login", user, pass});
    if(!data.ok) throw new Error(data.error);
    cfg.user = data.user; cfg.token = data.token;
    $("gateErr").textContent = tr("Creating your keys…");
    const k = await VAULT.newKeys(pass);
    const up = await post({user:data.user, token:data.token, action:"upgrade", ...k.fields});
    if(!up.ok) throw new Error(up.error);
    VAULT.rememberSalt(data.user, k.fields);
    await VAULT.escrow({post, user:data.user, token:data.token, dekX:k.dekX});
    await showRecoveryCode(k.recoveryCode);
    await migrateNow(data.user, data.token, k.dek);
    await openVault(data.user, data.token, k.dek);
    return true;
  }
  if(li.state==="migrating") await migrateNow(li.user, li.token, li.dek); // an upgrade that was interrupted
  await openVault(li.user, li.token, li.dek);
  return true;
}

$("gateForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const apiIn = $("gateApi").value.trim();
  if(!cfg.api && apiIn){ cfg.api = apiIn; localStorage.setItem("vinApi", apiIn); }
  if(!cfg.api){ $("gateErr").textContent = tr("The API URL is missing."); return; }
  const user = $("gateUser").value.trim(), pass = $("gatePass").value;
  if(!user || !pass){ $("gateErr").textContent = tr("Enter your username and password."); return; }
  // everything that can be checked here is, before the "are you human" check is spent on a doomed request
  if(GATE_MODE==="signup" && !USERNAME_RE.test(user)){ $("gateErr").textContent = authMsg("bad-username"); $("gateUser").focus(); return; }
  if(GATE_MODE==="signup" && !EMAIL_RE.test($("gateEmail").value.trim())){ $("gateErr").textContent = tr("Enter your email address."); $("gateEmail").focus(); return; }
  if(GATE_MODE!=="login"){
    const bad = passProblem(pass, user); if(bad){ $("gateErr").textContent = bad; $("gatePass").focus(); return; }
    if($("gatePass2").value !== pass){ $("gateErr").textContent = tr("The two passwords aren't the same."); $("gatePass2").focus(); return; }
  }
  if(GATE_MODE!=="login" && HUMAN.key && !humanToken()){ $("gateErr").textContent = tr("Wait for the \"are you human\" check to finish."); return; }
  const signup = GATE_MODE==="signup";
  localStorage.setItem("vinStay", $("gateStay").checked ? "1" : "0");
  $("gateSubmit").disabled = true; $("gateErr").textContent = tr(signup ? "Creating…" : "Signing in…");
  try{
    if(window.VAULT && await gateEncrypted(GATE_MODE, user, pass)){
      $("gatePass").value = ""; $("gateInvite").value = ""; $("gateRec").value = "";
      enterApp(); return;
    }
    if(GATE_MODE==="recover"){ $("gateErr").textContent = tr("Recovery needs the updated Apps Script (version 28)."); return; }
    const params = signup
      ? {action:"signup", user, pass, email:$("gateEmail").value.trim(), code:$("gateInvite").value.trim(), turnstile:humanToken()}
      : {action:"login", user, pass};
    const data = await post(params);
    if(!data.ok){ $("gateErr").textContent = authMsg(data.error); return; }
    cfg.user = data.user; cfg.token = data.token;
    localStorage.setItem("vinUser", cfg.user); localStorage.setItem("vinToken", cfg.token);
    $("gatePass").value = ""; $("gateInvite").value = "";
    enterApp();
  }catch(err){
    const m = String(err.message||"").replace(/^Error: /,"");
    $("gateErr").textContent = AUTH_MSG[m] ? authMsg(m)
      : /^verify-failed/.test(m) ? tr("Encrypting your cellar stopped before it finished — nothing was lost. Log in again to continue.")
      : tr("Could not reach the cellar API ({0}).", errText(m));
  }
  finally{ $("gateSubmit").disabled = false; if(GATE_MODE!=="login") humanReset(); }
});

/* ---------- account: change password, new recovery code ---------- */
$("acctBtn").addEventListener("click", ()=>{ $("acctErr").textContent=""; $("acctPass").value=""; $("acctNew").value=""; $("acctNew2").value=""; $("acctModal").classList.add("open"); $("acctPass").focus(); });
$("acctCancel").addEventListener("click", ()=>$("acctModal").classList.remove("open"));
$("acctForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const oldPass = $("acctPass").value, newPass = $("acctNew").value;
  if(!oldPass || !newPass){ $("acctErr").textContent = tr("Enter your current password and a new one."); return; }
  const bad = passProblem(newPass, cfg.user); if(bad){ $("acctErr").textContent = bad; return; }
  if($("acctNew2").value !== newPass){ $("acctErr").textContent = tr("The two passwords aren't the same."); return; }
  $("acctErr").textContent = tr("Changing…");
  try{ await VAULT.changePassword({post, user:cfg.user, token:cfg.token, oldPass, newPass});
    $("acctModal").classList.remove("open"); toast(tr("Password changed. Other devices are signed out."));
  }catch(err){ $("acctErr").textContent = authMsg(String(err.message).replace(/^Error: /,"")); }
});
$("acctRec").addEventListener("click", async ()=>{
  const pass = $("acctPass").value;
  if(!pass){ $("acctErr").textContent = tr("Enter your current password first."); return; }
  $("acctErr").textContent = tr("Making a new code…");
  try{ const code = await VAULT.newRecovery({post, user:cfg.user, token:cfg.token, pass});
    $("acctModal").classList.remove("open"); await showRecoveryCode(code); toast(tr("New recovery code saved; the old one no longer works."));
    localStorage.setItem("vinRecChk:" + cfg.user.toLowerCase(), Date.now()); $("recNote").hidden = true;
  }catch(err){ $("acctErr").textContent = authMsg(String(err.message).replace(/^Error: /,"")); }
});

$("acctDelete").addEventListener("click", async ()=>{
  const pass = $("acctPass").value;
  if(!pass){ $("acctErr").textContent = tr("Enter your current password first."); $("acctPass").focus(); return; }
  if(!(await ask(tr("Delete your account \"{0}\" and everything in it: cellar, journal, wishlist, photos, feed posts and follows? This can't be undone.", cfg.user), {ok:tr("Delete my account"), danger:true, typed:cfg.user}))) return;
  $("acctErr").textContent = tr("Deleting…");
  try{
    await VAULT.deleteAccount({post, user:cfg.user, token:cfg.token, pass});
    if(window.VCRYPTO) VCRYPTO.forget(cfg.user);
    feedForgetAll(); $("acctModal").classList.remove("open");
    forgetAuth(); setGateMode("login"); showGate(tr("Your account has been deleted."));
  }catch(err){ const m = String(err.message).replace(/^Error: /,"");
    $("acctErr").textContent = m==="owner-account" ? tr("This is the owner's account (its cellar is the master sheet), so it can't be deleted here.")
      : m==="bad-action" ? tr("The site's server needs the latest Apps Script (version 36) for this. Tell the owner.") : authMsg(m); }
});

/* ---------- header actions ---------- */
$("refreshBtn").addEventListener("click", loadData);
$("lockBtn").addEventListener("click", ()=>{ if(window.VAULT) VAULT.forgetCache(cfg.user); feedForgetAll(); forgetAuth(); setGateMode("login"); showGate(tr("Signed out. Log in to reopen.")); });
$("priceBtn").addEventListener("click", ()=>{
  SHOW_PRICES = !SHOW_PRICES;
  localStorage.setItem("vinHidePrices", SHOW_PRICES ? "0" : "1");
  $("priceBtn").textContent = SHOW_PRICES ? tr("Hide prices") : tr("Show prices");
  renderOverview(); renderTable(); renderEnjoyed();
});
$("addBtn").addEventListener("click", ()=>{
  if(!$("aAcquired").value) $("aAcquired").value = todayStr();
  fillCommunes(); addProducers(); addSuggest();
  $("addModal").classList.add("open"); $("aProducer").focus();
});
$("addCancel").addEventListener("click", ()=>$("addModal").classList.remove("open"));

/* ---------- recently deleted: a deleted wine is kept 30 days (Code.gs, the "Slettet" tab) and can be put back ---------- */
let DELETED = [];
async function refreshDeleted(){
  try{ const r = await api({action:"deleted"}); DELETED = r.deleted || []; }
  catch(e){ DELETED = []; } // a server from before this keeps nothing: no button
  const b = $("delBtn"); b.hidden = !DELETED.length; b.textContent = "↩ " + tr("Recently deleted ({0})", DELETED.length);
  if($("delModal").classList.contains("open")) renderDeleted();
}
function renderDeleted(){
  const fmtAt = at => { const d = new Date(at); return isNaN(d) ? "" : d.toLocaleDateString(I18N.lang==="en"?"en-GB":I18N.lang, {day:"numeric", month:"short"}); };
  $("delList").innerHTML = DELETED.length ? DELETED.map(d => `<div class="jcheck"><span><b>${esc(d.producer)}</b> ${esc([d.name, d.vintage].filter(Boolean).join(" "))}
      <span class="aimeta">${esc(tr("deleted {0}", fmtAt(d.at)))}${Number(d.qty) ? " · " + esc(btl(fmt(Math.max(0, Number(d.qty) - (Number(d.drunk) || 0))))) : ""}</span></span>
      <button class="btn" type="button" data-undel="${esc(d.id)}">${esc(tr("Restore"))}</button></div>`).join("")
    : `<p class="imphint">${esc(tr("Nothing deleted in the last 30 days."))}</p>`;
}
$("delBtn").addEventListener("click", ()=>{ $("delErr").textContent = ""; renderDeleted(); $("delModal").classList.add("open"); });
$("delClose").addEventListener("click", ()=>$("delModal").classList.remove("open"));
$("delModal").addEventListener("click", async e=>{
  if(e.target===$("delModal")) return $("delModal").classList.remove("open");
  const b = e.target.closest("[data-undel]"); if(!b) return;
  b.disabled = true; $("delErr").textContent = "";
  try{ const r = await api({action:"undelete", id:b.dataset.undel});
    WINES = normalize(r.wines); DELETED = r.deleted || [];
    renderOverview(); renderTable(); renderEnjoyed(); renderDeleted(); toast(tr("Restored to your cellar"));
    $("delBtn").hidden = !DELETED.length; $("delBtn").textContent = "↩ " + tr("Recently deleted ({0})", DELETED.length);
  }catch(err){ $("delErr").textContent = tr("Could not restore: {0}", errText(err)); b.disabled = false; }
});
// Escape closes the photo lightbox or the topmost open dialog, like their Cancel / backdrop clicks.
document.addEventListener("keydown", e=>{
  if(e.key!=="Escape") return;
  const lb = document.querySelector(".jlightbox"); if(lb){ lb.remove(); return; }
  const open = [...document.querySelectorAll(".modal.open")]; if(open.length) open[open.length-1].classList.remove("open");
});
$("addModal").addEventListener("click", e=>{ if(e.target===$("addModal")) $("addModal").classList.remove("open"); });
$("addForm").addEventListener("submit", addWine);

/* ---------- import (import.js reads the file here in the browser; the wines go in through 'addmany') ---------- */
const IMP_FIELDS = {"":"— not imported —", producer:"Producer", name:"Vineyard / cuvée", commune:"Commune", region:"Region",
  country:"Country", classification:"Classification", type:"Type (red, white…)", grape:"Grape", vintage:"Vintage",
  qty:"Bottles", left:"Bottles left", drunk:"Drunk", price:"Price per bottle", value:"Value now", source:"Bought at",
  note:"Note", rating:"My rating", acquired:"Acquired date", drunkDate:"Drunk date", size:"Format",
  drinkFrom:"Drink from", drinkTo:"Drink to", window:"Drink window (2025–2035)", location:"Location (cellar, shelf…)", elsewhere:"Drunk elsewhere (not from the cellar)", line:"The whole wine on one line"};
const IMP_ERR = {"not-zip":"That file doesn't look like an Excel workbook.", "bad-zip":"That file doesn't look like an Excel workbook.",
  "not-xlsx":"That file doesn't look like an Excel workbook.",
  "old-xls":"That's an older Excel file (.xls) or another spreadsheet format. In Excel choose File → Save As → Excel Workbook (.xlsx) or CSV, and import that.",
  "too-big":"That file is too large (at most 20 MB).", "zip-method":"Couldn't read that workbook. Save it as CSV and try again."};
// "1 row" / "3 rows": the singular is its own string, so every language can say it its own way
const trn = (n, one, many, ...rest) => n === 1 ? tr(one, n, ...rest) : tr(many, n, ...rest);
const IMP = {book:null, sheet:0, t:null, fields:[], built:null, d:null, name:"", off:new Set(), merge:true};
// one tidier for the whole visit: the producers, communes and vineyards it knows, so spellings come out the same
let TIDIER = null;
function tidier(){
  if(TIDIER) return TIDIER;
  const B = window.BURG || {}, prods = new Set();
  WINES.forEach(w => w.producer && prods.add(w.producer));
  Object.values(B.producers || {}).forEach(p => prods.add(p));
  Object.keys(window.PRODUCER_NOTES || {}).forEach(p => prods.add(p));
  return TIDIER = TIDY.create({producers:[...prods], names:(B.climats || []).map(c => c.n),
    communes:(B.villages || []).flatMap(v => String(v.n).split(" · ")).filter(n => n.length > 5)});
}
const FIX_FIELD = {producer:"Producer", name:"Vineyard / cuvée", commune:"Commune", region:"Region", country:"Country", grape:"Grape", source:"Bought at", location:"Location"};
function impReset(){
  Object.assign(IMP, {book:null, sheet:0, t:null, fields:[], built:null, d:null, name:"", off:new Set(), merge:true});
  TIDIER = null; $("impMerge").checked = true;
  $("impPick").hidden = false; $("impMap").hidden = true; $("impBack").hidden = true; $("impGo").hidden = true; $("impGrid").hidden = true;
  IMP.fromGrid = false; trSet("Import wines", $("impTitle").firstElementChild); trSet("Choose another file", $("impBack"));
  $("impErr").textContent = ""; $("impFile").value = "";
  $("impLock").textContent = (window.VAULT && VAULT.active())
    ? tr("🔒 The file is read in this browser and never uploaded. The wines are encrypted here before they're saved, like the rest of your cellar.")
    : tr("The file is read in this browser and never uploaded; only the wines are saved to your cellar.");
}
async function impOpen(file){
  $("impErr").textContent = "";
  try{
    const book = await IMPORT.read(file);
    const sheets = book.sheets.filter(s => s.rows.some(r => r.some(c => String(c && c.date || c).trim() !== "")));
    if(!sheets.length) throw new Error("empty");
    book.sheets = sheets; IMP.book = book; IMP.name = file.name;
    // start on the sheet that looks most like a cellar list
    const score = s => { const t = IMPORT.table(s.rows); return (t.header >= 0 ? 1000 : 0) + t.columns.filter(c => c.field).length * 100 + Math.min(t.rows, 99) - (s.hidden ? 5000 : 0); };
    IMP.sheet = sheets.map((s,i) => [score(s), i]).sort((a,b) => b[0]-a[0])[0][1];
    $("impSheet").innerHTML = sheets.map((s,i) => `<option value="${i}">${esc(s.name)}</option>`).join("");
    $("impSheet").value = IMP.sheet; $("impSheet").hidden = sheets.length < 2;
    $("impName").textContent = file.name;
    impSheet();
    $("impPick").hidden = true; $("impMap").hidden = false; $("impBack").hidden = false; $("impGo").hidden = false;
  }catch(err){
    const m = String(err && err.message || err);
    $("impErr").textContent = m === "empty" ? tr("No wines found in that file.")
      : IMP_ERR[m] ? tr(IMP_ERR[m])
      : /require|DecompressionStream/.test(m) ? tr("This browser can't open Excel files. Save the sheet as CSV and import that.")
      : tr("Couldn't read that file ({0}).", m);
  }
}
function impSheet(){
  const rows = IMP.book.sheets[IMP.sheet].rows;
  IMP.t = IMPORT.table(rows);
  IMP.fields = IMP.t.columns.map(c => c.field);
  $("impHint").textContent = IMP.t.header >= 0
    ? tr("Headings found in row {0}. Check that each column goes to the right place:", IMP.t.header + 1)
    : tr("No headings found, so the first row is a wine too. Choose what each column holds:");
  const opts = Object.entries(IMP_FIELDS).map(([k,v]) => `<option value="${k}">${esc(tr(v))}</option>`).join("");
  $("impCols").innerHTML = `<span class="ih">${esc(tr("Column"))}</span><span class="ih is">${esc(tr("Example"))}</span><span class="ih">${esc(tr("Goes to"))}</span>`
    + IMP.t.columns.map((c,i) => `<span class="il">${esc(c.label)}</span><span class="is" title="${esc(c.sample.join(" · "))}">${esc(c.sample.join(" · ")) || "—"}</span>`
      + `<select data-col="${i}" aria-label="${esc(c.label)}">${opts}</select>`).join("");
  $("impCols").querySelectorAll("select").forEach(s => { s.value = IMP.fields[Number(s.dataset.col)]; s.classList.toggle("on", !!s.value); });
  impBuild();
}
function impBuild(){
  const rows = IMP.book.sheets[IMP.sheet].rows;
  IMP.built = IMPORT.build(rows, IMP.t.header, IMP.fields);
  // one spelling per thing (shown below, each can be undone), then rows of the same wine as one
  const tidied = tidier().wines(IMP.built.wines, {existing:WINES, off:IMP.off});
  IMP.fixes = tidied.fixes;
  const mg = IMP.merge ? TIDY.merge(tidied.wines) : {wines:tidied.wines, merged:0};
  IMP.merged = mg.merged;
  IMP.d = IMPORT.dedupe(mg.wines, WINES, TIDY.mergeKey);
  const ws = mg.wines, dupRows = new Set(IMP.d.dupes.map(x => x.wine));
  const fmt = n => Number(n).toLocaleString(I18N_LOCALE());
  const head = ["", tr("Producer"), tr("Vineyard / cuvée"), tr("Commune"), tr("Vintage"), tr("Bottles"), tr("Price"), tr("Type"), tr("Format")];
  $("impPrev").innerHTML = `<thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>`
    + ws.slice(0, 8).map(w => `<tr><td>${dupRows.has(w) ? `<span class="dup">${esc(tr("in cellar"))}</span>` : w.rows ? `<span class="dup">${esc(tr("rows {0}", w.rows.join(", ")))}</span>` : esc(tr("row {0}", w.src))}</td>`
      + `<td>${esc(w.producer)}</td><td>${esc(w.name||"")}</td><td>${esc(w.commune||"")}</td><td>${esc(w.vintage||"")}</td>`
      + `<td>${w.qty}${w.drunk ? " · "+esc(tr("{0} drunk", w.drunk)) : ""}</td><td>${w.price!=null ? esc(fmt(w.price)) : ""}</td>`
      + `<td>${esc(w.type||"")}</td><td>${esc(w.size||"")}</td></tr>`).join("")
    + (ws.length > 8 ? `<tr><td colspan="9">${esc(tr("… and {0} more", ws.length - 8))}</td></tr>` : "")
    + (ws.length ? "" : `<tr><td colspan="9">${esc(tr("Nothing to import yet — choose which column holds the producer."))}</td></tr>`)
    + "</tbody>";
  const bottles = ws.reduce((s,w) => s + w.qty, 0);
  const notes = [];
  if(IMP.built.skipped.noProducer) notes.push(trn(IMP.built.skipped.noProducer, "{0} row without a producer is left out.", "{0} rows without a producer are left out."));
  if(IMP.built.skipped.zero) notes.push(trn(IMP.built.skipped.zero, "{0} row with 0 bottles is left out.", "{0} rows with 0 bottles are left out."));
  if(IMP.built.skipped.totals) notes.push(trn(IMP.built.skipped.totals, "{0} total row is left out.", "{0} total rows are left out."));
  if(IMP.built.skipped.headers) notes.push(trn(IMP.built.skipped.headers, "{0} repeated heading row is left out.", "{0} repeated heading rows are left out."));
  if(IMP.built.truncated) notes.push(tr("Only the first {0} wines are imported at a time.", IMPORT.MAX_ROWS));
  if(!IMP.fields.includes("producer") && !IMP.fields.includes("line")) notes.push(tr("Choose which column holds the producer."));
  $("impSum").innerHTML = esc(tr("{0} wines · {1} bottles", fmt(ws.length), fmt(bottles))) + notes.map(n => `<small>${esc(n)}</small>`).join("");
  // rows of the same wine, and the spelling fixes
  const nm = IMP.merge ? IMP.merged : TIDY.merge(tidied.wines).merged;
  $("impMergeWrap").hidden = !nm;
  $("impMergeLbl").textContent = tr("Merge rows that are the same wine ({0} rows join others; bottles add up, prices are averaged per bottle)", nm);
  const fx = IMP.fixes, offList = [...IMP.off].map(k => { const i = k.indexOf("|"); return {field:k.slice(0, i), from:k.slice(i + 1), to:null, n:0, off:true}; });
  const all = fx.concat(offList);
  $("impFixWrap").hidden = !all.length;
  $("impFixes").innerHTML = all.slice(0, 80).map(f => `<label class="jcheck"><input type="checkbox" data-fix="${esc(f.field + "|" + f.from)}"${f.off ? "" : " checked"}>
    <span><span class="fixf">${esc(tr(FIX_FIELD[f.field] || f.field))}</span> “${esc(f.from)}”${f.off ? "" : ` → “<b>${esc(f.to)}</b>”`}${f.n > 1 ? ` <span class="aimeta">${esc(trn(f.n, "{0} row", "{0} rows"))}</span>` : ""}</span></label>`).join("")
    + (all.length > 80 ? `<p class="imphint">${esc(tr("… and {0} more", all.length - 80))}</p>` : "");
  const nd = IMP.d.dupes.length;
  $("impDup").hidden = !nd;
  $("impDupLbl").textContent = nd ? tr("{0} of these are already in your cellar (same producer, wine, vintage and format):", nd) : "";
  impGoLabel();
}
// how many of the file's rows a set of bumps covers (several rows can add to one cellar row)
const IMP_DUPES_IN = bs => { const rows = new Set(bs.map(b=>b.row)); return IMP.d.dupes.filter(d=>rows.has(d.row)).length; };
const impMode = () => (document.querySelector('input[name="impDup"]:checked') || {}).value || "add";
function impGoLabel(){
  const total = !IMP.d ? 0 : IMP.d.fresh.length + (impMode()==="add" ? IMP.d.dupes.length : 0);
  $("impGo").textContent = tr("Import {0} wines", fmt(total));
  $("impGo").disabled = !total;
}
async function impRun(){
  const mode = impMode();
  const wines = IMP.d.fresh.map(IMPORT.clean);
  const bumps = mode==="add" ? IMPORT.bumps(IMP.d.dupes) : [];
  const merged = mode==="add" ? IMP.d.dupes.length : 0, total = wines.length + merged;
  if(!total) return;
  // in parts: Apps Script must write each in well under its 6 minutes (a plain sheet), and takes at most 5,000 rows a
  // call (an encrypted cellar runs it here, so its parts are as big as that allows). Bottles added to rows already
  // in the cellar go first, then the new wines.
  const vault = window.VAULT && VAULT.active();
  const parts = [], WSZ = vault ? 4000 : 400, BSZ = vault ? 4000 : 1000;
  for(let i = 0; i < bumps.length; i += BSZ){ const b = bumps.slice(i, i + BSZ); parts.push({wines:[], bumps:b, n:IMP_DUPES_IN(b)}); }
  for(let i = 0; i < wines.length; i += WSZ){ const w = wines.slice(i, i + WSZ); parts.push({wines:w, bumps:[], n:w.length}); }
  const btn = $("impGo"); btn.disabled = true; $("impErr").textContent = "";
  let done = 0;
  try{
    for(const part of parts){
      btn.textContent = tr("Importing… {0} of {1}", fmt(done), fmt(total));
      const res = await api({action:"addmany", wines:part.wines, bumps:part.bumps});
      done += part.n;
      WINES = normalize(res.wines);
    }
    renderOverview(); renderTable(); renderEnjoyed();
    $("impModal").classList.remove("open");
    toast(done===1 ? tr("1 wine imported 🍷") : tr("{0} wines imported 🍷", done)); hit("import");
  }catch(err){
    const m = String(err && err.message || err);
    if(done){ renderOverview(); renderTable(); renderEnjoyed(); }
    $("impErr").textContent = m === "bad-action" ? tr("Importing needs the updated Apps Script (version 29) — redeploy Code.gs.")
      : done ? tr("{0} of {1} wines were imported before an error: {2}", done, total, m)
      : tr("Could not import: {0}", m);
    // what went in now counts as "already in the cellar": skip it on a retry so nothing is added twice
    if(done){ document.querySelector('input[name="impDup"][value="skip"]').checked = true; impBuild(); } else impGoLabel();
    btn.disabled = false;
    if(AUTH_ERRORS.has(m)) showGate(authMsg(m));
  }
}
$("impBtn").addEventListener("click", ()=>{ impReset(); $("impModal").classList.add("open"); });
/* ---------- several wines in a table: typed or pasted, then the import's own check (spellings, duplicates) ---------- */
// the same fields as adding one wine, in the same order: [field, width, heading, suggestions, placeholder]
const GRID_COLS = [["producer","p","Producer *","jProducers"], ["name","p","Vineyard / cuvée","jWines"], ["commune","m","Commune","communesList"],
  ["country","m","Country","countries"], ["region","m","Region","regionsList"], ["classification","m","Classification"],
  ["type","m","Type","gridTypes"], ["grape","m","Grape","grapes"], ["vintage","n","Vintage",null,"2022"], ["qty","n","Bottles",null,"1"],
  ["size","m","Format","gridSizes"], ["price","n","Price per bottle (kr.)"], ["source","m","Source / bought at"],
  ["acquired","m","Acquired",null,"2026-10-27"], ["location","m","Location","locList"], ["note","p","Note"]];
const GRID_TYPES = [["Rød","Red"],["Hvid","White"],["Rose","Rosé"],["Bobler","Sparkling"]];
const GRID_SIZES = [["","Bottle · 75 cl"],["Piccolo"],["Half","Half"],["Magnum"],["Jeroboam"],["Rehoboam"],["Methuselah"],["Salmanazar"],["Balthazar"],["Nebuchadnezzar"]];
// what's typed back to what's stored: "Rot"/"Red" → Rød, "Bottle · 75 cl" → "" (the import reads the rest itself)
const gridWord = (list, v) => { const t = v.toLowerCase(), hit = list.find(([code, label]) => [code, label, label && tr(label)].some(x => x && x.toLowerCase() === t)); return hit ? hit[0] : v; };
function gridHead(){
  $("wGrid").tHead.rows[0].innerHTML = GRID_COLS.map(c=>`<th>${esc(tr(c[2]))}</th>`).join("") + "<th></th>";
  $("gridTypes").innerHTML = GRID_TYPES.map(([,l])=>`<option value="${esc(tr(l))}">`).join("");
  $("gridSizes").innerHTML = GRID_SIZES.map(([c,l])=>`<option value="${esc(l ? tr(l) : c)}">`).join("");
}
function gridRow(vals){
  const tr_ = document.createElement("tr");
  tr_.innerHTML = GRID_COLS.map(([k,c,label,list,ph],i)=>`<td class="${c}"><input data-c="${i}" ${list?`list="${list}"`:""} ${ph?`placeholder="${esc(k==="acquired"?todayStr():ph)}"`:""}
      ${c==="n"?'inputmode="decimal"':""} autocomplete="off" aria-label="${esc(tr(label))}"></td>`).join("")
    + `<td><button type="button" class="gdel" aria-label="${esc(tr("Remove the row"))}" title="${esc(tr("Remove the row"))}">✕</button></td>`;
  (vals||[]).forEach((v,i)=>{ const inp = tr_.querySelector(`input[data-c="${i}"]`); if(inp) inp.value = v; });
  $("wGrid").tBodies[0].appendChild(tr_);
  return tr_;
}
function gridCount(){
  const n = [...$("wGrid").tBodies[0].rows].filter(r=>r.querySelector('input[data-c="0"]').value.trim()).length;
  $("gridCount").textContent = n ? (n===1 ? tr("1 wine") : tr("{0} wines", n)) : "";
  $("gridGo").disabled = !n;
}
function gridOpen(){
  impReset();
  gridHead(); const body = $("wGrid").tBodies[0]; body.innerHTML = ""; for(let i=0; i<5; i++) gridRow();
  $("impPick").hidden = true; $("impGrid").hidden = false; $("impBack").hidden = false;
  IMP.fromGrid = true; trSet("Add several wines", $("impTitle").firstElementChild); trSet("Choose a file instead", $("impBack"));
  $("impModal").classList.add("open"); gridCount();
  setTimeout(()=>body.querySelector("input").focus(), 30);
}
$("gridOpen").addEventListener("click", gridOpen);
$("addMany").addEventListener("click", ()=>{ $("addModal").classList.remove("open"); gridOpen(); });
$("gridRow").addEventListener("click", ()=>{ gridRow().querySelector("input").focus(); });
$("wGrid").addEventListener("input", gridCount);
$("wGrid").addEventListener("click", e=>{ const b = e.target.closest(".gdel"); if(!b) return;
  const body = $("wGrid").tBodies[0]; b.closest("tr").remove(); if(!body.rows.length) gridRow(); gridCount(); });
// Enter goes down a row (a new one at the end), as in a spreadsheet
$("wGrid").addEventListener("keydown", e=>{
  if(e.key !== "Enter" || !e.target.matches("input")) return;
  e.preventDefault();
  const tr_ = e.target.closest("tr"), c = e.target.dataset.c, next = tr_.nextElementSibling || gridRow();
  next.querySelector(`input[data-c="${c}"]`).focus();
});
// rows pasted from a spreadsheet (tabs between cells, a line per row) fill the table from the cell pasted into
$("wGrid").addEventListener("paste", e=>{
  const text = (e.clipboardData || window.clipboardData).getData("text"); if(!/[\t\n]/.test(text)) return;
  e.preventDefault();
  const lines = text.replace(/\r/g, "").split("\n").filter((l,i,a)=>l.length || i < a.length - 1);
  let tr_ = e.target.closest("tr"); const c0 = Number(e.target.dataset.c);
  lines.forEach((line, i)=>{
    if(i) tr_ = tr_.nextElementSibling || gridRow();
    line.split("\t").forEach((v, j)=>{ const inp = tr_.querySelector(`input[data-c="${c0 + j}"]`); if(inp) inp.value = v.trim(); });
  });
  gridCount();
});
$("gridGo").addEventListener("click", ()=>{
  const iT = GRID_COLS.findIndex(c=>c[0]==="type"), iS = GRID_COLS.findIndex(c=>c[0]==="size");
  const rows = [...$("wGrid").tBodies[0].rows].map(r=>GRID_COLS.map((_,i)=>r.querySelector(`input[data-c="${i}"]`).value.trim())).filter(v=>v[0])
    .map(v=>{ v[iT] = gridWord(GRID_TYPES, v[iT]); v[iS] = gridWord(GRID_SIZES, v[iS]); return v; });
  if(!rows.length){ $("impErr").textContent = tr("Type at least one producer."); return; }
  // the headings are only there so the import sees a header row; which column is which is known, so it's set, not guessed
  IMP.book = {sheets:[{name:tr("Table"), rows:[GRID_COLS.map(c=>c[0]), ...rows]}]}; IMP.name = tr("Typed in the table"); IMP.sheet = 0;
  $("impSheet").innerHTML = ""; $("impSheet").hidden = true; $("impName").textContent = IMP.name;
  impSheet();
  if(IMP.t.header !== 0) IMP.t = IMPORT.table([GRID_COLS.map(c=>c[0]), ...rows]); // (it always finds them; belt and braces)
  IMP.fields = GRID_COLS.map(c=>c[0]); IMP.t.header = 0;
  $("impCols").querySelectorAll("select").forEach(s=>{ s.value = IMP.fields[Number(s.dataset.col)] || ""; s.classList.toggle("on", !!s.value); });
  impBuild();
  $("impGrid").hidden = true; $("impMap").hidden = false; $("impBack").hidden = false; $("impGo").hidden = false;
  trSet("Back to the table", $("impBack"));
});
$("impCancel").addEventListener("click", ()=>$("impModal").classList.remove("open"));
// back: to the table it came from (with its rows), or to choosing a file
$("impBack").addEventListener("click", ()=>{
  if(IMP.fromGrid && !$("impMap").hidden){ $("impMap").hidden = true; $("impGo").hidden = true; $("impGrid").hidden = false; $("impErr").textContent = "";
    trSet("Choose a file instead", $("impBack")); return; }
  impReset();
});
$("impModal").addEventListener("click", e=>{ if(e.target===$("impModal")) $("impModal").classList.remove("open"); });
$("impFile").addEventListener("change", e=>{ const f = e.target.files && e.target.files[0]; if(f) impOpen(f); });
["dragenter","dragover"].forEach(ev => $("impDrop").addEventListener(ev, e=>{ e.preventDefault(); $("impDrop").classList.add("over"); }));
["dragleave","drop"].forEach(ev => $("impDrop").addEventListener(ev, e=>{ e.preventDefault(); $("impDrop").classList.remove("over"); }));
$("impDrop").addEventListener("drop", e=>{ const f = e.dataTransfer && e.dataTransfer.files[0]; if(f) impOpen(f); });
$("impSheet").addEventListener("change", e=>{ IMP.sheet = Number(e.target.value); impSheet(); });
$("impCols").addEventListener("change", e=>{
  const s = e.target.closest("select[data-col]"); if(!s) return;
  IMP.fields[Number(s.dataset.col)] = s.value; s.classList.toggle("on", !!s.value); impBuild();
});
document.querySelectorAll('input[name="impDup"]').forEach(r => r.addEventListener("change", impGoLabel));
$("impMerge").addEventListener("change", e=>{ IMP.merge = e.target.checked; impBuild(); });
$("impFixes").addEventListener("change", e=>{
  const c = e.target.closest("input[data-fix]"); if(!c) return;
  if(c.checked) IMP.off.delete(c.dataset.fix); else IMP.off.add(c.dataset.fix);
  impBuild();
});
$("impGo").addEventListener("click", impRun);

/* ---------- the sommelier (sommelier.js): answers from the site's own data, loaded the first time it opens ---------- */
const SOMM = {ready:null};
function loadJS(src){ return new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => no(new Error("load " + src)); document.head.appendChild(s); }); }
// only what isn't there yet (the atlas texts follow the language picker)
function sommLoad(){
  const lang = (window.I18N && I18N.lang) || "en";
  if(SOMM.ready && SOMM.lang === lang) return SOMM.ready;
  const need = [];
  if(!window.WINE_KB) need.push("wine-kb.js?v=2");
  if(!window.SOMM_DATA) need.push("sommelier-data.js?v=4");
  if(!window.SOMM_WORLD) need.push("sommelier-world.js?v=1");
  if(!window.SOMMELIER) need.push("sommelier.js?v=5");
  if(!window.BURG_VINTAGES) need.push("burgundy-vintages.js?v=5");
  if(["da","fr","de"].includes(lang) && !(window.BURG_I18N && BURG_I18N[lang])) need.push(`burgundy-i18n-${lang}.js?v=${lang==="de"?1:5}`);
  SOMM.lang = lang;
  return SOMM.ready = need.reduce((pr, src) => pr.then(() => loadJS(src)), Promise.resolve()).catch(e => { SOMM.ready = null; throw e; });
}
function sommCtx(){
  const lang = (window.I18N && I18N.lang) || "en";
  return {lang, wines:WINES, burg:window.BURG, vint:window.BURG_VINTAGES, burgI18n:(window.BURG_I18N||{})[lang] || null,
    readiness, window:drinkWindow, prev:SOMM.prev || "", notes:Object.fromEntries(Object.entries(window.PRODUCER_NOTES||{}).map(([k,v])=>[k,[v[0],noteText(v[1])]]))};
}
function sommSay(html, who){
  const d = document.createElement("div"); d.className = who === "q" ? "sm-q" : "sm-a";
  if(who === "q") d.textContent = html; else d.innerHTML = html; // the answer is built escaped by sommelier.js
  $("sommLog").appendChild(d); sommShow(d);
  return d;
}
// bring a message into view: a long one from its top (read from its first line, not scrolled past), a short one whole
function sommShow(el){
  const log = $("sommLog"), top = el.offsetTop - 10;
  log.scrollTop = el.offsetHeight > log.clientHeight - 20 ? top : Math.max(log.scrollTop, el.offsetTop + el.offsetHeight - log.clientHeight + 10);
}
function sommChips(list){
  $("sommChips").innerHTML = (list || []).map(c => `<button type="button">${esc(c)}</button>`).join("");
}
// The sommelier takes a moment, as a person would: "Thinking…" for about two seconds (a little longer for a long
// answer), then the answer, shown from the question down. One question at a time.
const SOMM_THINK = [1500, 2300];
async function sommAsk(q){
  q = String(q || "").trim(); if(!q || SOMM.busy) return;
  SOMM.busy = true; const asked = sommSay(q, "q"); $("sommQ").value = ""; hit("sommelier");
  const think = document.createElement("div"); think.className = "sm-a sm-think";
  think.innerHTML = `<span>${esc(tr("Thinking"))}</span><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>`;
  $("sommLog").appendChild(think); sommShow(think);
  const t0 = Date.now();
  try{
    await sommLoad();
    SOMM.turn = (SOMM.turn || 0) + 1;
    const r = SOMMELIER.chat ? SOMMELIER.chat(q, Object.assign(sommCtx(), {turn:SOMM.turn})) : SOMMELIER.answer(q, sommCtx());
    const wait = Math.min(SOMM_THINK[1], SOMM_THINK[0] + r.html.length / 4) - (Date.now() - t0);
    if(wait > 0) await new Promise(res => setTimeout(res, wait));
    SOMM.prev = r.asked || q; think.remove();
    const ans = sommSay(r.html); sommChips(r.chips);
    // question and answer together if they fit; otherwise from the question down
    const log = $("sommLog"), span = ans.offsetTop + ans.offsetHeight - asked.offsetTop;
    log.scrollTop = span > log.clientHeight - 20 ? asked.offsetTop - 10 : ans.offsetTop + ans.offsetHeight - log.clientHeight + 12;
  }catch(err){ think.remove(); sommSay(esc(tr("The sommelier couldn't load ({0}). Check your connection and try again.", errText(err)))); }
  finally{ SOMM.busy = false; }
}
async function sommOpen(){
  $("sommPanel").hidden = false; $("sommBtn").hidden = true;
  if(!$("sommLog").children.length){
    try{ await sommLoad(); const r = SOMMELIER.answer("", sommCtx()); sommSay(r.html); sommChips(r.chips); }
    catch(err){ sommSay(esc(tr("The sommelier couldn't load ({0}). Check your connection and try again.", errText(err)))); }
  }
  setTimeout(() => $("sommQ").focus(), 30);
}
function sommClose(){ $("sommPanel").hidden = true; $("sommBtn").hidden = $("app").hidden; $("sommBtn").focus(); }
$("sommBtn").addEventListener("click", sommOpen);
$("sommClose").addEventListener("click", sommClose);
$("sommForm").addEventListener("submit", e => { e.preventDefault(); sommAsk($("sommQ").value); });
$("sommChips").addEventListener("click", e => { const b = e.target.closest("button"); if(b) sommAsk(b.textContent); });
$("sommPanel").addEventListener("keydown", e => { if(e.key === "Escape"){ e.stopPropagation(); sommClose(); } });
// the button shows with the cellar, not on the login screen
new MutationObserver(() => { const on = !$("app").hidden; $("sommBtn").hidden = !on || !$("sommPanel").hidden; if(!on) $("sommPanel").hidden = true; })
  .observe($("app"), {attributes:true, attributeFilter:["hidden"]});

/* ---------- tidy up the cellar (tidy.js): one spelling per thing, one row per wine ---------- */
const TIDY_STATE = {off:new Set(), groupsOff:new Set(), fixes:[], edits:[], groups:[]};
function tidyPlan(){
  const base = WINES.map(w => ({row:w.row, producer:w.producer, name:w.name, commune:w.commune, region:w.region, country:w.country,
    grape:w.grape, source:w.source, location:w.location, vintage:w.vintage, size:w.size, elsewhere:w.elsewhere}));
  const t = tidier().wines(base, {off:TIDY_STATE.off});
  const edits = [];
  t.wines.forEach((w, i) => {
    const fields = {};
    for (const f of ["producer","name","commune","region","country","grape","source","location"]) if (String(w[f]||"") !== String(base[i][f]||"")) fields[f] = w[f];
    if (Object.keys(fields).length) edits.push({row:w.row, fields});
  });
  // the same wine in several rows (after the spellings), never mixing in wines drunk elsewhere
  const by = new Map();
  t.wines.forEach(w => { if (w.elsewhere) return; const k = TIDY.mergeKey(w); (by.get(k) || by.set(k, []).get(k)).push(w.row); });
  const groups = [...by.values()].filter(r => r.length > 1).map(r => r.sort((a,b) => a-b)).map(r => ({keep:r[0], drop:r.slice(1)}));
  Object.assign(TIDY_STATE, {fixes:t.fixes, edits, groups});
}
function tidyRender(){
  tidyPlan();
  const S = TIDY_STATE, offList = [...S.off].map(k => { const i = k.indexOf("|"); return {field:k.slice(0, i), from:k.slice(i + 1), off:true}; });
  const fx = S.fixes.concat(offList);
  $("tidyFixWrap").hidden = !fx.length;
  $("tidyFixes").innerHTML = fx.slice(0, 150).map(f => `<label class="jcheck"><input type="checkbox" data-fix="${esc(f.field + "|" + f.from)}"${f.off ? "" : " checked"}>
    <span><span class="fixf">${esc(tr(FIX_FIELD[f.field] || f.field))}</span> “${esc(f.from)}”${f.off ? "" : ` → “<b>${esc(f.to)}</b>”`}${f.n > 1 ? ` <span class="aimeta">${esc(trn(f.n, "{0} wine", "{0} wines"))}</span>` : ""}</span></label>`).join("");
  const byRow = new Map(WINES.map(w => [w.row, w]));
  $("tidyDupWrap").hidden = !S.groups.length;
  $("tidyDups").innerHTML = S.groups.map(g => { const ws = [g.keep, ...g.drop].map(r => byRow.get(r)), w = ws[0], key = String(g.keep);
    return `<label class="jcheck"><input type="checkbox" data-grp="${key}"${S.groupsOff.has(key) ? "" : " checked"}>
      <span><b>${esc(w.producer)}</b> ${esc([w.name, w.vintage].filter(Boolean).join(" "))} <span class="aimeta">${esc(tr("{0} rows: {1} bottles", ws.length, ws.map(x => x.qty).join(" + ")))}</span></span></label>`; }).join("");
  const nEdit = S.edits.length, nGroup = S.groups.filter(g => !S.groupsOff.has(String(g.keep))).length;
  $("tidyIntro").textContent = (nEdit || S.groups.length) ? tr("Here's what can be tidied. Untick anything you want left as it is.") : tr("Nothing to tidy: every spelling is consistent and no wine is in two rows.");
  $("tidyGo").hidden = !(nEdit || S.groups.length);
  $("tidyGo").textContent = tr("Tidy {0} wines and join {1} groups", nEdit, nGroup);
  $("tidyGo").disabled = !(nEdit || nGroup);
}
async function tidyRun(){
  const S = TIDY_STATE, btn = $("tidyGo"); btn.disabled = true; $("tidyErr").textContent = "";
  try{
    // in parts, like the import: each must be written well within Apps Script's time, and at most 5,000 a call
    const vault = window.VAULT && VAULT.active(), ESZ = vault ? 4000 : 800, GSZ = vault ? 4000 : 300;
    let res;
    for(let i = 0; i < S.edits.length; i += ESZ) res = await api({action:"setinfomany", edits:S.edits.slice(i, i + ESZ)});
    // merging deletes rows, so the rows of the later parts move up by the rows deleted above them
    let groups = S.groups.filter(g => !S.groupsOff.has(String(g.keep))), gone = [];
    const moved = r => { let n = 0; for(const d of gone) if(d < r) n++; return r - n; };
    for(let i = 0; i < groups.length; i += GSZ){
      const part = groups.slice(i, i + GSZ).map(g => ({keep:moved(g.keep), drop:g.drop.map(moved)}));
      res = await api({action:"mergerows", groups:part});
      gone = gone.concat(groups.slice(i, i + GSZ).flatMap(g => g.drop)).sort((a,b)=>a-b);
    }
    if(res){ WINES = normalize(res.wines); KEEP_OPEN = null; renderOverview(); renderTable(); renderEnjoyed(); }
    $("tidyModal").classList.remove("open");
    toast(tr("Cellar tidied 🧹"));
  }catch(err){
    const m = String(err && err.message || err);
    $("tidyErr").textContent = m === "bad-action" ? tr("Tidying needs the updated Apps Script (version 32) — redeploy Code.gs.") : tr("Could not tidy: {0}", m);
    btn.disabled = false;
    if(AUTH_ERRORS.has(m)) showGate(authMsg(m));
  }
}
$("tidyBtn").addEventListener("click", ()=>{ TIDIER = null; TIDY_STATE.off = new Set(); TIDY_STATE.groupsOff = new Set(); $("tidyErr").textContent = ""; tidyRender(); $("tidyModal").classList.add("open"); });
$("tidyCancel").addEventListener("click", ()=>$("tidyModal").classList.remove("open"));
$("tidyModal").addEventListener("click", e=>{ if(e.target===$("tidyModal")) $("tidyModal").classList.remove("open"); });
$("tidyFixes").addEventListener("change", e=>{ const c = e.target.closest("input[data-fix]"); if(!c) return; if(c.checked) TIDY_STATE.off.delete(c.dataset.fix); else TIDY_STATE.off.add(c.dataset.fix); tidyRender(); });
$("tidyDups").addEventListener("change", e=>{ const c = e.target.closest("input[data-grp]"); if(!c) return; if(c.checked) TIDY_STATE.groupsOff.delete(c.dataset.grp); else TIDY_STATE.groupsOff.add(c.dataset.grp); tidyRender(); });
$("tidyGo").addEventListener("click", tidyRun);

/* ---------- export (export.js builds the file here from the decrypted cellar) ---------- */
async function expRun(kind){
  const btn = $(kind==="xlsx" ? "expXlsx" : "expCsv"); btn.disabled = true; $("expErr").textContent = "";
  try{
    const rows = EXPORT.cellar((await api({action:"data"})).wines);
    let blob;
    if(kind==="csv") blob = new Blob([EXPORT.csv(rows)], {type:"text/csv;charset=utf-8"});
    else{
      const sheets = [{name:"Kælder", rows}];
      const j = await api({action:"journal"}).catch(()=>null); if(j && j.entries) sheets.push({name:"Journal", rows:EXPORT.journal(j.entries)});
      const w = await api({action:"wish"}).catch(()=>null); if(w && w.items) sheets.push({name:"Ønskeliste", rows:EXPORT.wishlist(w.items)});
      blob = new Blob([EXPORT.xlsx(sheets)], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `allwine-${(cfg.user||"cellar").replace(/[^\w-]+/g,"_")}-${todayStr()}.${kind}`;
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    $("expModal").classList.remove("open");
    toast(tr("Saved {0}", a.download)); hit("export");
  }catch(err){
    const m = String(err && err.message || err);
    $("expErr").textContent = tr("Could not export: {0}", m);
    if(AUTH_ERRORS.has(m)) showGate(authMsg(m));
  }
  btn.disabled = false;
}
$("expBtn").addEventListener("click", ()=>{
  $("expErr").textContent = "";
  $("expLock").textContent = (window.VAULT && VAULT.active())
    ? tr("🔒 The file is made in this browser from your decrypted cellar. Keep it somewhere safe: it isn't encrypted.")
    : tr("The file is made in this browser from your cellar.");
  $("expModal").classList.add("open");
});
$("expXlsx").addEventListener("click", ()=>expRun("xlsx"));
$("expCsv").addEventListener("click", ()=>expRun("csv"));
$("expCancel").addEventListener("click", ()=>$("expModal").classList.remove("open"));
$("expModal").addEventListener("click", e=>{ if(e.target===$("expModal")) $("expModal").classList.remove("open"); });

/* ---------- first steps for a new member (the #tips card): ticked as they're done; gone once wines and a drink window
   are in, or when hidden (remembered per member on this device) ---------- */
const TIPS_KEY = () => "vinTips:" + String(cfg.user||"").toLowerCase();
function renderTips(){
  const el = $("tips"); if(!el) return;
  let off = false; try{ off = localStorage.getItem(TIPS_KEY())==="0"; }catch(e){}
  const wines = WINES.length>0, windows = WINES.some(w=>w.drinkFrom!=null || w.drinkTo!=null);
  el.querySelector('[data-tip="wines"]').classList.toggle("done", wines);
  el.querySelector('[data-tip="windows"]').classList.toggle("done", windows);
  el.hidden = off || !cfg.user || (wines && windows);
}
$("tipsClose").addEventListener("click", ()=>{ try{ localStorage.setItem(TIPS_KEY(), "0"); }catch(e){} $("tips").hidden = true; });

/* ---------- share a list (share-crypto.js seals it here; share.html opens it with the key in the link) ---------- */
const LS_KEY = () => "vinShares:" + String(cfg.user||"").toLowerCase();
const lsMine = () => { try{ return JSON.parse(localStorage.getItem(LS_KEY())||"[]"); }catch(e){ return []; } };
const lsSave = a => { try{ localStorage.setItem(LS_KEY(), JSON.stringify(a)); }catch(e){} };
const lsUrl = s => new URL("share.html#" + s.id + "." + s.key, location.href).href;
const lsWines = () => ($("lsScope").value==="all" ? WINES : SHOWN).filter(w=>w.left>0);
function lsCount(){ const w = lsWines(); $("lsCount").textContent = nWines(w.length) + ", " + nBottles(w.reduce((s,x)=>s+x.left,0)); $("lsGo").disabled = !w.length; }
// the lists this browser made carry their key, so their link can be copied again; one made on another device, or
// before logging out (which forgets the keys), can only be withdrawn. server: the live ones, as sharelist gives them
function lsRender(server){
  const now = Date.now(); let mine = lsMine().filter(s=>s.expires > now);
  if(server) mine = mine.filter(s=>server.some(x=>x.id===s.id)); // withdrawn elsewhere, or gone with a pruning
  lsSave(mine);
  const rows = mine.concat((server||[]).filter(x=>!mine.some(s=>s.id===x.id)).map(x=>({id:x.id, created:x.created, expires:x.expires, count:x.wines})));
  $("lsListH").hidden = !rows.length;
  $("lsList").innerHTML = rows.sort((a,b)=>b.created-a.created).map(s=>`<li><span>${esc(s.key ? (s.title||tr("A shared wine list")) : tr("A list shared from another device"))}<small>${esc(nWines(s.count))} · ${esc(tr("open until {0}", new Date(s.expires).toLocaleDateString()))}</small></span>`
    +`<span class="btns">${s.key ? `<button type="button" class="btn quiet" data-copy="${esc(s.id)}">${esc(tr("Copy link"))}</button>` : ""}<button type="button" class="btn quiet" data-del="${esc(s.id)}">${esc(tr("Withdraw"))}</button></span></li>`).join("");
}
async function lsCopy(text){
  try{ await navigator.clipboard.writeText(text); toast(tr("Link copied")); }
  catch(e){ $("lsLink").select(); toast(tr("Select the link and copy it")); }
}
$("lsBtn").addEventListener("click", async ()=>{
  $("lsErr").textContent = ""; $("lsOut").hidden = true;
  if(!$("lsName").value || $("lsName").dataset.u !== cfg.user){ $("lsName").value = tr("Wines from {0}'s cellar", cfg.user||""); $("lsName").dataset.u = cfg.user; }
  lsCount(); lsRender(); $("lsModal").classList.add("open"); $("lsName").focus();
  try{ const r = await api({action:"sharelist"}); lsRender(r.shares||[]); }catch(e){}
});
$("lsScope").addEventListener("change", lsCount);
$("lsForm").addEventListener("submit", async e=>{
  e.preventDefault(); const btn = $("lsGo"); btn.disabled = true; $("lsErr").textContent = "";
  try{
    if(!window.SHARE_CRYPTO || !window.crypto || !crypto.subtle) throw new Error("old-browser");
    const notes = $("lsNotes").checked, prices = $("lsPrices").checked, title = $("lsName").value.trim().slice(0,80);
    const list = lsWines().map(w=>{ const r = [w.producer, w.name, w.vintage, w.commune, w.region, w.country, w.classification, w.style, w.left, w.drinkFrom, w.drinkTo];
      if(notes || prices) r.push(notes ? w.note : ""); if(prices) r.push(w.price); return r; });
    const sealed = await SHARE_CRYPTO.seal({v:1, t:title, by:cfg.user||"", at:Date.now(), w:list});
    const r = await api({action:"shareput", blob:sealed.blob, days:Number($("lsDays").value), wines:list.length});
    const s = {id:r.id, key:sealed.key, title, created:r.created, expires:r.expires, count:list.length};
    lsSave([...lsMine(), s]); lsRender(r.shares||[]);
    $("lsLink").value = lsUrl(s); $("lsOut").hidden = false; $("lsSend").hidden = !navigator.share; $("lsLink").select();
    hit("share");
  }catch(err){
    const m = String(err && err.message || err);
    $("lsErr").textContent = m==="too-many-shares" ? tr("You have 20 shared lists open: withdraw one first.")
      : m==="share-too-big" ? tr("The list is too big to share: share fewer wines.")
      : m==="old-browser" ? tr("This browser can't encrypt a shared list.")
      : m==="bad-action" ? tr("Sharing needs the updated Apps Script (version 44) — redeploy Code.gs.") : tr("Could not share: {0}", m);
    if(AUTH_ERRORS.has(m)) showGate(authMsg(m));
  }
  btn.disabled = false;
});
$("lsCopy").addEventListener("click", ()=>lsCopy($("lsLink").value));
$("lsSend").addEventListener("click", ()=>{ navigator.share({title:$("lsName").value, url:$("lsLink").value}).catch(()=>{}); });
$("lsList").addEventListener("click", async e=>{
  const c = e.target.closest("[data-copy]"), d = e.target.closest("[data-del]");
  if(c){ const s = lsMine().find(x=>x.id===c.dataset.copy); if(s) lsCopy(lsUrl(s)); }
  if(d){ d.disabled = true;
    try{ const r = await api({action:"sharedel", id:d.dataset.del}); lsSave(lsMine().filter(x=>x.id!==d.dataset.del)); lsRender(r.shares||[]); toast(tr("Withdrawn: the link no longer opens the list")); }
    catch(err){ d.disabled = false; $("lsErr").textContent = tr("Could not withdraw: {0}", String(err && err.message || err)); } }
});
$("lsCancel").addEventListener("click", ()=>$("lsModal").classList.remove("open"));
$("lsModal").addEventListener("click", e=>{ if(e.target===$("lsModal")) $("lsModal").classList.remove("open"); });

/* ---------- phones: the pages as tabs at the bottom, ＋ adds to the page you're on, and two menus for the rest: ⋯ for the
   cellar's tools, your initial for the account, language and help. Each item presses the same button as on a wide screen. ---------- */
document.querySelectorAll("#ptabs button").forEach(t=>t.addEventListener("click", ()=>{ location.hash = t.dataset.page==="cellar" ? "" : t.dataset.page; scrollTo({top:0}); }));
$("pFab").addEventListener("click", ()=>{
  const page = ["enjoyed","wishlist","journal"].find(p=>!$("page"+p[0].toUpperCase()+p.slice(1)).hidden);
  $({enjoyed:"eAddBtn", wishlist:"wAddBtn", journal:"jAddBtn"}[page] || "addBtn").click();
});
function sheetMenu(menu, items){
  $(menu).innerHTML = items.filter(Boolean).map(([ic, label, act, note])=> act.startsWith("http") || act.endsWith(".html")
    ? `<a href="${esc(act)}" ${act.startsWith("help") ? 'target="_blank" rel="noopener"' : ""}><span class="ic" aria-hidden="true">${ic}</span>${esc(label)}${note?`<small>${esc(note)}</small>`:""}</a>`
    : `<button type="button" data-press="${esc(act)}"><span class="ic" aria-hidden="true">${ic}</span>${esc(label)}${note?`<small>${esc(note)}</small>`:""}</button>`).join("");
}
function closeSheets(){ $("moreSheet").classList.remove("open"); $("meSheet").classList.remove("open"); }
["moreMenu","meMenu"].forEach(id=>$(id).addEventListener("click", e=>{ const b = e.target.closest("[data-press]"); if(!b) return;
  closeSheets(); setTimeout(()=>$(b.dataset.press).click(), 60); }));
["moreSheet","meSheet"].forEach(id=>$(id).addEventListener("click", e=>{ if(e.target===$(id)) closeSheets(); }));
$("pMore").addEventListener("click", ()=>{
  sheetMenu("moreMenu", [["⬆", tr("Import a list"), "impBtn"], ["⬇", tr("Export"), "expBtn"], ["🔗", tr("Share a list"), "lsBtn"], ["🧹", tr("Tidy up"), "tidyBtn"],
    ["🎲", tr("Pick tonight's bottle"), "tonightBtn"], ["👁", $("priceBtn").textContent, "priceBtn"],
    $("delBtn").hidden ? null : ["↩", $("delBtn").textContent.replace(/^↩\s*/, ""), "delBtn"], ["↻", tr("Refresh"), "refreshBtn", $("stamp").textContent]]);
  $("moreSheet").classList.add("open");
});
$("pMe").addEventListener("click", ()=>{
  $("meTitle").textContent = cfg.user || "";
  sheetMenu("meMenu", [["👤", tr("Account"), "acctBtn", tr("password, recovery code")], $("adminBtn").hidden ? null : ["🛡", tr("Admin"), "adminBtn", tr("members, invites")],
    ["?", tr("Help and tips"), "help.html"], ["🔏", tr("Privacy"), "privacy.html"], ["🔒", tr("Log out"), "lockBtn"]]);
  $("meSheet").classList.add("open");
});
/* ---------- filters / sorting (bound once) ---------- */
// a big cellar waits for a pause in the typing instead of filtering thousands of wines on every key
let Q_T = null;
$("q").addEventListener("input",e=>{ state.q=e.target.value; clearTimeout(Q_T);
  if(WINES.length > 2000) Q_T = setTimeout(renderTable, 160); else renderTable(); });
$("fCountry").addEventListener("change",e=>{ state.country=e.target.value; renderTable(); });
$("fRegion").addEventListener("change",e=>{ state.region=e.target.value; renderTable(); });
$("fLoc").addEventListener("change",e=>{ state.loc=e.target.value; renderTable(); });
$("fStyle").addEventListener("change",e=>{ state.style=e.target.value; renderTable(); });
$("fStatus").addEventListener("change",e=>{ state.status=e.target.value; renderTable(); });
$("fReady").addEventListener("change",e=>{ state.ready=e.target.value; renderTable(); });
$("clear").addEventListener("click",()=>{
  state.q=state.country=state.region=state.style=state.ready=state.loc=state.closes=""; state.status="cellar";
  $("q").value=""; $("fCountry").value=""; $("fRegion").value=""; $("fStyle").value=""; $("fStatus").value="cellar"; $("fReady").value=""; $("fLoc").value=""; renderTable(); });
document.querySelectorAll("th[data-k]").forEach(th=>th.addEventListener("click",()=>{
  const k=th.dataset.k;
  if(state.sortK===k) state.sortDir*=-1; else { state.sortK=k; state.sortDir = (k==="price"||k==="left") ? -1 : 1; }
  renderTable();
}));

/* ---------- stylized SVG map (no external tiles/CDN) ---------- */
const REGION_GEO = {  // [lat, lng]
  // France
  "Bourgogne":[47.03,4.84], "Champagne":[49.04,4.00], "Chablis":[47.82,3.80],
  "Beaujolais":[46.15,4.72], "Rhône":[44.93,4.89], "Bordeaux":[44.84,-0.58],
  "Loire":[47.33,0.68], "Languedoc":[43.51,3.32], "Roussillon":[42.65,2.88],
  "Béarn":[43.30,-0.37], "Alsace":[48.30,7.40], "Jura":[46.90,5.75],
  "Savoie":[45.57,6.10], "Provence":[43.50,6.20], "Corse":[42.15,9.08], "Sud-Ouest":[44.00,0.50],
  // Germany
  "Mosel":[49.91,6.99], "Rheingau":[50.00,8.00], "Pfalz":[49.40,8.15], "Nahe":[49.85,7.65],
  "Rheinhessen":[49.80,8.20], "Baden":[48.50,7.90], "Franken":[49.80,10.10], "Ahr":[50.53,7.00],
  // Italy
  "Piemonte":[44.61,7.99], "Veneto":[45.44,11.00], "Toscana":[43.40,11.30],
  "Alto Adige":[46.50,11.35], "Friuli":[46.00,13.20], "Lombardia":[45.50,9.90], "Emilia-Romagna":[44.60,11.00],
  // Spain
  "Rioja":[42.46,-2.45], "Ribera del Duero":[41.62,-3.69], "Priorat":[41.20,0.80],
  "Rías Baixas":[42.40,-8.70], "Toro":[41.52,-5.40], "Rueda":[41.40,-4.90],
  // Portugal
  "Douro":[41.16,-7.55], "Alentejo":[38.60,-7.90], "Dão":[40.50,-7.90],
  "Vinho Verde":[41.50,-8.40], "Bairrada":[40.50,-8.55], "Lisboa":[39.00,-9.05], "Setúbal":[38.50,-8.80],
  // Austria
  "Wachau":[48.37,15.42], "Kamptal":[48.65,15.67], "Kremstal":[48.42,15.60],
  "Burgenland":[47.75,16.70], "Steiermark":[46.90,15.50], "Weinviertel":[48.60,16.40], "Thermenregion":[48.00,16.25],
  // Denmark (loosely placed — Danish wine regions aren't formalized)
  "Jylland":[56.20,9.50], "Fyn":[55.30,10.40], "Sjælland":[55.50,11.80], "Bornholm":[55.15,15.00],
};
// Country outlines from Natural Earth (50m), simplified — [lng,lat].
const LANDS = window.EUROPE_LANDS || {}; // europe-lands.js
// Faint English labels for the backdrop (non-wine) countries. [name, [lat,lng]].
const NEIGHBOR_LABELS = [
  ["United Kingdom",[53.4,-1.8]], ["Ireland",[53.3,-8.3]], ["Netherlands",[52.4,5.6]],
  ["Belgium",[50.6,4.6]], ["Switzerland",[46.85,8.2]], ["Norway",[61.2,8.6]],
  ["Sweden",[61.0,15.2]], ["Poland",[52.2,19.6]], ["Czechia",[49.8,15.4]],
];
// Focus countries for the top-level map: matcher keys (against the wine's country
// field, which may be Danish or English) and a dot position inside the outline.
const COUNTRIES = [
  {key:"France",   geo:[46.80,2.60],  match:["frankrig","france"]},
  {key:"Italy",    geo:[44.60,10.60], match:["italien","italy","italia"]},
  {key:"Germany",  geo:[50.40,9.60],  match:["tyskland","germany","deutschland"]},
  {key:"Spain",    geo:[40.40,-4.00], match:["spanien","spain","espana","espagne"]},
  {key:"Portugal", geo:[39.80,-8.10], match:["portugal"]},
  {key:"Austria",  geo:[47.60,14.60], match:["ostrig","oestrig","austria","osterreich","oesterreich"]},
  {key:"Denmark",  geo:[56.00,9.40],  match:["danmark","denmark"]},
];
const COUNTRY_EN = {France:"France",Italy:"Italy",Germany:"Germany",Spain:"Spain",Portugal:"Portugal",Austria:"Austria",Denmark:"Denmark"};
function countryOf(w){ const c=normName(w.country); return COUNTRIES.find(k=>k.match.some(m=>c.includes(m))) || null; }
// Which country a drill-down region lives in (for the map's back button).
const REGION_COUNTRY = {Bourgogne:"France",Champagne:"France",Mosel:"Germany",Piemonte:"Italy"};
const normName = t => String(t).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/ø/g,"o").replace(/æ/g,"ae").replace(/å/g,"a").replace(/[-'’]/g," ").replace(/\s+/g," ").trim();

// Côte d'Or communes with real coordinates [display, matcher keys, [lat,lng]].
const COTE_SECTIONS = [
  ["Côte de Nuits", [
    ["Marsannay",["marsannay","marsannay la cote"],[47.269,4.988]],
    ["Gevrey-Chambertin",["gevrey chambertin"],[47.227,4.968]],
    ["Morey-Saint-Denis",["morey saint denis"],[47.196,4.955]],
    ["Chambolle-Musigny",["chambolle musigny"],[47.180,4.945]],
    ["Vosne-Romanée",["vosne romanee"],[47.160,4.951]],
    ["Nuits-Saint-Georges",["nuits saint georges"],[47.137,4.949]],
    ["Hautes-Côtes de Nuits",["hautes cotes de nuits"],[47.190,4.850]],
  ]],
  ["Côte de Beaune", [
    ["Aloxe-Corton",["aloxe corton"],[47.065,4.862]],
    ["Pernand-Vergelesses",["pernand vergelesses"],[47.076,4.846]],
    ["Savigny-lès-Beaune",["savigny les beaune"],[47.066,4.817]],
    ["Beaune",["beaune"],[47.026,4.840]],
    ["Pommard",["pommard"],[47.005,4.795]],
    ["Volnay",["volnay"],[46.995,4.780]],
    ["Monthélie",["monthelie"],[46.990,4.767]],
    ["Auxey-Duresses",["auxey duresses"],[46.985,4.740]],
    ["Meursault",["meursault"],[46.976,4.770]],
    ["Puligny-Montrachet",["puligny montrachet"],[46.945,4.752]],
    ["Saint-Aubin",["saint aubin"],[46.940,4.712]],
    ["Chassagne-Montrachet",["chassagne montrachet"],[46.930,4.737]],
    ["Hautes-Côtes de Beaune",["hautes cotes de beaune"],[46.980,4.680]],
  ]],
];
const COTE_BUCKETS = [ // no single spot on the Côte — shown as a bottom row
  ["Mâconnais",["macon","maconnais"]],
  ["Regional cuvées",["bourgogne","bourgogne cote d or"]],
];
const CHAMP_GEO = { // normalized commune -> [lat, lng]
  // Montagne de Reims
  "reims":[49.258,4.032], "sillery":[49.194,4.100], "mailly champagne":[49.174,4.117],
  "verzenay":[49.159,4.145], "verzy":[49.152,4.158], "ludes":[49.176,4.075],
  "rilly la montagne":[49.183,4.055], "villers marmery":[49.132,4.155], "trepail":[49.126,4.170],
  "ambonnay":[49.113,4.170], "bouzy":[49.139,4.155], "louvois":[49.129,4.106],
  "tauxieres":[49.140,4.090], "montagne de reims":[49.150,4.020],
  // Vallée de la Marne
  "ay":[49.054,4.003], "mareuil sur ay":[49.049,4.033], "dizy":[49.061,3.978],
  "hautvillers":[49.086,3.945], "cumieres":[49.063,3.943], "damery":[49.070,3.900],
  "venteuil":[49.078,3.855], "oeuilly":[49.052,3.842], "vandieres":[49.070,3.782],
  "montigny":[49.079,3.766], "vincelles":[49.070,3.630], "azy sur marne":[49.026,3.335],
  "epernay":[49.043,3.959],
  // Côte des Blancs
  "chouilly":[49.023,4.017], "oiry":[49.017,4.030], "cuis":[49.011,3.997],
  "grauves":[48.998,3.965], "moussy":[49.017,3.917], "chavot courcourt":[49.008,3.928],
  "cramant":[48.995,4.005], "avize":[48.973,4.011], "oger":[48.955,4.020],
  "le mesnil sur oger":[48.938,4.023], "bergeres les vertus":[48.885,4.000], "vertus":[48.905,4.010],
  // Côte de Sézanne
  "sezanne":[48.720,3.725], "vindey":[48.708,3.735],
  // Côte des Bar (Aube)
  "bar sur seine":[48.110,4.370], "les riceys":[47.998,4.366], "neuville sur seine":[48.070,4.430],
  "celles sur ource":[48.077,4.470], "landreville":[48.093,4.480], "buxeuil":[48.093,4.463],
  "urville":[48.113,4.567], "colombe le sec":[48.240,4.680], "bar sur aube":[48.230,4.710],
};
const CITY_ANCHORS = [["REIMS",49.258,4.032],["ÉPERNAY",49.043,3.959]];
// Region labels: the three classic northern zones always show; the southern ones
// only appear (and stretch the map south) when the cellar actually holds their wines.
const CHAMP_AREAS = [["MONTAGNE DE REIMS",49.185,4.010],["VALLÉE DE LA MARNE",49.078,3.660],["CÔTE DES BLANCS",48.952,4.055]];
// Southern zones are labelled only when a member village is actually in the cellar.
const CHAMP_AREAS_SOUTH = [
  ["CÔTE DE SÉZANNE",48.72,3.73,["sezanne","vindey"]],
  ["CÔTE DES BAR",48.10,4.50,["bar sur seine","les riceys","neuville sur seine","celles sur ource","landreville","buxeuil","urville","colombe le sec","bar sur aube"]],
];

const MOSEL_GEO = { // normalized commune -> [lat, lng]
  // Mittelmosel
  "bernkastel":[49.917,7.070], "bernkastel kues":[49.917,7.070], "graach":[49.930,7.050],
  "wehlen":[49.938,7.037], "zeltingen":[49.945,7.020], "zeltingen rachtig":[49.945,7.020],
  "urzig":[49.968,7.020], "erden":[49.975,7.050], "krov":[49.985,7.085], "enkirch":[49.990,7.120],
  "piesport":[49.878,6.930], "brauneberg":[49.900,6.978], "wintrich":[49.888,6.958],
  "trittenheim":[49.822,6.900], "leiwen":[49.815,6.885], "dhron":[49.855,6.905], "neumagen":[49.858,6.895],
  // Saar
  "wiltingen":[49.660,6.585], "kanzem":[49.680,6.580], "ockfen":[49.615,6.585],
  "ayl":[49.630,6.570], "saarburg":[49.606,6.550], "serrig":[49.570,6.570], "oberemmel":[49.660,6.610],
  // Ruwer
  "kasel":[49.750,6.720], "eitelsbach":[49.770,6.700], "mertesdorf":[49.770,6.700],
};
const MOSEL_CITIES = [["TRIER",49.756,6.641]];
const MOSEL_AREAS = [["MITTELMOSEL",49.930,7.000],["SAAR",49.630,6.560],["RUWER",49.765,6.715]];

const PIEMONTE_GEO = { // normalized commune -> [lat, lng]
  // Barolo
  "barolo":[44.611,7.941], "la morra":[44.636,7.918], "serralunga":[44.626,7.997],
  "serralunga d alba":[44.626,7.997], "castiglione falletto":[44.622,7.968],
  "monforte":[44.582,7.972], "monforte d alba":[44.582,7.972], "novello":[44.596,7.912],
  "verduno":[44.660,7.930], "grinzane cavour":[44.652,7.988], "cherasco":[44.645,7.860],
  // Barbaresco
  "barbaresco":[44.723,8.087], "neive":[44.723,8.115], "treiso":[44.688,8.070],
  // wider Piedmont
  "gattinara":[45.616,8.366], "ghemme":[45.600,8.420], "asti":[44.900,8.206],
  "nizza monferrato":[44.775,8.358], "canelli":[44.720,8.293], "dogliani":[44.530,7.940],
};
const PIEMONTE_CITIES = [["ALBA",44.700,8.035]];
const PIEMONTE_AREAS = [["BAROLO",44.605,7.950],["BARBARESCO",44.720,8.090],["ALTO PIEMONTE",45.610,8.390]];

let MAP_VIEW = "europe", LAST_CELLAR = [];
const COS = Math.cos(46*Math.PI/180);
// Fit a projector to the given [lng,lat] polygons (default: all of Europe), plus
// optional extra [lat,lng] points so edge dots aren't clipped.
function buildProjector(W, pad, polys, extraPts, capN){
  polys = polys || Object.values(LANDS);
  let minx=Infinity,maxx=-Infinity,miny=Infinity,maxy=-Infinity;
  const acc=(lng,lat)=>{ const x=lng*COS; if(x<minx)minx=x; if(x>maxx)maxx=x; if(lat<miny)miny=lat; if(lat>maxy)maxy=lat; };
  for(const poly of polys) for(const [lng,lat] of poly) acc(lng,lat);
  (extraPts||[]).forEach(([lat,lng])=>acc(lng,lat));
  if(capN!=null && maxy>capN) maxy=capN; // crop the empty far north so the frame isn't wasted
  const s=(W-2*pad)/Math.max(0.0001,(maxx-minx));
  const H=(maxy-miny)*s+2*pad;
  return { W, H, proj:([lng,lat])=>[pad+(lng*COS-minx)*s, pad+(maxy-lat)*s], r:(b)=>4+Math.sqrt(b)*1.7 };
}

// Smooth closed outline through projected [x,y] points (Catmull-Rom → cubic
// béziers) so the coarse country polygons render as soft coastlines, not blocks.
function landPath(latlngPoly, proj){
  const p = latlngPoly.map(proj);
  const n = p.length;
  if(n < 3) return p.map((q,i)=>(i?"L":"M")+q.map(v=>v.toFixed(1)).join(" ")).join("")+"Z";
  let d = "M"+p[0][0].toFixed(1)+" "+p[0][1].toFixed(1);
  for(let i=0;i<n;i++){
    const a=p[(i-1+n)%n], b=p[i], c=p[(i+1)%n], e=p[(i+2)%n];
    const c1x=b[0]+(c[0]-a[0])/6, c1y=b[1]+(c[1]-a[1])/6;
    const c2x=c[0]-(e[0]-b[0])/6, c2y=c[1]-(e[1]-b[1])/6;
    d+="C"+c1x.toFixed(1)+" "+c1y.toFixed(1)+" "+c2x.toFixed(1)+" "+c2y.toFixed(1)+" "+c[0].toFixed(1)+" "+c[1].toFixed(1);
  }
  return d+"Z";
}

function updateMap(cellar){ LAST_CELLAR = cellar; renderMap(); }

function renderMap(){
  const svg=$("map"); if(!svg) return;
  hideTip(); // re-rendering replaces the dots; any hover tip would otherwise be orphaned
  $("mapbar").hidden = MAP_VIEW==="europe";
  $("mapAtlas").hidden = MAP_VIEW!=="Bourgogne";
  if(MAP_VIEW!=="europe"){
    $("mapBack").textContent = MAP_VIEW.startsWith("country:") ? "← "+tr("Europe")
      : REGION_COUNTRY[MAP_VIEW] ? "← "+countryLabel(REGION_COUNTRY[MAP_VIEW]) : "← "+tr("Europe");
  }
  if(MAP_VIEW.startsWith("country:")) return renderCountryMap(svg, MAP_VIEW.slice(8));
  if(MAP_VIEW==="Bourgogne") return renderCoteMap(svg);
  if(MAP_VIEW==="Champagne") return renderChampagneMap(svg);
  if(MAP_VIEW==="Mosel") return renderScatterMap(svg, {
    title:"Mosel · Saar · Ruwer — "+tr("villages"), region:"Mosel",
    geo:MOSEL_GEO, cities:MOSEL_CITIES, areas:MOSEL_AREAS, lat:49.8 });
  if(MAP_VIEW==="Piemonte") return renderScatterMap(svg, {
    title:tr("Piemonte — Langhe & beyond"), region:"Piemonte",
    geo:PIEMONTE_GEO, cities:PIEMONTE_CITIES, areas:PIEMONTE_AREAS, lat:44.7 });
  renderEuropeMap(svg);
}

function bindDot(c, tipHtml, onClick){
  c.addEventListener("mousemove",e=>showTip(tipHtml,e.clientX,e.clientY));
  c.addEventListener("mouseleave",hideTip);
  c.addEventListener("click",e=>{ hideTip(); onClick(e); }); // touch has no mouseleave — drop the tip on tap
}

const DRILLABLE = ["Bourgogne","Champagne","Mosel","Piemonte"];
const baseCountry = k => String(k).replace(/~\d+$/,"");     // "Italy~1" → "Italy"
const countryLabel = k => tr(COUNTRY_EN[k] || k);            // any country, in the interface language

// Top level: the whole of Europe. Every country is clickable → its country map.
function renderEuropeMap(svg){
  const {W,H,proj,r}=buildProjector(600,24,null,null,61); // crop above ~61°N (empty far north)
  const agg={};
  LAST_CELLAR.forEach(w=>{ const k=countryOf(w); if(!k) return; const a=agg[k.key] ??= {b:0,n:0}; a.b+=w.left; a.n++; });
  let html = Object.entries(LANDS).map(([k,poly])=>`<path class="land clickable" data-country="${esc(baseCountry(k))}" d="${landPath(poly,proj)}"/>`).join("");
  // faint English names for the backdrop countries
  html += NEIGHBOR_LABELS.map(([name,g])=>{
    const [x,y]=proj([g[1],g[0]]);
    return `<text class="cname" text-anchor="middle" x="${x.toFixed(1)}" y="${y.toFixed(1)}">${esc(tr(name))}</text>`;
  }).join("");
  const present = COUNTRIES.filter(c=>agg[c.key]).sort((a,b)=>agg[b.key].b-agg[a.key].b);
  html += present.map(c=>{
    const [x,y]=proj([c.geo[1],c.geo[0]]); const a=agg[c.key];
    return `<circle class="dot" data-country="${esc(c.key)}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r(a.b).toFixed(1)}"/>`;
  }).join("");
  html += present.map(c=>{
    const [x,y]=proj([c.geo[1],c.geo[0]]); const a=agg[c.key], rad=r(a.b), left=x>W*0.6;
    const lx=(left?x-rad-4:x+rad+4).toFixed(1), anc=left?"end":"start";
    return `<text class="dlabel" text-anchor="${anc}" x="${lx}" y="${(y-1).toFixed(1)}">${esc(countryLabel(c.key))}</text>
      <text class="dsub" text-anchor="${anc}" x="${lx}" y="${(y+10).toFixed(1)}">${btl(a.b)}</text>`;
  }).join("");
  svg.setAttribute("viewBox",`0 0 ${W} ${Math.round(H)}`);
  svg.innerHTML = html;
  const openCountry = key => { MAP_VIEW="country:"+key; state.q=""; $("q").value=""; renderMap(); };
  svg.querySelectorAll(".land.clickable").forEach(p=>{
    const key=p.dataset.country, a=agg[key];
    bindDot(p, `<b>${esc(countryLabel(key))}</b>${a?`<br>${esc(nBottles(a.b))} · ${esc(nWines(a.n))}`:""}<br><i>${esc(tr("click to explore"))}</i>`,
      ()=>openCountry(key));
  });
  svg.querySelectorAll(".dot").forEach(c=>{
    const key=c.dataset.country, a=agg[key];
    bindDot(c, `<b>${esc(countryLabel(key))}</b><br>${esc(nBottles(a.b))} · ${esc(nWines(a.n))}<br><i>${esc(tr("click to explore"))}</i>`,
      ()=>openCountry(key));
  });
}

// Middle level: one country, its regions as dots. Click a region to filter (or
// drill further for Bourgogne / Champagne / Mosel / Piemonte).
function renderCountryMap(svg, key){
  $("mapTitle").textContent = countryLabel(key) + " — " + tr("regions");
  const agg={};
  LAST_CELLAR.forEach(w=>{ if((countryOf(w)||{}).key!==key) return;
    const a=agg[w.region] ??= {b:0,n:0}; a.b+=w.left; a.n++; });
  const names = Object.keys(agg);
  const present = names.filter(n=>REGION_GEO[n]).sort((a,b)=>agg[b].b-agg[a].b);
  const buckets = names.filter(n=>!REGION_GEO[n] && n).sort((a,b)=>agg[b].b-agg[a].b);
  // all polygons of this country (mainland + its islands, e.g. Italy + Sicily/Sardinia)
  let outline = Object.entries(LANDS).filter(([k])=>baseCountry(k)===key).map(([,p])=>p);
  if(!outline.length) outline = Object.values(LANDS);
  const extra = present.map(n=>REGION_GEO[n]);
  const {W,H,proj,r}=buildProjector(600,30,outline,extra);
  const HB = buckets.length ? 30 : 0;
  let parts = outline.map(poly=>`<path class="land" d="${landPath(poly,proj)}"/>`).join("");
  if(!names.length){ // a country with nothing in the cellar (e.g. a backdrop country)
    parts += `<text class="dsub" text-anchor="middle" x="${(W/2).toFixed(1)}" y="${(H/2).toFixed(1)}">${esc(tr("No wines from {0} yet.", countryLabel(key)))}</text>`;
    svg.setAttribute("viewBox",`0 0 ${W} ${Math.round(H)}`); svg.innerHTML=parts; return;
  }
  const placedL=[], placedR=[];
  present.forEach(n=>{
    const [x,y]=proj([REGION_GEO[n][1],REGION_GEO[n][0]]); const a=agg[n], rad=r(a.b);
    const drill = DRILLABLE.includes(n);
    parts += `<circle class="dot${drill?" drill":""}" data-region="${esc(n)}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad.toFixed(1)}"/>`;
    const left=x>W*0.6, placed=left?placedL:placedR; let ly=y+4;
    while(placed.some(py=>Math.abs(py-ly)<12)) ly+=12; placed.push(ly);
    parts += `<text class="dlabel" text-anchor="${left?"end":"start"}" x="${(left?x-rad-4:x+rad+4).toFixed(1)}" y="${ly.toFixed(1)}">${esc(n)} · ${a.b}</text>`;
  });
  // regions we can't place on the map get a row along the bottom
  if(buckets.length){
    let bx=34; const by=H+HB-12;
    parts += `<text class="dsub" x="30" y="${(by-20).toFixed(1)}">${esc(tr("Not placed:"))}</text>`;
    buckets.forEach(n=>{ const a=agg[n], rad=r(a.b);
      parts += `<circle class="dot" data-region="${esc(n)}" cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="${rad.toFixed(1)}"/>
        <text class="dlabel" x="${(bx+rad+6).toFixed(1)}" y="${(by+4).toFixed(1)}">${esc(n)} · ${a.b}</text>`;
      bx += rad+6 + (n.length+String(a.b).length+3)*7 + 30;
    });
  }
  svg.setAttribute("viewBox",`0 0 ${W} ${Math.round(H+HB)}`);
  svg.innerHTML = parts;
  svg.querySelectorAll(".dot").forEach(c=>{
    const name=c.dataset.region, a=agg[name], drill=DRILLABLE.includes(name);
    bindDot(c, `<b>${esc(name)}</b><br>${esc(nBottles(a.b))} · ${esc(nWines(a.n))}${drill?"<br><i>"+esc(tr("click to explore"))+"</i>":"<br><i>"+esc(tr("click to filter the list"))+"</i>"}`,
      ()=>{
        if(drill){ MAP_VIEW=name; state.region=name; $("fRegion").value=name; state.q=""; $("q").value=""; renderTable(); renderMap(); return; }
        state.region = state.region===name ? "" : name;
        $("fRegion").value = state.region; renderTable(); syncMapActive();
      });
  });
  syncMapActive();
}

function renderCoteMap(svg){
  $("mapTitle").textContent = "Bourgogne — Côte de Nuits & Côte de Beaune";
  const geoOf={}, secOf={};
  for(const [sec,stops] of COTE_SECTIONS)
    for(const [label,,geo] of stops){ geoOf[label]=geo; secOf[label]=sec; }
  const agg={};
  LAST_CELLAR.forEach(w=>{
    if(w.region!=="Bourgogne") return;
    const key=normName(w.commune);
    let hit=null;
    for(const [,stops] of COTE_SECTIONS) for(const [label,keys] of stops) if(keys.includes(key)) hit=label;
    if(!hit) for(const [label,keys] of COTE_BUCKETS) if(keys.includes(key)) hit=label;
    const label = hit || "Other Bourgogne";
    const a = agg[label] ??= {b:0,n:0,q:w.commune};
    a.b+=w.left; a.n++;
  });
  const present = Object.keys(agg).filter(l=>geoOf[l]);
  const buckets = Object.keys(agg).filter(l=>!geoOf[l]);

  // project the Côte into the left part of the panel; labels get a right column
  const cos=Math.cos(47*Math.PI/180);
  const DIJON=[47.322,5.041];
  const pts=present.map(l=>geoOf[l]).concat([DIJON]);
  let minx=1e9,maxx=-1e9,miny=1e9,maxy=-1e9;
  pts.forEach(([la,ln])=>{ const x=ln*cos;
    minx=Math.min(minx,x); maxx=Math.max(maxx,x); miny=Math.min(miny,la); maxy=Math.max(maxy,la); });
  const W=640, H=Math.max(430, present.length*26+150);
  const X0=76, X1=300, Y0=42, Y1=H-(buckets.length?96:44);
  const sx=(X1-X0)/Math.max(1e-9,maxx-minx), sy=(Y1-Y0)/Math.max(1e-9,maxy-miny);
  const proj=([la,ln])=>[X0+(ln*cos-minx)*sx, Y0+(maxy-la)*sy];

  let parts=[];
  // the Côte itself as a soft ridge through the main communes (Hautes-Côtes sit west of it)
  const ridge = present.filter(l=>!l.startsWith("Hautes"))
    .sort((a,b)=>geoOf[b][0]-geoOf[a][0]).map(l=>proj(geoOf[l]));
  if(ridge.length>1)
    parts.push(`<path class="ridge" d="${ridge.map((p,i)=>(i?"L":"M")+p.map(n=>n.toFixed(1)).join(" ")).join("")}"/>`);
  // Dijon anchor
  { const [x,y]=proj(DIJON);
    parts.push(`<text class="city" x="${(x+9).toFixed(1)}" y="${(y+3).toFixed(1)}">DIJON</text>
      <path class="route" d="M ${(x-4).toFixed(1)} ${y.toFixed(1)} H ${(x+4).toFixed(1)} M ${x.toFixed(1)} ${(y-4).toFixed(1)} V ${(y+4).toFixed(1)}"/>`); }
  // sub-region labels at the mean latitude of their communes
  for(const [sec] of COTE_SECTIONS){
    const ys=present.filter(l=>secOf[l]===sec && !l.startsWith("Hautes")).map(l=>proj(geoOf[l])[1]);
    if(ys.length) parts.push(`<text class="sec" x="12" y="${(ys.reduce((a,b)=>a+b,0)/ys.length).toFixed(1)}">${sec.toUpperCase()}</text>`);
  }
  // dots at true positions; labels in a staggered right column with leader lines
  const ordered = present.map(l=>({l,p:proj(geoOf[l])})).sort((a,b)=>a.p[1]-b.p[1]);
  let lastY=-1e9; const LX=340;
  ordered.forEach(o=>{
    const a=agg[o.l], [x,y]=o.p, rad=4+Math.sqrt(a.b)*1.9;
    const ly=Math.max(y, lastY+16); lastY=ly;
    parts.push(`<path class="lead" d="M ${(x+rad+2).toFixed(1)} ${y.toFixed(1)} L ${(LX-6).toFixed(1)} ${ly.toFixed(1)}"/>
      <circle class="dot" data-q="${esc(a.q)}" data-label="${esc(tr(o.l))}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad.toFixed(1)}"/>
      <text class="dlabel" x="${LX}" y="${(ly+4).toFixed(1)}">${esc(tr(o.l))} · ${a.b}</text>`);
  });
  // wines without a single spot on the Côte
  if(buckets.length){
    const by=H-42; let bx=X0;
    parts.push(`<text class="dsub" x="18" y="${by-26}">${esc(tr("Without a spot on the Côte:"))}</text>`);
    buckets.forEach(l=>{
      const a=agg[l], rad=4+Math.sqrt(a.b)*1.9;
      parts.push(`<circle class="dot" data-q="${esc(a.q)}" data-label="${esc(tr(l))}" cx="${bx.toFixed(1)}" cy="${by}" r="${rad.toFixed(1)}"/>
        <text class="dlabel" x="${(bx+rad+7).toFixed(1)}" y="${by+4}">${esc(tr(l))} · ${a.b}</text>`);
      bx += rad + 7 + (tr(l).length+String(a.b).length+3)*7.2 + 44;
    });
  }
  svg.setAttribute("viewBox",`0 0 ${W} ${H}`);
  svg.innerHTML = parts.join("");
  bindDetailDots(svg);
}

function renderChampagneMap(svg){
  $("mapTitle").textContent = "Champagne — "+tr("villages");
  const agg={}; let other=null;
  LAST_CELLAR.forEach(w=>{
    if(w.region!=="Champagne") return;
    const key=normName(w.commune);
    if(CHAMP_GEO[key]){ const a=agg[key] ??= {b:0,n:0,q:w.commune,label:w.commune}; a.b+=w.left; a.n++; }
    else { other = other||{b:0,n:0,q:w.commune,label:"Elsewhere in Champagne"}; other.b+=w.left; other.n++; }
  });
  // Southern zones only get a label when the cellar actually holds a village near them,
  // so the northern villages stay legible when there are no Aube/Sézanne wines.
  const keys=Object.keys(agg);
  const areas = CHAMP_AREAS.concat(CHAMP_AREAS_SOUTH.filter(([,,,members])=>members.some(m=>keys.includes(m))));
  // Always show the northern core (Montagne / Marne / Blancs); extend south only
  // when the cellar holds Aube/Sézanne wines. Reference villages give context.
  const coreKeys=Object.keys(CHAMP_GEO).filter(k=>CHAMP_GEO[k][0]>=48.85);
  const refKeys=coreKeys.concat(keys.filter(k=>CHAMP_GEO[k] && CHAMP_GEO[k][0]<48.85)); // + owned southern
  const pts=refKeys.map(k=>CHAMP_GEO[k]);
  CITY_ANCHORS.forEach(([,la,ln])=>pts.push([la,ln]));
  areas.forEach(([,la,ln])=>pts.push([la,ln]));
  const cos=Math.cos(49*Math.PI/180), pad=40, W=640, HMAX=520;
  let minx=Infinity,maxx=-Infinity,miny=Infinity,maxy=-Infinity;
  pts.forEach(([la,ln])=>{ const x=ln*cos; if(x<minx)minx=x; if(x>maxx)maxx=x; if(la<miny)miny=la; if(la>maxy)maxy=la; });
  const sx=(W-2*pad)/Math.max(0.0001,(maxx-minx));
  const latSpan=Math.max(0.0001,maxy-miny);
  const sy=Math.min(sx,(HMAX-2*pad)/latSpan);
  const H=Math.max(220,latSpan*sy+2*pad);
  const proj=([la,ln])=>[pad+(ln*cos-minx)*sx, (H-pad)-(la-miny)*sy];
  let parts=[];
  CITY_ANCHORS.forEach(([name,la,ln])=>{
    const [x,y]=proj([la,ln]);
    const left = name==="ÉPERNAY"; // its label collides with the Aÿ/Chouilly cluster on the right
    parts.push(`<text class="city" text-anchor="${left?"end":"start"}" x="${(left?x-10:x+10).toFixed(1)}" y="${(y-8).toFixed(1)}">${name}</text>
      <path class="route" d="M ${(x-5).toFixed(1)} ${y.toFixed(1)} L ${(x+5).toFixed(1)} ${y.toFixed(1)} M ${x.toFixed(1)} ${(y-5).toFixed(1)} L ${x.toFixed(1)} ${(y+5).toFixed(1)}"/>`);
  });
  areas.forEach(([name,la,ln])=>{
    const [x,y]=proj([la,ln]);
    const cx=Math.max(78,Math.min(W-78,x)); // keep the centred label off the edges
    parts.push(`<text class="sec" text-anchor="middle" x="${cx.toFixed(1)}" y="${y.toFixed(1)}">${name}</text>`);
  });
  // faint reference dots for the villages you don't own, for context
  refKeys.forEach(k=>{ if(agg[k]) return; const [x,y]=proj(CHAMP_GEO[k]);
    parts.push(`<circle class="vref" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6"><title>${esc(titleCase(k))}</title></circle>`); });
  // Label every owned village. Nudge labels apart when dots share nearly the same row so none overlap.
  const entries=Object.entries(agg).map(([key,a])=>{ const [x,y]=proj(CHAMP_GEO[key]); return {key,a,x,y}; })
    .sort((p,q)=>q.a.b-p.a.b);
  const placedL=[], placedR=[]; // track label y-positions per side
  entries.forEach(({a,x,y})=>{
    const rad=4+Math.sqrt(a.b)*2.2;
    parts.push(`<circle class="dot" data-q="${esc(a.q)}" data-label="${esc(a.label)}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad.toFixed(1)}"/>`);
    const left = x>W*0.6, placed = left?placedL:placedR;
    let ly = y+4;
    while(placed.some(py=>Math.abs(py-ly)<11)) ly += 11; // push down off a crowded neighbour
    placed.push(ly);
    parts.push(`<text class="dlabel" text-anchor="${left?"end":"start"}" x="${(left?x-rad-5:x+rad+5).toFixed(1)}" y="${ly.toFixed(1)}">${esc(a.label)} · ${a.b}</text>`);
  });
  if(other) parts.push(`<text class="dsub" x="${pad}" y="${(H-12).toFixed(1)}">${esc(tr("+ {0} elsewhere ({1}…)", btl(other.b), other.q))}</text>`);
  svg.setAttribute("viewBox",`0 0 ${W} ${Math.round(H)}`);
  svg.innerHTML=parts.join("");
  bindDetailDots(svg, null);
}

// Generic village scatter (Mosel, Piemonte…): dots at real coords, area labels that
// only appear when the cellar reaches them, every dot labelled with collision-nudging.
const titleCase = k => String(k).replace(/\b\w/g,c=>c.toUpperCase());
function renderScatterMap(svg, cfg){
  $("mapTitle").textContent = cfg.title;
  const agg={}; let other=null;
  LAST_CELLAR.forEach(w=>{
    if(w.region!==cfg.region) return;
    const key=normName(w.commune);
    if(cfg.geo[key]){ const a=agg[key] ??= {b:0,n:0,q:w.commune,label:w.commune}; a.b+=w.left; a.n++; }
    else { other = other||{b:0,n:0,q:w.commune,label:"Elsewhere"}; other.b+=w.left; other.n++; }
  });
  // Fit to the WHOLE region (every reference village + cities + area labels), so
  // the map is full and geographic even when you only own a couple of villages.
  const allKeys=Object.keys(cfg.geo), owned=Object.keys(agg);
  const cities=cfg.cities||[], areas=cfg.areas||[];
  const pts=allKeys.map(k=>cfg.geo[k]).concat(cities.map(c=>[c[1],c[2]]), areas.map(a=>[a[1],a[2]]));
  const cos=Math.cos((cfg.lat||47)*Math.PI/180), pad=46, W=640, HMAX=540;
  let minx=Infinity,maxx=-Infinity,miny=Infinity,maxy=-Infinity;
  pts.forEach(([la,ln])=>{ const x=ln*cos; if(x<minx)minx=x; if(x>maxx)maxx=x; if(la<miny)miny=la; if(la>maxy)maxy=la; });
  const sx=(W-2*pad)/Math.max(0.0001,(maxx-minx));
  const latSpan=Math.max(0.0001,maxy-miny);
  const sy=Math.min(sx,(HMAX-2*pad)/latSpan);
  const H=Math.max(260,latSpan*sy+2*pad);
  const proj=([la,ln])=>[pad+(ln*cos-minx)*sx, (H-pad)-(la-miny)*sy];
  let parts=[];
  areas.forEach(([name,la,ln])=>{ const [x,y]=proj([la,ln]);
    const cx=Math.max(78,Math.min(W-78,x));
    parts.push(`<text class="sec" text-anchor="middle" x="${cx.toFixed(1)}" y="${y.toFixed(1)}">${esc(name)}</text>`); });
  cities.forEach(([name,la,ln])=>{ const [x,y]=proj([la,ln]);
    parts.push(`<text class="city" x="${(x+9).toFixed(1)}" y="${(y+3).toFixed(1)}">${esc(name)}</text>
      <path class="route" d="M ${(x-5).toFixed(1)} ${y.toFixed(1)} L ${(x+5).toFixed(1)} ${y.toFixed(1)} M ${x.toFixed(1)} ${(y-5).toFixed(1)} L ${x.toFixed(1)} ${(y+5).toFixed(1)}"/>`); });
  // faint reference dots for every village you DON'T own, for context
  allKeys.forEach(k=>{ if(agg[k]) return; const [x,y]=proj(cfg.geo[k]);
    parts.push(`<circle class="vref" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6"><title>${esc(titleCase(k))}</title></circle>`); });
  // owned villages: accent dots + labels, collision-nudged
  const entries=owned.map(k=>{ const a=agg[k], [x,y]=proj(cfg.geo[k]); return {a,x,y}; }).sort((p,q)=>q.a.b-p.a.b);
  const placedL=[], placedR=[];
  entries.forEach(({a,x,y})=>{
    const rad=4+Math.sqrt(a.b)*2.0;
    parts.push(`<circle class="dot" data-q="${esc(a.q)}" data-label="${esc(a.label)}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad.toFixed(1)}"/>`);
    const left=x>W*0.6, placed=left?placedL:placedR; let ly=y+4;
    while(placed.some(py=>Math.abs(py-ly)<11)) ly+=11;
    placed.push(ly);
    parts.push(`<text class="dlabel" text-anchor="${left?"end":"start"}" x="${(left?x-rad-5:x+rad+5).toFixed(1)}" y="${ly.toFixed(1)}">${esc(a.label)} · ${a.b}</text>`);
  });
  if(other) parts.push(`<text class="dsub" x="${pad}" y="${(H-12).toFixed(1)}">${esc(tr("+ {0} elsewhere ({1}…)", btl(other.b), other.q))}</text>`);
  svg.setAttribute("viewBox",`0 0 ${W} ${Math.round(H)}`);
  svg.innerHTML=parts.join("");
  bindDetailDots(svg);
}

function bindDetailDots(svg){
  svg.querySelectorAll(".dot").forEach(c=>{
    const q=c.dataset.q, label=c.dataset.label||q;
    bindDot(c, `<b>${esc(label)}</b><br><i>${esc(tr("click to filter the list"))}</i>`, ()=>{
      state.q = state.q===q ? "" : q;
      $("q").value = state.q; renderTable();
    });
  });
}

$("mapBack").addEventListener("click", ()=>{
  if(MAP_VIEW.startsWith("country:")) MAP_VIEW="europe";              // country → Europe
  else if(REGION_COUNTRY[MAP_VIEW]) MAP_VIEW="country:"+REGION_COUNTRY[MAP_VIEW]; // region → its country
  else MAP_VIEW="europe";
  renderMap();
});

// Highlight the region matching the active list filter (country view only —
// europe dots carry data-country, region drills carry data-q).
function syncMapActive(){
  document.querySelectorAll("#map .dot[data-region]").forEach(c=>
    c.classList.toggle("on", c.dataset.region===state.region && !!state.region));
}

/* ---------- tonight's bottle ---------- */
// Weight a wine for the Tonight pick: prefer bottles that are ready (and nudge the
// ones closing soon or past their peak up, so you drink them before they fade).
function tonightWeight(w){
  const r = readiness(w);
  const f = !r ? 1 : r.k==="past" ? 2.2 : (r.k==="now" && r.soon) ? 2.6 : r.k==="now" ? 1.6 : r.k==="young" ? 0.25 : 1;
  return w.left * f;
}
function pickTonight(){
  const pool = WINES.filter(w=>w.left>0);
  if(!pool.length){ toast(tr("The cellar is empty…")); return; }
  const total = pool.reduce((s,w)=>s+tonightWeight(w),0);
  let pick = pool[pool.length-1], r = Math.random()*total;
  for(const w of pool){ r -= tonightWeight(w); if(r<=0){ pick = w; break; } }
  const m = document.createElement("div");
  m.className = "modal open";
  m.innerHTML = `<div class="card" style="max-width:560px">
    <h2>${esc(tr("Tonight's bottle 🍷"))}</h2>
    <p style="margin:0 0 2px;font-size:16px"><b>${esc(pick.producer)}</b> · ${esc(pick.name)}${pick.vintage?" · "+esc(pick.vintage):""}</p>
    <p style="color:var(--muted);font-size:13px;margin:0 0 12px">${esc(pick.region)}${pick.commune&&pick.commune!==pick.name?" · "+esc(pick.commune):""}</p>
    ${detailHTML(pick)}
    <div class="mact">
      <button type="button" class="btn" data-x="again">🎲 ${esc(tr("Pick another"))}</button>
      <button type="button" class="btn primary" data-x="close">${esc(tr("Close"))}</button>
    </div></div>`;
  document.body.appendChild(m);
  m.addEventListener("click",e=>{ if(e.target===m) m.remove(); });
  m.querySelector('[data-x="close"]').addEventListener("click",()=>m.remove());
  m.querySelector('[data-x="again"]').addEventListener("click",()=>{ m.remove(); pickTonight(); });
  m.querySelectorAll("button.drink").forEach(db=>
    db.addEventListener("click", async ()=>{ await rowAction(db.dataset.act, Number(db.dataset.row), db); m.remove(); }));
  m.querySelectorAll("select.rate").forEach(sel=>
    sel.addEventListener("change",()=>rateWine(Number(sel.dataset.row), sel.value, sel)));
  m.querySelectorAll("select.setsize").forEach(sel=>
    sel.addEventListener("change",()=>setSizeApi(Number(sel.dataset.row), sel.value, sel)));
  m.querySelectorAll("input.setval").forEach(inp=>
    inp.addEventListener("change",()=>setValueApi(Number(inp.dataset.row), inp.value, inp)));
  m.querySelectorAll("input.setdate").forEach(inp=>
    inp.addEventListener("change",()=>setDateApi(Number(inp.dataset.row), inp.dataset.field, inp.value, inp)));
  m.querySelectorAll("input.setwin").forEach(inp=>
    inp.addEventListener("change",()=>setWindowApi(inp)));
}
$("tonightBtn").addEventListener("click", pickTonight);

/* ---------- journal ---------- */
let JENTRIES = null;
let J_EDIT = null;       // row number when editing an entry, else null (adding)
let J_PHOTO_REMOVE = false; // edit mode: user asked to drop the existing photo
const PHOTOS = {};       // file id -> data URL, cached once fetched

// Downscale + re-encode a chosen image to a compact JPEG data URL before upload.
function shrinkImage(file, maxEdge=1600, quality=0.82){
  return new Promise((resolve,reject)=>{
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = ()=>{
      URL.revokeObjectURL(url);
      let w=img.naturalWidth, h=img.naturalHeight;
      const scale = Math.min(1, maxEdge/Math.max(w,h||1));
      w=Math.max(1,Math.round(w*scale)); h=Math.max(1,Math.round(h*scale));
      const c=document.createElement("canvas"); c.width=w; c.height=h;
      c.getContext("2d").drawImage(img,0,0,w,h);
      try{ resolve(c.toDataURL("image/jpeg", quality)); }
      catch(err){ reject(err); }
    };
    img.onerror = ()=>{ URL.revokeObjectURL(url); reject(new Error("bad image")); };
    img.src = url;
  });
}

const PHOTO_PENDING = {};   // id -> in-flight promise, so re-renders don't refetch
async function loadPhoto(id){
  if(PHOTOS[id]) return PHOTOS[id];
  if(PHOTO_PENDING[id]) return PHOTO_PENDING[id];
  PHOTO_PENDING[id] = (async()=>{
    try{ const res = await api({action:"photo", id}); PHOTOS[id] = res.photo; return res.photo; }
    finally{ delete PHOTO_PENDING[id]; }
  })();
  return PHOTO_PENDING[id];
}

function openPhotoLightbox(src){
  const m=document.createElement("div");
  m.className="jlightbox";
  m.innerHTML=`<img src="${src}" alt="Tasting photo">`;
  m.addEventListener("click",()=>m.remove());
  document.body.appendChild(m);
}

async function loadJournal(force){
  if(JENTRIES && !force){ renderJournal(); return; }
  $("jSpin").hidden = false; $("jList").innerHTML = "";
  try{
    const res = await api({action:"journal"});
    JENTRIES = res.entries || [];
    renderJournal();
  }catch(err){
    if(AUTH_ERRORS.has(err.message)){ forgetAuth(); setGateMode("login"); showGate(tr("Your session expired — log in again.")); }
    else $("jList").innerHTML = `<div class="spin">${esc(tr("Could not load the journal ({0}). The Apps Script may need the latest redeploy.", errText(err)))}</div>`;
  }
  $("jSpin").hidden = true;
}

function renderJournal(){
  const list = [...(JENTRIES||[])].sort((a,b)=>String(b.date).localeCompare(String(a.date)) || b.row-a.row);
  $("jCount").textContent = list.length ? (list.length===1 ? tr("1 entry") : tr("{0} entries", list.length)) : "";
  $("jList").innerHTML = list.length ? list.map(e=>{
    const d = e.date ? new Date(String(e.date).slice(0,10)+"T12:00:00") : null;
    const ds = d && !isNaN(d) ? d.toLocaleDateString(I18N_LOCALE(),{day:"numeric",month:"long",year:"numeric"}) : esc(String(e.date));
    const n = Math.max(0, Math.min(10, Number(e.rating)||0));
    const glasses = n ? n+"/10 🍷" : "";
    const price = (SHOW_PRICES && e.price!=="" && e.price!=null && Number(e.price)>0)
      ? `<span class="jprice">${kr(Number(e.price))}</span>` : "";
    const photo = e.photo ? `<div class="jphoto" data-id="${esc(String(e.photo))}"><span class="jphoto-ph">📷</span></div>` : "";
    return `<div class="jentry">
      <div class="jtop"><span class="jdate">${ds}</span>
        ${e.place?`<span class="jplace">📍 ${esc(e.place)}</span>`:""}
        <button class="jedit" data-row="${e.row}" title="${esc(tr("Edit entry"))}">✏️</button>
        <button class="jdel" data-row="${e.row}" title="${esc(tr("Delete entry"))}">🗑</button></div>
      <div class="jwine">${esc(e.producer)}${e.wine?" · "+esc(e.wine):""}${e.vintage?" · "+esc(e.vintage):""}${classChip(e)}
        ${glasses?`<span class="jglasses">${glasses}</span>`:""}${price}</div>
      ${(e.commune||e.region||e.country||e.grape)?`<div class="jmeta">${[e.commune,e.region,e.country,e.grape].filter(Boolean).map(esc).join(" · ")}</div>`:""}
      ${e.note?`<div class="jnote">${esc(e.note)}</div>`:""}
      ${photo}
    </div>`;
  }).join("") : `<div class="spin">${esc(tr("No entries yet — press “＋ New entry” after your next good bottle."))}</div>`;
  document.querySelectorAll(".jphoto[data-id]").forEach(el=>{
    const id = el.dataset.id;
    loadPhoto(id).then(src=>{
      el.innerHTML = `<img src="${src}" alt="${esc(tr("Tasting photo"))}" loading="lazy">`;
      el.classList.add("ready");
      el.addEventListener("click",()=>openPhotoLightbox(src));
    }).catch(()=>{ el.innerHTML = `<span class="jphoto-ph err">${esc(tr("photo unavailable"))}</span>`; });
  });
  document.querySelectorAll(".jedit").forEach(b=>b.addEventListener("click",()=>{
    const e = (JENTRIES||[]).find(x=>x.row===Number(b.dataset.row));
    if(e) openJournalEdit(e);
  }));
  document.querySelectorAll(".jdel").forEach(b=>b.addEventListener("click", async ()=>{
    if(!(await ask(tr("Delete this journal entry?"), {ok:tr("Delete"), danger:true}))) return;
    const e = (JENTRIES||[]).find(x=>x.row===Number(b.dataset.row));
    const t = e ? enjoyTarget(e) : null; // looked up before the delete
    try{
      const res = await api({action:"jdelete", row:Number(b.dataset.row)});
      JENTRIES = res.entries || []; renderJournal(); toast(tr("Entry deleted"));
    }catch(err){ toast(tr("Could not delete: {0}", errText(err))); return; }
    // the entry put a wine in Enjoyed: ask whether that goes too
    if(t && t.kind==="logged"){
      const nm = `${t.wine.producer}${t.wine.name?" "+t.wine.name:""}${t.wine.vintage?" "+t.wine.vintage:""}`;
      const q = t.elsewhere ? tr("Also remove {0} from Enjoyed?", nm) : tr("Also put the bottle of {0} back in your cellar (undo the drink)?", nm);
      if(!(await ask(q, {ok:tr("Yes"), cancel:tr("No")}))) return;
      try{
        const r2 = await api({action: t.elsewhere ? "delete" : "undrink", row:t.wine.row, qty:1});
        WINES = normalize(r2.wines); KEEP_OPEN = null; renderOverview(); renderTable(); renderEnjoyed();
        toast(t.elsewhere ? tr("Removed from Enjoyed") : tr("Bottle back in the cellar 🍾"));
      }catch(err){ toast(tr("Could not update Enjoyed: {0}", errText(err))); }
    }
  }));
}

/* A journaled wine has been enjoyed — but how it lands in Enjoyed depends on
   whether it's one of ours. Own it → drink one of those bottles (no phantom
   duplicate row); don't own it → append a standalone enjoyed row. Rows that
   enjoyAdd() created are recognisable (qty 1, drunk 1, drunk date = the entry's
   date), so re-saving an entry can't add it twice. */
const jKey = s => String(s==null?"":s).trim().toLowerCase().replace(/\s+/g," ");
function enjoyTarget(entry){
  const date = String(entry.date||"").slice(0,10);
  const same = w => jKey(w.producer)===jKey(entry.producer)
                 && jKey(w.name)===jKey(entry.wine)
                 && jKey(w.vintage)===jKey(entry.vintage);
  // Already in Enjoyed: a row drunk on the entry's date — a bottle marked drunk from the cellar (any number of
  // bottles in the row), or the row an earlier save created. Saving again must not drink a second bottle.
  const logged = WINES.find(w=>same(w) && w.drunk>0 && w.drunkDate===date);
  if(logged) return {kind:"logged", wine:logged, elsewhere:isElsewhere(logged)};
  const owned = WINES.find(w=>same(w) && w.left>0);
  if(owned) return {kind:"cellar", wine:owned};
  return {kind:"new"};
}

/* Keep the Enjoyed checkbox and the price hint honest about what saving will do. */
function syncEnjoyOption(){
  const v = id => $(id).value.trim();
  const t = enjoyTarget({producer:v("jProducer"), wine:v("jWine"), vintage:v("jVintage"), date:v("jDate")});
  const done = t.kind==="logged";
  $("jEnjoyWrap").hidden = done;
  $("jEnjoyDone").hidden = !done;
  if(done) $("jEnjoyDoneHint").textContent = t.elsewhere ? tr("— as a wine drunk elsewhere") : tr("— a bottle from your cellar, marked drunk that day");
  if(done) $("jEnjoy").checked = false;
  else if(t.kind==="cellar"){
    const left = t.wine.left;
    $("jEnjoyLabel").innerHTML = esc(tr("Also mark a bottle as {0}", "\u0001")).replace("\u0001", `<b>${esc(tr("drunk"))}</b>`);
    $("jEnjoyHint").textContent = left===1 ? tr("— you own 1 bottle; this moves it to Enjoyed") : tr("— you own {0} bottles; this moves one to Enjoyed", left);
  }else{
    $("jEnjoyLabel").innerHTML = esc(tr("Also add to {0}", "\u0001")).replace("\u0001", `<b>${esc(tr("Enjoyed"))}</b>`);
    $("jEnjoyHint").textContent = tr("— for a wine you drank but don't own");
  }
  // A bottle we bought keeps its purchase price — a journal price is what it cost
  // that night, which may be a restaurant's. A row the journal itself created has
  // no other source, so there the journal stays authoritative.
  $("jPriceOpt").textContent =
  tr(done && !t.elsewhere ? (Number(t.wine.price) > 0 ? "(optional — kept here; your cellar's own price is left alone)" : "(optional — also fills the blank price on your cellar row)")
    : done ? "(optional — also saved onto its Enjoyed row)"
    : t.kind!=="cellar" ? "(optional — what the bottle cost)"
    : Number(t.wine.price) > 0 ? "(optional — kept here; your cellar's own price is left alone)"
    : "(optional — also fills the blank price on your cellar row)");
}
["jProducer","jWine","jVintage","jDate"].forEach(id=>
  $(id).addEventListener("input", syncEnjoyOption));

/* ---------- autofill: a wine you've had before fills in what you told the app last time ---------- */
// Looked up by producer + wine name among the cellar's rows (newest first), then the journal. Only empty
// fields are filled, and the form says which, so nothing you've typed is overwritten.
function knownWine(producer, wine){
  const p = jKey(producer), n = jKey(wine); if(!p || !n) return null;
  const w = [...WINES].sort((a,b)=>b.row-a.row).find(x=>jKey(x.producer)===p && jKey(x.name)===n);
  if(w) return {from:tr("your {0}", `${w.name}${w.vintage?" "+w.vintage:""}`), country:w.country, region:w.region, commune:w.commune, grape:w.grape,
    classification:w.classification, type:({"Rød":"Rød","Hvid":"Hvid","Rosé":"Rose","Bobler":"Bobler"})[w.style]||""};
  const e = [...(JENTRIES||[])].sort((a,b)=>String(b.date).localeCompare(String(a.date))).find(x=>jKey(x.producer)===p && jKey(x.wine)===n);
  if(e) return {from:tr("your journal entry of {0}", fmtDate(e.date)), country:e.country, region:e.region, commune:e.commune, grape:e.grape, classification:e.classification};
  return null;
}
/* ---------- the atlas fills in what it knows: a vineyard or village named in the wine ("Clos St-Jacques",
   "Meursault Perrières", "Gevrey-Chambertin") gives the commune, region, country and, where the atlas has it, the
   classification. From atlas-index.js (every named vineyard, ~40 KB), fetched the first time a wine is typed. ---------- */
const ATLAS_REG = {burgundy:"Bourgogne", chablis:"Bourgogne", chalonnaise:"Bourgogne", maconnais:"Bourgogne", beaujolais:"Beaujolais",
  champagne:"Champagne", alsace:"Alsace", rhone:"Rhône", rhonesud:"Rhône", bordeaux:"Bordeaux", centreloire:"Loire", touraine:"Loire", anjou:"Loire",
  mosel:"Mosel", nahe:"Nahe", pfalz:"Pfalz", rheinhessen:"Rheinhessen", mittelrhein:"Mittelrhein", ahr:"Ahr", barolo:"Piemonte", barbaresco:"Piemonte"};
const ATLAS_COUNTRY = r => /^(barolo|barbaresco)$/.test(r) ? "Italien" : /^(mosel|nahe|pfalz|rheinhessen|mittelrhein|ahr)$/.test(r) ? "Tyskland" : "Frankrig";
const ATLAS_CLS = {"1er":"1. cru", "GC":"Grand cru", "1855-1":"Cru classé", "1855-2":"Cru classé", "1855-3":"Cru classé", "1855-4":"Cru classé", "1855-5":"Cru classé"};
// the same words however they're written: no accents or hyphens, "St" as "Saint"
const aKey = t => " " + String(t||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[-'’.,/()]/g," ")
  .replace(/\bste\b/g,"sainte").replace(/\bst\b/g,"saint").replace(/\s+/g," ").trim() + " ";
let AIX = null, AIX_LOADING = false;
function atlasIndex(then){
  if(AIX) return AIX;
  if(window.ATLAS_INDEX){
    const ARTICLE = /^ (les?|la|l|aux?|en|du|des) /;
    // a Barolo or Barbaresco MGA is listed as "Barolo Brunate": "Brunate" alone finds it too
    AIX = {v: window.ATLAS_INDEX.filter(e=>ATLAS_REG[e[1]]).map(e=>{ const k = aKey(e[0]); const core = k.replace(ARTICLE, " ").replace(/^ (barolo|barbaresco) /, " ");
      return {e, k, core: core.length >= 8 ? core : null}; }), communes: new Map()};
    AIX.v.forEach(x=>{ const c = aKey(x.e[4]); if(c.length > 4 && !AIX.communes.has(c)) AIX.communes.set(c, {name:x.e[4], reg:x.e[1]}); });
    return AIX;
  }
  if(!AIX_LOADING){ AIX_LOADING = true; const sc = document.createElement("script"); sc.src = "atlas-index.js?v=1"; sc.onload = then; document.head.appendChild(sc); }
  return null;
}
function atlasWine(wine, commune){
  const W = aKey(wine); if(W.length < 6) return null;
  const ix = atlasIndex(); if(!ix) return null;
  // the village named in the wine (the longest), or the one in the Commune field
  let vil = null; for(const [k, v] of ix.communes) if(W.includes(k) && (!vil || k.length > vil.k.length)) vil = {k, ...v};
  const cf = aKey(commune); if(cf.length > 4 && ix.communes.has(cf)) vil = {k:cf, ...ix.communes.get(cf)};
  const inVillage = k => vil && vil.k.includes(k) && W.includes(vil.k); // "Chambertin" inside "Gevrey-Chambertin" is the village, not the grand cru
  let best = [], len = 0;
  ix.v.forEach(x=>{ for(const k of [x.k, x.core]) if(k && W.includes(k) && !inVillage(k)){
    if(k.length > len){ best = [x]; len = k.length; } else if(k.length === len && !best.includes(x)) best.push(x); break; } });
  // "Meursault Perrières": of the Perrières, the one in Meursault
  if(vil && best.some(x=>aKey(x.e[4]) === vil.k)) best = best.filter(x=>aKey(x.e[4]) === vil.k);
  const same = f => best.length && best.every(x=>f(x) === f(best[0])) ? f(best[0]) : null;
  if(best.length){
    const reg = same(x=>ATLAS_REG[x.e[1]]), key = best[0].e[1];
    return {via: best.length === 1 ? best[0].e[0] : null, commune: same(x=>x.e[4]), region: reg, country: reg ? ATLAS_COUNTRY(key) : null,
      classification: same(x=>ATLAS_CLS[x.e[3]] || ""), grape: /^(barolo|barbaresco)$/.test(key) && reg ? "Nebbiolo" : null};
  }
  // "Barolo" on a label is the appellation more often than the village: region and grape, not the commune
  return vil ? {via: vil.name, commune: /^ (barolo|barbaresco) $/.test(vil.k) ? null : vil.name, region: ATLAS_REG[vil.reg], country: ATLAS_COUNTRY(vil.reg), classification: null,
    grape: /^(barolo|barbaresco)$/.test(vil.reg) ? "Nebbiolo" : null} : null;
}
// the wine names you've used for a producer, for the Wine field's suggestions
function wineNamesFor(producer){
  const p = jKey(producer); if(!p) return [];
  return [...new Set([...WINES.filter(w=>jKey(w.producer)===p).map(w=>w.name), ...(JENTRIES||[]).filter(e=>jKey(e.producer)===p).map(e=>e.wine)]
    .map(x=>String(x||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"fr"));
}
// ids: {producer, wine, country, region, commune, grape, class, type?, note}
function autofill(ids){
  let k = knownWine($(ids.producer).value, $(ids.wine).value); const filled = [];
  if(!k){ const a = atlasWine($(ids.wine).value, $(ids.commune).value);
    if(a) k = {...a, from: a.via ? tr("the atlas ({0})", a.via) : tr("the atlas")}; else if(!AIX) atlasIndex(()=>autofill(ids)); }
  if(k){
    [["country","Country"],["region","Region"],["commune","Commune"],["grape","Grape"]].forEach(([f, lbl])=>{
      const el = $(ids[f]); if(el && !el.value.trim() && k[f]){ el.value = k[f]; filled.push(tr(lbl.toLowerCase())); }
    });
    const cs = $(ids.class);
    if(cs && k.classification && (!cs.value || cs.dataset.auto==="1")){ cs.value = matchOpt(cs, k.classification); cs.dataset.auto = ""; filled.push(tr("classification")); }
    if(ids.type && k.type && $(ids.type).dataset.touched!=="1"){ $(ids.type).value = k.type; }
  }
  const nt = $(ids.note);
  if(nt){ nt.hidden = !filled.length; nt.textContent = filled.length ? tr("Filled in {0} from {1}.", filled.join(", "), k.from) : ""; }
  classHint(ids);
}
// The classification list for a country: France's AOC / Premier cru / Grand cru (and Bordeaux's crus), Germany's
// Prädikat and VDP levels, Italy's and Spain's own; "Other…" takes anything else as text. A value a wine already has
// stays selectable (Special club, Cru classé…).
function classOptions(country, region){
  const c = normName(country||""), r = normName(region||"");
  if(/^(tyskland|germany|allemagne|deutschland)$/.test(c) || /mosel|rheingau|nahe|pfalz|rheinhessen|franken|baden/.test(r))
    return ["Kabinett","Spätlese","Auslese","Beerenauslese","Trockenbeerenauslese","Eiswein","Grosses Gewächs","Erste Lage"];
  if(/^(ostrig|austria|autriche|osterreich)$/.test(c) || /wachau|kamptal|kremstal|burgenland/.test(r))
    return ["Smaragd","Federspiel","Steinfeder","Erste Lage","Grosse Lage","Kabinett","Spätlese","Auslese","Beerenauslese","Trockenbeerenauslese","Eiswein"];
  if(/^(italien|italy|italie)$/.test(c) || /piemonte|toscana|veneto|sicilia/.test(r)) return ["DOCG","DOC","Riserva","IGT"];
  if(/^(spanien|spain|espagne)$/.test(c) || /rioja|ribera|priorat/.test(r)) return ["DOCa","DO","Crianza","Reserva","Gran Reserva"];
  if(/^(portugal)$/.test(c) || /douro|porto/.test(r)) return ["DOC","Reserva","Vintage","LBV"];
  const fr = ["AOC","1. cru","Grand cru"];
  return /bordeaux/.test(r) ? fr.concat(["Cru classé","Cru bourgeois"]) : fr;
}
const CLS_LABEL = {"1. cru": "Premier cru"};
function fillClassSelect(sel){
  const keep = sel.value === "__other" ? "" : sel.value, country = $(sel.dataset.country), region = $(sel.dataset.region);
  const opts = classOptions(country && country.value, region && region.value);
  sel.innerHTML = `<option value="">—</option>` + opts.map(o=>`<option value="${esc(o)}">${esc(CLS_LABEL[o] ? tr(CLS_LABEL[o]) : o)}</option>`).join("")
    + `<option value="__other">${esc(tr("Other…"))}</option>`;
  if(keep) sel.value = matchOpt(sel, keep, true);
  otherBox(sel, true);
}
// the text field for "Other…", right under the list
function otherBox(sel, quiet){
  let box = sel.parentNode.querySelector(".clsother");
  if(sel.value !== "__other"){ if(box) box.hidden = true; return; }
  if(!box){ box = document.createElement("input"); box.className = "clsother"; box.setAttribute("aria-label", tr("Classification"));
    box.placeholder = tr("Type the classification"); sel.after(box); }
  box.hidden = false; if(!quiet) box.focus();
}
// what a classification list holds: the option, or the text typed under "Other…"
function clsValue(id){
  const sel = $(id); if(sel.value !== "__other") return sel.value;
  const box = sel.parentNode.querySelector(".clsother"); return box ? box.value.trim() : "";
}
document.querySelectorAll("select[data-country]").forEach(sel=>{
  fillClassSelect(sel);
  sel.addEventListener("change", ()=>{ sel.dataset.auto = ""; otherBox(sel); });
  [sel.dataset.country, sel.dataset.region].forEach(id=>{ const el = $(id); if(el) el.addEventListener("change", ()=>fillClassSelect(sel)); });
});
// Quick picks under Country and Location: the usual countries and your own, the places you use most
const QP_COUNTRIES = ["Frankrig","Italien","Spanien","Tyskland","Østrig","Portugal"];
function renderQuickPicks(){
  const byCount = key => { const m = new Map(); WINES.forEach(w=>{ const v = String(w[key]||"").trim(); if(v) m.set(v, (m.get(v)||0) + 1); });
    return [...m.entries()].sort((a,b)=>b[1]-a[1]).map(x=>x[0]); };
  const countries = [...new Set([...QP_COUNTRIES, ...byCount("country")])].slice(0, 8), places = byCount("location").slice(0, 6);
  document.querySelectorAll(".qpick").forEach(box=>{
    const list = box.dataset.kind === "country" ? countries : places, inp = $(box.dataset.for);
    box.innerHTML = list.map(v=>`<button type="button">${esc(v)}</button>`).join("");
    const mark = ()=>box.querySelectorAll("button").forEach(b=>b.classList.toggle("on", b.textContent===inp.value.trim()));
    box.querySelectorAll("button").forEach(b=>b.addEventListener("click", ()=>{
      inp.value = b.textContent; inp.dispatchEvent(new Event("input", {bubbles:true})); inp.dispatchEvent(new Event("change", {bubbles:true})); mark(); }));
    if(!inp.dataset.qp){ inp.dataset.qp = "1"; inp.addEventListener("input", ()=>{ const q = inp.parentNode.querySelector(".qpick"); if(q) q.querySelectorAll("button").forEach(b=>b.classList.toggle("on", b.textContent===inp.value.trim())); }); }
    mark();
  });
}

// pick the select option that means the same classification ("1er Cru" in a sheet → "1. cru")
function matchOpt(sel, val, filled){
  // a classification list redraws for the form's country first (it may have been filled in just now)
  if(!filled && sel.dataset.country){ sel.value = ""; fillClassSelect(sel); }
  const k = clsKey(val), o = [...sel.options].find(o=>o.value && o.value !== "__other" && clsKey(o.value)===k);
  if(o) return o.value;
  const extra = document.createElement("option"); extra.value = extra.textContent = String(val).trim(); sel.appendChild(extra); return extra.value;
}
// the suggested classification, shown next to the label and pre-selected until you pick one yourself
function classHint(ids){
  const cs = $(ids.class), hint = $(ids.class+"Hint"); if(!cs) return;
  const sg = suggestClass({name:$(ids.wine).value, commune:$(ids.commune).value, region:$(ids.region).value});
  if(hint) hint.textContent = sg ? tr("(suggested: {0})", sg.cls+(sg.climat?" — "+sg.climat:"")) : "";
  if(sg && (!cs.value || cs.dataset.auto==="1")){ cs.value = matchOpt(cs, sg.cls); cs.dataset.auto = "1"; }
  else if(!sg && cs.dataset.auto==="1"){ cs.value = ""; cs.dataset.auto = ""; }
}
function wireAutofill(ids){
  const prod = $(ids.producer), wine = $(ids.wine);
  const names = () => { $("jWines").innerHTML = wineNamesFor(prod.value).map(x=>`<option>${esc(x)}</option>`).join(""); };
  prod.addEventListener("input", ()=>{ names(); autofill(ids); });
  prod.addEventListener("focus", names); wine.addEventListener("focus", names);
  wine.addEventListener("input", ()=>autofill(ids));
  [ids.commune, ids.region].forEach(id=>$(id).addEventListener("input", ()=>classHint(ids)));
  $(ids.class).addEventListener("change", ()=>{ $(ids.class).dataset.auto = ""; });
  if(ids.type) $(ids.type).addEventListener("change", ()=>{ $(ids.type).dataset.touched = "1"; });
}
const J_IDS = {producer:"jProducer", wine:"jWine", country:"jCountry", region:"jRegion", commune:"jCommune", grape:"jGrape", class:"jClass", note:"jFillNote"};
const EA_IDS = {producer:"eaProducer", wine:"eaWine", country:"eaCountry", region:"eaRegion", commune:"eaCommune", grape:"eaGrape", class:"eaClass", type:"eaType", note:"eaFillNote"};
wireAutofill(J_IDS); wireAutofill(EA_IDS);

/* ---------- suggestions on a phone: a browser's own list for an <input list> is a strip above the keyboard at best,
   and matches only from the start of a name. On a touch screen each such field gets its own list instead: under it,
   in the page, up to six names that contain what's typed (accents and case aside: "fevre" finds "William Fèvre"),
   a tap fills it in as if typed. Set up on a field's first focus, so the grid's later rows get it too. ---------- */
const TOUCH = window.matchMedia && matchMedia("(pointer: coarse)").matches;
const sfold = s => String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
function touchList(inp){
  if(inp.dataset.tl) return; inp.dataset.tl = inp.getAttribute("list"); inp.removeAttribute("list"); // the browser's own off
  const ul = document.createElement("ul"); ul.className = "tlist"; ul.id = (inp.id || "f" + Math.random().toString(36).slice(2)) + "-tl";
  ul.setAttribute("role", "listbox"); ul.hidden = true; inp.after(ul);
  inp.setAttribute("aria-autocomplete", "list"); inp.setAttribute("aria-controls", ul.id); inp.setAttribute("aria-expanded", "false"); inp.setAttribute("autocomplete", "off");
  const hide = () => { ul.hidden = true; inp.setAttribute("aria-expanded", "false"); };
  const show = () => {
    const q = sfold(inp.value.trim()), dl = document.getElementById(inp.dataset.tl);
    if(!q || !dl){ hide(); return; }
    const seen = new Set(), hits = [];
    for(const o of dl.options){ const v = o.value; if(!v || seen.has(v)) continue; seen.add(v); const f = sfold(v), i = f.indexOf(q);
      if(i >= 0 && f !== q) hits.push([i === 0 ? 0 : /[\s'’-]/.test(f[i-1]) ? 1 : 2, v]); } // the start of the name, then of a word, then anywhere
    hits.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1], "fr"));
    if(!hits.length){ hide(); return; }
    ul.innerHTML = hits.slice(0, 6).map(([, v]) => `<li role="option" tabindex="-1">${esc(v)}</li>`).join("");
    ul.hidden = false; inp.setAttribute("aria-expanded", "true");
  };
  inp.addEventListener("input", e => { if(!e.isTrusted && e.detail === "tl") return; show(); });
  inp.addEventListener("focus", show);
  inp.addEventListener("blur", () => setTimeout(hide, 150));
  inp.addEventListener("keydown", e => { if(e.key === "Escape") hide(); });
  // pointerdown, not click: the field keeps its focus (and the keyboard stays up) while a name is picked
  ul.addEventListener("pointerdown", e => { const li = e.target.closest("li"); if(!li) return; e.preventDefault();
    inp.value = li.textContent; hide();
    inp.dispatchEvent(new CustomEvent("input", { bubbles: true, detail: "tl" })); inp.dispatchEvent(new Event("change", { bubbles: true })); });
}
if(TOUCH){
  document.querySelectorAll("input[list]").forEach(touchList);
  document.addEventListener("focusin", e => { if(e.target.matches && e.target.matches("input[list]")) touchList(e.target); });
}

/* ---------- Add form: suggestions from where the wine is from ---------- */
// A red Burgundy is Pinot Noir, a white one Chardonnay (Bourgogne Aligoté and Bouzeron aside), Mosel is Riesling:
// once the name, commune or region says where a wine is from, the empty fields are filled in from the appellation
// (wine-kb.js) and the atlas's climats (burgundy-match.js), and marked as suggested. A suggested field keeps
// following what you type elsewhere until you type in it yourself; nothing you typed is overwritten.
const ADD_IDS = {producer:"aProducer", wine:"aName", country:"aCountry", region:"aRegion", commune:"aCommune", grape:"aGrape", class:"aClass", type:"aType", note:"aFillNote"};
wireAutofill(ADD_IDS);
// one for each form that adds a wine: the cellar's (aName…) and Enjoyed's (eaWine…)
function makeSuggest(I, noteId){
  const SG = [["commune",I.commune],["region",I.region],["country",I.country],["grape",I.grape]];
  const free = id => !$(id).value.trim() || $(id).dataset.sg==="1";
  function run(){
    if(!window.WINE_KB) return;
    const g = id => free(id) ? "" : $(id).value.trim(), ty = $(I.type);
    const name = $(I.wine).value.trim(), commune = g(I.commune);
    // the atlas's vineyards only for what could be a Burgundy
    const reg = g(I.region), burg = !reg || /bourgogne|burgund|bourgogne|cote d.?or|chablis/i.test(WINE_KB.norm(reg));
    const pl = burg && window.BURG_MATCH && BURG_MATCH.place ? BURG_MATCH.place({name, commune}) : null;
    const sg = WINE_KB.suggest({name, commune, region:g(I.region), grape:g(I.grape), type:ty.value, typeSet:ty.dataset.touched==="1", place:pl});
    if(pl && pl.commune && !commune) sg.commune = pl.commune;
    const said = [];
    for(const [f, id] of SG){
      const el = $(id); if(!free(id)) { el.classList.remove("sg"); continue; }
      if(sg[f]){ el.value = sg[f]; el.dataset.sg = "1"; el.classList.add("sg"); if(el.value!==el.defaultValue) said.push(f); }
      else if(el.dataset.sg==="1"){ el.value = el.defaultValue; el.dataset.sg = el.defaultValue ? "1" : ""; el.classList.remove("sg"); }
    }
    if(ty.dataset.touched!=="1"){
      ty.value = sg.type || "Rød"; ty.classList.toggle("sg", !!sg.type);
      if(sg.type) said.push("colour");
    }
    const mg = !pl && mgaOf({name, commune, region:g(I.region), classification:""});
    const from = pl ? pl.climat : mg ? tr("{0} (an MGA)", mg.label) : sg.app, nt = $(noteId);
    nt.hidden = !said.length || !from;
    if(!nt.hidden){
      const L = {commune:tr("commune"), region:tr("region"), country:tr("country"), grape:tr("grape"), colour:tr("colour")};
      nt.textContent = tr("Suggested from {0}: {1}. Change anything that's wrong.").replace("{0}", from).replace("{1}", said.map(f=>L[f]).join(", "));
    }
    classHint(I);
  }
  // a field you've typed in is yours (and one a prefill set); the rest follow
  function reset(){ SG.forEach(([, id])=>{ $(id).dataset.sg = $(id).defaultValue ? "1" : ""; $(id).classList.remove("sg"); }); $(I.type).classList.remove("sg"); $(noteId).hidden = true; }
  SG.forEach(([, id])=>$(id).addEventListener("input", ()=>{ $(id).dataset.sg = ""; $(id).classList.remove("sg"); }));
  [I.wine, I.commune, I.region, I.grape, I.producer].forEach(id=>$(id).addEventListener("input", run));
  $(I.type).addEventListener("change", ()=>{ $(I.type).classList.remove("sg"); run(); });
  return {run, reset};
}
const ADD_SUGGEST = makeSuggest(ADD_IDS, "aSuggest"), EA_SUGGEST = makeSuggest(EA_IDS, "eaSuggest");
const addSuggest = () => ADD_SUGGEST.run();
function addProducers(){
  $("jProducers").innerHTML = [...new Set(WINES.map(w=>w.producer).filter(Boolean))].sort().map(x=>`<option>${esc(x)}</option>`).join("");
}
function addReset(){
  $("addForm").reset(); $("aQty").value = 1;
  ADD_SUGGEST.reset();
  $("aType").dataset.touched = ""; $("aClass").dataset.auto = "1";
  $("aFillNote").hidden = true; $("aClassHint").textContent = "";
}
addReset();
function fillCommunes(){
  const B = window.BURG ? window.BURG.villages.flatMap(v=>v.n.split(" · ")) : [];
  $("communesList").innerHTML = [...new Set([...WINES.map(w=>w.commune), ...(JENTRIES||[]).map(e=>e.commune), ...B].map(x=>String(x||"").trim()).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,"fr")).map(x=>`<option>${esc(x)}</option>`).join("");
}

function prepJournalModal(){
  $("jForm").reset();
  $("jClass").dataset.auto = ""; $("jFillNote").hidden = true; $("jClassHint").textContent = "";
  fillCommunes();
  $("jEnjoyDone").hidden = true;
  J_PHOTO_REMOVE = false;
  $("jErr").hidden = true; $("jErr").textContent = "";
  $("jPhotoPrev").hidden = true; $("jPhotoPrev").removeAttribute("src");
  $("jPhotoRemoveBtn").hidden = true;
  $("jProducers").innerHTML = [...new Set(WINES.map(w=>w.producer).filter(Boolean))].sort().map(x=>`<option>${esc(x)}</option>`).join("");
  $("jPlaces").innerHTML = [...new Set((JENTRIES||[]).map(e=>e.place).filter(Boolean))].sort().map(x=>`<option>${esc(x)}</option>`).join("");
  $("jModal").classList.add("open");
}

let J_ORIG = null; // the entry as it was before an edit, to find the Enjoyed row it made
function openJournalModal(prefill){
  J_EDIT = null; J_ORIG = null;
  prepJournalModal();
  trSet("New journal entry", $("jTitle"));
  $("jSave").textContent = tr("Save entry");
  $("jEnjoyWrap").hidden = false;
  $("jEnjoy").checked = true; // journaling a wine means you drank it
  $("jDate").value = todayStr();
  if(prefill){
    $("jProducer").value = prefill.producer || "";
    $("jWine").value = prefill.wine || "";
    $("jVintage").value = prefill.vintage || "";
    $("jCountry").value = prefill.country || "";
    $("jRegion").value = prefill.region || "";
    $("jGrape").value = prefill.grape || "";
    $("jCommune").value = prefill.commune || "";
    if(prefill.classification) $("jClass").value = matchOpt($("jClass"), prefill.classification);
  }
  classHint(J_IDS);
  syncEnjoyOption();
  setTimeout(()=>$(prefill?"jPlace":"jProducer").focus(), 40);
}

function openJournalEdit(e){
  J_EDIT = e.row; J_ORIG = {...e};
  prepJournalModal();
  trSet("Edit journal entry", $("jTitle"));
  $("jSave").textContent = tr("Save changes");
  $("jEnjoyWrap").hidden = false;
  // An old entry was most likely dealt with when it was written: editing it shouldn't drink another bottle
  // unless you tick the box (it's hidden altogether once the entry is in Enjoyed).
  $("jEnjoy").checked = false;
  $("jDate").value = String(e.date||"").slice(0,10) || todayStr();
  $("jProducer").value = e.producer || "";
  $("jWine").value = e.wine || "";
  $("jVintage").value = e.vintage!==""&&e.vintage!=null ? e.vintage : "";
  $("jCountry").value = e.country || "";
  $("jRegion").value = e.region || "";
  $("jGrape").value = e.grape || "";
  $("jCommune").value = e.commune || "";
  if(e.classification) $("jClass").value = matchOpt($("jClass"), e.classification);
  $("jPlace").value = e.place || "";
  $("jRating").value = e.rating ? String(e.rating) : "";
  $("jPrice").value = (e.price===""||e.price==null) ? "" : e.price;
  $("jNote").value = e.note || "";
  if(e.photo){
    $("jPhotoRemoveBtn").hidden = false;
    loadPhoto(e.photo).then(src=>{ if(J_EDIT===e.row && !J_PHOTO_REMOVE && !$("jPhoto").files[0]){
      $("jPhotoPrev").src = src; $("jPhotoPrev").hidden = false; } }).catch(()=>{});
  }
  classHint(J_IDS);
  syncEnjoyOption();
  setTimeout(()=>$("jNote").focus(), 40);
}

$("jAddBtn").addEventListener("click", ()=>openJournalModal(null));
$("jPhoto").addEventListener("change", ()=>{
  const f = $("jPhoto").files[0], prev = $("jPhotoPrev");
  if(f){ J_PHOTO_REMOVE = false; prev.src = URL.createObjectURL(f); prev.hidden = false; }
  else { prev.hidden = true; prev.removeAttribute("src"); }
});
$("jPhotoRemoveBtn").addEventListener("click", ()=>{
  J_PHOTO_REMOVE = true;
  $("jPhoto").value = "";
  $("jPhotoPrev").hidden = true; $("jPhotoPrev").removeAttribute("src");
  $("jPhotoRemoveBtn").hidden = true;
});
$("jCancel").addEventListener("click", ()=>$("jModal").classList.remove("open"));
$("jModal").addEventListener("click", e=>{ if(e.target===$("jModal")) $("jModal").classList.remove("open"); });
$("jForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const editing = J_EDIT !== null;
  $("jErr").hidden = true; $("jErr").textContent = "";
  const btn = $("jSave"); btn.disabled = true; btn.textContent = tr("Saving…");
  const v = id => $(id).value.trim();
  const entry = {
    date: v("jDate"), producer: v("jProducer"), wine: v("jWine"),
    vintage: /^\d{4}$/.test(v("jVintage")) ? Number(v("jVintage")) : v("jVintage"),
    country: v("jCountry"), region: v("jRegion"), grape: v("jGrape"),
    commune: v("jCommune"), classification: clsValue("jClass"),
    place: v("jPlace"), rating: v("jRating") ? Number(v("jRating")) : "",
    price: v("jPrice") === "" ? "" : Math.max(0, Number(v("jPrice")) || 0), note: v("jNote"),
  };
  const file = $("jPhoto").files[0];
  if(file){
    btn.textContent = tr("Preparing photo…");
    try{ entry.photo = await shrinkImage(file); }
    catch(err){ toast(tr("Couldn't read that photo — saving without it")); }
  }else if(editing && J_PHOTO_REMOVE){
    entry.photoRemove = true;
  }
  try{
    btn.textContent = tr("Saving…");
    // what this entry already put in Enjoyed, judged by the entry as it was (its name or date may change now)
    const tOld = editing && J_ORIG ? enjoyTarget(J_ORIG) : null;
    const res = editing
      ? await api({action:"jedit", row:J_EDIT, entry})
      : await api({action:"jadd", entry});
    JENTRIES = res.entries || [];
    let alsoEnjoyed = "";
    if(tOld && tOld.kind==="logged"){
      try{
        let r4 = null;
        if(tOld.elsewhere){
          // the Enjoyed row this entry created follows the edit: name, date, rating, price, place…
          r4 = await api({action:"enjoysync", row:tOld.wine.row, entry});
          alsoEnjoyed = "synced";
        }else{
          // a cellar bottle: move its drunk date with the entry; the cellar's own details stay as they are
          const d0 = String(J_ORIG.date||"").slice(0,10), d1 = String(entry.date||"").slice(0,10);
          if(d1 && d1!==d0 && tOld.wine.drunkDate===d0) r4 = await api({action:"setdate", row:tOld.wine.row, field:"drunkDate", value:d1});
          if(entry.rating!=="" && !tOld.wine.rating) r4 = await api({action:"rate", row:tOld.wine.row, rating:entry.rating});
        }
        if(r4){ WINES = normalize(r4.wines); renderOverview(); renderTable(); renderEnjoyed(); }
      }catch(e4){ if(e4.message==="bad-action") toast(tr("Journal saved — update the Apps Script to keep Enjoyed in step")); }
    }
    const t = enjoyTarget(entry);
    if($("jEnjoy").checked && !$("jEnjoyWrap").hidden){
      try{
        let r2 = null;
        if(t.kind==="cellar"){
          btn.textContent = tr("Marking drunk…");
          r2 = await api({action:"drink", row:t.wine.row, qty:1});
          // the server stamps today; keep Enjoyed in step with the tasting date
          const d = String(entry.date||"").slice(0,10);
          if(d && d !== todayStr())
            r2 = await api({action:"setdate", row:t.wine.row, field:"drunkDate", value:d});
          // a bottle we own already has a purchase price; only fill a blank one
          if(entry.price !== "" && !t.wine.price)
            r2 = await api({action:"setprice", row:t.wine.row, value:entry.price});
          // and the score you gave it tonight becomes the wine's score if it had none
          if(entry.rating !== "" && !t.wine.rating)
            r2 = await api({action:"rate", row:t.wine.row, rating:entry.rating});
          alsoEnjoyed = "drunk";
        }else if(t.kind==="new"){
          r2 = await api({action:"enjoyadd", entry:{
            producer:entry.producer, wine:entry.wine, vintage:entry.vintage,
            region:entry.region, country:entry.country, grape:entry.grape, note:entry.note,
            commune:entry.commune, classification:entry.classification,
            rating:entry.rating, place:entry.place, drunkDate:entry.date, price:entry.price,
            type:inferType(entry.region, entry.grape, entry.wine)}});
          alsoEnjoyed = "added";
        }
        if(r2){ WINES = normalize(r2.wines); renderOverview(); renderTable(); renderEnjoyed(); }
      }catch(e2){ /* journal saved regardless */ }
    }else if(!tOld && t.kind==="logged" && !t.elsewhere && entry.rating !== "" && !t.wine.rating){
      // the bottle was marked drunk from the cellar first: tonight's score becomes the wine's if it had none
      try{
        const r5 = await api({action:"rate", row:t.wine.row, rating:entry.rating});
        WINES = normalize(r5.wines); renderOverview(); renderTable(); renderEnjoyed();
      }catch(e5){ /* journal saved regardless */ }
    }else if(!tOld && t.kind==="logged" && t.elsewhere && entry.price !== "" && Number(entry.price) !== Number(t.wine.price||0)){
      // a new entry for a wine already in Enjoyed as drunk elsewhere that day — carry its price over
      try{
        const r3 = await api({action:"setprice", row:t.wine.row, value:entry.price});
        WINES = normalize(r3.wines); renderOverview(); renderTable(); renderEnjoyed();
        alsoEnjoyed = "priced";
      }catch(e3){ /* journal saved regardless */ }
    }
    $("jModal").classList.remove("open");
    renderJournal();
    if(location.hash!=="#journal") location.hash = "#journal";
    const what = editing ? tr("Journal entry updated") : tr("Journal entry saved");
    toast(alsoEnjoyed==="synced" ? what+" — "+tr("Enjoyed updated too 🍷")
        : alsoEnjoyed==="drunk" ? what+" — "+tr("bottle marked drunk 🍷")
        : alsoEnjoyed==="added" ? what+" + "+tr("added to Enjoyed 🍷")
        : alsoEnjoyed==="priced" ? what+" — "+tr("price saved to Enjoyed 🍷")
        : what+" 📓");
  }catch(err){
    const m = String(err.message||"");
    const hint = /authori[sz]|permission/i.test(m)
      ? " — "+tr("the API needs Drive access. In Apps Script, run the “authorize” function once and approve, then try again.")
      : "";
    $("jErr").textContent = tr("Could not save: {0}", errText(m))+hint;
    $("jErr").hidden = false;
    toast(tr("Could not save — see the message in the form"));
  }
  btn.disabled = false; btn.textContent = editing ? tr("Save changes") : tr("Save entry");
});

/* ---------- enjoyed (cellar history) ---------- */
const eState = {q:"", style:"", cls:"", where:"", sortK:"drunkDate", sortDir:-1};
// classification groups for the Enjoyed filter (a suggested one counts until you set your own)
const clsGroup = w => { const c = classShown(w); const k = c ? clsKey(c.txt) : ""; return k==="GC" ? "GC" : k==="1er" ? "1er" : k==="V" ? "V" : "other"; };
const styleColor = s => HIST_COLOR[s] || "var(--muted)";

function renderEnjoyed(){
  const drunk = WINES.filter(w=>w.drunk>0);
  drawEnjoyedCharts(drunk);
  // KPIs over everything enjoyed
  const bottles = drunk.reduce((s,w)=>s+w.drunk,0);
  // what a bottle was worth: what you paid, or its value when you didn't buy it (a tasting, a restaurant list)
  const worth = w => w.price || w.value || 0;
  const valueDrunk = drunk.reduce((s,w)=>s+worth(w)*w.drunk,0);
  const prodAgg = {}; drunk.forEach(w=>{ prodAgg[w.producer]=(prodAgg[w.producer]||0)+w.drunk; });
  const top = Object.entries(prodAgg).sort((a,b)=>b[1]-a[1])[0];
  const kpis = [[tr("Bottles enjoyed"), fmt(bottles), (drunk.length===1 ? tr("1 different wine") : tr("{0} different wines", drunk.length)), ""]];
  if(SHOW_PRICES) kpis.push([tr("Value enjoyed"), kr(valueDrunk), drunk.some(w=>!w.price && w.value) ? tr("at purchase price, or value where none was paid") : tr("at purchase price"), ""]);
  else kpis.push([tr("Value enjoyed"), "🔒 "+tr("hidden"), tr("press Show prices"), "locked"]);
  if(top) kpis.push([tr("Most enjoyed"), esc(top[0]), esc(nBottles(top[1])), ""]);
  const rated = drunk.filter(w=>w.rating), away = drunk.filter(isElsewhere);
  if(rated.length) kpis.push([tr("Your average score"), (rated.reduce((s,w)=>s+w.rating,0)/rated.length).toFixed(1)+"/10", rated.length===1 ? tr("1 wine scored") : tr("{0} wines scored", rated.length), ""]);
  kpis.push([tr("Drunk elsewhere"), fmt(away.reduce((s,w)=>s+w.drunk,0)), tr("restaurants, friends' tables · the rest came from your cellar"), ""]);
  $("eKpis").innerHTML = kpis.map(([l,v,h,c])=>
    `<div class="kpi ${c}"><div class="lbl">${l}</div><div class="val">${v}</div><div class="hint">${h}</div></div>`).join("");

  // filter + sort the list
  const q = eState.q.trim().toLowerCase();
  // filters: classification, and whether the bottle came from your cellar
  const CLS_F = [["",tr("All")],["GC","Grand cru"],["1er","1. cru"],["V",tr("Village / AOC")],["other",tr("Other")]];
  const counts = {}; drunk.forEach(w=>{ const g = clsGroup(w); counts[g] = (counts[g]||0) + w.drunk; });
  $("eCls").innerHTML = CLS_F.filter(([k])=>!k || counts[k]).map(([k,l])=>`<button type="button" data-cls="${k}" class="${eState.cls===k?"on":""}">${l}${k?` <span class="n">${counts[k]}</span>`:""}</button>`).join("");
  $("eWhere").innerHTML = [["",tr("Everywhere")],["cellar",tr("From my cellar")],["away",tr("Elsewhere")]].map(([k,l])=>`<button type="button" data-where="${k}" class="${eState.where===k?"on":""}">${esc(l)}</button>`).join("");
  $("eCls").querySelectorAll("button").forEach(b=>b.onclick=()=>{ eState.cls=b.dataset.cls; renderEnjoyed(); });
  $("eWhere").querySelectorAll("button").forEach(b=>b.onclick=()=>{ eState.where=b.dataset.where; renderEnjoyed(); });
  renderFillBar();
  let list = drunk.filter(w=>{
    if(eState.style && w.style!==eState.style) return false;
    if(eState.cls && clsGroup(w)!==eState.cls) return false;
    if(eState.where==="cellar" && isElsewhere(w)) return false;
    if(eState.where==="away" && !isElsewhere(w)) return false;
    if(!q) return true;
    return [w.producer,w.name,w.commune,w.region,w.grape,w.classification,(classShown(w)||{}).txt,w.source,String(w.vintage)].join(" ").toLowerCase().includes(q);
  });
  const k=eState.sortK, dir=eState.sortDir;
  list.sort((a,b)=>{
    let va=a[k], vb=b[k];
    if(k==="vintage"){ va=typeof va==="number"?va:9999; vb=typeof vb==="number"?vb:9999; }
    if(k==="drunkDate"){ va=va||""; vb=vb||""; }
    if(k==="price"){ va=worth(a); vb=worth(b); }
    if(typeof va==="string") return va.localeCompare(vb)*dir;
    return ((va??0)-(vb??0))*dir;
  });
  document.querySelectorAll("#eTbl th[data-k] .arr").forEach(s=>s.textContent="");
  const th=document.querySelector(`#eTbl th[data-k="${k}"] .arr`); if(th) th.textContent = dir>0?"▲":"▼";

  let ct = `${nWines(list.length)} · ${btl(fmt(list.reduce((s,w)=>s+w.drunk,0)))}`;
  if(SHOW_PRICES) ct += ` · ${kr(list.reduce((s,w)=>s+worth(w)*w.drunk,0))}`;
  $("eCount").textContent = ct;

  if(!list.length){
    $("eRows").innerHTML = `<tr><td colspan="7"><div class="spin">${esc(q?tr("No enjoyed wines match your search."):tr("Nothing enjoyed yet — bottles you finish will collect here."))}</div></td></tr>`;
    return;
  }
  const shown = pageOf(list, "enjoyed");
  $("eRows").innerHTML = shown.map((w,i)=>{
    const pn = PRODUCER_NOTES[w.producer];
    const badge = pn?`<span class="badge ${pn[0]}">${tr(TIER_LABEL[pn[0]])}</span>`:"";
    const nm = [w.name, w.commune && w.commune!==w.name ? w.commune : ""].filter(Boolean).join(" · ");
    return `<tr class="main" data-i="${i}" data-row="${w.row}" tabindex="0" aria-level="1" aria-expanded="false">
      <td><span class="prod">${esc(w.producer)}</span>${badge}<br><span class="wname">${fmtChip(w)}${esc(nm)}${classChip(w)}${w.rating?` · <span class="myscore">${w.rating}/10</span>`:""}${w.drunkDate?`<span class="ponly"> · ${esc(fmtDate(w.drunkDate))}</span>`:""}</span></td>
      <td class="num">${esc(w.vintage||"—")}</td>
      <td>${esc(w.region)}</td>
      <td><span class="sdot" style="background:var(${STYLE_VAR[w.style]||"--muted"})"></span>${tr(STYLE_EN[w.style])||esc(w.style)}</td>
      <td class="num">${w.drunk}</td>
      <td class="num">${w.drunkDate?esc(fmtDate(w.drunkDate)):"—"}</td>
      <td class="num">${SHOW_PRICES ? (w.price ? kr(w.price) : w.value ? `<span class="est" title="${esc(tr("Value: not what you paid"))}">≈ ${kr(w.value)}</span>` : "—") : "···"}</td>
    </tr>
    <tr class="detail" aria-level="2" hidden><td colspan="7"></td></tr>`;
  }).join("") + moreRow(list.length, shown.length, 7, "enjoyed");
  bindEnjoyedRows();
}

function drawEnjoyedCharts(drunk){
  const total = drunk.reduce((s,w)=>s+w.drunk,0);
  // by style donut
  const styAgg={}; drunk.forEach(w=>{ styAgg[w.style]=(styAgg[w.style]||0)+w.drunk; });
  const styList=STYLES.filter(s=>styAgg[s]);
  drawEnjoyedPie($("ePie"), styList, styAgg, total);
  $("eLegend").innerHTML = styList.map(s=>`
    <button data-style="${s}"><span class="dot" style="background:${styleColor(s)}"></span>
    <span>${tr(STYLE_EN[s])}</span><span class="n">${btl(styAgg[s])} · ${Math.round(styAgg[s]/Math.max(1,total)*100)}%</span></button>`).join("");
  document.querySelectorAll("#eLegend button").forEach(el=>{
    el.classList.toggle("active", el.dataset.style===eState.style && !!eState.style);
    el.addEventListener("click",()=>{ eState.style = eState.style===el.dataset.style ? "" : el.dataset.style; renderEnjoyed(); });
  });
  // most-enjoyed producers
  const prodAgg={}; drunk.forEach(w=>{ prodAgg[w.producer]=(prodAgg[w.producer]||0)+w.drunk; });
  const prods=Object.entries(prodAgg).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const maxB=prods.length?prods[0][1]:1;
  $("eProducers").innerHTML = prods.map(([name,b])=>`
    <button class="rbar" data-prod="${esc(name)}" aria-label="${esc(name)}: ${esc(tr("{0} bottles", b))}">
      <span class="rb-name">${esc(name)}</span>
      <span class="rb-track"><span class="rb-fill" style="width:${Math.max(2,b/maxB*100)}%"></span></span>
      <span class="rb-n">${btl(b)}</span></button>`).join("") || `<div class="ph">${esc(tr("Nothing yet."))}</div>`;
  document.querySelectorAll("#eProducers .rbar").forEach(el=>{
    el.classList.toggle("active", el.dataset.prod===eState.q.trim() && !!eState.q.trim());
    el.addEventListener("click",()=>{ eState.q = eState.q.trim()===el.dataset.prod ? "" : el.dataset.prod; $("eq").value=eState.q; renderEnjoyed(); });
  });
  drawDrinkingTime(drunk);
}

function drawEnjoyedPie(svg, styList, styAgg, total){
  if(!svg) return;
  const C=115,R=100,IR=60;
  svg.setAttribute("viewBox","0 0 230 230");
  let a0=-Math.PI/2, html="";
  styList.forEach(st=>{
    const a1=a0+(styAgg[st]/Math.max(1,total))*2*Math.PI;
    html+=`<path class="pslice" data-style="${st}" d="${donutArc(C,C,R,IR,a0,a1)}" style="fill:${styleColor(st)}"></path>`;
    a0=a1;
  });
  html+=`<text class="pcen" x="${C}" y="${C+2}" text-anchor="middle">${fmt(total)}</text>
    <text class="pcen2" x="${C}" y="${C+22}" text-anchor="middle">${esc(tr("enjoyed"))}</text>`;
  svg.innerHTML=html;
  svg.querySelectorAll(".pslice").forEach(pl=>{
    const st=pl.dataset.style;
    pl.classList.toggle("on", st===eState.style && !!eState.style);
    pl.addEventListener("mousemove",e=>showTip(`<b>${tr(STYLE_EN[st])}</b><br>${btl(styAgg[st])} · ${Math.round(styAgg[st]/Math.max(1,total)*100)}%`,e.clientX,e.clientY));
    pl.addEventListener("mouseleave",hideTip);
    pl.addEventListener("click",()=>{ eState.style = eState.style===st ? "" : st; renderEnjoyed(); });
  });
}

function monthRange(a,b){
  const out=[]; let [y,m]=a.split("-").map(Number); const [ey,em]=b.split("-").map(Number);
  while(y<ey || (y===ey && m<=em)){ out.push(`${y}-${String(m).padStart(2,"0")}`); if(++m>12){ m=1; y++; } if(out.length>720) break; }
  return out;
}

function drawDrinkingTime(drunk){
  const svg=$("eTime"), cap=$("eTimeCap"); if(!svg) return;
  const dm = w => /^\d{4}-\d{2}/.test(String(w.drunkDate));
  const dated = drunk.filter(dm);
  const nodate = drunk.reduce((s,w)=>s+(dm(w)?0:w.drunk),0);
  if(!dated.length){
    svg.innerHTML=""; svg.removeAttribute("viewBox");
    cap.textContent = nodate ? tr("{0} enjoyed without a date — mark drinks in the app so they’re dated.", nBottles(nodate)) : "";
    return;
  }
  const byMonth={};
  dated.forEach(w=>{ const m=String(w.drunkDate).slice(0,7); (byMonth[m]||(byMonth[m]={}))[w.style]=(byMonth[m][w.style]||0)+w.drunk; });
  const ks=Object.keys(byMonth).sort();
  const months=monthRange(ks[0], ks[ks.length-1]);
  const maxY=Math.max(1,...months.map(m=>Object.values(byMonth[m]||{}).reduce((a,b)=>a+b,0)));
  const W=Math.max(300, Math.round((svg.parentElement||{}).clientWidth || 980)), H=W<600?170:210, P={l:22,r:10,t:14,b:26};
  const bw=(W-P.l-P.r)/Math.max(1,months.length);
  const Y=v=>H-P.b-(v/maxY)*(H-P.t-P.b);
  let parts=[`<text class="hist-axis" x="2" y="${(Y(maxY)+3).toFixed(1)}">${maxY}</text>
    <line class="hist-base" x1="${P.l}" y1="${Y(0).toFixed(1)}" x2="${(W-P.r).toFixed(1)}" y2="${Y(0).toFixed(1)}"/>`];
  let lastYear=null;
  months.forEach((m,i)=>{ const yr=m.slice(0,4), x=P.l+i*bw+bw/2;
    if(yr!==lastYear){ lastYear=yr; parts.push(`<text class="hist-axis" x="${x.toFixed(1)}" y="${H-8}" text-anchor="middle">${yr}</text>`); } });
  months.forEach((m,i)=>{
    const seg=byMonth[m]; if(!seg) return;
    const tot=Object.values(seg).reduce((a,b)=>a+b,0);
    const x=P.l+i*bw+bw*0.14, w=Math.max(1.5,bw*0.72);
    let yTop=Y(0);
    STYLES.forEach(st=>{ const c=seg[st]; if(!c) return; const h=(c/maxY)*(H-P.t-P.b); yTop-=h;
      parts.push(`<rect class="etime-seg" x="${x.toFixed(1)}" y="${yTop.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" style="fill:${styleColor(st)}"></rect>`); });
    parts.push(`<rect class="etime-hit" x="${(P.l+i*bw).toFixed(1)}" y="${P.t}" width="${bw.toFixed(1)}" height="${(H-P.t-P.b).toFixed(1)}"
      data-m="${m}" data-tot="${tot}" data-seg="${esc(JSON.stringify(seg))}"></rect>`);
  });
  svg.setAttribute("viewBox",`0 0 ${W} ${H}`);
  svg.innerHTML=parts.join("");
  svg.querySelectorAll(".etime-hit").forEach(r=>{
    r.addEventListener("mousemove",e=>{
      const seg=JSON.parse(r.dataset.seg);
      const breakdown=STYLES.filter(s=>seg[s]).map(s=>`${tr(STYLE_EN[s])} ${seg[s]}`).join(" · ");
      const d=new Date(r.dataset.m+"-01T12:00:00");
      const ml=isNaN(d)?r.dataset.m:d.toLocaleDateString(I18N_LOCALE(),{month:"short",year:"numeric"});
      showTip(`<b>${ml}</b><br>${esc(nBottles(Number(r.dataset.tot)))}<br><span style="opacity:.75">${esc(breakdown)}</span>`,e.clientX,e.clientY);
    });
    r.addEventListener("mouseleave",hideTip);
  });
  cap.textContent = nodate ? tr("{0} more enjoyed without a date (not shown)", nodate) : "";
}

function bindEnjoyedRows(){ bindWineRows("#eRows"); }

$("eq").addEventListener("input",e=>{ eState.q=e.target.value; renderEnjoyed(); });
document.querySelectorAll("#eTbl th[data-k]").forEach(th=>th.addEventListener("click",()=>{
  const k=th.dataset.k;
  if(eState.sortK===k) eState.sortDir*=-1;
  else { eState.sortK=k; eState.sortDir = (k==="price"||k==="drunk"||k==="drunkDate") ? -1 : 1; }
  renderEnjoyed();
}));

// Best-guess wine type from grape/name, so journal-sourced wines get a colour.
function inferType(region, grape, wine){
  const g=(grape||"").toLowerCase(), w=(wine||"").toLowerCase();
  if(/ros[eé]/.test(g)||/ros[eé]/.test(w)) return "Rose";
  const white=["chardonnay","riesling","sauvignon","chenin","pinot gris","pinot blanc","gewurz",
    "aligot","viognier","marsanne","roussanne","semillon","gruner","grüner","albari","verdejo","muscadet","melon","furmint"];
  if(white.some(x=>g.includes(x))) return "Hvid";
  return "Rød"; // Champagne/sparkling handled by region in normalize
}

/* add a wine you've had but never owned (enjoyed, not in the cellar) */
function openEnjoyedAdd(prefill){
  $("eaForm").reset(); $("eaErr").hidden=true; $("eaErr").textContent="";
  $("eaClass").dataset.auto=""; $("eaType").dataset.touched=""; $("eaFillNote").hidden=true; $("eaClassHint").textContent=""; fillCommunes();
  $("eaDate").value=todayStr();
  $("jProducers").innerHTML=[...new Set(WINES.map(w=>w.producer).filter(Boolean))].sort().map(x=>`<option>${esc(x)}</option>`).join("");
  if(prefill){
    $("eaProducer").value=prefill.producer||""; $("eaWine").value=prefill.wine||"";
    $("eaVintage").value=prefill.vintage||""; $("eaRegion").value=prefill.region||""; $("eaGrape").value=prefill.grape||"";
    if(prefill.place) $("eaPlace").value=prefill.place;
    if(prefill.rating) $("eaRating").value=String(prefill.rating);
    if(prefill.date) $("eaDate").value=String(prefill.date).slice(0,10);
    if(prefill.price!==""&&prefill.price!=null) $("eaPrice").value=prefill.price;
    if(prefill.size) $("eaSize").value=prefill.size;
    $("eaType").value=prefill.type||inferType(prefill.region,prefill.grape,prefill.wine);
    if(prefill.commune) $("eaCommune").value=prefill.commune;
    if(prefill.country) $("eaCountry").value=prefill.country;
    if(prefill.classification) $("eaClass").value=matchOpt($("eaClass"), prefill.classification);
  }
  EA_SUGGEST.reset(); if(prefill) EA_SUGGEST.run(); else classHint(EA_IDS);
  $("eaModal").classList.add("open");
  setTimeout(()=>$("eaProducer").focus(),40);
}
$("eAddBtn").addEventListener("click",()=>openEnjoyedAdd(null));
$("eaCancel").addEventListener("click",()=>$("eaModal").classList.remove("open"));
$("eaModal").addEventListener("click",e=>{ if(e.target===$("eaModal")) $("eaModal").classList.remove("open"); });
$("eaForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const btn=$("eaSave"); btn.disabled=true; btn.textContent=tr("Adding…"); $("eaErr").hidden=true;
  const v=id=>$(id).value.trim();
  const entry={ producer:v("eaProducer"), wine:v("eaWine"),
    vintage: /^\d{4}$/.test(v("eaVintage"))?Number(v("eaVintage")):v("eaVintage"),
    type:$("eaType").value, size:$("eaSize").value,
    region:v("eaRegion"), country:v("eaCountry"), commune:v("eaCommune"), classification:clsValue("eaClass"),
    grape:v("eaGrape"), place:v("eaPlace"),
    drunkDate:v("eaDate"), rating: v("eaRating")?Number(v("eaRating")):"",
    price: v("eaPrice")==="" ? "" : Math.max(0, Number(v("eaPrice"))||0), note:v("eaNote") };
  try{
    const res=await api({action:"enjoyadd", entry});
    WINES=normalize(res.wines);
    $("eaModal").classList.remove("open");
    renderOverview(); renderTable(); renderEnjoyed();
    if(location.hash!=="#enjoyed") location.hash="#enjoyed";
    toast(tr("Added to Enjoyed 🍷"));
  }catch(err){ $("eaErr").textContent=tr("Could not add: {0}", errText(err)); $("eaErr").hidden=false; }
  btn.disabled=false; btn.textContent=tr("Add to Enjoyed");
});

/* ---------- edit a wine's details (rename, fix a commune, set a classification…) ---------- */
let I_WINE = null;
// journal entries written under this exact name (the ones a rename should carry along)
const journalSameName = w => (JENTRIES||[]).filter(e=>jKey(e.producer)===jKey(w.producer) && jKey(e.wine)===jKey(w.name) && jKey(e.vintage)===jKey(w.vintage));
const I_IDS = {producer:"iProducer", wine:"iName", country:"iCountry", region:"iRegion", commune:"iCommune", grape:"iGrape", class:"iClass", note:null};
function openInfo(w){
  I_WINE = w;
  $("iForm").reset(); $("iErr").hidden = true; fillCommunes(); $("iClass").dataset.auto = "";
  if(isElsewhere(w)) trSet("Edit this Enjoyed wine", $("iTitle")); else trSet("Edit wine details", $("iTitle"));
  $("iProducer").value = w.producer; $("iName").value = w.name; $("iVintage").value = w.vintage ?? "";
  $("iCommune").value = w.commune; $("iCountry").value = w.country; $("iRegion").value = w.region; $("iGrape").value = w.grape;
  $("iLocation").value = w.location; $("iSource").value = w.source; $("iNote").value = w.note;
  if(w.classification) $("iClass").value = matchOpt($("iClass"), w.classification);
  const ty = ({"Rød":"Rød","Hvid":"Hvid","Rosé":"Rose","Bobler":"Bobler"})[w.style] || "Rød";
  $("iType").value = ty;
  classHint(I_IDS);
  const js = journalSameName(w);
  $("iJWrap").hidden = !js.length;
  $("iJLabel").innerHTML = js.length ? esc(js.length===1 ? tr("Also rename its journal entry if the name changes") : tr("Also rename its {0} journal entries if the name changes", js.length)) : "";
  $("iModal").classList.add("open");
  setTimeout(()=>$("iName").focus(), 40);
}
["iName","iCommune","iRegion"].forEach(id=>$(id).addEventListener("input", ()=>classHint(I_IDS)));
$("iClass").addEventListener("change", ()=>{ $("iClass").dataset.auto = ""; });
$("iCancel").addEventListener("click", ()=>$("iModal").classList.remove("open"));
$("iModal").addEventListener("click", e=>{ if(e.target===$("iModal")) $("iModal").classList.remove("open"); });
$("iForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const w = I_WINE; if(!w) return;
  const v = id => $(id).value.trim();
  const vint = /^\d{4}$/.test(v("iVintage")) ? Number(v("iVintage")) : v("iVintage");
  const next = {producer:v("iProducer"), name:v("iName"), vintage:vint, commune:v("iCommune"), classification:clsValue("iClass"),
    country:v("iCountry"), region:v("iRegion"), grape:v("iGrape"), type:$("iType").value,
    location:v("iLocation"), source:v("iSource"), note:v("iNote")};
  const was = {producer:w.producer, name:w.name, vintage:w.vintage??"", commune:w.commune, classification:w.classification,
    country:w.country, region:w.region, grape:w.grape, type:({"Rød":"Rød","Hvid":"Hvid","Rosé":"Rose","Bobler":"Bobler"})[w.style]||"Rød",
    location:w.location, source:w.source, note:w.note};
  // only what changed is sent, so a field the sheet spells its own way isn't rewritten for nothing
  const fields = {}; Object.keys(next).forEach(k=>{ if(jKey(next[k])!==jKey(was[k])) fields[k] = next[k]; });
  if(!Object.keys(fields).length){ $("iModal").classList.remove("open"); return; }
  const renamed = ["producer","name","vintage"].some(k=>k in fields);
  const btn = $("iSave"); btn.disabled = true; btn.textContent = tr("Saving…");
  try{
    const res = await api({action:"setinfo", row:w.row, fields, old:{producer:w.producer, wine:w.name, vintage:w.vintage??""},
      journal: !$("iJWrap").hidden && $("iJournal").checked});
    WINES = normalize(res.wines); if(res.entries) JENTRIES = res.entries;
    $("iModal").classList.remove("open");
    renderOverview(); renderTable(); renderEnjoyed(); if(JENTRIES) renderJournal();
    toast(renamed ? tr("Renamed ✏️") : tr("Details saved ✏️"));
  }catch(err){
    $("iErr").textContent = err.message==="bad-action" ? tr("The Apps Script needs the latest version (26) for this — paste apps-script/Code.gs into it and redeploy.") : tr("Could not save: {0}", errText(err));
    $("iErr").hidden = false;
  }
  btn.disabled = false; btn.textContent = tr("Save details");
});

/* ---------- fill in classifications the app can tell from the names ---------- */
function classSuggestions(){
  const wines = WINES.filter(w=>!String(w.classification||"").trim()).map(w=>({w, sg:suggestClass(w)})).filter(x=>x.sg);
  const entries = (JENTRIES||[]).filter(e=>!String(e.classification||"").trim()).map(e=>({e, sg:suggestClass(e)})).filter(x=>x.sg);
  return {wines, entries};
}
function renderFillBar(){
  const box = $("eFill"); if(!box) return;
  const {wines, entries} = classSuggestions(), n = wines.length + entries.length;
  box.hidden = !n; if(!n){ box.innerHTML = ""; return; }
  const eg = [...wines.map(x=>[x.w.producer+" "+x.w.name, x.sg]), ...entries.map(x=>[x.e.producer+" "+x.e.wine, x.sg])].slice(0, 40);
  box.innerHTML = `<div class="fb-t">${esc(n===1 ? tr("1 wine has no classification yet — the app can tell from the name") : tr("{0} wines have no classification yet — the app can tell from the name", n))}
      (${esc(tr("{0} in your cellar & Enjoyed, {1} in the journal", wines.length, entries.length))}).
      <button class="btn primary" id="eFillGo">${esc(n===1?tr("Fill it in"):tr("Fill them in"))}</button></div>
    <details><summary>${esc(tr("See the suggestions"))}</summary><ul>${eg.map(([nm, sg])=>`<li>${esc(nm)} → <b>${esc(sg.cls)}</b>${sg.climat?` <span class="ph">(${esc(sg.climat)})</span>`:sg.why==="label"?` <span class="ph">(${esc(tr("on the label"))})</span>`:""}</li>`).join("")}${n>eg.length?`<li class="ph">${esc(tr("…and {0} more", n-eg.length))}</li>`:""}</ul></details>`;
  $("eFillGo").onclick = async ()=>{
    const b = $("eFillGo"); b.disabled = true; b.textContent = tr("Saving…");
    try{
      const res = await api({action:"classfill", wines:wines.map(x=>({row:x.w.row, value:x.sg.cls})), journal:entries.map(x=>({row:x.e.row, value:x.sg.cls}))});
      WINES = normalize(res.wines); if(res.entries) JENTRIES = res.entries;
      renderOverview(); renderTable(); renderEnjoyed(); if(JENTRIES) renderJournal();
      toast(n===1 ? tr("1 classification filled in ✓") : tr("{0} classifications filled in ✓", n));
    }catch(err){ toast(err.message==="bad-action" ? tr("Update the Apps Script (version 26) to save these") : tr("Could not save: {0}", errText(err))); b.disabled = false; b.textContent = n===1?tr("Fill it in"):tr("Fill them in"); }
  };
}

/* ---------- wishlist ---------- */
let WITEMS = null, W_EDIT = null;

async function loadWishlist(force){
  if(WITEMS && !force){ renderWishlist(); return; }
  $("wSpin").hidden = false; $("wList").innerHTML = "";
  try{
    const res = await api({action:"wish"});
    WITEMS = res.items || [];
    renderWishlist();
  }catch(err){
    if(AUTH_ERRORS.has(err.message)){ forgetAuth(); setGateMode("login"); showGate(tr("Your session expired — log in again.")); }
    else $("wList").innerHTML = `<div class="spin">${esc(tr("Could not load the wishlist ({0}). The Apps Script may need the latest redeploy.", errText(err)))}</div>`;
  }
  $("wSpin").hidden = true;
}

function renderWishlist(){
  const list = [...(WITEMS||[])].sort((a,b)=>String(a.producer).localeCompare(String(b.producer)));
  $("wCount").textContent = list.length ? (list.length===1 ? tr("1 wish") : tr("{0} wishes", list.length)) : "";
  $("wList").innerHTML = list.length ? list.map(e=>{
    const meta=[e.region, e.price?tr("target {0}", kr(e.price)):""].filter(Boolean).map(esc).join(" · ");
    return `<div class="jentry">
      <div class="jtop"><span class="jwine">${esc(e.producer)}${e.wine?" · "+esc(e.wine):""}${e.vintage?" · "+esc(e.vintage):""}</span>
        <button class="wedit" data-row="${e.row}" title="${esc(tr("Edit"))}">✏️</button>
        <button class="wdel" data-row="${e.row}" title="${esc(tr("Delete"))}">🗑</button></div>
      ${meta?`<div class="jmeta">${meta}</div>`:""}
      ${e.note?`<div class="jnote">${esc(e.note)}</div>`:""}
      <div class="wact"><button class="wmove" data-row="${e.row}">＋ ${esc(tr("Add to cellar"))}</button></div>
    </div>`;
  }).join("") : `<div class="spin">${esc(tr("Nothing on the wishlist yet — press “＋ Add wish”."))}</div>`;
  document.querySelectorAll(".wedit").forEach(b=>b.addEventListener("click",()=>{
    const e=(WITEMS||[]).find(x=>x.row===Number(b.dataset.row)); if(e) openWishEdit(e); }));
  document.querySelectorAll(".wdel").forEach(b=>b.addEventListener("click", async ()=>{
    if(!(await ask(tr("Remove this wish?"), {ok:tr("Remove"), danger:true}))) return;
    try{ const res=await api({action:"wdelete", row:Number(b.dataset.row)}); WITEMS=res.items||[]; renderWishlist(); toast(tr("Wish removed")); }
    catch(err){ toast(tr("Could not remove: {0}", errText(err))); }
  }));
  document.querySelectorAll(".wmove").forEach(b=>b.addEventListener("click", async ()=>{
    const e=(WITEMS||[]).find(x=>x.row===Number(b.dataset.row));
    if(!(await ask(tr("Move {0} into the cellar (1 bottle)?", e?e.producer:tr("this wine")), {ok:tr("Move to cellar")}))) return;
    b.disabled=true; b.textContent=tr("Adding…");
    try{
      const res=await api({action:"wtocellar", row:Number(b.dataset.row)});
      WITEMS=res.items||[]; if(res.wines) WINES=normalize(res.wines);
      renderWishlist(); renderOverview(); renderTable(); renderEnjoyed();
      toast(tr("Added to the cellar 🍷"));
    }catch(err){ toast(tr("Could not move: {0}", errText(err))); b.disabled=false; b.textContent="＋ "+tr("Add to cellar"); }
  }));
}

function prepWishModal(){
  $("wForm").reset(); $("wErr").hidden=true; $("wErr").textContent="";
  $("jProducers").innerHTML = [...new Set(WINES.map(w=>w.producer).filter(Boolean))].sort().map(x=>`<option>${esc(x)}</option>`).join("");
  $("wModal").classList.add("open");
}
function openWishModal(prefill){
  W_EDIT=null; prepWishModal(); trSet("Add to wishlist", $("wTitle")); trSet("Save", $("wSave"));
  if(prefill){ $("wProducer").value=prefill.producer||""; $("wWine").value=prefill.wine||"";
    $("wVintage").value=prefill.vintage||""; $("wRegion").value=prefill.region||""; }
  setTimeout(()=>$("wProducer").focus(),40);
}
function openWishEdit(e){
  W_EDIT=e.row; prepWishModal(); trSet("Edit wish", $("wTitle")); trSet("Save changes", $("wSave"));
  $("wProducer").value=e.producer||""; $("wWine").value=e.wine||"";
  $("wVintage").value=e.vintage!==""&&e.vintage!=null?e.vintage:"";
  $("wRegion").value=e.region||""; $("wPrice").value=e.price!==""&&e.price!=null?e.price:""; $("wNote").value=e.note||"";
  setTimeout(()=>$("wProducer").focus(),40);
}
$("wAddBtn").addEventListener("click",()=>openWishModal(null));
$("wCancel").addEventListener("click",()=>$("wModal").classList.remove("open"));
$("wModal").addEventListener("click",e=>{ if(e.target===$("wModal")) $("wModal").classList.remove("open"); });
$("wForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const editing=W_EDIT!==null; $("wErr").hidden=true;
  const btn=$("wSave"); btn.disabled=true; btn.textContent=tr("Saving…");
  const v=id=>$(id).value.trim();
  const entry={ producer:v("wProducer"), wine:v("wWine"),
    vintage: /^\d{4}$/.test(v("wVintage"))?Number(v("wVintage")):v("wVintage"),
    region:v("wRegion"), price: v("wPrice")===""? "":Number(v("wPrice")), note:v("wNote") };
  try{
    const res= editing ? await api({action:"wedit", row:W_EDIT, entry}) : await api({action:"wadd", entry});
    WITEMS=res.items||[]; $("wModal").classList.remove("open"); renderWishlist();
    if(location.hash!=="#wishlist") location.hash="#wishlist";
    toast(editing?tr("Wish updated"):tr("Added to wishlist"));
  }catch(err){ $("wErr").textContent=tr("Could not save: {0}", errText(err)); $("wErr").hidden=false; }
  btn.disabled=false; btn.textContent= editing?tr("Save changes"):tr("Save");
});

/* ---------- page routing ---------- */
/* ---------- social feed ---------- */
let FEED=null, FEED_ME="", FEED_USERS=[], FEED_FOLLOWS=[], FEED_VIEW="all"; // all | following
const feedVerb = t => t==="bought" ? tr("bought") : t==="drank" ? tr("drank") : tr("shared");
function feedLine(e){
  return [e.producer, e.wine, e.vintage].map(x=>String(x==null?"":x).trim()).filter(Boolean).join(" ");
}
function fTime(iso){
  if(!iso) return "";
  const d=new Date(String(iso).replace(" ","T"));
  return isNaN(d) ? esc(String(iso)) : d.toLocaleString(I18N_LOCALE(),{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
}
function feedSeenKey(){ return "vinFeedSeen_"+(cfg.user||""); }
function markFeedSeen(){ if(FEED&&FEED.length) localStorage.setItem(feedSeenKey(), FEED[0].time||""); updateFeedBadge(); }
function updateFeedBadge(){
  const seen=localStorage.getItem(feedSeenKey())||"", me=(cfg.user||"").toLowerCase();
  const n=(FEED||[]).filter(e=>(e.time||"")>seen && e.to && e.to.toLowerCase()===me && (e.from||"").toLowerCase()!==me).length;
  const b=$("feedBadge"); if(!b) return; if(n>0){ b.textContent=n; b.hidden=false; } else b.hidden=true;
}

// Background load on app open: refreshes the unread badge without marking read.
// The feed as last fetched, kept on this device so it shows at once after a reload; refreshed in the background, and
// forgotten on sign-out. It holds only what the feed shows anyway (posts shared with you, who follows whom).
const feedKey = () => "vinFeed:" + String(cfg.user||"").toLowerCase();
function feedKeep(){ try{ localStorage.setItem(feedKey(), JSON.stringify({feed:FEED, me:FEED_ME, users:FEED_USERS, follows:FEED_FOLLOWS})); }catch(e){} }
function feedRecall(){
  if(FEED || !cfg.user) return;
  try{ const c = JSON.parse(localStorage.getItem(feedKey()) || "null");
    if(c && Array.isArray(c.feed)){ FEED=c.feed; FEED_ME=c.me||""; FEED_USERS=c.users||[]; FEED_FOLLOWS=c.follows||[]; } }catch(e){}
}
function feedForgetAll(){ try{ Object.keys(localStorage).filter(k => k.startsWith("vinFeed:")).forEach(k => localStorage.removeItem(k)); }catch(e){} }
// The feed is there only when the server says so (its SOCIAL setting): off, the tab, the Share buttons and the list of
// other members never show, and nothing is kept on the device.
function setSocial(on){
  document.body.classList.toggle("social", !!on);
  const t = document.querySelector('.tab[data-page="feed"]'); if(t) t.hidden = !on;
  if(!on){ feedForgetAll(); FEED = null; FEED_USERS = []; if(location.hash==="#feed") location.hash = ""; }
}
// The owner gets an Admin button: who has an account (name, email, signed up, last seen) and the invite codes
async function checkOwner(){
  try{ const r = await api({action:"me"}); $("adminBtn").hidden = !(r && r.owner === true); askForHelp(r && r.help); }catch(e){ $("adminBtn").hidden = true; }
}
// account help: a member whose session came back without the password (a kept key) types it once, so the key can be
// wrapped to the owner's; asked once a visit, "Later" until the next
let HELP = null;
async function askForHelp(help){
  if(!help || !window.VAULT || !VAULT.active()) return;
  try{ if(sessionStorage.getItem("vinHelpAsked")) return; }catch(e){}
  if(!(await VAULT.trustedHelp(help))) return;
  HELP = help; $("helpErr").textContent = ""; $("helpPass").value = ""; $("helpModal").classList.add("open");
}
$("helpLater").addEventListener("click", ()=>{ try{ sessionStorage.setItem("vinHelpAsked", "1"); }catch(e){} $("helpModal").classList.remove("open"); });
$("helpForm").addEventListener("submit", async e=>{
  e.preventDefault(); $("helpGo").disabled = true; $("helpErr").textContent = tr("Unlocking your cellar…");
  try{
    const r = await VAULT.escrowWithPassword({post, user:cfg.user, pass:$("helpPass").value, help:HELP});
    cfg.token = r.token; localStorage.setItem("vinToken", r.token);
    if(!r.ok) throw new Error("not-done");
    $("helpModal").classList.remove("open"); toast(tr("Account help is set up"));
  }catch(err){ $("helpErr").textContent = /bad-login|locked/.test(errText(err)) ? tr("That password didn't match.") : tr("Could not set it up just now ({0}).", errText(err)); }
  finally{ $("helpGo").disabled = false; $("helpPass").value = ""; }
});
let ADMIN = null;
async function openAdmin(){
  $("adminErr").textContent = tr("Fetching…"); $("adminModal").classList.add("open");
  try{ ADMIN = await api({action:"admin"}); $("adminErr").textContent = ""; renderAdmin(); }
  catch(err){ $("adminErr").textContent = err.message === "not-owner" ? tr("Only the owner can open this.") : tr("Could not reach the cellar API ({0}).", errText(err)); }
}
// the last 30 days: active members a day as bars, and each count's total
const USAGE_LABEL = {active:"Active members", login:"Logins", signup:"Sign-ups", save:"Cellar saves", atlas:"Atlas visits",
  cellar:"Cellar page", enjoyed:"Enjoyed page", wishlist:"Wishlist page", journal:"Journal page", import:"Imports",
  sommelier:"Sommelier questions", export:"Exports"};
function renderUsage(days, users){
  if(!days || !days.length){ $("adminUsage").innerHTML = `<p class="ph">${esc(tr("No usage counted yet."))}</p>`; return; }
  // bars with a y axis (0, half, the most) and an x axis with a date each week, the last day always labelled
  const top = Math.max(1, ...days.map(d=>d.active)), max = top <= 4 ? top : Math.ceil(top / 2) * 2, L = 22, Rp = 10, T = 6, W = 320, H = 92, B = 16, ph = H - T - B, bw = (W - L - Rp) / days.length;
  const y = v => T + ph - v / max * ph, dm = s => { const [, m, d] = String(s).split("-"); return `${+d}/${+m}`; };
  const grid = [...new Set([0, max / 2, max])].filter(v => Number.isInteger(v)).map(v => `<line class="gl" x1="${L}" x2="${W - Rp}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${L - 4}" y="${y(v) + 3}" text-anchor="end">${v}</text>`).join("");
  const bars = days.map((d,i)=>{ const h = d.active / max * ph; return `<rect x="${(L + i*bw + 1).toFixed(1)}" y="${(T + ph - h).toFixed(1)}" width="${(bw-2).toFixed(1)}" height="${h.toFixed(1)}" rx="1.5"><title>${esc(d.day)}: ${d.active}</title></rect>`; }).join("");
  const ticks = days.map((d,i)=>(days.length - 1 - i) % 7 === 0 ? `<line class="tk" x1="${L + (i + .5) * bw}" x2="${L + (i + .5) * bw}" y1="${T + ph}" y2="${T + ph + 3}"/><text class="ax" x="${L + (i + .5) * bw}" y="${H - 3}" text-anchor="middle">${dm(d.day)}</text>` : "").join("");
  const bars0 = `${grid}${bars}<line class="xl" x1="${L}" x2="${W - Rp}" y1="${T + ph}" y2="${T + ph}"/>${ticks}`;
  const sum = k => days.reduce((s,d)=>s + (d[k]||0), 0);
  // "Active members" is people, not member-days: the daily counts add up the same person once a day, so the tile counts
  // the members last seen within these days instead (the bars keep the per-day counts)
  const from = String(days[0].day || ""), people = (users||[]).filter(u=>u.lastSeen && String(u.lastSeen) >= from).length;
  const total = k => k==="active" && users ? people : sum(k);
  $("adminUsage").innerHTML = `<div class="ususp"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(tr("Active members a day, last 30 days"))}">${bars0}</svg>
      <span class="ph">${esc(tr("Active members a day, last 30 days"))} · ${esc(tr("most {0}", top))}</span></div>
    <dl class="usgrid">${Object.keys(USAGE_LABEL).map(k=>`<div><dt>${esc(tr(USAGE_LABEL[k]))}</dt><dd>${fmt(total(k))}</dd></div>`).join("")}</dl>`;
}
function renderHelp(A){
  const members = A.users.filter(u=>!u.owner), ready = members.filter(u=>u.helpReady).length;
  $("adminHelp").innerHTML = !A.adminKid
    ? `<div class="adhelp"><p class="ph">${esc(tr("Turn this on to be able to help a member who has lost both their password and their recovery code. Each member's key is then also locked to a key only you hold: the private half stays in your browser, encrypted with your own cellar key. The server still can't read any cellar."))}</p>
        <p><button type="button" class="btn primary" id="helpSetup">${esc(tr("Turn on account help"))}</button></p></div>`
    : `<div class="adhelp"><p>${esc(tr("On. {0} of {1} members are ready; the others are ready after their next login.", fmt(ready), fmt(members.length)))}</p>
        <p class="ph">${esc(tr("Key fingerprint"))}: <span class="code" style="font-size:12px;padding:2px 6px">${esc(A.adminKid)}</span></p>
        <div id="helpOut"></div></div>`;
}
function renderAdmin(){
  const A = ADMIN || {users:[], invites:[]};
  renderUsage(A.stats, A.users); renderHelp(A);
  $("adminCount").textContent = tr("{0} of at most {1}", fmt(A.users.length), fmt(A.max || 50));
  $("adminUsers").innerHTML = A.users.map(u=>`<li><span class="a1"><b>${esc(u.user)}</b> · ${u.email ? `<a href="mailto:${esc(u.email)}">${esc(u.email)}</a>` : "—"}</span>
      ${u.owner ? `<span class="ph adrm">${esc(tr("you (owner)"))}</span>` : `${A.adminKid ? (u.helpReady ? `<button type="button" data-help="${esc(u.user)}">${esc(tr("Help back in"))}</button>` : `<span class="hwait">${esc(tr("help: after next login"))}</span>`) : ""}
        <button type="button" class="adrm" data-remove="${esc(u.user)}">${esc(tr("Remove"))}</button>`}
      <span class="a2">${esc(tr("Signed up"))} ${esc(u.created || "—")} · ${esc(tr("Last seen"))} ${esc(u.lastSeen || "—")}</span></li>`).join("");
  const open = A.invites.filter(i=>!i.usedBy), done = A.invites.filter(i=>i.usedBy);
  $("adminInvites").innerHTML =
    open.map(i=>`<li><span class="a1"><span class="code">${esc(i.code)}</span>${i.note ? " · " + esc(i.note) : ""}</span>
      <span><button type="button" data-copy="${esc(i.code)}">${esc(tr("Copy invitation"))}</button> <button type="button" data-revoke="${esc(i.code)}">${esc(tr("Withdraw"))}</button></span>
      <span class="a2">${esc(tr("Made"))} ${esc(i.created)}</span></li>`).join("") +
    done.slice().reverse().map(i=>`<li class="used"><span class="a1"><span class="code">${esc(i.code)}</span>${i.note ? " · " + esc(i.note) : ""}</span>
      <span class="a2">${esc(i.usedBy==="(revoked)" ? tr("withdrawn {0}", i.usedAt) : tr("used by {0}, {1}", i.usedBy, i.usedAt))}</span></li>`).join("") +
    (A.invites.length ? "" : `<li class="used">${esc(tr("No codes yet — make some above."))}</li>`);
}
$("adminBtn").addEventListener("click", openAdmin);
$("adminClose").addEventListener("click", ()=>$("adminModal").classList.remove("open"));
$("adminNew").addEventListener("submit", async e=>{
  e.preventDefault(); $("adminErr").textContent = tr("Making…");
  try{ ADMIN = await api({action:"admininvites", n:Number($("adminN").value), note:$("adminNote").value.trim()}); $("adminNote").value = ""; $("adminErr").textContent = ""; renderAdmin(); }
  catch(err){ $("adminErr").textContent = tr("Could not reach the cellar API ({0}).", errText(err)); }
});
$("adminHelp").addEventListener("click", async e=>{
  if(!e.target.closest("#helpSetup")) return;
  $("adminErr").textContent = tr("Making the key…");
  try{ await VAULT.adminSetup(); ADMIN = await api({action:"admin"}); $("adminErr").textContent = ""; renderAdmin(); toast(tr("Account help is on")); }
  catch(err){ $("adminErr").textContent = tr("Could not reach the cellar API ({0}).", errText(err)); }
});
// helping a member back in: a fresh recovery code, made here, shown once; their own old code stops working
$("adminUsers").addEventListener("click", async e=>{
  const b = e.target.closest("button[data-help]"); if(!b) return;
  const who = b.dataset.help;
  if(!(await ask(tr("Make a new recovery code for {0}? Their old recovery code stops working. Only do this when they've asked you to.", who), {ok:tr("Make a new code")}))) return;
  $("adminErr").textContent = tr("Unlocking…");
  try{
    const r = await VAULT.adminHelp(who); ADMIN = r.admin; $("adminErr").textContent = ""; renderAdmin();
    const msg = tr("Your new AllWine recovery code: {0} — on the login page choose 'Forgot password?', type your username, this code and a new password.", r.code);
    $("helpOut").innerHTML = `<p>${esc(tr("New recovery code for {0} (shown only now):", who))}</p><p class="code" id="helpCode">${esc(r.code)}</p>
      <p><button type="button" class="btn" id="helpCopy">${esc(tr("Copy a message for {0}", who))}</button></p>`;
    $("helpCopy").onclick = async ()=>{ try{ await navigator.clipboard.writeText(msg); toast(tr("Copied")); }catch(err){ window.prompt(tr("Copy"), msg); } };
  }catch(err){ $("adminErr").textContent = /no-help-yet/.test(errText(err)) ? tr("{0} isn't ready yet: it happens at their next login.", who) : tr("Could not reach the cellar API ({0}).", errText(err)); }
});
// removing a member: as permanent as them deleting their own account, so the name is typed to confirm it
$("adminUsers").addEventListener("click", async e=>{
  const b = e.target.closest("button[data-remove]"); if(!b) return;
  const who = b.dataset.remove;
  if(!(await ask(tr("Remove {0} and everything in their account — cellar, journal, wishlist and photos? It can't be undone, and nobody (you included) can read or restore the cellar afterwards. Type the username to confirm:", who), {ok:tr("Remove"), danger:true, typed:who}))) return;
  $("adminErr").textContent = tr("Removing…");
  try{ ADMIN = await api({action:"admindelete", member:who}); $("adminErr").textContent = ""; renderAdmin(); toast(tr("{0} was removed", who)); }
  catch(err){ $("adminErr").textContent = /owner-account/.test(errText(err)) ? tr("The owner's account can't be removed.")
    : /no-user/.test(errText(err)) ? tr("There's no member called {0} any more.", who) : tr("Could not reach the cellar API ({0}).", errText(err)); }
});
$("adminInvites").addEventListener("click", async e=>{
  const c = e.target.closest("button[data-copy]"), r = e.target.closest("button[data-revoke]");
  if(c){ // a ready-made message: where to sign up, and the code
    const msg = tr("You're invited to AllWine, a private wine cellar. Sign up at {0} with the invite code {1} (it works once).", location.origin + location.pathname, c.dataset.copy);
    try{ await navigator.clipboard.writeText(msg); toast(tr("Invitation copied")); }catch(err){ window.prompt(tr("Copy the invitation"), msg); }
  }
  if(r){
    if(!(await ask(tr("Withdraw the code {0}? It stops working.", r.dataset.revoke), {ok:tr("Withdraw")}))) return;
    try{ ADMIN = await api({action:"adminrevoke", code:r.dataset.revoke}); renderAdmin(); }
    catch(err){ $("adminErr").textContent = tr("Could not reach the cellar API ({0}).", errText(err)); }
  }
});

async function loadFeedSilently(){
  if(!document.body.classList.contains("social")) FEED = null;
  else { feedRecall(); if(FEED && location.hash==="#feed") renderFeed(); }
  try{ const r=await api({action:"feed"}); setSocial(r.social === true); if(r.social !== true) return; FEED=r.feed||[]; FEED_ME=r.me||""; FEED_USERS=r.users||[]; FEED_FOLLOWS=r.follows||[]; feedKeep();
    if(location.hash==="#feed"){ renderFeed(); markFeedSeen(); } else updateFeedBadge();
  }catch(e){ setSocial(false); /* off (social-off), or an older API */ }
}
async function loadFeed(force){
  if(!force) feedRecall();
  if(FEED && !force){ renderFeed(); markFeedSeen(); return; }
  $("feedSpin").hidden=false; $("feedList").innerHTML="";
  try{
    const res=await api({action:"feed"});
    FEED=res.feed||[]; FEED_ME=res.me||cfg.user||""; FEED_USERS=res.users||[]; FEED_FOLLOWS=res.follows||[]; feedKeep();
    $("feedSpin").hidden=true; renderFeed(); markFeedSeen();
  }catch(err){
    $("feedSpin").hidden=true;
    if(AUTH_ERRORS.has(err.message)){ forgetAuth(); setGateMode("login"); showGate(tr("Your session expired — log in again.")); }
    else $("feedList").innerHTML=`<div class="spin">${esc(tr("Could not load the feed ({0}). The Apps Script may need the latest redeploy.", errText(err)))}</div>`;
  }
}
const FEED_OPEN = new Set(); // post ids whose comments are expanded
function iFollow(u){ return (FEED_FOLLOWS||[]).some(f=>f.toLowerCase()===String(u).toLowerCase()); }
function renderFeed(){
  const me=(FEED_ME||cfg.user||"").toLowerCase();
  let list=FEED||[];
  if(FEED_VIEW==="following") list=list.filter(e=>{const f=(e.from||"").toLowerCase(); return f===me||iFollow(e.from)||(e.to||"").toLowerCase()===me;});
  $("feedCount").textContent = (FEED||[]).length ? ((FEED||[]).length===1 ? tr("1 post") : tr("{0} posts", (FEED||[]).length)) : "";
  // Everyone / Following toggle
  $("feedTabs").innerHTML = `<button class="ftog${FEED_VIEW==="all"?" on":""}" data-v="all">${esc(tr("Everyone"))}</button>`+
    `<button class="ftog${FEED_VIEW==="following"?" on":""}" data-v="following">${esc(tr("Following"))}${FEED_FOLLOWS.length?` · ${FEED_FOLLOWS.length}`:""}</button>`;
  $("feedTabs").querySelectorAll(".ftog").forEach(b=>b.addEventListener("click",()=>{ FEED_VIEW=b.dataset.v; renderFeed(); }));
  if(!list.length){
    $("feedList").innerHTML=`<div class="spin">${esc(FEED_VIEW==="following"?tr("Nobody you follow has shared yet — switch to Everyone and follow some people."):tr("Nothing shared yet — press “＋ Share a bottle”."))}</div>`;
    updateFeedBadge(); return;
  }
  $("feedList").innerHTML = list.map(e=>{
    const mine=(e.from||"").toLowerCase()===me, tome=e.to && e.to.toLowerCase()===me && !mine, line=feedLine(e);
    const cheers=e.cheers||[], comments=e.comments||[];
    const iCheered=cheers.some(u=>u.toLowerCase()===me), open=FEED_OPEN.has(e.id);
    return `<div class="fcard${tome?" tome":""}">
      <div class="ftop">
        <span class="fwho">${esc(e.from||"?")}</span><span class="fverb">${esc(feedVerb(e.type))}</span>
        ${!mine?`<button class="followbtn${iFollow(e.from)?" on":""}" data-user="${esc(e.from)}">${esc(iFollow(e.from)?tr("Following"):tr("Follow"))}</button>`:``}
        ${e.to?`<span class="fto">→ ${esc(e.to)}${tome?" ("+esc(tr("you"))+")":""}</span>`:``}
        <span class="ftime">${fTime(e.time)}</span>
        ${mine?`<button class="fdel" data-row="${e.row}" title="${esc(tr("Delete post"))}">🗑</button>`:``}
      </div>
      ${line?`<div class="fwine"><b>${esc(line)}</b>${e.rating?` · <span class="myscore">${esc(e.rating)}/10</span>`:""}</div>`:``}
      ${e.region?`<div class="fmeta">${esc(e.region)}</div>`:``}
      ${e.note?`<div class="fnote">${esc(e.note)}</div>`:``}
      ${e.photo?`<div class="fphoto" data-photo="${esc(e.photo)}"><span class="jphoto-ph">🍷</span></div>`:``}
      <div class="fact">
        <button class="cheer${iCheered?" on":""}" data-id="${esc(e.id)}" title="${esc((cheers.join(', '))||tr("Cheers"))}">🍷 ${esc(tr("Cheers"))}${cheers.length?` · ${cheers.length}`:""}</button>
        <button class="cmtbtn" data-id="${esc(e.id)}">💬 ${esc(!comments.length ? tr("Comments") : comments.length===1 ? tr("1 comment") : tr("{0} comments", comments.length))}</button>
      </div>
      ${open?`<div class="fcmts">
        ${comments.map(c=>`<div class="fcmt"><b>${esc(c.from)}</b> ${esc(c.text)} <span class="fcmt-t">${fTime(c.time)}</span></div>`).join("")}
        <form class="fcmt-add" data-id="${esc(e.id)}"><input placeholder="${esc(tr("Add a comment…"))}" maxlength="300" aria-label="${esc(tr("Comment"))}"><button class="btn" type="submit">${esc(tr("Post"))}</button></form>
      </div>`:``}
    </div>`;
  }).join("");
  const F=$("feedList");
  F.querySelectorAll(".fdel").forEach(b=>b.addEventListener("click", async()=>{
    if(!(await ask(tr("Delete this post?"), {ok:tr("Delete"), danger:true}))) return;
    try{ const res=await api({action:"feeddelete", row:Number(b.dataset.row)}); FEED=res.feed||[]; renderFeed(); toast(tr("Post deleted")); }
    catch(err){ toast(tr("Could not delete: {0}", errText(err))); }
  }));
  F.querySelectorAll(".cheer").forEach(b=>b.addEventListener("click", async()=>{
    b.disabled=true;
    try{ const res=await api({action:"feedcheer", id:b.dataset.id}); FEED=res.feed||[]; renderFeed(); }
    catch(err){ toast(tr("Could not cheer: {0}", errText(err))); b.disabled=false; }
  }));
  F.querySelectorAll(".cmtbtn").forEach(b=>b.addEventListener("click", ()=>{
    const id=b.dataset.id; if(FEED_OPEN.has(id)) FEED_OPEN.delete(id); else FEED_OPEN.add(id); renderFeed();
  }));
  F.querySelectorAll(".fcmt-add").forEach(f=>f.addEventListener("submit", async ev=>{
    ev.preventDefault();
    const id=f.dataset.id, inp=f.querySelector("input"), text=inp.value.trim();
    if(!text) return;
    inp.disabled=true;
    try{ const res=await api({action:"feedcomment", id, text}); FEED=res.feed||[]; FEED_OPEN.add(id); renderFeed(); }
    catch(err){ toast(tr("Could not comment: {0}", errText(err))); inp.disabled=false; }
  }));
  F.querySelectorAll(".followbtn").forEach(b=>b.addEventListener("click", ()=>{
    b.disabled=true; toggleFollow(b.dataset.user, !iFollow(b.dataset.user));
  }));
  F.querySelectorAll(".fphoto").forEach(el=>{
    const id=el.dataset.photo;
    loadPhoto(id).then(src=>{ el.classList.add("ready"); el.innerHTML=`<img src="${src}" alt="${esc(tr("Shared photo"))}">`;
      el.addEventListener("click", ()=>openPhotoLightbox(src)); })
      .catch(()=>{ el.querySelector(".jphoto-ph").textContent="—"; });
  });
  updateFeedBadge();
}
function openShareModal(prefill){
  prefill=prefill||{};
  $("shType").value=prefill.type||"drank";
  $("shProducer").value=prefill.producer||"";
  $("shWine").value=prefill.wine||"";
  $("shVintage").value=prefill.vintage!=null?prefill.vintage:"";
  $("shRegion").value=prefill.region||"";
  $("shRating").value=prefill.rating||"";
  $("shNote").value="";
  $("shPhoto").value=""; $("shPhotoPrev").hidden=true; $("shPhotoPrev").removeAttribute("src"); $("shPhotoRemove").hidden=true;
  const me=(cfg.user||"").toLowerCase();
  $("shTo").innerHTML=`<option value="">${esc(tr("Everyone"))}</option>`+
    (FEED_USERS||[]).filter(u=>u.toLowerCase()!==me).map(u=>`<option value="${esc(u)}">${esc(u)}</option>`).join("");
  $("shErr").hidden=true;
  $("shareModal").classList.add("open"); $("shProducer").focus();
}
async function ensureFeedUsers(){ if(FEED_USERS&&FEED_USERS.length) return;
  try{ const r=await api({action:"feed"}); FEED=r.feed||[]; FEED_ME=r.me||""; FEED_USERS=r.users||[]; FEED_FOLLOWS=r.follows||[]; }catch(e){} }
async function shareWine(ev){
  if(ev) ev.preventDefault();
  const entry={ type:$("shType").value, to:$("shTo").value,
    producer:$("shProducer").value.trim(), wine:$("shWine").value.trim(),
    vintage:$("shVintage").value.trim(), region:$("shRegion").value.trim(),
    rating:$("shRating").value, note:$("shNote").value.trim() };
  const file=$("shPhoto").files[0];
  if(!entry.producer && !entry.wine && !entry.note && !file){ $("shErr").textContent=tr("Add a wine, a note or a photo."); $("shErr").hidden=false; return; }
  $("shSave").disabled=true; $("shErr").hidden=true;
  try{
    if(file){ try{ entry.photo=await shrinkImage(file); }catch(e){ /* skip a bad image */ } }
    const res=await api({action:"feedpost", entry});
    FEED=res.feed||[]; FEED_ME=res.me||FEED_ME; FEED_FOLLOWS=res.follows||FEED_FOLLOWS;
    $("shareModal").classList.remove("open");
    if(location.hash==="#feed"){ renderFeed(); markFeedSeen(); }
    toast(entry.to?tr("Sent to {0} 🍷", entry.to):tr("Shared to the feed 🍷"));
  }catch(err){ $("shErr").textContent=limitText(tr("Could not share: {0}", errText(err))); $("shErr").hidden=false; }
  $("shSave").disabled=false;
}
$("shPhoto").addEventListener("change", ()=>{
  const f=$("shPhoto").files[0], prev=$("shPhotoPrev");
  if(f){ prev.src=URL.createObjectURL(f); prev.hidden=false; $("shPhotoRemove").hidden=false; }
  else { prev.hidden=true; prev.removeAttribute("src"); $("shPhotoRemove").hidden=true; }
});
$("shPhotoRemove").addEventListener("click", ()=>{ $("shPhoto").value=""; $("shPhotoPrev").hidden=true; $("shPhotoPrev").removeAttribute("src"); $("shPhotoRemove").hidden=true; });
$("feedNewBtn").addEventListener("click", async()=>{ await ensureFeedUsers(); openShareModal(); });
$("shCancel").addEventListener("click", ()=>$("shareModal").classList.remove("open"));
$("shareModal").addEventListener("click", e=>{ if(e.target===$("shareModal")) $("shareModal").classList.remove("open"); });
$("shareForm").addEventListener("submit", shareWine);

async function toggleFollow(user, follow){
  // the target goes as "target": "user" is the signed-in account, and would be overwritten
  try{ const res=await api({action:follow?"follow":"unfollow", target:user}); FEED_FOLLOWS=res.follows||[]; renderFeed(); }
  catch(err){ toast(tr("Could not update follow: {0}", errText(err))); }
}

function route(){
  const h = location.hash;
  const page = h==="#journal" ? "journal" : h==="#enjoyed" ? "enjoyed" : h==="#wishlist" ? "wishlist"
             : h==="#feed" && document.body.classList.contains("social") ? "feed" : "cellar";
  $("pageCellar").hidden = page!=="cellar";
  $("pageEnjoyed").hidden = page!=="enjoyed";
  $("pageWishlist").hidden = page!=="wishlist";
  $("pageJournal").hidden = page!=="journal";
  $("pageFeed").hidden = page!=="feed";
  document.querySelectorAll(".tab").forEach(t=>
    t.classList.toggle("active", t.dataset.page===page));
  document.querySelectorAll("#ptabs button").forEach(t=>t.classList.toggle("on", t.dataset.page===page));
  $("pFab").hidden = page==="feed";
  if(page==="journal" && cfg.token) loadJournal();
  if(page==="wishlist" && cfg.token) loadWishlist();
  if(page==="feed" && cfg.token) loadFeed();
  if(page==="enjoyed") renderEnjoyed();
  hit(page);
}
document.querySelectorAll(".tab").forEach(t=>
  t.addEventListener("click", ()=>{ location.hash = t.dataset.page==="cellar" ? "" : t.dataset.page; }));
window.addEventListener("hashchange", route);

/* ---------- inactivity auto-logout ---------- */
// Sign out after 60 minutes with no interaction — and don't carry a session over
// a long gap (e.g. overnight): a stale timestamp means log in again on return. With "Stay signed in on this device"
// (the default) the limit is 30 days, as long as the server keeps a session that isn't used.
const STAY_MS = 30*24*60*60*1000, SHORT_MS = 60*60*1000;
const staySignedIn = () => localStorage.getItem("vinStay") !== "0";
const idleMs = () => staySignedIn() ? STAY_MS : SHORT_MS;
$("gateStay").checked = staySignedIn();
let lastActive = Date.now();
function markActive(){
  lastActive = Date.now();
  const prev = Number(localStorage.getItem("vinActive")||0);
  if(lastActive - prev > 15000) localStorage.setItem("vinActive", String(lastActive)); // throttle writes
}
function idleLogout(){
  forgetAuth(); localStorage.removeItem("vinActive");
  setGateMode("login");
  showGate(staySignedIn() ? tr("Your session expired after inactivity — log in again.") : tr("Signed out after 60 minutes of inactivity — log in again."));
}
function checkIdle(){ if(cfg.token && Date.now()-lastActive > idleMs()) idleLogout(); }
["click","keydown","pointerdown","scroll","touchstart"].forEach(ev=>
  document.addEventListener(ev, markActive, {passive:true, capture:true}));
document.addEventListener("visibilitychange", ()=>{ if(!document.hidden) checkIdle(); });
setInterval(checkIdle, 30*1000);

/* ---------- language: the picker redraws everything on screen ---------- */
if(window.I18N) window.I18N.onChange(()=>{
  if($("app").hidden) return;
  stampText();
  $("priceBtn").textContent = SHOW_PRICES ? tr("Hide prices") : tr("Show prices");
  if(WINES.length){ renderOverview(); renderTable(); renderEnjoyed(); }
  if(JENTRIES) renderJournal();
  if(WITEMS) renderWishlist();
  if(FEED) renderFeed();
  if($("jModal").classList.contains("open")) syncEnjoyOption();
  if($("addModal").classList.contains("open")) addSuggest();
  if($("eaModal").classList.contains("open")) EA_SUGGEST.run();
});

/* ---------- boot ---------- */
const bootActive = Number(localStorage.getItem("vinActive")||0);
const sessionFresh = bootActive && (Date.now()-bootActive < idleMs());
if(cfg.api && cfg.user && cfg.token && sessionFresh && localStorage.getItem("vinVault")==="1"){
  // an encrypted session: reopen the vault with the key kept for this session, or ask for the password again
  lastActive = bootActive;
  (async ()=>{
    const dek = window.VCRYPTO ? await VCRYPTO.recall(cfg.user) : null;
    try{ if(!dek) throw new Error("no-key"); await VAULT.start({post, user:cfg.user, token:cfg.token, dek, ...VAULT_HOOKS});
      $("acctBtn").hidden = false; $("app").hidden=false; loadData(); route(); recReminder(); }
    catch(err){ forgetAuth(); setGateMode("login"); showGate(tr("Log in again to unlock your cellar.")); }
  })();
}else if(cfg.api && cfg.user && cfg.token && sessionFresh){
  lastActive = bootActive; $("app").hidden=false; loadData(); route();
}else{
  const staleDrop = !!cfg.token && !sessionFresh; // had a session, but it went cold
  if(staleDrop) forgetAuth();                     // (e.g. overnight) — drop it
  localStorage.removeItem("vinActive");
  setGateMode("login");
  let made = ""; try{ made = sessionStorage.getItem("vinNewAccount") || ""; sessionStorage.removeItem("vinNewAccount"); }catch(e){}
  if(made){ $("gateUser").value = made;
    showGate(tr("Your account {0} is created. Log in with your password. If you didn't save the recovery code, make a new one under Account.", made)); }
  else showGate(staleDrop ? tr("Your session expired after inactivity — log in again.") : "");
}
