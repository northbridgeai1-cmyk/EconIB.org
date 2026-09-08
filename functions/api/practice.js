import { json, handler, readJson, badRequest } from "../../shared/http.js";
import { requireUser } from "../../shared/auth.js";
import { award } from "../../shared/stats.js";
import practice from "../../data/practice.json" with { type: "json" };

const BY_ID = new Map(practice.questions.map((q) => [q.id, q]));

/**
 * Mark a finished practice set.
 *
 * Marking happens here, not in the browser. The client sends only which option
 * it chose; if it sent its own score, any student could claim full marks and
 * the XP would mean nothing.
 */
export const onRequestPost = handler(async (ctx) => {
  const user = await requireUser(ctx);
  const body = await readJson(ctx.request);

  const answers = Array.isArray(body.answers) ? body.answers.slice(0, 50) : null;
  if (!answers?.length) throw badRequest("No answers submitted.", "no_answers");

  const results = [];
  for (const a of answers) {
    const q = BY_ID.get(String(a.id));
    if (!q) continue;
    const chosen = Number.isInteger(a.chosen) ? a.chosen : -1;
    results.push({
      id: q.id,
      correct: chosen === q.answer,
      chosen,
      answer: q.answer,
      why: q.why,
    });
  }
  if (!results.length) throw badRequest("None of those questions exist.", "unknown_questions");

  const right = results.filter((r) => r.correct).length;
  const score = Math.round((right / results.length) * 100);

  // XP is scaled by how much was actually right, so guessing through a set
  // earns very little. A perfect set is worth the full amount.
  const scaled = Math.max(2, Math.round((right / results.length) * 15));
  const reward = await award(ctx.env.DB, user.id, "practice_set",
    `${right}/${results.length} correct`, scaled);

  return json({ right, total: results.length, score, results, reward },
    { request: ctx.request, env: ctx.env });
});

export const onRequestGet = handler(async (ctx) => {
  await requireUser(ctx);
  const unit = Number(new URL(ctx.request.url).searchParams.get("unit"));
  const pool = practice.questions.filter((q) => !unit || q.unit === unit);
  // Never send the answer key to the browser.
  const questions = pool.map(({ id, unit: u, topic, stem, options }) => ({ id, unit: u, topic, stem, options }));
  return json({ questions, total: questions.length }, { request: ctx.request, env: ctx.env });
});
