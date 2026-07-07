import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  Grid3X3,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  ChevronRight,
  ArrowRight,
  Zap,
} from "lucide-react";
import { DataSourceBadge } from "@/components/ui/DataSourceBadge";
import { INTELLIGENCE_CARDS } from "@/lib/mock-data";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { resolveVariableLabel, PREFIX_COLORS, getVariablePrefix } from "@/lib/variable-registry";

// ─── Variable chip ─────────────────────────────────────────────────────

function VarChip({ code }: { code: string }) {
  const prefix = getVariablePrefix(code);
  const color  = PREFIX_COLORS[prefix];
  return (
    <span title={code} className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium border", color)}>
      {resolveVariableLabel(code)}
    </span>
  );
}

// ─── Status badge ──────────────────────────────────────────────────────

type MstStatus = "pending_setup" | "pending_assets" | "pending_validation" | "ready" | "results_pending";

const STATUS_CONFIG: Record<MstStatus, { label: string; cls: string; icon: typeof Clock }> = {
  pending_setup:      { label: "Pending setup",      cls: "bg-muted text-muted-foreground border-border/40", icon: Clock },
  pending_assets:     { label: "Pending assets",     cls: "bg-amber-400/10 text-amber-400 border-amber-400/20", icon: AlertCircle },
  pending_validation: { label: "Pending validation", cls: "bg-blue-400/10 text-blue-300 border-blue-400/20", icon: AlertCircle },
  ready:              { label: "Ready for launch",   cls: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20", icon: CheckCircle2 },
  results_pending:    { label: "Results pending",    cls: "bg-primary/10 text-primary border-primary/20", icon: TrendingUp },
};

function StatusBadge({ status }: { status: MstStatus }) {
  const { label, cls, icon: Icon } = STATUS_CONFIG[status];
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold border px-2 py-1 rounded", cls)}>
      <Icon className="w-3 h-3" /> {label}
    </span>
  );
}

// ─── Matrix cell ──────────────────────────────────────────────────────

const MATRIX_CONCEPTS = [
  { col: "C1", code: "CN_ProductDemo",   label: "Product Demo",  codes: ["HK_Authority", "TN_Assertive"] },
  { col: "C2", code: "CN_FounderLed",    label: "Founder Story", codes: ["HK_ProofFirst", "TN_Aspirational"] },
  { col: "C3", code: "CN_SocialProof",   label: "Social Proof",  codes: ["HK_Social", "TN_Relatable"] },
  { col: "C4", code: "CN_BehaviorShift", label: "Behavior Shift",codes: ["HK_Problem", "FW_PAS"] },
];

const MATRIX_ANGLES = [
  { row: "A", label: "Authority",   codes: ["HK_Authority", "TN_Assertive"] },
  { row: "B", label: "Problem-Led", codes: ["FW_PAS", "TN_Rational"] },
  { row: "C", label: "Relatable",   codes: ["HK_Curiosity", "TN_Relatable"] },
  { row: "D", label: "Aspiration",  codes: ["HK_Benefit", "TN_Aspirational"] },
];

function MatrixCell({ col, row, status }: { col: string; row: string; status: MstStatus }) {
  const isReady = status === "ready";
  return (
    <div className={cn(
      "flex flex-col items-center justify-center gap-1 p-2 rounded border text-center h-14",
      isReady
        ? "border-primary/20 bg-primary/5"
        : "border-border/30 bg-white/[0.02]"
    )}>
      <span className="text-[8px] font-mono text-muted-foreground/40">{col}{row}</span>
      {isReady
        ? <CheckCircle2 className="w-3 h-3 text-emerald-400" />
        : <Clock className="w-3 h-3 text-muted-foreground/25" />
      }
    </div>
  );
}

// ─── MST Page ─────────────────────────────────────────────────────────

export function MST() {
  const { currentWorkspace } = useWorkspace();
  const [briefGenerated, setBriefGenerated] = useState(false);

  // Derive top signals from intelligence cards
  const wsCards = INTELLIGENCE_CARDS.filter(c => c.workspace_id === currentWorkspace.id);
  const topCards = wsCards
    .sort((a, b) => {
      const order: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
      return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
    })
    .slice(0, 4);

  const overallStatus: MstStatus = "pending_setup";

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border/40">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-widest block mb-1">MST · 05</span>
            <h1 className="text-[18px] font-semibold text-foreground leading-tight">Metrix Sprint Test</h1>
            <p className="text-[12px] text-muted-foreground/60 mt-0.5">
              Controlled creative variable testing and first-sprint setup.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 pt-1">
            <StatusBadge status={overallStatus} />
            <DataSourceBadge table="mst_matrices" collapsible />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-6 space-y-8 max-w-4xl">

          {/* ── Section A: Historical Signal Summary ── */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded border border-primary/30 bg-primary/10 flex items-center justify-center shrink-0">
                <TrendingUp className="w-3 h-3 text-primary" />
              </div>
              <div>
                <h2 className="text-[13px] font-semibold text-foreground">A. Historical Signal Summary</h2>
                <p className="text-[11px] text-muted-foreground/50">Strongest signals from prior IAP analysis runs</p>
              </div>
            </div>

            {topCards.length === 0 ? (
              <div className="p-4 rounded-lg border border-border/40 bg-white/[0.02] text-center">
                <p className="text-[12px] text-muted-foreground/50">No production data connected yet</p>
                <p className="text-[10px] font-mono text-muted-foreground/30 mt-1">Source: intelligence_cards</p>
              </div>
            ) : (
              <div className="space-y-2">
                {topCards.map(card => (
                  <div key={card.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/40 bg-white/[0.02] hover:border-border/60 transition-colors">
                    <div className={cn(
                      "w-1.5 shrink-0 self-stretch rounded-full mt-0.5",
                      card.severity === "Critical" && "bg-red-500",
                      card.severity === "High"     && "bg-orange-400",
                      card.severity === "Medium"   && "bg-amber-400",
                      card.severity === "Low"      && "bg-muted-foreground/30",
                    )} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium text-foreground leading-tight">{card.title}</p>
                      <p className="text-[11px] text-muted-foreground/60 mt-0.5 leading-relaxed line-clamp-2">{card.recommendation}</p>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className="text-[9px] font-mono text-muted-foreground/40">{card.cohort_key}</span>
                        <span className="text-muted-foreground/20">·</span>
                        <span className="text-[9px] font-mono text-muted-foreground/40">{card.severity}</span>
                      </div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/25 shrink-0 mt-0.5" />
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Section B: First Sprint Builder ── */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded border border-amber-400/30 bg-amber-400/10 flex items-center justify-center shrink-0">
                <Grid3X3 className="w-3 h-3 text-amber-400" />
              </div>
              <div>
                <h2 className="text-[13px] font-semibold text-foreground">B. First Sprint Builder</h2>
                <p className="text-[11px] text-muted-foreground/50">Proposed concept × angle matrix — awaiting asset validation</p>
              </div>
              <span className="ml-auto text-[9px] font-semibold border border-amber-400/20 bg-amber-400/10 text-amber-400 px-1.5 py-0.5 rounded uppercase tracking-wide">
                Pending assets
              </span>
            </div>

            <div className="rounded-xl border border-border/40 bg-white/[0.02] overflow-hidden">
              {/* Column headers */}
              <div className="grid grid-cols-[80px_repeat(4,1fr)] border-b border-border/30">
                <div className="p-3 border-r border-border/20" />
                {MATRIX_CONCEPTS.map(c => (
                  <div key={c.col} className="p-3 border-r border-border/20 last:border-r-0">
                    <div className="text-[8px] font-mono text-muted-foreground/40 mb-1">{c.col}</div>
                    <p className="text-[11px] font-medium text-foreground leading-tight">{c.label}</p>
                    <div className="flex flex-wrap gap-0.5 mt-1.5">
                      {c.codes.slice(0, 2).map(code => <VarChip key={code} code={code} />)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Rows */}
              {MATRIX_ANGLES.map(angle => (
                <div key={angle.row} className="grid grid-cols-[80px_repeat(4,1fr)] border-b border-border/20 last:border-b-0">
                  <div className="p-3 border-r border-border/20">
                    <div className="text-[8px] font-mono text-muted-foreground/40 mb-1">{angle.row}</div>
                    <p className="text-[11px] font-medium text-foreground leading-tight">{angle.label}</p>
                    <div className="flex flex-wrap gap-0.5 mt-1">
                      {angle.codes.slice(0, 1).map(code => <VarChip key={code} code={code} />)}
                    </div>
                  </div>
                  {MATRIX_CONCEPTS.map(c => (
                    <div key={c.col} className="p-2 border-r border-border/20 last:border-r-0">
                      <MatrixCell col={c.col} row={angle.row} status="pending_setup" />
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Validation requirements */}
            <div className="mt-3 space-y-1.5">
              {[
                { label: "Asset library connected",    done: false },
                { label: "Creative briefs generated",  done: false },
                { label: "Variable stacks confirmed",  done: false },
                { label: "Matrix positions validated", done: false },
              ].map(req => (
                <div key={req.label} className="flex items-center gap-2 text-[11px]">
                  {req.done
                    ? <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                    : <AlertCircle  className="w-3 h-3 text-muted-foreground/30 shrink-0" />
                  }
                  <span className={cn(req.done ? "text-foreground/70" : "text-muted-foreground/40")}>{req.label}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ── Section C: Generate First MST Brief ── */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded border border-emerald-400/30 bg-emerald-400/10 flex items-center justify-center shrink-0">
                <FileText className="w-3 h-3 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-[13px] font-semibold text-foreground">C. Generate First MST Brief</h2>
                <p className="text-[11px] text-muted-foreground/50">Creates a draft brief from historical IAP signals — no live campaign changes</p>
              </div>
            </div>

            <div className="p-5 rounded-xl border border-border/40 bg-white/[0.02]">
              {briefGenerated ? (
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <p className="text-[13px] font-semibold text-foreground">Draft brief created</p>
                    <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                      MST Sprint 01 brief routed to Brief Builder for review.
                    </p>
                  </div>
                  <a
                    href="/app/strategy/brief-builder"
                    onClick={(e) => { e.preventDefault(); window.history.pushState({}, "", "/app/strategy/brief-builder"); window.dispatchEvent(new PopStateEvent("popstate")); }}
                    className="ml-auto flex items-center gap-1.5 h-8 px-3 rounded bg-primary/15 border border-primary/30 text-[11px] font-medium text-primary hover:bg-primary/25 transition-colors"
                  >
                    View in Brief Builder <ArrowRight className="w-3 h-3" />
                  </a>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2 text-[11px] text-muted-foreground/60">
                    <p>This action generates a structured MST sprint brief from your strongest historical IAP signals.</p>
                    <ul className="space-y-1 list-none">
                      {[
                        "Proposes C1–C4 concept families from historical concept performance",
                        "Proposes A–D angle rows from hook/framework signal data",
                        "Creates a draft brief — does not edit live campaigns",
                        "Routes the brief to Brief Builder for review and approval",
                      ].map((item, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-primary/60 shrink-0 mt-0.5">—</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 p-2.5 rounded border border-amber-400/15 bg-amber-400/[0.04] flex-1">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <p className="text-[10px] text-amber-400/80">
                        Complete asset validation in Section B before launching the first sprint.
                      </p>
                    </div>
                    <button
                      onClick={() => setBriefGenerated(true)}
                      className="flex items-center gap-1.5 h-9 px-4 rounded bg-primary/15 border border-primary/30 text-[12px] font-medium text-primary hover:bg-primary/25 transition-colors shrink-0"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      Generate Draft Brief
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

        </div>
      </div>
    </div>
  );
}
