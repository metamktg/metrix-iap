---
name: Seed fixture refresh scope
description: When and how to refresh the metrix-iap seed fixture without polluting a task's diff
---

**Rule:** A full `refresh:seed-fixture` mid-task replaces the entire checked-in seed snapshot with current live shared-Supabase data — it pulls in every other task's merged/live data changes and produces a huge, review-hostile diff.

**Why:** A KPI-only task got its completion review rejected because the refreshed fixture wholesale-changed ~16k lines of unrelated data (accounts, assets, records reshaped by concurrently merged tasks).

**How to apply:** Only refresh when the drift check (`check:seed-fixture-drift`, shape-only comparison) actually fails AND your task owns or requires the schema change; otherwise leave the fixture alone. If forced to refresh because concurrent merges changed the live shape, say so explicitly in `drift_reason` and re-run the full IAP suite against the refreshed fixture as the regression evidence. Note the drift check needs the live seed endpoint — it fails spuriously (503) during Supabase outages.
