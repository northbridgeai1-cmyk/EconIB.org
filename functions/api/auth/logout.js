import { json, handler } from "../../../shared/http.js";
import { destroySession, readSessionToken, sessionCookie } from "../../../shared/auth.js";

export const onRequestPost = handler(async (ctx) => {
  await destroySession(ctx.env.DB, readSessionToken(ctx.request));
  // Always clear the cookie, even if there was no session to destroy, so the
  // browser is never left holding a token the server has forgotten.
  return json({ ok: true }, {
    headers: { "set-cookie": sessionCookie("", { clear: true }) },
    request: ctx.request, env: ctx.env,
  });
});
