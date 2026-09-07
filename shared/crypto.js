/**
 * Encryption for student-supplied API keys.
 *
 * A BYOK key is a credential that can spend the student's money, so it is
 * encrypted at rest with AES-GCM under a server secret and NEVER returned to
 * the browser — the client only ever sees a masked hint like "gsk_...4f2a".
 *
 * Storing it server-side rather than in localStorage is the safer trade: the
 * session cookie is HttpOnly, so an injected script cannot read the key, and
 * an injected script cannot read this either because the API never sends it.
 */
import { HttpError } from "./http.js";

const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function keyFrom(env) {
  const secret = env.KEY_ENCRYPTION_SECRET;
  if (!secret || secret.length < 32) {
    // Fail closed. Encrypting under a weak or missing secret is worse than
    // refusing, because it looks like it worked.
    throw new HttpError(
      503,
      "This deployment cannot store API keys: KEY_ENCRYPTION_SECRET is missing or too short.",
      "no_encryption_key"
    );
  }
  const base = await crypto.subtle.importKey("raw", enc.encode(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: enc.encode("econib-byok-v1"), info: enc.encode("api-key") },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptKey(plaintext, env) {
  const key = await keyFrom(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
  return `${b64(iv)}.${b64(cipher)}`;
}

export async function decryptKey(stored, env) {
  if (!stored || !stored.includes(".")) return null;
  const [ivPart, cipherPart] = stored.split(".");
  const key = await keyFrom(env);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(ivPart) },
      key,
      unb64(cipherPart)
    );
    return dec.decode(plain);
  } catch {
    // Wrong secret, or tampered ciphertext. Do not guess.
    throw new HttpError(
      500,
      "Your saved API key could not be read. Remove it and add it again.",
      "key_undecryptable"
    );
  }
}

/** What the client is allowed to see: enough to recognise, not enough to use. */
export function maskKey(plaintext) {
  if (!plaintext || plaintext.length < 12) return "••••";
  return `${plaintext.slice(0, 6)}…${plaintext.slice(-4)}`;
}
