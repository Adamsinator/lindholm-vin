/* Lindholm Vin — cellar app. Data comes from the Apps Script API; nothing is stored here. */
"use strict";

const TIER_LABEL = {legend:"Icon", top:"Top tier", solid:"Well regarded"};
const STYLES = ["Rød","Hvid","Bobler","Rosé"];
const STYLE_EN = {"Rød":"Red","Hvid":"White","Bobler":"Sparkling","Rosé":"Rosé"};
const STYLE_VAR = {"Rød":"--c-red","Hvid":"--c-white","Bobler":"--c-spark","Rosé":"--c-rose"};
const COUNTRY_FIX = {"Franrkig":"Frankrig","Fankrig":"Frankrig"};
const REGION_FIX = {"Cote-de-Rhone":"Rhône","Cotes du Rhone":"Rhône","Laungedoc":"Languedoc","Bearn":"Béarn"};
const CLASS_FIX = {"1. Cru":"1. cru","1. cr":"1. cru"};

const fmt = n => new Intl.NumberFormat("da-DK",{maximumFractionDigits:0}).format(n);
const kr = n => fmt(n)+" kr.";
const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const $ = id => document.getElementById(id);

let WINES = [];          // normalized
let CT_LAST = null;      // {configured, last:{at,matched,valued,total}} from the API
let SHOW_PRICES = localStorage.getItem("vinHidePrices") !== "1"; // prices shown by default
const state = {q:"", region:"", style:"", status:"cellar", sortK:"price", sortDir:-1};

/* ---------- config / auth ---------- */
const cfg = {
  api: localStorage.getItem("vinApi") || (window.WINE_CONFIG && window.WINE_CONFIG.API_URL) || "",
  code: localStorage.getItem("vinCode") || "",
};

async function api(params){
  const body = JSON.stringify({code:cfg.code, ...params});
  const res = await fetch(cfg.api, {method:"POST", body, redirect:"follow"});
  if(!res.ok) throw new Error("HTTP "+res.status);
  const data = await res.json();
  if(!data.ok){ const e = new Error(data.error || "unknown-error"); e.data = data; throw e; }
  return data;
}

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
      ctid: String(r.ctid||"").trim(),
      ctValue: (r.value===null||r.value===""||r.value===undefined) ? null : Number(r.value),
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
    const valued = cellar.filter(w=>w.ctValue!=null);
    if(valued.length){
      const market = valued.reduce((s,w)=>s+w.ctValue*w.left,0);
      const paid = valued.reduce((s,w)=>s+(w.price||0)*w.left,0);
      const nBtl = valued.reduce((s,w)=>s+w.left,0);
      kpis.push(["Market value (CT)", kr(market),
        valued.length+" of "+cellar.length+" wines · "+fmt(nBtl)+" btl.", ""]);
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

/* ---------- table ---------- */
function searchLinks(w){
  const q = [w.producer, w.name!==w.commune?w.name:"", w.commune, typeof w.vintage==="number"?w.vintage:""]
    .filter(Boolean).join(" ");
  const enc = encodeURIComponent(q);
  return `<a target="_blank" rel="noopener" href="https://www.vivino.com/search/wines?q=${enc}">Ratings on Vivino ↗</a>
    <a target="_blank" rel="noopener" href="https://www.wine-searcher.com/find/${enc.replace(/%20/g,"+")}">Scores &amp; prices on Wine-Searcher ↗</a>`;
}

function detailHTML(w){
  const pn = PRODUCER_NOTES[w.producer];
  const cells = [
    ["Commune", w.commune],["Classification", w.classification],["Grape", w.grape],
    ["Bought", w.qty+" btl."],["Enjoyed", w.drunk?w.drunk+" btl.":""],["Source", w.source],
    ["Price", SHOW_PRICES && w.price ? kr(w.price) : ""],
    ["CellarTracker value", SHOW_PRICES && w.ctValue!=null ? kr(w.ctValue)+" / btl." : ""],
  ].filter(c=>c[1]).map(([k,v])=>`<div><div class="k">${k}</div>${esc(v)}</div>`).join("");
  return `<div class="dgrid">${cells}</div>
    ${w.note?`<div class="unote">“${esc(w.note)}” — cellar note</div>`:""}
    ${pn?`<div class="pnote"><b>${esc(w.producer)}</b> · ${TIER_LABEL[pn[0]]} — ${pn[1]}</div>`:""}
    <div class="links">
      ${w.left>0?`<button class="drink" data-act="drink" data-row="${w.row}">🍷 Mark 1 bottle as drunk</button>`:""}
      ${w.drunk>0?`<button class="drink" data-act="undrink" data-row="${w.row}">↩︎ Undo drink</button>`:""}
      <label class="ratewrap">My score
        <select class="rate" data-row="${w.row}">
          <option value="">—</option>
          ${Array.from({length:10},(_,i)=>`<option value="${i+1}"${w.rating===i+1?" selected":""}>${i+1}</option>`).join("")}
        </select></label>
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
  $("clear").classList.toggle("show", !!(q||state.region||state.style||state.status!=="cellar"));

  document.querySelectorAll(".rbar").forEach(el=>el.classList.toggle("active", el.dataset.region===state.region && !!state.region));
  document.querySelectorAll("#slegend button").forEach(el=>el.classList.toggle("active", el.dataset.style===state.style && !!state.style));
  document.querySelectorAll("#stylePie .pslice").forEach(el=>el.classList.toggle("on", el.dataset.style===state.style && !!state.style));
  document.querySelectorAll("#producers .rbar").forEach(el=>el.classList.toggle("active", el.dataset.prod===state.q.trim() && !!state.q.trim()));
  syncMapActive();

  $("rows").innerHTML = list.map((w,i)=>{
    const pn = PRODUCER_NOTES[w.producer];
    const badge = pn?`<span class="badge ${pn[0]}">${TIER_LABEL[pn[0]]}</span>`:"";
    const nm = [w.name, w.commune && w.commune!==w.name ? w.commune : ""].filter(Boolean).join(" · ");
    return `<tr class="main${w.left===0?" gone":""}" data-i="${i}" tabindex="0" aria-expanded="false">
      <td><span class="prod">${esc(w.producer)}</span>${badge}<br><span class="wname">${esc(nm)}${w.classification&&w.classification!=="AOC"?" · <b>"+esc(w.classification)+"</b>":""}${w.rating?` · <span class="myscore">${w.rating}/10</span>`:""}</span></td>
      <td class="num">${esc(w.vintage||"—")}</td>
      <td>${esc(w.region)}</td>
      <td><span class="sdot" style="background:var(${STYLE_VAR[w.style]||"--muted"})"></span>${STYLE_EN[w.style]||esc(w.style)}</td>
      <td class="num">${state.status==="drunk"?w.drunk:w.left}</td>
      <td class="num">${SHOW_PRICES ? (w.price?kr(w.price):"—") : "···"}</td>
    </tr>
    <tr class="detail" hidden><td colspan="6">${detailHTML(w)}</td></tr>`;
  }).join("");

  document.querySelectorAll("tr.main").forEach(tr=>{
    const open = ()=>{ const d=tr.nextElementSibling; d.hidden=!d.hidden; tr.setAttribute("aria-expanded",String(!d.hidden)); };
    tr.addEventListener("click",e=>{ if(e.target.closest("a,button")) return; open(); });
    tr.addEventListener("keydown",e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); open(); } });
  });
  document.querySelectorAll("button.drink").forEach(b=>
    b.addEventListener("click",()=>rowAction(b.dataset.act, Number(b.dataset.row), b)));
  document.querySelectorAll("select.rate").forEach(sel=>
    sel.addEventListener("change",()=>rateWine(Number(sel.dataset.row), sel.value, sel)));
  document.querySelectorAll("button.jlog").forEach(b=>
    b.addEventListener("click",()=>{
      const w = WINES.find(x=>x.row===Number(b.dataset.row));
      openJournalModal(w ? {producer:w.producer, wine:w.name, vintage:w.vintage} : null);
    }));
}

/* ---------- actions ---------- */
async function loadData(){
  $("spin").hidden = false; $("content").hidden = true;
  try{
    const res = await api({action:"data"});
    WINES = normalize(res.wines);
    CT_LAST = res.ctLast || null;
    $("priceBtn").textContent = SHOW_PRICES ? "Hide prices" : "Show prices";
    updateCtButton();
    renderOverview(); renderTable();
    $("stamp").textContent = "Updated "+new Date().toLocaleString("da-DK",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
    $("spin").hidden = true; $("content").hidden = false;
  }catch(err){
    if(err.message==="bad-code"){ forgetAuth(); showGate("Wrong access code — try again."); }
    else { $("spin").textContent = "Could not reach the cellar API ("+err.message+"). Check your connection and refresh."; }
  }
}

async function rateWine(row, val, sel){
  sel.disabled = true;
  try{
    const res = await api({action:"rate", row, rating: val===""?"":Number(val)});
    WINES = normalize(res.wines);
    renderOverview(); renderTable();
    toast(val==="" ? "Score cleared" : "Scored "+val+"/10 🍷");
  }catch(err){ toast("Could not save score: "+err.message); }
  sel.disabled = false;
}

async function rowAction(act, row, btn){
  const w = WINES.find(x=>x.row===row);
  if(act==="delete"){
    const name = w ? `${w.producer} ${w.name} ${w.vintage||""}`.trim() : "this wine";
    if(!confirm(`Delete ${name} from the cellar?\nThis removes the whole row from the sheet.`)) return;
  }
  btn.disabled = true; btn.textContent = "Updating…";
  try{
    const res = await api({action:act, row, qty:1});
    WINES = normalize(res.wines);
    renderOverview(); renderTable();
    toast(act==="drink" ? "Skål! Bottle marked as drunk 🍷"
        : act==="undrink" ? "Bottle back in the cellar 🍾"
        : "Wine deleted from the sheet");
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
    source:v("aSource"), note:v("aNote"),
  };
  try{
    const res = await api({action:"add", wine});
    WINES = normalize(res.wines);
    renderOverview(); renderTable();
    $("addModal").classList.remove("open");
    $("addForm").reset(); $("aQty").value = 1; $("aCountry").value = "Frankrig";
    toast(wine.producer+" added to the cellar");
  }catch(err){ toast("Could not add: "+err.message); }
  btn.disabled = false; btn.textContent = "Add to cellar";
}

/* ---------- gate ---------- */
function showGate(msg){
  $("app").hidden = true; $("gate").hidden = false;
  $("gateApiWrap").hidden = !!cfg.api;
  $("gateErr").textContent = msg||"";
  setTimeout(()=>$("gateCode").focus(), 50);
}
function forgetAuth(){
  localStorage.removeItem("vinCode");
  cfg.code="";
}
$("gateForm").addEventListener("submit",e=>{
  e.preventDefault();
  const apiIn = $("gateApi").value.trim();
  if(!cfg.api && apiIn){ cfg.api = apiIn; localStorage.setItem("vinApi", apiIn); }
  if(!cfg.api){ $("gateErr").textContent = "The API URL is missing."; return; }
  cfg.code = $("gateCode").value.trim();
  if(!cfg.code){ $("gateErr").textContent = "Enter the access code."; return; }
  localStorage.setItem("vinCode", cfg.code);
  $("gate").hidden = true; $("app").hidden = false;
  loadData(); route();
});

/* ---------- header actions ---------- */
$("refreshBtn").addEventListener("click", loadData);
$("lockBtn").addEventListener("click", ()=>{ forgetAuth(); showGate("Locked. Enter the access code to reopen."); });
$("priceBtn").addEventListener("click", ()=>{
  SHOW_PRICES = !SHOW_PRICES;
  localStorage.setItem("vinHidePrices", SHOW_PRICES ? "0" : "1");
  $("priceBtn").textContent = SHOW_PRICES ? "Hide prices" : "Show prices";
  renderOverview(); renderTable();
});
function ctStampText(){
  const last = CT_LAST && CT_LAST.last;
  if(!last || !last.at) return "Sync values from CellarTracker";
  const d = new Date(last.at);
  const when = isNaN(d) ? "" : d.toLocaleDateString("da-DK",{day:"numeric",month:"short"});
  return `Last CellarTracker sync ${when} · ${last.valued}/${last.total} wines valued`;
}
function updateCtButton(){
  const btn = $("ctSyncBtn"); if(!btn) return;
  btn.hidden = !(CT_LAST && CT_LAST.configured);
  btn.title = ctStampText();
}
async function syncCt(){
  const btn = $("ctSyncBtn");
  btn.disabled = true; const label = btn.textContent; btn.textContent = "Syncing…";
  try{
    const res = await api({action:"ctsync"});
    WINES = normalize(res.wines);
    if(res.ct) CT_LAST = {configured:true, last:res.ct};
    updateCtButton(); renderOverview(); renderTable();
    const c = res.ct || {};
    toast(`CellarTracker: ${c.valued||0} of ${c.total||0} wines valued 🍷`);
  }catch(err){
    toast(err.message==="CellarTracker not configured"
      ? "Set your CellarTracker login in Code.gs first"
      : "CellarTracker sync failed: "+err.message);
  }
  btn.disabled = false; btn.textContent = label;
}
$("ctSyncBtn").addEventListener("click", syncCt);
$("addBtn").addEventListener("click", ()=>{ $("addModal").classList.add("open"); $("aProducer").focus(); });
$("addCancel").addEventListener("click", ()=>$("addModal").classList.remove("open"));
$("addModal").addEventListener("click", e=>{ if(e.target===$("addModal")) $("addModal").classList.remove("open"); });
$("addForm").addEventListener("submit", addWine);

/* ---------- filters / sorting (bound once) ---------- */
$("q").addEventListener("input",e=>{ state.q=e.target.value; renderTable(); });
$("fRegion").addEventListener("change",e=>{ state.region=e.target.value; renderTable(); });
$("fStyle").addEventListener("change",e=>{ state.style=e.target.value; renderTable(); });
$("fStatus").addEventListener("change",e=>{ state.status=e.target.value; renderTable(); });
$("clear").addEventListener("click",()=>{
  state.q=state.region=state.style=""; state.status="cellar";
  $("q").value=""; $("fRegion").value=""; $("fStyle").value=""; $("fStatus").value="cellar"; renderTable(); });
document.querySelectorAll("th[data-k]").forEach(th=>th.addEventListener("click",()=>{
  const k=th.dataset.k;
  if(state.sortK===k) state.sortDir*=-1; else { state.sortK=k; state.sortDir = (k==="price"||k==="left") ? -1 : 1; }
  renderTable();
}));

/* ---------- stylized SVG map (no external tiles/CDN) ---------- */
const REGION_GEO = {  // [lat, lng]
  "Bourgogne":[47.03,4.84], "Champagne":[49.04,4.00], "Chablis":[47.82,3.80],
  "Beaujolais":[46.15,4.72], "Rhône":[44.93,4.89], "Bordeaux":[44.84,-0.58],
  "Loire":[47.33,0.68], "Languedoc":[43.51,3.32], "Roussillon":[42.65,2.88],
  "Béarn":[43.30,-0.37], "Mosel":[49.91,6.99], "Piemonte":[44.61,7.99],
  "Veneto":[45.44,11.00], "Rioja":[42.46,-2.45], "Ribera del Duero":[41.62,-3.69],
};
// Simplified country outlines as [lng, lat] — a stylized reference frame, not survey-accurate.
const LANDS = {
  France:[[2.5,51.0],[4.0,50.3],[5.9,49.5],[7.6,49.0],[8.2,48.6],[7.6,47.6],[7.0,47.4],[6.8,46.4],[6.1,46.1],[7.0,45.5],[6.9,44.4],[7.7,43.9],[7.4,43.7],[6.0,43.1],[5.0,43.3],[4.0,43.5],[3.0,43.2],[3.0,42.5],[1.0,42.6],[-0.5,42.8],[-1.4,43.3],[-1.2,44.6],[-1.1,45.6],[-1.8,46.5],[-2.2,47.2],[-4.7,47.8],[-4.8,48.4],[-3.5,48.8],[-1.6,48.6],[-1.4,49.7],[0.2,49.5],[1.6,50.1]],
  Switzerland:[[6.1,46.1],[7.0,45.9],[8.4,46.4],[9.5,46.4],[10.5,46.9],[9.6,47.6],[8.4,47.7],[7.0,47.4],[6.8,46.4]],
  Germany:[[5.9,49.5],[6.1,50.8],[7.2,51.3],[8.7,50.6],[9.5,49.8],[10.0,50.6],[11.5,50.4],[12.5,50.2],[13.0,49.3],[13.4,48.9],[12.8,48.2],[11.0,47.9],[9.6,47.6],[8.4,47.7],[7.6,47.6],[8.2,48.6],[7.6,49.0],[6.4,49.2]],
  Italy:[[7.0,45.5],[7.9,45.0],[9.0,45.8],[10.6,46.5],[12.4,46.8],[13.6,45.8],[13.1,45.6],[12.3,45.4],[12.5,44.6],[11.2,44.2],[9.9,44.1],[8.8,44.4],[7.6,44.1],[7.0,44.7]],
  Spain:[[-1.4,43.4],[-3.8,43.5],[-4.9,43.4],[-4.6,42.6],[-4.2,41.8],[-4.0,41.4],[-2.5,41.5],[-0.5,41.5],[0.9,41.0],[2.2,41.3],[3.3,42.3],[1.5,42.6],[-0.5,42.8]],
};
const normName = t => String(t).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[-'’]/g," ").replace(/\s+/g," ").trim();

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
  "reims":[49.258,4.032], "verzenay":[49.159,4.145], "bouzy":[49.139,4.155],
  "montagne de reims":[49.150,4.020], "montigny":[49.079,3.766], "hautvillers":[49.086,3.945],
  "ay":[49.054,4.003], "epernay":[49.043,3.959], "chouilly":[49.023,4.017],
  "moussy":[49.017,3.917], "chavot courcourt":[49.008,3.928], "cramant":[48.995,4.005],
  "avize":[48.973,4.011], "vincelles":[49.070,3.630], "azy sur marne":[49.026,3.335],
};
const CITY_ANCHORS = [["REIMS",49.258,4.032],["ÉPERNAY",49.043,3.959]];
const CHAMP_AREAS = [["MONTAGNE DE REIMS",49.185,4.010],["VALLÉE DE LA MARNE",49.078,3.660],["CÔTE DES BLANCS",48.952,4.055]];

let MAP_VIEW = "europe", LAST_CELLAR = [];
const COS = Math.cos(46*Math.PI/180);
function buildProjector(W, pad){
  let minx=Infinity,maxx=-Infinity,miny=Infinity,maxy=-Infinity;
  for(const poly of Object.values(LANDS)) for(const [lng,lat] of poly){
    const x=lng*COS; if(x<minx)minx=x; if(x>maxx)maxx=x;
    if(lat<miny)miny=lat; if(lat>maxy)maxy=lat;
  }
  const s=(W-2*pad)/(maxx-minx);
  const H=(maxy-miny)*s+2*pad;
  return { W, H, proj:([lng,lat])=>[pad+(lng*COS-minx)*s, pad+(maxy-lat)*s], r:(b)=>4+Math.sqrt(b)*1.7 };
}

function updateMap(cellar){ LAST_CELLAR = cellar; renderMap(); }

function renderMap(){
  const svg=$("map"); if(!svg) return;
  $("mapbar").hidden = MAP_VIEW==="europe";
  if(MAP_VIEW==="Bourgogne") return renderCoteMap(svg);
  if(MAP_VIEW==="Champagne") return renderChampagneMap(svg);
  renderEuropeMap(svg);
}

function bindDot(c, tipHtml, onClick){
  c.addEventListener("mousemove",e=>showTip(tipHtml,e.clientX,e.clientY));
  c.addEventListener("mouseleave",hideTip);
  c.addEventListener("click",onClick);
}

function renderEuropeMap(svg){
  const {W,H,proj,r}=buildProjector(600,24);
  const agg={};
  LAST_CELLAR.forEach(w=>{ const a=agg[w.region] ??= {b:0,n:0}; a.b+=w.left; a.n++; });
  const entries = Object.entries(agg).filter(([n])=>REGION_GEO[n]).sort((a,b)=>b[1].b-a[1].b);
  const pt = name => proj([REGION_GEO[name][1], REGION_GEO[name][0]]);
  let html = Object.values(LANDS).map(poly=>{
    const d = poly.map((p,i)=>(i?"L":"M")+proj(p).map(n=>n.toFixed(1)).join(" ")).join("")+"Z";
    return `<path class="land" d="${d}"/>`;
  }).join("");
  html += entries.map(([name,a])=>{
    const [x,y]=pt(name);
    return `<circle class="dot" data-region="${esc(name)}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r(a.b).toFixed(1)}"/>`;
  }).join("");
  html += entries.slice(0,4).map(([name,a])=>{
    const [x,y]=pt(name); const rad=r(a.b), left=x>W*0.6;
    const lx=(left?x-rad-4:x+rad+4).toFixed(1), anc=left?"end":"start";
    return `<text class="dlabel" text-anchor="${anc}" x="${lx}" y="${(y-1).toFixed(1)}">${esc(name)}</text>
      <text class="dsub" text-anchor="${anc}" x="${lx}" y="${(y+10).toFixed(1)}">${a.b} btl.</text>`;
  }).join("");
  svg.setAttribute("viewBox",`0 0 ${W} ${Math.round(H)}`);
  svg.innerHTML = html;
  svg.querySelectorAll(".dot").forEach(c=>{
    const name=c.dataset.region, a=agg[name];
    const zoomable = name==="Bourgogne"||name==="Champagne";
    bindDot(c,
      `<b>${esc(name)}</b><br>${a.b} bottle${a.b>1?"s":""} · ${a.n} wine${a.n>1?"s":""}${zoomable?"<br><i>click to explore</i>":""}`,
      ()=>{
        if(zoomable){
          MAP_VIEW=name; state.region=name; $("fRegion").value=name;
          state.q=""; $("q").value="";
          renderTable(); renderMap(); return;
        }
        state.region = state.region===name ? "" : name;
        $("fRegion").value = state.region; renderTable();
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
  // local projector over champagne coords
  const pts=Object.keys(agg).map(k=>CHAMP_GEO[k]);
  CITY_ANCHORS.forEach(([,la,ln])=>pts.push([la,ln]));
  CHAMP_AREAS.forEach(([,la,ln])=>pts.push([la,ln]));
  const cos=Math.cos(49*Math.PI/180), pad=40, W=640;
  let minx=Infinity,maxx=-Infinity,miny=Infinity,maxy=-Infinity;
  pts.forEach(([la,ln])=>{ const x=ln*cos; if(x<minx)minx=x; if(x>maxx)maxx=x; if(la<miny)miny=la; if(la>maxy)maxy=la; });
  const sc=(W-2*pad)/Math.max(0.0001,(maxx-minx));
  const H=Math.max(220,(maxy-miny)*sc+2*pad);
  const proj=([la,ln])=>[pad+(ln*cos-minx)*sc, (H-pad)-(la-miny)*sc];
  let parts=[];
  CITY_ANCHORS.forEach(([name,la,ln])=>{
    const [x,y]=proj([la,ln]);
    const left = name==="ÉPERNAY"; // its label collides with the Aÿ/Chouilly cluster on the right
    parts.push(`<text class="city" text-anchor="${left?"end":"start"}" x="${(left?x-10:x+10).toFixed(1)}" y="${(y-8).toFixed(1)}">${name}</text>
      <path class="route" d="M ${(x-5).toFixed(1)} ${y.toFixed(1)} L ${(x+5).toFixed(1)} ${y.toFixed(1)} M ${x.toFixed(1)} ${(y-5).toFixed(1)} L ${x.toFixed(1)} ${(y+5).toFixed(1)}"/>`);
  });
  CHAMP_AREAS.forEach(([name,la,ln])=>{
    const [x,y]=proj([la,ln]);
    parts.push(`<text class="sec" text-anchor="middle" x="${x.toFixed(1)}" y="${y.toFixed(1)}">${name}</text>`);
  });
  const entries=Object.entries(agg).sort((a,b)=>b[1].b-a[1].b);
  entries.forEach(([key,a])=>{
    const [x,y]=proj(CHAMP_GEO[key]);
    parts.push(`<circle class="dot" data-q="${esc(a.q)}" data-label="${esc(a.label)}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(4+Math.sqrt(a.b)*2.2).toFixed(1)}"/>`);
    if(a.b>=2){
      const left=x>W*0.62;
      parts.push(`<text class="dlabel" text-anchor="${left?"end":"start"}" x="${(left?x-12:x+12).toFixed(1)}" y="${(y+4).toFixed(1)}">${esc(a.label)} · ${a.b}</text>`);
    }
  });
  if(other) parts.push(`<text class="dsub" x="${pad}" y="${(H-12).toFixed(1)}">+ ${other.b} btl. elsewhere (${esc(other.q)}…)</text>`);
  svg.setAttribute("viewBox",`0 0 ${W} ${Math.round(H)}`);
  svg.innerHTML=parts.join("");
  bindDetailDots(svg, null);
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

$("mapBack").addEventListener("click", ()=>{ MAP_VIEW="europe"; renderMap(); });

function syncMapActive(){
  if(MAP_VIEW!=="europe") return;
  document.querySelectorAll("#map .dot").forEach(c=>
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
}
$("tonightBtn").addEventListener("click", pickTonight);

/* ---------- journal ---------- */
let JENTRIES = null;

async function loadJournal(force){
  if(JENTRIES && !force){ renderJournal(); return; }
  $("jSpin").hidden = false; $("jList").innerHTML = "";
  try{
    const res = await api({action:"journal"});
    JENTRIES = res.entries || [];
    renderJournal();
  }catch(err){
    if(String(err.message).includes("bad-code")){ forgetAuth(); showGate("Wrong access code — try again."); }
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
    return `<div class="jentry">
      <div class="jtop"><span class="jdate">${ds}</span>
        ${e.place?`<span class="jplace">📍 ${esc(e.place)}</span>`:""}
        <button class="jdel" data-row="${e.row}" title="Delete entry">🗑</button></div>
      <div class="jwine">${esc(e.producer)}${e.wine?" · "+esc(e.wine):""}${e.vintage?" · "+esc(e.vintage):""}
        ${glasses?`<span class="jglasses">${glasses}</span>`:""}</div>
      ${e.note?`<div class="jnote">${esc(e.note)}</div>`:""}
    </div>`;
  }).join("") : `<div class="spin">No entries yet — press “＋ New entry” after your next good bottle.</div>`;
  document.querySelectorAll(".jdel").forEach(b=>b.addEventListener("click", async ()=>{
    if(!confirm("Delete this journal entry?")) return;
    try{
      const res = await api({action:"jdelete", row:Number(b.dataset.row)});
      JENTRIES = res.entries || []; renderJournal(); toast("Entry deleted");
    }catch(err){ toast("Could not delete: "+err.message); }
  }));
}

function openJournalModal(prefill){
  $("jForm").reset();
  $("jDate").value = new Date().toISOString().slice(0,10);
  if(prefill){
    $("jProducer").value = prefill.producer || "";
    $("jWine").value = prefill.wine || "";
    $("jVintage").value = prefill.vintage || "";
  }
  $("jProducers").innerHTML = [...new Set(WINES.map(w=>w.producer).filter(Boolean))].sort().map(x=>`<option>${esc(x)}</option>`).join("");
  $("jPlaces").innerHTML = [...new Set((JENTRIES||[]).map(e=>e.place).filter(Boolean))].sort().map(x=>`<option>${esc(x)}</option>`).join("");
  $("jModal").classList.add("open");
  setTimeout(()=>$(prefill?"jPlace":"jProducer").focus(), 40);
}

$("jAddBtn").addEventListener("click", ()=>openJournalModal(null));
$("jCancel").addEventListener("click", ()=>$("jModal").classList.remove("open"));
$("jModal").addEventListener("click", e=>{ if(e.target===$("jModal")) $("jModal").classList.remove("open"); });
$("jForm").addEventListener("submit", async e=>{
  e.preventDefault();
  const btn = $("jSave"); btn.disabled = true; btn.textContent = "Saving…";
  const v = id => $(id).value.trim();
  const entry = {
    date: v("jDate"), producer: v("jProducer"), wine: v("jWine"),
    vintage: /^\d{4}$/.test(v("jVintage")) ? Number(v("jVintage")) : v("jVintage"),
    place: v("jPlace"), rating: v("jRating") ? Number(v("jRating")) : "", note: v("jNote"),
  };
  try{
    const res = await api({action:"jadd", entry});
    JENTRIES = res.entries || [];
    $("jModal").classList.remove("open");
    renderJournal();
    if(location.hash!=="#journal") location.hash = "#journal";
    toast("Journal entry saved 📓");
  }catch(err){ toast("Could not save: "+err.message); }
  btn.disabled = false; btn.textContent = "Save entry";
});

/* ---------- page routing ---------- */
function route(){
  const j = location.hash === "#journal";
  $("pageCellar").hidden = j;
  $("pageJournal").hidden = !j;
  document.querySelectorAll(".tab").forEach(t=>
    t.classList.toggle("active", (t.dataset.page==="journal") === j));
  if(j && cfg.code) loadJournal();
}
document.querySelectorAll(".tab").forEach(t=>
  t.addEventListener("click", ()=>{ location.hash = t.dataset.page==="journal" ? "#journal" : ""; }));
window.addEventListener("hashchange", route);

/* ---------- boot ---------- */
if(cfg.api && cfg.code){ $("app").hidden=false; loadData(); route(); }
else showGate();
