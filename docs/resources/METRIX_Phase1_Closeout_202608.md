# METRIX Phase 1 Closeout — August 2026

Status record at the close of the Phase 1 stabilization effort (Aug 24–25, 2026 sessions;
PRs #127–#137). Context for *why*, not specification for *what* — per the docs/resources
convention. The live account referenced throughout is AAFE (`manual_9JGXU_AQJjxJ`).

## Definition-of-done check (from the Phase 1 work order)

| Requirement | State |
|---|---|
| B0 fixed and tested (re-ingestion duplicate-key crash) | Done — root-caused to unnormalized Day dates poisoning bucket keys, window math, the delete predicate, and the date-typed unique key at once; fixed with parse-time ISO normalization + pre-delete guards; live re-runs verified (PR #127) |
| AAFE clean re-import reconciles segment spend to account totals | Done — final verified run: demographic coverage **95.7% of spend / 98.3% of ads** (was 2.9%/3.7%), placements 100%; reconciliation guard now fails loudly if any breakdown class exceeds the daily-attributable baseline |
| Coverage/honesty layer live | Done — per-class coverage persisted with each run, served via `data_coverage`, 3-state signal badges, sub-90% suppression, coverage-aware strategy evidence packs |
| BUG_TRACKER accounts for everything found | Done — B0 + BUG-02…BUG-26, each Fix-Now/Phase 2/Won't-Fix triaged; nothing uncategorized |
| Optimization Loop: confirm state, do not build | Confirmed empty/pending by design; scoped estimate 3–4.5 days (unchanged) |

## What hardened beyond the original scope (driven by live operation)

- **Ingestion integrity:** cross-file duplicate dedupe (BUG-19), cross-class spend
  reconciliation guard, aggregate-summary detection, conversion-export gate, same-bytes
  409 staging guard, cross-concept fuzzy-mapping veto (BUG-21).
- **Large real-world files:** chunked uploads to 150 MB (proxy caps single bodies —
  BUG-23), 120s `service_role` statement timeout (the `authenticator` role's 8s default
  silently capped every server DB call), streaming xlsx reader + slice-based CSV tokenizer
  (a real 48K-row/132 MB export OOM-killed the process under both formats — BUG-26),
  multi-sheet workbook sheet selection (BUG-24).
- **Production incidents root-caused live:** seed assembly dragging the full creative
  library's bytes on every build (BUG-25, splash hang); completeness panel scoping to a
  failed run (BUG-22, "0 rows" false alarm).
- **Signal quality:** warning severity classifier shared by the staging popup and the
  run-history panel; deterministic mappings fold, decision-bearing lines stay first-layer.
- **Performance floor for Phase 2/3:** response compression (seed JSON ~10× smaller on the
  wire), seed cache TTL 5 min against explicit invalidation, per-run
  fetch-once/decode-once/parse-once import reader (was up to 3× per file), header-only
  class detection, byte-bounded creative file cache (64 MB LRU).

## Live-account state at closeout

- Latest analysis run: success; 31,302 demographic rows in window; both classes above the
  90% coverage threshold; only true-positive warnings remain (Sheets ID corruption ×3,
  duplicate header columns ×3 — both fixable at the export, plus honest
  [Result type]/[Re-run] notes).
- Known-stale remnant: demographic rows for Jul 1–16 still carry the pre-dedupe doubled
  lineage (the recent runs rebuilt Jul 19–Aug 17 only). One full-date-range run retires it.
- Strategy/briefs: last generated Aug 23 — stale relative to the corrected analysis;
  stale-stage detection will prompt; evidence packs are now coverage-aware.
- Database: 437 MB, of which `manual_imports` is 363 MB (245 MB creatives, 45 MB processed
  performance history, ~77 MB across ~20 still-staged performance files at last count).

## Operator runbook to close the phase

1. Sync the Replit workspace with GitHub main (Pull, then Push) and **republish**.
2. Review the staged-imports list; remove stale staged performance files (the next run
   merges every staged file per slot).
3. Run one analysis over the **full date range** → retires the Jul 1–16 stale lineage.
4. Regenerate **strategy → briefs** (accept the stale-stage prompt).
5. Optional export hygiene: delete the duplicate columns in the two Sheets docs
   (demo: BG, EM, EN) and prefer CSV exported directly from Meta (preserves IDs).

## Phase 2 backlog (triaged, not started)

- BUG-14 (dead "Data integrity" block in AnalysisHistoryView), BUG-15 (Alerts lineage).
- Retention policy for processed performance files (storage: keep last N per slot).
- Warning-surfacing gaps: ephemeral upload warnings, csv_warnings single-surface.
- Aggregation-policy design decisions from the Phase 1 audit (see
  `METRIX_Data_Consistency_Audit_Phase1.md`).
- `routes/metrix.ts` modularization (~2.7K lines; split upload/creative/admin routers) —
  structural only, do before Phase 3 UI churn multiplies contact surface.
- Optimization Loop build (3–4.5 days, on explicit request).

## Phase 3 (UI/UX) entry points

- Typography/density system (`typography.ts`, `shared.tsx` rulebook) and the normalization
  framework (`normalize.ts`) are the enforced foundations — the disclosure-rulebook check
  ratchets violations downward.
- The severity-split warning surfaces, coverage banners, and 3-state signal badges are the
  honest-data primitives Phase 3 presentation should build on, not replace.
