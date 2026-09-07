import { json, handler, readJson, nowIso, notFound } from "../../../shared/http.js";
import { requireUser } from "../../../shared/auth.js";
import { shape, readFields } from "../ia.js";

async function own(ctx, user) {
  const row = await ctx.env.DB
    .prepare("SELECT * FROM commentaries WHERE id = ? AND user_id = ?")
    .bind(ctx.params.id, user.id).first();
  // Scoped by user_id in the query itself, so another account's id reads as
  // missing rather than forbidden — and cannot be probed for existence.
  if (!row) throw notFound("That commentary does not exist.");
  return row;
}

export const onRequestGet = handler(async (ctx) => {
  const user = await requireUser(ctx);
  return json({ commentary: shape(await own(ctx, user)) }, { request: ctx.request, env: ctx.env });
});

export const onRequestPatch = handler(async (ctx) => {
  const user = await requireUser(ctx);
  const row = await own(ctx, user);
  const body = await readJson(ctx.request, { maxBytes: 256 * 1024 });
  const f = readFields(body, row);

  await ctx.env.DB.prepare(
    `UPDATE commentaries SET title=?, source=?, article_url=?, published_at=?, written_at=?,
            unit=?, key_concept=?, body=?, updated_at=? WHERE id=? AND user_id=?`
  ).bind(f.title, f.source, f.articleUrl, f.publishedAt, f.writtenAt, f.unit, f.keyConcept,
         f.body, nowIso(), row.id, user.id).run();

  const updated = await ctx.env.DB.prepare("SELECT * FROM commentaries WHERE id = ?").bind(row.id).first();
  return json({ commentary: shape(updated) }, { request: ctx.request, env: ctx.env });
});

export const onRequestDelete = handler(async (ctx) => {
  const user = await requireUser(ctx);
  const row = await own(ctx, user);
  await ctx.env.DB.prepare("DELETE FROM commentaries WHERE id = ? AND user_id = ?").bind(row.id, user.id).run();
  return json({ ok: true, deleted: row.id }, { request: ctx.request, env: ctx.env });
});
