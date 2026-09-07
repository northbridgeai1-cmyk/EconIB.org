import { json, handler, readJson, nowIso, HttpError } from "../../../shared/http.js";
import { password as validPassword, str } from "../../../shared/validate.js";
import { hashPassword, hashToken, createSession, sessionCookie, publicUser } from "../../../shared/auth.js";
import { enforce, clientIp } from "../../../shared/ratelimit.js";

/** Is this link still good? Lets the page say so before the student types. */
export const onRequestGet = handler(async (ctx) => {
  const token = new URL(ctx.request.url).searchParams.get("token") || "";
  const row = await lookup(ctx.env.DB, token);
  return json({ valid: Boolean(row) }, { request: ctx.request, env: ctx.env });
});

export const onRequestPost = handler(async (ctx) => {
  const { request, env } = ctx;
  const db = env.DB;

  await enforce(db, { route: "reset-ip", identifier: clientIp(request), limit: 20, windowSeconds: 3600 });

  const body = await readJson(request);
  const token = str(body.token, "Reset link", { max: 200, name: "token" });
  const password = validPassword(body.password);

  const row = await lookup(db, token);
  if (!row) {
    throw new HttpError(
      400,
      "That reset link has expired or has already been used. Ask for a new one.",
      "bad_reset_token"
    );
  }

  const { hash, salt, iterations } = await hashPassword(password, env);
  const now = nowIso();

  await db.batch([
    db.prepare("UPDATE users SET pw_hash=?, pw_salt=?, pw_iterations=?, updated_at=? WHERE id=?")
      .bind(hash, salt, iterations, now, row.user_id),
    // The link is single use.
    db.prepare("UPDATE password_resets SET used_at=? WHERE token_hash=?").bind(now, row.token_hash),
    // Whoever changed the password keeps the account; every other signed-in
    // device is logged out. If the reset was someone else regaining control of
    // their account, this is what removes the attacker.
    db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(row.user_id),
  ]);

  const user = await db.prepare("SELECT * FROM users WHERE id = ?").bind(row.user_id).first();
  const { token: sessionToken } = await createSession(db, user.id);

  return json({ ok: true, user: publicUser(user) }, {
    headers: { "set-cookie": sessionCookie(sessionToken) },
    request, env,
  });
});

async function lookup(db, token) {
  if (!token || token.length < 20) return null;
  const row = await db.prepare(
    "SELECT token_hash, user_id, expires_at, used_at FROM password_resets WHERE token_hash = ?"
  ).bind(await hashToken(token)).first();
  if (!row) return null;
  if (row.used_at) return null;
  if (new Date(row.expires_at) < new Date()) return null;
  return row;
}
