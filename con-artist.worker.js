/**
 * con-artist.rulathemtodos.workers.dev — Cloudflare Worker (Gateway for gabo.services)
 *
 * PURPOSE
 * - Repo (gabo.services) -> con-artist: CORS + Origin allowlist + per-origin asset identity (x-ops-asset-id)
 * - Repo handshake: POST /__repo/handshake with header x-gabo-repo-id matching env.CON_ARTIST_SERVICES
 * - Iframe UI: GET /embed?parent=<origin> (STRICT allowed parents: www.gabo.services + gabo.services)
 * - Chat: POST /api/chat (SSE) -> forwards to Service Binding DRASTIC (SSE pass-through)
 *
 * IMPORTANT
 * - This Worker MUST NOT mention or reference any downstream internal components in RESPONSES.
 *
 * ENV (ONLY what you have in your Cloudflare picture)
 * - Secrets:
 *   - CON_ARTIST_Drastic
 *   - CON_ARTIST_SERVICES
 *   - CON_ARTIST_TO_CORE_SHARED_SECRET
 * - Plaintext:
 *   - CON_ARTIST_PUBLIC_ORIGIN
 * - JSON:
 *   - ORIGIN_ASSET_ID_JSON
 * - Service binding:
 *   - DRASTIC
 */

/* -------------------------
 * HARD FALLBACK (never empty)
 * (kept)
 * ------------------------- */
const FALLBACK_ALLOWED_ORIGINS = [
  "https://www.gabo.services",
  "https://gabo.services",
  "https://chattiavato-a11y.github.io",
  "https://con-artist.rulathemtodos.workers.dev",
];

const FALLBACK_ORIGIN_TO_ASSET = {
  "https://www.gabo.services":
    "b91f605b23748de5cf02db0de2dd59117b31c709986a3c72837d0af8756473cf2779c206fc6ef80a57fdeddefa4ea11b972572f3a8edd9ed77900f9385e94bd6",
  "https://gabo.services":
    "8cdeef86bd180277d5b080d571ad8e6dbad9595f408b58475faaa3161f07448fbf12799ee199e3ee257405b75de555055fd5f43e0ce75e0740c4dc11bf86d132",
  "https://chattiavato-a11y.github.io":
    "b8f12ffa3559cee4ac71cb5f54eba1aed46394027f52e562d20be7a523db2a036f20c6e8fb0577c0a8d58f2fd198046230ebc0a73f4f1e71ff7c377d656f0756",
  "https://con-artist.rulathemtodos.workers.dev":
    "96dd27ea493d045ed9b46d72533e2ed2ec897668e2227dd3d79fff85ca2216a569c4bf622790c6fb0aab9f17b4e92d0f8e0fa040356bee68a9c3d50d5a60c945",
};

/* -------------------------
 * Contract constants
 * ------------------------- */
const REPO_SECRET_HEADER = "x-gabo-repo-id";
const REPO_HANDSHAKE_PATH = "/__repo/handshake";

const ROUTES = {
  chat: "/api/chat",
  health: "/health",
  api_health: "/api/health",
  embed: "/embed",
};

const ASSET_HDR_DEFAULT = "x-ops-asset-id";

// iframe tenant header (sent by iframe JS; also allowed for direct callers)
const PARENT_HDR = "x-gabo-parent-origin";

// internal auth headers expected by drastic-measures gateway
const CON_ARTIST_HOP_HDR = "x-con-artist-hop";
const CON_ARTIST_HOP_VAL = "iframe-gateway";
const CON_ARTIST_SECRET_HDR = "x-con-artist-shared-secret";
const CON_ARTIST_MODE_IFRAME_SERVICE_QA = "iframe_service_qa";

const HOP_HDR_DEFAULT = "x-gabo-hop";
const HOP_VAL_DEFAULT = "gateway";

/* -------------------------
 * STRICT embed parents (NO ENV)
 * ------------------------- */
const STRICT_ALLOWED_PARENTS = new Set(["https://www.gabo.services", "https://gabo.services"]);

/* -------------------------
 * Utils
 * ------------------------- */
function toStr(x) {
  return typeof x === "string" ? x : x == null ? "" : String(x);
}

function safeTextOnly(s) {
  s = toStr(s);
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0) continue;
    const ok = c === 9 || c === 10 || c === 13 || (c >= 32 && c <= 126) || c >= 160;
    if (ok) out += s[i];
  }
  return out.trim();
}

function normalizeOrigin(value) {
  const v = toStr(value).trim();
  if (!v) return "";
  try {
    return new URL(v).origin.toLowerCase();
  } catch {
    return v.replace(/\/$/, "").toLowerCase();
  }
}

function normalizeRoutePath(value, fallback) {
  const raw = safeTextOnly(value || fallback || "");
  if (!raw) return "";
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function timingSafeEq(a, b) {
  const x = toStr(a);
  const y = toStr(b);
  if (x.length !== y.length) return false;
  let out = 0;
  for (let i = 0; i < x.length; i++) out |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return out === 0;
}

/* -------------------------
 * Config loader (env.ORIGIN_ASSET_ID_JSON)
 * Accepts:
 *  A) full JSON config (your ORIGIN_ASSET_ID_JSON)
 *  B) plain origin_to_asset_id map (supported, but not required)
 * Always prevents empty allowlist.
 * ------------------------- */
let _CFG = null;

function parseEnvJson(env) {
  const v = env?.ORIGIN_ASSET_ID_JSON;
  if (!v) return null;
  if (typeof v === "object") return v;
  try {
    return JSON.parse(String(v));
  } catch {
    return null;
  }
}

function buildCfg(env) {
  if (_CFG) return _CFG;

  const raw = parseEnvJson(env);

  const cfg0 =
    raw && typeof raw === "object" && !raw.asset_identity && !raw.allowedOrigins
      ? { asset_identity: { header_name: ASSET_HDR_DEFAULT, origin_to_asset_id: raw } }
      : raw && typeof raw === "object"
        ? raw
        : {};

  const routes = {
    chat: normalizeRoutePath(cfg0?.routes?.chat, ROUTES.chat),
    health: normalizeRoutePath(cfg0?.routes?.health, ROUTES.health),
    api_health: ROUTES.api_health,
    embed: ROUTES.embed,
  };

  const assetHeader = safeTextOnly(cfg0?.asset_identity?.header_name || ASSET_HDR_DEFAULT).toLowerCase();

  // Map: env map overlays fallback map
  const originToAsset = { ...FALLBACK_ORIGIN_TO_ASSET };
  const map =
    cfg0?.asset_identity?.origin_to_asset_id && typeof cfg0.asset_identity.origin_to_asset_id === "object"
      ? cfg0.asset_identity.origin_to_asset_id
      : {};
  for (const [k, v] of Object.entries(map)) {
    const o = normalizeOrigin(k);
    const id = safeTextOnly(v);
    if (o && id) originToAsset[o] = id;
  }

  // Allowed origins: config.allowedOrigins OR keys(originToAsset) OR fallback list
  let allowedList = Array.isArray(cfg0.allowedOrigins) ? cfg0.allowedOrigins : [];
  if (!allowedList.length) allowedList = Object.keys(originToAsset);
  if (!allowedList.length) allowedList = FALLBACK_ALLOWED_ORIGINS;

  const allowedOrigins = new Set(allowedList.map(normalizeOrigin).filter(Boolean));
  if (!allowedOrigins.size) {
    for (const o of FALLBACK_ALLOWED_ORIGINS) allowedOrigins.add(normalizeOrigin(o));
  }

  // Allowed parents for iframe embedding: STRICT only (NO ENV)
  const allowedParents = new Set([...STRICT_ALLOWED_PARENTS].map(normalizeOrigin));

  const limits = {
    max_body_chars: Number(cfg0?.limits?.max_body_chars || 8000),
    max_messages: Number(cfg0?.limits?.max_messages || 30),
    max_message_chars: Number(cfg0?.limits?.max_message_chars || 1000),
  };

  const publicOrigin = normalizeOrigin(env?.CON_ARTIST_PUBLIC_ORIGIN || "https://con-artist.rulathemtodos.workers.dev");

  _CFG = {
    cfg_source: raw ? "env" : "fallback",
    routes,
    assetHeader,
    allowedOrigins,
    allowedParents,
    originToAsset,
    limits,
    publicOrigin,
  };

  return _CFG;
}

/* -------------------------
 * Security headers
 * ------------------------- */
const STANDARD_CSP =
  "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; " +
  "script-src 'self' https://www.gabo.services https://gabo.services https://challenges.cloudflare.com https://static.cloudflareinsights.com; " +
  "script-src-elem 'self' https://www.gabo.services https://gabo.services https://challenges.cloudflare.com https://static.cloudflareinsights.com; " +
  "style-src 'self'; img-src 'self' data: https:; connect-src 'self' https://www.gabo.services https://gabo.services https://con-artist.rulathemtodos.workers.dev https://solitary-term-4203.rulathemtodos.workers.dev https://challenges.cloudflare.com https://cloudflareinsights.com https://static.cloudflareinsights.com; " +
  "frame-src https://con-artist.rulathemtodos.workers.dev https://solitary-term-4203.rulathemtodos.workers.dev https://challenges.cloudflare.com https://www.youtube-nocookie.com; " +
  "font-src 'self' data:; media-src 'self'; manifest-src 'self'; worker-src 'self'; upgrade-insecure-requests; block-all-mixed-content";

const STANDARD_CSP_REPORT_ONLY = STANDARD_CSP;
const STANDARD_PERMISSIONS_POLICY =
  "geolocation=(), camera=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=(), microphone=(), browsing-topics=(), interest-cohort=()";

function applyRouteSpecificHeaders(headers, pathname) {
  const path = normalizeRoutePath(pathname || "", "");
  if (!path) return headers;

  if (path.startsWith("/assets/")) {
    headers.set("Access-Control-Allow-Origin", "https://www.gabo.services");
    headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    headers.set("Vary", "Origin");
  }

  if (path === "/sitemap.xml") {
    headers.set("Content-Type", "application/xml; charset=utf-8");
  }

  if (path === "/robots.txt") {
    headers.set("Content-Type", "text/plain; charset=utf-8");
  }

  return headers;
}

function applyCommonSecurityHeaders(headers, { pathname = "", xFrameOptions = "DENY", csp = STANDARD_CSP, cspReportOnly = STANDARD_CSP_REPORT_ONLY } = {}) {
  headers.set("Content-Security-Policy", csp);
  headers.set("Content-Security-Policy-Report-Only", cspReportOnly);
  headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Robots-Tag", "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Permissions-Policy", STANDARD_PERMISSIONS_POLICY);
  headers.set("X-XSS-Protection", "0");
  headers.set("X-Permitted-Cross-Domain-Policies", "none");
  headers.set("Cache-Control", "no-store, no-transform");

  if (xFrameOptions) headers.set("X-Frame-Options", xFrameOptions);
  else headers.delete("X-Frame-Options");

  applyRouteSpecificHeaders(headers, pathname);
  return headers;
}

function securityHeadersApi(pathname = "") {
  return applyCommonSecurityHeaders(new Headers(), { pathname });
}

function makeNonce() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  let s = "";
  for (const b of a) s += b.toString(16).padStart(2, "0");
  return s;
}

function embedSecurityHeaders(frameAncestorsList, nonce, pathname = ROUTES.embed) {
  const fa = frameAncestorsList.length ? frameAncestorsList.join(" ") : "'none'";
  const embedCsp =
    "default-src 'self'; base-uri 'self'; object-src 'none'; form-action 'self'; " +
    `script-src 'self' 'nonce-${nonce}'; script-src-elem 'self' 'nonce-${nonce}'; style-src 'self' 'nonce-${nonce}'; ` +
    "img-src 'self' data: https:; connect-src 'self' https://www.gabo.services https://gabo.services https://con-artist.rulathemtodos.workers.dev https://solitary-term-4203.rulathemtodos.workers.dev https://challenges.cloudflare.com https://cloudflareinsights.com https://static.cloudflareinsights.com; " +
    "frame-src https://con-artist.rulathemtodos.workers.dev https://solitary-term-4203.rulathemtodos.workers.dev https://challenges.cloudflare.com https://www.youtube-nocookie.com; " +
    "font-src 'self' data:; media-src 'self'; manifest-src 'self'; worker-src 'self'; " +
    `frame-ancestors ${fa}; upgrade-insecure-requests; block-all-mixed-content`;

  return applyCommonSecurityHeaders(new Headers(), {
    pathname,
    xFrameOptions: "",
    csp: embedCsp,
    cspReportOnly: embedCsp,
  });
}

/* -------------------------
 * CORS (reliable)
 * ------------------------- */
function isAllowedOrigin(cfg, origin) {
  const o = normalizeOrigin(origin);
  return !!o && o !== "null" && cfg.allowedOrigins.has(o);
}

function corsPreflightHeaders(cfg, request, origin, pathname = "") {
  const h = new Headers();
  const path = normalizeRoutePath(pathname || "", "");

  if (path.startsWith("/assets/")) {
    h.set("Access-Control-Allow-Origin", "https://www.gabo.services");
    h.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    h.set("Access-Control-Allow-Headers", "Content-Type");
    h.set("Vary", "Origin");
    h.set("Access-Control-Max-Age", "86400");
    return h;
  }

  const o = normalizeOrigin(origin);
  const allowed = isAllowedOrigin(cfg, o);

  if (allowed) {
    h.set("Access-Control-Allow-Origin", o);
    h.set("Vary", "Origin, Access-Control-Request-Method, Access-Control-Request-Headers");
  }

  h.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  const reqHdrs = request.headers.get("Access-Control-Request-Headers");
  if (reqHdrs && String(reqHdrs).trim()) h.set("Access-Control-Allow-Headers", String(reqHdrs));
  else {
    h.set(
      "Access-Control-Allow-Headers",
      [
        "content-type",
        "accept",
        "x-ops-asset-id",
        "x-gabo-repo-id",
        "x-gabo-parent-origin",
        "x-gabo-hop",
      ].join(", ")
    );
  }

  h.set("Access-Control-Max-Age", "86400");
  h.set("Access-Control-Expose-Headers", ["x-gabo-asset-verified", "x-gabo-cors-debug", "x-gabo-tenant-origin"].join(", "));

  h.set(
    "x-gabo-cors-debug",
    `ok;origin_${allowed ? "allowed" : "denied"};cfg=${cfg.cfg_source};n=${cfg.allowedOrigins.size}`
  );
  return h;
}

function corsResponseHeaders(cfg, origin, pathname = "") {
  const h = new Headers();
  const path = normalizeRoutePath(pathname || "", "");

  if (path.startsWith("/assets/")) {
    h.set("Access-Control-Allow-Origin", "https://www.gabo.services");
    h.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    h.set("Access-Control-Allow-Headers", "Content-Type");
    h.set("Vary", "Origin");
    return h;
  }

  const o = normalizeOrigin(origin);
  const allowed = isAllowedOrigin(cfg, o);

  if (allowed) {
    h.set("Access-Control-Allow-Origin", o);
    h.set("Vary", "Origin");
  }

  h.set("Access-Control-Expose-Headers", ["x-gabo-asset-verified", "x-gabo-cors-debug", "x-gabo-tenant-origin"].join(", "));
  h.set(
    "x-gabo-cors-debug",
    `ok;origin_${allowed ? "allowed" : "denied"};cfg=${cfg.cfg_source};n=${cfg.allowedOrigins.size}`
  );
  return h;
}

function respondJson(cfg, origin, status, obj, extra, pathname = "") {
  const h = new Headers(extra || {});
  corsResponseHeaders(cfg, origin, pathname).forEach((v, k) => h.set(k, v));
  securityHeadersApi(pathname).forEach((v, k) => h.set(k, v));
  h.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(obj), { status, headers: h });
}

function respondSSE(cfg, origin, stream, extra, pathname = "") {
  const h = new Headers(extra || {});
  corsResponseHeaders(cfg, origin, pathname).forEach((v, k) => h.set(k, v));
  securityHeadersApi(pathname).forEach((v, k) => h.set(k, v));
  h.set("content-type", "text/event-stream; charset=utf-8");
  h.set("cache-control", "no-cache, no-transform");
  h.set("x-accel-buffering", "no");
  return new Response(stream, { status: 200, headers: h });
}

/* -------------------------
 * Repo handshake verification
 * (STRICT: only CON_ARTIST_SERVICES)
 * ------------------------- */
function verifyRepoSecret(request, env) {
  const expected = safeTextOnly(env?.CON_ARTIST_SERVICES || "");
  const got = safeTextOnly(request.headers.get(REPO_SECRET_HEADER) || "");
  if (!expected) return { ok: false, reason: "missing_worker_secret" };
  if (!got) return { ok: false, reason: "missing_header" };
  return timingSafeEq(got, expected) ? { ok: true } : { ok: false, reason: "bad_secret" };
}

/* -------------------------
 * Tenant resolution + asset verification
 * ------------------------- */
function resolveTenant(cfg, request) {
  const origin = normalizeOrigin(request.headers.get("Origin") || "");
  const parent = normalizeOrigin(request.headers.get(PARENT_HDR) || "");

  // If parent header is present, treat as iframe tenant signal.
  if (parent) {
    if (!cfg.allowedParents.has(parent)) return { ok: false, error: "parent_not_allowed", saw_parent: parent };
    if (!cfg.allowedOrigins.has(parent)) return { ok: false, error: "tenant_not_allowed", saw_tenant: parent };
    return { ok: true, tenantOrigin: parent, mode: "iframe" };
  }

  // Direct caller mode
  if (!origin) return { ok: false, error: "missing_origin" };
  if (!cfg.allowedOrigins.has(origin)) return { ok: false, error: "origin_not_allowed", saw_origin: origin };
  return { ok: true, tenantOrigin: origin, mode: "direct" };
}

function verifyTenantAsset(cfg, tenantOrigin, request) {
  const got =
    safeTextOnly(request.headers.get(cfg.assetHeader) || "") ||
    safeTextOnly(request.headers.get(ASSET_HDR_DEFAULT) || "") ||
    safeTextOnly(request.headers.get("X-Ops-Asset-Id") || "");
  const expected = safeTextOnly(cfg.originToAsset[tenantOrigin] || "");
  return { ok: !!expected && got === expected, got, expected };
}

/* -------------------------
 * TinyML sanitation (strict, light)
 * (kept)
 * ------------------------- */
function tinySanitize(text) {
  let out = toStr(text);
  out = out.replace(/\u0000/g, "");
  out = out.replace(/```[\s\S]*?```/g, " [REMOVED_CODE_BLOCK] ");
  out = out.replace(/~~~[\s\S]*?~~~/g, " [REMOVED_CODE_BLOCK] ");
  out = out.replace(/`[^`]{1,300}`/g, " [REMOVED_INLINE_CODE] ");
  out = out.replace(/<\s*(script|style)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, " ");
  out = out.replace(/<\s*(iframe|object|embed|svg|math|form|meta|link|base)\b[^>]*>/gi, " ");
  out = out.replace(/<\/?[^>]+>/g, " ");
  out = out.replace(/\bon\w+\s*=\s*["'][\s\S]*?["']/gi, " ");
  out = out.replace(/\bon\w+\s*=\s*[^\s>]+/gi, " ");
  out = out.replace(/\bjavascript\s*:/gi, "");
  out = out.replace(/\bvbscript\s*:/gi, "");
  out = out.replace(/\bdata\s*:\s*text\/html\b/gi, "");
  out = out.replace(/\b(eval|new\s+Function|setTimeout\s*\(|setInterval\s*\()\b/gi, " [REMOVED_JS_API] ");
  out = out.replace(/\b(import|export|function|class|const|let|var|return|await|async)\b/gi, " [REMOVED_CODE_TOKEN] ");
  out = out
    .split("\n")
    .map((line) => (/[{}\[\];=<>$]{5,}/.test(line) ? " [REMOVED_CODE_LINE] " : line))
    .join(" ");
  out = out.replace(/\s+/g, " ").trim();
  return out.slice(0, 1000);
}

function tinyRisk(text) {
  const t = toStr(text);
  const hits = [
    /<\s*script\b/i,
    /<\s*style\b/i,
    /<\s*iframe\b/i,
    /<\s*(svg|math|object|embed)\b/i,
    /\bon\w+\s*=/i,
    /\bjavascript\s*:/i,
    /\bvbscript\s*:/i,
    /\bdata\s*:\s*text\/html\b/i,
    /\beval\s*\(/i,
    /\bnew\s+Function\b/i,
    /\bdocument\.(cookie|write)\b/i,
    /\bunion\s+select\b/i,
    /\bdrop\s+table\b/i,
    /\bor\s+1\s*=\s*1\b/i,
    /\b(import|export|function|class|const|let|var|return|await|async)\b/i,
    /[{}\[\];=<>$]{8,}/,
  ].filter((re) => re.test(t)).length;
  return hits;
}

function tinyHasResidualMalicious(text) {
  const t = toStr(text);
  const checks = [
    /<\s*script\b/i,
    /\bon\w+\s*=/i,
    /\bjavascript\s*:/i,
    /\bvbscript\s*:/i,
    /\bdata\s*:\s*text\/html\b/i,
    /\beval\s*\(/i,
    /\bnew\s+Function\b/i,
    /\bdocument\.(cookie|write)\b/i,
    /<[^>]+>/,
  ];
  return checks.some((re) => re.test(t));
}

/* -------------------------
 * Service binding call (SSE pass-through)
 * (STRICT: only env.DRASTIC)
 * ------------------------- */
function requireUpstream(env) {
  const b = env?.DRASTIC;
  if (!b || typeof b.fetch !== "function") {
    throw new Error("Upstream unavailable");
  }
  return b;
}

function pickSharedSecret(env) {
  // STRICT: only the two secrets you have in the picture
  const a = safeTextOnly(env?.CON_ARTIST_Drastic || "");
  if (a) return a;
  const b = safeTextOnly(env?.CON_ARTIST_TO_CORE_SHARED_SECRET || "");
  if (b) return b;
  return "";
}

async function forwardChatUpstream(cfg, env, tenantOrigin, tenantAssetId, payload) {
  const upstream = requireUpstream(env);

  const sharedSecret = pickSharedSecret(env);
  if (!sharedSecret) throw new Error("Upstream unavailable");

  return upstream.fetch("https://drastic/api/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "text/event-stream",

      // Tenant identity forwarded
      Origin: tenantOrigin,
      [cfg.assetHeader]: tenantAssetId,

      // Required trust headers for drastic-measures verification
      [CON_ARTIST_HOP_HDR]: CON_ARTIST_HOP_VAL,
      [CON_ARTIST_SECRET_HDR]: sharedSecret,

      // Non-secret hop label (kept)
      [HOP_HDR_DEFAULT]: HOP_VAL_DEFAULT,
    },
    body: JSON.stringify(payload),
  });
}

async function safeUpstreamErrorCode(resp) {
  const t = await resp.text().catch(() => "");
  if (!t) return "";
  try {
    const obj = JSON.parse(t);
    const e = typeof obj?.error === "string" ? obj.error : "";
    const r = typeof obj?.reason === "string" ? obj.reason : "";
    const code = [e, r].filter(Boolean).join(":");
    return code.replace(/https?:\/\/\S+/g, "").slice(0, 80);
  } catch {
    return "";
  }
}

/* -------------------------
 * /embed HTML (simple, secure)
 * ------------------------- */
function embedHtml({ nonce, tenantOrigin, tenantAssetId }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Chat</title>
  <style nonce="${nonce}">
    :root { color-scheme: light; }

    html,
    body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      background: #ffffff;
      color: #111111;
      opacity: 1;
    }

    body {
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    }

    .wrap {
      display: grid;
      grid-template-rows: 1fr auto;
      width: 100%;
      height: 100vh;
      background: #ffffff;
      color: #111111;
      opacity: 1;
    }

    .log {
      padding: 12px;
      overflow: auto;
      background: #ffffff;
      color: #111111;
      opacity: 1;
    }

    .msg {
      margin: 8px 0;
      line-height: 1.35;
      color: #111111;
      opacity: 1;
    }

    .user {
      font-weight: 700;
      color: #111111;
      opacity: 1;
    }

    .bot {
      font-weight: 700;
      color: #111111;
      opacity: 1;
    }

    .bar {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      padding: 10px;
      border-top: 1px solid #eee;
      background: #ffffff;
      opacity: 1;
    }

    input {
      padding: 10px;
      border: 1px solid #ddd;
      border-radius: 10px;
      background: #ffffff;
      color: #111111;
      opacity: 1;
      outline: none;
    }

    input::placeholder {
      color: #666666;
      opacity: 1;
    }

    button {
      padding: 10px 14px;
      border: 0;
      border-radius: 10px;
      background: #111111;
      color: #ffffff;
      cursor: pointer;
      opacity: 1;
    }

    .bubble {
      white-space: pre-wrap;
      color: #111111;
      opacity: 1;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="log" id="log"></div>
    <div class="bar">
      <input id="q" placeholder="Ask a question…" autocomplete="off" />
      <button id="send">Send</button>
    </div>
  </div>

  <script nonce="${nonce}">
    const TENANT_ORIGIN = ${JSON.stringify(tenantOrigin)};
    const TENANT_ASSET_ID = ${JSON.stringify(tenantAssetId)};
    const log = document.getElementById('log');
    const q = document.getElementById('q');
    const send = document.getElementById('send');

    function add(label, text, cls) {
      const d = document.createElement('div');
      d.className = 'msg';
      d.innerHTML = '<span class="' + cls + '">' + label + ':</span> <span class="bubble"></span>';
      d.querySelector('.bubble').textContent = String(text || '');
      log.appendChild(d);
      log.scrollTop = log.scrollHeight;
      return d.querySelector('.bubble');
    }

    function parseSSE(block) {
      const lines = String(block || '').split('\n');
      let out = '';
      for (const line of lines) {
        if (line.startsWith('data:')) out += line.slice(5) + '\n';
      }
      return out;
    }

    async function ask(text) {
      add('user', text, 'user');
      const botBubble = add('bot', '', 'bot');

      const payload = {
        mode: ${JSON.stringify(CON_ARTIST_MODE_IFRAME_SERVICE_QA)},
        messages: [{ role: 'user', content: text }],
        meta: { tenant_origin: TENANT_ORIGIN }
      };

      const resp = await fetch(${JSON.stringify(ROUTES.chat)}, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept': 'text/event-stream',
          ${JSON.stringify(PARENT_HDR)}: TENANT_ORIGIN,
          ${JSON.stringify(ASSET_HDR_DEFAULT)}: TENANT_ASSET_ID
        },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        const t = await resp.text().catch(() => '');
        botBubble.textContent = 'Error: ' + resp.status + ' ' + t.slice(0, 240);
        return;
      }

      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += dec.decode(value, { stream: true });
        if (!buffer.includes('\n\n')) continue;

        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';

        for (const p of parts) {
          const delta = parseSSE(p);
          if (!delta) continue;
          botBubble.textContent += delta;
          log.scrollTop = log.scrollHeight;
        }
      }
    }

    send.addEventListener('click', () => {
      const text = (q.value || '').trim();
      if (!text) return;
      q.value = '';
      ask(text).catch(err => add('bot', String(err && err.message ? err.message : err), 'bot'));
    });

    q.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') send.click();
    });
  </script>
</body>
</html>`;
}

/* -------------------------
 * MAIN WORKER
 * ------------------------- */
export default {
  async fetch(request, env) {
    const cfg = buildCfg(env);
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    // ---- OPTIONS preflight (CORS fix)
    if (request.method === "OPTIONS") {
      const h = corsPreflightHeaders(cfg, request, origin, url.pathname);
      securityHeadersApi(url.pathname).forEach((v, k) => h.set(k, v));
      return new Response(null, { status: 204, headers: h });
    }

    // ---- Health
    if (url.pathname === "/" || url.pathname === cfg.routes.health || url.pathname === cfg.routes.api_health) {
      // Do not disclose internal binding names in response
      let relay = "missing";
      try { requireUpstream(env); relay = "present"; } catch {}
      return respondJson(cfg, origin, 200, {
        ok: true,
        health: "gateway: ok",
        cfg_source: cfg.cfg_source,
        allowed_origins_count: cfg.allowedOrigins.size,
        allowed_parents_count: cfg.allowedParents.size,
        public_origin: cfg.publicOrigin,
        relay,
      }, undefined, url.pathname);
    }

    // ---- Debug snapshot (GET /api/chat)
    if (request.method === "GET" && url.pathname === cfg.routes.chat) {
      let relay = "missing";
      try { requireUpstream(env); relay = "present"; } catch {}
      return respondJson(cfg, origin, 200, {
        ok: true,
        routes: { ...cfg.routes, handshake: REPO_HANDSHAKE_PATH },
        allowed_origins: Array.from(cfg.allowedOrigins),
        allowed_parents: Array.from(cfg.allowedParents),
        asset_header: cfg.assetHeader,
        handshake: { method: "POST", path: REPO_HANDSHAKE_PATH, header: REPO_SECRET_HEADER, secret_env: "CON_ARTIST_SERVICES" },
        relay,
        note: "This endpoint streams SSE on POST.",
      }, undefined, url.pathname);
    }

    // ---- Repo handshake
    if (url.pathname === REPO_HANDSHAKE_PATH) {
      if (request.method !== "POST") return respondJson(cfg, origin, 405, { ok: false, error: "method_not_allowed" }, undefined, url.pathname);
      const check = verifyRepoSecret(request, env);
      if (!check.ok) return respondJson(cfg, origin, 403, { ok: false, error: "repo_auth_failed", reason: check.reason }, undefined, url.pathname);
      return respondJson(cfg, origin, 200, { ok: true, match: "repo<->worker", worker: "con-artist" }, undefined, url.pathname);
    }

    // ---- /embed (iframe UI)
    if (url.pathname === cfg.routes.embed) {
      const parent = normalizeOrigin(url.searchParams.get("parent") || "");
      if (!parent) return new Response("Missing ?parent=", { status: 400, headers: { "content-type": "text/plain; charset=utf-8" } });
      if (!cfg.allowedParents.has(parent)) return new Response("Parent not allowed", { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } });

      const tenantAssetId = safeTextOnly(cfg.originToAsset[parent] || "");
      if (!tenantAssetId) return new Response("Missing tenant asset mapping", { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } });

      const nonce = makeNonce();
      const frameAncestors = Array.from(cfg.allowedParents);

      const h = embedSecurityHeaders(frameAncestors, nonce);
      h.set("content-type", "text/html; charset=utf-8");
      return new Response(embedHtml({ nonce, tenantOrigin: parent, tenantAssetId }), { status: 200, headers: h });
    }

    // ---- Only /api/chat is supported for POST
    if (url.pathname !== cfg.routes.chat) return respondJson(cfg, origin, 404, { ok: false, error: "not_found" }, undefined, url.pathname);
    if (request.method !== "POST") return respondJson(cfg, origin, 405, { ok: false, error: "method_not_allowed" }, undefined, url.pathname);

    // ---- Tenant resolve (iframe or direct) + asset verify
    const tenant = resolveTenant(cfg, request);
    if (!tenant.ok) return respondJson(cfg, origin, 403, { ok: false, error: "tenant_rejected", detail: tenant }, undefined, url.pathname);

    const assetCheck = verifyTenantAsset(cfg, tenant.tenantOrigin, request);
    if (!assetCheck.ok) {
      return respondJson(cfg, origin, 403, {
        ok: false,
        error: "invalid_asset_identity",
        tenant_origin: tenant.tenantOrigin,
        got_asset_id: assetCheck.got || "(none)",
        expected_asset_id: assetCheck.expected || "(missing mapping)",
      }, undefined, url.pathname);
    }

    // ---- Origin allowlist enforcement for direct callers
    if (tenant.mode === "direct") {
      if (!isAllowedOrigin(cfg, origin)) {
        return respondJson(cfg, origin, 403, { ok: false, error: "origin_not_allowed", saw_origin: origin || "(none)" }, undefined, url.pathname);
      }
    }

    // ---- Parse request body + sanitize messages
    const raw = await request.text().catch(() => "");
    if (!raw) return respondJson(cfg, origin, 400, { ok: false, error: "empty_body" }, undefined, url.pathname);
    if (raw.length > cfg.limits.max_body_chars) return respondJson(cfg, origin, 413, { ok: false, error: "request_too_large" }, undefined, url.pathname);

    let body;
    try { body = JSON.parse(raw); } catch { return respondJson(cfg, origin, 400, { ok: false, error: "invalid_json" }, undefined, url.pathname); }

    const messages = Array.isArray(body.messages) ? body.messages : [];
    const normalizedMessages = [];

    for (const msg of messages.slice(-cfg.limits.max_messages)) {
      if (!msg || typeof msg !== "object") continue;
      const role = String(msg.role || "").toLowerCase();
      if (role !== "user" && role !== "assistant") continue;

      const content = tinySanitize(msg.content || "");
      const risk = tinyRisk(content);
      if (!content || risk >= 2 || tinyHasResidualMalicious(content)) {
        return respondJson(cfg, origin, 403, { ok: false, error: "blocked_by_tinyml" }, undefined, url.pathname);
      }

      let clipped = safeTextOnly(content);
      if (clipped.length > cfg.limits.max_message_chars) clipped = clipped.slice(0, cfg.limits.max_message_chars);
      if (clipped) normalizedMessages.push({ role, content: clipped });
    }

    if (!normalizedMessages.length) return respondJson(cfg, origin, 400, { ok: false, error: "messages_required" }, undefined, url.pathname);

    // ---- Force mode required by drastic-measures when con-artist trust headers are present
    const payload = {
      mode: CON_ARTIST_MODE_IFRAME_SERVICE_QA,
      messages: normalizedMessages,
      meta: body.meta && typeof body.meta === "object" ? body.meta : {},
    };

    // ---- Forward upstream (SSE pass-through)
    let upstreamResp;
    try {
      upstreamResp = await forwardChatUpstream(cfg, env, tenant.tenantOrigin, assetCheck.got, payload);
    } catch {
      return respondJson(cfg, origin, 502, { ok: false, error: "upstream_unreachable" }, undefined, url.pathname);
    }

    if (!upstreamResp.ok) {
      const code = await safeUpstreamErrorCode(upstreamResp);
      return respondJson(cfg, origin, 502, { ok: false, error: "upstream_error", status: upstreamResp.status, code: code || undefined }, undefined, url.pathname);
    }

    const extra = new Headers();
    extra.set("x-gabo-asset-verified", "1");
    extra.set("x-gabo-tenant-origin", tenant.tenantOrigin);

    return respondSSE(cfg, origin, upstreamResp.body, extra, url.pathname);
  },
};
