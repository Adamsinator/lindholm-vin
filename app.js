/* Lindholm Vin — cellar app. Data comes from the Apps Script API; nothing is stored here. */
"use strict";

const TIER_LABEL = {legend:"Icon", top:"Top tier", solid:"Well regarded"};
const STYLES = ["Rød","Hvid","Bobler","Rosé"];
const STYLE_EN = {"Rød":"Red","Hvid":"White","Bobler":"Sparkling","Rosé":"Rosé"};
const STYLE_VAR = {"Rød":"--c-red","Hvid":"--c-white","Bobler":"--c-spark","Rosé":"--c-rose"};
// history markers coloured by wine: red = red, white = white, gold = sparkling, pink = rosé
const HIST_COLOR = {"Rød":"var(--h-red)","Hvid":"var(--h-white)","Bobler":"var(--h-gold)","Rosé":"var(--h-rose)"};
const COUNTRY_FIX = {"Franrkig":"Frankrig","Fankrig":"Frankrig"};
const REGION_FIX = {"Cote-de-Rhone":"Rhône","Cotes du Rhone":"Rhône","Laungedoc":"Languedoc","Bearn":"Béarn"};
const CLASS_FIX = {"1. Cru":"1. cru","1. cr":"1. cru"};

const fmt = n => new Intl.NumberFormat("da-DK",{maximumFractionDigits:0}).format(n);
const kr = n => fmt(n)+" kr.";
const fmtDate = s => { const d=new Date(String(s).slice(0,10)+"T12:00:00");
  return isNaN(d)?String(s):d.toLocaleDateString("da-DK",{day:"numeric",month:"short",year:"numeric"}); };

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
    if(v==null){ const ay=/^\d{4}/.test(String(w.acquired))?Number(String(w.acquired).slice(0,4)):null;
      return ay?{from:ay, to:ay+3}:null; }               // NV: ~3 yrs from purchase
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
    if(style==="Hvid") return grand?span(4,28):premier?span(3,20):span(2,12);
    return grand?span(8,38):premier?span(5,26):span(3,16);
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
const TIER_LONGEVITY = {legend:14, top:7};
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
  if(from!=null && y < from) return {k:"young", label:"Too young", soon:from===y+1, est};
  if(to!=null && y > to) return {k:"past", label:"Past peak", soon:false, est};
  const soon = to!=null && (to - y) <= 1; // closing this year or next
  return {k:"now", label: soon?"Drink soon":"Drink now", soon, est};
}
const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const $ = id => document.getElementById(id);

let WINES = [];          // normalized
let KEEP_OPEN = null;    // row number of the expanded detail, kept open across re-renders
let SHOW_PRICES = localStorage.getItem("vinHidePrices") !== "1"; // prices shown by default
const state = {q:"", region:"", style:"", status:"cellar", ready:"", sortK:"price", sortDir:-1};

/* ---------- config / auth ---------- */
const cfg = {
  api: localStorage.getItem("vinApi") || (window.WINE_CONFIG && window.WINE_CONFIG.API_URL) || "",
  user: localStorage.getItem("vinUser") || "",
  token: localStorage.getItem("vinToken") || "",
};

// Raw POST that returns the parsed response (never throws on ok:false) — used by
// the login/signup gate, which needs to read the error itself.
async function post(params){
  const res = await fetch(cfg.api, {method:"POST", body:JSON.stringify(params), redirect:"follow"});
  if(!res.ok) throw new Error("HTTP "+res.status);
  return res.json();
}

async function api(params){
  const data = await post({user:cfg.user, token:cfg.token, ...params});
  if(!data.ok){ const e = new Error(data.error || "unknown-error"); e.data = data; throw e; }
  return data;
}
// Auth errors that mean "the session is no longer valid → show the gate".
const AUTH_ERRORS = new Set(["bad-token","bad-code","no-cellar"]);

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
    const style = region==="Champagne" ? "Bobler" : ({"Rød":"Rød","Hvid":"Hvid","Rose":"Rosé"}[type] || type || "Rød");
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
      source:String(r.source).trim(), note:String(r.note).trim(),
    };
  });
}

/* ---------- tooltip / toast ---------- */
const tip = $("tip");
function showTip(html,x,y){ tip.innerHTML=html; tip.style.opacity=1;
  const r=tip.getBoundingClientRect();
  tip.style.left=Math.min(x+14, innerWidth-r.width-8)+"px";
  tip.style.top=Math.max(4,(y-r.height-10))+"px"; }
function hideTip(){ tip.style.opacity=0; }
let toastT;
function toast(msg){ const t=$("toast"); t.textContent=msg; t.style.opacity=1;
  clearTimeout(toastT); toastT=setTimeout(()=>t.style.opacity=0, 2600); }

/* ---------- overview (rebuilt on every data load) ---------- */
function renderOverview(){
  const cellar = WINES.filter(w=>w.left>0);
  const bottlesLeft = cellar.reduce((s,w)=>s+w.left,0);
  const drunk = WINES.reduce((s,w)=>s+w.drunk,0);
  const iconCount = cellar.filter(w=>PRODUCER_NOTES[w.producer]?.[0]==="legend").reduce((s,w)=>s+w.left,0);

  const kpis = [
    ["Bottles in cellar", fmt(bottlesLeft), cellar.length+" different wines", ""],
  ];
  if(SHOW_PRICES){
    const valueLeft = cellar.reduce((s,w)=>s+(w.price||0)*w.left,0);
    kpis.push(["Cellar value", kr(valueLeft), "at purchase price", ""]);
    kpis.push(["Avg. bottle", kr(bottlesLeft?valueLeft/bottlesLeft:0), "cellar average", ""]);
    const valued = cellar.filter(w=>w.value!=null);
    if(valued.length){
      const market = valued.reduce((s,w)=>s+w.value*w.left,0);
      const paid = valued.reduce((s,w)=>s+(w.price||0)*w.left,0);
      const nBtl = valued.reduce((s,w)=>s+w.left,0);
      kpis.push(["Current value", kr(market),
        valued.length+" of "+cellar.length+" wines valued · "+fmt(nBtl)+" btl.", ""]);
      if(paid>0){
        const gain = market-paid, pct = Math.round(gain/paid*100);
        kpis.push([(gain>=0?"Unrealised gain":"Unrealised loss"),
          (gain>=0?"+":"−")+kr(Math.abs(gain)),
          "vs. paid on valued wines"+(isFinite(pct)?" · "+(gain>=0?"+":"−")+Math.abs(pct)+"%":""),
          ""]);
      }
    }
  }else{
    kpis.push(["Cellar value", "🔒 hidden", "press Show prices above", "locked"]);
  }
  kpis.push(["Icon-producer bottles", fmt(iconCount), "Roumier, Rouget, Egon Müller…", ""]);
  kpis.push(["Enjoyed so far", fmt(drunk), "bottles drunk", ""]);
  $("kpis").innerHTML = kpis.map(([l,v,h,c])=>
    `<div class="kpi ${c}"><div class="lbl">${l}</div><div class="val">${v}</div><div class="hint">${h}</div></div>`).join("");

  /* regions */
  const regAgg = {};
  cellar.forEach(w=>{ const r=regAgg[w.region] ??= {b:0,v:0}; r.b+=w.left; r.v+=(w.price||0)*w.left; });
  const regs = Object.entries(regAgg).sort((a,b)=>b[1].b-a[1].b);
  const topRegs = regs.slice(0,8);
  const rest = regs.slice(8);
  if(rest.length) topRegs.push(["Other ("+rest.length+" regions)",
    {b:rest.reduce((s,r)=>s+r[1].b,0), v:rest.reduce((s,r)=>s+r[1].v,0), other:true}]);
  const maxB = topRegs.length ? topRegs[0][1].b : 1;
  $("regions").innerHTML = topRegs.map(([name,r])=>`
    <button class="rbar" data-region="${r.other?"":esc(name)}" aria-label="${esc(name)}: ${r.b} bottles">
      <span class="rb-name">${esc(name)}</span>
      <span class="rb-track"><span class="rb-fill" style="width:${Math.max(1.5,r.b/maxB*100)}%"></span></span>
      <span class="rb-n">${r.b} btl.</span>
    </button>`).join("");
  document.querySelectorAll(".rbar").forEach(el=>{
    el.addEventListener("mousemove",e=>{
      const label = el.querySelector(".rb-name").textContent;
      const r = topRegs.find(t=>t[0]===label)[1];
      showTip(`<b>${esc(label)}</b><br>${r.b} bottles${SHOW_PRICES?" · "+kr(r.v):""}`,e.clientX,e.clientY);
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
    <span>${STYLE_EN[s]}</span><span class="n">${styAgg[s]} btl. · ${Math.round(styAgg[s]/Math.max(1,bottlesLeft)*100)}%</span></button>`).join("");
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
    <button class="rbar" data-prod="${esc(name)}" aria-label="${esc(name)}: ${p.b} bottles">
      <span class="rb-name">${esc(name)}</span>
      <span class="rb-track"><span class="rb-fill" style="width:${Math.max(1.5,p.b/maxPB*100)}%"></span></span>
      <span class="rb-n">${p.b} btl.</span>
    </button>`).join("") + (prods.length>10?`<div class="morep">+ ${prods.length-10} more producers — use the search box</div>`:"");
  document.querySelectorAll("#producers .rbar").forEach(el=>{
    const name = el.dataset.prod, p = prodAgg[name];
    el.addEventListener("mousemove",e=>showTip(`<b>${esc(name)}</b><br>${p.b} bottle${p.b>1?"s":""} · ${p.n} wine${p.n>1?"s":""}${SHOW_PRICES?" · "+kr(p.v):""}`,e.clientX,e.clientY));
    el.addEventListener("mouseleave",hideTip);
    el.addEventListener("click",()=>{
      state.q = state.q.trim()===name ? "" : name;
      $("q").value = state.q; renderTable(); });
  });

  updateMap(cellar);
  drawHistory();
  renderInsights(cellar);

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
      showTip(`<b>${k==="NV"?"Non-vintage":k}</b><br>${d.b} bottle${d.b>1?"s":""} · ${d.wines.length} wine${d.wines.length>1?"s":""}<br><span style="opacity:.75">${esc(names)}${d.wines.length>3?"…":""}</span>`,e.clientX,e.clientY);
    });
    g.addEventListener("mouseleave",hideTip);
    g.addEventListener("click",()=>{ $("q").value = state.q = (k==="NV"?"NV":k); renderTable(); });
  });

  /* filter dropdown options (preserve selection) */
  const selR = $("fRegion");
  selR.innerHTML = '<option value="">All regions</option>' +
    regs.map(([name])=>`<option${state.region===name?" selected":""}>${esc(name)}</option>`).join("");
  const selS = $("fStyle");
  selS.innerHTML = '<option value="">All styles</option>' +
    STYLES.map(s=>`<option value="${s}"${state.style===s?" selected":""}>${STYLE_EN[s]}</option>`).join("");

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
    <text class="pcen2" x="${C}" y="${C+22}" text-anchor="middle">bottles</text>`;
  svg.innerHTML=html;
  svg.querySelectorAll(".pslice").forEach(pl=>{
    const st=pl.dataset.style;
    pl.addEventListener("mousemove",e=>showTip(`<b>${STYLE_EN[st]}</b><br>${styAgg[st]} btl. · ${Math.round(styAgg[st]/Math.max(1,total)*100)}%`,e.clientX,e.clientY));
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
    items.push(["Oldest vintage", o.vintage, esc(o.producer)]); }
  if(SHOW_PRICES){ const priced=cellar.filter(w=>w.price);
    if(priced.length){ const p=priced.reduce((a,b)=>b.price>a.price?b:a);
      items.push(["Priciest bottle", kr(p.price), esc(p.producer)]); } }
  const reg={}; cellar.forEach(w=>{ if(w.region) reg[w.region]=(reg[w.region]||0)+w.left; });
  const tr=Object.entries(reg).sort((a,b)=>b[1]-a[1])[0];
  if(tr) items.push(["Top region", esc(tr[0]), tr[1]+" btl."]);
  const gr={}; cellar.forEach(w=>{ if(w.grape) gr[w.grape]=(gr[w.grape]||0)+w.left; });
  const tg=Object.entries(gr).sort((a,b)=>b[1]-a[1])[0];
  if(tg) items.push(["Top grape", esc(tg[0]), tg[1]+" btl."]);
  const rated=cellar.filter(w=>w.rating!=null);
  if(rated.length){ const avg=rated.reduce((s,w)=>s+w.rating,0)/rated.length;
    items.push(["Average score", avg.toFixed(1)+"/10", rated.length+" rated"]); }
  const windowed=cellar.filter(w=>readiness(w));
  if(windowed.length){ const ready=cellar.filter(w=>{const r=readiness(w);return r&&r.k==="now";}).reduce((s,w)=>s+w.left,0);
    items.push(["Ready to drink", fmt(ready)+" btl.", "in their window now"]); }
  el.innerHTML = items.map(([l,v,h])=>`<div class="ins"><div class="ins-l">${l}</div><div class="ins-v">${v}</div><div class="ins-h">${h}</div></div>`).join("");
  const panel = el.closest(".panel"); if(panel) panel.hidden = !items.length;
}

/* ---------- collection over time ---------- */
// Pure: turn wines into dated +acquire / -drunk events and a running total.
function buildHistory(wines, now){
  now = now || Date.now();
  const parse = s => { const d = new Date(String(s||"").slice(0,10)+"T12:00:00"); return isNaN(d)?null:d.getTime(); };
  const ev = []; let withAcq=0, withoutAcq=0, drinkEvents=0;
  wines.forEach(w=>{
    const a = parse(w.acquired);
    if(a===null){ if(w.qty>0) withoutAcq++; return; }
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
    cap.textContent = "Add an “Acquired” date to your wines (in the sheet, or when adding one) to see the collection grow over time.";
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
        data-style="${esc(STYLE_EN[p.w.style]||p.w.style||"")}" data-w="${esc((p.w.producer||"")+(p.w.name?" · "+p.w.name:""))}">
      <path class="hist-halo" d="${gd}"/>
      <path class="hist-glyph" style="stroke:${col}" d="${gd}"/>
      <circle class="hist-hit" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="10"/></g>`);
  });

  svg.setAttribute("viewBox",`0 0 ${W} ${Hh}`);
  svg.innerHTML=parts.join("");
  svg.querySelectorAll(".hist-ev").forEach(g=>{
    g.addEventListener("mousemove",e=>{
      const n=Number(g.dataset.d), when=fmtDate(new Date(Number(g.dataset.t)).toISOString().slice(0,10));
      const what = n>0 ? `added ${n}` : `drunk ${-n}`;
      showTip(`<b>${when}</b> · ${esc(g.dataset.style)}<br>${what} — ${esc(g.dataset.w)}<br><span style="opacity:.75">${g.dataset.cum} in cellar after</span>`,e.clientX,e.clientY);
    });
    g.addEventListener("mouseleave",hideTip);
  });

  const bits=[`${H.withAcq} wine${H.withAcq===1?"":"s"} on the timeline`, `${H.drinkEvents} drunk`];
  if(H.withoutAcq) bits.push(`${H.withoutAcq} without an acquired date (not shown)`);
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
          title="${win.from??"?"}–${win.to??"?"} · ${rd.label}${rd.est?" (estimated)":""}"></div>
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
  $("dwCount").textContent = `${wins.length} wine${wins.length>1?"s":""}`;
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
  return `<a target="_blank" rel="noopener" href="https://www.vivino.com/search/wines?q=${enc}">Ratings on Vivino ↗</a>
    <a target="_blank" rel="noopener" href="https://www.wine-searcher.com/find/${enc.replace(/%20/g,"+")}">Scores &amp; prices on Wine-Searcher ↗</a>`;
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
  const more = js.length>3 ? `<button class="wj-more" data-page="journal">+ ${js.length-3} more in the Journal ↗</button>` : "";
  return `<div class="wjournal"><div class="k">From your journal</div>${rows}${more}</div>`;
}

function detailHTML(w){
  const pn = PRODUCER_NOTES[w.producer];
  const cells = [
    ["Commune", w.commune],["Classification", w.classification],["Grape", w.grape],
    ["Bought", w.qty+" btl."],["Enjoyed", w.drunk?w.drunk+" btl.":""],["Source", w.source],
    ["Price", SHOW_PRICES && w.price ? kr(w.price) : ""],
  ].filter(c=>c[1]).map(([k,v])=>`<div><div class="k">${k}</div>${esc(v)}</div>`).join("");
  return `<div class="dgrid">${cells}</div>
    ${w.note?`<div class="unote">“${esc(w.note)}” — cellar note</div>`:""}
    ${pn?`<div class="pnote"><b>${esc(w.producer)}</b> · ${TIER_LABEL[pn[0]]} — ${pn[1]}</div>`:""}
    ${journalHTML(w)}
    <div class="links">
      ${w.left>0?`<button class="drink" data-act="drink" data-row="${w.row}">🍷 Mark 1 bottle as drunk</button>`:""}
      ${w.drunk>0?`<button class="drink" data-act="undrink" data-row="${w.row}">↩︎ Undo drink</button>`:""}
      <label class="ratewrap">My score
        <select class="rate" data-row="${w.row}">
          <option value="">—</option>
          ${Array.from({length:10},(_,i)=>`<option value="${i+1}"${w.rating===i+1?" selected":""}>${i+1}</option>`).join("")}
        </select></label>
      ${SHOW_PRICES?`<label class="valwrap">Value kr
        <input class="setval" type="number" min="0" step="1" inputmode="numeric"
          data-row="${w.row}" value="${w.value!=null?w.value:""}" placeholder="—"></label>`:""}
      <label class="datewrap">Acquired
        <input class="setdate" type="date" data-field="acquired" data-row="${w.row}" value="${w.acquired||""}"></label>
      ${w.drunk>0?`<label class="datewrap">Last drunk
        <input class="setdate" type="date" data-field="drunkDate" data-row="${w.row}" value="${w.drunkDate||""}"></label>`:""}
      ${(()=>{const est=defaultWindow(w), r=readiness(w);
        const ph=(x,d)=>x!=null?"≈"+x:d;
        return `<span class="winwrap">Drink window
        <input class="setwin" type="number" inputmode="numeric" placeholder="${ph(est&&est.from,"from")}" data-end="from" data-row="${w.row}" value="${w.drinkFrom??""}">
        <span class="wsep">–</span>
        <input class="setwin" type="number" inputmode="numeric" placeholder="${ph(est&&est.to,"to")}" data-end="to" data-row="${w.row}" value="${w.drinkTo??""}">
        ${r?`<span class="rbadge ${r.k}${r.est?" est":""}">${r.label}</span>`:""}
        ${r&&r.est?`<span class="est-note">estimated · type to set your own</span>`:""}</span>`;})()}
      <button class="jlog" data-row="${w.row}">📓 Log in journal</button>
      ${searchLinks(w)}
      <button class="drink del" data-act="delete" data-row="${w.row}">🗑 Delete wine</button>
    </div>`;
}

function renderTable(){
  const q = state.q.trim().toLowerCase();
  let list = WINES.filter(w=>{
    if(state.status==="cellar" && w.left===0) return false;
    if(state.status==="drunk" && w.drunk===0) return false;
    if(state.region && w.region!==state.region) return false;
    if(state.style && w.style!==state.style) return false;
    if(state.ready){
      const rd = readiness(w);
      if(state.ready==="soon"){ if(!(rd && rd.soon)) return false; }
      else if(!(rd && rd.k===state.ready)) return false;
    }
    if(q){
      const hay = [w.producer,w.name,w.commune,w.region,w.grape,w.classification,String(w.vintage),w.note].join(" ").toLowerCase();
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
  let countTxt = `${list.length} wines · ${fmt(bl)} btl.`;
  if(SHOW_PRICES){
    const vl = list.reduce((s,w)=>s+(w.price||0)*(state.status==="drunk"?w.drunk:w.left),0);
    countTxt += ` · ${kr(vl)}`;
  }
  $("count").textContent = countTxt;
  $("clear").classList.toggle("show", !!(q||state.region||state.style||state.ready||state.status!=="cellar"));
  drawDrinkTimeline(list);

  document.querySelectorAll(".rbar").forEach(el=>el.classList.toggle("active", el.dataset.region===state.region && !!state.region));
  document.querySelectorAll("#slegend button").forEach(el=>el.classList.toggle("active", el.dataset.style===state.style && !!state.style));
  document.querySelectorAll("#stylePie .pslice").forEach(el=>el.classList.toggle("on", el.dataset.style===state.style && !!state.style));
  document.querySelectorAll("#producers .rbar").forEach(el=>el.classList.toggle("active", el.dataset.prod===state.q.trim() && !!state.q.trim()));
  syncMapActive();

  $("rows").innerHTML = list.map((w,i)=>{
    const pn = PRODUCER_NOTES[w.producer];
    const badge = pn?`<span class="badge ${pn[0]}">${TIER_LABEL[pn[0]]}</span>`:"";
    const rd = w.left>0 ? readiness(w) : null;
    const rwin = rd ? drinkWindow(w) : null;
    const rbadge = rd?`<span class="rbadge ${rd.k}${rd.est?" est":""}" title="${rd.est?"Estimated":"Your"} drink window ${rwin.from??"?"}–${rwin.to??"?"}${rd.est?" — set your own in the wine":""}">${rd.label}</span>`:"";
    const nm = [w.name, w.commune && w.commune!==w.name ? w.commune : ""].filter(Boolean).join(" · ");
    return `<tr class="main${w.left===0?" gone":""}" data-i="${i}" data-row="${w.row}" tabindex="0" aria-expanded="false">
      <td><span class="prod">${esc(w.producer)}</span>${badge}${rbadge}<br><span class="wname">${esc(nm)}${w.classification&&w.classification!=="AOC"?" · <b>"+esc(w.classification)+"</b>":""}${w.rating?` · <span class="myscore">${w.rating}/10</span>`:""}</span></td>
      <td class="num">${esc(w.vintage||"—")}</td>
      <td>${esc(w.region)}</td>
      <td><span class="sdot" style="background:var(${STYLE_VAR[w.style]||"--muted"})"></span>${STYLE_EN[w.style]||esc(w.style)}</td>
      <td class="num">${state.status==="drunk"?w.drunk:w.left}</td>
      <td class="num">${SHOW_PRICES ? (w.price?kr(w.price):"—") : "···"}</td>
    </tr>
    <tr class="detail" hidden><td colspan="6">${detailHTML(w)}</td></tr>`;
  }).join("");

  bindWineRows("#rows");
}

// Wire up expand + per-row controls for a wine table (cellar or enjoyed).
function bindWineRows(scope){
  document.querySelectorAll(`${scope} tr.main`).forEach(tr=>{
    const open = ()=>{ const d=tr.nextElementSibling; const show=d.hidden; d.hidden=!show;
      tr.setAttribute("aria-expanded",String(show)); KEEP_OPEN = show ? Number(tr.dataset.row) : null; };
    tr.addEventListener("click",e=>{ if(e.target.closest("a,button,select,input,label")) return; open(); });
    tr.addEventListener("keydown",e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); open(); } });
  });
  // keep the actively-edited row expanded through re-renders
  if(KEEP_OPEN!=null){
    const tr=document.querySelector(`${scope} tr.main[data-row="${KEEP_OPEN}"]`);
    if(tr && tr.nextElementSibling){ tr.nextElementSibling.hidden=false; tr.setAttribute("aria-expanded","true"); }
  }
  document.querySelectorAll(`${scope} button.drink`).forEach(b=>
    b.addEventListener("click",()=>rowAction(b.dataset.act, Number(b.dataset.row), b)));
  document.querySelectorAll(`${scope} select.rate`).forEach(sel=>
    sel.addEventListener("change",()=>rateWine(Number(sel.dataset.row), sel.value, sel)));
  document.querySelectorAll(`${scope} input.setval`).forEach(inp=>
    inp.addEventListener("change",()=>setValueApi(Number(inp.dataset.row), inp.value, inp)));
  document.querySelectorAll(`${scope} input.setdate`).forEach(inp=>
    inp.addEventListener("change",()=>setDateApi(Number(inp.dataset.row), inp.dataset.field, inp.value, inp)));
  document.querySelectorAll(`${scope} input.setwin`).forEach(inp=>
    inp.addEventListener("change",()=>setWindowApi(inp)));
  document.querySelectorAll(`${scope} .wj-more`).forEach(b=>
    b.addEventListener("click",()=>{ location.hash="journal"; }));
  document.querySelectorAll(`${scope} button.jlog`).forEach(b=>
    b.addEventListener("click",()=>{
      const w = WINES.find(x=>x.row===Number(b.dataset.row));
      openJournalModal(w ? {producer:w.producer, wine:w.name, vintage:w.vintage,
        country:w.country, region:w.region, grape:w.grape} : null);
    }));
}

/* ---------- actions ---------- */
async function loadData(){
  $("spin").hidden = false; $("content").hidden = true;
  try{
    const res = await api({action:"data"});
    WINES = normalize(res.wines);
    $("priceBtn").textContent = SHOW_PRICES ? "Hide prices" : "Show prices";
    renderOverview(); renderTable(); renderEnjoyed();
    $("stamp").textContent = "Updated "+new Date().toLocaleString("da-DK",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
    $("spin").hidden = true; $("content").hidden = false;
    loadJournalSilently();
  }catch(err){
    if(AUTH_ERRORS.has(err.message)){ forgetAuth(); setGateMode("login"); showGate("Your session expired — log in again."); }
    else { $("spin").textContent = "Could not reach the cellar API ("+err.message+"). Check your connection and refresh."; }
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
    toast(val==="" ? "Score cleared" : "Scored "+val+"/10 🍷");
  }catch(err){ toast("Could not save score: "+err.message); }
  sel.disabled = false;
}

async function setValueApi(row, val, inp){
  inp.disabled = true;
  const clean = val===""? "" : Math.max(0, Number(val)||0);
  try{
    const res = await api({action:"setvalue", row, value: clean});
    WINES = normalize(res.wines);
    renderOverview(); renderTable(); renderEnjoyed();
    toast(clean==="" ? "Value cleared" : "Value set to "+kr(clean));
  }catch(err){ toast("Could not save value: "+err.message); }
  inp.disabled = false;
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
    toast((from||to) ? "Drink window saved" : "Drink window cleared");
  }catch(err){ toast("Could not save window: "+err.message); }
  ins.forEach(x=>x.disabled=false);
}

async function setDateApi(row, field, val, inp){
  inp.disabled = true;
  const label = field==="acquired" ? "Acquired date" : "Last-drunk date";
  try{
    const res = await api({action:"setdate", row, field, value: val||""});
    WINES = normalize(res.wines);
    renderOverview(); renderTable(); renderEnjoyed();
    toast(val ? label+" updated" : label+" cleared");
  }catch(err){ toast("Could not save date: "+err.message); }
  inp.disabled = false;
}

async function rowAction(act, row, btn){
  const w = WINES.find(x=>x.row===row);
  if(act==="delete"){
    const name = w ? `${w.producer} ${w.name} ${w.vintage||""}`.trim() : "this wine";
    if(!confirm(`Delete ${name} from the cellar?\nThis removes the whole row from the sheet.`)) return;
  }
  const wasLast = act==="drink" && w && w.left===1;
  btn.disabled = true; btn.textContent = "Updating…";
  try{
    const res = await api({action:act, row, qty:1});
    WINES = normalize(res.wines);
    renderOverview(); renderTable(); renderEnjoyed();
    toast(act==="drink" ? "Skål! Bottle marked as drunk 🍷"
        : act==="undrink" ? "Bottle back in the cellar 🍾"
        : "Wine deleted from the sheet");
    if(wasLast){
      const nw = WINES.find(x=>x.row===row) || w;
      setTimeout(()=>{
        if(confirm(`That was your last ${nw.producer}${nw.name?" "+nw.name:""}${nw.vintage?" "+nw.vintage:""} 🍷\nLog a tasting note in the journal?`))
          openJournalModal({producer:nw.producer, wine:nw.name, vintage:nw.vintage,
            country:nw.country, region:nw.region, grape:nw.grape});
      }, 250);
    }
  }catch(err){ toast("Could not update: "+err.message); btn.disabled=false; }
}

async function addWine(e){
  e.preventDefault();
  const btn = $("addSave"); btn.disabled = true; btn.textContent = "Adding…";
  const v = id => $(id).value.trim();
  const wine = {
    producer:v("aProducer"), name:v("aName"), commune:v("aCommune"),
    country:v("aCountry"), region:v("aRegion"), classification:v("aClass"),
    type:v("aType"), grape:v("aGrape"),
    vintage: /^\d{4}$/.test(v("aVintage")) ? Number(v("aVintage")) : v("aVintage"),
    qty: Number(v("aQty"))||1,
    price: v("aPrice")===""? "" : Number(v("aPrice")),
    acquired: v("aAcquired"), source:v("aSource"), note:v("aNote"),
  };
  try{
    const res = await api({action:"add", wine});
    WINES = normalize(res.wines);
    renderOverview(); renderTable(); renderEnjoyed();
    $("addModal").classList.remove("open");
    $("addForm").reset(); $("aQty").value = 1; $("aCountry").value = "Frankrig";
    toast(wine.producer+" added to the cellar");
  }catch(err){ toast("Could not add: "+err.message); }
  btn.disabled = false; btn.textContent = "Add to cellar";
}

/* ---------- gate ---------- */
let GATE_MODE = "login"; // or "signup"
function showGate(msg){
  $("app").hidden = true; $("gate").hidden = false;
  $("gateApiWrap").hidden = !!cfg.api;
  $("gateErr").textContent = msg||"";
  setTimeout(()=>$("gateUser").focus(), 50);
}
function setGateMode(mode){
  GATE_MODE = mode;
  const signup = mode==="signup";
  $("gateInviteWrap").hidden = !signup;
  $("gateLead").textContent = signup
    ? "Create your own cellar. You'll need an invite code."
    : "Your private cellar. Log in to continue.";
  $("gateSubmit").textContent = signup ? "Create account" : "Log in";
  $("gateToggle").textContent = signup ? "Have an account? Log in" : "Need an account? Sign up";
  $("gatePass").setAttribute("autocomplete", signup ? "new-password" : "current-password");
  $("gateErr").textContent = "";
}
// Friendly text for the error codes the API returns.
const AUTH_MSG = {
  "bad-login":"Wrong username or password.", "bad-invite":"That invite code isn't right.",
  "signup-disabled":"Signups are closed right now.", "user-taken":"That username is taken.",
  "bad-username":"Username: 3–24 letters, numbers, . _ or -.", "weak-pass":"Use a password of at least 6 characters.",
  "no-cellar":"Your cellar couldn't be opened. Contact the owner.",
};
function forgetAuth(){
  localStorage.removeItem("vinUser"); localStorage.removeItem("vinToken");
  cfg.user=""; cfg.token="";
  // Drop the previous user's cached data so the next login can't see it (the
  // journal/wishlist loaders short-circuit on these).
  WINES=[]; JENTRIES=null; WITEMS=null; KEEP_OPEN=null;
}
function enterApp(){ $("gate").hidden = true; $("app").hidden = false; loadData(); route(); }

$("gateToggle").addEventListener("click", ()=> setGateMode(GATE_MODE==="login" ? "signup" : "login"));

$("gateForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const apiIn = $("gateApi").value.trim();
  if(!cfg.api && apiIn){ cfg.api = apiIn; localStorage.setItem("vinApi", apiIn); }
  if(!cfg.api){ $("gateErr").textContent = "The API URL is missing."; return; }
  const user = $("gateUser").value.trim(), pass = $("gatePass").value;
  if(!user || !pass){ $("gateErr").textContent = "Enter your username and password."; return; }
  const signup = GATE_MODE==="signup";
  $("gateSubmit").disabled = true; $("gateErr").textContent = signup ? "Creating…" : "Signing in…";
  try{
    const params = signup
      ? {action:"signup", user, pass, code:$("gateInvite").value.trim()}
      : {action:"login", user, pass};
    const data = await post(params);
    if(!data.ok){ $("gateErr").textContent = AUTH_MSG[data.error] || ("Could not sign in ("+data.error+")."); return; }
    cfg.user = data.user; cfg.token = data.token;
    localStorage.setItem("vinUser", cfg.user); localStorage.setItem("vinToken", cfg.token);
    $("gatePass").value = ""; $("gateInvite").value = "";
    enterApp();
  }catch(err){ $("gateErr").textContent = "Could not reach the cellar API ("+err.message+")."; }
  finally{ $("gateSubmit").disabled = false; }
});

/* ---------- header actions ---------- */
$("refreshBtn").addEventListener("click", loadData);
$("lockBtn").addEventListener("click", ()=>{ forgetAuth(); setGateMode("login"); showGate("Signed out. Log in to reopen."); });
$("priceBtn").addEventListener("click", ()=>{
  SHOW_PRICES = !SHOW_PRICES;
  localStorage.setItem("vinHidePrices", SHOW_PRICES ? "0" : "1");
  $("priceBtn").textContent = SHOW_PRICES ? "Hide prices" : "Show prices";
  renderOverview(); renderTable(); renderEnjoyed();
});
$("addBtn").addEventListener("click", ()=>{
  if(!$("aAcquired").value) $("aAcquired").value = new Date().toISOString().slice(0,10);
  $("addModal").classList.add("open"); $("aProducer").focus();
});
$("addCancel").addEventListener("click", ()=>$("addModal").classList.remove("open"));
$("addModal").addEventListener("click", e=>{ if(e.target===$("addModal")) $("addModal").classList.remove("open"); });
$("addForm").addEventListener("submit", addWine);

/* ---------- filters / sorting (bound once) ---------- */
$("q").addEventListener("input",e=>{ state.q=e.target.value; renderTable(); });
$("fRegion").addEventListener("change",e=>{ state.region=e.target.value; renderTable(); });
$("fStyle").addEventListener("change",e=>{ state.style=e.target.value; renderTable(); });
$("fStatus").addEventListener("change",e=>{ state.status=e.target.value; renderTable(); });
$("fReady").addEventListener("change",e=>{ state.ready=e.target.value; renderTable(); });
$("clear").addEventListener("click",()=>{
  state.q=state.region=state.style=state.ready=""; state.status="cellar";
  $("q").value=""; $("fRegion").value=""; $("fStyle").value=""; $("fStatus").value="cellar"; $("fReady").value=""; renderTable(); });
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
// Simplified country outlines as [lng, lat] — a stylized reference frame, not survey-accurate.
const LANDS = {
  France:[[2.5,51.0],[4.0,50.3],[5.9,49.5],[7.6,49.0],[8.2,48.6],[7.6,47.6],[7.0,47.4],[6.8,46.4],[6.1,46.1],[7.0,45.5],[6.9,44.4],[7.7,43.9],[7.4,43.7],[6.0,43.1],[5.0,43.3],[4.0,43.5],[3.0,43.2],[3.0,42.5],[1.0,42.6],[-0.5,42.8],[-1.4,43.3],[-1.2,44.6],[-1.1,45.6],[-1.8,46.5],[-2.2,47.2],[-4.7,47.8],[-4.8,48.4],[-3.5,48.8],[-1.6,48.6],[-1.4,49.7],[0.2,49.5],[1.6,50.1]],
  Switzerland:[[6.1,46.1],[7.0,45.9],[8.4,46.4],[9.5,46.4],[10.5,46.9],[9.6,47.6],[8.4,47.7],[7.0,47.4],[6.8,46.4]],
  Germany:[[5.9,49.5],[6.1,50.8],[7.2,51.3],[8.7,50.6],[9.5,49.8],[10.0,50.6],[11.5,50.4],[12.5,50.2],[13.0,49.3],[13.4,48.9],[12.8,48.2],[11.0,47.9],[9.6,47.6],[8.4,47.7],[7.6,47.6],[8.2,48.6],[7.6,49.0],[6.4,49.2]],
  Italy:[[7.0,45.5],[7.9,45.0],[9.0,45.8],[10.6,46.5],[12.4,46.8],[13.6,45.8],[13.1,45.6],[13.5,44.0],[14.0,42.0],[15.4,41.9],[16.2,41.4],[17.2,40.5],[16.5,39.9],[17.1,39.4],[16.1,38.9],[15.6,38.0],[15.9,38.9],[16.0,39.9],[15.0,40.0],[14.0,40.8],[13.6,41.3],[12.4,41.3],[11.2,42.4],[10.5,42.9],[10.7,43.6],[10.3,44.0],[9.9,44.1],[8.8,44.4],[7.6,44.1],[7.0,44.7]],
  Spain:[[3.3,42.3],[0.7,41.0],[0.9,40.2],[-0.3,39.5],[0.0,38.8],[-0.7,37.6],[-2.2,36.7],[-4.4,36.7],[-5.6,36.0],[-6.3,36.9],[-7.4,37.2],[-7.5,38.0],[-7.0,38.5],[-7.0,39.5],[-6.9,41.0],[-8.2,41.9],[-8.8,42.0],[-8.0,43.2],[-5.8,43.6],[-3.8,43.5],[-1.4,43.4],[-0.5,42.8],[0.7,42.7],[1.5,42.6]],
  Portugal:[[-8.9,37.0],[-8.2,37.1],[-7.4,37.2],[-7.0,38.0],[-7.5,38.8],[-7.0,39.7],[-6.9,41.0],[-8.2,41.9],[-8.8,41.9],[-9.0,41.0],[-9.4,39.4],[-9.0,38.5],[-8.8,37.7]],
  Austria:[[9.6,47.0],[10.5,47.0],[11.0,46.8],[12.4,46.7],[13.7,46.5],[15.0,46.6],[16.0,46.8],[16.9,47.5],[16.5,48.3],[15.0,48.8],[13.7,48.6],[12.8,48.2],[11.0,47.5],[9.6,47.5]],
  Denmark:[[8.1,55.0],[8.1,56.5],[8.6,57.1],[9.6,57.6],[10.5,57.3],[10.7,56.6],[10.2,56.0],[10.6,55.5],[12.6,55.6],[12.3,55.0],[11.0,54.8],[9.4,54.8],[8.5,54.9]],
};
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
const COUNTRY_EN = {France:"France",Italy:"Italien",Germany:"Tyskland",Spain:"Spanien",Portugal:"Portugal",Austria:"Østrig",Denmark:"Danmark"};
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
function buildProjector(W, pad, polys, extraPts){
  polys = polys || Object.values(LANDS);
  let minx=Infinity,maxx=-Infinity,miny=Infinity,maxy=-Infinity;
  const acc=(lng,lat)=>{ const x=lng*COS; if(x<minx)minx=x; if(x>maxx)maxx=x; if(lat<miny)miny=lat; if(lat>maxy)maxy=lat; };
  for(const poly of polys) for(const [lng,lat] of poly) acc(lng,lat);
  (extraPts||[]).forEach(([lat,lng])=>acc(lng,lat));
  const s=(W-2*pad)/Math.max(0.0001,(maxx-minx));
  const H=(maxy-miny)*s+2*pad;
  return { W, H, proj:([lng,lat])=>[pad+(lng*COS-minx)*s, pad+(maxy-lat)*s], r:(b)=>4+Math.sqrt(b)*1.7 };
}

function updateMap(cellar){ LAST_CELLAR = cellar; renderMap(); }

function renderMap(){
  const svg=$("map"); if(!svg) return;
  hideTip(); // re-rendering replaces the dots; any hover tip would otherwise be orphaned
  $("mapbar").hidden = MAP_VIEW==="europe";
  if(MAP_VIEW!=="europe"){
    $("mapBack").textContent = MAP_VIEW.startsWith("country:") ? "← Europe"
      : REGION_COUNTRY[MAP_VIEW] ? "← "+COUNTRY_EN[REGION_COUNTRY[MAP_VIEW]] : "← Europe";
  }
  if(MAP_VIEW.startsWith("country:")) return renderCountryMap(svg, MAP_VIEW.slice(8));
  if(MAP_VIEW==="Bourgogne") return renderCoteMap(svg);
  if(MAP_VIEW==="Champagne") return renderChampagneMap(svg);
  if(MAP_VIEW==="Mosel") return renderScatterMap(svg, {
    title:"Mosel · Saar · Ruwer — villages", region:"Mosel",
    geo:MOSEL_GEO, cities:MOSEL_CITIES, areas:MOSEL_AREAS, lat:49.8 });
  if(MAP_VIEW==="Piemonte") return renderScatterMap(svg, {
    title:"Piemonte — Langhe & beyond", region:"Piemonte",
    geo:PIEMONTE_GEO, cities:PIEMONTE_CITIES, areas:PIEMONTE_AREAS, lat:44.7 });
  renderEuropeMap(svg);
}

function bindDot(c, tipHtml, onClick){
  c.addEventListener("mousemove",e=>showTip(tipHtml,e.clientX,e.clientY));
  c.addEventListener("mouseleave",hideTip);
  c.addEventListener("click",e=>{ hideTip(); onClick(e); }); // touch has no mouseleave — drop the tip on tap
}

const DRILLABLE = ["Bourgogne","Champagne","Mosel","Piemonte"];

// Top level: the whole of (wine-)Europe, one dot per country. Click to zoom in.
function renderEuropeMap(svg){
  const {W,H,proj,r}=buildProjector(600,24);
  const agg={};
  LAST_CELLAR.forEach(w=>{ const k=countryOf(w); if(!k) return; const a=agg[k.key] ??= {b:0,n:0}; a.b+=w.left; a.n++; });
  let html = Object.values(LANDS).map(poly=>{
    const d = poly.map((p,i)=>(i?"L":"M")+proj(p).map(n=>n.toFixed(1)).join(" ")).join("")+"Z";
    return `<path class="land" d="${d}"/>`;
  }).join("");
  const present = COUNTRIES.filter(c=>agg[c.key]).sort((a,b)=>agg[b.key].b-agg[a.key].b);
  html += present.map(c=>{
    const [x,y]=proj([c.geo[1],c.geo[0]]); const a=agg[c.key];
    return `<circle class="dot" data-country="${esc(c.key)}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r(a.b).toFixed(1)}"/>`;
  }).join("");
  html += present.map(c=>{
    const [x,y]=proj([c.geo[1],c.geo[0]]); const a=agg[c.key], rad=r(a.b), left=x>W*0.6;
    const lx=(left?x-rad-4:x+rad+4).toFixed(1), anc=left?"end":"start";
    return `<text class="dlabel" text-anchor="${anc}" x="${lx}" y="${(y-1).toFixed(1)}">${esc(COUNTRY_EN[c.key])}</text>
      <text class="dsub" text-anchor="${anc}" x="${lx}" y="${(y+10).toFixed(1)}">${a.b} btl.</text>`;
  }).join("");
  svg.setAttribute("viewBox",`0 0 ${W} ${Math.round(H)}`);
  svg.innerHTML = html;
  svg.querySelectorAll(".dot").forEach(c=>{
    const key=c.dataset.country, a=agg[key];
    bindDot(c, `<b>${esc(COUNTRY_EN[key])}</b><br>${a.b} bottle${a.b>1?"s":""} · ${a.n} wine${a.n>1?"s":""}<br><i>click to explore</i>`,
      ()=>{ MAP_VIEW="country:"+key; state.q=""; $("q").value=""; renderMap(); });
  });
}

// Middle level: one country, its regions as dots. Click a region to filter (or
// drill further for Bourgogne / Champagne / Mosel / Piemonte).
function renderCountryMap(svg, key){
  $("mapTitle").textContent = COUNTRY_EN[key] + " — regions";
  const agg={};
  LAST_CELLAR.forEach(w=>{ if((countryOf(w)||{}).key!==key) return;
    const a=agg[w.region] ??= {b:0,n:0}; a.b+=w.left; a.n++; });
  const names = Object.keys(agg);
  const present = names.filter(n=>REGION_GEO[n]).sort((a,b)=>agg[b].b-agg[a].b);
  const buckets = names.filter(n=>!REGION_GEO[n] && n).sort((a,b)=>agg[b].b-agg[a].b);
  const outline = LANDS[key] ? [LANDS[key]] : Object.values(LANDS);
  const extra = present.map(n=>REGION_GEO[n]);
  const {W,H,proj,r}=buildProjector(600,30,outline,extra);
  const HB = buckets.length ? 30 : 0;
  let parts = outline.map(poly=>`<path class="land" d="${poly.map((p,i)=>(i?"L":"M")+proj(p).map(n=>n.toFixed(1)).join(" ")).join("")}Z"/>`).join("");
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
    parts += `<text class="dsub" x="30" y="${(by-20).toFixed(1)}">Not placed:</text>`;
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
    bindDot(c, `<b>${esc(name)}</b><br>${a.b} bottle${a.b>1?"s":""} · ${a.n} wine${a.n>1?"s":""}${drill?"<br><i>click to explore</i>":"<br><i>click to filter the list</i>"}`,
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
      <circle class="dot" data-q="${esc(a.q)}" data-label="${esc(o.l)}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad.toFixed(1)}"/>
      <text class="dlabel" x="${LX}" y="${(ly+4).toFixed(1)}">${esc(o.l)} · ${a.b}</text>`);
  });
  // wines without a single spot on the Côte
  if(buckets.length){
    const by=H-42; let bx=X0;
    parts.push(`<text class="dsub" x="18" y="${by-26}">Without a spot on the Côte:</text>`);
    buckets.forEach(l=>{
      const a=agg[l], rad=4+Math.sqrt(a.b)*1.9;
      parts.push(`<circle class="dot" data-q="${esc(a.q)}" data-label="${esc(l)}" cx="${bx.toFixed(1)}" cy="${by}" r="${rad.toFixed(1)}"/>
        <text class="dlabel" x="${(bx+rad+7).toFixed(1)}" y="${by+4}">${esc(l)} · ${a.b}</text>`);
      bx += rad + 7 + (l.length+String(a.b).length+3)*7.2 + 44;
    });
  }
  svg.setAttribute("viewBox",`0 0 ${W} ${H}`);
  svg.innerHTML = parts.join("");
  bindDetailDots(svg);
}

function renderChampagneMap(svg){
  $("mapTitle").textContent = "Champagne — villages";
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
  // local projector over champagne coords
  const pts=keys.map(k=>CHAMP_GEO[k]);
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
  // Label every village. Nudge labels apart when dots share nearly the same row so none overlap.
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
  if(other) parts.push(`<text class="dsub" x="${pad}" y="${(H-12).toFixed(1)}">+ ${other.b} btl. elsewhere (${esc(other.q)}…)</text>`);
  svg.setAttribute("viewBox",`0 0 ${W} ${Math.round(H)}`);
  svg.innerHTML=parts.join("");
  bindDetailDots(svg, null);
}

// Generic village scatter (Mosel, Piemonte…): dots at real coords, area labels that
// only appear when the cellar reaches them, every dot labelled with collision-nudging.
function renderScatterMap(svg, cfg){
  $("mapTitle").textContent = cfg.title;
  const agg={}; let other=null;
  LAST_CELLAR.forEach(w=>{
    if(w.region!==cfg.region) return;
    const key=normName(w.commune);
    if(cfg.geo[key]){ const a=agg[key] ??= {b:0,n:0,q:w.commune,label:w.commune}; a.b+=w.left; a.n++; }
    else { other = other||{b:0,n:0,q:w.commune,label:"Elsewhere"}; other.b+=w.left; other.n++; }
  });
  const keys=Object.keys(agg);
  if(!keys.length){ // nothing mappable — fall back to the region overview
    svg.innerHTML=`<text class="dsub" x="20" y="30">No mapped villages yet in this region.</text>`;
    svg.setAttribute("viewBox","0 0 640 60"); return;
  }
  const near=(la,ln,dLa,dLn)=>keys.some(k=>Math.abs(cfg.geo[k][0]-la)<dLa && Math.abs(cfg.geo[k][1]-ln)<dLn);
  const cities=(cfg.cities||[]).filter(([,la,ln])=>near(la,ln,0.6,0.8));
  const areas=(cfg.areas||[]).filter(([,la,ln])=>near(la,ln,0.35,0.6));
  const pts=keys.map(k=>cfg.geo[k]).concat(cities.map(c=>[c[1],c[2]]), areas.map(a=>[a[1],a[2]]));
  const cos=Math.cos((cfg.lat||47)*Math.PI/180), pad=44, W=640, HMAX=520;
  let minx=Infinity,maxx=-Infinity,miny=Infinity,maxy=-Infinity;
  pts.forEach(([la,ln])=>{ const x=ln*cos; if(x<minx)minx=x; if(x>maxx)maxx=x; if(la<miny)miny=la; if(la>maxy)maxy=la; });
  const sx=(W-2*pad)/Math.max(0.0001,(maxx-minx));
  const latSpan=Math.max(0.0001,maxy-miny);
  // keep x geographic; compress latitude only if the region is taller than the panel allows
  const sy=Math.min(sx,(HMAX-2*pad)/latSpan);
  const H=Math.max(240,latSpan*sy+2*pad);
  const proj=([la,ln])=>[pad+(ln*cos-minx)*sx, (H-pad)-(la-miny)*sy];
  let parts=[];
  areas.forEach(([name,la,ln])=>{ const [x,y]=proj([la,ln]);
    const cx=Math.max(78,Math.min(W-78,x));
    parts.push(`<text class="sec" text-anchor="middle" x="${cx.toFixed(1)}" y="${y.toFixed(1)}">${esc(name)}</text>`); });
  cities.forEach(([name,la,ln])=>{ const [x,y]=proj([la,ln]);
    parts.push(`<text class="city" x="${(x+9).toFixed(1)}" y="${(y+3).toFixed(1)}">${esc(name)}</text>
      <path class="route" d="M ${(x-5).toFixed(1)} ${y.toFixed(1)} L ${(x+5).toFixed(1)} ${y.toFixed(1)} M ${x.toFixed(1)} ${(y-5).toFixed(1)} L ${x.toFixed(1)} ${(y+5).toFixed(1)}"/>`); });
  const entries=keys.map(k=>{ const a=agg[k], [x,y]=proj(cfg.geo[k]); return {a,x,y}; }).sort((p,q)=>q.a.b-p.a.b);
  const placedL=[], placedR=[];
  entries.forEach(({a,x,y})=>{
    const rad=4+Math.sqrt(a.b)*2.0;
    parts.push(`<circle class="dot" data-q="${esc(a.q)}" data-label="${esc(a.label)}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad.toFixed(1)}"/>`);
    const left=x>W*0.6, placed=left?placedL:placedR; let ly=y+4;
    while(placed.some(py=>Math.abs(py-ly)<11)) ly+=11;
    placed.push(ly);
    parts.push(`<text class="dlabel" text-anchor="${left?"end":"start"}" x="${(left?x-rad-5:x+rad+5).toFixed(1)}" y="${ly.toFixed(1)}">${esc(a.label)} · ${a.b}</text>`);
  });
  if(other) parts.push(`<text class="dsub" x="${pad}" y="${(H-12).toFixed(1)}">+ ${other.b} btl. elsewhere (${esc(other.q)}…)</text>`);
  svg.setAttribute("viewBox",`0 0 ${W} ${Math.round(H)}`);
  svg.innerHTML=parts.join("");
  bindDetailDots(svg);
}

function bindDetailDots(svg){
  svg.querySelectorAll(".dot").forEach(c=>{
    const q=c.dataset.q, label=c.dataset.label||q;
    bindDot(c, `<b>${esc(label)}</b><br><i>click to filter the list</i>`, ()=>{
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
function pickTonight(){
  const pool = WINES.filter(w=>w.left>0);
  if(!pool.length){ toast("The cellar is empty…"); return; }
  const total = pool.reduce((s,w)=>s+w.left,0);
  let pick = pool[pool.length-1], r = Math.random()*total;
  for(const w of pool){ r -= w.left; if(r<=0){ pick = w; break; } }
  const m = document.createElement("div");
  m.className = "modal open";
  m.innerHTML = `<div class="card" style="max-width:560px">
    <h2>Tonight's bottle 🍷</h2>
    <p style="margin:0 0 2px;font-size:16px"><b>${esc(pick.producer)}</b> · ${esc(pick.name)}${pick.vintage?" · "+esc(pick.vintage):""}</p>
    <p style="color:var(--muted);font-size:13px;margin:0 0 12px">${esc(pick.region)}${pick.commune&&pick.commune!==pick.name?" · "+esc(pick.commune):""}</p>
    ${detailHTML(pick)}
    <div class="mact">
      <button type="button" class="btn" data-x="again">🎲 Pick another</button>
      <button type="button" class="btn primary" data-x="close">Close</button>
    </div></div>`;
  document.body.appendChild(m);
  m.addEventListener("click",e=>{ if(e.target===m) m.remove(); });
  m.querySelector('[data-x="close"]').addEventListener("click",()=>m.remove());
  m.querySelector('[data-x="again"]').addEventListener("click",()=>{ m.remove(); pickTonight(); });
  m.querySelectorAll("button.drink").forEach(db=>
    db.addEventListener("click", async ()=>{ await rowAction(db.dataset.act, Number(db.dataset.row), db); m.remove(); }));
  m.querySelectorAll("select.rate").forEach(sel=>
    sel.addEventListener("change",()=>rateWine(Number(sel.dataset.row), sel.value, sel)));
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

async function loadPhoto(id){
  if(PHOTOS[id]) return PHOTOS[id];
  const res = await api({action:"photo", id});
  PHOTOS[id] = res.photo;
  return res.photo;
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
    if(AUTH_ERRORS.has(err.message)){ forgetAuth(); setGateMode("login"); showGate("Your session expired — log in again."); }
    else $("jList").innerHTML = `<div class="spin">Could not load the journal (${esc(err.message)}). The Apps Script may need the latest redeploy.</div>`;
  }
  $("jSpin").hidden = true;
}

function renderJournal(){
  const list = [...(JENTRIES||[])].sort((a,b)=>String(b.date).localeCompare(String(a.date)) || b.row-a.row);
  $("jCount").textContent = list.length ? list.length+(list.length===1?" entry":" entries") : "";
  $("jList").innerHTML = list.length ? list.map(e=>{
    const d = e.date ? new Date(String(e.date).slice(0,10)+"T12:00:00") : null;
    const ds = d && !isNaN(d) ? d.toLocaleDateString("da-DK",{day:"numeric",month:"long",year:"numeric"}) : esc(String(e.date));
    const n = Math.max(0, Math.min(10, Number(e.rating)||0));
    const glasses = n ? n+"/10 🍷" : "";
    const photo = e.photo ? `<div class="jphoto" data-id="${esc(String(e.photo))}"><span class="jphoto-ph">📷</span></div>` : "";
    return `<div class="jentry">
      <div class="jtop"><span class="jdate">${ds}</span>
        ${e.place?`<span class="jplace">📍 ${esc(e.place)}</span>`:""}
        <button class="jedit" data-row="${e.row}" title="Edit entry">✏️</button>
        <button class="jdel" data-row="${e.row}" title="Delete entry">🗑</button></div>
      <div class="jwine">${esc(e.producer)}${e.wine?" · "+esc(e.wine):""}${e.vintage?" · "+esc(e.vintage):""}
        ${glasses?`<span class="jglasses">${glasses}</span>`:""}</div>
      ${(e.region||e.country||e.grape)?`<div class="jmeta">${[e.region,e.country,e.grape].filter(Boolean).map(esc).join(" · ")}</div>`:""}
      ${e.note?`<div class="jnote">${esc(e.note)}</div>`:""}
      ${photo}
    </div>`;
  }).join("") : `<div class="spin">No entries yet — press “＋ New entry” after your next good bottle.</div>`;
  document.querySelectorAll(".jphoto[data-id]").forEach(el=>{
    const id = el.dataset.id;
    loadPhoto(id).then(src=>{
      el.innerHTML = `<img src="${src}" alt="Tasting photo" loading="lazy">`;
      el.classList.add("ready");
      el.addEventListener("click",()=>openPhotoLightbox(src));
    }).catch(()=>{ el.innerHTML = `<span class="jphoto-ph err">photo unavailable</span>`; });
  });
  document.querySelectorAll(".jedit").forEach(b=>b.addEventListener("click",()=>{
    const e = (JENTRIES||[]).find(x=>x.row===Number(b.dataset.row));
    if(e) openJournalEdit(e);
  }));
  document.querySelectorAll(".jdel").forEach(b=>b.addEventListener("click", async ()=>{
    if(!confirm("Delete this journal entry?")) return;
    try{
      const res = await api({action:"jdelete", row:Number(b.dataset.row)});
      JENTRIES = res.entries || []; renderJournal(); toast("Entry deleted");
    }catch(err){ toast("Could not delete: "+err.message); }
  }));
}

function prepJournalModal(){
  $("jForm").reset();
  J_PHOTO_REMOVE = false;
  $("jErr").hidden = true; $("jErr").textContent = "";
  $("jPhotoPrev").hidden = true; $("jPhotoPrev").removeAttribute("src");
  $("jPhotoRemoveBtn").hidden = true;
  $("jProducers").innerHTML = [...new Set(WINES.map(w=>w.producer).filter(Boolean))].sort().map(x=>`<option>${esc(x)}</option>`).join("");
  $("jPlaces").innerHTML = [...new Set((JENTRIES||[]).map(e=>e.place).filter(Boolean))].sort().map(x=>`<option>${esc(x)}</option>`).join("");
  $("jModal").classList.add("open");
}

function openJournalModal(prefill){
  J_EDIT = null;
  prepJournalModal();
  $("jTitle").textContent = "New journal entry";
  $("jSave").textContent = "Save entry";
  $("jDate").value = new Date().toISOString().slice(0,10);
  if(prefill){
    $("jProducer").value = prefill.producer || "";
    $("jWine").value = prefill.wine || "";
    $("jVintage").value = prefill.vintage || "";
    $("jCountry").value = prefill.country || "";
    $("jRegion").value = prefill.region || "";
    $("jGrape").value = prefill.grape || "";
  }
  setTimeout(()=>$(prefill?"jPlace":"jProducer").focus(), 40);
}

function openJournalEdit(e){
  J_EDIT = e.row;
  prepJournalModal();
  $("jTitle").textContent = "Edit journal entry";
  $("jSave").textContent = "Save changes";
  $("jDate").value = String(e.date||"").slice(0,10) || new Date().toISOString().slice(0,10);
  $("jProducer").value = e.producer || "";
  $("jWine").value = e.wine || "";
  $("jVintage").value = e.vintage!==""&&e.vintage!=null ? e.vintage : "";
  $("jCountry").value = e.country || "";
  $("jRegion").value = e.region || "";
  $("jGrape").value = e.grape || "";
  $("jPlace").value = e.place || "";
  $("jRating").value = e.rating ? String(e.rating) : "";
  $("jNote").value = e.note || "";
  if(e.photo){
    $("jPhotoRemoveBtn").hidden = false;
    loadPhoto(e.photo).then(src=>{ if(J_EDIT===e.row && !J_PHOTO_REMOVE && !$("jPhoto").files[0]){
      $("jPhotoPrev").src = src; $("jPhotoPrev").hidden = false; } }).catch(()=>{});
  }
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
  const btn = $("jSave"); btn.disabled = true; btn.textContent = "Saving…";
  const v = id => $(id).value.trim();
  const entry = {
    date: v("jDate"), producer: v("jProducer"), wine: v("jWine"),
    vintage: /^\d{4}$/.test(v("jVintage")) ? Number(v("jVintage")) : v("jVintage"),
    country: v("jCountry"), region: v("jRegion"), grape: v("jGrape"),
    place: v("jPlace"), rating: v("jRating") ? Number(v("jRating")) : "", note: v("jNote"),
  };
  const file = $("jPhoto").files[0];
  if(file){
    btn.textContent = "Preparing photo…";
    try{ entry.photo = await shrinkImage(file); }
    catch(err){ toast("Couldn't read that photo — saving without it"); }
  }else if(editing && J_PHOTO_REMOVE){
    entry.photoRemove = true;
  }
  try{
    btn.textContent = "Saving…";
    const res = editing
      ? await api({action:"jedit", row:J_EDIT, entry})
      : await api({action:"jadd", entry});
    JENTRIES = res.entries || [];
    $("jModal").classList.remove("open");
    renderJournal();
    if(location.hash!=="#journal") location.hash = "#journal";
    toast(editing ? "Journal entry updated 📓" : "Journal entry saved 📓");
  }catch(err){
    const m = String(err.message||"");
    const hint = /authori[sz]|permission/i.test(m)
      ? " — the API needs Drive access. In Apps Script, run the “authorize” function once and approve, then try again."
      : "";
    $("jErr").textContent = "Could not save: "+m+hint;
    $("jErr").hidden = false;
    toast("Could not save — see the message in the form");
  }
  btn.disabled = false; btn.textContent = editing ? "Save changes" : "Save entry";
});

/* ---------- enjoyed (cellar history) ---------- */
const eState = {q:"", style:"", sortK:"drunkDate", sortDir:-1};
const styleColor = s => HIST_COLOR[s] || "var(--muted)";

function renderEnjoyed(){
  const drunk = WINES.filter(w=>w.drunk>0);
  drawEnjoyedCharts(drunk);
  // KPIs over everything enjoyed
  const bottles = drunk.reduce((s,w)=>s+w.drunk,0);
  const valueDrunk = drunk.reduce((s,w)=>s+(w.price||0)*w.drunk,0);
  const prodAgg = {}; drunk.forEach(w=>{ prodAgg[w.producer]=(prodAgg[w.producer]||0)+w.drunk; });
  const top = Object.entries(prodAgg).sort((a,b)=>b[1]-a[1])[0];
  const kpis = [["Bottles enjoyed", fmt(bottles), drunk.length+" different wines", ""]];
  if(SHOW_PRICES) kpis.push(["Value enjoyed", kr(valueDrunk), "at purchase price", ""]);
  else kpis.push(["Value enjoyed", "🔒 hidden", "press Show prices", "locked"]);
  if(top) kpis.push(["Most enjoyed", esc(top[0]), top[1]+" bottle"+(top[1]>1?"s":""), ""]);
  $("eKpis").innerHTML = kpis.map(([l,v,h,c])=>
    `<div class="kpi ${c}"><div class="lbl">${l}</div><div class="val">${v}</div><div class="hint">${h}</div></div>`).join("");

  // filter + sort the list
  const q = eState.q.trim().toLowerCase();
  let list = drunk.filter(w=>{
    if(eState.style && w.style!==eState.style) return false;
    if(!q) return true;
    return [w.producer,w.name,w.commune,w.region,w.grape,w.classification,String(w.vintage)].join(" ").toLowerCase().includes(q);
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

  let ct = `${list.length} wines · ${fmt(list.reduce((s,w)=>s+w.drunk,0))} btl.`;
  if(SHOW_PRICES) ct += ` · ${kr(list.reduce((s,w)=>s+(w.price||0)*w.drunk,0))}`;
  $("eCount").textContent = ct;

  if(!list.length){
    $("eRows").innerHTML = `<tr><td colspan="7"><div class="spin">${q?"No enjoyed wines match your search.":"Nothing enjoyed yet — bottles you finish will collect here."}</div></td></tr>`;
    return;
  }
  $("eRows").innerHTML = list.map((w,i)=>{
    const pn = PRODUCER_NOTES[w.producer];
    const badge = pn?`<span class="badge ${pn[0]}">${TIER_LABEL[pn[0]]}</span>`:"";
    const nm = [w.name, w.commune && w.commune!==w.name ? w.commune : ""].filter(Boolean).join(" · ");
    return `<tr class="main" data-i="${i}" data-row="${w.row}" tabindex="0" aria-expanded="false">
      <td><span class="prod">${esc(w.producer)}</span>${badge}<br><span class="wname">${esc(nm)}${w.classification&&w.classification!=="AOC"?" · <b>"+esc(w.classification)+"</b>":""}${w.rating?` · <span class="myscore">${w.rating}/10</span>`:""}</span></td>
      <td class="num">${esc(w.vintage||"—")}</td>
      <td>${esc(w.region)}</td>
      <td><span class="sdot" style="background:var(${STYLE_VAR[w.style]||"--muted"})"></span>${STYLE_EN[w.style]||esc(w.style)}</td>
      <td class="num">${w.drunk}</td>
      <td class="num">${w.drunkDate?esc(fmtDate(w.drunkDate)):"—"}</td>
      <td class="num">${SHOW_PRICES ? (w.price?kr(w.price):"—") : "···"}</td>
    </tr>
    <tr class="detail" hidden><td colspan="7">${detailHTML(w)}</td></tr>`;
  }).join("");
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
    <span>${STYLE_EN[s]}</span><span class="n">${styAgg[s]} btl. · ${Math.round(styAgg[s]/Math.max(1,total)*100)}%</span></button>`).join("");
  document.querySelectorAll("#eLegend button").forEach(el=>{
    el.classList.toggle("active", el.dataset.style===eState.style && !!eState.style);
    el.addEventListener("click",()=>{ eState.style = eState.style===el.dataset.style ? "" : el.dataset.style; renderEnjoyed(); });
  });
  // most-enjoyed producers
  const prodAgg={}; drunk.forEach(w=>{ prodAgg[w.producer]=(prodAgg[w.producer]||0)+w.drunk; });
  const prods=Object.entries(prodAgg).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const maxB=prods.length?prods[0][1]:1;
  $("eProducers").innerHTML = prods.map(([name,b])=>`
    <button class="rbar" data-prod="${esc(name)}" aria-label="${esc(name)}: ${b} bottles">
      <span class="rb-name">${esc(name)}</span>
      <span class="rb-track"><span class="rb-fill" style="width:${Math.max(2,b/maxB*100)}%"></span></span>
      <span class="rb-n">${b} btl.</span></button>`).join("") || `<div class="ph">Nothing yet.</div>`;
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
    <text class="pcen2" x="${C}" y="${C+22}" text-anchor="middle">enjoyed</text>`;
  svg.innerHTML=html;
  svg.querySelectorAll(".pslice").forEach(pl=>{
    const st=pl.dataset.style;
    pl.classList.toggle("on", st===eState.style && !!eState.style);
    pl.addEventListener("mousemove",e=>showTip(`<b>${STYLE_EN[st]}</b><br>${styAgg[st]} btl. · ${Math.round(styAgg[st]/Math.max(1,total)*100)}%`,e.clientX,e.clientY));
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
    cap.textContent = nodate ? `${nodate} bottle${nodate>1?"s":""} enjoyed without a date — mark drinks in the app so they’re dated.` : "";
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
      const breakdown=STYLES.filter(s=>seg[s]).map(s=>`${STYLE_EN[s]} ${seg[s]}`).join(" · ");
      const d=new Date(r.dataset.m+"-01T12:00:00");
      const ml=isNaN(d)?r.dataset.m:d.toLocaleDateString("da-DK",{month:"short",year:"numeric"});
      showTip(`<b>${ml}</b><br>${r.dataset.tot} bottle${r.dataset.tot>1?"s":""}<br><span style="opacity:.75">${esc(breakdown)}</span>`,e.clientX,e.clientY);
    });
    r.addEventListener("mouseleave",hideTip);
  });
  cap.textContent = nodate ? `${nodate} more enjoyed without a date (not shown)` : "";
}

function bindEnjoyedRows(){ bindWineRows("#eRows"); }

$("eq").addEventListener("input",e=>{ eState.q=e.target.value; renderEnjoyed(); });
document.querySelectorAll("#eTbl th[data-k]").forEach(th=>th.addEventListener("click",()=>{
  const k=th.dataset.k;
  if(eState.sortK===k) eState.sortDir*=-1;
  else { eState.sortK=k; eState.sortDir = (k==="price"||k==="drunk"||k==="drunkDate") ? -1 : 1; }
  renderEnjoyed();
}));

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
    if(AUTH_ERRORS.has(err.message)){ forgetAuth(); setGateMode("login"); showGate("Your session expired — log in again."); }
    else $("wList").innerHTML = `<div class="spin">Could not load the wishlist (${esc(err.message)}). The Apps Script may need the latest redeploy.</div>`;
  }
  $("wSpin").hidden = true;
}

function renderWishlist(){
  const list = [...(WITEMS||[])].sort((a,b)=>String(a.producer).localeCompare(String(b.producer)));
  $("wCount").textContent = list.length ? list.length+(list.length===1?" wish":" wishes") : "";
  $("wList").innerHTML = list.length ? list.map(e=>{
    const meta=[e.region, e.price?("target "+kr(e.price)):""].filter(Boolean).map(esc).join(" · ");
    return `<div class="jentry">
      <div class="jtop"><span class="jwine">${esc(e.producer)}${e.wine?" · "+esc(e.wine):""}${e.vintage?" · "+esc(e.vintage):""}</span>
        <button class="wedit" data-row="${e.row}" title="Edit">✏️</button>
        <button class="wdel" data-row="${e.row}" title="Delete">🗑</button></div>
      ${meta?`<div class="jmeta">${meta}</div>`:""}
      ${e.note?`<div class="jnote">${esc(e.note)}</div>`:""}
      <div class="wact"><button class="wmove" data-row="${e.row}">＋ Add to cellar</button></div>
    </div>`;
  }).join("") : `<div class="spin">Nothing on the wishlist yet — press “＋ Add wish”.</div>`;
  document.querySelectorAll(".wedit").forEach(b=>b.addEventListener("click",()=>{
    const e=(WITEMS||[]).find(x=>x.row===Number(b.dataset.row)); if(e) openWishEdit(e); }));
  document.querySelectorAll(".wdel").forEach(b=>b.addEventListener("click", async ()=>{
    if(!confirm("Remove this wish?")) return;
    try{ const res=await api({action:"wdelete", row:Number(b.dataset.row)}); WITEMS=res.items||[]; renderWishlist(); toast("Wish removed"); }
    catch(err){ toast("Could not remove: "+err.message); }
  }));
  document.querySelectorAll(".wmove").forEach(b=>b.addEventListener("click", async ()=>{
    const e=(WITEMS||[]).find(x=>x.row===Number(b.dataset.row));
    if(!confirm(`Move ${e?e.producer:"this wine"} into the cellar (1 bottle)?`)) return;
    b.disabled=true; b.textContent="Adding…";
    try{
      const res=await api({action:"wtocellar", row:Number(b.dataset.row)});
      WITEMS=res.items||[]; if(res.wines) WINES=normalize(res.wines);
      renderWishlist(); renderOverview(); renderTable(); renderEnjoyed();
      toast("Added to the cellar 🍷");
    }catch(err){ toast("Could not move: "+err.message); b.disabled=false; b.textContent="＋ Add to cellar"; }
  }));
}

function prepWishModal(){
  $("wForm").reset(); $("wErr").hidden=true; $("wErr").textContent="";
  $("jProducers").innerHTML = [...new Set(WINES.map(w=>w.producer).filter(Boolean))].sort().map(x=>`<option>${esc(x)}</option>`).join("");
  $("wModal").classList.add("open");
}
function openWishModal(prefill){
  W_EDIT=null; prepWishModal(); $("wTitle").textContent="Add to wishlist"; $("wSave").textContent="Save";
  if(prefill){ $("wProducer").value=prefill.producer||""; $("wWine").value=prefill.wine||"";
    $("wVintage").value=prefill.vintage||""; $("wRegion").value=prefill.region||""; }
  setTimeout(()=>$("wProducer").focus(),40);
}
function openWishEdit(e){
  W_EDIT=e.row; prepWishModal(); $("wTitle").textContent="Edit wish"; $("wSave").textContent="Save changes";
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
  const btn=$("wSave"); btn.disabled=true; btn.textContent="Saving…";
  const v=id=>$(id).value.trim();
  const entry={ producer:v("wProducer"), wine:v("wWine"),
    vintage: /^\d{4}$/.test(v("wVintage"))?Number(v("wVintage")):v("wVintage"),
    region:v("wRegion"), price: v("wPrice")===""? "":Number(v("wPrice")), note:v("wNote") };
  try{
    const res= editing ? await api({action:"wedit", row:W_EDIT, entry}) : await api({action:"wadd", entry});
    WITEMS=res.items||[]; $("wModal").classList.remove("open"); renderWishlist();
    if(location.hash!=="#wishlist") location.hash="#wishlist";
    toast(editing?"Wish updated":"Added to wishlist");
  }catch(err){ $("wErr").textContent="Could not save: "+err.message; $("wErr").hidden=false; }
  btn.disabled=false; btn.textContent= editing?"Save changes":"Save";
});

/* ---------- page routing ---------- */
function route(){
  const h = location.hash;
  const page = h==="#journal" ? "journal" : h==="#enjoyed" ? "enjoyed" : h==="#wishlist" ? "wishlist" : "cellar";
  $("pageCellar").hidden = page!=="cellar";
  $("pageEnjoyed").hidden = page!=="enjoyed";
  $("pageWishlist").hidden = page!=="wishlist";
  $("pageJournal").hidden = page!=="journal";
  document.querySelectorAll(".tab").forEach(t=>
    t.classList.toggle("active", t.dataset.page===page));
  if(page==="journal" && cfg.token) loadJournal();
  if(page==="wishlist" && cfg.token) loadWishlist();
  if(page==="enjoyed") renderEnjoyed();
}
document.querySelectorAll(".tab").forEach(t=>
  t.addEventListener("click", ()=>{ location.hash = t.dataset.page==="cellar" ? "" : t.dataset.page; }));
window.addEventListener("hashchange", route);

/* ---------- boot ---------- */
if(cfg.api && cfg.user && cfg.token){ $("app").hidden=false; loadData(); route(); }
else { setGateMode("login"); showGate(); }
