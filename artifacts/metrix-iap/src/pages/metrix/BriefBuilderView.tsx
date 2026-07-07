// ─── Brief Builder ────────────────────────────────────────────────────
// Draft briefs derived from strategy pillars. Scoped to the active account.

import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { getAdAccount, getBriefBuilder, getStrategyData } from "@/lib/data/metrixSeedAdapter";
import { ModuleHeader, ScopeBanner, UnconfiguredState, PendingState, CaveatNote } from "./shared";
import { FileText, Sparkles } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  draft_from_seed: "Draft",
};

export function BriefBuilderView() {
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(adAccountId);

  if (!account) {
    return (
      <div className="flex-1 flex flex-col">
        <ModuleHeader section="Strategy · 03" title="Brief Builder" />
        <PendingState title="No ad account selected" message="Choose an ad account to view its briefs." />
      </div>
    );
  }
  if (account.status !== "configured") {
    return (
      <div className="flex-1 flex flex-col">
        <ModuleHeader section="Strategy · 03" title="Brief Builder" />
        <UnconfiguredState account={account} />
      </div>
    );
  }

  const bb = getBriefBuilder(adAccountId);
  const strategy = getStrategyData(adAccountId);
  const pillarLabel = (id: string) => strategy?.message_pillars.find((p) => p.id === id)?.label ?? id;

  if (!bb || bb.draft_briefs.length === 0) {
    return (
      <div className="flex-1 flex flex-col">
        <ModuleHeader section="Strategy · 03" title="Brief Builder" />
        <ScopeBanner account={account} />
        <PendingState title="No briefs yet" message="Draft briefs appear here once strategy pillars are ready." icon={FileText} />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <ModuleHeader section="Strategy · 03" title="Brief Builder" subtitle="Creative briefs generated from strategy message pillars." table="creative_briefs" />
      <ScopeBanner account={account} />

      <div className="px-6 py-5 space-y-4 max-w-4xl">
        <CaveatNote text={bb.source_policy} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {bb.draft_briefs.map((b) => (
            <div key={b.id} className="rounded-xl border border-border/40 bg-white/[0.02] p-4 flex flex-col">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/60 border border-border/40 px-1.5 py-0.5 rounded leading-none">
                  <FileText className="w-2.5 h-2.5" /> {b.asset_type}
                </span>
                <span className="text-[9px] font-semibold uppercase tracking-wide text-amber-300 border border-amber-400/20 bg-amber-400/10 px-1.5 py-0.5 rounded leading-none">
                  {STATUS_LABEL[b.status] ?? b.status}
                </span>
              </div>

              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles className="w-3 h-3 text-primary/60" />
                <span className="text-[11px] text-muted-foreground/60">From pillar</span>
                <span className="text-[11px] font-medium text-foreground">{pillarLabel(b.source_pillar)}</span>
              </div>

              <p className="text-[12px] text-foreground/80 leading-relaxed flex-1">{b.human_direction}</p>

              <div className="mt-3 pt-3 border-t border-border/20">
                <div className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/40 mb-1.5">Creative direction</div>
                <div className="flex flex-wrap gap-1.5">
                  {b.plain_variable_descriptors.map((d) => (
                    <span key={d} className="text-[10px] text-foreground/75 border border-border/40 bg-white/[0.03] px-1.5 py-0.5 rounded leading-none">{d}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
