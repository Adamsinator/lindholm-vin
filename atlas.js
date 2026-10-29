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
  { id: "chablis", name: "Chablis", file: "atlas-chablis.js?v=1", ll: [47.811, 3.796], country: "fr", kind: "Grand cru · premier cru", kw: ["chablis"], regional: "Regional (Petit Chablis…)" },
  { id: "chalonnaise", name: "Côte Chalonnaise", file: "atlas-chalonnaise.js?v=1", ll: [46.782, 4.711], country: "fr", kind: "Premier cru", kw: ["mercurey", "givry", "rully", "montagny", "bouzeron", "chalonnaise"], regional: "Regional (Bourgogne Côte Chalonnaise)" },
  { id: "maconnais", name: "Mâconnais", file: "atlas-maconnais.js?v=1", ll: [46.288, 4.739], country: "fr", kind: "Premier cru", kw: ["pouilly fuisse", "pouilly vinzelles", "pouilly loche", "saint veran", "st veran", "vire clesse", "macon"], regional: "Regional (Mâcon…)" },
  { id: "champagne", name: "Champagne", file: "atlas-champagne.js?v=1", ll: [49.096, 4.035], country: "fr", kind: "Grand and premier cru villages", kw: ["champagne"], village: "Other villages' vines" },
  { id: "alsace", name: "Alsace", file: "atlas-alsace.js?v=1", ll: [48.174, 7.329], country: "fr", kind: "Grand cru", kw: ["alsace", "elsass"], village: "Alsace (the rest of the AOC)" },
  { id: "bordeaux", name: "Bordeaux", file: "atlas-bordeaux.js?v=1", ll: [44.953, -0.587], country: "fr", kind: "Appellations · the 1855 châteaux", kw: ["bordeaux", "pauillac", "margaux", "medoc", "saint julien", "st julien", "saint estephe", "st estephe",
    "pessac", "graves", "sauternes", "barsac", "saint emilion", "st emilion", "pomerol", "fronsac", "listrac", "moulis"], village: "Haut-Médoc, Médoc, Graves" },
  { id: "mosel", name: "Mosel", file: "atlas-mosel.js?v=1", ll: [49.925, 6.968], country: "de", kind: "Einzellagen", kw: ["mosel", "saar", "ruwer"] },
  { id: "nahe", name: "Nahe", file: "atlas-nahe.js?v=1", ll: [49.84, 7.786], country: "de", kind: "Einzellagen", kw: ["nahe"] },
  { id: "pfalz", name: "Pfalz", file: "atlas-pfalz.js?v=1", ll: [49.383, 8.158], country: "de", kind: "Einzellagen", kw: ["pfalz", "palatinate"] },
  { id: "rheinhessen", name: "Rheinhessen", file: "atlas-rheinhessen.js?v=1", ll: [49.826, 8.16], country: "de", kind: "Einzellagen", kw: ["rheinhessen"] },
  { id: "mittelrhein", name: "Mittelrhein", file: "atlas-mittelrhein.js?v=1", ll: [50.183, 7.671], country: "de", kind: "Einzellagen", kw: ["mittelrhein"] },
  { id: "ahr", name: "Ahr", file: "atlas-ahr.js?v=1", ll: [50.536, 7.079], country: "de", kind: "Einzellagen", kw: ["ahr"] },
  { id: "rhone", name: "Rhône (north)", file: "atlas-rhone.js?v=1", ll: [45.201, 4.809], country: "fr", kind: "Cru appellations", kw: ["cote rotie", "condrieu", "chateau grillet", "hermitage", "ermitage", "crozes", "saint joseph", "st joseph", "cornas", "saint peray", "st peray"],
    regional: "Regional (Côtes du Rhône)" },
];
// the start page's other places: the Côte d'Or's own, richer atlas, and Piedmont, whose MGA have pages but no map
const ELSEWHERE = [{ id: "burgundy", name: "Côte d'Or", ll: [47.058, 4.839], country: "fr", kind: "The detailed atlas: owners, terrain, geology", href: "burgundy.html" },
  { id: "barolo", name: "Barolo", ll: [44.61, 7.94], country: "it", kind: "MGA · no map", href: "v/{L}/index.html#barolo" },
  { id: "barbaresco", name: "Barbaresco", ll: [44.725, 8.08], country: "it", kind: "MGA · no map", href: "v/{L}/index.html#barbaresco" }];
const COUNTRY = { fr: "France", de: "Germany", it: "Italy" };
const TYPE = { W: "Hvid", R: "Rød", RW: "Rød", S: "Bobler" };
const CLASS = { GC: "Grand cru", "1er": "Premier cru", AOC: "Cru appellation", EL: "Einzellage" };
const st = { region: null, pack: null, sel: null, view: null, show: { GC: true, "1er": true, AOC: true, EL: true, PT: true }, mine: false };
// classified châteaux (Bordeaux's 1855): points on the map, by rank; the classification as it's written on a label
const PTCLASS = { "1855-1": "First growth (1855)", "1855-2": "Second growth (1855)", "1855-3": "Third growth (1855)", "1855-4": "Fourth growth (1855)", "1855-5": "Fifth growth (1855)",
  "sau-0": "Superior first growth (1855)", "sau-1": "First growth, Sauternes (1855)", "sau-2": "Second growth, Sauternes (1855)" };
const PTLABEL = { "1855-1": "Premier grand cru classé", "1855-2": "Deuxième grand cru classé", "1855-3": "Troisième grand cru classé", "1855-4": "Quatrième grand cru classé",
  "1855-5": "Cinquième grand cru classé", "sau-0": "Premier cru supérieur", "sau-1": "Premier cru classé", "sau-2": "Deuxième cru classé" };
const PTSIZE = { "1855-1": 6.5, "1855-2": 5.5, "1855-3": 5, "1855-4": 4.5, "1855-5": 4, "sau-0": 6.5, "sau-1": 5.5, "sau-2": 4.5 };
const pts = () => (st.pack && st.pack.points) || [];
const short = n => n.replace(/^Château /, "");
const cls = c => c.c === "GC" ? "GC" : c.c === "AOC" ? "AOC" : c.unnamed ? "px" : "p1";
const isTop = c => c.c === "GC" || c.c === "AOC"; // drawn and labelled first
const noteOf = c => c.d && (c.d[window.I18N ? I18N.lang : "en"] || c.d.en);
const shown = c => c.c === "EL" ? c.ap : c.n; // a German site is known by its village too: Wehlener Sonnenuhr
const villagesPack = () => /IGN BD TOPO \(zone de végétation/.test(st.pack.meta.source); // Champagne: crus are villages
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
  P.climats.forEach(c => { c.el = el("path", { class: "cl " + cls(c), d: pathOf(c.g), "data-id": c.id }, g);
    el("title", {}, c.el).textContent = c.n; });
  const gd = el("g", {}, svg), gp = el("g", {}, svg); gLabels = el("g", {}, svg); // château dots under the labels
  P.climats.forEach(c => { if (!c.unnamed) c.lb = el("text", { class: "lb " + c.c, x: c.lp[0], y: c.lp[1] }, gLabels); if (c.lb) c.lb.textContent = c.n;
    c.dot = el("circle", { class: "dot", cx: c.lp[0], cy: c.lp[1], r: 0 }, gd); });
  pts().forEach(q => { if (!q.p) return; q.el = el("circle", { class: "pt", cx: q.p[0], cy: q.p[1], r: 0, "data-pt": q.id }, gp); el("title", {}, q.el).textContent = q.n;
    q.lb = el("text", { class: "lb pl", x: q.p[0], y: q.p[1] }, gLabels); q.lb.textContent = short(q.n); });
  paint();
}
function paint() {
  const P = st.pack; if (!P) return;
  P.climats.forEach(c => {
    const off = !st.show[c.c] || (st.mine && !CELLAR.by[c.id]);
    c.el.classList.toggle("dim", off); c.el.classList.toggle("sel", st.sel === c.id);
    const b = CELLAR.by[c.id]?.left || 0; c.dot.setAttribute("r", b ? 0 : 0); c.dot.dataset.b = b;
  });
  pts().forEach(q => { if (!q.el) return; q.el.classList.toggle("sel", st.sel === q.id); q.el.classList.toggle("has", !!CELLAR.by[q.id]);
    q.el.classList.toggle("dim", !st.show.PT || (st.mine && !CELLAR.by[q.id])); });
  layoutLabels();
}
// labels and bottle dots keep their size on screen: scaled by the zoom, hidden where they'd crowd
function layoutLabels() {
  const P = st.pack; if (!P || !st.view) return;
  const k = st.view[2] / svg.clientWidth || 1, taken = [];
  P.climats.slice().sort((a, b) => (isTop(a) ? 0 : 1) - (isTop(b) ? 0 : 1) || b.ha - a.ha).forEach(c => {
    const b = Number(c.dot.dataset.b || 0); c.dot.setAttribute("r", b ? (4 + Math.sqrt(b) * 1.6) * k : 0);
    if (!c.lb) return;
    c.lb.style.fontSize = (isTop(c) ? 14.5 : 13) * k + "px"; c.lb.style.strokeWidth = 3 * k + "px"; // style: it outranks the stylesheet
    const w = c.n.length * 7 * k, h = 15 * k, box = [c.lp[0] - w / 2, c.lp[1] - h, c.lp[0] + w / 2, c.lp[1]];
    const hide = !st.show[c.c] || (st.mine && !CELLAR.by[c.id]) || taken.some(o => !(box[2] < o[0] || box[0] > o[2] || box[3] < o[1] || box[1] > o[3]));
    c.lb.style.display = hide ? "none" : ""; if (!hide) taken.push(box);
  });
  // the châteaux: a dot a little bigger for a higher rank; names once you're close enough to read them
  pts().filter(q => q.el).sort((a, b) => PTSIZE[b.cls] - PTSIZE[a.cls]).forEach(q => {
    const off = !st.show.PT || (st.mine && !CELLAR.by[q.id]); q.el.setAttribute("r", off ? 0 : PTSIZE[q.cls] * k);
    q.lb.style.fontSize = 11.5 * k + "px"; q.lb.style.strokeWidth = 3 * k + "px"; q.lb.setAttribute("y", q.p[1] - 8 * k);
    const w = short(q.n).length * 6 * k, h = 13 * k, box = [q.p[0] - w / 2, q.p[1] - 8 * k - h, q.p[0] + w / 2, q.p[1] - 8 * k];
    const hide = off || st.view[2] > 25000 || taken.some(o => !(box[2] < o[0] || box[0] > o[2] || box[3] < o[1] || box[1] > o[3]));
    q.lb.style.display = hide ? "none" : ""; if (!hide) taken.push(box);
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
  const hd = !st.pack && tgt && tgt.closest && tgt.closest(".hd"); if (hd) { goTo(hd.dataset.id); return; }
  if (moved < 6) { const q = tgt && tgt.closest && tgt.closest(".pt"), c = tgt && tgt.closest && tgt.closest(".cl"); select(q ? q.dataset.pt : c ? c.dataset.id : null); } });
svg.addEventListener("pointercancel", up);
$("zIn").onclick = () => { const [x, y, w, h] = st.view; zoomAt(.6, x + w / 2, y + h / 2); };
$("zOut").onclick = () => { const [x, y, w, h] = st.view; zoomAt(1 / .6, x + w / 2, y + h / 2); };
$("zHome").onclick = () => fit(st.home);
addEventListener("resize", () => { if (st.view) layoutLabels(); });

/* ---------- the side panel ---------- */
const byId = id => st.pack && (st.pack.climats.find(c => c.id === id) || pts().find(q => q.id === id));
function select(id, fly) {
  st.sel = byId(id) ? id : null; paint(); renderSide(); syncHash();
  const c = st.sel && byId(st.sel);
  if (c && fly) { if (c.g) fit(bbOf(c.g), .6); else if (c.p) fit([c.p[0] - 900, c.p[1] - 900, c.p[0] + 900, c.p[1] + 900], .1); }
}
function renderSide() {
  const P = st.pack, side = $("side"); if (!P) return renderHomeSide();
  const c = st.sel && byId(st.sel), R = st.region;
  if (!c) {
    const gc = P.climats.filter(x => x.c === "GC"), pc = P.climats.filter(x => x.c === "1er" && !x.unnamed), aoc = P.climats.filter(x => x.c === "AOC"), many = P.villages.length > 1;
    const sum = list => fmtHa(list.reduce((s, x) => s + x.ha, 0)) + " ha", fact = (l, v) => `<div class="fact"><div class="l">${esc(l)}</div><div class="v">${v}</div></div>`;
    const el = P.climats.filter(x => x.c === "EL");
    const lead = el.length ? t("{0} Einzellagen from the Weinbergsrolle. Click one.", el.length) : villagesPack() ? t("{0} grand cru and {1} premier cru villages, drawn as the vines inside each village (IGN). Click a village.", gc.length, pc.length)
      : aoc.length ? t("{0} cru appellations on INAO's own map. Click one.", aoc.length)
      : gc.length && pc.length ? t("{0} grands crus and {1} premiers crus on INAO's own map. Click a vineyard.", gc.length, pc.length)
      : gc.length ? t("{0} grands crus on INAO's own map. Click a vineyard.", gc.length) : t("{0} premiers crus on INAO's own map. Click a vineyard.", pc.length);
    // the lists: Champagne's by sub-region, the premiers crus by village appellation where there are several
    const groups = (list, label) => { const by = {}; list.forEach(x => (by[x.area || (many ? x.app : "")] ??= []).push(x));
      return Object.entries(by).map(([k, l]) => `<h3>${esc(k ? (many && !x0(l).area ? t("{0} premier cru", k) : t(label + " · {0}", k)) : t(label))}</h3><ul class="list">${l.map(x => row(x)).join("")}</ul>`).join(""); };
    const x0 = l => l[0];
    side.innerHTML = `<h2>${esc(P.meta.name)}</h2>
      <p class="meta">${esc(lead)}</p>
      <div class="facts">${gc.length ? fact(t("Grand cru"), sum(gc)) : ""}${P.climats.some(x => x.c === "1er") ? fact(t("Premier cru"), sum(P.climats.filter(x => x.c === "1er"))) : ""}${aoc.length ? fact(t("Cru appellation"), sum(aoc)) : ""}${el.length ? fact(t("Vines (Weinbergsrolle)"), sum(el.filter(x => x.reg))) : ""}
        ${P.villages.map(v => fact(P.villages.length > 1 || !R.village ? v.ap : t(R.village), fmtHa(v.ha) + " ha")).join("")}
        ${P.regional.ha ? fact(t(R.regional), fmtHa(P.regional.ha) + " ha") : ""}</div>
      ${many && pc.length ? `<p class="note">${esc(t("Village figures are the land outside the premiers crus."))}</p>` : ""}
      ${cellarSummary()}
      ${gc.length ? groups(gc, "Grand cru") : ""}${pc.length ? groups(pc, "Premier cru") : ""}
      ${aoc.length ? `<h3>${esc(t("Cru appellation"))}</h3><ul class="list">${aoc.map(x => row(x)).join("")}</ul>` : ""}
      ${Object.entries(el.reduce((o, x) => ((o[x.area] ??= []).push(x), o), {})).map(([k, l]) => `<h3>${esc(t("Bereich {0}", k))}</h3><ul class="list">${l.sort((a, b) => shown(a).localeCompare(shown(b), "de")).map(x => row(x)).join("")}</ul>`).join("")}
      ${Object.keys(PTCLASS).filter(k => pts().some(q => q.cls === k)).map(k => `<h3>${esc(t(PTCLASS[k]))}</h3><ul class="list">${pts().filter(q => q.cls === k).map(q => ptRow(q)).join("")}</ul>`).join("")}
      ${pts().some(q => !q.p) ? `<p class="note">° ${esc(t("Not on IGN's map under its own name, so not drawn."))}</p>` : ""}
      ${pc.some(x => x.inferred) ? `<p class="note">* ${esc(t("INAO's map doesn't name this land; the name comes from IGN's place names inside or next to it."))}</p>` : ""}
      <p class="src">${esc(P.meta.source)}. ${esc(t("Built {0}.", P.meta.built))}</p>`;
  } else if (!c.g) { // a classified château
    const bottles = CELLAR.by[c.id];
    side.innerHTML = `<p><button class="btn" id="back">← ${esc(P.meta.name)}</button></p>
      <span class="pill GC">${esc(t(PTCLASS[c.cls]))}</span>
      <h2>${esc(c.n)}</h2>
      <div class="meta">${esc(c.ap)} · ${esc(PTLABEL[c.cls])}</div>
      <p class="note">${esc(c.p ? t("On IGN's map as “{0}”.", c.ign) : t("Not on IGN's map under its own name, so not drawn."))}</p>
      ${bottles ? `<h3>${esc(t("In your cellar"))}</h3>` + bottles.wines.slice(0, 12).map(w => `<div class="cw"><b>${w.left}×</b> ${esc(w.producer)} · ${esc(w.name || "")} ${esc(String(w.vintage || ""))}</div>`).join("") : ""}
      <p><button class="btn primary" id="addHere">＋ ${esc(t("Add a bottle from here"))}</button></p>
      <p class="src">${esc(t("The 1855 classification; châteaux placed on IGN BD TOPO (Licence Ouverte)."))}</p>`;
    $("back").onclick = () => select(null);
    $("addHere").onclick = () => addFromAtlas(c, R);
  } else {
    const parent = c.parent && byId(c.parent), bottles = CELLAR.by[c.id];
    side.innerHTML = `<p><button class="btn" id="back">← ${esc(P.meta.name)}</button></p>
      <span class="pill ${cls(c)}">${esc(t(CLASS[c.c]))}</span>
      <h2>${esc(shown(c))}</h2>
      <div class="meta">${esc(c.c === "EL" ? c.n : c.ap)}${parent ? " · " + esc(t("within {0}", parent.n)) : ""}${c.gl ? " · " + esc(t("Großlage {0}", c.gl)) : ""}</div>
      ${c.c === "EL" ? `<div class="facts"><div class="fact"><div class="l">${esc(t("Vines (Weinbergsrolle)"))}</div><div class="v">${c.reg ? fmtHa(c.ha) + " ha" : "—"}</div></div>
        <div class="fact"><div class="l">${esc(t("Outline on the map"))}</div><div class="v">${fmtHa(c.haMap)} ha</div></div></div>
        <p class="note">${esc(t("Gemarkung: {0}", c.gm.join(", ")))} · ${esc(t("Bereich {0}", c.area))}</p>`
      : `<div class="facts"><div class="fact"><div class="l">${esc(t(villagesPack() ? "Vines (IGN)" : "INAO area"))}</div><div class="v">${fmtHa(c.ha)} ha</div></div>
        <div class="fact"><div class="l">${esc(t("Acres"))}</div><div class="v">${(c.ha * 2.471).toFixed(c.ha < 4 ? 1 : 0)}</div></div></div>`}
      ${noteOf(c) ? `<p class="note">${esc(noteOf(c))}</p>` : ""}
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
const ptRow = q => `<li><button data-c="${esc(q.id)}">${esc(short(q.n))}${q.p ? "" : " °"}</button><span>${esc(q.ap)}${CELLAR.by[q.id] ? " · 🍷 " + CELLAR.by[q.id].left : ""}</span></li>`;
const row = x => `<li><button data-c="${esc(x.id)}">${esc(shown(x))}${x.inferred ? " *" : ""}</button><span>${fmtHa(x.ha)} ha${CELLAR.by[x.id] ? " · 🍷 " + CELLAR.by[x.id].left : ""}</span></li>`;
function cellarSummary() {
  if (!CELLAR.loaded) return `<p class="note">${esc(t(CELLAR.msg))}</p>`;
  const n = Object.values(CELLAR.by).reduce((s, b) => s + b.left, 0), nc = Object.keys(CELLAR.by).length;
  return `<p class="note">🍷 ${esc(nc ? t(n > 1 ? "{0} bottles across {1} climats" : "{0} bottle in {1} climat", n, nc) : t("No bottles matched to a climat yet."))}${CELLAR.other ? " · " + esc(t("{0} more of this region's wines without a named climat", CELLAR.other)) : ""}</p>`;
}
// "Add a bottle from here": the cellar's add form, filled in (handed over in localStorage, read once by index.html)
function addFromAtlas(c, R) {
  if (!c.g) { // a château: the producer is the château, the classification as on its label
    const pre = { name: "", producer: c.n, commune: c.ap, classification: PTLABEL[c.cls], region: st.pack.meta.region, country: st.pack.meta.country,
      type: /^sau/.test(c.cls) ? "Hvid" : "Rød", at: Date.now() };
    try { localStorage.setItem("vinAddPrefill", JSON.stringify(pre)); } catch (e) {}
    location.href = "index.html#add"; return;
  }
  // a cru appellation or a Champagne village is where the wine is from, not its name
  const pre = { name: c.c === "AOC" || villagesPack() ? "" : shown(c), commune: c.app, classification: { GC: "Grand cru", "1er": "1. cru" }[c.c] || "", region: st.pack.meta.region, country: st.pack.meta.country,
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
  // a classified château by its name on the bottle (producer or wine): the longest name wins (Lamothe Guignard over Lamothe)
  const who = norm([w.producer, w.name].join(" "));
  let pt = null;
  for (const q of pts()) { const k = norm(short(q.n)).trim(); if (k.length > 3 && who.includes(" " + k + " ") && (!pt || k.length > pt.k)) pt = { q, k: k.length }; }
  if (pt) return { region: true, c: pt.q };
  let best = null;
  for (const c of st.pack.climats) {
    if (c.unnamed) continue;
    // a climat whose appellation is on the label too beats a namesake elsewhere (Clos du Roy, in Mercurey and Montagny)
    // (a German site: one of its villages on the label, "Wehlen", "Niederhäuser" for Niederhausen; without it the site's
    // name alone isn't enough, there are five Sonnenuhrs)
    const own = all.includes(norm(c.app)) || (c.gm || []).some(g => { const k = norm(g).trim().split(" ")[0]; return k.length > 3 && all.includes(" " + k.slice(0, Math.max(4, k.length - 2))); });
    if (c.c === "EL" && !own) continue;
    for (const a of [c.n].concat(c.inferred ? c.places || [] : [], c.aka || [])) { const k = norm(a).trim(), sc = k.length + (own ? 100 : 0);
      // short names (Aÿ, Oger) only from the commune field, where they stand alone
      if ((k.length > 3 && label.includes(" " + k + " ") || norm(w.commune).trim() === k) && (!best || sc > best.k)) best = { c, k: sc }; }
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
/* ---------- the start page: Europe, a dot for every region ---------- */
const allPlaces = () => REGIONS.concat(ELSEWHERE);
function goTo(id) {
  const x = allPlaces().find(r => r.id === id); if (!x) return;
  if (x.href) location.href = x.href.replace("{L}", window.I18N ? I18N.lang : "en"); else location.hash = "#r=" + id;
}
function showHome() {
  st.region = null; st.pack = null; st.sel = null; st.view = null;
  document.title = "AllWine — " + t("Wine atlas"); $("regionName").textContent = ""; $("fRegion").value = "";
  document.body.classList.add("home");
  // France, Germany and the north of Italy, on a plain grid (longitude shrunk by the cosine of 47°)
  const W = 1000, lo0 = -2.6, lo1 = 13.6, la0 = 43.3, la1 = 51.7, k = W / ((lo1 - lo0) * Math.cos(47 * Math.PI / 180)), H = Math.round((la1 - la0) * k);
  const xy = ([lo, la]) => [((lo - lo0) * Math.cos(47 * Math.PI / 180) * k).toFixed(1), ((la1 - la) * k).toFixed(1)];
  svg.innerHTML = ""; svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const g = el("g", {}, svg);
  for (const [n, ring] of Object.entries(window.EUROPE_LANDS || {}))
    el("path", { class: "land" + (/^(France|Germany|Italy)/.test(n) ? " on" : ""), d: "M" + ring.map(xy).map(q => q.join(" ")).join("L") + "Z" }, g);
  for (const r of allPlaces()) {
    const [x, y] = xy([r.ll[1], r.ll[0]]), a = el("g", { class: "hd" + (r.href ? " out" : ""), "data-id": r.id, tabindex: 0, role: "link", "aria-label": r.name }, g);
    el("circle", { cx: x, cy: y, r: r.id === "burgundy" ? 9 : 7 }, a);
    // labels west of the dot where the Rhine regions crowd, east elsewhere
    const west = ["nahe", "mosel", "ahr", "maconnais", "chalonnaise", "barolo"].includes(r.id);
    const lb = el("text", { x: +x + (west ? -12 : 12), y: +y + 4, "text-anchor": west ? "end" : "start" }, a); lb.textContent = r.name;
    a.onkeydown = e => { if (e.key === "Enter") goTo(r.id); };
  }
  renderLegend(); renderHomeSide();
}
function renderHomeSide() {
  const by = c => allPlaces().filter(r => r.country === c);
  $("side").innerHTML = `<h2>${esc(t("Wine atlas"))}</h2>
    <p class="meta">${esc(t("Every region here is drawn from its official map: INAO's for France, the Weinbergsrolle for Germany. Pick one."))}</p>
    ${Object.entries(COUNTRY).map(([c, n]) => `<h3>${esc(t(n))}</h3><ul class="list">${by(c).map(r => `<li><button data-go="${r.id}">${esc(r.name)}${r.href ? " ↗" : ""}</button><span>${esc(t(r.kind))}</span></li>`).join("")}</ul>`).join("")}
    ${cellarSummaryHome()}`;
  $("side").querySelectorAll("button[data-go]").forEach(b => b.onclick = () => goTo(b.dataset.go));
}
const cellarSummaryHome = () => CELLAR.loaded ? "" : `<p class="note">${esc(t(CELLAR.msg))}</p>`;

function syncHash() {
  const h = "#r=" + st.region.id + (st.sel ? "&c=" + st.sel : "");
  if (location.hash !== h) history.replaceState(null, "", location.pathname + location.search + h);
}
async function openRegion(id, sel) {
  const R = REGIONS.find(r => r.id === id) || REGIONS[0];
  if (!(window.ATLAS_PACKS && ATLAS_PACKS[R.id])) await loadScript(R.file);
  document.body.classList.remove("home");
  st.region = R; st.pack = ATLAS_PACKS[R.id]; st.sel = null; $("fRegion").value = R.id; $("regionName").textContent = " · " + st.pack.meta.name;
  document.title = "AllWine — " + st.pack.meta.name + " · " + t("Wine atlas");
  $("climatList").innerHTML = st.pack.climats.filter(c => !c.unnamed).concat(pts()).map(c => `<option value="${esc(shown(c))}">`).join("");
  // start on the crus (the regional land around them can be far bigger, and long and thin)
  st.home = bbOf(st.pack.climats.flatMap(c => c.g));
  for (const [f, k] of [["fGC", "GC"], ["f1er", "1er"], ["fAOC", "AOC"], ["fEL", "EL"]]) $(f).parentNode.hidden = !st.pack.climats.some(c => c.c === k);
  $("fPts").parentNode.hidden = !pts().length;
  place(); draw(); fit(st.home); renderLegend();
  if (sel && byId(sel)) select(sel, true); else { renderSide(); syncHash(); }
}
function renderLegend() {
  const P = st.pack; if (!P) { $("legend").innerHTML = ""; return; }
  const has = k => P.climats.some(c => c.c === k);
  $("legend").innerHTML = [has("GC") && ["var(--gc)", "Grand cru"], has("1er") && ["var(--pc)", "Premier cru"], has("AOC") && ["var(--ac)", "Cru appellation"], has("EL") && ["var(--pc)", "Einzellage"],
    P.climats.some(c => c.unnamed) && ["var(--pcx)", "Premier cru, unnamed by INAO"],
    P.villages.length && ["var(--vc)", st.region.village || (P.villages.length > 1 ? "Village appellations" : P.villages[0].ap)], P.regional.ha && ["var(--rg)", st.region.regional],
    pts().length && ["var(--ink)", "Classified château (1855)"]].filter(Boolean)
    .map(([c, n]) => `<span><i style="background:${c}"></i>${esc(t(n))}</span>`).join("") + (CELLAR.loaded ? `<span><i style="background:var(--gold);border-radius:50%"></i>${esc(t("Bottles in your cellar"))}</span>` : "");
}
$("fRegion").innerHTML = `<option value="">${esc(t("All regions"))}</option>` + REGIONS.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join("") + `<option value="burgundy">${esc(t("Côte d'Or (Burgundy atlas) ↗"))}</option>`;
$("fRegion").onchange = e => { const v = e.target.value; if (v === "burgundy") { location.href = "burgundy.html"; return; } location.hash = v ? "#r=" + v : ""; };
$("fGC").onchange = e => { st.show.GC = e.target.checked; paint(); };
$("f1er").onchange = e => { st.show["1er"] = e.target.checked; paint(); };
$("fAOC").onchange = e => { st.show.AOC = e.target.checked; paint(); };
$("fEL").onchange = e => { st.show.EL = e.target.checked; paint(); };
$("fPts").onchange = e => { st.show.PT = e.target.checked; paint(); };
$("fMine").onchange = e => { st.mine = e.target.checked; paint(); };
$("fSearch").addEventListener("change", e => { const q = norm(e.target.value); const all = st.pack.climats.concat(pts()), c = all.find(x => norm(shown(x)) === q) || all.find(x => norm(x.n) === q) || all.find(x => !x.unnamed && norm(shown(x)).includes(q.trim())); if (c) { select(c.id, true); e.target.value = ""; } });
if (window.I18N) { I18N.picker && document.querySelectorAll("[data-langpick]").forEach(I18N.picker); I18N.onChange(() => { renderSide(); renderLegend(); }); }

// #r=chablis&c=les_clos, or &w=<a wine's name> from the cellar's "On the map": its vineyard if the atlas knows it
async function fromHash() {
  const q = new URLSearchParams(location.hash.slice(1)), r = q.get("r");
  if (!r || !REGIONS.some(x => x.id === r)) { if (st.region || !svg.childNodes.length) showHome(); return; } // no region: the start page
  if (!st.region || st.region.id !== r) await openRegion(r, q.get("c"));
  else if ((q.get("c") || null) !== st.sel) select(q.get("c"), true);
  if (q.get("w") && st.region) { const m = matchWine({ region: st.region.kw[0], name: q.get("w") }); if (m.c) select(m.c.id, true); else syncHash(); }
}
// a link or Back that only changes the hash doesn't reload the page
addEventListener("hashchange", () => { fromHash().then(() => { if (st.pack) { place(); paint(); renderSide(); } }); });
fromHash().then(loadCellar);
