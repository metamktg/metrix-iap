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
} from "@/lib/data/metrixSeedAdapter";

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
export type ReportBlock = TextBlock | StatsBlock | TableBlock;

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
    return [
      { kind: "text", text: `${core.primary_control} — ${core.primary_control_read}` },
      { kind: "text", text: `${core.registration_control} — ${core.registration_control_read}` },
    ];
  }

  if (t.includes("cell performance") || t.includes("creative cell")) {
    if (!analysis?.performance_by_cell?.length) return [];
    return [cellRows(analysis.performance_by_cell)];
  }

  if (t.includes("variable performance")) {
    if (!analysis?.v3_variable_performance?.length) return [];
    return [variableRows(analysis.v3_variable_performance)];
  }

  if (t.includes("demographic")) {
    const rows = analysis?.demographic_registration_signal ?? [];
    if (rows.length === 0) return [];
    const sorted = [...rows].sort((a, b) => b["Amount spent (USD)"] - a["Amount spent (USD)"]).slice(0, 12);
    return [
      {
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
      },
    ];
  }

  if (t.includes("placement")) {
    const blocks: ReportBlock[] = [];
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

// ─── Model builder ────────────────────────────────────────────────────

export interface BuildReportOptions {
  docTitle?: string;
  sectionCount?: number;
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
  if (opts.sectionCount != null && opts.sectionCount > 0 && opts.sectionCount < sectionTitles.length) {
    sectionTitles = sectionTitles.slice(0, opts.sectionCount);
  }

  const sections: ReportSection[] = sectionTitles.map((title) => {
    const blocks = buildSectionBlocks(title, seed, adAccountId);
    if (blocks.length === 0) {
      blocks.push({ kind: "text", text: "No data available for this section in the current analysis window." });
    }
    return { title, blocks };
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
    footerNote: internal
      ? "Generated by Metrix IAP. Composed from the account's analysis and strategy — no independent analysis was run."
      : `Prepared for ${account.name}. Composed from the account's analysis and strategy.`,
  };
}

// ─── HTML rendering ───────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderBlockHtml(block: ReportBlock): string {
  if (block.kind === "text") {
    return `<p class="body-text">${esc(block.text)}</p>`;
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
        ${s.blocks.map(renderBlockHtml).join("\n")}
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
</style>
</head>
<body>
<div class="page">
  <div class="masthead">
    <div class="brand">${esc(model.brandName)}</div>
    <div class="brand-line">${esc(model.brandLine)}</div>
    <h1>${esc(model.docTitle)}</h1>
    <div class="meta">${esc(model.accountName)} · ${esc(model.platform)} · Generated ${esc(dateStr)}</div>
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
  doc.text(`${model.accountName} · ${model.platform} · Generated ${dateStr}`, margin, y);
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

/**
 * Download the report in the requested format.
 * - html → styled .html file
 * - google_doc → .doc (Word-flavored HTML; opens in Word and imports cleanly into Google Docs)
 * - pdf → real PDF generated client-side
 */
export async function downloadReportExport(format: ExportFormat | string, model: ReportModel): Promise<void> {
  const base = slugify(model.docTitle);
  if (format === "pdf") {
    await downloadPdf(model, `${base}.pdf`);
    return;
  }
  const html = renderReportHtml(model);
  if (format === "google_doc") {
    const wordHtml = html.replace(
      '<html lang="en">',
      '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" lang="en">',
    );
    downloadBlob(new Blob(["\ufeff", wordHtml], { type: "application/msword" }), `${base}.doc`);
    return;
  }
  downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), `${base}.html`);
}
