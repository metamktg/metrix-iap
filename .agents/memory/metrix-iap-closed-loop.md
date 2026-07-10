---
name: Metrix IAP closed-loop linkage
description: How cross-entity back-references (Ad/Concept/Brief) are wired in the mocked data layer
---

# Metrix IAP closed-loop back-references

Cross-entity back-references (`Ad.creative_concept_id`, `CreativeConcept.related_ads`,
`CreativeConcept.related_briefs`) are populated **at generation time** by a
`linkClosedLoop()` IIFE in `src/lib/mock/generate.ts`, placed after the `BRIEFS`
declaration. It mutates the already-built `CREATIVE_CONCEPTS` and `ADS` arrays on
module load, before any component renders.

**Why:** These fields ship empty from the individual entity factories. UI pages
(RunDetail downstream outputs, BriefDetail library registration, CreativeLibrary
AngleRow backlinks) read them directly, so they must be filled once, centrally,
rather than recomputed per-render or left empty.

**How to apply:** When adding a new entity relationship that the UI surfaces, extend
`linkClosedLoop()` rather than filtering/joining ad-hoc in components. Keep linkage
deterministic and workspace-scoped (only Bookster/ws_bookster is fully populated;
other workspaces show Onboarding).

## Real (Supabase) Strategy Map: explicit pillar↔hypothesis links only

Hypothesis→pillar linkage in the real seed path is an explicit `pillar_id` (nullable
column on `testing_hypotheses`), carried end-to-end: source JSON / importer → seed
assembly → `ActiveHypothesis.pillar_id` → `StrategyMapView`. The generation engine
maps the model's 1-based `pillar_index` to the assigned `GEN_PILLAR_..._n` id.

**Why:** the old `StrategyMapView.hypothesesFor()` inferred the link by substring-matching
hypothesis `source`/`control_ref` text against pillar ids + cell ids. That mislinked —
e.g. a hypothesis whose control text mentioned cells from two pillars showed under both.

**How to apply:** never re-introduce text inference for cross-entity links here. Absent/
out-of-range refs stay unlinked (render under "Other active hypotheses"); never guess a
link. Imported source JSON only gets a `pillar_id` when the single intended pillar is
unambiguous from the data.
