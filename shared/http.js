/** JSON responses, security headers, and a CORS policy that fails closed. */

export const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "cross-origin-opener-policy": "same-origin",
  // Set here as well as in public/_headers: whether Pages applies static
  // headers to Function responses is platform behaviour, and this one is too
  // important to depend on it.
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "cache-control": "no-store",
};

/**
 * Resolve the allowed origin.
 *
 * There is no wildcard fallback. If ALLOWED_ORIGIN is unset — which is exactly
 * the state a fresh deployment is in — cross-origin requests are denied. A
 * permissive default would make the misconfiguration invisible.
 */
export function allowedOrigins(env) {
  // A deployment legitimately answers on more than one origin: the pages.dev
  // URL exists from the first deploy, and the custom domain is added later.
  // Accepting a list avoids a window where the site blocks its own requests.
  // There is still no wildcard — an unset value denies everything.
  return String(env.ALLOWED_ORIGIN || "")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

/** The first configured origin, used when building absolute links. */
export function allowedOrigin(env) {
  return allowedOrigins(env)[0] || null;
}

export function isAllowedOrigin(env, origin) {
  if (!origin) return false;
  return allowedOrigins(env).includes(origin.replace(/\/+$/, ""));
}

export function corsHeaders(request, env) {
  const origin = request.headers.get("origin");
  if (!isAllowedOrigin(env, origin)) return {};
  return {
    "access-control-allow-origin": origin.replace(/\/+$/, ""),
    "access-control-allow-credentials": "true",
    "vary": "origin",
  };
}

export function json(data, { status = 200, headers = {}, request, env } = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...SECURITY_HEADERS,
      ...(request && env ? corsHeaders(request, env) : {}),
      ...headers,
    },
  });
}

export class HttpError extends Error {
  constructor(status, message, code = "error", extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const badRequest = (m, code = "bad_request", extra) => new HttpError(400, m, code, extra);
export const unauthorized = (m = "Sign in to continue.") => new HttpError(401, m, "unauthorized");
export const forbidden = (m = "Not allowed.") => new HttpError(403, m, "forbidden");
export const notFound = (m = "Not found.") => new HttpError(404, m, "not_found");
export const tooMany = (m, extra) => new HttpError(429, m, "rate_limited", extra);

/**
 * Wrap a handler so thrown HttpErrors become clean JSON and anything else
 * becomes a 500 without leaking internals to the client.
 */
export function handler(fn) {
  return async (ctx) => {
    try {
      return await fn(ctx);
    } catch (err) {
      if (err instanceof HttpError) {
        return json(
          { error: err.message, code: err.code, ...err.extra },
          { status: err.status, request: ctx.request, env: ctx.env }
        );
      }
      console.error("unhandled", err?.stack || err);
      return json(
        { error: "Something went wrong on our side. Try again.", code: "internal" },
        { status: 500, request: ctx.request, env: ctx.env }
      );
    }
  };
}

/** Parse a JSON body, rejecting anything oversized or malformed. */
export async function readJson(request, { maxBytes = 128 * 1024 } = {}) {
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > maxBytes) throw badRequest("That request is too large.", "payload_too_large");
  let text;
  try {
    text = await request.text();
  } catch {
    throw badRequest("Could not read the request body.");
  }
  if (text.length > maxBytes) throw badRequest("That request is too large.", "payload_too_large");
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw badRequest("Expected a JSON object.");
    }
    return parsed;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw badRequest("That request body was not valid JSON.");
  }
}

export const nowIso = () => new Date().toISOString();
export const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);
