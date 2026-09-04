// ─── The DNA view must not read a variable once per analysis run ──────────
//
// variable_performance keeps one row per run by design — schema.sql widened
// its unique key to include manual_analysis_run_id so re-running analysis
// accumulates history rather than destroying it, and RunScopePicker reads that
// history. The consequence is that v3_variable_performance is cumulative, and
// anything that groups it unscoped counts the same spend once per run.
//
// kpiBreakdown was fixed for this. AnalysisDnaView has its own read of the
// same array and was not: the route crawl caught it as duplicate React keys
// ("Encountered two children with the same key, `STAT`"), which is the same
// defect wearing a different hat — four rows for one token, four times its
// spend, and React dropping children because the keys collided.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scopeToRun } from "@/lib/run-supersede";

const seed = JSON.parse(
  fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../test-fixtures/metrix_seed_bundle.json",
    ),
    "utf-8",
  ),
) as { ad_accounts: any[] };

/** The account whose variable rows span more than one analysis run. */
function multiRunAccount() {
  for (const account of seed.ad_accounts) {
    const analysis = account.iap?.analysis;
    const rows = analysis?.v3_variable_performance ?? [];
    const runs = new Set(rows.map((r: any) => r.manual_analysis_run_id).filter(Boolean));
    if (runs.size > 1) return { id: account.id, analysis, rows, runs };
  }
  return null;
}

describe("creative DNA rows are scoped to one run", () => {
  it("the fixture still spans multiple runs. Otherwise this proves nothing", () => {
    const acct = multiRunAccount();
    expect(acct, "no fixture account has variable rows from more than one run").not.toBeNull();
    expect(acct!.runs.size).toBeGreaterThan(1);
  });

  it("the same variable appears once per run before scoping", () => {
    const acct = multiRunAccount()!;
    const seen = new Map<string, number>();
    for (const r of acct.rows) {
      const k = `${r.variable_family}:${r.variable_id}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    expect([...seen.values()].some((n) => n > 1), "no duplicated variable ids to scope away").toBe(true);
  });

  it("scoping leaves exactly one row per variable, and the real spend", () => {
    const acct = multiRunAccount()!;
    const scoped = scopeToRun(acct.rows, acct.analysis.latest_analysis_run_id ?? null);

    const counts = new Map<string, number>();
    for (const r of scoped) {
      const k = `${r.variable_family}:${r.variable_id}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const duplicated = [...counts.entries()].filter(([, n]) => n > 1);
    expect(duplicated.map(([k]) => k), "scoped rows still collide · React keys would too").toEqual([]);

    // Unscoped, the same token's spend is summed once per run.
    const token = acct.rows[0].variable_id as string;
    const unscopedSpend = acct.rows
      .filter((r: any) => r.variable_id === token)
      .reduce((s: number, r: any) => s + (r["Amount spent (USD)"] ?? 0), 0);
    const scopedSpend = scoped
      .filter((r: any) => r.variable_id === token)
      .reduce((s: number, r: any) => s + (r["Amount spent (USD)"] ?? 0), 0);
    expect(scopedSpend).toBeLessThan(unscopedSpend);
  });
});
