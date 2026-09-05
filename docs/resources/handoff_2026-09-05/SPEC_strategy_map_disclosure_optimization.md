# Spec: Strategy Map — Disclosure Pattern Optimization

**Status:** Draft — ready for Claude Code implementation planning
**Origin:** Live code audit, Aug 31 2026 (pulled `metamktg/metrix-iap` @ `main` via GitHub, not inferred from screenshots)
**Touches:** `artifacts/metrix-iap/src/pages/metrix/strategy/StrategyMapView.tsx`, `strategyShared.tsx`, `shared.tsx` (DetailReveal primitive — read, not modified)

---

## 1. This is not a bug — it's a misapplied rule

`shared.tsx` documents an explicit, intentional platform-wide convention:

> "FIRST-LAYER RULE: no full sentences on the primary dashboard layer. Cards/lists show concise, high-impact labels only; sentence prose moves behind `<DetailReveal>` — a click/tap/keyboard popover with an always-visible info affordance."

This is a good rule for dense list/dashboard surfaces where scan-ability matters more than completeness. It is enforced consistently. The problem is that the Strategy Map applies the *same* rule to a page whose own subtitle is "Select a pillar to explore its source cells and hypotheses" — a page whose entire job is to communicate the strategic argument, not help someone scan past it.

**This spec proposes a scoped exception for the selected-pillar detail view, not a change to the platform-wide rule.** List rows stay compact exactly as they are.

---

## 2. Current click depth (traced from source, not inferred)

For a single selected pillar, reaching the full strategic case requires:

| Step | Location | What's gated |
|---|---|---|
| 1 | `StrategyMapView.tsx:151-155` | Pillar list row shows an 80-char truncated `plain_descriptor` snippet, only when selected |
| 2 | `StrategyMapView.tsx:668-686` | Click the descriptor's info icon → `DetailReveal` popover reveals full `plain_descriptor` **and** `why_it_matters` — this is where the CPA figures, the named-treatment evidence, and the copy-framework rationale live |
| 3 | `StrategyMapView.tsx:637-666` | Separate click on "Execution detail" to expand an accordion |
| 4 | `strategyShared.tsx:367-400` (`PillarDetailSections`) | Inside that accordion, up to 4 cards (Funnel application, Execution specs, Placement strategy, Scaling guidance) — **each individually** truncated via `deriveLabel(pillar[key], 72)` and gated behind its own separate info-icon popover |

Worst case: **6 separate click-to-reveal interactions** to see one pillar's complete argument. None of that content survives a screenshot, which matters given this platform's own deliverables (client reports, the pitch deck) are built from screenshots/exports of exactly this kind of page.

---

## 3. Proposed changes

### 3.1 Promote descriptor + rationale to always-visible prose (selected pillar only)

**File:** `StrategyMapView.tsx`, replacing the `DetailReveal`-wrapped descriptor block at lines 668-686.

- Once a pillar is selected, its `plain_descriptor` should render as visible `TYPE.body` prose directly under the pillar header — not an 80-char truncation, not popover-gated.
- `why_it_matters` (the evidence/rationale field — this is literally the paragraph with the CPA numbers) should render immediately beneath it as visible prose, same treatment.
- Rationale: this is a single already-selected pillar, not a scanned list — the "no full sentences on first layer" rule exists to protect list scan-ability, and there is no list here anymore once a pillar is selected. The click to select the pillar *is* the first-layer interaction; what follows is already second-layer.

### 3.2 Reduce execution-detail nesting from two clicks to one

**File:** `strategyShared.tsx`, `PillarDetailSections` (lines 367-400).

- Currently: expand "Execution detail" (click 1) → each of 4 cards still requires its own click (click 2+) to read.
- Proposed: once "Execution detail" is expanded, show each card's content directly with a `line-clamp-3` (or similar — enough to convey substance, not just a label fragment) instead of `deriveLabel(..., 72)` + a second popover. Reserve `DetailReveal` inside these cards only for fields that are genuinely long-form (multi-paragraph), which can be assessed per-field once real content length is checked against real pillar data.
- Rationale: a user who already clicked "Execution detail" has explicitly asked to see more — making them click again per card, four more times, to get the thing they just asked for is redundant friction, not intentional progressive disclosure.

### 3.3 What stays as-is

- The pillar **list** rows (left column) keep their current compact treatment — label + 2-line clamp descriptor snippet on selection. This is the correct place for the platform-wide rule; don't touch it.
- `InfoTooltip` usage for metric/methodology definitions (e.g. `StrategyMapView.tsx:414, 423` — "Validated variable stacks with their real CPA / CVR reads...") is a different, correctly-scoped pattern (explaining a UI element, not hiding page content) and is out of scope for this change.
- The `DetailReveal` primitive itself is not being modified — this spec changes *which content* uses it on this one page, not how the component works.

---

## 4. Why this is scoped, not a rulebook change

- No change to `shared.tsx` or the `DetailReveal`/`deriveLabel` primitives.
- No change to the `check-disclosure-rulebook.ts` enforcement (that script only checks for raw-pixel `text-[Npx]` classes vs. the `TYPE` scale — it does not enforce the click-to-reveal pattern itself, so this change doesn't need a baseline update or a lint exception).
- Every other page using `DetailReveal`/`deriveLabel` (hypothesis cards, playbook lanes, normalized refs) is untouched.

---

## 5. Open items before build

1. Confirm with Alex whether `funnel_application` / `execution_specifications` / `placement_strategy` / `scaling_guidance` field lengths in real pillar data are short enough for a 3-line clamp to convey full substance, or whether some genuinely need the popover (mixed treatment per-field, decided from real content, not guessed).
2. Confirm whether the Hypothesis cards in the right rail (`Open →` button, lines 396-424) have the same "sell the value inline" problem — this audit focused on the pillar/descriptor/execution-detail flow specifically, not the hypothesis queue.
3. Visual QA once implemented: promoting full prose to always-visible on a selected pillar will increase the middle column's vertical height — confirm this doesn't push the right-column hypothesis panel or Execution-detail toggle below an awkward fold on smaller viewports.
