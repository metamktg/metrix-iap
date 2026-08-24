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
