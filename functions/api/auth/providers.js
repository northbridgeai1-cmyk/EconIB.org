import { json, handler } from "../../../shared/http.js";

/** What sign-in methods this deployment can actually offer. */
export const onRequestGet = handler(async (ctx) => {
  return json({
    google: Boolean(ctx.env.GOOGLE_CLIENT_ID && ctx.env.GOOGLE_CLIENT_SECRET),
    password: true,
    passwordReset: Boolean(ctx.env.RESEND_API_KEY && ctx.env.RESET_FROM_EMAIL),
  }, { request: ctx.request, env: ctx.env });
});
