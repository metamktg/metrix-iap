---
name: Cell-scoped creative upload validation
description: How direct "upload to this specific tile" creative uploads are classified/filed differently from the freeform deconstruction pipeline.
---

Metrix IAP has two distinct creative-classification entry points that must stay separate:

1. **Freeform deconstruction**: the model picks (or creates) the target cell. Used by manual-import backfill and the Creative Scan pipeline.
2. **Cell-scoped upload validation**: the user already clicked a specific "No asset" tile, so the target cell is fixed — the model only reports what the creative shows, and that's compared against the cell's *existing* recorded DNA (if any). Never let this path re-pick a cell.

**Why:** conflating the two lets a mis-classified upload silently overwrite a cell's identity, since deconstruction's job is literally to choose/reassign cells.

**How to apply:** when adding any new upload/classification surface, ask first whether the target cell is already known (cell-scoped, compare-and-gate) or must be discovered (freeform). A cell-scoped flow should return "mismatch" (require explicit override) rather than "misfiled to a different cell" when detected variables disagree with the recorded DNA.

Recorded DNA fields are frequently **composite** — one family can legitimately hold multiple registry codes joined together — while the classifier reports a single code per family per upload. Comparisons must be membership-based (does the detected code belong to the recorded set for that family?), not string equality against the whole field; equality-based comparison makes every multi-code family permanently unmatchable and, on override, silently drops the other recorded codes. A matched family should leave a multi-code field untouched; only a genuinely new or conflicting detection should replace it.

When wiring a new variable family into a cell-scoped comparison, remember it needs three things kept in lockstep: (1) the read path that derives "expected" DNA from the recorded cell, (2) the write path that persists a confirmed detection, and (3) any denormalized top-level column that mirrors a value also stored in the DNA blob (some fields are read from their own column elsewhere in the data layer, not from the blob) — adding a family to only one of the three silently breaks the others.
