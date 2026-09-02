// Reconciliation-first evidence layer — observations, truth, ledger.
//
// Pure. Every staged report is reduced to OBSERVATIONS at a compatible shared
// grain (ad identity × segment × reporting period; Day is summed away), the
// strongest compatible control source becomes TRUTH per ad and per account,
// and one LEDGER row is written per (scope, ad, report class, additive
// metric) with a signed residual. Residuals never enter fact rows, never
// fold into "Unknown", and nothing is scaled to force a match.
//
// docs/specs/iap-multi-report-reconciliation.md §7 (authority), §8
// (formulas), §9 (evidence states), §12 (aggregation rules).

import type { IapCsvRow } from "./iapCsvParser";
import type { AssetType } from "./iapCsvSpec";
import {
  type AdIdentity,
  type AdIdentityKind,
  type ReportGrain,
  adIdentityOf,
  assetContentHash,
  assetTypeForColumn,
  isAdditiveMetric,
  normalizeAssetValue,
  resolveNameToInstances,
} from "./reportGrain";

// ─── Vocabulary ────────────────────────────────────────────────────────────

export type EvidenceState =
  | "direct_asset"
  | "direct_joint"
  | "ad_context"
  | "observed_reconciled"
  | "observed_partial"
  | "modelled"
  | "overcounted"
  | "unreconciled"
  | "incompatible"
  | "unavailable";

export const EVIDENCE_STATES: readonly EvidenceState[] = [
  "direct_asset",
  "direct_joint",
  "ad_context",
  "observed_reconciled",
  "observed_partial",
  "modelled",
  "overcounted",
  "unreconciled",
  "incompatible",
  "unavailable",
];

/** Which breakdown a fact row belongs to; joint reports also yield their margins. */
export type Breakdown = "demographic" | "placement" | "asset" | "demographic_asset" | "placement_asset" | "demographic_placement";

export const BREAKDOWNS: readonly Breakdown[] = ["demographic", "placement", "asset", "demographic_asset", "placement_asset", "demographic_placement"];

/** How a fact row was attributed: by an asset breakdown, by a joint file, or by a single-dimension breakdown. */
export type Attribution = "direct_asset" | "direct_joint" | "direct_segment";

export interface SegmentDims {
  gender?: string;
  age?: string;
  platform?: string;
  placement?: string;
  device?: string;
  asset_type?: AssetType;
  asset_hash?: string;
  asset_value?: string;
  /** For a copy signature: the delivered field values by column (spec §10a). */
  asset_fields?: Record<string, string>;
}

export interface Observation {
  breakdown: Breakdown;
  attribution: Attribution;
  identity: AdIdentity;
  segment: SegmentDims;
  segment_key: string;
  result_type: string;
  /** Additive metrics summed across the rows this observation aggregates, by slug. */
  metrics: Record<string, number>;
  /** Reach only at the exact grain Meta returned (one source row, whole-period file); null otherwise. */
  reach: number | null;
  reach_basis: "exact" | null;
  row_count: number;
  source_import_ids: string[];
  /** Reconciliation status of the ad × breakdown this row belongs to (spend as the reference metric). */
  evidence_state: EvidenceState;
  /** Spend coverage of the ad × breakdown this row belongs to; null without a per-ad control. */
  coverage_pct: number | null;
}

export interface ReportInput {
  import_id: string;
  grain: ReportGrain;
  rows: IapCsvRow[];
  /** Meta's totals row (parse result `totalsRow`) when the file carried one. */
  totals_row?: Record<string, number | string | null> | null;
}

export interface OverlapRecord {
  breakdown: Breakdown;
  superseded_import_id: string;
  winning_import_id: string;
  keys: number;
}

export interface BuildObservationsResult {
  observations: Observation[];
  overlaps: OverlapRecord[];
  warnings: string[];
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const SEP = "";

export function segmentKeyOf(segment: SegmentDims): string {
  return Object.entries(segment)
    .filter(([k, v]) => k !== "asset_fields" && v !== undefined && v !== "")
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join(SEP);
}

export const identityKey = (id: AdIdentity): string => `${id.kind}:${id.key}`;

function additiveMetricsOf(row: IapCsvRow): Record<string, number> {
  const out: Record<string, number> = {};
  for (const source of [row.base, row.extra]) {
    for (const [slug, v] of Object.entries(source)) {
      if (typeof v !== "number" || !isAdditiveMetric(slug)) continue;
      out[slug] = (out[slug] ?? 0) + v;
    }
  }
  return out;
}

function addMetrics(into: Record<string, number>, from: Record<string, number>): void {
  for (const [k, v] of Object.entries(from)) into[k] = (into[k] ?? 0) + v;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Observation sets a report yields: its own class, plus the margins of a joint report. */
export function breakdownsFor(grain: ReportGrain): Breakdown[] {
  switch (grain.report_class) {
    case "demographic":
      return ["demographic"];
    case "placement":
      return ["placement"];
    case "asset":
      return ["asset"];
    case "demographic_asset":
      return ["demographic", "asset", "demographic_asset"];
    case "placement_asset":
      return ["placement", "asset", "placement_asset"];
    case "demographic_placement":
      return ["demographic", "placement", "demographic_placement"];
    default:
      return [];
  }
}

export function attributionFor(breakdown: Breakdown): Attribution {
  if (breakdown === "asset") return "direct_asset";
  if (breakdown === "demographic" || breakdown === "placement") return "direct_segment";
  return "direct_joint";
}

/**
 * Resolves a row's identity, promoting a NAME-grain row to Ad-ID grain only
 * when the registry proves the name maps to exactly one instance (spec §6).
 */
export function resolveIdentity(
  row: IapCsvRow,
  grain: ReportGrain,
  instancesByName?: ReadonlyMap<string, readonly string[]>,
): AdIdentity {
  const id = adIdentityOf(row, grain);
  if (id.kind === "ad_name" && instancesByName) {
    const { meta_ad_id } = resolveNameToInstances(id.ad_name, instancesByName);
    if (meta_ad_id) return { kind: "ad_id", key: meta_ad_id, ad_name: id.ad_name, meta_ad_id };
  }
  return id;
}

function segmentsFor(row: IapCsvRow, breakdown: Breakdown, grain: ReportGrain): SegmentDims[] {
  const demo = (): SegmentDims => ({ gender: row.breakdowns["Gender"] || undefined, age: row.breakdowns["Age"] || undefined });
  const place = (): SegmentDims => ({
    platform: row.breakdowns["Platform"] || undefined,
    placement: row.breakdowns["Placement"] || undefined,
    device: row.breakdowns["Impression device"] || undefined,
  });
  // Only BREAKDOWN-role columns attribute; context columns are creative
  // metadata beside the real breakdown. One breakdown column → that asset;
  // several varying together → the delivered combination, a copy signature,
  // never any single field (spec §10a).
  const assets = (): SegmentDims[] => {
    const breakdownCols = grain.asset_columns.filter((c) => c.role === "breakdown");
    const present = breakdownCols
      .map((c) => ({ ...c, raw: row.assetBreakdowns?.[c.column] ?? "" }))
      .filter((c) => c.raw);
    if (present.length === 0) return [];
    if (present.length === 1) {
      const { asset_type, raw } = present[0]!;
      const normalized = normalizeAssetValue(asset_type, raw);
      return [{ asset_type, asset_hash: assetContentHash(asset_type, normalized), asset_value: normalized }];
    }
    const fields: Record<string, string> = {};
    for (const c of present) fields[c.column] = normalizeAssetValue(c.asset_type, c.raw);
    const ordered = present.map((c) => `${c.column}=${fields[c.column]}`).join("\u0001");
    return [{ asset_type: "copy_signature", asset_hash: assetContentHash("copy_signature", ordered), asset_value: ordered, asset_fields: fields }];
  };
  switch (breakdown) {
    case "demographic":
      return [demo()];
    case "placement":
      return [place()];
    case "asset":
      return assets();
    case "demographic_asset":
      return assets().map((a) => ({ ...demo(), ...a }));
    case "placement_asset":
      return assets().map((a) => ({ ...place(), ...a }));
    case "demographic_placement":
      return [{ ...demo(), ...place() }];
  }
}

// ─── Observations ──────────────────────────────────────────────────────────

/**
 * Reduces every pivot report to observations at ad × segment × period.
 *
 * Overlap rule (spec §8): within one breakdown, when two imports carry the
 * same (ad identity, segment, result type, day-or-period), they are not
 * unioned — the later-staged import supersedes for those keys and the
 * overlap is recorded. Disjoint imports union.
 */
export function buildObservations(
  reports: readonly ReportInput[],
  opts: { instancesByName?: ReadonlyMap<string, readonly string[]> } = {},
): BuildObservationsResult {
  const warnings: string[] = [];
  const overlaps: OverlapRecord[] = [];
  const pivots = reports.filter((r) => breakdownsFor(r.grain).length > 0);

  // Pass 1 — the winning import per (breakdown, day-level key).
  type RowRef = { report: ReportInput; row: IapCsvRow; identity: AdIdentity; breakdown: Breakdown; segment: SegmentDims; segment_key: string; dayKey: string };
  const refs: RowRef[] = [];
  const winner = new Map<string, string>();
  for (const report of pivots) {
    for (const row of report.rows) {
      const identity = resolveIdentity(row, report.grain, opts.instancesByName);
      const resultType = typeof row.base["result_type"] === "string" ? row.base["result_type"] : "";
      const day = report.grain.has_day ? row.breakdowns["Day"] ?? "" : "";
      for (const breakdown of breakdownsFor(report.grain)) {
        for (const segment of segmentsFor(row, breakdown, report.grain)) {
          const segment_key = segmentKeyOf(segment);
          const dayKey = [breakdown, identityKey(identity), segment_key, resultType, day].join(SEP);
          winner.set(dayKey, report.import_id);
          refs.push({ report, row, identity, breakdown, segment, segment_key, dayKey });
        }
      }
    }
  }

  // Pass 2 — aggregate the winning rows; count superseded keys per pair.
  const superseded = new Map<string, Set<string>>();
  const buckets = new Map<string, Observation>();
  for (const ref of refs) {
    const win = winner.get(ref.dayKey)!;
    if (win !== ref.report.import_id) {
      const pair = `${ref.breakdown}${SEP}${ref.report.import_id}${SEP}${win}`;
      const set = superseded.get(pair) ?? new Set<string>();
      set.add(ref.dayKey);
      superseded.set(pair, set);
      continue;
    }
    const resultType = typeof ref.row.base["result_type"] === "string" ? ref.row.base["result_type"] : "";
    const key = [ref.breakdown, identityKey(ref.identity), ref.segment_key, resultType].join(SEP);
    let obs = buckets.get(key);
    if (!obs) {
      obs = {
        breakdown: ref.breakdown,
        attribution: attributionFor(ref.breakdown),
        identity: ref.identity,
        segment: ref.segment,
        segment_key: ref.segment_key,
        result_type: resultType,
        metrics: {},
        reach: null,
        reach_basis: null,
        row_count: 0,
        source_import_ids: [],
        evidence_state: "unreconciled",
        coverage_pct: null,
      };
      buckets.set(key, obs);
    }
    addMetrics(obs.metrics, additiveMetricsOf(ref.row));
    obs.row_count += 1;
    if (!obs.source_import_ids.includes(ref.report.import_id)) obs.source_import_ids.push(ref.report.import_id);
    // Reach survives only when this observation IS one source row of a
    // whole-period file — the exact grain Meta returned (spec §12).
    const reach = ref.row.base["reach"];
    if (obs.row_count === 1 && !ref.report.grain.has_day && typeof reach === "number" && ref.breakdown === ref.report.grain.report_class) {
      obs.reach = reach;
      obs.reach_basis = "exact";
    } else {
      obs.reach = null;
      obs.reach_basis = null;
    }
  }

  for (const [pair, keys] of superseded) {
    const [breakdown, superseded_import_id, winning_import_id] = pair.split(SEP) as [Breakdown, string, string];
    overlaps.push({ breakdown, superseded_import_id, winning_import_id, keys: keys.size });
    warnings.push(
      `[Overlap] ${keys.size.toLocaleString()} ${breakdown} key(s) appear in two staged files; the later-staged file supersedes them so the same delivery is never counted twice.`,
    );
  }

  return { observations: [...buckets.values()], overlaps, warnings };
}

// ─── Truth ─────────────────────────────────────────────────────────────────

export type TruthSource = "ad_summary" | "totals_row" | "none";

export interface TruthAlternative {
  source: TruthSource;
  label: string;
  import_ids: string[];
  account: Record<string, number>;
}

export interface TruthSet {
  source: TruthSource;
  /** Which candidate was selected and why, for the ledger and the run log. */
  precedence: string;
  /** Candidates not selected, summed for comparison — never averaged in. */
  alternatives: TruthAlternative[];
  /** Disagreements above 1% between the selected source and an alternative, per metric. */
  conflicts: string[];
  import_ids: string[];
  /** How per-ad truth is keyed; null when the control is account-grain only. */
  identity_kind: "ad_id" | "ad_name" | null;
  per_ad: Map<string, { identity: AdIdentity; metrics: Record<string, number>; result_type: string }>;
  account: Record<string, number> | null;
  currency: string | null;
  account_ids: string[];
  period: { start: string; end: string } | null;
  attribution_settings?: string[];
  result_types?: string[];
}

/**
 * The strongest compatible control: an Ad Summary (per ad when it carries
 * Ad ID, otherwise per name — which joins Ad-ID rows only through a
 * proven-unique name) → else the file's own Meta totals row at account
 * grain → else none.
 */
function summariseReports(
  reports: readonly ReportInput[],
  instancesByName?: ReadonlyMap<string, readonly string[]>,
): { per_ad: TruthSet["per_ad"]; account: Record<string, number>; allJoinable: boolean } {
  const per_ad = new Map<string, { identity: AdIdentity; metrics: Record<string, number>; result_type: string }>();
  const account: Record<string, number> = {};
  let allJoinable = true;
  for (const report of reports) {
    if (!report.grain.ad_id_joinable) allJoinable = false;
    for (const row of report.rows) {
      const identity = resolveIdentity(row, report.grain, instancesByName);
      const m = additiveMetricsOf(row);
      addMetrics(account, m);
      const k = identityKey(identity);
      const cur = per_ad.get(k);
      if (cur) addMetrics(cur.metrics, m);
      else per_ad.set(k, { identity, metrics: { ...m }, result_type: typeof row.base["result_type"] === "string" ? row.base["result_type"] : "" });
    }
  }
  return { per_ad, account, allJoinable };
}

function conflictsBetween(selected: Record<string, number>, alternative: TruthAlternative): string[] {
  const out: string[] = [];
  for (const [metric, v] of Object.entries(selected)) {
    const other = alternative.account[metric];
    if (other === undefined || v === 0) continue;
    const diff = Math.abs(other - v) / v;
    if (diff > 0.01) out.push(`[Truth] ${metric}: selected control reports ${round2(v).toLocaleString("en-US")}, ${alternative.label} reports ${round2(other).toLocaleString("en-US")} (${Math.round(diff * 1000) / 10}% apart). The selected source is used; the disagreement is recorded, not averaged.`);
  }
  return out;
}

/**
 * Source precedence (spec §6a): a whole-period Ad Summary keyed by Ad ID →
 * a daily Ad Summary summed to the window → a name-keyed Ad Summary →
 * the file's own Meta totals row → none. Every unselected candidate is
 * summed and compared; a disagreement is surfaced, never averaged.
 */
export function buildTruth(
  reports: readonly ReportInput[],
  opts: { instancesByName?: ReadonlyMap<string, readonly string[]> } = {},
): TruthSet {
  const wholeWithId = reports.filter((r) => r.grain.report_class === "ad_summary" && r.grain.ad_id_joinable);
  const dailyWithId = reports.filter((r) => r.grain.report_class === "time_series" && r.grain.ad_id_joinable);
  const byName = reports.filter((r) => (r.grain.report_class === "ad_summary" || r.grain.report_class === "time_series") && !r.grain.ad_id_joinable);
  const withTotals = reports.filter((r) => r.totals_row);

  const candidates: { key: string; label: string; reports: ReportInput[]; source: TruthSource; precedence: string }[] = [
    { key: "whole_id", label: "the whole-period Ad Summary (per Ad ID)", reports: wholeWithId, source: "ad_summary" as TruthSource, precedence: "whole-period Ad Summary keyed by Ad ID" },
    { key: "daily_id", label: "the daily Ad Summary (per Ad ID)", reports: dailyWithId, source: "ad_summary" as TruthSource, precedence: "daily Ad Summary keyed by Ad ID, summed to the window" },
    { key: "by_name", label: "the name-keyed Ad Summary", reports: byName, source: "ad_summary" as TruthSource, precedence: "Ad Summary keyed by ad name (account grain; per ad only through a unique name)" },
  ].filter((c) => c.reports.length > 0);

  const alternatives: TruthAlternative[] = [];
  let selected: TruthSet | null = null;
  for (const c of candidates) {
    const { per_ad, account, allJoinable } = summariseReports(c.reports, opts.instancesByName);
    if (!selected) {
      const first = c.reports[0]!.grain;
      selected = {
        source: c.source,
        precedence: c.precedence,
        alternatives: [],
        conflicts: [],
        import_ids: c.reports.map((r) => r.import_id),
        identity_kind: allJoinable ? "ad_id" : "ad_name",
        per_ad,
        account,
        currency: first.currency,
        account_ids: first.account_ids,
        period: first.period,
        attribution_settings: [...new Set(c.reports.flatMap((r) => r.grain.attribution_settings))],
        result_types: [...new Set(c.reports.flatMap((r) => r.grain.result_types))],
      };
    } else {
      alternatives.push({ source: c.source, label: c.label, import_ids: c.reports.map((r) => r.import_id), account });
    }
  }
  for (const t of withTotals) {
    const account: Record<string, number> = {};
    for (const [slug, v] of Object.entries(t.totals_row!)) {
      if (typeof v === "number" && isAdditiveMetric(slug)) account[slug] = v;
    }
    if (!selected) {
      selected = {
        source: "totals_row",
        precedence: "Meta's totals row (account grain)",
        alternatives: [],
        conflicts: [],
        import_ids: [t.import_id],
        identity_kind: null,
        per_ad: new Map(),
        account,
        currency: t.grain.currency,
        account_ids: t.grain.account_ids,
        period: t.grain.period,
        attribution_settings: t.grain.attribution_settings,
        result_types: t.grain.result_types,
      };
    } else {
      alternatives.push({ source: "totals_row", label: "Meta's totals row", import_ids: [t.import_id], account });
    }
  }
  if (!selected) {
    return { source: "none", precedence: "no control source", alternatives: [], conflicts: [], import_ids: [], identity_kind: null, per_ad: new Map(), account: null, currency: null, account_ids: [], period: null };
  }
  selected.alternatives = alternatives;
  selected.conflicts = alternatives.flatMap((a) => conflictsBetween(selected!.account ?? {}, a));
  return selected;
}

// ─── Ledger ────────────────────────────────────────────────────────────────

export interface CompatibilityFailure {
  kind:
    | "currency"
    | "account"
    | "period"
    | "attribution"
    | "result_definition"
    | "header_conflict"
    | "truth_missing_ad_id"
    | "unjoinable"
    | "no_control_source"
    | "metric_not_in_control";
  detail: string;
}

export interface LedgerRow {
  scope: "account" | "ad";
  ad_identity_kind: AdIdentityKind | null;
  ad_identity: string;
  ad_name: string | null;
  meta_ad_id: string | null;
  report_class: Breakdown;
  metric: string;
  grain: string;
  truth_source: TruthSource;
  truth_value: number | null;
  observed_value: number;
  coverage_pct: number | null;
  /** Signed: truth − observed. Negative means the breakdown over-counts. */
  residual: number | null;
  /** max(0, observed − truth): the over-count itself, kept for diagnosis and never normalised away. */
  overcoverage: number | null;
  direct_share: number;
  modelled_share: number;
  evidence_state: EvidenceState;
  compatibility_failures: CompatibilityFailure[];
  truth_import_ids: string[];
  observed_import_ids: string[];
}

export interface MetricReconciliation {
  metric: string;
  truth_value: number | null;
  observed_value: number;
  coverage_pct: number | null;
  residual: number | null;
  evidence_state: EvidenceState;
}

export interface BreakdownSummary {
  report_class: Breakdown;
  by_metric: MetricReconciliation[];
  ads_total: number;
  ads_reconciled: number;
  ads_partial: number;
  ads_overcounted: number;
  ads_unreconciled: number;
  ads_incompatible: number;
  /** Ads the control source knows that this breakdown never mentions. */
  ads_missing_from_breakdown: number;
}

export interface ReconciliationSummary {
  truth_source: TruthSource;
  truth_identity_kind: "ad_id" | "ad_name" | null;
  truth_precedence: string;
  truth_conflicts: string[];
  breakdowns: BreakdownSummary[];
  notes: string[];
}

const GRAIN_LABEL: Record<Breakdown, string> = {
  demographic: "ad × age × gender × period",
  placement: "ad × platform × placement × device × period",
  asset: "ad × asset × period",
  demographic_asset: "ad × age × gender × asset × period",
  placement_asset: "ad × platform × placement × device × asset × period",
  demographic_placement: "ad × age × gender × platform × placement × device × period",
};

/** Spec §9: within ±1% is reconciled; below is partial; above is overcounted. */
export function evidenceStateFor(truth: number | null, observed: number): EvidenceState {
  if (truth === null) return "unreconciled";
  if (truth === 0) return observed === 0 ? "observed_reconciled" : "overcounted";
  const coverage = (observed / truth) * 100;
  if (coverage > 101) return "overcounted";
  if (coverage >= 99) return "observed_reconciled";
  return "observed_partial";
}

function coverageOf(truth: number | null, observed: number): number | null {
  return truth === null || truth === 0 ? null : round2((observed / truth) * 100);
}

function compatibilityOf(report: ReportInput, truth: TruthSet, breakdown: Breakdown): CompatibilityFailure[] {
  const out: CompatibilityFailure[] = [];
  if (truth.source === "none") return out;
  const g = report.grain;
  if (g.currency && truth.currency && g.currency !== truth.currency) {
    out.push({ kind: "currency", detail: `${breakdown} export is in ${g.currency}; the control source is in ${truth.currency}.` });
  }
  if (g.account_ids.length > 0 && truth.account_ids.length > 0 && !g.account_ids.some((a) => truth.account_ids.includes(a))) {
    out.push({ kind: "account", detail: `${breakdown} export covers account ${g.account_ids.join(", ")}; the control source covers ${truth.account_ids.join(", ")}.` });
  }
  if (g.period && truth.period && (g.period.end < truth.period.start || g.period.start > truth.period.end)) {
    out.push({ kind: "period", detail: `${breakdown} export covers ${g.period.start} → ${g.period.end}; the control source covers ${truth.period.start} → ${truth.period.end}.` });
  }
  const truthAttribution = truth.attribution_settings ?? [];
  if (g.attribution_settings.length > 0 && truthAttribution.length > 0 && !g.attribution_settings.some((a) => truthAttribution.includes(a))) {
    out.push({ kind: "attribution", detail: `${breakdown} export uses attribution ${g.attribution_settings.join(", ")}; the control source uses ${truthAttribution.join(", ")}.` });
  }
  return out;
}

/** Result-definition check for the `results` metric: a breakdown whose result types share nothing with the control's cannot reconcile results. */
function resultDefinitionFailure(reportTypes: readonly string[], truthTypes: readonly string[], breakdown: Breakdown): CompatibilityFailure | null {
  if (reportTypes.length === 0 || truthTypes.length === 0) return null;
  if (reportTypes.some((t) => truthTypes.includes(t))) return null;
  return { kind: "result_definition", detail: `${breakdown} export reports results as ${reportTypes.join(", ")}; the control source reports ${truthTypes.join(", ")} — results are not the same definition.` };
}

export interface BuildLedgerResult {
  rows: LedgerRow[];
  summary: ReconciliationSummary;
  /** Observations with their evidence state and coverage filled in. */
  observations: Observation[];
}

/**
 * One row per (scope, ad, report class, additive metric). Ads the control
 * knows but the breakdown omits get rows with observed 0 — the 10 absent
 * ads of the validated export are a finding, not a blank.
 */
export function buildLedger(args: {
  observations: readonly Observation[];
  truth: TruthSet;
  reports: readonly ReportInput[];
  instancesByName?: ReadonlyMap<string, readonly string[]>;
}): BuildLedgerResult {
  const { observations, truth, reports } = args;
  const rows: LedgerRow[] = [];
  const notes: string[] = [];
  const summaries: BreakdownSummary[] = [];
  const observationsOut = observations.map((o) => ({ ...o }));

  const byBreakdown = new Map<Breakdown, Observation[]>();
  for (const o of observationsOut) {
    const list = byBreakdown.get(o.breakdown) ?? [];
    list.push(o);
    byBreakdown.set(o.breakdown, list);
  }

  const noControlDetail =
    truth.source === "none"
      ? "Stage an Ad Summary export (with the Ad ID column) to reconcile this breakdown."
      : truth.identity_kind === "ad_name"
      ? 'Add "Ad ID" to the Ad Summary export to reconcile per ad; ad names are reused across instances.'
      : null;

  for (const [breakdown, obs] of byBreakdown) {
    const reportIds = [...new Set(obs.flatMap((o) => o.source_import_ids))];
    const reportInputs = reports.filter((r) => reportIds.includes(r.import_id));
    const failures = reportInputs.flatMap((r) => compatibilityOf(r, truth, breakdown));
    const incompatible = failures.length > 0;
    const metrics = [...new Set(obs.flatMap((o) => Object.keys(o.metrics)))].sort();

    // Account scope.
    const byMetric: MetricReconciliation[] = [];
    for (const metric of metrics) {
      const observed = round2(obs.reduce((s, o) => s + (o.metrics[metric] ?? 0), 0));
      const truthValue = incompatible ? null : truth.account?.[metric] ?? null;
      const state: EvidenceState = incompatible ? "incompatible" : evidenceStateFor(truthValue, observed);
      const resultDef = metric === "results" ? resultDefinitionFailure(reportInputs.flatMap((r) => r.grain.result_types), truth.result_types ?? [], breakdown) : null;
      const metricIncompatible = incompatible || resultDef !== null;
      const stateFor = metricIncompatible ? ("incompatible" as EvidenceState) : state;
      const rowFailures: CompatibilityFailure[] = incompatible
        ? failures
        : resultDef
        ? [resultDef]
        : truth.source === "none"
        ? [{ kind: "no_control_source", detail: noControlDetail! }]
        : truthValue === null
        ? [{ kind: "metric_not_in_control", detail: `The control source does not carry "${metric}".` }]
        : [];
      const row: LedgerRow = {
        scope: "account",
        ad_identity_kind: null,
        ad_identity: "",
        ad_name: null,
        meta_ad_id: null,
        report_class: breakdown,
        metric,
        grain: GRAIN_LABEL[breakdown],
        truth_source: truth.source,
        truth_value: truthValue === null || metricIncompatible ? null : round2(truthValue),
        observed_value: observed,
        coverage_pct: metricIncompatible ? null : coverageOf(truthValue, observed),
        residual: truthValue === null || metricIncompatible ? null : round2(truthValue - observed),
        overcoverage: truthValue === null || metricIncompatible ? null : round2(Math.max(0, observed - truthValue)),
        direct_share: 1,
        modelled_share: 0,
        evidence_state: stateFor,
        compatibility_failures: rowFailures,
        truth_import_ids: truth.import_ids,
        observed_import_ids: reportIds,
      };
      rows.push(row);
      byMetric.push({ metric, truth_value: row.truth_value, observed_value: observed, coverage_pct: row.coverage_pct, residual: row.residual, evidence_state: stateFor });
    }

    // Ad scope.
    const perAd = new Map<string, { identity: AdIdentity; observed: Record<string, number>; importIds: Set<string> }>();
    for (const o of obs) {
      const k = identityKey(o.identity);
      const cur = perAd.get(k) ?? { identity: o.identity, observed: {}, importIds: new Set<string>() };
      addMetrics(cur.observed, o.metrics);
      for (const id of o.source_import_ids) cur.importIds.add(id);
      perAd.set(k, cur);
    }
    // Ads the control knows that this breakdown never mentions — only when
    // the breakdown is itself at Ad-ID grain; a name-grain breakdown covers
    // its instances under their names and is judged there.
    let missing = 0;
    const breakdownAtAdIdGrain = obs.length > 0 && obs.every((o) => o.identity.kind === "ad_id");
    if (truth.identity_kind === "ad_id" && !incompatible && breakdownAtAdIdGrain) {
      for (const [k, t] of truth.per_ad) {
        if (perAd.has(k)) continue;
        missing += 1;
        perAd.set(k, { identity: t.identity, observed: {}, importIds: new Set() });
      }
    }

    const counts = { reconciled: 0, partial: 0, overcounted: 0, unreconciled: 0, incompatible: 0 };
    const adState = new Map<string, { state: EvidenceState; coverage: number | null }>();
    for (const [k, ad] of perAd) {
      let truthMetrics: Record<string, number> | null = null;
      const adFailures: CompatibilityFailure[] = incompatible ? failures : [];
      if (!incompatible) {
        if (truth.source === "none") {
          adFailures.push({ kind: "no_control_source", detail: noControlDetail! });
        } else if (truth.source === "totals_row") {
          adFailures.push({ kind: "no_control_source", detail: "Meta's totals row is account-level; stage an Ad Summary export (with Ad ID) to reconcile per ad." });
        } else if (ad.identity.kind === "unjoinable") {
          adFailures.push({ kind: "unjoinable", detail: "This export carries neither a usable Ad ID nor an ad name for these rows." });
        } else if (truth.identity_kind === "ad_id") {
          if (ad.identity.kind === "ad_id") truthMetrics = truth.per_ad.get(k)?.metrics ?? null;
          else {
            const { meta_ad_id, instances } = resolveNameToInstances(ad.identity.ad_name, args.instancesByName ?? new Map());
            if (meta_ad_id) truthMetrics = truth.per_ad.get(`ad_id:${meta_ad_id}`)?.metrics ?? null;
            else adFailures.push({ kind: "truth_missing_ad_id", detail: `This export has no Ad ID; "${ad.identity.ad_name}" maps to ${instances} instance(s), so it cannot be joined to the Ad Summary per ad.` });
          }
        } else {
          // Name-keyed truth. A summary row whose name the registry proved
          // unique was promoted to Ad-ID grain in buildTruth, so look both
          // ways; an Ad-ID observation joins name truth only when the
          // registry resolves its name to ITS OWN id — a second instance
          // seen under a "unique" name is the registry being wrong, not a
          // join.
          const nameTruth =
            truth.per_ad.get(`ad_name:${ad.identity.ad_name}`)?.metrics ??
            (ad.identity.kind === "ad_id" ? truth.per_ad.get(`ad_id:${ad.identity.key}`)?.metrics ?? null : null);
          if (ad.identity.kind === "ad_name") truthMetrics = nameTruth;
          else {
            const { meta_ad_id } = resolveNameToInstances(ad.identity.ad_name, args.instancesByName ?? new Map());
            if (meta_ad_id === ad.identity.key) truthMetrics = nameTruth;
            else adFailures.push({ kind: "truth_missing_ad_id", detail: noControlDetail! });
          }
        }
      }
      let spendState: EvidenceState = "unreconciled";
      let spendCoverage: number | null = null;
      const adResultType = obs.find((o) => identityKey(o.identity) === k)?.result_type ?? "";
      const truthResultType = truth.per_ad.get(k)?.result_type ?? "";
      for (const metric of metrics) {
        const observed = round2(ad.observed[metric] ?? 0);
        let truthValue = truthMetrics ? truthMetrics[metric] ?? null : null;
        const resultDef =
          metric === "results" && truthMetrics && adResultType && truthResultType && adResultType !== truthResultType
            ? resultDefinitionFailure([adResultType], [truthResultType], breakdown)
            : null;
        if (resultDef) truthValue = null;
        const state: EvidenceState = incompatible || resultDef ? "incompatible" : evidenceStateFor(truthValue, observed);
        const rowFailures = resultDef
          ? [...adFailures, resultDef]
          : truthMetrics && truthValue === null && !incompatible
          ? [...adFailures, { kind: "metric_not_in_control" as const, detail: `The control source does not carry "${metric}".` }]
          : adFailures;
        rows.push({
          scope: "ad",
          ad_identity_kind: ad.identity.kind,
          ad_identity: ad.identity.key,
          ad_name: ad.identity.ad_name || null,
          meta_ad_id: ad.identity.meta_ad_id,
          report_class: breakdown,
          metric,
          grain: GRAIN_LABEL[breakdown],
          truth_source: truth.source,
          truth_value: truthValue === null ? null : round2(truthValue),
          observed_value: observed,
          coverage_pct: coverageOf(truthValue, observed),
          residual: truthValue === null ? null : round2(truthValue - observed),
          overcoverage: truthValue === null ? null : round2(Math.max(0, observed - truthValue)),
          direct_share: 1,
          modelled_share: 0,
          evidence_state: state,
          compatibility_failures: rowFailures,
          truth_import_ids: truth.import_ids,
          observed_import_ids: [...ad.importIds],
        });
        if (metric === "amount_spent") {
          spendState = state;
          spendCoverage = coverageOf(truthValue, observed);
        }
      }
      if (!metrics.includes("amount_spent")) spendState = incompatible ? "incompatible" : truthMetrics ? "observed_reconciled" : "unreconciled";
      adState.set(k, { state: spendState, coverage: spendCoverage });
      if (spendState === "observed_reconciled") counts.reconciled += 1;
      else if (spendState === "observed_partial") counts.partial += 1;
      else if (spendState === "overcounted") counts.overcounted += 1;
      else if (spendState === "incompatible") counts.incompatible += 1;
      else counts.unreconciled += 1;
    }
    for (const o of obs) {
      const st = adState.get(identityKey(o.identity));
      if (st) {
        o.evidence_state = st.state;
        o.coverage_pct = st.coverage;
      }
    }

    summaries.push({
      report_class: breakdown,
      by_metric: byMetric,
      ads_total: perAd.size,
      ads_reconciled: counts.reconciled,
      ads_partial: counts.partial,
      ads_overcounted: counts.overcounted,
      ads_unreconciled: counts.unreconciled,
      ads_incompatible: counts.incompatible,
      ads_missing_from_breakdown: missing,
    });

    const spend = byMetric.find((m) => m.metric === "amount_spent");
    if (spend) {
      const truthLabel = truth.source === "ad_summary" ? "the Ad Summary" : truth.source === "totals_row" ? "Meta's totals row" : "no control source";
      notes.push(
        spend.coverage_pct === null
          ? `[Reconciliation] ${breakdown}: spend ${spend.observed_value.toLocaleString("en-US")} observed, ${truthLabel} — ${spend.evidence_state}.`
          : `[Reconciliation] ${breakdown}: spend ${spend.observed_value.toLocaleString("en-US")} of ${spend.truth_value!.toLocaleString("en-US")} (${spend.coverage_pct}% of ${truthLabel}); ` +
              `ads reconciled ${counts.reconciled}/${perAd.size}` +
              (missing > 0 ? `, ${missing} ad(s) absent from this breakdown` : "") +
              (counts.unreconciled > 0 && noControlDetail ? `. ${noControlDetail}` : "."),
      );
    }
  }

  notes.push(...truth.conflicts);
  return {
    rows,
    summary: {
      truth_source: truth.source,
      truth_identity_kind: truth.identity_kind,
      truth_precedence: truth.precedence,
      truth_conflicts: truth.conflicts,
      breakdowns: summaries,
      notes,
    },
    observations: observationsOut,
  };
}

// ─── Rates and interaction ─────────────────────────────────────────────────

export interface RateInput {
  numerator: number;
  denominator: number;
}

/** A rate from sums, never from exported ratios; null when the denominator is 0. */
export function rateOf(r: RateInput): number | null {
  return r.denominator > 0 ? r.numerator / r.denominator : null;
}

export interface InteractionResult {
  raw_rate: number;
  expected_rate: number;
  /** Empirical-Bayes shrinkage towards the expected rate with prior weight m. */
  adjusted_rate: number;
  interaction_index: number;
  adjusted_index: number;
  volume: number;
}

/**
 * Spec §12: expected_rate = segment_baseline × asset_baseline / overall_baseline;
 * interaction_index = joint_cell_rate / expected_rate. Rates from sums;
 * sparse cells shrink towards the expectation so they cannot become false
 * winners. Null when any baseline is undefined.
 */
export function interactionIndex(args: {
  joint: RateInput;
  segment: RateInput;
  asset: RateInput;
  overall: RateInput;
  priorWeight?: number;
}): InteractionResult | null {
  const joint = rateOf(args.joint);
  const seg = rateOf(args.segment);
  const asset = rateOf(args.asset);
  const overall = rateOf(args.overall);
  if (joint === null || seg === null || asset === null || overall === null || overall === 0) return null;
  const expected = (seg * asset) / overall;
  if (expected === 0) return null;
  const m = args.priorWeight ?? 1000;
  const adjusted = (args.joint.numerator + m * expected) / (args.joint.denominator + m);
  return {
    raw_rate: joint,
    expected_rate: expected,
    adjusted_rate: adjusted,
    interaction_index: joint / expected,
    adjusted_index: adjusted / expected,
    volume: args.joint.denominator,
  };
}

/** The canonical `confidence_level` vocabulary (IAP_DATA_BUNDLE_PREP v2.0, blueprint §8.3). */
export type VolumeConfidence = "high" | "medium" | "validation_required" | "insufficient";

/**
 * The DOCUMENTED confidence classification, implemented literally
 * (docs/prompts/IAP_DATA_BUNDLE_PREP_v2.0.md "confidence_level";
 * docs/architecture/METRIX_IAP_MASTER_BLUEPRINT_v2.0.md §8.3):
 *
 *   high                 > 100 conversions OR > $1,000 spend
 *   medium               10–100 conversions OR $100–1,000 spend
 *   validation_required  < 10 conversions OR < $100 spend, but promising
 *   insufficient         below the minimum thresholds (the prompt's own
 *                        floor: < $50 spend or < 10 impressions)
 *
 * "Conversions" is the terminal-stage result of the derived objective — the
 * `results` a row carries — never purchases assumed. The qualitative
 * modifiers ("with a consistent pattern", "directional", "promising") are
 * not evaluated by this function; it classifies the numeric bands only and
 * the evidence state / coverage carry the rest. The shipped concept tier
 * (`creativeComponents.volumeConfidence`: high ≥ $500 and ≥ 30) predates
 * this and deviates from the canonical bands — recorded in register §14 as
 * an owner decision, not changed here.
 */
export function confidenceLevel(spend: number, conversions: number, impressions: number | null = null): VolumeConfidence {
  if (conversions > 100 || spend > 1000) return "high";
  if (conversions >= 10 || spend >= 100) return "medium";
  const belowFloor = spend < 50 || (impressions !== null && impressions < 10);
  if (belowFloor && conversions < 1) return "insufficient";
  return "validation_required";
}
