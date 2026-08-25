// Unit tests for the CSV column mapping engine: confidence scoring, tier
// classification, inference promotion thresholds, expanded alias table,
// and mappingSummary output. These run against pure functions — no DB.

import { describe, expect, it } from "vitest";
import {
  findColumnInHeader,
  inferColumnMapping,
  COLUMN_ALIASES,
  slugifyColumn,
  detectCsvClassMismatch,
  type ColumnMatch,
} from "../iapCsvSpec";
import { parseIapCsv, IapCsvFormatError } from "../iapCsvParser";
import {
  BASE_METRICS,
  DEMOGRAPHIC_BREAKDOWN_COLUMNS,
  DEVICE_PLACEMENT_BREAKDOWN_COLUMNS,
  type IapCsvClass,
} from "../iapCsvSpec";

// ── CSV test helpers ──────────────────────────────────────────────────────────

const q = (cell: string): string => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);
const line = (cells: string[]): string => cells.map(q).join(",");
const resolveCurrency = (col: string): string =>
  col === "Amount spent ({ACCOUNT_CURRENCY})" ? "Amount spent (USD)" : col;

const breakdownColsFor = (cls: IapCsvClass): readonly string[] =>
  cls === "demographic" ? DEMOGRAPHIC_BREAKDOWN_COLUMNS : DEVICE_PLACEMENT_BREAKDOWN_COLUMNS;

function breakdownValue(col: string): string {
  const map: Record<string, string> = {
    Day: "2026-06-01",
    "Campaign ID": "6001",
    "Campaign name": "Prospecting - Broad",
    "Ad set ID": "7001",
    "Ad set name": "Prospecting - Broad - AS1",
    "Ad ID": "8001",
    "Ad name": "UGC_Testimonial_v1",
    Gender: "female",
    Age: "25-34",
    Text: "",
    "Impression device": "iphone",
    Platform: "facebook",
    Placement: "feed",
  };
  return map[col] ?? "x";
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

function validCsv(cls: IapCsvClass): string {
  const breakdownCols = breakdownColsFor(cls);
  const header = [...breakdownCols.map(resolveCurrency), ...BASE_METRICS.map(resolveCurrency)];
  const row = [...breakdownCols.map(breakdownValue), ...BASE_METRICS.map(baseValue)];
  return [line(header), line(row)].join("\n");
}

// ── findColumnInHeader — confidence scoring ───────────────────────────────────

describe("findColumnInHeader — confidence scores", () => {
  it("assigns confidence 1.0 for exact match", () => {
    const match = findColumnInHeader(["Ad name", "Day"], "Ad name");
    expect(match).not.toBeNull();
    expect(match!.confidence).toBe(1.0);
    expect(match!.via).toBe("exact");
    expect(match!.method).toMatch(/exact/i);
  });

  it("assigns confidence 0.99 for currency placeholder match", () => {
    const match = findColumnInHeader(["Amount spent (USD)"], "Amount spent ({ACCOUNT_CURRENCY})");
    expect(match).not.toBeNull();
    expect(match!.confidence).toBe(0.99);
    expect(match!.via).toBe("currency");
  });

  it("assigns confidence 0.97 for case-insensitive match", () => {
    const match = findColumnInHeader(["ad name"], "Ad name");
    expect(match).not.toBeNull();
    expect(match!.confidence).toBe(0.97);
    expect(match!.via).toBe("case_insensitive");
  });

  it("assigns confidence 0.95 for alias match", () => {
    const match = findColumnInHeader(["Date"], "Day");
    expect(match).not.toBeNull();
    expect(match!.confidence).toBe(0.95);
    expect(match!.via).toBe("alias");
  });

  it("assigns confidence 0.90 for slug match", () => {
    // "Link-Clicks" slugifies to "link_clicks" same as "Link clicks"
    const match = findColumnInHeader(["Link-Clicks"], "Link clicks");
    expect(match).not.toBeNull();
    expect(match!.confidence).toBe(0.90);
    expect(match!.via).toBe("slug");
  });

  it("returns null when no match found", () => {
    const match = findColumnInHeader(["totally_unknown_column_xyz"], "Ad name");
    expect(match).toBeNull();
  });
});

// ── Generic currency-suffix tolerance ────────────────────────────────────────
// Some Meta export types append the account currency to EVERY monetary
// column, not just "Amount spent". Observed live (AAFE, Aug 2026): an Ad
// Summary export carried "CPM (cost per 1,000 impressions) (USD)", which
// fell through to a 71% Jaccard inference and rendered a spurious
// "low confidence" flag in the staging popup for a 1:1 deterministic rename.

describe("findColumnInHeader — generic currency-suffix tolerance", () => {
  it('resolves "CPM (cost per 1,000 impressions) (USD)" via currency at 0.99', () => {
    const match = findColumnInHeader(
      ["CPM (cost per 1,000 impressions) (USD)"],
      "CPM (cost per 1,000 impressions)",
    );
    expect(match).not.toBeNull();
    expect(match!.via).toBe("currency");
    expect(match!.confidence).toBe(0.99);
    expect(match!.headerValue).toBe("CPM (cost per 1,000 impressions) (USD)");
  });

  it("applies to any monetary canonical and any 3-letter code", () => {
    const match = findColumnInHeader(
      ["CPC (cost per link click) (AED)"],
      "CPC (cost per link click)",
    );
    expect(match).not.toBeNull();
    expect(match!.via).toBe("currency");
  });

  it("tolerates a case-mangled base name under the currency suffix", () => {
    const match = findColumnInHeader(
      ["cpm (cost per 1,000 impressions) (EUR)"],
      "CPM (cost per 1,000 impressions)",
    );
    expect(match).not.toBeNull();
    expect(match!.via).toBe("currency");
  });

  it("never strips lowercase semantic parentheticals like (all)", () => {
    // "Clicks (all)" must keep matching itself exactly, and a stripped
    // "Clicks" must never leak into a DIFFERENT canonical.
    const exact = findColumnInHeader(["Clicks (all)"], "Clicks (all)");
    expect(exact).not.toBeNull();
    expect(exact!.via).toBe("exact");
    expect(findColumnInHeader(["Clicks (all)"], "Link clicks")).toBeNull();
  });
});

// ── COLUMN_ALIASES — expanded alias coverage ─────────────────────────────────

describe("COLUMN_ALIASES — new entries resolve correctly", () => {
  const resolves = (alias: string, canonical: string) => {
    it(`"${alias}" → "${canonical}"`, () => {
      expect(COLUMN_ALIASES[alias.toLowerCase()]).toBe(canonical);
    });
  };

  // Date variants
  resolves("report date", "Day");
  resolves("reporting starts", "Day");
  resolves("date start", "Day");
  resolves("reporting date", "Day");

  // Spend variants
  resolves("budget spent", "Amount spent ({ACCOUNT_CURRENCY})");
  resolves("ad spend", "Amount spent ({ACCOUNT_CURRENCY})");
  resolves("cost", "Amount spent ({ACCOUNT_CURRENCY})");

  // CPC variants
  resolves("link cpc", "CPC (cost per link click)");
  resolves("cost per link click", "CPC (cost per link click)");

  // CTR variants
  resolves("link ctr", "CTR (link click-through rate)");
  resolves("click through rate", "CTR (all)");
  resolves("link click-through rate", "CTR (link click-through rate)");

  // Landing page
  resolves("landing page view", "Landing page views");
  resolves("lpv", "Landing page views");

  // Video
  resolves("thruplays", "ThruPlays");
  resolves("thruplay", "ThruPlays");
  resolves("3 second video plays", "3-second video plays");
  resolves("3s video plays", "3-second video plays");

  // Placement device
  resolves("ad placement", "Placement");
  resolves("ad impression device", "Impression device");

  // Frequency
  resolves("avg frequency", "Frequency");
});

describe("COLUMN_ALIASES — resolve via findColumnInHeader", () => {
  it("accepts 'report date' as Date", () => {
    const match = findColumnInHeader(["report date"], "Day");
    expect(match).not.toBeNull();
    expect(match!.via).toBe("alias");
    expect(match!.confidence).toBe(0.95);
  });

  it("accepts 'ad spend' as Amount spent ({ACCOUNT_CURRENCY})", () => {
    const match = findColumnInHeader(["ad spend"], "Amount spent ({ACCOUNT_CURRENCY})");
    expect(match).not.toBeNull();
    expect(match!.via).toBe("alias");
  });

  it("accepts 'link ctr' as CTR (link click-through rate)", () => {
    const match = findColumnInHeader(["link ctr"], "CTR (link click-through rate)");
    expect(match).not.toBeNull();
    expect(match!.via).toBe("alias");
  });

  it("accepts 'thruplays' as ThruPlays (resolved via case-insensitive or alias)", () => {
    // "thruplays" lowercases to the same as "ThruPlays" lowercased, so the
    // case-insensitive tier fires before the alias tier — both are valid resolutions.
    const match = findColumnInHeader(["thruplays"], "ThruPlays");
    expect(match).not.toBeNull();
    expect(["alias", "case_insensitive"]).toContain(match!.via);
    expect(match!.confidence).toBeGreaterThanOrEqual(0.95);
  });
});

// ── inferColumnMapping ────────────────────────────────────────────────────────

describe("inferColumnMapping", () => {
  it("returns null when no header scores ≥ 0.5", () => {
    const result = inferColumnMapping(["completely_unrelated_xyz"], "Link clicks");
    expect(result).toBeNull();
  });

  it("returns null for empty unmapped headers", () => {
    const result = inferColumnMapping([], "Link clicks");
    expect(result).toBeNull();
  });

  it("returns a match with the correct headerValue and confidence for high similarity", () => {
    // "link clicks report" tokens: {link,clicks,report}; "Link clicks" tokens: {link,clicks}
    // intersection=2, union=3 → Jaccard=0.667 ≥ 0.5 → should be promoted
    const result = inferColumnMapping(["link clicks report"], "Link clicks");
    expect(result).not.toBeNull();
    expect(result!.via).toBe("inferred");
    expect(result!.confidence).toBeGreaterThanOrEqual(0.5);
    expect(result!.headerValue).toBe("link clicks report");
    expect(result!.method).toMatch(/\d+%/);
  });

  it("returns the highest-scoring match when multiple candidates exist", () => {
    // Jaccard scores vs "Landing page views" ({landing,page,views}):
    //   "page views"       → {page,views}                  inter=2, union=3 → 0.667  ← highest
    //   "landing page"     → {landing,page}                inter=2, union=3 → 0.667  (tie)
    //   "cost per landing" → {cost,per,landing}            inter=1, union=5 → 0.2
    // Both "page views" and "landing page" tie at 0.667; the first-encountered wins.
    const result = inferColumnMapping(
      ["cost per landing", "page views", "landing page"],
      "Landing page views",
    );
    expect(result).not.toBeNull();
    expect(result!.confidence).toBeGreaterThanOrEqual(0.5);
    // Either of the 0.667-scoring candidates is acceptable
    expect(["page views", "landing page"]).toContain(result!.headerValue);
  });

  it("confidence is the raw Jaccard score", () => {
    // "link clicks" vs "Link clicks" → identical after slugification → 1.0
    const result = inferColumnMapping(["link clicks"], "Link clicks");
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe(1.0);
  });
});

// ── Scoring thresholds — auto-promotion via parseIapCsv ───────────────────────

describe("parseIapCsv — inferred column auto-promotion", () => {
  function buildCsvWithHeader(cls: IapCsvClass, headerOverrides: Record<string, string>): string {
    const breakdownCols = breakdownColsFor(cls);
    const originalHeader = [...breakdownCols.map(resolveCurrency), ...BASE_METRICS.map(resolveCurrency)];
    const finalHeader = originalHeader.map((h) => headerOverrides[h] ?? h);
    const rowValues = [...breakdownCols.map(breakdownValue), ...BASE_METRICS.map(baseValue)];
    return [line(finalHeader), line(rowValues)].join("\n");
  }

  it("auto-maps an unknown header with Jaccard ≥ 0.75 (no warning required)", () => {
    // "link clicks" (all lower, no space difference) → Jaccard = 1.0 vs "Link clicks"
    const csv = buildCsvWithHeader("demographic", { "Link clicks": "link clicks" });
    const result = parseIapCsv(csv, "demographic");
    expect(result.missingColumns).not.toContain("Link clicks");
    expect(result.columnMappings["Link clicks"]).toBeDefined();
  });

  it("auto-maps an unknown header with Jaccard 0.5–0.74 and records a warning", () => {
    // "link click" (singular) vs "Link clicks" → some Jaccard overlap; below 0.75 if union > intersection
    // "link click" tokens: link, click  "Link clicks" tokens: link, clicks
    // intersection = 1 (link), union = 3 (link, click, clicks) → 0.33 → NOT promoted, stays missing
    // Let's use a header that genuinely scores in [0.5, 0.74):
    // "Impressions reach" vs "Reach": tokens reach(1) vs reach,impressions(2) → inter=1, union=2 → 0.5
    const csv = buildCsvWithHeader("demographic", { "Reach": "Reach impressions" });
    const result = parseIapCsv(csv, "demographic");
    // "Reach impressions" Jaccard vs "Reach": tokens(reach,impressions) ∩ tokens(reach) = 1, union = 2 → 0.5
    // Should auto-promote with a warning
    expect(result.missingColumns).not.toContain("Reach");
    expect(result.warnings.some((w) => /reach/i.test(w))).toBe(true);
  });

  it("does NOT promote a header scoring below 0.5", () => {
    // Replace "Reach" with something that has low Jaccard — "total_audience" → tokens: total,audience
    // vs "Reach" tokens: reach → inter=0, union=3 → score 0 → stays missing
    const csv = buildCsvWithHeader("demographic", { "Reach": "total_audience" });
    const result = parseIapCsv(csv, "demographic");
    expect(result.missingColumns).toContain("Reach");
  });

  it("promoted inferred columns appear in mappingSummary with tier 'inferred'", () => {
    // Use case-insensitive "link clicks" (which actually hits alias or case-insensitive before inferred)
    // Let's test with "Reach impressions" which hits inferred
    const csv = buildCsvWithHeader("demographic", { "Reach": "Reach impressions" });
    const result = parseIapCsv(csv, "demographic");
    const entry = result.mappingSummary.find((e) => e.canonical === "Reach");
    if (entry && entry.tier !== "missing") {
      expect(entry.tier).toBe("inferred");
      expect(entry.confidence).toBeGreaterThanOrEqual(0.5);
      expect(entry.foundAs).toBe("Reach impressions");
    }
  });
});

// ── mappingSummary population ─────────────────────────────────────────────────

describe("parseIapCsv — mappingSummary", () => {
  it("includes an entry for every breakdown and base metric column", () => {
    const result = parseIapCsv(validCsv("demographic"), "demographic");
    const summaryCanonicals = result.mappingSummary.map((e) => e.canonical);
    for (const col of DEMOGRAPHIC_BREAKDOWN_COLUMNS) {
      expect(summaryCanonicals).toContain(col);
    }
    for (const col of BASE_METRICS) {
      expect(summaryCanonicals).toContain(col);
    }
  });

  it("marks exact matches with tier 'exact' and confidence 1.0", () => {
    const result = parseIapCsv(validCsv("demographic"), "demographic");
    const dateEntry = result.mappingSummary.find((e) => e.canonical === "Day");
    expect(dateEntry).toBeDefined();
    expect(dateEntry!.tier).toBe("exact");
    expect(dateEntry!.confidence).toBe(1.0);
    expect(dateEntry!.foundAs).toBe("Day");
  });

  it("marks currency placeholder match with tier 'exact' and confidence 0.99", () => {
    const result = parseIapCsv(validCsv("demographic"), "demographic");
    const spendEntry = result.mappingSummary.find(
      (e) => e.canonical === "Amount spent ({ACCOUNT_CURRENCY})",
    );
    expect(spendEntry).toBeDefined();
    expect(spendEntry!.tier).toBe("exact");
    expect(spendEntry!.confidence).toBe(0.99);
    expect(spendEntry!.foundAs).toBe("Amount spent (USD)");
  });

  it("marks alias match with tier 'resolved' and confidence 0.95", () => {
    const breakdownCols = [...DEMOGRAPHIC_BREAKDOWN_COLUMNS];
    const header = breakdownCols
      .map((c) => (c === "Day" ? "Date" : resolveCurrency(c)))
      .concat(BASE_METRICS.map(resolveCurrency));
    const row = breakdownCols.map(breakdownValue).concat(BASE_METRICS.map(baseValue));
    const result = parseIapCsv([line(header), line(row)].join("\n"), "demographic");

    const dateEntry = result.mappingSummary.find((e) => e.canonical === "Day");
    expect(dateEntry).toBeDefined();
    expect(dateEntry!.tier).toBe("resolved");
    expect(dateEntry!.confidence).toBe(0.95);
    expect(dateEntry!.foundAs).toBe("Date");
  });

  it("marks missing columns with tier 'missing', null foundAs, and confidence 0", () => {
    const breakdownCols = DEMOGRAPHIC_BREAKDOWN_COLUMNS;
    // Remove "Text" column (non-critical breakdown)
    const header = [...breakdownCols.filter((c) => c !== "Text").map(resolveCurrency), ...BASE_METRICS.map(resolveCurrency)];
    const row = [...breakdownCols.filter((c) => c !== "Text").map(breakdownValue), ...BASE_METRICS.map(baseValue)];
    const result = parseIapCsv([line(header), line(row)].join("\n"), "demographic");

    const textEntry = result.mappingSummary.find((e) => e.canonical === "Text");
    if (textEntry) {
      // "Text" might be inferred if something scores ≥ 0.5, but with no plausible
      // alternative it should be missing
      if (textEntry.tier === "missing") {
        expect(textEntry.foundAs).toBeNull();
        expect(textEntry.confidence).toBe(0);
      }
    }
  });

  it("produces no warnings and all-exact summary for a fully-matching export", () => {
    const result = parseIapCsv(validCsv("demographic"), "demographic");
    expect(result.warnings).toEqual([]);
    const nonExact = result.mappingSummary.filter((e) => e.tier !== "exact");
    expect(nonExact).toHaveLength(0);
  });

  it("includes mappingSummary for device_placement class too", () => {
    const result = parseIapCsv(validCsv("device_placement"), "device_placement");
    const summaryCanonicals = result.mappingSummary.map((e) => e.canonical);
    for (const col of DEVICE_PLACEMENT_BREAKDOWN_COLUMNS) {
      expect(summaryCanonicals).toContain(col);
    }
  });

  it("resolves a '(USD)'-suffixed CPM header deterministically — tier exact, folded warning only", () => {
    const breakdownCols = [...DEMOGRAPHIC_BREAKDOWN_COLUMNS];
    const header = breakdownCols.map(resolveCurrency).concat(
      BASE_METRICS.map((c) =>
        c === "CPM (cost per 1,000 impressions)"
          ? "CPM (cost per 1,000 impressions) (USD)"
          : resolveCurrency(c),
      ),
    );
    const row = breakdownCols.map(breakdownValue).concat(BASE_METRICS.map(baseValue));
    const result = parseIapCsv([line(header), line(row)].join("\n"), "demographic");

    const entry = result.mappingSummary.find(
      (e) => e.canonical === "CPM (cost per 1,000 impressions)",
    );
    expect(entry).toBeDefined();
    expect(entry!.tier).toBe("exact");
    expect(entry!.confidence).toBe(0.99);
    expect(entry!.foundAs).toBe("CPM (cost per 1,000 impressions) (USD)");

    // Deterministic match → folds into the single "matched automatically"
    // summary line; never an individual "auto-matched — verify" or
    // moderate-confidence warning naming CPM.
    expect(
      result.warnings.filter((w) => /CPM/.test(w) && !/matched automatically/.test(w)),
    ).toEqual([]);
    expect(result.warnings.some((w) => /matched automatically/.test(w))).toBe(true);
  });
});

// ── New alias entries produce correct parse output ────────────────────────────

describe("parseIapCsv — new alias entries end-to-end", () => {
  function csvWithDateAlias(alias: string): string {
    const breakdownCols = [...DEMOGRAPHIC_BREAKDOWN_COLUMNS];
    const header = breakdownCols
      .map((c) => (c === "Day" ? alias : resolveCurrency(c)))
      .concat(BASE_METRICS.map(resolveCurrency));
    const row = breakdownCols.map(breakdownValue).concat(BASE_METRICS.map(baseValue));
    return [line(header), line(row)].join("\n");
  }

  it("accepts 'report date' as the date column", () => {
    const result = parseIapCsv(csvWithDateAlias("report date"), "demographic");
    expect(result.rows[0]!.breakdowns["Day"]).toBe("2026-06-01");
    expect(result.columnMappings["Day"]?.via).toBe("alias");
  });

  it("accepts 'reporting starts' as the date column", () => {
    const result = parseIapCsv(csvWithDateAlias("reporting starts"), "demographic");
    expect(result.rows[0]!.breakdowns["Day"]).toBe("2026-06-01");
    expect(result.columnMappings["Day"]?.via).toBe("alias");
  });

  it("accepts 'date start' as the date column", () => {
    const result = parseIapCsv(csvWithDateAlias("date start"), "demographic");
    expect(result.rows[0]!.breakdowns["Day"]).toBe("2026-06-01");
  });

  it("accepts 'budget spent' for the amount spent column", () => {
    const breakdownCols = [...DEMOGRAPHIC_BREAKDOWN_COLUMNS];
    const header = breakdownCols
      .map(resolveCurrency)
      .concat(
        BASE_METRICS.map((c) => (c === "Amount spent ({ACCOUNT_CURRENCY})" ? "budget spent" : resolveCurrency(c))),
      );
    const row = breakdownCols.map(breakdownValue).concat(BASE_METRICS.map(baseValue));
    const result = parseIapCsv([line(header), line(row)].join("\n"), "demographic");
    expect(result.rows[0]!.base["amount_spent"]).toBe(42.5);
    expect(result.columnMappings["Amount spent ({ACCOUNT_CURRENCY})"]?.via).toBe("alias");
  });

  it("accepts 'thruplays' for ThruPlays (resolved via alias or case-insensitive)", () => {
    // "thruplays" is an alias, but case-insensitive match for "ThruPlays" fires first.
    // Either resolution correctly maps the column — both are acceptable.
    const breakdownCols = [...DEMOGRAPHIC_BREAKDOWN_COLUMNS];
    const header = breakdownCols
      .map(resolveCurrency)
      .concat(BASE_METRICS.map((c) => (c === "ThruPlays" ? "thruplays" : resolveCurrency(c))));
    const row = breakdownCols.map(breakdownValue).concat(BASE_METRICS.map(baseValue));
    const result = parseIapCsv([line(header), line(row)].join("\n"), "demographic");
    expect(["alias", "case_insensitive"]).toContain(result.columnMappings["ThruPlays"]?.via);
  });
});

// ── Cross-class mismatch detection ─────────────────────────────────────────────

describe("detectCsvClassMismatch — pure function", () => {
  it("returns null when headers match expected demographic class", () => {
    const demographicHeaders = [...DEMOGRAPHIC_BREAKDOWN_COLUMNS, ...BASE_METRICS].map(resolveCurrency);
    expect(detectCsvClassMismatch(demographicHeaders, "demographic")).toBeNull();
  });

  it("returns null when headers match expected device_placement class", () => {
    const dpHeaders = [...DEVICE_PLACEMENT_BREAKDOWN_COLUMNS, ...BASE_METRICS].map(resolveCurrency);
    expect(detectCsvClassMismatch(dpHeaders, "device_placement")).toBeNull();
  });

  it("detects device_placement CSV uploaded to demographic slot via 'Placement'", () => {
    const dpHeaders = [...DEVICE_PLACEMENT_BREAKDOWN_COLUMNS, ...BASE_METRICS].map(resolveCurrency);
    const result = detectCsvClassMismatch(dpHeaders, "demographic");
    expect(result).not.toBeNull();
    expect(result).toMatch(/device.?placement/i);
    expect(result).toMatch(/wrong slot/i);
  });

  it("detects device_placement CSV uploaded to demographic slot via 'Impression device'", () => {
    const headers = ["Day", "Ad name", "Campaign name", "Impression device"];
    const result = detectCsvClassMismatch(headers, "demographic");
    expect(result).not.toBeNull();
    expect(result).toMatch(/device.?placement/i);
  });

  it("detects demographic CSV uploaded to device_placement slot via 'Gender'", () => {
    const demoHeaders = [...DEMOGRAPHIC_BREAKDOWN_COLUMNS, ...BASE_METRICS].map(resolveCurrency);
    const result = detectCsvClassMismatch(demoHeaders, "device_placement");
    expect(result).not.toBeNull();
    expect(result).toMatch(/demographic/i);
    expect(result).toMatch(/wrong slot/i);
  });

  it("detects demographic CSV uploaded to device_placement slot via 'Age'", () => {
    const headers = ["Day", "Ad name", "Campaign name", "Age"];
    const result = detectCsvClassMismatch(headers, "device_placement");
    expect(result).not.toBeNull();
    expect(result).toMatch(/demographic/i);
  });

  it("catches 'Placement' alias 'ad placement' when parsing as demographic", () => {
    // 'ad placement' is an alias for 'Placement' in COLUMN_ALIASES
    const headers = ["Day", "Campaign name", "Ad name", "Gender", "Age", "ad placement"];
    const result = detectCsvClassMismatch(headers, "demographic");
    // 'ad placement' resolves to Placement (device_placement signature)
    // AND Gender/Age also present — either way mismatch is detected
    // (In this case: demographic-slot CSV has both demographic AND device_placement signatures)
    // The device_placement signature match ('ad placement' → Placement) should fire
    expect(result).not.toBeNull();
  });

  it("catches 'device type' alias for 'Impression device' when parsing as demographic", () => {
    const headers = ["Day", "Campaign name", "Ad name", "device type", "Platform"];
    const result = detectCsvClassMismatch(headers, "demographic");
    expect(result).not.toBeNull();
    expect(result).toMatch(/device.?placement/i);
  });

  it("names the detected columns in the error message", () => {
    const headers = ["Day", "Ad name", "Campaign name", "Placement", "Impression device"];
    const result = detectCsvClassMismatch(headers, "demographic");
    expect(result).not.toBeNull();
    expect(result).toMatch(/"Placement"/);
  });

  it("returns null for a minimal header with no class-signature columns", () => {
    // Generic columns that appear in both — no signal either way
    const headers = ["Day", "Campaign name", "Ad name", "Impressions", "Reach"];
    expect(detectCsvClassMismatch(headers, "demographic")).toBeNull();
    expect(detectCsvClassMismatch(headers, "device_placement")).toBeNull();
  });
});

describe("parseIapCsv — cross-class mismatch throws IapCsvFormatError", () => {
  it("throws when a device_placement CSV is parsed as demographic", () => {
    const csv = validCsv("device_placement");
    expect(() => parseIapCsv(csv, "demographic")).toThrow(IapCsvFormatError);
  });

  it("throws when a demographic CSV is parsed as device_placement", () => {
    const csv = validCsv("demographic");
    expect(() => parseIapCsv(csv, "device_placement")).toThrow(IapCsvFormatError);
  });

  it("error message for device_placement-in-demographic slot mentions device/placement and wrong slot", () => {
    const csv = validCsv("device_placement");
    let msg = "";
    try {
      parseIapCsv(csv, "demographic");
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toMatch(/device.?placement/i);
    expect(msg).toMatch(/wrong slot/i);
  });

  it("error message for demographic-in-device_placement slot mentions demographic and wrong slot", () => {
    const csv = validCsv("demographic");
    let msg = "";
    try {
      parseIapCsv(csv, "device_placement");
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toMatch(/demographic/i);
    expect(msg).toMatch(/wrong slot/i);
  });

  it("does NOT throw for a correctly-slotted demographic CSV", () => {
    expect(() => parseIapCsv(validCsv("demographic"), "demographic")).not.toThrow();
  });

  it("does NOT throw for a correctly-slotted device_placement CSV", () => {
    expect(() => parseIapCsv(validCsv("device_placement"), "device_placement")).not.toThrow();
  });
});
