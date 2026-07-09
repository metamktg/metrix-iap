---
name: Metrix result terminology derivation
description: How UI copy derives each account's result noun (registrations vs purchases) and why totals are the wrong source
---

The IAP UI derives each account's result noun (registration/purchase/trial/…) via `resultTerm(account)` in the metrix-iap shared module, instead of hardcoding any client's result type.

**Rule:** derive the dominant result event from `analysis.performance_by_cell` rows' `"Result type"` (ranked by summed Results, row count breaks ties), NOT from `campaign_summary.bottom_line_totals` or spend.

**Why:** bottom-line totals include events outside the analysis scope — Bookster's totals are dominated by "Mobile app installs" (486 results, most spend) while its actual analysis result type is "Website registrations completed" (78). Ranking totals by results or spend both mislabel the account. The cell rows record what the analysis actually measured.

**How to apply:** any new UI copy that names the result event should use `resultTerm` (falls back to totals → campaign windows → neutral "result"). Keep data-keyed names (table badges like `demographic_registration_signal`, seed field names like `registration_control`, v3/c4e scopes) untouched — only display copy is derived. `registration_control` is null for accounts without a secondary control; UI hides that card and exports guard it.
