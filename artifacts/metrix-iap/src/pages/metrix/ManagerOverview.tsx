// ─── Manager / Agency Overview (default view) ─────────────────────────
// Only bottom-line performance totals may aggregate at manager level.
// No account-specific analysis, strategy, or reports here.
// No Optimization Loop at manager level — recommendations are READ-ONLY,
// labeled with their source account. Deeper action lives inside each account.

import { useMemo, useState } from "react";
import { CheckCircle2, Plug, TrendingUp, Plus, ArrowRight } from "lucide-react";
import { useAccount } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import { eventTotalsInRange } from "@/lib/date-scope";
import { getManagerOverview } from "@/lib/data/metrixSeedAdapter";
import type { ManagerBottomLineTotals } from "@/lib/data/seedTypes";
import { ModuleHeader, MetricTile, SectionCard, ConfidenceBadge, fmtUSD, fmtNum, eventLabel } from "./shared";
import { AddAccountDialog } from "./AddAccountDialog";
import { cn } from "@/lib/utils";
import { buildMetricCatalog, metricSourceFromManagerTotals, metricById } from "@/lib/data/metricsCatalog";
import { useMetricSelection } from "@/hooks/useMetricSelection";
import { MetricPickerButton } from "@/components/creative/MetricPicker";
import { MetricDiagnosticModal } from "@/components/creative/MetricDiagnosticModal";
import { TokenizedConceptText } from "@/components/concept/ConceptChip";

const IMPACT_STYLE: Record<string, string> = {
  high: "bg-red-400/10 text-red-300 border-red-400/20",
  medium: "bg-amber-400/10 text-amber-300 border-amber-400/20",
  low: "bg-muted text-muted-foreground/60 border-border/40",
  setup: "bg-primary/10 text-primary border-primary/20",
};

const SCOPE_STYLE: Record<string, string> = {
  creative: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  funnel: "bg-teal-500/10 text-teal-300 border-teal-500/20",
  placement: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  mst: "bg-purple-500/10 text-purple-300 border-purple-500/20",
};

function Badge({ text, cls }: { text: string; cls: string }) {
  return (
    <span className={cn("text-[10px] font-semibold border px-1.5 py-0.5 rounded uppercase tracking-wide leading-none", cls)}>
      {text}
    </span>
  );
}

export function ManagerOverview() {
  const { manager, adAccounts, selectAdAccount } = useAccount();
  const seed = useMetrixSeed();
  const [addOpen, setAddOpen] = useState(false);
  const data = getManagerOverview(seed);
  const { range, preset } = useDateRange();
  const narrowed = preset !== "all";
  const totals: ManagerBottomLineTotals = useMemo(() => {
    const base = data.bottom_line_totals;
    if (!narrowed) return base;
    const allDaily = adAccounts.flatMap((a) => a.iap?.campaign_summary?.daily_totals ?? []);
    // No account has per-day data yet (seed predates daily_totals) — fall
    // back to the whole-window totals rather than showing a false zero.
    if (allDaily.length === 0) return base;
    const result_totals_by_event = eventTotalsInRange(allDaily, range);
    let spend_usd = 0;
    let impressions = 0;
    let link_clicks = 0;
    for (const t of Object.values(result_totals_by_event)) {
      spend_usd += t.spend;
      impressions += t.impressions;
      link_clicks += t.link_clicks;
    }
    return {
      ...base,
      result_totals_by_event,
      spend_usd,
      impressions,
      link_clicks,
      link_ctr_pct: impressions > 0 ? (link_clicks / impressions) * 100 : 0,
    };
  }, [data.bottom_line_totals, adAccounts, narrowed, range]);
  const events = Object.entries(totals.result_totals_by_event);

  // Map account_id → display name so each rec shows its source account.
  const accountName = (id: string) =>
    adAccounts.find((a) => a.id === id)?.name ?? id;

  const metricCatalog = useMemo(() => buildMetricCatalog(metricSourceFromManagerTotals(totals)), [totals]);
  const availableMetricIds = useMemo(() => metricCatalog.map((m) => m.id), [metricCatalog]);
  const { selected: selectedMetricIds, toggle, move, reset } = useMetricSelection(availableMetricIds);
  const [openMetricId, setOpenMetricId] = useState<string | null>(null);
  const openMetric = openMetricId ? metricById(metricCatalog, openMetricId) : null;

  // Onboarding: no ad accounts granted/connected yet — show a focused
  // first-run state instead of an empty dashboard.
  if (adAccounts.length === 0) {
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
        <ModuleHeader
          section="Metrix Manager · Agency Overview"
          title={manager.name}
          subtitle="No ad accounts yet. Add your first account to unlock the intelligence platform."
        />
        <div className="flex-1 flex items-center justify-center px-6 py-12">
          <div className="max-w-md w-full text-center space-y-5">
            <div className="w-12 h-12 rounded-xl border border-primary/25 bg-primary/10 flex items-center justify-center mx-auto">
              <Plug className="w-5 h-5 text-primary" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-[16px] font-semibold text-foreground">Add your first ad account</h2>
              <p className="text-[12px] text-muted-foreground/70 leading-relaxed">
                Connect a live Meta ad account, or create a manual account and upload exported
                reports. Every Metrix module scopes to a single ad account — analysis surfaces
                stay honestly pending until real data is processed.
              </p>
            </div>
            <button
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary/15 border border-primary/30 text-primary text-[12px] font-medium hover:bg-primary/25 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Ad Account
            </button>
          </div>
        </div>
        <AddAccountDialog open={addOpen} onOpenChange={setAddOpen} />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <ModuleHeader
        section="Metrix Manager · Agency Overview"
        title={manager.name}
        subtitle="Blended bottom-line performance across all connected ad accounts. Deeper analysis lives inside each ad account."
        right={
          <span className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-widest">
            {data.configured_ad_accounts} configured · {data.unconfigured_ad_accounts} to set up
          </span>
        }
      />

      <div className="px-6 py-5 space-y-6 max-w-6xl">
        {/* Bottom-line totals */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/60">Bottom-line totals</h2>
            <MetricPickerButton catalog={metricCatalog} selected={selectedMetricIds} onToggle={toggle} onMove={move} onReset={reset} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {selectedMetricIds.map((id) => {
              const m = metricById(metricCatalog, id);
              if (!m) return null;
              return (
                <button key={id} onClick={() => setOpenMetricId(id)} className="text-left">
                  <MetricTile label={m.label} value={m.formatted} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Results by event */}
        <SectionCard title="Results by event" desc="Aggregated result volume across connected accounts, by conversion event.">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {events.map(([key, e]) => (
              <div key={key} className="rounded-lg border border-border/40 bg-white/[0.02] p-3.5">
                <div className="flex items-center gap-1.5 mb-2">
                  <TrendingUp className="w-3 h-3 text-primary/60" />
                  <span className="text-[11px] font-medium text-foreground leading-tight">{eventLabel(key)}</span>
                </div>
                <div className="text-[22px] font-semibold text-foreground tabular-nums leading-none">{fmtNum(e.results)}</div>
                <div className="text-[10px] text-muted-foreground/70 mt-2 space-y-0.5">
                  <div>Spend {fmtUSD(e.spend)}</div>
                  <div>Link clicks {fmtNum(e.link_clicks)}</div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Accounts */}
        <SectionCard title="Ad accounts" desc="Select an account to open its scoped intelligence platform.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {adAccounts.map((a) => {
              const configured = a.status === "configured";
              return (
                <button
                  key={a.id}
                  onClick={() => selectAdAccount(a.id)}
                  className="flex items-center gap-3 p-3.5 rounded-lg border border-border/40 bg-white/[0.02] hover:border-border/60 hover:bg-white/[0.04] transition-colors text-left"
                >
                  <div className={cn("w-9 h-9 rounded-lg border flex items-center justify-center shrink-0", configured ? "border-emerald-400/25 bg-emerald-400/10" : "border-border/40 bg-white/[0.03]")}>
                    {configured ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Plug className="w-4 h-4 text-muted-foreground/70" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-foreground leading-tight">{a.name}</div>
                    <div className="text-[10px] text-muted-foreground/70 mt-0.5 capitalize">{configured ? `${a.platform} · connected` : "Setup required"}</div>
                  </div>
                </button>
              );
            })}

            {/* Add / Connect Ad Account entry point */}
            <button
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-3 p-3.5 rounded-lg border border-dashed border-border/50 bg-transparent hover:border-primary/40 hover:bg-primary/[0.03] transition-colors text-left"
            >
              <div className="w-9 h-9 rounded-lg border border-dashed border-border/50 flex items-center justify-center shrink-0">
                <Plus className="w-4 h-4 text-muted-foreground/60" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-foreground/80 leading-tight">Add or connect an ad account</div>
                <div className="text-[10px] text-muted-foreground/70 mt-0.5">Connect Meta or add a manual import</div>
              </div>
            </button>
          </div>
        </SectionCard>

        {/* Manager recommendations — READ-ONLY, account-labeled. No swipe / no optimization loop here. */}
        <SectionCard
          title="Account recommendations"
          desc="Cross-account signals surfaced at the agency level. Read-only — open the source account to act on them. No campaign is auto-edited."
        >
          {data.recommendation_cards.length === 0 ? (
            <p className="text-[12px] text-muted-foreground/70 py-4 text-center">No account recommendations at the moment.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {data.recommendation_cards.map((c) => (
                <div key={c.id} className="rounded-xl border border-border/40 bg-white/[0.02] p-4 flex flex-col">
                  <div className="flex items-center gap-1.5 flex-wrap mb-2">
                    <Badge text={c.manager_card_descriptor ?? accountName(c.account_id)} cls="bg-primary/10 text-primary border-primary/20" />
                    <Badge text={c.scope} cls={SCOPE_STYLE[c.scope] ?? "bg-muted text-muted-foreground/60 border-border/40"} />
                    <Badge text={`${c.impact} impact`} cls={IMPACT_STYLE[c.impact] ?? IMPACT_STYLE.low} />
                    <ConfidenceBadge value={c.confidence} />
                  </div>
                  <p className="text-[13px] font-semibold text-foreground leading-snug"><TokenizedConceptText text={c.title} /></p>
                  <p className="text-[12px] text-muted-foreground/70 mt-1 leading-relaxed"><TokenizedConceptText text={c.rationale} /></p>
                  <div className="flex items-start gap-1.5 mt-3 pt-3 border-t border-border/20">
                    <ArrowRight className="w-3.5 h-3.5 text-primary/60 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-foreground/75 leading-relaxed"><TokenizedConceptText text={c.recommended_action} /></p>
                  </div>
                  <button
                    onClick={() => selectAdAccount(c.account_id)}
                    className="mt-3 self-start inline-flex items-center gap-1 text-[11px] font-medium text-primary/80 hover:text-primary transition-colors"
                  >
                    Open {accountName(c.account_id)} <ArrowRight className="w-3 h-3" />
                  </button>
                  {c.source_path && (
                    <p className="text-[10px] font-mono text-muted-foreground/75 mt-2">source · {c.source_path}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
      <AddAccountDialog open={addOpen} onOpenChange={setAddOpen} />
      <MetricDiagnosticModal
        open={openMetric != null}
        onClose={() => setOpenMetricId(null)}
        metric={openMetric}
        analysis={null}
        scope="manager"
      />
    </div>
  );
}
