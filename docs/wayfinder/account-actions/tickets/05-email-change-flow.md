---
status: closed
type: task
claimed_by: Josh Fullmer
blocked_by: [01-provision-email-delivery, 02-username-migration-account-shell]
---

## Question

Add a "change email" section to `/account` (the shell from
[Username migration + /account shell](../tickets/02-username-migration-account-shell.md)):
require current-password confirmation to initiate, then use better-auth's `changeEmail` flow —
the new address only takes effect after its verification link is clicked. Uses the email
delivery from [Provision email delivery](../tickets/01-provision-email-delivery.md).

## Resolution

`user.changeEmail.enabled: true` added to `auth.ts` — no separate send callback needed, it
reuses `emailVerification.sendVerificationEmail` (ticket 03) for the new address's confirmation
link. No schema changes.

Better-auth's core `changeEmail` endpoint has no password check of its own (just requires a
valid session) — the "current password" requirement is this app's own addition, enforced by
calling `auth.api.verifyPassword` before `auth.api.changeEmail` in the `/account` `changeEmail`
action. Both are plain `attemptAuth` calls, no `auth.handler()` routing needed here — neither
endpoint has a special rate-limit rule, and a change already requires an authenticated session
plus the correct password.

Enumeration protection for "new email already belongs to someone" is entirely better-auth's own
(a dummy token gets created, no email actually sent, same `{status:true}` response) — nothing
extra needed on this app's side.

**`/account` now has two independent form sections sharing one `form` prop** — added a
`section` tag to `attemptAuth`'s fail/success results (`src/lib/server/attempt.ts`) so the
Username section's message never bleeds into the Email section's, or vice versa. Ticket 06 adds
a third section and should follow the same pattern.

Verified end-to-end in the browser: wrong password rejected (error shown only under the Email
section), correct password produces the pending-confirmation message, email stays unchanged in
the DB until the emailed link is clicked, clicking it flips the email over (and it's marked
verified, since confirming it is what verifies it) and `/account` reflects the new address.
