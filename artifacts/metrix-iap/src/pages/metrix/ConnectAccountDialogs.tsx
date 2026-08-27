// ─── Connect / manual-import flows for unconfigured accounts ──────────
// Real flows: ManualImportDialog stages actual file uploads against the
// API (stored raw for the analysis pipeline — never parsed into
// performance data at upload time), and ConnectMetaDialog hands off to
// the live Meta OAuth flow in Settings → Integrations.
//
// Manual imports require the two exact IAP report templates (Demographics +
// Placements), uploaded as CSV (preferred) or XLSX — same required columns
// either way — plus optional individual creative files with an editable
// ad-name mapping. Date range selection does NOT live here — it belongs
// only to the explicit "Run analysis" step (see AnalysisControls),
// which is surfaced from the account setup screen, not this dialog.

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useStageManualImport,
  useListManualImports,
  type CreativeDeconstruction,
  useUpdateManualImportAdNames,
  useDeleteManualImport,
  getGetMetrixSeedQueryKey,
  getListManualImportsQueryKey,
  ApiError,
  type ManualImport,
  type ColumnMappingSummaryEntry,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@workspace/command-deck/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/command-deck/components/ui/alert-dialog";
import { DIALOG } from "./typography";
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/command-deck/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/command-deck/components/ui/command";
import { cn } from "@workspace/command-deck/lib/utils";
import { splitWarningsBySeverity } from "@/lib/warningSeverity";
import {
  Plug,
  FileUp,
  Database,
  CheckCircle2,
  Clock,
  ArrowRight,
  ArrowLeft,
  Upload,
  Images,
  Loader2,
  AlertTriangle,
  Trash2,
  Pencil,
  Check,
  X,
  XCircle,
  ChevronDown,
  ChevronRight,
  ListChecks,
  Hash,
  Sparkles,
  GitMerge,
} from "lucide-react";
import type { AdAccount } from "@/lib/data/seedTypes";
import {
  RequiredFormatPanel,
  GuessedMatchesCallout,
  AnalysisControls,
  type IapCsvClassKey,
} from "./ManualAnalysisControls";
import { guessedCreativeImports } from "./manualImportUtils";
import type { ManualImportInput, ManualImportResult } from "@workspace/api-client-react";
import { suggestAdNameMatch, type AdNameMatch } from "@/lib/adNameMatch";
import { useDeconstruction, DECONSTRUCTION_STATUS_LABEL } from "@/components/creative/useDeconstruction";

export function PrimaryBtn({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1.5 h-9 px-4 rounded-md border text-body font-medium transition-colors",
        disabled
          ? "border-border/40 text-muted-foreground/80 cursor-not-allowed"
          : "bg-primary/15 border-primary/30 text-interactive hover:bg-primary/25"
      )}
    >
      {children}
    </button>
  );
}

export function GhostBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 h-9 px-4 rounded-md border border-border/50 text-body font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/5 transition-colors"
    >
      {children}
    </button>
  );
}

// ─── Connect Meta Ad Account ──────────────────────────────────────────
// Direct OAuth connection to Meta is not yet available in the UI — it's
// real infrastructure (token handling, report-pull routes, the actual
// OAuth exchange) that a focused future effort will build a proper
// interface for. This dialog is an honest "coming soon" state — it never
// hands off into a flow that doesn't work yet. Manual CSV import is the
// supported, fully-functional way to bring in performance data today.

export function ConnectMetaDialog({
  account,
  open,
  onOpenChange,
}: {
  account: AdAccount;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg border border-border/40 bg-foreground/[0.03] flex items-center justify-center">
              <Plug className="w-4 h-4 text-muted-foreground/75" />
            </div>
            <span className="text-label font-semibold uppercase tracking-widest border border-primary/25 bg-primary/[0.08] text-interactive/80 px-2 py-1 rounded">
              Coming soon
            </span>
          </div>
          <DialogTitle className={DIALOG.title}>Live Meta connection</DialogTitle>
          <DialogDescription className="text-body leading-relaxed">
            Direct OAuth connection to Meta for{" "}
            <span className="text-foreground/80 font-medium">{account.name}</span> is in active
            development and isn't available yet.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-3 p-3 rounded-lg border border-border/40 bg-foreground/[0.02]">
          <FileUp className="w-4 h-4 text-interactive/80 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="text-body font-semibold text-foreground">Use manual import instead</div>
            <p className="text-caption text-foreground/75 mt-0.5">
              Upload exported Meta reports for {account.name} today — no live connection required.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <GhostBtn onClick={() => onOpenChange(false)}>Got it</GhostBtn>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Manual import upload panel (shared) ──────────────────────────────

// Kept in sync with MAX_MANUAL_IMPORT_BYTES on the server (metrix.ts) — real
// Meta pivot exports spanning long date ranges can be well over 50 MB.
const MAX_UPLOAD_BYTES = 75 * 1024 * 1024;
const MAX_UPLOAD_MB_LABEL = "75 MB";

// Performance report files go up to 150 MB via the chunked upload flow
// (MAX_CHUNKED_IMPORT_BYTES server-side). Anything above the threshold is
/// sent in ~8 MB chunks: the deployment proxy rejects large single request
// bodies with a bare 413 before the API ever sees them, so a bigger
// single-request limit cannot work — chunking is the only transport that
// scales past it.
const MAX_PERFORMANCE_UPLOAD_BYTES = 150 * 1024 * 1024;
const MAX_PERFORMANCE_UPLOAD_MB_LABEL = "150 MB";
const CHUNKED_THRESHOLD_BYTES = 20 * 1024 * 1024;
// 4 MB per chunk (≈8 MB as the hex payload Postgres actually parses): an
// 8 MB chunk's upsert was observed exceeding the shared instance's original
// 8s statement timeout. The timeout is now 120s for the server role, but
// smaller statements + retries keep uploads robust under load regardless.
const UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;
const CHUNK_RETRY_DELAYS_MS = [1000, 3000];

/**
 * Base64-encodes a file (or file slice) via FileReader.readAsDataURL — the
 * browser does the encoding natively off the main thread, unlike the
 * previous arrayBuffer + String.fromCharCode loop which froze the UI for
 * large (multi-MB) video files.
 */
function fileToBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      if (comma === -1) {
        reject(new Error("Could not read file."));
        return;
      }
      resolve(result.slice(comma + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

/**
 * Stages a manual import over XMLHttpRequest (instead of the generated
 * fetch-based hook) so we get real byte-level upload progress — `fetch`
 * has no upload-progress event, which is why the previous UI could only
 * show an indeterminate spinner regardless of file size.
 */
function stageManualImportWithProgress(
  accountId: string,
  data: ManualImportInput,
  onProgress?: (pct: number) => void
): Promise<ManualImportResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/metrix/accounts/${accountId}/manual-imports`, true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.withCredentials = true;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      let parsed: unknown = null;
      try {
        parsed = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        // ignore parse failures, handled below via status check
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve(parsed as ManualImportResult);
      } else {
        const message =
          (parsed && typeof parsed === "object" && "message" in parsed
            ? String((parsed as { message?: unknown }).message)
            : null) ?? `Upload failed (HTTP ${xhr.status})`;
        reject(new Error(message));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));

    xhr.send(JSON.stringify(data));
  });
}

/** JSON fetch with the app's cookie auth; throws Error(message) on any non-2xx. */
async function chunkedUploadRequest(url: string, method: "POST" | "PUT", body?: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    // non-JSON body (platform error page) — handled below via status
  }
  if (!res.ok) {
    const message =
      (parsed && typeof parsed === "object" && "message" in parsed
        ? String((parsed as { message?: unknown }).message)
        : null) ?? `Upload failed (HTTP ${res.status})`;
    throw new Error(message);
  }
  return parsed;
}

/**
 * Stages a large performance report through the chunked upload flow:
 * init → PUT ~8 MB chunks (progress = chunks delivered) → complete, which
 * runs the exact same server-side validation as the single-request path
 * and returns the same ManualImportResult shape.
 */
async function stageManualImportChunked(
  accountId: string,
  file: File,
  kind: CsvKind,
  onProgress?: (pct: number) => void
): Promise<ManualImportResult> {
  const chunkCount = Math.max(1, Math.ceil(file.size / UPLOAD_CHUNK_BYTES));
  const base = `/api/metrix/accounts/${accountId}/manual-imports/uploads`;
  const init = (await chunkedUploadRequest(base, "POST", {
    kind,
    filename: file.name,
    content_type: file.type || null,
    size_bytes: file.size,
    chunk_count: chunkCount,
  })) as { import_id: string };

  for (let i = 0; i < chunkCount; i++) {
    const slice = file.slice(i * UPLOAD_CHUNK_BYTES, Math.min((i + 1) * UPLOAD_CHUNK_BYTES, file.size));
    const content_base64 = await fileToBase64(slice);
    // Chunk PUTs are idempotent (upsert on (import, index)), so transient
    // failures — a shared-instance timeout, a proxy hiccup — retry safely.
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= CHUNK_RETRY_DELAYS_MS.length; attempt++) {
      try {
        await chunkedUploadRequest(`${base}/${init.import_id}/chunks/${i}`, "PUT", { content_base64 });
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        const delay = CHUNK_RETRY_DELAYS_MS[attempt];
        if (delay === undefined) break;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    if (lastError) throw lastError;
    // Reserve the last few percent for the server-side assemble+validate step.
    onProgress?.(Math.round(((i + 1) / chunkCount) * 95));
  }

  const result = (await chunkedUploadRequest(`${base}/${init.import_id}/complete`, "POST")) as ManualImportResult;
  onProgress?.(100);
  return result;
}

function UploadProgressBar({ pct, label }: { pct: number; label: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-label text-muted-foreground/85">
        <span className="flex items-center gap-1.5 truncate">
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> {label}
        </span>
        <span className="shrink-0 tabular-nums">{pct}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-foreground/[0.06] overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-150 ease-out"
          style={{ width: `${Math.min(100, Math.max(pct > 0 ? 4 : 0, pct))}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Diff callout shown immediately after a CSV re-upload. Compares the new
 * mapping_summary against the previously-staged file's summary and calls out:
 *   - Columns that were missing but are now found (positive, green)
 *   - Columns that were missing and are still missing (persistent, red)
 * Only rendered when at least one previously-missing column changed state.
 */
function CsvMappingDiffCallout({
  diff,
}: {
  diff: { nowFound: string[]; stillMissing: string[] };
}) {
  if (diff.nowFound.length === 0 && diff.stillMissing.length === 0) return null;
  return (
    <div className="rounded-lg border border-border/40 bg-foreground/[0.02] p-3 space-y-2">
      <div className="text-caption font-semibold text-foreground/75">After re-upload</div>
      {diff.nowFound.length > 0 && (
        <div className="space-y-1">
          {diff.nowFound.map((col) => (
            <div key={col} className="flex items-center gap-2 text-label">
              <CheckCircle2 className="w-3.5 h-3.5 text-status-success shrink-0" />
              <span className="font-medium text-status-success">{col}</span>
              <span className="text-status-success/55">— now found</span>
            </div>
          ))}
        </div>
      )}
      {diff.stillMissing.length > 0 && (
        <div className="space-y-1">
          {diff.stillMissing.map((col) => (
            <div key={col} className="flex items-center gap-2 text-label">
              <XCircle className="w-3.5 h-3.5 text-status-danger/80 shrink-0" />
              <span className="font-medium text-status-danger">{col}</span>
              <span className="text-status-danger/55">— still missing</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CsvMappingPanel({ summary }: { summary: ColumnMappingSummaryEntry[] }) {
  const [open, setOpen] = useState(false);

  const nonExact = summary.filter((e) => e.tier !== "exact");
  const resolved = nonExact.filter((e) => e.tier !== "missing");
  // Only REQUIRED missing columns are a problem worth warning colors — an
  // optional column absent from the export is a property of Meta's export
  // type, not a defect in the user's file, so it renders as a neutral
  // "not in export" group instead of red rows under an amber header.
  const requiredMissing = nonExact.filter((e) => e.tier === "missing" && e.is_required);
  const optionalMissing = nonExact.filter((e) => e.tier === "missing" && !e.is_required);

  if (nonExact.length === 0) return null;

  const headerLabel = [
    resolved.length > 0 && `${resolved.length} auto-resolved`,
    requiredMissing.length > 0 && `${requiredMissing.length} required missing`,
    optionalMissing.length > 0 && `${optionalMissing.length} not in export`,
  ]
    .filter(Boolean)
    .join(" · ");

  const headerColor =
    requiredMissing.length > 0
      ? "border-status-warning/25 bg-status-warning/[0.04]"
      : "border-status-success/20 bg-status-success/[0.03]";
  const chevronColor =
    requiredMissing.length > 0 ? "text-status-warning/80" : "text-status-success/80";
  const iconColor =
    requiredMissing.length > 0 ? "text-status-warning" : "text-status-success";

  return (
    <div className={cn("rounded-lg border overflow-hidden", headerColor)}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-foreground/[0.02] transition-colors"
        aria-expanded={open}
      >
        <GitMerge className={cn("w-3.5 h-3.5 shrink-0", iconColor)} />
        <span className="text-caption font-medium text-foreground/80 flex-1">
          Column mapping{" "}
          <span className="font-normal text-muted-foreground/80">— {headerLabel}</span>
        </span>
        {open ? (
          <ChevronDown className={cn("w-3.5 h-3.5 shrink-0", chevronColor)} />
        ) : (
          <ChevronRight className={cn("w-3.5 h-3.5 shrink-0", chevronColor)} />
        )}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-1 border-t border-foreground/[0.04]">
          {resolved.length > 0 && (
            <div className="pt-2 space-y-1">
              {resolved.map((e) => {
                const isHigh = e.confidence >= 0.85;
                return (
                  <div
                    key={e.canonical}
                    className={cn(
                      "flex items-start gap-2 px-2 py-1.5 rounded text-label",
                      isHigh
                        ? "bg-status-success/[0.06] border border-status-success/15"
                        : "bg-status-warning/[0.06] border border-status-warning/15"
                    )}
                  >
                    <CheckCircle2
                      className={cn(
                        "w-3.5 h-3.5 shrink-0 mt-px",
                        isHigh ? "text-status-success" : "text-status-warning"
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-foreground/90">{e.canonical}</span>
                      {e.found_as && e.found_as !== e.canonical && (
                        <span className="text-muted-foreground/75"> ← {e.found_as}</span>
                      )}
                      <span
                        className={cn(
                          "ml-1.5 text-label font-semibold uppercase tracking-wide",
                          isHigh ? "text-status-success/80" : "text-status-warning/80"
                        )}
                      >
                        {Math.round(e.confidence * 100)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {requiredMissing.length > 0 && (
            <div className={cn("pt-2 space-y-1", resolved.length > 0 && "mt-1")}>
              <p className="text-label uppercase tracking-wide font-semibold text-muted-foreground/75 pb-0.5">
                Required columns missing
              </p>
              {requiredMissing.map((e) => (
                <div
                  key={e.canonical}
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-label bg-status-danger/[0.06] border border-status-danger/15"
                >
                  <XCircle className="w-3.5 h-3.5 shrink-0 text-status-danger/80" />
                  <span className="font-medium text-foreground/80 min-w-0 truncate">{e.canonical}</span>
                </div>
              ))}
            </div>
          )}

          {optionalMissing.length > 0 && (
            <div className={cn("pt-2 space-y-1", (resolved.length > 0 || requiredMissing.length > 0) && "mt-1")}>
              <p className="text-label uppercase tracking-wide font-semibold text-muted-foreground/75 pb-0.5">
                Optional columns not included in this export — no action needed
              </p>
              {optionalMissing.map((e) => (
                <div
                  key={e.canonical}
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-label bg-foreground/[0.02] border border-border/30"
                >
                  <span className="font-medium text-muted-foreground/75 min-w-0 truncate">{e.canonical}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type CsvKind =
  | "performance_demo_csv"
  | "performance_placement_csv"
  | "performance_ad_summary_csv"
  | "performance_conversion_device_csv";

const SMART_CSV_SLOTS: {
  kind: CsvKind;
  csvClass: IapCsvClassKey;
  label: string;
  optional?: boolean;
}[] = [
  { kind: "performance_demo_csv", csvClass: "demographic", label: "Demographics" },
  { kind: "performance_placement_csv", csvClass: "device_placement", label: "Placements" },
  { kind: "performance_ad_summary_csv", csvClass: "ad_summary", label: "Ad Summary", optional: true },
  { kind: "performance_conversion_device_csv", csvClass: "conversion_device", label: "Conversion Device", optional: true },
];

/** Reads the target kind a "wrong slot" server message is steering the file
 *  towards, so a misfiled drop can be silently retried against the correct
 *  slot instead of surfacing an error the user has to act on themselves. */
function correctionTargetKind(msg: string): CsvKind | null {
  if (/Device\/Placement CSV instead/.test(msg) || /Placements CSV instead/.test(msg)) {
    return "performance_placement_csv";
  }
  if (/Demographics? CSV instead/.test(msg)) return "performance_demo_csv";
  if (/Conversion Device CSV instead/.test(msg)) return "performance_conversion_device_csv";
  return null;
}

/** Naive single-line CSV splitter, good enough for a header row (handles
 *  simple quoted cells but not embedded newlines — the header is always a
 *  single line). */
function splitCsvHeaderLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim().toLowerCase());
}

// Mirrors the server's exclusive signature-column detection in
// iapCsvSpec.ts (CSV_CLASS_SIGNATURE_COLUMNS + its column-alias table), so
// the client can pick the right slot from a file's own headers up front
// instead of guessing by upload order and hoping a "wrong slot" server
// message can steer it — that only covers some of the 4x4 class pairs.
const CONVERSION_DEVICE_HEADER_SIGNALS = ["conversion device", "conv. device", "converting device", "device (conversion)"];
const DEMOGRAPHIC_HEADER_SIGNALS = ["gender", "age"];
const PLACEMENT_HEADER_SIGNALS = [
  "placement",
  "ad placement",
  "placement type",
  "impression device",
  "device",
  "device type",
  "ad impression device",
  "device platform",
  "impression device platform",
];

/** Classifies a CSV by its header row into one of the 4 known Meta export
 *  shapes. Order matters: conversion-device and demographic signals are
 *  checked before the broader placement/device signal set so a conversion
 *  export (which also has no Gender/Age) isn't caught by the "device" alias. */
function classifyCsvHeaders(headerCells: string[]): CsvKind {
  const has = (signals: string[]) => headerCells.some((h) => signals.includes(h));
  if (has(CONVERSION_DEVICE_HEADER_SIGNALS)) return "performance_conversion_device_csv";
  if (has(DEMOGRAPHIC_HEADER_SIGNALS)) return "performance_demo_csv";
  if (has(PLACEMENT_HEADER_SIGNALS)) return "performance_placement_csv";
  return "performance_ad_summary_csv";
}

/** Reads just enough of the file to get its header row and classify it.
 *  XLSX files are a ZIP container, not text — reading their raw bytes as a
 *  string can't recover a header row, so this only attempts the text sniff
 *  for .csv files. XLSX uploads fall through to the same slot-guessing +
 *  server "wrong slot" retry (see `stageOne`) the CSV path already uses
 *  whenever its own sniff comes back inconclusive, so a misfiled XLSX still
 *  ends up in the correct slot — it just costs one extra staging attempt. */
async function sniffCsvKind(file: File): Promise<CsvKind> {
  if (/\.xlsx$/i.test(file.name)) return "performance_ad_summary_csv";
  try {
    const head = await file.slice(0, 16384).text();
    const firstLine = head.split(/\r\n|\n|\r/)[0] ?? "";
    return classifyCsvHeaders(splitCsvHeaderLine(firstLine));
  } catch {
    return "performance_ad_summary_csv";
  }
}

/**
 * One drop zone for every Meta performance export (2 required pivots + 2
 * optional Ads Manager CSVs). Nobody uploading these files thinks in terms
 * of "slots" — they just have a folder of exports from Meta — so instead of
 * making the user sort files into four separately-labeled boxes, this
 * accepts any number of files at once (dragged or picked, in any order) and
 * classifies each one from its own headers: it tries the first still-open
 * slot, and silently retries with the server's suggested slot if headers
 * say otherwise. A file is only ever shown as an error if no slot fits.
 */
function SmartCsvUpload({
  accountId,
  staged,
  onStaged,
  onRemoved,
}: {
  accountId: string;
  /** Every staged file per slot, not just one — a slot legitimately carries
   *  more than one (e.g. several weekly exports covering a date range
   *  together), and all of them feed the next analysis run. */
  staged: Partial<Record<CsvKind, ManualImport[]>>;
  onStaged: () => void;
  onRemoved: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [current, setCurrent] = useState<{ name: string; pct: number } | null>(null);
  const [lastMapping, setLastMapping] = useState<ColumnMappingSummaryEntry[] | null>(null);
  const [lastWarnings, setLastWarnings] = useState<string[] | null>(null);
  const [failures, setFailures] = useState<string[] | null>(null);
  const [expandedSlot, setExpandedSlot] = useState<CsvKind | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const deleteMutation = useDeleteManualImport();

  const bothRequiredStaged = Boolean(
    (staged.performance_demo_csv?.length ?? 0) > 0 && (staged.performance_placement_csv?.length ?? 0) > 0,
  );

  const stageOne = async (fileToStage: File): Promise<ManualImportResult> => {
    const sniffedKind = await sniffCsvKind(fileToStage);
    // Large files take the chunked flow (never base64-encoded whole — the
    // single-request body would be rejected by the platform proxy anyway).
    const useChunked = fileToStage.size > CHUNKED_THRESHOLD_BYTES;
    const content_base64 = useChunked ? null : await fileToBase64(fileToStage);
    const stageAs = (k: CsvKind) =>
      useChunked
        ? stageManualImportChunked(accountId, fileToStage, k, (pct) => setCurrent({ name: fileToStage.name, pct }))
        : stageManualImportWithProgress(
            accountId,
            { kind: k, filename: fileToStage.name, content_type: fileToStage.type || undefined, content_base64: content_base64! },
            (pct) => setCurrent({ name: fileToStage.name, pct })
          );

    // Classify from the file's own headers first (matches how the server
    // itself tells the classes apart) rather than guessing by which slot is
    // still empty. The "wrong slot" server message is kept only as a single
    // fallback retry for the rare case the header sniff and server disagree
    // — NOT an exhaustive cycle through every remaining slot. Once the
    // server has told us definitively which class the file's headers match,
    // that redirect IS the classification; if the redirected slot's own
    // attempt then also fails, that failure is the real, useful reason (a
    // genuine data/format problem with a file we now know is correctly
    // classified) and must reach the user directly — cycling on to try
    // unrelated slots afterwards only replaces that real reason with a
    // stale, confusing "wrong slot" message left over from a slot the file
    // was never actually meant for.
    try {
      return await stageAs(sniffedKind);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      const corrected = correctionTargetKind(msg);
      if (corrected && corrected !== sniffedKind) {
        return await stageAs(corrected);
      }
      throw err;
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setLastMapping(null);
    setLastWarnings(null);
    setFailures(null);
    const fileList = Array.from(files);
    const oversized = fileList.filter((f) => f.size > MAX_PERFORMANCE_UPLOAD_BYTES);
    if (oversized.length > 0) {
      setFailures(oversized.map((f) => `${f.name} — file is too large — the limit is ${MAX_PERFORMANCE_UPLOAD_MB_LABEL}.`));
      if (fileRef.current) fileRef.current.value = "";
      return;
    }

    const mappings: ColumnMappingSummaryEntry[] = [];
    const warnings: string[] = [];
    const fails: string[] = [];
    let stagedAny = false;

    for (const fileToStage of fileList) {
      setCurrent({ name: fileToStage.name, pct: 0 });
      try {
        const result = await stageOne(fileToStage);
        stagedAny = true;
        if (result.mapping_summary && result.mapping_summary.length > 0) mappings.push(...result.mapping_summary);
        if (result.upload_warnings && result.upload_warnings.length > 0) warnings.push(...result.upload_warnings);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed. Check your connection and try again.";
        fails.push(`${fileToStage.name}: ${msg}`);
      } finally {
        setCurrent(null);
      }
    }

    if (fileRef.current) fileRef.current.value = "";
    if (mappings.length > 0) setLastMapping(mappings);
    if (warnings.length > 0) setLastWarnings(warnings);
    if (fails.length > 0) setFailures(fails);
    if (stagedAny) onStaged();
  };

  const handleRemove = async (importToRemove: ManualImport) => {
    await deleteMutation.mutateAsync({ accountId, importId: importToRemove.id });
    onRemoved();
  };

  return (
    <div className="space-y-2">
      <div>
        <div className="text-body font-semibold text-foreground">Performance CSVs</div>
        <p className="text-caption text-foreground/75 mt-0.5">
          Drag in every export you have from Meta Ads Manager — CSV or XLSX, Metrix reads each file's headers and
          files it automatically. Demographics and Placements are required; Ad Summary and Conversion Device are
          optional but recommended.
        </p>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".csv,.xlsx"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <button
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          void handleFiles(e.dataTransfer.files);
        }}
        disabled={current !== null}
        className={cn(
          "w-full flex flex-col items-center gap-1.5 p-5 rounded-lg border border-dashed transition-colors",
          current !== null
            ? "border-primary/30 bg-primary/[0.03] cursor-not-allowed"
            : isDragging
            ? "border-primary/60 bg-primary/[0.06]"
            : "border-border/60 hover:border-primary/40 hover:bg-foreground/[0.02] cursor-pointer"
        )}
      >
        {current !== null ? <Loader2 className="w-5 h-5 text-interactive animate-spin" /> : <Upload className="w-5 h-5 text-muted-foreground/85" />}
        <span className="text-body font-medium text-foreground/85">
          {current !== null ? `Uploading ${current.name}…` : "Drop your Meta CSV or XLSX exports here, or click to browse"}
        </span>
        <span className="text-caption text-muted-foreground/75">Any number of files, any order — up to {MAX_PERFORMANCE_UPLOAD_MB_LABEL} each</span>
        {current !== null && <div className="w-full max-w-xs mt-1"><UploadProgressBar pct={current.pct} label="" /></div>}
      </button>

      <div className="grid grid-cols-2 gap-1.5">
        {SMART_CSV_SLOTS.map((slot) => {
          const importsForSlot = staged[slot.kind] ?? [];
          const filled = importsForSlot.length > 0;
          const single = importsForSlot.length === 1 ? importsForSlot[0]! : null;
          return (
            <div
              key={slot.kind}
              className={cn(
                "flex items-center gap-1.5 px-2 py-1.5 rounded-md border text-label min-w-0",
                filled ? "border-status-success/20 bg-status-success/[0.05]" : "border-border/40 bg-foreground/[0.015]"
              )}
            >
              {filled ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-status-success shrink-0" />
              ) : (
                <div className={cn("w-3.5 h-3.5 rounded-full border shrink-0", slot.optional ? "border-border/50" : "border-status-warning/50")} />
              )}
              <span className={cn("truncate flex-1", filled ? "text-foreground/85" : "text-muted-foreground/75")}>
                {slot.label}
                {!slot.optional && !filled && <span className="text-status-warning/70"> *</span>}
                {importsForSlot.length > 1 && (
                  <span className="text-status-success/80"> · {importsForSlot.length} files</span>
                )}
              </span>
              {single && (
                <button
                  onClick={() => void handleRemove(single)}
                  disabled={deleteMutation.isPending}
                  className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-muted-foreground/75 hover:text-status-danger hover:bg-status-danger/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  aria-label={`Remove ${slot.label} file`}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
              {importsForSlot.length > 1 && (
                <button
                  onClick={() => setExpandedSlot((s) => (s === slot.kind ? null : slot.kind))}
                  className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-muted-foreground/75 hover:text-foreground hover:bg-foreground/[0.06] transition-colors cursor-pointer"
                  aria-label={`Manage ${slot.label} files`}
                >
                  <ChevronRight className={cn("w-3.5 h-3.5 transition-transform", expandedSlot === slot.kind && "rotate-90")} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {expandedSlot && (staged[expandedSlot]?.length ?? 0) > 1 && (
        <div className="rounded-lg border border-border/40 bg-foreground/[0.02] p-2 space-y-1">
          <div className="text-label font-semibold text-muted-foreground/75 px-1">
            {SMART_CSV_SLOTS.find((s) => s.kind === expandedSlot)?.label} — every one of these files feeds the next
            analysis run
          </div>
          {staged[expandedSlot]!.map((imp) => (
            <div key={imp.id} className="flex items-center gap-2 px-1.5 py-1 rounded bg-foreground/[0.02] text-label">
              <span className="text-foreground/80 truncate flex-1">{imp.filename}</span>
              <button
                onClick={() => void handleRemove(imp)}
                disabled={deleteMutation.isPending}
                className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-muted-foreground/75 hover:text-status-danger hover:bg-status-danger/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                aria-label={`Remove ${imp.filename}`}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      {!bothRequiredStaged && (
        <p className="text-label text-muted-foreground/75 px-0.5">* Demographics and Placements are required before you can continue.</p>
      )}

      <details className="group rounded-lg border border-border/30">
        <summary className="flex items-center gap-2 px-3 py-2 text-label font-medium text-muted-foreground/75 cursor-pointer hover:text-foreground/85 transition-colors [&::-webkit-details-marker]:hidden">
          <ChevronRight className="w-3.5 h-3.5 shrink-0 transition-transform group-open:rotate-90" />
          What format do these files need to be in?
        </summary>
        <div className="px-3 pb-3 space-y-2 pt-1">
          {SMART_CSV_SLOTS.map((slot) => (
            <RequiredFormatPanel key={slot.kind} csvClass={slot.csvClass} />
          ))}
        </div>
      </details>

      {lastMapping && <CsvMappingPanel summary={lastMapping} />}

      {lastWarnings && lastWarnings.length > 0 && (() => {
        // Severity split (progressive disclosure): informational notices —
        // "Note:"-prefixed optional-column lists and the folded "matched
        // automatically … no action needed" mapping summary — collapse
        // behind a count, so the lines that actually need a decision (ID
        // corruption, moderate-confidence mappings, reconciliation) are the
        // only ones on the first layer. Nothing is hidden: notices stay one
        // click away, and a notices-only staging drops the alarm styling
        // entirely.
        const { attention, notices } = splitWarningsBySeverity(lastWarnings);
        if (attention.length === 0 && notices.length === 0) return null;
        const alarmed = attention.length > 0;
        return (
          <div
            className={cn(
              "rounded-lg border p-3 space-y-2",
              alarmed ? "border-status-warning/30 bg-status-warning/[0.06]" : "border-border/40 bg-foreground/[0.02]",
            )}
          >
            <div className="flex items-start gap-2">
              {alarmed ? (
                <AlertTriangle className="w-3.5 h-3.5 text-status-warning shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5 text-muted-foreground/75 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0 space-y-1">
                <div className={cn("text-caption font-semibold", alarmed ? "text-status-warning" : "text-foreground/85")}>
                  {alarmed
                    ? `Staged with ${attention.length} warning${attention.length !== 1 ? "s" : ""} — check before running analysis`
                    : `Staged — ${notices.length} notice${notices.length !== 1 ? "s" : ""}, no action needed`}
                </div>
                {attention.length > 0 && (
                  <ul className="space-y-0.5">
                    {attention.map((w, i) => (
                      <li key={i} className="text-label text-status-warning/80 leading-relaxed">{w}</li>
                    ))}
                  </ul>
                )}
                {notices.length > 0 && (
                  <details className="group/notices">
                    <summary className="flex items-center gap-1 text-label text-muted-foreground/75 cursor-pointer hover:text-foreground/80 transition-colors [&::-webkit-details-marker]:hidden">
                      <ChevronRight className="w-3 h-3 shrink-0 transition-transform group-open/notices:rotate-90" />
                      {notices.length} notice{notices.length !== 1 ? "s" : ""} — automatic mappings &amp; optional columns
                    </summary>
                    <ul className="space-y-0.5 pl-4 pt-1">
                      {notices.map((w, i) => (
                        <li key={i} className="text-label text-muted-foreground/75 leading-relaxed">{w}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
              <button
                onClick={() => setLastWarnings(null)}
                className={cn(
                  "shrink-0 w-6 h-6 flex items-center justify-center rounded transition-colors",
                  alarmed
                    ? "text-status-warning/70 hover:text-status-warning hover:bg-status-warning/10"
                    : "text-muted-foreground/75 hover:text-foreground/80 hover:bg-foreground/[0.04]",
                )}
                aria-label="Dismiss warning"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })()}

      {failures && failures.length > 0 && (
        <div className="rounded-lg border border-status-warning/30 bg-status-warning/[0.06] p-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-status-warning shrink-0" />
            <span className="text-caption font-semibold text-status-warning">
              {failures.length === 1 ? "1 file needs a closer look" : `${failures.length} files need a closer look`}
            </span>
          </div>
          <ul className="space-y-1 pl-[1.375rem]">
            {failures.map((f, i) => (
              <li key={i} className="text-caption text-status-warning/80 leading-relaxed">{f}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Searchable, checkbox-driven multi-select over ad names that already
 * exist in this account's IAP analysis (`account.ads` registry). Picking
 * from the real list rather than typing eliminates mapping typos.
 */
function AdNameDropdownPicker({
  availableAdNames,
  selected,
  onChange,
  defaultOpen,
}: {
  availableAdNames: string[];
  selected: string[];
  onChange: (names: string[]) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const [search, setSearch] = useState("");

  const toggle = (name: string) => {
    onChange(
      selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name]
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1.5 h-7 px-2.5 rounded bg-foreground/[0.03] border border-border/50 text-caption text-foreground hover:border-primary/40 transition-colors cursor-pointer"
          aria-label="Pick ad name(s) from existing analysis"
        >
          <ListChecks className="w-3.5 h-3.5 text-muted-foreground/85" />
          {selected.length > 0 ? `${selected.length} ad${selected.length > 1 ? "s" : ""} selected` : "Pick ad name(s)…"}
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/80" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search ad names…" value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>No matching ad names.</CommandEmpty>
            <CommandGroup>
              {availableAdNames.map((name) => {
                const isSelected = selected.includes(name);
                return (
                  <CommandItem key={name} value={name} onSelect={() => toggle(name)} className="cursor-pointer">
                    <div
                      className={cn(
                        "w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0",
                        isSelected ? "bg-primary border-primary" : "border-border/60"
                      )}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
                    </div>
                    <span className="truncate">{name}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Small badge explaining why an ad-name suggestion was made. Only shown while the current mapping still equals the auto-suggested value — overriding it (dropdown/free-text) drops the badge automatically. Reads the persisted `match_method` on the import so it survives navigation/reload, not just the current session. */
function MatchMethodBadge({ method }: { method?: "id" | "fuzzy" | "guess" | null }) {
  if (!method) return null;
  const config = {
    id: { icon: Hash, label: "Matched by ID code", className: "bg-primary/10 text-interactive" },
    fuzzy: { icon: Sparkles, label: "Matched by filename similarity", className: "bg-foreground/[0.06] text-muted-foreground/85" },
    guess: { icon: Sparkles, label: "Best guess — please review", className: "bg-status-warning/10 text-status-warning" },
  }[method];
  const Icon = config.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-label font-medium px-1.5 py-0.5 rounded shrink-0",
        config.className
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </span>
  );
}

function CreativeThumbnail({ accountId, asset }: { accountId: string; asset: ManualImport }) {
  const [broken, setBroken] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isVideo = (asset.content_type ?? "").startsWith("video/");
  const fileUrl = `/api/metrix/accounts/${accountId}/manual-imports/${asset.id}/file`;

  // Only fetch the file when the thumbnail scrolls into view — prevents 65+
  // simultaneous Supabase queries when the creative library dialog opens.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setShouldLoad(true); obs.disconnect(); } },
      { threshold: 0.01, rootMargin: "120px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-10 h-10 rounded-md border border-border/40 bg-background/20 overflow-hidden shrink-0 flex items-center justify-center"
    >
      {broken ? (
        <Images className="w-4 h-4 text-muted-foreground/75" />
      ) : !shouldLoad ? null : isVideo ? (
        <video src={fileUrl} className="w-full h-full object-cover" muted onError={() => setBroken(true)} />
      ) : (
        <img
          src={fileUrl}
          alt={asset.filename}
          className="w-full h-full object-cover"
          onError={() => setBroken(true)}
        />
      )}
    </div>
  );
}

/**
 * Ad-name mapping editor. When a real ad registry exists, the dropdown is
 * always visible and saves immediately on every toggle — no separate
 * edit/confirm step, since that extra click was the source of "nothing
 * happened after I picked a name" confusion. Free-typed fallback (no
 * registry) keeps an explicit save since it needs a moment to type.
 */
function CreativeAdNamesEditor({
  accountId,
  asset,
  knownAdNames,
  availableAdNames,
  autoFocusPicker,
  onSaved,
}: {
  accountId: string;
  asset: ManualImport;
  knownAdNames: Set<string>;
  /** Real ad names from this account's analysis (`account.ads`). When present, mapping is dropdown-only — no free typing. */
  availableAdNames?: string[];
  /** Auto-open the picker popover on mount (newly staged, unmapped file). */
  autoFocusPicker?: boolean;
  onSaved: () => void;
}) {
  const [editingFree, setEditingFree] = useState(false);
  const [value, setValue] = useState(asset.ad_names.join(", "));
  const updateMutation = useUpdateManualImportAdNames();
  const hasRegistry = Boolean(availableAdNames && availableAdNames.length > 0);

  const parsedNames = editingFree ? value.split(",").map((s) => s.trim()).filter(Boolean) : asset.ad_names;
  const mismatch = !hasRegistry && parsedNames.length > 0 && parsedNames.some((n) => !knownAdNames.has(n));

  // Any manual override (dropdown pick or free-text edit) omits match_method
  // from the request, which clears the persisted reason server-side — it
  // should never keep claiming an auto-match once the user has picked.
  const handleDropdownChange = async (names: string[]) => {
    await updateMutation.mutateAsync({ accountId, importId: asset.id, data: { ad_names: names } });
    onSaved();
  };

  const handleFreeSave = async () => {
    const ad_names = value.split(",").map((s) => s.trim()).filter(Boolean);
    await updateMutation.mutateAsync({ accountId, importId: asset.id, data: { ad_names } });
    setEditingFree(false);
    onSaved();
  };

  return (
    <div
      className={cn(
        "p-2 rounded-md border bg-foreground/[0.02] space-y-1.5",
        asset.ad_names.length > 0 ? "border-border/30" : "border-status-warning/30 bg-status-warning/[0.03]"
      )}
    >
      <div className="flex items-center gap-2">
        <CreativeThumbnail accountId={accountId} asset={asset} />
        <span className="text-caption text-foreground/80 truncate flex-1">{asset.filename}</span>
        {updateMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground/75 shrink-0" />}
      </div>

      {hasRegistry ? (
        <div className="flex items-center gap-1.5 flex-wrap">
          <AdNameDropdownPicker
            availableAdNames={availableAdNames!}
            selected={asset.ad_names}
            onChange={(names) => void handleDropdownChange(names)}
            defaultOpen={autoFocusPicker && asset.ad_names.length === 0}
          />
          {asset.ad_names.length > 0 && <CheckCircle2 className="w-3.5 h-3.5 text-status-success shrink-0" />}
          <MatchMethodBadge method={asset.match_method} />
        </div>
      ) : editingFree ? (
        <div className="flex items-center gap-1.5">
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleFreeSave(); }}
            placeholder="Ad name(s), comma-separated"
            className="flex-1 h-7 px-2 rounded bg-foreground/[0.03] border border-border/50 text-caption text-foreground placeholder:text-muted-foreground/75 focus:outline-none focus:border-primary/40 focus-visible:ring-1 focus-visible:ring-ring"
          />
          <button
            onClick={() => void handleFreeSave()}
            disabled={updateMutation.isPending}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded text-status-success hover:bg-status-success/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            aria-label="Save"
          >
            {updateMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            onClick={() => { setValue(asset.ad_names.join(", ")); setEditingFree(false); }}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded text-muted-foreground/80 hover:bg-foreground/5 transition-colors cursor-pointer"
            aria-label="Cancel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="text-label text-muted-foreground/85 flex-1">
            {asset.ad_names.length > 0 ? `Mapped to: ${asset.ad_names.join(", ")}` : "No ad name mapped yet"}
          </div>
          <MatchMethodBadge method={asset.match_method} />
          <button
            onClick={() => { setValue(asset.ad_names.join(", ")); setEditingFree(true); }}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded text-muted-foreground/80 hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
            aria-label="Edit ad name mapping"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {mismatch && (
        <div className="flex items-start gap-1.5 text-label text-status-warning/90">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            {parsedNames.filter((n) => !knownAdNames.has(n)).join(", ")} not found among ad names seen in the staged
            CSVs yet — double check spelling, or this is expected if the CSVs haven't been uploaded.
          </span>
        </div>
      )}
    </div>
  );
}

function CreativeUploadSection({
  accountId,
  imports,
  knownAdNames,
  availableAdNames,
  onChanged,
}: {
  accountId: string;
  imports: ManualImport[];
  knownAdNames: Set<string>;
  /** Real ad names from this account's analysis (`account.ads`), when it exists. Drives filename auto-mapping + dropdown mapping. */
  availableAdNames?: string[];
  onChanged: () => void;
}) {
  const [errors, setErrors] = useState<string[]>([]);
  const [linkNotices, setLinkNotices] = useState<string[]>([]);
  const [queueTotal, setQueueTotal] = useState(0);
  const [queueIndex, setQueueIndex] = useState(0);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [currentPct, setCurrentPct] = useState(0);
  const [justStagedIds, setJustStagedIds] = useState<Set<string>>(new Set());
  // Per-row delete tracking: a shared mutation's isPending would spin/disable
  // EVERY row's delete button while one delete runs.
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [autoMapping, setAutoMapping] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Throttle progress re-renders: every XHR progress event used to re-render
  // the whole section (all rows + thumbnails), which made multi-file uploads
  // feel frozen. Cap updates to ~4/s, always letting 0 and 100 through.
  const lastPctUpdateRef = useRef(0);
  const deleteMutation = useDeleteManualImport();
  const updateMutation = useUpdateManualImportAdNames();

  const throttledSetPct = (pct: number) => {
    const now = Date.now();
    if (pct !== 0 && pct !== 100 && now - lastPctUpdateRef.current < 250) return;
    lastPctUpdateRef.current = now;
    setCurrentPct(pct);
  };

  const creativeAssets = imports.filter((i) => i.kind === "creative_asset");
  const registryNames = useMemo(() => new Set(availableAdNames ?? []), [availableAdNames]);
  const matchCandidates = registryNames.size > 0 ? registryNames : knownAdNames;
  const mappedCount = creativeAssets.filter((a) => a.ad_names.length > 0).length;
  const unmappedAssets = creativeAssets.filter((a) => a.ad_names.length === 0);
  const isUploading = queueTotal > 0;

  const handleDelete = async (importId: string) => {
    setConfirmDeleteId(null);
    setPendingDeleteId(importId);
    try {
      await deleteMutation.mutateAsync({ accountId, importId });
      onChanged();
    } finally {
      setPendingDeleteId(null);
    }
  };

  // Re-runs filename matching for every still-unmapped file in one click.
  // Only files that actually produce a suggestion are updated; the rest
  // stay unmapped (and highlighted) rather than being force-mapped to noise.
  const handleAutoMapAll = async () => {
    setAutoMapping(true);
    let matched = 0;
    let unmatchedCount = 0;
    const failures: string[] = [];
    try {
      for (const asset of unmappedAssets) {
        const match = suggestAdNameMatch(asset.filename, matchCandidates);
        if (!match) {
          unmatchedCount++;
          continue;
        }
        try {
          await updateMutation.mutateAsync({
            accountId,
            importId: asset.id,
            data: { ad_names: [match.name], match_method: match.method },
          });
          matched++;
        } catch (err) {
          failures.push(`${asset.filename}: ${err instanceof Error ? err.message : "Auto-map failed."}`);
        }
      }
      if (matched > 0) onChanged();
      setErrors(failures);
      setLinkNotices(
        unmatchedCount > 0
          ? [`${unmatchedCount} file${unmatchedCount > 1 ? "s" : ""} had no close ad-name match — map ${unmatchedCount > 1 ? "them" : "it"} manually below.`]
          : []
      );
    } finally {
      setAutoMapping(false);
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setErrors([]);
    setLinkNotices([]);
    const fileList = Array.from(files);
    setQueueTotal(fileList.length);
    const newlyStaged: string[] = [];
    const failures: string[] = [];
    const notices: string[] = [];

    // Each file is staged independently so one bad/oversized file in a
    // multi-file selection doesn't block the rest from uploading — the
    // previous implementation aborted the whole batch on the first error.
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      setQueueIndex(i + 1);
      setCurrentFile(file.name);
      setCurrentPct(0);

      if (file.size > MAX_UPLOAD_BYTES) {
        failures.push(`${file.name} is too large — the limit is ${MAX_UPLOAD_MB_LABEL}.`);
        continue;
      }

      try {
        const content_base64 = await fileToBase64(file);
        const match = suggestAdNameMatch(file.name, matchCandidates);
        const staged = await stageManualImportWithProgress(
          accountId,
          {
            kind: "creative_asset",
            filename: file.name,
            content_type: file.type || undefined,
            content_base64,
            ad_names: match ? [match.name] : [],
            match_method: match?.method,
          },
          throttledSetPct
        );
        newlyStaged.push(staged.import_id);
        const unmatched = staged.link_result?.unmatched ?? [];
        if (unmatched.length > 0) {
          notices.push(
            `${file.name}: staged, but ad name${unmatched.length > 1 ? "s" : ""} “${unmatched.join(", ")}” didn't match a live ad yet — remap below or it will link once analysis runs.`,
          );
        }
      } catch (err) {
        failures.push(`${file.name}: ${err instanceof Error ? err.message : "Upload failed."}`);
      }
    }

    if (newlyStaged.length > 0) {
      setJustStagedIds((prev) => new Set([...prev, ...newlyStaged]));
      onChanged();
    }
    setErrors(failures);
    setLinkNotices(notices);
    setQueueTotal(0);
    setQueueIndex(0);
    setCurrentFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3 p-3 rounded-lg border border-border/40 bg-foreground/[0.02]">
        <Images className="w-4 h-4 text-muted-foreground/85 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="text-body font-semibold text-foreground">Creative library <span className="text-muted-foreground/80 font-normal">(optional)</span></div>
          <p className="text-caption text-foreground/75 mt-0.5">
            Stage individual ad creative files (images/videos) so they render immediately.
          </p>
          <p className="text-label text-muted-foreground/75 leading-relaxed mt-0.5">
            Map each file to the ad name(s) it represents — filenames matching an ad name are pre-mapped.
          </p>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        multiple
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={isUploading}
        className={cn(
          "w-full flex flex-col items-center gap-1.5 p-4 rounded-lg border border-dashed transition-colors",
          isUploading
            ? "border-primary/30 bg-primary/[0.03] cursor-not-allowed"
            : "border-border/60 hover:border-primary/40 hover:bg-foreground/[0.02] cursor-pointer"
        )}
      >
        {isUploading ? (
          <Loader2 className="w-4 h-4 text-interactive animate-spin" />
        ) : (
          <Upload className="w-4 h-4 text-muted-foreground/85" />
        )}
        <span className="text-caption text-muted-foreground/80">
          {isUploading
            ? queueTotal > 1
              ? `Uploading file ${queueIndex} of ${queueTotal}${currentFile ? ` — ${currentFile}` : ""}…`
              : `Uploading${currentFile ? ` ${currentFile}` : ""}…`
            : "Choose one or more creative files (max 50 MB each)"}
        </span>
      </button>

      {isUploading && currentFile && (
        <UploadProgressBar
          pct={currentPct}
          label={queueTotal > 1 ? `File ${queueIndex} of ${queueTotal} — ${currentFile}` : currentFile}
        />
      )}

      {errors.length > 0 && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg border border-status-danger/25 bg-status-danger/[0.06]">
          <AlertTriangle className="w-3.5 h-3.5 text-status-danger shrink-0 mt-0.5" />
          <div className="text-caption text-status-danger leading-relaxed space-y-0.5">
            {errors.map((msg, i) => (
              <p key={i}>{msg}</p>
            ))}
          </div>
        </div>
      )}

      {linkNotices.length > 0 && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg border border-status-warning/25 bg-status-warning/[0.06]">
          <AlertTriangle className="w-3.5 h-3.5 text-status-warning shrink-0 mt-0.5" />
          <div className="text-caption text-status-warning leading-relaxed space-y-0.5">
            {linkNotices.map((msg, i) => (
              <p key={i}>{msg}</p>
            ))}
          </div>
        </div>
      )}

      {creativeAssets.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-0.5 gap-2">
            <span className="text-label font-medium text-muted-foreground/85">
              {mappedCount} of {creativeAssets.length} mapped
            </span>
            {mappedCount < creativeAssets.length && (
              <span className="text-label text-status-warning/90">Pick an ad name for each highlighted file below</span>
            )}
            {unmappedAssets.length > 0 && matchCandidates.size > 0 && (
              <button
                onClick={() => void handleAutoMapAll()}
                disabled={autoMapping}
                className="shrink-0 flex items-center gap-1 h-6 px-2 rounded border border-primary/30 text-label font-medium text-interactive hover:bg-primary/20 active:bg-primary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {autoMapping ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                Auto-map all
              </button>
            )}
          </div>
          {/* Capped scroll area — prevents 60+ cards from making the dialog infinitely tall */}
          <div className={cn("space-y-1.5", creativeAssets.length > 6 && "max-h-72 overflow-y-auto pr-1")}>
            {creativeAssets.map((asset) => (
              <div key={asset.id} className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <CreativeAdNamesEditor
                    accountId={accountId}
                    asset={asset}
                    knownAdNames={knownAdNames}
                    availableAdNames={availableAdNames}
                    autoFocusPicker={justStagedIds.has(asset.id)}
                    onSaved={onChanged}
                  />
                </div>
                <button
                  onClick={() => setConfirmDeleteId(asset.id)}
                  disabled={pendingDeleteId === asset.id}
                  className="shrink-0 mt-2 w-7 h-7 flex items-center justify-center rounded text-muted-foreground/80 hover:text-status-danger hover:bg-status-danger/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  aria-label={`Remove ${asset.filename}`}
                >
                  {pendingDeleteId === asset.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {(() => {
        const asset = confirmDeleteId ? creativeAssets.find((a) => a.id === confirmDeleteId) : null;
        return (
          <AlertDialog open={!!confirmDeleteId} onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove creative file?</AlertDialogTitle>
                <AlertDialogDescription>
                  <strong>{asset?.filename ?? "This file"}</strong> will be permanently removed from this account's staged imports. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => { if (confirmDeleteId) void handleDelete(confirmDeleteId); }}
                  className="bg-status-danger hover:bg-status-danger text-foreground focus-visible:ring-status-danger"
                >
                  Remove file
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        );
      })()}
    </div>
  );
}

/**
 * Full manual-import upload flow for an account: both required CSV
 * templates, optional individual creative files with editable ad-name
 * mapping, and an explicit confirmation/review step before finalizing.
 * No date range lives here — that's a separate, explicit "Run analysis"
 * step from the account setup screen.
 */
/** Compact 3-step pipeline tracker: CSVs → Creatives → Analysis. */
function PipelineProgress({
  demoStaged,
  placementStaged,
  creativesCount,
  onAnalysis,
}: {
  demoStaged: boolean;
  placementStaged: boolean;
  creativesCount: number;
  onAnalysis: boolean;
}) {
  const csvsDone = demoStaged && placementStaged;
  const csvsPartial = demoStaged || placementStaged;

  const steps = [
    {
      label: "CSV files",
      sublabel: csvsDone
        ? "Both staged"
        : csvsPartial
        ? "1 of 2 staged"
        : "Required",
      done: csvsDone,
      partial: csvsPartial && !csvsDone,
      active: !csvsDone,
    },
    {
      label: "Creatives",
      sublabel: creativesCount > 0 ? `${creativesCount} file${creativesCount > 1 ? "s" : ""}` : "Optional",
      done: creativesCount > 0,
      partial: false,
      active: csvsDone && creativesCount === 0,
    },
    {
      label: "Analysis",
      sublabel: onAnalysis ? "Ready to run" : "Next",
      done: false,
      partial: false,
      active: onAnalysis,
    },
  ];

  return (
    <div className="flex items-center gap-0 pb-1">
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-center flex-1 min-w-0">
          <div className="flex flex-col items-center gap-1 min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <div
                className={cn(
                  "w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors",
                  s.done
                    ? "bg-status-success/20 border-status-success/50"
                    : s.partial
                    ? "bg-status-warning/15 border-status-warning/40"
                    : s.active
                    ? "bg-primary/15 border-primary/40"
                    : "bg-foreground/[0.03] border-border/40"
                )}
              >
                {s.done ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-status-success" />
                ) : s.partial ? (
                  <Clock className="w-3.5 h-3.5 text-status-warning" />
                ) : s.active ? (
                  <div className="w-2 h-2 rounded-full bg-primary/70" />
                ) : (
                  <div className="w-2 h-2 rounded-full bg-border/60" />
                )}
              </div>
              <div className="min-w-0">
                <div className={cn("text-label font-semibold leading-none", s.done ? "text-status-success/90" : s.active ? "text-foreground/90" : "text-muted-foreground/75")}>
                  {s.label}
                </div>
                <div className="text-label text-muted-foreground/75 leading-none mt-0.5">{s.sublabel}</div>
              </div>
            </div>
          </div>
          {i < steps.length - 1 && (
            <div className={cn("h-px flex-shrink-0 w-4", s.done ? "bg-status-success/30" : "bg-border/30")} />
          )}
        </div>
      ))}
    </div>
  );
}

/** "file.csv" for one staged import, "3 files — a.csv, b.csv, c.csv" for more
 *  than one — a kind can legitimately carry several staged files at once
 *  (e.g. multiple weekly exports), and every one of them feeds the next
 *  analysis run, so all of them need to be visible here, not just the first. */
function stagedFilesLabel(list: ManualImport[]): string {
  if (list.length <= 1) return list[0]?.filename ?? "";
  return `${list.length} files — ${list.map((i) => i.filename).join(", ")}`;
}

export function ManualUploadPanel({
  accountId,
  availableAdNames,
  onDone,
}: {
  accountId: string;
  availableAdNames?: string[];
  /** Called when the user finishes the flow (after a successful analysis run or explicit dismiss). */
  onDone?: () => void;
}) {
  const [step, setStep] = useState<"upload" | "review">("upload");
  const { data, refetch } = useListManualImports(accountId);
  const queryClient = useQueryClient();
  const imports = data?.imports ?? [];

  const refresh = () => {
    void refetch();
    void queryClient.invalidateQueries({ queryKey: getListManualImportsQueryKey(accountId) });
  };

  // A successful run destages the files it consumed (status flips to
  // "processed") so the upload slots read as empty again for the next
  // batch — a run's already-used files live in the Import History panel
  // (Analysis Command Center) for restaging, not here.
  const stagedImports = imports.filter((i) => i.status === "staged");
  // Arrays, not a single import per kind: a kind legitimately accumulates more
  // than one staged file (e.g. several weekly exports covering a date range
  // together), and every one of them gets merged at analysis time — see the
  // status='staged' comment in analysisEngine.ts. Picking just one via .find()
  // here would silently hide the others from Review/Remove while they still
  // feed the run, which is what actually broke when the demo/placement upload
  // areas were unified into one free-form dropzone: it's now easy to end up
  // with more than one file per slot without noticing.
  const demoImports = stagedImports.filter((i) => i.kind === "performance_demo_csv");
  const placementImports = stagedImports.filter((i) => i.kind === "performance_placement_csv");
  const summaryImports = stagedImports.filter((i) => i.kind === "performance_ad_summary_csv");
  const conversionDeviceImports = stagedImports.filter((i) => i.kind === "performance_conversion_device_csv");
  const demoImport = demoImports[0] ?? null;
  const placementImport = placementImports[0] ?? null;
  const creativeAssets = imports.filter((i) => i.kind === "creative_asset");
  const guessedImports = guessedCreativeImports(imports);
  const bothRequiredStaged = Boolean(demoImports.length > 0 && placementImports.length > 0);
  const creativeMappedCount = creativeAssets.filter((a) => a.ad_names.length > 0).length;
  const creativeUnmappedCount = creativeAssets.length - creativeMappedCount;

  // Auto-advance to review/run step once when both required CSVs are already
  // staged — reopening the dialog (e.g. from Analysis Hub or Library) skips
  // the upload step and lands straight on Run Analysis.
  const hasAutoAdvancedRef = useRef(false);
  useEffect(() => {
    if (!hasAutoAdvancedRef.current && bothRequiredStaged) {
      setStep("review");
      hasAutoAdvancedRef.current = true;
    }
  }, [bothRequiredStaged]);

  // Ad names actually seen aren't known client-side (CSVs are staged raw,
  // not parsed) — mismatch warnings are informational only, based on
  // whatever ad names other staged creatives already carry.
  const knownAdNames = new Set(creativeAssets.flatMap((a) => a.ad_names));

  if (step === "review") {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-label font-bold uppercase tracking-[0.14em] text-muted-foreground/75">Step 2 of 2 — Review</span>
        </div>
        <PipelineProgress
          demoStaged={Boolean(demoImport)}
          placementStaged={Boolean(placementImport)}
          creativesCount={creativeAssets.length}
          onAnalysis={true}
        />
        {/* Upload summary — compact, no raw file dump */}
        <div className="rounded-lg border border-border/40 bg-foreground/[0.02] p-3 space-y-2">
          <div className="text-body font-semibold text-foreground">Files staged</div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-caption">
              <CheckCircle2 className="w-3.5 h-3.5 text-status-success shrink-0" />
              <span className="text-foreground/80 truncate">Demographics — {stagedFilesLabel(demoImports)}</span>
            </div>
            <div className="flex items-center gap-2 text-caption">
              <CheckCircle2 className="w-3.5 h-3.5 text-status-success shrink-0" />
              <span className="text-foreground/80 truncate">Placements — {stagedFilesLabel(placementImports)}</span>
            </div>
            {summaryImports.length > 0 ? (
              <div className="flex items-center gap-2 text-caption">
                <CheckCircle2 className="w-3.5 h-3.5 text-status-success shrink-0" />
                <span className="text-foreground/80 truncate">Ad Summary — {stagedFilesLabel(summaryImports)}</span>
              </div>
            ) : (
              /* Inline nudge — no separate warning block needed */
              <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md border border-status-warning/25 bg-status-warning/[0.05]">
                <div className="flex items-center gap-2 min-w-0">
                  <AlertTriangle className="w-3.5 h-3.5 text-status-warning shrink-0" />
                  <span className="text-caption text-status-warning/80 truncate">No Ad Summary export — spend may be underreported</span>
                </div>
                <button
                  onClick={() => setStep("upload")}
                  className="shrink-0 flex items-center gap-1 h-6 px-2.5 rounded border border-status-warning/35 bg-status-warning/10 text-label font-medium text-status-warning hover:bg-status-warning/20 transition-colors"
                >
                  <ArrowLeft className="w-3 h-3" /> Add one
                </button>
              </div>
            )}
            {conversionDeviceImports.length > 0 && (
              <div className="flex items-center gap-2 text-caption">
                <CheckCircle2 className="w-3.5 h-3.5 text-status-success shrink-0" />
                <span className="text-foreground/80 truncate">Conversion Device — {stagedFilesLabel(conversionDeviceImports)}</span>
              </div>
            )}
            {/* Creative files: compact count summary — avoids listing 60+ raw filenames */}
            {creativeAssets.length > 0 ? (
              <div className="flex items-center gap-2 text-caption">
                <Images className="w-3.5 h-3.5 text-muted-foreground/75 shrink-0" />
                <span className="text-foreground/80 flex-1">
                  {creativeAssets.length} creative {creativeAssets.length === 1 ? "file" : "files"} staged
                </span>
                {creativeUnmappedCount > 0 ? (
                  <>
                    <span className="text-label font-medium text-status-warning shrink-0">
                      {creativeMappedCount}/{creativeAssets.length} mapped
                    </span>
                    <button
                      onClick={() => setStep("upload")}
                      className="shrink-0 flex items-center gap-1 h-6 px-2.5 rounded border border-status-warning/35 bg-status-warning/10 text-label font-medium text-status-warning hover:bg-status-warning/20 transition-colors"
                    >
                      Fix mappings
                    </button>
                  </>
                ) : (
                  <span className="flex items-center gap-1 text-status-success shrink-0">
                    <CheckCircle2 className="w-3 h-3" />
                    <span className="text-label font-medium">All mapped</span>
                  </span>
                )}
              </div>
            ) : (
              <div className="text-caption text-muted-foreground/75">No creative files staged — optional.</div>
            )}
          </div>
        </div>

        <GuessedMatchesCallout
          accountId={accountId}
          guessedImports={guessedImports}
          onConfirmed={refresh}
          onReview={() => setStep("upload")}
          reviewLabel="Go back to fix"
        />

        {/* Inline first-run analysis trigger */}
        <div className="rounded-lg border border-primary/20 bg-primary/[0.04] p-3 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
              <Database className="w-3.5 h-3.5 text-interactive" />
            </div>
            <div>
              <div className="text-body font-semibold text-foreground">Run first analysis</div>
              <p className="text-label text-muted-foreground/80 leading-relaxed">
                Pick a date window and process your uploads into performance data now.
              </p>
            </div>
          </div>
          <AnalysisControls accountId={accountId} onDone={onDone} />
        </div>

        <div className="flex items-center justify-between pt-1">
          <GhostBtn onClick={() => setStep("upload")}>
            <ArrowLeft className="w-3.5 h-3.5" /> Back to uploads
          </GhostBtn>
          {onDone && (
            <GhostBtn onClick={onDone}>
              Skip for now
            </GhostBtn>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-label font-bold uppercase tracking-[0.14em] text-muted-foreground/75">Step 1 of 2 — Upload files</span>
      </div>
      <PipelineProgress
        demoStaged={Boolean(demoImport)}
        placementStaged={Boolean(placementImport)}
        creativesCount={creativeAssets.length}
        onAnalysis={false}
      />
      <SmartCsvUpload
        accountId={accountId}
        staged={{
          performance_demo_csv: demoImports,
          performance_placement_csv: placementImports,
          performance_ad_summary_csv: summaryImports,
          performance_conversion_device_csv: conversionDeviceImports,
        }}
        onStaged={refresh}
        onRemoved={refresh}
      />

      <CreativeUploadSection
        accountId={accountId}
        imports={imports}
        knownAdNames={knownAdNames}
        availableAdNames={availableAdNames}
        onChanged={refresh}
      />

      <div className="flex items-center justify-between pt-1 border-t border-border/30 mt-1">
        <div className="max-w-[60%]">
          <p className="text-label text-foreground/75 font-medium">Both CSVs are required before you can continue.</p>
          <p className="text-label text-muted-foreground/75 leading-relaxed mt-0.5">Files are stored raw until an analysis run explicitly processes them.</p>
        </div>
        <PrimaryBtn onClick={() => setStep("review")} disabled={!bothRequiredStaged}>
          Review <ArrowRight className="w-3.5 h-3.5" />
        </PrimaryBtn>
      </div>
    </div>
  );
}

// ─── Upload creatives (after the fact, for an already-analyzed account) ──
// A dedicated, own-interface flow for adding creative files to an account
// whose CSVs are already staged/analyzed — no CSV re-upload required.
// Ad-name mapping is dropdown-only against the account's real ads registry
// (`account.ads`), so there's no way to mistype a mapping.

// ─── Deconstruct staged creatives into the IAP library ────────────────
// Per-file and per-batch triggers plus a classification badge for every
// staged creative. Runs go through the generation engine (202 + poll);
// results at/above the 80% gate file into the local library automatically,
// below-gate results land in the IAP Library review queue.
function DeconstructBadge({ status }: { status: CreativeDeconstruction["status"] }) {
  const style: Record<CreativeDeconstruction["status"], string> = {
    auto_filed: "border-status-success/30 bg-status-success/[0.06] text-status-success",
    user_overridden: "border-status-success/30 bg-status-success/[0.06] text-status-success",
    needs_review: "border-status-warning/30 bg-status-warning/[0.06] text-status-warning",
    unsupported: "border-border/50 bg-foreground/[0.03] text-muted-foreground/80",
    discarded: "border-border/50 bg-foreground/[0.03] text-muted-foreground/80",
  };
  return (
    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded border text-label font-medium whitespace-nowrap", style[status])}>
      {DECONSTRUCTION_STATUS_LABEL[status]}
    </span>
  );
}

function CreativeDeconstructSection({
  accountId,
  creativeAssets,
}: {
  accountId: string;
  creativeAssets: { id: string; filename: string; ad_names: string[] }[];
}) {
  const { byImportId, isRunning, progress, start, startBackfill } = useDeconstruction(accountId);
  if (creativeAssets.length === 0) return null;

  const pending = creativeAssets.filter((a) => {
    const d = byImportId.get(a.id);
    return !d || d.status === "discarded" || d.status === "unsupported";
  });

  return (
    <div className="space-y-1.5" data-testid="deconstruct-section">
      <div className="flex items-center justify-between px-0.5 gap-2">
        <span className="text-label font-medium text-muted-foreground/85">
          Deconstruct into IAP library
        </span>
        <button
          onClick={() => void startBackfill()}
          disabled={isRunning || pending.length === 0}
          className="shrink-0 flex items-center gap-1 h-6 px-2 rounded border border-primary/30 text-label font-medium text-interactive hover:bg-primary/20 active:bg-primary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          data-testid="deconstruct-all"
        >
          {isRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {isRunning
            ? progress
              ? `Classifying ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`
              : "Deconstructing…"
            : `Deconstruct all${pending.length > 0 ? ` (${pending.length})` : ""}`}
        </button>
      </div>
      {isRunning && progress && (
        <div className="px-0.5" data-testid="deconstruct-progress">
          <div className="h-1.5 w-full rounded-full bg-foreground/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
              style={{ width: `${Math.max(4, Math.round((progress.done / Math.max(1, progress.total)) * 100))}%` }}
            />
          </div>
        </div>
      )}
      <div className={cn("space-y-1", creativeAssets.length > 6 && "max-h-48 overflow-y-auto pr-1")}>
        {creativeAssets.map((asset) => {
          const d = byImportId.get(asset.id);
          return (
            <div key={asset.id} className="flex items-center gap-2 px-2 py-1 rounded border border-border/30 bg-foreground/[0.015]">
              <span className="flex-1 min-w-0 truncate text-caption text-foreground/85">{asset.filename}</span>
              {d && d.status !== "discarded" ? (
                <>
                  {d.overall_confidence != null && (
                    <span className="text-label tabular-nums text-muted-foreground/80">
                      {Math.round(d.overall_confidence * 100)}%
                    </span>
                  )}
                  <DeconstructBadge status={d.status} />
                  {d.status === "unsupported" && (
                    <button
                      onClick={() => void start([asset.id])}
                      disabled={isRunning}
                      className="shrink-0 h-6 px-2 rounded border border-border/50 text-label font-medium text-muted-foreground/85 hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      aria-label={`Retry deconstruct ${asset.filename}`}
                    >
                      Retry
                    </button>
                  )}
                </>
              ) : (
                <>
                  <span className="text-label text-muted-foreground/75">Not classified</span>
                  <button
                    onClick={() => void start([asset.id])}
                    disabled={isRunning}
                    className="shrink-0 h-6 px-2 rounded border border-border/50 text-label font-medium text-muted-foreground/85 hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    aria-label={`Deconstruct ${asset.filename}`}
                  >
                    Deconstruct
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="px-0.5">
        <p className="text-label text-foreground/70 font-medium">Classification grades each creative against the IAP variable registry.</p>
        <p className="text-label text-muted-foreground/75 leading-relaxed mt-0.5">
          ≥80% confidence files into the library automatically; anything lower waits in the IAP Library review queue. Videos are classified from extracted keyframes.
        </p>
      </div>
    </div>
  );
}

export function CreativeLibraryPanel({
  accountId,
  availableAdNames,
  onDone,
}: {
  accountId: string;
  availableAdNames: string[];
  onDone?: () => void;
}) {
  const { data, refetch } = useListManualImports(accountId);
  const queryClient = useQueryClient();
  const imports = data?.imports ?? [];
  const creativeAssets = imports.filter((i) => i.kind === "creative_asset");
  const mappedCount = creativeAssets.filter((a) => a.ad_names.length > 0).length;

  const refresh = () => {
    void refetch();
    void queryClient.invalidateQueries({ queryKey: getListManualImportsQueryKey(accountId) });
  };

  const knownAdNames = new Set(creativeAssets.flatMap((a) => a.ad_names));

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2.5 p-3 rounded-lg border border-primary/20 bg-primary/[0.04]">
        <ListChecks className="w-4 h-4 text-interactive shrink-0 mt-0.5" />
        <p className="text-caption text-foreground/80 leading-relaxed">
          Map each file to an ad from this account's existing analysis using the dropdown below —
          mappings save immediately, no separate confirm step.
        </p>
      </div>
      <CreativeUploadSection
        accountId={accountId}
        imports={imports}
        knownAdNames={knownAdNames}
        availableAdNames={availableAdNames}
        onChanged={refresh}
      />
      <CreativeDeconstructSection accountId={accountId} creativeAssets={creativeAssets} />
      {onDone && (
        <div className="flex items-center justify-between pt-2 border-t border-border/30">
          <span className="text-caption text-muted-foreground/85">
            {creativeAssets.length > 0
              ? `${mappedCount} of ${creativeAssets.length} files mapped`
              : "No files staged yet"}
          </span>
          <PrimaryBtn onClick={onDone}>
            <CheckCircle2 className="w-3.5 h-3.5" /> Done
          </PrimaryBtn>
        </div>
      )}
    </div>
  );
}

export function CreativeLibraryDialog({
  account,
  open,
  onOpenChange,
}: {
  account: AdAccount;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);

  const availableAdNames = useMemo(
    () => Array.from(new Set((account.ads ?? []).map((a) => a.ad_name))).sort(),
    [account.ads]
  );

  const { data: importsData } = useListManualImports(account.id);
  const unmappedCreatives = (importsData?.imports ?? []).filter(
    (i) => i.kind === "creative_asset" && i.ad_names.length === 0
  );
  const deleteMutation = useDeleteManualImport();

  const doClose = () => {
    onOpenChange(false);
    queryClient.invalidateQueries({ queryKey: getGetMetrixSeedQueryKey() });
  };

  // All close paths (X button, click-outside, onDone) go through here so the
  // guard fires consistently whenever unmapped creatives exist.
  const handleOpenChange = (o: boolean) => {
    if (!o && unmappedCreatives.length > 0) {
      setShowDiscardConfirm(true);
      return;
    }
    if (!o) doClose();
    else onOpenChange(true);
  };

  const handleConfirmDiscard = async () => {
    setDiscarding(true);
    setDiscardError(null);
    const failed: string[] = [];
    try {
      for (const asset of unmappedCreatives) {
        try {
          await deleteMutation.mutateAsync({ accountId: account.id, importId: asset.id });
        } catch {
          failed.push(asset.filename);
        }
      }
    } finally {
      setDiscarding(false);
      // Refresh so the list reflects whichever deletes succeeded (avoids
      // stale unmapped rows re-appearing on the next open or retry).
      void queryClient.invalidateQueries({ queryKey: getListManualImportsQueryKey(account.id) });
    }
    if (failed.length > 0) {
      // Stay open so the user can retry or map the remaining files.
      setDiscardError(
        `Could not delete ${failed.length === 1 ? `"${failed[0]}"` : `${failed.length} files`}. Try again or map ${failed.length === 1 ? "it" : "them"} manually.`
      );
      return;
    }
    setShowDiscardConfirm(false);
    doClose();
  };

  return (
    <>
      <AlertDialog open={showDiscardConfirm} onOpenChange={(o) => { if (!o && !discarding) setShowDiscardConfirm(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unmapped files?</AlertDialogTitle>
            <AlertDialogDescription>
              {unmappedCreatives.length === 1
                ? "1 creative file has no ad mapping yet."
                : `${unmappedCreatives.length} creative files have no ad mapping yet.`}{" "}
              Closing now will permanently delete{" "}
              {unmappedCreatives.length === 1 ? "it" : "them"} — this cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {discardError && (
            <p className="px-1 text-caption text-destructive">{discardError}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={discarding} onClick={() => { setShowDiscardConfirm(false); setDiscardError(null); }}>
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={discarding}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleConfirmDiscard()}
            >
              {discarding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Discard {unmappedCreatives.length === 1 ? "file" : "files"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="flex flex-col max-w-md max-h-[90vh] p-0 gap-0"
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <div className="flex-none px-6 pt-6 pb-4">
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-lg border border-border/40 bg-foreground/[0.03] flex items-center justify-center">
                  <Images className="w-4 h-4 text-interactive" />
                </div>
              </div>
              <DialogTitle className={DIALOG.title}>Upload Creatives</DialogTitle>
              <DialogDescription className="text-body leading-relaxed">
                Add creative files to{" "}
                <span className="text-foreground/80 font-medium">{account.name}</span> after the fact —
                they render immediately and map to ads already in its IAP analysis.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6">
            <CreativeLibraryPanel
              accountId={account.id}
              availableAdNames={availableAdNames}
              onDone={() => handleOpenChange(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Add Manual Import dialog ─────────────────────────────────────────

export function ManualImportDialog({
  account,
  open,
  onOpenChange,
}: {
  account: AdAccount;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);

  // Same real-ads registry the Creative Library dialog uses — keeps
  // dropdown mapping / auto-matching behavior identical across both
  // entry points instead of falling back to free-text here.
  const availableAdNames = useMemo(
    () => Array.from(new Set((account.ads ?? []).map((a) => a.ad_name))).sort(),
    [account.ads]
  );

  const { data: importsData } = useListManualImports(account.id);
  const unmappedCreatives = (importsData?.imports ?? []).filter(
    (i) => i.kind === "creative_asset" && i.ad_names.length === 0
  );
  const deleteMutation = useDeleteManualImport();

  const doClose = () => {
    onOpenChange(false);
    queryClient.invalidateQueries({ queryKey: getGetMetrixSeedQueryKey() });
  };

  // All close paths (X button, click-outside, onDone) go through here so the
  // guard fires consistently whenever unmapped creatives exist.
  const handleOpenChange = (o: boolean) => {
    if (!o && unmappedCreatives.length > 0) {
      setShowDiscardConfirm(true);
      return;
    }
    if (!o) doClose();
    else onOpenChange(true);
  };

  const handleConfirmDiscard = async () => {
    setDiscarding(true);
    setDiscardError(null);
    const failed: string[] = [];
    try {
      for (const asset of unmappedCreatives) {
        try {
          await deleteMutation.mutateAsync({ accountId: account.id, importId: asset.id });
        } catch {
          failed.push(asset.filename);
        }
      }
    } finally {
      setDiscarding(false);
      // Refresh so the list reflects whichever deletes succeeded (avoids
      // stale unmapped rows re-appearing on the next open or retry).
      void queryClient.invalidateQueries({ queryKey: getListManualImportsQueryKey(account.id) });
    }
    if (failed.length > 0) {
      // Stay open so the user can retry or map the remaining files.
      setDiscardError(
        `Could not delete ${failed.length === 1 ? `"${failed[0]}"` : `${failed.length} files`}. Try again or map ${failed.length === 1 ? "it" : "them"} manually.`
      );
      return;
    }
    setShowDiscardConfirm(false);
    doClose();
  };

  return (
    <>
      <AlertDialog open={showDiscardConfirm} onOpenChange={(o) => { if (!o && !discarding) setShowDiscardConfirm(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unmapped files?</AlertDialogTitle>
            <AlertDialogDescription>
              {unmappedCreatives.length === 1
                ? "1 creative file has no ad mapping yet."
                : `${unmappedCreatives.length} creative files have no ad mapping yet.`}{" "}
              Closing now will permanently delete{" "}
              {unmappedCreatives.length === 1 ? "it" : "them"} — this cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {discardError && (
            <p className="px-1 text-caption text-destructive">{discardError}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={discarding} onClick={() => { setShowDiscardConfirm(false); setDiscardError(null); }}>
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={discarding}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void handleConfirmDiscard()}
            >
              {discarding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Discard {unmappedCreatives.length === 1 ? "file" : "files"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="flex flex-col max-w-md max-h-[90vh] p-0 gap-0"
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <div className="flex-none px-6 pt-6 pb-4">
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-lg border border-border/40 bg-foreground/[0.03] flex items-center justify-center">
                  <FileUp className="w-4 h-4 text-interactive" />
                </div>
              </div>
              <DialogTitle className={DIALOG.title}>Add Manual Import</DialogTitle>
              <DialogDescription className="text-body leading-relaxed">
                Upload the two required exports for{" "}
                <span className="text-foreground/80 font-medium">{account.name}</span>, plus any
                creative files. Files are staged for the analysis pipeline — performance data appears
                only after you explicitly run analysis from the account's setup screen.
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6">
            <ManualUploadPanel
              accountId={account.id}
              availableAdNames={availableAdNames}
              onDone={() => handleOpenChange(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
