import { json, handler } from "../../shared/http.js";
import { allowedOrigin } from "../../shared/http.js";
import { hashVerifier, CLIENT_KDF_ITERATIONS } from "../../shared/auth.js";

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

  const aiKey = env.SHARED_AI_KEY || env.ANTHROPIC_API_KEY;
  checks.aiMarking = {
    ok: Boolean(aiKey),
    detail: aiKey
      ? `shared key present for provider "${env.SHARED_AI_PROVIDER || "groq"}"`
      : "no SHARED_AI_KEY - shared marking returns 503; students can still add their own key",
  };

  checks.keyEncryption = {
    ok: Boolean(env.KEY_ENCRYPTION_SECRET && env.KEY_ENCRYPTION_SECRET.length >= 32),
    detail: env.KEY_ENCRYPTION_SECRET
      ? (env.KEY_ENCRYPTION_SECRET.length >= 32 ? "secret set" : "secret is too short - must be 32+ characters")
      : "no KEY_ENCRYPTION_SECRET - students cannot save their own API key",
  };

  // The expensive password stretch happens in the browser; the server only
  // does one SHA-256. Time it anyway, because the number is the whole reason
  // this deployment can run on the free plan — a regression here would be
  // silent otherwise.
  checks.passwordHashing = await (async () => {
    try {
      const started = Date.now();
      await hashVerifier("A".repeat(43) + "=", null, env);
      const ms = Date.now() - started;
      return {
        ok: ms <= 10,
        detail: `server-side hash ~${ms}ms (client stretches at ${CLIENT_KDF_ITERATIONS} iterations)`,
        warning: ms > 10
          ? "Exceeds the Workers Free plan CPU limit of 10ms — something has moved the key derivation back onto the server."
          : null,
      };
    } catch (err) {
      return { ok: false, detail: err?.code === "no_pepper"
        ? "VERIFIER_PEPPER is missing or too short - passwords cannot be stored"
        : "verifier hashing failed" };
    }
  })();

  // Google sign-in is optional: a deployment that only uses email and password
  // is correctly configured, so this must not fail the overall health check.
  const googleOn = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  checks.googleSignIn = {
    ok: true,
    optional: true,
    detail: googleOn ? "configured" : "not configured - the Google button is hidden (optional)",
  };

  const ok = Object.values(checks).every((c) => c.ok);
  return json({ ok, checks }, { status: ok ? 200 : 503 });
});
