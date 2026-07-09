---
name: In-process route testing pattern
description: How to write vitest coverage for Express routes that depend on real DB/Supabase-backed middleware (auth, workspace access checks).
---

For routes gated by middleware that hits real infra (session lookup, a
Supabase-backed workspace-access check), don't mock the middleware — boot
the actual `app` export in-process with `app.listen(0)` inside the test's
`beforeAll`, then drive it with plain `fetch()` against `http://127.0.0.1:<port>`.

**Why:** middleware like `requireWorkspaceAccess` derives its allowed id from
a live seed bundle (Supabase), so a mocked auth layer would let the test
diverge silently from production behavior. Fetching the real bundle at test
start (e.g. `manager_account.id`) and using it as the workspace id is more
reliable than hardcoding it.

**How to apply:** create a test user + session row via the app's own
`createSession()` helper, set the session cookie manually via a `Cookie`
header, seed/clean up rows for that user only. Remember `fetch()` defaults
to GET — every mutating request needs an explicit `method: "DELETE"` etc.,
or you'll get a misleading 404 "Cannot GET ..." instead of the expected
401/403 from auth middleware.
