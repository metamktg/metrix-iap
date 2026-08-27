// ─── Listen · Signal ──────────────────────────────────────────────────
// Source-backed signal intake for the active ad account. KPI tiles up
// top, scope filter tabs, and a detail drawer with cross-links into
// Analysis and Strategy.

import { useState, useEffect } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getListenSignals } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ConfidenceBadge, ModuleTabs, ModuleScopeGate,
  PendingState, MetricTile, ImpactBadge, ScopeBadge, CrossLink, useFocusParam,
  StaleFocusNotice, LoopAction, ConnectionNudgeBanner,
} from "../shared";
import { useGetMetaConnection } from "@workspace/api-client-react";
import { InfoDrawer, DrawerField } from "@/components/ui/InfoDrawer";
import { Radio } from "lucide-react";
import type { SignalCard } from "@/lib/data/seedTypes";
import { TokenizedConceptText } from "@/components/concept/ConceptChip";
import { SignalDeck } from "@/components/signals/SignalDeck";

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
  const metaConnection = useGetMetaConnection();
  const hasMetaConnection = metaConnection.data?.connected === true;

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
              accountName={acct.name}
              subtitle="Source-backed signals · latest analysis"
            />
            {focus && !signals.some((s) => s.id === focus) && (
              <StaleFocusNotice label="signal" />
            )}
            <ConnectionNudgeBanner hasMetaConnection={hasMetaConnection} />
            <>
            <div className="px-6 pt-5 grid grid-cols-dashboard-4 gap-3">
              <MetricTile label="Active" value={String(signals.length)} sub="signals" />
              <MetricTile label="High impact" value={String(highCount)} sub={highCount > 0 ? "needs review" : "none flagged"} />
              <MetricTile label="Scopes" value={String(present.length)} sub={present.map((p) => SCOPE_LABEL[p] ?? p).join(" · ") || "—"} />
              <MetricTile label="High confidence" value={String(signals.filter((s) => s.confidence.toLowerCase().includes("high")).length)} />
            </div>

            <div className="mt-4">
              {signals.length > 0 && <ModuleTabs tabs={tabs} active={tab} onChange={setTab} />}
            </div>

            <div className="px-6 py-5 max-w-[1600px]">
              {signals.length === 0 ? (
                <PendingState
                  title="No signals yet"
                  message="Signals appear here once analysis has run for this account."
                  icon={Radio}
                  action={<LoopAction to="/app/analysis/overview" label="Review Analysis" icon="analysis" variant="secondary" />}
                />
              ) : shown.length === 0 ? (
                <PendingState title="No signals in this scope" message="Switch scope to view other signals." icon={Radio}
                  action={<CrossLink to="/app/listen/alerts" label="View Alerts" />}
                />
              ) : (
                // The deck surfaces the structured contract this list used to
                // drop on the floor: metric_value, delta_pct, priority,
                // confidence_level, evidence_ref and needs_validation were all
                // being carried by the seed and rendered by nothing. It also
                // stops clamping the finding to one line — a signal's rationale
                // is the output the reader came for, not chrome around it.
                <SignalDeck
                  cards={shown}
                  onOpen={setDetail}
                  actionLabel="Detail"
                  emptyLabel="No signals in this scope"
                />
              )}

              {signals.length > 0 && (
                <div className="flex items-center gap-3 mt-5">
                  <LoopAction to="/app/analysis/overview" label="Continue to Analysis" icon="analysis" />
                </div>
              )}
            </div>
            </>

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
                    <span className="font-mono text-label text-muted-foreground/75">{detail.source_path}</span>
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
