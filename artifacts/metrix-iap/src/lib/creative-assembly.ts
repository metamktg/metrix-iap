// ─── Creative card assembly ───────────────────────────────────────────
// Builds CreativeCardData from seed structures. The MST local library
// carries the creative context (copy, visual system, variable stack);
// performance_by_cell carries the numbers. No meta ad ids exist in this
// import, so metaAdId stays null and the Ads Manager link renders pending.

import type { CreativeCardData } from "@/components/creative/CreativeCard";
import type { CellPerformanceRow, MST, MSTLibraryCell, MSTMatrixCell } from "@/lib/data/seedTypes";

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

export function cardFromCell(
  cellId: string,
  opts: {
    perfRows?: CellPerformanceRow[];
    mst?: MST | null;
    adAccountId?: string | null;
    fallbackTitle?: string;
  }
): CreativeCardData {
  const lib = libraryCellById(opts.mst, cellId);
  const perf = opts.perfRows ? primaryPerfRow(opts.perfRows, cellId) : null;

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
    assetUrl: null, // ads.creative_asset_url is null across this import
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
    metaAdId: null,
    adAccountId: opts.adAccountId ?? null,
  };
}

export function cardFromMatrixCell(
  cell: MSTMatrixCell,
  opts: { perfRows?: CellPerformanceRow[]; mst?: MST | null; adAccountId?: string | null }
): CreativeCardData {
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
