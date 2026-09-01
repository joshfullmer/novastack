---
status: closed
tracker: local-markdown
---

# Account Actions Map

## Destination

Users can manage their own account end-to-end: change their username, change their email
(re-verified before it takes effect), verify their email, reset a forgotten password, and delete
their account. All five actions work in the running app — this map is build-as-you-go (see
Notes), not a spec handoff.

## Notes

- Stack: SvelteKit + better-auth (`emailAndPassword` only today) + Drizzle + Cloudflare D1.
- **Build-as-you-go override**: tickets both decide and implement. A ticket isn't done when the
  question is answered — it's done when the code ships.
- No real names are captured. The `user.name` column is being renamed to `username` and treated
  as a handle, not a person's name.
- Abuse prevention (rate limiting, no email-enumeration in error copy) is a build detail baked
  into each ticket that sends email or accepts a password guess — not a separate ticket.
- Consult `sveltekit-svelte5-tailwind` and `svelte-core-bestpractices` skills while implementing.
- `user.username` types as `string | null` everywhere (Drizzle's generated `auth.schema.ts`
  _and_ better-auth's own `session.user.username`) — the username plugin has no "required"
  option, and the DB column is genuinely nullable too (see
  [Email verification flow](tickets/03-email-verification-flow.md) — production already had
  real rows, so `NOT NULL` wasn't viable there). Every signup path still always supplies one;
  narrow at call sites if a ticket needs to treat it as always-present.
- This app's actions call `auth.api.*` directly in-process by default, which skips
  better-auth's router — its origin-check and built-in per-path rate limiter only run through
  `auth.handler()`. Verification-resend (ticket 03) and password-reset-request (ticket 04)
  route through `auth.handler()` instead, for that reason. Sign-in, sign-up, and update-user
  still call `api.*` directly and have no real rate limiting on brute-force attempts.
- Before writing a migration that assumes production D1 is empty: check first. It wasn't (see
  ticket 03) — [[defer-hardening-until-users]]'s "pre-launch" premise was stale.
- Tracker is local-markdown (this repo's GitHub token is read-only, so no native GitHub Issues).
  Blocking is a body/frontmatter convention (`blocked_by:`) rather than a native relation.
- Ticket status values: `open` (unclaimed) → `claimed` (frontmatter `claimed_by` set) → `closed`.

## Decisions so far

- [Provision email delivery](tickets/01-provision-email-delivery.md) — Resend, from
  `noreply@novastack.gg`, via a raw-`fetch` helper in `src/lib/server/mail.ts`; key in `.env`
  locally and as a Cloudflare Worker secret in production.
- [Username migration + /account shell](tickets/02-username-migration-account-shell.md) —
  better-auth's `username` plugin (single lowercase field, no display-case column), core
  `name` kept as invisible plumbing mirroring it; `/account` route added with a working
  username-change section (folded in — wasn't assigned elsewhere on the map). `username` ended
  up nullable, not `NOT NULL` as first recorded here — see next entry.
- [Email verification flow](tickets/03-email-verification-flow.md) — soft-gated banner in the
  root layout, resend routed through `auth.handler()` (not bare `auth.api.*`) so better-auth's
  real per-path rate limiter applies. Also fixed two standing gaps: `/api/auth/*` was never
  routed at all, and **production D1 already had 8 real user rows** — the "pre-launch" premise
  was wrong. `username` is nullable in the end, matching better-auth's own generated schema;
  all 8 legacy rows backfilled with usernames derived from their old `name` value.
- [Password reset flow](tickets/04-password-reset-flow.md) — `/auth/forgot-password` +
  `/auth/reset-password`, `sendResetPassword` + `revokeSessionsOnPasswordReset: true`. Request
  step routed through `auth.handler()` (ticket 03's pattern) for real rate limiting; the actual
  reset-with-token submission stays a plain `auth.api.resetPassword` call — no special rule to
  activate, and the token requirement is already self-limiting. **Correction after closing**:
  the real `<form>` was broken — a query-only `action="?/resetPassword"` replaces the page's
  whole query string, so `?token=...` never reached the POST. Fixed with a hidden field; see the
  ticket for why "verified end-to-end in the browser" didn't catch it the first time.
- [Email change flow](tickets/05-email-change-flow.md) — `user.changeEmail.enabled: true`,
  reuses ticket 03's verification-email callback for the new address's confirmation. Password
  check is this app's own addition (`auth.api.verifyPassword`) — better-auth's `changeEmail`
  endpoint has none built in. `/account` now has two form sections sharing one `form` prop, so
  `attemptAuth` gained a `section` tag to keep their messages from bleeding together — ticket 06
  should follow the same pattern.
- [Account deletion flow](tickets/06-account-deletion-flow.md) — `user.deleteUser.enabled:
true`, no email-confirmation step. `deleteUser` verifies the password itself (unlike
  `changeEmail`), so no separate `verifyPassword` call needed. Confirmed empirically (not just
  by reading the schema) that D1 enforces `PRAGMA foreign_keys`, so the cascade chain to
  `session`/`account`/`decks` genuinely fires. Closes the map — all five destination actions are
  shipped.

## Not yet specified

- Nothing — the map is closed. All five destination actions (username change, email
  verification, password reset, email change, account deletion) are shipped and verified.

## Out of scope

- 2FA, session/device management, OAuth/social login — not part of this destination; would be a
  fresh map if wanted later.
