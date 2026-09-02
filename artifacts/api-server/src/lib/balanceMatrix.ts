// Modelled tier — constrained matrix balancing (iterative proportional
// fitting) behind a deterministic, tested interface. NOTHING in the engine
// emits its output yet: this is the phase-2 contract from
// docs/specs/iap-multi-report-reconciliation.md §19, shipped so the schema
// (`modelled_share`, the `modelled` evidence state) and the function agree
// before anything is wired.
//
// Contract: direct observations are never altered; both margins are trusted
// and compatible; structural zeros stay zero; every emitted free cell is
// `modelled`; the convergence error is returned, never hidden.

export interface BalanceInput {
  rows: readonly string[];
  cols: readonly string[];
  /** Directly observed cells — preserved exactly. */
  direct: ReadonlyMap<string, number>;
  /** Trusted row margins (e.g. demographic margin per segment). */
  rowMargins: ReadonlyMap<string, number>;
  /** Trusted column margins (e.g. asset margin per instance). */
  colMargins: ReadonlyMap<string, number>;
  /** Impossible combinations — stay 0 and take no residual. */
  structuralZeros?: ReadonlySet<string>;
  maxIterations?: number;
  tolerance?: number;
}

export interface BalancedCell {
  value: number;
  direct: boolean;
}

export interface BalanceResult {
  cells: Map<string, BalancedCell>;
  /** Max relative deviation between fitted and trusted margins at the last iteration. */
  convergenceError: number;
  iterations: number;
  converged: boolean;
  /** Margins that were already exceeded by direct cells before fitting — a data conflict, reported not hidden. */
  exceededMargins: string[];
}

export const cellKey = (row: string, col: string): string => `${row}${col}`;

export function balanceMatrix(input: BalanceInput): BalanceResult {
  const zeros = input.structuralZeros ?? new Set<string>();
  const maxIterations = input.maxIterations ?? 500;
  const tolerance = input.tolerance ?? 1e-10;
  const cells = new Map<string, BalancedCell>();
  const exceeded: string[] = [];

  // Residual margins after the direct cells are removed.
  const rowResidual = new Map<string, number>();
  const colResidual = new Map<string, number>();
  for (const r of input.rows) rowResidual.set(r, input.rowMargins.get(r) ?? 0);
  for (const c of input.cols) colResidual.set(c, input.colMargins.get(c) ?? 0);
  const free: { row: string; col: string; key: string }[] = [];
  for (const r of input.rows) {
    for (const c of input.cols) {
      const key = cellKey(r, c);
      const direct = input.direct.get(key);
      if (direct !== undefined) {
        cells.set(key, { value: direct, direct: true });
        rowResidual.set(r, rowResidual.get(r)! - direct);
        colResidual.set(c, colResidual.get(c)! - direct);
      } else if (zeros.has(key)) {
        cells.set(key, { value: 0, direct: false });
      } else {
        free.push({ row: r, col: c, key });
      }
    }
  }
  for (const [r, v] of rowResidual) {
    if (v < -1e-9) {
      exceeded.push(`row:${r}`);
      rowResidual.set(r, 0);
    }
  }
  for (const [c, v] of colResidual) {
    if (v < -1e-9) {
      exceeded.push(`col:${c}`);
      colResidual.set(c, 0);
    }
  }

  // Seed free cells uniformly, then alternate row / column scaling.
  const value = new Map<string, number>(free.map((f) => [f.key, 1]));
  let error = Number.POSITIVE_INFINITY;
  let iterations = 0;
  const freeByRow = new Map<string, typeof free>();
  const freeByCol = new Map<string, typeof free>();
  for (const f of free) {
    (freeByRow.get(f.row) ?? freeByRow.set(f.row, []).get(f.row)!).push(f);
    (freeByCol.get(f.col) ?? freeByCol.set(f.col, []).get(f.col)!).push(f);
  }
  while (iterations < maxIterations) {
    iterations += 1;
    for (const [r, fs] of freeByRow) {
      const target = rowResidual.get(r)!;
      const sum = fs.reduce((s, f) => s + value.get(f.key)!, 0);
      const factor = sum > 0 ? target / sum : 0;
      for (const f of fs) value.set(f.key, value.get(f.key)! * factor);
    }
    error = 0;
    for (const [c, fs] of freeByCol) {
      const target = colResidual.get(c)!;
      const sum = fs.reduce((s, f) => s + value.get(f.key)!, 0);
      const deviation = target > 0 ? Math.abs(sum - target) / target : sum > 0 ? 1 : 0;
      if (deviation > error) error = deviation;
      const factor = sum > 0 ? target / sum : 0;
      for (const f of fs) value.set(f.key, value.get(f.key)! * factor);
    }
    if (error <= tolerance) break;
  }
  for (const f of free) cells.set(f.key, { value: value.get(f.key)!, direct: false });
  return { cells, convergenceError: error, iterations, converged: error <= tolerance, exceededMargins: exceeded };
}
