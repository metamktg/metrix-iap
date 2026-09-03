# METRIX — UI/UX lift master plan and session reconciliation (2026-09-03)

Owner brief (verbatim intent): *the UI is significantly regressing. Reconcile this session
across every stated task and validate each is complete; walk the product again for bugs and
for bugs that fixes create; clean CI; no friction; minimal warning/error triggers; nothing
that prohibits data from being shown because an optional input is missing; everything logged
in the IAP Library, everything subjectively discernible against, so Metrix's UVP — objective
direction pulled from subjective variables — holds; the sidebar should expand rightwards on a
dwell and read as a flow chart in the Watermelon aesthetic, no expand/collapse; draft the
master plan for a UI/UX lift to demo standard (agencies and brands onboarding); audit
navigation bottlenecks and illogical paths; final triple-pass validation; the KPI hover bar
chart's dark-blue formatting fixed; every module Watermelon, premium, category-breaking.*

This document is the reconciliation and the plan. §0 says how to read it. §1 is the verdict on
every task this session claimed. §2 is what this pass changed, with proof. §3 is the bug
register produced by the walk-through (fixed / open). §4 is the module-by-module lift. §5 is
the navigation plan. §6 is the demo-readiness bar. §7 is the handoff.

---

## 0. Read first — how the verdicts were produced

- **A task is "complete" only when the code shows it.** Every verdict in §1 names the file or
  test that proves it, or the finding that disproves it. "It was in a PR that merged" is not a
  verdict.
- **Four audits ran against the live tree** before anything was changed: optional-input data
  gates and warning noise (17 findings), navigation bottlenecks and illogical paths (20
  findings + a first-run click path), IAP Library completeness (16 gaps across three tables),
  and chart/hover styling debt (a table of every chart and hover surface, plus one root cause).
  Their findings are the §3 register; each carries `file:line` evidence as found.
- **Numbers are re-runnable.** Test counts come from `vitest run`; gate verdicts from the
  fifteen `check:*` scripts; the first-run click count from walking the code path in §5.
- **Where a claim could not be verified in a browser it says so.** The visual pass covers the
  surfaces the shots name; nothing else is asserted about pixels.

---

## 1. Session reconciliation — every task, its claim, and what the code says

Verdicts: **[held]** the claim is true in the live tree · **[partial]** true, with a named gap
this pass closes or carries · **[superseded]** replaced by later work in this session ·
**[open]** not done.

| # | Task (as stated) | Verdict | Evidence / gap |
|---|---|---|---|
| 1 | Single route table: legacy redirects + hidden nav children | **[partial]** | `navigation/legacyRoutes.ts` + the legacy-link test hold. Gap (nav audit #19): `/app/analysis/overview`, a visible child, was registered inside the legacy-redirect block of `App.tsx`. Closed in §2. |
| 2 | Sidebar overhaul: link + chevron, no double-click | **[superseded]** | The link stays; the chevron button is gone — pages open on intent (dwell / focus), never on a click (§2.1). |
| 3 | Wayfinding: nav history, Back button, breadcrumb parents | **[partial]** | `navigation/navHistory.ts` holds. Gap (nav audit #9): structural Back drops query state (`?from=`, `?account=`). Closed in §2. |
| 4 | Command palette (Watermelon command-search + quick-switcher) | **[held]** | `components/nav/CommandPalette.tsx`; nav audit found it omits hidden children by design (Findings) — see #1/§5. |
| 5 | Fix legacy in-app links and dead topbar controls | **[held]** | Legacy-link test green; no dead Topbar control found. |
| 6 | Run CI gate set, vitest, e2e route crawl | **[held]** | Re-run this pass (§2.6). |
| 7 | Reconciliation docs: navigation audit, register, handoff, replit.md | **[partial]** | `METRIX_Navigation_Audit_2026-09.md` line 94 still said "section 09 Action" after Action became 07. Corrected in §2. |
| 8 | Server: creativeComponents module | **[held]** | `api-server/src/lib/creativeComponents.ts` + tests; result math scoped per dominant class since #43. |
| 9 | Engine + schema: evidence grade, coverage, confidence score | **[held]** | `concept_performance` columns; `analysisEngine` tests. |
| 10 | Seed: creative_components on the account, copy on AdRecord | **[held]** | `metrixSeedAssembly.ts`. |
| 11 | Client: Copy components tab, copy in Creative dialog | **[partial]** | Lives on CreativeLibraryView only; the IAP Library's "Ad copy" tab shows primary text without the components (Library audit G12). Addressed in §2.4 where it composed cleanly, else carried in §4. |
| 12 | Client: persistent, dismissible creative-source nudge | **[partial]** | `creativeNudgeStore` holds; the nudge rendered at three sites on CreativeLibraryView and stacked with CreativeNextStepNudge on two command centers (nav audit #15). Closed in §2. |
| 13 | Verify, document, commit, push | **[held]** | Commit history. |
| 14–16 | PR #174 drive/merge/publish | **[held]** | Register §12 ship record. |
| 17 | Stage the manual-import validation for a fresh account | **[held]** | Register §13. |
| 18 | Fix reload stall during a run | **[held]** | `lib/supabaseBinary.ts`; splash deadline. |
| 19 | Stop warning the Ads Manager summary CSV about columns it does not need | **[partial]** | Per-class expectations hold. Gap (gates audit #13): CTR and CPM — derived from required columns — were still core metrics, so their absence fired "Reduced confidence". Closed in §2.3. |
| 20 | Run-click hands off to visible progress | **[held]** | `RunProgress`; e2e smoke. |
| 21 | Creative uploads processed server-side; next-step nudge | **[partial]** | Server auto-map holds. Nudge stacking (see #12). |
| 22–23 | Verify/ship PR #176 | **[held]** | Register. |
| 24 | Binary staged-file read (406) | **[held]** | Domain-typed RPCs; tests. |
| 25 | Deconstruction timeout; unified matching; progress readouts | **[held]** | `creativeAutoMap.ts`, `lib/runEta.ts`. |
| 26–32 | Reconciliation-first evidence layer (spec, three commits, amendment) | **[held]** | `docs/specs/iap-multi-report-reconciliation.md`; ledger tests. Gap (gates audit #9): `ReconciliationPanel` returned null when the ledger had no breakdowns although it carried the truth source — closed in §2.3. |
| 33 | Live DDL, merge, publish, verify | **[held]** | Register §14. |
| 34 | Owner run on the new build + ledger cross-check | **[held]** | Register §13.5. |
| 35 | Signal tags replace coverage banners | **[held]** | `SignalTag`; e2e avatars-tooltips. |
| 36 | Variable drill-down joins carriers through variable evidence | **[held]** | `lib/variable-drilldown.ts`. |
| 37 | UI/UX regression sweep of evidence surfaces | **[partial]** | The sweep did not catch the optional-input gates in §3 (EngagementFunnel, Audience, DNA, Budget, Findings). Closed in §2.3. |
| 38 | Configurable KpiTileRow on every variable/metric header | **[open]** | Library, Overview, Audience, Avatars, MST carry it; Avatars segment cards and DNA family cards remain candidates (register). Carried in §4. |
| 39–41 | Ship PR #182 / triple-pass / ship PR #183 | **[held]** | Register. |
| 42 | Result-event taxonomy | **[held]** | `resultEvents.ts` (server canonical, client byte-identical, drift test). |
| 43 | Engine + seed per-event rollups | **[partial]** | Grain holds. Gap (Library audit G9): `intent_class` written on `variable_performance` never reached the seed; `intent_summary` reached it and nothing rendered it (G10). Closed in §2.4. |
| 44 | Client: one result scope on every surface | **[partial]** | Scope holds where the bar renders. Gap (gates audit #6/#8): `landRows` was used on one surface; five surfaces scoped rows with no visible scope control; Audience/DNA blanked before the bar could render. Closed in §2.3. |
| 45 | Change log + docs | **[held]** | `ARCHITECTURE_CHANGE_LOG.md` entries 1–6. |
| 46 | E2E stress test, UI finalize, ship (PR #185) | **[held]** | Register §14 ship record; 16 smokes; migration `result_event_grain` live. |
| 47 | Panels: one persisted width/expand behaviour | **[held]** | `lib/panel-prefs.ts`, `ResizeHandle`. The sidebar no longer has a width at all (§2.1). |
| 48 | Sidebar category definition | **[partial]** | Groups and loop numerals stay; the inline purpose lines it added were the clutter the owner named and are tooltips now (§2.1). |

Net: 33 held, 10 partial (all addressed or carried below), 2 superseded, 1 open.

---

## 2. What this pass changed

Filled at the end of the pass — see the commits on the branch and the register §14 entry.

### 2.1 The sidebar: collapsible again, pages as a branch beside it
Change log entry 8 (entry 6's rail-and-map shipped for a few hours and was withdrawn on the
owner's second pass; entry 7's in-place accordion shipped for an hour and was withdrawn on the
third — "I didn't mean expand hover"). The sidebar is the collapsible / expandable navigation
(216 px or a 56 px rail; toggle and keyboard splitter; remembered per browser) and nothing in it
expands: a section is one link and a click is the navigation at once; a 700 ms dwell (or focus,
or a first tap on touch) slides the section's pages out to the RIGHT as a flow-chart branch —
connector from the row, the section as a node, pages off one rule with elbows, arriving in
sequence — which follows the pointer between sections, stays while the pointer is in it, and
folds after a 260 ms grace on leave (Escape / Left / blur fold it and return focus). The rail
gets the same branch beside its icons. What a module or page is for is its tooltip, never a line
in the sidebar. The sentence-style notes this pass had added (landing scope, three
optional-input caveats) are back behind the existing disclosure patterns: a tag with its reason
in the title; caveats collapsed by default.

### 2.2 Charts: the root cause and the theme
The KPI hover bar chart's "dark blue" was `hsl(var(--interactive))` — an undefined token, so
the SVG fill fell back to black over navy (three sites: `MetricHoverPopover`,
`KpiDrilldownModal`, `BreakdownExplorer`). One theme (`chartTokens.ts` / `chartChrome.tsx`)
now carries the series colours, the 11/12 px chrome type, grid and label tokens, one
`ChartTooltip`, and no-animation marks; the page charts migrate to it by visibility.

### 2.3 Optional inputs never blank a surface
The run and the onboarding Review are gated on ONE delivery export (the server's own rule),
not two; Engagement Funnel, Audience, Creative DNA, Budget and Findings render what exists
and name what is missing; the result scope bar renders before any guard and every scoped
surface shows its scope; `landRows` lands each surface where its rows are; the reconciliation
panel states its control even with no breakdown; persisted upload warnings survive a missing
column report; CTR/CPM absence is a note, not "reduced confidence"; the amber Ad-Summary box
is a neutral caveat; the video placeholder appears only for accounts with video.

### 2.4 The Library logs everything
Top performers rank by the account's dominant terminal event (no `onb_initiate_checkout`
literal); ATC/checkout tiles and the Lower-Funnel preset exist only for accounts carrying
those events; the creative funnel is built from observed result events; `intent_class`
reaches the seed; dominant intent and unplaced spend show in the Library header; provenance
(run, window, evidence grade / confidence) on Library rows and the drawer.

### 2.5 Navigation
One `LOOP_STAGES` source for the four loop shapes; Action offered as the sixth stage;
"Run analysis" and "Start re-run" go to the Analysis command center; `?from=` survives the
Creative and MST command centers; Back prefers the `?from=` target; history rows open their
run; Findings reachable; one nudge per page; brief drafting has one destination.

### 2.6 Verification
Recorded in the register §14 entry for this ship: suites, gates, smokes, visual pass.

---

## 3. Bug register from the walk-through

Status: **fixed** (this pass) · **carried** (planned in §4/§5 with the reason) · **decision**
(deliberately not changed).

### 3.1 Optional-input gates and warning noise
| # | Finding | Status |
|---|---|---|
| G-1 | Run hard-blocked unless BOTH pivots staged; server needs one delivery report (`ManualAnalysisControls.tsx`) | fixed |
| G-2 | Onboarding Review gated on the same false requirement (`ConnectAccountDialogs.tsx`) | fixed |
| G-3 | Engagement Funnel blanks without demographics although placement/device rows exist | fixed |
| G-4 | Audience blanks under a stored scope before the scope bar renders | fixed |
| G-5 | Creative DNA drops rows instead of landing (`scopeRows` vs `landRows`) | fixed |
| G-6 | `landRows` used on one surface only | fixed on Avatars, Sprints, Direction, Creative Library, Findings, Audience and DNA; a `LandedScopeNote` under the bar says which scope the surface landed on and why |
| G-7 | Findings ignores `failure_patterns`; no scope control | fixed |
| G-8 | Five surfaces scope rows with no visible scope control | fixed (bar or tag) |
| G-9 | ReconciliationPanel vanishes without breakdowns | fixed |
| G-10 | ImportConfidenceReport drops persisted upload warnings | fixed |
| G-11 | Budget blanks without campaign summary although concept/placement rows exist | fixed |
| G-12 | VideoPlaceholder unconditional | fixed |
| G-13 | CTR/CPM absence fires "Reduced confidence" | fixed (server) |
| G-14 | Moderate-confidence inference warnings for optional metrics read as attention | fixed (Note: prefix) |
| G-15 | Optional breakdown columns drag the confidence grade | no change needed: optional breakdown columns carry no `SIGNAL_WEIGHTS` entry, so they were never in the denominator — now documented by a comment and a test in `ImportConfidenceReport` |
| G-16 | Amber "Spend will be underreported" on every run without Ad Summary | fixed (neutral caveat) |
| G-17 | Avatar profile-detail fold vanishes when all three inputs are absent | fixed (disabled disclosure) |

### 3.2 Navigation
| # | Finding | Status |
|---|---|---|
| N-1 | Four loop shapes ship at once (tree / shared / LoopCommandChain / OverviewLoopHub) | fixed (`LOOP_STAGES`) |
| N-2 | Action never offered as a next step | fixed |
| N-3 | `App.tsx` group comments and the audit doc contradict the tree numbering | fixed |
| N-4 | Eyebrows disagree with tree labels on four pages | fixed |
| N-5 | Six pages with no onward action (histories, Findings, Updates, Provenance, Exports) | fixed for histories (Analysis history → Overview; Strategy history → generated strategy), Updates and Findings; Exports are download surfaces by design (decision); Provenance carried. Pre-selecting the run from a history row needs `lib/run-scope.ts` to accept a query param (carried, §4) |
| N-6 | Findings reachable only via a legacy redirect | fixed (CrossLink from the Analysis hub; stays hidden in the tree) |
| N-7 | `?from=` chain dies at the Creative command center | fixed |
| N-8 | `backUrl` knows two origins | fixed (table over the tree) |
| N-9 | Structural Back drops query state | fixed |
| N-10 | Manager recommendations lose the recommendation on open | fixed (lands on `/app/listen/recommendations?focus=<id>`); RecommendationsView reading `?focus=` to scroll/highlight is carried (§4 Listen) |
| N-11 | "Draft a brief" has two destinations | fixed |
| N-12 | Checklist "Run analysis" lands on Settings | fixed |
| N-13 | Two pages named "Creative Scan" | carried — needs an owner decision on the MST one's name (§7) |
| N-14 | "Start re-run" lands on Settings | fixed |
| N-15 | Nudges stack | fixed (one nudge slot per command center, next-step first); CreativeLibraryView renders its source nudge once |
| N-16 | Command Hub hides five real pages | fixed (routes from `visibleChildren`); the chain keeps Data as the leading step and Reports as the output tile — Listen/MST/Action have nothing to run there (decision) |
| N-17 | Data hub links disabled when needed | fixed |
| N-18 | Tab rails on two sections only | decision: `SectionTabBar` accepts any section, but command centers carry the loop hub + Explore grid, so a rail there would duplicate the grid; child pages carry `tabs=` (unchanged) |
| N-19 | `/app/analysis/overview` in the legacy block | fixed |
| N-20 | Collapsed rail could not navigate | fixed by §2.1 (rail items are links) |

### 3.3 Library completeness
| # | Finding | Status |
|---|---|---|
| L-1 | No provenance on Library rows | fixed: drawer "Provenance" field (run label, window, result type, evidence grade, confidence); VariableTable "Run" column when rows span more than one run ("untagged" for pre-migration rows) |
| L-2/3 | `confidence`, coverage, adjusted/raw rate rendered nowhere | fixed: Evidence column (confidence badge + observed coverage, joined on variable × same result type); "Adjusted rate" column appears only when the layer computed one — today the `all` rows carry null rates, so it hides rather than dashes |
| L-4 | KPI tiles aggregate the scope with no variable attribution | fixed: a Library tile opens the full breakdown (`KpiDrilldownModal`), whose dimensions include one per variable family — it could previously open only the avatar × placement grid. The `lib_*` tile ids are aliased in `kpiBreakdown` so those rows carry values instead of "n/a" |
| L-5 | Drawer chips are bare codes with no per-cell cost | fixed: each chip in the drawer's variable stack carries its cost per result (or its result count) read off `v3_variable_performance`, run-scoped and LANDED (a legacy account whose variable rows carry one event would otherwise show every chip bare); the chip's title names the event |
| L-6 | Top performers selected by an `onb_initiate_checkout` literal | fixed |
| L-7 | ATC/checkout tiles and preset for every vertical | fixed (gated on events present) |
| L-8 | FunnelStepsChart fixes a five-step ecommerce path | fixed (built from result events) |
| L-9 | `intent_class` never reaches the seed | fixed (projected with the run id; the checked-in seed fixture predates it — `refresh:seed-fixture` against a running server, carried to the next session with a credential) |
| L-10 | `intent_summary` rendered nowhere | fixed (Library header) |
| L-11 | Ledger coverage only behind admin controls | fixed: the Library states its reconciliation control in a chip beside its actions and opens the ledger in a dialog for any reader; absent reconciliation renders no chip rather than a false claim |
| L-12 | Copy components not on the Library | fixed: `CreativeComponentsPanel` mounts inside the Library's Ad copy tab (embedded), with a "Weighted on …" line because its weighting is fixed server-side and does not follow the page scope |
| L-13 | Copy tier badge with no sample floor | fixed ("Unranked") |
| L-14 | Four tables never selected by the seed | carried (needs schema reading + a decision on cost) |
| L-15 | Filters cannot filter by any subjective variable | fixed: the Variables tab carries a family multi-select in `FilterDisclosure`; the family cards and the table narrow together, and the active families plus the count stay visible while collapsed |
| L-16 | Sort state never URL-encoded | **decision: not doing it.** `tables.tsx` states the opposite rule in code — sort state is deliberately ephemeral so a table always opens in data order, and a sort carried across accounts or date ranges silently misrepresents the rows. The register item was written without reading that; the rule stands and this row records it |

### 3.4 Charts and hovers
| # | Finding | Status |
|---|---|---|
| C-1 | Undefined `--interactive` token → black bars (3 sites) | fixed |
| C-2 | Phantom `--chart-amber`; CPA config disagrees with the mark | fixed |
| C-3 | 9/10 px ticks and labels under the 11 px chrome floor | fixed on migrated charts; the rest in §4 |
| C-4 | No tooltip on three bar charts; five tooltip implementations | fixed on migrated charts (one `ChartTooltip`) |
| C-5 | Raw `hsl(var(--foreground) / 0.x)` literals; `hsl(0 0% 0% / 0.25)` brush | fixed on AnalysisOverview; rest §4 |
| C-6 | `--metrix-gold` / `--metrix-success` legacy aliases on StrategyOverview | carried (§4 Strategy) |
| C-7 | `hover-card.tsx` base untokened | fixed |
| C-8 | Undefined-token class of bug invisible to jsdom | carried: add a `check:token-colors` rule for `hsl(var(--x))` where `--x` is undefined (§7) |

---

## 4. The lift — module by module, to demo standard

The standard: **a first-time viewer in a demo never asks "what is this" or "where do I click"**.
Every module gets the same five things, in this order, because each depends on the previous:

1. **Tokens only.** No literal colour, no raw pixel type, one chart theme. (Gate-enforced.)
2. **One reveal signature.** Blur + 8 px arrival on every panel, drawer, branch and row that
   appears (`lib/motion.ts` `RISE`, `ICON_SWAP`; `RevealPanel`, `DetailReveal`, the map).
3. **Nothing blanks on an optional input.** The gate register in §3.1 is the rule; every new
   surface is written against it.
4. **Wayfinding on the surface.** A ModuleHeader with the section eyebrow from the tree, the
   tab rail from `visibleChildren`, a next-step CrossLink, and the result scope where rows are
   scoped.
5. **The Watermelon mechanic that fits the surface's function** — from the register's mapping
   (§4 of `METRIX_UI_REFACE_REGISTER_2026-08.md`), never a styling port.

### Phase A — the demo path (first)
Account Overview → Analysis command center → IAP Library → Creative DNA → Audience → Strategy
Map → Brief Builder → Report. These eight surfaces are what a demo shows; they get the full
five before anything else.

| Surface | Lift |
|---|---|
| Account Overview | KPI hover chart on the theme (done); loop stepper from `LOOP_STAGES` (done); Next-best-action names the runnable stage and links to it; results-by-event table gains the intent-class column. **Recommendations now derive from the account's own rows (change log entry 10)** — the hero, the deck and a new evidence-carrying slider are populated on every configured account instead of waiting on an Optimization Loop stage that has never run. |
| Analysis command center | Run block first; reconciliation panel always states its control (done); Findings CrossLink (done); tab rail (done). |
| IAP Library | Top performers by dominant event (done); intent + unplaced spend in the header (done); provenance on rows (done); **next:** variable-family multi-select filter (L-15), per-chip cost in the drawer (L-5), tile → "by variable family" dimension (L-4), coverage chip → reconciliation (L-11), URL-encoded sort (L-16). |
| Creative DNA | Lands on its scope (done); **the page carries a configurable KpiTileRow over its own landed rows, opening the shared breakdown (#38, change log entry 12)**; the drill-down's segment rows carry the volume band AND their own evidence chip. |
| Audience | Scope bar above the guard (done); positioning map on the theme's scatter tokens; rank groups per scale (done in #44). |
| Strategy Map | `--metrix-gold`/`--metrix-success` → status tokens (C-6); hypothesis chips first-layer (done); "Draft a brief" → builder (done). |
| Brief Builder | `?from=` origin crumb (done); inline-toast confirm on download (done); the brief preview uses the report's type ramp. |
| Report Builder | The blended cost caption becomes a per-event table (register §14 open item); export SVG stays print-ground by design. |

### Phase B — the rest of the loop
Listen (signal cards on `expand-details`, done), Placements (theme scatter/bars), Budget
(event-total tiles gated only on summary, done), Avatars (segment cards get KpiTileRow, #38),
MST Cross-Map / Sprints / Direction (scope tags, done; the matrix grid gets the
`inline-table-control` in-place row), Action Queue (arrival on `RevealPanel`, done).

### Phase C — outputs and workspace
Reports History (rows open the report), Exports (download surfaces; one confirm pattern),
Settings (Data Provenance gets a next step), Onboarding wizard (the creative→ad-name mapping
explanation moves INTO the upload step; Review enabled on one delivery export, done).

### Phase D — the chart pass beyond the demo path
Migrate the remaining recharts surfaces to the theme in the audit's visibility order:
KpiDrilldownModal (done), AnalysisOverview (done), BreakdownExplorer (done), SharePieChart
(done), Audience/EngagementFunnel scatter axes and tooltip consolidation, StrategyOverview
meters, `hover-card` base (done).

### Phase E — the gate that makes it stick
A `check:token-colors` rule that fails on `hsl(var(--x))` where `--x` is not defined in
`index.css` (C-8). Until it exists the undefined-token class of bug is invisible to every
test.

---

## 5. Navigation plan

**The one shape.** `LOOP_STAGES` in `navTree.ts` is the loop; every stepper, hub and rail
renders a subset of it by filter. Data (account setup, ingestion) is the step BEFORE the loop
and is labelled as such; Reports and Exports are OUTPUTS; Settings is the workspace. The
sidebar map draws exactly this.

**The first-run path, after this pass** (was ~17 clicks with 5 guess points):

| # | Click | Screen |
|---|---|---|
| 1 | land after login | Manager Overview → onboarding checklist |
| 2 | Add Ad Account → Manual → name | AddAccountDialog |
| 3 | upload one delivery export (a second adds resolution; creatives optional) | upload step, mapping explained in place |
| 4 | Review → close | Account Overview, unconfigured checklist |
| 5 | Run analysis (checklist → Analysis command center) | AnalysisCommandCenter, run block |
| 6 | run completes → "View results" | Analysis Overview / Library |
| 7 | loop hub → Strategy → Build | StrategyCommandCenter |
| 8 | loop hub → Creative → Draft brief | Brief Builder (`?from=` intact) |
| 9 | loop hub → MST / Action | MST command center / Action queue |
| 10 | Outputs → Report → Generate | Report Builder |

Ten clicks, one guess point left (the post-run "View results" CTA depends on the run's
success state being observed by the page the reader is on; if the reader left the page, the
Task Tray carries it).

**Decisions needed from the owner** (§7): the name of the MST "Creative Scan" (N-13); whether
Findings becomes a visible Analysis child or folds into the Overview (N-6).

---

## 6. Demo-readiness bar

A build is demo-ready when all of these hold on the same head:

- Client and server suites green; the fifteen gates green; the sixteen e2e smokes green
  (with the chromium executable set on the runner); `check:api-codegen-drift` PASS.
- The visual pass (1440 and 390 px) shows: the rail and map; the KPI hover chart; the
  Library under a conversion scope and an awareness scope; Audience and DNA landing on data;
  the onboarding Review enabled on one delivery export.
- The first-run path in §5 completes in the stated clicks with no console error.
- No surface renders "not available" / "no data" while a sibling data set exists (the §3.1
  rule), verified by the friction audit script (`scratchpad/friction-audit.mjs`, to be moved
  into `scripts/` as `check:friction` — carried).
- Live: bundle hash and chunk md5 match the local build; `/api/healthz` 200.

---

## 7. Handoff

**Where things stand.** See §2 and the register §14 entry for this ship. Everything in §3 marked
*fixed* is on the branch with its test; everything *carried* is in §4 with its phase.

**Decisions for the owner.**
1. MST "Creative Scan" rename (N-13): "Sprint Asset Check" is the proposal.
2. Findings (N-6): visible child, or fold into Analysis Overview.
3. The four tables the seed never selects (L-14: `copy_library`, `ad_traffic_quality`,
   `import_metric_reconciliation`, `variable_registry`) — reading them costs a query each per
   seed build; `variable_registry` is the one with a visible payoff (ST_/AW_/CTA_ "registry
   missing" chips).

**Next session, in order.**
1. Phase A items marked *next* (Library filter by variable family; per-chip cost; tile → family
   dimension; coverage chip).
2. #38 (KpiTileRow on Avatars segment cards and DNA family cards).
3. Phase D chart migrations; then Phase E gate.
4. `check:friction` from the scratch script.
5. The report export's per-event cost table (register §14 open item).

**Standing rules that this pass re-affirmed.** The objective is derived from data and is only
a lens (CLAUDE.md). No result event is ever weighted against another; blending is terminal
conversions only. Nothing hardcodes purchases. No surface blanks on an optional input. Every
architectural change gets a change-log entry.
