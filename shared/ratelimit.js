/**
 * Fixed-window rate limiting backed by D1.
 *
 * Public routes are limited per IP. Expensive routes are limited per account as
 * well, because an IP limit alone does not stop one signed-in user from
 * spending the whole AI budget.
 */
import { tooMany } from "./http.js";

export function clientIp(request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "unknown"
  );
}

/**
 * @returns {Promise<{allowed:boolean, remaining:number, resetsIn:number}>}
 */
export async function consume(db, { route, identifier, limit, windowSeconds }) {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % windowSeconds);
  const bucket = `${route}:${identifier}:${windowStart}`;

  await db
    .prepare(
      `INSERT INTO rate_limits (bucket, count, window_start) VALUES (?, 1, ?)
       ON CONFLICT(bucket) DO UPDATE SET count = count + 1`
    )
    .bind(bucket, windowStart)
    .run();

  const row = await db.prepare("SELECT count FROM rate_limits WHERE bucket = ?").bind(bucket).first();
  const count = row?.count ?? 1;
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetsIn: windowStart + windowSeconds - now,
  };
}

export async function enforce(db, opts) {
  const result = await consume(db, opts);
  if (!result.allowed) {
    const mins = Math.ceil(result.resetsIn / 60);
    throw tooMany(
      `Too many attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`,
      { retryAfterSeconds: result.resetsIn }
    );
  }
  return result;
}

/** Opportunistic cleanup so the table does not grow without bound. */
export async function sweep(db, olderThanSeconds = 86400) {
  const cutoff = Math.floor(Date.now() / 1000) - olderThanSeconds;
  await db.prepare("DELETE FROM rate_limits WHERE window_start < ?").bind(cutoff).run();
}
