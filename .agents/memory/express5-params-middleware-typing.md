---
name: Express 5 req.params typing with middleware
description: Adding middleware args to an Express 5 route changes req.params inference to string | string[]
---

Rule: when a route handler is registered with extra middleware arguments (`router.get(path, mw1, mw2, handler)`), Express 5's type inference widens `req.params.x` to `string | string[]`, breaking Drizzle `eq()` and insert values that previously typechecked with a bare handler.

**Why:** Adding `requireAuth`/`requireWorkspaceAccess` to existing report-settings routes made previously-passing code fail typecheck with confusing Drizzle overload errors.

**How to apply:** Coerce with `String(req.params.x)` in any route that has middleware in its registration — this is already the convention in the API server's guarded routes.
