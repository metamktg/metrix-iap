# Spec: Creative Overview Tiles, Audience Visualization Module, Navigation Continuity

**Status:** Draft — ready for Claude Code implementation planning
**Origin:** Live code audit, Sep 2 2026 (pulled `metamktg/metrix-iap` @ `main`)
**Touches:** `components/creative/CreativeExpandDialog.tsx`, `components/metrics/KpiTile.tsx`, `components/charts/SharePieChart.tsx`, `components/metrics/MetricHoverPopover.tsx`, `lib/data/metricsCatalog.ts`, `pages/metrix/analysis/AudienceView.tsx`

This is three requests bundled into one PR per your consolidation preference. Each section below is independently shippable, but they share underlying primitives (see §1.4).

---

## 1. Creative Overview Tab — Blended Results Tile

### 1.1 Root cause of "Selected Events"

Traced to source, not guessed: when a creative/cell's performance spans more than one Meta result-event type (e.g. trial + purchase), several call sites collapse the events into one summed number and label it generically:

- `VariableDrilldownModal.tsx:150` — hardcodes `resultLabel: "selected events"`
- `ConceptFamilyView.tsx:87` and `IapLibraryView.tsx:337` — `` `${rows.length} events` `` when `rows.length > 1`

In every one of these, the **sum** reaches `CreativeExpandDialog`'s `OverviewTab` (`s.results`), but the **per-event breakdown** that produced that sum is discarded before it gets there. That breakdown is exactly what a "watermelon" split needs — it isn't missing data, it's data that gets thrown away one layer up.

### 1.2 The dropdown-tile primitive already exists — this dialog just isn't using it

`OverviewTab` (`CreativeExpandDialog.tsx:184-255`) hand-rolls a static 4-tile grid (Spend / Results / CPA / Link CTR) as a plain `.map()` over a fixed array — no dropdown, no metric catalog, no reuse of platform infrastructure.

Meanwhile `components/metrics/KpiTile.tsx` already implements exactly what you're asking for, platform-wide: a unified tile with a categorized metric-picker dropdown (`KpiMetricDropdown` — "Delivery & efficiency" section + "Results by event" section), info-hover disclosure, and `KpiTileRow` for rendering a full row with per-view persisted selections. This is already live on Ad Performance, Budget, and Analysis Overview.

**Recommendation: replace the hand-rolled grid with `KpiTileRow`, not build a second dropdown pattern.**

### 1.3 Getting the per-event split back for a single creative

`lib/data/metricsCatalog.ts` already models per-event results exactly this way — just at the account level, not yet at the single-cell level:

- `MetricSource.resultEvents: MetricResultEvent[]` — `{ key, label, results, spend }` per event type
- `buildMetricCatalog(source)` already derives `cpa_blended` ("spend ÷ all results") plus one `resultMetricId`/`resultCostMetricId` pair per event — this **is** the blended-vs-split model, already built, just not wired to a single creative's rows yet.
- `buildLibraryMetricCatalog(rows: CellPerformanceRow[])` is the closer cousin — it already takes raw per-(cell, result-event) rows and aggregates them, which is the same shape a single creative's multi-event rows would need.

**Gap to close:** `CreativeExpandDialog` currently receives only `perfRow: CellPerformanceRow | null` — a single row, already reduced via `primaryPerfRow()` in `creative-assembly.ts:45`, which is where the multi-event collapse actually happens. To get the split back, the dialog needs the **array** of this cell's rows (one per result event), not just the primary one. This is a data-plumbing change (pass `perfRows` filtered to `cell_id` instead of a pre-reduced `perfRow`), not a new computation — `buildLibraryMetricCatalog`'s aggregation logic already does the math once the rows arrive.

### 1.4 The "watermelon" pie-on-hover — also an existing pattern, not new

- `components/charts/SharePieChart.tsx` is a working donut chart taking `{name, value}[]` — the exact shape `resultEvents` already provides. This is your "watermelon" (colorful multi-slice donut).
- `components/metrics/MetricHoverPopover.tsx` already wraps a `KpiTile` child in a Radix `HoverCard` with touch-fallback (tap-to-toggle on devices without hover) and renders a chart on hover — currently a bar chart of top concepts, sourced from `cellRows: CellPerformanceRow[]`.

**Recommendation:** don't build a new hover mechanism. Use `MetricHoverPopover`'s existing wrapper (hover/touch handling is already solved and tested there), swap its internal chart for `SharePieChart` fed by this cell's `resultEvents` split, specifically for the blended-results tile — the other 3 tiles (Spend/CPA/Link CTR) don't need a pie since they aren't sums-of-heterogeneous-things.

### 1.5 Loading issue validation

You flagged "previous loading issues" for this view without specifics. `KpiTile.tsx` already has a defined loading state (`isRefetching` → pulsing skeleton bar, distinct from the "—" null-value glyph — see `KpiValue`, lines 382-404) and an honest-null convention (`unavailableNote`) so a stuck load and a genuine data absence render differently. Moving `OverviewTab` onto `KpiTileRow` inherits this handling automatically. If the loading issue is something else (e.g., stale data on tab switch, a race in `perfRow` fetch), I'd need a specific repro to diagnose rather than guess — flagging as open item below.

---

## 2. Audience Tab — Visualization Module

### 2.1 What's already there

`AudienceView.tsx` (1,034 lines) already implements 3 modes via a tab switcher (lines 174-176): **Cluster**, **Age**, **Ranked**. Cluster and Age share one rendering path (`PositioningMapCard`); Ranked has its own (`RankedListTab`). This is a real, working multi-view architecture already — not a blank page needing a visualization layer built from scratch.

### 2.2 Recommendation: extend the existing per-mode-tile pattern, don't build a second monolith

Given the codebase's own established direction — dedicated components per visualization type, composed under one tab switcher (this is the same shape as `CreativeExpandDialog`'s Overview/Demographics/Placements/Funnel tabs, and `KpiTile` vs `SharePieChart` vs `MetricHoverPopover` as separate reusable primitives rather than one do-everything component) — the "dedicated tiles per visualization type" option in your ask is the one that matches how the rest of the platform is actually built. A single highly-configurable mega-module would be a new architectural pattern fighting the grain of the codebase everywhere else audited so far.

**Concretely:** add new visualization types (table, additional map/cluster variants) as additional modes alongside Cluster/Age/Ranked, each its own component, sharing the existing segment/variable/filter state already threaded through `AudienceView` rather than each mode re-implementing its own filtering.

### 2.3 Open item

"Clearer communication" is a judgment call I don't want to guess at without your input on what specifically reads unclearly in the current Cluster/Age views (`PositioningMapCard`) — color scheme, label density, axis choices, something else. Worth a quick pass together on what's actually confusing before I spec a redesign of a component that's already fully functional.

---

## 3. Navigation Continuity — Sub-header Disappearing

### 3.1 What I checked

Audited every top-level routed page under `pages/metrix/` and its module subfolders (`analysis/`, `strategy/`, `mst/`, `creative/`, `reports/`, `exports/`, `action/`) for `ModuleHeader` usage. **Every real routed page has one** — the only files without it are shared utility/helper files (`rankSort.tsx`, `tables.tsx`, `strategyShared.tsx`, `exportsShared.tsx`) and dialog components (`AddAccountDialog.tsx`, `ConnectAccountDialogs.tsx`), which correctly don't own a page header. I also checked for the classic cause of a "vanishing" header — an early loading/error `return` that bypasses the header render before reaching it — and found no instance of that pattern across the codebase.

There **is** an existing, documented header-ownership rule (`shared.tsx:33-37`): a page composing tab-switched sub-views must own the single `ModuleHeader` itself, and sub-views mounted that way accept `renderHeader={false}` rather than rendering their own — specifically to prevent two stacked headers. This tells me the team has already hit and patched a version of this exact class of bug once.

### 3.2 Why I'm not proposing a fix yet

Static analysis came back clean at the structural level, which means the actual break you're seeing is likely something more specific — a particular route, a particular state (mid-navigation, a specific tab combination, a specific viewport), or something in an in-progress feature not yet caught by the `renderHeader={false}` convention. Guessing at a fix without a reproduction risks patching the wrong thing and missing the real one, per the standing accuracy bar on this project.

**What I need from you:** which page(s) or navigation path specifically shows the header disappearing — a screenshot mid-navigation, or "go to X, click Y, header's gone" would let me trace the actual component tree at that moment instead of auditing blind.

---

## 4. Summary of what's genuinely new work vs. reuse

| Item | New build | Reuse existing |
|---|---|---|
| Blended-results tile with dropdown | — | `KpiTile` / `KpiTileRow` |
| Per-event split data for one creative | Plumbing: pass `perfRows[]` instead of reduced `perfRow` | `buildLibraryMetricCatalog` aggregation logic |
| Watermelon pie-on-hover | — | `SharePieChart` + `MetricHoverPopover` wrapper |
| Audience visualization expansion | New view-mode components (table, etc.) | Existing tab-switcher shape, existing filter state |
| Navigation continuity fix | Pending repro | N/A |

---

## 5. Open items before build

1. Specific repro for the sub-header disappearing issue (page/path/state).
2. What specifically reads unclearly in the current Audience Cluster/Age charts — a concrete list of confusions, not a general redesign brief.
3. Confirm which of the 4 Overview tiles (beyond the blended-results one) should also get the dropdown — all 4, or just the one that was ambiguous? (Spend/CPA/Link CTR aren't blends of heterogeneous events, so the case for a pie-on-hover doesn't apply to them, but the dropdown-to-pick-a-different-metric could still be useful on all four for consistency with the rest of the platform.)
