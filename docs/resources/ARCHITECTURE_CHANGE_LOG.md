# Architecture change log

One entry per architectural change, written when the change lands, in order. An entry names
what changed, why, where it lives, what proves it, and how far its reach goes. It is a working
record, not a specification: the spec and the blueprint say what the system IS; this says what
was done to it and when. Read `README_HANDOFF.md` for reading order and where each phase stands.

Entries are append-only. A superseded entry is marked, never removed.

---

## 2026-09-03 · Result-event taxonomy: intent classes derived from Result type

**Change.** A single, pure vocabulary that places every Meta "Result type" string into an event
key (purchase, add_to_cart, initiate_checkout, lead, registration, subscription, trial,
app_install, app_activation, appointment, messaging_conversation, landing_page_view, link_click,
thruplay, video_view, post_engagement, page_like, reach, impressions, …) and an intent class:
`conversion` (purchase-intent events, each on its own cost-per-result scale), `consideration`
(traffic events, cost per visit / click-through) and `awareness` (communication signals — CPM,
click-through, reach, frequency, result rate — read for gaps against the awareness class's own
median, never for cost per result). Two rows may be ranked against each other only when they are
the SAME event; awareness is never weighted against a purchase.

**Why.** Owner direction (2026-09-03): awareness campaigns and purchase-intent events serve
different strategic purposes and must not be weighted against each other. Before this the
platform had one "results" number and one blended CPA wherever rows of several result types
met, so a ThruPlay row and a purchase row could sit in one ranking and a reach campaign could
drag a blended cost per result to a figure that described nothing.

**Where.** `artifacts/api-server/src/lib/resultEvents.ts` (canonical), byte-identical copy at
`artifacts/metrix-iap/src/lib/resultEvents.ts` (the client ranks rows that carry only the raw
string). No imports in either copy.

**Rule it obeys.** Derived from data only — the same bound as the derived objective
(`cohortConfig.ts`, owner decision 2026-09-01): nothing is asked of an operator, nothing is
toggled, nothing becomes a property of the account. The objective decides which terminal metric
a run reports; the intent class decides which SCALE a row is judged on and which rows may be
ranked beside it. `unknown` and unrecognised custom events get no intent and no scale, and are
always kept visible as "unplaced" rather than dropped or folded.

**Proof.** `artifacts/api-server/src/lib/__tests__/resultEvents.test.ts` (live result types,
Meta's awareness/traffic vocabulary, order-sensitive names, no-guess cases, comparability,
partition, communication signals with physically-impossible inputs nulled, gap analysis
direction-aware and silent for a class of one). `scripts/src/result-events-drift.test.ts` fails
when the two copies differ.

**Reach.** Consumed by the engine and seed assembly (next entry) and by the client's KPI
catalogs, rankings, sorts and filters. It does not describe an account to a reader; it labels
rows and scopes comparisons.

---

## 2026-09-03 · Result-event grain in the engine, the seed and the summary API

**Change.** Every aggregate the analysis run writes now carries the Meta result type it was
summed under, and is keyed on it: `concept_performance` at (book, concept, event),
`variable_performance` at (token, event) — replacing the account-modal result type that was
stamped on every token — and `demographic_`/`placement_`/`platform_`/`device_performance` and
the two window signal tables at (dimension, date, event). Concept lift and tier now compare a
concept with the SAME event's book baseline: cost-per-result classes on CPA, awareness rows on
link click-through (`lift_basis`), with `buying_intent_score` null for awareness (a ThruPlay is
not a purchase-intent signal) and no verdict at all for an event that cannot be placed. The seed
publishes `result_events[]` (per event: key, label, intent class, scale, spend, results, cost per
result, distinct ads, spend share) and `intent_summary` (per class totals, the dominant class,
unplaced spend) on every account; `concept_rollup[]` rows carry `result_type`, `intent_class`,
`lift_basis` and `impressions`. The analysis-summary API rows (`concept_rows`,
`demographic_rows`, `placement_rows`) carry `result_type` and `intent_class`; day rows and the
daily series carry `results_by_event`. The variable-evidence interaction index's account
denominator is per result type. `unique_ads` on variable rows counts distinct ads (Meta ad id,
else name) — it counted ad-day rows before, which read "30 unique ads" for a token two ads
carried across fifteen days.

**Why.** The engine's one bucket primitive (`accumulate`) summed `results` across whatever rows
fell into a bucket and kept the first result type it saw; eight output tables inherited that. On
a mixed account (the calibration example carries 363 lead ads and 48 purchase ads) every
concept tier was a lead concept judged against a baseline diluted by purchases, and the
cohort contract's own rule — "never blend a cross-cohort score" — held only for
`ad_performance`, `bottom_line_totals` and the evidence tables.

**Where.** `scripts/src/metrix-supabase/schema.sql` (additive, idempotent: nullable
`result_type` / `intent_class` columns, `impressions` and `lift_basis` on concept_performance,
unique keys widened to include the event; pre-migration rows read null = "not split" and are
kept). `artifacts/api-server/src/lib/analysisEngine.ts` (`rowResultType`, bucket keys,
`buildConceptPerformanceRows`, `buildVariablePerformanceRows`, summary builders,
`aggregateDailySeries`), `metrixSeedAssembly.ts` (`buildResultEventSummary`),
`variableEvidence.ts`, `lib/api-spec/openapi.yaml` and the regenerated `lib/api-zod` /
`lib/api-client-react` types.

**Proof.** `analysisEngineResultGrain.test.ts` (a concept running purchases and a reach campaign
gets two rows; purchase lift against the purchase baseline; reach lift on click-through against
the reach baseline with no intent score; unplaced type kept with no verdict; tokens split by
event with distinct-ad counts). Existing engine, daily-series, seed-assembly and fixture-shape
suites unchanged and green. Live DDL is applied through the same migration path as the evidence
layer; the ship record names the migration.

**Reach.** Rows and keys only. Nothing here decides how a surface reads — that is the client's
result scope (next entry). Rows written before this change carry null `result_type` and are
never dropped, so a re-run is what moves an account onto the new grain.

---

## 2026-09-03 · One result scope for every analysis surface (client)

**Change.** A single account-level lens — the result scope — replaces the Library/Budget
multi-select whose default was "every event" and the absence of any scope on the other
surfaces. `lib/result-scope.ts` builds the scopes an account offers from the events its ads ran
under (seed `result_events`, else bottom-line totals, else the rows): one per event, grouped by
intent class in a fixed order (Conversion · Consideration · Awareness · Unplaced), plus one
"All conversions" blend when two or more TERMINAL conversion events exist (a purchase and a
lead; never a checkout step, never reach beside ThruPlays). The reader lands on the dominant
class by spend, the blend when one exists. The choice is a per-account session convenience,
never a property of the account. `useResultScope` reads it live across surfaces
(`useSyncExternalStore`); `ResultScopeBar` is the one control; `ResultScopeTag` names it in
dialog headers. Rows are filtered to the scope BEFORE any sum or sort — `scopeRows` — and
`collapseCellRows` turns (cell × event) rows into one row per cell inside the scope with rates
recomputed from sums. The metric catalogs are scale-aware: `cpa_blended` became "Cost per
conversion (blended)" over terminal conversion events only; awareness events get their own
rate tile (results ÷ impressions) and never a cost per result; the Library and variable
drill-down catalogs omit cost per result under a communication scope and lead with the event's
rate, CPM and frequency.

**Landing.** Before the reader chooses, a surface lands where its data is: the first scope in
the default order whose events appear on that surface's rows (`defaultScopeId(groups,
presentTypes)`), and a row-set that would be empty under the account default lands on its own
best scope and says so (`landRows` → `landed`). Legacy imports stamped every variable row with
one event while the cells carried others; without this the Library's variable tab opened empty.
A stored choice is always honoured everywhere — then an empty row-set is an honest empty. Rows
with no result-type field at all predate the split and are kept under every scope.

**KPI breakdown.** The metric breakdown reads per-event ids of all three kinds
(`result:` count, `cost:` cost per result, `rate:` an awareness event's own rate), scopes
demographic rows by event now that they carry one, and blends `results` for the blended cost the
same way the catalog does — terminal conversion events only.

**Rankings under a communication scope.** The Audience rank metrics, header tiles and
positioning map, and the MST and Avatars sort options, drop cost per result and the conversion
rates when the scope is an awareness event and lead with the event's own rate, CPM and
click-through instead (the map's cost axis becomes CPM). A cost sort chosen under a conversion
scope falls back to spend when the reader switches scope. A tile slot the catalog withdraws on
a scope change is refilled from the defaults that remain, so a row never comes up short.

**Where it reads.** IAP Library (grid, cards, tiers, tiles, filters), Budget, Analysis Overview
(tiles, top cells, variable table, rollup, demographics), Creative DNA, Audience, Avatars, MST
Command Center, Concept Map, the variable drill-down (header rows, scale, tag) and, through the
rows they are handed, the segment drill-down and creative cards. `lib/metric-selection.ts` and
`MetricSelectionBar` are removed.

**Why.** The client map found thirty-one places where rows of different result types were
ranked or summed together (register §14). Patching each would have left the next surface to
repeat it; one scope read by all of them cannot.

**Proof.** `lib/__tests__/result-scope.test.ts` (grouping and order, terminal-only blend, no
blend for awareness or consideration, default landing, filters, subtitles and rank metric,
per-cell collapse with rates from sums). Catalog and consumer suites green.

**Reach.** Analysis, strategy-avatars and MST surfaces. It does not label an account; it labels
what the rows on screen are summed under.

---

## 2026-09-03 · One panel behaviour: persisted width, expand, and a keyboard-operable resize handle

**Change.** Every slide-over and wide popover now shares one preference store and one edge
handle. `lib/panel-prefs.ts` keeps, per panel kind and per viewer, the width and whether the
panel was last left expanded, validated on load against the kind's own bounds (a stale phone
width never survives into a desktop drawer) and shared live across every mount of that kind
(`usePanelSize`). `components/ui/ResizeHandle.tsx` is the WAI-ARIA window splitter the sidebar
already got right — a focusable separator that carries the width it separates on, steps on the
arrow keys, jumps to the bounds on Home / End, toggles expanded on Enter / Space and drags with
a pointer — with an `edge` so dragging away from the panel always grows it. The deep-dive
drawer (400–760, default 560), the info drawer (400–760; 620–960 with the task tray) and the
task tray (260–480) use it; the drawers gained an expand / restore button beside close;
`DetailReveal` gained a compact ↔ wide toggle (380 / 560) so every reveal on the page widens
together. Below the compact-shell breakpoint the drawers stay full-width and the handle is not
rendered.

**Why.** Owner ask (2026-09-03): hover panels and sliders more user-friendly — collapsible,
expandable, wider, and consistent across every interface, sidebar and navigation. The inventory
found five hand-rolled panels with five fixed widths and one handle that announced itself as a
resize control and could not be reached by a keyboard (the task tray's).

**Where.** `lib/panel-prefs.ts`, `components/ui/ResizeHandle.tsx`, `components/deepdive/
DeepDivePanel.tsx`, `components/ui/InfoDrawer.tsx`, `components/layout/TaskTray.tsx`,
`pages/metrix/shared.tsx` (DetailReveal). The sidebar keeps its own handle and its own
`metrix_sidebar_collapsed` key, which tests read directly.

**Proof.** `lib/__tests__/panel-prefs.test.ts` (defaults, clamping, persistence, out-of-bounds
and corrupt storage, expand / restore). `components/layout/__tests__/TaskTray.test.tsx` (the
resize cases re-pinned to the shared handle, plus keyboard operation). Interaction and
disclosure gates green.

**Reach.** Chrome only; no data path. A drag that used to snap the task tray shut now stops at
the tray's minimum width — the tray's own toggle closes it.

---

## 2026-09-03 · The sidebar defines the category: groups, loop stages, purpose fragments in the tree

**Change.** `navTree.ts` — the one tree the sidebar, breadcrumbs, Back and the command palette
read — now carries three more facts per section: its `group` in the product's shape (Account ·
IAP loop · Outputs · Workspace), its `loopStage` (1–6 for Listen → Analysis → Strategy →
Creative → MST → Action) and a `purpose` fragment saying what the module is for; every child
carries a `purpose` fragment saying what the page proves. The expanded sidebar renders the group
labels between groups, a stage numeral on every loop section joined by one thin spine, the
section's purpose at the top of its opened page list, and the active page's purpose under its
row (only the active one — the list stays a list). The collapsed rail's dividers follow the
groups and its icon titles carry the purpose. Nothing about routing, landing, hidden children,
the link-plus-chevron split, `inert` lists or the resize handle changed.

**Order.** Action is the loop's sixth stage and sat after Reports and Exports, so the loop
broke in the middle of the sidebar. It now follows MST and is numbered 07; Reports and Exports
become 08 and 09 (their page eyebrows follow), and two eyebrows that had drifted are corrected
on the way ("MST · 07" on Cross-Map is 06; the Action queue's bare "Act" reads "Action · 07").
Routes, landings and the command palette are untouched.

**Why.** Owner ask (2026-09-03): the parent-to-subpage wayfinding should be more intuitive,
category-defining, and convey what makes the interface different. The tree already encoded the
IAP loop as ten numbered sections but said so only in a source comment; the one-line "what this
page is for" copy existed on six command-center hub cards and nowhere a reader lands first.

**Where.** `navigation/navTree.ts` (types, `NAV_GROUP_LABEL`, data), `components/layout/
Sidebar.tsx`, `index.css` (`.mx-loop-spine`).

**Proof.** `components/layout/__tests__/sidebar-nav.test.tsx` — every section has a group and
a fragment purpose under 56 characters with no full stop; loop stages are exactly 1…6 in order;
group labels render in order; six stage markers; opening a section reveals its purpose and only
the active page shows its own. The existing 27 sidebar cases, the route crawl (which reads the
tree as text) and the locator-ambiguity gate are unchanged.

**Reach.** Chrome. The fragments are chrome under the disclosure rulebook (no sentences on the
first layer); they never describe an account, only the module.

---

## 6. The sidebar is a rail and a map (2026-09-03, later still)

**What.** The expanded/collapsed sidebar (216 ↔ 56 px, a collapse toggle, a drag handle, a
persisted collapsed key, an accordion of section headers) is replaced by a 56 px icon RAIL that is
always in the layout and a MAP that opens over the page when the reader dwells on the rail.
The map draws the product as a flow chart: every section is a node — the six IAP loop stages
numbered on one spine, Account above, Outputs and Workspace below with group labels between —
and the pages of the focused node branch beside it with an elbow each, headed by the stage and
the module's purpose fragment. Resting on another node moves the branch; the active page's
purpose shows on its row only.

**Interaction model.** Three ways in, each one thing: a pointer that rests on the rail for
260 ms opens the map (a pass-through does not); keyboard focus on a rail item opens it at once,
Escape closes it and hands focus back to the rail; on a touch screen a tap on a rail icon opens
the map on that section and a second tap goes to its command center; a tap or click outside
closes it; leaving the sidebar closes a pointer-opened map after a 220 ms grace. Inside the
compact-shell drawer (< 1024 px) the map is always open — the drawer is the disclosure.
Nothing is a mode and nothing is remembered. Rail items and map nodes are links to the
section's command center; branch rows are links to pages; hidden children render no row.

**Why.** Owner (2026-09-03): the expanded sidebar "is reprehensible compared to before";
no expand/collapse — on a dwell it should "expand rightwards and look like a flow chart" with
the Watermelon animation and aesthetic. Also the standing complaint that a 216 px rail beside a
dense page is a permanent tax on width.

**Mechanics taken.** `tooltip-navbar` — one delay to open, none to travel between items once
open; `layered-progressive-disclosure` — arrival as opacity + blur(4px) + an 8 px travel, never
50 px, on a surface the reader is already reading; `morphing-sidebar-controls` — the map is a
plane the rail becomes, not a wider rail.

**Where.** `components/layout/Sidebar.tsx` (rewritten), `index.css` (`.mx-nav-map`,
`.mx-rail-spine`, `.mx-map-spine`, `.mx-map-branch`), `components/layout/__tests__/
sidebar-nav.test.tsx` (rewritten), `sidebar-operability.test.tsx` deleted (the resize handle it
pinned no longer exists). `AppShell` is unchanged: the compact drawer still wraps the sidebar.

**Proof.** 25 cases: the rail is 56 px with one link per section and no toggle or handle;
a pass-through does not open the map and a dwell does (fake timers); leaving closes after the
grace; focus opens at once and Escape returns focus; the map is `absolute`, the rail keeps its
width; touch tap opens then navigates; group labels in order; ten nodes with stages 1…6 on the
spine; the focused node's branch, heading and single connector; hidden children absent; the
branch follows the pointer; node and row links navigate; the Soon pill. Gates: interaction,
token-colors, disclosure-rulebook, optical-authority, type-scale all pass. Visual pass at 1440
and 390 px with no console errors.

**Reach.** Chrome only. Routing, landing routes, `resolveNavLocation`, the palette, the tab
bars and the Topbar are untouched; the `metrix_sidebar_collapsed` key is no longer read (a
stale value is harmless).

---

## 7. The sidebar collapses again; its pages disclose on intent (2026-09-03, second pass)

**What.** Entry 6's rail-and-map is withdrawn. The sidebar is a collapsible / expandable
navigation again — 216 px with labels or a 56 px icon rail, toggled by the logo-row button or
the keyboard-operable resize handle, remembered per browser — and keeps the one thing worth
keeping from the map: a section's pages disclose on INTENT, never on a click. Resting the
pointer on a section for 180 ms (or focusing it) slides its page list open in place and closes
the other; the label stays a plain link to the command center (no chevron button, no second
tap); once a list is open by intent, moving to another section moves the list at once; leaving
the sidebar returns it to the section the reader is on after a 260 ms grace, and Escape does the
same. In the rail, the same dwell or focus opens a flyout of the section's pages beside its icon,
and the icon itself is a link to the command center — the rail can navigate. Nothing about a
module or page is written in the sidebar: what it is for is its tooltip (`title` on every section
and page), never a line under the label. Loop numerals on one spine and group labels stay —
structure, not prose.

**Why.** Owner (2026-09-03, second pass): "not a fan of the current menu implementation";
prefers a collapsible / expandable side navigation "with a more user-friendly way to disclose
the loop sub-tabs without adding friction or extra clicks"; and the tooltips had been removed
while "the formerly disclosed text is now permanently surfaced on the main interface" — restore
the previous interaction pattern. In the same pass the sentence-style notes this session added
(the landing-scope note, the three optional-input caveats) went back behind the existing
disclosure patterns: the landing note is a tag with its reason in the title, the caveats are
collapsed by default.

**Where.** `components/layout/Sidebar.tsx` (rewritten from the pre-map version),
`components/analysis/ResultScopeBar.tsx` (`LandedScopeNote`), the three `CaveatNote` sites,
`components/layout/__tests__/sidebar-nav.test.tsx` (rewritten), `sidebar-operability.test.tsx`
(restored). `.mx-nav-map` / `.mx-map-branch` / `.mx-rail-spine` in `index.css` now dress the
rail flyout.

**Proof.** sidebar-nav: the header is one link with no chevron button and no button in the
nav; the active section's list is open and the others inert; a pass-through opens nothing and a
dwell does (fake timers); the list follows the pointer; leaving returns to the active section
after the grace; focus opens at once and Escape returns; child links navigate; hidden children
absent; purposes are titles and never text in the sidebar; collapse/expand/persist; the rail's
links navigate, its flyout opens on dwell and on focus, closes after the grace, shows no purpose
text. sidebar-operability: the splitter's keyboard contract. Gates: interaction, token-colors,
disclosure-rulebook, optical-authority, unused-exports, locator-ambiguity.

**Reach.** Chrome only. Routing, landing routes, `resolveNavLocation`, the palette, the tab
bars and the Topbar are untouched; `metrix_sidebar_collapsed` is read again.

## 8. The sidebar's pages are a branch beside it (2026-09-03, third pass)

**What.** Entry 7's in-place disclosure is withdrawn: nothing in the sidebar expands, in
either width. Every section is one link and a click on it is the navigation — Analysis goes to
the Analysis command center at once, however long the pointer was there. Resting the pointer
on a section for 700 ms (or focusing it, or on touch a first tap) slides its pages out to the
RIGHT of the sidebar as a branch of a flow chart: a connector from the row the reader rested on
to a node carrying the section (its loop numeral and label), and the pages hanging off one
rule with an elbow each, arriving in sequence (blur + 8 px, staggered). Once a branch is out,
moving to another section moves the branch at once (real pointer travel only); the branch is
part of the sidebar, so moving into it does not fold it; leaving the sidebar, Escape, Left, or
focus leaving fold it after a 260 ms grace (at once for Escape and focus), and focus returns to
the section without re-opening it. Right arrow on a section walks into its branch; Up/Down walk
the pages. The rail does exactly the same beside its icons — one panel for both widths,
rendered at the aside level (outside the scrolling nav), at the section's height, clamped to the
sidebar and pointing back at the row. On touch the first tap on a section with pages opens the
branch and the tap after that navigates; a section with no pages navigates on the first tap.
Tooltips unchanged; nothing written out.

**Why.** Owner (2026-09-03, third pass): "when I said sidebar menu hover effect I didn't mean
expand hover — I meant it has an animation that looks like a flow chart disclosing the sub-tabs
to the right of the menu, so someone can hover the page Analysis for example and click it right
away and go to the Analysis command center, whereas if they hovered for 0.7 seconds it discloses
the sub-pages from a slide-out-to-the-right animated sub-page menu." Entry 7 had read
"disclose" as an accordion; the accordion also shifted rows under a resting pointer, which is
the layout-shift cascade its travel guard existed for — with the branch beside the sidebar,
nothing in the sidebar moves.

**Where.** `components/layout/Sidebar.tsx` (`SectionRow` replaces `ExpandableSection`;
`NavFlyout` replaces `RailFlyout` and serves both widths; `TouchDisclosure`; `OPEN_DWELL_MS`
700). `index.css`: `.mx-branch-connector`, `.mx-branch-node`, `.mx-map-branch-row` now on every
page row. `components/layout/__tests__/sidebar-nav.test.tsx` (rewritten again).

**Proof.** sidebar-nav (31): the header is one link and a quick click navigates before the dwell
(the navigation cancels it); no page list in the nav even for the active section; a pass-through
opens nothing, a 700 ms dwell opens the branch beside the sidebar (connector, node, pages;
`left` past the sidebar; not inside the nav) and it follows the pointer; moving into the branch
keeps it; leaving folds after the grace; focus opens, Escape folds and returns focus, blur
folds; a page on the branch navigates; touch tap-once opens / tap-twice navigates; hidden
children absent; purposes are titles only; the rail's branch sits beside 56 px. Browser probe
(`shoot-sidebar3.mjs`): quick click → `/app/listen`, 0 branches after 700 ms more; dwell → the
Strategy branch at left 210; move → MST; inside the branch it stays; leave → 0; focus Creative →
Right → "Library", Down → "Brief Builder", Escape → 0 and focus on Creative; rail → the Analysis
branch at left 50; phone tap 1 opens, tap 2 navigates; no console errors. Full client suite
2,483; gates disclosure-rulebook, interaction, locator-ambiguity, unused-exports, token-colors,
type-scale, optical-authority, stray-shell-output.

**Reach.** Chrome only. Routing, landing routes, `resolveNavLocation`, the palette, the tab
bars and the Topbar are untouched. The compact drawer renders the same branch to the right of
the drawer over the backdrop.

## 9. A Library tile answers "which variable", not only "who saw it" (2026-09-03, autonomous pass 1)

**What.** Four attribution gaps in the IAP Library close together, because they are one gap seen
from four sides — the Library could show a number but not what carried it.

- A metric tile used to open the avatar × placement grid and nothing else. It now opens the full
  breakdown (`KpiDrilldownModal`), whose dimension list already contained one entry per variable
  family (`var:<family>`) alongside concept, cell, avatar, placement and platform. The avatar grid
  is still there — as one dimension inside the modal, and behind its own control on the cards.
  The tile's affordance line no longer promises "Segment breakdown" (`MetricTile` takes
  `actionLabel`/`actionTitle`; every other caller keeps the old words).
- The Library's tiles carry `lib_*` metric ids. `metricValueFromTotals` did not know them, so the
  breakdown that tile opened would have rendered "n/a" in every row — the aliases now live in
  `kpiBreakdown` (`lib_spend` → `spend`, `lib_cpa` → `cpa_blended`, `lib_results` and
  `lib_result_rate` computed from the same totals; `lib_cells` deliberately absent because a count
  of cells is not derivable from a segment's totals, which is why that tile is not clickable).
  `SegmentGridModal` had a local copy of this aliasing; the breakdown surfaces now share one.
- The drawer's variable stack rendered bare codes. Each chip now carries what that variable cost
  under the active scope, read off `v3_variable_performance` — run-scoped first (the table keeps
  one row per run) and LANDED rather than filtered, because a legacy account whose variable rows
  all carry one event would otherwise show every chip bare. The chip's title names the event the
  figure belongs to, so a landed number never passes for the scope the reader selected.
- The Variables tab carries a variable-family multi-select. The family cards and the table narrow
  together — a rollup that disagrees with the rows under it is worse than no filter — and the
  active families and the resulting count stay on screen while the control is collapsed.
- The reconciliation ledger is reachable from the Library: a chip names the control the numbers
  were reconciled against (Ad Summary, totals row, or none) and opens the ledger in a dialog.
  It was previously mounted only inside the run controls, which are admin-only. An account with
  no reconciliation renders no chip — silence, not a false claim.

**Why.** Register L-4, L-5, L-11, L-15. The product's claim is objective direction from subjective
variables; a Library whose tiles can only be broken down by audience, whose chips are bare codes,
and whose evidence is admin-only cannot make that claim on the surface where it matters.

**Where.** `pages/metrix/analysis/IapLibraryView.tsx`, `pages/metrix/shared.tsx` (`MetricTile`
action props), `lib/data/kpiBreakdown.ts` (the alias map),
`pages/metrix/analysis/__tests__/library-attribution.test.tsx` (new, 8 cases).

**Decision recorded, not implemented.** L-16 ("sort state never URL-encoded") is refused:
`tables.tsx` documents the opposite rule in code — sort is deliberately ephemeral so a table opens
in data order every time, and a sort carried across accounts or date ranges misrepresents rows the
reader did not choose. The register item was written without reading that comment.

**Reach.** Chrome only. No seed, schema, or route change. Other `MetricTile` callers are
unchanged by default; `SegmentGridModal` keeps serving the per-cell and per-card grids.

## 10. Recommendations derived from the rows, not waiting on a stage (2026-09-03, autonomous pass 2)

**What.** `lib/data/recommendations.ts` derives a ranked, evidence-carrying recommendation set
from the account JSON that exists, and emits the `DeckCard` shape the recommendation surfaces
already consume. A new `RecommendationSlider` puts that set on the account overview and, filtered
to the stage it belongs to, on the Analysis, Strategy, Creative and MST command centres.

Sources, in the order the cards rank: `scaling_playbook.avoid_combinations` (the money being
lost), `scale_now`, the budget reallocation note, `intelligence.failure_patterns`,
`scaling_playbook.optimize` and `validate`, `strategy.active_hypotheses`, and critical
`data_quality` anomalies. Concept references are parsed with the existing `parseHierarchyRef`
and joined to run-scoped `concept_rollup` rows for the measured spend, results and cost per
result. Ad-level failure patterns are grouped by the engine's own diagnosis — nineteen identical
tiles on the validated account is noise, one card carrying the count and the summed spend is
direction. A `data_quality` anomaly whose campaign a failure pattern already covers is dropped
rather than stated twice.

**Why.** Every recommendation surface in the product — the Next Best Action hero, the swipe deck,
the Action Queue — reads `iap.optimization_loop.recommendation_cards`. That array is written only
by the Optimization Loop stage, which is execute-on-command and has never run for any account in
the deployment, so four surfaces rendered an empty state on accounts whose strategy map, findings
and hypothesis queue were full of direction. Owner ask (2026-09-03): "continue surfacing and
leveraging the json outputs … recommendation tile sliders, which we need to fill the schema of on
the main account overview and command center pages".

**The honesty rules it works under.** Nothing is invented: a card's numbers come from a row, and
a reference the rollup cannot match says so in words rather than showing a zero. Every card names
the JSON that produced it and links to the surface where the evidence lives. `confidence` carries
the engine's own grade where one exists; a hypothesis reads "untested", which is its epistemic
state rather than a fabricated score. A generated card, if the loop ever runs, leads and is not
marked derived. Cost per result throughout — never ROAS, never purchases.

**Where.** `lib/data/recommendations.ts` (new, pure), `components/deck/RecommendationSlider.tsx`
(new), `pages/metrix/AdAccountOverview.tsx` (hero, deck and slider all read the derived set),
`analysis/AnalysisCommandCenter.tsx`, `strategy/StrategyCommandCenter.tsx`,
`creative/CreativeCommandCenter.tsx`, `mst/MstCommandCenter.tsx` (stage-filtered slider, rendered
only when that stage has cards). The manager overview is unchanged: its own
`recommendation_cards` are populated.

**Proof.** `lib/data/__tests__/recommendations.test.ts` (11) recomputes the numbers from the
fixture rather than restating the module's output, and pins the ranking, the no-number case, the
dedupe, purity, and the generated-cards-win rule.
`components/deck/__tests__/recommendation-slider.test.tsx` (6) covers provenance on every tile, the
absent-number line, paging controls disabled rather than hidden, and the empty state speaking in
the account's own words. Full client suite 2,508.

**Reach.** Chrome only. No seed, schema or server change — the derivation is client-side over
data the seed already ships. `ActionQueueView` and `listen/RecommendationsView` still read the raw
loop array and stay empty until it runs; wiring them to the same derivation is listed for the next
pass rather than done here, because both consume the raw snake_case seed shape and adapting them
is a change to their contracts.

**Locator note.** Three assertions in `loop-command-chain.test.tsx` matched the stage tile by the
substring `/strategy/i`; the overview now also carries recommendation prose citing the strategy
map, so they resolve by the tile's own test id instead. This is the `check:locator-ambiguity`
class of failure in a place that gate does not reach (it covers `SectionCard` titles only).

## 11. Three fields the seed shipped and nothing showed (2026-09-03, autonomous pass 3)

**What.** `check:field-coverage` lists fields the seed computes, ships, and no surface reads.
Three of them changed how a number should be weighed, so their absence was not cosmetic:

- **`spend_share_pct`** (per result event and per intent class). The Library header said
  "Conversion-led" without saying whether that is 91% of the money or 34% of it; it now names the
  dominant class's share, read from the seed, whose grain (account-wide) matches that header's.
  The results-by-event table on the account overview gains a Share column computed from the rows
  the table itself shows — that table is windowed by the date preset, and putting the seed's
  full-flight percentage beside a windowed dollar figure would be two grains in one row.
- **`lift_basis`** (`concept_rollup`). "23% above baseline" means opposite things depending on
  whether the engine compared cost per result or link CTR. The Findings concept card now names
  the basis when the row carries one, and reads as it always did when it does not.
- **the per-event intent class** on the results-by-event table, joined from the seed's
  `result_events`. An event's class is a property of the event rather than of the window, so that
  join is safe under any date preset.

Also in this pass: `ActionQueueView` and `listen/RecommendationsView` read the same derivation
entry 10 introduced, through `toLoopCards`, which adapts it to the seed's own
`RecommendationCard` shape (the derivation's source lands in `source_path`, a field that shape
already has). Both surfaces were empty on every account for the same reason the hero was.

**Why.** Owner: "ensure all modules are fully populated with available authority data to maximise
ad confidence". A field that is computed, stored, shipped and never read is authority data the
reader is paying for and not getting.

**Where.** `pages/metrix/AdAccountOverview.tsx` (Share column, intent chip),
`analysis/IapLibraryView.tsx` (`intentSummaryFragments`), `analysis/FindingsView.tsx`
(`liftLabel` takes a basis), `act/ActionQueueView.tsx`, `listen/RecommendationsView.tsx`,
`lib/data/recommendations.ts` (`toLoopCards`), and
`pages/metrix/__tests__/authority-data-surfacing.test.tsx` (new, 8).

**Reach.** Chrome only. No seed or server change: every field read here was already shipped.

**Still unread, with the reason.** `WorkspaceBilling` (7 fields) and `AppDefaults` (5) have no
surface because neither feature is built; `OptimizationLoop.manager_overview_visibility` and
`dismiss_policy` are behaviour config the client does not honour yet;
`CreativeAssetRow.content_hash` / `normalized_value`, `VariableEvidenceRow.source_ref` /
`asset_key` and `SegmentDims.asset_*` are reconciliation internals whose surfacing belongs with
the evidence drill-down, not with this pass. `check:field-coverage` remains a worklist, not a
verdict — it under-reports by design.

## 12. The tile pattern reaches the pages whose subject it is (2026-09-03, autonomous pass 4)

**What.** Task #38 — "apply the IAP Library tile pattern throughout" — on the two pages that
carried the account's most interpretive content with no measured header:

- **Creative DNA**, the page about variables, had no tiles at all: a reader arrived at gene loci
  with no idea how much money the scope in front of them represents. It now carries a
  configurable `KpiTileRow` built from the same landed, run-scoped variable rows the loci read,
  and a tile opens the shared `KpiDrilldownModal` — whose dimensions include one per variable
  family, so the page's own subject is one press away.
- **Avatars** had four structural counts (profiles, pillars, segments, matrix avatars) and not one
  figure about money. Those stay — they answer "how many", which no performance tile does — and a
  labelled "Audience performance · this result scope" row sits under them, built from the same
  scoped demographic rows the segment cards read.
- **The variable drill-down's segment rows** carried the volume band as a signal tag and dropped
  the per-segment evidence state the rollup already computed (only the header's worst-of survived).
  Each row now carries its own `EvidenceChip`: two segments can share a volume band and rest on
  different evidence — reconciled ad-grain rows in one, a name-keyed join in the other — and the
  reader deciding which to fund needs that on the row. Rendered as a span, so it never nests a
  control inside the row's button.

**Why.** The tile pattern is how this product states a measured number with a way into its
breakdown. A page that interprets variables or audiences without one asks the reader to trust an
interpretation whose scale they cannot see.

**Where.** `pages/metrix/analysis/AnalysisDnaView.tsx`, `pages/metrix/strategy/AvatarsView.tsx`,
`components/creative/VariableDrilldownModal.tsx`,
`pages/metrix/__tests__/tile-pattern-reach.test.tsx` (new, 4).

**Reach.** Chrome only. The structural tiles, the run-scope narrowing test that reads the Message
pillars tile, and every existing segment assertion are untouched.

## 13. The last charts join the theme (2026-09-03, autonomous pass 5)

**What.** The chart pass's remaining surfaces (master plan §4 Phase D, register C-3/C-5/C-6):

- **StrategyOverview's coverage meters** were painted from `--metrix-gold` and `--metrix-success`,
  two legacy aliases no other chart uses, with a raw `hsl(var(--foreground) / 0.18)` for the low
  tier. They read from `VERDICT` now — the theme's diverging polarity set — which gains a
  `partial` step for the middle tier rather than borrowing a categorical hue for it.
- **The Audience positioning map** carried five raw colour literals and 9/10 px type: the grid,
  axis lines, tick fills, the bubble stroke and label, and the median reference lines. All of them
  are `AXIS`, `CHART_TYPE` and `MARK` now, so the scatter recesses the way every other chart does
  and its smallest type sits at the 11 px chrome floor instead of 9.

**Why.** One theme or no theme. A chart that keeps its own colours and its own type scale is a
chart that will drift, and the two that were left were the two a demo actually opens.

**Where.** `components/charts/chartTokens.ts` (`VERDICT.partial`),
`pages/metrix/strategy/StrategyOverview.tsx`, `pages/metrix/analysis/AudienceView.tsx`.

**Proof.** `check:chart-geometry` and `check:accessible-names` PASS against a dev server;
`check:unexplained-dashes` clean over 684 dashes across 16 routes × 2 accounts. Client suite
2,520. The eight static gates PASS.

**Reach.** Chrome only. No data change; every figure these charts draw is the one it drew before.

## 14. The wayfinding leftovers, and two owner decisions (2026-09-03, autonomous pass 6)

**What.**

- **A history row arrives already scoped (N-5).** "Open in Analysis Overview" left the reader to
  find, in the run picker, the run they had just clicked. The link carries `?run=<id>` and
  `usePersistedRunScope` applies it on arrival — once per account+run, only when the run list is
  loaded and actually contains the id, and by writing into the SAME stored selection the picker
  owns, so the picker still holds the scope afterwards and a later change is not fought by the
  URL. A stale id is ignored rather than emptying the page.
- **A linked recommendation opens (N-10).** A manager recommendation links to
  `/app/listen/recommendations?focus=<id>` and landed the reader on the deck's first card.
  `RecommendationDeck` takes a `focusId` and opens that card, once, and only when the deck really
  contains it.
- **Data Provenance ends somewhere.** The page closed with a wall of lineage and no way forward;
  it now offers the analysis centre and the IAP Library — the two places a provenance read
  continues.
- **Owner decision: the MST "Creative Scan" is "Sprint Asset Check"** (N-13). Two pages carried
  one name; the Creative section's page is the scan, and the MST one checks a sprint's assets
  against the matrix before launch.
- **Owner decision: Findings is a visible page** (N-6). It was hidden "until its producer runs for
  real accounts" — but its producer is `intelligence.failure_patterns` and `concept_scores`, which
  every configured account carries, and since entry 10 its recommendations derive from those rows.
  A page with real content reachable only from one cross-link is a page most readers never find.

**Where.** `lib/run-scope.ts`, `analysis/AnalysisHistoryView.tsx`,
`components/deck/RecommendationDeck.tsx`, `listen/RecommendationsView.tsx`,
`settings/DataProvenanceView.tsx`, `navigation/navTree.ts`, `mst/MstCommandCenter.tsx`,
`lib/__tests__/run-scope-deeplink.test.tsx` (new, 5), and the sidebar test, which now derives
"which children appear" from the tree instead of naming Findings as hidden.

**Reach.** Chrome only. `?run=` is read by `usePersistedRunScope`, so every page using the picker
accepts it; no other query contract changed.


---

## 15. The friction gate, and a badge that called success a warning (2026-09-03, autonomous pass 7)

**What.**

- **`check:friction` is promoted from a scratch harness to a checked-in gate.** It walks every
  route `navTree.ts` and `App.tsx` declare (51 today, legacy redirects excluded so a finding is
  never filed against the wrong page) for two fixture accounts at 1440 and 390 px, and separates
  two kinds of finding. **Defects**, never baselined, must stay at zero: an uncaught exception or
  console error, horizontal overflow, a `<button>` nested in a `<button>`, and copy the
  signal/coverage rework retired. **Ratchets**, held per route in
  `scripts/src/check-friction.baseline.json`, count first-layer warning boxes, warning glyphs and
  prose over the rulebook's 220 characters — a route may lower its count freely, and raising it
  fails. No-data phrases are held as a SET per route rather than a count: "No creative scan yet"
  on the Creative Scan page is the loop's honest empty state, while the same sentence on Analysis
  Overview means a surface stopped reading a dataset its siblings still have, and only the phrase
  and the route together can tell those apart.
- **A brief's status stopped being painted as a problem.** Every status chip on the Creative
  Command Center wore the amber warning tint, so `Generated · High` — the best outcome the
  generation engine can report — was the same colour as a failure, and a page of briefs read as a
  page of warnings. The chip is now the Brief Builder's neutral one. That page also fell through
  to the RAW enum: its private `STATUS_LABEL` knew three statuses, the engine writes more, and
  `GENERATED_HIGH` sat on screen in an uppercase chip. `humanizeEnum` had already been written for
  exactly this bug and wired into the Builder only — because the lookup existed TWICE. There is
  now one `briefStatusLabel` in `lib/normalize.ts` and no private copy. The same stale-map
  fallback in `CreativeExpandDialog`'s QA chip reads through `humanizeEnum` too.
- **The motion, focus and numeral sweep found nothing to fix, and that is the finding.** Reduced
  motion is honoured globally (`index.css` zeroes `--transition-speed`, `--mx-fast`, `--mx-med`
  and every animation/transition duration under `prefers-reduced-motion: reduce`) and by the three
  components that animate in JS. `:focus-visible` paints a full-opacity 2px primary ring with a
  contrast test already guarding the value. Every numeric table cell and tile figure across
  nineteen data-heavy route visits already computes `font-variant-numeric: tabular-nums` —
  measured, not assumed.

**Where.** `scripts/src/check-friction.mjs` (new), `scripts/src/check-friction.baseline.json`
(new), `scripts/package.json`, `lib/normalize.ts`, `lib/__tests__/normalize.test.ts`,
`creative/CreativeCommandCenter.tsx`, `creative/CreativeBriefBuilderView.tsx`,
`components/creative/CreativeExpandDialog.tsx`, and `tests/e2e/metrix-iap-ad-account-overview.spec.ts`.

**What proves it.** The gate found the badge fix on its second run: 206 first-layer warning boxes
across the app before, 160 after, with `/app/creative` reported below baseline. `normalize.test.ts`
covers `briefStatusLabel` including a status no map has heard of. The tabular-numeral and
reduced-motion results are browser measurements, not source reads.

**Reach.** `check:friction` is NOT wired into `.replit`, for the same reason
`check:accessible-names`, `check:chart-geometry` and `check:unexplained-dashes` are not: it needs a
running dev server, and a validation that cannot run without one fails every validation sweep. It
is an operator gate, run beside its three siblings. `briefStatusLabel` is display-only — no seed
field, route or stored value changed.

---

## 16. The loop gates asked for a run record, not for data (2026-09-03, autonomous pass 7)

**What.** Two command centres locked their own stage on the demo account while displaying the
very data that stage consumes. The visual pass found both on one screen each.

- **Strategy** gated on `stage-status.analysis.status === "success"`, which reports the latest
  MANUAL analysis run: `getLatestAnalysisRun()` reads `manual_analysis_runs`, falls back to
  `report_pulls` for live-Meta accounts, and returns null for everything imported. So the page
  said "this account doesn't have a completed analysis run yet" directly beneath tiles reading
  3 message pillars, 4 hypotheses and 4 ICP profiles, and beneath a recommendation naming $32.15
  per result — all computed from the analysis rows the gate said were missing. It now gates on
  `validated`, the server's own account-wide completeness verdict, which
  `verifyAnalysisRunCompleteness()` already computes for exactly these accounts. `validated`
  ALONE decides: a successful run whose surfaces came up short must still hold the gate, so run
  success is not a second ticket through it, and a run in flight holds it with a message that
  says so.
- **Creative** gated on `stage-status.strategy.status === "success"` — the latest strategy
  GENERATION run — so an account whose strategy arrived through the importer was told "Generate
  strategy first" above a list of its sixteen briefs. The server never agreed: `storedPillars()`
  in `generationEngine.ts` takes "the CURRENT generated set if one exists, else the imported
  set", so the generation the gate refused to offer would have worked. It now asks for the input
  the generator consumes — message pillars, imported or generated.
- **One column width across all four command centres.** They were `max-w-3xl` (Analysis,
  Strategy), `max-w-4xl` (Creative) and `max-w-5xl` (MST), so the content column jumped between
  three widths as a reader walked the loop, and the same Execution-card pattern rendered its
  tiles 2-across on Strategy and 4-across on Creative — a width workaround, commented as one.
  MST's, the widest content, sets it for all four; Strategy's tile grid is now the same
  `grid-cols-2 md:grid-cols-4` as Creative's.

**Where.** `strategy/StrategyCommandCenter.tsx`, `creative/CreativeCommandCenter.tsx`,
`analysis/AnalysisCommandCenter.tsx`, and `__tests__/loop-gates-read-data-not-runs.test.tsx`
(new, 6).

**What proves it.** The new test drives both pages with the stage-status an IMPORTER account
really returns (`analysis.status: "none"`, `validated: true`, `strategy.status: "none"`) and
asserts each gate opens; it also asserts each still holds for the cases that must hold — no
pillars, surfaces not validated, a run in flight — and that the successful-but-incomplete case
still says which of the two it was. Browser screenshots at 1440 and 390 px confirm both pages.

**Reach.** Client gate predicates only. No endpoint, seed field or generation contract changed —
and the MST gate needed nothing, because `mst.unlocked` was already `briefsCount > 0`, a fact
about data rather than about a run.

---

## 17. A locator that named a control by the words in it (2026-09-03, autonomous pass 7)

**What.** `smoke:metrix-iap-hover-popover` failed one of its 26 tests after the recommendation
slider shipped, and the failure named the wrong thing: "waiting for `Diagnose full breakdown` to
be visible". The popover was fine. `openDrilldown()` found its tile with
`page.locator("button").filter({ hasText: tileLabel }).first()`, and the slider had arrived
carrying a recommendation titled "traffic_quality - reach without qualified action" — which
contains "Reach", comes earlier in the DOM, and sits scrolled off inside the horizontal rail. The
hover landed on a control 1,300 px off-screen, so no popover opened.

Five tile locators used that form. All five now scope to `[data-testid="kpi-tile"]`, which is the
tile and nothing else. `check:locator-ambiguity` learned the pattern: it flags
`locator("<tag>").filter({ hasText: … })` where the text is a string literal, an identifier, or
an unanchored regex, and exempts an ANCHORED regex (`/^Segment$/`) because `^` is exactly what
`exact: true` buys elsewhere. Ten existing call sites use the anchored form and are correct; the
gate passes at 0 findings.

**Where.** `tests/e2e/metrix-iap-hover-popover.spec.ts`, `scripts/src/check-locator-ambiguity.ts`,
`replit.md`.

**Reach.** Test infrastructure. The gate's new rule reads `tests/e2e/*.spec.ts` only, adds no
runtime dependency, and runs in the same second as the rest of it.

**Why it matters beyond one spec.** This is the second time a locator matched by substring and
resolved to something the author never meant — the first cost nine tests in one file and left
others broken behind a fail-fast run. Both times the failure message described the assertion, not
the locator, which is what makes the class expensive to diagnose. A locator should name a control
structurally; the words inside it belong to the product and will change.

## 18. The UI/UX overhaul: one loop shape, one vocabulary, no em dashes, Sonner (2026-09-03)

**What.** The six-phase overhaul recorded in `METRIX_UI_UX_OVERHAUL_2026-09.md`. The
architectural pieces: (1) the toast layer is Sonner behind the unchanged `useToast` API
(`command-deck/hooks/use-toast.tsx` forwards; the Radix reducer and `ui/toaster.tsx` are
gone); (2) the run chain on Account Overview counts with the loop's own numerals and draws
Data and Reports as icons (`LoopCommandChain` `stageNumber: number | null`); (3) engine
diagnosis codes pass through `humanizeDiagnosis` before a reader sees them; (4) the four
Exports pages render as cards on the Exports page (`ExportsCards.tsx`), their nav rows hidden,
routes kept; Reports lands on the builder; Listen renders its high-impact signals; (5) the
route host moves focus to the page on navigation and names it by the arriving heading;
(6) the copy carries no em dashes (1,076 replacements by rule; the data-path delimiter kept);
(7) a visual crawler (`shoot:routes`) that every screen claim in the record cites.

**Why.** Owner (2026-09-03): restore the visual regressions and the undisclosed items, then
run the end-to-end overhaul prompt autonomously with a triple validation pass; keep the
palette; no em dashes; clarity over novelty; flag backend changes rather than make them.

**Where.** Listed file by file in the record's §2.2, §4.4, §5 and §6.

**Proof.** The record's §7: typecheck, the client suite, the twenty static gates, the four
browser gates, the sixteen e2e smokes, and the crawl at both widths, all on the same head.

**Reach.** Client and the shared design-system hook. No server, schema or integration change;
the backend items are flagged in the record's §8.

## 19. The next best action is a rail, and one drawer behind every recommendation (2026-09-04)

**What.** (1) `NextBestActionCard` is removed. Account Overview's next best action is
`RecommendationSlider` given a `scopeId`: the same rail the command centres carry, with Add to
Tray and Dismiss on each tile (the deck's `decisionStore` / `trayStore`), a decided tile
leaving the rail, and two empty states that tell "nothing derived" from "everything reviewed".
(2) `RecommendationDrawer` (`components/deck/`) is the one disclosure behind a recommendation:
a Radix Dialog side sheet (`.mx-drawer` / `.mx-scrim` in `index.css`, 200 ms in, 150 ms out,
none under reduced motion) carrying the whole reason, the action, the confidence verbatim, the
provenance, the number, the evidence link and the decision. The rail's tiles open it from
their title; `RecommendationDeck`'s private `DetailDrawer` is deleted and the deck opens the
same one (its swipe-left is now "Dismiss", the word its tab already used). (3) The kind
vocabulary and the impact tint live in `components/deck/recommendationKind.ts`, read by the
rail, the drawer and the deck. (4) The rail gains mouse drag on its ground (a drag past 6 px
swallows the click), page dots that jump a viewport, a page indicator, and Left / Right /
Home / End on the focused rail. Its title everywhere is "Next best actions".

**Why.** Owner (2026-09-04, with a screenshot of the hero): make it a tile slider that carries
more than one signal, that a reader can swipe between and click into for more. The hero showed
one signal and repeated the rail's first tile beneath it; two surfaces for one derivation.

**Where.** `components/deck/RecommendationSlider.tsx`, `RecommendationDrawer.tsx`,
`recommendationKind.ts`, `RecommendationDeck.tsx`; `pages/metrix/AdAccountOverview.tsx` and
the four command centres; `index.css`; tests in `components/deck/__tests__/` and
`pages/metrix/act/__tests__/action-queue-shared-impact-rank.test.tsx`; e2e
`tests/e2e/metrix-iap-ad-account-overview.spec.ts` test 4.

**Proof.** `recommendation-slider.test.tsx` (decisions, tray, the two empty states, the
drawer's contents and its decision, drag swallowing the click, arrow keys only on the rail);
the overview e2e (one rail or one empty state, every tile titled and sourced, the drawer opens
and closes); the static and browser gates and the crawl, recorded in the overhaul record §10.

**Reach.** Client only. The decision and tray stores, the derivation and the seed are untouched.

## 20. A copy signature in a btree key (2026-09-04, live failure, backend, flagged)

**What.** A live run on a client account (owner screenshot, 02:59Z) failed with Postgres's
`index row size 3432 exceeds btree version 4 maximum 2704 for index
"ad_breakdown_performance_account_id_manual_analysis_run_id__key"` (the project's own postgres
logs, read through the Supabase MCP). The unique key on `ad_breakdown_performance` carries
`segment_key`, and for an asset breakdown `segmentKeyOf()` put the copy signature's whole text
(`asset_value`: headline + primary text + description, joined) into it, beside the `asset_hash`
that already identifies it. Two changes, both backend, both on the branch and NOT applied to the
live project: (1) `reconciliation.ts` `segmentKeyOf()` leaves `asset_value` out of the key
(the value stays on the row, in `segment`); (2) `schema.sql` drops that unique constraint and
creates `ad_breakdown_performance_identity_key` on the same columns with `md5(ad_identity)` and
`md5(segment_key)` in place of the raw text, so no future identity can hit the limit. The writer
inserts run-scoped rows and never upserts on this key, so the expression index changes nothing
for it. The client's Evidence tab labelled an asset segment by its key; it now labels it by the
asset's own value, and the run controls show a failed run's error whole rather than as one
truncated span (the screenshot showed "index row size 3432 exceeds b…" and nothing after it).

**Why.** A key names a row; it does not carry the row. The limit is Postgres's, and 2,704 bytes
is smaller than one long primary text.

**Where.** `artifacts/api-server/src/lib/reconciliation.ts`; `scripts/src/metrix-supabase/schema.sql`
(after `ad_breakdown_performance_account_run_idx`); `artifacts/metrix-iap/src/components/evidence/EvidenceTab.tsx`.

**Proof.** The seven reconciliation suites and the 35 pure api-server suites pass; the schema
block is idempotent (`drop constraint if exists`, `create unique index if not exists`) and is
applied by `import:metrix` / the schema step. **For the live project the two statements must be
run once** (Supabase SQL editor, or `apply_migration`); the failed run can then be re-run from
the account's setup screen. This was flagged to the owner rather than applied.

**Reach.** Server (one pure function), importer DDL, one client label. The reconciliation
contract (`docs/specs/iap-multi-report-reconciliation.md`) is unchanged: a copy signature is
still identified by its hash, which the spec already states.

## 21. Creative uploads take the chunked transport (2026-09-04, live failure)

**What.** Five creative videos failed to stage with a bare `Upload failed (HTTP 413)` (owner
screenshot). A creative asset always went up as one base64 JSON body, and the deployment proxy
rejects large bodies before Express sees them; the chunked transport that carries performance
reports above 20 MB was closed to `creative_asset`. Now: the chunked init admits `creative_asset`
(capped at the single-request 75 MB, not the report's 150 MB), completion stages a creative
exactly as the single-request route does (content-type mismatch check, md5 duplicate guard, the
server-side ad-name auto-map, `link_result` in the response; the auto-map block moved from
`accounts.ts` into `autoLinkStagedCreative` in `routes/metrix/shared.ts` so both routes share it),
and the client sends a creative above 20 MB in chunks and re-sends a smaller one in chunks if a
single request still meets a 413. The OpenAPI contract's `ChunkedUploadInit.kind` enum carries
`creative_asset` and the generated clients are regenerated. The dialog's cap copy reads the
constant (it said 50 MB beside a 75 MB limit), and a 413 reads "Too large for one request".

**Why.** The cap is the proxy's, not the file's; the only transport that scales past it already
existed and was one enum value away.

**Where.** `lib/api-spec/openapi.yaml`; `artifacts/api-server/src/routes/metrix/{uploads,accounts,shared}.ts`;
`artifacts/metrix-iap/src/pages/metrix/ConnectAccountDialogs.tsx`; the regenerated `lib/api-zod`
and `lib/api-client-react`.

**Proof.** `check:api-codegen-drift`, typecheck, the api-server pure suites, the dialog suites and
the static gates on the branch; the live check is the next creative upload over 20 MB.

**Reach.** Upload transport only. Staging semantics, the run, and the schema are unchanged.

## 22. The first run has a surface (2026-09-04, owner screenshots)

**What.** (1) `lib/data/accountSource.ts`: `isManualAccount` / `hasLiveMetaConnection` read
`source_status`, and `UnconfiguredState`'s checklist and `LoopCommandChain`'s Data stage read them
instead of the platform string (every account is platform "Meta Ads", so a manual account counted
as a live connection: its checklist said "Connect data source" with exports already staged, and
the chain marked Data complete with nothing staged). (2) `firstRunSteps` in `shared.tsx` is the
one first-run checklist, from what is really staged: any delivery report (the server contract, not
"both pivots"), creatives optional, Run analysis last. (3) `ModuleScopeGate` takes
`allowUnconfigured`; the Analysis command centre passes it and, before the first successful run,
carries the checklist as a "Set up this account" strip above its Run analysis, Manual import and
Run history cards and hides the export and explore grid. The checklist's "Run analysis" step lands
on a page that can run, and on the centre itself it scrolls the run card into view and hands it
focus (`firstRunSteps`' optional `run` handler) rather than linking to the page the reader is on.
The centre's Manual import card carries an "Add import" control that opens `ManualImportDialog`
for every account (its empty state used to point at Settings → General), and Analysis › History
passes `allowUnconfigured` too: a run history exists from the first attempt, and the centre's
"Full history" link used to land on the checklist. (4) `tests/e2e/metrix-iap-first-run.spec.ts`,
wired as `smoke:metrix-iap-first-run` in the smoke list, synthesises an unconfigured manual
account with a staged export and a failed run and asserts all of it, the reveal, the dialog and
the history page included, at 1440 and 390 px. (5) `smoke:metrix-iap-build`'s composite
routing check (port 80) runs only when a router listens and is skipped with a NOTE when the
connection is refused; `METRIX_IAP_COMPOSITE_BASE_URL` makes it mandatory. It was red on main in
GitHub Actions, where nothing serves port 80, so every PR's build smoke failed for a reason that
was not the PR's.

**Why.** Owner (2026-09-04): "the command center does not surface the functionality to stage and
run and see analysis run history." It did not: the gate sent an unconfigured account to a
checklist whose run step pointed back at the gate.

**Where.** `artifacts/metrix-iap/src/lib/data/accountSource.ts`, `pages/metrix/shared.tsx`,
`pages/metrix/analysis/AnalysisCommandCenter.tsx`, `analysis/AnalysisHistoryView.tsx`,
`components/loop/LoopCommandChain.tsx`; tests `account-scoping`, `loop-command-chain`,
`shared-exports`, `analysis-command-center-canvas-fidelity`; the new spec and smoke;
`scripts/src/smoke-metrix-iap-build.ts` for the routing guard.

**Proof.** The smoke (4/4 at both widths), the eleven suites that render the checklist, the chain
and the centre (358 tests), typecheck and the static gates.

**Reach.** Client only. Account creation, the run, and the status promotion are unchanged.

## 23. The schema applier stops convoying production (2026-09-04, incident)

**What.** `scripts/src/apply-supabase-schema.ts` (run by `scripts/post-merge.sh`, which the Replit
`[postMerge]` hook runs on every merge into the workspace) now applies `schema.sql` one statement
per transaction with `lock_timeout` 3 s, retries a statement that lost a lock race (55P03, 40P01,
57014) with backoff up to five times, records the schema fingerprint in `metrix_schema_state` and
skips when unchanged, and waits up to ten minutes for a running analysis before touching tables.
The pure parts (`splitSqlStatements`, dollar-quote aware; `decideApply`; the retry classifier) live
in `scripts/src/lib/schema-apply.ts`; the pg-bound runner in `lib/schema-apply-runner.ts` is shared
with the importer's schema step, so neither path can regress to one-shot application.

**Why.** The applier sent the whole 1,900-line file as one simple query. Postgres runs that as one
implicit transaction, so every ACCESS EXCLUSIVE lock it took (about eighty `alter table … add
column if not exists`, which lock even when the column exists) was held until the last statement
ran. On 2026-09-04 it ran at 05:24Z (my convergence), 05:47Z and 06:04Z (the platform hook, after
a task merge). Behind one long PostgREST read the DDL waited, and every app read then queued behind
the DDL: `postgres_logs` show "still waiting for AccessShareLock" and 150 "canceling statement due
to lock timeout" cancels between 05:24 and 06:09, `postgrest_logs` 63 55P03 errors handed to the
API, and the owner's boot splash sat at "Still waiting on the data service after 48s".

**Where.** `scripts/src/apply-supabase-schema.ts`, `scripts/src/lib/schema-apply.ts`,
`scripts/src/lib/schema-apply-runner.ts`, `scripts/src/metrix-supabase/import.ts` (schema step);
tests `scripts/src/schema-apply.test.ts`, `schema-apply-runner.test.ts`.

**Proof.** The splitter test runs on the real `schema.sql` (242 statements, every `do $$` block
intact); the runner test drives a fake client through lock-loss retry, give-up and a syntax error;
`--dry-run` lists the statements without connecting. The live proof is the next post-merge run's
log line ("applied … statements", then "unchanged … nothing applied" on the run after) and an
empty lock-timeout count in `postgres_logs` for that window.

**Reach.** Operator scripts only. No runtime code, no schema content change; one new marker table
`metrix_schema_state` (one row). Open: `pnpm --filter db push` in `post-merge.sh` printed "No
changes detected" and then the hook timed out at 06:05:31Z; not root-caused here.
