import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isVerifier, hashVerifier, verifyPassword, dummyVerify,
  CLIENT_KDF_ITERATIONS, KDF_VERSION,
} from "../shared/auth.js";
import { verifier as validVerifier } from "../shared/validate.js";

const V = (byte = 1) => Buffer.from(new Uint8Array(32).fill(byte)).toString("base64");

// Every stored credential is peppered with a server-side secret.
const ENV = { VERIFIER_PEPPER: "p".repeat(48) };

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

test("the server side stays cheap enough for the free plan", async () => {
  const started = Date.now();
  for (let i = 0; i < 20; i++) await hashVerifier(V(), null, ENV);
  const perCall = (Date.now() - started) / 20;
  // The threshold is deliberately loose. This test exists to catch one specific
  // regression — the key derivation moving back onto the server — which costs
  // ~400ms per call, so 50ms still catches it with an order of magnitude to
  // spare. A tight bound here would only make the suite flaky under load, and a
  // test that fails at random is worse than no test because it trains everyone
  // to ignore it. The real number is measured in production by /api/health.
  assert.ok(perCall < 50, `server hash took ${perCall}ms per call — the KDF has moved back to the server, or the pepper key is being re-imported on every call`);
});

test("hashing is salted, so identical passwords do not collide", async () => {
  const a = await hashVerifier(V(), null, ENV);
  const b = await hashVerifier(V(), null, ENV);
  assert.notEqual(a.salt, b.salt, "each account gets its own salt");
  assert.notEqual(a.hash, b.hash, "same verifier, different salt, different stored hash");
  assert.equal(a.hash.length, 44, "base64 SHA-256");
});

test("a stored hash verifies against its own salt and nothing else", async () => {
  const stored = await hashVerifier(V(7), null, ENV);
  const user = { pw_hash: stored.hash, pw_salt: stored.salt };
  assert.equal(await verifyPassword(V(7), user, ENV), true);
  assert.equal(await verifyPassword(V(8), user, ENV), false, "a different verifier must fail");
  const other = await hashVerifier(V(7), null, ENV);
  assert.equal(await verifyPassword(V(7), { pw_hash: other.hash, pw_salt: stored.salt }, ENV), false,
    "the right verifier under the wrong salt must fail");
});

test("a raw password submitted instead of a verifier is refused, not hashed", async () => {
  const stored = await hashVerifier(V(), null, ENV);
  assert.equal(await verifyPassword("a good long password", { pw_hash: stored.hash, pw_salt: stored.salt }, ENV), false);
  assert.equal(await verifyPassword("", { pw_hash: stored.hash, pw_salt: stored.salt }, ENV), false);
  assert.equal(await verifyPassword(null, { pw_hash: stored.hash, pw_salt: stored.salt }, ENV), false);
});

test("the unknown-account path does equivalent work and always fails", async () => {
  assert.equal(await dummyVerify(V(), ENV), false);
  assert.equal(await dummyVerify("garbage", ENV), false);
  assert.equal(await dummyVerify(undefined, ENV), false);
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


test("the pepper is what stops pre-breach precomputation", async () => {
  // The client's KDF salt comes from the email and is therefore public. Without
  // a pepper, an attacker could precompute 600k-iteration verifiers for a known
  // address before any breach, and a leak would reduce to one cheap hash per
  // guess. The pepper is never in the database, so that precomputation is
  // useless without also compromising the environment.
  const stored = await hashVerifier(V(3), null, ENV);

  const otherPepper = { VERIFIER_PEPPER: "q".repeat(48) };
  const sameInputs = await hashVerifier(V(3), stored.salt, otherPepper);
  assert.notEqual(sameInputs.hash, stored.hash,
    "identical verifier and salt under a different pepper must not collide");

  assert.equal(await verifyPassword(V(3), { pw_hash: stored.hash, pw_salt: stored.salt }, otherPepper), false,
    "a database leak without the pepper must not let anyone authenticate");
  assert.equal(await verifyPassword(V(3), { pw_hash: stored.hash, pw_salt: stored.salt }, ENV), true);
});

test("a missing or short pepper fails closed rather than storing a weak hash", async () => {
  await assert.rejects(hashVerifier(V(), null, {}), (e) => {
    assert.equal(e.code, "no_pepper");
    assert.equal(e.status, 503);
    return true;
  });
  await assert.rejects(hashVerifier(V(), null, { VERIFIER_PEPPER: "tooshort" }),
    (e) => e.code === "no_pepper");
});
