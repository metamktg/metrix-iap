# METRIX IAP — Bug Tracker (Phase 1 stabilization)

Running log per `METRIX_Phase1_Bug_Triage_and_Audit_Prompt.md` §B3. One entry per issue:
symptom, root cause, category (**Fix-Now** / **Phase 2 Polish** / **Won't Fix**), resolution,
PR reference, verification evidence. Won't Fix entries state reasoning so the same report
isn't re-investigated next session.

Verification evidence below references the real AAFE files (account `manual_9JGXU_AQJjxJ`,
"Fresh Import 1786839868960" — the account the AAFE data actually lives in):
`IAP-PLACEMENTS-NEW-AA.xlsx` (22,015 rows, ISO dates), `AAFE DEMO IAP … IAP-DEMO-NEW-AA.xlsx`
(500 rows, Sheets round-trip), `AAFE DEMO IAP … IAP-DEMO-NEW-AA.csv` (clean re-export, 500 rows,
M/D/YYYY dates), `AAFE---New-Owned-Ads-Jul-1-2026-Aug-19-2026.csv` (866 rows, per-ad aggregate).
All four were pulled from `manual_imports` (md5-verified) and replayed through the production
parser/merge code.

---

## B0 — `ad_performance` unique-constraint violation blocks all re-ingestion

- **Symptom:** `Analysis failed: duplicate key value violates unique constraint
  "ad_performance_account_id_ad_name_campaign_name_result_type_key"` on re-running analysis
  after re-staging the corrected Demographics CSV (runs `0611cdd4…` and `867dfb5c…`,
  2026-08-24 10:10/10:11 UTC). Additionally — unnoticed until this investigation — the failed
  runs **destroyed the prior successful run's rows for Jul 1–Aug 9** (4,495 rows → 840
  surviving rows, $64.1K → $7.7K displayed), because the window-delete committed before the
  insert crashed.
- **Root cause:** the parser accepted any `Day` string verbatim (`toIsoDate` existed but was
  never called). The clean re-export carried `M/D/YYYY` dates ("7/1/2026") while the placement
  XLSX carried ISO. Three simultaneous corruptions followed: (1) the same real-world day
  existed under two bucket keys, so demo- and placement-derived rows for one day became two
  insert rows that Postgres's *date-typed* unique key collapsed into a collision (94 intra-batch
  duplicates reproduced); (2) lexicographic min/max over mixed formats computed the run window
  as `[2026-07-01, "8/9/2026"→2026-08-09]` instead of `…-08-17`, so (3) the window-delete both
  missed the rows the insert then collided with *and* destroyed Jul 1–Aug 9 rows from the prior
  run. **Answer to the B0.2 constraint-design question:** the 6-column constraint
  `(account_id, ad_name, campaign_name, result_type, date_start, date_end)` is correctly
  specified for per-day rows and multi-file-per-slot (different weeks → different dates;
  same-day re-import *should* supersede). The live DB constraint matches `schema.sql` — the
  reported 4-column-looking name is just Postgres's 63-char identifier truncation. The defect
  was unnormalized date ingestion, not the key and not (per se) missing conflict handling.
- **Category:** Fix-Now (blocking).
- **Resolution:** (a) `normalizeDayValues()` in `iapCsvParser.ts` — every `Day` normalized to
  ISO at parse time; per-file M/D-vs-D/M disambiguation from component evidence (>12); genuinely
  ambiguous or serial-number/unknown formats hard-422 with the remedy named, never guessed.
  (b) `buildAdPerformanceRows()` guards reject non-ISO dates and duplicate unique-key tuples
  BEFORE any destructive delete runs. (c) Deletes restructured to per-table
  delete-adjacent-to-insert with `count: "exact"`, surfaced as a
  `[Re-run] Replaced N previously ingested row(s)…` run warning (supersede is never silent).
  (d) CSV-path scientific-notation ID guard (see BUG-06). Documented in `replit.md`
  Architecture decisions.
- **Verification evidence:** reproduction probe over the real staged AAFE files: pre-fix, the
  failing file combo produces 94 duplicate constraint tuples and window `2026-07-01…2026-08-09`;
  post-fix, 0 duplicates, window `2026-07-01…2026-08-17`, 3,962 rows summing $42,290.67
  (= the placement export's true spend). Unit: `iapCsvDayNormalization.test.ts` (10 cases),
  `analysisEngineAdRowGuards.test.ts` (4 cases) — both wired into CI (which runs no other
  api-server tests). Integration idempotency test
  `manualAnalysisRerunIdempotency.test.ts` (live dev Supabase; runs in the Replit
  `api-server` vitest workflow): ISO run → M/D/YYYY re-stage re-run → success, identical rows,
  run-2 ownership, both honesty warnings present.
- **PR:** (this session's stabilization PR).

## BUG-02 — Segment spend totals "wrong platform-wide" ($334/$333/$161/… vs $64K)

- **Symptom:** Audience segment cards show spends of $334, $333, $161, $14, $8, $3 (≈$857
  total across 13 segments) against a displayed account total of $64,097.50.
- **Root cause:** **not a rollup or join bug, and not ID-blanking** (the §0 working hypothesis
  is dead — see below). Replaying the demographic export sums to **exactly** those numbers:
  female 45-54 $334.18, female 35-44 $332.52, female 55-64 $160.94, female 25-34 $14.35,
  female 65+ $7.53, male 45-54 $3.17 … total $856.52. That is all the demographically-attributed
  spend Meta put in the export — it covers only 11 distinct ads and 23,248 impressions (the
  placement export has 399 ads / 1.31M impressions). The segment cards render honest arithmetic
  over a ~1.3%-of-spend slice with zero indication of that coverage. Additionally the $64,097.50
  denominator itself is inflated (see BUG-05); the real Meta account total for the period is
  $45,467.69.
- **Hypothesis verification (work-order §0):** the "blanked IDs → joins starve" theory is
  disproven: demo/ad joins key on **ad name + campaign name + day**, never `Ad ID`; ad names
  are intact in both files; demo→placement ad-name join rate is 11/11 = 100%. The parser's
  ID-blanking stays as-is (correct, per work order).
- **Category:** Fix-Now, as the §1 class fix (coverage computation + propagation + badge
  suppression), not as a per-card patch.
- **Resolution (implemented):** join coverage computed per report class at analysis time
  (`computeDataCoverage`), persisted on the run (`manual_analysis_runs.coverage` jsonb),
  served via `AnalysisSummaryResult.data_coverage`, and enforced client-side:
  `assessSegmentSignal` gains an `insufficient_coverage` state that suppresses Signal/Low
  Signal classification whenever demographic joined-spend coverage < 90%
  (`COVERAGE_THRESHOLD_PCT`, one shared definition); `DataCoverageBanner` renders the
  server-computed cause+remedy note on Audience and Avatars. Measured on the real files:
  demographic = $856.52, 2% of the $42,290.67 daily-attributable baseline, 11 of 399 ads.
- **Verification evidence:** probe over `demo-old.xlsx`/`demo-new.csv` (identical metric
  content): per-segment sums equal the UI's numbers to the cent.

## BUG-03 — Creative popup (C8A) empty across all tabs

- **Symptom:** "No performance data", "No demographic data for this cell", "No placement data
  for this account" on creative C8A's popup tabs.
- **Root cause (confirmed):** two independent causes. (1) **Wiring bug:** the
  Creative → Library view (`CreativeLibraryView.tsx`) rendered `CreativeExpandDialog` with
  NO `demographic`/`placements`/`perfRow` props at all — every tab fell back to its `[]`
  default, so all tabs were empty by construction regardless of account data (the account
  actually has 20 `placement_signal` rows). C1A–C9A cells only exist in this view (from
  creative deconstruction), so this is exactly where the owner opened C8A. (2) **Honest
  emptiness with misleading copy:** per-cell demographic rows genuinely don't exist for this
  account (manual demographic signal is account-grain, `cell_id='ACCOUNT'`), and
  `library_cell_performance` is genuinely empty (all 629 `ads.cell` are NULL — ad names carry
  no cell codes and the creative→ad fuzzy mapping is broken, see BUG-10) — but the empty
  states said "import a demographic pivot export" when one WAS imported.
- **Category:** Fix-Now (wiring) + Fix-Now empty-state differentiation (§1.4).
- **Resolution (implemented):** CreativeLibraryView now passes the same account-level
  placements, per-cell demographic rows, and per-cell perf row IapLibraryView's cards get;
  all three tabs accept cause-specific `emptyReason` props computed by
  `creative-empty-reasons.ts` (never-imported vs account-level-grain vs
  no-rows-joined-for-this-cell — each with its own remedy). Unit-tested in
  `coverage-honesty.test.ts`.

## BUG-04 — Demo-vs-placement disparity flag: generic message

- **Symptom:** discrepancy trigger fires on AAFE after import.
- **Root cause:** trigger fires **correctly** — demographic coverage genuinely is ~1% of
  placement coverage in this account's exports. The defect is the message: it names no cause
  and no remedy.
- **Category:** Fix-Now (messaging only, per work-order §1.5 — do not change firing).
- **Resolution (implemented):** the coverage layer IS the cause-naming message: the run now
  emits `[Coverage] Demographic rows carry $856.52 of spend (2% of the $42,290.67
  daily-attributable total) across 11 of 399 ads… Remedy: re-export Demographics from Meta
  Ads Reporting as CSV, covering all ads for the full window.` — surfaced in run warnings,
  the Audience/Avatars banner, and the suppressed-badge tooltip. Firing behaviour unchanged.

## BUG-05 — Ad-summary aggregate export misdated as a single day → account totals inflated ~41%

- **Symptom:** displayed AAFE account total $64,097.50; Meta's own total for the period is
  $45,467.69 (ad-summary export), daily-attributable placement spend $42,290.67.
- **Root cause:** the owner's ad-summary export is a per-ad **aggregate** report (no daily
  breakdown; 866 rows, 629 distinct ads). Its "Reporting starts" column — the report window
  start, identical on every row — silently alias-matched to canonical `Day`
  (`COLUMN_ALIASES["reporting starts"]`), making the whole file look like a single-day export
  dated 2026-07-01. `mergeAdPerformanceBuckets` then inserted ads absent from that day's
  placement rows as "summary-only" Jul-1 daily rows carrying **full-period** per-ad spend
  (≈$21.8K), double-counting every ad that also has placement dailies later in the window.
  The alias itself is legitimate (Meta daily exports do label the day column "Reporting
  starts"); the defect is accepting a file whose "days" are all identical while companion
  files span weeks, i.e. failing to detect the aggregate-report shape.
- **Category:** Fix-Now (data integrity: silently fabricated daily spend).
- **Resolution (implemented):** `detectAggregateAdSummary()` — a summary whose rows all
  carry one distinct `Day` while companion files span multiple days is treated as
  window-scoped: creative metadata and total-spend cross-checking only
  (`mergeAdPerformanceBuckets` `summaryMetadataOnly` mode), excluded from daily buckets and
  summary-only daily insertion, with two warnings (aggregate-shape + Meta-total vs
  daily-attributable gap: $45,467.69 vs $42,290.67). Verified against the real files: total
  drops from the fabricated $64,097.50 to the honest $42,290.67. Unit-tested in
  `analysisEngineCoverage.test.ts`.
- **Verification evidence:** probe totals above; header of the real file shows
  `"Reporting starts","Reporting ends",…` with no `Day` column and one distinct value.

## BUG-06 — CSV path stores corrupted (scientific-notation) Meta IDs verbatim

- **Symptom:** `demo-new.csv` contains 2,155 cells like `1.20253E+17` in `Ad ID`; the XLSX
  path blanks such values with a warning, the CSV path stored them as-is.
- **Root cause:** the ID-corruption guard lived only in `xlsxToCsv.ts` (numeric-cell
  detection); a Sheets **CSV** export of the same corrupted sheet bypasses it.
- **Category:** Fix-Now (latent false-join risk; honesty invariant).
- **Resolution:** shipped with B0 — parser-level scientific-notation guard blanks the cell and
  emits one summary warning per column, mirroring the XLSX wording. Exact-digit ID strings are
  preserved.
- **Verification evidence:** `iapCsvDayNormalization.test.ts` ("blanks scientific-notation Ad
  IDs…"); probe shows the real file's corrupted cells detected.

## BUG-07 — AAFE account left with partially destroyed rollups (operational damage)

- **Symptom:** account `manual_9JGXU_AQJjxJ` currently holds only 840 `ad_performance` rows
  (Aug 10–17, $7.7K) — the Jul 1–Aug 9 remainder of the successful Aug 23 run was deleted by
  the failed re-runs' corrupted window-delete (see B0). Companion rollup tables lost the same
  window.
- **Root cause:** B0's mechanism (2).
- **Category:** Fix-Now (operational remediation, no code).
- **Resolution:** after the B0 fix deploys, re-stage the demo + placement (+ corrected
  ad-summary, ideally daily) files and run analysis over "all". The idempotent rebuild
  reconstructs the full window; the run warning will report replaced rows. No manual SQL needed.
- **Verification evidence:** DB queries against live Supabase (row counts / date spans per
  `manual_analysis_run_id`); post-fix probe reproduces the full 48-day window cleanly.

## BUG-08 — Re-running analysis requires re-uploading files that were already uploaded

- **Symptom:** after a successful run, staged files flip to `processed`; pressing "Run
  analysis" again without re-staging fails with "Both reports are required…". This is what
  forced the byte-identical re-upload of `IAP-PLACEMENTS-NEW-AA.xlsx` on Aug 24 (md5-verified
  duplicate of the Aug 23 upload).
- **Root cause:** by design — each run consumes exactly the currently-staged batch
  (`status="staged"` filter; see `manualAnalysisReuploadIsolation.test.ts` for why reading
  processed files back would double-count), and the Import History panel offers restage.
- **Category:** Phase 2 Polish (UX). The design is sound; the failure mode is discoverability —
  the error message doesn't mention that previously processed files can be re-staged from
  Import History.
- **Resolution:** Phase 2 — mention restage in the error/UI copy. Not changed this session.

## BUG-09 — `manual_imports` re-upload dedup gap (F-08)

- **Symptom:** the same file staged twice (identical bytes) is accepted as two rows; two
  staged demo files covering the same window double their spend in the merge (accumulate sums
  both).
- **Root cause:** no content-hash dedup at staging; multi-file-per-slot is legitimate for
  disjoint windows, so file-level rejection is wrong, but same-bytes duplicates are always an
  error.
- **Category:** Fix-Now for the same-bytes case (silent double-count risk); the
  overlapping-window (different bytes) case needs product semantics and stays open in the
  audit doc.
- **Resolution (implemented):** `manual_imports.content_md5` (hex md5, stored at staging;
  schema add applied live); staging a byte-identical file while a same-kind copy is still
  `status='staged'` returns 409 naming the already-staged file and the double-count
  consequence. Different-bytes files per slot and re-staging processed files stay legal.
  Integration-tested in `manualAnalysisRerunIdempotency.test.ts`.

## BUG-10 — Fuzzy creative→ad matching maps seven different creatives to an ad named "1"

- **Symptom:** 7 of the 12 staged AAFE creative assets (all the C-cell-coded files, e.g.
  `C1A_CN_ICP_CareerTransition_…_001_Meta_Feed_4x5_1080x1350.png`) have
  `ad_names: ["1"]` with `match_method: "fuzzy"` — the account really does contain an ad
  literally named "1" (8 `ad_performance` rows), and one creative's asset URL got linked onto
  that `ads` row. Seven different creatives claiming the same ad, chosen from numeric-token
  noise ("001", "1080x1350"), is a false-positive mapping that would attribute ad "1"'s
  performance to arbitrary creatives.
- **Root cause:** the filename→ad-name fuzzy matcher accepts matches with no minimum signal —
  a bare-numeric ad name can win on incidental digit tokens.
- **Category:** Fix-Now (false joins violate the honesty invariant; the ad_names mapping is
  user-correctable but defaults must be honest).
- **Resolution (implemented):** `MIN_CONTAINMENT_LENGTH = 5` in `adNameMatch.ts` — the
  substring-containment fast path (score ≥ 0.75) now requires the contained side to be at
  least 5 normalized characters; shorter candidates fall through to bigram/token scores,
  which rate incidental digit overlap near zero, so the file stays unmapped (visible and
  user-correctable). Legit short names can still surface as a flagged "guess" via token
  overlap, never as a confident match. Regression tests in `adNameMatch.test.ts` use the
  real C1A… filename against an ad named "1".
- **Verification evidence:** live `manual_imports.ad_names` rows for account
  `manual_9JGXU_AQJjxJ` + `ads`/`ad_performance` rows for ad name "1".

## BUG-11 — Null-coalescing renders fabricated measurements ("$0"/"0.00%" for unknown)

- **Symptom:** unknown values render as measured figures: audience group KPI rows showed
  "$0" spend beside "—" results; IAP Library cell chips showed a measured "0" for unknown
  results; the metric hover chart plotted never-delivered concepts as real "0.00%" CTR
  worst-performers (`link_ctr` alone among its sibling ratios returned 0 instead of null on
  zero impressions).
- **Root cause:** `?? 0` coalescing at render/aggregation sites contradicting the
  `sumStrict`/"null unless every row carries it" policy; one ratio helper diverging from its
  siblings' null-on-zero-denominator convention.
- **Category:** Fix-Now for the three render-side fabrications (shipped); the aggregation-
  policy split (`metricsCatalog` any-row-present sums vs `sumStrict`, `date-scope.sumInRange`
  always-number signature, `summaryTrends`/`reportExport` partial sums) is **Open — one
  policy decision needed**, mapped in `docs/resources/METRIX_Data_Consistency_Audit_Phase1.md` §5.3.
- **Resolution:** shipped: `metricConceptUtils.link_ctr` → null on zero impressions;
  `AudienceView` group spend → "—" when unknown; `IapLibraryView` results → "—" when unknown.
- **Verification evidence:** lib + metric popover + audience test suites green (341 tests).

## BUG-12 — Fabricated "Only 0 impressions" low-signal warnings under date presets

- **Symptom:** with any date preset active, every audience segment flagged low-signal with
  "Only 0 impressions — below the 1,000 needed…".
- **Root cause:** `demographic_performance` stores no impressions; the preset-window API
  adapter zero-fills `Impressions: 0`; `assessSegmentSignal`'s impressions heuristic read
  the zero-fill as a measurement.
- **Category:** Fix-Now (fabricated warning).
- **Resolution (shipped):** the impressions heuristic applies only when the scoped source
  carries impressions at all (`scopedTotals.impressions > 0`); spend-share and coverage
  heuristics still apply.
- **Verification evidence:** `coverage-honesty.test.ts` + lib suites green.

## BUG-13 — Concept-group CTR taken from an arbitrary row

- **Symptom:** `ConceptFamilyView` cell stats presented `rows[0]?.CTR_link_pct` — one
  event-row's rate — as the group CTR.
- **Root cause:** missing blended derivation.
- **Category:** Fix-Now (wrong number presented as a group metric).
- **Resolution (shipped):** blended CTR from summed link clicks ÷ summed impressions; null
  when impressions are absent.

## BUG-14 — AnalysisHistoryView "Data integrity" block is permanently-empty dead UI

- **Symptom:** the per-run reconciliation block renders from `run.reconciliation[]`, a field
  no server code ever writes (`import_metric_reconciliation` has zero writers; `runShape`
  omits it).
- **Category:** Fix-Now-next (a dead "integrity" surface implies checks that don't run).
- **Resolution:** next session — remove the block + orphan contract field, or implement the
  writer. Not changed in this PR (needs a product call on which).

## BUG-15 — Alerts page lineage mismatch

- **Symptom:** `ListenCommandCenter` documents Alerts as sourced from `iap.data_quality[]`;
  `AlertsView` actually renders `data_caveat` — importer quality flags (incl.
  `cross_export_mismatch`) never reach the Alerts page.
- **Category:** Open (surfacing gap; flags do render in AdPerformanceView SignalCards).
- **Resolution:** next session, with the csv_warnings surfacing work (see audit doc §5.1).

## BUG-16 — Manual-engine Stage-2 concept intelligence lands nowhere

- **Symptom:** `buying_intent_score` / `performance_lift_vs_baseline` / `performance_tier` /
  `confidence_level` are computed, persisted on `concept_performance`, and shipped on
  `analysis.concept_rollup` — but the client type omits all four and `FindingsView` reads the
  importer-only `concept_intelligence` table.
- **Category:** Fix-Now-next (computed intelligence invisible for manual accounts).
- **Resolution (implemented):** `ConceptRollupRow` now declares the four Stage-2 fields
  (they always flowed through the loosely-typed seed payload); FindingsView falls back to
  `analysis.concept_rollup` Stage-2 fields when `concept_intelligence` (importer-only) has
  no rows — the manual engine's tier/lift/intent/confidence work now renders.

## BUG-17 — AnalysisOverview headline tiles bypass the canonical totals

- **Symptom:** scoped spend/impressions/CTR re-summed from `performance_by_cell`, bypassing
  the `account_totals` ceiling override AND the impossible-CTR guard; sums to 0 on manual
  accounts (cell perf is importer-only).
- **Category:** Fix-Now-next (canonical-source violation, §2a.4).
- **Resolution (implemented):** run-scoped headline tiles (and the Budget jump-off stat) now
  read the canonical daterange summary for the selected runs' union window (selected runs →
  recorded windows → ONE canonical query; overlapping windows can never double-count). The
  client cell re-sum survives only for legacy runs with no recorded window — the only case
  where no canonical source exists.

## BUG-18 — Two contradictory concept lift/tier definitions

- **Symptom:** engine persists CPA-lift vs blended baseline + tier; `AdPerformanceView`
  computes CVR-lift vs an unweighted mean of per-concept CVRs (an average-of-averages the
  codebase explicitly forbids elsewhere) and derives its own tiers.
- **Category:** Fix-Now-next (same number, two definitions).
- **Resolution (implemented):** `computeTierRows` prefers the engine's Stage-2
  `performance_lift_vs_baseline` (CPA lift vs the book's blended baseline — the same number
  FindingsView shows) whenever the rollup carries it, applied table-wide so definitions
  never mix in one column; the CVR-vs-unweighted-mean formula survives only for legacy
  rollups with no Stage-2 fields, and the column header names whichever definition is
  active ("CPA lift vs baseline" vs "Lift vs book avg").

## Shipped small honesty fixes from the audit (no separate entries)

- "Top variable —" dash now carries the computed `unavailableReason` as a tooltip instead of
  discarding it (`AvatarsView`).

## BUG-19 — Same-slot files with duplicate content double-count (format variants beat the md5 guard)

- **Symptom:** the first post-deploy AAFE re-run (2026-08-24 20:50 UTC, run `3fc473c6…`)
  measured demographic coverage at **$1,713.05 across 1,000 rows — exactly 2× the real file**
  ($856.52 / 500 rows): the re-staged demo `.xlsx` AND the still-staged demo `.csv` (same
  export, two formats) were both consumed, and multi-file-per-slot merging summed them.
  Every demographic surface (segment cards, heatmap, audience totals) showed doubled values.
- **Root cause:** multi-file-per-slot is additive by design (disjoint weekly exports); the
  BUG-09 staging guard only rejects byte-identical files. Nothing detected logically
  identical rows across format variants. This is the "overlapping-window (different bytes)"
  case left open under BUG-09.
- **Category:** Fix-Now (silent double-counting).
- **Resolution (implemented):** `appendRowsCrossFileDeduped` in `analysisEngine.ts` — at
  parse time, rows that are EXACT duplicates of rows from a previously parsed file in the
  same slot (identical breakdowns + identical metric values, key-order-independent
  signature) are dropped and announced: `[Duplicate data] N row(s) in "file" are exact
  duplicates… counted once, never twice`. Rows sharing a key but differing in metrics
  (campaign-split exports) stay additive; duplicates WITHIN one file are preserved (a
  source-data property this layer must not editorialize). Applied to all four slots.
- **Verification evidence:** real files: xlsx+csv demo pair → 500 rows dropped, spend
  restored to $856.52; unit tests in `iapCsvWarningSignal.test.ts`.
- **Remediation for the live account:** the 20:50 run's demographic rollups are doubled.
  After this fix deploys, re-stage placement (+ demo if desired) and re-run — the idempotent
  rebuild replaces the doubled rows; with the dedupe, even both demo files staged together
  now produce correct totals.

## BUG-20 — Staging warning panel buries real warnings under mapping noise

- **Symptom:** the AAFE demo CSV staging popup showed ~17 warnings: 12 were "auto-matched
  (via slug match)" notes for derived/ratio columns (CPM/CTR/CPC/ROAS family — values the
  server recomputes from primitives and never trusts), plus a spurious `"Amount spent _USD_"
  mapped with moderate confidence (67%) — please verify` hedge. The two warnings that
  mattered (ID corruption, date normalization) were at the bottom of the pile.
- **Root cause:** (a) per-column auto-match warnings fired for every non-exact match, with
  no distinction between deterministic normalizations (slug/case) and semantic guesses, nor
  between primitives and recomputed derived columns; (b) `slugifyColumn` STRIPS the
  `{ACCOUNT_CURRENCY}` placeholder, so the canonical slugs to `amount_spent` while the
  mangled header slugs to `amount_spent_usd` — the slug pass could never match it and it
  fell through to a 67% Jaccard inference.
- **Category:** Fix-Now (a warning channel that trains users to ignore it defeats the
  honesty invariant).
- **Resolution (implemented):** deterministic (slug/case-insensitive) matches and any match
  on a `DERIVED_OR_IRRELEVANT` column fold into ONE summary line naming an example mapping
  ("no action needed; full mapping in the column report"); semantic alias matches on
  primitives and moderate-confidence inference keep individual warnings; the currency
  branch gains a slug-tolerant pattern so `Amount spent _USD_` is a confident slug match.
  Real-file result: 17 warnings → 5 (1 folded mapping note + Day normalization + 3 ID
  warnings). Unit tests in `iapCsvWarningSignal.test.ts`.

## Chain continuation (this pass)

- Strategy evidence packs now carry `data_coverage` (the run's measured per-class coverage)
  with an explicit prompt rule: below-threshold classes are THIN evidence — claims grounded
  in them must be qualified with the measured percentage and capped at
  low/validation_required confidence. Prevents regenerated strategy from overtrusting the
  2%-coverage demographic slice the Aug 23 strategy was silently built on.
- Chain state verified against live data: all five required completeness surfaces populated
  post-rebuild; the Aug 23 strategy/briefs/deconstruct runs all succeeded but are stale
  relative to the corrected analysis — stale-stage detection will prompt regeneration.

## BUG-21 — Fuzzy column inference maps configuration columns onto ID/name canonicals

- **Symptom:** the AAFE ad-summary export ("AAFE---New-Owned-Ads-Jul-1-2026-Aug-19-2026.csv",
  staged 2026-08-24 21:53 UTC) carried `Ad set budget` / `Ad set budget type` (campaign
  configuration) but no ID or name columns. The Jaccard inference promoted `Ad set budget`
  → `Ad set ID` at 50% ("please verify") — currency amounts mapped where object IDs belong
  — and the unknown-column pass suggested `Ad set budget type` might be `Ad set name`.
- **Root cause:** token similarity is structurally misleading for configuration columns:
  `Ad set budget` shares its entity words (ad/set) with every `Ad set *` canonical, so it
  always clears the 0.5 inference threshold against whichever `Ad set` column is missing,
  despite naming a different concept entirely. No downstream contamination this time —
  verified live that the engine never reads the `Ad set ID` breakdown — but the same
  mechanism could promote `Campaign budget` → `Campaign name` (a bucket-key column) on a
  worse-shaped export.
- **Category:** Fix-Now (a "please verify" hedge on a mapping that is *never* correct is
  exactly the warning-channel erosion BUG-20 targets).
- **Resolution (implemented):** `CONFLICTING_CONCEPT_TOKENS` (budget/bid/schedule/delivery/
  objective/status/cap) veto both `inferColumnMapping` promotion and
  `suggestCanonicalForUnknown` suggestions when the token appears on the header side only.
  Such headers stay honestly unmapped. Tests in `iapCsvWarningSignal.test.ts`.

## BUG-22 — Completeness panel reports "0 rows" for every module after a failed run

- **Symptom:** "Analysis incomplete — 5 modules missing data" with 0 rows on every module
  (screenshot, AAFE) while the last successful run's 3,000+ rollup rows sat intact in the DB,
  and Strategy stayed locked on them.
- **Root cause:** `verifyAnalysisRunCompleteness` scoped every per-module count to the LATEST
  run by `started_at` — including a failed one, which has no outputs by definition (failed
  runs delete their own partial rows). The morning's two errored B0 re-runs made "latest"
  an error run, so every count keyed to its run id returned zero.
- **Category:** Fix-Now (context-awareness: a failure is already reported by run history;
  reporting it a second time as universal data loss is misinformation).
- **Resolution (implemented):** module counts scope to the latest SUCCESSFUL run; the
  absolute-latest run's status still rides along as `run_status` so a fresh failure stays
  visible; a run in flight keeps completeness false until it settles.

## BUG-23 — Large performance files can't upload at all (bare HTTP 413/500 at the proxy)

- **Symptom:** "IAP-PLACEMENTS-NEW-AA … (1).csv: Upload failed (HTTP 413)" with no server
  message — and earlier, the same bare-status shape as an HTTP 500. Files never reached the
  API (no manual_imports row, no JSON error body, which every application path attaches).
- **Root cause:** the deployment proxy caps single request bodies well below the app's own
  75 MB limit and rejects them before Express sees the request. Raising express limits
  cannot fix this, and the 75 MB single-request cap itself exists because base64+JSON+hex
  multiplication of one big payload OOM'd Node at 150-200 MB (see the memory note in
  metrix.ts).
- **Category:** Fix-Now (capacity requirement: 150 MB performance files).
- **Resolution (implemented):** chunked upload flow (init → PUT ~8 MB base64 chunks →
  complete) for performance report kinds, storing chunks as `manual_import_chunks` rows
  (bytea, PK (import_id, chunk_index), cascade delete) with `manual_imports.content` NULL
  and `status='uploading'` until complete. The complete step assembles, verifies announced
  size, runs the IDENTICAL validation + md5 duplicate guard as single-request staging, and
  flips to 'staged'. Readers (`loadImportContentBuffer`) fetch chunk-wise so no PostgREST
  payload ever carries a whole large file. Client auto-switches transports above 20 MB;
  performance dropzone limit is now 150 MB (creative assets keep the 75 MB inline path).
  Abandoned sessions sweep after 24h. 'uploading' rows are excluded from listings and can
  never be consumed by a run (runs read status='staged' only).

## BUG-24 — Multi-sheet workbook uploads fail on the wrong sheet

- **Symptom:** "AAFE DEMO IAP Untitled spreadsheet.xlsx: The following required columns
  could not be found: 'Day', 'Ad name'" — a whole Google Sheets workbook saved as .xlsx,
  where the active tab wasn't the export sheet.
- **Root cause:** `selectWorksheet` picked the active/first-visible tab blindly; the real
  export sheet elsewhere in the workbook was never considered.
- **Category:** Fix-Now (valid warning, avoidable failure).
- **Resolution (implemented):** when the target class is known, every sheet's header row is
  scored by how many of the class's required breakdown columns resolve through the normal
  alias/slug cascade; the best-scoring sheet wins, previous behavior on no match or ties.

## Context-aware validation pass (extends BUG-20)

- Curated ALIAS matches now fold into the single automatic-mapping summary line — "Reporting
  starts" IS Meta's native date header on ad-level summary exports; "rename it in your
  export" was advice the user cannot act on. Same for "Device platform" → "Impression
  device" on placement exports.
- Optional-column absences ("breakdown columns … treated as blank") are now "Note:"-prefixed
  informational notices.
- Client warning panel splits severities: action-needed lines stay on the first layer;
  "Note:"/"no action needed" lines collapse behind a count (progressive disclosure); a
  notices-only staging drops the alarm styling entirely.

## Reconciliation guard (prevention layer for BUG-19's class)

- `computeDataCoverage` now flags any breakdown class whose windowed spend EXCEEDS the
  daily-attributable baseline (>101%, aggregate-shape summaries exempt) with a loud
  "Reconciliation check failed … counted more than once" note that also lands in the run's
  csv_warnings. The BUG-19 double-ingestion registered exactly 200% here and was silent.

## BUG-23 hardening (live-test round, Aug 25)

- First live chunked upload of the 38 MB placement CSV failed twice: 8 MB chunk upserts hit
  "canceling statement due to statement timeout" (the `authenticator` role ships
  `statement_timeout=8s`, and `service_role` had no override so every PostgREST request the
  server makes inherited it), and one attempt surfaced a raw Cloudflare 520 HTML page
  verbatim in the staging popup (supabase-js passes the upstream body through as
  `error.message`; our 502 relayed it).
- Fixes: `alter role service_role set statement_timeout='120s'` (applied live + schema.sql —
  server-only role; anon keeps its 3s cap); chunks reduced to 4 MB with 3-attempt client
  retry (idempotent upserts make retry safe); `publicErrorMessage()` collapses HTML/oversized
  upstream bodies and statement timeouts to plain retryable messages in the upload routes
  (full error still logged); init sweeps a failed session for the same file immediately
  instead of waiting for the 24h sweep; the two orphaned `uploading` rows were deleted live.
