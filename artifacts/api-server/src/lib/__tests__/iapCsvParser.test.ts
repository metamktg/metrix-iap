import { describe, expect, it } from "vitest";
import { parseIapCsv, IapCsvFormatError } from "../iapCsvParser";
import {
  BASE_METRICS,
  DERIVED_OR_IRRELEVANT_METRICS,
  DEMOGRAPHIC_BREAKDOWN_COLUMNS,
  DEVICE_PLACEMENT_BREAKDOWN_COLUMNS,
  AD_SUMMARY_BREAKDOWN_COLUMNS,
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

  it("proceeds with warnings when NON-blocking base metric columns are missing", () => {
    // Supply the delivery primitives, omit everything else. Missing engagement
    // and video columns degrade confidence; they never block.
    const breakdownCols = DEMOGRAPHIC_BREAKDOWN_COLUMNS;
    const kept = ["Amount spent ({ACCOUNT_CURRENCY})", "Impressions", "Reach"];
    const header = [...breakdownCols.map(resolveCurrency), ...kept.map(resolveCurrency)];
    const row = [...breakdownCols.map(breakdownValue), ...kept.map(baseValue)];
    const result = parseIapCsv([line(header), line(row)].join("\n"), "demographic");
    expect(result.rows.length).toBe(1);
    expect(result.missingColumns.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => /missing|confidence/i.test(w))).toBe(true);
  });

  it("BLOCKS when a delivery primitive column is absent entirely", () => {
    // Regression: the first release of the coverage gate only checked
    // present-but-empty. A file with no spend column at all merely warned and
    // proceeded to an analysis of zeroes — the same defect in a different
    // shape. Absent and empty must both block.
    const breakdownCols = DEMOGRAPHIC_BREAKDOWN_COLUMNS;
    const header = [...breakdownCols.map(resolveCurrency)];
    const row = [...breakdownCols.map(breakdownValue)];
    const text = [line(header), line(row)].join("\n");
    expect(() => parseIapCsv(text, "demographic")).toThrow(IapCsvFormatError);
    // The message must name the ABSENT-column fix, not the conversion-breakdown one
    expect(() => parseIapCsv(text, "demographic")).toThrow(/does not include/i);
    expect(() => parseIapCsv(text, "demographic")).toThrow(/column picker/i);
    expect(() => parseIapCsv(text, "demographic")).not.toThrow(/Conversion device/i);
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

  it("throws when a required breakdown value OTHER than Day is blank on a row that has a Day value", () => {
    // A blank on a required column while Day is still present is a genuinely
    // malformed row (not a Meta totals row — see the totals-row tests below),
    // so it still hard-blocks.
    const breakdownCols = breakdownColsFor("demographic");
    const header = [...breakdownCols.map(resolveCurrency), ...BASE_METRICS.map(resolveCurrency)];
    const row = [
      ...breakdownCols.map((c) => (c === "Gender" ? "" : breakdownValue(c))),
      ...BASE_METRICS.map(baseValue),
    ];
    expect(() => parseIapCsv([line(header), line(row)].join("\n"), "demographic")).toThrow(
      /present but blank on this row/i,
    );
  });

  it("names the missing COLUMN (not totals rows) when a required breakdown is absent", () => {
    // Regression: a required breakdown column that never resolves is a property
    // of the file, not of row 2. Previously this surfaced as
    // "Row 2: missing required value ... must not include totals/subtotals rows",
    // sending users to fix an export setting that was already correct.
    const breakdownCols = breakdownColsFor("demographic").filter((c) => c !== "Gender");
    const header = [...breakdownCols.map(resolveCurrency), ...BASE_METRICS.map(resolveCurrency)];
    const row = [...breakdownCols.map(breakdownValue), ...BASE_METRICS.map(baseValue)];
    const text = [line(header), line(row)].join("\n");
    expect(() => parseIapCsv(text, "demographic")).toThrow(/could not be found|missing .*column/i);
    expect(() => parseIapCsv(text, "demographic")).toThrow(/Gender/);
    expect(() => parseIapCsv(text, "demographic")).not.toThrow(/totals/i);
  });
});

// ── Totals rows: cross-validation, not a hard block ───────────────────────
// Meta appends a grand-totals row to a pivot export unless "Show totals" is
// unchecked at export time — Day blank, aggregate metrics filled. Rejecting
// the whole file for this is hostile: the totals row is useful, as a free
// check of this parser's own summed metrics.

describe("parseIapCsv — totals row handling", () => {
  const breakdownCols = breakdownColsFor("demographic");
  const header = [...breakdownCols.map(resolveCurrency), ...BASE_METRICS.map(resolveCurrency)];
  const dataRow = () => [...breakdownCols.map(breakdownValue), ...BASE_METRICS.map(baseValue)];
  /** A Meta-style totals row: every breakdown blank, given base metric values. */
  const totalsRow = (overrides: Record<string, string>) => [
    ...breakdownCols.map(() => ""),
    ...BASE_METRICS.map((c) => overrides[c] ?? ""),
  ];

  it("excludes a Day-blank totals row from the parsed rows without throwing", () => {
    const text = [line(header), line(dataRow()), line(dataRow()), line(totalsRow({}))].join("\n");
    const result = parseIapCsv(text, "demographic");
    expect(result.rows.length).toBe(2);
  });

  it("does not warn when the totals row matches the computed sums", () => {
    const text = [
      line(header),
      line(dataRow()),
      line(dataRow()),
      line(
        totalsRow({
          "Amount spent ({ACCOUNT_CURRENCY})": "85.00",
          Impressions: "10200",
          Reach: "9600",
          Results: "6",
        }),
      ),
    ].join("\n");
    const result = parseIapCsv(text, "demographic");
    expect(result.rows.length).toBe(2);
    expect(result.warnings.some((w) => /totals row/i.test(w))).toBe(false);
  });

  it("warns (but does not throw) when the totals row disagrees with the computed sums", () => {
    const text = [
      line(header),
      line(dataRow()),
      line(dataRow()),
      line(totalsRow({ "Amount spent ({ACCOUNT_CURRENCY})": "999.99" })),
    ].join("\n");
    const result = parseIapCsv(text, "demographic");
    expect(result.rows.length).toBe(2);
    expect(result.warnings.some((w) => /totals row/i.test(w) && /amount spent/i.test(w))).toBe(true);
  });

  it("excludes multiple totals rows without cross-validating them, with a warning explaining why", () => {
    const text = [
      line(header),
      line(dataRow()),
      line(totalsRow({ "Amount spent ({ACCOUNT_CURRENCY})": "20.00" })),
      line(totalsRow({ "Amount spent ({ACCOUNT_CURRENCY})": "22.50" })),
    ].join("\n");
    const result = parseIapCsv(text, "demographic");
    expect(result.rows.length).toBe(1);
    expect(result.warnings.some((w) => /2 totals\/subtotal rows/i.test(w))).toBe(true);
  });
});

// ── Per-class critical columns: "Campaign name" is optional for ad_summary ──
// AD_SUMMARY_BREAKDOWN_COLUMNS lists "Campaign name" as a breakdown column
// ad_summary exports MAY carry, but that class's own requiredBreakdownColumns
// is just ["Day", "Ad name"] — Campaign name is not required. The critical-
// column hard-block used to check a fixed set shared across all 4 classes
// (Day/Ad name/Campaign name) instead of the current class's own required
// list, so a real ad-level export missing Campaign name was rejected outright
// instead of proceeding like any other optional breakdown column.

describe("parseIapCsv — ad_summary Campaign name is optional, not critical", () => {
  it("stages an ad_summary export missing Campaign name with a warning, not a hard block", () => {
    const breakdownCols = AD_SUMMARY_BREAKDOWN_COLUMNS.filter((c) => c !== "Campaign name");
    const header = [...breakdownCols.map(resolveCurrency), ...BASE_METRICS.map(resolveCurrency)];
    const row = [...breakdownCols.map(breakdownValue), ...BASE_METRICS.map(baseValue)];
    const text = [line(header), line(row)].join("\n");

    const result = parseIapCsv(text, "ad_summary");
    expect(result.rows.length).toBe(1);
    expect(result.missingColumns).toContain("Campaign name");
    expect(result.warnings.some((w) => w.includes("Campaign name"))).toBe(true);
  });

  it("still hard-blocks demographic/device_placement/conversion_device exports missing Campaign name", () => {
    const breakdownCols = DEMOGRAPHIC_BREAKDOWN_COLUMNS.filter((c) => c !== "Campaign name");
    const header = [...breakdownCols.map(resolveCurrency), ...BASE_METRICS.map(resolveCurrency)];
    const row = [...breakdownCols.map(breakdownValue), ...BASE_METRICS.map(baseValue)];
    const text = [line(header), line(row)].join("\n");

    expect(() => parseIapCsv(text, "demographic")).toThrow(IapCsvFormatError);
    expect(() => parseIapCsv(text, "demographic")).toThrow(/Campaign name/);
  });
});

// ── Coverage gate: data presence, not header presence ────────────────────────

describe("parseIapCsv — delivery coverage gate", () => {
  /** Builds a valid CSV whose named base columns are present but blank on every row. */
  function csvWithBlankColumns(cls: IapCsvClass, blank: string[]): string {
    const breakdownCols = breakdownColsFor(cls);
    const header = [...breakdownCols.map(resolveCurrency), ...BASE_METRICS.map(resolveCurrency)];
    const mk = (day: string): string[] => [
      ...breakdownCols.map((c) => (c === "Day" ? day : breakdownValue(c))),
      ...BASE_METRICS.map((c) => (blank.includes(c) ? "" : baseValue(c))),
    ];
    return [line(header), line(mk("2026-06-01")), line(mk("2026-06-02"))].join("\n");
  }

  it("blocks a file whose spend column is present but empty on every row", () => {
    const text = csvWithBlankColumns("demographic", ["Amount spent ({ACCOUNT_CURRENCY})"]);
    expect(() => parseIapCsv(text, "demographic")).toThrow(IapCsvFormatError);
    expect(() => parseIapCsv(text, "demographic")).toThrow(/no cost, rate or efficiency metric/i);
  });

  it("blocks a file whose impressions column is present but empty on every row", () => {
    const text = csvWithBlankColumns("demographic", ["Impressions"]);
    expect(() => parseIapCsv(text, "demographic")).toThrow(/Impressions/);
  });

  it("names the conversion-breakdown cause when ALL delivery metrics are blank", () => {
    // This is the real-world shape: a Conversion device breakdown blanks spend,
    // impressions, reach and frequency together.
    const text = csvWithBlankColumns("demographic", [
      "Amount spent ({ACCOUNT_CURRENCY})",
      "Impressions",
      "Reach",
      "Frequency",
    ]);
    expect(() => parseIapCsv(text, "demographic")).toThrow(/Conversion device/i);
    expect(() => parseIapCsv(text, "demographic")).toThrow(/preserved/i);
  });

  it("does NOT block when spend and impressions carry values", () => {
    const result = parseIapCsv(validCsv("demographic").text, "demographic");
    expect(result.coverage.totalRows).toBe(1);
    const spend = result.coverage.columns.find(
      (c) => c.canonical === "Amount spent ({ACCOUNT_CURRENCY})",
    );
    expect(spend?.present).toBe(true);
    expect(spend?.filledRows).toBe(1);
    expect(spend?.sum).toBeCloseTo(42.5);
  });

  it("reports empty columns without blocking when they are not delivery-critical", () => {
    const text = csvWithBlankColumns("demographic", ["Post shares"]);
    const result = parseIapCsv(text, "demographic");
    expect(result.coverage.emptyColumns).toContain("Post shares");
    expect(result.coverage.totalRows).toBe(2);
  });
});

// ── Real-export column naming ────────────────────────────────────────────────

describe("parseIapCsv — real Meta export column names", () => {
  it('resolves "Device platform" to "Impression device"', () => {
    // Observed in a real client export. Jaccard token overlap is 0.33 — below
    // the 0.5 inference threshold — so this only works via the alias table.
    const breakdownCols = breakdownColsFor("device_placement");
    const header = [
      ...breakdownCols.map((c) => (c === "Impression device" ? "Device platform" : c)),
      ...BASE_METRICS.map(resolveCurrency),
    ];
    const row = [...breakdownCols.map(breakdownValue), ...BASE_METRICS.map(baseValue)];
    const result = parseIapCsv([line(header), line(row)].join("\n"), "device_placement");
    expect(result.rows[0]!.breakdowns["Impression device"]).toBe("iphone");
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

// ── Ad Summary is a ledger, not a lens ──────────────────────────────────────
// The summary export exists to state full spend and results per ad-day and to
// cross-check the pivots' spend. The first fresh-account tester (2026-09-02)
// staged a correct one and was warned it was "missing" fifteen engagement and
// video columns the class never uses, with a confidence grade cut to match.
// Expectation is now per class: the summary is judged on spend, impressions,
// reach, results and result type; the pivots keep the full base list.

describe("parseIapCsv — ad_summary metric expectations are the ledger's, not the pivots'", () => {
  const SUMMARY_COLUMNS = ["Amount spent ({ACCOUNT_CURRENCY})", "Impressions", "Reach", "Results", "Result type"];

  function summaryCsv(metricCols: readonly string[]): string {
    const breakdownCols = AD_SUMMARY_BREAKDOWN_COLUMNS;
    const header = [...breakdownCols.map(resolveCurrency), ...metricCols.map(resolveCurrency)];
    const row = [...breakdownCols.map(breakdownValue), ...metricCols.map(baseValue)];
    return [line(header), line(row)].join("\n");
  }

  it("does not report engagement/video columns as missing on a summary export", () => {
    const result = parseIapCsv(summaryCsv(SUMMARY_COLUMNS), "ad_summary");
    expect(result.rows.length).toBe(1);
    expect(result.missingColumns).toEqual([]);
    expect(result.warnings.some((w) => /supplementary metric columns/.test(w))).toBe(false);
    expect(result.warnings.some((w) => /Reduced confidence/.test(w))).toBe(false);
    // Nothing the class never expected reaches the mapping summary as
    // "missing" either — that list is what the confidence grade is built on.
    expect(result.mappingSummary.filter((e) => e.tier === "missing")).toEqual([]);
  });

  it("still flags the ledger columns themselves when a summary export lacks them", () => {
    const result = parseIapCsv(summaryCsv(["Amount spent ({ACCOUNT_CURRENCY})", "Impressions"]), "ad_summary");
    expect(result.missingColumns).toContain("Results");
    expect(result.missingColumns).toContain("Result type");
    expect(result.warnings.some((w) => /Reduced confidence/.test(w) && /Results/.test(w))).toBe(true);
  });

  it("keeps the full base list as the expectation for a demographic pivot", () => {
    const breakdownCols = DEMOGRAPHIC_BREAKDOWN_COLUMNS;
    const header = [...breakdownCols.map(resolveCurrency), ...SUMMARY_COLUMNS.map(resolveCurrency)];
    const row = [...breakdownCols.map(breakdownValue), ...SUMMARY_COLUMNS.map(baseValue)];
    const result = parseIapCsv([line(header), line(row)].join("\n"), "demographic");
    expect(result.missingColumns).toContain("Link clicks");
    expect(result.warnings.some((w) => /Reduced confidence/.test(w))).toBe(true);
  });
});

// ─── Derived rates are not core; optional columns at moderate confidence are notes ─
//
// "CTR (link click-through rate)" and "CPM (cost per 1,000 impressions)" are
// computed from Link clicks, Impressions and spend — all of which ARE core —
// and the engine recomputes every rate from raw counts. Their absence used to
// fire "⚠ Reduced confidence" on an export the engine could analyse in full.

describe("parseIapCsv — derived-rate columns and optional-column inference", () => {
  const DERIVED = ["CTR (link click-through rate)", "CPM (cost per 1,000 impressions)"];

  function demoCsv(metricCols: readonly string[], renameHeader: (h: string) => string = (h) => h): string {
    const breakdownCols = DEMOGRAPHIC_BREAKDOWN_COLUMNS;
    const header = [...breakdownCols.map(resolveCurrency), ...metricCols.map(resolveCurrency)].map(renameHeader);
    const row = [...breakdownCols.map(breakdownValue), ...metricCols.map(baseValue)];
    return [line(header), line(row)].join("\n");
  }

  it("files a missing CTR (link) / CPM as a supplementary Note, never as Reduced confidence", () => {
    const result = parseIapCsv(demoCsv(BASE_METRICS.filter((c) => !DERIVED.includes(c))), "demographic");
    expect(result.rows.length).toBe(1);
    expect(result.warnings.some((w) => /Reduced confidence/.test(w))).toBe(false);
    const note = result.warnings.find((w) => /^Note: supplementary metric columns not found/.test(w));
    expect(note).toBeDefined();
    expect(note).toContain("CTR (link click-through rate)");
    expect(note).toContain("CPM (cost per 1,000 impressions)");
    // Still recorded as absent for the confidence report.
    expect(result.missingColumns).toContain("CPM (cost per 1,000 impressions)");
  });

  it("still fires Reduced confidence for a genuinely core column (Link clicks)", () => {
    const result = parseIapCsv(demoCsv(BASE_METRICS.filter((c) => c !== "Link clicks")), "demographic");
    expect(result.warnings.some((w) => /Reduced confidence/.test(w) && /Link clicks/.test(w))).toBe(true);
  });

  it("prefixes a moderate-confidence match on an OPTIONAL column with Note:, and leaves a core one as please-verify", () => {
    // "Post saves count" ↔ "Post saves": 2 of 3 tokens (67%) — moderate.
    // "Link clicks count" ↔ "Link clicks": same score, but core.
    const result = parseIapCsv(
      demoCsv(BASE_METRICS, (h) => (h === "Post saves" ? "Post saves count" : h === "Link clicks" ? "Link clicks count" : h)),
      "demographic",
    );
    const optional = result.warnings.find((w) => /"Post saves"/.test(w) && /moderate confidence/.test(w));
    const core = result.warnings.find((w) => /"Link clicks"/.test(w) && /moderate confidence/.test(w));
    expect(optional).toBeDefined();
    expect(optional!.startsWith("Note: ")).toBe(true);
    expect(core).toBeDefined();
    expect(core!.startsWith("Note: ")).toBe(false);
    expect(core).toContain("please verify");
  });
});
