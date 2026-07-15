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
  $("stack").innerHTML = styList.map(s=>
    `<div style="flex:${styAgg[s]};background:var(${STYLE_VAR[s]})" title="${STYLE_EN[s]}"></div>`).join("");
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
  ].filter(c=>c[1]).map(([k,v])=>`<div><div class="k">${k}</div>${esc(v)}</div>`).join("");
  return `<div class="dgrid">${cells}</div>
    ${w.note?`<div class="unote">“${esc(w.note)}” — cellar note</div>`:""}
    ${pn?`<div class="pnote"><b>${esc(w.producer)}</b> · ${TIER_LABEL[pn[0]]} — ${pn[1]}</div>`:""}
    <div class="links">
      ${w.left>0?`<button class="drink" data-act="drink" data-row="${w.row}">🍷 Mark 1 bottle as drunk</button>`:""}
      ${w.drunk>0?`<button class="drink" data-act="undrink" data-row="${w.row}">↩︎ Undo drink</button>`:""}
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
  document.querySelectorAll("#producers .rbar").forEach(el=>el.classList.toggle("active", el.dataset.prod===state.q.trim() && !!state.q.trim()));
  syncMapActive();

  $("rows").innerHTML = list.map((w,i)=>{
    const pn = PRODUCER_NOTES[w.producer];
    const badge = pn?`<span class="badge ${pn[0]}">${TIER_LABEL[pn[0]]}</span>`:"";
    const nm = [w.name, w.commune && w.commune!==w.name ? w.commune : ""].filter(Boolean).join(" · ");
    return `<tr class="main${w.left===0?" gone":""}" data-i="${i}" tabindex="0" aria-expanded="false">
      <td><span class="prod">${esc(w.producer)}</span>${badge}<br><span class="wname">${esc(nm)}${w.classification&&w.classification!=="AOC"?" · <b>"+esc(w.classification)+"</b>":""}</span></td>
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
}

/* ---------- actions ---------- */
async function loadData(){
  $("spin").hidden = false; $("content").hidden = true;
  try{
    const res = await api({action:"data"});
    WINES = normalize(res.wines);
    $("priceBtn").textContent = SHOW_PRICES ? "Hide prices" : "Show prices";
    renderOverview(); renderTable();
    $("stamp").textContent = "Updated "+new Date().toLocaleString("da-DK",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
    $("spin").hidden = true; $("content").hidden = false;
  }catch(err){
    if(err.message==="bad-code"){ forgetAuth(); showGate("Wrong access code — try again."); }
    else { $("spin").textContent = "Could not reach the cellar API ("+err.message+"). Check your connection and refresh."; }
  }
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
  loadData();
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
// Simplified country outlines as [lng, lat], for a stylized reference frame — not survey-accurate.
const LANDS = {
  France:[[2.5,51.0],[4.0,50.3],[5.9,49.5],[7.6,49.0],[8.2,48.6],[7.6,47.6],[7.0,47.4],[6.8,46.4],[6.1,46.1],[7.0,45.5],[6.9,44.4],[7.7,43.9],[7.4,43.7],[6.0,43.1],[5.0,43.3],[4.0,43.5],[3.0,43.2],[3.0,42.5],[1.0,42.6],[-0.5,42.8],[-1.4,43.3],[-1.2,44.6],[-1.1,45.6],[-1.8,46.5],[-2.2,47.2],[-4.7,47.8],[-4.8,48.4],[-3.5,48.8],[-1.6,48.6],[-1.4,49.7],[0.2,49.5],[1.6,50.1]],
  Switzerland:[[6.1,46.1],[7.0,45.9],[8.4,46.4],[9.5,46.4],[10.5,46.9],[9.6,47.6],[8.4,47.7],[7.0,47.4],[6.8,46.4]],
  Germany:[[5.9,49.5],[6.1,50.8],[7.2,51.3],[8.7,50.6],[9.5,49.8],[10.0,50.6],[11.5,50.4],[12.5,50.2],[13.0,49.3],[13.4,48.9],[12.8,48.2],[11.0,47.9],[9.6,47.6],[8.4,47.7],[7.6,47.6],[8.2,48.6],[7.6,49.0],[6.4,49.2]],
  Italy:[[7.0,45.5],[7.9,45.0],[9.0,45.8],[10.6,46.5],[12.4,46.8],[13.6,45.8],[13.1,45.6],[12.3,45.4],[12.5,44.6],[11.2,44.2],[9.9,44.1],[8.8,44.4],[7.6,44.1],[7.0,44.7]],
  Spain:[[-1.4,43.4],[-3.8,43.5],[-4.9,43.4],[-4.6,42.6],[-4.2,41.8],[-4.0,41.4],[-2.5,41.5],[-0.5,41.5],[0.9,41.0],[2.2,41.3],[3.3,42.3],[1.5,42.6],[-0.5,42.8]],
};
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
function updateMap(cellar){
  const svg=$("map"); if(!svg) return;
  const {W,H,proj,r}=buildProjector(600,24);
  const agg={};
  cellar.forEach(w=>{ const a=agg[w.region] ??= {b:0,n:0}; a.b+=w.left; a.n++; });
  const entries = Object.entries(agg).filter(([n])=>REGION_GEO[n]).sort((a,b)=>b[1].b-a[1].b);
  const pt = name => proj([REGION_GEO[name][1], REGION_GEO[name][0]]);

  let html = Object.values(LANDS).map(poly=>{
    const d = poly.map((p,i)=>(i?"L":"M")+proj(p).map(n=>n.toFixed(1)).join(" ")).join("")+"Z";
    return `<path class="land" d="${d}"/>`;
  }).join("");
  // dots, largest first so small ones stay hoverable on top
  html += entries.map(([name,a])=>{
    const [x,y]=pt(name);
    return `<circle class="dot" data-region="${esc(name)}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r(a.b).toFixed(1)}"/>`;
  }).join("");
  // labels for the biggest regions, flipped left near the right edge (rest on hover)
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
    c.addEventListener("mousemove",e=>showTip(`<b>${esc(name)}</b><br>${a.b} bottle${a.b>1?"s":""} · ${a.n} wine${a.n>1?"s":""}`,e.clientX,e.clientY));
    c.addEventListener("mouseleave",hideTip);
    c.addEventListener("click",()=>{ state.region = state.region===name ? "" : name;
      $("fRegion").value = state.region; renderTable(); });
  });
  syncMapActive();
}
function syncMapActive(){
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
}
$("tonightBtn").addEventListener("click", pickTonight);

/* ---------- boot ---------- */
if(cfg.api && cfg.code){ $("app").hidden=false; loadData(); }
else showGate();
