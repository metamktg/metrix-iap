// ─── Metrix in-app generation engine ──────────────────────────────────
// Generates Strategy (message pillars + testing hypotheses) from an
// account's real analysis rows, and Draft Briefs from the account's
// stored strategy pillars, using Claude via the Replit AI integration.
//
// Honesty rules (mirror the report-pull pattern):
//   - A generation_runs row is inserted as 'running' and flips to
//     'success' only after every output row has committed.
//   - On any failure, partial output rows for that run are deleted and
//     the run is marked 'error' — no dishonest success states.
//   - Generated rows carry source='generated' + generation_run_id;
//     importer-owned rows (source='imported') are NEVER touched.
//   - Model output is zod-validated; cell/ICP references are checked
//     against the real evidence ids (hallucinated refs are dropped);
//     one repair retry with the validation errors fed back, then the
//     run fails honestly.

import { anthropic } from "@workspace/integrations-anthropic-ai";
import { z } from "zod";
import { getSupabase } from "./supabase";
import { invalidateMetrixSeedCache } from "./metrixSeedAssembly";
import { logger } from "./logger";

export const GENERATION_MODEL = "claude-sonnet-4-6";
/** Runs stuck 'running' past this cutoff are treated as dead (server restart). */
export const STALE_RUN_MS = 10 * 60 * 1000;

type Row = Record<string, any>;

export type GenerationKind = "strategy" | "briefs";

export class GenerationError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "GenerationError";
  }
}

// ─── model output schemas ─────────────────────────────────────────────

const GeneratedPillar = z.object({
  pillar_name: z.string().min(1),
  strategic_purpose: z.string().min(1),
  performance_evidence: z.string().min(1),
  messaging_framework: z.string().min(1),
  target_icps: z.array(z.string()).default([]),
  source_cells: z.array(z.string()).default([]),
  funnel_application: z.string().optional(),
  execution_specifications: z.string().optional(),
  placement_strategy: z.string().optional(),
  scaling_guidance: z.string().optional(),
});

const GeneratedHypothesis = z.object({
  statement: z.string().min(1),
  control_ref: z.string().default(""),
  /** 1-based index into the pillars array identifying the pillar this
   * hypothesis tests. Omitted/out-of-range → left unlinked (never guessed). */
  pillar_index: z.number().int().optional(),
  test_variant: z.string().optional(),
  isolated_variable: z.string().optional(),
  success_criteria: z.string().optional(),
  risk: z.string().optional(),
  expected_impact: z.string().optional(),
  priority: z.string().default("medium"),
});

const GeneratedStrategy = z.object({
  pillars: z.array(GeneratedPillar).min(2).max(6),
  hypotheses: z.array(GeneratedHypothesis).min(2).max(8),
});

const GeneratedBrief = z.object({
  asset_type: z.string().min(1),
  priority: z.string().default("high"),
  // Matrix-mode is the standard IAP output; general-mode is the fallback
  // used only when the account has no ICP columns to build a matrix from.
  mode: z.string().default("matrix"),
  voice: z.string().optional(),
  confidence: z.string().optional(),
  // ── strategic foundation ──
  message_pillar: z.string().min(1),
  data_insight: z.string().min(1),
  /** Singular ICP profile id this concept column targets (validated; a
   * hallucinated id is blanked, never fabricated into a link). */
  target_icp: z.string().optional(),
  /** Client-specific concept code for the column (e.g. CN_ICP_*). */
  concept_code: z.string().optional(),
  angle_stack: z.string().min(1),
  performance_benchmark: z.string().optional(),
  // ── testing framework (matrix layer) ──
  /** Cell code leading with the column+row, e.g. "C1A — gift-moment story". */
  matrix_position: z.string().optional(),
  /** The ONE variable this cell isolates within its row. */
  isolated_variable: z.string().optional(),
  hypothesis: z.string().optional(),
  control_reference: z.string().optional(),
  success_criteria: z.string().optional(),
  learning_objective: z.string().optional(),
  // ── creative specifications ──
  format: z.string().optional(),
  dimensions: z.string().optional(),
  placement: z.string().optional(),
  production_requirements: z.string().optional(),
  // ── copy architecture ──
  hook: z.string().optional(),
  problem_or_value_setup: z.string().optional(),
  product_solution: z.string().optional(),
  proof: z.string().optional(),
  cta: z.string().optional(),
});

const GeneratedBriefs = z.object({
  // Up to a full 4×4 (16). Real accounts populate to their true cardinality
  // (e.g. a 3-ICP account produces up to a 3×3 = 9 cells) — never padded.
  briefs: z.array(GeneratedBrief).min(2).max(16),
});

// ─── Supabase helpers ─────────────────────────────────────────────────

async function rowsFor(table: string, accountId: string, build?: (q: any) => any): Promise<Row[]> {
  const supabase = getSupabase();
  let q: any = supabase.from(table).select("*").eq("account_id", accountId);
  if (build) q = build(q);
  const { data, error } = await q;
  if (error) throw new Error(`Supabase query failed for "${table}": ${error.message}`);
  return data ?? [];
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// ─── evidence packs ───────────────────────────────────────────────────

async function accountExists(accountId: string): Promise<Row | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("ad_accounts")
    .select("id, name")
    .eq("id", accountId)
    .limit(1);
  if (error) throw new Error(error.message);
  return data && data.length > 0 ? data[0]! : null;
}

type StrategyEvidence = {
  evidence: Row;
  cellIds: Set<string>;
  icpIds: Set<string>;
};

async function buildStrategyEvidence(accountId: string, accountName: string): Promise<StrategyEvidence> {
  const [cellRows, varRows, demoRows, placementRows, deviceRows, platformRows, placementPerfRows, conceptRows, icpRows, moduleRows] =
    await Promise.all([
      rowsFor("library_cell_performance", accountId),
      rowsFor("variable_performance", accountId),
      rowsFor("demographic_signal", accountId),
      rowsFor("placement_signal", accountId),
      rowsFor("device_performance", accountId),
      rowsFor("platform_performance", accountId),
      rowsFor("placement_performance", accountId),
      rowsFor("concept_performance", accountId),
      rowsFor("icp_profiles", accountId),
      rowsFor("account_modules", accountId, (q) => q.eq("module", "iap_metadata")),
    ]);

  const cells = cellRows
    .map((r) => r["payload"] as Row)
    .sort((a, b) => num(b["Results"]) - num(a["Results"]))
    .slice(0, 30);
  const variables = varRows
    .map((r) => r["payload"] as Row)
    .sort((a, b) => num(b["Results"]) - num(a["Results"]))
    .slice(0, 60);
  const hasSignals =
    demoRows.length + placementRows.length + deviceRows.length + platformRows.length + placementPerfRows.length > 0;

  if (cells.length === 0 && variables.length === 0 && !hasSignals) {
    throw new GenerationError(
      "This account has no analysis data yet — run or import an analysis before building strategy.",
      422,
    );
  }

  const conversionRows = (rows: Row[], key: string) =>
    rows
      .filter((r) => r["tracking_basis"] === "conversion")
      .map((r) => ({
        [key]: r[key],
        link_clicks: r["link_clicks"] === null ? null : num(r["link_clicks"]),
        adds_to_cart: r["adds_to_cart"] === null ? null : num(r["adds_to_cart"]),
        checkouts_initiated: r["checkouts_initiated"] === null ? null : num(r["checkouts_initiated"]),
        purchases: r["purchases"] === null ? null : num(r["purchases"]),
      }))
      .slice(0, 20);

  const icps = icpRows.map((r) => r["payload"] as Row).slice(0, 8);
  const metadata = moduleRows[0]?.["payload"] ?? null;

  const evidence: Row = {
    account: { id: accountId, name: accountName },
    top_cells: cells,
    variable_performance: variables,
    demographic_signal: demoRows.map((r) => r["payload"]).slice(0, 25),
    placement_signal: placementRows.map((r) => r["payload"]).slice(0, 25),
    conversion_tracking: {
      note: "Conversion-attributed funnel counts; spend/impressions are not attributable on these rows.",
      devices: conversionRows(deviceRows, "device"),
      platforms: conversionRows(platformRows, "platform"),
      placements: conversionRows(placementPerfRows, "placement"),
    },
    concept_rollup: conceptRows
      .map((r) => ({
        book: r["book"],
        concept: r["concept"],
        spend: r["spend"] === null ? null : num(r["spend"]),
        results: r["results"] === null ? null : num(r["results"]),
        cpa: r["cpa"] === null ? null : num(r["cpa"]),
        cvr_link_pct: r["cvr_link_pct"] === null ? null : num(r["cvr_link_pct"]),
        confidence: r["confidence"],
      }))
      .slice(0, 25),
    icp_profiles: icps,
    account_metadata: metadata,
  };

  return {
    evidence,
    cellIds: new Set(cells.map((c) => String(c["cell_id"] ?? "")).filter(Boolean)),
    icpIds: new Set(icps.map((p) => String(p["profile_id"] ?? "")).filter(Boolean)),
  };
}

/** The pillar set briefs are built from: generated set if present, else imported. */
async function storedPillars(accountId: string): Promise<Row[]> {
  const all = await rowsFor("message_pillars", accountId);
  const generated = all.filter((r) => r["source"] === "generated");
  return generated.length > 0 ? generated : all;
}

// ─── model call + JSON extraction ─────────────────────────────────────

function extractJson(text: string): unknown {
  const stripped = text.replace(/```(?:json)?/g, "").trim();
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model response contained no JSON object.");
  }
  return JSON.parse(stripped.slice(start, end + 1));
}

async function callModel(prompt: string): Promise<string> {
  const message = await anthropic.messages.create({
    model: GENERATION_MODEL,
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });
  const block = message.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("Model returned no text content.");
  return block.text;
}

async function generateValidated<T>(prompt: string, schema: z.ZodType<T>): Promise<T> {
  const first = await callModel(prompt);
  try {
    return schema.parse(extractJson(first));
  } catch (err) {
    const problem = err instanceof Error ? err.message : String(err);
    const repairPrompt =
      `${prompt}\n\nYour previous response failed validation. Errors:\n${problem}\n\n` +
      `Previous response:\n${first.slice(0, 6000)}\n\n` +
      `Return ONLY the corrected raw JSON object — no prose, no markdown fences.`;
    const second = await callModel(repairPrompt);
    return schema.parse(extractJson(second));
  }
}

// ─── prompts ──────────────────────────────────────────────────────────

// The canonical global variable taxonomy shared by every MST-layer prompt.
// Kept as one source of truth so strategy pillars and brief angle_stacks use
// the SAME prefixes (this mirrors the frontend variable-registry taxonomy).
const IAP_VARIABLE_TAXONOMY = [
  "IAP GLOBAL VARIABLE TAXONOMY (use these prefixes; combine several with ' + '):",
  "- CN_ Concept/format angle: e.g. CN_Testimonial, CN_FounderStory, CN_ProductDemo, CN_Comparison, CN_ValueStack, CN_Lifestyle, CN_PainFirst, CN_SocialProof, CN_UGC.",
  "- FW_ Copy framework: FW_PAS, FW_AIDA, FW_FAB, FW_BAB, FW_StoryBrand, FW_Direct.",
  "- TN_ Tonality: TN_Emotional, TN_Rational, TN_Relatable, TN_Playful, TN_Assertive, TN_Aspirational, TN_Warm, TN_Urgent.",
  "- ST_ Funnel stage: ST_TOFU, ST_MOFU, ST_BOFU.",
  "- AW_ Awareness: AW_Unaware, AW_ProblemAware, AW_SolutionAware, AW_MostAware.",
  "- HP_ Pain/hurdle: HP_Time, HP_Money, HP_Confidence, HP_Overwhelm (or a short plain pain phrase).",
  "- PR_ Proof: PR_Testimonial, PR_Expert, PR_DataDriven, PR_SocialProof, PR_VisualDemo, PR_UGC.",
  "- HK_ Hook: HK_Problem, HK_Benefit, HK_Curiosity, HK_Shock, HK_Story, HK_SocialProof.",
  "Client-specific concept codes (CN_ICP_*, CN_Design_*, CN_CTA_*) may be layered when the account library defines them.",
].join("\n");

// The IAP Matrix construction rules the brief layer must obey.
const IAP_MATRIX_METHODOLOGY = [
  "IAP MATRIX METHODOLOGY (Metrix Sprint Test — the scientific testing layer):",
  "- The matrix is a Concept × Angle grid. COLUMNS = concepts, exactly ONE per real ICP/avatar (never a messaging theme). ROWS = angles.",
  "- Golden rule of variable isolation: a variable's effect is only readable when it appears in MULTIPLE cells combined with DIFFERENT other variables. Distribute every key variable across 2+ cells; never let a decisive variable appear only once.",
  "- Column consistency: all cells in a column share that concept's fixed variables (its ICP, design system, CTA family).",
  "- Row consistency: all cells in a row share EXACTLY ONE angle variable (e.g. one shared tonality OR one shared framework) — everything else varies. Do NOT make a whole row identical.",
  "- Diagonals (only when the grid is square and at least 3×3): the top-left→bottom-right diagonal shares exactly ONE strategic variable; the bottom-left→top-right diagonal shares exactly ONE different counterbalance variable.",
  "- Cell codes: columns are C1..Cn in the exact order the COLUMNS list is given; rows are A, B, C…; a cell code is <Column><Row> (e.g. C1A, C2B).",
  "- HONESTY: build the grid at the account's REAL cardinality using ONLY the ICP columns provided. Never invent an extra avatar/column or a baseless row just to reach 4×4. Fewer, well-isolated cells beat a padded grid.",
  "- Andromeda execution context: assume BROAD targeting, ABO budgeting, and Advantage+ auto-placements. Prefer distinct concepts over near-duplicates and behavioral/psychographic angles over demographic micro-targeting. CTR / thumbstop are the earliest signals; CPA needs volume before a verdict.",
].join("\n");

function strategyPrompt(evidence: Row, cellIds: Set<string>, icpIds: Set<string>): string {
  return [
    "You are the METRIX strategy engine. From the ad-account analysis evidence below, produce message pillars and testing hypotheses for the next IAP creative cycle (Metrix Sprint Test).",
    "",
    IAP_VARIABLE_TAXONOMY,
    "",
    IAP_MATRIX_METHODOLOGY,
    "",
    "STRICT RULES:",
    "- Ground every claim in the evidence. Quote real numbers (results, CPA, CVR, funnel counts) in performance_evidence. NEVER invent metrics.",
    `- source_cells: only ids from this list (or empty): ${JSON.stringify([...cellIds])}`,
    `- target_icps: only profile ids from this list (or empty): ${JSON.stringify([...icpIds])}. Each pillar should map to the ICP(s) whose concept column will carry it.`,
    "- messaging_framework: combine taxonomy variable ids (see above) that appear in variable_performance, joined with ' + ' (e.g. \"HK_Benefit + FW_BAB\"). If variable-level evidence is absent, still use the taxonomy prefixes to name the intended combination.",
    "- Each hypothesis isolates EXACTLY ONE variable, names its control (control_ref may reference a cell id or pillar name), and has a measurable success_criteria. In isolated_variable, name the single taxonomy variable under test AND state how it will be distributed across the matrix (which cells hold it constant vs vary it) so its effect is readable.",
    "- pillar_index: the 1-based position of the pillar (in the pillars array above) that this hypothesis tests. Set it only when the hypothesis clearly extends ONE pillar; omit it when it doesn't map cleanly to a single pillar (do NOT guess).",
    "- placement_strategy / scaling_guidance: reflect the Andromeda execution context (broad targeting, ABO, Advantage+ placements) rather than narrow demographic targeting.",
    "- priority: one of high | medium | low.",
    "- Be honest about weak evidence: mark low-confidence recommendations as such inside the text.",
    "",
    "Return ONLY a raw JSON object (no markdown fences, no prose) with this exact shape:",
    JSON.stringify(
      {
        pillars: [
          {
            pillar_name: "string",
            strategic_purpose: "string",
            performance_evidence: "string citing real numbers",
            messaging_framework: "VAR_A + VAR_B",
            target_icps: ["profile_id"],
            source_cells: ["cell_id"],
            funnel_application: "optional string",
            execution_specifications: "optional string",
            placement_strategy: "optional string",
            scaling_guidance: "optional string",
          },
        ],
        hypotheses: [
          {
            statement: "string",
            control_ref: "string",
            pillar_index: 1,
            test_variant: "string",
            isolated_variable: "string",
            success_criteria: "string",
            risk: "string",
            expected_impact: "string",
            priority: "high | medium | low",
          },
        ],
      },
      null,
      2,
    ),
    "",
    "Produce 2-4 pillars and 3-6 hypotheses.",
    "",
    "EVIDENCE:",
    JSON.stringify(evidence),
  ].join("\n");
}

/** A concept column for the matrix: one per real ICP, in stable order. */
type BriefColumn = { column_id: string; profile_id: string; profile_name: string };

function briefsPrompt(pillars: Row[], evidence: Row, columns: BriefColumn[]): string {
  const pillarSummaries = pillars.map((row) => {
    const p = (row["payload"] ?? {}) as Row;
    return {
      pillar_id: row["pillar_id"],
      pillar_name: p["pillar_name"] ?? row["pillar_name"],
      strategic_purpose: p["strategic_purpose"],
      performance_evidence: p["performance_evidence"],
      messaging_framework: p["messaging_framework"],
      target_icps: p["target_icps"],
    };
  });
  const hasMatrix = columns.length > 0;
  const rowCap = hasMatrix ? Math.min(4, Math.max(2, pillarSummaries.length)) : 0;
  const cellCap = hasMatrix ? columns.length * rowCap : 0;

  const matrixRules = hasMatrix
    ? [
        `- COLUMNS (concepts, in order): ${JSON.stringify(columns)}. Assign each brief to one column via its column_id; set target_icp to that column's profile_id.`,
        `- Build a Concept × Angle matrix: ${columns.length} concept column(s) × up to ${rowCap} angle row(s) = up to ${cellCap} cells. Produce ONE brief per cell you can ground; skip cells with no strategic basis rather than padding.`,
        "- mode: \"matrix\" for every brief. matrix_position MUST lead with the cell code then a short label, e.g. \"C1A — gift-moment story hook\".",
        "- Obey the matrix rules above: each ROW shares exactly ONE angle variable across its columns; distribute each decisive variable across 2+ cells; if the grid is square and ≥3×3, use the two diagonals for the strategic + counterbalance variables.",
        "- isolated_variable: name the ONE taxonomy variable this cell's row holds constant (what the row is testing).",
        "- concept_code: a client concept code for the column (CN_ICP_* / CN_* style) when the evidence implies one; otherwise a short concept name.",
      ]
    : [
        "- No ICP columns are available for this account, so a matrix cannot be built honestly. Set mode: \"general\" and omit matrix_position/target_icp. Produce 3-6 briefs covering the different pillars and asset types.",
      ];

  return [
    "You are the METRIX brief builder. From the stored strategy pillars and supporting analysis evidence below, produce the next set of creative briefs as an IAP Matrix (Metrix Sprint Test).",
    "",
    IAP_VARIABLE_TAXONOMY,
    "",
    IAP_MATRIX_METHODOLOGY,
    "",
    "STRICT RULES:",
    `- message_pillar MUST be one of these pillar ids: ${JSON.stringify(pillarSummaries.map((p) => p.pillar_id))}`,
    "- data_insight must restate the pillar's real performance evidence (real numbers only — never invent metrics).",
    "- angle_stack: taxonomy variable ids joined with ' + ' (e.g. \"CN_Lifestyle + FW_BAB + TN_Emotional + HK_Story\"); use plain-language angles only when no variable fits.",
    "- asset_type: one of static | video | carousel | ugc. priority: one of high | medium | low.",
    ...matrixRules,
    "- copy_architecture: fill hook, problem_or_value_setup, product_solution, proof, cta so a designer can execute the cell without further data access.",
    "- creative_specifications: give format and (when known) dimensions, placement, production_requirements. Reflect broad/Advantage+ placements, not narrow targeting.",
    "- success_criteria must be measurable; learning_objective states what the cell teaches.",
    "",
    "Return ONLY a raw JSON object (no markdown fences, no prose) with this exact shape:",
    JSON.stringify(
      {
        briefs: [
          {
            asset_type: "static | video | carousel | ugc",
            priority: "high | medium | low",
            mode: "matrix | general",
            voice: "optional string",
            confidence: "optional string",
            message_pillar: "pillar_id from the list",
            data_insight: "string citing real numbers",
            target_icp: "profile_id of this column's ICP (matrix mode)",
            concept_code: "CN_* concept code or short concept name",
            angle_stack: "CN_A + FW_B + TN_C + HK_D",
            performance_benchmark: "optional string citing the real baseline to beat",
            matrix_position: "C1A — short label (matrix mode)",
            isolated_variable: "the ONE variable this cell's row isolates",
            hypothesis: "optional hypothesis id or statement",
            control_reference: "optional control cell/pillar",
            success_criteria: "measurable criteria",
            learning_objective: "what this cell teaches",
            format: "e.g. Static · Feed",
            dimensions: "optional e.g. 1080x1350",
            placement: "optional",
            production_requirements: "optional",
            hook: "copy hook",
            problem_or_value_setup: "problem agitation or value setup",
            product_solution: "the product solution",
            proof: "proof element",
            cta: "call to action",
          },
        ],
      },
      null,
      2,
    ),
    "",
    hasMatrix
      ? `Produce up to ${cellCap} briefs — one per grounded matrix cell.`
      : "Produce 3-6 briefs covering different pillars/asset types.",
    "",
    "PILLARS:",
    JSON.stringify(pillarSummaries),
    "",
    "SUPPORTING EVIDENCE:",
    JSON.stringify(evidence),
  ].join("\n");
}

// ─── run bookkeeping ──────────────────────────────────────────────────

export type GenerationRun = {
  id: string;
  account_id: string;
  kind: GenerationKind;
  status: "running" | "success" | "error";
  error_message: string | null;
  model: string | null;
  started_at: string;
  finished_at: string | null;
};

const runShape = (r: Row): GenerationRun => ({
  id: String(r["id"]),
  account_id: String(r["account_id"]),
  kind: r["kind"],
  status: r["status"],
  error_message: r["error_message"] ?? null,
  model: r["model"] ?? null,
  started_at: String(r["started_at"]),
  finished_at: r["finished_at"] ?? null,
});

/** Latest run for an account+kind, with dead 'running' rows honestly flipped to error. */
export async function getLatestGenerationRun(
  accountId: string,
  kind: GenerationKind,
): Promise<GenerationRun | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("generation_runs")
    .select("*")
    .eq("account_id", accountId)
    .eq("kind", kind)
    .order("started_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const row = data?.[0];
  if (!row) return null;
  if (row["status"] === "running" && Date.now() - new Date(row["started_at"]).getTime() > STALE_RUN_MS) {
    const { data: updated, error: updErr } = await supabase
      .from("generation_runs")
      .update({
        status: "error",
        error_message: "The generation run did not finish (server restarted or timed out). Try again.",
        finished_at: new Date().toISOString(),
      })
      .eq("id", row["id"])
      .eq("status", "running")
      .select("*");
    if (updErr) throw new Error(updErr.message);
    // A dead run may have written partial output (e.g. pillars inserted,
    // hypotheses not) before the server restarted. Remove it so the seed
    // never serves a partial generated set alongside an 'error' run.
    await deleteRunOutputs(String(row["id"]), kind);
    return runShape(updated?.[0] ?? { ...row, status: "error" });
  }
  return runShape(row);
}

async function startRun(accountId: string, kind: GenerationKind, createdBy: string): Promise<string> {
  const latest = await getLatestGenerationRun(accountId, kind);
  if (latest && latest.status === "running") {
    throw new GenerationError("A generation run is already in progress for this account.", 409);
  }
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("generation_runs")
    .insert({ account_id: accountId, kind, status: "running", model: GENERATION_MODEL, created_by: createdBy })
    .select("id");
  if (error) {
    // Partial unique index on (account_id, kind) WHERE status='running'
    // closes the read-then-insert race between simultaneous POSTs.
    if (error.code === "23505") {
      throw new GenerationError("A generation run is already in progress for this account.", 409);
    }
    throw new Error(error.message);
  }
  return String(data![0]!["id"]);
}

async function finishRun(runId: string, status: "success" | "error", errorMessage?: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("generation_runs")
    .update({
      status,
      error_message: errorMessage ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);
  if (error) throw new Error(error.message);
}

async function deleteRunOutputs(runId: string, kind: GenerationKind): Promise<void> {
  const supabase = getSupabase();
  const tables = kind === "strategy" ? ["message_pillars", "testing_hypotheses"] : ["imported_creative_briefs"];
  for (const table of tables) {
    const { error } = await supabase.from(table).delete().eq("generation_run_id", runId);
    if (error) throw new Error(error.message);
  }
}

async function deletePriorGenerated(accountId: string, kind: GenerationKind): Promise<void> {
  const supabase = getSupabase();
  const tables = kind === "strategy" ? ["message_pillars", "testing_hypotheses"] : ["imported_creative_briefs"];
  for (const table of tables) {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq("account_id", accountId)
      .eq("source", "generated");
    if (error) throw new Error(error.message);
  }
}

async function upsertLoopStage(accountId: string, stage: string, runId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from("iap_runs").upsert(
    {
      account_id: accountId,
      stage,
      status: "complete",
      generated_at: new Date().toISOString(),
      note: `Generated in-app by the Metrix engine (run ${runId}).`,
    },
    { onConflict: "account_id,stage" },
  );
  if (error) throw new Error(error.message);
}

// ─── generation entry points ──────────────────────────────────────────

/**
 * Validate prerequisites and start a strategy run. Returns the run id
 * immediately; the generation itself continues in the background and the
 * run row records the outcome.
 */
export async function startStrategyGeneration(accountId: string, createdBy: string): Promise<string> {
  const account = await accountExists(accountId);
  if (!account) throw new GenerationError("Ad account not found.", 404);
  const { evidence, cellIds, icpIds } = await buildStrategyEvidence(accountId, String(account["name"] ?? accountId));
  const runId = await startRun(accountId, "strategy", createdBy);

  // Run-scope generated ids so ids from different runs never collide —
  // a brief referencing GEN_PILLAR_<oldrun>_1 can never silently resolve
  // to a pillar from a newer run.
  const runTag = runId.slice(0, 8);

  void (async () => {
    try {
      const output = await generateValidated(strategyPrompt(evidence, cellIds, icpIds), GeneratedStrategy);

      // Drop hallucinated references — never present fabricated links.
      const pillars = output.pillars.map((p, i) => ({
        ...p,
        pillar_id: `GEN_PILLAR_${runTag}_${i + 1}`,
        source_cells: (p.source_cells ?? []).filter((c) => cellIds.has(c)),
        target_icps: (p.target_icps ?? []).filter((icp) => icpIds.has(icp)),
        generated_at: new Date().toISOString(),
        model: GENERATION_MODEL,
      }));

      await deletePriorGenerated(accountId, "strategy");

      const supabase = getSupabase();
      const pillarInsert = await supabase.from("message_pillars").insert(
        pillars.map((p) => ({
          account_id: accountId,
          pillar_id: p.pillar_id,
          pillar_name: p.pillar_name,
          payload: p,
          source: "generated",
          generation_run_id: runId,
        })),
      );
      if (pillarInsert.error) throw new Error(pillarInsert.error.message);

      const hypInsert = await supabase.from("testing_hypotheses").insert(
        output.hypotheses.map((h, i) => {
          // Resolve the explicit pillar link from the model's 1-based index.
          // Out-of-range/absent → null (unlinked), never a guessed link.
          const idx = h.pillar_index;
          const pillarId =
            idx && idx >= 1 && idx <= pillars.length ? pillars[idx - 1]!.pillar_id : null;
          return {
            account_id: accountId,
            hypothesis_id: `GEN_HYP_${runTag}_${i + 1}`,
            statement: h.statement,
            control_ref: h.control_ref,
            pillar_id: pillarId,
            test_variant: h.test_variant ?? null,
            isolated_variable: h.isolated_variable ?? null,
            success_criteria: h.success_criteria ?? null,
            risk: h.risk ?? null,
            expected_impact: h.expected_impact ?? null,
            priority: h.priority,
            source: "generated",
            generation_run_id: runId,
          };
        }),
      );
      if (hypInsert.error) throw new Error(hypInsert.error.message);

      // Generated briefs were built from the pillars this run just
      // replaced — they'd reference pillars that no longer exist. Remove
      // them so the seed falls back to the imported briefs honestly;
      // the user can regenerate briefs from the new strategy.
      await deletePriorGenerated(accountId, "briefs");

      await upsertLoopStage(accountId, "strategy_map", runId);
      await finishRun(runId, "success");
      invalidateMetrixSeedCache();
      logger.info({ accountId, runId }, "Strategy generation succeeded");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ accountId, runId, err }, "Strategy generation failed");
      try {
        await deleteRunOutputs(runId, "strategy");
        await finishRun(runId, "error", message);
      } catch (cleanupErr) {
        logger.error({ accountId, runId, err: cleanupErr }, "Strategy generation cleanup failed");
      }
    }
  })();

  return runId;
}

/**
 * Validate prerequisites and start a briefs run. Briefs are built from the
 * account's stored pillars (generated set preferred, else imported).
 */
export async function startBriefsGeneration(accountId: string, createdBy: string): Promise<string> {
  const account = await accountExists(accountId);
  if (!account) throw new GenerationError("Ad account not found.", 404);
  const pillars = await storedPillars(accountId);
  if (pillars.length === 0) {
    throw new GenerationError(
      "This account has no strategy pillars yet — build strategy from the analysis first.",
      422,
    );
  }
  const { evidence, icpIds } = await buildStrategyEvidence(accountId, String(account["name"] ?? accountId)).catch(() => ({
    evidence: { note: "No analysis evidence available — briefs are grounded in the stored pillars only." } as Row,
    cellIds: new Set<string>(),
    icpIds: new Set<string>(),
  }));
  const runId = await startRun(accountId, "briefs", createdBy);
  const pillarIds = new Set(pillars.map((p) => String(p["pillar_id"])));

  // Concept columns = one per real ICP profile, in a stable order. Column
  // NUMBERING must line up with the account's historical MST grid, because
  // the seed assembly applies the cell codes we generate (C1..Cn) to THAT
  // fixed grid. Postgres row order for icp_profiles is unspecified, so we
  // seed ordering + column ids from the grid's own columns[].{id,icp} and
  // only fall back to a sorted profile list when no grid exists.
  const mstModules = await rowsFor("account_modules", accountId, (q) => q.eq("module", "mst")).catch(
    () => [] as Row[],
  );
  const gridColumns = (() => {
    const grid = (mstModules[0]?.["payload"] as Row | undefined)?.["historical_matrix_4x4"] as
      | Row
      | undefined;
    return grid && Array.isArray(grid["columns"]) ? (grid["columns"] as Row[]) : [];
  })();

  const icpProfiles = Array.isArray(evidence["icp_profiles"]) ? (evidence["icp_profiles"] as Row[]) : [];
  const profileById = new Map(
    icpProfiles
      .map((p) => [String(p["profile_id"] ?? ""), p] as const)
      .filter(([id]) => id.length > 0),
  );
  const nameFor = (id: string) => String(profileById.get(id)?.["profile_name"] ?? id);

  let columns: BriefColumn[];
  if (gridColumns.length > 0) {
    const used = new Set<string>();
    columns = gridColumns
      .map((c) => ({
        column_id: String(c["id"] ?? ""),
        profile_id: String(c["icp"] ?? ""),
        profile_name: String(c["name"] ?? "").replace(/\s+/g, " ").trim() || nameFor(String(c["icp"] ?? "")),
      }))
      .filter((c) => {
        const ok =
          c.column_id.length > 0 && c.profile_id.length > 0 && profileById.has(c.profile_id) && !used.has(c.profile_id);
        if (ok) used.add(c.profile_id);
        return ok;
      });
    // Real ICPs absent from the historical grid still deserve a column, given
    // fresh non-colliding ids (past the grid's max C-number) so they can be
    // tested; they just won't link to a historical grid column, which is honest.
    const maxIdx = columns.reduce((m, c) => {
      const n = Number(c.column_id.match(/^C(\d+)$/)?.[1] ?? 0);
      return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    let next = maxIdx + 1;
    for (const id of [...profileById.keys()].sort()) {
      if (used.has(id)) continue;
      columns.push({ column_id: `C${next++}`, profile_id: id, profile_name: nameFor(id) });
    }
  } else {
    columns = [...profileById.keys()]
      .sort()
      .map((id, i) => ({ column_id: `C${i + 1}`, profile_id: id, profile_name: nameFor(id) }));
  }
  const validProfileIds = new Set(columns.map((c) => c.profile_id));
  // Run-scope generated ids so ids from different runs never collide.
  const runTag = runId.slice(0, 8);

  void (async () => {
    try {
      const output = await generateValidated(briefsPrompt(pillars, evidence, columns), GeneratedBriefs);

      const invalid = output.briefs.filter((b) => !pillarIds.has(b.message_pillar));
      if (invalid.length > 0) {
        throw new Error(
          `Model referenced unknown pillar ids: ${invalid.map((b) => b.message_pillar).join(", ")}`,
        );
      }

      await deletePriorGenerated(accountId, "briefs");

      const supabase = getSupabase();
      const insert = await supabase.from("imported_creative_briefs").insert(
        output.briefs.map((b, i) => {
          const briefId = `GEN_BRIEF_${runTag}_${i + 1}`;
          // Drop a hallucinated ICP rather than fabricate a column↔ICP link;
          // trust only ids that actually exist for this account.
          const targetIcp = b.target_icp && (validProfileIds.has(b.target_icp) || icpIds.has(b.target_icp))
            ? b.target_icp
            : "";
          return {
            account_id: accountId,
            brief_id: briefId,
            mode: b.mode,
            book: null,
            asset_type: b.asset_type,
            priority: b.priority,
            confidence: b.confidence ?? null,
            payload: {
              brief_metadata: {
                brief_id: briefId,
                asset_type: b.asset_type,
                strategic_source: b.message_pillar,
                priority: b.priority,
                mode: b.mode,
                voice: b.voice ?? null,
                confidence: b.confidence ?? null,
                generated_at: new Date().toISOString(),
                model: GENERATION_MODEL,
              },
              strategic_foundation: {
                message_pillar: b.message_pillar,
                data_insight: b.data_insight,
                target_icp: targetIcp,
                concept_code: b.concept_code ?? null,
                angle_stack: b.angle_stack,
                performance_benchmark: b.performance_benchmark ?? null,
              },
              testing_framework: {
                matrix_position: b.matrix_position ?? null,
                isolated_variable: b.isolated_variable ?? null,
                hypothesis: b.hypothesis ?? null,
                control_reference: b.control_reference ?? null,
                success_criteria: b.success_criteria ?? null,
                learning_objective: b.learning_objective ?? null,
              },
              creative_specifications: {
                format: b.format ?? b.asset_type ?? null,
                dimensions: b.dimensions ?? null,
                placement: b.placement ?? null,
                production_requirements: b.production_requirements ?? null,
              },
              copy_architecture: {
                hook: b.hook ?? null,
                problem_agitation_or_value_setup: b.problem_or_value_setup ?? null,
                product_solution: b.product_solution ?? null,
                proof: b.proof ?? null,
                cta: b.cta ?? null,
              },
            },
            source: "generated",
            generation_run_id: runId,
          };
        }),
      );
      if (insert.error) throw new Error(insert.error.message);

      await upsertLoopStage(accountId, "brief_builder", runId);
      await finishRun(runId, "success");
      invalidateMetrixSeedCache();
      logger.info({ accountId, runId }, "Briefs generation succeeded");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ accountId, runId, err }, "Briefs generation failed");
      try {
        await deleteRunOutputs(runId, "briefs");
        await finishRun(runId, "error", message);
      } catch (cleanupErr) {
        logger.error({ accountId, runId, err: cleanupErr }, "Briefs generation cleanup failed");
      }
    }
  })();

  return runId;
}
