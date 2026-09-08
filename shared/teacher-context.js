import { markerContext } from "./calibration.js";

/**
 * Load what this student's teacher has said, for the marker's benefit.
 *
 * Returns null when there is nothing trustworthy to pass on, which is the
 * normal state until a few real marks have been entered. A marker told about
 * one lopsided comparison would over-correct on noise.
 */
export async function loadTeacherContext(db, userId) {
  try {
    const { results } = await db
      .prepare("SELECT * FROM teacher_feedback WHERE user_id = ? ORDER BY created_at DESC LIMIT 20")
      .bind(userId).all();
    const records = (results || []).map((r) => ({
      targetKind: r.target_kind,
      marks: JSON.parse(r.marks_json || "{}"),
      econib: r.econib_json ? JSON.parse(r.econib_json) : {},
      comments: r.comments || "",
    }));
    return markerContext(records);
  } catch {
    // Marking must still work if this table is missing or unreadable.
    return null;
  }
}
