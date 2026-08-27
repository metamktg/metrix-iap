// ─── Metrix seed bundle types ─────────────────────────────────────────
// Types mirror the shape of metrix_bookster_seed_bundle_v1.json.
// Field names with spaces/parens come straight from the source export.

export interface SeedResultEventTotals {
  spend: number;
  reach: number;
  impressions: number;
  results: number;
  clicks_all: number;
  link_clicks: number;
}

export interface ManagerBottomLineTotals {
  spend_usd: number;
  impressions: number;
  link_clicks: number;
  link_ctr_pct: number | null;
  result_totals_by_event: Record<string, SeedResultEventTotals>;
}

export type SeedImpact = "high" | "medium" | "low" | "setup" | string;

export interface RecommendationCard {
  id: string;
  account_id: string;
  scope: string;
  title: string;
  rationale: string;
  impact: SeedImpact;
  confidence: string;
  source_path?: string;
  recommended_action: string;
  manager_card_descriptor?: string;
}

export interface ManagerAccount {
  id: string;
  name: string;
  type: string;
  overview_mode: string;
  configured_ad_accounts: number;
  unconfigured_ad_accounts: number;
  bottom_line_totals: ManagerBottomLineTotals;
  recommendation_cards: RecommendationCard[];
}

// ─── Analysis ─────────────────────────────────────────────────────────

export interface CellPerformanceRow {
  cell_id: string;
  "Result type": string;
  "Amount spent (USD)": number;
  Reach: number;
  Impressions: number;
  Results: number;
  "Clicks (all)": number;
  "Link clicks": number;
  CPA_result: number | null;
  CTR_link_pct: number;
  Result_per_link_click_pct: number;
  book2_concept_name: string;
  legacy_library_match?: string;
  hook_variable?: string;
  tone_variable?: string;
  framework_variable?: string;
  concept_variable?: string;
  pain_proof_variable?: string;
  proof_variable?: string;
  cta_variable?: string;
  /** Registry `funnel_stage` (ST_) code — distinct from `stage`, which is a human display label (e.g. "TOF"/"MOF"), never a registry code. */
  funnel_stage_variable?: string;
  awareness_variable?: string;
  stage?: string;
  iap_read?: string;
  /** Downstream funnel counts — present when the performance export carries them. */
  adds_to_cart?: number | null;
  checkouts_initiated?: number | null;
  purchases?: number | null;
}

/**
 * The concept hint a scoping helper reads off a cell-keyed row when the
 * cell_id doesn't encode the concept itself (LittleData historical cells,
 * whose cell_id is an ad name).
 *
 * Declared as an indexed access into CellPerformanceRow ON PURPOSE: both
 * run-scope and date-scope used to reach for this field through
 * `(r as Record<string, unknown>)["concept_variable"]`, so renaming it on
 * the row type silently yielded `undefined` — the hint vanished, rows
 * quietly fell in or out of scope, and neither the compiler nor the
 * runtime said a word. Renaming it now breaks this line first.
 */
export type ConceptHint = CellPerformanceRow["concept_variable"];

/** A cell-keyed row that may carry an explicit concept hint. */
export interface ConceptScopedRow {
  cell_id: string;
  concept_variable?: ConceptHint | null;
}

export interface VariablePerformanceRow {
  variable_family: string;
  variable_id: string;
  "Result type": string;
  "Amount spent (USD)": number;
  Reach: number;
  Impressions: number;
  Results: number;
  "Clicks (all)": number;
  "Link clicks": number;
  unique_ads: number;
  CPA_result: number | null;
  CTR_link_pct: number;
  Result_per_link_click_pct: number;
  /**
   * Which analysis run measured this variable. variable_performance retains
   * one row per run (schema.sql's ..._run_key), so aggregating without
   * scoping by this counts the same spend once per run. Null on
   * pre-migration rows, which are kept under every scope.
   */
  manual_analysis_run_id?: string | null;
  date_start?: string | null;
  date_end?: string | null;
}

export interface DemographicRow {
  cell_id: string;
  "Ad name": string;
  Age: string;
  Gender: string;
  "Amount spent (USD)": number;
  Reach: number;
  Impressions: number;
  Results: number;
  "Clicks (all)": number;
  "Link clicks": number;
  CPA_result: number | null;
  CTR_link_pct: number;
  Result_per_link_click_pct: number;
  book2_concept_name?: string;
  /** Downstream funnel counts (ecommerce cohort), present only when the source export carried them. */
  adds_to_cart?: number | null;
  checkouts_initiated?: number | null;
  purchases?: number | null;
  /** "Adds to cart conversion value" $ total — only present on newer exports that carry it directly. */
  adds_to_cart_value?: number | null;
}

export interface PlacementRow {
  Placement: string;
  Platform: string;
  "Amount spent (USD)": number;
  Impressions: number;
  "Link clicks": number;
  Results: number;
  CPA: number | null;
  CTR_link_pct?: number;
}

/**
 * Conversion-based funnel row (Meta conversion-device export): funnel
 * actions attributed to the converting device/platform/placement.
 * Spend/impressions are not attributable under this tracking basis, so
 * no CPA/CTR exist on this surface by design.
 */
export interface ConversionFunnelRow {
  date_start: string;
  date_end: string;
  link_clicks: number | null;
  adds_to_cart: number | null;
  checkouts_initiated: number | null;
  purchases: number | null;
  confidence: string | null;
}

export interface ConversionTrackingSignal {
  tracking_basis: "conversion";
  window_start: string | null;
  window_end: string | null;
  note: string;
  devices: (ConversionFunnelRow & { device: string })[];
  platforms: (ConversionFunnelRow & { platform: string })[];
  placements: (ConversionFunnelRow & { placement: string })[];
}

/**
 * Delivery-based device row (device_kind='impression'): real spend/impressions
 * per device, mirroring the shape of v3/c4e placement signal rows. Can be
 * empty even when the account has delivery data elsewhere — Meta's export can
 * omit the "Impression device" breakdown for a given window/account (see
 * conversion_tracking_signal for the funnel-attributed fallback in that case).
 */
export interface DeviceDeliveryRow {
  device: string;
  date_start: string;
  date_end: string;
  spend: number | null;
  impressions: number | null;
  link_clicks: number | null;
  results: number | null;
  cpa: number | null;
}

export interface ConceptRollupRow {
  book: string;
  concept: string;
  date_start: string;
  date_end: string;
  /** Which analysis run produced this concept's rollup row. Null for
   *  pre-run-scoping legacy rows — those must always be treated as
   *  in-scope regardless of which run(s) are selected. */
  manual_analysis_run_id?: string | null;
  spend: number | null;
  link_clicks: number | null;
  results: number | null;
  cpa: number | null;
  cvr_link_pct: number | null;
  confidence: string | null;
  mapped_in_library: boolean;
  /** Stage 2 Analysis Core intelligence (computed by analysisEngine after
   *  each manual run; null/absent on importer-era and pre-Stage-2 rows). */
  buying_intent_score?: number | null;
  performance_lift_vs_baseline?: string | number | null;
  performance_tier?: string | null;
  confidence_level?: string | null;
}

export interface AnalysisData {
  performance_by_cell: CellPerformanceRow[];
  v3_variable_performance: VariablePerformanceRow[];
  /**
   * The newest SUCCESSFUL analysis run for this account, or null when none
   * has succeeded. The correct default scope for any view that shows "this
   * account" rather than "this run" — concept_rollup and
   * v3_variable_performance both accumulate a row per run, so the only
   * other available default was every run at once, which sums
   * re-measurements of the same period.
   */
  latest_analysis_run_id?: string | null;
  demographic_registration_signal: DemographicRow[];
  v3_placement_signal: PlacementRow[];
  c4e_placement_signal: PlacementRow[];
  /** Delivery-based device breakdown (real spend/impressions). Empty when Meta's export omitted the device dimension for this window — see conversion_tracking_signal.devices for the funnel-attributed fallback. */
  device_delivery_signal?: DeviceDeliveryRow[];
  top_checkout_cells: CellPerformanceRow[];
  top_checkout_variables: VariablePerformanceRow[];
  /** Cross-book (BOOK0 + BOOK2) concept view from the normalized bundle. */
  concept_rollup?: ConceptRollupRow[];
  /** Conversion-attributed device/platform/placement funnel signal (present when the account's import carried a conversion-device export). */
  conversion_tracking_signal?: ConversionTrackingSignal | null;
}

// ─── Strategy / Brief ─────────────────────────────────────────────────

export interface MessagePillar {
  id: string;
  label: string;
  source_cells: string[];
  plain_descriptor: string;
  why_it_matters: string;
  variable_stack: Record<string, string>;
  funnel_application?: string;
  execution_specifications?: string;
  placement_strategy?: string;
  scaling_guidance?: string;
  target_icps?: string[];
  /** 'generated' when produced by the in-app Metrix engine, else imported. */
  origin?: string;
}

export interface ActiveHypothesis {
  id: string;
  label: string;
  source: string;
  status: string;
  /** Explicit id of the message pillar this hypothesis tests. Absent when
   * the source data carries no link — such hypotheses stay honestly
   * unattached rather than being inferred from text. */
  pillar_id?: string;
  risk?: string;
  test_variant?: string;
  isolated_variable?: string;
  success_criteria?: string;
  expected_impact?: string;
  /** 'generated' when produced by the in-app Metrix engine, else imported. */
  origin?: string;
}

/** Full ICP profile from the real Strategy Map loop output. */
export interface ICPProfile {
  profile_id: string;
  profile_name: string;
  demographic_foundation?: string;
  psychographic_profile?: string;
  behavioral_signals?: string;
  funnel_entry_point?: string;
  performance_data?: {
    spend?: number | null;
    cpa?: number | null;
    cvr_link_pct?: number | null;
    confidence?: string | null;
  } | null;
  message_resonance?: string;
  strategic_recommendation?: string;
  confidence_level?: string;
  /** 'generated' when produced by the in-app Metrix engine, else imported. */
  origin?: string;
  [k: string]: unknown;
}

/** Winning/losing variable stack read from the Strategy Map loop output. */
export interface VariableCombination {
  combination: string;
  context?: string | null;
  cpa?: number | null;
  cvr_pct?: number | null;
  confidence?: string | null;
  recommendation?: string | null;
}

/** Scaling playbook buckets from the Strategy Map loop output. */
export interface ScalingPlaybook {
  scale_now?: string[];
  optimize?: string[];
  validate?: string[];
  explore?: string[];
  avoid_combinations?: string[];
  budget_reallocation_note?: string;
  [k: string]: unknown;
}

export interface StrategyData {
  /** 'generated' when the rendered set came from the in-app engine, 'imported' otherwise. */
  provenance?: string;
  message_pillars: MessagePillar[];
  active_hypotheses: ActiveHypothesis[];
  /** Full ICP profiles from the real Strategy Map loop output. */
  icp_profiles?: ICPProfile[];
  variable_combinations?: VariableCombination[];
  scaling_playbook?: ScalingPlaybook | null;
}

// ─── Brief status ─────────────────────────────────────────────────────
// Canonical lifecycle for creative briefs. Raw database values (including
// legacy *_from_seed suffixes) are normalised to this enum before display.

export type BriefStatus =
  | "generated"
  | "draft"
  | "in-review"
  | "approved"
  | "finalized"
  | "archived";

/**
 * Map any raw brief status string to a canonical `BriefStatus`.
 * All *_from_seed variants and unknown values map to "draft".
 */
export function normalizeBriefStatus(raw: string): BriefStatus {
  if (raw === "generated") return "generated";
  if (raw === "in-review") return "in-review";
  if (raw === "approved") return "approved";
  if (raw === "produced" || raw === "finalized") return "finalized";
  if (raw === "archived") return "archived";
  // draft, draft_from_seed, validation_draft_from_seed, control_refresh_from_seed → all draft
  return "draft";
}

export interface DraftBrief {
  id: string;
  source_pillar: string;
  asset_type: string;
  human_direction: string;
  plain_variable_descriptors: string[];
  status: string;
  book?: string;
  mode?: string;
  voice?: string;
  confidence?: string;
  /** Full Brief Builder loop output document for this brief. */
  full_brief?: Record<string, unknown>;
  /** 'generated' when produced by the in-app Metrix engine, else imported. */
  origin?: string;
}

export interface BriefBuilder {
  /** 'generated' when the rendered set came from the in-app engine, 'imported' otherwise. */
  provenance?: string;
  source_policy: string;
  draft_briefs: DraftBrief[];
}

// ─── Report builder ───────────────────────────────────────────────────

export interface ReportHistoryEntry {
  id: string;
  title: string;
  generated_at: string;
  branding: string;
  mode: "internal" | "client" | string;
  section_count: number;
  status: "draft" | "exported" | string;
  export_format: string | null;
  summary: string;
}

export interface ReportBuilder {
  default_branding: string;
  white_label_supported: boolean;
  logo_policy: string;
  export_formats: string[];
  report_sections: string[];
  report_history?: ReportHistoryEntry[];
}

// ─── Optimization loop ────────────────────────────────────────────────

export interface OptimizationLoop {
  visibility: string;
  manager_overview_visibility: boolean;
  recommendation_cards: RecommendationCard[];
  action_policy: string;
  dismiss_policy: string;
  source_policy?: string;
}

// ─── Core reanalysis / campaign summary ───────────────────────────────

export interface CoreReanalysisRead {
  primary_control: string;
  primary_control_read: string;
  // Null for accounts whose analysis has no secondary result control yet.
  registration_control: string | null;
  registration_control_read: string | null;
  data_caveat: string;
}

export interface CampaignWindow {
  campaign_name: string;
  book: string | null;
  os: string | null;
  date_start: string | null;
  date_end: string | null;
  result_type: string | null;
  spend: number | null;
}

export interface CampaignSummary {
  bottom_line_totals: Record<string, SeedResultEventTotals>;
  total_spend_usd: number;
  total_impressions: number;
  total_link_clicks: number;
  overall_link_ctr_pct: number | null;
  data_caveat: string;
  window_start?: string;
  window_end?: string;
  campaign_windows?: CampaignWindow[];
}

// ─── Listen ───────────────────────────────────────────────────────────

export interface SignalCard {
  id: string;
  account_id: string;
  scope: string;
  title: string;
  rationale: string;
  impact: SeedImpact;
  confidence: string;
  source_path?: string;
  recommended_action: string;

  // ── Structured signal contract (E1) ─────────────────────────────────
  // The card's analysis is prose. These state the parts a card FACE needs
  // alongside it — never instead of it — so a surface can lead with the
  // number rather than a sentence.
  //
  // Every one is `null` when the producer did not supply it, and NOTHING
  // derives them from the prose: a headline pattern-matched out of a
  // sentence is a fabricated headline, and a card face is where that does
  // the most damage. Treat null as "render the prose the way you do today",
  // never as "nothing to show" and never as a value to invent.
  /** Short card-face title, e.g. "Underspend". Null → fall back to `title`. */
  headline?: string | null;
  /** The number that matters, pre-formatted by the producer, e.g. "$57.97". */
  metric_value?: string | null;
  /** What that number is measured against, e.g. "of $1,000 committed". */
  metric_context?: string | null;
  /** Signed change where one is meaningful; null when it is not. */
  delta_pct?: number | null;
  /** One-sentence card-face reading (≤120 chars). */
  implication?: string | null;
  /** One imperative clause. Mirrors `recommended_action`. */
  action?: string | null;
  /** Evidence link. Mirrors `source_path`. */
  evidence_ref?: string | null;
  /** The full prose, for the drawer/disclosure layer. Mirrors `rationale`. */
  body?: string | null;

  // ── Normalized status axes (E3) ─────────────────────────────────────
  // Served ALONGSIDE the raw `impact` / `confidence`, which stay exactly as
  // they were — this is a read-boundary projection, not a rewrite.
  //
  // `null` on any axis means the raw value did not determine it. Fall back
  // to rendering the raw string; do NOT substitute a default bucket, or the
  // surface asserts a priority nobody measured.
  /** high impact → critical, medium → important, setup/low → informational. */
  priority?: "critical" | "important" | "informational" | null;
  /** Normalized confidence. Compound free text resolves to its WEAKEST part. */
  confidence_level?: "high" | "medium" | "low" | null;
  /**
   * The reading is not yet established (`validation_required`, `hypothesis`,
   * `insufficient`) as opposed to merely weak. Collapsing those to "low"
   * would lose exactly this distinction, so it travels separately.
   */
  needs_validation?: boolean;
}

// ─── MST ──────────────────────────────────────────────────────────────

export interface MSTLibraryCell {
  cell_id: string;

  concept_id: string;

  book2_concept_name: string;

  legacy_library_match?: string;

  mapped_ad_names: string[];

  primary_message: string;

  secondary_message: string;

  cta: string;

  visual_system: string;

  hook_variable?: string;

  tone_variable?: string;

  framework_variable?: string;

  concept_variable?: string;

  pain_proof_variable?: string;

  proof_variable?: string;

  cta_variable?: string;
  /** Registry `funnel_stage` (ST_) code — distinct from `stage`, which is a human display label (e.g. "TOF"/"MOF"), never a registry code. */

  funnel_stage_variable?: string;

  awareness_variable?: string;

  stage?: string;

  iap_read?: string;

  asset_filename?: string;

  aspect_ratio?: string;

  qa_mapping_status?: string;

  mapping_confidence?: string;
}

export interface MSTMatrixColumn {
  id: string;
  name: string;
  icp: string;
  /**
   * Strategy ICP profile ids this avatar column maps to, derived at the
   * data layer (seed assembly) from strategist-authored matrix-mode
   * creative briefs — never a client-side guess. Absent/empty when no
   * brief links this avatar to an ICP profile (unmapped → no link shown).
   */
  matched_profile_ids?: string[];
}

export interface MSTMatrixRow {
  id: string;
  shared: string;
  color: string;
}

export interface MSTMatrixCell {
  cell_id: string;
  column_id: string;
  row_id: string;
  column_label: string;
  row_shared_variable: string;
  diagonal_role?: string;
  concept_code: string;
  variable_stack: Record<string, string>;
  plain_text: {
    headline?: string;
    primary?: string;
    [k: string]: string | undefined;
  };
}

export interface MSTMatrix {
  columns: MSTMatrixColumn[];
  rows: MSTMatrixRow[];
  diagonal_down: string[];
  diagonal_up: string[];
  cells: MSTMatrixCell[];
}

export interface MST {
  status: string;
  render_policy: string;
  local_book2_library?: MSTLibraryCell[];
  historical_matrix_4x4?: MSTMatrix;
  source_artifacts?: string[];
}

// ─── Ads registry ─────────────────────────────────────────────────────

/**
 * Ad-level registry row. `meta_ad_id` and `creative_asset_url` are null
 * until raw Meta exports are backfilled via the importer; the UI renders
 * honest pending states while they are missing.
 */
export interface AdRecord {
  ad_name: string;
  book?: string | null;
  cell?: string | null;
  concept?: string | null;
  variation?: string | null;
  test_id?: string | null;
  meta_ad_id?: string | null;
  creative_asset_url?: string | null;
  asset_filename?: string | null;
  asset_servable?: boolean;
  /** Full-window per-ad aggregates from ad_performance — lets the client render a tile for every ad, even without a cell/concept code. */
  performance?: {
    spend: number;
    results: number;
    impressions: number;
    link_clicks: number;
    result_type: string | null;
  } | null;
}

// ─── Ad account ───────────────────────────────────────────────────────

export interface LoopStageStatus {
  stage: string;
  status: "complete" | "pending" | string;
  window_start?: string | null;
  window_end?: string | null;
  generated_at?: string | null;
  source_file?: string | null;
  note?: string | null;
}

export interface DataQualityFlag {
  kind: string;
  [k: string]: unknown;
}

export interface IAPData {
  metadata: Record<string, unknown>;
  core_reanalysis_read: CoreReanalysisRead;
  campaign_summary: CampaignSummary;
  analysis: AnalysisData;
  strategy: StrategyData;
  brief_builder: BriefBuilder;
  report_builder: ReportBuilder;
  /** Null until the Optimization Loop stage of the IAP loop has actually run. */
  optimization_loop: OptimizationLoop | null;
  /** Analysis Core intelligence output (summary, concept scores, failure patterns). */
  intelligence?: Record<string, unknown>;
  /** Data-gap surface: anomalies, quality flags, attribution notes. */
  data_quality?: DataQualityFlag[];
  /** Which IAP loop stages have real data behind them. */
  loop_status?: LoopStageStatus[];
}

export interface AdAccountOverviewState {
  title: string;
  description: string;
  primary_action: string;
  secondary_action: string;
}

/** Objective vocabulary (same four keys as the internal cohort registry). */
export type ObjectiveKey = "ecommerce" | "lead_gen" | "service" | "app";
export interface AdAccount {
  id: string;
  name: string;
  status: "configured" | "unconfigured" | string;
  platform: string;
  facebook_page_dp_url?: string | null;
  source_status?: string;
  /** Numeric Meta ad account id (no "act_" prefix) for Ads Manager deep links. Null until a raw Meta export supplies it. */
  meta_ad_account_id?: string | null;
  /**
   * Configured objectives set (one-or-more), set only during account setup
   * (Settings → General). Empty/absent until configured — analysis still
   * runs; unconfigured objectives are surfaced as non-blocking flags.
   */
  objectives?: ObjectiveKey[];
  /** Ad-level registry (ad_name → cell/concept + nullable meta_ad_id / creative_asset_url). */
  ads?: AdRecord[];
  overview_state?: AdAccountOverviewState;
  iap?: IAPData | null;
  mst?: MST;
  listen?: { signal_cards: SignalCard[] };
  /** Creative deconstruction classifications (uploaded creatives → IAP library). */
  creative_deconstructions?: CreativeDeconstruction[];
}

// ─── Creative deconstruction (uploaded creatives → IAP library) ───────

export interface DetectedCreativeVariable {
  /** Registry family (concept, framework, tonality, funnel_stage, awareness, pain_point, proof, hook). */
  family: string;
  /** Registry-prefixed code, e.g. CN_UGC, FW_PAS, TN_Warm. */
  code: string;
  /** 0..1 confidence the variable is genuinely expressed in the creative. */
  confidence: number;
  evidence?: string | null;
  user_edited?: boolean;
}

export interface CreativeDeconstruction {
  id: string;
  manual_import_id: string;
  filename: string;
  ad_names: string[];
  status: "unsupported" | "auto_filed" | "needs_review" | "user_overridden" | "discarded";
  variables: DetectedCreativeVariable[];
  /** Deterministic mean of per-variable confidences; null for unsupported files. */
  overall_confidence: number | null;
  detected_copy?: {
    primary_message?: string | null;
    secondary_message?: string | null;
    cta?: string | null;
    visual_system?: string | null;
  } | null;
  /** Linked brief id — null for historical/brief-less creatives. */
  brief_ref?: string | null;
  /** Brief-INTENDED variable codes (side-by-side comparison); null when no brief is linked. */
  brief_variables?: string[] | null;
  /** Library cell the entry was filed under (auto_filed / user_overridden only). */
  cell_id?: string | null;
  overridden_by?: string | null;
  overridden_at?: string | null;
  created_at: string;
  updated_at: string;
}

// ─── App defaults / root ──────────────────────────────────────────────

export interface AppDefaults {
  initial_view: string;
  active_manager_account_id: string;
  selected_ad_account_id: string | null;
  navigation: string[];
  forbidden_ui_terms: string[];
  data_isolation_rule: string;
}

// ─── Workspace settings (manager-wide, not account-scoped) ────────────

export interface WorkspaceTeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "active" | "invited" | string;
  last_active: string | null;
}

export interface WorkspaceRole {
  id: string;
  label: string;
  description: string;
}

export interface WorkspaceTeam {
  seat_limit: number;
  members: WorkspaceTeamMember[];
  roles: WorkspaceRole[];
  access_policy: string;
}

export interface NotificationEventPref {
  id: string;
  label: string;
  description: string;
  email: boolean;
  in_app: boolean;
}

export interface WorkspaceNotifications {
  channels: { id: string; label: string; enabled: boolean }[];
  events: NotificationEventPref[];
  digest: { frequency: string; day: string; description: string };
}

export interface WorkspaceInvoice {
  id: string;
  date: string;
  amount_usd: number;
  status: string;
}

export interface WorkspaceBilling {
  plan: string;
  price_usd_month: number;
  billing_cycle: string;
  renews_at: string;
  payment_method: string;
  included: string[];
  usage: {
    connected_ad_accounts: number;
    ad_account_limit: number;
    seats_used: number;
    seat_limit: number;
  };
  invoices: WorkspaceInvoice[];
}

export interface WorkspaceSettings {
  team: WorkspaceTeam;
  notifications: WorkspaceNotifications;
  billing: WorkspaceBilling;
}

export interface VariableRegistryEntry {
  prefix: string;
  family: string;
  status: "active" | "registry_missing" | string;
  note?: string | null;
}

export interface MetrixSeed {
  schema_version: string;
  generated_at: string;
  integrity_note: string;
  app_defaults: AppDefaults;
  manager_account: ManagerAccount;
  ad_accounts: AdAccount[];
  workspace_settings?: WorkspaceSettings;
  /** Data-layer truth about variable families, incl. explicit registry_missing (ST_/AW_/CTA_). */
  variable_registry?: VariableRegistryEntry[];
}
