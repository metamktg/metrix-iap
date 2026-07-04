// ═══════════════════════════════════════════════════════════════════════
// METRIX IAP — Import Validation Utilities
// Source of truth: metrix_iap_ads_reporting_pivot_template_classes_final.json
// Two export classes: IAP_DEMOGRAPHIC_TEXT_SIGNAL + IAP_DEVICE_PLACEMENT_PLATFORM_SIGNAL
// Each export: 10 breakdown columns + 125 metric columns = 135 total columns
// ═══════════════════════════════════════════════════════════════════════

import type { ImportFile, ImportStatus } from "../types";

// ─── 125 shared metric columns (same across both export classes) ───────

export const SHARED_METRIC_COLUMNS = [
  "Amount spent (USD)",
  "Reach",
  "Impressions",
  "Frequency",
  "CPM (cost per 1,000 impressions)",
  "Cost per 1,000 Accounts Center accounts reached",
  "Result type",
  "Results",
  "Cost per result",
  "Result rate",
  "Results rate per link clicks",
  "Result value type",
  "Results value",
  "Views",
  "Clicks (all)",
  "CPC (all)",
  "CTR (all)",
  "Link clicks",
  "CPC (cost per link click)",
  "CTR (link click-through rate)",
  "Unique CTR (link click-through rate)",
  "Unique clicks (all)",
  "Cost per unique click (all)",
  "Cost per unique link click",
  "Outbound clicks",
  "Unique outbound clicks",
  "Outbound CTR (click-through rate)",
  "Unique outbound CTR (click-through rate)",
  "Cost per outbound click",
  "Cost per unique outbound click",
  "Landing page views",
  "Cost per landing page view",
  "Landing page views rate per link clicks",
  "Page engagement",
  "Post engagements",
  "Post comments",
  "Post reactions",
  "Post saves",
  "Post shares",
  "Cost per Page engagement",
  "Cost per post engagement",
  "Cost per post share",
  "Cost per interaction",
  "Instagram profile visits",
  "Quality ranking",
  "Engagement rate ranking",
  "Conversion rate ranking",
  "Ad recall lift rate",
  "Video average play time",
  "Video plays",
  "3-second video plays",
  "Unique 2-second continuous video plays",
  "Video plays at 25%",
  "Video plays at 50%",
  "Video plays at 75%",
  "Video plays at 95%",
  "Video plays at 100%",
  "ThruPlays",
  "Cost per ThruPlay",
  "Cost per 3-second video play",
  "Cost per 2-second continuous video play",
  // Ecommerce / DTC
  "Adds to cart",
  "Cost per add to cart",
  "Adds to cart conversion value",
  "Content views",
  "Cost per content view",
  "Content views conversion value",
  "Checkouts initiated",
  "Cost per checkout initiated",
  "Purchases",
  "Cost per purchase",
  "Purchase ROAS (return on ad spend)",
  "Website purchase ROAS (return on ad spend)",
  "Website purchases",
  "Website purchases conversion value",
  "Direct website purchases",
  "Direct website purchases conversion value",
  "Shops-assisted purchases",
  "Shops-assisted purchases conversion value",
  "Meta purchases",
  "Meta purchases conversion value",
  "Purchases conversion value",
  "Average purchases conversion value",
  "Purchases rate per landing page views",
  "Purchases rate per link clicks",
  // Service business
  "Leads",
  "Cost per lead",
  "Leads conversion value",
  "Meta leads",
  "Website leads",
  "Contacts",
  "Cost per contact",
  "Contact conversion value",
  "Appointments scheduled",
  "Cost per appointment scheduled",
  "Registrations completed",
  "Cost per registration completed",
  "Registrations completed conversion value",
  "Calls placed",
  "20-second calls",
  "60-second calls",
  "Estimated call confirmation clicks",
  "Callback requests submitted",
  // App promotion
  "App installs",
  "Cost per app install",
  "Mobile app installs",
  "Cost per mobile app install",
  "Cost per app activation",
  "App activations",
  "App activations conversion value",
  "In-app sessions",
  "Cost per in-app session",
  "In-app sessions conversion value",
  "In-app purchases",
  "Cost per in-app purchase",
  "In-app registrations completed",
  "Cost per in-app registration completed",
  "In-app trials started",
  "Cost per in-app trial started",
  "In-app subscriptions",
  "Cost per in-app subscription",
  "In-app subscriptions conversion value",
  "Ratings submitted",
  "Cost per rating submitted",
  "Ratings submitted conversion value",
] as const;

// ─── Export Class 1: IAP_DEMOGRAPHIC_TEXT_SIGNAL ──────────────────────
// 10 breakdown columns + 125 metric columns = 135 total

export const DEMOGRAPHIC_TEXT_BREAKDOWN_COLUMNS = [
  "Date",
  "Campaign ID",
  "Campaign name",
  "Ad set ID",
  "Ad set name",
  "Ad ID",
  "Ad name",
  "Gender",
  "Age",
  "Text",
] as const;

export const DEMOGRAPHIC_TEXT_EXPECTED_HEADERS = [
  ...DEMOGRAPHIC_TEXT_BREAKDOWN_COLUMNS,
  ...SHARED_METRIC_COLUMNS,
] as string[];

// ─── Export Class 2: IAP_DEVICE_PLACEMENT_PLATFORM_SIGNAL ────────────
// 10 breakdown columns + 125 metric columns = 135 total

export const DEVICE_PLACEMENT_BREAKDOWN_COLUMNS = [
  "Date",
  "Campaign ID",
  "Campaign name",
  "Ad set ID",
  "Ad set name",
  "Ad ID",
  "Ad name",
  "Impression device",
  "Platform",
  "Placement",
] as const;

export const DEVICE_PLACEMENT_PLATFORM_EXPECTED_HEADERS = [
  ...DEVICE_PLACEMENT_BREAKDOWN_COLUMNS,
  ...SHARED_METRIC_COLUMNS,
] as string[];

// ─── Required minimum breakdown columns for detection ─────────────────
// (used for fuzzy detection on partial uploads)

const DEMO_TEXT_REQUIRED_DETECTION = ["Gender", "Age", "Text"];
const DEVICE_REQUIRED_DETECTION = ["Impression device", "Platform", "Placement"];

// ─── Types ─────────────────────────────────────────────────────────────

export type ValidationWarning =
  | "missing_column"
  | "duplicate_column"
  | "date_mismatch"
  | "low_sample_size"
  | "invalid_totals"
  | "unrecognized_column"
  | "wrong_file_type"
  | "empty_file"
  | "missing_breakdown_columns";

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

// ─── File type detection ───────────────────────────────────────────────

/**
 * Detect which IAP export class a set of headers belongs to.
 * Uses breakdown-column fingerprinting since metrics are shared.
 */
export function detectFileType(
  headers: string[]
): "demographic_text" | "device_placement_platform" | "unknown" {
  const headerSet = new Set(headers.map((h) => h.trim()));

  const hasDemoSignal = DEMO_TEXT_REQUIRED_DETECTION.every((h) => headerSet.has(h));
  const hasDeviceSignal = DEVICE_REQUIRED_DETECTION.every((h) => headerSet.has(h));

  if (hasDemoSignal && !hasDeviceSignal) return "demographic_text";
  if (hasDeviceSignal && !hasDemoSignal) return "device_placement_platform";

  // Fallback: score against full expected headers
  const demoScore = DEMOGRAPHIC_TEXT_EXPECTED_HEADERS.filter((h) => headerSet.has(h)).length;
  const deviceScore = DEVICE_PLACEMENT_PLATFORM_EXPECTED_HEADERS.filter((h) => headerSet.has(h)).length;

  if (demoScore > deviceScore && demoScore >= 10) return "demographic_text";
  if (deviceScore > demoScore && deviceScore >= 10) return "device_placement_platform";
  return "unknown";
}

/**
 * Validate a CSV file's headers against the expected schema for its class.
 * 10 breakdown + 125 metric columns = 135 total per class.
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

  const breakdownCols =
    fileType === "demographic_text"
      ? DEMOGRAPHIC_TEXT_BREAKDOWN_COLUMNS
      : DEVICE_PLACEMENT_BREAKDOWN_COLUMNS;

  const headerSet = new Set(headers.map((h) => h.trim()));
  const expectedSet = new Set(expected);

  const warnings: ValidationWarningDetail[] = [];
  const mapped_columns: MappedColumn[] = [];
  const unmapped_columns: string[] = [];

  // Check for missing breakdown columns (critical — these identify the export class)
  for (const col of breakdownCols) {
    if (!headerSet.has(col)) {
      warnings.push({
        type: "missing_breakdown_columns",
        message: `Required breakdown column "${col}" not found. This column identifies the export type.`,
        column: col,
        severity: "error",
      });
    }
  }

  // Check all expected columns
  for (const col of expected) {
    if (!headerSet.has(col)) {
      warnings.push({
        type: "missing_column",
        message: `Column "${col}" not found in file`,
        column: col,
        severity: "warning",
      });
      mapped_columns.push({ source: "", target: col, status: "needs_mapping" });
    } else {
      mapped_columns.push({ source: col, target: col, status: "mapped" });
    }
  }

  // Unrecognized columns
  for (const col of headers) {
    const trimmed = col.trim();
    if (!expectedSet.has(trimmed)) {
      warnings.push({
        type: "unrecognized_column",
        message: `Column "${trimmed}" is not part of the ${fileType === "demographic_text" ? "IAP_DEMOGRAPHIC_TEXT_SIGNAL" : "IAP_DEVICE_PLACEMENT_PLATFORM_SIGNAL"} export class`,
        column: trimmed,
        severity: "info",
      });
      unmapped_columns.push(trimmed);
    }
  }

  // Duplicate columns
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

  // Row count check
  if (rowCount === 0) {
    warnings.push({ type: "empty_file", message: "File contains no data rows", severity: "error" });
  } else if (rowCount < 10) {
    warnings.push({
      type: "low_sample_size",
      message: `Only ${rowCount} rows — very small sample, signal quality will be insufficient`,
      severity: "warning",
    });
  }

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
 * Validate that two import files have matching date ranges.
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
      message: `End dates do not match`,
      severity: "error",
    });
  }
  return warnings;
}

/**
 * Check if an import has both required export class files.
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
 * Compute overall import status from its files.
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

// ─── Template info for the upload UI ──────────────────────────────────

export const EXPORT_CLASS_INFO = {
  demographic_text: {
    class_name: "IAP_DEMOGRAPHIC_TEXT_SIGNAL",
    label: "Demographic & Text Signal",
    description: "Breakdown by gender, age, and ad copy text.",
    breakdown_columns: [...DEMOGRAPHIC_TEXT_BREAKDOWN_COLUMNS],
    total_columns: 135,
    breakdown_count: 10,
    metric_count: 125,
    how_to_export: [
      "In Meta Ads Manager, go to Reports → Create Custom Report",
      "Set breakdown: Gender, Age, Ad Name",
      "Select all 125 metric columns from the master list",
      "Export as CSV — no totals, no subtotals",
      "Use the same date range as your Device & Placement export",
    ],
  },
  device_placement_platform: {
    class_name: "IAP_DEVICE_PLACEMENT_PLATFORM_SIGNAL",
    label: "Device, Placement & Platform Signal",
    description: "Breakdown by impression device, platform, and placement.",
    breakdown_columns: [...DEVICE_PLACEMENT_BREAKDOWN_COLUMNS],
    total_columns: 135,
    breakdown_count: 10,
    metric_count: 125,
    how_to_export: [
      "In Meta Ads Manager, go to Reports → Create Custom Report",
      "Set breakdown: Impression Device, Platform, Placement",
      "Select all 125 metric columns from the master list",
      "Export as CSV — no totals, no subtotals",
      "Use the same date range as your Demographic & Text export",
    ],
  },
} as const;
