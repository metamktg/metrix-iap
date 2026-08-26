// Unit tests for the import row-count guard (import-guard.ts).
// All tests run against pure in-memory stubs — no Supabase connection needed.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ACCOUNT_SCOPED_TABLES,
  GENERATED_OUTPUT_TABLES,
  GLOBAL_TABLES,
  SKOV_PET_ID,
  type CountMap,
  type QueryFn,
  snapshotCounts,
  formatCountMap,
  applyPreFlightGuard,
  detectPostImportLoss,
  managedDeleteSql,
} from "./import-guard";

// ── Helpers ──────────────────────────────────────────────────────────────────

const MANAGED = ["bookster", "ecas"] as const;

/** Build a QueryFn stub that returns `count` for every query. */
function makeUniformQuery(count: number): QueryFn {
  return async (_text: string, _values?: unknown[]) => ({
    rows: [{ n: String(count) }],
  });
}

/**
 * Build a QueryFn stub keyed on the account_id parameter value.
 * Global queries (no $1) use `globalCount`.
 */
function makeAccountQuery(
  accountCounts: Record<string, number>,
  globalCount = 0,
): QueryFn {
  return async (_text: string, values?: unknown[]) => {
    const acct = values?.[0] as string | undefined;
    const n = acct !== undefined ? (accountCounts[acct] ?? 0) : globalCount;
    return { rows: [{ n: String(n) }] };
  };
}

// ── snapshotCounts ────────────────────────────────────────────────────────────

describe("snapshotCounts", () => {
  it("returns zero counts when the database is empty", async () => {
    const q = makeUniformQuery(0);
    const counts = await snapshotCounts(q, MANAGED, SKOV_PET_ID);
    // Every entry should be 0.
    for (const v of counts.values()) expect(v).toBe(0);
    // Should have an entry for every table × every account, plus global tables
    // and the signal_cards:global sentinel.
    const expectedKeys =
      ACCOUNT_SCOPED_TABLES.length * MANAGED.length + // per-account entries
      1 + // account_modules:skov_pet
      GLOBAL_TABLES.length + // global tables
      1; // signal_cards:global
    expect(counts.size).toBe(expectedKeys);
  });

  it("captures non-zero counts for a specific account", async () => {
    const q = makeAccountQuery({ bookster: 42, ecas: 0, skov_pet: 0 }, 0);
    const counts = await snapshotCounts(q, MANAGED, SKOV_PET_ID);
    expect(counts.get("ad_performance:bookster")).toBe(42);
    expect(counts.get("ad_performance:ecas")).toBe(0);
  });

  it("captures global table counts", async () => {
    // All account-scoped queries → 0, global queries → 7
    const q: QueryFn = async (text, values) => {
      if (values && values.length > 0) return { rows: [{ n: "0" }] };
      return { rows: [{ n: "7" }] };
    };
    const counts = await snapshotCounts(q, MANAGED, SKOV_PET_ID);
    expect(counts.get("variable_registry")).toBe(7);
    expect(counts.get("app_config")).toBe(7);
    expect(counts.get("signal_cards:global")).toBe(7);
  });
});

// ── formatCountMap ────────────────────────────────────────────────────────────

describe("formatCountMap", () => {
  it("returns empty string when no entries match the filter", () => {
    const counts: CountMap = new Map([
      ["table_a:acct1", 0],
      ["table_b:acct1", 0],
    ]);
    expect(formatCountMap(counts, (n) => n > 0)).toBe("");
  });

  it("returns only the matching entries", () => {
    const counts: CountMap = new Map([
      ["ad_performance:bookster", 5],
      ["ads:bookster", 0],
      ["iap_runs:bookster", 3],
    ]);
    const result = formatCountMap(counts, (n) => n > 0);
    expect(result).toContain("ad_performance:bookster: 5");
    expect(result).toContain("iap_runs:bookster: 3");
    expect(result).not.toContain("ads:bookster");
  });
});

// ── applyPreFlightGuard ───────────────────────────────────────────────────────

describe("applyPreFlightGuard", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((_code?: number | string) => {
      throw new Error(`process.exit(${_code})`);
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it("does nothing when all tables are empty (first-run case)", () => {
    const counts: CountMap = new Map([
      ["ad_performance:bookster", 0],
      ["variable_registry", 0],
    ]);
    // Should not throw and should not warn.
    expect(() => applyPreFlightGuard(counts, false)).not.toThrow();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("throws an error when tables have data and --force is not set", () => {
    const counts: CountMap = new Map([
      ["ad_performance:bookster", 12],
      ["ads:bookster", 5],
      ["variable_registry", 0],
    ]);
    expect(() => applyPreFlightGuard(counts, false)).toThrow(
      /Import aborted: managed account tables already contain data/,
    );
  });

  it("includes the --force hint in the thrown error message", () => {
    const counts: CountMap = new Map([["ad_performance:ecas", 3]]);
    let message = "";
    try {
      applyPreFlightGuard(counts, false);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("--force");
    expect(message).toContain("import:metrix");
  });

  it("does NOT throw when --force is set, even with existing data", () => {
    const counts: CountMap = new Map([
      ["ad_performance:bookster", 50],
      ["iap_runs:bookster", 6],
    ]);
    expect(() => applyPreFlightGuard(counts, true)).not.toThrow();
  });

  it("emits a console.warn when --force overrides existing data", () => {
    const counts: CountMap = new Map([["ad_performance:bookster", 10]]);
    applyPreFlightGuard(counts, true);
    expect(console.warn).toHaveBeenCalledOnce();
    const warnMsg = (console.warn as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(warnMsg).toContain("--force passed");
    expect(warnMsg).toContain("ad_performance:bookster: 10");
  });

  it("lists all non-zero tables in the warning when --force is set", () => {
    const counts: CountMap = new Map([
      ["ad_performance:bookster", 10],
      ["ads:bookster", 4],
      ["variable_registry", 0],
    ]);
    applyPreFlightGuard(counts, true);
    const warnMsg = (console.warn as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(warnMsg).toContain("ad_performance:bookster: 10");
    expect(warnMsg).toContain("ads:bookster: 4");
    expect(warnMsg).not.toContain("variable_registry");
  });

  it("lists all non-zero tables in the thrown error when !force", () => {
    const counts: CountMap = new Map([
      ["ad_performance:bookster", 8],
      ["iap_runs:ecas", 2],
      ["library_cells:bookster", 0],
    ]);
    let message = "";
    try {
      applyPreFlightGuard(counts, false);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain("ad_performance:bookster: 8");
    expect(message).toContain("iap_runs:ecas: 2");
    expect(message).not.toContain("library_cells:bookster");
  });
});

// ── detectPostImportLoss ──────────────────────────────────────────────────────

describe("detectPostImportLoss", () => {
  it("returns empty arrays when all counts stayed the same or grew", () => {
    const pre: CountMap = new Map([
      ["ad_performance:bookster", 10],
      ["variable_registry", 5],
    ]);
    const post: CountMap = new Map([
      ["ad_performance:bookster", 10],
      ["variable_registry", 6],
    ]);
    const critical = ["ad_performance:bookster", "variable_registry"];
    const { losses, zeros } = detectPostImportLoss(pre, post, critical);
    expect(losses).toHaveLength(0);
    expect(zeros).toHaveLength(0);
  });

  it("reports a loss when a table ends with fewer rows than before", () => {
    const pre: CountMap = new Map([
      ["ad_performance:bookster", 20],
      ["ads:bookster", 10],
    ]);
    const post: CountMap = new Map([
      ["ad_performance:bookster", 15], // lost 5
      ["ads:bookster", 10],
    ]);
    const { losses, zeros } = detectPostImportLoss(pre, post, []);
    expect(losses).toHaveLength(1);
    expect(losses[0]).toContain("ad_performance:bookster");
    expect(losses[0]).toContain("20 → 15");
    expect(losses[0]).toContain("lost 5");
    expect(zeros).toHaveLength(0);
  });

  it("does not report a loss when a previously-zero table stays zero", () => {
    // Only rows that existed before (pre > 0) and are now fewer count as a loss.
    const pre: CountMap = new Map([["ad_performance:ecas", 0]]);
    const post: CountMap = new Map([["ad_performance:ecas", 0]]);
    const { losses } = detectPostImportLoss(pre, post, []);
    expect(losses).toHaveLength(0);
  });

  it("reports a zero when a critical key has 0 rows in the post snapshot", () => {
    const pre: CountMap = new Map([["ad_performance:bookster", 0]]);
    const post: CountMap = new Map([["ad_performance:bookster", 0]]);
    const critical = ["ad_performance:bookster"];
    const { zeros } = detectPostImportLoss(pre, post, critical);
    expect(zeros).toHaveLength(1);
    expect(zeros[0]).toContain("ad_performance:bookster");
    expect(zeros[0]).toContain("0 rows (expected > 0)");
  });

  it("reports zeros for critical keys missing entirely from postCounts", () => {
    const pre: CountMap = new Map();
    const post: CountMap = new Map();
    const critical = ["variable_registry", "app_config"];
    const { zeros } = detectPostImportLoss(pre, post, critical);
    expect(zeros).toHaveLength(2);
  });

  it("can report both losses and zeros at the same time", () => {
    const pre: CountMap = new Map([
      ["ad_performance:bookster", 10],
      ["iap_runs:bookster", 0],
    ]);
    const post: CountMap = new Map([
      ["ad_performance:bookster", 5], // lost 5
      ["iap_runs:bookster", 0],       // still zero — but it's critical
    ]);
    const critical = ["ad_performance:bookster", "iap_runs:bookster"];
    const { losses, zeros } = detectPostImportLoss(pre, post, critical);
    expect(losses).toHaveLength(1);
    expect(losses[0]).toContain("ad_performance:bookster");
    expect(zeros).toHaveLength(1);
    expect(zeros[0]).toContain("iap_runs:bookster");
  });

  it("correctly computes the quantity lost in the loss message", () => {
    const pre: CountMap = new Map([["copy_library:ecas", 100]]);
    const post: CountMap = new Map([["copy_library:ecas", 37]]);
    const { losses } = detectPostImportLoss(pre, post, []);
    expect(losses[0]).toContain("lost 63 rows");
  });

  it("handles a key that is present in pre but absent from post (treat as 0)", () => {
    const pre: CountMap = new Map([["demographic_performance:bookster", 8]]);
    const post: CountMap = new Map(); // key gone entirely → treat as 0
    const { losses } = detectPostImportLoss(pre, post, []);
    expect(losses).toHaveLength(1);
    expect(losses[0]).toContain("8 → 0");
  });
});

// ── Integration: guard fires → caller exits with code 1 ──────────────────────

describe("guard fires → caller exits(1) integration", () => {
  afterEach(() => vi.restoreAllMocks());

  it("simulates the main() pattern: guard throws, catch calls process.exit(1)", () => {
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((_code?: number | string) => undefined as never);

    const counts: CountMap = new Map([["ad_performance:bookster", 5]]);

    // Reproduce the main() pattern: guard throws → catch → process.exit(1).
    try {
      applyPreFlightGuard(counts, false /* no --force */);
    } catch (_err) {
      process.exit(1);
    }

    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("simulates the main() pattern: guard passes with --force, no exit", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((_code?: number | string) => undefined as never);

    const counts: CountMap = new Map([["ad_performance:bookster", 5]]);

    try {
      applyPreFlightGuard(counts, true /* --force */);
    } catch (_err) {
      process.exit(1);
    }

    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("simulates the post-import pattern: loss detected → process.exitCode = 1", () => {
    const pre: CountMap = new Map([["ad_performance:bookster", 20]]);
    const post: CountMap = new Map([["ad_performance:bookster", 10]]);

    const originalExitCode = process.exitCode;
    process.exitCode = 0;

    const { losses, zeros } = detectPostImportLoss(pre, post, []);
    if (losses.length > 0 || zeros.length > 0) {
      process.exitCode = 1;
    }

    expect(process.exitCode).toBe(1);

    // Restore
    process.exitCode = originalExitCode;
  });

  it("simulates the post-import pattern: no loss → process.exitCode stays 0", () => {
    const pre: CountMap = new Map([["ad_performance:bookster", 10]]);
    const post: CountMap = new Map([["ad_performance:bookster", 10]]);
    const critical = ["ad_performance:bookster"];

    const originalExitCode = process.exitCode;
    process.exitCode = 0;

    const { losses, zeros } = detectPostImportLoss(pre, post, critical);
    if (losses.length > 0 || zeros.length > 0) {
      process.exitCode = 1;
    }

    expect(process.exitCode).toBe(0);

    // Restore
    process.exitCode = originalExitCode;
  });
});

// ── The importer must not destroy in-app generated output ───────────────────
//
// Four tables hold both imported rows and generated ones (source column). The
// importer clears its managed accounts and re-inserts the imported half; an
// unqualified delete therefore destroyed every generated strategy and brief
// set for `bookster` and `ecas`. Observed live before this was fixed:
// `bookster` held 16 generated briefs with ZERO generated pillars, and `ecas`
// a successful strategy run with no surviving output at all.

describe("managedDeleteSql", () => {
  it("narrows the delete to imported rows on every generated-output table", () => {
    for (const table of GENERATED_OUTPUT_TABLES) {
      expect(managedDeleteSql(table)).toBe(
        `delete from ${table} where account_id = any($1) and source = 'imported'`,
      );
    }
  });

  it("leaves tables the importer fully owns cleared wholesale", () => {
    for (const table of ["ad_performance", "ads", "signal_cards", "iap_runs"]) {
      const sql = managedDeleteSql(table);
      expect(sql).toBe(`delete from ${table} where account_id = any($1)`);
      expect(sql).not.toContain("source");
    }
  });

  it("spares generated rows on every account-scoped table that has a source column", () => {
    // The guard is only as good as its table list. Read the real schema and
    // require that every account-scoped table carrying a `source` column is
    // registered — otherwise a table added later is silently wiped again.
    const here = dirname(fileURLToPath(import.meta.url));
    const schema = readFileSync(join(here, "schema.sql"), "utf8");
    const withSource = new Set(
      [...schema.matchAll(/alter table (\w+) add column if not exists source\b/g)].map((m) => m[1]),
    );
    const accountScoped = new Set<string>(ACCOUNT_SCOPED_TABLES);
    const shouldBeGuarded = [...withSource].filter((t) => accountScoped.has(t)).sort();

    expect(shouldBeGuarded.length).toBeGreaterThan(0);
    expect([...GENERATED_OUTPUT_TABLES].sort()).toEqual(shouldBeGuarded);
  });
});
