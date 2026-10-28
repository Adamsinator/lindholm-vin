// The region atlas (atlas.html): one region pack at a time (atlas-<id>.js, made by tools/region-build.js from INAO's
// outlines), drawn as a map you can pan and zoom, with each vineyard's classification and area, your own bottles on it
// (read here from the cellar this browser is logged in to, decrypted here for an encrypted one) and "Add a bottle
// from here". Burgundy's Côte d'Or keeps its own, richer atlas (burgundy.html).
"use strict";
const t = (window.I18N && window.I18N.t) || ((s, ...a) => s.replace(/\{(\d)\}/g, (m, i) => a[i] ?? ""));
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtHa = v => Number(v).toLocaleString(window.I18N && I18N.lang === "en" ? "en-GB" : (window.I18N ? I18N.lang : "en"), { maximumFractionDigits: v < 10 ? 2 : 1 });
const norm = s => " " + String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim() + " ";

// the regions there are packs for; the Côte d'Or links to its own atlas
// kw: words on a label that put a bottle in the region; regional: what the pack's "regional" land is
const REGIONS = [
  { id: "chablis", name: "Chablis", file: "atlas-chablis.js?v=1", kw: ["chablis"], regional: "Regional (Petit Chablis…)" },
  { id: "chalonnaise", name: "Côte Chalonnaise", file: "atlas-chalonnaise.js?v=1", kw: ["mercurey", "givry", "rully", "montagny", "bouzeron", "chalonnaise"], regional: "Regional (Bourgogne Côte Chalonnaise)" },
  { id: "maconnais", name: "Mâconnais", file: "atlas-maconnais.js?v=1", kw: ["pouilly fuisse", "pouilly vinzelles", "pouilly loche", "saint veran", "st veran", "vire clesse", "macon"], regional: "Regional (Mâcon…)" },
];
const TYPE = { W: "Hvid", R: "Rød", RW: "Rød" };
const CLASS = { GC: "Grand cru", "1er": "Premier cru" };
const st = { region: null, pack: null, sel: null, view: null, show: { GC: true, "1er": true }, mine: false };
const CELLAR = { loaded: false, by: {}, other: 0, msg: "Log in on the Cellar page to see your own bottles here." };

const loadScript = src => new Promise((res, rej) => { const el = document.createElement("script"); el.src = src; el.onload = res; el.onerror = () => rej(new Error("load " + src)); document.head.appendChild(el); });

/* ---------- the map: SVG in the pack's metres, a viewBox to pan and zoom ---------- */
const svg = $("map"), NS = "http://www.w3.org/2000/svg";
const el = (name, attrs, parent) => { const e = document.createElementNS(NS, name); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
const pathOf = mp => mp.map(p => p.map(r => "M" + r.map(([x, y]) => x + " " + y).join("L") + "Z").join("")).join("");
let gLabels = null;
function draw() {
  const P = st.pack; svg.innerHTML = "";
  const g = el("g", {}, svg);
  el("path", { class: "rg", d: pathOf(P.regional.g) }, g);
  P.villages.forEach(v => el("path", { class: "vl", d: pathOf(v.g) }, g));
  P.climats.forEach(c => { c.el = el("path", { class: "cl " + (c.c === "GC" ? "GC" : c.unnamed ? "px" : "p1"), d: pathOf(c.g), "data-id": c.id }, g);
    el("title", {}, c.el).textContent = c.n; });
  const gd = el("g", {}, svg); gLabels = el("g", {}, svg);
  P.climats.forEach(c => { if (!c.unnamed) c.lb = el("text", { class: "lb " + c.c, x: c.lp[0], y: c.lp[1] }, gLabels); if (c.lb) c.lb.textContent = c.n;
    c.dot = el("circle", { class: "dot", cx: c.lp[0], cy: c.lp[1], r: 0 }, gd); });
  paint();
}
function paint() {
  const P = st.pack; if (!P) return;
  P.climats.forEach(c => {
    const off = !st.show[c.c] || (st.mine && !CELLAR.by[c.id]);
    c.el.classList.toggle("dim", off); c.el.classList.toggle("sel", st.sel === c.id);
    const b = CELLAR.by[c.id]?.left || 0; c.dot.setAttribute("r", b ? 0 : 0); c.dot.dataset.b = b;
  });
  layoutLabels();
}
// labels and bottle dots keep their size on screen: scaled by the zoom, hidden where they'd crowd
function layoutLabels() {
  const P = st.pack; if (!P || !st.view) return;
  const k = st.view[2] / svg.clientWidth || 1, taken = [];
  P.climats.slice().sort((a, b) => (a.c === "GC" ? 0 : 1) - (b.c === "GC" ? 0 : 1) || b.ha - a.ha).forEach(c => {
    const b = Number(c.dot.dataset.b || 0); c.dot.setAttribute("r", b ? (4 + Math.sqrt(b) * 1.6) * k : 0);
    if (!c.lb) return;
    c.lb.style.fontSize = (c.c === "GC" ? 14.5 : 13) * k + "px"; c.lb.style.strokeWidth = 3 * k + "px"; // style: it outranks the stylesheet
    const w = c.n.length * 7 * k, h = 15 * k, box = [c.lp[0] - w / 2, c.lp[1] - h, c.lp[0] + w / 2, c.lp[1]];
    const hide = !st.show[c.c] || (st.mine && !CELLAR.by[c.id]) || taken.some(o => !(box[2] < o[0] || box[0] > o[2] || box[3] < o[1] || box[1] > o[3]));
    c.lb.style.display = hide ? "none" : ""; if (!hide) taken.push(box);
  });
}
function setView(v) { st.view = v; svg.setAttribute("viewBox", v.map(x => Math.round(x)).join(" ")); layoutLabels(); }
function fit(bb, pad) {
  const W = svg.clientWidth || 800, H = svg.clientHeight || 600, bw = bb[2] - bb[0], bh = bb[3] - bb[1], m = pad ?? .06;
  const s = Math.max(bw / W, bh / H) * (1 + 2 * m);
  setView([(bb[0] + bb[2]) / 2 - W * s / 2, (bb[1] + bb[3]) / 2 - H * s / 2, W * s, H * s]);
}
const bbOf = mp => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; mp.forEach(p => p[0].forEach(([x, y]) => { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); })); return [a, b, c, d]; };
function zoomAt(f, cx, cy) {
  const [x, y, w, h] = st.view, nw = Math.min(Math.max(w * f, 150), (st.pack.meta.bb[2] - st.pack.meta.bb[0]) * 3);
  const r = nw / w; setView([cx - (cx - x) * r, cy - (cy - y) * r, w * r, h * r]);
}
const toSvg = e => { const r = svg.getBoundingClientRect(), [x, y, w, h] = st.view; return [x + (e.clientX - r.left) / r.width * w, y + (e.clientY - r.top) / r.height * h]; };
svg.addEventListener("wheel", e => { if (!st.view) return; e.preventDefault(); const [cx, cy] = toSvg(e); zoomAt(Math.exp(e.deltaY * .0015), cx, cy); }, { passive: false });
const ptrs = new Map(); let moved = 0, pinch = null;
svg.addEventListener("pointerdown", e => { ptrs.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; svg.setPointerCapture(e.pointerId); svg.classList.add("drag");
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
svg.addEventListener("pointermove", e => {
  if (!ptrs.has(e.pointerId) || !st.view) return;
  const [px, py] = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
  if (ptrs.size === 2 && pinch) { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    const r = svg.getBoundingClientRect(), mid = toSvg({ clientX: (a[0] + b[0]) / 2, clientY: (a[1] + b[1]) / 2 }); zoomAt(pinch / d, mid[0], mid[1]); pinch = d; moved += 10; void r; return; }
  const r = svg.getBoundingClientRect(), [x, y, w, h] = st.view, dx = (e.clientX - px) / r.width * w, dy = (e.clientY - py) / r.height * h;
  moved += Math.abs(e.clientX - px) + Math.abs(e.clientY - py); setView([x - dx, y - dy, w, h]);
});
const up = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (!ptrs.size) svg.classList.remove("drag"); };
svg.addEventListener("pointerup", e => { const tgt = document.elementFromPoint(e.clientX, e.clientY); up(e);
  if (moved < 6) { const c = tgt && tgt.closest && tgt.closest(".cl"); select(c ? c.dataset.id : null); } });
svg.addEventListener("pointercancel", up);
$("zIn").onclick = () => { const [x, y, w, h] = st.view; zoomAt(.6, x + w / 2, y + h / 2); };
$("zOut").onclick = () => { const [x, y, w, h] = st.view; zoomAt(1 / .6, x + w / 2, y + h / 2); };
$("zHome").onclick = () => fit(st.home);
addEventListener("resize", () => { if (st.view) layoutLabels(); });

/* ---------- the side panel ---------- */
const byId = id => st.pack && st.pack.climats.find(c => c.id === id);
function select(id, fly) {
  st.sel = byId(id) ? id : null; paint(); renderSide(); syncHash();
  if (st.sel && fly) fit(bbOf(byId(st.sel).g), .6);
}
function renderSide() {
  const P = st.pack, side = $("side"); if (!P) return;
  const c = st.sel && byId(st.sel), R = st.region;
  if (!c) {
    const gc = P.climats.filter(x => x.c === "GC"), pc = P.climats.filter(x => x.c === "1er" && !x.unnamed), many = P.villages.length > 1;
    side.innerHTML = `<h2>${esc(P.meta.name)}</h2>
      <p class="meta">${esc(gc.length ? t("{0} grands crus and {1} premiers crus on INAO's own map. Click a vineyard.", gc.length, pc.length) : t("{0} premiers crus on INAO's own map. Click a vineyard.", pc.length))}</p>
      <div class="facts">${gc.length ? `<div class="fact"><div class="l">${esc(t("Grand cru"))}</div><div class="v">${fmtHa(gc.reduce((s, x) => s + x.ha, 0))} ha</div></div>` : ""}
        <div class="fact"><div class="l">${esc(t("Premier cru"))}</div><div class="v">${fmtHa(P.climats.filter(x => x.c === "1er").reduce((s, x) => s + x.ha, 0))} ha</div></div>
        ${P.villages.map(v => `<div class="fact"><div class="l">${esc(v.ap)}${many ? "" : ""}</div><div class="v">${fmtHa(v.ha)} ha</div></div>`).join("")}
        <div class="fact"><div class="l">${esc(t(R.regional))}</div><div class="v">${fmtHa(P.regional.ha)} ha</div></div></div>
      ${many ? `<p class="note">${esc(t("Village figures are the land outside the premiers crus."))}</p>` : ""}
      ${cellarSummary()}
      ${gc.length ? `<h3>${esc(t("Grand cru"))}</h3><ul class="list">${gc.map(x => row(x)).join("")}</ul>` : ""}
      ${(many ? P.villages.map(v => v.ap) : [null]).map(ap => { const list = pc.filter(x => !ap || x.app === ap); return list.length ? `<h3>${esc(ap ? t("{0} premier cru", ap) : t("Premier cru"))}</h3><ul class="list">${list.map(x => row(x)).join("")}</ul>` : ""; }).join("")}
      ${pc.some(x => x.inferred) ? `<p class="note">* ${esc(t("INAO's map doesn't name this land; the name comes from IGN's place names inside or next to it."))}</p>` : ""}
      <p class="src">${esc(P.meta.source)}. ${esc(t("Built {0}.", P.meta.built))}</p>`;
  } else {
    const parent = c.parent && byId(c.parent), bottles = CELLAR.by[c.id];
    side.innerHTML = `<p><button class="btn" id="back">← ${esc(P.meta.name)}</button></p>
      <span class="pill ${c.c === "GC" ? "GC" : "p1"}">${esc(t(CLASS[c.c]))}</span>
      <h2>${esc(c.n)}</h2>
      <div class="meta">${esc(c.ap)}${parent ? " · " + esc(t("within {0}", parent.n)) : ""}</div>
      <div class="facts"><div class="fact"><div class="l">${esc(t("INAO area"))}</div><div class="v">${fmtHa(c.ha)} ha</div></div>
        <div class="fact"><div class="l">${esc(t("Acres"))}</div><div class="v">${(c.ha * 2.471).toFixed(c.ha < 4 ? 1 : 0)}</div></div></div>
      ${c.inferred ? `<p class="note">${esc(t("INAO's map gives this land only as premier cru; the name comes from IGN's place names inside or next to it ({0}).", (c.places || []).join(", ")))}</p>` : ""}
      ${c.partInferred ? `<p class="note">${esc(t("Part of this outline is premier cru land INAO leaves unnamed, joined to it by IGN's place names ({0}).", c.partInferred.join(", ")))}</p>` : ""}
      ${c.unnamed ? `<p class="note">${esc(t("INAO's map gives this land only as premier cru, and no place name ties it to a climat."))}</p>` : ""}
      ${bottles ? `<h3>${esc(t("In your cellar"))}</h3>` + bottles.wines.slice(0, 12).map(w => `<div class="cw"><b>${w.left}×</b> ${esc(w.producer)} · ${esc(w.name || "")} ${esc(String(w.vintage || ""))}</div>`).join("") : ""}
      ${c.unnamed ? "" : `<p><button class="btn primary" id="addHere">＋ ${esc(t("Add a bottle from here"))}</button></p>`}
      <p class="src">${esc(P.meta.source)}.</p>`;
    $("back").onclick = () => select(null);
    const ah = $("addHere"); if (ah) ah.onclick = () => addFromAtlas(c, R);
  }
  side.querySelectorAll("button[data-c]").forEach(b => b.onclick = () => select(b.dataset.c, true));
}
const row = x => `<li><button data-c="${esc(x.id)}">${esc(x.n)}${x.inferred ? " *" : ""}</button><span>${fmtHa(x.ha)} ha${CELLAR.by[x.id] ? " · 🍷 " + CELLAR.by[x.id].left : ""}</span></li>`;
function cellarSummary() {
  if (!CELLAR.loaded) return `<p class="note">${esc(t(CELLAR.msg))}</p>`;
  const n = Object.values(CELLAR.by).reduce((s, b) => s + b.left, 0), nc = Object.keys(CELLAR.by).length;
  return `<p class="note">🍷 ${esc(nc ? t(n > 1 ? "{0} bottles across {1} climats" : "{0} bottle in {1} climat", n, nc) : t("No bottles matched to a climat yet."))}${CELLAR.other ? " · " + esc(t("{0} more of this region's wines without a named climat", CELLAR.other)) : ""}</p>`;
}
// "Add a bottle from here": the cellar's add form, filled in (handed over in localStorage, read once by index.html)
function addFromAtlas(c, R) {
  const pre = { name: c.n, commune: c.app, classification: { GC: "Grand cru", "1er": "1. cru" }[c.c] || "", region: st.pack.meta.region, country: st.pack.meta.country,
    type: TYPE[c.col] || "Hvid", producer: "", at: Date.now() };
  try { localStorage.setItem("vinAddPrefill", JSON.stringify(pre)); } catch (e) {}
  location.href = "index.html#add";
}

/* ---------- your bottles ---------- */
const apiUrl = () => (window.WINE_CONFIG && window.WINE_CONFIG.API_URL) || localStorage.getItem("vinApi") || "";
async function vaultData(api, user, token) {
  for (const f of ["gas-fake.js?v=6", "vault-crypto.js?v=3", "vault-engine.js?v=1", "vault.js?v=19"]) await loadScript(f);
  const dek = await window.VCRYPTO.recall(user); if (!dek) throw new Error("token");
  const post = async p => (await fetch(api, { method: "POST", body: JSON.stringify(p), redirect: "follow" })).json();
  await window.VAULT.start({ post, user, token, dek });
  return window.VAULT.call({ action: "data" });
}
// a bottle's vineyard: the region's name somewhere on it, then the longest climat name (or, for one named from IGN's
// place names, one of those) in its wine or commune
function matchWine(w) {
  const R = st.region, all = norm([w.region, w.commune, w.name, w.classification].join(" ")), label = norm([w.name, w.commune].join(" "));
  if (!R.kw.some(k => all.includes(" " + k + " ")) && !R.kw.some(k => norm(w.region).includes(k))) return { region: false };
  let best = null;
  for (const c of st.pack.climats) {
    if (c.unnamed) continue;
    // a climat whose appellation is on the label too beats a namesake elsewhere (Clos du Roy, in Mercurey and Montagny)
    const own = all.includes(norm(c.app));
    for (const a of [c.n].concat(c.inferred ? c.places || [] : [])) { const k = norm(a).trim(), sc = k.length + (own ? 100 : 0);
      if (k.length > 3 && label.includes(" " + k + " ") && (!best || sc > best.k)) best = { c, k: sc }; }
  }
  return { region: true, c: best && best.c };
}
async function loadCellar() {
  const api = apiUrl(), user = localStorage.getItem("vinUser") || "", token = localStorage.getItem("vinToken") || "";
  if (!api || !token) return;
  CELLAR.msg = "Loading your cellar…"; renderSide();
  try {
    const data = localStorage.getItem("vinVault") === "1" ? await vaultData(api, user, token)
      : await (await fetch(api, { method: "POST", body: JSON.stringify({ user, token, action: "data" }), redirect: "follow" })).json();
    if (!data.ok) throw new Error(data.error || "error");
    CELLAR.wines = data.wines || []; place(); CELLAR.loaded = true;
  } catch (err) { CELLAR.msg = /token|code|cellar/.test(err.message) ? "Your session expired — log in on the Cellar page, then reload." : "Couldn't reach the cellar right now."; }
  paint(); renderSide();
}
function place() {
  CELLAR.by = {}; CELLAR.other = 0; if (!CELLAR.wines || !st.pack) return;
  CELLAR.wines.forEach(r => {
    const qty = Number(r.qty) || 1, drunk = String(r.drunk).trim().toLowerCase() === "x" ? qty : Math.min(qty, Number(r.drunk) || 0), left = qty - drunk;
    if (left <= 0) return;
    const w = { producer: String(r.producer || ""), name: String(r.name || ""), commune: String(r.commune || ""), region: String(r.region || ""), classification: String(r.classification || ""), vintage: r.vintage, left };
    const m = matchWine(w);
    if (m.c) { const b = CELLAR.by[m.c.id] ??= { left: 0, wines: [] }; b.left += left; b.wines.push(w); } else if (m.region) CELLAR.other += left;
  });
}

/* ---------- region, hash, filters ---------- */
function syncHash() {
  const h = "#r=" + st.region.id + (st.sel ? "&c=" + st.sel : "");
  if (location.hash !== h) history.replaceState(null, "", location.pathname + location.search + h);
}
async function openRegion(id, sel) {
  const R = REGIONS.find(r => r.id === id) || REGIONS[0];
  if (!(window.ATLAS_PACKS && ATLAS_PACKS[R.id])) await loadScript(R.file);
  st.region = R; st.pack = ATLAS_PACKS[R.id]; st.sel = null; $("fRegion").value = R.id; $("regionName").textContent = st.pack.meta.name;
  document.title = "AllWine — " + st.pack.meta.name + " · " + t("Atlas");
  $("climatList").innerHTML = st.pack.climats.filter(c => !c.unnamed).map(c => `<option value="${esc(c.n)}">`).join("");
  // start on the crus (the regional land around them can be far bigger, and long and thin)
  st.home = bbOf(st.pack.climats.flatMap(c => c.g));
  $("fGC").parentNode.hidden = !st.pack.climats.some(c => c.c === "GC");
  place(); draw(); fit(st.home); renderLegend();
  if (sel && byId(sel)) select(sel, true); else { renderSide(); syncHash(); }
}
function renderLegend() {
  const P = st.pack;
  $("legend").innerHTML = [P.climats.some(c => c.c === "GC") && ["var(--gc)", "Grand cru"], ["var(--pc)", "Premier cru"], P.climats.some(c => c.unnamed) && ["var(--pcx)", "Premier cru, unnamed by INAO"],
    ["var(--vc)", P.villages.length > 1 ? "Village appellations" : P.villages[0].ap], ["var(--rg)", st.region.regional]].filter(Boolean)
    .map(([c, n]) => `<span><i style="background:${c}"></i>${esc(t(n))}</span>`).join("") + (CELLAR.loaded ? `<span><i style="background:var(--gold);border-radius:50%"></i>${esc(t("Bottles in your cellar"))}</span>` : "");
}
$("fRegion").innerHTML = REGIONS.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join("") + `<option value="burgundy">${esc(t("Côte d'Or (Burgundy atlas) ↗"))}</option>`;
$("fRegion").onchange = e => { if (e.target.value === "burgundy") { location.href = "burgundy.html"; return; } openRegion(e.target.value); };
$("fGC").onchange = e => { st.show.GC = e.target.checked; paint(); };
$("f1er").onchange = e => { st.show["1er"] = e.target.checked; paint(); };
$("fMine").onchange = e => { st.mine = e.target.checked; paint(); };
$("fSearch").addEventListener("change", e => { const q = norm(e.target.value); const c = st.pack.climats.find(x => norm(x.n) === q) || st.pack.climats.find(x => !x.unnamed && norm(x.n).includes(q.trim())); if (c) { select(c.id, true); e.target.value = ""; } });
if (window.I18N) { I18N.picker && document.querySelectorAll("[data-langpick]").forEach(I18N.picker); I18N.onChange(() => { renderSide(); renderLegend(); }); }

// #r=chablis&c=les_clos, or &w=<a wine's name> from the cellar's "On the map": its vineyard if the atlas knows it
async function fromHash() {
  const q = new URLSearchParams(location.hash.slice(1)), r = q.get("r") || REGIONS[0].id;
  if (!st.region || st.region.id !== r) await openRegion(r, q.get("c"));
  else if ((q.get("c") || null) !== st.sel) select(q.get("c"), true);
  if (q.get("w")) { const m = matchWine({ region: st.region.kw[0], name: q.get("w") }); if (m.c) select(m.c.id, true); else syncHash(); }
}
// a link or Back that only changes the hash doesn't reload the page
addEventListener("hashchange", () => { fromHash().then(() => { place(); paint(); renderSide(); }); });
fromHash().then(loadCellar);
