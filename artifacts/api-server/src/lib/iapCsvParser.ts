// Parser for the two Meta Ads Reporting pivot export CSV classes (see
// iapCsvSpec.ts). Tolerant of common column naming variations from Meta Ads
// Manager UI exports (e.g. legacy "Date" instead of "Day", CPM abbreviations, etc.)
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
  DERIVED_OR_IRRELEVANT_METRICS,
  OPTIONAL_METRICS,
  CORE_BASE_METRICS,
  DELIVERY_PRIMITIVES,
  BLOCKING_DELIVERY_PRIMITIVES,
  CREATIVE_METADATA_COLUMNS,
  iapCsvClassLabel,
  headerMatchesColumn,
  slugifyColumn,
  findColumnInHeader,
  inferColumnMapping,
  suggestCanonicalForUnknown,
  detectCsvClassMismatch,
  type IapCsvClass,
  IAP_CSV_CLASS_SPECS,
  type ColumnMatch,
  detectObjectiveColumnGroups,
  type ObjectiveColumnGroup,
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
  /**
   * Ad creative metadata columns (string-valued), keyed by column name.
   * Only populated for ad_summary rows when those columns are present.
   * Never fabricated — absent columns are not included.
   */
  creativeMetadata?: Record<string, string>;
};

/**
 * Per-column mapping result for the `mappingSummary` field.
 *
 * tier:
 *   "exact"    — matched verbatim (confidence 1.0 / 0.99 for currency)
 *   "resolved" — matched via case-insensitive, alias, or slug resolution (0.90–0.97)
 *   "inferred" — matched via Jaccard token similarity (0.50–<0.90)
 *   "missing"  — could not be found even with inference
 */
export type ColumnMappingSummaryEntry = {
  canonical: string;
  foundAs: string | null;
  confidence: number;
  method: string;
  tier: "exact" | "resolved" | "inferred" | "missing";
  /**
   * True when the column is listed in the spec's `requiredBreakdownColumns`
   * for this CSV class. A missing required column will cause the analysis run
   * to produce incomplete or failed results, not just reduced confidence.
   */
  isRequired: boolean;
};

export type IapCsvParseResult = {
  rows: IapCsvRow[];
  /** Which optional (non-Base) metric columns were present in this file's header. */
  optionalMetricsPresent: string[];
  /**
   * Which objective column groups (ecommerce / service_or_lead_gen / app)
   * had at least one column present in this file's header. Presence-based
   * detection used by the analysis run to compare against the account's
   * configured objectives — never to auto-enable anything.
   */
  objectiveColumnGroupsPresent: ObjectiveColumnGroup[];
  /**
   * Human-readable warnings generated during parsing: auto-resolved column
   * aliases, missing columns that proceeded with nulls, and unrecognised
   * columns that might map to expected ones. Empty when everything matched
   * exactly — no warnings is the happy path.
   */
  warnings: string[];
  /**
   * Columns that were resolved via non-exact matching (alias, slug, case,
   * currency, inferred). Maps canonical column name → how it was matched.
   */
  columnMappings: Record<string, ColumnMatch>;
  /** Canonical columns that could not be found in the header even with fuzzy resolution. */
  missingColumns: string[];
  /**
   * Full per-column mapping summary for every canonical breakdown and base
   * metric column. Includes both resolved and missing columns so the caller
   * can render a complete column-mapping report to the user.
   */
  mappingSummary: ColumnMappingSummaryEntry[];
  /**
   * Per-column DATA coverage, measured over the parsed rows.
   *
   * Column resolution only proves a header exists. Coverage proves the column
   * carries values. A file can resolve every required column and still be
   * unusable because Meta returned every one of them blank — see
   * DELIVERY_PRIMITIVES in iapCsvSpec.ts.
   */
  coverage: IapCsvCoverage;
};

/** Measured fill for one canonical column across every parsed row. */
export type ColumnCoverageEntry = {
  canonical: string;
  slug: string;
  /** The column resolved to a header cell (it exists in the file). */
  present: boolean;
  /** Rows carrying a non-blank value. */
  filledRows: number;
  /** Sum of numeric values; null for string-valued columns. */
  sum: number | null;
};

export type IapCsvCoverage = {
  totalRows: number;
  columns: ColumnCoverageEntry[];
  /**
   * Canonical columns that RESOLVED in the header but carry no value on any
   * row. This is the distinction the old parser could not make — and the one
   * that separates "a column is missing" from "the export returned nothing".
   */
  emptyColumns: string[];
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
const CRITICAL_BREAKDOWN_COLUMNS = new Set(["Day", "Ad name", "Campaign name"]);

/** Determine the display tier for a ColumnMatch. */
function matchTier(match: ColumnMatch): "exact" | "resolved" | "inferred" {
  if (match.via === "exact" || match.via === "currency") return "exact";
  if (match.via === "inferred") return "inferred";
  return "resolved";
}

/**
 * Parses one staged CSV against the given class's canonical template.
 *
 * Column resolution order: exact → currency-placeholder → case-insensitive →
 * known alias (e.g. "Date" → "Day") → slug match → Jaccard inference.
 *
 * Missing breakdown columns and missing Base-section metric columns now produce
 * warnings instead of hard errors, EXCEPT for critical breakdown columns
 * (Date, Ad name, Campaign name) which are load-bearing and abort with a
 * clear message when completely unresolvable.
 *
 * Unknown CSV headers that score ≥ 0.75 Jaccard similarity to a missing
 * canonical are auto-promoted silently; those scoring 0.5–0.74 are promoted
 * with a warning; those below 0.5 leave the canonical column as missing.
 */
export function parseIapCsv(text: string, csvClass: IapCsvClass): IapCsvParseResult {
  const spec = IAP_CSV_CLASS_SPECS[csvClass];
  const lines = parseCsvLines(text);
  if (lines.length === 0) {
    throw new IapCsvFormatError("The file is empty.");
  }
  const rawHeader = lines[0]!;
  const headerStrings = rawHeader.map((h) => h.trim());

  // ── Cross-class mismatch detection ────────────────────────────────────
  // Detect when the uploaded file belongs to the OTHER pivot class. Do this
  // before any resolution so the user gets an actionable message immediately
  // rather than a confusing "missing columns" wall or silent empty analysis.
  const mismatchError = detectCsvClassMismatch(headerStrings, csvClass);
  if (mismatchError) {
    throw new IapCsvFormatError(mismatchError);
  }

  const warnings: string[] = [];
  const columnMappings: Record<string, ColumnMatch> = {};
  const missingColumns: string[] = [];

  // Single authoritative summary map: canonical → entry. Using a Map (not an
  // array) guarantees exactly one entry per canonical column even when a column
  // passes through multiple resolution stages (e.g. initially "missing" then
  // promoted to "inferred" by the inference pass).
  const summaryMap = new Map<string, ColumnMappingSummaryEntry>();

  // Track which header values have been claimed by a canonical mapping
  // (used later for the inferred-match pass over unmapped headers).
  const claimedHeaderValues = new Set<string>();

  // ── Breakdown column resolution (primary cascade) ─────────────────────
  // Map each canonical breakdown column to the actual header cell index.
  const breakdownIdx = new Map<string, number>();
  const missingBreakdowns: string[] = [];

  for (const col of spec.breakdownColumns) {
    const match = findColumnInHeader(headerStrings, col);
    if (match) {
      const idx = rawHeader.findIndex((h) => h.trim() === match.headerValue);
      breakdownIdx.set(col, idx);
      claimedHeaderValues.add(match.headerValue);
      if (match.via !== "exact") {
        columnMappings[col] = match;
        warnings.push(
          `Column "${col}" was auto-matched from "${match.headerValue}" (via ${match.via} match). ` +
            `Renaming it to "${col}" in your export will improve reliability.`,
        );
      }
      summaryMap.set(col, {
        canonical: col,
        foundAs: match.headerValue,
        confidence: match.confidence,
        method: match.method,
        tier: matchTier(match),
        isRequired: spec.requiredBreakdownColumns.includes(col),
      });
    } else {
      missingBreakdowns.push(col);
    }
  }

  // ── Base metric column resolution (primary cascade) ───────────────────
  const baseMetricIdx = new Map<string, number>();
  const missingBaseMetrics: string[] = [];
  let amountSpentIdx = -1;

  // Derived/irrelevant metrics are accepted transparently when present but are
  // never expected: absence is not recorded, warned about, or inferred against.
  const acceptedBaseColumns: readonly string[] = [...BASE_METRICS, ...DERIVED_OR_IRRELEVANT_METRICS];
  for (const col of acceptedBaseColumns) {
    if (col === "Amount spent ({ACCOUNT_CURRENCY})") {
      const match = findColumnInHeader(headerStrings, col);
      if (match) {
        amountSpentIdx = rawHeader.findIndex((h) => h.trim() === match.headerValue);
        claimedHeaderValues.add(match.headerValue);
        if (match.via !== "exact" && match.via !== "currency") {
          columnMappings[col] = match;
          warnings.push(
            `Spend column auto-matched from "${match.headerValue}" (via ${match.via} match).`,
          );
        }
        summaryMap.set(col, {
          canonical: col,
          foundAs: match.headerValue,
          confidence: match.confidence,
          method: match.method,
          tier: matchTier(match),
          isRequired: false,
        });
      } else {
        missingBaseMetrics.push(col);
      }
      continue;
    }
    const match = findColumnInHeader(headerStrings, col);
    if (match) {
      const idx = rawHeader.findIndex((h) => h.trim() === match.headerValue);
      baseMetricIdx.set(col, idx);
      claimedHeaderValues.add(match.headerValue);
      if (match.via !== "exact") {
        columnMappings[col] = match;
        warnings.push(
          `Metric column "${col}" auto-matched from "${match.headerValue}" (via ${match.via} match).`,
        );
      }
      summaryMap.set(col, {
        canonical: col,
        foundAs: match.headerValue,
        confidence: match.confidence,
        method: match.method,
        tier: matchTier(match),
        isRequired: false,
      });
    } else if (BASE_METRICS.includes(col)) {
      // Only genuinely-expected base metrics count as missing; derived or
      // irrelevant columns (cost-per-X ratios, rankings) are simply skipped.
      missingBaseMetrics.push(col);
    }
  }

  // ── Inference pass: try Jaccard-based auto-mapping for ALL missing columns ─
  // Run inference on every unresolved column — including critical breakdowns —
  // before hard-failing, so an obvious high-similarity header can be promoted.
  const unmappedHeaders = headerStrings.filter((h) => !claimedHeaderValues.has(h));

  // All unresolved: critical + non-critical breakdowns + base metrics
  const allMissingForInference = [...missingBreakdowns, ...missingBaseMetrics];
  const stillMissingAfterInference: string[] = [];

  // Rate/ratio ↔ count mismatch guard: never infer a rate or cost-per column
  // onto a raw count column (or vice versa). E.g. "Purchases rate per landing
  // page views" must NOT be promoted into "Landing page views" — summing rate
  // values as counts silently corrupts every downstream aggregate.
  const isRatioColumn = (name: string): boolean => /\brate\b|cost per|\bctr\b|\bcpc\b|\bcpm\b/i.test(name);

  for (const col of allMissingForInference) {
    let inferred = inferColumnMapping(unmappedHeaders, col);
    if (inferred && isRatioColumn(inferred.headerValue) !== isRatioColumn(col)) {
      inferred = null;
    }
    if (inferred) {
      // Auto-promote — overwrite any prior "missing" summary entry
      claimedHeaderValues.add(inferred.headerValue);
      const unmappedIdx = unmappedHeaders.indexOf(inferred.headerValue);
      if (unmappedIdx !== -1) unmappedHeaders.splice(unmappedIdx, 1);

      const headerIdx = rawHeader.findIndex((h) => h.trim() === inferred.headerValue);
      columnMappings[col] = inferred;

      summaryMap.set(col, {
        canonical: col,
        foundAs: inferred.headerValue,
        confidence: inferred.confidence,
        method: inferred.method,
        tier: "inferred",
        isRequired: spec.requiredBreakdownColumns.includes(col),
      });

      // Only emit a warning for moderate-confidence matches (0.5–<0.75).
      // High-confidence inferred (≥0.75) are auto-applied silently.
      if (inferred.confidence < 0.75) {
        const isBreakdown = spec.breakdownColumns.includes(col);
        const label = isBreakdown ? `Column "${col}"` : `Metric column "${col}"`;
        warnings.push(
          `${label} mapped from "${inferred.headerValue}" with moderate confidence ` +
            `(${Math.round(inferred.confidence * 100)}%) — please verify this is correct.`,
        );
      }

      // Assign the resolved index to the right map
      if (spec.breakdownColumns.includes(col)) {
        breakdownIdx.set(col, headerIdx);
      } else {
        if (col === "Amount spent ({ACCOUNT_CURRENCY})") {
          amountSpentIdx = headerIdx;
        } else {
          baseMetricIdx.set(col, headerIdx);
        }
      }
    } else {
      stillMissingAfterInference.push(col);
      // Only set a "missing" summary entry if one isn't already there (primary cascade
      // never writes "missing" entries — they only originate here).
      if (!summaryMap.has(col)) {
        summaryMap.set(col, { canonical: col, foundAs: null, confidence: 0, method: "Not found", tier: "missing", isRequired: spec.requiredBreakdownColumns.includes(col) });
      }
    }
  }

  // Hard-error if critical breakdown columns are still unresolvable after inference
  const criticalStillMissing = stillMissingAfterInference.filter((c) => CRITICAL_BREAKDOWN_COLUMNS.has(c));
  if (criticalStillMissing.length > 0) {
    const suggestions = criticalStillMissing.map((c) => {
      const suggestion = suggestCanonicalForUnknown(c, headerStrings);
      return suggestion ? `"${c}" (closest in your file: "${suggestion}")` : `"${c}"`;
    });
    throw new IapCsvFormatError(
      `The following required columns could not be found: ${suggestions.join(", ")}. ` +
        `The date breakdown column should be "Day" (as Meta Ads Manager exports it; "Date" is also accepted) — ` +
        `check that you are using the correct report template.`,
    );
  }

  // Non-critical breakdown columns that are still missing after all resolution passes
  const nonCriticalStillMissing = stillMissingAfterInference.filter((c) => !CRITICAL_BREAKDOWN_COLUMNS.has(c));
  if (nonCriticalStillMissing.filter((c) => spec.breakdownColumns.includes(c)).length > 0) {
    const missing = nonCriticalStillMissing.filter((c) => spec.breakdownColumns.includes(c));
    warnings.push(
      `The following breakdown columns are missing and will be treated as blank: ` +
        `${missing.join(", ")}. ` +
        `This will reduce the detail available for breakdown analysis.`,
    );
    for (const col of missing) {
      missingColumns.push(col);
    }
  }

  // Final missing columns (base metrics still unresolvable)
  const stillMissingBaseMetrics = stillMissingAfterInference.filter((c) => BASE_METRICS.includes(c));
  for (const col of stillMissingBaseMetrics) {
    missingColumns.push(col);
  }

  if (missingBaseMetrics.length > 0) {
    const coreImpact = stillMissingBaseMetrics.filter((c) => CORE_BASE_METRICS.has(c));
    const minorImpact = stillMissingBaseMetrics.filter((c) => !CORE_BASE_METRICS.has(c));
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
    ...DERIVED_OR_IRRELEVANT_METRICS,
    ...OPTIONAL_METRICS,
  ]);

  const currentlyMissingCanonicals = missingColumns.slice();

  for (const h of unmappedHeaders) {
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

  // Creative metadata columns (only for ad_summary): use same resolution cascade
  // as breakdown columns so aliases like "body text" → "Ad creative body text" work.
  const isAdSummary = csvClass === "ad_summary";
  const creativeMetaIdx = new Map<string, number>(); // canonical → rawHeader index
  if (isAdSummary) {
    for (const col of CREATIVE_METADATA_COLUMNS) {
      const match = findColumnInHeader(headerStrings, col);
      if (match) {
        const idx = rawHeader.findIndex((h) => h.trim() === match.headerValue);
        creativeMetaIdx.set(col, idx);
        claimedHeaderValues.add(match.headerValue);
        if (match.via !== "exact") {
          columnMappings[col] = match;
          warnings.push(
            `Creative metadata column "${col}" auto-matched from "${match.headerValue}" (via ${match.via} match).`,
          );
        }
        summaryMap.set(col, {
          canonical: col,
          foundAs: match.headerValue,
          confidence: match.confidence,
          method: match.method,
          tier: matchTier(match),
          isRequired: false,
        });
      }
      // Creative metadata columns are truly optional — do NOT add to missingColumns when absent.
    }
  }

  // ── Required breakdown COLUMNS (file-level, checked once) ─────────────
  // A required breakdown column that never resolved is a property of the FILE,
  // not of any row. Reporting it per-row produced the misleading
  // "must not include totals/subtotals rows" message for what is really a
  // column-naming mismatch, and sent users to fix an export setting that was
  // already correct. Diagnose it here, before a single row is read.
  const unresolvedRequired = spec.requiredBreakdownColumns.filter((col) => !breakdownIdx.has(col));
  if (unresolvedRequired.length > 0) {
    const details = unresolvedRequired.map((col) => {
      const closest = suggestCanonicalForUnknown(col, unmappedHeaders);
      return closest
        ? `"${col}" (closest column in your file: "${closest}" — rename it to "${col}" and re-upload)`
        : `"${col}"`;
    });
    throw new IapCsvFormatError(
      `This export is missing ${unresolvedRequired.length === 1 ? "a column" : "columns"} the ` +
        `${iapCsvClassLabel(csvClass)} report needs: ${details.join("; ")}. ` +
        `Re-export from Ads Manager with ${unresolvedRequired.length === 1 ? "that breakdown" : "those breakdowns"} included.`,
    );
  }

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

    // Required breakdown VALUES (row-level). The column is known to exist by
    // this point, so a blank really does mean a totals/subtotals row.
    for (const req of spec.requiredBreakdownColumns) {
      if (!breakdowns[req]) {
        throw new IapCsvFormatError(
          `Row ${li + 1}: the "${req}" column is present but blank on this row. ` +
            `Meta pivot exports must not include totals/subtotals rows — re-export with totals turned off.`,
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

    // ── Creative metadata (ad_summary only) ─────────────────────────────
    let creativeMetadata: Record<string, string> | undefined;
    if (isAdSummary && creativeMetaIdx.size > 0) {
      creativeMetadata = {};
      for (const [col, idx] of creativeMetaIdx) {
        const raw = cells[idx];
        const val = raw !== undefined && raw.trim() !== "" ? raw.trim() : "";
        if (val) creativeMetadata[col] = val;
      }
      if (Object.keys(creativeMetadata).length === 0) creativeMetadata = undefined;
    }

    rows.push({ breakdowns, base, extra, ...(creativeMetadata ? { creativeMetadata } : {}) });
  }

  if (rows.length === 0) {
    throw new IapCsvFormatError("The file has a header row but no data rows.");
  }

  // ── Coverage: measure DATA, not headers ───────────────────────────────
  // Everything above this point verifies that columns exist. Nothing above
  // verifies that they carry values. This block closes that gap.
  const coverageColumns: ColumnCoverageEntry[] = [];
  const emptyColumns: string[] = [];
  const STRING_VALUED = new Set(["Result type", "Result value type"]);

  for (const col of BASE_METRICS) {
    const slug = slugifyColumn(col);
    const present =
      col === "Amount spent ({ACCOUNT_CURRENCY})" ? amountSpentIdx >= 0 : baseMetricIdx.has(col);
    let filledRows = 0;
    let sum: number | null = STRING_VALUED.has(col) ? null : 0;
    for (const row of rows) {
      const v = row.base[slug];
      if (v === null || v === undefined || v === "") continue;
      filledRows++;
      if (sum !== null && typeof v === "number") sum += v;
    }
    coverageColumns.push({ canonical: col, slug, present, filledRows, sum });
    if (present && filledRows === 0) emptyColumns.push(col);
  }

  for (const col of optionalMetricsPresent) {
    const slug = slugifyColumn(col);
    let filledRows = 0;
    let sum = 0;
    for (const row of rows) {
      const v = row.extra[slug];
      if (v === null || v === undefined || v === "") continue;
      filledRows++;
      if (typeof v === "number") sum += v;
    }
    coverageColumns.push({ canonical: col, slug, present: true, filledRows, sum });
    if (filledRows === 0) emptyColumns.push(col);
  }

  const coverage: IapCsvCoverage = { totalRows: rows.length, columns: coverageColumns, emptyColumns };

  // ── Delivery coverage gate ────────────────────────────────────────────
  // Blocks the case the header-only checks could never see: every required
  // column resolved, and Meta returned nothing in any of them. Reported as a
  // hard error because no cost, rate or efficiency metric can be computed from
  // such a file — accepting it produces an analysis of zeroes that reads as
  // real. See DELIVERY_PRIMITIVES for why this happens.
  // A delivery primitive fails the gate two ways, and both produce the same
  // unusable analysis: the column resolved but Meta returned nothing on any
  // row, OR the column is not in the export at all. The first release of this
  // gate only checked the former, so a file with no spend column simply warned
  // and proceeded to an analysis of zeroes — the exact defect the gate exists
  // to prevent, in a different shape.
  const isUnusable = (col: string): boolean => {
    const entry = coverage.columns.find((c) => c.canonical === col);
    return !entry?.present || entry.filledRows === 0;
  };
  const emptyDelivery = BLOCKING_DELIVERY_PRIMITIVES.filter(isUnusable);
  const absentDelivery = emptyDelivery.filter(
    (col) => !coverage.columns.find((c) => c.canonical === col)?.present,
  );
  if (emptyDelivery.length > 0) {
    const allDeliveryEmpty = DELIVERY_PRIMITIVES.every(
      (col) => emptyColumns.includes(col) || !coverage.columns.find((c) => c.canonical === col)?.present,
    );
    const named = emptyDelivery.map((c) => `"${resolveCurrencyLabel(c)}"`).join(" and ");
    // Three distinct causes, three distinct fixes. Naming the wrong one sends
    // the user to change a setting that is already correct.
    const cause = absentDelivery.length === emptyDelivery.length
      ? `This export does not include ${named}. ` +
        `Add ${absentDelivery.length === 1 ? "that column" : "those columns"} in the Ads Reporting ` +
        `column picker and export again.`
      : allDeliveryEmpty
      ? `Every delivery metric in this file is blank, which is what Meta returns when the export is ` +
        `broken down by a conversion or action dimension — most commonly "Conversion device". ` +
        `Meta cannot attribute spend or impressions to the device where a conversion later happened, ` +
        `so it blanks them on every row. Re-export without the conversion/action breakdown.`
      : `Meta returned no values in ${named} on any of the ${rows.length.toLocaleString()} rows in this file.`;
    throw new IapCsvFormatError(
      `${cause} Without ${named} no cost, rate or efficiency metric can be calculated — ` +
        `your creative, placement and engagement data will all be preserved when you re-upload.`,
    );
  }

  // ── Conversion-export detection ────────────────────────────────────────
  // Delivery exports (demographic, device_placement, ad_summary) always carry
  // real impression counts. All-zero impressions is the hallmark of a Meta
  // conversion/action export — those exports attribute clicks and results to ad
  // delivery windows but record 0 impressions because they are not impression-
  // driven. Saving one silently produces impossible CTR values.
  if (csvClass !== "conversion_device") {
    const impressionsFound = baseMetricIdx.has("Impressions");
    if (impressionsFound) {
      const impressionValues = rows.map((row) => row.base["impressions"]);
      const allZeroOrNull = impressionValues.every((v) => v === null || v === 0);
      const anyExplicitZero = impressionValues.some((v) => v === 0);
      if (allZeroOrNull && anyExplicitZero) {
        warnings.push(
          "This looks like a conversion-event export, not a delivery export. " +
            "Delivery exports include impression counts. " +
            "Please export from Ads Manager using the standard Delivery report type.",
        );
      }
    }
  }

  return {
    rows,
    optionalMetricsPresent: optionalMetricsPresent.map(slugifyColumn),
    objectiveColumnGroupsPresent: [...detectObjectiveColumnGroups(optionalMetricsPresent)],
    warnings,
    columnMappings,
    missingColumns,
    mappingSummary: Array.from(summaryMap.values()),
    coverage,
  };
}

/** Display label for a canonical column, resolving the currency placeholder. */
function resolveCurrencyLabel(col: string): string {
  return col.replace("{ACCOUNT_CURRENCY}", "USD");
}

/** Converts a Meta "Day" cell (e.g. "2026-07-01") to an ISO date string, throwing on invalid dates. */
export function toIsoDate(raw: string, context: string): string {
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new IapCsvFormatError(`${context}: date "${raw}" is not in YYYY-MM-DD format.`);
  }
  return trimmed;
}
