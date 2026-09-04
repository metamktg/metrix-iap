// The chunked-insert recovery (chunkedInsert.ts) on the failure that lost
// the Pure Path run of 2026-09-04: PostgREST killed one batch of 500 after
// 139 had landed, undici threw "TypeError: fetch failed", and the run
// failed at 88%. A batch is one statement, so counting the run's rows says
// whether it landed; the retry sends halves; a database error is final.
import { describe, expect, it } from "vitest";
import { insertChunkedWithRecovery, isRetryableInsertFailure, type ChunkedInsertClient } from "../chunkedInsert";

type Row = { n: number };
const rows = (count: number): Row[] => Array.from({ length: count }, (_, n) => ({ n }));

/** A fake table: `plan` decides what each insert attempt does, in order. */
function fakeClient(plan: Array<"ok" | "lost_before" | "lost_after" | { error: string; code?: string }>) {
  const stored: Row[] = [];
  const calls: { batch: number; outcome: string }[] = [];
  const client: ChunkedInsertClient = {
    async insert(_table, batch) {
      const step = plan.shift() ?? "ok";
      calls.push({ batch: batch.length, outcome: typeof step === "string" ? step : `error:${step.code ?? ""}` });
      if (step === "ok") {
        stored.push(...(batch as Row[]));
        return { error: null };
      }
      if (step === "lost_before") throw new TypeError("fetch failed");
      if (step === "lost_after") {
        stored.push(...(batch as Row[]));
        throw new TypeError("fetch failed");
      }
      return { error: { message: step.error, code: step.code ?? null } };
    },
    async countForRun() {
      return stored.length;
    },
  };
  return { client, stored, calls };
}
const noSleep = async () => {};

describe("insertChunkedWithRecovery", () => {
  it("sends the rows in chunks and reports what it inserted", async () => {
    const { client, stored, calls } = fakeClient([]);
    const res = await insertChunkedWithRecovery(client, "t", rows(1200), { runId: "r", chunk: 500, sleep: noSleep });
    expect(res).toEqual({ inserted: 1200, retried: 0, recovered: 0 });
    expect(stored).toHaveLength(1200);
    expect(calls.map((c) => c.batch)).toEqual([500, 500, 200]);
  });

  it("a batch lost before it applied is sent again in halves, and nothing is counted twice", async () => {
    const { client, stored, calls } = fakeClient(["ok", "lost_before"]);
    const res = await insertChunkedWithRecovery(client, "t", rows(1000), { runId: "r", chunk: 500, sleep: noSleep });
    expect(res).toEqual({ inserted: 1000, retried: 1, recovered: 0 });
    expect(stored.map((r) => r.n)).toEqual(rows(1000).map((r) => r.n));
    expect(calls.map((c) => c.batch)).toEqual([500, 500, 250, 250]);
  });

  it("a batch whose response was lost after it applied is recognised by the count and not sent again", async () => {
    const { client, stored, calls } = fakeClient(["lost_after", "ok"]);
    const res = await insertChunkedWithRecovery(client, "t", rows(700), { runId: "r", chunk: 500, sleep: noSleep });
    expect(res).toEqual({ inserted: 700, retried: 0, recovered: 1 });
    expect(stored).toHaveLength(700);
    expect(calls.map((c) => c.outcome)).toEqual(["lost_after", "ok"]);
  });

  it("counts against what the run already held in the table from an earlier call", async () => {
    const { client, stored } = fakeClient(["ok", "lost_after"]);
    stored.push(...rows(30)); // an earlier insertChunked call on the same table, same run
    const res = await insertChunkedWithRecovery(client, "t", rows(600), { runId: "r", chunk: 500, sleep: noSleep });
    expect(res).toEqual({ inserted: 600, retried: 0, recovered: 1 });
    expect(stored).toHaveLength(630);
  });

  it("gives up after the attempt budget and names the failure", async () => {
    const { client } = fakeClient(["lost_before", "lost_before", "lost_before", "lost_before"]);
    await expect(insertChunkedWithRecovery(client, "t", rows(10), { runId: "r", chunk: 10, maxAttempts: 2, sleep: noSleep })).rejects.toThrow(
      /Insert into t failed after 2 attempt\(s\): fetch failed/,
    );
  });

  it("a database error is final, never retried", async () => {
    const { client, calls } = fakeClient([{ error: 'duplicate key value violates unique constraint "x"', code: "23505" }]);
    await expect(insertChunkedWithRecovery(client, "t", rows(10), { runId: "r", sleep: noSleep })).rejects.toThrow(/duplicate key/);
    expect(calls).toHaveLength(1);
  });

  it("a statement the server cancelled (57014) is retried like a lost connection", async () => {
    const { client, stored } = fakeClient([{ error: "canceling statement due to statement timeout", code: "57014" }, "ok", "ok"]);
    const res = await insertChunkedWithRecovery(client, "t", rows(100), { runId: "r", chunk: 100, sleep: noSleep });
    expect(res).toEqual({ inserted: 100, retried: 1, recovered: 0 });
    expect(stored).toHaveLength(100);
  });

  it("refuses to retry blind when the count matches neither outcome", async () => {
    const { client, stored } = fakeClient(["lost_before"]);
    const original = client.countForRun;
    let counts = 0;
    client.countForRun = async (...args) => (await original(...args)) + (++counts > 1 ? 7 : 0); // something else wrote rows under this run id after the batch was sent
    await expect(insertChunkedWithRecovery(client, "t", rows(10), { runId: "r", chunk: 10, sleep: noSleep })).rejects.toThrow(/not retrying blind/);
    expect(stored).toHaveLength(0);
  });

  it("a table without a run id treats a duplicate-key error on the retry as the lost batch having landed", async () => {
    const dup = { error: "duplicate key value violates unique constraint", code: "23505" };
    const { client, calls, stored } = fakeClient(["lost_after", dup, dup]);
    const res = await insertChunkedWithRecovery(client, "signal", rows(20), { runId: "r", chunk: 20, runScoped: false, sleep: noSleep });
    expect(res).toEqual({ inserted: 20, retried: 1, recovered: 2 });
    // Both halves meet the conflict; neither is stored a second time.
    expect(calls.map((c) => c.batch)).toEqual([20, 10, 10]);
    expect(stored).toHaveLength(20);
  });

  it("backs off between attempts with the caller's clock", async () => {
    const waits: number[] = [];
    const { client } = fakeClient(["lost_before", "lost_before", "ok", "ok"]);
    await insertChunkedWithRecovery(client, "t", rows(4), { runId: "r", chunk: 4, sleep: async (ms) => { waits.push(ms); }, backoffMs: (a) => a * 100 });
    expect(waits).toEqual([100, 200]);
  });
});

describe("isRetryableInsertFailure", () => {
  it("names the network-level and cancelled-statement failures, and nothing else", () => {
    expect(isRetryableInsertFailure(new TypeError("fetch failed"))).toBe(true);
    expect(isRetryableInsertFailure({ message: "read ECONNRESET" })).toBe(true);
    expect(isRetryableInsertFailure({ message: "canceling statement due to statement timeout", code: "57014" })).toBe(true);
    expect(isRetryableInsertFailure({ message: "duplicate key value violates unique constraint", code: "23505" })).toBe(false);
    expect(isRetryableInsertFailure({ message: 'null value in column "x" violates not-null constraint', code: "23502" })).toBe(false);
    expect(isRetryableInsertFailure(new Error("Internal consistency check failed"))).toBe(false);
  });
});
