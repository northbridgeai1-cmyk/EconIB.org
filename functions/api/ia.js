import { json, handler, readJson, nowIso, HttpError } from "../../shared/http.js";
import { str, oneOf, optionalDate, optionalUrl, intIn, LIMITS } from "../../shared/validate.js";
import { requireUser, newId } from "../../shared/auth.js";
import { criterionF, checkKeyConcepts, portfolioTotal, wordCountStatus } from "../../public/assets/js/lib/ia-rules.js";
import keyConcepts from "../../data/key-concepts.json" with { type: "json" };

const CONCEPT_IDS = keyConcepts.concepts.map((c) => c.id);

export function shape(row) {
  return {
    id: row.id,
    slot: row.slot,
    title: row.title,
    source: row.source,
    articleUrl: row.article_url,
    publishedAt: row.published_at,
    writtenAt: row.written_at,
    unit: row.unit,
    keyConcept: row.key_concept,
    body: row.body,
    marks: row.marks_json ? JSON.parse(row.marks_json) : null,
    feedback: row.feedback_json ? JSON.parse(row.feedback_json) : null,
    markedAt: row.marked_at,
    updatedAt: row.updated_at,
  };
}

/** The portfolio plus every deterministic verdict the client should show. */
export function portfolioPayload(rows) {
  const commentaries = rows.map(shape);
  return {
    commentaries,
    criterionF: criterionF(commentaries),
    keyConcepts: checkKeyConcepts(commentaries),
    total: portfolioTotal(commentaries),
    wordCounts: Object.fromEntries(commentaries.map((c) => [c.id, wordCountStatus(c.body)])),
  };
}

export const onRequestGet = handler(async (ctx) => {
  const user = await requireUser(ctx);
  const { results } = await ctx.env.DB
    .prepare("SELECT * FROM commentaries WHERE user_id = ? ORDER BY slot")
    .bind(user.id).all();
  return json(portfolioPayload(results || []), { request: ctx.request, env: ctx.env });
});

export const onRequestPost = handler(async (ctx) => {
  const user = await requireUser(ctx);
  const body = await readJson(ctx.request, { maxBytes: 256 * 1024 });
  const slot = intIn(body.slot, 1, 3, "Slot");

  const existing = await ctx.env.DB
    .prepare("SELECT id FROM commentaries WHERE user_id = ? AND slot = ?")
    .bind(user.id, slot).first();
  if (existing) {
    throw new HttpError(409, `Commentary ${slot} already exists. Edit it instead.`, "slot_taken");
  }

  const fields = readFields(body);
  const id = newId();
  const now = nowIso();

  await ctx.env.DB.prepare(
    `INSERT INTO commentaries
       (id, user_id, slot, title, source, article_url, published_at, written_at, unit, key_concept, body, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, user.id, slot, fields.title, fields.source, fields.articleUrl,
         fields.publishedAt, fields.writtenAt, fields.unit, fields.keyConcept, fields.body, now, now).run();

  const row = await ctx.env.DB.prepare("SELECT * FROM commentaries WHERE id = ?").bind(id).first();
  return json({ commentary: shape(row) }, { status: 201, request: ctx.request, env: ctx.env });
});

export function readFields(body, existing = null) {
  const pick = (key, fallback) => (body[key] === undefined ? fallback : body[key]);
  const unitRaw = pick("unit", existing?.unit ?? null);
  const conceptRaw = pick("keyConcept", existing?.key_concept ?? null);
  return {
    title: str(pick("title", existing?.title ?? ""), "Article title", { max: LIMITS.title, required: false, name: "title" }),
    source: str(pick("source", existing?.source ?? ""), "Source", { max: LIMITS.source, required: false, name: "source" }),
    articleUrl: optionalUrl(pick("articleUrl", existing?.article_url ?? "")),
    publishedAt: optionalDate(pick("publishedAt", existing?.published_at ?? null), "Publication date"),
    writtenAt: optionalDate(pick("writtenAt", existing?.written_at ?? null), "Date written"),
    unit: unitRaw === null || unitRaw === "" ? null : intIn(unitRaw, 2, 4, "Unit", "unit"),
    keyConcept: !conceptRaw ? null : oneOf(conceptRaw, CONCEPT_IDS, "Key concept", "keyConcept"),
    body: str(pick("body", existing?.body ?? ""), "Commentary", { max: LIMITS.body, required: false, trim: false }),
  };
}
