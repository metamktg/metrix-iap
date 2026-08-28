---
name: Metrix IAP headless login quirk
description: In headless browser verification, login succeeds but the URL stays on /login — don't wait for a redirect.
---

After submitting the login form (demo@metrix.app + $DEMO_ACCOUNT_PASSWORD via the
`input-login-email` / `input-login-password` / `button-login` testids), the SPA
re-renders the authenticated shell **in place**: the URL remains `/login`, which is
not a valid app route once authenticated, so the content area shows "Page not found"
while the sidebar renders fine.

**Why:** login sets the session and re-renders, but performs no client-side redirect,
so `page.waitForURL("**/app**")` times out even though auth succeeded.

**How to apply:** in headless scripts, after clicking login just `waitForTimeout(~3s)`
and `page.goto()` the target route directly. Key routes: manager overview at `/` (or
`/app/account`), signals at `/app/listen/signal` (singular), strategy at
`/app/strategy/{overview,map,hypotheses,avatars}`; scope with `?account=<id>`.

Disposable users inserted directly for browser verification may still be sent
through the temporary-password change screen before an app route will load.

**Why:** an end-to-end trend verification hit the password-change gate even
though the test insert attempted to disable it; treating that page as an
unexpected login failure would have hidden a healthy authenticated session.

**How to apply:** tell browser tests to complete the change-password gate if it
appears, then navigate directly to the target route. Always delete the temporary
user and its sessions after the run.
