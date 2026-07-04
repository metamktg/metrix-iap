import { useParams, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  ChevronLeft, FileText, Target, Eye, Zap, MessageSquare,
  Lightbulb, CheckCircle2, XCircle, BarChart3, Layers, AlertCircle,
  ArrowRight, Activity,
} from "lucide-react";
import { BRIEFS, WORKSPACES, USERS, ANALYSIS_RUNS, CREATIVE_CONCEPTS, ADS } from "@/lib/mock-data";

// ─── Status / funnel styling ───────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  Draft: "bg-muted text-muted-foreground border-border/40",
  "In Review": "bg-yellow-400/10 text-yellow-400 border-yellow-400/20",
  Approved: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  "In Production": "bg-primary/10 text-primary border-primary/20",
  Archived: "bg-muted text-muted-foreground/60 border-border/30",
};

// ─── Section wrapper ───────────────────────────────────────────────────

function Section({
  icon,
  title,
  children,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className={cn("bg-card border rounded-xl p-5 space-y-3", accent ?? "border-border/60")}>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-xs font-semibold text-foreground uppercase tracking-wide">{title}</span>
      </div>
      {children}
    </div>
  );
}

// ─── BriefDetail ──────────────────────────────────────────────────────

export function BriefDetail() {
  const { briefId } = useParams<{ briefId: string }>();
  const [, navigate] = useLocation();

  const brief = BRIEFS.find(b => b.id === briefId);
  const ws = brief ? WORKSPACES.find(w => w.id === brief.workspace_id) : null;
  const owner = brief ? USERS.find(u => u.id === brief.owner) : null;
  const run = brief ? ANALYSIS_RUNS.find(r => r.id === brief.run_id) : null;

  if (!brief) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <h2 className="text-lg font-bold text-foreground">Brief not found</h2>
          <button onClick={() => navigate("/app/briefs")} className="text-xs text-primary hover:underline">
            Back to Brief Engine
          </button>
        </div>
      </div>
    );
  }

  // Local IAP library registration — concepts this brief registered, and the
  // ads deployed from them (closes the strategy → asset → analysis loop).
  const registeredConcepts = CREATIVE_CONCEPTS.filter(c => c.related_briefs.includes(brief.id));
  const deployedAds = ADS.filter(
    a => a.creative_concept_id && registeredConcepts.some(c => c.id === a.creative_concept_id)
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-5">

        {/* Header */}
        <div className="flex items-start gap-3">
          <button
            onClick={() => navigate("/app/briefs")}
            className="p-1.5 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-foreground transition-all mt-0.5 shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-xl font-bold text-foreground tracking-tight leading-snug">{brief.title}</h1>
              <span className={cn(
                "text-[10px] px-2 py-1 rounded border font-semibold leading-none shrink-0 mt-1",
                STATUS_STYLES[brief.status] ?? "bg-muted text-muted-foreground border-border/40"
              )}>
                {brief.status}
              </span>
            </div>
            <div className="flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground">
              {ws && (
                <button
                  onClick={() => navigate(`/app/workspaces/${ws.id}`)}
                  className="hover:text-foreground transition-colors"
                >
                  {ws.name}
                </button>
              )}
              {ws && <span className="text-muted-foreground/30">·</span>}
              <span>{brief.objective}</span>
              <span className="text-muted-foreground/30">·</span>
              <span className="px-1.5 py-0.5 rounded border border-border/40 font-mono text-[10px]">{brief.funnel_stage}</span>
              {run && (
                <>
                  <span className="text-muted-foreground/30">·</span>
                  <button
                    onClick={() => navigate(`/app/iap/runs/${run.id}`)}
                    className="hover:text-foreground transition-colors flex items-center gap-1"
                  >
                    <Zap className="w-3 h-3" /> {run.id}
                  </button>
                </>
              )}
              {owner && (
                <>
                  <span className="text-muted-foreground/30">·</span>
                  <span>{owner.name}</span>
                </>
              )}
              <span className="text-muted-foreground/30">·</span>
              <span>Updated {brief.updated_at}</span>
            </div>
          </div>
        </div>

        {/* 2-col layout for primary sections */}
        <div className="grid grid-cols-2 gap-4">
          <Section icon={<Target className="w-3.5 h-3.5" />} title="Diagnosis">
            <p className="text-xs text-muted-foreground leading-relaxed">{brief.diagnosis}</p>
          </Section>

          <Section icon={<Eye className="w-3.5 h-3.5" />} title="Audience Insight">
            <p className="text-xs text-muted-foreground leading-relaxed">{brief.audience_insight}</p>
          </Section>

          <Section icon={<BarChart3 className="w-3.5 h-3.5" />} title="Winning Signal" accent="border-emerald-500/20 bg-emerald-500/5">
            <p className="text-xs text-muted-foreground leading-relaxed">{brief.winning_signal}</p>
          </Section>

          <Section icon={<MessageSquare className="w-3.5 h-3.5" />} title="Messaging Direction">
            <p className="text-xs text-muted-foreground leading-relaxed">{brief.messaging_direction}</p>
          </Section>
        </div>

        {/* Creative Concepts — full width */}
        <Section icon={<Layers className="w-3.5 h-3.5" />} title="Creative Concepts">
          <div className="space-y-3">
            {brief.creative_concepts.map((concept, i) => (
              <div key={i} className="border border-border/50 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-foreground">{concept.name}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded border border-border/40 text-muted-foreground">{concept.format}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded border border-border/40 text-muted-foreground font-mono">{concept.angle}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-[11px]">
                  <div>
                    <div className="text-muted-foreground mb-1">Hook</div>
                    <div className="text-foreground font-mono">{concept.hook}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">Variable Codes</div>
                    <div className="flex flex-wrap gap-1">
                      {concept.variable_codes.map(vc => (
                        <span key={vc} className="px-1.5 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary text-[10px] font-mono">{vc}</span>
                      ))}
                    </div>
                  </div>
                </div>
                {concept.notes && (
                  <p className="text-[10px] text-muted-foreground/80 italic">{concept.notes}</p>
                )}
              </div>
            ))}
          </div>
        </Section>

        {/* 3-col grid: Hook options / Offer / Funnel + Test */}
        <div className="grid grid-cols-3 gap-4">
          <Section icon={<Lightbulb className="w-3.5 h-3.5" />} title="Hook Options">
            <div className="space-y-1.5">
              {brief.hook_options.map(h => (
                <div key={h} className="flex items-center gap-2 text-xs">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                  <span className="text-muted-foreground font-mono">{h}</span>
                </div>
              ))}
            </div>
          </Section>

          <Section icon={<Target className="w-3.5 h-3.5" />} title="Offer Framing">
            <p className="text-xs text-foreground font-medium">{brief.offer_framing}</p>
            <div className="border-t border-border/40 pt-2 mt-2">
              <div className="text-[10px] text-muted-foreground mb-1">Success Metric</div>
              <p className="text-xs text-emerald-400 font-medium">{brief.success_metric}</p>
            </div>
          </Section>

          <Section icon={<BarChart3 className="w-3.5 h-3.5" />} title="Funnel & Test">
            <div className="space-y-2 text-[11px]">
              <div>
                <div className="text-muted-foreground mb-0.5">Stage</div>
                <div className="font-semibold text-foreground font-mono">{brief.funnel_stage}</div>
              </div>
              <div>
                <div className="text-muted-foreground mb-0.5">Format Guidance</div>
                <div className="text-foreground">{brief.format_guidance}</div>
              </div>
              <div>
                <div className="text-muted-foreground mb-0.5">Test Matrix</div>
                <div className="text-foreground">{brief.test_matrix}</div>
              </div>
            </div>
          </Section>
        </div>

        {/* 2-col: Proof requirements + Visual direction */}
        <div className="grid grid-cols-2 gap-4">
          <Section icon={<CheckCircle2 className="w-3.5 h-3.5" />} title="Proof Requirements">
            <div className="space-y-1.5">
              {brief.proof_requirements.map(p => (
                <div key={p} className="flex items-start gap-2 text-[11px]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">{p}</span>
                </div>
              ))}
            </div>
          </Section>

          <Section icon={<Eye className="w-3.5 h-3.5" />} title="Visual Direction">
            <p className="text-xs text-muted-foreground leading-relaxed">{brief.visual_direction}</p>
          </Section>
        </div>

        {/* Do Not Do + Production Notes — full width */}
        <div className="grid grid-cols-2 gap-4">
          <Section icon={<XCircle className="w-3.5 h-3.5" />} title="Do Not Do" accent="border-red-500/20 bg-red-500/5">
            <div className="space-y-1.5">
              {brief.do_not_do.map(d => (
                <div key={d} className="flex items-start gap-2 text-[11px]">
                  <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">{d}</span>
                </div>
              ))}
            </div>
          </Section>

          <Section icon={<AlertCircle className="w-3.5 h-3.5" />} title="Production Notes">
            <p className="text-xs text-muted-foreground leading-relaxed">{brief.production_notes}</p>
          </Section>
        </div>

        {/* Creative Library Registration — closed-loop linkage */}
        <Section icon={<Layers className="w-3.5 h-3.5" />} title="Creative Library Registration">
          <div className="space-y-4">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Concepts from this brief are registered in the local IAP library under their
              concept/cell naming convention. Deployed ads feed performance back into the next analysis run.
            </p>

            {registeredConcepts.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/60">
                Not yet registered. Approve this brief to register its concepts in the library.
              </p>
            ) : (
              <div className="space-y-2">
                {registeredConcepts.map(c => {
                  const ads = ADS.filter(a => a.creative_concept_id === c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => navigate("/app/creative-library")}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border/50 hover:border-border hover:bg-white/[0.02] text-left transition-all"
                    >
                      <span className="text-[10px] font-mono font-bold text-primary/80 shrink-0 w-10">{c.cell_id}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-medium text-foreground truncate">{c.name}</div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                          <Activity className="w-2.5 h-2.5" /> {ads.length} deployed ad{ads.length !== 1 ? "s" : ""}
                          <span className="text-muted-foreground/30">·</span>
                          {c.recommended_action}
                        </div>
                      </div>
                      <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}

            {deployedAds.length > 0 && (
              <div className="border-t border-border/40 pt-3">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">
                  Deployed Assets ({deployedAds.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {deployedAds.slice(0, 8).map(a => (
                    <span key={a.id} className="px-1.5 py-0.5 rounded border border-border/40 bg-muted/30 text-muted-foreground text-[10px] font-mono">
                      {a.id} · P{a.tier}
                    </span>
                  ))}
                  {deployedAds.length > 8 && (
                    <span className="px-1.5 py-0.5 text-muted-foreground text-[10px]">+{deployedAds.length - 8} more</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </Section>

        {/* Footer actions */}
        <div className="flex items-center gap-3 py-4 border-t border-border/40">
          <button
            onClick={() => navigate("/app/briefs")}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border/60 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border transition-all"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            All Briefs
          </button>
          {run && (
            <button
              onClick={() => navigate(`/app/iap/runs/${run.id}`)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border/60 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border transition-all"
            >
              <Zap className="w-3.5 h-3.5" />
              View Source Run
            </button>
          )}
          <button
            disabled
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border/40 text-xs font-medium text-muted-foreground cursor-not-allowed opacity-50 ml-auto"
          >
            <FileText className="w-3.5 h-3.5" />
            Export Brief PDF
            <span className="text-[9px] border border-border/40 px-1 py-0.5 rounded font-mono">Phase 5</span>
          </button>
        </div>
      </div>
    </div>
  );
}
