// Creative asset instances — configured context and delivered evidence.
//
// An asset instance is THIS asset on THIS ad (instance identity); its content
// hash is the cross-ad content identity. Configured assets come from the Ad
// Summary's creative metadata columns and carry no metrics of their own;
// delivered assets come from a pivot's asset breakdown column and are the
// only ones that ever receive `direct_asset` evidence. The two never blur —
// a headline on the same row as a Text breakdown stays configured context.
// docs/specs/iap-multi-report-reconciliation.md §6, §10.

import { CONFIGURED_ASSET_COLUMNS, type AssetType } from "./iapCsvSpec";
import { type AdIdentity, type AdIdentityKind, assetContentHash, normalizeAssetValue } from "./reportGrain";
import { resolveIdentity, type ReportInput } from "./reconciliation";

export type AssetProvenance = "configured" | "delivered";

export interface CreativeAssetRecord {
  ad_identity_kind: AdIdentityKind;
  ad_identity: string;
  meta_ad_id: string | null;
  ad_name: string;
  asset_type: AssetType;
  raw_value: string;
  normalized_value: string;
  content_hash: string;
  provenance: AssetProvenance;
  source_column: string;
  source_import_id: string;
  date_start: string | null;
  date_end: string | null;
}

/** The instance key: one row per (ad, type, provenance, content). */
export function assetKey(a: Pick<CreativeAssetRecord, "ad_identity_kind" | "ad_identity" | "asset_type" | "provenance" | "content_hash">): string {
  return [a.ad_identity_kind, a.ad_identity, a.asset_type, a.provenance, a.content_hash].join("");
}

function record(
  identity: AdIdentity,
  type: AssetType,
  raw: string,
  provenance: AssetProvenance,
  column: string,
  report: ReportInput,
): CreativeAssetRecord {
  const normalized = normalizeAssetValue(type, raw);
  return {
    ad_identity_kind: identity.kind,
    ad_identity: identity.key,
    meta_ad_id: identity.meta_ad_id,
    ad_name: identity.ad_name,
    asset_type: type,
    raw_value: raw,
    normalized_value: normalized,
    content_hash: assetContentHash(type, normalized),
    provenance,
    source_column: column,
    source_import_id: report.import_id,
    date_start: report.grain.period?.start ?? null,
    date_end: report.grain.period?.end ?? null,
  };
}

/** Configured assets from the Ad Summary's creative columns (one instance per distinct value per ad). */
export function extractConfiguredAssets(
  reports: readonly ReportInput[],
  instancesByName?: ReadonlyMap<string, readonly string[]>,
): CreativeAssetRecord[] {
  const out = new Map<string, CreativeAssetRecord>();
  for (const report of reports) {
    if (report.grain.report_class !== "ad_summary" && report.grain.report_class !== "time_series") continue;
    for (const row of report.rows) {
      if (!row.creativeMetadata) continue;
      const identity = resolveIdentity(row, report.grain, instancesByName);
      if (identity.kind === "unjoinable") continue;
      for (const [column, raw] of Object.entries(row.creativeMetadata)) {
        const type = CONFIGURED_ASSET_COLUMNS[column];
        if (!type || !raw.trim()) continue;
        const rec = record(identity, type, raw.trim(), "configured", column, report);
        const key = assetKey(rec);
        if (!out.has(key)) out.set(key, rec);
      }
    }
  }
  return [...out.values()];
}

/** Delivered assets from every pivot that carries an asset breakdown column. */
export function extractDeliveredAssets(
  reports: readonly ReportInput[],
  instancesByName?: ReadonlyMap<string, readonly string[]>,
): CreativeAssetRecord[] {
  const out = new Map<string, CreativeAssetRecord>();
  for (const report of reports) {
    if (report.grain.asset_columns.length === 0) continue;
    for (const row of report.rows) {
      if (!row.assetBreakdowns) continue;
      const identity = resolveIdentity(row, report.grain, instancesByName);
      if (identity.kind === "unjoinable") continue;
      for (const { column, asset_type } of report.grain.asset_columns) {
        const raw = row.assetBreakdowns[column];
        if (!raw) continue;
        const rec = record(identity, asset_type, raw, "delivered", column, report);
        const key = assetKey(rec);
        if (!out.has(key)) out.set(key, rec);
      }
    }
  }
  return [...out.values()];
}

/**
 * Groups asset instances by content identity — the cross-ad view. Every
 * instance keeps its own row; this only says which instances share content.
 */
export function groupByContent(assets: readonly CreativeAssetRecord[]): Map<string, CreativeAssetRecord[]> {
  const out = new Map<string, CreativeAssetRecord[]>();
  for (const a of assets) {
    const list = out.get(a.content_hash) ?? [];
    list.push(a);
    out.set(a.content_hash, list);
  }
  return out;
}
