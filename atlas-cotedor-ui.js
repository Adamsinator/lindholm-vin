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
  return { holds, ownersHtml, prodBar, setProd, histHtml };
})();
