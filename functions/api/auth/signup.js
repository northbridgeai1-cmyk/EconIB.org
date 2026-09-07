import { json, handler, readJson, nowIso, HttpError } from "../../../shared/http.js";
import { email, password, str, oneOf, LIMITS } from "../../../shared/validate.js";
import { hashPassword, createSession, sessionCookie, publicUser, newId } from "../../../shared/auth.js";
import { enforce, clientIp } from "../../../shared/ratelimit.js";

export const onRequestPost = handler(async (ctx) => {
  const { request, env } = ctx;
  const db = env.DB;

  await enforce(db, { route: "signup", identifier: clientIp(request), limit: 5, windowSeconds: 3600 });

  const body = await readJson(request);
  const mail = email(body.email);
  const pw = password(body.password);
  const name = str(body.name, "Name", { max: LIMITS.name, name: "name" });
  const yearGroup = oneOf(body.yearGroup, ["IB1", "IB2"], "Year", "yearGroup");
  const level = oneOf(body.level, ["SL", "HL"], "Level", "level");
  const examSession = str(body.examSession, "Exam session", { max: LIMITS.examSession, required: false, name: "examSession" });

  const existing = await db.prepare("SELECT id FROM users WHERE email = ?").bind(mail).first();
  if (existing) {
    throw new HttpError(409, "There is already an account with that email. Sign in instead.", "email_taken", { field: "email" });
  }

  const { hash, salt, iterations } = await hashPassword(pw, env);
  const id = newId();
  const now = nowIso();

  await db.prepare(
    `INSERT INTO users (id, email, name, pw_hash, pw_salt, pw_iterations, year_group, level, exam_session, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, mail, name, hash, salt, iterations, yearGroup, level, examSession, now, now).run();

  const row = await db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
  const { token } = await createSession(db, id);

  return json({ user: publicUser(row) }, {
    status: 201,
    headers: { "set-cookie": sessionCookie(token) },
    request, env,
  });
});
