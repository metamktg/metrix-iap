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
