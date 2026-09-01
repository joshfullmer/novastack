---
status: closed
type: task
claimed_by: Josh Fullmer
blocked_by: [02-wire-discord-sign-in]
---

## Question

Design and build the one-time username picker a new Discord sign-up hits before reaching the
rest of the app: where it lives (a dedicated route vs. a modal), how "needs a username" is
detected (`username === null` check — where does that check live: a layout load, a hook, or a
per-route guard?), what happens if the user navigates away or closes the tab mid-picker (do they
get re-prompted on next visit — they should, since `username` is still null), and what the
picker pre-fills, if anything (Discord's handle as a suggested-but-editable default seems
reasonable, but confirm — this app's existing username validation/uniqueness rules from
[Username migration + /account shell](../../account-actions/tickets/02-username-migration-account-shell.md)
apply here too, so a collision needs a real error, not a crash).

## Resolution

Dedicated route, `/auth/choose-username` — not a modal, since it needs to be the thing a hook
can redirect to. Detection is a **hook-level hard gate** in `hooks.server.ts`: whenever a
session exists and `session.user.username` is falsy, every dynamic route except `/api/auth`,
`/auth/choose-username` itself, and `/auth/logout` gets redirected there via a plain 302
`Response` (not SvelteKit's `redirect()` — no need to fight the external-redirect allowlist
ticket 02 hit, since this target is always internal). This mirrors the destination's "before
reaching the rest of the app" language as a hard block, unlike email verification's soft banner
— a null username can't drive anything else (deck ownership display, sharing), so there's no
sensible degraded state to render around it.

Re-prompting on abandonment falls out of the mechanism for free: nothing is recorded anywhere
except the `username` column itself, so leaving mid-picker just means the same gate fires again
next visit.

Prefill: pre-fills from `user.name` (Discord's `global_name`/`username`, whichever better-auth
picked), lowercased and stripped to `[a-z0-9_.]` client-side as a best-effort suggestion — not
authoritative, submit still runs through the username plugin's own normalization/uniqueness
check via the same `auth.api.updateUser` call `/account`'s username-change action already uses,
so a collision surfaces as the same real error message, not a crash.

**Bug caught live, not by reading the code first:** the initial exempt-prefix list only covered
`/api/auth` and `/auth/choose-username` — `/auth/logout` (a `+server.ts`, not a page action)
lives under `/auth` too, so a signed-in no-username user literally could not sign out; every
POST to `/auth/logout` got redirected to the picker before the handler ever ran. Added
`/auth/logout` to the exemption list.

Verified end-to-end in the browser without touching Josh's real Discord account or any existing
test data: registered a throwaway user via email/password (always gets a username), then nulled
its `username` directly in the local D1 sqlite file to simulate the post-Discord-callback
state — a faithful simulation, since the guard only ever looks at the column, not how it got
that way. Confirmed: visiting `/decks` or `/account` redirects to the picker; the picker
prefills `discordguardtest` from `name = 'Discord Guard Test'`; submitting lands on `/decks` and
persists the username in D1; revisiting `/auth/choose-username` afterward bounces to `/decks`
(nothing left to do); sign-out works from the gated state (after the fix above). Test user
deleted afterward.
