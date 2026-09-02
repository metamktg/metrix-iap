// ─── Creative next-step nudge ──────────────────────────────────────────
// Owner brief (2026-09-02, first fresh-account run): once the import and
// analysis have run in full, "suggest the user do a creative breakdown —
// deconstruct — and re-analyze with the full IAP variable library for the
// best strategy input."
//
// The sibling CreativeSourceNudge asks for creatives when there are none.
// This one picks up where that stops: creatives are staged, so what is the
// next runnable step? Exactly one of two, derived from real state:
//
//   1. creatives staged, none deconstructed → "Deconstruct N creatives".
//      Runs the deconstruct backfill (manual, 202 + poll — never automatic).
//   2. deconstructions exist and the newest is later than the latest
//      successful analysis run → "Re-run analysis with the full IAP
//      variable library" (navigates to the run control; the run itself
//      stays a deliberate click).
//
// Renders nothing while a run of either kind is in flight, nothing when
// there is nothing to suggest, and never a modal. Dismissal is per account,
// per browser (creativeNudgeStore, kind "next_step").

import { useLocation } from "wouter";
import { Layers, PlayCircle, Sparkles, X } from "lucide-react";
import { cn } from "@workspace/command-deck/lib/utils";
import { useListManualImports, useGetLatestAnalysisRun } from "@workspace/api-client-react";
import { TYPE } from "@/pages/metrix/typography";
import { dismissCreativeNudge, useCreativeNudgeDismissed } from "@/lib/data/creativeNudgeStore";
import { useDeconstruction } from "./useDeconstruction";

export type CreativeNextStep =
  | { kind: "deconstruct"; pending: number }
  | { kind: "reanalyze"; deconstructed: number }
  | null;

/** Pure: which step to suggest, or none. Exported for its test. */
export function deriveCreativeNextStep(args: {
  creativeImportIds: string[];
  deconstructedImportIds: string[];
  newestDeconstructionAt: string | null;
  latestSuccessfulRunAt: string | null;
}): CreativeNextStep {
  const { creativeImportIds, deconstructedImportIds, newestDeconstructionAt, latestSuccessfulRunAt } = args;
  if (creativeImportIds.length === 0) return null;
  const done = new Set(deconstructedImportIds);
  const pending = creativeImportIds.filter((id) => !done.has(id)).length;
  if (pending > 0) return { kind: "deconstruct", pending };
  if (!newestDeconstructionAt) return null;
  if (!latestSuccessfulRunAt || new Date(newestDeconstructionAt).getTime() > new Date(latestSuccessfulRunAt).getTime()) {
    return { kind: "reanalyze", deconstructed: deconstructedImportIds.length };
  }
  return null;
}

export function CreativeNextStepNudge({ accountId, className }: { accountId: string; className?: string }) {
  const [, navigate] = useLocation();
  const dismissed = useCreativeNudgeDismissed(accountId, "next_step");
  const { data: importsData } = useListManualImports(accountId);
  const { data: latest } = useGetLatestAnalysisRun(accountId);
  const decon = useDeconstruction(accountId);

  if (dismissed) return null;
  const run = latest?.run ?? null;
  if (!run || run.status !== "success") return null;
  if (decon.isRunning) return null;

  const creativeImportIds = (importsData?.imports ?? []).filter((i) => i.kind === "creative_asset").map((i) => i.id);
  const usable = decon.deconstructions.filter((d) => d.status !== "discarded" && d.status !== "unsupported");
  const step = deriveCreativeNextStep({
    creativeImportIds,
    deconstructedImportIds: usable.map((d) => d.manual_import_id),
    newestDeconstructionAt: usable.reduce<string | null>((max, d) => (!max || d.created_at > max ? d.created_at : max), null),
    latestSuccessfulRunAt: run.finished_at ?? run.started_at ?? null,
  });
  if (!step) return null;

  return (
    <div
      role="status"
      aria-label="Creative next step suggestion"
      data-testid="creative-next-step-nudge"
      className={cn(
        "mx-6 my-3 flex items-start gap-3 rounded-lg border border-primary/25 bg-primary/[0.05] px-4 py-3",
        className,
      )}
    >
      <Sparkles className="w-4 h-4 mt-0.5 shrink-0 text-interactive" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {step.kind === "deconstruct" ? (
          <>
            <p className={cn(TYPE.caption, "font-semibold text-foreground")}>
              {step.pending} staged creative{step.pending === 1 ? "" : "s"} {step.pending === 1 ? "has" : "have"} not been deconstructed.
            </p>
            <p className={cn(TYPE.caption, "text-muted-foreground/85 mt-0.5")}>
              Deconstruct them into the IAP variable library (concept, hook, framework, tonality, proof…), then re-run analysis so strategy reads the full stack.
            </p>
          </>
        ) : (
          <>
            <p className={cn(TYPE.caption, "font-semibold text-foreground")}>
              {step.deconstructed} deconstructed creative{step.deconstructed === 1 ? "" : "s"} newer than the last analysis run.
            </p>
            <p className={cn(TYPE.caption, "text-muted-foreground/85 mt-0.5")}>
              Re-run analysis with the full IAP variable library so strategy and briefs read the deconstructed stacks, not just performance data.
            </p>
          </>
        )}
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          {step.kind === "deconstruct" ? (
            <button
              type="button"
              onClick={() => void decon.startBackfill()}
              className="pressable inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-primary/40 bg-primary/10 text-interactive text-caption font-semibold hover:bg-primary/20 transition-colors"
            >
              <Layers className="w-3.5 h-3.5" aria-hidden="true" /> Deconstruct {step.pending} creative{step.pending === 1 ? "" : "s"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate("/app/analysis")}
              className="pressable inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-primary/40 bg-primary/10 text-interactive text-caption font-semibold hover:bg-primary/20 transition-colors"
            >
              <PlayCircle className="w-3.5 h-3.5" aria-hidden="true" /> Go to Run analysis
            </button>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => dismissCreativeNudge(accountId, "next_step")}
        aria-label="Dismiss creative next step suggestion"
        title="Not now"
        className="pressable shrink-0 w-8 h-8 -mr-1 -mt-1 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
      >
        <X className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
