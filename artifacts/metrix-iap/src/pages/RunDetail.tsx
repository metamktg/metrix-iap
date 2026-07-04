import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  Zap, ChevronLeft, ChevronDown, ChevronRight,
  CheckCircle2, AlertCircle, Clock, Target,
  Activity, FileText, ArrowRight, User,
} from "lucide-react";
import { ANALYSIS_RUNS, WORKSPACES } from "@/lib/mock-data";
import type { Finding, DecisionFeedItem, Recommendation, ConfidenceLabel, PerformanceTier } from "@/lib/types";

// ─── Helpers ──────────────────────────────────────────────────────────

function confidenceChip(c: ConfidenceLabel) {
  const map: Record<ConfidenceLabel, string> = {
    high: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
    medium: "bg-yellow-400/10 border-yellow-400/20 text-yellow-400",
    validation_required: "bg-orange-400/10 border-orange-400/20 text-orange-400",
    insufficient: "bg-muted border-border/40 text-muted-foreground",
  };
  const labels: Record<ConfidenceLabel, string> = {
    high: "High",
    medium: "Medium",
    validation_required: "Validate",
    insufficient: "Insufficient",
  };
  return (
    <span className={cn("text-[9px] px-1.5 py-0.5 rounded border font-semibold leading-none shrink-0", map[c])}>
      {labels[c]}
    </span>
  );
}

function tierPill(t?: PerformanceTier) {
  if (!t) return null;
  const color = t === 1 ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10"
    : t === 2 ? "text-yellow-400 border-yellow-400/20 bg-yellow-400/10"
    : t === 3 ? "text-orange-400 border-orange-400/20 bg-orange-400/10"
    : "text-red-400 border-red-500/20 bg-red-500/10";
  return (
    <span className={cn("text-[9px] px-1.5 py-0.5 rounded border font-semibold leading-none shrink-0", color)}>
      T{t}
    </span>
  );
}

function decisionTypeColor(d: string) {
  const m: Record<string, string> = {
    Scale: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    Hold: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
    Isolate: "text-orange-400 bg-orange-400/10 border-orange-400/20",
    Kill: "text-red-400 bg-red-500/10 border-red-500/20",
    Rebuild: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    Retest: "text-purple-400 bg-purple-500/10 border-purple-500/20",
    "Brief Next Sprint": "text-primary bg-primary/10 border-primary/20",
  };
  return m[d] ?? "text-muted-foreground bg-muted border-border/40";
}

// ─── Signal Quality Bar ────────────────────────────────────────────────

function QualityBar({ label, value }: { label: string; value: number }) {
  const color = value >= 80 ? "bg-emerald-500" : value >= 60 ? "bg-yellow-400" : value >= 40 ? "bg-orange-400" : "bg-red-400";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("font-mono font-semibold", value >= 80 ? "text-emerald-400" : value >= 60 ? "text-yellow-400" : value >= 40 ? "text-orange-400" : "text-red-400")}>
          {value}
        </span>
      </div>
      <div className="w-full bg-border/30 rounded-full h-1.5 overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

// ─── Finding Card ──────────────────────────────────────────────────────

function FindingCard({ finding }: { finding: Finding }) {
  const [open, setOpen] = useState(finding.is_priority_read);
  return (
    <div className={cn(
      "rounded-xl border transition-all overflow-hidden",
      finding.is_open ? "border-orange-400/30 bg-orange-400/5" : "border-border/60 bg-card"
    )}>
      <button
        className="w-full flex items-start gap-3 p-4 text-left"
        onClick={() => setOpen(o => !o)}
      >
        <div className={cn(
          "w-2 h-2 rounded-full mt-1.5 shrink-0",
          finding.is_open ? "bg-orange-400" : "bg-emerald-500"
        )} />
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("text-xs font-semibold leading-snug", finding.is_open ? "text-orange-300" : "text-foreground")}>
              {finding.title}
            </span>
            {finding.is_priority_read && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary font-semibold leading-none">
                Priority Read
              </span>
            )}
            {finding.is_open && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-400/10 border border-orange-400/20 text-orange-400 font-semibold leading-none">
                Open
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-muted-foreground border border-border/40 px-1.5 py-0.5 rounded">{finding.dimension}</span>
            {confidenceChip(finding.confidence)}
            {tierPill(finding.tier)}
          </div>
        </div>
        <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform mt-0.5", open && "rotate-180")} />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-0 border-t border-border/30 space-y-3">
          <p className="text-[11px] text-muted-foreground leading-relaxed pt-3">{finding.body}</p>
          {finding.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {finding.tags.map(tag => (
                <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/30 font-mono">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Decision Feed Item ────────────────────────────────────────────────

function DecisionItem({ item }: { item: DecisionFeedItem }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border/60 rounded-xl bg-card overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        onClick={() => setOpen(o => !o)}
      >
        <span className={cn("text-[10px] px-2 py-1 rounded border font-bold leading-none shrink-0", decisionTypeColor(item.decision_type))}>
          {item.decision_type}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {tierPill(item.tier)}
          {confidenceChip(item.confidence_label)}
        </div>
        <span className="text-[11px] text-muted-foreground flex-1 truncate">{item.evidence}</span>
        <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-border/30 space-y-3">
          <div className="grid grid-cols-2 gap-3 pt-3">
            <div>
              <div className="text-[10px] text-muted-foreground font-medium mb-1 flex items-center gap-1">
                <Activity className="w-3 h-3" /> Supporting Metric
              </div>
              <p className="text-[11px] text-foreground font-mono">{item.supporting_metric}</p>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground font-medium mb-1 flex items-center gap-1">
                <User className="w-3 h-3" /> Owner
              </div>
              <p className="text-[11px] text-foreground">{item.owner}</p>
            </div>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground font-medium mb-1">Why It Matters</div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{item.why_it_matters}</p>
          </div>
          <div>
            <div className="text-[10px] text-muted-foreground font-medium mb-1">Action</div>
            <p className="text-[11px] text-foreground leading-relaxed">{item.action}</p>
          </div>
          <div>
            <div className="text-[10px] text-red-400/80 font-medium mb-1 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> Risk If Ignored
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{item.risk_if_ignored}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Recommendation Card ───────────────────────────────────────────────

function RecCard({ rec }: { rec: Recommendation }) {
  const priorityColor: Record<string, string> = {
    Critical: "text-red-400 border-red-500/20 bg-red-500/10",
    High: "text-orange-400 border-orange-400/20 bg-orange-400/10",
    Medium: "text-yellow-400 border-yellow-400/20 bg-yellow-400/10",
    Low: "text-muted-foreground border-border/40 bg-muted",
  };
  const statusColor: Record<string, string> = {
    Open: "text-orange-400",
    "In Progress": "text-primary",
    Completed: "text-emerald-400",
    Dismissed: "text-muted-foreground",
  };
  return (
    <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-border/60 bg-card">
      <span className={cn("text-[9px] px-1.5 py-0.5 rounded border font-bold leading-none shrink-0 mt-0.5", priorityColor[rec.priority])}>
        {rec.priority}
      </span>
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs font-medium text-foreground leading-snug">{rec.title}</span>
          <span className={cn("text-[10px] shrink-0", statusColor[rec.status])}>{rec.status}</span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">{rec.action}</p>
      </div>
    </div>
  );
}

// ─── RunDetail ────────────────────────────────────────────────────────

export function RunDetail() {
  const { runId } = useParams<{ runId: string }>();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<"findings" | "decisions" | "recommendations">("findings");

  const run = ANALYSIS_RUNS.find(r => r.id === runId);
  const workspace = run ? WORKSPACES.find(w => w.id === run.workspace_id) : null;

  if (!run) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <h2 className="text-lg font-bold text-foreground">Run not found</h2>
          <p className="text-xs text-muted-foreground">Run ID: {runId}</p>
          <button onClick={() => navigate("/")} className="text-xs text-primary hover:underline">
            Back to Command Center
          </button>
        </div>
      </div>
    );
  }

  const openFindings = run.findings.filter(f => f.is_open);
  const sq = run.signal_quality;

  const SQ_DIMENSIONS = [
    { key: "tracking_confidence", label: "Tracking Confidence", value: sq.tracking_confidence },
    { key: "conversion_volume_confidence", label: "Conversion Volume", value: sq.conversion_volume_confidence },
    { key: "spend_sufficiency", label: "Spend Sufficiency", value: sq.spend_sufficiency },
    { key: "creative_diversity", label: "Creative Diversity", value: sq.creative_diversity },
    { key: "learning_stability", label: "Learning Stability", value: sq.learning_stability },
    { key: "funnel_consistency", label: "Funnel Consistency", value: sq.funnel_consistency },
    { key: "segment_clarity", label: "Segment Clarity", value: sq.segment_clarity },
    { key: "data_cleanliness", label: "Data Cleanliness", value: sq.data_cleanliness },
    { key: "date_range_reliability", label: "Date Range Reliability", value: sq.date_range_reliability },
    { key: "breakdown_usefulness", label: "Breakdown Usefulness", value: sq.breakdown_usefulness },
  ];

  const STATUS_BADGE: Record<string, string> = {
    Completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    Running: "bg-primary/10 text-primary border-primary/20",
    Failed: "bg-destructive/10 text-destructive border-destructive/20",
    Pending: "bg-muted text-muted-foreground border-border/40",
    Archived: "bg-muted text-muted-foreground border-border/40",
  };

  const tabs = [
    { id: "findings" as const, label: "Findings", count: run.findings.length },
    { id: "decisions" as const, label: "Decision Feed", count: run.decision_feed.length },
    { id: "recommendations" as const, label: "Recommendations", count: run.recommendations.length },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start gap-3">
          <button
            onClick={() => window.history.back()}
            className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-all mt-0.5"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="text-xl font-bold text-foreground tracking-tight">
                {run.depth} — {run.objective}
              </h1>
              <span className={cn(
                "text-[10px] px-2 py-0.5 rounded border font-semibold leading-none",
                STATUS_BADGE[run.status] ?? "bg-muted text-muted-foreground border-border/40"
              )}>
                {run.status}
              </span>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
              {workspace && (
                <button
                  onClick={() => navigate(`/app/workspaces/${workspace.id}`)}
                  className="flex items-center gap-1 hover:text-foreground transition-colors"
                >
                  {workspace.name}
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {run.date_range_start} – {run.date_range_end}
              </span>
              <span className="font-mono text-muted-foreground/60">{run.id}</span>
            </div>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: "Signal Quality", value: `${sq.overall}/100`, sub: sq.overall >= 80 ? "Strong" : sq.overall >= 60 ? "Moderate" : "Weak", color: sq.overall >= 80 ? "text-emerald-400" : sq.overall >= 60 ? "text-yellow-400" : "text-orange-400" },
            { label: "Confidence", value: `${run.confidence_score}/100`, sub: run.confidence_score >= 80 ? "High" : "Medium", color: "text-foreground" },
            { label: "Findings", value: run.findings.length, sub: `${openFindings.length} open`, color: openFindings.length > 0 ? "text-orange-400" : "text-foreground" },
            { label: "Recommendations", value: run.recommendations.length, sub: `${run.recommendations.filter(r => r.status === "Open").length} open`, color: "text-foreground" },
            { label: "Decisions", value: run.decision_feed.length, sub: `${run.decision_feed.filter(d => d.status === "Open").length} open`, color: "text-foreground" },
          ].map(k => (
            <div key={k.label} className="bg-card border border-border/60 rounded-xl px-3 py-2.5">
              <div className={cn("text-xl font-bold leading-none", k.color)}>{k.value}</div>
              <div className="text-[10px] font-medium text-foreground mt-1">{k.label}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Priority Read */}
        <div className="bg-card border border-primary/20 rounded-xl p-5 space-y-2">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Priority Read</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{run.priority_read}</p>
        </div>

        {/* Two-column: Diagnosis + Signal Quality */}
        <div className="grid grid-cols-2 gap-5">

          {/* Diagnosis */}
          <div className="space-y-3">
            <div className="bg-card border border-border/60 rounded-xl p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Target className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-foreground">Executive Diagnosis</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{run.executive_diagnosis}</p>

              <div className="border-t border-border/40 pt-3 space-y-3">
                <div>
                  <div className="text-[10px] text-red-400/80 font-medium mb-0.5 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Primary Constraint
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{run.primary_constraint}</p>
                </div>
                <div>
                  <div className="text-[10px] text-emerald-400/80 font-medium mb-0.5 flex items-center gap-1">
                    <ChevronRight className="w-3 h-3" /> Primary Opportunity
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{run.primary_opportunity}</p>
                </div>
                <div>
                  <div className="text-[10px] text-primary/80 font-medium mb-0.5 flex items-center gap-1">
                    <Zap className="w-3 h-3" /> Recommended Next Action
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{run.recommended_next_action}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Signal Quality */}
          <div className="bg-card border border-border/60 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-foreground">Signal Quality</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className={cn(
                  "text-2xl font-bold",
                  sq.overall >= 80 ? "text-emerald-400" : sq.overall >= 60 ? "text-yellow-400" : "text-orange-400"
                )}>
                  {sq.overall}
                </span>
                <span className="text-xs text-muted-foreground">/100</span>
              </div>
            </div>
            <div className="space-y-2.5">
              {SQ_DIMENSIONS.map(dim => (
                <QualityBar key={dim.key} label={dim.label} value={dim.value} />
              ))}
            </div>
          </div>
        </div>

        {/* Tab: Findings / Decision Feed / Recommendations */}
        <div className="space-y-4">
          <div className="flex items-center gap-1 border-b border-border/50">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-all -mb-px",
                  activeTab === tab.id
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
                <span className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-full font-semibold",
                  activeTab === tab.id ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                )}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {activeTab === "findings" && (
            <div className="space-y-2">
              {run.findings.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">No findings for this run.</p>
              ) : (
                run.findings.map(f => <FindingCard key={f.id} finding={f} />)
              )}
            </div>
          )}

          {activeTab === "decisions" && (
            <div className="space-y-2">
              {run.decision_feed.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">No decision feed items.</p>
              ) : (
                run.decision_feed.map(d => <DecisionItem key={d.id} item={d} />)
              )}
            </div>
          )}

          {activeTab === "recommendations" && (
            <div className="space-y-2">
              {run.recommendations.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">No recommendations.</p>
              ) : (
                run.recommendations.map(r => <RecCard key={r.id} rec={r} />)
              )}
            </div>
          )}
        </div>

        {/* Action footer */}
        <div className="flex items-center gap-3 py-4 border-t border-border/40">
          <button
            onClick={() => navigate("/app/iap/new")}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border/60 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border transition-all"
          >
            <Zap className="w-3.5 h-3.5" />
            New Run
          </button>
          <button
            disabled
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border/40 text-xs font-medium text-muted-foreground cursor-not-allowed opacity-50"
          >
            <FileText className="w-3.5 h-3.5" />
            Generate Brief
            <span className="text-[9px] border border-border/40 px-1 py-0.5 rounded font-mono">Phase 4</span>
          </button>
          <button
            disabled
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border/40 text-xs font-medium text-muted-foreground cursor-not-allowed opacity-50"
          >
            <FileText className="w-3.5 h-3.5" />
            Export Report
            <span className="text-[9px] border border-border/40 px-1 py-0.5 rounded font-mono">Phase 4</span>
          </button>
        </div>

      </div>
    </div>
  );
}
