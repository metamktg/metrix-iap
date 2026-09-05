// ─── Listen · Command Center (TL;DR) ────────────────────────────────────
// The parent /app/listen route.
// - With an ad account selected, this is that account's TL;DR only: its own
//   signal counts, no cross-account roster or other accounts' connection
//   statuses. Account-scoped modules must never leak other accounts' data.
// - With the Manager/Agency overview selected (no ad account active), this
//   falls back to the agency-wide TL;DR across every account, so a user can
//   still get the gist without opening a single account. Absorbs the
//   separate "TL;DR" concept from the original design — no distinct child
//   page for it (Q2).

import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { useAccount, useScopedAdAccountId } from "@/contexts/AccountContext";
import { getAdAccounts, getAdAccount, getListenSignals } from "@/lib/data/metrixSeedAdapter";
import { useStageStatus } from "@/hooks/useStageStatus";
import { ModuleHeader, MetricTile, PendingState, HubNavStrip, SectionCard, StageLoopHub, buildLoopStages } from "../shared";
import { SignalDeck } from "@/components/signals/SignalDeck";
import { useLocation } from "wouter";
import { Radio, CheckCircle2, Circle, AlertTriangle, Bell, Activity, Lightbulb } from "lucide-react";

const SECTION = "Listen · 02";

const LISTEN_CHILDREN = [
  { to: "/app/listen/alerts", label: "Alerts", desc: "High-impact signals worth acting on now.", Icon: Bell, lineage: "signal_cards[] · data_caveat · iap.data_quality[]" },
  { to: "/app/listen/signal", label: "Signal", desc: "The full signal feed for this scope.", Icon: Activity, lineage: "campaign_summary · ad_performance[]" },
  { to: "/app/listen/recommendations", label: "Recommendations", desc: "Suggested next actions from what's been heard.", Icon: Lightbulb, lineage: "optimization_loop · pending until run" },
];

export function ListenCommandCenter() {
  const seed = useMetrixSeed();
  const { selectAdAccount } = useAccount();
  const scopedAdAccountId = useScopedAdAccountId();

  if (scopedAdAccountId) {
    return <ScopedListenSummary adAccountId={scopedAdAccountId} />;
  }

  const accounts = getAdAccounts(seed);

  const rows = accounts.map((a) => {
    const signals = a.status === "configured" ? getListenSignals(seed, a.id) : [];
    const highImpact = signals.filter((s) => s.impact === "high").length;
    return { account: a, highImpact, totalSignals: signals.length };
  });

  const totalHigh = rows.reduce((n, r) => n + r.highImpact, 0);
  const totalSignals = rows.reduce((n, r) => n + r.totalSignals, 0);
  const configuredCount = accounts.filter((a) => a.status === "configured").length;
  const needsAttention = rows.filter((r) => r.highImpact > 0).sort((a, b) => b.highImpact - a.highImpact);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <ModuleHeader
        section={SECTION}
        title="Listen"
        subtitle="What's going on across every account. Alerts, signal, and what to do next."
      />
      {/* The stage's pages first (owner, 2026-09-05): a reader landing here
          reaches the page they came for before the summaries. */}
      <div className="px-6 pt-5">
        <HubNavStrip items={LISTEN_CHILDREN} label="Listen pages" />
      </div>
      <div className="px-6 pt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricTile label="Accounts connected" value={`${configuredCount} / ${accounts.length}`} />
        <MetricTile label="High-impact signals" value={String(totalHigh)} />
        <MetricTile label="Total signals" value={String(totalSignals)} />
        <MetricTile label="Accounts needing attention" value={String(needsAttention.length)} />
      </div>

      <div className="px-6 py-5 space-y-4 max-w-3xl">
        <SectionCard
          title="Needs attention"
          desc="Accounts with high-impact signals right now, ranked by count."
        >
          {needsAttention.length === 0 ? (
            <PendingState title="Nothing needs attention" message="No account has high-impact signals right now." icon={Radio} />
          ) : (
            <div className="flex flex-col">
              {needsAttention.map((r) => (
                <button
                  key={r.account.id}
                  onClick={() => selectAdAccount(r.account.id)}
                  className="pressable-lg w-full flex items-center gap-3 py-2.5 border-t border-border/25 first:border-0 text-left hover:bg-status-danger/[0.04] transition-colors"
                >
                  <AlertTriangle className="w-4 h-4 text-status-danger shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-body font-medium text-foreground/90 truncate">{r.account.name}</div>
                    <div className="text-label text-muted-foreground/75">{r.highImpact} high-impact signal{r.highImpact === 1 ? "" : "s"}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Connection status" desc="Which accounts are currently connected.">
          <div className="flex flex-col">
            {accounts.map((a) => (
              <div key={a.id} className="flex items-center gap-2.5 py-2 border-t border-border/25 first:border-0">
                {a.status === "configured" ? <CheckCircle2 className="w-3.5 h-3.5 text-status-success shrink-0" /> : <Circle className="w-3.5 h-3.5 text-muted-foreground/75 shrink-0" />}
                <span className="text-body text-foreground/85 flex-1">{a.name}</span>
                <span className="text-label text-muted-foreground/75">{a.status === "configured" ? "Connected" : "Not connected"}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

/**
 * Account-scoped Listen TL;DR. Renders only the active account's own
 * signals — no roster of other accounts, no cross-account connection list.
 */
function ScopedListenSummary({ adAccountId }: { adAccountId: string }) {
  const [, navigate] = useLocation();
  const seed = useMetrixSeed();
  const account = getAdAccount(seed, adAccountId);
  const status = useStageStatus(adAccountId);
  const signals = account?.status === "configured" ? getListenSignals(seed, adAccountId) : [];
  const highImpact = signals.filter((s) => s.impact === "high").length;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <ModuleHeader
        section={SECTION}
        title="Listen"
        accountName={account?.name}
        subtitle="What's going on in this account. Alerts, signal, and what to do next."
      />
      <StageLoopHub stages={buildLoopStages(status)} current="listen" />
      <div className="px-6 pt-5">
        <HubNavStrip items={LISTEN_CHILDREN} label="Listen pages" />
      </div>
      <div className="px-6 pt-5 grid grid-cols-2 gap-3">
        <MetricTile label="High-impact signals" value={String(highImpact)} />
        <MetricTile label="Total signals" value={String(signals.length)} />
      </div>

      <div className="px-6 py-5 space-y-4 max-w-3xl">
        {highImpact === 0 ? (
          <PendingState title="Nothing needs attention" message="No high-impact signals right now for this account." icon={Radio} />
        ) : (
          // The signals themselves, not a box counting them: the reader came
          // to hear what the account is saying, and a count behind a link
          // was one more click between them and it.
          <div data-testid="listen-high-impact-signals">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-3.5 h-3.5 text-status-danger shrink-0" aria-hidden="true" />
              <span className="text-label uppercase tracking-widest text-muted-foreground/75">
                {highImpact} high-impact signal{highImpact === 1 ? "" : "s"}
              </span>
            </div>
            <SignalDeck
              cards={signals.filter((s) => s.impact === "high")}
              actionLabel="Open in Alerts"
              onOpen={() => navigate("/app/listen/alerts")}
              initialVisible={3}
            />
          </div>
        )}
      </div>
    </div>
  );
}
