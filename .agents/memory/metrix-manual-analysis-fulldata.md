---
name: Manual accounts render from the daterange summary API
description: Manual-import accounts without concept codes have empty seed analysis tables; Analysis views must fall back to the ad_performance-backed summary API.
---

- Manual accounts whose ad names carry no concept/cell codes (e.g. BELT) produce EMPTY seed-side `performance_by_cell`, `concept_rollup`, placement/demographic signal tables — the real data lives only in `ad_performance` / `demographic_performance` / `placement_performance`, reachable via `getAnalysisSummaryByDateRange`.
- **How to apply:** Analysis Overview queries the full data span (from `getAccountAnalysisDataWindows`) by default and prefers API rows per-surface whenever the seed surface is empty. Any new analysis surface must do the same or manual accounts render blank.
- Stale window guards: a persisted `selectedWindow` not matching any current window resets to null; an empty ranged result resets too; DateRangeContext resets a persisted custom range that falls fully outside the data bounds. A stale selection must never blank an analysis.
- Ad-level tiles: seed `AdRecord` now carries `performance` (per-ad aggregates) so IapLibraryView renders a tile for every ad even without cell codes (placeholder → creative import flow). Seed `ad_accounts` items are `additionalProperties: true` in OpenAPI, so nested AdRecord fields are NOT stripped (unlike top-level seed keys).
