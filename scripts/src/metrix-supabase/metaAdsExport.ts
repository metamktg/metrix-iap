// ── Optional raw Meta export (ad-id / creative-asset backfill) ─────────
// When Meta exports with real ad ids arrive, drop a meta_ads_export.json
// shaped like:
//   {
//     "meta_ad_account_id": "1234567890",          // numeric, "act_" prefix ok
//     "ads": [
//       { "ad_name": "<exact ad_name from the package>",
//         "meta_ad_id": "23851234567890123",
//         "creative_asset_url": "https://..." }    // optional per ad
//     ]
//   }
// Location is per-account: scripts/data/metrix/meta_ads_export.json for
// Bookster, scripts/data/metrix/ecas/meta_ads_export.json for
// East Coast Art Studio. The importer backfills ads.meta_ad_id /
// ads.creative_asset_url (and ad_accounts.meta_ad_account_id) from it.
// Absent file → columns stay NULL.
//
// The pure parsing / validation rules live here so they can be unit
// tested without a live Supabase connection (see metaAdsExport.test.ts).

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const META_EXPORT_FILE = "meta_ads_export.json";

const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));

export interface MetaAdBackfill {
  metaAdId: string | null;
  creativeAssetUrl: string | null;
}

export interface MetaAdsExport {
  metaAdAccountId: string | null;
  byAdName: Map<string, MetaAdBackfill>;
}

// Pure parse of an already-decoded meta_ads_export.json document.
// Rules: "act_" prefix stripped from the account id; entries without an
// ad_name are skipped; entries carrying neither meta_ad_id nor
// creative_asset_url are skipped (nothing to backfill).
export function parseMetaAdsExportDoc(doc: any): MetaAdsExport {
  const byAdName = new Map<string, MetaAdBackfill>();
  const metaAdAccountId = str(doc?.meta_ad_account_id)?.replace(/^act_/, "") ?? null;
  for (const a of doc?.ads ?? []) {
    const adName = str(a.ad_name);
    if (!adName) continue;
    const metaAdId = str(a.meta_ad_id);
    const creativeAssetUrl = str(a.creative_asset_url);
    if (!metaAdId && !creativeAssetUrl) continue;
    byAdName.set(adName, { metaAdId, creativeAssetUrl });
  }
  return { metaAdAccountId, byAdName };
}

export function loadMetaAdsExport(dir: string, label: string): MetaAdsExport {
  const path = join(dir, META_EXPORT_FILE);
  if (!existsSync(path)) {
    console.log(`No ${META_EXPORT_FILE} for ${label} — meta_ad_id / creative_asset_url stay NULL where no other source exists (expected until raw Meta exports arrive).`);
    return { metaAdAccountId: null, byAdName: new Map() };
  }
  const doc = JSON.parse(readFileSync(path, "utf8").replace(/\bNaN\b/g, "null"));
  const parsed = parseMetaAdsExportDoc(doc);
  console.log(`Loaded ${META_EXPORT_FILE} (${label}): ${parsed.byAdName.size} ads with meta_ad_id/creative_asset_url` +
    (parsed.metaAdAccountId ? `, ad account ${parsed.metaAdAccountId}` : ", no meta_ad_account_id (deep links stay pending)"));
  return parsed;
}

// The bundle metadata carries the authoritative Meta account id — if the
// export names a different account, that's drift: abort rather than
// deep-link into the wrong Ads Manager account. Returns the error message
// (caller throws) or null when consistent / either id is absent.
export function exportAccountMismatchError(
  exportAccountId: string | null,
  bundleAccountId: string | null,
  label: string,
): string | null {
  if (exportAccountId && bundleAccountId && exportAccountId !== bundleAccountId) {
    return (
      `${label} ${META_EXPORT_FILE} names Meta ad account ${exportAccountId} but the ` +
      `analysis package is for account ${bundleAccountId}. Refusing to import mismatched export.`
    );
  }
  return null;
}

export interface ResolvedMetaAdId {
  metaAdId: string | null;
  source: "export" | "csv_unique" | null;
  // Set when the export supplied an id that the CSV never observed for
  // this ad name — the id is ignored (drift), caller should warn.
  ignoredExportId: string | null;
}

// LittleData meta_ad_id resolution: the per-account export can pin the id
// (and disambiguate names reused across campaigns), but only if it matches
// an Ad ID the CSV actually observed for that name — otherwise it's drift
// and we fall back to the CSV rule (unique id only, else NULL).
export function resolveLdMetaAdId(
  csvAdIds: ReadonlySet<string>,
  exportMetaAdId: string | null | undefined,
): ResolvedMetaAdId {
  const csvUnique = csvAdIds.size === 1 ? [...csvAdIds][0] : null;
  if (exportMetaAdId) {
    if (csvAdIds.has(exportMetaAdId)) {
      return { metaAdId: exportMetaAdId, source: "export", ignoredExportId: null };
    }
    return {
      metaAdId: csvUnique,
      source: csvUnique ? "csv_unique" : null,
      ignoredExportId: exportMetaAdId,
    };
  }
  return { metaAdId: csvUnique, source: csvUnique ? "csv_unique" : null, ignoredExportId: null };
}

// Export ad names with no matching CSV ad — logged and ignored by the
// importer (never fabricate rows for ads the CSV didn't observe).
export function unmatchedExportAdNames(
  exportAdNames: Iterable<string>,
  csvHasAd: (name: string) => boolean,
): string[] {
  return [...exportAdNames].filter((n) => !csvHasAd(n));
}
