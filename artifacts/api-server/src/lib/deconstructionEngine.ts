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
import { extractVideoKeyframes } from "./videoKeyframes";
import {
  GENERATION_MODEL,
  GenerationError,
  IAP_VARIABLE_TAXONOMY,
  finishRun,
  generateValidated,
  sanitizeGeneratedText,
  setRunProgress,
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

/** Maps a registry family to the MSTLibraryCell payload column that stores it. */
const FAMILY_TO_PAYLOAD_KEY: Record<string, string> = {
  concept: "concept_variable",
  framework: "framework_variable",
  tonality: "tone_variable",
  hook: "hook_variable",
  pain_point: "pain_proof_variable",
  proof: "proof_variable",
  // NOTE: the registry `funnel_stage` family (ST_ prefix) is a distinct
  // concept from the cell's `stage` field — `stage` holds a human display
  // label (e.g. "TOF", "MOF", "TOF to MOF"), never a registry code, and
  // must never be read/overwritten by this comparison. ST_/AW_ have no
  // established registry definition yet (see variable_registry's
  // registry_missing status), so they get their own dedicated, non-
  // colliding payload keys here.
  funnel_stage: "funnel_stage_variable",
  awareness: "awareness_variable",
};

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

/** Resolve a servable Anthropic media type, or null when not an image (video etc.). */
export function supportedImageMediaType(contentType: string | null | undefined, filename: string): string | null {
  // Video detection wins: a video-extension file with a stale/misdetected
  // image MIME type must go through the keyframe pipeline, never be sent to
  // the model as a (undecodable) image.
  if (isVideoCreative(contentType, filename)) return null;
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

const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm", "m4v", "avi", "mkv", "mpeg", "mpg", "ogv"]);
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
  videoFrameLabels?: string[] | null;
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
    opts.videoFrameLabels && opts.videoFrameLabels.length > 0
      ? `The creative "${opts.filename}" is a VIDEO. The attached images are keyframes extracted from it, in order: ${opts.videoFrameLabels.join(", ")}. Analyze them together with the ad-name context as ONE creative and classify it against the IAP variable registry.`
      : `Analyze the attached creative image ("${opts.filename}") together with its ad-name context and classify it against the IAP variable registry.`,
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

// ─── cell-targeted upload validation ───────────────────────────────────
// Manual uploads made directly onto a specific "No asset" tile (rather than
// the freeform manual-import → deconstruct flow) must be classified against
// the SAME registry, but scoped to the one cell the user targeted: the
// question isn't "which cell does this belong to" (alignCellId's job) but
// "does this creative actually match the DNA already on record for this
// cell". No cell_id guessing happens here.

export type CellCreativeValidation = {
  /** unclassified: media type the model can't see (rare/broken upload). */
  status: "matched" | "mismatch" | "unclassified";
  overall_confidence: number | null;
  variables: DetectedVariable[];
  /** DNA already on record for this cell (empty when the cell has none yet). */
  expected: DetectedVariable[];
  /** Expected codes the upload did not reproduce. */
  missing: string[];
  /** Families where the upload shows a DIFFERENT code than the cell's record. */
  conflicting: string[];
  detected_copy: Row | null;
  /** Internal: the cell's existing library_cells row, if any — never sent to the client. */
  row?: Row | null;
};

function cellValidationPrompt(opts: {
  accountName: string;
  cellId: string;
  filename: string;
  adContexts: Array<Row>;
  expected: DetectedVariable[];
  registryFamilies: string[];
  videoFrameLabels?: string[] | null;
}): string {
  const adLines =
    opts.adContexts.length > 0
      ? opts.adContexts
          .map(
            (a) =>
              `- ad_name: ${a.ad_name}${a.concept ? ` | concept: ${a.concept}` : ""}${a.variation ? ` | variation: ${a.variation}` : ""}`,
          )
          .join("\n")
      : "- (no live ads mapped to this cell yet — classify from the visual alone)";
  return [
    `You are the Metrix IAP creative deconstruction engine for the ad account "${opts.accountName}".`,
    `This file is being uploaded DIRECTLY to library cell "${opts.cellId}" — do not choose or suggest a different cell. Your job is only to classify what the creative shows.`,
    opts.videoFrameLabels && opts.videoFrameLabels.length > 0
      ? `The creative "${opts.filename}" is a VIDEO. The attached images are keyframes extracted from it, in order: ${opts.videoFrameLabels.join(", ")}. Analyze them together as ONE creative.`
      : `Analyze the attached creative image ("${opts.filename}").`,
    "",
    IAP_VARIABLE_TAXONOMY,
    "",
    `Registry families active for this account: ${opts.registryFamilies.join(", ") || "(all families)"}.`,
    "",
    "ADS CURRENTLY MAPPED TO THIS CELL (context only):",
    adLines,
    ...(opts.expected.length > 0
      ? [
          "",
          `THIS CELL'S RECORDED DNA (what it is currently filed as — report what the upload ACTUALLY shows, not what's expected):`,
          opts.expected.map((v) => `${v.family}: ${v.code}`).join(" + "),
        ]
      : []),
    "",
    "RULES:",
    "- Detect ONE code per relevant family. Required stack when identifiable: concept (CN_), framework (FW_), tonality (TN_), hook (HK_). Add ST_/AW_/HP_/PR_ only when clearly present.",
    "- family must be one of: concept, framework, tonality, funnel_stage, awareness, pain_point, proof, hook — and the code must carry that family's prefix.",
    "- confidence is a number 0..1 reflecting how certain you are the variable is genuinely expressed in THIS creative. Never inflate; 0.5 means 'plausible guess'.",
    "- evidence: one short sentence pointing at what in the image/copy supports the code.",
    "- Also transcribe: primary_message, secondary_message, cta, visual_system.",
    "",
    'Return ONLY raw JSON: {"variables":[{"family":"...","code":"...","confidence":0.0,"evidence":"..."}],"primary_message":"...","secondary_message":"...","cta":"...","visual_system":"..."} — no prose, no markdown fences.',
  ].join("\n");
}

/**
 * library_cells DNA fields are frequently composite — multiple registry
 * codes for the same family joined with " + " (mirrors the frontend's
 * splitCodes() convention in segment-analytics.ts). Split into individual
 * codes so comparisons work per-code, not per-raw-field-string.
 */
function splitCompositeCodes(v: unknown): string[] {
  if (typeof v !== "string") return [];
  return v
    .split(/\s*\+\s*/)
    .map((c) => c.trim())
    .filter(Boolean);
}

/** DNA currently on record for a cell, read from its library_cells row (if any). */
async function expectedVariablesForCell(accountId: string, cellId: string): Promise<{ row: Row | null; expected: DetectedVariable[] }> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("library_cells")
    .select("*")
    .eq("account_id", accountId)
    .eq("cell_id", cellId)
    .order("row_index", { ascending: true })
    .limit(1);
  if (error) throw new Error(error.message);
  const row = data?.[0] ?? null;
  if (!row) return { row: null, expected: [] };
  const payload = (row["payload"] ?? {}) as Row;
  const expected: DetectedVariable[] = [];
  for (const [family, payloadKey] of Object.entries(FAMILY_TO_PAYLOAD_KEY)) {
    const raw = payload[payloadKey] ?? row[payloadKey];
    for (const code of splitCompositeCodes(raw)) {
      expected.push({ family, code, confidence: 1 });
    }
  }
  return { row, expected };
}

/**
 * Classify an uploaded file against the registry, scoped to one known
 * target cell — no cell guessing. Compares detected variables against the
 * cell's recorded DNA (when it has one) so a visually-different creative
 * can't silently overwrite a cell's identity without the user confirming.
 * Read-only: performs no writes.
 */
export async function classifyCellCreative(opts: {
  accountId: string;
  cellId: string;
  filename: string;
  contentType: string | null;
  bytes: Buffer;
}): Promise<CellCreativeValidation> {
  const empty: CellCreativeValidation = {
    status: "unclassified",
    overall_confidence: null,
    variables: [],
    expected: [],
    missing: [],
    conflicting: [],
    detected_copy: null,
  };

  const mediaType = supportedImageMediaType(opts.contentType, opts.filename);
  let videoFrames: Array<{ label: string; jpeg: Buffer }> | null = null;
  if (!mediaType && isVideoCreative(opts.contentType, opts.filename)) {
    try {
      videoFrames = await extractVideoKeyframes(opts.bytes, opts.filename);
    } catch (err) {
      logger.warn({ accountId: opts.accountId, cellId: opts.cellId, err }, "Cell upload video keyframe extraction failed");
      videoFrames = null;
    }
  }
  if (!mediaType && !videoFrames) return empty;

  const supabase = getSupabase();
  const [{ data: account, error: accErr }, { row: libraryRow, expected }, { data: ads }, { data: registry }] = await Promise.all([
    supabase.from("ad_accounts").select("id, name").eq("id", opts.accountId).limit(1),
    expectedVariablesForCell(opts.accountId, opts.cellId),
    supabase.from("ads").select("ad_name, concept, variation").eq("account_id", opts.accountId).eq("cell", opts.cellId),
    supabase.from("variable_registry").select("prefix, family, status"),
  ]);
  if (accErr) throw new Error(accErr.message);
  const accountName = String(account?.[0]?.["name"] ?? opts.accountId);
  const registryFamilies = (registry ?? [])
    .filter((r: Row) => String(r["status"] ?? "") !== "registry_missing")
    .map((r: Row) => `${r["family"]} (${r["prefix"]})`);

  const imageBlocks: Array<Record<string, unknown>> = videoFrames
    ? videoFrames.map((f) => ({
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: f.jpeg.toString("base64") },
      }))
    : [
        {
          type: "image",
          source: { type: "base64", media_type: mediaType!, data: opts.bytes.toString("base64") },
        },
      ];
  const content: ModelContent = [
    ...imageBlocks,
    {
      type: "text",
      text: cellValidationPrompt({
        accountName,
        cellId: opts.cellId,
        filename: opts.filename,
        adContexts: ads ?? [],
        expected,
        registryFamilies,
        videoFrameLabels: videoFrames ? videoFrames.map((f) => f.label) : null,
      }),
    },
  ];

  const output = sanitizeGeneratedText(
    await generateValidated(content, DeconstructionOutput, { maxTokens: 8192 }),
    accountName,
  );
  const variables = sanitizeDetectedVariables(output.variables as DetectedVariable[]);
  if (variables.length === 0) {
    throw new Error(`Model returned no registry-valid variables for ${opts.filename}.`);
  }
  const overall = overallConfidence(variables);
  const confidenceGate = gateDecision(overall) === "auto_filed";

  const detectedByFamily = new Map(variables.map((v) => [v.family, v.code]));
  // DNA fields are frequently composite (e.g. "TN_bold + TN_playful"), and
  // the model reports one code per family — so a family matches when the
  // detected code is a MEMBER of the expected set, not when it equals the
  // whole (possibly multi-code) field verbatim.
  const expectedByFamily = new Map<string, Set<string>>();
  for (const exp of expected) {
    const set = expectedByFamily.get(exp.family) ?? new Set<string>();
    set.add(exp.code);
    expectedByFamily.set(exp.family, set);
  }
  const missing: string[] = [];
  const conflicting: string[] = [];
  for (const [family, expectedCodes] of expectedByFamily) {
    const got = detectedByFamily.get(family);
    if (!got) {
      missing.push(...expectedCodes);
    } else if (!expectedCodes.has(got)) {
      conflicting.push(`${[...expectedCodes].join(" + ")} → ${got}`);
    }
  }

  const detected_copy = {
    primary_message: output.primary_message ?? null,
    secondary_message: output.secondary_message ?? null,
    cta: output.cta ?? null,
    visual_system: output.visual_system ?? null,
  };

  const matched = confidenceGate && missing.length === 0 && conflicting.length === 0;
  return {
    status: matched ? "matched" : "mismatch",
    overall_confidence: overall,
    variables,
    expected,
    missing,
    conflicting,
    detected_copy,
    row: libraryRow,
  };
}

/**
 * Commit a cell-targeted upload: writes the servable asset override AND
 * keeps the cell's library DNA record in sync with what was just validated
 * (creates a library_cells row for a cell that never had one, or updates an
 * existing row's variable fields) — so a later Creative Scan / backfill on
 * this cell won't contradict what the user just confirmed.
 */
export async function fileCellCreativeOverride(opts: {
  accountId: string;
  cellId: string;
  filename: string;
  contentType: string;
  bytes: Buffer;
  validation: CellCreativeValidation;
  overridden: boolean;
}): Promise<void> {
  const supabase = getSupabase();
  const hexBytes = `\\x${opts.bytes.toString("hex")}`;
  const upsert = await supabase.from("cell_creative_overrides").upsert(
    {
      account_id: opts.accountId,
      cell_id: opts.cellId,
      asset_bytes: hexBytes,
      content_type: opts.contentType,
      filename: opts.filename,
      uploaded_at: new Date().toISOString(),
    },
    { onConflict: "account_id,cell_id" },
  );
  if (upsert.error) throw new Error(upsert.error.message);

  if (opts.validation.status !== "unclassified") {
    const status = opts.overridden ? "user_overridden" : "auto_classified";
    const confidencePct =
      opts.validation.overall_confidence != null ? `${Math.round(opts.validation.overall_confidence * 100)}%` : null;
    const byFamily = new Map(opts.validation.variables.map((v) => [v.family, v.code]));
    const existingRow = (opts.validation as CellCreativeValidation & { row?: Row | null }).row ?? null;
    // Group the (possibly composite) recorded DNA by family so we only
    // touch a field when the detection actually conflicts with (or adds to)
    // what's already on record — a matching detection leaves a multi-code
    // field untouched instead of collapsing it down to the single code the
    // model happened to report this time.
    const expectedByFamily = new Map<string, Set<string>>();
    for (const e of opts.validation.expected) {
      const set = expectedByFamily.get(e.family) ?? new Set<string>();
      set.add(e.code);
      expectedByFamily.set(e.family, set);
    }

    if (existingRow) {
      const priorPayload = (existingRow["payload"] ?? {}) as Row;
      const payload: Row = { ...priorPayload };
      for (const [family, payloadKey] of Object.entries(FAMILY_TO_PAYLOAD_KEY)) {
        const code = byFamily.get(family);
        if (!code) continue;
        const expectedCodes = expectedByFamily.get(family);
        if (expectedCodes && expectedCodes.has(code)) continue; // already part of the recorded DNA — leave composite field intact
        // No prior DNA for this family, or the detection conflicts with what
        // was recorded (only reached after an explicit user override) —
        // the newly validated creative's code becomes the new record.
        payload[payloadKey] = code;
      }
      payload["asset_filename"] = opts.filename;
      payload["qa_mapping_status"] = status;
      payload["mapping_confidence"] = confidencePct;
      const upd = await supabase
        .from("library_cells")
        .update({
          asset_filename: opts.filename,
          qa_mapping_status: status,
          mapping_confidence: confidencePct,
          payload,
        })
        .eq("id", existingRow["id"]);
      if (upd.error) throw new Error(upd.error.message);
    } else {
      const conceptId = /^(C\d+)/i.exec(opts.cellId)?.[1]?.toUpperCase() ?? opts.cellId;
      const { data: maxRow } = await supabase
        .from("library_cells")
        .select("row_index")
        .eq("account_id", opts.accountId)
        .order("row_index", { ascending: false })
        .limit(1);
      const nextRowIndex = (maxRow?.[0]?.["row_index"] ?? -1) + 1;
      const copy = opts.validation.detected_copy ?? {};
      const payload: Row = {
        cell_id: opts.cellId,
        concept_id: conceptId,
        book2_concept_name: conceptId,
        mapped_ad_names: [],
        primary_message: copy["primary_message"] ?? "",
        secondary_message: copy["secondary_message"] ?? "",
        cta: copy["cta"] ?? "",
        visual_system: copy["visual_system"] ?? "",
        asset_filename: opts.filename,
        qa_mapping_status: status,
        mapping_confidence: confidencePct,
        source: "manual_cell_upload",
      };
      for (const [family, payloadKey] of Object.entries(FAMILY_TO_PAYLOAD_KEY)) {
        const code = byFamily.get(family);
        if (code) payload[payloadKey] = code;
      }
      const ins = await supabase.from("library_cells").insert({
        account_id: opts.accountId,
        cell_id: opts.cellId,
        concept_id: conceptId,
        asset_filename: opts.filename,
        qa_mapping_status: status,
        mapping_confidence: confidencePct,
        row_index: nextRowIndex,
        payload,
      });
      if (ins.error) throw new Error(ins.error.message);
    }
  }

  invalidateMetrixSeedCache();
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
    funnel_stage_variable: byFamily.get("funnel_stage") ?? undefined,
    awareness_variable: byFamily.get("awareness") ?? undefined,
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

// Rate-limit pacing for bulk runs: model calls are strictly sequential
// (one per import), and after every CHUNK_SIZE imports the run pauses for
// CHUNK_PAUSE_MS so a large backfill can't flood the model API.
export const DECONSTRUCT_CHUNK_SIZE = 5;
export const DECONSTRUCT_CHUNK_PAUSE_MS = 3000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Retry schedule for transient infrastructure failures (ms between attempts). */
const TRANSIENT_RETRY_DELAYS_MS = [1000, 3000, 8000] as const;

/**
 * True for failures that are infrastructure, not data — worth retrying.
 *
 * The motivating case is Cloudflare 525 (SSL handshake failed between the edge
 * and the Supabase origin), which resolves on its own within seconds but
 * returns an HTML error page. supabase-js surfaces that as an opaque fetch or
 * JSON-parse failure rather than a status code, so the HTML signature is
 * matched explicitly alongside the usual gateway and socket errors.
 *
 * Deliberately conservative: anything not recognised here is treated as a real
 * data or model error and is NOT retried.
 */
export function isTransientInfraError(err: unknown): boolean {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  const status = (err as { status?: number } | null)?.status;
  if (typeof status === "number" && [408, 425, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 527, 530].includes(status)) {
    return true;
  }
  return [
    "fetch failed",
    "network error",
    "socket hang up",
    "econnreset",
    "econnrefused",
    "etimedout",
    "epipe",
    "eai_again",
    "und_err",
    "terminated",
    "handshake",
    "gateway",
    "service unavailable",
    "too many requests",
    // Cloudflare / proxy HTML error pages arriving where JSON was expected
    "unexpected token '<'",
    "<!doctype",
    "cloudflare",
  ].some((needle) => message.includes(needle));
}

/**
 * Runs `fn`, retrying transient infrastructure failures with backoff.
 * Non-transient errors throw immediately — a bad file should not be retried
 * three times before it fails.
 */
async function withTransientRetry<T>(
  fn: () => Promise<T>,
  ctx: { accountId: string; runId: string; filename: string; step: string },
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= TRANSIENT_RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const delay = TRANSIENT_RETRY_DELAYS_MS[attempt];
      if (delay === undefined || !isTransientInfraError(err)) throw err;
      logger.warn(
        { ...ctx, attempt: attempt + 1, delayMs: delay, err },
        "Transient infrastructure error during deconstruction — retrying",
      );
      await sleep(delay);
    }
  }
  throw lastErr;
}

/**
 * Pure selection rule for the bulk backfill: an import needs classification
 * when it has no deconstruction row at all, or its only row is 'discarded'.
 * Everything else (auto_filed, needs_review, user_overridden, unsupported)
 * already has a non-discarded classification and is left alone.
 */
export function selectUnclassifiedImportIds(
  imports: Array<{ id: string }>,
  deconstructions: Array<{ manual_import_id: string; status: string }>,
): string[] {
  const byImport = new Map(deconstructions.map((d) => [String(d.manual_import_id), String(d.status)]));
  return imports
    .map((i) => String(i.id))
    .filter((id) => {
      const status = byImport.get(id);
      return status === undefined || status === "discarded";
    });
}

/**
 * Bulk backfill: classify every creative_asset manual import on the account
 * that has no non-discarded classification. Returns the run id and the
 * number of targeted imports. Throws 409 when nothing needs classification.
 */
export async function startCreativeDeconstructionBackfill(
  accountId: string,
  createdBy: string,
): Promise<{ runId: string; total: number }> {
  const supabase = getSupabase();
  const [{ data: imports, error: impErr }, { data: decs, error: decErr }] = await Promise.all([
    supabase
      .from("manual_imports")
      .select("id")
      .eq("account_id", accountId)
      .eq("kind", "creative_asset"),
    supabase
      .from("creative_deconstructions")
      .select("manual_import_id, status")
      .eq("account_id", accountId),
  ]);
  if (impErr) throw new Error(impErr.message);
  if (decErr) throw new Error(decErr.message);

  const targets = selectUnclassifiedImportIds(
    (imports ?? []) as Array<{ id: string }>,
    (decs ?? []) as Array<{ manual_import_id: string; status: string }>,
  );
  if (targets.length === 0) {
    throw new GenerationError("Every uploaded creative on this account already has a classification.", 409);
  }
  const runId = await startCreativeDeconstruction(accountId, createdBy, targets);
  return { runId, total: targets.length };
}

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
      // Progress meter: n of m, updated after each import commits.
      const total = imports.length;
      try {
        await setRunProgress(runId, 0, total);
      } catch (progressErr) {
        logger.warn({ accountId, runId, err: progressErr }, "Could not initialize run progress");
      }
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
      let done = 0;
      const noteDone = async () => {
        done += 1;
        try {
          await setRunProgress(runId, done, total);
        } catch (progressErr) {
          logger.warn({ accountId, runId, err: progressErr }, "Could not update run progress");
        }
        // Rate-limit pacing: pause between chunks so bulk backfills don't
        // flood the model API (calls are already strictly sequential).
        if (done < total && done % DECONSTRUCT_CHUNK_SIZE === 0) {
          await sleep(DECONSTRUCT_CHUNK_PAUSE_MS);
        }
      };

      // Per-import failures are isolated: one bad file (or one transient
      // Supabase/Cloudflare blip that outlives its retries) must not abandon
      // the other 64 files in the batch. Failures are collected and reported
      // together once every processable import has been attempted.
      const failures: Array<{ filename: string; message: string }> = [];

      for (const imp of imports) {
        const importId = String(imp["id"]);
        const filename = String(imp["filename"]);
        // Set the moment noteDone() runs for this import, so the catch below
        // can tell "threw before we counted it" from "threw after".
        let counted = false;
        try {
          const adNames: string[] = Array.isArray(imp["ad_names"]) ? imp["ad_names"].map(String) : [];
          const adRows = adNames.map((n) => adByName.get(n)).filter((a): a is Row => Boolean(a));
          const mediaType = supportedImageMediaType(imp["content_type"] as string | null, filename);

          const base: Row = {
            generation_run_id: runId,
            filename,
            ad_names: adNames,
            model: GENERATION_MODEL,
          };

          // Video creatives are classified via extracted keyframes fed through
          // the same image pipeline. Only truly unknown formats (and videos
          // ffmpeg cannot decode) stay unsupported.
          let videoFrames: Array<{ label: string; jpeg: Buffer }> | null = null;
          if (!mediaType && isVideoCreative(imp["content_type"] as string | null, filename)) {
            try {
              videoFrames = await extractVideoKeyframes(decodeStagedBytes(String(imp["content"])), filename);
            } catch (frameErr) {
              logger.warn({ accountId, importId, filename, err: frameErr }, "Video keyframe extraction failed");
              videoFrames = null;
            }
          }

          if (!mediaType && !videoFrames) {
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
            await noteDone();
            continue;
          }

          const brief = findBrief(adRows);
          const briefIntended = brief ? briefIntendedVariables(brief.payload) : null;

          // ── Model call: no writes have happened for this import yet. ──
          const imageBlocks: Array<Record<string, unknown>> = videoFrames
            ? videoFrames.map((f) => ({
                type: "image",
                source: { type: "base64", media_type: "image/jpeg", data: f.jpeg.toString("base64") },
              }))
            : [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: mediaType!,
                    data: decodeStagedBytes(String(imp["content"])).toString("base64"),
                  },
                },
              ];
          const content: ModelContent = [
            ...imageBlocks,
            {
              type: "text",
              text: deconstructionPrompt({
                accountName,
                filename,
                adContexts: adRows,
                briefIntended,
                registryFamilies,
                videoFrameLabels: videoFrames ? videoFrames.map((f) => f.label) : null,
              }),
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
          await withTransientRetry(
            () =>
              commitReplacement(
                accountId,
                importId,
                classification,
                filing?.cellId ?? null,
                filing?.libraryRow ?? null,
              ),
            { accountId, runId, filename, step: "commit" },
          );
          await noteDone();
        } catch (importErr) {
          // Isolated: record and move on. Everything already committed for
          // earlier imports stays valid (each commit is atomic per import).
          const message = importErr instanceof Error ? importErr.message : String(importErr);
          logger.error({ accountId, runId, importId, filename, err: importErr }, "Creative deconstruction failed for one import");
          failures.push({ filename, message });
          // `done` is incremented unconditionally inside noteDone(), so calling
          // it here after a throw that happened *past* a successful noteDone()
          // would double-count progress. Guard on the per-import flag rather
          // than reasoning about which line threw.
          if (!counted) await noteDone();
        }
      }

      if (failures.length === 0) {
        await finishRun(runId, "success");
        invalidateMetrixSeedCache();
        logger.info({ accountId, runId, count: imports.length }, "Creative deconstruction succeeded");
      } else {
        // Honest partial outcome: the run did not fully succeed, and the
        // message names exactly what to re-run. Successful classifications are
        // already committed and are not rolled back.
        const succeeded = imports.length - failures.length;
        const named = failures.slice(0, 5).map((f) => f.filename).join(", ");
        const more = failures.length > 5 ? ` and ${failures.length - 5} more` : "";
        await finishRun(
          runId,
          "error",
          `${succeeded} of ${imports.length} creatives classified. ` +
            `${failures.length} failed: ${named}${more}. ` +
            `The successful classifications were saved — re-run deconstruction on the failed files only. ` +
            `First error: ${failures[0]!.message}`,
        );
        invalidateMetrixSeedCache();
        logger.warn({ accountId, runId, succeeded, failed: failures.length }, "Creative deconstruction completed with failures");
      }
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
    throw new GenerationError("Unsupported files have no classification to review — re-run deconstruction on them instead.", 422);
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

/** True when the upload is a video creative (classified via extracted keyframes). */
export function isVideoCreative(contentType: string | null | undefined, filename: string): boolean {
  const ct = String(contentType ?? "").toLowerCase().split(";")[0]!.trim();
  if (ct.startsWith("video/")) return true;
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  return VIDEO_EXTENSIONS.has(ext);
}
