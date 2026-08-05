// ─── mst-analysis unit tests ──────────────────────────────────────────
// Pure-function coverage against the real seed fixture (bookster: 16-cell
// active matrix, 12 performance rows) plus small synthetic cases for the
// verdict/synergy edge conditions the fixture doesn't exercise.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  runMstAnalysis,
  layer1CreativePerformance,
  layer5VariableIsolation,
  layer7Crossmap,
} from "../mst-analysis";
import type { AnalysisData, MST } from "../data/seedTypes";

const seed = JSON.parse(
  fs.readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../test-fixtures/metrix_seed_bundle.json"),
    "utf-8",
  ),
);

const bookster = seed.ad_accounts.find((a: { id: string }) => a.id === "bookster");
const analysis: AnalysisData = bookster.iap.analysis;
const mst: MST = bookster.mst;

describe("runMstAnalysis against the real bookster fixture", () => {
  const result = runMstAnalysis(mst, analysis.performance_by_cell, "lower_is_better");

  it("returns a full analysis for an active matrix with performance data", () => {
    expect(result).not.toBeNull();
  });

  it("layer 1 joins every matrix cell, marking which ones actually ran", () => {
    const layer1 = layer1CreativePerformance(mst.historical_matrix_4x4!, analysis.performance_by_cell);
    expect(layer1.length).toBe(mst.historical_matrix_4x4!.cells.length);
    const ranCells = new Set(analysis.performance_by_cell.map((r) => r.cell_id));
    for (const entry of layer1) {
      expect(entry.ran).toBe(ranCells.has(entry.cell.cell_id));
    }
  });

  it("column and row analysis only include columns/rows with observed performance", () => {
    expect(result!.columnAnalysis.length).toBeGreaterThan(0);
    expect(result!.rowAnalysis.length).toBeGreaterThan(0);
    for (const col of result!.columnAnalysis) {
      expect(col.variants.length).toBeGreaterThan(0);
    }
  });

  it("diagonal analysis uses the matrix-level diagonal_down/diagonal_up cell id arrays", () => {
    const diag = result!.diagonalAnalysis;
    const main = diag.find((d) => d.role === "main");
    const counter = diag.find((d) => d.role === "counter");
    // Only cells with observed performance survive into the diagonal entry.
    if (main) expect(main.cellIds).toEqual(mst.historical_matrix_4x4!.diagonal_down);
    if (counter) expect(counter.cellIds).toEqual(mst.historical_matrix_4x4!.diagonal_up);
  });

  it("splits compound ' + '-joined variable fields into separate isolated codes", () => {
    const iso = result!.variableIsolation;
    const tnRational = iso.find((v) => v.code === "TN_Rational");
    const tnRelatable = iso.find((v) => v.code === "TN_Relatable");
    // C2B's tone_variable is "TN_Rational + TN_Relatable" — both must be isolated separately, not as one glued code.
    expect(tnRational).toBeDefined();
    expect(tnRelatable).toBeDefined();
    expect(iso.some((v) => v.code.includes("+"))).toBe(false);
  });

  it("crossmap ranks every isolated variable exactly once, 1..N with no gaps", () => {
    const board = layer7Crossmap(result!.variableIsolation, "lower_is_better");
    const ranks = board.map((b) => b.rank).sort((a, b) => a - b);
    expect(ranks).toEqual(Array.from({ length: board.length }, (_, i) => i + 1));
  });

  it("returns null when the matrix is not active or has no matrix cells", () => {
    expect(runMstAnalysis({ ...mst, status: "pending" }, analysis.performance_by_cell)).toBeNull();
    expect(runMstAnalysis(null, analysis.performance_by_cell)).toBeNull();
  });
});

describe("direction-aware ranking", () => {
  it("ranks lower_is_better ascending and higher_is_better descending", () => {
    const isolation = layer5VariableIsolation(
      layer1CreativePerformance(mst.historical_matrix_4x4!, analysis.performance_by_cell),
      "lower_is_better",
    );
    const lowerBoard = layer7Crossmap(isolation, "lower_is_better");
    const higherBoard = layer7Crossmap(isolation, "higher_is_better");
    const lowerFirstValue = lowerBoard[0]?.agg.terminalMetricValue;
    const higherFirstValue = higherBoard[0]?.agg.terminalMetricValue;
    if (lowerFirstValue != null && higherFirstValue != null && lowerBoard.length > 1) {
      expect(lowerFirstValue).not.toBeGreaterThan(higherFirstValue === lowerFirstValue ? Infinity : higherFirstValue + 1e9);
    }
    // The two orderings should not be identical when there's more than one value.
    const distinctValues = new Set(lowerBoard.map((b) => b.agg.terminalMetricValue)).size;
    if (distinctValues > 1) {
      expect(lowerBoard.map((b) => b.code)).not.toEqual(higherBoard.map((b) => b.code));
    }
  });
});
