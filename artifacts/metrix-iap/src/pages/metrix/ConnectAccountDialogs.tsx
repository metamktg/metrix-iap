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

import { useEffect, useRef, useState } from "react";
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
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
} from "lucide-react";
import type { AdAccount } from "@/lib/data/seedTypes";
import { RequiredFormatPanel, type IapCsvClassKey } from "./ManualAnalysisControls";

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
        "flex items-center gap-1.5 h-9 px-4 rounded-md border text-[12px] font-medium transition-colors",
        disabled
          ? "border-border/40 text-muted-foreground/80 cursor-not-allowed"
          : "bg-primary/15 border-primary/30 text-primary hover:bg-primary/25"
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
      className="flex items-center gap-1.5 h-9 px-4 rounded-md border border-border/50 text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
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
              <Plug className="w-4 h-4 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-[16px]">Connect Meta Ad Account</DialogTitle>
          <DialogDescription className="text-[12px] leading-relaxed">
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
              <Icon className="w-4 h-4 text-primary/80 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <div className="text-[12px] font-semibold text-foreground">{title}</div>
                <p className="text-[11px] text-muted-foreground/85 leading-relaxed mt-0.5">{desc}</p>
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

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const CSV_SLOTS: { kind: "performance_demo_csv" | "performance_placement_csv"; csvClass: IapCsvClassKey; title: string; desc: string }[] = [
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
];

function CsvSlotUpload({
  accountId,
  kind,
  csvClass,
  title,
  desc,
  staged,
  onStaged,
  onRemoved,
}: {
  accountId: string;
  kind: "performance_demo_csv" | "performance_placement_csv";
  csvClass: IapCsvClassKey;
  title: string;
  desc: string;
  staged: ManualImport | null;
  onStaged: () => void;
  onRemoved: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stageMutation = useStageManualImport();
  const deleteMutation = useDeleteManualImport();

  const handleStage = async () => {
    if (!file) return;
    setError(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("File is too large — the limit is 8 MB.");
      return;
    }
    try {
      const content_base64 = await fileToBase64(file);
      await stageMutation.mutateAsync({
        accountId,
        data: { kind, filename: file.name, content_type: file.type || undefined, content_base64 },
      });
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      onStaged();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Upload failed. Check your connection and try again."
      );
    }
  };

  const handleRemove = async () => {
    if (!staged) return;
    await deleteMutation.mutateAsync({ accountId, importId: staged.id });
    onRemoved();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3 p-3 rounded-lg border border-border/40 bg-white/[0.02]">
        <FileSpreadsheet className={cn("w-4 h-4 shrink-0 mt-0.5", staged ? "text-emerald-400" : "text-muted-foreground/85")} />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-foreground">{title} <span className="text-red-400/80 font-normal">*required</span></div>
          <p className="text-[11px] text-muted-foreground/85 leading-relaxed mt-0.5">{desc}</p>
        </div>
      </div>

      <RequiredFormatPanel csvClass={csvClass} />

      {staged ? (
        <div className="flex items-center gap-2 p-2 rounded-md border border-emerald-400/20 bg-emerald-400/[0.05]">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="text-[11px] text-foreground/80 truncate">{staged.filename}</span>
          <span className="text-[9px] font-semibold uppercase tracking-wide text-emerald-400/90 ml-auto shrink-0 mr-1">Staged</span>
          <button
            onClick={() => void handleRemove()}
            disabled={deleteMutation.isPending}
            className="shrink-0 p-1 rounded text-muted-foreground/80 hover:text-red-400 hover:bg-red-400/10 transition-colors"
            aria-label={`Remove ${staged.filename}`}
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <>
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => { setError(null); setFile(e.target.files?.[0] ?? null); }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full flex flex-col items-center gap-1.5 p-4 rounded-lg border border-dashed border-border/60 hover:border-primary/40 hover:bg-white/[0.02] transition-colors"
          >
            <Upload className="w-4 h-4 text-muted-foreground/85" />
            {file ? (
              <span className="text-[12px] font-medium text-foreground">
                {file.name} <span className="text-muted-foreground/80 font-normal">({(file.size / 1024).toFixed(0)} KB)</span>
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground/80">Choose a .csv file (max 8 MB)</span>
            )}
          </button>
          {file && (
            <div className="flex items-center justify-end">
              <PrimaryBtn onClick={() => void handleStage()} disabled={stageMutation.isPending}>
                {stageMutation.isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…
                  </>
                ) : (
                  <>Stage {title}</>
                )}
              </PrimaryBtn>
            </div>
          )}
        </>
      )}

      {error && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg border border-red-400/25 bg-red-400/[0.06]">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-red-300 leading-relaxed">{error}</p>
        </div>
      )}
    </div>
  );
}

function CreativeAdNamesEditor({
  accountId,
  asset,
  knownAdNames,
  onSaved,
}: {
  accountId: string;
  asset: ManualImport;
  knownAdNames: Set<string>;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(asset.ad_names.join(", "));
  const updateMutation = useUpdateManualImportAdNames();

  const parsedNames = editing
    ? value.split(",").map((s) => s.trim()).filter(Boolean)
    : asset.ad_names;
  const mismatch = parsedNames.length > 0 && parsedNames.some((n) => !knownAdNames.has(n));

  const handleSave = async () => {
    const ad_names = value.split(",").map((s) => s.trim()).filter(Boolean);
    await updateMutation.mutateAsync({ accountId, importId: asset.id, data: { ad_names } });
    setEditing(false);
    onSaved();
  };

  return (
    <div className="p-2 rounded-md border border-border/30 bg-white/[0.02] space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-foreground/80 truncate flex-1">{asset.filename}</span>
        {!editing && (
          <button
            onClick={() => { setValue(asset.ad_names.join(", ")); setEditing(true); }}
            className="shrink-0 p-1 rounded text-muted-foreground/80 hover:text-primary hover:bg-primary/10 transition-colors"
            aria-label="Edit ad name mapping"
          >
            <Pencil className="w-3 h-3" />
          </button>
        )}
      </div>
      {editing ? (
        <div className="flex items-center gap-1.5">
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Ad name(s), comma-separated"
            className="flex-1 h-7 px-2 rounded bg-white/[0.03] border border-border/50 text-[11px] text-foreground placeholder:text-muted-foreground/75 focus:outline-none focus:border-primary/40"
          />
          <button
            onClick={() => void handleSave()}
            disabled={updateMutation.isPending}
            className="shrink-0 p-1 rounded text-emerald-400 hover:bg-emerald-400/10 transition-colors"
            aria-label="Save"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setEditing(false)}
            className="shrink-0 p-1 rounded text-muted-foreground/80 hover:bg-white/5 transition-colors"
            aria-label="Cancel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="text-[10px] text-muted-foreground/85">
          {asset.ad_names.length > 0 ? `Mapped to: ${asset.ad_names.join(", ")}` : "No ad name mapped yet"}
        </div>
      )}
      {mismatch && (
        <div className="flex items-start gap-1.5 text-[10px] text-amber-400/90">
          <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
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
  onChanged,
}: {
  accountId: string;
  imports: ManualImport[];
  knownAdNames: Set<string>;
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const stageMutation = useStageManualImport();
  const deleteMutation = useDeleteManualImport();

  const creativeAssets = imports.filter((i) => i.kind === "creative_asset");

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setPendingCount(files.length);
    try {
      for (const file of Array.from(files)) {
        if (file.size > MAX_UPLOAD_BYTES) {
          setError(`${file.name} is too large — the limit is 8 MB.`);
          continue;
        }
        const content_base64 = await fileToBase64(file);
        const inferredName = file.name.replace(/\.[^/.]+$/, "");
        await stageMutation.mutateAsync({
          accountId,
          data: {
            kind: "creative_asset",
            filename: file.name,
            content_type: file.type || undefined,
            content_base64,
            ad_names: knownAdNames.has(inferredName) ? [inferredName] : [],
          },
        });
      }
      onChanged();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "One or more uploads failed. Check your connection and try again."
      );
    } finally {
      setPendingCount(0);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3 p-3 rounded-lg border border-border/40 bg-white/[0.02]">
        <Images className="w-4 h-4 text-muted-foreground/85 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-foreground">Creative library <span className="text-muted-foreground/80 font-normal">(optional)</span></div>
          <p className="text-[11px] text-muted-foreground/85 leading-relaxed mt-0.5">
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
        disabled={pendingCount > 0}
        className="w-full flex flex-col items-center gap-1.5 p-4 rounded-lg border border-dashed border-border/60 hover:border-primary/40 hover:bg-white/[0.02] transition-colors disabled:opacity-60"
      >
        <Upload className="w-4 h-4 text-muted-foreground/85" />
        {pendingCount > 0 ? (
          <span className="text-[11px] text-muted-foreground/80 flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" /> Uploading {pendingCount} file(s)…
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground/80">Choose one or more creative files (max 8 MB each)</span>
        )}
      </button>

      {error && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg border border-red-400/25 bg-red-400/[0.06]">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-red-300 leading-relaxed">{error}</p>
        </div>
      )}

      {creativeAssets.length > 0 && (
        <div className="space-y-1.5">
          {creativeAssets.map((asset) => (
            <div key={asset.id} className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <CreativeAdNamesEditor
                  accountId={accountId}
                  asset={asset}
                  knownAdNames={knownAdNames}
                  onSaved={onChanged}
                />
              </div>
              <button
                onClick={async () => { await deleteMutation.mutateAsync({ accountId, importId: asset.id }); onChanged(); }}
                className="shrink-0 mt-2 p-1 rounded text-muted-foreground/80 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                aria-label={`Remove ${asset.filename}`}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
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
export function ManualUploadPanel({ accountId }: { accountId: string }) {
  const [step, setStep] = useState<"upload" | "review">("upload");
  const { data, refetch } = useListManualImports(accountId);
  const queryClient = useQueryClient();
  const imports = data?.imports ?? [];

  const refresh = () => {
    void refetch();
    void queryClient.invalidateQueries({ queryKey: getListManualImportsQueryKey(accountId) });
  };

  const demoImport = imports.find((i) => i.kind === "performance_demo_csv") ?? null;
  const placementImport = imports.find((i) => i.kind === "performance_placement_csv") ?? null;
  const creativeAssets = imports.filter((i) => i.kind === "creative_asset");
  const bothRequiredStaged = Boolean(demoImport && placementImport);

  // Ad names actually seen aren't known client-side (CSVs are staged raw,
  // not parsed) — mismatch warnings are informational only, based on
  // whatever ad names other staged creatives already carry.
  const knownAdNames = new Set(creativeAssets.flatMap((a) => a.ad_names));

  if (step === "review") {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-border/40 bg-white/[0.02] p-3 space-y-2">
          <div className="text-[12px] font-semibold text-foreground">Review before finishing</div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-[11px]">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-foreground/80">Demographics CSV — {demoImport?.filename}</span>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-foreground/80">Placements CSV — {placementImport?.filename}</span>
            </div>
            {creativeAssets.length > 0 ? (
              creativeAssets.map((a) => (
                <div key={a.id} className="flex items-center gap-2 text-[11px]">
                  <Images className="w-3.5 h-3.5 text-muted-foreground/85 shrink-0" />
                  <span className="text-foreground/80 truncate">{a.filename}</span>
                  <span className="text-muted-foreground/80 truncate">
                    {a.ad_names.length > 0 ? `→ ${a.ad_names.join(", ")}` : "→ unmapped"}
                  </span>
                </div>
              ))
            ) : (
              <div className="text-[11px] text-muted-foreground/80">No creative files staged.</div>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground/75 leading-relaxed pt-1 border-t border-border/30">
            Nothing has been parsed into performance data yet. Go to the account's setup screen to
            pick a date range and explicitly run analysis over these staged files.
          </p>
        </div>
        <div className="flex items-center justify-between pt-1">
          <GhostBtn onClick={() => setStep("upload")}>
            <ArrowLeft className="w-3.5 h-3.5" /> Back to uploads
          </GhostBtn>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {CSV_SLOTS.map((slot) => (
        <CsvSlotUpload
          key={slot.kind}
          accountId={accountId}
          kind={slot.kind}
          csvClass={slot.csvClass}
          title={slot.title}
          desc={slot.desc}
          staged={slot.kind === "performance_demo_csv" ? demoImport : placementImport}
          onStaged={refresh}
          onRemoved={refresh}
        />
      ))}

      <CreativeUploadSection accountId={accountId} imports={imports} knownAdNames={knownAdNames} onChanged={refresh} />

      <div className="flex items-center justify-between pt-1 border-t border-border/30 mt-1">
        <p className="text-[10px] text-muted-foreground/75 leading-relaxed max-w-[60%]">
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

  const handleOpenChange = (o: boolean) => {
    onOpenChange(o);
    if (!o) {
      // Staged uploads may change account state downstream; keep the seed fresh.
      queryClient.invalidateQueries({ queryKey: getGetMetrixSeedQueryKey() });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg border border-border/40 bg-white/[0.03] flex items-center justify-center">
              <FileUp className="w-4 h-4 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-[16px]">Add Manual Import</DialogTitle>
          <DialogDescription className="text-[12px] leading-relaxed">
            Upload the two required exports for{" "}
            <span className="text-foreground/80 font-medium">{account.name}</span>, plus any
            creative files. Files are staged for the analysis pipeline — performance data appears
            only after you explicitly run analysis from the account's setup screen.
          </DialogDescription>
        </DialogHeader>
        <ManualUploadPanel accountId={account.id} />
      </DialogContent>
    </Dialog>
  );
}
