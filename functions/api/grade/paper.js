import { json, handler, readJson, nowIso, badRequest, HttpError } from "../../../shared/http.js";
import { str, LIMITS } from "../../../shared/validate.js";
import { requireUser, newId } from "../../../shared/auth.js";
import { enforce, clientIp } from "../../../shared/ratelimit.js";
import { reserve, refund } from "../../../shared/spend.js";
import { structured, selectRuntime } from "../../../shared/llm.js";
import { paperRubric, paperTool, buildPaperPrompt, validatePaperResult } from "../../../shared/grading.js";
import { canUseRubric } from "../../../shared/access.js";
import { countWords } from "../../../public/assets/js/lib/ia-rules.js";

export const onRequestPost = handler(async (ctx) => {
  const user = await requireUser(ctx);
  const db = ctx.env.DB;

  await enforce(db, { route: "grade-paper", identifier: clientIp(ctx.request), limit: 30, windowSeconds: 3600 });

  const body = await readJson(ctx.request, { maxBytes: 128 * 1024 });
  const rubric = paperRubric(str(body.rubricId, "Paper type", { max: 8 }));

  // Paper 3 is HL only. The UI hides it for SL students, but the UI is not the
  // control — the API is. Without this an SL account could mark against an HL
  // rubric and spend budget doing it.
  if (!canUseRubric(user.level, rubric.id)) {
    throw new HttpError(
      403,
      "Paper 3 is HL only. Your account is set to SL — change it in your account settings if that is wrong.",
      "hl_only"
    );
  }

  const question = str(body.question, "Question", { max: LIMITS.question, required: false });
  const answer = str(body.answer, "Answer", { max: LIMITS.answer, trim: false });

  const words = countWords(answer);
  if (words < 80) {
    throw badRequest(
      "There is not enough here to mark against a markband. Write at least 80 words.",
      "too_short"
    );
  }

  const runtime = await selectRuntime(user, ctx.env);
  const budget = runtime.source === "byok" ? null : await reserve(db, user.id, ctx.env);

  let result;
  try {
    const { system, user: prompt } = buildPaperPrompt(rubric, { question, answer });
    const out = await structured(runtime, { system, user: prompt, tool: paperTool(rubric) });
    result = {
      ...validatePaperResult(rubric, out.data),
      usage: out.usage,
      words,
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

  await db.prepare(
    "INSERT INTO paper_attempts (id, user_id, rubric_id, question, answer, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).bind(newId(), user.id, rubric.id, question, answer, JSON.stringify(result), nowIso()).run();

  return json({ result, budget }, { request: ctx.request, env: ctx.env });
});

export const onRequestGet = handler(async (ctx) => {
  const user = await requireUser(ctx);
  const { results } = await ctx.env.DB.prepare(
    "SELECT id, rubric_id, question, result_json, created_at FROM paper_attempts WHERE user_id = ? ORDER BY created_at DESC LIMIT 25"
  ).bind(user.id).all();
  return json({
    attempts: (results || []).map((r) => ({
      id: r.id,
      rubricId: r.rubric_id,
      question: r.question,
      result: r.result_json ? JSON.parse(r.result_json) : null,
      createdAt: r.created_at,
    })),
  }, { request: ctx.request, env: ctx.env });
});
