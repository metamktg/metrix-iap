---
name: Metrix IAP data sources — live seed vs legacy scaffolding
description: Which data system actually renders in Metrix IAP, and which is bundled-but-dead
---

# Metrix IAP has two parallel data systems; only one renders

**Live/rendered data:** `src/lib/data/metrixSeedAdapter.ts`, which reads `src/data/seeds/metrix_bookster_seed_bundle_v1.json`. All account-scoped views (Overview, Listen, Analysis, Strategy, Brief Builder, Report Builder, MST) hydrate from its getters (`getManagerOverview`, `getAdAccounts`, `getAnalysisData`, etc.). Account status model here is `"configured"` / `"unconfigured"` (Bookster configured, SKOV Pet unconfigured).

**Legacy scaffolding — bundled but never rendered:** `src/lib/mock/generate.ts` (workspace-based generator, status model `"Connected"|"Manual CSV Mode"|"API Sync Coming Soon"`, contains "Meta Marketing Agency" strings). It IS transitively bundled: `mock/generate` → `mock-data.ts` → `WorkspaceContext.tsx` → `WorkspaceProvider` (mounted in `App.tsx`). It does NOT reach the DOM because the workspace onboarding/switcher UI never mounts on live routes (`isOnWorkspaceRoute` stays false).

**Why it matters:** When auditing for forbidden brand/CRM terms, grepping `src` will hit `generate.ts` — those are false positives for *rendered* UI, but do not call the file "dead code": it is bundled, just unrendered. The correct statement is "bundled but unrendered legacy scaffolding."

**How to apply:** For any data or copy that must actually appear in the app, edit the seed JSON + `metrixSeedAdapter.ts`, not `generate.ts`. Treat `generate.ts`/`mock-data.ts`/`WorkspaceContext.tsx` as removable legacy unless a task explicitly revives workspace onboarding.
