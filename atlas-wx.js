// The Wine atlas: each region's growing seasons, from its weather file (atlas-<id>-wx.js, made by
// tools/region-weather.js from Météo-France's and DWD's open daily station records). Shown in the region's panel:
// the warming chart, one season at a time (◀ ▶) and the last 20 in a table. The Côte d'Or has its own (with ratings).
// A classic script on atlas.js's shared scope (st, t, esc, renderSide).
"use strict";
window.ATLAS_WXUI = (() => {
  const W = () => window.ATLAS_WX && st.region && window.ATLAS_WX[st.region.id];
  const rec = (w, i, y) => { const v = w.y[i] && w.y[i][y]; return v ? Object.fromEntries(w.f.map((f, j) => [f, v[j]])) : null; };
  const years = (w, i) => Object.keys(w.y[i] || {}).map(Number).sort((a, b) => a - b);
  const sg = a => (a > 0 ? "+" : a < 0 ? "−" : "±") + Math.abs(a).toFixed(1);
  const dm = s => s ? +s.slice(3) + "/" + +s.slice(0, 2) : "";
  // Tonietto & Carbonneau (2004)'s classes of the Huglin index
  const HCL = [[1500, "very cool"], [1800, "cool"], [2100, "temperate"], [2400, "warm temperate"], [3000, "warm"], [1e9, "very warm"]];
  const hcl = h => t(HCL.find(([m]) => h <= m)[1]);
  // least-squares trend of the season's mean, °C per decade, from 1981 on
  function trend(w) { const ys = years(w, 0).filter(y => y >= 1981), n = ys.length; if (n < 15) return null;
    const v = ys.map(y => rec(w, 0, y).tgs), mx = ys.reduce((a, b) => a + b, 0) / n, my = v.reduce((a, b) => a + b, 0) / n;
    const sl = ys.reduce((s, y, i) => s + (y - mx) * (v[i] - my), 0) / ys.reduce((s, y) => s + (y - mx) ** 2, 0); return { sl, mx, my, y0: ys[0], y1: ys[n - 1] }; }

  function chart(w) {
    const S = w.st[0], ys = years(w, 0).filter(y => rec(w, 0, y).anom != null); if (ys.length < 10) return "";
    const amax = Math.max(2.5, Math.ceil(Math.max(...ys.map(y => Math.abs(rec(w, 0, y).anom))) * 2) / 2);
    const Wc = 480, Hc = 160, pl = 30, pr = 6, pt = 8, pb = 22, y0 = ys[0], y1 = ys[ys.length - 1];
    const X = y => pl + (y - y0) / Math.max(1, y1 - y0) * (Wc - pl - pr), A = a => pt + (amax - a) / (2 * amax) * (Hc - pt - pb), bw = Math.max(1.5, (Wc - pl - pr) / (y1 - y0 + 1) - .8);
    let g = `<line x1="${pl}" x2="${Wc - pr}" y1="${A(0)}" y2="${A(0)}" class="pgrid"/>`;
    ys.forEach(y => { const a = rec(w, 0, y).anom, top = Math.min(A(a), A(0)), h = Math.abs(A(a) - A(0));
      g += `<rect x="${(X(y) - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(.5, h).toFixed(1)}" fill="${a >= 0 ? "#D9534F" : "#3F7CB6"}" fill-opacity="${y === st.wy ? 1 : .7}" data-wy="${y}"><title>${y}: ${sg(a)} °C</title></rect>`; });
    const tr = trend(w); if (tr) { const f = y => tr.my + tr.sl * (y - tr.mx) - S.norm;
      g += `<line x1="${X(tr.y0).toFixed(1)}" y1="${A(f(tr.y0)).toFixed(1)}" x2="${X(tr.y1).toFixed(1)}" y2="${A(f(tr.y1)).toFixed(1)}" class="htrend"/>`; }
    const step = amax > 3 ? 2 : 1; for (let a = -Math.floor(amax / step) * step; a <= amax; a += step) g += `<text x="${pl - 4}" y="${A(a) + 4}" class="pax" text-anchor="end">${a > 0 ? "+" : a < 0 ? "−" : ""}${Math.abs(a)}°</text>`;
    for (let y = Math.ceil(y0 / 10) * 10; y <= y1; y += 10) g += `<text x="${X(y)}" y="${Hc - 4}" class="pax" text-anchor="middle">${y}</text>`;
    return `<p class="note">${esc(t("Bars: April–September temperature at {0} against its 1991–2020 average ({1} °C)", S.n, S.norm.toFixed(1)))}${tr ? " · " + esc(t("dashed: the trend since {0}, {1} °C per decade", tr.y0, sg(tr.sl * 10))) : ""}</p>
      <svg viewBox="0 0 ${Wc} ${Hc}" class="warmchart" role="img" aria-label="${esc(t("Growing-season temperature by year"))}">${g}</svg>`;
  }
  // one season, every station
  function season(w, y) {
    const all = years(w, 0), r0 = rec(w, 0, y), ord = all.filter(x => rec(w, 0, x)).sort((a, b) => rec(w, 0, b).tgs - rec(w, 0, a).tgs), rank = ord.indexOf(y) + 1;
    const lines = w.st.map((S, i) => { const r = rec(w, i, y); if (!r) return "";
      const bits = [t("Apr–Sep {0} °C", r.tgs.toFixed(1)) + (r.anom != null ? ` (${sg(r.anom)})` : ""), t("Huglin {0}, {1}", r.hug, hcl(r.hug))];
      if (r.h30 != null) bits.push(t(r.h30 === 1 ? "{0} day ≥ 30 °C" : "{0} days ≥ 30 °C", r.h30) + (r.h35 ? ` (${t(r.h35 === 1 ? "{0} day ≥ 35 °C" : "{0} days ≥ 35 °C", r.h35)})` : ""));
      if (r.rain != null) bits.push(t("{0} mm rain Apr–Sep", r.rain) + (r.sep != null ? ` (${t("September {0} mm", r.sep)})` : ""));
      bits.push(r.frost ? t(r.frost === 1 ? "{0} frost night after 1 April" : "{0} frost nights after 1 April", r.frost) + ` (${t("last {0}", dm(r.lf))})` : t("no spring frost"));
      if (r.hail) bits.push(t(r.hail === 1 ? "hail on {0} day" : "hail on {0} days", r.hail));
      return `<p class="note"><b>${esc(S.n)}</b> · ${esc(bits.join(" · "))}</p>`; }).join("");
    return `<div class="vyearbox"><span class="vyear"><button type="button" data-wstep="-1" aria-label="${esc(t("Earlier vintage"))}"${y <= all[0] ? " disabled" : ""}>◀</button><b>${y}</b><button type="button" data-wstep="1" aria-label="${esc(t("Later vintage"))}"${y >= all[all.length - 1] ? " disabled" : ""}>▶</button></span>
      ${r0 && rank ? ` <span class="note">${esc(rank === 1 ? t("the warmest season at {0} since {1}", w.st[0].n, all[0]) : rank === ord.length ? t("the coolest season at {0} since {1}", w.st[0].n, all[0]) : t("number {0} of {1} seasons, warmest first", rank, ord.length))}</span>` : ""}${lines}</div>`;
  }
  function table(w) {
    const ys = years(w, 0).slice(-20).reverse(), cell = v => `<td class="n">${v ?? "—"}</td>`;
    const an = a => a == null ? `<td class="n">—</td>` : `<td class="n"><span class="wxa" style="background:${a >= 0 ? `rgba(217,83,79,${Math.min(.55, .12 + Math.abs(a) * .13).toFixed(2)})` : `rgba(63,124,182,${Math.min(.55, .12 + Math.abs(a) * .13).toFixed(2)})`}">${sg(a)}</span></td>`;
    return `<table class="own vtab wxtab"><thead><tr><th></th><th class="n">${esc(t("°C vs normal"))}</th><th class="n">${esc(t("Huglin"))}</th><th class="n">${esc(t("≥ 30 °C"))}</th><th class="n">${esc(t("Rain"))}</th><th class="n">${esc(t("Frost"))}</th></tr></thead><tbody>
      ${ys.map(y => { const r = rec(w, 0, y); return `<tr${y === st.wy ? ` class="on"` : ""}><td><button type="button" class="plink" data-wy="${y}">${y}</button></td>${an(r.anom)}${cell(r.hug)}${cell(r.h30)}${cell(r.rain)}${cell(r.frost)}</tr>`; }).join("")}</tbody></table>
      <p class="note">${esc(t("Days ≥ 30 °C in June–August; rain in mm, April–September; frost: nights at −1 °C or below, 1 April–15 May. Huglin: the season's warmth for ripening grapes (1500 cool, 3000 very warm)."))}</p>`;
  }
  function credit(w) {
    const by = s => w.st.filter(x => x.src === s).map(x => `${x.n} (${x.alt} m)`).join(", ");
    return `<p class="src">${w.st.some(x => x.src === "mf") ? esc(t("Weather: Météo-France, daily station records (Licence Ouverte): {0}.", by("mf"))) + " " : ""}${w.st.some(x => x.src === "dwd") ? esc(t("Weather: Datenbasis: Deutscher Wetterdienst (CC BY 4.0): {0}.", by("dwd"))) + " " : ""}${esc(t("Built {0}.", w.meta.built))}</p>`;
  }
  // the panel's own texts (atlas-wx-i18n.js), added to the page's dictionary for the language shown (on each
  // drawing: a language picked later arrives as a new dictionary)
  const merge = () => { const l = window.I18N && I18N.lang, o = window.ATLAS_WX_I18N && ATLAS_WX_I18N[l], D = window.I18N_DICT; if (!o || !D || !D[l] || D[l].__wx) return;
    Object.entries(o).forEach(([k, v]) => { if (!(k in D[l])) D[l][k] = v; }); Object.defineProperty(D[l], "__wx", { value: 1 }); };
  function html() {
    const w = W(); if (!w) return ""; merge();
    const all = years(w, 0); if (st.wy == null || !rec(w, 0, st.wy)) st.wy = all[all.length - 1];
    return `<section class="wx"><h3>${esc(t("The growing seasons"))}</h3>${chart(w)}${season(w, st.wy)}${table(w)}${credit(w)}</section>`;
  }
  document.addEventListener("click", e => { const b = e.target.closest && e.target.closest("[data-wstep],[data-wy]"); if (!b || !W()) return;
    const all = years(W(), 0), i = all.indexOf(st.wy);
    st.wy = b.dataset.wstep ? all[Math.max(0, Math.min(all.length - 1, i + +b.dataset.wstep))] : +b.dataset.wy;
    const sc = $("side") && $("side").scrollTop; renderSide(); if (sc != null) $("side").scrollTop = sc;
    const box = document.querySelector(".wx .vyearbox"); if (box && b.dataset.wy && box.scrollIntoView) box.scrollIntoView({ block: "nearest" }); });
  document.head.insertAdjacentHTML("beforeend", `<style>.vyearbox{margin:8px 0;padding:8px 10px;border:1px solid var(--line);border-radius:10px}
    .vyear{display:inline-flex;align-items:center;gap:6px} .vyear button{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:6px;padding:2px 8px;cursor:pointer;font:inherit}
    .vyear button:disabled{opacity:.35;cursor:default} .warmchart{width:100%;height:auto;display:block} .warmchart rect{cursor:pointer}
    .warmchart .pgrid{stroke:var(--line)} .warmchart .pax{font-size:12px;fill:var(--muted)} .warmchart .htrend{stroke:var(--ink);stroke-width:1.4;stroke-dasharray:5 3}
    .wxtab{width:100%} .wxtab td,.wxtab th{padding:3px 2px} .wxtab tr.on td{background:var(--chip)} .wxtab tr.on .plink{color:var(--ink);font-weight:700} .wxa{display:inline-block;min-width:38px;padding:1px 5px;border-radius:6px;color:var(--ink);text-align:center}</style>`);
  return { html };
})();
