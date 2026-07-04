import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  BarChart3, TrendingUp, TrendingDown, Clock,
  CheckCircle2, XCircle, ChevronDown, ChevronUp,
} from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { BENCHMARK_MEMORY, WORKSPACES } from "@/lib/mock-data";
import type { BenchmarkMemory as BM } from "@/lib/types";

// ─── Type colour ───────────────────────────────────────────────────────

const TYPE_STYLES: Record<BM["benchmark_type"], string> = {
  account: "text-primary border-primary/20 bg-primary/10",
  concept: "text-purple-400 border-purple-500/20 bg-purple-500/10",
  hook: "text-emerald-400 border-emerald-500/20 bg-emerald-500/10",
  offer: "text-yellow-400 border-yellow-400/20 bg-yellow-400/10",
  placement: "text-blue-400 border-blue-500/20 bg-blue-500/10",
};

// ─── Benchmark card ────────────────────────────────────────────────────

function BenchmarkCard({ bm }: { bm: BM }) {
  const [open, setOpen] = useState(false);
  const ws = WORKSPACES.find(w => w.id === bm.workspace_id);

  return (
    <div className="bg-card border border-border/60 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-start gap-4 p-4 text-left"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn(
              "text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase leading-none",
              TYPE_STYLES[bm.benchmark_type]
            )}>
              {bm.benchmark_type}
            </span>
            <span className="text-xs font-semibold text-foreground">{bm.label}</span>
          </div>
          <div className="flex items-center gap-4 flex-wrap text-[11px]">
            <span className="flex items-center gap-1 text-muted-foreground">
              <BarChart3 className="w-3 h-3" />
              CPA ${bm.cpa_range_min.toFixed(0)}–${bm.cpa_range_max.toFixed(0)}
            </span>
            <span className="text-muted-foreground/30">·</span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <TrendingUp className="w-3 h-3" />
              ROAS {bm.roas_range_min.toFixed(1)}–{bm.roas_range_max.toFixed(1)}x
            </span>
            <span className="text-muted-foreground/30">·</span>
            <span className="flex items-center gap-1 text-muted-foreground">
              <Clock className="w-3 h-3" />
              Fatigue at ~{bm.fatigue_threshold_days}d
            </span>
            {ws && (
              <>
                <span className="text-muted-foreground/30">·</span>
                <span className="text-muted-foreground">{ws.name}</span>
              </>
            )}
          </div>
        </div>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-border/30 px-4 py-3 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                Previous Winners
              </div>
              <div className="space-y-1">
                {bm.previous_winners.map(w => (
                  <div key={w} className="flex items-start gap-2 text-[11px]">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1 shrink-0" />
                    <span className="text-muted-foreground">{w}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <TrendingDown className="w-3 h-3 text-red-400" />
                False Positives
              </div>
              <div className="space-y-1">
                {bm.false_positives.map(f => (
                  <div key={f} className="flex items-start gap-2 text-[11px]">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1 shrink-0" />
                    <span className="text-muted-foreground">{f}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
              <XCircle className="w-3 h-3 text-orange-400" />
              Rejected Recommendations
            </div>
            <div className="space-y-1">
              {bm.rejected_recommendations.map(r => (
                <div key={r} className="flex items-start gap-2 text-[11px]">
                  <div className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-1 shrink-0" />
                  <span className="text-muted-foreground">{r}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-border/30 pt-3 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Recorded {bm.recorded_at}</span>
            <span className="italic">{bm.notes}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── BenchmarkMemoryPage ───────────────────────────────────────────────

export function BenchmarkMemoryPage() {
  const { currentWorkspace } = useWorkspace();
  const [typeFilter, setTypeFilter] = useState<string>("All");

  const types: Array<BM["benchmark_type"] | "All"> = ["All", "account", "concept", "hook", "offer", "placement"];

  const all = BENCHMARK_MEMORY.filter(b => b.workspace_id === currentWorkspace.id);

  const filtered = typeFilter === "All" ? all : all.filter(b => b.benchmark_type === typeFilter);
  const sorted = [...filtered].sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime());

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-foreground tracking-tight">Benchmark Memory</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {currentWorkspace.name} — {all.length} benchmark record{all.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Explainer */}
        <div className="bg-card border border-border/60 rounded-xl px-4 py-3 space-y-1">
          <div className="text-xs font-semibold text-foreground">What is Benchmark Memory?</div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            IAP accumulates historical performance ranges, previous creative winners, confirmed false positives, and rejected recommendations across all analysis runs. This memory is used to calibrate confidence labels and prevent repeated mistakes.
          </p>
        </div>

        {/* Type filter */}
        <div className="flex items-center gap-2 flex-wrap">
          {types.map(t => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={cn(
                "px-3 py-1.5 rounded-full text-[11px] font-medium border transition-all capitalize",
                typeFilter === t
                  ? "bg-primary/10 border-primary/40 text-primary"
                  : "bg-transparent border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Summary row */}
        <div className="grid grid-cols-5 gap-3">
          {(["account", "concept", "hook", "offer", "placement"] as BM["benchmark_type"][]).map(t => {
            const count = all.filter(b => b.benchmark_type === t).length;
            return (
              <div key={t} className="bg-card border border-border/50 rounded-xl px-3 py-2.5">
                <div className="text-lg font-bold text-foreground">{count}</div>
                <div className={cn("text-[10px] font-semibold capitalize mt-0.5", TYPE_STYLES[t].split(" ")[0])}>
                  {t}
                </div>
              </div>
            );
          })}
        </div>

        {/* Benchmark list */}
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <BarChart3 className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No benchmarks found.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map(bm => <BenchmarkCard key={bm.id} bm={bm} />)}
          </div>
        )}
      </div>
    </div>
  );
}
