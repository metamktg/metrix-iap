---
name: Metrix conversion-based device tracking
description: Semantics of Meta conversion-device exports vs delivery-based pivots; tracking_basis column keeps them separate end-to-end.
---

Meta ad exports come in two incompatible tracking bases and they must never be mixed in one surface:

- **Delivery-based** (classic pivots): spend/impressions/clicks attributed to the device the ad was *shown* on. Full delivery metrics exist (CPA/CTR computable).
- **Conversion-based** (conversion-device pivots): funnel actions (link clicks, ATC, IC, purchases) attributed to the device the *action happened* on. Spend and impressions are empty by design — delivery is not device-attributable under this basis, so no CPA/CTR exist. Purchases frequently land on device "unknown" (Meta can't resolve the converting device). The export window can also differ from the campaign window (account-lifetime vs flight), so cross-surface totals won't reconcile and must not be asserted equal.

**Why:** The LittleData re-export (July 2026) replaced an all-empty delivery pivot with a conversion-device pivot; treating its empty spend columns as "missing data" or comparing its link clicks to the demographic export's totals produces false drift alarms.

**How to apply:** The Supabase device/platform/placement performance tables carry a `tracking_basis` column (NULL = legacy delivery, `'conversion'` = conversion-based). Seed assembly surfaces only `tracking_basis='conversion'` rows under `analysis.conversion_tracking_signal` (with an explanatory note) and leaves delivery rows out. Importers should assert internal consistency only within one basis (e.g. device purchases vs demo purchases — both conversion counts), never across bases or windows.

**CSV upload validation note:** a real conversion-device *export file* still contains the "Amount spent"/"Impressions" columns (Meta's report template doesn't omit them) — only their per-row *values* are blank/zero. The upload-time validator (`BLOCKING_DELIVERY_PRIMITIVES` in `iapCsvSpec.ts`) requires those columns to be present in every performance CSV class, including conversion_device and ad_summary; and "Campaign name" is a `CRITICAL_BREAKDOWN_COLUMN` required across all 4 classes even though it's absent from ad_summary's own `requiredBreakdownColumns` list. Hand-built test fixtures for any of the 4 CSV classes must include Day, Campaign name, Ad name, Amount spent, and Impressions or they'll 422 for a "missing column" reason unrelated to whatever is actually being tested.
