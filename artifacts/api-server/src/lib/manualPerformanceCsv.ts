// ── Manual performance CSV parsing (July 2026) ──────────────────────────
// Canonical format for the "Performance export (CSV)" manual upload kind.
// This is intentionally close to a Meta Ads Manager export so a user can
// export their account's performance report and upload it with little to
// no editing. Pure parsing (no DB/network IO) so it's unit-testable
// without a live Supabase connection — see manualPerformanceCsv.test.ts.
//
// Header matching is case-insensitive and tolerant of a few common Ads
// Manager column name variants (aliases below), but MISSING required
// columns fail loudly rather than silently defaulting — a manual upload
// with the wrong columns must never produce fabricated/zeroed metrics.

import { parseCsv } from "./manualCsvGrammar";

export interface RequiredColumnSpec {
  /** Canonical name shown to the user (also the primary header this module writes back when generating a template). */
  label: string;
  /** Header aliases accepted from an upload, matched case-insensitively. */
  aliases: string[];
  required: boolean;
  description: string;
}

/**
 * The full column spec surfaced to users in the upload UI (required-format
 * panel) and used to validate an uploaded CSV's header row.
 */
export const MANUAL_PERFORMANCE_CSV_COLUMNS: RequiredColumnSpec[] = [
  { label: "Day", aliases: ["day", "date", "reporting starts"], required: true, description: "Date the row covers, YYYY-MM-DD." },
  { label: "Campaign name", aliases: ["campaign name", "campaign"], required: true, description: "Campaign name from Ads Manager." },
  { label: "Ad set name", aliases: ["ad set name", "adset name", "ad set"], required: false, description: "Ad set name (optional but recommended)." },
  { label: "Ad name", aliases: ["ad name", "ad"], required: true, description: "Ad name from Ads Manager." },
  { label: "Result type", aliases: ["result type", "result indicator"], required: true, description: "The result event this row measures, e.g. \"Purchases\", \"Link clicks\", \"Leads\"." },
  { label: "Results", aliases: ["results"], required: true, description: "Count of the result type for this ad/day." },
  { label: "Amount spent (USD)", aliases: ["amount spent (usd)", "amount spent", "spend"], required: true, description: "Spend for this ad/day, in USD." },
  { label: "Impressions", aliases: ["impressions"], required: true, description: "Impressions for this ad/day." },
  { label: "Reach", aliases: ["reach"], required: false, description: "Reach for this ad/day (optional)." },
  { label: "Link clicks", aliases: ["link clicks"], required: false, description: "Link clicks for this ad/day (optional, used for CTR/CVR)." },
  { label: "Clicks (all)", aliases: ["clicks (all)", "clicks all", "clicks"], required: false, description: "All clicks for this ad/day (optional)." },
];

export const REQUIRED_MANUAL_PERFORMANCE_COLUMNS = MANUAL_PERFORMANCE_CSV_COLUMNS.filter((c) => c.required).map(
  (c) => c.label,
);

export interface ManualPerformanceRow {
  date: string; // YYYY-MM-DD
  campaign_name: string;
  ad_set_name: string | null;
  ad_name: string;
  result_type: string;
  results: number;
  spend: number;
  impressions: number;
  reach: number | null;
  link_clicks: number | null;
  clicks_all: number | null;
  cpa: number | null;
  ctr_link_pct: number | null;
  cvr_link_pct: number | null;
  cpm: number | null;
}

export class ManualCsvFormatError extends Error {}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Maps each canonical column to the index it was found at in the header row, or -1 if absent. */
function resolveColumnIndexes(headerRow: string[]): Map<string, number> {
  const normalized = headerRow.map(normalizeHeader);
  const indexes = new Map<string, number>();
  for (const col of MANUAL_PERFORMANCE_CSV_COLUMNS) {
    const idx = normalized.findIndex((h) => col.aliases.includes(h));
    indexes.set(col.label, idx);
  }
  return indexes;
}

function parseNumber(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const cleaned = raw.replace(/[$,]/g, "").trim();
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parses a manual performance CSV export into structured rows.
 * Throws ManualCsvFormatError (with an actionable message) on any
 * structural problem — never silently drops or zeroes bad data.
 */
export function parseManualPerformanceCsv(raw: string): ManualPerformanceRow[] {
  const grid = parseCsv(raw);
  if (grid.length === 0) {
    throw new ManualCsvFormatError("The file is empty.");
  }
  const [headerRow, ...dataRows] = grid;
  const indexes = resolveColumnIndexes(headerRow!);

  const missing = MANUAL_PERFORMANCE_CSV_COLUMNS.filter((c) => c.required && indexes.get(c.label) === -1).map(
    (c) => c.label,
  );
  if (missing.length > 0) {
    throw new ManualCsvFormatError(
      `Missing required column(s): ${missing.join(", ")}. See the required format below and re-export or fix your CSV headers.`,
    );
  }
  if (dataRows.length === 0) {
    throw new ManualCsvFormatError("The file has a header row but no data rows.");
  }

  const rows: ManualPerformanceRow[] = [];
  dataRows.forEach((cells, i) => {
    const lineNo = i + 2; // +1 for header, +1 for 1-indexing
    const get = (label: string): string | undefined => {
      const idx = indexes.get(label)!;
      return idx === -1 ? undefined : cells[idx];
    };

    const date = (get("Day") ?? "").trim();
    if (!DATE_RE.test(date)) {
      throw new ManualCsvFormatError(`Row ${lineNo}: "Day" must be YYYY-MM-DD, got "${date || "(empty)"}".`);
    }
    const campaignName = (get("Campaign name") ?? "").trim();
    if (!campaignName) throw new ManualCsvFormatError(`Row ${lineNo}: "Campaign name" is required.`);
    const adName = (get("Ad name") ?? "").trim();
    if (!adName) throw new ManualCsvFormatError(`Row ${lineNo}: "Ad name" is required.`);
    const resultType = (get("Result type") ?? "").trim();
    if (!resultType) throw new ManualCsvFormatError(`Row ${lineNo}: "Result type" is required.`);

    const results = parseNumber(get("Results"));
    if (results === null) throw new ManualCsvFormatError(`Row ${lineNo}: "Results" must be a number.`);
    const spend = parseNumber(get("Amount spent (USD)"));
    if (spend === null) throw new ManualCsvFormatError(`Row ${lineNo}: "Amount spent (USD)" must be a number.`);
    const impressions = parseNumber(get("Impressions"));
    if (impressions === null) throw new ManualCsvFormatError(`Row ${lineNo}: "Impressions" must be a number.`);

    const reach = parseNumber(get("Reach"));
    const linkClicks = parseNumber(get("Link clicks"));
    const clicksAll = parseNumber(get("Clicks (all)"));

    rows.push({
      date,
      campaign_name: campaignName,
      ad_set_name: (get("Ad set name") ?? "").trim() || null,
      ad_name: adName,
      result_type: resultType,
      results,
      spend,
      impressions,
      reach,
      link_clicks: linkClicks,
      clicks_all: clicksAll,
      cpa: results > 0 ? spend / results : null,
      ctr_link_pct: linkClicks !== null && impressions > 0 ? (linkClicks / impressions) * 100 : null,
      cvr_link_pct: linkClicks !== null && linkClicks > 0 ? (results / linkClicks) * 100 : null,
      cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
    });
  });

  return rows;
}

/** A minimal, valid sample CSV — used by the client's "Download template" action. */
export function buildSampleManualPerformanceCsv(): string {
  const header = MANUAL_PERFORMANCE_CSV_COLUMNS.map((c) => c.label).join(",");
  const sampleRows = [
    "2026-06-01,Prospecting - Broad,Prospecting - Broad - AS1,UGC_Testimonial_v1,Purchases,3,42.50,5100,4800,180,205",
    "2026-06-02,Prospecting - Broad,Prospecting - Broad - AS1,UGC_Testimonial_v1,Purchases,5,55.10,6200,5850,210,240",
    "2026-06-01,Retargeting - 30d,Retargeting - AS1,Static_Offer_v2,Purchases,8,30.00,2100,1950,140,155",
  ];
  return [header, ...sampleRows].join("\n");
}
