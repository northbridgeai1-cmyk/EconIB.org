import { json, handler, readJson, HttpError } from "../../../shared/http.js";
import { email } from "../../../shared/validate.js";
import { verifyPassword, dummyVerify, createSession, sessionCookie, publicUser } from "../../../shared/auth.js";
import { enforce, clientIp } from "../../../shared/ratelimit.js";

export const onRequestPost = handler(async (ctx) => {
  const { request, env } = ctx;
  const db = env.DB;

  const ip = clientIp(request);
  await enforce(db, { route: "login-ip", identifier: ip, limit: 20, windowSeconds: 900 });

  const body = await readJson(request);
  const mail = email(body.email);
  const supplied = typeof body.password === "string" ? body.password : "";

  // Also limit per account, so one targeted account cannot be ground down from
  // a rotating set of addresses.
  await enforce(db, { route: "login-account", identifier: mail, limit: 10, windowSeconds: 900 });

  const user = await db.prepare("SELECT * FROM users WHERE email = ?").bind(mail).first();

  // Burn equivalent CPU when the account does not exist, so response time does
  // not reveal which emails are registered.
  const ok = user ? await verifyPassword(supplied, user, env) : await dummyVerify(supplied, env);

  if (!ok) {
    throw new HttpError(401, "That email and password do not match.", "bad_credentials");
  }

  const { token } = await createSession(db, user.id);
  return json({ user: publicUser(user) }, { headers: { "set-cookie": sessionCookie(token) }, request, env });
});
