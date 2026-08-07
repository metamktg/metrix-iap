import { describe, expect, it } from "vitest";
import { parseIapCsv, IapCsvFormatError } from "../iapCsvParser";
import {
  BASE_METRICS,
  DERIVED_OR_IRRELEVANT_METRICS,
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
    case "Day":
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
    expect(result.warnings).toEqual([]);
    expect(result.missingColumns).toEqual([]);
  });

  it("parses a valid device/placement export", () => {
    const result = parseIapCsv(validCsv("device_placement").text, "device_placement");
    expect(result.rows.length).toBe(1);
    expect(result.rows[0]!.breakdowns["Placement"]).toBe("feed");
    expect(result.rows[0]!.breakdowns["Platform"]).toBe("facebook");
    expect(result.warnings).toEqual([]);
  });
});

describe("parseIapCsv — alias / fuzzy matching", () => {
  it('accepts legacy "Date" in place of "Day" via alias match', () => {
    const breakdownCols = [...DEMOGRAPHIC_BREAKDOWN_COLUMNS];
    // Replace canonical "Day" with legacy "Date" in the header
    const header = breakdownCols
      .map((c) => (c === "Day" ? "Date" : resolveCurrency(c)))
      .concat(BASE_METRICS.map(resolveCurrency));
    const row = breakdownCols.map(breakdownValue).concat(BASE_METRICS.map(baseValue));
    const text = [line(header), line(row)].join("\n");

    const result = parseIapCsv(text, "demographic");
    expect(result.rows.length).toBe(1);
    // "Day" breakdown value should be populated from the "Date" column
    expect(result.rows[0]!.breakdowns["Day"]).toBe("2026-06-01");
    // A warning should be recorded
    expect(result.warnings.some((w) => w.includes("Date") && w.includes("Day"))).toBe(true);
    expect(result.columnMappings["Day"]?.via).toBe("alias");
  });

  it("accepts case-insensitive column names", () => {
    const breakdownCols = [...DEMOGRAPHIC_BREAKDOWN_COLUMNS];
    const header = breakdownCols
      .map((c) => (c === "Ad name" ? "ad name" : resolveCurrency(c)))
      .concat(BASE_METRICS.map(resolveCurrency));
    const row = breakdownCols.map(breakdownValue).concat(BASE_METRICS.map(baseValue));
    const text = [line(header), line(row)].join("\n");

    const result = parseIapCsv(text, "demographic");
    expect(result.rows.length).toBe(1);
    expect(result.rows[0]!.breakdowns["Ad name"]).toBe("UGC_Testimonial_v1");
    expect(result.columnMappings["Ad name"]?.via).toBe("case_insensitive");
  });

  it("proceeds with warnings (not error) when a non-critical breakdown column is missing", () => {
    const breakdownCols = [...DEMOGRAPHIC_BREAKDOWN_COLUMNS];
    // Drop "Text" — non-critical breakdown column
    const header = breakdownCols
      .filter((c) => c !== "Text")
      .map(resolveCurrency)
      .concat(BASE_METRICS.map(resolveCurrency));
    const row = breakdownCols
      .filter((c) => c !== "Text")
      .map(breakdownValue)
      .concat(BASE_METRICS.map(baseValue));
    const text = [line(header), line(row)].join("\n");

    const result = parseIapCsv(text, "demographic");
    expect(result.rows.length).toBe(1);
    expect(result.missingColumns).toContain("Text");
    expect(result.warnings.some((w) => w.includes("Text"))).toBe(true);
  });

  it("proceeds with warnings (not error) when base metric columns are missing", () => {
    const breakdownCols = DEMOGRAPHIC_BREAKDOWN_COLUMNS;
    // Only provide breakdown columns — no base metrics at all
    const header = [...breakdownCols.map(resolveCurrency)];
    const row = [...breakdownCols.map(breakdownValue)];
    const result = parseIapCsv([line(header), line(row)].join("\n"), "demographic");
    expect(result.rows.length).toBe(1);
    expect(result.missingColumns.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => /missing|confidence/i.test(w))).toBe(true);
  });
});

describe("parseIapCsv — hard errors remain", () => {
  it("throws on an empty file", () => {
    expect(() => parseIapCsv("", "demographic")).toThrow(IapCsvFormatError);
    expect(() => parseIapCsv("   \n  ", "demographic")).toThrow(/empty|missing/i);
  });

  it("throws when a CRITICAL breakdown column (Ad name) cannot be resolved at all", () => {
    const breakdownCols = DEMOGRAPHIC_BREAKDOWN_COLUMNS;
    // Drop Ad name — critical column
    const header = breakdownCols
      .filter((c) => c !== "Ad name")
      .map(resolveCurrency)
      .concat(BASE_METRICS.map(resolveCurrency));
    const row = breakdownCols
      .filter((c) => c !== "Ad name")
      .map(breakdownValue)
      .concat(BASE_METRICS.map(baseValue));
    expect(() => parseIapCsv([line(header), line(row)].join("\n"), "demographic")).toThrow(
      IapCsvFormatError,
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

// ── Derivable / irrelevant columns are never expected ─────────────────────────

describe("parseIapCsv — derivable & irrelevant columns", () => {
  it("emits no warnings when derivable columns (cost-per-X, rankings) are absent", () => {
    // A real-Meta-style export: breakdowns + base metrics only, none of the
    // derivable ratio/ranking columns.
    const result = parseIapCsv(validCsv("demographic").text, "demographic");
    const flagged = result.warnings.filter((w) =>
      DERIVED_OR_IRRELEVANT_METRICS.some((c) => w.includes(c)),
    );
    expect(flagged).toEqual([]);
    const missingFlagged = result.missingColumns.filter((c) =>
      DERIVED_OR_IRRELEVANT_METRICS.includes(c),
    );
    expect(missingFlagged).toEqual([]);
  });

  it("accepts derivable columns transparently when present", () => {
    const breakdownCols = [...DEMOGRAPHIC_BREAKDOWN_COLUMNS];
    const extras = ["CPC (cost per link click)", "Cost per landing page view", "Quality ranking"];
    const header = breakdownCols
      .map(resolveCurrency)
      .concat(BASE_METRICS.map(resolveCurrency))
      .concat(extras);
    const row = breakdownCols
      .map(breakdownValue)
      .concat(BASE_METRICS.map(baseValue))
      .concat(["1.23", "2.34", "Above average"]);
    const result = parseIapCsv([line(header), line(row)].join("\n"), "demographic");
    expect(result.rows.length).toBe(1);
    // No unknown-column or missing-column warnings about the derivable extras
    const flagged = result.warnings.filter((w) => extras.some((c) => w.includes(c)));
    expect(flagged).toEqual([]);
  });

  it("BASE_METRICS no longer contains derivable or ranking columns", () => {
    for (const col of DERIVED_OR_IRRELEVANT_METRICS) {
      expect(BASE_METRICS).not.toContain(col);
    }
    expect(BASE_METRICS).not.toContain("Cost per result");
    expect(BASE_METRICS).not.toContain("Quality ranking");
  });
});
