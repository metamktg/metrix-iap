// ═══════════════════════════════════════════════════════════════════════
// METRIX IAP — Scoring Utilities
// Pure functions for performance tier classification, budget band
// assignment, and signal quality computation. No live model calls.
// ═══════════════════════════════════════════════════════════════════════

import type {
  ConfidenceLabel,
  PerformanceTier,
  BudgetBand,
  SignalQualityScore,
} from "../types";

// ─── Confidence Label ─────────────────────────────────────────────────

/**
 * Assign a confidence label based on conversion count and spend.
 * Real thresholds per Metrix IAP taxonomy.
 */
export function classifyConfidence(
  conversions: number,
  spendUsd: number
): ConfidenceLabel {
  if (conversions > 100 || spendUsd > 1000) return "high";
  if (conversions > 20 || spendUsd > 300) return "medium";
  if (conversions > 5 || spendUsd > 50) return "validation_required";
  return "insufficient";
}

// ─── Performance Tier ─────────────────────────────────────────────────

export interface TierInput {
  roas: number;
  cpa_usd: number;
  conversions: number;
  confidence: ConfidenceLabel;
  account_avg_roas: number;
  account_avg_cpa: number;
}

/**
 * Classify an ad/concept into a performance tier using real IAP logic.
 * Tier 1 = Scale Winner, 2 = Optimize Candidate, 3 = Test/Pivot, 4 = Eliminate
 */
export function classifyTier(input: TierInput): PerformanceTier {
  const { roas, cpa_usd, conversions, confidence, account_avg_roas, account_avg_cpa } = input;

  // Insufficient data → Tier 3 (can't confirm or eliminate)
  // Note: checking by exclusion to satisfy strict TS narrowing
  if (confidence !== "high" && confidence !== "medium" && confidence !== "validation_required") return 3;

  const roasRatio = account_avg_roas > 0 ? roas / account_avg_roas : 0;
  const cpaRatio = account_avg_cpa > 0 ? cpa_usd / account_avg_cpa : 999;

  // Tier 1: high ROAS + efficient acquisition + strong signal
  if (
    roasRatio >= 1.2 &&
    cpaRatio <= 0.9 &&
    conversions >= 20 &&
    (confidence === "high" || confidence === "medium")
  ) {
    return 1;
  }

  // Tier 4: consistently poor across multiple metrics
  // (confidence is already "high" | "medium" | "validation_required" past the early-return above)
  if (roasRatio < 0.6 && cpaRatio > 1.5) {
    return 4;
  }

  // Tier 2: good signal with optimization potential
  if (roasRatio >= 0.9 || (cpaRatio <= 1.1 && conversions > 10)) {
    return 2;
  }

  // Tier 3: mixed or low signal
  return 3;
}

// ─── Budget Band ──────────────────────────────────────────────────────

/**
 * Map a performance tier to a budget allocation band.
 */
export function tierToBudgetBand(tier: PerformanceTier, liftPct?: number): BudgetBand {
  if (liftPct !== undefined) {
    if (liftPct >= 20) return "critical_scale";
    if (liftPct >= 10) return "scale";
    if (liftPct >= 0) return "optimize";
    if (liftPct > -20) return "validate";
    return "retire";
  }
  switch (tier) {
    case 1: return "critical_scale";
    case 2: return "scale";
    case 3: return "optimize";
    case 4: return "retire";
  }
}

export const BUDGET_BAND_LABELS: Record<BudgetBand, { label: string; pct: string; lift: string }> = {
  critical_scale: { label: "Critical Scale", pct: "60%", lift: "+20% vs baseline" },
  scale: { label: "Scale", pct: "25%", lift: "+10–19% lift" },
  optimize: { label: "Optimize", pct: "10%", lift: "0–9% performance" },
  validate: { label: "Validate", pct: "5%", lift: "New/unproven" },
  retire: { label: "Retire", pct: "0%", lift: "−20% or worse" },
};

// ─── Signal Quality ───────────────────────────────────────────────────

/**
 * Compute a signal quality score from raw campaign data.
 * Returns scores 0–100 per dimension and an overall composite.
 */
export function computeSignalQuality(params: {
  total_spend: number;
  total_conversions: number;
  num_creatives: number;
  tracking_events_matched_pct: number;
  date_range_days: number;
  has_capi: boolean;
  breakdown_coverage_pct: number;
  has_pixel_issues: boolean;
}): SignalQualityScore {
  const {
    total_spend,
    total_conversions,
    num_creatives,
    tracking_events_matched_pct,
    date_range_days,
    has_capi,
    breakdown_coverage_pct,
    has_pixel_issues,
  } = params;

  const tracking_confidence = has_pixel_issues
    ? Math.min(40, tracking_events_matched_pct * 40)
    : has_capi
    ? Math.min(100, tracking_events_matched_pct * 1.1)
    : Math.min(80, tracking_events_matched_pct);

  const conversion_volume_confidence = Math.min(
    100,
    (total_conversions / 100) * 60 + Math.min(40, total_conversions)
  );

  const spend_sufficiency = Math.min(100, (total_spend / 2000) * 100);

  const creative_diversity = Math.min(
    100,
    num_creatives >= 10 ? 90 : num_creatives >= 5 ? 70 : num_creatives >= 3 ? 50 : 30
  );

  const learning_stability = Math.min(
    100,
    date_range_days >= 28 ? 85 : date_range_days >= 14 ? 65 : date_range_days >= 7 ? 45 : 25
  );

  const funnel_consistency = total_conversions > 50 ? 80 : total_conversions > 20 ? 60 : 40;

  const segment_clarity = Math.min(100, breakdown_coverage_pct);

  const data_cleanliness = has_pixel_issues ? 35 : 85;

  const date_range_reliability =
    date_range_days >= 21
      ? 90
      : date_range_days >= 14
      ? 75
      : date_range_days >= 7
      ? 55
      : 30;

  const breakdown_usefulness = Math.min(100, breakdown_coverage_pct * 0.9);

  const dimensions = [
    tracking_confidence,
    conversion_volume_confidence,
    spend_sufficiency,
    creative_diversity,
    learning_stability,
    funnel_consistency,
    segment_clarity,
    data_cleanliness,
    date_range_reliability,
    breakdown_usefulness,
  ];

  const overall = Math.round(dimensions.reduce((a, b) => a + b, 0) / dimensions.length);

  return {
    tracking_confidence: Math.round(tracking_confidence),
    conversion_volume_confidence: Math.round(conversion_volume_confidence),
    spend_sufficiency: Math.round(spend_sufficiency),
    creative_diversity: Math.round(creative_diversity),
    learning_stability: Math.round(learning_stability),
    funnel_consistency: Math.round(funnel_consistency),
    segment_clarity: Math.round(segment_clarity),
    data_cleanliness: Math.round(data_cleanliness),
    date_range_reliability: Math.round(date_range_reliability),
    breakdown_usefulness: Math.round(breakdown_usefulness),
    overall,
  };
}

// ─── Label Helpers ────────────────────────────────────────────────────

export const TIER_LABELS: Record<PerformanceTier, { label: string; short: string; description: string }> = {
  1: { label: "Tier 1", short: "T1", description: "Scale Winners — high ROAS, strong buying intent, efficient acquisition" },
  2: { label: "Tier 2", short: "T2", description: "Optimize Candidates — high intent with bottleneck or solid performance with iteration potential" },
  3: { label: "Tier 3", short: "T3", description: "Test / Pivot — mixed signals, needs controlled retest" },
  4: { label: "Tier 4", short: "T4", description: "Eliminate — poor performance across multiple metrics, clear failure pattern" },
};

export const CONFIDENCE_LABELS: Record<ConfidenceLabel, { label: string; description: string }> = {
  high: { label: "High", description: ">100 conversions OR >$1,000 spend with a consistent pattern" },
  medium: { label: "Medium", description: "Directional, below high threshold" },
  validation_required: { label: "Validation Required", description: "Promising signal, insufficient spend or time" },
  insufficient: { label: "Insufficient", description: "Cannot support action" },
};

export const DECISION_TYPE_COLORS: Record<string, string> = {
  Scale: "text-metrix-success",
  Hold: "text-muted-foreground",
  Isolate: "text-metrix-cyan",
  Kill: "text-destructive",
  Rebuild: "text-metrix-gold",
  Retest: "text-primary",
  "Brief Next Sprint": "text-metrix-blue",
};

export function formatCurrency(usd: number): string {
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(1)}K`;
  return `$${usd.toFixed(0)}`;
}

export function formatROAS(roas: number): string {
  return `${roas.toFixed(2)}x`;
}

export function formatCPA(cpa: number): string {
  return `$${cpa.toFixed(2)}`;
}

export function formatPct(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

export function signalQualityGrade(score: number): { grade: string; color: string } {
  if (score >= 80) return { grade: "Strong", color: "text-metrix-success" };
  if (score >= 60) return { grade: "Good", color: "text-primary" };
  if (score >= 40) return { grade: "Moderate", color: "text-metrix-gold" };
  return { grade: "Weak", color: "text-destructive" };
}
