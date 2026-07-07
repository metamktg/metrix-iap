import { cn } from "@/lib/utils";
import { Library, BookOpen, CheckCircle2, Zap, ChevronRight } from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { LEARNING_REGISTRY } from "@/lib/mock-data";
import { DataSourceBadge } from "@/components/ui/DataSourceBadge";
import type { ConfidenceLabel, CohortKey } from "@/lib/types";

const COHORT_LABELS: Record<CohortKey, string> = {
  age_gender: "Age × Gender",
  placement: "Placement",
  device: "Device",
  creative_angle: "Creative Angle",
  funnel_stage: "Funnel Stage",
  language: "Language",
  geography: "Geography",
  audience_type: "Audience Type",
};

function ConfidenceChip({ c }: { c: ConfidenceLabel }) {
  const map: Record<ConfidenceLabel, string> = {
    high: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
    medium: "bg-yellow-400/10 border-yellow-400/20 text-yellow-400",
    validation_required: "bg-orange-400/10 border-orange-400/20 text-orange-400",
    insufficient: "bg-muted/50 border-border/40 text-muted-foreground",
  };
  return (
    <span className={cn("text-[9px] px-1.5 py-0.5 rounded border font-semibold leading-none", map[c])}>
      {c === "validation_required" ? "Validate" : c.charAt(0).toUpperCase() + c.slice(1)}
    </span>
  );
}

export function LearningRegistry() {
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace.id;

  const entries = LEARNING_REGISTRY.filter(e => e.workspace_id === wsId)
    .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));

  const loopCount = entries.filter(e => e.feeds_optimization_loop).length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border/50">
        <div className="flex items-center gap-3 mb-1">
          <Library className="w-4 h-4 text-primary" />
          <h1 className="text-base font-bold text-foreground">Learning Registry</h1>
          {loopCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-semibold">
              <Zap className="w-2.5 h-2.5" /> {loopCount} feeding optimization loop
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-1">
          Read-only history of approved signals that have entered the optimization loop — Section 11.4 approval gate
        </p>
        <DataSourceBadge table="learning_registry, approval_events" className="mt-1.5" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-4 space-y-3">
        {entries.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center space-y-2">
              <Library className="w-8 h-8 text-muted-foreground/30 mx-auto" />
              <p className="text-sm text-muted-foreground">No approved signals in the learning registry yet.</p>
              <p className="text-xs text-muted-foreground/60">Approve intelligence cards with "Feeds Optimization Loop" scope in the Review Queue.</p>
            </div>
          </div>
        ) : (
          entries.map(entry => (
            <div
              key={entry.id}
              className={cn(
                "border rounded-xl bg-card px-5 py-4 space-y-2.5",
                entry.feeds_optimization_loop
                  ? "border-emerald-500/25 bg-emerald-500/5"
                  : "border-border/60"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-border/30 bg-muted/20 text-muted-foreground/60 leading-none">
                      {entry.entity_type.replace(/_/g, " ")}
                    </span>
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-primary/20 bg-primary/8 text-primary/70 leading-none">
                      {COHORT_LABELS[entry.cohort_key] ?? entry.cohort_key}
                    </span>
                    <ConfidenceChip c={entry.confidence_grade} />
                    {entry.feeds_optimization_loop && (
                      <span className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded border border-emerald-500/25 bg-emerald-500/10 text-emerald-400 font-bold leading-none">
                        <Zap className="w-2 h-2" /> Feeds Optimization Loop
                      </span>
                    )}
                    {entry.is_superseded && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded border border-muted text-muted-foreground/50 font-semibold leading-none line-through">
                        Superseded
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-semibold text-foreground leading-snug">{entry.entity_title}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] text-muted-foreground">Recorded</div>
                  <div className="text-[10px] font-mono text-foreground">{entry.recorded_at}</div>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground leading-relaxed">{entry.signal_summary}</p>

              <div className="flex items-center gap-3 pt-1">
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  Approved for: <strong className="text-foreground ml-0.5">{entry.approved_for.replace(/_/g, " ")}</strong>
                </div>
                <div className="text-[9px] font-mono text-muted-foreground/50 ml-auto">
                  via {entry.approval_event_id}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
