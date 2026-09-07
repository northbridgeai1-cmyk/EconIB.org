/**
 * Provider registry.
 *
 * Every provider except Anthropic speaks the OpenAI chat-completions shape, so
 * one adapter covers Groq, Gemini's compatibility endpoint, OpenRouter and
 * anything else that follows it. Anthropic has its own adapter.
 *
 * The numbers below are free-tier limits as published by each provider. They
 * change without notice — treat them as guidance for the UI, not as a contract.
 *
 * IMPORTANT: for a marking tool the binding constraint is TOKENS per day, not
 * requests per day. One IA marking costs roughly 4,600 tokens, so a 200,000
 * token daily allowance is about 43 markings for the WHOLE deployment — not
 * the 1,000 the request limit implies.
 */

export const PROVIDERS = {
  groq: {
    id: "groq",
    label: "Groq",
    kind: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    keyUrl: "https://console.groq.com/keys",
    defaultModel: "openai/gpt-oss-120b",
    models: [
      { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B", tokensPerDay: 200000, note: "Best free option for marking." },
      { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B", tokensPerDay: 100000 },
      { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B", tokensPerDay: 500000, note: "Fast but too weak for markbands." },
    ],
    free: true,
    reliability: "moderate",
    reliabilityNote:
      "An open model on a free tier. Useful for spotting what is missing; less reliable than a human on the exact mark. Treat a criterion mark as approximate.",
    dataPolicy: "Groq does not train on API inputs on its free tier at time of writing. Verify this yourself before relying on it.",
    estimatedMarkingsPerDay: 43,
  },

  gemini: {
    id: "gemini",
    label: "Google Gemini",
    kind: "openai",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyUrl: "https://aistudio.google.com/apikey",
    defaultModel: "gemini-2.5-flash",
    models: [
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", requestsPerDay: 1500 },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", requestsPerDay: 50, note: "Stronger, but only 50 requests a day." },
    ],
    free: true,
    reliability: "moderate",
    reliabilityNote:
      "Capable, but on a free tier. Treat a criterion mark as approximate rather than exact.",
    dataPolicy:
      "WARNING: on Google's free tier, submitted text and responses may be used to improve Google products and may be read by human reviewers. Google advises against sending confidential material. Your commentary is coursework — do not use this tier unless you accept that.",
    dataPolicyRisk: "high",
    estimatedMarkingsPerDay: 1500,
  },

  anthropic: {
    id: "anthropic",
    label: "Anthropic Claude",
    kind: "anthropic",
    baseUrl: "https://api.anthropic.com",
    keyUrl: "https://console.anthropic.com/settings/keys",
    defaultModel: "claude-sonnet-5",
    models: [
      { id: "claude-opus-5", label: "Claude Opus 5", note: "Best marking quality. Roughly $0.06 a marking." },
      { id: "claude-sonnet-5", label: "Claude Sonnet 5", note: "Roughly $0.025 a marking." },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", note: "Roughly $0.012 a marking." },
    ],
    free: false,
    reliability: "high",
    reliabilityNote:
      "The most reliable option here for rubric-adherent marking. Still not an official mark.",
    dataPolicy: "Anthropic does not train on API inputs.",
  },

  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    kind: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    keyUrl: "https://openrouter.ai/keys",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    models: [
      { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B (free)" },
      { id: "openai/gpt-oss-120b:free", label: "GPT-OSS 120B (free)" },
    ],
    free: true,
    reliability: "low",
    reliabilityNote:
      "Free routes change without notice and have no availability guarantee. Fine for experimenting, poor to depend on.",
    dataPolicy:
      "WARNING: free routes on OpenRouter may allow the upstream provider to use your prompts for model improvement. Check the policy on the specific model.",
    dataPolicyRisk: "high",
    estimatedMarkingsPerDay: 50,
  },
};

export const DEFAULT_PROVIDER = "groq";

export function getProvider(id) {
  return PROVIDERS[id] || null;
}

/** What the client is allowed to know. Never a key, never a base URL secret. */
export function publicProviders() {
  return Object.values(PROVIDERS).map((p) => ({
    id: p.id,
    label: p.label,
    keyUrl: p.keyUrl,
    free: p.free,
    reliability: p.reliability,
    reliabilityNote: p.reliabilityNote,
    dataPolicy: p.dataPolicy,
    dataPolicyRisk: p.dataPolicyRisk || "normal",
    defaultModel: p.defaultModel,
    models: p.models,
    estimatedMarkingsPerDay: p.estimatedMarkingsPerDay ?? null,
  }));
}

export function isValidModel(providerId, modelId) {
  const p = getProvider(providerId);
  if (!p) return false;
  return p.models.some((m) => m.id === modelId);
}

/** Resolve which provider, model and key a given request should use. */
export function resolve({ user, env }) {
  // A student's own key always wins: it is their quota and their data policy.
  if (user?.ai_provider && user?.ai_key_encrypted) {
    const p = getProvider(user.ai_provider);
    if (p) {
      return {
        provider: p,
        model: isValidModel(p.id, user.ai_model) ? user.ai_model : p.defaultModel,
        source: "byok",
      };
    }
  }
  const sharedId = env.SHARED_AI_PROVIDER || DEFAULT_PROVIDER;
  const p = getProvider(sharedId);
  if (!p) return null;
  return {
    provider: p,
    model: isValidModel(p.id, env.SHARED_AI_MODEL) ? env.SHARED_AI_MODEL : p.defaultModel,
    source: "shared",
  };
}
