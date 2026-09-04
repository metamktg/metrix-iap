// Pure helpers behind apply-supabase-schema.ts. Kept free of pg so the
// splitter and the apply decision can be unit-tested without a database.
//
// Why this module exists (2026-09-04): the applier used to send the whole
// schema.sql as ONE simple-query string. Postgres runs a multi-statement
// simple query inside one implicit transaction, so every ACCESS EXCLUSIVE
// lock the script takes (about eighty `alter table … add column if not
// exists`, which lock even when the column exists) was held until the last
// statement finished. Behind one long PostgREST read the DDL waited, and
// every app read then queued behind the DDL: 150 "canceling statement due
// to lock timeout" cancels over 45 minutes, three times in one morning,
// because the Replit post-merge hook runs the applier on every merge.
//
// The fix is shape, not tuning: one statement per transaction, a short
// lock_timeout so the app's readers never wait more than a few seconds on
// us, retries for the statement that lost the lock, and a fingerprint so an
// unchanged schema is not applied at all.

import { createHash } from "node:crypto";

/**
 * Split a SQL script into top-level statements. Understands dollar-quoted
 * bodies (`$$ … $$`, `$tag$ … $tag$`), single-quoted strings, and both
 * comment styles, so a `;` inside a `do $$ … $$` block or a comment never
 * ends a statement. Returns trimmed statements without their terminating
 * semicolon; comment-only fragments are dropped.
 */
export function splitSqlStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = "";
  let i = 0;
  const n = sql.length;
  let dollarTag: string | null = null;
  while (i < n) {
    const ch = sql[i]!;
    const next = sql[i + 1];
    if (dollarTag !== null) {
      if (sql.startsWith(dollarTag, i)) {
        buf += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
      } else {
        buf += ch;
        i++;
      }
      continue;
    }
    // Line comment: keep it out of the statement text entirely.
    if (ch === "-" && next === "-") {
      const end = sql.indexOf("\n", i);
      i = end === -1 ? n : end;
      continue;
    }
    // Block comment.
    if (ch === "/" && next === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    // Single-quoted string (with '' escapes).
    if (ch === "'") {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; }
        if (sql[j] === "'") break;
        j++;
      }
      buf += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    // Dollar quote opener: $$ or $tag$ where tag is an identifier.
    if (ch === "$") {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i, i + 64));
      if (m) {
        dollarTag = m[0];
        buf += dollarTag;
        i += dollarTag.length;
        continue;
      }
    }
    if (ch === ";") {
      const stmt = buf.trim();
      if (stmt.length > 0) out.push(stmt);
      buf = "";
      i++;
      continue;
    }
    buf += ch;
    i++;
  }
  const tail = buf.trim();
  if (tail.length > 0) out.push(tail);
  return out;
}

/** Stable fingerprint of the schema text (whitespace-insensitive at line ends). */
export function schemaFingerprint(sql: string): string {
  const normalised = sql.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n");
  return createHash("sha256").update(normalised).digest("hex");
}

export type ApplyDecision =
  | { action: "skip"; reason: "unchanged" }
  | { action: "apply"; reason: "changed" | "never-applied" | "forced" };

/**
 * Whether the schema needs applying. `applied` is the fingerprint the
 * database recorded on its last successful apply (null when never).
 */
export function decideApply(current: string, applied: string | null, force = false): ApplyDecision {
  if (force) return { action: "apply", reason: "forced" };
  if (applied === null) return { action: "apply", reason: "never-applied" };
  if (applied === current) return { action: "skip", reason: "unchanged" };
  return { action: "apply", reason: "changed" };
}

/** Postgres SQLSTATEs that mean "lost a lock race, try again", not "wrong". */
export const RETRYABLE_SQLSTATES = new Set([
  "55P03", // lock_not_available (lock_timeout)
  "40P01", // deadlock_detected
  "57014", // query_canceled (statement_timeout)
]);

export function isRetryableSqlError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" && RETRYABLE_SQLSTATES.has(code);
}

/** Exponential backoff with jitter, capped: 2 s, 4 s, 8 s … ≤ 30 s. */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(30_000, 2_000 * 2 ** Math.max(0, attempt - 1));
  return Math.round(base * (0.75 + random() * 0.5));
}

/** A one-line label for a statement, for the log. */
export function describeStatement(stmt: string): string {
  const head = stmt.replace(/\s+/g, " ").trim();
  return head.length > 96 ? `${head.slice(0, 95)}…` : head;
}
