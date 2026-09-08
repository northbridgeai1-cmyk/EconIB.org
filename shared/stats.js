/**
 * Streaks, XP and levels.
 *
 * The point of this is not decoration. A tool that only pays off in May gives a
 * student nothing to come back for in October, and the habit is what actually
 * produces the grade. So the app has to tell you something you did not know,
 * early and repeatedly — which is what a streak and a level are for.
 *
 * XP is awarded for things that are actually worth doing. Rating a topic
 * honestly is worth more than opening one, and getting a commentary marked is
 * worth most, because that is where the learning is.
 */
import { nowIso, utcDay } from "./http.js";

export const XP = {
  rate_topic: 5,       // being honest about what you do not know
  read_lesson: 10,     // working through a topic properly
  mark_paper: 25,      // writing an exam answer and having it marked
  mark_ia: 40,         // the highest-value thing in the whole course
  save_commentary: 8,
};

/**
 * Levels widen as they go, so early progress feels quick and later levels
 * still mean something. Thresholds are cumulative XP.
 */
const LEVELS = [
  { level: 1, at: 0, name: "Getting started" },
  { level: 2, at: 60, name: "Finding your feet" },
  { level: 3, at: 160, name: "Building up" },
  { level: 4, at: 320, name: "Getting sharp" },
  { level: 5, at: 560, name: "Confident" },
  { level: 6, at: 900, name: "Exam ready" },
  { level: 7, at: 1400, name: "Top of the class" },
];

export function levelFor(xp) {
  let current = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.at) current = l;
  const next = LEVELS.find((l) => l.at > xp) || null;
  const span = next ? next.at - current.at : 1;
  const into = next ? xp - current.at : 1;
  return {
    ...current,
    next,
    xpIntoLevel: into,
    xpForLevel: span,
    percent: next ? Math.round((into / span) * 100) : 100,
    xpToNext: next ? next.at - xp : 0,
  };
}

/** Same calendar day, or the one before it, in UTC. */
function daysBetween(a, b) {
  if (!a || !b) return null;
  const ms = Date.UTC(...a.split("-").map(Number).map((n, i) => (i === 1 ? n - 1 : n)))
           - Date.UTC(...b.split("-").map(Number).map((n, i) => (i === 1 ? n - 1 : n)));
  return Math.round(ms / 86400000);
}

export async function getStats(db, userId) {
  const row = await db.prepare("SELECT * FROM user_stats WHERE user_id = ?").bind(userId).first();
  const xp = row?.xp ?? 0;
  const today = utcDay();
  // A streak that was broken yesterday is already gone, even if nothing has
  // been written since — so it is computed on read, not left stale in the row.
  const gap = row?.last_active ? daysBetween(today, row.last_active) : null;
  const streak = gap === null || gap > 1 ? 0 : (row?.streak_days ?? 0);
  return {
    xp,
    streak,
    longestStreak: row?.longest_streak ?? 0,
    lastActive: row?.last_active ?? null,
    activeToday: gap === 0,
    ...levelFor(xp),
  };
}

/**
 * Record something the student did. Returns what changed, so the interface can
 * show the reward rather than silently incrementing a number.
 */
export async function award(db, userId, kind, detail = "") {
  const gain = XP[kind] ?? 0;
  const today = utcDay();
  const before = await getStats(db, userId);

  const row = await db.prepare("SELECT * FROM user_stats WHERE user_id = ?").bind(userId).first();
  const gap = row?.last_active ? daysBetween(today, row.last_active) : null;

  // Same day: streak unchanged. Yesterday: extend. Anything else: start again.
  let streak = 1;
  if (gap === 0) streak = row.streak_days || 1;
  else if (gap === 1) streak = (row.streak_days || 0) + 1;

  const xp = (row?.xp ?? 0) + gain;
  const longest = Math.max(row?.longest_streak ?? 0, streak);

  await db.prepare(
    `INSERT INTO user_stats (user_id, xp, streak_days, longest_streak, last_active, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       xp = excluded.xp, streak_days = excluded.streak_days,
       longest_streak = excluded.longest_streak,
       last_active = excluded.last_active, updated_at = excluded.updated_at`
  ).bind(userId, xp, streak, longest, today, nowIso()).run();

  await db.prepare(
    "INSERT INTO activity (id, user_id, kind, detail, xp, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(crypto.randomUUID(), userId, kind, String(detail).slice(0, 120), gain, nowIso()).run();

  const after = levelFor(xp);
  return {
    gained: gain,
    xp,
    streak,
    longestStreak: longest,
    levelledUp: after.level > before.level ? after : null,
    streakExtended: gap === 1,
    ...after,
  };
}

export async function recentActivity(db, userId, limit = 8) {
  const { results } = await db.prepare(
    "SELECT kind, detail, xp, created_at FROM activity WHERE user_id = ? ORDER BY created_at DESC LIMIT ?"
  ).bind(userId, limit).all();
  return results || [];
}
