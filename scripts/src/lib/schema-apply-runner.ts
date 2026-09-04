// The pg-bound half of the schema applier: one statement per transaction,
// a short lock_timeout so app readers never queue behind DDL for long, and
// retries for the statement that lost a lock race. Shared by
// apply-supabase-schema.ts (post-merge) and the importer's schema step, so
// neither can regress to the one-shot multi-statement query that convoyed
// production reads on 2026-09-04 (see lib/schema-apply.ts for the story).

import type pg from "pg";
import { backoffMs, describeStatement, isRetryableSqlError } from "./schema-apply.js";

export interface ApplyOptions {
  lockTimeout?: string;
  statementTimeout?: string;
  maxAttempts?: number;
  /** Statements slower than this are logged with their duration. */
  slowMs?: number;
  log?: (line: string) => void;
  warn?: (line: string) => void;
  sleep?: (ms: number) => Promise<void>;
}

export interface ApplyResult {
  statements: number;
  retried: number;
  ms: number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function applySchemaStatements(
  client: pg.Client,
  statements: readonly string[],
  opts: ApplyOptions = {},
): Promise<ApplyResult> {
  const lockTimeout = opts.lockTimeout ?? "3s";
  const statementTimeout = opts.statementTimeout ?? "10min";
  const maxAttempts = opts.maxAttempts ?? 5;
  const slowMs = opts.slowMs ?? 2000;
  const log = opts.log ?? ((l) => console.log(l));
  const warn = opts.warn ?? ((l) => console.warn(l));
  const sleep = opts.sleep ?? defaultSleep;

  const started = Date.now();
  let retried = 0;
  for (const [i, stmt] of statements.entries()) {
    const before = Date.now();
    for (let attempt = 1; ; attempt++) {
      try {
        // One round trip per statement: the simple-query protocol runs a
        // multi-statement string in order, so begin / set local / the
        // statement / commit travel together. Five round trips through the
        // pooler cost ~0.4 s per statement on 2026-09-04, and 242 statements
        // plus one slow backfill ran past the post-merge hook's 150 s cap
        // before the fingerprint could be recorded.
        await client.query(
          `begin;\nset local lock_timeout = '${lockTimeout}';\nset local statement_timeout = '${statementTimeout}';\n${stmt};\ncommit;`,
        );
        break;
      } catch (err) {
        try {
          await client.query("rollback");
        } catch {
          /* the connection may be gone; the throw below reports it */
        }
        if (isRetryableSqlError(err) && attempt < maxAttempts) {
          const wait = backoffMs(attempt);
          retried++;
          warn(
            `  ~ statement ${i + 1}/${statements.length} lost its lock (${(err as { code?: string }).code}), ` +
              `retry ${attempt}/${maxAttempts - 1} in ${Math.round(wait / 1000)} s: ${describeStatement(stmt)}`,
          );
          await sleep(wait);
          continue;
        }
        throw new Error(
          `Statement ${i + 1}/${statements.length} failed after ${attempt} attempt(s): ${describeStatement(stmt)}\n` +
            `  ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    const ms = Date.now() - before;
    if (ms > slowMs) log(`  · ${ms} ms  ${describeStatement(stmt)}`);
  }
  return { statements: statements.length, retried, ms: Date.now() - started };
}
