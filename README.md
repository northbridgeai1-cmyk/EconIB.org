# EconIB

IB Diploma Economics study and self-assessment for [econib.org](https://econib.org).
Built for IB1 and IB2 students, SL and HL, against the syllabus with first
assessment 2022.

## What it does

- **IA portfolio** — three commentaries, marked criterion by criterion out of 14,
  plus criterion F across the portfolio for 45 in total.
- **Exam answers** — the four parts marked on markbands rather than a markscheme:
  Paper 1 (a) and (b), Paper 2 (g), and Paper 3 (b) at HL. Each is scored strand
  by strand and names the strand that is capping the band.
- **Syllabus** — all 31 topics with HL-only material flagged, the diagrams each
  topic expects, and per-topic confidence tracking.
- **Reference** — the 33 command terms with what each actually asks for, and the
  nine key concepts with guidance on which fits which article.
- **Grade calculator** — exact weighted percentage. It does not predict a grade.

## Two rules the code enforces

**Anything calculable is calculated.** The IA word count, article recency and
criterion F are decided by arithmetic and dates, so they are computed in
[`ia-rules.js`](public/assets/js/lib/ia-rules.js) — identically in the browser,
on the server and in the tests — and never sent to a language model. Three
certain marks should not become three guessed ones.

**It diagnoses; it never writes coursework.** The marking tool schema has no
field that can hold student prose, and the prompt forbids supplying any. An IA is
assessed work that must be the student's own.

## Providers

Marking is provider-agnostic. Groq, Google Gemini and OpenRouter speak the
OpenAI chat-completions shape and share one adapter; Anthropic has its own.
Switch with the `SHARED_AI_PROVIDER` variable — no code change.

Students can also add **their own API key** in account settings. Their key spends
their own quota and is not subject to the shared daily cap, which is the only way
this scales to many users without someone paying per marking.

Two things the UI is explicit about, because a student cannot otherwise tell:

- **Every result names the model that produced it** and carries a reliability
  note. A free open model is useful for finding what is missing and unreliable on
  the exact mark; presenting its output identically to a stronger model's would
  invite a student to trust a wrong number.
- **Free tiers may train on what you send them.** Google's free tier states that
  submissions may be used to improve its products and may be read by human
  reviewers. Providers where that applies are flagged in red before a student
  saves a key, because the text being submitted is their coursework.

Student keys are AES-GCM encrypted under `KEY_ENCRYPTION_SECRET` and are never
returned to the browser — the page only ever sees a masked hint.

## Accounts

Email and password, with the password hashed using PBKDF2-SHA256. Sessions are
opaque tokens in a `__Host-` prefixed, HttpOnly, SameSite=Strict cookie.

- **Sign in with Google**, or email and password. A Google sign-in for an email
  that already has a password account links the two rather than making a second
  portfolio.
- **Passwords are stretched in the browser**, not on the server. The server
  stores a fast hash of the resulting verifier and never sees the password.
  Offline-cracking cost is unchanged — an attacker still pays 600,000
  iterations per guess — and this is what lets it run on the free plan.
- **Password reset by email**, single use, expiring in an hour. Requesting a
  reset invalidates any earlier link, and completing one signs out every other
  device — so a reset also evicts anyone who should not be there.
- **Change password while signed in**, requiring the current one, which keeps
  the current device signed in and signs out the rest.
- **Show/hide on every password box.** Not being able to see what you typed is
  how a typo at signup becomes an account nobody can get into.
- **No account enumeration.** A wrong password and an unknown email return
  identical responses in near-identical time, and a reset request for an
  unregistered address sends nothing while replying the same way.

Where no email provider is configured, reset says so plainly instead of
pretending to send, and `scripts/set-password.mjs` sets a password directly.

## Layout

```
data/            source of truth: syllabus, rubrics, command terms, key concepts
public/          static site (no build step); assets/data is a synced copy of data/
functions/       Cloudflare Pages Functions — the API
shared/          code used by both the functions and the tests
tests/           node:test suites
scripts/         integrity and syntax checks
schema.sql       D1 schema
```

## Development

```bash
npm install
npm run db:local          # apply the schema to the local D1
npm run dev               # http://localhost:8788
```

`.dev.vars` holds local environment values and is gitignored. AI marking is
disabled locally unless you add an `ANTHROPIC_API_KEY` to it; every other feature
works without one.

## Verification

```bash
npm run verify            # tests + data, design and syntax checks
```

`npm run check` fails if the assessment weights stop summing to 100, the IA no
longer totals 45, a markband stops being contiguous, the type scale grows past
seven sizes, or `public/assets/data/` drifts from `data/`.

Every test in this repo has been mutation-checked: the code it guards was broken
on purpose and the suite confirmed to go red. See [docs/verification.md](docs/verification.md).

## Deploying

See [docs/deploy.md](docs/deploy.md). It runs on the **Cloudflare Workers Free
plan**: password stretching happens in the browser, so the server does one
SHA-256 (~1-3 ms) rather than a ~400 ms key derivation it has no budget for.

## Honest limits

EconIB is not the IB and its marks are not official. The marker reads text only
and cannot see an attached diagram. Grade boundaries move every session, so no
grade is predicted.

EconIB is an independent study tool, not affiliated with or endorsed by the
International Baccalaureate Organization. All syllabus guidance, rubric wording
and study content in `data/` is original writing; no copyrighted IB text is
reproduced. Structure — topic codes, mark allocations, band boundaries,
durations and weightings — is factual detail of the assessment model.
