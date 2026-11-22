// The cellar's import dialog and its table for typing wines in (app.js opens them): the file read and mapped here in
// the browser (import.js), checked with the tidy-up's spellings (tidy.js), then sent in parts ('addmany'). Loaded with
// the tools once the cellar is on screen, so the cellar page doesn't wait for it; it uses app.js's globals.
"use strict";
const IMP_FIELDS = {"":"— not imported —", producer:"Producer", name:"Vineyard / cuvée", commune:"Commune", region:"Region",
  country:"Country", classification:"Classification", type:"Type (red, white…)", grape:"Grape", vintage:"Vintage",
  qty:"Bottles", left:"Bottles left", drunk:"Drunk", price:"Price per bottle", value:"Value now", source:"Bought at",
  note:"Note", rating:"My rating", acquired:"Acquired date", drunkDate:"Drunk date", size:"Format",
  drinkFrom:"Drink from", drinkTo:"Drink to", window:"Drink window (2025–2035)", location:"Location (cellar, shelf…)", elsewhere:"Drunk elsewhere (not from the cellar)", line:"The whole wine on one line"};
const IMP_ERR = {"not-zip":"That file doesn't look like an Excel workbook.", "bad-zip":"That file doesn't look like an Excel workbook.",
  "not-xlsx":"That file doesn't look like an Excel workbook.",
  "old-xls":"That's an older Excel file (.xls) or another spreadsheet format. In Excel choose File → Save As → Excel Workbook (.xlsx) or CSV, and import that.",
  "too-big":"That file is too large (at most 20 MB).", "zip-method":"Couldn't read that workbook. Save it as CSV and try again."};
// "1 row" / "3 rows": the singular is its own string, so every language can say it its own way
const trn = (n, one, many, ...rest) => n === 1 ? tr(one, n, ...rest) : tr(many, n, ...rest);
const IMP = {book:null, sheet:0, t:null, fields:[], built:null, d:null, name:"", off:new Set(), merge:true};
// one tidier for the whole visit: the producers, communes and vineyards it knows, so spellings come out the same
let TIDIER = null;
function tidier(){
  if(TIDIER) return TIDIER;
  const B = window.BURG || {}, prods = new Set();
  WINES.forEach(w => w.producer && prods.add(w.producer));
  Object.values(B.producers || {}).forEach(p => prods.add(p));
  Object.keys(window.PRODUCER_NOTES || {}).forEach(p => prods.add(p));
  return TIDIER = TIDY.create({producers:[...prods], names:(B.climats || []).map(c => c.n),
    communes:(B.villages || []).flatMap(v => String(v.n).split(" · ")).filter(n => n.length > 5)});
}
const FIX_FIELD = {producer:"Producer", name:"Vineyard / cuvée", commune:"Commune", region:"Region", country:"Country", grape:"Grape", source:"Bought at", location:"Location"};
function impReset(){
  Object.assign(IMP, {book:null, sheet:0, t:null, fields:[], built:null, d:null, name:"", off:new Set(), merge:true});
  TIDIER = null; $("impMerge").checked = true;
  $("impPick").hidden = false; $("impMap").hidden = true; $("impBack").hidden = true; $("impGo").hidden = true; $("impGrid").hidden = true;
  IMP.fromGrid = false; trSet("Import wines", $("impTitle").firstElementChild); trSet("Choose another file", $("impBack"));
  $("impErr").textContent = ""; $("impFile").value = "";
  $("impLock").textContent = (window.VAULT && VAULT.active())
    ? tr("The file is read in this browser and never uploaded. The wines are encrypted here before they're saved, like the rest of your cellar.")
    : tr("The file is read in this browser and never uploaded; only the wines are saved to your cellar.");
}
async function impOpen(file){
  try{ await needTools(); }catch(e){ $("impErr").textContent = tr("Couldn't load the importer. Check your connection and try again."); return; }
  $("impErr").textContent = ""; const pg = progressIn($("impProg"));
  try{
    pg.set(tr("Reading {0}…", file.name)); await paintNow();
    const book = await IMPORT.read(file);
    const sheets = book.sheets.filter(s => s.rows.some(r => r.some(c => String(c && c.date || c).trim() !== "")));
    if(!sheets.length) throw new Error("empty");
    book.sheets = sheets; IMP.book = book; IMP.name = file.name;
    // start on the sheet that looks most like a cellar list
    const score = s => { const t = IMPORT.table(s.rows); return (t.header >= 0 ? 1000 : 0) + t.columns.filter(c => c.field).length * 100 + Math.min(t.rows, 99) - (s.hidden ? 5000 : 0); };
    IMP.sheet = sheets.map((s,i) => [score(s), i]).sort((a,b) => b[0]-a[0])[0][1];
    $("impSheet").innerHTML = sheets.map((s,i) => `<option value="${i}">${esc(s.name)}</option>`).join("");
    $("impSheet").value = IMP.sheet; $("impSheet").hidden = sheets.length < 2;
    $("impName").textContent = file.name;
    const n = sheets[IMP.sheet].rows.length;
    if(n > 3000){ pg.set(tr("Read {0} rows. Checking spellings and joining rows of the same wine…", fmt(n))); await paintNow(); }
    impSheet(); pg.end();
    $("impPick").hidden = true; $("impMap").hidden = false; $("impBack").hidden = false; $("impGo").hidden = false;
  }catch(err){
    pg.end(); const m = String(err && err.message || err);
    $("impErr").textContent = m === "empty" ? tr("No wines found in that file.")
      : IMP_ERR[m] ? tr(IMP_ERR[m])
      : /require|DecompressionStream/.test(m) ? tr("This browser can't open Excel files. Save the sheet as CSV and import that.")
      : tr("Couldn't read that file ({0}).", m);
  }
}
function impSheet(){
  const rows = IMP.book.sheets[IMP.sheet].rows;
  IMP.t = IMPORT.table(rows);
  IMP.fields = IMP.t.columns.map(c => c.field);
  $("impHint").textContent = IMP.t.header >= 0
    ? tr("Headings found in row {0}. Check that each column goes to the right place:", IMP.t.header + 1)
    : tr("No headings found, so the first row is a wine too. Choose what each column holds:");
  const opts = Object.entries(IMP_FIELDS).map(([k,v]) => `<option value="${k}">${esc(tr(v))}</option>`).join("");
  $("impCols").innerHTML = `<span class="ih">${esc(tr("Column"))}</span><span class="ih is">${esc(tr("Example"))}</span><span class="ih">${esc(tr("Goes to"))}</span>`
    + IMP.t.columns.map((c,i) => `<span class="il">${esc(c.label)}</span><span class="is" title="${esc(c.sample.join(" · "))}">${esc(c.sample.join(" · ")) || "—"}</span>`
      + `<select data-col="${i}" aria-label="${esc(c.label)}">${opts}</select>`).join("");
  $("impCols").querySelectorAll("select").forEach(s => { s.value = IMP.fields[Number(s.dataset.col)]; s.classList.toggle("on", !!s.value); });
  impBuild();
}
function impBuild(){
  const rows = IMP.book.sheets[IMP.sheet].rows;
  IMP.built = IMPORT.build(rows, IMP.t.header, IMP.fields);
  // one spelling per thing (shown below, each can be undone), then rows of the same wine as one
  const tidied = tidier().wines(IMP.built.wines, {existing:WINES, off:IMP.off});
  IMP.fixes = tidied.fixes;
  const mg = IMP.merge ? TIDY.merge(tidied.wines) : {wines:tidied.wines, merged:0};
  IMP.merged = mg.merged;
  IMP.d = IMPORT.dedupe(mg.wines, WINES, TIDY.mergeKey);
  // at most 25,000 new rows from one import, counted after rows of the same wine are joined (a 50,000-row export
  // can be a few thousand wines: before, the file itself was cut at 25,000 rows and half its bottles left out)
  IMP.cut = IMP.d.fresh.length > IMPORT.MAX_ROWS; if(IMP.cut) IMP.d.fresh = IMP.d.fresh.slice(0, IMPORT.MAX_ROWS);
  const ws = mg.wines, dupRows = new Set(IMP.d.dupes.map(x => x.wine));
  const fmt = n => Number(n).toLocaleString(I18N_LOCALE());
  const head = ["", tr("Producer"), tr("Vineyard / cuvée"), tr("Commune"), tr("Vintage"), tr("Bottles"), tr("Price"), tr("Type"), tr("Format")];
  $("impPrev").innerHTML = `<thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>`
    + ws.slice(0, 8).map(w => `<tr><td>${dupRows.has(w) ? `<span class="dup">${esc(tr("in cellar"))}</span>` : w.rows ? `<span class="dup">${esc(tr("rows {0}", w.rows.join(", ")))}</span>` : esc(tr("row {0}", w.src))}</td>`
      + `<td>${esc(w.producer)}</td><td>${esc(w.name||"")}</td><td>${esc(w.commune||"")}</td><td>${esc(w.vintage||"")}</td>`
      + `<td>${w.qty}${w.drunk ? " · "+esc(tr("{0} drunk", w.drunk)) : ""}</td><td>${w.price!=null ? esc(fmt(w.price)) : ""}</td>`
      + `<td>${esc(w.type||"")}</td><td>${esc(w.size||"")}</td></tr>`).join("")
    + (ws.length > 8 ? `<tr><td colspan="9">${esc(tr("… and {0} more", ws.length - 8))}</td></tr>` : "")
    + (ws.length ? "" : `<tr><td colspan="9">${esc(tr("Nothing to import yet: choose which column holds the producer."))}</td></tr>`)
    + "</tbody>";
  const bottles = ws.reduce((s,w) => s + w.qty, 0);
  const notes = [];
  if(IMP.built.skipped.noProducer) notes.push(trn(IMP.built.skipped.noProducer, "{0} row without a producer is left out.", "{0} rows without a producer are left out."));
  if(IMP.built.skipped.zero) notes.push(trn(IMP.built.skipped.zero, "{0} row with 0 bottles is left out.", "{0} rows with 0 bottles are left out."));
  if(IMP.built.skipped.totals) notes.push(trn(IMP.built.skipped.totals, "{0} total row is left out.", "{0} total rows are left out."));
  if(IMP.built.skipped.headers) notes.push(trn(IMP.built.skipped.headers, "{0} repeated heading row is left out.", "{0} repeated heading rows are left out."));
  if(IMP.cut) notes.push(tr("Only the first {0} wines are imported at a time.", fmt(IMPORT.MAX_ROWS)));
  if(IMP.built.truncated) notes.push(tr("Only the first {0} rows of the file are read.", fmt(IMPORT.MAX_READ)));
  if(!IMP.fields.includes("producer") && !IMP.fields.includes("line")) notes.push(tr("Choose which column holds the producer."));
  $("impSum").innerHTML = esc((ws.length===1 ? tr("1 wine") : tr("{0} wines", fmt(ws.length))) + " · " + (bottles===1 ? tr("1 bottle") : tr("{0} bottles", fmt(bottles)))) + notes.map(n => `<small>${esc(n)}</small>`).join("");
  // rows of the same wine, and the spelling fixes
  const nm = IMP.merge ? IMP.merged : TIDY.merge(tidied.wines).merged;
  $("impMergeWrap").hidden = !nm;
  $("impMergeLbl").textContent = tr("Merge rows that are the same wine ({0} rows join others; bottles add up, prices are averaged per bottle)", nm);
  const fx = IMP.fixes, offList = [...IMP.off].map(k => { const i = k.indexOf("|"); return {field:k.slice(0, i), from:k.slice(i + 1), to:null, n:0, off:true}; });
  const all = fx.concat(offList);
  $("impFixWrap").hidden = !all.length;
  $("impFixes").innerHTML = all.slice(0, 80).map(f => `<label class="jcheck"><input type="checkbox" data-fix="${esc(f.field + "|" + f.from)}"${f.off ? "" : " checked"}>
    <span><span class="fixf">${esc(tr(FIX_FIELD[f.field] || f.field))}</span> “${esc(f.from)}”${f.off ? "" : ` → “<b>${esc(f.to)}</b>”`}${f.n > 1 ? ` <span class="aimeta">${esc(trn(f.n, "{0} row", "{0} rows"))}</span>` : ""}</span></label>`).join("")
    + (all.length > 80 ? `<p class="imphint">${esc(tr("… and {0} more", all.length - 80))}</p>` : "");
  const nd = IMP.d.dupes.length;
  $("impDup").hidden = !nd;
  $("impDupLbl").textContent = nd ? tr("{0} of these are already in your cellar (same producer, wine, vintage and format):", nd) : "";
  impGoLabel();
}
// how many of the file's rows a set of bumps covers (several rows can add to one cellar row)
const IMP_DUPES_IN = bs => { const rows = new Set(bs.map(b=>b.row)); return IMP.d.dupes.filter(d=>rows.has(d.row)).length; };
const impMode = () => (document.querySelector('input[name="impDup"]:checked') || {}).value || "add";
function impGoLabel(){
  const total = !IMP.d ? 0 : IMP.d.fresh.length + (impMode()==="add" ? IMP.d.dupes.length : 0);
  $("impGo").textContent = tr("Import {0} wines", fmt(total));
  $("impGo").disabled = !total;
}
async function impRun(){
  const mode = impMode();
  const wines = IMP.d.fresh.map(IMPORT.clean);
  const bumps = mode==="add" ? IMPORT.bumps(IMP.d.dupes) : [];
  const merged = mode==="add" ? IMP.d.dupes.length : 0, total = wines.length + merged;
  if(!total) return;
  // in parts: Apps Script must write each in well under its 6 minutes (a plain sheet), and takes at most 5,000 rows a
  // call (an encrypted cellar runs it here, so its parts are as big as that allows). Bottles added to rows already
  // in the cellar go first, then the new wines.
  const vault = window.VAULT && VAULT.active();
  const parts = [], WSZ = vault ? 4000 : 400, BSZ = vault ? 4000 : 1000;
  for(let i = 0; i < bumps.length; i += BSZ){ const b = bumps.slice(i, i + BSZ); parts.push({wines:[], bumps:b, n:IMP_DUPES_IN(b)}); }
  for(let i = 0; i < wines.length; i += WSZ){ const w = wines.slice(i, i + WSZ); parts.push({wines:w, bumps:[], n:w.length}); }
  const btn = $("impGo"); btn.disabled = true; $("impErr").textContent = ""; const pg = progressIn($("impProg"));
  let done = 0;
  try{
    // only the last part asks for the cellar back: each answer was the whole cellar, read again on the server
    for(const [k, part] of parts.entries()){
      btn.textContent = tr("Importing… {0} of {1}", fmt(done), fmt(total)); pg.set(tr("Importing… {0} of {1}", fmt(done), fmt(total)), done, total);
      const res = await api({action:"addmany", wines:part.wines, bumps:part.bumps, quiet:k < parts.length - 1});
      done += part.n;
      if(res.wines) WINES = normalize(res.wines);
    }
    pg.set(tr("Done: showing your cellar…")); await paintNow(); renderOverview(); renderTable(); renderEnjoyed(); pg.end();
    $("impModal").classList.remove("open");
    toast(done===1 ? tr("1 wine imported") : tr("{0} wines imported", done)); hit("import");
  }catch(err){
    pg.end(); const m = String(err && err.message || err);
    if(done){ await loadData(true).catch(() => {}); renderOverview(); renderTable(); renderEnjoyed(); } // what went in before the error
    $("impErr").textContent = m === "bad-action" ? tr("Importing needs the updated Apps Script (version 29): redeploy Code.gs.")
      : done ? tr("{0} of {1} wines were imported before an error: {2}", done, total, m)
      : tr("Could not import: {0}", m);
    // what went in now counts as "already in the cellar": skip it on a retry so nothing is added twice
    if(done){ document.querySelector('input[name="impDup"][value="skip"]').checked = true; impBuild(); } else impGoLabel();
    btn.disabled = false;
    if(AUTH_ERRORS.has(m)) showGate(authMsg(m));
  }
}
/* ---------- several wines in a table: typed or pasted, then the import's own check (spellings, duplicates) ---------- */
// the same fields as adding one wine, in the same order: [field, width, heading, suggestions, placeholder]
const GRID_COLS = [["producer","p","Producer *","jProducers"], ["name","p","Vineyard / cuvée","jWines"], ["commune","m","Commune","communesList"],
  ["country","m","Country","countries"], ["region","m","Region","regionsList"], ["classification","m","Classification"],
  ["type","m","Type","gridTypes"], ["grape","m","Grape","grapes"], ["vintage","n","Vintage",null,"2022"], ["qty","n","Bottles",null,"1"],
  ["size","m","Format","gridSizes"], ["price","n","Price per bottle (kr.)"], ["source","m","Source / bought at"],
  ["acquired","m","Acquired",null,"2026-10-27"], ["location","m","Location","locList"], ["note","p","Note"]];
const GRID_TYPES = [["Rød","Red"],["Hvid","White"],["Rose","Rosé"],["Bobler","Sparkling"],["Hedvin","Fortified"]];
const GRID_SIZES = [["","Bottle · 75 cl"],["Piccolo"],["Half","Half"],["Magnum"],["Jeroboam"],["Rehoboam"],["Methuselah"],["Salmanazar"],["Balthazar"],["Nebuchadnezzar"]];
// what's typed back to what's stored: "Rot"/"Red" → Rød, "Bottle · 75 cl" → "" (the import reads the rest itself)
const gridWord = (list, v) => { const t = v.toLowerCase(), hit = list.find(([code, label]) => [code, label, label && tr(label)].some(x => x && x.toLowerCase() === t)); return hit ? hit[0] : v; };
function gridHead(){
  $("wGrid").tHead.rows[0].innerHTML = GRID_COLS.map(c=>`<th>${esc(tr(c[2]))}</th>`).join("") + "<th></th>";
  $("gridTypes").innerHTML = GRID_TYPES.map(([,l])=>`<option value="${esc(tr(l))}">`).join("");
  $("gridSizes").innerHTML = GRID_SIZES.map(([c,l])=>`<option value="${esc(l ? tr(l) : c)}">`).join("");
}
function gridRow(vals){
  const tr_ = document.createElement("tr");
  tr_.innerHTML = GRID_COLS.map(([k,c,label,list,ph],i)=>`<td class="${c}"><input data-c="${i}" ${list?`list="${list}"`:""} ${ph?`placeholder="${esc(k==="acquired"?todayStr():ph)}"`:""}
      ${c==="n"?'inputmode="decimal"':""} autocomplete="off" aria-label="${esc(tr(label))}"></td>`).join("")
    + `<td><button type="button" class="gdel" aria-label="${esc(tr("Remove the row"))}" title="${esc(tr("Remove the row"))}">✕</button></td>`;
  (vals||[]).forEach((v,i)=>{ const inp = tr_.querySelector(`input[data-c="${i}"]`); if(inp) inp.value = v; });
  $("wGrid").tBodies[0].appendChild(tr_);
  return tr_;
}
function gridCount(){
  const n = [...$("wGrid").tBodies[0].rows].filter(r=>r.querySelector('input[data-c="0"]').value.trim()).length;
  $("gridCount").textContent = n ? (n===1 ? tr("1 wine") : tr("{0} wines", n)) : "";
  $("gridGo").disabled = !n;
}
function gridOpen(){
  impReset();
  gridHead(); const body = $("wGrid").tBodies[0]; body.innerHTML = ""; for(let i=0; i<5; i++) gridRow();
  $("impPick").hidden = true; $("impGrid").hidden = false; $("impBack").hidden = false;
  IMP.fromGrid = true; trSet("Add several wines", $("impTitle").firstElementChild); trSet("Choose a file instead", $("impBack"));
  $("impModal").classList.add("open"); gridCount();
  setTimeout(()=>body.querySelector("input").focus(), 30);
}
$("gridRow").addEventListener("click", ()=>{ gridRow().querySelector("input").focus(); });
$("wGrid").addEventListener("input", gridCount);
$("wGrid").addEventListener("click", e=>{ const b = e.target.closest(".gdel"); if(!b) return;
  const body = $("wGrid").tBodies[0]; b.closest("tr").remove(); if(!body.rows.length) gridRow(); gridCount(); });
// Enter goes down a row (a new one at the end), as in a spreadsheet
$("wGrid").addEventListener("keydown", e=>{
  if(e.key !== "Enter" || !e.target.matches("input")) return;
  e.preventDefault();
  const tr_ = e.target.closest("tr"), c = e.target.dataset.c, next = tr_.nextElementSibling || gridRow();
  next.querySelector(`input[data-c="${c}"]`).focus();
});
// rows pasted from a spreadsheet (tabs between cells, a line per row) fill the table from the cell pasted into
$("wGrid").addEventListener("paste", e=>{
  const text = (e.clipboardData || window.clipboardData).getData("text"); if(!/[\t\n]/.test(text)) return;
  e.preventDefault();
  const lines = text.replace(/\r/g, "").split("\n").filter((l,i,a)=>l.length || i < a.length - 1);
  let tr_ = e.target.closest("tr"); const c0 = Number(e.target.dataset.c);
  lines.forEach((line, i)=>{
    if(i) tr_ = tr_.nextElementSibling || gridRow();
    line.split("\t").forEach((v, j)=>{ const inp = tr_.querySelector(`input[data-c="${c0 + j}"]`); if(inp) inp.value = v.trim(); });
  });
  gridCount();
});
$("gridGo").addEventListener("click", async ()=>{
  try{ await needTools(); }catch(e){ $("impErr").textContent = tr("Couldn't load the importer. Check your connection and try again."); return; }
  const iT = GRID_COLS.findIndex(c=>c[0]==="type"), iS = GRID_COLS.findIndex(c=>c[0]==="size");
  const rows = [...$("wGrid").tBodies[0].rows].map(r=>GRID_COLS.map((_,i)=>r.querySelector(`input[data-c="${i}"]`).value.trim())).filter(v=>v[0])
    .map(v=>{ v[iT] = gridWord(GRID_TYPES, v[iT]); v[iS] = gridWord(GRID_SIZES, v[iS]); return v; });
  if(!rows.length){ $("impErr").textContent = tr("Type at least one producer."); return; }
  // headings only so the import sees a header row; the columns are set, not guessed
  IMP.book = {sheets:[{name:tr("Table"), rows:[GRID_COLS.map(c=>c[0]), ...rows]}]}; IMP.name = tr("Typed in the table"); IMP.sheet = 0;
  $("impSheet").innerHTML = ""; $("impSheet").hidden = true; $("impName").textContent = IMP.name;
  impSheet();
  if(IMP.t.header !== 0) IMP.t = IMPORT.table([GRID_COLS.map(c=>c[0]), ...rows]); // (it always finds them; belt and braces)
  IMP.fields = GRID_COLS.map(c=>c[0]); IMP.t.header = 0;
  $("impCols").querySelectorAll("select").forEach(s=>{ s.value = IMP.fields[Number(s.dataset.col)] || ""; s.classList.toggle("on", !!s.value); });
  impBuild();
  $("impGrid").hidden = true; $("impMap").hidden = false; $("impBack").hidden = false; $("impGo").hidden = false;
  trSet("Back to the table", $("impBack"));
});
$("impCancel").addEventListener("click", ()=>$("impModal").classList.remove("open"));
// back: to the table it came from (with its rows), or to choosing a file
$("impBack").addEventListener("click", ()=>{
  if(IMP.fromGrid && !$("impMap").hidden){ $("impMap").hidden = true; $("impGo").hidden = true; $("impGrid").hidden = false; $("impErr").textContent = "";
    trSet("Choose a file instead", $("impBack")); return; }
  impReset();
});
$("impModal").addEventListener("click", e=>{ if(e.target===$("impModal")) $("impModal").classList.remove("open"); });
$("impFile").addEventListener("change", e=>{ const f = e.target.files && e.target.files[0]; if(f) impOpen(f); });
["dragenter","dragover"].forEach(ev => $("impDrop").addEventListener(ev, e=>{ e.preventDefault(); $("impDrop").classList.add("over"); }));
["dragleave","drop"].forEach(ev => $("impDrop").addEventListener(ev, e=>{ e.preventDefault(); $("impDrop").classList.remove("over"); }));
$("impDrop").addEventListener("drop", e=>{ const f = e.dataTransfer && e.dataTransfer.files[0]; if(f) impOpen(f); });
$("impSheet").addEventListener("change", e=>{ IMP.sheet = Number(e.target.value); impSheet(); });
// a big file: each change is seconds of work, said first
async function impRebuild(){ const n = IMP.book.sheets[IMP.sheet].rows.length, pg = progressIn($("impProg"));
  if(n > 3000){ $("impGo").disabled = true; pg.set(tr("Going through {0} rows…", fmt(n))); await paintNow(); } impBuild(); pg.end(); }
$("impCols").addEventListener("change", e=>{
  const s = e.target.closest("select[data-col]"); if(!s) return;
  IMP.fields[Number(s.dataset.col)] = s.value; s.classList.toggle("on", !!s.value); impRebuild();
});
document.querySelectorAll('input[name="impDup"]').forEach(r => r.addEventListener("change", impGoLabel));
$("impMerge").addEventListener("change", e=>{ IMP.merge = e.target.checked; impRebuild(); });
$("impFixes").addEventListener("change", e=>{
  const c = e.target.closest("input[data-fix]"); if(!c) return;
  if(c.checked) IMP.off.delete(c.dataset.fix); else IMP.off.add(c.dataset.fix);
  impRebuild();
});
$("impGo").addEventListener("click", impRun);
window.IMPORT_UI = true;
