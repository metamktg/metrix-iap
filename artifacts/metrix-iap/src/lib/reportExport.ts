// ─── Report export ────────────────────────────────────────────────────
// Builds a client-side report document from the seed bundle and downloads
// it as HTML, a Word/Google-Docs-importable .doc, or a real PDF.
// Content is composed strictly from the account's existing analysis and
// strategy data — no independent analysis is run here.

import type { MetrixSeed, AnalysisData, CellPerformanceRow, VariablePerformanceRow, PlacementRow } from "@/lib/data/seedTypes";
import {
  getAdAccount,
  getReportBuilder,
  getCampaignSummary,
  getCoreControls,
  getAnalysisData,
  getStrategyData,
  getOptimizationLoop,
  getMST,
} from "@/lib/data/metrixSeedAdapter";
import {
  computeSegmentDrilldown,
  segmentLabel,
  type SegmentId,
} from "@/lib/segment-analytics";

export type BrandingMode = "internal" | "client";
export type ExportFormat = "pdf" | "google_doc" | "html";

interface TextBlock {
  kind: "text";
  text: string;
}
interface StatsBlock {
  kind: "stats";
  items: { label: string; value: string }[];
}
interface TableBlock {
  kind: "table";
  caption?: string;
  headers: string[];
  rows: string[][];
}
interface ChartBlock {
  kind: "chart";
  /** Only horizontal bar charts are rendered today; kept explicit for future types. */
  chartType: "bar";
  title: string;
  /** Value formatting for axis/labels. */
  unit: "usd" | "num" | "pct";
  data: { label: string; value: number }[];
}
export type ReportBlock = TextBlock | StatsBlock | TableBlock | ChartBlock;

export interface ReportSection {
  title: string;
  blocks: ReportBlock[];
}

export interface ReportModel {
  docTitle: string;
  brandName: string;
  brandLine: string;
  accountName: string;
  platform: string;
  mode: BrandingMode;
  generatedAt: Date;
  sections: ReportSection[];
  footerNote: string;
  /** Human-readable report window, e.g. "Jun 1 – Jun 30, 2026". */
  windowLabel?: string | null;
  /**
   * True when the report includes at least one section built from
   * analysis-derived content (strategy, cell/variable performance). That
   * content is drawn from the account's current analysis state — not
   * scoped by windowLabel, which only describes the live-performance
   * figures (spend, impressions, etc.) elsewhere in the report. Used to
   * label the masthead honestly instead of implying the whole document
   * is date-scoped.
   */
  hasAnalysisDerivedContent?: boolean;
}

// ─── Snapshot (de)serialization ───────────────────────────────────────
// Generated reports are persisted server-side as a JSON snapshot so
// History/Exports downloads reproduce exactly what was generated.

export function serializeReportModel(model: ReportModel): string {
  return JSON.stringify({ ...model, generatedAt: model.generatedAt.toISOString() });
}

export function parseReportModel(json: string): ReportModel | null {
  try {
    const raw = JSON.parse(json) as Omit<ReportModel, "generatedAt"> & { generatedAt: string };
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.sections)) return null;
    const generatedAt = new Date(raw.generatedAt);
    if (Number.isNaN(generatedAt.getTime())) return null;
    return { ...raw, generatedAt };
  } catch {
    return null;
  }
}

// ─── Formatting helpers ───────────────────────────────────────────────

function num(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: n % 1 === 0 ? 0 : 2 });
}

function usd(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}%`;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "report";
}

function fmtChartValue(n: number, unit: ChartBlock["unit"]): string {
  if (unit === "usd") return usd(n);
  if (unit === "pct") return pct(n);
  return num(n);
}

// ─── Section content builders ─────────────────────────────────────────

function cellRows(rows: CellPerformanceRow[], limit = 10): TableBlock {
  const sorted = [...rows].sort((a, b) => b["Amount spent (USD)"] - a["Amount spent (USD)"]).slice(0, limit);
  return {
    kind: "table",
    headers: ["Cell", "Concept", "Spend", "Impressions", "Results", "CPA", "Link CTR"],
    rows: sorted.map((r) => [
      r.cell_id,
      r.book2_concept_name,
      usd(r["Amount spent (USD)"]),
      num(r.Impressions),
      num(r.Results),
      r.CPA_result == null ? "—" : usd(r.CPA_result),
      pct(r.CTR_link_pct),
    ]),
  };
}

function variableRows(rows: VariablePerformanceRow[], limit = 12): TableBlock {
  const sorted = [...rows].sort((a, b) => b["Amount spent (USD)"] - a["Amount spent (USD)"]).slice(0, limit);
  return {
    kind: "table",
    headers: ["Family", "Variable", "Spend", "Results", "CPA", "Link CTR", "Ads"],
    rows: sorted.map((r) => [
      r.variable_family,
      r.variable_id,
      usd(r["Amount spent (USD)"]),
      num(r.Results),
      r.CPA_result == null ? "—" : usd(r.CPA_result),
      pct(r.CTR_link_pct),
      num(r.unique_ads),
    ]),
  };
}

function placementRows(rows: PlacementRow[], caption: string, limit = 10): TableBlock {
  const sorted = [...rows].sort((a, b) => b["Amount spent (USD)"] - a["Amount spent (USD)"]).slice(0, limit);
  return {
    kind: "table",
    caption,
    headers: ["Placement", "Platform", "Spend", "Impressions", "Results", "CPA"],
    rows: sorted.map((r) => [
      r.Placement,
      r.Platform,
      usd(r["Amount spent (USD)"]),
      num(r.Impressions),
      num(r.Results),
      r.CPA == null ? "—" : usd(r.CPA),
    ]),
  };
}

function buildSectionBlocks(sectionTitle: string, seed: MetrixSeed, adAccountId: string): ReportBlock[] {
  const summary = getCampaignSummary(seed, adAccountId);
  const core = getCoreControls(seed, adAccountId);
  const analysis: AnalysisData | null = getAnalysisData(seed, adAccountId);
  const strategy = getStrategyData(seed, adAccountId);
  const loop = getOptimizationLoop(seed, adAccountId);
  const t = sectionTitle.toLowerCase();

  if (t.includes("executive")) {
    const blocks: ReportBlock[] = [];
    if (summary) {
      blocks.push({
        kind: "stats",
        items: [
          { label: "Total spend", value: usd(summary.total_spend_usd) },
          { label: "Impressions", value: num(summary.total_impressions) },
          { label: "Link clicks", value: num(summary.total_link_clicks) },
          { label: "Overall link CTR", value: pct(summary.overall_link_ctr_pct) },
        ],
      });
      const events = Object.entries(summary.bottom_line_totals ?? {});
      if (events.length > 0) {
        const spendByEvent = events
          .map(([event, v]) => ({ label: event, value: v.spend }))
          .filter((d) => d.value > 0)
          .sort((a, b) => b.value - a.value)
          .slice(0, 6);
        if (spendByEvent.length > 1) {
          blocks.push({ kind: "chart", chartType: "bar", title: "Spend by result event", unit: "usd", data: spendByEvent });
        }
        blocks.push({
          kind: "table",
          caption: "Bottom-line totals by result event",
          headers: ["Result event", "Spend", "Results", "Impressions", "Link clicks"],
          rows: events.map(([event, v]) => [event, usd(v.spend), num(v.results), num(v.impressions), num(v.link_clicks)]),
        });
      }
    }
    if (core) blocks.push({ kind: "text", text: `${core.primary_control}: ${core.primary_control_read}` });
    return blocks;
  }

  if (t.includes("data foundation") || t.includes("confidence")) {
    const blocks: ReportBlock[] = [];
    if (summary?.data_caveat) blocks.push({ kind: "text", text: summary.data_caveat });
    if (core?.data_caveat && core.data_caveat !== summary?.data_caveat) blocks.push({ kind: "text", text: core.data_caveat });
    return blocks;
  }

  if (t.includes("core control")) {
    if (!core) return [];
    const blocks: ReportBlock[] = [
      { kind: "text", text: `${core.primary_control} — ${core.primary_control_read}` },
    ];
    if (core.registration_control) {
      blocks.push({ kind: "text", text: `${core.registration_control} — ${core.registration_control_read}` });
    }
    return blocks;
  }

  if (t.includes("cell performance") || t.includes("creative cell")) {
    if (!analysis?.performance_by_cell?.length) return [];
    const topSpend = [...analysis.performance_by_cell]
      .sort((a, b) => b["Amount spent (USD)"] - a["Amount spent (USD)"])
      .slice(0, 6)
      .map((r) => ({ label: r.cell_id, value: r["Amount spent (USD)"] }))
      .filter((d) => d.value > 0);
    const blocks: ReportBlock[] = [];
    if (topSpend.length > 1) {
      blocks.push({ kind: "chart", chartType: "bar", title: "Top creative cells by spend", unit: "usd", data: topSpend });
    }
    blocks.push(cellRows(analysis.performance_by_cell));
    return blocks;
  }

  if (t.includes("variable performance")) {
    if (!analysis?.v3_variable_performance?.length) return [];
    const blocks: ReportBlock[] = [];

    // CPA by variable family — aggregate spend and results per family, then derive CPA.
    const familyMap = new Map<string, { spend: number; results: number }>();
    for (const r of analysis.v3_variable_performance) {
      const entry = familyMap.get(r.variable_family) ?? { spend: 0, results: 0 };
      entry.spend += r["Amount spent (USD)"] ?? 0;
      entry.results += r.Results ?? 0;
      familyMap.set(r.variable_family, entry);
    }
    const familyCpa = [...familyMap.entries()]
      .map(([family, { spend, results }]) => ({
        label: family,
        value: results > 0 ? spend / results : 0,
      }))
      .filter((d) => d.value > 0)
      .sort((a, b) => a.value - b.value) // ascending: cheapest CPA first
      .slice(0, 8);
    if (familyCpa.length > 1) {
      blocks.push({ kind: "chart", chartType: "bar", title: "CPA by variable family", unit: "usd", data: familyCpa });
    }

    blocks.push(variableRows(analysis.v3_variable_performance));
    return blocks;
  }

  if (t.includes("demographic")) {
    const rows = analysis?.demographic_registration_signal ?? [];
    if (rows.length === 0) return [];
    const sorted = [...rows].sort((a, b) => b["Amount spent (USD)"] - a["Amount spent (USD)"]).slice(0, 12);
    const blocks: ReportBlock[] = [];

    // Spend by age segment — aggregate spend across genders per age band.
    const ageMap = new Map<string, number>();
    for (const r of rows) {
      ageMap.set(r.Age, (ageMap.get(r.Age) ?? 0) + (r["Amount spent (USD)"] ?? 0));
    }
    const spendByAge = [...ageMap.entries()]
      .map(([label, value]) => ({ label, value }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
    if (spendByAge.length > 1) {
      blocks.push({ kind: "chart", chartType: "bar", title: "Spend by age segment", unit: "usd", data: spendByAge });
    }

    blocks.push({
      kind: "table",
      headers: ["Age", "Gender", "Spend", "Results", "CPA", "Link CTR"],
      rows: sorted.map((r) => [
        r.Age,
        r.Gender,
        usd(r["Amount spent (USD)"]),
        num(r.Results),
        r.CPA_result == null ? "—" : usd(r.CPA_result),
        pct(r.CTR_link_pct),
      ]),
    });
    return blocks;
  }

  if (t.includes("placement")) {
    const blocks: ReportBlock[] = [];
    const placementSource = analysis?.v3_placement_signal?.length
      ? analysis.v3_placement_signal
      : analysis?.c4e_placement_signal ?? [];
    const spendByPlacement = [...placementSource]
      .sort((a, b) => b["Amount spent (USD)"] - a["Amount spent (USD)"])
      .slice(0, 6)
      .map((r) => ({ label: r.Placement, value: r["Amount spent (USD)"] }))
      .filter((d) => d.value > 0);
    if (spendByPlacement.length > 1) {
      blocks.push({ kind: "chart", chartType: "bar", title: "Spend by placement", unit: "usd", data: spendByPlacement });
    }
    if (analysis?.v3_placement_signal?.length) blocks.push(placementRows(analysis.v3_placement_signal, "V3 placement signal"));
    if (analysis?.c4e_placement_signal?.length) blocks.push(placementRows(analysis.c4e_placement_signal, "C4E placement signal"));
    return blocks;
  }

  if (t.includes("strategy")) {
    const blocks: ReportBlock[] = [];
    for (const p of strategy?.message_pillars ?? []) {
      blocks.push({ kind: "text", text: `${p.label} — ${p.plain_descriptor} Why it matters: ${p.why_it_matters}` });
    }
    const hyps = strategy?.active_hypotheses ?? [];
    if (hyps.length > 0) {
      blocks.push({
        kind: "table",
        caption: "Active hypotheses",
        headers: ["Hypothesis", "Source", "Status"],
        rows: hyps.map((h) => [h.label, h.source, h.status]),
      });
    }
    return blocks;
  }

  if (t.includes("optimization") || t.includes("next sprint")) {
    const cards = loop?.recommendation_cards ?? [];
    if (cards.length === 0) return [];
    return [
      {
        kind: "table",
        headers: ["Recommendation", "Impact", "Confidence", "Action"],
        rows: cards.map((c) => [c.title, c.impact, c.confidence, c.recommended_action]),
      },
      ...cards.map<ReportBlock>((c) => ({ kind: "text", text: `${c.title}: ${c.rationale}` })),
    ];
  }

  return [];
}

// ─── Segment comparison ───────────────────────────────────────────────

/** Explicit user choice: which two segments to compare. Never auto-picked. */
export interface SegmentComparisonRequest {
  segmentA: SegmentId;
  segmentB: SegmentId;
  /**
   * Optional cell scope (mirrors the in-app drill-down).
   * When omitted, comparison is over all cells.
   */
  cellIds?: string[] | null;
}

const TOP_CONCEPTS = 5;

function buildSegmentComparisonSection(
  analysis: AnalysisData,
  mst: ReturnType<typeof getMST>,
  req: SegmentComparisonRequest,
): ReportSection {
  const cellIds = req.cellIds ?? null;
  const a = computeSegmentDrilldown(analysis, mst ?? undefined, req.segmentA, cellIds);
  const b = computeSegmentDrilldown(analysis, mst ?? undefined, req.segmentB, cellIds);
  const labelA = segmentLabel(req.segmentA);
  const labelB = segmentLabel(req.segmentB);
  const title = `Segment Comparison: ${labelA} vs ${labelB}`;
  const blocks: ReportBlock[] = [];

  // Low-signal warnings surface before the numbers so readers see them first.
  for (const reason of a.signal.reasons) {
    blocks.push({ kind: "text", text: `Low signal — ${labelA}: ${reason}` });
  }
  for (const reason of b.signal.reasons) {
    blocks.push({ kind: "text", text: `Low signal — ${labelB}: ${reason}` });
  }

  // Side-by-side key metrics table.
  blocks.push({
    kind: "table",
    caption: `${labelA} vs ${labelB} — key metrics`,
    headers: ["Metric", labelA, labelB],
    rows: [
      ["Spend", usd(a.totals.spend), usd(b.totals.spend)],
      ["Results", num(a.totals.results), num(b.totals.results)],
      ["CPA", a.derived.cpa == null ? "—" : usd(a.derived.cpa), b.derived.cpa == null ? "—" : usd(b.derived.cpa)],
      ["Link CTR", pct(a.derived.ctr), pct(b.derived.ctr)],
      ["CPM", a.derived.cpm == null ? "—" : usd(a.derived.cpm), b.derived.cpm == null ? "—" : usd(b.derived.cpm)],
      ["Frequency", num(a.derived.frequency), num(b.derived.frequency)],
    ],
  });

  // Top concepts per segment (attribution join).  Each side is reported
  // independently so the honest-null treatment for unavailable attribution
  // is preserved — one side can be unavailable while the other has data.
  function conceptBlocks(
    drilldown: ReturnType<typeof computeSegmentDrilldown>,
    label: string,
  ): ReportBlock[] {
    if (!drilldown.attribution.available) {
      const reason = drilldown.attribution.unavailableReason ?? "Concept attribution not available for this segment.";
      return [{ kind: "text", text: `${label} — concept breakdown unavailable: ${reason}` }];
    }
    const top = drilldown.attribution.cells.slice(0, TOP_CONCEPTS);
    if (top.length === 0) {
      return [{ kind: "text", text: `${label} — no concept rows in this scope.` }];
    }
    return [
      {
        kind: "table",
        caption: `${label} — top concepts by results`,
        headers: ["Cell", "Concept", "Results", "CPA", "Link CTR"],
        rows: top.map((c) => [
          c.cellId,
          c.conceptName ?? "—",
          num(c.totals.results),
          c.derived.cpa == null ? "—" : usd(c.derived.cpa),
          pct(c.derived.ctr),
        ]),
      },
    ];
  }

  blocks.push(...conceptBlocks(a, labelA));
  blocks.push(...conceptBlocks(b, labelB));

  return { title, blocks };
}

// ─── Model builder ────────────────────────────────────────────────────

export interface BuildReportOptions {
  docTitle?: string;
  sectionCount?: number;
  /** Exact section titles to include (in template order). Takes precedence over sectionCount. */
  selectedSections?: string[];
  /** Human-readable report window shown in the document meta line. */
  windowLabel?: string | null;
  /**
   * When provided, a "Segment Comparison" section is appended to the report.
   * The two segments must be chosen explicitly by the user — never auto-picked.
   * The section is omitted entirely when this option is absent.
   */
  segmentComparison?: SegmentComparisonRequest;
}

export function buildReportModel(
  seed: MetrixSeed,
  adAccountId: string,
  mode: BrandingMode,
  opts: BuildReportOptions = {},
): ReportModel | null {
  const account = getAdAccount(seed, adAccountId);
  const rb = getReportBuilder(seed, adAccountId);
  if (!account || !rb) return null;

  let sectionTitles = rb.report_sections;
  if (opts.selectedSections != null) {
    const wanted = new Set(opts.selectedSections);
    sectionTitles = sectionTitles.filter((t) => wanted.has(t));
    if (sectionTitles.length === 0) return null;
  } else if (opts.sectionCount != null && opts.sectionCount > 0 && opts.sectionCount < sectionTitles.length) {
    sectionTitles = sectionTitles.slice(0, opts.sectionCount);
  }

  const sections: ReportSection[] = sectionTitles.map((title) => {
    const blocks = buildSectionBlocks(title, seed, adAccountId);
    if (blocks.length === 0) {
      blocks.push({ kind: "text", text: "No data available for this section in the current analysis window." });
    }
    return { title, blocks };
  });

  // Append the segment comparison section only when explicitly requested.
  if (opts.segmentComparison) {
    const analysis = getAnalysisData(seed, adAccountId);
    const mst = getMST(seed, adAccountId);
    if (analysis) {
      sections.push(buildSegmentComparisonSection(analysis, mst, opts.segmentComparison));
    }
  }

  // Strategy/cell/variable-performance sections are analysis-derived —
  // drawn from the account's current analysis state, never filtered by
  // windowLabel (which describes only the live-performance figures
  // elsewhere in the report, e.g. Executive Summary spend totals).
  const ANALYSIS_DERIVED_KEYWORDS = ["strategy", "cell performance", "creative cell", "variable performance"];
  const hasAnalysisDerivedContent = sectionTitles.some((title) => {
    const t = title.toLowerCase();
    return ANALYSIS_DERIVED_KEYWORDS.some((k) => t.includes(k));
  });

  const internal = mode === "internal";
  return {
    docTitle: opts.docTitle ?? `Creative Signal Report — ${account.name}`,
    brandName: internal ? "Metrix IAP" : account.name,
    brandLine: internal
      ? "Internal dashboard mode · full Metrix branding"
      : "Client-facing report · white-labeled delivery",
    accountName: account.name,
    platform: account.platform,
    mode,
    generatedAt: new Date(),
    sections,
    windowLabel: opts.windowLabel ?? null,
    hasAnalysisDerivedContent,
    footerNote: internal
      ? "Generated by Metrix IAP. Composed from the account's analysis and strategy — no independent analysis was run."
      : `Prepared for ${account.name}. Composed from the account's analysis and strategy.`,
  };
}

/**
 * The masthead's window clause. When the report mixes live-performance
 * figures (scoped by windowLabel) with analysis-derived sections (never
 * window-scoped), says so explicitly rather than implying the whole
 * document is date-scoped.
 */
function windowMetaText(model: ReportModel): string {
  if (!model.windowLabel) return "";
  return model.hasAnalysisDerivedContent
    ? ` · Window ${model.windowLabel} (live performance) · Strategy & concept data: all-time`
    : ` · Window ${model.windowLabel}`;
}

// ─── HTML rendering ───────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderChartHtml(block: ChartBlock, accent: string): string {
  const rowH = 26;
  const gap = 8;
  const labelW = 150;
  const valueW = 92;
  const barMaxW = 360;
  const width = labelW + barMaxW + valueW;
  const height = block.data.length * (rowH + gap) + 34;
  const max = Math.max(...block.data.map((d) => d.value), 1);
  const bars = block.data
    .map((d, i) => {
      const y = 30 + i * (rowH + gap);
      const w = Math.max(2, Math.round((d.value / max) * barMaxW));
      return `
      <text x="0" y="${y + rowH / 2 + 4}" class="c-label">${esc(d.label.length > 26 ? d.label.slice(0, 25) + "…" : d.label)}</text>
      <rect x="${labelW}" y="${y}" width="${w}" height="${rowH}" rx="3" fill="${accent}" fill-opacity="0.82" />
      <text x="${labelW + w + 6}" y="${y + rowH / 2 + 4}" class="c-value">${esc(fmtChartValue(d.value, block.unit))}</text>`;
    })
    .join("");
  return `<figure class="chart">
    <figcaption>${esc(block.title)}</figcaption>
    <svg viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="${esc(block.title)}" preserveAspectRatio="xMinYMin meet" style="max-width:${width}px">
      <style>
        .c-label { font-family: Arial, Helvetica, sans-serif; font-size: 11px; fill: #374151; }
        .c-value { font-family: Arial, Helvetica, sans-serif; font-size: 11px; font-weight: 700; fill: #1a1a2e; }
      </style>
      ${bars}
    </svg>
  </figure>`;
}

function renderBlockHtml(block: ReportBlock, accent: string): string {
  if (block.kind === "text") {
    return `<p class="body-text">${esc(block.text)}</p>`;
  }
  if (block.kind === "chart") {
    return renderChartHtml(block, accent);
  }
  if (block.kind === "stats") {
    return `<table class="stats"><tr>${block.items
      .map((i) => `<td class="stat"><div class="stat-label">${esc(i.label)}</div><div class="stat-value">${esc(i.value)}</div></td>`)
      .join("")}</tr></table>`;
  }
  const caption = block.caption ? `<caption>${esc(block.caption)}</caption>` : "";
  return `<table class="data">${caption}<thead><tr>${block.headers
    .map((h) => `<th>${esc(h)}</th>`)
    .join("")}</tr></thead><tbody>${block.rows
    .map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

export function renderReportHtml(model: ReportModel): string {
  const internal = model.mode === "internal";
  const accent = internal ? "#6d5df6" : "#0f766e";
  const dateStr = model.generatedAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const sectionsHtml = model.sections
    .map(
      (s, i) => `
      <section>
        <h2><span class="sec-num">${String(i + 1).padStart(2, "0")}</span> ${esc(s.title)}</h2>
        ${s.blocks.map((b) => renderBlockHtml(b, accent)).join("\n")}
      </section>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${esc(model.docTitle)}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a2e; margin: 0; background: #fff; }
  .page { max-width: 760px; margin: 0 auto; padding: 48px 40px; }
  .masthead { border-bottom: 3px solid ${accent}; padding-bottom: 20px; margin-bottom: 32px; }
  .brand { font-family: Arial, Helvetica, sans-serif; font-size: 13px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: ${accent}; }
  .brand-line { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #6b7280; margin-top: 2px; letter-spacing: 0.06em; }
  h1 { font-size: 28px; margin: 14px 0 4px; }
  .meta { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #6b7280; }
  section { margin-bottom: 30px; }
  h2 { font-family: Arial, Helvetica, sans-serif; font-size: 15px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; margin: 0 0 12px; }
  .sec-num { color: ${accent}; font-size: 11px; letter-spacing: 0.1em; margin-right: 6px; }
  .body-text { font-size: 13px; line-height: 1.65; margin: 0 0 10px; }
  table.stats { width: 100%; border-collapse: collapse; margin: 0 0 14px; }
  td.stat { border: 1px solid #e5e7eb; padding: 10px 12px; }
  .stat-label { font-family: Arial, Helvetica, sans-serif; font-size: 9px; text-transform: uppercase; letter-spacing: 0.1em; color: #6b7280; }
  .stat-value { font-size: 17px; font-weight: 700; margin-top: 3px; }
  table.data { width: 100%; border-collapse: collapse; margin: 0 0 16px; font-family: Arial, Helvetica, sans-serif; font-size: 11px; }
  table.data caption { caption-side: top; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #6b7280; padding-bottom: 5px; }
  table.data th { text-align: left; background: #f3f4f6; padding: 6px 8px; border: 1px solid #e5e7eb; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
  table.data td { padding: 6px 8px; border: 1px solid #e5e7eb; }
  .footer { border-top: 1px solid #e5e7eb; margin-top: 36px; padding-top: 14px; font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #9ca3af; }
  figure.chart { margin: 0 0 16px; padding: 0; }
  figure.chart figcaption { font-family: Arial, Helvetica, sans-serif; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #6b7280; margin-bottom: 6px; }
</style>
</head>
<body>
<div class="page">
  <div class="masthead">
    <div class="brand">${esc(model.brandName)}</div>
    <div class="brand-line">${esc(model.brandLine)}</div>
    <h1>${esc(model.docTitle)}</h1>
    <div class="meta">${esc(model.accountName)} · ${esc(model.platform)}${esc(windowMetaText(model))} · Generated ${esc(dateStr)}</div>
  </div>
  ${sectionsHtml}
  <div class="footer">${esc(model.footerNote)}</div>
</div>
</body>
</html>`;
}

// ─── Download helpers ─────────────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}

async function downloadPdf(model: ReportModel, filename: string): Promise<void> {
  const [{ jsPDF }, autoTableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const autoTable = autoTableModule.default;
  const internal = model.mode === "internal";
  const accent: [number, number, number] = internal ? [109, 93, 246] : [15, 118, 110];

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  const ensureRoom = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  // Masthead
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...accent);
  doc.text(model.brandName.toUpperCase(), margin, y);
  y += 13;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);
  doc.text(model.brandLine, margin, y);
  y += 22;
  doc.setFont("times", "bold");
  doc.setFontSize(21);
  doc.setTextColor(26, 26, 46);
  const titleLines = doc.splitTextToSize(model.docTitle, maxWidth);
  doc.text(titleLines, margin, y);
  y += titleLines.length * 23;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(107, 114, 128);
  const dateStr = model.generatedAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  doc.text(`${model.accountName} · ${model.platform}${windowMetaText(model)} · Generated ${dateStr}`, margin, y);
  y += 10;
  doc.setDrawColor(...accent);
  doc.setLineWidth(2);
  doc.line(margin, y, pageWidth - margin, y);
  y += 24;

  for (let i = 0; i < model.sections.length; i++) {
    const section = model.sections[i];
    ensureRoom(60);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.setTextColor(26, 26, 46);
    doc.text(`${String(i + 1).padStart(2, "0")}  ${section.title}`, margin, y);
    y += 6;
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 14;

    for (const block of section.blocks) {
      if (block.kind === "text") {
        doc.setFont("times", "normal");
        doc.setFontSize(10.5);
        doc.setTextColor(26, 26, 46);
        const lines = doc.splitTextToSize(block.text, maxWidth);
        ensureRoom(lines.length * 13 + 8);
        doc.text(lines, margin, y);
        y += lines.length * 13 + 8;
      } else if (block.kind === "chart") {
        const rowH = 14;
        const gap = 6;
        const labelW = 120;
        const valueW = 70;
        const barMaxW = maxWidth - labelW - valueW;
        const max = Math.max(...block.data.map((d) => d.value), 1);
        ensureRoom(18 + block.data.length * (rowH + gap) + 10);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(107, 114, 128);
        doc.text(block.title.toUpperCase(), margin, y);
        y += 12;
        for (const d of block.data) {
          const w = Math.max(1.5, (d.value / max) * barMaxW);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
          doc.setTextColor(55, 65, 81);
          const label = d.label.length > 22 ? d.label.slice(0, 21) + "…" : d.label;
          doc.text(label, margin, y + rowH - 4);
          doc.setFillColor(...accent);
          doc.rect(margin + labelW, y, w, rowH, "F");
          doc.setFont("helvetica", "bold");
          doc.setTextColor(26, 26, 46);
          doc.text(fmtChartValue(d.value, block.unit), margin + labelW + w + 4, y + rowH - 4);
          y += rowH + gap;
        }
        y += 6;
      } else if (block.kind === "stats") {
        autoTable(doc, {
          startY: y,
          margin: { left: margin, right: margin },
          head: [block.items.map((it) => it.label)],
          body: [block.items.map((it) => it.value)],
          theme: "grid",
          styles: { font: "helvetica", fontSize: 9, cellPadding: 6 },
          headStyles: { fillColor: [243, 244, 246], textColor: [107, 114, 128], fontSize: 7.5, fontStyle: "bold" },
          bodyStyles: { fontStyle: "bold", fontSize: 11, textColor: [26, 26, 46] },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
      } else {
        if (block.caption) {
          ensureRoom(20);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(7.5);
          doc.setTextColor(107, 114, 128);
          doc.text(block.caption.toUpperCase(), margin, y);
          y += 8;
        }
        autoTable(doc, {
          startY: y,
          margin: { left: margin, right: margin },
          head: [block.headers],
          body: block.rows,
          theme: "grid",
          styles: { font: "helvetica", fontSize: 8, cellPadding: 4, textColor: [26, 26, 46] },
          headStyles: { fillColor: [243, 244, 246], textColor: [55, 65, 81], fontSize: 7.5, fontStyle: "bold" },
        });
        y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
      }
    }
    y += 8;
  }

  ensureRoom(30);
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 12;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(156, 163, 175);
  doc.text(doc.splitTextToSize(model.footerNote, maxWidth), margin, y);

  doc.save(filename);
}

export type ExportOutcome =
  /** A local file was triggered for download (pdf / html / .doc fallback). */
  | { kind: "downloaded" }
  /** A real Google Doc was created and opened in a new tab. */
  | { kind: "google_doc"; url: string }
  /** Google Docs connector was not connected; fell back to .doc download. */
  | { kind: "fallback_downloaded" };
/**
 * Download (or create) the report in the requested format.
 *
 * - pdf        → real PDF generated client-side
 * - html       → styled .html file
 * - google_doc → when `opts.workspaceId` is provided, creates a real Google Doc
 *                via the server connector and opens it in a new tab; falls back
 *                to the Word-compatible .doc download when the connector is not
 *                connected or no workspaceId is given.
 */
export async function downloadReportExport(
  format: ExportFormat | string,
  model: ReportModel,
  opts?: { workspaceId?: string },
): Promise<ExportOutcome> {
  const base = slugify(model.docTitle);

  if (format === "pdf") {
    await downloadPdf(model, `${base}.pdf`);
    return { kind: "downloaded" };
  }

  if (format === "google_doc") {
    // Try to create a real Google Doc via the API server connector
    if (opts?.workspaceId) {
      try {
        const resp = await fetch(
          `/api/metrix/workspaces/${encodeURIComponent(opts.workspaceId)}/reports/google-doc`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ title: model.docTitle, model_json: serializeReportModel(model) }),
          },
        );
        if (resp.ok) {
          const data = (await resp.json()) as { connected: boolean; url: string | null };
          if (data.connected && data.url) {
            window.open(data.url, "_blank", "noopener,noreferrer");
            return { kind: "google_doc", url: data.url };
          }
        }
      } catch {
        // Network error — fall through to .doc fallback below
      }
    }
    // Fallback: Word-compatible .doc download (connector not connected or no context)
    const html = renderReportHtml(model);
    const wordHtml = html.replace(
      '<html lang="en">',
      '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" lang="en">',
    );
    downloadBlob(new Blob(["\ufeff", wordHtml], { type: "application/msword" }), `${base}.doc`);
    return opts?.workspaceId ? { kind: "fallback_downloaded" } : { kind: "downloaded" };
  }

  const html = renderReportHtml(model);
  downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), `${base}.html`);
  return { kind: "downloaded" };
}
