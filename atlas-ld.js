// Lieux-dits on the Wine atlas (atlas.js loads this with a region that has them: atlas-<id>-ld.js, the cadastre's named
// places, Etalab, Licence Ouverte). Their outlines and names show once you're zoomed in close; a climat's panel lists the
// lieux-dits inside it; a tap on land outside the climats, zoomed in, opens the lieu-dit there: its area, terrain and the
// appellations it lies in. Runs in atlas.js's scope (a classic script: st, el, t, esc, fmtHa, select, fit, ROT…).
"use strict";
window.ATLAS_LDUI = (() => {
  document.head.insertAdjacentHTML("beforeend", `<style>#map .ld{fill:none;stroke:var(--ink);stroke-opacity:.28;stroke-dasharray:3 2} #map .ldsel{stroke:var(--accent);stroke-opacity:1;stroke-dasharray:none;fill:color-mix(in srgb,var(--accent) 10%,transparent)}
#map .tn-ld{fill:var(--muted);font-style:italic;paint-order:stroke;stroke:var(--mapbg);font-weight:500} .ldlist{line-height:1.8;font-size:13.5px}</style>`); // its own styles, with it
  const NEAR = 3200; // view width (m) under which they show
  let L = null, gOut = null, gNames = null, idsIn = new Map();
  const ringOf = f => { const o = []; let x = 0, y = 0; for (let i = 0; i < f.length; i += 2) { x += f[i]; y += f[i + 1]; o.push([x, y]); } return o; };
  const area = r => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(s / 2); };
  const geom = l => { if (!l._r) { l._r = ringOf(l[4]); l._bb = bbOf([[l._r]]); l._a = area(l._r); } return l; };
  const bare = s => norm(s).replace(/^(les?|la|l|aux?|en|sur|sous|derriere|dessus|dessous)\s+/, "").trim();
  const inRing = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  const inMP = (x, y, mp) => mp.some(p => inRing(x, y, p[0]) && !p.slice(1).some(h => inRing(x, y, h)));
  function data(R) { return window.ATLAS_LD && ATLAS_LD[R.id]; }
  // load once wanted: zoomed in close, or a climat's panel opened
  function want() {
    const R = st.region; if (!R || !R.ld || L) return Promise.resolve(L);
    return (want.p = want.p || (data(R) ? Promise.resolve() : loadScript(R.ld)).then(() => { if (st.region !== R) return null; L = data(R); L.ld.forEach(geom); draw(); if (st.sel) renderSide(); return L; }).catch(() => { want.p = null; return null; }));
  }
  function reset() { L = null; want.p = null; gOut = gNames = null; idsIn = new Map(); st.ld = null; }
  function draw() {
    if (!L || !ROT.g) return;
    if (gOut) gOut.remove(); if (gNames) gNames.remove();
    gOut = el("g", { class: "ldo", "pointer-events": "none" }); ROT.g.insertBefore(gOut, gShade); // over the climats, under roads and names
    gNames = el("g", { class: "ldn", "pointer-events": "none" }, ROT.g);
    const tiles = new Map(); // one path per few km, so the browser can skip what's off-screen
    L.ld.forEach(l => { const k = Math.floor(l[2] / 1500) + "," + Math.floor(l[3] / 1500); tiles.set(k, (tiles.get(k) || "") + "M" + l._r.map(p => p.join(" ")).join("L") + "Z"); });
    tiles.forEach(d => el("path", { class: "ld", d }, gOut));
    // names, except where the climat drawn there already says it
    L.ld.forEach((l, i) => { const c = climatAt([l[2], l[3]]); if (c && bare(c.n) === bare(l[1])) return;
      const e = el("text", { class: "tn tn-ld", x: l[2], y: l[3] }, gNames); e.textContent = l[1]; e._i = i; });
    sel(); lod();
  }
  // shown only zoomed in; names kept clear of the climats' labels and of each other
  function lod() {
    if (!gOut || !st.view) return; const on = st.view[2] < NEAR; gOut.style.display = gNames.style.display = on ? "" : "none";
    if (!on) return; const k = st.view[2] / (svg.clientWidth || 800), taken = LABEL_BOXES.slice(), fs = 10.5 * k;
    for (const e of gNames.children) { const x0 = +e.getAttribute("x"), y0 = +e.getAttribute("y"), [x, y] = rotP([x0, y0]), w = e.textContent.length * fs * .55;
      const box = [x - w / 2, y - fs * .6, x + w / 2, y + fs * .6], hide = taken.some(o => !(box[2] < o[0] || box[0] > o[2] || box[3] < o[1] || box[1] > o[3]));
      e.style.display = hide ? "none" : ""; if (hide) continue; taken.push(box); e.style.fontSize = fs + "px"; e.style.strokeWidth = 3 * k + "px"; upright(e, x0, y0); }
    if (gOut.firstChild) gOut.querySelectorAll("path").forEach(p => p.style.strokeWidth = (st.ld != null && p.classList.contains("ldsel") ? 2.5 : 0.8) * k + "px");
  }
  function sel() { if (!gOut) return; gOut.querySelectorAll(".ldsel").forEach(e => e.remove());
    if (st.ld == null || !L || !L.ld[st.ld]) return; const l = L.ld[st.ld]; el("path", { class: "ld ldsel", d: "M" + l._r.map(p => p.join(" ")).join("L") + "Z" }, gOut); lod(); }
  // the lieu-dit under a tap (zoomed in), outside the climats
  function at(p) { if (!L || !st.view || st.view[2] >= NEAR) return -1;
    for (let i = 0; i < L.ld.length; i++) { const l = L.ld[i], b = l._bb; if (p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3] && inRing(p[0], p[1], l._r)) return i; } return -1; }
  function pick(i, fly) { st.ld = i; st.sel = null; paint(); renderSide(); sel(); document.body.classList.add("side-open");
    if (fly && L && L.ld[i]) fit(L.ld[i]._bb, .5, 360); }
  // the lieux-dits inside a climat (their label point in it), its own name left out
  function inside(c) { if (!L || !c.g) return null; if (idsIn.has(c.id)) return idsIn.get(c.id);
    const own = bare(c.n), seen = new Set(), out = [];
    L.ld.forEach((l, i) => { const k = bare(l[1]); if (k === own || seen.has(k) || !inMP(l[2], l[3], c.g)) return; seen.add(k); out.push(i); });
    idsIn.set(c.id, out); return out; }
  function listHtml(c) { if (!st.region || !st.region.ld) return ""; if (!L) { want(); return ""; }
    const ids = inside(c); if (!ids || !ids.length) return "";
    return `<h3>${esc(t("Lieux-dits"))}</h3><p class="ldlist">${ids.map(i => `<button type="button" class="plink" data-ld="${i}">${esc(L.ld[i][1])}</button>`).join(" · ")}</p>`; }
  // the panel for one lieu-dit
  function html() {
    const l = L.ld[st.ld], m = l[5], ha = l._a / 1e4, comm = (L.meta.communes || {})[l[0]] || "";
    const pt = [l[2], l[3]], cls = st.pack.climats.filter(c => c.g && inMP(pt[0], pt[1], c.g)), vil = st.pack.villages.find(v => v.g && inMP(pt[0], pt[1], v.g));
    const CN = { GC: t("Grand cru"), "1er": t("Premier cru"), V: t("Village climat"), AOC: t("Cru appellation") };
    return `<p><button class="btn" id="back">← ${esc(st.pack.meta.name)}</button></p><span class="pill">${esc(t("Lieu-dit"))}</span><h2>${esc(l[1])}</h2>
      <div class="meta">${esc(comm)}${vil && vil.n !== comm ? " · " + esc(vil.n) : ""}</div>
      <div class="facts"><div class="fact"><div class="l">${esc(t("Area"))}</div><div class="v">${fmtHa(ha)} ha</div></div>
      ${m ? `<div class="fact"><div class="l">${esc(t("Altitude"))}</div><div class="v">${m[0]}–${m[1]} m</div></div><div class="fact"><div class="l">${esc(t("Slope"))}</div><div class="v">${m[3].toFixed(m[3] < 10 ? 1 : 0)} %</div></div>` : ""}</div>
      <h3>${esc(t("Appellation"))}</h3>
      ${cls.length ? `<ul class="list">${cls.map(c => `<li><button type="button" class="plink" data-c="${esc(c.id)}">${esc(c.n)}</button> <span class="note">${esc(CN[c.c] || "")}</span></li>`).join("")}</ul>`
        : vil ? `<p>${esc(t("Village appellation ({0}); no premier or grand cru here.", vil.n))}</p>` : `<p>${esc(t("Regional appellations only."))}</p>`}
      <p class="note">${esc(t("A lieu-dit is a named place on the land register (cadastre); a climat is a named vineyard of an appellation. They often match, but one climat can hold several lieux-dits, and a lieu-dit can straddle two climats."))}</p>
      <p class="src">${esc(t("Outline: cadastre (Etalab). Terrain: IGN RGE ALTI®, sampled inside the outline."))}</p>`;
  }
  function side() { const s = $("side"); s.innerHTML = html(); $("back").onclick = () => { st.ld = null; sel(); renderSide(); };
    s.querySelectorAll("button[data-c]").forEach(b => b.onclick = () => { st.ld = null; sel(); select(b.dataset.c, true); }); }
  function wire(s) { s.querySelectorAll("button[data-ld]").forEach(b => b.onclick = () => pick(+b.dataset.ld, true)); }
  return { want, reset, draw, lod, at, pick, listHtml, side, wire, NEAR, loaded: () => !!L };
})();
