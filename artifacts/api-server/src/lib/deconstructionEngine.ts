// ─── Creative deconstruction engine ───────────────────────────────────
// Classifies manually uploaded creative assets (images) against the IAP
// variable registry using the generation model's vision input, grades each
// detected variable with a confidence score, and files results into the
// account's local library (`library_cells`) when the overall grade clears
// the confidence gate. Below-gate results land in a review queue where the
// user can correct classifications, explicitly bypass the gate (recorded as
// user_overridden), or discard.
//
// Honesty contract: the generation_runs row flips to 'success' only after
// every import has been processed. Replacement is atomic PER IMPORT — a
// prior classification (and its filed library entry) is only removed after
// the new classification has been computed and committed, so a failed or
// stale re-run can never destroy an existing successful result.

import { z } from "zod";
import { getSupabase } from "./supabase";
import { logger } from "./logger";
import { invalidateMetrixSeedCache } from "./metrixSeedAssembly";
import {
  GENERATION_MODEL,
  GenerationError,
  IAP_VARIABLE_TAXONOMY,
  finishRun,
  generateValidated,
  sanitizeGeneratedText,
  startRun,
  type ModelContent,
} from "./generationEngine";

type Row = Record<string, any>;

/** Overall-confidence gate: at or above files automatically, below queues for review. */
export const CONFIDENCE_GATE = 0.8;

export type DeconstructionStatus =
  | "unsupported"
  | "auto_filed"
  | "needs_review"
  | "user_overridden"
  | "discarded";

export type DetectedVariable = {
  family: string;
  code: string;
  confidence: number;
  evidence?: string | null;
  user_edited?: boolean;
};

// ─── registry validation ──────────────────────────────────────────────
// The IAP registry constrains variables to known family prefixes. Codes are
// prefix-validated (e.g. TN_Warm) rather than closed-list-validated because
// the registry itself allows new codes within a family (see
// docs/iap/VARIABLES_REGISTRY.md — families are fixed, codes extend).

export const REGISTRY_FAMILY_PREFIXES: Record<string, string> = {
  concept: "CN",
  framework: "FW",
  tonality: "TN",
  funnel_stage: "ST",
  awareness: "AW",
  pain_point: "HP",
  proof: "PR",
  hook: "HK",
};

const CODE_RE = /^(CN|FW|TN|ST|AW|HP|PR|HK)_[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** True when a code is registry-valid and consistent with its declared family. */
export function isRegistryValidVariable(v: { family: string; code: string }): boolean {
  const prefix = REGISTRY_FAMILY_PREFIXES[v.family];
  if (!prefix) return false;
  if (!CODE_RE.test(v.code)) return false;
  return v.code.startsWith(`${prefix}_`);
}

/**
 * Keep only registry-valid variables, clamp confidences into [0,1], and
 * dedupe by code keeping the highest-confidence occurrence.
 */
export function sanitizeDetectedVariables(vars: DetectedVariable[]): DetectedVariable[] {
  const byCode = new Map<string, DetectedVariable>();
  for (const v of vars) {
    if (!isRegistryValidVariable(v)) continue;
    const confidence = Math.max(0, Math.min(1, Number(v.confidence)));
    if (!Number.isFinite(confidence)) continue;
    const cleaned: DetectedVariable = {
      family: v.family,
      code: v.code,
      confidence,
      evidence: v.evidence ?? null,
      ...(v.user_edited ? { user_edited: true } : {}),
    };
    const prior = byCode.get(v.code);
    if (!prior || prior.confidence < confidence) byCode.set(v.code, cleaned);
  }
  return [...byCode.values()];
}

/** Overall grade = mean of per-variable confidences (deterministic, not model-supplied). */
export function overallConfidence(vars: Array<{ confidence: number }>): number | null {
  if (vars.length === 0) return null;
  const sum = vars.reduce((acc, v) => acc + v.confidence, 0);
  return Math.round((sum / vars.length) * 1000) / 1000;
}

/** Gate decision for a fresh classification. */
export function gateDecision(overall: number | null): "auto_filed" | "needs_review" {
  return overall != null && overall >= CONFIDENCE_GATE ? "auto_filed" : "needs_review";
}

// ─── cell code alignment ──────────────────────────────────────────────

/**
 * Pick the library cell id for a deconstructed creative, aligned to the
 * account's historical grid conventions:
 *   1. the mapped ad row's own `cell` (the grid position the ad ran in);
 *   2. the linked brief's matrix position cell code;
 *   3. a NEW column beyond the historical grid (C<max+1>A) — never a guess
 *      into an existing column, which would corrupt avatar isolation.
 */
export function alignCellId(opts: {
  adCell?: string | null;
  briefCell?: string | null;
  existingCellIds: Iterable<string>;
}): string {
  const adCell = (opts.adCell ?? "").trim();
  if (/^C\d+[A-Z]$/i.test(adCell)) return adCell.toUpperCase();
  const briefCell = (opts.briefCell ?? "").trim();
  if (/^C\d+[A-Z]$/i.test(briefCell)) return briefCell.toUpperCase();
  let maxCol = 0;
  for (const id of opts.existingCellIds) {
    const m = /^C(\d+)/i.exec(String(id).trim());
    if (m) maxCol = Math.max(maxCol, Number(m[1]));
  }
  return `C${maxCol + 1}A`;
}

/** Leading matrix cell code of a brief position string ("C2B_..." → "C2B"). */
export function briefCellCode(pos: string | null | undefined): string | null {
  const m = /^(C\d+[A-Z])/i.exec(String(pos ?? "").trim());
  return m ? m[1]!.toUpperCase() : null;
}

/**
 * Extract the brief-INTENDED variable codes from a brief payload, for the
 * side-by-side comparison in the review queue. Returns null when nothing
 * variable-shaped is present.
 */
export function briefIntendedVariables(payload: Row | null | undefined): string[] | null {
  if (!payload || typeof payload !== "object") return null;
  const found = new Set<string>();
  const pushCodes = (value: unknown) => {
    if (typeof value !== "string") return;
    for (const token of value.split(/[+,\s]+/)) {
      if (CODE_RE.test(token.trim())) found.add(token.trim());
    }
  };
  const walk = (node: unknown, depth: number) => {
    if (depth > 6 || node == null) return;
    if (typeof node === "string") return pushCodes(node);
    if (Array.isArray(node)) return node.forEach((n) => walk(n, depth + 1));
    if (typeof node === "object") {
      for (const [k, v] of Object.entries(node as Row)) {
        if (/angle_stack|variable|concept_code|design_system|cta_type|framework|tonality|hook/i.test(k)) {
          walk(v, depth + 1);
        } else if (typeof v === "object") {
          walk(v, depth + 1);
        }
      }
    }
  };
  walk(payload, 0);
  return found.size > 0 ? [...found] : null;
}

// ─── model output schema ──────────────────────────────────────────────

const DetectedVariableSchema = z.object({
  family: z.string().min(1),
  code: z.string().min(1),
  confidence: z.number(),
  evidence: z.string().nullish(),
});

const DeconstructionOutput = z.object({
  variables: z.array(DetectedVariableSchema).min(1),
  primary_message: z.string().nullish(),
  secondary_message: z.string().nullish(),
  cta: z.string().nullish(),
  visual_system: z.string().nullish(),
});

// ─── media support ────────────────────────────────────────────────────

const SUPPORTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

/** Resolve a servable Anthropic media type, or null when unsupported (video etc.). */
export function supportedImageMediaType(contentType: string | null | undefined, filename: string): string | null {
  const ct = String(contentType ?? "").toLowerCase().split(";")[0]!.trim();
  if (SUPPORTED_IMAGE_TYPES.has(ct)) return ct;
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  const byExt: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
  };
  if (ct.startsWith("video/")) return null;
  return byExt[ext] ?? null;
}

function decodeStagedBytes(hexOrRaw: string): Buffer {
  // Supabase/PostgREST returns bytea as a hex string prefixed with \x.
  const hex = hexOrRaw.startsWith("\\x") ? hexOrRaw.slice(2) : hexOrRaw;
  return Buffer.from(hex, "hex");
}

// ─── prompt ───────────────────────────────────────────────────────────

function deconstructionPrompt(opts: {
  accountName: string;
  filename: string;
  adContexts: Array<Row>;
  briefIntended: string[] | null;
  registryFamilies: string[];
}): string {
  const adLines =
    opts.adContexts.length > 0
      ? opts.adContexts
          .map(
            (a) =>
              `- ad_name: ${a.ad_name}${a.cell ? ` | grid cell: ${a.cell}` : ""}${a.concept ? ` | concept: ${a.concept}` : ""}${a.variation ? ` | variation: ${a.variation}` : ""}`,
          )
          .join("\n")
      : "- (not mapped to a live ad yet — classify from the visual alone)";
  return [
    `You are the Metrix IAP creative deconstruction engine for the ad account "${opts.accountName}".`,
    `Analyze the attached creative image ("${opts.filename}") together with its ad-name context and classify it against the IAP variable registry.`,
    "",
    IAP_VARIABLE_TAXONOMY,
    "",
    `Registry families active for this account: ${opts.registryFamilies.join(", ") || "(all families)"}.`,
    "",
    "MAPPED AD CONTEXT (ad naming encodes intended variables — use as evidence, but grade what the creative ACTUALLY shows):",
    adLines,
    ...(opts.briefIntended && opts.briefIntended.length > 0
      ? [
          "",
          "BRIEF-INTENDED VARIABLES (what the linked brief planned — the designed creative may have drifted; report what you SEE, not what was planned):",
          opts.briefIntended.join(" + "),
        ]
      : []),
    "",
    "RULES:",
    "- Detect ONE code per relevant family. Required stack when identifiable: concept (CN_), framework (FW_), tonality (TN_), hook (HK_). Add ST_/AW_/HP_/PR_ only when clearly present.",
    "- family must be one of: concept, framework, tonality, funnel_stage, awareness, pain_point, proof, hook — and the code must carry that family's prefix.",
    "- confidence is a number 0..1 reflecting how certain you are the variable is genuinely expressed in THIS creative. Never inflate; 0.5 means 'plausible guess'.",
    "- evidence: one short sentence pointing at what in the image/copy supports the code.",
    "- Also transcribe: primary_message (headline/main copy visible), secondary_message, cta (visible call-to-action text), visual_system (short description of the design system, e.g. 'UGC selfie style', 'flat product grid').",
    "",
    'Return ONLY raw JSON: {"variables":[{"family":"...","code":"...","confidence":0.0,"evidence":"..."}],"primary_message":"...","secondary_message":"...","cta":"...","visual_system":"..."} — no prose, no markdown fences.',
  ].join("\n");
}

// ─── library filing ───────────────────────────────────────────────────

/** Build the MSTLibraryCell-shaped payload for a filed deconstruction. */
export function libraryPayloadFromDeconstruction(opts: {
  cellId: string;
  conceptId: string;
  conceptName: string | null;
  adNames: string[];
  filename: string;
  variables: DetectedVariable[];
  detectedCopy: Row | null;
  overall: number | null;
  status: "auto_filed" | "user_overridden";
  manualImportId: string;
  deconstructionId: string;
  runId: string | null;
}): Row {
  const byFamily = new Map(opts.variables.map((v) => [v.family, v.code]));
  const copy = opts.detectedCopy ?? {};
  return {
    cell_id: opts.cellId,
    concept_id: opts.conceptId,
    book2_concept_name: opts.conceptName ?? byFamily.get("concept") ?? opts.conceptId,
    mapped_ad_names: opts.adNames,
    primary_message: copy["primary_message"] ?? "",
    secondary_message: copy["secondary_message"] ?? "",
    cta: copy["cta"] ?? "",
    visual_system: copy["visual_system"] ?? "",
    concept_variable: byFamily.get("concept") ?? undefined,
    framework_variable: byFamily.get("framework") ?? undefined,
    tone_variable: byFamily.get("tonality") ?? undefined,
    hook_variable: byFamily.get("hook") ?? undefined,
    pain_proof_variable: byFamily.get("pain_point") ?? undefined,
    proof_variable: byFamily.get("proof") ?? undefined,
    asset_filename: opts.filename,
    qa_mapping_status: opts.status === "auto_filed" ? "auto_classified" : "user_overridden",
    mapping_confidence: opts.overall != null ? `${Math.round(opts.overall * 100)}%` : null,
    // Provenance — used for dedupe on re-classification and cleanup on
    // import delete / dead-run cleanup. Never rendered.
    source: "deconstructed",
    deconstruction_of: opts.manualImportId,
    deconstruction_id: opts.deconstructionId,
    deconstruction_run_id: opts.runId,
  };
}

/**
 * READ-ONLY: compute the library filing (aligned cell id + row to insert)
 * for a deconstruction. Performs no writes — the actual swap happens
 * atomically in `commitReplacement` (single-transaction Postgres function).
 */
async function computeFiling(
  dec: Row,
  status: "auto_filed" | "user_overridden",
): Promise<{ cellId: string; libraryRow: Row }> {
  const supabase = getSupabase();
  const accountId = String(dec["account_id"]);
  const importId = String(dec["manual_import_id"]);

  const { data: existing, error: exErr } = await supabase
    .from("library_cells")
    .select("cell_id, row_index")
    .eq("account_id", accountId);
  if (exErr) throw new Error(exErr.message);
  const rows = existing ?? [];

  // Ad + brief context for cell alignment.
  const adNames: string[] = Array.isArray(dec["ad_names"]) ? dec["ad_names"].map(String) : [];
  let adCell: string | null = null;
  if (adNames.length > 0) {
    const { data: ads } = await supabase
      .from("ads")
      .select("ad_name, cell, concept")
      .eq("account_id", accountId)
      .in("ad_name", adNames);
    adCell = (ads ?? []).map((a: Row) => a["cell"]).find((c: unknown) => c) ?? null;
  }
  const cellId = alignCellId({
    adCell,
    briefCell: briefCellCode(dec["brief_ref_position"] as string | undefined) ?? null,
    // Exclude this import's own prior entry: the atomic swap removes it in
    // the same transaction, so it must not force a fresh column.
    existingCellIds: rows.map((r: Row) => String(r["cell_id"])),
  });
  const conceptId = /^(C\d+)/i.exec(cellId)?.[1]!.toUpperCase() ?? cellId;

  const payload = libraryPayloadFromDeconstruction({
    cellId,
    conceptId,
    conceptName: null,
    adNames,
    filename: String(dec["filename"]),
    variables: (dec["variables"] ?? []) as DetectedVariable[],
    detectedCopy: (dec["detected_copy"] ?? null) as Row | null,
    overall: dec["overall_confidence"] != null ? Number(dec["overall_confidence"]) : null,
    status,
    manualImportId: importId,
    // Placeholder — the transaction stamps the real classification id.
    deconstructionId: String(dec["id"] ?? ""),
    runId: dec["generation_run_id"] != null ? String(dec["generation_run_id"]) : null,
  });

  return {
    cellId,
    libraryRow: {
      cell_id: cellId,
      concept_id: conceptId,
      asset_filename: String(dec["filename"]),
      qa_mapping_status: payload["qa_mapping_status"],
      mapping_confidence: payload["mapping_confidence"],
      payload,
    },
  };
}

/**
 * Atomically replace an import's classification AND its derived library
 * entry in ONE Postgres transaction (`metrix_replace_deconstruction_filing`):
 * upsert the classification row, delete the prior derived library cells,
 * insert the new one (when filing), stamp cell_id. Any failure rolls the
 * whole replacement back — the prior successful result always survives.
 */
async function commitReplacement(
  accountId: string,
  importId: string,
  classification: Row,
  cellId: string | null,
  libraryRow: Row | null,
): Promise<Row> {
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("metrix_replace_deconstruction_filing", {
    p_account_id: accountId,
    p_import_id: importId,
    p_classification: classification,
    p_cell_id: cellId,
    p_library_row: libraryRow,
  });
  if (error) throw new Error(error.message);
  return data as Row;
}

/** Remove any library rows derived from a manual import (import delete / discard). */
export async function deleteDerivedLibraryEntries(accountId: string, importId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("library_cells")
    .delete()
    .eq("account_id", accountId)
    .eq("payload->>deconstruction_of", importId);
  if (error) throw new Error(error.message);
}

// ─── run entry point ──────────────────────────────────────────────────

/**
 * Start a deconstruction run over the given creative_asset manual imports.
 * Returns the run id immediately; classification continues in the background.
 */
export async function startCreativeDeconstruction(
  accountId: string,
  createdBy: string,
  importIds: string[],
): Promise<string> {
  if (!Array.isArray(importIds) || importIds.length === 0) {
    throw new GenerationError("Select at least one uploaded creative to deconstruct.", 400);
  }
  const supabase = getSupabase();
  const { data: account, error: accErr } = await supabase
    .from("ad_accounts")
    .select("id, name")
    .eq("id", accountId)
    .limit(1);
  if (accErr) throw new Error(accErr.message);
  if (!account?.[0]) throw new GenerationError("Ad account not found.", 404);
  const accountName = String(account[0]["name"] ?? accountId);

  const { data: imports, error: impErr } = await supabase
    .from("manual_imports")
    .select("id, filename, content_type, content, ad_names, kind")
    .eq("account_id", accountId)
    .eq("kind", "creative_asset")
    .in("id", importIds);
  if (impErr) throw new Error(impErr.message);
  if (!imports || imports.length === 0) {
    throw new GenerationError("None of the selected uploads are creative assets on this account.", 422);
  }

  const runId = await startRun(accountId, "deconstruct", createdBy);

  void (async () => {
    try {
      // Shared account context, fetched once per run.
      const [{ data: ads }, { data: briefs }, { data: registry }] = await Promise.all([
        supabase.from("ads").select("ad_name, cell, concept, variation").eq("account_id", accountId),
        supabase.from("imported_creative_briefs").select("brief_id, source, payload").eq("account_id", accountId),
        supabase.from("variable_registry").select("prefix, family, status"),
      ]);
      const adByName = new Map((ads ?? []).map((a: Row) => [String(a["ad_name"]), a]));
      const registryFamilies = (registry ?? [])
        .filter((r: Row) => String(r["status"] ?? "") !== "registry_missing")
        .map((r: Row) => `${r["family"]} (${r["prefix"]})`);

      // Brief linkage: a creative traces to a brief when a mapped ad's grid
      // cell matches the brief's matrix position, or the brief names the ad.
      const findBrief = (adRows: Row[]): { briefId: string; position: string | null; payload: Row } | null => {
        const cells = new Set(adRows.map((a) => String(a["cell"] ?? "")).filter(Boolean));
        const generatedFirst = [...(briefs ?? [])].sort((a: Row, b: Row) =>
          String(b["source"] ?? "").localeCompare(String(a["source"] ?? "")),
        );
        for (const b of generatedFirst) {
          const p = (b["payload"] ?? {}) as Row;
          const pos = String(
            (p["testing_framework"] as Row | undefined)?.["matrix_position"] ?? p["matrix_position"] ?? "",
          );
          const code = briefCellCode(pos);
          if (code && cells.has(code)) {
            return { briefId: String(b["brief_id"]), position: pos, payload: p };
          }
        }
        return null;
      };

      // Per-import atomic replacement: a prior classification (and its filed
      // library entry) is NEVER deleted before the new one has been fully
      // computed and committed. Each iteration: (1) run the model with NO
      // writes, (2) upsert the classification row (unique on account_id +
      // manual_import_id, so the old row is replaced in a single statement),
      // (3) swap the derived library entry. A model failure mid-batch
      // therefore leaves every not-yet-reclassified import — including its
      // previous successful result — untouched.
      for (const imp of imports) {
        const importId = String(imp["id"]);
        const filename = String(imp["filename"]);
        const adNames: string[] = Array.isArray(imp["ad_names"]) ? imp["ad_names"].map(String) : [];
        const adRows = adNames.map((n) => adByName.get(n)).filter((a): a is Row => Boolean(a));
        const mediaType = supportedImageMediaType(imp["content_type"] as string | null, filename);

        const base: Row = {
          generation_run_id: runId,
          filename,
          ad_names: adNames,
          model: GENERATION_MODEL,
        };

        if (!mediaType) {
          // Atomic: unsupported replaces the prior classification and drops
          // any library entry it no longer backs, in one transaction.
          await commitReplacement(
            accountId,
            importId,
            {
              ...base,
              status: "unsupported",
              variables: [],
              overall_confidence: null,
              detected_copy: null,
              brief_ref: null,
              brief_variables: null,
              overridden_by: null,
              overridden_at: null,
            },
            null,
            null,
          );
          continue;
        }

        const brief = findBrief(adRows);
        const briefIntended = brief ? briefIntendedVariables(brief.payload) : null;

        // ── Model call: no writes have happened for this import yet. ──
        const imageB64 = decodeStagedBytes(String(imp["content"])).toString("base64");
        const content: ModelContent = [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageB64 } },
          {
            type: "text",
            text: deconstructionPrompt({ accountName, filename, adContexts: adRows, briefIntended, registryFamilies }),
          },
        ];

        const output = sanitizeGeneratedText(
          await generateValidated(content, DeconstructionOutput, { maxTokens: 8192 }),
          accountName,
        );

        const variables = sanitizeDetectedVariables(output.variables as DetectedVariable[]);
        if (variables.length === 0) {
          throw new Error(`Model returned no registry-valid variables for ${filename}.`);
        }
        const overall = overallConfidence(variables);
        const status = gateDecision(overall);

        const detectedCopy = {
          primary_message: output.primary_message ?? null,
          secondary_message: output.secondary_message ?? null,
          cta: output.cta ?? null,
          visual_system: output.visual_system ?? null,
        };

        const classification: Row = {
          ...base,
          status,
          variables,
          overall_confidence: overall,
          detected_copy: detectedCopy,
          brief_ref: brief?.briefId ?? null,
          brief_variables: briefIntended,
          overridden_by: null,
          overridden_at: null,
        };

        // ── Commit: classification upsert + library swap in ONE transaction.
        let filing: { cellId: string; libraryRow: Row } | null = null;
        if (status === "auto_filed") {
          filing = await computeFiling(
            {
              account_id: accountId,
              manual_import_id: importId,
              generation_run_id: runId,
              filename,
              ad_names: adNames,
              variables,
              detected_copy: detectedCopy,
              overall_confidence: overall,
              brief_ref_position: brief?.position ?? null,
            },
            "auto_filed",
          );
        }
        await commitReplacement(
          accountId,
          importId,
          classification,
          filing?.cellId ?? null,
          filing?.libraryRow ?? null,
        );
      }

      await finishRun(runId, "success");
      invalidateMetrixSeedCache();
      logger.info({ accountId, runId, count: imports.length }, "Creative deconstruction succeeded");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ accountId, runId, err }, "Creative deconstruction failed");
      try {
        // No output deletion here: each import's replacement is committed
        // atomically (see loop above), so everything already written is a
        // complete, valid classification. Deleting by run id would destroy
        // valid replacements of earlier imports in the batch — and prior
        // results of unprocessed imports were never touched.
        await finishRun(runId, "error", message);
        invalidateMetrixSeedCache();
      } catch (cleanupErr) {
        logger.error({ accountId, runId, err: cleanupErr }, "Deconstruction cleanup failed");
      }
    }
  })();

  return runId;
}

// ─── review actions ───────────────────────────────────────────────────

export type DeconstructionRecord = Row;

const deconstructionShape = (r: Row): Row => ({
  id: String(r["id"]),
  manual_import_id: String(r["manual_import_id"]),
  filename: r["filename"],
  ad_names: Array.isArray(r["ad_names"]) ? r["ad_names"] : [],
  status: r["status"],
  variables: Array.isArray(r["variables"]) ? r["variables"] : [],
  overall_confidence: r["overall_confidence"] != null ? Number(r["overall_confidence"]) : null,
  detected_copy: r["detected_copy"] ?? null,
  brief_ref: r["brief_ref"] ?? null,
  brief_variables: Array.isArray(r["brief_variables"]) ? r["brief_variables"] : null,
  cell_id: r["cell_id"] ?? null,
  overridden_by: r["overridden_by"] ?? null,
  overridden_at: r["overridden_at"] ?? null,
  model: r["model"] ?? null,
  created_at: String(r["created_at"]),
  updated_at: String(r["updated_at"]),
});

export async function listDeconstructions(accountId: string): Promise<Row[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("creative_deconstructions")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(deconstructionShape);
}

async function getDeconstruction(accountId: string, id: string): Promise<Row> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("creative_deconstructions")
    .select("*")
    .eq("account_id", accountId)
    .eq("id", id)
    .limit(1);
  if (error) throw new Error(error.message);
  if (!data?.[0]) throw new GenerationError("Classification not found.", 404);
  return data[0];
}

/**
 * Review-queue actions. `update_variables` edits the stored classification
 * (registry-constrained); `bypass` explicitly overrides the confidence gate
 * and files the entry (recorded as user_overridden); `discard` rejects it
 * and removes anything previously filed.
 */
export async function reviewDeconstruction(
  accountId: string,
  id: string,
  action: "update_variables" | "bypass" | "discard",
  editedBy: string,
  variables?: DetectedVariable[],
): Promise<Row> {
  const supabase = getSupabase();
  const row = await getDeconstruction(accountId, id);
  const status = String(row["status"]);
  if (status === "unsupported") {
    throw new GenerationError("Video/unsupported files cannot be classified yet.", 422);
  }
  const now = new Date().toISOString();

  if (action === "update_variables") {
    if (status !== "needs_review") {
      throw new GenerationError("Only classifications in the review queue can be edited.", 409);
    }
    const cleaned = sanitizeDetectedVariables(
      (variables ?? []).map((v) => ({ ...v, user_edited: true })),
    );
    if (cleaned.length === 0) {
      throw new GenerationError("Provide at least one registry-valid variable (family + prefixed code).", 400);
    }
    const upd = await supabase
      .from("creative_deconstructions")
      .update({ variables: cleaned, overall_confidence: overallConfidence(cleaned), updated_at: now })
      .eq("id", id)
      .select("*");
    if (upd.error) throw new Error(upd.error.message);
    invalidateMetrixSeedCache();
    return deconstructionShape(upd.data![0]!);
  }

  if (action === "bypass") {
    if (status !== "needs_review") {
      throw new GenerationError("Only classifications in the review queue can be accepted.", 409);
    }
    // Compute the filing read-only, then commit status flip + library entry
    // in one transaction so a partial failure never leaves an overridden
    // classification without its filed cell (or vice versa).
    const { cellId, libraryRow } = await computeFiling(row, "user_overridden");
    const updated = await commitReplacement(
      accountId,
      String(row["manual_import_id"]),
      {
        generation_run_id: row["generation_run_id"] ?? null,
        filename: row["filename"],
        ad_names: row["ad_names"] ?? [],
        model: row["model"] ?? null,
        status: "user_overridden",
        variables: row["variables"] ?? [],
        overall_confidence: row["overall_confidence"] ?? null,
        detected_copy: row["detected_copy"] ?? null,
        brief_ref: row["brief_ref"] ?? null,
        brief_variables: row["brief_variables"] ?? null,
        overridden_by: editedBy,
        overridden_at: now,
      },
      cellId,
      libraryRow,
    );
    invalidateMetrixSeedCache();
    return deconstructionShape(updated);
  }

  // discard
  await deleteDerivedLibraryEntries(accountId, String(row["manual_import_id"]));
  const upd = await supabase
    .from("creative_deconstructions")
    .update({ status: "discarded", cell_id: null, updated_at: now })
    .eq("id", id)
    .select("*");
  if (upd.error) throw new Error(upd.error.message);
  invalidateMetrixSeedCache();
  return deconstructionShape(upd.data![0]!);
}
