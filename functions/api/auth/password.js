import { json, handler, readJson, nowIso, HttpError } from "../../../shared/http.js";
import { verifier as validVerifier } from "../../../shared/validate.js";
import {
  requireUser, verifyPassword, hashVerifier, readSessionToken, hashToken,
} from "../../../shared/auth.js";
import { enforce, clientIp } from "../../../shared/ratelimit.js";

/** Change your password while signed in. Requires the current one. */
export const onRequestPost = handler(async (ctx) => {
  const user = await requireUser(ctx);
  const db = ctx.env.DB;

  await enforce(db, { route: "change-password", identifier: user.id, limit: 10, windowSeconds: 3600 });

  const body = await readJson(ctx.request);
  const current = typeof body.currentVerifier === "string" ? body.currentVerifier : "";
  const next = validVerifier(body.newVerifier, "newPassword");

  // Requiring the current password stops someone who walks up to an unlocked
  // laptop from locking the owner out of their own account.
  if (!(await verifyPassword(current, user))) {
    throw new HttpError(401, "That is not your current password.", "bad_credentials", { field: "currentPassword" });
  }
  if (current === next) {
    throw new HttpError(400, "That is the password you already have.", "same_password", { field: "newPassword" });
  }

  const { hash, salt, iterations } = await hashVerifier(next);
  const now = nowIso();
  const keep = await hashToken(readSessionToken(ctx.request) || "");

  await db.batch([
    db.prepare("UPDATE users SET pw_hash=?, pw_salt=?, pw_iterations=?, updated_at=? WHERE id=?")
      .bind(hash, salt, iterations, now, user.id),
    // Sign out every other device, but not this one.
    db.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").bind(user.id, keep),
  ]);

  return json({ ok: true, message: "Password changed. Other devices have been signed out." },
    { request: ctx.request, env: ctx.env });
});
