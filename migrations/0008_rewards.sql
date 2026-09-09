-- Streak milestones claimed, and things bought with XP.
--
-- XP is tracked two ways on purpose: user_stats.xp is LIFETIME earned and
-- drives the level, while spending is recorded here. Spending must never lower
-- your level — losing a level because you bought a colour would be a punishment
-- for using the reward.
CREATE TABLE IF NOT EXISTS claims (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  milestone  INTEGER NOT NULL,        -- the streak day reached
  xp_awarded INTEGER NOT NULL,
  claimed_at TEXT NOT NULL,
  PRIMARY KEY (user_id, milestone)
);

CREATE TABLE IF NOT EXISTS purchases (
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id   TEXT NOT NULL,
  cost      INTEGER NOT NULL,
  bought_at TEXT NOT NULL,
  PRIMARY KEY (user_id, item_id)      -- an item is owned, not stockpiled
);
