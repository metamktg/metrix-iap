// ─── Creative components: extract, merge, weight, and grade evidence ──
//
// The analysis run already captures, for every ad row, the copy Meta
// exports beside the metrics: body text (primary text), headline, call to
// action, link destination and link caption (description). It lands in
// `ad_performance.ad_creative_metadata` and, until this module, was read by
// nothing (register item F-a). This module turns it into something a reader
// can act on, and does so in a shape that does not care where the copy came
// from.
//
// Modular by design (owner brief, 2026-09-02): every creative input arrives
// as an `AdCreativeInput` carrying its `source`. Today the only producer is
// the performance export; uploaded assets and a Meta API read will be
// producers of the same shape. `mergeCreativeInputs` resolves one input per
// ad by source precedence, field by field, so a later, higher-fidelity
// source overrides only what it actually carries.
//
// Three outputs, all pure and unit-tested:
//
//   · weightCreativeComponents — for each family (headline, primary text,
//     description, CTA type) and each distinct value, the ads that carried
//     it, their spend, results, cost per result and link CTR, and a
//     `weight` in [0, 1] within the family. The weight is explainable:
//     result share × efficiency index, normalised to the family's best. It
//     is a ranking aid over the account's own results, not a model.
//   · creativeCoverage — how much of the account's spend ran on ads whose
//     copy is known. This is the "presence of granular breakdown data" the
//     confidence adjustment reads.
//   · confidenceScore — the analysis engine's volume-based confidence tier
//     (unchanged: spend and result thresholds) combined with the evidence
//     coverage into one numeric score. The categorical tier is NOT
//     re-labelled by evidence — sample size is sample size — but the score
//     and the `evidence_grade` beside it say how much of that sample the
//     engine can explain at the copy level.
//
// Honesty rules carried through: a component with no results has no cost
// per result (null, never 0); an ad with no copy is counted in the
// denominator of coverage, never dropped; the baseline used for the
// efficiency index is the covered set's own baseline, so an index of 1.0
// means "as efficient as the copy we can see", not a claim about ads whose
// copy is unknown.

export type CreativeInputSource = "performance_export" | "uploaded_asset" | "meta_api";

/**
 * Source precedence, highest first. An uploaded asset is what the client
 * actually ran; the API is Meta's record of it; the export is a projection
 * of that record. A field present in a higher source wins per field.
 */
export const SOURCE_PRECEDENCE: readonly CreativeInputSource[] = [
  "uploaded_asset",
  "meta_api",
  "performance_export",
];

export type CreativeComponentFamily = "headline" | "primary_text" | "description" | "cta_type";

export const COMPONENT_FAMILIES: readonly CreativeComponentFamily[] = [
  "headline",
  "primary_text",
  "description",
  "cta_type",
];

export interface AdCreativeInput {
  ad_name: string;
  meta_ad_id?: string | null;
  headline?: string | null;
  primary_text?: string | null;
  description?: string | null;
  cta_type?: string | null;
  link_destination?: string | null;
  image_name?: string | null;
  video_name?: string | null;
  source: CreativeInputSource;
}

export interface AdMetricInput {
  ad_name: string;
  meta_ad_id?: string | null;
  spend: number;
  results: number;
  impressions: number;
  link_clicks: number;
  result_type?: string | null;
}

/** The identity the engine keys creative metadata on: Meta ad id, else name. */
export function adKey(row: { ad_name: string; meta_ad_id?: string | null }): string {
  return row.meta_ad_id ? String(row.meta_ad_id) : row.ad_name;
}

// ─── Extraction from the export's metadata columns ─────────────────────

/** Canonical export columns → component fields (see iapCsvSpec CREATIVE_METADATA_COLUMNS). */
const METADATA_FIELD: Record<string, keyof Omit<AdCreativeInput, "ad_name" | "meta_ad_id" | "source">> = {
  "Ad creative body text": "primary_text",
  "Ad creative headline": "headline",
  "Ad creative link caption": "description",
  "Ad creative call to action type": "cta_type",
  "Ad creative link destination": "link_destination",
  "Image name": "image_name",
  "Video name": "video_name",
};

function clean(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s.length ? s : null;
}

/**
 * One export-sourced input from a stored `ad_creative_metadata` object.
 * Returns null when the object carries no component at all, so an ad with
 * an empty metadata blob is not mistaken for an ad with known copy.
 */
export function creativeInputFromMetadata(
  adName: string,
  metaAdId: string | null | undefined,
  metadata: Record<string, unknown> | null | undefined,
): AdCreativeInput | null {
  if (!metadata) return null;
  const out: AdCreativeInput = { ad_name: adName, meta_ad_id: metaAdId ?? null, source: "performance_export" };
  let any = false;
  for (const [col, field] of Object.entries(METADATA_FIELD)) {
    const v = clean(metadata[col]);
    if (v) {
      out[field] = v;
      any = true;
    }
  }
  return any ? out : null;
}

/** True when the input carries at least one weightable component. */
export function hasCopy(input: AdCreativeInput | null | undefined): boolean {
  return Boolean(input && COMPONENT_FAMILIES.some((f) => input[f]));
}

// ─── Merge across sources ──────────────────────────────────────────────

/**
 * One input per ad, fields resolved by source precedence. Inputs for the
 * same ad from a lower source fill only the fields a higher source left
 * empty. The resulting `source` is the highest source that contributed any
 * field, so a reader can see where the copy on screen actually came from.
 */
export function mergeCreativeInputs(...lists: AdCreativeInput[][]): Map<string, AdCreativeInput> {
  const rank = (s: CreativeInputSource) => SOURCE_PRECEDENCE.indexOf(s);
  const byAd = new Map<string, AdCreativeInput[]>();
  for (const list of lists) {
    for (const input of list) {
      const key = adKey(input);
      const arr = byAd.get(key) ?? [];
      arr.push(input);
      byAd.set(key, arr);
    }
  }
  const merged = new Map<string, AdCreativeInput>();
  for (const [key, inputs] of byAd) {
    const ordered = [...inputs].sort((a, b) => rank(a.source) - rank(b.source));
    const out: AdCreativeInput = { ad_name: ordered[0]!.ad_name, meta_ad_id: ordered[0]!.meta_ad_id ?? null, source: ordered[0]!.source };
    let contributing: CreativeInputSource | null = null;
    const fields = Object.values(METADATA_FIELD);
    for (const field of fields) {
      for (const input of ordered) {
        const v = clean(input[field]);
        if (v) {
          out[field] = v;
          if (contributing === null || rank(input.source) < rank(contributing)) contributing = input.source;
          break;
        }
      }
    }
    out.source = contributing ?? out.source;
    merged.set(key, out);
  }
  return merged;
}

// ─── Weighting ─────────────────────────────────────────────────────────

export type ConfidenceLevel = "high" | "medium" | "low" | "validation_required";

/**
 * The analysis engine's volume-based tier, unchanged and shared so the two
 * cannot drift: high ≥ $500 and ≥ 30 results; medium ≥ $100 and ≥ 5;
 * low: any spend with a result; otherwise validation required.
 */
export function volumeConfidence(spend: number, results: number): ConfidenceLevel {
  if (spend >= 500 && results >= 30) return "high";
  if (spend >= 100 && results >= 5) return "medium";
  if (spend > 0 && results >= 1) return "low";
  return "validation_required";
}

export interface ComponentWeight {
  family: CreativeComponentFamily;
  value: string;
  ads: number;
  ad_names: string[];
  spend: number;
  results: number;
  impressions: number;
  link_clicks: number;
  cost_per_result: number | null;
  ctr_link_pct: number | null;
  /** Share of the covered set's spend / results this value carried, 0..1. */
  spend_share: number;
  result_share: number;
  /** covered-set cost per result ÷ this value's cost per result; 1 = baseline; null without results. */
  efficiency_index: number | null;
  /** result_share × efficiency_index, normalised to the family's best → 0..1. */
  weight: number;
  rank: number;
  confidence: ConfidenceLevel;
  result_types: string[];
}

export interface CreativeCoverage {
  ads_total: number;
  ads_with_copy: number;
  spend_total: number;
  spend_with_copy: number;
  /** Spend-weighted share of the account whose copy is known, 0..1. */
  coverage: number;
  by_family: Record<CreativeComponentFamily, number>;
  sources: CreativeInputSource[];
}

export interface CreativeComponentWeighting {
  baseline: { spend: number; results: number; cost_per_result: number | null };
  families: Record<CreativeComponentFamily, ComponentWeight[]>;
  coverage: CreativeCoverage;
}

const round = (n: number, dp = 4) => Math.round(n * 10 ** dp) / 10 ** dp;

function normKey(v: string): string {
  return v.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Weight every distinct component value against the metrics of the ads that
 * carried it. Metrics are matched to inputs by `adKey`; an ad with metrics
 * and no input counts toward coverage's denominator only.
 */
export function weightCreativeComponents(
  inputs: Iterable<AdCreativeInput>,
  metrics: Iterable<AdMetricInput>,
): CreativeComponentWeighting {
  const inputByKey = new Map<string, AdCreativeInput>();
  for (const i of inputs) if (hasCopy(i)) inputByKey.set(adKey(i), i);

  // Fold metrics per ad first: the same ad appears once per day.
  const metricByKey = new Map<string, AdMetricInput & { result_types: Set<string> }>();
  for (const m of metrics) {
    const key = adKey(m);
    const cur = metricByKey.get(key) ?? {
      ad_name: m.ad_name, meta_ad_id: m.meta_ad_id ?? null,
      spend: 0, results: 0, impressions: 0, link_clicks: 0, result_type: null, result_types: new Set<string>(),
    };
    cur.spend += Number(m.spend) || 0;
    cur.results += Number(m.results) || 0;
    cur.impressions += Number(m.impressions) || 0;
    cur.link_clicks += Number(m.link_clicks) || 0;
    if (m.result_type) cur.result_types.add(m.result_type);
    metricByKey.set(key, cur);
  }

  const byFamily: Record<CreativeComponentFamily, number> = { headline: 0, primary_text: 0, description: 0, cta_type: 0 };
  const sources = new Set<CreativeInputSource>();
  let adsWithCopy = 0, spendWithCopy = 0, resultsWithCopy = 0, spendTotal = 0;
  for (const [key, m] of metricByKey) {
    spendTotal += m.spend;
    const input = inputByKey.get(key);
    if (!input) continue;
    adsWithCopy += 1;
    spendWithCopy += m.spend;
    resultsWithCopy += m.results;
    sources.add(input.source);
    for (const f of COMPONENT_FAMILIES) if (input[f]) byFamily[f] += 1;
  }
  const baselineCpr = resultsWithCopy > 0 ? spendWithCopy / resultsWithCopy : null;

  const families = {} as Record<CreativeComponentFamily, ComponentWeight[]>;
  for (const family of COMPONENT_FAMILIES) {
    const agg = new Map<string, ComponentWeight>();
    for (const [key, m] of metricByKey) {
      const input = inputByKey.get(key);
      const value = input?.[family];
      if (!value) continue;
      const k = normKey(value);
      const row = agg.get(k) ?? {
        family, value, ads: 0, ad_names: [], spend: 0, results: 0, impressions: 0, link_clicks: 0,
        cost_per_result: null, ctr_link_pct: null, spend_share: 0, result_share: 0,
        efficiency_index: null, weight: 0, rank: 0, confidence: "validation_required", result_types: [],
      };
      row.ads += 1;
      row.ad_names.push(m.ad_name);
      row.spend += m.spend;
      row.results += m.results;
      row.impressions += m.impressions;
      row.link_clicks += m.link_clicks;
      for (const rt of m.result_types) if (!row.result_types.includes(rt)) row.result_types.push(rt);
      agg.set(k, row);
    }
    const rows = [...agg.values()];
    let maxRaw = 0;
    const raws = new Map<ComponentWeight, number>();
    for (const r of rows) {
      r.cost_per_result = r.results > 0 ? round(r.spend / r.results) : null;
      r.ctr_link_pct = r.impressions > 0 ? round((r.link_clicks / r.impressions) * 100) : null;
      r.spend_share = spendWithCopy > 0 ? round(r.spend / spendWithCopy) : 0;
      r.result_share = resultsWithCopy > 0 ? round(r.results / resultsWithCopy) : 0;
      r.efficiency_index =
        baselineCpr !== null && r.cost_per_result !== null && r.cost_per_result > 0
          ? round(baselineCpr / r.cost_per_result)
          : null;
      r.confidence = volumeConfidence(r.spend, r.results);
      const raw = r.efficiency_index !== null ? r.result_share * r.efficiency_index : 0;
      raws.set(r, raw);
      if (raw > maxRaw) maxRaw = raw;
    }
    for (const r of rows) {
      r.weight = maxRaw > 0 ? round((raws.get(r) ?? 0) / maxRaw) : 0;
      r.spend = round(r.spend, 2);
    }
    rows.sort((a, b) => b.weight - a.weight || b.spend - a.spend || a.value.localeCompare(b.value));
    rows.forEach((r, i) => { r.rank = i + 1; });
    families[family] = rows;
  }

  return {
    baseline: { spend: round(spendWithCopy, 2), results: round(resultsWithCopy, 2), cost_per_result: baselineCpr === null ? null : round(baselineCpr) },
    families,
    coverage: {
      ads_total: metricByKey.size,
      ads_with_copy: adsWithCopy,
      spend_total: round(spendTotal, 2),
      spend_with_copy: round(spendWithCopy, 2),
      coverage: spendTotal > 0 ? round(spendWithCopy / spendTotal) : 0,
      by_family: byFamily,
      sources: SOURCE_PRECEDENCE.filter((s) => sources.has(s)),
    },
  };
}

// ─── Evidence grade and confidence score ───────────────────────────────

export type EvidenceGrade = "full" | "partial" | "none";

/** ≥ 80% of spend with known copy is full evidence; any is partial; none is none. */
export function evidenceGrade(coverage: number): EvidenceGrade {
  if (coverage >= 0.8) return "full";
  if (coverage > 0) return "partial";
  return "none";
}

const VOLUME_SCORE: Record<ConfidenceLevel, number> = {
  high: 1.0,
  medium: 0.7,
  low: 0.4,
  validation_required: 0.1,
};

/** Weight of the evidence term: a tier with no copy coverage keeps 70% of its score. */
export const EVIDENCE_FLOOR = 0.7;

/**
 * One number, 0..1: the volume tier's score scaled by how much of the
 * concept's spend the engine can explain at the copy level. Full coverage
 * returns the tier's own score; no coverage returns 70% of it. The tier
 * label itself is left alone — see the module header for why.
 */
export function confidenceScore(level: ConfidenceLevel, coverage: number): number {
  const c = Math.min(1, Math.max(0, Number.isFinite(coverage) ? coverage : 0));
  return round(VOLUME_SCORE[level] * (EVIDENCE_FLOOR + (1 - EVIDENCE_FLOOR) * c), 3);
}
