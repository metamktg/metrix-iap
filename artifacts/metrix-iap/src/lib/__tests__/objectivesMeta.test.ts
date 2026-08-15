// Frontend consumers of the objectives set (replacing the scalar cohort):
// resolveObjectivesMeta must behave sanely for 0, 1, and many objectives —
// never crash and never silently default to ecommerce — and the JSON
// export envelope must carry the objectives list.

import { describe, it, expect } from "vitest";
import { resolveObjectivesMeta, resolveObjectivesMetaList, resolveCohortMeta } from "../data/cohortMeta";
import { buildExportEnvelope } from "../jsonExport";
import type { AdAccount } from "../data/seedTypes";

describe("resolveObjectivesMeta", () => {
  it("one objective → that objective's specific meta (same as the old single-cohort path)", () => {
    expect(resolveObjectivesMeta(["app"])).toEqual(resolveCohortMeta("app"));
    expect(resolveObjectivesMeta(["ecommerce"]).terminalMetricLabel).toBe(
      resolveCohortMeta("ecommerce").terminalMetricLabel,
    );
  });

  it("zero objectives → honest Unassigned generic, not an ecommerce default", () => {
    for (const input of [[], undefined, null] as const) {
      const meta = resolveObjectivesMeta(input);
      expect(meta.label).toBe("Unassigned");
      expect(meta.terminalMetricLabel).toBe("cost per result");
      expect(meta.terminalMetricDirection).toBe("lower_is_better");
    }
  });

  it("multiple objectives → combined label with generic cost-per-result metric", () => {
    const meta = resolveObjectivesMeta(["ecommerce", "lead_gen"]);
    expect(meta.label).toContain("+");
    expect(meta.terminalMetricLabel).toBe("cost per result");
    expect(meta.terminalMetricDirection).toBe("lower_is_better");
  });

  it("unknown values are dropped, not crashed on", () => {
    expect(resolveObjectivesMeta(["bogus", "app"])).toEqual(resolveCohortMeta("app"));
  });
});

describe("resolveObjectivesMetaList", () => {
  it("one objective → single-element array with that objective's specific meta", () => {
    const list = resolveObjectivesMetaList(["app"]);
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual(resolveCohortMeta("app"));
  });

  it("zero objectives → single generic 'Unassigned' entry, not ecommerce default", () => {
    for (const input of [[], undefined, null] as const) {
      const list = resolveObjectivesMetaList(input);
      expect(list).toHaveLength(1);
      expect(list[0]!.label).toBe("Unassigned");
      expect(list[0]!.terminalMetricLabel).toBe("cost per result");
    }
  });

  it("multiple objectives → one entry per objective, each with its own specific metric", () => {
    const list = resolveObjectivesMetaList(["ecommerce", "lead_gen"]);
    expect(list).toHaveLength(2);
    expect(list[0]!.terminalMetricLabel).toBe(resolveCohortMeta("ecommerce").terminalMetricLabel);
    expect(list[1]!.terminalMetricLabel).toBe(resolveCohortMeta("lead_gen").terminalMetricLabel);
    // must NOT collapse to generic cost per result
    expect(list[0]!.terminalMetricLabel).not.toBe("cost per result");
    expect(list[1]!.terminalMetricLabel).not.toBe("cost per result");
  });

  it("unknown values are dropped — only known objectives appear", () => {
    const list = resolveObjectivesMetaList(["bogus", "app"]);
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual(resolveCohortMeta("app"));
  });

  it("all-unknown objectives → single generic entry", () => {
    const list = resolveObjectivesMetaList(["bogus", "unknown"]);
    expect(list).toHaveLength(1);
    expect(list[0]!.terminalMetricLabel).toBe("cost per result");
  });
});

describe("jsonExport envelope objectives", () => {
  const account = (objectives?: AdAccount["objectives"]): AdAccount =>
    ({ id: "a1", name: "Acct", status: "configured", objectives }) as AdAccount;

  it("carries the configured objectives list", () => {
    const env = buildExportEnvelope(account(["ecommerce", "app"]), { rows: [] });
    expect(env.objectives).toEqual(["ecommerce", "app"]);
  });

  it("empty list when none configured — no fabricated default", () => {
    expect(buildExportEnvelope(account(), { rows: [] }).objectives).toEqual([]);
  });
});
