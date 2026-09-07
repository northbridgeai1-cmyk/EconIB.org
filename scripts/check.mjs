/**
 * Data and design integrity checks.
 *
 * These are the checks that were run by hand while the data was written. They
 * live here so that a later edit which breaks one is caught, rather than
 * discovered by a student reading a wrong mark total.
 *
 * Run: npm run check
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const read = (p) => JSON.parse(readFileSync(path.join(root, p), "utf8"));
const text = (p) => readFileSync(path.join(root, p), "utf8");

const failures = [];
const check = (label, condition, detail = "") => {
  if (condition) return;
  failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
};

// ---------------------------------------------------------------- assessment
const assessment = read("data/assessment.json");
for (const level of ["SL", "HL"]) {
  const total = assessment.components
    .filter((c) => c.levels.includes(level))
    .reduce((n, c) => n + (c.weight[level] || 0), 0);
  check(`${level} component weights sum to 100`, total === 100, `got ${total}`);
}
const p2 = assessment.components.find((c) => c.id === "p2");
check("Paper 2 parts sum to its maximum",
  p2.parts.reduce((n, p) => n + p.marks, 0) === p2.maxMarks,
  `parts=${p2.parts.reduce((n, p) => n + p.marks, 0)} max=${p2.maxMarks}`);
const p3 = assessment.components.find((c) => c.id === "p3");
check("Paper 3 parts sum to 30 per question, 60 for two",
  p3.parts.reduce((n, p) => n + p.marks, 0) === 30 && p3.maxMarks === 60);
const p1 = assessment.components.find((c) => c.id === "p1");
check("Paper 1 parts sum to 25", p1.parts.reduce((n, p) => n + p.marks, 0) === 25);
check("HL has three papers", assessment.components.filter((c) => c.levels.includes("HL") && c.id.startsWith("p")).length === 3);
check("SL has two papers", assessment.components.filter((c) => c.levels.includes("SL") && c.id.startsWith("p")).length === 2);

// ------------------------------------------------------------------- rubrics
const rubrics = read("data/rubrics.json");
const perCommentary = rubrics.ia.criteria.filter((c) => c.scope !== "portfolio").reduce((n, c) => n + c.max, 0);
const critF = rubrics.ia.criteria.find((c) => c.scope === "portfolio");
check("IA criteria A-E total 14", perCommentary === 14, `got ${perCommentary}`);
check("IA criterion F is out of 3", critF.max === 3);
check("IA portfolio totals 45", perCommentary * 3 + critF.max === rubrics.ia.maxMarks);
check("Criterion F has exactly three requirements", critF.requirements.length === 3);
for (const c of rubrics.ia.criteria) {
  const marks = c.levels.map((l) => l.mark);
  check(`IA criterion ${c.id} levels run 0..max`,
    marks[0] === 0 && marks[marks.length - 1] === c.max && marks.length === c.max + 1,
    `levels=${marks.join(",")} max=${c.max}`);
}
for (const p of rubrics.papers) {
  const b = p.bands;
  check(`${p.id} bands start at 1`, b[0][0] === 1);
  check(`${p.id} bands are contiguous`, b.every((x, i) => i === 0 || x[0] === b[i - 1][1] + 1), JSON.stringify(b));
  check(`${p.id} top band reaches the maximum`, b[b.length - 1][1] === p.max);
  check(`${p.id} every dimension has one rung per band`,
    p.dimensions.every((d) => d.rungs.length === b.length),
    p.dimensions.filter((d) => d.rungs.length !== b.length).map((d) => d.id).join(","));
  check(`${p.id} dimension ids are unique`, new Set(p.dimensions.map((d) => d.id)).size === p.dimensions.length);
}
const paperIds = rubrics.papers.map((p) => p.id);
check("paper rubric ids are unique", new Set(paperIds).size === paperIds.length);

// ------------------------------------------------------------------ syllabus
const syllabus = read("data/syllabus.json");
check("31 syllabus topics", syllabus.topics.length === 31, `got ${syllabus.topics.length}`);
const perUnit = {};
for (const t of syllabus.topics) perUnit[t.unit] = (perUnit[t.unit] || 0) + 1;
check("topics per unit are 2/12/7/10",
  perUnit[1] === 2 && perUnit[2] === 12 && perUnit[3] === 7 && perUnit[4] === 10,
  JSON.stringify(perUnit));
const slHours = syllabus.units.reduce((n, u) => n + u.hours.sl, 0) + 20;
const hlHours = syllabus.units.reduce((n, u) => n + u.hours.hl, 0) + 20;
check("SL teaching hours total 150", slHours === 150, `got ${slHours}`);
check("HL teaching hours total 240", hlHours === 240, `got ${hlHours}`);
check("topic codes are unique", new Set(syllabus.topics.map((t) => t.code)).size === 31);
check("HL-only topics are 2.10, 2.11, 2.12",
  syllabus.topics.filter((t) => t.hlOnly).map((t) => t.code).join(",") === "2.10,2.11,2.12");
for (const t of syllabus.topics) {
  check(`topic ${t.code} has study content`, t.essentials?.length > 0);
  check(`topic ${t.code} has a trap note`, Boolean(t.trap));
  check(`topic ${t.code} code matches its unit`, t.code.split(".")[0] === String(t.unit));
}

// -------------------------------------------------------------- key concepts
const kc = read("data/key-concepts.json");
check("nine key concepts", kc.concepts.length === 9, `got ${kc.concepts.length}`);
check("key concept ids are unique", new Set(kc.concepts.map((c) => c.id)).size === 9);
const topicCodes = new Set(syllabus.topics.map((t) => t.code));
for (const c of kc.concepts) {
  const bad = (c.pairsWith || []).filter((code) => !topicCodes.has(code));
  check(`key concept "${c.id}" links to real topics`, bad.length === 0, bad.join(","));
}

// ------------------------------------------------------------- command terms
const ct = read("data/command-terms.json");
check("33 command terms", ct.terms.length === 33, `got ${ct.terms.length}`);
check("command terms are unique", new Set(ct.terms.map((t) => t.term)).size === 33);
const aoCount = {};
for (const t of ct.terms) aoCount[t.ao] = (aoCount[t.ao] || 0) + 1;
check("command terms split 5/6/9/13 across AO1-AO4",
  aoCount.AO1 === 5 && aoCount.AO2 === 6 && aoCount.AO3 === 9 && aoCount.AO4 === 13,
  JSON.stringify(aoCount));
for (const t of ct.terms) check(`command term "${t.term}" has guidance`, Boolean(t.means && t.trap));

// -------------------------------------------------------------------- design
const tokens = text("public/assets/css/tokens.css");
const countTokens = (prefix) => new Set([...tokens.matchAll(new RegExp(`--(${prefix}[a-z0-9-]*):`, "g"))].map((m) => m[1])).size;
const typeSizes = countTokens("t-");
const radii = countTokens("r-");
check("type scale stays at 7 sizes", typeSizes === 7, `got ${typeSizes} — if you cannot list them on one hand you have an accumulation, not a system`);
check("radius scale stays at 4", radii === 4, `got ${radii}`);

const rootBlock = tokens.slice(tokens.indexOf(":root {"), tokens.indexOf("/* Dark redefines"));
const rootVars = new Set([...rootBlock.matchAll(/--([a-z0-9-]+):/g)].map((m) => m[1]));
const darkVars = new Set([...tokens.slice(tokens.indexOf("/* Dark redefines")).matchAll(/--([a-z0-9-]+):/g)].map((m) => m[1]));
const orphan = [...darkVars].filter((v) => !rootVars.has(v));
check("no colour is defined only in a dark block", orphan.length === 0, orphan.join(","));

for (const file of ["public/assets/css/base.css", "public/assets/css/app.css"]) {
  let css;
  try { css = text(file); } catch { continue; }
  const literalSizes = [...css.matchAll(/font-size:\s*([^;]+);/g)]
    .map((m) => m[1].trim())
    .filter((v) => !v.startsWith("var(") && v !== "inherit" && !v.endsWith("em"));
  check(`${path.basename(file)} uses only token font sizes`, literalSizes.length === 0, [...new Set(literalSizes)].join(", "));
  let depth = 0;
  for (const ch of css) { if (ch === "{") depth++; if (ch === "}") depth--; }
  check(`${path.basename(file)} has balanced braces`, depth === 0, `depth ${depth}`);
  check(`${path.basename(file)} has no @media inside a selector list`, !/,\s*\n\s*@media/.test(css));
}

// ------------------------------------------------------------- providers
// A base URL patched to a local mock during testing must never reach a deploy.
{
  const src = text("shared/providers.js");
  const urls = [...src.matchAll(/baseUrl:\s*"([^"]+)"/g)].map((m) => m[1]);
  check("every provider base URL is set", urls.length >= 4, `found ${urls.length}`);
  for (const u of urls) {
    check(`provider base URL "${u}" is HTTPS`, u.startsWith("https://"));
    check(`provider base URL "${u}" is not a local test server`,
      !/localhost|127\.0\.0\.1|0\.0\.0\.0|:\d{4}/.test(u));
  }
}

// ------------------------------------------------- published data copies
// data/ is the source of truth; public/assets/data/ is what the browser fetches.
// Two copies can drift, so drift is a failure rather than a surprise.
for (const file of ["syllabus.json", "rubrics.json", "command-terms.json", "key-concepts.json", "assessment.json"]) {
  let source, published;
  try { source = text(`data/${file}`); } catch { failures.push(`data/${file} is missing`); continue; }
  try { published = text(`public/assets/data/${file}`); } catch { failures.push(`public/assets/data/${file} is missing — run npm run sync-data`); continue; }
  check(`public/assets/data/${file} matches data/${file}`, source === published, "run npm run sync-data");
}

// --------------------------------------------------------------------- report
if (failures.length) {
  console.error(`\n${failures.length} check(s) FAILED:\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error("");
  process.exit(1);
}
console.log("All data and design checks passed.");
