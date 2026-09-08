/**
 * Comparing EconIB's marking against what a student's teacher actually gave.
 *
 * This is the only way to know whether the marking here is any good. It is also
 * the easiest place in the whole product to invent precision, so the rules are
 * strict:
 *
 *   - Two data points is not a pattern. Below MIN_SAMPLES nothing is reported
 *     as a tendency; the UI is told how many more are needed instead.
 *   - A mean difference smaller than HALF A MARK is reported as "no consistent
 *     difference", not as a small one. Saying EconIB runs 0.2 marks generous
 *     over four commentaries is noise dressed as a finding.
 *   - Everything here is arithmetic on marks the student typed. No model is
 *     asked to judge its own accuracy.
 */

export const MIN_SAMPLES = 3;
export const NOISE_FLOOR = 0.5;

export const IA_CRITERIA = [
  { id: "A", name: "Diagrams", max: 3 },
  { id: "B", name: "Terminology", max: 2 },
  { id: "C", name: "Application and analysis", max: 3 },
  { id: "D", name: "Key concept", max: 3 },
  { id: "E", name: "Evaluation", max: 3 },
];

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * One record: what EconIB said next to what the teacher said.
 * A positive difference means EconIB was GENEROUS.
 */
export function compare(record) {
  const teacher = record.marks || {};
  const econib = record.econib || {};

  if (record.targetKind === "ia") {
    const rows = IA_CRITERIA
      .filter((c) => Number.isFinite(Number(teacher[c.id])))
      .map((c) => ({
        id: c.id,
        name: c.name,
        max: c.max,
        teacher: Number(teacher[c.id]),
        econib: Number.isFinite(Number(econib[c.id])) ? Number(econib[c.id]) : null,
      }))
      .map((r) => ({ ...r, diff: r.econib === null ? null : r.econib - r.teacher }));
    const comparable = rows.filter((r) => r.diff !== null);
    return {
      rows,
      teacherTotal: rows.reduce((n, r) => n + r.teacher, 0),
      econibTotal: comparable.length ? comparable.reduce((n, r) => n + r.econib, 0) : null,
      totalDiff: comparable.length === rows.length && rows.length
        ? rows.reduce((n, r) => n + r.diff, 0) : null,
    };
  }

  const t = Number(teacher.mark);
  const e = Number.isFinite(Number(econib.mark)) ? Number(econib.mark) : null;
  return {
    rows: [],
    teacherTotal: Number.isFinite(t) ? t : null,
    econibTotal: e,
    totalDiff: e === null || !Number.isFinite(t) ? null : e - t,
  };
}

/** Turn a mean difference into a sentence a student can act on. */
function describe(meanDiff, n, label) {
  if (n < MIN_SAMPLES) {
    return {
      enough: false,
      text: `Not enough yet — ${MIN_SAMPLES - n} more needed before this means anything.`,
    };
  }
  if (Math.abs(meanDiff) < NOISE_FLOOR) {
    return { enough: true, text: `No consistent difference on ${label}.` };
  }
  const dir = meanDiff > 0 ? "more generous" : "harsher";
  return {
    enough: true,
    text: `EconIB has been about ${Math.abs(meanDiff).toFixed(1)} marks ${dir} than your teacher on ${label}, across ${n} pieces.`,
  };
}

/**
 * Roll a set of records into a picture of where EconIB and the teacher differ.
 * Records with no EconIB mark to compare against are ignored, not counted as
 * agreement.
 */
export function calibrate(records) {
  const ia = records.filter((r) => r.targetKind === "ia");
  const criteria = {};

  for (const c of IA_CRITERIA) {
    const diffs = ia
      .map((r) => compare(r).rows.find((row) => row.id === c.id))
      .filter((row) => row && row.diff !== null)
      .map((row) => row.diff);
    const m = diffs.length ? mean(diffs) : 0;
    criteria[c.id] = {
      id: c.id, name: c.name, max: c.max,
      samples: diffs.length,
      meanDiff: diffs.length ? Number(m.toFixed(2)) : null,
      ...describe(m, diffs.length, c.name.toLowerCase()),
    };
  }

  const totals = records
    .map((r) => compare(r).totalDiff)
    .filter((d) => d !== null);
  const overallMean = totals.length ? mean(totals) : 0;

  return {
    records: records.length,
    comparable: totals.length,
    criteria,
    overall: {
      samples: totals.length,
      meanDiff: totals.length ? Number(overallMean.toFixed(2)) : null,
      ...describe(overallMean, totals.length, "the work overall"),
    },
    // The strongest signal worth showing, if any is strong enough.
    headline: Object.values(criteria)
      .filter((c) => c.enough && Math.abs(c.meanDiff ?? 0) >= NOISE_FLOOR)
      .sort((a, b) => Math.abs(b.meanDiff) - Math.abs(a.meanDiff))[0] || null,
  };
}

/**
 * What to tell the marker about this student, so it stops repeating a mistake
 * their teacher has already corrected. Returns null when there is nothing
 * trustworthy to say — which is the common case early on.
 */
export function markerContext(records) {
  if (!records.length) return null;
  const cal = calibrate(records);
  const lines = [];

  if (cal.headline) {
    lines.push(
      `This student's own teacher has marked them differently from EconIB: ${cal.headline.text} ` +
      `Take that into account rather than repeating it.`
    );
  }

  // Recent teacher comments, in the student's own transcription. Deduplicated:
  // a teacher who says the same thing three times has made ONE point, and
  // repeating it three times in the prompt just crowds out everything else.
  const seen = new Set();
  const comments = [];
  for (const r of records) {
    const text = String(r.comments || "").trim().slice(0, 300);
    if (!text) continue;
    const key = text.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    comments.push(`- ${text}`);
    if (comments.length === 3) break;
  }
  if (comments.length) {
    lines.push(
      "Their teacher has said the following about their recent work. Reinforce it; " +
      "do not contradict it without saying why:",
      ...comments
    );
  }

  return lines.length ? lines.join("\n") : null;
}
