// ─── Portable data exports ──────────────────────────────────────────────
// Builds the JSON/CSV payloads for the Exports section. Deliberately
// scoped to what's safe to hand an agency's own AI tooling or a CMO
// summary: findings, variable codes WITH their plain-language labels,
// avatars/ICP/PMF, communications, hypotheses, briefs, performance
// roll-ups, confidence grades. Deliberately excludes scoring weights,
// thresholds, prompt text, and registry internals — none of that is
// read from here.

import type { MetrixSeed, CellPerformanceRow } from "./data/seedTypes";
import { getAdAccount, getAnalysisData, getStrategyData, getBriefBuilder } from "./data/metrixSeedAdapter";
import { resolveVariableLabel } from "./variable-registry";

/** Resolve a raw variable code — including compound "A + B" stacks — to labels. */
function readableVariables(code: string | null | undefined): string {
  if (!code) return "–";
  return code
    .split(/\s*\+\s*/)
    .map((c) => resolveVariableLabel(c.trim()))
    .join(" + ");
}

function download(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadJson(filename: string, payload: unknown) {
  download(filename, JSON.stringify(payload, null, 2), "application/json");
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  download(filename, toCsv(rows), "text/csv");
}

export interface AnalysisExport {
  account: string;
  exported_at: string;
  performance: Array<{
    cell_id: string;
    concept: string;
    variables: string;
    result_type: string;
    spend_usd: number;
    results: number;
    cpa: number | null;
    link_ctr_pct: number | null;
  }>;
  variable_performance: Array<{
    code: string;
    label: string;
    result_type: string;
    results: number;
    cpa: number | null;
  }>;
}

function cellVariableCodes(r: CellPerformanceRow): string {
  return [r.hook_variable, r.tone_variable, r.framework_variable, r.concept_variable, r.pain_proof_variable, r.proof_variable, r.cta_variable]
    .filter((c): c is string => Boolean(c))
    .join(" + ");
}

export function buildAnalysisExport(seed: MetrixSeed, accountId: string): AnalysisExport | null {
  const account = getAdAccount(seed, accountId);
  const analysis = getAnalysisData(seed, accountId);
  if (!account || !analysis) return null;
  return {
    account: account.name,
    exported_at: new Date().toISOString(),
    performance: analysis.performance_by_cell.map((r) => ({
      cell_id: r.cell_id,
      concept: r.book2_concept_name,
      variables: readableVariables(cellVariableCodes(r)),
      result_type: r["Result type"],
      spend_usd: r["Amount spent (USD)"],
      results: r.Results,
      cpa: r.CPA_result ?? null,
      link_ctr_pct: r.CTR_link_pct ?? null,
    })),
    variable_performance: analysis.v3_variable_performance.map((r) => ({
      code: r.variable_id,
      label: readableVariables(r.variable_id),
      result_type: r["Result type"],
      results: r.Results,
      cpa: r.CPA_result ?? null,
    })),
  };
}

export interface StrategyExport {
  account: string;
  exported_at: string;
  message_pillars: Array<{
    id: string;
    label: string;
    plain_descriptor: string;
    why_it_matters: string;
    variables: string;
    target_icps: string[];
  }>;
  hypotheses: Array<{ label: string; status: string; risk?: string; expected_impact?: string }>;
  avatars: Array<{
    name: string;
    demographic_foundation?: string;
    psychographic_profile?: string;
    message_resonance?: string;
    strategic_recommendation?: string;
    confidence_level?: string;
  }>;
}

export function buildStrategyExport(seed: MetrixSeed, accountId: string): StrategyExport | null {
  const account = getAdAccount(seed, accountId);
  const strategy = getStrategyData(seed, accountId);
  if (!account || !strategy) return null;
  return {
    account: account.name,
    exported_at: new Date().toISOString(),
    message_pillars: strategy.message_pillars.map((p) => ({
      id: p.id,
      label: p.label,
      plain_descriptor: p.plain_descriptor,
      why_it_matters: p.why_it_matters,
      variables: readableVariables(Object.values(p.variable_stack).join(" + ")),
      target_icps: p.target_icps ?? [],
    })),
    hypotheses: strategy.active_hypotheses.map((h) => ({
      label: h.label,
      status: h.status,
      risk: h.risk,
      expected_impact: h.expected_impact,
    })),
    avatars: (strategy.icp_profiles ?? []).map((p) => ({
      name: p.profile_name,
      demographic_foundation: p.demographic_foundation,
      psychographic_profile: p.psychographic_profile,
      message_resonance: p.message_resonance,
      strategic_recommendation: p.strategic_recommendation,
      confidence_level: p.confidence_level,
    })),
  };
}

export interface BriefsExport {
  account: string;
  exported_at: string;
  briefs: Array<{
    id: string;
    pillar: string;
    asset_type: string;
    status: string;
    human_direction: string;
    creative_direction: string[];
  }>;
}

export function buildBriefsExport(seed: MetrixSeed, accountId: string): BriefsExport | null {
  const account = getAdAccount(seed, accountId);
  const bb = getBriefBuilder(seed, accountId);
  const strategy = getStrategyData(seed, accountId);
  if (!account || !bb) return null;
  const pillarLabel = (id: string) => strategy?.message_pillars.find((p) => p.id === id)?.label ?? id;
  return {
    account: account.name,
    exported_at: new Date().toISOString(),
    briefs: bb.draft_briefs.map((b) => ({
      id: b.id,
      pillar: pillarLabel(b.source_pillar),
      asset_type: b.asset_type,
      status: b.status,
      human_direction: b.human_direction,
      creative_direction: b.plain_variable_descriptors,
    })),
  };
}
