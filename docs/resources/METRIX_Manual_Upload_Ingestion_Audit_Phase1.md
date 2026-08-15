# METRIX Manual Upload Ingestion Audit — Phase 1

**Status:** audit record (planning context, not specification)
**Method:** the shipped `parseIapCsv` (`artifacts/api-server/src/lib/iapCsvParser.ts`) was run against a
real client Meta Ads export in all four upload slots, plus column-level fill profiling over every data
row. A throwaway probe test was used and removed; no source files were modified.

## Test corpus

A single Meta Ads Reporting export from the King of Violence account, supplied twice.

| Property | Value |
| --- | --- |
| Columns | 105 (one duplicated: `Result value type`) |
| Data rows | 34,148 |
| Date range | 2025-01-01 → 2026-08-13 (442 days) |
| Ads / ad sets / campaigns | 239 ad IDs (135 distinct names) / 37 / 24 |
| Grain | `Day × Ad ID × Placement × Platform × Device platform × Conversion device`, fully unique |
| File size | 17,127,821 bytes (~17.1 MB) |

The two supplied files are identical in content and differ only in row order, so their checksums
differ while a sorted comparison is byte-identical.

### Populated vs empty

Delivery metrics are entirely absent; engagement and conversion counts are present.

| Column | Fill | Sum |
| --- | --- | --- |
| Amount spent (USD) | 0% | — |
| Impressions / Reach / Frequency | 0% | — |
| Results / Results value / Purchase ROAS | 0% | — |
| Page engagement | 97.0% | 1,393,270 |
| 3-second video plays | 87.4% | 1,275,442 |
| Link clicks | 28.7% | 55,604 |
| Adds to cart | 2.8% | 2,086 |
| Checkouts initiated | 2.1% | 1,182 |
| Purchases | 1.2% | 483 |
| Adds of payment info | 0.5% | 216 |

## Observed behaviour

### Gate 1 — the file never reaches the parser

`MAX_MANUAL_IMPORT_BYTES` (`routes/metrix.ts`) is 8 MB, behind `express.json({ limit: "12mb" })`
(`app.ts`). A 17.1 MB file base64-encodes to ~22.8 MB, so the body parser rejects the request before
the handler runs. The handler's "File is too large — the limit is 8 MB." message is unreachable for
any file large enough to trigger it via this path.

### Gate 2 — rejected in all four slots

| Slot | Outcome | Message |
| --- | --- | --- |
| `device_placement` | reject | `Row 2: missing required value for "Impression device". Meta pivot exports must not include totals/subtotals rows — check "no totals" is unchecked in the export.` |
| `demographic` | reject | contains `Placement` → "upload as the Device/Placement CSV instead" |
| `ad_summary` | reject | contains `Placement` → "upload as the Device/Placement CSV instead" |
| `conversion_device` | reject | contains `Placement` → "upload as the Placements CSV instead" |

Three slots redirect to `device_placement`, which rejects with a message naming a cause that is not
present — the file contains no totals rows. The actual cause is that Meta labelled the column
`Device platform` while `DEVICE_PLACEMENT_BREAKDOWN_COLUMNS` requires `Impression device`.
`Device platform` is not in `COLUMN_ALIASES`, and Jaccard inference scores it 0.33 against
`Impression device` — below the 0.5 promotion threshold. Because `Impression device` is not in
`CRITICAL_BREAKDOWN_COLUMNS` it does not hard-fail at header resolution; it fails later in the
row loop, where every blank required-breakdown value funnels into the totals-rows message.

### Gate 3 — renaming one column produces a meaningless success

With `Device platform` → `Impression device` and nothing else changed:

```
PARSED OK. rows = 34148
objectiveGroups: ecommerce
missingColumns (2): Landing page views | Unique 2-second continuous video plays
WARNINGS (1): Note: supplementary metric columns not found (will be null): …

>>> TOTAL SPEND PARSED: 0  TOTAL IMPRESSIONS: 0
```

Column resolution verifies that headers exist, not that they carry values. The conversion-export
heuristic at the end of `parseIapCsv` does not fire either: it requires `anyExplicitZero`, and these
cells are blank rather than `0`, so `parseNumericCell` returns `null`.

## Root cause of the empty metrics

The export carries a `Conversion device` breakdown. Meta cannot attribute impressions or spend to the
device where a conversion later occurred, so all delivery metrics return blank. Splitting rows on that
column shows two disjoint populations:

| Row population | Rows | Link clicks | Purchases | Page engagement | Spend |
| --- | ---: | ---: | ---: | ---: | ---: |
| Real conversion device | 33,112 | 55,604 | 0 | 1,393,270 | 0 |
| Unattributed (`"0"`) | 1,036 | 0 | 483 | 0 | 0 |

Clicks and purchases never co-occur on a row, so no join on the grain key reunites them, and summing
the file yields a conversion rate of zero or infinity.

`CONVERSION_DEVICE_BREAKDOWN_COLUMNS` already documents this rule ("These rows carry only conversion
metrics — no spend or impressions") but attaches it to an upload slot. Here the collision occurs
inside a single file, so the guard never runs.

## Findings

| ID | Severity | Finding |
| --- | --- | --- |
| F-01 | Critical | Validation checks header presence, not data presence. A file with all required columns and no values reports success. |
| F-02 | Critical | Tracking basis is modelled per file (slot), not per row, so mixed-basis exports cannot be represented. |
| F-03 | High | Row-level required-breakdown failures all report the totals-rows message, naming a cause that may not apply. |
| F-04 | High | 8 MB decoded limit behind a 12 MB body limit is below the size of one normal account-year export. |
| F-05 | High | `Device platform` is absent from `COLUMN_ALIASES` and scores below the inference threshold. |
| F-06 | Medium | `optionalMetricsPresent` uses exact string match only; 216 `Adds of payment info` events are dropped with no notice. |
| F-07 | Medium | Duplicate header names collapse — `colIndex` keeps only the last occurrence. |
| F-08 | Medium | Re-uploads are not deduplicated; row-order-only differences produce different file checksums. |

## Column taxonomy

Classifying the 105 columns in the corpus:

| Class | Count | Treatment |
| --- | ---: | --- |
| Primitives (not derivable from other columns) | 40 | required / accepted |
| Derivable (cost-per-X, rates, ROAS, frequency, averages) | 35 | discard on sight, recompute |
| Dimensions / identity | 20 | grain keys |
| Creative metadata | 10 | stored as strings |

`DERIVED_OR_IRRELEVANT_METRICS` already states the correct policy — ratio columns are accepted
transparently, never listed as missing, and never trusted over the server's own math — but it was
applied only to `BASE_METRICS`. The objective groups still demand 22 derivable columns:

- `ECOMMERCE_METRICS` (9): Cost per add to cart, Cost per content view, Cost per checkout initiated,
  Cost per purchase, Purchase ROAS, Website purchase ROAS, Average purchases conversion value,
  Purchases rate per landing page views, Purchases rate per link clicks
- `SERVICE_METRICS` (4): Cost per lead, Cost per contact, Cost per appointment scheduled,
  Cost per registration completed
- `APP_METRICS` (9): Cost per app install, Cost per mobile app install, Cost per app activation,
  Cost per in-app session, Cost per in-app purchase, Cost per in-app registration completed,
  Cost per in-app trial started, Cost per in-app subscription, Cost per rating submitted

**Rule proposed:** a column belongs in the required set only if it cannot be computed from other
columns on the same row. Everything else is accepted when present, ignored when absent, and always
recomputed from primitives.

## Recommended ingestion model

1. **Accept any Meta export, streamed.** Replace base64-in-JSON with streamed multipart so the ceiling
   is set by storage rather than request-body limits; parse to a row iterator rather than an array.
2. **Fingerprint the grain rather than asking for it.** Derive grain from the breakdown columns
   present. A file becomes a *(grain, metric-set)* pair the system registers, not a class the user must
   sort it into — collapsing four slots to one dropzone.
3. **Stamp tracking basis per row** (delivery- vs conversion-attributed), from that row's dimensions.
   This is F-02's fix and what makes single-file ingestion of mixed exports possible.
4. **Reduce to primitives only.** Keep the ~40 primitives, discard the 35 derivable columns, compute
   every ratio at query time so the same number is produced identically at every aggregation level.
5. **Measure coverage, then decide.** Record non-null count and column sum for every primitive.
   Zero-sum spend or impressions is a hard stop with a precise message — this is the gate that catches
   the corpus file.
6. **Return a capability ledger, not a confidence score.** State which analyses are unlocked, which are
   blocked, and the exact export setting that unblocks each. For this corpus that renders as: creative
   and engagement analysis available; placement and platform breakdown available; cost/efficiency/ROAS,
   demographic analysis, and conversion-rate analysis blocked — two of the three naming the same
   single fix (remove the Conversion device breakdown).

## Suggested sequencing

1. Coverage gate (F-01) — highest severity, smallest diff, prevents the silent-success case alone.
2. Honest row errors (F-03) — separate "column not found" from "row value blank"; add the
   `device platform` alias (F-05) as the immediate patch.
3. Finish the derived-column policy — move the 22 derivable columns out of the required optional
   groups. Pure deletion.
4. Raise the ceiling (F-04) — streamed multipart; make the size limit reachable and honest.
5. Row-level tracking basis (F-02) — schema change; hold until mixed-basis aggregation semantics are
   agreed, as it reaches into the analysis engine rather than only the parser.

Steps 1–3 are contained enough to land together.
