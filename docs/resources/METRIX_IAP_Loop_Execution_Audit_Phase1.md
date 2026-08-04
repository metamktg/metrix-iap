# Metrix IAP Loop Execution Audit — Phase 1

**Audit date:** August 4, 2026 **Scope:** every stage of the IAP Loop (Data Bundle Prep → Analysis
Core → Strategy Map → Brief Builder → MST Test Engine → Optimization Loop), traced against its
canonical spec in `docs/prompts/`. **Method:** three parallel, read-only code-tracing passes —
no changes made. This is Phase A of Initiative 5 ("IAP Loop fully executes, no bugs"): a report of
what's actually true today, before any fix work starts.

---

## Headline finding

**One systemic bug (cohort-awareness hardcoding) touches three stages, and two entire stages are
unbuilt.** Nothing in the loop is silently broken in a way the app hides — every real gap found is
either an honestly-labeled `PendingState`/`CaveatNote`, or a genuine code defect with a clear
file:line. The good news: the "honesty pattern" (running/success/error, no fabricated data) that
`replit.md` mandates is correctly implemented everywhere it applies.

| Stage | Verdict |
| :--- | :--- |
| Data Bundle Prep | **Not implemented as its own stage** — folded into CSV import, no cohort concept, no `data_quality_flags` |
| Analysis Core | **Partial** — deterministic aggregation covering ~2 of 11 prompt dimensions, real data-integrity bugs |
| Strategy Map | **Real, with 2 significant bugs** — hardcoded CPA, never generates ICP profiles |
| Brief Builder | **Real, shares the same cohort-hardcoding bug** as Strategy |
| MST Test Engine | **Layer 1 real and working**; layers 2–7 fully unimplemented (confirmed earlier this session) |
| MST Creative Scan | **Spec only** — not wired to any code path |
| Optimization Loop | **Complete stub** — no data model, no generation engine, no trigger, nothing to display |

---

## 1. Data Bundle Prep

No distinct stage exists. `iapCsvParser.ts`/`iapCsvSpec.ts` (`artifacts/api-server/src/lib/`) parse
and alias two Meta pivot CSVs straight into DB rows — no cohort registry lookup, no
`required_metric_block` validation, no `data_quality_flags`, no bundle JSON artifact matching
`IAP_DATA_BUNDLE_PREP_v2.0.md`'s contract. Normalization and ingestion are the same step.

## 2. Analysis Core

`analysisEngine.ts:579-1346` (`startManualAnalysis`) is **deterministic TypeScript, not an LLM
call** — confirmed by grep, unlike Strategy/Briefs. It computes CPA/CTR/CVR/CPM, a 4-tier
`performance_tier` based purely on CPA lift vs. book baseline (no buying-intent weighting, no
cohort awareness), and a crude `buying_intent_score = results*10 + linkClicks` (hardcoded
ecommerce-style weights, ignoring the prompt's cohort-driven `intent_score_weights`). Entirely
absent: `executive_summary`, `performance_tables`, `winning_creative_formula`,
`optimization_priorities`, `actionable_recommendations`, `traffic_quality_signals`,
`psychology_patterns`, `creative_dna_signals`, `cross_correlations`, `winning_variables`,
`failure_analysis`, `insight_confidence`, `winning_stack`, and more — roughly 2 of the prompt's 11
dimensions are computed. This is useful raw aggregation feeding real UI tables, but it is not the
Analysis Core contract.

**The running/success/error honesty pattern is correctly implemented** (`metrixAnalysis.ts` routes,
partial unique index `manual_analysis_runs_one_running`, stale-run auto-flip after 10 min, 409 on
concurrent runs).

**Concrete bugs:**
- `deleteRunOutputs` (`analysisEngine.ts:347`) only cleans up `ad_performance` on failure — the
  demographic/placement/platform/device/concept/variable tables have no run-id FK, so a run that
  fails partway through can leave those tables in a stale state despite the run being marked `error`.
- `concept_performance` and `variable_performance` are full-account replace
  (`.delete().eq("account_id", accountId)`, lines 1005/1115) while the other five tables are
  window-scoped — a narrow-window re-run silently wipes concept/variable history outside that window.
- `resultType` silently falls back to the literal string `"unknown"` (line 826) instead of surfacing
  the gap via `csv_warnings` — a real data-quality signal gets masked as a normal value.
- No `data_quality_flags` are ever computed, so nothing downstream that expects them (per the
  prompt contract) gets anything.

## 3. Strategy Map & 4. Brief Builder

`generationEngine.ts` genuinely works end to end: real `claude-sonnet-4-6` calls
(`GENERATION_MODEL`, line 24), evidence packs built from real Supabase rows, Zod validation with one
repair retry (throws correctly on second failure), and a **race-safe concurrency guard** — a partial
unique index (`generation_runs_one_running`, `schema.sql:605-606`) backing the app-level check, 23505
→ 409. Frontend polling (`GenerationControls.tsx`) is solid: 202 + `run_id` → poll every 2.5s →
invalidate seed cache on success, double-tap guarded.

**Two real bugs, both matching the "ecommerce hardcoding" defect CLAUDE.md already flags as a known
systemic issue:**
- `generationEngine.ts` never references `cohort`, `terminal_metric`, or `cohort_definitions`
  anywhere (zero grep hits). The strategy prompt itself hardcodes the metric — line 381: *"Quote real
  numbers (results, **CPA**, CVR, funnel counts)"* — and `buildStrategyEvidence`'s `concept_rollup`
  hardcodes a `cpa` field (lines 226-236). This is the in-app generation engine reproducing the exact
  defect the canonical docs were repaired to eliminate.
- `GeneratedStrategy`'s schema (lines 71-74) only outputs `pillars` + `hypotheses` — **it never
  generates ICP profiles**, despite `IAP_STRATEGY_MAP_v2.0.md` listing the "ICP Profile Registry" as
  Output Objective #1 with a full psychographic schema. Strategy generation silently relies on
  whatever `icp_profiles` already exist as imported data and never expands or updates them.

Secondary note: the prompts embedded in `generationEngine.ts` are hand-authored, compact
reimplementations of the canonical docs, not the literal doc content — a drift risk to watch, not a
bug today. Test coverage is thin (only placeholder-sanitization is tested; the repair-retry path,
concurrency guard, and route logic have no direct tests).

## 5. MST Test Engine

**Layer 1 (the matrix grid) is real and working.** `MstSprintsView.tsx` renders the actual
`historical_matrix_4x4` grid with correct gating (status, date-range, pending states).
`MstPerformanceView.tsx` computes genuine universal-vs-avatar-specific CPA winners by joining real
rows. Every incomplete area is **honestly labeled**, not silently broken: `MstCrossMapView.tsx`
self-documents "planned but not yet built," `MstDirectionView.tsx` is an explicit `PendingState`
about the Optimization Loop dependency.

**Layers 2–7 remain fully unimplemented** (column/row/diagonal analysis, variable isolation,
synergy, crossmap, verdicts) — confirmed again this pass, consistent with the earlier finding this
session. `MST_CREATIVE_SCAN`'s spec (`docs/iap/MST_CREATIVE_SCAN.md`) is also unwired —
`CreativeScanView.tsx` does plain file upload + ad-name mapping only, with its own `CaveatNote`
admitting the automated confidence pass "is planned but not yet built."

## 6. Optimization Loop

**Complete stub, worse than MST's gap.** The prompt's output contract
(`IAP_OPTIMIZATION_LOOP_v2.0.md`, line 966+) defines `updated_weights`, `updated_combinations`,
`updated_icp_priorities`, `suggested_actions`, `learned_patterns`, `performance_forecast`, and a full
re-weighting/feed-forward engine. The frontend's `OptimizationLoop` interface
(`seedTypes.ts:336-343`) models none of it — only UI scaffolding (`visibility`, `recommendation_cards`,
`action_policy`, `dismiss_policy`). `metrixSeedAssembly.ts:703-704` **hardcodes
`optimization_loop: null`** unconditionally. No generation engine exists anywhere (grep for
`OPTIMIZATION_LOOP`/`updated_weights` across `artifacts/api-server/src` returns nothing outside
docs/tests). No run/trigger action exists anywhere in the repo. The only render surface
(`MstDirectionView.tsx`) is a static "not yet automated" explainer. Data model, generation, and UI
action are all absent — this is the one stage that is 100% stub, top to bottom.

---

## Cross-cutting root cause: cohort-awareness hardcoding

The same defect CLAUDE.md flags — "the known systemic defect is ROAS/CPA/purchase-funnel
assumptions baked in as if every client sells physical products" — is confirmed live in **Analysis
Core** (hardcoded CPA-based tiering, ecommerce-style intent scoring) and **Strategy/Brief
generation** (hardcoded CPA in the prompt, no `terminal_metric` resolution anywhere). This is one
root cause manifesting in three places, not three separate bugs — fixing the pattern once
(resolve cohort → `terminal_metric`/`terminal_metric_direction` at the point each stage reads/writes
metrics) is higher leverage than patching each site independently.

## Suggested remediation order (not started — for your confirmation)

1. **Cohort-awareness fix** across Analysis Core + Strategy/Brief generation — highest leverage,
   directly matches the defect the project's own docs already flag as needing repair.
2. **Analysis Core data-integrity bugs** — the rollback gap, the full-replace-vs-window-scoped
   inconsistency, and the silent `"unknown"` masking are real correctness risks independent of the
   cohort fix.
3. **Strategy: ICP profile generation gap** — decide whether to add it to `generationEngine.ts` or
   treat imported-ICP-only as an accepted current limitation.
4. **Decide Analysis Core's target shape** — keep it as deterministic aggregation (fast, cheap,
   already mostly working) vs. build it out toward the full LLM-driven 11-dimension contract. This is
   an architectural call, not a quick fix.
5. **MST layers 2–7** (already flagged as its own future initiative).
6. **Optimization Loop** — full build, the largest remaining gap in the loop.
7. **Data Bundle Prep** — decide if a real, separate bundle stage is worth building or if the
   current folded-in CSV path is an accepted simplification.

## Remediation progress

- **Item 1 (cohort-awareness) — done.** `cohortConfig.ts` added; `generationEngine.ts` now resolves
  cohort and injects a "BUSINESS MODEL CONTEXT" block into the Strategy/Brief prompts instead of
  hardcoding CPA. Also fixed a real, currently-broken endpoint found along the way:
  `PATCH /metrix/accounts/:id/cohort` wrote to a DB column (`ad_accounts.cohort`) that didn't exist
  anywhere in the tracked schema — added the missing backfill migration.
- **Item 2 (Analysis Core data-integrity bugs) — partially done, two items deliberately deferred.**
  Fixed: the silent `"unknown"` result-type fallback now surfaces a `csv_warnings` entry instead of
  masking a real data-quality gap. **Deferred, not fixed blind:** (a) the `concept_performance`/
  `variable_performance` full-account-replace vs. window-scoped inconsistency, and (b)
  `deleteRunOutputs`'s incomplete cleanup on failure for tables without a run-id FK. Both need either
  a live/staging database to verify against (this sandbox has no `DATABASE_URL`/`SUPABASE_DB_URL`),
  or more design work first — (a) in particular has a real edge case around the `"all"` date-range
  preset where a naive window-scoped delete could leave orphaned rows from an earlier `"all"` run
  once new historical data extends the range. (b) turned out to be a documented, seemingly deliberate
  tradeoff in the existing code comments, not an obvious oversight — overriding it without certainty
  risks trading one bug for a different one in a pipeline real client data flows through.
- **Item 3 (Strategy's ICP profile generation gap) - done.** generationEngine.ts's GeneratedStrategy
  schema now includes icp_profiles (0-4 new/refined segments per run, grounded in evidence, never
  duplicating an existing profile_name). icp_profiles table gained the same source/generation_run_id
  columns message_pillars/testing_hypotheses already had (another schema-drift gap closed). Seed
  assembly applies the same generated-preferred-over-imported swap already used for pillars.
  Deliberately scoped narrow: pillars' target_icps still only reference pre-existing imported profile
  ids this pass -- cross-referencing newly generated ICPs from the same run is a future refinement,
  not bundled in here, to keep the change contained and low-risk.
