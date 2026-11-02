// A shared wine list (share.html#<id>.<key>): the ciphertext from the API (shareget), opened here with the key from
// the link (share-crypto.js), shown read-only with a search. The list, as the cellar's "Share" seals it:
//   { v: 1, t: title, by: who shared it, at: when, w: [[producer, wine, vintage, commune, region, country,
//     classification, colour, bottles, drink from, drink to, note, price]] }  (note and price only if chosen)
// or a business's wine card or price list (business.js), sealed again under the same key whenever it changes:
//   { v: 1, k: "card", kind, t: title, by, at, glass: a price by the glass?, w: [[producer, wine, vintage, region,
//     country, colour, glass price, price, bottles (a shop's)]] }
(function () {
"use strict";
const t = (s, ...a) => (window.I18N ? I18N.t(s, ...a) : s.replace(/\{(\d)\}/g, (m, i) => a[i] ?? ""));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const main = document.getElementById("main");
const lang = () => (window.I18N ? I18N.lang : "en");
const day = ms => new Date(ms).toLocaleDateString(lang() === "en" ? "en-GB" : lang(), { day: "numeric", month: "long", year: "numeric" });
const STYLE = { "Rød": "Red", "Hvid": "White", "Rosé": "Rosé", "Bobler": "Sparkling" }; // as app.js names them
// the cellar keeps countries in Danish, as the spreadsheet has them; shown here in the page's language
const CTRY = { "Frankrig": "France", "Italien": "Italy", "Tyskland": "Germany", "Spanien": "Spain", "Portugal": "Portugal", "Østrig": "Austria", "Danmark": "Denmark" };
const kr = n => n == null || n === "" || isNaN(n) ? "" : new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 }).format(Number(n)) + " kr."; // as the cellar writes it
// a cell with a label for the phone layout, left out when there's nothing in it (so no bare "Drink window:")
const td = (label, v, n) => v === "" || v == null ? `<td${n ? ' class="n"' : ""}></td>` : `<td${n ? ' class="n"' : ""} data-l="${esc(label)}">${esc(v)}</td>`;
let LIST = null, META = null;

function state(msg) { main.innerHTML = `<div class="state">${esc(msg)}</div>`; }
// the card as a guest sees it: by colour, then region, with the prices; a search on top for a long list
const ORDER = ["Bobler", "Hvid", "Rosé", "Rød"];
function renderCard() {
  const q = (document.getElementById("q") || {}).value || "", k = q.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const w = LIST.w.filter(r => !k || r.slice(0, 5).join(" ").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(k));
  const glass = LIST.glass && LIST.w.some(r => r[6] != null), stock = LIST.w.some(r => r[8] != null);
  const n = x => x == null || x === "" ? "" : new Intl.NumberFormat("da-DK", { maximumFractionDigits: 2 }).format(Number(x));
  const styles = ORDER.concat([...new Set(w.map(r => r[5]))].filter(s => !ORDER.includes(s)));
  const body = styles.map(st => {
    const ws = w.filter(r => r[5] === st); if (!ws.length) return "";
    let reg = "";
    return `<h2>${esc(st ? t(STYLE[st] || st) : t("Other wines"))}</h2>` + ws.map(r => {
      const where = [r[3], r[4] && t(CTRY[r[4]] || r[4])].filter(Boolean).join(", "), head = where !== reg ? `<h3>${esc(where)}</h3>` : ""; reg = where;
      return head + `<div class="cl"><span class="cw"><b>${esc(r[0])}</b> ${esc(r[1])}</span><span class="cy">${esc(r[2] || "NV")}</span>`
        + (stock ? `<span class="cs">${r[8] != null ? esc(r[8] === 1 ? t("1 bottle") : t("{0} bottles", r[8])) : ""}</span>` : "")
        + (glass ? `<span class="cg">${esc(n(r[6]))}</span>` : "") + `<span class="cp">${esc(n(r[7]))}</span></div>`; }).join("");
  }).join("");
  main.innerHTML = `<article class="card"><h1>${esc(LIST.t || t("Wine card"))}</h1>
    ${LIST.w.length > 12 ? `<input type="search" id="q" placeholder="${esc(t("Search the card…"))}" aria-label="${esc(t("Search the card…"))}" value="${esc(q)}">` : ""}
    ${body || `<p class="meta">${esc(LIST.w.length ? t("Nothing on the card matches.") : t("The card is empty just now."))}</p>`}
    <p class="fine">${esc(t("Prices in kr. including VAT."))}${glass ? " " + esc(t("The first price is by the glass.")) : ""}<br>${esc(t("Updated {0}", day(LIST.at || META.created)))}</p></article>`;
  const box = document.getElementById("q");
  if (box) box.addEventListener("input", () => { const at = box.selectionStart; render(); const b = document.getElementById("q"); b.focus(); b.setSelectionRange(at, at); });
  document.title = (LIST.t || t("Wine card")) + " — AllWine";
}
function render() {
  if (!LIST) return;
  const pn = document.getElementById("privNote"); if (pn) pn.hidden = LIST.k === "card";
  if (LIST.k === "card") return renderCard();
  const q = (document.getElementById("q") || {}).value || "", k = q.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const w = LIST.w.filter(r => !k || r.slice(0, 7).join(" ").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(k));
  const notes = LIST.w.some(r => r[11]), prices = LIST.w.some(r => r[12] != null && r[12] !== "");
  const bottles = LIST.w.reduce((s, r) => s + (Number(r[8]) || 0), 0);
  const head = `<h1>${esc(LIST.t || t("A shared wine list"))}</h1>
    <p class="meta">${esc([LIST.by ? t("Shared by {0}", LIST.by) : "", (LIST.w.length === 1 ? t("1 wine") : t("{0} wines", LIST.w.length)) + ", " + (bottles === 1 ? t("1 bottle") : t("{0} bottles", bottles)), t("open until {0}", day(META.expires))].filter(Boolean).join(" · "))}</p>
    <input type="search" id="q" placeholder="${esc(t("Search the list…"))}" aria-label="${esc(t("Search the list…"))}" value="${esc(q)}">`;
  const rows = w.map(r => {
    const where = [r[3], r[4], r[5] && t(CTRY[r[5]] || r[5])].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(", ");
    const win = r[9] || r[10] ? `${r[9] ?? "?"}–${r[10] ?? "?"}` : "";
    return `<tr><td><b>${esc(r[0])}</b><small>${esc([r[1], r[6]].filter(Boolean).join(" · "))}</small>${notes && r[11] ? `<small>${esc(r[11])}</small>` : ""}</td>`
      + td(t("Vintage"), r[2] || "NV", 1) + td(t("Region"), where) + td(t("Type"), r[7] ? t(STYLE[r[7]] || r[7]) : "") + td(t("Bottles"), r[8], 1)
      + td(t("Drink window"), win, 1) + (prices ? td(t("Price"), kr(r[12]), 1) : "") + "</tr>";
  }).join("");
  main.innerHTML = head + `<table><thead><tr><th>${esc(t("Wine"))}</th><th class="n">${esc(t("Vintage"))}</th><th>${esc(t("Region"))}</th><th>${esc(t("Type"))}</th>
    <th class="n">${esc(t("Bottles"))}</th><th class="n">${esc(t("Drink window"))}</th>${prices ? `<th class="n">${esc(t("Price"))}</th>` : ""}</tr></thead><tbody>${rows}</tbody></table>`;
  const box = document.getElementById("q"); box.addEventListener("input", () => { const at = box.selectionStart; render(); const b = document.getElementById("q"); b.focus(); b.setSelectionRange(at, at); });
  document.title = (LIST.t || t("A shared wine list")) + " — AllWine";
}

async function load() {
  const m = location.hash.match(/^#([0-9a-f]{32})\.([A-Za-z0-9_-]{43})$/);
  if (!m) return state(t("This link isn't complete: ask for it again, and copy all of it."));
  const api = window.WINE_CONFIG && window.WINE_CONFIG.API_URL;
  if (!api || !window.crypto || !crypto.subtle) return state(t("This browser can't open a shared list."));
  try {
    const r = await (await fetch(api, { method: "POST", body: JSON.stringify({ action: "shareget", id: m[1] }) })).json();
    if (!r.ok) return state(r.error === "share-gone" ? t("This list isn't shared any more: it expired, or was withdrawn.") : t("Couldn't open the list just now. Try again in a moment."));
    META = r; LIST = await SHARE_CRYPTO.open(r.blob, m[2]);
    render();
  } catch (e) { state(/old-browser/.test(e && e.message) ? t("This browser can't open a shared list.") : t("This link doesn't open the list: ask for it again, and copy all of it.")); }
}
if (window.I18N) I18N.onChange(render);
load();
})();
