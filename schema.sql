-- EconIB schema (Cloudflare D1 / SQLite).
-- Apply with:  npm run db:local   /   npm run db:remote

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,     -- stored lowercased and trimmed
  name          TEXT NOT NULL,
  pw_hash       TEXT NOT NULL,            -- base64 PBKDF2-SHA256 derived key
  pw_salt       TEXT NOT NULL,            -- base64, 16 random bytes per user
  pw_iterations INTEGER NOT NULL,         -- recorded so hashes can be upgraded later
  year_group    TEXT NOT NULL CHECK (year_group IN ('IB1','IB2')),
  level         TEXT NOT NULL CHECK (level IN ('SL','HL')),
  exam_session  TEXT,                     -- e.g. "May 2027", free text
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- Sessions store only a hash of the token. A stolen database row cannot be
-- replayed as a session cookie.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

-- Three commentaries per user, addressed by slot so the portfolio is always
-- an ordered set of at most three.
CREATE TABLE IF NOT EXISTS commentaries (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot         INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 3),
  title        TEXT NOT NULL DEFAULT '',
  source       TEXT NOT NULL DEFAULT '',
  article_url  TEXT NOT NULL DEFAULT '',
  published_at TEXT,
  written_at   TEXT,
  unit         INTEGER CHECK (unit IN (2,3,4)),
  key_concept  TEXT,
  body         TEXT NOT NULL DEFAULT '',
  marks_json   TEXT,                      -- last AI marks, {"A":3,...}
  feedback_json TEXT,                     -- last AI feedback payload
  marked_at    TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  UNIQUE (user_id, slot)
);
CREATE INDEX IF NOT EXISTS idx_commentaries_user ON commentaries(user_id);

CREATE TABLE IF NOT EXISTS paper_attempts (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rubric_id  TEXT NOT NULL,               -- p1a | p1b | p2g | p3b
  question   TEXT NOT NULL DEFAULT '',
  answer     TEXT NOT NULL DEFAULT '',
  result_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attempts_user ON paper_attempts(user_id, created_at);

-- Topic confidence: 0 not started, 1 shaky, 2 confident.
CREATE TABLE IF NOT EXISTS progress (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_code TEXT NOT NULL,
  state      INTEGER NOT NULL CHECK (state BETWEEN 0 AND 2),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, topic_code)
);

-- Spend cap. Counted per user per day, and a global row (user_id '@global')
-- so one leaked session cannot run up the whole bill.
CREATE TABLE IF NOT EXISTS ai_usage (
  user_id TEXT NOT NULL,
  day     TEXT NOT NULL,                  -- YYYY-MM-DD in UTC
  calls   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

-- Fixed-window rate limiting for auth and grading routes.
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket       TEXT PRIMARY KEY,          -- "<route>:<identifier>:<window>"
  count        INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL           -- unix seconds
);
CREATE INDEX IF NOT EXISTS idx_rate_window ON rate_limits(window_start);
