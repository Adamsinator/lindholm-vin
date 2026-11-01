// The map in 3D (atlas.js and burgundy.js): what's on screen, lifted onto the real ground. The heights come from IGN's
// altitude service (RGE ALTI®, France only, Licence Ouverte) as a grid over the view; the colours are the map's own
// (vineyards, woods, roads, rivers), taken from a picture of the map without its labels; the vineyards' names are put
// back on top. It opens flat, as the map was, and tilts up; a drag turns and tilts it, a pinch or the wheel zooms, and
// the height can be exaggerated.
//   TERRAIN3D.open({ svg, view: [x, y, w, h], toLL: (x, y) => [lon, lat], labels: ".lb.GC, .lb.p1", title, credit })
(function () {
"use strict";
const SUB = 3; // colours a height cell, each way
const ALT = "https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json";
const t = (s, ...a) => (window.I18N ? I18N.t(s, ...a) : s.replace(/\{(\d)\}/g, (m, i) => a[i] ?? ""));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const still = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
let UI = null, S = null;

const CSS = `.t3d{position:fixed;inset:0;z-index:200;background:radial-gradient(120% 90% at 50% 10%,var(--card,#fff),var(--bg,#f4f1ea));color:var(--ink,#2a2126)}
.t3d[hidden]{display:none}
.t3d canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:grab}
.t3d-h{position:absolute;left:12px;right:12px;top:calc(10px + env(safe-area-inset-top));display:flex;justify-content:space-between;align-items:center;gap:10px;pointer-events:none}
.t3d-t{font:600 20px/1.2 "Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;background:color-mix(in srgb,var(--card,#fff) 88%,transparent);padding:6px 14px;border-radius:12px;border-left:3px solid var(--accent,#7c2d3e)}
.t3d-x{pointer-events:auto;width:44px;height:44px;border-radius:50%;border:1px solid var(--line,#ddd);background:var(--card,#fff);color:inherit;font-size:16px;cursor:pointer}
.t3d-c{position:absolute;left:12px;bottom:calc(14px + env(safe-area-inset-bottom));display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:color-mix(in srgb,var(--card,#fff) 90%,transparent);
  border:1px solid var(--line,#ddd);border-radius:14px;padding:8px 12px;font-size:13.5px}
.t3d-c input{width:110px;vertical-align:middle} .t3d-c button{border:1px solid var(--line,#ddd);background:var(--card,#fff);color:inherit;border-radius:10px;padding:6px 10px;font:inherit;cursor:pointer}
.t3d-s{position:absolute;left:0;right:0;top:46%;text-align:center;font-size:15px;color:var(--muted,#777);margin:0}
.t3d-cr{position:absolute;right:12px;bottom:calc(6px + env(safe-area-inset-bottom));margin:0;font-size:11px;color:var(--muted,#777);max-width:50%;text-align:right}
@media(max-width:560px){.t3d-cr{left:12px;right:12px;max-width:none;bottom:calc(70px + env(safe-area-inset-bottom));text-align:left}}
body.t3d-on{overflow:hidden}`;
function ui() {
  if (UI) return UI;
  const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
  const d = document.createElement("div"); d.className = "t3d"; d.hidden = true; d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true");
  d.innerHTML = `<canvas aria-label=""></canvas>
    <div class="t3d-h"><b class="t3d-t"></b><button type="button" class="t3d-x" aria-label="">✕</button></div>
    <div class="t3d-c"><label><span class="t3d-el"></span> <input type="range" min="1" max="10" step=".5" value="3"></label><button type="button" class="t3d-top"></button></div>
    <p class="t3d-s" role="status"></p><p class="t3d-cr"></p>`;
  document.body.appendChild(d);
  UI = { d, cv: d.querySelector("canvas"), title: d.querySelector(".t3d-t"), x: d.querySelector(".t3d-x"), ex: d.querySelector("input"), top: d.querySelector(".t3d-top"),
    st: d.querySelector(".t3d-s"), cr: d.querySelector(".t3d-cr"), el: d.querySelector(".t3d-el") };
  UI.x.onclick = close;
  UI.ex.oninput = () => { if (S) { S.ex = +UI.ex.value; draw(); } };
  UI.top.onclick = () => { if (S) tiltTo(S.pitch > 1.2 ? .62 : 1.45); };
  addEventListener("keydown", e => { if (e.key === "Escape" && !d.hidden) close(); });
  addEventListener("resize", () => { if (S) draw(); });
  // a drag turns (sideways) and tilts (up and down); two fingers or the wheel zoom
  const ptr = new Map(); let last = null, pinch = 0;
  UI.cv.addEventListener("pointerdown", e => { ptr.set(e.pointerId, [e.clientX, e.clientY]); try { UI.cv.setPointerCapture(e.pointerId); } catch (_) {} last = [e.clientX, e.clientY]; pinch = 0; });
  UI.cv.addEventListener("pointermove", e => { if (!S || !ptr.has(e.pointerId)) return; ptr.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptr.size === 2) { const [a, b] = [...ptr.values()], dd = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) { S.auto = false; S.zoom = Math.max(.5, Math.min(4, S.zoom * dd / pinch)); draw(); } pinch = dd; return; }
    const dx = e.clientX - last[0], dy = e.clientY - last[1]; last = [e.clientX, e.clientY]; S.auto = false;
    S.yaw += dx * .008; S.pitch = Math.max(.25, Math.min(1.5, S.pitch + dy * .006)); draw(); });
  const up = e => { ptr.delete(e.pointerId); pinch = 0; const r = [...ptr.values()][0]; if (r) last = r; };
  UI.cv.addEventListener("pointerup", up); UI.cv.addEventListener("pointercancel", up);
  UI.cv.addEventListener("wheel", e => { if (!S) return; e.preventDefault(); S.auto = false; S.zoom = Math.max(.5, Math.min(4, S.zoom * Math.exp(-e.deltaY * .0015))); draw(); }, { passive: false });
  return UI;
}
function texts() {
  UI.cv.setAttribute("aria-label", t("The map in 3D"));
  UI.x.setAttribute("aria-label", t("Close")); UI.el.textContent = t("Height ×"); UI.top.textContent = t("Tilt / from above");
  UI.cr.textContent = t("Heights: IGN, RGE ALTI® (Licence Ouverte)."); if (S && S.credit) UI.cr.textContent += " " + S.credit;
}
function close() { if (!UI) return; UI.d.hidden = true; document.body.classList.remove("t3d-on"); S = null; }

// a picture of the map in view, labels and photo tiles left out (they'd be drawn twice, or not allowed to be read back)
async function picture(svg, view, px, grid) {
  const c = svg.cloneNode(true), all = svg.querySelectorAll("*"), cl = c.querySelectorAll("*");
  for (let i = 0; i < all.length; i++) { const o = all[i], k = cl[i];
    if (/^(text|image|title)$/.test(o.tagName)) { k.remove(); continue; }
    const cs = getComputedStyle(o); if (cs.display === "none" || cs.visibility === "hidden") { k.remove(); continue; }
    if (/^(path|rect|circle|polygon|polyline|line|ellipse)$/.test(o.tagName))
      k.setAttribute("style", `fill:${cs.fill};fill-opacity:${cs.fillOpacity};stroke:${cs.stroke};stroke-width:${cs.strokeWidth};stroke-opacity:${cs.strokeOpacity};opacity:${cs.opacity}`); }
  const [x, y, w, h] = view, W = px, H = Math.round(px * h / w);
  c.setAttribute("viewBox", `${x} ${y} ${w} ${h}`); c.setAttribute("width", W); c.setAttribute("height", H); c.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  c.removeAttribute("style"); c.style.transform = ""; c.setAttribute("preserveAspectRatio", "none");
  const bg = getComputedStyle(svg.closest(".mapbox") || svg).backgroundColor || "#f4f1ea";
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(c)], { type: "image/svg+xml" }));
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
    const cv = document.createElement("canvas"); cv.width = W; cv.height = H; const g = cv.getContext("2d");
    g.fillStyle = bg; g.fillRect(0, 0, W, H); g.drawImage(img, 0, 0, W, H);
    // halved and halved again: each colour the average of the map under it, not one pixel of a road
    let src = cv, w2 = W, h2 = H;
    while (w2 > grid[0] * 2) { const n = document.createElement("canvas"); w2 = Math.max(grid[0], w2 >> 1); h2 = Math.max(grid[1], h2 >> 1); n.width = w2; n.height = h2;
      const ng = n.getContext("2d"); ng.imageSmoothingQuality = "high"; ng.drawImage(src, 0, 0, w2, h2); src = n; }
    const out = document.createElement("canvas"); out.width = grid[0]; out.height = grid[1]; const og = out.getContext("2d"); og.imageSmoothingQuality = "high"; og.drawImage(src, 0, 0, grid[0], grid[1]);
    return { data: og.getImageData(0, 0, grid[0], grid[1]).data, W: grid[0], H: grid[1] };
  } finally { URL.revokeObjectURL(url); }
}
// the heights at a grid of points, a few hundred to a request, four requests at a time
async function heights(pts, progress) {
  const out = new Array(pts.length), N = 280, jobs = [];
  for (let i = 0; i < pts.length; i += N) jobs.push(i);
  let done = 0;
  const one = async i => { const p = pts.slice(i, i + N);
    const url = `${ALT}?lon=${p.map(q => q[0].toFixed(6)).join("|")}&lat=${p.map(q => q[1].toFixed(6)).join("|")}&resource=ign_rge_alti_wld&zonly=true`;
    let r; for (let k = 0; k < 2; k++) { try { r = await (await fetch(url)).json(); break; } catch (e) { if (k) throw e; await new Promise(z => setTimeout(z, 700)); } }
    (r.elevations || []).forEach((v, j) => { out[i + j] = v > -9000 ? v : NaN; }); progress(++done / jobs.length); };
  const q = jobs.slice(); await Promise.all(Array.from({ length: 4 }, async () => { while (q.length) await one(q.shift()); }));
  return out;
}

async function open(o) {
  const U = ui(); S = null;
  U.d.hidden = false; document.body.classList.add("t3d-on"); U.title.textContent = o.title || ""; texts();
  const g = U.cv.getContext("2d"); g.clearRect(0, 0, U.cv.width, U.cv.height);
  U.st.textContent = t("Fetching the ground…"); U.st.hidden = false;
  const [x, y, w, h] = o.view, NX = 48, NY = Math.max(20, Math.min(64, Math.round(48 * h / w)));
  // the view's size in metres (from its corners' longitude and latitude), for the heights to be to scale
  const d2r = Math.PI / 180, ll = o.toLL, a = ll(x, y), b = ll(x + w, y), c = ll(x, y + h);
  const mx = Math.hypot((b[0] - a[0]) * Math.cos(a[1] * d2r), b[1] - a[1]) * 111320, my = Math.hypot((c[0] - a[0]) * Math.cos(a[1] * d2r), c[1] - a[1]) * 111320;
  const pts = []; for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) pts.push(ll(x + w * i / NX, y + h * j / NY));
  let z, pic;
  try { [z, pic] = await Promise.all([heights(pts, f => { U.st.textContent = t("Fetching the ground… {0} %", Math.round(f * 100)); }), picture(o.svg, o.view, 960, [NX * SUB, NY * SUB])]); }
  catch (e) { U.st.textContent = t("Couldn't fetch the ground just now. Check the connection and try again."); return; }
  if (U.d.hidden) return; // closed meanwhile
  const ok = z.filter(v => !isNaN(v)); if (ok.length < pts.length * .5) { U.st.textContent = t("IGN has no heights here: the 3D view is for France."); return; }
  const lo = Math.min(...ok), hi = Math.max(...ok);
  for (let i = 0; i < z.length; i++) if (isNaN(z[i])) z[i] = lo; // the sea, or a gap: flat at the lowest
  // the map's labels, where they are on the ground
  const root = o.svg.getScreenCTM().inverse(), labels = [];
  if (o.labels) o.svg.querySelectorAll(o.labels).forEach(el => { if (!el.textContent.trim() || getComputedStyle(el).display === "none") return;
    const bb = el.getBBox(), m = el.getScreenCTM(); if (!m) return;
    const p = new DOMPoint(bb.x + bb.width / 2, bb.y + bb.height / 2).matrixTransform(m).matrixTransform(root);
    if (p.x < x || p.y < y || p.x > x + w || p.y > y + h) return;
    // a name on two lines is two tspans: rejoined with a space
    const txt = el.querySelector("tspan") ? [...el.querySelectorAll("tspan")].map(t => t.textContent.trim()).join(" ") : el.textContent.trim();
    labels.push({ u: (p.x - x) / w, v: (p.y - y) / h, s: txt, big: /\bGC\b/.test(el.getAttribute("class") || "") }); });
  // enough lift for the slopes to read: the highest point about a thirteenth of the view's size above the lowest
  const ex = Math.max(1.5, Math.min(10, Math.round(Math.max(mx, my) / 13 / Math.max(20, hi - lo) * 2) / 2)); U.ex.value = ex;
  S = { NX, NY, z, lo, hi, mx, my, pic, labels, credit: o.credit || "", ex, yaw: 0, pitch: 1.5, zoom: 1, auto: true };
  U.st.hidden = true; texts(); draw(); tiltTo(.68);
}
function tiltTo(p) {
  if (!S) return; if (still()) { S.pitch = p; return draw(); }
  const p0 = S.pitch, t0 = performance.now(), ms = 900, s = S;
  const step = now => { if (S !== s) return; const k = Math.min(1, (now - t0) / ms), e = k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2; S.pitch = p0 + (p - p0) * e; draw(); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
// painter's algorithm: every cell a shaded quad, the farthest first
function draw() {
  if (!S) return;
  const cv = UI.cv, dpr = devicePixelRatio || 1, Wc = cv.clientWidth, Hc = cv.clientHeight;
  if (cv.width !== Math.round(Wc * dpr) || cv.height !== Math.round(Hc * dpr)) { cv.width = Math.round(Wc * dpr); cv.height = Math.round(Hc * dpr); }
  const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, Wc, Hc);
  const { NX, NY, z, lo, mx, my, pic, ex } = S, size = Math.max(mx, my);
  const cy = Math.cos(S.yaw), sy = Math.sin(S.yaw), cp = Math.cos(S.pitch), sp = Math.sin(S.pitch);
  const scale = Math.min(Wc, Hc) * .9 * S.zoom / size, cxs = Wc / 2, cys = Hc * .52;
  const P = (i, j, hgt) => { const X = (i / NX - .5) * mx, Y = (j / NY - .5) * my, Z = (hgt - lo) * ex;
    const rx = X * cy - Y * sy, ry = X * sy + Y * cy; // turn on the ground
    // tilt: pitch π/2 looks straight down; lower, the eye is to the south and above, so the north and the low are farther
    const sy2 = ry * sp - Z * cp, depth = -ry * cp - Z * sp;
    const f = 1 / (1 + depth / (size * 3.2)); return [cxs + rx * scale * f, cys + sy2 * scale * f, depth]; };
  const at = (u, v) => { const fi = Math.min(NX, Math.max(0, u * NX)), fj = Math.min(NY, Math.max(0, v * NY)), i = Math.min(NX - 1, fi | 0), j = Math.min(NY - 1, fj | 0), s = fi - i, r = fj - j, k = j * (NX + 1) + i;
    return z[k] * (1 - s) * (1 - r) + z[k + 1] * s * (1 - r) + z[k + NX + 1] * (1 - s) * r + z[k + NX + 2] * s * r; };
  const MX = NX * SUB, MY = NY * SUB, hz = new Float32Array((MX + 1) * (MY + 1)), pts = new Array((MX + 1) * (MY + 1));
  for (let j = 0; j <= MY; j++) for (let i = 0; i <= MX; i++) { const hh = at(i / MX, j / MY); hz[j * (MX + 1) + i] = hh; pts[j * (MX + 1) + i] = P(i / SUB, j / SUB, hh); }
  const cells = [], cw = mx / MX, ch = my / MY;
  for (let j = 0; j < MY; j++) for (let i = 0; i < MX; i++) {
    const k = j * (MX + 1) + i, a = pts[k], b = pts[k + 1], c = pts[k + MX + 2], d = pts[k + MX + 1];
    // the ground's normal (-dz/dx, -dz/dy, 1) against a light from the north-west, fairly low (x east, y south, z up)
    const dzx = ((hz[k + 1] + hz[k + MX + 2]) - (hz[k] + hz[k + MX + 1])) / 2 * ex / cw, dzy = ((hz[k + MX + 1] + hz[k + MX + 2]) - (hz[k] + hz[k + 1])) / 2 * ex / ch;
    const n = Math.hypot(dzx, dzy, 1), dot = (dzx * .55 + dzy * .55 + .63) / n, lit = .66 + .46 * Math.max(0, dot);
    const o = (Math.min(pic.H - 1, j) * pic.W + Math.min(pic.W - 1, i)) * 4;
    cells.push({ q: [a, b, c, d], d: (a[2] + b[2] + c[2] + d[2]) / 4, r: pic.data[o] * lit, g: pic.data[o + 1] * lit, b: pic.data[o + 2] * lit });
  }
  // the block's four sides, down to below the lowest point: earth-coloured, the sunlit ones lighter
  const base = lo - (S.hi - lo) * .25 - Math.max(mx, my) * .012 / ex;
  const side = (list, shade) => { for (let s2 = 0; s2 < list.length - 1; s2++) { const [i1, j1] = list[s2], [i2, j2] = list[s2 + 1];
    const t1 = pts[j1 * (MX + 1) + i1], t2 = pts[j2 * (MX + 1) + i2], b1 = P(i1 / SUB, j1 / SUB, base), b2 = P(i2 / SUB, j2 / SUB, base);
    cells.push({ q: [t1, t2, b2, b1], d: (t1[2] + t2[2] + b1[2] + b2[2]) / 4 + 1e-3, r: 128 * shade, g: 104 * shade, b: 88 * shade }); } };
  const edge = (f, n) => Array.from({ length: n + 1 }, (_, k) => f(k));
  side(edge(k => [k, MY], MX), 1); side(edge(k => [MX, k], MY), .85); side(edge(k => [k, 0], MX), .7); side(edge(k => [0, k], MY), .78);
  // painter's algorithm: the farthest first
  cells.sort((p, q) => q.d - p.d);
  g.lineJoin = "round";
  for (const c of cells) { const col = `rgb(${c.r | 0},${c.g | 0},${c.b | 0})`; g.beginPath(); c.q.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath();
    g.fillStyle = col; g.strokeStyle = col; g.lineWidth = .7; g.fill(); g.stroke(); }
  // the names, nearest drawn last
  const ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#2A2126", halo = getComputedStyle(document.documentElement).getPropertyValue("--halo").trim() || "#fff";
  // until you zoom or turn it yourself, the block fills the screen (a tall region on a phone too)
  if (S.auto && !draw.again) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    const k = Math.min(Wc * .94 / (x1 - x0), (Hc - 150) / (y1 - y0 + 60)); if (Math.abs(k - 1) > .02) { S.zoom = Math.max(.5, Math.min(4, S.zoom * k)); draw.again = true; draw(); draw.again = false; return; } }
  // the grands crus first, then the nearest; a name that would overlap one already placed is left out
  const placed = [], list = S.labels.map(l => ({ l, p: P(l.u * NX, l.v * NY, at(l.u, l.v)) })).sort((p, q) => (q.l.big - p.l.big) || (p.p[2] - q.p[2]));
  g.textAlign = "center"; g.lineWidth = 3.5; g.strokeStyle = halo; g.fillStyle = ink;
  for (const { l, p } of list) {
    g.font = `${l.big ? "600 14px" : "600 12px"} ${l.big ? '"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif' : "system-ui,-apple-system,sans-serif"}`;
    const wd = g.measureText(l.s).width, box = [p[0] - wd / 2 - 3, p[1] - 18, p[0] + wd / 2 + 3, p[1]];
    if (box[2] < 0 || box[0] > Wc || box[3] < 0 || box[1] > Hc || placed.some(b => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) continue;
    placed.push(box); g.strokeText(l.s, p[0], p[1] - 4); g.fillText(l.s, p[0], p[1] - 4); }
}
window.TERRAIN3D = { open, close };
})();
