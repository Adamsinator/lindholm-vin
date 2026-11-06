// A wine's style at a glance, from AllWine's own data (sommelier-data.js: grape profiles, aromas, serving, food;
// wine-kb.js: what grows in each appellation): its body, acidity and tannin as bars and its aromas, how to serve it,
// the wines like it in the cellar, a serving card to print for a dinner, and the cellar mapped by taste (body ×
// acidity). Loaded by app.js the first time a wine's details or the "Cellar by taste" panel need it; uses app.js's
// globals (WINES, tr, esc, $, state, renderTable, KEEP_OPEN…).
"use strict";
window.STYLE = (() => {
  const D = () => window.SOMM_DATA, KB = () => window.WINE_KB;
  const lang = () => (window.I18N && I18N.lang) || "en";
  const norm = s => KB().norm(String(s || ""));
  const COL = { "Rød": "r", "Hvid": "w", "Rosé": "p", "Rose": "p", "Bobler": "s", "Hedvin": "f" };

  // the wine's grapes: as written ("Cabernet Sauvignon, Merlot"), else those its appellation is made from
  function grapes(w) {
    const K = KB(), out = [];
    String(w.grape || "").split(/\s*[,/&+;]\s*|\s+(?:og|and|et|und)\s+/i).map(s => s.trim()).filter(Boolean).forEach(s => {
      const n = norm(s), g = K.grapes.find(x => norm(x.n) === n || x.syn.some(y => norm(y) === n)); if (g && !out.includes(g.n)) out.push(g.n); });
    if (!out.length) {
      const a = K.findApp(w.name, w.commune, w.region), col = COL[w.style];
      if (a) { const e = a.wines.find(x => x.cols.includes(col)) || a.wines[0]; (e ? e.grapes : []).forEach(g => { if (!out.includes(g)) out.push(g); }); }
    }
    return out;
  }
  // one profile for the wine: a blend is the average of its grapes (body and acidity 1–3, tannin 0–3)
  function profile(w) {
    const ps = grapes(w).map(g => D().profiles.find(p => p.n === g)).filter(Boolean); if (!ps.length) return null;
    const avg = k => ps.reduce((s, p) => s + p[k], 0) / ps.length, ar = [];
    ps.forEach(p => p.ar.forEach(a => { if (!ar.includes(a)) ar.push(a); }));
    const red = COL[w.style] ? COL[w.style] === "r" : ps.some(p => p.t > 0);
    // the drinker's own words for this bottle (Edit → Style: body, acidity) win over the grape's
    const own = Object.fromEntries(String(w.taste || "").split(";").filter(Boolean).map(x => x.split(":")));
    const L3 = { light: 1, low: 1, medium: 2, full: 3, high: 3 };
    return { grapes: ps.map(p => p.n), b: L3[own.b] || avg("b"), a: L3[own.a] || avg("a"), t: red ? avg("t") : 0, ar: ar.slice(0, 5), red };
  }
  // how to serve it: the temperature (by style and body), the glass, and whether to decant (by colour and age)
  function serving(w, p) {
    const sweet = /(^|;)s:(sweet|medium)/.test(String(w.taste || "")) || /sauternes|tokaj|barsac|beerenauslese|eiswein/i.test([w.name, w.region, w.commune].join(" "));
    const k = w.style === "Bobler" ? "S" : w.style === "Hedvin" ? "F" : sweet ? "D" : w.style === "Rød" ? (p && p.b < 2 ? "Rl" : "Rf")
      : w.style === "Rosé" || w.style === "Rose" ? "Wl"
      // a medium-bodied white is served as a full one (white Burgundy), but not the lean, cool ones
      : p && p.b >= 2 && !/chablis|m[aâ]con|muscadet|sancerre|chinon/i.test([w.name, w.commune, w.region].join(" ")) ? "Wf" : "Wl";
    const S = D().serve.find(x => x.k === k);
    const GLASS = { S: "A tulip or a white-wine glass (a flute hides the aroma)", Wl: "A white-wine glass", Wf: "A wider white-wine glass",
      Rl: "A wide bowl (a Burgundy glass)", Rf: "A large, tall bowl (a Bordeaux glass)", D: "A small white-wine or dessert glass", F: "A small port or sherry glass" };
    const age = typeof w.vintage === "number" ? new Date().getFullYear() - w.vintage : null;
    const decant = k === "Rf" ? (age != null && age >= 15 ? "Stand it upright a day; decant off the sediment just before serving." : age != null && age <= 8 ? "Decant one to two hours ahead." : "A short decant, half an hour, wakes it up.")
      : k === "Rl" && age != null && age >= 15 ? "Old and fragile: open it shortly before, no decanter." : k === "F" && /vintage/i.test(w.name || "") ? "Vintage port throws a sediment: decant it." : "";
    return { k, temp: S ? S.temp : "", label: S ? S.label[lang()] : "", glass: GLASS[k], decant };
  }
  // the dishes for it, from the grapes and region (the sommelier's food table)
  function dishes(w, p) {
    const G = new Set((p ? p.grapes : []).map(norm));
    return D().food.map(f => ({ f, s: (f.match.g || []).filter(g => G.has(norm(g))).length * 2 + ((f.match.r || []).includes(w.region) ? 1 : 0) }))
      .filter(x => x.s > 0 && (x.f.match.s !== "D" || x.s >= 2)).sort((a, b) => b.s - a.s).slice(0, 3).map(x => x.f.label[lang()]);
  }
  // wines like this one in the cellar: shared grapes count most, then the region, the style and how close they taste
  function similar(w, p) {
    const G = new Set(p.grapes);
    return WINES.filter(x => x.row !== w.row && x.left > 0).map(x => { const q = profile(x); if (!q) return null;
      const s = q.grapes.filter(g => G.has(g)).length * 3 + (x.region && x.region === w.region ? 2 : 0) + (x.style === w.style ? 1 : 0)
        - (Math.abs(q.b - p.b) + Math.abs(q.a - p.a) + Math.abs(q.t - p.t)) * 0.7;
      return { x, s }; }).filter(r => r && r.s >= 2.5).sort((a, b) => b.s - a.s).slice(0, 4).map(r => r.x);
  }
  const bars = (label, v, max) => `<span class="ssb"><i>${esc(tr(label))}</i><b aria-label="${esc(tr(label))} ${Math.round(v)}/${max}">${Array.from({ length: max }, (_, k) => `<u class="${k < Math.round(v) ? "on" : ""}"></u>`).join("")}</b></span>`;
  const aromaWords = p => p.ar.map(k => (D().AROMA[k] || {})[lang()] || k);
  const wname = w => [w.producer, w.name, w.vintage || ""].filter(Boolean).join(" ");

  // the style card in a wine's details
  function fill(box) {
    const w = WINES.find(x => x.row === Number(box.dataset.row)); if (!w) return;
    const p = profile(w); if (!p) { box.remove(); return; }
    const sv = serving(w, p), like = similar(w, p);
    box.innerHTML = `<div class="k">${esc(tr("Style at a glance"))}</div>
      <div class="ssbs">${bars("Body", p.b, 3)}${bars("Acidity", p.a, 3)}${p.red ? bars("Tannin", p.t, 3) : ""}</div>
      <div class="sar">${esc(aromaWords(p).join(" · "))}</div>
      <div class="ssv">${esc(tr("Serve at {0}", sv.temp))} · ${esc(tr(sv.glass))}${sv.decant ? " · " + esc(tr(sv.decant)) : ""}</div>
      ${like.length ? `<div class="slike"><span>${esc(tr("Like it in your cellar:"))}</span> ${like.map(x => `<button type="button" class="linkish" data-sopen="${x.row}">${esc(wname(x))}</button>`).join(", ")}</div>` : ""}
      <div class="sfoot"><span class="note">${esc(tr("From {0}: AllWine's grape profiles, a guide rather than a tasting note.", p.grapes.join(", ")))}</span>
        <button type="button" class="btn quiet" data-scard="${w.row}">${esc(tr("Print a serving card"))}</button></div>`;
  }
  // a printed card per wine for a dinner: what it is, how to serve it, what it goes with
  function printCards(rows) {
    const ws = rows.map(r => WINES.find(x => x.row === r)).filter(Boolean); if (!ws.length) return;
    let c = $("styleCards"); if (!c) { c = document.createElement("div"); c.id = "styleCards"; document.body.appendChild(c); }
    c.innerHTML = ws.map(w => { const p = profile(w), sv = serving(w, p), ds = p ? dishes(w, p) : [];
      return `<article class="scard"><h2>${esc(w.producer)}</h2><p class="sw">${esc([w.name, w.vintage].filter(Boolean).join(" · "))}</p>
        <p class="sr">${esc([w.region, w.country].filter(Boolean).join(", "))}${p ? " · " + esc(p.grapes.join(", ")) : ""}</p>
        <dl><dt>${esc(tr("Serve at"))}</dt><dd>${esc(sv.temp)}</dd><dt>${esc(tr("Glass"))}</dt><dd>${esc(tr(sv.glass))}</dd>
          ${sv.decant ? `<dt>${esc(tr("Decant"))}</dt><dd>${esc(tr(sv.decant))}</dd>` : ""}
          ${p ? `<dt>${esc(tr("Style"))}</dt><dd>${esc([tr("Body") + " " + Math.round(p.b) + "/3", tr("Acidity") + " " + Math.round(p.a) + "/3", p.red ? tr("Tannin") + " " + Math.round(p.t) + "/3" : ""].filter(Boolean).join(" · "))}</dd>
            <dt>${esc(tr("Aromas"))}</dt><dd>${esc(aromaWords(p).join(", "))}</dd>` : ""}
          ${ds.length ? `<dt>${esc(tr("Goes with"))}</dt><dd>${esc(ds.join(", "))}</dd>` : ""}</dl></article>`; }).join("");
    document.body.classList.add("style-print");
    setTimeout(() => { window.print(); setTimeout(() => document.body.classList.remove("style-print"), 500); }, 50);
  }
  document.addEventListener("click", e => {
    const o = e.target.closest && e.target.closest("[data-sopen]");
    if (o) { const w = WINES.find(x => x.row === Number(o.dataset.sopen)); if (w) showWine(w); return; } // opened in the list, filters cleared if they'd hide it
    const c = e.target.closest && e.target.closest("[data-scard]"); if (c) printCards([Number(c.dataset.scard)]);
  });

  // the cellar by taste: body across, acidity up, a bubble for each of the nine cells, its size the bottles
  function tasteMap(el, wines) {
    const cells = {}; let none = 0;
    wines.filter(w => w.left > 0).forEach(w => { const p = profile(w); if (!p) { none += w.left; return; }
      const k = Math.round(p.b) + "," + Math.round(p.a), c = cells[k] ??= { b: 0, n: 0, rows: [], red: 0 };
      c.b += w.left; c.n++; c.rows.push(w.row); if (p.red) c.red += w.left; });
    const max = Math.max(1, ...Object.values(cells).map(c => c.b)), W = 330, H = 230, x = b => 90 + (b - 1) * 100, y = a => 190 - (a - 1) * 80;
    const lab = ["Light", "Medium", "Full"], acid = ["Soft", "Fresh", "Crisp"];
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(tr("The cellar by body and acidity"))}">
      ${[1, 2, 3].map(i => `<line class="tg" x1="${x(i)}" x2="${x(i)}" y1="20" y2="200"/><line class="tg" x1="60" x2="320" y1="${y(i)}" y2="${y(i)}"/>
        <text class="tl" x="${x(i)}" y="218" text-anchor="middle">${esc(tr(lab[i - 1]))}</text><text class="tl" x="54" y="${y(i) + 4}" text-anchor="end">${esc(tr(acid[i - 1]))}</text>`).join("")}
      ${Object.entries(cells).map(([k, c]) => { const [b, a] = k.split(",").map(Number), r = 6 + Math.sqrt(c.b / max) * 26;
        return `<g class="tc" data-cell="${k}" tabindex="0" role="button" aria-label="${esc(tr(c.b === 1 ? "1 bottle: {1} body, {2} acidity" : "{0} bottles: {1} body, {2} acidity", c.b, tr(lab[b - 1]).toLowerCase(), tr(acid[a - 1]).toLowerCase()))}">
          <circle cx="${x(b)}" cy="${y(a)}" r="${r.toFixed(1)}" class="${c.red * 2 > c.b ? "red" : "white"}"/><text x="${x(b)}" y="${y(a) + 4}" text-anchor="middle">${c.b}</text></g>`; }).join("")}
    </svg>${none ? `<p class="ph">${esc(none === 1 ? tr("1 bottle without a known grape isn't placed.") : tr("{0} bottles without a known grape aren't placed.", none))}</p>` : ""}`;
    el.querySelectorAll(".tc").forEach(g => { const pick = () => { const c = cells[g.dataset.cell], [b, a] = g.dataset.cell.split(",").map(Number);
        const same = state.tasteRows && state.tasteKey === g.dataset.cell;
        state.tasteRows = same ? null : new Set(c.rows); state.tasteKey = same ? "" : g.dataset.cell;
        state.tasteLabel = same ? "" : tr("{0} body, {1} acidity", tr(lab[b - 1]), tr(acid[a - 1]).toLowerCase());
        renderTable(); el.querySelectorAll(".tc").forEach(x => x.classList.toggle("on", x.dataset.cell === state.tasteKey)); };
      g.addEventListener("click", pick); g.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } }); });
    el.querySelectorAll(".tc").forEach(x => x.classList.toggle("on", x.dataset.cell === state.tasteKey));
  }

  document.head.insertAdjacentHTML("beforeend", `<style>
.wstyle{margin:10px 0;padding:10px 12px;border:1px solid var(--line);border-radius:10px}
.wstyle .k{font-size:11.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px}
.ssbs{display:flex;flex-wrap:wrap;gap:4px 16px} .ssb{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--muted)} .ssb i{font-style:normal}
.ssb b{display:inline-flex;gap:2px} .ssb u{display:inline-block;width:16px;height:7px;border-radius:2px;background:var(--line)} .ssb u.on{background:var(--accent,#7C2D3E)}
.sar{font-size:13px;margin:4px 0} .ssv{font-size:13px;color:var(--ink)} .slike{font-size:13px;margin-top:4px} .slike span{color:var(--muted)}
.slike .linkish{background:none;border:0;padding:0;font:inherit;color:var(--accent,#7C2D3E);cursor:pointer;text-decoration:underline}
.sfoot{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;justify-content:space-between;margin-top:6px} .sfoot .note{font-size:11.5px}
#tasteMap svg{width:100%;max-width:360px;display:block} #tasteMap .tg{stroke:var(--line)} #tasteMap .tl{font-size:10.5px;fill:var(--muted)}
#tasteMap .tc{cursor:pointer} #tasteMap .tc circle{fill:color-mix(in srgb,var(--accent,#7C2D3E) 70%,transparent)} #tasteMap .tc circle.white{fill:color-mix(in srgb,#C9A227 75%,transparent)}
#tasteMap .tc text{font-size:11px;font-weight:600;fill:#fff;pointer-events:none} #tasteMap .tc.on circle{stroke:var(--ink);stroke-width:2.5}
#styleCards{display:none}
@media print{ body.style-print > *:not(#styleCards){display:none !important} body.style-print #styleCards{display:block}
  .scard{break-inside:avoid;border:1px solid #bbb;border-radius:6px;padding:12mm 12mm 8mm;margin:0 0 8mm;font-family:Georgia,serif;color:#111}
  .scard h2{margin:0;font-size:20pt} .scard .sw{margin:2pt 0;font-size:13pt} .scard .sr{margin:0 0 8pt;color:#555;font-size:10.5pt}
  .scard dl{display:grid;grid-template-columns:28mm 1fr;gap:3pt 8pt;font:10.5pt system-ui,sans-serif;margin:0} .scard dt{color:#666} .scard dd{margin:0} }
</style>`);
  return { fill, tasteMap, profile, serving, similar, grapes, printCards };
})();
