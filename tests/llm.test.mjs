import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { structured } from "../shared/llm.js";
import { PROVIDERS, resolve, isValidModel, publicProviders } from "../shared/providers.js";
import { encryptKey, decryptKey, maskKey } from "../shared/crypto.js";

/** A stand-in for Groq/Gemini/OpenRouter, which all speak this shape. */
function mockServer(handler) {
  return new Promise((resolve_) => {
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => handler(req, res, body ? JSON.parse(body) : {}));
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve_({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

const tool = {
  name: "record_ia_marks",
  description: "Record marks",
  input_schema: { type: "object", properties: { criterionA: { type: "integer" } }, required: ["criterionA"], additionalProperties: false },
};

const runtimeFor = (url, over = {}) => ({
  provider: { id: "groq", label: "Groq", kind: "openai", baseUrl: url, reliability: "moderate", reliabilityNote: "note" },
  model: "openai/gpt-oss-120b",
  apiKey: "test-key",
  source: "shared",
  ...over,
});

test("the OpenAI-compatible adapter sends the shape these providers expect", async () => {
  let seen = null;
  let auth = null;
  const { server, url } = await mockServer((req, res, body) => {
    seen = body;
    auth = req.headers.authorization;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      choices: [{ message: { tool_calls: [{ function: { name: tool.name, arguments: '{"criterionA":3}' } }] } }],
      usage: { prompt_tokens: 120, completion_tokens: 40 },
    }));
  });

  const out = await structured(runtimeFor(url), { system: "SYS", user: "USR", tool });
  server.close();

  assert.equal(auth, "Bearer test-key", "the key travels as a bearer token, not a query parameter");
  assert.equal(seen.model, "openai/gpt-oss-120b");
  assert.equal(seen.temperature, 0, "marking must be as repeatable as the model allows");
  assert.deepEqual(seen.messages.map((m) => m.role), ["system", "user"]);
  assert.equal(seen.tools[0].type, "function");
  assert.equal(seen.tools[0].function.name, tool.name);
  assert.deepEqual(seen.tools[0].function.parameters, tool.input_schema);
  assert.deepEqual(seen.tool_choice, { type: "function", function: { name: tool.name } });

  assert.deepEqual(out.data, { criterionA: 3 });
  assert.equal(out.usage.inputTokens, 120);
  assert.equal(out.usage.outputTokens, 40);
  assert.equal(out.provider, "groq");
  assert.equal(out.reliability, "moderate", "the UI needs this to caveat the mark");
});

test("a 429 explains that free tiers cap tokens, not just requests", async () => {
  const { server, url } = await mockServer((req, res) => {
    res.writeHead(429, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: "rate limit" } }));
  });
  await assert.rejects(
    structured(runtimeFor(url), { system: "s", user: "u", tool }),
    (err) => {
      assert.equal(err.status, 429);
      assert.equal(err.code, "ai_rate_limited");
      assert.match(err.message, /tokens per day/i);
      return true;
    }
  );
  server.close();
});

test("a rejected key is reported as a key problem, not a server error", async () => {
  const { server, url } = await mockServer((req, res) => {
    res.writeHead(401); res.end("{}");
  });
  await assert.rejects(
    structured(runtimeFor(url), { system: "s", user: "u", tool }),
    (err) => { assert.equal(err.code, "bad_key"); assert.equal(err.status, 401); return true; }
  );
  server.close();
});

test("a model that ignores tool use is reported as such, not as a crash", async () => {
  const { server, url } = await mockServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content: "Here are the marks: A is 3." } }] }));
  });
  await assert.rejects(
    structured(runtimeFor(url), { system: "s", user: "u", tool }),
    (err) => {
      assert.equal(err.code, "no_structured_output");
      assert.match(err.message, /may not support tool use/i);
      return true;
    }
  );
  server.close();
});

test("malformed JSON from a model is refused rather than string-matched", async () => {
  const { server, url } = await mockServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      choices: [{ message: { tool_calls: [{ function: { name: tool.name, arguments: '{"criterionA": 3' } }] } }],
    }));
  });
  await assert.rejects(
    structured(runtimeFor(url), { system: "s", user: "u", tool }),
    (err) => { assert.equal(err.code, "bad_ai_result"); return true; }
  );
  server.close();
});

test("a student's own key overrides the shared one", () => {
  const byok = resolve({ user: { ai_provider: "groq", ai_key_encrypted: "x", ai_model: "llama-3.3-70b-versatile" }, env: {} });
  assert.equal(byok.source, "byok");
  assert.equal(byok.model, "llama-3.3-70b-versatile");

  const shared = resolve({ user: {}, env: { SHARED_AI_PROVIDER: "anthropic", SHARED_AI_MODEL: "claude-haiku-4-5" } });
  assert.equal(shared.source, "shared");
  assert.equal(shared.model, "claude-haiku-4-5");
});

test("an invalid saved model falls back to the provider default instead of failing", () => {
  const r = resolve({ user: { ai_provider: "groq", ai_key_encrypted: "x", ai_model: "a-model-that-was-retired" }, env: {} });
  assert.equal(r.model, PROVIDERS.groq.defaultModel);
});

test("every provider's default model is one it actually lists", () => {
  for (const p of Object.values(PROVIDERS)) {
    assert.ok(isValidModel(p.id, p.defaultModel), `${p.id} default must be in its own model list`);
    assert.ok(p.baseUrl.startsWith("https://"), `${p.id} must be reached over HTTPS`);
  }
});

test("providers that may train on submissions are flagged as high risk", () => {
  const pub = publicProviders();
  const gemini = pub.find((p) => p.id === "gemini");
  assert.equal(gemini.dataPolicyRisk, "high", "students must be warned before sending coursework");
  assert.match(gemini.dataPolicy, /human reviewers|improve Google/i);
  const anthropic = pub.find((p) => p.id === "anthropic");
  assert.equal(anthropic.dataPolicyRisk, "normal");
});

test("the public provider list never carries a key or an internal field", () => {
  for (const p of publicProviders()) {
    assert.ok(!("apiKey" in p) && !("baseUrl" in p) && !("kind" in p), `${p.id} leaks an internal field`);
  }
});

const env = { KEY_ENCRYPTION_SECRET: "a".repeat(48) };

test("a stored key round-trips and is not stored in plaintext", async () => {
  const key = "gsk_liveKey1234567890abcdef";
  const stored = await encryptKey(key, env);
  assert.ok(!stored.includes(key), "the ciphertext must not contain the key");
  assert.equal(await decryptKey(stored, env), key);
});

test("encrypting the same key twice gives different ciphertext", async () => {
  const a = await encryptKey("gsk_same_key_value_here", env);
  const b = await encryptKey("gsk_same_key_value_here", env);
  assert.notEqual(a, b, "a fresh IV each time, or identical keys are linkable");
});

test("a key encrypted under one secret cannot be read under another", async () => {
  const stored = await encryptKey("gsk_secret_value_x", env);
  await assert.rejects(
    decryptKey(stored, { KEY_ENCRYPTION_SECRET: "b".repeat(48) }),
    (err) => { assert.equal(err.code, "key_undecryptable"); return true; }
  );
});

test("a missing or short encryption secret fails closed", async () => {
  await assert.rejects(encryptKey("x", {}), (e) => e.code === "no_encryption_key");
  await assert.rejects(encryptKey("x", { KEY_ENCRYPTION_SECRET: "tooshort" }), (e) => e.code === "no_encryption_key");
});

test("the masked hint identifies a key without revealing it", () => {
  const key = "gsk_abcdefghijklmnopqrstuvwxyz1234";
  const hint = maskKey(key);
  assert.ok(hint.length < key.length);
  assert.ok(!hint.includes("ghijklmnop"), "the middle must not survive");
  assert.match(hint, /^gsk_ab…1234$/);
  assert.equal(maskKey("short"), "••••");
});
