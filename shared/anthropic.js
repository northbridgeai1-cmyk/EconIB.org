/**
 * Anthropic Messages API client.
 *
 * The API key exists only here, in the Worker. It is never shipped to the
 * browser and never appears in any file served to a client.
 */
import Anthropic from "@anthropic-ai/sdk";
import { HttpError } from "./http.js";

export const DEFAULT_MODEL = "claude-opus-5";

export function client(env) {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Fail closed and say so. A grader that silently returns nothing is worse
    // than one that reports it is not configured.
    throw new HttpError(
      503,
      "AI marking is not configured on this deployment yet.",
      "ai_unconfigured"
    );
  }
  return new Anthropic({ apiKey });
}

/**
 * Ask Claude to fill in one strict tool schema and return its arguments.
 *
 * Forced tool choice is supported on Opus 5, but if a model or API version
 * rejects it we retry once with `auto` rather than losing the feature.
 */
export async function structured(env, { system, user, tool, maxTokens = 16000, effort = "high" }) {
  const anthropic = client(env);
  const model = env.ANTHROPIC_MODEL || DEFAULT_MODEL;

  const base = {
    model,
    max_tokens: maxTokens,
    system,
    output_config: { effort },
    tools: [{ ...tool, strict: true }],
    messages: [{ role: "user", content: user }],
  };

  let response;
  try {
    response = await anthropic.messages.create({ ...base, tool_choice: { type: "tool", name: tool.name } });
  } catch (err) {
    if (err instanceof Anthropic.BadRequestError && /tool_choice/i.test(err.message || "")) {
      response = await anthropic.messages.create({ ...base, tool_choice: { type: "auto" } });
    } else {
      throw translate(err);
    }
  }

  if (response.stop_reason === "refusal") {
    throw new HttpError(422, "The marker declined to assess this submission.", "refused");
  }

  const call = response.content.find((b) => b.type === "tool_use" && b.name === tool.name);
  if (!call) {
    throw new HttpError(502, "The marker did not return a usable result. Try again.", "no_structured_output");
  }

  return {
    data: call.input,
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      model: response.model,
    },
  };
}

function translate(err) {
  if (err instanceof Anthropic.AuthenticationError) {
    return new HttpError(503, "AI marking is misconfigured on this deployment.", "ai_auth");
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new HttpError(429, "The marker is busy right now. Try again in a minute.", "ai_rate_limited");
  }
  if (err instanceof Anthropic.APIError) {
    console.error("anthropic api error", err.status, err.message);
    return new HttpError(502, "The marker could not be reached. Try again.", "ai_upstream");
  }
  console.error("anthropic unknown error", err?.stack || err);
  return new HttpError(502, "The marker could not be reached. Try again.", "ai_upstream");
}
