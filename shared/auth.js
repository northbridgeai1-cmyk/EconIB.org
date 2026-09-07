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

export function iterations(env) {
  const n = Number(env.PW_ITERATIONS || 600000);
  if (!Number.isInteger(n) || n < 100000) {
    // Fail closed and loudly. A quietly weakened work factor is worse than an
    // outage because nothing ever reports it.
    throw new HttpError(500, "Server is misconfigured.", "bad_config");
  }
  return n;
}

export async function hashPassword(password, env, saltB64) {
  const salt = saltB64 ? unb64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const iters = iterations(env);
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: iters },
    key,
    256
  );
  return { hash: b64(bits), salt: b64(salt), iterations: iters };
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

export async function verifyPassword(password, user, env) {
  const derived = await hashPassword(password, { PW_ITERATIONS: String(user.pw_iterations) }, user.pw_salt);
  return timingSafeEqual(derived.hash, user.pw_hash);
}

/**
 * Burn equivalent CPU when the email is unknown, so response time does not
 * reveal whether an account exists.
 */
export async function dummyVerify(password, env) {
  const salt = b64(new Uint8Array(16));
  await hashPassword(password || "x", env, salt);
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
    createdAt: row.created_at,
  };
}

export const newId = () => crypto.randomUUID();
