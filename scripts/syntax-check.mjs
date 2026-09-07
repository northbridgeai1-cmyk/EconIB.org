/**
 * Syntax-check every browser and server JS file by asking Node to parse it as a
 * module. Catches the class of error that only shows up as a blank page.
 */
import { readdirSync, statSync, copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const roots = ["public/assets/js", "shared", "functions", "scripts", "tests"];
const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.m?js$/.test(entry)) files.push(full);
  }
};
for (const r of roots) { try { walk(r); } catch {} }

const tmp = mkdtempSync(path.join(tmpdir(), "econib-syntax-"));
let failed = 0;
for (const file of files) {
  const target = path.join(tmp, file.replace(/[/\\[\]]/g, "_").replace(/\.m?js$/, ".mjs"));
  copyFileSync(file, target);
  try {
    execFileSync(process.execPath, ["--check", target], { stdio: "pipe" });
  } catch (err) {
    failed++;
    console.error(`✗ ${file}\n${(err.stderr || "").toString().split("\n").slice(0, 4).join("\n")}`);
  }
}
rmSync(tmp, { recursive: true, force: true });
console.log(`${files.length} JS files checked, ${failed} with syntax errors.`);
process.exit(failed ? 1 : 0);
