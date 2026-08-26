// ─── /metrix accounts routes ───────────────────────────────────────────
// Split out of routes/metrix.ts (E5) — a pure move. Routes appear here in
// their ORIGINAL registration order, and index.ts mounts the routers in
// the original order too, so Express matching is unchanged.

import { Router, type IRouter } from "express";
import { SetAccountObjectivesResponse, StageManualImportBody, StageManualImportResponse } from "@workspace/api-zod";
import { and, count, eq } from "drizzle-orm";
import { requireAuth } from "../../middlewares/requireAuth";
import { invalidateMetrixSeedCache } from "../../lib/metrixSeedAssembly";
import { createHash } from "node:crypto";
import { getSupabase } from "../../lib/supabase";
import { IapCsvFormatError } from "../../lib/iapCsvParser";
import { creativeAssetTypeMismatch, type CreativeLinkResult } from "../../lib/creativeAssetType";
import {
  userHasAccountAccess,
  syncCreativeAssetLinks,
  MAX_MANUAL_IMPORT_BYTES,
  BASE64_RE,
  PerformanceCsvValidation,
  validatePerformanceCsvUpload,
  findStagedByteDuplicate,
} from "./shared";
const OBJECTIVE_KEYS = ["ecommerce", "lead_gen", "service", "app"] as const;

const router: IRouter = Router();


// Replaces the account's full objectives set (one-or-more of the four
// keys). Objectives are configured ONLY here (via Settings → General as
// part of account setup) — the analysis run reads them, never writes them.
// Validation stays as strict as the old single-cohort check: non-empty
// array, known keys only, no duplicates.
router.patch("/metrix/accounts/:accountId/objectives", requireAuth, async (req, res) => {
  const accountId = String(req.params["accountId"]);
  const objectives = req.body?.["objectives"];
  const valid =
    Array.isArray(objectives) &&
    objectives.length > 0 &&
    objectives.every((o) => (OBJECTIVE_KEYS as readonly string[]).includes(o)) &&
    new Set(objectives).size === objectives.length;
  if (!valid) {
    res.status(400).json({
      message: `objectives must be a non-empty list of distinct values from: ${OBJECTIVE_KEYS.join(", ")}.`,
    });
    return;
  }
  // Canonical order, independent of click order.
  const normalized = OBJECTIVE_KEYS.filter((k) => (objectives as string[]).includes(k));
  const user = req.authUser!;
  if (user.role !== "admin" && !(await userHasAccountAccess(user.id, accountId))) {
    res.status(403).json({ message: "You don't have access to this ad account." });
    return;
  }
  try {
    const supabase = getSupabase();
    // Keep the legacy scalar column in lockstep (first objective) so any
    // reader not yet migrated to the set never sees a stale value.
    const update = await supabase
      .from("ad_accounts")
      .update({ objectives: normalized, cohort: normalized[0] })
      .eq("id", accountId)
      .select("id");
    if (update.error) throw new Error(update.error.message);
    if (!update.data || update.data.length === 0) {
      res.status(404).json({ message: "Ad account not found." });
      return;
    }
    invalidateMetrixSeedCache();
    req.log.info({ accountId, objectives: normalized }, "Ad account objectives set");
    res.json(SetAccountObjectivesResponse.parse({ account_id: accountId, objectives: normalized }));
  } catch (err) {
    req.log.error({ err, accountId }, "Failed to set account objectives");
    res.status(502).json({
      message: err instanceof Error ? err.message : "Could not set the account's objectives.",
    });
  }
});


router.post("/metrix/accounts/:accountId/manual-imports", requireAuth, async (req, res) => {
  const accountId = String(req.params["accountId"]);
  const parsed = StageManualImportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      message: "A file kind (performance_csv or creative_library), filename, and base64 content are required.",
    });
    return;
  }
  const user = req.authUser!;

  try {
    if (user.role !== "admin" && !(await userHasAccountAccess(user.id, accountId))) {
      res.status(403).json({ message: "You don't have access to this ad account." });
      return;
    }

    const supabase = getSupabase();
    const account = await supabase
      .from("ad_accounts")
      .select("id")
      .eq("id", accountId)
      .limit(1);
    if (account.error) throw new Error(account.error.message);
    if (!account.data || account.data.length === 0) {
      res.status(404).json({ message: "Ad account not found." });
      return;
    }

    if (parsed.data.kind !== "creative_asset" && parsed.data.ad_names && parsed.data.ad_names.length > 0) {
      res.status(400).json({ message: "ad_names is only valid for creative_asset uploads." });
      return;
    }

    const b64 = parsed.data.content_base64.replace(/\s/g, "");
    if (!BASE64_RE.test(b64)) {
      res.status(400).json({ message: "File content is not valid base64." });
      return;
    }
    const content = Buffer.from(b64, "base64");
    if (content.length === 0) {
      res.status(400).json({ message: "The uploaded file is empty." });
      return;
    }
    if (content.length > MAX_MANUAL_IMPORT_BYTES) {
      res.status(413).json({ message: "File is too large — the limit is 75 MB." });
      return;
    }

    // ── Upload-time validation ────────────────────────────────────────
    // The two performance CSVs are validated against their exact Meta pivot
    // export template NOW, so a malformed file is rejected at upload instead
    // of silently failing later at analysis-run time. Validation only checks
    // shape — no performance numbers are stored or fabricated from the parse.
    // Performance exports arrive as CSV (preferred, matches Meta's native
    // export) or XLSX (common when a client/agency round-trips the export
    // through Excel or Google Sheets first) — validatePerformanceCsvUpload
    // detects by content and runs the identical parse/mapping cascade either
    // way, and is shared verbatim with the chunked-upload complete route.
    let csvMappingSummary: PerformanceCsvValidation["mappingSummary"];
    let csvUploadWarnings: string[] | undefined;
    try {
      const validation = await validatePerformanceCsvUpload(parsed.data.kind, parsed.data.filename, content);
      csvMappingSummary = validation.mappingSummary;
      csvUploadWarnings = validation.uploadWarnings;
    } catch (err) {
      if (err instanceof IapCsvFormatError) {
        res.status(422).json({ message: err.message });
        return;
      }
      throw err;
    }

    // Creative files are checked for a filename-extension / real-content
    // mismatch (e.g. a video renamed .png), which would otherwise render as
    // a broken image. Only a proven contradiction is rejected.
    if (parsed.data.kind === "creative_asset") {
      const mismatch = creativeAssetTypeMismatch(parsed.data.filename, content);
      if (mismatch) {
        res.status(422).json({ message: mismatch });
        return;
      }
    }

    // ── Same-bytes duplicate guard ────────────────────────────────────
    // Staging the byte-identical file twice into the same slot while both
    // are status='staged' is always an error: the analysis run merges every
    // staged file per slot, so the duplicate's rows would silently
    // double-count spend/results. Different-bytes files per slot stay legal
    // (multi-file-per-slot covers disjoint windows), and re-staging a file a
    // previous run already consumed (status='processed') stays legal — this
    // guard only compares against currently-staged rows.
    const contentMd5 = createHash("md5").update(content).digest("hex");
    const duplicate = await findStagedByteDuplicate(accountId, parsed.data.kind, contentMd5);
    if (duplicate) {
      res.status(409).json({
        message:
          `This exact file is already staged for this slot as "${duplicate.filename}". ` +
          `Running analysis with both copies would double-count its rows. ` +
          `Remove the staged copy first if you meant to replace it.`,
      });
      return;
    }

    // Staged only: the file is stored raw for the analysis pipeline. It is
    // never parsed into performance data at upload time — no fabricated
    // numbers appear in the app from an upload alone.
    const insert = await supabase
      .from("manual_imports")
      .insert({
        account_id: accountId,
        kind: parsed.data.kind,
        filename: parsed.data.filename,
        content_type: parsed.data.content_type ?? null,
        content: `\\x${content.toString("hex")}`,
        content_md5: contentMd5,
        size_bytes: content.length,
        ad_names: parsed.data.kind === "creative_asset" ? (parsed.data.ad_names ?? []) : [],
        match_method: parsed.data.kind === "creative_asset" ? (parsed.data.match_method ?? null) : null,
        uploaded_by_user_id: user.id,
        uploaded_by_email: user.email,
        ...(csvMappingSummary ? { mapping_summary: csvMappingSummary } : {}),
      })
      .select("id")
      .single();
    if (insert.error) throw new Error(insert.error.message);

    const importId = String(insert.data["id"]);
    let linkResult: CreativeLinkResult | null = null;
    if (parsed.data.kind === "creative_asset" && (parsed.data.ad_names?.length ?? 0) > 0) {
      linkResult = await syncCreativeAssetLinks(accountId, importId, parsed.data.filename, [], parsed.data.ad_names!);
    }

    req.log.info(
      { accountId, kind: parsed.data.kind, filename: parsed.data.filename, sizeBytes: content.length },
      "Manual import staged",
    );
    res.json(
      StageManualImportResponse.parse({
        status: "staged",
        import_id: String(insert.data["id"]),
        filename: parsed.data.filename,
        size_bytes: content.length,
        note: "File staged for the analysis pipeline. Performance data appears only after an analysis run processes it — nothing is parsed or fabricated at upload time.",
        ...(csvMappingSummary ? { mapping_summary: csvMappingSummary } : {}),
        ...(csvUploadWarnings ? { upload_warnings: csvUploadWarnings } : {}),
        ...(linkResult
          ? { link_result: { matched: linkResult.matched, unmatched: linkResult.unmatched } }
          : {}),
      }),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to stage manual import");
    res.status(502).json({
      message: err instanceof Error ? err.message : "Could not stage the uploaded file.",
    });
  }
});

export default router;
