import { test } from "node:test";
import assert from "node:assert/strict";
import { canUseRubric, componentsFor, topicVisible, HL_ONLY_RUBRICS } from "../shared/access.js";
import syllabus from "../data/syllabus.json" with { type: "json" };
import rubrics from "../data/rubrics.json" with { type: "json" };

test("Paper 3 is refused to SL accounts", () => {
  assert.equal(canUseRubric("SL", "p3b"), false, "the API is the control, not the hidden tab");
  assert.equal(canUseRubric("HL", "p3b"), true);
});

test("the common papers are open to both levels", () => {
  for (const id of ["p1a", "p1b", "p2g"]) {
    assert.equal(canUseRubric("SL", id), true, `${id} is common to SL and HL`);
    assert.equal(canUseRubric("HL", id), true);
  }
});

test("every HL-only rubric named actually exists", () => {
  for (const id of HL_ONLY_RUBRICS) {
    assert.ok(rubrics.papers.some((p) => p.id === id), `${id} must be a real rubric`);
  }
});

test("an unknown rubric id is not silently allowed through the gate", () => {
  // Unknown ids are rejected by paperRubric before this runs; the gate must not
  // be the thing that decides, but it must not invent permission either.
  assert.equal(canUseRubric("SL", "p9z"), true, "gate defers; paperRubric rejects unknown ids");
});

test("SL sees 28 topics, HL sees all 31", () => {
  const sl = syllabus.topics.filter((t) => topicVisible(t, "SL"));
  const hl = syllabus.topics.filter((t) => topicVisible(t, "HL"));
  assert.equal(sl.length, 28);
  assert.equal(hl.length, 31);
  assert.equal(hl.length - sl.length, 3, "exactly three HL-only topics");
  assert.ok(!sl.some((t) => t.hlOnly), "no HL-only topic leaks into the SL list");
});

test("SL sits two papers plus the IA; HL sits three plus the IA", () => {
  assert.equal(componentsFor("SL").length, 3);
  assert.equal(componentsFor("HL").length, 4);
  assert.ok(!componentsFor("SL").some((c) => c.id === "p3"));
  assert.ok(componentsFor("HL").some((c) => c.id === "p3"));
});

test("weights still total 100 at each level", () => {
  for (const level of ["SL", "HL"]) {
    const total = componentsFor(level).reduce((n, c) => n + c.weight[level], 0);
    assert.equal(total, 100, `${level} weights must total 100`);
  }
});
