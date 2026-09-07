-- Password reset tokens for an existing deployment.
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_resets_user ON password_resets(user_id);
CREATE INDEX IF NOT EXISTS idx_resets_expiry ON password_resets(expires_at);
