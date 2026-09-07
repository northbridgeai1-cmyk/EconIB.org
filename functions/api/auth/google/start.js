import { HttpError } from "../../../../shared/http.js";
import { newToken } from "../../../../shared/auth.js";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const STATE_COOKIE = "__Host-econib_oauth";

/**
 * Send the student to Google.
 *
 * A random state value is set as a short-lived cookie and echoed in the URL.
 * On return the two must match, which is what stops someone handing a victim a
 * pre-made callback link and signing them into an attacker's account.
 */
export const onRequestGet = async (ctx) => {
  const { env, request } = ctx;
  if (!env.GOOGLE_CLIENT_ID) {
    throw new HttpError(503, "Google sign-in is not configured on this deployment.", "google_unconfigured");
  }

  const state = newToken();
  const origin = (env.ALLOWED_ORIGIN || new URL(request.url).origin).replace(/\/+$/, "");

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: `${origin}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
    // We only need identity, so no refresh token is requested and none is stored.
    access_type: "online",
  });

  return new Response(null, {
    status: 302,
    headers: {
      location: `${AUTH_URL}?${params}`,
      // Lax, not Strict: the browser arrives back from Google as a cross-site
      // navigation, and Strict would withhold the cookie we need to compare.
      "set-cookie": `${STATE_COOKIE}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
      "cache-control": "no-store",
    },
  });
};

export { STATE_COOKIE };
