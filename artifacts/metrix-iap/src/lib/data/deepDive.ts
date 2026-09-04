// ─── Deep-dive module builders (pure, unit-testable) ──────────────────
// The deep-dive panel (Nocturne "Metrix v1" design handoff) is a right
// slide-over that stacks modules: click a segment anywhere → its full
// metric profile → chain into any other segment, with a breadcrumb trail.
//
// This file is the DATA side only: it turns one (dimension, segment) pair
// into a renderable module by reusing the exact same breakdown math the
// KPI drill-down modal uses (kpiBreakdown.ts). Nothing here fetches —
// modules are built from the already-loaded analysis bundle at push time.
//
// Honesty rules carry over verbatim from kpiBreakdown.ts: metrics a
// dimension can't support surface the restriction reason, unavailable
// values render "n/a", never zero, and cross-dimension filtering is NOT
// offered because the import's aggregates are pre-bucketed per dimension
// (a placement-within-concept number does not exist in this data).

import type { ActiveHypothesis, AnalysisData, CellPerformanceRow, ICPProfile, MessagePillar, MST, MSTMatrixCell } from "./seedTypes";
import type { MetricDef } from "./metricsCatalog";
import type { TrayItemInput } from "./trayStore";
import {
  buildAccountBreakdown,
  dimensionMetricRestriction,
  listBreakdownDimensions,
  sortBreakdownRows,
  lowerIsBetter,
  type BreakdownRow,
  type BreakdownDimension,
} from "./kpiBreakdown";
import { cardFromCell, cardFromMatrixCell } from "../creative-assembly";
import type { CardAssemblyOpts } from "../creative-assembly";
import { fmtUSD, fmtNum, eventLabel } from "@/pages/metrix/shared";
import { pillarTier, pillarHasDetails } from "@/pages/metrix/strategy/strategyShared";

// ─── Module shape ─────────────────────────────────────────────────────

export interface DeepDiveStat {
  metricId: string;
  label: string;
  /** Formatted display value ("$1,510.47", "1.7%", "n/a"). */
  value: string;
  /** Honest reason when the value is n/a (tracking basis, missing column). */
  note?: string;
}

/** Ranked row with an optional drill closure that builds the next module. */
export interface DeepDiveRankedRow extends BreakdownRow {
  /** Present when this row can chain into its own deep-dive module. */
  drill?: () => DeepDiveModule;
  /** Marks the row the current module is about (rendered highlighted, not drillable). */
  current?: boolean;
}

/** One step of a real, backed conversion path (never a fabricated zero step). */
export interface DeepDiveFunnelStep {
  label: string;
  value: number;
  formatted: string;
  /** % of the immediately preceding step; null for the first step or when the prior step's total was 0. */
  pctOfPrior: number | null;
}

/** Actions rendered by the panel chrome, not hand-rolled per caller — the
 *  panel imports the one real component for each kind (AddToTrayButton,
 *  AdsManagerButton, CrossLink, SegmentDrilldownButton). */
export type DeepDiveAction =
  | { kind: "tray"; id: string; scopeId: string; item: TrayItemInput }
  | { kind: "ads_manager"; id: string; metaAdId: string | null; adAccountId: string | null }
  | { kind: "link"; id: string; label: string; href: string }
  | { kind: "callback"; id: string; label: string; onClick: () => void };

/** Flattened hypothesis for the deep-dive panel's hypotheses block. */
export interface DeepDiveHypothesisItem {
  id: string;
  label: string;
  status: string;
  isolated?: string | null;
}

export type DeepDiveBlock =
  | { kind: "stats"; title: string; stats: DeepDiveStat[] }
  | { kind: "ranked"; title: string; metricLabel: string; rows: DeepDiveRankedRow[] }
  | { kind: "variables"; title: string; codes: string[] }
  | { kind: "funnel"; title: string; steps: DeepDiveFunnelStep[] }
  | { kind: "actions"; actions: DeepDiveAction[] }
  /** Full pillar detail sections (funnel/execution/placement/scaling/target
   *  ICPs) — renders via the existing PillarDetailSections component, not a
   *  re-implementation of it. */
  | { kind: "pillar_details"; pillar: MessagePillar; profiles?: ICPProfile[] }
  | { kind: "hypotheses"; title: string; items: DeepDiveHypothesisItem[] }
  /** Optional heading above the prose — omitted renders a bare paragraph. */
  | { kind: "note"; title?: string; text: string };

export interface DeepDiveModule {
  /** Stable id for breadcrumb keys (dimension + segment). */
  id: string;
  /** Mono uppercase eyebrow, e.g. the dimension label ("Concept"). */
  kicker: string;
  /** The segment's own human-readable name — never a code the user didn't write. */
  title: string;
  subtitle?: string;
  blocks: DeepDiveBlock[];
}

// ─── Segment profile builder ──────────────────────────────────────────

const RANK_METRIC_ID = "spend";

export interface SegmentModuleInput {
  analysis: AnalysisData;
  dimension: BreakdownDimension;
  segmentKey: string;
  catalog: MetricDef[];
  /** Cell rows pre-scoped by the active window/run selection (cell/concept dims only). */
  scopedCellRows?: CellPerformanceRow[];
  windowLabel?: string;
}

/**
 * Full metric profile for one segment of one dimension, plus a ranked
 * "peers" list over the same dimension so the user can chain sideways.
 * Every value comes from buildAccountBreakdown — the same summed-
 * numerator ÷ summed-denominator math as the KPI drill-down modal.
 */
export function buildSegmentModule(input: SegmentModuleInput): DeepDiveModule {
  const { analysis, dimension, segmentKey, catalog, scopedCellRows, windowLabel } = input;

  // Per-metric rows for this dimension, computed once per metric.
  const stats: DeepDiveStat[] = [];
  let segmentLabel = segmentKey;
  let restrictedCount = 0;
  for (const metric of catalog) {
    const restriction = dimensionMetricRestriction(dimension.id, metric.id);
    if (restriction) {
      restrictedCount += 1;
      stats.push({ metricId: metric.id, label: metric.label, value: "n/a", note: restriction });
      continue;
    }
    const rows = buildAccountBreakdown(analysis, dimension.id, metric.id, scopedCellRows);
    const row = rows.find((r) => r.key === segmentKey);
    if (row) segmentLabel = row.label;
    stats.push({
      metricId: metric.id,
      label: metric.label,
      value: row?.formatted ?? "n/a",
      ...(row?.value == null ? { note: row?.note ?? "No rows back this metric for this segment in the current import." } : {}),
    });
  }

  // Peers: the whole dimension ranked by spend, current segment marked,
  // every other segment drillable into its own module (the chain).
  const rankRestriction = dimensionMetricRestriction(dimension.id, RANK_METRIC_ID);
  const peerMetricId = rankRestriction ? "link_clicks" : RANK_METRIC_ID;
  const peerRows = sortBreakdownRows(
    buildAccountBreakdown(analysis, dimension.id, peerMetricId, scopedCellRows),
    lowerIsBetter(peerMetricId) ? "asc" : "desc",
  );
  const ranked: DeepDiveRankedRow[] = peerRows.map((r) =>
    r.key === segmentKey
      ? { ...r, current: true }
      : {
          ...r,
          drill: () => buildSegmentModule({ ...input, segmentKey: r.key }),
        },
  );

  const blocks: DeepDiveBlock[] = [
    { kind: "stats", title: "Metric profile", stats },
    {
      kind: "ranked",
      title: `All ${dimension.label.toLowerCase()} segments`,
      metricLabel: peerMetricId === "spend" ? "Spend" : "Link clicks",
      rows: ranked,
    },
  ];
  if (restrictedCount > 0) {
    blocks.push({
      kind: "note",
      text:
        `${restrictedCount} metric(s) show n/a because this dimension's tracking basis or source export ` +
        `can't honestly support them · values are never fabricated as zero.`,
    });
  }

  return {
    id: `${dimension.id}\u0001${segmentKey}`,
    kicker: dimension.label,
    title: segmentLabel,
    subtitle: windowLabel ? `Data window · ${windowLabel}` : undefined,
    blocks,
  };
}

/** Resolve a dimension descriptor by id from the account's live dimension list. */
export function findDimension(analysis: AnalysisData | null | undefined, dimensionId: string): BreakdownDimension | null {
  return listBreakdownDimensions(analysis).find((d) => d.id === dimensionId) ?? null;
}

// ─── MST cell module builder ───────────────────────────────────────────
// Replaces the old TilePerformanceModal pop-up: every MST tile (Sprints
// matrix, Crossmap Results) pushes this module instead of opening a
// separate dialog. Same honesty rules as the modal it replaces — cells
// that never ran get an explicit "not run" note instead of fabricated
// zeros, and the ecommerce-only downstream funnel (add-to-cart/checkout/
// purchase) only appears when the source export actually carries it for
// this cell; otherwise the funnel stops at the last real step with a
// note, never a guessed one. ROAS is never computed — no purchase-value
// field exists anywhere in the seed schema, so it always renders n/a
// with an honest reason rather than being silently omitted.

export interface CellDeepDiveInput extends CardAssemblyOpts {
  cellId: string;
  /** Planned matrix cell, when the tile came from the 4×4 matrix. */
  matrixCell?: MSTMatrixCell | null;
  analysis: AnalysisData | null;
  mst: MST | null;
  /** Ad account id used as the task-tray scope; omitted hides "Add to Tray". */
  trayScopeId?: string | null;
  /** Wires the "Avatar × placement" segment drill-down; omitted hides the action. */
  onOpenSegments?: () => void;
}

const DOWNSTREAM_FUNNEL_FIELDS: Array<{ key: "adds_to_cart" | "checkouts_initiated" | "purchases"; label: string }> = [
  { key: "adds_to_cart", label: "Adds to cart" },
  { key: "checkouts_initiated", label: "Checkouts initiated" },
  { key: "purchases", label: "Purchases" },
];

export function buildCellDeepDiveModule(input: CellDeepDiveInput): DeepDiveModule {
  const { cellId, matrixCell, analysis, mst, trayScopeId, onOpenSegments, ...cardOpts } = input;
  const perf = (analysis?.performance_by_cell ?? []).filter((r) => r.cell_id === cellId);
  const ran = perf.length > 0;

  const card = matrixCell
    ? cardFromMatrixCell(matrixCell, { ...cardOpts, perfRows: analysis?.performance_by_cell, mst })
    : cardFromCell(cellId, { ...cardOpts, perfRows: analysis?.performance_by_cell, mst });

  const blocks: DeepDiveBlock[] = [];

  if (!ran) {
    blocks.push({
      kind: "note",
      text:
        `This tile never ran. No performance rows exist for ${cellId} in this import. It's a planned matrix ` +
        `cell without observed spend; numbers appear here once it runs.`,
    });
  } else {
    const totals = {
      spend: perf.reduce((n, r) => n + r["Amount spent (USD)"], 0),
      results: perf.reduce((n, r) => n + r.Results, 0),
      impressions: perf.reduce((n, r) => n + r.Impressions, 0),
      linkClicks: perf.reduce((n, r) => n + r["Link clicks"], 0),
      reach: perf.reduce((n, r) => Math.max(n, r.Reach), 0),
    };

    blocks.push({
      kind: "stats",
      title: "Performance",
      stats: [
        { metricId: "spend", label: "Spend", value: fmtUSD(totals.spend, 0) },
        {
          metricId: "results",
          label: "Results",
          value: fmtNum(totals.results),
          note: perf.length > 1
            ? `${perf.length} result types`
            : perf[0] ? eventLabel(perf[0]["Result type"]) : undefined,
        },
        {
          metricId: "cpa",
          label: "Cost / result",
          value: totals.results > 0 ? fmtUSD(totals.spend / totals.results) : "n/a",
          ...(totals.results > 0 ? {} : { note: "No completed results to divide spend by." }),
        },
        { metricId: "reach", label: "Reach", value: fmtNum(totals.reach) },
        {
          metricId: "roas",
          label: "ROAS",
          value: "n/a",
          note: "No purchase-value field exists anywhere in this account's data. ROAS is never fabricated as a number.",
        },
        {
          metricId: "mapping_confidence",
          label: "Mapping confidence",
          value: card.mappingConfidence ?? "n/a",
          ...(card.mappingConfidence ? {} : { note: "No QA mapping confidence recorded for this cell's creative match." }),
        },
      ],
    });

    // Step-conversion path: impressions → link clicks are always real once
    // the cell ran; downstream ecommerce steps only append while the
    // source export actually carries the field for at least one row —
    // the moment one is missing, later steps stop rather than guess.
    const steps: DeepDiveFunnelStep[] = [
      { label: "Impressions", value: totals.impressions, formatted: fmtNum(totals.impressions), pctOfPrior: null },
      {
        label: "Link clicks",
        value: totals.linkClicks,
        formatted: fmtNum(totals.linkClicks),
        pctOfPrior: totals.impressions > 0 ? (totals.linkClicks / totals.impressions) * 100 : null,
      },
    ];
    let priorValue = totals.linkClicks;
    let omittedNote: string | null = null;
    for (const { key, label } of DOWNSTREAM_FUNNEL_FIELDS) {
      const backed = perf.filter((r) => r[key] != null);
      if (backed.length === 0) {
        omittedNote =
          "Downstream funnel steps (add-to-cart / checkout / purchase) aren't in this import for this cell, " +
          "shown only when the source export actually carries them, never fabricated as zero.";
        break;
      }
      const value = backed.reduce((n, r) => n + (r[key] ?? 0), 0);
      steps.push({
        label,
        value,
        formatted: fmtNum(value),
        pctOfPrior: priorValue > 0 ? (value / priorValue) * 100 : null,
      });
      priorValue = value;
    }
    blocks.push({ kind: "funnel", title: "Conversion path", steps });
    if (omittedNote) blocks.push({ kind: "note", text: omittedNote });
  }

  // Variable stack — the row's own HK_/TN_/FW_/CN_/PR_/CTA_/ST_/AW_/HP_
  // codes, reusing the same extraction the hypothesis chips use rather
  // than hand-rolling a second parser.
  if (card.tags.length > 0) {
    blocks.push({ kind: "variables", title: "Variable stack", codes: card.tags });
  }

  if (card.iapRead) blocks.push({ kind: "note", text: card.iapRead });
  if (matrixCell?.plain_text?.primary) blocks.push({ kind: "note", text: matrixCell.plain_text.primary });

  // Actions — same real affordances the tile/old modal supported, plus
  // Add to Tray (the app's standard actionable-item affordance).
  const actions: DeepDiveAction[] = [
    { kind: "ads_manager", id: "ads-manager", metaAdId: card.metaAdId ?? null, adAccountId: card.adAccountId ?? null },
  ];
  if (trayScopeId) {
    actions.push({
      kind: "tray",
      id: "tray",
      scopeId: trayScopeId,
      item: { id: `mst-cell:${cellId}`, kind: "signal", title: card.title, sub: cellId, href: "/app/analysis/library?focus=" + cellId },
    });
  }
  if (ran && onOpenSegments) {
    actions.push({ kind: "callback", id: "segments", label: "Avatar × placement", onClick: onOpenSegments });
  }
  actions.push({ kind: "link", id: "library", label: "Open in IAP Library", href: `/app/analysis/library?focus=${cellId}` });
  blocks.push({ kind: "actions", actions });

  const diagNote =
    matrixCell?.diagonal_role === "diag_down" ? " · Primary diagonal ↘"
    : matrixCell?.diagonal_role === "diag_up" ? " · Counter diagonal ↗"
    : "";

  return {
    id: `cell:${cellId}`,
    kicker: `MST tile · ${cellId}${diagNote}`,
    title: card.title,
    subtitle: matrixCell ? `${matrixCell.column_label} × ${matrixCell.row_shared_variable}` : undefined,
    blocks,
  };
}

// ─── Concept group module builder ──────────────────────────────────────
// Concept Map groups performance_by_cell rows by book2_concept_name — a
// concept spans multiple creative cells, so it doesn't fit the single-cell
// shape buildCellDeepDiveModule expects. This reuses the same block
// vocabulary (stats/ranked/variables/note/actions) instead of a bespoke
// panel: the ranked block lists the concept's own cells by spend, each
// chaining into buildCellDeepDiveModule so the breadcrumb trail keeps
// working exactly like it does from the Sprints matrix and Crossmap.

function cellVariableCodes(row: CellPerformanceRow): string[] {
  return [
    row.hook_variable, row.tone_variable, row.framework_variable, row.concept_variable,
    row.pain_proof_variable, row.proof_variable, row.cta_variable,
    row.funnel_stage_variable, row.awareness_variable,
  ].filter((c): c is string => Boolean(c));
}

export interface ConceptGroupDeepDiveInput extends CardAssemblyOpts {
  name: string;
  cellIds: string[];
  /** Cell rows for this concept, already scoped to the active run selection. */
  cellRows: CellPerformanceRow[];
  spend: number;
  results: number;
  pillars: MessagePillar[];
  analysis: AnalysisData | null;
  mst: MST | null;
  /** Opens the avatar × placement segment grid for every cell in the group. */
  onOpenGroupSegments?: () => void;
  /** Opens the segment grid scoped to one cell, wired into that cell's own drill. */
  onOpenCellSegments?: (cellId: string) => void;
}

export function buildConceptGroupDeepDiveModule(input: ConceptGroupDeepDiveInput): DeepDiveModule {
  const {
    name, cellIds, cellRows, spend, results, pillars, analysis, mst,
    onOpenGroupSegments, onOpenCellSegments, ...cardOpts
  } = input;

  const blocks: DeepDiveBlock[] = [
    {
      kind: "stats",
      title: "Performance",
      stats: [
        { metricId: "spend", label: "Spend", value: fmtUSD(spend, 0) },
        { metricId: "results", label: "Results", value: fmtNum(results) },
        {
          metricId: "cpa",
          label: "Cost / result",
          value: results > 0 ? fmtUSD(spend / results) : "n/a",
          ...(results > 0 ? {} : { note: "No completed results to divide spend by." }),
        },
        { metricId: "cells", label: "Creative cells", value: String(cellIds.length) },
      ],
    },
  ];

  // Per-cell spend/results within this concept — ranked, each drillable
  // into its own cell module (the same builder MST tiles use).
  const perCell = new Map<string, { spend: number; results: number }>();
  for (const r of cellRows) {
    const agg = perCell.get(r.cell_id) ?? { spend: 0, results: 0 };
    agg.spend += r["Amount spent (USD)"];
    agg.results += r.Results;
    perCell.set(r.cell_id, agg);
  }
  const rankedRows: DeepDiveRankedRow[] = cellIds
    .map((cellId) => {
      const agg = perCell.get(cellId) ?? null;
      return {
        key: cellId,
        label: cellId,
        value: agg?.spend ?? null,
        formatted: agg ? fmtUSD(agg.spend, 0) : "n/a",
        spend: agg?.spend ?? null,
        results: agg?.results ?? null,
        note: agg ? undefined : "No performance rows for this cell in the current scope.",
        drill: () =>
          buildCellDeepDiveModule({
            cellId,
            analysis,
            mst,
            ...cardOpts,
            onOpenSegments: onOpenCellSegments ? () => onOpenCellSegments(cellId) : undefined,
          }),
      };
    })
    .sort((a, b) => (b.value ?? -1) - (a.value ?? -1));
  blocks.push({ kind: "ranked", title: "Cells in this concept", metricLabel: "Spend", rows: rankedRows });

  const codes = Array.from(new Set(cellRows.flatMap(cellVariableCodes)));
  if (codes.length > 0) blocks.push({ kind: "variables", title: "Variable stack", codes });

  if (pillars.length > 0) {
    for (const p of pillars) {
      const text = [p.plain_descriptor ? `"${p.plain_descriptor}"` : null, p.why_it_matters].filter(Boolean).join("–");
      if (text) blocks.push({ kind: "note", title: `Pillar · ${p.label}`, text });
    }
  } else {
    blocks.push({ kind: "note", text: "No strategy pillar references this concept's cells yet." });
  }

  const actions: DeepDiveAction[] = [];
  if (onOpenGroupSegments) actions.push({ kind: "callback", id: "segments", label: "Avatar × placement", onClick: onOpenGroupSegments });
  if (cellIds[0]) actions.push({ kind: "link", id: "library", label: "Open in IAP Library", href: `/app/analysis/library?focus=${cellIds[0]}` });
  actions.push({ kind: "link", id: "hypotheses", label: "Open Hypothesis Queue", href: "/app/strategy/hypotheses" });
  blocks.push({ kind: "actions", actions });

  return {
    id: `concept:${name}`,
    kicker: `Concept · ${cellIds.join(", ")}`,
    title: name,
    subtitle: pillars.length > 0 ? `${pillars.length} pillar${pillars.length !== 1 ? "s" : ""} linked` : "No pillar linked yet",
    blocks,
  };
}

// ─── Message pillar module builder ─────────────────────────────────────
// Replaces the always-inline, always-expanded pillar prose on the
// Communications page: the card face keeps only a scannable summary, and
// this module carries the full detail (why it matters, message
// resonance, funnel/execution/placement/scaling sections, target ICPs,
// and every testing hypothesis) into the same slide-over the MST tiles
// use. Pure data in, pure data out — reuses pillarTier/pillarHasDetails
// rather than re-deriving the evidence tier a second time.

const PILLAR_TIER_LABEL: Record<"high" | "medium" | "low", string> = {
  high: "High evidence",
  medium: "Some evidence",
  low: "Low evidence",
};

export interface PillarDeepDiveInput {
  pillar: MessagePillar;
  /** Active hypotheses already filtered to this pillar (pillar_id match). */
  hypotheses: ActiveHypothesis[];
  profiles?: ICPProfile[];
}

export function buildPillarDeepDiveModule(input: PillarDeepDiveInput): DeepDiveModule {
  const { pillar, hypotheses, profiles } = input;
  const sourceCells = pillar.source_cells ?? [];
  const targetIcps = pillar.target_icps ?? [];
  const tier = pillarTier(sourceCells);
  const matchedProfiles = targetIcps
    .map((id) => profiles?.find((pr) => pr.profile_id === id))
    .filter((pr): pr is ICPProfile => Boolean(pr));
  const messageResonance = matchedProfiles.map((pr) => pr.message_resonance).find(Boolean);

  const blocks: DeepDiveBlock[] = [
    {
      kind: "stats",
      title: "Evidence",
      stats: [
        {
          metricId: "confidence",
          label: "Confidence",
          value: PILLAR_TIER_LABEL[tier],
          note: `${sourceCells.length} source cell${sourceCells.length !== 1 ? "s" : ""} behind this pillar`,
        },
        { metricId: "hypotheses", label: "Hypotheses", value: String(hypotheses.length) },
        { metricId: "targets", label: "Target ICPs", value: String(targetIcps.length) },
      ],
    },
  ];

  const variableCodes = Object.values(pillar.variable_stack ?? {}).filter((v): v is string => Boolean(v));
  if (variableCodes.length > 0) {
    blocks.push({ kind: "variables", title: "What works", codes: variableCodes });
  }

  if (pillar.why_it_matters) blocks.push({ kind: "note", title: "Why it matters", text: pillar.why_it_matters });
  if (messageResonance) blocks.push({ kind: "note", title: "Message resonance", text: messageResonance });

  if (pillarHasDetails(pillar)) {
    blocks.push({ kind: "pillar_details", pillar, profiles });
  }

  if (hypotheses.length > 0) {
    blocks.push({
      kind: "hypotheses",
      title: `${hypotheses.length} testing hypothes${hypotheses.length !== 1 ? "es" : "is"}`,
      items: hypotheses.map((h) => ({ id: h.id, label: h.label, status: h.status, isolated: h.isolated_variable ?? null })),
    });
  }

  return {
    id: `pillar:${pillar.id}`,
    kicker: "Message pillar",
    title: pillar.label,
    subtitle: pillar.plain_descriptor || undefined,
    blocks,
  };
}
