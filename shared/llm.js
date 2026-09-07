/**
 * Provider-agnostic structured generation.
 *
 * Two adapters: Anthropic's Messages API, and the OpenAI chat-completions shape
 * that Groq, Gemini's compatibility endpoint and OpenRouter all speak.
 *
 * Both are asked to fill in exactly one strict tool schema, so the caller gets
 * the same object back regardless of who produced it.
 */
import Anthropic from "@anthropic-ai/sdk";
import { HttpError } from "./http.js";
import { resolve } from "./providers.js";
import { decryptKey } from "./crypto.js";

/** Which key to use, and whose quota it spends. */
export async function selectRuntime(user, env) {
  const chosen = resolve({ user, env });
  if (!chosen) throw new HttpError(503, "No AI provider is configured.", "ai_unconfigured");

  if (chosen.source === "byok") {
    const apiKey = await decryptKey(user.ai_key_encrypted, env);
    if (!apiKey) throw new HttpError(400, "Your saved API key is unreadable. Add it again.", "bad_byok");
    return { ...chosen, apiKey };
  }

  const apiKey = env.SHARED_AI_KEY || env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new HttpError(
      503,
      "Shared AI marking is not configured on this deployment. Add your own API key in your account settings to mark your work.",
      "ai_unconfigured"
    );
  }
  return { ...chosen, apiKey };
}

export async function structured(runtime, { system, user, tool, maxTokens = 8000 }) {
  const { provider, model, apiKey } = runtime;
  const data = provider.kind === "anthropic"
    ? await viaAnthropic({ apiKey, model, system, user, tool, maxTokens })
    : await viaOpenAI({ provider, apiKey, model, system, user, tool, maxTokens });

  return {
    data: data.args,
    usage: data.usage,
    provider: provider.id,
    providerLabel: provider.label,
    model,
    source: runtime.source,
    reliability: provider.reliability,
    reliabilityNote: provider.reliabilityNote,
  };
}

// ------------------------------------------------------------------ anthropic

async function viaAnthropic({ apiKey, model, system, user, tool, maxTokens }) {
  const client = new Anthropic({ apiKey });
  const base = {
    model,
    max_tokens: maxTokens,
    system,
    output_config: { effort: "high" },
    tools: [{ name: tool.name, description: tool.description, input_schema: tool.input_schema, strict: true }],
    messages: [{ role: "user", content: user }],
  };

  let response;
  try {
    response = await client.messages.create({ ...base, tool_choice: { type: "tool", name: tool.name } });
  } catch (err) {
    if (err instanceof Anthropic.BadRequestError && /tool_choice/i.test(err.message || "")) {
      response = await client.messages.create({ ...base, tool_choice: { type: "auto" } });
    } else {
      throw translateAnthropic(err);
    }
  }

  if (response.stop_reason === "refusal") {
    throw new HttpError(422, "The marker declined to assess this submission.", "refused");
  }
  const call = response.content.find((b) => b.type === "tool_use" && b.name === tool.name);
  if (!call) throw new HttpError(502, "The marker did not return a usable result. Try again.", "no_structured_output");

  return {
    args: call.input,
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    },
  };
}

function translateAnthropic(err) {
  if (err instanceof Anthropic.AuthenticationError) {
    return new HttpError(401, "That Anthropic API key was rejected. Check it in your account settings.", "bad_key");
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new HttpError(429, "Rate limited by Anthropic. Try again in a minute.", "ai_rate_limited");
  }
  console.error("anthropic error", err?.status, err?.message);
  return new HttpError(502, "The marker could not be reached. Try again.", "ai_upstream");
}

// ------------------------------------------------- openai-compatible providers

async function viaOpenAI({ provider, apiKey, model, system, user, tool, maxTokens }) {
  const body = {
    model,
    max_tokens: maxTokens,
    temperature: 0, // marking should be as repeatable as the model allows
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    tools: [{
      type: "function",
      function: { name: tool.name, description: tool.description, parameters: tool.input_schema },
    }],
    tool_choice: { type: "function", function: { name: tool.name } },
  };

  let res;
  try {
    res = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new HttpError(502, `Could not reach ${provider.label}. Try again.`, "ai_upstream");
  }

  if (!res.ok) throw translateOpenAI(res.status, provider, await safeText(res));

  let json;
  try { json = await res.json(); } catch {
    throw new HttpError(502, `${provider.label} returned something unreadable.`, "ai_upstream");
  }

  const message = json?.choices?.[0]?.message;
  const call = message?.tool_calls?.[0];
  if (!call?.function?.arguments) {
    throw new HttpError(
      502,
      `${provider.label} did not return a structured result. This model may not support tool use — pick another in your account settings.`,
      "no_structured_output"
    );
  }

  let args;
  try {
    args = JSON.parse(call.function.arguments);
  } catch {
    // Never string-match a model's JSON; if it will not parse, say so.
    throw new HttpError(502, `${provider.label} returned malformed JSON. Try again.`, "bad_ai_result");
  }

  return {
    args,
    usage: {
      inputTokens: json.usage?.prompt_tokens ?? 0,
      outputTokens: json.usage?.completion_tokens ?? 0,
    },
  };
}

async function safeText(res) {
  try { return (await res.text()).slice(0, 300); } catch { return ""; }
}

function translateOpenAI(status, provider, detail) {
  if (status === 401 || status === 403) {
    return new HttpError(401, `${provider.label} rejected that API key. Check it in your account settings.`, "bad_key");
  }
  if (status === 429) {
    return new HttpError(
      429,
      `${provider.label}'s free limit is used up for now. Free tiers cap tokens per day, not just requests — add your own key in account settings to keep going.`,
      "ai_rate_limited"
    );
  }
  if (status === 404) {
    return new HttpError(400, `${provider.label} does not have that model. Pick another in your account settings.`, "bad_model");
  }
  console.error(`${provider.id} error ${status}: ${detail}`);
  return new HttpError(502, `${provider.label} could not complete the marking. Try again.`, "ai_upstream");
}
