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
  ModuleHeader, ConfidenceBadge, ModuleScopeGate,
  PendingState, MetricTile, ImpactBadge, ScopeBadge, CrossLink,
  CaveatNote, deriveLabel, InfoTooltip, ConnectionNudgeBanner,
} from "../shared";
import { useGetMetaConnection } from "@workspace/api-client-react";
import { InfoDrawer, DrawerField } from "@/components/ui/InfoDrawer";
import { AlertTriangle, BellOff } from "lucide-react";
import { cn } from "@workspace/command-deck/lib/utils";
import { TYPE } from "../typography";
import type { SignalCard, DataQualityFlag } from "@/lib/data/seedTypes";
import { flagHeadline, flagBody } from "@/lib/dataQualityFlags";
import { TokenizedConceptText } from "@/components/concept/ConceptChip";

const SECTION = "Listen · 02";

export function AlertsView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const [detail, setDetail] = useState<SignalCard | null>(null);
  const metaConnection = useGetMetaConnection();
  const hasMetaConnection = metaConnection.data?.connected === true;

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
        // Data-quality findings raised by the last analysis run (importer
        // quality flags, cross_export_mismatch, zero-conversion anomalies).
        // This page documents its lineage as iap.data_quality[] but used to
        // render only data_caveat, so these reached the Ad Performance signal
        // tiers and nowhere else — invisible on the page users open to see
        // what needs attention.
        const qualityFlags: DataQualityFlag[] = acct.iap?.data_quality ?? [];
        const total = highSignals.length + caveats.length + qualityFlags.length;

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Alerts"
              accountName={acct.name}
              subtitle="High-impact signals · data caveats · data-quality findings"
            />
            <ConnectionNudgeBanner hasMetaConnection={hasMetaConnection} />
            <>
            <div className="px-6 pt-5 grid grid-cols-dashboard-3 gap-3">
              <MetricTile
                label={
                  <span className="inline-flex items-center gap-1">
                    Active alerts
                    <InfoTooltip content="Alerts never auto-apply changes — all suggestions require a manual action to implement." />
                  </span>
                }
                value={String(total)}
              />
              <MetricTile label="High-impact signals" value={String(highSignals.length)} />
              <MetricTile label="Data caveats" value={String(caveats.length + qualityFlags.length)} />
            </div>

            <div className="px-6 py-5 max-w-3xl space-y-6">
              {total === 0 ? (
                <PendingState title="No active alerts" message="High-impact signals and data caveats appear here when detected." icon={BellOff}
                  action={<CrossLink to="/app/analysis/overview" label="Review Analysis" />}
                />
              ) : (
                <>
                  {highSignals.length > 0 && (
                    <div>
                      <h3 className="text-caption font-mono uppercase tracking-widest text-muted-foreground/75 mb-2">High-impact signals</h3>
                      <div className="space-y-3">
                        {highSignals.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => setDetail(s)}
                            className="pressable-lg w-full text-left rounded-xl border border-status-danger/20 bg-status-danger/[0.03] p-4 hover:border-status-danger/35 transition-colors"
                          >
                            <div className="flex items-center gap-1.5 flex-wrap mb-2">
                              <AlertTriangle className="w-3.5 h-3.5 text-status-danger/80" />
                              <ScopeBadge scope={s.scope} />
                              <ImpactBadge impact={s.impact} />
                              <ConfidenceBadge value={s.confidence} />
                            </div>
                            <p className="text-title font-semibold text-foreground leading-snug"><TokenizedConceptText text={s.title} /></p>
                            <p className="text-body text-muted-foreground/75 mt-1 leading-snug line-clamp-1"><span>{deriveLabel(s.rationale, 90)}</span></p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {caveats.length > 0 && (
                    <div>
                      <h3 className="text-caption font-mono uppercase tracking-widest text-muted-foreground/75 mb-2">Data caveats</h3>
                      <div className="space-y-2">
                        {caveats.map((c) => (
                          <CaveatNote key={c.id} text={c.text} source={c.source} />
                        ))}
                      </div>
                    </div>
                  )}

                  {qualityFlags.length > 0 && (
                    <div>
                      <h3 className="text-caption font-mono uppercase tracking-widest text-muted-foreground/75 mb-2">Data-quality findings</h3>
                      <div className="space-y-2">
                        {qualityFlags.map((f, i) => (
                          <CaveatNote
                            key={`${f.kind}-${i}`}
                            text={`${flagHeadline(f)} — ${flagBody(f)}`}
                            source="iap.data_quality"
                          />
                        ))}
                      </div>
                      <p className={cn(TYPE.caption, "text-muted-foreground/75 mt-2 leading-snug")}>
                        Raised by the last analysis run. Full evidence per finding is on{" "}
                        <CrossLink to="/app/analysis/performance" label="Ad Performance" />.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
            </>

            {detail && (
              <InfoDrawer
                kicker="Alert · signal"
                title={<TokenizedConceptText text={detail.title} />}
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
