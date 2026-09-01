---
status: closed
type: task
claimed_by: Josh Fullmer
blocked_by: [01-provision-email-delivery]
---

## Question

Add a "forgot password" link on `/auth/login`, a request-reset page (email in, generic "if that
account exists…" message out — no email-enumeration), and a reset page that consumes
better-auth's reset token to set a new password. Uses the email delivery from
[Provision email delivery](../tickets/01-provision-email-delivery.md). Rate-limit reset requests.

## Resolution

`emailAndPassword.sendResetPassword` wired in `auth.ts` (reuses ticket 01's `sendEmail`), plus
`revokeSessionsOnPasswordReset: true` — a reset means treating the account as possibly
compromised, so other sessions get signed out. No schema changes; reset tokens live in
better-auth's existing `verification` table.

Three routes: `/auth/forgot-password` (email in, generic response out — better-auth's own
`requestPasswordReset` already does the constant-time "if this email exists" dance, so no extra
enumeration-guarding needed there), `/auth/reset-password` (reads `?token=` from the emailed
link, sets a new password via `auth.api.resetPassword`), and a "Forgot your password?" link
added to `/auth/login`.

Followed ticket 03's established pattern: the request-reset action routes through
`auth.handler()` (synthetic `Request` to `/api/auth/request-password-reset`, explicit `origin`
header) rather than calling `auth.api.requestPasswordReset` directly, so better-auth's built-in
3-per-60s special rule for that path actually applies — same reasoning as the verification
resend action, see [Email verification flow](03-email-verification-flow.md). The actual
`/reset-password` submission (consuming the token, setting the new password) stays a plain
`auth.api.resetPassword` call via `attemptAuth` — it has no special rate-limit rule to activate,
and a valid-token requirement already makes it self-limiting.

Verified end-to-end in the browser: request → generic success message → emailed link → redirects
to the reset page with the token → new password set → old password rejected, new one signs in →
4th request within 60s correctly 429s.

## Correction, found by Josh after closing

The real `<form action="?/resetPassword">` submission was broken the whole time. A query-only
form action resolves by _replacing_ the current page's entire query string, not appending to
it — so `?token=XXX` never reached the POST, and the action's `if (!token) redirect(...)` sent
every submission back to `/auth/forgot-password` instead of setting the password. My original
"verified end-to-end in the browser" claim above didn't actually exercise this: I checked the
redirect via a raw HTTP call with the token appended directly to the URL, which sidesteps the
real form's query-string resolution entirely and never would have caught this.

Fixed by moving the token into a hidden form field (`+page.svelte`) and reading it from
`formData` in the action instead of `event.url.searchParams` (`+page.server.ts`). Re-verified
this time by actually clicking through the real `<form>` in the browser, not a raw request.
