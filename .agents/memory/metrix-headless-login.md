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
