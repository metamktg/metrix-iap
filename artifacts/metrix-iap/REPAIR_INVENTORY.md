# Metrix IAP — Repair Inventory & QA Report

**Scope:** Surgical regression-restoration + brand alignment following the prior "Data Flow Architecture" redesign. Patches only — no rewrite, no fabricated data, no removal of working functionality. Authoritative spec: `/tmp/spec.txt`.

**Verification:** `pnpm --filter @workspace/metrix-iap run typecheck` passes. All reachable surfaces verified via live screenshots. Architect code review: **PASS** (no code changes required).

---

## 1. Repair Inventory

| # | Area | Regression / Gap | Fix |
|---|------|------------------|-----|
| P1 | Shared components | Tab bars were duplicated / inconsistent per view | Added a single reusable generic `ModuleTabs<T>` (underline tab bar) in `shared.tsx`; all module views consume it |
| P2 | Manager Overview | Swipe-deck recommendation UI (non-read-only, unscoped) | Rewrote as read-only, account-labeled recommendation cards (descriptor / scope / impact / confidence + rationale + recommended action + "Open {account}" via `selectAdAccount` + `source_path`). Dashed tile now routes to `/app/settings` |
| P3 | Ad Account Overview | Missing sprint status + next-action guidance and layer readiness | Added "Current focus" (MST sprint status + highest-impact next action via `IMPACT_RANK`) and "Layer status" cards (Listen / Analysis / Strategy / Report Builder / MST) with real counts, Ready/Pending state, and route navigation. Kept totals / results / core controls / optimization loop |
| P4 | Listen | Scope tabs missing | Restored scope tabs (All + present scopes only), source-backed signal cards |
| P4 | Analysis | Lost "Top performers" and "Recommendations"; mislabeled tabs | Restored **Top performers** (`top_checkout_cells` + `top_checkout_variables`) and **Recommendations** (`RecommendationDeck`, account-scoped) tabs; renamed **Variables → Creative DNA**, **Demographics → Audience**; caveat note gated off on the Recommendations tab |
| P4 | Strategy | Pillars / hypotheses view lost | Restored Message pillars + Hypotheses tabs with nested Overview / Brief Builder nav |
| P4 | Brief Builder | Asset-type filtering lost | Restored asset-type filter tabs (rendered only when >1 asset type); pillar-sourced briefs with source-policy caveat |
| P4 | Report Builder | Internal/Client mode + export lost | Restored Report preview with Internal ↔ Client mode toggle and Branding & export tab |
| P4 | MST | Variable library view missing | Restored Matrix + Concept library; **added Variable library** view aggregating distinct hook/tone/framework/concept/proof/cta variables by family with usage counts |
| P5 | Branding | `index.html` description said "Meta Marketing Agency" | Replaced with honest product description |
| P6 | Metrix Agent | "Coming soon" placeholder copy | Replaced with honest "Not enabled in this build" copy + `NOT ENABLED` badge and read-only capability list |

**Build-fix note:** `tsc` accepts JSX explicit generics (`<ModuleTabs<Tab>>`) but Vite's Babel parser rejects them. Resolved by using `useState<string>` at the two affected call sites (Strategy, Report Builder) and dropping the explicit JSX generic — `ModuleTabs<T>` still infers `T` correctly. No runtime or type-safety hole (tab-id arrays are built locally).

---

## 2. QA Report (screenshot-verified)

| Surface | Route | Result |
|---------|-------|--------|
| Manager Overview | `/` | ✅ Clean "Metrix Manager" branding; bottom-line totals; results by event; read-only account cards (Bookster · Connected, SKOV Pet · Setup Required); "Add or connect an ad account" CTA. No swipe deck |
| Analysis | `/app/analysis` | ✅ Tabs: Creative cells / Top performers / Creative DNA / Audience / Placements / Recommendations. Directional caveat shown on data tabs, suppressed on Recommendations |
| MST | `/app/mst` | ✅ Matrix / Concept library / Variable library; active for Bookster; render-policy caveat present |
| Report Builder | `/app/report-builder` | ✅ Report preview / Branding & export tabs; Internal ↔ Client mode toggle; 9 sections |
| Listen | `/app/listen` | ✅ Scope tabs (All / Creative / Funnel / Placement / MST); source-backed signal cards with `source_path` |
| Strategy | `/app/strategy` | ✅ Message pillars / Hypotheses tabs; nested Overview / Brief Builder nav |
| Brief Builder | `/app/strategy/brief-builder` | ✅ Asset-type filter tabs; source-policy caveat; pillar-sourced briefs |
| Metrix Agent | `/app/agent` | ✅ Honest "Not enabled in this build" + `NOT ENABLED` badge; no fabricated output |
| Ad Account Overview | `/` (account selected) | ⚠️ Not reachable via direct URL (requires in-app account selection); typecheck passes and code reviewed. Renders `UnconfiguredState` when `status !== "configured"` |

---

## 3. Honest-state & Brand Compliance

- **No fabricated data.** All views hydrate from `src/lib/data/metrixSeedAdapter.ts` (reading `metrix_bookster_seed_bundle_v1.json`). Caveat texts come from seed policy fields and render only after presence checks.
- **Unconfigured isolation holds.** SKOV Pet (`unconfigured`) shows only "Setup Required" at the manager level; all account-scoped views gate on `account.status !== "configured"` → `UnconfiguredState` (Ad Account Overview additionally requires `account.iap`).
- **No forbidden terms render.** A sweep of all forbidden UI terms found matches only in: (a) the seed's own forbidden-terms list, (b) legacy `mock/generate.ts` data, and (c) innocuous copy ("Lead with credibility…" in variable-registry descriptions — the verb, not the CRM term).
- **Legacy scaffolding note (accurate):** `src/lib/mock/generate.ts` is **bundled but unrendered**, not dead code. It is imported transitively (`mock-data.ts` → `WorkspaceContext.tsx` → `WorkspaceProvider` mounted in `App.tsx`). Its "Meta Marketing Agency" / "API Sync Coming Soon" / "Manual CSV Mode" strings never reach the DOM because the workspace onboarding UI never mounts on the live routes. Removing this scaffolding entirely is out of scope for this surgical pass.

---

## 4. Known Limitations

- **Ad Account Overview** could not be captured via a direct URL (both `/` and `/app/account` render the adaptive Overview based on in-app account selection). It is type-checked and code-reviewed.
- **Legacy deep-link edge case:** navigating directly to `/app/workspaces/:id` sets `isOnWorkspaceRoute=true`, which can surface `WorkspaceOnboarding` over a now-404 route. Not reachable from any live nav link.
