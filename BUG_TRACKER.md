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
- **Resolution:** §1 coverage/honesty layer (this session, after B0).
- **Verification evidence:** probe over `demo-old.xlsx`/`demo-new.csv` (identical metric
  content): per-segment sums equal the UI's numbers to the cent.

## BUG-03 — Creative popup (C8A) empty across all tabs

- **Symptom:** "No performance data", "No demographic data for this cell", "No placement data
  for this account" on creative C8A's popup tabs.
- **Root cause:** under investigation (§0.3). Established so far: the AAFE ad names
  (`ANIM_DAL_BOTOX.mp4`, `STAT_PEANUTHEAD_79_ 08.jpg`, …) carry no concept codes, so
  concept-keyed surfaces are legitimately empty for this account (`.agents/memory/`
  "manual accounts render from the daterange summary API"); demographic per-cell data can at
  most cover the 11 ads in the demo export. Whether the performance/placement tabs *should*
  populate via the `ad_names` creative-asset mapping is the open question.
- **Category:** pending triage (Fix-Now if mapping regression; else folded into §1 empty-state
  differentiation).
- **Resolution:** TBD this session.

## BUG-04 — Demo-vs-placement disparity flag: generic message

- **Symptom:** discrepancy trigger fires on AAFE after import.
- **Root cause:** trigger fires **correctly** — demographic coverage genuinely is ~1% of
  placement coverage in this account's exports. The defect is the message: it names no cause
  and no remedy.
- **Category:** Fix-Now (messaging only, per work-order §1.5 — do not change firing).
- **Resolution:** message rewrite as part of §1: state measured coverage, the detectable cause
  (demo export scoped to a subset of ads / spend), and the remedy (re-export demographics for
  all ads / full window). Pending implementation.

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
- **Resolution (implemented in the §1/§2 pass):** parse-time aggregate-shape detection for
  `ad_summary` — single distinct `Day` value + `Reporting ends` present and differing from
  `Reporting starts` → the file is treated as window-scoped: used for creative metadata and
  cross-validation/coverage totals, excluded from daily bucket merge and summary-only daily
  insertion, with a warning naming the remedy (re-export with the Day breakdown).
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
- **Resolution:** pending this session (staging-time md5 check against currently-staged files
  of the same kind → 409 with "already staged" message).
