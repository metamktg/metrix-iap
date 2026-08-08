---
name: Cell-scoped creative upload validation
description: How direct "upload to this specific tile" creative uploads are classified/filed differently from the freeform deconstruction pipeline.
---

Metrix IAP has two distinct creative-classification entry points that must stay separate:

1. **Freeform deconstruction** (`deconstructionEngine.ts` `alignCellId`/`generateValidated`/`commitReplacement`): the model picks (or creates) the target cell. Used by manual-import backfill and the Creative Scan pipeline.
2. **Cell-scoped upload validation** (`classifyCellCreative`/`fileCellCreativeOverride` in the same file): the user already clicked a specific "No asset" tile, so the target `cellId` is fixed — the model only reports what the creative shows, and that's compared against the cell's *existing* `library_cells` DNA (if any). Never let this path re-pick a cell.

**Why:** conflating the two lets a mis-classified upload silently overwrite a cell's identity, since deconstruction's job is literally to choose/reassign cells.

**How to apply:** when adding any new upload/classification surface, ask first whether the target cell is already known (cell-scoped, compare-and-gate) or must be discovered (freeform, alignCellId). A cell-scoped flow should return "mismatch" (require explicit override) rather than "misfiled to a different cell" when detected variables disagree with the recorded DNA.

Match/mismatch gate mirrors deconstruction's `CONFIDENCE_GATE = 0.8`: matched requires the gate to clear AND every expected family's code to be reproduced with no conflicting code — otherwise mismatch, which the API returns as a 409 with validation details (no write) until the client resubmits with `override: true`.

`library_cells.payload` (jsonb) is the real source of truth clients read (seed's `local_book2_library` is literally `libraryCells.map(r => r.payload)`) — any write path that updates DNA fields must update *both* the top-level columns (`asset_filename`, `qa_mapping_status`, `mapping_confidence`) and the corresponding keys inside `payload`, or the client won't see the change.

Recorded DNA fields are frequently **composite** — one family can legitimately hold multiple registry codes joined together — while the classifier reports a single code per family per upload. Comparisons must be membership-based (does the detected code belong to the recorded set for that family?), not string equality against the whole field; equality-based comparison makes every multi-code family permanently unmatchable and, on override, silently drops the other recorded codes. A matched family should leave a multi-code field untouched; only a genuinely new or conflicting detection should replace it.

When wiring a new variable family into a cell-scoped comparison, remember it needs three things kept in lockstep: (1) the read path that derives "expected" DNA from the recorded cell, (2) the write path that persists a confirmed detection, and (3) any denormalized top-level column that mirrors a value also stored in the DNA blob (some fields are read from their own column elsewhere in the data layer, not from the blob) — adding a family to only one of the three silently breaks the others.
