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
/* On a phone, pull the cellar down from the top of the page to fetch it again (as ↻ Refresh): a round arrow follows
   the finger and turns; let go once it's full to refresh, before that and nothing happens. */
(()=>{
  const PHONE = matchMedia("(max-width:700px)"), FULL = 80; let pull = null;
  const ind = document.createElement("div"); ind.id = "ptr"; ind.setAttribute("aria-hidden", "true"); ind.textContent = "↻"; document.body.appendChild(ind);
  document.head.insertAdjacentHTML("beforeend", `<style>#ptr{position:fixed;left:50%;top:calc(6px + env(safe-area-inset-top));width:38px;height:38px;margin-left:-19px;border-radius:50%;
    display:grid;place-items:center;background:var(--card);color:var(--accent);border:1px solid var(--line);box-shadow:0 4px 14px rgba(0,0,0,.15);font-size:20px;z-index:130;
    opacity:0;transform:translateY(-50px);pointer-events:none} #ptr.full{background:var(--accent);color:var(--accent-ink,#fff)} #ptr.back{transition:transform .2s,opacity .2s}</style>`);
  const show = (d, full) => { ind.classList.toggle("full", full); ind.style.opacity = Math.min(1, d / FULL); ind.style.transform = `translateY(${Math.min(d, FULL + 20) - 50}px) rotate(${d * 3}deg)`; };
  const hide = () => { ind.classList.add("back"); ind.style.opacity = 0; ind.style.transform = "translateY(-50px)"; setTimeout(()=>ind.classList.remove("back", "full"), 220); };
  document.addEventListener("touchstart", e=>{
    if(!PHONE.matches || e.touches.length !== 1 || window.scrollY > 0 || $("app").hidden || document.querySelector(".modal.open")) return;
    if(!$("pageCellar") || $("pageCellar").hidden || e.target.closest("#rows tr.main, input, textarea, select, .modal")) return; // a wine row swipes; fields are fields
    pull = {y0:e.touches[0].clientY, x0:e.touches[0].clientX, d:0, on:false};
  }, {passive:true});
  document.addEventListener("touchmove", e=>{
    if(!pull) return; const t = e.touches[0], dy = t.clientY - pull.y0, dx = t.clientX - pull.x0;
    if(!pull.on){ if(dy < 10) { if(dy < -5 || Math.abs(dx) > 10) pull = null; return; } if(window.scrollY > 0 || Math.abs(dx) > dy){ pull = null; return; } pull.on = true; }
    pull.d = dy * .6; show(pull.d, pull.d >= FULL); if(e.cancelable) e.preventDefault();
  }, {passive:false});
  const end = ()=>{ if(!pull) return; const p = pull; pull = null; if(!p.on) return;
    if(p.d >= FULL){ ind.classList.add("back"); ind.style.transform = "translateY(10px) rotate(720deg)"; $("refreshBtn").click(); setTimeout(hide, 700); } else hide(); };
  document.addEventListener("touchend", end); document.addEventListener("touchcancel", end);
})();
/* A copy of your own: the server keeps daily backups, but a file on your device is yours. With ten wines or more and
   no export from this device for 90 days (or ever), a quiet note offers one, at most once a month. */
(()=>{
  const k = s => s + (cfg.user || ""), now = Date.now(), DAY = 864e5;
  let last = 0, asked = 0; try{ last = Number(localStorage.getItem(k("vinCopy:"))) || 0; asked = Number(localStorage.getItem(k("vinCopyAsk:"))) || 0; }catch(e){ return; }
  if(WINES.length < 10 || now - last < 90 * DAY || now - asked < 30 * DAY) return;
  setTimeout(()=>{
    if($("app").hidden || document.querySelector(".modal.open") || !$("actbar").hidden) return; // not over something else
    try{ localStorage.setItem(k("vinCopyAsk:"), String(Date.now())); }catch(e){}
    notify(last ? tr("It's been a while since you kept a copy of your cellar on this device. Save one?") : tr("Keep a copy of your cellar on this device? A file of your own, beside the daily backups."),
      [{label:tr("Export"), fn:()=>$("expBtn").click()}, {label:tr("Not now"), fn:()=>{}}], {ms:15000});
  }, 5000);
})();
/* The closing windows in your calendar: a file (.ics, which any calendar opens) with an all-day reminder for each wine
   whose drink window ends this year or in the next two, on 1 March of its last year, or a week from today when that
   date has passed; each with an alert the day before. Nothing is sent anywhere: the file is made here and saved. */
(()=>{
  const btn = $("icsBtn"); if(!btn) return;
  const pad = n => String(n).padStart(2, "0"), ymd = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const escI = s => String(s).replace(/\\/g, "\\\\").replace(/[,;]/g, m => "\\" + m).replace(/\r?\n/g, "\\n");
  // lines longer than 75 octets are folded, as the format asks
  const fold = l => { const b = new TextEncoder().encode(l); if(b.length <= 75) return l; const out = []; let cur = "";
    for(const ch of l){ if(new TextEncoder().encode(cur + ch).length > (out.length ? 74 : 75)){ out.push(cur); cur = ""; } cur += ch; } out.push(cur); return out.join("\r\n "); };
  function make(){
    const now = new Date(), y = now.getFullYear(), soon = new Date(now.getTime() + 7 * 864e5);
    const list = WINES.filter(w => w.left > 0).map(w => ({w, win: drinkWindow(w)})).filter(({win}) => win && win.to != null && win.to >= y && win.to <= y + 2)
      .sort((a, b) => a.win.to - b.win.to);
    const ev = list.map(({w, win}, i) => {
      let d = new Date(win.to, 2, 1); if(d < now) d = soon; const d2 = new Date(d.getTime() + 864e5);
      const nm = [w.producer, w.name, typeof w.vintage === "number" ? w.vintage : ""].filter(Boolean).join(" ");
      return ["BEGIN:VEVENT", `UID:allwine-${y}-${w.row}-${i}@allwine.dk`, `DTSTAMP:${ymd(now)}T000000Z`, `DTSTART;VALUE=DATE:${ymd(d)}`, `DTEND;VALUE=DATE:${ymd(d2)}`,
        `SUMMARY:${escI(tr("Drink: {0}", nm))}`, `DESCRIPTION:${escI(tr("Its drink window ends in {0}. {1} left in your cellar.", win.to, btl(w.left)) + (w.location ? " " + tr("Location: {0}", w.location) : ""))}`,
        "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escI(tr("Drink: {0}", nm))}`, "TRIGGER:-P1D", "END:VALARM", "END:VEVENT"]; });
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//AllWine//Cellar//EN", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${escI(tr("AllWine: windows closing"))}`, ...ev.flat(), "END:VCALENDAR"];
    return {n: list.length, text: lines.map(fold).join("\r\n") + "\r\n"};
  }
  btn.addEventListener("click", ()=>{
    const {n, text} = make(); if(!n){ toast(tr("No wine's window closes in the next three years.")); return; }
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], {type:"text/calendar"}));
    a.download = "allwine-drink-windows.ics"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 2000);
    toast(tr(n === 1 ? "{0} wine in the calendar file: open it to add the reminder" : "{0} wines in the calendar file: open it to add the reminders", n));
  });
  window.CELLAR_ICS = make; // for the tests
})();

/* Waiting: when something asked for by a click or a key takes a moment, the glass (left) fills as the bottle (right)
   empties, in ten steps over five seconds, then again, until it's done. Only for what the person did (a call that
   starts within a second and a half of a click, a tap or Enter), not the quiet refreshes behind; and only after a
   third of a second, so a quick answer shows none. No words on screen; "One moment…" for screen readers. */
(()=>{
  const W = { da: "Et øjeblik…", fr: "Un instant…", de: "Einen Moment…" }, say = () => W[window.I18N && I18N.lang] || "One moment…";
  document.head.insertAdjacentHTML("beforeend", `<style>#busy{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:300;padding:10px 12px;background:var(--bg)}
#busy[hidden]{display:none} #busy svg{width:72px;height:46px;display:block}</style>`);
  // ten steps, one each half second: the glass's wine rises a tenth, the bottle's falls as much; then it starts over
  const G0 = 23, G1 = 9, B0 = 14, B1 = 39;
  const el = document.createElement("div"); el.id = "busy"; el.setAttribute("role", "status"); el.hidden = true;
  el.innerHTML = `<svg viewBox="0 0 64 40" aria-hidden="true"><defs>
    <clipPath id="bzG"><path d="M7 9h18c0 9-4 14-9 14s-9-5-9-14z"/></clipPath>
    <clipPath id="bzB"><path d="M45 3h6v8c0 2 4 3 4 7v19a1 1 0 0 1-1 1H42a1 1 0 0 1-1-1V18c0-4 4-5 4-7z"/></clipPath></defs>
    <rect id="bzg" x="6" y="23" width="20" height="16" fill="var(--accent)" clip-path="url(#bzG)"></rect>
    <path d="M7 9h18c0 9-4 14-9 14s-9-5-9-14zM16 23v11M10 34h12" fill="none" stroke="var(--ink)" stroke-width="1.4" stroke-linecap="round"/>
    <rect id="bzb" x="40" y="14" width="16" height="25" fill="var(--accent)" clip-path="url(#bzB)"></rect>
    <path d="M45 3h6v8c0 2 4 3 4 7v19a1 1 0 0 1-1 1H42a1 1 0 0 1-1-1V18c0-4 4-5 4-7z" fill="none" stroke="var(--ink)" stroke-width="1.4"/></svg>`;
  document.body.appendChild(el);
  const g = el.querySelector("#bzg"), bt = el.querySelector("#bzb");
  let act = 0, pending = 0, timer = 0, tick = 0, k = 0;
  const step = () => { g.setAttribute("y", G0 + (G1 - G0) * k / 10); bt.setAttribute("y", B0 + (B1 - B0) * k / 10); k = (k + 1) % 11; };
  ["pointerdown", "keydown", "submit"].forEach(t => document.addEventListener(t, e => { if(t !== "keydown" || e.key === "Enter") act = Date.now(); }, true));
  const show = () => { el.setAttribute("aria-label", say()); el.hidden = false; k = 0; step(); tick = setInterval(step, 500); };
  const hide = () => { clearTimeout(timer); clearInterval(tick); el.hidden = true; };
  const orig = window.api;
  window.api = async function(...a){
    const mine = Date.now() - act < 1500;
    if(mine && !pending++) timer = setTimeout(show, 350);
    try{ return await orig.apply(this, a); }
    finally{ if(mine && !--pending) hide(); }
  };
})();
/* Columns, on a computer: as in a spreadsheet, choose what the wine list shows. Producer and wine always; Commune,
   Vintage, Region, Bottles, Price and Location as you like (remembered on this device, per user). Every heading sorts
   (click it again to turn the order round); the filters above narrow it. */
(()=>{
  const W = { da: { Columns: "Kolonner" }, fr: { Columns: "Colonnes" }, de: { Columns: "Spalten" } };
  const word = s => (W[window.I18N && I18N.lang] || {})[s] || tr(s);
  const C = [["comm", "Commune", 0], ["vint", "Vintage", 1], ["reg", "Region", 1], ["qty", "Bottles", 0], ["price", "Price", 1], ["loc", "Location", 0]];
  const key = () => "cols:" + (cfg.user || "");
  document.head.insertAdjacentHTML("beforeend", `<style>#colBtn,#colPop{display:none}
@media(min-width:701px){#colBtn{display:inline-block} #colPop:not([hidden]){display:block;position:fixed;z-index:60;background:var(--bg);border:1px solid var(--ink);padding:6px 0;min-width:170px}
#colPop label{display:flex;gap:8px;align-items:center;padding:6px 14px;cursor:pointer;white-space:nowrap} #colPop label:hover{background:var(--line,rgba(0,0,0,.06))}
#tbl.x-vint .c-vint,#tbl.x-reg .c-reg,#tbl.x-price .c-price{width:0;padding:0;font-size:0;border:0;overflow:hidden;visibility:hidden}
#tbl.o-comm th.c-comm{width:16%} #tbl.o-qty th.c-qty{width:84px} #tbl.o-comm .ocm{display:none} #tbl.o-loc td.c-wine .wloc{display:block}}</style>`);
  let on; try{ on = JSON.parse(localStorage.getItem(key()) || "null"); }catch(e){}
  if(!Array.isArray(on)) on = C.filter(c => c[2]).map(c => c[0]);
  const apply = () => { const tb = $("tbl"); if(!tb) return;
    C.forEach(([c, , d]) => { const s = on.includes(c); tb.classList.toggle("o-" + c, s && !d); tb.classList.toggle("x-" + c, !s && !!d); }); };
  apply();
  const sel = $("selBtn"); if(!sel) return;
  sel.insertAdjacentHTML("beforebegin", `<button type="button" class="clearbtn show" id="colBtn" aria-haspopup="true" aria-expanded="false"></button>`);
  document.body.insertAdjacentHTML("beforeend", `<div id="colPop" role="group" hidden></div>`);
  const btn = $("colBtn"), pop = $("colPop"), label = () => { btn.textContent = word("Columns") + " ▾"; pop.setAttribute("aria-label", word("Columns")); };
  label();
  const close = () => { pop.hidden = true; btn.setAttribute("aria-expanded", "false"); };
  btn.addEventListener("click", e => {
    e.stopPropagation(); if(!pop.hidden) return close(); label();
    pop.innerHTML = C.map(([c, n]) => `<label><input type="checkbox" data-c="${c}"${on.includes(c) ? " checked" : ""}> ${esc(word(n))}</label>`).join("");
    const r = btn.getBoundingClientRect(); pop.style.top = (r.bottom + 4) + "px"; pop.style.left = Math.min(r.left, innerWidth - 190) + "px";
    pop.hidden = false; btn.setAttribute("aria-expanded", "true"); pop.querySelector("input").focus();
  });
  pop.addEventListener("change", e => { const c = e.target.dataset.c; if(!c) return;
    on = on.filter(x => x !== c).concat(e.target.checked ? [c] : []); try{ localStorage.setItem(key(), JSON.stringify(on)); }catch(_){}
    apply(); });
  document.addEventListener("click", e => { if(!pop.hidden && !pop.contains(e.target) && e.target !== btn) close(); });
  document.addEventListener("keydown", e => { if(e.key === "Escape" && !pop.hidden){ close(); btn.focus(); } });
  addEventListener("scroll", () => pop.hidden || close(), { passive: true });
  new MutationObserver(label).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] }); // a new language
})();
