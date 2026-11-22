// The cellar's Tidy up dialog (app.js opens it): what tidy.js would change, the wines worth a look and how complete the
// cellar is, then the changes sent in parts. Loaded with the import and export tools, once the cellar is on screen, so
// the cellar page doesn't wait for it; it uses app.js's globals ($, tr, api, WINES…).
"use strict";
const TIDY_STATE = {off:new Set(), groupsOff:new Set(), fixes:[], edits:[], groups:[]};
function tidyPlan(){
  const base = WINES.map(w => ({row:w.row, producer:w.producer, name:w.name, commune:w.commune, region:w.region, country:w.country,
    grape:w.grape, source:w.source, location:w.location, vintage:w.vintage, size:w.size, elsewhere:w.elsewhere}));
  const t = tidier().wines(base, {off:TIDY_STATE.off});
  const edits = [];
  t.wines.forEach((w, i) => {
    const fields = {};
    for (const f of ["producer","name","commune","region","country","grape","source","location"]) if (String(w[f]||"") !== String(base[i][f]||"")) fields[f] = w[f];
    if (Object.keys(fields).length) edits.push({row:w.row, fields});
  });
  // the same wine in several rows (after the spellings), never mixing in wines drunk elsewhere
  const by = new Map();
  t.wines.forEach(w => { if (w.elsewhere) return; const k = TIDY.mergeKey(w); (by.get(k) || by.set(k, []).get(k)).push(w.row); });
  const groups = [...by.values()].filter(r => r.length > 1).map(r => r.sort((a,b) => a-b)).map(r => ({keep:r[0], drop:r.slice(1)}));
  // what's missing that the appellation says clearly (WINE_KB.suggest, as the Add form does): region, country, grape
  const gaps = new Map(), byRowE = new Map(edits.map(e => [e.row, e]));
  if(window.WINE_KB) t.wines.forEach((w, i) => { if(w.elsewhere) return; const o = WINES[i] || {};
    const sg = WINE_KB.suggest({name:w.name, commune:w.commune, region:w.region, country:w.country, grape:w.grape, type:o.type, typeSet:!!String(o.type||"").trim()});
    for(const f of ["region","country","grape"]){ if(String(w[f]||"").trim() || !sg[f]) continue;
      const k = f + "|" + sg[f]; if(!gaps.has(k)) gaps.set(k, {field:f, to:sg[f], rows:[]}); gaps.get(k).rows.push(w.row);
      if(TIDY_STATE.gapOff && TIDY_STATE.gapOff.has(k)) continue;
      const e = byRowE.get(w.row) || (byRowE.set(w.row, {row:w.row, fields:{}}).get(w.row)); e.fields[f] = sg[f]; } });
  const allEdits = [...byRowE.values()].filter(e => Object.keys(e.fields).length);
  Object.assign(TIDY_STATE, {fixes:t.fixes, edits:allEdits, groups, gaps:[...gaps.values()].sort((a, b) => b.rows.length - a.rows.length)});
}
// what the tidy-up can't decide for you: wines worth a look, and how complete the cellar is
// prices far from the same wine's other rows (same bottle size), or above any plausible price; tenfold = a digit off
function priceChecks(){
  const key = w => [w.producer, w.name, w.size].map(x => String(x || "").toLowerCase().replace(/\s+/g, " ").trim()).join("|");
  const priced = WINES.filter(w => !w.elsewhere && Number(w.price) > 0), by = new Map(), out = [];
  priced.forEach(w => { const k = key(w); (by.get(k) || by.set(k, []).get(k)).push(w); });
  const med = a => { const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  // three rows or more: each against the group's median, which one odd row can't pull; two: a big gap flags both,
  // as either could be the slip
  for(const w of priced){ const p = Number(w.price), g = by.get(key(w)).map(x => Number(x.price));
    if(g.length >= 2){ const two = g.length === 2, m = two ? g.find((x, i) => by.get(key(w))[i] !== w) : med(g), r = p / m;
      if(r >= 4 || r <= .25){ const tenfold = (r >= 7 && r <= 14) || (r >= 1 / 14 && r <= 1 / 7);
        out.push([w, tr(two ? "{0}; its other row {1}" : "{0}; its other rows about {1}", kr(p), kr(m)) + (tenfold ? " · " + tr(r > 1 ? "a digit too many?" : "a digit missing?") : "")]); continue; } }
    if(p >= 100000) out.push([w, tr("{0} for a bottle", kr(p))]); }
  return out;
}
function tidyLook(){
  const yr = new Date().getFullYear(), live = WINES.filter(w => !w.elsewhere && w.left > 0), pc = priceChecks(), pnote = new Map(pc);
  return {live, look:[
    ["A price that looks off", pc.map(([w]) => w), w => pnote.get(w)],
    ["No vintage", live.filter(w => !w.vintage && w.style !== "Bobler")],
    ["No price", live.filter(w => !(Number(w.price) > 0))],
    ["Past its drinking window", live.filter(w => w.drinkTo && w.drinkTo < yr)],
    ["No drinking window", live.filter(w => !w.drinkTo && !w.drinkFrom)],
    ["Unusually many bottles of one wine", live.filter(w => w.left >= 60)],
  ].filter(([, l]) => l.length),
  health:[["Vintage", w => !!w.vintage || w.style === "Bobler"], ["Region", w => !!String(w.region||"").trim()], ["Grape", w => !!String(w.grape||"").trim()],
    ["Price", w => Number(w.price) > 0], ["Drinking window", w => !!(w.drinkTo || w.drinkFrom)]].map(([l, ok]) => [l, live.length ? Math.round(100 * live.filter(ok).length / live.length) : 100])};
}
function tidyRender(){
  tidyPlan();
  const S = TIDY_STATE, offList = [...S.off].map(k => { const i = k.indexOf("|"); return {field:k.slice(0, i), from:k.slice(i + 1), off:true}; });
  const fx = S.fixes.concat(offList);
  $("tidyFixWrap").hidden = !fx.length;
  $("tidyFixes").innerHTML = fx.slice(0, 150).map(f => `<label class="jcheck"><input type="checkbox" data-fix="${esc(f.field + "|" + f.from)}"${f.off ? "" : " checked"}>
    <span><span class="fixf">${esc(tr(FIX_FIELD[f.field] || f.field))}</span> “${esc(f.from)}”${f.off ? "" : ` → “<b>${esc(f.to)}</b>”`}${f.n > 1 ? ` <span class="aimeta">${esc(trn(f.n, "{0} wine", "{0} wines"))}</span>` : ""}</span></label>`).join("");
  const byRow = new Map(WINES.map(w => [w.row, w]));
  $("tidyDupWrap").hidden = !S.groups.length;
  $("tidyDups").innerHTML = S.groups.map(g => { const ws = [g.keep, ...g.drop].map(r => byRow.get(r)), w = ws[0], key = String(g.keep);
    return `<label class="jcheck"><input type="checkbox" data-grp="${key}"${S.groupsOff.has(key) ? "" : " checked"}>
      <span><b>${esc(w.producer)}</b> ${esc([w.name, w.vintage].filter(Boolean).join(" "))} <span class="aimeta">${esc(tr("{0} rows: {1} bottles", ws.length, ws.map(x => x.qty).join(" + ")))}</span></span></label>`; }).join("");
  S.gapOff ||= new Set();
  $("tidyGapWrap").hidden = !S.gaps.length;
  $("tidyGaps").innerHTML = S.gaps.slice(0, 80).map(g => { const k = g.field + "|" + g.to;
    return `<label class="jcheck"><input type="checkbox" data-gap="${esc(k)}"${S.gapOff.has(k) ? "" : " checked"}>
      <span><span class="fixf">${esc(tr(FIX_FIELD[g.field] || g.field))}</span> — → “<b>${esc(g.to)}</b>” <span class="aimeta">${esc(trn(g.rows.length, "{0} wine", "{0} wines"))}</span></span></label>`; }).join("");
  const L = tidyLook(), byRow2 = new Map(WINES.map(w => [w.row, w]));
  $("tidyHealth").innerHTML = L.live.length ? `<h3>${esc(tr("How complete your cellar is"))} <span class="aimeta">${esc(tr("{0} % overall", Math.round(L.health.reduce((s, [, p]) => s + p, 0) / L.health.length)))}</span></h3>
    <div class="thbars">${L.health.map(([l, p]) => `<div class="thbar"><span>${esc(tr(l))}</span><i style="--p:${p}%"></i><b>${p} %</b></div>`).join("")}</div>` : "";
  $("tidyLookWrap").hidden = !L.look.length;
  $("tidyLook").innerHTML = L.look.map(([l, ws, note]) => `<details class="tlook"><summary>${esc(tr(l))} <span class="aimeta">${esc(trn(ws.length, "{0} wine", "{0} wines"))}</span></summary>
    <div class="tlist">${ws.slice(0, 12).map(w => `<button type="button" class="tlw" data-row="${w.row}">${esc(w.producer)} ${esc([w.name, w.vintage].filter(Boolean).join(" "))}${note ? ` <span class="aimeta">${esc(note(w))}</span>` : ""}</button>`).join("")}${ws.length > 12 ? `<span class="aimeta">${esc(tr("and {0} more", ws.length - 12))}</span>` : ""}</div></details>`).join("");
  const nEdit = S.edits.length, nGroup = S.groups.filter(g => !S.groupsOff.has(String(g.keep))).length;
  $("tidyIntro").textContent = (nEdit || S.groups.length || S.gaps.length) ? tr("Here's what can be tidied. Untick anything you want left as it is.") : tr("Nothing to tidy: every spelling is consistent and no wine is in two rows.");
  $("tidyGo").hidden = !(nEdit || S.groups.length || S.gaps.length);
  $("tidyGo").textContent = tr("Tidy {0} wines and join {1} groups", nEdit, nGroup);
  $("tidyGo").disabled = !(nEdit || nGroup);
}
async function tidyRun(){
  const S = TIDY_STATE, btn = $("tidyGo"), pg = progressIn($("tidyProg")); btn.disabled = true; $("tidyErr").textContent = "";
  try{
    // in parts, like the import: each must be written well within Apps Script's time, and at most 5,000 a call
    const vault = window.VAULT && VAULT.active(), ESZ = vault ? 4000 : 800, GSZ = vault ? 4000 : 300;
    let res;
    let groups = S.groups.filter(g => !S.groupsOff.has(String(g.keep))), gone = [];
    const nParts = Math.ceil(S.edits.length / ESZ) + Math.ceil(groups.length / GSZ); let k = 0; // only the last asks for the cellar back
    const say = () => pg.set(tr("Tidying… part {0} of {1}", k + 1, nParts), k, nParts);
    for(let i = 0; i < S.edits.length; i += ESZ){ say(); res = await api({action:"setinfomany", edits:S.edits.slice(i, i + ESZ), quiet:++k < nParts}); }
    // merging deletes rows, so the rows of the later parts move up by the rows deleted above them
    const moved = r => { let n = 0; for(const d of gone) if(d < r) n++; return r - n; };
    for(let i = 0; i < groups.length; i += GSZ){
      const part = groups.slice(i, i + GSZ).map(g => ({keep:moved(g.keep), drop:g.drop.map(moved)}));
      say(); res = await api({action:"mergerows", groups:part, quiet:++k < nParts});
      gone = gone.concat(groups.slice(i, i + GSZ).flatMap(g => g.drop)).sort((a,b)=>a-b);
    }
    if(res && !res.wines) res = await api({action:"data"}); // a server older than API 66 always answers with the cellar; this is for safety
    if(res){ pg.set(tr("Done: showing your cellar…")); await paintNow(); WINES = normalize(res.wines); KEEP_OPEN = null; renderOverview(); renderTable(); renderEnjoyed(); }
    pg.end();
    $("tidyModal").classList.remove("open");
    toast(tr("Cellar tidied"));
  }catch(err){
    pg.end(); const m = String(err && err.message || err);
    $("tidyErr").textContent = m === "bad-action" ? tr("Tidying needs the updated Apps Script (version 32): redeploy Code.gs.") : tr("Could not tidy: {0}", m);
    btn.disabled = false;
    if(AUTH_ERRORS.has(m)) showGate(authMsg(m));
  }
}
$("tidyCancel").addEventListener("click", ()=>$("tidyModal").classList.remove("open"));
$("tidyModal").addEventListener("click", e=>{ if(e.target===$("tidyModal")) $("tidyModal").classList.remove("open"); });
$("tidyFixes").addEventListener("change", e=>{ const c = e.target.closest("input[data-fix]"); if(!c) return; if(c.checked) TIDY_STATE.off.delete(c.dataset.fix); else TIDY_STATE.off.add(c.dataset.fix); tidyRender(); });
$("tidyGaps").addEventListener("change", e=>{ const c = e.target.closest("input[data-gap]"); if(!c) return; TIDY_STATE.gapOff ||= new Set(); if(c.checked) TIDY_STATE.gapOff.delete(c.dataset.gap); else TIDY_STATE.gapOff.add(c.dataset.gap); tidyRender(); });
$("tidyLook").addEventListener("click", e=>{ const b = e.target.closest("button[data-row]"); if(!b) return; const w = WINES.find(x => x.row === Number(b.dataset.row)); if(!w) return; $("tidyModal").classList.remove("open"); showWine(w); });
$("tidyDups").addEventListener("change", e=>{ const c = e.target.closest("input[data-grp]"); if(!c) return; if(c.checked) TIDY_STATE.groupsOff.delete(c.dataset.grp); else TIDY_STATE.groupsOff.add(c.dataset.grp); tidyRender(); });
$("tidyGo").addEventListener("click", tidyRun);
window.TIDY_UI = true;
