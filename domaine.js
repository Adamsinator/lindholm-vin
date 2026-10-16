// AllWine — one page per domaine (domaine.html?p=<key>), or the list of all of them (domaine.html).
// Holdings are assembled exactly as the atlas does it (burgundy.js): the atlas's climats plus INAO's other premiers crus
// with their researched owners (burgundy-extras.js), then the shared corrections from the cellar's Google Sheet.
(function(){
"use strict";
const {producers:P, profiles:PF, villages:V, climats:C0} = window.BURG;
const GEO = window.BURG_GEO || null, XO = window.BURG_EXTRAS || {};
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const t = (window.I18N && window.I18N.t) || ((s, ...a) => s.replace(/\{(\d)\}/g, (m, i) => a[i] ?? ""));
const fmtHa = h => h==null ? "—" : (h>=10 ? h.toFixed(1) : h.toFixed(2)).replace(/\.?0+$/,"");
const norm = s => String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[-'’.,«»()]/g," ").replace(/\s+/g," ").trim();
const LX = () => ((window.BURG_I18N || {})[window.I18N ? window.I18N.lang : "en"]) || null;
const txP = (key, pf, f) => (LX()?.profiles?.[key]?.[f]) || pf[f];
const CLASS = {GC:"Grand cru", "1er":"Premier cru", V:"Village climat"}, ORD = {GC:0, "1er":1, V:2};
const KIND = {f:"leased", s:"buys grapes"};
const VIL = Object.fromEntries(V.map(v => [v.id, v]));

// ---- climats: the atlas's own, then INAO's others with their owners (as burgundy.js does) ----
if(XO.producers) Object.entries(XO.producers).forEach(([k, n]) => { if(!P[k]) P[k] = n; });
const C = C0.map(c => ({...c, p:(c.p || []).map(x => [...x])}));
if(GEO && GEO.extra) Object.entries(GEO.extra).forEach(([id, x]) => {
  if(!VIL[x.v] || C.some(c => c.id===id)) return;
  C.push({id, n:x.n, v:x.v, c:x.c, ha:x.ha, ap:x.ap, x:true, in:x.in,
    p:((XO.holdings||{})[id] || []).map(([k, h, kind]) => [k, h, kind||""]).filter(([k]) => P[k])});
});
const CL = Object.fromEntries(C.map(c => [c.id, c]));
C.forEach(c => { c.p0 = c.p.map(x => [...x]); c.inner = !!c.in; });
const geomOf = id => (GEO && (GEO.climats[id] || (GEO.extra && GEO.extra[id] && GEO.extra[id].mp))) || null;

// ---- producers index (same rules as the atlas: an enclave isn't counted twice; bought grapes aren't ownership) ----
let PROD = {};
function indexHoldings(){
  PROD = {};
  C.forEach(c => c.p.forEach(([k, h, kind, since]) => {
    if(c.inner && CL[c.in] && CL[c.in].p.some(([k2]) => k2===k)) return;
    const r = PROD[k] ??= {key:k, name:P[k], hold:[], ha:0, gc:0, n:0, prof:PF[k]||null};
    r.hold.push({c, ha:h, kind:kind||"", since:since||null}); r.n++;
    if(kind!=="s"){ r.ha += h||0; if(c.c==="GC") r.gc++; }
  }));
}
// shared corrections, as in the atlas (burgundy.js: applyEdits)
function keyFor(name){
  if(P[name]) return name;
  const n = norm(name), hit = Object.keys(P).find(k => norm(P[k])===n);
  if(hit) return hit;
  const k = "x_" + n.replace(/[^a-z0-9]+/g,"_").slice(0,40); P[k] = name; return k;
}
function applyEdits(list){
  C.forEach(c => { c.p = c.p0.map(x => [...x]); });
  [...list].sort((a,b) => String(a.time).localeCompare(String(b.time))).forEach(e => {
    const c = CL[e.climat]; if(!c) return;
    const key = keyFor(e.producer), i = c.p.findIndex(x => x[0]===key);
    if(e.action==="remove"){ if(i>=0) c.p.splice(i,1); return; }
    const row = [key, e.ha==null||isNaN(e.ha) ? null : e.ha, e.kind||"", e.since||null];
    if(i>=0) c.p[i] = row; else c.p.push(row);
  });
  indexHoldings();
}
indexHoldings();
async function loadEdits(){
  let api = ""; try{ api = localStorage.getItem("vinApi") || ""; }catch(e){}
  api = api || (window.WINE_CONFIG && window.WINE_CONFIG.API_URL) || ""; if(!api) return;
  try{
    const res = await fetch(api, {method:"POST", body:JSON.stringify({action:"atlas"}), redirect:"follow"});
    const data = await res.json(); if(data.ok && (data.edits||[]).length){ applyEdits(data.edits); render(); }
  }catch(e){ /* offline: the shipped holdings stand */ }
}

// ---- small surveyed maps of the holdings, north up, numbered like the table ----
// Holdings spread along the Côte (Leroy: Gevrey to Corton) would be specks on one map, so they're cut into north–south
// windows of at most ~3.5 km, one map each, labelled with their communes.
const SPAN = 3500;
function mapsHtml(hold){
  if(!GEO) return "";
  const parts = hold.map((h, i) => ({h, i, mp:geomOf(h.c.id)})).filter(x => x.mp);
  if(!parts.length) return "";
  parts.forEach(x => { const ys = x.mp.flatMap(p => p[0].map(q => q[1])); x.y0 = Math.min(...ys); x.y1 = Math.max(...ys); });
  parts.sort((a, b) => b.y1 - a.y1); // north first
  const groups = [];
  parts.forEach(x => { const g = groups[groups.length - 1];
    if(g && Math.max(g.top, x.y1) - Math.min(g.bot, x.y0) <= SPAN){ g.items.push(x); g.top = Math.max(g.top, x.y1); g.bot = Math.min(g.bot, x.y0); }
    else groups.push({items:[x], top:x.y1, bot:x.y0}); });
  const one = groups.length === 1;
  return groups.map(g => {
    const names = [...new Set(g.items.map(x => VIL[x.h.c.v].n))].join(" · ");
    return `<figure class="mapfig${one ? " one" : ""}">${one ? "" : `<figcaption>${esc(names)}</figcaption>`}${mapSvg(g.items, hold)}</figure>`;
  }).join("");
}
function mapSvg(parts, hold){
  const pts = parts.flatMap(x => x.mp.flatMap(p => p[0]));
  let [x0, y0, x1, y1] = [Math.min(...pts.map(p=>p[0])), Math.min(...pts.map(p=>p[1])), Math.max(...pts.map(p=>p[0])), Math.max(...pts.map(p=>p[1]))];
  // at least ~1.2 km across, with a margin
  const cx = (x0+x1)/2, cy = (y0+y1)/2, w = Math.max(1200, (x1-x0)*1.18), h = Math.max(900, (y1-y0)*1.12);
  x0 = cx - w/2; x1 = cx + w/2; y0 = cy - h/2; y1 = cy + h/2;
  const ring = r => "M" + r.map(([x, y]) => `${Math.round(x)} ${Math.round(-y)}`).join("L") + "Z";
  const inBox = mp => mp.some(p => p[0].some(([x, y]) => x > x0 && x < x1 && y > y0 && y < y1));
  // context: the communes' village land and every other climat in view, faint
  const ctx = Object.values(GEO.villages).filter(inBox).map(mp => `<path class="mv" d="${mp.map(p => p.map(ring).join("")).join("")}"/>`).join("")
    + C.filter(c => !hold.some(h => h.c===c)).map(c => geomOf(c.id)).filter(mp => mp && inBox(mp)).map(mp => `<path class="mc" d="${mp.map(p => ring(p[0])).join("")}"/>`).join("");
  const shapes = parts.map(({h, mp}) => `<a href="burgundy.html#c=${encodeURIComponent(h.c.id)}"><path class="mh ${h.c.c==="1er"?"p1":h.c.c} ${h.kind==="s"?"buys":""}" d="${mp.map(p => p.map(ring).join("")).join("")}" fill-rule="evenodd"><title>${esc(h.c.n)}${h.ha!=null&&h.kind!=="s" ? " · " + fmtHa(h.ha) + " ha" : ""}</title></path></a>`).join("");
  // number badges at the point deepest inside each holding's largest piece
  const badges = parts.map(({i, mp}) => { const big = mp.reduce((a, p) => area(p[0]) > area(a[0]) ? p : a, mp[0]);
    const [bx, by] = pole(big);
    return `<g class="mb" data-x="${Math.round(bx)}" data-y="${Math.round(-by)}"><circle/><text>${i+1}</text></g>`; }).join("");
  return `<svg class="dmap" viewBox="${Math.round(x0)} ${Math.round(-y1)} ${Math.round(w)} ${Math.round(h)}" preserveAspectRatio="xMidYMid meet" role="group" aria-label="${esc(t("Map of the holdings"))}">${ctx}${shapes}${badges}</svg>`;
}
const area = r => Math.abs(r.reduce((s, [x, y], i) => { const [x2, y2] = r[(i+1) % r.length]; return s + x*y2 - x2*y; }, 0) / 2);
const inRing = (x, y, r) => { let c = false; for(let i = 0, j = r.length-1; i < r.length; j = i++){ const [xi, yi] = r[i], [xj, yj] = r[j]; if((yi > y) !== (yj > y) && x < (xj-xi)*(y-yi)/(yj-yi) + xi) c = !c; } return c; };
// pole of inaccessibility on a coarse grid: the inside point farthest from the edges (holes respected)
function pole(poly){
  const r = poly[0], xs = r.map(q => q[0]), ys = r.map(q => q[1]), X0 = Math.min(...xs), X1 = Math.max(...xs), Y0 = Math.min(...ys), Y1 = Math.max(...ys);
  let best = [(X0+X1)/2, (Y0+Y1)/2], bd = -1;
  for(let a = 1; a < 16; a++) for(let b = 1; b < 16; b++){
    const x = X0 + (X1-X0)*a/16, y = Y0 + (Y1-Y0)*b/16;
    if(!inRing(x, y, r) || poly.slice(1).some(h => inRing(x, y, h))) continue;
    let d = Infinity; poly.forEach(rr => { for(let k = 0, l = rr.length-1; k < rr.length; l = k++){ const [ax, ay] = rr[l], [cx, cy] = rr[k], dx = cx-ax, dy = cy-ay, L = dx*dx + dy*dy;
      const u = L ? Math.max(0, Math.min(1, ((x-ax)*dx + (y-ay)*dy)/L)) : 0; d = Math.min(d, Math.hypot(x - ax - u*dx, y - ay - u*dy)); } });
    if(d > bd){ bd = d; best = [x, y]; }
  }
  return best;
}
// badges keep a constant screen size whatever the map's scale
function sizeBadges(){
  document.querySelectorAll(".dmap").forEach(svg => {
  const vb = svg.viewBox.baseVal, k = Math.min(svg.clientWidth / vb.width, svg.clientHeight / vb.height) || 1, r = 9/k;
  // two badges closer than a badge's width: push the later one down until it's clear
  const placed = [];
  svg.querySelectorAll(".mb").forEach(g => { const c = g.querySelector("circle"), tx = g.querySelector("text");
    let x = +g.dataset.x, y = +g.dataset.y;
    for(let n = 0; n < 6 && placed.some(([px, py]) => Math.hypot(px - x, py - y) < 2.1*r); n++) y += 2.2*r;
    placed.push([x, y]);
    c.setAttribute("cx", x); c.setAttribute("cy", y.toFixed(1)); c.setAttribute("r", r.toFixed(1));
    tx.setAttribute("x", x); tx.setAttribute("y", y.toFixed(1)); tx.setAttribute("font-size", (11/k).toFixed(1)); });
  });
}

// ---- one domaine ----
function domaineHtml(r){
  const pf = r.prof || {}, host = s => { try{ return new URL(s).hostname.replace(/^www\./,""); }catch(e){ return s; } };
  const hold = [...r.hold].sort((a,b) => (a.kind==="s")-(b.kind==="s") || ORD[a.c.c]-ORD[b.c.c] || (b.ha??-1)-(a.ha??-1) || a.c.n.localeCompare(b.c.n, "fr"));
  const own = hold.filter(h => h.kind!=="s");
  const byCls = {GC:0, "1er":0, V:0}; own.forEach(h => byCls[h.c.c] += h.ha||0);
  const tot = byCls.GC + byCls["1er"] + byCls.V, unknown = own.filter(h => h.ha==null).length;
  const communes = {}; own.forEach(h => { const v = VIL[h.c.v]; (communes[v.id] ||= {v, ha:0, n:0, unk:0}); communes[v.id].ha += h.ha||0; communes[v.id].n++; if(h.ha==null) communes[v.id].unk++; });
  const pk = txP(r.key, pf, "kind"), psz = txP(r.key, pf, "size"), pnote = txP(r.key, pf, "note"), pextra = LX()?.profiles?.[r.key]?.extra;
  const mono = own.filter(h => h.c.mono).length;
  const bar = tot ? `<div class="clsbar" role="img" aria-label="${esc(Object.entries(byCls).filter(([,v]) => v).map(([k,v]) => `${t(CLASS[k])} ${fmtHa(v)} ha`).join(", "))}">${
    Object.entries(byCls).filter(([,v]) => v).map(([k,v]) => `<span class="${k==="1er"?"p1":k}" style="flex:${v}" title="${esc(t(CLASS[k]))} · ${fmtHa(v)} ha"></span>`).join("")}</div>
    <div class="clsleg">${Object.entries(byCls).filter(([,v]) => v).map(([k,v]) => `<span><i class="${k==="1er"?"p1":k}"></i>${esc(t(CLASS[k]))} <b>${fmtHa(v)} ha</b> · ${Math.round(100*v/tot)}%</span>`).join("")}</div>` : "";
  return `<article class="dom">
    <div class="dhead">
      <div class="pills"><span class="pill">${esc(pk || t("Producer"))}</span>${pf.base ? `<span class="pill">${esc(pf.base)}</span>` : ""}</div>
      <h1>${esc(r.name)}</h1>
      ${psz ? `<div class="meta">${t("{0} in all", esc(psz))}</div>` : ""}
      <div class="acts">
        <a class="btn primary" href="burgundy.html#p=${encodeURIComponent(r.key)}">${t("Open in the atlas")} →</a>
        <button class="btn" id="shareBtn" type="button">${t("Share")}</button>
        <button class="btn quiet" id="printBtn" type="button">${t("Print")}</button>
      </div>
    </div>
    <div class="dgrid2">
      <div class="dleft">
        <div class="facts">
          <div class="fact"><div class="l">${t("Ha on map")}</div><div class="v">${fmtHa(r.ha)}${unknown ? "<small>+</small>" : ""}</div></div>
          <div class="fact"><div class="l">${t("Climats")}</div><div class="v">${r.n}</div></div>
          <div class="fact"><div class="l">${t("Grands crus")}</div><div class="v">${r.gc}</div></div>
          ${mono ? `<div class="fact"><div class="l">${t("Monopoles")}</div><div class="v">${mono}</div></div>` : ""}
        </div>
        ${pnote ? `<p class="lead">${esc(pnote)}</p>` : ""}
        ${bar}
        ${unknown ? `<p class="note">${unknown === 1 ? t("+ 1 holding of unpublished size, not in the total.") : t("+ {0} holdings of unpublished size, not in the total.", unknown)}</p>` : ""}
        <h2>${t("Holdings on the map")}</h2>
        <table class="own">
          <thead><tr><th>#</th><th>${t("Climat")}</th><th class="n">ha</th><th class="n">${t("Share")}</th></tr></thead>
          <tbody>${hold.map(({c, ha, kind, since}, i) => `<tr${kind==="s" ? ' class="buys"' : ""}>
            <td class="num">${i+1}</td>
            <td><span class="cls ${c.c==="1er"?"p1":c.c}"></span><a href="burgundy.html#c=${encodeURIComponent(c.id)}">${esc(c.n)}</a>
              ${kind||since ? ` <span class="ktag ${kind}">${[kind && t(KIND[kind]), since && t("since {0}", since)].filter(Boolean).map(esc).join(" · ")}</span>` : ""}
              <div class="sub">${esc(t(CLASS[c.c]))} · ${esc(VIL[c.v].n)}${c.mono ? " · " + esc(t("Monopole")) : ""}</div></td>
            <td class="n">${kind==="s" ? "" : ha!=null ? `<b>${fmtHa(ha)}</b>` : t("holder")}</td>
            <td class="n">${ha!=null && kind!=="s" && c.ha ? Math.round(100*ha/c.ha) + "%" : ""}</td></tr>`).join("")}</tbody>
        </table>
        ${Object.keys(communes).length > 1 ? `<h2>${t("Communes")}</h2><table class="own small">${Object.values(communes).sort((a,b) => b.ha - a.ha)
          .map(({v, ha, n, unk}) => `<tr><td>${esc(v.n)}</td><td class="n">${n} ${t(n === 1 ? "climat" : "climats")}</td><td class="n">${ha ? `<b>${fmtHa(ha)}</b> ha${unk ? "+" : ""}` : t("holder")}</td></tr>`).join("")}</table>` : ""}
        ${(pf.extra||[]).length ? `<h2>${t("Not on this map")}</h2><table class="own small">${pf.extra.map(([n, h, kind], i) => `<tr><td>${esc((pextra||[])[i] || n)}${kind ? ` <span class="ktag ${kind}">${esc(t(KIND[kind]))}</span>` : ""}</td><td class="n">${h!=null ? `<b>${fmtHa(h)}</b> ha` : ""}</td></tr>`).join("")}</table>` : ""}
        ${(pf.src||[]).length ? `<h2>${t("Sources")}</h2><p class="note">${pf.src.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(host(u))}</a>`).join(" · ")}</p>` : ""}
        <p class="note fine">${t("Holdings come from published ownership lists, domaine sources and trade press, rounded — parcels change hands all the time, so treat them as indicative. \"Leased\" means farmed en fermage or métayage; \"buys grapes\" is négociant sourcing and never counts as ownership.")}</p>
      </div>
      <div class="dright">${mapsHtml(hold)}<p class="note mapnote">${t("Numbers match the table · tap a vineyard to open it in the atlas · boundaries © INAO")}</p></div>
    </div>
  </article>`;
}

// ---- all domaines ----
function listHtml(){
  const q = norm(($("dq") || {}).value || ""), sort = ($("ds") || {}).value || "ha";
  const all = Object.values(PROD).filter(r => r.hold.some(h => h.kind!=="s") || r.hold.length);
  const rows = all.filter(r => !q || q.split(" ").every(w => norm(r.name).split(" ").some(x => x.startsWith(w))))
    .sort((a,b) => sort==="az" ? a.name.localeCompare(b.name, "fr") : sort==="gc" ? b.gc - a.gc || b.ha - a.ha : b.ha - a.ha || b.n - a.n);
  return `<div class="lhead"><h1>${t("All domaines")}</h1><span class="ph">${t("{0} of {1} producers", rows.length, all.length)}</span></div>
    <ul class="dlist">${rows.map(r => `<li><a href="?p=${encodeURIComponent(r.key)}"><b>${esc(r.name)}</b>
      <span>${r.prof && txP(r.key, r.prof, "kind") ? esc(txP(r.key, r.prof, "kind")) + " · " : ""}${fmtHa(r.ha)} ha · ${r.n} ${t("climats")}${r.gc ? ` · ${r.gc} ${t("grands crus")}` : ""}</span></a></li>`).join("")}</ul>`;
}

// ---- page ----
const key = new URLSearchParams(location.search).get("p");
function render(){
  const main = $("main"), r = key && PROD[key];
  $("listBar").hidden = !!r;
  if(key && !r){ main.innerHTML = `<p class="ph">${t("Unknown domaine.")} <a href="domaine.html">${t("All domaines")}</a></p>`; return; }
  if(r){
    document.title = `${r.name} — AllWine`;
    main.innerHTML = domaineHtml(r); sizeBadges();
    $("printBtn").onclick = () => print();
    $("shareBtn").onclick = async () => {
      const url = location.href;
      if(navigator.share){ try{ await navigator.share({title:r.name, text:t("{0} — vineyards in the Côte d'Or", r.name), url}); }catch(e){} return; }
      try{ await navigator.clipboard.writeText(url); $("shareBtn").textContent = t("Link copied"); setTimeout(() => $("shareBtn").textContent = t("Share"), 2000); }catch(e){ prompt(t("Copy this link"), url); }
    };
  } else { document.title = `${t("All domaines")} — AllWine`; main.innerHTML = listHtml(); }
}
$("dq").addEventListener("input", () => { if(!key) render(); });
$("ds").addEventListener("change", () => { if(!key) render(); });
addEventListener("resize", sizeBadges);
if(window.I18N) window.I18N.onChange(render);
render(); loadEdits();
})();
