import { SECURITY_HEADERS, corsHeaders, allowedOrigin } from "../shared/http.js";

/** Preflight, security headers on every API response, and a same-origin guard. */
export const onRequest = async (ctx) => {
  const { request, env } = ctx;
  const url = new URL(request.url);
  const isApi = url.pathname.startsWith("/api/");

  if (isApi && request.method === "OPTIONS") {
    const cors = corsHeaders(request, env);
    if (!Object.keys(cors).length) return new Response(null, { status: 403 });
    return new Response(null, {
      status: 204,
      headers: {
        ...cors,
        "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "86400",
      },
    });
  }

  // A cross-origin state change is refused outright. SameSite=Strict already
  // means such a request carries no session, but refusing early is clearer than
  // letting it through to fail as "not signed in".
  if (isApi && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    const allowed = allowedOrigin(env);
    if (origin && (!allowed || origin.replace(/\/+$/, "") !== allowed)) {
      return new Response(JSON.stringify({ error: "Cross-origin requests are not allowed.", code: "bad_origin" }), {
        status: 403,
        headers: { "content-type": "application/json", ...SECURITY_HEADERS },
      });
    }
  }

  const response = await ctx.next();
  if (!isApi) return response;

  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
  for (const [k, v] of Object.entries(corsHeaders(request, env))) headers.set(k, v);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};
