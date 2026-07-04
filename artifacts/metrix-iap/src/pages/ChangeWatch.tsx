import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Activity, AlertTriangle, CheckCircle2, Eye,
  ArrowUpRight, Calendar,
} from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { CHANGE_EVENTS, WORKSPACES, AD_ACCOUNTS } from "@/lib/mock-data";
import type { ChangeEvent } from "@/lib/types";

// ─── Category + impact styling ─────────────────────────────────────────

const CATEGORY_STYLES: Record<ChangeEvent["category"], string> = {
  Campaign: "text-primary border-primary/20 bg-primary/10",
  Creative: "text-purple-400 border-purple-500/20 bg-purple-500/10",
  Budget: "text-emerald-400 border-emerald-500/20 bg-emerald-500/10",
  Status: "text-blue-400 border-blue-500/20 bg-blue-500/10",
  Name: "text-muted-foreground border-border/40 bg-muted/20",
  Tracking: "text-orange-400 border-orange-400/20 bg-orange-400/10",
};

const IMPACT_STYLES: Record<ChangeEvent["potential_impact"], string> = {
  High: "text-red-400 border-red-500/20 bg-red-500/10",
  Medium: "text-yellow-400 border-yellow-400/20 bg-yellow-400/10",
  Low: "text-muted-foreground border-border/40 bg-muted/10",
};

const STATUS_STYLES: Record<ChangeEvent["status"], string> = {
  New: "text-primary border-primary/20 bg-primary/10",
  Reviewed: "text-emerald-400 border-emerald-500/20 bg-emerald-500/10",
  Dismissed: "text-muted-foreground border-border/40 bg-muted/10",
};

const SOURCE_ICONS: Record<string, React.ReactNode> = {
  Manual: <Eye className="w-3 h-3" />,
  "API Sync": <Activity className="w-3 h-3" />,
  "Import Delta": <ArrowUpRight className="w-3 h-3" />,
  "User Action": <CheckCircle2 className="w-3 h-3" />,
};

// ─── ChangeEventCard ───────────────────────────────────────────────────

function ChangeEventCard({ event, onReview }: { event: ChangeEvent; onReview: (id: string) => void }) {
  const ws = WORKSPACES.find(w => w.id === event.workspace_id);
  const aa = AD_ACCOUNTS.find(a => a.id === event.ad_account_id);

  return (
    <div className={cn(
      "bg-card border rounded-xl p-4 space-y-3 transition-all",
      event.status === "New" && event.potential_impact === "High"
        ? "border-red-500/20"
        : event.status === "New"
        ? "border-primary/20"
        : event.status === "Dismissed"
        ? "border-border/30 opacity-60"
        : "border-border/60"
    )}>
      {/* Top row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn(
            "text-[9px] px-1.5 py-0.5 rounded border font-bold uppercase leading-none",
            CATEGORY_STYLES[event.category]
          )}>
            {event.category}
          </span>
          <span className={cn(
            "text-[9px] px-1.5 py-0.5 rounded border font-semibold leading-none",
            IMPACT_STYLES[event.potential_impact]
          )}>
            {event.potential_impact} impact
          </span>
          <span className={cn(
            "text-[9px] px-1.5 py-0.5 rounded border font-semibold leading-none",
            STATUS_STYLES[event.status]
          )}>
            {event.status}
          </span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
          <Calendar className="w-2.5 h-2.5" />
          {event.detected_at}
        </div>
      </div>

      {/* Description */}
      <p className="text-[11px] text-foreground font-medium leading-relaxed">{event.description}</p>

      {/* Meta row */}
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
        <span>{ws?.name ?? event.workspace_id}</span>
        {aa && <><span className="text-muted-foreground/30">·</span><span>{aa.account_name}</span></>}
        <span className="text-muted-foreground/30">·</span>
        <span className="flex items-center gap-1">
          {SOURCE_ICONS[event.source]}
          {event.source}
        </span>
      </div>

      {/* Performance shift */}
      {event.related_performance_shift && (
        <div className="flex items-center gap-2 text-[11px] bg-muted/20 border border-border/30 rounded-lg px-3 py-2">
          <Activity className="w-3 h-3 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground">Related shift: </span>
          <span className="text-foreground font-medium">{event.related_performance_shift}</span>
        </div>
      )}

      {/* Actions */}
      {event.status === "New" && (
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => onReview(event.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-[11px] text-emerald-400 font-medium hover:bg-emerald-500/20 transition-all"
          >
            <CheckCircle2 className="w-3 h-3" />
            Mark Reviewed
          </button>
          <button
            onClick={() => onReview(event.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/40 text-[11px] text-muted-foreground hover:text-foreground hover:border-border transition-all"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

// ─── ChangeWatch ──────────────────────────────────────────────────────

export function ChangeWatch() {
  const { currentWorkspace } = useWorkspace();
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());

  const all = currentWorkspace
    ? CHANGE_EVENTS.filter(e => e.workspace_id === currentWorkspace.id)
    : CHANGE_EVENTS;

  const events = all.map(e =>
    reviewedIds.has(e.id) ? { ...e, status: "Reviewed" as ChangeEvent["status"] } : e
  );

  const filtered = statusFilter === "All"
    ? events
    : events.filter(e => e.status === statusFilter);

  const sorted = [...filtered].sort((a, b) => new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime());

  const newCount = events.filter(e => e.status === "New").length;
  const highImpact = events.filter(e => e.potential_impact === "High" && e.status === "New").length;

  const handleReview = (id: string) => {
    setReviewedIds(prev => new Set([...prev, id]));
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Change Watch</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {currentWorkspace ? currentWorkspace.name : "All workspaces"} — {all.length} event{all.length !== 1 ? "s" : ""} detected
            </p>
          </div>
          {newCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-red-500/20 bg-red-500/10 text-xs text-red-400">
              <AlertTriangle className="w-3.5 h-3.5" />
              {newCount} unreviewed · {highImpact} high impact
            </div>
          )}
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "New", value: events.filter(e => e.status === "New").length, color: "text-primary" },
            { label: "High Impact", value: highImpact, color: highImpact > 0 ? "text-red-400" : "text-muted-foreground" },
            { label: "Reviewed", value: events.filter(e => e.status === "Reviewed").length, color: "text-emerald-400" },
            { label: "Dismissed", value: events.filter(e => e.status === "Dismissed").length, color: "text-muted-foreground" },
          ].map(k => (
            <div key={k.label} className="bg-card border border-border/60 rounded-xl px-4 py-3 space-y-1">
              <div className={cn("text-xl font-bold", k.color)}>{k.value}</div>
              <div className="text-[10px] font-medium text-foreground">{k.label}</div>
            </div>
          ))}
        </div>

        {/* What Change Watch monitors */}
        <div className="bg-card border border-border/60 rounded-xl px-4 py-3 space-y-1">
          <div className="text-xs font-semibold text-foreground">What Change Watch monitors</div>
          <div className="grid grid-cols-3 gap-3 mt-2">
            {[
              { cat: "Campaign", desc: "Status changes, objective shifts, campaign pauses" },
              { cat: "Creative", desc: "Fatigue flags, tier reclassifications, hook score changes" },
              { cat: "Budget", desc: "Reallocation decisions, band changes, spend anomalies" },
              { cat: "Tracking", desc: "CAPI gaps, pixel mismatches, event drop-off" },
              { cat: "Status", desc: "Account status, ad set pauses, campaign completions" },
              { cat: "Import", desc: "New imports uploaded, validation warnings, mapping gaps" },
            ].map(m => (
              <div key={m.cat} className="space-y-0.5">
                <div className={cn("text-[10px] font-bold", CATEGORY_STYLES[m.cat as ChangeEvent["category"]]?.split(" ")[0] ?? "text-foreground")}>
                  {m.cat}
                </div>
                <div className="text-[10px] text-muted-foreground">{m.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          {["All", "New", "Reviewed", "Dismissed"].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all",
                statusFilter === s
                  ? "bg-primary/10 border-primary/40 text-primary"
                  : "bg-transparent border-border/40 text-muted-foreground hover:border-border hover:text-foreground"
              )}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Events list */}
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <Activity className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No events found.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map(e => (
              <ChangeEventCard key={e.id} event={e} onReview={handleReview} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
