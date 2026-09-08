import { nowIso, allowedOrigin } from "../../../../shared/http.js";
import { createSession, sessionCookie, newId, timingSafeEqual } from "../../../../shared/auth.js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const STATE_COOKIE = "__Host-econib_oauth";

/**
 * Google sends the student back here with a code.
 *
 * Failures redirect to the login page with a reason rather than rendering JSON
 * at the student — this is a browser navigation, not an API call.
 */
export const onRequestGet = async (ctx) => {
  const { request, env } = ctx;
  const url = new URL(request.url);
  const origin = (allowedOrigin(env) || url.origin).replace(/\/+$/, "");
  const fail = (reason) => Response.redirect(`${origin}/login?error=${encodeURIComponent(reason)}`, 302);

  const clear = `${STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

  if (url.searchParams.get("error")) return fail("You cancelled the Google sign-in.");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return fail("Google did not send the expected details. Try again.");

  const cookieState = readCookie(request, STATE_COOKIE);
  if (!cookieState || !timingSafeEqual(cookieState, state)) {
    return fail("That sign-in link did not match this browser. Start again from the sign-in page.");
  }

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return fail("Google sign-in is not configured.");

  // Exchange the code. This request carries our client secret, so the response
  // is known to come from Google — Google's own guidance is that an ID token
  // received directly from the token endpoint over TLS needs no signature
  // check, which also keeps this inside the free plan's CPU budget.
  let tokens;
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${origin}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });
    if (!res.ok) {
      console.error("google token exchange failed", res.status, (await res.text()).slice(0, 200));
      return fail("Google rejected the sign-in. Try again.");
    }
    tokens = await res.json();
  } catch {
    return fail("Could not reach Google. Try again.");
  }

  const claims = decodeJwtPayload(tokens.id_token);
  if (!claims) return fail("Google sent something unreadable. Try again.");

  // Sanity checks that cost nothing: the token must be for us, and current.
  if (claims.aud !== env.GOOGLE_CLIENT_ID) return fail("That sign-in was issued for a different site.");
  if (typeof claims.exp === "number" && claims.exp * 1000 < Date.now()) return fail("That sign-in expired. Try again.");
  if (!claims.sub) return fail("Google did not identify the account.");
  if (claims.email_verified === false) {
    return fail("That Google account has an unverified email address.");
  }

  const email = String(claims.email || "").trim().toLowerCase();
  if (!email) return fail("That Google account has no email address.");

  const db = env.DB;
  const now = nowIso();
  let user = await db.prepare("SELECT * FROM users WHERE google_sub = ?").bind(claims.sub).first();
  let isNew = false;

  if (!user) {
    const byEmail = await db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
    if (byEmail) {
      // DO NOT auto-link. There is no email verification at signup, so anyone
      // can register an address they do not own. Silently attaching a real
      // Google identity to that row would hand the squatter permanent access
      // to the victim's work: their password keeps working on the merged
      // account. Linking must be proven from the existing account instead.
      return fail(
        "An account already uses that email address. Sign in with your password first, " +
        "then connect Google from your account settings."
      );
    } else {
      const id = newId();
      await db.prepare(
        `INSERT INTO users (id, email, name, google_sub, auth_provider, year_group, level, exam_session, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'google', 'IB1', 'SL', '', ?, ?)`
      ).bind(id, email, String(claims.name || email.split("@")[0]).slice(0, 80), claims.sub, now, now).run();
      user = await db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
      isNew = true;
    }
  }

  const { token } = await createSession(db, user.id);
  // A new account has placeholder IB1/SL, so send them somewhere they can fix
  // it rather than silently guessing their course.
  const destination = isNew ? `${origin}/app#/account` : `${origin}/app`;

  return new Response(null, {
    status: 302,
    headers: new Headers([
      ["location", destination],
      ["set-cookie", sessionCookie(token)],
      ["set-cookie", clear],
      ["cache-control", "no-store"],
    ]),
  });
};

function readCookie(request, name) {
  for (const part of (request.headers.get("cookie") || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=") || null;
  }
  return null;
}

/** Decode without verifying. Safe only because this came from the token endpoint. */
function decodeJwtPayload(jwt) {
  if (typeof jwt !== "string") return null;
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decodeURIComponent(escape(json)));
  } catch {
    try { return JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))); } catch { return null; }
  }
}
