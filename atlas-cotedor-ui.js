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
function prodBar() {
  const P = st.pack && st.pack.producers; if (!P || !st.prod) return "";
  const list = st.pack.climats.filter(c => holds(c, st.prod)), ha = list.reduce((s, c) => s + (c.mono === st.prod ? c.ha : ((c.own.find(h => h[0] === st.prod) || [])[1] || 0)), 0);
  return `<div class="prodbar"><span>${esc(t("Showing the holdings of {0}: {1} climats", P[st.prod] || st.prod, list.length))}${ha ? " · " + esc(fmtHa(ha)) + " ha" : ""}</span><button type="button" class="px" id="prodX" aria-label="${esc(t("Show every owner"))}">✕</button></div>`;
}
function setProd(k) { st.prod = k || null; paint(); renderSide();
  if (k) { const list = st.pack.climats.filter(c => holds(c, k)); if (list.length) fit(bbOf(list.flatMap(c => c.g)), .12, 380); } }
function ownersHtml(c) {
  const P = st.pack.producers; if (!P || (!c.own && !c.mono)) return "";
  const rows = [...(c.own || [])].sort((a, b) => (a[2] === "s") - (b[2] === "s") || (b[1] ?? -1) - (a[1] ?? -1));
  const known = rows.filter(r => r[1] && r[2] !== "s").reduce((s, r) => s + r[1], 0), rest = Math.max(0, c.ha - known);
  const seg = rows.filter(r => r[1] && r[2] !== "s").map(([k, h], i) => `<span title="${esc(P[k] || k)} · ${fmtHa(h)} ha" style="width:${(100 * h / c.ha).toFixed(2)}%;opacity:${(1 - (i % 6) / 8).toFixed(2)}"></span>`).join("");
  const body = rows.map(([k, h, kind, since]) => { const share = h && kind !== "s" ? 100 * h / c.ha : null;
    return `<tr><td><button type="button" class="plink${st.prod === k ? " on" : ""}" data-prod="${esc(k)}" title="${esc(t("Show everything {0} holds", P[k] || k))}">${esc(P[k] || k)}</button>${kind || since ? ` <span class="ktag">${esc([kind && t(OWN_KIND[kind]), since && t("since {0}", since)].filter(Boolean).join(" · "))}</span>` : ""}${share != null ? `<span class="pb" style="width:${Math.max(2, share).toFixed(1)}%"></span>` : ""}</td>
      <td class="n">${kind === "s" ? "" : h != null ? `<b>${fmtHa(h)}</b> ha` : esc(t("holder"))}</td><td class="n">${share != null ? (share < 1 ? share.toFixed(1) : Math.round(share)) + "%" : ""}</td></tr>`; }).join("");
  const cover = c.mono ? t("Monopole: the whole climat belongs to {0}.", P[c.mono] || c.mono)
    : !rows.length ? t("No ownership details on file for this climat.")
    : known >= c.ha * .98 ? t("The owners listed cover essentially the whole climat (published figures are rounded).")
    : known ? t("Owners with a published figure account for {0} of {1} ha ({2}%); the other {3} ha belongs to {4}smaller growers.", fmtHa(known), fmtHa(c.ha), Math.round(100 * known / c.ha), fmtHa(rest), rows.some(r => r[1] == null) ? t("the holders listed without a figure and ") : "")
    : t("Notable owners; individual holdings not listed.");
  return `<h3>${esc(t("Owners"))}</h3>${known ? `<div class="sharebar" aria-hidden="true">${seg}</div>` : ""}<p class="note">${esc(cover)}</p>${rows.length ? `<table class="own">${body}</table>` : ""}`;
}
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
  function regionHtml() { if (!VT) { vtLoad(); return ""; }
    return warmingChart() + `<p class="note">${esc(t("Ratings are AllWine's consensus of published vintage charts on a 100-point scale (* = estimate, fewer sources); hover a score for its note. Weather: Météo-France, Dijon-Longvic."))}</p>`; }
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
  return { holds, ownersHtml, prodBar, setProd, histHtml, vintageHtml, regionHtml, colorModes };
})();
