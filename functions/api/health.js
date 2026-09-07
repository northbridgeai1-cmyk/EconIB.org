import { json, handler } from "../../shared/http.js";
import { allowedOrigin } from "../../shared/http.js";
import { hashPassword, iterations } from "../../shared/auth.js";

/**
 * Reports what the RUNNING deployment is actually configured with, not what the
 * code says. A CORS wildcard or a missing key is correct in source and wrong in
 * deployment more often than the reverse.
 *
 * It reports presence, never values.
 */
export const onRequestGet = handler(async ({ env }) => {
  const checks = {};

  checks.database = await (async () => {
    try {
      await env.DB.prepare("SELECT 1").first();
      return { ok: true, detail: "reachable" };
    } catch (e) {
      return { ok: false, detail: "unreachable" };
    }
  })();

  const origin = allowedOrigin(env);
  checks.allowedOrigin = {
    ok: Boolean(origin),
    detail: origin
      ? (origin.endsWith("/") ? "set but has a trailing slash, which will never match" : "set")
      : "NOT SET - all cross-origin requests are denied",
  };

  checks.aiMarking = {
    ok: Boolean(env.ANTHROPIC_API_KEY),
    detail: env.ANTHROPIC_API_KEY ? "key present" : "no ANTHROPIC_API_KEY - marking will return 503",
  };

  // Time a real hash. On the Workers Free plan (10ms CPU) this will exceed
  // budget and password login cannot work; better to say so here than to let
  // every login 500 with no explanation.
  checks.passwordHashing = await (async () => {
    try {
      const started = Date.now();
      await hashPassword("benchmark-only-not-a-real-password", env);
      const ms = Date.now() - started;
      return {
        ok: true,
        detail: `${iterations(env)} iterations in ~${ms}ms`,
        warning: ms > 10 ? "Exceeds the Workers FREE plan CPU limit of 10ms. Password login requires the Workers Paid plan." : null,
      };
    } catch (e) {
      return { ok: false, detail: "PW_ITERATIONS is missing or below the safe floor" };
    }
  })();

  const ok = Object.values(checks).every((c) => c.ok);
  return json({ ok, checks }, { status: ok ? 200 : 503 });
});
