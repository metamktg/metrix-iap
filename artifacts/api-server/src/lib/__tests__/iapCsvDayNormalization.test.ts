// Regression tests for "Day" date-format normalization (normalizeDayValues)
// and the CSV-path ID-corruption guard.
//
// Root-cause context (August 2026, AAFE account): a Demographics CSV
// re-exported through Google Sheets carried "7/1/2026"-style slash dates
// while the Placements XLSX carried ISO "2026-07-01". The parser passed both
// through verbatim, so the same real-world day existed under two different
// bucket keys, the engine's lexicographic min/max window math produced a
// wrong analysis window (destroying neighbouring rows via the window-delete),
// and Postgres — which compares parsed dates, not strings — rejected the
// second row for the same day with "duplicate key value violates unique
// constraint ad_performance_account_id_ad_name_campaign_name_result_type_key".
// These tests pin the normalization contract that prevents the entire class.
//
// Pure unit tests — no DB, no network.

import { describe, expect, it } from "vitest";
import { normalizeDayValues, parseIapCsv, IapCsvFormatError, type IapCsvRow } from "../iapCsvParser";
import { DEMOGRAPHIC_BREAKDOWN_COLUMNS, BASE_METRICS } from "../iapCsvSpec";

function rowWithDay(day: string): IapCsvRow {
  return { breakdowns: { Day: day }, base: {}, extra: {} };
}

function days(rows: IapCsvRow[]): string[] {
  return rows.map((r) => r.breakdowns["Day"]!);
}

describe("normalizeDayValues", () => {
  it("passes ISO dates through unchanged with no warning", () => {
    const rows = [rowWithDay("2026-07-01"), rowWithDay("2026-08-17")];
    const warnings: string[] = [];
    normalizeDayValues(rows, warnings);
    expect(days(rows)).toEqual(["2026-07-01", "2026-08-17"]);
    expect(warnings).toEqual([]);
  });

  it("normalizes M/D/YYYY when a second component > 12 disambiguates (the AAFE case)", () => {
    const rows = [rowWithDay("7/1/2026"), rowWithDay("7/13/2026"), rowWithDay("8/9/2026")];
    const warnings: string[] = [];
    normalizeDayValues(rows, warnings);
    expect(days(rows)).toEqual(["2026-07-01", "2026-07-13", "2026-08-09"]);
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("M/D/YYYY");
    expect(warnings[0]).toContain("normalized to YYYY-MM-DD");
  });

  it("normalizes D/M/YYYY when a first component > 12 disambiguates", () => {
    const rows = [rowWithDay("13/7/2026"), rowWithDay("1/8/2026")];
    const warnings: string[] = [];
    normalizeDayValues(rows, warnings);
    expect(days(rows)).toEqual(["2026-07-13", "2026-08-01"]);
    expect(warnings[0]).toContain("D/M/YYYY");
  });

  it("normalizes YYYY/M/D slash dates", () => {
    const rows = [rowWithDay("2026/7/1")];
    const warnings: string[] = [];
    normalizeDayValues(rows, warnings);
    expect(days(rows)).toEqual(["2026-07-01"]);
    expect(warnings.length).toBe(1);
  });

  it("handles mixed ISO and slash formats in one file (two staged files merged)", () => {
    const rows = [rowWithDay("2026-07-13"), rowWithDay("7/13/2026")];
    const warnings: string[] = [];
    normalizeDayValues(rows, warnings);
    // Both now the SAME key — the property whose absence caused the
    // duplicate-key crash.
    expect(days(rows)).toEqual(["2026-07-13", "2026-07-13"]);
  });

  it("hard-errors when every slash value is ambiguous rather than guessing", () => {
    const rows = [rowWithDay("7/1/2026"), rowWithDay("7/2/2026")];
    expect(() => normalizeDayValues(rows, [])).toThrow(IapCsvFormatError);
    expect(() => normalizeDayValues(rows, [])).toThrow(/ambiguous/);
  });

  it("hard-errors on incompatible mixed slash formats", () => {
    const rows = [rowWithDay("13/1/2026"), rowWithDay("1/13/2026")];
    expect(() => normalizeDayValues(rows, [])).toThrow(/incompatible/);
  });

  it("hard-errors on spreadsheet date serial numbers with a serial-specific hint", () => {
    const rows = [rowWithDay("45832")];
    expect(() => normalizeDayValues(rows, [])).toThrow(/serial number/);
  });

  it("hard-errors on impossible calendar dates", () => {
    const rows = [rowWithDay("2026-02-30")];
    expect(() => normalizeDayValues(rows, [])).toThrow(/not a real calendar date/);
  });

  it("hard-errors on two-digit-year and datetime shapes", () => {
    expect(() => normalizeDayValues([rowWithDay("7/13/26")], [])).toThrow(IapCsvFormatError);
    expect(() => normalizeDayValues([rowWithDay("2026-07-01 00:00")], [])).toThrow(IapCsvFormatError);
  });
});

// ── End-to-end through parseIapCsv ──────────────────────────────────────

const q = (cell: string): string => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);
const line = (cells: string[]): string => cells.map(q).join(",");
const resolveCurrency = (col: string): string =>
  col === "Amount spent ({ACCOUNT_CURRENCY})" ? "Amount spent (USD)" : col;

function demoCsv(rows: { day: string; adId?: string }[]): string {
  const header = [...DEMOGRAPHIC_BREAKDOWN_COLUMNS, ...BASE_METRICS].map(resolveCurrency);
  const dataLines = rows.map((r) =>
    line([
      ...DEMOGRAPHIC_BREAKDOWN_COLUMNS.map((c) => {
        switch (c) {
          case "Day": return r.day;
          case "Campaign ID": return "9001";
          case "Campaign name": return "DayNorm Campaign";
          case "Ad set ID": return "9101";
          case "Ad set name": return "DayNorm AS1";
          case "Ad ID": return r.adId ?? "9201";
          case "Ad name": return "DayNorm Ad";
          case "Gender": return "female";
          case "Age": return "25-34";
          default: return "";
        }
      }),
      ...BASE_METRICS.map((col) => {
        if (col === "Amount spent ({ACCOUNT_CURRENCY})") return "10.00";
        if (col === "Result type") return "Purchases";
        if (col === "Impressions") return "1000";
        if (col === "Reach") return "900";
        if (col === "Results") return "2";
        return "";
      }),
    ]),
  );
  return [line(header), ...dataLines].join("\n");
}

describe("parseIapCsv Day normalization integration", () => {
  it("returns ISO days for an M/D/YYYY demographic export and warns once", () => {
    const res = parseIapCsv(demoCsv([{ day: "7/1/2026" }, { day: "7/13/2026" }]), "demographic");
    expect(res.rows.map((r) => r.breakdowns["Day"])).toEqual(["2026-07-01", "2026-07-13"]);
    expect(res.warnings.some((w) => w.includes("normalized to YYYY-MM-DD"))).toBe(true);
  });

  it("blanks scientific-notation Ad IDs (Sheets CSV corruption) with one summary warning", () => {
    const res = parseIapCsv(
      demoCsv([
        { day: "2026-07-01", adId: "1.20253E+17" },
        { day: "2026-07-02", adId: "120253000000000001" },
      ]),
      "demographic",
    );
    expect(res.rows[0]!.breakdowns["Ad ID"]).toBe("");
    // Exact digit strings are preserved — only scientific notation is lossy.
    expect(res.rows[1]!.breakdowns["Ad ID"]).toBe("120253000000000001");
    const idWarnings = res.warnings.filter((w) => w.includes('"Ad ID"') && w.includes("scientific notation"));
    expect(idWarnings.length).toBe(1);
    expect(idWarnings[0]).toContain("1.20253E+17");
  });
});
