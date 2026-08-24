# METRIX Data-Consistency Audit — Phase 1 (JSON utilization, triggers, null-handling)

**Status:** audit record (planning context, not specification)
**Date:** August 24, 2026
**Method:** the real AAFE upload set (four files, md5-verified out of `manual_imports`) was
replayed through the production parser/merge/coverage code; the live Supabase state for the
account was queried directly; every warning/flag emission point and its UI surfacing was
inventoried from source. Companion to `BUG_TRACKER.md` (per-bug log) and
`METRIX_Manual_Upload_Ingestion_Audit_Phase1.md` (upload-slot audit). Scope per
`METRIX_Phase1_Bug_Triage_and_Audit_Prompt.md` §2a/§2b/B2.

Fixes marked **[shipped]** landed on the Phase-1 stabilization branch in the same PR as this
document; items marked **Phase 2** or **Open** are triaged, not silently deferred.

---

## 1. Ground truth established this session (context for every finding)

- The B0 re-ingestion crash, the destroyed Jul 1–Aug 9 window, the wrong account total, the
  "wrong" segment spends, and the empty creative popup were **five separate defects**, not one:
  unnormalized `Day` formats (B0) **[shipped]**; misdated aggregate ad-summary (+41% total
  inflation) **[shipped]**; missing coverage propagation on a 2%-coverage demographic export
  **[shipped]**; a creative dialog call site that passed no data at all **[shipped]**; and a
  fuzzy creative→ad matcher confidently mapping seven creatives to an ad named "1"
  **[shipped]**. Details and evidence: `BUG_TRACKER.md` B0, BUG-02…BUG-10.
- The §0 single-root-cause hypothesis (Sheets ID corruption → join starvation) is **dead**:
  demo/placement/summary joins key on ad name + campaign + day, never `Ad ID`; ad names were
  intact; the demo export genuinely carries only $856.52 across 11 of 399 ads.

## 2. §2a — JSON structure utilization

### 2a.1 "Top variable —" placeholder on segment cards

The segment tiles' best-variable line reads segment→cell→variable attribution
(`computeSegmentAttribution`), which requires demographic rows carrying per-cell grain
(`cell_id` ≠ `ACCOUNT`) or variable-carrier columns. Manual accounts' demographic signal is
account-grain by design (the export has no per-creative split), so attribution is
**legitimately unavailable**, not an unpopulated engine field. `SegmentAttribution.available`
already models this with `unavailableReason` — the tile just renders "—" instead of the
reason. **Triage: Phase 2 Polish** — surface the existing `unavailableReason` (the honest
text already exists in `segment-analytics.ts`) instead of a bare dash. The §1.4 empty-reason
pattern shipped for the creative dialog is the template.

### 2a.2 Dashed CPA/CVR index columns in the age-detail table

`demographic_performance` stores no impressions (Meta's demographic export doesn't attribute
them per-row reliably), so CTR-family indices are not computable for preset windows —
legitimate-empty. CPA/CVR indices dash whenever the segment has zero results in the window —
also legitimate (0-results ÷ anything). **Triage: Phase 2 Polish** — attach the reason
(tooltip) per the B2 policy in §4 below; no engine change needed.

### 2a.3 Computed-but-unrendered fields / client-side recomputation

See the inventory tables appended in §5 (agent-verified with file:line evidence). Notable
Fix-Now-adjacent items:
- The engine persists `cpa`/`ctr_link_pct`/`cvr_link_pct`/`cpm` on every rollup row, while
  most client surfaces recompute ratios from raw fields. Recomputation is currently
  *consistent* (same formulas, null-on-zero-denominator conventions match), so this is a
  latent consistency risk, not an active bug. **Triage: Open (design decision)** — the
  canonical-source rule should be "client derives ratios from raw primitives via ONE shared
  helper (`deriveSegmentMetrics`/`derivedRates` parity)"; persisted ratio columns then become
  redundant and could be dropped in a Phase-2 schema pass. Do not mix the two per surface.
- `data_coverage` (new) is now the canonical coverage source; nothing recomputes it
  client-side by design.

### 2a.4 One canonical source per number — status after this session

| Number | Canonical source | Consumers aligned? |
| --- | --- | --- |
| Account total spend (manual accounts) | `ad_performance` daily rows (window-scoped) via analysis-summary API | **[shipped]** — aggregate ad-summary no longer fabricates daily rows; Meta's whole-period total surfaces separately as a cross-check warning, never blended |
| Segment (age×gender) spend | `demographic_performance` / demo signal rows | already aligned; now coverage-annotated |
| Coverage / "trustworthy enough to classify" | `manual_analysis_runs.coverage` (server-computed, one threshold) | **[shipped]** — badge suppression, banner, and run warnings all read the same object |
| Per-cell performance | `library_cell_performance` | unchanged; empty for accounts without cell-coded ad names or corrected creative mappings (honest) |

## 3. §2b — Discrepancy flags and triggers inventory

Classification per work order: (a) fires correctly + surfaces usefully → leave; (b) fires
correctly but surfaces generically/not at all → fix messaging/surfacing; (c) fires on
legitimate shapes → fix the trigger. Full emission-point inventory with file:line references
is in §5. Summary of triage decisions:

| Trigger | Class | Decision |
| --- | --- | --- |
| Delivery-coverage gate (all-blank spend/impressions) | (a) | leave — cause-differentiated messages already shipped in the ingestion-audit pass |
| Totals-row cross-validation (PR #122) | (a) | leave |
| Conversion-export suspicion + run-time confirmation gate | (a) | leave |
| Class-mismatch detection (demographic vs placement slots) | (a) | leave |
| XLSX ID-precision guard | (a) | leave; CSV path now has the same guard **[shipped]** |
| Day-format normalization warning | new | ships with B0; names count + format + remedy |
| `[Coverage]` under-threshold warning | new | ships with §1; names %, $, ad counts, cause, remedy |
| Aggregate ad-summary shape + totals-gap warnings | new | ships with BUG-05 fix |
| `[Re-run] Replaced N rows` supersede notice | new | ships with B0 |
| Demo-vs-placement "disparity" impression | (b)→fixed | there was no discrete trigger — the impression came from unexplained coverage asymmetry; the coverage layer is the cause-naming fix **[shipped]** |
| `cross_export_mismatch` account notes | data-borne | importer-bundle content (ecas), already cause-naming; no live trigger to change |
| `[Result type]` / `[Spend]` / `[Impressions]` unknown-row warnings | (b) | fires correctly, surfaces in run warnings; adequate post-coverage — leave |
| `objective_flags` (configured-but-absent / present-but-unconfigured) | (b) | verify surfacing (see §5 agent findings); if unrendered, wire into the run report — **Open, small** |

No trigger was blanket-suppressed; every true positive kept firing (honesty invariant).

## 4. B2 — Null-handling and missing-key policy

Recurring failure class: a consumer coalesces null to 0 (or renders "—") without recording
*why*, making "not applicable", "not measured", and "lost upstream" indistinguishable.
Policy going forward (enforced for new code in this PR, backfill triaged Phase 2):

1. **Engine emits explicitly.** Every field the schema declares is emitted always — null with
   a reason where a reason exists (`coverage.classes[].note`, `csv_warnings` categories,
   `AnalysisSurfaceCheck.emptyNote` are the models). The engine already warns when null
   spend/impressions rows are coalesced into totals (`[Spend]`/`[Impressions]` warnings).
2. **Client renders null as "—" only with an adjacent reason** (tooltip/caption/banner).
   Shipped examples: creative-dialog empty reasons, coverage banner, suppressed signal
   badges. Remaining silent dashes are grouped in §5 with (a)/(b)/(c) classification —
   group (b) items are Phase 2 Polish; any group (c) item found was opened as a tracker bug.
3. **No schema-version guessing.** `data_coverage` is nullable-by-contract for legacy runs
   (declared in OpenAPI, typed through codegen) rather than key-presence-sniffed.

## 5. Inventories (evidence appendix)

The full agent-verified inventories are recorded below.

### 5.1 Trigger/warning emission points

_(see BUG_TRACKER.md and the tables above for triage; this section lists raw emission points)_

### 5.1 Trigger/warning emission points

Full inventory (identifier → condition → surfacing → actionable?). Emission points are
grouped by stage; "CsvWarningsPanel" = the collapsed panel in `ManualAnalysisControls.tsx`.

**Upload-time (`routes/metrix.ts` + `ConnectAccountDialogs.tsx`):** invalid-base64 /
empty-file / too-large / header-but-no-rows / creative-type-mismatch / same-bytes-duplicate
(shipped this session) / client size pre-check / no-close-match + unlinked-creative +
ad-name-not-in-CSVs notices. All render in the upload dialog; parser warnings additionally
return as `upload_warnings` in a **dismissible, unpersisted** banner (see orphan list).

**XLSX conversion (`xlsxToCsv.ts`):** unreadable-workbook / no-worksheets / no-rows hard
errors; ID-precision-loss summary warning (actionable, well-worded). One silent gap: a
multi-sheet workbook picks the active/first visible sheet with **no message** (X5 — Open,
small: emit a one-line note naming the sheet used).

**CSV parser (`iapCsvParser.ts`):** 12 hard-error classes (empty file, class mismatch,
required columns missing/unresolved, blank required values, no data rows, delivery-coverage
gate with three cause-specific branches, and the five Day-format errors shipped with B0) +
15 warning classes (duplicate headers, auto-matched/inferred columns, missing
optional/core/supplementary columns, unknown-column suggestions, scientific-notation IDs
[shipped], totals-row cross-validation, multiple-totals-rows, conversion-export suspicion,
Day-normalization notice [shipped]).

**Analysis-time (`analysisEngine.ts`):** 9 blocking gates (conversion-export 409
confirmation, duplicate-class, both-reports-required, non-manual account, run-in-progress,
per-file parse errors, empty window, and the two new pre-write consistency guards) + 10
persisted warning classes (per-file passthroughs, aggregate-ad-summary [shipped], coverage
notes [shipped], totals-gap [shipped], unknown result-type/spend/impressions, device
coverage zero/partial, re-run-replaced [shipped]) + 2 objective flags + the 5-part
completeness check.

**Importer (`scripts/.../import.ts`):** quality flags (incl. `cross_export_mismatch`) and
anomalies land in `data_quality_flags` → AdPerformanceView SignalCards ("Watch"/"Act now"
tiers); account-mismatch/reconciliation failures throw; several checks are **console-only**
(ignored-export-ad-id drift, unmatched export ad names, integrity failure) — acceptable for
an operator-run CLI, noted for completeness.

**Key surfacing gaps found (triaged):**

| Gap | Triage |
| --- | --- |
| `csv_warnings` render ONLY in ManualAnalysisControls' collapsed panel, only for the LATEST run; runs started from LoopCommandChain/TaskTray never show them; AnalysisHistoryView shows none | **Open (§1-class, next session):** render warnings wherever runs are started/listed |
| `upload_warnings` are dismissible and never persisted on the `manual_imports` row — unrecoverable after dialog close until a run re-emits them | **Open, small:** persist alongside `mapping_summary` |
| `objectives_assessed` persisted + typed, rendered nowhere | **Phase 2 Polish** |
| `AnalysisHistoryView` renders a per-run "Data integrity" block from `run.reconciliation[]` — a field NOTHING server-side ever writes (`import_metric_reconciliation` has zero writers). Permanently empty dead UI | **Fix-Now-next (misleading dead surface):** remove the block + orphan field, or implement the writer; tracked as BUG-14 |
| `ListenCommandCenter` declares Alerts sourced from `iap.data_quality[]` but `AlertsView` reads `data_caveat` instead — importer quality flags never reach the Alerts page | **Open (lineage mismatch):** tracked as BUG-15 |
| `ImportConfidenceReport` duplicates `SIGNAL_WEIGHTS` client-side by hand (grade drifts silently if the server list changes) | **Phase 2:** export weights through the API or a shared package |
| `CsvWarningsPanel` picks its headline by substring-matching warning TEXT ("Reduced confidence"/"core metric") — rewording the parser message silently demotes the headline | **Phase 2:** carry a machine `severity` field on warnings instead of prose-matching |
| `metrixSeedAssembly` mapped-ad-names zero-match warning is server-log-only; the user just sees a "No asset" placeholder | folded into the §1.4 empty-reason pattern backlog |

### 5.2 JSON utilization details

### 5.2 JSON utilization details

**"Top variable —" (2a.1) — full chain, verified:** `AvatarsView` `bestVariableCode` ←
`computeSegmentAttribution` ← cell-grain demographic rows (drops `cell_id='ACCOUNT'`).
Manual accounts write ONLY ACCOUNT-grain demo signal (analysisEngine `MANUAL_DEMO_AD_NAME` /
`cell_id:"ACCOUNT"`), carry no `*_variable` keys, never write `library_cell_performance`
(importer-only), and uncoded ad names skip concept/variable rollups — attribution is
legitimately unavailable. Defect was presentational: `unavailableReason` was computed and
DISCARDED at the tile. **[shipped]** — the dash now carries the reason as a tooltip.

**Dashed indices (2a.2) — three distinct causes:** (a) CTR-family metrics are structurally
unavailable under presets because `demographic_performance` stores no impressions AND the
client adapter zero-fills them — which also made `assessSegmentSignal` flag every segment
"Only 0 impressions", a fabricated warning **[shipped: the impressions heuristic now
applies only when the scoped source carries impressions]**; (b) zero-results CPA — honest;
(c) strict-null propagation: one member segment missing a field nulls the whole age band
(`combineSegmentTotals`), and null cpa/cvr silently EXCLUDES segments from clustering —
Cluster tab can render zero clusters while Age tab shows dashes. **Phase 2:** per-band
coverage note; reconsider exclude-vs-flag in `buildAudienceClusters`.

**Engine-persisted but unread fields (all verified by select-list + client grep):**

| Field(s) | Status |
| --- | --- |
| `ad_performance.cpa/ctr_link_pct/cvr_link_pct/cpm` | persisted, never selected — every consumer re-derives. **Open (design):** drop columns or make them the canonical read; do not keep both |
| `ad_performance.confidence` | never written on the manual path — dead column |
| `ad_performance.extra_metrics`, `ad_creative_metadata` | captured (incl. ad body/headline/CTA metadata!) and never surfaced anywhere. **Phase 2 opportunity:** the creative dialog Overview tab wants exactly this metadata |
| `ad_performance.reach/clicks_all` | in bottom-line totals only; dropped from per-ad stats — no ad-level surface can show them |
| `concept_performance` Stage-2 fields (`buying_intent_score`, `performance_lift_vs_baseline`, `performance_tier`, `confidence_level`) | computed + persisted + shipped on `analysis.concept_rollup`, but `ConceptRollupRow` (client type) omits all four and `FindingsView` reads `concept_intelligence` (importer-only table) instead — **the manual engine's Stage-2 tier work lands nowhere.** Tracked as BUG-16 (Fix-Now-next: extend the client type + FindingsView source fallback) |
| `demographic_signal.payload` rates (`CPA_result` etc.) | read only by CreativeExpandDialog (which mis-reads them last-row-wins); every audience surface recomputes |
| `platform_performance` delivery-basis rows | written every run, **no read path at all** (seed reads only conversion-basis rows; platform dimension served from placement_signal payloads) — dead writes |
| `variable_performance.payload` Reach/Impressions/Clicks(all) hard-coded zeros | summed into rollups as real zeros by `creative-dna.ts`/`variable-drilldown.ts` — **Phase 2:** null them or exclude from sums |

**Client-side recomputation of server-computed numbers (canonical-source violations):**

| # | Server truth | Client recompute | Triage |
| --- | --- | --- | --- |
| 1 | demo signal payload rates / `demographic_performance.cpa,cvr` | `deriveSegmentMetrics` everywhere | Accept client derivation as canonical (it is spend-weighted-correct); stop reading payload rates in CreativeExpandDialog (its last-row-wins read is wrong) — **Open, small** |
| 2 | persisted ad_performance rate columns | server itself re-derives at read time | fold into the drop-or-canonicalize decision above |
| 3 | `campaign_summary` totals (with account_totals ceiling + CTR guard) | `AnalysisOverview` re-sums `performance_by_cell`, bypassing BOTH guards | **Fix-Now-next (BUG-17):** read the canonical rollup; on manual accounts the cell sum is 0 today |
| 4 | placement_signal payload CPA/CTR | `PlacementsView.rollupPlacements` + a near-duplicate in `AnalysisOverview` | consolidate to one helper — **Phase 2** |
| 5 | `concept_performance.performance_lift_vs_baseline/tier` (CPA-lift vs blended baseline) | `AdPerformanceView.computeTierRows` computes a DIFFERENT lift (CVR vs unweighted mean — an average-of-averages the codebase elsewhere forbids) | **Fix-Now-next (BUG-18):** one tier/lift definition; prefer the engine's |
| 6 | `concept_performance.cpa/cvr` blends | `ConceptFamilyView` re-derives; took group CTR from `rows[0]` | rows[0] defect **[shipped]**; consolidation Phase 2 |
| 7 | demo payload CPA | `AnalysisOverview.buildDemoHeatmap` recomputes | fold into #1 decision |

### 5.3 Placeholder/null render sites

### 5.3 Placeholder/null render sites

**Convention state:** no single documented null convention exists. Two placeholder
vocabularies coexist — the legacy `"—"` family (`normalize.ts` `fmtMetric`/`fmtCount`,
`shared.tsx` `fmtUSD`/`fmtNum`/`fmtPct`, plus at least six independent local
`null → "—"` implementations) and the honest `"n/a"`-with-reason family
(`kpiBreakdown.ts`, `deepDive.ts`, `metricConceptUtils.ts` — documented "never zero" rule +
`note` fields). They collide inside single table rows (`AdPerformanceView.tsx:592-598`).
`normalize.ts` also overloads `"—"` as the label for `ConfidenceLevel: "unknown"`.
Best-in-class pattern to standardize on: `segmentMetricsCatalog.ts` `availability` +
`unavailableReason` rendered as a tooltip-wrapped dash (`SegmentDrilldownModal.tsx:303-315`).
Estimated ~173 `"—"` + ~29 `"n/a"` literal render sites; ~95 on primary surfaces.
Split ≈ (a) 25% reasoned / (b) 65% silent-legitimate / (c) 10% potential swallowed error.

**Group (a) — legitimate-empty with reason (the template):** segment metric tooltips
(`SegmentDrilldownModal`), creative-dialog empty reasons (`creative-empty-reasons.ts`,
shipped this session), IAP Library tile `noConvSub` reasons, deep-dive funnel omission
notes, Ad Performance "no results"/"Not scored yet" states, cross-map "Untested" cells,
KPI drilldown `note` fields, the DataCoverageBanner (shipped).

**Group (b) — legitimate-empty but silent (bulk, ~65%):**
- `KpiStat` (rankSort.tsx:282-303) has NO disclosure slot — every dash it renders is
  structurally unexplainable (AudienceView CPA/CVR indices, per-segment stats).
- `KpiTile` suppresses its ⓘ when a metric has no `sub`; the six base metrics
  (spend/impressions/reach/clicks/link_clicks/link_ctr) carry none — hero tiles render bare
  dashes with the info affordance absent (`KpiTile.tsx:149-156,197`;
  `metricsCatalog.ts:168-173`).
- `KpiTile` refetch state renders the SAME "—" glyph as null — loading is
  indistinguishable from data-loss (`KpiTile.tsx:307-308`).
- Dozens of StatGrid/MetricTile dashes across Avatars/Placements/IapLibrary/
  AnalysisOverview/MST views (file:line list preserved in the session's agent report).
- `AvatarsView.tsx:640-660` "Creative combos": two disjoint row sets (concept rows with
  `placement:"—"`, placement rows with `concept:"—"`) unioned under a header promising a
  concept×placement×platform cross-tab that is never computed — dashes render as missing
  data when they mark a join that never existed.

**Group (c) — potential swallowed error:**
- Catalog-lookup miss renders the same dash as a reasoned absence
  (`SegmentDrilldownModal.tsx:303`; `KpiTile.tsx:147` silently vanishes;
  `deepDive.ts:144`).
- `KpiDrilldownModal.tsx:337-345` reads API totals via `as any` — a key drift yields NaN
  and the "no data" note never fires.
- Creative card stat-strip dashes on join-miss: the join-failure signal exists
  (`qaMappingStatus === "library_only_no_export_match"`) but renders as a detached QA badge,
  not attached to the dashes it explains.
- Untyped index-signature reads in `run-scope.ts:172` / `date-scope.ts:105` — a key rename
  silently nulls rows out of scope.

**"0" vs "unknown" coalescing defects (fabricated measurements):**
1. `metricConceptUtils.ts` `link_ctr` returned a measured `0` on zero impressions while
   every sibling ratio returns null — plotted never-delivered concepts as real "0.00%"
   worst performers. **[shipped]** — now null.
2. `AudienceView.tsx` group KPI row rendered unknown spend as "$0" beside "—" results.
   **[shipped]** — now "—".
3. `IapLibraryView.tsx` rendered unknown results as a measured 0. **[shipped]** — now "—".
4. `metricsCatalog.ts:263-270` treats any-row-present as full coverage and sums
   `?? 0` — contradicts `segment-analytics.ts` `sumStrict` (null if ANY row missing). Two
   aggregation libraries, opposite policies, same surfaces. **Open — needs one policy**
   (recommend sumStrict semantics + per-metric coverage note; Phase 2, coordinated change).
5. `date-scope.ts` `sumInRange` coalesces to 0 and returns `number` — an all-null rollup
   renders "$0 spend" tiles asserted as range-scoped truth. **Phase 2** (signature ripple).
6. `summaryTrends.ts:29`, `reportExport.ts:264-265`, `deepDive.ts:304-318` partial-coverage
   sums — **Phase 2**, same policy decision as #4.
7. Inverse defect (real 0 rendered as unknown): `EngagementFunnelView.tsx:68` `if (!a || !b)`
   nulls a measured 0 numerator; `reach > 0 ? … : "—"` sites conflate measured-zero with
   unknown. **Phase 2 Polish.**
8. `CreativeExpandDialog.tsx` placement CPA bar uses `cpa ?? 0` for bar WIDTH — an
   unknown-CPA placement draws a zero-length bar visually reading "best CPA" (label
   correctly dashes). **Phase 2 Polish.**

**Top silent-dash offenders (Phase 2 priority order):** AvatarsView "Creative combos"
pseudo-cross-tab; AudienceView group KPI rows (KpiStat disclosure slot); hero KpiTiles
(base metrics without `sub` + loading-vs-null glyph); creative card stat strip
(attach the existing join-miss reason); metric hover chart (fixed).
