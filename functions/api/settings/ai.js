import { json, handler, readJson, nowIso, badRequest } from "../../../shared/http.js";
import { str, oneOf } from "../../../shared/validate.js";
import { requireUser } from "../../../shared/auth.js";
import { publicProviders, getProvider, isValidModel, DEFAULT_PROVIDER } from "../../../shared/providers.js";
import { encryptKey, maskKey } from "../../../shared/crypto.js";

/** What is configured, and what the student could switch to. Never a real key. */
export const onRequestGet = handler(async (ctx) => {
  const user = await requireUser(ctx);
  const sharedId = ctx.env.SHARED_AI_PROVIDER || DEFAULT_PROVIDER;
  const shared = getProvider(sharedId);
  return json({
    providers: publicProviders(),
    current: {
      provider: user.ai_provider || null,
      model: user.ai_model || null,
      keyHint: user.ai_key_hint || null,
      usingOwnKey: Boolean(user.ai_provider && user.ai_key_encrypted),
    },
    shared: shared
      ? {
          provider: shared.id,
          label: shared.label,
          model: ctx.env.SHARED_AI_MODEL || shared.defaultModel,
          configured: Boolean(ctx.env.SHARED_AI_KEY || ctx.env.ANTHROPIC_API_KEY),
          estimatedMarkingsPerDay: shared.estimatedMarkingsPerDay ?? null,
          reliability: shared.reliability,
          reliabilityNote: shared.reliabilityNote,
        }
      : null,
  }, { request: ctx.request, env: ctx.env });
});

export const onRequestPut = handler(async (ctx) => {
  const user = await requireUser(ctx);
  const body = await readJson(ctx.request);

  const providerId = oneOf(body.provider, Object.keys(require_providers()), "Provider", "provider");
  const provider = getProvider(providerId);
  const model = body.model ? str(body.model, "Model", { max: 100, name: "model" }) : provider.defaultModel;
  if (!isValidModel(providerId, model)) {
    throw badRequest(`${provider.label} does not offer that model.`, "bad_model", { field: "model" });
  }

  const apiKey = str(body.apiKey, "API key", { max: 400, name: "apiKey" });
  if (apiKey.length < 12) throw badRequest("That does not look like an API key.", "bad_key", { field: "apiKey" });

  const encrypted = await encryptKey(apiKey, ctx.env);
  await ctx.env.DB.prepare(
    "UPDATE users SET ai_provider=?, ai_model=?, ai_key_encrypted=?, ai_key_hint=?, updated_at=? WHERE id=?"
  ).bind(providerId, model, encrypted, maskKey(apiKey), nowIso(), user.id).run();

  return json({
    ok: true,
    current: { provider: providerId, model, keyHint: maskKey(apiKey), usingOwnKey: true },
  }, { request: ctx.request, env: ctx.env });
});

export const onRequestDelete = handler(async (ctx) => {
  const user = await requireUser(ctx);
  await ctx.env.DB.prepare(
    "UPDATE users SET ai_provider=NULL, ai_model=NULL, ai_key_encrypted=NULL, ai_key_hint=NULL, updated_at=? WHERE id=?"
  ).bind(nowIso(), user.id).run();
  return json({ ok: true, current: { provider: null, model: null, keyHint: null, usingOwnKey: false } },
    { request: ctx.request, env: ctx.env });
});

function require_providers() {
  return publicProviders().reduce((acc, p) => { acc[p.id] = true; return acc; }, {});
}
