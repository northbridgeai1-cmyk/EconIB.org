# Deploying EconIB to Cloudflare Pages

You need: the GitHub repo connected to Cloudflare Pages, a D1 database, an
Anthropic API key, and the `econib.org` domain on Cloudflare DNS.

## 1. The free plan is enough

EconIB runs on the **Cloudflare Workers Free plan**. No paid tier is required.

That is only true because of one design decision. A password KDF costs ~400ms
of CPU and the free plan allows 10ms per request, so the stretching happens in
the **browser**: it sends a verifier, and the server stores a fast SHA-256 of
it. Measured server cost is ~1-3ms.

This costs nothing in security. An attacker holding the database still has to
run the full 600,000-iteration PBKDF2 for every password guess, and the server
never sees the password at all — so a compromised server cannot learn it.

`/api/health` times the server-side hash on every call and warns if it ever
exceeds 10ms, which would mean the key derivation had moved back to the server.

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
npx wrangler pages secret put GOOGLE_CLIENT_SECRET   # only if using Google sign-in
```

`SHARED_AI_KEY` is the key for whichever provider `SHARED_AI_PROVIDER` names.
A free Groq key from [console.groq.com/keys](https://console.groq.com/keys) works
and costs nothing.

For password reset emails, also set:

```bash
npx wrangler pages secret put RESEND_API_KEY
```

and add `RESET_FROM_EMAIL` as a plain variable, e.g. `EconIB <noreply@econib.org>`.
Get a key at [resend.com](https://resend.com) — the free tier is 3,000 emails a
month — and verify `econib.org` there so the from address is accepted.

**If you skip this**, password reset returns a clear "not set up on this
deployment" message rather than pretending to send a link, and you reset
passwords yourself with `scripts/set-password.mjs`. That is fine for a handful
of users and untenable past that: every forgotten password becomes a support
request only you can answer.

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
| `GOOGLE_CLIENT_ID` | from Google Cloud | Optional. Without it the Google button does not appear. |
| `AI_DAILY_LIMIT_PER_USER` | `25` | Per account per UTC day. |
| `AI_DAILY_LIMIT_GLOBAL` | `1000` | Across all accounts, so one leaked session cannot spend the whole budget. |
| `SHARED_AI_MODEL` | *(optional)* | Each provider has a sensible default. |
| `RESET_FROM_EMAIL` | `EconIB <noreply@econib.org>` | The from address on reset emails. Must be a domain verified in Resend. |

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


## 9. Google sign-in (optional, recommended)

Students almost all have a school Google account, and signing in with it means
no password to forget and no reset email to configure.

1. [console.cloud.google.com](https://console.cloud.google.com) → create a project.
2. **APIs & Services → OAuth consent screen** → External → fill in the app name
   and your email → add the scopes `openid`, `email`, `profile`.
3. **Credentials → Create credentials → OAuth client ID → Web application**.
4. Under **Authorised redirect URIs** add exactly:

   ```
   https://econib.org/api/auth/google/callback
   ```

   It must match character for character — no trailing slash.
5. Copy the client ID and secret. Set `GOOGLE_CLIENT_ID` as a plain variable and
   `GOOGLE_CLIENT_SECRET` as a **secret**.
6. Reload the sign-in page. The Google button appears only when both are set,
   so a half-finished setup shows no broken button.

An account created with Google starts as IB1 / SL and lands on the account page
so the student can set their own year and level. If someone signs in with Google
using an email that already has a password account, the two are linked rather
than duplicated — one person, one portfolio.

## 10. Do you still need Resend?

Only for password reset. If everyone uses Google, nobody needs a reset link and
you can skip it. Password reset degrades honestly when it is not configured:
the form says it is unavailable rather than pretending to send.
