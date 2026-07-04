// ═══════════════════════════════════════════════════════════════════════
// METRIX IAP — Import Validation Utilities
// Validates the two known Meta Ads pivot-export CSV types.
// NOT a general-purpose fuzzy column mapper.
// ═══════════════════════════════════════════════════════════════════════

import type { ImportFile, ImportStatus } from "../types";

// ─── Expected column headers for the two known export types ───────────

export const DEMOGRAPHIC_TEXT_EXPECTED_HEADERS = [
  "Ad name",
  "Ad ID",
  "Age",
  "Gender",
  "Amount spent (USD)",
  "Impressions",
  "Clicks (all)",
  "Link clicks",
  "Results",
  "Result type",
  "Cost per result",
  "Purchase ROAS",
  "Reporting starts",
  "Reporting ends",
];

export const DEVICE_PLACEMENT_PLATFORM_EXPECTED_HEADERS = [
  "Ad name",
  "Ad ID",
  "Impression device",
  "Platform",
  "Placement",
  "Amount spent (USD)",
  "Impressions",
  "Clicks (all)",
  "Link clicks",
  "Results",
  "Result type",
  "Cost per result",
  "Purchase ROAS",
  "Reporting starts",
  "Reporting ends",
];

export type ValidationWarning =
  | "missing_column"
  | "duplicate_column"
  | "date_mismatch"
  | "low_sample_size"
  | "invalid_totals"
  | "unrecognized_column"
  | "wrong_file_type"
  | "empty_file";

export interface ValidationResult {
  status: ImportStatus;
  warnings: ValidationWarningDetail[];
  mapped_columns: MappedColumn[];
  unmapped_columns: string[];
  row_count: number;
  date_range_start?: string;
  date_range_end?: string;
}

export interface ValidationWarningDetail {
  type: ValidationWarning;
  message: string;
  column?: string;
  severity: "error" | "warning" | "info";
}

export interface MappedColumn {
  source: string;
  target: string;
  status: "mapped" | "needs_mapping" | "ignored";
}

/**
 * Detect which file type a set of CSV headers corresponds to.
 */
export function detectFileType(
  headers: string[]
): "demographic_text" | "device_placement_platform" | "unknown" {
  const headerSet = new Set(headers.map((h) => h.trim()));

  const demoScore = DEMOGRAPHIC_TEXT_EXPECTED_HEADERS.filter((h) =>
    headerSet.has(h)
  ).length;
  const deviceScore = DEVICE_PLACEMENT_PLATFORM_EXPECTED_HEADERS.filter((h) =>
    headerSet.has(h)
  ).length;

  if (demoScore > deviceScore && demoScore >= 8) return "demographic_text";
  if (deviceScore > demoScore && deviceScore >= 8) return "device_placement_platform";
  return "unknown";
}

/**
 * Validate a CSV file's headers against the expected schema for its type.
 * Returns a ValidationResult with warnings and column mapping status.
 */
export function validateFileHeaders(
  headers: string[],
  fileType: "demographic_text" | "device_placement_platform",
  rowCount: number,
  dateRangeStart?: string,
  dateRangeEnd?: string
): ValidationResult {
  const expected =
    fileType === "demographic_text"
      ? DEMOGRAPHIC_TEXT_EXPECTED_HEADERS
      : DEVICE_PLACEMENT_PLATFORM_EXPECTED_HEADERS;

  const headerSet = new Set(headers.map((h) => h.trim()));
  const expectedSet = new Set(expected);

  const warnings: ValidationWarningDetail[] = [];
  const mapped_columns: MappedColumn[] = [];
  const unmapped_columns: string[] = [];

  // Check for missing required columns
  for (const col of expected) {
    if (!headerSet.has(col)) {
      warnings.push({
        type: "missing_column",
        message: `Required column "${col}" not found in file`,
        column: col,
        severity: "error",
      });
      mapped_columns.push({ source: "", target: col, status: "needs_mapping" });
    } else {
      mapped_columns.push({ source: col, target: col, status: "mapped" });
    }
  }

  // Check for unrecognized columns
  for (const col of headers) {
    const trimmed = col.trim();
    if (!expectedSet.has(trimmed)) {
      warnings.push({
        type: "unrecognized_column",
        message: `Column "${trimmed}" is not in the expected schema for this export type`,
        column: trimmed,
        severity: "warning",
      });
      unmapped_columns.push(trimmed);
    }
  }

  // Check for duplicate columns
  const seen = new Set<string>();
  for (const col of headers) {
    const trimmed = col.trim();
    if (seen.has(trimmed)) {
      warnings.push({
        type: "duplicate_column",
        message: `Duplicate column "${trimmed}" detected`,
        column: trimmed,
        severity: "error",
      });
    }
    seen.add(trimmed);
  }

  // Check row count
  if (rowCount === 0) {
    warnings.push({
      type: "empty_file",
      message: "File contains no data rows",
      severity: "error",
    });
  } else if (rowCount < 10) {
    warnings.push({
      type: "low_sample_size",
      message: `Only ${rowCount} rows — very small sample, findings may not be reliable`,
      severity: "warning",
    });
  }

  // Determine status
  const hasErrors = warnings.some((w) => w.severity === "error");
  const hasWarnings = warnings.some((w) => w.severity === "warning");
  const hasMissingColumns = mapped_columns.some((m) => m.status === "needs_mapping");

  let status: ImportStatus;
  if (hasErrors || hasMissingColumns) {
    status = "Needs Mapping";
  } else if (hasWarnings) {
    status = "Warning";
  } else {
    status = "Ready";
  }

  return {
    status,
    warnings,
    mapped_columns,
    unmapped_columns,
    row_count: rowCount,
    date_range_start: dateRangeStart,
    date_range_end: dateRangeEnd,
  };
}

/**
 * Validate that two files in an import pair have matching date ranges.
 */
export function validateFilePairDates(
  file1: Pick<ImportFile, "date_range_start" | "date_range_end" | "file_type">,
  file2: Pick<ImportFile, "date_range_start" | "date_range_end" | "file_type">
): ValidationWarningDetail[] {
  const warnings: ValidationWarningDetail[] = [];

  if (file1.date_range_start !== file2.date_range_start) {
    warnings.push({
      type: "date_mismatch",
      message: `Start dates do not match: ${file1.file_type} starts ${file1.date_range_start}, ${file2.file_type} starts ${file2.date_range_start}`,
      severity: "error",
    });
  }

  if (file1.date_range_end !== file2.date_range_end) {
    warnings.push({
      type: "date_mismatch",
      message: `End dates do not match: ${file1.file_type} ends ${file1.date_range_end}, ${file2.file_type} ends ${file2.date_range_end}`,
      severity: "error",
    });
  }

  return warnings;
}

/**
 * Check if an import has both required file types present.
 */
export function hasRequiredFilePair(files: ImportFile[]): {
  has_demographic_text: boolean;
  has_device_placement: boolean;
  is_complete: boolean;
} {
  const hasDemographic = files.some((f) => f.file_type === "demographic_text");
  const hasDevice = files.some((f) => f.file_type === "device_placement_platform");
  return {
    has_demographic_text: hasDemographic,
    has_device_placement: hasDevice,
    is_complete: hasDemographic && hasDevice,
  };
}

/**
 * Compute an overall import readiness status from its files.
 */
export function computeImportStatus(files: ImportFile[]): ImportStatus {
  if (files.length === 0) return "Uploaded";

  const statuses = files.map((f) => f.status);
  if (statuses.some((s) => s === "Failed")) return "Failed";
  if (statuses.some((s) => s === "Needs Mapping")) return "Needs Mapping";
  if (statuses.some((s) => s === "Warning")) return "Warning";
  if (statuses.every((s) => s === "Processed")) return "Processed";
  if (statuses.every((s) => s === "Ready" || s === "Processed")) return "Ready";
  if (statuses.some((s) => s === "Validating")) return "Validating";
  return "Uploaded";
}
