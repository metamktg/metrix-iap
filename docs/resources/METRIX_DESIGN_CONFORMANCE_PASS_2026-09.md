# Metrix design conformance pass

**Status:** the standing design gate for every UI pull request, from 2026-09-05. Owner flag, the
same day: "significant UI interface regressions … incorporate the UI/UX design interface into our
validation process … optical hierarchy, progressive disclosure, and user-friendliness … data
visualizations, modules, filtering regressions from dropdown robust configuration, and other
systematic ui ux regressors."

## 0. Why this exists, and what it caught first

The bar before this pass was static (typecheck, the unit suites, thirteen `check:*` gates over the
source) and browser-at-rest (the route crawl, `check:friction`, `check:accessible-names`,
`check:chart-geometry`, `check:unexplained-dashes`, `check:virtual-tables`, `check:scroll-fade`).
Nothing in it ever OPENED a control. The first run of `check:controls` on 2026-09-05 found the KPI
tile's metric picker (every KPI tile on Analysis Overview, Ad Performance, Budget, Avatars, the
creative dialogs and the drill-downs) rendering as a fixed menu 633 px tall with no scroll: past the
bottom of a 900 px window, past the fold on a phone with its lower rows unreachable, closing itself
on its own scroll, promising a listbox and rendering none, with no Escape. Every unit test and every
static gate had passed. That is the class of regression this pass is for.

## 1. The pass, per pull request

Three parts, all recorded in the PR body with the command that produced each number.

### 1.1 `check:controls` (mechanical, read-only, needs the dev server on 5178)

`pnpm --filter @workspace/scripts run check:controls` opens every dropdown, popover, menu and
dialog trigger on every route (`navTree.ts`, `App.tsx`, legacy targets), for two fixture accounts,
at 1440 and 390 px, and asserts for each: it OPENS (the trigger reports expanded and a floating
surface gains size: a Radix popper, a hand-portalled menu, a dialog, anything fixed that was not
there before the click), it is VISIBLE (inside the viewport, or scrollable within it), it is
POPULATED (an option, item, control or input inside), it carries the ROLE the trigger promised
(`aria-haspopup="listbox"` opens a listbox, `"menu"` a menu) and it CLOSES on Escape. Native
`<select>`s carry options and an accessible name. Narrow with `CONTROLS_ROUTES`,
`CONTROLS_ACCOUNTS`, `CONTROLS_WIDTHS`. Exit 0 clean / 1 a control failed / 2 nothing checked.

### 1.2 The crawl, reviewed against the standard (judgement, read-only)

`shoot:routes` at 1440 and 390 px for every route the PR touches (the whole tree for a design
round), on both fixture accounts. Every shot is READ, not counted, against §2. A finding is filed
in the audit register with the route, the width, the shot, and the rule it breaks; a PR is not
done while a finding it caused is open.

### 1.3 The interaction sweep (judgement, in the browser)

For every control the PR adds or touches: open it, choose, close it, reload, and read what the
page remembers. Persistence is part of the control (the KPI tiles persist per view in
`localStorage`; the run scope per account; the date range per browser). A control that forgets is
a regression as much as one that clips.

## 2. The standard, as a checklist

Optical hierarchy
- One H1 per page, the account name and the page name; the eyebrow names the view and the
  section; section titles sit OUTSIDE their tiles, left, with their controls right.
- Weight and size carry the hierarchy, not colour alone: value > label > caption; the
  `typography.ts` ramp only, no raw pixel sizes (`check:type-scale`).
- One primary action per surface; secondary actions subordinate; at most one notice per page.
- A right-hand slot never squeezes the title: it wraps under it at phone width (round 6).

Progressive disclosure
- The first layer is fragments: labels, values, chips, one-line captions. Prose over 220
  characters lives behind `DetailReveal`, a drawer or a clamp with More (`check:friction`
  ratchets it; the rulebook atop `shared.tsx` is authoritative).
- Every null value is a dash with its reason reachable (`check:unexplained-dashes`).
- A warning is a count with a disclosure, never a column of amber boxes (Alerts, round 7).

Controls, filters and configuration
- Every dropdown, popover and menu passes `check:controls`; every filter's options are the
  configured set (the catalog, the run list, the result scope), never a stale or empty list.
- A picker's choice persists where the product says it does and is visible after reload.
- A segmented control keeps its labels (icon-only collapse only with an icon, round 6); a rail
  scrolls inside itself and fades where it overflows (`check:scroll-fade`).
- Keyboard: every floating layer closes on Escape and returns focus; every control has an
  accessible name (`check:accessible-names`).

Data visualisations and modules
- Every chart carries its legend or axis, its marks inside its frame (`check:chart-geometry`),
  the chart palette only (`check:chart-palette`), and a caption that names the rows it reads.
- A module never fabricates: no zero for an unmeasured value, no data from a stage that has not
  run; the empty state names the cause and the action.
- Tables inside a scroller keep their content width (round 6); values are tabular figures.

Layout and responsiveness
- No horizontal page scroll at 390 px; every surface stacks below `lg`; tile values never clip.
- Hit targets at least 24 px (AA), 40 px preferred (`check:interaction`).

## 3. Where the results go

- The PR body: the commands run and their one-line outputs, the routes shot and read.
- The audit register (`METRIX_UI_AUDIT_ROUND4_2026-09.md` and its successors): one row per
  finding, with the verdict and the fix.
- `ARCHITECTURE_CHANGE_LOG.md`: the entry for the PR names the gates and the shots.
