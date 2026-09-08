import { json, handler } from "../../shared/http.js";
import { requireUser } from "../../shared/auth.js";
import { getStats, recentActivity, XP } from "../../shared/stats.js";

export const onRequestGet = handler(async (ctx) => {
  const user = await requireUser(ctx);
  const [stats, activity] = await Promise.all([
    getStats(ctx.env.DB, user.id),
    recentActivity(ctx.env.DB, user.id),
  ]);
  return json({ stats, activity, xpTable: XP }, { request: ctx.request, env: ctx.env });
});
