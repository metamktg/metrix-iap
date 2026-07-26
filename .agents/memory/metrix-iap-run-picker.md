---
name: Metrix IAP data-window picker
description: Architecture of the Analysis Overview date filter — how accounts get their period pills, what endpoints power them, and why run metadata is not used.
---

## The DataWindowBar (was: RunPickerBar)

The Analysis Overview filter bar was refactored from a run-metadata-driven picker to a data-driven picker:

- **Component**: `DataWindowBar` in `shared.tsx` (renamed from `RunPickerBar`)
- **Data source**: `GET /metrix/accounts/:accountId/analysis-data-windows` → `getAccountAnalysisDataWindows` in `analysisEngine.ts`
- **Engine**: queries `ad_performance` directly — NOT `manual_analysis_runs`
- **Bucketing**: ≤60 days of data → single window pill; >60 days → one pill per calendar month
- **Selecting a period**: calls `GET /analysis-summary/daterange/:start/:end` → `getAnalysisSummaryByDateRange`

**Why:** `manual_analysis_runs` is upload-event metadata and can be duplicate, stale, or missing (e.g. ECAS had no run records but had actual data). `ad_performance` is always authoritative.

## Route ordering (critical)

Both literal routes must be registered **before** the `/:preset` wildcard in Express:

```
/analysis-summary/daterange/:start/:end  ← before /:preset
/analysis-summary/run/:runId             ← before /:preset
/analysis-summary/:preset                ← catch-all (LAST)
```

## Orval codegen — path params vs query params

For the daterange endpoint, `start` and `end` are **path params**, not query params.

**Why:** When an operation has both path params AND query params, orval generates:
- A Zod schema `FooParams` in `api.ts` (for path params)
- A TypeScript type `FooParams` in `types/` (for query params)

Both get re-exported from `index.ts` → TS2308 collision.

**Fix:** Use path segments for date range: `/daterange/{start}/{end}`. Then only one `FooParams` exists (the Zod schema for path params). No `types/fooParams.ts` is generated for query params.

## Shared engine helper

`_computeAnalysisSummaryForDateRange(accountId, start, end)` is the private shared implementation. Both public wrappers delegate to it:
- `getAnalysisSummaryByRunId` — looks up dates from `manual_analysis_runs`, then calls helper
- `getAnalysisSummaryByDateRange` — caller provides dates directly

## Codegen reminder

After any openapi.yaml change: `pnpm --filter @workspace/api-spec run codegen` (never `npx orval`), then re-run `api-codegen-drift` to confirm in sync.
