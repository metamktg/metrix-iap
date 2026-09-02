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
09 Action, which is no longer a "Soon" placeholder: the queue is a real page
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

---

## 2. What the audit checked and found sound

- **Route coverage.** Every `navTree` path, every hidden child, and every
  in-page literal resolves (`nav-routes`, `inpage-nav-targets`).
- **The loop's forward direction.** Listen → Analysis → Strategy → Creative →
  MST → Reports links are all forward or lateral; no page links back into a
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
- **Findings (`/app/analyze/findings`) has no inbound link.** It reads
  `iap.intelligence`, present on 9 fixture accounts. Hidden in the tree until
  an owner decides whether it is a menu row or folds into Analysis Overview.
- **Everything outside navigation in the brief** — data-visualisation depth,
  configurable views beyond the metric tiles, the optimize producer (R1),
  billing (R3), the weighting engine (R4) — is unchanged and tracked in
  `README_HANDOFF.md` R1–R5. This pass did not widen into them.

## 4. Verification

See the closing commit on the branch; every figure below is from a command run
on this tree.

VERIFICATION_TABLE
