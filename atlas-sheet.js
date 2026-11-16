// The atlas's sheets on a phone, fetched by atlas.js once the atlas is up (a classic script on atlas.js's shared
// scope: $, st, select, closePanels, PHONE). The vineyard's details and the panels are sheets with a handle, and the
// handle works as it looks: drag down (from the handle, or from anywhere while the sheet is scrolled to its top) and it
// follows the finger, and closes if let go far enough down or flicked; drag the details' handle up and they take most
// of the screen (down again, back).
"use strict";
(() => {
  let d = null;
  const sheets = () => [$("sideWrap"), $("stylePanel"), $("menuPanel")];
  const closeIt = el => { if (el.id === "sideWrap") { document.body.classList.remove("side-open"); el.classList.remove("tall"); if (st.sel) select(null); } else closePanels(); };
  addEventListener("touchstart", e => {
    if (!PHONE.matches || e.touches.length !== 1) return;
    const el = sheets().find(x => x && x.contains(e.target)); if (!el || (el.id !== "sideWrap" ? el.hidden : !document.body.classList.contains("side-open"))) return;
    if (e.target.closest("input, select, textarea")) return; // a field gets the touch
    const t = e.touches[0], top = t.clientY - el.getBoundingClientRect().top;
    if (top > 48 && el.scrollTop > 0) return; // scrolled down inside: the touch scrolls
    d = { el, y0: t.clientY, x0: t.clientX, dy: 0, on: false, handle: top <= 48, pts: [[Date.now(), 0]] };
  }, { passive: true });
  addEventListener("touchmove", e => {
    if (!d) return; const t = e.touches[0], dy = t.clientY - d.y0, dx = t.clientX - d.x0;
    if (!d.on) {
      if (Math.abs(dy) < 8) return;
      // sideways, or up anywhere but the details' handle, or a scroll inside a sheet scrolled down: not a drag
      if (Math.abs(dx) > Math.abs(dy) || (dy < 0 && !(d.handle && d.el.id === "sideWrap")) || (!d.handle && d.el.scrollTop > 0)) { d = null; return; }
      d.on = true; d.el.style.transition = "none"; d.el.style.animation = "none";
    }
    d.dy = dy; if (dy > 0) d.el.style.transform = `translateY(${dy}px)`;
    d.pts.push([Date.now(), dy]); if (d.pts.length > 8) d.pts.shift();
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  const end = () => {
    if (!d) return; const x = d; d = null; if (!x.on) return;
    const el = x.el, now = Date.now(), p0 = x.pts.find(q => now - q[0] <= 120) || x.pts[x.pts.length - 1];
    const fast = (x.dy - p0[1]) / Math.max(16, now - p0[0]) > .5, far = x.dy > Math.min(120, el.offsetHeight * .25);
    el.style.transition = "transform .22s cubic-bezier(.2,.8,.2,1)";
    const reset = () => { el.style.transform = el.style.transition = el.style.animation = ""; };
    if (x.dy < -30) { el.classList.add("tall"); reset(); return; } // up: most of the screen
    if (el.classList.contains("tall") && !far && x.dy > 30) { el.classList.remove("tall"); reset(); return; } // down a little: back
    if (far || (fast && x.dy > 40)) { el.style.transform = "translateY(105%)"; setTimeout(() => { closeIt(el); reset(); }, 200); return; }
    el.style.transform = "translateY(0)"; setTimeout(reset, 240);
  };
  addEventListener("touchend", end); addEventListener("touchcancel", end);
})();
