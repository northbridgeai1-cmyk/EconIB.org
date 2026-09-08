-- Streaks, XP and per-topic practice counts.
--
-- Kept in its own table rather than columns on users: it is written far more
-- often than the account row, and a student's progress should be deletable
-- without touching their identity.
CREATE TABLE IF NOT EXISTS user_stats (
  user_id        TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  xp             INTEGER NOT NULL DEFAULT 0,
  streak_days    INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_active    TEXT,                      -- YYYY-MM-DD, UTC
  updated_at     TEXT NOT NULL
);

-- One row per thing the student did, so the dashboard can say what earned the
-- XP rather than showing a number with no story behind it.
CREATE TABLE IF NOT EXISTS activity (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  detail     TEXT NOT NULL DEFAULT '',
  xp         INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity(user_id, created_at);
