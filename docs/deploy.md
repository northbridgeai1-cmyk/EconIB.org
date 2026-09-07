# Deploying EconIB to Cloudflare Pages

You need: the GitHub repo connected to Cloudflare Pages, a D1 database, an
Anthropic API key, and the `econib.org` domain on Cloudflare DNS.

## 1. Workers Paid plan — required, not optional

Password login performs PBKDF2-SHA256 at 600,000 iterations. Measured on this
codebase that costs **~395 ms of CPU per login**.

| Plan | CPU per request | Password login |
|---|---|---|
| Workers Free | 10 ms | **cannot work** — every login fails |
| Workers Paid | 30 s default | works |

This is not a tuning problem. A password KDF is deliberately expensive; that is
what makes it a KDF. Lowering the iteration count to fit 10 ms would leave
password hashes cheap to crack, so the code refuses to run below 100,000
iterations and fails loudly rather than quietly weakening.

If you want to stay on the free plan, the alternative is email magic links: no
password to store and no expensive hash, at the cost of an email provider
dependency and a round trip through the inbox on every new device. That is a
different auth model, not a config change.

## 2. Create the database

```bash
npx wrangler d1 create econib
```

Paste the returned `database_id` into `wrangler.toml`, then apply the schema:

```bash
npx wrangler d1 execute econib --remote --file=./schema.sql
```

## 3. Set the secrets

Never put a key in `wrangler.toml` — that file is committed.

```bash
npx wrangler pages secret put SHARED_AI_KEY
npx wrangler pages secret put KEY_ENCRYPTION_SECRET
```

`SHARED_AI_KEY` is the key for whichever provider `SHARED_AI_PROVIDER` names.
A free Groq key from [console.groq.com/keys](https://console.groq.com/keys) works
and costs nothing.

`KEY_ENCRYPTION_SECRET` encrypts students' own API keys at rest. Generate one:

```bash
openssl rand -base64 48
```

Without it, students cannot save their own key and the server says so plainly
rather than storing a credential in the clear.

### Sizing the shared cap honestly

Free tiers cap **tokens** per day, not just requests, and one IA marking costs
roughly 4,600 tokens. So:

| Shared provider | Daily token allowance | Real markings/day, whole site |
|---|---|---|
| Groq `openai/gpt-oss-120b` | 200,000 | ~43 |
| Groq `llama-3.3-70b-versatile` | 100,000 | ~21 |
| Gemini Flash | 1,500 requests | ~1,500 |

`AI_DAILY_LIMIT_GLOBAL` defaults to 40 to match Groq. Setting it to 1,000 because
the request limit says 1,000 would mean students hit an opaque upstream 429
mid-marking instead of EconIB's own clear message.

**The shared key is a trial tier, not a service.** Past a handful of active
students, point them at account settings to add their own free key — that is the
only configuration that scales without someone paying per marking.

## 4. Set the environment variables

In the Pages project settings, or in `wrangler.toml` under `[vars]`:

| Variable | Value | Notes |
|---|---|---|
| `ALLOWED_ORIGIN` | `https://econib.org` | Exact scheme and host, **no trailing slash**. The browser compares character for character; `https://econib.org/` will never match. |
| `PW_ITERATIONS` | `600000` | Below 100000 the server refuses to start a login. |
| `AI_DAILY_LIMIT_PER_USER` | `25` | Per account per UTC day. |
| `AI_DAILY_LIMIT_GLOBAL` | `1000` | Across all accounts, so one leaked session cannot spend the whole budget. |
| `ANTHROPIC_MODEL` | *(optional)* | Defaults to `claude-opus-5`. Marking quality is the product; change this only deliberately. |

There is deliberately **no wildcard fallback** for `ALLOWED_ORIGIN`. If it is
unset — exactly the state a fresh deployment is in — cross-origin requests are
denied rather than silently allowed. A permissive default makes a
misconfiguration invisible.

## 5. Build settings

| Setting | Value |
|---|---|
| Build command | *(leave empty)* |
| Build output directory | `public` |
| Functions directory | `functions` (default) |

There is no build step. Cloudflare installs `dependencies` from `package.json`
and bundles `functions/` automatically.

## 6. DNS

Add `econib.org` as a custom domain on the Pages project. Cloudflare creates the
records itself once the domain's nameservers point at Cloudflare. Add `www` as a
redirect to the apex if you want it.

## 7. Verify the running deployment, not the code

```bash
curl https://econib.org/api/health
```

This reports what the **deployed** instance is actually configured with. It
checks the database is reachable, that `ALLOWED_ORIGIN` is set and has no
trailing slash, that the API key is present, and it times a real password hash
and warns if that exceeds the free-plan CPU limit.

`{"ok": true}` means all four passed. A CORS wildcard or a missing key is
correct in source and wrong in deployment far more often than the reverse, which
is why this endpoint reads the environment rather than the code.

It reports presence and timing only, never secret values.

## 8. After deploying

- Create an account and sign in. If login returns a 500, check the health
  endpoint's `passwordHashing` warning — it is almost always the free plan.
- Mark one commentary end to end to confirm the API key works.
- Confirm `https://econib.org/api/health` shows `allowedOrigin` as `set`.
