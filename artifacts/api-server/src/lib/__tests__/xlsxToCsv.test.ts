// Unit tests for the XLSX → canonical CSV text conversion layer
// (xlsxToCsv.ts). No database needed — every workbook here is built
// programmatically with exceljs, mirroring the synthetic-CSV pattern already
// used in iapCsvParser.test.ts / manualImportsCsv.test.ts, so the same
// canonical column values feed both a CSV and an XLSX fixture and the two
// parses can be compared directly.
//
// Covers:
//   - A correctly-typed XLSX (Date cell for "Day", string cell for "Ad ID")
//     parses identically to the equivalent CSV.
//   - A deliberately precision-lossy Ad ID (an 18-digit value stored as a
//     JS number, the exact failure mode observed in a real Google-Sheets-
//     authored export) trips the corruption guard: the cell is blanked, a
//     specific warning is produced, and the file still parses successfully
//     (Ad ID is not a required breakdown column).
//   - The same guard applied to "Ad set ID" / "Campaign ID".
//   - A safe-range numeric ID (fits in Number.MAX_SAFE_INTEGER) is NOT
//     flagged — only genuinely lossy values are.
//   - Multi-sheet workbooks: the visible/active sheet is read; a hidden
//     first sheet doesn't crash or get selected over a visible one.
//   - Blank trailing rows are skipped, matching parseIapCsv's own
//     fully-blank-row skip for CSV.
//   - The existing CSV path (parseIapCsv on raw text) is completely
//     unaffected by this module's existence — regression guard for the one
//     thing this change must never touch.

import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { convertXlsxToCsvText, looksLikeXlsxContent } from "../xlsxToCsv";
import { parseIapCsv, IapCsvFormatError } from "../iapCsvParser";
import { BASE_METRICS, DEMOGRAPHIC_BREAKDOWN_COLUMNS, DEVICE_PLACEMENT_BREAKDOWN_COLUMNS } from "../iapCsvSpec";

// ── CSV fixture builder (mirrors iapCsvParser.test.ts) ─────────────────────

const q = (cell: string): string => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);
const line = (cells: string[]): string => cells.map(q).join(",");
const resolveCurrency = (col: string): string =>
  col === "Amount spent ({ACCOUNT_CURRENCY})" ? "Amount spent (USD)" : col;

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

function validCsvText(): string {
  const header = [...DEMOGRAPHIC_BREAKDOWN_COLUMNS.map(resolveCurrency), ...BASE_METRICS.map(resolveCurrency)];
  const row = [...DEMOGRAPHIC_BREAKDOWN_COLUMNS.map(breakdownValue), ...BASE_METRICS.map(baseValue)];
  return [line(header), line(row)].join("\n");
}

// ── XLSX fixture builder ────────────────────────────────────────────────

/** Cell values keyed by canonical column name, for building one XLSX data row. */
type CellPlan = Record<string, ExcelJS.CellValue | { numFmt?: string; value: ExcelJS.CellValue }>;

async function buildWorkbookBuffer(
  breakdownCols: readonly string[],
  rows: CellPlan[],
  opts: { sheetName?: string; extraHiddenSheet?: boolean } = {},
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  if (opts.extraHiddenSheet) {
    workbook.addWorksheet("Hidden", { state: "hidden" });
  }
  const sheet = workbook.addWorksheet(opts.sheetName ?? "Sheet1");
  const header = [...breakdownCols.map(resolveCurrency), ...BASE_METRICS.map(resolveCurrency)];
  sheet.addRow(header);
  for (const plan of rows) {
    const cells = header.map((col) => {
      const entry = plan[col];
      if (entry && typeof entry === "object" && "value" in entry) return entry.value;
      return entry ?? "";
    });
    const excelRow = sheet.addRow(cells);
    header.forEach((col, i) => {
      const entry = plan[col];
      if (entry && typeof entry === "object" && "numFmt" in entry && entry.numFmt) {
        excelRow.getCell(i + 1).numFmt = entry.numFmt;
      }
    });
  }
  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

/** A row plan with well-typed cells matching validCsvText()'s single data row. */
function goodDemographicRowPlan(): CellPlan {
  return {
    Day: { value: new Date(Date.UTC(2026, 5, 1)) }, // June 1, 2026 → "2026-06-01"
    "Campaign ID": "6001",
    "Campaign name": "Prospecting - Broad",
    "Ad set ID": "7001",
    "Ad set name": "Prospecting - Broad - AS1",
    "Ad ID": "8001",
    "Ad name": "UGC_Testimonial_v1",
    Gender: "female",
    Age: "25-34",
    Text: "",
    "Amount spent (USD)": 42.5,
    Reach: 4800,
    Impressions: 5100,
    "Result type": "Purchases",
    Results: 3,
  };
}

describe("convertXlsxToCsvText — valid workbook parses identically to the equivalent CSV", () => {
  it("produces the same parsed rows as the CSV fixture (Date cell, string Ad ID)", async () => {
    const buf = await buildWorkbookBuffer(DEMOGRAPHIC_BREAKDOWN_COLUMNS, [goodDemographicRowPlan()]);
    const { csvText, warnings } = await convertXlsxToCsvText(buf);
    expect(warnings).toEqual([]);

    const xlsxResult = parseIapCsv(csvText, "demographic");
    const csvResult = parseIapCsv(validCsvText(), "demographic");

    expect(xlsxResult.rows.length).toBe(1);
    expect(xlsxResult.rows[0]!.breakdowns).toEqual(csvResult.rows[0]!.breakdowns);
    expect(xlsxResult.rows[0]!.base["amount_spent"]).toBe(csvResult.rows[0]!.base["amount_spent"]);
    expect(xlsxResult.rows[0]!.base["impressions"]).toBe(csvResult.rows[0]!.base["impressions"]);
    expect(xlsxResult.rows[0]!.breakdowns["Day"]).toBe("2026-06-01");
    expect(xlsxResult.warnings).toEqual([]);
    expect(xlsxResult.missingColumns).toEqual([]);
  });

  it("detects XLSX content via ZIP magic bytes even without relying on the filename", async () => {
    const buf = await buildWorkbookBuffer(DEMOGRAPHIC_BREAKDOWN_COLUMNS, [goodDemographicRowPlan()]);
    expect(looksLikeXlsxContent(buf)).toBe(true);
    expect(looksLikeXlsxContent(Buffer.from("Day,Ad name\n2026-06-01,x", "utf8"))).toBe(false);
  });
});

describe("convertXlsxToCsvText — Ad/Ad set/Campaign ID precision-loss guard", () => {
  it("blanks a lossy 18-digit Ad ID stored as a number and reports a specific warning, without blocking the parse", async () => {
    const plan = goodDemographicRowPlan();
    // The exact failure mode observed in a real Google-Sheets-authored export:
    // an 18-digit Meta Ad ID rounded to a float and displayed in scientific
    // notation. 120253000000000000 > Number.MAX_SAFE_INTEGER.
    plan["Ad ID"] = { value: 120253000000000000, numFmt: "0.00E+00" };
    const buf = await buildWorkbookBuffer(DEMOGRAPHIC_BREAKDOWN_COLUMNS, [plan]);
    const { csvText, warnings } = await convertXlsxToCsvText(buf);

    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain('"Ad ID"');
    expect(warnings[0]).toContain("rounded number");

    // Ad ID is not in demographic's requiredBreakdownColumns — the file must
    // still parse successfully, with the corrupted cell left blank (never a
    // silently-wrong value).
    const result = parseIapCsv(csvText, "demographic");
    expect(result.rows.length).toBe(1);
    expect(result.rows[0]!.breakdowns["Ad ID"]).toBe("");
    expect(result.rows[0]!.breakdowns["Ad name"]).toBe("UGC_Testimonial_v1"); // unaffected sibling column
  });

  it("does NOT flag a safe-integer numeric ID (no precision loss possible)", async () => {
    const plan = goodDemographicRowPlan();
    plan["Ad ID"] = { value: 8001 }; // plain small number, well within Number.MAX_SAFE_INTEGER
    const buf = await buildWorkbookBuffer(DEMOGRAPHIC_BREAKDOWN_COLUMNS, [plan]);
    const { csvText, warnings } = await convertXlsxToCsvText(buf);
    expect(warnings).toEqual([]);
    const result = parseIapCsv(csvText, "demographic");
    expect(result.rows[0]!.breakdowns["Ad ID"]).toBe("8001");
  });

  it("applies the same guard independently to Ad set ID and Campaign ID in a device_placement export", async () => {
    const plan: CellPlan = {
      Day: { value: new Date(Date.UTC(2026, 5, 1)) },
      "Campaign ID": { value: 120253000000000001, numFmt: "0.00E+00" },
      "Campaign name": "Prospecting - Broad",
      "Ad set ID": { value: 120253000000000002, numFmt: "0.00E+00" },
      "Ad set name": "Prospecting - Broad - AS1",
      "Ad ID": "8001", // this one is a proper string — must stay untouched
      "Ad name": "UGC_Testimonial_v1",
      "Impression device": "iphone",
      Platform: "facebook",
      Placement: "feed",
      "Amount spent (USD)": 42.5,
      Reach: 4800,
      Impressions: 5100,
      "Result type": "Purchases",
      Results: 3,
    };
    const buf = await buildWorkbookBuffer(DEVICE_PLACEMENT_BREAKDOWN_COLUMNS, [plan]);
    const { csvText, warnings } = await convertXlsxToCsvText(buf);

    expect(warnings.length).toBe(2);
    expect(warnings.some((w) => w.includes('"Campaign ID"'))).toBe(true);
    expect(warnings.some((w) => w.includes('"Ad set ID"'))).toBe(true);
    expect(warnings.some((w) => w.includes('"Ad ID"'))).toBe(false);

    const result = parseIapCsv(csvText, "device_placement");
    expect(result.rows[0]!.breakdowns["Campaign ID"]).toBe("");
    expect(result.rows[0]!.breakdowns["Ad set ID"]).toBe("");
    expect(result.rows[0]!.breakdowns["Ad ID"]).toBe("8001");
  });
});

describe("convertXlsxToCsvText — sheet selection and row handling", () => {
  it("reads the visible sheet when the first sheet in the workbook is hidden", async () => {
    const buf = await buildWorkbookBuffer(DEMOGRAPHIC_BREAKDOWN_COLUMNS, [goodDemographicRowPlan()], {
      extraHiddenSheet: true,
      sheetName: "Data",
    });
    const { csvText } = await convertXlsxToCsvText(buf);
    const result = parseIapCsv(csvText, "demographic");
    expect(result.rows.length).toBe(1);
    expect(result.rows[0]!.breakdowns["Ad name"]).toBe("UGC_Testimonial_v1");
  });

  it("skips a fully-blank trailing row (e.g. a leftover totals-row artifact)", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Sheet1");
    const header = [...DEMOGRAPHIC_BREAKDOWN_COLUMNS.map(resolveCurrency), ...BASE_METRICS.map(resolveCurrency)];
    sheet.addRow(header);
    const plan = goodDemographicRowPlan();
    sheet.addRow(header.map((col) => {
      const entry = plan[col];
      return entry && typeof entry === "object" && "value" in entry ? entry.value : entry ?? "";
    }));
    sheet.addRow(header.map(() => null)); // fully blank trailing row
    const buf = Buffer.from((await workbook.xlsx.writeBuffer()) as ArrayBuffer);

    const { csvText } = await convertXlsxToCsvText(buf);
    const result = parseIapCsv(csvText, "demographic");
    expect(result.rows.length).toBe(1);
  });

  it("throws a clear format error for a workbook with no worksheets", async () => {
    const workbook = new ExcelJS.Workbook();
    const buf = Buffer.from((await workbook.xlsx.writeBuffer()) as ArrayBuffer);
    await expect(convertXlsxToCsvText(buf)).rejects.toThrow(IapCsvFormatError);
  });

  it("throws a clear format error for bytes that are not a real XLSX workbook", async () => {
    await expect(convertXlsxToCsvText(Buffer.from("not an xlsx file"))).rejects.toThrow(IapCsvFormatError);
  });
});

describe("regression: the existing CSV path is completely unaffected", () => {
  it("parseIapCsv on plain CSV text still works exactly as before", () => {
    const result = parseIapCsv(validCsvText(), "demographic");
    expect(result.rows.length).toBe(1);
    expect(result.rows[0]!.breakdowns["Ad name"]).toBe("UGC_Testimonial_v1");
    expect(result.warnings).toEqual([]);
    expect(result.missingColumns).toEqual([]);
  });
});

// ── Multi-sheet class-aware selection ───────────────────────────────────

describe("multi-sheet workbook sheet selection", () => {
  async function buildMultiSheetBuffer(exportSheetFirst: boolean): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const addCover = () => {
      const cover = workbook.addWorksheet("Notes");
      cover.addRow(["Internal working notes", "Owner"]);
      cover.addRow(["remember to update budget", "AJ"]);
    };
    const addExport = () => {
      const sheet = workbook.addWorksheet("IAP-DEMO-EXPORT");
      const header = [...DEMOGRAPHIC_BREAKDOWN_COLUMNS.map(resolveCurrency), ...BASE_METRICS.map(resolveCurrency)];
      sheet.addRow(header);
      sheet.addRow([...DEMOGRAPHIC_BREAKDOWN_COLUMNS.map(breakdownValue), ...BASE_METRICS.map(baseValue)]);
    };
    if (exportSheetFirst) {
      addExport();
      addCover();
    } else {
      addCover();
      addExport();
    }
    // Active tab points at the FIRST sheet either way (Sheets default).
    workbook.views = [{ x: 0, y: 0, width: 10000, height: 20000, firstSheet: 0, activeTab: 0, visibility: "visible" }];
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  it("finds the export sheet even when a notes tab is first/active (the failed AAFE workbook shape)", async () => {
    const buf = await buildMultiSheetBuffer(false);
    const { csvText } = await convertXlsxToCsvText(buf, ["Day", "Campaign name", "Ad name", "Gender", "Age"]);
    const parsed = parseIapCsv(csvText, "demographic");
    expect(parsed.rows.length).toBe(1);
    expect(parsed.rows[0]!.breakdowns["Ad name"]).toBe("UGC_Testimonial_v1");
  });

  it("keeps the previous active-tab behavior when no expectation is given", async () => {
    const buf = await buildMultiSheetBuffer(false);
    const { csvText } = await convertXlsxToCsvText(buf);
    expect(csvText.split("\n")[0]).toContain("Internal working notes");
  });

  it("still picks the active export sheet when it comes first", async () => {
    const buf = await buildMultiSheetBuffer(true);
    const { csvText } = await convertXlsxToCsvText(buf, ["Day", "Campaign name", "Ad name", "Gender", "Age"]);
    expect(parseIapCsv(csvText, "demographic").rows.length).toBe(1);
  });
});
