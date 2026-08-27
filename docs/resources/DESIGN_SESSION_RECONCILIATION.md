# Reconciliation note — design-tool session vs. the real handoff bundle

**Read this before using anything else this design session produced.** Everything in
this `handoff/` folder except this file is the repo owner's real, canonical Phase 1→3
record (copied verbatim from the uploaded bundle — unedited). This file exists to tell
the new Claude Code session which parts of the *separate* design-exploration session
(`PHASE3_MASTER_PLAN.md`, `Phase 3 Master Plan.dc.html`, `github.md` at the project
root) still hold up against that real record, and which don't.

## Sequencing — do not skip ahead

1. **Phase 2 enabler sprint first**, exactly as `KICKOFF_PROMPT.md` specifies: E1
   (structured signals) → E2 (KPI context) → E3 (status-semantics normalization) → E4
   (account display names) → E5 (route split). This is backend/contract work in
   `metamktg/metrix-iap`. Do NOT start the Phase 3 visual pass in that session.
2. **Phase 3 information-hierarchy pass second**, against
   `METRIX_Phase3_Design_Brief_202608.md` — a *separate* Claude Code session, once E1–E4
   are merged and verified live.

## What the design session got right (still useful for step 2)

- **Seed JSON coverage register** (in `PHASE3_MASTER_PLAN.md` §4 / the `.dc.html` §04):
  built independently from reading `seedTypes.ts` directly, and it corroborates the
  real work order rather than contradicting it. Concretely:
  - The register's "SignalCard structured contract" gap = exactly **E1**.
  - "result_totals_by_event" / no per-metric comparison series = exactly **E2**.
  - Multiple status vocabularies (impact/confidence/priority) = exactly **E3**.
  - "Fresh Import 1786839868960"-style names surfacing in titles = exactly **E4**.
  Treat this register as extra ammunition for E1–E4's acceptance checks — it names the
  specific seed fields each contract needs to carry — not as separate scope.
- The **Universal Data Module** idea (one shared view-switcher + metric × variable ×
  segment breakdown control instead of a bespoke chart per page) is directionally
  aligned with brief mandate **§9** ("data-rich views need more visualization, less
  prose — mini trends, deltas, contribution bars, sparklines"). Keep the *concept*;
  drop the *execution* (see below).

## What the design session got wrong — the real brief overrides it

The design session was built from reading the repo cold, without this bundle. Where
they conflict, **`METRIX_Phase3_Design_Brief_202608.md` wins, unconditionally**:

- **No shell rethink.** The design session's "Command Deck" — a new 5-zone shell,
  icon-rail + context-column navigation, a persistent Loop Spine, a Signal Tray — is
  **not what the brief asks for**. The brief's "what should remain" is explicit: *dark
  navy foundation, restrained cyan/purple accents, compact left navigation,
  low-radius rectangular language, subtle borders, current spacing rhythm*. This is a
  compression pass on the existing shell, not a new one.
- **Subtractive, not additive.** The brief's central mandate is "show less intelligence
  by default, while making the intelligence feel deeper" and "reduce visible text
  ~30–50%." The design session's later iterations went the opposite direction —
  bigger hero text, brighter everything, MORE cards, a 4-tile chart gallery. None of
  that ships as-is. The real Phase 3 pass removes elements and defers detail to
  disclosure (`DetailReveal`, drawers), it doesn't add decorative surface area.
- **No "kill list" of dashboard clichés.** The design session's differentiation
  framing (gauges, rainbow KPI grids, glossy mockups) doesn't appear anywhere in the
  real brief and isn't the actual problem — the brief diagnoses "component democracy"
  and flat hierarchy, not genre-cliché decoration. Drop that framing entirely.
- **No new v3 token system.** The brief explicitly keeps the current visual language
  (dark navy, existing accent hues, existing radius, existing spacing scale). The
  design session's OKLCH ramp / retint proposal is not mandated — `typography.ts` and
  the existing token set stay as the foundation the compression pass tightens
  (per the brief's §11 "reduce typography vocabulary" and the enabler sprint's note
  that the disclosure-rulebook CI gate is how §11 gets executed).
- **Status semantics:** the design session invented its own priority/confidence
  color-pill treatment. The real contract is **E3** (`lib/statusSemantics.ts`,
  three axes: Priority/Confidence/Workflow, raw values demoted to diagnostic layer) —
  build the Phase 3 UI on that contract once it exists, not on an independently
  designed scheme.

## Net effect

Use the design session's seed-coverage register as a cross-check on E1–E4's field-level
completeness. Discard its shell, token, and "more visualization" execution — the brief
and the enabler sprint's contracts are the sole spec for what Phase 3 actually builds.
