---
name: Wouter Redirect drops query params
description: Legacy-route redirects lose ?account= etc.; e2e tests must target canonical paths and expect default tabs.
---

Wouter `<Redirect to="/canonical" replace />` drops the query string, so navigating a legacy route like `/app/mst/crossmap?account=X` lands unconfigured (account scope lost).

**Why:** the hover-popover smoke test silently landed on UnconfiguredState after the crossmap route was renamed to `/app/mst/cross-map`.

**How to apply:** e2e tests and in-app links must use canonical paths with the query intact. Also note merged tab surfaces (e.g. Cross-Map defaults to the Concept Map tab) — tests must click the target tab, and unmocked API endpoints (analysis-runs) crash pages when Vite answers with index.html, so mock them with empty JSON.
