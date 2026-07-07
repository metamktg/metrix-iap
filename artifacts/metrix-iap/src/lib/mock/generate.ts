// ═══════════════════════════════════════════════════════════════════════
// METRIX IAP — Programmatic Mock Data Generator
// SAMPLE/DEMO DATA — All scores, diagnoses, and decisions are seeded,
// not computed from live data.
// Uses template pools + combinatorial generation to hit volumes in spec.
// ═══════════════════════════════════════════════════════════════════════

import type {
  Organization, User, Workspace, WorkspaceMember, AdAccount,
  Import, ImportFile, Campaign, AdSet, Ad, CreativeConcept,
  CreativeVariable, ICPProfile, AnalysisRun, SignalQualityScore,
  Finding, Recommendation, DecisionFeedItem, MSTMatrix, MSTMatrixCell,
  CreativeBrief, Report, BenchmarkMemory, ChangeEvent, AuditLog,
  PromptVersion, ModelRun, ConfidenceLabel, PerformanceTier, BudgetBand,
  DecisionType, DecisionStatus,
  // V2.0 types
  CohortKey, CohortDefinition, ClientEnabledCohort,
  AnalysisRunStage, AnalysisRunStageStatus, AnalysisRunCohort,
  IntelligenceCard, IntelligenceCardType, IntelligenceCardSubtype, EntityScope,
  ReviewStatus, ApprovedFor, ReviewableEntityType,
  BSILSuggestion, BSILSuggestionType, BSILBudgetScopeObject, BSILStatus,
  ReviewEvent, ApprovalEvent, HumanEdit,
  CreativeAlignmentCheck, ResolutionPath, ThresholdStatus, CheckStage,
  AlertRule, AlertRuleCondition,
  LearningRegistryEntry,
} from "../types";

// ─── Seeded RNG (deterministic) ───────────────────────────────────────

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let _rand = mulberry32(42);
function rand() { return _rand(); }
function randInt(min: number, max: number) { return Math.floor(rand() * (max - min + 1)) + min; }
function randFloat(min: number, max: number) { return rand() * (max - min) + min; }
function pick<T>(arr: T[]): T { return arr[Math.floor(rand() * arr.length)]; }
function pickN<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(rand() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}
function id(prefix: string, n: number) { return `${prefix}_${String(n).padStart(4, "0")}`; }
function isoDate(daysAgo: number): string {
  const d = new Date(2026, 5, 27); // base: June 27, 2026
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0];
}

// ─── Template Pools ───────────────────────────────────────────────────

const HOOK_TEMPLATES = [
  "HK_ProofFirst", "HK_Benefit", "HK_Problem", "HK_Curiosity",
  "HK_Authority", "HK_Social", "HK_Urgency", "HK_Challenge",
  "HK_Result", "HK_Contrast",
];
const FRAMEWORK_TEMPLATES = [
  "FW_PAS", "FW_BAB", "FW_AIDA", "FW_ProblemSolution",
  "FW_StorySell", "FW_FeatureBenefit", "FW_Direct",
];
const TONE_TEMPLATES = [
  "TN_Assertive", "TN_Rational", "TN_Relatable", "TN_Aspirational",
  "TN_Deadpan", "TN_Warm", "TN_Urgent",
];
const CONCEPT_TEMPLATES = [
  "CN_ProductDemo", "CN_SocialProof", "CN_BehaviorShift", "CN_ValueProp",
  "CN_Comparison", "CN_FounderLed", "CN_UGC", "CN_Testimonial",
];
const CTA_TEMPLATES = [
  "CTA_StartFree", "CTA_TryFree", "CTA_LearnMore", "CTA_GetStarted",
  "CTA_ClaimOffer", "CTA_ShopNow", "CTA_QuizStart", "CTA_MessageUs",
];

const CONFIDENCE_LEVELS: ConfidenceLabel[] = ["high", "medium", "validation_required", "insufficient"];
const TIERS: PerformanceTier[] = [1, 2, 3, 4];
const BUDGET_BANDS: BudgetBand[] = ["critical_scale", "scale", "optimize", "validate", "retire"];
const DECISION_TYPES: DecisionType[] = ["Scale", "Hold", "Isolate", "Kill", "Rebuild", "Retest", "Brief Next Sprint"];
const DECISION_STATUSES: DecisionStatus[] = ["Open", "Accepted", "Rejected", "In Progress", "Completed", "Needs Review"];

// ─── Organization ─────────────────────────────────────────────────────

export const ORG: Organization = {
  id: "org_0001",
  name: "Meta Marketing Agency",
  slug: "meta-marketing-agency",
  created_at: isoDate(365),
};

// ─── Users ────────────────────────────────────────────────────────────

export const USERS: User[] = [
  { id: "usr_0001", email: "alex@metamarketing.agency", name: "Alex Chen", avatar_initials: "AC", role: "Master Admin", created_at: isoDate(360) },
  { id: "usr_0002", email: "jordan@metamarketing.agency", name: "Jordan Reeves", avatar_initials: "JR", role: "Workspace Admin", created_at: isoDate(300) },
  { id: "usr_0003", email: "priya@metamarketing.agency", name: "Priya Mehta", avatar_initials: "PM", role: "Strategist", created_at: isoDate(280) },
  { id: "usr_0004", email: "flora@skovpet.com", name: "Flora Yao", avatar_initials: "FY", role: "Client Viewer", created_at: isoDate(200) },
  { id: "usr_0005", email: "ginny@skovpet.com", name: "Ginny Mu", avatar_initials: "GM", role: "Client Viewer", created_at: isoDate(200) },
  { id: "usr_0006", email: "jan@bookster.ai", name: "Jan Kostadinov", avatar_initials: "JK", role: "Client Viewer", created_at: isoDate(150) },
  { id: "usr_0007", email: "media@metamarketing.agency", name: "Taylor Kim", avatar_initials: "TK", role: "Media Buyer", created_at: isoDate(240) },
  { id: "usr_0008", email: "creative@metamarketing.agency", name: "Sam Ortega", avatar_initials: "SO", role: "Creative Strategist", created_at: isoDate(220) },
  { id: "usr_0009", email: "dev@metrix.io", name: "Dev User", avatar_initials: "DV", role: "Workspace Admin", created_at: isoDate(60) },
];

// ─── Workspaces (6 fingerprinted) ─────────────────────────────────────

export const WORKSPACES: Workspace[] = [
  {
    id: "ws_mma",
    org_id: ORG.id,
    name: "Meta Marketing Agency",
    type: "Agency",
    slug: "meta-marketing-agency",
    health_status: "Healthy",
    description: "Master internal agency workspace. Team roster and cross-account rollups live here.",
    created_at: isoDate(365),
    updated_at: isoDate(1),
  },
  {
    id: "ws_skov",
    org_id: ORG.id,
    name: "SKOV Pet",
    type: "Brand",
    slug: "skov-pet",
    client_name: "Natural TeaSense Inc.",
    client_domain: "skovpet.com",
    primary_contact: "Flora Yao, Ginny Mu",
    health_status: "Healthy",
    description: "Dog supplement and treat brand. K9 Growth Accelerator engagement. World Cup tie-in and slow-feeder-bowl campaigns active.",
    created_at: isoDate(300),
    updated_at: isoDate(2),
  },
  {
    id: "ws_imco",
    org_id: ORG.id,
    name: "IMCO Wheels",
    type: "Client",
    slug: "imco-wheels",
    client_name: "IMCO Enterprise Inc.",
    client_domain: "imcowheels.com",
    primary_contact: "Ricardo Valdes",
    health_status: "Watch",
    description: "Miami truck and SUV customization shop. Bilingual EN/ES Meta campaign. WhatsApp-conversion funnel, not purchase or lead.",
    created_at: isoDate(280),
    updated_at: isoDate(3),
  },
  {
    id: "ws_kov",
    org_id: ORG.id,
    name: "King of Violence",
    type: "Client",
    slug: "king-of-violence",
    client_name: "King of Violence LLC",
    client_domain: "kingofviolence.com",
    primary_contact: "Chuck Liddell",
    health_status: "Needs Action",
    description: "Chuck Liddell's combat sports apparel brand. Partners: Justin Gaethje, Chris Camozzi. Shopify CRO account. ROAS improving 1.32x→1.86x but active at-risk retention situation.",
    created_at: isoDate(250),
    updated_at: isoDate(1),
  },
  {
    id: "ws_bookster",
    org_id: ORG.id,
    name: "Bookster",
    type: "Client",
    slug: "bookster",
    client_name: "Bookster.ai",
    client_domain: "bookster.ai",
    primary_contact: "Jan Kostadinov",
    health_status: "Watch",
    description: "AI book-summary app. Lead/trial-gen funnel. Registration flow restructured (moved to last, pre-paywall). Active pixel/CAPI tracking issue unresolved.",
    created_at: isoDate(200),
    updated_at: isoDate(1),
  },
  {
    id: "ws_metrix",
    org_id: ORG.id,
    name: "Metrix Internal",
    type: "Internal",
    slug: "metrix-internal",
    primary_contact: "Dev User",
    health_status: "Healthy",
    description: "Product team dogfooding and QA workspace. Lower spend volumes. Mostly Validate-tier and insufficient_data entries — sandbox only.",
    created_at: isoDate(60),
    updated_at: isoDate(1),
  },
];

// ─── Workspace Members ────────────────────────────────────────────────

export const WORKSPACE_MEMBERS: WorkspaceMember[] = [
  { id: "wm_0001", workspace_id: "ws_mma", user_id: "usr_0001", role: "Master Admin", joined_at: isoDate(365) },
  { id: "wm_0002", workspace_id: "ws_mma", user_id: "usr_0002", role: "Workspace Admin", joined_at: isoDate(300) },
  { id: "wm_0003", workspace_id: "ws_mma", user_id: "usr_0003", role: "Strategist", joined_at: isoDate(280) },
  { id: "wm_0004", workspace_id: "ws_mma", user_id: "usr_0007", role: "Media Buyer", joined_at: isoDate(240) },
  { id: "wm_0005", workspace_id: "ws_mma", user_id: "usr_0008", role: "Creative Strategist", joined_at: isoDate(220) },
  { id: "wm_0006", workspace_id: "ws_skov", user_id: "usr_0001", role: "Workspace Admin", joined_at: isoDate(300) },
  { id: "wm_0007", workspace_id: "ws_skov", user_id: "usr_0004", role: "Client Viewer", joined_at: isoDate(200) },
  { id: "wm_0008", workspace_id: "ws_skov", user_id: "usr_0005", role: "Client Viewer", joined_at: isoDate(200) },
  { id: "wm_0009", workspace_id: "ws_skov", user_id: "usr_0007", role: "Media Buyer", joined_at: isoDate(240) },
  { id: "wm_0010", workspace_id: "ws_imco", user_id: "usr_0001", role: "Workspace Admin", joined_at: isoDate(280) },
  { id: "wm_0011", workspace_id: "ws_imco", user_id: "usr_0003", role: "Strategist", joined_at: isoDate(280) },
  { id: "wm_0012", workspace_id: "ws_kov", user_id: "usr_0001", role: "Workspace Admin", joined_at: isoDate(250) },
  { id: "wm_0013", workspace_id: "ws_kov", user_id: "usr_0008", role: "Creative Strategist", joined_at: isoDate(250) },
  { id: "wm_0014", workspace_id: "ws_bookster", user_id: "usr_0001", role: "Workspace Admin", joined_at: isoDate(200) },
  { id: "wm_0015", workspace_id: "ws_bookster", user_id: "usr_0006", role: "Client Viewer", joined_at: isoDate(150) },
  { id: "wm_0016", workspace_id: "ws_bookster", user_id: "usr_0003", role: "Strategist", joined_at: isoDate(200) },
  { id: "wm_0017", workspace_id: "ws_metrix", user_id: "usr_0009", role: "Workspace Admin", joined_at: isoDate(60) },
  { id: "wm_0018", workspace_id: "ws_metrix", user_id: "usr_0001", role: "Master Admin", joined_at: isoDate(60) },
];

// ─── Ad Accounts (8) ──────────────────────────────────────────────────

export const AD_ACCOUNTS: AdAccount[] = [
  {
    id: "aa_mma_meta",
    workspace_id: "ws_mma",
    platform: "Meta",
    account_name: "Meta Marketing Agency — Main",
    account_id_external: "act_1234567890",
    status: "Connected",
    last_import_at: isoDate(7),
    last_analysis_at: isoDate(7),
    spend_analyzed_usd: 284_500,
    data_quality_score: 91,
    open_recommendations: 3,
    currency: "USD",
  },
  {
    id: "aa_skov_meta",
    workspace_id: "ws_skov",
    platform: "Meta",
    account_name: "Natural TeaSense Inc. — Meta",
    account_id_external: "act_2345678901",
    status: "Connected",
    last_import_at: isoDate(3),
    last_analysis_at: isoDate(3),
    spend_analyzed_usd: 62_400,
    data_quality_score: 84,
    open_recommendations: 5,
    currency: "USD",
  },
  {
    id: "aa_skov_google",
    workspace_id: "ws_skov",
    platform: "Google",
    account_name: "Natural TeaSense Inc. — Google PMax",
    account_id_external: "goog_987654321",
    status: "Manual CSV Mode",
    last_import_at: isoDate(14),
    spend_analyzed_usd: 18_200,
    data_quality_score: 67,
    open_recommendations: 2,
    platform_label: "PMax — Retargeting Only",
    currency: "USD",
    notes: "Google Ads configured strictly as retargeting/brand-protection layer. Not cold acquisition.",
  },
  {
    id: "aa_imco_meta",
    workspace_id: "ws_imco",
    platform: "Meta",
    account_name: "IMCO Enterprise Inc. — Meta",
    account_id_external: "act_3456789012",
    status: "Connected",
    last_import_at: isoDate(5),
    last_analysis_at: isoDate(5),
    spend_analyzed_usd: 41_800,
    data_quality_score: 78,
    open_recommendations: 7,
    currency: "USD",
    notes: "WhatsApp-conversion objective. Funnel ends in WhatsApp chat, not checkout.",
  },
  {
    id: "aa_kov_meta",
    workspace_id: "ws_kov",
    platform: "Meta",
    account_name: "King of Violence — Meta",
    account_id_external: "act_4567890123",
    status: "Needs Attention",
    last_import_at: isoDate(4),
    last_analysis_at: isoDate(4),
    spend_analyzed_usd: 38_900,
    data_quality_score: 72,
    open_recommendations: 9,
    currency: "USD",
    notes: "Shopify-based CRO account. ROAS improvement arc 1.32x→1.86x. Active at-risk retention situation.",
  },
  {
    id: "aa_bookster_meta",
    workspace_id: "ws_bookster",
    platform: "Meta",
    account_name: "Bookster.ai — Meta",
    account_id_external: "act_5678901234",
    status: "Needs Attention",
    last_import_at: isoDate(2),
    last_analysis_at: isoDate(2),
    spend_analyzed_usd: 94_600,
    data_quality_score: 61,
    open_recommendations: 11,
    currency: "USD",
    notes: "Active pixel/CAPI tracking issue. Lead-gen/trial funnel. Android primary driver of registration gains.",
  },
  {
    id: "aa_metrix_meta",
    workspace_id: "ws_metrix",
    platform: "Meta",
    account_name: "Metrix Internal — Test",
    account_id_external: "act_6789012345",
    status: "Manual CSV Mode",
    last_import_at: isoDate(30),
    spend_analyzed_usd: 4_200,
    data_quality_score: 45,
    open_recommendations: 2,
    currency: "USD",
    notes: "Sandbox / QA account. Low spend, mostly insufficient_data entries.",
  },
  {
    id: "aa_metrix_tiktok",
    workspace_id: "ws_metrix",
    platform: "TikTok",
    account_name: "Metrix Internal — TikTok Test",
    account_id_external: "tt_789012345",
    status: "API Sync Coming Soon",
    spend_analyzed_usd: 800,
    data_quality_score: 30,
    open_recommendations: 0,
    currency: "USD",
  },
];

// ─── Campaigns (30 across workspaces) ────────────────────────────────

function makeCampaign(
  n: number,
  wsId: string,
  aaId: string,
  name: string,
  objective: string,
  tier: PerformanceTier,
  confidence: ConfidenceLabel,
  spendUsd: number,
  roas: number,
  cpaUsd: number,
  daysAgo = 30
): Campaign {
  const conversions = Math.round(spendUsd / cpaUsd);
  const impressions = Math.round(spendUsd * randInt(400, 1200));
  const clicks = Math.round(impressions * randFloat(0.008, 0.035));
  const budgetBand: BudgetBand = tier === 1 ? "critical_scale" : tier === 2 ? "scale" : tier === 3 ? "optimize" : "retire";
  return {
    id: id("cmp", n),
    workspace_id: wsId,
    ad_account_id: aaId,
    name,
    status: tier === 4 ? "Paused" : "Active",
    objective,
    tier,
    confidence,
    budget_band: budgetBand,
    spend_usd: spendUsd,
    impressions,
    clicks,
    conversions,
    ctr: clicks / impressions,
    cpa_usd: cpaUsd,
    roas,
    date_start: isoDate(daysAgo + 30),
    date_end: tier === 4 ? isoDate(daysAgo) : undefined,
  };
}

export const CAMPAIGNS: Campaign[] = [
  // SKOV Pet
  makeCampaign(1, "ws_skov", "aa_skov_meta", "SKOV | World Cup | K9 Performance | TOF", "Conversions", 1, "high", 18_400, 3.2, 28.40, 14),
  makeCampaign(2, "ws_skov", "aa_skov_meta", "SKOV | Slow Feeder Bowl | MOF | Lookalike", "Conversions", 2, "medium", 11_200, 2.8, 34.10, 10),
  makeCampaign(3, "ws_skov", "aa_skov_meta", "SKOV | Dog Standards | Retargeting", "Conversions", 2, "high", 8_900, 4.1, 22.80, 8),
  makeCampaign(4, "ws_skov", "aa_skov_meta", "SKOV | Supplement Bundle | CBO Test", "Conversions", 3, "validation_required", 4_200, 1.9, 52.00, 6),
  makeCampaign(5, "ws_skov", "aa_skov_google", "SKOV | Brand Defense | PMax Retargeting", "Conversions", 2, "medium", 9_100, 3.8, 24.00, 14),
  // IMCO Wheels
  makeCampaign(6, "ws_imco", "aa_imco_meta", "IMCO | Truck Custom | WhatsApp | EN | TOF", "WhatsApp", 2, "medium", 12_400, 0, 31.20, 10),
  makeCampaign(7, "ws_imco", "aa_imco_meta", "IMCO | Ruedas Custom | WhatsApp | ES | TOF", "WhatsApp", 2, "medium", 9_800, 0, 28.70, 10),
  makeCampaign(8, "ws_imco", "aa_imco_meta", "IMCO | Retargeting | WhatsApp | EN/ES", "WhatsApp", 1, "high", 7_600, 0, 18.40, 8),
  makeCampaign(9, "ws_imco", "aa_imco_meta", "IMCO | Seasonal Lift | Summer | EN", "WhatsApp", 3, "validation_required", 3_200, 0, 44.00, 5),
  // King of Violence
  makeCampaign(10, "ws_kov", "aa_kov_meta", "KOV | Chuck Liddell | Fighter Auth | TOF", "Purchases", 2, "medium", 8_400, 1.86, 42.10, 7),
  makeCampaign(11, "ws_kov", "aa_kov_meta", "KOV | Gaethje Collab | TOF | Cold", "Purchases", 3, "validation_required", 6_200, 1.42, 56.80, 7),
  makeCampaign(12, "ws_kov", "aa_kov_meta", "KOV | Cart Recovery | Retarget | MOF", "Purchases", 1, "high", 5_800, 2.31, 31.20, 14),
  makeCampaign(13, "ws_kov", "aa_kov_meta", "KOV | Exit Intent | BOF", "Purchases", 2, "medium", 4_100, 1.94, 38.60, 14),
  makeCampaign(14, "ws_kov", "aa_kov_meta", "KOV | Camozzi Promo | Dead Creative Test", "Purchases", 4, "medium", 3_900, 0.98, 72.40, 20),
  // Bookster
  makeCampaign(15, "ws_bookster", "aa_bookster_meta", "BKSTR | C4E Control | Trial Gen | Android | TOF", "Trials", 1, "high", 22_400, 0, 258.34, 14),
  makeCampaign(16, "ws_bookster", "aa_bookster_meta", "BKSTR | C2B | Registration | MOF | Female 45-54", "Registrations", 2, "high", 18_600, 0, 320.10, 14),
  makeCampaign(17, "ws_bookster", "aa_bookster_meta", "BKSTR | BYOC Upload Flow | TOF Test", "Trials", 1, "medium", 12_800, 0, 290.40, 10),
  makeCampaign(18, "ws_bookster", "aa_bookster_meta", "BKSTR | C2E READ LESS KEEP MORE | TOF", "Registrations", 3, "medium", 9_400, 0, 418.20, 10),
  makeCampaign(19, "ws_bookster", "aa_bookster_meta", "BKSTR | C3 | Behavior Shift | Broad | iOS", "Trials", 2, "medium", 14_200, 0, 344.80, 12),
  makeCampaign(20, "ws_bookster", "aa_bookster_meta", "BKSTR | Lookalike | Trial Completers | MOF", "Trials", 2, "high", 11_600, 0, 298.60, 8),
  // Meta Marketing Agency
  makeCampaign(21, "ws_mma", "aa_mma_meta", "MMA | Agency Brand | Lead Gen", "Leads", 2, "medium", 18_400, 0, 82.40, 30),
  makeCampaign(22, "ws_mma", "aa_mma_meta", "MMA | Inbound | Demo Request | TOF", "Leads", 1, "high", 24_600, 0, 64.20, 30),
  makeCampaign(23, "ws_mma", "aa_mma_meta", "MMA | Retargeting | Warm Leads", "Leads", 1, "high", 14_800, 0, 48.10, 20),
  makeCampaign(24, "ws_mma", "aa_mma_meta", "MMA | Case Study | MOF | Awareness", "Leads", 2, "medium", 12_200, 0, 94.60, 25),
  makeCampaign(25, "ws_mma", "aa_mma_meta", "MMA | CPA Reduction Test | CBO", "Leads", 3, "validation_required", 6_400, 0, 112.00, 15),
  // Metrix Internal
  makeCampaign(26, "ws_metrix", "aa_metrix_meta", "METRIX | QA Test Campaign A", "Conversions", 3, "validation_required", 800, 1.2, 42.00, 20),
  makeCampaign(27, "ws_metrix", "aa_metrix_meta", "METRIX | QA Test Campaign B — Insufficient", "Conversions", 3, "insufficient", 220, 0.8, 110.00, 15),
  makeCampaign(28, "ws_metrix", "aa_metrix_tiktok", "METRIX | TikTok Pilot A", "Conversions", 3, "insufficient", 400, 0, 200.00, 10),
  makeCampaign(29, "ws_metrix", "aa_metrix_meta", "METRIX | Brand Safety Test", "Conversions", 3, "validation_required", 600, 1.4, 60.00, 12),
  makeCampaign(30, "ws_metrix", "aa_metrix_meta", "METRIX | Funnel Consistency QA", "Conversions", 3, "insufficient", 180, 0, 180.00, 8),
];

// ─── Ads (60) ─────────────────────────────────────────────────────────

function makeAd(
  n: number,
  cmpId: string,
  wsId: string,
  aaId: string,
  name: string,
  tier: PerformanceTier,
  confidence: ConfidenceLabel,
  spendUsd: number,
  roas: number,
  cpaUsd: number,
  conversionType: string,
  varCodes: string[],
  format: Ad["format"] = "Feed",
  lang: Ad["language"] = "EN"
): Ad {
  const conversions = Math.round(spendUsd / cpaUsd);
  const impressions = Math.round(spendUsd * randInt(300, 900));
  const clicks = Math.round(impressions * randFloat(0.01, 0.04));
  return {
    id: id("ad", n),
    ad_set_id: id("as", n),
    campaign_id: cmpId,
    workspace_id: wsId,
    ad_account_id: aaId,
    name,
    status: tier === 4 ? "Paused" : "Active",
    tier,
    confidence,
    budget_band: tier === 1 ? "critical_scale" : tier === 2 ? "scale" : tier === 3 ? "optimize" : "retire",
    variable_codes: varCodes,
    spend_usd: spendUsd,
    impressions,
    clicks,
    conversions,
    conversion_type: conversionType,
    ctr: clicks / impressions,
    cpa_usd: cpaUsd,
    roas,
    hook_score: tier === 1 ? randInt(72, 94) : tier === 2 ? randInt(55, 72) : randInt(20, 55),
    fatigue_signal: tier === 1 ? "fresh" : tier === 2 ? "mild_fatigue" : tier === 4 ? "burnt" : "mild_fatigue",
    format,
    language: lang,
  };
}

export const ADS: Ad[] = [
  // Bookster (most data-rich — use real copy references)
  makeAd(1, "cmp_0015", "ws_bookster", "aa_bookster_meta", "C4E_STC_QF_BOOK2_T1 — Aspirational Authority | Feed", 1, "high", 8_400, 0, 248.10, "Trial", ["HK_Authority", "TN_Aspirational", "FW_AIDA", "CN_SocialProof", "CTA_StartFree"], "Feed"),
  makeAd(2, "cmp_0015", "ws_bookster", "aa_bookster_meta", "C4E_STC_QF_BOOK2_T1 — Aspirational Authority | Story", 1, "high", 4_200, 0, 261.40, "Trial", ["HK_Authority", "TN_Aspirational", "FW_AIDA", "CN_SocialProof", "CTA_StartFree"], "Story"),
  makeAd(3, "cmp_0017", "ws_bookster", "aa_bookster_meta", "BYOC Upload Flow — HK_Curiosity | Feed [TIER 1 CANDIDATE]", 1, "medium", 6_800, 0, 282.40, "Trial", ["HK_Curiosity", "TN_Relatable", "FW_ProblemSolution", "CN_BehaviorShift", "CTA_TryFree"], "Feed"),
  makeAd(4, "cmp_0016", "ws_bookster", "aa_bookster_meta", "C2B_STC_QF_BOOK2_T2 — 1000 Books | Product Demo | Feed", 2, "high", 7_200, 0, 318.60, "Registration", ["HK_Benefit", "TN_Rational", "FW_BAB", "CN_ProductDemo", "CTA_StartFree"], "Feed"),
  makeAd(5, "cmp_0016", "ws_bookster", "aa_bookster_meta", "C2B_STC_QF_BOOK2_T2 — 1000 Books | Product Demo | Square", 2, "high", 4_800, 0, 324.20, "Registration", ["HK_Benefit", "TN_Rational", "FW_BAB", "CN_ProductDemo", "CTA_StartFree"], "Story"),
  makeAd(6, "cmp_0018", "ws_bookster", "aa_bookster_meta", "C2E_STC_QF_BOOK2_T2 — READ LESS KEEP MORE | Feed T1", 3, "medium", 2_400, 0, 441.80, "Registration", ["HK_Problem", "TN_Assertive", "FW_PAS", "CN_BehaviorShift", "CTA_TryFree"], "Feed"),
  makeAd(7, "cmp_0019", "ws_bookster", "aa_bookster_meta", "C3 | No Long Books | No Guilt | Android Focus", 2, "medium", 5_600, 0, 338.90, "Trial", ["HK_Problem", "TN_Relatable", "FW_ProblemSolution", "CN_BehaviorShift", "CTA_StartFree"], "Feed"),
  makeAd(8, "cmp_0020", "ws_bookster", "aa_bookster_meta", "Lookalike Trial Completers | C4E Variant", 2, "high", 4_400, 0, 301.20, "Trial", ["HK_Result", "TN_Aspirational", "FW_FeatureBenefit", "CN_SocialProof", "CTA_GetStarted"], "Feed"),
  // SKOV Pet
  makeAd(9, "cmp_0001", "ws_skov", "aa_skov_meta", "SKOV | World Cup | K9 Athlete | Hero Feed", 1, "high", 7_200, 3.4, 26.80, "Purchase", ["HK_Curiosity", "TN_Aspirational", "FW_AIDA", "CN_ValueProp", "CTA_ShopNow"], "Feed"),
  makeAd(10, "cmp_0001", "ws_skov", "aa_skov_meta", "SKOV | World Cup | Stamina Test | Story", 1, "high", 5_100, 3.1, 29.40, "Purchase", ["HK_Result", "TN_Rational", "FW_FeatureBenefit", "CN_ValueProp", "CTA_ShopNow"], "Story"),
  makeAd(11, "cmp_0002", "ws_skov", "aa_skov_meta", "SKOV | Slow Feeder Bowl | Demo Video | Feed", 2, "medium", 4_600, 2.9, 33.20, "Purchase", ["HK_Benefit", "TN_Warm", "FW_BAB", "CN_ProductDemo", "CTA_ShopNow"], "Feed"),
  makeAd(12, "cmp_0003", "ws_skov", "aa_skov_meta", "SKOV | Dog Standards | Retarget | Testimonial", 2, "high", 3_400, 4.2, 22.10, "Purchase", ["HK_Social", "TN_Warm", "FW_StorySell", "CN_Testimonial", "CTA_ShopNow"], "Feed"),
  makeAd(13, "cmp_0004", "ws_skov", "aa_skov_meta", "SKOV | Bundle | Price Comparison | Insufficient Data", 3, "validation_required", 1_800, 1.8, 54.00, "Purchase", ["HK_Contrast", "TN_Rational", "FW_PAS", "CN_ValueProp", "CTA_ClaimOffer"], "Feed"),
  // IMCO Wheels
  makeAd(14, "cmp_0006", "ws_imco", "aa_imco_meta", "IMCO | Truck Lift Kit | Before/After | EN | Feed", 2, "medium", 4_200, 0, 28.90, "WhatsApp_Lead", ["HK_Contrast", "TN_Assertive", "FW_BAB", "CN_ProductDemo", "CTA_MessageUs"], "Feed", "EN"),
  makeAd(15, "cmp_0006", "ws_imco", "aa_imco_meta", "IMCO | Customización | Antes/Después | ES | Feed", 2, "medium", 3_800, 0, 31.20, "WhatsApp_Lead", ["HK_Contrast", "TN_Assertive", "FW_BAB", "CN_ProductDemo", "CTA_MessageUs"], "Feed", "ES"),
  makeAd(16, "cmp_0007", "ws_imco", "aa_imco_meta", "IMCO | Ruedas Grandes | Machismo | ES | Story", 2, "medium", 2_900, 0, 29.40, "WhatsApp_Lead", ["HK_Authority", "TN_Aspirational", "FW_AIDA", "CN_ValueProp", "CTA_MessageUs"], "Story", "ES"),
  makeAd(17, "cmp_0008", "ws_imco", "aa_imco_meta", "IMCO | Retarget | EN/ES | Final Push | Feed", 1, "high", 3_600, 0, 18.10, "WhatsApp_Lead", ["HK_Urgency", "TN_Assertive", "FW_Direct", "CN_SocialProof", "CTA_MessageUs"], "Feed", "EN/ES"),
  makeAd(18, "cmp_0009", "ws_imco", "aa_imco_meta", "IMCO | Temporada | Summer Promo | ES | Reel", 3, "validation_required", 1_400, 0, 46.00, "WhatsApp_Lead", ["HK_Urgency", "TN_Warm", "FW_AIDA", "CN_ValueProp", "CTA_MessageUs"], "Reel", "ES"),
  // King of Violence
  makeAd(19, "cmp_0010", "ws_kov", "aa_kov_meta", "KOV | Chuck | Just Gear. No Hype. | Feed", 2, "medium", 3_200, 1.91, 41.20, "Purchase", ["HK_Authority", "TN_Deadpan", "FW_Direct", "CN_FounderLed", "CTA_ShopNow"], "Feed"),
  makeAd(20, "cmp_0010", "ws_kov", "aa_kov_meta", "KOV | Chuck | You Know What It Takes | Story", 2, "medium", 2_800, 1.84, 43.10, "Purchase", ["HK_Challenge", "TN_Deadpan", "FW_Direct", "CN_FounderLed", "CTA_ShopNow"], "Story"),
  makeAd(21, "cmp_0011", "ws_kov", "aa_kov_meta", "KOV | Gaethje | Lightweight Hoodie | TOF", 3, "validation_required", 2_400, 1.38, 58.40, "Purchase", ["HK_Authority", "TN_Assertive", "FW_AIDA", "CN_SocialProof", "CTA_ShopNow"], "Feed"),
  makeAd(22, "cmp_0012", "ws_kov", "aa_kov_meta", "KOV | Cart Recovery | 10% Off | Feed", 1, "high", 2_900, 2.38, 29.80, "Purchase", ["HK_Urgency", "TN_Assertive", "FW_Direct", "CN_ValueProp", "CTA_ClaimOffer"], "Feed"),
  makeAd(23, "cmp_0013", "ws_kov", "aa_kov_meta", "KOV | Exit Intent | Hero Section Test | Feed", 2, "medium", 1_800, 1.98, 37.40, "Purchase", ["HK_Contrast", "TN_Deadpan", "FW_PAS", "CN_ValueProp", "CTA_ClaimOffer"], "Feed"),
  makeAd(24, "cmp_0014", "ws_kov", "aa_kov_meta", "KOV | Camozzi | Promo — Dead Creative | Feed", 4, "medium", 1_900, 0.94, 74.80, "Purchase", ["HK_Social", "TN_Aspirational", "FW_AIDA", "CN_UGC", "CTA_ShopNow"], "Feed"),
  // Meta Marketing Agency
  makeAd(25, "cmp_0022", "ws_mma", "aa_mma_meta", "MMA | Demo Request | Case Study Hook | Feed", 1, "high", 8_400, 0, 61.40, "Lead", ["HK_ProofFirst", "TN_Rational", "FW_FeatureBenefit", "CN_SocialProof", "CTA_GetStarted"], "Feed"),
  makeAd(26, "cmp_0022", "ws_mma", "aa_mma_meta", "MMA | Demo Request | ROI Claim | Video", 1, "high", 6_200, 0, 66.80, "Lead", ["HK_Result", "TN_Assertive", "FW_BAB", "CN_ValueProp", "CTA_GetStarted"], "Feed"),
  makeAd(27, "cmp_0023", "ws_mma", "aa_mma_meta", "MMA | Retarget | Warm Leads | Objection Handle", 1, "high", 5_400, 0, 47.20, "Lead", ["HK_Contrast", "TN_Rational", "FW_PAS", "CN_ValueProp", "CTA_LearnMore"], "Feed"),
  makeAd(28, "cmp_0021", "ws_mma", "aa_mma_meta", "MMA | Agency Brand | Founder Perspective", 2, "medium", 6_800, 0, 80.10, "Lead", ["HK_Authority", "TN_Warm", "FW_StorySell", "CN_FounderLed", "CTA_LearnMore"], "Feed"),
  makeAd(29, "cmp_0024", "ws_mma", "aa_mma_meta", "MMA | Case Study | 3x ROAS Proof | Feed", 2, "medium", 4_800, 0, 92.40, "Lead", ["HK_ProofFirst", "TN_Rational", "FW_FeatureBenefit", "CN_SocialProof", "CTA_GetStarted"], "Feed"),
  makeAd(30, "cmp_0025", "ws_mma", "aa_mma_meta", "MMA | CPA Reduction Test | New Angle | Feed", 3, "validation_required", 2_800, 0, 108.60, "Lead", ["HK_Problem", "TN_Assertive", "FW_PAS", "CN_BehaviorShift", "CTA_GetStarted"], "Feed"),
  // Metrix Internal (low signal)
  makeAd(31, "cmp_0026", "ws_metrix", "aa_metrix_meta", "METRIX | QA Test A | Carousel", 3, "validation_required", 400, 1.2, 40.00, "Conversion", ["HK_Benefit", "TN_Rational", "FW_BAB", "CN_ProductDemo", "CTA_GetStarted"]),
  makeAd(32, "cmp_0027", "ws_metrix", "aa_metrix_meta", "METRIX | QA Test B | Insufficient Data | Feed", 3, "insufficient", 180, 0.8, 120.00, "Conversion", ["HK_Curiosity", "TN_Warm", "FW_AIDA", "CN_ValueProp", "CTA_LearnMore"]),
  makeAd(33, "cmp_0029", "ws_metrix", "aa_metrix_meta", "METRIX | Brand Safety | Video", 3, "validation_required", 280, 1.4, 56.00, "Conversion", ["HK_Authority", "TN_Rational", "FW_Direct", "CN_SocialProof", "CTA_GetStarted"]),
  makeAd(34, "cmp_0030", "ws_metrix", "aa_metrix_meta", "METRIX | Funnel QA | Pixel Test | Feed", 3, "insufficient", 120, 0, 180.00, "Conversion", ["HK_Result", "TN_Assertive", "FW_ProblemSolution", "CN_BehaviorShift", "CTA_StartFree"]),
  // Additional ads to hit volume 60
  ...Array.from({ length: 26 }, (_, i) => {
    const n = 35 + i;
    const wsPool = ["ws_bookster", "ws_skov", "ws_kov", "ws_imco", "ws_mma"] as const;
    const aaPool = ["aa_bookster_meta", "aa_skov_meta", "aa_kov_meta", "aa_imco_meta", "aa_mma_meta"] as const;
    const idx = i % 5;
    const ws = wsPool[idx];
    const aa = aaPool[idx];
    const cmpPool = ["cmp_0015","cmp_0001","cmp_0010","cmp_0006","cmp_0022"];
    const t: PerformanceTier = pick([1,2,2,3,3,4]) as PerformanceTier;
    const conf: ConfidenceLabel = t === 1 ? "high" : t === 4 ? "medium" : pick(["medium","validation_required"]) as ConfidenceLabel;
    const spend = randInt(1200, 8000);
    const cpa = randFloat(25, 400);
    return makeAd(
      n, cmpPool[idx], ws, aa,
      `[SAMPLE] ${pick(["Variant", "Test", "Control"])} ${String.fromCharCode(65 + (i % 10))} | ${pick(["Feed","Story","Reel"])} | ${pick(["TOF","MOF","BOF"])}`,
      t, conf, spend, t === 1 ? randFloat(2,4) : 0, cpa,
      ws === "ws_bookster" ? "Trial" : ws === "ws_imco" ? "WhatsApp_Lead" : "Purchase",
      pickN([...HOOK_TEMPLATES,...FRAMEWORK_TEMPLATES,...TONE_TEMPLATES,...CTA_TEMPLATES], 4),
      pick(["Feed","Story","Reel","Feed","Feed"]) as Ad["format"]
    );
  }),
];

// ─── Creative Concepts (45) ───────────────────────────────────────────

const CONCEPT_NAMES = [
  "Aspirational authority / static system checkout driver",
  "Time-poor learner product demo / 1,000 books proof",
  "Read less / keep more retention mechanism",
  "Founder-led proof hook for skeptical buyers",
  "Price-value contrast for reluctant spenders",
  "Behavior shift — externalizing the reading problem",
  "Social proof stack with demographic specificity",
  "UGC authenticity — user upload flow angle",
  "High performer identity — reading as competitive edge",
  "Depth seeker — philosophy, history, economics coverage",
];

export const CREATIVE_CONCEPTS: CreativeConcept[] = Array.from({ length: 45 }, (_, i) => {
  const n = i + 1;
  const wsPool = ["ws_bookster","ws_bookster","ws_bookster","ws_skov","ws_skov","ws_kov","ws_kov","ws_imco","ws_mma","ws_metrix"];
  const ws = wsPool[i % wsPool.length];
  const tier: PerformanceTier = pick([1,1,2,2,2,3,3,4]) as PerformanceTier;
  const conf: ConfidenceLabel = tier === 1 ? pick(["high","medium"]) as ConfidenceLabel : tier === 4 ? "medium" : pick(["medium","validation_required"]) as ConfidenceLabel;
  return {
    id: id("cc", n),
    workspace_id: ws,
    name: CONCEPT_NAMES[i % CONCEPT_NAMES.length],
    cell_id: `C${((i % 4) + 1).toString()}${String.fromCharCode(65 + (i % 5))}`,
    concept_id: `C${(i % 4) + 1}`,
    primary_message: pick(["1,000 books. 15 minutes each.", "READ LESS. KEEP MORE.", "Just gear. No hype.", "The smarter way to read and finish.", "Truck builds that speak for themselves."]),
    secondary_message: pick(["Key ideas without the 300-page commitment.", "Knowledge that actually sticks.", "Built for fighters. Worn by champions.", "Less than a coffee. More than a book."]),
    visual_system: pick(["Dark navy DR card, oversized typography, yellow mascot", "Cozy reading/lamp environment, tilted phone UI", "Fighter portrait, product flat lay, minimal copy", "World Cup energy, dog in motion, performance callouts"]),
    hook_variable: pick(HOOK_TEMPLATES),
    tone_variable: pick(TONE_TEMPLATES),
    framework_variable: pick(FRAMEWORK_TEMPLATES),
    concept_variable: pick(CONCEPT_TEMPLATES),
    proof_variable: pick(["PR_VisualDemo", "PR_DataDriven", "PR_Testimonial", "PR_SocialCount"]),
    cta_variable: pick(CTA_TEMPLATES),
    stage: pick(["TOF","MOF","BOF","TOF to MOF"]) as CreativeConcept["stage"],
    tier,
    confidence: conf,
    fatigue_state: tier === 1 ? "fresh" : tier === 4 ? "burnt" : pick(["mild_fatigue","fatigued"]) as CreativeConcept["fatigue_state"],
    account_fit: [ws],
    winning_segments: pick([["Female 45-54", "Mobile"], ["Male 25-44", "Desktop"], ["Android", "TOF broad"], ["ES-speaking", "Miami DMA"]]),
    iap_read: pick([
      "Strong registration unlocker, but checkout depth did not follow in V3.",
      "Primary checkout-depth control. Generated clear majority of onb_initiate_checkout volume.",
      "Strong curiosity hook. Performance mixed — consumed trial spend with no trials in V1.",
      "Solid mid-funnel performer. Intent signals strong but acquisition cost elevated.",
    ]),
    recommended_action: pick(["Keep","Extend","Retire","Validate"]) as CreativeConcept["recommended_action"],
    related_ads: [],
    related_briefs: [],
  };
});

// ─── ICP Profiles (8) ─────────────────────────────────────────────────

export const ICP_PROFILES: ICPProfile[] = [
  {
    profile_id: "icp_0001",
    workspace_id: "ws_bookster",
    profile_name: "Time-Starved Professional Reader",
    demographic_foundation: "25–44, mixed gender, college-educated, household income $75K+",
    psychographic_profile: "High achiever who values continuous learning but cannot sustain long-form reading. Guilt-driven about unfinished books. Responds to efficiency and identity-level framing.",
    behavioral_signals: ["Abandons books at 30-40%", "Multiple app subscriptions", "Podcast/audiobook user", "LinkedIn-active professional"],
    funnel_entry_point: "TOF broad interest — reading, self-improvement, business",
    performance_data: { avg_cpa_usd: 258.34, avg_roas: 0, conversion_rate: 0.222, primary_platform: "Meta", primary_placement: "Feed" },
    message_resonance: ["15 minutes a day", "Key ideas retained", "No card required", "Start free"],
    strategic_recommendation: "Scale C4E control with Android-specific bidding. Move registration to last pre-paywall. Avoid iOS due to CAPI gap.",
    confidence_level: "high",
  },
  {
    profile_id: "icp_0002",
    workspace_id: "ws_bookster",
    profile_name: "Depth-Seeking Female 45–54",
    demographic_foundation: "Female, 45–54, professional background, philosophy/history interest",
    psychographic_profile: "Wants intellectual depth, not speed. Reads for knowledge retention, not productivity signaling. Responds to subject breadth and intellectual validation.",
    behavioral_signals: ["Completes courses", "Subscribes to long-form newsletters", "Book club participation", "Higher dwell time on creative"],
    funnel_entry_point: "MOF — awareness of product via retargeting or lookalike",
    performance_data: { avg_cpa_usd: 318.60, avg_roas: 0, conversion_rate: 0.14, primary_platform: "Meta", primary_placement: "Feed" },
    message_resonance: ["1,000 books covered", "Philosophy, history, economics", "Knowledge you actually keep"],
    strategic_recommendation: "C2B is the registration control for this segment. High reg rate but checkout conversion weaker — quiz-gate shows promise.",
    confidence_level: "high",
  },
  {
    profile_id: "icp_0003",
    workspace_id: "ws_kov",
    profile_name: "Combat Sports Loyalist",
    demographic_foundation: "Male, 22–38, MMA/UFC fan, disposable income $40K–80K",
    psychographic_profile: "Values authenticity and earned credibility. Distrusts hype. Identifies with the sport through consumption. Responds to deadpan, understated product claims, not enthusiasm.",
    behavioral_signals: ["UFC PPV purchaser", "Follows fighters on social", "Combat sports subreddits", "Event-driven purchasing"],
    funnel_entry_point: "TOF — fighter-specific content, event windows",
    performance_data: { avg_cpa_usd: 41.20, avg_roas: 1.86, conversion_rate: 0.028, primary_platform: "Meta", primary_placement: "Feed" },
    message_resonance: ["Just gear.", "No hype.", "Built by fighters."],
    strategic_recommendation: "Fighter-led content (Chuck, Gaethje) outperforms generic brand. Cart recovery is the highest-ROAS lever. CRO priority: hero copy, cart progress bar, exit-intent.",
    confidence_level: "medium",
  },
  {
    profile_id: "icp_0004",
    workspace_id: "ws_skov",
    profile_name: "Performance-Minded Dog Owner",
    demographic_foundation: "25–45, gender split 55% female, suburban/semi-rural, household with active dog",
    psychographic_profile: "Treats dog health as an extension of personal health identity. Skeptical of generic pet supplements. Responds to scientific framing and performance outcome proof.",
    behavioral_signals: ["Follows veterinary nutrition accounts", "Compares ingredient labels", "Multiple pet subscription services", "Dog sport participation (agility, dock diving)"],
    funnel_entry_point: "TOF — pet health, K9 performance, World Cup tie-in content",
    performance_data: { avg_cpa_usd: 27.60, avg_roas: 3.2, conversion_rate: 0.042, primary_platform: "Meta", primary_placement: "Feed" },
    message_resonance: ["K9 Growth Accelerator", "World Cup energy", "Proven ingredients"],
    strategic_recommendation: "World Cup creative is T1 control. Slow feeder bowl audience overlaps strongly — bundle offer opportunity.",
    confidence_level: "high",
  },
  {
    profile_id: "icp_0005",
    workspace_id: "ws_imco",
    profile_name: "Miami Truck Enthusiast (EN)",
    demographic_foundation: "Male, 28–45, Miami-Dade/Broward, income $60K+, truck/SUV owner",
    psychographic_profile: "Vehicle as status and utility. Values local credibility. Responds to before/after transformation proof. WhatsApp-comfortable for high-consideration purchases.",
    behavioral_signals: ["Truck modification subreddits", "Miami local Facebook groups", "Visits competitor pages", "High engagement on video content"],
    funnel_entry_point: "TOF cold — Miami geo-targeted, truck interest",
    performance_data: { avg_cpa_usd: 28.90, avg_roas: 0, conversion_rate: 0.031, primary_platform: "Meta", primary_placement: "Feed" },
    message_resonance: ["Before/After", "Miami's best build shop", "Talk to us on WhatsApp"],
    strategic_recommendation: "EN creative performing at parity with ES — do not consolidate. Retargeting via WhatsApp is the highest-efficiency path.",
    confidence_level: "medium",
  },
  {
    profile_id: "icp_0006",
    workspace_id: "ws_imco",
    profile_name: "Miami Truck Enthusiast (ES)",
    demographic_foundation: "Male, 25–42, Spanish-dominant, Miami-Dade, household income $45K–75K",
    psychographic_profile: "Community-influenced purchasing. Trust built through Spanish-language engagement. WhatsApp as primary communication channel — not email or phone.",
    behavioral_signals: ["Spanish-language Facebook groups", "WhatsApp group membership", "Local referral patterns", "Event-driven (carnivals, truck shows)"],
    funnel_entry_point: "TOF cold — ES-language geo-targeted",
    performance_data: { avg_cpa_usd: 30.30, avg_roas: 0, conversion_rate: 0.028, primary_platform: "Meta", primary_placement: "Feed" },
    message_resonance: ["Customización de calidad", "Hablemos por WhatsApp", "Antes y después"],
    strategic_recommendation: "Maintain bilingual structure. ES segment slightly weaker on WhatsApp initiation — test story format with WhatsApp CTA.",
    confidence_level: "medium",
  },
  {
    profile_id: "icp_0007",
    workspace_id: "ws_mma",
    profile_name: "Performance Marketing Director",
    demographic_foundation: "Director/VP level, 30–50, B2B, marketing-decision maker, $200K+ revenue orgs",
    psychographic_profile: "ROI-first buyer. Skeptical of agency promises. Responds to case studies, specific metrics, and peer validation. Low tolerance for vanity metrics.",
    behavioral_signals: ["LinkedIn-active", "Marketing conference attendee", "Reads agency case studies", "Multiple agency relationships"],
    funnel_entry_point: "TOF — LinkedIn retargeting, case study content, direct outreach",
    performance_data: { avg_cpa_usd: 64.20, avg_roas: 0, conversion_rate: 0.018, primary_platform: "Meta", primary_placement: "Feed" },
    message_resonance: ["3x ROAS proven", "Full-funnel creative intelligence", "Demo request"],
    strategic_recommendation: "Case study hook (HK_ProofFirst) is the T1 control. Demo CTA outperforms Learn More by 22% on this segment.",
    confidence_level: "high",
  },
  {
    profile_id: "icp_0008",
    workspace_id: "ws_metrix",
    profile_name: "Internal QA / Validation Profile",
    demographic_foundation: "Internal — no real demographic foundation",
    psychographic_profile: "Dogfooding and QA persona. Used to test confidence label and signal quality ranges across all states.",
    behavioral_signals: ["Low spend signals", "Short date ranges", "Sandbox conversion events"],
    funnel_entry_point: "N/A — internal testing",
    performance_data: { avg_cpa_usd: 85.00, avg_roas: 1.1, conversion_rate: 0.01, primary_platform: "Meta", primary_placement: "Feed" },
    message_resonance: ["Testing only", "Validation required"],
    strategic_recommendation: "Use this profile to validate insufficient_data and validation_required confidence label rendering across all UI surfaces.",
    confidence_level: "insufficient",
  },
];

// ─── Imports (12) ─────────────────────────────────────────────────────

function makeImport(n: number, wsId: string, aaId: string, daysAgo: number, status: Import["status"]): Import {
  const start = isoDate(daysAgo + 30);
  const end = isoDate(daysAgo);
  return {
    id: id("imp", n),
    workspace_id: wsId,
    ad_account_id: aaId,
    status,
    files: [
      {
        id: id("if", n * 2 - 1),
        import_id: id("imp", n),
        file_type: "demographic_text",
        filename: `${wsId.replace("ws_","")}_demo_text_${end}.csv`,
        row_count: randInt(120, 480),
        date_range_start: start,
        date_range_end: end,
        status,
        warnings: status === "Warning" ? ["Low sample size in 35–44 male segment"] : [],
      },
      {
        id: id("if", n * 2),
        import_id: id("imp", n),
        file_type: "device_placement_platform",
        filename: `${wsId.replace("ws_","")}_device_placement_${end}.csv`,
        row_count: randInt(80, 240),
        date_range_start: start,
        date_range_end: end,
        status,
        warnings: [],
      },
    ],
    date_range_start: start,
    date_range_end: end,
    created_at: isoDate(daysAgo + 1),
    processed_at: status === "Processed" ? isoDate(daysAgo) : undefined,
    created_by: "usr_0001",
    warnings: status === "Warning" ? ["Low sample in 35–44 male segment"] : [],
  };
}

export const IMPORTS: Import[] = [
  makeImport(1, "ws_bookster", "aa_bookster_meta", 2, "Processed"),
  makeImport(2, "ws_bookster", "aa_bookster_meta", 32, "Processed"),
  makeImport(3, "ws_skov", "aa_skov_meta", 3, "Processed"),
  makeImport(4, "ws_skov", "aa_skov_meta", 33, "Processed"),
  makeImport(5, "ws_imco", "aa_imco_meta", 5, "Processed"),
  makeImport(6, "ws_imco", "aa_imco_meta", 35, "Warning"),
  makeImport(7, "ws_kov", "aa_kov_meta", 4, "Processed"),
  makeImport(8, "ws_kov", "aa_kov_meta", 34, "Needs Mapping"),
  makeImport(9, "ws_mma", "aa_mma_meta", 7, "Processed"),
  makeImport(10, "ws_mma", "aa_mma_meta", 37, "Processed"),
  makeImport(11, "ws_metrix", "aa_metrix_meta", 30, "Processed"),
  makeImport(12, "ws_skov", "aa_skov_google", 14, "Warning"),
];

// ─── Analysis Runs (12) ───────────────────────────────────────────────

function makeSignalQuality(overall: number): SignalQualityScore {
  const spread = 20;
  const base = (dim: number) => Math.max(0, Math.min(100, overall + randInt(-spread, spread) + dim));
  return {
    tracking_confidence: base(5),
    conversion_volume_confidence: base(-5),
    spend_sufficiency: base(8),
    creative_diversity: base(-10),
    learning_stability: base(3),
    funnel_consistency: base(-3),
    segment_clarity: base(6),
    data_cleanliness: base(-8),
    date_range_reliability: base(4),
    breakdown_usefulness: base(-2),
    overall,
  };
}

export const ANALYSIS_RUNS: AnalysisRun[] = [
  // Bookster — primary run (most detailed)
  {
    id: "run_0001",
    workspace_id: "ws_bookster",
    ad_account_id: "aa_bookster_meta",
    import_ids: ["imp_0001", "imp_0002"],
    status: "Completed",
    objective: "CPA reduction",
    depth: "Full IAP Analysis",
    date_range_start: isoDate(32),
    date_range_end: isoDate(2),
    confidence_score: 74,
    signal_quality: makeSignalQuality(61),
    priority_read: "C4E aspirational authority creative is the primary checkout-depth control — it drove the clear majority of onb_initiate_checkout volume. However, a pixel/CAPI tracking gap is suppressing measured conversion data by an estimated 30–40%. The registration flow restructure (moved to last, pre-paywall) is the primary driver of the $575.86 → $258.34 cost-per-trial improvement. Android is carrying the gain. iOS is tracking-impaired and should not receive scaled budget until CAPI is verified.",
    executive_diagnosis: "Registration funnel restructure produced a step-change improvement in trial cost efficiency (−55% CPT). C4E remains the checkout-depth control. A pixel/CAPI gap is the primary unresolved risk — it distorts ROI reads and may be masking underperformance on iOS. The testing programme has three validated creative angles ready for scaling: C4E, C2B, and the BYOC upload-flow. Consolidate budget behind these before expanding to new angles.",
    primary_constraint: "Unresolved pixel/CAPI tracking gap. iOS event data is unreliable. Cannot scale on iOS until resolved.",
    primary_opportunity: "Android segment is tracking cleanly and delivering $258.34 CPT vs. $575.86 pre-restructure. Increasing Android-specific budget allocation by 40% has strong supporting evidence.",
    recommended_next_action: "1. Resolve CAPI integration gap with dev team — this is blocking reliable iOS optimization. 2. Scale C4E on Android via dedicated Android campaign with CBO. 3. Brief next sprint around BYOC upload-flow angle — T1 candidate with validation_required confidence.",
    risk_if_ignored: "CAPI gap will continue to suppress iOS targeting signal, inflating CPT reads and preventing accurate creative fatigue detection. C4E fatigue window is approaching — without a tested replacement, trial volume will decline.",
    cohort_key: "device" as const,
    created_by: "usr_0001",
    created_at: isoDate(2),
    completed_at: isoDate(2),
    findings: generateBooksterFindings("run_0001"),
    recommendations: generateRecommendations("run_0001", "ws_bookster", 6),
    decision_feed: generateDecisionFeed("run_0001", "ws_bookster", "aa_bookster_meta", 8),
  },
  // SKOV
  {
    id: "run_0002",
    workspace_id: "ws_skov",
    ad_account_id: "aa_skov_meta",
    import_ids: ["imp_0003", "imp_0004"],
    status: "Completed",
    objective: "ROAS improvement",
    depth: "Full IAP Analysis",
    date_range_start: isoDate(33),
    date_range_end: isoDate(3),
    confidence_score: 84,
    signal_quality: makeSignalQuality(84),
    priority_read: "World Cup creative (K9 athlete performance angle) is the Tier 1 control. 3.2x ROAS, high confidence. Slow feeder bowl audience overlaps strongly — bundle offer has not been tested. Google PMax is retargeting-only and should not be compared to cold acquisition ROAS.",
    executive_diagnosis: "SKOV is in a healthy scaling position. World Cup creative is the top performer and has sufficient runway before fatigue. Slow feeder bowl campaigns are solid T2. Google PMax is performing its retargeting mandate. The untested bundle offer represents the primary growth opportunity.",
    primary_constraint: "Slow feeder bowl CPA is elevated vs. World Cup — $34.10 vs $28.40. Creative diversity is the bottleneck.",
    primary_opportunity: "K9 supplement bundle offer has never been tested as a standalone angle. Strong overlap with slow feeder buyers suggests high conversion probability.",
    recommended_next_action: "1. Scale World Cup creative on current trajectory — T1 confirmed. 2. Test bundle offer against slow feeder bowl audience. 3. Do not expand Google PMax beyond retargeting mandate.",
    risk_if_ignored: "World Cup tie-in is event-dependent — creative has a shelf life. Failure to develop the next angle before fatigue will cause volume decline without a tested replacement.",
    cohort_key: "creative_angle" as const,
    created_by: "usr_0001",
    created_at: isoDate(3),
    completed_at: isoDate(3),
    findings: generateGenericFindings("run_0002", "ws_skov", 5),
    recommendations: generateRecommendations("run_0002", "ws_skov", 5),
    decision_feed: generateDecisionFeed("run_0002", "ws_skov", "aa_skov_meta", 6),
  },
  // IMCO
  {
    id: "run_0003",
    workspace_id: "ws_imco",
    ad_account_id: "aa_imco_meta",
    import_ids: ["imp_0005", "imp_0006"],
    status: "Completed",
    objective: "Lead quality",
    depth: "Full IAP Analysis",
    date_range_start: isoDate(35),
    date_range_end: isoDate(5),
    confidence_score: 78,
    signal_quality: makeSignalQuality(78),
    priority_read: "WhatsApp funnel is converting at strong efficiency — $18.40 CPL in retargeting, $29–31 CPL in cold TOF. EN and ES audiences are performing at near-parity — maintain bilingual structure. Retargeting via WhatsApp is the highest-ROI allocation.",
    executive_diagnosis: "IMCO's WhatsApp-conversion model is working efficiently. EN/ES parity suggests unified messaging is effective. Retargeting is the highest-leverage channel. Seasonal test campaign is inconclusive — insufficient sample.",
    primary_constraint: "Seasonal summer campaign is underfunded — insufficient spend to validate. WhatsApp initiation rate in ES segment slightly lower than EN.",
    primary_opportunity: "EN/ES retargeting at $18.40 CPL — highest confidence. Story format in ES has not been tested as a WhatsApp CTA driver.",
    recommended_next_action: "1. Increase retargeting budget allocation — T1 confirmed. 2. Test Story format with WhatsApp CTA in ES segment. 3. Give seasonal campaign 30 more days or retire — currently insufficient_data.",
    risk_if_ignored: "Seasonal campaign is consuming budget at 3x the CPL of retargeting with no validated return. ES story format test delay risks missing the window.",
    cohort_key: "language" as const,
    created_by: "usr_0003",
    created_at: isoDate(5),
    completed_at: isoDate(5),
    findings: generateGenericFindings("run_0003", "ws_imco", 4),
    recommendations: generateRecommendations("run_0003", "ws_imco", 4),
    decision_feed: generateDecisionFeed("run_0003", "ws_imco", "aa_imco_meta", 5),
  },
  // KOV
  {
    id: "run_0004",
    workspace_id: "ws_kov",
    ad_account_id: "aa_kov_meta",
    import_ids: ["imp_0007", "imp_0008"],
    status: "Completed",
    objective: "ROAS improvement",
    depth: "Full IAP Analysis",
    date_range_start: isoDate(34),
    date_range_end: isoDate(4),
    confidence_score: 72,
    signal_quality: makeSignalQuality(72),
    priority_read: "ROAS has improved from 1.32x to 1.86x over the analysis window — positive trajectory, but account is below profitability threshold. Cart recovery (T1, $29.80 CPA, 2.38x ROAS) is the highest-efficiency lever. Camozzi creative is a confirmed Tier 4 — kill immediately. CRO gaps (hero copy, cart progress bar, exit-intent) are limiting conversion from paid media — these must be addressed before scaling spend.",
    executive_diagnosis: "KOV is improving but at-risk. ROAS recovery from 1.32x to 1.86x is directionally positive. Cart recovery is the one confirmed T1 lever. Camozzi creative is dead — cost is unjustified. CRO fixes are the highest-leverage opportunity and are blocking further ROAS improvement. Status: Needs Action.",
    primary_constraint: "Profitability threshold not yet reached. CRO gaps on Shopify are suppressing conversion from paid traffic. Camozzi creative consuming budget with negative return.",
    primary_opportunity: "Cart recovery at 2.38x ROAS is T1 confirmed — scale immediately. CRO improvements (hero copy, cart progress bar, exit-intent) are estimated to improve checkout rate by 15–25%.",
    recommended_next_action: "1. Kill Camozzi creative immediately — T4 confirmed, clear failure pattern. 2. Scale cart recovery budget — T1 with high confidence. 3. Brief Shopify CRO improvements: hero copy rewrite, cart progress bar install, exit-intent popup. 4. Retest Gaethje creative with isolated control.",
    risk_if_ignored: "Without CRO improvements, increasing paid media budget will not improve profitability. Camozzi creative is actively depressing account average ROAS. Account may fall back below 1.32x baseline without immediate action.",
    cohort_key: "placement" as const,
    created_by: "usr_0008",
    created_at: isoDate(4),
    completed_at: isoDate(4),
    findings: generateKOVFindings("run_0004"),
    recommendations: generateKOVRecommendations("run_0004"),
    decision_feed: generateDecisionFeed("run_0004", "ws_kov", "aa_kov_meta", 7),
  },
  // MMA
  {
    id: "run_0005",
    workspace_id: "ws_mma",
    ad_account_id: "aa_mma_meta",
    import_ids: ["imp_0009", "imp_0010"],
    status: "Completed",
    objective: "Lead quality",
    depth: "Creative Sprint Analysis",
    date_range_start: isoDate(37),
    date_range_end: isoDate(7),
    confidence_score: 88,
    signal_quality: makeSignalQuality(88),
    priority_read: "Demo request campaigns are the primary lead-gen control — $61–67 CPL, high confidence. HK_ProofFirst hook outperforms alternatives by 22%. Retargeting warm leads at $47.20 CPL is the highest-efficiency path. CPA reduction test is inconclusive.",
    executive_diagnosis: "Strong lead-gen performance across primary campaigns. Case study creative (HK_ProofFirst) is validated as the hook control. CPA reduction test needs more spend before conclusions are possible.",
    primary_constraint: "CPA reduction test is underfunded — validation_required. Agency brand campaign CPL ($80–94) is elevated compared to direct demo request.",
    primary_opportunity: "HK_ProofFirst hook validated — build next sprint around proof-led angles with case study specificity.",
    recommended_next_action: "1. Scale demo request campaigns — T1 confirmed. 2. Brief next sprint: proof-led hook variants with new case study specifics. 3. Give CPA reduction test 30 more days or retire.",
    risk_if_ignored: "Without a validated CPA reduction creative, cost efficiency will plateau. Agency brand campaign is running at 25% higher CPL — review or pause.",
    cohort_key: "creative_angle" as const,
    created_by: "usr_0002",
    created_at: isoDate(7),
    completed_at: isoDate(7),
    findings: generateGenericFindings("run_0005", "ws_mma", 4),
    recommendations: generateRecommendations("run_0005", "ws_mma", 4),
    decision_feed: generateDecisionFeed("run_0005", "ws_mma", "aa_mma_meta", 5),
  },
  // Metrix Internal runs
  ...Array.from({ length: 7 }, (_, i) => {
    const cohortKeys: CohortKey[] = ["device","creative_angle","age_gender","placement","language","audience_type","funnel_stage"];
    return {
      id: id("run", 6 + i),
      workspace_id: pick(["ws_bookster","ws_skov","ws_kov","ws_imco","ws_mma","ws_metrix"]),
      ad_account_id: pick(["aa_bookster_meta","aa_skov_meta","aa_kov_meta","aa_imco_meta","aa_mma_meta","aa_metrix_meta"]),
      import_ids: [id("imp", (i % 12) + 1)],
      status: pick(["Completed","Completed","Running","Failed"]) as AnalysisRun["status"],
      objective: pick(["CPA reduction","ROAS improvement","Creative testing read","Account audit"]) as AnalysisRun["objective"],
      depth: pick(["Fast Read","Full IAP Analysis","Executive Report"]) as AnalysisRun["depth"],
      date_range_start: isoDate(60 + i * 14),
      date_range_end: isoDate(30 + i * 7),
      confidence_score: randInt(45, 85),
      signal_quality: makeSignalQuality(randInt(45, 82)),
      priority_read: "SAMPLE — historical run. Signal quality moderate. No priority action surfaced.",
      executive_diagnosis: "Historical analysis. See run details for findings.",
      primary_constraint: pick(["Creative diversity","Spend insufficiency","Tracking gaps","Learning instability"]),
      primary_opportunity: pick(["Scale T1 creative","Expand to new audience","Brief new angle","Reduce CPA via creative isolation"]),
      recommended_next_action: "Review findings and decision feed.",
      risk_if_ignored: "Performance plateau without creative refresh.",
      cohort_key: cohortKeys[i % cohortKeys.length],
      created_by: "usr_0001",
      created_at: isoDate(35 + i * 10),
      completed_at: isoDate(34 + i * 10),
      findings: generateGenericFindings(id("run", 6 + i), pick(["ws_bookster","ws_skov","ws_kov","ws_imco","ws_mma"]), 3),
      recommendations: generateRecommendations(id("run", 6 + i), pick(["ws_bookster","ws_skov","ws_kov","ws_imco","ws_mma"]), 3),
      decision_feed: generateDecisionFeed(id("run", 6 + i), pick(["ws_bookster","ws_skov","ws_kov","ws_imco","ws_mma"]), pick(["aa_bookster_meta","aa_skov_meta","aa_kov_meta","aa_imco_meta","aa_mma_meta"]), 4),
    };
  }),
];

// ─── Decision Feed generators ─────────────────────────────────────────

function generateDecisionFeed(runId: string, wsId: string, aaId: string, count: number): DecisionFeedItem[] {
  const items: DecisionFeedItem[] = [];
  const now = isoDate(1);
  for (let i = 0; i < count; i++) {
    const tier: PerformanceTier = pick([1,1,2,2,3,4]) as PerformanceTier;
    const conf: ConfidenceLabel = tier === 1 ? pick(["high","medium"]) as ConfidenceLabel : tier === 4 ? "medium" : pick(["medium","validation_required"]) as ConfidenceLabel;
    const dtype: DecisionType = tier === 1 ? "Scale" : tier === 4 ? "Kill" : pick(["Hold","Isolate","Rebuild","Retest","Brief Next Sprint"]) as DecisionType;
    items.push({
      id: `dfi_${runId}_${i}`,
      run_id: runId,
      workspace_id: wsId,
      decision_type: dtype,
      tier,
      confidence_label: conf,
      evidence: pick([
        "3 consecutive weeks of CPT improvement. Android driving 78% of trial volume.",
        "CPA below account average by 22%. ROAS stable over 14-day window.",
        "Creative fatigue signal detected — hook score dropped from 82 to 51 over 21 days.",
        "Single conversion in 30 days on $1,900 spend. CPA 3.4x account average.",
        "Strong registration rate but checkout conversion not following.",
        "WhatsApp initiation rate improving — 12% over 2-week window.",
      ]),
      supporting_metric: pick(["CPT $258.34", "ROAS 3.2x", "CPL $61.40", "CPA $31.20", "CTR 3.4%", "Reg-to-trial 22.2%"]),
      why_it_matters: pick([
        "This is the primary trial-gen control — losing it without a replacement means volume collapse.",
        "Cart recovery is the highest-ROAS lever in the account. Not scaling it is leaving money on the table.",
        "Creative fatigue will compound — CPM increases as frequency rises, destroying efficiency.",
        "Dead creative is suppressing account average ROAS and absorbing budget that should go to T1.",
      ]),
      action: pick([
        "Increase budget allocation by 40%. Create Android-specific ad set.",
        "Kill immediately. Reallocate budget to T1 creative.",
        "Brief next sprint. Isolate hook variable. Retest with fresh creative.",
        "Hold current budget. Monitor for 7 more days before scaling.",
        "Rebuild with deadpan tone — remove enthusiasm-driven copy.",
      ]),
      risk_if_ignored: pick([
        "Trial volume will decline as fatigue accelerates without tested replacement.",
        "Account ROAS continues below profitability threshold.",
        "Budget consumed by dead creative. T1 starved of spend.",
        "ES segment conversion continues underperforming EN — bilingual gap widens.",
      ]),
      owner: pick(["usr_0001","usr_0003","usr_0007","usr_0008"]),
      status: pick(DECISION_STATUSES),
      budget_band: tier === 1 ? "critical_scale" : tier === 2 ? "scale" : tier === 3 ? "optimize" : "retire",
      created_at: now,
      updated_at: now,
    });
  }
  return items;
}

function generateBooksterFindings(runId: string): Finding[] {
  return [
    {
      id: `fnd_${runId}_001`,
      run_id: runId,
      workspace_id: "ws_bookster",
      title: "Registration flow restructure produced −55% CPT improvement",
      body: "Moving registration to last (pre-paywall) reduced cost-per-trial from $575.86 to $258.34. Android is the primary driver — reg-to-trial rate improved from 8.3% to 22.2% on Android. iOS improvement is masked by CAPI gap.",
      dimension: "Buyer-intent funnel",
      confidence: "high",
      tier: 1,
      is_priority_read: true,
      is_open: false,
      tags: ["registration", "funnel-restructure", "android", "trial-gen"],
      created_at: isoDate(2),
    },
    {
      id: `fnd_${runId}_002`,
      run_id: runId,
      workspace_id: "ws_bookster",
      title: "Pixel/CAPI tracking gap — OPEN, unresolved",
      body: "A pixel/CAPI mismatch is diagnosed as the root cause of a mid-cycle performance drop. iOS events are not being reliably captured. Estimated 30–40% underreporting on iOS conversion events. This finding is open and unresolved — dev team engagement required.",
      dimension: "Traffic quality",
      confidence: "high",
      tier: undefined,
      is_priority_read: true,
      is_open: true, // unresolved per spec
      tags: ["tracking", "capi", "pixel", "ios", "open-issue"],
      created_at: isoDate(2),
    },
    {
      id: `fnd_${runId}_003`,
      run_id: runId,
      workspace_id: "ws_bookster",
      title: "C4E aspirational authority creative is checkout-depth control",
      body: "C4E generated the majority of onb_initiate_checkout events. T1 confirmed with high confidence. Fatigue window approaching — estimated 3–5 weeks before hook score decay accelerates.",
      dimension: "Creative DNA",
      confidence: "high",
      tier: 1,
      is_priority_read: true,
      is_open: false,
      tags: ["c4e", "creative-control", "checkout-depth"],
      created_at: isoDate(2),
    },
    {
      id: `fnd_${runId}_004`,
      run_id: runId,
      workspace_id: "ws_bookster",
      title: "BYOC upload-flow angle is T1/T2 candidate — validation required",
      body: "BYOC (bring-your-own-content) upload-flow angle showing early T1 signals on Android. CPT $282.40, improving trend. HK_Curiosity hook driving hook score of 88. Insufficient spend for high confidence — validation required.",
      dimension: "Creative DNA",
      confidence: "validation_required",
      tier: 2,
      is_priority_read: false,
      is_open: false,
      tags: ["byoc", "upload-flow", "hk-curiosity", "android"],
      created_at: isoDate(2),
    },
    {
      id: `fnd_${runId}_005`,
      run_id: runId,
      workspace_id: "ws_bookster",
      title: "Female 45–54 strong registration rate, weak checkout conversion",
      body: "C2B drives strong registration in female 45–54 demographic but checkout conversion does not follow in V3. This segment requires quiz-gate testing to understand intent depth.",
      dimension: "Audience psychology",
      confidence: "medium",
      tier: 2,
      is_priority_read: false,
      is_open: false,
      tags: ["demographics", "female-45-54", "c2b", "checkout-gap"],
      created_at: isoDate(2),
    },
  ];
}

function generateKOVFindings(runId: string): Finding[] {
  return [
    {
      id: `fnd_${runId}_001`,
      run_id: runId,
      workspace_id: "ws_kov",
      title: "ROAS recovery arc: 1.32x → 1.86x over analysis window",
      body: "ROAS has improved materially over the window. Primary drivers: cart recovery campaign (T1, 2.38x) and Chuck Liddell fighter-led creative (T2, 1.86–1.91x). Camozzi creative is dragging account average down.",
      dimension: "Performance tiers",
      confidence: "medium",
      tier: 2,
      is_priority_read: true,
      is_open: false,
      tags: ["roas-recovery", "cart-recovery", "fighter-creative"],
      created_at: isoDate(4),
    },
    {
      id: `fnd_${runId}_002`,
      run_id: runId,
      workspace_id: "ws_kov",
      title: "Camozzi creative: Tier 4 — clear failure pattern",
      body: "Camozzi promo creative has produced 0.94x ROAS on $3,900 spend. CPA 74.80 vs account average 38.60. Three consecutive weeks of below-baseline performance. Failure pattern is consistent — eliminate.",
      dimension: "Failure patterns",
      confidence: "medium",
      tier: 4,
      is_priority_read: true,
      is_open: false,
      tags: ["camozzi", "tier-4", "eliminate", "creative-failure"],
      created_at: isoDate(4),
    },
    {
      id: `fnd_${runId}_003`,
      run_id: runId,
      workspace_id: "ws_kov",
      title: "CRO gaps are the primary conversion bottleneck",
      body: "Account Intelligence analysis shows hero copy, cart progress bar absence, and exit-intent gap are limiting checkout rate from paid traffic. CRO improvements are estimated to improve checkout 15–25% — higher leverage than creative scaling alone.",
      dimension: "Cross-dimensional patterns",
      confidence: "medium",
      tier: undefined,
      is_priority_read: true,
      is_open: true,
      tags: ["cro", "shopify", "hero-copy", "cart-progress", "exit-intent"],
      created_at: isoDate(4),
    },
    {
      id: `fnd_${runId}_004`,
      run_id: runId,
      workspace_id: "ws_kov",
      title: "Gaethje creative: validation required — early signals inconclusive",
      body: "Justin Gaethje collaboration creative showing 1.42x ROAS on $6,200 spend. Not enough conversions for high confidence. Retest with isolated budget and cleaner creative structure.",
      dimension: "Creative DNA",
      confidence: "validation_required",
      tier: 3,
      is_priority_read: false,
      is_open: false,
      tags: ["gaethje", "validation-required", "fighter-creative"],
      created_at: isoDate(4),
    },
  ];
}

function generateKOVRecommendations(runId: string): Recommendation[] {
  return [
    { id: `rec_${runId}_001`, run_id: runId, workspace_id: "ws_kov", title: "Kill Camozzi creative immediately", rationale: "T4 confirmed. 3x account average CPA. Clear failure pattern across multiple metrics.", action: "Pause all Camozzi ad variants. Reallocate budget to cart recovery and Chuck fighter-led creative.", priority: "Critical", confidence: "medium", owner: "usr_0007", status: "Open", created_at: isoDate(4) },
    { id: `rec_${runId}_002`, run_id: runId, workspace_id: "ws_kov", title: "Scale cart recovery campaign", rationale: "T1 confirmed, 2.38x ROAS, high confidence. Highest-efficiency lever in account.", action: "Increase cart recovery budget by 40%. Ensure retargeting window covers 7-day and 14-day cart abandonment.", priority: "Critical", confidence: "high", owner: "usr_0007", status: "In Progress", created_at: isoDate(4) },
    { id: `rec_${runId}_003`, run_id: runId, workspace_id: "ws_kov", title: "Brief Shopify CRO improvements", rationale: "CRO gaps are limiting checkout rate more than creative optimization at current spend levels.", action: "Rewrite hero copy with deadpan KOV brand voice. Install cart progress bar. Test exit-intent popup.", priority: "High", confidence: "medium", owner: "usr_0008", status: "Open", created_at: isoDate(4) },
    { id: `rec_${runId}_004`, run_id: runId, workspace_id: "ws_kov", title: "Retest Gaethje creative with isolated control", rationale: "Validation_required — early signals inconclusive. Do not scale yet.", action: "Run isolated Gaethje creative test with $2,000 budget and 14-day window. Report back with decision.", priority: "Medium", confidence: "validation_required", owner: "usr_0008", status: "Open", created_at: isoDate(4) },
  ];
}

function generateGenericFindings(runId: string, wsId: string, count: number): Finding[] {
  const dims = ["Buyer-intent funnel","Traffic quality","Creative DNA","Performance tiers","Audience psychology","Failure patterns","Confidence scoring","Winning variable stack"];
  return Array.from({ length: count }, (_, i) => ({
    id: `fnd_${runId}_${String(i+1).padStart(3,"0")}`,
    run_id: runId,
    workspace_id: wsId,
    title: pick([
      "Primary control creative holding — fatigue not detected",
      "Retargeting audience outperforming cold by 2.1x on CPA",
      "Segment clarity low in 18–24 age group — insufficient data",
      "Hook variable isolation test returned inconclusive",
      "CPA trending upward over last 14 days — monitor closely",
    ]),
    body: "SAMPLE finding. See full run details for complete analysis.",
    dimension: pick(dims),
    confidence: pick(CONFIDENCE_LEVELS),
    tier: pick([1,2,2,3]) as PerformanceTier,
    is_priority_read: i === 0,
    is_open: pick([true, false, false]),
    tags: [pick(["creative","audience","cpa","roas","tracking","segment"])],
    created_at: isoDate(randInt(1, 10)),
  }));
}

function generateRecommendations(runId: string, wsId: string, count: number): Recommendation[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `rec_${runId}_${String(i+1).padStart(3,"0")}`,
    run_id: runId,
    workspace_id: wsId,
    title: pick(["Scale T1 creative", "Brief next sprint", "Pause T4 creative", "Retest with isolation", "Monitor for 7 days"]),
    rationale: "Based on signal quality and performance tier analysis.",
    action: "See decision feed for specific action steps.",
    priority: pick(["Critical","High","Medium","Low"]) as Recommendation["priority"],
    confidence: pick(CONFIDENCE_LEVELS),
    owner: pick(["usr_0001","usr_0003","usr_0007","usr_0008"]),
    status: pick(["Open","In Progress","Completed","Dismissed"]) as Recommendation["status"],
    created_at: isoDate(randInt(1, 10)),
  }));
}

// ─── MST Matrices (3) ─────────────────────────────────────────────────

function makeMatrix(id: string, runId: string, wsId: string, name: string, rows: string[], cols: string[]): MSTMatrix {
  const cells: MSTMatrixCell[] = [];
  let cellN = 0;
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < cols.length; c++) {
      const isDiag = r === c;
      const result = isDiag
        ? pick(["universal_winner","avatar_specific","underperformer"]) as MSTMatrix["cells"][0]["result"]
        : pick(["universal_winner","avatar_specific","underperformer","neutral","insufficient_data"]) as MSTMatrix["cells"][0]["result"];
      cells.push({
        id: `mc_${id}_${cellN++}`,
        matrix_id: id,
        row_index: r,
        col_index: c,
        is_diagonal: isDiag,
        variable_code: rows[r],
        icp_name: cols[c],
        result,
        spend_usd: randInt(800, 6000),
        conversions: randInt(3, 80),
        confidence: randInt(0,100) > 50 ? "medium" : pick(["validation_required","insufficient"]) as ConfidenceLabel,
        notes: result === "universal_winner" ? "Winning across all tested avatars." : result === "avatar_specific" ? "Only effective for this avatar." : "",
      });
    }
  }
  return {
    id,
    run_id: runId,
    workspace_id: wsId,
    name,
    description: "Matrix Sprint Test — rows (variable signals) × columns (ICP patterns) with diagonals (maximum isolation).",
    row_labels: rows,
    col_labels: cols,
    diagonal_hypothesis: "Maximum variable isolation — each diagonal cell tests a single hook/angle against its best-matched ICP.",
    cells,
    created_at: isoDate(5),
  };
}

export const MST_MATRICES: MSTMatrix[] = [
  makeMatrix(
    "mst_0001", "run_0004", "ws_kov",
    "KOV Sprint Matrix — Fighter Hook × Avatar",
    ["HK_Authority_Chuck","HK_Challenge_Fighter","HK_Contrast_NoHype","HK_Result_ProvenGear"],
    ["Combat Sports Loyalist","Casual Fan","Gift Buyer","Fitness Apparel Crossover"]
  ),
  makeMatrix(
    "mst_0002", "run_0001", "ws_bookster",
    "Bookster Sprint Matrix — Hook × Platform × ICP",
    ["HK_Authority_Expert","HK_Benefit_15Min","HK_Problem_Unfinished","HK_Curiosity_BYOC","HK_Result_Retained"],
    ["Time-Starved Professional","Depth-Seeking 45-54F","Android Casual Reader","iOS Power User"]
  ),
  makeMatrix(
    "mst_0003", "run_0002", "ws_skov",
    "SKOV Sprint Matrix — Creative Angle × Dog Owner Segment",
    ["HK_Result_K9Performance","HK_Benefit_NaturalIngredients","HK_Curiosity_WorldCup","HK_Authority_VetApproved"],
    ["Performance Dog Owner","Casual Pet Parent","Health-Conscious Millennial"]
  ),
];

// ─── Briefs (12) ──────────────────────────────────────────────────────

const BRIEF_TITLES_BY_WS: Record<string, string[]> = {
  ws_bookster: [
    "BYOC Upload Flow — Hook Isolation Brief",
    "C4E Aspirational Authority — Sprint Refresh",
    "Android Trial Gen — Registration Pre-Paywall",
    "Registration Flow — Pre-Paywall Hook Test",
  ],
  ws_skov: [
    "K9 World Cup — Bundle Offer Extension",
    "Slow Feeder Bowl — Testimonial Angle",
  ],
  ws_kov: [
    "Chuck Fighter Creative — Deadpan Refresh",
    "Cart Recovery — Urgency Hook Variants",
    "KOV CRO Brief — Hero Copy Variants",
  ],
  ws_imco: [
    "IMCO Retarget — WhatsApp Final Push",
    "IMCO Seasonal — Summer WhatsApp Push",
  ],
  ws_mma: [
    "MMA Case Study — Proof Hook Sprint",
    "Agency Inbound — Demo Request Brief",
  ],
  ws_metrix: [
    "QA Sprint — Variable Isolation Test",
  ],
};

const AUDIENCE_INSIGHTS_BY_WS: Record<string, string[]> = {
  ws_bookster: ["Time-starved professional reader, Android-dominant, 25–44.", "Depth-seeking female 45–54. High registration rate, weaker checkout conversion.", "High-achiever guilt reader. Values efficiency framing over feature lists."],
  ws_skov: ["Performance-minded dog owner, 25–45, suburban. Responds to scientific proof.", "Casual pet parent. Health-conscious millennial. Influenced by lifestyle imagery."],
  ws_kov: ["Combat sports loyalist, deadpan brand sensitivity. Distrusts hype.", "UFC fan, 22–38, event-driven purchasing cycle. Responds to earned credibility."],
  ws_imco: ["Miami truck owner, bilingual, WhatsApp-preferred.", "Spanish-dominant, community-influenced buyer. High WhatsApp engagement."],
  ws_mma: ["Marketing director, 30–50, ROI-first buyer. Skeptical of agency promises.", "Performance marketer, multiple agency relationships. Responds to specific metrics."],
  ws_metrix: ["Internal QA persona. Used to validate confidence label rendering."],
};

const WINNING_SIGNALS_BY_WS: Record<string, string[]> = {
  ws_bookster: ["HK_Authority + TN_Aspirational + CTA_StartFree performing at P1.", "BYOC hook showing 88 hook score — validate with dedicated budget.", "C4E control: primary checkout-depth driver. Android bidding advantage confirmed."],
  ws_skov: ["World Cup K9 athlete creative at 3.2x ROAS — T1 confirmed.", "Slow feeder bowl demo video: P2 with room to scale.", "Bundle offer test in progress — early conversion signal positive."],
  ws_kov: ["Cart recovery at 2.38x ROAS — highest lever in account.", "Chuck fighter-led content outperforming generic brand creative 2:1.", "Deadpan delivery is the brand-safe hook. No enthusiasm — let the gear speak."],
  ws_imco: ["EN/ES retarget creative at P1. WhatsApp CTA in first 3 seconds is key.", "Before/After visual structure outperforming all other angles.", "Spanish-first copy with WhatsApp call to action leading conversion."],
  ws_mma: ["Case study hook (HK_ProofFirst) is the P1 control.", "Demo CTA outperforming Learn More by 22% on Director segment.", "Proof-first + rational tone is the winning stack for B2B leads."],
  ws_metrix: ["Low signal. Sandbox signals only — no real benchmark set."],
};

const MESSAGING_DIRECTION_BY_WS: Record<string, string[]> = {
  ws_bookster: ["Lead with efficiency proof, not feature list.", "15 minutes a day. Key ideas retained. No card required.", "Guilt-hook on unfinished books — then offer the exit."],
  ws_skov: ["Performance proof first. Scientific framing over lifestyle imagery.", "World Cup energy. K9 athlete visual. Bundle CTA.", "Ingredient quality proof. Vet-approved framing."],
  ws_kov: ["Deadpan delivery only. No enthusiasm. Let the gear speak.", "Fighter-led content. Short copy. Product flat lay.", "Cart recovery urgency. Limited run. No hype."],
  ws_imco: ["Spanish-first copy. WhatsApp CTA in first 3 seconds.", "Before/After transformation. Local credibility signals.", "Community voice. Real builds. Real customers."],
  ws_mma: ["Lead with ROI proof, then the system behind it.", "Case study anchor. Specific metrics. Not general claims.", "Demo CTA primary. Learn More as fallback only."],
  ws_metrix: ["QA messaging only. No production copy."],
};

const VISUAL_DIRECTION_BY_WS: Record<string, string[]> = {
  ws_bookster: ["Dark DR card. Oversized typography. Yellow mascot.", "Cozy reading lamp environment. Tilted phone UI reveal.", "Split screen: book pile vs. 15-min insight card."],
  ws_skov: ["Dog in motion. World Cup energy. Performance callouts.", "Ingredient label close-up. Clean white background.", "Before/after: dog energy levels. Authentic owner footage."],
  ws_kov: ["Fighter portrait. Minimal copy overlay. Product flat lay.", "Deadpan lifestyle. Muted palette. No gradient backgrounds.", "Chuck in gear. Sparse composition. Dark background."],
  ws_imco: ["Before/after truck transformation. Real vehicle photography.", "Clean split screen. EN/ES text overlay.", "Miami street aesthetic. Low angle. Chrome detail close-up."],
  ws_mma: ["Clean data card. Agency brand colours. Metric callouts.", "Case study screenshot. Real platform data. No stock.", "Founder-led direct-to-camera. Professional but not corporate."],
  ws_metrix: ["QA placeholder visuals only."],
};

function makeBrief(n: number) {
  const wsPool = ["ws_bookster","ws_bookster","ws_bookster","ws_skov","ws_skov","ws_kov","ws_kov","ws_imco","ws_mma","ws_mma","ws_metrix","ws_bookster"];
  const runPool = ["run_0001","run_0001","run_0001","run_0002","run_0002","run_0004","run_0004","run_0003","run_0005","run_0005","run_0006","run_0001"];
  const wsId = wsPool[n - 1];
  const runId = runPool[n - 1];
  const titles = BRIEF_TITLES_BY_WS[wsId] ?? ["Sprint Brief"];
  const audiences = AUDIENCE_INSIGHTS_BY_WS[wsId] ?? ["Audience data pending."];
  const winningSignals = WINNING_SIGNALS_BY_WS[wsId] ?? ["Signal data pending."];
  const messaging = MESSAGING_DIRECTION_BY_WS[wsId] ?? ["Messaging direction pending."];
  const visuals = VISUAL_DIRECTION_BY_WS[wsId] ?? ["Visual direction pending."];

  const objectiveByWs: Record<string, AnalysisRun["objective"][]> = {
    ws_bookster: ["CPA reduction", "CPA reduction", "Creative testing read"],
    ws_skov: ["ROAS improvement", "ROAS improvement"],
    ws_kov: ["ROAS improvement", "CPA reduction", "ROAS improvement"],
    ws_imco: ["Lead quality", "Lead quality"],
    ws_mma: ["Lead quality", "Lead quality"],
    ws_metrix: ["Creative testing read"],
  };
  const objectives = objectiveByWs[wsId] ?? (["CPA reduction"] as AnalysisRun["objective"][]);

  return {
    id: id("brief", n),
    workspace_id: wsId,
    run_id: runId,
    status: pick(["Draft","In Review","Approved","In Production","Archived"]) as "Draft"|"In Review"|"Approved"|"In Production"|"Archived",
    title: pick(titles),
    objective: pick(objectives),
    owner: pick(["usr_0001","usr_0003","usr_0008"]),
    created_at: isoDate(randInt(1, 20)),
    updated_at: isoDate(1),
    diagnosis: "SAMPLE diagnosis from IAP analysis. See source run for full context.",
    audience_insight: pick(audiences),
    winning_signal: pick(winningSignals),
    messaging_direction: pick(messaging),
    creative_concepts: [
      { name: pick(["Control refresh","Challenger variant","Isolation test"]), hook: pick(HOOK_TEMPLATES), angle: pick(["Before/After","Authority","Problem-Solution"]), variable_codes: pickN([...HOOK_TEMPLATES,...FRAMEWORK_TEMPLATES], 3), format: pick(["Feed","Story","Reel"]), notes: "SAMPLE concept." },
    ],
    hook_options: pickN(HOOK_TEMPLATES, 3),
    offer_framing: pick(["Try free — no card required.", "Start free. Cancel anytime.", "Message us for a custom quote.", "Shop now — limited run."]),
    proof_requirements: ["3 real data points minimum", "No generic stock imagery", "Real user outcomes preferred"],
    visual_direction: pick(visuals),
    format_guidance: "Feed first. Story second. Reel only if hook is motion-native.",
    funnel_stage: pick(["TOF","MOF","BOF"]),
    test_matrix: "Isolate one variable per cell. Min $1,000 spend per variant before reading.",
    production_notes: "Do not use stock photography. All copy subject to brand voice review.",
    do_not_do: ["No gradient backgrounds", "No enthusiasm-driven copy (KOV)", "No feature-list headlines", "No implied ROAS guarantees"],
    success_metric: pick(["CPT < $280", "ROAS > 2.0x", "CPL < $65", "WhatsApp initiation rate > 3%"]),
    cohort_key: pick(["device","creative_angle","age_gender","placement","language"]) as CohortKey,
  };
}

export const BRIEFS: ReturnType<typeof makeBrief>[] = Array.from({ length: 12 }, (_, i) => makeBrief(i + 1));

// ─── Closed-loop linkage ──────────────────────────────────────────────
// Wire the back-references that make the analysis → strategy → brief →
// asset → analysis loop legible in the UI. SAMPLE linkage — deterministic,
// scoped by workspace, prefers a shared hook variable where one exists.
(function linkClosedLoop() {
  const conceptsByWs = new Map<string, CreativeConcept[]>();
  for (const c of CREATIVE_CONCEPTS) {
    const arr = conceptsByWs.get(c.workspace_id) ?? [];
    arr.push(c);
    conceptsByWs.set(c.workspace_id, arr);
  }

  // Concept ↔ Ad: every deployed ad registers under a library concept.
  ADS.forEach((ad, i) => {
    const pool = conceptsByWs.get(ad.workspace_id);
    if (!pool || pool.length === 0) return;
    const match =
      pool.find(c => ad.variable_codes.includes(c.hook_variable)) ??
      pool[i % pool.length];
    ad.creative_concept_id = match.id;
    if (!match.related_ads.includes(ad.id)) match.related_ads.push(ad.id);
  });

  // Concept ↔ Brief: brief generation registers concepts into the local
  // IAP library. Register each brief on up to 2 concepts in its workspace.
  BRIEFS.forEach((brief, i) => {
    const pool = conceptsByWs.get(brief.workspace_id);
    if (!pool || pool.length === 0) return;
    const start = i % pool.length;
    for (let k = 0; k < Math.min(2, pool.length); k++) {
      const c = pool[(start + k) % pool.length];
      if (!c.related_briefs.includes(brief.id)) c.related_briefs.push(brief.id);
    }
  });
})();

// ─── Reports (10) ─────────────────────────────────────────────────────

export const REPORTS: Report[] = Array.from({ length: 10 }, (_, i) => {
  const n = i + 1;
  const wsPool = ["ws_bookster","ws_bookster","ws_skov","ws_skov","ws_kov","ws_imco","ws_mma","ws_mma","ws_metrix","ws_bookster"];
  const aaPool = ["aa_bookster_meta","aa_bookster_meta","aa_skov_meta","aa_skov_meta","aa_kov_meta","aa_imco_meta","aa_mma_meta","aa_mma_meta","aa_metrix_meta","aa_bookster_meta"];
  const runPool = ["run_0001","run_0001","run_0002","run_0002","run_0004","run_0003","run_0005","run_0005","run_0006","run_0001"];
  const reportCohortKeys: CohortKey[] = ["device","creative_angle","age_gender","placement","language","audience_type","device","creative_angle","age_gender","device"];
  return {
    id: id("rpt", n),
    workspace_id: wsPool[i],
    run_id: runPool[i],
    ad_account_id: aaPool[i],
    cohort_key: reportCohortKeys[i],
    title: pick(["IAP Full Analysis Report","Creative Sprint Report","Executive Summary","Monthly Performance Report","Sprint Test Readout"]),
    status: pick(["Draft","Final","Final","In Review","Sent"]) as Report["status"],
    client_ready: pick([true, true, false]),
    created_at: isoDate(randInt(1, 30)),
    generated_by: "usr_0001",
    date_range_start: isoDate(randInt(30, 60)),
    date_range_end: isoDate(randInt(1, 10)),
    executive_summary: "SAMPLE report. See source run for full diagnostic.",
    what_happened: "Performance shifted materially during the analysis window. See findings for detail.",
    what_it_means: "The primary creative control is holding. Tracking gaps are limiting insight fidelity on iOS.",
    what_to_do_next: "Scale T1 creative. Kill T4. Brief next sprint.",
    creative_learnings: "HK_Authority + TN_Aspirational is the winning hook stack. FW_BAB underperforming vs FW_AIDA on Android.",
    budget_decisions: "Reallocate 15% from T4 to cart recovery. Hold remaining budget pending CAPI fix.",
    next_sprint: "3 new creative cells ready for briefing. BYOC angle has priority.",
    appendix: "Full pivot table data available on request. Confidence labels applied per IAP taxonomy.",
  };
});

// ─── Benchmark Memory (20) ────────────────────────────────────────────

export const BENCHMARK_MEMORY: BenchmarkMemory[] = Array.from({ length: 20 }, (_, i) => {
  const n = i + 1;
  const wsPool = ["ws_bookster","ws_skov","ws_kov","ws_imco","ws_mma","ws_metrix"];
  const ws = wsPool[i % wsPool.length];
  return {
    id: id("bm", n),
    workspace_id: ws,
    benchmark_type: pick(["account","concept","hook","offer","placement"]) as BenchmarkMemory["benchmark_type"],
    label: pick(["HK_ProofFirst performance baseline","CPA range for Android trial-gen","ROAS range for fighter-led creative","Cart recovery CPL benchmark","Meta Feed placement efficiency"]),
    cpa_range_min: randFloat(20, 60),
    cpa_range_max: randFloat(80, 300),
    roas_range_min: randFloat(0.8, 1.5),
    roas_range_max: randFloat(2.0, 4.5),
    fatigue_threshold_days: randInt(21, 60),
    previous_winners: pickN(["C4E aspirational authority","BYOC upload-flow","K9 World Cup athlete","Chuck Liddell deadpan","Cart recovery urgency","HK_ProofFirst case study"], 2),
    false_positives: pickN(["C2E READ LESS KEEP MORE — consumed spend with no trials V1","Camozzi promo — failed 3 weeks running","Seasonal summer IMCO — inconclusive"], 1),
    rejected_recommendations: pickN(["Scale iOS before CAPI fix — rejected","Consolidate EN/ES into single campaign — rejected"], 1),
    recorded_at: isoDate(randInt(10, 90)),
    notes: "SAMPLE benchmark record. Real benchmarks will be populated from live IAP runs.",
  };
});

// ─── Change Events (15) ───────────────────────────────────────────────

export const CHANGE_EVENTS: ChangeEvent[] = Array.from({ length: 15 }, (_, i) => {
  const n = i + 1;
  const wsPool = ["ws_bookster","ws_bookster","ws_kov","ws_kov","ws_skov","ws_imco","ws_mma","ws_metrix"];
  const aaPool = ["aa_bookster_meta","aa_bookster_meta","aa_kov_meta","aa_kov_meta","aa_skov_meta","aa_imco_meta","aa_mma_meta","aa_metrix_meta"];
  const idx = i % wsPool.length;
  return {
    id: id("ce", n),
    workspace_id: wsPool[idx],
    ad_account_id: aaPool[idx],
    category: pick(["Campaign","Creative","Budget","Status","Tracking"]) as ChangeEvent["category"],
    description: pick([
      "Registration step moved to pre-paywall position — funnel restructure",
      "CAPI integration gap detected — iOS conversion events not matching pixel",
      "Camozzi creative paused following Tier 4 classification",
      "Budget reallocated: +40% to cart recovery, -30% from Gaethje creative",
      "Google PMax bidding strategy updated — confirmed retargeting-only",
      "WhatsApp campaign objective changed from Lead to Message",
      "New import uploaded: demographic_text breakdown Q2 2026",
      "C4E creative fatigue flag set — hook score declined to 62",
    ]),
    detected_at: isoDate(randInt(1, 30)),
    source: pick(["Manual","API Sync","Import Delta","User Action"]) as ChangeEvent["source"],
    potential_impact: pick(["High","Medium","Low"]) as ChangeEvent["potential_impact"],
    related_performance_shift: pick(["CPT −55% (registration restructure)","ROAS improved 1.32x→1.86x","No measurable shift yet","Hook score declined 82→62"]),
    audit_detail: "Logged automatically. Review in Audit Trail for full context.",
    status: pick(["New","Reviewed","Dismissed"]) as ChangeEvent["status"],
  };
});

// ─── Audit Logs ───────────────────────────────────────────────────────

export const AUDIT_LOGS: AuditLog[] = Array.from({ length: 20 }, (_, i) => ({
  id: id("al", i + 1),
  workspace_id: pick(WORKSPACES.map(w => w.id)),
  user_id: pick(USERS.map(u => u.id)),
  action: pick(["created_run","updated_decision","imported_file","generated_brief","viewed_report","changed_status"]),
  entity_type: pick(["analysis_run","decision_feed_item","import","brief","report"]),
  entity_id: pick(["run_0001","run_0002","brief_0001","imp_0001"]),
  metadata: {},
  created_at: isoDate(randInt(0, 30)),
}));

// ─── Prompt Versions ──────────────────────────────────────────────────

export const PROMPT_VERSIONS: PromptVersion[] = [
  { id: "pv_0001", name: "IAP Analysis Core", version: "v2.4.1", description: "11-dimension analysis prompt with confidence scoring", phase: "analysis", created_at: isoDate(30) },
  { id: "pv_0002", name: "Report Summary", version: "v1.8.0", description: "Client-ready report generation", phase: "reporting", created_at: isoDate(20) },
  { id: "pv_0003", name: "Brief Generator", version: "v3.1.2", description: "Production-ready creative brief output", phase: "brief", created_at: isoDate(15) },
  { id: "pv_0004", name: "Strategy Map", version: "v1.5.0", description: "ICP registry and message pillar extraction", phase: "strategy", created_at: isoDate(45) },
  { id: "pv_0005", name: "Optimization Loop", version: "v1.2.0", description: "Variable re-weighting and budget allocation", phase: "optimization", created_at: isoDate(60) },
];

// ─── Creative Variables ────────────────────────────────────────────────

export const CREATIVE_VARIABLES: CreativeVariable[] = [
  ...HOOK_TEMPLATES.map((code, i) => ({ id: id("cv", i + 1), workspace_id: pick(WORKSPACES.map(w => w.id)), code, family: "HK" as const, label: code.replace("HK_", "Hook: "), performance_index: randInt(70, 180), usage_count: randInt(2, 18), win_rate: randFloat(0.1, 0.7) })),
  ...FRAMEWORK_TEMPLATES.map((code, i) => ({ id: id("cv", 20 + i), workspace_id: pick(WORKSPACES.map(w => w.id)), code, family: "FW" as const, label: code.replace("FW_", "Framework: "), performance_index: randInt(70, 160), usage_count: randInt(2, 14), win_rate: randFloat(0.1, 0.65) })),
];

// ═══════════════════════════════════════════════════════════════════════
// V2.0 MOCK DATA — Four-Plane Architecture (Section 11)
// ═══════════════════════════════════════════════════════════════════════

const COHORT_KEYS: CohortKey[] = ["age_gender", "placement", "device", "creative_angle", "funnel_stage", "language", "geography", "audience_type"];

// ─── Cohort Definitions ───────────────────────────────────────────────

export const COHORT_DEFINITIONS: CohortDefinition[] = [
  { id: "cd_0001", cohort_key: "age_gender", label: "Age × Gender", description: "Segments by age range and gender for creative and bidding differentiation.", funnel_stages: ["TOF", "MOF"], kpi_targets: { cpa_max_usd: 45, roas_min: 2.0 }, created_at: isoDate(60) },
  { id: "cd_0002", cohort_key: "placement", label: "Placement", description: "Feed vs. Story vs. Reel placement performance isolation.", funnel_stages: ["TOF", "MOF", "BOF"], kpi_targets: { cpa_max_usd: 50, ctr_min: 0.015 }, created_at: isoDate(60) },
  { id: "cd_0003", cohort_key: "device", label: "Device", description: "Mobile vs. Desktop conversion efficiency — critical for iOS/Android splits.", funnel_stages: ["TOF", "MOF", "BOF"], kpi_targets: { cpa_max_usd: 300, conversion_rate_min: 0.01 }, created_at: isoDate(60) },
  { id: "cd_0004", cohort_key: "creative_angle", label: "Creative Angle", description: "Hook variable family performance comparison across angles.", funnel_stages: ["TOF"], kpi_targets: { hook_score_min: 60, cpa_max_usd: 55 }, created_at: isoDate(60) },
  { id: "cd_0005", cohort_key: "funnel_stage", label: "Funnel Stage", description: "TOF / MOF / BOF performance segmentation for budget allocation.", funnel_stages: ["TOF", "MOF", "BOF"], kpi_targets: { roas_min: 1.5, cpa_max_usd: 60 }, created_at: isoDate(60) },
  { id: "cd_0006", cohort_key: "language", label: "Language", description: "EN vs. ES creative performance — bilingual market split.", funnel_stages: ["TOF", "MOF"], kpi_targets: { cpa_max_usd: 35, whatsapp_initiation_min: 0.03 }, created_at: isoDate(60) },
  { id: "cd_0007", cohort_key: "geography", label: "Geography", description: "DMA-level geo targeting — Miami metro, national, international.", funnel_stages: ["TOF", "MOF", "BOF"], kpi_targets: { cpa_max_usd: 40 }, created_at: isoDate(60) },
  { id: "cd_0008", cohort_key: "audience_type", label: "Audience Type", description: "Cold prospecting vs. warm lookalike vs. retargeting audience type.", funnel_stages: ["TOF", "MOF", "BOF"], kpi_targets: { roas_min: 2.5 }, created_at: isoDate(60) },
];

// ─── Client Enabled Cohorts ───────────────────────────────────────────

export const CLIENT_ENABLED_COHORTS: ClientEnabledCohort[] = [
  // Bookster — device and funnel stage are primary (iOS/Android split is key)
  { id: "cec_0001", client_id: "ws_bookster", workspace_id: "ws_bookster", cohort_key: "device", cohort_definition_id: "cd_0003", is_primary: true, priority: 1, funnel_stages: ["TOF", "MOF", "BOF"], kpi_targets: { cpa_max_usd: 300, conversion_rate_min: 0.01 }, enabled: true, updated_at: isoDate(2) },
  { id: "cec_0002", client_id: "ws_bookster", workspace_id: "ws_bookster", cohort_key: "creative_angle", cohort_definition_id: "cd_0004", is_primary: false, priority: 2, funnel_stages: ["TOF"], kpi_targets: { hook_score_min: 60, cpa_max_usd: 280 }, enabled: true, updated_at: isoDate(2) },
  { id: "cec_0003", client_id: "ws_bookster", workspace_id: "ws_bookster", cohort_key: "age_gender", cohort_definition_id: "cd_0001", is_primary: false, priority: 3, funnel_stages: ["TOF", "MOF"], kpi_targets: { cpa_max_usd: 320 }, enabled: true, updated_at: isoDate(7) },
  { id: "cec_0004", client_id: "ws_bookster", workspace_id: "ws_bookster", cohort_key: "placement", cohort_definition_id: "cd_0002", is_primary: false, priority: 4, funnel_stages: ["TOF", "MOF"], kpi_targets: { cpa_max_usd: 300, ctr_min: 0.015 }, enabled: false, updated_at: isoDate(14) },
  // SKOV Pet
  { id: "cec_0005", client_id: "ws_skov", workspace_id: "ws_skov", cohort_key: "creative_angle", cohort_definition_id: "cd_0004", is_primary: true, priority: 1, funnel_stages: ["TOF"], kpi_targets: { roas_min: 3.0, cpa_max_usd: 30 }, enabled: true, updated_at: isoDate(3) },
  { id: "cec_0006", client_id: "ws_skov", workspace_id: "ws_skov", cohort_key: "audience_type", cohort_definition_id: "cd_0008", is_primary: false, priority: 2, funnel_stages: ["TOF", "MOF"], kpi_targets: { roas_min: 2.5 }, enabled: true, updated_at: isoDate(3) },
  // IMCO Wheels
  { id: "cec_0007", client_id: "ws_imco", workspace_id: "ws_imco", cohort_key: "language", cohort_definition_id: "cd_0006", is_primary: true, priority: 1, funnel_stages: ["TOF", "MOF"], kpi_targets: { cpa_max_usd: 32, whatsapp_initiation_min: 0.03 }, enabled: true, updated_at: isoDate(5) },
  { id: "cec_0008", client_id: "ws_imco", workspace_id: "ws_imco", cohort_key: "geography", cohort_definition_id: "cd_0007", is_primary: false, priority: 2, funnel_stages: ["TOF"], kpi_targets: { cpa_max_usd: 35 }, enabled: true, updated_at: isoDate(5) },
  // King of Violence
  { id: "cec_0009", client_id: "ws_kov", workspace_id: "ws_kov", cohort_key: "creative_angle", cohort_definition_id: "cd_0004", is_primary: true, priority: 1, funnel_stages: ["TOF", "MOF"], kpi_targets: { roas_min: 2.0, cpa_max_usd: 40 }, enabled: true, updated_at: isoDate(4) },
  { id: "cec_0010", client_id: "ws_kov", workspace_id: "ws_kov", cohort_key: "funnel_stage", cohort_definition_id: "cd_0005", is_primary: false, priority: 2, funnel_stages: ["TOF", "MOF", "BOF"], kpi_targets: { roas_min: 1.8 }, enabled: true, updated_at: isoDate(4) },
];

// ─── Analysis Run Stages (11 IAP prompts per run) ─────────────────────

const IAP_STAGE_NAMES = [
  { name: "Data Ingestion", label: "Parse & validate import files" },
  { name: "Signal Quality Assessment", label: "Score tracking confidence & data sufficiency" },
  { name: "Buyer-Intent Funnel", label: "Map conversion paths and funnel drop-offs" },
  { name: "Performance Tiers", label: "Classify T1–T4 across campaigns and ads" },
  { name: "Creative DNA Analysis", label: "Isolate winning hook/tone/framework variables" },
  { name: "Audience Psychology", label: "Identify ICP resonance patterns" },
  { name: "Traffic Quality", label: "Assess placement, device and CPM distribution" },
  { name: "Failure Patterns", label: "Detect and classify underperformers" },
  { name: "Cross-Dimensional Patterns", label: "Surface multi-variable interactions" },
  { name: "Confidence Scoring", label: "Apply confidence labels per IAP taxonomy" },
  { name: "Output Generation", label: "Generate intelligence cards and recommendations" },
];

function makeRunStages(runId: string, overallStatus: AnalysisRun["status"]): AnalysisRunStage[] {
  return IAP_STAGE_NAMES.map((s, i) => {
    let status: AnalysisRunStageStatus = "complete";
    if (overallStatus === "Pending") status = i === 0 ? "pending" : "pending";
    else if (overallStatus === "Running") status = i < 7 ? "complete" : i === 7 ? "running" : "pending";
    else if (overallStatus === "Failed") status = i < 5 ? "complete" : i === 5 ? "failed" : "skipped";
    const durationMs = status === "complete" ? randInt(800, 4200) : undefined;
    return {
      id: `stage_${runId}_${String(i + 1).padStart(2, "0")}`,
      run_id: runId,
      stage_number: i + 1,
      stage_name: s.name,
      prompt_label: s.label,
      status,
      started_at: status !== "pending" ? isoDate(2) : undefined,
      completed_at: status === "complete" ? isoDate(2) : undefined,
      duration_ms: durationMs,
      output_summary: status === "complete" ? pick([
        "Stage complete — outputs staged.",
        "Analysis complete. Findings generated.",
        "Processed successfully.",
        "No anomalies detected.",
      ]) : status === "failed" ? "Stage failed: token limit exceeded on large context window." : undefined,
    };
  });
}

export const ANALYSIS_RUN_STAGES: AnalysisRunStage[] = [
  ...makeRunStages("run_0001", "Completed"),
  ...makeRunStages("run_0002", "Completed"),
  ...makeRunStages("run_0003", "Completed"),
  ...makeRunStages("run_0004", "Completed"),
  ...makeRunStages("run_0005", "Running"),
  ...makeRunStages("run_0006", "Failed"),
];

// ─── Analysis Run Cohorts ─────────────────────────────────────────────

export const ANALYSIS_RUN_COHORTS: AnalysisRunCohort[] = [
  { id: "arc_0001", run_id: "run_0001", cohort_key: "device", cohort_definition_id: "cd_0003", snapshot_label: "Device (iOS vs Android)", was_primary: true, kpi_targets_snapshot: { cpa_max_usd: 300 } },
  { id: "arc_0002", run_id: "run_0001", cohort_key: "creative_angle", cohort_definition_id: "cd_0004", snapshot_label: "Creative Angle (Hook family)", was_primary: false, kpi_targets_snapshot: { hook_score_min: 60, cpa_max_usd: 280 } },
  { id: "arc_0003", run_id: "run_0001", cohort_key: "age_gender", cohort_definition_id: "cd_0001", snapshot_label: "Age × Gender (Female 45-54)", was_primary: false, kpi_targets_snapshot: { cpa_max_usd: 320 } },
  { id: "arc_0004", run_id: "run_0002", cohort_key: "creative_angle", cohort_definition_id: "cd_0004", snapshot_label: "Creative Angle (World Cup vs Standard)", was_primary: true, kpi_targets_snapshot: { roas_min: 3.0, cpa_max_usd: 30 } },
  { id: "arc_0005", run_id: "run_0003", cohort_key: "language", cohort_definition_id: "cd_0006", snapshot_label: "Language (EN vs ES)", was_primary: true, kpi_targets_snapshot: { cpa_max_usd: 32, whatsapp_initiation_min: 0.03 } },
  { id: "arc_0006", run_id: "run_0004", cohort_key: "creative_angle", cohort_definition_id: "cd_0004", snapshot_label: "Creative Angle (Fighter-led vs Generic)", was_primary: true, kpi_targets_snapshot: { roas_min: 2.0, cpa_max_usd: 40 } },
  { id: "arc_0007", run_id: "run_0004", cohort_key: "funnel_stage", cohort_definition_id: "cd_0005", snapshot_label: "Funnel Stage (TOF/MOF/BOF)", was_primary: false, kpi_targets_snapshot: { roas_min: 1.8 } },
];

// ─── Intelligence Cards ───────────────────────────────────────────────

function makeCard(
  n: number,
  runId: string,
  wsId: string,
  cohortKey: CohortKey,
  cardType: IntelligenceCardType,
  subtype: IntelligenceCardSubtype,
  scope: EntityScope,
  title: string,
  evidence: string,
  recommendation: string,
  confidence: ConfidenceLabel,
  priority: IntelligenceCard["priority"],
  severity: IntelligenceCard["severity"],
  reviewStatus: ReviewStatus = "needs_review",
): IntelligenceCard {
  return {
    id: id("ic", n),
    run_id: runId,
    workspace_id: wsId,
    cohort_key: cohortKey,
    card_type: cardType,
    card_subtype: subtype,
    entity_scope: scope,
    entity_id: scope === "campaign" ? `cmp_${String(n).padStart(4, "0")}` : scope === "ad_set" ? `as_${String(n).padStart(4, "0")}` : `ad_${String(n).padStart(4, "0")}`,
    entity_name: title.split(":")[0].trim(),
    title,
    evidence_summary: evidence,
    recommendation,
    confidence_grade: confidence,
    priority,
    severity,
    review_status: reviewStatus,
    approved_for: reviewStatus === "approved" ? ["internal_use"] : undefined,
    feeds_learning_registry: reviewStatus === "approved",
    created_at: isoDate(randInt(1, 5)),
    updated_at: isoDate(1),
  };
}

export const INTELLIGENCE_CARDS: IntelligenceCard[] = [
  // Bookster — device cohort (primary)
  makeCard(1, "run_0001", "ws_bookster", "device", "performance_insight", "tier_change", "campaign", "C4E Android campaign: T1 confirmed — scale", "C4E Android delivered $258.34 CPT vs $575.86 pre-restructure. 3 weeks of consistent data. High confidence.", "Scale C4E Android campaign by 40%. Maintain iOS-separate campaign structure until CAPI resolved.", "high", "Critical", "Critical", "reviewed"),
  makeCard(2, "run_0001", "ws_bookster", "device", "tracking_alert", "tracking_gap", "account", "iOS tracking gap: CAPI/Pixel mismatch detected", "Pixel and CAPI event counts diverge by ~35% on iOS. iOS conversion data is unreliable for optimization.", "Do not scale iOS-targeted budget until CAPI gap is resolved. Escalate to dev team.", "high", "Critical", "Critical", "needs_review"),
  makeCard(3, "run_0001", "ws_bookster", "creative_angle", "creative_signal", "hook_winner", "ad", "HK_Authority + TN_Aspirational: winning hook stack", "Hook stack generated 88 hook score and drove majority of checkout-depth events. 3 ad variants confirmed.", "Prioritize HK_Authority + TN_Aspirational in next sprint brief. Test 2 new variants with same stack.", "high", "High", "High", "approved"),
  makeCard(4, "run_0001", "ws_bookster", "creative_angle", "fatigue_alert", "creative_fatigue", "ad", "C4E fatigue window approaching — 3–5 weeks", "Hook score declining from 92 to 81 over last 3 weeks. Fatigue trajectory consistent with past cycles.", "Brief replacement angle immediately. BYOC upload-flow is the top candidate (88 hook score).", "medium", "High", "High", "needs_review"),
  makeCard(5, "run_0001", "ws_bookster", "age_gender", "audience_signal", "audience_mismatch", "campaign", "Female 45–54: high reg rate, weak checkout conversion", "C2B drives strong registrations in F45-54 but checkout follows for <30% of registrants.", "Add quiz-gate before paywall for this segment. Test checkout-depth creative variants.", "medium", "Medium", "Medium", "needs_review"),
  makeCard(6, "run_0001", "ws_bookster", "creative_angle", "opportunity", "scale_candidate", "ad", "BYOC upload-flow: T1/T2 candidate — validate", "BYOC showing $282.40 CPT with improving trend. 88 hook score. Insufficient spend for high confidence.", "Allocate dedicated $5,000 validation budget to BYOC angle. Measure over 14 days.", "validation_required", "Medium", "Medium", "needs_review"),

  // SKOV — creative angle cohort (primary)
  makeCard(7, "run_0002", "ws_skov", "creative_angle", "performance_insight", "tier_change", "campaign", "World Cup K9 creative: T1 confirmed at 3.2x ROAS", "World Cup creative delivered 3.2x ROAS on $18,400 spend. Consistent across 14 days. High confidence.", "Scale World Cup creative — T1 confirmed. Monitor for event fatigue post-tournament.", "high", "Critical", "High", "approved"),
  makeCard(8, "run_0002", "ws_skov", "creative_angle", "opportunity", "scale_candidate", "campaign", "Bundle offer: untested opportunity with strong overlap signal", "Slow feeder bowl buyers show 67% overlap with supplement purchasers. Bundle not yet tested.", "Brief and launch bundle offer creative. Set $3,000 validation budget against slow feeder audience.", "medium", "Medium", "Medium", "needs_review"),

  // IMCO — language cohort (primary)
  makeCard(9, "run_0003", "ws_imco", "language", "performance_insight", "roas_recovery", "campaign", "EN/ES retargeting at $18.40 CPL — T1 confirmed", "EN/ES bilingual retargeting campaign delivering $18.40 CPL vs. $29–31 in cold TOF. T1 confirmed.", "Increase retargeting budget allocation by 30%. Maintain bilingual creative structure.", "high", "Critical", "High", "reviewed"),
  makeCard(10, "run_0003", "ws_imco", "language", "creative_signal", "hook_winner", "ad", "ES Story format with WhatsApp CTA: untested opportunity", "EN/ES parity holds in feed. ES Story with WhatsApp CTA not yet tested — ES initiation slightly lower.", "Test ES Story format with WhatsApp CTA in first 3 seconds. $2,000 validation budget.", "validation_required", "Medium", "Medium", "needs_review"),

  // KOV — creative angle cohort (primary)
  makeCard(11, "run_0004", "ws_kov", "creative_angle", "performance_insight", "retire_candidate", "ad", "Camozzi creative: T4 — eliminate immediately", "Camozzi promo: 0.94x ROAS, $74.80 CPA vs $38.60 account average. 3 consecutive weeks of failure.", "Pause all Camozzi variants immediately. Reallocate budget to cart recovery.", "medium", "Critical", "Critical", "needs_review"),
  makeCard(12, "run_0004", "ws_kov", "creative_angle", "performance_insight", "scale_candidate", "campaign", "Cart recovery: T1 at 2.38x ROAS — scale", "Cart recovery campaign: 2.38x ROAS, $29.80 CPA, high confidence. Best lever in account.", "Increase cart recovery budget by 40%. Expand retargeting window to 14-day cart abandonment.", "high", "Critical", "High", "approved"),
  makeCard(13, "run_0004", "ws_kov", "funnel_stage", "budget_signal", "cpa_spike", "account", "CRO gaps blocking checkout — estimated 15–25% loss", "Hero copy, cart progress bar, exit-intent missing. CRO analysis suggests 15–25% checkout improvement potential.", "Brief Shopify CRO: hero copy rewrite, cart progress bar, exit-intent popup. Priority over creative.", "medium", "High", "High", "needs_review"),
];

// ─── BSIL Suggestions (budget objects only — campaign/ad_set) ─────────

export const BSIL_SUGGESTIONS: BSILSuggestion[] = [
  {
    id: "bsil_0001", run_id: "run_0001", workspace_id: "ws_bookster", cohort_key: "device",
    budget_scope_object: "campaign", entity_id: "cmp_0015", entity_name: "BKSTR | C4E Control | Trial Gen | Android | TOF",
    suggestion_type: "increase_budget", rationale: "C4E Android T1 confirmed. $258.34 CPT well below $300 threshold. Scale opportunity with high confidence.", confidence_grade: "high",
    status: "pending", suggested_delta_usd: 4500, suggested_delta_pct: 40,
    review_status: "needs_review", created_at: isoDate(2), updated_at: isoDate(2),
  },
  {
    id: "bsil_0002", run_id: "run_0001", workspace_id: "ws_bookster", cohort_key: "device",
    budget_scope_object: "campaign", entity_id: "cmp_0019", entity_name: "BKSTR | C3 | Behavior Shift | Broad | iOS",
    suggestion_type: "decrease_budget", rationale: "iOS tracking gap makes optimization unreliable. Reallocate to Android until CAPI resolved.", confidence_grade: "high",
    status: "approved", suggested_delta_usd: -3200, suggested_delta_pct: -35,
    review_status: "approved", created_at: isoDate(2), updated_at: isoDate(1),
  },
  {
    id: "bsil_0003", run_id: "run_0001", workspace_id: "ws_bookster", cohort_key: "creative_angle",
    budget_scope_object: "ad_set", entity_id: "as_0006", entity_name: "C2E READ LESS KEEP MORE | TOF | Broad",
    suggestion_type: "reallocate_budget", rationale: "C2E showing $441.80 CPT — 71% above threshold. Reallocate to C4E Android ad set.", confidence_grade: "medium",
    status: "pending", suggested_delta_usd: -1800, suggested_delta_pct: -25,
    review_status: "needs_review", created_at: isoDate(2), updated_at: isoDate(2),
  },
  {
    id: "bsil_0004", run_id: "run_0004", workspace_id: "ws_kov", cohort_key: "creative_angle",
    budget_scope_object: "campaign", entity_id: "cmp_0014", entity_name: "KOV | Camozzi Promo | Dead Creative Test",
    suggestion_type: "pause_campaign", rationale: "T4 confirmed. 0.94x ROAS, $74.80 CPA. 3 weeks of consistent underperformance.", confidence_grade: "medium",
    status: "executed_manually", suggested_delta_usd: -3900, suggested_delta_pct: -100,
    review_status: "approved", created_at: isoDate(4), updated_at: isoDate(3),
  },
  {
    id: "bsil_0005", run_id: "run_0004", workspace_id: "ws_kov", cohort_key: "creative_angle",
    budget_scope_object: "campaign", entity_id: "cmp_0012", entity_name: "KOV | Cart Recovery | Retarget | MOF",
    suggestion_type: "scale_ad_set", rationale: "Cart recovery T1 at 2.38x ROAS. Highest-efficiency lever in account.", confidence_grade: "high",
    status: "pending", suggested_delta_usd: 2400, suggested_delta_pct: 40,
    review_status: "needs_review", created_at: isoDate(4), updated_at: isoDate(4),
  },
  {
    id: "bsil_0006", run_id: "run_0002", workspace_id: "ws_skov", cohort_key: "creative_angle",
    budget_scope_object: "campaign", entity_id: "cmp_0001", entity_name: "SKOV | World Cup | K9 Performance | TOF",
    suggestion_type: "increase_budget", rationale: "World Cup T1 at 3.2x ROAS. Strong headroom before fatigue threshold.", confidence_grade: "high",
    status: "pending", suggested_delta_usd: 3200, suggested_delta_pct: 20,
    review_status: "needs_review", created_at: isoDate(3), updated_at: isoDate(3),
  },
];

// ─── Review Events ────────────────────────────────────────────────────

export const REVIEW_EVENTS: ReviewEvent[] = [
  { id: "rev_0001", workspace_id: "ws_bookster", entity_type: "intelligence_card", entity_id: "ic_0001", reviewer_id: "usr_0003", review_status: "reviewed", notes: "C4E Android scaling confirmed. Proceeding to approval.", created_at: isoDate(2) },
  { id: "rev_0002", workspace_id: "ws_bookster", entity_type: "intelligence_card", entity_id: "ic_0003", reviewer_id: "usr_0003", review_status: "approved", notes: "Hook stack confirmed by multiple ad variants. Approve for learning registry.", created_at: isoDate(1) },
  { id: "rev_0003", workspace_id: "ws_kov", entity_type: "intelligence_card", entity_id: "ic_0012", reviewer_id: "usr_0007", review_status: "approved", notes: "Cart recovery scale approved. Budget increase confirmed.", created_at: isoDate(3) },
  { id: "rev_0004", workspace_id: "ws_bookster", entity_type: "bsil_suggestion", entity_id: "bsil_0002", reviewer_id: "usr_0001", review_status: "approved", notes: "iOS budget reduction approved. CAPI fix must be in place before reverting.", created_at: isoDate(1) },
  { id: "rev_0005", workspace_id: "ws_kov", entity_type: "bsil_suggestion", entity_id: "bsil_0004", reviewer_id: "usr_0001", review_status: "approved", notes: "Camozzi pause approved. Budget reallocated to cart recovery.", created_at: isoDate(3) },
  { id: "rev_0006", workspace_id: "ws_bookster", entity_type: "creative_brief", entity_id: "brief_0001", reviewer_id: "usr_0003", review_status: "reviewed", notes: "Brief reviewed. Awaiting creative team sign-off.", created_at: isoDate(4) },
  { id: "rev_0007", workspace_id: "ws_skov", entity_type: "report", entity_id: "rpt_0003", reviewer_id: "usr_0001", review_status: "approved", notes: "SKOV report approved for client delivery.", created_at: isoDate(3) },
];

// ─── Approval Events ──────────────────────────────────────────────────

export const APPROVAL_EVENTS: ApprovalEvent[] = [
  { id: "apv_0001", workspace_id: "ws_bookster", entity_type: "intelligence_card", entity_id: "ic_0003", approver_id: "usr_0001", approved_for: "learning_registry", feeds_learning_registry: true, notes: "HK_Authority + TN_Aspirational confirmed winning stack. Feed to optimization loop.", created_at: isoDate(1) },
  { id: "apv_0002", workspace_id: "ws_kov", entity_type: "intelligence_card", entity_id: "ic_0012", approver_id: "usr_0001", approved_for: "internal_use", feeds_learning_registry: false, notes: "Cart recovery scale confirmed for internal execution.", created_at: isoDate(3) },
  { id: "apv_0003", workspace_id: "ws_kov", entity_type: "bsil_suggestion", entity_id: "bsil_0004", approver_id: "usr_0001", approved_for: "internal_use", feeds_learning_registry: true, notes: "Camozzi T4 failure pattern registered in learning registry.", created_at: isoDate(3) },
  { id: "apv_0004", workspace_id: "ws_bookster", entity_type: "bsil_suggestion", entity_id: "bsil_0002", approver_id: "usr_0001", approved_for: "internal_use", feeds_learning_registry: false, notes: "iOS budget reduction — operational action only, no learning signal.", created_at: isoDate(1) },
  { id: "apv_0005", workspace_id: "ws_skov", entity_type: "intelligence_card", entity_id: "ic_0007", approver_id: "usr_0001", approved_for: "learning_registry", feeds_learning_registry: true, notes: "World Cup K9 T1 creative pattern — approve for loop. Seasonal dependency noted.", created_at: isoDate(3) },
];

// ─── Human Edits ──────────────────────────────────────────────────────

export const HUMAN_EDITS: HumanEdit[] = [
  { id: "he_0001", workspace_id: "ws_bookster", entity_type: "intelligence_card", entity_id: "ic_0003", editor_id: "usr_0003", field_name: "recommendation", old_value: "Prioritize HK_Authority in next sprint.", new_value: "Prioritize HK_Authority + TN_Aspirational in next sprint brief. Test 2 new variants with same stack.", edit_reason: "Made more specific based on production team feedback.", created_at: isoDate(2) },
  { id: "he_0002", workspace_id: "ws_kov", entity_type: "bsil_suggestion", entity_id: "bsil_0004", editor_id: "usr_0007", field_name: "rationale", old_value: "T4 confirmed underperformer.", new_value: "T4 confirmed. 0.94x ROAS, $74.80 CPA. 3 weeks of consistent underperformance.", edit_reason: "Added specific metrics for approval record.", created_at: isoDate(4) },
];

// ─── Creative Alignment Checks ────────────────────────────────────────

export const CREATIVE_ALIGNMENT_CHECKS: CreativeAlignmentCheck[] = CREATIVE_CONCEPTS.slice(0, 20).map((cc, i) => {
  const resolutionPath: ResolutionPath = i % 7 === 6 ? "unresolved" : i % 3 === 0 ? "naming_convention" : "ad_id_fallback";
  const alignmentScore = resolutionPath === "unresolved" ? undefined : randInt(45, 97);
  const thresholdStatus: ThresholdStatus | undefined = alignmentScore !== undefined ? (alignmentScore >= 70 ? "pass" : "flagged") : undefined;
  return {
    id: id("cac", i + 1),
    creative_concept_id: cc.id,
    workspace_id: cc.workspace_id,
    resolution_path: resolutionPath,
    alignment_score: alignmentScore,
    threshold_status: thresholdStatus,
    check_stage: (i % 2 === 0 ? "pre_publish" : "post_hoc") as CheckStage,
    user_bypassed: thresholdStatus === "flagged" && i % 5 === 0,
    bypass_reason: thresholdStatus === "flagged" && i % 5 === 0 ? "Creative team approved manually — timeline constraint." : undefined,
    checked_at: isoDate(randInt(1, 14)),
  };
});

// ─── Alert Rules ──────────────────────────────────────────────────────

export const ALERT_RULES: AlertRule[] = [
  { id: "ar_0001", workspace_id: "ws_bookster", cohort_key: "device", condition: "cpa_above_threshold", threshold_value: 350, severity: "High", is_active: true, created_by: "usr_0001", created_at: isoDate(30) },
  { id: "ar_0002", workspace_id: "ws_bookster", condition: "tracking_gap_detected", threshold_value: 0.2, severity: "Critical", is_active: true, created_by: "usr_0001", created_at: isoDate(30) },
  { id: "ar_0003", workspace_id: "ws_skov", cohort_key: "creative_angle", condition: "roas_below_threshold", threshold_value: 2.5, severity: "High", is_active: true, created_by: "usr_0001", created_at: isoDate(30) },
  { id: "ar_0004", workspace_id: "ws_kov", condition: "roas_below_threshold", threshold_value: 1.5, severity: "Critical", is_active: true, created_by: "usr_0001", created_at: isoDate(30) },
  { id: "ar_0005", workspace_id: "ws_kov", cohort_key: "creative_angle", condition: "fatigue_score_critical", threshold_value: 40, severity: "High", is_active: true, created_by: "usr_0008", created_at: isoDate(20) },
  { id: "ar_0006", workspace_id: "ws_imco", cohort_key: "language", condition: "cpa_above_threshold", threshold_value: 40, severity: "Medium", is_active: true, created_by: "usr_0003", created_at: isoDate(25) },
];

// ─── Learning Registry ────────────────────────────────────────────────

export const LEARNING_REGISTRY: LearningRegistryEntry[] = [
  {
    id: "lr_0001", workspace_id: "ws_bookster", cohort_key: "creative_angle",
    entity_type: "intelligence_card", entity_id: "ic_0003", entity_title: "HK_Authority + TN_Aspirational: winning hook stack",
    approved_for: "learning_registry", approval_event_id: "apv_0001",
    signal_summary: "HK_Authority + TN_Aspirational hook stack confirmed T1 across 3 ad variants in Bookster. 88+ hook score. Drives checkout-depth events. Android-dominant.",
    confidence_grade: "high", feeds_optimization_loop: true, recorded_at: isoDate(1), is_superseded: false,
  },
  {
    id: "lr_0002", workspace_id: "ws_kov", cohort_key: "creative_angle",
    entity_type: "bsil_suggestion", entity_id: "bsil_0004", entity_title: "Camozzi T4 failure pattern",
    approved_for: "learning_registry", approval_event_id: "apv_0003",
    signal_summary: "Camozzi promo creative: consistent T4 pattern across 3 weeks. 0.94x ROAS, $74.80 CPA. Fighter-UGC angle does not work for KOV audience — deadpan delivery required.",
    confidence_grade: "medium", feeds_optimization_loop: true, recorded_at: isoDate(3), is_superseded: false,
  },
  {
    id: "lr_0003", workspace_id: "ws_skov", cohort_key: "creative_angle",
    entity_type: "intelligence_card", entity_id: "ic_0007", entity_title: "World Cup K9 T1 creative pattern",
    approved_for: "learning_registry", approval_event_id: "apv_0005",
    signal_summary: "World Cup / sports-event tie-in creative for SKOV Pet: T1 at 3.2x ROAS. K9 athlete performance angle + HK_Curiosity hook. Note: seasonal dependency — not reusable year-round.",
    confidence_grade: "high", feeds_optimization_loop: true, recorded_at: isoDate(3), is_superseded: false,
  },
  {
    id: "lr_0004", workspace_id: "ws_bookster", cohort_key: "device",
    entity_type: "intelligence_card", entity_id: "ic_0001", entity_title: "C4E Android: T1 confirmed post-restructure",
    approved_for: "learning_registry", approval_event_id: "apv_0001",
    signal_summary: "Registration flow restructure (moved pre-paywall) drove $575→$258 CPT improvement. Android is the primary beneficiary. iOS remains impaired by CAPI gap — do not conflate Android gains with iOS performance.",
    confidence_grade: "high", feeds_optimization_loop: true, recorded_at: isoDate(5), is_superseded: false,
  },
];
