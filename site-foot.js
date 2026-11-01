// The small footer every page ends with: © the years and who runs AllWine (site-info.js), and the way to About & terms,
// Privacy & cookies, and the data's licences. On legal.html it also fills in who runs the site and shows the Danish or
// the English text (the Danish one applies; French and German readers get the English with that said).
//   <div data-sitefoot></div> … <script src="site-info.js"></script> <script src="site-foot.js"></script>
"use strict";
(function () {
  const S = window.SITE_INFO || {}, t = (s, ...a) => (window.I18N && I18N.t ? I18N.t(s, ...a) : s.replace(/\{(\d)\}/g, (m, i) => a[i] ?? ""));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const y = new Date().getFullYear(), years = S.since && S.since < y ? `${S.since}–${y}` : String(y);
  const lang = () => (window.I18N && I18N.lang) || "en";

  function foot() {
    const who = [S.name ? esc(S.name) : "AllWine", S.cvr ? "CVR " + esc(S.cvr) : ""].filter(Boolean).join(" · ");
    const html = `<footer class="sitefoot"><span>© ${years} ${who}</span>
      <a href="legal.html">${esc(t("About & terms"))}</a><a href="privacy.html">${esc(t("Privacy & cookies"))}</a><a href="legal.html#${lang() === "da" ? "da" : "en"}-copy">${esc(t("Data & licences"))}</a>${S.email ? `<a href="mailto:${esc(S.email)}">${esc(S.email)}</a>` : ""}</footer>`;
    document.querySelectorAll("[data-sitefoot]").forEach(el => { el.innerHTML = html; });
  }
  function legal() {
    if (!document.querySelector("[data-l]")) return;
    const l = lang() === "da" ? "da" : "en";
    document.querySelectorAll("[data-l]").forEach(el => { el.hidden = el.dataset.l !== l; });
    document.documentElement.lang = l; document.title = l === "da" ? "Om AllWine og vilkår" : "About AllWine and terms";
    const T = l === "da"
      ? { name: "Navn", addr: "Adresse", email: "E-mail", cvr: "CVR-nr.", none: "AllWine drives af en privatperson i Danmark og er endnu ikke en registreret virksomhed.", copy: "© {0} {1}. Sidens kode, tekster og design må ikke kopieres uden tilladelse. Det, du selv lægger ind, er dit.", contact: "Skriv til {0}.", nocontact: "Kontakt ejeren, der sendte dig din invitation." }
      : { name: "Name", addr: "Address", email: "E-mail", cvr: "CVR no.", none: "AllWine is run by a private person in Denmark and is not yet a registered business.", copy: "© {0} {1}. The site's code, text and design may not be copied without permission. What you put in yourself is yours.", contact: "Write to {0}.", nocontact: "Contact the owner who sent you your invite." };
    const f = (s, ...a) => s.replace(/\{(\d)\}/g, (m, i) => a[i] ?? "");
    const rows = [[T.name, S.name], [T.addr, S.address], [T.email, S.email ? `<a href="mailto:${esc(S.email)}">${esc(S.email)}</a>` : ""], [T.cvr, S.cvr]].filter(r => r[1]);
    document.querySelectorAll("[data-who]").forEach(el => { el.innerHTML = rows.length ? rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${k === T.email ? v : esc(v)}</dd>`).join("") + (S.name ? "" : `<dd style="grid-column:1/-1">${esc(T.none)}</dd>`) : `<dd style="grid-column:1/-1">${esc(T.none)}</dd>`; });
    document.querySelectorAll("[data-copy]").forEach(el => { el.textContent = f(T.copy, years, S.name || "AllWine"); });
    document.querySelectorAll("[data-contact]").forEach(el => { el.innerHTML = S.email ? f(esc(T.contact), `<a href="mailto:${esc(S.email)}">${esc(S.email)}</a>`) : esc(T.nocontact); });
  }
  // the footer's look, once; each page's own colours (--muted, --line, --accent) carry over
  document.head.insertAdjacentHTML("beforeend", `<style>.sitefoot{max-width:1100px;margin:28px auto 0;padding:14px 16px 28px;border-top:1px solid var(--line,#E7DFDD);display:flex;flex-wrap:wrap;gap:6px 16px;font-size:12.5px;color:var(--muted,#756A70)}
.sitefoot a{color:inherit} .sitefoot a:hover{color:var(--accent,#7C2D3E)} @media print{.sitefoot{display:none}}</style>`);
  const run = () => { foot(); legal(); };
  run(); if (window.I18N && I18N.onChange) I18N.onChange(run);
})();
