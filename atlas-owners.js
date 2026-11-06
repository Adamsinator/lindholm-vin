// The Wine atlas: a climat's owners in a region without the Côte d'Or's own tools (atlas-<id>-own.js, made by
// tools/region-owners.js from data/owners/<id>.json). Only what each domaine's own website says it owns, each line
// with a link to that page; a domaine that gives no figure is listed as a holder. A classic script on atlas.js's
// shared scope (st, t, esc, fmtHa).
"use strict";
// the panels' own texts (atlas-wx-i18n.js, loaded with a region), added to the dictionary of the language shown; on
// each drawing, as a language picked later arrives as a new dictionary
window.atlasTexts = window.atlasTexts || function () { const l = window.I18N && I18N.lang, o = window.ATLAS_WX_I18N && ATLAS_WX_I18N[l], D = window.I18N_DICT; if (!o || !D || !D[l] || D[l].__wx) return;
  Object.entries(o).forEach(([k, v]) => { if (!(k in D[l])) D[l][k] = v; }); Object.defineProperty(D[l], "__wx", { value: 1 }); };
window.ATLAS_OWN = (() => {
  const D = () => window.ATLAS_OWN_DATA && st.region && window.ATLAS_OWN_DATA[st.region.id];
  function html(c) {
    const d = D(), rows = d && d.own[c.id]; if (!d) return ""; if (window.atlasTexts) atlasTexts(); if (!rows) return `<h3>${esc(t("Owners"))}</h3><p class="note">${esc(t("No ownership details on file for this climat."))}</p>`;
    const sorted = rows.slice().sort((a, b) => (b[1] ?? -1) - (a[1] ?? -1)), known = sorted.reduce((s, r) => s + (r[1] || 0), 0);
    const seg = sorted.filter(r => r[1]).map(([k, h], i) => `<span title="${esc(d.producers[k][0])} · ${fmtHa(h)} ha" style="width:${(100 * h / c.ha).toFixed(2)}%;opacity:${(1 - (i % 6) / 8).toFixed(2)}"></span>`).join("");
    const body = sorted.map(([k, h, url, says]) => { const share = h ? 100 * h / c.ha : null;
      return `<tr><td>${esc(d.producers[k][0])} <a class="srcl" href="${esc(url)}" target="_blank" rel="noopener" title="${esc(says)}" aria-label="${esc(t("Source: {0}", d.producers[k][0]))}">↗</a></td>
        <td class="n">${h != null ? `<b>${fmtHa(h)}</b> ha` : esc(t("holder"))}</td><td class="n">${share != null ? (share < 1 ? share.toFixed(1) : Math.round(share)) + "%" : ""}</td></tr>`; }).join("");
    const cover = known ? t("Owners with a published figure account for {0} of {1} ha ({2}%); the rest belongs to the holders listed without a figure and to growers not listed here.", fmtHa(known), fmtHa(c.ha), Math.round(100 * known / c.ha))
      : t("The domaines listed say on their own websites that they own vines here; none gives an area.");
    return `<h3>${esc(t("Owners"))}</h3>${known ? `<div class="sharebar" aria-hidden="true">${seg}</div>` : ""}<p class="note">${esc(cover)}</p><table class="own">${body}</table>
      <p class="src">${esc(t("Only what each domaine's own website says, checked {0}; ↗ opens the page.", d.checked))}</p>`;
  }
  // the region's panel: which climats have owners on file
  function regionNote() { const d = D(); if (!d) return ""; if (window.atlasTexts) atlasTexts(); const n = Object.keys(d.own).length;
    return `<p class="note">${esc(t(n === 1 ? "Owners on file for {0} climat, from the domaines' own websites." : "Owners on file for {0} climats, from the domaines' own websites.", n))}</p>`; }
  document.head.insertAdjacentHTML("beforeend", `<style>.sharebar{display:flex;height:10px;border-radius:5px;overflow:hidden;background:var(--line);margin:6px 0}
    .sharebar span{background:var(--gc);border-right:1px solid var(--card)} a.srcl{text-decoration:none;color:var(--muted);font-size:12px}</style>`);
  return { html, regionNote };
})();
