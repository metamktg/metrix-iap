---
name: Metrix IAP /app/home and /app/analyze routes
description: Missing App.tsx routes for HomeView + FindingsView; navTree section label mismatch in e2e spec.
---

## Rule
`/app/home` (HomeView) and `/app/analyze/findings` (FindingsView) must be registered in App.tsx; add a redirect `/app/analyze` → `/app/analyze/findings`.

**Why:** The home-screen e2e smoke test navigates to `/app/home` and the incoming branch added these pages but did not register them in the Router. Without the routes, the app renders the NotFound component and the e2e times out waiting for `<h1>`.

## navTree label mismatch
The analysis section in navTree uses `label: "Analysis"` and `landing: "/app/analysis"`. An e2e spec written expecting `"Analyze"` / `/app/analyze` will silently fail with an 8-second locator timeout. Always check `navTree.ts` labels before writing Playwright `hasText` assertions against sidebar nav links.

## Sidebar default state
The Sidebar starts **expanded** by default (localStorage empty → `loadCollapsed()` returns `false`). In expanded mode, each `ExpandableSection` renders an `<a>` whose textContent = `section.label` (the NavIcon SVG contributes no text). Fresh Playwright contexts have no localStorage, so tests always see the expanded sidebar.

**How to apply:** Any future e2e test clicking a sidebar nav section should use `page.locator("a").filter({ hasText: /^<ExactNavTreeLabel>$/i })` and assert the URL contains the section's `landing` path, both taken from `navTree.ts`.
