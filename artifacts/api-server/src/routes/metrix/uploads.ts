// ─── /metrix uploads routes ───────────────────────────────────────────
// Split out of routes/metrix.ts (E5) — a pure move. Routes appear here in
// their ORIGINAL registration order, and index.ts mounts the routers in
// the original order too, so Express matching is unchanged.

import { Router, type IRouter, type Response } from "express";
import {
  StageManualImportResponse,
  ListManualImportsResponse,
  UpdateManualImportAdNamesBody,
  UpdateManualImportAdNamesResponse,
  RestageManualImportsForRunResponse,
} from "@workspace/api-zod";
import { and, count, eq } from "drizzle-orm";
import { requireAuth } from "../../middlewares/requireAuth";
import { createHash } from "node:crypto";
import { deleteDerivedLibraryEntries, classifyCellCreative, fileCellCreativeOverride } from "../../lib/deconstructionEngine";
import { getSupabase } from "../../lib/supabase";
import { restageImportsForRun, loadImportContentBuffer } from "../../lib/analysisEngine";
import { IapCsvFormatError } from "../../lib/iapCsvParser";
import {
  userHasAccountAccess,
  syncCreativeAssetLinks,
  BASE64_RE,
  PerformanceCsvValidation,
  validatePerformanceCsvUpload,
  findStagedByteDuplicate,
} from "./shared";
import { getCreativeFile, type CreativeFile } from "../../lib/creativeFileCache";
import { resolveServedAsset, isInlineVideo } from "../../lib/assetContentType";
// Staged-file bytes are served through lib/creativeFileCache, which owns
// both the performance behaviour (TTL cache + in-flight coalescing) and the
// tenancy rule that makes its key (account, import) rather than import
// alone. Read that module's header before touching either.
async function fetchAndCacheCreativeFile(
  importId: string,
  accountId: string,
): Promise<CreativeFile> {
  return getCreativeFile(accountId, importId, async () => {
    const supabase = getSupabase();
    const result = await supabase
      .from("manual_imports")
      .select("id, content_type, content, filename")
      .eq("id", importId)
      .eq("account_id", accountId)
      .limit(1);
    if (result.error) throw new Error(result.error.message);
    if (!result.data || result.data.length === 0) throw Object.assign(new Error("not_found"), { code: "not_found" });
    const row = result.data[0]!;
    // Chunk-aware: large chunked imports store NULL inline content and their
    // bytes in manual_import_chunks — loadImportContentBuffer handles both.
    const buf = await loadImportContentBuffer(row);
    const contentType = (row["content_type"] as string | null) ?? "application/octet-stream";
    return { buf, contentType, filename: (row["filename"] as string | null) ?? null };
  });
}

/**
 * Links a staged creative_asset import to real ad rows in `ads` so the
 * uploaded file becomes visible everywhere creatives render (CreativeCard,
 * primaryAdForCell), not just inside the upload dialog. Only ever UPDATEs
 * existing `ads` rows matched by (account_id, ad_name) — never inserts a
 * fabricated ad. Names removed from the mapping are unlinked only if they
 * still point at this exact import's URL (so we never clobber a different
 * import's mapping).
 */
const MAX_CELL_CREATIVE_BYTES = 8 * 1024 * 1024;
// ── Chunked upload limits ─────────────────────────────────────────────
// Large performance exports can't arrive in one request: the deployment
// proxy rejects big request bodies before they ever reach Express (a bare
// 413 with no JSON message — observed live on a ~40 MB placement CSV), and
// the single-request path's own memory profile is what capped
// MAX_MANUAL_IMPORT_BYTES at 75 MB (see the note above). Chunked uploads
// sidestep both: each request stays small, and the file is stored as
// per-chunk bytea rows (manual_import_chunks) so no single PostgREST
// payload ever carries the whole file either.
export const MAX_CHUNKED_IMPORT_BYTES = 150 * 1024 * 1024;

const MAX_UPLOAD_CHUNK_BYTES = 16 * 1024 * 1024;
const MAX_UPLOAD_CHUNKS = 64;
function publicErrorMessage(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : "";
  if (!raw) return fallback;
  if (/<\s*(!doctype|html|head|body)/i.test(raw) || raw.length > 300) {
    return "The database is temporarily unavailable — wait a moment and try again.";
  }
  if (/statement timeout/i.test(raw)) {
    return "The database took too long to respond — try again; the upload resumes from where it left off.";
  }
  return raw;
}

/** Returns the already-staged import that byte-matches (same md5) this
 *  upload in the same slot, or null. See the same-bytes duplicate guard. */
async function findUploadingImport(
  accountId: string,
  importId: string,
  res: Response,
): Promise<{ id: string; kind: string; filename: string; size_bytes: number } | null> {
  const supabase = getSupabase();
  const rowRes = await supabase
    .from("manual_imports")
    .select("id, kind, filename, size_bytes, status")
    .eq("id", importId)
    .eq("account_id", accountId)
    .limit(1);
  if (rowRes.error) throw new Error(rowRes.error.message);
  const row = rowRes.data?.[0];
  if (!row || String(row["status"]) !== "uploading") {
    res.status(404).json({ message: "Upload session not found. Start the upload again." });
    return null;
  }
  return {
    id: String(row["id"]),
    kind: String(row["kind"]),
    filename: String(row["filename"]),
    size_bytes: Number(row["size_bytes"]),
  };
}

const router: IRouter = Router();


// ── Chunked upload (large performance report files) ────────────────────
// Three-step flow for files the single-request path can't carry (the
// deployment proxy rejects large bodies with a bare 413 before Express
// ever sees them): init → PUT chunks → complete. The complete step runs
// the exact same validation as single-request staging, so a file gets the
// identical mapping report and duplicate guard regardless of transport.

router.post("/metrix/accounts/:accountId/manual-imports/uploads", requireAuth, async (req, res) => {
  const accountId = String(req.params["accountId"]);
  const { z } = await import("zod/v4");
  const Body = z.object({
    kind: z.enum(["performance_demo_csv", "performance_placement_csv", "performance_ad_summary_csv", "performance_conversion_device_csv"]),
    filename: z.string().min(1),
    content_type: z.string().nullish(),
    size_bytes: z.number().int().positive(),
    chunk_count: z.number().int().positive(),
  });
  const parsed = Body.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "kind (a performance report kind), filename, size_bytes, and chunk_count are required." });
    return;
  }
  const user = req.authUser!;
  try {
    if (user.role !== "admin" && !(await userHasAccountAccess(user.id, accountId))) {
      res.status(403).json({ message: "You don't have access to this ad account." });
      return;
    }
    const supabase = getSupabase();
    const account = await supabase.from("ad_accounts").select("id").eq("id", accountId).limit(1);
    if (account.error) throw new Error(account.error.message);
    if (!account.data || account.data.length === 0) {
      res.status(404).json({ message: "Ad account not found." });
      return;
    }
    if (parsed.data.size_bytes > MAX_CHUNKED_IMPORT_BYTES) {
      res.status(400).json({ message: "File is too large — the limit is 150 MB." });
      return;
    }
    if (parsed.data.chunk_count > MAX_UPLOAD_CHUNKS) {
      res.status(400).json({ message: `Too many chunks — send at most ${MAX_UPLOAD_CHUNKS}.` });
      return;
    }

    // Opportunistic cleanup: abandoned upload sessions (browser closed
    // mid-transfer) never complete, so sweep this account's stale ones here
    // rather than leaving orphaned chunk bytes behind forever.
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await supabase
      .from("manual_imports")
      .delete()
      .eq("account_id", accountId)
      .eq("status", "uploading")
      .lt("created_at", cutoff);
    // A retried upload of the same file supersedes its own failed session
    // immediately — chunks cascade-delete with the row.
    await supabase
      .from("manual_imports")
      .delete()
      .eq("account_id", accountId)
      .eq("status", "uploading")
      .eq("kind", parsed.data.kind)
      .eq("filename", parsed.data.filename);

    const insert = await supabase
      .from("manual_imports")
      .insert({
        account_id: accountId,
        kind: parsed.data.kind,
        filename: parsed.data.filename,
        content_type: parsed.data.content_type ?? null,
        content: null,
        size_bytes: parsed.data.size_bytes,
        ad_names: [],
        status: "uploading",
        uploaded_by_user_id: user.id,
        uploaded_by_email: user.email,
      })
      .select("id")
      .single();
    if (insert.error) throw new Error(insert.error.message);
    res.json({
      status: "uploading",
      import_id: String(insert.data["id"]),
      max_chunk_bytes: MAX_UPLOAD_CHUNK_BYTES,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to init chunked manual import upload");
    res.status(502).json({ message: publicErrorMessage(err, "Could not start the upload.") });
  }
});

/** Fetches an 'uploading' import row scoped to this account, or responds 404 and returns null. */


router.put(
  "/metrix/accounts/:accountId/manual-imports/uploads/:importId/chunks/:chunkIndex",
  requireAuth,
  async (req, res) => {
    const accountId = String(req.params["accountId"]);
    const importId = String(req.params["importId"]);
    const chunkIndex = Number(req.params["chunkIndex"]);
    const user = req.authUser!;
    try {
      if (user.role !== "admin" && !(await userHasAccountAccess(user.id, accountId))) {
        res.status(403).json({ message: "You don't have access to this ad account." });
        return;
      }
      if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= MAX_UPLOAD_CHUNKS) {
        res.status(400).json({ message: "Invalid chunk index." });
        return;
      }
      const b64raw = (req.body as { content_base64?: unknown })?.content_base64;
      const b64 = typeof b64raw === "string" ? b64raw.replace(/\s/g, "") : "";
      if (!b64 || !BASE64_RE.test(b64)) {
        res.status(400).json({ message: "Chunk content is not valid base64." });
        return;
      }
      const chunk = Buffer.from(b64, "base64");
      if (chunk.length === 0 || chunk.length > MAX_UPLOAD_CHUNK_BYTES) {
        res.status(400).json({ message: `Each chunk must be between 1 byte and ${MAX_UPLOAD_CHUNK_BYTES} bytes.` });
        return;
      }
      const upload = await findUploadingImport(accountId, importId, res);
      if (!upload) return;
      const supabase = getSupabase();
      const upsert = await supabase
        .from("manual_import_chunks")
        .upsert(
          { import_id: importId, chunk_index: chunkIndex, content: `\\x${chunk.toString("hex")}` },
          { onConflict: "import_id,chunk_index" },
        );
      if (upsert.error) throw new Error(upsert.error.message);
      res.json({ status: "ok", chunk_index: chunkIndex });
    } catch (err) {
      req.log.error({ err }, "Failed to store manual import chunk");
      res.status(502).json({ message: publicErrorMessage(err, "Could not store the chunk.") });
    }
  },
);


router.post(
  "/metrix/accounts/:accountId/manual-imports/uploads/:importId/complete",
  requireAuth,
  async (req, res) => {
    const accountId = String(req.params["accountId"]);
    const importId = String(req.params["importId"]);
    const user = req.authUser!;
    try {
      if (user.role !== "admin" && !(await userHasAccountAccess(user.id, accountId))) {
        res.status(403).json({ message: "You don't have access to this ad account." });
        return;
      }
      const upload = await findUploadingImport(accountId, importId, res);
      if (!upload) return;
      const supabase = getSupabase();

      const discardSession = async (): Promise<void> => {
        // Chunks cascade-delete with the row.
        await supabase.from("manual_imports").delete().eq("id", importId);
      };

      let content: Buffer;
      try {
        content = await loadImportContentBuffer({ id: importId, content: null });
      } catch {
        await discardSession();
        res.status(422).json({ message: "Some chunks never arrived — the upload was discarded. Try again." });
        return;
      }
      if (content.length === 0 || content.length > MAX_CHUNKED_IMPORT_BYTES) {
        await discardSession();
        res.status(422).json({ message: "The assembled file is empty or over the 150 MB limit — the upload was discarded." });
        return;
      }
      if (content.length !== upload.size_bytes) {
        await discardSession();
        res.status(422).json({
          message: `The assembled file is ${content.length} bytes but ${upload.size_bytes} were announced — a chunk is missing or duplicated. The upload was discarded; try again.`,
        });
        return;
      }

      const contentMd5 = createHash("md5").update(content).digest("hex");
      const duplicate = await findStagedByteDuplicate(accountId, upload.kind, contentMd5);
      if (duplicate) {
        await discardSession();
        res.status(409).json({
          message:
            `This exact file is already staged for this slot as "${duplicate.filename}". ` +
            `Running analysis with both copies would double-count its rows. ` +
            `Remove the staged copy first if you meant to replace it.`,
        });
        return;
      }

      let validation: PerformanceCsvValidation;
      try {
        validation = await validatePerformanceCsvUpload(upload.kind, upload.filename, content);
      } catch (err) {
        if (err instanceof IapCsvFormatError) {
          await discardSession();
          res.status(422).json({ message: err.message });
          return;
        }
        throw err;
      }

      const update = await supabase
        .from("manual_imports")
        .update({
          status: "staged",
          content_md5: contentMd5,
          size_bytes: content.length,
          ...(validation.mappingSummary ? { mapping_summary: validation.mappingSummary } : {}),
          // Same persistence as the single-request path: warnings outlive the
          // dialog. [] means validated-and-clean; NULL means never validated.
          ...(validation.mappingSummary ? { upload_warnings: validation.uploadWarnings ?? [] } : {}),
        })
        .eq("id", importId)
        .eq("status", "uploading");
      if (update.error) throw new Error(update.error.message);

      req.log.info(
        { accountId, kind: upload.kind, filename: upload.filename, sizeBytes: content.length, chunked: true },
        "Manual import staged (chunked)",
      );
      res.json(
        StageManualImportResponse.parse({
          status: "staged",
          import_id: importId,
          filename: upload.filename,
          size_bytes: content.length,
          note: "File staged for the analysis pipeline. Performance data appears only after an analysis run processes it — nothing is parsed or fabricated at upload time.",
          ...(validation.mappingSummary ? { mapping_summary: validation.mappingSummary } : {}),
          ...(validation.uploadWarnings ? { upload_warnings: validation.uploadWarnings } : {}),
        }),
      );
    } catch (err) {
      req.log.error({ err }, "Failed to complete chunked manual import upload");
      res.status(502).json({ message: publicErrorMessage(err, "Could not finish the upload.") });
    }
  },
);


router.get("/metrix/accounts/:accountId/manual-imports", requireAuth, async (req, res) => {
  const accountId = String(req.params["accountId"]);
  const user = req.authUser!;
  try {
    if (user.role !== "admin" && !(await userHasAccountAccess(user.id, accountId))) {
      res.status(403).json({ message: "You don't have access to this ad account." });
      return;
    }
    const supabase = getSupabase();
    const account = await supabase.from("ad_accounts").select("id").eq("id", accountId).limit(1);
    if (account.error) throw new Error(account.error.message);
    if (!account.data || account.data.length === 0) {
      res.status(404).json({ message: "Ad account not found." });
      return;
    }
    const { data, error } = await supabase
      .from("manual_imports")
      .select("id, account_id, kind, filename, content_type, size_bytes, ad_names, match_method, status, manual_analysis_run_id, created_at, mapping_summary, upload_warnings")
      .neq("status", "uploading")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    res.json(
      ListManualImportsResponse.parse({
        imports: (data ?? []).map((r) => ({
          id: String(r["id"]),
          account_id: String(r["account_id"]),
          kind: r["kind"],
          filename: r["filename"],
          content_type: r["content_type"] ?? null,
          size_bytes: r["size_bytes"],
          ad_names: r["ad_names"] ?? [],
          match_method: r["match_method"] ?? null,
          status: r["status"],
          manual_analysis_run_id: r["manual_analysis_run_id"] ?? null,
          created_at: String(r["created_at"]),
          mapping_summary: r["mapping_summary"] ?? null,
          // `?? null` is correct here and NOT a coalesce-to-empty: a NULL
          // column means the warnings were never recorded, which is a
          // different claim from "validation found none" ([]).
          upload_warnings: r["upload_warnings"] ?? null,
        })),
      }),
    );
  } catch (err) {
    req.log.error({ err, accountId }, "Failed to list manual imports");
    res.status(502).json({
      message: err instanceof Error ? err.message : "Could not list staged imports.",
    });
  }
});


router.post("/metrix/accounts/:accountId/manual-imports/restage-run/:runId", requireAuth, async (req, res) => {
  const accountId = String(req.params["accountId"]);
  const runId = String(req.params["runId"]);
  const user = req.authUser!;
  try {
    if (user.role !== "admin" && !(await userHasAccountAccess(user.id, accountId))) {
      res.status(403).json({ message: "You don't have access to this ad account." });
      return;
    }
    const supabase = getSupabase();
    const account = await supabase.from("ad_accounts").select("id").eq("id", accountId).limit(1);
    if (account.error) throw new Error(account.error.message);
    if (!account.data || account.data.length === 0) {
      res.status(404).json({ message: "Ad account not found." });
      return;
    }
    const restaged = await restageImportsForRun(accountId, runId);
    req.log.info({ accountId, runId, restaged }, "Restaged manual imports from a past analysis run");
    res.json(RestageManualImportsForRunResponse.parse({ restaged }));
  } catch (err) {
    req.log.error({ err, accountId, runId }, "Failed to restage manual imports");
    res.status(502).json({
      message: err instanceof Error ? err.message : "Could not restage the imports for this run.",
    });
  }
});


router.patch("/metrix/accounts/:accountId/manual-imports/:importId", requireAuth, async (req, res) => {
  const accountId = String(req.params["accountId"]);
  const importId = String(req.params["importId"]);
  const parsed = UpdateManualImportAdNamesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "ad_names must be an array of strings." });
    return;
  }
  const user = req.authUser!;
  try {
    if (user.role !== "admin" && !(await userHasAccountAccess(user.id, accountId))) {
      res.status(403).json({ message: "You don't have access to this ad account." });
      return;
    }
    const supabase = getSupabase();
    const existing = await supabase
      .from("manual_imports")
      .select("id, kind, filename, ad_names")
      .eq("id", importId)
      .eq("account_id", accountId)
      .limit(1);
    if (existing.error) throw new Error(existing.error.message);
    if (!existing.data || existing.data.length === 0) {
      res.status(404).json({ message: "Staged import not found." });
      return;
    }
    if (existing.data[0]!["kind"] !== "creative_asset") {
      res.status(400).json({ message: "Only creative asset uploads have an editable ad-name mapping." });
      return;
    }
    const previousAdNames: string[] = existing.data[0]!["ad_names"] ?? [];
    // match_method is only ever persisted when the caller explicitly passes
    // it back unmodified (still equal to the auto-suggested value) — any
    // other save (dropdown pick, free-text edit) omits it, which clears the
    // stored reason so it never lies about a manually-picked mapping.
    const { data, error } = await supabase
      .from("manual_imports")
      .update({ ad_names: parsed.data.ad_names, match_method: parsed.data.match_method ?? null })
      .eq("id", importId)
      .select("id, account_id, kind, filename, content_type, size_bytes, ad_names, match_method, status, created_at")
      .single();
    if (error) throw new Error(error.message);

    const linkResult = await syncCreativeAssetLinks(
      accountId,
      importId,
      existing.data[0]!["filename"],
      previousAdNames,
      parsed.data.ad_names,
    );

    res.json(
      UpdateManualImportAdNamesResponse.parse({
        id: String(data["id"]),
        account_id: String(data["account_id"]),
        kind: data["kind"],
        filename: data["filename"],
        content_type: data["content_type"] ?? null,
        size_bytes: data["size_bytes"],
        ad_names: data["ad_names"] ?? [],
        match_method: data["match_method"] ?? null,
        status: data["status"],
        created_at: String(data["created_at"]),
        link_result: { matched: linkResult.matched, unmatched: linkResult.unmatched },
      }),
    );
  } catch (err) {
    req.log.error({ err, accountId, importId }, "Failed to update manual import ad names");
    res.status(502).json({
      message: err instanceof Error ? err.message : "Could not update the ad-name mapping.",
    });
  }
});


router.delete("/metrix/accounts/:accountId/manual-imports/:importId", requireAuth, async (req, res) => {
  const accountId = String(req.params["accountId"]);
  const importId = String(req.params["importId"]);
  const user = req.authUser!;
  try {
    if (user.role !== "admin" && !(await userHasAccountAccess(user.id, accountId))) {
      res.status(403).json({ message: "You don't have access to this ad account." });
      return;
    }
    const supabase = getSupabase();
    const existing = await supabase
      .from("manual_imports")
      .select("id, kind, ad_names")
      .eq("id", importId)
      .eq("account_id", accountId)
      .limit(1);
    if (existing.error) throw new Error(existing.error.message);
    if (!existing.data || existing.data.length === 0) {
      res.status(404).json({ message: "Staged import not found." });
      return;
    }
    if (existing.data[0]!["kind"] === "creative_asset") {
      const adNames: string[] = existing.data[0]!["ad_names"] ?? [];
      if (adNames.length > 0) {
        await syncCreativeAssetLinks(accountId, importId, "", adNames, []);
      }
      // Library entries derived from this creative's deconstruction must not
      // outlive the source file (the classification row itself cascades via
      // the manual_import_id FK).
      await deleteDerivedLibraryEntries(accountId, importId);
    }
    const del = await supabase.from("manual_imports").delete().eq("id", importId);
    if (del.error) throw new Error(del.error.message);
    res.status(204).end();
  } catch (err) {
    req.log.error({ err, accountId, importId }, "Failed to delete manual import");
    res.status(502).json({
      message: err instanceof Error ? err.message : "Could not delete the staged import.",
    });
  }
});


router.get("/metrix/accounts/:accountId/manual-imports/:importId/file", requireAuth, async (req, res) => {
  const accountId = String(req.params["accountId"]);
  const importId = String(req.params["importId"]);
  const user = req.authUser!;
  try {
    if (user.role !== "admin" && !(await userHasAccountAccess(user.id, accountId))) {
      res.status(403).json({ message: "You don't have access to this ad account." });
      return;
    }
    let file: CreativeFile;
    try {
      file = await fetchAndCacheCreativeFile(importId, accountId);
    } catch (err) {
      if (err instanceof Error && (err as any).code === "not_found") {
        res.status(404).json({ message: "Staged import not found." });
        return;
      }
      throw err;
    }
    // The uploader's declared content type is advisory: it is echoed back
    // only when it names a type that cannot execute (see
    // lib/assetContentType). Anything else — html, svg, unrecognised —
    // becomes an opaque download rather than a live same-origin document.
    const served = resolveServedAsset(file.contentType, file.filename);
    const { buf } = file;
    const contentType = served.contentType;
    res.setHeader("Content-Type", contentType);
    if (served.disposition) res.setHeader("Content-Disposition", served.disposition);
    // Creative imports are immutable: each upload gets its own importId URL,
    // and replacing a creative creates a new URL. Keep the bytes in the
    // browser's disk cache so revisiting the library or refreshing the page
    // does not re-fetch the same image from Supabase.
    res.setHeader("Cache-Control", "private, max-age=31536000, immutable");

    // Video elements (Safari in particular) require Range/206 support to
    // play at all, not just to seek — without this, video creatives can
    // silently fail to load even though the plain GET works fine.
    res.setHeader("Accept-Ranges", "bytes");
    const rangeHeader = req.headers.range;
    if (rangeHeader && isInlineVideo(contentType)) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
      const total = buf.length;
      const start = match?.[1] ? parseInt(match[1], 10) : 0;
      const end = match?.[2] ? parseInt(match[2], 10) : total - 1;
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || end >= total) {
        res.setHeader("Content-Range", `bytes */${total}`);
        res.status(416).end();
        return;
      }
      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
      res.setHeader("Content-Length", String(end - start + 1));
      res.send(buf.subarray(start, end + 1));
      return;
    }
    res.send(buf);
  } catch (err) {
    req.log.error({ err, accountId, importId }, "Failed to fetch manual import file");
    res.status(502).json({
      message: err instanceof Error ? err.message : "Could not fetch the staged file.",
    });
  }
});


// ── Cell-level creative upload / serve / delete ───────────────────────────

router.post("/metrix/accounts/:accountId/cells/:cellId/creative", requireAuth, async (req, res) => {
  const accountId = String(req.params["accountId"]);
  const cellId = String(req.params["cellId"]);
  const { z } = await import("zod/v4");
  const CellCreativeUploadBody = z.object({
    content_base64: z.string().min(1),
    filename: z.string().min(1),
    content_type: z.string().min(1),
    // Set once the caller has seen a "mismatch" validation and explicitly
    // chose to file anyway (see the 409 response shape below).
    override: z.boolean().optional(),
  });
  const parsed = CellCreativeUploadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "filename, content_type, and base64 content are required." });
    return;
  }
  const user = req.authUser!;
  try {
    if (user.role !== "admin" && !(await userHasAccountAccess(user.id, accountId))) {
      res.status(403).json({ message: "You don't have access to this ad account." });
      return;
    }
    const supabase = getSupabase();
    const account = await supabase.from("ad_accounts").select("id").eq("id", accountId).limit(1);
    if (account.error) throw new Error(account.error.message);
    if (!account.data || account.data.length === 0) {
      res.status(404).json({ message: "Ad account not found." });
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
    if (content.length > MAX_CELL_CREATIVE_BYTES) {
      res.status(413).json({ message: "File is too large — the limit is 8 MB." });
      return;
    }

    // Classify against the registry, scoped to THIS cell — never guessed —
    // before anything is written. A confident, matching result files
    // immediately; a mismatch is reported back for the user to confirm
    // before it overwrites the cell's creative.
    const validation = await classifyCellCreative({
      accountId,
      cellId,
      filename: parsed.data.filename,
      contentType: parsed.data.content_type,
      bytes: content,
    });
    if (validation.status === "mismatch" && !parsed.data.override) {
      res.status(409).json({
        message: "This upload doesn't match the cell's recorded creative DNA — review before filing.",
        status: "needs_confirmation",
        validation: {
          overall_confidence: validation.overall_confidence,
          variables: validation.variables,
          expected: validation.expected,
          missing: validation.missing,
          conflicting: validation.conflicting,
        },
      });
      return;
    }

    await fileCellCreativeOverride({
      accountId,
      cellId,
      filename: parsed.data.filename,
      contentType: parsed.data.content_type,
      bytes: content,
      validation,
      overridden: validation.status === "mismatch" && parsed.data.override === true,
    });
    res.json({
      asset_url: `/api/metrix/accounts/${accountId}/cells/${cellId}/creative`,
      cell_id: cellId,
      validation:
        validation.status === "unclassified"
          ? null
          : {
              status: validation.status,
              overall_confidence: validation.overall_confidence,
              variables: validation.variables,
              expected: validation.expected,
            },
    });
  } catch (err) {
    req.log.error({ err, accountId, cellId }, "Failed to upload cell creative");
    res.status(502).json({ message: err instanceof Error ? err.message : "Upload failed." });
  }
});

export default router;
