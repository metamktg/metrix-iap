// ─── Creative evidence — joins through mapped Ad IDs first ──────────────
// docs/specs/iap-multi-report-reconciliation.md §14, §15.
//
// A creative reaches its evidence through the ads that carry it: the ads
// registry rows whose `cell` is the creative's cell code, else the rows whose
// name is in the MST cell's `mapped_ad_names`; each ad row lists EVERY Meta
// ad instance under its name (`meta_ad_ids` — 19 names cover 44 Ad IDs on
// the validated account), and the ad-grain breakdown rows are keyed by that
// identity. Cell codes are the secondary path; nothing here joins by cell
// id alone. Pure — unit-tested without React.

import type {
  AdBreakdownRow,
  AdRecord,
  BreakdownKind,
  CellPerformanceRow,
  CreativeAssetRow,
  EvidenceState,
  LedgerRow,
  VariableEvidenceRow,
  VariableSegmentRow,
} from "@/lib/data/seedTypes";

export interface CreativeAdIdentity {
  adIds: string[];
  adNames: string[];
  via: "cell" | "mapped_names" | "none";
  ads: AdRecord[];
}

/** The ads a creative resolves to: cell code first, mapped names second. */
export function adIdentityForCreative(
  ads: readonly AdRecord[] | undefined,
  cellId: string | null | undefined,
  mappedAdNames?: readonly string[] | null,
): CreativeAdIdentity {
  const all = ads ?? [];
  let matches = cellId ? all.filter((a) => a.cell === cellId && !a.ad_name.startsWith("__cell_override_")) : [];
  let via: CreativeAdIdentity["via"] = matches.length > 0 ? "cell" : "none";
  if (matches.length === 0 && mappedAdNames && mappedAdNames.length > 0) {
    const names = new Set(mappedAdNames);
    matches = all.filter((a) => names.has(a.ad_name));
    via = matches.length > 0 ? "mapped_names" : "none";
  }
  const adIds = new Set<string>();
  const adNames = new Set<string>();
  for (const a of matches) {
    adNames.add(a.ad_name);
    for (const id of a.meta_ad_ids ?? (a.meta_ad_id ? [a.meta_ad_id] : [])) adIds.add(id);
  }
  return { adIds: [...adIds], adNames: [...adNames], via, ads: matches };
}

/** Rows of one breakdown that belong to the creative's ads (Ad ID first, name second). */
export function breakdownRowsFor(
  rows: readonly AdBreakdownRow[] | undefined,
  breakdown: BreakdownKind,
  identity: Pick<CreativeAdIdentity, "adIds" | "adNames">,
): AdBreakdownRow[] {
  if (!rows || (identity.adIds.length === 0 && identity.adNames.length === 0)) return [];
  const ids = new Set(identity.adIds);
  const names = new Set(identity.adNames);
  return rows.filter(
    (r) =>
      r.breakdown === breakdown &&
      ((r.ad_identity_kind === "ad_id" && ids.has(r.ad_identity)) || (r.ad_identity_kind === "ad_name" && names.has(r.ad_identity))),
  );
}

// ─── Evidence summary ───────────────────────────────────────────────────

const STATE_RANK: EvidenceState[] = [
  "incompatible",
  "unreconciled",
  "overcounted",
  "modelled",
  "observed_partial",
  "ad_context",
  "observed_reconciled",
  "direct_joint",
  "direct_asset",
  "unavailable",
];

/** The weakest state in a set — what a summary chip must show. */
export function worstEvidenceState(states: Iterable<EvidenceState>): EvidenceState | null {
  let worst = -1;
  for (const s of states) {
    const i = STATE_RANK.indexOf(s);
    if (i >= 0 && (worst === -1 || i < worst)) worst = i;
  }
  return worst === -1 ? null : STATE_RANK[worst]!;
}

export interface EvidenceSummary {
  state: EvidenceState | null;
  /** Spend-weighted coverage across the rows; null when no row carries a per-ad control. */
  coverage_pct: number | null;
  rows: number;
  ads: number;
}

export function evidenceSummaryFor(rows: readonly AdBreakdownRow[]): EvidenceSummary {
  let observed = 0;
  let truth = 0;
  const ads = new Set<string>();
  for (const r of rows) {
    ads.add(`${r.ad_identity_kind}:${r.ad_identity}`);
    if (r.coverage_pct !== null && r.coverage_pct > 0 && r.spend !== null) {
      observed += r.spend;
      truth += r.spend / (r.coverage_pct / 100);
    }
  }
  return {
    state: worstEvidenceState(rows.map((r) => r.evidence_state)),
    coverage_pct: truth > 0 ? Math.round((observed / truth) * 100) / 1 : null,
    rows: rows.length,
    ads: ads.size,
  };
}

export const EVIDENCE_LABEL: Record<EvidenceState, string> = {
  direct_asset: "Direct · asset",
  direct_joint: "Direct · joint",
  ad_context: "Ad context",
  observed_reconciled: "Reconciled",
  observed_partial: "Partial",
  modelled: "Modelled",
  overcounted: "Over-counted",
  unreconciled: "Unreconciled",
  incompatible: "Incompatible",
  unavailable: "Unavailable",
};

export const EVIDENCE_MEANING: Record<EvidenceState, string> = {
  direct_asset: "Meta broke this metric down for this specific asset instance.",
  direct_joint: "Meta observed this segment × asset cell directly.",
  ad_context: "The ad's own performance, attached to a component the ad carries. It is not attributable to that component alone.",
  observed_reconciled: "The breakdown's rows reconcile to the control source within 1%.",
  observed_partial: "The breakdown's rows cover less than 99% of the control source. The remainder is unattributed by this breakdown, never allocated.",
  modelled: "Reconstructed by the balancing tier from trusted margins. Never presented as observed.",
  overcounted: "The breakdown's rows exceed the control source by more than 1% — a duplicate or overlapping export is the usual cause.",
  unreconciled: "No compatible control source at this scope. Stage an Ad Summary export with the Ad ID column to reconcile.",
  incompatible: "The report failed a compatibility check (currency, account or period) against the control source and was not blended.",
  unavailable: "This metric cannot exist at this grain — reach and unique counts are valid only where Meta returned them.",
};

export type EvidenceTone = "success" | "warning" | "danger" | "muted" | "primary";

export function evidenceTone(state: EvidenceState | null): EvidenceTone {
  switch (state) {
    case "observed_reconciled":
      return "success";
    case "direct_asset":
    case "direct_joint":
      return "primary";
    case "observed_partial":
    case "modelled":
      return "warning";
    case "overcounted":
    case "incompatible":
      return "danger";
    default:
      return "muted";
  }
}

// ─── Demographic grid ───────────────────────────────────────────────────

export type DemographicMeasure = "spend" | "cost_per_result" | "results";

export interface SegmentTotals {
  age: string;
  gender: string;
  spend: number;
  impressions: number;
  link_clicks: number;
  results: number;
  reach: number | null;
  reach_exact: boolean;
  evidence_state: EvidenceState;
  coverage_pct: number | null;
  ads: number;
}

const AGE_ORDER = (a: string): number => parseInt(a, 10) || 999;

export interface DemographicGrid {
  ages: string[];
  genders: string[];
  segments: SegmentTotals[];
  /** Unattributed spend (Σ truth − Σ observed) when every row carries a per-ad control; null otherwise. */
  unattributed_spend: number | null;
}

/** Sums the creative's demographic rows into an age × gender grid. Rates come from the sums. */
export function demographicGridFor(rows: readonly AdBreakdownRow[]): DemographicGrid {
  const by = new Map<string, SegmentTotals & { states: EvidenceState[]; adKeys: Set<string>; obs: number; truth: number }>();
  let truthAll = 0;
  let observedAll = 0;
  let allCovered = rows.length > 0;
  for (const r of rows) {
    const age = r.segment.age ?? "unknown";
    const gender = r.segment.gender ?? "unknown";
    const k = `${age}${gender}`;
    const cur =
      by.get(k) ??
      ({
        age,
        gender,
        spend: 0,
        impressions: 0,
        link_clicks: 0,
        results: 0,
        reach: null,
        reach_exact: false,
        evidence_state: "unreconciled",
        coverage_pct: null,
        ads: 0,
        states: [],
        adKeys: new Set<string>(),
        obs: 0,
        truth: 0,
      } as SegmentTotals & { states: EvidenceState[]; adKeys: Set<string>; obs: number; truth: number });
    cur.spend += r.spend ?? 0;
    cur.impressions += r.impressions ?? 0;
    cur.link_clicks += r.link_clicks ?? 0;
    cur.results += r.results ?? 0;
    cur.states.push(r.evidence_state);
    cur.adKeys.add(`${r.ad_identity_kind}:${r.ad_identity}`);
    if (r.coverage_pct !== null && r.coverage_pct > 0 && r.spend !== null) {
      cur.obs += r.spend;
      cur.truth += r.spend / (r.coverage_pct / 100);
      truthAll += r.spend / (r.coverage_pct / 100);
      observedAll += r.spend;
    } else {
      allCovered = false;
    }
    by.set(k, cur);
  }
  const segments: SegmentTotals[] = [...by.values()].map((s) => ({
    age: s.age,
    gender: s.gender,
    spend: s.spend,
    impressions: s.impressions,
    link_clicks: s.link_clicks,
    results: s.results,
    // Reach is never summed: a segment keeps it only when exactly one exact-grain row fed it.
    reach: s.adKeys.size === 1 && rows.filter((r) => (r.segment.age ?? "unknown") === s.age && (r.segment.gender ?? "unknown") === s.gender).every((r) => r.reach_basis === "exact") ? rows.find((r) => (r.segment.age ?? "unknown") === s.age && (r.segment.gender ?? "unknown") === s.gender)?.reach ?? null : null,
    reach_exact: false,
    evidence_state: worstEvidenceState(s.states) ?? "unreconciled",
    coverage_pct: s.truth > 0 ? Math.round((s.obs / s.truth) * 100) : null,
    ads: s.adKeys.size,
  }));
  for (const s of segments) s.reach_exact = s.reach !== null;
  const ages = [...new Set(segments.map((s) => s.age))].sort((a, b) => AGE_ORDER(a) - AGE_ORDER(b));
  const genders = [...new Set(segments.map((s) => s.gender))].sort();
  return {
    ages,
    genders,
    segments: segments.sort((a, b) => AGE_ORDER(a.age) - AGE_ORDER(b.age) || a.gender.localeCompare(b.gender)),
    unattributed_spend: allCovered && truthAll > 0 ? Math.max(0, Math.round((truthAll - observedAll) * 100) / 100) : null,
  };
}

export function measureValue(s: Pick<SegmentTotals, "spend" | "results">, measure: DemographicMeasure): number | null {
  if (measure === "spend") return s.spend;
  if (measure === "results") return s.results;
  return s.results > 0 ? s.spend / s.results : null;
}

// ─── Placement drill ────────────────────────────────────────────────────

export interface PlacementNode {
  key: string;
  label: string;
  spend: number;
  impressions: number;
  link_clicks: number;
  results: number;
  evidence_state: EvidenceState;
  children: PlacementNode[];
}

/** platform → placement → device tree with sums at every level. */
export function placementTreeFor(rows: readonly AdBreakdownRow[]): PlacementNode[] {
  const roots = new Map<string, PlacementNode & { states: EvidenceState[] }>();
  const node = (key: string, label: string): PlacementNode & { states: EvidenceState[] } => ({
    key,
    label,
    spend: 0,
    impressions: 0,
    link_clicks: 0,
    results: 0,
    evidence_state: "unreconciled",
    children: [],
    states: [],
  });
  const add = (n: PlacementNode & { states: EvidenceState[] }, r: AdBreakdownRow): void => {
    n.spend += r.spend ?? 0;
    n.impressions += r.impressions ?? 0;
    n.link_clicks += r.link_clicks ?? 0;
    n.results += r.results ?? 0;
    n.states.push(r.evidence_state);
  };
  for (const r of rows) {
    const platform = r.segment.platform ?? "unknown";
    const placement = r.segment.placement ?? "unknown";
    const device = r.segment.device ?? "unknown";
    const p = roots.get(platform) ?? node(platform, platform);
    roots.set(platform, p);
    add(p, r);
    let pl = p.children.find((c) => c.key === `${platform}/${placement}`) as (PlacementNode & { states: EvidenceState[] }) | undefined;
    if (!pl) {
      pl = node(`${platform}/${placement}`, placement);
      p.children.push(pl);
    }
    add(pl, r);
    let d = pl.children.find((c) => c.key === `${platform}/${placement}/${device}`) as (PlacementNode & { states: EvidenceState[] }) | undefined;
    if (!d) {
      d = node(`${platform}/${placement}/${device}`, device);
      pl.children.push(d);
    }
    add(d, r);
  }
  const finish = (n: PlacementNode & { states: EvidenceState[] }): PlacementNode => ({
    key: n.key,
    label: n.label,
    spend: n.spend,
    impressions: n.impressions,
    link_clicks: n.link_clicks,
    results: n.results,
    evidence_state: worstEvidenceState(n.states) ?? "unreconciled",
    children: (n.children as (PlacementNode & { states: EvidenceState[] })[]).map(finish).sort((a, b) => b.spend - a.spend),
  });
  return [...roots.values()].map(finish).sort((a, b) => b.spend - a.spend);
}

// ─── Funnel through mapped Ad IDs ──────────────────────────────────────

/**
 * Builds the creative's funnel row from the ad-level control (the ledger's
 * per-ad truth, i.e. the Ad Summary) for its mapped Ad IDs, falling back to
 * the ads registry's own per-ad totals. Ad ID first, cell second (the
 * caller passes a per-cell row when one exists and this is not used).
 */
export function funnelRowFromAds(
  identity: CreativeAdIdentity,
  ledger: readonly LedgerRow[] | undefined,
  cellId: string,
): { row: CellPerformanceRow; evidence_state: EvidenceState; source: "ad_summary" | "ad_totals" } | null {
  if (identity.adIds.length === 0 && identity.adNames.length === 0) return null;
  const ids = new Set(identity.adIds);
  const names = new Set(identity.adNames);
  const truthRows = (ledger ?? []).filter(
    (r) =>
      r.scope === "ad" &&
      r.report_class === "demographic" &&
      r.truth_value !== null &&
      ((r.ad_identity_kind === "ad_id" && ids.has(r.ad_identity)) || (r.ad_identity_kind === "ad_name" && names.has(r.ad_identity))),
  );
  const sum = (metric: string): number | null => {
    const rows = truthRows.filter((r) => r.metric === metric);
    return rows.length === 0 ? null : rows.reduce((s, r) => s + (r.truth_value ?? 0), 0);
  };
  const spendTruth = sum("amount_spent");
  let spend: number;
  let impressions: number;
  let results: number;
  let linkClicks: number;
  let clicksAll: number;
  let resultType: string;
  let source: "ad_summary" | "ad_totals";
  if (spendTruth !== null) {
    spend = spendTruth;
    impressions = sum("impressions") ?? 0;
    results = sum("results") ?? 0;
    linkClicks = sum("link_clicks") ?? 0;
    clicksAll = sum("clicks_all") ?? 0;
    resultType = identity.ads.find((a) => a.performance?.result_type)?.performance?.result_type ?? "";
    source = "ad_summary";
  } else {
    const perf = identity.ads.map((a) => a.performance).filter((p): p is NonNullable<AdRecord["performance"]> => Boolean(p));
    if (perf.length === 0) return null;
    spend = perf.reduce((s, p) => s + p.spend, 0);
    impressions = perf.reduce((s, p) => s + p.impressions, 0);
    results = perf.reduce((s, p) => s + p.results, 0);
    linkClicks = perf.reduce((s, p) => s + p.link_clicks, 0);
    clicksAll = 0;
    resultType = perf.find((p) => p.result_type)?.result_type ?? "";
    source = "ad_totals";
  }
  const atc = sum("adds_to_cart");
  const checkouts = sum("checkouts_initiated");
  const purchases = sum("purchases");
  const row: CellPerformanceRow = {
    cell_id: cellId,
    "Result type": resultType,
    "Amount spent (USD)": spend,
    Reach: 0,
    Impressions: impressions,
    Results: results,
    "Clicks (all)": clicksAll,
    "Link clicks": linkClicks,
    CPA_result: results > 0 ? spend / results : null,
    CTR_link_pct: impressions > 0 ? (linkClicks / impressions) * 100 : 0,
    Result_per_link_click_pct: linkClicks > 0 ? (results / linkClicks) * 100 : 0,
    book2_concept_name: "",
    ...(atc !== null ? { adds_to_cart: atc } : {}),
    ...(checkouts !== null ? { checkouts_initiated: checkouts } : {}),
    ...(purchases !== null ? { purchases } : {}),
  };
  return { row, evidence_state: source === "ad_summary" ? "observed_reconciled" : "ad_context", source };
}

// ─── Reconciliation table ───────────────────────────────────────────────

export interface ReconciliationAdRow {
  ad_identity: string;
  ad_name: string | null;
  meta_ad_id: string | null;
  truth_value: number | null;
  observed_value: number;
  coverage_pct: number | null;
  residual: number | null;
  evidence_state: EvidenceState;
  failure: string | null;
}

export function reconciliationRowsFor(
  ledger: readonly LedgerRow[] | undefined,
  breakdown: BreakdownKind,
  metric: string,
): { account: LedgerRow | null; ads: ReconciliationAdRow[] } {
  const rows = (ledger ?? []).filter((r) => r.report_class === breakdown && r.metric === metric);
  const account = rows.find((r) => r.scope === "account") ?? null;
  const ads = rows
    .filter((r) => r.scope === "ad")
    .map((r) => ({
      ad_identity: r.ad_identity,
      ad_name: r.ad_name,
      meta_ad_id: r.meta_ad_id,
      truth_value: r.truth_value,
      observed_value: r.observed_value,
      coverage_pct: r.coverage_pct,
      residual: r.residual,
      evidence_state: r.evidence_state,
      failure: r.compatibility_failures[0]?.detail ?? null,
    }))
    .sort((a, b) => (b.residual ?? -Infinity) - (a.residual ?? -Infinity) || b.observed_value - a.observed_value);
  return { account, ads };
}

/** Metrics the ledger carries for a breakdown, spend first. */
export function ledgerMetricsFor(ledger: readonly LedgerRow[] | undefined, breakdown: BreakdownKind): string[] {
  const set = new Set<string>();
  for (const r of ledger ?? []) if (r.report_class === breakdown && r.scope === "account") set.add(r.metric);
  const order = ["amount_spent", "impressions", "clicks_all", "link_clicks", "results", "landing_page_views", "adds_to_cart", "checkouts_initiated", "purchases"];
  return [...set].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
  });
}

const METRIC_LABEL: Record<string, string> = {
  amount_spent: "Spend",
  impressions: "Impressions",
  clicks_all: "Clicks (all)",
  link_clicks: "Link clicks",
  results: "Results",
  landing_page_views: "Landing page views",
  adds_to_cart: "Adds to cart",
  checkouts_initiated: "Checkouts",
  purchases: "Purchases",
  website_purchases_conversion_value: "Purchase value",
  leads: "Leads",
};

export function metricLabel(slug: string): string {
  return METRIC_LABEL[slug] ?? slug.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

// ─── Assets and variables for a creative ────────────────────────────────

export function creativeAssetsFor(assets: readonly CreativeAssetRow[] | undefined, identity: Pick<CreativeAdIdentity, "adIds" | "adNames">): CreativeAssetRow[] {
  const ids = new Set(identity.adIds);
  const names = new Set(identity.adNames);
  return (assets ?? []).filter(
    (a) => (a.ad_identity_kind === "ad_id" && ids.has(a.ad_identity)) || (a.ad_identity_kind === "ad_name" && names.has(a.ad_identity)),
  );
}

export function variableEvidenceFor(
  evidence: readonly VariableEvidenceRow[] | undefined,
  identity: Pick<CreativeAdIdentity, "adIds" | "adNames">,
): VariableEvidenceRow[] {
  const ids = new Set(identity.adIds);
  const names = new Set(identity.adNames);
  return (evidence ?? []).filter(
    (e) => (e.ad_identity_kind === "ad_id" && ids.has(e.ad_identity)) || (e.ad_identity_kind === "ad_name" && names.has(e.ad_identity)),
  );
}

export interface VariableWithEvidence {
  variable_family: string;
  variable_id: string;
  relationship: "direct_asset" | "ad_context";
  sources: string[];
  segments: VariableSegmentRow[];
}

/** Distinct variables the creative's ads carry, with their segment rows, direct before contextual. */
export function variablesForCreative(
  evidence: readonly VariableEvidenceRow[],
  segments: readonly VariableSegmentRow[] | undefined,
): VariableWithEvidence[] {
  const by = new Map<string, VariableWithEvidence>();
  for (const e of evidence) {
    const k = `${e.variable_family}${e.variable_id}`;
    const cur = by.get(k) ?? { variable_family: e.variable_family, variable_id: e.variable_id, relationship: "ad_context", sources: [], segments: [] };
    if (e.relationship === "direct_asset") cur.relationship = "direct_asset";
    if (!cur.sources.includes(e.source_kind)) cur.sources.push(e.source_kind);
    by.set(k, cur);
  }
  for (const v of by.values()) {
    v.segments = (segments ?? []).filter((s) => s.variable_family === v.variable_family && s.variable_id === v.variable_id);
  }
  return [...by.values()].sort((a, b) => (a.relationship === b.relationship ? a.variable_id.localeCompare(b.variable_id) : a.relationship === "direct_asset" ? -1 : 1));
}
