/**
 * rpj-relay: the one small server behind BIG RPJ's apps.
 *
 * What it does
 *   POST /ai          -> forwards a prompt to Anthropic's API using the key stored here, returns {text}
 *   GET  /data?k=...  -> reads one saved app document from Cloudflare KV
 *   PUT  /data?k=...  -> saves one app document to Cloudflare KV
 *
 * Security
 *   - The Anthropic key lives ONLY here, as an encrypted Worker secret (ANTHROPIC_API_KEY). No page ever sees it.
 *   - Every request must carry the app passcode (secret APP_PASS) in the X-App-Pass header.
 *   - Browsers are only allowed to call it from ALLOWED_ORIGIN (your GitHub Pages site).
 *   - Model, output length and request size are capped so a bug can't run up a big bill.
 *
 * Setup (Cloudflare dashboard)
 *   Secrets:   ANTHROPIC_API_KEY, APP_PASS
 *   Variable:  ALLOWED_ORIGIN = https://rob23238.github.io
 *   KV binding: DATA  -> a KV namespace (e.g. "rpj-data")
 */
const MODELS = { quick: "claude-haiku-5-5", default: "claude-sonnet-5-5", complex: "claude-opus-5-5" };
const MAX_OUT = 2000;          // max tokens per answer
const MAX_BODY = 200_000;      // max request size for /ai (bytes)
const MAX_DOC = 1_000_000;     // max saved document size (bytes)
const KEY_RE = /^[A-Za-z0-9:_\-\/.]{1,160}$/;

function cors(env, origin) {
  const ok = origin && origin === (env.ALLOWED_ORIGIN || "");
  return {
    "Access-Control-Allow-Origin": ok ? origin : "null",
    "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type, x-app-pass",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
const json = (obj, status, headers) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", ...headers } });

// constant-time string compare so the passcode can't be guessed by timing
function same(a, b) {
  a = String(a || ""); b = String(b || "");
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const h = cors(env, origin);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
    if (origin !== env.ALLOWED_ORIGIN) return json({ error: "origin_not_allowed" }, 403, h);
    if (!env.APP_PASS || !same(req.headers.get("x-app-pass"), env.APP_PASS)) return json({ error: "bad_passcode" }, 401, h);

    const url = new URL(req.url);

    if (url.pathname === "/ai" && req.method === "POST") {
      const raw = await req.text();
      if (raw.length > MAX_BODY) return json({ error: "too_large" }, 413, h);
      let body; try { body = JSON.parse(raw); } catch { return json({ error: "bad_json" }, 400, h); }
      let messages = body.messages;
      if (typeof body.prompt === "string") messages = [{ role: "user", content: body.prompt }];
      if (!Array.isArray(messages) || !messages.length) return json({ error: "no_messages" }, 400, h);
      messages = messages
        .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
        .slice(-20);
      const model = MODELS[body.tier] || MODELS.default;
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model, max_tokens: Math.min(+body.max_tokens || 1500, MAX_OUT), messages }),
      });
      if (r.status === 429) return json({ error: "rate_limited" }, 429, h);
      if (!r.ok) return json({ error: "upstream_" + r.status }, 502, h);
      const d = await r.json();
      const text = (d.content || []).map(c => c.text || "").join("");
      return json({ text, truncated: d.stop_reason === "max_tokens" }, 200, h);
    }

    if (url.pathname === "/data") {
      const k = url.searchParams.get("k") || "";
      if (!KEY_RE.test(k)) return json({ error: "bad_key" }, 400, h);
      if (req.method === "GET") {
        const v = await env.DATA.get(k);
        return json({ exists: v != null, data: v != null ? JSON.parse(v) : null }, 200, h);
      }
      if (req.method === "PUT") {
        const raw = await req.text();
        if (raw.length > MAX_DOC) return json({ error: "too_large" }, 413, h);
        try { JSON.parse(raw); } catch { return json({ error: "bad_json" }, 400, h); }
        await env.DATA.put(k, raw);
        return json({ ok: true }, 200, h);
      }
    }
    return json({ error: "not_found" }, 404, h);
  },
};
