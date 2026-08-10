// ─── Creative card assembly ───────────────────────────────────────────
// Builds CreativeCardData from seed structures. The MST local library
// carries the creative context (copy, visual system, variable stack);
// performance_by_cell carries the numbers; the ads registry carries the
// per-ad meta_ad_id / creative_asset_url once raw Meta exports are
// backfilled. Until then those fields are null and the card renders the
// labeled placeholder + pending Ads Manager state.

import type { CreativeCardData, CreativeCardStats } from "@/components/creative/CreativeCard";
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
 * Every real performance row for a cell — `performance_by_cell` carries one
 * row per Meta "Result type"/campaign-flight sharing a concept_code (e.g. a
 * creative flighted first toward registrations, then trials, then checkout
 * as separate campaigns), not one row per cell. Use this — not
 * `primaryPerfRow` — anywhere real spend/results must not be discarded.
 */
export function perfRowsForCell(rows: CellPerformanceRow[] | undefined, cellId: string): CellPerformanceRow[] {
  return (rows ?? []).filter((r) => r.cell_id === cellId);
}

/**
 * Honest aggregate stats across every real row for a cell. Spend and results
 * are summed — genuine totals across real campaign flights of the same
 * creative, not a fabricated blend — so a concept with multiple Result-type
 * rows shows its true total instead of silently keeping only the
 * highest-spend row and discarding the rest. CTR comes from the
 * highest-spend row since it isn't meaningfully additive across rows.
 * `labelForResultType` lets callers substitute a human-readable event label
 * for the single-row case; the multi-row case always says "N events" so the
 * blend is never presented as one homogeneous result type.
 */
export function aggregatePerfStats(
  rows: CellPerformanceRow[],
  labelForResultType: (resultType: string) => string = (resultType) => resultType
): CreativeCardStats | undefined {
  if (!rows.length) return undefined;
  const spend = rows.reduce((s, r) => s + r["Amount spent (USD)"], 0);
  const results = rows.reduce((s, r) => s + r.Results, 0);
  const primary = rows.reduce((best, r) =>
    r["Amount spent (USD)"] > best["Amount spent (USD)"] ? r : best
  );
  return {
    spend,
    results,
    cpa: results > 0 ? spend / results : null,
    ctrPct: primary.CTR_link_pct,
    resultLabel: rows.length === 1 ? labelForResultType(primary["Result type"]) : `${rows.length} events`,
  };
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
  return (
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
  const perfRows = opts.perfRows ? perfRowsForCell(opts.perfRows, cellId) : [];
  // Highest-spend row only for text fields (book2_concept_name/iap_read/stage
  // are per-cell, not per-row, so any real row's copy is representative) —
  // never for the numbers, which must reflect every real row (see stats below).
  const perf = perfRows.length
    ? perfRows.reduce((best, r) => (r["Amount spent (USD)"] > best["Amount spent (USD)"] ? r : best))
    : null;
  const ad = primaryAdForCell(opts.ads, cellId, lib?.mapped_ad_names);

  const tags = lib ? tagsFromLibraryCell(lib) : perf ? tagsFromPerfRow(perf) : [];

  return {
    conceptCode: cellId,
    title:
      lib?.book2_concept_name ??
      perf?.book2_concept_name ??
      opts.fallbackTitle ??
      cellId,
    primaryText: lib?.primary_message ?? null,
    secondaryText: lib?.secondary_message ?? null,
    cta: lib?.cta ?? null,
    assetUrl: ad?.creative_asset_url ?? null,
    assetFilename: ad?.asset_filename ?? null,
    aspectRatio: lib?.aspect_ratio ?? null,
    visualSystem: lib?.visual_system ?? null,
    assetFormat: (lib as { asset_format?: string } | null)?.asset_format ?? null,
    tags,
    stats: aggregatePerfStats(perfRows),
    perfRows,
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
