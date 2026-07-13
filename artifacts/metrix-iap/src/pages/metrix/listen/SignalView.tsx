// ─── Listen · Signal ──────────────────────────────────────────────────
// Source-backed signal intake for the active ad account. KPI tiles up
// top, scope filter tabs, and a detail drawer with cross-links into
// Analysis and Strategy.

import { useState, useEffect } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getListenSignals } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ScopeBanner, ConfidenceBadge, ModuleTabs, ModuleScopeGate,
  PendingState, MetricTile, ImpactBadge, ScopeBadge, CrossLink, useFocusParam,
  RangeScopeBar, NoDataInRangeState, StaleFocusNotice,
} from "../shared";
import { useDateRange } from "@/contexts/DateRangeContext";
import { InfoDrawer, DrawerField } from "@/components/ui/InfoDrawer";
import { Radio, ArrowRight } from "lucide-react";
import type { SignalCard } from "@/lib/data/seedTypes";
import { TokenizedConceptText } from "@/components/concept/ConceptChip";

const SCOPE_ORDER = ["creative", "funnel", "placement", "mst"];
const SCOPE_LABEL: Record<string, string> = { creative: "Creative", funnel: "Funnel", placement: "Placement", mst: "MST" };

const SECTION = "Listen · 02";

export function SignalView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const [tab, setTab] = useState<string>("all");
  const focus = useFocusParam();
  const [detail, setDetail] = useState<SignalCard | null>(null);
  const { rangeHasData } = useDateRange();

  const signals = getListenSignals(seed, adAccountId);

  // Deep-link: ?focus=<signal id> opens the drawer
  useEffect(() => {
    if (focus) {
      const match = signals.find((s) => s.id === focus);
      if (match) setDetail(match);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, adAccountId]);

  return (
    <ModuleScopeGate section={SECTION} title="Signal" account={account}>
      {() => {
        const acct = account!;
        const present = SCOPE_ORDER.filter((s) => signals.some((x) => x.scope === s));
        const tabs = [
          { id: "all", label: "All signals", count: signals.length },
          ...present.map((s) => ({ id: s, label: SCOPE_LABEL[s] ?? s, count: signals.filter((x) => x.scope === s).length })),
        ];
        const shown = tab === "all" ? signals : signals.filter((x) => x.scope === tab);
        const highCount = signals.filter((s) => s.impact === "high").length;

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Signal"
              subtitle="Source-backed signals surfaced from this account's latest analysis."
              table="signal_cards"
            />
            <ScopeBanner account={acct} />
            {focus && !signals.some((s) => s.id === focus) && (
              <StaleFocusNotice label="signal" />
            )}
            <RangeScopeBar grainNote="Signals derive from the account's full flight window — this import has no daily grain." />

            {!rangeHasData ? (
              <NoDataInRangeState what="signals" />
            ) : (
            <>
            <div className="px-6 pt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricTile label="Active" value={String(signals.length)} sub="signals" />
              <MetricTile label="High impact" value={String(highCount)} sub={highCount > 0 ? "needs review" : "none flagged"} />
              <MetricTile label="Scopes" value={String(present.length)} sub={present.map((p) => SCOPE_LABEL[p] ?? p).join(" · ") || "—"} />
              <MetricTile label="High confidence" value={String(signals.filter((s) => s.confidence.toLowerCase().includes("high")).length)} />
            </div>

            <div className="mt-4">
              {signals.length > 0 && <ModuleTabs tabs={tabs} active={tab} onChange={setTab} />}
            </div>

            <div className="px-6 py-5 max-w-3xl">
              {signals.length === 0 ? (
                <PendingState title="No signals yet" message="Signals appear here once analysis has run for this account." icon={Radio} />
              ) : shown.length === 0 ? (
                <PendingState title="No signals in this scope" message="Switch scope to view other signals." icon={Radio} />
              ) : (
                <div className="space-y-3">
                  {shown.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setDetail(s)}
                      className="w-full text-left rounded-xl border border-border/40 bg-white/[0.02] p-4 hover:border-border/60 hover:bg-white/[0.03] transition-colors"
                    >
                      <div className="flex items-center gap-1.5 flex-wrap mb-2">
                        <ScopeBadge scope={s.scope} />
                        <ImpactBadge impact={s.impact} />
                        <ConfidenceBadge value={s.confidence} />
                      </div>
                      <p className="text-[13px] font-semibold text-foreground leading-snug"><TokenizedConceptText text={s.title} /></p>
                      <p className="text-[12px] text-muted-foreground/70 mt-1 leading-relaxed"><TokenizedConceptText text={s.rationale} /></p>
                      <div className="flex items-start gap-1.5 mt-3 pt-3 border-t border-border/20">
                        <ArrowRight className="w-3.5 h-3.5 text-primary/60 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-foreground/75 leading-relaxed"><TokenizedConceptText text={s.recommended_action} /></p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            </>
            )}

            {detail && (
              <InfoDrawer
                kicker="Signal"
                title={<TokenizedConceptText text={detail.title} />}
                onClose={() => setDetail(null)}
                footer={
                  <div className="flex items-center gap-4">
                    <CrossLink to="/app/analysis/library" label="Open IAP Library" />
                    <CrossLink to="/app/strategy/hypotheses" label="Open Hypothesis Queue" />
                  </div>
                }
              >
                <div className="flex items-center gap-1.5 flex-wrap">
                  <ScopeBadge scope={detail.scope} />
                  <ImpactBadge impact={detail.impact} />
                  <ConfidenceBadge value={detail.confidence} />
                </div>
                <DrawerField label="Rationale"><TokenizedConceptText text={detail.rationale} /></DrawerField>
                <DrawerField label="Recommended action"><TokenizedConceptText text={detail.recommended_action} /></DrawerField>
                {detail.source_path && (
                  <DrawerField label="Source">
                    <span className="font-mono text-[10px] text-muted-foreground/60">{detail.source_path}</span>
                  </DrawerField>
                )}
              </InfoDrawer>
            )}
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
