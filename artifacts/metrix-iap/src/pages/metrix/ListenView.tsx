// ─── Listen ───────────────────────────────────────────────────────────
// Signal intake for the active ad account. Read-only source-backed signals.

import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { getAdAccount, getListenSignals } from "@/lib/data/metrixSeedAdapter";
import { ModuleHeader, ScopeBanner, ConfidenceBadge, UnconfiguredState, PendingState } from "./shared";
import { cn } from "@/lib/utils";
import { Radio, ArrowRight } from "lucide-react";

const IMPACT_STYLE: Record<string, string> = {
  high: "bg-red-400/10 text-red-300 border-red-400/20",
  medium: "bg-amber-400/10 text-amber-300 border-amber-400/20",
  low: "bg-muted text-muted-foreground/60 border-border/40",
};

const SCOPE_STYLE: Record<string, string> = {
  creative: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  funnel: "bg-teal-500/10 text-teal-300 border-teal-500/20",
  placement: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  mst: "bg-purple-500/10 text-purple-300 border-purple-500/20",
};

export function ListenView() {
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(adAccountId);

  if (!account) {
    return (
      <div className="flex-1 flex flex-col">
        <ModuleHeader section="Listen · 01" title="Listen" />
        <PendingState title="No ad account selected" message="Choose an ad account to view its signals." />
      </div>
    );
  }
  if (account.status !== "configured") {
    return (
      <div className="flex-1 flex flex-col">
        <ModuleHeader section="Listen · 01" title="Listen" />
        <UnconfiguredState account={account} />
      </div>
    );
  }

  const signals = getListenSignals(adAccountId);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <ModuleHeader section="Listen · 01" title="Signals" subtitle="Source-backed signals surfaced from this account's latest analysis." table="core_reanalysis_read, v3_placement_signal" />
      <ScopeBanner account={account} />

      <div className="px-6 py-5 max-w-3xl">
        {signals.length === 0 ? (
          <PendingState title="No signals yet" message="Signals appear here once analysis has run for this account." icon={Radio} />
        ) : (
          <div className="space-y-3">
            {signals.map((s) => (
              <div key={s.id} className="rounded-xl border border-border/40 bg-white/[0.02] p-4">
                <div className="flex items-center gap-1.5 flex-wrap mb-2">
                  <span className={cn("text-[9px] font-semibold border px-1.5 py-0.5 rounded uppercase tracking-wide leading-none", SCOPE_STYLE[s.scope] ?? "bg-muted text-muted-foreground/60 border-border/40")}>{s.scope}</span>
                  <span className={cn("text-[9px] font-semibold border px-1.5 py-0.5 rounded uppercase tracking-wide leading-none", IMPACT_STYLE[s.impact] ?? IMPACT_STYLE.low)}>{s.impact} impact</span>
                  <ConfidenceBadge value={s.confidence} />
                </div>
                <p className="text-[13px] font-semibold text-foreground leading-snug">{s.title}</p>
                <p className="text-[12px] text-muted-foreground/70 mt-1 leading-relaxed">{s.rationale}</p>
                <div className="flex items-start gap-1.5 mt-3 pt-3 border-t border-border/20">
                  <ArrowRight className="w-3.5 h-3.5 text-primary/60 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-foreground/75 leading-relaxed">{s.recommended_action}</p>
                </div>
                {s.source_path && (
                  <p className="text-[9px] font-mono text-muted-foreground/35 mt-2">source · {s.source_path}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
