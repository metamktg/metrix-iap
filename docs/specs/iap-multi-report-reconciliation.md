# IAP multi-report reconciliation — a reconciliation-first evidence layer

**Status:** implemented on `claude/pre-release-reconciliation-ux-cznjbz` (2026-09-02). **Amended the same day**
by the owner's follow-up: not a fixed four-file contract but an adaptive multi-report reconciliation and
evidence-cube engine (§2a, §3a, §6a, §7a, §10a, §12a, §17a, §19). Amendment sections are marked "(amended)". This is the
first document under `docs/specs/`; the repository had no spec or ADR convention before it
(decisions were recorded as numbered register sections — see `docs/resources/CARRY_FORWARD_REGISTER.md`
§14, which links here). The blueprint remains canonical where the two disagree.

**Owner brief (verbatim intent):** connect Meta's ad-level truth, demographic reports, placement
reports, copy and media assets, and the existing IAP deconstruction library. Accept multiple manual
exports, understand what each report can prove, reconcile every additive metric against the strongest
compatible source, and improve automatically as more reports are imported. Incomplete reports stay
usable with measured coverage and evidence states. The hard line: reconstructed or contextual values
are never presented as directly observed.

---

## 0. Verification of the brief against the code (read before the rest)

Every assumption in the brief was checked against the code on `main` at `df99273` and against the
live tester account (`manual_AHXANj6Vjozp`). Corrections are recorded here and the implementation
follows the verified architecture, not the brief's wording.

| Brief assumption | Verified finding | Consequence |
|---|---|---|
| Duplicate headers may resolve to first *or* last occurrence | **First.** Every column resolution uses `rawHeader.findIndex(h => h.trim() === value)` (`iapCsvParser.ts:379, 426, 453, 498, 565, 709`); rows are objects keyed by canonical column name, so the later column is unreachable. One folded warning per file says so (`:303-334`). | §5: the parser now keeps duplicate columns by ordinal, compares values row by row, and records a note (identical) or a **schema conflict** (different). A conflicting join field makes the import's rows `unjoinable` through that field. |
| Demographic data loses Ad ID "at or around `analysisEngine.ts:2059`" | **Confirmed, and wider.** The demographic bucket key is `[gender, age, date]` (`:2059-2067`); placement `[placement, date]`, platform `[platform, date]`, device `[device, date]` (`:2078-2103`); the window signals drop the date too (`:2134, :2142`). `demographic_signal` rows are written with `cell_id: "ACCOUNT"` and one synthetic ad name (`:2634-2663`). | §8: a new ad-grain fact table is written alongside the existing tables. The existing daily tables and ACCOUNT rows are untouched (backward compatibility, §16). |
| "8 of 19 ads" may count names, not Ad IDs | **Confirmed.** `ads` is keyed `unique (account_id, ad_name)` (`schema.sql:55-70`) and the cell comes from a regex on the ad name (`analysisEngine.ts:2410-2434`). Live: `ads` = 19 rows / 19 names / 19 `meta_ad_id`; `ad_instances` = 44 distinct `meta_ad_id` under those 19 names; `ad_performance` = 44 distinct `meta_ad_id`, 19 names. The `[Coverage]` run warning ("18 of 19 ads") counts `Ad name` too (`:1231-1260`). | §6: identity is Account ID + Ad ID. Name-based counts are relabelled "ad names" wherever they survive; new counts are by Ad ID. |
| C8A reaches the Demographics / Funnel tabs through a cell join | **Confirmed.** Demographics: `demographic_registration_signal.filter(r => r.cell_id === openCellId)` (`CreativeLibraryView.tsx:436`) against ACCOUNT rows → always empty for manual accounts. Funnel: `performance_by_cell.find(r => r.cell_id === openCellId)` (`:438`), and `performance_by_cell` is the seed projection of `library_cell_performance`, which **only the offline importer writes** — manual runs never do. Placements tab is account-level by design (`CreativeExpandDialog.tsx:620`). The creative's ad is resolved by `ads.cell === cellId`, then `mapped_ad_names` (`creative-assembly.ts:67-100`). | §14: creative dialogs resolve mapped Ad IDs first (creative → `manual_imports.ad_names` → `ad_instances.meta_ad_id`), cell second. |
| `DisclosureStack`, `RevealPanel`, `RunProgress`, `FilterDisclosure`, `DetailReveal`, `inline-table-control` exist | **All exist** (`components/widgets/DisclosureStack.tsx`, `LayeredDisclosure.tsx:245`, `RunProgress.tsx`, `FilterDisclosure.tsx`, `shared.tsx:849`). `inline-table-control` is a **pattern** in `AdPerformanceView.tsx:578-626` (open-row set, siblings `opacity-40`, `aria-expanded`, `RevealPanel` detail row), not a component. `HeatMatrix` (`components/charts/HeatMatrix.tsx`) already backs age × gender grids. `ProgressMeter` renders `role="meter"`. `MetricDiagnosticModal` no longer exists (→ `KpiDrilldownModal`); `ScopeBanner` → `ScopeBadge`. | §15 names the real components and the one substitution (the coverage meter is `ProgressMeter`, not `RunProgress`, because `RunProgress` is a run-phase widget and a static coverage value is not a run). |
| The Ad Summary export is the per-Ad-ID control | **Not for this account.** The tester's Ad Summary (`SKOV-Pet-Ad-Account-Ads-…csv`) has **no `Ad ID` column** ("optional breakdown columns not present: … Ad ID") and is a whole-period export. The engine already refuses to add it to daily totals and uses it for cross-checks only. With 44 Ad IDs under 19 names, a name-keyed summary cannot serve as per-ad truth. | §7: source authority is decided per metric *and per grain*. Without Ad ID the summary is an **account-grain** control only; per-ad rows are `unreconciled` and the run says exactly which export field is missing. |
| Reconciliation is new | A reserved, unpopulated `AnalysisRun.reconciliation` field and an unwritten `import_metric_reconciliation` table exist (`openapi.yaml:4544-4557`, `schema.sql:1105-1118`). | §8: the new ledger supersedes both; the reserved field stays reserved (it has the wrong shape) and the old table is left in place, unwritten, documented as superseded. |

**Live evidence, re-derived from the database (2026-09-02):**

| Fact | Value |
|---|---|
| `demographic_performance` spend for the account | 2,645.74 |
| `ad_performance` / `placement_performance` spend (same window) | 4,405.61 |
| Spend coverage | 60.05% |
| Demographic rows | 952 (two runs) |
| Distinct Ad IDs in the pivots / distinct ad names | 44 / 19 |
| Totals-row warnings on the second demographic upload | spend, reach, impressions, frequency, CPM, views, clicks, CTR, link clicks, unique clicks, outbound clicks… each independently short |

The totals-row warning mislabels the currency (`Amount spent (USD)` for a CAD column). Fixed in §5.

**Verification added at the amendment (creative identity, versions, compatibility fields):**

| Question | Finding |
|---|---|
| Do imported rows retain primary text, headline, description, CTA, destination, image, video, asset ids? | The Ad Summary parse retains `CREATIVE_METADATA_COLUMNS` (`Image name`, `Video name`, `Ad creative body text`, `… headline`, `… call to action type`, `… link destination`, `… link caption`) in `row.creativeMetadata`; pivot rows retain any `ASSET_BREAKDOWN_COLUMNS` value in `row.assetBreakdowns` (commit 1). Meta's CSV exports carry **no creative id, no asset id and no thumbnail**; `Image hash` / `Video ID` are accepted when present (`CONFIGURED_ASSET_COLUMNS`). |
| Can creatives change under one Ad ID; are versions stored? | Nothing stored versions before this work. `creative_assets` now keys an instance by (ad, type, provenance, content hash) and records `date_start` / `date_end` from the rows that carried the value, so a headline changed mid-period under the same Ad ID is two instances with two periods (§10a). Without a creative id the version boundary is the content change itself. |
| Timezone, attribution window, action reporting time, objective? | Meta's Ads Reporting export carries `Attribution setting` as a column when selected (captured in `row.context`) and no timezone or action-reporting-time column; the objective is the per-row `Result type` (already the derived-objective source). Compatibility therefore checks account id, currency, period, attribution setting and result definition — timezone cannot be checked from the files and is documented as unavailable. |
| Where are demographic and placement dimensions discarded? | `analysisEngine.ts` demographic buckets `[gender, age, date]`, placement `[placement, date]`, platform `[platform, date]`, device `[device, date]`, and the window signals `[gender, age]` / `[placement, platform]` — none carries the ad. The new `ad_breakdown_performance` rows do. |
| How are creatives, ads, cells and variables joined? | Creative file → `manual_imports.ad_names` (matcher) → `ads` (keyed by name) → `ads.cell` (regex on the name) → `library_cells` / `performance_by_cell` by cell id. Variables: `creative_deconstructions.variables` per import, `variable_performance` from ad-name tokens. Now: `ads[].meta_ad_ids` (every instance), `variable_evidence` (many-to-many), joins by Ad ID first. |
| Are the four files mandatory? | The run refused to start without both a demographic and a placement export (`startManualAnalysis`, 422 "Both reports are required"). Amended: a run needs at least one delivery report with spend; every other class only adds resolution (§2a). |

---

## 1. Problem and validated evidence

The tester's original demographic export had the effective grain
`Day × Ad ID × Age × Gender × Text`. It contained 5,997 data rows, 34 distinct Ad IDs,
$2,645.74 CAD of detailed spend against $4,405.61 CAD in Meta's own totals row — 60.05% spend
coverage, $1,759.87 unallocated by the breakdown. Coverage differed by metric:

| Metric | Coverage |
|---|---|
| Spend | 60.05% |
| Impressions | 32.36% |
| Link clicks | 57.11% |
| Purchases | 77.78% |

So reconciliation must be computed **separately for every additive metric**; a universal coverage
factor would be wrong for three of the four.

The re-exported demographic report (Day and Text removed; grain `Ad ID × Age × Gender × period`)
contained 643 rows, 44 distinct Ad IDs, zero duplicate `Ad ID × Age × Gender` keys, $4,405.61 of
detailed spend, and 100% reconciliation across spend, impressions, clicks, outbound clicks, LPVs,
ATCs, checkouts, purchases, purchase value, leads, engagements and video metrics. The original
high-dimensional report omitted 10 ads entirely ($483.14) and under-reported $1,276.73 within ads
present in both files.

This proves the combined reporting grain caused the incomplete coverage. It does **not** prove
whether Meta's internal cause was asset attribution, privacy suppression, ad-format compatibility or
reporting limits; the platform records the observed behaviour and does not invent the upstream
mechanism (the current `[Coverage]` warning's "iOS privacy limits" guess is removed).

The validated report contains 44 Ad IDs but only 19 distinct ad names: **ad names are reused and are
not identifiers.** Meta also emitted duplicate headers for `Ad ID`, `Ad name` and
`Result value type`; their values matched in these files, but the parser must verify that rather than
assume it.

## 2. Goals and non-goals

**Goals**

1. Every additive metric on every report is reconciled against the strongest *compatible* source, per
   Ad ID where the control allows it and per account otherwise, with signed residuals.
2. Ad ID survives every breakdown pipeline; creative surfaces join through mapped Ad IDs first.
3. Assets (copy and media), configured or delivered, are first-class records with instance identity
   and content identity, connected to the IAP deconstruction library without duplicating spend.
4. Every number the UI shows carries an evidence state and, where relevant, a coverage figure.
5. Imports remain forgiving: a report with a partial grain, a missing column or no control source is
   usable, labelled, and improves automatically when a better report arrives.

**Non-goals**

- Automatic runs. Runs stay manual (owner rule); the reconciliation graph is recomputed by the next
  run, never by an upload.
- Emitting modelled values in this phase. The modelled tier's balancing function ships as a pure,
  tested interface (§19) and nothing writes its output yet.
- Replacing the daily tables, the ACCOUNT signal rows or the `performance_by_cell` importer path.
- Changing what the objective is (owner decision 2026-09-01): the terminal KPI stays the derived
  objective's result and cost per result, never ROAS.

## 2a. Adaptive contract, not a fixed file set (amended)

The engine accepts whichever compatible Meta exports the user provides, in any order and any number,
and extracts the maximum defensible evidence from them:

- **No report class is mandatory.** A run starts with at least one delivery report that carries spend
  (demographic, placement, asset-breakdown pivot, or a daily Ad Summary). Every additional compatible
  report only adds resolution: a missing report lowers coverage or prevents one intersection; it never
  invalidates unrelated evidence.
- **Capability, not filename.** Each staged file is classified by its actual grain and what it can
  prove (§3a). The slot the user chose only selects the column template; the grain says what the file is.
- **Progressive resolution.** Ad truth (Ad × Day), copy (Ad × copy signature), demographic
  (Ad × Age × Gender), placement (Ad × Platform × Placement × Device) and every direct joint the exports
  carry populate the evidence cube (§12a) independently. Overlapping exports are never added: they are
  superseded by import order or partitioned when provably disjoint (§8).
- **Coverage differences are normal evidence conditions**, not import failures. Meta states that
  breakdown totals need not add up to overall totals and that demographic breakdowns can omit data;
  the engine measures what is present and never assumes what Meta should have returned. Geography and
  market change availability and coverage, never the mathematics — nothing is hard-coded per country.
- **Native currency.** Reconciliation runs in the account's native currency; FX conversion belongs to
  a separate comparison layer and never alters the ledger.

## 3. Supported report classes and grains

The staged `manual_imports.kind` values stay the entry point (client-declared slot; the parser's
`detectCsvClassMismatch` still rejects a file in the wrong slot). On top of the slot, the parser now
**detects the report's grain** from the resolved columns and records it on the import
(`manual_imports.report_grain`, §5). A grain names the report class in the vocabulary below.

| Report class | Grain (all include Account ID × reporting period) | How it is recognised |
|---|---|---|
| `ad_summary` | Ad ID | slot `performance_ad_summary_csv`, no Day per ad, no breakdown dims |
| `time_series` | Ad ID × Day | slot `performance_ad_summary_csv` **with** a real daily Day (more than one distinct day per ad) |
| `demographic` | Ad ID × Age × Gender | slot `performance_demo_csv`, no asset column |
| `placement` | Ad ID × Platform × Placement × Device | slot `performance_placement_csv`, no asset column |
| `asset` | Ad ID × asset type × asset instance | any performance slot whose only extra dimension is an asset breakdown column (§10) |
| `demographic_asset` | Ad ID × Age × Gender × asset | slot `performance_demo_csv` **with** an asset breakdown column — the tester's original file |
| `placement_asset` | Ad ID × Platform × Placement × Device × asset | slot `performance_placement_csv` with an asset breakdown column |

Day is a **period refinement**, not a grain of its own: a daily file is aggregated to the run window
before it joins anything (§12), and the daily tables keep it for the trend surfaces. A joint file
also yields its **margins**: a `demographic_asset` file produces a demographic margin (summed across
assets), an asset margin (summed across age × gender) and the joint cells; each is a separate
observation set with its own ledger rows, so the 60% demographic margin of the original file is
reconciled honestly rather than hidden.

Files are accepted in any order and any number per slot. The reconciliation graph is recomputed by
every run over every staged file the run consumes.

## 4. Manual-import classification

Classification is deterministic and happens at staging, from the header row alone:

1. Slot check (existing): `detectCsvClassMismatch` — a demographic file in the placement slot is a 422.
2. Grain detection (`reportGrain.ts`): identifies `has_ad_id`, `has_day`, the breakdown dimensions
   present, the asset breakdown columns present (mapped to asset types by the table in §10), whether
   the file is a whole-period aggregate (one distinct Day per ad, or a period column), and the
   account id, currency and attribution setting when the export carries them.
3. The result is stored as `manual_imports.report_grain` (jsonb) and reported in the staging
   response, so the upload dialog can say "Demographic × Text — the Text breakdown makes coverage
   partial; re-export without Text for full coverage" **before** the run.

Nothing is rejected for being partial. Rejection stays reserved for the wrong slot, no data rows, or
an unreadable file.

## 3a. Report capability detection (amended)

`manual_imports.report_grain` (`ReportGrain`, `reportGrain.ts`) now declares or infers, per file:

| Field | Source |
|---|---|
| `report_class`, `dimensions`, `asset_columns` (each with `role: breakdown | context`, §10a) | resolved columns + row variation |
| `has_ad_id`, `ad_id_fill_pct`, `ad_id_joinable`, `has_campaign_ids`, `has_ad_set_ids` | columns + header conflicts |
| `has_day`, `distinct_days`, `aggregate_shape`, `period` | Day values, `Reporting ends` |
| `account_ids`, `currency`, `attribution_settings` | `Account ID`, the spend header, `Attribution setting` |
| `result_types` (the objective / result definition present) | `Result type` values |
| `has_totals_row` | the parked grand-totals row |
| `additive_metrics`, `non_additive_metrics` | the metric additivity tables |
| `header_conflicts` | duplicated headers that disagreed |
| source fingerprint, import timestamp | `manual_imports.content_md5`, `created_at` (existing) |
| creative id / version, timezone, action reporting time | **not in Meta's CSV exports** — recorded as unavailable |

Joint classes recognised: `demographic_asset`, `placement_asset` and (amended) `demographic_placement`
(Age, Gender with Platform / Placement / Device on one row).

## 5. Header and schema normalization

**Ordinal preservation.** `parseIapCsv` now indexes the header by ordinal. When a header string
appears more than once:

- The values of every occurrence are compared row by row after normalization (trim, numeric
  canonicalization for numeric columns).
- Identical → one canonical field is selected (the first ordinal) and an **informational note** is
  recorded: `Column "Ad ID" appears twice (columns 6 and 12); the values are identical, column 6 is
  used.`
- Different → all occurrences are retained in `row.duplicates[header]`, a **schema conflict** is
  raised in `parseResult.headerConflicts`, and the field is marked unusable for joins. A conflict on
  `Ad ID` makes the file's rows `unjoinable` at ad grain (§6); a conflict on a metric excludes that
  metric from the ledger with a `compatibility_failure`.
- Provenance keeps the original header, its ordinal position(s) and the source import id.

**Currency label.** Totals-row and coverage warnings resolve the currency from the matched column
(`Amount spent (CAD)`), never from the template placeholder.

**Identifiers are strings.** `Ad ID`, `Ad set ID`, `Campaign ID`, `Account ID` are never parsed as
numbers; scientific-notation corruption is blanked with a warning (existing behaviour, kept).

## 6. Canonical ad, creative and asset identity

**Ad identity**, in priority order:

1. Exact `Account ID + Ad ID` (`ad_identity_kind = 'ad_id'`, `ad_identity = <Ad ID>`).
2. An existing verified identifier: an `ad_instances` row whose `meta_ad_id` is known for this
   account (used when a file carries Ad ID and the registry already has it — same key).
3. A composite identity, only when uniqueness is **proven**: a file without `Ad ID` may key rows by
   `Ad name` (`ad_identity_kind = 'ad_name'`) — and such a row joins an Ad-ID-keyed row **only** when
   the account's registry maps that name to exactly one `meta_ad_id`. A name that maps to several
   instances stays at name grain and is `unjoinable` at ad grain.
4. A stored or human-confirmed mapping (`manual_imports.ad_names` / `meta_ad_ids` set through the
   editor).

There is no blind fallback to ad name. When an import lacks Ad ID and no composite identity is
provably unique, its rows are `unjoinable` at ad grain and the run warning names the field to add:
`Add "Ad ID" to the Ad Summary export to reconcile per ad.` Account-grain reconciliation still runs.

**Asset identity** is two things at once, both retained:

- **Instance identity** — `creative_assets.id`: this asset on this ad (`ad_identity`, `asset_type`,
  `provenance`, `content_hash`). Two ads carrying the same headline are two instances.
- **Content identity** — `content_hash` = SHA-1 of the normalized value (Unicode NFKC, whitespace
  collapsed, case preserved for copy; lower-cased for media names and CTA types). Cross-ad analysis
  groups by content hash while every metric still flows through instances.

**Creative identity.** Meta's export carries no creative id; the "configured creative bundle" is the
set of configured asset instances on one ad identity for one reporting period.

## 6a. Compatibility key and source precedence (amended)

Ad ID is the reconciliation anchor, never the whole identity. Two rows are compatible — may sit in one
ledger — only when every field both carry agrees:

```
Account ID · Ad ID · reporting period (overlapping) · native currency ·
attribution setting · result definition (result type) · metric definition (slug)
```

A mismatch is a `compatibility_failure` of kind `account | period | currency | attribution |
result_definition | header_conflict`, and the affected rows are `incompatible` for that metric — never
blended, never averaged. Creative id / version and timezone are not in the exports and cannot be checked;
when a future source carries them they join the key without a schema change (`compatibility_failures`
is free-form JSON).

**Source precedence for truth** (per additive metric): a whole-period Ad Summary keyed by Ad ID → a daily
Ad Summary (time series) summed to the window → an Ad Summary keyed by name (account grain, and per ad only
through a registry-proven unique name) → the file's own Meta totals row (account grain) → none. When more
than one candidate exists the selected source is recorded (`truth_source`, `truth_import_ids`), the
alternatives are summed and compared, and a disagreement above 1% is surfaced as a `[Truth]` warning
and `truth_conflicts` on the summary — never resolved by averaging.

Ad-name fallback: only when the file has no Ad ID and the name maps to exactly one instance in the
compatible account and period; a second instance seen under a "unique" name is the registry being wrong,
not a join (tested).

## 7. Source authority by metric

Authority is decided per metric **and per grain**. A source is *compatible* when account id (if
present in both), currency (if present in both) and reporting period match, and the metric's join
field is not in schema conflict. Mismatches are recorded as `compatibility_failures` on the ledger
row and the source is skipped for that metric — never silently blended.

| Metric family | Ad-grain truth | Account-grain truth | Notes |
|---|---|---|---|
| Spend, impressions, clicks (all), link clicks, outbound clicks, LPVs, ATCs, checkouts, purchases, purchase value, leads, engagement counts, video-view counts, results | `ad_summary` / `time_series` keyed by Ad ID | `ad_summary` period sum → else the file's own Meta totals row (`truth_source = 'totals_row'`) → else none | additive; summed |
| Reach, frequency, unique clicks, unique outbound clicks | the source row at its exact grain only | the totals row at account grain only | never summed across ads, days or segments |
| Rates (CTR, CPC, CPM, CPA, CVR, cost per result) | never sourced; recomputed from sums | same | exported ratios are ignored for aggregation |
| Result type | the row's own | mixed → separated per result type | never merged across types |

Compatible sources are ranked: direct joint observation > non-overlapping campaign/ad-batch export
of the same class > reconciled observed cells > explicitly modelled residuals (phase 2, §19).

## 7a. Every metric independently (amended)

```
observed(ad, metric, breakdown) = Σ compatible unique breakdown rows
residual(ad, metric, breakdown) = truth(ad, metric) − observed(ad, metric, breakdown)
coverage(ad, metric, breakdown) = observed / truth
```

Spend coverage is never a proxy for another metric: the same ad can be 90% on spend, 80% on
impressions, 96% on clicks and 60% on purchases, and each has its own ledger row. Missing purchases are
never distributed by spend share. Zero and null truth are handled explicitly: null truth →
`unreconciled`; zero truth with zero observed → `observed_reconciled`; zero truth with observed > 0 →
`overcounted`. `overcoverage = max(0, observed − truth)` is stored beside the signed residual so an
overlapping or duplicated export is diagnosable, never normalised back to 100%.

Rates are recomputed from the compatible additive components (CTR = clicks ÷ impressions; CPM = spend ÷
impressions × 1,000; CPC = spend ÷ clicks; cost per result = spend ÷ the derived objective's result;
ROAS only from a valid purchase value ÷ spend, and only where the objective is purchase-based). Row-level
ratios are never averaged. Reach and frequency keep their own rule (§12).

## 8. Reconciliation formulas and the ledger

For every `(scope, ad identity, report class, metric)` the run writes one `reconciliation_ledger`
row:

```
truth_value    = authoritative value for the scope (null when no compatible control)
observed_value = Σ compatible rows of the report class at the scope
coverage_pct   = observed_value / truth_value × 100          (null when truth is null or 0)
residual       = truth_value − observed_value                (signed; negative = overcounted)
direct_share   = 1.0                                         (no modelled rows this phase)
modelled_share = 0.0
```

Stored with: `truth_source`, `truth_import_ids`, `observed_import_ids`, `grain`, `evidence_state`,
`compatibility_failures` (array of `{kind, detail}`), `reconciled_at`.

Rules that are load-bearing:

- Residuals are **never inserted** into demographic, placement or asset fact rows, never folded into
  an `Unknown` segment, and segments are never scaled to force a match. The residual is shown as its
  own labelled quantity ("Unattributed by this breakdown").
- Overcounting is detectable because residuals keep their sign; coverage above 101% sets
  `evidence_state = 'overcounted'`.
- Analysis proceeds without an Ad Summary; rows are `unreconciled`. `observed_reconciled` requires a
  compatible control source at that scope.
- Overlapping imports of the same class within one run (same ad identity × day or period in two
  files) are not unioned: the later-staged file supersedes for the overlapping keys and the run warns
  with the count. Disjoint files are unioned. The account-level ledger row records both import ids.

The old `import_metric_reconciliation` table (two metrics, demographic vs placement) is superseded by
this ledger and stays unwritten; the reserved `AnalysisRun.reconciliation` API field keeps its
"reserved" description because its row shape is the old one.

## 9. Evidence and confidence states

`evidence_state` (stored on fact rows, ledger rows, variable rows; served in the seed; rendered by
`EvidenceChip`):

| State | Meaning |
|---|---|
| `direct_asset` | metric observed by Meta for this specific asset instance |
| `direct_joint` | metric observed for a segment × asset cell |
| `ad_context` | the ad's metric attached to an asset or variable the ad carries; not attributable to the component |
| `observed_reconciled` | observed rows reconcile to a compatible control within ±1% |
| `observed_partial` | observed rows reconcile below 99% of the control; coverage shown |
| `modelled` | reconstructed by the balancing tier (phase 2 — never emitted today) |
| `overcounted` | observed exceeds the control by more than 1% |
| `unreconciled` | no compatible control source at this scope |
| `incompatible` | the source failed a compatibility check for this metric |
| `unavailable` | the metric cannot exist at this grain (e.g. reach summed across days) |

Confidence is separate from evidence: the existing volume tiers (`creativeComponents.ts:190-195`:
high ≥ $500 and ≥ 30 results; medium ≥ $100 and ≥ 5; low > 0) grade sample size, and the
existing `confidence_score = VOLUME_SCORE × (0.7 + 0.3 × coverage)` carries coverage. Below the
`low` tier a segment is pooled (§12) rather than ranked.

## 10. Creative-copy and media asset contracts

Asset types (`creative_assets.asset_type`): `primary_text`, `headline`, `description`, `cta_type`,
`cta_text`, `destination`, `display_link`, `image`, `video`, plus any additional Meta creative text
or media field mapped through the table below. Nothing is hardcoded around the `Text` column.

**Delivered asset breakdown columns → asset type** (`ASSET_BREAKDOWN_COLUMNS` in `reportGrain.ts`,
extend here, not in callers):

| Export column | Asset type | Provenance |
|---|---|---|
| `Text` | `primary_text` | delivered |
| `Headline`, `Title` | `headline` | delivered |
| `Description` | `description` | delivered |
| `Call to action`, `Call to action type` | `cta_type` | delivered |
| `Image name`, `Video name`, `Image, video and slideshow`, `Media` | `image` / `video` (by column) | delivered |

**Configured creative context columns → asset type** (`CREATIVE_METADATA_COLUMNS`, already parsed
for the Ad Summary): `Body (ad settings)` → `primary_text`, `Headline (ad settings)` / `Title` →
`headline`, `Description (ad settings)` → `description`, `Call to action type` → `cta_type`,
`Website URL` / `Link (ad settings)` → `destination`, `Display link` → `display_link`,
`Image name` / `Image hash` → `image`, `Video name` / `Video ID` → `video`; provenance `configured`.

The four kinds of evidence are kept distinct in storage and in the UI:

1. **Delivered asset evidence** — rows Meta broke down for a specific asset instance
   (`direct_asset`, `direct_joint`).
2. **Configured creative context** — fields attached to the ad (`creative_assets`,
   `provenance = 'configured'`), no metrics of their own.
3. **Ad-level evidence** — the ad's metrics (`ad_context` when attached to a component).
4. **Deconstructed IAP variables** — `creative_deconstructions.variables`, the existing taxonomy.

The `Text` breakdown is a delivered primary-text asset. It is never assigned to a headline or a
description merely because those values sit on the same row; those keep `ad_context` until Meta
provides a corresponding breakdown.

## 10a. Copy signatures and asset-column roles (amended)

The presence of a `Headline` or `Description` column does not prove Meta broke performance down by
it. The parser therefore classifies every asset column on a file by **row variation within an ad**:

- a column whose value is constant for every ad (one value per Ad ID across the file) is **context** —
  creative metadata repeated beside the real breakdown; it becomes a configured asset instance and
  receives `ad_context` evidence only;
- a column whose value varies within ads is a **breakdown** dimension;
- when exactly one breakdown column exists, direct evidence is attributed to that asset type
  (`primary_text` for `Text`);
- when several breakdown columns vary **together** (each combination is a distinct row), direct evidence
  is attributed to the delivered combination — a **copy signature** (`asset_type = "copy_signature"`,
  hash over the ordered field values, the fields retained in `segment.asset_fields`) — and never to any
  single field independently;
- an ambiguous relationship (a column that varies but is not aligned with the breakdown) is recorded on
  the grain as `role: "ambiguous"` and treated as context.

The $100 example (§17a, fixture): Ad 001 truth $100; Text A $40 and Text B $50 directly attributed;
$10 `unattributed_to_copy`; coverage 90%. The engine states exactly those four facts and never scales
A and B to $44.44 / $55.56, never files the $10 under an Unknown segment, never claims Text A *caused*
$40 of results, and never copies the $40 onto headline, description, CTA and every deconstructed variable
as separate spend. Versions: a configured asset's `date_start` / `date_end` come from the rows that
carried the value, so a copy change under one Ad ID is two instances with two periods.

## 11. IAP deconstruction integration

The relationship is `Ad → configured creative bundle → asset instances → deconstructed IAP variables
→ demographic and placement evidence → reconciled insight`, stored as:

- `creative_assets` — asset instances (§6), upserted on `(account, ad identity, asset type,
  provenance, content hash)` so a re-run attaches evidence to the same record; a creative is
  deconstructed once and every import attaches to it.
- `variable_evidence` — many-to-many `(variable family, variable id) × (ad identity, asset instance?)`
  with `relationship` (`direct_asset` | `ad_context`), `source_kind`
  (`deconstruction` | `ad_name_token` | `copy_component`), `source_ref` and `confidence`. Sources:
  filed deconstructions (`status in ('auto_filed','user_overridden')`) reach ads through
  `manual_imports.ad_names` → `ad_instances` (every instance carrying that name); the existing
  ad-name token variables reach their own ad; copy components reach the configured asset instance.
  A media deconstruction gets `direct_asset` only when a delivered media breakdown matches its
  `image_name` / `video_name`; otherwise `ad_context`.
- `variable_segment_performance` — per run, per variable × breakdown × segment: contributing ad ids
  and asset instance ids, `direct_totals`, `contextual_totals`, observed coverage, modelled share (0),
  result volume, cost per result (from sums), interaction index (§12), evidence state, confidence.

**No spend duplication.** Aggregation runs over the set of unique observations
`(ad identity, breakdown, segment key, result type)`; an ad that carries a variable through three
assets contributes once. The sum of variable-level spend is therefore **not** account spend and the UI
never presents it as such.

## 12. Demographic, placement and asset interactions; metric aggregation rules

Margins and joints per ad and additive metric:

```
D[a,d]   demographic margin        (ad × age × gender)
P[a,p]   placement margin          (ad × platform × placement × device)
A[a,x]   asset margin              (ad × asset instance)
J[a,d,x] demographic × asset cells (directly observed only)
K[a,p,x] placement × asset cells   (directly observed only)
```

Joint reports are validated against Ad Summary truth and against each margin they imply (their own
margins are ledger rows). Evidence priority is §7's ranking.

**Aggregation rules**

- Additive metrics are summed. Rates are recomputed from aggregated numerators and denominators;
  exported CTR/CPC/CPM/CPA/CVR/ROAS are never summed or averaged.
- Reach, frequency and unique metrics are kept only at the exact grain Meta returned (`reach_basis
  = 'exact'`); any aggregation nulls them (`unavailable`).
- Result types are separated; the terminal KPI is the derived objective's result and cost per result.
- ACCOUNT compatibility rows (`demographic_signal` with `cell_id = "ACCOUNT"`, `placement_signal`)
  remain; only additive metrics are produced by summation there; non-additive fields are null or
  sourced directly at account grain (the totals row).
- Day is never fabricated: a whole-period report writes `date_start/date_end = window`.

**Interaction index** (directly supported cells only):

```
expected_rate     = segment_baseline × asset_baseline / overall_baseline
interaction_index = joint_cell_rate / expected_rate
```

with every rate computed from summed numerators/denominators (results per impression by default;
results per spend when impressions are unavailable). Volume-aware shrinkage: the adjusted rate is
`(numerator + m × expected_rate) / (denominator + m)` with prior weight `m = 1,000` impressions
(or `m = 100` currency units when the denominator is spend); raw rate, adjusted rate, contributing
volume, contributing ad count and evidence state are stored side by side.

**Pooling.** For purchase-level conclusions with small counts (the tester has 18 purchases), age bands
below the `low` volume tier are pooled into the neighbouring band and labelled as pooled; nothing is
ranked on a band with fewer than 5 results.

## 12a. The reconciled evidence cube and attribution (amended)

Fact sets, each with provenance (`source_import_ids`) and evidence status:

| Fact | Grain | Table |
|---|---|---|
| Ad truth | Ad × Day × metric | `ad_performance` (existing) + the ledger's `truth_value` per ad |
| Copy | Ad × copy signature (or single asset) × metric | `ad_breakdown_performance` (`breakdown = asset`) |
| Demographic | Ad × Age × Gender × metric | `ad_breakdown_performance` (`demographic`) |
| Placement | Ad × Platform × Placement × Device × metric | `ad_breakdown_performance` (`placement`) |
| Direct joints | Ad × Demo × Copy · Ad × Placement × Copy · Ad × Demo × Placement | `ad_breakdown_performance` (`demographic_asset`, `placement_asset`, `demographic_placement`) |

Every fact row carries `attribution`: `direct_asset` (the file's breakdown dimension is an asset),
`direct_joint` (a joint file), or `direct_segment` (a single-dimension breakdown). Separate demographic
and copy margins never produce a joint row — a joint exists only when a file carried it. Duplicates and
overlaps are detected by grain, account, Ad IDs, period, attribution setting, source fingerprint
(`content_md5`, rejected at staging), row identity and import order; only provably disjoint partitions
are summed, otherwise the later import supersedes and the overlap is recorded (§8).

### Thresholds (amended §12)

There is no universal cut-off. Every variable row exposes its components — spend, result volume,
contributing ads, coverage, direct versus contextual share, evidence state — and the UI ranks only on
rows whose components support it. The one composite retained is the existing volume tier
(`volumeConfidence`: high ≥ 500 spend and ≥ 30 results; medium ≥ 100 and ≥ 5; low > 0 and ≥ 1), kept
because the creative-components surface already uses and tests it; it is documented here, tested, and
never the only thing shown.

## 13. Residual and missing-data handling

- Residuals live only in the ledger (§8). The UI shows "Unattributed by this breakdown" as its own
  bar or row, never as a segment.
- A missing control source → `unreconciled` rows and one warning naming the export field to add.
- A missing metric column → the metric is `unavailable` for that class; no zero is fabricated.
- A missing Ad ID → §6.
- Unknown segments (`unknown` gender/age) are real Meta rows and stay as such; they never absorb a
  residual.

## 14. Creative, cell and ad joins

Ad ID is preserved through the demographic, placement and asset pipelines. Creative surfaces resolve
in this order:

1. **Mapped Ad IDs** — creative import → `ad_names` (+ `meta_ad_ids` when the editor set them) →
   `ad_instances` → the ad identities; the seed exposes `ads[].meta_ad_ids` (all instances of the
   name) so the client can do this without a round trip.
2. **Cell codes** — `ads.cell` (regex on the name) and deconstruction-assigned cells, as before.

The Funnel tab is built from the ad-level truth rows of those Ad IDs (Ad Summary when present,
otherwise the pivots' merged daily rows), joined by Ad ID first and cell second, with its evidence
state shown. Name-based counts that survive are labelled "ad names".

## 15. UI behaviour and disclosure

Watermelon mechanics are taken as interaction models over Metrix tokens (reface register §4 rule).
Existing components are used; one substitution is recorded.

| Surface | Mechanic | Component | Behaviour |
|---|---|---|---|
| Creative dialog → Demographics | heat grid + drill | `HeatMatrix` + inline-table-control pattern (`RevealPanel`) | age × gender grid for the creative's mapped Ad IDs; `EvidenceChip`; `CoverageStrip` (`ProgressMeter`, `role="meter"`); tapping a segment opens the detail row, siblings dim to 0.4 |
| Creative dialog → Placements | split accordion | `DisclosureStack` | platform → placement → device, bars per level, "Unattributed" as its own row when the ledger has a residual |
| Creative dialog → Funnel | — | `FunnelStepsChart` | joined through mapped Ad IDs first, cell second; evidence chip |
| Creative dialog → Evidence | layered disclosure | `DisclosureStack` + `DetailReveal` | creative → configured assets → deconstructed variables → segment performance; `direct_asset` vs `ad_context` badges |
| Command Center → Reconciliation | reveal | `RevealPanel` + `ProgressMeter` | per-ad truth, observed, coverage meter, unattributed; metric selector; `unreconciled` rows say which field is missing |
| Audience | collapse-to-trigger | `FilterDisclosure` (required `activeSummary`) | segment filters + a Coverage tile per metric |
| Explanations | popover | `DetailReveal` | evidence state, coverage, contextual attribution, non-additive notes; never inside a `<button>` card |

**Empty states (amended).** "No demographic data for this cell" is replaced wherever partial or
account-level evidence exists: the tab shows what evidence there is (the creative's ad-grain rows, or
the account-level rows), its coverage, and which export would raise it (an Ad Summary with `Ad ID`; a
demographic export without a `Text` breakdown; a demographic × Text export for the joint).

**Creative overview tile (owner spec "Creative Overview Tiles", 2026-09-02).** The Overview tab's
hand-rolled four-tile grid moves onto the platform's `KpiTileRow`; the blended-results tile receives the
creative's per-result-event rows (the array, not the pre-reduced primary row) so the split behind
"selected events" is shown as a `SharePieChart` inside `MetricHoverPopover` — the existing hover/touch
wrapper — and never lost one layer up.

**Substitution recorded:** the brief names "the existing progress mechanic as a static coverage
meter". `RunProgress` is a run-phase widget (`phase: RunPhase`); the static meter is `ProgressMeter`
(the same visual family, `role="meter"`), which is the honest element for a value that is not a run.

Disclosure rulebook: first layer is chrome (labels, chips, meters); every sentence lives behind
`DetailReveal`; payload (the segment figures) stays legible. `check:interaction`,
`check:disclosure-rulebook`, `check:payload-legibility`, `check:locator-ambiguity` and
`check:cohort-reach` gate it.

## 16. Backward compatibility and migrations

All schema changes are additive and idempotent in `scripts/src/metrix-supabase/schema.sql`
(`create table if not exists`, `add column if not exists`; new tables appended to the importer RLS
block). No existing table changes shape. Existing consumers keep reading `demographic_signal`
(ACCOUNT rows), `placement_signal`, `demographic_performance`, `placement_performance`,
`ad_performance`, `variable_performance`, `concept_performance` unchanged.

New: `ad_breakdown_performance`, `reconciliation_ledger`, `creative_assets`, `variable_evidence`,
`variable_segment_performance`; new columns `manual_imports.report_grain jsonb`,
`manual_imports.header_conflicts jsonb`, `manual_analysis_runs.reconciliation_summary jsonb`.

The live project receives the DDL through `import:metrix`'s schema step or a targeted apply; the
importer's RLS loop covers the five tables (they are added to the array).

## 17. Tests and acceptance criteria

Synthetic fixtures (`artifacts/api-server/src/lib/__tests__/fixtures/reconciliationFixtures.ts`)
are generated deterministically — no client CSV is committed — and reproduce the validated
structures and totals:

- partial `Day × Ad ID × Age × Gender × Text` file: 5,997 rows, 34 Ad IDs, spend 2,645.74 vs a
  totals row of 4,405.61 (60.05%, residual 1,759.87), impressions 103,687 / 320,430 (32.36%),
  link clicks 771 / 1,350 (57.11%), purchases 14 / 18 (77.78%), 10 ads absent worth 483.14;
- reconciled `Ad ID × Age × Gender` file: 643 rows, 44 Ad IDs (19 names), zero duplicate keys,
  4,405.61, 100% on every additive metric;
- Ad Summary with and without Ad ID; primary text with multiple headlines; headline reused across
  primary texts; identical copy strings as separate instances; dynamic ads with several text assets;
  Text breakdown mapped to the configured body asset; headline/description without delivery data;
  duplicate headers identical and conflicting; reused ad names; missing Ad IDs; under-coverage;
  overcounting; account/currency/period mismatch; overlapping imports; mixed result types;
  non-additive reach; complete and partial joint reports.

Acceptance (each is a test):

1. The partial fixture reports 2,645.74 observed against 4,405.61 truth, 60.05% coverage,
   1,759.87 residual — and the other three metrics at their own coverage.
2. The reconciled fixture reports 643 unique keys, 44 Ad IDs and 100% on every additive metric.
3. Ad-name collisions cannot silently join (`unjoinable`, warning names the field).
4. Duplicate headers cannot silently overwrite values (note when identical; conflict when not).
5. Residuals never enter `Unknown` buckets; segment sums equal observed, never truth.
6. Rates are recomputed from sums.
7. Asset performance is not assigned to unrelated configured copy fields.
8. One creative mapped to several variables does not duplicate metrics.
9. Existing run outputs are unchanged (existing engine tests pass untouched).
10. A creative with mapped Ad IDs retrieves demographic, placement and funnel evidence with no cell.
11. Evidence state and coverage are visible on every new surface (component tests + e2e).
12. Typecheck, gates, unit and integration tests, production build pass; the dialog is
    screenshot-verified at 390, 768 and 1440 px.

### 17a. Acceptance added at the amendment

17. The $100 / $40 / $50 / $10 copy fixture reconciles exactly (observed 90, residual 10, coverage 90%),
    with no scaling, no Unknown bucket, and one fact behind every variable the creative maps to.
18. A text row carrying constant headline and description columns attributes nothing to those fields.
19. Fields that vary together attribute direct performance to the copy signature, never to one field.
20. Separate demographic and copy margins produce no joint row; a demographic × copy file does, as
    `direct_joint`.
21. Balancing cannot overwrite direct cells (balanceMatrix tests).
22. Attribution-setting and result-definition mismatches are `incompatible`; native currencies stay apart.
23. A headline changed mid-period under one Ad ID is two asset instances with two periods.
24. Multiple truth candidates: precedence recorded, conflict surfaced, never averaged.

## 18. Rollout, logging and observability

- Runs log one line per ledger scope: `[Reconciliation] spend: account 60.1% (truth ad_summary),
  ads reconciled 0/44 (Ad ID missing from Ad Summary)`.
- `manual_analysis_runs.reconciliation_summary` stores the per-metric account coverage and the count
  of ads per evidence state, so History can show it without reading the ledger.
- The staging response reports the detected grain and any header conflict.
- No credential or file content is logged.

## 19. Modelled-interaction extension points (phase 2 contract)

`lib/reconciliation/balance.ts` ships `balanceMatrix(input)` — deterministic iterative proportional
fitting over a partially observed matrix:

```
input : { rows: string[], cols: string[],
          direct: Map<cellKey, number>,        // preserved exactly
          rowMargins: Map<row, number>,        // trusted, compatible
          colMargins: Map<col, number>,
          structuralZeros: Set<cellKey>,       // impossible combinations
          maxIterations, tolerance }
output: { cells: Map<cellKey, {value, direct: boolean}>,
          convergenceError, iterations, converged }
```

Contract for the phase that wires it: direct observations are never altered; both margins must be
`observed_reconciled` or `observed_partial` with the residual explicitly supplied as its own column
or row; structural zeros stay zero; every emitted cell is `evidence_state = 'modelled'` with
`direct_share`/`modelled_share` split on the ledger row; convergence error is stored; the UI shows
modelled cells hatched and labelled. The schema already carries `modelled_share` and the `modelled`
state so this needs no migration.

**Deferred, and why (amended).** The repository has no validated statistical infrastructure for a
hierarchical response model, and an unvalidated model would be exactly the fabricated precision this
spec forbids. Nothing in this PR emits a modelled value; no proportional allocation stands in for one.
The follow-up plan:

1. **Allocation tier** — wire `balanceMatrix` to emit `demographic_asset` cells where both margins are
   `observed_reconciled` / `observed_partial` with the residual supplied as its own row and column,
   every emitted cell `evidence_state = "modelled"`, `modelled_share` on the ledger, model name and
   version plus convergence error stored in a `model_runs` table; the UI hatches modelled cells.
2. **Response tier** — a partial-pooling model on actual denominators,
   `logit(p) = ad baseline + demographic + copy variable + demographic × copy + placement/device +
   account/market`, fitted offline first against the validated accounts, with posterior intervals
   surfaced as uncertainty rather than a single index; allocation (where delivery went) and response
   (how the audience reacted) stay separate tables, and causality is claimed only from controlled
   comparisons (MST cells).
3. **Overlapping features** — independent effects for co-occurring variables (hook, pain, benefit,
   CTA, format) only through the response tier; until then the library shows supporting spend,
   outcomes, unique ads and signatures per variable and never totals across feature categories.

## 20. Reconciliation against the documented algorithms (triple validation)

Every formula and threshold the layer applies was checked against its canonical source, then
implemented literally, then tested. The three validations are: (1) the unit and acceptance suites
over the synthetic fixtures; (2) this table, which names the canonical source for each rule and
the code that implements it; (3) the live cross-check after the run on the validated account
(`scripts/src/check-reconciliation-ledger.ts`, read-only), which re-derives the ledger's account
rows from the raw tables and fails on any disagreement.

| Rule | Canonical source | Implementation | Verdict |
|---|---|---|---|
| Confidence bands: high > 100 conversions or > $1,000; medium 10–100 or $100–1,000; validation_required < 10 or < $100 but promising; insufficient below the floor (< $50 spend or < 10 impressions) | `docs/prompts/IAP_DATA_BUNDLE_PREP_v2.0.md` "confidence_level" (lines 244–256, 189); blueprint §8.3 | `reconciliation.ts` `confidenceLevel` — the numeric bands literally. One interpretive choice, stated so it is not mistaken for a documented rule: the source's "promising" qualifier on `validation_required` is read as *at least one conversion*, so a row under the floor with zero conversions is `insufficient` and one under the floor with a conversion is `validation_required`; "consistent pattern" and "directional" are not evaluated | **implemented; one reading recorded** |
| "Conversions" = the terminal-stage result of the derived objective | `IAP_DATA_BUNDLE_PREP_v2.0.md` line 264; owner decision 2026-09-01 (`check:cohort-reach`) | `results` per row / per ad; cost per result = spend ÷ results; ROAS never used | implemented |
| Rates from raw counts, never from a pre-divided column | `iapCsvSpec.ts` `DERIVED_OR_IRRELEVANT_METRICS` rationale; `analysisEngine.ts` `derivedRates` | `rateOf`, `RATE_METRIC_SLUGS` excluded from sums and from the totals cross-check | implemented |
| Creative identity: naming convention primary, `ad_id` fallback secondary, unresolved → INSUFFICIENT | blueprint §7.2 `resolveCreativeIdentity` | Unchanged for cells (`ads.cell` from the name). For *reconciliation* the anchor is Account ID + Ad ID (§6/§6a) because ad names are proven non-unique (44 : 19); the two are complementary, not in conflict — cells classify, Ad IDs reconcile | implemented; noted |
| Evidence grade: full ≥ 80% · partial · none; `confidence_score = VOLUME_SCORE × (0.7 + 0.3 × coverage)` | `creativeComponents.ts` (`evidenceGrade`, `confidenceScore`), register §10 | Left as is on `concept_performance`; the new layer carries coverage numerically per metric instead of a grade | unchanged |
| **Shipped concept volume tier** (high ≥ $500 and ≥ 30 results; medium ≥ $100 and ≥ 5; low; validation_required) | `creativeComponents.ts` `volumeConfidence` (used by `concept_performance.confidence_level`) | **Deviates from the canonical bands above** (a $600 / 31-result concept is "high" there and "medium" canonically). Not changed in this PR: it feeds shipped surfaces and tests. Recorded as register §14 `[decision]` for the owner: migrate `concept_performance.confidence_level` to the canonical bands, or amend the blueprint | **discrepancy recorded** |
| Reach/frequency non-additive | Meta reporting semantics; `metricsCatalog.ts` `accountLevelDeliveryTotal` caveat | `NON_ADDITIVE_METRIC_SLUGS`; reach kept only at exact grain | implemented |
| Objective is a lens, never a wall; cost per result, never ROAS by default | register §6a/§6b, `check:cohort-reach` | no ROAS anywhere in the layer; result types kept apart | implemented |
| Interaction index with shrinkage | owner brief 2026-09-02 (`expected = segment × asset ÷ overall`), standard empirical-Bayes shrinkage | `interactionIndex` (prior weight m = 1,000 impressions) — documented as a supported association, never causal | implemented |
| Copy signature: direct evidence to the delivered combination when fields vary together | owner amendment 2026-09-02 §4 | `classifyAssetColumns` roles + `copy_signature` observations | implemented |
| Client segment signal: `high | ok | low` on the segment's own volume; coverage carried beside it, never a gate | Owner direction 2026-09-02 ("the signal is the product"); bands as above | `segment-analytics.ts` `confidenceBand` (mirror of `confidenceLevel`) + `assessSegmentSignal`; `SignalTag`/`CoverageTag` | implemented |
| Modelled tier: IPF respecting margins, direct cells, structural zeros | owner amendment §9 | `balanceMatrix` interface + tests; nothing emitted (§19) | deferred by design |

