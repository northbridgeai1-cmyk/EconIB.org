import { test } from "node:test";
import assert from "node:assert/strict";
import { compare, calibrate, markerContext, MIN_SAMPLES, NOISE_FLOOR } from "../shared/calibration.js";

const ia = (teacher, econib, comments = "") =>
  ({ targetKind: "ia", marks: teacher, econib, comments });

test("a single comparison shows the gap per criterion, signed toward generosity", () => {
  const c = compare(ia({ A: 2, B: 2, C: 2, D: 2, E: 1 }, { A: 3, B: 2, C: 3, D: 2, E: 2 }));
  assert.equal(c.teacherTotal, 9);
  assert.equal(c.econibTotal, 12);
  assert.equal(c.totalDiff, 3, "positive means EconIB was more generous");
  assert.equal(c.rows.find((r) => r.id === "A").diff, 1);
  assert.equal(c.rows.find((r) => r.id === "B").diff, 0);
});

test("below the sample floor nothing is reported as a tendency", () => {
  const records = Array.from({ length: MIN_SAMPLES - 1 }, () =>
    ia({ A: 1, B: 1, C: 1, D: 1, E: 1 }, { A: 3, B: 2, C: 3, D: 3, E: 3 }));
  const cal = calibrate(records);
  // The gap here is enormous, and it still must not be announced as a pattern.
  assert.equal(cal.criteria.A.enough, false);
  assert.match(cal.criteria.A.text, /more needed/);
  assert.equal(cal.headline, null, "two points is not a pattern, however large the gap");
});

test("a difference smaller than half a mark is called no difference, not a small one", () => {
  // EconIB one mark over on a single commentary out of four: mean 0.25.
  const records = [
    ia({ A: 2, B: 2, C: 2, D: 2, E: 2 }, { A: 3, B: 2, C: 2, D: 2, E: 2 }),
    ia({ A: 2, B: 2, C: 2, D: 2, E: 2 }, { A: 2, B: 2, C: 2, D: 2, E: 2 }),
    ia({ A: 2, B: 2, C: 2, D: 2, E: 2 }, { A: 2, B: 2, C: 2, D: 2, E: 2 }),
    ia({ A: 2, B: 2, C: 2, D: 2, E: 2 }, { A: 2, B: 2, C: 2, D: 2, E: 2 }),
  ];
  const cal = calibrate(records);
  assert.equal(cal.criteria.A.samples, 4);
  assert.ok(Math.abs(cal.criteria.A.meanDiff) < NOISE_FLOOR);
  assert.match(cal.criteria.A.text, /No consistent difference/);
  assert.equal(cal.headline, null, "noise must not become a headline");
});

test("a real, repeated gap is reported with its direction and sample size", () => {
  const records = Array.from({ length: 4 }, () =>
    ia({ A: 2, B: 2, C: 2, D: 2, E: 1 }, { A: 2, B: 2, C: 2, D: 2, E: 3 }));
  const cal = calibrate(records);
  assert.equal(cal.criteria.E.samples, 4);
  assert.equal(cal.criteria.E.meanDiff, 2);
  assert.match(cal.criteria.E.text, /2\.0 marks more generous/);
  assert.match(cal.criteria.E.text, /across 4 pieces/);
  assert.equal(cal.headline.id, "E", "the strongest real signal is the headline");
});

test("EconIB being harsher is reported as harsher, not hidden", () => {
  const records = Array.from({ length: 3 }, () =>
    ia({ A: 3, B: 2, C: 3, D: 3, E: 3 }, { A: 1, B: 2, C: 3, D: 3, E: 3 }));
  const cal = calibrate(records);
  assert.equal(cal.criteria.A.meanDiff, -2);
  assert.match(cal.criteria.A.text, /harsher/);
});

test("work EconIB never marked is ignored, not counted as agreement", () => {
  const records = [
    ia({ A: 1, B: 1, C: 1, D: 1, E: 1 }, {}),        // teacher only
    ia({ A: 1, B: 1, C: 1, D: 1, E: 1 }, {}),
    ia({ A: 1, B: 1, C: 1, D: 1, E: 1 }, {}),
  ];
  const cal = calibrate(records);
  assert.equal(cal.records, 3);
  assert.equal(cal.comparable, 0, "nothing here can be compared");
  assert.equal(cal.criteria.A.samples, 0);
  assert.equal(cal.criteria.A.enough, false, "zero samples must never read as agreement");
  assert.equal(cal.criteria.A.meanDiff, null);
});

test("paper marks compare on the total", () => {
  const c = compare({ targetKind: "paper", marks: { mark: 9 }, econib: { mark: 12 } });
  assert.equal(c.teacherTotal, 9);
  assert.equal(c.econibTotal, 12);
  assert.equal(c.totalDiff, 3);
});

test("the marker is told nothing when there is nothing trustworthy to say", () => {
  assert.equal(markerContext([]), null);
  // One record, however lopsided, is not evidence.
  assert.equal(markerContext([ia({ A: 1, B: 1, C: 1, D: 1, E: 1 }, { A: 3, B: 2, C: 3, D: 3, E: 3 })]), null);
});

test("the marker is given a real pattern and the teacher's own words", () => {
  const records = Array.from({ length: 3 }, () =>
    ia({ A: 2, B: 2, C: 2, D: 2, E: 1 }, { A: 2, B: 2, C: 2, D: 2, E: 3 },
       "Your evaluation asserts rather than weighs. Give the other side."));
  const ctx = markerContext(records);
  assert.match(ctx, /more generous/);
  assert.match(ctx, /evaluation/i);
  assert.match(ctx, /Your evaluation asserts rather than weighs/);
  assert.match(ctx, /do not contradict it without saying why/i);
});

test("teacher comments are length-capped before reaching a prompt", () => {
  const long = "x".repeat(5000);
  const records = Array.from({ length: 3 }, () => ia({ A: 2, B: 2, C: 2, D: 2, E: 2 }, {}, long));
  const ctx = markerContext(records);
  assert.ok(ctx.length < 1500, `context was ${ctx.length} chars — a prompt must not be stuffable`);
});


test("a comment repeated across pieces is passed on once, not three times", () => {
  const same = "Your evaluation asserts rather than weighs.";
  const records = Array.from({ length: 3 }, () =>
    ia({ A: 2, B: 2, C: 2, D: 2, E: 1 }, { A: 2, B: 2, C: 2, D: 2, E: 3 }, same));
  const ctx = markerContext(records);
  const occurrences = ctx.split(same).length - 1;
  assert.equal(occurrences, 1,
    "a teacher who says the same thing three times has made one point");
});

test("different comments are all passed on, up to three", () => {
  const records = [
    ia({ E: 1 }, { E: 3 }, "Evaluation asserts rather than weighs."),
    ia({ E: 1 }, { E: 3 }, "Diagrams are not referred to in the text."),
    ia({ E: 1 }, { E: 3 }, "Terminology is clustered in the opening paragraph."),
    ia({ E: 1 }, { E: 3 }, "A fourth comment that should not appear."),
  ];
  const ctx = markerContext(records);
  assert.match(ctx, /Evaluation asserts/);
  assert.match(ctx, /Diagrams are not referred/);
  assert.match(ctx, /Terminology is clustered/);
  assert.doesNotMatch(ctx, /fourth comment/, "the prompt is capped at three");
});

test("a teacher's single total mark is enough to compare overall", () => {
  const c = compare({ targetKind: "ia", marks: { total: 9 },
                      econib: { A: 3, B: 2, C: 3, D: 2, E: 2 } });
  assert.equal(c.totalOnly, true);
  assert.equal(c.teacherTotal, 9);
  assert.equal(c.econibTotal, 12, "EconIB's total is summed from its criteria");
  assert.equal(c.totalDiff, 3);
  assert.deepEqual(c.rows, [], "a total says nothing about which criterion was off");
});

test("totals feed the overall figure without inventing per-criterion findings", () => {
  const records = Array.from({ length: 3 }, () =>
    ({ targetKind: "ia", marks: { total: 9 }, econib: { A: 3, B: 2, C: 3, D: 2, E: 2 }, comments: "" }));
  const cal = calibrate(records);
  assert.equal(cal.comparable, 3);
  assert.match(cal.overall.text, /3\.0 marks more generous/);
  for (const id of ["A", "B", "C", "D", "E"]) {
    assert.equal(cal.criteria[id].samples, 0,
      "a total mark must not be spread across criteria as if it were a breakdown");
    assert.equal(cal.criteria[id].enough, false);
  }
  assert.equal(cal.headline, null, "no criterion-level claim can come from totals alone");
});

test("a total mark above 14 is impossible and must be refused upstream", () => {
  const c = compare({ targetKind: "ia", marks: { total: 14 }, econib: { A: 3, B: 2, C: 3, D: 3, E: 3 } });
  assert.equal(c.teacherTotal, 14);
  assert.equal(c.totalDiff, 0, "a perfect 14 against EconIB's 14 is no difference");
});
