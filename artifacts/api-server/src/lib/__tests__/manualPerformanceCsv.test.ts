import { describe, expect, it } from "vitest";
import {
  ManualCsvFormatError,
  buildSampleManualPerformanceCsv,
  parseManualPerformanceCsv,
} from "../manualPerformanceCsv";

describe("parseManualPerformanceCsv", () => {
  it("parses the canonical header + rows, computing derived metrics", () => {
    const csv = [
      "Day,Campaign name,Ad set name,Ad name,Result type,Results,Amount spent (USD),Impressions,Reach,Link clicks,Clicks (all)",
      "2026-06-01,Prospecting,AS1,Ad A,Purchases,3,42.50,5100,4800,180,205",
    ].join("\n");

    const rows = parseManualPerformanceCsv(csv);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.date).toBe("2026-06-01");
    expect(row.campaign_name).toBe("Prospecting");
    expect(row.ad_set_name).toBe("AS1");
    expect(row.ad_name).toBe("Ad A");
    expect(row.result_type).toBe("Purchases");
    expect(row.results).toBe(3);
    expect(row.spend).toBe(42.5);
    expect(row.impressions).toBe(5100);
    expect(row.reach).toBe(4800);
    expect(row.link_clicks).toBe(180);
    expect(row.clicks_all).toBe(205);
    expect(row.cpa).toBeCloseTo(42.5 / 3);
    expect(row.ctr_link_pct).toBeCloseTo((180 / 5100) * 100);
    expect(row.cvr_link_pct).toBeCloseTo((3 / 180) * 100);
    expect(row.cpm).toBeCloseTo((42.5 / 5100) * 1000);
  });

  it("accepts recognized header aliases case-insensitively", () => {
    const csv = [
      "date,campaign,ad,result indicator,results,spend,impressions",
      "2026-06-01,Prospecting,Ad A,Purchases,3,42.50,5100",
    ].join("\n");

    const rows = parseManualPerformanceCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.campaign_name).toBe("Prospecting");
    expect(rows[0]!.ad_set_name).toBeNull();
    expect(rows[0]!.reach).toBeNull();
  });

  it("throws an actionable error listing all missing required columns", () => {
    const csv = ["Day,Campaign name", "2026-06-01,Prospecting"].join("\n");
    expect(() => parseManualPerformanceCsv(csv)).toThrow(ManualCsvFormatError);
    try {
      parseManualPerformanceCsv(csv);
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ManualCsvFormatError);
      const message = (err as Error).message;
      expect(message).toContain("Ad name");
      expect(message).toContain("Result type");
      expect(message).toContain("Results");
      expect(message).toContain("Amount spent (USD)");
      expect(message).toContain("Impressions");
    }
  });

  it("rejects an empty file", () => {
    expect(() => parseManualPerformanceCsv("")).toThrow(ManualCsvFormatError);
  });

  it("rejects a header-only file with no data rows", () => {
    const csv = "Day,Campaign name,Ad name,Result type,Results,Amount spent (USD),Impressions";
    expect(() => parseManualPerformanceCsv(csv)).toThrow(/no data rows/);
  });

  it("rejects a malformed date instead of silently defaulting", () => {
    const csv = [
      "Day,Campaign name,Ad name,Result type,Results,Amount spent (USD),Impressions",
      "06/01/2026,Prospecting,Ad A,Purchases,3,42.50,5100",
    ].join("\n");
    expect(() => parseManualPerformanceCsv(csv)).toThrow(/YYYY-MM-DD/);
  });

  it("rejects non-numeric required numeric fields instead of coercing to zero", () => {
    const csv = [
      "Day,Campaign name,Ad name,Result type,Results,Amount spent (USD),Impressions",
      "2026-06-01,Prospecting,Ad A,Purchases,N/A,42.50,5100",
    ].join("\n");
    expect(() => parseManualPerformanceCsv(csv)).toThrow(/"Results" must be a number/);
  });

  it("leaves cpa/ctr/cvr/cpm null when their inputs are zero or absent", () => {
    const csv = [
      "Day,Campaign name,Ad name,Result type,Results,Amount spent (USD),Impressions",
      "2026-06-01,Prospecting,Ad A,Purchases,0,0,0",
    ].join("\n");
    const rows = parseManualPerformanceCsv(csv);
    expect(rows[0]!.cpa).toBeNull();
    expect(rows[0]!.cpm).toBeNull();
    expect(rows[0]!.ctr_link_pct).toBeNull();
    expect(rows[0]!.cvr_link_pct).toBeNull();
  });

  it("produces a sample CSV that parses cleanly with no errors", () => {
    const sample = buildSampleManualPerformanceCsv();
    const rows = parseManualPerformanceCsv(sample);
    expect(rows.length).toBeGreaterThan(0);
  });
});
