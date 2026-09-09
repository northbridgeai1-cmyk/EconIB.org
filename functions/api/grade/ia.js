import { json, handler, readJson, nowIso, HttpError, badRequest } from "../../../shared/http.js";
import { requireUser } from "../../../shared/auth.js";
import { enforce, clientIp } from "../../../shared/ratelimit.js";
import { reserve, refund } from "../../../shared/spend.js";
import { structured, selectRuntime } from "../../../shared/llm.js";
import { iaTool, buildIaPrompt, validateIaResult } from "../../../shared/grading.js";
import { countWords, criterionF, checkKeyConcepts, wordCountStatus } from "../../../public/assets/js/lib/ia-rules.js";
import { shape, portfolioPayload } from "../ia.js";
import { award } from "../../../shared/stats.js";
import { markerContext } from "../../../shared/calibration.js";
import { loadTeacherContext } from "../../../shared/teacher-context.js";

export const onRequestPost = handler(async (ctx) => {
  const user = await requireUser(ctx);
  const db = ctx.env.DB;

  await enforce(db, { route: "grade-ia", identifier: clientIp(ctx.request), limit: 30, windowSeconds: 3600 });

  const body = await readJson(ctx.request);
  const row = await db.prepare("SELECT * FROM commentaries WHERE id = ? AND user_id = ?")
    .bind(body.id, user.id).first();
  if (!row) throw new HttpError(404, "That commentary does not exist.", "not_found");

  const commentary = shape(row);
  if (countWords(commentary.body) < 150) {
    throw badRequest(
      "There is not enough here to mark. Write at least 150 words first — marking a fragment would give you a number that means nothing.",
      "too_short"
    );
  }
  if (!commentary.keyConcept) throw badRequest("Choose a key concept before marking. Criterion D depends on it.", "no_concept");
  if (!commentary.unit) throw badRequest("Set the syllabus unit before marking.", "no_unit");

  // Resolve the provider BEFORE reserving budget: a misconfigured key should
  // not cost the student one of their daily markings.
  const teacherContext = await loadTeacherContext(db, user.id);
  const runtime = await selectRuntime(user, ctx.env);

  // A student spending their own key spends their own quota, so the shared
  // budget does not apply to them.
  const budget = runtime.source === "byok" ? null : await reserve(db, user.id, ctx.env);

  let result;
  try {
    const words = countWords(commentary.body);
    const { system, user: prompt } = buildIaPrompt(commentary, { words }, teacherContext);
    const out = await structured(runtime, { system, user: prompt, tool: iaTool() });
    result = {
      ...validateIaResult(out.data),
      usage: out.usage,
      markedBy: {
        provider: out.providerLabel,
        model: out.model,
        source: out.source,
        reliability: out.reliability,
        reliabilityNote: out.reliabilityNote,
      },
    };
  } catch (err) {
    if (budget) await refund(db, user.id);
    throw err;
  }

  const now = nowIso();
  await db.prepare("UPDATE commentaries SET marks_json = ?, feedback_json = ?, marked_at = ? WHERE id = ? AND user_id = ?")
    .bind(JSON.stringify(result.marks), JSON.stringify(result), now, row.id, user.id).run();

  const { results } = await db.prepare("SELECT * FROM commentaries WHERE user_id = ? ORDER BY slot").bind(user.id).all();
  const all = (results || []).map(shape);

  // XP for getting a commentary marked is earned once. Re-marking after a
  // revision is a good thing to do and stays free, but pressing the button
  // again must not print XP — a currency you can mint by clicking is worthless,
  // and it would reward the student who clicks over the one who writes.
  const reward = row.marked_at
    ? null
    : await award(db, user.id, "mark_ia", `Commentary ${commentary.slot}`);

  return json({
    reward,
    result,
    wordCount: wordCountStatus(commentary.body),
    // Criterion F and the key-concept clash are recomputed here from the whole
    // portfolio. They are arithmetic, not opinion, and the model is never asked.
    criterionF: criterionF(all),
    keyConcepts: checkKeyConcepts(all),
    portfolio: portfolioPayload(results || []),
    budget,
    markedAt: now,
  }, { request: ctx.request, env: ctx.env });
});
