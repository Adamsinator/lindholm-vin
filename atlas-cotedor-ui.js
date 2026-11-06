// The Côte d'Or's own tools on the Wine atlas's engine (atlas.js loads this with that region only): who owns each climat,
// and the map of one owner's holdings. It runs in atlas.js's scope (a classic script: st, t, esc, fmtHa, paint, fit…).
"use strict";
window.ATLAS_CD = (() => {
  document.head.insertAdjacentHTML("beforeend", `<style>.sharebar{display:flex;height:10px;border-radius:5px;overflow:hidden;background:var(--line);margin:6px 0 8px} .sharebar span{background:var(--gc);border-right:1px solid var(--card)}
table.own{width:100%;border-collapse:collapse;font-size:13.5px} table.own td{padding:5px 0;border-bottom:1px solid var(--line);vertical-align:top} table.own td.n{text-align:right;white-space:nowrap;padding-left:8px}
table.own .pb{display:block;height:3px;margin-top:4px;border-radius:2px;background:var(--gc);opacity:.55} .ktag{font-size:11.5px;color:var(--muted)} .plink{border:0;background:none;padding:0;font:inherit;color:var(--accent);cursor:pointer;text-align:left} .plink:hover,.plink.on{text-decoration:underline}
.prodbar{display:flex;align-items:center;gap:8px;margin:0 0 12px;padding:8px 10px;border-radius:10px;background:color-mix(in srgb,var(--gc) 12%,var(--card));font-size:13.5px} .prodbar span{flex:1} .hsw{display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--gc);margin-right:6px;vertical-align:-1px}</style>`); // its own styles, with it
/* ---------- who owns it (the Côte d'Or's pack: owners from AllWine's compiled list, approximate) ---------- */
const OWN_KIND = { f: "leased", s: "buys grapes" }; // a holding's 3rd element; absent = owned
// one owner's holdings: a click on a name keeps only the climats they hold on the map, with the total in the panel
const holds = (c, k) => c.mono === k || (c.own || []).some(h => h[0] === k);
const shownFor = (c, k) => holds(c, k) || (!!st.prod2 && holds(c, st.prod2)); // the map, comparing two owners: both
function prodBar() {
  const P = st.pack && st.pack.producers; if (!P || !st.prod) return "";
  const list = st.pack.climats.filter(c => holds(c, st.prod)), ha = list.reduce((s, c) => s + (c.mono === st.prod ? c.ha : ((c.own.find(h => h[0] === st.prod) || [])[1] || 0)), 0);
  producerList();
  return `<div class="prodbar"><span>${esc(t("Showing the holdings of {0}: {1} climats", P[st.prod] || st.prod, list.length))}${ha ? " · " + esc(fmtHa(ha)) + " ha" : ""}
    <label class="pcmp">${esc(t("Compare with"))} <input id="prodCmp" list="allProducers" value="${esc(st.prod2 ? P[st.prod2] || "" : "")}" placeholder="${esc(t("another producer"))}"></label></span><button type="button" class="px" id="prodX" aria-label="${esc(t("Show every owner"))}">✕</button></div>`;
}
// two owners side by side: their holdings climat by climat, and the totals (both are kept on the map)
const heldBy = k => st.pack.climats.filter(c => holds(c, k)).map(c => ({ c, h: c.mono === k && !(c.own || []).some(x => x[0] === k) ? [k, c.ha, "", null] : (c.own || []).find(x => x[0] === k) }));
function compareHtml() {
  const P = st.pack.producers, a = st.prod, b = st.prod2; if (!a || !b) return "";
  const rows = new Map(); [[a, 0], [b, 1]].forEach(([k, i]) => heldBy(k).forEach(({ c, h }) => { const e = rows.get(c.id) || { c, v: [null, null] }; e.v[i] = h; rows.set(c.id, e); }));
  const ORD = { GC: 0, "1er": 1, V: 2 }, list = [...rows.values()].sort((x, y) => ORD[x.c.c] - ORD[y.c.c] || x.c.n.localeCompare(y.c.n, "fr"));
  const cell = h => !h ? `<td class="n">—</td>` : h[2] === "s" ? `<td class="n"><span class="ktag">${esc(t("buys grapes"))}</span></td>` : `<td class="n">${h[1] != null ? `<b>${fmtHa(h[1])}</b> ha` : esc(t("holder"))}${h[2] === "f" ? ` <span class="ktag">${esc(t("leased"))}</span>` : ""}</td>`;
  const tot = k => heldBy(k).reduce((s, { h }) => s + (h && h[2] !== "s" && h[1] ? h[1] : 0), 0), n = (k, cl) => heldBy(k).filter(({ c, h }) => c.c === cl && h && h[2] !== "s").length;
  return `<h3>${esc(t("Compare two producers"))}</h3><table class="own cmpt"><thead><tr><th></th><th class="n">${esc(P[a])}</th><th class="n">${esc(P[b])}</th></tr></thead><tbody>
    <tr class="tot"><td>${esc(t("Published hectares on the map"))}</td><td class="n"><b>${fmtHa(tot(a))}</b></td><td class="n"><b>${fmtHa(tot(b))}</b></td></tr>
    <tr class="tot"><td>${esc(t("Grands crus · premiers crus"))}</td><td class="n">${n(a, "GC")} · ${n(a, "1er")}</td><td class="n">${n(b, "GC")} · ${n(b, "1er")}</td></tr>
    ${list.map(({ c, v }) => `<tr><td><button type="button" class="plink" data-c="${esc(c.id)}">${esc(c.n)}</button> <span class="note">${esc(c.app)}</span></td>${cell(v[0])}${cell(v[1])}</tr>`).join("")}</tbody></table>`;
}
function producerList() { if ($("allProducers")) return; const P = st.pack.producers;
  document.body.insertAdjacentHTML("beforeend", `<datalist id="allProducers">${Object.keys(P).filter(k => st.pack.climats.some(c => holds(c, k))).map(k => P[k]).sort((x, y) => x.localeCompare(y, "fr")).map(n => `<option value="${esc(n)}">`).join("")}</datalist>`); }
function setProd(k) { st.prod = k || null; if (!k) st.prod2 = null; paint(); renderSide();
  if (k) { const list = st.pack.climats.filter(c => holds(c, k)); if (list.length) fit(bbOf(list.flatMap(c => c.g)), .12, 380); } }
function ownersHtml(c) {
  const P = st.pack.producers; if (!P) return ""; editsLoad();
  const rows = [...(c.own || [])].sort((a, b) => (a[2] === "s") - (b[2] === "s") || (b[1] ?? -1) - (a[1] ?? -1));
  const known = rows.filter(r => r[1] && r[2] !== "s").reduce((s, r) => s + r[1], 0), rest = Math.max(0, c.ha - known);
  const seg = rows.filter(r => r[1] && r[2] !== "s").map(([k, h], i) => `<span title="${esc(P[k] || k)} · ${fmtHa(h)} ha" style="width:${(100 * h / c.ha).toFixed(2)}%;opacity:${(1 - (i % 6) / 8).toFixed(2)}"></span>`).join("");
  const body = rows.map(([k, h, kind, since]) => { const share = h && kind !== "s" ? 100 * h / c.ha : null;
    return `<tr><td><button type="button" class="plink${st.prod === k ? " on" : ""}" data-prod="${esc(k)}" title="${esc(t("Show everything {0} holds", P[k] || k))}">${esc(P[k] || k)}</button>${edTag(c, k)}${EDITS.can ? ` <button type="button" class="edbtn" data-ed="${esc(k)}" title="${esc(t("Correct this holding"))}">✎</button>` : ""}${kind || since ? ` <span class="ktag">${esc([kind && t(OWN_KIND[kind]), since && t("since {0}", since)].filter(Boolean).join(" · "))}</span>` : ""}${share != null ? `<span class="pb" style="width:${Math.max(2, share).toFixed(1)}%"></span>` : ""}</td>
      <td class="n">${kind === "s" ? "" : h != null ? `<b>${fmtHa(h)}</b> ha` : esc(t("holder"))}</td><td class="n">${share != null ? (share < 1 ? share.toFixed(1) : Math.round(share)) + "%" : ""}</td></tr>`; }).join("");
  const cover = c.mono ? t("Monopole: the whole climat belongs to {0}.", P[c.mono] || c.mono)
    : !rows.length ? t("No ownership details on file for this climat.")
    : known >= c.ha * .98 ? t("The owners listed cover essentially the whole climat (published figures are rounded).")
    : known ? t("Owners with a published figure account for {0} of {1} ha ({2}%); the other {3} ha belongs to {4}smaller growers.", fmtHa(known), fmtHa(c.ha), Math.round(100 * known / c.ha), fmtHa(rest), rows.some(r => r[1] == null) ? t("the holders listed without a figure and ") : "")
    : t("Notable owners; individual holdings not listed.");
  return `<h3>${esc(t("Owners"))}</h3>${known ? `<div class="sharebar" aria-hidden="true">${seg}</div>` : ""}<p class="note">${esc(cover)}</p>${rows.length ? `<table class="own">${body}</table>` : ""}${removedHtml(c)}${editHtml(c)}`;
}
  /* ---------- corrections: edits to the holdings, shared through the cellar's Google Sheet (Code.gs "atlas" reads them,
     "atlasedit" adds one, for a logged-in editor), applied over the compiled list in time order — the same store
     burgundy.html uses, so every correction made there shows here ---------- */
  const EDITS = { list: [], can: (() => { try { return !!localStorage.getItem("vinToken"); } catch (e) { return false; } })(), status: "", open: null, pre: null, loaded: false };
  function keyFor(name) { const P = st.pack.producers; if (P[name]) return name;
    const n = norm(name), hit = Object.keys(P).find(k => norm(P[k]) === n); if (hit) return hit;
    const k = "x_" + n.replace(/[^a-z0-9]+/g, "_").slice(0, 40); P[k] = name; return k; }
  function applyEdits() {
    st.pack.climats.forEach(c => { if (!c.own0) c.own0 = (c.own || []).map(x => [...x]); c.own = c.own0.map(x => [...x]); c.edited = {}; c.removed = []; });
    const by = Object.fromEntries(st.pack.climats.map(c => [c.id, c]));
    [...EDITS.list].sort((a, b) => String(a.time).localeCompare(String(b.time))).forEach(e => { const c = by[e.climat]; if (!c) return;
      const key = keyFor(e.producer), i = c.own.findIndex(x => x[0] === key);
      if (e.action === "remove") { if (i >= 0) c.own.splice(i, 1); c.removed.push({ key, e }); delete c.edited[key]; return; }
      const row = [key, e.ha == null || e.ha === "" || isNaN(e.ha) ? null : +e.ha, e.kind || "", e.since || null];
      if (i >= 0) c.own[i] = row; else c.own.push(row);
      c.edited[key] = e; c.removed = c.removed.filter(x => x.key !== key); });
  }
  async function editsLoad() {
    if (EDITS.loaded) return; EDITS.loaded = true; const api = apiUrl(); if (!api) return;
    try { const data = await (await fetch(api, { method: "POST", body: JSON.stringify({ action: "atlas" }), redirect: "follow" })).json();
      // an Apps Script from before the atlas answers "bad-code" (no session) or "bad-action"
      if (!data.ok) { EDITS.status = ["bad-action", "bad-code"].includes(data.error) ? "redeploy" : data.error; renderSide(); return; }
      EDITS.list = data.edits || []; EDITS.status = "ok"; applyEdits(); paint(); renderSide();
    } catch (e) { EDITS.status = "offline"; }
  }
  const edTag = (c, k) => { const e = c.edited && c.edited[k]; return e ? ` <span class="ktag ed" title="${esc([e.note, e.time, e.user].filter(Boolean).join(" · "))}">${esc(t("✎ corrected"))}</span>` : ""; };
  function removedHtml(c) { if (!c.removed || !c.removed.length) return "";
    return `<p class="note">${esc(t("Removed by correction: {0}.", c.removed.map(({ key }) => st.pack.producers[key] || key).join(", ")))}</p>`; }
  function editHtml(c) {
    if (!EDITS.can) return `<p class="note">${esc(t("Spotted a wrong figure? Log in on the Cellar page and you can correct it here."))}</p>`;
    if (EDITS.status === "redeploy") return `<p class="note">${esc(t("Corrections need the updated Apps Script: redeploy Code.gs (see README)."))}</p>`;
    if (EDITS.open !== c.id) return `<p><button type="button" class="btn" id="edOpen">${esc(t("✎ Correct the holdings"))}</button></p>`;
    const pre = EDITS.pre || {};
    if (!$("allProducers")) document.body.insertAdjacentHTML("beforeend", `<datalist id="allProducers">${Object.values(st.pack.producers).sort().map(n => `<option value="${esc(n)}">`).join("")}</datalist>`);
    return `<form class="edform" id="edForm"><h3>${esc(t("Correct a holding"))}</h3>
      <label>${esc(t("Producer"))}<input id="edP" list="allProducers" value="${esc(pre.p || "")}" required></label>
      <div class="edrow"><label>${esc(t("Hectares"))}<input id="edHa" type="number" step="0.01" min="0" max="200" value="${pre.ha ?? ""}" placeholder="${esc(t("unknown"))}"></label>
        <label>${esc(t("Kind"))}<select id="edK"><option value="">${esc(t("owned"))}</option><option value="f"${pre.k === "f" ? " selected" : ""}>${esc(t("leased"))}</option><option value="s"${pre.k === "s" ? " selected" : ""}>${esc(t("buys grapes"))}</option></select></label>
        <label>${esc(t("Since"))}<input id="edS" type="number" min="1000" max="2200" value="${esc(pre.s || "")}" placeholder="${esc(t("vintage"))}"></label></div>
      <label>${esc(t("Source / note"))}<input id="edN" placeholder="${esc(t("e.g. domaine website, 2024 tech sheet"))}" required></label>
      <div class="edrow"><button class="btn primary" type="submit">${esc(t("Save"))}</button><button class="btn" type="button" id="edRemove">${esc(t("Remove this producer"))}</button><button class="btn quiet" type="button" id="edCancel">${esc(t("Cancel"))}</button></div>
      <p class="note" id="edMsg">${esc(t("Corrections are shared with everyone who opens the atlas and logged with your name."))}</p></form>`;
  }
  async function saveEdit(c, action) {
    const name = $("edP").value.trim(), note = $("edN").value.trim();
    if (!name) { $("edMsg").textContent = t("Pick or type a producer."); return; }
    if (!note) { $("edMsg").textContent = t("Add where the figure comes from: it helps the next person."); return; }
    const key = keyFor(name), edit = { climat: c.id, producer: key.startsWith("x_") ? name : key, action, ha: $("edHa").value === "" ? "" : Number($("edHa").value), kind: $("edK").value, since: $("edS").value, note };
    $("edMsg").textContent = t("Saving…");
    try { const data = await (await fetch(apiUrl(), { method: "POST", redirect: "follow", body: JSON.stringify({ user: localStorage.getItem("vinUser") || "", token: localStorage.getItem("vinToken") || "", action: "atlasedit", edit }) })).json();
      if (!data.ok) { $("edMsg").textContent = data.error === "bad-action" ? t("The Apps Script needs redeploying first (see README).") : data.error === "bad-token" ? t("Your session expired: log in on the Cellar page again.")
        : data.error === "not-an-atlas-editor" ? t("Your account isn't on the atlas editors list.") : t("Couldn't save: {0}", data.error); return; }
      EDITS.list = data.edits || []; EDITS.open = null; EDITS.pre = null; applyEdits(); renderSide(); paint();
    } catch (e) { $("edMsg").textContent = t("Couldn't reach the cellar API."); }
  }
  function wire(side, c) {
    const pc = $("prodCmp"); if (pc) pc.onchange = () => { const P = st.pack.producers, n = norm(pc.value), k = Object.keys(P).find(x => norm(P[x]) === n);
      st.prod2 = k && k !== st.prod ? k : null; paint(); renderSide(); if (st.prod2) fit(bbOf(st.pack.climats.filter(x => shownFor(x, st.prod)).flatMap(x => x.g)), .12, 380); };
    const cm = $("cmpTable"); if (cm) cm.querySelectorAll("button[data-c]").forEach(b => b.onclick = () => select(b.dataset.c, true));
    if (!c) return;
    const o = $("edOpen"); if (o) o.onclick = () => { EDITS.open = c.id; EDITS.pre = null; renderSide(); };
    side.querySelectorAll("[data-ed]").forEach(b => b.onclick = () => { const row = (c.own || []).find(x => x[0] === b.dataset.ed) || [];
      EDITS.open = c.id; EDITS.pre = { p: st.pack.producers[b.dataset.ed], ha: row[1], k: row[2], s: row[3] }; renderSide(); });
    const f = $("edForm"); if (!f) return;
    f.onsubmit = ev => { ev.preventDefault(); saveEdit(c, "set"); }; $("edRemove").onclick = () => saveEdit(c, "remove"); $("edCancel").onclick = () => { EDITS.open = null; renderSide(); }; }
  /* ---------- historic rankings (burgundy-history.js: Lavalle 1855, the Beaune committee 1860, Rodier 1920), fetched
     the first time a climat's panel opens ---------- */
  const HSRC = { lavalle1855: "Lavalle 1855", comite1860: "Comité de Beaune 1860", rodier1920: "Rodier 1920" };
  // each source has its own ladder (the 1860 committee had no tête de cuvée: its 1ère classe is the top), rank → 0 (top) … 3
  const HLADDER = { lavalle1855: [/hors|tête|tete/, /^1/, /^2/, /^3|^4/], comite1860: [/^1/, /^2/, /^3/], rodier1920: [/tête|tete/, /premi/, /deux/, /trois/] };
  const hRank = (src, r) => { const s0 = String(r || "").toLowerCase(), i = (HLADDER[src] || []).findIndex(re => re.test(s0)); return i < 0 ? null : i; };
  let HIST = window.BURG_HISTORY || null, histP = null;
  function histHtml(c) {
    if (!HIST) { histP = histP || loadScript("burgundy-history.js?v=2").then(() => { HIST = window.BURG_HISTORY || null; if (st.sel) renderSide(); }).catch(() => { histP = null; }); return ""; }
    const rows = Object.keys(HSRC).map(k => [k, HIST[k] && HIST[k][c.id]]).filter(([, v]) => v); if (!rows.length) return "";
    return `<h3>${esc(t("Historic rankings"))}</h3><table class="own">${rows.map(([k, v]) => { const r = hRank(k, v.rank);
      return `<tr><td>${esc(HSRC[k])}</td><td><span class="hsw" style="opacity:${r == null ? .15 : [1, .7, .45, .25][r]}"></span>${esc(v.rank)}${v.as && norm(v.as) !== norm(c.n) ? ` <span class="note">(« ${esc(v.as)} »)</span>` : ""}</td></tr>`; }).join("")}</table>`;
  }
  /* ---------- vintages (burgundy-vintages.js: ratings per Côte and colour, events per commune, Météo-France's station
     weather), fetched the first time a climat opens or the map is coloured by vintage ---------- */
  let VT = window.BURG_VINTAGES || null, vtP = null;
  const vtLoad = () => VT ? Promise.resolve(VT) : (vtP = vtP || Promise.all([loadScript("burgundy-vintages.js?v=5"), window.ATLAS_COLOR ? 0 : loadScript("atlas-color.js?v=1")]).then(() => { /* the colours: atlas-color.js */ VT = window.BURG_VINTAGES || null; paint(); renderLegend(); renderSide(); return VT; }).catch(() => { vtP = null; }));
  const VCATS = ["nuits_red", "beaune_red", "beaune_white"], VCAT_EN = { nuits_red: "Côte de Nuits red", beaune_red: "Côte de Beaune red", beaune_white: "Côte de Beaune white" };
  const catOf = c => (c.col || "R") === "W" ? "beaune_white" : c.cote === "nuits" ? "nuits_red" : "beaune_red";
  const vx = s => (s && VT && VT.i18n && (VT.i18n[window.I18N ? I18N.lang : "en"] || {})[s]) || s; // notes come in English; Danish and French by the English text
  const vRating = (cat, y) => VT && VT.years[y] && VT.years[y][cat]; // [score, estimate, note, drink, sources]
  const vYears = cat => VT ? Object.keys(VT.years).map(Number).filter(y => vRating(cat, y)).sort((a, b) => a - b) : [];
  const vEvents = (vid, y) => VT ? VT.events.filter(e => (!vid || e.v.includes(vid)) && (y == null || +e.d.slice(0, 4) === +y)) : [];
  const EVT = { frost: ["#6FA8DC", "Frost"], hail: ["#8E7CC3", "Hail"], heat: ["#E07A3F", "Heat"], drought: ["#C9A227", "Drought"], rot: ["#6A994E", "Rot"], mildew: ["#6A994E", "Mildew"], storm: ["#8E7CC3", "Storm"], rain: ["#3F7CB6", "Rain"] };
  const evtKind = x => { const k = String(x).toLowerCase().replace(/[^a-z].*$/, ""); return EVT[k] ? k : "storm"; };
  const VLO = 84; // most Côte d'Or vintages since 1985 rate 85–98: the colour ramp spans that band
  const scoreFill = sc => ATLAS_COLOR ? ATLAS_COLOR.ramp(Math.max(0, Math.min(1, (sc - VLO) / (100 - VLO)))) : "";
  st.vy = null;
  const allYears = () => [...new Set(VCATS.flatMap(vYears))].sort((a, b) => a - b);
  function stepVintage(d) { const ys = allYears(); if (!ys.length) return; const i = ys.indexOf(st.vy), j = Math.max(0, Math.min(ys.length - 1, (i < 0 ? ys.length - 1 : i) + d));
    st.vy = ys[j]; paint(); renderLegend(); renderSide(); }
  document.addEventListener("click", e => { const b = e.target.closest && e.target.closest("[data-vstep],[data-vy]"); if (!b || !st.region || !st.region.ui) return;
    if (b.dataset.vstep) stepVintage(+b.dataset.vstep); else { st.vy = +b.dataset.vy; if (st.color !== "vintage") { st.color = "vintage"; const f = $("fColor"); if (f && ATLAS_COLOR) f.innerHTML = ATLAS_COLOR.options(); } paint(); renderLegend(); renderSide(); } });
  const stepper = () => `<span class="vyear"><button type="button" data-vstep="-1" aria-label="${esc(t("Earlier vintage"))}">◀</button><b>${st.vy ?? "…"}</b><button type="button" data-vstep="1" aria-label="${esc(t("Later vintage"))}">▶</button></span>`;
  // one bar per rated year for a climat's Côte and colour, with the commune's frost, hail and heat marked
  function vintageChart(cat, vid) {
    const ys = vYears(cat); if (!ys.length) return "";
    const W2 = 360, H2 = 96, top = 14, bw = W2 / ys.length; let g = "";
    ys.forEach((y, i) => { const [sc, est, note] = vRating(cat, y), hh = Math.max(3, (sc - 60) / 40 * (H2 - top - 12)), x = i * bw, evs = vid ? vEvents(vid, y) : [];
      const tip = `${y}: ${sc}${est ? " (" + t("estimate") + ")" : ""}${note ? " — " + vx(note) : ""}${evs.length ? " · " + evs.map(e => t(EVT[evtKind(e.t)][1])).join(", ") : ""}`;
      g += `<g class="vbar${y === st.vy && st.color === "vintage" ? " on" : ""}" data-vy="${y}"><title>${esc(tip)}</title><rect x="${(x + .5).toFixed(1)}" y="${(H2 - 12 - hh).toFixed(1)}" width="${Math.max(1, bw - 1).toFixed(1)}" height="${hh.toFixed(1)}" fill="${scoreFill(sc)}"${est ? ' fill-opacity=".55"' : ""}/>`
        + [...new Set(evs.map(e => evtKind(e.t)))].slice(0, 2).map((k, j) => `<circle cx="${(x + bw / 2).toFixed(1)}" cy="${(H2 - 15 - hh - 4 - j * 7).toFixed(1)}" r="2.6" fill="${EVT[k][0]}"/>`).join("")
        + `<rect x="${x.toFixed(1)}" y="0" width="${bw.toFixed(1)}" height="${H2}" fill="transparent"/></g>`;
      if (y % 5 === 0) g += `<text x="${(x + bw / 2).toFixed(1)}" y="${H2 - 1}" text-anchor="middle" class="vax">${y}</text>`; });
    const best = ys.map(y => [y, vRating(cat, y)[0]]).sort((a, b) => b[1] - a[1]).slice(0, 5);
    return `<h3>${esc(t("Vintages"))} · ${esc(t(VCAT_EN[cat]))}</h3><svg class="vchart" viewBox="0 0 ${W2} ${H2}" role="img" aria-label="${esc(t("Vintage ratings"))}">${g}</svg>
      <p class="note">${esc(t("Best"))}: ${best.map(([y, sc]) => `<button type="button" class="plink" data-vy="${y}">${y}</button> ${sc}`).join(" · ")}
      ${vid && vEvents(vid).length ? `<br><span class="vkey">${["frost", "hail", "heat"].map(k => `<i style="background:${EVT[k][0]}"></i>${esc(t(EVT[k][1]))}`).join(" ")}</span> ${esc(t("marks years this commune was hit"))}` : ""}</p>`;
  }
  function weatherLine(y) {
    const Y = VT && VT.years[y]; if (!Y) return ""; const w = Y.wx && (Y.wx.dijon || Object.values(Y.wx)[0]), bits = [];
    if (Y.harvest) bits.push(t("Harvest from {0}", Y.harvest.slice(5).split("-").reverse().join("/")));
    if (w) { if (w.anom != null) bits.push(t("Apr–Sep {0} °C vs normal", (w.anom > 0 ? "+" : "") + w.anom)); if (w.h35) bits.push(t(w.h35 === 1 ? "{0} day ≥ 35 °C" : "{0} days ≥ 35 °C", w.h35));
      if (w.rain != null) bits.push(t("{0} mm rain Apr–Sep", w.rain)); if (w.frost) bits.push(t(w.frost === 1 ? "{0} frost night after 1 April" : "{0} frost nights after 1 April", w.frost)); }
    if (Y.crop) bits.push(vx(Y.crop));
    return bits.length ? `<p class="note">${esc(bits.join(" · "))}</p>` : "";
  }
  function yearHtml(cat, vid) {
    if (st.color !== "vintage" || !VT || st.vy == null) return ""; const v = vRating(cat, st.vy), evs = vEvents(vid, st.vy);
    return `<div class="vyearbox">${stepper()}${v ? ` · <span class="vs" style="background:${scoreFill(v[0])}">${v[0]}</span>${v[1] ? ` <span class="note">(${esc(t("estimate"))})</span>` : ""}` : ""}
      ${v && v[2] ? `<p>${esc(vx(v[2]))}${v[3] ? ` <span class="note">· ${esc(vx(v[3]))}</span>` : ""}</p>` : ""}
      ${evs.map(e => `<p class="note"><i class="evdot" style="background:${EVT[evtKind(e.t)][0]}"></i><b>${esc(t(EVT[evtKind(e.t)][1]))}</b> ${esc(e.d)}${e.s ? " — " + esc(vx(e.s)) : ""}</p>`).join("")}${weatherLine(st.vy)}</div>`;
  }
  function vintageHtml(c) { if (!VT) { vtLoad(); return ""; } const cat = catOf(c); return yearHtml(cat, c.v) + vintageChart(cat, c.v); }
  /* the warming Côte: the April–September temperature at Dijon-Longvic against 1991–2020 (bars) and the harvest's start
     (dots, with its least-squares trend in days per decade) */
  function warmingChart() {
    if (!VT) return ""; const ys = Object.keys(VT.years).map(Number).sort((a, b) => a - b), wx = y => VT.years[y] && VT.years[y].wx && VT.years[y].wx.dijon;
    const yrs = []; for (let y = 1950; y <= Math.max(...ys); y++) if (wx(y) && wx(y).anom != null) yrs.push(y); if (!yrs.length) return "";
    const hv = ys.filter(y => VT.years[y].harvest).map(y => { const d = new Date(VT.years[y].harvest + "T00:00:00Z"); return [y, Math.round((d - Date.UTC(y, 0, 1)) / 864e5) + 1]; });
    const Wc = 1000, Hc = 210, pl = 36, pr = 40, pt = 14, pb = 20, y0 = yrs[0], y1 = yrs[yrs.length - 1];
    const X = y => pl + (y - y0) / (y1 - y0) * (Wc - pl - pr), A = a => pt + (2.5 - a) / 5 * (Hc - pt - pb), D0 = 225, D1 = 285, Dd = d => pt + (d - D0) / (D1 - D0) * (Hc - pt - pb), bw = (Wc - pl - pr) / (y1 - y0 + 1) - 1;
    let g = `<line x1="${pl}" x2="${Wc - pr}" y1="${A(0)}" y2="${A(0)}" class="pgrid"/>`;
    yrs.forEach(y => { const a = wx(y).anom, h = A(0) - A(a); g += `<rect x="${(X(y) - bw / 2).toFixed(1)}" y="${(h > 0 ? A(a) : A(0)).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.abs(h).toFixed(1)}" fill="${a >= 0 ? "#D9534F" : "#3F7CB6"}" fill-opacity=".75"><title>${y}: ${a > 0 ? "+" : ""}${a} °C</title></rect>`; });
    if (hv.length > 3) { const n = hv.length, mx = hv.reduce((s, [y]) => s + y, 0) / n, my = hv.reduce((s, [, d]) => s + d, 0) / n;
      const sl = hv.reduce((s, [y, d]) => s + (y - mx) * (d - my), 0) / hv.reduce((s, [y]) => s + (y - mx) ** 2, 0), fit = y => my + sl * (y - mx), ya = hv[0][0], yb = hv[n - 1][0];
      g += `<line x1="${X(ya)}" y1="${Dd(fit(ya)).toFixed(1)}" x2="${X(yb)}" y2="${Dd(fit(yb)).toFixed(1)}" class="htrend"/>`;
      hv.forEach(([y, d]) => { const dt = new Date(Date.UTC(y, 0, d)); g += `<circle cx="${X(y).toFixed(1)}" cy="${Dd(d).toFixed(1)}" r="3.2" class="hdot"><title>${y}: ${esc(t("Harvest from {0}", dt.getUTCDate() + "/" + (dt.getUTCMonth() + 1)))}</title></circle>`; });
      g += `<text x="${pl + 6}" y="${pt + 4}" class="pax hax">${esc(t("Harvest trend since {0}: {1} days earlier per decade", ya, Math.round(-sl * 10)))}</text>`; }
    [-2, -1, 0, 1, 2].forEach(a => g += `<text x="${pl - 4}" y="${A(a) + 3}" class="pax" text-anchor="end">${a > 0 ? "+" : ""}${a}°</text>`);
    for (let y = Math.ceil(y0 / 10) * 10; y <= y1; y += 10) g += `<text x="${X(y)}" y="${Hc - 4}" class="pax" text-anchor="middle">${y}</text>`;
    return `<h3>${esc(t("A warming Côte"))}</h3><p class="note">${esc(t("Bars: April–September temperature at Dijon-Longvic against 1991–2020 · dots: start of the harvest"))}</p><svg viewBox="0 0 ${Wc} ${Hc}" class="warmchart">${g}</svg>`;
  }
  const CAT = ["#7C2D3E", "#3F7CB6", "#A87E2F", "#3E9E68", "#8E5BA8", "#C2683A", "#2F8F8F", "#B5476E", "#5E6E2F", "#4C5BA8"];
  function gcOwnersHtml() {
    const P = st.pack.producers, gcs = st.pack.climats.filter(c => c.c === "GC" && !c.x), tot = {};
    gcs.forEach(c => (c.own || []).forEach(([k, h, kd]) => { if (h && kd !== "s") tot[k] = (tot[k] || 0) + h; }));
    const top = Object.entries(tot).sort((a, b) => b[1] - a[1]).slice(0, CAT.length).map(([k]) => k), col = k => CAT[top.indexOf(k)] || null;
    return `<h3>${esc(t("Who owns the grands crus"))}</h3><div class="gclegend">${top.map(k => `<button type="button" class="plink" data-prod="${esc(k)}"><span class="sw" style="background:${col(k)}"></span>${esc(P[k])}</button>`).join("")}<span class="note"><span class="sw" style="background:var(--line)"></span>${esc(t("other listed owners · empty = not published"))}</span></div>`
      + gcs.map(c => { const own = (c.own || []).filter(([, h, kd]) => h && kd !== "s").sort((a, b) => b[1] - a[1]); let alt = 0;
        const segs = own.map(([k, h]) => `<span title="${esc(P[k] || k)} · ${fmtHa(h)} ha · ${Math.round(100 * h / c.ha)}%" style="width:${(100 * Math.min(h, c.ha) / c.ha).toFixed(2)}%;background:${col(k) || (alt++ % 2 ? "var(--chip)" : "var(--line)")}"></span>`).join("");
        return `<div class="gcrow"><button type="button" class="plink gcn" data-c="${esc(c.id)}">${esc(c.n)}</button><span class="gcbar">${segs}</span><span class="gch">${fmtHa(c.ha)} ha</span></div>`; }).join("");
  }
  function regionHtml() { if (!VT) { vtLoad(); return gcOwnersHtml(); }
    return gcOwnersHtml() + warmingChart() + `<p class="note">${esc(t("Ratings are AllWine's consensus of published vintage charts on a 100-point scale (* = estimate, fewer sources); hover a score for its note. Weather: Météo-France, Dijon-Longvic."))}</p>`; }
  /* ---------- "colour the vineyards by" (atlas-color.js): the Côte d'Or's own measures ---------- */
  const VIL_IDX = () => Object.fromEntries((st.pack.villages || []).map((v, i) => [v.id, i]));
  const HUES = [8, 32, 52, 88, 140, 172, 200, 228, 262, 300, 330];
  function colorModes() { const C = ATLAS_COLOR, vi = VIL_IDX(), maxOwn = Math.max(1, ...st.pack.climats.map(c => c.mono ? 1 : (c.own || []).length));
    return {
      commune: { label: "Commune", fill: c => `hsl(${HUES[(vi[c.v] ?? 0) % HUES.length]} 45% ${c.c === "GC" ? 42 : c.c === "1er" ? 58 : 74}%)`,
        legend: () => (st.pack.villages || []).slice(0, 10).map((v, i) => [`hsl(${HUES[i % HUES.length]} 45% 55%)`, v.n]) },
      owners: { label: "Number of owners", seq: true, measure: c => c.mono ? 1 : (c.own || []).length || null, unit: "", digits: 0 },
      history: { label: "Lavalle 1855", fill: c => { const v = HIST && HIST.lavalle1855 && HIST.lavalle1855[c.id], r = v ? hRank("lavalle1855", v.rank) : null; if (!HIST) histHtml(c); return r == null ? C.NONE() : C.ramp([1, .66, .38, .15][r]); },
        legend: () => [["Tête de cuvée / hors ligne", 1], ["1ère cuvée", .66], ["2e cuvée", .38], ["3e–4e cuvée", .15]].map(([l, f]) => [C.ramp(f), l]).concat([[C.NONE(), t("Not ranked")]]) },
      vintage: { label: "Vintage", fill: c => { if (!VT) { vtLoad(); return C.NONE(); } if (st.vy == null) st.vy = Math.max(...allYears()); const v = vRating(catOf(c), st.vy); return v ? scoreFill(v[0]) : C.NONE(); },
        legend: () => [[C.ramp(1), "100"], [C.ramp(.5), "92"], [C.ramp(0), "≤ " + VLO]], after: () => `<span class="gl">${stepper()}</span>` },
    }; }
  document.head.insertAdjacentHTML("beforeend", `<style>.vchart{width:100%;height:auto;display:block} .vchart .vax{font-size:9px;fill:var(--muted)} .vbar.on rect:first-child{stroke:var(--ink);stroke-width:1.2} .vbar{cursor:pointer}
    .vyear{display:inline-flex;align-items:center;gap:6px} .vyear button{border:1px solid var(--line);background:var(--card);border-radius:6px;width:26px;height:24px;cursor:pointer;color:var(--ink)}
    .vyearbox{margin:8px 0;padding:8px 10px;border:1px solid var(--line);border-radius:10px} .vs{display:inline-block;padding:1px 7px;border-radius:6px;font-weight:700;color:#fff}
    .evdot,.vkey i{display:inline-block;width:8px;height:8px;border-radius:50%;margin:0 4px 0 6px} .warmchart{width:100%;height:auto;display:block}
    .warmchart .pgrid{stroke:var(--line)} .warmchart .pax{font-size:20px;fill:var(--muted)} .warmchart .htrend{stroke:var(--ink);stroke-width:2;stroke-dasharray:6 4} .warmchart .hdot{fill:var(--ink);fill-opacity:.6}</style>`);
  document.head.insertAdjacentHTML("beforeend", `<style>.edbtn{border:0;background:none;color:var(--muted);cursor:pointer;padding:0 4px;font-size:13px} .edbtn:hover{color:var(--accent)} .ktag.ed{color:var(--accent)}
    .edform{display:grid;gap:8px;margin:10px 0;padding:10px;border:1px solid var(--line);border-radius:10px} .edform label{display:grid;gap:3px;font-size:12.5px;color:var(--muted)} .edform input,.edform select{font:inherit;padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--ink)}
    .edrow{display:flex;flex-wrap:wrap;gap:8px;align-items:end} .edrow label{flex:1;min-width:90px}</style>`);
  document.head.insertAdjacentHTML("beforeend", `<style>.pcmp{display:block;margin-top:6px;font-size:12.5px;color:var(--muted)} .pcmp input{font:inherit;padding:4px 7px;border:1px solid var(--line);border-radius:7px;background:var(--card);color:var(--ink);width:min(100%,220px)}
    .gclegend{display:flex;flex-wrap:wrap;gap:4px 12px;margin:4px 0 10px;font-size:12.5px} .sw{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}
    .gcrow{display:grid;grid-template-columns:minmax(0,9.5em) 1fr auto;gap:8px;align-items:center;font-size:12.5px;margin:3px 0} .gcn{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .gcbar{display:flex;height:12px;border-radius:3px;overflow:hidden;background:var(--card2);border:1px solid var(--line)} .gch{color:var(--muted);white-space:nowrap} table.cmpt th{font-size:12.5px;text-align:right}</style>`);
  /* ---------- a commune: its climats, its appellation, its vintages and the weather that hit it (#v=… on burgundy.html) ---------- */
  const villOf = id => (st.pack.villages || []).find(v => v.id === id);
  const climatsOf = id => st.pack.climats.filter(c => c.v === id);
  function selectVillage(id, fly) {
    const list = climatsOf(id), v = villOf(id); if (!v && !list.length) return false;
    st.sel = null; st.ld = null; st.vsel = id; paint(); renderSide(); document.body.classList.add("side-open");
    if (fly) { const g = (v && v.g || []).concat(list.flatMap(c => c.g)); if (g.length) fit(bbOf(g), .05, 360); }
    syncHash(); return true;
  }
  function villageSide() {
    const id = st.vsel, v = villOf(id) || { id, n: (climatsOf(id)[0] || {}).app || id }, list = climatsOf(id), side = $("side");
    const cote = v.cote || (list[0] || {}).cote, red = cote === "nuits" ? "nuits_red" : "beaune_red";
    const by = k => list.filter(c => c.c === k && !c.x).concat(list.filter(c => c.c === k && c.x)).sort((a, b) => a.n.localeCompare(b.n, "fr"));
    const grp = (k, label) => { const l = by(k); return l.length ? `<h3>${esc(t(label))} · ${l.length}</h3><p class="ldlist">${l.map(c => `<button type="button" class="plink" data-c="${esc(c.id)}">${esc(c.n)}</button>`).join(" · ")}</p>` : ""; };
    if (!VT) vtLoad();
    side.innerHTML = `<p><button class="btn" id="back">← ${esc(st.pack.meta.name)}</button></p><span class="pill">${esc(t("Commune"))}</span><h2>${esc(v.n)}</h2>
      ${v.aoc ? `<div class="meta">${esc(v.aoc)}</div>` : ""}${v.note ? `<p class="desc">${esc(v.note)}</p>` : ""}
      ${grp("GC", "Grand cru")}${grp("1er", "Premier cru")}${grp("V", "Village climat")}
      ${VT ? yearHtml(red, id) + vintageChart(red, id) + (cote === "beaune" ? vintageChart("beaune_white", id) : "") : ""}
      ${VT && vEvents(id).length ? `<h3>${esc(t("Frost, hail and heat"))}</h3>` + vEvents(id).slice().reverse().slice(0, 12).map(e => `<p class="note"><i class="evdot" style="background:${EVT[evtKind(e.t)][0]}"></i><b>${esc(e.d)}</b> ${esc(t(EVT[evtKind(e.t)][1]))}${e.s ? " — " + esc(vx(e.s)) : ""}</p>`).join("") : ""}`;
    $("back").onclick = () => { st.vsel = null; paint(); renderSide(); syncHash(); };
    side.querySelectorAll("button[data-c]").forEach(b => b.onclick = () => { st.vsel = null; select(b.dataset.c, true); });
  }
  /* ---------- burgundy.html's links: #c= a climat, #v= a commune, #p= an owner, #l= a lieu-dit (its old key), #color=…&y=… ---------- */
  async function fromHash(q) {
    if (q.get("color")) { if (!window.ATLAS_COLOR) await loadScript("atlas-color.js?v=1").catch(() => {});
      if (window.ATLAS_COLOR && ATLAS_COLOR.modes()[q.get("color")]) { st.color = q.get("color"); if (st.color === "vintage") await vtLoad(); if (q.get("y")) st.vy = +q.get("y"); paint(); renderLegend(); } }
    if (q.get("p") && st.pack.producers[q.get("p")]) setProd(q.get("p"));
    if (q.get("v") && !q.get("c")) selectVillage(q.get("v"), true);
    if (q.get("l") && window.ATLAS_LDUI) { await ATLAS_LDUI.want(); const L = window.ATLAS_LD && ATLAS_LD[st.region.id], key = q.get("l");
      const i = L ? L.ld.findIndex(l => l[6] === key || norm(l[1]) === norm(key)) : -1; if (i >= 0) ATLAS_LDUI.pick(i, true); }
    if (!q.get("l")) syncHash(); // the address as it now stands (the colour and year included)
  }
  return { selectVillage, villageSide, fromHash, holds, shown: shownFor, compareHtml, ownersHtml, prodBar, setProd, histHtml, vintageHtml, regionHtml, colorModes, wire, edits: EDITS };
})();
