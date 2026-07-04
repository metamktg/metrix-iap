import { useState } from "react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  FileText, Zap, ChevronRight, Search, Filter,
  Clock, User, Tag,
} from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { BRIEFS, WORKSPACES, USERS, ANALYSIS_RUNS } from "@/lib/mock-data";

// ─── Status styling ────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  Draft: "bg-muted text-muted-foreground border-border/40",
  "In Review": "bg-yellow-400/10 text-yellow-400 border-yellow-400/20",
  Approved: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  "In Production": "bg-primary/10 text-primary border-primary/20",
  Archived: "bg-muted text-muted-foreground/60 border-border/30",
};

const FUNNEL_STYLES: Record<string, string> = {
  TOF: "text-blue-400 border-blue-400/20 bg-blue-400/10",
  MOF: "text-purple-400 border-purple-400/20 bg-purple-400/10",
  BOF: "text-emerald-400 border-emerald-500/20 bg-emerald-500/10",
};

// ─── BriefEngine ───────────────────────────────────────────────────────

export function BriefEngine() {
  const [, navigate] = useLocation();
  const { currentWorkspace } = useWorkspace();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");

  const statuses = ["All", "Draft", "In Review", "Approved", "In Production", "Archived"];

  const allBriefs = BRIEFS.filter(b => b.workspace_id === currentWorkspace.id);

  const filtered = allBriefs.filter(b => {
    const matchSearch = !search || b.title.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "All" || b.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const sortedBriefs = [...filtered].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Brief Engine</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {currentWorkspace.name} — {allBriefs.length} brief{allBriefs.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={() => navigate("/app/iap/new")}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-all"
          >
            <Zap className="w-3.5 h-3.5" />
            New IAP Run
          </button>
        </div>

        {/* Filter row */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search briefs…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-card border border-border/60 rounded-xl pl-9 pr-4 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
            />
          </div>
          <div className="flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-muted-foreground mr-1" />
            {statuses.map(s => (
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
        </div>

        {/* Brief list */}
        {sortedBriefs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <FileText className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No briefs found.</p>
            {!currentWorkspace || currentWorkspace.id === "ws_bookster" ? null : (
              <p className="text-xs text-muted-foreground/60">
                Briefs are generated from IAP analysis runs. Navigate to Bookster to see full brief data.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {sortedBriefs.map(brief => {
              const ws = WORKSPACES.find(w => w.id === brief.workspace_id);
              const owner = USERS.find(u => u.id === brief.owner);
              const run = ANALYSIS_RUNS.find(r => r.id === brief.run_id);
              return (
                <button
                  key={brief.id}
                  onClick={() => navigate(`/app/briefs/${brief.id}`)}
                  className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl border border-border/60 bg-card hover:border-primary/30 hover:bg-primary/5 transition-all text-left group"
                >
                  {/* Status indicator */}
                  <div className={cn(
                    "w-1.5 h-8 rounded-full shrink-0",
                    brief.status === "Approved" || brief.status === "In Production"
                      ? "bg-emerald-500"
                      : brief.status === "In Review"
                      ? "bg-yellow-400"
                      : brief.status === "Archived"
                      ? "bg-muted-foreground/20"
                      : "bg-border"
                  )} />

                  {/* Title + meta */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                        {brief.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground">
                      {ws && <span>{ws.name}</span>}
                      {ws && <span className="text-muted-foreground/30">·</span>}
                      {run && <span className="font-mono">{run.depth}</span>}
                      {run && <span className="text-muted-foreground/30">·</span>}
                      <span className="flex items-center gap-1">
                        <Tag className="w-2.5 h-2.5" /> {brief.objective}
                      </span>
                      <span className="text-muted-foreground/30">·</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" /> {brief.created_at}
                      </span>
                      {owner && (
                        <>
                          <span className="text-muted-foreground/30">·</span>
                          <span className="flex items-center gap-1">
                            <User className="w-2.5 h-2.5" /> {owner.name}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Badges */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={cn(
                      "text-[10px] px-2 py-0.5 rounded border font-semibold leading-none",
                      FUNNEL_STYLES[brief.funnel_stage] ?? "text-muted-foreground border-border/40"
                    )}>
                      {brief.funnel_stage}
                    </span>
                    <span className={cn(
                      "text-[10px] px-2 py-0.5 rounded border font-semibold leading-none",
                      STATUS_STYLES[brief.status] ?? "bg-muted text-muted-foreground border-border/40"
                    )}>
                      {brief.status}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-primary transition-colors" />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Stats row */}
        {allBriefs.length > 0 && (
          <div className="grid grid-cols-5 gap-3 pt-2">
            {statuses.slice(1).map(s => {
              const count = allBriefs.filter(b => b.status === s).length;
              return (
                <div key={s} className="bg-card border border-border/40 rounded-xl px-3 py-2.5">
                  <div className="text-lg font-bold text-foreground leading-none">{count}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">{s}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
