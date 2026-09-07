/**
 * Client-side password stretching.
 *
 * The browser does the expensive work and sends a "verifier" instead of the
 * password. The server stores a fast SHA-256 of that verifier under a random
 * per-user salt.
 *
 * Why this is not a weakening:
 *   - An attacker with the database has SHA-256(verifier || salt). To test a
 *     password guess they must still run the full 600,000-iteration PBKDF2 to
 *     produce a candidate verifier. Offline cracking cost is unchanged.
 *   - The server never sees the password, so a compromised server cannot learn
 *     it — a genuine improvement over hashing server-side.
 *   - The verifier is password-equivalent in transit, exactly as a password
 *     would be, and is protected by the same TLS.
 *
 * Why it is done at all: a password KDF costs ~400ms of CPU, and Cloudflare's
 * free plan allows 10ms per request. Doing it here is what lets EconIB run
 * without a paid plan.
 *
 * The salt is derived from the email rather than fetched from the server, so
 * signing in needs no "what is my salt" request — which would otherwise reveal
 * which emails have accounts.
 */

export const KDF_VERSION = 1;
export const KDF_ITERATIONS = 600000;

const enc = new TextEncoder();

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));

/**
 * Stretch a password into a 32-byte verifier.
 * @returns {Promise<string>} base64, 44 characters
 */
export async function deriveVerifier(email, password) {
  const normalised = String(email || "").trim().toLowerCase();
  if (!normalised || !password) throw new Error("email and password are required");

  // Salt is unique per account and needs no lookup. A precomputed table would
  // have to target one specific email and still pay the full iteration cost.
  const salt = enc.encode(`econib-kdf-v${KDF_VERSION}:${normalised}`);

  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: KDF_ITERATIONS },
    key,
    256
  );
  return b64(bits);
}

/** Minimum strength, enforced here because the server only ever sees the verifier. */
export function checkPassword(password) {
  if (typeof password !== "string" || password.length < 10) {
    return { ok: false, message: "Use at least 10 characters. Length beats complexity." };
  }
  if (password.length > 200) {
    return { ok: false, message: "Passwords must be 200 characters or fewer." };
  }
  return { ok: true };
}
