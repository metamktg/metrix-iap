// Frontend consumers of the objectives set (replacing the scalar cohort):
// resolveObjectivesMeta must behave sanely for 0, 1, and many objectives —
// never crash and never silently default to ecommerce — and the JSON
// export envelope must carry the objectives list.

import { describe, it, expect } from "vitest";
import { resolveObjectivesMeta, resolveCohortMeta } from "../data/cohortMeta";
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
