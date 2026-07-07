// ─── Strategy ─────────────────────────────────────────────────────────
// Message pillars + active hypotheses, scoped to the active ad account.
// Sub-tabs separate pillars from hypotheses (restores the layered feel).

import { useState } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { getAdAccount, getStrategyData } from "@/lib/data/metrixSeedAdapter";
import { ModuleHeader, ScopeBanner, ConfidenceBadge, ModuleTabs, UnconfiguredState, PendingState } from "./shared";
import { cn } from "@/lib/utils";
import { Layers, FlaskConical, AlertTriangle, ArrowRight } from "lucide-react";

const STATUS_STYLE: Record<string, string> = {
  ready_for_brief_builder: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  validation_required: "bg-blue-400/10 text-blue-300 border-blue-400/20",
};

const STATUS_LABEL: Record<string, string> = {
  ready_for_brief_builder: "Ready for Brief Builder",
  validation_required: "Validation required",
};

type Tab = "pillars" | "hypotheses";

export function StrategyView() {
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(adAccountId);
  const [tab, setTab] = useState<string>("pillars");

  if (!account) {
    return (
      <div className="flex-1 flex flex-col">
        <ModuleHeader section="Strategy · 03" title="Strategy" />
        <PendingState title="No ad account selected" message="Choose an ad account to view its strategy." />
      </div>
    );
  }
  if (account.status !== "configured") {
    return (
      <div className="flex-1 flex flex-col">
        <ModuleHeader section="Strategy · 03" title="Strategy" />
        <UnconfiguredState account={account} />
      </div>
    );
  }

  const s = getStrategyData(adAccountId);
  if (!s) {
    return (
      <div className="flex-1 flex flex-col">
        <ModuleHeader section="Strategy · 03" title="Strategy" />
        <ScopeBanner account={account} />
        <PendingState title="Strategy pending" message="No strategy has been derived for this account yet." />
      </div>
    );
  }

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "pillars", label: "Message pillars", count: s.message_pillars.length },
    { id: "hypotheses", label: "Hypotheses", count: s.active_hypotheses.length },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <ModuleHeader section="Strategy · 03" title="Strategy" subtitle="Message pillars and active hypotheses derived from this account's analysis." table="core_reanalysis_read, performance_by_cell" />
      <ScopeBanner account={account} />
      <ModuleTabs tabs={tabs} active={tab} onChange={setTab} />

      <div className="px-6 py-5 max-w-4xl">
        {/* Message pillars */}
        {tab === "pillars" && (
          s.message_pillars.length === 0 ? (
            <PendingState title="No pillars yet" message="Message pillars appear once analysis is ready." icon={Layers} />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {s.message_pillars.map((p) => (
                <div key={p.id} className="rounded-xl border border-border/40 bg-white/[0.02] p-4">
                  <div className="flex items-center gap-1.5 mb-1">
                    {p.source_cells.map((c) => (
                      <span key={c} className="text-[9px] font-mono text-muted-foreground/50 border border-border/40 px-1 py-0.5 rounded leading-none">{c}</span>
                    ))}
                  </div>
                  <p className="text-[13px] font-semibold text-foreground leading-tight">{p.label}</p>
                  <p className="text-[12px] text-primary/80 italic mt-1">"{p.plain_descriptor}"</p>
                  <p className="text-[11px] text-muted-foreground/65 mt-2 leading-relaxed">{p.why_it_matters}</p>
                  <div className="mt-3 pt-3 border-t border-border/20 grid grid-cols-2 gap-x-3 gap-y-1.5">
                    {Object.entries(p.variable_stack).map(([k, v]) => (
                      <div key={k} className="text-[10px]">
                        <span className="text-muted-foreground/40 uppercase tracking-wide">{k}</span>
                        <div className="text-foreground/75">{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* Active hypotheses */}
        {tab === "hypotheses" && (
          s.active_hypotheses.length === 0 ? (
            <PendingState title="No hypotheses yet" message="Active hypotheses appear once strategy is derived." icon={FlaskConical} />
          ) : (
            <div className="space-y-2.5">
              {s.active_hypotheses.map((h) => (
                <div key={h.id} className="rounded-xl border border-border/40 bg-white/[0.02] p-4">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-foreground leading-tight">{h.label}</p>
                      <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-muted-foreground/60">
                        <ArrowRight className="w-3 h-3 text-muted-foreground/40" />
                        {h.source}
                      </div>
                    </div>
                    <span className={cn("shrink-0 text-[9px] font-semibold border px-1.5 py-0.5 rounded leading-none", STATUS_STYLE[h.status] ?? "bg-muted text-muted-foreground/60 border-border/40")}>
                      {STATUS_LABEL[h.status] ?? h.status}
                    </span>
                  </div>
                  {h.risk && (
                    <div className="flex items-start gap-1.5 mt-3 pt-3 border-t border-border/20">
                      <AlertTriangle className="w-3 h-3 text-amber-400/70 shrink-0 mt-0.5" />
                      <p className="text-[10px] text-amber-400/70 leading-relaxed">{h.risk}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
