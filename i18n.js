// Language for allwine.dk (front page and Burgundy atlas): English source strings, Danish, German and French translations,
// and a small flag picker. t("English text", a, b) returns the text in the chosen language with {0}, {1} filled in;
// anything missing falls back to English. Elements marked data-i18n / data-i18n-ph / data-i18n-title / data-i18n-aria
// are translated in place (their English text is remembered the first time).
// Each language's dictionary is a file of its own (i18n-da.js…), and a page loads only the one it needs: while the page
// is still being read, in line, so nothing shows in English first; a page's own texts in that language too, named in
// <meta name="i18n-extra" content="burgundy-i18n-da.js?v=5 …">. Another language is fetched when it's picked.
(function(){
"use strict";
// not inside another site's frame (clickjacking): GitHub Pages can't send X-Frame-Options or CSP frame-ancestors, so
// the page leaves the frame for the real address, and where a sandbox won't let it, shows nothing
if(window.top !== window.self){ try{ window.top.location.replace(location.href); }catch(e){ document.documentElement.style.display = "none"; } }
// an error in the page is reported (Code.gs logClientError): the page, file and line, and the message, never who or
// anything from a cellar; each one once, at most three a page, and only on the live site
(() => {
  const file = location.pathname.split("/").pop(), page = file === "" || file === "index.html" ? "cellar" : file.replace(/\.html$/, "");
  const seen = new Set(); let n = 0;
  const send = (msg, src, line) => {
    const api = window.WINE_CONFIG && window.WINE_CONFIG.API_URL;
    if(!api || location.protocol !== "https:" || !msg || msg === "Script error." || !navigator.sendBeacon) return;
    const k = msg + "|" + src + "|" + line; if(seen.has(k) || ++n > 3) return; seen.add(k);
    try{ navigator.sendBeacon(api, JSON.stringify({ action: "clienterr", page, src, line, msg: String(msg).slice(0, 200) })); }catch(e){}
  };
  addEventListener("error", e => { if(e.message) send(String(e.message), String(e.filename || ""), e.lineno || 0); });
  addEventListener("unhandledrejection", e => { const r = e.reason || {}; send(String(r.message || r), String(r.stack || "").match(/[\w.-]+\.js/) ? String(r.stack).match(/[\w.-]+\.js/)[0] : "", 0); });
})();
const FLAGS = {
  en: `<svg viewBox="0 0 60 30" aria-hidden="true"><clipPath id="fl-uk-a"><path d="M0 0v30h60V0z"/></clipPath><clipPath id="fl-uk-b"><path d="M30 15h30v15zv15H0zH0V0zV0h30z"/></clipPath><g clip-path="url(#fl-uk-a)"><path d="M0 0v30h60V0z" fill="#012169"/><path d="M0 0l60 30m0-30L0 30" stroke="#fff" stroke-width="6"/><path d="M0 0l60 30m0-30L0 30" clip-path="url(#fl-uk-b)" stroke="#C8102E" stroke-width="4"/><path d="M30 0v30M0 15h60" stroke="#fff" stroke-width="10"/><path d="M30 0v30M0 15h60" stroke="#C8102E" stroke-width="6"/></g></svg>`,
  da: `<svg viewBox="0 0 37 28" aria-hidden="true"><path fill="#C8102E" d="M0 0h37v28H0z"/><path fill="#fff" d="M12 0h4v28h-4zM0 12h37v4H0z"/></svg>`,
  de: `<svg viewBox="0 0 5 3" aria-hidden="true"><path fill="#000" d="M0 0h5v1H0z"/><path fill="#DD0000" d="M0 1h5v1H0z"/><path fill="#FFCE00" d="M0 2h5v1H0z"/></svg>`,
  fr: `<svg viewBox="0 0 3 2" aria-hidden="true"><path fill="#002654" d="M0 0h1v2H0z"/><path fill="#fff" d="M1 0h1v2H1z"/><path fill="#CE1126" d="M2 0h1v2H2z"/></svg>`,
};
const LANGS = [{id:"en", n:"English"}, {id:"da", n:"Dansk"}, {id:"de", n:"Deutsch"}, {id:"fr", n:"Français"}];

const FILES = {da: "i18n-da.js?v=6", fr: "i18n-fr.js?v=6", de: "i18n-de.js?v=6"};
const DICT = window.I18N_DICT = window.I18N_DICT || {};
const known = l => l === "en" || !!FILES[l];
// the page's own files for a language: the meta tag's entry that ends in -<lang>.js
const extras = l => { const m = document.querySelector('meta[name="i18n-extra"]'); return m ? m.content.split(/\s+/).filter(f => new RegExp("-" + l + "\\.js(\\?|$)").test(f)) : []; };
const filesFor = l => l === "en" ? [] : [FILES[l], ...extras(l)];
const loaded = new Set();
const fetchJs = src => loaded.has(src) ? Promise.resolve() : new Promise((ok, no) => { const s = document.createElement("script"); s.src = src;
  s.onload = () => { loaded.add(src); ok(); }; s.onerror = () => no(new Error("load " + src)); document.head.appendChild(s); });
// the language first, then the page's own files, which add to its dictionary
const need = l => l === "en" ? Promise.resolve() : fetchJs(FILES[l]).then(() => Promise.all(extras(l).map(fetchJs)));

let lang = (() => {
  const q = new URLSearchParams(location.search).get("lang"); // a link that says which language (the vineyard pages)
  if(known(q)){ try{ localStorage.setItem("lang", q); }catch(e){} return q; }
  try{ const s = localStorage.getItem("lang"); if(s && known(s)) return s; }catch(e){}
  const n = (navigator.language || "en").slice(0,2).toLowerCase();
  return known(n) ? n : "en";
})();
// the dictionary now, in line, while the page is being read (scripts after this one run with it in place)…
if(document.readyState === "loading") filesFor(lang).forEach(f => { loaded.add(f); document.write('<script src="' + f + '"><\/script>'); });
// …or, loaded later than that, fetched and the page told
else need(lang).then(() => { apply(); listeners.forEach(f => f(lang)); }).catch(() => {});
const listeners = [];
function t(s, ...a){ const r = (DICT[lang] && DICT[lang][s]) || s; return a.length ? r.replace(/\{(\d)\}/g, (m, i) => a[i] ?? "") : r; }
function apply(root){
  (root || document).querySelectorAll("[data-i18n],[data-i18n-ph],[data-i18n-title],[data-i18n-aria]").forEach(e => {
    if(e.hasAttribute("data-i18n")){ e.dataset.i18n ||= e.textContent.trim(); e.textContent = t(e.dataset.i18n); }
    if(e.hasAttribute("data-i18n-ph")){ e.dataset.i18nPh ||= e.getAttribute("placeholder") || ""; e.setAttribute("placeholder", t(e.dataset.i18nPh)); }
    if(e.hasAttribute("data-i18n-title")){ e.dataset.i18nTitle ||= e.getAttribute("title") || ""; e.setAttribute("title", t(e.dataset.i18nTitle)); }
    if(e.hasAttribute("data-i18n-aria")){ e.dataset.i18nAria ||= e.getAttribute("aria-label") || ""; e.setAttribute("aria-label", t(e.dataset.i18nAria)); }
  });
  document.documentElement.lang = lang;
}
// switches once the language's files are in (a promise: they may have to be fetched first)
function setLang(l){
  if(!known(l)) return Promise.resolve();
  return need(l).then(() => {
    lang = l; try{ localStorage.setItem("lang", l); }catch(e){}
    apply(); document.querySelectorAll(".langpick").forEach(syncPicker); listeners.forEach(f => f(l));
  }).catch(() => {});
}
function syncPicker(el){ el.querySelectorAll("button").forEach(b => { const on = b.dataset.lang===lang; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); }); }
// a row of three flags; the current language is lit
function picker(el){
  el.classList.add("langpick"); el.setAttribute("role", "group"); el.setAttribute("aria-label", "Language / Sprog / Langue");
  el.innerHTML = LANGS.map(L => `<button type="button" data-lang="${L.id}" title="${L.n}" aria-label="${L.n}">${FLAGS[L.id]}</button>`).join("");
  el.querySelectorAll("button").forEach(b => { b.onclick = () => setLang(b.dataset.lang);
    // fetch the language's files as soon as a finger or the mouse is on its flag, so the click finds them in
    ["pointerenter", "pointerdown", "focus"].forEach(t => b.addEventListener(t, () => { need(b.dataset.lang).catch(() => {}); }, {once: true})); });
  syncPicker(el);
}
window.I18N = {t, apply, setLang, picker, onChange: f => listeners.push(f), get lang(){ return lang; }, LANGS};
document.addEventListener("DOMContentLoaded", () => { document.querySelectorAll("[data-langpick]").forEach(picker); apply(); });
})();
