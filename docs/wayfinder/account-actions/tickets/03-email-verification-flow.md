---
status: closed
type: task
claimed_by: Josh Fullmer
blocked_by: [01-provision-email-delivery]
---

## Question

Wire up better-auth's email verification, soft-gated: verified users are unaffected; unverified
users see a banner (not a route-guard block) with a resend action. Uses the email delivery from
[Provision email delivery](../tickets/01-provision-email-delivery.md). Rate-limit the resend
action and avoid email-enumeration in any error copy.

## Resolution

Wired via `emailVerification.sendVerificationEmail` in `auth.ts` (uses ticket 01's `sendEmail`),
`sendOnSignUp: true`, `autoSignInAfterVerification: true`. Soft gate implemented as
`EmailVerificationBanner.svelte` in the root layout — shows only where `page.data.user` is
already populated (`/decks`, `/auth`, `/account`), same subtree Nav's sign-in state already
covers. Resend button posts to a new `/auth/resend-verification` endpoint.

Two real gaps surfaced and fixed along the way, both non-obvious:

- **`/api/auth/*` was completely unrouted.** Every existing action (login, signup, the ticket-02
  username update) calls `auth.api.*` directly in-process — none of them ever exercised
  better-auth's own mounted HTTP handler. The verification link is a real clickable URL hitting
  `/api/auth/verify-email`, which 404'd until `/api/auth` was added to `hooks.server.ts`'s
  `DYNAMIC_PREFIXES`.
- **Built-in rate limiting is router middleware, not part of `api.*`.** Configuring
  `rateLimit: { enabled: true, storage: 'database' }` in `auth.ts` did nothing on its own —
  better-auth's per-path rate limiter (and origin-check) only run when a request goes through
  `auth.handler()`. `/auth/resend-verification/+server.ts` now builds a synthetic `Request` to
  `/api/auth/send-verification-email` (with an explicit `origin` header — the synthetic request
  has none for origin-check to read) and calls `auth.handler()` with it, so the built-in
  3-per-60s special rule for `/send-verification-email` actually applies. Verified: 2 requests
  succeed, the 3rd+ within the window come back 429, surfaced in the banner as "Couldn't resend
  right now." This app's other actions (sign-in, sign-up) still bypass the router entirely and
  so still have no real rate limiting on brute-force attempts — out of this ticket's scope, but
  worth its own ticket if that matters.
- Also required the `rateLimit.enabled` explicit override (see `auth.ts` comment) — its default
  (`NODE_ENV === "production"`) is always false on a Cloudflare Worker, which never sets
  `NODE_ENV`.

**Bigger discovery, not scoped to this ticket:** production D1 turned out to already have 8 real
user rows (Jillian Lee, John Tatta, Kevin Unruh, Rafael, mforsythe625, plus Josh's own account and
two test/monitoring accounts) — the `[[defer-hardening-until-users]]` "pre-launch" assumption
from chartering was wrong. This first surfaced as a failed migration (see
[Username migration + /account shell](02-username-migration-account-shell.md)'s follow-up below),
not as part of this ticket's own scope, but the fix landed here since it was blocking this
ticket's `rate_limit` table migration from applying. Corrected and recorded in memory.

Verified end-to-end in the browser: signup triggers a real send, banner shows/hides correctly on
verify, resend works and is rate-limited, unauthenticated/already-verified paths handled cleanly.
