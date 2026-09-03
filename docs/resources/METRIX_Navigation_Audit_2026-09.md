# METRIX — User-journey and navigation audit (2026-09-02)

**Scope.** The owner's release-readiness brief asked for a reconciliation of every
prior phase, and a user-journey audit focused on three things: the sidebar
("clunky"), the loop between Creative, Strategy and Analysis ("circular or
illogical redirects"), and wayfinding from deep-linked views (breadcrumbs, a
consistent Back, header structure). This document records what the audit found,
by reading the code and running the app's own detectors, and what shipped for
each finding. Where something is left open it says so and names the reason.

Method, so the figures can be reproduced:

```sh
# every hardcoded in-app link, with its source file and target
grep -rn 'navigate("/app\|to="/app\|to={`/app\|navigate(`/app' artifacts/metrix-iap/src/{pages,components,lib} \
  --include=*.tsx --include=*.ts | grep -v __tests__
# every route the router knows, and every route the sidebar knows
grep -n 'path="/app' artifacts/metrix-iap/src/App.tsx
grep -n 'to: "/app' artifacts/metrix-iap/src/navigation/navTree.ts
```

---

## 1. Findings

### 1.1 The sidebar delayed every click by a fifth of a second, on purpose

`Sidebar.tsx` dispatched section-header clicks through `useSingleOrDoubleClick`:
a single click toggled the accordion and a double click within 220 ms navigated
to the section's command center. To tell them apart, **every first click was
held back for 220 ms**. That is the "clunky" the owner reported — not a style
problem but a latency built into the control. Two further costs:

- The navigation gesture was documented only in a `title` tooltip. On touch
  there is no hover and double-tap is zoom, so a phone user had **no way** to
  reach a command center from the sidebar.
- `aria-expanded` and `aria-current` sat on the same button, so assistive
  tech heard one control claiming to be both a disclosure and a link.

**Shipped.** The header is now two controls, each doing one thing: the label is
a link to the command center (navigates and opens the section), the chevron is a
button that toggles the child list (`aria-expanded`, `aria-controls`, named
"Expand/Collapse *Section* pages"). No timer. A closed list is `inert` as well as
`aria-hidden`, so its links leave the tab order. The collapsed icon rail is
unchanged (click reopens the rail on that section — the v1 handoff's explicit
decision against flyouts stands). Tests rewritten in `sidebar-nav.test.tsx`.

### 1.2 Fourteen in-app links pointed at legacy paths, and the redirect ate the context

The router carried nineteen legacy redirects. Fourteen live links still used
the old paths — `TaskTray` (6), `LoopCommandChain` (7), `StrategyOverview`,
`StrategyMapView`, three MST views, the account menu (3), and the setup
checklist in `shared.tsx` (4). All of them *resolved*, which is why the existing
route test never flagged them.

The defect: a `<Redirect to="…" replace>` drops the query string. The Strategy
Map's "Draft briefs from pillars" sent
`/app/briefs/builder?from=strategy&fromCell=C2B` through the redirect, and the
Brief Builder received `/app/creative/builder` with nothing after it — so the
`FlowCrumb` ("← Strategy Map · C2B") that exists precisely for this hop never
rendered. Same for the task tray's "Create Brief" on a hypothesis. This is the
concrete form of "circular or illogical redirects": the loop link worked, the
way back did not.

**Shipped.** Every in-app link points at its live route. The redirect table
moved to `navigation/legacyRoutes.ts` and is the single source for `App.tsx`'s
`<Redirect>`s, the route test, and a new lint in `inpage-nav-targets.test.tsx`
that fails any source literal equal to a legacy path — so this class cannot
recur silently.

### 1.3 The from-chain dropped the analysis origin one hop early

`backUrl()` in `shared.tsx` sent `from=strategy&fromCell=X` back to a bare
`/app/strategy/map`. A reader who went IAP Library cell → Strategy Map →
Brief Builder pressed Back and arrived on the Strategy Map with no way back to
the cell that started the chain.

**Shipped.** The strategy hop now returns to
`/app/strategy/map?from=analysis&fromCell=X`, so the chain unwinds one hop at a
time and the second Back lands on the cell. Label reads "Back to Strategy Map";
the crumb reads "Strategy Map · X".

### 1.4 Three real pages belonged to no section

`/app/analysis/funnel` (Engagement Funnel, reached from Ad Performance),
`/app/act/queue` (the Action Queue, reached from the account overview's "Open
full queue") and `/app/analyze/findings` (the AI verdict panel, reached from
nowhere) were routed but absent from `navTree`. On those pages the breadcrumb
trail was **empty**, the sidebar lit nothing, and Back did not exist.

**Shipped.** `navTree` children may be `hidden: true` — in the tree for
breadcrumbs, highlight and Back, without a menu row. Funnel and Findings are
hidden children of Analysis. The Action Queue is a *visible* child of section
07 Action, which is no longer a "Soon" placeholder: the queue is a real page
(honestly empty until the optimize producer lands — register **F-e**), and the
act stage of the loop now has a home in the navigation. The Agent stays
"Soon".

### 1.5 Breadcrumb and sidebar disagreed about where "Analysis" goes

The section crumb linked to the section's **first child**
(`/app/analysis/overview`); the sidebar header and the loop hub go to the
**command center** (`/app/analysis`). Two "Analysis" affordances, two pages.

**Shipped.** One resolver (`resolveNavLocation` in `navTree.ts`) now feeds
breadcrumbs, the Back target, and the palette; the section crumb links to the
landing route. `breadcrumbs.test.ts` pins it.

### 1.6 There was no Back

Outside the `?from=` chain (three pages) and the deep-dive panel, nothing in the
app offered a way back except the browser. A deep link has no browser history to
walk.

**Shipped.** `navigation/navHistory.ts` keeps the session's in-app locations
(push on arrival, **pop** when the arrival is the entry below — so a
back-and-forth never grows the record). The Topbar renders one Back control on
every non-landing route. With history it calls `history.back()` (the only way
to step back without adding an entry to step back over); without it, it goes to
the structural parent — a page's command center, a command center's overview —
and it names the destination in its label ("Back to IAP Library") so a reader
knows which before pressing. Tests: `navHistory.test.tsx`, `topbar-back.test.tsx`.

### 1.7 The sidebar was the only way to reach 40 pages

Nothing let a reader type a page name. The reface register had mapped
Watermelon's `command-search` and `quick-switcher` and deferred them "until
after the panel pass"; that pass closed 2026-08-31.

**Shipped.** `components/nav/CommandPalette.tsx`: ⌘K / Ctrl+K (and a "Go to"
control in the Topbar), three groups — Recent (from the session record, by page
name), Pages (every command center and every visible menu row; placeholders
listed disabled as "Soon", never hidden), Accounts (switch scope in place).
Built over `cmdk` (already a dependency) and the command-deck dialog, on the
type ramp and token palette; the reference's blur-and-float arrival was not
taken. Tests in `CommandPalette.test.tsx`.

### 1.8 Dead and duplicated topbar controls

The notification bell was a `<button>` with no handler. The account menu had
"Account" and "Settings" both landing on the same page, and three of its five
items went through legacy redirects.

**Shipped.** The bell is a link to Listen · Alerts carrying the live signal
count. The menu is Account / Security / Integrations / Team & Access / Billing,
all canonical routes.

### 1.9 The section tab bar was a hand-copy of the menu

`SECTION_TABS` in `shared.tsx` re-typed the Analysis and Strategy children. One
rename in `navTree` and the tab bar would have disagreed with the sidebar.

**Shipped.** `SectionTabBar` derives from `visibleChildren(navTree)`.

### 1.10 Four loop shapes shipped at once (2026-09-03 follow-up)

A second read of the tree after §1.1–1.9 found the loop itself still drawn four
ways: `navTree` (six stages, Listen → … → Action), `buildLoopStages` in
`shared.tsx` (six, ending at Reports, no Action), `LoopCommandChain` (five:
Data · Analysis · Strategy · Briefs · Report) and `OverviewLoopHub` (four). Action
was never offered as a next step; `/app/creative` was listed in the command
chain as "History"; Ad Performance, Creative DNA, History and Communications
were missing from its Navigate grids; and on a fresh account the Data hub
disabled its own Account Setup / Integrations links (`isAccessible = isComplete
|| isRunning`).

**Shipped.**

- `navTree.ts` exports `LOOP_STAGES` (id · label · to · loopStage · purpose),
  derived from the six `group: "loop"` sections. `buildLoopStages`, the Manager
  Overview rollup (`accountLoopStages`) and the command chain's labels and
  Navigate grids all derive from it or from `visibleChildren(navTree)`; nothing
  re-types a stage. `navigation/__tests__/loop-stages.test.ts` pins it.
- The stage strip ends at **Action** (`/app/act/queue`, locked until an analysis
  has validated). Reports is an output: it stays in the sidebar's Outputs group
  and as the command chain's Report tile, not as a loop node. Consequence:
  `ReportsCommandCenter` passes `current="reports"` to a strip that has no such
  node, so no stage highlights there (same as Exports already did); that file
  was outside this pass.
- The command chain keeps Data as a leading pre-loop step and Reports as its
  output tile; Analysis / Strategy / Creative are labelled from `LOOP_STAGES`
  (the tile that drafts briefs now reads "Creative", stage key unchanged). The
  Data hub's links are exempt from the completion gate.
- `App.tsx` route groups renumbered to match the tree (07 Action · 08 Reports ·
  09 Exports); `/app/analysis/overview` and `/app/analyze/findings` sit in the
  03 Analysis group rather than the legacy-redirect block.
- Eyebrows: one `SECTION` per overview page — "Account Overview · 01"
  (AdAccountOverview, Updates), "Agency Overview · 01" (ManagerOverview).
- `?from=` chain: `navHistory.ts` now owns the origin → target table, keyed by
  navTree section id, so `from=creative` / `from=mst` produce a crumb and the
  Topbar's structural Back prefers the origin over the section parent.
  `withFrom(to, fp)` in `shared.tsx` threads the origin through the Creative and
  MST hubs (their Explore grids and prerequisite CTAs dropped it). MST renders a
  `FlowCrumb`.
- "Draft a brief" lands on `/app/creative/builder?from=…` everywhere (IAP
  Library, Hypothesis Queue, Strategy Map, task tray).
- The setup checklist's "Run analysis" step and "Start re-run" go to
  `/app/analysis`, where the run control is, not Settings.
- Manager Overview "Open <account>" on a recommendation switches scope AND
  lands on `/app/listen/recommendations?focus=<card id>`; the spend ranking
  lands on the account overview. Note: `RecommendationsView` does not yet read
  `?focus=` (outside this pass); the param follows the app's deep-link
  convention so the page can pick it up without changing the link.
- Dead ends: analysis run rows link to Analysis Overview; the strategy run
  links to the generated strategy; Updates ends with "Next: Run analysis".
  The Analysis command center links to Findings (still `hidden` in the tree).
- Creative command center: at most one nudge — next-step over source when
  both apply.

**Open.** `RunScopePicker` reads no query param and `lib/run-scope.ts` keeps
its storage-key builder private, so a history row cannot pre-select its run;
the link opens the Overview where the picker is one click away. Follow-up: have
Analysis Overview read `?run=<id>` (or export a writer from `run-scope.ts`).
`SectionTabBar` now accepts any section id, but the convention is that child
pages carry it (`ModuleHeader tabs=`) while command centers carry the stage
strip and the Explore grid; mounting it on the Creative / MST / Reports /
Exports / Listen / Settings command centers would duplicate their Explore
grid, so it was not added there. `ModuleHeader`'s `tabs` prop keeps its
`"analysis" | "strategy"` type (outside this pass).

---

## 2. What the audit checked and found sound

- **Route coverage.** Every `navTree` path, every hidden child, and every
  in-page literal resolves (`nav-routes`, `inpage-nav-targets`).
- **The loop's forward direction.** Listen → Analysis → Strategy → Creative →
  MST → Action links are all forward or lateral; no page links back into a
  stage that would re-trigger a run. Ingestion never triggers a loop run
  (`replit.md` rule, unchanged).
- **Deep-dive panel.** Has its own back / breadcrumb / Escape; not changed.
- **Drawer shell below 1024 px.** Unchanged; `app-shell-compact.test.tsx` still
  green.
- **Legacy redirects for bookmarks.** All nineteen kept; `/app/action` now lands
  on the queue rather than the placeholder agent.

## 3. Open — named, not fixed here

- **Collapsed rail: icon click reopens the rail rather than navigating.** Kept
  as the v1 handoff decided. A reader who *wants* a collapsed rail still has to
  expand it to reach a child page; the palette is now the fast path. Owner call
  whether the icon should navigate to the command center instead.
- **`?from=` chain is a URL convention, not history.** It survives a copied
  link, which history does not; the two coexist by design. A future pass could
  fold FlowCrumb into the Topbar Back when both are present.
- **Findings (`/app/analyze/findings`) is linked only from the Analysis command
  center** (§1.10). It reads `iap.intelligence`, present on 9 fixture accounts.
  Hidden in the tree until an owner decides whether it is a menu row or folds
  into Analysis Overview.
- **Everything outside navigation in the brief** — data-visualisation depth,
  configurable views beyond the metric tiles, the optimize producer (R1),
  billing (R3), the weighting engine (R4) — is unchanged and tracked in
  `README_HANDOFF.md` R1–R5. This pass did not widen into them.

## 4. Verification

See the closing commit on the branch; every figure below is from a command run
on this tree.

| Check | Result |
|---|---|
| `pnpm run typecheck` | clean |
| 13 CI design gates (`disclosure-rulebook` … `cohort-reach`) + `unused-exports` | all pass; two `navHistory.ts` test seams recorded in the export baseline, reason in the commit |
| `check:api-codegen-drift` | pass |
| Metrix IAP vitest | **182 files, 2337 tests, 0 failures** (one pre-existing test pinned the legacy tray route; updated) |
| scripts unit tests | 7 files, 119 tests |
| `smoke:metrix-iap-build` | `BUILD OK` and the login render check |
| `smoke:metrix-iap-route-crawl` | **210/210 visits clean, 0 problems** (70 routes × 3 account shapes, with the spec reading the legacy table) |

The crawl reads its route list out of `navTree.ts`, `App.tsx` and, from this pass,
`legacyRoutes.ts` — the first run after the table move walked 153 visits and
printed PASS, having silently lost the 19 redirects (57 visits). A passing check
that covers less than it did is the failure mode the reface register's §7.3 warns
about; the spec now reads the table.
