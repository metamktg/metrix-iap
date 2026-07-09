// ─── Connect / manual-import flows for unconfigured accounts ──────────
// Real flows: ManualImportDialog stages actual file uploads against the
// API (stored raw for the analysis pipeline — never parsed into
// performance data at upload time), and ConnectMetaDialog hands off to
// the live Meta OAuth flow in Settings → Integrations.

import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useStageManualImport,
  getGetMetrixSeedQueryKey,
  ApiError,
  type ManualImportResult,
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
  Upload,
  FileSpreadsheet,
  Images,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import type { AdAccount } from "@/lib/data/seedTypes";
import { RequiredFormatPanel, AnalysisControls } from "./ManualAnalysisControls";

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
          ? "border-border/40 text-muted-foreground/60 cursor-not-allowed"
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
                <p className="text-[11px] text-muted-foreground/70 leading-relaxed mt-0.5">{desc}</p>
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

type ImportKind = "performance_csv" | "creative_library";

const IMPORT_KINDS: { id: ImportKind; Icon: React.ComponentType<{ className?: string }>; title: string; desc: string; accept: string }[] = [
  {
    id: "performance_csv",
    Icon: FileSpreadsheet,
    title: "Performance export (CSV)",
    desc: "A Meta Ads Manager export with spend, impressions, and result events per ad.",
    accept: ".csv",
  },
  {
    id: "creative_library",
    Icon: Images,
    title: "Creative library (ZIP)",
    desc: "Ad creative files plus a naming manifest so Metrix can map variables to assets.",
    accept: ".zip",
  },
];

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

/**
 * Reusable upload panel: pick a kind, pick a file, stage it via the API.
 * Files are stored raw for the analysis pipeline — nothing is parsed into
 * performance data at upload time (no fabricated numbers).
 */
export function ManualUploadPanel({
  accountId,
  onStaged,
}: {
  accountId: string;
  onStaged?: (result: ManualImportResult) => void;
}) {
  const [kind, setKind] = useState<ImportKind | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [staged, setStaged] = useState<ManualImportResult[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const stageMutation = useStageManualImport();

  const activeKind = IMPORT_KINDS.find((k) => k.id === kind) ?? null;

  const handleStage = async () => {
    if (!kind || !file) return;
    setError(null);
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("File is too large — the limit is 8 MB.");
      return;
    }
    try {
      const content_base64 = await fileToBase64(file);
      const result = await stageMutation.mutateAsync({
        accountId,
        data: { kind, filename: file.name, content_base64 },
      });
      setStaged((prev) => [...prev, result]);
      setFile(null);
      setKind(null);
      if (fileRef.current) fileRef.current.value = "";
      onStaged?.(result);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Upload failed. Check your connection and try again."
      );
    }
  };

  return (
    <div className="space-y-3">
      <RequiredFormatPanel />
      <div className="space-y-2">
        {IMPORT_KINDS.map(({ id, Icon, title, desc }) => (
          <button
            key={id}
            onClick={() => { setKind(id); setFile(null); if (fileRef.current) fileRef.current.value = ""; }}
            className={cn(
              "w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors",
              kind === id
                ? "border-primary/30 bg-primary/[0.06]"
                : "border-border/40 bg-white/[0.02] hover:bg-white/[0.04]"
            )}
          >
            <Icon className={cn("w-4 h-4 shrink-0 mt-0.5", kind === id ? "text-primary" : "text-muted-foreground/70")} />
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-foreground">{title}</div>
              <p className="text-[11px] text-muted-foreground/70 leading-relaxed mt-0.5">{desc}</p>
            </div>
            {kind === id && <CheckCircle2 className="w-4 h-4 text-primary shrink-0 ml-auto mt-0.5" />}
          </button>
        ))}
      </div>

      {activeKind && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept={activeKind.accept}
            className="hidden"
            onChange={(e) => { setError(null); setFile(e.target.files?.[0] ?? null); }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full flex flex-col items-center gap-1.5 p-5 rounded-lg border border-dashed border-border/60 hover:border-primary/40 hover:bg-white/[0.02] transition-colors"
          >
            <Upload className="w-4 h-4 text-muted-foreground/70" />
            {file ? (
              <span className="text-[12px] font-medium text-foreground">
                {file.name} <span className="text-muted-foreground/60 font-normal">({(file.size / 1024).toFixed(0)} KB)</span>
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground/60">
                Choose a {activeKind.accept} file (max 8 MB)
              </span>
            )}
          </button>
        </>
      )}

      {error && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg border border-red-400/25 bg-red-400/[0.06]">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-red-300 leading-relaxed">{error}</p>
        </div>
      )}

      {staged.length > 0 && (
        <div className="space-y-1.5">
          {staged.map((s) => (
            <div key={s.import_id} className="flex items-center gap-2 p-2 rounded-md border border-emerald-400/20 bg-emerald-400/[0.05]">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-[11px] text-foreground/80 truncate">{s.filename}</span>
              <span className="text-[9px] font-semibold uppercase tracking-wide text-emerald-400/90 ml-auto shrink-0">Staged</span>
            </div>
          ))}
          <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
            Staged files are stored for the analysis pipeline. Performance data appears only
            after an analysis run processes them — nothing is parsed at upload time.
          </p>
        </div>
      )}

      <div className="flex items-center justify-end pt-1">
        <PrimaryBtn onClick={handleStage} disabled={!kind || !file || stageMutation.isPending}>
          {stageMutation.isPending ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…
            </>
          ) : (
            <>
              Stage upload <ArrowRight className="w-3.5 h-3.5" />
            </>
          )}
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg border border-border/40 bg-white/[0.03] flex items-center justify-center">
              <FileUp className="w-4 h-4 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-[16px]">Add Manual Import</DialogTitle>
          <DialogDescription className="text-[12px] leading-relaxed">
            Upload exported reports for{" "}
            <span className="text-foreground/80 font-medium">{account.name}</span>. Files are
            staged for the analysis pipeline — performance data appears after the next
            analysis run, never at upload time.
          </DialogDescription>
        </DialogHeader>
        <ManualUploadPanel accountId={account.id} />
        <div className="pt-3 mt-3 border-t border-border/40">
          <AnalysisControls accountId={account.id} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
