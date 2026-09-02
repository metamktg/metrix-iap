// Report grain detection and canonical identity for manual Meta exports.
//
// A staged file arrives in a SLOT (`manual_imports.kind`, client-declared,
// wrong-slot files rejected by detectCsvClassMismatch). The slot says which
// template the columns are resolved against; it does not say what the file
// can PROVE. That is the grain: which dimensions the rows carry, whether they
// are daily or whole-period, whether Ad ID is present and joinable, and
// which delivered asset breakdowns are on the row. The grain is detected
// once at staging, stored on the import (`manual_imports.report_grain`), and
// read by the reconciliation layer to decide compatibility and authority.
//
// Everything here is pure. See docs/specs/iap-multi-report-reconciliation.md
// §3 (classes and grains), §4 (classification), §6 (identity), §10 (assets).

import { createHash } from "node:crypto";
import type { IapCsvParseResult, IapCsvRow } from "./iapCsvParser";
import {
  ASSET_BREAKDOWN_COLUMNS,
  BASE_METRICS,
  NON_ADDITIVE_METRIC_SLUGS,
  OPTIONAL_METRICS,
  RATE_METRIC_SLUGS,
  slugifyColumn,
  type AssetType,
  type IapCsvClass,
} from "./iapCsvSpec";

export { NON_ADDITIVE_METRIC_SLUGS, RATE_METRIC_SLUGS };

// ─── Report classes ────────────────────────────────────────────────────────

export type ReportClass =
  | "ad_summary"
  | "time_series"
  | "demographic"
  | "placement"
  | "asset"
  | "demographic_asset"
  | "placement_asset"
  | "conversion_device";

export type AdIdentityKind = "ad_id" | "ad_name" | "unjoinable";

export interface AdIdentity {
  kind: AdIdentityKind;
  /** The join key: the Meta Ad ID for `ad_id`, the ad name for `ad_name`, "" for `unjoinable`. */
  key: string;
  ad_name: string;
  meta_ad_id: string | null;
}

export interface AssetColumnPresence {
  column: string;
  asset_type: AssetType;
}

export interface ReportGrain {
  report_class: ReportClass;
  csv_class: IapCsvClass;
  /** The Ad ID column resolved and carries a value on at least one row. */
  has_ad_id: boolean;
  /** Share (0–100) of rows carrying a non-blank Ad ID. */
  ad_id_fill_pct: number;
  /** has_ad_id AND the Ad ID header is not in schema conflict. */
  ad_id_joinable: boolean;
  /** Rows span more than one distinct Day (a daily export). */
  has_day: boolean;
  distinct_days: number;
  /** The reporting period the rows cover: Day min/max, or the Reporting ends context when present. */
  period: { start: string; end: string } | null;
  /** Whole-period aggregate: one Day value on every row (Meta's "Reporting starts"). */
  aggregate_shape: boolean;
  /** Breakdown dimensions present WITH values (Gender, Age, Platform, Placement, Impression device, Conversion device). */
  dimensions: string[];
  /** Delivered asset breakdown columns present with values, mapped to asset types. */
  asset_columns: AssetColumnPresence[];
  distinct_ad_ids: number;
  distinct_ad_names: number;
  /** Ad names that appear under more than one Ad ID in this file — proof that names are not identifiers here. */
  reused_ad_names: number;
  currency: string | null;
  /** Distinct "Account ID" values when the export carries the column. */
  account_ids: string[];
  /** Distinct "Attribution setting" values when the export carries the column. */
  attribution_settings: string[];
  /** Canonical headers in schema conflict (duplicated with differing values). */
  header_conflicts: string[];
  /** Additive metric slugs present with at least one value. */
  additive_metrics: string[];
  /** Non-additive metric slugs present (reach, frequency, unique_*, averages). */
  non_additive_metrics: string[];
}

// ─── Metric additivity ─────────────────────────────────────────────────────

const STRING_METRIC_SLUGS: ReadonlySet<string> = new Set(["result_type", "result_value_type"]);

/**
 * Every base and objective-group metric that is a count or a value, i.e.
 * additive across rows. Derived by exclusion from the spec's own lists so a
 * new Meta column becomes additive by default and non-additivity has to be
 * declared (the safer failure: a wrongly-additive unique metric is caught by
 * the ledger's over-count check; a wrongly non-additive count just goes
 * unreconciled).
 */
export const ADDITIVE_METRIC_SLUGS: readonly string[] = [...BASE_METRICS, ...OPTIONAL_METRICS]
  .map(slugifyColumn)
  .filter((slug) => !NON_ADDITIVE_METRIC_SLUGS.has(slug) && !RATE_METRIC_SLUGS.has(slug) && !STRING_METRIC_SLUGS.has(slug));

export function isAdditiveMetric(slug: string): boolean {
  return !NON_ADDITIVE_METRIC_SLUGS.has(slug) && !RATE_METRIC_SLUGS.has(slug) && !STRING_METRIC_SLUGS.has(slug);
}

// ─── Grain detection ───────────────────────────────────────────────────────

const DIMENSION_COLUMNS: readonly string[] = ["Gender", "Age", "Platform", "Placement", "Impression device", "Conversion device"];

function classifyReport(csvClass: IapCsvClass, dims: string[], assetColumns: AssetColumnPresence[], hasDay: boolean): ReportClass {
  const hasAsset = assetColumns.length > 0;
  if (csvClass === "conversion_device") return "conversion_device";
  if (csvClass === "ad_summary") return hasDay ? "time_series" : "ad_summary";
  const hasDemo = dims.includes("Gender") || dims.includes("Age");
  const hasPlacement = dims.includes("Platform") || dims.includes("Placement") || dims.includes("Impression device");
  if (hasDemo && hasAsset) return "demographic_asset";
  if (hasPlacement && hasAsset) return "placement_asset";
  if (hasDemo) return "demographic";
  if (hasPlacement) return "placement";
  if (hasAsset) return "asset";
  return csvClass === "demographic" ? "demographic" : "placement";
}

/**
 * Detects the grain of a parsed file. Pure; runs at staging and at run time
 * over the same parse result, so the two can never disagree.
 */
export function detectReportGrain(parsed: IapCsvParseResult, csvClass: IapCsvClass): ReportGrain {
  const rows = parsed.rows;
  const conflictHeaders = new Set(parsed.headerConflicts.map((c) => c.header));

  const days = new Set<string>();
  const adIds = new Set<string>();
  const adNames = new Set<string>();
  const idsByName = new Map<string, Set<string>>();
  const accountIds = new Set<string>();
  const attribution = new Set<string>();
  const dimsWithValues = new Set<string>();
  const assetCols = new Map<string, AssetType>();
  const additive = new Set<string>();
  const nonAdditive = new Set<string>();
  let adIdRows = 0;
  let periodEnd: string | null = null;

  for (const row of rows) {
    const day = row.breakdowns["Day"];
    if (day) days.add(day);
    const adId = row.breakdowns["Ad ID"]?.trim() ?? "";
    const adName = row.breakdowns["Ad name"]?.trim() ?? "";
    if (adId) {
      adIdRows += 1;
      adIds.add(adId);
      if (adName) {
        const set = idsByName.get(adName) ?? new Set<string>();
        set.add(adId);
        idsByName.set(adName, set);
      }
    }
    if (adName) adNames.add(adName);
    for (const dim of DIMENSION_COLUMNS) {
      if (row.breakdowns[dim]) dimsWithValues.add(dim);
    }
    if (row.assetBreakdowns) {
      for (const col of Object.keys(row.assetBreakdowns)) {
        const type = assetTypeForColumn(col);
        if (type) assetCols.set(col, type);
      }
    }
    if (row.context) {
      if (row.context["Account ID"]) accountIds.add(row.context["Account ID"]);
      if (row.context["Attribution setting"]) attribution.add(row.context["Attribution setting"]);
      const end = row.context["Reporting ends"] ?? row.context["Report end"] ?? row.context["Date end"];
      if (end && (!periodEnd || end > periodEnd)) periodEnd = end;
    }
    for (const [slug, v] of Object.entries(row.base)) {
      if (v === null || typeof v !== "number") continue;
      if (NON_ADDITIVE_METRIC_SLUGS.has(slug)) nonAdditive.add(slug);
      else if (isAdditiveMetric(slug)) additive.add(slug);
    }
    for (const [slug, v] of Object.entries(row.extra)) {
      if (v === null || typeof v !== "number") continue;
      if (isAdditiveMetric(slug)) additive.add(slug);
    }
  }

  const sortedDays = [...days].sort();
  const hasDay = sortedDays.length > 1;
  const reusedNames = [...idsByName.values()].filter((set) => set.size > 1).length;
  const dims = DIMENSION_COLUMNS.filter((d) => dimsWithValues.has(d));
  const assetColumns = [...assetCols.entries()].map(([column, asset_type]) => ({ column, asset_type }));
  const hasAdId = adIds.size > 0;

  return {
    report_class: classifyReport(csvClass, dims, assetColumns, hasDay),
    csv_class: csvClass,
    has_ad_id: hasAdId,
    ad_id_fill_pct: rows.length > 0 ? Math.round((adIdRows / rows.length) * 1000) / 10 : 0,
    ad_id_joinable: hasAdId && !conflictHeaders.has("Ad ID"),
    has_day: hasDay,
    distinct_days: sortedDays.length,
    period:
      sortedDays.length > 0
        ? { start: sortedDays[0]!, end: periodEnd ?? sortedDays[sortedDays.length - 1]! }
        : null,
    aggregate_shape: sortedDays.length === 1 && rows.length > 1,
    dimensions: dims,
    asset_columns: assetColumns,
    distinct_ad_ids: adIds.size,
    distinct_ad_names: adNames.size,
    reused_ad_names: reusedNames,
    currency: parsed.currency,
    account_ids: [...accountIds].sort(),
    attribution_settings: [...attribution].sort(),
    header_conflicts: [...conflictHeaders].sort(),
    additive_metrics: [...additive].sort(),
    non_additive_metrics: [...nonAdditive].sort(),
  };
}

/** Maps a delivered asset breakdown header to its asset type (case-insensitive), or null. */
export function assetTypeForColumn(column: string): AssetType | null {
  const wanted = column.trim().toLowerCase();
  for (const [col, type] of Object.entries(ASSET_BREAKDOWN_COLUMNS)) {
    if (col.toLowerCase() === wanted) return type;
  }
  return null;
}

// ─── Ad identity ───────────────────────────────────────────────────────────

/**
 * Identity of one row's ad, by the spec's priority: Ad ID when the file has a
 * joinable Ad ID column and the row carries one; otherwise the ad name at
 * NAME grain (which only joins Ad-ID-keyed data when the registry proves the
 * name maps to exactly one instance — see `resolveNameToInstances`); otherwise
 * unjoinable. Never a blind fallback: the kind travels with the key.
 */
export function adIdentityOf(row: IapCsvRow, grain: Pick<ReportGrain, "ad_id_joinable">): AdIdentity {
  const adName = row.breakdowns["Ad name"]?.trim() ?? "";
  const adId = row.breakdowns["Ad ID"]?.trim() ?? "";
  if (grain.ad_id_joinable && adId) return { kind: "ad_id", key: adId, ad_name: adName, meta_ad_id: adId };
  if (adName) return { kind: "ad_name", key: adName, ad_name: adName, meta_ad_id: null };
  return { kind: "unjoinable", key: "", ad_name: adName, meta_ad_id: null };
}

/**
 * Name-grain rows join Ad-ID grain only when the account registry maps the
 * name to exactly one instance (spec §6 rule 3: composite identity only when
 * uniqueness is proven). Returns the single Ad ID, or null with the count so
 * the caller can say why.
 */
export function resolveNameToInstances(
  adName: string,
  instancesByName: ReadonlyMap<string, readonly string[]>,
): { meta_ad_id: string | null; instances: number } {
  const ids = instancesByName.get(adName) ?? [];
  return { meta_ad_id: ids.length === 1 ? ids[0]! : null, instances: ids.length };
}

// ─── Asset content identity ────────────────────────────────────────────────

const CASE_INSENSITIVE_TYPES: ReadonlySet<AssetType> = new Set(["cta_type", "destination", "display_link", "image", "video", "media"]);

/**
 * Normalizes an asset value for content identity: Unicode NFKC, whitespace
 * collapsed, trimmed; media names, CTA types and links are lower-cased
 * because Meta's own casing of those varies between exports, while copy keeps
 * its case (a headline in capitals is a different headline).
 */
export function normalizeAssetValue(type: AssetType, raw: string): string {
  const collapsed = raw.normalize("NFKC").replace(/\s+/g, " ").trim();
  return CASE_INSENSITIVE_TYPES.has(type) ? collapsed.toLowerCase() : collapsed;
}

/** SHA-1 over `${type} ${normalized}` — the cross-ad content identity. */
export function assetContentHash(type: AssetType, normalized: string): string {
  return createHash("sha1").update(`${type} ${normalized}`).digest("hex");
}
