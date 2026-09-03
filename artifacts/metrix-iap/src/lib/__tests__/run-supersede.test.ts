// ─── Run scoping keeps untagged history and drops nothing else ────────

import { describe, it, expect } from "vitest";
import { scopeToRun, supersededCount, spansMultipleRuns } from "../run-supersede";

const row = (id: string | null, spend: number) => ({ manual_analysis_run_id: id, spend });

describe("scopeToRun", () => {
  it("keeps only the named run's rows", () => {
    const rows = [row("r1", 1000), row("r2", 1000)];
    expect(scopeToRun(rows, "r2").map((r) => r.spend)).toEqual([1000]);
  });

  it("keeps untagged rows alongside the scoped run", () => {
    // schema.sql: "Null rows must always be included regardless of which
    // run(s) are selected — never silently dropped." They are pre-migration
    // measurements that are real and belong to no run.
    const rows = [row(null, 500), row("r1", 1000), row("r2", 1000)];
    expect(scopeToRun(rows, "r2").map((r) => r.spend)).toEqual([500, 1000]);
  });

  it("returns everything when no run has succeeded", () => {
    const rows = [row(null, 500), row(null, 300)];
    expect(scopeToRun(rows, null)).toHaveLength(2);
  });

  it("fixes the double count it exists for", () => {
    const rows = [row("r1", 1000), row("r2", 1000), row("r3", 1000)];
    const unscoped = rows.reduce((s, r) => s + r.spend, 0);
    const scoped = scopeToRun(rows, "r3").reduce((s, r) => s + r.spend, 0);
    expect(unscoped).toBe(3000);
    expect(scoped).toBe(1000);
  });
});

describe("supersededCount", () => {
  it("counts what scoping removed, so a falling total can say why", () => {
    expect(supersededCount([row("r1", 1), row("r2", 1), row(null, 1)], "r2")).toBe(1);
  });

  it("is zero when there is nothing to scope to", () => {
    expect(supersededCount([row("r1", 1), row("r2", 1)], null)).toBe(0);
  });
});

describe("spansMultipleRuns", () => {
  it("is false for one run", () => {
    expect(spansMultipleRuns([row("r1", 1), row("r1", 1), row(null, 1)])).toBe(false);
  });
  it("is true for two", () => {
    expect(spansMultipleRuns([row("r1", 1), row("r2", 1)])).toBe(true);
  });
  it("is false for untagged-only rows. Nothing to disambiguate", () => {
    expect(spansMultipleRuns([row(null, 1), row(null, 1)])).toBe(false);
  });
});
