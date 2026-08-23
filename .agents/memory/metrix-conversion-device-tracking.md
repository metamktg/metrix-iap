---
name: Metrix conversion-based device tracking
description: Semantics of Meta conversion-device exports vs delivery-based pivots; tracking_basis column keeps them separate end-to-end.
---

Meta ad exports come in two incompatible tracking bases and they must never be mixed in one surface:

- **Delivery-based** (classic pivots): spend/impressions/clicks attributed to the device the ad was *shown* on. Full delivery metrics exist (CPA/CTR computable).
- **Conversion-based** (conversion-device pivots): funnel actions (link clicks, ATC, IC, purchases) attributed to the device the *action happened* on. Spend and impressions are empty by design — delivery is not device-attributable under this basis, so no CPA/CTR exist. Purchases frequently land on device "unknown" (Meta can't resolve the converting device). The export window can also differ from the campaign window (account-lifetime vs flight), so cross-surface totals won't reconcile and must not be asserted equal.

**Why:** The LittleData re-export (July 2026) replaced an all-empty delivery pivot with a conversion-device pivot; treating its empty spend columns as "missing data" or comparing its link clicks to the demographic export's totals produces false drift alarms.

**How to apply:** The Supabase device/platform/placement performance tables carry a `tracking_basis` column (NULL = legacy delivery, `'conversion'` = conversion-based). Seed assembly surfaces only `tracking_basis='conversion'` rows under `analysis.conversion_tracking_signal` (with an explanatory note) and leaves delivery rows out. Importers should assert internal consistency only within one basis (e.g. device purchases vs demo purchases — both conversion counts), never across bases or windows.

**CSV upload validation note:** a real conversion-device *export file* still contains the "Amount spent"/"Impressions" columns (Meta's report template doesn't omit them) — only their per-row *values* are blank/zero. The upload-time validator (`BLOCKING_DELIVERY_PRIMITIVES` in `iapCsvSpec.ts`) requires those columns to be present in every performance CSV class, including conversion_device and ad_summary. Required breakdown columns are per-class via each spec's own `requiredBreakdownColumns` (`iapCsvParser.ts`'s hard-block gate keys off that list directly, not a class-agnostic fixed set) — "Campaign name" is required for demographic/device_placement/conversion_device but genuinely optional for ad_summary (its `requiredBreakdownColumns` is just `["Day", "Ad name"]`); a real ad_summary export missing it stages with a warning, not a 422. Hand-built test fixtures for demographic/device_placement/conversion_device still need Day, Campaign name, Ad name, Amount spent, and Impressions to avoid an unrelated "missing column" 422; ad_summary fixtures only need Day, Ad name, Amount spent, and Impressions.
