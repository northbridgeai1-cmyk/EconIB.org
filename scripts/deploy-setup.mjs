/**
 * One-time deployment setup.
 *
 * Creates the D1 database (or reuses it if it already exists), writes the real
 * database_id into wrangler.toml, and applies the schema and every migration.
 *
 * Run AFTER `npx wrangler login`:   node scripts/deploy-setup.mjs
 *
 * Safe to run twice: the schema uses CREATE TABLE IF NOT EXISTS, and migrations
 * that have already been applied are reported and skipped rather than failing
 * the run.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const wrangler = (args, opts = {}) =>
  execFileSync("npx", ["wrangler", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });

function step(label) { console.log(`\n▸ ${label}`); }

// --- 0. Must be logged in first -------------------------------------------
step("Checking you are signed in to Cloudflare");
try {
  const who = wrangler(["whoami"]);
  if (/not authenticated/i.test(who)) throw new Error("not authenticated");
  const email = /associated with the email ([^\s]+)/i.exec(who)?.[1];
  console.log(`  Signed in${email ? ` as ${email}` : ""}.`);
} catch {
  console.error("  You are not signed in. Run this first, approve it in the browser, then re-run:\n");
  console.error("    npx wrangler login\n");
  process.exit(1);
}

// --- 1. Database ------------------------------------------------------------
step("Creating the database (or finding the existing one)");
let databaseId = null;
try {
  const out = wrangler(["d1", "create", "econib"]);
  databaseId = /database_id\s*=\s*"([0-9a-f-]{36})"/i.exec(out)?.[1]
    || /"uuid":\s*"([0-9a-f-]{36})"/i.exec(out)?.[1];
  console.log("  Created a new database.");
} catch (err) {
  const text = (err.stdout || "") + (err.stderr || "");
  if (!/already exists/i.test(text)) {
    console.error("  Could not create the database:\n" + text.split("\n").slice(0, 8).join("\n"));
    process.exit(1);
  }
  console.log("  A database called econib already exists — reusing it.");
}

if (!databaseId) {
  const list = wrangler(["d1", "list", "--json"]);
  try {
    const row = JSON.parse(list).find((d) => d.name === "econib");
    databaseId = row?.uuid || row?.database_id || null;
  } catch { /* fall through to the error below */ }
}

if (!databaseId) {
  console.error("  Could not determine the database id. Run `npx wrangler d1 list` and paste the id into wrangler.toml yourself.");
  process.exit(1);
}
console.log(`  database_id: ${databaseId}`);

// --- 2. Point wrangler.toml at it ------------------------------------------
step("Writing the id into wrangler.toml");
const tomlPath = new URL("../wrangler.toml", import.meta.url);
let toml = readFileSync(tomlPath, "utf8");
const before = toml;
toml = toml.replace(/database_id\s*=\s*"[^"]*"/, `database_id = "${databaseId}"`);
if (toml === before && !toml.includes(databaseId)) {
  console.error("  Could not find a database_id line to replace. Set it by hand.");
  process.exit(1);
}
writeFileSync(tomlPath, toml);
console.log("  Done.");

// --- 3. Schema and migrations ----------------------------------------------
step("Creating the tables on the live database");
const apply = (file) => {
  try {
    wrangler(["d1", "execute", "econib", "--remote", "--yes", "--file", file]);
    console.log(`  applied ${file}`);
  } catch (err) {
    const text = (err.stdout || "") + (err.stderr || "");
    // A migration already applied reports a duplicate column; that is success.
    if (/duplicate column name|already exists/i.test(text)) {
      console.log(`  ${file} was already applied — skipping.`);
    } else {
      console.error(`  FAILED on ${file}:\n` + text.split("\n").slice(0, 10).join("\n"));
      process.exit(1);
    }
  }
};

apply("./schema.sql");
for (const f of readdirSync("./migrations").filter((f) => f.endsWith(".sql")).sort()) {
  apply(`./migrations/${f}`);
}

// --- 4. What is left for a human -------------------------------------------
step("Checking the tables are really there");
try {
  const out = wrangler(["d1", "execute", "econib", "--remote", "--yes", "--command",
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"]);
  const tables = [...out.matchAll(/"name":\s*"([a-z_]+)"/g)].map((m) => m[1]).filter((t) => !t.startsWith("sqlite_"));
  console.log(`  ${tables.length} tables: ${tables.join(", ")}`);
  const need = ["users", "sessions", "commentaries", "password_resets", "progress", "rate_limits", "ai_usage", "paper_attempts"];
  const missing = need.filter((t) => !tables.includes(t));
  if (missing.length) { console.error(`  MISSING: ${missing.join(", ")}`); process.exit(1); }
} catch (err) {
  console.error("  Could not list the tables.");
  process.exit(1);
}

console.log(`
✓ Database ready.

Commit the wrangler.toml change, then finish in the Cloudflare dashboard:

  1. git add wrangler.toml && git commit -m "Point at the live D1 database" && git push
  2. Workers & Pages → Create → Pages → Connect to Git → EconIB.org
       Build command:            (leave empty)
       Build output directory:   public
  3. Settings → Bindings → D1:  variable name DB, database econib
  4. Settings → Variables:
       ALLOWED_ORIGIN            https://econib.org      (no trailing slash)
       SHARED_AI_PROVIDER        groq
       PW_ITERATIONS             600000
       AI_DAILY_LIMIT_PER_USER   5
       AI_DAILY_LIMIT_GLOBAL     40
     Secrets (type "Secret", not plaintext):
       SHARED_AI_KEY             your Groq key
       KEY_ENCRYPTION_SECRET     run: openssl rand -base64 48
  5. Custom domains → add econib.org
  6. curl https://econib.org/api/health   → expect {"ok": true}
`);
