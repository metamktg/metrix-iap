// ─── Safe re-runs: the generation rules over an in-memory store ─────────
//
// Sweep spec §7.7, slice 2. The rules are exercised end to end over a fake
// table store: a run succeeds and is promoted, a re-run writes partial rows
// and fails, and the reader still sees the previous run; then two more
// successes push the first run past the two generations kept and only its
// ROLLUP rows go, its evidence rows stay. The store records every delete so
// the test can prove an evidence table is never named by the prune.

import { describe, expect, it } from "vitest";
import {
  EVIDENCE_TABLES,
  ROLLUP_GENERATION_TABLES,
  currentRunFilter,
  deleteRunOutputsWith,
  planRollupGenerations,
  pruneRollupGenerations,
  rowsOfCurrentRun,
  type RunGenerationClient,
} from "../runGenerations";

/** Every table a run writes under its id, as the module's private list has it. */
const RUN_OUTPUT_TABLES = [...ROLLUP_GENERATION_TABLES, ...EVIDENCE_TABLES] as const;

type StoredRow = { account_id: string; manual_analysis_run_id: string | null; key: string };

/** An in-memory store shaped like the output tables, with a run ledger and the pointer. */
function makeStore() {
  const tables = new Map<string, StoredRow[]>();
  for (const t of RUN_OUTPUT_TABLES) tables.set(t, []);
  const runs: { id: string; account_id: string; status: "success" | "error"; started_at: number }[] = [];
  const pointer = new Map<string, string | null>();
  const deletes: { table: string; accountId: string; runId: string }[] = [];
  let clock = 0;

  const client: RunGenerationClient = {
    async currentRunId(accountId) {
      return pointer.get(accountId) ?? null;
    },
    async successfulRunIds(accountId) {
      return runs
        .filter((r) => r.account_id === accountId && r.status === "success")
        .sort((a, b) => b.started_at - a.started_at)
        .map((r) => r.id);
    },
    async deleteRunRows(table, accountId, runId) {
      deletes.push({ table, accountId, runId });
      const rows = tables.get(table);
      if (!rows) throw new Error(`no such table ${table}`);
      const before = rows.length;
      const kept = rows.filter((r) => !(r.account_id === accountId && r.manual_analysis_run_id === runId));
      tables.set(table, kept);
      return before - kept.length;
    },
  };
  /** The engine's pointer swap, one statement in its Finalizing update. */
  const promote = async (accountId: string, runId: string) => {
    pointer.set(accountId, runId);
  };

  /** Writes one row per output table for a run, as the engine would. */
  const write = (accountId: string, runId: string | null, which: readonly string[] = RUN_OUTPUT_TABLES) => {
    for (const t of which) tables.get(t)!.push({ account_id: accountId, manual_analysis_run_id: runId, key: `${t}:${runId ?? "untagged"}` });
  };
  const startRun = (accountId: string, id: string) => {
    runs.push({ id, account_id: accountId, status: "error", started_at: ++clock });
  };
  const succeed = (id: string) => {
    runs.find((r) => r.id === id)!.status = "success";
  };
  const rowsOf = (table: string, runId: string | null) => tables.get(table)!.filter((r) => r.manual_analysis_run_id === runId);

  return { client, tables, pointer, deletes, write, startRun, succeed, rowsOf, promote };
}

describe("planRollupGenerations", () => {
  it("keeps the two newest successful runs and prunes the rest, in order", () => {
    expect(planRollupGenerations([])).toEqual({ keep: [], prune: [] });
    expect(planRollupGenerations(["a"])).toEqual({ keep: ["a"], prune: [] });
    expect(planRollupGenerations(["c", "b", "a"])).toEqual({ keep: ["c", "b"], prune: ["a"] });
    expect(planRollupGenerations(["d", "c", "b", "a"])).toEqual({ keep: ["d", "c"], prune: ["b", "a"] });
  });
  it("honours a different window and ignores blanks and repeats", () => {
    expect(planRollupGenerations(["c", "b", "a"], 1)).toEqual({ keep: ["c"], prune: ["b", "a"] });
    expect(planRollupGenerations(["c", "", "c", "b"], 2)).toEqual({ keep: ["c", "b"], prune: [] });
  });
});

describe("rowsOfCurrentRun and currentRunFilter", () => {
  const rows = [
    { manual_analysis_run_id: null, v: "untagged" },
    { manual_analysis_run_id: "cur", v: "current" },
    { manual_analysis_run_id: "prev", v: "previous" },
    { manual_analysis_run_id: "inflight", v: "in flight" },
  ];
  it("shows the current run's rows and every untagged row, nothing from other runs", () => {
    expect(rowsOfCurrentRun(rows, "cur").map((r) => r.v)).toEqual(["untagged", "current"]);
  });
  it("with no current run shows only the untagged rows: a run in flight or one that failed is never the account's data", () => {
    expect(rowsOfCurrentRun(rows, null).map((r) => r.v)).toEqual(["untagged"]);
  });
  it("renders the same rule as a PostgREST or-filter", () => {
    expect(currentRunFilter("cur")).toBe("manual_analysis_run_id.eq.cur,manual_analysis_run_id.is.null");
    expect(currentRunFilter(null)).toBe("manual_analysis_run_id.is.null");
  });
});

describe("the table lists", () => {
  it("keep the evidence tables out of the generation window and inside the failed-run cleanup", () => {
    for (const t of EVIDENCE_TABLES) expect(ROLLUP_GENERATION_TABLES as readonly string[]).not.toContain(t);
    const s = makeStore();
    s.write("a", "R");
    s.startRun("a", "R");
    // The cleanup names every output table, evidence included: a failed run's rows were partial.
    return deleteRunOutputsWith(s.client, "a", "R").then(() => {
      expect(new Set(s.deletes.map((d) => d.table))).toEqual(new Set(RUN_OUTPUT_TABLES));
    });
  });
});

describe("a deliberately failed re-run", () => {
  it("leaves the previous run readable and every run's evidence rows in place", async () => {
    const s = makeStore();
    const acct = "manual_x";

    // Run A succeeds: rows under A, the pointer swaps to A.
    s.startRun(acct, "A");
    s.write(acct, "A");
    s.succeed("A");
    await s.promote(acct, "A");
    expect(s.pointer.get(acct)).toBe("A");

    // Run B writes a few tables, then fails: only B's rows go.
    s.startRun(acct, "B");
    s.write(acct, "B", ["ad_performance", "demographic_performance", "ad_breakdown_performance"]);
    await deleteRunOutputsWith(s.client, acct, "B");
    expect(s.pointer.get(acct)).toBe("A");
    for (const t of RUN_OUTPUT_TABLES) {
      expect(s.rowsOf(t, "B")).toHaveLength(0);
      expect(s.rowsOf(t, "A")).toHaveLength(1);
    }
    // What a reader sees: A's rows, through the same rule the seed applies.
    const visible = rowsOfCurrentRun(s.tables.get("ad_performance")!, s.pointer.get(acct) ?? null);
    expect(visible.map((r) => r.key)).toEqual(["ad_performance:A"]);

    // Run C succeeds: two generations, nothing pruned.
    s.startRun(acct, "C");
    s.write(acct, "C");
    s.succeed("C");
    await s.promote(acct, "C");
    const first = await pruneRollupGenerations(s.client, acct);
    expect(first).toEqual({ kept: ["C", "A"], pruned: [], rows: 0 });
    expect(s.rowsOf("ad_performance", "A")).toHaveLength(1);

    // Run D succeeds: A falls out of the window. Its ROLLUP rows go, its
    // EVIDENCE rows stay, and the reader sees D.
    s.startRun(acct, "D");
    s.write(acct, "D");
    s.succeed("D");
    await s.promote(acct, "D");
    const second = await pruneRollupGenerations(s.client, acct);
    expect(second.kept).toEqual(["D", "C"]);
    expect(second.pruned).toEqual(["A"]);
    expect(second.rows).toBe(ROLLUP_GENERATION_TABLES.length);
    for (const t of ROLLUP_GENERATION_TABLES) expect(s.rowsOf(t, "A")).toHaveLength(0);
    for (const t of EVIDENCE_TABLES) expect(s.rowsOf(t, "A")).toHaveLength(1);
    for (const t of RUN_OUTPUT_TABLES) {
      expect(s.rowsOf(t, "C")).toHaveLength(1);
      expect(s.rowsOf(t, "D")).toHaveLength(1);
    }
    expect(rowsOfCurrentRun(s.tables.get("ad_performance")!, s.pointer.get(acct) ?? null).map((r) => r.key)).toEqual(["ad_performance:D"]);

    // The prune never named an evidence table, and never a null run id.
    const pruneDeletes = s.deletes.filter((d) => d.runId === "A");
    expect(new Set(pruneDeletes.map((d) => d.table))).toEqual(new Set(ROLLUP_GENERATION_TABLES));
    expect(s.deletes.every((d) => d.runId != null && d.runId !== "")).toBe(true);
  });

  it("never touches untagged rows or another account", async () => {
    const s = makeStore();
    s.write("manual_x", null);
    s.write("manual_y", "Y1");
    s.startRun("manual_y", "Y1");
    s.succeed("Y1");
    for (const id of ["X1", "X2", "X3"]) {
      s.startRun("manual_x", id);
      s.write("manual_x", id);
      s.succeed(id);
      await s.promote("manual_x", id);
    }
    const result = await pruneRollupGenerations(s.client, "manual_x");
    expect(result.pruned).toEqual(["X1"]);
    for (const t of ROLLUP_GENERATION_TABLES) {
      expect(s.rowsOf(t, null)).toHaveLength(1);
      expect(s.rowsOf(t, "Y1")).toHaveLength(1);
    }
    expect(s.deletes.every((d) => d.accountId === "manual_x")).toBe(true);
  });
});
