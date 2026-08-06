// ─── Manager / Agency Overview (default view) ─────────────────────────
// Only bottom-line performance totals may aggregate at manager level.
// No account-specific analysis, strategy, or reports here.
// No Optimization Loop at manager level — recommendations are READ-ONLY,
// labeled with their source account. Deeper action lives inside each account.

import { useMemo, useState } from "react";
import { CheckCircle2, Plug, TrendingUp, Plus, ArrowRight, ChevronDown } from "lucide-react";
import { useAccount } from "@/contexts/AccountContext";
import { useMetrixSeed, useMetrixIsRefetching } from "@/contexts/MetrixDataContext";
import { getManagerOverview } from "@/lib/data/metrixSeedAdapter";
import { ModuleHeader, MetricTile, SectionCard, ConfidenceBadge, ImpactBadge, ScopeBadge, DetailReveal, fmtUSD, fmtNum, eventLabel, SkeletonTileRow } from "./shared";
import { AddAccountDialog } from "./AddAccountDialog";
import { cn } from "@/lib/utils";
import { buildMetricCatalog, metricSourceFromManagerTotals, metricById, resultMetricId } from "@/lib/data/metricsCatalog";
import { useMetricSelection } from "@/hooks/useMetricSelection";
import { MetricPickerButton } from "@/components/creative/MetricPicker";
import { MetricDiagnosticModal } from "@/components/creative/MetricDiagnosticModal";
import { TokenizedConceptText } from "@/components/concept/ConceptChip";
import { OverviewLoopSummary } from "./OverviewLoopHub";
import { TYPE } from "./typography";

/** Metric IDs that should be hidden when their blended value is 0 (meaningless without data). */
const SUPPRESS_ZERO_IDS = new Set(["unknown", "cpa_blended"]);

/** Compact USD formatter for sub-labels (e.g. $9.4k, $1.2M). */
function fmtCompactUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

/** Per-account totals derived from the ad accounts in the seed (no new API). */
interface AccountTotals {
  id: string;
  name: string;
  spend: number;
  results: number;
  cpa: number | null;
}

/** Account-label pill — page-specific (not a shared badge family like impact/scope). */
function AccountBadge({ text }: { text: string }) {
  return (
    <span className="text-label font-semibold border px-1.5 py-0.5 rounded uppercase tracking-wide leading-none bg-primary/10 text-interactive border-primary/20">
      {text}
    </span>
  );
}

/** Dense per-account breakdown table shown beneath the metric tiles. */
function AccountBreakdownTable({ rows }: { rows: AccountTotals[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-lg border border-border/40 overflow-hidden">
      <div className="grid text-left" style={{ gridTemplateColumns: "1fr auto auto auto" }}>
        {/* Header */}
        <div className={cn(TYPE.label, "px-3 py-1.5 border-b border-border/30 text-muted-foreground/60 uppercase tracking-widest")}>Account</div>
        <div className={cn(TYPE.label, "px-3 py-1.5 border-b border-border/30 text-muted-foreground/60 uppercase tracking-widest text-right")}>Spend</div>
        <div className={cn(TYPE.label, "px-3 py-1.5 border-b border-border/30 text-muted-foreground/60 uppercase tracking-widest text-right")}>Results</div>
        <div className={cn(TYPE.label, "px-3 py-1.5 border-b border-border/30 text-muted-foreground/60 uppercase tracking-widest text-right")}>CPA</div>
        {/* Rows */}
        {rows.map((r, i) => {
          const isLast = i === rows.length - 1;
          const rowBorder = isLast ? "" : "border-b border-border/20";
          return (
            <>
              <div key={`${r.id}-name`} className={cn(TYPE.body, "px-3 py-2 text-foreground/85 font-medium truncate", rowBorder)}>{r.name}</div>
              <div key={`${r.id}-spend`} className={cn(TYPE.body, "px-3 py-2 text-foreground/80 tabular-nums text-right", rowBorder)}>{fmtUSD(r.spend, 0)}</div>
              <div key={`${r.id}-results`} className={cn(TYPE.body, "px-3 py-2 text-foreground/80 tabular-nums text-right", rowBorder)}>{fmtNum(r.results)}</div>
              <div key={`${r.id}-cpa`} className={cn(TYPE.body, "px-3 py-2 text-foreground/80 tabular-nums text-right", rowBorder)}>{r.cpa != null ? fmtUSD(r.cpa) : "—"}</div>
            </>
          );
        })}
      </div>
    </div>
  );
}

export function ManagerOverview() {
  const { manager, adAccounts, selectAdAccount } = useAccount();
  const seed = useMetrixSeed();
  const isRefetching = useMetrixIsRefetching();
  const [addOpen, setAddOpen] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const data = getManagerOverview(seed);
  const totals = data.bottom_line_totals;
  const events = Object.entries(totals.result_totals_by_event);

  // Map account_id → display name so each rec shows its source account.
  const accountName = (id: string) =>
    adAccounts.find((a) => a.id === id)?.name ?? id;

  // Derive per-account totals from the seed's ad account data.
  const accountTotals = useMemo<AccountTotals[]>(() => {
    return adAccounts
      .filter((a) => a.status === "configured" && a.iap?.campaign_summary)
      .map((a) => {
        const cs = a.iap!.campaign_summary!;
        const spend = cs.total_spend_usd ?? 0;
        const results = Object.values(cs.bottom_line_totals).reduce((s, e) => s + (e.results ?? 0), 0);
        const cpa = results > 0 ? spend / results : null;
        return { id: a.id, name: a.name, spend, results, cpa };
      })
      .sort((a, b) => b.spend - a.spend);
  }, [adAccounts]);

  // Top-2 account contributors for spend tile sub-label.
  const spendSub = useMemo(() => {
    const top2 = accountTotals.slice(0, 2);
    if (top2.length === 0) return undefined;
    return top2.map((r) => `${r.name} ${fmtCompactUSD(r.spend)}`).join(" · ");
  }, [accountTotals]);

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
              <Plug className="w-5 h-5 text-interactive" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-base font-semibold text-foreground">Add your first ad account</h2>
              <p className="text-body text-muted-foreground/70">Connect Meta or upload reports.</p>
            </div>
            <button
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary/15 border border-primary/30 text-interactive text-body font-medium hover:bg-primary/25 transition-colors"
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
        subtitle="Blended performance · all ad accounts"
        right={
          <span className="text-label font-mono text-muted-foreground/60 uppercase tracking-widest">
            {data.configured_ad_accounts} configured · {data.unconfigured_ad_accounts} to set up
          </span>
        }
      />

      <div className="px-6 py-5 space-y-4 max-w-6xl">
        <OverviewLoopSummary />

        {/* Bottom-line totals */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-caption font-mono uppercase tracking-widest text-muted-foreground/60">Bottom-line totals</h2>
            <div className="flex items-center gap-2">
              {/* Breakdown toggle */}
              <button
                onClick={() => setBreakdownOpen((v) => !v)}
                aria-expanded={breakdownOpen}
                className="inline-flex items-center gap-1 text-label font-medium text-muted-foreground/70 hover:text-foreground/80 transition-colors px-2 py-1 rounded border border-border/30 bg-white/[0.02] hover:border-border/50"
              >
                Breakdown
                <ChevronDown className={cn("w-3 h-3 transition-transform duration-150", breakdownOpen && "rotate-180")} />
              </button>
              <MetricPickerButton catalog={metricCatalog} selected={selectedMetricIds} onToggle={toggle} onMove={move} onReset={reset} />
            </div>
          </div>
          {isRefetching ? (
            <SkeletonTileRow count={selectedMetricIds.length || 4} />
          ) : (
            <div className="grid grid-cols-dashboard-4 gap-3">
              {selectedMetricIds.map((id) => {
                const m = metricById(metricCatalog, id);
                if (!m) return null;
                // Suppress meaningless zero tiles (e.g. "UNKNOWN · 0").
                if ((m.value === 0 || m.value == null) && SUPPRESS_ZERO_IDS.has(m.id)) return null;
                // Also suppress any result-event tile whose label contains "unknown".
                if ((m.value === 0 || m.value == null) && m.label.toLowerCase().includes("unknown")) return null;
                // Attach top-2 account spend breakdown as sub-label for the spend tile.
                const sub = id === "spend" ? spendSub : m.sub;
                return (
                  <button key={id} onClick={() => setOpenMetricId(id)} className="text-left group">
                    <div className="mx-kpi-tile py-3 transition-colors group-hover:border-primary/30">
                      <div className="relative z-10">
                        <div className="text-label font-semibold uppercase tracking-[0.14em] text-muted-foreground/70 mb-1.5 truncate">{m.label}</div>
                        <div className="text-bignum font-bold text-foreground metric-num leading-none tracking-[-0.035em]">{m.formatted}</div>
                        {sub && <div className="text-caption text-muted-foreground/55 mt-1.5 leading-snug line-clamp-1">{sub}</div>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          {/* Per-account breakdown table */}
          {breakdownOpen && !isRefetching && (
            <div className="mt-3">
              <AccountBreakdownTable rows={accountTotals} />
            </div>
          )}
        </div>

        {/* Results by event — same catalog + drill-down modal as the metric tiles above,
            instead of a second, dead-end display of the same underlying data. */}
        <SectionCard title="Results by event" desc="Result volume by conversion event · all accounts · tap for detail">
          <div className="grid grid-cols-dashboard-3-sm gap-3">
            {events.map(([key, e]) => (
              <button
                key={key}
                onClick={() => setOpenMetricId(resultMetricId(key))}
                className="text-left rounded-lg border border-border/40 bg-white/[0.02] p-3.5 hover:border-border/60 hover:bg-white/[0.04] transition-colors"
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <TrendingUp className="w-3.5 h-3.5 text-interactive/60" />
                  <span className="text-caption font-medium text-foreground leading-tight">{eventLabel(key)}</span>
                </div>
                <div className="text-section font-semibold text-foreground tabular-nums leading-none">{fmtNum(e.results)}</div>
                <div className="text-label text-muted-foreground/70 mt-2 space-y-0.5">
                  <div>Spend {fmtUSD(e.spend)}</div>
                  <div>Link clicks {fmtNum(e.link_clicks)}</div>
                </div>
              </button>
            ))}
          </div>
        </SectionCard>

        {/* Accounts */}
        <SectionCard title="Ad accounts" desc="Select an account to open it">
          <div className="grid grid-cols-dashboard-2 gap-3">
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
                    <div className="text-title font-medium text-foreground leading-tight">{a.name}</div>
                    <div className="text-label text-muted-foreground/70 mt-0.5 capitalize">{configured ? `${a.platform} · connected` : "Setup required"}</div>
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
                <div className="text-title font-medium text-foreground/80 leading-tight">Add or connect an ad account</div>
                <div className="text-label text-muted-foreground/70 mt-0.5">Connect Meta or add a manual import</div>
              </div>
            </button>
          </div>
        </SectionCard>

        {/* Manager recommendations — READ-ONLY, account-labeled. No swipe / no optimization loop here. */}
        <SectionCard
          title="Account recommendations"
          desc="Cross-account signals · read-only · act from the source account"
        >
          {data.recommendation_cards.length === 0 ? (
            <p className="text-body text-muted-foreground/70 py-4 text-center">No account recommendations at the moment.</p>
          ) : (
            <div className="grid grid-cols-dashboard-2-lg gap-3">
              {data.recommendation_cards.map((c) => (
                <div key={c.id} className="rounded-xl border border-border/40 bg-white/[0.02] p-4 flex flex-col">
                  <div className="flex items-center gap-1.5 flex-wrap mb-2">
                    <AccountBadge text={c.manager_card_descriptor ?? accountName(c.account_id)} />
                    <ScopeBadge scope={c.scope} />
                    <ImpactBadge impact={c.impact} />
                    <ConfidenceBadge value={c.confidence} />
                  </div>
                  <DetailReveal
                    label={<TokenizedConceptText text={c.title} />}
                    labelClassName="text-title font-semibold text-foreground leading-snug"
                    eyebrow="Recommendation"
                    sections={[
                      {
                        label: "Rationale",
                        text: c.rationale,
                        render: c.rationale ? () => <TokenizedConceptText text={c.rationale} /> : undefined,
                      },
                      {
                        label: "Recommended action",
                        text: c.recommended_action,
                        render: c.recommended_action ? () => <TokenizedConceptText text={c.recommended_action} /> : undefined,
                      },
                    ]}
                  />
                  <button
                    onClick={() => selectAdAccount(c.account_id)}
                    className="mt-3 self-start inline-flex items-center gap-1 text-caption font-medium text-interactive/80 hover:text-primary transition-colors"
                  >
                    Open {accountName(c.account_id)} <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  {c.source_path && (
                    <p className="text-label font-mono text-muted-foreground/60 mt-2">source · {c.source_path}</p>
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
