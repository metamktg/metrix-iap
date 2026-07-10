import { describe, expect, it } from "vitest";
import { parseIapCsv, IapCsvFormatError } from "../iapCsvParser";
import {
  BASE_METRICS,
  DEMOGRAPHIC_BREAKDOWN_COLUMNS,
  DEVICE_PLACEMENT_BREAKDOWN_COLUMNS,
  type IapCsvClass,
} from "../iapCsvSpec";

// The spec's own sample_csv leaves comma-bearing headers unquoted, so it is
// only for display. Build a strictly-quoted, round-trippable CSV here instead.
const q = (cell: string): string => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);
const line = (cells: string[]): string => cells.map(q).join(",");

const resolveCurrency = (col: string): string =>
  col === "Amount spent ({ACCOUNT_CURRENCY})" ? "Amount spent (USD)" : col;

const breakdownColsFor = (cls: IapCsvClass): readonly string[] =>
  cls === "demographic" ? DEMOGRAPHIC_BREAKDOWN_COLUMNS : DEVICE_PLACEMENT_BREAKDOWN_COLUMNS;

/** A concrete breakdown value per column so required-value checks are satisfied. */
function breakdownValue(col: string): string {
  switch (col) {
    case "Date":
      return "2026-06-01";
    case "Campaign ID":
      return "6001";
    case "Campaign name":
      return "Prospecting - Broad";
    case "Ad set ID":
      return "7001";
    case "Ad set name":
      return "Prospecting - Broad - AS1";
    case "Ad ID":
      return "8001";
    case "Ad name":
      return "UGC_Testimonial_v1";
    case "Gender":
      return "female";
    case "Age":
      return "25-34";
    case "Text":
      return "";
    case "Impression device":
      return "iphone";
    case "Platform":
      return "facebook";
    case "Placement":
      return "feed";
    default:
      return "x";
  }
}

function baseValue(col: string): string {
  if (col === "Amount spent ({ACCOUNT_CURRENCY})") return "42.50";
  if (col === "Result type") return "Purchases";
  if (col === "Result value type") return "";
  if (col === "Impressions") return "5100";
  if (col === "Reach") return "4800";
  if (col === "Results") return "3";
  return "";
}

/** Builds a strictly-quoted, valid CSV for the given class. */
function validCsv(cls: IapCsvClass): { header: string[]; text: string } {
  const breakdownCols = breakdownColsFor(cls);
  const header = [...breakdownCols.map(resolveCurrency), ...BASE_METRICS.map(resolveCurrency)];
  const row = [...breakdownCols.map(breakdownValue), ...BASE_METRICS.map(baseValue)];
  return { header, text: [line(header), line(row)].join("\n") };
}

describe("parseIapCsv — valid exports", () => {
  it("parses a valid demographic export", () => {
    const result = parseIapCsv(validCsv("demographic").text, "demographic");
    expect(result.rows.length).toBe(1);
    expect(result.rows[0]!.breakdowns["Ad name"]).toBe("UGC_Testimonial_v1");
    expect(result.rows[0]!.breakdowns["Gender"]).toBe("female");
    expect(result.rows[0]!.base["impressions"]).toBe(5100);
    expect(result.rows[0]!.base["result_type"]).toBe("Purchases");
  });

  it("parses a valid device/placement export", () => {
    const result = parseIapCsv(validCsv("device_placement").text, "device_placement");
    expect(result.rows.length).toBe(1);
    expect(result.rows[0]!.breakdowns["Placement"]).toBe("feed");
    expect(result.rows[0]!.breakdowns["Platform"]).toBe("facebook");
  });
});

describe("parseIapCsv — rejects malformed uploads", () => {
  it("throws on an empty file", () => {
    expect(() => parseIapCsv("", "demographic")).toThrow(IapCsvFormatError);
    expect(() => parseIapCsv("   \n  ", "demographic")).toThrow(/empty|missing/i);
  });

  it("throws when a breakdown column is missing", () => {
    const { header } = validCsv("demographic");
    const withoutGender = header.filter((h) => h !== "Gender");
    // Header only (data row would also drop a column); the breakdown check runs first.
    expect(() => parseIapCsv(line(withoutGender) + "\nx", "demographic")).toThrow(
      /columns are missing/i,
    );
  });

  it("throws when a required Base metric column is missing", () => {
    const breakdownCols = DEMOGRAPHIC_BREAKDOWN_COLUMNS;
    const header = breakdownCols.map(resolveCurrency);
    const row = breakdownCols.map(breakdownValue);
    expect(() => parseIapCsv([line(header), line(row)].join("\n"), "demographic")).toThrow(
      /missing required Base metric/i,
    );
  });

  it("throws when the file has a header but no data rows", () => {
    const { header } = validCsv("demographic");
    expect(() => parseIapCsv(line(header), "demographic")).toThrow(/no data rows/i);
  });

  it("throws when a required breakdown value is blank (totals/subtotal row)", () => {
    const breakdownCols = breakdownColsFor("demographic");
    const header = [...breakdownCols.map(resolveCurrency), ...BASE_METRICS.map(resolveCurrency)];
    const row = [
      ...breakdownCols.map((c) => (c === "Gender" ? "" : breakdownValue(c))),
      ...BASE_METRICS.map(baseValue),
    ];
    expect(() => parseIapCsv([line(header), line(row)].join("\n"), "demographic")).toThrow(
      /missing required value/i,
    );
  });
});
