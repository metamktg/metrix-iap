// Spec §5: duplicated headers are preserved by ordinal and VERIFIED, never
// assumed harmless. Identical on every row → note, first ordinal canonical.
// Different on any row → schema conflict, both values retained on the row,
// the field unusable for joins from this file.
import { describe, expect, it } from "vitest";
import { parseIapCsv } from "../iapCsvParser";
import { detectReportGrain } from "../reportGrain";
import { buildDemographicCsv, buildPlacementCsv } from "./fixtures/reconciliationFixtures";

describe("duplicate headers — identical values", () => {
  const parsed = parseIapCsv(buildDemographicCsv({ grain: "reconciled", duplicateHeaders: "identical" }), "demographic");

  it("records one note per duplicated header and no conflict", () => {
    expect(parsed.headerConflicts).toEqual([]);
    expect(parsed.headerNotes.map((n) => n.header).sort()).toEqual(["Ad ID", "Ad name", "Result value type"]);
    for (const n of parsed.headerNotes) expect(n.ordinals).toHaveLength(2);
  });

  it("folds the notes into ONE informational line naming every column and its ordinals", () => {
    const notes = parsed.warnings.filter((w) => w.includes("appear") && w.includes("more than once in the header row"));
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/^Note: 3 columns appear more than once/);
    expect(notes[0]).toContain('"Ad ID" (columns 8 and 26)');
    expect(notes[0]).toContain("identical values on every row");
  });

  it("uses the first ordinal as canonical and retains nothing extra on the rows", () => {
    expect(parsed.rows.every((r) => r.duplicates === undefined)).toBe(true);
    expect(new Set(parsed.rows.map((r) => r.breakdowns["Ad ID"])).size).toBe(44);
    expect(detectReportGrain(parsed, "demographic").ad_id_joinable).toBe(true);
  });
});

describe("duplicate headers — conflicting values", () => {
  const parsed = parseIapCsv(buildDemographicCsv({ grain: "reconciled", duplicateHeaders: "conflicting" }), "demographic");

  it("raises a schema conflict for the fields that disagree, with a row-level example", () => {
    const conflicts = parsed.headerConflicts.map((c) => c.header).sort();
    expect(conflicts).toEqual(["Ad ID", "Ad name"]);
    const adId = parsed.headerConflicts.find((c) => c.header === "Ad ID")!;
    expect(adId.conflictingRows).toBeGreaterThan(0);
    expect(adId.conflictingRows).toBeLessThan(adId.totalRows);
    expect(adId.example.values).toHaveLength(2);
    expect(adId.example.values[0]).not.toBe(adId.example.values[1]);
    // "Result value type" is duplicated too but agrees (blank) everywhere → note, not conflict.
    expect(parsed.headerNotes.map((n) => n.header)).toEqual(["Result value type"]);
  });

  it("retains every occurrence's value on the rows that disagreed", () => {
    const disagreeing = parsed.rows.filter((r) => r.duplicates?.["Ad ID"]);
    expect(disagreeing.length).toBe(parsed.headerConflicts.find((c) => c.header === "Ad ID")!.conflictingRows);
    for (const r of disagreeing) {
      expect(r.duplicates!["Ad ID"]).toHaveLength(2);
      expect(r.duplicates!["Ad ID"]![0]).toBe(r.breakdowns["Ad ID"]);
    }
  });

  it("warns as ATTENTION (no Note prefix) and names the field as unusable for reconciliation", () => {
    const line = parsed.warnings.find((w) => w.includes('"Ad ID"') && w.includes("DIFFERENT values"));
    expect(line).toBeDefined();
    expect(line!.startsWith("Note:")).toBe(false);
    expect(line).toContain('will not join or reconcile through "Ad ID"');
  });

  it("makes the file unjoinable at Ad-ID grain", () => {
    const grain = detectReportGrain(parsed, "demographic");
    expect(grain.has_ad_id).toBe(true);
    expect(grain.ad_id_joinable).toBe(false);
    expect(grain.header_conflicts).toEqual(["Ad ID", "Ad name"]);
  });
});

describe("duplicate headers — numeric normalization", () => {
  it("treats '100' and '100.0' as identical, and blank-vs-value as a conflict", () => {
    const header = ["Day", "Campaign name", "Ad name", "Platform", "Placement", "Impressions", "Impressions", "Amount spent (USD)"];
    const rows = [
      ["2026-07-01", "C", "A", "facebook", "feed", "100", "100.0", "5"],
      ["2026-07-02", "C", "A", "facebook", "feed", "200", "200", "5"],
    ];
    const same = parseIapCsv([header, ...rows].map((r) => r.join(",")).join("\n"), "device_placement");
    expect(same.headerConflicts).toEqual([]);
    expect(same.headerNotes.map((n) => n.header)).toEqual(["Impressions"]);

    const rows2 = [["2026-07-01", "C", "A", "facebook", "feed", "100", "", "5"]];
    const differ = parseIapCsv([header, ...rows2].map((r) => r.join(",")).join("\n"), "device_placement");
    expect(differ.headerConflicts.map((c) => c.header)).toEqual(["Impressions"]);
  });

  it("does not report anything for a placement export with unique headers", () => {
    const parsed = parseIapCsv(buildPlacementCsv({ days: 1 }), "device_placement");
    expect(parsed.headerNotes).toEqual([]);
    expect(parsed.headerConflicts).toEqual([]);
  });
});
