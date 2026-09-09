import { json, handler, readJson, nowIso, badRequest } from "../../shared/http.js";
import { requireUser } from "../../shared/auth.js";
import { getStats, award } from "../../shared/stats.js";
import { MILESTONES, availableMilestones, nextMilestone } from "../../shared/rewards.js";

async function claimed(db, userId) {
  const { results } = await db.prepare("SELECT milestone FROM claims WHERE user_id = ?")
    .bind(userId).all();
  return (results || []).map((r) => r.milestone);
}

export const onRequestGet = handler(async (ctx) => {
  const user = await requireUser(ctx);
  const [stats, done] = await Promise.all([getStats(ctx.env.DB, user.id), claimed(ctx.env.DB, user.id)]);
  return json({
    streak: stats.streak,
    longestStreak: stats.longestStreak,
    claimed: done,
    available: availableMilestones(stats.streak, done),
    next: nextMilestone(stats.streak),
    milestones: MILESTONES.map((m) => ({
      ...m,
      reached: stats.streak >= m.days,
      claimed: done.includes(m.days),
    })),
  }, { request: ctx.request, env: ctx.env });
});

export const onRequestPost = handler(async (ctx) => {
  const user = await requireUser(ctx);
  const db = ctx.env.DB;
  const days = Number((await readJson(ctx.request)).milestone);
  const milestone = MILESTONES.find((m) => m.days === days);
  if (!milestone) throw badRequest("That is not a milestone.", "bad_milestone");

  const stats = await getStats(db, user.id);
  if (stats.streak < milestone.days) {
    throw badRequest(
      `You are on a ${stats.streak} day streak. This one needs ${milestone.days}.`,
      "not_reached"
    );
  }

  // The primary key stops a second claim, so the insert is the guard rather
  // than a check that could be raced.
  const res = await db.prepare(
    "INSERT OR IGNORE INTO claims (user_id, milestone, xp_awarded, claimed_at) VALUES (?, ?, ?, ?)"
  ).bind(user.id, milestone.days, milestone.xp, nowIso()).run();

  if ((res?.meta?.changes ?? 0) === 0) {
    throw badRequest("You have already claimed this one.", "already_claimed");
  }

  const reward = await award(db, user.id, "streak_milestone",
    `${milestone.days} day streak`, milestone.xp);
  const done = await claimed(db, user.id);

  return json({
    ok: true, milestone, reward,
    claimed: done,
    available: availableMilestones(stats.streak, done),
    next: nextMilestone(stats.streak),
  }, { request: ctx.request, env: ctx.env });
});
