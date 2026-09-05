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

**Reach.** Operator scripts, plus two small runtime reliefs for the same boot stall shipped in
the same PR: `lib/coalescedCache.ts` serves the stale bundle past the TTL while ONE background
rebuild runs (an explicit invalidation stays a cold rebuild, so a reader who just mutated sees
fresh data), and `index.ts` warms the seed at boot. No schema content change; one new marker
table `metrix_schema_state` (one row). Open: `pnpm --filter db push` in `post-merge.sh` printed "No
changes detected" and then the hook timed out at 06:05:31Z; not root-caused here.

## 24. A whole-period export is a period, and files that cover the same ads count once (2026-09-04, live defect)

**What.** Two grain rules the engine had for one class now hold for every class, in one place.
`wholePeriodOf` (`analysisEngine.ts`) names the period of a file whose rows all carry the same
reporting start (Meta's ad-level exports without the Day breakdown; the parser aliases "Reporting
starts" to "Day"): a later stated reporting end proves it, and without one a multi-day companion
file does (the AAFE heuristic, kept). The run keeps that period on the row. Whole-period rows never
build daily ad buckets while any daily row exists (`mergeAdPerformanceBuckets` `periodOf`; the ads
only they carry are counted and warned as `periodOnlyAds`), a run with no daily source at all
stamps every ad row start→end (`grain: "period"`), and the demographic / placement / platform /
device rows carry `date_start` = period start and `date_end` = period end with the period in the
bucket key. Overlaps between files are one rule in `lib/reportOverlap.ts` (`OverlapResolver`,
`resolveClassOverlaps`): for every ad a file covers, on a day or over its period, a daily file
beats a whole-period file, then the finer delivery breakdown wins, then the later-staged file; the
loser's rows for that ad are not counted and the run says which file, how many rows, how much
spend and why. The engine's class arrays, the reconciliation observations (per breakdown) and the
truth candidates (`summariseReports`) all use it; an asset pivot competes only with a pivot of the
same asset columns, as the ledger keys asset observations by asset type. Imports are read oldest
first so "later staged" means something. `computeDataCoverage` takes the whole-period classes' periods, grades a
whole-period ad summary as a control rather than a slice, and tells a pivot whose period reaches
beyond the daily rows apart from a duplicate.

**Why.** The Pure Path account staged, per the new process, a Platform × Placement pivot and a
Platform × Placement × Impression device pivot of one 28-day period, a 28-day and a 30-day daily
Ad Summary, and two Gender × Age pivots of the period. Every pivot's rows carried 2026-08-06 as
their day. The engine built the daily ad buckets from the placement rows first, so each pivot put
its 28-day total on one day, the two pivots summed to $2.68M on that day, the daily summaries
added their $1.39M beside it, and `ad_performance` read $4,072,100 against Meta's $1,437,538. The
placement and platform tables carried both pivots ($2.68M), the truth summed both Ad Summaries
($2.77M), and the coverage baseline, being the inflated ad rows, saw nothing wrong. The
whole-period detection existed only for the ad summary (`detectAggregateAdSummary`, retired here),
and the per-file overlap rule only in the observations, at day-level keys that two files of
different depth never share.

**Where.** `artifacts/api-server/src/lib/reportOverlap.ts` (new), `lib/analysisEngine.ts`
(`wholePeriodOf`, `mergeAdPerformanceBuckets`, `computeDataCoverage`, `coverageWarnings`,
`overlapWarning`, `wholePeriodWarning`, the parse and window stages of the run),
`lib/reconciliation.ts` (`buildObservations`, `summariseReports`, `breakdownDepth`,
`OverlapRecord.reason`). Tests: `__tests__/reportOverlap.test.ts`,
`__tests__/analysisEngineCoverage.test.ts` (rewritten), the two overlap describes appended to
`__tests__/reconciliation.test.ts`.

**Proof.** The unit tests reproduce the Pure Path shape: a whole-period pivot beside a daily
summary builds 28 ad rows summing to the summary's total, never the pivot's total on the first day;
two placement files of different depth yield the finer file's spend once; a joint Gender × Age ×
Text file loses its demographic margin to a plain Gender × Age file and keeps its asset margins;
two daily Ad Summaries of the same window are one control at the fixture's account truth. The live
proof is the next Pure Path run: `ad_performance` sums to the 30-day Ad Summary's total, the
placement and platform tables to the device pivot's, and the run's warnings carry one `[Overlap]`
line per superseded file and one `[Whole-period]` line per pivot.

**Addendum (same day).** The first re-run with the fix failed at 88% with "TypeError: fetch failed": PostgREST's
timeout manager killed the 140th of 178 `ad_breakdown_performance` batches after 139 had landed in six minutes,
and the run's own cleanup threw thirteen minutes of correct rows away. `lib/chunkedInsert.ts` now recovers a
batch that lost its connection: a batch is one statement, so counting the run's rows in the table says whether
it landed; a lost batch is sent again in halves with backoff, a landed one is kept, any other count stops the
run, and a database error is never retried. The wide evidence tables go in batches of 250.

**Addendum 2 (same day, from the high-confidence review of #202).** The grain now records the header the Day
column resolved from (`day_header`) and `wholePeriodOf` reads it: "reporting starts" is a period, "day" is a day
even beside multi-day files, so a genuine one-day daily pivot is never stamped as a period; a non-ISO stated end
never becomes the window end. In period grain one ad is one row whatever periods its classes state. Creative
metadata is read from every Ad Summary file's rows before overlap resolution. A class mixing daily rows with a
whole-period file's surviving rows is judged on its daily rows, never called a duplicate. Coverage returns its run
warnings structurally (no prose sniffing). Imports and the ledger's reports are ordered by `created_at`, so "later
staged" is staging order, not class order. The client keeps "Reconciliation check failed" as attention under the
`[Coverage]` prefix. The window end reads only files that still contribute rows.

**Reach.** The analysis engine and the reconciliation layer; no schema change (the breakdown
tables already carried `date_end`), no API change (the coverage note text changed, the shape did
not). Surfaces that read `date_start` alone (the summary readers' view presets) treat a period row
as starting on its start day, which is what the misdated rows did before; a preset shorter than
the period excludes it, honestly. Open: the ledger still compares a whole-period pivot with the
truth summed over the run window, so a 28-day pivot beside a 30-day summary reads as 93% covered
rather than as a period mismatch; summing the daily truth over the pivot's own period is the next
step, recorded in the spec.

## 25. A working run is never reclaimed, and the ledger is linear in ads (2026-09-04, live hazard, backend, flagged)

**What changed.** Three things the Pure Path run 8148628c exposed on the #203 build, plus the fixes
the high-confidence review of #201 and #203 asked for.

- **The heartbeat ceiling measures from the last progress write, not from the start.**
  `runHeartbeat.ts` keeps the live heartbeats in a registry; `touchRunHeartbeat(table, runId)`
  re-arms a run's ceiling, and `analysisEngine.updateProgress` calls it on every stage boundary and
  writes `heartbeat_at` with the progress (guarded on `status = 'running'`). Why: the ceiling
  (`MAX_HEARTBEAT_MS`, 30 minutes) measured from `started_at`, and the Pure Path run takes over 30
  minutes, so the interval stopped attesting at 10:46Z while the run was still working; the next
  read of the run list would have flipped it to error and deleted its outputs. A run that keeps
  reaching stages is working, however long it takes; one that stops reaching them is the wedged case
  the ceiling exists for, and it is still reclaimed 30 minutes after its last progress.
- **The reconciliation stage yields between its three builds.** `buildObservations`, `buildTruth`
  and `buildLedger` are pure and synchronous; a progress write between them turns the event loop
  (the interval fires) and attests liveness itself, so a long build is never mistaken for a dead
  process. Stages 87 "Reconciling: the control per ad" and "Reconciling: the ledger" are new.
- **`buildLedger` is linear in ads.** One line looked up each ad's result type with `obs.find(...)`
  over the breakdown's whole observation list: quadratic in ads, about 98 million string comparisons
  at 1,751 ads and 112k observations, 95% of the ledger's time and the whole of a 25-minute
  synchronous stage. The result type is now read off the ad's first observation when its entry is
  created. Output byte-identical (rows, summary, observations checked at two sizes on a synthetic
  Pure Path shape); the ledger 20 to 25 times faster.
- **Review fixes (A2 to A5, B1, B2 in `METRIX_ASSESSMENT_ROUND_2026-09-04.md` §4).** The batch
  recovery count filters on `account_id` too (every composite index leads with it; the run id alone
  scanned the largest table). The HTTP status rides with an insert error and 0 or 5xx is retryable;
  the bare words "network" and "timeout" left the retry regex and "timed out" (the edge's phrasing)
  joined it. The `creative_assets` upsert retries a transport failure (idempotent). The unscoped
  recovery test plans both halves and asserts the stored rows. The schema applier's wait for a
  running analysis counts only runs with a sign of life inside the engine's 10-minute threshold
  (a dead 'running' row used to hold every later apply, after which no fingerprint was recorded and
  the schema change never landed), and only a missing table reads as nothing to wait for. The
  applier's marker table `metrix_schema_state` gets row-level security and the API roles revoked
  right after it is created, so the anon key can neither read nor forge the fingerprint that gates
  the skip.

**Where it lives.** `artifacts/api-server/src/lib/runHeartbeat.ts` (registry, `touchRunHeartbeat`),
`analysisEngine.ts` (`updateProgress`, the reconciliation stage, the chunked-insert client, the
creative_assets upsert), `reconciliation.ts` (the per-ad result type), `chunkedInsert.ts`,
`scripts/src/apply-supabase-schema.ts`.

**What proves it.** `runHeartbeat.test.ts` (the ceiling re-arms on a touch, stops without one, a
stopped heartbeat is forgotten), `chunkedInsert.test.ts` (the unscoped recovery asserts exactly),
the reconciliation suites unchanged (110 tests), and the profiling harness in the session's
scratchpad (`profile/patched-check.ts`: original 14.7 s, patched 0.69 s, identical output).

**How far it reaches.** The engine and the applier; no schema change (the applier's own marker
table gains RLS, which `schema.sql` cannot carry because the applier creates it first), no API
shape change (two new progress stage strings). Open from the review: A1 (a 23505 on a run-scoped
retry could be proven landed by a count), B3 (the hook's timeout targets pnpm), B4 (a splitter
test against the file's constructs). Held for the owner: H1 (a failed re-run empties the window),
task 22 (evidence on demand), task 23 (the rest of the run's time, which is PostgREST writes).

### 25, addendum: the seed reads a run's evidence by keyset, per account (2026-09-04, live incident)

**What changed.** `paginatedSelect.selectAllRows` takes `{ keyset: "id" }`: each page asks for the
rows after the last id it received (`gt` on the key, ordered by it, limited to the page size)
instead of an offset range. `metrixSeedAssembly`'s run-scoped evidence reads (breakdowns, ledger,
segments, evidence) go one (account, run) at a time with both keys in the filter, keyset-paged,
and a read that fails is logged with the table, account and run instead of vanishing.

**Why.** After the Pure Path run succeeded (162k ledger rows, 76k breakdown rows on top of the
earlier run's), every seed rebuild read `manual_analysis_run_id in (…)` with offset pages: the
filter could not use the `(account_id, manual_analysis_run_id, …)` index, so each of the 162
pages re-scanned and re-sorted the whole 292k-row table, PostgREST killed the later pages on its
statement timeout, the read fell to its `catch (() => [])`, the app read "no evidence" for a run
that had succeeded, and the next rebuild started the storm again (12:15Z to 12:40Z: thread kills
every few minutes, 504s on the evidence tables, direct SQL connections timing out). A run's rows
are contiguous in id, so a keyset page under the composite index is one short range.

**What proves it.** `paginatedSelect.test.ts` (keyset pages start after the last id seen, keep the
filter on every page, stop when a page comes short, refuse a key that is not selected, surface a
query error); the offset path's tests unchanged.

**How far it reaches.** The seed assembly only; identical rows in identical order. This does not
close task 22 (the seed still ships the evidence layer, ~270 pages per rebuild); it makes each
page cheap and honest. The Pure Path re-run on the fixed build was NOT started: the successful
run had destaged its seven files (`processed`), the POST answered 422, and restaging them to
re-run while the read storm was on would have risked the account's only good rows (H1).

**Correction (2026-09-05, the first live warm on this code).** The pages were read in full (163
ledger pages for Pure Path at both production and the workspace, 0 errors) and the account still
shipped with an EMPTY ledger: `runScoped` appended a run's rows with `out.push(...rows)`, and V8
throws `RangeError: Maximum call stack size exceeded` once a spread carries about 125,000
arguments (Node 22, measured; 162,141 ledger rows). The `catch` logged it and returned nothing,
which is the honest half. Fixed the same hour: `appendRows` in `paginatedSelect.ts` (a loop) is
the only way whole-table rows are appended, in both page loops and the seed's aggregation;
`paginatedSelect.test.ts` proves the spread throws at 170k and the loop does not, and reads a
131k-row keyset table whole. The pages never carried the risk (1,000 rows each); the aggregation did.



## 26. Keyset-supporting indexes on the four evidence tables (2026-09-05, schema, additive, approved by the owner the same day)

**What changed.** `schema.sql` gains one index per evidence table on
`(account_id, manual_analysis_run_id, id)`: `ad_breakdown_performance_account_run_id_idx`,
`reconciliation_ledger_account_run_id_idx`, `variable_segment_performance_account_run_id_idx`,
`variable_evidence_account_run_id_idx`. Nothing else: no column, no constraint, no code.

**Why.** The seed reads a run's rows by keyset on `id` (entry 25, addendum), and the keyset pages
are cheap (232 ms mean on the ledger over 206 calls on the 2026-09-05 01:29Z production warm). The
FIRST page of every (account, run) is not: none of the existing composite indexes end in `id`, so
`explain analyze` on the live table shows the planner serving `where account_id = $1 and
manual_analysis_run_id = $2 order by id limit 1000` by walking the PRIMARY KEY in id order and
filtering. It skips every lower id in the table before the run's rows (92,260 rows removed by
filter, 9.2 s on `ad_breakdown_performance` for Pure Path), and for a run whose ids sit below
another run's the last page walks to the end of the table (54 to 58 s maxima, `pg_stat_statements`,
20 first-page calls per table at 4.6 to 5.2 s mean). With the index, equality on the two run keys
plus a range on `id` in `id` order is one index range per page.

**What proves it.** `schema-apply.test.ts` still splits the real `schema.sql` cleanly (8 tests);
`apply-supabase-schema.ts --dry-run` lists the four statements. Confirmed on production after the
apply (2026-09-05 09:18Z, assessment §6.3): `explain (analyze, buffers)` on the first-page query
shows an Index Scan using the new index with both keys in the Index Cond and no filter, 264 ms on
`ad_breakdown_performance` (10,778 ms and 92,260 rows removed by filter before) and 1.6 ms on
`reconciliation_ledger` (9,408 ms, 155,300 removed); the apply took 43 s for 246 statements, the
two large builds 11.6 s and 11.1 s, with no lock timeout, no cancelled read and no error.

**How far it reaches.** DDL only, additive, idempotent (`if not exists`). Applied by the post-merge
hook through the one-statement-per-transaction runner: a plain `create index` holds a SHARE lock
(blocks writes, not reads) for the build, seconds on these tables, and the applier waits for a
running analysis first. Approved: drafted as commit d09cb6d on 2026-09-05 and held (PR #208, closed unmerged so the
working branch stayed mergeable); approved by the owner in the final reconciliation of the same
day (item 3 of `FINAL_RECONCILIATION_for_claude_code.md`) and re-applied as this entry's PR.

## 27. The Execution Layer shell and the status hub, first on Analysis; stage timings on runs (2026-09-05, sweep slice 1, additive schema)

**What changed.** Three new modules and one additive column.

- `artifacts/metrix-iap/src/pages/metrix/StageLayout.tsx` is the shell every Execution Layer page
  composes (sweep spec §3): header, spine, notice, status hub, execution card, direction rail,
  content, explore, in that order, one column, `max-w-5xl`. The execution card always sits above
  the rail; the hub always between the spine and the card. The gates stay outside it. At most one
  notice renders; a second is dropped and reported in development.
- `components/loop/StatusHub.tsx` renders `StatusHubModel` (`lib/loop/statusHub.ts`, §4): the
  loop's vocabulary as row labels (Staged · Running · Completed · Failed · History), fragments only,
  the run's warnings and its whole error behind `DetailReveal`. The in-flight row is `RunProgress`
  (the engine's stage as the label, the percent only when reported), the elapsed time, and an ETA
  only from evidence. A settled row arrives with `.mx-inline-toast` (a 160 ms fade and 4 px rise
  from `@starting-style`, no keyframes, none under reduced motion).
- `lib/loop/analysisEta.ts` (§4.3): the ETA is the median duration of this account's prior
  successful runs comparable with the one in flight, comparability being the date-range preset
  today (the spec's row-count band waits for staged files to carry row counts, §7.2); it reads
  "usually about N min", never a countdown. With `stage_timings` on finished runs it names the
  current stage once it has run past twice its usual duration here and past a 30 s floor.
- `manual_analysis_runs.stage_timings jsonb` (schema, additive): `updateProgress` writes one
  `{stage, pct, at}` per stage boundary, the whole list rewritten with every progress update in the
  same UPDATE that carries the percentage, and `finishRun` forgets the in-process list. `AnalysisRun`
  carries it (`StageTiming` in `openapi.yaml`, codegen regenerated). Rows from before the column
  read null; live-Meta pulls have no stages.
- The Analysis command centre renders through the shell. The card keeps the trigger and its
  parameters (`AnalysisControls progressInHub`, its pre-flight reaching the hub through
  `onStartingChange`); the rail moved below the run card; `CreativeNextStepNudge` no longer renders
  on Analysis, its fact is one line in the hub's inputs row with the Creative link (§3.4).

**Why.** Each stage page composed the same parts by hand in a different order with its own run
card, history card and banner rules (spec §0); a run's state was readable only inside the run card,
below the fold; the "usually finish within a few minutes" line on the card was a guess. The owner's
reconciliation asked for a status hub on each page so users know where their runs, imports and ETAs
stand (item 5, folded into each command centre), and for one contextual notice per page rather than
a stack of banners (item 11).

**What proves it.** `lib/loop/__tests__/analysisEta.test.ts` (median, comparability, stage
durations, the slow-stage rule and its floor), `statusHub.test.ts` (the four rows from run and
import records: inputs by class, the pre-flight, percent null when unreported, the failed row only
while it is the latest thing that happened and what remains shown), `components/loop/__tests__/
StatusHub.test.tsx` (the region, the labelled bar with `aria-valuenow` only when measured, the
warnings and the error behind the reveal), `pages/metrix/__tests__/stage-layout.test.tsx` (slot
order, one notice, the Analysis page's hub between spine and card and its rail after the card, no
second progress bar), `api-server/src/lib/__tests__/analysisEngineStageTimings.test.ts` (the cell's
three shapes, malformed entries dropped, append in order). The pinned Analysis tests keep their
assertions, two of them scoped to their card because the hub now carries the same words above it.

**How far it reaches.** Analysis only, on this slice; Strategy, Creative and MST move onto the shell
in slice 3 with the base-run control, Listen, Reports and Exports in slice 5. The schema change is
one nullable column, applied by the post-merge hook. The ETA rule is client-side and reads
`listAnalysisRuns`, which the page already polls at 3 s while a run is in flight.

**Live (2026-09-05).** PR #214 merged at 11:30Z on a green run. The workspace convergence's
post-merge hook applied the schema at 11:32Z: "Applying Supabase schema: 247 statement(s),
fingerprint d3176d08b13c (changed, previously 82fdfd86695c)", "applied: 247 statement(s) in 21 s",
no lock, retry, timeout or wait line; `information_schema.columns` reads `stage_timings jsonb` and
`metrix_schema_state` carries the new fingerprint with 247 statements. The restarted workspace API
server warmed its seed in 124.6 s with no "could not be read" line and no RangeError. The publish of the converged workspace (deployment 329ef7e0) started at 11:40Z and the public site served the new build at 11:45:43Z (`index-CMYzIOFm.js`, the `AnalysisCommandCenter` chunk carrying the hub's "Analysis status" region; the previous chunk carried none of it), `/api/healthz` 200 and `/api/metrix/auth/me` 401 through the router.
Every run recorded before this build carries `stage_timings: null`, so the hub's slow-stage note has
no evidence until at least one run finishes on it; the ETA reads the prior runs' durations already.

**Addendum, the same afternoon (owner review of the live page).** The stage's subpages move to the
top of the page as `HubNavStrip` (a new shell slot, `pages`, under the spine): a reader landing on a
command centre reaches the page they came for before the run card. Each page's description sentence
and lineage caption, which sat on the card face of every command centre, are behind an info tooltip
beside the page's name; the tooltip's trigger is a sibling of the navigation button, never inside it,
and it is named for its page ("About Ad Performance"), since a row of seven controls all called "More
info" tells a screen reader nothing (`InfoTooltip` takes a `label`). The same afternoon the strip went
onto the five centres not yet on the shell as well (Strategy, Creative, MST, Listen, Reports: first in
the content column, under the spine; on MST and Reports it shows on the gate's own condition, since
their pages read what the gate waits for), and `HubNavGrid`, the card grid every centre used to carry
at the foot of the page below the run card, is retired: nothing renders it. `InfoTooltip` accepts a
node so the tooltip can carry the two lines. Tests: `stage-layout.test.tsx` (the strip's slot, the two
page buttons, nothing of the sentence or lineage on the face, one info control per page named for it
and outside its button, the click navigates); `shared-exports.test.tsx` pins the export set without
the grid.

## 28. Safe re-runs: rollups keyed by run, the account's current run, two generations kept, evidence forever (2026-09-05, sweep slice 2, schema and backend, flagged)

**What changed.** `artifacts/api-server/src/lib/runGenerations.ts` and the schema, spec §7.7 and §10 row 2.

- **Nothing is deleted before a run writes.** Every output row goes in under the run's own
  `manual_analysis_run_id`, beside the previous run's rows. The engine's window delete on the five
  date-scoped rollup tables (`clearWindow`, "Clearing previous data window", stage 62) and the
  per-account delete of `demographic_signal` / `placement_signal` at 92% are gone; the two signal
  tables carry the run id now, like every other output table.
- **The account points at its current run.** `ad_accounts.current_analysis_run_id` (schema, additive,
  backfilled from the newest successful run) moves to the new run in the same "Finalizing" UPDATE
  that marks the account configured, once its rows are all in place. Until then the previous run is
  what readers see, and a run in flight is invisible.
- **Readers scope to it.** The seed (`rowsOfCurrentRun`: `ad_performance`, the three breakdown
  tables it ships, the two signal tables; `latest_analysis_run_id` is the pointer), the summary and
  daily-series endpoints (`scopeToCurrentRun`), the strategy evidence pack's "all" scope
  (`resolveRunScope`: "all" is the current run, the union-with-supersede over several runs is slice
  3's rule), and the three `ad_performance` views (a `left join ad_accounts` on the pointer). The
  rule is the current run's rows plus every untagged row; untagged rows are pre-migration history
  or the importer's and are always kept, the same rule the client's `scopeToRun` follows.
- **A failed run deletes only its own rows.** `deleteRunOutputs(accountId, runId)` walks all
  thirteen output tables by run id; the stale reclaim uses the same path. The pointer is untouched.
- **Two kinds of row, two rules.** Evidence rows (`ad_breakdown_performance`,
  `reconciliation_ledger`, `variable_evidence`, `variable_segment_performance`) are kept for every
  run, forever: nothing prunes them. Derived rollup rows (`ad_performance`, the four breakdown
  tables, `concept_performance`, `variable_performance`, the two signal tables) keep two
  generations, the current run and the one before it, as a rebuild-cache limit:
  `pruneRollupGenerations` runs after a success is recorded, non-fatal, and the next success
  recomputes the same plan.
- **The unique keys carry the run.** `ad_performance`'s two identity indexes, the four breakdown
  tables' constraints and the two signal tables' constraints are widened to include the run id,
  edited IN PLACE in `schema.sql`: those blocks re-run on every apply, and the run-less keys would
  refuse the second generation the next time the fingerprint changed. Nulls are distinct (the
  default), so the importer's untagged rows keep their delete-and-insert idempotency and a run's
  rows are protected by the key.
- **The contract and the client.** `AnalysisRun.rollups_retained` (OpenAPI, codegen) says whether a
  run's rollups are still there (the two newest successes); the run picker disables a run whose
  rollups were dropped, with the title saying its evidence rows are kept. The status hub's failed
  row names the retained run's window. The run's `[Re-run]` note says what stayed and what went,
  filed as a notice (`warningSeverity.ts`); the earlier "Replaced N rows" line stays attention on
  the runs that carry it.

**Why.** Hazard H1 (assessment 2026-09-04 §8): a re-run that failed after the window delete left the
account with no rows for the window until the next success, and between the two the account read as
unconfigured. The owner's reconciliation asked for it (item 2, answer 2: every run's evidence rows
retained), and the spec's §7.7 states the retention distinction the owner corrected on review:
evidence forever, two rollup generations as a cache limit.

**What proves it.** `runGenerations.test.ts` (the plan, the reader rule, the filter string, the
lists: no evidence table in the generation window, every table in the failed-run cleanup; the
deliberately failed re-run over a fake store: pointer untouched, the previous run whole, the failed
run's rows gone, evidence kept past the window). `analysisEngineSignals.test.ts` drives the REAL
engine over its in-memory Supabase: a re-run keeps the previous run beside the new one under its own
id, the pointer swaps, the reader sees one generation, the note names the previous run's window, a
third success drops the first run's rollups and not its evidence; and a re-run that dies writing the
last rollup table (an injected database error on `placement_signal`) leaves the pointer on the first
run, every one of its rows in place in all thirteen tables, and nothing of its own behind.
`schema-apply.test.ts` splits the new blocks (256 statements); `apply:ad-performance-views
--dry-run` passes the forbidden-word scan with the joined views. The live re-run integration test
(`manualAnalysisRerunIdempotency.test.ts`, the validation environment) asserts the two-generation
shape and the pointer.

**How far it reaches.** Schema: one column and index on `ad_accounts` with a backfill, one column on
each signal table, seven widened unique keys, three views redefined; applied by the post-merge hook
one statement per transaction. The old production code keeps working against the new schema (its
delete-then-insert is legal under the wider keys), so the apply-then-publish order is safe. Readers
of every rollup table changed; a reader that summed all rows for an account now sees one run. The
strategy evidence's "all time" is the current run until slice 3 brings the union with supersede.
Production carries pre-migration breakdown rows without a run id on three early test accounts
(Gabri, skov, SKOV Pet); they are kept beside the current run's rows until a re-run rewrites the
account under one id. Not run here: a deliberately failed re-run against production, which would
mean failing a real account's run on purpose; the fake-store proof above stands in for it.

**Live (2026-09-05).** PR #216 merged at 13:38Z on a green run. The workspace convergence's post-merge
hook applied the schema at 13:39:38Z: "Applying Supabase schema: 256 statement(s), fingerprint
3f45559821b4 (changed, previously d3176d08b13c)", "applied: 256 statement(s) in 19 s", no lock,
retry, wait or error line; the restarted API server listened at 13:39:50Z and warmed its seed in
67.4 s. Read on production right after the apply (read-only SQL, project lqryrmaipryeqtjbxjdh):
`ad_accounts.current_analysis_run_id` present and, on every one of the eleven accounts with a
successful run, equal to its newest successful run; `manual_analysis_run_id` on both signal tables;
all eight run-keyed unique indexes present and none of the run-less ones; `metrix_schema_state`
carrying the new fingerprint with 256 statements. The three views return exactly the current run's
rows: for Fresh Import 2,387 of the 3,962 stored `ad_performance` rows, for SKOVPET.COM 253 of 491,
for skov 99 of 537, the older generations of those three accounts excluded as designed, and every
other account unchanged (its stored rows are all its current run's or the importer's). The publish
of the converged workspace (deployment 329ef7e0) served the new build by 13:48Z: `index-CiuGRJek.js`,
the `RunSelector` chunk carrying `rollups_retained` and the "Rollups dropped" state, the
`AnalysisCommandCenter` chunk the retained-window line; `/api/healthz` 200 and `/api/metrix/auth/me`
401 through the router. The first prune on production happens on the next successful re-run of an
account with three or more successes (skov, ECAS, Bookster, SKOVPET.COM, Fresh Import); until then
every stored generation stays where it is.

## 29. Strategy, Creative and MST on the shell; the base of the next run as a control; briefs name their strategy run; the union with supersede (2026-09-05, sweep slice 3, additive schema and backend, flagged)

**What changed.** The three generation-side command centres compose `StageLayout` (change-log 27)
with a status hub each, and the base of the next run is a visible, changeable control on the
page rather than a default the code chose.

- **The pages.** `StrategyCommandCenter`, `CreativeCommandCenter` and `MstCommandCenter` render
  through the shell: header · crumb (new `crumb` slot between the header and the spine, for the
  loop-origin crumb and MST's result-scope bar) · spine · pages · one notice (Creative's nudge slot,
  the staged-creatives step first, the creative-source suggestion behind it) · status hub ·
  execution card · direction rail · content. The execution cards carry no progress bar and no
  error box any more: the run's progress and its failure render once, in the hub (§4). The three
  hub builders live beside the Analysis one in `lib/loop/statusHub.ts` (`buildStrategyHub`,
  `buildCreativeHub`, `buildMstHub`, spec §4.2): Strategy's Staged row says "Based on · <the
  selection>", its Completed row the pillars, hypotheses, the window the run's analysis runs cover
  and the model, its Failed row "The current strategy is unchanged"; Creative's Staged row names
  the strategy run to brief, the staged creatives with their deconstruction state and, when the
  current briefs started before the current strategy, says so (the currency rule of slice GAP-01,
  unchanged); MST's hub names the brief set in use with a Creative link and the matrix's readiness
  and has no run rows (`history` became optional on the model). A generation ETA is the median of
  the account's prior successful runs of the kind, else the measured platform median of 210 s
  (§4.3); the in-flight row shows the engine's stage and percent only when reported, and the
  pre-flight from the click until the run row exists.
- **The base of the next run (§5.1).** `components/loop/BaseRunPicker.tsx`: `BaseRunPicker` wraps
  the compact `RunScopePicker` over the account's successful analysis runs in the Strategy card,
  with the effective window and, for several runs, the supersede rule in one fragment; the
  selection is persisted per account per browser under one key (`strategy-base-run`) that the
  Account Overview's command chain now reads and writes too (it used to reset to All time on every
  open). `usePersistedRunScope` gained a per-page default (`defaultTo: "latest-success"`): with
  nothing stored it shows the newest successful run whose rollups are retained, computed from the
  run list on every render and written to storage only when the reader chooses. `StrategyRunPicker`
  on Creative is a single-select over the successful strategy runs (date, pillar count, model),
  exactly one, the latest by default, remembered per account. Pressing Generate sends exactly the
  selection shown; nothing runs on its own.
- **The run record (§5.2, schema, additive).** `generation_runs.source_generation_run_id` (the
  strategy run a briefs run read), `source_window_start` and `source_window_end` (the span a
  strategy run's analysis runs cover together). `source_analysis_run_ids` is now always the
  RESOLVED set, the account's current run under "all time" included, so History can say what a
  strategy was built from. `GenerateBriefsInput { strategy_run_id }` on the briefs route; the
  engine reads that run's pillars and its ICP set (`pillarsForBriefs`, `buildStrategyEvidence`'s
  `strategyRunId`), 404 when the run is another account's or not a strategy run, 422 when it did
  not succeed or holds no pillars any more; absent, the current generated set, else the imported
  set, as before. New `GET /metrix/accounts/:id/generation-runs/:kind` (`listGenerationRuns`): the
  fifty newest runs with `output_count` (the pillars or briefs each still holds, one extra select
  per list), after reclaiming a dead 'running' row through the latest-run read. Strategy › History
  reads it and lost its "only the latest run is tracked" caveat; `GenerationRunRow` renders a run
  with what it was built from on the two centres and the history.
- **Several analysis runs in one pack (§5.1).** `lib/evidenceSupersede.ts` (pure): the evidence is
  the union of the selected runs' rows; a DATED row of an older run goes when a newer selected
  run's window contains its dates; an UNDATED per-run aggregate (concept, variable, the signal
  tables) goes only when a newer run's window contains the older run's whole window, and partial
  overlaps keep both because an aggregate cannot be split at a date; untagged rows are never
  superseded; runs without a window neither supersede nor are superseded. `buildStrategyEvidence`
  applies it to every run-scoped table when more than one run is selected and writes an
  `analysis_runs` block into the pack (the runs, their windows, which lost its whole window, the
  effective window, and the note that a partial overlap is described by both runs), so the model
  is told rather than left to double count.

**Why.** Spec §10 row 3. The owner's correction on review (§5.1): a strategy is manually executed,
never automatic, built on whichever analysis run the reader names, defaulting to the latest
successful one, visible and changeable before the press; the Strategy page sent "all time"
silently and the chain reset to it on every open. The reconciliation's answer 5: several runs
combine as a union where the later run wins the overlap, and briefs read exactly one strategy run.

**What proves it.** `evidenceSupersede.test.ts` (dated rows per newer window, the row that reaches
outside every newer window, older runs never supersede, undated aggregates only on whole-window
containment, the untagged and the windowless untouched). `statusHub.test.ts` (the three builders:
the base line in its three forms, the completed summary, the ETA from prior runs and the platform
fallback, the pre-flight, the failure with what is retained, the predate line, the imported base,
MST without run rows). `stage-layout-slice3.test.tsx` renders the three centres: slot order, the
hub region, the base defaulting to the latest SUCCESSFUL analysis run and the request carrying
exactly `analysis_run_ids: [that run]`, All time chosen in the picker written to the shared key and
sent as `analysis_all_time`, the history rows naming their source, Creative defaulting to the latest
strategy run and sending `strategy_run_id`, another run chosen (the list closing on the choice,
the choice remembered) and sent, the imported strategy briefed with no picker and no id, the
predate line, one notice slot, MST's hub with no history row. `run-scope-default.test.tsx` (the
default until a choice, the stored choice winning, the stale run falling back, All time elsewhere).
The two progress-threading suites now assert the server's stage and percent on the hub's Running
row and the fallback stage when nothing is reported. `schema-apply.test.ts` splits the new
statements (259).

**How far it reaches.** Three columns on `generation_runs`, nullable, applied by the post-merge hook.
The briefs route accepts an optional body; the old client (no body) keeps working. The latest-run
endpoint's shape gained four nullable fields. The chain's strategy selector default changed from
All time to the latest successful run, which is the owner's rule, and "all time" itself has read
the account's current run since slice 2. Not run here: a strategy generated from two runs against
production, which spends a model call; the pack's shape and the supersede rule are unit-proven and
the wiring typechecks. Not in this slice: the Audience segment-attribution gap the owner raised the
same afternoon, planned as the next PR (task register: the engine writes demographic rows at
ACCOUNT grain by construction).

**Live (2026-09-05).** PR #217 merged at 15:04Z on a green run (f384f924). The workspace
convergence's post-merge hook (merge ae1ab397) applied the schema at 15:05Z: "Applying Supabase
schema: 259 statement(s), fingerprint 3d7901136139 (changed, previously 3f45559821b4)", "applied:
259 statement(s) in 18 s", no lock, retry, wait or error line; the restarted API server listened on
8080 at 15:06:03Z and warmed its seed in 66.9 s; all three workflows running. Read on production
right after the apply (read-only SQL): the three columns present on `generation_runs`, every
existing row null on all three, `metrix_schema_state` carrying the new fingerprint with 259
statements. The publish of the converged workspace (deployment 329ef7e0) reported success and
served the new build by 15:20Z: `index-BYLPxqvI.js`, the `StrategyCommandCenter` chunk importing
`BaseRunPicker`, `GenerationRunRow`, `statusHub` and `StageLayout`, those chunks carrying "Base this
run on", "Based on ·", "Strategy run" and "usually about"; the `CreativeCommandCenter` chunk sending
`strategy_run_id`; `/api/healthz` 200 and `/api/metrix/auth/me` 401 through the router. Nothing on
production has yet been generated from the new base control; the first press records its
`source_analysis_run_ids` and window on the run's row.

## 30. The IAP Library reads what the run wrote: ad-grain rows where there is no cell library, run-tagged rows under the page's selection, the virtualizer owned by the table, evidence through an ad's own name (2026-09-05, UI, one seed filter flagged)

**What changed.** Seven surfaces on the IAP Library and the creative dialog showed nothing for
Pure Path's current run (`8148628c`, 21,034 ad rows, 382 variables, 20,618 per-ad demographic
rows, 586 ads and $1.38M under "Website purchases"), and each had its own cause:

1. **The tiles read 0 cells · $0 · 0 purchases.** They summed `performance_by_cell`, which only
   the importer writes; the engine writes no cell library. `lib/ad-grain-rows.ts`
   (`adGrainPerformanceRows`) turns the seed's `ads[].performance` into one cell-shaped row per
   ad, and the view stands those rows in for the tiles, the Breakdown tab, the tile drill-down
   and the Top performers' cell half when the run has no cells and the selection covers the
   current run (the per-ad totals are the current run's; an older run they cannot describe gets
   no stand-in). The count tile reads "Ads with performance" with the reason in its sub-line
   (`LibraryCatalogScope.grain`); what the per-ad totals do not carry (reach, clicks (all)) is
   named (`unmeasured`) and those tiles read a dash with "not carried by this account's per-ad
   totals", never the 0 the rows hold. No rows at all is a dash on the count, spend and results
   tiles, not a measured zero (`buildLibraryMetricCatalog`). Cost per result needs spend as well
   as results, everywhere it is derived here.
2. **The Variables tab counted 764, the DNA card 382.** The tab read every generation of
   `v3_variable_performance`; the card scoped to the current run. `scopeToSelection(rows,
   selection, currentRunId)` in `lib/run-scope.ts` is the one rule: All time reads the current
   run, a narrowed selection keeps the chosen runs, untagged rows always stay. The tab, the
   family filter note, the table, the top-variable set and the drawer chips' per-variable cost all
   read through it; the DNA rollup gets pre-scoped rows (a second scope to the latest run would
   empty an older run the reader chose).
3. **The table under the card was empty.** `VirtualTableBody` created its `useVirtualizer` as a
   CHILD of the scroll container: React attaches a host ref after the descendants' layout effects
   have run, so `getScrollElement()` returned null in the virtualizer's own effect, it subscribed
   to nothing, and the only render had no range. Every table past 50 rows showed a header and no
   rows until a sort click re-ran the effect. The virtualizer is created by `VariableTable` and
   `CellTable` (`useTableVirtualizer`, `enabled` past the threshold, `initialRect` at the shell's
   520 px so the first render carries a page) and handed to the body. jsdom has no layout, so
   `scripts/src/visual/check-virtual-tables.mjs` (`check:virtual-tables`, read-only, needs the dev
   server) opens the fixture's 606-variable account and fails unless rows render.
4. **The DNA card's best read was $0.00 CPA.** A token with results and no spend divided 0 by its
   results. `rollupDnaFamilies` gives no cost per result without spend; the family's best read is
   the lowest cost among tokens that spent, else the most results without a cost.
5. **The Breakdown tab said "No segment data" for five backed dimensions.** It opened on the
   catalog's first metric, `lib_cells`, a count no segment can carry. `isBreakdownMetric` in
   `kpiBreakdown.ts` probes `metricValueFromTotals` and the explorer offers only metrics it can
   compute; with ad-grain rows the cell dimension is "Ad" and "Concept code" exists only when an
   ad carries one (`listBreakdownDimensions(a, { cellRows, grain })`).
6. **The Ad copy tab was empty.** It rendered cells whose MST library row has a primary message,
   and nothing else. With no such cell, it renders the ads whose export carried primary text
   (`ads[].creative`), tiered on the same percentile rule against the ad's own totals, each card
   opening the creative dialog for that ad.
7. **The creative dialog said "No mapped ads" and "No demographic data" for an ad with 20
   demographic rows.** Ad-level tiles carry `conceptCode` "AD" (every ad without a cell code
   shares it) and the dialog resolved identity by that code. `CreativeCardData.adNames` names the
   ad the card stands for; `useCreativeEvidence(cellId, adNames)` takes it as the identity's
   second path (`adIdentityForCreative`'s mapped-names branch), so the per-ad demographic and
   placement rows, the ledger funnel and the evidence tab resolve through the ad's Meta ad ids.
   The media `layoutId` is keyed the same way (`creativeLayoutKey`), so 970 ad tiles no longer
   share one shared-layout key.
8. **The caveat "Purchases results were not populated by age/gender" showed above rows carrying
   47,983 purchases.** It fired whenever a top set existed. It now shows only when demographic
   rows exist and none carries the ranked event's results.

**Flagged, backend.** One filter in `metrixSeedAssembly.ts`: the creative-asset `manual_imports`
read for the auto-heal excludes `status = 'uploading'`. An in-flight chunked session that never
completed ("(car detail) hook 1 - Copy.mp4", 26.9 MB) carried an ad name, so every seed build ran
the creative-link auto-heal for an account whose only creative import had no bytes. The schema is
untouched; `ads[].performance` does NOT gain reach or clicks (all) in this change (the fixture
drift check would fail until refreshed on the workspace); the client type declares them optional
and the ad-grain rows read them when a later seed ships them.

**What proves it.** `ad-grain-rows.test.ts` (rows, unmeasured fields, no cost without spend,
overrides and duplicates skipped). `run-scope.test.ts` (`scopeToSelection` under All time, a
narrowed run, two runs, no current run). `libraryMetricCatalog.test.ts` (dash on empty, the ad
label and sub, unmeasured tiles, cost needs spend). `kpiBreakdown.test.ts` (`isBreakdownMetric`,
the ad-grain dimensions and bar labels). `creative-dna-scale.test.ts` (zero-spend tokens).
`tables-virtualizer.test.tsx` (the virtualizer is created by the table, asks for the shell's
scroll div and gets it, enabled only past the threshold, renders what it returns).
`useCreativeEvidence.test.tsx` (identity through the ad's name, then its ids). `library-ad-grain
.test.tsx` renders the fixture's no-cell account with a synthetic registry: the tiles named as
ads and never $0, the Variables tab counting the current run only with the card agreeing, no
$0.00 best read, the top sets counted once with the ads that produced the event, the Ad copy tab
from the ads' own text opening a dialog whose Evidence tab has mapped ads, the Breakdown tab
opening on a computable metric with "Ad" as a dimension, the caveat silent when the demographic
rows carry results and shown when they do not. `check:virtual-tables`: 19 rows rendered at 1440
and 390 px on the 606-variable account, scroller 520 px (before the fix: 0 rows, scroller 41 px,
the header alone, reproduced with the same script).

**How far it reaches.** UI only apart from the seed's import filter. Accounts WITH a cell library
are unchanged: the ad-grain stand-in exists only when `performance_by_cell` is empty. The
Variables tab under a narrowed selection now shows that selection's rows (it showed every
generation before). The tile catalog's count/spend/results tiles read a dash on empty rows
wherever the catalog is built. The `RunScopePicker`'s history is unaffected. Not in this change:
the Audience segment drill-down's account-grain rows (task #47, the engine writes demographic
rows at ACCOUNT grain), and the Ad Performance page, which reads its own summary endpoint.

**Live (2026-09-05).** PR #218 merged at 16:10Z on a green run (0109fb85). The workspace
convergence (merge c335dfbf, clean) ran the post-merge hook, which printed "Supabase schema
unchanged (fingerprint 3d7901136139); nothing applied" and exited 0, no lock, retry, wait or error
line; the restarted API server listened on 8080 at 16:12:07Z and warmed its seed in 125.4 s; the
boot log's creative-link auto-heal named only the importer's littledata account (10 unlinked
mappings, a pre-existing condition), no longer Pure Path, which is the in-flight upload filter
doing its job; all three workflows running. The publish of the converged workspace (deployment
329ef7e0) reported success and served the new build by 16:25Z: `index-B0S9DpM1.js`, the
`IapLibraryView` chunk's imports carrying "Ads with performance", "not carried by this account's
per-ad totals" and "No concept code", the `tables` chunk carrying `virtual-table-body` and the
virtualizer's `initialRect`; `/api/healthz` 200 and `/api/metrix/auth/me` 401 through the router.

## 31. The Audience segment drill-down attributes through the reconciliation layer when the demographic rows are account-grain (2026-09-05, UI)

**What changed.** The engine writes `demographic_signal` at ACCOUNT grain by construction (it
buckets the demographic export by age × gender × result type; an engine-analysed account has no
cell library to attribute to), so `computeSegmentAttribution` found no cell-grain rows and the
drill-down said "This import's demographic export is account-level only … concept and variable
attribution can't be honestly computed" for a run that had written 20,618 per-ad demographic rows
(`ad_breakdown_performance`) and 12,605 per-variable segment rows (`variable_segment_performance`).
Those rows are the honest attribution one grain down: `lib/segment-analytics.ts` gains an
evidence-layer basis (`SegmentAttribution.basis`: `cell_grain` or `evidence_layer`, plus a
`basisNote`). When no cell-grain row carries the segment, the per-ad demographic rows of the
segment (under the result types the segment's own rows carry; under a cell scope, the ads the
registry files under those cells) become the "cells": one entry per ad, named from the ads
registry (the Meta ad id as the small identifier), its copy from `ads[].creative`, its totals
strict-summed (reach only at the exact grain), ranked by results; the per-variable segment rows of
the segment become the ranked variables (direct plus contextual totals per slug, `result_volume`
as results), and each ad is chipped with the tokens whose contributing ids include it. Without
evidence rows the old reason stands, reworded to say the run wrote no per-ad rows either; a cell
scope with no registry to resolve it stays unavailable. `SegmentDrilldownModal` passes the
account's ads, heads the block "Top ads for this segment" (compare column: "Top ads"), reads the
chip tooltip in ads rather than concepts, and replaces the cell-join sentence with the basis note.

**What proves it.** `segment-attribution-evidence.test.ts` (ads ranked and named with copy, the
result-type restriction, variables and chips, the cell scope through the registry, no registry,
no evidence rows, cell-grain rows still winning, the drill-down carrying the basis, an unregistered
ad named from its row). `segment-modal-evidence-basis.test.tsx` renders the modal on an
account-grain export with an evidence layer: no unavailable note, the ads block, the variable row,
the basis note. The existing coverage, marginals and downstream tests are unchanged.

**How far it reaches.** UI only. Accounts with cell-grain demographic rows are unchanged. The
segment's own totals, signal and coverage are still computed from its demographic rows; only the
attribution block below them changes. Not in this change: concept attribution for an
engine-analysed account, which needs the ad-id anchored concept mapping (task #40).

**Live.** PR #219 merged into main as `dd18a234` (2026-09-05 16:55Z) with the two audit-round-4
commits; the workspace converged as merge `8f315ba7` (the post-merge hook: "Supabase schema
unchanged (fingerprint 3d7901136139); nothing applied", exit 0; the API Server listening on 8080
at 16:57:12Z, seed cache warmed in 73,673 ms; API Server, Metrix IAP and Marketing all RUNNING);
deployment `329ef7e0` published to app.metrix.ad with status success at 17:04Z, serving
`index-Xj8Gx8Gf.js`. Verified by fetching the served chunks: "Top ads for this segment" and
`note-attribution-basis` in `SegmentDrilldownModal-DaZTgeUi.js`, "not summed." in
`AudienceView-DpxdACEZ.js`, "No creative cell library in this run" in
`IapLibraryView-BDuhmjnK.js`.

## 32. Audit round 5, data honesty: account totals from the campaign summary, the funnel staged from the account's own result events, the source named on the settings surfaces (2026-09-05, UI, one gate allowlist tightened)

**What changed.** The 204-shot route crawl of round 4 (`METRIX_UI_AUDIT_ROUND4_2026-09.md` §B)
found surfaces that summed the wrong rows or named the wrong cause for data the account has.
One pure module carries the account-level reads, `lib/account-totals.ts`: `scopedAccountTotals`
(the campaign summary's `bottom_line_totals`, the per-event totals seed assembly derives from the
ad rows, restricted to a result scope's raw types), `resultTypeSpendSplit` (the spend split by
event for a share chart), `breakdownSpendShare` (the share of the account's spend a demographic or
placement export covers: the run's reconciliation summary per class first, else the rows' spend
against the summary total, null when the rows exceed the total beyond rounding since that is the
duplicate-ingestion signature and not a share) and `countCells` (distinct cells, since a cell row
is cell × result event). On it:

- Creative DNA's tiles are account totals under the page's result scope, captioned "Account totals
  · this result scope · ad rows, not variable rows". They summed the variable rows, one row per
  token an ad carries, so an ad counted once per token: Total spend read $68,535 on an account that
  spent $42,290, and impressions read 0 because the variable rows do not carry them. The loci
  still read the variable rows, which is what they are for.
- Analysis Overview's "By result type" donut is the split of the account's spend by every event
  (the window's totals under a date window; the cell rows only under a narrowed run selection,
  since the account totals are the current run's) and carries its source ("spend share · every
  result event · ad rows" / "cell rows in selection"). It read the cell rows, which an
  engine-analysed account has none of, and on an importer account cover the cell library's events
  only: Bookster's installs and checkouts never appeared.
- The Engagement Funnel's lower bands are the account's own result events, read from the
  demographic rows' Result type (`buildFunnelStages`): an intermediate conversion event (wishlist,
  cart, checkout, payment info, in that order) is an intent stage, a terminal one (purchase, lead,
  install, registration…) a conversion stage, each terminal stage measured against the last stage
  before the conversion band since terminal events are alternatives, not a sequence. The export's
  own cart / checkout / purchase columns keep winning for the event they name (all three slots stay
  when the export carries any of them, so an ecommerce export reads exactly as before), and rows
  that carry neither keep the three classic gaps. Each lower stage says where it was read
  (`FunnelStage.basis`, a note on the chart). It used to read three hardcoded ecommerce columns:
  a lead-gen account with 4,323 leads and an app account with 486 installs showed empty intent and
  conversion bands, the known systemic defect CLAUDE.md names. The absence note is one sentence
  shared by the full funnel and Ad Performance's compact card (`describeLowerFunnel`): what the
  export lacked, or which intermediate step it lacked, never a business model. Ad Performance's card
  named the account's objective and terminal metric ("cost per activation (App)"), which the owner
  decision (2026-09-01) says the objective is not for.
- The three pages that counted cells count them the same way: cells, not cell rows (Bookster read
  "12 cell rows" on Ad Performance, "8 cell rows" on the Overview and "4 of 4 cells" in the
  Library, three scopings of one library of four cells); a run without a cell library counts its
  ads with performance; the variable rows are the current run's on Ad Performance too.
- The Library's count tile on the ad grain says how many of the account's ads with performance the
  scope holds ("of 629 ads with performance · 576 under other result types"); a creative cell with
  no performance row reads a dash, never $0 · 0, and the dash carries its reason as the
  dotted-underline title (`CreativeCardStats.unmeasuredReason`, the KpiStat affordance, since the
  card is a button): `check:unexplained-dashes` flagged the thirty bare dashes of the first cut.
- Budget names the missing cell library ("Spend by concept needs cell codes on the ads. This run has
  none; its N ads with spend are on the IAP Library") instead of "No cell rows match the current
  metric selection".
- The demographic and placement surfaces carry the export's share of spend: the Audience module
  stat on the Overview and Ad Performance ("19 demographic rows · 20% of spend"), the funnel card's
  caption, the Avatars audience row, the Placement spend tile's sub.
- The settings surfaces name the source (`describeAccountSource` in `lib/data/accountSource.ts`:
  Live Meta connection · Manual reports · Imported package · Imported data, with a one-word chip).
  Settings › General said "Meta ad account · Meta Ads · connected" with a check on a manual account,
  Integrations printed the raw `manual_reports` / `imported_from_iap_loop_package` beside a
  CONNECTED badge, and the per-account panel did both. Only a live Meta connection reads as
  connected; a configured account is "analysis data on file", an unconfigured one "no successful
  run yet". The read-only "Objectives" module on General is gone (it described the account by its
  derived objective; `cohortOptions.ts` deleted, the two settings entries removed from
  `check:cohort-reach`'s allowlist, so the gate now bounds the cohort to the analysis views, the
  cohort module and the export payload). The System card reads the seed ("Supabase seed
  2.0.0-supabase · assembled Aug 15, 2026", the assembler's integrity note behind "About this
  data") instead of a static "SAMPLE / DEMO DATA".

**What proves it.** `account-totals.test.ts` (scope restriction, the blend, null without a summary,
the split's order and labels, the reconciliation-first share, the rows fallback, the over-total
refusal, the count of cells). `funnel-result-events.test.ts` (leads as the conversion band with no
phantom slots, purchase-path order, terminal alternatives against the last stage before them, the
export column winning and the rows filling in, consideration events never staged, the classic gaps,
the three absence sentences); `funnel-zero-vs-gap.test.ts` unchanged. `round5-data-honesty.test.tsx`
renders the fixture's no-cell account with a synthetic summary built so every wrong figure is
distinguishable from the right one: the DNA tiles read $5,555 under the blend and never $8,642 or
4,321, the donut lists both events from the ad rows and says so, the Overview and Ad Performance
count "3 ads with performance · 2 variable rows" and "19 demographic rows · 20% of spend", Budget
names the cell library, the Placement spend tile reads "placement rows · 50% of spend", the compact
funnel stages Purchases from the rows and names the missing intermediate step.
`general-data-source.test.tsx` (Manual reports, Imported package, no Objectives, the System line, no
demo label), the manager-view describe in `integrations-account-scoping.test.tsx` (labels and chips,
no raw status, no Connected), `creative-card-null-stats.test.tsx`, the ad-grain describe in
`libraryMetricCatalog.test.ts`. `ad-performance-canvas.test.tsx`'s absence case now expects the
export's sentence and asserts the objective is absent.

**How far it reaches.** UI only; no schema, endpoint or engine change. The only figures that move
are the ones that were wrong: an ecommerce export's funnel is byte-identical, cell-grain accounts
keep their tiles, and every fallback is a dash or a sentence, never a zero. `check:cohort-reach`'s
allowed reach shrank from six paths to four.

**Live.** PR #220 merged into main as `d93aa365` (2026-09-05 17:40Z) on a green run, four commits
(the round, the thirty bare dashes of the creative-only cards given their reason, the donut caption
lifted to the AA floor for `check:token-colors`, the funnel's new tip and absence sentence in the
two baselines that pin them); `check:friction` on the final head: 204 visits, 0 defects, no ratchet
raised beyond the two no-data phrases added with their reason. The workspace converged as
`ec246d6f` (the post-merge hook: "Supabase schema unchanged (fingerprint 3d7901136139); nothing
applied", exit 0; the API Server on 8080, seed cache warmed in 69,899 ms; API Server, Metrix IAP
and Marketing all RUNNING); deployment `329ef7e0` published to app.metrix.ad with status success at
17:56Z, serving `index-BybfPVlV.js`. Verified by fetching the served chunks: "Account totals · this
result scope" in `AnalysisDnaView-nmsYmCZv.js`, "spend share ·" in `AnalysisOverview-DttxOjmu.js`,
"No result event below link clicks" in `EngagementFunnelView-Bfgd2jja.js`, "Supabase seed" in
`GeneralView-BzZ-mW07.js`, "No creative cell library" in `BudgetView-DRbl15z_.js` and
`IapLibraryView-Rk6kOzkt.js`, "of spend" in `AudienceView-t3E0c_J-.js` and
`PlacementsView-Dny8imJO.js`, "Manual reports" in the entry chunk.
