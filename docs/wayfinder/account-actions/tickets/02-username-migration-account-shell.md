---
status: closed
type: task
claimed_by: Josh Fullmer
blocked_by: []
---

## Question

Rename the `user.name` column to `username`, adopt better-auth's `username` plugin (unique
index, login by username), and update the signup/login forms currently combined on
`/auth/login` (`src/routes/auth/login`) to use `signUpUsername`/`signInUsername`. No real names
— this field is a handle only.

Also create the `/account` settings page shell (session-gated route, following the existing
`/auth/login` page's visual style) that tickets 05 and 06 will add sections to.

## Resolution

**Couldn't literally rename the column** — better-auth's core schema has its own required
`name` field independent of the username plugin (needed by `signUpEmail` itself), and the
plugin adds its own separate `username` column rather than repurposing `name`. Resolved by
keeping `name` as invisible plumbing, always set equal to `username` at signup/update — never
its own form field, never shown as a distinct "real name."

Implementation:

- `username({ displayUsername: false })` added to `auth.ts`'s plugin list — single lowercase
  `username` column, no separate display-case field (kept it to one visible field per your
  call).
- Migration `0002_youthful_molecule_man.sql` hand-edited to `NOT NULL` (drizzle-kit generates
  it nullable, since the plugin's own field definition says `required: false` with no config
  to override) — believed-safe pre-launch, no real users to backfill. Applied to local D1
  (required a table-rebuild to preserve the 4 existing test rows, backfilled with placeholder
  usernames). **Correction, discovered in
  [Email verification flow](03-email-verification-flow.md): this never actually applied to
  production.** Production D1 had 8 real existing user rows (the "no real users" premise was
  wrong), so the `NOT NULL DEFAULT ''` unique index collided across all of them and the whole
  migration rolled back — production's `user` table had no `username` column at all until that
  ticket fixed it (reverted to nullable, matching better-auth's own generated schema, then
  backfilled each of the 8 rows individually). See that ticket for the full account; corrected
  in [[defer-hardening-until-users]] memory too.
- Known gap, accepted deliberately: `auth.schema.ts` (Drizzle's TS type) still reads
  `username: string | null`, and so does better-auth's own `session.user.username` type — the
  plugin's public type surface has no "required" variant. Call sites narrow at the point of
  use rather than fighting the generator; a hand-edit would get silently wiped by the next
  `auth:schema` regen anyway. `app.d.ts` now derives `Locals.user`/`PageData.user` from
  `auth.$Infer.Session` instead of the generic `User` export, so `username` is at least visible
  on the type instead of absent.
- `/auth/login` form flipped: Username replaces the old "Name (for registering only)" field
  (always required, drives sign-in via `signInUsername`); Email became "(for registering
  only)" — still collected at signup for tickets 03–05's sake, no longer used for login.
- `/account` route added (`+layout.server.ts` mirrors `/decks`'/`/auth`'s Nav-state pattern;
  `+page.server.ts`/`+page.svelte`), gated by redirect-if-unauthenticated, with a "Username"
  section wired to `auth.api.updateUser`. This section wasn't explicitly assigned to any
  ticket when the map was charted — folding it in here rather than leaving it as orphaned fog,
  since this ticket already owns both the username plugin and the shell.
- `/account` added to `hooks.server.ts`'s `DYNAMIC_PREFIXES` — otherwise it never gets
  `locals.auth`/`locals.user`.
- Extracted the login page's `attempt()` helper to `src/lib/server/attempt.ts`
  (`attemptAuth`) so tickets 03–06 aren't copy-pasting it.
- Verified end-to-end in the browser: sign-up with a username, sign-out, sign-in by that same
  username, `/account` username update (persisted, confirmed in D1), unauthenticated redirect,
  and duplicate-username rejection surfacing a clean error instead of a crash.

Tickets 05 and 06 can now add their own sections to `/account`.
