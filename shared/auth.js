/**
 * Password hashing, sessions and cookies.
 *
 * Sessions are an opaque random token in a __Host- prefixed cookie:
 *   HttpOnly  - an injected script cannot read it
 *   Secure    - it never travels over plain HTTP
 *   SameSite=Strict - a cross-site request carries no credentials, so there is
 *                     no CSRF surface to mitigate rather than a mitigated one
 *   __Host-   - the browser refuses the cookie unless it is Secure, Path=/ and
 *               has no Domain attribute, so a subdomain cannot set it
 * Only a SHA-256 hash of the token is stored, so a leaked database cannot be
 * replayed as a live session.
 */
import { HttpError, unauthorized } from "./http.js";

export const SESSION_COOKIE = "__Host-econib_session";
export const SESSION_DAYS = 30;

const enc = new TextEncoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/**
 * The browser stretches the password (600,000 PBKDF2 iterations) and sends a
 * verifier. The server stores a fast hash of it under a random per-user salt.
 *
 * The expensive step deliberately does NOT happen here: a password KDF costs
 * ~400ms of CPU and Cloudflare's free plan allows 10ms per request. Moving it
 * to the client is what lets this run without a paid plan, and it costs nothing
 * in offline-cracking resistance — an attacker holding the database must still
 * run the full KDF for every guess.
 *
 * The client half is public/assets/js/lib/pwcrypto.js.
 */
export const KDF_VERSION = 1;
export const CLIENT_KDF_ITERATIONS = 600000;

/** A verifier is exactly 32 bytes, base64. Anything else did not come from our client. */
export function isVerifier(value) {
  return typeof value === "string" && /^[A-Za-z0-9+/]{43}=$/.test(value);
}

/**
 * Stored credential = HMAC-SHA256(pepper, verifier || salt).
 *
 * The pepper matters more than it looks. The client's KDF salt is derived from
 * the email, which anyone can guess, so without a pepper a targeted attacker
 * could precompute 600,000-iteration verifiers for a known address BEFORE any
 * breach, and a later database leak would reduce to one cheap hash per guess.
 * Salting is supposed to force that expensive work to happen after the breach,
 * not before it. The pepper restores that: it is never in the database, so no
 * useful precomputation is possible without also compromising the environment.
 *
 * It is an HMAC rather than a hash of a concatenation so that length-extension
 * and ambiguous-encoding tricks are not even in scope. Cost is microseconds,
 * which keeps this inside the free plan's 10ms budget.
 */
// The pepper never changes within a deployment, so the imported key is cached
// per isolate. Re-importing it on every call is pure overhead — measurable in
// Node, and wasted CPU against a 10ms budget in a Worker.
let pepperKeyCache = null;

async function pepperKey(pepper) {
  if (pepperKeyCache?.pepper === pepper) return pepperKeyCache.key;
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  pepperKeyCache = { pepper, key };
  return key;
}

export async function hashVerifier(verifier, saltB64, env) {
  const pepper = env?.VERIFIER_PEPPER;
  if (!pepper || pepper.length < 32) {
    // Fail closed. A quietly unpeppered hash looks identical and is weaker.
    throw new HttpError(
      503,
      "This deployment is missing VERIFIER_PEPPER, so passwords cannot be stored safely.",
      "no_pepper"
    );
  }
  const salt = saltB64 ? unb64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const raw = unb64(verifier);
  const material = new Uint8Array(raw.length + salt.length);
  material.set(raw, 0);
  material.set(salt, raw.length);

  const mac = await crypto.subtle.sign("HMAC", await pepperKey(pepper), material);
  return { hash: b64(mac), salt: b64(salt), iterations: CLIENT_KDF_ITERATIONS };
}

/** Length-independent, value-independent comparison. */
export function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const x = enc.encode(a);
  const y = enc.encode(b);
  const len = Math.max(x.length, y.length);
  let diff = x.length ^ y.length;
  for (let i = 0; i < len; i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

export async function verifyPassword(verifier, user, env) {
  if (!isVerifier(verifier)) return false;
  const derived = await hashVerifier(verifier, user.pw_salt, env);
  return timingSafeEqual(derived.hash, user.pw_hash);
}

/**
 * Do equivalent work when the email is unknown, so the code paths stay
 * symmetrical and response time reveals nothing about which accounts exist.
 */
export async function dummyVerify(verifier, env) {
  const salt = b64(new Uint8Array(16));
  await hashVerifier(isVerifier(verifier) ? verifier : b64(new Uint8Array(32)), salt, env);
  return false;
}

export function newToken() {
  return b64(crypto.getRandomValues(new Uint8Array(32)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function hashToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(token));
  return b64(digest);
}

export function sessionCookie(token, { clear = false } = {}) {
  const parts = [
    `${SESSION_COOKIE}=${clear ? "" : token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    clear ? "Max-Age=0" : `Max-Age=${SESSION_DAYS * 86400}`,
  ];
  return parts.join("; ");
}

export function readSessionToken(request) {
  const raw = request.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === SESSION_COOKIE) return v.join("=") || null;
  }
  return null;
}

export async function createSession(db, userId) {
  const token = newToken();
  const tokenHash = await hashToken(token);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86400000);
  await db
    .prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(tokenHash, userId, now.toISOString(), expires.toISOString())
    .run();
  return { token, expires };
}

export async function destroySession(db, token) {
  if (!token) return;
  await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await hashToken(token)).run();
}

/** Resolve the signed-in user, or null. Expired sessions are deleted on sight. */
export async function currentUser(ctx) {
  const token = readSessionToken(ctx.request);
  if (!token) return null;
  const tokenHash = await hashToken(token);
  const row = await ctx.env.DB.prepare(
    `SELECT u.*, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`
  ).bind(tokenHash).first();
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    await ctx.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
    return null;
  }
  return row;
}

export async function requireUser(ctx) {
  const user = await currentUser(ctx);
  if (!user) throw unauthorized();
  return user;
}

/** The shape the client is allowed to see. Never the hash or the salt. */
export function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    yearGroup: row.year_group,
    level: row.level,
    examSession: row.exam_session || "",
    avatar: row.avatar ?? 0,
    createdAt: row.created_at,
  };
}

export const newId = () => crypto.randomUUID();
