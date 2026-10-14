// Burgundy atlas — renders BURG (burgundy-data.js) as a pannable, zoomable SVG.
(function(){
"use strict";
const {producers:P, profiles:PF, villages:V, climats:C} = window.BURG;
const KIND = new Proxy({f:"leased", s:"buys grapes"}, {get:(o, k) => o[k] && t(o[k])}); // a holding's 3rd element; absent = owned
const $ = id => document.getElementById(id);
const NS = "http://www.w3.org/2000/svg";
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmtHa = h => h==null ? "—" : (h>=10 ? h.toFixed(1) : h.toFixed(2)).replace(/\.?0+$/,"") ;
// language: UI strings through t() (i18n.js); descriptions from burgundy-i18n-<lang>.js when there is one
const t = (window.I18N && window.I18N.t) || ((s, ...a) => s.replace(/\{(\d)\}/g, (m, i) => a[i] ?? ""));
const LX = () => ((window.BURG_I18N || {})[window.I18N ? window.I18N.lang : "en"]) || null;
const txC = c => (LX()?.climats?.[c.id]) || c.d || "";
const txV = (v, f) => (LX()?.villages?.[v.id]?.[f]) || v[f] || "";
const txP = (key, pf, f) => (LX()?.profiles?.[key]?.[f]) || pf[f];
const txD = (c, f) => (LX()?.detail?.[c.id]?.[f]) || (c.detail || {})[f];
const CLASS_EN = {GC:"Grand cru", "1er":"Premier cru", V:"Village climat"}, COL_EN = {R:"Red", W:"White", RW:"Red & white"};
const CLASS_NAME = new Proxy(CLASS_EN, {get:(o, k) => o[k] && t(o[k])}), COL_NAME = new Proxy(COL_EN, {get:(o, k) => o[k] && t(o[k])});

/* ---------- geometry ---------- */
const S = 24;                          // px per grid unit
const X0 = -5, X1 = 37;                // forest edge … plain east of the D974
let total = 0; const OFF = {}, VIL = {};
const COTES = window.BURG.cotes || [{id:"nuits", n:"Côte de Nuits", first:V[0].id}];
{ let cur = COTES[0].id; V.forEach((v,i) => { const k = COTES.find(x => x.first===v.id); if(k) cur = k.id; v.cote = cur;
  OFF[v.id] = total; v.y0 = total; total += v.h; v.idx = i; VIL[v.id] = v; }); }
const Y0 = -1, Y1 = total + 1;
const TILT = 0.035, WIG = 0.45;
// The Côte drifts east as it runs north and bends gently; one smooth warp keeps shared edges shared.
// A faint second-order wobble makes the grid read as surveyed ground rather than boxes.
const WOB = 0.06, WOBY = 0.05;
const px = (x,y) => (x - X0 + TILT*(total - y) + WIG*Math.sin(y/7.5) + WOB*Math.sin(1.3*y + 0.7*x)) * S;
const py = y => (y - Y0) * S;
const gy = (x,y) => py(y + WOBY*Math.sin(0.9*x + 0.45*y)); // geometry only; labels use py
let W = (X1 - X0 + TILT*total + 1) * S, H = (Y1 - Y0) * S;
const W0 = W, H0 = H; // schematic canvas; the surveyed map sets its own
function dense(pts, step=0.25){
  const out=[];
  for(let i=0;i<pts.length;i++){
    const [ax,ay]=pts[i], [bx,by]=pts[(i+1)%pts.length];
    const n=Math.max(1, Math.ceil(Math.hypot(bx-ax,by-ay)/step));
    for(let k=0;k<n;k++) out.push([ax+(bx-ax)*k/n, ay+(by-ay)*k/n]);
  }
  return out;
}
const toPath = (pts, oy=0) => "M"+dense(pts).map(([x,y]) => px(x,y+oy).toFixed(1)+" "+gy(x,y+oy).toFixed(1)).join("L")+"Z";
function polyLine(pts){ // open polyline, densified
  const out=[];
  for(let i=0;i<pts.length-1;i++){
    const [ax,ay]=pts[i],[bx,by]=pts[i+1], n=Math.max(1,Math.ceil(Math.hypot(bx-ax,by-ay)/.25));
    for(let k=0;k<n;k++) out.push([ax+(bx-ax)*k/n, ay+(by-ay)*k/n]);
  }
  out.push(pts[pts.length-1]);
  return "M"+out.map(([x,y])=>px(x,y).toFixed(1)+" "+gy(x,y).toFixed(1)).join("L");
}
function areaCentroid(pts){
  let a=0,cx=0,cy=0;
  for(let i=0;i<pts.length;i++){ const [x1,y1]=pts[i],[x2,y2]=pts[(i+1)%pts.length], f=x1*y2-x2*y1; a+=f; cx+=(x1+x2)*f; cy+=(y1+y2)*f; }
  a/=2; return a ? [cx/(6*a), cy/(6*a)] : pts[0];
}
// INAO's other premiers crus (and Corton climats) the atlas has no notes for yet: drawn on the surveyed map only
{ const G = window.BURG_GEO;
  if(G && G.extra) Object.entries(G.extra).forEach(([id, x]) => {
    if(!VIL[x.v] || C.some(c => c.id===id)) return;
    C.push({id, n:x.n, v:x.v, c:x.c, ha:x.ha, ap:x.ap, x:true, in:x.in, grp: x.c==="GC" && x.ap==="Corton" ? "corton" : undefined,
      s:[[0,0],[1,0],[1,1],[0,1]], p:[], d:""});
    G.climats[id] = x.mp;
  }); }
// A climat with an enclave (Clos des Ruchottes, Clos de la Mouchère…) labels itself in the widest free band
// beside the enclave, so the two labels never sit on top of each other.
C.forEach(c => {
  const enc = C.filter(x => x.in===c.id); if(!enc.length || c.lab) return;
  const bb = pts => { const xs=pts.map(p=>p[0]), ys=pts.map(p=>p[1]); return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)]; };
  const [x0,y0,x1,y1] = bb(c.s), [ex0,ey0,ex1,ey1] = bb(enc.flatMap(e=>e.s));
  const bands = [[x1-x0, ey0-y0, (x0+x1)/2, (y0+ey0)/2], [x1-x0, y1-ey1, (x0+x1)/2, (ey1+y1)/2],
                 [ex0-x0, y1-y0, (x0+ex0)/2, (y0+y1)/2], [x1-ex1, y1-y0, (ex1+x1)/2, (y0+y1)/2]];
  const best = bands.sort((a,b) => Math.min(b[0],b[1]*4)*b[1] - Math.min(a[0],a[1]*4)*a[1])[0]; // prefer wide-and-tall-enough
  c.lab = [best[2], best[3]]; c.lbox = [best[0], best[1]];
});
// For each climat: global polygon, label anchor, and the screen-space box the label may use.
C.forEach(c => {
  c.oy = OFF[c.geo || c.v];
  c.vil = VIL[c.v];
  c.g = c.s.map(([x,y]) => [x, y + c.oy]);
  const xs=c.s.map(p=>p[0]), ys=c.s.map(p=>p[1]);
  // label box: the largest axis-aligned rect is close enough to the bbox for these near-rect shapes,
  // except L-shapes, where we use the centroid and a reduced box.
  const [cx,cy] = c.lab || (c.s.length===4 ? [(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...ys)+Math.max(...ys))/2] : areaCentroid(c.s));
  const [bw,bh] = c.lbox || [(Math.max(...xs)-Math.min(...xs)) * (c.s.length===4?1:.7), (Math.max(...ys)-Math.min(...ys)) * (c.s.length===4?1:.6)];
  c.cx = px(cx, cy + c.oy); c.cy = py(cy + c.oy); c.bw = bw*S; c.bh = bh*S;
  c.inner = !!c.in;
  c.p = c.p || []; c.p0 = c.p.map(x => [...x]); c.edited = {}; // p0 = as shipped; p = after corrections
});
const CL = Object.fromEntries(C.map(c => [c.id, c]));
C.forEach(c => { c.sch = {cx:c.cx, cy:c.cy, bw:c.bw, bh:c.bh}; }); // schematic label geometry, restored on toggling back

/* ---------- producers index (rebuilt whenever corrections are applied) ---------- */
const PROD = {}; // key -> {key,name,hold:[{c,ha,kind,since}],ha,gc,n,prof}
const prodByName = {};
function indexHoldings(){
  C.forEach(c => {
    c.known = c.p.reduce((s,[,h,k]) => s + (k==="s" ? 0 : h||0), 0); // bought grapes aren't ownership
    c.search = norm([c.n, c.vil.n, c.ap||"", ...c.p.map(([k])=>P[k])].join(" "));
  });
  for(const k in PROD) delete PROD[k];
  for(const k in prodByName) delete prodByName[k];
  C.forEach(c => c.p.forEach(([k,h,kind,since]) => { // [key, ha, kind, first vintage]
    if(c.inner && CL[c.in].p.some(([k2])=>k2===k)) return; // enclave already counted in its parent
    const r = PROD[k] ??= {key:k, name:P[k], hold:[], ha:0, gc:0, n:0, prof:PF[k]||null};
    r.hold.push({c, ha:h, kind:kind||"", since:since||null}); r.n++;
    if(kind!=="s"){ r.ha += h||0; if(c.c==="GC") r.gc++; }
  }));
  Object.values(PROD).forEach(r => prodByName[norm(r.name)] = r.key);
}
indexHoldings();

/* ---------- state ---------- */
const st = {
  cls:new Set(["GC","1er","V"]), mono:false, cellarOnly:false, q:"", prod:null, color:"class",
  sel:null, vsel:null, sortK:"v", sortDir:1, wc:"",
  rot: (() => { try{ return +localStorage.getItem("atlasRot") || 0; }catch(e){ return 0; } })(), // surveyed map: degrees clockwise from north-up
};

/* ---------- colours ---------- */
let TOK = {};
function readTokens(){
  const cs = getComputedStyle(document.documentElement);
  ["gc","gc-ink","pc","pc-ink","vc","vc-ink","seq0","seq1","none","mapbg","ink","muted","card","base","accent","gold","forest-ink"].forEach(k => TOK[k] = cs.getPropertyValue("--"+k).trim());
}
const hex2 = h => { h=h.replace("#",""); if(h.length===3) h=h.split("").map(x=>x+x).join(""); return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)); };
const mix = (a,b,t) => { const A=hex2(a),B=hex2(b); return "#"+A.map((v,i)=>Math.round(v+(B[i]-v)*t).toString(16).padStart(2,"0")).join(""); };
const lum = h => { const [r,g,b]=hex2(h).map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4;}); return .2126*r+.7152*g+.0722*b; };
const inkOn = bg => lum(bg) > .32 ? "#2A2126" : "#FFFFFF";
const DARK = () => matchMedia("(prefers-color-scheme: dark)").matches;
// Muted commune hues, north → south.
const HUES = [205,180,150,120,95,330,275,25,350,40,15,60];
function communeColor(c){
  const h = HUES[c.vil.idx % HUES.length], dk = DARK();
  const L = {GC: dk?48:38, "1er": dk?36:60, V: dk?26:80}[c.c];
  return hsl(h, dk?38:42, L);
}
function hsl(h,s,l){ s/=100; l/=100; const k=n=>(n+h/30)%12, a=s*Math.min(l,1-l), f=n=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));
  return "#"+[f(0),f(8),f(4)].map(x=>Math.round(x*255).toString(16).padStart(2,"0")).join(""); }
const maxHa = Math.max(...C.map(c=>c.ha));
const maxOwners = Math.max(...C.map(c=>(c.p||[]).length));
/* ---------- vintages (burgundy-vintages.js): ratings per Côte and colour, events per commune, station weather ---------- */
const VT = window.BURG_VINTAGES || null;
const VCATS = ["nuits_red", "beaune_red", "beaune_white"], VCAT_EN = {nuits_red:"Côte de Nuits red", beaune_red:"Côte de Beaune red", beaune_white:"Côte de Beaune white"};
// which rating applies to a climat: its Côte and colour (the few Côte de Nuits whites take the Côte de Beaune white rating)
const catOf = c => (c.col||"R")==="W" ? "beaune_white" : (c.vil && c.vil.cote==="nuits") ? "nuits_red" : "beaune_red";
const vRating = (cat, y) => VT && VT.years[y] && VT.years[y][cat]; // [score, estimate, note, drink, sources]
const vYears = cat => VT ? Object.keys(VT.years).map(Number).filter(y => vRating(cat, y)).sort((a, b) => a - b) : [];
const vEvents = (vid, y) => VT ? VT.events.filter(e => (!vid || e.v.includes(vid)) && (y == null || +e.d.slice(0, 4) === +y)) : [];
const EVT = {frost:["#6FA8DC","Frost"], hail:["#8E7CC3","Hail"], heat:["#E07A3F","Heat"], drought:["#C9A227","Drought"], rot:["#6A994E","Rot"], mildew:["#6A994E","Mildew"], storm:["#8E7CC3","Storm"], rain:["#3F7CB6","Rain"]};
const evtKind = t => EVT[String(t).toLowerCase().replace(/[^a-z].*$/, "")] ? String(t).toLowerCase().replace(/[^a-z].*$/, "") : "storm";
const scoreFill = s => mix(TOK.seq0, TOK.seq1, Math.max(0, Math.min(1, (s - 70) / 30)));
{ const ys = VCATS.flatMap(vYears); st.vy = ys.length ? Math.max(...ys) : null; }
// measured terrain per climat (burgundy-dem.js): [alt low, alt high, mean alt, slope %, aspect °, consistency %, samples]
const DEM = (window.BURG_DEM && window.BURG_DEM.c) || {};
const ALT0 = 220, ALT1 = 400, SLOPE1 = 20;
function fillOf(c){
  switch(st.color){
    case "vintage": { const v = vRating(catOf(c), st.vy); return v ? scoreFill(v[0]) : TOK.none; }
    case "alt": { const d = DEM[c.id]; return d ? mix(TOK.seq0, TOK.seq1, Math.max(0, Math.min(1, (d[2]-ALT0)/(ALT1-ALT0)))) : TOK.none; }
    case "slope": { const d = DEM[c.id]; return d ? mix(TOK.seq0, TOK.seq1, Math.min(1, d[3]/SLOPE1)) : TOK.none; }
    case "commune": return communeColor(c);
    case "size": return mix(TOK.seq0, TOK.seq1, Math.log(1+c.ha)/Math.log(1+maxHa));
    case "owners": { const n=c.mono?1:(c.p||[]).length; return n ? mix(TOK.seq0, TOK.seq1, n/maxOwners) : TOK.none; }
    case "producer": {
      if(!st.prod) return {GC:TOK.gc,"1er":TOK.pc,V:TOK.vc}[c.c];
      const hr = hrec(c, st.prod);
      if(!hr) return TOK.none;
      if(hr[2]==="s") return "url(#src)";
      const h = hr[1];
      if(h==null) return "url(#unk)";
      return mix(TOK.seq0, TOK.seq1, .3 + .7*Math.sqrt(Math.min(1, h/c.ha))); // even a small share should stand out from "not held"
    }
    case "cellar": {
      const b = CELLAR.by[c.id]?.left || 0;
      return b ? mix(TOK.seq0, TOK.gold, Math.min(1, .35 + Math.sqrt(b)/4)) : TOK.none;
    }
    default: return {GC:TOK.gc,"1er":TOK.pc,V:TOK.vc}[c.c];
  }
}
function hrec(c, key){ return (c.p||[]).find(([k])=>k===key); }
function holding(c, key){ const r=hrec(c,key); return r ? r[1] : undefined; }
function textFill(c, fill){
  if(fill.startsWith("url")) return TOK.ink;
  if(st.color==="class" || (st.color==="producer" && !st.prod)) return TOK[{GC:"gc-ink","1er":"pc-ink",V:"vc-ink"}[c.c]];
  return inkOn(fill);
}

/* ---------- filters ---------- */
function matches(c){
  if(!st.cls.has(c.c)) return false;
  if(st.mono && !c.mono) return false;
  if(st.wc && !(c.col || (c.x ? "" : "R")).includes(st.wc)) return false; // INAO extras: colour not recorded
  if(st.prod && holding(c, st.prod)===undefined) return false;
  if(st.cellarOnly && !(CELLAR.by[c.id])) return false;
  if(st.q && !c.search.includes(st.q)) return false;
  return true;
}

/* ---------- build svg ---------- */
const svg = $("map");
let gView, labEls=[], vlabEls=[], tlabEls=[], rlabEls=[], ovEls=[];
function el(tag, attrs, parent){
  const e = document.createElementNS(NS, tag);
  for(const k in attrs) e.setAttribute(k, attrs[k]);
  if(parent) parent.appendChild(e);
  return e;
}
/* ---------- two maps: the schematic grid, or surveyed INAO outlines when burgundy-geo.js has them ---------- */
const GEO = window.BURG_GEO && window.BURG_GEO.climats ? window.BURG_GEO : null;
let TOPO = window.BURG_TOPO && window.BURG_TOPO.roads ? window.BURG_TOPO : null; // IGN map furniture for the surveyed map
// it's big (~1 MB gzipped), so it loads after the first paint and the surveyed map is redrawn with it, keeping the view
function loadTopo(){
  if(TOPO || !GEO || loadTopo.started) return; loadTopo.started = true;
  const sc = document.createElement("script"); sc.src = "burgundy-topo.js?v=" + TOPO_V;
  sc.onload = () => { if(!window.BURG_TOPO) return; TOPO = window.BURG_TOPO; if(st.mode==="geo"){ const keep = {...vb}; build(); setVB(keep); } syncMode(); };
  document.body.appendChild(sc);
}
const TOPO_V = 1;
st.mode = GEO ? (() => { try{ return localStorage.getItem("atlasMode") || "geo"; }catch(e){ return "geo"; } })() : "schematic";
const GS = 0.25; // surveyed map: svg units per metre
let CONTENT = null, FWD = null, INV = null; // surveyed map: metres (E,N) ⇄ svg units
const bbOf = pts => { const xs=pts.map(p=>p[0]), ys=pts.map(p=>p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
const bbUnion = bs => bs.length ? [Math.min(...bs.map(b=>b[0])), Math.min(...bs.map(b=>b[1])), Math.max(...bs.map(b=>b[2])), Math.max(...bs.map(b=>b[3]))] : null;
const ringArea = r => Math.abs(r.reduce((s,[x,y],i) => { const [x2,y2] = r[(i+1)%r.length]; return s + x*y2 - x2*y; }, 0) / 2);
// pole of inaccessibility of a ring (coarse grid, refined twice): the inside point farthest from any edge
function edgeDist(x, y, r){
  let inside = false, best = Infinity;
  for(let i = 0, j = r.length-1; i < r.length; j = i++){
    const [xi,yi] = r[i], [xj,yj] = r[j];
    if((yi > y) !== (yj > y) && x < (xj-xi)*(y-yi)/(yj-yi) + xi) inside = !inside;
    const dx = xj-xi, dy = yj-yi, L = dx*dx + dy*dy, t = L ? Math.max(0, Math.min(1, ((x-xi)*dx + (y-yi)*dy)/L)) : 0;
    best = Math.min(best, Math.hypot(x - xi - t*dx, y - yi - t*dy));
  }
  return inside ? best : -best;
}
function pole(r){
  const [x0,y0,x1,y1] = bbOf(r); let cx = (x0+x1)/2, cy = (y0+y1)/2, w = x1-x0, h = y1-y0, best = -Infinity;
  for(let pass = 0; pass < 3; pass++){
    const n = 16, sx = w/n, sy = h/n, ox = cx - w/2, oy = cy - h/2; let bx = cx, by = cy;
    for(let i = 0; i <= n; i++) for(let j = 0; j <= n; j++){ const x = ox + i*sx, y = oy + j*sy, d = edgeDist(x, y, r); if(d > best){ best = d; bx = x; by = y; } }
    cx = bx; cy = by; w = sx*3; h = sy*3;
  }
  return [cx, cy];
}
// the inside stretch of a horizontal (or vertical) line through p, across all rings of a polygon
function chord(rings, p, vertical){
  const a = vertical ? 1 : 0, b = 1 - a, v = p[b], xs = [];
  rings.forEach(r => { for(let i = 0, j = r.length-1; i < r.length; j = i++){ const P = r[i], Q = r[j];
    if((P[b] > v) !== (Q[b] > v)) xs.push(P[a] + (v - P[b]) * (Q[a] - P[a]) / (Q[b] - P[b])); } });
  xs.sort((m, n) => m - n);
  for(let i = 0; i + 1 < xs.length; i += 2) if(xs[i] <= p[a] && p[a] <= xs[i+1]) return [xs[i], xs[i+1]];
  return [p[a], p[a]];
}
function labelBox(rings, p){
  const [l, r] = chord(rings, p, false), cx = (l + r)/2, bw = (r - l) * .9;
  // height: the narrowest vertical stretch across the middle half of the label
  const hs = [-.25, 0, .25].map(f => chord(rings, [cx + f*bw, p[1]], true)), top = Math.max(...hs.map(h => h[0])), bot = Math.min(...hs.map(h => h[1]));
  return {cx, cy: (top + bot)/2, bw, bh: Math.max(0, bot - top) * .9};
}
function prepare(){
  if(st.mode==="geo"){
    const all = [];
    [...Object.values(GEO.climats), ...Object.values(GEO.villages||{})].forEach(mp => mp.forEach(p => p[0].forEach(q => all.push(q))));
    // turn the map about its centre (st.rot degrees clockwise), then fit: labels stay upright because the geometry turns, not the svg
    const [minE, minN, maxE, maxN] = bbOf(all), PAD = 60, ce = (minE+maxE)/2, cn = (minN+maxN)/2;
    const a = (st.rot||0)*Math.PI/180, ca = Math.cos(a), sa = Math.sin(a);
    const R0 = ([e,n]) => { const x = e-ce, y = cn-n; return [x*ca - y*sa, x*sa + y*ca]; };
    const [rx0, ry0, rx1, ry1] = bbOf(all.map(R0));
    const T = q => { const [x,y] = R0(q); return [(x-rx0)*GS+PAD, (y-ry0)*GS+PAD]; };
    FWD = T;
    INV = ([sx,sy]) => { const x = (sx-PAD)/GS+rx0, y = (sy-PAD)/GS+ry0; return [ce + x*ca + y*sa, cn - (-x*sa + y*ca)]; };
    W = (rx1-rx0)*GS + 2*PAD; H = (ry1-ry0)*GS + 2*PAD;
    const dOf = mp => mp.map(p => p.map(r => "M"+r.map(q => T(q).map(v=>v.toFixed(1)).join(" ")).join("L")+"Z").join("")).join("");
    C.forEach(c => {
      const mp = GEO.climats[c.id];
      if(!mp){ c.path = ""; c.bb = null; Object.assign(c, {cx:-9999, cy:-9999, bw:0, bh:0}); return; }
      c.path = dOf(mp); c.bb = bbOf(mp.flatMap(p => p[0]).map(T));
      // label: centred on the point deepest inside the largest piece (its pole of inaccessibility), boxed by the
      // polygon's own width and height through that point, so long thin or bent climats still get a name
      const big = mp.reduce((a,p) => ringArea(p[0]) > ringArea(a[0]) ? p : a, mp[0]);
      if(!c._pole) c._pole = pole(big[0]);
      Object.assign(c, labelBox(big.map(r => r.map(T)), T(c._pole)));
    });
    V.forEach(v => {
      const mp = (GEO.villages||{})[v.id];
      v.baseD = mp ? [dOf(mp)] : [];
      v.bb = bbUnion([...(mp ? [bbOf(mp.flatMap(p => p[0]).map(T))] : []), ...C.filter(c => c.v===v.id && c.bb).map(c => c.bb)]);
      v.tl = null;
    });
    CONTENT = [0, 0, W, H];
  } else {
    W = W0; H = H0;
    C.forEach(c => { Object.assign(c, c.sch);
      if(c.x){ c.path = ""; c.bb = null; Object.assign(c, {cx:-9999, cy:-9999, bw:0, bh:0}); return; } // INAO extras: surveyed map only
      c.path = toPath(c.s, c.oy); const b = bbOf(c.g); c.bb = boxOfGrid(b[0], b[1], b[2], b[3]); });
    V.forEach(v => { v.baseD = (v.base||[]).map(b => toPath(b, v.y0));
      const ext = v.id==="flagey" ? -3.5 : 0, ext2 = v.id==="chambolle" ? 6.5 : 0; v.bb = boxOfGrid(-0.5, v.y0+ext, 31, v.y0+v.h+ext2); });
    CONTENT = boxOfGrid(-4.5, Y0, 37, Y1);
  }
}
const prodBox = key => bbUnion(PROD[key].hold.map(h => h.c.bb).filter(Boolean));
function build(){
  readTokens();
  prepare();
  const SCH = st.mode!=="geo";
  rlabEls = []; ovEls = [];
  svg.innerHTML = "";
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const defs = el("defs", {}, svg);
  const pat = el("pattern", {id:"unk", width:6, height:6, patternUnits:"userSpaceOnUse", patternTransform:"rotate(45)"}, defs);
  el("rect", {width:6, height:6, fill:mix(TOK.seq0, TOK.seq1, .35)}, pat);
  el("rect", {width:3, height:6, fill:mix(TOK.seq0, TOK.seq1, .6)}, pat);
  const ps = el("pattern", {id:"src", width:7, height:7, patternUnits:"userSpaceOnUse"}, defs);
  el("rect", {width:7, height:7, fill:mix(TOK.seq0, TOK.gold, .25)}, ps);
  el("circle", {cx:3.5, cy:3.5, r:1.6, fill:TOK.gold}, ps);
  // vine rows run down the slope — horizontal on this map
  // vintage view: communes hit by frost (blue hatching) or hail (dots) in the chosen year
  const pf = el("pattern", {id:"evfrost", width:8, height:8, patternUnits:"userSpaceOnUse", patternTransform:"rotate(45)"}, defs);
  el("rect", {width:3, height:8, fill:EVT.frost[0], "fill-opacity":.75}, pf);
  const ph = el("pattern", {id:"evhail", width:9, height:9, patternUnits:"userSpaceOnUse"}, defs);
  [[2.5,2.5],[7,6.5]].forEach(([cx,cy]) => el("circle", {cx, cy, r:1.6, fill:EVT.hail[0], "fill-opacity":.9}, ph));
  const pr = el("pattern", {id:"rows", width:6, height:3.2, patternUnits:"userSpaceOnUse"}, defs);
  el("line", {x1:0, y1:1.6, x2:6, y2:1.6, stroke:TOK.ink, "stroke-opacity":.13, "stroke-width":.55}, pr);
  const pt = el("pattern", {id:"trees", width:14, height:12, patternUnits:"userSpaceOnUse"}, defs);
  [[3,3,2.3],[10,5,2.6],[6,9.5,2.1],[12.5,11,1.8]].forEach(([cx,cy,rr]) => el("circle", {cx, cy, r:rr, fill:TOK["forest-ink"], "fill-opacity":.18}, pt));
  const lg = el("linearGradient", {id:"shade", x1:0, y1:0, x2:1, y2:0}, defs);
  el("stop", {offset:0, "stop-color":TOK.ink, "stop-opacity":DARK()?.18:.08}, lg);
  el("stop", {offset:1, "stop-color":TOK.ink, "stop-opacity":0}, lg);
  gView = el("g", {}, svg);

  if(SCH){
  // plain east of the road, forest west of the slope
  el("path", {class:"plain", d:`M${px(30,Y0)} ${py(Y0)}`+polyLine([[30,Y0],[30,Y1]]).replace(/^M/,"L")+`L${W} ${H}L${W} 0Z`}, gView);
  const forestD = "M0 0"+polyLine([[1,Y0],[1,Y1]]).replace(/^M/,"L")+`L0 ${H}Z`;
  el("path", {class:"forest", d:forestD}, gView);
  el("path", {d:forestD, fill:"url(#trees)", "pointer-events":"none"}, gView);
  // combes cutting back into the hills
  [["gevrey",7.5,"Combe Lavaux"],["morey",-0.2,"Combe Grisard"],["chambolle",6.3,"Combe Ambin"],["chambolle",13.5,"Combe d'Orveau"],
   ["vosne",11.6,"Combe de Concœur"],["nuits",10.7,"Vallée du Meuzin"],["savigny",4.1,"Vallée du Rhoin"],["monthelie",4,"Vallée d'Auxey"],
   ["staubin",2,"Vallée de Saint-Aubin"],["corton",5,"Pernand"]].filter(([v]) => OFF[v]!=null).forEach(([v,y,n]) => {
    const yy = OFF[v]+y;
    el("path", {class:"combe", d:polyLine([[1.2,yy],[-1.5,yy-.25],[-4.6,yy+.15]]), "stroke-width":S*.55}, gView);
    const t = el("text", {class:"flab", x:px(-4.4,yy-.55), y:py(yy-.55), "data-fs":9.5}, gView); t.textContent = n; rlabEls.push(t);
  });
  } else el("rect", {class:"plain", x:0, y:0, width:W, height:H}, gView);

  // commune ground (village AOC) + outlines
  const gBase = el("g", {}, gView);
  V.forEach(v => v.baseD.forEach(d => {
    const p = el("path", {class:"base", d, "data-v":v.id, "fill-rule":"evenodd"}, gBase);
    p.addEventListener("click", ev => { if(dragMoved) return; ev.stopPropagation(); selectVillage(v.id, true); });
    p.addEventListener("pointermove", ev => tip(ev, `<b>${esc(v.n)}</b><br>${esc(v.aoc)}`));
    p.addEventListener("pointerleave", hideTip);
  }));

  const gUnder = el("g", {"pointer-events":"none"}, gView); // surveyed map: woods and planted vines under the climats
  const gTownBase = el("g", {"pointer-events":"none"}, gView);
  const gCl = el("g", {}, gView), gRows = el("g", {class:"rows"}, gView), gHill = el("g", {"pointer-events":"none"}, gView),
        gEvt = el("g", {"pointer-events":"none"}, gView),
        gWall = el("g", {}, gView), gRoad = el("g", {"pointer-events":"none"}, gView), gTown = el("g", {"pointer-events":"none"}, gView),
        gNames = el("g", {class:"tnames", "pointer-events":"none"}, gView),
        gMono = el("g", {}, gView), gLab = el("g", {}, gView), gDot = el("g", {}, gView);
  gTopoNames = gNames; gEvents = gEvt;
  V.forEach(v => v.baseD.forEach(d => el("path", {d, fill:"url(#rows)", opacity:.6, "fill-rule":"evenodd"}, gRows)));
  if(SCH){
  // the escarpment: darker toward the top of the slope
  el("path", {d:toPath([[1,Y0],[9,Y0],[9,Y1],[1,Y1]]), fill:"url(#shade)"}, gHill);
  drawContours(gHill);
  // rivers & roads (over the vines, under the labels)
  const yN = OFF.nuits + 11;
  el("path", {class:"river", d:polyLine([[-4.5,yN-.3],[1,yN-.1],[9,yN],[19,yN+.15],[30,yN+.2],[37,yN+.6]]), "data-w":2.4}, gRoad);
  const yVg = OFF.vougeot + 1.6;
  el("path", {class:"river", d:polyLine([[24.5,yVg],[27,yVg+.2],[30,yVg+.3],[37,yVg+1]]), "data-w":1.8}, gRoad);
  el("path", {class:"road", d:polyLine([[30.3,Y0],[30.3,Y1]]), "data-w":4}, gRoad);
  el("path", {class:"rail", d:polyLine([[34.6,Y0],[34.6,Y1]]), "data-w":1.4}, gRoad);
  drawRoads(gRoad);
  for(let y=6; y<total; y+=22){
    const t = el("text", {class:"rlab", x:px(30.8,y), y:py(y), "data-fs":10, transform:`rotate(90 ${px(30.8,y)} ${py(y)})`}, gView);
    t.textContent = "D974"; rlabEls.push(t);
  }
  { const y=OFF.gevrey+18; const t=el("text",{class:"rlab",x:px(35.1,y),y:py(y),"data-fs":9.5,transform:`rotate(90 ${px(35.1,y)} ${py(y)})`},gView); t.textContent="Dijon–Beaune railway"; rlabEls.push(t); }
  { const y=OFF.gevrey+15; const t=el("text",{class:"rlab",x:px(15.9,y),y:py(y),"data-fs":8.5,transform:`rotate(90 ${px(15.9,y)} ${py(y)})`},gLab); t.textContent="Route des Grands Crus"; rlabEls.push(t); }

  // towns: a soft built-up ground under the vines, streets and houses on top
  V.forEach(v => {
    if(!v.town) return;
    el("path", {class:"town", d:toPath(v.town, v.y0)}, gTownBase);
    drawTown(v, gTown);
    const xs=v.town.map(p=>p[0]), ys=v.town.map(p=>p[1]), cx=(Math.min(...xs)+Math.max(...xs))/2, cy=(Math.min(...ys)+Math.max(...ys))/2;
    v.tl = [px(cx,cy+v.y0), py(cy+v.y0)];
  });
  }

  // climats: parents first, enclaves on top
  labEls = [];
  [...C].sort((a,b) => (a.inner?1:0)-(b.inner?1:0)).forEach(c => {
    const d = c.path; // (c.d is the climat's description)
    const p = el("path", {class:"cl", d, "data-id":c.id, "fill-rule":"evenodd"}, gCl); c.el = p;
    p.addEventListener("click", ev => { if(dragMoved) return; ev.stopPropagation(); select(c.id, false); });
    p.addEventListener("pointermove", ev => tip(ev, tipHtml(c)));
    p.addEventListener("pointerleave", hideTip);
    el("path", {d, fill:"url(#rows)", "pointer-events":"none"}, gRows);
    if(c.wall) el("path", {class:"wall", d, "data-w":2.6}, gWall);
    if(c.mono){ c.mel = el("path", {class:"mono", d:SCH ? insetPath(c) : d, stroke:"var(--gc-ink)"}, gMono); }
    const t = el("text", {class:"lab "+c.c, x:c.cx.toFixed(1), y:c.cy.toFixed(1)}, gLab);
    c.lel = t; labEls.push(c);
    c.dot = el("circle", {class:"cellardot", cx:(c.cx).toFixed(1), cy:(c.cy).toFixed(1), r:0}, gDot);
  });

  if(SCH) drawLandmarks(gTown, gLab);
  tlabEls = [];
  V.forEach(v => {
    if(!v.tl) return;
    const t = el("text", {class:"tlab", x:v.tl[0], y:v.tl[1], "text-anchor":"middle", "dominant-baseline":"central", "data-fs":11}, gLab);
    t.textContent = v.n.split(" · ")[0].replace("-Saint-","-St-"); tlabEls.push(t);
  });
  // commune names, set vertically in the forest band
  vlabEls = [];
  V.forEach(v => {
    if(!SCH){ // surveyed map: names over each commune, shown when zoomed out
      if(!v.bb || ["flagey","premeaux","brochon"].includes(v.id) && !(GEO.villages||{})[v.id]) return;
      const o = el("text", {class:"vlab ov", x:(v.bb[0]+v.bb[2])/2, y:(v.bb[1]+v.bb[3])/2, "text-anchor":"middle", "dominant-baseline":"central", "data-fs":12}, gLab);
      o.textContent = v.n; ovEls.push(o); return;
    }
    const ext = v.id==="flagey" ? -3.5 : 0;
    const yc = v.y0 + (ext + v.h)/2, x = -2.1;
    const t = el("text", {class:"vlab", x:px(x,yc), y:py(yc), "text-anchor":"middle", "dominant-baseline":"central",
      transform:`rotate(-90 ${px(x,yc)} ${py(yc)})`, "data-fs":13, "data-span":(v.h - ext)*S}, gView);
    t.textContent = v.n; vlabEls.push(t);
    // overview names, out on the plain beyond the railway — only shown when zoomed right out
    const o = el("text", {class:"vlab ov", x:px(36,yc), y:py(yc), "dominant-baseline":"central", "data-fs":12}, gView);
    o.textContent = v.n; ovEls.push(o);
  });
  if(!SCH && TOPO) drawTopo(gUnder, gHill, gRoad, gTown, gNames);
  if(!svg._bgClick){ svg._bgClick = true; svg.addEventListener("click", () => { if(!dragMoved && (st.sel||st.vsel)){ st.sel=null; st.vsel=null; renderSide(); paint(); syncHash(); } }); }
  buildLocator();
  paint();
}
/* ---------- surveyed map furniture from IGN (burgundy-topo.js): one path per layer, sized in screen pixels ---------- */
let gTopoNames = null, gEvents = null;
// vintage colour mode: hatch the communes a frost or hailstorm hit in the chosen year
function paintEvents(){
  if(!gEvents) return; gEvents.innerHTML = "";
  if(st.color!=="vintage" || !VT) return;
  const hit = {}; vEvents(null, st.vy).forEach(e => { const k = evtKind(e.t); if(k==="frost" || k==="hail") e.v.forEach(v => (hit[v] ||= new Set()).add(k)); });
  Object.entries(hit).forEach(([vid, ks]) => ks.forEach(k => {
    const d = [...(VIL[vid] ? VIL[vid].baseD : []), ...C.filter(c => c.v===vid && c.path).map(c => c.path)].join("");
    if(d) el("path", {d, fill:`url(#ev${k})`, "fill-rule":"nonzero"}, gEvents);
  }));
}
function topoD(flat, close){
  let d = "";
  let x = 0, y = 0; const dl = TOPO.meta && TOPO.meta.delta;
  for(let i = 0; i < flat.length; i += 2){
    if(dl && i){ x += flat[i]; y += flat[i+1]; } else { x = flat[i]; y = flat[i+1]; }
    const q = FWD([x, y]); d += (i ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1);
  }
  return close ? d + "Z" : d;
}
function drawTopo(gUnder, gHill, gRoad, gTown, gNames){
  const T = TOPO, join = (list, close) => list.map(f => topoD(f, close)).join("");
  el("path", {class:"t-wood", d:join(T.woods, true), "fill-rule":"evenodd"}, gUnder);
  el("path", {class:"t-vine", d:join(T.vines, true)}, gUnder);
  // contours over the vineyards, faint; every 25 m a little stronger
  el("path", {class:"t-cmin", d:T.cont.filter(c => !c[1]).map(c => topoD(c[2])).join("")}, gHill);
  el("path", {class:"t-cmaj", d:T.cont.filter(c => c[1]).map(c => topoD(c[2])).join("")}, gHill);
  el("path", {class:"t-comm", d:T.communes.flatMap(c => c[2]).map(r => topoD(r, true)).join("")}, gRoad);
  el("path", {class:"t-water", d:T.water.filter(w => w[0]===1).map(w => topoD(w[1])).join("")}, gRoad);
  el("path", {class:"t-water t-wint", d:T.water.filter(w => w[0]!==1).map(w => topoD(w[1])).join("")}, gRoad);
  const rd = k => T.roads.filter(r => r[0]===k).map(r => topoD(r[1])).join("");
  const R4 = rd(4), R3 = rd(3), R2 = rd(2), R1 = rd(1), rail = join(T.rail);
  el("path", {class:"t-track", d:R4}, gRoad);
  [[R3,"t-r3"],[R2,"t-r2"],[R1,"t-r1"]].forEach(([d,c]) => el("path", {class:"t-case "+c, d}, gRoad));
  [[R3,"t-r3"],[R2,"t-r2"],[R1,"t-r1"]].forEach(([d,c]) => el("path", {class:"t-fill "+c, d}, gRoad));
  el("path", {class:"t-rail", d:rail}, gRoad); el("path", {class:"t-rail2", d:rail}, gRoad);
  el("path", {class:"t-bld", d:join(T.bld, true)}, gTown);
  // names: villages and hamlets, streams and woods, and the lieux-dits — except where a climat of the same name is drawn
  const climatAt = (x, y, n) => C.some(c => c.bb && x >= c.bb[0] && x <= c.bb[2] && y >= c.bb[1] && y <= c.bb[3] && bareN(c.n) === n);
  T.names.forEach(([k, n, x0, y0]) => {
    const [x, y] = FWD([x0, y0]);
    if(k === "l" && climatAt(x, y, bareN(n))) return;
    const e = el("text", {class:"tn tn-"+k, x:x.toFixed(1), y:y.toFixed(1)}, gNames); e.textContent = n;
  });
  (T.refs || []).forEach(([num, x0, y0]) => { const [x, y] = FWD([x0, y0]); const e = el("text", {class:"tn tn-ref", x:x.toFixed(1), y:y.toFixed(1)}, gNames); e.textContent = num; });
}
const bareN = n => norm(n).replace(/^(les|la|le|aux|au|en|l|a la)\s+/, "");
// level of detail on the surveyed map: buildings, tracks, small contours and lieux-dits names only when zoomed in
function topoLod(k){
  if(!TOPO || st.mode!=="geo" || !gTopoNames) return;
  const mpp = 1/(GS*k); // metres per screen pixel
  svg.classList.toggle("lod-mid", mpp < 9); svg.classList.toggle("lod-near", mpp < 3.2); svg.classList.toggle("lod-close", mpp < 1.4);
  gTopoNames.setAttribute("font-size", (11/k).toFixed(2));
}
/* ---------- map furniture: contours, roads, villages, landmarks ---------- */
const townBox = v => { const xs=v.town.map(p=>p[0]), ys=v.town.map(p=>p[1]); return [Math.min(...xs), v.y0+Math.min(...ys), Math.max(...xs), v.y0+Math.max(...ys)]; };
const townC = v => { const [a,b,c,d]=townBox(v); return [(a+c)/2, (b+d)/2]; };
function inPoly(x,y,pts){ let c=false; for(let i=0,j=pts.length-1;i<pts.length;j=i++){ const [xi,yi]=pts[i],[xj,yj]=pts[j]; if((yi>y)!==(yj>y) && x<(xj-xi)*(y-yi)/(yj-yi)+xi) c=!c; } return c; }
function rng(seed){ let t = seed*2654435761 >>> 0; return () => { t ^= t<<13; t ^= t>>>17; t ^= t<<5; return ((t>>>0)%100000)/100000; }; }
function drawContours(g){
  // approximate heights across the slope: forest edge ~350 m, grands crus 260–300 m, the D974 ~230 m
  [[2.5,"325 m"],[8,"300 m"],[14.5,"275 m"],[21,"250 m"],[27.5,"235 m"]].forEach(([x,lab],i) => {
    const pts=[]; for(let y=Y0; y<=Y1; y+=1) pts.push([x + .35*Math.sin(y/3.1 + i), y]);
    el("path", {class:"contour", d:polyLine(pts), "data-w":.9}, g);
    for(let y=8+i*4; y<total; y+=26){
      const xx = x + .35*Math.sin(y/3.1 + i), t = el("text", {class:"clab", x:px(xx,y), y:py(y), "data-fs":8.5, transform:`rotate(-90 ${px(xx,y)} ${py(y)})`, "text-anchor":"middle"}, g);
      t.textContent = lab; rlabEls.push(t);
    }
  });
}
function drawRoads(g){
  const T = id => townC(VIL[id]), o = id => OFF[id];
  // Route des Grands Crus (D122 and lanes), village to village along the mid/lower slope
  const rgc = [T("marsannay"), T("fixin"), T("brochon"), T("gevrey"), [17.5,o("gevrey")+10.5], [15.5,o("gevrey")+12], [15.5,o("gevrey")+25.5],
    [15.8,o("morey")+5], T("morey"), [21.5,o("morey")+10.6], [17,o("chambolle")+4.5], T("chambolle"), [16,o("chambolle")+8], [20.5,o("chambolle")+10.2],
    T("vougeot"), [28.6,o("vougeot")+6], [28.6,o("flagey")+.5], [23.5,o("flagey")+5], T("vosne"), [24.5,o("vosne")+16], [22.8,o("nuits")+4.5], T("nuits"),
    [24,o("nuits")+15], [21,o("nuits")+21], T("premeaux"), T("cdnv")];
  el("path", {class:"rcase", d:polyLine(rgc), "data-w":4.2}, g);
  el("path", {class:"rfill", d:polyLine(rgc), "data-w":2.4}, g);
  // Côte de Beaune: village to village along the foot of the slope
  const cb = ["corton","chorey","beaune","pommard","volnay","meursault","puligny","chassagne","santenay","maranges"].filter(id=>VIL[id]).map(T);
  if(cb.length){ const L = [T("cdnv"), ...cb]; el("path", {class:"rcase", d:polyLine(L), "data-w":4.2}, g); el("path", {class:"rfill", d:polyLine(L), "data-w":2.4}, g); }
  // each village's road down to the D974
  V.forEach(v => { if(!v.town || v.townOff) return; const [x,y] = townC(v);
    const d = polyLine([[x,y],[x+(30.3-x)*.5,y+.15],[30.3,y+.1]]);
    el("path", {class:"rcase", d, "data-w":3.2}, g); el("path", {class:"rfill", d, "data-w":1.7}, g); });
  // Vosne: the lane along the foot of Romanée-Conti and up the side of La Grande Rue, as walked by every pilgrim
  const vo = o("vosne");
  const lane = [[20.6,vo+8.7],[15.5,vo+8.7],[10.4,vo+8.75],[8.3,vo+8.6]], lane2 = [[15.5,vo+8.7],[15.5,vo+6.5],[16,vo+6.5],[16,vo+3.6]];
  [lane, lane2].forEach(L => { el("path", {class:"track", d:polyLine(L), "data-w":1.6}, g); });
}
function drawTown(v, g){
  const [x0,y0,x1,y1] = townBox(v), [xc,yc] = townC(v), rnd = rng(17 + v.idx*31);
  const near = V.filter(u => Math.abs(u.y0 - v.y0) < 30).map(u=>u.id);
  const vines = C.filter(c => near.includes(c.geo||c.v));
  const street = [[x0-.2,yc],[x1+.2,yc+.1]], cross = [[xc,y0-.1],[xc+.2,y1+.1]];
  [street, cross].forEach(L => { el("path", {class:"rcase", d:polyLine(L), "data-w":2.6}, g); el("path", {class:"rfill", d:polyLine(L), "data-w":1.4}, g); });
  for(let x=x0+.15; x<x1-.25; x+=.55) for(let y=y0+.15; y<y1-.2; y+=.5){
    const dx = Math.abs(x+.2-xc), dy = Math.abs(y+.15-yc);
    if(dx<.32 || dy<.3) continue;                      // keep the streets clear
    const pNear = Math.min(dx,dy) < 1.3 ? .8 : .38;
    if(rnd() > pNear) continue;
    const w = .26+rnd()*.2, h = .2+rnd()*.17, hx = x + rnd()*.08, hy = y + rnd()*.08;
    if(vines.some(c => inPoly(hx+w/2, hy+h/2, c.g))) continue; // never on a vineyard (village clos inside the town)
    el("path", {class:"house", d:toPath([[hx,hy],[hx+w,hy],[hx+w,hy+h],[hx,hy+h]])}, g);
  }
  // church: nave + a small cross
  const cx = xc+.55, cy = yc-.75;
  el("path", {class:"church", d:toPath([[cx,cy],[cx+.75,cy],[cx+.75,cy+.36],[cx,cy+.36]])}, g);
  const [kx,ky] = [px(cx+.95,cy+.18), py(cy+.18)];
  el("path", {class:"chcross", d:`M${kx-3} ${ky}h6M${kx} ${ky-4}v8`, "data-w":1.4}, g);
}
function drawLandmarks(g, gl){
  const vo = OFF.vosne, vg = OFF.vougeot;
  // La Croix de la Romanée-Conti
  const [cx,cy] = [px(15.5,vo+8.7), py(vo+8.7)];
  el("circle", {class:"lm", cx, cy, r:5.5, "data-r":5.5}, g);
  el("path", {class:"lmx", d:`M${cx-2.4} ${cy-.6}h4.8M${cx} ${cy-3}v5.2`, "data-w":1.2}, g);
  lmLab(gl, cx+7, cy-7, "La Croix");
  // Château du Clos de Vougeot
  const ch = [[15,vg+3.6],[17.8,vg+3.6],[17.8,vg+4.9],[15,vg+4.9]];
  el("path", {class:"chateau", d:toPath(ch)}, g);
  el("path", {class:"chateau", d:toPath([[15.6,vg+4.0],[17.2,vg+4.0],[17.2,vg+4.5],[15.6,vg+4.5]]), style:"fill:var(--mapbg)"}, g);
  lmLab(gl, px(16.4,vg+5.2), py(vg+5.35), "Château du Clos de Vougeot", "middle");
  if(VIL.beaune){ const [hx,hy] = townC(VIL.beaune); lmLab(gl, px(hx,hy+1.6), py(hy+1.6), "Hospices de Beaune", "middle"); }
}
const lmEls = [];
function lmLab(g, x, y, text, anchor="start"){ const t = el("text", {class:"lmlab", x, y, "text-anchor":anchor, "data-fs":9.5}, g); t.textContent = text; lmEls.push(t); }

function insetPath(c){ // a dashed ring just inside the monopole's outline
  const xs=c.s.map(p=>p[0]), ys=c.s.map(p=>p[1]);
  const k = Math.min(.18, (Math.max(...xs)-Math.min(...xs))/6, (Math.max(...ys)-Math.min(...ys))/6);
  if(c.s.length!==4) return toPath(c.s, c.oy);
  const [x0,x1,y0,y1] = [Math.min(...xs)+k, Math.max(...xs)-k, Math.min(...ys)+k, Math.max(...ys)-k];
  return toPath([[x0,y0],[x1,y0],[x1,y1],[x0,y1]], c.oy);
}
function tipHtml(c){
  const own = c.mono ? t("Monopole · {0}", esc(P[c.mono])) : ((c.p||[]).length ? `${t("Owners")}: ${c.p.length}` : "");
  let extra = "";
  if(st.prod){ const hr = hrec(c, st.prod); if(hr) extra = `<br>${esc(P[st.prod])}: ${hr[2]==="s" ? t("buys grapes here") : hr[1]==null ? t("holder") : fmtHa(hr[1])+" ha · "+Math.round(100*hr[1]/c.ha)+"%"}${hr[2]==="f"?` (${t("leased")})`:""}${hr[3]?" · "+t("since {0}", hr[3]):""}`; }
  const cb = CELLAR.by[c.id]; if(cb) extra += `<br>🍷 ${cb.left} · ${t("in your cellar")}`;
  return `<b>${esc(c.n)}</b><br>${CLASS_NAME[c.c]} · ${esc(c.vil.n)} · ${fmtHa(c.ha)} ha${own?"<br>"+own:""}${extra}`;
}

/* ---------- paint (colours, filters, selection) ---------- */
function paint(){
  C.forEach(c => {
    const f = fillOf(c), on = matches(c);
    c.el.setAttribute("fill", f);
    c.el.classList.toggle("dim", !on);
    c.el.classList.toggle("sel", st.sel===c.id);
    if(c.mel){ c.mel.classList.toggle("dim", !on); c.mel.setAttribute("stroke", f.startsWith("url")?TOK.ink:textFill(c,f)); c.mel.setAttribute("stroke-opacity", .8); }
    c.lel.setAttribute("fill", textFill(c, f));
    c.lel.classList.toggle("dim", !on);
    c.on = on;
    c.dot.dataset.b = CELLAR.by[c.id]?.left || 0; // sized in layoutLabels
  });
  // keep the selection on top
  if(st.sel){ const e=CL[st.sel].el; e.parentNode.appendChild(e); }
  layoutLabels();
  paintEvents();
  renderLegend(); renderList(); renderDomains(); renderCompare(); renderGcOwners(); renderVintages(); syncChips();
}

/* ---------- view: pan / zoom ---------- */
let vb = {x:0, y:0, w:W, h:H};
const minW = 7*S;
function clampVB(v){
  const ar = svg.clientHeight / Math.max(1, svg.clientWidth);
  v.w = Math.max(minW, Math.min(v.w, Math.max(W, H/ar)*1.02)); v.h = v.w*ar;
  const mx = v.w*.35, my = v.h*.35;
  v.x = Math.max(-mx, Math.min(v.x, W - v.w + mx));
  v.y = Math.max(-my, Math.min(v.y, H - v.h + my));
  return v;
}
function setVB(v){ vb = clampVB(v); svg.setAttribute("viewBox", `${vb.x.toFixed(1)} ${vb.y.toFixed(1)} ${vb.w.toFixed(1)} ${vb.h.toFixed(1)}`); layoutLabels(); orientSoon(); }
const scale = () => svg.clientWidth / vb.w; // screen px per svg unit
let anim = null;
function flyTo(target, ms=420){
  cancelAnimationFrame(anim);
  const from = {...vb}, to = clampVB({...target}), t0 = performance.now();
  if(matchMedia("(prefers-reduced-motion: reduce)").matches) ms = 0;
  const step = now => {
    const t = ms ? Math.min(1, (now-t0)/ms) : 1, e = t<.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2;
    setVB({x:from.x+(to.x-from.x)*e, y:from.y+(to.y-from.y)*e, w:from.w+(to.w-from.w)*e, h:from.h+(to.h-from.h)*e});
    if(t<1) anim = requestAnimationFrame(step);
  };
  anim = requestAnimationFrame(step);
}
const DRAWER = 410; // px the open details drawer covers on the right of the map (desktop)
const drawerPx = () => mapcard.classList.contains("open") && matchMedia("(min-width: 921px)").matches ? DRAWER : 0;
function fitBox(x0,y0,x1,y1, pad=.08){
  const cw = Math.max(1, svg.clientWidth), vis = Math.max(120, cw - drawerPx()), ar = svg.clientHeight / vis;
  let w = (x1-x0)*(1+2*pad), h = (y1-y0)*(1+2*pad);
  if(h/w > ar) w = h/ar;
  h = w*ar;
  const full = w * cw / vis; // the box fills the visible part; the drawer side is extra
  return {x:(x0+x1)/2 - w/2, y:(y0+y1)/2 - h/2, w:full, h};
}
// after a click on the map: if the vineyard ended up under the drawer, slide the map left
function ensureVisible(c){
  const dp = drawerPx(); if(!dp || !c.bb) return;
  const k = scale(), right = (c.bb[2] - vb.x) * k, limit = svg.clientWidth - dp - 20;
  if(right > limit) flyTo({...vb, x: vb.x + (right - limit) / k + Math.min(80, (c.bb[2]-c.bb[0])*k/2) / k}, 300);
}
const boxOfGrid = (x0,y0,x1,y1) => { const xs=[px(x0,y0),px(x1,y0),px(x0,y1),px(x1,y1)]; return [Math.min(...xs), py(y0), Math.max(...xs), py(y1)]; };
function zoomAt(f, cx, cy){ // cx/cy in svg units
  const w = vb.w*f; const k = w/vb.w;
  setVB({x: cx-(cx-vb.x)*k, y: cy-(cy-vb.y)*k, w, h: vb.h*k});
}
function clientToSvg(ex, ey){ const r = svg.getBoundingClientRect(); return [vb.x + (ex-r.left)/r.width*vb.w, vb.y + (ey-r.top)/r.height*vb.h]; }
svg.addEventListener("wheel", ev => {
  ev.preventDefault();
  const [cx,cy] = clientToSvg(ev.clientX, ev.clientY);
  zoomAt(Math.exp((ev.deltaMode===1 ? ev.deltaY*16 : ev.deltaY) * .0016), cx, cy);
}, {passive:false});
const ptrs = new Map(); let dragMoved = false, pinch0 = null, down0 = null;
svg.addEventListener("pointerdown", ev => {
  ptrs.set(ev.pointerId, [ev.clientX, ev.clientY]);
  if(ptrs.size===1){ dragMoved=false; down0=[ev.clientX, ev.clientY, vb.x, vb.y]; }
  if(ptrs.size===2){ const [a,b]=[...ptrs.values()]; pinch0={d:Math.hypot(a[0]-b[0],a[1]-b[1]), w:vb.w, c:clientToSvg((a[0]+b[0])/2,(a[1]+b[1])/2), ang:Math.atan2(b[1]-a[1], b[0]-a[0]), turn:0}; }
});
svg.addEventListener("pointermove", ev => {
  if(!ptrs.has(ev.pointerId)) return;
  ptrs.set(ev.pointerId, [ev.clientX, ev.clientY]);
  if(ptrs.size===2 && pinch0){
    const [a,b]=[...ptrs.values()], d=Math.hypot(a[0]-b[0],a[1]-b[1]);
    const w = pinch0.w * pinch0.d / Math.max(20,d), k = w/vb.w;
    const [cx,cy] = pinch0.c;
    setVB({x:cx-(cx-vb.x)*k, y:cy-(cy-vb.y)*k, w, h:vb.h*k}); dragMoved = true;
    // two-finger twist turns the surveyed map: shown live by turning the drawing, rebuilt upright when the fingers lift
    if(st.mode==="geo"){
      let t = (Math.atan2(b[1]-a[1], b[0]-a[0]) - pinch0.ang) * 180/Math.PI; t = ((t + 540) % 360) - 180;
      if(pinch0.turning || Math.abs(t) > 12){ pinch0.turning = true; pinch0.turn = t; gView.setAttribute("transform", `rotate(${t.toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)})`); }
    }
    return;
  }
  if(ptrs.size===1 && down0){
    const dx = ev.clientX-down0[0], dy = ev.clientY-down0[1];
    if(!dragMoved && Math.hypot(dx,dy) > 5){ dragMoved = true; svg.classList.add("dragging"); svg.setPointerCapture(ev.pointerId); hideTip(); }
    if(dragMoved){ const r = svg.getBoundingClientRect(); setVB({...vb, x:down0[2]-dx/r.width*vb.w, y:down0[3]-dy/r.height*vb.h}); }
  }
});
const up = ev => {
  ptrs.delete(ev.pointerId);
  if(ptrs.size<2 && pinch0){
    const p0 = pinch0; pinch0 = null;
    if(p0.turning){ gView.removeAttribute("transform"); rotateTo(st.rot + Math.round(p0.turn/5)*5); }
  }
  if(ptrs.size===0){ svg.classList.remove("dragging"); down0=null; setTimeout(()=>{ dragMoved=false; }, 0); }
};
svg.addEventListener("pointerup", up); svg.addEventListener("pointercancel", up);
svg.addEventListener("dblclick", ev => { const [cx,cy]=clientToSvg(ev.clientX, ev.clientY); flyTo({x:cx-vb.w/4, y:cy-vb.h/4, w:vb.w/2, h:vb.h/2}, 260); });
$("zIn").onclick = () => zoomAt(1/1.6, vb.x+vb.w/2, vb.y+vb.h/2);
$("zOut").onclick = () => zoomAt(1.6, vb.x+vb.w/2, vb.y+vb.h/2);
$("zAll").onclick = () => { st.vsel=null; syncCommunes(); flyTo(fitBox(...CONTENT, .01)); };
new ResizeObserver(() => setVB(vb)).observe(svg);

/* ---------- labels: constant screen size, shown only where they fit ---------- */
const measure = (() => { const cv=document.createElement("canvas").getContext("2d"); return (t,fs,wt) => { cv.font=`${wt} ${fs}px -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif`; return cv.measureText(t).width; }; })();
function layoutLabels(){
  const k = scale(); if(!isFinite(k) || !k) return;
  labEls.forEach(c => {
    const fs0 = c.c==="GC" ? 12 : c.c==="1er" ? 11 : 10.5, wt = c.c==="GC" ? 750 : 600;
    const bw = c.bw*k - 6, bh = c.bh*k - 2;
    let lines = null, fs = fs0;
    const sn = shortName(c.n), tries = [[c.n, fs0], [c.n, fs0-1.5]].concat(sn !== c.n ? [[sn, fs0-1.5]] : []);
    for(const [name, f] of tries){ lines = fitLines(name, f, wt, bw, bh); if(lines){ fs = f; break; } }
    const t = c.lel;
    if(!lines){ t.style.display = "none"; }
    else {
      t.style.display = "";
      t.setAttribute("font-size", (fs/k).toFixed(2));
      if(t._lines !== lines.join("|")){
        t.textContent = "";
        lines.forEach((ln,i) => { const ts = el("tspan", {x:c.cx.toFixed(1)}, t); ts.textContent = ln; ts.setAttribute("dy", i ? "1.1em" : (lines.length>1 ? "-.55em" : "0")); });
        t._lines = lines.join("|");
      }
    }
    const b = +c.dot.dataset.b || 0;
    if(b && st.color!=="cellar"){
      const r = Math.min(9, 3.5 + Math.sqrt(b)*1.6)/k;
      c.dot.setAttribute("r", r.toFixed(2));
      c.dot.setAttribute("stroke-width", (1.5/k).toFixed(2));
      const dx = Math.min(c.bw/2 - r*1.3, 9999), dy = Math.min(c.bh/2 - r*1.3, 9999);
      c.dot.setAttribute("cx", (c.cx + Math.max(0,dx)).toFixed(1)); c.dot.setAttribute("cy", (c.cy - Math.max(0,dy)).toFixed(1));
    } else c.dot.setAttribute("r", 0);
  });
  const overview = st.mode==="geo" ? k < .06 : k < .42;
  const sb = $("scalebar");
  if(sb){ sb.hidden = st.mode!=="geo";
    if(st.mode==="geo"){ const mpp = 1/(GS*k), want = 110*mpp, steps = [10,20,50,100,200,500,1000,2000,5000,10000];
      const m = steps.find(x => x >= want*.6) || 10000; sb.firstChild.style.width = (m/mpp).toFixed(0)+"px"; sb.lastChild.textContent = m>=1000 ? m/1000+" km" : m+" m"; } }
  ovEls.forEach(t => { t.setAttribute("font-size",(+t.dataset.fs/k).toFixed(2)); t.style.display = overview ? "" : "none"; });
  vlabEls.forEach(t => {
    const fs = Math.min(+t.dataset.fs, 6*S*k*.55); // never wider than the forest band
    t.setAttribute("font-size",(fs/k).toFixed(2));
    t.style.display = (!overview && fs >= 8 && +t.dataset.span*k > measure(t.textContent.toUpperCase(),fs,700)*1.3) ? "" : "none";
  });
  tlabEls.forEach(t => { const fs=+t.dataset.fs; t.setAttribute("font-size",(fs/k).toFixed(2)); t.style.display = k>0.45 ? "" : "none"; });
  rlabEls.forEach(t => { const fs=+t.dataset.fs; t.setAttribute("font-size",(fs/k).toFixed(2)); t.style.display = k>0.55 ? "" : "none"; });
  svg.querySelectorAll(".cl").forEach(p => p.setAttribute("stroke-width", ((p.classList.contains("sel")?2.6:1)/k).toFixed(2)));
  svg.querySelectorAll("[data-w]").forEach(e => e.setAttribute("stroke-width", (+e.dataset.w/k).toFixed(2)));
  svg.querySelectorAll("[data-r]").forEach(e => e.setAttribute("r", (+e.dataset.r/k).toFixed(2)));
  svg.querySelectorAll(".lmx").forEach(e => { const c=e.previousSibling; const cx=+c.getAttribute("cx"), cy=+c.getAttribute("cy"), q=1/k; e.setAttribute("d",`M${cx-2.4*q} ${cy-.6*q}h${4.8*q}M${cx} ${cy-3*q}v${5.2*q}`); });
  svg.querySelectorAll(".chcross").forEach(e => { if(!e._d) e._d = e.getAttribute("d").match(/-?[\d.]+/g).map(Number); const [x,y]=[e._d[0]+3, e._d[1]], q=1/k; e.setAttribute("d",`M${x-3*q} ${y}h${6*q}M${x} ${y-4*q}v${8*q}`); });
  lmEls.forEach(t => { t.setAttribute("font-size",(+t.dataset.fs/k).toFixed(2)); t.style.display = k>1.1 ? "" : "none"; });
  svg.classList.toggle("near", k>0.9); svg.classList.toggle("far", k<0.5);
  topoLod(k);
  svg.querySelectorAll(".base").forEach(p => { p.setAttribute("stroke-width",(1/k).toFixed(2)); p.setAttribute("stroke-dasharray",`${(3/k).toFixed(2)} ${(3/k).toFixed(2)}`); });
  svg.querySelectorAll(".mono").forEach(p => { p.setAttribute("stroke-width",(1.3/k).toFixed(2)); p.setAttribute("stroke-dasharray",`${(4/k).toFixed(2)} ${(3/k).toFixed(2)}`); });
}

// a shorter form for tight spots: Saint → St, the Chambertin/Montrachet suffix of the grands crus abbreviated
const shortName = n => n.replace(/\bSainte-/g, "Ste-").replace(/\bSaint-/g, "St-").replace(/-Chambertin$/, "-Ch.").replace(/-Montrachet$/, "-Mont.").replace(/^Corton /, "C. ");
const BREAKS = new Map();
function breaksOf(name){ // indexes where a line may break: after a space or a hyphen
  if(!BREAKS.has(name)){ const b=[]; for(let i=1;i<name.length;i++) if(name[i-1]===" "||name[i-1]==="-") b.push(i); BREAKS.set(name,b); }
  return BREAKS.get(name);
}
function fitLines(name, fs, wt, bw, bh){
  if(bh < fs+1) return null;
  if(measure(name,fs,wt) <= bw) return [name];
  if(bh < 2*fs+3) return null;
  let best = null;
  for(const i of breaksOf(name)){
    const a = name.slice(0,i).trim(), b = name.slice(i).trim(), w = Math.max(measure(a,fs,wt), measure(b,fs,wt));
    if(!best || w < best[0]) best = [w,a,b];
  }
  return best && best[0] <= bw ? [best[1], best[2]] : null;
}

/* ---------- tooltip ---------- */
const tipEl = $("tip");
function tip(ev, html){
  if(dragMoved || ev.pointerType==="touch") return;
  tipEl.innerHTML = html; tipEl.style.opacity = 1;
  const r = tipEl.getBoundingClientRect();
  let x = ev.clientX+14, y = ev.clientY+14;
  if(x + r.width > innerWidth-8) x = ev.clientX - r.width - 14;
  if(y + r.height > innerHeight-8) y = ev.clientY - r.height - 14;
  tipEl.style.left = x+"px"; tipEl.style.top = y+"px";
}
function hideTip(){ tipEl.style.opacity = 0; }

/* ---------- selection ---------- */
function focusClimat(c){
  const box = c.bb || c.vil.bb; if(!box) return;
  const [x0,y0,x1,y1] = box;
  // don't zoom in absurdly far on a tiny climat — show it with its neighbours
  const cx=(x0+x1)/2, cy=(y0+y1)/2, half=Math.max((x1-x0), (y1-y0), 9*S)/2*1.6;
  flyTo(fitBox(cx-half, cy-half, cx+half, cy+half, 0));
}
function select(id, fly){
  st.sel = id; st.vsel = null; st.overview = false; st.coteView = null;
  const c = CL[id];
  renderSide(); paint(); syncHash(); syncCommunes();
  if(fly) focusClimat(c); else ensureVisible(c);
}
function selectVillage(id, fly){
  st.vsel = id; st.sel = null; st.overview = false; st.coteView = null;
  renderSide();
  const v = VIL[id];
  if(fly){
    const ext = id==="flagey" ? -3.5 : 0, ext2 = id==="chambolle" ? 6.5 : 0;
    if(v.bb) flyTo(fitBox(...v.bb, .03));
  }
  paint(); syncHash(); syncCommunes();
}

/* ---------- side panel: a drawer over the map (desktop) or a panel below it (phones) ---------- */
const side = $("side"), mapcard = $("mapcard");
function placeSide(){
  const phone = matchMedia("(max-width: 920px)").matches;
  if(phone && side.parentNode===mapcard) mapcard.after(side);
  else if(!phone && side.parentNode!==mapcard) mapcard.appendChild(side);
}
matchMedia("(max-width: 920px)").addEventListener("change", () => { placeSide(); setVB(vb); });
function setOpen(){
  const open = !!(st.sel || st.vsel || st.prod || st.overview);
  mapcard.classList.toggle("open", open); side.classList.toggle("open", open);
  if(open) $("hint").classList.add("gone");
  placeSide();
  return open;
}
function appellation(c){
  const vn = c.v==="flagey" || c.geo==="flagey" ? "Vosne-Romanée" : c.vil.id==="premeaux" ? "Nuits-Saint-Georges" : c.vil.id==="cdnv" ? "Côte de Nuits-Villages" : c.vil.n;
  if(c.ap) return c.c==="1er" ? `${c.ap} 1er Cru « ${c.n} »` : `${c.ap} « ${c.n} »`;
  if(c.c==="GC") return c.inner ? `${CL[c.in].n} (grand cru)` : `${c.n} Grand Cru`;
  if(c.c==="1er") return `${vn} 1er Cru « ${c.n} »`;
  return `${vn} « ${c.n} »`;
}
function ownersHtml(c){
  const rows = [...(c.p||[])].sort((a,b) => (a[2]==="s")-(b[2]==="s") || (b[1]??-1)-(a[1]??-1));
  if(!rows.length) return `<p class="note">${t("No ownership details on file for this climat.")}</p>`;
  const seg = rows.filter(r=>r[1] && r[2]!=="s").map(([k,h],i) => `<span title="${esc(P[k])} · ${fmtHa(h)} ha" style="width:${(100*h/c.ha).toFixed(2)}%;background:${mix(TOK.seq1, TOK.seq0, (i%6)/7)}"></span>`).join("");
  const known = c.known, rest = Math.max(0, c.ha - known);
  const body = rows.map(([k,h,kind,since]) => {
    const share = h && kind!=="s" ? 100*h/c.ha : null, ed = c.edited[k];
    return `<tr><td><button class="plink${st.prod===k?" on":""}" data-p="${k}">${esc(P[k])}</button>${ed?` <span class="ktag ed" title="${esc([ed.note, ed.time, ed.user].filter(Boolean).join(" · "))}">${t("✎ corrected")}</span>`:""}${EDITS.can?` <button class="edbtn" data-ed="${k}" title="${t("Correct this holding")}">✎</button>`:""}${kind||since?` <span class="ktag ${kind}">${[KIND[kind],since&&t("since {0}", since)].filter(Boolean).join(" · ")}</span>`:""}${share!=null?`<span class="pb" style="width:${Math.max(2,share).toFixed(1)}%"></span>`:""}</td>
      <td class="n">${kind==="s"?"":h!=null?`<b>${fmtHa(h)}</b> ha`:t("holder")}</td><td class="n">${share!=null?(share<1?share.toFixed(1):Math.round(share))+"%":""}</td></tr>`;
  }).join("");
  const cover = c.mono ? `<p class="note">${t("Monopole — the whole climat belongs to {0}.", esc(P[c.mono]))}</p>`
    : known >= c.ha*.98 ? `<p class="note">${t("The owners listed cover essentially the whole climat (published figures are rounded).")}</p>`
    : known ? `<p class="note">${t("Owners with a published figure account for {0} of {1} ha ({2}%); the other {3} ha belongs to {4}smaller growers.", fmtHa(known), fmtHa(c.ha), Math.round(100*known/c.ha), fmtHa(rest), rows.some(r=>r[1]==null) ? t("the holders listed without a figure and ") : "")}</p>`
    : `<p class="note">${t("Notable owners; individual holdings not listed.")}</p>`;
  return `${known?`<div class="sharebar" aria-hidden="true">${seg}</div>`:""}${cover}<table class="own">${body}</table>`;
}
function cellarHtml(list){
  if(!list || !list.length) return "";
  return `<h3>${t("In your cellar")}</h3>` + list.slice(0,12).map(w => `<div class="cw"><span class="b">${w.left}×</span> ${esc(w.producer)} · ${esc(w.name||"")} ${esc(String(w.vintage||""))}</div>`).join("")
    + (list.length>12 ? `<p class="note">${t("+ {0} more", list.length-12)}</p>` : "");
}
function renderSide(){
  const close = `<button class="close" id="sideClose" aria-label="${t("Close")}">×</button>`;
  if(!setOpen()){ side.innerHTML = ""; renderPeek(); return; }
  if(st.sel){
    const c = CL[st.sel];
    side.innerHTML = `${close}<div class="pills"><span class="pill ${c.c==="1er"?"p1er":c.c}">${CLASS_NAME[c.c]}</span>${c.mono?`<span class="pill mono">${t("Monopole")}</span>`:""}${c.x ? "" : `<span class="pill">${COL_NAME[c.col]||"Red"}</span>`}</div>
      <h2>${esc(c.n)}</h2>
      <div class="meta">${esc(appellation(c))} · <button class="plink" data-v="${c.vil.id}">${esc(c.vil.n)}</button></div>
      <div class="facts">
        <div class="fact"><div class="l">${t(c.x ? "Area (INAO)" : "Area")}</div><div class="v">${fmtHa(c.ha)} ha</div></div>
        ${c.x ? `<div class="fact"><div class="l">${t("Acres")}</div><div class="v">${(c.ha*2.471).toFixed(c.ha<4?1:0)}</div></div>` : surveyHa(c) ? `<div class="fact" title="${t("The land INAO delimits for this appellation, planted or not, measured from its parcel plan")}"><div class="l">${t("INAO area")}</div><div class="v">${fmtHa(surveyHa(c))} ha</div></div>`
          : `<div class="fact"><div class="l">${t("Acres")}</div><div class="v">${(c.ha*2.471).toFixed(c.ha<4?1:0)}</div></div>`}
        <div class="fact"><div class="l">${t("Owners")}</div><div class="v">${c.mono?"1":(c.p||[]).length||"—"}</div></div>
      </div>
      ${c.x ? "" : areaNote(c)}
      <p>${c.x ? `${t(c.c==="GC" ? "One of {0}'s grand cru climats on INAO's plan" : "One of {0}'s premiers crus on INAO's plan", esc(c.ap || c.vil.n))}${c.in && CL[c.in] && !CL[c.in].x ? t(", lying within {0}", `<button class="plink" data-c="${c.in}">${esc(CL[c.in].n)}</button>`) : ""}. ${t("The atlas has no notes on it yet; holdings can be added below.")}` : esc(txC(c))}</p>
      ${st.mode==="geo" && GEO && (GEO.meta.approx||[]).includes(c.id) ? `<p class="note">${t("INAO maps Charmes and Mazoyères as one area (Mazoyères may be sold as Charmes); the line between them here is an estimate.")}</p>` : ""}
      ${detailHtml(c)}
      ${VT ? vintageYearHtml(catOf(c), c.v) + vintageChart(catOf(c), c.v) : ""}
      ${c.inner && !c.x?`<p class="note">${t("An enclave inside {0}.", `<button class="plink" data-c="${c.in}">${esc(CL[c.in].n)}</button>`)}</p>`:""}
      ${C.some(x=>x.in===c.id)?`<p class="note">${t("Contains {0}.", C.filter(x=>x.in===c.id).map(x=>`<button class="plink" data-c="${x.id}">${esc(x.n)}</button>`).join(", "))}</p>`:""}
      <h3>${t(c.mono ? "Holdings" : "Holdings · click a name to map their vineyards")}</h3>
      ${ownersHtml(c)}
      ${removedHtml(c)}
      ${editHtml(c)}
      ${cellarHtml(CELLAR.by[c.id]?.wines)}`;
  } else if(st.prod){
    const r = PROD[st.prod], pf = r.prof || {};
    const ORD = {GC:0,"1er":1,V:2};
    const hold = [...r.hold].sort((a,b) => (a.kind==="s")-(b.kind==="s") || ORD[a.c.c]-ORD[b.c.c] || (b.ha??-1)-(a.ha??-1));
    const host = s => { try{ return new URL(s).hostname.replace(/^www\./,""); }catch(e){ return s; } };
    const pk = txP(r.key, pf, "kind"), psz = txP(r.key, pf, "size"), pnote = txP(r.key, pf, "note"), pextra = LX()?.profiles?.[r.key]?.extra;
    side.innerHTML = `${close}<div class="pills"><span class="pill">${esc(pk || t("Producer"))}</span>${pf.base?`<span class="pill">${esc(pf.base)}</span>`:""}</div><h2>${esc(r.name)}</h2>
      ${psz?`<div class="meta">${t("{0} in all", esc(psz))}</div>`:""}
      <div class="facts">
        <div class="fact"><div class="l">${t("Ha on map")}</div><div class="v">${fmtHa(r.ha)}</div></div>
        <div class="fact"><div class="l">${t("Climats")}</div><div class="v">${r.n}</div></div>
        <div class="fact"><div class="l">${t("Grands crus")}</div><div class="v">${r.gc}</div></div>
      </div>
      ${pnote?`<p>${esc(pnote)}</p>`:""}
      <p class="note">${t("Highlighted on the map by share of each climat · hatched = holder, size not published · dotted gold = buys grapes there.")}</p>
      <h3>${t("Holdings on the map")}</h3>
      <table class="own">${hold.map(({c,ha,kind,since}) => `<tr><td><span class="cls" style="background:${{GC:TOK.gc,"1er":TOK.pc,V:TOK.vc}[c.c]}"></span><button class="plink" data-c="${c.id}">${esc(c.n)}</button>${kind||since?` <span class="ktag ${kind}">${[KIND[kind],since&&t("since {0}", since)].filter(Boolean).join(" · ")}</span>`:""}
        <div class="note" style="margin:0">${esc(c.vil.n)}${c.mono?" · monopole":""}</div></td>
        <td class="n">${kind==="s"?"":ha!=null?`<b>${fmtHa(ha)}</b> ha`:t("holder")}</td><td class="n">${ha!=null&&kind!=="s"?Math.round(100*ha/c.ha)+"%":""}</td></tr>`).join("")}</table>
      ${(pf.extra||[]).length?`<h3>${t("Not on this map")}</h3><table class="own">${pf.extra.map(([n,h,kind],i)=>`<tr><td>${esc((pextra||[])[i] || n)}${kind?` <span class="ktag ${kind}">${KIND[kind]}</span>`:""}</td><td class="n">${h!=null?`<b>${fmtHa(h)}</b> ha`:""}</td></tr>`).join("")}</table>`:""}
      ${(pf.src||[]).length?`<h3>${t("Sources")}</h3><p class="note">${pf.src.map(u=>`<a href="${esc(u)}" target="_blank" rel="noopener">${esc(host(u))}</a>`).join(" · ")}</p>`:""}
      <p style="margin-top:12px"><button class="btn" id="clearProd">${t("Clear producer")}</button></p>`;
  } else if(st.vsel){
    const v = VIL[st.vsel];
    const mine = C.filter(c => c.v===v.id && !c.inner);
    const gc = mine.filter(c=>c.c==="GC" && !c.x), pc = mine.filter(c=>c.c==="1er" && !c.x), more = C.filter(c => c.v===v.id && c.x).sort((a,b) => a.n.localeCompare(b.n, "fr"));
    const holders = {}; mine.forEach(c => (c.p||[]).forEach(([k,h]) => { holders[k]=(holders[k]||0)+(h||0); }));
    const top = Object.entries(holders).filter(([,h])=>h>0).sort((a,b)=>b[1]-a[1]).slice(0,8);
    const list = arr => arr.map(c => `<button data-c="${c.id}">${esc(c.n)}${c.mono?" ◌":""}</button>`).join("");
    const vb2 = CELLAR.village[v.id];
    side.innerHTML = `${close}<div class="pills"><span class="pill">${t("Commune")}</span></div><h2>${esc(v.n)}</h2>
      <div class="meta">${esc(txV(v, "aoc"))}</div><p>${esc(txV(v, "note"))}</p>
      ${gc.length?`<h3>${t("Grands crus")}</h3><div class="qp">${list(gc)}</div>`:""}
      ${pc.length?`<h3>${t("Premiers crus on the map")}</h3><div class="qp">${list(pc)}</div>`:""}
      ${more.length?`<h3>${t("Also on INAO's plan ({0})", more.length)}</h3><div class="qp small">${list(more)}</div>`:""}
      ${VT ? vintageYearHtml(v.cote==="nuits" ? "nuits_red" : "beaune_red", v.id) + vintageChart(v.cote==="nuits" ? "nuits_red" : "beaune_red", v.id) + (v.cote==="beaune" ? vintageChart("beaune_white", null) : "") : ""}
      ${top.length?`<h3>${t("Largest listed holders here")}</h3><table class="own">${top.map(([k,h])=>`<tr><td><button class="plink" data-p="${k}">${esc(P[k])}</button></td><td class="n"><b>${fmtHa(h)}</b> ha</td></tr>`).join("")}</table>`:""}
      ${vb2?`<h3>${t("In your cellar")}</h3><p class="note">${t("{0} bottles of {1} without a named climat, plus whatever's matched to the vineyards above.", vb2.left, esc(v.n))}</p>`:""}`;
  } else {
    const gc = new Set(C.filter(c=>c.c==="GC"&&!c.inner).map(c=>c.grp||c.id)).size, pc = C.filter(c=>c.c==="1er"&&!c.inner).length, mono = C.filter(c=>c.mono).length;
    const picks = ["romaneeconti","latache","richebourg","chambertin","musigny","closvougeot","closstjacques","amoureuses","crosparantoux",
      "montrachet","chevalier","cortoncharlemagne","perrieres_meursault","closdesducs","epeneaux"].filter(id=>CL[id]);
    side.innerHTML = `${close}<div class="pills"><span class="pill">Côte d'Or</span></div><h2>${t("From Marsannay to Maranges")}</h2>
      <div class="facts">
        <div class="fact"><div class="l">${t("Grand cru AOCs")}</div><div class="v">${gc}</div></div>
        <div class="fact"><div class="l">${t("1ers on map")}</div><div class="v">${pc}</div></div>
        <div class="fact"><div class="l">${t("Monopoles")}</div><div class="v">${mono}</div></div>
      </div>
      <p>${t("The Côte d'Or is one east-facing escarpment some 50 km long: the Côte de Nuits in the north, almost all red, then from Corton the Côte de Beaune, where Chardonnay takes over south of Volnay. The best sites sit mid-slope, around 250–300 m, on limestone and marl — grands crus in the middle band, premiers crus just above and below, village wine toward the D974, regional Bourgogne on the flat.")}</p>
      <h3>${t("Start with")}</h3><div class="qp">${picks.map(id=>`<button data-c="${id}">${esc(CL[id].n)}</button>`).join("")}</div>`;
  }
  side.querySelectorAll("[data-c]").forEach(b => b.onclick = ev => { ev.stopPropagation(); select(b.dataset.c, true); });
  side.querySelectorAll("[data-vy]").forEach(b => b.onclick = ev => { ev.stopPropagation(); showVintage(b.dataset.vy); });
  side.querySelectorAll("[data-p]").forEach(b => b.onclick = () => setProducer(b.dataset.p, true));
  side.querySelectorAll("[data-v]").forEach(b => b.onclick = () => selectVillage(b.dataset.v, true));
  const cl = $("sideClose"); if(cl) cl.onclick = () => { st.sel=null; st.vsel=null; st.overview=false; if(st.prod) setProducer(null); else { renderSide(); paint(); syncHash(); syncCommunes(); } };
  const cp = $("clearProd"); if(cp) cp.onclick = () => setProducer(null);
  if(st.sel) wireEdit(CL[st.sel]);
  renderPeek();
}
function renderProdChip(){
  const pc = $("prodChip"); pc.hidden = !st.prod;
  if(st.prod) pc.textContent = P[st.prod] + "  ×";
}
function setProducer(key, showPanel){
  st.prod = key; st.overview = false;
  renderProdChip();
  if(key){ st.color = "producer"; $("fColor").value = "producer"; if(showPanel){ st.sel=null; st.vsel=null; } }
  else if(st.color==="producer"){ st.color="class"; $("fColor").value="class"; }
  renderSide(); paint(); syncHash();
  if(key && showPanel){
    const b = prodBox(key); if(b) flyTo(fitBox(...b, .08));
  }
}

/* ---------- legend ---------- */
function renderLegend(){
  const L = $("legend"); let h = "";
  const shown = C.filter(c => c.on).length;
  const sw = (c,t,extra="") => `<div class="row"><span class="sw ${extra}" style="background:${c}"></span>${t}</div>`;
  const ramp = (a,b,l,r) => `<div class="ramp" style="background:linear-gradient(90deg,${a},${b})"></div><div class="rl"><span>${l}</span><span>${r}</span></div>`;
  switch(st.color){
    case "commune": h = `<div class="lt">${t("Commune · darker = higher class")}</div>` + V.filter(v=>C.some(c=>c.v===v.id)).map(v => sw(communeColor({vil:v,c:"1er"}), esc(v.n))).join(""); break;
    case "vintage": {
      const yrs = [...new Set(VCATS.flatMap(vYears))].sort((a, b) => a - b), i = yrs.indexOf(st.vy);
      const kinds = new Set(vEvents(null, st.vy).map(e => evtKind(e.t)));
      h = `<div class="lt vyear"><button type="button" data-vstep="-1" ${i<=0?"disabled":""} aria-label="${t("Earlier vintage")}">◀</button><b>${st.vy}</b><button type="button" data-vstep="1" ${i>=yrs.length-1?"disabled":""} aria-label="${t("Later vintage")}">▶</button></div>`
        + `<div class="lt">${t("Vintage rating, by Côte and colour")}</div>` + ramp(scoreFill(70), scoreFill(100), "≤70", "100")
        + (kinds.has("frost") ? `<div class="row"><span class="sw" style="background:repeating-linear-gradient(45deg,${EVT.frost[0]} 0 2px,transparent 2px 5px)"></span>${t("Frost hit this commune")}</div>` : "")
        + (kinds.has("hail") ? `<div class="row"><span class="sw" style="background:radial-gradient(circle,${EVT.hail[0]} 35%,transparent 40%);background-size:5px 5px"></span>${t("Hail hit this commune")}</div>` : "")
        + sw(TOK.none, t("not rated"));
      break; }
    case "alt": h = `<div class="lt">${t("Mean altitude (measured)")}</div>` + ramp(TOK.seq0, TOK.seq1, `${ALT0} m`, `${ALT1} m`) + sw(TOK.none, t("no data")); break;
    case "slope": h = `<div class="lt">${t("Mean slope (measured)")}</div>` + ramp(TOK.seq0, TOK.seq1, "0 %", `${SLOPE1}+ %`) + sw(TOK.none, t("no data")); break;
    case "size": h = `<div class="lt">${t("Climat size")}</div>` + ramp(TOK.seq0, TOK.seq1, "<1 ha", `${Math.round(maxHa)} ha`); break;
    case "owners": h = `<div class="lt">${t("Owners listed here")}</div>` + ramp(TOK.seq0, TOK.seq1, t("1 (monopole)"), `${maxOwners}+`) + sw(TOK.none,t("no details")); break;
    case "producer":
      h = st.prod ? `<div class="lt">${t("{0} · share of each climat", esc(P[st.prod]))}</div>` + ramp(mix(TOK.seq0,TOK.seq1,.3), TOK.seq1, t("small"), "100%")
          + sw("url(#unk)",t("holder, size not listed")).replace('style="background:url(#unk)"', `style="background:repeating-linear-gradient(45deg,${mix(TOK.seq0,TOK.seq1,.35)} 0 3px,${mix(TOK.seq0,TOK.seq1,.6)} 3px 6px)"`)
          + `<div class="row"><span class="sw" style="background:radial-gradient(circle,${TOK.gold} 30%,${mix(TOK.seq0,TOK.gold,.25)} 34%);background-size:7px 7px"></span>${t("buys grapes here")}</div>`
          + sw(TOK.none, t("not held"))
        : `<div class="lt">${t("Producer's share")}</div><div>${t("Pick a producer in the box above, or click a name in a vineyard's holdings.")}</div>`;
      break;
    case "cellar":
      h = CELLAR.loaded ? `<div class="lt">${t("Bottles in your cellar")}</div>` + ramp(mix(TOK.seq0,TOK.gold,.4), TOK.gold, "1", t("many")) + sw(TOK.none,t("none"))
        : `<div class="lt">${t("My cellar")}</div><div>${esc(t(CELLAR.msg, ...(CELLAR.args||[])))}</div>`; break;
    default:
      h = `<div class="lt">${t("Classification")}</div>` + sw(TOK.gc,t("Grand cru")) + sw(TOK.pc,t("Premier cru")) + sw(TOK.vc,t("Village climat")) + sw(TOK.base,t("Village AOC"))
        + `<div class="row"><span class="sw mono-sw"></span>${t("Monopole")}</div>`
        + `<div class="row"><span class="sw" style="background:none;border:2.5px solid var(--wall)"></span>${t("Walled clos")}</div>`;
  }
  if(shown < C.length) h += `<div class="cnt">${t("{0} of {1} vineyards match", shown, C.length)}</div>`;
  L.innerHTML = h;
  L.querySelectorAll("[data-vstep]").forEach(b => b.onclick = ev => { ev.stopPropagation(); stepVintage(+b.dataset.vstep); });
}

/* ---------- table ---------- */
const CORD = {GC:0,"1er":1,V:2};
function ownText(c){ return c.mono ? t("Monopole · {0}", P[c.mono]) : (c.p||[]).length ? t("{0} listed", c.p.length) : "—"; }
function renderList(){
  const rows = C.filter(c => c.on);
  const k = st.sortK, d = st.sortDir;
  rows.sort((a,b) => {
    let r = 0;
    if(k==="n") r = a.n.localeCompare(b.n, "fr");
    else if(k==="v") r = (a.vil.idx-b.vil.idx) || (CORD[a.c]-CORD[b.c]) || (b.ha-a.ha);
    else if(k==="c") r = (CORD[a.c]-CORD[b.c]) || (b.ha-a.ha);
    else if(k==="ha") r = a.ha-b.ha;
    else if(k==="own") r = (a.mono?1:(a.p||[]).length) - (b.mono?1:(b.p||[]).length);
    return r*d;
  });
  $("listCount").textContent = rows.length===C.length ? `(${C.length})` : `(${rows.length} of ${C.length})`;
  const tb = $("list").tBodies[0];
  tb.innerHTML = rows.map(c => `<tr data-c="${c.id}" class="${st.sel===c.id?"sel":""}"><td><span class="cls" style="background:${{GC:TOK.gc,"1er":TOK.pc,V:TOK.vc}[c.c]}"></span>${esc(c.n)}${CELLAR.by[c.id]?` <span title="${t("in your cellar")}" style="color:var(--gold)">●</span>`:""}</td>
    <td>${esc(c.vil.n)}</td><td>${c.c==="V"?t("Village"):c.c}</td><td class="num">${fmtHa(c.ha)}</td><td>${esc(ownText(c))}</td></tr>`).join("");
  tb.querySelectorAll("tr").forEach(tr => tr.onclick = () => { select(tr.dataset.c, true); $("mapcard").scrollIntoView({behavior:"smooth", block:"nearest"}); });
}
$("list").tHead.querySelectorAll("th").forEach(th => th.onclick = () => {
  const k = th.dataset.k; if(st.sortK===k) st.sortDir*=-1; else { st.sortK=k; st.sortDir = k==="ha"||k==="own" ? -1 : 1; }
  renderList();
});

/* ---------- the Vosne domaines ---------- */
function renderDomains(){
  const box = $("domains"); if(!box) return;
  const tab = st.dtab || "all";
  const TABS = {
    all:{area:null, n:""},
    vosne:{area:["vosne","flagey","nuits","premeaux"], n:"Vosne–Nuits"},
    north:{area:["marsannay","fixin","brochon","gevrey","morey","chambolle","vougeot"], n:"Gevrey–Vougeot"},
    beaune:{area:V.filter(v=>v.cote==="beaune").map(v=>v.id), n:"Côte de Beaune"},
  }, T = TABS[tab] || TABS.all;
  const AREA = T.area && new Set(T.area), AREA_N = T.n, q = norm($("dSearch").value || ""), sort = $("dSort").value;
  document.querySelectorAll("#dtabs button").forEach(b => b.classList.toggle("on", b.dataset.t===tab));
  // every producer with something on the map, profiled or not
  const all = Object.values(PROD).filter(r => r.hold.length).map(r => {
    const vh = AREA ? r.hold.filter(h => AREA.has(h.c.geo||h.c.v) || AREA.has(h.c.v)) : r.hold;
    const own = vh.filter(h=>h.kind!=="s"), gcs = own.filter(h => h.c.c==="GC");
    const vha = own.reduce((s,h)=>s+(h.ha||0),0), unknown = own.some(h=>h.ha==null);
    return {r, vh, own, gcs, vha, unknown, src:vh.filter(h=>h.kind==="s")};
  });
  const list = all.filter(x => x.vh.length && (!q || norm(x.r.name).includes(q))).sort((a,b) =>
    sort==="az" ? a.r.name.localeCompare(b.r.name, "fr")
    : sort==="gc" ? b.gcs.length - a.gcs.length || b.vha - a.vha
    : sort==="n" ? b.own.length - a.own.length || b.vha - a.vha
    : (b.vha + .4*b.own.length) - (a.vha + .4*a.own.length)); // parcels of unpublished size still count for something
  $("dCount").textContent = t("{0} of {1} producers", list.length, all.length);
  if(!list.length){ box.innerHTML = `<p class="ph">${t("No producer matches.")}</p>`; return; }
  box.innerHTML = list.map(({r,own,gcs,vha,unknown,src}) => {
    const top = [...own].sort((a,b)=>({GC:0,"1er":1,V:2}[a.c.c]-{GC:0,"1er":1,V:2}[b.c.c])||(b.ha??-1)-(a.ha??-1)).slice(0,4);
    const monos = r.hold.filter(h=>h.c.mono===r.key && !h.c.inner).map(h=>h.c.n);
    return `<button class="dcard${st.prod===r.key?" on":""}" data-p="${r.key}">
      <span class="dn">${esc(r.name)}</span>
      ${r.prof ? `<span class="dm">${[txP(r.key, r.prof, "kind"), txP(r.key, r.prof, "size")].filter(Boolean).map(esc).join(" · ")}</span>` : ""}
      ${own.length ? `<span class="dk"><b>${unknown?"≥ ":""}${fmtHa(vha)}</b> ha · ${own.length} ${t(own.length===1?"climat":"climats")} · <b>${gcs.length}</b> ${t(gcs.length===1?"grand cru":"grands crus")}</span>` : ""}
      ${src.length ? `<span class="dk">${t("Buys grapes from {0} climats: {1}", `<b>${src.length}</b>`, src.map(h=>esc(h.c.n)).join(", "))}</span>` : ""}
      ${monos.length?`<span class="dmono">${t("Monopole: {0}", monos.map(esc).join(", "))}</span>`:""}
      <span class="dl">${top.map(h=>`<i class="c${h.c.c==="1er"?"P":h.c.c}"></i>${esc(h.c.n)}${h.ha?` ${fmtHa(h.ha)}`:""}`).join("<br>")}</span>
    </button>`;
  }).join("");
  box.querySelectorAll("[data-p]").forEach(b => b.onclick = () => { setProducer(st.prod===b.dataset.p ? null : b.dataset.p, true); $("mapcard").scrollIntoView({behavior:"smooth", block:"nearest"}); });
}

/* ---------- the vintage table (explore tab) ---------- */
function renderVintages(){
  const box = $("vintages"); if(!box || !VT) return;
  const yrs = Object.keys(VT.years).map(Number).filter(y => VCATS.some(k => vRating(k, y))).sort((a, b) => b - a);
  const cell = (k, y) => { const v = vRating(k, y); return v ? `<td class="vsc" style="background:${scoreFill(v[0])};color:${inkOn(scoreFill(v[0]))}" title="${esc(v[2] || "")}${v[1] ? " (" + t("estimate") + ")" : ""}">${v[0]}${v[1] ? "*" : ""}</td>` : `<td class="vsc">—</td>`; };
  const an = y => { const w = VT.years[y].wx && VT.years[y].wx.dijon; if(!w || w.anom == null) return `<td>—</td>`;
    const a = Math.max(-2, Math.min(2, w.anom)), col = a >= 0 ? mix(TOK.card, "#D9534F", a/2) : mix(TOK.card, "#3F7CB6", -a/2);
    return `<td class="n" style="background:${col}">${w.anom > 0 ? "+" : ""}${w.anom}</td>`; };
  box.innerHTML = `<table class="list vtab"><thead><tr><th>${t("Vintage")}</th>${VCATS.map(k => `<th class="n">${t(VCAT_EN[k])}</th>`).join("")}<th>${t("Harvest")}</th><th class="n" title="${t("Apr–Sep mean temperature at Dijon-Longvic vs 1991–2020")}">${t("Season °C")}</th><th class="n">${t("Rain mm")}</th><th>${t("Events")}</th><th>${t("Character")}</th></tr></thead><tbody>`
    + yrs.map(y => { const Y = VT.years[y], w = (Y.wx && Y.wx.dijon) || {}, evs = vEvents(null, y);
      const kinds = [...new Set(evs.map(e => evtKind(e.t)))];
      const note = (vRating("nuits_red", y) || vRating("beaune_red", y) || vRating("beaune_white", y) || [])[2] || "";
      return `<tr data-vy="${y}" class="${st.color==="vintage" && st.vy===y ? "sel" : ""}"><td><b>${y}</b></td>${VCATS.map(k => cell(k, y)).join("")}<td>${Y.harvest ? Y.harvest.slice(5).split("-").reverse().join("/") : "—"}</td>${an(y)}<td class="n">${w.rain ?? "—"}</td>
        <td>${kinds.map(k => `<i class="evdot" style="background:${EVT[k][0]}" title="${esc(evs.filter(e => evtKind(e.t)===k).map(e => `${e.d}: ${e.a.join(", ")}${e.s ? " — " + e.s : ""}`).join("\n"))}"></i>${t(EVT[k][1])}`).join(" ")}</td><td class="vnote">${esc(note)}</td></tr>`; }).join("")
    + `</tbody></table><p class="note">${t("Ratings are AllWine's consensus of published vintage charts on a 100-point scale (* = estimate, fewer sources); hover a score for its note. Weather: Météo-France, Dijon-Longvic.")}</p>`;
  box.querySelectorAll("tr[data-vy]").forEach(tr => tr.onclick = () => { showVintage(tr.dataset.vy); $("mapcard").scrollIntoView({behavior:"smooth", block:"nearest"}); });
}

/* ---------- vineyard detail ---------- */
/* vintage chart: one bar per rated year for a climat's (or commune's) Côte and colour, with frost/hail/heat marks */
function vintageChart(cat, vid){
  const ys = vYears(cat); if(!ys.length) return "";
  const W2 = 360, H2 = 96, top = 14, bw = W2 / ys.length;
  let g = "";
  ys.forEach((y, i) => {
    const [sc, est, note] = vRating(cat, y), hh = Math.max(3, (sc - 60) / 40 * (H2 - top - 12)), x = i * bw;
    const evs = vid ? vEvents(vid, y) : [];
    const tip = `${y}: ${sc}${est ? " (" + t("estimate") + ")" : ""}${note ? " — " + note : ""}${evs.length ? " · " + evs.map(e => t(EVT[evtKind(e.t)][1])).join(", ") : ""}`;
    g += `<g class="vbar${y===st.vy && st.color==="vintage" ? " on" : ""}" data-vy="${y}"><title>${esc(tip)}</title><rect x="${(x+.5).toFixed(1)}" y="${(H2-12-hh).toFixed(1)}" width="${Math.max(1, bw-1).toFixed(1)}" height="${hh.toFixed(1)}" fill="${scoreFill(sc)}"${est ? ' fill-opacity=".55"' : ""}/>`
      + [...new Set(evs.map(e => evtKind(e.t)))].slice(0, 2).map((k, j) => `<circle cx="${(x + bw/2).toFixed(1)}" cy="${(H2-15-hh-4-j*7).toFixed(1)}" r="2.6" fill="${EVT[k][0]}"/>`).join("")
      + `<rect x="${x.toFixed(1)}" y="0" width="${bw.toFixed(1)}" height="${H2}" fill="transparent"/></g>`;
    if(y % 5 === 0) g += `<text x="${(x + bw/2).toFixed(1)}" y="${H2-1}" text-anchor="middle" class="vax">${y}</text>`;
  });
  const best = ys.map(y => [y, vRating(cat, y)[0]]).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return `<h3>${t("Vintages")} · ${t(VCAT_EN[cat])}</h3>
    <svg class="vchart" viewBox="0 0 ${W2} ${H2}" role="img" aria-label="${t("Vintage ratings")}">${g}</svg>
    <p class="note">${t("Best")}: ${best.map(([y, sc]) => `<button class="plink" data-vy="${y}">${y}</button> ${sc}`).join(" · ")}
      ${vid && vEvents(vid).length ? `<br><span class="vkey">${["frost","hail","heat"].map(k => `<i style="background:${EVT[k][0]}"></i>${t(EVT[k][1])}`).join(" ")}</span> ${t("marks years this commune was hit")}` : ""}</p>`;
}
function vintageYearHtml(cat, vid){
  if(st.color!=="vintage" || !VT) return "";
  const v = vRating(cat, st.vy), Y = VT.years[st.vy] || {}, w = (Y.wx || {});
  const evs = vEvents(vid, st.vy);
  return `<div class="vyearbox"><b>${st.vy}</b>${v ? ` · <span class="vs" style="background:${scoreFill(v[0])};color:${inkOn(scoreFill(v[0]))}">${v[0]}</span>${v[1] ? ` <span class="note">(${t("estimate")})</span>` : ""}` : ""}
    ${v && v[2] ? `<p>${esc(v[2])}${v[3] ? ` <span class="note">· ${esc(v[3])}</span>` : ""}</p>` : ""}
    ${evs.map(e => `<p class="note"><i class="evdot" style="background:${EVT[evtKind(e.t)][0]}"></i><b>${t(EVT[evtKind(e.t)][1])}</b> ${esc(e.d)}${e.s ? " — " + esc(e.s) : ""}</p>`).join("")}
    ${weatherLine(st.vy)}</div>`;
}
function weatherLine(y){
  const Y = VT && VT.years[y]; if(!Y) return "";
  const w = Y.wx && (Y.wx.dijon || Object.values(Y.wx)[0]); const bits = [];
  if(Y.harvest) bits.push(t("Harvest from {0}", Y.harvest.slice(5).split("-").reverse().join("/")));
  if(w){ if(w.anom != null) bits.push(t("Apr–Sep {0} °C vs normal", (w.anom > 0 ? "+" : "") + w.anom)); if(w.h35) bits.push(t("{0} days ≥ 35 °C", w.h35)); if(w.rain != null) bits.push(t("{0} mm rain Apr–Sep", w.rain)); if(w.frost) bits.push(t("{0} frost nights after 1 April", w.frost)); }
  if(Y.crop) bits.push(esc(Y.crop));
  return bits.length ? `<p class="note">${bits.join(" · ")}</p>` : "";
}
function stepVintage(d){
  const yrs = [...new Set(VCATS.flatMap(vYears))].sort((a, b) => a - b), i = yrs.indexOf(st.vy);
  const j = Math.max(0, Math.min(yrs.length - 1, i + d)); if(yrs[j] !== st.vy){ st.vy = yrs[j]; renderSide(); paint(); syncHash(); }
}
function showVintage(y){ st.vy = +y; st.color = "vintage"; $("fColor").value = "vintage"; renderSide(); paint(); syncHash(); }
const WINDS = {en:"N NNE NE ENE E ESE SE SSE S SSW SW WSW W WNW NW NNW", da:"N NNØ NØ ØNØ Ø ØSØ SØ SSØ S SSV SV VSV V VNV NV NNV", fr:"N NNE NE ENE E ESE SE SSE S SSO SO OSO O ONO NO NNO"};
const wind = deg => (WINDS[window.I18N ? window.I18N.lang : "en"] || WINDS.en).split(" ")[Math.round(deg/22.5) % 16];
function detailHtml(c){
  const d = c.detail || {}, m = DEM[c.id];
  if(!c.detail && !m) return "";
  // measured altitude band, aspect and slope from IGN's terrain model win over the estimated bands
  // facing: the circular mean of local downhill directions; when they disagree (a climat wrapping round a hill) say so
  const alt = m ? `${m[0]}–${m[1]}` : d.alt, asp = m ? (m[3] < 1.5 ? t("flat") : m[5] < 55 ? `${t("varied")} · ${wind(m[4])}` : wind(m[4])) : d.asp;
  const mt = m ? ` title="${t("Altitude and slope measured from IGN's elevation model")}"` : "";
  return `<div class="facts"${mt}>
      ${alt?`<div class="fact"><div class="l">${t("Altitude")}</div><div class="v">${esc(alt)} m</div></div>`:""}
      ${asp?`<div class="fact"><div class="l">${t("Faces")}</div><div class="v">${esc(asp)}</div></div>`:""}
      ${m?`<div class="fact"><div class="l">${t("Slope")}</div><div class="v">${m[3].toFixed(m[3] < 10 ? 1 : 0)} %</div></div>`:""}
    </div>
    ${d.soil?`<p class="note"><b>${t("Soil:")}</b> ${esc(txD(c, "soil"))}</p>`:""}
    ${(d.sub||[]).length?`<h3>${t("Lieux-dits within")}</h3><p class="note">${(txD(c, "sub") || d.sub).map(esc).join(" · ")}</p>`:""}`;
}

/* ---------- compare two producers ---------- */
st.cmp = ["drc", "lb_comte"];
function renderCompare(){
  const box = $("cmp"); if(!box) return;
  const [a,b] = st.cmp, A = PROD[a], Bp = PROD[b];
  if(!A || !Bp){ box.innerHTML = `<p class="note">${t("Pick two producers above.")}</p>`; return; }
  const ORD = {GC:0,"1er":1,V:2};
  const rows = new Map();
  [[A,0],[Bp,1]].forEach(([r,i]) => r.hold.forEach(h => { const e = rows.get(h.c.id) || {c:h.c, v:[null,null]}; e.v[i] = h; rows.set(h.c.id, e); }));
  const list = [...rows.values()].sort((x,y) => ORD[x.c.c]-ORD[y.c.c] || x.c.vil.idx-y.c.vil.idx || x.c.n.localeCompare(y.c.n,"fr"));
  const cell = h => !h ? `<td class="n">—</td>` : h.kind==="s" ? `<td class="n"><span class="ktag s">${t("buys grapes")}</span></td>`
    : `<td class="n">${h.ha!=null?`<b>${fmtHa(h.ha)}</b> ha`:t("holder")}${h.kind==="f"?` <span class="ktag">${t("leased")}</span>`:""}</td>`;
  const sum = (r,f) => r.hold.filter(f).length;
  box.innerHTML = `<table class="own cmpt"><thead><tr><th></th><th class="n"><button class="plink" data-p="${a}">${esc(A.name)}</button></th><th class="n"><button class="plink" data-p="${b}">${esc(Bp.name)}</button></th></tr></thead>
    <tbody>
      <tr class="tot"><td>${t("Published hectares on the map")}</td>${[A,Bp].map(r=>`<td class="n"><b>${r.hold.some(h=>h.kind!=="s"&&h.ha==null)?"≥ ":""}${fmtHa(r.ha)}</b></td>`).join("")}</tr>
      <tr class="tot"><td>${t("Grands crus · premiers crus")}</td><td class="n">${A.gc} · ${sum(A,h=>h.c.c==="1er"&&h.kind!=="s")}</td><td class="n">${Bp.gc} · ${sum(Bp,h=>h.c.c==="1er"&&h.kind!=="s")}</td></tr>
      <tr class="tot"><td>${t("Monopoles")}</td><td class="n">${sum(A,h=>h.c.mono===a&&!h.c.inner)}</td><td class="n">${sum(Bp,h=>h.c.mono===b&&!h.c.inner)}</td></tr>
      ${list.map(({c,v}) => `<tr><td><span class="cls" style="background:${{GC:TOK.gc,"1er":TOK.pc,V:TOK.vc}[c.c]}"></span><button class="plink" data-c="${c.id}">${esc(c.n)}</button> <span class="note">${esc(c.vil.n)}</span></td>${cell(v[0])}${cell(v[1])}</tr>`).join("")}
    </tbody></table>`;
  box.querySelectorAll("[data-c]").forEach(x => x.onclick = () => { select(x.dataset.c, true); $("mapcard").scrollIntoView({behavior:"smooth", block:"nearest"}); });
  box.querySelectorAll("[data-p]").forEach(x => x.onclick = () => setProducer(x.dataset.p, true));
}
["cmpA","cmpB"].forEach((id,i) => { const inp = $(id); if(!inp) return;
  inp.value = P[st.cmp[i]] || "";
  inp.addEventListener("input", () => { const k = prodByName[norm(inp.value)]; if(k){ st.cmp[i] = k; renderCompare(); } });
});

/* ---------- who owns the grands crus ---------- */
const CAT = ["#7C2D3E","#3F7CB6","#A87E2F","#3E9E68","#8E5BA8","#C2683A","#2F8F8F","#B5476E","#5E6E2F","#4C5BA8"];
function renderGcOwners(){
  const box = $("gcown"); if(!box) return;
  const gcs = C.filter(c => c.c==="GC" && !c.inner && !c.x);
  const tot = {}; gcs.forEach(c => c.p.forEach(([k,h,kd]) => { if(h && kd!=="s") tot[k]=(tot[k]||0)+h; }));
  const top = Object.entries(tot).sort((a,b)=>b[1]-a[1]).slice(0,CAT.length).map(([k])=>k), col = k => CAT[top.indexOf(k)] || null;
  const dk = DARK();
  box.innerHTML = `<div class="gclegend">${top.map(k=>`<button class="plink" data-p="${k}"><span class="sw" style="background:${col(k)}"></span>${esc(P[k])}</button>`).join("")}<span class="note"><span class="sw" style="background:${dk?"#5A4D53":"#C9BBB2"}"></span>${t("other listed owners · empty = not published")}</span></div>`
    + gcs.map(c => {
      const own = c.p.filter(([,h,kd]) => h && kd!=="s").sort((a,b)=>b[1]-a[1]);
      let alt = 0;
      const segs = own.map(([k,h]) => { const cc = col(k) || (alt++%2 ? (dk?"#4A3F44":"#D8CCC4") : (dk?"#5A4D53":"#C9BBB2"));
        return `<span data-p="${k}" title="${esc(P[k])} · ${fmtHa(h)} ha · ${Math.round(100*h/c.ha)}%" style="width:${(100*Math.min(h,c.ha)/c.ha).toFixed(2)}%;background:${cc}"></span>`; }).join("");
      return `<div class="gcrow"><button class="plink gcn" data-c="${c.id}">${esc(c.n)}</button><span class="gcbar">${segs}</span><span class="gch">${fmtHa(c.ha)} ha</span></div>`;
    }).join("");
  box.querySelectorAll("[data-c]").forEach(x => x.onclick = () => { select(x.dataset.c, true); $("mapcard").scrollIntoView({behavior:"smooth", block:"nearest"}); });
  box.querySelectorAll("[data-p]").forEach(x => x.onclick = () => { setProducer(x.dataset.p, true); $("mapcard").scrollIntoView({behavior:"smooth", block:"nearest"}); });
}

/* ---------- corrections: shared edits stored in the cellar's Google Sheet ---------- */
const EDITS = {list:[], can:false, status:"", open:null};
function apiUrl(){ return localStorage.getItem("vinApi") || (window.WINE_CONFIG && window.WINE_CONFIG.API_URL) || ""; }
function keyFor(name){
  if(P[name]) return name;
  const n = norm(name), hit = Object.keys(P).find(k => norm(P[k])===n);
  if(hit) return hit;
  const k = "x_" + n.replace(/[^a-z0-9]+/g,"_").slice(0,40); P[k] = name; return k;
}
function applyEdits(){
  C.forEach(c => { c.p = c.p0.map(x => [...x]); c.edited = {}; c.removed = []; });
  [...EDITS.list].sort((a,b) => String(a.time).localeCompare(String(b.time))).forEach(e => {
    const c = CL[e.climat]; if(!c) return;
    const key = keyFor(e.producer), i = c.p.findIndex(x => x[0]===key);
    if(e.action==="remove"){ if(i>=0) c.p.splice(i,1); c.removed.push({key, e}); delete c.edited[key]; return; }
    const row = [key, e.ha==null||isNaN(e.ha) ? null : e.ha, e.kind||"", e.since||null];
    if(i>=0) c.p[i] = row; else c.p.push(row);
    c.edited[key] = e; c.removed = c.removed.filter(x => x.key!==key);
  });
  indexHoldings();
}
async function loadEdits(){
  const api = apiUrl(); if(!api) return;
  EDITS.can = !!localStorage.getItem("vinToken");
  try{
    const res = await fetch(api, {method:"POST", body:JSON.stringify({action:"atlas"}), redirect:"follow"});
    const data = await res.json();
    // an Apps Script from before the atlas existed answers "bad-code" (no session) or "bad-action"
    if(!data.ok){ EDITS.status = ["bad-action","bad-code"].includes(data.error) ? "redeploy" : data.error; renderSide(); return; }
    EDITS.list = data.edits || []; EDITS.status = "ok";
    applyEdits(); paint(); renderSide();
  }catch(err){ EDITS.status = "offline"; }
}
function removedHtml(c){
  if(!c.removed || !c.removed.length) return "";
  return `<p class="note">${t("Removed by correction: {0}.", c.removed.map(({key,e}) => `<span title="${esc([e.note,e.time].filter(Boolean).join(" · "))}">${esc(P[key])}</span>`).join(", "))}</p>`;
}
function editHtml(c){
  if(!EDITS.can) return `<p class="note">${t("Spotted a wrong figure? Log in on the Cellar page and you can correct it here.")}</p>`;
  if(EDITS.status==="redeploy") return `<p class="note">${t("Corrections need the updated Apps Script — redeploy Code.gs (see README).")}</p>`;
  if(EDITS.open!==c.id) return `<p><button class="btn" id="edOpen">${t("✎ Correct the holdings")}</button></p>`;
  const pre = EDITS.pre || {};
  return `<form class="edform" id="edForm">
    <h3>${t("Correct a holding")}</h3>
    <label>${t("Producer")}<input id="edP" list="allProducers" value="${esc(pre.p||"")}" required></label>
    <div class="edrow"><label>${t("Hectares")}<input id="edHa" type="number" step="0.01" min="0" max="200" value="${pre.ha??""}" placeholder="${t("unknown")}"></label>
      <label>${t("Kind")}<select id="edK"><option value="">${t("owned")}</option><option value="f"${pre.k==="f"?" selected":""}>${t("leased")}</option><option value="s"${pre.k==="s"?" selected":""}>${t("buys grapes")}</option></select></label>
      <label>${t("Since")}<input id="edS" type="number" min="1000" max="2200" value="${pre.s||""}" placeholder="${t("vintage")}"></label></div>
    <label>${t("Source / note")}<input id="edN" placeholder="${t("e.g. domaine website, 2024 tech sheet")}" required></label>
    <div class="edrow"><button class="btn primary" type="submit">${t("Save")}</button><button class="btn" type="button" id="edRemove">${t("Remove this producer")}</button><button class="btn quiet" type="button" id="edCancel">${t("Cancel")}</button></div>
    <p class="note" id="edMsg">${t("Corrections are shared with everyone who opens the atlas and logged with your name.")}</p>
  </form>`;
}
async function saveEdit(c, action){
  const name = $("edP").value.trim(), note = $("edN").value.trim();
  if(!name){ $("edMsg").textContent = t("Pick or type a producer."); return; }
  if(!note){ $("edMsg").textContent = t("Add where the figure comes from — it helps the next person."); return; }
  const key = keyFor(name);
  const edit = {climat:c.id, producer: key.startsWith("x_") ? name : key, action,
    ha: $("edHa").value==="" ? "" : Number($("edHa").value), kind: $("edK").value, since: $("edS").value, note};
  $("edMsg").textContent = t("Saving…");
  try{
    const res = await fetch(apiUrl(), {method:"POST", redirect:"follow", body:JSON.stringify({
      user:localStorage.getItem("vinUser")||"", token:localStorage.getItem("vinToken")||"", action:"atlasedit", edit})});
    const data = await res.json();
    if(!data.ok){ $("edMsg").textContent = data.error==="bad-action" ? t("The Apps Script needs redeploying first (see README).") :
      data.error==="bad-token" ? t("Your session expired — log in on the Cellar page again.") : data.error==="not-an-atlas-editor" ? t("Your account isn't on the atlas editors list.") : t("Couldn't save: {0}", data.error); return; }
    EDITS.list = data.edits || []; EDITS.open = null; EDITS.pre = null;
    applyEdits(); renderSide(); paint();
  }catch(err){ $("edMsg").textContent = t("Couldn't reach the cellar API."); }
}
function wireEdit(c){
  const o = $("edOpen"); if(o) o.onclick = () => { EDITS.open = c.id; EDITS.pre = null; renderSide(); };
  side.querySelectorAll("[data-ed]").forEach(b => b.onclick = () => {
    const row = c.p.find(x => x[0]===b.dataset.ed) || [];
    EDITS.open = c.id; EDITS.pre = {p:P[b.dataset.ed], ha:row[1], k:row[2], s:row[3]}; renderSide();
  });
  const f = $("edForm"); if(!f) return;
  f.onsubmit = ev => { ev.preventDefault(); saveEdit(c, "set"); };
  $("edRemove").onclick = () => saveEdit(c, "remove");
  $("edCancel").onclick = () => { EDITS.open = null; renderSide(); };
}

/* ---------- controls ---------- */
function norm(t){ return String(t||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/œ/g,"oe").replace(/[-'’.,«»()]/g," ")
  .replace(/\bst\b/g,"saint").replace(/\bste\b/g,"sainte").replace(/\s+/g," ").trim(); }
// one search box: vineyards ("Name — Commune") and producers ("Name · producer")
let PROD_SUFFIX = " · producer";
function fillSearchList(){
  PROD_SUFFIX = " · " + t("producer");
  $("searchList").innerHTML = [...C].sort((a,b)=>a.n.localeCompare(b.n,"fr")).map(c => `<option value="${esc(c.n)} — ${esc(c.vil.n)}">`).join("")
    + Object.values(PROD).sort((a,b)=>a.name.localeCompare(b.name,"fr")).map(r => `<option value="${esc(r.name + PROD_SUFFIX)}">`).join("");
}
fillSearchList();
$("producerList").innerHTML = Object.values(PROD).sort((a,b)=>a.name.localeCompare(b.name,"fr")).map(r => `<option value="${esc(r.name)}">`).join("");
$("allProducers").innerHTML = Object.values(P).sort((a,b)=>a.localeCompare(b,"fr")).map(n => `<option value="${esc(n)}">`).join("");
document.querySelectorAll("#dtabs button").forEach(b => b.onclick = () => { st.dtab = b.dataset.t; renderDomains(); });
$("dSearch").addEventListener("input", renderDomains); $("dSort").onchange = renderDomains;
$("fSearch").addEventListener("input", ev => {
  const val = ev.target.value;
  const exact = C.find(c => `${c.n} — ${c.vil.n}` === val);
  if(exact){ st.q = ""; ev.target.value = ""; select(exact.id, true); return; }
  if(val.endsWith(PROD_SUFFIX)){ const key = prodByName[norm(val.slice(0, -PROD_SUFFIX.length))];
    if(key){ st.q = ""; ev.target.value = ""; setProducer(key, true); return; } }
  st.q = norm(val); paint();
});
$("fSearch").addEventListener("keydown", ev => {
  if(ev.key!=="Enter") return;
  const hit = C.filter(c => c.on).sort((a,b) => (norm(a.n).startsWith(st.q)?0:1)-(norm(b.n).startsWith(st.q)?0:1) || CORD[a.c]-CORD[b.c])[0];
  if(hit) select(hit.id, true);
});
$("prodChip").onclick = () => setProducer(null);
$("fColor").onchange = ev => { st.color = ev.target.value; paint(); syncHash(); };
$("classChips").querySelectorAll("[data-cls]").forEach(b => b.onclick = () => {
  const k = b.dataset.cls; st.cls.has(k) ? st.cls.delete(k) : st.cls.add(k);
  if(!st.cls.size) st.cls.add(k);
  paint();
});
$("monoChip").onclick = () => { st.mono = !st.mono; paint(); };
$("wineSeg").querySelectorAll("[data-wc]").forEach(b => b.onclick = () => { st.wc = b.dataset.wc; paint(); });
function syncMode(){
  const geo = st.mode==="geo";
  $("layers").querySelectorAll("[data-m]").forEach(b => b.classList.toggle("on", b.dataset.m===st.mode));
  $("rotL").hidden = $("rotR").hidden = !geo;
  $("compass").title = t(geo ? "North up" : "Schematic map: north is roughly up, the slope rises to the west");
  $("attr").textContent = t(geo ? (TOPO ? "Boundaries © INAO · map data © IGN, Licence Ouverte" : "Boundaries © INAO, Licence Ouverte") : "Schematic · not to scale · slope rises west");
  syncCompass();
}
if(GEO){
  $("layers").hidden = false;
  $("layers").querySelectorAll("[data-m]").forEach(b => b.onclick = () => {
    if(b.dataset.m===st.mode) return;
    st.mode = b.dataset.m; try{ localStorage.setItem("atlasMode", st.mode); }catch(e){} loadTopo();
    build(); syncMode(); renderSide(); vb = {x:0,y:0,w:W,h:H}; setVB(vb);
    if(st.sel) focusClimat(CL[st.sel]); else if(st.vsel) selectVillage(st.vsel, true); else focusDefault();
  });
}
$("cellarChip").onclick = () => { st.cellarOnly = !st.cellarOnly; paint(); };
$("reset").onclick = () => {
  Object.assign(st, {cls:new Set(["GC","1er","V"]), mono:false, wc:"", cellarOnly:false, q:"", prod:null, color:"class", sel:null, vsel:null, overview:false});
  $("fSearch").value=""; $("fColor").value="class"; renderProdChip();
  renderSide(); paint(); syncHash(); syncCommunes(); focusDefault();
};
function syncChips(){
  $("classChips").querySelectorAll("[data-cls]").forEach(b => b.classList.toggle("on", st.cls.has(b.dataset.cls)));
  $("monoChip").classList.toggle("on", st.mono);
  $("wineSeg").querySelectorAll("[data-wc]").forEach(b => b.classList.toggle("on", b.dataset.wc===st.wc));
  $("cellarChip").classList.toggle("on", st.cellarOnly);
}
const seg = $("coteSeg"), csel = $("fCommune");
seg.innerHTML = COTES.map(k => `<button type="button" data-cote="${k.id}">${esc(k.n)}</button>`).join("");
seg.querySelectorAll("[data-cote]").forEach(b => b.onclick = () => fitCote(b.dataset.cote));
csel.innerHTML = `<option value="">${t("Commune…")}</option>` + COTES.map(k => `<optgroup label="${esc(k.n)}">` +
  V.filter(v=>v.cote===k.id).map(v => `<option value="${v.id}">${esc(v.n)}</option>`).join("") + `</optgroup>`).join("");
csel.onchange = () => { if(csel.value) selectVillage(csel.value, true); };
function fitCote(id){
  const vs = V.filter(v=>v.cote===id); if(!vs.length) return;
  st.vsel=null; st.sel=null; st.coteView=id; renderSide(); paint(); syncHash(); syncCommunes();
  const b = bbUnion(vs.map(v => v.bb).filter(Boolean)); if(b) flyTo(fitBox(...b, .02));
}
function syncCommunes(){
  const cur = st.vsel || (st.sel && CL[st.sel].v) || "";
  csel.value = cur;
  const cote = cur ? VIL[cur].cote : (st.coteView || "");
  seg.querySelectorAll("[data-cote]").forEach(b => b.classList.toggle("on", b.dataset.cote===cote));
}

// deep-dive tabs under the map
document.querySelectorAll(".xtabs [data-x]").forEach(b => b.onclick = () => {
  document.querySelectorAll(".xtabs [data-x]").forEach(x => x.classList.toggle("on", x===b));
  document.querySelectorAll(".xpane").forEach(x => x.classList.toggle("on", x.dataset.x===b.dataset.x));
});
$("zInfo").onclick = ev => { ev.stopPropagation(); st.overview = !st.overview; if(st.overview){ st.sel=null; st.vsel=null; } renderSide(); paint(); syncHash(); syncCommunes(); };

/* ---------- orientation: compass, rotation, locator map, where-am-I ---------- */
// INAO's delimited area, measured from the outline (metres²) — shown next to the published figure
function surveyHa(c){
  const mp = GEO && GEO.climats[c.id]; if(!mp) return 0;
  // the atlas counts an enclave in its parent's hectares (Clos de la Mouchère in Puligny's Perrières), INAO maps them apart
  if(c._sha == null) c._sha = [c, ...C.filter(e => e.in===c.id && !e.x && GEO.climats[e.id])].reduce((s0, e) =>
    s0 + GEO.climats[e.id].reduce((s,p) => s + ringArea(p[0]) - p.slice(1).reduce((t,h) => t + ringArea(h), 0), 0), 0) / 1e4;
  return c._sha;
}
function areaNote(c){
  const s = surveyHa(c); if(!s || (s/c.ha > .8 && s/c.ha < 1.25)) return "";
  return `<p class="note">${t("The two areas differ: INAO's plan counts all land entitled to the name, planted or not, while the published {0} ha counts vineyard — sometimes with neighbouring plots sold under the same name.", fmtHa(c.ha))}</p>`;
}
function syncCompass(){
  const a = st.mode==="geo" ? st.rot : 0;
  $("needle").setAttribute("transform", `rotate(${a})`);
  $("nLetter").setAttribute("transform", `rotate(${-a} 0 -13.6)`);
  $("compass").classList.toggle("turned", !!a);
}
function rotateTo(deg){
  if(st.mode!=="geo") return;
  deg = ((Math.round(deg) % 360) + 360) % 360;
  if(deg === st.rot) return;
  const dp = drawerPx() / scale(), w = vb.w, h = vb.h;
  const m = INV([vb.x + (w - dp)/2, vb.y + h/2]); // keep the centre of the visible map where it is
  st.rot = deg; try{ localStorage.setItem("atlasRot", deg); }catch(e){}
  build();
  const [x, y] = FWD(m);
  setVB({x: x - (w - dp)/2, y: y - h/2, w, h});
  syncCompass();
}
const rotateBy = d => rotateTo(st.rot + d);
$("rotL").onclick = () => rotateBy(-15);
$("rotR").onclick = () => rotateBy(15);
$("compass").onclick = () => rotateTo(0);

const loc = $("locator"); let locVP = null, lastHere;
function buildLocator(){
  loc.innerHTML = ""; lastHere = undefined;
  loc.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const small = matchMedia("(max-width: 600px)").matches, k = Math.min((small ? 60 : 92)/W, (small ? 104 : 150)/H);
  loc.style.width = Math.round(W*k)+"px"; loc.style.height = Math.round(H*k)+"px";
  V.forEach(v => {
    if(v.baseD.length) v.baseD.forEach(d => el("path", {class:"lv", d, "data-v":v.id, "fill-rule":"evenodd"}, loc));
    else if(v.bb) el("rect", {class:"lv", "data-v":v.id, x:v.bb[0], y:v.bb[1], width:v.bb[2]-v.bb[0], height:v.bb[3]-v.bb[1]}, loc);
  });
  C.forEach(c => { if(c.c==="GC" && c.path) el("path", {class:"lg", d:c.path}, loc); });
  locVP = el("rect", {class:"vp"}, loc);
}
loc.addEventListener("click", ev => {
  const r = loc.getBoundingClientRect(), x = (ev.clientX - r.left)/r.width*W, y = (ev.clientY - r.top)/r.height*H, dp = drawerPx()/scale();
  flyTo({x: x - (vb.w - dp)/2, y: y - vb.h/2, w: vb.w, h: vb.h}, 300);
});
// the real commune (IGN boundaries) under a point in metres — the atlas groups some, e.g. Ladoix · Aloxe · Pernand
function communeAt([x, y]){
  if(!TOPO.communes) return null;
  if(!TOPO._comm) TOPO._comm = TOPO.communes.map(([, n, rs]) => ({n, rs: rs.map(f => { const out = []; let px = 0, py = 0;
    for(let i = 0; i < f.length; i += 2){ if(TOPO.meta.delta && i){ px += f[i]; py += f[i+1]; } else { px = f[i]; py = f[i+1]; } out.push([px, py]); } return out; })}));
  const hit = TOPO._comm.find(c => c.rs.some(r => inPoly(x, y, r)));
  return hit ? hit.n : null;
}
let orientRaf = 0;
function orientSoon(){ if(!orientRaf) orientRaf = requestAnimationFrame(() => { orientRaf = 0; orient(); }); }
function orient(){
  const r = svg.getBoundingClientRect(), k = scale(); if(!r.width || !k || !locVP) return;
  const dpx = drawerPx(), dp = dpx/k, visW = vb.w - dp;
  // the visible part of the map, outlined on the locator (never smaller than a few pixels)
  const minU = 6 * W / Math.max(1, loc.clientWidth), w = Math.max(minU, visW), h = Math.max(minU, vb.h);
  Object.entries({x: vb.x + visW/2 - w/2, y: vb.y + vb.h/2 - h/2, width: w, height: h}).forEach(([a, v]) => locVP.setAttribute(a, v.toFixed(0)));
  const whole = visW >= W*.9 && vb.h >= H*.9;
  loc.classList.toggle("whole", whole);
  // which commune sits under the centre of the visible map
  const cx = r.left + (r.width - dpx)/2, cy = r.top + r.height/2;
  let v = null, near = false;
  for(const e of document.elementsFromPoint(cx, cy)){
    if(e.ownerSVGElement !== svg) continue;
    if(e.dataset.id && CL[e.dataset.id]){ v = CL[e.dataset.id].vil; break; }
    if(e.dataset.v && VIL[e.dataset.v]){ v = VIL[e.dataset.v]; break; }
  }
  if(!v){ // between communes: name the nearest one
    const [sx, sy] = clientToSvg(cx, cy); let best = Infinity;
    V.forEach(u => { if(!u.bb) return; const dx = Math.max(u.bb[0]-sx, 0, sx-u.bb[2]), dy = Math.max(u.bb[1]-sy, 0, sy-u.bb[3]), d = dx*dx + dy*dy; if(d < best){ best = d; v = u; } });
    near = true;
  }
  const here = $("here"), wide = visW >= W*.55 && vb.h >= H*.55;
  here.hidden = !v || wide;
  if(v && !wide){
    const cote = COTES.find(q => q.id===v.cote), comm = st.mode==="geo" && TOPO && INV ? communeAt(INV(clientToSvg(cx, cy))) : null;
    here.innerHTML = `${cote ? `<span class="c">${esc(cote.n)} ›</span> ` : ""}${comm ? esc(comm) : `${near ? t("near ") : ""}${esc(v.n)}`}`;
    here.dataset.v = v.id; here.title = t("You're looking at {0} — click for the commune", v.n);
    here.style.left = Math.round((r.width - dpx)/2) + "px";
  }
  const id = v && !wide ? v.id : null;
  if(id !== lastHere){
    lastHere = id;
    loc.querySelectorAll(".lv").forEach(p => p.classList.toggle("here", p.dataset.v===id));
    svg.querySelectorAll(".base").forEach(p => p.classList.toggle("here", p.dataset.v===id));
  }
}
$("here").onclick = () => { const id = $("here").dataset.v; if(id) selectVillage(id, true); };

// switching language re-renders every piece of text the script writes
if(window.I18N) window.I18N.onChange(() => {
  fillSearchList(); csel.options[0].textContent = t("Commune…"); syncMode(); renderProdChip();
  renderSide(); paint(); orient();
});

/* ---------- hash (shareable state) ---------- */
let lastHash = location.hash;
function syncHash(){
  const h = st.sel ? "c="+st.sel : st.vsel ? "v="+st.vsel : "";
  const p = st.prod ? (h?"&":"")+"p="+st.prod : "";
  const col = st.color!=="class" && st.color!=="producer" ? ((h||p)?"&":"")+"color="+st.color+(st.color==="vintage" ? "&y="+st.vy : "") : "";
  const next = (h||p||col) ? "#"+h+p+col : "";
  if(next===lastHash || ("#"+location.hash.slice(1))===next) return;
  // a new vineyard, commune or producer is a step the Back button should undo; a colour change isn't
  const step = next.replace(/&?(color|y)=[^&]*/g,"") !== lastHash.replace(/&?(color|y)=[^&]*/g,"");
  history[step ? "pushState" : "replaceState"](null, "", location.pathname + location.search + next);
  lastHash = next;
}
function readHash(){
  const q = new URLSearchParams(location.hash.slice(1));
  if(q.get("color") && [...$("fColor").options].some(o=>o.value===q.get("color"))){ st.color=q.get("color"); $("fColor").value=st.color; }
  if(q.get("y") && VT && VT.years[q.get("y")]) st.vy = +q.get("y");
  if(q.get("p") && P[q.get("p")] && PROD[q.get("p")]){ st.prod=q.get("p"); renderProdChip(); st.color="producer"; $("fColor").value="producer"; }
  if(q.get("c") && CL[q.get("c")]) { st.sel=q.get("c"); return () => focusClimat(CL[st.sel]); }
  if(q.get("v") && VIL[q.get("v")]) { st.vsel=q.get("v"); return () => selectVillage(st.vsel, true); }
  return null;
}
function focusDefault(){ // Vosne and Flagey's grands crus
  const b = bbUnion([VIL.flagey.bb, VIL.vosne.bb].filter(Boolean)); if(b) flyTo(fitBox(...b, .02), 0);
}

/* ---------- cellar overlay (only if you're logged in to the cellar in this browser) ---------- */
const CELLAR = {loaded:false, by:{}, village:{}, msg:"Log in on the Cellar page to see your own bottles here.", args:[]};
const VILLAGE_KEYS = V.map(v => [v.id, norm(v.n.split(" · ")[0])]).concat([["flagey","flagey echezeaux"],["nuits","nuits saint georges"],["premeaux","premeaux prissey"],["cdnv","cote de nuits villages"],
  ["corton","aloxe corton"],["corton","pernand vergelesses"],["corton","ladoix"],["monthelie","auxey duresses"],["monthelie","monthelie"],["meursault","volnay santenots"]]);
const STRIP = ["gevrey chambertin","chambolle musigny","vosne romanee","morey saint denis","nuits saint georges","flagey echezeaux","premeaux prissey",
  "puligny montrachet","chassagne montrachet","aloxe corton","pernand vergelesses","savigny les beaune","chorey les beaune","auxey duresses","saint aubin"];
const ARTICLE = /^(les|la|le|aux|au|en|l)\s+/;
const STRIP_RE = STRIP.map(t => new RegExp(`(?<= )${t}(?= )`, "g"));
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
function matchWine(w){
  const commune = norm(w.commune), name = norm(w.name), all = " "+name+" "+commune+" ";
  let stripped = all; STRIP_RE.forEach(re => stripped = stripped.replace(re, "")); // lookarounds: back-to-back repeats are all removed
  const vil = VILLAGE_KEYS.filter(([,k]) => all.includes(" "+k+" ")).map(([id])=>id);
  let best = null;
  for(const {c,a} of ALIASES){
    for(const al of a){
      if(!stripped.includes(" "+al+" ")) continue; // commune names removed, so "Gevrey-Chambertin" ≠ Chambertin, "Nuits-St-Georges" ≠ Les St-Georges
      if(c.c!=="GC"){ // a premier cru / village climat needs its commune on the label (Les Cras exists three times)
        const ok = vil.includes(c.v) || (c.v==="flagey" && vil.includes("vosne")) || (c.v==="premeaux" && vil.includes("nuits")) || (c.geo==="flagey" && vil.includes("vosne"));
        if(!ok) continue;
      }
      if(!best || al.length > best.len || (al.length===best.len && c.inner)) best = {c, len:al.length};
    }
  }
  return {c: best && best.c, vil: vil[0]};
}
async function loadCellar(){
  const api = localStorage.getItem("vinApi") || (window.WINE_CONFIG && window.WINE_CONFIG.API_URL) || "";
  const user = localStorage.getItem("vinUser") || "", token = localStorage.getItem("vinToken") || "";
  if(!api || !token) return;
  CELLAR.msg = "Loading your cellar…"; CELLAR.args = []; renderLegend();
  try{
    const res = await fetch(api, {method:"POST", body:JSON.stringify({user, token, action:"data"}), redirect:"follow"});
    const data = await res.json();
    if(!data.ok) throw new Error(data.error || "error");
    let n = 0;
    (data.wines||[]).forEach(r => {
      const qty = Number(r.qty)||1;
      let drunk = String(r.drunk).trim().toLowerCase()==="x" ? qty : (Number(r.drunk)||0);
      const left = qty - Math.min(qty, drunk);
      if(left<=0) return;
      const w = {producer:String(r.producer||"").trim(), name:String(r.name||"").trim(), commune:String(r.commune||"").trim(), vintage:r.vintage, left};
      const m = matchWine(w);
      if(m.c){ const b = CELLAR.by[m.c.id] ??= {left:0, wines:[]}; b.left += left; b.wines.push(w); n += left; }
      else if(m.vil){ const b = CELLAR.village[m.vil] ??= {left:0}; b.left += left; }
    });
    CELLAR.loaded = true;
    const nc = Object.keys(CELLAR.by).length;
    CELLAR.msg = nc ? (n>1 ? "{0} bottles across {1} climats" : "{0} bottle in {1} climat") : "No bottles matched to a climat yet."; CELLAR.args = [n, nc];
    $("cellarChip").hidden = !nc;
    paint(); renderSide();
  }catch(err){
    CELLAR.msg = /token|code|cellar/.test(err.message) ? "Your session expired — log in on the Cellar page, then reload." : "Couldn't reach the cellar right now.";
    renderLegend();
  }
}

/* ---------- boot ---------- */
function applyHash(){ // Back/Forward, or a hand-edited URL
  if(location.hash===lastHash) return;
  lastHash = location.hash;
  st.sel = null; st.vsel = null; st.prod = null; st.overview = false; renderProdChip();
  st.color = "class"; $("fColor").value = "class"; // the URL says which colour, if any
  const fly = readHash();
  renderSide(); paint(); syncCommunes();
  if(fly) fly(); else if(st.prod){ const b = prodBox(st.prod); if(b) flyTo(fitBox(...b, .08)); }
}
addEventListener("popstate", applyHash);
addEventListener("hashchange", applyHash);
// keyboard: Escape clears the selection, + / − zoom (not while typing)
document.addEventListener("keydown", e => {
  if(e.target.closest && e.target.closest("input,select,textarea")) return;
  if(e.key==="[" || e.key==="]"){ if(st.mode==="geo") rotateBy(e.key==="]" ? 15 : -15); return; }
  if(e.key==="Escape" && (st.sel||st.vsel||st.prod||st.overview)){ st.sel=null; st.vsel=null; st.overview=false; if(st.prod) setProducer(null); else { renderSide(); paint(); syncHash(); syncCommunes(); } }
  else if(e.key==="+"||e.key==="=") $("zIn").click();
  else if(e.key==="-"||e.key==="_") $("zOut").click();
});
// phones: the details panel sits below the map, so a selection gets a small bar on the map pointing to it
function renderPeek(){
  const pk = $("peek"); if(!pk) return;
  let html = "";
  if(st.sel){ const c = CL[st.sel]; html = `<b>${esc(c.n)}</b><span>${CLASS_NAME[c.c]} · ${fmtHa(c.ha)} ha${c.mono?" · monopole":c.p.length?` · ${t("Owners")}: ${c.p.length}`:""}</span>`; }
  else if(st.prod){ const r = PROD[st.prod]; html = `<b>${esc(r.name)}</b><span>${r.n} ${t("climats")} · ${r.gc} ${t("grands crus")}</span>`; }
  else if(st.vsel){ const v = VIL[st.vsel]; html = `<b>${esc(v.n)}</b><span>${esc(txV(v, "aoc").split(" · ").slice(1).join(" · "))}</span>`; }
  pk.hidden = !html;
  if(html){ pk.innerHTML = `<div>${html}</div><button type="button" id="peekGo">${t("Details ↓")}</button>`; $("peekGo").onclick = () => side.scrollIntoView({behavior:"smooth", block:"start"}); }
}
const after = readHash();
build(); syncMode();
renderSide(); syncCommunes();
requestAnimationFrame(() => { setVB(vb); focusDefault(); if(after) after(); setTimeout(loadTopo, 50); });
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { readTokens(); build(); renderSide(); setVB(vb); });
loadCellar();
loadEdits();
window.__atlas = {st, CL, PROD, CELLAR, matchWine, scale}; // handy from the console
})();
