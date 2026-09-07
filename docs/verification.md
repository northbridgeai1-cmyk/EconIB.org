# What was verified, and how

Every defect listed below survived careful reading and was found by running,
grepping or measuring. None was found by reading the code.

## Defects found, and the instrument that found each

| Defect | Consequence | Found by |
|---|---|---|
| `oneYearBefore` mixed UTC parsing with local-time getters | Article recency misjudged by a day at the one-year boundary for anyone west of UTC — the difference between criterion F scoring 3 and 2 | Running the suite under `TZ=Pacific/Honolulu` |
| `@media` nested inside a CSS selector list | Invalid CSS; the dark-mode primary button colour was silently dead | Brace-balance and pattern check in `scripts/check.mjs` |
| `--on-accent` had no light-mode definition | A colour defined only inside a dark block | Token audit: every dark token must exist on bare `:root` |
| `ApiError` dropped the server's `field` and `retryAfterSeconds` | Every validation error could only render as a generic banner, never on the offending input | Constructing the error and reading the property back |
| Server returned `field: "Level"` for input `level` | Field errors silently failed to attach to their input | Curling every validation path and comparing to the form's input names |
| **Paper 3 was not gated by level on the server** | An SL account could mark against the HL-only rubric and spend budget doing it. The UI hid the tab; the API accepted the request | Curling `p3b` as an SL account |
| Schema applied to a different local D1 than `pages dev` used | Every request 500'd with `no such table` | Running the app and reading the server log |
| Source-normalisation test never exercised the subdomain path | A passing test that could not fail | Mutation testing |

The last one is the important one: a test that stays green when you break the
code it guards is decoration, not verification.

## Mutation testing

Every invariant was broken on purpose and the suite confirmed to go red.

| Mutation | Result |
|---|---|
| Criterion F returns 0 instead of `null` when the portfolio is incomplete | RED |
| Article recency off by one (`<` becomes `<=`) | RED |
| A reused key concept still scores criterion D | RED |
| Source normalisation stops collapsing subdomains | **GREEN — test was decoration**, fixed, now RED |
| The 800-word limit becomes exclusive | RED |
| SL Paper 2 weight changed from 40 to 35 | RED |
| A syllabus topic deleted | RED |
| An eighth type size added to the scale | RED |
| The HL rubric gate removed | RED |

## Verified by running against a live server

Against `wrangler pages dev` with a real D1 database:

- **Signup and session** — email normalised (`Student@Example.COM ` →
  `student@example.com`); cookie issued as `__Host-econib_session` with
  `HttpOnly; Secure; SameSite=Strict; Path=/` and no `Domain`.
- **No account enumeration** — a wrong password and an unknown email return
  byte-identical responses, in 0.54 s and 0.50 s respectively. The dummy-hash
  path works; timing does not reveal which emails are registered.
- **Cross-origin POST refused** — `origin: https://evil.example` → 403.
- **Ownership isolation** — a second account reading, patching or deleting the
  first account's commentary by id gets 404, not 403, so existence cannot be
  probed. The victim's data was confirmed intact afterwards.
- **XSS** — `<img src=x onerror=alert(document.cookie)>` stored as a title
  renders as literal text in the browser. Measured in-page: 0 injected elements,
  0 inline scripts, no console errors, no dialog.
- **Criterion F determinism** — a portfolio built with two deliberate violations
  scored exactly 1/3, correctly collapsing `www.ft.com` and `ft.com` to one
  source and flagging a 2352-day-old article.
- **Fail closed** — with no API key, marking returns 503 saying it is not
  configured, rather than silently returning nothing.
- **Spend caps** — the daily counter read 0 after every failed marking attempt,
  confirming reservations are refunded rather than burned.
- **Rate limiting** — signup hit its 5/hour per-IP limit during testing and
  returned a 429 with a retry hint.
- **Destructive paths** — deleting a commentary twice returns 404, not 500.
  Account deletion clears the cookie with `Max-Age=0`, kills the session, and
  removes the user's commentaries, sessions and progress rows while leaving the
  other account's rows untouched.
- **Level gating** — SL sees 28 topics and three papers; HL sees 31 and four.
  Confirmed both in the UI and at the API.

## Verified in a browser

- **Overflow** — every element walked at 375, 768 and 1440 px across the
  dashboard, syllabus, reference and papers views. Zero elements overflow the
  viewport without a scrolling ancestor; no page scrolls horizontally.
- **Both themes** — light renders `#FBFAF7` on `#16191D`; dark renders its own
  palette. No colour is defined only inside a media query.
- **Markbands** — Paper 1 (a) renders its bands as 1–2 / 3–4 / 5–6 / 7–8 / 9–10,
  matching the official markband.

## Not yet verified

- **End-to-end AI marking.** No Anthropic API key was available during the
  build, so the request shape, structured-output extraction and result
  validation are unit tested but have never made a real API call. This is the
  first thing to exercise after deploying.
- **Behaviour on the Workers Paid plan under load.** Hashing cost was measured
  locally at ~395 ms; concurrency was not tested.
- **Marking quality.** Whether the marks EconIB gives agree with a real examiner
  is unmeasured. It is a second opinion, not a prediction.

---

# Round two: provider-agnostic marking

## Further defects found by running

| Defect | Consequence | Found by |
|---|---|---|
| `/assets/*` cached for an hour with no content hashing and no build step | After any deploy, returning students run up-to-an-hour-old JavaScript against a new API, and nothing can reach those browsers until it expires. Caught in the act: the browser was still running a pre-patch module while the server served the fixed one | Comparing the module the browser had against the one the server sent |
| Client read `res.budget.used` unconditionally | A student using their own key would crash the results view, because BYOK requests correctly return no budget | Adding the BYOK path and re-reading the callers |

The cache bug demonstrated itself while being diagnosed: fixing the header does
**not** rescue a browser that already cached under the old one, because a stored
response keeps its original `max-age`. Deploying this fix leaves already-cached
browsers stale until their hour expires. That is a one-time cost, and it is the
reason the fix is `must-revalidate` rather than a shorter `max-age`.

## Verified end to end against a mock provider

The gap recorded above — "AI marking has never made a real API call" — is now
closed for the request and response shape. A local server speaking the OpenAI
chat-completions shape that Groq, Gemini and OpenRouter all use was pointed at
by the real code path, and the full route exercised:

- **IA marking** returned A 2/3, B 2/2, C 3/3, D 2/3, E 1/3 → subtotal 10/14,
  with criterion B correctly capped at its maximum of 2, criterion F computed
  separately as 1/3, and a portfolio total of 11/45 marked provisional.
- **Paper 1 (b)** returned 6/15, band [4,6], correctly naming *Synthesis and
  evaluation* as the capping strand because it sat at the lowest rung.
- **BYOK** marking reported `source: byok` and left the shared budget untouched
  (2 → 2); removing the key fell back to shared and consumed it (2 → 3).
- **Key storage** — the database holds ciphertext, the API returns only a masked
  hint, and the full key never appears in any response.

Unit tests additionally verify the adapter sends bearer auth, `temperature: 0`,
the right tool schema and forced `tool_choice`; and that a 429, a rejected key, a
model that ignores tool use, and malformed JSON each produce a distinct, honest
error rather than a crash or a silent wrong answer.

## Still not verified

- **Whether a real Groq model marks well.** The shape is proven; the judgment is
  not. Marking quality against a real examiner remains unmeasured, which is why
  every result names its model and carries a reliability caveat.

---

# Round three: password reset, change password, show/hide

## Verified against a live server

- **Reset link lifecycle** — a valid link reports `valid: true`; a fabricated one
  reports `false`; a short new password is refused; the reset succeeds and signs
  the user straight in; **the same link used twice is dead**; an expired link is
  refused. The old password stops working and the new one works.
- **Reset evicts other devices** — signed in on two devices, changing the
  password left the acting device signed in (200) and signed the other out (401).
  That is what makes a reset useful when someone else has your account.
- **Change password** requires the current one (wrong current → 401 naming the
  field) and refuses reusing the same password.
- **The email itself** was captured from a mock provider standing in for Resend:
  correct recipient, bearer auth, a one-hour expiry stated in the body, the
  reset link, and a line telling anyone who did not request it to ignore it.
  Following that link and setting a password, then signing in with it, works.
- **No enumeration on reset** — a request for an unregistered address returns
  the identical generic message and sends no email at all.
- **Fails closed** — with no email provider configured, reset returns a plain
  "not set up on this deployment" rather than accepting the request and
  silently doing nothing.
- **Show/hide toggle** — flips the field between `password` and `text`, keeps
  the typed value, updates its own label and `aria-pressed`, and flips back.

## Defect found in the recovery script itself

`scripts/set-password.mjs` reported success for an email that does not exist.
D1's execute output carries no row count, so an `UPDATE` matching nothing looks
exactly like one that worked. It now confirms the account exists first, and was
re-tested with a password containing both spaces and quote characters.

## Guard added

`scripts/check.mjs` now fails if any outbound URL in `shared/providers.js` or
`shared/email.js` is not HTTPS, or points at localhost. Both files were pointed
at local mocks during this testing; the check exists so that a debugging patch
cannot reach a deployment.

---

# Round four: Playwright audit, design system, offline

## Pass / fail

| Check | Result |
|---|---|
| All 10 app views render, no dead links, no stranded skeletons | PASS |
| Overflow at 375 / 768 / 1200px across every view | PASS — zero elements, zero horizontal page scroll |
| Card overlap at 768px | PASS — none |
| Signup: submit empty | **FAIL → fixed** |
| Signup: submit garbage | PASS |
| Signup: submit correct | PASS |
| Touch targets ≥ 44px under a coarse pointer | **FAIL → fixed** |
| Skip-to-content link | **FAIL → added** |
| Delete account button | PASS — removes user, sessions and commentaries |
| Console JS errors | PASS — only expected 4xx network log lines, no script errors |

### The empty-submit failure

Submitting the signup form empty showed **nothing at all** — no field error, no
banner. The server returned `field: "Email"` (capitalised, a display label)
while the input is `id="email"`, so the client set `errors["Email"]`, the
template looked for `errors.email`, and the message was silently swallowed.

Fixed twice over: the validators now return the form's own field name, and the
client only attaches an error to a field that exists on the form, falling back
to a banner otherwise. An error can no longer disappear because a name did not
match.

### The touch-target failure

`.state-btn` (the syllabus confidence buttons — the most-tapped control on
mobile) measured 26px, and `.pw-toggle` 27px. Both were missing from the
`pointer: coarse` block, so a real phone got desktop-sized targets. Now 44px and
40px, along with the brand and nav links.

## Design system: structure from DESIGN.md, none of the skin

Applied: the radius tiering (chips 4px, buttons and inputs 8px, cards 12px, pill
reserved for status badges only — never buttons), and a motion scale of three
durations and two curves in place of the single hard-coded 90ms.

Deliberately not applied: its colours, its typeface, its 80px hero and 96px
section rhythm, and its 14-size type scale. That scale is built for a marketing
page; this is a dense tool anchored on a 15px body, and adopting the anchor
rather than the ratios is exactly how a design system wrecks an application.
The type scale stays at seven sizes and the check still enforces it.

## Offline

A versioned service worker precaches the shell and the syllabus data.

- `/api/` is **never** cached. Those responses contain a student's coursework
  and marks, and caching them would leave personal work in the browser cache
  after sign-out on a shared school computer.
- HTML is network-first, so a cached shell can never run against a newer API.
- On activate, every cache but the current version is deleted.
- `/sw.js` is served `no-cache`, or a broken worker could not be replaced.

## Verified in the browser after the changes

Skip link present and hidden at -100px until focused; theme toggle cycles
Light → Dark → Auto and stamps `data-theme`; search opens on click and ⌘K,
auto-focuses, matches topics by code and title, command terms and key concepts,
shows distinct empty and too-short states, moves with arrow keys and navigates
on Enter; back-to-top mounts; entrance animation applies per navigation; motion
resolves to 170ms and card radius to 12px; the service worker registers.
