---
name: library_cells multi-entry per cell_id
description: local_book2_library stores one row per aspect ratio variant (Feed/Square/Story) for each cell, not one row per cell. Iterating it without deduplication produces duplicate React keys and other bugs.
---

## Rule
`mst.local_book2_library` (and the Supabase `library_cells` table) has **multiple rows per `cell_id`** — one per uploaded creative variant (Feed, Square, Story formats). A single cell like C2E can have 4 entries.

**Why:** The manual import pipeline stages each creative file as a separate `library_cells` row, so the table is a creative-file registry, not a cell registry.

## How to apply
- Never use `cell_id` as a React key when iterating `local_book2_library` directly — deduplicate first.
- `groupByConceptFamily` (concept-grouping.ts) already builds a `libMap` via `Map.set(cell_id, ...)` which correctly keeps the last entry per cell. OK.
- `libraryCellById` uses `.find()` which returns the first match. OK for canonical copy lookup.
- `textVariants` in `variable-drilldown.ts` iterates ALL library cells for a variable code — was producing duplicate cellId entries. Fixed: deduplicate by cellId after mapping.
- When adding new code that maps over `local_book2_library` and renders with a cell-based key, always apply a `seen Set<string>` deduplication guard first.
