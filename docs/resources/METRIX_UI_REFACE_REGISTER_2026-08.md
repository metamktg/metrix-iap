# Metrix IAP — UI reface register

**Status:** live working record. Supersedes ad-hoc reface notes in this session.
**Last reconciled:** 2026-08-28, against `main` at `08ce77a4`, after PR #150.

### Post-sync reconciliation — read before resuming the paused design session

The Claude design session paused while a Replit-side change was still in flight,
then its branch was merged and `main` advanced once more. The sync boundary has
now been inspected against repository history and the current source.

- PR #150 preserved the design-session typography work. Its changes to Analysis
  Overview are presentational; it did not replace the date-window, KPI, daily
  trend, analysis-summary, or Universal Data Module contracts.
- `08ce77a4` is a compatibility repair, not a design rollback. It removes
  TypeScript generic arguments written directly in JSX from `SwipeDeck` and
  `SegmentedToggle`; those forms type-check but can fail the Vite/Babel JSX
  transform. **Do not restore the generic JSX syntax.**
- The shared seed adapter's structured MST `render_policy` normalization remains
  present after the sync. **Do not move object-to-text normalization back into
  individual views.**
- No broad source merge is outstanding from this reconciliation. Current `main`
  contains the relevant design commits and the post-merge JSX compatibility
  fix. Resume from current `main`; do not replay the paused session's working
  tree wholesale.

Two separate follow-ups were found; neither is evidence that the design branch
was lost:

1. **Repaired 2026-08-28:** the analysis API selects
   `demographic_performance.impressions`, but that column was missing from the
   connected live schema. The repository's existing additive migration was
   applied as nullable `bigint`, with no historical zero-fill or data import.
   The all-time summary, explicit date-range summary, and daily-series routes
   now return HTTP 200 for Bookster, and a browser pass confirms that the KPI
   tiles and Daily Trend chart are visible again. Do not rewrite the Analysis
   Overview UI or restore old JSX generic syntax; the failure was schema drift.
2. Browser warnings for duplicate keys `C2B` and `Feed` point to dimensional
   rows being keyed too narrowly. `C2B` is valid across multiple result/creative
   rows and `Feed` can be valid across platforms. Confirm the emitting route,
   then normalize one-card-per-cell views by `cell_id` and key intentionally
   multi-platform placement rows by placement plus platform. Do not globally
   discard valid rows just to silence the warning.

The original repository reconciliation made no runtime-code, schema, data, or
branch changes. The later visualization repair changed only the live schema by
adding the already-canonical nullable column described above.

Every claim in this file is produced by a command you can re-run. Where a
number is an estimate rather than a measurement, it says so. Where a check is
known to be approximate, the approximation is named.

---

## 0. The instruments

Four of these are new this pass. They exist because "have we covered
everything?" is unanswerable from memory past about thirty surfaces, and a
hand-written checklist is stale the day after it is written.

| Command | Answers | Enforcing? |
|---|---|---|
| `check:ui-inventory` | Which of 145 surfaces carry type roles, motion, disclosure, shared dataviz, a breakpoint, a11y wiring | report only |
| `check:field-coverage` | Which of 450 declared JSON fields never reach the screen | report only |
| `check:optical-authority` | Weight never contradicts the size ramp; no mono face; no heading sized as chrome | **gate** |
| `check:type-scale` | 15px body floor, nothing readable under 13px, ≥3px header steps | **gate** |
| `check:disclosure-rulebook` | No raw pixel text sizes (ratcheting baseline, now 4) | **gate** |
| `check:token-colors` | Every colour from a token, incl. the `var(--color-<family>-<step>)` back door | **gate** |
| `check:interaction` | Hit areas, hover-only affordances, nested buttons | **gate** |
| `check:locator-ambiguity` | Spec locators resolve to exactly one control | **gate** |
| `check:chart-palette` | Status colours reserved, no cycled series slots | **gate** |

### What the instruments cannot see

Stated up front so nothing downstream is over-read.

- **`ui-inventory` measures per file.** A component can be responsive by
  virtue of its container. It scored `Sidebar` at 0% responsive, which is
  **false** — `AppShell` turns the rail into a drawer below 1024px with
  Escape, backdrop, scroll lock and close-on-navigate. Treat a RESP miss on a
  child of a responsive shell as unproven, not failing.
- **`field-coverage` cannot follow string indirection.** A field read as
  `obj[table.key]` is invisible to it. Two such cases were found and fixed by
  matching the field name as a bare string literal; there may be others, so
  the tool is tuned to **under-report**. Everything it flags still needs a
  human read.
- **No instrument renders anything.** jsdom applies no CSS. Layout,
  contrast-in-situ and reflow are only visible in `design-lab.html` or a
  browser run.

---

## 1. Closed this pass — with the evidence

### 1.1 Type system

| Change | Was | Now |
|---|---|---|
| Typeface count | 5 (Space Grotesk, Outfit, Lato, Rubik, Figtree) + mono | **2** — Outfit headings, Figtree everything else |
| Mono face | 305 usages / 78 files | **0**, gated. `tabular-nums` does the figure alignment |
| Reading floor | 12px caption | **13px**, gated |
| Body | 14px | **15px**, gated |
| Header ramp | 32·27·23·20·17 | **34·28·24·21·18**, every step ≥3px |
| Webfont payload | 16 faces | **7** — ~210 KB removed |
| Raw pixel text classes | 152 (invisible: the gate did not scan `components/`) | **4**, ratcheted |

### 1.2 The optical-authority inversion

Measured across 104 files: **331** weight-emphasized elements in the 10–12px
chrome band against **55** at 17px and above. Six to one, and in the wrong
direction — 15 uppercase eyebrows at `font-bold` while 40 card titles had been
downgraded to `font-semibold` at their call sites. An eyebrow outranking the
title it labels, on the same card.

Plus nine real `<h3>`/`<h4>` elements sized at 10–12px mono-uppercase, heading
stacks of 14px cards: the heading was **smaller than its own content**.

All fixed; `check:optical-authority` enforces the rule and was verified to fire
by reintroducing a violation.

### 1.3 Data-honesty defects found while refacing

These are bugs, not style. Each was invisible in a passing suite.

| Defect | Consequence | State |
|---|---|---|
| `buildFunnelStages` coerced a measured **0** to null, and the renderer dropped nulls | On an account with traffic and no purchases, the **Purchase stage vanished from the funnel**. Reader concludes data ends at Add-to-cart | fixed, 10 tests, verified against pre-fix code |
| Same function summed with `?? 0` | One row with `purchases: 5` and one with nothing reported **5 as the account total** | fixed via `sumStrict` |
| Deck keyboard was an unguarded `window` listener | ArrowRight **anywhere on the page** approved the top recommendation into the tray | fixed |
| `setTimeout(160)` commit with no cleanup | Navigating mid-flight fired a callback against an unmounted component | fixed |
| `border-[color:var(--color-sky-500)]` ×4 | Raw Tailwind palette **past `check:token-colors`** through an arbitrary CSS var | fixed + gate closed |
| Closed mobile drawer was `aria-hidden` only | ~20 invisible nav controls stayed in the tab order on a phone | fixed with `inert` |
| Sidebar resize handle: `role="separator"` + one `onPointerDown` | Announced itself as a resize control, unreachable by Tab | fixed, full splitter pattern, 5 tests |
| **Testing Library cleanup never registered** (`globals` unset) | Every component test leaked its DOM into the next; `getAllBy*` counted every render in the file | fixed; suite still passes at 2045 |
| **`DenseText` gated its More/Less button on a CHARACTER count while the clamp counts LINES** | Every one of ~20 call sites could show a "More" control over text that was not clipped. Measured on the provenance page at 1440px: three notes with `scrollHeight === clientHeight === 48`, each carrying a button that did nothing visible. An affordance that promises hidden content and delivers none teaches people the control is a lie, and they stop pressing the ones that work | fixed — measures real overflow via `ResizeObserver`, re-measured on resize; 6 tests, browser-verified at 1440 (0 buttons) and 390 (3 buttons, all over genuinely clipped text) |

The `DenseText` defect is the clearest argument in this document for
**rendering** as a verification step. No static check can see it: the class is
present, the prop is passed, the component is correct in isolation. It is only
wrong once a browser has done layout — and only at some widths.

### 1.4 Widget layer shipped

`DisclosureStack` · `SwipeDeck` · `ActionSlider` · `RunProgress` ·
`FilterDisclosure` · `RankedBars` · `DataModule` · travelling tab indicator
(`TabRail`, `SegmentedToggle`) · `lib/motion.ts`.

### 1.5 Data Provenance — a new surface, not a reface

`/app/settings/provenance` (`DataProvenanceView.tsx` + `lib/data/provenance.ts`).
The chain of custody for every number in the product: the assembly statement
verbatim, which variable families have no registry definition, and per account
the file behind each loop stage, the MST source artifacts and the full run
metadata. Detail in §3.

---

## 2. OPEN — surface gaps

`check:ui-inventory --gaps`: **126 of 145 surfaces** miss type roles or a
breakpoint. By kind:

| Kind | n | TYPE | MOTION | DISCL | VIZ | RESP | A11Y |
|---|---|---|---|---|---|---|---|
| shell | 7 | 0% | 0% | 0% | 0% | 57% | 71% |
| nav | 1 | 0% | 100% | 0% | 0% | 0%\* | 100% |
| page | 71 | 41% | 1% | 35% | 13% | 28% | 38% |
| module | 3 | 33% | 0% | 0% | 33% | 33% | 100% |
| widget | 5 | 100% | 100% | 40% | 40% | 0% | 100% |
| chart | 9 | 44% | 11% | 11% | 89% | 0% | 100% |
| panel | 39 | **26%** | **3%** | **8%** | 13% | **18%** | 54% |
| popup | 10 | 90% | 0% | 0% | 0% | 40% | 50% |

\* false — see §0.

**`panel` is the weak class**: 39 surfaces, three-quarters off the type ramp,
92% with no disclosure, 82% with no breakpoint. It is where the next pass goes.

### The ten that matter most, by size × gap count

1. `components/loop/LoopCommandChain.tsx` — 2091 lines, **no** type roles, no
   disclosure, no viz, no breakpoint
2. `pages/metrix/ConnectAccountDialogs.tsx` — 2353, no disclosure/viz/RESP
3. `pages/metrix/ManualAnalysisControls.tsx` — 1535, no type roles
4. `components/layout/TaskTray.tsx` — 967, none of the six but a11y
5. `pages/metrix/analysis/tables.tsx` — 614, none but a11y; 3 raw `<table>`
6. `pages/metrix/ManagerOverview.tsx` — 598, no disclosure, no viz — the
   landing surface
7. `pages/metrix/analysis/PlacementsView.tsx` — 555, no disclosure, no viz
8. `pages/metrix/mst/MstCommandCenter.tsx` — 713, no type roles
9. `components/creative/CreativeCard.tsx` — 406, none but a11y
10. `components/analysis/RunSelector.tsx` — 271, none of the six

---

## 3. Data the JSON carries and the interface drops

`check:field-coverage` measured **32 of 450** fields never read. Triaged by
what losing them costs — and re-measured after the provenance pass.

### Tier A — provenance · **CLOSED**

Every field below was computed server-side on every seed build and reachable
from no screen. They are now one surface: **Settings → Data Provenance**
(`/app/settings/provenance`, `DataProvenanceView.tsx`, reading
`lib/data/provenance.ts`).

| Field | What it is | Where it now surfaces |
|---|---|---|
| `MetrixSeed.integrity_note` | The assembly statement — how the bundle was built, and its explicit "do not fabricate missing values" rule | Assembly statement card, **verbatim** |
| `MetrixSeed.schema_version` | The contract the bundle was built against | Assembly statement card |
| `MetrixSeed.variable_registry` | The data layer's own truth about variable families, incl. explicit `registry_missing` (ST_/AW_/CTA_) | Variable registry backing — unbacked families sorted first, each with its confirmed-gap note |
| `LoopStageStatus.source_file` | Which file produced a loop stage | Per-account stage table, plus a `named / total` coverage fraction |
| `MST.source_artifacts` | Which artifacts an MST result came from | Per-account MST source artifacts |
| `IAPData.metadata` | Run metadata for the IAP bundle (untyped record) | Per-account run facts, **flattened** to dotted paths — not pick-listed, so a key added upstream still reaches the screen |

Three design rules the surface enforces, each with a test that fails when the
rule is broken (verified by mutation — see §6):

1. **Nothing is invented.** A seed with no `integrity_note` reports *"no
   assembly statement"*. The server substitutes a default when config carries
   none; if the client did too, a seed with no provenance would be
   indistinguishable from one with real provenance.
2. **Nothing is dropped.** `metadata` is `Record<string, unknown>` whose shape
   this app does not control, so it is traversed totally. `null` survives as
   the word `null`; `false` and `0` render rather than reading as missing.
3. **An unknown status fails toward "flag it".** Any registry status that is
   not literally `active` counts as unbacked.

### Tier B — honesty qualifiers · **partly closed**

| Field | Status |
|---|---|
| `ConversionTrackingSignal.tracking_basis` | **CLOSED.** `PlacementsView` had the same disclaimer hand-written three times — *"delivery spend not applicable for this tracking basis"* — while the basis it described sat unread in the field. That sentence is true only of the conversion basis, so a second basis from the assembler would have printed a **false** disclaimer over rows where spend *is* attributable. Copy is now looked up from the basis; an unrecognised basis gets a caveat that names it and claims nothing about it. The basis also labels the caveat strip. |
| `MetrixSeed.integrity_note` | **CLOSED** — see Tier A. |
| `CampaignWindow.campaign_name`, `.os` | **OPEN.** The reader cannot see which campaign and OS a window covers. Belongs on the campaign-window surface, not in Settings. |

### Tier C — server-directed UI state the client ignores · OPEN

`AdAccountOverviewState.primary_action` / `.secondary_action` ·
`OptimizationLoop.manager_overview_visibility` / `.dismiss_policy` ·
`ManagerAccount.overview_mode` · `AppDefaults` (5 fields) ·
`CreativeDeconstruction.overridden_by` / `.overridden_at` / `.updated_at`

The server computes a recommended next action per account and the UI does not
read it. Either surface it or delete it from the contract — shipping a field
nobody consumes is a promise to a future reader that it means something.

`CreativeDeconstruction.detected_copy` moves here from Tier A on inspection:
it is per-creative detected message/CTA/visual-system text, which belongs on
the creative card, not on a provenance page. It stays open.

### Tier D — correctly unread, with a reason · CLOSED as a worklist item

`WorkspaceBilling` (7 fields) · `WorkspaceInvoice.amount_usd` —
**deliberately not shown.** `BillingView` renders an honest beta pending state
because Metrix has no live billing; rendering plan/usage/invoice values from
the seed would be fabricating a subscription that does not exist. These stay
unread on purpose, and `check:field-coverage` will keep listing them. That is
the tool working: it reports, a human decides.

`AdAccount.facebook_page_dp_url` — a page avatar, cosmetic, still open.

---

## 4. Watermelon mapping

Taken as **interaction models, not styling** — the reference sheet's own rule,
and the right one for a dense analytical product. Ported components are rebuilt
against Metrix tokens and `lib/motion`; dropped in verbatim, the first
reference component produced 29 token-colour violations.

### Shipped

| Reference | Metrix surface | Mechanic taken | Deliberately not taken |
|---|---|---|---|
| `card-swipe` | `SwipeDeck` → RecommendationDeck | drag + velocity commit, spring, stamp overlays | the rotateY carousel form |
| `card-split-accordian` | `DisclosureStack` | split-in-place reveal, soft height spring | — (registry URL 404s; built from the demo you sent) |
| `filter-disclosure` | `FilterDisclosure` → IapLibraryView | collapse-to-trigger, expand on demand | hiding active filters — see below |
| `labeled-progress-indicator` | `RunProgress` → analysis run | animated stage label, sweep on the filled bar | timer-rotated labels (fabrication) |
| `fluid-tabs` | `TabRail`, `SegmentedToggle` | shared-layout travelling indicator | the blur pulse on the active label (hurts scanability) |

`FilterDisclosure` adds what the reference does not need: a hidden active
filter is a lie about the data, so the collapsed state states what is active as
chips beside the count it produced. `activeSummary` is a **required** prop.

### Mapped, not yet built — in priority order

| Reference | Metrix surface | Why this one | Data it must surface |
|---|---|---|---|
| `inline-table-control` | `analysis/tables.tsx`, and the three drilldown **modals** | Row expands **in place** while the rest of the table dims — replaces `SegmentDrilldownModal`, `VariableDrilldownModal`, `KpiDrilldownModal`, all of which take you out of context to read one row | every column already in the row, plus the drilldown payload those modals fetch |
| `collection-grid-disclosure` | `CreativeLibraryView`, `ConceptFamilyView` | Expandable concept/creative grids — a cell grows to show its members without a route change | `MSTLibraryCell` members, `detected_copy` (Tier A) |
| `layered-progressive-disclosure` | `LoopCommandChain` (2091 lines, zero disclosure) | The single densest surface in the app | loop stage status + `source_file` (Tier A) |
| `dialog-stack` | `ConnectAccountDialogs` (2353 lines) | Layered drill-down without route churn — the file is a stack of dialogs already, built by hand | — |
| `quick-switcher` | `AccountSwitcher` | Fast account switching; the current one is a dropdown with a search box | `ManagerAccount.overview_mode` (Tier C) |
| `morphing-sidebar-controls` | `Sidebar` | Collapse/expand as a morph rather than a width jump | — |
| `list-stack` | `TaskTray`, `ActionQueueView` | Stacked list with depth — a queue that reads as a queue | tray items |
| `inline-toast` / `copy-confirm` | Export and copy actions | Micro-confirmation without a global toast | — |
| `onboarding-checklist` | `OnboardingWizard` | Setup progress that is a checklist, not a wizard | `AdAccountOverviewState.primary_action` (Tier C) |
| `expand-details` | `SignalCard`, `FindingsView` | The lightest disclosure for a single card | — |

### Deliberately not ported

- **`contextual-ai-bar`** — there is no Metrix Agent surface to attach it to.
  Building the bar first is building a control for a feature that does not
  exist.
- **`feature-tour`** — the reference sheet says "only where necessary". A tour
  is what you build when the interface did not explain itself; the disclosure
  work is the cheaper fix.
- **`command-search`** — worth it, but after the panel pass. A command palette
  over surfaces that are still off the type ramp accelerates access to
  inconsistency.

---

## 5. Gameplan

Each phase has an exit criterion that is a command, not a judgement.

### Phase 1 — the panel class (largest measured gap)

**Corrected count: 30 panels, not 39.** Nine of the files in that bucket were
seven React context providers, the router and the design lab. A provider
returns `<Ctx.Provider>{children}</Ctx.Provider>` — it has no heading to give
a type role, no breakpoint to add, nothing to disclose. It can never satisfy
the checks, so it permanently dragged the class average down, and the exit
criterion written against that average was **unreachable**: nine of
thirty-nine caps the class at 77%, below its own 90% gate.

A gate nobody can pass gets ignored, and then it stops protecting the thirty
files that *can* pass. `check:ui-inventory` now excludes infrastructure and
names what it excluded on every run.

| | before | after |
|---|---|---|
| panels | 39 | **30** |
| TYPE | 26% | **33%** |
| RESP | 18% | **20%** |
| A11Y | 54% | **70%** |

The A11Y jump is the measure of how much the providers were distorting: 16
points of that number was never about accessibility at all.

Work them in size order; the top ten are §2. For each: type roles, a
breakpoint or a container query, disclosure where the surface is dense, and
`lib/motion` for anything that moves.

**Exit:** `check:ui-inventory --kind=panel` shows TYPE ≥ 90%, RESP ≥ 80% —
now reachable, because every file counted can reach it.

### Phase 2 — Tier A and Tier B field coverage · **DONE except one**

Six Tier-A provenance fields and `tracking_basis` are shipped (§3). Remaining:
`CampaignWindow.campaign_name` / `.os` — the campaign and OS a window covers,
which belong on the campaign-window surface, not in Settings.

**Exit:** `check:field-coverage` Tier A/B count reaches 0; each new surface has
a test asserting the field renders and a gap renders as a gap. Currently 2 of 9
remain.

Note the exit criterion is deliberately NOT "`check:field-coverage` reports 0
unread". Tier D fields are unread *correctly* — see §3. A gate that forces
every declared field onto a screen would have forced fabricated billing data
into the product.

### Phase 3 — inline-table-control, replacing three modals

Build the row-expands-in-place control, then retire `SegmentDrilldownModal`,
`VariableDrilldownModal` and `KpiDrilldownModal` onto it. This is the largest
single UX gain available: three surfaces that currently break context to read
one row.

**Exit:** the three modals are deleted; `check:ui-inventory --kind=popup` drops
by three; drilldown specs pass against the inline control.

### Phase 4 — the two remaining walls

`LoopCommandChain` (2091) and `ConnectAccountDialogs` (2353) via
`layered-progressive-disclosure` and `dialog-stack`.

**Exit:** both carry type roles and disclosure in `ui-inventory`.

### Phase 5 — responsive and motion sweep

Container queries on the module frames so a panel reflows to its container
rather than the viewport — which is what actually matters when the sidebar
collapses. Then `lib/motion` across the surfaces that animate by hand.

**Exit:** `ui-inventory` MOTION ≥ 60% on panel/page; a browser pass at 390 /
768 / 1024 / 1440 with the sidebar both states.

### Phase 6 — the remaining ports

`collection-grid-disclosure`, `quick-switcher`, `list-stack`,
`morphing-sidebar-controls`, `inline-toast`, `copy-confirm`,
`onboarding-checklist`, `expand-details`.

---

## 6. Confidence

Stated per claim, because a single number would be dishonest.

| Claim | Confidence | Basis |
|---|---|---|
| The type ramp, mono removal and optical-authority rules are applied and cannot regress | **high** | four gates, all passing, each verified to fire on a reintroduced violation |
| The eight data-honesty defects in §1.3 are fixed | **high** | each has tests; the funnel tests were run against the pre-fix code and four fail there |
| 126 surfaces have a type or responsive gap | **high** for the count, **medium** for per-file accuracy | measured, but per-file detection cannot see container-provided responsiveness |
| 32 JSON fields never reach the screen | **medium-high** | calibrated in both directions and spot-verified, but string indirection can hide a read; tuned to under-report |
| The Watermelon mapping is the right one per surface | **medium** | grounded in the fetched registry sources for the ported five; the unbuilt ten are judgement from the component contract, not from having built them |
| Phase estimates | **not stated** | I have not given any, and would be guessing |

### What is NOT verified, and needs a browser

No instrument here renders CSS. The 15px body floor, the lifted ramp and the
racing-form table have been asserted structurally and never *looked at*. The
lift is a ~7% increase in body text across every surface, and dense chrome —
the sidebar, the task tray, the loop chain — is where it will show first.

**This is the highest-value next action and it is a human one:** open
`design-lab.html` and the app at 390 / 768 / 1440, sidebar collapsed and
expanded, and look. Everything above is true about the code; whether it is
*good* is a question the code cannot answer.
