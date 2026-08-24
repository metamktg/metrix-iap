// Warning-panel signal quality + cross-file duplicate dedupe.
//
// Real-account context (AAFE, Aug 24): the staging popup showed ~17 warnings
// of which 12 were "auto-matched (via slug match)" notes for derived/ratio
// columns the server recomputes anyway, burying the two that mattered (ID
// corruption + date normalization); "Amount spent _USD_" drew a spurious
// "moderate confidence (67%) — please verify" because the currency
// placeholder is stripped from the canonical's slug; and the same demo
// export staged as BOTH .xlsx and .csv double-counted every demographic
// metric ($856.52 → $1,713.05) because multi-file-per-slot is additive and
// the md5 guard only catches byte-identical files.
//
// Pure unit tests — no DB, no network.

import { describe, expect, it } from "vitest";
import { findColumnInHeader, DEMOGRAPHIC_BREAKDOWN_COLUMNS, BASE_METRICS } from "../iapCsvSpec";
import { parseIapCsv, type IapCsvRow } from "../iapCsvParser";
import { appendRowsCrossFileDeduped, stableRowSignature } from "../analysisEngine";

// ── Currency slug matching ──────────────────────────────────────────────

describe("findColumnInHeader currency slug tolerance", () => {
  it('matches spreadsheet-mangled "Amount spent _USD_" as a slug match, not a hedged inference', () => {
    const match = findColumnInHeader(["Day", "Amount spent _USD_"], "Amount spent ({ACCOUNT_CURRENCY})");
    expect(match).not.toBeNull();
    expect(match!.headerValue).toBe("Amount spent _USD_");
    expect(match!.via).toBe("slug");
    expect(match!.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("still prefers the exact currency form when present", () => {
    const match = findColumnInHeader(["Amount spent (USD)"], "Amount spent ({ACCOUNT_CURRENCY})");
    expect(match!.via).toBe("currency");
  });

  it("does not match unrelated columns through the currency slug pattern", () => {
    const match = findColumnInHeader(["Amount refunded _USD_"], "Amount spent ({ACCOUNT_CURRENCY})");
    expect(match).toBeNull();
  });
});

// ── Warning folding ─────────────────────────────────────────────────────

const q = (cell: string): string => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);
const line = (cells: string[]): string => cells.map(q).join(",");

function mangle(col: string): string {
  // Google-Sheets-style mangling observed in the real file: parentheses and
  // commas become underscores.
  return col.replace(/[(),]/g, "_").replace(/__+/g, "_").replace(/ _/g, " _");
}

it("folds derived/deterministic auto-matches into one line; real warnings stay individual", () => {
  const breakdowns = [...DEMOGRAPHIC_BREAKDOWN_COLUMNS];
  const primitives = BASE_METRICS.map((c) => (c === "Amount spent ({ACCOUNT_CURRENCY})" ? "Amount spent _USD_" : c));
  const derivedMangled = [
    mangle("CPM (cost per 1,000 impressions)"),
    mangle("CTR (all)"),
    mangle("CPC (cost per link click)"),
    mangle("Purchase ROAS (return on ad spend)"),
  ];
  const header = [...breakdowns, ...primitives, ...derivedMangled];
  const row = header.map((h) => {
    if (h === "Day") return "2026-07-13";
    if (h === "Campaign name") return "C1";
    if (h === "Ad set name") return "AS";
    if (h === "Ad name") return "Ad A";
    if (h === "Gender") return "female";
    if (h === "Age") return "25-34";
    if (h.startsWith("Amount spent")) return "10.00";
    if (h === "Impressions") return "1000";
    if (h === "Reach") return "900";
    if (h === "Results") return "2";
    if (h === "Result type") return "Purchases";
    return "";
  });
  const res = parseIapCsv([line(header), line(row)].join("\n"), "demographic");

  // No per-column slug-noise lines…
  const noisy = res.warnings.filter((w) => w.includes("auto-matched from") && w.includes("slug match"));
  expect(noisy).toEqual([]);
  // …and no spurious "please verify" hedge on the mangled spend column.
  expect(res.warnings.some((w) => w.includes("moderate confidence"))).toBe(false);
  // One folded summary line naming an example mapping.
  const folded = res.warnings.filter((w) => w.includes("matched automatically by normalized name"));
  expect(folded.length).toBe(1);
  expect(folded[0]).toContain("→");
  // Mapping detail is still recorded for the confidence report.
  expect(res.mappingSummary.some((e) => e.foundAs === "Amount spent _USD_")).toBe(true);
});

// ── Cross-file duplicate dedupe ─────────────────────────────────────────

function csvRow(day: string, ad: string, spend: number): IapCsvRow {
  return {
    breakdowns: { Day: day, "Campaign name": "C1", "Ad set name": "AS", "Ad name": ad, Gender: "female", Age: "25-34" },
    base: { amount_spent: spend, impressions: 100, results: 1, result_type: "Purchases" },
    extra: {},
  };
}

describe("appendRowsCrossFileDeduped", () => {
  it("drops exact duplicates from a second file and says so; disjoint rows stay additive", () => {
    const target: IapCsvRow[] = [];
    const seen = new Set<string>();
    const warnings: string[] = [];
    // File 1: two days.
    appendRowsCrossFileDeduped(target, [csvRow("2026-07-13", "A", 10), csvRow("2026-07-14", "A", 12)], seen, {
      filename: "week1.xlsx", label: "Demographics", warnings,
    });
    // File 2: same export re-saved (both rows duplicate) plus one new day.
    appendRowsCrossFileDeduped(
      target,
      [csvRow("2026-07-13", "A", 10), csvRow("2026-07-14", "A", 12), csvRow("2026-07-15", "A", 9)],
      seen,
      { filename: "week1-copy.csv", label: "Demographics", warnings },
    );
    expect(target.length).toBe(3); // never double-counted
    expect(warnings.length).toBe(1);
    expect(warnings[0]).toContain("[Duplicate data] 2 row(s)");
    expect(warnings[0]).toContain("week1-copy.csv");
  });

  it("keeps rows that share a key but differ in metrics (campaign-split exports are legitimate)", () => {
    const target: IapCsvRow[] = [];
    const seen = new Set<string>();
    const warnings: string[] = [];
    appendRowsCrossFileDeduped(target, [csvRow("2026-07-13", "A", 10)], seen, { filename: "f1.csv", label: "Demographics", warnings });
    appendRowsCrossFileDeduped(target, [csvRow("2026-07-13", "A", 99)], seen, { filename: "f2.csv", label: "Demographics", warnings });
    expect(target.length).toBe(2);
    expect(warnings).toEqual([]);
  });

  it("preserves duplicates WITHIN one file (source-data property, not editorialized)", () => {
    const target: IapCsvRow[] = [];
    const seen = new Set<string>();
    const warnings: string[] = [];
    appendRowsCrossFileDeduped(target, [csvRow("2026-07-13", "A", 10), csvRow("2026-07-13", "A", 10)], seen, {
      filename: "f1.csv", label: "Demographics", warnings,
    });
    expect(target.length).toBe(2);
    expect(warnings).toEqual([]);
  });

  it("signature ignores column order differences between files", () => {
    const a: IapCsvRow = { breakdowns: { Day: "2026-07-13", "Ad name": "A" }, base: { x: 1, y: 2 }, extra: {} };
    const b: IapCsvRow = { breakdowns: { "Ad name": "A", Day: "2026-07-13" }, base: { y: 2, x: 1 }, extra: {} };
    expect(stableRowSignature(a)).toBe(stableRowSignature(b));
  });
});
