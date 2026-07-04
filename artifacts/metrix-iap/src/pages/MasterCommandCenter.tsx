import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  Zap, ArrowRight, Upload, Info,
  CheckCircle2, AlertCircle, AlertTriangle,
} from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { workspaceNeedsOnboarding } from "@/lib/workspace-state";
import { WORKSPACES, AD_ACCOUNTS, ANALYSIS_RUNS, IMPORTS } from "@/lib/mock-data";
import type { WorkspaceHealthStatus } from "@/lib/types";

const HEALTH_DOT: Record<WorkspaceHealthStatus, string> = {
  Healthy: "bg-emerald-500",
  Watch: "bg-yellow-400",
  "Needs Action": "bg-orange-400",
  Critical: "bg-red-500",
};

const HEALTH_BADGE: Record<WorkspaceHealthStatus, string> = {
  Healthy: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  Watch: "bg-yellow-400/10 text-yellow-400 border-yellow-400/20",
  "Needs Action": "bg-orange-400/10 text-orange-400 border-orange-400/20",
  Critical: "bg-destructive/10 text-destructive border-destructive/20",
};

// Derive a short display label for an analysis run
function runLabel(run: { depth: string; objective: string; id: string }) {
  return `${run.depth} — ${run.objective}`;
}

// Format date range
function dateRange(start: string, end: string) {
  return `${start} – ${end}`;
}

// ─── Bookster-specific headline KPIs ─────────────────────────────────

const BOOKSTER_KPI = [
  { label: "CPT (Cost per Trial)", before: "$575.86", after: "$258.34", delta: "−55%", positive: true },
  { label: "Reg → Trial Rate", before: "8.3%", after: "22.2%", delta: "+167%", positive: true },
  { label: "Android CPT", before: "—", after: "$258.34", delta: "Primary", positive: true },
  { label: "Open Issues", before: "", after: "1", delta: "Pixel/CAPI", positive: false },
];

export function MasterCommandCenter() {
  const [, navigate] = useLocation();
  const { switchWorkspace } = useWorkspace();

  const booksterWs = WORKSPACES.find(w => w.id === "ws_bookster")!;
  const otherWorkspaces = WORKSPACES.filter(w => w.id !== "ws_bookster");

  const booksterAccounts = AD_ACCOUNTS.filter(a => a.workspace_id === "ws_bookster");
  const booksterRuns = ANALYSIS_RUNS
    .filter(r => r.workspace_id === "ws_bookster")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const latestRun = booksterRuns[0];
  const openFindings = latestRun
    ? latestRun.findings.filter(f => f.is_open)
    : [];

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {/* Header */}
        <div className="space-y-1">
          <div className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-widest">
            Meta Marketing Agency
          </div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            Master Command Center
          </h1>
          <p className="text-sm text-muted-foreground">
            Agency-wide overview — {WORKSPACES.length} workspaces
          </p>
        </div>

        {/* Summary row */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Active Workspaces", value: "1", sub: "of 6 with data", color: "text-foreground" },
            { label: "Ad Accounts", value: String(booksterAccounts.length), sub: "Bookster only", color: "text-foreground" },
            { label: "Analysis Runs", value: String(booksterRuns.length), sub: "all from Bookster", color: "text-primary" },
            { label: "Open Issues", value: String(openFindings.length), sub: "Pixel/CAPI — Bookster", color: "text-destructive" },
          ].map(({ label, value, sub, color }) => (
            <div key={label} className="bg-card border border-border/60 rounded-xl px-4 py-3">
              <div className={cn("text-2xl font-bold leading-none", color)}>{value}</div>
              <div className="text-[11px] font-medium text-foreground mt-1.5">{label}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
            </div>
          ))}
        </div>

        {/* Bookster spotlight */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-primary" />
              <span className="text-sm font-semibold text-foreground">Bookster — Active IAP Workspace</span>
              <span className={cn(
                "text-[10px] px-1.5 py-0.5 rounded border font-semibold",
                HEALTH_BADGE[booksterWs.health_status]
              )}>
                {booksterWs.health_status}
              </span>
            </div>
            <button
              onClick={() => switchWorkspace("ws_bookster")}
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              Open workspace <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="bg-card border border-border/60 rounded-xl p-5 space-y-5">
            {/* KPI deltas */}
            <div className="grid grid-cols-4 gap-3">
              {BOOKSTER_KPI.map(kpi => (
                <div key={kpi.label} className="space-y-1.5">
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                    {kpi.label}
                  </div>
                  <div className="flex items-end gap-2">
                    <span className="text-lg font-bold text-foreground leading-none">{kpi.after}</span>
                    <span className={cn(
                      "text-[10px] font-semibold px-1 py-0.5 rounded leading-none mb-0.5",
                      kpi.positive ? "text-emerald-400 bg-emerald-500/10" : "text-destructive bg-destructive/10"
                    )}>
                      {kpi.delta}
                    </span>
                  </div>
                  {kpi.before && (
                    <div className="text-[10px] text-muted-foreground/60">was {kpi.before}</div>
                  )}
                </div>
              ))}
            </div>

            <div className="border-t border-border/40" />

            {/* Ad accounts */}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Ad Accounts ({booksterAccounts.length})
              </div>
              <div className="grid grid-cols-2 gap-2">
                {booksterAccounts.map(account => (
                  <button
                    key={account.id}
                    onClick={() => navigate(`/app/workspaces/ws_bookster/ad-accounts/${account.id}`)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border/40 bg-background/50 hover:border-primary/30 hover:bg-primary/5 transition-all text-left group"
                  >
                    <div className={cn(
                      "w-1.5 h-1.5 rounded-full shrink-0",
                      account.data_quality_score >= 80 ? "bg-emerald-500" :
                      account.data_quality_score >= 60 ? "bg-yellow-400" : "bg-orange-400"
                    )} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-foreground truncate">{account.account_name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {account.platform} · {account.open_recommendations} open rec{account.open_recommendations !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <ArrowRight className="w-3 h-3 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />
                  </button>
                ))}
              </div>
            </div>

            {/* Latest run */}
            {latestRun && (
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Latest Analysis Run
                </div>
                <button
                  onClick={() => navigate(`/app/iap/runs/${latestRun.id}`)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border/40 bg-background/50 hover:border-primary/30 hover:bg-primary/5 transition-all text-left group"
                >
                  <div className="w-7 h-7 rounded bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
                    <Zap className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-foreground truncate">{runLabel(latestRun)}</span>
                      <span className={cn(
                        "shrink-0 text-[10px] px-1.5 py-0.5 rounded border font-medium leading-none",
                        latestRun.status === "Completed" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : latestRun.status === "Running" ? "bg-primary/10 text-primary border-primary/20"
                        : "bg-muted text-muted-foreground border-border/40"
                      )}>
                        {latestRun.status}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {latestRun.findings.length} findings · {dateRange(latestRun.date_range_start, latestRun.date_range_end)}
                    </div>
                  </div>
                  <ArrowRight className="w-3 h-3 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Other workspaces — onboarding */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Upload className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">Other Workspaces</span>
            <span className="text-[10px] text-muted-foreground border border-border/40 px-1.5 py-0.5 rounded font-mono">
              Setup required
            </span>
          </div>

          <div className="space-y-2">
            {otherWorkspaces.map(ws => (
              <button
                key={ws.id}
                onClick={() => switchWorkspace(ws.id)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border/40 bg-card hover:border-border/80 transition-all text-left group"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{ws.name}</span>
                    <span className={cn(
                      "text-[9px] px-1 py-0.5 rounded border font-semibold leading-none",
                      HEALTH_BADGE[ws.health_status]
                    )}>
                      {ws.health_status}
                    </span>
                    <span className="text-[10px] text-muted-foreground border border-border/40 px-1 py-0.5 rounded font-mono">
                      {ws.type}
                    </span>
                  </div>
                  {ws.client_name && (
                    <div className="text-xs text-muted-foreground mt-0.5">{ws.client_name}</div>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  Connect account or upload imports →
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Info callout */}
        <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-primary/5 border border-primary/15 text-xs text-muted-foreground">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-primary/60" />
          <div className="leading-relaxed">
            <strong className="text-foreground">Sample data mode.</strong>{" "}
            This prototype is exclusively populated with Bookster (Book2) performance data.
            Other workspaces show the onboarding flow — connect a Meta Ads account or upload the required IAP CSV exports.
          </div>
        </div>

      </div>
    </div>
  );
}
