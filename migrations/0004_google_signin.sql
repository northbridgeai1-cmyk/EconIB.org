-- Google sign-in, and password columns become nullable.
--
-- SQLite cannot drop a NOT NULL constraint in place, so the table is rebuilt.
-- Safe on an empty or populated database; existing rows keep auth_provider
-- 'password'.
PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS users_new (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  pw_hash       TEXT,
  pw_salt       TEXT,
  pw_iterations INTEGER,
  google_sub    TEXT UNIQUE,
  auth_provider TEXT NOT NULL DEFAULT 'password' CHECK (auth_provider IN ('password','google')),
  year_group    TEXT NOT NULL CHECK (year_group IN ('IB1','IB2')),
  level         TEXT NOT NULL CHECK (level IN ('SL','HL')),
  exam_session  TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  ai_provider      TEXT,
  ai_model         TEXT,
  ai_key_encrypted TEXT,
  ai_key_hint      TEXT
);

INSERT OR IGNORE INTO users_new
  (id, email, name, pw_hash, pw_salt, pw_iterations, auth_provider,
   year_group, level, exam_session, created_at, updated_at,
   ai_provider, ai_model, ai_key_encrypted, ai_key_hint)
SELECT id, email, name, pw_hash, pw_salt, pw_iterations, 'password',
       year_group, level, exam_session, created_at, updated_at,
       ai_provider, ai_model, ai_key_encrypted, ai_key_hint
FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

PRAGMA foreign_keys = ON;
