import { useState } from "react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  FileText, ChevronDown, ChevronUp, ChevronRight,
  CheckCircle2, User, Calendar, Zap,
} from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { REPORTS, WORKSPACES, USERS, ANALYSIS_RUNS } from "@/lib/mock-data";

// ─── Status styling ────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  Draft: "bg-muted text-muted-foreground border-border/40",
  "In Review": "bg-yellow-400/10 text-yellow-400 border-yellow-400/20",
  Final: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  Sent: "bg-primary/10 text-primary border-primary/20",
};

// ─── Collapsible report card ───────────────────────────────────────────

function ReportCard({ report }: { report: typeof REPORTS[0] }) {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const ws = WORKSPACES.find(w => w.id === report.workspace_id);
  const author = USERS.find(u => u.id === report.generated_by);
  const run = ANALYSIS_RUNS.find(r => r.id === report.run_id);

  const sections = [
    { label: "Executive Summary", content: report.executive_summary },
    { label: "What Happened", content: report.what_happened },
    { label: "What It Means", content: report.what_it_means },
    { label: "What To Do Next", content: report.what_to_do_next },
    { label: "Creative Learnings", content: report.creative_learnings },
    { label: "Budget Decisions", content: report.budget_decisions },
    { label: "Next Sprint", content: report.next_sprint },
    { label: "Appendix", content: report.appendix },
  ];

  return (
    <div className={cn(
      "border rounded-xl bg-card overflow-hidden transition-all",
      open ? "border-primary/30" : "border-border/60"
    )}>
      {/* Header row */}
      <button
        className="w-full flex items-center gap-4 px-4 py-3.5 text-left"
        onClick={() => setOpen(o => !o)}
      >
        {/* Status stripe */}
        <div className={cn(
          "w-1 h-8 rounded-full shrink-0",
          report.status === "Final" || report.status === "Sent" ? "bg-emerald-500"
          : report.status === "In Review" ? "bg-yellow-400"
          : "bg-border"
        )} />

        <div className="flex-1 min-w-0 space-y-1">
          <div className="text-xs font-semibold text-foreground">{report.title}</div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
            {ws && <span>{ws.name}</span>}
            {ws && <span className="text-muted-foreground/30">·</span>}
            <span className="flex items-center gap-1">
              <Calendar className="w-2.5 h-2.5" />
              {report.date_range_start} – {report.date_range_end}
            </span>
            {author && (
              <>
                <span className="text-muted-foreground/30">·</span>
                <span className="flex items-center gap-1">
                  <User className="w-2.5 h-2.5" /> {author.name}
                </span>
              </>
            )}
            <span className="text-muted-foreground/30">·</span>
            <span>{report.created_at}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {report.client_ready && (
            <span className="text-[9px] px-1.5 py-0.5 rounded border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 font-semibold leading-none flex items-center gap-1">
              <CheckCircle2 className="w-2.5 h-2.5" /> Client-ready
            </span>
          )}
          <span className={cn(
            "text-[10px] px-2 py-0.5 rounded border font-semibold leading-none",
            STATUS_STYLES[report.status] ?? "bg-muted text-muted-foreground border-border/40"
          )}>
            {report.status}
          </span>
          {open ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
        </div>
      </button>

      {/* Expanded content */}
      {open && (
        <div className="border-t border-border/30 px-4 py-4 space-y-4">

          {/* Source run link */}
          {run && (
            <button
              onClick={() => navigate(`/app/iap/runs/${run.id}`)}
              className="flex items-center gap-2 text-[11px] text-primary hover:text-primary/80 transition-colors"
            >
              <Zap className="w-3 h-3" />
              Source: {run.depth} — {run.objective}
              <ChevronRight className="w-3 h-3" />
            </button>
          )}

          {/* Report sections */}
          <div className="grid grid-cols-2 gap-4">
            {sections.map(s => (
              <div key={s.label} className="space-y-1.5">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{s.label}</div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{s.content}</p>
              </div>
            ))}
          </div>

          {/* Footer actions */}
          <div className="flex items-center gap-2 pt-2 border-t border-border/30">
            <button
              disabled
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/40 text-[11px] text-muted-foreground cursor-not-allowed opacity-50"
            >
              <FileText className="w-3 h-3" />
              Export PDF
              <span className="text-[9px] border border-border/30 px-1 py-0.5 rounded font-mono">Phase 5</span>
            </button>
            <button
              disabled
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/40 text-[11px] text-muted-foreground cursor-not-allowed opacity-50"
            >
              Share with Client
              <span className="text-[9px] border border-border/30 px-1 py-0.5 rounded font-mono">Phase 5</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Reports ──────────────────────────────────────────────────────────

export function Reports() {
  const { currentWorkspace } = useWorkspace();
  const [statusFilter, setStatusFilter] = useState<string>("All");

  const statuses = ["All", "Draft", "In Review", "Final", "Sent"];

  const allReports = REPORTS.filter(r => r.workspace_id === currentWorkspace.id);

  const filtered = statusFilter === "All"
    ? allReports
    : allReports.filter(r => r.status === statusFilter);

  const sorted = [...filtered].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Reports</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {currentWorkspace.name} — {allReports.length} report{allReports.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-4 gap-3">
          {statuses.slice(1).map(s => {
            const count = allReports.filter(r => r.status === s).length;
            return (
              <div key={s} className="bg-card border border-border/60 rounded-xl px-4 py-3 space-y-1">
                <div className="text-xl font-bold text-foreground">{count}</div>
                <div className="text-[10px] font-medium text-foreground">{s}</div>
                <div className={cn(
                  "text-[9px] px-1.5 py-0.5 rounded border font-semibold leading-none inline-block",
                  STATUS_STYLES[s]
                )}>
                  {s}
                </div>
              </div>
            );
          })}
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
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
          <span className="ml-auto text-[11px] text-muted-foreground">
            {allReports.filter(r => r.client_ready).length} client-ready
          </span>
        </div>

        {/* Report list */}
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 space-y-3">
            <FileText className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No reports found.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map(r => <ReportCard key={r.id} report={r} />)}
          </div>
        )}
      </div>
    </div>
  );
}
