---
name: Metrix demographic row grains
description: Demographic exports can carry an "ACCOUNT" aggregate grain alongside overlapping per-cell rows — summing both double-counts.
---

# Metrix demographic row grains

Some accounts' `demographic_registration_signal` rows carry TWO overlapping grains at once:
an `cell_id: "ACCOUNT"` aggregate set (manual demographic uploads, ad name "All ads (manual
demographic upload)") **plus** per-cell rows for the subset of ads mapped to creative cells.

**Rule:** never sum both grains together.
- Account-level totals: use the ACCOUNT rows when they exist (they are the authoritative
  marginals and cover unmapped spend the per-cell rows miss); otherwise sum all rows.
- Per-cell/concept attribution: use only the per-cell rows, never the ACCOUNT grain.

**Why:** the per-cell rows are a subset breakdown of the ACCOUNT totals, so a naive sum
double-counts spend/results (observed ~2× drift on real data).

**How to apply:** go through `scopeDemographicRows` / `cellGrainRows` in
`artifacts/metrix-iap/src/lib/segment-analytics.ts` instead of filtering rows ad hoc.
Also: `Reach` can be null across an entire upload — strict-sum to null, never coerce to 0
(JS silently treats `n + null` as `n + 0`).

## Joint demographic × placement grain

Demographic rows may ALSO carry `Placement`/`Platform` fields — a third, joint grain
(segment × placement). Rules established with the grid-intersection feature:
- A non-empty `Placement` string marks a joint row (`isJointPlacementRow`).
- Per cell, plain (marginal) rows stay authoritative for totals; joint rows are used for
  totals only when a cell has NO marginal rows (joint sums to marginals by construction).
  This collapse happens inside `scopeDemographicRows`/`cellGrainRows`, so all existing
  totals code is automatically double-count-safe.
- Intersections without joint coverage return `null` (rendered "—"), never zero — the
  honesty rule extends to the joint grain.
- ACCOUNT-grain joint rows are authoritative at account scope, always excluded at cell scope.
- Placement/platform matching against placement-signal labels is trim+case-insensitive
  (`placementKey`).
