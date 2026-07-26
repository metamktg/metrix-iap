---
name: Metrix IAP run picker
description: Architecture decision replacing DatePresetBar with RunPickerBar on manual-upload accounts; key implementation gotchas.
---

## Rule
Manual-upload accounts show a **RunPickerBar** (not DatePresetBar) on the Analysis Overview. Selecting a run scopes the overview to that run's date window via `GET /metrix/accounts/:accountId/analysis-summary/run/:runId`. "All data" pill shows seed totals.

**Why:** Manual uploads are fixed historical snapshots. Calendar-relative presets ("last 7 days") return $0 or no differentiation because account data windows don't overlap today. The meaningful filter is "which upload run am I looking at."

## Implementation notes

### Route ordering
`/analysis-summary/run/:runId` must be registered **before** `/:preset` in the Express router even though they have different segment counts. The path-param pattern `:preset` can match the literal segment "run" if route order is wrong.

### Codegen workflow
After editing `openapi.yaml`, run the actual pnpm codegen (NOT npx):
```
pnpm --filter @workspace/api-spec run codegen
```
Then immediately re-run `api-codegen-drift` to confirm sync. Hand-editing generated files without running codegen produces drift failures — orval's formatting (prettier + specific function signatures) never matches hand-written additions exactly.

### orval `clean: true` HMR side-effect
Running codegen in-place causes orval to delete+rewrite generated files while Vite is watching them. This triggers mass HMR invalidations and a transient "useAuth must be used within an AuthProvider" error in the browser. It resolves on the next page refresh — it is not a code bug.

### Type mismatch: AnalysisRun vs RunSummary
`AnalysisRun` (from generated types) has `date_start?: string | null` (with `undefined`). The `RunSummary` prop type in `RunPickerBar` must use `string | null | undefined` (i.e. optional) for `date_start`/`date_end`, and `fmtRunDate` must accept `string | null | undefined`.

### useListAnalysisRuns options
Passing `{ query: { enabled: boolean } }` to `useListAnalysisRuns` fails tsc — `UseQueryOptions` requires `queryKey` when supplied. Drop the options entirely; the hook's default `enabled: !!accountId` guard is sufficient.

## Key files
- `analysisEngine.ts` — `getAnalysisSummaryByRunId(accountId, runId)` added
- `metrixAnalysis.ts` — `/analysis-summary/run/:runId` route registered before `/:preset`
- `openapi.yaml` — `/metrix/accounts/{accountId}/analysis-summary/run/{runId}` path
- `shared.tsx` — `RunPickerBar` component (replaces `DatePresetBar` on analysis overview)
- `AnalysisOverview.tsx` — `selectedRunId` state replaces `preset`; uses `useListAnalysisRuns` + `getGetAnalysisSummaryByRunQueryOptions`
