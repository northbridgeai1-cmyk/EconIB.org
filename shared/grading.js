/**
 * Prompt construction and result validation for AI marking.
 *
 * Two rules shape everything here.
 *
 * 1. EconIB diagnoses; it never writes the student's coursework. The IA is
 *    assessed work that must be the student's own, so the schema has no field
 *    that could hold a rewritten sentence, and the system prompt forbids it.
 *    A tool that drafts a student's IA is a tool for committing academic
 *    malpractice.
 *
 * 2. Anything calculable is calculated. Word count, article recency and
 *    criterion F are computed in ia-rules.js and passed to the model as
 *    settled context, never asked of it.
 */
import { HttpError } from "./http.js";
import rubrics from "../data/rubrics.json" with { type: "json" };
import keyConcepts from "../data/key-concepts.json" with { type: "json" };

const INTEGRITY_RULE = `
ACADEMIC INTEGRITY - this constrains every response you give.
You are marking work that will be submitted for a qualification. You must NOT
write any part of it for the student. Specifically:
- Never supply a sentence, phrase or paragraph the student could paste in.
- Never rewrite, reword or "improve" their prose.
- Never draft their evaluation, their conclusion or their diagram explanation.
Instead, name what is missing and what it would need to do. "Your diagram is
never referred to in the text; the explanation needs to walk through the shift
using your own labels" is correct. Writing that explanation for them is not.
If you are tempted to demonstrate, describe the gap instead.
`.trim();

const EXAMINER_STANCE = `
You are an experienced IB Diploma Programme Economics examiner marking against
the published assessment criteria for the syllabus with first assessment 2022.

Mark honestly and to the standard actually applied by moderators. Most work is
not top band. Awarding a generous mark is not kindness: it costs the student the
information they needed. If the evidence for a band is not present in the text
in front of you, do not award it.

Quote the student's own words as evidence for each judgment, so they can see
exactly what earned or lost the mark. Quote briefly - a phrase or a clause.
`.trim();

/** Mark ranges are facts; the descriptor wording is EconIB's own. */
function describeIaCriteria() {
  return rubrics.ia.criteria
    .filter((c) => c.scope !== "portfolio")
    .map((c) => {
      const levels = c.levels.map((l) => `      ${l.mark} - ${l.text}`).join("\n");
      return `  Criterion ${c.id}: ${c.name} (0-${c.max})\n    ${c.assesses}\n${levels}`;
    })
    .join("\n\n");
}

export function iaTool() {
  const criteria = rubrics.ia.criteria.filter((c) => c.scope !== "portfolio");
  const properties = {};
  const required = [];
  for (const c of criteria) {
    properties[`criterion${c.id}`] = {
      type: "object",
      properties: {
        mark: { type: "integer", enum: c.levels.map((l) => l.mark) },
        evidence: {
          type: "string",
          description: "A short quotation from the student's commentary that justifies this mark. Empty string if the thing being assessed is absent.",
        },
        whyNotHigher: {
          type: "string",
          description: "What is missing that keeps this below the next mark. If already at the maximum, say what sustains it. Never write replacement prose.",
        },
        nextStep: {
          type: "string",
          description: "One concrete action the student should take, described as a task, not as text to copy.",
        },
      },
      required: ["mark", "evidence", "whyNotHigher", "nextStep"],
      additionalProperties: false,
    };
    required.push(`criterion${c.id}`);
  }

  properties.strongest = { type: "string", description: "The single thing this commentary does best." };
  properties.biggestGain = {
    type: "string",
    description: "The one change that would gain the most marks, naming the criterion it would move.",
  };
  properties.diagramPresent = {
    type: "boolean",
    description: "Whether the commentary text refers to a diagram at all. The student may have attached a diagram you cannot see; judge only from the text.",
  };
  required.push("strongest", "biggestGain", "diagramPresent");

  return {
    name: "record_ia_marks",
    description: "Record the mark and diagnosis for each internal assessment criterion.",
    input_schema: { type: "object", properties, required, additionalProperties: false },
  };
}

export function buildIaPrompt(commentary, context) {
  const concept = keyConcepts.concepts.find((c) => c.id === commentary.keyConcept);
  const unitName = { 2: "Microeconomics", 3: "Macroeconomics", 4: "The global economy" }[commentary.unit];

  const system = [
    EXAMINER_STANCE,
    "",
    INTEGRITY_RULE,
    "",
    "You are marking ONE commentary from a portfolio of three, against criteria A to E.",
    "Criterion F (rubric requirements) is decided by dates and metadata and has already",
    "been computed. Do not assess it and do not comment on word count or article age.",
    "",
    "THE CRITERIA:",
    describeIaCriteria(),
    "",
    "Note on criterion A: you are reading text only and cannot see an attached image.",
    "Judge the diagram on how the text refers to and explains one. If the commentary",
    "never refers to a diagram, criterion A cannot be above 1.",
    "",
    "Note on criterion D: a key concept has been declared. Assess how well the",
    "commentary uses it as the lens of its analysis, not whether it is mentioned.",
  ].join("\n");

  const meta = [
    `Article title: ${commentary.title || "(not given)"}`,
    `Source: ${commentary.source || "(not given)"}`,
    `Syllabus unit: ${unitName || "(not set)"}`,
    `Declared key concept: ${concept ? `${concept.name} - ${concept.short}` : "(not set)"}`,
    `Word count (computed, not to be assessed): ${context.words}`,
  ].join("\n");

  const user = [
    "Mark this commentary.",
    "",
    "--- METADATA ---",
    meta,
    "",
    "--- COMMENTARY TEXT ---",
    commentary.body,
    "--- END ---",
  ].join("\n");

  return { system, user };
}

/** Reject or clamp anything the model returns that the rubric does not allow. */
export function validateIaResult(data) {
  const criteria = rubrics.ia.criteria.filter((c) => c.scope !== "portfolio");
  const marks = {};
  const detail = {};
  for (const c of criteria) {
    const entry = data?.[`criterion${c.id}`];
    if (!entry || typeof entry.mark !== "number") {
      throw new HttpError(502, "The marker returned an incomplete result. Try again.", "bad_ai_result");
    }
    const allowed = c.levels.map((l) => l.mark);
    const mark = allowed.includes(entry.mark) ? entry.mark : Math.max(0, Math.min(c.max, Math.round(entry.mark)));
    marks[c.id] = mark;
    detail[c.id] = {
      mark,
      max: c.max,
      name: c.name,
      levelText: c.levels.find((l) => l.mark === mark)?.text || "",
      evidence: String(entry.evidence || "").slice(0, 600),
      whyNotHigher: String(entry.whyNotHigher || "").slice(0, 900),
      nextStep: String(entry.nextStep || "").slice(0, 600),
    };
  }
  return {
    marks,
    detail,
    subtotal: Object.values(marks).reduce((a, b) => a + b, 0),
    subtotalMax: 14,
    strongest: String(data.strongest || "").slice(0, 600),
    biggestGain: String(data.biggestGain || "").slice(0, 900),
    diagramPresent: Boolean(data.diagramPresent),
  };
}

// ------------------------------------------------------------------ papers

export function paperRubric(rubricId) {
  const r = rubrics.papers.find((p) => p.id === rubricId);
  if (!r) throw new HttpError(400, "Unknown paper type.", "bad_rubric");
  return r;
}

export function paperTool(rubric) {
  const properties = {};
  const required = [];
  for (const d of rubric.dimensions) {
    properties[d.id] = {
      type: "object",
      properties: {
        rung: {
          type: "integer",
          enum: rubric.rungs ? rubric.rungs : d.rungs.map((_, i) => i),
          description: `0 is the weakest, ${d.rungs.length - 1} the strongest, for: ${d.label}`,
        },
        evidence: { type: "string", description: "A brief quotation from the answer supporting this level." },
        whyNotHigher: { type: "string", description: "What is absent that keeps this dimension at this level. Never supply replacement prose." },
      },
      required: ["rung", "evidence", "whyNotHigher"],
      additionalProperties: false,
    };
    required.push(d.id);
  }
  properties.mark = {
    type: "integer",
    minimum: 0,
    maximum: rubric.max,
    description: `The overall mark out of ${rubric.max}, consistent with the dimension levels above.`,
  };
  properties.biggestGain = { type: "string", description: "The one change that would move this answer up a band." };
  required.push("mark", "biggestGain");

  return {
    name: "record_paper_marks",
    description: `Record the markband assessment for ${rubric.name}.`,
    input_schema: { type: "object", properties, required, additionalProperties: false },
  };
}

export function buildPaperPrompt(rubric, { question, answer }) {
  const dims = rubric.dimensions
    .map((d) => `  ${d.label} (${d.id}):\n` + d.rungs.map((r, i) => `    ${i} - ${r}`).join("\n"))
    .join("\n\n");
  const bands = rubric.bands.map((b, i) => `    level ${i} -> ${b[0]}-${b[1]} marks`).join("\n");

  const system = [
    EXAMINER_STANCE,
    "",
    INTEGRITY_RULE,
    "",
    `You are marking ${rubric.name}, out of ${rubric.max}.`,
    rubric.prompt,
    "",
    "Assess each dimension independently on its own ladder:",
    dims,
    "",
    "The band follows from the dimensions. A response is held down by its weakest",
    "dimensions, not lifted by its strongest, so a single missing element caps the mark:",
    bands,
    "",
    "You are reading text only. If the student describes a diagram in words, credit the",
    "explanation; you cannot verify the drawing itself. Say so rather than assuming.",
  ].join("\n");

  const user = [
    "Mark this answer.",
    "",
    "--- QUESTION ---",
    question || "(the student did not paste the question)",
    "",
    "--- STUDENT ANSWER ---",
    answer,
    "--- END ---",
  ].join("\n");

  return { system, user };
}

export function validatePaperResult(rubric, data) {
  const dimensions = rubric.dimensions.map((d) => {
    const entry = data?.[d.id] || {};
    const maxRung = d.rungs.length - 1;
    const rung = Number.isInteger(entry.rung) ? Math.max(0, Math.min(maxRung, entry.rung)) : 0;
    return {
      id: d.id,
      label: d.label,
      rung,
      maxRung,
      levelText: d.rungs[rung],
      nextText: rung < maxRung ? d.rungs[rung + 1] : null,
      evidence: String(entry.evidence || "").slice(0, 600),
      whyNotHigher: String(entry.whyNotHigher || "").slice(0, 900),
    };
  });

  const lowest = Math.min(...dimensions.map((d) => d.rung));
  const impliedBand = rubric.bands[lowest];
  let mark = Number.isInteger(data?.mark) ? Math.max(0, Math.min(rubric.max, data.mark)) : impliedBand[0];

  // Guard the model against itself: a mark outside the band its own dimension
  // levels imply is clamped, and the adjustment is reported rather than hidden.
  let adjusted = null;
  if (mark < impliedBand[0] || mark > impliedBand[1]) {
    adjusted = { from: mark, band: impliedBand };
    mark = Math.max(impliedBand[0], Math.min(impliedBand[1], mark));
  }

  return {
    rubricId: rubric.id,
    name: rubric.name,
    mark,
    max: rubric.max,
    band: impliedBand,
    bandIndex: lowest,
    bandCount: rubric.bands.length,
    capping: dimensions.filter((d) => d.rung === lowest).map((d) => d.label),
    dimensions,
    biggestGain: String(data?.biggestGain || "").slice(0, 900),
    adjusted,
  };
}
