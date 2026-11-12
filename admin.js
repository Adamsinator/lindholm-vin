// The owner's admin page: members (help back in, remove), invite codes, usage over a chosen period, account help, test
// users. Loaded by app.js the first time Admin is opened (not with every page); uses app.js's globals (api, tr, esc,
// $, toast, errText, testTools…), like the other scripts of the page.
"use strict";
let ADMIN = null;
async function openAdmin(){
  $("adminErr").textContent = tr("Fetching…"); $("adminModal").classList.add("open");
  try{ ADMIN = await api({action:"admin"}); $("adminErr").textContent = ""; renderAdmin(); }
  catch(err){ $("adminErr").textContent = err.message === "not-owner" ? tr("Only the owner can open this.") : tr("Could not reach the cellar API ({0}).", errText(err)); }
}
const USAGE_LABEL = {active:"Active members", login:"Logins", signup:"Sign-ups", save:"Cellar saves", atlas:"Atlas visits",
  cellar:"Cellar page", enjoyed:"Enjoyed page", wishlist:"Wishlist page", journal:"Journal page", import:"Imports",
  sommelier:"Sommelier questions", export:"Exports"};
// Usage over a chosen period (7 days to a year; the server keeps about 400 days): any count as the chart, a bar a day
// (a bar a week from 90 days), each count's total with its change on the period before, and the members at a glance.
// Counts only, never what's in a cellar.
let US_P = 30, US_K = "active";
const US_PERIODS = [[7, "7 days"], [30, "30 days"], [90, "90 days"], [365, "A year"]];
document.head.insertAdjacentHTML("beforeend", `<style>.usbar{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 8px}
.usbar button{border:1px solid var(--line);background:none;padding:3px 10px;font:inherit;font-size:12.5px;cursor:pointer;color:var(--ink)}
.usbar button[aria-pressed=true]{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.usgrid button{all:unset;cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px} .usgrid button:focus-visible{outline:2px solid var(--accent)}
.usgrid div.on{border-top:2px solid var(--accent)} .usgrid small{display:block;font:11.5px/1.3 var(--sans,system-ui);color:var(--muted)} .ush{font-size:13px;margin:16px 0 0;color:var(--muted);font-weight:600}
.usgrid small.up{color:var(--ok,#2f7d4f)} .usgrid small.dn{color:var(--accent)}
.usmem{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px 14px;margin:14px 0 6px}
.usmem div{border-top:1px solid var(--line);padding-top:4px} .usmem dt{font-size:11.5px;color:var(--muted)} .usmem dd{margin:0;font-family:var(--serif);font-size:18px}</style>`);
function usChart(vals, labels, caption){
  // bars with a y axis (0, half, the most) and an x axis labelled now and then, the last always
  const top = Math.max(1, ...vals), max = top <= 4 ? top : Math.ceil(top / 2) * 2, L = 22, Rp = 10, T = 6, W = 320, H = 92, B = 16, ph = H - T - B, bw = (W - L - Rp) / vals.length;
  const y = v => T + ph - v / max * ph, every = Math.max(1, Math.ceil(vals.length / 5));
  const grid = [...new Set([0, max / 2, max])].filter(v => Number.isInteger(v)).map(v => `<line class="gl" x1="${L}" x2="${W - Rp}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${L - 4}" y="${y(v) + 3}" text-anchor="end">${v}</text>`).join("");
  const bars = vals.map((v, i) => { const h = v / max * ph; return `<rect x="${(L + i * bw + .5).toFixed(1)}" y="${(T + ph - h).toFixed(1)}" width="${Math.max(.6, bw - 1).toFixed(1)}" height="${h.toFixed(1)}" rx="1"><title>${esc(labels[i])}: ${fmt(Math.round(v * 10) / 10)}</title></rect>`; }).join("");
  const ticks = vals.map((v, i) => (vals.length - 1 - i) % every === 0 ? `<line class="tk" x1="${L + (i + .5) * bw}" x2="${L + (i + .5) * bw}" y1="${T + ph}" y2="${T + ph + 3}"/><text class="ax" x="${L + (i + .5) * bw}" y="${H - 3}" text-anchor="middle">${esc(labels[i].replace(/^(\d+)-(\d+)-(\d+)$/, (m, a, b, c) => `${+c}/${+b}`))}</text>` : "").join("");
  return `<div class="ususp"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(caption)}">${grid}${bars}<line class="xl" x1="${L}" x2="${W - Rp}" y1="${T + ph}" y2="${T + ph}"/>${ticks}</svg>
    <span class="ph">${esc(caption)} · ${esc(tr("most {0}", fmt(Math.round(top * 10) / 10)))}</span></div>`;
}
function renderUsage(days, users){
  const head = $("adminUsage").previousElementSibling, sub = head && head.querySelector(".ph");
  if(sub){ sub.removeAttribute("data-i18n"); sub.textContent = trA("counts only, never what's in a cellar"); }
  if(!days || !days.length){ $("adminUsage").innerHTML = `<p class="ph">${esc(tr("No usage counted yet."))}</p>`; return; }
  const P = Math.min(US_P, days.length), cur = days.slice(-P), prev = days.length >= 2 * P ? days.slice(-2 * P, -P) : null;
  const sum = (ds, k) => ds.reduce((s, d) => s + (d[k] || 0), 0);
  // "Active members" is people, not member-days: the daily counts add up the same person once a day, so the tile counts
  // the members last seen within the period instead (the bars keep the per-day counts)
  const from = String(cur[0].day || ""), people = (users || []).filter(u => u.lastSeen && String(u.lastSeen) >= from).length;
  const total = k => k === "active" && users ? people : sum(cur, k);
  const change = k => { if(k === "active" || !prev) return ""; const a = sum(cur, k), b = sum(prev, k); if(!a && !b) return "";
    if(!b) return `<small class="up">${esc(trA("new: none in the {0} before", trA("{0} days", US_P)))}</small>`;
    const pc = Math.round((a - b) / b * 100); return `<small class="${pc > 0 ? "up" : pc < 0 ? "dn" : ""}">${esc(trA("{0} on the {1} before", (pc > 0 ? "+" : pc < 0 ? "−" : "±") + Math.abs(pc) + " %", trA("{0} days", US_P)))}</small>`; };
  // the chart: a bar a day up to 30 days, a bar a week from 90 (active members: the average a day that week)
  let vals, labels;
  if(P <= 31){ vals = cur.map(d => d[US_K] || 0); labels = cur.map(d => d.day); }
  else { vals = []; labels = [];
    for(let e = cur.length; e > 0; e -= 7){ const w = cur.slice(Math.max(0, e - 7), e), s = sum(w, US_K);
      vals.unshift(US_K === "active" ? s / w.length : s); labels.unshift(w[0].day); } }
  const name = tr(USAGE_LABEL[US_K]), per = trA("{0} days", US_P);
  const caption = P <= 31 ? trA("{0} a day, last {1}", name, per) : trA(US_K === "active" ? "{0}, average a day each week, last {1}" : "{0} a week, last {1}", name, per);
  const short = days.length < US_P ? `<p class="ph">${esc(trA("The server sent {0} days: redeploy Code.gs (version 57) for the year.", days.length))}</p>` : "";
  $("adminUsage").innerHTML = `<div class="usbar" role="group" aria-label="${esc(trA("Period"))}">${US_PERIODS.map(([n, l]) => `<button type="button" data-usp="${n}" aria-pressed="${n === US_P}">${esc(trA(l))}</button>`).join("")}</div>
    ${usChart(vals, labels, caption)}${short}
    <dl class="usgrid">${Object.keys(USAGE_LABEL).map(k => `<div${k === US_K ? ' class="on"' : ""}><dt><button type="button" data-usk="${k}" aria-pressed="${k === US_K}" title="${esc(trA("Show as the chart"))}">${esc(tr(USAGE_LABEL[k]))}</button></dt><dd>${fmt(total(k))}</dd>${change(k) ? `<dd>${change(k)}</dd>` : ""}</div>`).join("")}</dl>
    ${usMembers(users, days[days.length - 1].day)}`;
}
// the members at a glance, from the register (when each signed up and was last seen) and new members a month
// counted from the server's own today (the last day of its stats), the day its counts and sign-up dates go by
function usMembers(users, today){
  if(!users || !users.length) return "";
  const t = /^\d{4}-\d\d-\d\d$/.test(today || "") ? new Date(today + "T12:00:00Z") : new Date(), ago = n => new Date(t.getTime() - n * 864e5).toISOString().slice(0, 10);
  const m = users.filter(u => !u.owner), seen = d => m.filter(u => u.lastSeen && u.lastSeen >= d).length;
  const once = m.filter(u => !u.staff && u.created && (!u.lastSeen || u.lastSeen === u.created) && u.created < ago(7)).length;
  const tiles = [[trA("In all"), m.length], [trA("Seen in the last 7 days"), seen(ago(7))], [trA("Seen in the last 30 days"), seen(ago(30))],
    [trA("Signed up, never back (over a week ago)"), once], [trA("Business accounts"), m.filter(u => u.business).length], [trA("Staff logins"), m.filter(u => u.staff).length],
    [trA("Test accounts"), m.filter(u => u.test).length]];
  const months = []; for(let i = 11; i >= 0; i--){ const d = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - i, 1)); months.push(d.toISOString().slice(0, 7)); }
  const per = months.map(mo => m.filter(u => String(u.created || "").slice(0, 7) === mo && !u.staff).length);
  const mlab = mo => { try { return new Intl.DateTimeFormat((window.I18N && I18N.lang) || "en", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(mo + "-15T12:00:00Z")); } catch (e) { return mo; } };
  return `<h4 class="ush">${esc(trA("Members now"))}</h4><dl class="usmem">${tiles.map(([l, v]) => `<div><dt>${esc(l)}</dt><dd>${fmt(v)}</dd></div>`).join("")}</dl>
    ${usChart(per, months.map(mlab), trA("New members a month, last 12 months"))}`;
}
$("adminUsage").addEventListener("click", e => {
  const p = e.target.closest("[data-usp]"), k = e.target.closest("[data-usk]");
  if(p){ US_P = +p.dataset.usp; } else if(k){ US_K = k.dataset.usk; } else return;
  renderUsage(ADMIN && ADMIN.stats, ADMIN && ADMIN.users);
  const f = $("adminUsage").querySelector(p ? `[data-usp="${US_P}"]` : `[data-usk="${US_K}"]`); f && f.focus();
});
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
const ADMIN_WORDS = {"da": {"Business: on": "Erhverv: til", "Make business": "Gør til erhverv", "Make {0} a private cellar again? Their business pages close; nothing they've stored is deleted.": "Gør {0} til en privat kælder igen? Erhvervssiderne lukkes; intet af det gemte slettes.", "Make private": "Gør privat", "{0} is a business account: they choose Business under Account": "{0} er en erhvervskonto: de vælger Erhverv under Konto", "{0} is a private cellar again": "{0} er en privat kælder igen", "This needs the updated Apps Script (version 56): redeploy Code.gs.": "Det kræver det opdaterede Apps Script (version 56): genudrul Code.gs.", "counts only, never what's in a cellar": "kun antal, aldrig hvad der er i en kælder", "7 days": "7 dage", "30 days": "30 dage", "90 days": "90 dage", "A year": "Et år", "{0} days": "{0} dage", "new: none in the {0} before": "nyt: ingen i de {0} før", "{0} on the {1} before": "{0} mod de {1} før", "{0} a day, last {1}": "{0} om dagen, seneste {1}", "{0}, average a day each week, last {1}": "{0}, gennemsnit om dagen pr. uge, seneste {1}", "{0} a week, last {1}": "{0} om ugen, seneste {1}", "The server sent {0} days: redeploy Code.gs (version 57) for the year.": "Serveren sendte {0} dage: genudrul Code.gs (version 57) for hele året.", "Period": "Periode", "Show as the chart": "Vis som diagrammet", "Members": "Medlemmer", "Seen in the last 7 days": "Set de seneste 7 dage", "Seen in the last 30 days": "Set de seneste 30 dage", "Signed up, never back (over a week ago)": "Oprettet, aldrig vendt tilbage (over en uge siden)", "Business accounts": "Erhvervskonti", "Staff logins": "Medarbejderlogins", "Test accounts": "Testkonti", "New members a month, last 12 months": "Nye medlemmer om måneden, seneste 12 måneder", "Members now": "Medlemmer nu", "In all": "I alt"}, "fr": {"Business: on": "Pro : activé", "Make business": "Passer en pro", "Make {0} a private cellar again? Their business pages close; nothing they've stored is deleted.": "Refaire de {0} une cave privée ? Ses pages pro se ferment ; rien de ce qui est enregistré n'est supprimé.", "Make private": "Rendre privée", "{0} is a business account: they choose Business under Account": "{0} est un compte pro : il choisit Entreprise sous Compte", "{0} is a private cellar again": "{0} est de nouveau une cave privée", "This needs the updated Apps Script (version 56): redeploy Code.gs.": "Il faut l'Apps Script à jour (version 56) : redéployez Code.gs.", "counts only, never what's in a cellar": "des comptes seulement, jamais le contenu d'une cave", "7 days": "7 jours", "30 days": "30 jours", "90 days": "90 jours", "A year": "Un an", "{0} days": "{0} jours", "new: none in the {0} before": "nouveau : aucun dans les {0} précédents", "{0} on the {1} before": "{0} par rapport aux {1} précédents", "{0} a day, last {1}": "{0} par jour, {1} derniers", "{0}, average a day each week, last {1}": "{0}, moyenne par jour chaque semaine, {1} derniers", "{0} a week, last {1}": "{0} par semaine, {1} derniers", "The server sent {0} days: redeploy Code.gs (version 57) for the year.": "Le serveur a envoyé {0} jours : redéployez Code.gs (version 57) pour l'année.", "Period": "Période", "Show as the chart": "Afficher dans le graphique", "Members": "Membres", "Seen in the last 7 days": "Vus ces 7 derniers jours", "Seen in the last 30 days": "Vus ces 30 derniers jours", "Signed up, never back (over a week ago)": "Inscrits, jamais revenus (il y a plus d'une semaine)", "Business accounts": "Comptes pro", "Staff logins": "Accès du personnel", "Test accounts": "Comptes de test", "New members a month, last 12 months": "Nouveaux membres par mois, 12 derniers mois", "Members now": "Membres aujourd'hui", "In all": "En tout"}, "de": {"Business: on": "Betrieb: an", "Make business": "Zum Betrieb machen", "Make {0} a private cellar again? Their business pages close; nothing they've stored is deleted.": "{0} wieder zu einem privaten Keller machen? Die Betriebsseiten schließen sich; nichts Gespeichertes wird gelöscht.", "Make private": "Privat machen", "{0} is a business account: they choose Business under Account": "{0} ist ein Betriebskonto: unter Konto wählt man Betrieb", "{0} is a private cellar again": "{0} ist wieder ein privater Keller", "This needs the updated Apps Script (version 56): redeploy Code.gs.": "Dafür braucht es das aktualisierte Apps Script (Version 56): Code.gs neu bereitstellen.", "counts only, never what's in a cellar": "nur Zahlen, nie der Inhalt eines Kellers", "7 days": "7 Tage", "30 days": "30 Tage", "90 days": "90 Tage", "A year": "Ein Jahr", "{0} days": "{0} Tage", "new: none in the {0} before": "neu: keine in den {0} davor", "{0} on the {1} before": "{0} gegenüber den {1} davor", "{0} a day, last {1}": "{0} pro Tag, letzte {1}", "{0}, average a day each week, last {1}": "{0}, Tagesdurchschnitt je Woche, letzte {1}", "{0} a week, last {1}": "{0} pro Woche, letzte {1}", "The server sent {0} days: redeploy Code.gs (version 57) for the year.": "Der Server hat {0} Tage geschickt: Code.gs (Version 57) neu bereitstellen für das ganze Jahr.", "Period": "Zeitraum", "Show as the chart": "Im Diagramm zeigen", "Members": "Mitglieder", "Seen in the last 7 days": "In den letzten 7 Tagen gesehen", "Seen in the last 30 days": "In den letzten 30 Tagen gesehen", "Signed up, never back (over a week ago)": "Angemeldet, nie wiedergekommen (vor über einer Woche)", "Business accounts": "Betriebskonten", "Staff logins": "Mitarbeiterzugänge", "Test accounts": "Testkonten", "New members a month, last 12 months": "Neue Mitglieder pro Monat, letzte 12 Monate", "Members now": "Mitglieder jetzt", "In all": "Insgesamt"}};
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

