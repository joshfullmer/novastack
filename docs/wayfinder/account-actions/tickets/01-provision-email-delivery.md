---
status: closed
type: task
claimed_by: Josh Fullmer
blocked_by: []
---

## Question

Pick and provision an email-delivery provider for better-auth's `sendVerificationEmail` and
`sendResetPassword` hooks, running from a Cloudflare Worker (check Workers-runtime `fetch`
compatibility — e.g. Resend, Postmark, MailChannels). Wire the API key/binding and a minimal send
helper. Scope is narrow: prove "send an email from this Worker" works end-to-end (e.g. a test
send), not the verification/reset UI itself — those are separate tickets that depend on this one.

## Progress so far

- Decided: **Resend**, from-address `noreply@novastack.gg` (MailChannels' free Workers tier was
  discontinued in 2024, ruled out).
- Done: `RESEND_API_KEY` added to `src/env.ts` (same `defineEnvVars` pattern as
  `BETTER_AUTH_SECRET`); `src/lib/server/mail.ts` added with a `sendEmail(to, subject, html)`
  helper calling Resend's REST API directly via `fetch` (no SDK dependency).
- Done: Resend account created, `novastack.gg` domain added, API key (Sending-access scope)
  generated and in `.env` locally.
- Blocked: DNS records for `novastack.gg` haven't propagated yet — Resend dashboard shows the
  domain unverified. A real send currently 403s with `"The novastack.gg domain is not verified"`.
  Confirmed the key itself is valid (a bad/malformed key gives a different error — watch for
  `.env` values wrapped in quotes getting exported literally if re-testing via shell).
- Done: production secret set via `wrangler secret put RESEND_API_KEY` (Worker `novastack`, no
  named environments in `wrangler.jsonc`, so this is the one deploy target).
- Done: `novastack.gg` verified in Resend; a real test send to `joshfullmer@proton.me` was
  accepted by the API and landed in the inbox — confirmed end-to-end.

## Resolution

**Resend**, sending from `noreply@novastack.gg`. `src/lib/server/mail.ts` exports
`sendEmail(to, subject, html)`, a thin `fetch` wrapper around Resend's REST API — no SDK
dependency, so nothing Workers-runtime-specific to worry about. Key lives in `.env` for local
dev (`RESEND_API_KEY`, declared in `src/env.ts` alongside `BETTER_AUTH_SECRET`) and as a
Cloudflare Worker secret (`wrangler secret put RESEND_API_KEY`) for production — no named
environments in `wrangler.jsonc`, so that's the one deploy target. Tickets 03, 04, and 05 can
now call `sendEmail` directly.
