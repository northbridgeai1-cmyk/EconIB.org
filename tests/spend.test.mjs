import { test } from "node:test";
import assert from "node:assert/strict";
import { reserve, refund, usageToday } from "../shared/spend.js";

/**
 * A minimal stand-in for D1 that enforces the same conditional-UPDATE semantics
 * the real database does, so the cap logic can be tested without a live server.
 */
function fakeDb(initial = {}) {
  const rows = new Map(Object.entries(initial));
  const key = (u, d) => `${u}|${d}`;
  return {
    rows,
    prepare(sql) {
      let bound = [];
      const stmt = {
        bind(...args) { bound = args; return stmt; },
        async run() {
          if (/INSERT OR IGNORE INTO ai_usage/.test(sql)) {
            const k = key(bound[0], bound[1]);
            if (!rows.has(k)) rows.set(k, 0);
            return { meta: { changes: 1 } };
          }
          if (/UPDATE ai_usage SET calls = calls \+ 1 .*calls < \?/s.test(sql)) {
            const k = key(bound[0], bound[1]);
            const limit = bound[2];
            const cur = rows.get(k) ?? 0;
            if (cur < limit) { rows.set(k, cur + 1); return { meta: { changes: 1 } }; }
            return { meta: { changes: 0 } };
          }
          if (/MAX\(0, calls - 1\)/.test(sql)) {
            const k = key(bound[0], bound[1]);
            rows.set(k, Math.max(0, (rows.get(k) ?? 0) - 1));
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        },
        async first() {
          const k = key(bound[0], bound[1]);
          return rows.has(k) ? { calls: rows.get(k) } : null;
        },
      };
      return stmt;
    },
    async batch(stmts) { for (const s of stmts) await s.run(); },
  };
}

const ENV = { AI_DAILY_LIMIT_PER_USER: "3", AI_DAILY_LIMIT_GLOBAL: "5" };

test("the per-user cap allows exactly the limit and no more", async () => {
  const db = fakeDb();
  for (let i = 1; i <= 3; i++) {
    const r = await reserve(db, "u1", ENV);
    assert.equal(r.used, i);
  }
  await assert.rejects(reserve(db, "u1", ENV), (e) => {
    assert.equal(e.status, 429);
    assert.equal(e.code, "daily_limit");
    return true;
  });
});

test("concurrent reservations cannot exceed the cap", async () => {
  // The old code read the count, decided in JavaScript, then wrote. Ten
  // requests firing together could all read the same pre-increment value and
  // all pass. The conditional UPDATE makes the decision and the write one act.
  const db = fakeDb();
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, () => reserve(db, "u1", ENV))
  );
  const ok = results.filter((r) => r.status === "fulfilled").length;
  assert.equal(ok, 3, `exactly 3 should succeed, got ${ok}`);
  assert.equal(db.rows.get("u1|" + new Date().toISOString().slice(0, 10)), 3);
});

test("hitting the global cap refunds the user's own reservation", async () => {
  const db = fakeDb();
  const day = new Date().toISOString().slice(0, 10);
  // Push the global counter to its limit of 5 using other users.
  for (let i = 0; i < 5; i++) await reserve(db, `other${i}`, ENV);
  await assert.rejects(reserve(db, "victim", ENV), (e) => {
    assert.equal(e.code, "global_limit");
    return true;
  });
  // The victim did nothing wrong, so their own counter must be back to zero.
  assert.equal(db.rows.get(`victim|${day}`), 0,
    "a global-cap rejection must not consume the user's personal quota");
});

test("a refund gives back both the user and the global counter", async () => {
  const db = fakeDb();
  const day = new Date().toISOString().slice(0, 10);
  await reserve(db, "u1", ENV);
  assert.equal(db.rows.get(`u1|${day}`), 1);
  await refund(db, "u1");
  assert.equal(db.rows.get(`u1|${day}`), 0);
  assert.equal(db.rows.get(`@global|${day}`), 0);
});

test("usageToday reports what has actually been spent", async () => {
  const db = fakeDb();
  await reserve(db, "u1", ENV);
  await reserve(db, "u1", ENV);
  const u = await usageToday(db, "u1", ENV);
  assert.equal(u.used, 2);
  assert.equal(u.limit, 3);
  assert.equal(u.remaining, 1);
});
