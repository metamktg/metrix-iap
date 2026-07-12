// ─── Creative DNA (variable makeup) analytics ─────────────────────────
// Pure computation layer linking avatars (MST matrix columns) to the
// creative-variable DNA that actually ran for them:
//   avatar column → cell codes (<Col><Row> per the canonical MST scheme)
//   → performance_by_cell rows → variable codes → per-variable rollups.
//
// Integrity rules (non-negotiable):
// - Only cells with real performance rows contribute numbers. Planned
//   matrix angles without data are reported as coverage, never blended.
// - Cell→column attribution uses the canonical MST cell-code scheme
//   (columns C1..Cn, rows A,B,C…, cell = <Col><Row>) and only attaches
//   to columns that exist in this account's grid — never a guess.
// - Derived metrics are null when the denominator is zero.

import type {
  AnalysisData,
  CellPerformanceRow,
  MST,
  MSTMatrix,
  VariablePerformanceRow,
} from "@/lib/data/seedTypes";
import { codesFromCarrier, splitCodes } from "@/lib/segment-analytics";

// ─── Variable families ────────────────────────────────────────────────

/**
 * Canonical taxonomy prefix → family key (matches the families used by
 * v3_variable_performance). Data-carried families always win; the prefix
 * is the documented MST taxonomy, used only when data doesn't say.
 */
const PREFIX_FAMILY: Record<string, string> = {
  HK: "hook",
  TN: "tone",
  FW: "framework",
  CN: "concept",
  PR: "proof",
  HP: "pain_proof",
  CTA: "cta",
  ST: "stage",
  AW: "awareness",
};

/** variable_id → variable_family, from the account's own variable rows. */
export function buildVariableFamilyMap(analysis: AnalysisData | null | undefined): Map<string, string> {
  const map = new Map<string, string>();
  const rows = [
    ...(analysis?.v3_variable_performance ?? []),
    ...(analysis?.top_checkout_variables ?? []),
  ];
  for (const r of rows) {
    if (r.variable_id && r.variable_family && !map.has(r.variable_id)) {
      map.set(r.variable_id, r.variable_family);
    }
  }
  return map;
}

/** Family for a code: account data first, canonical prefix second, else null. */
export function familyForCode(code: string, familyMap: Map<string, string>): string | null {
  const fromData = familyMap.get(code);
  if (fromData) return fromData;
  const prefix = code.split("_")[0]?.toUpperCase() ?? "";
  return PREFIX_FAMILY[prefix] ?? null;
}

// ─── Cell → avatar column attribution ─────────────────────────────────

/**
 * Column id for a cell code under the canonical MST scheme
 * (cell = <Col><Row>, e.g. "C2E" → "C2"). Returns null unless the
 * derived column actually exists in this account's grid — a cell code
 * that doesn't match a real column is never attributed.
 */
export function columnIdForCell(cellId: string, columnIds: string[]): string | null {
  const m = /^(C\d+)[A-Z]$/i.exec(cellId.trim());
  if (!m) return null;
  const col = m[1].toUpperCase();
  return columnIds.some((id) => id.toUpperCase() === col) ? col : null;
}

// ─── Per-avatar DNA ───────────────────────────────────────────────────

export interface DnaVariable {
  code: string;
  /** Canonical family key ("hook", "framework", …) or null when unknown. */
  family: string | null;
  /** Measured cells carrying this variable. */
  cellIds: string[];
  spend: number;
  results: number;
  impressions: number;
  linkClicks: number;
  /** spend ÷ results; null when no results. */
  cpa: number | null;
  /** link clicks ÷ impressions × 100; null when no impressions. */
  ctrPct: number | null;
}

export interface AvatarDna {
  columnId: string;
  /** Angles planned for this avatar in the matrix grid. */
  plannedCellIds: string[];
  /** Cells with real performance rows attributed to this column. */
  measuredCellIds: string[];
  /** Measured cells beyond the planned grid rows (extension angles). */
  extensionCellIds: string[];
  /** Measured variable makeup, ranked by results then spend. */
  variables: DnaVariable[];
}

/**
 * Variable codes actually carried by a measured cell: the union across
 * the cell's own performance rows first (rows for different result
 * types can carry partially-populated code fields), then the MST
 * library entry, then the planned matrix stack. Empty when no source
 * knows the stack — never invented.
 */
function codesForMeasuredCell(
  cellId: string,
  perfRows: CellPerformanceRow[],
  mst: MST | null | undefined,
  matrix: MSTMatrix
): string[] {
  const own = new Set<string>();
  for (const r of perfRows) {
    for (const code of codesFromCarrier(r)) own.add(code);
  }
  if (own.size) return Array.from(own);
  const lib = mst?.local_book2_library?.find((c) => c.cell_id === cellId);
  const libCodes = codesFromCarrier(lib);
  if (libCodes.length) return Array.from(new Set(libCodes));
  const planned = matrix.cells.find((c) => c.cell_id === cellId);
  if (planned) {
    return Array.from(new Set(Object.values(planned.variable_stack).flatMap((v) => splitCodes(v))));
  }
  return [];
}

function ratio(num: number, den: number, scale = 1): number | null {
  return den > 0 ? (num / den) * scale : null;
}

/** Rank: results desc (what actually converts), then spend desc. */
function rankDna(a: DnaVariable, b: DnaVariable): number {
  return b.results - a.results || b.spend - a.spend;
}

export function computeAvatarDna(
  columnId: string,
  matrix: MSTMatrix,
  analysis: AnalysisData | null | undefined,
  mst: MST | null | undefined
): AvatarDna {
  const plannedCellIds = matrix.cells.filter((c) => c.column_id === columnId).map((c) => c.cell_id);
  const columnIds = matrix.columns.map((c) => c.id);

  // Group this column's performance rows per cell.
  const byCell = new Map<string, CellPerformanceRow[]>();
  for (const row of analysis?.performance_by_cell ?? []) {
    if (columnIdForCell(row.cell_id, columnIds) !== columnId) continue;
    const list = byCell.get(row.cell_id) ?? [];
    list.push(row);
    byCell.set(row.cell_id, list);
  }

  const measuredCellIds = Array.from(byCell.keys()).sort();
  const plannedSet = new Set(plannedCellIds);
  const extensionCellIds = measuredCellIds.filter((id) => !plannedSet.has(id));

  const familyMap = buildVariableFamilyMap(analysis);
  const byCode = new Map<string, { cellIds: Set<string>; spend: number; results: number; impressions: number; linkClicks: number }>();
  for (const [cellId, rows] of byCell) {
    const codes = codesForMeasuredCell(cellId, rows, mst, matrix);
    if (codes.length === 0) continue;
    const spend = rows.reduce((s, r) => s + r["Amount spent (USD)"], 0);
    const results = rows.reduce((s, r) => s + r.Results, 0);
    const impressions = rows.reduce((s, r) => s + r.Impressions, 0);
    const linkClicks = rows.reduce((s, r) => s + r["Link clicks"], 0);
    for (const code of codes) {
      const e = byCode.get(code) ?? { cellIds: new Set<string>(), spend: 0, results: 0, impressions: 0, linkClicks: 0 };
      e.cellIds.add(cellId);
      e.spend += spend;
      e.results += results;
      e.impressions += impressions;
      e.linkClicks += linkClicks;
      byCode.set(code, e);
    }
  }

  const variables: DnaVariable[] = Array.from(byCode.entries())
    .map(([code, e]) => ({
      code,
      family: familyForCode(code, familyMap),
      cellIds: Array.from(e.cellIds).sort(),
      spend: e.spend,
      results: e.results,
      impressions: e.impressions,
      linkClicks: e.linkClicks,
      cpa: ratio(e.spend, e.results),
      ctrPct: ratio(e.linkClicks, e.impressions, 100),
    }))
    .sort(rankDna);

  return { columnId, plannedCellIds, measuredCellIds, extensionCellIds, variables };
}

/**
 * Merge several avatars' DNA into one ranked list (for an ICP profile
 * targeted by multiple avatars). Cells belong to exactly one column, so
 * merging by code never double-counts a cell's rows.
 */
export function mergeAvatarDna(dnas: AvatarDna[]): DnaVariable[] {
  const byCode = new Map<string, DnaVariable>();
  for (const dna of dnas) {
    for (const v of dna.variables) {
      const prev = byCode.get(v.code);
      if (!prev) {
        byCode.set(v.code, { ...v, cellIds: [...v.cellIds] });
        continue;
      }
      prev.cellIds = Array.from(new Set([...prev.cellIds, ...v.cellIds])).sort();
      prev.spend += v.spend;
      prev.results += v.results;
      prev.impressions += v.impressions;
      prev.linkClicks += v.linkClicks;
      prev.cpa = ratio(prev.spend, prev.results);
      prev.ctrPct = ratio(prev.linkClicks, prev.impressions, 100);
    }
  }
  return Array.from(byCode.values()).sort(rankDna);
}

// ─── Family rollup (account-level Creative DNA summary) ───────────────

export interface DnaFamilyTopVariable {
  variableId: string;
  spend: number;
  results: number;
  cpa: number | null;
}

export interface DnaFamilyRollup {
  family: string;
  spend: number;
  results: number;
  cpa: number | null;
  variableCount: number;
  /** Best read in the family: lowest CPA with results, else most spend. */
  top: DnaFamilyTopVariable | null;
}

/**
 * Roll v3_variable_performance rows up per family. Rows are expected to
 * already be metric-filtered by the caller (same convention as the
 * library tables — spend sums across the selected result-type rows).
 */
export function rollupDnaFamilies(rows: VariablePerformanceRow[]): DnaFamilyRollup[] {
  const byFamily = new Map<string, Map<string, { spend: number; results: number }>>();
  for (const r of rows) {
    const fam = byFamily.get(r.variable_family) ?? new Map<string, { spend: number; results: number }>();
    const v = fam.get(r.variable_id) ?? { spend: 0, results: 0 };
    v.spend += r["Amount spent (USD)"];
    v.results += r.Results;
    fam.set(r.variable_id, v);
    byFamily.set(r.variable_family, fam);
  }

  const rollups: DnaFamilyRollup[] = Array.from(byFamily.entries()).map(([family, variables]) => {
    let spend = 0;
    let results = 0;
    const entries: DnaFamilyTopVariable[] = Array.from(variables.entries()).map(([variableId, v]) => {
      spend += v.spend;
      results += v.results;
      return { variableId, spend: v.spend, results: v.results, cpa: ratio(v.spend, v.results) };
    });
    const withResults = entries.filter((e) => e.results > 0 && e.cpa != null);
    const top =
      withResults.length > 0
        ? withResults.reduce((best, e) => (e.cpa! < best.cpa! || (e.cpa === best.cpa && e.results > best.results) ? e : best))
        : entries.length > 0
          ? entries.reduce((best, e) => (e.spend > best.spend ? e : best))
          : null;
    return { family, spend, results, cpa: ratio(spend, results), variableCount: variables.size, top };
  });

  return rollups.sort((a, b) => b.spend - a.spend);
}
