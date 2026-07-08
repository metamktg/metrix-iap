# Bookster Metrix IAP — Data & Intelligence Handoff

Generated from the full IAP loop run on Bookster BOOK0 (app-install MST) and BOOK2 (lead/quiz)
data, window 2026-05-02 to 2026-07-07.

## Files (in IAP phase order)

1. **normalized_data_bundle.json** — Bundle Prep output. Ad/copy-level, demographic, placement,
   platform, device, and concept-level performance, each row carrying its own `date_start`/
   `date_end` window plus a top-level `metadata.campaign_date_windows` array. Quality flags and
   anomalies are listed in `metadata`.

2. **campaign_intelligence.json** — Analysis Core output. Concept-level performance tiers,
   buying-intent scores, traffic-quality classification per ad, documented failure patterns
   (including the 3 zero-conversion campaigns), and the winning variable stack.

3. **strategic_map.json** — Strategy Map output. ICP profiles, message pillars, variable
   combinations, 4 prioritized testing hypotheses, and the scaling playbook (scale/optimize/
   validate/avoid).

4. **creative_briefs.json** — Brief Builder output. 4 execution-ready briefs (3 matrix-mode
   for BOOK0, 1 general-mode for BOOK2), following the MST naming convention
   `{MatrixPosition}_{ConceptCodes}_{AngleCodes}_{UniqueID}`.

## Known gaps carried into these files (not resolved, flagged intentionally)

- BOOK0 concepts **C5** (partial), **C6**, **C7** are live in the account but not defined in the
  Bookster Local Client Library's CONCEPTS / MST_4x4_MATRIX tabs. They are present in the bundle
  and intelligence files as position-only data (`mapped_in_library: false`), with no invented
  variable-stack meaning. Confirm these with Alex before treating them as validated MST cells.
- Three campaigns show spend with zero terminal conversions (BOOK0 iOS MST V1, BOOK2 Quiz V1,
  BOOK2 Quiz V3). These are labeled `validation_required`, not failures — confirm MMP/pixel
  postback health before acting on them.
- No `local_client_library.json` is included in this handoff — the two Local Client Library
  source files (xlsx + the Book2 augmented JSON) remain the canonical source; this run only
  reads from them, it does not rewrite them.

## Schema note

These four files follow the current Metrix IAP skill I/O schemas (`io-schema.json` in each
skill's `references/` folder), not a literal Supabase DDL dump — the pnpm monorepo schema
migrations were not available in this workspace to confirm exact column names. If the Replit/
Supabase ingestion needs specific column names, reconcile against the actual migration files
before writing the importer.
