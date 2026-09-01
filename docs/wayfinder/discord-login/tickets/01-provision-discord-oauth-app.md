---
status: closed
type: task
claimed_by: Josh Fullmer
blocked_by: []
---

## Question

Register a Discord OAuth application (Discord Developer Portal) for this app's sign-in flow.
Decide and record: which Discord account/team owns the app, the OAuth2 redirect URI(s) needed
for local dev vs. production (`{ORIGIN}/api/auth/callback/discord` per better-auth's convention —
confirm against the installed version), and the scopes to request (at minimum `identify` +
`email`, since email-verification trust and account matching both depend on getting a real
email back). Provision `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET`: add to `src/env.ts` via
the existing `defineEnvVars` pattern, set locally in `.env`, and set as Cloudflare Worker secrets
in production (`wrangler secret put`), following the pattern [Provision email
delivery](../../account-actions/tickets/01-provision-email-delivery.md) used for
`RESEND_API_KEY`. Scope is narrow: prove the app exists and the redirect URI is accepted, not
wiring better-auth's `socialProviders` config itself — that's [Wire Discord
sign-in](02-wire-discord-sign-in.md).

## Resolution

Discord application created in the Discord Developer Portal. Redirect URIs registered:
`http://localhost:5173/api/auth/callback/discord` (local) and
`https://novastack.gg/api/auth/callback/discord` (production) — confirmed against the installed
better-auth version's actual route (`createAuthEndpoint("/callback/:id", ...)` in
`node_modules/better-auth/dist/api/routes/callback.mjs`), not just assumed from docs. Scopes to
request (`identify` + `email`) are a build detail of ticket 02, not the portal.

`DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` added to `src/env.ts` via the existing
`defineEnvVars` pattern (required-at-runtime, optional during `building`, same as
`RESEND_API_KEY`). Values set in local `.env` and as Cloudflare Worker secrets in production via
`wrangler secret put` (run directly by Josh — Bash access to `.env` is sandboxed, so secret
values never passed through the agent). [Wire Discord sign-in](02-wire-discord-sign-in.md) is
unblocked.
