// AllWine's API gateway: a Cloudflare Worker between the site and the Apps Script web app (apps-script/Code.gs).
// Apps Script never sees who is calling, and has a small budget of requests at a time, so this does what it can't:
//   · limits per IP address: every request, and stricter for logging in, signing up and recovery;
//   · a Cloudflare Turnstile check ("are you human") on sign-up and recovery, when TURNSTILE_SECRET is set;
//   · only answers browsers on the site's own address (ALLOWED_ORIGINS), and only POSTs of at most 12 MB;
//   · adds GATEWAY_SECRET to each request, so Code.gs (with the same secret in Settings.gs) refuses anything that
//     didn't come through here. The Apps Script URL itself is kept only here (API_URL), not on the site.
//
// Settings (Cloudflare dashboard → the Worker → Settings → Variables and secrets, or wrangler.toml / `wrangler secret`):
//   API_URL           secret  the Apps Script web app URL (…/exec)
//   GATEWAY_SECRET    secret  a long random value; the same in Settings.gs
//   TURNSTILE_SECRET  secret  optional: the Turnstile widget's secret key
//   ALLOWED_ORIGINS   text    optional: comma-separated, default https://allwine.dk,https://www.allwine.dk
// Rate limiting bindings LIMIT_ALL and LIMIT_AUTH (wrangler.toml) are used when present; without them a counter in
// the Worker's memory does the same job less exactly (each Cloudflare location and instance counts on its own).

const MAX_BODY = 12000000;                                        // as REQUEST_MAX in Code.gs
const LIMITS = { all: [120, 60], auth: [10, 60] };                // [requests, seconds] per IP, as in wrangler.toml
const AUTH_ACTIONS = new Set(["prelogin", "login", "signup", "recoverstart", "recover"]);
const HUMAN_ACTIONS = new Set(["signup", "recover"]);             // the ones that create or take over an account
const DEFAULT_ORIGINS = "https://allwine.dk,https://www.allwine.dk";

// the fallback limiter: a fixed window per key, in this instance's memory
const memory = new Map();
function memoryLimit(key, [max, seconds], now) {
  if (memory.size > 5000) for (const [k, v] of memory) if (v.until <= now) memory.delete(k);
  let w = memory.get(key);
  if (!w || w.until <= now) { w = { n: 0, until: now + seconds * 1000 }; memory.set(key, w); }
  return ++w.n <= max;
}
async function allowed(env, kind, ip, now) {
  const binding = kind === "auth" ? env.LIMIT_AUTH : env.LIMIT_ALL, key = kind + ":" + ip;
  if (binding && typeof binding.limit === "function") {
    try { return (await binding.limit({ key })).success; } catch (e) { /* fall through to the memory counter */ }
  }
  return memoryLimit(key, LIMITS[kind], now);
}

function corsHeaders(origin) {
  return origin ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400", "Vary": "Origin" } : { "Vary": "Origin" };
}
const reply = (status, body, origin, extra) => new Response(typeof body === "string" ? body : JSON.stringify(body), {
  status, headers: { "Content-Type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json", ...corsHeaders(origin), ...(extra || {}) } });

async function human(env, token, ip) {
  if (!token) return false;
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET); form.append("response", String(token)); if (ip) form.append("remoteip", ip);
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    return !!(await r.json()).success;
  } catch (e) { return false; }
}

export default {
  async fetch(request, env, ctx, now = Date.now()) {
    const origins = String(env.ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(",").map(s => s.trim()).filter(Boolean);
    const origin = request.headers.get("Origin");
    const okOrigin = origin && origins.includes(origin) ? origin : null;
    if (origin && !okOrigin) return reply(403, { ok: false, error: "origin" }, null);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(okOrigin) });
    if (request.method === "GET") return reply(200, "AllWine API gateway", okOrigin);
    if (request.method !== "POST") return reply(405, { ok: false, error: "method" }, okOrigin, { "Allow": "POST, OPTIONS" });
    if (!env.API_URL || !env.GATEWAY_SECRET) return reply(500, { ok: false, error: "gateway-setup" }, okOrigin);

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (!(await allowed(env, "all", ip, now))) return reply(429, { ok: false, error: "too-many" }, okOrigin, { "Retry-After": "60" });
    if (Number(request.headers.get("Content-Length") || 0) > MAX_BODY) return reply(413, { ok: false, error: "too-big" }, okOrigin);
    const body = await request.text();
    if (body.length > MAX_BODY) return reply(413, { ok: false, error: "too-big" }, okOrigin);
    let p; try { p = JSON.parse(body); } catch (e) { p = null; }
    if (!p || typeof p !== "object" || Array.isArray(p)) return reply(400, { ok: false, error: "bad-request" }, okOrigin);

    const action = String(p.action || "");
    if (AUTH_ACTIONS.has(action) && !(await allowed(env, "auth", ip, now)))
      return reply(429, { ok: false, error: "too-many" }, okOrigin, { "Retry-After": "60" });
    const token = p.turnstile; delete p.turnstile;
    if (env.TURNSTILE_SECRET && HUMAN_ACTIONS.has(action) && !(await human(env, token, ip)))
      return reply(200, { ok: false, error: "human-check" }, okOrigin);

    delete p._gw; p._gw = env.GATEWAY_SECRET; // whatever the caller sent in its place is dropped
    let upstream;
    try {
      upstream = await fetch(env.API_URL, { method: "POST", body: JSON.stringify(p), redirect: "follow",
        headers: { "Content-Type": "text/plain; charset=utf-8" } });
    } catch (e) { return reply(502, { ok: false, error: "upstream" }, okOrigin); }
    const text = await upstream.text();
    if (!upstream.ok || !/^\s*\{/.test(text)) return reply(502, { ok: false, error: "upstream" }, okOrigin);
    return reply(200, text, okOrigin, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  },
};
