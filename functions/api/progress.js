import { json, handler, readJson, nowIso } from "../../shared/http.js";
import { intIn, str } from "../../shared/validate.js";
import { requireUser } from "../../shared/auth.js";
import { award } from "../../shared/stats.js";
import syllabus from "../../data/syllabus.json" with { type: "json" };

const VALID_CODES = new Set(syllabus.topics.map((t) => t.code));

export const onRequestGet = handler(async (ctx) => {
  const user = await requireUser(ctx);
  const { results } = await ctx.env.DB
    .prepare("SELECT topic_code, state FROM progress WHERE user_id = ?")
    .bind(user.id).all();
  const map = {};
  for (const r of results || []) map[r.topic_code] = r.state;
  return json({ progress: map }, { request: ctx.request, env: ctx.env });
});

export const onRequestPatch = handler(async (ctx) => {
  const user = await requireUser(ctx);
  const body = await readJson(ctx.request);
  const code = str(body.topicCode, "Topic", { max: 8 });
  if (!VALID_CODES.has(code)) {
    return json({ error: "Unknown topic.", code: "bad_topic" }, { status: 400, request: ctx.request, env: ctx.env });
  }
  const state = intIn(body.state, 0, 2, "State");

  const existing = await ctx.env.DB
    .prepare("SELECT state FROM progress WHERE user_id = ? AND topic_code = ?")
    .bind(user.id, code).first();

  await ctx.env.DB.prepare(
    `INSERT INTO progress (user_id, topic_code, state, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, topic_code) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`
  ).bind(user.id, code, state, nowIso()).run();

  // Only reward an honest first rating, not toggling the same buttons for XP.
  let reward = null;
  if (state > 0 && !existing) reward = await award(ctx.env.DB, user.id, "rate_topic", code);

  return json({ ok: true, topicCode: code, state, reward }, { request: ctx.request, env: ctx.env });
});
