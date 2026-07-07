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

export interface AnalysisData {
  performance_by_cell: CellPerformanceRow[];
  v3_variable_performance: VariablePerformanceRow[];
  demographic_registration_signal: DemographicRow[];
  v3_placement_signal: PlacementRow[];
  c4e_placement_signal: PlacementRow[];
  top_checkout_cells: CellPerformanceRow[];
  top_checkout_variables: VariablePerformanceRow[];
}

// ─── Strategy / Brief ─────────────────────────────────────────────────

export interface MessagePillar {
  id: string;
  label: string;
  source_cells: string[];
  plain_descriptor: string;
  why_it_matters: string;
  variable_stack: Record<string, string>;
}

export interface ActiveHypothesis {
  id: string;
  label: string;
  source: string;
  status: string;
  risk?: string;
}

export interface StrategyData {
  message_pillars: MessagePillar[];
  active_hypotheses: ActiveHypothesis[];
}

export interface DraftBrief {
  id: string;
  source_pillar: string;
  asset_type: string;
  human_direction: string;
  plain_variable_descriptors: string[];
  status: string;
}

export interface BriefBuilder {
  source_policy: string;
  draft_briefs: DraftBrief[];
}

// ─── Report builder ───────────────────────────────────────────────────

export interface ReportBuilder {
  default_branding: string;
  white_label_supported: boolean;
  logo_policy: string;
  export_formats: string[];
  report_sections: string[];
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

export interface CampaignSummary {
  bottom_line_totals: Record<string, SeedResultEventTotals>;
  total_spend_usd: number;
  total_impressions: number;
  total_link_clicks: number;
  overall_link_ctr_pct: number;
  data_caveat: string;
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

// ─── Ad account ───────────────────────────────────────────────────────

export interface IAPData {
  metadata: Record<string, unknown>;
  core_reanalysis_read: CoreReanalysisRead;
  campaign_summary: CampaignSummary;
  analysis: AnalysisData;
  strategy: StrategyData;
  brief_builder: BriefBuilder;
  report_builder: ReportBuilder;
  optimization_loop: OptimizationLoop;
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

export interface MetrixSeed {
  schema_version: string;
  generated_at: string;
  integrity_note: string;
  app_defaults: AppDefaults;
  manager_account: ManagerAccount;
  ad_accounts: AdAccount[];
}
