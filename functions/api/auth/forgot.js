import { json, handler, readJson, nowIso } from "../../../shared/http.js";
import { email as validEmail } from "../../../shared/validate.js";
import { newToken, hashToken } from "../../../shared/auth.js";
import { enforce, clientIp } from "../../../shared/ratelimit.js";
import { sendEmail, resetEmail, emailConfigured } from "../../../shared/email.js";

const EXPIRY_MINUTES = 60;

export const onRequestPost = handler(async (ctx) => {
  const { request, env } = ctx;
  const db = env.DB;

  await enforce(db, { route: "forgot-ip", identifier: clientIp(request), limit: 10, windowSeconds: 3600 });

  const body = await readJson(request);
  const mail = validEmail(body.email);

  await enforce(db, { route: "forgot-account", identifier: mail, limit: 5, windowSeconds: 3600 });

  // The same answer whether or not the account exists. Telling a stranger which
  // emails are registered is the whole of account enumeration.
  const generic = {
    ok: true,
    message: "If there is an account with that email, a reset link is on its way. Check your inbox and your spam folder.",
  };

  if (!emailConfigured(env)) {
    return json({
      ok: false,
      code: "email_unconfigured",
      error: "Password reset by email is not set up on this deployment yet. Ask whoever runs EconIB to reset it for you.",
    }, { status: 503, request, env });
  }

  const user = await db.prepare("SELECT id, name, email FROM users WHERE email = ?").bind(mail).first();
  if (!user) return json(generic, { request, env });

  // Any outstanding link for this account stops working the moment a new one is
  // asked for, so a forwarded old email cannot be used later.
  await db.prepare("DELETE FROM password_resets WHERE user_id = ?").bind(user.id).run();

  const token = newToken();
  const now = new Date();
  await db.prepare(
    "INSERT INTO password_resets (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)"
  ).bind(
    await hashToken(token),
    user.id,
    now.toISOString(),
    new Date(now.getTime() + EXPIRY_MINUTES * 60000).toISOString()
  ).run();

  const origin = (env.ALLOWED_ORIGIN || new URL(request.url).origin).replace(/\/+$/, "");
  const link = `${origin}/reset?token=${encodeURIComponent(token)}`;
  const { text, html } = resetEmail({ name: user.name, link, minutes: EXPIRY_MINUTES });

  try {
    await sendEmail(env, { to: user.email, subject: "Reset your EconIB password", text, html });
  } catch (err) {
    // The token is useless without the email, so do not leave it lying around.
    await db.prepare("DELETE FROM password_resets WHERE user_id = ?").bind(user.id).run();
    throw err;
  }

  return json(generic, { request, env });
});
