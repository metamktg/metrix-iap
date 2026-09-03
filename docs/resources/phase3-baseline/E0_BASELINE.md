# E0 — Phase 3 alignment & regression baseline

**Prerequisite epic. Nothing was changed.** This records the state of the app at
the commit below so every later epic can be diffed against it rather than
described against it.

Source of truth for the epic sequence: `docs/resources/PHASE3_MASTER_PLAN_extract.txt`
(Command Deck makeover master plan, §03 roadmap E0 → E8).

## Commit

Captured at `835ce9d` — `main` after PR #194 (autonomous passes 2–7) and PR #195
(its ship record).

## §00 binding invariants — validated BEFORE the epic

The plan's rule: *"a Phase 3 change that breaks one is a regression, not a
redesign."* Each is re-validated at every epic boundary.

| | Invariant | State at E0 | How it was checked |
|---|---|---|---|
| I1 | Honesty pattern — UI never fabricates | Holds | `check:friction` defect classes at 0; the honest empty states are the baseline corpus's own content |
| I2 | Cohort-awareness — no ROAS/purchase hardcoding | Holds | `check:cohort-reach` PASS |
| I3 | Locked IA — `navTree.ts` is the single source | Holds | corpus enumerated FROM `navTree.ts` + `App.tsx`; 51 routes, all render |
| I4 | Disclosure rulebook — counts may only go down | Holds | `check:disclosure-rulebook` PASS; baseline tracks 2 files / 4 violations |
| I5 | A11y floor | Holds | `check:accessible-names`, `check:interaction` PASS; reduced-motion, focus rings and tabular numerals measured in-browser 2026-09-03 |
| I6 | Execute-on-command — the loop never auto-runs | Holds | no ingestion path triggers a run; runs remain manual per `replit.md` |
| I7 | Test suite is a contract | Holds, grown | 2,535 client (208 files) + 121 scripts. The plan's "704 + 209 + 55" is the Phase 1–5 figure; the contract is *green at every boundary*, not a fixed count |

## Gates — all green at E0

Static (11): `disclosure-rulebook` · `interaction` · `locator-ambiguity` ·
`unused-exports` · `token-colors` · `type-scale` · `optical-authority` ·
`stray-shell-output` · `cohort-reach` · `chart-palette` · `payload-legibility`.

Browser-backed (4, need a dev server): `friction` (204 visits, 0 defects) ·
`accessible-names` · `chart-geometry` (9 chart surfaces, 25 marks, 8 routes) ·
`unexplained-dashes` (684 visible dashes, every one resolvable).

`pnpm run typecheck` clean across all packages.

## The corpus

`phase3-baseline/{desktop,tablet,mobile}/<route-slug>.png` — **153 shots**:
51 routes × 3 viewports (1440 · 768 · 375). `manifest.json` records every shot
with its route, viewport, load result and any console errors. **0 routes had a
load or console error at any viewport.**

Routes are enumerated from `navTree.ts` and `App.tsx` with legacy redirect
sources excluded, the same rule `check:friction` uses — a redirect would file its
shot against the target page and count it twice.

The account state is a **manual-upload account**, which is what a new user is:
`analysis.status: "none"` with `validated: true` (surfaces verified account-wide,
no manual run on record), `strategy.status: "none"`, 16 briefs, MST unlocked.
That state is deliberate — it exercises the gates an importer account actually
meets, not the fully-run state a demo shows.

375px is in the corpus because E2's acceptance criterion names it directly
("375px overlay works").

## Open work, triaged into epics

The plan calls for "BUG_TRACKER.md overlaps folded in". **There is no
`BUG_TRACKER.md` in this repo** — the open items live in
`CARRY_FORWARD_REGISTER.md`, `METRIX_UI_LIFT_MASTER_PLAN_2026-09.md` and
`METRIX_UI_REFACE_REGISTER_2026-08.md`. Triaged from those, each verdict
established by opening the file it names:

| Item | Epic | Note |
|---|---|---|
| **C6** — two placeholder vocabularies, 187 `"—"` / 31 `"n/a"` | **E1** | A mechanical call-site sweep, the same shape as E1's alpha-tint sweep, so it rides the same pass. Was 171/28 before passes 2–7; 16 dashes and 3 `n/a` were added by those passes and are ours to clear |
| **`check:friction` baseline** — one route now below its recorded count | **E1** | Housekeeping: re-run with `--write-baseline` to lock the gain before E1 moves anything |
| **Panel MOTION at 31%** vs a ≥60% exit criterion | **owner decision, then E8** | Closeout §3.3 records it as a deliberate revision needing an owner to agree. Until then it is an open criterion, not a miss |
| **S2** — `platform_performance` delivery-basis rows written every run, only the `'conversion'` subset read | **E7** | Seed coverage closure: surface or disposition with a reason |
| **F-b** — `ad_performance.reach` / `clicks_all` written, then dropped at the seed boundary (`AdRecord.performance` carries neither) | **E7** | Same |
| **F-a** — `ad_creative_metadata` unread | **closed** | Now read by `creativeComponents.ts`, `metrixSeedAssembly.ts` and `CreativeLibraryView.tsx`. The register's "still no reader" line is stale |
| **S3** — `ad_performance.confidence` never written (`buildAdPerformanceRows` omits it) | **outside E0–E8** | A writer gap, not a surfacing gap. E7 can only disposition it |
| **F-e** — no producer for `optimization_loop` / `recommendation_cards` | **outside E0–E8** | Closeout §3.1: *"no amount of UI work closes it… this needs a producer stage."* A backend track of its own. See the note below |
| **Objective determination** — by concentration of optimization events, correlated not weighted | **outside E0–E8** | A cohort-layer spec change. `inferObjectives()` counts ads (`adsCount / classifiedAds >= 0.1`); neither the cohort doc nor the Blueprint states a determination rule at all, so the rule needs writing before any code moves |

### One thing the owner should decide before E3

Pass 2 added a **client-side derivation** for recommendations
(`lib/data/recommendations.ts`), so six surfaces that rendered "No actions yet"
now render real, sourced tiles. Closeout §3.1 is explicit that UI work does not
close F-e — and it doesn't: nothing writes `optimization_loop`. The risk is that
the derivation now **masks the signal that the producer is missing**. Three ways
out, owner's call: keep it as-is; keep it behind an explicit "derived — no
producer yet" state so the gap stays visible; or revert it until the producer
lands. E3 restyles the overviews that carry these cards, so the decision wants
making before then.
