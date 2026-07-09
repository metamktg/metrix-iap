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
  mode: z.string().default("general"),
  voice: z.string().optional(),
  confidence: z.string().optional(),
  message_pillar: z.string().min(1),
  data_insight: z.string().min(1),
  angle_stack: z.string().min(1),
  headline_directions: z.array(z.string()).optional(),
  copy_directions: z.array(z.string()).optional(),
  visual_direction: z.string().optional(),
  cta_guidance: z.string().optional(),
  target_icps: z.array(z.string()).optional(),
});

const GeneratedBriefs = z.object({
  briefs: z.array(GeneratedBrief).min(2).max(8),
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

function strategyPrompt(evidence: Row, cellIds: Set<string>, icpIds: Set<string>): string {
  return [
    "You are the METRIX strategy engine. From the ad-account analysis evidence below, produce message pillars and testing hypotheses for the next creative cycle.",
    "",
    "STRICT RULES:",
    "- Ground every claim in the evidence. Quote real numbers (results, CPA, CVR, funnel counts) in performance_evidence. NEVER invent metrics.",
    `- source_cells: only ids from this list (or empty): ${JSON.stringify([...cellIds])}`,
    `- target_icps: only profile ids from this list (or empty): ${JSON.stringify([...icpIds])}`,
    "- messaging_framework: combine variable_id values that appear in variable_performance, joined with ' + ' (e.g. \"HK_Benefit + FW_BAB\"). If variable-level evidence is absent, describe the framework in plain words instead.",
    "- Each hypothesis isolates ONE variable, names its control (control_ref may reference a cell id or pillar name), and has a measurable success_criteria.",
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

function briefsPrompt(pillars: Row[], evidence: Row): string {
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
  return [
    "You are the METRIX brief builder. From the stored strategy pillars and supporting analysis evidence below, produce draft creative briefs.",
    "",
    "STRICT RULES:",
    `- message_pillar MUST be one of these pillar ids: ${JSON.stringify(pillarSummaries.map((p) => p.pillar_id))}`,
    "- data_insight must restate the pillar's real performance evidence (real numbers only — never invent metrics).",
    "- angle_stack: variable ids joined with ' + ' when variable evidence exists, plain-language angles otherwise.",
    "- asset_type: one of static | video | carousel | ugc.",
    "- priority: one of high | medium | low. mode: matrix | general.",
    "- Each brief must be executable by a designer/editor without further data access.",
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
            angle_stack: "VAR_A + VAR_B",
            headline_directions: ["string"],
            copy_directions: ["string"],
            visual_direction: "string",
            cta_guidance: "string",
            target_icps: ["profile_id"],
          },
        ],
      },
      null,
      2,
    ),
    "",
    "Produce 3-6 briefs covering different pillars/asset types.",
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
        output.hypotheses.map((h, i) => ({
          account_id: accountId,
          hypothesis_id: `GEN_HYP_${runTag}_${i + 1}`,
          statement: h.statement,
          control_ref: h.control_ref,
          test_variant: h.test_variant ?? null,
          isolated_variable: h.isolated_variable ?? null,
          success_criteria: h.success_criteria ?? null,
          risk: h.risk ?? null,
          expected_impact: h.expected_impact ?? null,
          priority: h.priority,
          source: "generated",
          generation_run_id: runId,
        })),
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
  const { evidence } = await buildStrategyEvidence(accountId, String(account["name"] ?? accountId)).catch(() => ({
    evidence: { note: "No analysis evidence available — briefs are grounded in the stored pillars only." } as Row,
    cellIds: new Set<string>(),
    icpIds: new Set<string>(),
  }));
  const runId = await startRun(accountId, "briefs", createdBy);
  const pillarIds = new Set(pillars.map((p) => String(p["pillar_id"])));
  // Run-scope generated ids so ids from different runs never collide.
  const runTag = runId.slice(0, 8);

  void (async () => {
    try {
      const output = await generateValidated(briefsPrompt(pillars, evidence), GeneratedBriefs);

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
                angle_stack: b.angle_stack,
                target_icps: b.target_icps ?? [],
              },
              creative_direction: {
                headline_directions: b.headline_directions ?? [],
                copy_directions: b.copy_directions ?? [],
                visual_direction: b.visual_direction ?? null,
                cta_guidance: b.cta_guidance ?? null,
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
