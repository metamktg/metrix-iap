---
name: Metrix IAP account scoping
description: How the manager→ad-account hierarchy scopes every module in the Metrix IAP artifact
---

# Manager → Ad Account scoping

The Metrix IAP app has a two-level hierarchy: one **Manager** (agency) over N **ad accounts**.
`AccountContext` holds the active selection (persisted to sessionStorage). Two selection modes:
`selectedAccountType` is `"manager"` (default, lands on `/`) or `"ad_account"` (lands on `/app/account`).

**Rule:** only the Manager Overview (`/`) may aggregate bottom-line performance totals across accounts.
Every other module (Listen/Analysis/Strategy/Brief Builder/Report Builder/MST/Settings) is scoped to a
single ad account via `useScopedAdAccountId()`.

**Why:** the seed intentionally isolates account data; cross-account analysis/strategy/reports are forbidden.

**How to apply:**
- `useScopedAdAccountId()` returns an ad account **only** when `selectedAccountType === "ad_account"`;
  in manager mode it returns `null` (no fallback — a fallback once leaked Bookster data on scoped pages).
  Scoped pages must render a "No ad account selected" prompt when it is null.
- Each module must branch on account status: `configured` → render seed data; `unconfigured` (SKOV Pet)
  → render `<UnconfiguredState>` (connect flow), never fake data. `ModuleScopeGate` takes children as a
  render function so gated content is never evaluated for unconfigured accounts.
- Regression suite: `pnpm --filter @workspace/metrix-iap run test` renders every scoped page in all three
  selection states (manager / skov_pet / bookster) and asserts no Bookster leakage.
- Data comes only from `metrixSeedAdapter` getters keyed by adAccountId. No mock-data imports in new pages.
- Human-readable descriptors render first; raw variable codes (e.g. `TN_Rational`) are secondary. Use
  `readableVariables()` (handles `A + B` compound stacks) from `pages/metrix/shared.tsx`.
- MST render policy: show active matrix for configured accounts but **no Pass/Conditional/Fail** labels.
