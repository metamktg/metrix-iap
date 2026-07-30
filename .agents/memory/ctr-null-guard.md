---
name: CTR null-guard for conversion-export data
description: When link_clicks > impressions the rows are from a Meta conversion export, not delivery — CTR is meaningless and must be null.
---

# CTR null-guard for conversion-export data

## The rule
In `metrixSeedAssembly.ts`, whenever `totalLinkClicks > effectiveImpressions` (at both per-account and manager-rollup call sites), emit `null` for `linkCtrPct` / `overall_link_ctr_pct`. Do NOT compute a percentage — it will be astronomically wrong (e.g. 154,250%).

**Why:** Meta's conversion/action exports carry attributed clicks and results but `impressions=0` (delivery impressions are not attributed per conversion). When the system stores these rows alongside delivery rows, the impression sum is nearly zero while clicks are real, yielding CTR values like 154,250%. The guard `clicks > impressions` is physically impossible for real delivery data and reliably identifies the bad-data case.

**How to apply:** There are THREE call sites in `metrixSeedAssembly.ts`:
1. Per-account `buildAccountObject()` — `linkCtrPct` computation after `effectiveImpressions`
2. Manager blended rollup in `assembleMetrixSeed()` — `linkCtrPct` inside manager totals
3. Scoped manager rollup in `scopeMetrixSeedForUser()` — `link_ctr_pct` inside `bottom_line_totals`

Keep all three consistent. `fmtPct(null)` already returns "—" in the UI — no UI changes needed.

## Type chain
- `metrixSeedAssembly.ts` emits `number | null`
- `seedTypes.ts`: `link_ctr_pct: number | null`, `overall_link_ctr_pct: number | null`
- `openapi.yaml`: `overall_link_ctr_pct: { type: number, nullable: true }` (not in `required`)
- After any spec change: run `pnpm --filter @workspace/api-spec run codegen` then `pnpm --filter @workspace/scripts run refresh:seed-fixture`

## Known residual issue
The **manager blended CTR** (in `assembleMetrixSeed`) still sums clicks/impressions from ALL accounts unconditionally. Even after the per-account guard, bookster's 6,110 conversion clicks inflate the manager blended total against ecas's delivery impressions → 15.8% which is still wrong. Fix: only add an account's clicks to the manager numerator when that account's per-account CTR is non-null.
