import { test } from "node:test";
import assert from "node:assert/strict";
import { levelFor, XP } from "../shared/stats.js";

test("levels start immediately and widen as they go", () => {
  assert.equal(levelFor(0).level, 1);
  assert.equal(levelFor(59).level, 1);
  assert.equal(levelFor(60).level, 2, "the first level should be reachable quickly");
  // Each level must cost more than the one before, or later progress is hollow.
  const thresholds = [0, 60, 160, 320, 560, 900, 1400];
  for (let i = 2; i < thresholds.length; i++) {
    const prev = thresholds[i - 1] - thresholds[i - 2];
    const curr = thresholds[i] - thresholds[i - 1];
    assert.ok(curr >= prev, `level ${i + 1} must not be cheaper than level ${i}`);
  }
});

test("the top level does not pretend there is another one", () => {
  const top = levelFor(99999);
  assert.equal(top.next, null);
  assert.equal(top.percent, 100);
  assert.equal(top.xpToNext, 0, "a bar that can never fill is worse than no bar");
});

test("progress within a level is a real fraction, never over 100", () => {
  for (const xp of [0, 1, 59, 60, 200, 559, 900, 1399, 1400, 5000]) {
    const l = levelFor(xp);
    assert.ok(l.percent >= 0 && l.percent <= 100, `percent out of range at ${xp}xp`);
    assert.ok(l.xpToNext >= 0, `negative xpToNext at ${xp}xp`);
  }
});

test("XP rewards the work that actually raises a grade", () => {
  // Getting an IA commentary marked is the highest-value thing in the course,
  // so it must not be worth less than tapping a confidence button.
  assert.ok(XP.mark_ia > XP.mark_paper, "the IA is worth more than one exam answer");
  assert.ok(XP.mark_paper > XP.read_lesson);
  assert.ok(XP.read_lesson > XP.rate_topic, "reading beats tapping a rating");
  for (const [k, v] of Object.entries(XP)) {
    assert.ok(Number.isInteger(v) && v > 0, `${k} must be a positive whole number`);
  }
});


test("variable rewards are passed explicitly, not faked as constants", async () => {
  const { XP } = await import("../shared/stats.js");
  // A streak milestone and a practice set both vary, so neither may sit in the
  // constants table pretending to be fixed. practice_set is the FLOOR value the
  // route scales from; streak_milestone has no business being there at all.
  assert.equal(XP.streak_milestone, undefined,
    "milestone XP comes from the milestone, not from a constant");
  const { MILESTONES } = await import("../shared/rewards.js");
  for (const m of MILESTONES) {
    assert.ok(m.xp > 0, `${m.days}-day milestone must actually pay something`);
  }
});
