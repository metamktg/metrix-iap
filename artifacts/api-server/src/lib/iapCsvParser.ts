// Parser for the two Meta Ads Reporting pivot export CSV classes (see
// iapCsvSpec.ts). Tolerant of common column naming variations from Meta Ads
// Manager UI exports (e.g. "Day" instead of "Date", CPM abbreviations, etc.)
// via iapCsvSpec.findColumnInHeader(). Missing columns degrade confidence
// rather than hard-blocking: the parse result carries `warnings` and
// `missingColumns` so callers can surface confidence notices to the user.
//
// Hard errors are reserved for truly unrecoverable situations:
//   - Empty file
//   - No data rows
//   - Critical breakdown columns (Date, Ad name, Campaign name) not resolvable
//     even after alias + fuzzy matching
//   - Rows with blank required breakdown values (totals/subtotals rows)

import {
  BASE_METRICS,
  OPTIONAL_METRICS,
  CORE_BASE_METRICS,
  headerMatchesColumn,
  slugifyColumn,
  findColumnInHeader,
  suggestCanonicalForUnknown,
  type IapCsvClass,
  IAP_CSV_CLASS_SPECS,
  type ColumnMatch,
} from "./iapCsvSpec";

export class IapCsvFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IapCsvFormatError";
  }
}

export type IapCsvRow = {
  breakdowns: Record<string, string>;
  /** Base-section metrics, keyed by slug. Always present in the object (may be null if the cell was blank or column missing). */
  base: Record<string, number | string | null>;
  /** Ecommerce/Service/App metrics observed in this file's header, keyed by slug. Absent metrics are simply not keys here — never fabricated as 0/null. */
  extra: Record<string, number | string | null>;
};

export type IapCsvParseResult = {
  rows: IapCsvRow[];
  /** Which optional (non-Base) metric columns were present in this file's header. */
  optionalMetricsPresent: string[];
  /**
   * Human-readable warnings generated during parsing: auto-resolved column
   * aliases, missing columns that proceeded with nulls, and unrecognised
   * columns that might map to expected ones. Empty when everything matched
   * exactly — no warnings is the happy path.
   */
  warnings: string[];
  /**
   * Columns that were resolved via non-exact matching (alias, slug, case,
   * currency). Maps canonical column name → how it was matched.
   */
  columnMappings: Record<string, ColumnMatch>;
  /** Canonical columns that could not be found in the header even with fuzzy resolution. */
  missingColumns: string[];
};

function parseCsvLines(text: string): string[][] {
  // Minimal RFC4180 CSV parser: handles quoted fields, embedded commas/quotes/newlines.
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  const push = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    push();
    rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      push();
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      continue;
    }
    if (c === "\n") {
      pushRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) pushRow();
  return rows.filter((r) => !(r.length === 1 && r[0]!.trim() === ""));
}

function parseNumericCell(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "-" || trimmed === "N/A") return null;
  const cleaned = trimmed.replace(/[,%$]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Breakdown column names that are load-bearing for the analysis pipeline. */
const CRITICAL_BREAKDOWN_COLUMNS = new Set(["Date", "Ad name", "Campaign name"]);

/**
 * Parses one staged CSV against the given class's canonical template.
 *
 * Column resolution order: exact → currency-placeholder → case-insensitive →
 * known alias (e.g. "Day" → "Date") → slug match.
 *
 * Missing breakdown columns and missing Base-section metric columns now produce
 * warnings instead of hard errors, EXCEPT for critical breakdown columns
 * (Date, Ad name, Campaign name) which are load-bearing and abort with a
 * clear message when completely unresolvable.
 */
export function parseIapCsv(text: string, csvClass: IapCsvClass): IapCsvParseResult {
  const spec = IAP_CSV_CLASS_SPECS[csvClass];
  const lines = parseCsvLines(text);
  if (lines.length === 0) {
    throw new IapCsvFormatError("The file is empty.");
  }
  const rawHeader = lines[0]!;
  const headerStrings = rawHeader.map((h) => h.trim());

  const warnings: string[] = [];
  const columnMappings: Record<string, ColumnMatch> = {};
  const missingColumns: string[] = [];

  // ── Breakdown column resolution ──────────────────────────────────────
  // Map each canonical breakdown column to the actual header cell index.
  const breakdownIdx = new Map<string, number>();
  const missingBreakdowns: string[] = [];

  for (const col of spec.breakdownColumns) {
    const match = findColumnInHeader(headerStrings, col);
    if (match) {
      const idx = rawHeader.findIndex((h) => h.trim() === match.headerValue);
      breakdownIdx.set(col, idx);
      if (match.via !== "exact") {
        columnMappings[col] = match;
        warnings.push(
          `Column "${col}" was auto-matched from "${match.headerValue}" (via ${match.via} match). ` +
            `Renaming it to "${col}" in your export will improve reliability.`,
        );
      }
    } else {
      missingBreakdowns.push(col);
      missingColumns.push(col);
    }
  }

  // Hard-error if critical breakdown columns cannot be resolved at all
  const criticalMissing = missingBreakdowns.filter((c) => CRITICAL_BREAKDOWN_COLUMNS.has(c));
  if (criticalMissing.length > 0) {
    // Before throwing, look for out-of-scope columns that might be these
    const suggestions = criticalMissing.map((c) => {
      const suggestion = suggestCanonicalForUnknown(c, headerStrings);
      return suggestion ? `"${c}" (closest in your file: "${suggestion}")` : `"${c}"`;
    });
    throw new IapCsvFormatError(
      `The following required columns could not be found: ${suggestions.join(", ")}. ` +
        `Meta Ads Manager exports the date column as "Day" — rename it to "Date" in your export, ` +
        `or check that you are using the correct report template.`,
    );
  }

  // Warn (not error) for non-critical missing breakdown columns
  const nonCriticalMissingBreakdowns = missingBreakdowns.filter((c) => !CRITICAL_BREAKDOWN_COLUMNS.has(c));
  if (nonCriticalMissingBreakdowns.length > 0) {
    warnings.push(
      `The following breakdown columns are missing and will be treated as blank: ` +
        `${nonCriticalMissingBreakdowns.join(", ")}. ` +
        `This will reduce the detail available for breakdown analysis.`,
    );
  }

  // ── Base metric column resolution ────────────────────────────────────
  const baseMetricIdx = new Map<string, number>();
  const missingBaseMetrics: string[] = [];
  let amountSpentIdx = -1;

  for (const col of BASE_METRICS) {
    if (col === "Amount spent ({ACCOUNT_CURRENCY})") {
      const match = findColumnInHeader(headerStrings, col);
      if (match) {
        amountSpentIdx = rawHeader.findIndex((h) => h.trim() === match.headerValue);
        if (match.via !== "exact" && match.via !== "currency") {
          columnMappings[col] = match;
          warnings.push(
            `Spend column auto-matched from "${match.headerValue}" (via ${match.via} match).`,
          );
        }
      } else {
        missingBaseMetrics.push(col);
        missingColumns.push(col);
      }
      continue;
    }
    const match = findColumnInHeader(headerStrings, col);
    if (match) {
      const idx = rawHeader.findIndex((h) => h.trim() === match.headerValue);
      baseMetricIdx.set(col, idx);
      if (match.via !== "exact") {
        columnMappings[col] = match;
        warnings.push(
          `Metric column "${col}" auto-matched from "${match.headerValue}" (via ${match.via} match).`,
        );
      }
    } else {
      missingBaseMetrics.push(col);
      missingColumns.push(col);
    }
  }

  if (missingBaseMetrics.length > 0) {
    const coreImpact = missingBaseMetrics.filter((c) => CORE_BASE_METRICS.has(c));
    const minorImpact = missingBaseMetrics.filter((c) => !CORE_BASE_METRICS.has(c));
    if (coreImpact.length > 0) {
      warnings.push(
        `⚠ Reduced confidence: core metric columns are missing and will be null — ` +
          `${coreImpact.join(", ")}. ` +
          `Key analysis metrics (efficiency scores, CTR, CPM calculations) will be incomplete.`,
      );
    }
    if (minorImpact.length > 0) {
      warnings.push(
        `Note: supplementary metric columns not found (will be null): ${minorImpact.join(", ")}.`,
      );
    }
  }

  // ── Unknown column suggestions ───────────────────────────────────────
  // Flag CSV columns that weren't mapped to anything — they might be
  // renamed versions of expected columns the user should know about.
  const allCanonicals = new Set([
    ...spec.breakdownColumns,
    ...BASE_METRICS,
    ...OPTIONAL_METRICS,
  ]);
  const mappedHeaderValues = new Set([
    ...Object.values(columnMappings).map((m) => m.headerValue),
    ...spec.breakdownColumns
      .filter((c) => breakdownIdx.has(c))
      .map((c) => rawHeader[breakdownIdx.get(c)!]?.trim() ?? ""),
    ...BASE_METRICS.filter((c) => baseMetricIdx.has(c) || (c.includes("{ACCOUNT_CURRENCY}") && amountSpentIdx >= 0)).map(
      (c) => {
        if (c.includes("{ACCOUNT_CURRENCY}")) return amountSpentIdx >= 0 ? rawHeader[amountSpentIdx]?.trim() ?? "" : "";
        const idx = baseMetricIdx.get(c);
        return idx !== undefined ? rawHeader[idx]?.trim() ?? "" : "";
      },
    ),
  ]);

  // Find currently-missing canonicals (for suggestion matching)
  const currentlyMissingCanonicals = missingColumns.slice();

  for (const h of headerStrings) {
    // Skip headers we already mapped or that are in the canonical set
    if (mappedHeaderValues.has(h)) continue;
    // Check if it's directly a known canonical (already found via exact in colIndex)
    if (allCanonicals.has(h)) continue;

    if (currentlyMissingCanonicals.length > 0) {
      const suggestion = suggestCanonicalForUnknown(h, currentlyMissingCanonicals);
      if (suggestion) {
        warnings.push(
          `Unrecognised column "${h}" may correspond to expected column "${suggestion}" — ` +
            `if so, rename it in your export for automatic mapping.`,
        );
      }
    }
  }

  // ── Build exact-lookup colIndex for optional metrics ─────────────────
  const colIndex = new Map<string, number>();
  rawHeader.forEach((h, idx) => colIndex.set(h.trim(), idx));

  // Optional metrics: use simple exact match (they are truly optional)
  const optionalMetricsPresent = OPTIONAL_METRICS.filter((col) => colIndex.has(col));

  // ── Parse rows ────────────────────────────────────────────────────────
  const rows: IapCsvRow[] = [];
  for (let li = 1; li < lines.length; li++) {
    const cells = lines[li]!;
    if (cells.every((c) => c.trim() === "")) continue;

    const breakdowns: Record<string, string> = {};
    for (const col of spec.breakdownColumns) {
      const idx = breakdownIdx.get(col);
      breakdowns[col] = idx !== undefined ? (cells[idx] ?? "").trim() : "";
    }

    // Required breakdown values (row-level — blank means totals row)
    for (const req of spec.requiredBreakdownColumns) {
      if (!breakdowns[req]) {
        throw new IapCsvFormatError(
          `Row ${li + 1}: missing required value for "${req}". Meta pivot exports must not include totals/subtotals rows — check "no totals" is unchecked in the export.`,
        );
      }
    }

    const base: Record<string, number | string | null> = {};
    for (const col of BASE_METRICS) {
      const slug = slugifyColumn(col);
      if (col === "Amount spent ({ACCOUNT_CURRENCY})") {
        base[slug] = amountSpentIdx >= 0 ? parseNumericCell(cells[amountSpentIdx]) : null;
        continue;
      }
      const idx = baseMetricIdx.get(col);
      const raw = idx !== undefined ? cells[idx] : undefined;
      if (col === "Result type" || col === "Result value type") {
        base[slug] = raw !== undefined && raw.trim() !== "" ? raw.trim() : null;
      } else {
        base[slug] = parseNumericCell(raw);
      }
    }

    const extra: Record<string, number | string | null> = {};
    for (const col of optionalMetricsPresent) {
      const idx = colIndex.get(col);
      extra[slugifyColumn(col)] = parseNumericCell(idx !== undefined ? cells[idx] : undefined);
    }

    rows.push({ breakdowns, base, extra });
  }

  if (rows.length === 0) {
    throw new IapCsvFormatError("The file has a header row but no data rows.");
  }

  return {
    rows,
    optionalMetricsPresent: optionalMetricsPresent.map(slugifyColumn),
    warnings,
    columnMappings,
    missingColumns,
  };
}

/** Converts a Meta "Date" cell (e.g. "2026-07-01") to an ISO date string, throwing on invalid dates. */
export function toIsoDate(raw: string, context: string): string {
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new IapCsvFormatError(`${context}: date "${raw}" is not in YYYY-MM-DD format.`);
  }
  return trimmed;
}
