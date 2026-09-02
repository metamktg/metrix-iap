// ─── Creative card assembly ───────────────────────────────────────────
// Builds CreativeCardData from seed structures. The MST local library
// carries the creative context (copy, visual system, variable stack);
// performance_by_cell carries the numbers; the ads registry carries the
// per-ad meta_ad_id / creative_asset_url once raw Meta exports are
// backfilled. Until then those fields are null and the card renders the
// labeled placeholder + pending Ads Manager state.

import type { CreativeCardData } from "@/components/creative/CreativeCard";
import type { AdRecord, CellPerformanceRow, MST, MSTLibraryCell, MSTMatrixCell } from "@/lib/data/seedTypes";

export function libraryCellById(mst: MST | null | undefined, cellId: string): MSTLibraryCell | null {
  return mst?.local_book2_library?.find((c) => c.cell_id === cellId) ?? null;
}

function tagsFromPerfRow(row: CellPerformanceRow): string[] {
  return [
    row.concept_variable,
    row.framework_variable,
    row.hook_variable,
    row.tone_variable,
    row.pain_proof_variable,
    row.proof_variable,
    row.cta_variable,
    row.funnel_stage_variable,
    row.awareness_variable,
  ].filter((c): c is string => Boolean(c));
}

function tagsFromLibraryCell(cell: MSTLibraryCell): string[] {
  return [
    cell.concept_variable,
    cell.framework_variable,
    cell.hook_variable,
    cell.tone_variable,
    cell.pain_proof_variable,
    cell.proof_variable,
    cell.cta_variable,
    cell.funnel_stage_variable,
    cell.awareness_variable,
  ].filter((c): c is string => Boolean(c));
}

/** Primary (highest-spend) performance row for a cell. */
export function primaryPerfRow(rows: CellPerformanceRow[], cellId: string): CellPerformanceRow | null {
  const matches = rows.filter((r) => r.cell_id === cellId);
  if (!matches.length) return null;
  return matches.reduce((best, r) =>
    r["Amount spent (USD)"] > best["Amount spent (USD)"] ? r : best
  );
}

/**
 * Primary ad registry row for a cell. Asset and deep link come from the
 * same ad so the "View in Ads Manager" link always points at the creative
 * being shown. Preference order: ad with both creative_asset_url and
 * meta_ad_id → ad with an asset → ad with a meta id → first match
 * (name-only row; the card stays honest with a placeholder asset and a
 * pending Ads Manager link) → null when no ads match at all.
 *
 * When no ads row carries the cell code directly (manual accounts get
 * their `ads.cell` only from a Meta export backfill), fall back to the
 * MST library cell's `mapped_ad_names` — the same authoritative mapping
 * the analysis produced — matched against `ads.ad_name`. Same preference
 * order applies within the fallback set.
 */
export function primaryAdForCell(
  ads: AdRecord[] | undefined,
  cellId: string,
  mappedAdNames?: string[]
): AdRecord | null {
  const all = ads ?? [];
  let matches = all.filter((a) => a.cell === cellId);
  if (!matches.length && mappedAdNames && mappedAdNames.length > 0) {
    const nameSet = new Set(mappedAdNames);
    matches = all.filter((a) => nameSet.has(a.ad_name));
  }
  if (!matches.length) return null;
  // asset_servable is the importer's answer to "is the file actually
  // there" — a row can carry a creative_asset_url whose asset was never
  // uploaded or has since gone, and the column defaults to false until the
  // importer confirms otherwise. Preferring a URL without checking it
  // picked those rows first and rendered them as a broken image, which
  // reads as "Metrix lost your creative" rather than "this one was never
  // uploaded".
  const servable = (a: AdRecord) => a.creative_asset_url && a.asset_servable !== false;
  return (
    matches.find((a) => servable(a) && a.meta_ad_id) ??
    matches.find((a) => servable(a)) ??
    // Only after every servable candidate is exhausted. A row whose asset
    // is not servable is still the best available identity for the cell —
    // it carries the ad name and possibly the Meta id — so it is returned,
    // and assembleCreativeCard drops its URL rather than the whole row.
    matches.find((a) => a.creative_asset_url && a.meta_ad_id) ??
    matches.find((a) => a.creative_asset_url) ??
    matches.find((a) => a.meta_ad_id) ??
    matches[0] ??
    null
  );
}

export interface CardAssemblyOpts {
  perfRows?: CellPerformanceRow[];
  mst?: MST | null;
  /** Ad registry for the account (seed `ads`); source of asset URLs and Meta ad ids. */
  ads?: AdRecord[];
  /**
   * Numeric Meta ad account id (seed `meta_ad_account_id`) — required for
   * Ads Manager deep links. This is NOT the internal account id.
   */
  metaAdAccountId?: string | null;
  fallbackTitle?: string;
}

export function cardFromCell(cellId: string, opts: CardAssemblyOpts): CreativeCardData {
  const lib = libraryCellById(opts.mst, cellId);
  return cardFromLibraryCell(lib, cellId, opts);
}

/**
 * Same field mapping as cardFromCell, but takes an already-resolved library
 * cell instead of re-looking one up by cell_id. Needed anywhere the caller
 * is iterating local_book2_library directly rather than a list of distinct
 * cell ids: a cell_id is not unique in that array (the same concept can
 * have multiple physical asset-format rows — Feed, Square, Story — sharing
 * one cell_id), so re-resolving by id via cardFromCell would silently
 * collapse every row for that cell onto whichever one libraryCellById's
 * first-match returns, discarding the rest.
 */
export function cardFromLibraryCell(
  lib: MSTLibraryCell | null,
  cellId: string,
  opts: CardAssemblyOpts
): CreativeCardData {
  const perf = opts.perfRows ? primaryPerfRow(opts.perfRows, cellId) : null;
  const ad = primaryAdForCell(opts.ads, cellId, lib?.mapped_ad_names);

  const tags = lib ? tagsFromLibraryCell(lib) : perf ? tagsFromPerfRow(perf) : [];

  return {
    conceptCode: cellId,
    title:
      lib?.book2_concept_name ??
      perf?.book2_concept_name ??
      opts.fallbackTitle ??
      cellId,
    // Copy: the scanned library's message when the creative was scanned,
    // else the ad's own components as the export carried them (headline,
    // primary text, CTA). copySource says which, so the dialog can name it.
    primaryText: lib?.primary_message ?? ad?.creative?.primary_text ?? null,
    secondaryText: lib?.secondary_message ?? ad?.creative?.headline ?? null,
    cta: lib?.cta ?? ad?.creative?.cta_type ?? null,
    copySource: lib?.primary_message || lib?.secondary_message || lib?.cta
      ? "library"
      : ad?.creative ? ad.creative.source : null,
    description: ad?.creative?.description ?? null,
    linkDestination: ad?.creative?.link_destination ?? null,
    mediaName: ad?.creative?.image_name ?? ad?.creative?.video_name ?? null,
    // Null when the file is not servable, so the card shows its honest
    // "no asset" state instead of an <img> that will fail to load.
    assetUrl: ad && ad.asset_servable !== false ? (ad.creative_asset_url ?? null) : null,
    assetFilename: ad?.asset_filename ?? null,
    aspectRatio: lib?.aspect_ratio ?? null,
    visualSystem: lib?.visual_system ?? null,
    assetFormat: (lib as { asset_format?: string } | null)?.asset_format ?? null,
    tags,
    stats: perf
      ? {
          spend: perf["Amount spent (USD)"],
          results: perf.Results,
          cpa: perf.CPA_result,
          ctrPct: perf.CTR_link_pct,
        }
      : undefined,
    iapRead: lib?.iap_read ?? perf?.iap_read ?? null,
    stage: lib?.stage ?? perf?.stage ?? null,
    qaMappingStatus: lib?.qa_mapping_status ?? null,
    mappingConfidence: lib?.mapping_confidence ?? null,
    metaAdId: ad?.meta_ad_id ?? null,
    adAccountId: opts.metaAdAccountId ?? null,
  };
}

export function cardFromMatrixCell(cell: MSTMatrixCell, opts: CardAssemblyOpts): CreativeCardData {
  const base = cardFromCell(cell.concept_code, {
    ...opts,
    fallbackTitle: cell.plain_text.headline ?? cell.concept_code,
  });
  return {
    ...base,
    title: cell.plain_text.headline ?? base.title,
    primaryText: cell.plain_text.primary ?? base.primaryText,
    tags: base.tags.length ? base.tags : Object.values(cell.variable_stack).filter(Boolean),
  };
}

/**
 * A card for an ad that has no cell code — the evidence layer joins ads by
 * Ad ID, and a raw-token variable's carriers are ads, not cells. Copy comes
 * from the ad's resolved creative (source-tagged); the asset only when the
 * importer confirmed it is servable.
 */
export function cardFromAd(ad: AdRecord, opts: { fallbackCode: string; metaAdAccountId?: string | null }): CreativeCardData {
  const c = ad.creative ?? null;
  return {
    conceptCode: ad.cell ?? opts.fallbackCode,
    title: ad.ad_name,
    primaryText: c?.primary_text ?? null,
    secondaryText: c?.headline ?? null,
    description: c?.description ?? null,
    cta: c?.cta_type ?? null,
    linkDestination: c?.link_destination ?? null,
    mediaName: c?.image_name ?? c?.video_name ?? null,
    copySource: c?.source ?? null,
    assetUrl: ad.creative_asset_url && ad.asset_servable !== false ? ad.creative_asset_url : null,
    assetFilename: ad.asset_filename ?? null,
    tags: [],
    metaAdId: ad.meta_ad_id ?? null,
    adAccountId: opts.metaAdAccountId ?? null,
  };
}
