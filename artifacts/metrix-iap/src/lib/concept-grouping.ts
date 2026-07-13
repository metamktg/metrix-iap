// ─── Concept family grouping and KPI blending ─────────────────────────
// Pure computation layer for the Library "Group by concept" view.
// Cells filtered by the MetricSelectionBar are passed in; grouping and
// blending never invent data — only cells with real performance rows
// contribute to the aggregates.
//
// Blending rules (match task spec):
//   Volume metrics (spend, results, impressions, link clicks) → simple sum
//   Rate metrics (CPA, CTR) → spend-weighted from the summed volumes

import type { CellPerformanceRow, MST, MSTLibraryCell } from "@/lib/data/seedTypes";

// ─── Blended KPI ──────────────────────────────────────────────────────

export interface BlendedKPI {
  spend: number;
  results: number;
  impressions: number;
  linkClicks: number;
  /** spend ÷ results; null when results = 0. */
  cpa: number | null;
  /** link clicks ÷ impressions × 100; null when impressions = 0. */
  ctrPct: number | null;
  /** Number of distinct cell_ids represented. */
  cellCount: number;
}

/**
 * Blend a list of CellPerformanceRow slices into a single KPI summary.
 * Rows for multiple result-types on the same cell are all included (the
 * caller metric-filters before passing in, consistent with the rest of
 * the Library).
 *
 * Blending rules (task spec):
 *   Volume metrics (spend, results, impressions, link_clicks) → simple sum
 *   Rate metrics (CPA, CTR) → spend-weighted average across cells
 *     CPA_blended = Σ(spend_i × cpa_i) / Σ(spend_i)   for cells with results
 *     CTR_blended = Σ(spend_i × ctr_i) / Σ(spend_i)    for cells with impressions
 *
 * Rows are first aggregated per cell_id before weighting so that cells
 * with multiple result-type rows are treated as one unit (not counted
 * multiple times in the weighted mean).
 */
export function blendCells(rows: CellPerformanceRow[]): BlendedKPI {
  // ── Volume sums (across all rows) ─────────────────────────────────────
  const spend = rows.reduce((s, r) => s + r["Amount spent (USD)"], 0);
  const results = rows.reduce((s, r) => s + r.Results, 0);
  const impressions = rows.reduce((s, r) => s + r.Impressions, 0);
  const linkClicks = rows.reduce((s, r) => s + r["Link clicks"], 0);
  const cellCount = new Set(rows.map((r) => r.cell_id)).size;

  // ── Per-cell aggregation for spend-weighted rate means ────────────────
  const cellMap = new Map<string, { spend: number; results: number; impressions: number; linkClicks: number }>();
  for (const r of rows) {
    const prev = cellMap.get(r.cell_id);
    if (prev) {
      prev.spend += r["Amount spent (USD)"];
      prev.results += r.Results;
      prev.impressions += r.Impressions;
      prev.linkClicks += r["Link clicks"];
    } else {
      cellMap.set(r.cell_id, {
        spend: r["Amount spent (USD)"],
        results: r.Results,
        impressions: r.Impressions,
        linkClicks: r["Link clicks"],
      });
    }
  }

  let cpaWeightedSum = 0;
  let cpaWeightTotal = 0;
  let ctrWeightedSum = 0;
  let ctrWeightTotal = 0;

  for (const cell of cellMap.values()) {
    if (cell.results > 0 && cell.spend > 0) {
      const cellCpa = cell.spend / cell.results;
      cpaWeightedSum += cell.spend * cellCpa;
      cpaWeightTotal += cell.spend;
    }
    if (cell.impressions > 0 && cell.spend > 0) {
      const cellCtr = (cell.linkClicks / cell.impressions) * 100;
      ctrWeightedSum += cell.spend * cellCtr;
      ctrWeightTotal += cell.spend;
    }
  }

  return {
    spend,
    results,
    impressions,
    linkClicks,
    cpa: cpaWeightTotal > 0 ? cpaWeightedSum / cpaWeightTotal : null,
    ctrPct: ctrWeightTotal > 0 ? ctrWeightedSum / ctrWeightTotal : null,
    cellCount,
  };
}

// ─── Grouping structures ───────────────────────────────────────────────

export interface AngleGroup {
  /** Row letter extracted from cell_id, e.g. "A", "B", "C". */
  angleKey: string;
  /** Human-readable label: MST row shared_variable, or "Angle <key>" fallback. */
  angleLabel: string;
  blended: BlendedKPI;
  /**
   * Deduplicated representative rows (one per cell_id) — used for card
   * rendering. The full multi-result-type rows used for blending are in
   * `allRows`.
   */
  cells: CellPerformanceRow[];
  /** All metric-filtered rows (may have >1 per cell_id for multiple result types). */
  allRows: CellPerformanceRow[];
}

export interface ConceptFamilyGroup {
  conceptId: string;
  conceptName: string;
  blended: BlendedKPI;
  angles: AngleGroup[];
  /** All metric-filtered rows for this concept (across all angles). */
  allRows: CellPerformanceRow[];
}

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Extract the angle key (trailing uppercase letter(s)) from a cell code
 * following the canonical MST scheme "C<col><row>", e.g. "C2E" → "E".
 * Falls back to the full cell_id when the pattern doesn't match.
 */
export function angleKeyFromCellId(cellId: string): string {
  const m = /^C\d+([A-Z]+)$/i.exec(cellId.trim());
  return m ? m[1].toUpperCase() : cellId;
}

function deduplicateCells(rows: CellPerformanceRow[]): CellPerformanceRow[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (seen.has(r.cell_id)) return false;
    seen.add(r.cell_id);
    return true;
  });
}

// ─── Main grouping function ────────────────────────────────────────────

/**
 * Group metric-filtered `CellPerformanceRow`s into concept families with
 * angle sub-groups. Concept identity comes from `MSTLibraryCell.concept_id`
 * when a library entry exists; falls back to `book2_concept_name` from the
 * performance row. Angle identity is the trailing letter of the cell code.
 *
 * Results sorted by descending blended spend at both the concept and angle
 * level so the highest-value family/angle floats to the top.
 */
export function groupByConceptFamily(
  cells: CellPerformanceRow[],
  mst: MST | null | undefined
): ConceptFamilyGroup[] {
  // Build library cell lookup
  const libMap = new Map<string, MSTLibraryCell>();
  for (const cell of mst?.local_book2_library ?? []) {
    libMap.set(cell.cell_id, cell);
  }

  // Build angle-key → label map from MST matrix rows
  const rowLabelMap = new Map<string, string>();
  for (const row of mst?.historical_matrix_4x4?.rows ?? []) {
    rowLabelMap.set(row.id.toUpperCase(), row.shared);
  }
  for (const matCell of mst?.historical_matrix_4x4?.cells ?? []) {
    const key = matCell.row_id?.toUpperCase();
    if (key && matCell.row_shared_variable && !rowLabelMap.has(key)) {
      rowLabelMap.set(key, matCell.row_shared_variable);
    }
  }

  // Group rows by concept
  const byConcept = new Map<string, { conceptName: string; rows: CellPerformanceRow[] }>();

  for (const row of cells) {
    const lib = libMap.get(row.cell_id);
    const conceptId = lib?.concept_id ?? row.book2_concept_name ?? row.cell_id;
    const conceptName = lib?.book2_concept_name ?? row.book2_concept_name ?? row.cell_id;

    const entry = byConcept.get(conceptId);
    if (entry) {
      entry.rows.push(row);
    } else {
      byConcept.set(conceptId, { conceptName, rows: [row] });
    }
  }

  const result: ConceptFamilyGroup[] = [];

  for (const [conceptId, { conceptName, rows }] of byConcept) {
    // Group rows by angle within concept
    const byAngle = new Map<string, CellPerformanceRow[]>();
    for (const row of rows) {
      const angleKey = angleKeyFromCellId(row.cell_id);
      const angleRows = byAngle.get(angleKey);
      if (angleRows) {
        angleRows.push(row);
      } else {
        byAngle.set(angleKey, [row]);
      }
    }

    const angles: AngleGroup[] = [];
    for (const [angleKey, angleRows] of byAngle) {
      const angleLabel = rowLabelMap.get(angleKey) ?? `Angle ${angleKey}`;
      angles.push({
        angleKey,
        angleLabel,
        blended: blendCells(angleRows),
        cells: deduplicateCells(angleRows),
        allRows: angleRows,
      });
    }

    angles.sort((a, b) => b.blended.spend - a.blended.spend || a.angleKey.localeCompare(b.angleKey));

    result.push({
      conceptId,
      conceptName,
      blended: blendCells(rows),
      angles,
      allRows: rows,
    });
  }

  return result.sort((a, b) => b.blended.spend - a.blended.spend);
}

// ─── Cell ranking ─────────────────────────────────────────────────────

/**
 * Which KPI to sort by when ranking cells within an angle drill-down.
 *
 * - "cpa"     — ascending (lower CPA = more efficient); cells without
 *               results rank below cells with results.
 * - "spend"   — descending (more spend = more reach tested).
 * - "results" — descending (more results = higher absolute volume).
 * - "ctr"     — descending (higher CTR = better click engagement).
 *
 * Defaults to "cpa" (the primary optimization target in ad creative work).
 * The caller can pass whatever primary KPI the UI surface exposes — this
 * function's contract is stable even when no external KPI picker exists yet.
 */
export type CellRankKpi = "cpa" | "spend" | "results" | "ctr";

/**
 * Rank deduplicated cell rows within an angle group by the specified KPI.
 * Rows in `allRows` (multi-result-type) are aggregated per cell_id first
 * so each cell contributes exactly one set of stats to the ranking.
 * Returns a new sorted array — source arrays are unchanged.
 */
export function rankCellsByPrimaryKpi(
  cells: CellPerformanceRow[],
  allRows: CellPerformanceRow[],
  kpi: CellRankKpi = "cpa"
): CellPerformanceRow[] {
  const statMap = new Map<string, { spend: number; results: number; impressions: number; linkClicks: number }>();
  for (const row of allRows) {
    const prev = statMap.get(row.cell_id);
    if (prev) {
      prev.spend += row["Amount spent (USD)"];
      prev.results += row.Results;
      prev.impressions += row.Impressions;
      prev.linkClicks += row["Link clicks"];
    } else {
      statMap.set(row.cell_id, {
        spend: row["Amount spent (USD)"],
        results: row.Results,
        impressions: row.Impressions,
        linkClicks: row["Link clicks"],
      });
    }
  }

  return [...cells].sort((a, b) => {
    const sa = statMap.get(a.cell_id) ?? { spend: 0, results: 0, impressions: 0, linkClicks: 0 };
    const sb = statMap.get(b.cell_id) ?? { spend: 0, results: 0, impressions: 0, linkClicks: 0 };

    if (kpi === "cpa") {
      const cpaA = sa.results > 0 ? sa.spend / sa.results : null;
      const cpaB = sb.results > 0 ? sb.spend / sb.results : null;
      if (cpaA !== null && cpaB === null) return -1;
      if (cpaA === null && cpaB !== null) return 1;
      if (cpaA !== null && cpaB !== null && cpaA !== cpaB) return cpaA - cpaB;
      return sb.spend - sa.spend;
    }
    if (kpi === "spend")   return sb.spend - sa.spend;
    if (kpi === "results") return sb.results - sa.results;
    if (kpi === "ctr") {
      const ctrA = sa.impressions > 0 ? sa.linkClicks / sa.impressions : -1;
      const ctrB = sb.impressions > 0 ? sb.linkClicks / sb.impressions : -1;
      return ctrB - ctrA;
    }
    return 0;
  });
}
