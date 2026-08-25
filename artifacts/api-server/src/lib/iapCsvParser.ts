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
//   - A breakdown column the current CSV class's own requiredBreakdownColumns
//     lists (see iapCsvSpec.ts — varies per class) not resolvable even after
//     alias + fuzzy matching
//   - A required breakdown column OTHER than "Day" blank on a row that does
//     have a Day value (a genuinely malformed row, not a totals row)
//
// A row with a blank "Day" is Meta's own grand-totals row, appended whenever
// "Show totals" isn't unchecked at export time — it is excluded from `rows`
// but never rejects the file; instead its metric values are cross-checked
// against this parser's own computed sums (see the totals cross-validation
// block below), surfacing a mismatch as a warning rather than a hard block.

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
  /**
   * True when this file's data matches the signature of a Meta
   * conversion-event export (all-zero impressions) even though it was
   * uploaded into a delivery-class slot. Callers that commit data (analysis
   * runs) should treat this as a confirmation gate, not just a warning —
   * saving it silently produces impossible CTR/CPM values.
   *
   * Complementary to `coverage`, not a duplicate of it: this flags explicit
   * ZERO impressions (a conversion export), while the delivery coverage gate
   * blocks BLANK or absent spend/impressions. A file can trip either alone.
   */
  conversionExportSuspected: boolean;
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
  //
  // Fields are extracted as slices over the input, batched between the next
  // structural character — NOT accumulated one character at a time. The
  // per-character `field += c` version built V8 rope strings across the whole
  // input and OOM-killed the production process on a real 132 MB demographic
  // export (48K rows, each carrying the full ad copy in a "Text" column) —
  // surfacing as a bare HTTP 500 for both the CSV and XLSX upload of the
  // same report. State-machine semantics are unchanged, including mid-field
  // quote toggling on malformed input.
  const QUOTE = 34;
  const COMMA = 44;
  const CR = 13;
  const LF = 10;
  const n = text.length;
  const rows: string[][] = [];
  let row: string[] = [];
  let parts: string[] = [];
  let inQuotes = false;
  let i = 0;
  const push = () => {
    row.push(parts.length === 1 ? parts[0]! : parts.join(""));
    parts = [];
  };
  const pushRow = () => {
    push();
    rows.push(row);
    row = [];
  };
  while (i < n) {
    if (inQuotes) {
      const q = text.indexOf('"', i);
      if (q === -1) {
        // Unterminated quote: the rest of the input is field content.
        parts.push(text.slice(i));
        i = n;
        break;
      }
      if (q > i) parts.push(text.slice(i, q));
      if (text.charCodeAt(q + 1) === QUOTE) {
        parts.push('"');
        i = q + 2;
        continue;
      }
      inQuotes = false;
      i = q + 1;
      continue;
    }
    const c = text.charCodeAt(i);
    if (c === QUOTE) {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === COMMA) {
      push();
      i++;
      continue;
    }
    if (c === CR) {
      i++;
      continue;
    }
    if (c === LF) {
      pushRow();
      i++;
      continue;
    }
    // Batch a run of ordinary characters up to the next structural one.
    let j = i + 1;
    while (j < n) {
      const d = text.charCodeAt(j);
      if (d === QUOTE || d === COMMA || d === CR || d === LF) break;
      j++;
    }
    parts.push(text.slice(i, j));
    i = j;
  }
  if (parts.length > 0 || row.length > 0) pushRow();
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

  // ── Duplicate header names ────────────────────────────────────────────
  // Every column resolution below picks the FIRST occurrence of a header
  // string (via findIndex). A duplicated header name — Meta's own pivot
  // exporter has been observed to emit "Result value type" twice — silently
  // drops the LATER occurrence's column, but with no visible index the drop
  // reads as if that data never existed. Surface it once, up front.
  {
    const seen = new Set<string>();
    const duplicated = new Set<string>();
    for (const h of headerStrings) {
      if (h === "") continue;
      if (seen.has(h)) duplicated.add(h);
      seen.add(h);
    }
    // Folded into ONE line, same policy as the auto-match cascades below.
    // Meta's pivot exporter duplicates a fixed set of headers together, so
    // this fired three times per file on every real export — six of the
    // fifteen warnings on a live AAFE run were this one notice, crowding
    // out the coverage and ID-corruption warnings that actually needed
    // acting on. One line naming every affected column says the same thing.
    const dupes = [...duplicated];
    if (dupes.length === 1) {
      warnings.push(
        `Column "${dupes[0]}" appears more than once in the header row — only the first occurrence is used.`,
      );
    } else if (dupes.length > 1) {
      warnings.push(
        `${dupes.length} columns appear more than once in the header row — only the first occurrence of each is used: ` +
          `${dupes.map((h) => `"${h}"`).join(", ")}.`,
      );
    }
  }

  // Single authoritative summary map: canonical → entry. Using a Map (not an
  // array) guarantees exactly one entry per canonical column even when a column
  // passes through multiple resolution stages (e.g. initially "missing" then
  // promoted to "inferred" by the inference pass).
  const summaryMap = new Map<string, ColumnMappingSummaryEntry>();

  // Track which header values have been claimed by a canonical mapping
  // (used later for the inferred-match pass over unmapped headers).
  const claimedHeaderValues = new Set<string>();

  // Warning-noise policy (shared by the breakdown and metric cascades below):
  // a per-column "auto-matched — verify" line is only worth the reader's
  // attention when there is something to verify. Three match kinds never are:
  // (a) deterministic normalizations (slug/case-insensitive/currency-suffix —
  // a spreadsheet round-trip mangles "CPM (cost per 1,000 impressions)" into
  // "CPM _cost per 1_000 impressions_", some export types append "(USD)" to
  // every monetary column, and normalized-name matching is 1:1,
  // not a guess), (b) curated ALIAS matches — the alias table maps headers
  // Meta itself emits ("Reporting starts" IS the native date header on
  // ad-level summary exports; telling the user to rename a column Meta named
  // is advice they can't act on), and (c) any match on a
  // DERIVED_OR_IRRELEVANT column, whose values are recomputed from
  // primitives and never trusted regardless. Those fold into ONE summary
  // line (full detail stays in mappingSummary / the Import Confidence
  // report). Moderate-confidence inference keeps its individual warning —
  // that one genuinely needs verifying.
  let foldedAutoMatches = 0;
  let foldedExample: { from: string; to: string } | null = null;
  const foldAutoMatch = (col: string, headerValue: string): void => {
    foldedAutoMatches += 1;
    if (!foldedExample) foldedExample = { from: headerValue, to: resolveCurrencyLabel(col) };
  };
  const isDeterministicVia = (via: string): boolean =>
    via === "slug" || via === "case_insensitive" || via === "alias" || via === "currency";

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
        if (isDeterministicVia(match.via)) {
          foldAutoMatch(col, match.headerValue);
        } else {
          warnings.push(
            `Column "${col}" was auto-matched from "${match.headerValue}" (via ${match.via} match). ` +
              `Renaming it to "${col}" in your export will improve reliability.`,
          );
        }
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
  // (Warning-noise policy + fold state are declared above the breakdown
  // cascade — both cascades share them.)
  const acceptedBaseColumns: readonly string[] = [...BASE_METRICS, ...DERIVED_OR_IRRELEVANT_METRICS];
  for (const col of acceptedBaseColumns) {
    if (col === "Amount spent ({ACCOUNT_CURRENCY})") {
      const match = findColumnInHeader(headerStrings, col);
      if (match) {
        amountSpentIdx = rawHeader.findIndex((h) => h.trim() === match.headerValue);
        claimedHeaderValues.add(match.headerValue);
        if (match.via !== "exact" && match.via !== "currency") {
          columnMappings[col] = match;
          if (isDeterministicVia(match.via)) {
            foldAutoMatch(col, match.headerValue);
          } else {
            warnings.push(
              `Spend column auto-matched from "${match.headerValue}" (via ${match.via} match).`,
            );
          }
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
        if (DERIVED_OR_IRRELEVANT_METRICS.includes(col) || isDeterministicVia(match.via)) {
          foldAutoMatch(col, match.headerValue);
        } else {
          warnings.push(
            `Metric column "${col}" auto-matched from "${match.headerValue}" (via ${match.via} match).`,
          );
        }
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

  // Creative metadata columns (only for ad_summary): use same resolution cascade
  // as breakdown columns so aliases like "body text" → "Ad creative body text" work.
  //
  // Placed with the other cascades, BEFORE unmappedHeaders is computed and
  // before the fold summary is emitted. It used to run several hundred lines
  // later, which broke both: its headers were still unclaimed when the
  // unknown-column pass ran (so "Body text"/"Headline"/"CTA" — columns this
  // cascade maps successfully — were eligible to be reported as unrecognised
  // and offered a rename suggestion), and any fold it contributed landed in a
  // counter that had already been reported.
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
          // Same fold policy as the breakdown/spend/metric cascades above —
          // this cascade previously bypassed it, so every ad_summary export
          // using Meta's own shorter header names ("Body text", "Headline",
          // "CTA" — all curated aliases) produced one "auto-matched" line per
          // column. That is the BUG-20 warning-noise class: a deterministic
          // mapping the user cannot act on and does not need to verify.
          if (isDeterministicVia(match.via)) {
            foldAutoMatch(col, match.headerValue);
          } else {
            warnings.push(
              `Creative metadata column "${col}" auto-matched from "${match.headerValue}" (via ${match.via} match).`,
            );
          }
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

  // (read through a typed local — TS's flow analysis can't see the closure assignment)
  const foldedExampleValue = foldedExample as { from: string; to: string } | null;
  if (foldedAutoMatches > 0 && foldedExampleValue) {
    warnings.push(
      `${foldedAutoMatches} column(s) arrived under known alternate or spreadsheet-altered names and were matched automatically ` +
        `(e.g. "${foldedExampleValue.from}" → "${foldedExampleValue.to}") — no action needed; the full mapping is in the column report below.`,
    );
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

  // Hard-error if a breakdown column this CLASS actually requires is still
  // unresolvable after inference. Gated on spec.requiredBreakdownColumns, not
  // the fixed CRITICAL_BREAKDOWN_COLUMNS set below — that set is shared across
  // all 4 classes and doesn't know that ad_summary carries "Campaign name" as
  // an optional breakdown column (AD_SUMMARY_BREAKDOWN_COLUMNS includes it) but
  // does NOT require it (ad_summary's requiredBreakdownColumns is just
  // ["Day", "Ad name"]). Filtering on membership in that fixed set alone
  // rejected ad-level exports that omit Campaign name — a legitimate, common
  // shape — instead of proceeding with a warning like any other optional
  // breakdown column.
  const criticalStillMissing = stillMissingAfterInference.filter((c) =>
    spec.requiredBreakdownColumns.includes(c),
  );
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
  const nonCriticalStillMissing = stillMissingAfterInference.filter(
    (c) => !spec.requiredBreakdownColumns.includes(c),
  );
  if (nonCriticalStillMissing.filter((c) => spec.breakdownColumns.includes(c)).length > 0) {
    const missing = nonCriticalStillMissing.filter((c) => spec.breakdownColumns.includes(c));
    warnings.push(
      `Note: optional breakdown columns not present in this export (treated as blank): ` +
        `${missing.join(", ")}. ` +
        `Include them in the export for more breakdown detail.`,
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

  // ── Resolve optional metrics through the same alias cascade as breakdown
  // and creative-metadata columns below (exact → currency → case-insensitive
  // → alias). A prior exact-string-only lookup here silently dropped any
  // optional metric whose header used an aliased/renamed form — e.g. a
  // client export with 216 "Adds of payment info" events under a column
  // name not byte-identical to the canonical, with no warning that they'd
  // been dropped.
  const optionalMetricIdx = new Map<string, number>(); // canonical → rawHeader index
  const optionalMetricsPresent: string[] = [];
  for (const col of OPTIONAL_METRICS) {
    const match = findColumnInHeader(headerStrings, col);
    if (!match) continue;
    const idx = rawHeader.findIndex((h) => h.trim() === match.headerValue);
    if (idx < 0) continue;
    optionalMetricsPresent.push(col);
    optionalMetricIdx.set(col, idx);
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
  const parseBaseMetrics = (cells: string[]): Record<string, number | string | null> => {
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
    return base;
  };

  const rows: IapCsvRow[] = [];
  const totalsRows: { line: number; base: Record<string, number | string | null> }[] = [];
  // Meta object-ID breakdowns that arrived corrupted at the source (a
  // spreadsheet tool re-saved the long ID as a float and exported it in
  // scientific notation, e.g. "1.20253E+17"). The exact digits are already
  // gone, so the only safe move — same policy as xlsxToCsv's numeric-cell
  // guard — is to blank the cell rather than store an ID that could cause
  // false joins, and say so once per column.
  const ID_BREAKDOWN_COLUMNS = ["Ad ID", "Ad set ID", "Campaign ID"];
  const SCI_NOTATION_RE = /^-?\d+(?:[.,]\d+)?[eE][+-]?\d+$/;
  const idCorruption = new Map<string, { count: number; example: string }>();
  for (let li = 1; li < lines.length; li++) {
    const cells = lines[li]!;
    if (cells.every((c) => c.trim() === "")) continue;

    const breakdowns: Record<string, string> = {};
    for (const col of spec.breakdownColumns) {
      const idx = breakdownIdx.get(col);
      breakdowns[col] = idx !== undefined ? (cells[idx] ?? "").trim() : "";
    }
    for (const idCol of ID_BREAKDOWN_COLUMNS) {
      const v = breakdowns[idCol];
      if (v && SCI_NOTATION_RE.test(v)) {
        breakdowns[idCol] = "";
        const prior = idCorruption.get(idCol);
        idCorruption.set(idCol, { count: (prior?.count ?? 0) + 1, example: prior?.example ?? v });
      }
    }

    // "Day" is required on every class and is the column Meta leaves blank on
    // the grand-totals row it appends. Park the row for cross-validation
    // instead of rejecting the file — see the totals cross-validation block
    // below, after all real data rows have been parsed and summed.
    if (!breakdowns["Day"]) {
      totalsRows.push({ line: li + 1, base: parseBaseMetrics(cells) });
      continue;
    }

    // Required breakdown VALUES (row-level), Day already confirmed present
    // above. The column is known to exist by this point, so a blank here on
    // a row that does have a Day value is a genuinely malformed row.
    for (const req of spec.requiredBreakdownColumns) {
      if (req === "Day") continue;
      if (!breakdowns[req]) {
        throw new IapCsvFormatError(
          `Row ${li + 1}: the "${req}" column is present but blank on this row.`,
        );
      }
    }

    const base = parseBaseMetrics(cells);

    const extra: Record<string, number | string | null> = {};
    for (const col of optionalMetricsPresent) {
      const idx = optionalMetricIdx.get(col);
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

  // Normalize every "Day" value to YYYY-MM-DD before anything downstream
  // (bucket keys, window math, DB date columns) sees it — see the
  // normalizeDayValues doc comment for why this must happen here and nowhere
  // later. Throws IapCsvFormatError on unresolvable/ambiguous formats.
  normalizeDayValues(rows, warnings);

  for (const [idCol, entry] of idCorruption) {
    warnings.push(
      `⚠ "${idCol}" could not be read reliably from this file: ${entry.count} of ${rows.length + totalsRows.length} ` +
        `row(s) stored it in scientific notation (for example "${entry.example}") — this is what happens when a tool ` +
        `like Google Sheets re-saves a long Meta ID as a number instead of text. Those cells were left blank rather ` +
        `than risk an incorrect ID; joins that depend on "${idCol}" will skip these rows. Re-export the source report ` +
        `as CSV, or format the "${idCol}" column as Text before saving, to preserve the exact value.`,
    );
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

  // ── Totals-row cross-validation ─────────────────────────────────────────
  // The row(s) parked above as Meta's own totals are Meta's own arithmetic on
  // this export — a free check of what this parser independently summed from
  // the data rows. Only a single grand-total row can be checked this way: a
  // pivot export with subtotals per breakdown group could produce several
  // totals rows, and summing those would double-count against the grand
  // total, so multiple totals rows are excluded from `rows` but not
  // cross-checked, and that's called out as a warning of its own.
  if (totalsRows.length === 1) {
    const totalsRow = totalsRows[0]!;
    for (const col of BASE_METRICS) {
      if (STRING_VALUED.has(col)) continue;
      const slug = slugifyColumn(col);
      const reported = totalsRow.base[slug];
      if (typeof reported !== "number") continue;
      const computed = coverage.columns.find((c) => c.slug === slug)?.sum;
      if (computed === null || computed === undefined) continue;
      const diff = Math.abs(computed - reported);
      const tolerance = Math.max(1, Math.abs(reported) * 0.01);
      if (diff > tolerance) {
        warnings.push(
          `Totals row (line ${totalsRow.line}) reports ${resolveCurrencyLabel(col)} = ${reported.toLocaleString()}, ` +
            `but the ${rows.length.toLocaleString()} data rows sum to ${computed.toLocaleString()} ` +
            `— off by ${diff.toLocaleString()}. Check the export wasn't truncated before running analysis.`,
        );
      }
    }
  } else if (totalsRows.length > 1) {
    warnings.push(
      `This export included ${totalsRows.length} totals/subtotal rows (line ${totalsRows.map((t) => t.line).join(", ")}). ` +
        `They were excluded from analysis; with more than one, Metrix can't cross-check them against its own sums without risking double-counting.`,
    );
  }

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
  let conversionExportSuspected = false;
  if (csvClass !== "conversion_device") {
    const impressionsFound = baseMetricIdx.has("Impressions");
    if (impressionsFound) {
      const impressionValues = rows.map((row) => row.base["impressions"]);
      const allZeroOrNull = impressionValues.every((v) => v === null || v === 0);
      const anyExplicitZero = impressionValues.some((v) => v === 0);
      if (allZeroOrNull && anyExplicitZero) {
        conversionExportSuspected = true;
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
    conversionExportSuspected,
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

// ── "Day" date-format normalization ─────────────────────────────────────
//
// Meta Ads Manager exports "Day" as YYYY-MM-DD, and every consumer downstream
// of this parser (aggregation bucket keys, lexicographic min/max window math,
// the analysis engine's date-window delete, and Postgres `date` columns)
// assumes exactly that. A file round-tripped through Google Sheets/Excel can
// instead carry "7/1/2026"-style slash dates. Before this normalization pass
// existed, such a file poisoned every one of those consumers at once: the
// same real-world day existed under two different string keys (so buckets
// didn't merge and the DB's unique key — which compares parsed dates, not
// strings — rejected the second row), and lexicographic min/max over mixed
// formats produced a wrong analysis window whose delete pass destroyed
// neighbouring rows it should have left alone. This is the root cause of the
// August 2026 AAFE re-ingestion failure ("duplicate key value violates
// unique constraint ad_performance_...").
//
// Policy (honesty invariant — never guess silently):
//   - YYYY-MM-DD and YYYY/M/D pass through (slash form normalized).
//   - M/D/YYYY vs D/M/YYYY is disambiguated per FILE from component
//     evidence: any first component > 12 proves day-first, any second
//     component > 12 proves month-first. Both kinds present → hard error
//     (inconsistent file). Neither present in the entire file → hard error
//     (genuinely ambiguous; the fix is re-exporting with ISO dates), never
//     a silent guess that could shift rows to wrong months.
//   - Anything else (Excel serial numbers, two-digit years, datetimes) is a
//     hard error naming the offending value and the remedy.

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const SLASH_DMY_OR_MDY_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const SLASH_YMD_RE = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/;

const DAY_FORMAT_REMEDY =
  "Export the report as CSV directly from Meta Ads Manager (dates stay YYYY-MM-DD), " +
  "or format the Day column as YYYY-MM-DD before saving from a spreadsheet tool.";

/** Validates y/m/d as a real calendar date and returns zero-padded ISO, throwing with the raw cell named otherwise. */
function toValidatedIso(y: number, m: number, d: number, raw: string): string {
  const t = Date.UTC(y, m - 1, d);
  const roundTrip = new Date(t);
  if (roundTrip.getUTCFullYear() !== y || roundTrip.getUTCMonth() !== m - 1 || roundTrip.getUTCDate() !== d) {
    throw new IapCsvFormatError(
      `The "Day" column contains "${raw}", which is not a real calendar date. ${DAY_FORMAT_REMEDY}`,
    );
  }
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Normalizes every row's "Day" breakdown to YYYY-MM-DD in place, appending a
 * single summary warning when conversion happened. Exported for unit tests.
 */
export function normalizeDayValues(rows: IapCsvRow[], warnings: string[]): void {
  const slashRows: { row: IapCsvRow; a: number; b: number; y: number; raw: string }[] = [];
  let ymdConverted = 0;
  for (const row of rows) {
    const raw = row.breakdowns["Day"];
    if (!raw) continue; // blank-Day totals rows never reach `rows`; defensive only
    if (ISO_DAY_RE.test(raw)) {
      const [y, m, d] = raw.split("-").map(Number) as [number, number, number];
      row.breakdowns["Day"] = toValidatedIso(y, m, d, raw);
      continue;
    }
    const ymd = SLASH_YMD_RE.exec(raw);
    if (ymd) {
      row.breakdowns["Day"] = toValidatedIso(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]), raw);
      ymdConverted++;
      continue;
    }
    const slash = SLASH_DMY_OR_MDY_RE.exec(raw);
    if (slash) {
      slashRows.push({ row, a: Number(slash[1]), b: Number(slash[2]), y: Number(slash[3]), raw });
      continue;
    }
    const serialHint = /^\d{4,6}$/.test(raw)
      ? ` This looks like a spreadsheet date serial number — the tool that saved this file stored the date as a raw number.`
      : "";
    throw new IapCsvFormatError(
      `The "Day" column contains "${raw}", which is not a recognized date format.${serialHint} ${DAY_FORMAT_REMEDY}`,
    );
  }

  if (slashRows.length > 0) {
    const firstGT12 = slashRows.some((s) => s.a > 12);
    const secondGT12 = slashRows.some((s) => s.b > 12);
    if (firstGT12 && secondGT12) {
      throw new IapCsvFormatError(
        `The "Day" column mixes incompatible slash date formats (some rows can only be D/M/YYYY, others only M/D/YYYY). ` +
          `The file's dates cannot be trusted as-is. ${DAY_FORMAT_REMEDY}`,
      );
    }
    if (!firstGT12 && !secondGT12) {
      throw new IapCsvFormatError(
        `The "Day" column uses slash dates (e.g. "${slashRows[0]!.raw}") where every value is ambiguous between ` +
          `M/D/YYYY and D/M/YYYY. Rather than guess and risk placing rows in the wrong month, Metrix needs unambiguous dates. ${DAY_FORMAT_REMEDY}`,
      );
    }
    const monthFirst = secondGT12;
    for (const s of slashRows) {
      const month = monthFirst ? s.a : s.b;
      const day = monthFirst ? s.b : s.a;
      s.row.breakdowns["Day"] = toValidatedIso(s.y, month, day, s.raw);
    }
  }

  const converted = ymdConverted + slashRows.length;
  if (converted > 0) {
    warnings.push(
      `The "Day" column used ${slashRows.length > 0 ? (slashRows.some((s) => s.a > 12) ? "D/M/YYYY" : "M/D/YYYY") : "YYYY/M/D"} ` +
        `dates (typically a spreadsheet round-trip artifact) — ${converted} row(s) were normalized to YYYY-MM-DD. ` +
        `Exporting the report as CSV directly from Meta avoids this conversion.`,
    );
  }
}
