// IAP deconstruction integration — variable evidence and per-segment
// performance without spend duplication.
//
// A deconstructed variable reaches performance through the ads that carry
// it: filed deconstructions → mapped ad names → every ad instance of that
// name (ad_context, unless a delivered media breakdown names the same
// asset: direct_asset); ad-name tokens → their own ad (ad_context).
// Evidence is a many-to-many relationship table; performance is aggregated
// over the set of UNIQUE (ad, segment) observations, so an ad that carries
// a variable through three assets contributes once, and the sum of
// variable-level spend is never presented as account spend.
// docs/specs/iap-multi-report-reconciliation.md §11, §12.

import type { AssetType } from "./iapCsvSpec";
import type { AdIdentity, AdIdentityKind } from "./reportGrain";
import { normalizeAssetValue } from "./reportGrain";
import { type CreativeAssetRecord, assetKey } from "./creativeAssets";
import {
  type Breakdown,
  type EvidenceState,
  type Observation,
  type SegmentDims,
  type VolumeConfidence,
  identityKey,
  confidenceLevel,
  interactionIndex,
  round2,
} from "./reconciliation";

export type EvidenceSourceKind = "deconstruction" | "ad_name_token" | "copy_component";
export type EvidenceRelationship = "direct_asset" | "ad_context";

export interface DeconstructionInput {
  id: string;
  manual_import_id: string;
  filename: string;
  status: string;
  ad_names: string[];
  variables: { family: string; code: string; confidence?: number | null }[];
}

export interface VariableEvidenceRow {
  variable_family: string;
  variable_id: string;
  source_kind: EvidenceSourceKind;
  source_ref: string;
  asset_key: string | null;
  ad_identity_kind: AdIdentityKind;
  ad_identity: string;
  meta_ad_id: string | null;
  ad_name: string;
  relationship: EvidenceRelationship;
  confidence: number | null;
}

const FILED_STATUSES = new Set(["auto_filed", "user_overridden"]);

/** Media file names normalised the same way delivered media assets are, so "C8A_Hero.PNG" meets "c8a_hero.png". */
function mediaKey(type: AssetType, value: string): string {
  return normalizeAssetValue(type, value.replace(/\.[a-z0-9]+$/i, ""));
}

export function evidenceKey(e: VariableEvidenceRow): string {
  return [e.variable_family, e.variable_id, e.source_kind, e.source_ref, e.ad_identity_kind, e.ad_identity, e.asset_key ?? ""].join("");
}

/**
 * Builds the evidence relationships. `instancesByName` is the account's ad
 * registry (name → every Meta ad id observed); a name unknown to it yields a
 * NAME-grain relationship rather than nothing, so the variable still reaches
 * name-keyed rows.
 */
export function buildVariableEvidence(args: {
  deconstructions: readonly DeconstructionInput[];
  instancesByName: ReadonlyMap<string, readonly string[]>;
  adNameTokens?: readonly { identity: AdIdentity; tokens: readonly { family: string; id: string }[] }[];
  deliveredAssets?: readonly CreativeAssetRecord[];
}): VariableEvidenceRow[] {
  const out = new Map<string, VariableEvidenceRow>();
  const push = (row: VariableEvidenceRow): void => {
    const k = evidenceKey(row);
    if (!out.has(k)) out.set(k, row);
  };

  // Delivered media by (ad identity → normalised media name → asset key).
  const mediaByAd = new Map<string, Map<string, string>>();
  for (const a of args.deliveredAssets ?? []) {
    if (a.asset_type !== "image" && a.asset_type !== "video" && a.asset_type !== "media") continue;
    const adKey = `${a.ad_identity_kind}:${a.ad_identity}`;
    const m = mediaByAd.get(adKey) ?? new Map<string, string>();
    m.set(mediaKey(a.asset_type, a.raw_value), assetKey(a));
    mediaByAd.set(adKey, m);
  }

  for (const d of args.deconstructions) {
    if (!FILED_STATUSES.has(d.status) || d.variables.length === 0) continue;
    const fileKey = mediaKey("media", d.filename);
    for (const adName of d.ad_names) {
      const ids = args.instancesByName.get(adName) ?? [];
      const identities: AdIdentity[] =
        ids.length > 0
          ? ids.map((id) => ({ kind: "ad_id", key: id, ad_name: adName, meta_ad_id: id }))
          : [{ kind: "ad_name", key: adName, ad_name: adName, meta_ad_id: null }];
      for (const identity of identities) {
        const media = mediaByAd.get(identityKey(identity));
        const directAssetKey = media?.get(fileKey) ?? null;
        for (const v of d.variables) {
          push({
            variable_family: v.family,
            variable_id: v.code,
            source_kind: "deconstruction",
            source_ref: d.id,
            asset_key: directAssetKey,
            ad_identity_kind: identity.kind,
            ad_identity: identity.key,
            meta_ad_id: identity.meta_ad_id,
            ad_name: identity.ad_name,
            relationship: directAssetKey ? "direct_asset" : "ad_context",
            confidence: v.confidence ?? null,
          });
        }
      }
    }
  }

  for (const { identity, tokens } of args.adNameTokens ?? []) {
    for (const t of tokens) {
      push({
        variable_family: t.family,
        variable_id: t.id,
        source_kind: "ad_name_token",
        source_ref: identity.ad_name,
        asset_key: null,
        ad_identity_kind: identity.kind,
        ad_identity: identity.key,
        meta_ad_id: identity.meta_ad_id,
        ad_name: identity.ad_name,
        relationship: "ad_context",
        confidence: null,
      });
    }
  }
  return [...out.values()];
}

// ─── Variable × segment performance ────────────────────────────────────────

export interface AdTotals {
  identity: AdIdentity;
  metrics: Record<string, number>;
  result_type: string;
  /** Spend coverage of this ad in the demographic breakdown, when reconciled. */
  coverage_pct: number | null;
}

export interface VariableSegmentRow {
  variable_family: string;
  variable_id: string;
  breakdown: "all" | Breakdown;
  segment: SegmentDims;
  segment_key: string;
  result_type: string;
  contributing_ad_ids: string[];
  contributing_asset_keys: string[];
  direct_totals: Record<string, number>;
  contextual_totals: Record<string, number>;
  observed_coverage_pct: number | null;
  modelled_share: number;
  result_volume: number;
  cost_per_result: number | null;
  raw_rate: number | null;
  adjusted_rate: number | null;
  interaction_index: number | null;
  contributing_ads: number;
  evidence_state: EvidenceState;
  confidence: VolumeConfidence;
}

const WORST_ORDER: EvidenceState[] = ["incompatible", "unreconciled", "overcounted", "observed_partial", "observed_reconciled", "direct_joint", "direct_asset", "ad_context"];
function worstOf(states: Iterable<EvidenceState>): EvidenceState {
  let worst = -1;
  for (const s of states) {
    const i = WORST_ORDER.indexOf(s);
    if (i >= 0 && (worst === -1 || i < worst)) worst = i;
  }
  return worst === -1 ? "unreconciled" : WORST_ORDER[worst]!;
}

function addMetrics(into: Record<string, number>, from: Record<string, number>): void {
  for (const [k, v] of Object.entries(from)) into[k] = (into[k] ?? 0) + v;
}

/**
 * Per variable: an `all` row from the contributing ads' own totals, and one
 * row per segment (demographic, placement) from the unique (ad, segment)
 * observations of those ads. Direct totals come only through `direct_asset`
 * relationships (the matching asset observations); everything else is
 * contextual. Rates from sums; the interaction index compares the variable's
 * segment cell with segment × variable baselines over the whole account.
 */
export function buildVariableSegmentPerformance(args: {
  evidence: readonly VariableEvidenceRow[];
  observations: readonly Observation[];
  adTotals: ReadonlyMap<string, AdTotals>;
  breakdowns?: readonly Breakdown[];
}): VariableSegmentRow[] {
  const breakdowns = args.breakdowns ?? ["demographic", "placement"];
  const byVariable = new Map<string, VariableEvidenceRow[]>();
  for (const e of args.evidence) {
    const k = `${e.variable_family}${""}${e.variable_id}`;
    (byVariable.get(k) ?? byVariable.set(k, []).get(k)!).push(e);
  }

  // Account baselines per (breakdown, segment, result type) and overall.
  const segmentBaseline = new Map<string, { results: number; impressions: number }>();
  const overall = { results: 0, impressions: 0 };
  const obsByAd = new Map<string, Observation[]>();
  for (const o of args.observations) {
    if (!breakdowns.includes(o.breakdown)) continue;
    const k = identityKey(o.identity);
    (obsByAd.get(k) ?? obsByAd.set(k, []).get(k)!).push(o);
    const sk = [o.breakdown, o.segment_key, o.result_type].join("");
    const b = segmentBaseline.get(sk) ?? { results: 0, impressions: 0 };
    b.results += o.metrics["results"] ?? 0;
    b.impressions += o.metrics["impressions"] ?? 0;
    segmentBaseline.set(sk, b);
  }
  for (const t of args.adTotals.values()) {
    overall.results += t.metrics["results"] ?? 0;
    overall.impressions += t.metrics["impressions"] ?? 0;
  }

  const out: VariableSegmentRow[] = [];
  for (const rows of byVariable.values()) {
    const first = rows[0]!;
    const adKeys = [...new Set(rows.map((e) => `${e.ad_identity_kind}:${e.ad_identity}`))];
    const directAds = new Set(rows.filter((e) => e.relationship === "direct_asset").map((e) => `${e.ad_identity_kind}:${e.ad_identity}`));
    const assetKeys = [...new Set(rows.map((e) => e.asset_key).filter((k): k is string => Boolean(k)))];

    // `all` — from the ads' own totals, grouped by result type.
    const allByType = new Map<string, { direct: Record<string, number>; contextual: Record<string, number>; ads: Set<string>; coverage: { obs: number; truth: number }; states: EvidenceState[] }>();
    for (const k of adKeys) {
      const t = args.adTotals.get(k);
      if (!t) continue;
      const g = allByType.get(t.result_type) ?? { direct: {}, contextual: {}, ads: new Set<string>(), coverage: { obs: 0, truth: 0 }, states: [] };
      addMetrics(directAds.has(k) ? g.direct : g.contextual, t.metrics);
      g.ads.add(k);
      if (t.coverage_pct !== null) {
        g.coverage.obs += (t.metrics["amount_spent"] ?? 0) * (t.coverage_pct / 100);
        g.coverage.truth += t.metrics["amount_spent"] ?? 0;
      }
      g.states.push(directAds.has(k) ? "direct_asset" : "ad_context");
      allByType.set(t.result_type, g);
    }
    for (const [resultType, g] of allByType) {
      const totals = { ...g.direct };
      addMetrics(totals, g.contextual);
      const spend = totals["amount_spent"] ?? 0;
      const results = totals["results"] ?? 0;
      out.push({
        variable_family: first.variable_family,
        variable_id: first.variable_id,
        breakdown: "all",
        segment: {},
        segment_key: "",
        result_type: resultType,
        contributing_ad_ids: [...g.ads].map((k) => k.split(":").slice(1).join(":")),
        contributing_asset_keys: assetKeys,
        direct_totals: g.direct,
        contextual_totals: g.contextual,
        observed_coverage_pct: g.coverage.truth > 0 ? round2((g.coverage.obs / g.coverage.truth) * 100) : null,
        modelled_share: 0,
        result_volume: results,
        cost_per_result: results > 0 ? round2(spend / results) : null,
        raw_rate: null,
        adjusted_rate: null,
        interaction_index: null,
        contributing_ads: g.ads.size,
        evidence_state: worstOf(g.states),
        confidence: confidenceLevel(spend, results, totals["impressions"] ?? null),
      });
    }

    // Segments — unique (ad, segment) observations across the contributing ads.
    const bySegment = new Map<string, { breakdown: Breakdown; segment: SegmentDims; segment_key: string; result_type: string; direct: Record<string, number>; contextual: Record<string, number>; ads: Set<string>; states: EvidenceState[]; obsSpend: number; truthSpend: number }>();
    for (const k of adKeys) {
      for (const o of obsByAd.get(k) ?? []) {
        const sk = [o.breakdown, o.segment_key, o.result_type].join("");
        const g = bySegment.get(sk) ?? { breakdown: o.breakdown, segment: o.segment, segment_key: o.segment_key, result_type: o.result_type, direct: {}, contextual: {}, ads: new Set<string>(), states: [], obsSpend: 0, truthSpend: 0 };
        addMetrics(directAds.has(k) ? g.direct : g.contextual, o.metrics);
        g.ads.add(k);
        g.states.push(o.evidence_state);
        if (o.coverage_pct !== null && o.coverage_pct > 0) {
          const spend = o.metrics["amount_spent"] ?? 0;
          g.obsSpend += spend;
          g.truthSpend += spend / (o.coverage_pct / 100);
        }
        bySegment.set(sk, g);
      }
    }
    // Variable baseline per result type (for the interaction index).
    for (const g of bySegment.values()) {
      const totals = { ...g.direct };
      addMetrics(totals, g.contextual);
      const spend = totals["amount_spent"] ?? 0;
      const results = totals["results"] ?? 0;
      const impressions = totals["impressions"] ?? 0;
      const variableAll = allByType.get(g.result_type);
      const variableTotals = variableAll ? (() => { const t = { ...variableAll.direct }; addMetrics(t, variableAll.contextual); return t; })() : null;
      const seg = segmentBaseline.get([g.breakdown, g.segment_key, g.result_type].join(""));
      const ix =
        variableTotals && seg
          ? interactionIndex({
              joint: { numerator: results, denominator: impressions },
              segment: { numerator: seg.results, denominator: seg.impressions },
              asset: { numerator: variableTotals["results"] ?? 0, denominator: variableTotals["impressions"] ?? 0 },
              overall: { numerator: overall.results, denominator: overall.impressions },
            })
          : null;
      out.push({
        variable_family: first.variable_family,
        variable_id: first.variable_id,
        breakdown: g.breakdown,
        segment: g.segment,
        segment_key: g.segment_key,
        result_type: g.result_type,
        contributing_ad_ids: [...g.ads].map((k) => k.split(":").slice(1).join(":")),
        contributing_asset_keys: assetKeys,
        direct_totals: g.direct,
        contextual_totals: g.contextual,
        observed_coverage_pct: g.truthSpend > 0 ? round2((g.obsSpend / g.truthSpend) * 100) : null,
        modelled_share: 0,
        result_volume: results,
        cost_per_result: results > 0 ? round2(spend / results) : null,
        raw_rate: ix?.raw_rate ?? null,
        adjusted_rate: ix?.adjusted_rate ?? null,
        interaction_index: ix ? round2(ix.adjusted_index * 100) / 100 : null,
        contributing_ads: g.ads.size,
        evidence_state: worstOf(g.states),
        confidence: confidenceLevel(spend, results, totals["impressions"] ?? null),
      });
    }
  }
  return out;
}
