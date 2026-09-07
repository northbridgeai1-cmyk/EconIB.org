/**
 * AI spend caps.
 *
 * Counted per user AND globally. A per-user cap alone does not protect the bill
 * if an attacker can create accounts, and a global cap alone lets one user
 * exhaust everyone else's budget. Both are cheap; both are here.
 */
import { HttpError, utcDay } from "./http.js";

const GLOBAL_KEY = "@global";

export async function reserve(db, userId, env) {
  const day = utcDay();
  const perUser = Number(env.AI_DAILY_LIMIT_PER_USER || 25);
  const global = Number(env.AI_DAILY_LIMIT_GLOBAL || 1000);

  const [userRow, globalRow] = await Promise.all([
    db.prepare("SELECT calls FROM ai_usage WHERE user_id = ? AND day = ?").bind(userId, day).first(),
    db.prepare("SELECT calls FROM ai_usage WHERE user_id = ? AND day = ?").bind(GLOBAL_KEY, day).first(),
  ]);

  if ((userRow?.calls ?? 0) >= perUser) {
    throw new HttpError(
      429,
      `You have used all ${perUser} markings for today. The limit resets at midnight UTC.`,
      "daily_limit",
      { limit: perUser, used: userRow.calls, scope: "user" }
    );
  }
  if ((globalRow?.calls ?? 0) >= global) {
    throw new HttpError(
      429,
      "EconIB has hit its marking limit for today. Try again tomorrow.",
      "global_limit",
      { scope: "global" }
    );
  }

  await db.batch([
    db.prepare(
      `INSERT INTO ai_usage (user_id, day, calls) VALUES (?, ?, 1)
       ON CONFLICT(user_id, day) DO UPDATE SET calls = calls + 1`
    ).bind(userId, day),
    db.prepare(
      `INSERT INTO ai_usage (user_id, day, calls) VALUES (?, ?, 1)
       ON CONFLICT(user_id, day) DO UPDATE SET calls = calls + 1`
    ).bind(GLOBAL_KEY, day),
  ]);

  return { used: (userRow?.calls ?? 0) + 1, limit: perUser, remaining: perUser - (userRow?.calls ?? 0) - 1 };
}

/** Give a reservation back when the call failed before doing any work. */
export async function refund(db, userId) {
  const day = utcDay();
  await db.batch([
    db.prepare("UPDATE ai_usage SET calls = MAX(0, calls - 1) WHERE user_id = ? AND day = ?").bind(userId, day),
    db.prepare("UPDATE ai_usage SET calls = MAX(0, calls - 1) WHERE user_id = ? AND day = ?").bind(GLOBAL_KEY, day),
  ]);
}

export async function usageToday(db, userId, env) {
  const day = utcDay();
  const row = await db.prepare("SELECT calls FROM ai_usage WHERE user_id = ? AND day = ?").bind(userId, day).first();
  const limit = Number(env.AI_DAILY_LIMIT_PER_USER || 25);
  return { used: row?.calls ?? 0, limit, remaining: Math.max(0, limit - (row?.calls ?? 0)) };
}
