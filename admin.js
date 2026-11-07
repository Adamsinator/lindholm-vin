// The owner's admin page: members (help back in, remove), invite codes, the last 30 days' usage, account help, test
// users. Loaded by app.js the first time Admin is opened (not with every page); uses app.js's globals (api, tr, esc,
// $, toast, errText, testTools…), like the other scripts of the page.
"use strict";
let ADMIN = null;
async function openAdmin(){
  $("adminErr").textContent = tr("Fetching…"); $("adminModal").classList.add("open");
  try{ ADMIN = await api({action:"admin"}); $("adminErr").textContent = ""; renderAdmin(); }
  catch(err){ $("adminErr").textContent = err.message === "not-owner" ? tr("Only the owner can open this.") : tr("Could not reach the cellar API ({0}).", errText(err)); }
}
// the last 30 days: active members a day as bars, and each count's total
const USAGE_LABEL = {active:"Active members", login:"Logins", signup:"Sign-ups", save:"Cellar saves", atlas:"Atlas visits",
  cellar:"Cellar page", enjoyed:"Enjoyed page", wishlist:"Wishlist page", journal:"Journal page", import:"Imports",
  sommelier:"Sommelier questions", export:"Exports"};
function renderUsage(days, users){
  if(!days || !days.length){ $("adminUsage").innerHTML = `<p class="ph">${esc(tr("No usage counted yet."))}</p>`; return; }
  // bars with a y axis (0, half, the most) and an x axis with a date each week, the last day always labelled
  const top = Math.max(1, ...days.map(d=>d.active)), max = top <= 4 ? top : Math.ceil(top / 2) * 2, L = 22, Rp = 10, T = 6, W = 320, H = 92, B = 16, ph = H - T - B, bw = (W - L - Rp) / days.length;
  const y = v => T + ph - v / max * ph, dm = s => { const [, m, d] = String(s).split("-"); return `${+d}/${+m}`; };
  const grid = [...new Set([0, max / 2, max])].filter(v => Number.isInteger(v)).map(v => `<line class="gl" x1="${L}" x2="${W - Rp}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${L - 4}" y="${y(v) + 3}" text-anchor="end">${v}</text>`).join("");
  const bars = days.map((d,i)=>{ const h = d.active / max * ph; return `<rect x="${(L + i*bw + 1).toFixed(1)}" y="${(T + ph - h).toFixed(1)}" width="${(bw-2).toFixed(1)}" height="${h.toFixed(1)}" rx="1.5"><title>${esc(d.day)}: ${d.active}</title></rect>`; }).join("");
  const ticks = days.map((d,i)=>(days.length - 1 - i) % 7 === 0 ? `<line class="tk" x1="${L + (i + .5) * bw}" x2="${L + (i + .5) * bw}" y1="${T + ph}" y2="${T + ph + 3}"/><text class="ax" x="${L + (i + .5) * bw}" y="${H - 3}" text-anchor="middle">${dm(d.day)}</text>` : "").join("");
  const bars0 = `${grid}${bars}<line class="xl" x1="${L}" x2="${W - Rp}" y1="${T + ph}" y2="${T + ph}"/>${ticks}`;
  const sum = k => days.reduce((s,d)=>s + (d[k]||0), 0);
  // "Active members" is people, not member-days: the daily counts add up the same person once a day, so the tile counts
  // the members last seen within these days instead (the bars keep the per-day counts)
  const from = String(days[0].day || ""), people = (users||[]).filter(u=>u.lastSeen && String(u.lastSeen) >= from).length;
  const total = k => k==="active" && users ? people : sum(k);
  $("adminUsage").innerHTML = `<div class="ususp"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(tr("Active members a day, last 30 days"))}">${bars0}</svg>
      <span class="ph">${esc(tr("Active members a day, last 30 days"))} · ${esc(tr("most {0}", top))}</span></div>
    <dl class="usgrid">${Object.keys(USAGE_LABEL).map(k=>`<div><dt>${esc(tr(USAGE_LABEL[k]))}</dt><dd>${fmt(total(k))}</dd></div>`).join("")}</dl>`;
}
function renderHelp(A){
  const members = A.users.filter(u=>!u.owner), ready = members.filter(u=>u.helpReady).length;
  $("adminHelp").innerHTML = !A.adminKid
    ? `<div class="adhelp"><p class="ph">${esc(tr("Turn this on to be able to help a member who has lost both their password and their recovery code. Each member's key is then also locked to a key only you hold: the private half stays in your browser, encrypted with your own cellar key. The server still can't read any cellar."))}</p>
        <p><button type="button" class="btn primary" id="helpSetup">${esc(tr("Turn on account help"))}</button></p></div>`
    : `<div class="adhelp"><p>${esc(tr("On. {0} of {1} members are ready; the others are ready after their next login.", fmt(ready), fmt(members.length)))}</p>
        <p class="ph">${esc(tr("Key fingerprint"))}: <span class="code" style="font-size:12px;padding:2px 6px">${esc(A.adminKid)}</span></p>
        <div id="helpOut"></div></div>`;
}
function renderAdmin(){
  const A = ADMIN || {users:[], invites:[]};
  renderUsage(A.stats, A.users); renderHelp(A);
  $("adminCount").textContent = tr("{0} of at most {1}", fmt(A.users.length), fmt(A.max || 50));
  $("adminUsers").innerHTML = A.users.map(u=>`<li><span class="a1"><b>${esc(u.user)}</b> · ${u.test ? `<span class="tchip">${esc(tr("test user"))}</span>` : u.email ? `<a href="mailto:${esc(u.email)}">${esc(u.email)}</a>` : "—"}</span>
      ${u.owner ? `<span class="ph adrm">${esc(tr("you (owner)"))}</span>` : `${A.adminKid ? (u.helpReady ? `<button type="button" data-help="${esc(u.user)}">${esc(tr("Help back in"))}</button>` : `<span class="hwait">${esc(tr("help: after next login"))}</span>`) : ""}
        ${u.staff || u.test ? "" : `<button type="button" ${u.business ? 'style="background:var(--accent);border-color:var(--accent);color:#fff"' : ""} data-biz="${esc(u.user)}" aria-pressed="${u.business ? "true" : "false"}">${esc(trA(u.business ? "Business: on" : "Make business"))}</button>`}
        <button type="button" class="adrm" data-remove="${esc(u.user)}">${esc(tr("Remove"))}</button>`}
      <span class="a2">${esc(tr("Signed up"))} ${esc(u.created || "—")} · ${esc(tr("Last seen"))} ${esc(u.lastSeen || "—")}</span></li>`).join("");
  const open = A.invites.filter(i=>!i.usedBy), done = A.invites.filter(i=>i.usedBy);
  $("adminInvites").innerHTML =
    open.map(i=>`<li><span class="a1"><span class="code">${esc(i.code)}</span>${i.note ? " · " + esc(i.note) : ""}</span>
      <span><button type="button" data-copy="${esc(i.code)}">${esc(tr("Copy invitation"))}</button> <button type="button" data-revoke="${esc(i.code)}">${esc(tr("Withdraw"))}</button></span>
      <span class="a2">${esc(tr("Made"))} ${esc(i.created)}</span></li>`).join("") +
    done.slice().reverse().map(i=>`<li class="used"><span class="a1"><span class="code">${esc(i.code)}</span>${i.note ? " · " + esc(i.note) : ""}</span>
      <span class="a2">${esc(i.usedBy==="(revoked)" ? tr("withdrawn {0}", i.usedAt) : tr("used by {0}, {1}", i.usedBy, i.usedAt))}</span></li>`).join("") +
    (A.invites.length ? "" : `<li class="used">${esc(tr("No codes yet: make some above."))}</li>`);
}
$("adminTestMake").addEventListener("click", ()=>testTools().then(T=>T.ui.makeUser($("adminTestKind").value)).catch(err=>{ $("adminErr").textContent = errText(err); }));
$("adminTestClear").addEventListener("click", ()=>testTools().then(T=>T.ui.clearUsers()).catch(err=>{ $("adminErr").textContent = errText(err); }));
$("adminClose").addEventListener("click", ()=>$("adminModal").classList.remove("open"));
$("adminNew").addEventListener("submit", async e=>{
  e.preventDefault(); $("adminErr").textContent = tr("Making…");
  try{ ADMIN = await api({action:"admininvites", n:Number($("adminN").value), note:$("adminNote").value.trim()}); $("adminNote").value = ""; $("adminErr").textContent = ""; renderAdmin(); }
  catch(err){ $("adminErr").textContent = tr("Could not reach the cellar API ({0}).", errText(err)); }
});
$("adminHelp").addEventListener("click", async e=>{
  if(!e.target.closest("#helpSetup")) return;
  $("adminErr").textContent = tr("Making the key…");
  try{ await VAULT.adminSetup(); ADMIN = await api({action:"admin"}); $("adminErr").textContent = ""; renderAdmin(); toast(tr("Account help is on")); }
  catch(err){ $("adminErr").textContent = tr("Could not reach the cellar API ({0}).", errText(err)); }
});
// helping a member back in: a fresh recovery code, made here, shown once; their own old code stops working
$("adminUsers").addEventListener("click", async e=>{
  const b = e.target.closest("button[data-help]"); if(!b) return;
  const who = b.dataset.help;
  if(!(await ask(tr("Make a new recovery code for {0}? Their old recovery code stops working. Only do this when they've asked you to.", who), {ok:tr("Make a new code")}))) return;
  $("adminErr").textContent = tr("Unlocking…");
  try{
    const r = await VAULT.adminHelp(who); ADMIN = r.admin; $("adminErr").textContent = ""; renderAdmin();
    const msg = tr("Your new AllWine recovery code: {0}: on the login page choose 'Forgot password?', type your username, this code and a new password.", r.code);
    $("helpOut").innerHTML = `<p>${esc(tr("New recovery code for {0} (shown only now):", who))}</p><p class="code" id="helpCode">${esc(r.code)}</p>
      <p><button type="button" class="btn" id="helpCopy">${esc(tr("Copy a message for {0}", who))}</button></p>`;
    $("helpCopy").onclick = async ()=>{ try{ await navigator.clipboard.writeText(msg); toast(tr("Copied")); }catch(err){ window.prompt(tr("Copy"), msg); } };
  }catch(err){ $("adminErr").textContent = /no-help-yet/.test(errText(err)) ? tr("{0} isn't ready yet: it happens at their next login.", who) : tr("Could not reach the cellar API ({0}).", errText(err)); }
});
// the words of the business switch: only the owner sees them, so they're kept here, not in the site's dictionaries
const ADMIN_WORDS = {"da": {"Business: on": "Erhverv: til", "Make business": "Gør til erhverv", "Make {0} a private cellar again? Their business pages close; nothing they've stored is deleted.": "Gør {0} til en privat kælder igen? Erhvervssiderne lukkes; intet af det gemte slettes.", "Make private": "Gør privat", "{0} is a business account: they choose Business under Account": "{0} er en erhvervskonto: de vælger Erhverv under Konto", "{0} is a private cellar again": "{0} er en privat kælder igen", "This needs the updated Apps Script (version 56): redeploy Code.gs.": "Det kræver det opdaterede Apps Script (version 56): genudrul Code.gs."}, "fr": {"Business: on": "Pro : activé", "Make business": "Passer en pro", "Make {0} a private cellar again? Their business pages close; nothing they've stored is deleted.": "Refaire de {0} une cave privée ? Ses pages pro se ferment ; rien de ce qui est enregistré n'est supprimé.", "Make private": "Rendre privée", "{0} is a business account: they choose Business under Account": "{0} est un compte pro : il choisit Entreprise sous Compte", "{0} is a private cellar again": "{0} est de nouveau une cave privée", "This needs the updated Apps Script (version 56): redeploy Code.gs.": "Il faut l'Apps Script à jour (version 56) : redéployez Code.gs."}, "de": {"Business: on": "Betrieb: an", "Make business": "Zum Betrieb machen", "Make {0} a private cellar again? Their business pages close; nothing they've stored is deleted.": "{0} wieder zu einem privaten Keller machen? Die Betriebsseiten schließen sich; nichts Gespeichertes wird gelöscht.", "Make private": "Privat machen", "{0} is a business account: they choose Business under Account": "{0} ist ein Betriebskonto: unter Konto wählt man Betrieb", "{0} is a private cellar again": "{0} ist wieder ein privater Keller", "This needs the updated Apps Script (version 56): redeploy Code.gs.": "Dafür braucht es das aktualisierte Apps Script (Version 56): Code.gs neu bereitstellen."}};
const trA = (s, ...a) => (((ADMIN_WORDS[window.I18N && I18N.lang] || {})[s]) || s).replace(/\{(\d)\}/g, (m, i) => a[i] ?? "");
// a member's account made a business account (after they've written and agreed a price), or back to a private cellar:
// it unlocks the business kind under their Account; their wines stay as they are either way
$("adminUsers").addEventListener("click", async e=>{
  const b = e.target.closest("button[data-biz]"); if(!b) return;
  const who = b.dataset.biz, on = b.getAttribute("aria-pressed") !== "true";
  if(!on && !(await ask(trA("Make {0} a private cellar again? Their business pages close; nothing they've stored is deleted.", who), {ok:trA("Make private")}))) return;
  b.disabled = true;
  try{ ADMIN = await api({action:"adminbiz", member:who, on}); $("adminErr").textContent = ""; renderAdmin();
    toast(on ? trA("{0} is a business account: they choose Business under Account", who) : trA("{0} is a private cellar again", who)); }
  catch(err){ b.disabled = false; $("adminErr").textContent = /bad-action/.test(errText(err)) ? trA("This needs the updated Apps Script (version 56): redeploy Code.gs.") : tr("Could not reach the cellar API ({0}).", errText(err)); }
});
// removing a member: as permanent as them deleting their own account, so the name is typed to confirm it
$("adminUsers").addEventListener("click", async e=>{
  const b = e.target.closest("button[data-remove]"); if(!b) return;
  const who = b.dataset.remove;
  if(!(await ask(tr("Remove {0} and everything in their account: cellar, journal, wishlist and photos? It can't be undone, and nobody (you included) can read or restore the cellar afterwards. Type the username to confirm:", who), {ok:tr("Remove"), danger:true, typed:who}))) return;
  $("adminErr").textContent = tr("Removing…");
  try{ ADMIN = await api({action:"admindelete", member:who}); $("adminErr").textContent = ""; renderAdmin(); toast(tr("{0} was removed", who)); }
  catch(err){ $("adminErr").textContent = /owner-account/.test(errText(err)) ? tr("The owner's account can't be removed.")
    : /no-user/.test(errText(err)) ? tr("There's no member called {0} any more.", who) : tr("Could not reach the cellar API ({0}).", errText(err)); }
});
$("adminInvites").addEventListener("click", async e=>{
  const c = e.target.closest("button[data-copy]"), r = e.target.closest("button[data-revoke]");
  if(c){ // a ready-made message: where to sign up, and the code
    const msg = tr("You're invited to AllWine, a private wine cellar. Sign up at {0} with the invite code {1} (it works once).", location.origin + location.pathname, c.dataset.copy);
    try{ await navigator.clipboard.writeText(msg); toast(tr("Invitation copied")); }catch(err){ window.prompt(tr("Copy the invitation"), msg); }
  }
  if(r){
    if(!(await ask(tr("Withdraw the code {0}? It stops working.", r.dataset.revoke), {ok:tr("Withdraw")}))) return;
    try{ ADMIN = await api({action:"adminrevoke", code:r.dataset.revoke}); renderAdmin(); }
    catch(err){ $("adminErr").textContent = tr("Could not reach the cellar API ({0}).", errText(err)); }
  }
});

