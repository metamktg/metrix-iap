import { getSupabase } from "./supabase";
import {
  findCreativeAssetNameMatch,
  inferCreativeMediaType,
  normalizeCreativeAssetName,
  type CreativeMediaType,
} from "./creativeAssetNameMapping";

type ImportRow = {
  id: string;
  filename: string;
  content_type: string | null;
};

type AssetCandidate = {
  mediaType: CreativeMediaType;
  rawName: string;
};

function candidateKey(candidate: AssetCandidate): string {
  return `${candidate.mediaType}\u0001${normalizeCreativeAssetName(candidate.rawName)}`;
}

async function loadMappingInputs(accountId: string) {
  const supabase = getSupabase();
  const [importsResult, adsResult, instancesResult, mappingsResult] = await Promise.all([
    supabase
      .from("manual_imports")
      .select("id, filename, content_type")
      .eq("account_id", accountId)
      .eq("kind", "creative_asset"),
    supabase
      .from("ads")
      .select("id, ad_name, image_name, video_name")
      .eq("account_id", accountId),
    supabase
      .from("ad_instances")
      .select("id, ad_name, image_name, video_name")
      .eq("account_id", accountId),
    supabase
      .from("creative_asset_mappings")
      .select("id, media_type, meta_asset_name, normalized_meta_asset_name, manual_import_id")
      .eq("account_id", accountId),
  ]);
  if (importsResult.error) throw new Error(importsResult.error.message);
  if (adsResult.error) throw new Error(adsResult.error.message);
  if (instancesResult.error) throw new Error(instancesResult.error.message);
  if (mappingsResult.error) throw new Error(mappingsResult.error.message);
  return {
    imports: (importsResult.data ?? []) as ImportRow[],
    ads: [...(adsResult.data ?? []), ...(instancesResult.data ?? [])],
    mappings: mappingsResult.data ?? [],
  };
}

function collectCandidates(ads: Record<string, unknown>[]): AssetCandidate[] {
  const distinct = new Map<string, AssetCandidate>();
  for (const ad of ads) {
    const imageName = String(ad["image_name"] ?? "").trim();
    const videoName = String(ad["video_name"] ?? "").trim();
    for (const candidate of [
      ...(imageName ? [{ mediaType: "image" as const, rawName: imageName }] : []),
      ...(videoName ? [{ mediaType: "video" as const, rawName: videoName }] : []),
    ]) {
      const key = candidateKey(candidate);
      if (!key.endsWith("\u0001") && !distinct.has(key)) distinct.set(key, candidate);
    }
  }
  return [...distinct.values()];
}

async function applyMapping(
  accountId: string,
  mapping: Record<string, unknown>,
  importRow: ImportRow,
  observedCandidates: AssetCandidate[],
): Promise<string[]> {
  const supabase = getSupabase();
  const mediaType = String(mapping["media_type"]) as CreativeMediaType;
  const column = mediaType === "image" ? "image_name" : "video_name";
  const rawName = String(mapping["meta_asset_name"]);
  const normalizedName = String(mapping["normalized_meta_asset_name"]);
  const rawNames = observedCandidates
    .filter(
      (candidate) =>
        candidate.mediaType === mediaType &&
        normalizeCreativeAssetName(candidate.rawName) === normalizedName,
    )
    .map((candidate) => candidate.rawName);
  if (!rawNames.includes(rawName)) rawNames.push(rawName);
  const mappingId = String(mapping["id"]);
  const fileUrl = `/api/metrix/accounts/${accountId}/manual-imports/${importRow.id}/file`;
  const adsUpdate = await supabase
    .from("ads")
    .update({
      creative_asset_mapping_id: mappingId,
      creative_asset_url: fileUrl,
      asset_filename: importRow.filename,
      asset_servable: true,
    })
    .eq("account_id", accountId)
    .in(column, rawNames)
    .select("ad_name");
  if (adsUpdate.error) throw new Error(adsUpdate.error.message);

  const [instancesUpdate, performanceUpdate] = await Promise.all([
    supabase
      .from("ad_instances")
      .update({ creative_asset_mapping_id: mappingId })
      .eq("account_id", accountId)
      .in(column, rawNames),
    supabase
      .from("ad_performance")
      .update({ creative_asset_mapping_id: mappingId })
      .eq("account_id", accountId)
      .in(column, rawNames),
  ]);
  if (instancesUpdate.error) throw new Error(instancesUpdate.error.message);
  if (performanceUpdate.error) throw new Error(performanceUpdate.error.message);
  return (adsUpdate.data ?? []).map((row) => String(row["ad_name"]));
}

/**
 * Resolves only aliases that do not already have a persisted mapping. Existing
 * mappings are applied directly, so routine imports never rescore or silently
 * reconsider a confirmed first match.
 */
export async function syncStickyCreativeAssetMappings(accountId: string): Promise<{
  linkedAdNames: string[];
  mappedAliases: number;
}> {
  const supabase = getSupabase();
  const input = await loadMappingInputs(accountId);
  const candidates = collectCandidates(input.ads);
  const mappedKeys = new Set(
    input.mappings.map(
      (mapping) => `${mapping["media_type"]}\u0001${String(mapping["normalized_meta_asset_name"])}`,
    ),
  );

  for (const candidate of candidates) {
    if (mappedKeys.has(candidateKey(candidate))) continue;
    const ranked = input.imports
      .map((imp) => {
        const mediaType = inferCreativeMediaType(imp.content_type, imp.filename);
        if (mediaType !== candidate.mediaType) return null;
        const match = findCreativeAssetNameMatch(imp.filename, mediaType, [candidate]);
        return match ? { imp, match } : null;
      })
      .filter((value): value is NonNullable<typeof value> => value !== null)
      .sort((a, b) => b.match.score - a.match.score);
    const best = ranked[0];
    if (!best || (ranked[1] && best.match.score - ranked[1].match.score < 0.08)) {
      continue;
    }
    const inserted = await supabase
      .from("creative_asset_mappings")
      .upsert(
        {
          account_id: accountId,
          media_type: candidate.mediaType,
          meta_asset_name: candidate.rawName,
          normalized_meta_asset_name: normalizeCreativeAssetName(candidate.rawName),
          manual_import_id: best.imp.id,
          match_method: best.match.method,
          confidence: Number(best.match.score.toFixed(4)),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "account_id,media_type,normalized_meta_asset_name",
          ignoreDuplicates: true,
        },
      );
    if (inserted.error) throw new Error(inserted.error.message);
    mappedKeys.add(candidateKey(candidate));
  }

  const refreshed = await loadMappingInputs(accountId);
  const refreshedCandidates = collectCandidates(refreshed.ads);
  const importsById = new Map(refreshed.imports.map((row) => [String(row.id), row]));
  const linked = new Set<string>();
  for (const mapping of refreshed.mappings) {
    const importRow = importsById.get(String(mapping["manual_import_id"]));
    if (!importRow) continue;
    for (const adName of await applyMapping(accountId, mapping, importRow, refreshedCandidates)) linked.add(adName);
  }
  return { linkedAdNames: [...linked], mappedAliases: refreshed.mappings.length };
}

/**
 * Existing ad-name correction API doubles as the audited correction path for
 * asset aliases carried by those ads. Only selected ads' populated Meta names
 * are changed; unrelated aliases and accounts remain untouched.
 */
export async function correctCreativeAssetMappingsForAds(args: {
  accountId: string;
  importId: string;
  adNames: string[];
  metaAdIds?: string[];
  correctedBy: string;
}): Promise<void> {
  if (args.adNames.length === 0 && !args.metaAdIds?.length) return;
  const supabase = getSupabase();
  const sourceRows = args.metaAdIds?.length
    ? await supabase
        .from("ad_instances")
        .select("image_name, video_name")
        .eq("account_id", args.accountId)
        .in("meta_ad_id", args.metaAdIds)
    : await supabase
        .from("ads")
        .select("image_name, video_name")
        .eq("account_id", args.accountId)
        .in("ad_name", args.adNames);
  if (sourceRows.error) throw new Error(sourceRows.error.message);
  const now = new Date().toISOString();
  for (const candidate of collectCandidates(sourceRows.data ?? [])) {
    const result = await supabase
      .from("creative_asset_mappings")
      .upsert(
        {
          account_id: args.accountId,
          media_type: candidate.mediaType,
          meta_asset_name: candidate.rawName,
          normalized_meta_asset_name: normalizeCreativeAssetName(candidate.rawName),
          manual_import_id: args.importId,
          match_method: "manual",
          confidence: 1,
          corrected_at: now,
          corrected_by: args.correctedBy,
          updated_at: now,
        },
        { onConflict: "account_id,media_type,normalized_meta_asset_name", ignoreDuplicates: false },
      );
    if (result.error) throw new Error(result.error.message);
  }
  await syncStickyCreativeAssetMappings(args.accountId);
}

export async function clearStickyCreativeAssetLinks(
  accountId: string,
  importId: string,
): Promise<void> {
  const supabase = getSupabase();
  const mappings = await supabase
    .from("creative_asset_mappings")
    .select("id")
    .eq("account_id", accountId)
    .eq("manual_import_id", importId);
  if (mappings.error) throw new Error(mappings.error.message);
  const mappingIds = (mappings.data ?? []).map((row) => String(row["id"]));
  if (mappingIds.length === 0) return;
  const fileUrl = `/api/metrix/accounts/${accountId}/manual-imports/${importId}/file`;
  const cleared = await supabase
    .from("ads")
    .update({
      creative_asset_mapping_id: null,
      creative_asset_url: null,
      asset_filename: null,
      asset_servable: false,
    })
    .eq("account_id", accountId)
    .in("creative_asset_mapping_id", mappingIds)
    .eq("creative_asset_url", fileUrl);
  if (cleared.error) throw new Error(cleared.error.message);
}