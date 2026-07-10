---
name: Metrix MST / IAP Matrix methodology + surface split
description: What MST means, the IAP Matrix rules, and which surfaces render the matrix vs generated briefs.
---

# MST / IAP Matrix

**MST = "Metrix Sprint Test"** (per the authoritative "Confirmed Understanding" resource) — the
optional scientific testing layer under IAP-ISS (Analysis→Reporting→Strategy→Brief Generation).
Product copy sometimes calls it "Marketing Strategy Template"; the methodology is the same IAP Matrix.

## Matrix rules (what the prompts must encode)
- Concept × Angle grid. **Columns = concepts, one per REAL ICP/avatar** (never a messaging theme).
  Rows = angles; **each row shares EXACTLY ONE angle variable**, everything else varies.
- **Golden rule**: variable isolation requires distribution — every key variable appears in 2+
  cells with different combinations; none appears only once.
- Diagonals only when square ≥3×3: ↘ shares one strategic var; ↙ shares one counterbalance var.
- Canonical global taxonomy: `CN_ FW_ TN_ ST_ AW_ HP_ PR_ HK_` (+ client `CN_ICP_ CN_Design_ CN_CTA_`).
- Cell codes: columns `C1..Cn` (concept order), rows `A,B,C…`, cell = `<Col><Row>` e.g. `C1A`.
- **Honesty**: build at the account's real cardinality. LittleData has exactly 3 ICPs → 3 columns;
  a literal 4×4 would fabricate a 4th avatar/row with no data. Never pad the grid to hit 4×4.
- Newest execution layer (Andromeda Olympic Rings, Dec-2025): broad targeting, ABO, Advantage+
  auto-placements, behavioral > demographic, distinct concepts > near-duplicates, CTR = early signal.

## Two DISTINCT surfaces — do not conflate
**Why:** they come from different tables and a change to one does not affect the other.
- **The matrix grid** (`mst.historical_matrix_4x4`) is built from the `account_modules` row
  `module='mst'` payload (imported from `mst_foundation.json`). Its columns already carry `icp`.
- **The brief builder** (`briefBuilder.draft_briefs`) is built from `imported_creative_briefs`
  (imported OR `source='generated'`). Generated briefs feed `draft_briefs` + their `full_brief`
  detail; they do **NOT** populate the matrix grid.
- **How to apply:** to change how the matrix grid renders, edit the mst module doc / importer;
  to change generated briefs, edit `generationEngine.ts`. Generated briefs must mirror the
  imported `creative_briefs.json` payload shape (brief_metadata / strategic_foundation /
  testing_framework / creative_specifications / copy_architecture) so the existing draft_briefs
  mapping and brief-detail view render them without seed-assembly changes.

## Column↔ICP join — honesty traps (durable)
The matrix grid columns are bridged to strategy ICP profiles via matrix-mode briefs (a brief's
matrix cell code + its target ICP). Two non-obvious ways this silently fabricates or drops links:
- **Gate on real profile ids, never an id-scheme prefix.** Accounts use different ICP id schemes
  (`ICP_BOOK*_*`, `LD-ICP-*`), so any hardcoded prefix check yields zero links for some accounts.
- **Generated cell codes (`C1..Cn`) must line up with the historical grid, not DB fetch order.**
  Postgres row order for `icp_profiles` is unspecified; deriving column numbers from it can attach a
  brief to the wrong grid column (wrong avatar↔ICP link shown). Seed column numbering + ids from the
  grid's own `columns[].{id,icp}` at generation time, and as defense in depth drop any link whose
  target ICP disagrees with the grid column's declared `icp`.
**Why:** both bugs pass typecheck and tests yet surface a factually wrong link in the UI — the exact
dishonesty the product forbids. **How to apply:** whenever you touch generated-brief matrix codes or
the seed-assembly join, re-check against the grid, not against an id prefix or row order.
