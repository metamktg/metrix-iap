---
name: Metrix manual analysis runs
description: Manual-upload analysis is explicit-trigger-only, date-anchored to data not wall clock; client components split to avoid circular imports.
---

Manual CSV uploads (performance_csv kind) are staged raw and never parsed until a user explicitly presses "Run analysis" with a date-range preset (7d/14d/30d/all). The preset window is anchored to the LATEST DATE FOUND IN THE UPLOADED DATA, not the real-world current date — otherwise presets would resolve to empty windows whenever the uploaded export covers a past period (which is always, for historical exports).

**Why:** Analysis auto-running on upload, or windows anchored to wall-clock "today", would either fabricate a false sense of freshness or silently produce empty/misleading reports for any account backfilled with historical CSVs.

**How to apply:** When adding another "resolve a date window from uploaded data" feature, always derive the anchor date from `MAX(date)` in the parsed rows, and always surface the actually-resolved `date_start`/`date_end` back to the user — never just the preset label.

Separate gotcha: co-locating a new controls component with the file that already renders it (e.g. importing a shared `PrimaryBtn` back from the dialog file into the new controls file) creates a circular import that only surfaces as Vite HMR "failed to reload" / full-page-reload errors, not a build-time or typecheck failure. Prefer a small locally-duplicated button/style over cross-importing between two files that reference each other.
