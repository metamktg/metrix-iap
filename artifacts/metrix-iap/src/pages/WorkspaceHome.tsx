import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  Zap, ArrowRight, Upload, BarChart3, ChevronRight,
} from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  AD_ACCOUNTS, ANALYSIS_RUNS, IMPORTS,
} from "@/lib/mock-data";
import type { AnalysisRun } from "@/lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────

function runDisplayLabel(run: AnalysisRun) {
  return `${run.depth} — ${run.objective}`;
}

function dateRange(start: string, end: string) {
  return `${start} – ${end}`;
}

function importDisplayLabel(imp: { date_range_start: string; date_range_end: string }) {
  return dateRange(imp.date_range_start, imp.date_range_end);
}

function totalRows(imp: { files: { row_count: number }[] }) {
  return imp.files.reduce((s, f) => s + f.row_count, 0);
}

// ─── WorkspaceHome ────────────────────────────────────────────────────

export function WorkspaceHome() {
  const [, navigate] = useLocation();
  const { currentWorkspace } = useWorkspace();

  if (!currentWorkspace) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
        No workspace selected.
      </div>
    );
  }

  const wsId = currentWorkspace.id;

  const accounts = AD_ACCOUNTS.filter(a => a.workspace_id === wsId);
  const runs = ANALYSIS_RUNS
    .filter(r => r.workspace_id === wsId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const imports = IMPORTS
    .filter(i => i.workspace_id === wsId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const latestRun = runs[0];
  const openFindings = latestRun ? latestRun.findings.filter(f => f.is_open) : [];
  const latestFindings = latestRun ? latestRun.findings.slice(0, 4) : [];

  const STATUS_BADGE: Record<string, string> = {
    Completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    Running: "bg-primary/10 text-primary border-primary/20",
    Failed: "bg-destructive/10 text-destructive border-destructive/20",
    Pending: "bg-muted text-muted-foreground border-border/40",
    Archived: "bg-muted text-muted-foreground border-border/40",
  };

  const IMPORT_STATUS_BADGE: Record<string, string> = {
    Processed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    Ready: "bg-primary/10 text-primary border-primary/20",
    Warning: "bg-yellow-400/10 text-yellow-400 border-yellow-400/20",
    "Needs Mapping": "bg-yellow-400/10 text-yellow-400 border-yellow-400/20",
    Failed: "bg-destructive/10 text-destructive border-destructive/20",
    Uploaded: "bg-muted text-muted-foreground border-border/40",
    Validating: "bg-muted text-muted-foreground border-border/40",
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-7">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              {currentWorkspace.name}
            </h1>
            {currentWorkspace.client_name && (
              <p className="text-sm text-muted-foreground">{currentWorkspace.client_name}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`/app/workspaces/${wsId}/imports`)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border/60 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-all"
            >
              <Upload className="w-3 h-3" />
              Import Center
            </button>
            <button
              onClick={() => navigate("/app/iap/new")}
              className="flex items-center gap-1.5 text-xs text-white bg-primary hover:bg-primary/90 px-3 py-1.5 rounded-lg font-medium transition-all"
            >
              <Zap className="w-3 h-3" />
              New IAP Run
            </button>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-4 gap-3">
          {[
            {
              label: "Ad Accounts",
              value: accounts.length,
              sub: `${accounts.filter(a => a.data_quality_score >= 80).length} high quality`,
              color: "text-foreground",
            },
            {
              label: "Analysis Runs",
              value: runs.length,
              sub: `${runs.filter(r => r.status === "Completed").length} completed`,
              color: "text-primary",
            },
            {
              label: "Open Findings",
              value: openFindings.length,
              sub: openFindings.length > 0 ? "action required" : "all resolved",
              color: openFindings.length > 0 ? "text-destructive" : "text-emerald-400",
            },
            {
              label: "Imports",
              value: imports.length,
              sub: `${imports.filter(i => i.status === "Processed").length} processed`,
              color: "text-foreground",
            },
          ].map(item => (
            <div key={item.label} className="bg-card border border-border/60 rounded-xl px-4 py-3">
              <div className={cn("text-2xl font-bold leading-none", item.color)}>{item.value}</div>
              <div className="text-[11px] font-medium text-foreground mt-1.5">{item.label}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{item.sub}</div>
            </div>
          ))}
        </div>

        {/* Two-column: Ad accounts + Latest run */}
        <div className="grid grid-cols-2 gap-5">

          {/* Ad accounts */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">Ad Accounts</span>
              </div>
              <button
                onClick={() => navigate(`/app/workspaces/${wsId}/ad-accounts`)}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5"
              >
                View all <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="space-y-2">
              {accounts.map(account => (
                <button
                  key={account.id}
                  onClick={() => navigate(`/app/workspaces/${wsId}/ad-accounts/${account.id}`)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border/60 bg-card hover:border-primary/30 hover:bg-primary/5 transition-all text-left group"
                >
                  <div className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    account.data_quality_score >= 80 ? "bg-emerald-500" :
                    account.data_quality_score >= 60 ? "bg-yellow-400" : "bg-orange-400"
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-foreground truncate">{account.account_name}</div>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                      <span>{account.platform}</span>
                      <span className="text-muted-foreground/30">·</span>
                      <span className={account.open_recommendations > 0 ? "text-[hsl(var(--metrix-gold))]" : ""}>
                        {account.open_recommendations} rec{account.open_recommendations !== 1 ? "s" : ""}
                      </span>
                      {account.data_quality_score && (
                        <>
                          <span className="text-muted-foreground/30">·</span>
                          <span>DQ: {account.data_quality_score}</span>
                        </>
                      )}
                    </div>
                    {account.platform_label && (
                      <div className="text-[9px] text-muted-foreground/60 mt-0.5">{account.platform_label}</div>
                    )}
                  </div>
                  <span className={cn(
                    "text-[9px] px-1 py-0.5 rounded border font-semibold leading-none shrink-0",
                    account.data_quality_score >= 80
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : account.data_quality_score >= 60
                      ? "bg-yellow-400/10 text-yellow-400 border-yellow-400/20"
                      : "bg-orange-400/10 text-orange-400 border-orange-400/20"
                  )}>
                    {account.status}
                  </span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />
                </button>
              ))}
              {accounts.length === 0 && (
                <div className="text-center py-6 text-xs text-muted-foreground border border-border/40 rounded-xl">
                  No ad accounts connected.
                </div>
              )}
            </div>
          </div>

          {/* Latest run */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">Latest IAP Run</span>
              </div>
              <button
                onClick={() => navigate("/app/iap/new")}
                className="text-[11px] text-primary hover:text-primary/80 transition-colors flex items-center gap-0.5"
              >
                New run <ChevronRight className="w-3 h-3" />
              </button>
            </div>

            {latestRun ? (
              <button
                onClick={() => navigate(`/app/iap/runs/${latestRun.id}`)}
                className="w-full bg-card border border-border/60 rounded-xl p-4 hover:border-primary/30 hover:bg-primary/5 transition-all text-left group space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-foreground">{runDisplayLabel(latestRun)}</span>
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded border font-medium leading-none shrink-0",
                        STATUS_BADGE[latestRun.status] ?? "bg-muted text-muted-foreground border-border/40"
                      )}>
                        {latestRun.status}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      {dateRange(latestRun.date_range_start, latestRun.date_range_end)}
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0 mt-0.5" />
                </div>

                <div className="flex gap-4 text-[11px]">
                  <div>
                    <div className="text-muted-foreground">Findings</div>
                    <div className="font-semibold text-foreground">{latestRun.findings.length}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Open</div>
                    <div className={cn(
                      "font-semibold",
                      openFindings.length > 0 ? "text-destructive" : "text-emerald-400"
                    )}>
                      {openFindings.length}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Signal Quality</div>
                    <div className="font-semibold text-foreground">{latestRun.signal_quality.overall}/100</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Confidence</div>
                    <div className="font-semibold text-foreground">{latestRun.confidence_score}/100</div>
                  </div>
                </div>

                {latestFindings.length > 0 && (
                  <div className="space-y-1.5 border-t border-border/40 pt-3">
                    {latestFindings.map(f => (
                      <div key={f.id} className="flex items-start gap-2 text-[11px]">
                        <div className={cn(
                          "w-1.5 h-1.5 rounded-full mt-1 shrink-0",
                          f.is_open ? "bg-orange-400" : "bg-emerald-500"
                        )} />
                        <span className={cn(
                          "leading-tight",
                          f.is_open ? "text-foreground" : "text-muted-foreground"
                        )}>
                          {f.title}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </button>
            ) : (
              <div className="bg-card border border-border/40 rounded-xl p-6 text-center text-sm text-muted-foreground">
                No analysis runs yet.
                <br />
                <button
                  onClick={() => navigate("/app/iap/new")}
                  className="text-primary hover:underline mt-1 text-xs"
                >
                  Start your first IAP run →
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Priority read */}
        {latestRun && (
          <div className="bg-card border border-border/60 rounded-xl p-5 space-y-2">
            <div className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Priority Read</span>
              <span className="text-[10px] text-muted-foreground font-mono">{latestRun.id}</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{latestRun.priority_read}</p>
          </div>
        )}

        {/* Recent imports */}
        {imports.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Upload className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-sm font-semibold text-foreground">Recent Imports</span>
              </div>
              <button
                onClick={() => navigate(`/app/workspaces/${wsId}/imports`)}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5"
              >
                View all <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {imports.slice(0, 3).map(imp => (
                <div key={imp.id} className="bg-card border border-border/60 rounded-xl px-4 py-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-muted-foreground/60 truncate">{imp.id}</span>
                    <span className={cn(
                      "text-[9px] px-1 py-0.5 rounded border font-semibold leading-none shrink-0",
                      IMPORT_STATUS_BADGE[imp.status] ?? "bg-muted text-muted-foreground border-border/40"
                    )}>
                      {imp.status}
                    </span>
                  </div>
                  <div className="text-xs font-medium text-foreground">{importDisplayLabel(imp)}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {imp.files.length} file{imp.files.length !== 1 ? "s" : ""} · {totalRows(imp).toLocaleString()} rows
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
