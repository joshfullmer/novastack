---
status: closed
type: task
claimed_by: Josh Fullmer
blocked_by: [02-username-migration-account-shell]
---

## Question

Add a "delete account" section to `/account` (the shell from
[Username migration + /account shell](../tickets/02-username-migration-account-shell.md)):
require current-password re-entry, then hard-delete the user. `session`, `account`, and
`decks.ownerId` (`deck_versions`/`deck_likes` cascade further from `decks`) all reference
`user.id` with `onDelete: cascade` already — confirm that's still true when this ticket is
worked, and confirm no table added since then breaks the chain. Redirect to a logged-out state
on success.

## Resolution

Confirmed the cascade chain is intact (`session`, `account`, `decks.ownerId` all still
`onDelete: cascade` on `user.id`; the `rate_limit` table added in ticket 03 has no FK to `user`,
so it doesn't affect this). Also confirmed empirically, not just by reading the schema: D1 has
`PRAGMA foreign_keys = 1` — cascades actually fire at the SQLite engine level, not just declared
and ignored.

`user.deleteUser.enabled: true` added to `auth.ts` — no `sendDeleteAccountVerification`
callback, so deletion is immediate once the password checks out, no email-confirmation step
(matches the decided friction level: password re-entry only). Unlike `changeEmail`,
better-auth's `deleteUser` endpoint verifies the password itself when one's in the request
body, so the `/account` `deleteAccount` action is a single `auth.api.deleteUser` call, no
separate `verifyPassword` step needed.

`/account` gets a "Delete account" section, visually set apart (red heading/button, `border-t`
separator) since it's destructive. Tagged `'delete'` for the shared `form` prop, same pattern as
tickets 02/05's other sections.

Verified end-to-end: wrong password rejected (error only under this section), correct password
deletes the user and redirects to `/` signed-out. Created a real deck for a throwaway test user
first and confirmed after deletion that `user`, `session`, `account`, and `decks` rows were all
gone — the cascade genuinely works, not just in theory.

This closes the map's frontier — all five destination actions (username change, email
verification, password reset, email change, account deletion) are shipped and working.
