import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isVerifier, hashVerifier, verifyPassword, dummyVerify,
  CLIENT_KDF_ITERATIONS, KDF_VERSION,
} from "../shared/auth.js";
import { verifier as validVerifier } from "../shared/validate.js";

const V = (byte = 1) => Buffer.from(new Uint8Array(32).fill(byte)).toString("base64");

test("only a real 32-byte base64 verifier is accepted", () => {
  assert.equal(isVerifier(V()), true);
  assert.equal(isVerifier("short"), false);
  assert.equal(isVerifier(""), false);
  assert.equal(isVerifier(null), false);
  // A raw password must never be mistaken for a verifier.
  assert.equal(isVerifier("a good long password"), false);
  // Wrong length, right alphabet.
  assert.equal(isVerifier("A".repeat(43)), false, "must require the trailing padding");
  assert.equal(isVerifier("A".repeat(42) + "="), false);
});

test("the server hash is a plain SHA-256, not a slow KDF", async () => {
  const started = Date.now();
  for (let i = 0; i < 20; i++) await hashVerifier(V());
  const perCall = (Date.now() - started) / 20;
  // The whole point: this must fit inside Cloudflare's 10ms free-plan budget.
  assert.ok(perCall < 5, `server hash took ${perCall}ms per call — the KDF has moved back to the server`);
});

test("hashing is salted, so identical passwords do not collide", async () => {
  const a = await hashVerifier(V());
  const b = await hashVerifier(V());
  assert.notEqual(a.salt, b.salt, "each account gets its own salt");
  assert.notEqual(a.hash, b.hash, "same verifier, different salt, different stored hash");
  assert.equal(a.hash.length, 44, "base64 SHA-256");
});

test("a stored hash verifies against its own salt and nothing else", async () => {
  const stored = await hashVerifier(V(7));
  const user = { pw_hash: stored.hash, pw_salt: stored.salt };
  assert.equal(await verifyPassword(V(7), user), true);
  assert.equal(await verifyPassword(V(8), user), false, "a different verifier must fail");
  const other = await hashVerifier(V(7));
  assert.equal(await verifyPassword(V(7), { pw_hash: other.hash, pw_salt: stored.salt }), false,
    "the right verifier under the wrong salt must fail");
});

test("a raw password submitted instead of a verifier is refused, not hashed", async () => {
  const stored = await hashVerifier(V());
  assert.equal(await verifyPassword("a good long password", { pw_hash: stored.hash, pw_salt: stored.salt }), false);
  assert.equal(await verifyPassword("", { pw_hash: stored.hash, pw_salt: stored.salt }), false);
  assert.equal(await verifyPassword(null, { pw_hash: stored.hash, pw_salt: stored.salt }), false);
});

test("the unknown-account path does equivalent work and always fails", async () => {
  assert.equal(await dummyVerify(V()), false);
  assert.equal(await dummyVerify("garbage"), false);
  assert.equal(await dummyVerify(undefined), false);
});

test("validation rejects anything that is not a verifier, naming the field", () => {
  assert.equal(validVerifier(V()), V());
  assert.throws(() => validVerifier(""), (e) => e.code === "missing_field");
  assert.throws(() => validVerifier("a good long password"), (e) => {
    assert.equal(e.code, "bad_verifier");
    assert.equal(e.extra.field, "password");
    return true;
  });
  assert.throws(() => validVerifier("nope", "newPassword"), (e) => {
    assert.equal(e.extra.field, "newPassword", "the field name follows the caller");
    return true;
  });
});

test("the client iteration count stays high enough to be worth doing", () => {
  // If this is ever lowered to make the browser faster, offline cracking gets
  // cheaper by the same factor. 600k is current OWASP guidance for PBKDF2-SHA256.
  assert.ok(CLIENT_KDF_ITERATIONS >= 600000, "client stretching must stay at 600k or above");
  assert.equal(KDF_VERSION, 1, "bumping this invalidates every stored password");
});
