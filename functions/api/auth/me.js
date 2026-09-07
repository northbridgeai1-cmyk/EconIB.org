import { json, handler, readJson, nowIso } from "../../../shared/http.js";
import { str, oneOf, LIMITS } from "../../../shared/validate.js";
import { requireUser, publicUser, readSessionToken, sessionCookie } from "../../../shared/auth.js";
import { usageToday } from "../../../shared/spend.js";

export const onRequestGet = handler(async (ctx) => {
  const user = await requireUser(ctx);
  const usage = await usageToday(ctx.env.DB, user.id, ctx.env);
  return json({ user: publicUser(user), usage }, { request: ctx.request, env: ctx.env });
});

export const onRequestPatch = handler(async (ctx) => {
  const user = await requireUser(ctx);
  const body = await readJson(ctx.request);

  const name = body.name === undefined ? user.name : str(body.name, "Name", { max: LIMITS.name, name: "name" });
  const yearGroup = body.yearGroup === undefined ? user.year_group : oneOf(body.yearGroup, ["IB1", "IB2"], "Year", "yearGroup");
  const level = body.level === undefined ? user.level : oneOf(body.level, ["SL", "HL"], "Level", "level");
  const examSession = body.examSession === undefined
    ? user.exam_session
    : str(body.examSession, "Exam session", { max: LIMITS.examSession, required: false, name: "examSession" });

  await ctx.env.DB.prepare(
    "UPDATE users SET name = ?, year_group = ?, level = ?, exam_session = ?, updated_at = ? WHERE id = ?"
  ).bind(name, yearGroup, level, examSession, nowIso(), user.id).run();

  const row = await ctx.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(user.id).first();
  return json({ user: publicUser(row) }, { request: ctx.request, env: ctx.env });
});

export const onRequestDelete = handler(async (ctx) => {
  const user = await requireUser(ctx);
  // Foreign keys cascade, but D1 needs the pragma per connection, so delete
  // the children explicitly rather than trusting it.
  const db = ctx.env.DB;
  await db.batch([
    db.prepare("DELETE FROM commentaries WHERE user_id = ?").bind(user.id),
    db.prepare("DELETE FROM paper_attempts WHERE user_id = ?").bind(user.id),
    db.prepare("DELETE FROM progress WHERE user_id = ?").bind(user.id),
    db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id),
    db.prepare("DELETE FROM users WHERE id = ?").bind(user.id),
  ]);
  void readSessionToken(ctx.request);
  return json({ ok: true, deleted: true }, {
    headers: { "set-cookie": sessionCookie("", { clear: true }) },
    request: ctx.request, env: ctx.env,
  });
});
