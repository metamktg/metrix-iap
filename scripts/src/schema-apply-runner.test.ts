import { describe, expect, it } from "vitest";
import { applySchemaStatements } from "./lib/schema-apply-runner.js";

/** A pg.Client stand-in that records every query and fails on cue. */
function fakeClient(failures: Record<string, Array<{ code?: string; message: string }>>) {
  const queries: string[] = [];
  const remaining = new Map(Object.entries(failures).map(([k, v]) => [k, [...v]]));
  const client = {
    async query(text: string) {
      queries.push(text);
      const queue = remaining.get(text);
      const next = queue?.shift();
      if (next) {
        const err = Object.assign(new Error(next.message), { code: next.code });
        throw err;
      }
      return { rows: [] };
    },
  };
  return { client: client as unknown as import("pg").Client, queries };
}

const noop = () => {};
const instant = async () => {};

describe("applySchemaStatements", () => {
  it("wraps every statement in its own transaction with lock and statement timeouts", async () => {
    const { client, queries } = fakeClient({});
    const r = await applySchemaStatements(client, ["create table a (id int)", "create index a_idx on a (id)"], { log: noop, warn: noop, sleep: instant });
    expect(r).toMatchObject({ statements: 2, retried: 0 });
    expect(queries).toEqual([
      "begin", "set local lock_timeout = '3s'", "set local statement_timeout = '10min'", "create table a (id int)", "commit",
      "begin", "set local lock_timeout = '3s'", "set local statement_timeout = '10min'", "create index a_idx on a (id)", "commit",
    ]);
  });

  it("retries the statement that lost its lock, rolling back first, and counts the retry", async () => {
    const { client, queries } = fakeClient({ "alter table a add column b int": [{ code: "55P03", message: "canceling statement due to lock timeout" }] });
    const warned: string[] = [];
    const r = await applySchemaStatements(client, ["alter table a add column b int"], { log: noop, warn: (l) => warned.push(l), sleep: instant });
    expect(r).toMatchObject({ statements: 1, retried: 1 });
    expect(queries.filter((q) => q === "rollback")).toHaveLength(1);
    expect(queries.filter((q) => q === "alter table a add column b int")).toHaveLength(2);
    expect(queries.filter((q) => q === "commit")).toHaveLength(1);
    expect(warned[0]).toMatch(/lost its lock \(55P03\), retry 1\/4/);
  });

  it("gives up after maxAttempts on a persistent lock failure, naming the statement", async () => {
    const { client } = fakeClient({ "alter table a add column b int": Array(3).fill({ code: "55P03", message: "lock" }) });
    await expect(applySchemaStatements(client, ["alter table a add column b int"], { maxAttempts: 3, log: noop, warn: noop, sleep: instant }))
      .rejects.toThrow(/Statement 1\/1 failed after 3 attempt\(s\): alter table a add column b int/);
  });

  it("fails fast on a real SQL error without retrying", async () => {
    const { client, queries } = fakeClient({ "create tabel a (id int)": [{ code: "42601", message: "syntax error at or near \"tabel\"" }] });
    await expect(applySchemaStatements(client, ["create tabel a (id int)"], { log: noop, warn: noop, sleep: instant }))
      .rejects.toThrow(/failed after 1 attempt\(s\).*\n\s+syntax error/);
    expect(queries.filter((q) => q === "create tabel a (id int)")).toHaveLength(1);
  });
});
