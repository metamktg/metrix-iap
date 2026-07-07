import { useWorkspace } from "@/contexts/WorkspaceContext";
import { ANALYSIS_RUNS, WORKSPACES } from "@/lib/mock-data";
import { DataSourceBadge } from "@/components/ui/DataSourceBadge";
import { cn } from "@/lib/utils";
import {
  Zap, Plus, CheckCircle2, AlertCircle, Clock, XCircle, ChevronRight,
} from "lucide-react";

const STATUS_STYLE: Record<string, { color: string; icon: React.ComponentType<{ className?: string }> }> = {
  Completed:  { color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", icon: CheckCircle2 },
  Running:    { color: "text-blue-400 bg-blue-500/10 border-blue-500/20", icon: Clock },
  Failed:     { color: "text-red-400 bg-red-500/10 border-red-500/20", icon: XCircle },
  Queued:     { color: "text-muted-foreground bg-muted/20 border-border/30", icon: Clock },
  Draft:      { color: "text-muted-foreground bg-muted/20 border-border/30", icon: AlertCircle },
  Cancelled:  { color: "text-muted-foreground bg-muted/20 border-border/30", icon: XCircle },
};

const COHORT_COLOR: Record<string, string> = {
  device:         "text-blue-400 bg-blue-500/10 border-blue-500/20",
  creative_angle: "text-violet-400 bg-violet-500/10 border-violet-500/20",
  age_gender:     "text-pink-400 bg-pink-500/10 border-pink-500/20",
  placement:      "text-amber-400 bg-amber-500/10 border-amber-500/20",
  language:       "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  offer_type:     "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  funnel_stage:   "text-orange-400 bg-orange-500/10 border-orange-500/20",
};

function navigate(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function RunsList() {
  const { currentWorkspace } = useWorkspace();

  const runs = ANALYSIS_RUNS
    .filter((r) => r.workspace_id === currentWorkspace.id)
    .sort((a, b) => (b.created_at > a.created_at ? 1 : -1));

  const completed = runs.filter((r) => r.status === "Completed").length;
  const running   = runs.filter((r) => r.status === "Running").length;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-5 h-5 text-primary" />
              <h1 className="text-xl font-bold text-foreground">Run Pipeline</h1>
              <span className="text-xs px-2 py-0.5 rounded-full border border-primary/20 bg-primary/10 text-primary font-mono">
                {runs.length} runs
              </span>
              {running > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full border border-blue-500/20 bg-blue-500/10 text-blue-400 font-semibold animate-pulse">
                  {running} running
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Analysis runs for {currentWorkspace.name} — {completed} completed
            </p>
            <div className="flex items-center gap-1.5 mt-1">
              <DataSourceBadge table="analysis_runs" />
              <DataSourceBadge table="analysis_run_stages" />
            </div>
          </div>
          <button
            onClick={() => navigate("/app/iap/new")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3 h-3" />
            New Run
          </button>
        </div>

        {/* Run list */}
        {runs.length === 0 ? (
          <div className="rounded-lg border border-border/40 bg-card/40 px-6 py-12 text-center">
            <Zap className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground mb-1">No runs yet</p>
            <p className="text-xs text-muted-foreground/60">
              Start your first IAP analysis to generate intelligence cards and recommendations.
            </p>
            <button
              onClick={() => navigate("/app/iap/new")}
              className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-3 h-3" />
              New Run
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {runs.map((run) => {
              const statusMeta = STATUS_STYLE[run.status] ?? STATUS_STYLE.Draft;
              const StatusIcon = statusMeta.icon;
              const cohortClass = run.cohort_key ? (COHORT_COLOR[run.cohort_key] ?? "text-muted-foreground bg-muted/20 border-border/30") : null;

              return (
                <button
                  key={run.id}
                  onClick={() => navigate(`/app/iap/runs/${run.id}`)}
                  className="w-full text-left rounded-lg border border-border/40 bg-card/40 hover:border-border/70 hover:bg-card/70 transition-all px-4 py-3 flex items-center gap-3 group"
                >
                  {/* Status chip */}
                  <span className={cn(
                    "flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-semibold leading-none shrink-0",
                    statusMeta.color
                  )}>
                    <StatusIcon className="w-2.5 h-2.5" />
                    {run.status}
                  </span>

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground truncate">
                        {run.objective}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground/60">{run.id}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[10px] text-muted-foreground">{run.depth}</span>
                      <span className="text-[9px] text-muted-foreground/40">·</span>
                      <span className="text-[10px] text-muted-foreground">
                        {run.date_range_start} → {run.date_range_end}
                      </span>
                      {run.cohort_key && (
                        <>
                          <span className="text-[9px] text-muted-foreground/40">·</span>
                          <span className={cn(
                            "text-[9px] px-1.5 py-0.5 rounded border font-mono leading-none",
                            cohortClass
                          )}>
                            {run.cohort_key.replace(/_/g, " ")}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Score + chevron */}
                  <div className="flex items-center gap-3 shrink-0">
                    {run.status === "Completed" && (
                      <div className="text-right">
                        <div className="text-sm font-bold text-foreground">{run.confidence_score}/100</div>
                        <div className="text-[9px] text-muted-foreground">confidence</div>
                      </div>
                    )}
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
                  </div>
                </button>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}
