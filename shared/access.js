/**
 * Level gating.
 *
 * Kept as a pure function so it can be tested. The UI also hides HL-only
 * material, but hiding is presentation — this is the control.
 */
import assessment from "../data/assessment.json" with { type: "json" };

/** Paper 3 exists only at HL; everything else is common to SL and HL. */
export const HL_ONLY_RUBRICS = new Set(["p3b"]);

export function canUseRubric(level, rubricId) {
  if (!HL_ONLY_RUBRICS.has(rubricId)) return true;
  return level === "HL";
}

/** The exam components a student at this level actually sits. */
export function componentsFor(level) {
  return assessment.components.filter((c) => c.levels.includes(level));
}

/** HL-only topics are hidden from SL students. */
export function topicVisible(topic, level) {
  return level === "HL" || !topic.hlOnly;
}
