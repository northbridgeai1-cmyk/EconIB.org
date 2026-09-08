-- Real marks from the student's own teacher, entered by the student.
--
-- This is assessment data about a named person, so it is deliberately minimal:
-- the marks, the student's own note of what was said, and what it refers to.
-- No teacher name, no school, no identifying detail about a third party who
-- never agreed to be in this database.
--
-- It belongs to the student. Deleting the account deletes it, and a single
-- record can be removed at any time.
CREATE TABLE IF NOT EXISTS teacher_feedback (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('ia','paper')),
  target_id   TEXT,               -- commentary id, or paper_attempts id
  rubric_id   TEXT,               -- p1a | p1b | p2g | p3b, papers only
  marks_json  TEXT NOT NULL,      -- {"A":2,...} for an IA, {"mark":9} for a paper
  max_marks   INTEGER NOT NULL,
  econib_json TEXT,               -- what EconIB said at the time, frozen for comparison
  comments    TEXT NOT NULL DEFAULT '',
  received_at TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_feedback_user ON teacher_feedback(user_id, created_at);
