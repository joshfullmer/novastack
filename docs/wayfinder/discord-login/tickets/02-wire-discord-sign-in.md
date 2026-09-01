---
status: closed
type: task
claimed_by: Josh Fullmer
blocked_by: [01-provision-discord-oauth-app]
---

## Question

Wire better-auth's `socialProviders.discord` in `auth.ts` using [Provision Discord OAuth
app](01-provision-discord-oauth-app.md)'s client ID/secret, and add a "Sign in with Discord"
button to `/auth/login` and `/auth/register` (both should offer it — a new visitor may land on
either). Confirm and record whether better-auth maps Discord's `email_verified` profile field
onto `user.emailVerified` automatically (the map's Notes assume it does — verify, don't assume),
and whether the profile's avatar maps onto `user.image` out of the box or needs an explicit
`mapProfileToUser` callback. Confirm the OAuth callback route
(`/api/auth/callback/discord`) is actually reachable — `/api/auth/*` routing and
`auth.handler()` were fixed in [Email verification
flow](../../account-actions/tickets/03-email-verification-flow.md), so this should already work,
but verify rather than assume. New Discord sign-ups will land with no `username` set — that's
[First-time username picker](03-first-time-username-picker.md)'s job, not this ticket's; this
ticket just needs to not crash or strand the user when that's the case (e.g. don't let a
route guard elsewhere 500 on a null username before ticket 03 exists — a temporary redirect to
`/decks` is fine as a placeholder if ticket 03 isn't done yet).

## Resolution

Wired `socialProviders.discord` in `auth.ts` with `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET`
(non-null-asserted — `defineEnvVars`'s schema guarantees real strings outside `building`, but
`DiscordOptions.clientId`/`clientSecret` don't accept `undefined` the way `baseURL`/`secret` do,
so this needed the same narrowing as the file's existing CLI-only `null!`). Also set
`account.accountLinking.disableImplicitLinking: true` — this is what actually implements the
map's "explicit only" linking decision; confirmed by reading
`oauth2/link-account.mjs` that better-auth auto-links by email match *by default*, and that this
flag (not `enabled: false`, which would also block ticket 04's explicit `linkSocial`) is the
correct scalpel.

Added a shared `signInDiscord` helper (`src/lib/server/social-sign-in.ts`) calling
`auth.api.signInSocial`, used by both `/auth/login` and `/auth/register`'s new `signInDiscord`
form action, with a `DiscordSignInButton.svelte` component (reuses the existing `DiscordIcon`)
on both pages.

Confirmed by reading source rather than assuming:
- `getUserInfo` in `@better-auth/core`'s `discord.ts` maps `emailVerified: profile.verified` and
  `image: profile.image_url` (a computed CDN URL handling both custom and default avatars, gif
  vs png) automatically — no `mapProfileToUser` needed.
- The callback route (`createAuthEndpoint("/callback/:id", ...)`) is real and reachable —
  `/api/auth/*` is routed via `svelteKitHandler` in `hooks.server.ts`, confirmed already covering
  this path.
- Default scopes are `identify` + `email`, no explicit `scope` config needed.

One thing the ticket didn't anticipate, caught before shipping: this SvelteKit version
(`3.0.0-next.24`) throws on `redirect()` to an external URL unless explicitly allowed — found
via a live 500 in the browser, not by reading docs first. Fixed with
`redirect(302, url, { external: ['https://discord.com'] })` (an allowlist, not blanket
`external: true`).

Also added handling for the real failure case `disableImplicitLinking` produces: signing in with
Discord using an email that already has a password account. better-auth redirects to
`errorCallbackURL` with `?error=account_not_linked` rather than completing any merge or creating
a duplicate account; `/auth/login` now reads that param and shows "An account with this email
already exists. Sign in with your password, then link Discord from your account page." (generic
message for any other error code). Verified live in the browser — sign-in redirects to Discord's
real authorize URL with correct `client_id`/`redirect_uri`/scope, and `/auth/login?error=account_not_linked`
renders the message — but the full OAuth handshake (new-user creation, real
`emailVerified`/`image` values landing in D1) was **not** exercised end-to-end with a real Discord
account: Josh's Discord account shares an email with an existing local test user, so doing that
live would have been the first real test of the exact "already exists" path above rather than
the happy path, and there's no throwaway Discord account on hand. The mapping logic itself is
confirmed by source reading (see above), which is the strongest verification short of that.
[Account linked-accounts management](04-account-linked-accounts.md) is unblocked; consider
exercising the full callback (new user or explicit link) once there's a Discord account that
doesn't collide with existing test data.
