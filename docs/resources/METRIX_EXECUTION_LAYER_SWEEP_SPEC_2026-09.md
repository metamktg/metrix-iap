# Execution Layer sweep, the specification (2026-09-05)

**Status:** for owner review before the first vertical slice. Nothing in this document is built.
**Supersedes:** the "Command Center" consistency notes in `METRIX_UI_UX_OVERHAUL_2026-09.md` §8 and the
`METRIX_ASSESSMENT_ROUND_2026-09-04.md` §7 queue, both closed.
**Sources:** `FINAL_RECONCILIATION_for_claude_code.md` (items 1 to 11, every answer confirmed on
2026-09-05), `REFERENCE_screenshot_audit_batch_sep5.md` (items 1 to 10),
`SPEC_ad_id_anchored_creative_mapping.md`, `SPEC_strategy_map_disclosure_optimization.md`,
`SPEC_creative_analysis_module_upgrades.md`, `watermelon-ui-claude-code-reference-sheet.md`, the
fourteen screenshots, and the live code on `main` at dc91919 (every file named below was read, not
inferred).

## 0. Read first

**Reviewed and approved by the owner on 2026-09-05** with two corrections, both applied in place:
§7.7 states the retention distinction explicitly (evidence rows forever, the two-generation window is
a rebuild-cache limit on derived rollups only) and §5.1 frames the base-run control around the manual
trigger (the user runs Strategy, sees and can change what it is based on, and the result is what
reads as current). Slice 1 proceeds on this text.

- **The execution rule.** This spec is written with every backend-driven surface designed in before any
  page is redrawn (§4 to §7). Implementation is then one vertical slice per feature, UI and backend
  together (§10). Neither a UI-only pass nor a backend-first pass: the first would lock layouts around
  guesses about run state, the second would drop the surfaces the backend work needs.
- **The bar.** 95% confidence, verified against live code. Where a decision is still the owner's it is
  listed in §12, not assumed.
- **The word "Execution Layer"** names the five stage pages (Analysis, Strategy, Creative, MST, and the
  Listen, Reports, Exports siblings). The rename is file-level only: `*CommandCenter.tsx` becomes
  `*ExecutionLayer.tsx` with their tests and comments; user-facing titles stay Analysis, Strategy,
  Creative, MST (reconciliation item 11, answer 9).
- **What the package described that `main` no longer has.** The sidebar's single-click accordion and
  220 ms double-click shortcut were replaced on 2026-09-03: a click on a section navigates at once and
  the branch is a dwell flyout (`Sidebar.tsx`, `OPEN_DWELL_MS` 700, `CLOSE_GRACE_MS` 260). The
  recommendation tile title is clipped by `deriveLabel(title, 68)` on the tile, not by the stored text.
  The pages already share one column width (`max-w-5xl`) and the same header, spine and explore grid.
  What they do not share is a shell: each page composes those parts by hand, in a different order, with
  its own run card, its own history card and its own banner rules. That is what §3 fixes.

## 1. Non-regression list (explicit, tested)

Everything below stays as it is, and the gates that prove it stay green on every slice.

1. **Each stage page is the only place its run can be started.** Analysis: `AnalysisControls` with the
   `ActionSlider` "Slide to re-run analysis" (`ManualAnalysisControls.tsx`). Strategy and Creative:
   `GenerateButton` through `useGenerationRun` (`GenerationControls.tsx`). MST has no run. Nothing runs
   between stages automatically (reconciliation item 4); the one exception, a deconstructed creative
   slotting into the local library, changes only the next run's inputs and is stated as such on the
   Creative page.
2. **The design system.** Tokens, the `TYPE` ramp and the `.text-*` role classes, the disclosure rulebook
   in `shared.tsx` (`deriveLabel`, `DetailReveal`, `DenseText`), `KpiTile` and `KpiTileRow`,
   `SectionCard`, `ModuleHeader`, `HubNavGrid`, `StageLoopHub`, `RecommendationSlider` and its drawer,
   the Sonner toasts. Reused, never reinvented.
3. **Accessibility.** Focus moved to the arriving page and named by its `h1`, focus trapping in dialogs
   and drawers, reduced motion zeroing every entrance, keyboard operation of the rail, the sidebar
   branch, the slider and the tabs, `aria` names on every icon control.
4. **The navigation contract.** `navTree.ts` is the one declaration; a click on a section navigates;
   the branch opens on dwell, focus or first tap; Escape, Left and blur fold it. The 2026-09-03 tests
   (`sidebar-nav.test.tsx`, `sidebar-operability.test.tsx`) stay green.
5. **The gates.** `check:friction` defects at zero and its ratchets never raised without a written
   reason in the PR, `check:interaction`, `check:disclosure-rulebook`, `check:locator-ambiguity`,
   `check:unexplained-dashes`, `check:chart-geometry`, `check:accessible-names`, the crawl at 1440 and
   390 px, the smokes (`smoke:metrix-iap-first-run` walks the first-run journey these pages carry).
6. **The tests that pin these pages today.** `loop-gates-wait-for-status.test.tsx`,
   `imported-account-empty-states.test.tsx`, `analysis-run-error-message.test.tsx`,
   `mst-command-center-fixes.test.tsx`, `creative-command-center-canvas-fidelity.test.tsx`,
   `LoopCommandChain-progress-label.test.tsx`, the generation progress tests. They move with the
   renames and keep their assertions.
7. **No em dashes in UI copy**, the house " · " for label joins, "–" for a null value.

## 2. What changes, in one list

1. One shell, `StageLayout`, renders every Execution Layer page (§3).
2. Every stage page carries a status hub: staged inputs, the run in flight, the last completed run, a
   failed run, each with what it means for the reader (§4).
3. Strategy and Creative carry a "base this run on" control; Analysis shows which staged files the next
   run will read; MST shows which brief set it reads (§5).
4. One contextual notice per page, in the hub, never a full-width banner; the staged-creatives nudge
   appears once, on Creative (§3.4).
5. The flyout's dismissal feel: a bridge between the row and the branch, a longer grace when the pointer
   leaves toward the branch (§6).
6. The backend-driven surfaces designed in now: reconciliation disclosure, filename-independent intake,
   ROAS and purchase value, ad-id anchored mapping, the pattern-miner review queue, evidence on demand,
   safe re-runs (§7).
7. The screenshot-audit items placed on their pages (§8).
8. The two prior specs applied on their pages (§9).

## 3. The shell: `StageLayout`

**File:** `artifacts/metrix-iap/src/pages/metrix/StageLayout.tsx`. Every Execution Layer page composes
it; the page supplies content, the shell supplies order, width and the slots.

### 3.1 Anatomy, top to bottom

| Slot | What renders | Source today |
|---|---|---|
| Header | `ModuleHeader` with the stage eyebrow, title, account name, one-line purpose, the page's right-hand controls | exists |
| Spine | `StageLoopHub` with the six numbered stages | exists |
| Pages | `HubNavStrip`, the stage's subpages as chips, each page's purpose and lineage behind an info tooltip (owner, 2026-09-05: a reader landing on the centre reaches the page they came for before the run card) | new |
| Notice | at most one contextual notice, inline-toast style, dismissible where it is a nudge | new policy, §3.4 |
| Status hub | the stage's runs: inputs, in flight, last completed, failed (§4) | new |
| Execution card | the run trigger and its parameters, one `SectionCard` per stage | exists, moved into the slot |
| Direction | `RecommendationSlider` for the stage, absent when the stage has none | exists |
| Content | the stage's own modules (briefs list, MST matrix, Listen signals) | exists |

Fixed rules: one column, `max-w-5xl`, `px-6 py-5 space-y-4`; the execution card always sits above the
direction rail (a reader looks for the button before the advice); the status hub always sits between
the spine and the execution card so the run's state is read before the run is started again; the pages
strip sits under the spine and there is no explore grid at the foot of a shell page. `HubNavGrid`, still
rendered by the pages not yet on the shell, carries the same disclosure: the face is the icon, the name
and the arrow, the sentence and the lineage sit behind the info tooltip.

### 3.2 Props

```ts
interface StageLayoutProps {
  stage: "listen" | "analysis" | "strategy" | "creative" | "mst" | "reports" | "exports";
  account: AdAccount | null;            // null on the agency-wide Listen and Reports
  status: ReturnType<typeof useStageStatus>;
  notice?: React.ReactNode;             // at most one; the shell renders the first and warns in dev on a second
  hub: StatusHubModel;                  // §4
  execution?: React.ReactNode;          // the run card; absent on MST, Listen, Exports
  recommendations?: Recommendation[];   // the stage's rail
  explore: HubNavItem[];
  children?: React.ReactNode;           // stage content
  headerRight?: React.ReactNode;
}
```

### 3.3 The gates stay outside the shell

`ModuleScopeGate` (account selected, configured or `allowUnconfigured`) and `PrerequisiteGate` (the
stage's precondition) keep their current semantics and their `loading` placeholder; the shell renders
inside them, so a gated page still shows the header, the spine and the hub's honest "nothing yet" row.

### 3.4 Notice policy

- One notice per page. Candidates today: the staged-creatives nudge (`CreativeNextStepNudge`), the
  creative-source nudge (`CreativeSourceNudge`), the seed-refresh banner, the global running strip.
- The staged-creatives nudge renders on Creative only, once. On Analysis the same fact is one line in the
  status hub's inputs row ("2 creatives staged, not deconstructed · Creative") with a link, not a banner.
- The global running strip (`GlobalRunningBanner`) stays global; the hub is its per-page detail.
- Warnings from a run are a count with a disclosure in the hub's last-completed row, never a box of
  their own on the page. The run's `csv_warnings` open in the existing details drawer.
- Watermelon reference: `inline-toast` for the notice's arrival and dismissal (opacity and 4 px rise,
  160 ms, none under reduced motion); no keyframes.

## 4. The status hub

**File:** `components/loop/StatusHub.tsx`, one component, one model, four rows. Watermelon reference:
`labeled-progress-indicator` for the in-flight row (a labelled bar whose label is the stage the run is
in, the percent only when the engine reports one); `inline-toast` for the completion transition.

### 4.1 Model

```ts
interface StatusHubModel {
  inputs: { label: string; detail?: string; to?: string }[];   // what the next run will read
  inFlight: null | {
    runId: string; startedAt: string; stage: string; percent: number | null;
    elapsedSeconds: number; etaSeconds: number | null;         // null means "no comparable run yet"
  };
  lastCompleted: null | {
    runId: string; finishedAt: string; summary: string;        // "2026-08-04 → 09-02 · 21,130 rows"
    warnings: number; detailsTo?: string;
  };
  failed: null | { runId: string; finishedAt: string; message: string; retained: string };
  history: { to: string; count: number };
}
```

### 4.2 Per stage

| Stage | inputs | inFlight source | lastCompleted source | failed.retained |
|---|---|---|---|---|
| Analysis | staged imports by detected class (§7.2), the window (the run's objectives stay on the run card as its parameter line: the business model is an analysis lens, `check:cohort-reach`) | `listAnalysisRuns` (polled at 3 s while running, exists) with `progress_pct` and `progress_stage` | the latest `success` run: dates, `rows_ingested`, warning count, reconciliation state | "The last successful run's data is still shown" (§7.7) |
| Strategy | the base Analysis run(s) from the selector (§5) | `getLatestGenerationRun(strategy)` (exists) with `progress_stage` | the latest success: pillars, hypotheses, model, `source_analysis_run_ids` | "The current strategy is unchanged" |
| Creative | the base Strategy run from the selector (§5), staged creatives and their deconstruction state | `getLatestGenerationRun(briefs)` | the latest success: brief count by format, `source_generation_run_id` (new, §5.2) | "The current briefs are unchanged" |
| MST | the brief set in use (latest successful briefs run) and matrix readiness | none | none | none |
| Reports | accounts with analysis data | none | last report generated (`listWorkspaceReports`, exists) | none |
| Listen, Exports | none | none | none | none |

### 4.3 ETA rule

An ETA appears only from evidence: for Analysis, the median duration of this account's prior successful
runs whose `rows_ingested` is within 50% of the current run's expected rows (from the staged files'
row counts); for Strategy and Briefs, the median of the account's prior successful runs of that kind,
falling back to the measured platform medians already in `GenerationControls.tsx` (210 s). With no
comparable run the row shows stage and elapsed and no ETA. Every ETA reads "usually about N min", never
a countdown. Backend requirement: `stage_timings` on runs (§7.7) so the estimate can name the stage
that is taking longer than usual.

### 4.4 Copy

Stage labels come from the engine's `progress_stage` through `humanizeDiagnosis` where they are codes.
The four rows use the loop's vocabulary: Staged · Running · Completed · Failed. No sentence on the first
layer; the run's warnings and notes sit behind the existing disclosure.

## 5. The "base this run on" control

### 5.1 Strategy

The server already accepts `analysis_run_ids` or `analysis_all_time` (`GenerateStrategyInput`) and
stores `source_analysis_run_ids` on the generation run; the engine reads rows of the selected runs or
untagged rows. The Strategy page does not expose it: `useGenerationRun.start()` sends
`analysis_all_time: true`. The Account Overview's `LoopCommandChain` does expose a selector. So:

- **Strategy is manually executed, never automatic** (owner correction, 2026-09-05). Nothing runs
  between stages on its own: a strategy run starts only when the user presses Generate on the Strategy
  page. That manual run is built on whichever Analysis run is selected in the base-run picker, which
  defaults to the latest successful Analysis run; the user sees what the run will be based on and can
  change it before pressing the button; the strategy run that results is the one the interface reflects
  as the account's current strategy. This is not a background default switching underneath anyone:
  changing the default of the picker changes what the NEXT manual run is built on, and changes nothing
  until the user runs it. Slice 3's PR description states it in exactly these terms.
- `BaseRunPicker` wraps the existing `RunScopePicker` (`components/analysis/RunSelector.tsx`, all time
  or up to three runs, persisted per account per browser through `usePersistedRunScope`) and sits in the
  Strategy execution card above the button. Default: the latest successful Analysis run, not all time.
- Combining several runs (reconciliation item 2, answer 5): the evidence pack is the union of the
  selected runs' rows, and where two selected runs cover the same dates the later run's rows supersede
  the earlier run's for those dates. The engine change is in `generationEngine.ts`'s run-scoped reads
  (today: `manual_analysis_run_id in (…)`, no superseding). The card shows the effective window and the
  runs used, and the same line is written into the run record so History can show what a strategy was
  built from.
- The Account Overview's chain keeps its selector; both read and write the same persisted selection.

### 5.2 Creative (briefs)

Briefs are generated from "the current generated set if one exists, else the imported set"
(`storedPillars()`), with no run parameter. New: `GenerateBriefsInput { strategy_run_id }`, default the
latest successful Strategy run, exactly one, no combining (answer 5). The engine reads that run's
pillars; the run record gains `source_generation_run_id`. The picker is a single-select list of
successful Strategy runs (date, model, pillar count), which needs a generation-run list endpoint:
`listGenerationRuns(accountId, kind)` (today only the latest exists; Strategy › History reads the seed's
`generation_runs`, which the seed already carries).

The existing currency rule stays: a briefs run counts as current only when it started after the latest
successful strategy run; the hub says when the current briefs predate the current strategy.

### 5.3 MST

No run to base. The hub names the brief set in use and links to the Creative page.

## 6. Navigation and the flyout

- **Click model:** unchanged (a click navigates). The reference package's Item 10.3 describes the
  superseded mechanism; the landing-page quality it asks for is what §3 delivers.
- **Dismissal feel (item 11):** the branch folds 260 ms after the pointer leaves the sidebar, and it
  closes when the pointer crosses the gap between the row and the branch at a diagonal. Fix: a bridge
  region between the row's right edge and the branch counts as "inside"; while the pointer moves toward
  the branch (its x increases and its y stays within the branch's band, checked on `pointermove`), the
  grace is 320 ms; leaving upward or downward keeps 260 ms. Reference: Watermelon
  `morphing-sidebar-controls` for the follow and fold timing character only.
- **Testing:** `sidebar-nav.test.tsx` gains three cases with fake timers (diagonal path into the branch
  stays open, vertical exit folds at 260 ms, bridge hover counts as inside), and the browser crawl
  records the branch at both widths. The collapsed rail keeps its own path; the 2026-09-03 rail branch
  is not the mechanism that was removed earlier, and this change does not touch its scroll handling.

## 7. Backend-driven surfaces, designed in now

Each entry states what the reader sees, what the backend provides, and the schema it needs. The schema
additions are all additive and go through the post-merge hook.

### 7.1 Reconciliation disclosure (item 6)

Reader: the Reconciliation panel on Analysis shows the control composition once ("Master: Ad Manager
Summary per Ad ID, 1,494 ads · Day-level rows for 257 ads the summary does not carry · Totals row for
0"), each breakdown section (demographic, placement, copy) stays its own section with its own coverage
badge (reconciled plainly, partial with a quiet badge, never a warning wall), and the ledger detail names
the control per ad and any one-day shave with its reason. Backend: `buildTruth` becomes per-ad (master
where the summary carries the ad, day-level rows summed to the window for the others, one control per
ad), the one-day exclusion rule (objective failure only, the 1% band, recorded in run notes and the
summary's detail, never a warning count), the scored candidate choice when no summary exists (Ad-ID
coverage, period fit, totals-row agreement, header conflicts, overlap loss; winner and runner-up
recorded), every pivot row anchored on `ad_id`. Schema: `reconciliation_summary` gains
`control_composition` and `exclusions`; `reconciliation_ledger` gains `control_source` per row.
Docs: spec §2a and §6a amended (more than two pivot exports; the waterfall), replit.md, the
`metrix-data-bundle-prep` skill, the first-run checklist copy.

### 7.2 Filename-independent intake (item 6, answer 4)

Reader: drops files; each staged row shows its detected class ("Ad Manager Summary · per Ad ID · whole
period", "Demographic pivot · age × gender · daily") and why; the override control appears only when the
classifier reports ambiguity. The six `kind` slots disappear from the dialogs and the first-run
checklist counts delivery reports from detected classes. Backend: `detectReportGrain` runs without a
declared class; `manual_imports.kind` holds the detected class; the "wrong slot" 422s become
"ambiguous, choose" 409s with the candidates. Schema: `manual_imports.detection` jsonb (candidates,
reasons).

### 7.3 ROAS and purchase value (item 8, answer 7)

Reader: where the account's data carries purchase value, ROAS, purchase value and cost per purchase
appear in the existing `KpiTile` pickers, the Analysis charts, Results by event, breakdowns and the
recommendation tiles; where it does not, nothing changes and cost per result stays the terminal metric.
Backend: `ad_performance` gains `purchase_value` (the CSV spec already recognises the Meta columns and
the Graph client already requests `action_values`, `purchase_roas`, `website_purchase_roas`); the seed
and `metricsCatalog` carry the three metrics gated on presence; the rule text in CLAUDE.md,
`check:cohort-reach` and the register says "objective-gated, never a default". Past strategy outputs are
reviewed for ROAS impact before the generation prompts change.

### 7.4 Ad-id anchored mapping (the Aug 29 spec)

Reader: the upload dialog's "Matched by filename similarity" chip becomes a confidence band (High
auto-mapped, Medium mapped and queued for review, Unmapped held), the IAP Library's "Ads without creative
cells" count reads from the map. Backend: `ad_id_concept_map` (ad_id, concept_id, assigned_at,
assignment_method), assignment at first encounter, image and video name matching first, ad name second,
scored, file-type gate, campaign and ad-set tie-break, backfill for existing accounts.

### 7.5 Pattern-miner review queue (reference item 1)

Reader: a "Naming patterns" content type in the existing Deck / Task Tray / Dismissed convention with
approve and dismiss; approved patterns land in the Local Client Library cross-referenced to the Global
Master Variable taxonomy. Backend: the miner (three classes, normalisation before dedup, concept-code
regex excluded), `naming_pattern_candidates` table, approval writes to the library. The registry-family
mapping stays the owner's separate pass.

### 7.6 Evidence on demand (task 22)

Reader: the Demographics, Placements, Funnel and Evidence tabs, the Reconciliation panel and the Audience
coverage tile load their rows when opened, with the `KpiTile` skeleton state, never a blank. Backend: the
seed carries summaries and evidence states; per-account endpoints page the rows by keyset with filters
(breakdown, ad, variable); per-account cache keys and invalidation.

### 7.7 Safe re-runs and stage timings (H1, task 23's instrument)

Reader: a failed run's row says the last successful run's data is still shown; the hub's ETA names the
stage. Backend: rollup rows keyed by run with the account's current successful run pointer
(`ad_accounts.current_analysis_run_id`), readers scope to it, a failed run deletes only its own rows,
and the previous run's rollup rows are dropped only after the new run succeeds;
`manual_analysis_runs.stage_timings` jsonb written by `updateProgress`.

**Retention, stated so it cannot be misread (owner correction, 2026-09-05).** Two different kinds of
row, two different rules, and the second is not an exception to the first:

- **Evidence rows are retained forever, every run, no exception.** `ad_breakdown_performance`,
  `reconciliation_ledger`, `variable_segment_performance` and `variable_evidence` keep one set of rows
  per run for as long as the run exists (reconciliation item 2, answer 2). Nothing in this section,
  in slice 2, or in any later slice deletes a run's evidence rows; a failed run deletes only the rows
  it wrote itself, and a successful run never touches another run's.
- **Derived rollup tables keep two generations, and that is a rebuild-cache limit, not a
  data-retention limit.** `ad_performance`, `demographic_performance`, `placement_performance`,
  `platform_performance`, `device_performance` and the run-keyed `concept_rollup` /
  `v3_variable_performance` rows are computed from the staged files and the retained evidence; they
  can always be rebuilt from them by a re-run over the same window. Keeping the latest successful run
  plus the one before it bounds the rollup tables' size and gives the failed-run reader something to
  show; it never removes evidence, and a reader who needs an older run's rollups re-runs, never
  restores.

## 8. The screenshot-audit items, placed

| Item | Page | What ships |
|---|---|---|
| 3 demographic breakdown | Analysis › Ad Performance | a segment module reusing `audience-clusters.ts`, with the same account-level limitation note where the export is account-level |
| 4 title clipping | every rail | tile titles wrap to two lines; the drawer keeps the whole title |
| 5 swap and reorder | Account Overview | the rail renders after Account Totals as "Optimization Loop"; the deck renders as "Next Best Actions" |
| 6 IAP Library dead end | Analysis › IAP Library | the empty state names the unmapped ads count and the mapping action |
| 7 upload format | Creative upload dialog | "not a recognised file type" and "this file could not be decoded (re-export it)" are two messages; the `frameErr` for the reported file is pulled from the deployment log during the slice |
| 8 tiers | Analysis › Ad Performance | the empty state says no ads are mapped to creative cells yet (the same root as item 6), never "run Strategy" |
| 9 down-funnel rows | Account Overview › Results by event | ATC and checkout-initiated rows from `metricsCatalog`'s existing aggregation, distinguished from the top-level events |
| 2 V3/C4E | Analysis › Placements, Budget | `delivery` labelled "Placement performance", `imported_concept_slice` labelled "Imported concept slice", hidden where empty |
| 9 (reconciliation) Bookster fallbacks | Settings › Provenance and the seed | generic default, `integrity_note` per account, the ten other literal sites classified first |

## 9. The two prior specs, placed

- **Strategy Map disclosure:** the selected pillar's descriptor and rationale render as visible prose;
  "Execution detail" opens once and its four cards show three clamped lines each with `DetailReveal`
  only on fields that are genuinely long, decided from the account's real pillar text.
- **Creative Overview:** `OverviewTab` moves onto `KpiTileRow`; the dialog receives the cell's rows
  (`perfRows[]`) so the blended results tile carries the per-event split and `SharePieChart` on hover
  through `MetricHoverPopover`; the Audience view gains modes as separate components on the existing
  tab switcher. The navigation-continuity fix waits for a reproduction (§12).

## 10. Vertical slices, in order

Each slice is one PR with its change-log entry, the validation battery of §11, the workspace
convergence and, where runtime code changed, the publish and a production check.

| # | Slice | UI | Backend and schema | Done when |
|---|---|---|---|---|
| 0 | F11 | none | four indexes through the hook | `explain analyze` shows the index range; first-page calls under a second |
| 1 | The shell and the status hub on Analysis | `StageLayout`, `StatusHub` (inputs, in flight, completed, failed from existing data), notice policy, the Analysis page moved onto them | `stage_timings` on runs, `updateProgress` writes it, ETA from it | Analysis renders through the shell; a run in flight shows stage, percent, elapsed; the crawl and gates green |
| 2 | Safe re-runs | the failed row's "still shown" line | run-keyed rollups, current-run pointer, readers scoped, failure deletes only its rows; evidence rows never deleted (§7.7 retention) | a deliberately failed re-run on the fixture leaves the previous data readable and every run's evidence rows in place |
| 3 | Strategy, Creative and MST onto the shell, with the base-run control | `BaseRunPicker` on Strategy and Creative, the hub on all three, the staged-creatives nudge once | superseding rule in the evidence pack, `GenerateBriefsInput.strategy_run_id`, `source_generation_run_id`, `listGenerationRuns` | a strategy built from two runs shows its effective window; briefs name their strategy run; the PR description carries §5.1's manual-trigger framing |
| 4 | Intake and reconciliation | detected class per file, override on ambiguity, the Reconciliation panel's composition, per-breakdown badges | column classification, the per-ad waterfall, the shave rule, the scored choice, ad-id anchoring of pivot rows, the docs | Pure Path's ledger names the master for 1,494 ads and the day-level control for 257; the demographic classes no longer read 107% |
| 5 | Listen, Reports, Exports onto the shell; flyout dismissal; screenshot items 4, 5, 6, 8, 9; the Strategy Map spec | as listed | none | gates green; the three sidebar tests added |
| 6 | Bookster fallbacks and the V3/C4E rename; screenshot item 2 | labels | schema rename with a data migration in the hook, seed assembly, import.ts | no account reads the Bookster string; Pure Path's placement table reads "Placement performance" |
| 7 | Evidence on demand | tabs and panels load per account with skeletons | per-account endpoints, summary-only seed, per-account cache | production seed under 20 MB; `check:seed-evidence` rewritten to read the endpoints |
| 8 | ROAS and purchase value | pickers, tiles, charts, Results by event | `purchase_value` on rows, catalog entries gated on presence, docs and gate text | an ecommerce account shows ROAS where purchase value exists; a lead-gen fixture shows nothing new |
| 9 | Ad-id anchored mapping, the Creative Overview spec, screenshot items 3 and 7 | bands, the demographic module, the upload messages | `ad_id_concept_map`, matching, backfill | the fixture's uploads map by image name with bands |
| 10 | The pattern miner and its queue | the review content type | the miner, candidates table, approval write | candidates appear for the fixture's names; nothing writes to the library without approval |
| 11 | Task 23 on the benchmark run | none | parallel batches, then COPY once the role exists | the Pure Path re-run under ten minutes with the timings recorded |

Slices 1 to 4 are the load-bearing ones and are built strictly in order. Slices 5 to 10 can interleave
as their prerequisites land.

## 11. Validation per slice

- Static: typecheck, the affected packages' vitest, the twenty-two `check:*` gates, `check:friction`
  ratchets unchanged or lowered.
- Browser: the crawl at 1440 and 390 px for every route the slice touches, `check:accessible-names`,
  `check:chart-geometry`, `check:unexplained-dashes`, the smokes.
- Live after publish: `check:seed-evidence` against production; for slices 2 to 4 the SQL checks of
  the assessment doc §6.1 against the run id; for slice 1 the hub read against a real run.
- Every PR body names the gate outputs; every number in the change-log entry names its command.

## 12. Still the owner's

- The registry family for discovered naming patterns (deferred by agreement).
- The scale-readiness pass (partitioning, pooling, archival, tenant isolation) as its own initiative.
- A reproduction for the disappearing sub-header (prior spec §3).
- The list of what reads unclearly in the Audience cluster and age views (prior spec §2.3).
- Whether the current export template carries the `Image name` and `Video name` columns.
- The role password and the deployment secret for the COPY path when slice 11 reaches it.
