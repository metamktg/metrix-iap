---
name: variable_performance payload field names
description: The jsonb payload in the variable_performance Supabase table must use VariablePerformanceRow field names — the seed assembly forwards r["payload"] directly to the client without renaming.
---

## Rule
The `payload` column of the `variable_performance` table must use the exact field names defined in `VariablePerformanceRow` (artifacts/metrix-iap/src/lib/data/seedTypes.ts):

- `variable_family` (string)
- `variable_id` (string)
- `"Result type"` (string)
- `"Amount spent (USD)"` (number)
- `Reach`, `Impressions`, `"Clicks (all)"` (number, 0 if unavailable)
- `"Link clicks"` (number)
- `Results` (number)
- `unique_ads` (number)
- `CPA_result` (number | null)
- `CTR_link_pct` (number)
- `Result_per_link_click_pct` (number)

**Why:** The seed assembly at `metrixSeedAssembly.ts` does:
```typescript
const variablePerf = variablePerformance.map((r) => r["payload"]);
```
It passes the payload object directly as `v3_variable_performance` and `top_checkout_variables`. If the payload uses different keys (e.g. `spend` instead of `"Amount spent (USD)"`), every consumer that reads `VariablePerformanceRow` fields will get `undefined`, causing crashes like `esc(undefined)` in `reportExport.ts`.

**How to apply:** Any code that writes to `variable_performance` (including the Stage 2 analysis engine) must construct the `payload` object using the `VariablePerformanceRow` key names exactly — not camelCase, snake_case, or abbreviated versions.
