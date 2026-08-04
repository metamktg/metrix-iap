# Metrix IAP UI Disclosure Audit — Phase 1

**Audit date:** August 4, 2026 **Scope:** every screen under `artifacts/metrix-iap/src/pages/metrix/`
**Trigger:** the Agency Overview / Avatars / Communications screenshots that opened this initiative were
examples, not the full extent — this audit confirms the same pattern (raw pixel typography, no
progressive disclosure, dead JSON fields) is platform-wide and gives initiative 2+ a scoped,
ranked backlog instead of "redo everything."

**Method:** `pnpm --filter @workspace/scripts run check:disclosure-rulebook` (added this initiative,
`scripts/src/check-disclosure-rulebook.ts`) mechanically scans every module page for raw
`text-[Npx]` classes that bypass the `TYPE` scale (`typography.ts`). This is the same enforcement
pattern as the existing `check:text-primary-contrast` / `check:css-token-contrast` checks — it can
be re-run at any time to verify progress and prevent regression on files already fixed.

---

## Headline finding

**273 raw-pixel typography violations across 103 files**, before this initiative. Two pilot screens
(`ManagerOverview.tsx`, `CommunicationsView.tsx`) were fixed as part of Initiative 1, bringing the
count to **265 across 25 files** — every other file scanned was already clean on this specific rule,
but that only means those files use the semantic `text-label`/`text-caption`/`text-body`/`text-title`
utility classes correctly for *typography*; it says nothing about whether they use `DetailReveal` /
`DenseText` / accordions correctly for *disclosure*, which this pass did not mechanically check (no
reliable static signal for "this prose dump should have been collapsed" — that needs a human pass,
noted per-file below where visually confirmed).

## Ranked backlog (by raw-pixel violation count)

| Rank | File | Violations | Notes |
| ---: | :--- | ---: | :--- |
| 1 | `reports/ReportBuilderView.tsx` | 35 | Highest-volume offender — report builder is dense by nature, good candidate for a dedicated disclosure pass. |
| 2 | `analysis/FindingsView.tsx` | 33 | Findings cards are prose-heavy; likely needs `DetailReveal`/`DenseText` audit alongside typography fix, not just a find-replace. |
| 3 | `act/ActionQueueView.tsx` | 25 | Action cards mirror the same rationale/recommendation shape as `ManagerOverview`'s recommendation cards (already fixed) — same fix pattern applies directly. |
| 4 | `settings/GeneralView.tsx` | 24 | Settings rows — mostly label/value pairs, low disclosure risk, mechanical typography fix likely sufficient. |
| 5 | `settings/SecurityView.tsx` | 16 | Same as above. |
| 6 | `HomeView.tsx` | 15 | First-run/dashboard entry point — high visibility, worth prioritizing early in initiative 2. |
| 7 | `analysis/AdPerformanceView.tsx` | 13 | |
| 8 | `reports/ReportConfigurationView.tsx` | 12 | |
| 9 | `mst/MstSprintsView.tsx` | 11 | Note: MST screens are otherwise blocked on the separate MST generation-engine gap (see below) — typography fix here is independent and safe to do now. |
| 10 | `creative/CreativeBriefBuilderView.tsx` | 9 | |
| 11 | `listen/ListenCommandCenter.tsx` | 8 | |
| 11 | `creative/CreativeCommandCenter.tsx` | 8 | |
| 11 | `analysis/AnalysisCommandCenter.tsx` | 8 | |
| 14 | `mst/MstPerformanceView.tsx` | 7 | |
| 15 | `creative/CreativeLibraryView.tsx` | 6 | |
| 15 | `OverviewLoopHub.tsx` | 6 | Feeds directly into `ManagerOverview` (already fixed) — fixing this closes the loop on the Agency Overview screenshot specifically. |
| 17 | `reports/ReportsCommandCenter.tsx` | 5 | |
| 17 | `analysis/AnalysisHistoryView.tsx` | 5 | |
| 19 | `shared.tsx` | 4 | The primitives file itself — fix carefully, changes propagate everywhere it's used. |
| 20 | `strategy/StrategyHistoryView.tsx` | 3 | |
| 20 | `strategy/StrategyCommandCenter.tsx` | 3 | |
| 20 | `OverviewUpdatesView.tsx` | 3 | |
| 23 | `mst/MstDirectionView.tsx` | 2 | |
| 23 | `mst/MstCommandCenter.tsx` | 2 | |
| 23 | `creative/CreativeImportExportView.tsx` | 2 | |

Full line-level detail: re-run `pnpm --filter @workspace/scripts run check:disclosure-rulebook`.

## Dead-field pattern (beyond typography)

Initiative 1 found and fixed one confirmed instance in `CommunicationsView.tsx`: `MessagePillar`
fields already read into the seed bundle (`funnel_application`, `execution_specifications`,
`placement_strategy`, `scaling_guidance`) and `ActiveHypothesis` rows already linked to pillars via
`pillar_id` were computed by `metrixSeedAssembly.ts` but never rendered anywhere. The same pattern —
data the backend already assembles correctly that the frontend silently drops — should be assumed
present on other screens until checked. Known remaining candidates, not yet surfaced anywhere in the
UI (confirmed unused during Initiative 1's research, not yet fixed):

- `variable_registry` (top-level seed field, flags variable codes missing a registry entry)
- `IAPData.data_quality` (per-account `DataQualityFlag[]`)
- `AdRecord.meta_ad_id` / `.test_id` / `.variation` (present in ad drawers today only as `ad_name`/`cell`/`concept`/`creative_asset_url`)

## Explicitly out of scope for this backlog

- **MST layers 2–7** (column/row/diagonal analysis, variable isolation, synergy, crossmap,
  strategic recommendations) — not a disclosure problem, the generation engine that would produce
  this data doesn't exist yet. Tracked separately, alongside the "IAP Loop fully executes"
  initiative, not here.
- **Strategy Map storage** — verified during Initiative 1 to have no gap; the live schema already
  has dedicated tables for it. No action needed.

## Suggested order for initiative 2+

1. `OverviewLoopHub.tsx` (closes the loop on the original Agency Overview screenshot) + `HomeView.tsx` (highest visibility).
2. `act/ActionQueueView.tsx` (same recommendation-card shape already fixed once in `ManagerOverview.tsx` — fastest win, pattern is proven).
3. `analysis/FindingsView.tsx` + `reports/ReportBuilderView.tsx` (highest violation counts, but need a real disclosure pass, not just a typography find-replace — budget more time here).
4. Everything else, roughly in rank order, confirming each batch with the user per their standing "confirm before each initiative" instruction.

## Progress

- `OverviewLoopHub.tsx` and `HomeView.tsx` — **done** (0 violations remaining in both). Fixed by
  mapping each raw pixel class to its nearest TYPE-scale size, matching the composed `TYPE.*`
  constants where the color/weight already matched, or the bare `text-label`/`text-caption`/
  `text-body`/`text-title`/`text-display` utility classes when preserving an existing custom
  color/weight override was more minimal-diff. 265 → 244 total violations remaining across 23 files.
  All 1095 metrix-iap tests still pass; typecheck clean.
- `act/ActionQueueView.tsx` — **done** (0 violations remaining). Same fix pattern. 244 -> 219 total
  violations remaining across 22 files.
