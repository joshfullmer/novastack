---
status: closed
---

# Discord Login Map

## Destination

Users can sign in with Discord, alongside the existing email/password flow (better-auth
`emailAndPassword` isn't going anywhere). A signed-in user can explicitly link or unlink a
Discord account from `/account`; sign-in via Discord never auto-merges into an existing account
by email match. First-time Discord sign-ups get a one-time username picker. Discord-only
accounts can set a password from `/account`, which is what unlocks the existing password-gated
actions (change email, delete account) for them.

## Notes

- Stack: SvelteKit + better-auth (`emailAndPassword` + `username` plugin today) + Drizzle +
  Cloudflare D1. See [Account Actions Map](../account-actions/map.md) for the auth foundation
  this builds on — its "Out of scope" section is what opened this map.
- **Build-as-you-go override** (same as account-actions): tickets both decide and implement. A
  ticket isn't done when the question is answered — it's done when the code ships.
- Trust Discord's own `email_verified` status on OAuth — no re-verification banner for Discord
  sign-ups. This relies on requesting the `email` scope and better-auth mapping the provider's
  verified flag onto `user.emailVerified`; confirm this mapping actually happens when wiring the
  provider (ticket 02).
- Linking is **explicit only** — no auto-link by email match. Considered auto-link (safer than
  it sounds once email-verification is trusted) but decided against it: surprising UX outweighs
  the convenience, and explicit linking still avoids duplicate accounts for anyone who bothers.
- `account.schema.ts` already has both `issuer` and `providerId` columns (better-auth 1.7.1,
  installed — the `^1.6.23` in `package.json` allowed the newer version) — the schema shape
  that looked non-standard during scoping is fine as-is, no migration needed.
- This SvelteKit version (`3.0.0-next.24`) throws on `redirect()` to an external URL unless
  explicitly allowed — `{ external: [...] }` with an allowlist, not blanket `true`. Bit ticket
  02 in the browser; keep in mind for any other external redirect this map adds.
- Discord's avatar populates `user.image` on sign-in/link. Nothing in the app displays an avatar
  anywhere today — that's a real gap, not part of this destination; revisit as its own thing if
  avatars are ever surfaced in the UI.
- Consult `sveltekit-svelte5-tailwind` and `svelte-core-bestpractices` skills while implementing.
- Tracker is local-markdown (see account-actions map's Notes for why). Ticket status values:
  `open` (unclaimed) → `claimed` (frontmatter `claimed_by` set) → `closed`.

## Decisions so far

- [Provision Discord OAuth app](tickets/01-provision-discord-oauth-app.md) — Discord app
  created, redirect URIs registered for local + production (`/api/auth/callback/discord`,
  confirmed against the installed better-auth version's actual route). `DISCORD_CLIENT_ID` /
  `DISCORD_CLIENT_SECRET` added to `src/env.ts`, set in `.env` and as Worker secrets.
- [Wire Discord sign-in](tickets/02-wire-discord-sign-in.md) — `socialProviders.discord` +
  `disableImplicitLinking: true` in `auth.ts`; shared `signInDiscord` helper and button on
  `/auth/login` + `/auth/register`. Confirmed via source (not assumed) that better-auth maps
  Discord's `verified`/avatar onto `emailVerified`/`image` automatically. Added handling for the
  real failure case the explicit-linking decision produces — signing in with an email that
  already has a password account — surfaced as a friendly message on `/auth/login` rather than
  a dead end. Verified live except the full OAuth handshake itself (no Discord account on hand
  that doesn't collide with existing test data); see the ticket for what that leaves unverified.
- [First-time username picker](tickets/03-first-time-username-picker.md) — dedicated route
  `/auth/choose-username`, gated by a hook-level hard redirect (any signed-in user with a null
  `username` gets bounced off every other dynamic route). Prefills from `user.name`, sanitized
  client-side; submit reuses `/account`'s existing `updateUser` validation path. Caught and fixed
  live: the exempt-prefix list originally missed `/auth/logout`, which would have trapped a
  Discord sign-up who wanted to abandon instead of picking a username.
- [Account linked-accounts management](tickets/04-account-linked-accounts.md) — `/account` gets
  a "Linked accounts" section (explicit link/unlink) plus a conditional "Set a password"
  section; Email/Delete now hide behind a prompt until a password exists. Unlink's "can't remove
  your last account" guard turned out to need zero custom code — `auth.api.unlinkAccount`
  already refuses it. Set-password ended up using `auth.api.setPassword` (a real inline form,
  found only after asking Josh to accept a lesser email-round-trip alternative first — see the
  ticket). Verified end-to-end via direct D1 row manipulation, no real Discord account touched.
  Closes the map — all four destination pieces (sign-in, username picker, linking, password-gated
  actions) are shipped and verified.

## Not yet specified

- Nothing — the map is closed. Sign-in, the username picker, explicit linking/unlinking, and
  password-gating are all shipped and verified (see Decisions above for what verification did
  and didn't cover — notably, no ticket exercised a real Discord OAuth handshake end-to-end).

## Out of scope

- Other OAuth providers (Google, GitHub, etc.) — this map is Discord-specific by name; a
  multi-provider abstraction would be premature and is a fresh map if ever wanted.
- Displaying avatars anywhere in the UI — `user.image` gets populated (see Notes) but no
  consuming UI exists or is being built here.
- Auto-linking by email match — considered and explicitly rejected, see Notes.
