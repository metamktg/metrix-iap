// ─── Add Ad Account dialog ────────────────────────────────────────────
// The single real entry point for adding an ad account to the workspace:
//   1. Connect a live Meta ad account (hands off to Settings → Integrations
//      where the real OAuth flow lives), or
//   2. Create a manual-reports account (named account in an honest
//      unconfigured state) and optionally stage report uploads for it.

import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateManualAdAccount,
  getGetMetrixSeedQueryKey,
  ApiError,
  type CreateAdAccountResult,
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
  Plus,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { useAccount } from "@/contexts/AccountContext";
import { ManualUploadPanel, PrimaryBtn, GhostBtn } from "./ConnectAccountDialogs";

type Step = "choose" | "manual_name" | "manual_uploads";

export function AddAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { selectAdAccount } = useAccount();

  const [step, setStep] = useState<Step>("choose");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateAdAccountResult | null>(null);
  const createMutation = useCreateManualAdAccount();

  const reset = () => {
    setStep("choose");
    setName("");
    setError(null);
    setCreated(null);
  };

  const handleOpenChange = (o: boolean) => {
    onOpenChange(o);
    if (!o) reset();
  };

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError("Enter an account name of at least 2 characters.");
      return;
    }
    setError(null);
    try {
      const result = await createMutation.mutateAsync({ data: { name: trimmed } });
      // Refetch the seed so the new account exists in the switcher before
      // we offer to open it.
      await queryClient.invalidateQueries({ queryKey: getGetMetrixSeedQueryKey() });
      setCreated(result);
      setStep("manual_uploads");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not create the account. Check your connection and try again."
      );
    }
  };

  const finish = () => {
    handleOpenChange(false);
    if (created) selectAdAccount(created.account_id);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        {step === "choose" && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-lg border border-border/40 bg-white/[0.03] flex items-center justify-center">
                  <Plus className="w-4 h-4 text-primary" />
                </div>
              </div>
              <DialogTitle className="text-[16px]">Add Ad Account</DialogTitle>
              <DialogDescription className="text-[12px] leading-relaxed">
                Bring a new ad account into Metrix. Connect it live through Meta, or create a
                manual account and upload exported reports.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <button
                onClick={() => {
                  handleOpenChange(false);
                  navigate("/app/settings/integrations");
                }}
                className="w-full flex items-start gap-3 p-3.5 rounded-lg border border-border/40 bg-white/[0.02] hover:border-primary/40 hover:bg-primary/[0.04] transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-lg border border-primary/25 bg-primary/10 flex items-center justify-center shrink-0">
                  <Plug className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-foreground">Connect Meta Ad Account</div>
                  <p className="text-[11px] text-muted-foreground/70 leading-relaxed mt-0.5">
                    Authorize read-only access with Meta and link a live ad account. Data pulls
                    run against the real Meta API.
                  </p>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0 mt-0.5" />
              </button>

              <button
                onClick={() => setStep("manual_name")}
                className="w-full flex items-start gap-3 p-3.5 rounded-lg border border-border/40 bg-white/[0.02] hover:border-primary/40 hover:bg-primary/[0.04] transition-colors text-left"
              >
                <div className="w-9 h-9 rounded-lg border border-border/40 bg-white/[0.03] flex items-center justify-center shrink-0">
                  <FileUp className="w-4 h-4 text-muted-foreground/80" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-foreground">Upload manual reports</div>
                  <p className="text-[11px] text-muted-foreground/70 leading-relaxed mt-0.5">
                    Create an account without a live connection and stage exported Meta reports
                    for the analysis pipeline.
                  </p>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0 mt-0.5" />
              </button>
            </div>
          </>
        )}

        {step === "manual_name" && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-lg border border-border/40 bg-white/[0.03] flex items-center justify-center">
                  <FileUp className="w-4 h-4 text-primary" />
                </div>
              </div>
              <DialogTitle className="text-[16px]">Name the ad account</DialogTitle>
              <DialogDescription className="text-[12px] leading-relaxed">
                Use the client or brand name. The account starts unconfigured — performance data
                appears only after uploaded reports are processed by an analysis run.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <input
                autoFocus
                value={name}
                onChange={(e) => { setName(e.target.value); setError(null); }}
                onKeyDown={(e) => { if (e.key === "Enter" && !createMutation.isPending) void handleCreate(); }}
                placeholder="e.g. Acme Skincare"
                maxLength={120}
                className={cn(
                  "w-full h-10 px-3 rounded-md bg-white/[0.03] border text-[13px] text-foreground",
                  "placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1",
                  error ? "border-red-400/40 focus:ring-red-400/40" : "border-border/50 focus:ring-primary/40 focus:border-primary/40"
                )}
              />
              {error && (
                <div className="flex items-start gap-2 p-2.5 rounded-lg border border-red-400/25 bg-red-400/[0.06]">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-red-300 leading-relaxed">{error}</p>
                </div>
              )}
              <div className="flex items-center justify-between pt-1">
                <GhostBtn onClick={() => { setStep("choose"); setError(null); }}>
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </GhostBtn>
                <PrimaryBtn onClick={() => void handleCreate()} disabled={createMutation.isPending || name.trim().length < 2}>
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating…
                    </>
                  ) : (
                    <>
                      Create account <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </PrimaryBtn>
              </div>
            </div>
          </>
        )}

        {step === "manual_uploads" && created && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-lg border border-emerald-400/25 bg-emerald-400/[0.08] flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                </div>
              </div>
              <DialogTitle className="text-[16px]">{created.name} created</DialogTitle>
              <DialogDescription className="text-[12px] leading-relaxed">
                Stage exported reports now, or skip and upload later from the account's setup
                screen. Uploads are stored for the analysis pipeline — nothing is parsed at
                upload time.
              </DialogDescription>
            </DialogHeader>

            <ManualUploadPanel accountId={created.account_id} />

            <div className="flex items-center justify-end pt-1">
              <GhostBtn onClick={finish}>Done — open account</GhostBtn>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
