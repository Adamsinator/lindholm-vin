/* AllWine — cellar app. Data comes from the Apps Script API; nothing is stored here. */
"use strict";

// The interface language (i18n.js): tr(englishText, a, b) gives it in the chosen language, {0} {1} filled in.
const tr = (window.I18N && window.I18N.t) || ((s, ...a) => a.length ? s.replace(/\{(\d)\}/g, (m, i) => a[i] ?? "") : s);
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
  if(grape.includes("riesling") || has(reg,["mosel","saar","ruwer","rheingau","nahe","pfalz","rheinhessen","alsace"]))
    return grand?span(3,35):span(3,25);
  return style==="Hvid" ? span(1,6) : span(2,10);         // generic white / red
}

// Icon/top producers make wines that outlive the generic region+cru estimate —
// a Lafon village Meursault or a Roumier village Chambolle ages far longer than
// the appellation average — so push the drink-window's close out for them.
const TIER_LONGEVITY = {legend:14, top:7, solid:6};
function defaultWindow(w){
  const d = baseWindow(w);
  if(!d || d.to==null) return d;
  // No bonus where a great address doesn't add years: rosé, and non-vintage bubbles.
  const noBonus = w.style==="Rosé" || (w.style==="Bobler" && typeof w.vintage!=="number");
  const tier = (typeof PRODUCER_NOTES!=="undefined" && PRODUCER_NOTES[w.producer]) ? PRODUCER_NOTES[w.producer][0] : null;
  const bonus = noBonus ? 0 : (TIER_LONGEVITY[tier] || 0);
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
const state = {q:"", region:"", style:"", status:"cellar", ready:"", loc:"", sortK:"price", sortDir:-1};
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
function toast(msg){ msg = limitText(msg); const t=$("toast"); t.textContent=msg; t.style.opacity=1;
  clearTimeout(toastT); toastT=setTimeout(()=>t.style.opacity=0, 2600); }

/* ---------- overview (rebuilt on every data load) ---------- */
function renderOverview(){
  const cellar = WINES.filter(w=>w.left>0);
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
      tr("{0} different wines", cellar.length)+(anyBig?" · "+fmtLitres(litres)+" L":""), ""],
  ];
  if(SHOW_PRICES){
    const valueLeft = cellar.reduce((s,w)=>s+(w.price||0)*w.left,0);
    kpis.push([tr("Cellar value"), kr(valueLeft), tr("at purchase price"), ""]);
    kpis.push([tr("Avg. bottle"), kr(bottlesLeft?valueLeft/bottlesLeft:0), tr("cellar average"), ""]);
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
  const W=980,H=190,P={l:8,r:8,t:14,b:22};
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
  const panel=el.closest(".panel"); if(panel) panel.hidden = !chips;
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

/* ---------- when-to-drink timeline (respects the current table filters) ---------- */
function drawDrinkTimeline(list){
  const el=$("dwtl"), panel=$("dwPanel"); if(!el) return;
  const wins = list.filter(w=>w.left>0 && readiness(w)).map(w=>({w, win:drinkWindow(w), rd:readiness(w)}));
  if(!wins.length){ if(panel) panel.hidden=true; el.innerHTML=""; $("dwCount").textContent=""; return; }
  if(panel) panel.hidden=false;
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
        <input class="setdate" type="date" data-field="acquired" data-row="${w.row}" value="${w.acquired||""}"></label>
      ${w.drunk>0?`<label class="datewrap">${esc(tr("Last drunk"))}
        <input class="setdate" type="date" data-field="drunkDate" data-row="${w.row}" value="${w.drunkDate||""}"></label>`:""}
      ${(()=>{const est=defaultWindow(w), r=readiness(w);
        const ph=(x,d)=>x!=null?"≈"+x:d;
        return `<span class="winwrap">${esc(tr("Drink window"))}
        <input class="setwin" type="number" inputmode="numeric" placeholder="${ph(est&&est.from,esc(tr("from")))}" data-end="from" data-row="${w.row}" value="${w.drinkFrom??""}">
        <span class="wsep">–</span>
        <input class="setwin" type="number" inputmode="numeric" placeholder="${ph(est&&est.to,esc(tr("to")))}" data-end="to" data-row="${w.row}" value="${w.drinkTo??""}">
        ${r?`<span class="rbadge ${r.k}${r.est?" est":""}">${r.label}</span>`:""}
        ${r&&r.est?`<span class="est-note">${esc(tr("estimated · type to set your own"))}</span>`:""}</span>`;})()}
      <button class="jlog" data-row="${w.row}">📓 ${esc(tr("Log in journal"))}</button>
      <button class="fshare" data-row="${w.row}">📣 ${esc(tr("Share"))}</button>
      ${searchLinks(w)}
      <button class="winfo" data-row="${w.row}">✏️ ${esc(tr("Edit details"))}</button>
      <button class="drink del" data-act="delete" data-row="${w.row}">${isElsewhere(w) ? "🗑 "+esc(tr("Remove from Enjoyed")) : "🗑 "+esc(tr("Delete wine"))}</button>
    </div>`;
}

function renderTable(){
  const q = state.q.trim().toLowerCase();
  let list = WINES.filter(w=>{
    if(state.status==="cellar" && w.left===0) return false;
    if(state.status==="drunk" && w.drunk===0) return false;
    if(state.region && w.region!==state.region) return false;
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
  $("count").textContent = countTxt;
  $("clear").classList.toggle("show", !!(q||state.region||state.style||state.ready||state.loc||state.status!=="cellar"));
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
    return `<tr class="main${w.left===0?" gone":""}" data-i="${i}" data-row="${w.row}" tabindex="0" aria-expanded="false">
      <td><span class="prod">${esc(w.producer)}</span>${badge}${rbadge}<br><span class="wname">${fmtChip(w)}${esc(nm)}${classChip(w)}${w.rating?` · <span class="myscore">${w.rating}/10</span>`:""}</span>${w.location?`<br><span class="wloc">📍 ${esc(w.location)}</span>`:""}</td>
      <td class="num">${esc(w.vintage||"—")}</td>
      <td>${esc(w.region)}</td>
      <td><span class="sdot" style="background:var(${STYLE_VAR[w.style]||"--muted"})"></span>${tr(STYLE_EN[w.style])||esc(w.style)}</td>
      <td class="num">${state.status==="drunk"?w.drunk:w.left}</td>
      <td class="num">${SHOW_PRICES ? (w.price?kr(w.price):"—") : "···"}</td>
    </tr>
    <tr class="detail" hidden><td colspan="6"></td></tr>`;
  }).join("") + moreRow(list.length, shown.length, 6, "cellar");
  if(!list.length){
    const anyWines = WINES.some(w=>w.left>0);
    const msg = !anyWines ? esc(tr("Your cellar is empty — press ＋ Add wine to start building it."))
              : esc(tr("No wines match these filters."));
    $("rows").innerHTML = `<tr><td colspan="6" class="emptyrow">${msg}</td></tr>`;
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
  document.querySelectorAll(`${scope} tr.morerow button`).forEach(b=>b.addEventListener("click",()=>{
    PAGE_SIZE[b.dataset.tbl].n = b.dataset.all ? Infinity : PAGE_SIZE[b.dataset.tbl].n + PAGE_STEP;
    b.dataset.tbl==="cellar" ? renderTable() : renderEnjoyed();
  }));
}
// A wine's details are built when its row is first opened: a big cellar would otherwise build thousands of them on
// every render (and every keystroke in the search).
function fillDetail(d, row){
  const td = d.firstElementChild; if(!td || td.childElementCount) return;
  const w = WINES.find(x=>x.row===Number(row.dataset.row)); if(!w) return;
  td.innerHTML = detailHTML(w); bindDetail(td);
}
// The tables show a page at a time, and "Show more" adds the next; changing the search, a filter or the sort starts again
// from the top.
const PAGE_STEP = 200, PAGE_SIZE = {cellar:{n:PAGE_STEP, key:""}, enjoyed:{n:PAGE_STEP, key:""}};
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
async function loadData(quiet){
  if(!quiet){ $("spin").hidden = false; $("content").hidden = true; }
  if(cfg.user){ $("who").textContent = cfg.user; $("who").hidden = false; }
  try{
    const res = await api({action:"data"});
    WINES = normalize(res.wines);
    $("priceBtn").textContent = SHOW_PRICES ? tr("Hide prices") : tr("Show prices");
    renderOverview(); renderTable(); renderEnjoyed();
    LOADED_AT = new Date(); stampText();
    $("spin").hidden = true; $("content").hidden = false;
    loadJournalSilently(); loadFeedSilently();
  }catch(err){
    if(AUTH_ERRORS.has(err.message)){ forgetAuth(); setGateMode("login"); showGate(tr("Your session expired — log in again.")); }
    else { $("spin").textContent = tr("Could not reach the cellar API ({0}). Check your connection and refresh.", err.message); }
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
  }catch(err){ toast(tr("Could not save score: {0}", err.message)); }
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
  }catch(err){ toast(tr("Could not save value: {0}", err.message)); }
  inp.disabled = false;
}

async function setSizeApi(row, val, sel){
  sel.disabled = true;
  try{
    const res = await api({action:"setsize", row, value: val});
    WINES = normalize(res.wines);
    renderOverview(); renderTable(); renderEnjoyed();
    toast(val ? tr("Format set to {0}", tr(val)) : tr("Back to a standard bottle"));
  }catch(err){ toast(tr("Could not save format: {0}", err.message)); }
  sel.disabled = false;
}

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
  }catch(err){ toast(tr("Could not save window: {0}", err.message)); }
  ins.forEach(x=>x.disabled=false);
}

async function setLocationApi(row, val, inp){
  inp.disabled = true;
  try{
    const res = await api({action:"setinfo", row, fields:{location:String(val||"").trim()}});
    KEEP_OPEN = row; WINES = normalize(res.wines);
    renderOverview(); renderTable(); renderEnjoyed();
    toast(String(val||"").trim() ? tr("Location saved") : tr("Location cleared"));
  }catch(err){ toast(tr("Could not save location: {0}", err.message)); inp.disabled = false; }
}

async function setDateApi(row, field, val, inp){
  inp.disabled = true;
  const acq = field==="acquired";
  try{
    const res = await api({action:"setdate", row, field, value: val||""});
    WINES = normalize(res.wines);
    renderOverview(); renderTable(); renderEnjoyed();
    toast(acq ? (val ? tr("Acquired date updated") : tr("Acquired date cleared")) : (val ? tr("Last-drunk date updated") : tr("Last-drunk date cleared")));
  }catch(err){ toast(tr("Could not save date: {0}", err.message)); }
  inp.disabled = false;
}

async function rowAction(act, row, btn){
  const w = WINES.find(x=>x.row===row);
  if(act==="delete"){
    const name = w ? `${w.producer} ${w.name} ${w.vintage||""}`.trim() : tr("this wine");
    if(!confirm(w && isElsewhere(w) ? tr("Remove {0} from Enjoyed?\nYour journal entries for it stay.", name) : tr("Delete {0} from the cellar?\nThis removes the whole row from the sheet.", name))) return;
  }
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
    toast(act==="drink" ? tr("Skål! Bottle marked as drunk 🍷")
        : act==="undrink" ? tr("Bottle back in the cellar 🍾")
        : tr("Wine deleted from the sheet"));
    if(wasLast){
      const nw = WINES.find(x=>x.row===row) || w;
      setTimeout(()=>{
        if(confirm(tr("That was your last {0} 🍷\nLog a tasting note in the journal?", `${nw.producer}${nw.name?" "+nw.name:""}${nw.vintage?" "+nw.vintage:""}`)))
          openJournalModal({producer:nw.producer, wine:nw.name, vintage:nw.vintage,
            country:nw.country, region:nw.region, grape:nw.grape, commune:nw.commune, classification:nw.classification});
      }, 250);
    }
  }catch(err){ toast(tr("Could not update: {0}", err.message)); btn.disabled=false; btn.textContent=label; }
}

async function addWine(e){
  e.preventDefault();
  const btn = $("addSave"); btn.disabled = true; btn.textContent = tr("Adding…");
  const v = id => $(id).value.trim();
  const wine = {
    producer:v("aProducer"), name:v("aName"), commune:v("aCommune"),
    country:v("aCountry"), region:v("aRegion"), classification:v("aClass"),
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
  }catch(err){ toast(tr("Could not add: {0}", err.message)); }
  btn.disabled = false; btn.textContent = tr("Add to cellar");
}

/* ---------- gate ---------- */
let GATE_MODE = "login"; // or "signup"
if(window.I18N) window.I18N.onChange(() => setGateMode(GATE_MODE));
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
  $("gateLead").textContent = tr(signup ? "Create your own cellar. You'll need an invite code."
    : recover ? "Enter your recovery code and choose a new password."
    : "Your private cellar. Log in to continue.");
  $("gateSubmit").textContent = tr(signup ? "Create account" : recover ? "Set new password" : "Log in");
  $("gateToggle").textContent = tr(signup || recover ? "Have an account? Log in" : "Need an account? Sign up");
  $("gatePass").setAttribute("autocomplete", signup || recover ? "new-password" : "current-password");
  document.querySelector('label[for="gatePass"]').textContent = tr(recover ? "New password" : "Password");
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
// Friendly text for the error codes the API returns.
const AUTH_MSG = {
  "bad-login":"Wrong username or password.", "bad-invite":"That invite code isn't right, or it has already been used.",
  "locked":"Too many wrong tries — wait 15 minutes and try again.", "signup-full":"There's no room for new accounts right now. Ask the owner.",
  "signup-busy":"Too many sign-ups just now — try again in an hour.",
  "signup-disabled":"Signups are closed right now.", "user-taken":"That username is taken.",
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
  if(window.VAULT) VAULT.stop();
  localStorage.removeItem("vinVault"); $("acctBtn").hidden = true;
  localStorage.removeItem("vinUser"); localStorage.removeItem("vinToken"); localStorage.removeItem("vinActive");
  cfg.user=""; cfg.token="";
  // Drop the previous user's cached data so the next login can't see it (the
  // journal/wishlist loaders short-circuit on these).
  WINES=[]; JENTRIES=null; WITEMS=null; KEEP_OPEN=null; FEED=null; FEED_USERS=[]; FEED_FOLLOWS=[]; FEED_VIEW="all"; FEED_OPEN.clear();
  const b=$("feedBadge"); if(b) b.hidden=true;
}
function enterApp(){ $("gate").hidden = true; $("app").hidden = false; markActive(); loadData(); route(); }

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
    const data = await post({action:"signup", user, code:$("gateInvite").value.trim(), turnstile:humanToken(), ...k.fields});
    if(!data.ok) throw new Error(data.error);
    cfg.user = data.user; VAULT.rememberSalt(data.user, k.fields);
    await showRecoveryCode(k.recoveryCode);
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
  if(GATE_MODE!=="login" && pass.length < 8){ $("gateErr").textContent = tr("Use a password of at least 8 characters."); return; }
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
      ? {action:"signup", user, pass, code:$("gateInvite").value.trim(), turnstile:humanToken()}
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
      : tr("Could not reach the cellar API ({0}).", m);
  }
  finally{ $("gateSubmit").disabled = false; if(GATE_MODE!=="login") humanReset(); }
});

/* ---------- account: change password, new recovery code ---------- */
$("acctBtn").addEventListener("click", ()=>{ $("acctErr").textContent=""; $("acctPass").value=""; $("acctNew").value=""; $("acctModal").classList.add("open"); $("acctPass").focus(); });
$("acctCancel").addEventListener("click", ()=>$("acctModal").classList.remove("open"));
$("acctForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const oldPass = $("acctPass").value, newPass = $("acctNew").value;
  if(!oldPass || newPass.length < 8){ $("acctErr").textContent = tr("Enter your current password and a new one of at least 8 characters."); return; }
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
  }catch(err){ $("acctErr").textContent = authMsg(String(err.message).replace(/^Error: /,"")); }
});

/* ---------- header actions ---------- */
$("refreshBtn").addEventListener("click", loadData);
$("lockBtn").addEventListener("click", ()=>{ if(window.VAULT) VAULT.forgetCache(cfg.user); forgetAuth(); setGateMode("login"); showGate(tr("Signed out. Log in to reopen.")); });
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
  $("impPick").hidden = false; $("impMap").hidden = true; $("impBack").hidden = true; $("impGo").hidden = true;
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
    toast(tr("{0} wines imported 🍷", done));
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
$("impCancel").addEventListener("click", ()=>$("impModal").classList.remove("open"));
$("impBack").addEventListener("click", impReset);
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
  if(!window.SOMM_DATA) need.push("sommelier-data.js?v=2");
  if(!window.SOMMELIER) need.push("sommelier.js?v=2");
  if(!window.BURG_VINTAGES) need.push("burgundy-vintages.js?v=5");
  if(["da","fr","de"].includes(lang) && !(window.BURG_I18N && BURG_I18N[lang])) need.push(`burgundy-i18n-${lang}.js?v=${lang==="de"?1:5}`);
  SOMM.lang = lang;
  return SOMM.ready = need.reduce((pr, src) => pr.then(() => loadJS(src)), Promise.resolve()).catch(e => { SOMM.ready = null; throw e; });
}
function sommCtx(){
  const lang = (window.I18N && I18N.lang) || "en";
  return {lang, wines:WINES, burg:window.BURG, vint:window.BURG_VINTAGES, burgI18n:(window.BURG_I18N||{})[lang] || null,
    readiness, window:drinkWindow, notes:Object.fromEntries(Object.entries(window.PRODUCER_NOTES||{}).map(([k,v])=>[k,[v[0],noteText(v[1])]]))};
}
function sommSay(html, who){
  const d = document.createElement("div"); d.className = who === "q" ? "sm-q" : "sm-a";
  if(who === "q") d.textContent = html; else d.innerHTML = html; // the answer is built escaped by sommelier.js
  $("sommLog").appendChild(d); $("sommLog").scrollTop = $("sommLog").scrollHeight;
}
function sommChips(list){
  $("sommChips").innerHTML = (list || []).map(c => `<button type="button">${esc(c)}</button>`).join("");
}
async function sommAsk(q){
  q = String(q || "").trim(); if(!q) return;
  sommSay(q, "q"); $("sommQ").value = "";
  try{ await sommLoad(); const r = SOMMELIER.answer(q, sommCtx()); sommSay(r.html); sommChips(r.chips); }
  catch(err){ sommSay(esc(tr("The sommelier couldn't load ({0}). Check your connection and try again.", err.message))); }
}
async function sommOpen(){
  $("sommPanel").hidden = false; $("sommBtn").hidden = true;
  if(!$("sommLog").children.length){
    try{ await sommLoad(); const r = SOMMELIER.answer("", sommCtx()); sommSay(r.html); sommChips(r.chips); }
    catch(err){ sommSay(esc(tr("The sommelier couldn't load ({0}). Check your connection and try again.", err.message))); }
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
    toast(tr("Saved {0}", a.download));
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

/* ---------- filters / sorting (bound once) ---------- */
// a big cellar waits for a pause in the typing instead of filtering thousands of wines on every key
let Q_T = null;
$("q").addEventListener("input",e=>{ state.q=e.target.value; clearTimeout(Q_T);
  if(WINES.length > 2000) Q_T = setTimeout(renderTable, 160); else renderTable(); });
$("fRegion").addEventListener("change",e=>{ state.region=e.target.value; renderTable(); });
$("fLoc").addEventListener("change",e=>{ state.loc=e.target.value; renderTable(); });
$("fStyle").addEventListener("change",e=>{ state.style=e.target.value; renderTable(); });
$("fStatus").addEventListener("change",e=>{ state.status=e.target.value; renderTable(); });
$("fReady").addEventListener("change",e=>{ state.ready=e.target.value; renderTable(); });
$("clear").addEventListener("click",()=>{
  state.q=state.region=state.style=state.ready=state.loc=""; state.status="cellar";
  $("q").value=""; $("fRegion").value=""; $("fStyle").value=""; $("fStatus").value="cellar"; $("fReady").value=""; $("fLoc").value=""; renderTable(); });
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
const LANDS = {
  France:[[7.62,47.59],[7.34,47.43],[6.97,47.45],[7.0,47.32],[6.46,46.95],[5.97,46.21],[6.2,46.19],[6.43,46.43],[6.78,46.41],[6.77,46.17],[7.02,45.93],[6.79,45.74],[7.15,45.4],[7.08,45.24],[6.63,45.12],[7.03,44.72],[6.87,44.39],[7.68,44.08],[7.49,43.77],[6.57,43.2],[5.81,43.1],[5.06,43.44],[4.71,43.37],[3.91,43.56],[3.26,43.19],[3.05,42.92],[3.21,42.43],[2.65,42.34],[1.99,42.36],[1.71,42.6],[0.76,42.84],[0.52,42.69],[-0.59,42.8],[-1.3,43.1],[-1.46,43.05],[-1.41,43.24],[-1.79,43.37],[-1.48,43.56],[-1.25,44.56],[-1.08,44.69],[-1.25,44.67],[-1.08,45.53],[-0.55,45.0],[-0.79,45.47],[-1.2,45.71],[-1.03,45.74],[-1.15,46.31],[-1.79,46.51],[-2.09,46.87],[-2.02,47.04],[-2.15,47.22],[-1.74,47.22],[-2.5,47.31],[-2.43,47.47],[-2.77,47.51],[-2.79,47.63],[-4.31,47.82],[-4.68,48.04],[-4.33,48.17],[-4.58,48.29],[-4.24,48.3],[-4.72,48.36],[-4.72,48.54],[-3.23,48.84],[-2.69,48.54],[-2.45,48.65],[-2.0,48.58],[-1.91,48.7],[-1.38,48.65],[-1.57,48.81],[-1.58,49.2],[-1.86,49.68],[-1.26,49.68],[-1.14,49.39],[-0.16,49.3],[0.42,49.45],[0.13,49.51],[0.19,49.7],[1.25,50.0],[1.59,50.25],[1.67,50.89],[2.52,51.1],[2.76,50.75],[3.11,50.78],[3.69,50.31],[4.17,50.25],[4.18,49.96],[4.55,49.96],[4.82,50.15],[4.87,49.79],[5.51,49.51],[6.24,49.49],[6.74,49.16],[8.13,48.97],[7.62,48.16],[7.57,47.61]],
  "France~1":[[9.48,42.81],[9.55,42.13],[9.19,41.38],[8.81,41.59],[8.89,41.7],[8.72,41.76],[8.57,42.22],[8.71,42.55],[9.31,42.71],[9.36,43.02],[9.48,42.86]],
  Spain:[[-1.79,43.41],[-1.41,43.24],[-1.43,43.04],[-1.3,43.1],[-0.04,42.69],[0.63,42.69],[0.7,42.85],[1.35,42.69],[1.45,42.44],[2.65,42.34],[3.21,42.43],[3.25,41.94],[2.08,41.29],[1.03,41.06],[0.71,40.82],[0.89,40.72],[0.6,40.61],[-0.33,39.52],[-0.2,39.06],[0.2,38.76],[-0.52,38.32],[-0.81,37.77],[-0.77,37.6],[-1.33,37.56],[-1.64,37.39],[-2.19,36.75],[-4.37,36.72],[-4.67,36.51],[-5.17,36.42],[-5.55,36.04],[-6.17,36.33],[-6.41,36.73],[-6.22,36.91],[-6.4,36.83],[-6.86,37.28],[-7.41,37.18],[-7.5,37.52],[-6.96,38.19],[-7.11,38.18],[-7.34,38.46],[-7.0,39.06],[-7.54,39.66],[-6.98,39.8],[-6.9,40.02],[-7.03,40.17],[-6.81,40.34],[-6.93,41.01],[-6.22,41.56],[-6.54,41.67],[-6.62,41.94],[-8.15,41.81],[-8.27,42.14],[-8.85,41.93],[-8.89,42.11],[-8.69,42.27],[-8.82,42.29],[-8.81,42.64],[-9.03,42.59],[-8.93,42.8],[-9.24,42.98],[-9.18,43.17],[-8.36,43.4],[-8.26,43.58],[-7.7,43.76],[-7.06,43.55],[-5.85,43.65],[-4.52,43.42],[-3.6,43.52],[-3.05,43.37],[-1.83,43.4]],
  Portugal:[[-8.78,41.94],[-8.27,42.14],[-8.15,41.81],[-6.62,41.94],[-6.54,41.67],[-6.21,41.53],[-6.93,41.01],[-6.81,40.34],[-7.03,40.17],[-6.9,40.02],[-6.98,39.8],[-7.54,39.66],[-7.0,39.06],[-7.34,38.46],[-7.11,38.18],[-6.96,38.19],[-7.44,37.73],[-7.41,37.18],[-7.83,37.01],[-8.6,37.12],[-9.0,37.03],[-8.81,37.43],[-8.88,38.45],[-8.67,38.42],[-9.21,38.45],[-9.25,38.66],[-8.79,39.08],[-9.14,38.74],[-9.48,38.8],[-9.37,39.34],[-8.84,40.12],[-8.68,40.75],[-8.76,41.7],[-8.88,41.83]],
  Italy:[[7.02,45.93],[7.79,45.92],[8.42,46.45],[8.46,46.25],[9.02,45.85],[9.3,46.5],[9.53,46.31],[9.94,46.36],[10.08,46.23],[10.09,46.6],[10.43,46.55],[10.45,46.86],[10.99,46.78],[11.24,46.98],[12.17,47.08],[12.39,46.7],[13.7,46.52],[13.38,46.26],[13.63,46.18],[13.49,45.99],[13.87,45.61],[13.72,45.59],[13.63,45.77],[13.21,45.77],[12.27,45.45],[12.23,45.24],[12.52,44.97],[12.25,44.72],[12.4,44.22],[13.56,43.57],[14.01,42.69],[14.54,42.24],[15.17,41.93],[16.16,41.9],[15.9,41.51],[17.95,40.66],[18.46,40.22],[18.34,39.82],[18.08,39.94],[17.87,40.28],[17.18,40.5],[16.93,40.46],[16.52,39.75],[17.11,39.38],[17.17,39.0],[16.62,38.8],[16.55,38.41],[16.06,37.94],[15.65,38.03],[15.88,38.61],[16.2,38.76],[16.21,38.94],[15.69,39.99],[14.95,40.24],[14.77,40.67],[14.34,40.6],[14.46,40.73],[14.04,40.81],[13.73,41.24],[13.09,41.24],[11.64,42.29],[11.1,42.42],[11.17,42.54],[10.51,42.97],[10.25,43.85],[10.05,44.02],[8.77,44.42],[8.0,43.88],[7.49,43.77],[7.64,44.16],[7.32,44.14],[6.9,44.34],[6.99,44.83],[6.63,45.07],[7.15,45.38],[6.79,45.74],[6.94,45.87]],
  "Italy~1":[[15.58,38.22],[15.1,37.46],[15.3,37.06],[15.11,36.69],[14.56,36.78],[14.14,37.1],[12.64,37.59],[12.44,37.82],[12.55,38.05],[12.73,38.18],[12.9,38.03],[13.29,38.19],[13.79,37.98],[15.63,38.27]],
  "Italy~2":[[9.63,40.88],[9.81,40.5],[9.64,40.27],[9.56,39.17],[9.06,39.24],[8.97,38.96],[8.65,38.93],[8.42,39.21],[8.55,39.84],[8.41,39.92],[8.47,40.29],[8.19,40.65],[8.2,40.87],[8.7,40.9],[9.23,41.26],[9.62,41.02],[9.57,40.91]],
  Germany:[[9.52,47.52],[8.57,47.78],[8.43,47.59],[7.57,47.61],[7.62,48.16],[8.13,48.97],[6.74,49.16],[6.34,49.45],[6.49,49.8],[6.11,50.09],[6.36,50.32],[6.34,50.45],[5.86,51.03],[6.13,51.15],[6.2,51.45],[5.95,51.8],[6.74,51.91],[6.72,52.08],[7.02,52.27],[7.0,52.42],[6.69,52.53],[7.01,52.63],[7.18,52.97],[7.2,53.28],[7.05,53.38],[7.21,53.65],[8.01,53.69],[8.11,53.47],[8.25,53.45],[8.33,53.61],[8.5,53.39],[8.62,53.88],[9.21,53.86],[9.78,53.55],[8.98,53.93],[8.91,54.26],[8.64,54.29],[8.96,54.54],[8.67,54.9],[9.62,54.86],[10.02,54.67],[9.87,54.47],[11.01,54.38],[11.01,54.18],[10.81,54.08],[10.92,54.0],[11.4,53.94],[12.58,54.47],[13.72,54.15],[13.87,53.85],[14.26,53.73],[14.41,53.2],[14.13,52.88],[14.62,52.53],[14.55,52.36],[14.75,52.08],[14.6,51.83],[15.02,51.25],[14.77,50.82],[14.32,51.04],[14.37,50.9],[12.94,50.41],[12.55,50.39],[12.28,50.18],[12.09,50.3],[12.51,49.9],[12.39,49.74],[12.68,49.41],[13.81,48.77],[13.72,48.54],[13.49,48.58],[13.37,48.36],[12.76,48.11],[12.95,47.89],[12.9,47.72],[13.05,47.66],[13.01,47.48],[12.21,47.72],[11.04,47.39],[10.44,47.55],[10.18,47.28],[9.97,47.51],[9.55,47.53]],
  Austria:[[9.53,47.27],[9.63,47.47],[9.52,47.52],[9.75,47.58],[10.18,47.28],[10.44,47.55],[11.04,47.39],[12.21,47.72],[13.01,47.48],[12.81,48.16],[13.37,48.36],[13.49,48.58],[13.72,48.54],[13.81,48.77],[14.05,48.6],[14.69,48.6],[14.99,49.0],[16.06,48.75],[16.54,48.8],[16.95,48.6],[16.87,48.39],[17.15,48.01],[17.07,47.71],[16.42,47.67],[16.68,47.54],[16.44,47.4],[16.45,47.01],[16.04,46.84],[15.96,46.68],[14.89,46.61],[14.55,46.4],[12.48,46.67],[12.15,46.94],[12.17,47.08],[11.24,46.98],[10.93,46.77],[10.35,46.98],[10.13,46.85],[9.58,47.06],[9.54,47.25]],
  Switzerland:[[9.52,47.52],[9.63,47.47],[9.49,47.06],[10.13,46.85],[10.35,46.98],[10.45,46.9],[10.43,46.55],[10.09,46.6],[10.13,46.24],[9.94,46.36],[9.53,46.31],[9.3,46.5],[8.95,45.83],[8.82,46.08],[8.46,46.25],[8.42,46.45],[7.79,45.92],[7.06,45.9],[6.77,46.17],[6.76,46.42],[6.43,46.43],[5.97,46.15],[6.16,46.61],[6.95,47.27],[6.97,47.45],[8.45,47.6],[8.57,47.65],[8.4,47.69],[8.57,47.78],[9.35,47.6]],
  Denmark:[[9.74,54.83],[8.67,54.9],[8.62,55.42],[8.13,55.6],[8.16,56.61],[8.67,56.5],[8.89,56.74],[9.2,56.7],[9.25,57.01],[8.99,57.02],[8.77,56.73],[8.47,56.66],[8.27,56.75],[8.43,56.98],[9.43,57.17],[9.96,57.58],[10.61,57.74],[10.44,57.56],[10.52,57.24],[10.3,57.0],[10.28,56.62],[10.93,56.44],[10.75,56.24],[10.32,56.21],[10.18,55.87],[9.9,55.84],[10.02,55.76],[9.59,55.49],[9.67,55.27],[9.45,55.04],[9.71,54.93]],
  "Denmark~1":[[12.57,55.79],[12.22,55.47],[12.41,55.29],[12.09,55.19],[12.05,54.82],[11.86,54.77],[11.65,55.19],[11.29,55.2],[10.98,55.72],[11.63,55.96],[11.82,55.7],[11.87,55.97],[12.22,56.12],[12.58,56.06],[12.52,55.92]],
  "Denmark~2":[[10.65,55.61],[10.79,55.13],[10.44,55.05],[9.99,55.16],[9.86,55.52],[10.62,55.61]],
  "Denmark~3":[[11.36,54.89],[11.74,54.81],[11.77,54.68],[11.04,54.77],[11.06,54.94],[11.26,54.95]],
  "Denmark~4":[[15.09,55.02],[14.68,55.1],[14.71,55.24],[15.14,55.09]],
  "United Kingdom":[[-2.67,51.62],[-3.56,51.41],[-3.89,51.59],[-4.23,51.57],[-4.09,51.66],[-4.39,51.74],[-4.9,51.63],[-5.26,51.88],[-4.15,52.33],[-3.98,52.54],[-4.1,52.92],[-4.68,52.81],[-4.27,53.14],[-3.76,53.31],[-3.1,53.26],[-3.17,53.39],[-3.06,53.43],[-2.75,53.31],[-3.06,53.51],[-2.87,54.18],[-3.17,54.13],[-3.59,54.56],[-3.46,54.77],[-3.04,54.95],[-3.96,54.78],[-4.82,54.85],[-4.91,54.69],[-5.14,54.86],[-5.17,54.99],[-4.68,55.5],[-4.89,55.7],[-4.83,55.93],[-4.58,55.94],[-4.84,56.05],[-4.8,56.16],[-5.21,55.89],[-5.22,56.07],[-5.0,56.23],[-5.38,56.02],[-5.56,55.39],[-5.77,55.36],[-5.5,55.8],[-5.62,55.81],[-5.53,56.25],[-5.19,56.76],[-5.65,56.53],[-6.13,56.72],[-5.73,56.85],[-5.86,56.9],[-5.56,57.23],[-5.79,57.38],[-5.58,57.55],[-5.74,57.67],[-5.61,57.88],[-5.16,57.88],[-5.41,58.07],[-5.34,58.24],[-5.01,58.26],[-5.02,58.57],[-3.05,58.63],[-3.21,58.32],[-3.99,57.96],[-4.04,57.85],[-3.86,57.82],[-4.13,57.58],[-3.29,57.71],[-1.87,57.61],[-1.78,57.47],[-2.5,56.64],[-3.31,56.36],[-2.89,56.4],[-2.67,56.25],[-3.36,56.03],[-3.79,56.1],[-2.15,55.9],[-1.66,55.57],[-1.23,54.7],[-0.08,54.12],[-0.21,54.02],[0.12,53.61],[-0.66,53.72],[-0.29,53.69],[0.27,53.34],[0.36,53.16],[0.05,52.91],[0.28,52.81],[0.56,52.97],[1.06,52.96],[1.72,52.68],[1.56,52.09],[1.23,51.97],[1.19,51.8],[0.75,51.73],[0.89,51.57],[0.42,51.47],[1.41,51.36],[1.4,51.18],[0.96,50.93],[0.21,50.76],[-1.42,50.9],[-1.33,50.82],[-1.52,50.75],[-2.03,50.73],[-2.04,50.6],[-3.0,50.72],[-3.4,50.63],[-3.68,50.24],[-4.19,50.39],[-4.73,50.29],[-5.12,50.04],[-5.62,50.05],[-4.19,51.19],[-3.14,51.21],[-2.54,51.7]],
  "United Kingdom~1":[[-6.22,54.09],[-6.65,54.06],[-7.01,54.41],[-7.32,54.13],[-7.61,54.14],[-8.14,54.45],[-7.75,54.59],[-7.91,54.7],[-7.55,54.77],[-7.22,55.09],[-6.13,55.22],[-5.72,54.82],[-5.88,54.64],[-5.58,54.66],[-5.47,54.5],[-5.67,54.55],[-5.61,54.27],[-6.12,54.06]],
  Ireland:[[-7.22,55.09],[-7.55,54.77],[-7.91,54.7],[-7.75,54.59],[-8.14,54.45],[-7.61,54.14],[-7.32,54.13],[-7.01,54.41],[-6.65,54.06],[-6.18,54.05],[-6.35,53.94],[-6.03,52.93],[-6.46,52.35],[-6.33,52.25],[-6.97,52.25],[-8.06,51.83],[-8.41,51.89],[-8.41,51.71],[-9.3,51.5],[-9.84,51.48],[-9.58,51.69],[-10.12,51.6],[-9.6,51.87],[-10.08,51.77],[-10.38,51.87],[-9.91,52.12],[-10.36,52.21],[-9.77,52.25],[-9.91,52.4],[-9.63,52.55],[-8.78,52.68],[-8.99,52.76],[-9.92,52.57],[-9.46,52.82],[-9.3,53.1],[-8.93,53.21],[-10.09,53.41],[-10.12,53.55],[-9.72,53.6],[-9.9,53.73],[-9.58,53.81],[-9.91,53.86],[-9.86,54.1],[-10.09,54.16],[-10.06,54.26],[-8.55,54.24],[-8.62,54.35],[-8.13,54.64],[-8.76,54.68],[-8.38,54.89],[-8.27,55.15],[-7.67,55.26],[-7.56,55.12],[-7.66,54.97],[-7.31,55.37],[-6.96,55.24],[-7.17,55.14]],
  Netherlands:[[5.99,50.75],[5.64,50.84],[5.8,51.15],[5.21,51.28],[5.03,51.47],[4.5,51.47],[4.37,51.36],[3.45,51.54],[4.27,51.47],[4.0,51.6],[4.18,51.61],[3.95,51.81],[4.48,52.31],[4.77,52.94],[5.87,53.38],[6.82,53.44],[7.2,53.28],[7.03,52.65],[6.69,52.53],[7.0,52.42],[7.02,52.27],[6.72,52.08],[6.74,51.91],[5.95,51.8],[6.2,51.45],[6.13,51.15],[5.86,51.03],[6.05,50.9]],
  "Netherlands~1":[[4.23,51.39],[3.9,51.21],[3.43,51.25],[3.35,51.38],[4.11,51.36]],
  Belgium:[[4.23,51.39],[5.03,51.47],[5.21,51.28],[5.8,51.15],[5.64,50.84],[6.24,50.6],[6.36,50.32],[5.74,49.92],[5.88,49.64],[5.79,49.54],[5.51,49.51],[4.87,49.79],[4.82,50.15],[4.55,49.96],[4.15,49.97],[4.17,50.25],[3.69,50.31],[3.11,50.78],[2.76,50.75],[2.52,51.1],[3.35,51.38],[3.43,51.25],[3.9,51.21],[4.21,51.35]],
  Luxembourg:[[6.12,50.12],[6.48,49.71],[6.34,49.45],[5.82,49.51],[5.74,49.92],[5.98,50.17],[6.11,50.12]],
  Norway:[[20.62,69.04],[20.12,69.02],[20.35,68.85],[19.97,68.54],[20.24,68.48],[19.97,68.36],[18.3,68.56],[18.16,68.53],[18.18,68.2],[17.92,67.96],[17.32,68.1],[16.78,67.9],[16.57,67.62],[16.13,67.43],[16.4,67.05],[15.42,66.49],[15.48,66.31],[14.54,66.13],[14.63,65.79],[14.48,65.3],[13.65,64.58],[14.08,64.46],[14.06,64.1],[12.79,64],[12.18,63.6],[12.0,63.29],[12.22,63.0],[12.11,62.59],[12.3,62.29],[12.16,61.72],[12.88,61.35],[12.71,61.06],[12.29,61.0],[12.59,60.45],[12.49,60.11],[11.93,59.86],[11.68,59.59],[11.8,59.29],[11.64,58.93],[10.83,59.18],[10.64,59.39],[10.6,59.76],[10.57,59.59],[10.4,59.52],[10.43,59.28],[10.18,59.01],[9.84,58.96],[9.56,59.11],[9.66,58.97],[8.52,58.3],[7.47,58.02],[6.59,58.1],[6.66,58.26],[5.59,58.62],[5.61,59.01],[6.1,58.87],[6.36,59.0],[6.1,58.95],[5.89,59.1],[5.95,59.3],[6.4,59.56],[5.36,59.17],[5.13,59.23],[5.3,59.64],[6.22,59.82],[5.73,59.86],[6.14,60.23],[6.52,60.41],[6.53,60.15],[6.72,60.42],[7.0,60.51],[6.15,60.35],[5.15,59.64],[5.21,60.09],[5.69,60.12],[5.29,60.21],[5.14,60.45],[5.65,60.69],[5.12,60.64],[5.01,61.04],[6.78,61.14],[7.04,60.95],[7.04,61.09],[7.6,61.21],[7.35,61.3],[7.44,61.43],[7.17,61.17],[6.6,61.29],[6.38,61.13],[5.11,61.19],[5.0,61.43],[5.34,61.49],[4.93,61.71],[4.93,61.88],[6.73,61.87],[5.27,61.94],[5.1,62.03],[5.14,62.16],[5.91,62.42],[6.58,62.41],[6.14,62.41],[6.35,62.61],[7.57,62.55],[7.69,62.59],[7.54,62.67],[8.1,62.73],[6.73,62.72],[6.94,62.93],[7.57,63.1],[8.1,63.09],[8.62,62.85],[8.16,63.16],[8.64,63.34],[8.36,63.5],[8.58,63.6],[9.14,63.59],[9.16,63.46],[9.7,63.62],[10.02,63.39],[10.76,63.46],[10.73,63.62],[11.37,63.8],[11.18,63.9],[11.46,64.0],[11.21,64.03],[10.91,63.92],[11.05,63.85],[10.93,63.77],[10.06,63.51],[9.59,63.68],[9.61,63.79],[10.57,64.42],[11.52,64.74],[11.3,64.75],[11.49,64.98],[12.16,65.18],[12.51,65.1],[12.92,65.34],[12.42,65.18],[12.12,65.36],[12.69,65.9],[13.03,65.96],[12.78,66.1],[14.03,66.3],[13.12,66.23],[13.07,66.43],[13.21,66.64],[13.96,66.79],[13.65,66.91],[14.34,67.16],[15.42,67.2],[14.44,67.27],[14.96,67.57],[15.59,67.35],[15.69,67.52],[15.25,67.6],[15.3,67.77],[14.78,67.67],[15.05,67.96],[15.62,67.95],[15.32,68.07],[16.01,68.23],[16.31,67.88],[16.26,68.0],[16.39,68.09],[16.2,68.32],[17.57,68.45],[16.58,68.47],[16.58,68.59],[17.13,68.69],[17.7,69.1],[18.1,69.16],[18.08,69.33],[18.26,69.47],[18.92,69.34],[18.61,69.49],[19.2,69.75],[19.72,69.78],[19.64,69.42],[19.96,69.82],[20.32,69.95],[20.34,69.62],[20.05,69.33],[20.74,69.52],[20.53,69.69],[20.62,69.91],[21.43,70.01],[21.97,69.83],[21.8,70.07],[21.36,70.23],[22.68,70.37],[23.35,69.98],[23.38,70.25],[24.42,70.7],[24.26,70.83],[24.66,71.0],[25.77,70.85],[25.21,70.49],[25.04,70.11],[26.51,70.91],[26.73,70.85],[26.56,70.67],[26.59,70.41],[26.99,70.51],[27.18,70.74],[27.55,70.8],[27.24,70.95],[27.6,71.09],[28.39,70.98],[28.33,70.83],[27.9,70.68],[28.27,70.67],[28.19,70.25],[28.83,70.86],[29.74,70.65],[30.07,70.7],[30.21,70.54],[30.93,70.4],[30.94,70.27],[30.26,70.12],[28.8,70.09],[29.6,69.98],[29.64,69.78],[29.79,69.73],[30.09,69.72],[30.24,69.86],[30.43,69.72],[30.87,69.78],[30.86,69.54],[30.18,69.64],[30.09,69.43],[29.39,69.3],[28.97,69.02],[28.85,69.18],[29.33,69.47],[29.14,69.67],[27.89,70.06],[26.58,69.93],[26.01,69.65],[25.77,69.28],[25.75,68.99],[24.94,68.59],[23.85,68.81],[23.32,68.65],[22.41,68.72],[21.62,69.27],[21.14,69.25],[21.07,69.04],[20.68,69.07]],
  "Norway~1":[[15.76,68.56],[16.28,68.87],[16.48,68.8],[16.52,68.63],[15.98,68.4],[14.26,68.26],[15.41,68.62],[15.56,68.87],[15.48,69.04],[15.97,69.3],[16.11,69.22],[15.81,69.02],[15.93,68.73],[15.79,68.62]],
  Sweden:[[11.39,59.04],[11.64,58.93],[11.8,59.29],[11.68,59.59],[11.93,59.86],[12.49,60.11],[12.59,60.45],[12.29,61.0],[12.71,61.06],[12.88,61.35],[12.16,61.72],[12.3,62.29],[12.11,62.59],[12.22,63.0],[12.0,63.29],[12.18,63.6],[12.79,64],[13.96,64.01],[14.14,64.17],[14.08,64.46],[13.65,64.58],[14.48,65.3],[14.63,65.79],[14.54,66.13],[15.48,66.31],[15.42,66.49],[16.4,67.05],[16.13,67.43],[16.19,67.51],[17.32,68.1],[17.92,67.96],[18.18,68.2],[18.16,68.53],[19.97,68.36],[20.24,68.48],[19.97,68.54],[20.35,68.85],[20.12,69.02],[20.9,68.98],[21.47,68.69],[23.1,68.26],[23.64,67.95],[23.5,67.88],[23.45,67.46],[23.73,67.42],[23.64,67.13],[23.99,66.81],[23.7,66.48],[23.7,66.25],[24.16,65.81],[23.1,65.74],[22.4,65.86],[22.25,65.6],[21.57,65.41],[21.61,65.26],[21.41,65.32],[21.57,65.13],[21.14,64.81],[21.52,64.46],[20.76,63.87],[18.61,63.18],[18.31,63.0],[18.5,62.99],[18.46,62.9],[18.17,62.79],[17.88,62.87],[18.04,62.6],[17.65,62.45],[17.41,62.51],[17.43,62.33],[17.63,62.23],[17.37,61.87],[17.47,61.68],[17.2,61.72],[17.13,61.58],[17.25,60.7],[17.66,60.54],[17.96,60.59],[18.99,59.83],[17.96,59.36],[18.56,59.39],[18.29,59.11],[16.98,58.65],[16.21,58.64],[16.92,58.49],[16.65,58.43],[16.77,58.21],[16.56,57.81],[16.65,57.5],[16.48,57.27],[16.53,57.07],[16.0,56.22],[14.71,56.13],[14.75,56.03],[14.22,55.83],[14.34,55.53],[14.17,55.4],[12.89,55.41],[12.97,55.75],[12.47,56.29],[12.8,56.26],[12.66,56.44],[12.86,56.45],[12.88,56.62],[12.42,56.91],[11.73,57.72],[11.7,57.97],[11.45,58.12],[11.43,58.34],[11.25,58.37],[11.15,58.99],[11.3,59.09]],
  Poland:[[23.61,51.52],[24.1,50.87],[23.98,50.79],[24.09,50.53],[22.71,49.61],[22.81,49.02],[21.35,49.43],[20.95,49.32],[20.36,49.39],[20.06,49.18],[19.8,49.19],[19.77,49.37],[19.44,49.6],[18.97,49.4],[18.56,49.88],[17.83,49.98],[17.6,50.14],[17.7,50.31],[17.42,50.25],[16.88,50.43],[16.99,50.24],[16.64,50.1],[16.21,50.42],[16.42,50.57],[16.28,50.66],[16.01,50.61],[14.99,51.01],[14.98,50.89],[14.81,50.86],[15.02,51.25],[14.6,51.83],[14.75,52.08],[14.55,52.36],[14.62,52.53],[14.13,52.88],[14.41,53.2],[14.26,53.73],[14.58,53.64],[14.56,53.82],[14.21,53.95],[16.19,54.29],[16.56,54.55],[17.84,54.82],[18.76,54.68],[18.44,54.74],[18.67,54.43],[18.98,54.35],[19.6,54.46],[22.82,54.4],[23.37,54.2],[23.92,52.82],[23.18,52.31],[23.65,52.04],[23.54,51.62]],
  Czechia:[[18.83,49.51],[18.16,49.26],[18.09,49.07],[17.76,48.89],[17.14,48.84],[16.95,48.6],[16.54,48.8],[16.06,48.75],[14.99,49.0],[14.69,48.6],[14.19,48.58],[12.68,49.41],[12.39,49.74],[12.51,49.9],[12.09,50.27],[12.28,50.18],[12.55,50.39],[12.94,50.41],[14.37,50.9],[14.28,51.03],[14.72,50.81],[14.98,50.89],[14.99,51.01],[16.01,50.61],[16.36,50.62],[16.21,50.42],[16.64,50.1],[16.99,50.24],[16.88,50.43],[17.42,50.25],[17.7,50.31],[17.63,50.12],[18.52,49.9],[18.83,49.54]],
  Slovakia:[[22.54,49.07],[22.11,48.39],[21.77,48.34],[21.45,48.55],[20.64,48.55],[19.9,48.13],[19.63,48.22],[18.91,48.05],[18.72,47.79],[17.76,47.77],[17.09,48.04],[16.86,48.44],[17.14,48.84],[17.76,48.89],[18.6,49.49],[19.15,49.4],[19.44,49.6],[19.77,49.37],[19.76,49.2],[20.06,49.18],[20.36,49.39],[21.64,49.41],[22.47,49.08]],
  Hungary:[[22.13,48.41],[22.88,47.95],[22.0,47.51],[21.12,46.28],[20.61,46.13],[19.53,46.16],[18.36,45.75],[17.31,46.0],[16.52,46.5],[16.28,46.86],[16.09,46.86],[16.45,47.01],[16.44,47.4],[16.68,47.54],[16.42,47.67],[17.07,47.71],[17.17,48.01],[17.76,47.77],[18.72,47.79],[18.91,48.05],[19.63,48.22],[19.9,48.13],[20.64,48.55],[21.45,48.55],[21.77,48.34],[22.11,48.39]],
  Slovenia:[[16.52,46.5],[16.32,46.53],[16.23,46.37],[15.64,46.2],[15.65,45.86],[15.28,45.73],[15.34,45.47],[14.79,45.48],[14.57,45.66],[14.37,45.48],[13.58,45.52],[13.87,45.61],[13.49,45.99],[13.63,46.18],[13.38,46.26],[13.7,46.52],[14.55,46.4],[14.89,46.61],[15.96,46.68],[16.09,46.86],[16.28,46.86],[16.51,46.52]],
  Croatia:[[13.58,45.52],[14.37,45.48],[14.57,45.66],[14.79,45.48],[15.34,45.47],[15.28,45.73],[15.65,45.86],[15.61,46.17],[16.23,46.37],[16.32,46.53],[17.81,45.79],[18.36,45.75],[18.91,45.93],[19.0,45.4],[19.4,45.21],[19.06,45.14],[19.01,44.87],[18.66,45.08],[17.81,45.08],[16.92,45.28],[16.53,45.22],[16.29,45.01],[15.79,45.18],[15.74,44.77],[16.1,44.52],[16.3,44.12],[17.25,43.47],[17.64,42.96],[16.9,43.39],[15.99,43.52],[15.12,44.26],[15.47,44.27],[14.9,44.71],[14.85,45.08],[14.31,45.34],[13.86,44.84],[13.52,45.48]],
  "Croatia~1":[[18.44,42.56],[18.52,42.43],[17.05,43.01],[17.8,42.9],[18.35,42.59]],
};
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
    else $("jList").innerHTML = `<div class="spin">Could not load the journal (${esc(err.message)}). The Apps Script may need the latest redeploy.</div>`;
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
    if(!confirm(tr("Delete this journal entry?"))) return;
    const e = (JENTRIES||[]).find(x=>x.row===Number(b.dataset.row));
    const t = e ? enjoyTarget(e) : null; // looked up before the delete
    try{
      const res = await api({action:"jdelete", row:Number(b.dataset.row)});
      JENTRIES = res.entries || []; renderJournal(); toast(tr("Entry deleted"));
    }catch(err){ toast(tr("Could not delete: {0}", err.message)); return; }
    // the entry put a wine in Enjoyed: ask whether that goes too
    if(t && t.kind==="logged"){
      const nm = `${t.wine.producer}${t.wine.name?" "+t.wine.name:""}${t.wine.vintage?" "+t.wine.vintage:""}`;
      const ask = t.elsewhere ? tr("Also remove {0} from Enjoyed?", nm) : tr("Also put the bottle of {0} back in your cellar (undo the drink)?", nm);
      if(!confirm(ask)) return;
      try{
        const r2 = await api({action: t.elsewhere ? "delete" : "undrink", row:t.wine.row, qty:1});
        WINES = normalize(r2.wines); KEEP_OPEN = null; renderOverview(); renderTable(); renderEnjoyed();
        toast(t.elsewhere ? tr("Removed from Enjoyed") : tr("Bottle back in the cellar 🍾"));
      }catch(err){ toast(tr("Could not update Enjoyed: {0}", err.message)); }
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
// the wine names you've used for a producer, for the Wine field's suggestions
function wineNamesFor(producer){
  const p = jKey(producer); if(!p) return [];
  return [...new Set([...WINES.filter(w=>jKey(w.producer)===p).map(w=>w.name), ...(JENTRIES||[]).filter(e=>jKey(e.producer)===p).map(e=>e.wine)]
    .map(x=>String(x||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"fr"));
}
// ids: {producer, wine, country, region, commune, grape, class, type?, note}
function autofill(ids){
  const k = knownWine($(ids.producer).value, $(ids.wine).value), filled = [];
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
// pick the select option that means the same classification ("1er Cru" in a sheet → "1. cru")
function matchOpt(sel, val){
  const k = clsKey(val), o = [...sel.options].find(o=>o.value && clsKey(o.value)===k);
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

/* ---------- Add form: suggestions from where the wine is from ---------- */
// A red Burgundy is Pinot Noir, a white one Chardonnay (Bourgogne Aligoté and Bouzeron aside), Mosel is Riesling:
// once the name, commune or region says where a wine is from, the empty fields are filled in from the appellation
// (wine-kb.js) and the atlas's climats (burgundy-match.js), and marked as suggested. A suggested field keeps
// following what you type elsewhere until you type in it yourself; nothing you typed is overwritten.
const ADD_IDS = {producer:"aProducer", wine:"aName", country:"aCountry", region:"aRegion", commune:"aCommune", grape:"aGrape", class:"aClass", type:"aType", note:"aFillNote"};
wireAutofill(ADD_IDS);
const ADD_SG = [["commune","aCommune"],["region","aRegion"],["country","aCountry"],["grape","aGrape"]];
const sgFree = id => !$(id).value.trim() || $(id).dataset.sg==="1";
function addSuggest(){
  if(!window.WINE_KB) return;
  const g = id => sgFree(id) ? "" : $(id).value.trim(), ty = $("aType");
  const name = $("aName").value.trim(), commune = g("aCommune");
  // the atlas's vineyards only for what could be a Burgundy
  const reg = g("aRegion"), burg = !reg || /bourgogne|burgund|bourgogne|cote d.?or|chablis/i.test(WINE_KB.norm(reg));
  const pl = burg && window.BURG_MATCH && BURG_MATCH.place ? BURG_MATCH.place({name, commune}) : null;
  const sg = WINE_KB.suggest({name, commune, region:g("aRegion"), grape:g("aGrape"), type:ty.value, typeSet:ty.dataset.touched==="1", place:pl});
  if(pl && pl.commune && !commune) sg.commune = pl.commune;
  const said = [];
  for(const [f, id] of ADD_SG){
    const el = $(id); if(!sgFree(id)) { el.classList.remove("sg"); continue; }
    if(sg[f]){ el.value = sg[f]; el.dataset.sg = "1"; el.classList.add("sg"); if(el.value!==el.defaultValue) said.push(f); }
    else if(el.dataset.sg==="1"){ el.value = el.defaultValue; el.dataset.sg = el.defaultValue ? "1" : ""; el.classList.remove("sg"); }
  }
  if(ty.dataset.touched!=="1"){
    ty.value = sg.type || "Rød"; ty.classList.toggle("sg", !!sg.type);
    if(sg.type) said.push("colour");
  }
  const from = pl ? pl.climat : sg.app, nt = $("aSuggest");
  nt.hidden = !said.length || !from;
  if(!nt.hidden){
    const L = {commune:tr("commune"), region:tr("region"), country:tr("country"), grape:tr("grape"), colour:tr("colour")};
    nt.textContent = tr("Suggested from {0}: {1}. Change anything that's wrong.").replace("{0}", from).replace("{1}", said.map(f=>L[f]).join(", "));
  }
  classHint(ADD_IDS);
}
function addProducers(){
  $("jProducers").innerHTML = [...new Set(WINES.map(w=>w.producer).filter(Boolean))].sort().map(x=>`<option>${esc(x)}</option>`).join("");
}
function addReset(){
  $("addForm").reset(); $("aQty").value = 1;
  ADD_SG.forEach(([, id])=>{ $(id).dataset.sg = $(id).defaultValue ? "1" : ""; $(id).classList.remove("sg"); });
  $("aType").dataset.touched = ""; $("aType").classList.remove("sg"); $("aClass").dataset.auto = "1";
  $("aFillNote").hidden = true; $("aSuggest").hidden = true; $("aClassHint").textContent = "";
}
// typing in a field makes it yours; the rest follow
ADD_SG.forEach(([, id])=>$(id).addEventListener("input", ()=>{ $(id).dataset.sg = ""; $(id).classList.remove("sg"); }));
["aName","aCommune","aRegion","aGrape","aProducer"].forEach(id=>$(id).addEventListener("input", addSuggest));
$("aType").addEventListener("change", ()=>{ $("aType").classList.remove("sg"); addSuggest(); });
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
  $("jTitle").textContent = tr("New journal entry");
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
  $("jTitle").textContent = tr("Edit journal entry");
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
    commune: v("jCommune"), classification: $("jClass").value,
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
    $("jErr").textContent = tr("Could not save: {0}", m)+hint;
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
  const valueDrunk = drunk.reduce((s,w)=>s+(w.price||0)*w.drunk,0);
  const prodAgg = {}; drunk.forEach(w=>{ prodAgg[w.producer]=(prodAgg[w.producer]||0)+w.drunk; });
  const top = Object.entries(prodAgg).sort((a,b)=>b[1]-a[1])[0];
  const kpis = [[tr("Bottles enjoyed"), fmt(bottles), tr("{0} different wines", drunk.length), ""]];
  if(SHOW_PRICES) kpis.push([tr("Value enjoyed"), kr(valueDrunk), tr("at purchase price"), ""]);
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
    if(typeof va==="string") return va.localeCompare(vb)*dir;
    return ((va??0)-(vb??0))*dir;
  });
  document.querySelectorAll("#eTbl th[data-k] .arr").forEach(s=>s.textContent="");
  const th=document.querySelector(`#eTbl th[data-k="${k}"] .arr`); if(th) th.textContent = dir>0?"▲":"▼";

  let ct = `${nWines(list.length)} · ${btl(fmt(list.reduce((s,w)=>s+w.drunk,0)))}`;
  if(SHOW_PRICES) ct += ` · ${kr(list.reduce((s,w)=>s+(w.price||0)*w.drunk,0))}`;
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
    return `<tr class="main" data-i="${i}" data-row="${w.row}" tabindex="0" aria-expanded="false">
      <td><span class="prod">${esc(w.producer)}</span>${badge}<br><span class="wname">${fmtChip(w)}${esc(nm)}${classChip(w)}${w.rating?` · <span class="myscore">${w.rating}/10</span>`:""}</span></td>
      <td class="num">${esc(w.vintage||"—")}</td>
      <td>${esc(w.region)}</td>
      <td><span class="sdot" style="background:var(${STYLE_VAR[w.style]||"--muted"})"></span>${tr(STYLE_EN[w.style])||esc(w.style)}</td>
      <td class="num">${w.drunk}</td>
      <td class="num">${w.drunkDate?esc(fmtDate(w.drunkDate)):"—"}</td>
      <td class="num">${SHOW_PRICES ? (w.price?kr(w.price):"—") : "···"}</td>
    </tr>
    <tr class="detail" hidden><td colspan="7"></td></tr>`;
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
  const W=980,H=210,P={l:22,r:10,t:14,b:26};
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
  classHint(EA_IDS);
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
    region:v("eaRegion"), country:v("eaCountry"), commune:v("eaCommune"), classification:$("eaClass").value,
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
  }catch(err){ $("eaErr").textContent=tr("Could not add: {0}", err.message); $("eaErr").hidden=false; }
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
  $("iTitle").textContent = isElsewhere(w) ? tr("Edit this Enjoyed wine") : tr("Edit wine details");
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
  const next = {producer:v("iProducer"), name:v("iName"), vintage:vint, commune:v("iCommune"), classification:$("iClass").value,
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
    $("iErr").textContent = err.message==="bad-action" ? tr("The Apps Script needs the latest version (26) for this — paste apps-script/Code.gs into it and redeploy.") : tr("Could not save: {0}", err.message);
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
    }catch(err){ toast(err.message==="bad-action" ? tr("Update the Apps Script (version 26) to save these") : tr("Could not save: {0}", err.message)); b.disabled = false; b.textContent = n===1?tr("Fill it in"):tr("Fill them in"); }
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
    else $("wList").innerHTML = `<div class="spin">${esc(tr("Could not load the wishlist ({0}). The Apps Script may need the latest redeploy.", err.message))}</div>`;
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
    if(!confirm(tr("Remove this wish?"))) return;
    try{ const res=await api({action:"wdelete", row:Number(b.dataset.row)}); WITEMS=res.items||[]; renderWishlist(); toast(tr("Wish removed")); }
    catch(err){ toast(tr("Could not remove: {0}", err.message)); }
  }));
  document.querySelectorAll(".wmove").forEach(b=>b.addEventListener("click", async ()=>{
    const e=(WITEMS||[]).find(x=>x.row===Number(b.dataset.row));
    if(!confirm(tr("Move {0} into the cellar (1 bottle)?", e?e.producer:tr("this wine")))) return;
    b.disabled=true; b.textContent=tr("Adding…");
    try{
      const res=await api({action:"wtocellar", row:Number(b.dataset.row)});
      WITEMS=res.items||[]; if(res.wines) WINES=normalize(res.wines);
      renderWishlist(); renderOverview(); renderTable(); renderEnjoyed();
      toast(tr("Added to the cellar 🍷"));
    }catch(err){ toast(tr("Could not move: {0}", err.message)); b.disabled=false; b.textContent="＋ "+tr("Add to cellar"); }
  }));
}

function prepWishModal(){
  $("wForm").reset(); $("wErr").hidden=true; $("wErr").textContent="";
  $("jProducers").innerHTML = [...new Set(WINES.map(w=>w.producer).filter(Boolean))].sort().map(x=>`<option>${esc(x)}</option>`).join("");
  $("wModal").classList.add("open");
}
function openWishModal(prefill){
  W_EDIT=null; prepWishModal(); $("wTitle").textContent=tr("Add to wishlist"); $("wSave").textContent=tr("Save");
  if(prefill){ $("wProducer").value=prefill.producer||""; $("wWine").value=prefill.wine||"";
    $("wVintage").value=prefill.vintage||""; $("wRegion").value=prefill.region||""; }
  setTimeout(()=>$("wProducer").focus(),40);
}
function openWishEdit(e){
  W_EDIT=e.row; prepWishModal(); $("wTitle").textContent=tr("Edit wish"); $("wSave").textContent=tr("Save changes");
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
  }catch(err){ $("wErr").textContent=tr("Could not save: {0}", err.message); $("wErr").hidden=false; }
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
async function loadFeedSilently(){
  try{ const r=await api({action:"feed"}); FEED=r.feed||[]; FEED_ME=r.me||""; FEED_USERS=r.users||[]; FEED_FOLLOWS=r.follows||[];
    if(location.hash==="#feed"){ renderFeed(); markFeedSeen(); } else updateFeedBadge();
  }catch(e){ /* feed is optional; older API may not have it */ }
}
async function loadFeed(force){
  if(FEED && !force){ renderFeed(); markFeedSeen(); return; }
  $("feedSpin").hidden=false; $("feedList").innerHTML="";
  try{
    const res=await api({action:"feed"});
    FEED=res.feed||[]; FEED_ME=res.me||cfg.user||""; FEED_USERS=res.users||[]; FEED_FOLLOWS=res.follows||[];
    $("feedSpin").hidden=true; renderFeed(); markFeedSeen();
  }catch(err){
    $("feedSpin").hidden=true;
    if(AUTH_ERRORS.has(err.message)){ forgetAuth(); setGateMode("login"); showGate(tr("Your session expired — log in again.")); }
    else $("feedList").innerHTML=`<div class="spin">${esc(tr("Could not load the feed ({0}). The Apps Script may need the latest redeploy.", err.message))}</div>`;
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
    if(!confirm(tr("Delete this post?"))) return;
    try{ const res=await api({action:"feeddelete", row:Number(b.dataset.row)}); FEED=res.feed||[]; renderFeed(); toast(tr("Post deleted")); }
    catch(err){ toast(tr("Could not delete: {0}", err.message)); }
  }));
  F.querySelectorAll(".cheer").forEach(b=>b.addEventListener("click", async()=>{
    b.disabled=true;
    try{ const res=await api({action:"feedcheer", id:b.dataset.id}); FEED=res.feed||[]; renderFeed(); }
    catch(err){ toast(tr("Could not cheer: {0}", err.message)); b.disabled=false; }
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
    catch(err){ toast(tr("Could not comment: {0}", err.message)); inp.disabled=false; }
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
  }catch(err){ $("shErr").textContent=limitText(tr("Could not share: {0}", err.message)); $("shErr").hidden=false; }
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
  catch(err){ toast(tr("Could not update follow: {0}", err.message)); }
}

function route(){
  const h = location.hash;
  const page = h==="#journal" ? "journal" : h==="#enjoyed" ? "enjoyed" : h==="#wishlist" ? "wishlist"
             : h==="#feed" ? "feed" : "cellar";
  $("pageCellar").hidden = page!=="cellar";
  $("pageEnjoyed").hidden = page!=="enjoyed";
  $("pageWishlist").hidden = page!=="wishlist";
  $("pageJournal").hidden = page!=="journal";
  $("pageFeed").hidden = page!=="feed";
  document.querySelectorAll(".tab").forEach(t=>
    t.classList.toggle("active", t.dataset.page===page));
  if(page==="journal" && cfg.token) loadJournal();
  if(page==="wishlist" && cfg.token) loadWishlist();
  if(page==="feed" && cfg.token) loadFeed();
  if(page==="enjoyed") renderEnjoyed();
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
      $("acctBtn").hidden = false; $("app").hidden=false; loadData(); route(); }
    catch(err){ forgetAuth(); setGateMode("login"); showGate(tr("Log in again to unlock your cellar.")); }
  })();
}else if(cfg.api && cfg.user && cfg.token && sessionFresh){
  lastActive = bootActive; $("app").hidden=false; loadData(); route();
}else{
  const staleDrop = !!cfg.token && !sessionFresh; // had a session, but it went cold
  if(staleDrop) forgetAuth();                     // (e.g. overnight) — drop it
  localStorage.removeItem("vinActive");
  setGateMode("login");
  showGate(staleDrop ? tr("Your session expired after inactivity — log in again.") : "");
}
