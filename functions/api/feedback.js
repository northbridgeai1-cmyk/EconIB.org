import { json, handler, readJson, nowIso, notFound, badRequest } from "../../shared/http.js";
import { str, intIn, optionalDate } from "../../shared/validate.js";
import { requireUser, newId } from "../../shared/auth.js";
import { calibrate, IA_CRITERIA } from "../../shared/calibration.js";

const MAX_COMMENT = 2000;

function shape(row) {
  return {
    id: row.id,
    targetKind: row.target_kind,
    targetId: row.target_id,
    rubricId: row.rubric_id,
    marks: JSON.parse(row.marks_json || "{}"),
    econib: row.econib_json ? JSON.parse(row.econib_json) : {},
    maxMarks: row.max_marks,
    comments: row.comments,
    receivedAt: row.received_at,
    createdAt: row.created_at,
  };
}

export const onRequestGet = handler(async (ctx) => {
  const user = await requireUser(ctx);
  const { results } = await ctx.env.DB
    .prepare("SELECT * FROM teacher_feedback WHERE user_id = ? ORDER BY created_at DESC")
    .bind(user.id).all();
  const records = (results || []).map(shape);
  return json({ records, calibration: calibrate(records) },
    { request: ctx.request, env: ctx.env });
});

export const onRequestPost = handler(async (ctx) => {
  const user = await requireUser(ctx);
  const body = await readJson(ctx.request);
  const kind = body.targetKind === "paper" ? "paper" : "ia";
  const comments = str(body.comments, "Comments", { max: MAX_COMMENT, required: false, name: "comments" });
  const receivedAt = optionalDate(body.receivedAt, "Date received");

  let marks = {};
  let maxMarks = 0;
  let econib = {};
  let targetId = body.targetId ? str(body.targetId, "Target", { max: 64, name: "targetId" }) : null;
  let rubricId = null;

  if (kind === "ia") {
    const total = body.marks?.total;
    if (total !== undefined && total !== null && total !== "") {
      // Just the final mark. Enough to see whether EconIB is generous overall.
      marks = { total: intIn(total, 0, 14, "Total mark", "marks.total") };
    } else {
      // Or the breakdown. Each criterion is optional — a teacher may only have
      // commented on some of them.
      for (const c of IA_CRITERIA) {
        const v = body.marks?.[c.id];
        if (v === undefined || v === null || v === "") continue;
        marks[c.id] = intIn(v, 0, c.max, `Criterion ${c.id}`, `marks.${c.id}`);
      }
      if (!Object.keys(marks).length) {
        throw badRequest("Enter a total mark, or at least one criterion.", "no_marks", { field: "marks" });
      }
    }
    maxMarks = 14;

    if (targetId) {
      const row = await ctx.env.DB
        .prepare("SELECT marks_json FROM commentaries WHERE id = ? AND user_id = ?")
        .bind(targetId, user.id).first();
      if (!row) throw notFound("That commentary does not exist.");
      // Freeze what EconIB said at the time. If it is marked again later the
      // comparison must not silently change underneath the record.
      econib = row.marks_json ? JSON.parse(row.marks_json) : {};
    }
  } else {
    rubricId = str(body.rubricId, "Paper type", { max: 8, name: "rubricId" });
    const max = { p1a: 10, p1b: 15, p2g: 15, p3b: 10 }[rubricId];
    if (!max) throw badRequest("Unknown paper type.", "bad_rubric", { field: "rubricId" });
    marks = { mark: intIn(body.marks?.mark, 0, max, "Mark", "marks.mark") };
    maxMarks = max;

    if (targetId) {
      const row = await ctx.env.DB
        .prepare("SELECT result_json FROM paper_attempts WHERE id = ? AND user_id = ?")
        .bind(targetId, user.id).first();
      if (!row) throw notFound("That attempt does not exist.");
      const parsed = row.result_json ? JSON.parse(row.result_json) : {};
      econib = Number.isFinite(parsed.mark) ? { mark: parsed.mark } : {};
    }
  }

  const id = newId();
  await ctx.env.DB.prepare(
    `INSERT INTO teacher_feedback
       (id, user_id, target_kind, target_id, rubric_id, marks_json, max_marks, econib_json, comments, received_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, user.id, kind, targetId, rubricId, JSON.stringify(marks), maxMarks,
         JSON.stringify(econib), comments, receivedAt, nowIso()).run();

  const { results } = await ctx.env.DB
    .prepare("SELECT * FROM teacher_feedback WHERE user_id = ? ORDER BY created_at DESC")
    .bind(user.id).all();
  const records = (results || []).map(shape);

  return json({ ok: true, id, records, calibration: calibrate(records) },
    { status: 201, request: ctx.request, env: ctx.env });
});

export const onRequestDelete = handler(async (ctx) => {
  const user = await requireUser(ctx);
  const id = new URL(ctx.request.url).searchParams.get("id");
  if (!id) throw badRequest("Which record?", "no_id");
  const row = await ctx.env.DB
    .prepare("SELECT id FROM teacher_feedback WHERE id = ? AND user_id = ?")
    .bind(id, user.id).first();
  if (!row) throw notFound("That record does not exist.");
  await ctx.env.DB.prepare("DELETE FROM teacher_feedback WHERE id = ? AND user_id = ?")
    .bind(id, user.id).run();
  return json({ ok: true, deleted: id }, { request: ctx.request, env: ctx.env });
});
