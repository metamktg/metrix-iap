---
name: Metrix manual analysis runs
description: Manual-upload analysis is explicit-trigger-only, date-anchored to data not wall clock; client components split to avoid circular imports.
---

Manual CSV uploads (performance_csv kind) are staged raw and never parsed until a user explicitly presses "Run analysis" with a date-range preset (7d/14d/30d/all).

**View-level preset filter anchors to today (wall-clock), NOT to maxDate.** The `getAnalysisSummaryByPreset` function in `analysisEngine.ts` uses `new Date().toISOString().slice(0, 10)` as the anchor for all non-"all" presets. "7 days" means the last 7 calendar days from now — if an account's most recent data is 12 days old, the 7d preset correctly shows $0 (the data is outside the window). "all" preset still uses maxDate as anchor (it's full-range, so anchor doesn't matter).

**Why:** Anchoring to maxDate caused all presets to show the same total whenever an account only had one date of data (e.g. ECAS, which had Jul 14 data — every preset's window included Jul 14, so 7d/14d/28d/90d all returned $57.97 with no differentiation). Today-anchored windows give honest "last N days from now" semantics.

**How to apply:** When adding another windowed view, always anchor to today (wall-clock). The `available_window` in the response still reflects the actual min/max dates stored for the account; `active_window` reflects the date range of rows that actually fell within the filtered set.

Separate gotcha: co-locating a new controls component with the file that already renders it (e.g. importing a shared `PrimaryBtn` back from the dialog file into the new controls file) creates a circular import that only surfaces as Vite HMR "failed to reload" / full-page-reload errors, not a build-time or typecheck failure. Prefer a small locally-duplicated button/style over cross-importing between two files that reference each other.
