// ═══════════════════════════════════════════════════════════════════════
// METRIX IAP — Full Type System
// All types are structured for future Supabase wiring without rebuild.
// ═══════════════════════════════════════════════════════════════════════

// ─── Core Taxonomy ────────────────────────────────────────────────────

export type ConfidenceLabel =
  | "high"             // >100 conversions OR >$1,000 spend with consistent pattern
  | "medium"           // directional, below high threshold
  | "validation_required" // promising signal, insufficient spend or time
  | "insufficient";   // cannot support action

export type PerformanceTier = 1 | 2 | 3 | 4;
// Tier 1 — Scale Winners
// Tier 2 — Optimize Candidates
// Tier 3 — Test / Pivot
// Tier 4 — Eliminate

export type BudgetBand =
  | "critical_scale"   // 60% budget band, +20% lift vs baseline
  | "scale"            // 25% band, +10–19% lift
  | "optimize"         // 10% band, 0–9% performance
  | "validate"         // 5% band, new/unproven
  | "retire";          // −20% or worse

export type DecisionType =
  | "Scale"
  | "Hold"
  | "Isolate"
  | "Kill"
  | "Rebuild"
  | "Retest"
  | "Brief Next Sprint";

export type DecisionStatus =
  | "Open"
  | "Accepted"
  | "Rejected"
  | "In Progress"
  | "Completed"
  | "Needs Review";

export type MSTCellResult =
  | "universal_winner"
  | "avatar_specific"
  | "underperformer"
  | "neutral"
  | "insufficient_data";

export type WorkspaceType = "Agency" | "Brand" | "Client" | "Internal";

export type WorkspaceHealthStatus =
  | "Healthy"
  | "Watch"
  | "Needs Action"
  | "Critical";

export type AdPlatform = "Meta" | "Google" | "TikTok" | "YouTube" | "Pinterest";

export type AdAccountStatus =
  | "Connected"
  | "Manual CSV Mode"
  | "Needs Attention"
  | "API Sync Coming Soon";

export type ImportStatus =
  | "Uploaded"
  | "Validating"
  | "Needs Mapping"
  | "Warning"
  | "Ready"
  | "Processed"
  | "Failed";

export type AnalysisRunStatus =
  | "Pending"
  | "Running"
  | "Completed"
  | "Failed"
  | "Archived";

export type BriefStatus =
  | "Draft"
  | "In Review"
  | "Approved"
  | "In Production"
  | "Archived";

export type ReportStatus = "Draft" | "In Review" | "Final" | "Sent";

export type UserRole =
  | "Master Admin"
  | "Workspace Admin"
  | "Strategist"
  | "Media Buyer"
  | "Creative Strategist"
  | "Client Viewer"
  | "Read Only";

export type AnalysisDepth =
  | "Fast Read"
  | "Full IAP Analysis"
  | "Creative Sprint Analysis"
  | "Executive Report"
  | "Investor/Demo Mode";

export type AnalysisObjective =
  | "Purchase volume"
  | "CPA reduction"
  | "ROAS improvement"
  | "Lead quality"
  | "Creative fatigue diagnosis"
  | "Creative testing read"
  | "Scale readiness"
  | "Account audit"
  | "Next sprint planning"
  | "Client reporting";

export type ChangeEventCategory =
  | "Campaign"
  | "Creative"
  | "Budget"
  | "Status"
  | "Name"
  | "Tracking";

// Variable code families
export type VariableCodeFamily = "CN" | "FW" | "HK" | "TN" | "CTA";

export interface VariableCode {
  family: VariableCodeFamily;
  code: string; // e.g. "HK_ProofFirst", "FW_ProblemSolution"
}

// ─── Users & Orgs ─────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_initials: string;
  role: UserRole;
  created_at: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface Workspace {
  id: string;
  org_id: string;
  name: string;
  type: WorkspaceType;
  slug: string;
  health_status: WorkspaceHealthStatus;
  client_name?: string;
  client_domain?: string;
  primary_contact?: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: UserRole;
  joined_at: string;
}

export interface Client {
  id: string;
  workspace_id: string;
  name: string;
  domain: string;
  contact_name: string;
  contact_email: string;
}

// ─── Ad Accounts ──────────────────────────────────────────────────────

export interface AdAccount {
  id: string;
  workspace_id: string;
  platform: AdPlatform;
  account_name: string;
  account_id_external: string;
  status: AdAccountStatus;
  last_import_at?: string;
  last_analysis_at?: string;
  spend_analyzed_usd: number;
  data_quality_score: number; // 0–100
  open_recommendations: number;
  platform_label?: string; // e.g. "PMax — Retargeting Only"
  currency: string;
  notes?: string;
}

// ─── Imports ──────────────────────────────────────────────────────────

export type ImportFileType =
  | "demographic_text"      // Demographic + Text breakdown
  | "device_placement_platform"; // Device + Placement + Platform breakdown

export interface ImportFile {
  id: string;
  import_id: string;
  file_type: ImportFileType;
  filename: string;
  row_count: number;
  date_range_start: string;
  date_range_end: string;
  status: ImportStatus;
  warnings: string[];
}

export interface Import {
  id: string;
  workspace_id: string;
  ad_account_id: string;
  status: ImportStatus;
  files: ImportFile[];
  date_range_start: string;
  date_range_end: string;
  created_at: string;
  processed_at?: string;
  created_by: string;
  warnings: string[];
  error?: string;
}

export interface ColumnMapping {
  id: string;
  import_id: string;
  source_column: string;
  mapped_to: string;
  status: "mapped" | "needs_mapping" | "ignored";
}

// ─── Campaign Hierarchy ────────────────────────────────────────────────

export interface Campaign {
  id: string;
  workspace_id: string;
  ad_account_id: string;
  name: string;
  status: "Active" | "Paused" | "Ended";
  objective: string;
  tier: PerformanceTier;
  confidence: ConfidenceLabel;
  budget_band: BudgetBand;
  spend_usd: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cpa_usd: number;
  roas: number;
  date_start: string;
  date_end?: string;
  notes?: string;
}

export interface AdSet {
  id: string;
  campaign_id: string;
  workspace_id: string;
  ad_account_id: string;
  name: string;
  status: "Active" | "Paused" | "Ended";
  audience_description: string;
  tier: PerformanceTier;
  confidence: ConfidenceLabel;
  spend_usd: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cpa_usd: number;
  roas: number;
}

export interface Ad {
  id: string;
  ad_set_id: string;
  campaign_id: string;
  workspace_id: string;
  ad_account_id: string;
  name: string;
  status: "Active" | "Paused" | "Rejected" | "Archived";
  creative_concept_id?: string;
  tier: PerformanceTier;
  confidence: ConfidenceLabel;
  budget_band: BudgetBand;
  variable_codes: string[]; // e.g. ["HK_ProofFirst", "FW_PAS", "TN_Assertive"]
  spend_usd: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversion_type: string; // "Purchase" | "Lead" | "Registration" | "Trial"
  ctr: number;
  cpa_usd: number;
  roas: number;
  hook_score?: number; // 0–100
  fatigue_signal?: "fresh" | "mild_fatigue" | "fatigued" | "burnt";
  headline?: string;
  primary_text?: string;
  cta_text?: string;
  format?: "Feed" | "Story" | "Reel" | "Carousel" | "Collection";
  language?: "EN" | "ES" | "EN/ES";
}

// ─── Creative ─────────────────────────────────────────────────────────

export interface CreativeAsset {
  id: string;
  workspace_id: string;
  filename: string;
  format: "Feed" | "Story" | "Square" | "Reel";
  width_px: number;
  height_px: number;
  cell_id?: string;
}

export interface CreativeConcept {
  id: string;
  workspace_id: string;
  name: string; // descriptive: "Founder-led proof hook for skeptical buyers"
  cell_id: string; // e.g. "C2B", "C4E"
  concept_id: string; // e.g. "C1", "C2"
  primary_message: string;
  secondary_message?: string;
  visual_system: string;
  hook_variable: string;
  tone_variable: string;
  framework_variable: string;
  concept_variable: string;
  proof_variable: string;
  cta_variable: string;
  stage: "TOF" | "MOF" | "BOF" | "TOF to MOF";
  tier: PerformanceTier;
  confidence: ConfidenceLabel;
  fatigue_state: "fresh" | "mild_fatigue" | "fatigued" | "burnt";
  account_fit: string[];
  winning_segments: string[];
  iap_read: string;
  recommended_action: "Keep" | "Extend" | "Retire" | "Validate";
  related_ads: string[]; // ad IDs
  related_briefs: string[]; // brief IDs
}

export interface CreativeVariable {
  id: string;
  workspace_id: string;
  code: string; // e.g. "HK_ProofFirst"
  family: VariableCodeFamily;
  label: string; // human-readable
  performance_index: number; // 0–200, 100 = baseline
  usage_count: number;
  win_rate: number; // 0–1
}

// ─── ICP Profiles ─────────────────────────────────────────────────────

export interface ICPProfile {
  profile_id: string;
  workspace_id: string;
  profile_name: string;
  demographic_foundation: string;
  psychographic_profile: string;
  behavioral_signals: string[];
  funnel_entry_point: string;
  performance_data: {
    avg_cpa_usd: number;
    avg_roas: number;
    conversion_rate: number;
    primary_platform: string;
    primary_placement: string;
  };
  message_resonance: string[];
  strategic_recommendation: string;
  confidence_level: ConfidenceLabel;
}

// ─── Fact Tables ──────────────────────────────────────────────────────

export interface FactAdInsightsDaily {
  id: string;
  ad_id: string;
  workspace_id: string;
  date: string;
  spend_usd: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cpm_usd: number;
  cpc_usd: number;
  cpa_usd: number;
  roas: number;
}

export interface FactBreakdownDemographicText {
  id: string;
  ad_account_id: string;
  workspace_id: string;
  import_id: string;
  date_range_start: string;
  date_range_end: string;
  age_range: string;
  gender: "male" | "female" | "unknown";
  ad_name: string;
  spend_usd: number;
  impressions: number;
  conversions: number;
  cpa_usd: number;
  roas: number;
}

export interface FactBreakdownDevicePlacementPlatform {
  id: string;
  ad_account_id: string;
  workspace_id: string;
  import_id: string;
  date_range_start: string;
  date_range_end: string;
  device: "mobile" | "desktop" | "tablet";
  placement: string;
  platform: string;
  ad_name: string;
  spend_usd: number;
  impressions: number;
  conversions: number;
  cpa_usd: number;
  roas: number;
}

// ─── Analysis Runs ────────────────────────────────────────────────────

export interface SignalQualityScore {
  tracking_confidence: number;          // 0–100
  conversion_volume_confidence: number;
  spend_sufficiency: number;
  creative_diversity: number;
  learning_stability: number;
  funnel_consistency: number;
  segment_clarity: number;
  data_cleanliness: number;
  date_range_reliability: number;
  breakdown_usefulness: number;
  overall: number;
}

export interface Finding {
  id: string;
  run_id: string;
  workspace_id: string;
  title: string;
  body: string;
  dimension: string; // one of the 11 IAP analysis dimensions
  confidence: ConfidenceLabel;
  tier?: PerformanceTier;
  is_priority_read: boolean;
  is_open: boolean; // false = resolved
  tags: string[];
  created_at: string;
}

export interface Recommendation {
  id: string;
  run_id: string;
  workspace_id: string;
  title: string;
  rationale: string;
  action: string;
  priority: "Critical" | "High" | "Medium" | "Low";
  confidence: ConfidenceLabel;
  owner?: string;
  status: "Open" | "In Progress" | "Completed" | "Dismissed";
  created_at: string;
}

export interface DecisionFeedItem {
  id: string;
  run_id: string;
  workspace_id: string;
  decision_type: DecisionType;
  tier: PerformanceTier;
  confidence_label: ConfidenceLabel;
  evidence: string;
  supporting_metric: string;
  why_it_matters: string;
  action: string;
  risk_if_ignored: string;
  owner: string;
  status: DecisionStatus;
  budget_band?: BudgetBand;
  ad_id?: string;
  ad_name?: string;
  created_at: string;
  updated_at: string;
}

export interface AnalysisRun {
  id: string;
  workspace_id: string;
  ad_account_id: string;
  import_ids: string[];
  status: AnalysisRunStatus;
  objective: AnalysisObjective;
  depth: AnalysisDepth;
  date_range_start: string;
  date_range_end: string;
  confidence_score: number; // 0–100
  cohort_key?: CohortKey; // v2.0 — primary cohort dimension for this run
  signal_quality: SignalQualityScore;
  priority_read: string; // primary diagnostic text
  executive_diagnosis: string;
  primary_constraint: string;
  primary_opportunity: string;
  recommended_next_action: string;
  risk_if_ignored: string;
  created_by: string;
  created_at: string;
  completed_at?: string;
  findings: Finding[];
  recommendations: Recommendation[];
  decision_feed: DecisionFeedItem[];
}

// ─── MST Matrix ───────────────────────────────────────────────────────

export interface MSTMatrixCell {
  id: string;
  matrix_id: string;
  row_index: number;
  col_index: number;
  is_diagonal: boolean;
  variable_code: string;
  icp_name: string;
  result: MSTCellResult;
  spend_usd: number;
  conversions: number;
  confidence: ConfidenceLabel;
  notes: string;
}

export interface MSTMatrix {
  id: string;
  run_id: string;
  workspace_id: string;
  name: string;
  description: string;
  row_labels: string[];   // cross-avatar variable signals
  col_labels: string[];   // avatar/ICP-specific patterns
  diagonal_hypothesis: string;
  cells: MSTMatrixCell[];
  created_at: string;
}

export interface SprintMatrix {
  id: string;
  run_id: string;
  workspace_id: string;
  concept: string;
  hook: string;
  angle: string;
  format: string;
  funnel_stage: string;
  hypothesis: string;
  budget_priority: BudgetBand;
  success_metric: string;
  confidence: ConfidenceLabel;
  production_notes: string;
  mst_matrix_id?: string;
}

// ─── Briefs ───────────────────────────────────────────────────────────

export interface CreativeBrief {
  id: string;
  workspace_id: string;
  run_id: string;
  cohort_key?: CohortKey; // v2.0 — cohort dimension the brief targets
  status: BriefStatus;
  title: string;
  objective: string;
  owner: string;
  created_at: string;
  updated_at: string;
  // Brief content
  diagnosis: string;
  audience_insight: string;
  winning_signal: string;
  messaging_direction: string;
  creative_concepts: BriefConcept[];
  hook_options: string[];
  offer_framing: string;
  proof_requirements: string[];
  visual_direction: string;
  format_guidance: string;
  funnel_stage: string;
  test_matrix: string;
  production_notes: string;
  do_not_do: string[];
  success_metric: string;
  export_url?: string;
}

export interface BriefConcept {
  name: string;
  hook: string;
  angle: string;
  variable_codes: string[];
  format: string;
  notes: string;
}

// ─── Reports ──────────────────────────────────────────────────────────

export interface Report {
  id: string;
  workspace_id: string;
  run_id: string;
  ad_account_id: string;
  cohort_key?: CohortKey; // v2.0 — primary cohort dimension reported on
  title: string;
  status: ReportStatus;
  client_ready: boolean;
  created_at: string;
  generated_by: string;
  date_range_start: string;
  date_range_end: string;
  // Report sections
  executive_summary: string;
  what_happened: string;
  what_it_means: string;
  what_to_do_next: string;
  creative_learnings: string;
  budget_decisions: string;
  next_sprint: string;
  appendix: string;
  export_url?: string;
}

// ─── Benchmark Memory ─────────────────────────────────────────────────

export interface BenchmarkMemory {
  id: string;
  workspace_id: string;
  ad_account_id?: string;
  benchmark_type: "account" | "concept" | "hook" | "offer" | "placement";
  label: string;
  cpa_range_min: number;
  cpa_range_max: number;
  roas_range_min: number;
  roas_range_max: number;
  fatigue_threshold_days: number;
  previous_winners: string[];
  false_positives: string[];
  rejected_recommendations: string[];
  recorded_at: string;
  notes: string;
}

// ─── Change Events ────────────────────────────────────────────────────

export interface ChangeEvent {
  id: string;
  workspace_id: string;
  ad_account_id: string;
  category: ChangeEventCategory;
  description: string;
  detected_at: string;
  source: "API Sync" | "Manual" | "Import Delta" | "User Action";
  potential_impact: "High" | "Medium" | "Low";
  related_performance_shift?: string;
  audit_detail: string;
  status: "New" | "Reviewed" | "Dismissed";
}

// ─── System / Audit ───────────────────────────────────────────────────

export interface AuditLog {
  id: string;
  workspace_id: string;
  user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface PromptVersion {
  id: string;
  name: string;
  version: string;
  description: string;
  phase: "analysis" | "reporting" | "strategy" | "brief" | "optimization";
  created_at: string;
}

export interface ModelRun {
  id: string;
  run_id: string;
  prompt_version_id: string;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
  status: "success" | "failed" | "timeout";
  created_at: string;
}

// ─── App-level aggregated types ───────────────────────────────────────

export interface WorkspaceWithData extends Workspace {
  ad_accounts: AdAccount[];
  members: WorkspaceMember[];
  latest_run?: AnalysisRun;
  open_decisions: number;
  priority_decisions: number;
  total_spend_analyzed: number;
}

export interface MasterCommandCenterData {
  org: Organization;
  workspaces: WorkspaceWithData[];
  total_ad_accounts: number;
  open_iap_runs: number;
  priority_decisions: number;
  spend_analyzed_usd: number;
  briefs_generated: number;
  needs_attention: NeedsAttentionItem[];
  recent_runs: AnalysisRun[];
  recent_imports: Import[];
  recent_briefs: CreativeBrief[];
  recent_reports: Report[];
  global_decision_feed: DecisionFeedItem[];
}

export interface NeedsAttentionItem {
  workspace_id: string;
  workspace_name: string;
  type: "decision" | "tracking_issue" | "budget_alert" | "creative_fatigue" | "low_signal";
  message: string;
  severity: "Critical" | "High" | "Medium";
  created_at: string;
}

// ═══════════════════════════════════════════════════════════════════════
// V2.0 SCHEMA — Four-Plane Architecture
// Added to match Section 11 of the blueprint.
// ═══════════════════════════════════════════════════════════════════════

// ─── Cohort System (Section 6.3) ──────────────────────────────────────

export type CohortKey =
  | "age_gender"
  | "placement"
  | "device"
  | "creative_angle"
  | "funnel_stage"
  | "language"
  | "geography"
  | "audience_type";

export interface CohortDefinition {
  id: string;
  cohort_key: CohortKey;
  label: string;
  description: string;
  funnel_stages: string[];
  kpi_targets: Record<string, number>; // e.g. { cpa_max_usd: 45, roas_min: 2.0 }
  created_at: string;
}

export interface ClientEnabledCohort {
  id: string;
  client_id: string;
  workspace_id: string;
  cohort_key: CohortKey;
  cohort_definition_id: string;
  is_primary: boolean;
  priority: number; // 1 = highest priority
  funnel_stages: string[];
  kpi_targets: Record<string, number>;
  enabled: boolean;
  updated_at: string;
}

// ─── Analysis Run Pipeline (11-prompt chain) ──────────────────────────

export type AnalysisRunStageStatus = "pending" | "running" | "complete" | "failed" | "skipped";

export interface AnalysisRunStage {
  id: string;
  run_id: string;
  stage_number: number; // 1–11
  stage_name: string;
  prompt_label: string;
  status: AnalysisRunStageStatus;
  started_at?: string;
  completed_at?: string;
  duration_ms?: number;
  output_summary?: string;
  error_message?: string;
}

export interface AnalysisRunCohort {
  id: string;
  run_id: string;
  cohort_key: CohortKey;
  cohort_definition_id: string;
  snapshot_label: string;
  was_primary: boolean;
  kpi_targets_snapshot: Record<string, number>;
}

// ─── Intelligence Cards (Section 11 / replacing Decision Feed) ────────

export type IntelligenceCardType =
  | "performance_insight"
  | "creative_signal"
  | "budget_signal"
  | "audience_signal"
  | "tracking_alert"
  | "fatigue_alert"
  | "opportunity";

export type IntelligenceCardSubtype =
  | "tier_change"
  | "creative_fatigue"
  | "hook_winner"
  | "audience_mismatch"
  | "cpa_spike"
  | "roas_recovery"
  | "tracking_gap"
  | "scale_candidate"
  | "retire_candidate"
  | "validation_needed";

export type EntityScope = "campaign" | "ad_set" | "ad" | "creative" | "account";

export type ReviewStatus = "needs_review" | "reviewed" | "approved" | "rejected";

export type ApprovedFor =
  | "internal_use"
  | "client_report"
  | "creative_brief"
  | "strategy_export"
  | "learning_registry";

export interface IntelligenceCard {
  id: string;
  run_id: string;
  workspace_id: string;
  cohort_key: CohortKey;
  card_type: IntelligenceCardType;
  card_subtype: IntelligenceCardSubtype;
  entity_scope: EntityScope;
  entity_id?: string;
  entity_name?: string;
  title: string;
  evidence_summary: string;
  recommendation: string;
  confidence_grade: ConfidenceLabel;
  priority: "Critical" | "High" | "Medium" | "Low";
  severity: "Critical" | "High" | "Medium" | "Low";
  review_status: ReviewStatus;
  approved_for?: ApprovedFor[];
  feeds_learning_registry: boolean;
  created_at: string;
  updated_at: string;
}

// ─── BSIL Suggestions (Section 10.1 — budget objects only) ───────────

export type BSILSuggestionType =
  | "increase_budget"
  | "decrease_budget"
  | "reallocate_budget"
  | "pause_campaign"
  | "scale_ad_set"
  | "consolidate_ad_sets";

export type BSILBudgetScopeObject = "campaign" | "ad_set";

export type BSILStatus = "pending" | "approved" | "rejected" | "executed_manually";

export interface BSILSuggestion {
  id: string;
  run_id: string;
  workspace_id: string;
  cohort_key: CohortKey;
  budget_scope_object: BSILBudgetScopeObject;
  entity_id: string;
  entity_name: string;
  suggestion_type: BSILSuggestionType;
  rationale: string;
  confidence_grade: ConfidenceLabel;
  status: BSILStatus;
  suggested_delta_usd?: number;
  suggested_delta_pct?: number;
  review_status: ReviewStatus;
  created_at: string;
  updated_at: string;
}

// ─── Review & Approval Events (Section 11.4) ──────────────────────────

export type ReviewableEntityType =
  | "intelligence_card"
  | "report"
  | "creative_brief"
  | "bsil_suggestion";

export interface ReviewEvent {
  id: string;
  workspace_id: string;
  entity_type: ReviewableEntityType;
  entity_id: string;
  reviewer_id: string;
  review_status: ReviewStatus;
  notes?: string;
  created_at: string;
}

export interface ApprovalEvent {
  id: string;
  workspace_id: string;
  entity_type: ReviewableEntityType;
  entity_id: string;
  approver_id: string;
  approved_for: ApprovedFor;
  feeds_learning_registry: boolean;
  notes?: string;
  created_at: string;
}

export interface HumanEdit {
  id: string;
  workspace_id: string;
  entity_type: ReviewableEntityType;
  entity_id: string;
  editor_id: string;
  field_name: string;
  old_value: string;
  new_value: string;
  edit_reason?: string;
  created_at: string;
}

// ─── Creative Alignment Checks ────────────────────────────────────────

export type ResolutionPath = "naming_convention" | "ad_id_fallback" | "unresolved";

export type ThresholdStatus = "pass" | "flagged";

export type CheckStage = "pre_publish" | "post_hoc";

export interface CreativeAlignmentCheck {
  id: string;
  creative_concept_id: string;
  workspace_id: string;
  resolution_path: ResolutionPath;
  alignment_score?: number; // 0–100; undefined if unresolved
  threshold_status?: ThresholdStatus;
  check_stage: CheckStage;
  user_bypassed: boolean;
  bypass_reason?: string;
  checked_at: string;
}

// ─── Alert Rules ──────────────────────────────────────────────────────

export type AlertRuleCondition =
  | "cpa_above_threshold"
  | "roas_below_threshold"
  | "fatigue_score_critical"
  | "tracking_gap_detected"
  | "spend_anomaly";

export interface AlertRule {
  id: string;
  workspace_id: string;
  cohort_key?: CohortKey;
  condition: AlertRuleCondition;
  threshold_value: number;
  severity: "Critical" | "High" | "Medium";
  is_active: boolean;
  created_by: string;
  created_at: string;
}

// ─── Learning Registry (Section 11.4) ─────────────────────────────────

export interface LearningRegistryEntry {
  id: string;
  workspace_id: string;
  cohort_key: CohortKey;
  entity_type: ReviewableEntityType;
  entity_id: string;
  entity_title: string;
  approved_for: ApprovedFor;
  approval_event_id: string;
  signal_summary: string;
  confidence_grade: ConfidenceLabel;
  feeds_optimization_loop: boolean;
  recorded_at: string;
  is_superseded: boolean;
  superseded_by?: string;
}

// ─── Updated AnalysisRun with v2.0 fields ─────────────────────────────

export interface AnalysisRunV2 extends AnalysisRun {
  cohort_key: CohortKey;
  stages: AnalysisRunStage[];
  active_cohorts: AnalysisRunCohort[];
  intelligence_cards: IntelligenceCard[];
  bsil_suggestions: BSILSuggestion[];
}
