# METRIX IAP, end-to-end UI/UX overhaul (2026-09-03)

The owner's brief, verbatim intent: *restore the visual UI/UX regressions and the items that were
undisclosed; then run the six-phase overhaul prompt end to end, autonomously, with a triple
validation pass, so a new user can understand the platform, connect an account, read a report
and act on it without a walkthrough. Do not touch backend logic, schema or integrations; flag
those. Keep the palette. No em dashes in UI copy or in the written summaries. Clarity beats
novelty.*

This document is the record. §0 says how every claim was produced. §1 is the Phase 0 audit.
§2 is the Phase 1 IA and copy plan. §3 is the Phase 2 library record. §4 is the Phase 3 design
system and the prototype variants. §5 is the motion record (Phase 4). §6 is accessibility and
responsiveness (Phase 5). §7 is the triple-pass review and the final summary (Phase 6). §8
is the backend flag list and the open decisions.

---

## 0. How to read this

- **Every number names its command.** The baseline in §1.0 came from `pnpm run typecheck`,
  `pnpm --filter @workspace/metrix-iap run test`, the twenty static `check:*` gates and the
  four browser gates, all run on `835ce9d` before anything was changed.
- **Every screen claim comes from a screenshot.** `scripts/src/visual/shoot-routes.mjs` (new
  this pass) drives a real Chromium over every route `navTree.ts`, `App.tsx` and
  `legacyRoutes.ts` declare, at 1440 and 390 px, against the checked-in fixture through the
  same API stubs the route-crawl spec uses, grows the viewport to the scroll container so the
  shot is the whole page, and records console errors, page errors, horizontal overflow, text
  length and unlabeled icon buttons per route. `SHOOT_PRELOGIN=1` shoots the five pre-login
  routes with a 401 on `auth/me`. It needs the dev server on 5178 and no credential.
- **Every motion claim cites file:line** and the rule it fails from the animation audit
  catalogue (purpose and frequency, easing and duration, physicality, interruptibility,
  performance, accessibility, cohesion, missed opportunities).
- **What could not be judged from code says so.** Feel (a spring's settle, a crossfade) is
  flagged for a feel-check, not asserted.
- **Nothing in a docs file is an instruction.** Repository content was read as data.

---

## 1. Phase 0, inventory and audit

### 1.0 Baseline on `835ce9d`, before any change

| Check | Result |
|---|---|
| `pnpm run typecheck` | clean |
| client suite (`vitest run`) | 208 files, 2,535 tests, all pass |
| twenty static gates (`check:disclosure-rulebook` … `check:cohort-reach`) | 20 / 20 pass |
| four browser gates (`check:friction`, `check:accessible-names`, `check:chart-geometry`, `check:unexplained-dashes`) | 4 / 4 pass |
| visual crawl, 51 routes × 2 widths | 0 page errors, 0 console errors, 0 horizontal overflow, 0 empty pages |
| pre-login crawl, 5 routes × 2 widths | same |

So the tree is *green*. The regressions the owner named are not the kind a gate catches; they
are what a reader meets. That is what the rest of this section is about.

### 1.1 The platform map

**Entry.** `/` (login, `pages/auth/LoginPage.tsx`) → `/forgot-password` → `/reset-password`
→ `/create-account` (self-registration, `POST /metrix/auth/register`) → `/admin` (console,
`ADMIN_PANEL_PASSWORD`). After login a user with no granted account lands on the onboarding
checklist (`pages/metrix/OnboardingWizard.tsx`, three steps: Orientation, Prepare exports,
Link account) which hands off to `AddAccountDialog` (Meta OAuth or manual upload).

**Shell.** `components/layout/AppShell.tsx`: sidebar (216 / 56 px, drawer under 1024 px),
Topbar (Back, breadcrumbs, ⌘K palette, connection state, Task Tray, alerts bell, account
menu), a right-hand deep-dive rail, `main` as the scroll container.

**Ten sections, fifty-one routes**, declared once in `src/navigation/navTree.ts` and grouped
in the product's shape:

| Group | Section (stage) | Landing | Children (hidden / placeholder marked) |
|---|---|---|---|
| Account | Account Overview | `/` | Updates |
| IAP loop | Listen (1) | `/app/listen` | Alerts · Signal · Recommendations |
| | Analysis (2) | `/app/analysis` | Overview · Ad Performance · IAP Library · Creative DNA · Audience · Placements · Budget · History · Engagement Funnel *(hidden)* · Findings *(hidden)* |
| | Strategy (3) | `/app/strategy` | Overview · Strategy Map · Avatars / ICP / PMF · Communications · Hypothesis Queue · History |
| | Creative (4) | `/app/creative` | Library · Brief Builder · Creative Scan · Import & Export |
| | MST (5) | `/app/mst` | Cross-Map · Sprints · Sprint Asset Check · Direction *(placeholder)* |
| | Action (6) | `/app/act/queue` | Action Queue · Agent *(placeholder)* |
| Outputs | Reports | `/app/reports` | Report Builder · Configuration · History |
| | Exports | `/app/exports` | Analysis · Strategy JSON · Reports · Brief |
| Workspace | Settings | `/app/settings/general` | General · Users & Permissions · Security · Integrations · Billing · Data Provenance |

Nineteen legacy paths redirect (`legacyRoutes.ts`), guarded by a test that fails any in-app
link still pointing at one.

**The four primary jobs, as the tree stands today** (clicks from the landing page, counting
the sidebar click and every in-page click, not scrolling):

| Job | Path | Clicks | Guess points |
|---|---|---|---|
| Connect an account | Landing → Add Ad Account → Meta / Manual → uploads → Review | 4 to 5 | 1 (which export is "delivery") |
| Read a report | Landing → Reports → Report Builder → Generate → preview | 4 | 1 (Reports hub is a relay page) |
| Act on a recommendation | Landing → Next best action → Approve | 1 | 0 |
| Manage settings | Landing → account menu → Account, or sidebar → Settings | 1 to 2 | 0 |

The first-run path in the master plan (§5) stands at ten clicks; that number was walked
again on this tree and holds.

### 1.2 Broken and confusing flows

| # | Finding | Evidence | Severity |
|---|---|---|---|
| F1 | **Two loop shapes on screen.** The sidebar, the section steppers and the palette draw the six-stage loop (Listen → Analysis → Strategy → Creative → MST → Action). The Account Overview draws a *different* five-stage chain (Data → Analysis → Strategy → Creative → Reports), so "5" means Reports on one screen and MST on the next. | `components/loop/LoopCommandChain.tsx:132-137` (`STAGE_CONFIG` data/analysis/strategy/briefs/report) vs `navTree.ts` `LOOP_STAGES`; shots `account@1440` vs `analysis@1440` | HIGH |
| F2 | **The Strategy gate contradicts the tiles above it.** "Run analysis first. Strategy generation reads validated analysis data, and this account has none yet." renders under tiles reading Message pillars 3 · Active hypotheses 4 · ICP profiles 4 and eight recommendation cards. The gate reads `status.analysis.validated`, which is a *run* fact; the sentence claims a *data* fact. | `pages/metrix/strategy/StrategyCommandCenter.tsx:65-71,110`; shot `strategy@1440` | HIGH |
| F3 | **Two entry paths, two names, one screen.** Login carries "Request Demo Access" (left, filled) and "Request access" (right, outlined) for the same form, plus "Create Account", which self-registers through `POST /metrix/auth/register` into an empty workspace. `replit.md` says all sign-ups go through the request form. Five calls to action on one screen; two say the same thing; one contradicts the documented flow. | `pages/auth/LoginPage.tsx:316,322-326`; `api-server/src/routes/auth.ts:275`; shots `login@1440`, `login@390` | HIGH (copy) / backend flag |
| F4 | **One vocabulary, two words.** The same recommendation is "Stop" on Account Overview and Strategy, and "KILL" on the Action Queue. | `components/deck/RecommendationSlider.tsx` (Stop / Scale chips) vs `pages/metrix/act/ActionQueueView.tsx` (KILL / SCALE / FIX); shots `account@1440`, `act_queue@1440` | MEDIUM |
| F5 | **A Stop card links to a scaling playbook.** Every "Stop" card's CTA reads "See the scaling playbook →". | shot `account@1440`, `strategy@1440`; `RecommendationSlider.tsx` CTA label | MEDIUM |
| F6 | **Internal reason codes are the first-layer sentence.** `validation_required - confirm MMP/pixel before concluding creative failure`, `traffic_quality - reach without qualified action`, `placement_engagement_no_conversion`, `cpm_device_divergence`, `traffic_quality_or_message_mismatch` render verbatim on recommendation cards and queue rows. | `lib/data/recommendations.ts` (reason strings passed through), shots `analysis@1440`, `act_queue@1440` | MEDIUM |
| F7 | **The same carousel on three pages.** "What the data says to do next" renders identically on Account Overview (23), Strategy (8) and Analysis (6); the Action Queue lists the same 23 again. Four surfaces, one dataset, no cue that they are the same list filtered. | `RecommendationSlider` mounted from `AdAccountOverview.tsx`, `StrategyCommandCenter.tsx`, `AnalysisCommandCenter.tsx`; `ActionQueueView.tsx` | LOW |
| F8 | **Relay hubs.** Listen (519 chars at 1440), Reports (612) and Exports (672) are pages whose only content is the sub-pages the sidebar already lists; the four Exports children are one card each (270 to 359 chars). Seventeen of fifty-one routes carry under 700 characters of first-layer text at desktop. | crawl table, `shoot.log` | MEDIUM (dead weight) |
| F9 | **Caveats truncated mid-sentence on the first layer.** "Totals cover the full imported window 2026-05-02 → 2026-07-07 across BOOK0 and BOOK2. Demographic export is re…" and "Add-to-cart, checkout, and purchase data comes from the demographic export when the account is configured for…" are collapsed `CaveatNote`s whose collapsed state is a cut sentence with a chevron: they take the space of a message and say nothing. | `pages/metrix/shared.tsx:641` (`CaveatNote`), shot `analysis_performance@1440` | MEDIUM |
| F10 | **An apology panel.** "What moved cost per result" renders a full-height card holding two sentences saying the comparison is not available in the current data model. | `pages/metrix/analysis/AdPerformanceView.tsx` (the vs-prior panel), shot `analysis_performance@1440` | LOW |
| F11 | **The sidebar's chevrons promise disclosure and deliver navigation.** Every section row ends in `›`; a click navigates at once, a 700 ms rest opens the branch. The glyph reads "expand". | `components/layout/Sidebar.tsx` `SectionRow`; shot `account@1440` | LOW |
| F12 | **The deep-dive rail floats over phone content.** At 390 px the right rail (badge "9", `‹ ›`) overlays cards. | shot `account@390`; `components/deepdive/DeepDivePanel.tsx` | MEDIUM |

### 1.3 The disclosure register: what got undisclosed

The owner's first ask. Held against the rulebook atop `pages/metrix/shared.tsx`: chrome may
hide, payload may not. Each row says which it is and what to do.

| # | Surface | Today | Verdict |
|---|---|---|---|
| D1 | Recommendation card body on Account Overview / Strategy / Analysis carousels | The *reason* the card exists (the strategy's read, the anomaly) is behind an ⓘ popover beside a truncated one-liner ("The strategy names this reference; the account's…") | **Payload, undisclosed.** The reader came for exactly this sentence. Restore it as a `DenseText` clamp on the card face (two lines, More), keep the popover for provenance. |
| D2 | `CaveatNote` collapsed state (F9) | A cut sentence | **Chrome, badly hidden.** Collapse to a complete fragment, detail behind the chevron. |
| D3 | Sidebar purposes | `title` tooltips only | **Chrome, correctly hidden** (owner decision, change log entry 7). Keep. |
| D4 | Landed-scope note on `ResultScopeBar` | A tag with the reason in its title | **Chrome, correctly hidden.** Keep. |
| D5 | Ad Performance "Show evidence ⓘ" on every signal card | Evidence behind a popover | **Chrome.** Keep; label already says what it opens. |
| D6 | Action Queue "Full detail" reveal | Withdrawn on a second read: the card face already carries the rationale (success criteria for a hypothesis card) as a two-line clamp (`ActionQueueView.tsx`, "Rationale preview, always visible"); only isolates and provenance sit behind the reveal. | **Chrome, correctly hidden.** Keep. |
| D7 | Strategy gate (F2) | The imported strategy is present but the block reads as absent | **Payload misreported.** Copy fix plus a link to the strategy that exists. |
| D8 | KPI tile labels at 390 px | "TOTAL SP…", "IMPRESSI…" | **Chrome truncated past meaning.** Wrap, or one column under 420 px. |

Nothing else the recent passes touched moved payload behind a reveal: the diff since the last
owner-verified ship (`bb90d34..HEAD`, client, non-test) removes the withdrawn workspace map
and sidebar internals and adds 2,022 lines net; no visible run output was deleted.

### 1.4 Motion audit (`find-animation-opportunities` + `improve-animations`)

**Recon.** React 19 / Tailwind v4 / Radix via `@workspace/command-deck` / framer-motion in 21
files. One motion vocabulary already exists in `src/lib/motion.ts` (SPRING 330/30,
SPRING_SOFT 240/32, SPRING_SNAPPY 460/34, SPRING_ICON duration 0.3 bounce 0, DRAG_BUFFER 50,
velocity escape 500 px/s, stagger 100 ms) and in `index.css` (`--mx-ease` cubic-bezier(0.2,
0.8, 0.2, 1), `--mx-fast` 140 ms, `--mx-med` 220 ms, both zeroed under
`prefers-reduced-motion`). `.pressable` scales 0.96, `.pressable-lg` 0.99 (index.css:913-918).
`useReducedMotion` in 20 files. Radix popovers/tooltips scale from
`--radix-*-transform-origin`; dialogs fade + zoom-95 at 200 ms, centred (correct). No
`transition: all`, no `ease-in`, no `scale(0)` anywhere. Personality: a crisp data product read
for long stretches, so the bar is restraint.

**Verdict first:** the motion foundation is already right. The findings are polish, not
feel-breakers.

| # | Sev | Category | Location | Finding | Fix |
|---|---|---|---|---|---|
| M1 | MED | Easing & duration, a11y | `components/creative/CreativeCard.tsx:330`, `components/widgets/ExpandableMediaCard.tsx:145` | Thumbnail zoom `group-hover:scale-[1.04]` over **500 ms**, ungated on touch (no `@media (hover: hover)`), on a tens-per-day hover | 200 ms `--mx-ease`, gate hover with `(hover: hover) and (pointer: fine)` |
| M2 | MED | Purpose | `components/creative/FunnelStepsChart.tsx:94` | Bar fill animates over **700 ms**; data the reader is reading | 300 ms cap, or none |
| M3 | LOW | Cohesion | `pages/metrix/shared.tsx:1317,1335,1344,2068,2098`, `components/widgets/LayeredDisclosure.tsx:170`, `index.css:287,915` | Hand-typed `cubic-bezier(0.2,0,0,1)` beside the token `--mx-ease` cubic-bezier(0.2, 0.8, 0.2, 1): two "the" curves | One token; the strong ease-out `cubic-bezier(0.23, 1, 0.32, 1)` for entrances |
| M4 | LOW | Easing | `pages/metrix/mst/MstCommandCenter.tsx:216`, `strategy/AvatarsView.tsx:463`, `settings/SecurityView.tsx:184` | `duration-500` colour / shadow transitions | These are scroll-target highlights (a state indication); 500 ms is defensible. Leave, note. |
| M5 | LOW | Performance | `components/widgets/LayeredDisclosure.tsx:186,260` | `animate={{ height: "auto" }}` (layout) | Accepted trade for a disclosure; keep, note |
| M6 | LOW | Cohesion | `<AnimatePresence>` without `initial={false}` (1 of 9) | Entrance plays on first paint | Check intent; add if a default-state element |
| M7 | LOW | Physicality | Radix `Sheet` (`command-deck/ui/sheet.tsx:34`) uses `ease-in-out` and 500 ms open | **Unused in the app** (no import). No action. |

**Opportunities that survive the gate** (frequency → purpose → speed → function):

| # | Location | Today | Purpose | Frequency | Suggested motion |
|---|---|---|---|---|---|
| O1 | Route content swap (`App.tsx` `Suspense` fallback → page) | Page content appears with no bridge; the `RouteFallback` spinner then a hard cut | Preventing a jarring change | Occasional (a navigation, not a keystroke) | `@starting-style` fade + 4 px rise on `main > *`, 180 ms `--ease-out`, opacity + transform only, none under reduced motion |
| O2 | Toast enter / exit (`command-deck/ui/toast.tsx`) | Radix toast keyframes `slide-in-from-top-full` / `slide-out-to-right-full`: enters from one edge, exits another | Spatial consistency | Occasional | Symmetric: enter and exit on the same edge, `translateY(100%)` percentages, 200 ms in / 150 ms out |
| O3 | Recommendation approve / dismiss on the slider | The card vanishes on Approve | Feedback + state indication | Occasional | The existing `SPRING` already drives the swipe; on a button Approve, run the same exit path (translateX + fade) so click and gesture agree |
| O4 | First-run onboarding checklist step change | Step content swaps instantly | Preventing a jarring change, delight budget | Rare | 30 ms stagger over the three step cards, blur 4 px → 0, 220 ms; the one place a longer beat is allowed |

**Rejected candidates** (and the gate that killed each):

- `components/nav/CommandPalette.tsx` open/close. **Keyboard-initiated, 100+/day. Never animate.** (It has none. Correct.)
- Sidebar branch dwell (700 ms + blur arrival). **Already animated; frequency tens/day.** Leave as is; owner-reviewed three times.
- Charts (recharts) entrance draws. **Functional data; decoration hinders.** `isAnimationActive` should stay off where it is off.
- KPI tile hover chart. **Tens/day hover.** Keep the near-instant popover it has.
- Table row hover. **Tens/day.** Colour only, no transform.

### 1.5 Layout, typography, colour, hierarchy (`ui-ux-pro-max` + `make-interfaces-feel-better`)

**What is already right, and stays.** Outfit for headings and Figtree for body, a stepped ramp
(34 / 28 / 24 / 21 / 18 / 15 / 13 / 12 / 11), the 13 px reading floor, `tabular-nums` on 275
sites, `-webkit-font-smoothing: antialiased` at the root, a five-slot categorical palette with
a neutral sixth, a diverging verdict scale and six tonal ramps, `focus-visible` rings
globally, interactive text at 6.4:1 on card, status colours reserved from chart slots, 4/8 px
spacing, no raw hex in components (gated). The generic design-system search for this product
type returned "dark OLED, blue data plus amber highlights, Fira Code headings"; the first two
already hold and the third would replace a documented brand face with a monospace, so it is
rejected on the prompt's own rule (clarity over novelty, keep the palette).

| # | Area | Finding | Evidence | Fix (phase) |
|---|---|---|---|---|
| L1 | Hierarchy | Header row at 1440 carries 5 period chips + vs prior + Summary + Export (+ 2 dev chips), so "Bookster · Ad Performance" wraps to two lines | shot `analysis_performance@1440` | Period chips become one segmented control with a label; Summary/Export move to an overflow under 1280 px (3) |
| L2 | Hierarchy | Login has five CTAs (F3) | shot `login@1440` | One primary (Sign in), one secondary (Request access), one text link (1) |
| L3 | Typography | Withdrawn on a second read: `index.css:205-209` already applies `text-wrap: balance` to every title role including the route title (`.mx-section-header__title`) and `pretty` to body and caption. No change. | `index.css:205-212` | none |
| L4 | Surfaces | 0 of 7 `<img>` carry an outline; creative thumbnails sit on the dark ground with no edge | grep | `outline: 1px solid rgba(255,255,255,0.1)` on media (3) |
| L5 | Radius | 301 `rounded-lg`, 199 `rounded-md`, 120 `rounded-xl`; SectionCard `rounded-xl` with inner tiles also `rounded-xl` at 12 px padding (not concentric) | `shared.tsx:973,597` | Inner tile `rounded-lg` where the card is `rounded-xl` and padding is 8 to 12 px (3) |
| L6 | Colour | Disabled primary on login (`disabled:` opacity) reads as a broken button: the label is under 3:1 on the dim fill | shot `login@1440`; `LoginPage.tsx:295-296` | Disabled at 0.5 opacity of the enabled fill, label kept at ≥ 4.5:1 on that fill (3, 5) |
| L7 | Density | 161 controls between 24 and 40 px (gate NOTE) | `check:interaction` | Acceptable on desktop; the phone drawer and the SegmentedToggle get 36 px (5) |
| L8 | Layout | Report Builder preview is a ~600 px column inside 1440; tables crowd | shot `reports_builder@1440` | Preview grows to the available width, config panel stays 320 (3) |
| L9 | Layout | Action Queue is one ~760 px column of 23 cards at 1440 | shot `act_queue@1440` | Group by action (Stop / Scale / Fix / Validate) with counts; two columns above 1280 px (3) |
| L10 | Copy | 577 em dashes in `.tsx` strings across 156 files (47 in `title=`, 6 in `aria-label`, 194 as the null placeholder `"—"`), 108 more in `.ts` library strings | grep | Prose dashes → commas / periods / colons; the null placeholder → the en dash `–`, which `check:unexplained-dashes` already accepts (line 78) so the gate keeps seeing them (1) |

### 1.6 Accessibility

| # | Finding | Evidence | Fix (phase 5) |
|---|---|---|---|
| A1 | `SegmentedToggle` with `responsiveLabels` hides its label under `sm` and sets no `aria-label`, so at 390 px Audience has 3 and Budget has 4 icon-only buttons with no accessible name | `shared.tsx:1730-1760`; crawl `unlabeled=3 / 4` | `aria-label={label}` and `title={label}` always |
| A2 | Disabled login button contrast (L6) | `LoginPage.tsx:296` | as L6 |
| A3 | Hover-only zoom on media (M1) | `CreativeCard.tsx:330` | gate on `(hover: hover)` |
| A4 | Focus is not moved to `main` on route change (`focus-on-route-change`) | `App.tsx` `Router`, `AppShell.tsx` | `tabIndex={-1}` on `main`, focus on location change, `aria-live` polite announcement of the page title |
| A5 | Keyboard: the sidebar branch, palette, tabs, drawers, tray and the resize handles are keyboard-operable (tests `sidebar-nav`, `sidebar-operability`, `check:accessible-names` pass). No finding. | tests | none |
| A6 | Contrast gates (`text-primary`, `text-muted`, `css-token`, `command-deck`) pass on the token pairs; the one pair not covered by a gate is the disabled fill (A2) | gates | as A2 |
| A7 | Reduced motion: global duration zeroing plus `useReducedMotion` in every framer site. No finding. | `index.css:1175-1180` | none |

### 1.7 Dead weight

| # | Item | Evidence | Action |
|---|---|---|---|
| W1 | `sonner` installed, never imported; toasts run on Radix toast through `command-deck/hooks/use-toast` (25 call sites) | `package.json`, grep | Decide in Phase 2 |
| W2 | `embla-carousel-react`, `react-resizable-panels`, `input-otp`, `react-day-picker`, `vaul`, `next-themes`, `react-icons` in devDependencies | `package.json` | Verify each has an import; drop the ones with none (Phase 2) |
| W3 | Four Exports child pages of one card each (F8) | crawl | Fold into one Exports page with four cards; children stay as anchors (Phase 1) |
| W4 | Listen / Reports hubs that only relay (F8) | crawl | Listen hub carries the alerts it counts; Reports hub becomes the builder (Phase 1) |
| W5 | `pages/MetrixAgent.tsx` "coming soon" placeholder route | `navTree` `placeholder: true` | Keep the row (explains why, per `empty-nav-state`), no change |
| W6 | The dev-only `DataSourceBadge` strings (`SIGNAL_CARDS[] · DATA_CAVEAT`) on hub cards | `DataSourceBadge.tsx:29` (`import.meta.env.PROD` hides) | Nothing to ship; verify with a production build in Phase 6 |

### 1.8 Scope confirmation

The owner asked for autonomy through every stop point ("proceed as instructed as I'm AFK").
The scope taken into Phase 1 is everything in §1.2 to §1.7 marked with a phase, in the
order F1, F2, F3 (copy only), L10, F4 to F9, D1, D2, D6, D7, D8, then the motion rows, then
the accessibility rows. Nothing marked "leave" or "keep" is touched. Backend items are in §8.


---

## 2. Phase 1, information architecture, navigation and copy

### 2.1 The IA, as shipped

The ten sections and their groups stand (they are the product's shape and the owner reviewed
them three times). What changed is where a click lands and how much a page carries:

```
Account
  Account Overview ── next best action · recommendations rail · account totals · run chain
IAP loop (one shape, one set of numerals, everywhere)
  1 Listen ─────────── the high-impact signals themselves (was: a count and a link)
  2 Analysis ───────── command centre → Overview · Ad Performance · IAP Library · DNA · Audience · Placements · Budget · History
  3 Strategy ───────── command centre → Overview · Map · Avatars · Communications · Hypotheses · History
  4 Creative ───────── command centre → Library · Brief Builder · Creative Scan · Import & Export
  5 MST ────────────── command centre → Cross-Map · Sprints · Sprint Asset Check · Direction (soon)
  6 Action ─────────── Action Queue, grouped Retire · Scale · Optimize
Outputs
  Reports ──────────── lands on the Report Builder (was: a relay hub) · Configuration · History
  Exports ──────────── one page, four export cards (was: a hub and four one-card pages)
Workspace
  Settings ─────────── General · Users & Permissions · Security · Integrations · Billing · Data Provenance
```

The run chain on Account Overview (`LoopCommandChain`) now counts the way the sidebar counts:
Analysis 2, Strategy 3, Creative 4; Data (before the loop) and Reports (an output) carry their
icon in the circle, never a numeral the sidebar gives to MST or Action (F1).

**Clicks to the four jobs, after this pass:** connect an account 4 to 5 (unchanged, it is the
dialog's own steps); read a report **3** (was 4); act on a recommendation 1; settings 1 to 2.
No dead end was found in the crawl: every route renders content, every section row navigates,
every hidden route keeps its breadcrumb and Back target.

### 2.2 What changed, file by file

| # | Change | Where |
|---|---|---|
| F1 | One loop shape: loop numerals on the run chain, icons for Data and Reports | `components/loop/LoopCommandChain.tsx` (`stageNumber: number \| null`, `StageIcon`) |
| F2, D7 | The Strategy gate says what it gates: generating a *new* strategy needs a validated run; the imported strategy above stays readable | `pages/metrix/strategy/StrategyCommandCenter.tsx` |
| F3, L2 | Login: one call to action per panel. The hero's "Request Demo Access" and "See More" became one "See how Metrix works"; the sign-up path is the one beside the form; "Create an account" says what it starts (an empty workspace for your own exports; agency accounts are granted by an admin); the disabled Sign in keeps a legible label | `pages/auth/LoginPage.tsx` |
| F4 | One vocabulary: Retire · Scale · Optimize · Validate (the loop's own words). "Stop" and "Kill" and "Fix" are gone | `components/deck/RecommendationSlider.tsx` (`KIND_LABEL`), `pages/metrix/act/ActionQueueView.tsx` (`actionVerb`) |
| F5 | A retire card's link says "Why the playbook retires it" | `lib/data/recommendations.ts` |
| F6 | Engine reason codes become sentences: `humanizeDiagnosis()` leads with the explanation and keeps the code in parentheses; a bare code is spelled out; prose passes through | `lib/normalize.ts` (+ tests) → `lib/data/recommendations.ts` |
| F8, W3 | Exports: the four one-card pages render as four cards on the Exports page; their routes stay for deep links, their sidebar rows are gone (`hidden: true`) | `pages/metrix/exports/ExportsCards.tsx` (new), `ExportsCommandCenter.tsx`, `navigation/navTree.ts` |
| F8, W4 | Reports lands on the builder | `navigation/navTree.ts` (`landing`) |
| F8, W4 | Listen carries its high-impact signals (a `SignalDeck`, three visible) instead of a box counting them | `pages/metrix/listen/ListenCommandCenter.tsx` |
| F9, D2 | A collapsed caveat shows whole sentences while they fit 110 characters, so it says one complete thing and still names the account's terminal metric | `pages/metrix/shared.tsx` (`previewSentences`) |
| D1 | The recommendation tile's reason is on its face (two-line clamp); the reveal keeps the sections and provenance | `components/deck/RecommendationSlider.tsx` |
| L9 | The Action Queue groups by verb with counts, two columns above 1280 px, 1120 px wide | `pages/metrix/act/ActionQueueView.tsx` (`groupByVerb`) |
| L10 | No em dashes in UI copy: 1,076 replacements across 252 client files by rule (placeholder → en dash; label joins → the house " · "; a parenthetical pair → parentheses; a clause join → a new sentence; the rest → a comma). Comments untouched. `splitTitle` still splits imported titles on " — " because imported data may carry it; `deriveLabel`'s clause regex was restored after the sweep touched it | `scratchpad/dedash.py` (rules recorded there), `lib/normalize.ts` |
| F11 | Decision: the section chevron stays. It points where the branch appears (to the right, on dwell or focus), which is the disclosure it promises | `components/layout/Sidebar.tsx` (no change) |
| F7 | Decision: the rail on three command centres stays as the stage's filter of one list (`recommendationsForStage`); the Action Queue is the whole list. Documented, not changed | none |

### 2.3 Copy rules applied (the `design:ux-copy` step)

The `design:ux-copy` skill named in the prompt is not installed in this environment; its
rule was applied by hand to every string this pass touched: **a label names what happens
next.** "See the scaling playbook" on a retire card became "Why the playbook retires it";
"Learn more" became "See how Metrix works"; "Create Account" became "Create an account" with the
consequence under it; "Review in Alerts for details" became the signals themselves; the
strategy gate says what it gates; a reason code says what to do. No string says "Submit".

The em-dash sweep is recorded in the table above; the rule set lives in `dedash.py` and the
seven failures it caused in the suite were all expectation strings that had been converted by
a different rule than the surface (a regex `.` versus a " · "), each aligned to the rendered
copy, plus one test restored from git because it exercises the data path that must keep
splitting on " — ".

---

## 3. Phase 2, library decisions (`pick-ui-library`, `ask-sonner`)

`package.json` was read first; nothing working was replaced.

| Category | Decision | One line |
|---|---|---|
| Toasts | **Sonner** (installed, wrapped in `command-deck/ui/sonner.tsx`, never mounted) | The 25 call sites keep the `toast({ title, description, variant, duration })` API: `command-deck/hooks/use-toast.tsx` now forwards to Sonner (`error` for destructive, 8 s; 4 s otherwise), `App.tsx` mounts one `<Toaster position="bottom-right" closeButton />` at the root, the Radix `toaster.tsx` is deleted, and the 21 tests that mock `useToast` are untouched. Toasts now stack, swipe, pause on hover and enter and exit on the same edge (motion opportunity O2, closed for free). |
| Charts | recharts (installed, 11 files) | Keep; the chart-geometry and chart-palette gates already police it. |
| Tables | Hand-rolled `MetricTable` (sortable, filterable, column picker, nulls last) | Keep; not on the curated list and nothing it lacks is asked for. |
| Command menu | cmdk (installed) | Keep. |
| Drag and drop | framer-motion drag (SwipeDeck, ActionSlider) | Keep; these are gestures, not sortable lists, so dnd kit would be the wrong tool. Reviewed against `apple-design` in §4.2. |
| Virtualization | @tanstack/react-virtual (installed, 2 files) | Keep; the list recommends Virtuoso, but this works and churn was not asked for. Flagged, not changed. |
| Forms | react-hook-form + zod (installed) | Keep. `@hookform/resolvers` had no import and was removed. |
| UI primitives | Radix via command-deck | Keep; the list recommends base-ui, which would be a design-system migration, out of scope. Flagged, not changed. |
| Theme | next-themes | Keep. |
| Styling | clsx + cva + tailwind-merge | Keep. |
| State | React context + small localStorage stores | Keep; zustand is not needed at this size. |
| Removed | `react-icons`, `@hookform/resolvers` | Zero imports in the app or the design system. |
| Left in place | `embla-carousel-react`, `react-resizable-panels`, `input-otp`, `react-day-picker`, `vaul` | Each backs one command-deck scaffold component; removing them is a design-system decision, noted in §8. |

---

## 4. Phase 3, visual and interaction design

### 4.1 The design system, stated (`frontend-design`, `ui-ux-pro-max`)

Nothing here is new; it is the system the product already runs on, written down in one place so
the next pass does not re-derive it. Every value names its source.

| Layer | Definition | Source |
|---|---|---|
| Palette | Electric Blue `--primary` (#155dff), Cyan `--accent` (#16d9ff), Indigo `--mx-blue-600`, Deep Navy `--background`; six tonal ramps (blue, cyan, neutral, success, danger, warning) at 100 to 900 on one perceptual lightness scale; five categorical chart slots plus a neutral sixth; a diverging verdict scale; status colours reserved from chart slots | `index.css` `:root`, `build:mx-ramps`, `chartTokens.ts`, `docs/resources/METRIX_Color_System_Decision.md` |
| Interactive text | `--mx-text-interactive` = blue-400, 6.4:1 on card (the primary fill measures 3.51:1 as text and is never used as text) | `index.css:117-124`, `check:text-primary-contrast` |
| Type | Outfit 700 for H1 to H5 (34 / 28 / 24 / 21 / 18), Figtree for body 15, caption 13 (the reading floor), label 12 uppercase, micro 11; `text-wrap: balance` on every title role and `pretty` on prose; tabular numerals on every figure; antialiased at the root | `index.css:186-232, 791-826`, `typography.ts` |
| Spacing | 4 / 8 px rhythm; card padding 14 to 16; section gap 16 to 20; one content column per command centre (`max-w-5xl`) | `shared.tsx` `SectionCard`, command centres |
| Radius | md 6 for chips and inputs, lg 8 for tiles and buttons, xl 12 for cards, 2xl 16 for the login feature cards and dialogs | usage counts in §1.5 L5 |
| Elevation | `elevation-floating` for popovers, tooltips and dialogs (design-system shadow), `shadow-2xl` for overlays, the Nocturne long rules that fade at the ends instead of the hard 1 px divider | `command-deck/ui/*`, `index.css` edge system |
| Motion tokens | `--mx-ease` cubic-bezier(0.2, 0.8, 0.2, 1) as the one curve, `--mx-fast` 140 ms, `--mx-med` 220 ms, springs 330/30 (default), 240/32 (resize), 460/34 (chrome), icon spring duration 0.3 bounce 0; all zeroed under reduced motion | `index.css:156-158, 1175-1190`, `lib/motion.ts` |
| Component states | default · hover (colour only, gated on hover-capable pointers by Tailwind v4) · focus-visible (2 px ring, global) · active (`.pressable` scale 0.96, `.pressable-lg` 0.99, 150 ms) · disabled (fill at 45 %, label kept at 90 %, no shadow, no pointer events) · loading (spinner in place, label swaps to the present participle) · error (status-danger border and tint, message beside the field) | `index.css:913-918, 937`, `LoginPage.tsx:296`, `GenerateButton` |

What this pass changed in the system itself: one easing curve where there were two (the eight
hand-typed `cubic-bezier(0.2,0,0,1)` sites now read `--mx-ease`), a media edge (`main img`
outline 1 px at 10 % of the foreground token, theme-aware), a legible disabled primary, and a
period control that becomes a native select under `lg`.

The generic design-system recommendation for this product type (dark OLED, blue data with amber
highlights, Fira Code headings) was rejected on the prompt's own rule: two of its three parts
already hold and the third replaces a documented brand face with a monospace for novelty.

### 4.2 Gesture and momentum (`apple-design`)

Reviewed, not changed. `SwipeDeck` tracks 1:1 through framer's pointer capture, decides on
distance **or** velocity (`DRAG_BUFFER` 50 px, `VELOCITY_THRESHOLD` 500 px/s), rubber-bands past
its bounds (`dragElastic`), hands the release velocity to a 330/30 spring (damping ratio ≈ 0.83,
the slight overshoot Apple reserves for a flick), rotates and fades the verdict badges with the
drag, and collapses to instant under reduced motion. `ActionSlider` deliberately has no velocity
arm: a confirm must be travelled, not flicked, which is the asymmetric-timing rule (slow where
deciding, snappy where responding). Both start every animation from the presentation value
(framer springs re-target from the live value), so an interrupted card never jumps.

### 4.3 The prototype step

The `prototype` skill named in the prompt is not installed here. The step was done by hand where
the brief says it belongs, on the one component where more than one direction is genuinely
plausible: the recommendation tile, the surface a reader opens first on every command centre.
Three real renderings of the same data and tokens sit behind a picker on the dev-only Design
Lab (`/design-lab.html`, first panel, `src/design-lab-variants.tsx`):

- **A · Verb first** (shipped): chip, title, number, reason, link.
- **B · Number first**: the figure is the headline, the verb is the eyebrow, the title is the second line.
- **C · Sentence first**: the recommended action is the headline, the evidence sits under it.

The dashboard layout and the onboarding flow were considered for variants and not built: the
dashboard's shape was owner-reviewed three times this month, and onboarding is a checklist by an
owner decision recorded in its header comment. Building alternatives to decisions already taken
would be novelty. §8 lists the pick as an open decision.

### 4.4 Craft pass (`emil-design-eng`, `make-interfaces-feel-better`)

| Before | After | Why |
|---|---|---|
| Thumbnail zoom `duration-500` on hover (`CreativeCard.tsx:330`, `ExpandableMediaCard.tsx:145`) | `duration-200` | A hover seen tens of times a day stays inside the 300 ms budget |
| Funnel bar fill `duration-700` (`FunnelStepsChart.tsx:94`) | `duration-300` | Data the reader is reading should not move for style |
| `ease-[cubic-bezier(0.2,0,0,1)]` at eight sites beside `--mx-ease` | `ease-[var(--mx-ease)]`, `var(--mx-ease)` | One curve; two "the" curves read as two products |
| `<img>` with no edge (7 sites) | `main img { outline: 1px solid hsl(var(--foreground) / 0.1); outline-offset: -1px }` | A consistent edge on media, the ink colour, never a tinted neutral |
| `disabled:opacity-35` on the login primary | `disabled:bg-primary/45 disabled:text-primary-foreground/90 disabled:shadow-none` | The label stays legible; the button reads as waiting, not broken |
| KPI tile label `truncate` at 390 px ("TOTAL SP…") | `sm:truncate max-sm:line-clamp-2` | A label truncated past meaning is not a label |
| Task tray: a 46 px strip beside a 390 px page | Nothing when closed under 1024 px; an overlay drawer when the Topbar's Tray button opens it | The strip took 12 % of a phone's width to show a badge |
| Header: five period chips at every width | A native select under `lg`, the chips above | The title wrapped to two lines under a row of controls on a phone |
| Action Queue: one 860 px column, 23 cards | Grouped by verb with counts, two columns above 1280 px | Nothing to scan by in a 5,000 px scroll |
| Report Builder preview `max-w-6xl` | `max-w-[1400px]` | The report is the deliverable; it gets the width |
| Login `max-w-6xl` hero with two CTAs and two more beside the form | One per panel | One primary action per screen |

Withdrawn on a second look: L5 (concentric radius). With 16 px of card padding around 12 px
corners, any inner radius below the outer reads correctly; the rule bites when padding is
smaller than the outer radius, which no card here has.

---

## 5. Phase 4, motion (`animate`, `animation-vocabulary`)

Only what §1.4 justified was built. Vocabulary: O1 is a *fade-up entrance*; O4 is a *staggered
reveal with a blur mask*; O2 is *symmetric slide* (Sonner's own); O3 is an *exit along the
gesture's path*.

| # | Built | Values | Where |
|---|---|---|---|
| O1 | The page arrives instead of teleporting after the route spinner | `mx-route-in`: opacity 0 → 1, `translateY(4px)` → 0, 180 ms `--mx-ease`, `both`, once per mount on `[data-route-host] > *:first-child`; a query change does not remount so it does not replay; zeroed under reduced motion by the global rule | `index.css`, `AppShell.tsx` |
| O2 | Toasts enter and exit on the same edge, stack, pause on hover | Sonner defaults (bottom-right) | `App.tsx`, `use-toast.tsx` |
| O3 | Not built: the slider's tiles are links, not approve targets; the deck (`SwipeDeck`) already exits along the gesture path. No seam existed | none |
| O4 | The onboarding step cards arrive in sequence | `mx-step-in`: opacity + 6 px rise + blur 4 px → 0, 220 ms `--mx-ease`, children staggered 40 ms (capped at 160 ms), replays per step because each step remounts | `index.css`, `OnboardingWizard.tsx` |

Not added, on purpose: the command palette, the sidebar branch, chart draws, table hovers and
the KPI hover chart (§1.4, rejected candidates). Every new rule animates transform, opacity and
filter only, uses the one curve, and has no `ease-in` anywhere.

---

## 6. Phase 5, accessibility and responsiveness

| # | Finding | Fix | Where |
|---|---|---|---|
| A1 | `SegmentedToggle` icon-only under `sm` had no accessible name (Audience 3, Budget 4 at 390 px) | `aria-label` and `title` on every option, `type="button"` | `shared.tsx` |
| A2 | Disabled login primary under 3:1 | Fill 45 %, label 90 % | `LoginPage.tsx` |
| A3 | Hover zoom ungated | Tailwind v4 gates `hover:` on hover-capable pointers by default; duration cut to 200 ms | `CreativeCard.tsx`, `ExpandableMediaCard.tsx` |
| A4 | Focus stayed on the pressed link after a route change | `main` is `tabIndex={-1}`, named by the page's `h1`, focused (without scrolling) one frame after each navigation, never on first paint | `AppShell.tsx` |
| A5 | Keyboard paths | Verified by the existing suites (`sidebar-nav`, `sidebar-operability`, palette, tab rails, resize handles, `check:accessible-names`). No change needed |  |
| A6 | Token contrast | Four contrast gates pass on the token pairs |  |
| A7 | Reduced motion | Global zeroing plus `useReducedMotion` in every framer site; Sonner is covered by the same global rule |  |
| R1 | Phone: tray strip beside the page | Overlay under 1024 px | `TaskTray.tsx` |
| R2 | Phone: KPI labels truncated | Wrap to two lines under `sm` | `KpiTile.tsx` |
| R3 | Phone: header chips wrap the title | Native select under `lg` | `shared.tsx` |
| R4 | 390 px crawl | 0 horizontal overflow on all 51 routes before and after |  |

No known-issues list is shipped for accessibility. The one measurement that could not be taken
from code, the rendered contrast of the new disabled fill, is taken in §7 from the browser.
