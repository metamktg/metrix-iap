// ─── Strategy · Hypothesis Queue ──────────────────────────────────────
// Active hypotheses queued from analysis, plus the message pillars they
// build on. Drill-down drawer with cross-links into Analysis and Briefs.

import { useState, useEffect } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getStrategyData, getBriefBuilder } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ScopeBanner, ModuleTabs, ModuleScopeGate, PendingState,
  MetricTile, CrossLink, useFocusParam,
  RangeScopeBar, NoDataInRangeState,
} from "../shared";
import { useDateRange } from "@/contexts/DateRangeContext";
import { InfoDrawer, DrawerField } from "@/components/ui/InfoDrawer";
import { cn } from "@/lib/utils";
import { Layers, FlaskConical, AlertTriangle, ArrowRight } from "lucide-react";
import type { ActiveHypothesis } from "@/lib/data/seedTypes";

const SECTION = "Strategy · 04";

const STATUS_STYLE: Record<string, string> = {
  ready_for_brief_builder: "bg-emerald-400/10 text-emerald-400 border-emerald-400/20",
  validation_required: "bg-blue-400/10 text-blue-300 border-blue-400/20",
};

const STATUS_LABEL: Record<string, string> = {
  ready_for_brief_builder: "Ready for Brief Builder",
  validation_required: "Validation required",
};

type Tab = "queue" | "pillars";

export function HypothesisQueueView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const [tab, setTab] = useState<Tab>("queue");
  const focus = useFocusParam();
  const [detail, setDetail] = useState<ActiveHypothesis | null>(null);
  const { rangeHasData } = useDateRange();

  const s = getStrategyData(seed, adAccountId);

  // Deep-link: ?focus=<hypothesis id> opens the drawer
  useEffect(() => {
    if (focus && s) {
      const match = s.active_hypotheses.find((h) => h.id === focus);
      if (match) setDetail(match);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, adAccountId]);

  return (
    <ModuleScopeGate section={SECTION} title="Hypothesis Queue" account={account}>
      {() => {
        const acct = account!;
        if (!s) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Hypothesis Queue" />
              <ScopeBanner account={acct} />
              <PendingState title="Strategy pending" message="No strategy has been derived for this account yet." />
            </div>
          );
        }

        const hyps = s.active_hypotheses;
        const pillars = s.message_pillars;
        const ready = hyps.filter((h) => h.status === "ready_for_brief_builder");
        const validating = hyps.filter((h) => h.status === "validation_required");
        const briefs = getBriefBuilder(seed, adAccountId)?.draft_briefs ?? [];

        const TABS: { id: Tab; label: string; count: number }[] = [
          { id: "queue", label: "Hypothesis queue", count: hyps.length },
          { id: "pillars", label: "Message pillars", count: pillars.length },
        ];

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Hypothesis Queue"
              subtitle="Active hypotheses derived from this account's analysis, queued for validation or briefing."
              table="active_hypotheses, message_pillars"
            />
            <ScopeBanner account={acct} />
            <RangeScopeBar grainNote="Hypotheses derive from the account's full flight window — this import has no daily grain." />

            {!rangeHasData ? (
              <NoDataInRangeState what="hypothesis data" />
            ) : (
            <>
            <div className="px-6 pt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricTile label="In queue" value={String(hyps.length)} />
              <MetricTile label="Ready for briefs" value={String(ready.length)} />
              <MetricTile label="Validation required" value={String(validating.length)} />
              <MetricTile label="Message pillars" value={String(pillars.length)} />
            </div>

            <div className="mt-4">
              <ModuleTabs tabs={TABS} active={tab} onChange={(id) => setTab(id)} />
            </div>

            <div className="px-6 py-5 max-w-4xl">
              {tab === "queue" && (
                hyps.length === 0 ? (
                  <PendingState title="No hypotheses yet" message="Active hypotheses appear once strategy is derived." icon={FlaskConical} />
                ) : (
                  <div className="space-y-2.5">
                    {hyps.map((h) => (
                      <button
                        key={h.id}
                        onClick={() => setDetail(h)}
                        className="w-full text-left rounded-xl border border-border/40 bg-white/[0.02] p-4 hover:border-border/60 hover:bg-white/[0.03] transition-colors"
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-foreground leading-tight">{h.label}</p>
                            <div className="flex items-center gap-1.5 mt-1.5 text-[11px] text-muted-foreground/60">
                              <ArrowRight className="w-3 h-3 text-muted-foreground/60" />
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
                      </button>
                    ))}
                  </div>
                )
              )}

              {tab === "pillars" && (
                pillars.length === 0 ? (
                  <PendingState title="No pillars yet" message="Message pillars appear once analysis is ready." icon={Layers} />
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {pillars.map((p) => {
                      const linkedBriefs = briefs.filter((b) => b.source_pillar === p.id);
                      return (
                        <div key={p.id} className="rounded-xl border border-border/40 bg-white/[0.02] p-4">
                          <div className="flex items-center gap-1.5 mb-1">
                            {p.source_cells.map((c) => (
                              <CrossLink key={c} to={`/app/analysis/library?focus=${c}`} label={c} />
                            ))}
                          </div>
                          <p className="text-[13px] font-semibold text-foreground leading-tight">{p.label}</p>
                          <p className="text-[12px] text-primary/80 italic mt-1">"{p.plain_descriptor}"</p>
                          <p className="text-[11px] text-muted-foreground/65 mt-2 leading-relaxed">{p.why_it_matters}</p>
                          <div className="mt-3 pt-3 border-t border-border/20 grid grid-cols-2 gap-x-3 gap-y-1.5">
                            {Object.entries(p.variable_stack).map(([k, v]) => (
                              <div key={k} className="text-[10px]">
                                <span className="text-muted-foreground/60 uppercase tracking-wide">{k}</span>
                                <div className="text-foreground/75">{v}</div>
                              </div>
                            ))}
                          </div>
                          {linkedBriefs.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-border/20">
                              <CrossLink to={`/app/briefs/builder?focus=${linkedBriefs[0].id}`} label={`${linkedBriefs.length} draft brief${linkedBriefs.length > 1 ? "s" : ""} from this pillar`} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )
              )}
            </div>
            </>
            )}

            {detail && (
              <InfoDrawer
                kicker="Hypothesis"
                title={detail.label}
                onClose={() => setDetail(null)}
                footer={
                  <div className="flex items-center gap-4">
                    {detail.status === "ready_for_brief_builder" && <CrossLink to="/app/briefs/builder" label="Open Brief Builder" />}
                    <CrossLink to="/app/analysis/library" label="Open IAP Library" />
                  </div>
                }
              >
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={cn("text-[9px] font-semibold border px-1.5 py-0.5 rounded leading-none", STATUS_STYLE[detail.status] ?? "bg-muted text-muted-foreground/60 border-border/40")}>
                    {STATUS_LABEL[detail.status] ?? detail.status}
                  </span>
                </div>
                <DrawerField label="Source">{detail.source}</DrawerField>
                {detail.risk && <DrawerField label="Risk">{detail.risk}</DrawerField>}
              </InfoDrawer>
            )}
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
