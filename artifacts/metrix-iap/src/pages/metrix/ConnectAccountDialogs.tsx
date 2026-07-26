// ─── Connect / manual-import flows for unconfigured accounts ──────────
// Real flows: ManualImportDialog stages actual file uploads against the
// API (stored raw for the analysis pipeline — never parsed into
// performance data at upload time), and ConnectMetaDialog hands off to
// the live Meta OAuth flow in Settings → Integrations.
//
// Manual imports require the two exact IAP CSV templates (Demographics +
// Placements) plus optional individual creative files with an editable
// ad-name mapping. Date range selection does NOT live here — it belongs
// only to the explicit "Run analysis" step (see AnalysisControls),
// which is surfaced from the account setup screen, not this dialog.

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useStageManualImport,
  useListManualImports,
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
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import {
  Plug,
  FileUp,
  ShieldCheck,
  Database,
  CheckCircle2,
  Clock,
  ArrowRight,
  ArrowLeft,
  Upload,
  FileSpreadsheet,
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
  ArrowLeftRight,
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
      className="flex items-center gap-1.5 h-9 px-4 rounded-md border border-border/50 text-body font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
    >
      {children}
    </button>
  );
}

// ─── Connect Meta Ad Account ──────────────────────────────────────────
// The live Meta OAuth connection lives in Settings → Integrations. This
// dialog explains the flow and hands off — it never fakes a connection.

export function ConnectMetaDialog({
  account,
  open,
  onOpenChange,
}: {
  account: AdAccount;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [, navigate] = useLocation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg border border-border/40 bg-white/[0.03] flex items-center justify-center">
              <Plug className="w-4 h-4 text-interactive" />
            </div>
          </div>
          <DialogTitle className="text-base">Connect Meta Ad Account</DialogTitle>
          <DialogDescription className="text-body leading-relaxed">
            Link a live Meta ad account so Metrix can pull real performance data for{" "}
            <span className="text-foreground/80 font-medium">{account.name}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {[
            {
              Icon: ShieldCheck,
              title: "1 · Authorize with Meta",
              desc: "Sign in with the Meta Business account that owns the ad account. Metrix requests read-only ads access (ads_read) — it can never edit campaigns.",
            },
            {
              Icon: Database,
              title: "2 · Select the ad account",
              desc: "Pick which ad account to link. Metrix scopes every module to exactly one ad account — no cross-account blending.",
            },
            {
              Icon: Clock,
              title: "3 · Pull reports",
              desc: "Run the initial report pulls. Analysis surfaces stay honestly pending until the analysis pipeline processes the pulled data.",
            },
          ].map(({ Icon, title, desc }) => (
            <div key={title} className="flex items-start gap-3 p-3 rounded-lg border border-border/40 bg-white/[0.02]">
              <Icon className="w-4 h-4 text-interactive/80 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-body font-semibold text-foreground">{title}</div>
                <p className="text-caption text-muted-foreground/85 leading-relaxed mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <GhostBtn onClick={() => onOpenChange(false)}>Cancel</GhostBtn>
          <PrimaryBtn
            onClick={() => {
              onOpenChange(false);
              navigate("/app/settings/integrations");
            }}
          >
            Go to Integrations <ArrowRight className="w-3.5 h-3.5" />
          </PrimaryBtn>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Manual import upload panel (shared) ──────────────────────────────

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/**
 * Base64-encodes a file via FileReader.readAsDataURL — the browser does
 * the encoding natively off the main thread, unlike the previous
 * arrayBuffer + String.fromCharCode loop which froze the UI for large
 * (multi-MB) video files.
 */
function fileToBase64(file: File): Promise<string> {
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

const CSV_SLOTS: {
  kind: "performance_demo_csv" | "performance_placement_csv" | "performance_ad_summary_csv";
  csvClass: IapCsvClassKey;
  title: string;
  desc: string;
  optional?: boolean;
}[] = [
  {
    kind: "performance_demo_csv",
    csvClass: "demographic",
    title: "Demographics CSV",
    desc: "Exact export of the IAP_DEMOGRAPHIC_TEXT_SIGNAL pivot template (age/gender/body-text breakdowns).",
  },
  {
    kind: "performance_placement_csv",
    csvClass: "device_placement",
    title: "Placements CSV",
    desc: "Exact export of the IAP_DEVICE_PLACEMENT_PLATFORM_SIGNAL pivot template (device/platform/placement breakdowns).",
  },
  {
    kind: "performance_ad_summary_csv",
    csvClass: "ad_summary",
    title: "Ad Summary CSV",
    desc: "Ad-level export with no breakdown (one row per ad per day). Provides full spend unaffected by iOS privacy limits — fixes underreported spend totals from the Demographics CSV.",
    optional: true,
  },
];

function UploadProgressBar({ pct, label }: { pct: number; label: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-label text-muted-foreground/85">
        <span className="flex items-center gap-1.5 truncate">
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> {label}
        </span>
        <span className="shrink-0 tabular-nums">{pct}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
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
    <div className="rounded-lg border border-border/40 bg-white/[0.02] p-3 space-y-2">
      <div className="text-caption font-semibold text-foreground/75">After re-upload</div>
      {diff.nowFound.length > 0 && (
        <div className="space-y-1">
          {diff.nowFound.map((col) => (
            <div key={col} className="flex items-center gap-2 text-label">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="font-medium text-emerald-300">{col}</span>
              <span className="text-emerald-400/55">— now found</span>
            </div>
          ))}
        </div>
      )}
      {diff.stillMissing.length > 0 && (
        <div className="space-y-1">
          {diff.stillMissing.map((col) => (
            <div key={col} className="flex items-center gap-2 text-label">
              <XCircle className="w-3.5 h-3.5 text-red-400/80 shrink-0" />
              <span className="font-medium text-red-300">{col}</span>
              <span className="text-red-400/55">— still missing</span>
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
  const missing = nonExact.filter((e) => e.tier === "missing");

  if (nonExact.length === 0) return null;

  const headerLabel = [
    resolved.length > 0 && `${resolved.length} auto-resolved`,
    missing.length > 0 && `${missing.length} missing`,
  ]
    .filter(Boolean)
    .join(" · ");

  const headerColor =
    missing.length > 0
      ? "border-amber-400/25 bg-amber-400/[0.04]"
      : "border-emerald-400/20 bg-emerald-400/[0.03]";
  const chevronColor =
    missing.length > 0 ? "text-amber-400/80" : "text-emerald-400/80";
  const iconColor =
    missing.length > 0 ? "text-amber-400" : "text-emerald-400";

  return (
    <div className={cn("rounded-lg border overflow-hidden", headerColor)}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/[0.02] transition-colors"
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
        <div className="px-3 pb-3 space-y-1 border-t border-white/[0.04]">
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
                        ? "bg-emerald-400/[0.06] border border-emerald-400/15"
                        : "bg-amber-400/[0.06] border border-amber-400/15"
                    )}
                  >
                    <CheckCircle2
                      className={cn(
                        "w-3.5 h-3.5 shrink-0 mt-px",
                        isHigh ? "text-emerald-400" : "text-amber-400"
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-foreground/90">{e.canonical}</span>
                      {e.found_as && e.found_as !== e.canonical && (
                        <span className="text-muted-foreground/70"> ← {e.found_as}</span>
                      )}
                      <span
                        className={cn(
                          "ml-1.5 text-label font-semibold uppercase tracking-wide",
                          isHigh ? "text-emerald-400/80" : "text-amber-400/80"
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

          {missing.length > 0 && (
            <div className={cn("pt-2 space-y-1", resolved.length > 0 && "mt-1")}>
              {missing.length > 0 && (
                <p className="text-label uppercase tracking-wide font-semibold text-muted-foreground/60 pb-0.5">
                  Missing columns
                </p>
              )}
              {missing.map((e) => (
                <div
                  key={e.canonical}
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-label bg-red-400/[0.06] border border-red-400/15"
                >
                  <XCircle className="w-3.5 h-3.5 shrink-0 text-red-400/80" />
                  <span className="font-medium text-foreground/80 min-w-0 truncate">{e.canonical}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CsvSlotUpload({
  optional,
  accountId,
  kind,
  csvClass,
  title,
  desc,
  staged,
  onStaged,
  onRemoved,
  highlightAsTarget,
  onMismatch,
}: {
  accountId: string;
  kind: "performance_demo_csv" | "performance_placement_csv" | "performance_ad_summary_csv";
  csvClass: IapCsvClassKey;
  title: string;
  desc: string;
  optional?: boolean;
  staged: ManualImport | null;
  onStaged: () => void;
  onRemoved: () => void;
  highlightAsTarget?: boolean;
  onMismatch?: (targetCsvClass: IapCsvClassKey | null) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [mappingSummary, setMappingSummary] = useState<ColumnMappingSummaryEntry[] | null>(
    staged?.mapping_summary && staged.mapping_summary.length > 0 ? staged.mapping_summary : null
  );
  const [mappingDiff, setMappingDiff] = useState<{ nowFound: string[]; stillMissing: string[] } | null>(null);
  const prevMappingSummaryRef = useRef<ColumnMappingSummaryEntry[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const deleteMutation = useDeleteManualImport();

  useEffect(() => {
    if (staged?.mapping_summary && staged.mapping_summary.length > 0) {
      setMappingSummary(staged.mapping_summary);
    } else {
      setMappingSummary(null);
    }
  }, [staged]);

  const isMismatch = Boolean(error?.includes("Did you upload it in the wrong slot?"));

  /** Stages a file immediately. Accepts the file directly so it can be called
   *  from the onChange handler before React state for `file` has settled. */
  const handleStage = async (fileToStage: File) => {
    setError(null);
    // Capture the previous mapping summary before clearing so we can diff
    // against it once the new file's summary arrives (re-upload scenario).
    if (mappingSummary && mappingSummary.length > 0) {
      prevMappingSummaryRef.current = mappingSummary;
    }
    setMappingSummary(null);
    setMappingDiff(null);
    onMismatch?.(null);
    if (fileToStage.size > MAX_UPLOAD_BYTES) {
      setError("File is too large — the limit is 8 MB.");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setFile(fileToStage);
    setUploadPct(0);
    try {
      const content_base64 = await fileToBase64(fileToStage);
      const result = await stageManualImportWithProgress(
        accountId,
        { kind, filename: fileToStage.name, content_type: fileToStage.type || undefined, content_base64 },
        setUploadPct
      );
      const newSummary = result.mapping_summary ?? [];
      if (newSummary.length > 0) {
        setMappingSummary(newSummary);
      }
      // Diff against the previous file's summary if this is a re-upload.
      const prev = prevMappingSummaryRef.current;
      if (prev && prev.length > 0) {
        const prevMissingCols = new Set(
          prev.filter((e) => e.tier === "missing").map((e) => e.canonical)
        );
        if (prevMissingCols.size > 0) {
          const newMissingCols = new Set(
            newSummary.filter((e) => e.tier === "missing").map((e) => e.canonical)
          );
          const nowFound = [...prevMissingCols].filter((col) => !newMissingCols.has(col));
          const stillMissing = [...prevMissingCols].filter((col) => newMissingCols.has(col));
          if (nowFound.length > 0 || stillMissing.length > 0) {
            setMappingDiff({ nowFound, stillMissing });
          }
        }
        prevMappingSummaryRef.current = null;
      }
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      onStaged();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed. Check your connection and try again.";
      setError(msg);
      if (msg.includes("Did you upload it in the wrong slot?")) {
        const targetClass: IapCsvClassKey = msg.includes("Device/Placement CSV instead")
          ? "device_placement"
          : "demographic";
        onMismatch?.(targetClass);
      } else {
        onMismatch?.(null);
      }
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } finally {
      setUploadPct(null);
    }
  };

  const handleRemove = async () => {
    if (!staged) return;
    // Preserve the current mapping summary so the next upload can diff against it.
    if (mappingSummary && mappingSummary.length > 0) {
      prevMappingSummaryRef.current = mappingSummary;
    }
    setMappingSummary(null);
    setMappingDiff(null);
    await deleteMutation.mutateAsync({ accountId, importId: staged.id });
    onRemoved();
  };

  return (
    <div className={cn("space-y-2 rounded-lg transition-colors", highlightAsTarget && "ring-1 ring-amber-400/40 ring-offset-2 ring-offset-background p-2 -m-2")}>
      {highlightAsTarget && (
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-amber-400/35 bg-amber-400/[0.07]">
          <ArrowLeftRight className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-caption text-amber-300 font-semibold">Upload the misplaced file here instead</span>
        </div>
      )}

      <div className="flex items-start gap-3 p-3 rounded-lg border border-border/40 bg-white/[0.02]">
        <FileSpreadsheet className={cn("w-4 h-4 shrink-0 mt-0.5", staged ? "text-emerald-400" : "text-muted-foreground/85")} />
        <div className="min-w-0 flex-1">
          <div className="text-body font-semibold text-foreground">
            {title}{" "}
            {optional
              ? <span className="text-muted-foreground/60 font-normal">(optional)</span>
              : <span className="text-red-400/80 font-normal">*required</span>}
          </div>
          <p className="text-caption text-muted-foreground/85 leading-relaxed mt-0.5">{desc}</p>
        </div>
      </div>

      <RequiredFormatPanel csvClass={csvClass} />

      {staged ? (
        <div className="flex items-center gap-2 p-2 rounded-md border border-emerald-400/20 bg-emerald-400/[0.05]">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="text-caption text-foreground/80 truncate">{staged.filename}</span>
          <span className="text-label font-semibold uppercase tracking-wide text-emerald-400/90 ml-auto shrink-0 mr-1">Staged</span>
          <button
            onClick={() => void handleRemove()}
            disabled={deleteMutation.isPending}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded text-muted-foreground/80 hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            aria-label={`Remove ${staged.filename}`}
          >
            {deleteMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      ) : (
        <>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleStage(f);
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploadPct !== null}
            className={cn(
              "w-full flex flex-col items-center gap-1.5 p-4 rounded-lg border border-dashed transition-colors",
              uploadPct !== null
                ? "border-primary/30 bg-primary/[0.03] cursor-not-allowed"
                : highlightAsTarget
                ? "border-amber-400/50 bg-amber-400/[0.05] hover:border-amber-400/70 hover:bg-amber-400/[0.08] cursor-pointer"
                : "border-border/60 hover:border-primary/40 hover:bg-white/[0.02] cursor-pointer"
            )}
          >
            {uploadPct !== null ? (
              <Loader2 className="w-4 h-4 text-interactive animate-spin" />
            ) : highlightAsTarget ? (
              <Upload className="w-4 h-4 text-amber-400" />
            ) : (
              <Upload className="w-4 h-4 text-muted-foreground/85" />
            )}
            <span className={cn("text-caption", highlightAsTarget ? "text-amber-300/90" : "text-muted-foreground/80")}>
              {uploadPct !== null
                ? `Uploading${file ? ` ${file.name}` : ""}…`
                : highlightAsTarget
                ? "Click to upload the misplaced file here"
                : "Click to choose a .csv file — uploads immediately"}
            </span>
          </button>
          {uploadPct !== null && <UploadProgressBar pct={uploadPct} label={`Uploading ${file?.name ?? title}…`} />}
        </>
      )}

      {mappingDiff && <CsvMappingDiffCallout diff={mappingDiff} />}

      {mappingSummary && <CsvMappingPanel summary={mappingSummary} />}

      {error && (
        isMismatch ? (
          <div className="rounded-lg border border-amber-400/30 bg-amber-400/[0.06] p-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <ArrowLeftRight className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="text-body font-semibold text-amber-300">File uploaded to wrong slot</span>
            </div>
            <p className="text-caption text-amber-200/80 leading-relaxed pl-[1.375rem]">{error}</p>
          </div>
        ) : (
          <div className="flex items-start gap-2 p-2.5 rounded-lg border border-red-400/25 bg-red-400/[0.06]">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
            <p className="text-caption text-red-300 leading-relaxed">{error}</p>
          </div>
        )
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
          className="flex items-center gap-1.5 h-7 px-2.5 rounded bg-white/[0.03] border border-border/50 text-caption text-foreground hover:border-primary/40 transition-colors cursor-pointer"
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
    fuzzy: { icon: Sparkles, label: "Matched by filename similarity", className: "bg-white/[0.06] text-muted-foreground/85" },
    guess: { icon: Sparkles, label: "Best guess — please review", className: "bg-amber-400/10 text-amber-300" },
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
      className="w-10 h-10 rounded-md border border-border/40 bg-black/20 overflow-hidden shrink-0 flex items-center justify-center"
    >
      {broken ? (
        <Images className="w-4 h-4 text-muted-foreground/60" />
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
        "p-2 rounded-md border bg-white/[0.02] space-y-1.5",
        asset.ad_names.length > 0 ? "border-border/30" : "border-amber-400/30 bg-amber-400/[0.03]"
      )}
    >
      <div className="flex items-center gap-2">
        <CreativeThumbnail accountId={accountId} asset={asset} />
        <span className="text-caption text-foreground/80 truncate flex-1">{asset.filename}</span>
        {updateMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground/70 shrink-0" />}
      </div>

      {hasRegistry ? (
        <div className="flex items-center gap-1.5 flex-wrap">
          <AdNameDropdownPicker
            availableAdNames={availableAdNames!}
            selected={asset.ad_names}
            onChange={(names) => void handleDropdownChange(names)}
            defaultOpen={autoFocusPicker && asset.ad_names.length === 0}
          />
          {asset.ad_names.length > 0 && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
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
            className="flex-1 h-7 px-2 rounded bg-white/[0.03] border border-border/50 text-caption text-foreground placeholder:text-muted-foreground/75 focus:outline-none focus:border-primary/40 focus-visible:ring-1 focus-visible:ring-ring"
          />
          <button
            onClick={() => void handleFreeSave()}
            disabled={updateMutation.isPending}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded text-emerald-400 hover:bg-emerald-400/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded text-muted-foreground/80 hover:bg-white/5 transition-colors cursor-pointer"
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
        <div className="flex items-start gap-1.5 text-label text-amber-400/90">
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
        failures.push(`${file.name} is too large — the limit is 8 MB.`);
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
      <div className="flex items-start gap-3 p-3 rounded-lg border border-border/40 bg-white/[0.02]">
        <Images className="w-4 h-4 text-muted-foreground/85 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="text-body font-semibold text-foreground">Creative library <span className="text-muted-foreground/80 font-normal">(optional)</span></div>
          <p className="text-caption text-muted-foreground/85 leading-relaxed mt-0.5">
            Stage individual ad creative files (images/videos) so they render immediately. Map each
            file to the ad name(s) it represents — filenames matching an ad name are pre-mapped.
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
            : "border-border/60 hover:border-primary/40 hover:bg-white/[0.02] cursor-pointer"
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
            : "Choose one or more creative files (max 8 MB each)"}
        </span>
      </button>

      {isUploading && currentFile && (
        <UploadProgressBar
          pct={currentPct}
          label={queueTotal > 1 ? `File ${queueIndex} of ${queueTotal} — ${currentFile}` : currentFile}
        />
      )}

      {errors.length > 0 && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg border border-red-400/25 bg-red-400/[0.06]">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
          <div className="text-caption text-red-300 leading-relaxed space-y-0.5">
            {errors.map((msg, i) => (
              <p key={i}>{msg}</p>
            ))}
          </div>
        </div>
      )}

      {linkNotices.length > 0 && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg border border-amber-400/25 bg-amber-400/[0.06]">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-caption text-amber-300 leading-relaxed space-y-0.5">
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
              <span className="text-label text-amber-400/90">Pick an ad name for each highlighted file below</span>
            )}
            {unmappedAssets.length > 0 && matchCandidates.size > 0 && (
              <button
                onClick={() => void handleAutoMapAll()}
                disabled={autoMapping}
                className="shrink-0 flex items-center gap-1 h-6 px-2 rounded border border-primary/30 bg-primary/10 text-label font-medium text-interactive hover:bg-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
                className="shrink-0 mt-2 w-7 h-7 flex items-center justify-center rounded text-muted-foreground/80 hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
                  className="bg-red-600 hover:bg-red-700 text-white focus-visible:ring-red-600"
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
                    ? "bg-emerald-400/20 border-emerald-400/50"
                    : s.partial
                    ? "bg-amber-400/15 border-amber-400/40"
                    : s.active
                    ? "bg-primary/15 border-primary/40"
                    : "bg-white/[0.03] border-border/40"
                )}
              >
                {s.done ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : s.partial ? (
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                ) : s.active ? (
                  <div className="w-2 h-2 rounded-full bg-primary/70" />
                ) : (
                  <div className="w-2 h-2 rounded-full bg-border/60" />
                )}
              </div>
              <div className="min-w-0">
                <div className={cn("text-label font-semibold leading-none", s.done ? "text-emerald-300/90" : s.active ? "text-foreground/90" : "text-muted-foreground/70")}>
                  {s.label}
                </div>
                <div className="text-label text-muted-foreground/60 leading-none mt-0.5">{s.sublabel}</div>
              </div>
            </div>
          </div>
          {i < steps.length - 1 && (
            <div className={cn("h-px flex-shrink-0 w-4", s.done ? "bg-emerald-400/30" : "bg-border/30")} />
          )}
        </div>
      ))}
    </div>
  );
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
  const [highlightSlot, setHighlightSlot] = useState<IapCsvClassKey | null>(null);
  const { data, refetch } = useListManualImports(accountId);
  const queryClient = useQueryClient();
  const imports = data?.imports ?? [];

  const refresh = () => {
    void refetch();
    void queryClient.invalidateQueries({ queryKey: getListManualImportsQueryKey(accountId) });
  };

  const demoImport = imports.find((i) => i.kind === "performance_demo_csv") ?? null;
  const placementImport = imports.find((i) => i.kind === "performance_placement_csv") ?? null;
  const summaryImport = imports.find((i) => i.kind === "performance_ad_summary_csv") ?? null;
  const creativeAssets = imports.filter((i) => i.kind === "creative_asset");
  const guessedImports = guessedCreativeImports(imports);
  const bothRequiredStaged = Boolean(demoImport && placementImport);

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
          <span className="text-label font-bold uppercase tracking-[0.14em] text-muted-foreground/40">Step 2 of 2 — Review</span>
        </div>
        <PipelineProgress
          demoStaged={Boolean(demoImport)}
          placementStaged={Boolean(placementImport)}
          creativesCount={creativeAssets.length}
          onAnalysis={true}
        />
        {/* Upload summary */}
        <div className="rounded-lg border border-border/40 bg-white/[0.02] p-3 space-y-2">
          <div className="text-body font-semibold text-foreground">Files staged</div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-caption">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-foreground/80 truncate">Demographics — {demoImport?.filename}</span>
            </div>
            <div className="flex items-center gap-2 text-caption">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-foreground/80 truncate">Placements — {placementImport?.filename}</span>
            </div>
            {summaryImport && (
              <div className="flex items-center gap-2 text-caption">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="text-foreground/80 truncate">Ad Summary — {summaryImport.filename}</span>
              </div>
            )}
            {creativeAssets.length > 0 ? (
              creativeAssets.map((a) => (
                <div key={a.id} className="flex items-center gap-2 text-caption">
                  <Images className="w-3.5 h-3.5 text-muted-foreground/85 shrink-0" />
                  <span className="text-foreground/80 truncate">{a.filename}</span>
                  <span className="text-muted-foreground/80 truncate">
                    {a.ad_names.length > 0 ? `→ ${a.ad_names.join(", ")}` : "→ unmapped"}
                  </span>
                  {a.match_method === "guess" && <MatchMethodBadge method="guess" />}
                </div>
              ))
            ) : (
              <div className="text-caption text-muted-foreground/80">No creative files staged.</div>
            )}
          </div>
        </div>

        {/* Spend coverage notice — shown when Ad Summary CSV is absent */}
        {!summaryImport && (
          <div className="rounded-lg border border-amber-400/25 bg-amber-400/[0.05] p-3 space-y-1.5">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0 space-y-1">
                <div className="text-caption font-semibold text-amber-200">Spend totals will be underreported</div>
                <p className="text-label text-amber-100/65 leading-relaxed">
                  Meta's demographic export only captures ~10–15% of actual spend — iOS privacy attribution limits
                  prevent the rest from being assigned to a gender/age segment. Upload an{" "}
                  <strong className="text-amber-200/90">Ad Summary CSV</strong> (ad-level, no breakdown) from Meta
                  Ads Manager to get accurate spend figures across all your ads.
                </p>
              </div>
            </div>
            <button
              onClick={() => setStep("upload")}
              className="text-caption text-amber-300/80 underline underline-offset-2 hover:text-amber-200 transition-colors"
            >
              ← Go back and add Ad Summary CSV
            </button>
          </div>
        )}

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
        <span className="text-label font-bold uppercase tracking-[0.14em] text-muted-foreground/40">Step 1 of 2 — Upload files</span>
      </div>
      <PipelineProgress
        demoStaged={Boolean(demoImport)}
        placementStaged={Boolean(placementImport)}
        creativesCount={creativeAssets.length}
        onAnalysis={false}
      />
      {CSV_SLOTS.map((slot) => (
        <CsvSlotUpload
          key={slot.kind}
          accountId={accountId}
          kind={slot.kind}
          csvClass={slot.csvClass}
          title={slot.title}
          desc={slot.desc}
          optional={slot.optional}
          staged={
            slot.kind === "performance_demo_csv"
              ? demoImport
              : slot.kind === "performance_placement_csv"
              ? placementImport
              : summaryImport
          }
          onStaged={() => { setHighlightSlot(null); refresh(); }}
          onRemoved={refresh}
          highlightAsTarget={highlightSlot === slot.csvClass}
          onMismatch={setHighlightSlot}
        />
      ))}

      <CreativeUploadSection
        accountId={accountId}
        imports={imports}
        knownAdNames={knownAdNames}
        availableAdNames={availableAdNames}
        onChanged={refresh}
      />

      <div className="flex items-center justify-between pt-1 border-t border-border/30 mt-1">
        <p className="text-label text-muted-foreground/75 leading-relaxed max-w-[60%]">
          Both CSVs are required before you can continue. Files are stored raw until an analysis
          run explicitly processes them.
        </p>
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
                <div className="w-8 h-8 rounded-lg border border-border/40 bg-white/[0.03] flex items-center justify-center">
                  <Images className="w-4 h-4 text-interactive" />
                </div>
              </div>
              <DialogTitle className="text-base">Upload Creatives</DialogTitle>
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
                <div className="w-8 h-8 rounded-lg border border-border/40 bg-white/[0.03] flex items-center justify-center">
                  <FileUp className="w-4 h-4 text-interactive" />
                </div>
              </div>
              <DialogTitle className="text-base">Add Manual Import</DialogTitle>
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
