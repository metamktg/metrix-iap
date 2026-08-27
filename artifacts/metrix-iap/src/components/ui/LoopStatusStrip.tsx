// ─── LoopStatusStrip ─────────────────────────────────────────────────
// Compact one-line strip summarising the five IAP loop stages.
// Used in the global header and compact account cards; the full checklist
// sidebar lives in AdAccountOverview.

import { cn } from "@workspace/command-deck/lib/utils";
import { CheckCircle2, Circle } from "lucide-react";
import { useWorkflowCounts } from "@/hooks/useWorkflowCounts";

const STAGES = [
  { key: "data",     label: "Data" },
  { key: "analysis", label: "Analysis" },
  { key: "strategy", label: "Strategy" },
  { key: "briefs",   label: "Briefs" },
  { key: "report",   label: "Report" },
] as const;

function stageDone(stage: typeof STAGES[number]["key"], counts: ReturnType<typeof useWorkflowCounts>): boolean {
  switch (stage) {
    case "data":     return counts.dataConnected;
    case "analysis": return counts.analysisRows > 0;
    case "strategy": return counts.pillarCount > 0;
    case "briefs":   return counts.briefCount > 0;
    case "report":   return counts.reportCount > 0;
  }
}

interface LoopStatusStripProps {
  adAccountId: string | null;
  className?: string;
}

export function LoopStatusStrip({ adAccountId, className }: LoopStatusStripProps) {
  const counts = useWorkflowCounts(adAccountId);

  const completedCount = STAGES.filter((s) => stageDone(s.key, counts)).length;

  return (
    <div
      className={cn("flex items-center gap-0.5", className)}
      title={`IAP Loop — ${completedCount}/${STAGES.length} complete`}
    >
      {STAGES.map((stage, i) => {
        const done = stageDone(stage.key, counts);
        return (
          <div key={stage.key} className="flex items-center gap-0.5">
            {i > 0 && (
              <span
                className={cn(
                  "w-3 h-px transition-colors",
                  done ? "bg-status-success/50" : "bg-border/40"
                )}
              />
            )}
            <div
              className={cn(
                "flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium leading-none",
                done
                  ? "text-status-success/90"
                  : "text-muted-foreground/75"
              )}
              title={stage.label}
            >
              {done ? (
                <CheckCircle2 className="w-3 h-3 shrink-0" />
              ) : (
                <Circle className="w-3 h-3 shrink-0" />
              )}
              <span className="hidden sm:inline">{stage.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
