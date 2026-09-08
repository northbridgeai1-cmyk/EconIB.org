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

  // Check and increment in ONE statement. Reading the count, deciding in
  // JavaScript, then writing lets two concurrent requests both read the same
  // pre-increment value, both pass the check, and both spend — so the cap could
  // be exceeded by however many calls were in flight. The conditional UPDATE
  // makes the decision and the write the same atomic act.
  const claim = async (key, limit) => {
    await db.prepare(
      "INSERT OR IGNORE INTO ai_usage (user_id, day, calls) VALUES (?, ?, 0)"
    ).bind(key, day).run();
    const res = await db.prepare(
      "UPDATE ai_usage SET calls = calls + 1 WHERE user_id = ? AND day = ? AND calls < ?"
    ).bind(key, day, limit).run();
    // D1 reports how many rows the UPDATE actually changed; zero means the
    // conditional failed, i.e. the cap was already reached.
    return (res?.meta?.changes ?? 0) > 0;
  };

  if (!(await claim(userId, perUser))) {
    const row = await db.prepare("SELECT calls FROM ai_usage WHERE user_id = ? AND day = ?")
      .bind(userId, day).first();
    throw new HttpError(
      429,
      `You have used all ${perUser} markings for today. The limit resets at midnight UTC.`,
      "daily_limit",
      { limit: perUser, used: row?.calls ?? perUser, scope: "user" }
    );
  }

  if (!(await claim(GLOBAL_KEY, global))) {
    // Give the user's own reservation back — they did nothing wrong.
    await db.prepare("UPDATE ai_usage SET calls = MAX(0, calls - 1) WHERE user_id = ? AND day = ?")
      .bind(userId, day).run();
    throw new HttpError(
      429,
      "EconIB has hit its marking limit for today. Try again tomorrow, or add your own API key in account settings.",
      "global_limit",
      { scope: "global" }
    );
  }

  const row = await db.prepare("SELECT calls FROM ai_usage WHERE user_id = ? AND day = ?")
    .bind(userId, day).first();
  const used = row?.calls ?? 1;
  return { used, limit: perUser, remaining: Math.max(0, perUser - used) };
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
