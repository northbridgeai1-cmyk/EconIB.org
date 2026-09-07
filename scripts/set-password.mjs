/**
 * Set a user's password directly, for local development and for recovering an
 * account when there is no reset email configured.
 *
 * Run:  node scripts/set-password.mjs <email> <new password> [--remote]
 *
 * The password is read from your own shell and hashed here; it is written to the
 * database only as a PBKDF2 hash, exactly as signup does.
 */
import { execFileSync } from "node:child_process";

const [, , email, password, ...rest] = process.argv;
const remote = rest.includes("--remote");

if (!email || !password) {
  console.error("Usage: node scripts/set-password.mjs <email> <new password> [--remote]");
  console.error('Quote a password containing spaces:  node scripts/set-password.mjs me@x.com "my new password"');
  process.exit(1);
}
if (password.length < 10) {
  console.error("Use at least 10 characters — the app enforces this too.");
  process.exit(1);
}

// Must match public/assets/js/lib/pwcrypto.js exactly, or a password set here
// will not verify in the browser.
const KDF_VERSION = 1;
const ITERATIONS = 600000;
const enc = new TextEncoder();
const b64 = (buf) => Buffer.from(new Uint8Array(buf)).toString("base64");

const normalisedEmail = email.trim().toLowerCase();

// 1. Stretch the password exactly as the browser does, into a verifier.
const kdfSalt = enc.encode(`econib-kdf-v${KDF_VERSION}:${normalisedEmail}`);
const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
const verifierBits = await crypto.subtle.deriveBits(
  { name: "PBKDF2", hash: "SHA-256", salt: kdfSalt, iterations: ITERATIONS },
  key,
  256
);
const verifier = new Uint8Array(verifierBits);

// 2. Store what the server stores: SHA-256(verifier || random salt).
const salt = crypto.getRandomValues(new Uint8Array(16));
const material = new Uint8Array(verifier.length + salt.length);
material.set(verifier, 0);
material.set(salt, verifier.length);
const hash = b64(await crypto.subtle.digest("SHA-256", material));
const saltB64 = b64(salt);

// Single-quote escaping for the SQL literal; values here are a base64 hash, a
// base64 salt and an email, so this is the whole of the escaping needed.
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const sql =
  `UPDATE users SET pw_hash = ${q(hash)}, pw_salt = ${q(saltB64)}, pw_iterations = ${ITERATIONS}, ` +
  `updated_at = ${q(new Date().toISOString())} WHERE email = ${q(normalisedEmail)};`;

const run = (sql_) => {
  const args = ["wrangler", "d1", "execute", "econib", remote ? "--remote" : "--local", "--command", sql_];
  if (remote) args.push("--yes");
  return execFileSync("npx", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
};

try {
  // Confirm the account exists first. D1's execute output carries no row count,
  // so an UPDATE that matches nothing looks identical to one that worked —
  // which is how this script's first version reported success for an email that
  // did not exist.
  const check = run(`SELECT COUNT(*) AS n FROM users WHERE email = ${q(normalisedEmail)};`);
  const found = Number(/"n":\s*(\d+)/.exec(check)?.[1] ?? 0);
  if (found === 0) {
    console.error(`No account found with the email ${normalisedEmail}.`);
    console.error("Check the spelling, or list the accounts you have with:");
    console.error(`  npx wrangler d1 execute econib ${remote ? "--remote" : "--local"} --command "SELECT email FROM users;"`);
    process.exit(1);
  }

  run(sql);
  console.log(`Password updated for ${normalisedEmail}. You can sign in with it now.`);
} catch (err) {
  console.error("Could not update the password.");
  console.error((err.stderr || err.stdout || err.message).toString().split("\n").slice(0, 6).join("\n"));
  process.exit(1);
}
