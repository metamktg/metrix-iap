// ─── Listen · Alerts ──────────────────────────────────────────────────
// High-impact signals + data caveats surfaced as alerts for the active
// ad account. Read-only, source-backed — no fabricated alerting.

import { useState } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import {
  getAdAccount, getListenSignals, getCoreControls, getCampaignSummary,
} from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ScopeBanner, ConfidenceBadge, ModuleScopeGate,
  PendingState, MetricTile, TileItem, ImpactBadge, ScopeBadge, CrossLink,
  RangeScopeBar, NoDataInRangeState,
} from "../shared";
import { useDateRange } from "@/contexts/DateRangeContext";
import { InfoDrawer, DrawerField } from "@/components/ui/InfoDrawer";
import { AlertTriangle, BellOff, Database } from "lucide-react";
import type { SignalCard } from "@/lib/data/seedTypes";

const SECTION = "Listen · 02";

export function AlertsView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const [detail, setDetail] = useState<SignalCard | null>(null);
  const { rangeHasData } = useDateRange();

  return (
    <ModuleScopeGate section={SECTION} title="Alerts" account={account}>
      {() => {
        const acct = account!;
        const signals = getListenSignals(seed, adAccountId);
        const core = getCoreControls(seed, adAccountId);
        const summary = getCampaignSummary(seed, adAccountId);

        const highSignals = signals.filter((s) => s.impact === "high");
        const caveats = [
          ...(core?.data_caveat ? [{ id: "caveat_core", source: "core_reanalysis_read", text: core.data_caveat }] : []),
          ...(summary?.data_caveat ? [{ id: "caveat_summary", source: "campaign_summary", text: summary.data_caveat }] : []),
        ];
        const total = highSignals.length + caveats.length;

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Alerts"
              subtitle="High-impact signals and data caveats that need attention."
              table="signal_cards, data_caveats"
            />
            <ScopeBanner account={acct} />
            <RangeScopeBar grainNote="Alerts derive from the account's full flight window — this import has no daily grain." />

            {!rangeHasData ? (
              <NoDataInRangeState what="alerts" />
            ) : (
            <>
            <div className="px-6 pt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricTile
                label="Active alerts"
                value={String(total)}
                popover={total > 0 ? {
                  content: (
                    <>
                      {highSignals.map((s) => (
                        <TileItem key={s.id} title={s.title}
                          badges={<><ScopeBadge scope={s.scope} /><ImpactBadge impact={s.impact} /></>}
                          onClick={() => setDetail(s)}
                        />
                      ))}
                      {caveats.map((c) => (
                        <TileItem key={c.id} title={c.text} sub="Data caveat" />
                      ))}
                    </>
                  ),
                } : undefined}
              />
              <MetricTile
                label="High-impact signals"
                value={String(highSignals.length)}
                popover={highSignals.length > 0 ? {
                  content: highSignals.map((s) => (
                    <TileItem key={s.id} title={s.title}
                      badges={<><ScopeBadge scope={s.scope} /><ConfidenceBadge value={s.confidence} /></>}
                      onClick={() => setDetail(s)}
                    />
                  )),
                } : undefined}
              />
              <MetricTile
                label="Data caveats"
                value={String(caveats.length)}
                popover={caveats.length > 0 ? {
                  content: caveats.map((c) => (
                    <TileItem key={c.id} title={c.text} sub={`Source: ${c.source}`} />
                  )),
                } : undefined}
              />
              <MetricTile label="Auto-actions" value="0" sub="alerts never auto-apply changes" />
            </div>

            <div className="px-6 py-5 max-w-3xl space-y-6">
              {total === 0 ? (
                <PendingState title="No active alerts" message="High-impact signals and data caveats appear here when detected." icon={BellOff} />
              ) : (
                <>
                  {highSignals.length > 0 && (
                    <div>
                      <h3 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/60 mb-2">High-impact signals</h3>
                      <div className="space-y-3">
                        {highSignals.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => setDetail(s)}
                            className="w-full text-left rounded-xl border border-red-400/20 bg-red-400/[0.03] p-4 hover:border-red-400/35 transition-colors"
                          >
                            <div className="flex items-center gap-1.5 flex-wrap mb-2">
                              <AlertTriangle className="w-3.5 h-3.5 text-red-300/80" />
                              <ScopeBadge scope={s.scope} />
                              <ImpactBadge impact={s.impact} />
                              <ConfidenceBadge value={s.confidence} />
                            </div>
                            <p className="text-[13px] font-semibold text-foreground leading-snug">{s.title}</p>
                            <p className="text-[12px] text-muted-foreground/70 mt-1 leading-relaxed">{s.rationale}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {caveats.length > 0 && (
                    <div>
                      <h3 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/60 mb-2">Data caveats</h3>
                      <div className="space-y-3">
                        {caveats.map((c) => (
                          <div key={c.id} className="rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-4">
                            <div className="flex items-center gap-1.5 mb-2">
                              <Database className="w-3.5 h-3.5 text-amber-400/80" />
                              <span className="text-[9px] font-mono uppercase tracking-widest text-amber-400/60">{c.source}</span>
                            </div>
                            <p className="text-[12px] text-amber-400/85 leading-relaxed">{c.text}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            </>
            )}

            {detail && (
              <InfoDrawer
                kicker="Alert · signal"
                title={detail.title}
                onClose={() => setDetail(null)}
                footer={
                  <div className="flex items-center gap-4">
                    <CrossLink to="/app/listen/recommendations" label="View recommendations" />
                    <CrossLink to="/app/analysis/library" label="Open IAP Library" />
                  </div>
                }
              >
                <div className="flex items-center gap-1.5 flex-wrap">
                  <ScopeBadge scope={detail.scope} />
                  <ImpactBadge impact={detail.impact} />
                  <ConfidenceBadge value={detail.confidence} />
                </div>
                <DrawerField label="Rationale">{detail.rationale}</DrawerField>
                <DrawerField label="Recommended action">{detail.recommended_action}</DrawerField>
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
