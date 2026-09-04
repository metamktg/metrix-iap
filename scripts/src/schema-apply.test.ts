import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  backoffMs,
  decideApply,
  describeStatement,
  isRetryableSqlError,
  schemaFingerprint,
  splitSqlStatements,
} from "./lib/schema-apply.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("splitSqlStatements", () => {
  it("splits on top-level semicolons and drops comments", () => {
    const sql = `-- leading comment;\ncreate table a (id int); /* block; comment */\ncreate index if not exists a_idx on a (id);\n`;
    expect(splitSqlStatements(sql)).toEqual([
      "create table a (id int)",
      "create index if not exists a_idx on a (id)",
    ]);
  });

  it("keeps semicolons inside dollar-quoted bodies and strings", () => {
    const sql = `do $$ begin if not exists (select 1) then raise notice 'a;b'; end if; end $$;\nselect 'x;y';\ncreate function f() returns int language plpgsql as $body$ begin return 1; end $body$;`;
    const stmts = splitSqlStatements(sql);
    expect(stmts).toHaveLength(3);
    expect(stmts[0]).toMatch(/^do \$\$ begin .* end \$\$$/);
    expect(stmts[1]).toBe("select 'x;y'");
    expect(stmts[2]).toMatch(/\$body\$ begin return 1; end \$body\$$/);
  });

  it("splits the real schema.sql into one statement per DDL, none empty, dollar blocks intact", () => {
    const schema = readFileSync(join(here, "metrix-supabase/schema.sql"), "utf8");
    const stmts = splitSqlStatements(schema);
    expect(stmts.length).toBeGreaterThan(200);
    for (const s of stmts) {
      expect(s.trim().length).toBeGreaterThan(0);
      const opens = (s.match(/\$\$/g) ?? []).length;
      expect(opens % 2).toBe(0);
    }
    // Every `do $$` block is one statement, never split at its inner semicolons.
    const doBlocks = stmts.filter((s) => /^do\s+\$\$/i.test(s));
    expect(doBlocks.length).toBe((schema.match(/^do \$\$/gm) ?? []).length);
  });
});

describe("decideApply", () => {
  it("skips when the fingerprint matches, applies when it changed or was never recorded, and honours force", () => {
    expect(decideApply("a", "a")).toEqual({ action: "skip", reason: "unchanged" });
    expect(decideApply("a", "b")).toEqual({ action: "apply", reason: "changed" });
    expect(decideApply("a", null)).toEqual({ action: "apply", reason: "never-applied" });
    expect(decideApply("a", "a", true)).toEqual({ action: "apply", reason: "forced" });
  });
});

describe("schemaFingerprint", () => {
  it("ignores trailing whitespace and line-ending differences only", () => {
    expect(schemaFingerprint("a  \nb\r\n")).toBe(schemaFingerprint("a\nb\n"));
    expect(schemaFingerprint("a\nb\n")).not.toBe(schemaFingerprint("a\nc\n"));
  });
});

describe("retry helpers", () => {
  it("retries lock and cancel errors, never syntax errors", () => {
    expect(isRetryableSqlError({ code: "55P03" })).toBe(true);
    expect(isRetryableSqlError({ code: "40P01" })).toBe(true);
    expect(isRetryableSqlError({ code: "57014" })).toBe(true);
    expect(isRetryableSqlError({ code: "42601" })).toBe(false);
    expect(isRetryableSqlError(new Error("x"))).toBe(false);
  });

  it("backs off exponentially with jitter and a 30 s cap", () => {
    expect(backoffMs(1, () => 0.5)).toBe(2000);
    expect(backoffMs(2, () => 0.5)).toBe(4000);
    expect(backoffMs(10, () => 0.5)).toBe(30000);
    expect(backoffMs(1, () => 0)).toBe(1500);
    expect(backoffMs(1, () => 1)).toBe(2500);
  });

  it("describes a statement on one line", () => {
    expect(describeStatement("create\n  table   x (\n id int )")).toBe("create table x ( id int )");
    expect(describeStatement("x".repeat(200))).toHaveLength(96);
  });
});
