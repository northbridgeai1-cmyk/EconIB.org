import { test } from "node:test";
import assert from "node:assert/strict";
import {
  iaTool, validateIaResult, paperRubric, paperTool,
  validatePaperResult, buildIaPrompt, buildPaperPrompt,
} from "../shared/grading.js";

test("the IA tool schema cannot express a rewritten sentence", () => {
  const schema = iaTool().input_schema;
  const fields = Object.entries(schema.properties).flatMap(([k, v]) =>
    v.properties ? Object.keys(v.properties).map((x) => `${k}.${x}`) : [k]
  );
  const banned = /rewrite|improved|suggestion_text|modelAnswer|exemplar|corrected|draft/i;
  assert.equal(fields.filter((f) => banned.test(f)).length, 0);
  assert.equal(schema.additionalProperties, false, "the model must not invent extra fields");
});

test("IA marks are constrained to each criterion's real range", () => {
  const props = iaTool().input_schema.properties;
  assert.deepEqual(props.criterionA.properties.mark.enum, [0, 1, 2, 3]);
  assert.deepEqual(props.criterionB.properties.mark.enum, [0, 1, 2], "terminology is out of 2, not 3");
  assert.deepEqual(props.criterionE.properties.mark.enum, [0, 1, 2, 3]);
});

const iaPayload = (over = {}) => ({
  criterionA: { mark: 2, evidence: "a", whyNotHigher: "b", nextStep: "c" },
  criterionB: { mark: 2, evidence: "a", whyNotHigher: "b", nextStep: "c" },
  criterionC: { mark: 3, evidence: "a", whyNotHigher: "b", nextStep: "c" },
  criterionD: { mark: 2, evidence: "a", whyNotHigher: "b", nextStep: "c" },
  criterionE: { mark: 1, evidence: "a", whyNotHigher: "b", nextStep: "c" },
  strongest: "s", biggestGain: "g", diagramPresent: true,
  ...over,
});

test("validateIaResult sums to a real subtotal out of 14", () => {
  const r = validateIaResult(iaPayload());
  assert.equal(r.subtotal, 2 + 2 + 3 + 2 + 1);
  assert.equal(r.subtotalMax, 14);
  assert.equal(r.detail.B.max, 2);
});

test("validateIaResult clamps a mark the rubric does not allow", () => {
  const r = validateIaResult(iaPayload({ criterionB: { mark: 3, evidence: "", whyNotHigher: "", nextStep: "" } }));
  assert.equal(r.marks.B, 2, "criterion B has a maximum of 2 no matter what the model says");
  const neg = validateIaResult(iaPayload({ criterionA: { mark: -4, evidence: "", whyNotHigher: "", nextStep: "" } }));
  assert.equal(neg.marks.A, 0);
});

test("validateIaResult rejects an incomplete result rather than inventing marks", () => {
  const missing = iaPayload();
  delete missing.criterionC;
  assert.throws(() => validateIaResult(missing), /incomplete/i);
});

test("a paper mark outside the band its own dimensions imply is clamped and reported", () => {
  const rubric = paperRubric("p1b");
  // Every dimension at rung 0 implies band 0, which is 1-3 marks.
  const dims = Object.fromEntries(
    rubric.dimensions.map((d) => [d.id, { rung: 0, evidence: "", whyNotHigher: "" }])
  );
  const r = validatePaperResult(rubric, { ...dims, mark: 14, biggestGain: "" });
  assert.deepEqual(r.band, [1, 3]);
  assert.equal(r.mark, 3, "clamped to the top of the implied band");
  assert.ok(r.adjusted, "the adjustment is surfaced, not hidden");
  assert.equal(r.adjusted.from, 14);
});

test("the weakest dimension sets the band, and is named as the cap", () => {
  const rubric = paperRubric("p1b");
  const dims = Object.fromEntries(
    rubric.dimensions.map((d) => [d.id, { rung: 4, evidence: "", whyNotHigher: "" }])
  );
  dims.evaluation.rung = 1; // strong everywhere except evaluation
  const r = validatePaperResult(rubric, { ...dims, mark: 6, biggestGain: "" });
  assert.equal(r.bandIndex, 1);
  assert.deepEqual(r.band, [4, 6], "one weak dimension caps an otherwise strong answer");
  assert.deepEqual(r.capping, ["Synthesis and evaluation"]);
  assert.equal(r.dimensions.find((d) => d.id === "evaluation").nextText.length > 0, true,
    "the student is told what the next rung looks like");
});

test("a top-band answer has no next rung to describe", () => {
  const rubric = paperRubric("p3b");
  const dims = Object.fromEntries(
    rubric.dimensions.map((d) => [d.id, { rung: 4, evidence: "", whyNotHigher: "" }])
  );
  const r = validatePaperResult(rubric, { ...dims, mark: 10, biggestGain: "" });
  assert.deepEqual(r.band, [9, 10]);
  assert.equal(r.mark, 10);
  assert.equal(r.dimensions[0].nextText, null);
});

test("every paper rubric builds a usable tool and prompt", () => {
  for (const id of ["p1a", "p1b", "p2g", "p3b"]) {
    const rubric = paperRubric(id);
    const tool = paperTool(rubric);
    assert.equal(tool.input_schema.additionalProperties, false);
    assert.ok(tool.input_schema.required.includes("mark"));
    const { system, user } = buildPaperPrompt(rubric, { question: "Q", answer: "A" });
    assert.match(system, /ACADEMIC INTEGRITY/);
    assert.match(system, new RegExp(`out of ${rubric.max}`));
    assert.match(user, /STUDENT ANSWER/);
  }
});

test("the IA prompt forbids writing for the student and hands over settled facts", () => {
  const { system, user } = buildIaPrompt(
    { title: "T", source: "ft.com", unit: 3, keyConcept: "intervention", body: "text here" },
    { words: 640 }
  );
  assert.match(system, /Never rewrite, reword/);
  assert.match(system, /Criterion F .*has already/s, "criterion F is computed, not asked for");
  assert.match(user, /640/, "the word count is given, not requested");
  assert.match(system, /Macroeconomics|criteria A to E/);
});

test("paperRubric refuses an unknown paper type", () => {
  assert.throws(() => paperRubric("p9z"), /Unknown paper type/);
});
