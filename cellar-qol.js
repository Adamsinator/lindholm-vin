// The cellar's conveniences, loaded once the cellar is on screen (app.js loads it): phone sheets that swipe closed,
// a wine swiped left to drink a bottle, keys on a computer, and several wines at once (Select). A classic script on
// app.js's shared scope ($, tr, WINES, api, rowAction, renderTable, SELECTING, SEL…).
"use strict";
window.CELLAR_QOL = true;
// Keys on a computer, on the cellar page with no dialog open: / goes to the search and N adds a wine (not while
// typing); ↓ from the search goes into the list, and ↑ ↓ move from wine to wine once one has focus (Enter opens it,
// as before). Without a wine in focus the arrows scroll the page as usual.
document.addEventListener("keydown", e=>{
  if(e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
  if(document.querySelector(".modal.open") || $("app").hidden || !$("pageCellar") || $("pageCellar").hidden) return;
  const a = document.activeElement, inQ = a === $("q"), typing = a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
  const rows = () => [...document.querySelectorAll("#rows tr.main")];
  const go = r => { if(!r) return; e.preventDefault(); r.focus({preventScroll:true}); r.scrollIntoView({block:"nearest"}); };
  if(inQ && e.key === "ArrowDown") return go(rows()[0]);
  if(typing) return;
  if(e.key === "/"){ e.preventDefault(); $("q").focus(); $("q").select(); return; }
  if(e.key.toLowerCase() === "n" && !e.shiftKey){ e.preventDefault(); $("addBtn").click(); return; }
  if(e.key === "ArrowDown" || e.key === "ArrowUp"){
    const r = a && a.closest && a.closest("#rows tr.main"); if(!r) return;
    const all = rows(), i = all.indexOf(r);
    if(e.key === "ArrowUp" && i === 0){ e.preventDefault(); $("q").focus(); return; } // back up to the search
    go(all[i + (e.key === "ArrowDown" ? 1 : -1)]);
  }
});
/* Several wines at once: Select, tap the wines (or Enter on them), then move them all to a location, or drink a bottle
   of each (one Undo for the lot). Done, or Esc, ends it. */
function selShow(){
  $("selBtn").setAttribute("aria-pressed", String(SELECTING)); document.body.classList.toggle("selecting", SELECTING);
  $("selBar").hidden = !SELECTING; const n = SEL.size;
  $("selN").textContent = n ? tr(n === 1 ? "{0} wine chosen" : "{0} wines chosen", n) : tr("Tap the wines");
  $("selMove").disabled = !n; $("selDrink").disabled = ![...SEL].some(r=>{ const w = WINES.find(x=>x.row===r); return w && w.left > 0; });
}
function selToggle(row){ const r = Number(row.dataset.row); if(SEL.has(r)) SEL.delete(r); else SEL.add(r); row.classList.toggle("sel", SEL.has(r)); selShow(); }
function selEnd(){ SELECTING = false; SEL.clear(); document.querySelectorAll("#rows tr.main.sel").forEach(r=>r.classList.remove("sel")); selShow(); }
$("selBtn").addEventListener("click", ()=>{ if(SELECTING) return selEnd(); SELECTING = true; document.querySelectorAll("#rows tr.detail:not([hidden])").forEach(d=>d.hidden = true); selShow(); });
$("selDone").addEventListener("click", selEnd);
document.addEventListener("keydown", e=>{ if(!SELECTING || document.querySelector(".modal.open")) return;
  if(e.key === "Escape") selEnd();
  else if((e.key === "Enter" || e.key === " ") && document.activeElement && document.activeElement.matches("#rows tr.main")){ e.preventDefault(); e.stopImmediatePropagation(); selToggle(document.activeElement); } }, true);
// one after another, with the bar saying how far it got; the list redrawn once at the end
async function selRun(rows, call, busy){
  const btns = [...$("selBar").querySelectorAll("button")]; btns.forEach(b=>b.disabled = true);
  let res = null, done = 0;
  try{ for(const r of rows){ $("selN").textContent = tr(busy, ++done, rows.length); res = await call(r); } }
  finally{ if(res && res.wines) WINES = normalize(res.wines); renderOverview(); renderTable(); renderEnjoyed(); btns.forEach(b=>b.disabled = false); selShow(); }
  return done;
}
$("selMove").addEventListener("click", ()=>{
  const n = SEL.size; if(!n) return;
  $("moveWhat").textContent = tr(n === 1 ? "{0} wine" : "{0} wines", n); $("moveErr").hidden = true;
  const locs = new Set([...SEL].map(r=>(WINES.find(x=>x.row===r) || {}).location || "")); $("moveTo").value = locs.size === 1 ? [...locs][0] : "";
  $("moveModal").classList.add("open"); setTimeout(()=>$("moveTo").focus(), 40);
});
$("moveCancel").addEventListener("click", ()=>$("moveModal").classList.remove("open"));
$("moveModal").addEventListener("click", e=>{ if(e.target===$("moveModal")) $("moveModal").classList.remove("open"); });
$("moveForm").addEventListener("submit", async e=>{
  e.preventDefault(); const to = $("moveTo").value.trim();
  const rows = [...SEL].filter(r=>{ const w = WINES.find(x=>x.row===r); return w && String(w.location||"").trim() !== to; });
  $("moveModal").classList.remove("open"); if(!rows.length){ toast(tr("Already there")); return selEnd(); }
  try{ const n = await selRun(rows, r=>{ const w = WINES.find(x=>x.row===r);
      return api({action:"setinfo", row:r, fields:{location:to}, old:{producer:w.producer, wine:w.name, vintage:w.vintage??""}, journal:false}); }, "Moving {0} of {1}…");
    toast(to ? tr(n === 1 ? "{0} wine moved to {1}" : "{0} wines moved to {1}", n, to) : tr(n === 1 ? "Location taken off {0} wine" : "Location taken off {0} wines", n)); selEnd(); }
  catch(err){ toast(tr("Could not save: {0}", errText(err))); }
});
$("selDrink").addEventListener("click", async ()=>{
  const rows = [...SEL].filter(r=>{ const w = WINES.find(x=>x.row===r); return w && w.left > 0; }); if(!rows.length) return;
  if(!(await ask(tr(rows.length === 1 ? "Mark a bottle of {0} wine as drunk?" : "Mark a bottle of each of {0} wines as drunk?", rows.length), {ok:tr("Drink")}))) return;
  const did = [];
  try{ await selRun(rows, async r=>{ const res = await api({action:"drink", row:r, qty:1}); did.push(r); return res; }, "Drinking {0} of {1}…");
    if(navigator.vibrate) try{ navigator.vibrate(12); }catch(e){}
    notify(tr(did.length === 1 ? "Skål! {0} bottle marked as drunk" : "Skål! {0} bottles marked as drunk", did.length), [{label:tr("Undo"), fn: async ()=>{
      try{ await selRun(did, r=>api({action:"undrink", row:r, qty:1}), "Putting back {0} of {1}…"); toast(tr("Bottles back in the cellar")); }catch(err){ toast(tr("Could not update: {0}", errText(err))); } }}], {ms:10000});
    selEnd();
  }catch(err){ toast(tr("Could not update: {0}", errText(err)) + (did.length ? " · " + tr("{0} done", did.length) : "")); }
});
/* On a phone, swipe a wine in the list to the left to drink a bottle of it (as "Mark 1 bottle as drunk", with Undo
   and the rating after): the row slides with the finger and a band says "Drink a bottle"; let go past it to drink,
   short of it and the row slides back. A wine with no bottles left doesn't move. */
(()=>{
  const PHONE = matchMedia("(max-width:700px)"), FAR = 90; let sw = null;
  const clear = r => { r.classList.add("swback"); r.style.setProperty("--sw", "0px"); setTimeout(()=>{ r.classList.remove("swl", "swback"); r.style.removeProperty("--sw"); r.style.removeProperty("--swo"); }, 200); };
  $("rows").addEventListener("touchstart", e=>{
    if(!PHONE.matches || e.touches.length !== 1) return; const r = e.target.closest("tr.main"); if(!r || e.target.closest("button, a, input, select")) return;
    const w = WINES.find(x=>x.row===Number(r.dataset.row)); if(!w || w.left < 1) return;
    sw = {r, x0:e.touches[0].clientX, y0:e.touches[0].clientY, on:false, dx:0};
  }, {passive:true});
  $("rows").addEventListener("touchmove", e=>{
    if(!sw) return; const t = e.touches[0], dx = t.clientX - sw.x0, dy = t.clientY - sw.y0;
    if(!sw.on){ if(Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      if(Math.abs(dy) > Math.abs(dx) || dx > 0){ sw = null; return; } // up, down or right: the page scrolls as usual
      sw.on = true; sw.r.dataset.swl = tr("Drink a bottle"); sw.r.classList.add("swl"); }
    sw.dx = Math.min(0, dx); const d = Math.min(-sw.dx, 160);
    sw.r.style.setProperty("--sw", d + "px"); sw.r.style.setProperty("--swo", Math.min(1, d / FAR).toFixed(2));
    if(e.cancelable) e.preventDefault();
  }, {passive:false});
  const end = ()=>{ if(!sw) return; const s = sw; sw = null; if(!s.on) return;
    const row = Number(s.r.dataset.row); clear(s.r);
    if(-s.dx >= FAR){ const b = document.querySelector(`#rows button[data-act="drink"][data-row="${row}"]`) || document.createElement("button");
      rowAction("drink", row, b); }
  };
  $("rows").addEventListener("touchend", end); $("rows").addEventListener("touchcancel", end);
  // a tap after a swipe isn't a tap on the row
  $("rows").addEventListener("click", e=>{ const r = e.target.closest("tr.main"); if(r && r.classList.contains("swl")){ e.stopPropagation(); e.preventDefault(); } }, true);
})();
/* On a phone every dialog is a sheet with a handle: drag it down to close it, from the handle or from anywhere while the
   sheet is scrolled to its top. It follows the finger; let go far enough down (or flick it) and it closes as a tap
   beside it would, so a sheet that must stay (the recovery code) springs back, as it does from that tap. */
(()=>{
  const PHONE = matchMedia("(max-width:700px)"); let drag = null;
  document.addEventListener("touchstart", e=>{
    if(!PHONE.matches || e.touches.length !== 1) return;
    const card = e.target.closest && e.target.closest(".modal.open > .card"); if(!card) return;
    if(e.target.closest("input, textarea, select, [contenteditable]")) return; // a field gets the touch
    const t = e.touches[0], top = t.clientY - card.getBoundingClientRect().top;
    if(top > 56 && card.scrollTop > 0) return; // scrolled down inside: the touch scrolls
    drag = {card, modal:card.parentNode, y0:t.clientY, x0:t.clientX, t0:Date.now(), dy:0, on:false, handle: top <= 56};
  }, {passive:true});
  document.addEventListener("touchmove", e=>{
    if(!drag) return; const t = e.touches[0], dy = t.clientY - drag.y0, dx = t.clientX - drag.x0;
    if(!drag.on){
      if(Math.abs(dy) < 8) return;
      // a sideways or upward start, or a scroll inside a sheet already scrolled down, is not a drag
      if(dy < 0 || Math.abs(dx) > Math.abs(dy) || (!drag.handle && drag.card.scrollTop > 0)){ drag = null; return; }
      drag.on = true; drag.card.style.transition = "none"; drag.card.style.animation = "none";
    }
    drag.dy = Math.max(0, dy); drag.card.style.transform = `translateY(${drag.dy}px)`;
    if(e.cancelable) e.preventDefault(); // the page under it doesn't scroll meanwhile
  }, {passive:false});
  const end = ()=>{
    if(!drag) return; const d = drag; drag = null; if(!d.on) return;
    const fast = d.dy / Math.max(1, Date.now() - d.t0) > .6, far = d.dy > Math.min(140, d.card.offsetHeight * .3);
    d.card.style.transition = "transform .22s cubic-bezier(.2,.8,.2,1)";
    const reset = ()=>{ d.card.style.transform = d.card.style.transition = d.card.style.animation = ""; };
    if(far || (fast && d.dy > 40)){ // slide the rest of the way, then close as a tap beside it does
      d.card.style.transform = "translateY(100%)";
      setTimeout(()=>{ d.modal.dispatchEvent(new MouseEvent("click", {bubbles:true}));
        if(!d.modal.classList.contains("open")) return reset();
        d.card.style.transform = "translateY(0)"; setTimeout(reset, 240); }, 180);
      return;
    }
    d.card.style.transform = "translateY(0)"; setTimeout(reset, 240);
  };
  document.addEventListener("touchend", end); document.addEventListener("touchcancel", end);
})();
