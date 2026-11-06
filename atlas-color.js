// "Colour the vineyards by…" on the Wine atlas (atlas.js loads this when the Map panel's choice is first used): the
// vineyards' fill from a measure instead of their classification, with a legend to read it by. Every region with terrain
// can show altitude, slope and the way it faces; every region its size and your bottles; a region's own module adds its
// measures (the Côte d'Or: commune, owners, historic rank, vintage) as ATLAS_CD.colorModes. Runs in atlas.js's scope.
"use strict";
window.ATLAS_COLOR = (() => {
  const css = k => getComputedStyle(document.documentElement).getPropertyValue(k).trim();
  const hex = h => { h = h.replace("#", ""); if (h.length === 3) h = h.replace(/./g, x => x + x); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
  const mix = (a, b, f) => { const A = hex(a), B = hex(b); return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * Math.max(0, Math.min(1, f))).toString(16).padStart(2, "0")).join(""); };
  const ramp = f => mix(css("--card") || "#ffffff", css("--gc") || "#8E2C45", .12 + .88 * f); // light → the grand cru colour
  const NONE = () => css("--line") || "#ddd";
  const dem = c => window.ATLAS_DEM && st.region && ATLAS_DEM[st.region.id] && ATLAS_DEM[st.region.id].c[c.id];
  // the range of a measure over the region's climats, to spread the ramp over what's there (5th–95th percentile)
  const span = f => { const v = st.pack.climats.map(f).filter(x => x != null && isFinite(x)).sort((a, b) => a - b); if (!v.length) return [0, 1];
    const q = p => v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))]; const lo = q(.05), hi = q(.95); return hi > lo ? [lo, hi] : [v[0], v[v.length - 1] || v[0] + 1]; };
  const seq = (label, f, unit, digits = 0) => ({ label, measure: f, unit, digits, seq: true });
  const FACES = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  // the way a vineyard faces: a colour wheel, south warm, north cold
  const faceCol = a => ["#4F7A9C", "#6FA0B8", "#9DBB8A", "#E3B44C", "#D9733F", "#C44E4E", "#9A5C8F", "#5E6FA8"][Math.round(a / 45) % 8];
  const GENERIC = {
    alt: seq("Altitude", c => (dem(c) || [])[2], "m"),
    slope: seq("Slope", c => (dem(c) || [])[3], "%", 1),
    faces: { label: "Faces", fill: c => { const d = dem(c); return d && d[3] >= 1.5 ? faceCol(d[4]) : NONE(); },
      legend: () => FACES.map((f, i) => [faceCol(i * 45), t(f)]).concat([[NONE(), t("flat")]]) },
    size: seq("Size", c => Math.log10(1 + c.ha), "ha"),
    cellar: { label: "Your bottles", fill: c => { const b = (CELLAR.by[c.id] || {}).left || 0; return b ? mix(css("--card") || "#fff", css("--gold") || "#A87E2F", Math.min(1, .35 + Math.sqrt(b) / 4)) : NONE(); },
      legend: () => [[mix(css("--card") || "#fff", css("--gold") || "#A87E2F", .5), t("You have bottles from it")], [NONE(), t("None in your cellar")]] },
  };
  const modes = () => { const R = st.region, has = !!(R && R.dem), out = { class: { label: "Classification" } };
    if (has) Object.assign(out, { alt: GENERIC.alt, slope: GENERIC.slope, faces: GENERIC.faces });
    Object.assign(out, { size: GENERIC.size, cellar: GENERIC.cellar });
    if (window.ATLAS_CD && ATLAS_CD.colorModes && R && R.ui) Object.assign(out, ATLAS_CD.colorModes());
    return out; };
  let rng = null;
  function apply() {
    const P = st.pack; if (!P) return; const M = modes()[st.color];
    if (!M || st.color === "class") { P.climats.forEach(c => { if (c.el) c.el.style.fill = ""; }); svg.classList.remove("colored"); return; }
    rng = M.seq ? span(M.measure) : null; svg.classList.add("colored");
    P.climats.forEach(c => { if (!c.el) return; let f;
      if (M.seq) { const v = M.measure(c); f = v == null || !isFinite(v) ? NONE() : ramp((v - rng[0]) / (rng[1] - rng[0])); } else f = M.fill(c);
      c.el.style.fill = f; });
  }
  function legend() {
    const M = modes()[st.color]; if (!M || st.color === "class") return null;
    if (M.seq) { const fmt = v => (M.label === "Size" ? Math.pow(10, v) - 1 : v).toLocaleString(window.I18N ? I18N.lang : "en", { maximumFractionDigits: M.label === "Size" ? 1 : M.digits });
      return `<b>${esc(t(M.label))}</b><span class="cramp"><i style="background:linear-gradient(90deg,${ramp(0)},${ramp(.5)},${ramp(1)})"></i><em>${esc(fmt(rng[0]))}</em><em>${esc(fmt(rng[1]))} ${esc(M.unit)}</em></span>`; }
    return `<b>${esc(t(M.label))}</b>` + M.legend().map(([col, l]) => `<span class="gl"><i style="background:${col}"></i><em>${esc(l)}</em></span>`).join("") + (M.after ? M.after() : "");
  }
  function options() { return Object.entries(modes()).map(([k, m]) => `<option value="${k}"${k === st.color ? " selected" : ""}>${esc(t(m.label))}</option>`).join(""); }
  document.head.insertAdjacentHTML("beforeend", `<style>.cramp{display:flex;flex-wrap:wrap;align-items:center;gap:2px 8px;font-size:12px;color:var(--muted)} .cramp i{display:block;width:100%;height:10px;border-radius:5px;border:1px solid var(--line)} .cramp em{font-style:normal} .cramp em:last-child{margin-left:auto}</style>`);
  return { apply, legend, options, modes, ramp, mix, NONE };
})();
