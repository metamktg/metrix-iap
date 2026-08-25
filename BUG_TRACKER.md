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

## BUG-25 — Production hangs on the splash screen once the creative library grows (seed drags all file bytes)

- **Symptom:** production stuck on the loading splash after the Aug 25 main sync + creative
  library upload session. API healthy (healthz 200, auth 401 fast) — only the seed hung.
- **Root cause:** `selectAll("manual_imports", …)` in seed assembly uses `select("*")`, so
  every seed build fetched the FULL bytea content of every creative asset. At ~8 assets
  that was slow-but-survivable; at the real library (125 assets ≈ 257 MB of bytea ≈ ~0.5 GB
  of hex JSON in a single 1000-row page) the request never completes and the seed cache
  never fills. Latent since the manual-imports feature shipped — the volume, not the code
  sync, pulled the trigger (the code sync landed the same night by coincidence). Stale PR
  #14 had aimed at exactly this and was dropped when selectAll lost its columns param.
- **Category:** Fix-Now (production down).
- **Resolution (implemented):** `selectAll` regains a `columns` parameter; the seed's
  manual_imports fetch enumerates metadata columns only (`id, account_id, kind, filename,
  ad_names, status` — all the auto-heal detection reads). File bytes are only ever read by
  the file-serving route and the analysis/deconstruction engines, per import, on demand.

## BUG-26 — Large real-world exports OOM-kill the process at upload validation (bare HTTP 500 for both CSV and XLSX)

- **Symptom:** the re-exported AAFE demographic report (9.6 MB xlsx / ~132 MB as CSV,
  48,729 rows each carrying the full ad copy in a "Text" column) returned a bare
  "Upload failed (HTTP 500)" — no JSON body — for BOTH file formats. Reproduced locally:
  process death under a 1.5 GB heap cap.
- **Root causes (two, compounding):**
  1. `convertXlsxToCsvText` used ExcelJS's buffered reader, which materializes every cell
     as an object — this file's single sheet is 103 MB of XML / 2.3M cells, blowing past
     1.5 GB before conversion even finishes.
  2. `parseCsvLines` built every field one character at a time (`field += c`), creating V8
     rope-string churn across the whole 132 MB input — the CSV upload died the same way
     without ExcelJS involved.
- **Category:** Fix-Now (blocks the user's real re-export both ways).
- **Resolution (implemented):** workbooks over 4 MB compressed convert through ExcelJS's
  streaming reader (row-at-a-time; both readers share one row-to-CSV core so cell
  semantics never diverge — forceStreaming test mode holds the streaming path to the same
  assertions). The CSV tokenizer batches fields as slices between structural characters
  with unchanged state-machine semantics. Verified on the real file: convert 12.6 s +
  parse 3.9 s at 583 MB peak RSS; all 48,729 rows parse with only the honest warnings
  (Sheets ID corruption ×3, duplicated header columns ×3).

## BUG-27 — Optional-column absences rendered as warnings; currency-suffixed CPM flagged "low confidence"

- **Symptom (live, AAFE Ad Summary export):** the pre-run mapping banner showed
  "29 columns missing, 1 low-confidence — Missing optional columns may reduce analysis
  accuracy. Consider fixing your CSV first." for a file whose class only REQUIRES
  `Day` + `Ad name`. All 29 "missing" columns were optional metrics Meta's Ad Summary
  export type simply doesn't carry — not a defect the user can fix. The one
  "low-confidence" entry was `CPM (cost per 1,000 impressions)` found as
  `CPM (cost per 1,000 impressions) (USD)` — a deterministic rename.
- **Root causes (two):**
  1. `findColumnInHeader`'s currency tolerance only covered canonicals containing the
     `{ACCOUNT_CURRENCY}` placeholder ("Amount spent"). Some Meta export types append the
     account currency to EVERY monetary column, so the suffixed CPM header fell through to
     Jaccard inference (~71%) and rendered a spurious "please verify" flag.
  2. Both mapping surfaces (pre-run `MappingHealthBanner`, upload-dialog
     `CsvMappingPanel`) styled ALL missing columns as warnings — amber section, red rows —
     regardless of `is_required`.
- **Category:** Fix-Now (last known false-friction warning surface before Phase 2/3).
- **Resolution (implemented):** generic currency-suffix tolerance in `findColumnInHeader`
  (a trailing 3-uppercase-letter parenthetical strips and re-compares exact/ci/slug →
  via `currency`, 0.99, tier `exact`; lowercase parentheticals like "(all)" are never
  stripped), and `currency` added to the parser's deterministic-fold set so it joins the
  single "matched automatically" summary line. Presentation: required-missing stays red,
  genuine low-confidence inference stays amber, optional-missing demotes to a neutral
  collapsed "N optional columns not included in this export — no action needed" notice on
  both surfaces, and the confidence report's tier chip shows a muted "not in export"
  instead of red "missing" for optional columns. The column list stays fully available
  behind the disclosure — presentation demoted, data never hidden.

## Phase 1→2 optimization pass (Aug 25) — performance, load, and transfer

Evidence-driven pass ahead of the Phase 2/3 transition; every change verified in isolation
(typecheck + the owning test suites, incl. the in-memory-Supabase e2e engine test).

- **Response compression (transfer):** the API served the multi-MB seed JSON uncompressed —
  no `compression` middleware existed. Added; JSON of this shape gzips roughly 10×.
- **Seed cache TTL 30s → 5min (Supabase load):** every in-app mutation path already calls
  `invalidateMetrixSeedCache()` explicitly (verified across 7 modules), so the TTL only
  bounds out-of-band writes. Cuts the ~25-parallel-query rebuild from twice a minute to at
  most every 5 for idle viewers.
- **Per-run import reader (CPU + chunk fetches):** each staged file was fetched, decoded,
  and parsed up to 3× per run (class detection → conversion gate → main parse) — triple a
  ~15s convert+parse on a large workbook. One run-scoped cache: bytes fetched once, decoded
  text cached per sheet-selection key, parse result shared between the gate and the main
  loop; caches cleared before the DB-heavy ingestion phase. Side effect: the conversion
  gate's sheet selection is now class-aware, consistent with the main parse.
- **Creative file cache byte cap (memory):** the 10-min TTL cache had no size bound — the
  real 125-asset library (~245 MB decoded) could accumulate in RAM. Now capped at 64 MB
  with oldest-first eviction; oversized single files are served uncached.
- **Deliberately NOT done:** trimming ad_performance's jsonb columns from the seed —
  measured at 86 kB across 5,406 rows (1.2 MB table total); not worth the risk.

Flags (operator action / product decisions, no code change):
- `manual_imports` is 363 MB of the 437 MB database: 245 MB creatives (legitimate),
  45 MB processed performance-file history, and **77 MB across 20 currently-STAGED
  performance files** — the next analysis run merges every staged file per slot, so the
  staging area should be reviewed and stale files removed before the next run.
- Processed performance files are kept for restaging by design; a retention policy
  (e.g. keep last N per slot) is a Phase 2 product decision.

## BUG-28 — Coverage gating reached 2 of 5 drill-down surfaces, and never the report export

- **Symptom:** on AAFE (demographic export covers ~2% of account spend) the SAME segment
  rendered "insufficient join coverage" when opened from Audience and an unqualified
  signal read when opened from Analysis Overview, the IAP Library creative card's
  Demographics tab, or a variable drill-down. `lib/reportExport.ts` computed segment
  comparisons with no coverage at all, so those numbers could leave the product in a
  client-facing document uncaveated (latent — no UI passes `segmentComparison` yet).
- **Root cause:** BUG-02's gate is an OPTIONAL `demoCoverage` prop on
  `SegmentDrilldownModal`, threaded through call sites by hand. Two of five passed it;
  three omitted it and silently got `null` = "legacy run, no coverage measured", which
  falls back to per-segment heuristics. The prop's absence is indistinguishable from an
  account that genuinely has no coverage data.
- **Category:** Fix-Now (fabricated confidence — the exact defect class BUG-02 exists to
  prevent, surviving on three of the surfaces it was supposed to cover).
- **Resolution (implemented):** `hooks/useDemographicCoverage.ts` resolves the scoped
  account's run-level coverage once (the "all" preset — coverage is a property of the RUN,
  not the selected window; react-query dedupes it against any preset query a caller holds).
  `SegmentDrilldownModal` reads it itself and treats the prop as an OVERRIDE, so a call
  site can no longer omit what it never has to pass; AudienceView still overrides with its
  tighter date-preset summary, AvatarsView drops its duplicated query.
  `buildReportModel` gains an explicit `demoCoverage` option threaded into
  `buildSegmentComparisonSection`. The export's warning prefix now names the state it
  reports — "Insufficient join coverage" rather than "Low signal", which understated it.
- **Verification evidence:** three new cases in `reportExport.test.ts` (below-threshold
  qualifies both segments and never says "Low signal"; adequate coverage stays unqualified;
  a legacy run with no measured coverage falls back to heuristics). Full suite 1,663 green,
  typecheck green.

## BUG-29 — Creative popup empty-state reasons reached 3 of 10 call sites

- **Symptom:** seven of ten `<CreativeCard>` call sites (Concept family, Variable
  drill-down, Creative Scan, Brief builder, three further IAP Library rows) still showed
  "Import a demographic pivot export to see the age × gender breakdown" on accounts where
  a demographic export HAD been imported — the misleading copy BUG-03 §1.4 was written to
  remove. No call site passed `funnelEmptyReason` at all, so the Funnel tab fell back to
  generic text everywhere.
- **Root cause:** same mechanism as BUG-28 — the cause-specific reasons are optional props
  computed at each call site rather than derived where they render.
- **Category:** Fix-Now (BUG-03 partially applied; the remaining sites tell the user to do
  something they have already done).
- **Resolution (implemented):** `creativeEmptyReasonsFor(analysis, cellId)` in
  `creative-empty-reasons.ts` carries all three rules as one pure function;
  `hooks/useCreativeEmptyReasons.ts` is a thin wrapper supplying the scoped account's
  analysis data; `CreativeExpandDialog` derives the reasons from the card's cell code, with
  explicit props still winning for callers that scope a card differently. All ten sites are
  covered without any of them changing.
- **Verification evidence:** four new cases in `coverage-honesty.test.ts` (derives all three
  reasons for an unjoined cell; nulls per tab that has rows; stays silent without a cell id
  rather than guessing; reports never-imported vs account-grain correctly).

## BUG-30 — `reconciliation` declared REQUIRED in the API contract with zero writers

- **Symptom:** sharper restatement of BUG-14. `import_metric_reconciliation` exists in
  `schema.sql` with no writer anywhere in the codebase; `runShape`
  (`analysisEngine.ts:184`) never emits the field; yet `openapi.yaml:4463` documents it as
  a live cross-check and lists it under `required`, so generated Zod (`lib/api-zod`) and
  the generated client type both assert a field that never arrives.
  `AnalysisHistoryView` survives only via `run.reconciliation ?? []`; the type invites an
  unguarded `.map()` that would throw at runtime.
- **Category:** Fix-Now (resolved 2026-08-25 by owner decision: make the contract honest).
- **Owner decision:** of the three options (implement the writer / delete the block and
  field / make the contract honest), the owner chose to make the contract honest — the
  smallest reversible change, and it does not preempt building the check later.
- **Resolution (implemented):** `reconciliation` moved out of `AnalysisRun.required` in
  `openapi.yaml`, with the description stating plainly that nothing populates it, that the
  equivalent integrity check running today is the over-baseline guard in
  `computeDataCoverage` (surfaced via `data_coverage` + csv_warnings), and that the field
  should move back to `required` if the writer is implemented. Codegen regenerated:
  `reconciliation?: ReconciliationRow[]` in the client types, `.optional()` in the Zod
  schema. `AnalysisHistoryView`'s block is kept and now reads through one nullish path, so
  implementing the writer later needs no UI work — its guard is type-correct rather than
  incidentally safe. Verified: codegen drift clean, full typecheck green.
- **Sweep evidence:** a scripted check of all 139 OpenAPI schemas for required
  non-nullable fields with no server writer found `ReconciliationRow` to be the ONLY
  genuine orphan in the contract (the other 11 hits were shorthand-property or
  client→server input false positives, each verified by hand).

## BUG-31 — Creative-metadata cascade bypassed the warning-fold policy and ran after header claiming

- **Symptom (real AAFE Ad Summary shape):** every `ad_summary` import emitted three
  extra warnings — `Creative metadata column "Ad creative body text" auto-matched from
  "Body text" (via alias match)` and the same for Headline and CTA. Those are Meta's own
  header names, resolved through the curated alias table: nothing for the user to verify
  and nothing they can act on. Probe over the real header shape: 6 warnings, 3 of them
  this noise.
- **Root causes (three, one cascade):** `iapCsvParser`'s breakdown, spend and metric
  cascades fold deterministic matches (slug / case-insensitive / curated alias /
  currency-suffix) into ONE "matched automatically — no action needed" line. The
  creative-metadata cascade — `ad_summary` only, which is why BUG-20 and BUG-27 both
  missed it — emitted one line per column unconditionally. It also ran ~200 lines AFTER
  `unmappedHeaders` was computed, so (a) its successfully-mapped headers were still
  unclaimed when the unknown-column pass ran and were eligible to be reported as
  "Unrecognised column … may correspond to expected column X", and (b) had it folded, it
  would have incremented a counter already reported — dropping the mapping from the
  summary rather than demoting it.
- **Category:** Fix-Now (the warning-channel erosion BUG-20 targets, in the one cascade
  the fix never reached).
- **Resolution (implemented):** the cascade moved up beside the others, before
  `unmappedHeaders` and before the fold summary is emitted, and now applies
  `isDeterministicVia` exactly as they do. Probe over the same header: 6 warnings → 3,
  fold count 1 → 4 (nothing dropped), both survivors informational "Note:" lines.
  Separately, `warningSeverity.ts` gained `(via currency match)` — currency-suffix
  resolution is deterministic, and stored runs from before this fix can carry a
  per-column line for it that would otherwise render as action-needed.
- **Verification evidence:** five new cases in `iapCsvWarningSignal.test.ts` (no
  per-column creative-metadata lines; fold count includes them; every column still
  mapped; no mapped header reported as unrecognised; the real shape yields exactly 3
  informational warnings) + two in `warningSeverity.test.ts`. 288 server tests green.

## BUG-32 — Alerts page never surfaced the data-quality flags it documents as its source

- **Symptom:** `ListenCommandCenter` documents Alerts' lineage as `iap.data_quality[]`,
  but `AlertsView` rendered only high-impact signal cards and `data_caveat`. Importer and
  analysis-run quality findings — including `cross_export_mismatch`, the cross-export
  integrity trigger — reached only the Ad Performance signal tiers. The page a user opens
  to see what needs attention showed none of them, and the "Active alerts" count excluded
  them.
- **Root cause:** BUG-15, previously recorded as an open surfacing gap.
- **Category:** Fix-Now (a trigger that fires correctly and surfaces nowhere the user
  looks is indistinguishable from one that never fired).
- **Resolution (implemented):** flag presentation (`flagHeadline` / `flagBody` /
  `flagEvidence`) extracted from `AdPerformanceView` into `lib/dataQualityFlags.ts` and
  shared; Alerts renders a "Data-quality findings" section from `acct.iap.data_quality`,
  counts them in the alert totals, and cross-links to Ad Performance for full per-finding
  evidence rather than duplicating the tier UI. The command-center lineage label now
  names all three real sources (`signal_cards[] · data_caveat · iap.data_quality[]`).
- **Verification evidence:** the repo's `inpage-nav-targets` guard caught a wrong
  cross-link target (`/app/analysis/ad-performance`) on the first attempt; corrected to
  the real route (`/app/analysis/performance`). 1,666 client tests green.

## BUG-33 — Refetching KPI tiles rendered the same "—" as a missing value

- **Symptom:** `KpiValue` rendered `—` at reduced opacity while a refetch was in flight —
  the same glyph a null value renders. A slow request and "this number does not exist"
  were the same picture, and the honest-null convention loses its meaning when loading
  borrows the glyph.
- **Category:** Fix-Now (swallowed state, group (c) of the Phase 1 audit §5.3).
- **Resolution (implemented):** the in-flight state renders a pulsing bar with
  `aria-busy` and an accessible label instead. The dash now means exactly one thing.

## CI coverage gap — 224 secret-free server tests were never gated

- **Finding:** CI excluded the api-server suite as "needs live secrets" and hand-picked
  five files back in. Running each of the 38 files individually with no environment set
  shows **16 of them pass secret-free** (288 tests). Eleven were therefore unprotected,
  including `iapCsvMapping` (73 tests — the column-mapping cascade behind the whole
  BUG-20/21/27 warning class), `metrixSeedAssembly` (the BUG-25 fix that resolved a
  production outage), `iapCsvParser`, `objectiveCoverage` and `analysisCsvClassCheck`.
- **Resolution (implemented):** the CI step now runs all 16, with the criterion recorded
  in the workflow so the list stays correct as suites are added: a file belongs there only
  if `vitest run <file>` passes with no environment. Gate went from 59 to 288 tests.

## BUG-11 (open half) — resolved: one strict aggregation policy

- **Symptom:** `sumInRange` (`date-scope.ts`) returned `number` and folded missing values
  with `?? 0`. A column no row carried summed to a measured-looking `0`, and a date window
  containing no rows reported "$0 spent" rather than "nothing measured here". Zero is a
  real, meaningful figure in every metric this feeds, so it must never stand in for an
  unknown. This was the largest remaining honesty-invariant gap and the last item from the
  Phase 1 audit's §5.3 aggregation-policy split.
- **Owner decision (2026-08-25):** null unless every contributing row carries the value —
  matching the `sumStrict` policy already used in `segment-analytics`, rather than adding a
  second convention that disagrees at the edges.
- **Resolution (implemented):** `sumInRange` returns `number | null`: null when no row
  falls in the range, null when any row that does lacks the value (or carries a non-finite
  one), a real sum otherwise. The type change surfaced every downstream site that had been
  silently coalescing:
  - `MetricResultEvent.results` / `.spend` are now `number | null`. `buildMetricCatalog`
    computes `totalResults` strictly (null if ANY event is unmeasured) so `cpa_blended` and
    `cvr` stay null rather than being derived from a partial sum that looks complete;
    `costPerResult` gained the matching null guard.
  - Two `spend: scoped.spend ?? 0` fabrications removed from `AdPerformanceView`'s
    range-scoped tile and drill-down catalogs.
- **Verification evidence:** six new cases in `date-scope.test.ts` (null on empty range,
  null on a gap in a contributing row, a gap OUTSIDE the range correctly ignored, null on
  an empty row set, normal summation when complete, non-finite treated as unmeasured) plus
  the two existing cases updated to the nullable contract. Full typecheck green, 1,672
  client tests green, codegen drift clean, production build succeeds.

## BUG-34 — `ad_performance` was the only run-scoped rollup with no run index

- **Symptom (live DB):** the run-tagging block in `schema.sql` creates a
  `manual_analysis_run_id` index on six rollup tables; `ad_performance` was omitted —
  despite being the largest of them (9,647 rows live, ~2x the next) and the table the
  idempotent-rebuild path deletes run-scoped on every re-ingestion. That delete, and
  every run-scoped read of it, ran against no index.
- **Root cause:** oversight when the run-tagging block was written; the sibling tables
  were enumerated and this one was missed.
- **Category:** Fix-Now (efficiency; grows with the largest table in the schema).
- **Resolution (implemented):** `ad_performance_run_idx` added to `schema.sql` and
  applied live, alongside six other missing importer FK indexes
  (`data_quality_flags`, `signal_cards`, `ad_traffic_quality`, `failure_patterns`,
  `import_metric_reconciliation` account lookups; `creative_deconstructions`
  .manual_import_id for parent-delete enforcement).

## BUG-35 — 42 unindexed foreign keys, including every RLS policy predicate column

- **Symptom:** a live audit found 42 single-column FKs with no supporting index.
  Postgres creates none automatically. Unindexed FKs cost twice: lookups seq-scan, and
  every parent DELETE scans the whole child table while holding a lock.
- **Why it matters more than the row counts suggest:** on the official 22-table schema
  these columns (`analysis_run_id`, `client_id`, `user_id`, `org_id`) are evaluated
  INSIDE RLS POLICY PREDICATES — once per candidate row, on every read by every signed-in
  user. The cost sits on the tenancy path, not on joins the application chooses to write.
- **Category:** Fix-Now (cheap now at current table sizes; expensive to build later under
  load on the tenancy path).
- **Resolution (implemented):** migration `20260825000100_fk_index_coverage.sql` (official
  schema) + `schema.sql` additions (importer). Applied live; index count 118 → 156;
  unindexed FKs 42 → 7. The 7 survivors are deliberate and documented in the migration:
  `cohort_key` FKs point at a 4-row config table whose rows are never deleted, and
  `global_variable_registry.superseded_by` is a self-reference followed one row at a time.
- **Also fixed in the same pass:** 17 tables had `reltuples = -1` (never analyzed — the
  planner had no statistics at all, including `cell_creative_overrides` at 6.8 MB).
  `ANALYZE` run; now 0.

## BUG-36 — `content_md5` NULL on 93% of rows left the BUG-09 duplicate guard inert

- **Symptom:** the same-bytes staging guard compares an incoming file's md5 against
  currently-staged rows with an equality filter. 172 of 185 `manual_imports` rows carried
  NULL `content_md5` (the column shipped with the guard but was never backfilled), and
  `= NULL` never matches — so for 93% of rows the guard silently did nothing.
- **What it let through (live):** 25 groups of byte-identical files staged into the same
  slot, every one of which should have been rejected with a 409. Three are performance
  exports — the kind that double-count spend (`ecas` IAP-DEVICE-MAIN-ECAS.csv x2,
  `manual_BwsYjC5ZRk0i` real_20mb.csv x2, `manual_QmjeK52K5QiQ` king-DEVi.csv x2). The
  other 22 are creative assets (storage waste, duplicate library rows, no spend impact).
- **Spend was not corrupted:** the BUG-19 parse-time cross-file dedupe catches identical
  rows and drops them with a `[Duplicate data]` warning. Defence in depth held — but the
  second layer was doing the first layer's job, which is exactly the condition that makes
  a future regression in either layer invisible.
- **Category:** Fix-Now (a guard that cannot fire is worse than no guard: it is trusted).
- **Resolution (implemented):** all 185 rows backfilled, recorded as an idempotent block in
  `schema.sql` (inline rows via `md5(content)`; chunked rows via chunks reassembled in
  `chunk_index` order, matching what the complete-step hashes).
- **Verification evidence:** correctness established BEFORE writing — Postgres
  `md5(bytea)` checked against all 13 rows that already held an app-written value
  (11 inline + 2 chunked): 13/13 exact, 0 mismatches. A wrong backfill is worse than a
  NULL one; it would 409-reject legitimate uploads. All 185 re-verified after.

## Open (owner decision) — upload storage retention

- 533 MB database; 794 MB logical upload bytes across 185 files. Three copies of one
  138 MB `IAP-DEMO-NEW.csv` (identical md5) account for the entire chunk table: one
  abandoned `uploading` row on AAFE, two `processed` copies on `manual_kisg7_8qaRG_`.
- Reclaimable without touching anything still needed: 138 MB abandoned + 270 MB exact
  duplicates (logical; physical is lower — bytea is TOAST-compressed).
- `docs/resources/sql/2026-08-25_upload_storage_reclaim.sql` is prepared and deliberately
  NOT executed: every statement destroys uploaded source files. SELECTs lead, DELETEs stay
  commented. Processed-file retention still needs the keep-last-N-per-slot decision from
  the Phase 2 backlog before anything is purged.

## Open (needs a tested change) — SECURITY DEFINER helpers exposed over PostgREST

- Four tenancy helpers are callable by any signed-in user at `/rest/v1/rpc/...`.
  `metrix_client_id_of_run(run_id)` resolves ANY run UUID to its owning `client_id`,
  bypassing RLS — a cross-tenant mapping primitive (limited in practice by run ids being
  unguessable v4 UUIDs). The other three answer only about the caller.
- **Do NOT simply revoke EXECUTE:** RLS policy expressions evaluate with the querying
  user's privileges, and all six run-scoped tables call this function inside their
  policies, so revoking from `authenticated` would break tenant reads outright. Correct
  remediation is relocating the helpers to a schema PostgREST does not expose and
  repointing the policy references — a deliberate change with a test pass.
