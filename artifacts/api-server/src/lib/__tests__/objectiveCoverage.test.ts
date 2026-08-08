// Objectives-replace-cohort regression coverage:
//  - lossless migration of a legacy single-cohort account into the objectives set
//  - normalization/validation of stored objectives values
//  - per-run coverage/flag logic across configured+present, configured+absent,
//    present+unconfigured, and the shared lead_gen/service column overlap
//  - parser-level objective column group detection from real CSV headers

import { describe, it, expect } from "vitest";
import {
  normalizeObjectives,
  resolveAccountObjectives,
  resolveObjectiveDefinitions,
  type CohortKey,
} from "../cohortConfig";
import { computeObjectiveCoverage, OBJECTIVE_GROUP_FOR_KEY } from "../objectiveCoverage";
import { detectObjectiveColumnGroups, optionalMetricSlugsForGroups, ECOMMERCE_METRICS, SERVICE_METRICS, APP_METRICS } from "../iapCsvSpec";
import { parseIapCsv } from "../iapCsvParser";

describe("normalizeObjectives", () => {
  it("dedupes, drops unknowns, and returns canonical order", () => {
    expect(normalizeObjectives(["app", "ecommerce", "app", "bogus", 42])).toEqual(["ecommerce", "app"]);
  });
  it("returns [] for non-arrays", () => {
    expect(normalizeObjectives("ecommerce")).toEqual([]);
    expect(normalizeObjectives(null)).toEqual([]);
  });
});

describe("resolveAccountObjectives (legacy migration)", () => {
  it("prefers the objectives set when present", () => {
    expect(resolveAccountObjectives({ objectives: ["lead_gen"], cohort: "ecommerce" })).toEqual(["lead_gen"]);
  });
  it("falls back to the legacy scalar cohort — an existing single-cohort account keeps working unchanged", () => {
    expect(resolveAccountObjectives({ cohort: "service" })).toEqual(["service"]);
  });
  it("returns [] (never a silent ecommerce default) when nothing is configured", () => {
    expect(resolveAccountObjectives({})).toEqual([]);
    expect(resolveAccountObjectives({ cohort: "invalid" })).toEqual([]);
    expect(resolveAccountObjectives(null)).toEqual([]);
  });
  it("resolveObjectiveDefinitions maps keys to full definitions", () => {
    const defs = resolveObjectiveDefinitions(["app", "ecommerce"]);
    expect(defs.map((d) => d.cohort_key)).toEqual(["ecommerce", "app"]);
    expect(defs.every((d) => d.terminal_metric_direction === "lower_is_better")).toBe(true);
  });
});

describe("detectObjectiveColumnGroups", () => {
  it("one column from a group marks the group present", () => {
    expect([...detectObjectiveColumnGroups([ECOMMERCE_METRICS[0]!])]).toEqual(["ecommerce"]);
    expect([...detectObjectiveColumnGroups([SERVICE_METRICS[0]!])]).toEqual(["service_or_lead_gen"]);
    expect([...detectObjectiveColumnGroups([APP_METRICS[0]!])]).toEqual(["app"]);
  });
  it("no optional metric columns → no groups", () => {
    expect(detectObjectiveColumnGroups([]).size).toBe(0);
    expect(detectObjectiveColumnGroups(["Not a real column"]).size).toBe(0);
  });
});

describe("computeObjectiveCoverage", () => {
  it("configured + present → assessed, no flags", () => {
    const c = computeObjectiveCoverage(["ecommerce"], ["ecommerce"]);
    expect(c.assessed).toEqual(["ecommerce"]);
    expect(c.skipped).toEqual([]);
    expect(c.flags).toEqual([]);
  });

  it("configured + absent → skipped with a non-blocking flag, never fabricated", () => {
    const c = computeObjectiveCoverage(["app"], []);
    expect(c.assessed).toEqual([]);
    expect(c.skipped).toEqual(["app"]);
    expect(c.flags).toHaveLength(1);
    expect(c.flags[0]).toMatch(/skipped for this run/);
    expect(c.flags[0]).toMatch(/nothing was fabricated/);
  });

  it("present + unconfigured → suggestion flag, never auto-enabled", () => {
    const c = computeObjectiveCoverage([], ["ecommerce"]);
    expect(c.assessed).toEqual([]);
    expect(c.flags).toHaveLength(1);
    expect(c.flags[0]).toMatch(/no matching objective is configured/);
    expect(c.flags[0]).toMatch(/NOT enabled automatically/);
  });

  it("shared SERVICE_METRICS group: lead_gen OR service configured is satisfied by the shared group's presence", () => {
    for (const key of ["lead_gen", "service"] as const) {
      const c = computeObjectiveCoverage([key], ["service_or_lead_gen"]);
      expect(c.assessed).toEqual([key]);
      expect(c.flags).toEqual([]);
    }
    // Both configured → both assessed off the one shared group.
    const both = computeObjectiveCoverage(["lead_gen", "service"], ["service_or_lead_gen"]);
    expect(both.assessed).toEqual(["lead_gen", "service"]);
    expect(both.flags).toEqual([]);
  });

  it("shared group present with neither lead_gen nor service configured → one suggestion naming both", () => {
    const c = computeObjectiveCoverage(["ecommerce"], ["ecommerce", "service_or_lead_gen"]);
    expect(c.assessed).toEqual(["ecommerce"]);
    expect(c.flags).toHaveLength(1);
    expect(c.flags[0]).toMatch(/Lead Generation/);
    expect(c.flags[0]).toMatch(/or/);
  });

  it("multi-objective mixed case: assessed + skipped + suggestion together", () => {
    const c = computeObjectiveCoverage(["ecommerce", "app"], ["ecommerce", "service_or_lead_gen"]);
    expect(c.assessed).toEqual(["ecommerce"]);
    expect(c.skipped).toEqual(["app"]);
    expect(c.flags).toHaveLength(2);
  });

  it("zero configured, zero present → clean empty result", () => {
    const c = computeObjectiveCoverage([], []);
    expect(c).toEqual({ assessed: [], skipped: [], flags: [] });
  });
});

describe("parseIapCsv objectiveColumnGroupsPresent", () => {
  const base = "Day,Ad name,Campaign name,Age,Gender,Amount spent (USD),Impressions,Link clicks";
  it("detects ecommerce columns in a demographic export", () => {
    const csv = `${base},Purchases\n2026-01-01,Ad A,Camp 1,25-34,female,10,1000,20,2\n`;
    const result = parseIapCsv(csv, "demographic");
    expect(result.objectiveColumnGroupsPresent).toEqual(["ecommerce"]);
  });
  it("detects the shared service/lead_gen group", () => {
    const csv = `${base},Leads\n2026-01-01,Ad A,Camp 1,25-34,female,10,1000,20,3\n`;
    const result = parseIapCsv(csv, "demographic");
    expect(result.objectiveColumnGroupsPresent).toEqual(["service_or_lead_gen"]);
  });
  it("no optional metrics → no groups (columns ignored, not errored)", () => {
    const csv = `${base}\n2026-01-01,Ad A,Camp 1,25-34,female,10,1000,20\n`;
    const result = parseIapCsv(csv, "demographic");
    expect(result.objectiveColumnGroupsPresent).toEqual([]);
  });
});

describe("objective coverage applied to ingestion (optionalMetricSlugsForGroups)", () => {
  const base = "Day,Ad name,Campaign name,Age,Gender,Amount spent (USD),Impressions,Link clicks";

  /** Mirrors the analysis run's pre-aggregation strip: keep only configured groups' slugs. */
  function stripToConfigured(rows: { extra: Record<string, unknown> }[], configured: CohortKey[]) {
    const allowed = optionalMetricSlugsForGroups(configured.map((k) => OBJECTIVE_GROUP_FOR_KEY[k]));
    for (const row of rows) {
      for (const key of Object.keys(row.extra)) {
        if (!allowed.has(key)) delete row.extra[key];
      }
    }
  }

  it("slugs for a group cover exactly that group's columns", () => {
    const slugs = optionalMetricSlugsForGroups(["app"]);
    expect(slugs.has("mobile_app_installs")).toBe(true);
    expect(slugs.has("purchases")).toBe(false);
    expect(slugs.has("leads")).toBe(false);
  });

  it("unconfigured objective's columns are dropped before aggregation; configured ones kept", () => {
    const csv = `${base},Purchases,Leads,Mobile app installs\n2026-01-01,Ad A,Camp 1,25-34,female,10,1000,20,2,3,4\n`;
    const result = parseIapCsv(csv, "demographic");
    // All three parse in initially…
    expect(result.rows[0]!.extra["purchases"]).toBe(2);
    expect(result.rows[0]!.extra["leads"]).toBe(3);
    expect(result.rows[0]!.extra["mobile_app_installs"]).toBe(4);
    // …but with only ecommerce configured, other groups are stripped.
    stripToConfigured(result.rows, ["ecommerce"]);
    expect(result.rows[0]!.extra["purchases"]).toBe(2);
    expect(result.rows[0]!.extra["leads"]).toBeUndefined();
    expect(result.rows[0]!.extra["mobile_app_installs"]).toBeUndefined();
    // The dropped groups were still DETECTED → they produce suggestion flags, not data.
    const coverage = computeObjectiveCoverage(["ecommerce"], result.objectiveColumnGroupsPresent);
    expect(coverage.assessed).toEqual(["ecommerce"]);
    expect(coverage.flags.length).toBe(2);
  });

  it("lead_gen OR service configured keeps the shared SERVICE_METRICS columns", () => {
    const csv = `${base},Leads,Purchases\n2026-01-01,Ad A,Camp 1,25-34,female,10,1000,20,3,2\n`;
    const result = parseIapCsv(csv, "demographic");
    stripToConfigured(result.rows, ["service"]);
    expect(result.rows[0]!.extra["leads"]).toBe(3);
    expect(result.rows[0]!.extra["purchases"]).toBeUndefined();
  });

  it("zero configured objectives → every optional metric dropped, base metrics untouched", () => {
    const csv = `${base},Purchases\n2026-01-01,Ad A,Camp 1,25-34,female,10,1000,20,2\n`;
    const result = parseIapCsv(csv, "demographic");
    stripToConfigured(result.rows, []);
    expect(Object.keys(result.rows[0]!.extra)).toEqual([]);
    expect(result.rows[0]!.base["impressions"]).toBe(1000);
  });
});
