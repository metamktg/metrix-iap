// The modelled tier's balancing function — deterministic, direct cells
// preserved, structural zeros respected, convergence error exposed. Nothing
// in the engine emits its output yet (spec §19).
import { describe, expect, it } from "vitest";
import { balanceMatrix, cellKey } from "../balanceMatrix";

describe("balanceMatrix", () => {
  it("fits free cells to both margins and preserves direct observations exactly", () => {
    const rows = ["18-24", "25-34"];
    const cols = ["textA", "textB"];
    const direct = new Map([[cellKey("18-24", "textA"), 10]]);
    const rowMargins = new Map([["18-24", 40], ["25-34", 60]]);
    const colMargins = new Map([["textA", 50], ["textB", 50]]);
    const r = balanceMatrix({ rows, cols, direct, rowMargins, colMargins });
    expect(r.converged).toBe(true);
    expect(r.cells.get(cellKey("18-24", "textA"))).toEqual({ value: 10, direct: true });
    const rowSum = (row: string) => cols.reduce((s, c) => s + r.cells.get(cellKey(row, c))!.value, 0);
    const colSum = (col: string) => rows.reduce((s, x) => s + r.cells.get(cellKey(x, col))!.value, 0);
    expect(rowSum("18-24")).toBeCloseTo(40, 6);
    expect(rowSum("25-34")).toBeCloseTo(60, 6);
    expect(colSum("textA")).toBeCloseTo(50, 6);
    expect(colSum("textB")).toBeCloseTo(50, 6);
    expect(r.cells.get(cellKey("25-34", "textB"))!.direct).toBe(false);
  });

  it("is deterministic", () => {
    const input = {
      rows: ["a", "b", "c"],
      cols: ["x", "y"],
      direct: new Map([[cellKey("a", "x"), 5]]),
      rowMargins: new Map([["a", 20], ["b", 30], ["c", 50]]),
      colMargins: new Map([["x", 45], ["y", 55]]),
    };
    const one = balanceMatrix(input);
    const two = balanceMatrix(input);
    expect([...one.cells.entries()]).toEqual([...two.cells.entries()]);
    expect(one.iterations).toBe(two.iterations);
  });

  it("keeps structural zeros at zero and gives them no residual", () => {
    const r = balanceMatrix({
      rows: ["a", "b"],
      cols: ["x", "y"],
      direct: new Map(),
      rowMargins: new Map([["a", 10], ["b", 20]]),
      colMargins: new Map([["x", 20], ["y", 10]]),
      structuralZeros: new Set([cellKey("a", "y")]),
    });
    expect(r.cells.get(cellKey("a", "y"))!.value).toBe(0);
    expect(r.cells.get(cellKey("a", "x"))!.value).toBeCloseTo(10, 6);
    expect(r.cells.get(cellKey("b", "x"))!.value).toBeCloseTo(10, 6);
    expect(r.cells.get(cellKey("b", "y"))!.value).toBeCloseTo(10, 6);
  });

  it("reports a margin already exceeded by direct cells instead of hiding it", () => {
    const r = balanceMatrix({
      rows: ["a"],
      cols: ["x", "y"],
      direct: new Map([[cellKey("a", "x"), 15]]),
      rowMargins: new Map([["a", 10]]),
      colMargins: new Map([["x", 15], ["y", 0]]),
    });
    expect(r.exceededMargins).toContain("row:a");
    expect(r.cells.get(cellKey("a", "x"))!.value).toBe(15);
  });

  it("exposes a non-zero convergence error when the margins are inconsistent", () => {
    const r = balanceMatrix({
      rows: ["a", "b"],
      cols: ["x", "y"],
      direct: new Map(),
      rowMargins: new Map([["a", 10], ["b", 10]]),
      colMargins: new Map([["x", 30], ["y", 30]]),
      maxIterations: 5,
    });
    expect(r.converged).toBe(false);
    expect(r.convergenceError).toBeGreaterThan(0);
    expect(r.iterations).toBe(5);
  });
});
