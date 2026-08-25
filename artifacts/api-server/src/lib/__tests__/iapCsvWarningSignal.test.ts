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
import {
  findColumnInHeader,
  inferColumnMapping,
  suggestCanonicalForUnknown,
  DEMOGRAPHIC_BREAKDOWN_COLUMNS,
  BASE_METRICS,
} from "../iapCsvSpec";
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

// ── Cross-concept inference veto ────────────────────────────────────────
//
// Real-account case (AAFE ad-summary export, Aug 24): the export carried
// "Ad set budget" / "Ad set budget type" (campaign configuration) but no ID
// or name columns; Jaccard token overlap on ad/set promoted "Ad set budget"
// to "Ad set ID" at 50% — currency amounts where object IDs belong, plus a
// "please verify" hedge for a mapping that is never correct.

describe("conflicting-concept inference veto", () => {
  it('never promotes "Ad set budget" to "Ad set ID", at any score', () => {
    expect(inferColumnMapping(["Ad set budget"], "Ad set ID")).toBeNull();
  });

  it('does not suggest "Ad set name" for "Ad set budget type"', () => {
    expect(suggestCanonicalForUnknown("Ad set budget type", ["Ad set name", "Ad set ID"])).toBeNull();
  });

  it("still allows genuine renamings that share the concept", () => {
    const m = inferColumnMapping(["Ad set ID number"], "Ad set ID");
    expect(m).not.toBeNull();
    expect(m!.headerValue).toBe("Ad set ID number");
  });

  it("a conflict token present on BOTH sides does not veto (token is part of the concept)", () => {
    // Hypothetical canonical containing "budget" would legitimately match a
    // budget-worded header; the veto only fires on one-sided conflict tokens.
    expect(suggestCanonicalForUnknown("Daily budget", ["Daily budget amount"])).not.toBeNull();
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
  const folded = res.warnings.filter((w) => w.includes("matched automatically"));
  expect(folded.length).toBe(1);
  expect(folded[0]).toContain("→");
  // Mapping detail is still recorded for the confidence report.
  expect(res.mappingSummary.some((e) => e.foundAs === "Amount spent _USD_")).toBe(true);
});

it('folds curated alias matches too — "Reporting starts" is Meta\'s own ad-summary date header, not a user mistake', () => {
  const header = ["Reporting starts", "Ad name", "Amount spent (USD)", "Impressions", "Results", "Result type"];
  const row = ["2026-07-13", "Ad A", "10.00", "1000", "2", "Purchases"];
  const res = parseIapCsv([line(header), line(row)].join("\n"), "ad_summary");
  // No per-column "rename it in your export" advice for a header Meta itself emits…
  expect(res.warnings.some((w) => w.includes("via alias match"))).toBe(false);
  // …the mapping folds into the one summary line instead, and detail survives.
  expect(res.mappingSummary.some((e) => e.canonical === "Day" && e.foundAs === "Reporting starts")).toBe(true);
});

it("optional-column absences read as notes, not alarms", () => {
  const header = ["Day", "Ad name", "Amount spent (USD)", "Impressions", "Results", "Result type"];
  const row = ["2026-07-13", "Ad A", "10.00", "1000", "2", "Purchases"];
  const res = parseIapCsv([line(header), line(row)].join("\n"), "ad_summary");
  const missingLine = res.warnings.find((w) => w.includes("breakdown columns not present"));
  expect(missingLine).toBeDefined();
  expect(missingLine!.startsWith("Note:")).toBe(true);
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

// ── Creative-metadata cascade obeys the same fold policy ────────────────
//
// The breakdown / spend / metric cascades fold deterministic matches
// (slug / case-insensitive / curated alias / currency-suffix) into ONE
// "matched automatically — no action needed" summary line. The
// creative-metadata cascade — which only runs for ad_summary exports —
// bypassed that policy entirely and emitted one "auto-matched" line per
// column. Meta's own ad-level exports label these columns "Body text",
// "Headline" and "CTA", all curated aliases, so EVERY real ad_summary
// import carried three warnings the user could neither act on nor verify.
//
// The cascade also used to run after `unmappedHeaders` was computed, so
// those same successfully-mapped headers were still eligible for the
// unknown-column "may correspond to expected column X" suggestion, and any
// fold it did contribute incremented a counter that had already been
// reported (silently dropping the mapping from the summary).

const AD_SUMMARY_HEADER = [
  "Day", "Ad name",
  "Amount spent (USD)", "Impressions", "Reach", "Link clicks", "Clicks (all)",
  "Results", "CTR (link click-through rate)",
  '"CPM (cost per 1,000 impressions) (USD)"',
  "Body text", "Headline", "CTA",
].join(",");
const AD_SUMMARY_ROW = [
  "2026-07-01", "Ad A", "10", "1000", "900", "20", "30", "2", "1.5", "5",
  "hello", "buy", "SHOP_NOW",
].join(",");

function parseAdSummary() {
  return parseIapCsv(`${AD_SUMMARY_HEADER}\n${AD_SUMMARY_ROW}\n`, "ad_summary" as never);
}

describe("duplicate-header fold policy", () => {
  // Meta's pivot exporter duplicates a fixed SET of headers together, so a
  // per-column notice fired three times on every real export. Six of the
  // fifteen warnings on a live AAFE run were this one message, crowding out
  // the coverage and ID-corruption warnings that actually needed acting on.
  const dupHeader = [
    "Day", "Ad name", "Ad name",
    "Amount spent (USD)", "Impressions", "Reach", "Link clicks", "Clicks (all)",
    "Results", "Result value type", "Result value type",
    "Ad ID", "Ad ID",
  ].join(",");
  const dupRow = [
    "2026-07-01", "Ad One", "Ad One",
    "100", "1000", "900", "20", "30",
    "4", "purchase", "purchase",
    "123", "123",
  ].join(",");
  const parseDup = () => parseIapCsv(`${dupHeader}\n${dupRow}\n`, "ad_summary" as never);

  const dupWarnings = (ws: string[]) =>
    ws.filter((w) => w.includes("appear") && w.includes("more than once in the header row"));

  it("emits ONE notice for three duplicated columns, not three", () => {
    const found = dupWarnings(parseDup().warnings);
    expect(found).toHaveLength(1);
  });

  it("still names every duplicated column, so folding loses no information", () => {
    const [notice] = dupWarnings(parseDup().warnings);
    expect(notice).toContain('"Ad name"');
    expect(notice).toContain('"Result value type"');
    expect(notice).toContain('"Ad ID"');
    expect(notice).toContain("3 columns");
  });

  it("keeps the singular wording when only one column is duplicated", () => {
    const header = ["Day", "Ad name", "Ad name", "Amount spent (USD)", "Impressions"].join(",");
    const row = ["2026-07-01", "Ad One", "Ad One", "100", "1000"].join(",");
    const [notice] = dupWarnings(parseIapCsv(`${header}\n${row}\n`, "ad_summary" as never).warnings);
    expect(notice).toBe(
      'Column "Ad name" appears more than once in the header row — only the first occurrence is used.',
    );
  });

  it("says nothing at all when no header is duplicated", () => {
    expect(dupWarnings(parseAdSummary().warnings)).toEqual([]);
  });
});

describe("creative-metadata cascade fold policy", () => {
  it("folds alias-matched creative metadata instead of one warning per column", () => {
    const { warnings } = parseAdSummary();
    const perColumn = warnings.filter((w) => w.startsWith("Creative metadata column "));
    expect(perColumn).toEqual([]);
  });

  it("counts the folded creative-metadata columns in the summary rather than dropping them", () => {
    const { warnings } = parseAdSummary();
    const summary = warnings.find((w) => w.includes("matched automatically"));
    expect(summary).toBeDefined();
    // 3 creative-metadata aliases + the currency-suffixed CPM.
    expect(summary!).toMatch(/^4 column\(s\)/);
    expect(summary!).toContain("no action needed");
  });

  it("still maps every creative metadata column it folded", () => {
    const { columnMappings } = parseAdSummary();
    expect(columnMappings["Ad creative body text"]?.headerValue).toBe("Body text");
    expect(columnMappings["Ad creative headline"]?.headerValue).toBe("Headline");
    expect(columnMappings["Ad creative call to action type"]?.headerValue).toBe("CTA");
  });

  it("never reports a mapped creative-metadata header as an unrecognised column", () => {
    const { warnings } = parseAdSummary();
    const unrecognised = warnings.filter((w) => w.startsWith("Unrecognised column "));
    for (const w of unrecognised) {
      expect(w).not.toContain('"Body text"');
      expect(w).not.toContain('"Headline"');
      expect(w).not.toContain('"CTA"');
    }
  });

  it("leaves the real ad_summary shape with only informational notices", () => {
    const { warnings } = parseAdSummary();
    // Nothing in this export needs a decision: the folded summary plus the
    // two "Note:" absences. Anything else would be false friction.
    expect(warnings).toHaveLength(3);
    expect(warnings.filter((w) => w.startsWith("Note:"))).toHaveLength(2);
  });
});
