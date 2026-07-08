// ─── Guided connect / manual-import flows for unconfigured accounts ───
// These are clearly-labeled guided placeholders: they walk the user
// through what a real connection looks like, but never mark the account
// configured and never generate performance data (seed rule).

import { useRef, useState } from "react";
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
} from "lucide-react";
import type { AdAccount } from "@/lib/data/seedTypes";

function PreviewBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest border border-amber-400/25 bg-amber-400/[0.06] text-amber-400/90 px-1.5 py-0.5 rounded leading-none">
      Guided preview
    </span>
  );
}

function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-1 rounded-full transition-all",
            i === step ? "w-5 bg-primary" : i < step ? "w-2 bg-primary/40" : "w-2 bg-border/60"
          )}
        />
      ))}
    </div>
  );
}

function PrimaryBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary/15 border border-primary/30 text-[12px] font-medium text-primary hover:bg-primary/25 transition-colors"
    >
      {children}
    </button>
  );
}

function GhostBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
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

export function ConnectMetaDialog({
  account,
  open,
  onOpenChange,
}: {
  account: AdAccount;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [step, setStep] = useState(0);

  const handleOpenChange = (o: boolean) => {
    onOpenChange(o);
    if (!o) setStep(0);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg border border-border/40 bg-white/[0.03] flex items-center justify-center">
              <Plug className="w-4 h-4 text-primary" />
            </div>
            <PreviewBadge />
          </div>
          <DialogTitle className="text-[16px]">Connect Meta Ad Account</DialogTitle>
          <DialogDescription className="text-[12px] leading-relaxed">
            This guided preview walks through the real connection flow for{" "}
            <span className="text-foreground/80 font-medium">{account.name}</span>. No live
            connection is made and no data is generated.
          </DialogDescription>
        </DialogHeader>

        {step === 0 && (
          <div className="space-y-3">
            {[
              {
                Icon: ShieldCheck,
                title: "1 · Authorize with Meta",
                desc: "Sign in with the Meta Business account that owns this ad account. Metrix requests read-only access to ads, insights, and creative assets.",
              },
              {
                Icon: Database,
                title: "2 · Select the ad account",
                desc: "Choose which ad account to link. Metrix scopes every module to exactly one ad account — no cross-account blending.",
              },
              {
                Icon: Clock,
                title: "3 · Initial sync",
                desc: "Metrix backfills up to 37 months of performance history. Modules unlock as each dataset finishes syncing.",
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
        )}

        {step === 1 && (
          <div className="space-y-3">
            <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/60">
              Select ad account to link
            </div>
            <div className="rounded-lg border border-primary/30 bg-primary/[0.06] p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-md border border-border/40 bg-white/[0.04] flex items-center justify-center text-[11px] font-bold text-foreground/70">
                {account.name.slice(0, 1)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-semibold text-foreground">{account.name}</div>
                <div className="text-[10px] font-mono text-muted-foreground/70">{account.platform} · {account.id}</div>
              </div>
              <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
            </div>
            <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
              In the live flow, every ad account you can access through Meta Business Manager
              would be listed here.
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col items-center text-center gap-3 py-4">
            <div className="w-12 h-12 rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-400/90" />
            </div>
            <div className="space-y-1">
              <div className="text-[14px] font-semibold text-foreground">Connection pending</div>
              <p className="text-[11px] text-muted-foreground/60 leading-relaxed max-w-xs">
                This is where the Meta OAuth handoff and initial sync would begin. Because this is
                a preview environment, {account.name} stays unconfigured and no performance data
                is generated.
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <StepDots step={step} total={3} />
          <div className="flex items-center gap-2">
            {step > 0 && (
              <GhostBtn onClick={() => setStep(step - 1)}>
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </GhostBtn>
            )}
            {step === 0 && (
              <PrimaryBtn onClick={() => setStep(1)}>
                Continue with Meta <ArrowRight className="w-3.5 h-3.5" />
              </PrimaryBtn>
            )}
            {step === 1 && (
              <PrimaryBtn onClick={() => setStep(2)}>
                Link {account.name} <ArrowRight className="w-3.5 h-3.5" />
              </PrimaryBtn>
            )}
            {step === 2 && <PrimaryBtn onClick={() => handleOpenChange(false)}>Done</PrimaryBtn>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Manual Import ────────────────────────────────────────────────

type ImportKind = "performance_csv" | "creative_library";

const IMPORT_KINDS: { id: ImportKind; Icon: React.ComponentType<{ className?: string }>; title: string; desc: string }[] = [
  {
    id: "performance_csv",
    Icon: FileSpreadsheet,
    title: "Performance export (CSV)",
    desc: "A Meta Ads Manager export with spend, impressions, and result events per ad.",
  },
  {
    id: "creative_library",
    Icon: Images,
    title: "Creative library (ZIP)",
    desc: "Ad creative files plus a naming manifest so Metrix can map variables to assets.",
  },
];

export function ManualImportDialog({
  account,
  open,
  onOpenChange,
}: {
  account: AdAccount;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [kind, setKind] = useState<ImportKind | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleOpenChange = (o: boolean) => {
    onOpenChange(o);
    if (!o) {
      setKind(null);
      setFileName(null);
      setSubmitted(false);
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
            <PreviewBadge />
          </div>
          <DialogTitle className="text-[16px]">Add Manual Import</DialogTitle>
          <DialogDescription className="text-[12px] leading-relaxed">
            Bring data into <span className="text-foreground/80 font-medium">{account.name}</span>{" "}
            without a live connection. In this preview, files are staged but never processed — no
            performance data is generated.
          </DialogDescription>
        </DialogHeader>

        {!submitted ? (
          <div className="space-y-3">
            <div className="space-y-2">
              {IMPORT_KINDS.map(({ id, Icon, title, desc }) => (
                <button
                  key={id}
                  onClick={() => setKind(id)}
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

            {kind && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept={kind === "performance_csv" ? ".csv" : ".zip"}
                  className="hidden"
                  onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full flex flex-col items-center gap-1.5 p-5 rounded-lg border border-dashed border-border/60 hover:border-primary/40 hover:bg-white/[0.02] transition-colors"
                >
                  <Upload className="w-4 h-4 text-muted-foreground/70" />
                  {fileName ? (
                    <span className="text-[12px] font-medium text-foreground">{fileName}</span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground/60">
                      Choose a {kind === "performance_csv" ? ".csv" : ".zip"} file to stage
                    </span>
                  )}
                </button>
              </>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <GhostBtn onClick={() => handleOpenChange(false)}>Cancel</GhostBtn>
              <button
                disabled={!kind || !fileName}
                onClick={() => setSubmitted(true)}
                className={cn(
                  "flex items-center gap-1.5 h-9 px-4 rounded-md border text-[12px] font-medium transition-colors",
                  kind && fileName
                    ? "bg-primary/15 border-primary/30 text-primary hover:bg-primary/25"
                    : "border-border/40 text-muted-foreground/60 cursor-not-allowed"
                )}
              >
                Stage import <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center gap-3 py-4">
            <div className="w-12 h-12 rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-400/90" />
            </div>
            <div className="space-y-1">
              <div className="text-[14px] font-semibold text-foreground">Import staged — not processed</div>
              <p className="text-[11px] text-muted-foreground/60 leading-relaxed max-w-xs">
                {fileName} was staged for {account.name}. In the live product this would be
                validated and mapped before any data appears. In this preview, nothing is
                processed and no performance data is generated.
              </p>
            </div>
            <PrimaryBtn onClick={() => handleOpenChange(false)}>Done</PrimaryBtn>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
