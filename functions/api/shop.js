import { json, handler, readJson, nowIso, badRequest, HttpError } from "../../shared/http.js";
import { requireUser } from "../../shared/auth.js";
import { getStats } from "../../shared/stats.js";
import { SHOP, SHOP_BY_ID, wallet, canBuy } from "../../shared/rewards.js";

async function spent(db, userId) {
  const row = await db.prepare("SELECT COALESCE(SUM(cost),0) AS total FROM purchases WHERE user_id = ?")
    .bind(userId).first();
  return row?.total ?? 0;
}

async function owned(db, userId) {
  const { results } = await db.prepare("SELECT item_id FROM purchases WHERE user_id = ?")
    .bind(userId).all();
  return (results || []).map((r) => r.item_id);
}

export const onRequestGet = handler(async (ctx) => {
  const user = await requireUser(ctx);
  const db = ctx.env.DB;
  const [stats, used, have] = await Promise.all([
    getStats(db, user.id), spent(db, user.id), owned(db, user.id),
  ]);
  const balance = wallet(stats.xp, used);
  return json({
    balance, lifetimeXp: stats.xp, spent: used, owned: have,
    items: SHOP.map((i) => ({ ...i, owned: have.includes(i.id), ...canBuy(i, balance, have) })),
  }, { request: ctx.request, env: ctx.env });
});

export const onRequestPost = handler(async (ctx) => {
  const user = await requireUser(ctx);
  const db = ctx.env.DB;
  const body = await readJson(ctx.request);
  const item = SHOP_BY_ID.get(String(body.itemId || ""));
  if (!item) throw badRequest("That item does not exist.", "bad_item", { field: "itemId" });

  // The balance check and the write are ONE statement. Checking first and
  // writing after would let two requests fired together both pass the check and
  // both spend, taking the wallet negative.
  const res = await db.prepare(
    `INSERT OR IGNORE INTO purchases (user_id, item_id, cost, bought_at)
     SELECT ?1, ?2, ?3, ?4
     WHERE (SELECT COALESCE(xp,0) FROM user_stats WHERE user_id = ?1)
         - (SELECT COALESCE(SUM(cost),0) FROM purchases WHERE user_id = ?1) >= ?3`
  ).bind(user.id, item.id, item.cost, nowIso()).run();

  if ((res?.meta?.changes ?? 0) === 0) {
    const [stats, used, have] = await Promise.all([
      getStats(db, user.id), spent(db, user.id), owned(db, user.id),
    ]);
    const check = canBuy(item, wallet(stats.xp, used), have);
    throw new HttpError(400, check.reason || "That purchase did not go through.", "cannot_buy");
  }

  const [stats, used, have] = await Promise.all([
    getStats(db, user.id), spent(db, user.id), owned(db, user.id),
  ]);
  return json({
    ok: true, bought: item.id, balance: wallet(stats.xp, used), owned: have,
    // Buying must never change the level. It comes from lifetime XP.
    level: stats.level, lifetimeXp: stats.xp,
  }, { request: ctx.request, env: ctx.env });
});
