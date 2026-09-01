---
status: closed
type: task
claimed_by: Josh Fullmer
blocked_by: [02-wire-discord-sign-in]
---

## Question

Add a "linked accounts" section to `/account` (following the existing pattern of tagged form
sections sharing one `form` prop, per [Email change
flow](../../account-actions/tickets/05-email-change-flow.md)'s `section` convention):

- **Link Discord**: a button for a signed-in user with no linked Discord account, using
  better-auth's `linkSocial` (explicit only — no auto-link by email match, per the map's
  Notes).
- **Unlink Discord**: a button for a signed-in user with a linked Discord account, guarded so
  it's blocked (with a clear message, not a silent failure) unless the account has another way
  to sign in afterward — a password set, or another linked provider.
- **Set a password**: for a Discord-only account with no password, a form to set one. This is
  what unblocks the existing password-gated actions — change email
  ([05](../../account-actions/tickets/05-email-change-flow.md)) and delete account
  ([06](../../account-actions/tickets/06-account-deletion-flow.md)) both currently assume a
  password exists (`auth.api.verifyPassword` / `deleteUser`'s built-in check). Decide how those
  two actions behave today for a password-less account: hide the action entirely with a prompt
  to set a password first, or show it disabled with the same prompt — and make that change to
  both existing sections as part of this ticket, not as a follow-up.

## Resolution

`/account`'s `load` now calls `auth.api.listUserAccounts` and derives `hasPassword`
(`providerId === 'credential'`) and `discordAccountId` (`providerId === 'discord'`, or `null`).
Both drive the new "Linked accounts" section and gate Email/Delete.

**Link/unlink**: `linkDiscord` (a new export alongside `signInDiscord` in
`social-sign-in.ts`, sharing the same `completeOAuthRedirect` helper — real duplication, worth
the extraction) calls `auth.api.linkSocialAccount`, explicit-only per the map's Notes. **Unlink
needed no hand-rolled guard at all**: `auth.api.unlinkAccount` already refuses to remove a
user's last remaining account (`"You can't unlink your last account"`) — confirmed by reading
`account.mjs`, then verified live (see below). The ticket's "guarded so it's blocked unless
another sign-in method exists" requirement was better-auth's default behavior all along.

**Set a password — corrected after asking a now-moot question.** I initially asked whether to
build this as an email-a-link flow reusing the existing forgot-password infrastructure, since I'd
only checked `password.mjs` and found no "set a password with no current one" endpoint there.
Digging further (prompted by writing this up) turned up `auth.api.setPassword` in
`update-user.mjs` — `serverOnly`, `sensitiveSessionMiddleware` (valid session, no freshness
check), and built for exactly this: creates a `credential` account if none exists, updates in
place if one exists with no password, throws `PASSWORD_ALREADY_SET` otherwise. That's the
literal inline form the ticket originally asked for, not the email round-trip — used that
instead. (Flagged to Josh rather than silently overriding his answer to the question I'd asked;
this wasn't a disagreement, just better information arriving after the ask.)

**Gate style**: hidden entirely, per Josh's call — Email/Delete each render their normal form
when `hasPassword`, otherwise a one-line prompt linking to `#password`.

**Not touched, kept as better-auth's default**: explicit linking still requires the linked
account's email to match the session's email (`accountLinking.allowDifferentEmails` left
unset/false) — consistent with the map's "explicit only" stance, no reason found to relax it.
`/account` reads `?error=<code>` from the link flow's OAuth callback the same way `/auth/login`
does for sign-in (`email_does_not_match`, `account_already_linked_to_different_user`, generic
fallback) — link failures surface there, not as `form` action state, since a real link only ever
resolves via that redirect, never a normal form-action round trip.

Verified end-to-end in the browser without ever touching Josh's real Discord account: registered
a throwaway password user, then simulated Discord linkage by inserting/removing `account` rows
directly in the local D1 sqlite file (same technique as ticket 03) rather than completing a real
OAuth handshake. Confirmed: default state shows "Link Discord"; injecting a fake `discord` row
flips it to "Unlink Discord" and unlinking succeeds (credential account still present) with a
"Discord unlinked." message; removing the credential row (Discord-only) shows "Set a password"
and gates Email/Delete behind a prompt; attempting to unlink the sole remaining account is
blocked with better-auth's own message; submitting "Set a password" creates a real `credential`
row with a real password hash, unlocks Email/Delete immediately (no reload needed —
`use:enhance`'s default `invalidateAll` re-runs `load`), and that new password successfully
authenticates a real `changeEmail` call. Test user deleted afterward.

This closes the map — all four tickets are done.
