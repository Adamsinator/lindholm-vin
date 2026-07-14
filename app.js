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
let HAS_PRICES = false;
const state = {q:"", region:"", style:"", status:"cellar", sortK:"price", sortDir:-1};

/* ---------- config / auth ---------- */
const cfg = {
  api: (window.WINE_CONFIG && window.WINE_CONFIG.API_URL) || localStorage.getItem("vinApi") || "",
  code: localStorage.getItem("vinCode") || "",
  pricecode: sessionStorage.getItem("vinPriceCode") || "",
};

async function api(params){
  const body = JSON.stringify({code:cfg.code, pricecode:cfg.pricecode, ...params});
  const res = await fetch(cfg.api, {method:"POST", body, redirect:"follow"});
  if(!res.ok) throw new Error("HTTP "+res.status);
  const data = await res.json();
  if(!data.ok) throw new Error(data.error || "unknown-error");
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
  if(HAS_PRICES){
    const valueLeft = cellar.reduce((s,w)=>s+(w.price||0)*w.left,0);
    kpis.push(["Cellar value", kr(valueLeft), "at purchase price", ""]);
    kpis.push(["Avg. bottle", kr(bottlesLeft?valueLeft/bottlesLeft:0), "cellar average", ""]);
  }else{
    kpis.push(["Cellar value", "🔒 hidden", "unlock with price code", "locked"]);
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
      showTip(`<b>${esc(label)}</b><br>${r.b} bottles${HAS_PRICES?" · "+kr(r.v):""}`,e.clientX,e.clientY);
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
    ["Price", HAS_PRICES && w.price ? kr(w.price) : ""],
  ].filter(c=>c[1]).map(([k,v])=>`<div><div class="k">${k}</div>${esc(v)}</div>`).join("");
  return `<div class="dgrid">${cells}</div>
    ${w.note?`<div class="unote">“${esc(w.note)}” — cellar note</div>`:""}
    ${pn?`<div class="pnote"><b>${esc(w.producer)}</b> · ${TIER_LABEL[pn[0]]} — ${pn[1]}</div>`:""}
    <div class="links">
      ${w.left>0?`<button class="drink" data-row="${w.row}">🍷 Mark 1 bottle as drunk</button>`:""}
      ${searchLinks(w)}
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
  if(HAS_PRICES){
    const vl = list.reduce((s,w)=>s+(w.price||0)*(state.status==="drunk"?w.drunk:w.left),0);
    countTxt += ` · ${kr(vl)}`;
  }
  $("count").textContent = countTxt;
  $("clear").classList.toggle("show", !!(q||state.region||state.style||state.status!=="cellar"));

  document.querySelectorAll(".rbar").forEach(el=>el.classList.toggle("active", el.dataset.region===state.region && !!state.region));
  document.querySelectorAll("#slegend button").forEach(el=>el.classList.toggle("active", el.dataset.style===state.style && !!state.style));

  $("rows").innerHTML = list.map((w,i)=>{
    const pn = PRODUCER_NOTES[w.producer];
    const badge = pn?`<span class="badge ${pn[0]}">${TIER_LABEL[pn[0]]}</span>`:"";
    const nm = [w.name, w.commune && w.commune!==w.name ? w.commune : ""].filter(Boolean).join(" · ");
    return `<tr class="main${w.left===0?" gone":""}" data-i="${i}" tabindex="0" aria-expanded="false">
      <td><span class="prod">${esc(w.producer)}</span>${badge}<br><span class="wname">${esc(nm)}${w.classification&&w.classification!=="AOC"?" · <b>"+esc(w.classification)+"</b>":""}</span></td>
      <td class="num">${w.vintage||"—"}</td>
      <td>${esc(w.region)}</td>
      <td><span class="sdot" style="background:var(${STYLE_VAR[w.style]||"--muted"})"></span>${STYLE_EN[w.style]||esc(w.style)}</td>
      <td class="num">${state.status==="drunk"?w.drunk:w.left}</td>
      <td class="num">${HAS_PRICES ? (w.price?kr(w.price):"—") : "···"}</td>
    </tr>
    <tr class="detail" hidden><td colspan="6">${detailHTML(w)}</td></tr>`;
  }).join("");

  document.querySelectorAll("tr.main").forEach(tr=>{
    const open = ()=>{ const d=tr.nextElementSibling; d.hidden=!d.hidden; tr.setAttribute("aria-expanded",String(!d.hidden)); };
    tr.addEventListener("click",e=>{ if(e.target.closest("a,button")) return; open(); });
    tr.addEventListener("keydown",e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); open(); } });
  });
  document.querySelectorAll("button.drink").forEach(b=>
    b.addEventListener("click",()=>drinkOne(Number(b.dataset.row), b)));
}

/* ---------- actions ---------- */
async function loadData(){
  $("spin").hidden = false; $("content").hidden = true;
  try{
    const res = await api({action:"data"});
    WINES = normalize(res.wines);
    HAS_PRICES = !!res.prices;
    $("priceBtn").textContent = HAS_PRICES ? "Hide prices" : "Show prices";
    renderOverview(); renderTable();
    $("stamp").textContent = "Updated "+new Date().toLocaleTimeString("da-DK",{hour:"2-digit",minute:"2-digit"});
    $("spin").hidden = true; $("content").hidden = false;
  }catch(err){
    if(String(err.message).includes("bad-code")){ forgetAuth(); showGate("Wrong access code — try again."); }
    else { $("spin").textContent = "Could not reach the cellar API ("+err.message+"). Check your connection and refresh."; }
  }
}

async function drinkOne(row, btn){
  btn.disabled = true; btn.textContent = "Updating…";
  try{
    const res = await api({action:"drink", row, qty:1});
    WINES = normalize(res.wines); HAS_PRICES = !!res.prices;
    renderOverview(); renderTable();
    toast("Skål! Bottle marked as drunk 🍷");
  }catch(err){ toast("Could not update: "+err.message); btn.disabled=false; btn.textContent="🍷 Mark 1 bottle as drunk"; }
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
    WINES = normalize(res.wines); HAS_PRICES = !!res.prices;
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
  localStorage.removeItem("vinCode"); sessionStorage.removeItem("vinPriceCode");
  cfg.code=""; cfg.pricecode="";
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
function askPriceCode(){
  const m = document.createElement("div");
  m.className = "modal open";
  m.innerHTML = `<form class="card" style="max-width:340px">
    <h2>Unlock prices</h2>
    <label for="pCode">Price code</label>
    <input id="pCode" type="password" style="width:100%" autocomplete="off">
    <div class="mact"><button type="button" class="btn" data-x="cancel">Cancel</button>
    <button type="submit" class="btn primary">Unlock</button></div></form>`;
  document.body.appendChild(m);
  const input = m.querySelector("#pCode");
  setTimeout(()=>input.focus(), 30);
  const close = ()=>m.remove();
  m.querySelector('[data-x="cancel"]').addEventListener("click", close);
  m.addEventListener("click", e=>{ if(e.target===m) close(); });
  m.querySelector("form").addEventListener("submit", e=>{
    e.preventDefault();
    cfg.pricecode = input.value.trim(); sessionStorage.setItem("vinPriceCode", cfg.pricecode);
    api({action:"data"}).then(res=>{
      if(!res.prices){ toast("Wrong price code"); cfg.pricecode=""; sessionStorage.removeItem("vinPriceCode"); return; }
      close();
      WINES = normalize(res.wines); HAS_PRICES = true;
      $("priceBtn").textContent = "Hide prices";
      renderOverview(); renderTable();
    }).catch(err=>toast("Error: "+err.message));
  });
}
$("priceBtn").addEventListener("click", ()=>{
  if(HAS_PRICES){ cfg.pricecode=""; sessionStorage.removeItem("vinPriceCode"); loadData(); return; }
  askPriceCode();
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

/* ---------- boot ---------- */
if(cfg.api && cfg.code){ $("app").hidden=false; loadData(); }
else showGate();
