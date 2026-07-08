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
  link_ctr_pct: number;
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
  stage?: string;
  iap_read?: string;
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

export interface ConceptRollupRow {
  book: string;
  concept: string;
  date_start: string;
  date_end: string;
  spend: number | null;
  link_clicks: number | null;
  results: number | null;
  cpa: number | null;
  cvr_link_pct: number | null;
  confidence: string | null;
  mapped_in_library: boolean;
}

export interface AnalysisData {
  performance_by_cell: CellPerformanceRow[];
  v3_variable_performance: VariablePerformanceRow[];
  demographic_registration_signal: DemographicRow[];
  v3_placement_signal: PlacementRow[];
  c4e_placement_signal: PlacementRow[];
  top_checkout_cells: CellPerformanceRow[];
  top_checkout_variables: VariablePerformanceRow[];
  /** Cross-book (BOOK0 + BOOK2) concept view from the normalized bundle. */
  concept_rollup?: ConceptRollupRow[];
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
}

export interface ActiveHypothesis {
  id: string;
  label: string;
  source: string;
  status: string;
  risk?: string;
  test_variant?: string;
  isolated_variable?: string;
  success_criteria?: string;
  expected_impact?: string;
}

export interface StrategyData {
  message_pillars: MessagePillar[];
  active_hypotheses: ActiveHypothesis[];
  /** Full ICP profiles from the real Strategy Map loop output. */
  icp_profiles?: Record<string, unknown>[];
  variable_combinations?: Record<string, unknown>[];
  scaling_playbook?: Record<string, unknown> | null;
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
}

export interface BriefBuilder {
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
  registration_control: string;
  registration_control_read: string;
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
  overall_link_ctr_pct: number;
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

export interface AdAccount {
  id: string;
  name: string;
  status: "configured" | "unconfigured" | string;
  platform: string;
  facebook_page_dp_url?: string | null;
  source_status?: string;
  /** Numeric Meta ad account id (no "act_" prefix) for Ads Manager deep links. Null until a raw Meta export supplies it. */
  meta_ad_account_id?: string | null;
  /** Ad-level registry (ad_name → cell/concept + nullable meta_ad_id / creative_asset_url). */
  ads?: AdRecord[];
  overview_state?: AdAccountOverviewState;
  iap?: IAPData | null;
  mst?: MST;
  listen?: { signal_cards: SignalCard[] };
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
