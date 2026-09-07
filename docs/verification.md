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
