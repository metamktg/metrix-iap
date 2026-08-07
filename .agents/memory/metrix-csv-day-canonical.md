---
name: Metrix CSV Day canonical + derived metrics
description: Canonical date breakdown column is "Day" (Meta's real export header); derivable/ranking columns are accepted but never expected.
---

- The canonical date breakdown column across all four IAP CSV classes is **"Day"** — that is what Meta Ads Manager actually exports. "Date", "report date", "reporting starts", "week", etc. are aliases resolving to "Day". Engine reads `breakdowns["Day"]`.
- **Why:** demanding "Date" flooded real imports with warnings and an error message told users to rename Day→Date (backwards).
- Derivable columns (cost-per-X = spend÷X, rate = count÷count) and Meta ranking labels live in `DERIVED_OR_IRRELEVANT_METRICS` (iapCsvSpec): accepted into `row.base` when present, never listed missing, never in the Required Format panel. Ratios must NEVER land in `row.extra` — `accumulate()` sums all extras and summed ratios are garbage.
- The engine re-parses CSV content from `manual_imports` on every analysis run — breakdown keys are not persisted, so canonical renames are safe.
- Jaccard inference has a rate↔count mismatch guard: a header matching /rate|cost per|ctr|cpc|cpm/ can never be inferred onto a count column (and vice versa). Real incident: "Purchases rate per landing page views" was mapped onto "Landing page views".
- `SIGNAL_WEIGHTS` must sum consistently; "Cost per result" weight was folded into "Results". A client copy of the weights exists in ImportConfidenceReport.tsx — keep in sync.
