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
