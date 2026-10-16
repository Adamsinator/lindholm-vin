#!/usr/bin/env node
// Checks the atlas's holdings against each domaine's own website → a report of what differs
//
//   node tools/holdings-check.js [ids…] [--out report.md] [--json report.json] [--cache]
//
// Reads tools/holdings-sources.json (domaine id → its official pages that list its wines or vineyards), fetches
// each page with curl, finds the climats it names and compares them with burgundy-data*.js:
//   - climats on the site that the atlas doesn't list for the domaine (a missing holding, or négoce grapes)
//   - climats the atlas lists that the site never names (sold, renamed, or the site is incomplete)
//   - areas: the surface figures written near each climat, against the atlas's hectares
// Nothing is changed: a site can lag, list bought-in grapes or name a climat only in a story, so every line is
// something for a person to look at. Climat names are matched like burgundy-match.js does it: commune names
// are taken out first (Puligny-Montrachet isn't Montrachet), and a premier cru needs its commune nearby,
// because there are three Les Cras. --cache keeps pages in tools/.holdings-cache between runs.
"use strict";
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const ROOT = path.resolve(__dirname, "..");
const args = process.argv.slice(2), opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const only = args.filter((a, i) => !a.startsWith("--") && !["--out", "--json"].includes(args[i - 1]));
const CACHE = args.includes("--cache") ? path.join(__dirname, ".holdings-cache") : null;
if (CACHE) fs.mkdirSync(CACHE, { recursive: true });

global.window = {};
["burgundy-data.js", "burgundy-data-beaune.js", "burgundy-names.js"].forEach(f => require(path.join(ROOT, f)));
const B = window.BURG, X = (window.BURG_NAMES && window.BURG_NAMES.climats) || [];
const SOURCES = args.includes("--selftest") ? {} : JSON.parse(fs.readFileSync(path.join(__dirname, "holdings-sources.json"), "utf8"));

const norm = t => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe").replace(/æ/g, "ae")
  .replace(/[^a-z0-9]+/g, " ").replace(/\bst\b/g, "saint").replace(/\bste\b/g, "sainte").replace(/\s+/g, " ").trim();
const ARTICLE = /^(les|la|le|aux|au|en|l)\s+/;

// ── the names to look for ────────────────────────────────────────────────────────────────────────
const VIL = Object.fromEntries(B.villages.map(v => [v.id, v.n.split(" · ")[0]]));
const ids = new Set(B.climats.map(c => c.id));
const CLIMATS = B.climats.map(c => ({ id: c.id, n: c.n, c: c.c, v: c.v, geo: c.geo, ha: c.ha, atlas: true }))
  .concat(X.filter(x => !ids.has(x[0])).map(([id, n, c, v]) => ({ id, n, c, v })));
// commune names as they appear in appellations; the climat's own commune plus the names it may be sold under
const COMMUNE_NAMES = {
  marsannay: ["marsannay"], fixin: ["fixin"], gevrey: ["gevrey chambertin", "gevrey"], morey: ["morey saint denis", "morey"],
  chambolle: ["chambolle musigny", "chambolle"], vougeot: ["vougeot"], flagey: ["flagey echezeaux", "flagey", "vosne romanee"],
  vosne: ["vosne romanee", "vosne"], nuits: ["nuits saint georges", "nuits"], premeaux: ["premeaux", "nuits saint georges"],
  corton: ["aloxe corton", "ladoix", "pernand vergelesses", "corton"], savigny: ["savigny les beaune", "savigny"],
  chorey: ["chorey les beaune"], beaune: ["beaune"], pommard: ["pommard"], volnay: ["volnay"],
  monthelie: ["monthelie", "auxey duresses", "saint romain"], meursault: ["meursault", "volnay santenots", "blagny"],
  puligny: ["puligny montrachet", "puligny", "blagny"], chassagne: ["chassagne montrachet", "chassagne"],
  staubin: ["saint aubin"], santenay: ["santenay"], maranges: ["maranges"], cdnv: ["cote de nuits villages"],
};
// whole commune names block shorter climat names inside them ("puligny montrachet" ⊃ "montrachet")
const BLOCK = [...new Set(Object.values(COMMUNE_NAMES).flat().filter(n => n.includes(" ")).concat(["cote de nuits", "cote de beaune", "hautes cotes"]))];
const ALIASES = [];
CLIMATS.forEach(c => {
  const full = norm(c.n), a = new Set([full]);
  if (c.c !== "GC") { const s = full.replace(ARTICLE, ""); if (s !== full && s.length >= 5) a.add(s); }
  if (c.id === "closvougeot") { a.add("clos vougeot"); a.add("clos de vougeot"); }
  if (c.id === "montrachet") a.add("montrachet");
  if (c.id === "beze") { a.add("clos de beze"); a.add("chambertin clos de beze"); }
  if (c.id === "closstjacques") a.add("clos saint jacques");
  if (c.id === "laromanee") { a.clear(); a.add("la romanee"); }
  if (c.c === "GC" && /^corton /.test(full)) a.add(full.replace(/^corton (les |le |la )?/, "corton "));
  a.forEach(al => ALIASES.push({ al, c }));
});
const byAlias = new Map();
ALIASES.forEach(({ al, c }) => { if (!byAlias.has(al)) byAlias.set(al, []); byAlias.get(al).push(c); });

// ── page text ────────────────────────────────────────────────────────────────────────────────────
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", laquo: "«", raquo: "»", rsquo: "’", lsquo: "‘", ndash: "–", mdash: "—",
  eacute: "é", egrave: "è", ecirc: "ê", euml: "ë", agrave: "à", acirc: "â", ocirc: "ô", ucirc: "û", ugrave: "ù", icirc: "î", iuml: "ï", ccedil: "ç", oelig: "œ",
  Eacute: "É", Egrave: "È", Ecirc: "Ê", Agrave: "À", Ocirc: "Ô", Ccedil: "Ç", hellip: "…" };
const textOf = html => html.replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ")
  .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr|td|section|article)>/gi, "\n").replace(/<[^>]+>/g, " ")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&([a-z]+);/gi, (m, n) => ENT[n] || m).replace(/[ \t\r\f\v]+/g, " ").replace(/\n\s*/g, "\n").trim();
function fetchPage(url) {
  const key = CACHE && path.join(CACHE, url.replace(/[^a-z0-9]+/gi, "_").slice(0, 180) + ".html");
  if (key && fs.existsSync(key)) return fs.readFileSync(key, "utf8");
  const html = execFileSync("curl", ["-sSL", "--compressed", "--retry", "4", "--retry-all-errors", "--max-time", "60",
    "-A", "Mozilla/5.0 (compatible; allwine-holdings-check; +https://allwine.dk)", url], { maxBuffer: 1 << 27 }).toString();
  if (key) fs.writeFileSync(key, html);
  return html;
}

// ── areas written in the text: "0.3745 hectare", "0,37 ha", "2 ha 99 a 93 ca", "73 a 19 ca", "37 ares" ─────────
const AREA_RE = /(\d+(?:[.,]\d+)?)\s*(?:ha|hectares?|hectare)\b(?:\s*(\d{1,2})\s*a(?:res?)?\b)?(?:\s*(\d{1,2})\s*ca\b)?|(\d{1,3})\s*a(?:res?)?\s*(\d{1,2})\s*ca\b|(\d{1,3}(?:[.,]\d+)?)\s*ares\b/gi;
// A figure right after a word like "Surface:" is the domaine's own; a bare one may be the climat's total. Labelled
// figures are marked with a trailing "*" in the returned strings' place: {ha, own}.
const LABEL = /(surface|superficie|area|size|parcel|parcelle|plot|vineyard of|we (own|farm|have)|owns?|holding|exploit\w*|planted on|plant\w* sur)[^0-9]{0,25}$/i;
function areas(s) {
  const out = []; let m; AREA_RE.lastIndex = 0;
  while ((m = AREA_RE.exec(s))) {
    let ha;
    if (m[1] != null) ha = +m[1].replace(",", ".") + (m[2] ? +m[2] / 100 : 0) + (m[3] ? +m[3] / 1e4 : 0);
    else if (m[4] != null) ha = +m[4] / 100 + +m[5] / 1e4;
    else ha = +m[6].replace(",", ".") / 100;
    if (ha > 0 && ha < 60) out.push({ ha: +ha.toFixed(4), at: m.index, own: LABEL.test(s.slice(Math.max(0, m.index - 45), m.index)) });
  }
  return out;
}

// ── find the climats a text names ──────────────────────────────────────────────────────────────────
// Matching runs on a normalised copy; `pos` maps each normalised character back to the original text, so the
// surface figures can be read from the original after each mention.
function normWithMap(s) {
  let out = "", pos = [], prevSpace = true;
  for (let i = 0; i < s.length; i++) {
    let ch = s[i].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (ch === "œ") ch = "oe"; else if (ch === "æ") ch = "ae";
    for (const k of ch) { if (/[a-z0-9]/.test(k)) { out += k; pos.push(i); prevSpace = false; } else if (!prevSpace) { out += " "; pos.push(i); prevSpace = true; } }
  }
  return { t: " " + out.replace(/\bst\b/g, "saint").replace(/\bste\b/g, "sainte") + " ", pos: [0, ...pos, s.length] };
}
function mentions(text) {
  const { t, pos } = normWithMap(text), hits = [];
  const find = (needle, fn) => { let i = -1; while ((i = t.indexOf(" " + needle + " ", i + 1)) >= 0) fn(i + 1, i + 1 + needle.length); };
  const blocked = []; BLOCK.forEach(b => find(b, (s, e) => blocked.push([s, e])));
  const communes = []; Object.entries(COMMUNE_NAMES).forEach(([v, names]) => names.forEach(n => find(n, s => communes.push([s, v]))));
  for (const [al, cs] of byAlias) find(al, (s, e) => {
    // inside a longer commune name, unless the climat name is the longer one (Charmes-Chambertin ⊃ "chambertin")
    if (blocked.some(([bs, be]) => bs <= s && be >= e && be - bs > e - s)) return;
    hits.push({ s, e, al, cs });
  });
  // overlapping matches: the longest wins ("chapelle chambertin" over "chambertin")
  hits.sort((a, b) => (b.e - b.s) - (a.e - a.s));
  const kept = [];
  for (const h of hits) if (!kept.some(k => h.s < k.e && h.e > k.s)) kept.push(h);
  kept.sort((a, b) => a.s - b.s);
  const near = (s, v) => communes.some(([cs, cv]) => cv === v && Math.abs(cs - s) < 260);
  const vOk = (c, s) => near(s, c.v) || (c.geo && near(s, c.geo)) || (c.v === "flagey" && near(s, "vosne")) || (c.v === "premeaux" && near(s, "nuits"));
  return kept.map((h, i) => {
    // its commune nearby decides; a grand cru name stands on its own, unless another climat shares it (Les Chaumes is
    // a Vosne premier cru and a Corton grand cru climat)
    let cs = h.cs.filter(c => vOk(c, h.s)), sure = true;
    if (!cs.length && h.cs.filter(c => c.c === "GC").length === 1) { cs = h.cs.filter(c => c.c === "GC"); sure = h.cs.length === 1; }
    if (!cs.length && h.cs.length === 1 && h.al.split(" ").length >= 2) { cs = h.cs; sure = false; } // a distinctive name, no commune nearby
    if (cs.length > 1) cs = cs.filter(c => c.atlas).length ? cs.filter(c => c.atlas) : cs;
    if (cs.length !== 1) return null;
    // the text that belongs to this mention: up to the next climat named, at most ~700 characters
    const next = kept[i + 1] ? kept[i + 1].s : t.length, o0 = pos[h.e] || 0, o1 = pos[Math.min(next, h.e + 700)] || text.length;
    return { c: cs[0], sure, al: h.al, at: pos[h.s], said: text.slice(pos[h.s], pos[h.e]), areas: areas(text.slice(o0, o1)) };
  }).filter(Boolean).filter((m, _, all) => m.sure || !all.some(o => o.sure && o.al === m.al && o.c.id !== m.c.id));
}

function main() {
  // ── compare ──────────────────────────────────────────────────────────────────────────────────────
  const holdings = {};
  B.climats.forEach(c => (c.p || []).forEach(([pid, ha, kind, since]) => (holdings[pid] = holdings[pid] || []).push({ c, ha, kind, since })));
  const fmt = h => h == null ? "?" : (+h).toFixed(h < 1 ? 2 : 2).replace(/\.?0+$/, "");
  const report = [], json = {};
  const todo = Object.entries(SOURCES).filter(([id]) => !only.length || only.includes(id));
  for (const [pid, src] of todo) {
    const name = B.producers[pid] || pid, r = { id: pid, name, pages: src.pages || [], status: src.status || "ok", errors: [], onSite: [], missing: [], absent: [], areas: [] };
    json[pid] = r;
    if (!r.pages.length) { report.push(`### ${name}\n${src.status || "no pages"}${src.note ? " — " + src.note : ""}\n`); continue; }
    // ignore: climat ids a person has checked and found fine (a neighbour named in a story, a lease the site doesn't
    // list yet), so the next run reports only what's new
    const ign = new Set(src.ignore || []);
    const held = holdings[pid] || [], heldIds = new Set(held.map(h => h.c.id));
    const found = new Map();
    for (const url of r.pages) {
      let text;
      try { text = textOf(fetchPage(url)); } catch (e) { r.errors.push(`${url}: ${String(e.message).split("\n")[0].slice(0, 120)}`); continue; }
      const own = areas(text).filter(a => a.own), labelled = own.length > 0;
      // a page that labels its surfaces is read as sections: each "Surface: …" belongs to the climat named most often
      // since the previous one, counting the domaine's own climats first (the Chaumes section names La Tâche three times)
      const sectionArea = new Map();
      if (labelled) {
        const ms = mentions(text);
        own.forEach((a, k) => {
          const from = k ? own[k - 1].at : 0, inSec = ms.filter(m => m.at > from && m.at < a.at);
          // a tie goes to the climat named last before the figure: a section's heading, not the previous one's tail
          const tally = list => { const n = new Map(); list.forEach(m => { const e = n.get(m.c.id) || [m.c.id, 0, 0]; e[1]++; e[2] = m.at; n.set(m.c.id, e); });
            return [...n.values()].sort((x, y) => y[1] - x[1] || y[2] - x[2])[0]; };
          const best = tally(inSec.filter(m => heldIds.has(m.c.id))) || tally(inSec);
          if (best) { if (!sectionArea.has(best[0])) sectionArea.set(best[0], []); sectionArea.get(best[0]).push(a.ha); }
        });
      }
      if (text.length < 400) r.errors.push(`${url}: only ${text.length} characters of text (built by JavaScript?)`);
      for (const m of mentions(text)) {
        const f = found.get(m.c.id) || { c: m.c, sure: false, said: new Set(), areas: new Set(), urls: new Set() };
        f.sure = f.sure || m.sure; f.said.add(m.said); f.urls.add(url); found.set(m.c.id, f);
        // when the page labels its surfaces ("Surface: 0.37 ha"), its sections decide; otherwise the figures after the name
        (labelled ? sectionArea.get(m.c.id) || [] : m.areas.map(a => a.ha)).forEach(a => f.areas.add(a));
      }
    }
    // a climat nested in another (Clos des Réas in Aux Réas) shouldn't also count as its host
    r.onSite = [...found.values()].map(f => ({ id: f.c.id, n: f.c.n, cls: f.c.c, v: VIL[f.c.v] || f.c.v, sure: f.sure, areas: [...f.areas], urls: [...f.urls] }));
    r.missing = r.onSite.filter(f => !heldIds.has(f.id) && !ign.has(f.id));
    r.absent = r.errors.length === r.pages.length ? [] : held.filter(h => !found.has(h.c.id) && !ign.has(h.c.id)).map(h => ({ id: h.c.id, n: h.c.n, ha: h.ha, kind: h.kind }));
    for (const h of held) {
      const f = found.get(h.c.id); if (!f || h.ha == null || !f.areas.size || ign.has(h.c.id + ":ha")) continue;
      const a = [...f.areas]; if (a.some(x => Math.abs(x - h.ha) <= Math.max(0.015, h.ha * 0.03))) continue;
      r.areas.push({ id: h.c.id, n: h.c.n, atlas: h.ha, site: a });
    }
    const lines = [`### ${name} (\`${pid}\`)`, r.pages.map(u => `<${u}>`).join(" · ")];
    r.errors.forEach(e => lines.push(`- ⚠️ ${e}`));
    if (r.missing.length) { lines.push(`- **On the site, not in the atlas:**`);
      r.missing.forEach(m => lines.push(`  - ${m.n} (${m.cls === "GC" ? "grand cru" : m.cls === "1er" ? "1er cru" : "village"}, ${m.v})${m.sure ? "" : " — no commune named nearby, check"}${m.areas.length ? ` · areas nearby: ${m.areas.map(fmt).join(", ")} ha` : ""}`)); }
    if (r.absent.length) lines.push(`- **In the atlas, not named on the site:** ${r.absent.map(a => `${a.n}${a.ha != null ? " " + fmt(a.ha) + " ha" : ""}${a.kind === "f" ? " (leased)" : a.kind === "s" ? " (bought grapes)" : ""}`).join("; ")}`);
    if (r.areas.length) { lines.push(`- **Area differs:**`); r.areas.forEach(a => lines.push(`  - ${a.n}: atlas ${fmt(a.atlas)} ha · site mentions ${a.site.map(fmt).join(", ")} ha`)); }
    if (!r.missing.length && !r.absent.length && !r.areas.length && !r.errors.length) lines.push(`- ✓ matches the atlas (${r.onSite.length} climats named)`);
    report.push(lines.join("\n") + "\n");
  }
  const head = `# Holdings check\n\n${new Date().toISOString().slice(0, 10)} · ${todo.length} domaines with sources in tools/holdings-sources.json · generated by tools/holdings-check.js\n\n` +
    `Each line is something to look at, not a fact: sites lag, list négoce wines from bought grapes, and name neighbours in their stories.\n\n`;
    const md = head + report.join("\n");
  if (opt("--out")) fs.writeFileSync(opt("--out"), md); else process.stdout.write(md);
  if (opt("--json")) fs.writeFileSync(opt("--json"), JSON.stringify(json, null, 1));

}

// node tools/holdings-check.js --selftest: the matcher on the cases that trip a naive reader
function selftest() {
  const T = [
    ["Puligny-Montrachet 1er Cru Les Folatières", ["folatieres"]],
    ["Chapelle-Chambertin Grand Cru and Gevrey-Chambertin village", ["chapelle"]],
    ["Gevrey-Chambertin 1er Cru Clos Saint-Jacques", ["closstjacques"]],
    ["Vosne-Romanée Premier Cru « Les Petits Monts »", ["petitsmonts"]],
    ["Chambolle-Musigny 1er Cru Les Cras", ["cras_chambolle"]],
    ["Nuits-Saint-Georges 1er Cru Aux Cras", ["cras_nuits"]],
    ["La Romanée, Grand Cru, Monopole", ["laromanee"]],
    ["Bâtard-Montrachet and Le Montrachet", ["batard", "montrachet"]],
    ["Clos de Vougeot Grand Cru", ["closvougeot"]],
  ];
  let bad = 0;
  for (const [txt, want] of T) {
    const got = mentions(txt).map(m => m.c.id);
    const ok = want.every(w => got.includes(w)) && got.every(g => want.includes(g));
    if (!ok) bad++;
    console.log(`${ok ? "ok  " : "FAIL"} ${txt} → ${got.join(", ") || "nothing"}${ok ? "" : "   (want " + want.join(", ") + ")"}`);
  }
  const a = areas("Surface: 0.3745 hectare · 2 ha 99 a 93 ca · 73 a 19 ca · 37 ares · 0,37 ha").map(x => x.ha).join(" ");
  const aOk = a === "0.3745 2.9993 0.7319 0.37 0.37"; if (!aOk) bad++;
  console.log(`${aOk ? "ok  " : "FAIL"} areas → ${a}`);
  process.exit(bad ? 1 : 0);
}
if (args.includes("--selftest")) selftest(); else main();
