// ─── MST 7-layer analysis engine ──────────────────────────────────────
// Pure, deterministic computation over data already present in the seed
// bundle (historical_matrix_4x4 + performance_by_cell) — no LLM call, no
// new storage. MST_TEST_ENGINE_v2.0.md's layers 1-7 are fundamentally
// grouping/ranking/aggregation math (column/row/diagonal joins, variable
// isolation, pairwise synergy, leaderboard), not creative narrative, so
// computing them client-side from real numbers is both cheaper and
// strictly bug-safer than routing them through generation — there is no
// hallucination surface when the output is arithmetic over real rows.
//
// Verdict taxonomy (universal_winner / avatar_dependent / underperformer /
// insufficient_data) is direction-aware per cohort terminal_metric_direction
// (see data/cohortMeta.ts) so this never hardcodes "CPA" or a lower-is-
// better assumption.

import type { CellPerformanceRow, MST, MSTMatrix, MSTMatrixCell } from "./data/seedTypes";
import type { TerminalDirection } from "./data/cohortMeta";
import { extractVariableCodes } from "./normalize";

const MIN_APPEARANCES = 2;
const CONSISTENCY_COV_THRESHOLD = 0.2;

// ─── shared aggregation primitives ────────────────────────────────────

export interface TerminalAgg {
  spend: number;
  results: number;
  /** spend / results — the terminal metric value for this slice. Null with zero results. */
  terminalMetricValue: number | null;
  ctrLinkPct: number | null;
  appearances: number;
}

function aggregateRows(rows: CellPerformanceRow[]): TerminalAgg {
  const spend = rows.reduce((n, r) => n + r["Amount spent (USD)"], 0);
  const results = rows.reduce((n, r) => n + r.Results, 0);
  const ctrs = rows.map((r) => r.CTR_link_pct).filter((v): v is number => v != null);
  return {
    spend,
    results,
    terminalMetricValue: results > 0 ? spend / results : null,
    ctrLinkPct: ctrs.length > 0 ? ctrs.reduce((a, b) => a + b, 0) / ctrs.length : null,
    appearances: rows.length,
  };
}

function mergeAgg(aggs: TerminalAgg[]): TerminalAgg {
  const spend = aggs.reduce((n, a) => n + a.spend, 0);
  const results = aggs.reduce((n, a) => n + a.results, 0);
  const ctrs = aggs.map((a) => a.ctrLinkPct).filter((v): v is number => v != null);
  return {
    spend,
    results,
    terminalMetricValue: results > 0 ? spend / results : null,
    ctrLinkPct: ctrs.length > 0 ? ctrs.reduce((a, b) => a + b, 0) / ctrs.length : null,
    appearances: aggs.reduce((n, a) => n + a.appearances, 0),
  };
}

/** true if `a` outranks `b` under the cohort's terminal_metric_direction. */
function better(direction: TerminalDirection, a: number, b: number): boolean {
  return direction === "lower_is_better" ? a < b : a > b;
}

function sortByDirection<T>(items: T[], direction: TerminalDirection, value: (t: T) => number | null): T[] {
  return [...items].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return direction === "lower_is_better" ? va - vb : vb - va;
  });
}

function coefficientOfVariation(values: number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return null;
  const variance = values.reduce((n, v) => n + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / Math.abs(mean);
}

/**
 * Deterministic stand-in for the spec's qualitative verdict call. Consistency
 * (low coefficient of variation across contexts) distinguishes universal_winner
 * from avatar_dependent; average standing vs the comparison set distinguishes
 * underperformer. Thresholds are heuristic by nature — documented, not tuned
 * against real sprint data yet.
 */
function classifyVerdict(
  direction: TerminalDirection,
  contextValues: number[],
  comparisonAvg: number | null,
): { verdict: Verdict; consistency: "high" | "moderate" | "low" | null } {
  if (contextValues.length < MIN_APPEARANCES) return { verdict: "insufficient_data", consistency: null };
  const mean = contextValues.reduce((a, b) => a + b, 0) / contextValues.length;
  const cov = coefficientOfVariation(contextValues);
  const consistency: "high" | "moderate" | "low" =
    cov == null ? "high" : cov <= CONSISTENCY_COV_THRESHOLD ? "high" : cov <= CONSISTENCY_COV_THRESHOLD * 2 ? "moderate" : "low";
  const worseThanAvg = comparisonAvg != null && !better(direction, mean, comparisonAvg) && mean !== comparisonAvg;
  if (consistency === "high" && !worseThanAvg) return { verdict: "universal_winner", consistency };
  if (consistency === "low") return { verdict: "avatar_dependent", consistency };
  if (worseThanAvg) return { verdict: "underperformer", consistency };
  return { verdict: "avatar_dependent", consistency };
}

export type Verdict = "universal_winner" | "avatar_dependent" | "underperformer" | "insufficient_data";

// ─── Layer 1: creative-level performance ──────────────────────────────

export interface CreativePerformanceEntry {
  cell: MSTMatrixCell;
  rows: CellPerformanceRow[];
  agg: TerminalAgg;
  ran: boolean;
}

export function layer1CreativePerformance(matrix: MSTMatrix, perfRows: CellPerformanceRow[]): CreativePerformanceEntry[] {
  return matrix.cells.map((cell) => {
    const rows = perfRows.filter((r) => r.cell_id === cell.cell_id);
    return { cell, rows, agg: aggregateRows(rows), ran: rows.length > 0 };
  });
}

const VARIABLE_ROW_FIELDS = [
  "concept_variable",
  "framework_variable",
  "tone_variable",
  "hook_variable",
  "pain_proof_variable",
  "proof_variable",
  "cta_variable",
] satisfies (keyof CellPerformanceRow)[];

export type VariableFamily = "concept" | "framework" | "tonality" | "hook" | "pain_point" | "proof" | "cta" | "stage";

// Prefix is the authoritative source of truth for family, not the source
// field a code happened to be read from — a field can carry a code from a
// different family than its name suggests in raw exports, and the matrix
// cell's variable_stack keys (cn/fw/tn/hk/hp/pr/st) don't reliably map 1:1
// either. Codes with an unrecognized prefix are dropped, not miscategorized.
const PREFIX_FAMILY: Record<string, VariableFamily> = {
  CN: "concept",
  FW: "framework",
  TN: "tonality",
  HK: "hook",
  HP: "pain_point",
  PR: "proof",
  CTA: "cta",
  ST: "stage",
};

function familyOfCode(code: string): VariableFamily | null {
  const prefix = code.split("_")[0] ?? "";
  return PREFIX_FAMILY[prefix] ?? null;
}

/**
 * Variable codes carried by a creative: matrix-planned stack merged with
 * observed per-row tags. Field values are sometimes a single code, sometimes
 * multiple joined with " + " (e.g. "TN_Rational + TN_Relatable") — routed
 * through extractVariableCodes rather than treated as one opaque string so
 * each code is isolated and counted individually.
 */
function codesForEntry(entry: CreativePerformanceEntry): { code: string; family: VariableFamily }[] {
  const out: { code: string; family: VariableFamily }[] = [];
  const seen = new Set<string>();
  const add = (raw: string | null | undefined) => {
    for (const code of extractVariableCodes(raw)) {
      if (seen.has(code)) continue;
      const family = familyOfCode(code);
      if (!family) continue;
      seen.add(code);
      out.push({ code, family });
    }
  };
  for (const code of Object.values(entry.cell.variable_stack)) add(code);
  for (const key of VARIABLE_ROW_FIELDS) {
    for (const row of entry.rows) add(row[key] as string | undefined);
  }
  return out;
}

// ─── Layer 2: column analysis (avatar performance) ────────────────────

export interface ColumnAnalysisEntry {
  columnId: string;
  columnLabel: string;
  icp: string;
  agg: TerminalAgg;
  variants: { cellId: string; conceptCode: string; value: number | null; rank: number }[];
  winningVariables: { code: string; family: VariableFamily }[];
  scale: string[];
  iterate: string[];
  retire: string[];
}

export function layer2ColumnAnalysis(
  matrix: MSTMatrix,
  entries: CreativePerformanceEntry[],
  direction: TerminalDirection,
): ColumnAnalysisEntry[] {
  const byColumn = new Map<string, CreativePerformanceEntry[]>();
  for (const e of entries) {
    const list = byColumn.get(e.cell.column_id) ?? [];
    list.push(e);
    byColumn.set(e.cell.column_id, list);
  }
  return matrix.columns
    .map((col) => {
      const cellEntries = (byColumn.get(col.id) ?? []).filter((e) => e.ran);
      if (cellEntries.length === 0) return null;
      const ranked = sortByDirection(cellEntries, direction, (e) => e.agg.terminalMetricValue);
      const variants = ranked.map((e, i) => ({
        cellId: e.cell.cell_id,
        conceptCode: e.cell.concept_code,
        value: e.agg.terminalMetricValue,
        rank: i + 1,
      }));
      const top = ranked[0]!;
      const bottom = ranked[ranked.length - 1]!;
      return {
        columnId: col.id,
        columnLabel: col.name,
        icp: col.icp,
        agg: mergeAgg(cellEntries.map((e) => e.agg)),
        variants,
        winningVariables: codesForEntry(top),
        scale: ranked.length > 0 ? [top.cell.cell_id] : [],
        iterate: ranked.slice(1, -1).map((e) => e.cell.cell_id),
        retire: ranked.length > 1 ? [bottom.cell.cell_id] : [],
      };
    })
    .filter((c): c is ColumnAnalysisEntry => c !== null);
}

// ─── Layer 3: row analysis (cross-avatar variable testing) ───────────

export interface RowAnalysisEntry {
  rowId: string;
  sharedVariable: string;
  color: string;
  agg: TerminalAgg;
  byColumn: { columnId: string; columnLabel: string; value: number | null; standing: "strong" | "moderate" | "weak" }[];
  verdict: Verdict;
  consistency: "high" | "moderate" | "low" | null;
}

export function layer3RowAnalysis(
  matrix: MSTMatrix,
  entries: CreativePerformanceEntry[],
  direction: TerminalDirection,
): RowAnalysisEntry[] {
  const byRow = new Map<string, CreativePerformanceEntry[]>();
  for (const e of entries) {
    const list = byRow.get(e.cell.row_id) ?? [];
    list.push(e);
    byRow.set(e.cell.row_id, list);
  }
  // For "standing" within a column, rank every row's value against the other rows in that same column.
  const columnPeers = new Map<string, CreativePerformanceEntry[]>();
  for (const e of entries.filter((x) => x.ran)) {
    const list = columnPeers.get(e.cell.column_id) ?? [];
    list.push(e);
    columnPeers.set(e.cell.column_id, list);
  }

  return matrix.rows
    .map((row) => {
      const cellEntries = (byRow.get(row.id) ?? []).filter((e) => e.ran);
      if (cellEntries.length === 0) return null;
      const contextValues = cellEntries.map((e) => e.agg.terminalMetricValue).filter((v): v is number => v != null);
      const overallAvg = entries.filter((e) => e.ran && e.agg.terminalMetricValue != null).length > 0
        ? mergeAgg(entries.filter((e) => e.ran).map((e) => e.agg)).terminalMetricValue
        : null;
      const { verdict, consistency } = classifyVerdict(direction, contextValues, overallAvg);
      const byColumn = cellEntries.map((e) => {
        const peers = sortByDirection(columnPeers.get(e.cell.column_id) ?? [], direction, (p) => p.agg.terminalMetricValue);
        const idx = peers.findIndex((p) => p.cell.cell_id === e.cell.cell_id);
        const standing: "strong" | "moderate" | "weak" = idx <= 0 ? "strong" : idx === peers.length - 1 ? "weak" : "moderate";
        return { columnId: e.cell.column_id, columnLabel: e.cell.column_label, value: e.agg.terminalMetricValue, standing };
      });
      return {
        rowId: row.id,
        sharedVariable: row.shared,
        color: row.color,
        agg: mergeAgg(cellEntries.map((e) => e.agg)),
        byColumn,
        verdict,
        consistency,
      };
    })
    .filter((r): r is RowAnalysisEntry => r !== null);
}

// ─── Layer 4: diagonal analysis (maximum isolation) ───────────────────

export interface DiagonalAnalysisEntry {
  role: "main" | "counter";
  label: string;
  cellIds: string[];
  agg: TerminalAgg;
  verdict: Verdict;
  consistency: "high" | "moderate" | "low" | null;
}

export function layer4DiagonalAnalysis(
  matrix: MSTMatrix,
  entries: CreativePerformanceEntry[],
  direction: TerminalDirection,
): DiagonalAnalysisEntry[] {
  const byId = new Map(entries.map((e) => [e.cell.cell_id, e]));
  const diagonals: { role: "main" | "counter"; label: string; ids: string[] }[] = [
    {
      role: "main",
      label: "Primary ↘",
      ids: matrix.diagonal_down.length > 0
        ? matrix.diagonal_down
        : entries.filter((e) => e.cell.diagonal_role === "diag_down").map((e) => e.cell.cell_id),
    },
    {
      role: "counter",
      label: "Counter ↗",
      ids: matrix.diagonal_up.length > 0
        ? matrix.diagonal_up
        : entries.filter((e) => e.cell.diagonal_role === "diag_up").map((e) => e.cell.cell_id),
    },
  ];
  const overallAvg = entries.filter((e) => e.ran).length > 0
    ? mergeAgg(entries.filter((e) => e.ran).map((e) => e.agg)).terminalMetricValue
    : null;

  return diagonals
    .map(({ role, label, ids }) => {
      const cellEntries = ids.map((id) => byId.get(id)).filter((e): e is CreativePerformanceEntry => !!e && e.ran);
      if (cellEntries.length === 0) return null;
      const contextValues = cellEntries.map((e) => e.agg.terminalMetricValue).filter((v): v is number => v != null);
      const { verdict, consistency } = classifyVerdict(direction, contextValues, overallAvg);
      return { role, label, cellIds: ids, agg: mergeAgg(cellEntries.map((e) => e.agg)), verdict, consistency };
    })
    .filter((d): d is DiagonalAnalysisEntry => d !== null);
}

// ─── Layer 5: variable isolation ──────────────────────────────────────

export interface VariableIsolationEntry {
  code: string;
  family: VariableFamily;
  appearances: number;
  locations: string[];
  agg: TerminalAgg;
  verdict: Verdict;
  consistency: "high" | "moderate" | "low" | null;
}

export function layer5VariableIsolation(entries: CreativePerformanceEntry[], direction: TerminalDirection): VariableIsolationEntry[] {
  const ran = entries.filter((e) => e.ran);
  const overallAvg = ran.length > 0 ? mergeAgg(ran.map((e) => e.agg)).terminalMetricValue : null;
  const byCode = new Map<string, { family: VariableFamily; entries: CreativePerformanceEntry[] }>();
  for (const e of ran) {
    for (const { code, family } of codesForEntry(e)) {
      const bucket = byCode.get(code) ?? { family, entries: [] };
      bucket.entries.push(e);
      byCode.set(code, bucket);
    }
  }
  return [...byCode.entries()].map(([code, { family, entries: es }]) => {
    const contextValues = es.map((e) => e.agg.terminalMetricValue).filter((v): v is number => v != null);
    const { verdict, consistency } = classifyVerdict(direction, contextValues, overallAvg);
    return {
      code,
      family,
      appearances: es.length,
      locations: es.map((e) => e.cell.cell_id),
      agg: mergeAgg(es.map((e) => e.agg)),
      verdict,
      consistency,
    };
  });
}

// ─── Layer 6: combination synergy ──────────────────────────────────────

export interface CombinationEntry {
  codes: string[];
  size: 2 | 3;
  appearances: number;
  locations: string[];
  agg: TerminalAgg;
  liftVsSolo: { code: string; liftPct: number | null }[];
  synergyScore: "very_high" | "high" | "moderate" | "negative" | null;
  status: "winning_combination" | "avoid_combination" | "neutral";
  isGoldenFormula: boolean;
}

function combinationsOfSize<T>(items: T[], size: 2 | 3): T[][] {
  const out: T[][] = [];
  const pick = (start: number, chosen: T[]) => {
    if (chosen.length === size) {
      out.push([...chosen]);
      return;
    }
    for (let i = start; i < items.length; i++) {
      chosen.push(items[i]!);
      pick(i + 1, chosen);
      chosen.pop();
    }
  };
  pick(0, []);
  return out;
}

export function layer6CombinationSynergy(
  entries: CreativePerformanceEntry[],
  isolation: VariableIsolationEntry[],
  direction: TerminalDirection,
): CombinationEntry[] {
  const ran = entries.filter((e) => e.ran);
  const soloByCode = new Map(isolation.map((v) => [v.code, v.agg.terminalMetricValue]));

  function buildLayer(size: 2 | 3): CombinationEntry[] {
    const byKey = new Map<string, { codes: string[]; entries: CreativePerformanceEntry[] }>();
    for (const e of ran) {
      const codes = codesForEntry(e).map((c) => c.code);
      for (const combo of combinationsOfSize(codes, size)) {
        const key = [...combo].sort().join("+");
        const bucket = byKey.get(key) ?? { codes: combo, entries: [] };
        bucket.entries.push(e);
        byKey.set(key, bucket);
      }
    }
    const results: CombinationEntry[] = [];
    for (const { codes, entries: es } of byKey.values()) {
      if (es.length < MIN_APPEARANCES) continue;
      const agg = mergeAgg(es.map((e) => e.agg));
      if (agg.terminalMetricValue == null) continue;
      const liftVsSolo = codes.map((code) => {
        const solo = soloByCode.get(code);
        if (solo == null || solo === 0) return { code, liftPct: null };
        const liftPct = ((solo - agg.terminalMetricValue!) / Math.abs(solo)) * 100 * (direction === "lower_is_better" ? 1 : -1);
        return { code, liftPct };
      });
      const avgLift = liftVsSolo.filter((l) => l.liftPct != null).map((l) => l.liftPct!);
      const meanLift = avgLift.length > 0 ? avgLift.reduce((a, b) => a + b, 0) / avgLift.length : null;
      const synergyScore: CombinationEntry["synergyScore"] =
        meanLift == null ? null : meanLift >= 15 ? "very_high" : meanLift >= 5 ? "high" : meanLift >= -5 ? "moderate" : "negative";
      const status: CombinationEntry["status"] =
        synergyScore === "very_high" || synergyScore === "high"
          ? "winning_combination"
          : synergyScore === "negative"
            ? "avoid_combination"
            : "neutral";
      results.push({
        codes,
        size,
        appearances: es.length,
        locations: es.map((e) => e.cell.cell_id),
        agg,
        liftVsSolo,
        synergyScore,
        status,
        isGoldenFormula: false,
      });
    }
    return results;
  }

  const pairs = buildLayer(2);
  const triples = buildLayer(3);
  const bestTriple = sortByDirection(
    triples.filter((t) => t.status === "winning_combination"),
    direction,
    (t) => t.agg.terminalMetricValue,
  )[0];
  if (bestTriple) bestTriple.isGoldenFormula = true;

  return [...pairs, ...triples].sort((a, b) => Number(b.isGoldenFormula) - Number(a.isGoldenFormula));
}

// ─── Layer 7: crossmap performance (master leaderboard) ───────────────

export interface LeaderboardEntry extends VariableIsolationEntry {
  rank: number;
  strategicPriority: "critical_scale" | "scale" | "monitor" | "retire" | "insufficient_data";
}

export function layer7Crossmap(isolation: VariableIsolationEntry[], direction: TerminalDirection): LeaderboardEntry[] {
  const ranked = sortByDirection(isolation, direction, (v) => v.agg.terminalMetricValue);
  return ranked.map((v, i) => ({
    ...v,
    rank: i + 1,
    strategicPriority:
      v.verdict === "insufficient_data"
        ? "insufficient_data"
        : v.verdict === "underperformer"
          ? "retire"
          : v.verdict === "universal_winner" && i < Math.max(1, Math.ceil(ranked.length * 0.25))
            ? "critical_scale"
            : v.verdict === "universal_winner"
              ? "scale"
              : "monitor",
  }));
}

// ─── Top-level entry point ─────────────────────────────────────────────

export interface MstAnalysis {
  direction: TerminalDirection;
  creativePerformance: CreativePerformanceEntry[];
  columnAnalysis: ColumnAnalysisEntry[];
  rowAnalysis: RowAnalysisEntry[];
  diagonalAnalysis: DiagonalAnalysisEntry[];
  variableIsolation: VariableIsolationEntry[];
  combinationSynergy: CombinationEntry[];
  crossmap: LeaderboardEntry[];
}

export function runMstAnalysis(
  mst: MST | null | undefined,
  perfRows: CellPerformanceRow[],
  direction: TerminalDirection = "lower_is_better",
): MstAnalysis | null {
  const matrix = mst?.historical_matrix_4x4;
  if (!mst || mst.status !== "active" || !matrix || matrix.cells.length === 0) return null;

  const creativePerformance = layer1CreativePerformance(matrix, perfRows);
  if (!creativePerformance.some((e) => e.ran)) return null;

  const columnAnalysis = layer2ColumnAnalysis(matrix, creativePerformance, direction);
  const rowAnalysis = layer3RowAnalysis(matrix, creativePerformance, direction);
  const diagonalAnalysis = layer4DiagonalAnalysis(matrix, creativePerformance, direction);
  const variableIsolation = layer5VariableIsolation(creativePerformance, direction);
  const combinationSynergy = layer6CombinationSynergy(creativePerformance, variableIsolation, direction);
  const crossmap = layer7Crossmap(variableIsolation, direction);

  return { direction, creativePerformance, columnAnalysis, rowAnalysis, diagonalAnalysis, variableIsolation, combinationSynergy, crossmap };
}
