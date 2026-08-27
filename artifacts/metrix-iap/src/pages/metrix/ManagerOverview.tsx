// ─── Manager / Agency Overview (redesigned) ───────────────────────────
//
// Design principles:
//   1. METRIC TILES — per-tile metric picker: each tile independently
//      swappable across all available metrics (upper funnel → downstream).
//   2. RESULTS BY EVENT — ranked table with contribution bars + CPA so
//      you can scan performance in 2 seconds, not read 6 identical cards.
//   3. AD ACCOUNTS — spend + results + CPA on each configured card so you
//      can triage accounts without opening them.
//   4. RECOMMENDATIONS — impact-first layout: insight as primary text,
//      action block always visible, rationale expandable on demand.
//
// Data wiring is unchanged; only the presentation layer is redesigned.

import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  CheckCircle2, Plug, Plus, ArrowRight, ChevronDown, ChevronUp, Download,
} from "lucide-react";
import { useAccount } from "@/contexts/AccountContext";
import { useMetrixSeed, useMetrixIsRefetching } from "@/contexts/MetrixDataContext";
import { getManagerOverview } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, SectionCard, ConfidenceBadge, ImpactBadge, ScopeBadge,
  fmtUSD, fmtNum, eventLabel, SkeletonTileRow,
} from "./shared";
import { AddAccountDialog } from "./AddAccountDialog";
import { OnboardingWizard } from "./OnboardingWizard";
import { cn } from "@workspace/command-deck/lib/utils";
import {
  buildMetricCatalog, metricSourceFromManagerTotals, metricById, resultMetricId,
} from "@/lib/data/metricsCatalog";
import { KpiTile } from "@/components/metrics/KpiTile";
import { useKpiTileMetrics } from "@/hooks/useKpiTileMetrics";
import { KpiDrilldownModal } from "@/components/metrics/KpiDrilldownModal";
import { TokenizedConceptText } from "@/components/concept/ConceptChip";
import { OverviewLoopSummary } from "./OverviewLoopHub";
import { TYPE, HEADING } from "./typography";
import type { AdAccount } from "@/lib/data/seedTypes";

// ─── Helpers ─────────────────────────────────────────────────────────────

function fmtCompactUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

interface AccountTotals {
  id: string; name: string; spend: number; results: number; cpa: number | null;
}

// ─── Account label badge ─────────────────────────────────────────────────

function AccountBadge({ text }: { text: string }) {
  return (
    <span className="inline-flex text-label font-semibold border px-1.5 py-0.5 rounded uppercase tracking-wide leading-none bg-primary/10 text-interactive border-primary/20">
      {text}
    </span>
  );
}

// ─── Per-account breakdown table ─────────────────────────────────────────

function AccountBreakdownTable({ rows }: { rows: AccountTotals[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-lg border border-border/40 overflow-hidden">
      <div className="grid text-left" style={{ gridTemplateColumns: "1fr auto auto auto" }}>
        <div className={cn(TYPE.label, "px-3 py-1.5 border-b border-border/30 text-muted-foreground/50 uppercase tracking-widest")}>Account</div>
        <div className={cn(TYPE.label, "px-3 py-1.5 border-b border-border/30 text-muted-foreground/50 uppercase tracking-widest text-right")}>Spend</div>
        <div className={cn(TYPE.label, "px-3 py-1.5 border-b border-border/30 text-muted-foreground/50 uppercase tracking-widest text-right")}>Results</div>
        <div className={cn(TYPE.label, "px-3 py-1.5 border-b border-border/30 text-muted-foreground/50 uppercase tracking-widest text-right")}>CPA</div>
        {rows.map((r, i) => {
          const isLast = i === rows.length - 1;
          const rowBorder = isLast ? "" : "border-b border-border/20";
          return (
            <>
              <div key={`${r.id}-name`} className={cn(TYPE.body, "px-3 py-2 text-foreground/85 font-medium truncate", rowBorder)}>{r.name}</div>
              <div key={`${r.id}-spend`} className={cn(TYPE.body, "px-3 py-2 text-foreground/70 tabular-nums text-right", rowBorder)}>{fmtUSD(r.spend, 0)}</div>
              <div key={`${r.id}-results`} className={cn(TYPE.body, "px-3 py-2 text-foreground/70 tabular-nums text-right", rowBorder)}>{fmtNum(r.results)}</div>
              <div key={`${r.id}-cpa`} className={cn(TYPE.body, "px-3 py-2 text-foreground/70 tabular-nums text-right", rowBorder)}>{r.cpa != null ? fmtUSD(r.cpa) : "—"}</div>
            </>
          );
        })}
      </div>
    </div>
  );
}

// ─── Results by event — Nocturne canvas table ─────────────────────────
// The canvas's Results-by-event composition: a clean four-column table
// (Event | Results | Spend | Cost / result) with fading row rules and an
// accent chevron on clickable rows. Sorted by result volume; zero-result
// events stay listed (dimmed), never hidden or estimated.

interface ResultEvent { spend: number; reach: number; impressions: number; results: number; clicks_all: number; link_clicks: number; }

function ResultsByEventList({
  events,
  onDiagnose,
}: {
  events: [string, ResultEvent][];
  onDiagnose: (key: string) => void;
}) {
  const sorted = useMemo(
    () => [...events].sort(([, a], [, b]) => b.results - a.results),
    [events],
  );
  const totalResults = sorted.reduce((s, [, e]) => s + e.results, 0);

  if (sorted.length === 0) {
    return <p className={cn(TYPE.body, "text-muted-foreground/55 py-3 text-center")}>No result events recorded.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="nc-table">
        <thead>
          <tr>
            <th>Event</th>
            <th className="text-right">Results</th>
            <th className="text-right">Spend</th>
            <th className="text-right">Cost / result</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(([key, e]) => {
            const isZero = e.results === 0;
            const cpa = e.results > 0 ? e.spend / e.results : null;
            return (
              <tr
                key={key}
                onClick={isZero ? undefined : () => onDiagnose(key)}
                className={cn(isZero ? "opacity-40" : "cursor-pointer")}
              >
                <td>
                  <span className="inline-flex items-center gap-1.5 font-medium text-foreground/90">
                    {eventLabel(key)}
                    {!isZero && <span aria-hidden="true" className="text-interactive/70">›</span>}
                  </span>
                </td>
                <td className="text-right tabular-nums text-foreground/85">{fmtNum(e.results)}</td>
                <td className="text-right tabular-nums text-muted-foreground/70">{fmtUSD(e.spend, 0)}</td>
                <td className={cn("text-right tabular-nums", cpa != null ? "text-foreground/80" : "text-muted-foreground/35")}>
                  {cpa != null ? fmtUSD(cpa) : "n/a"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {totalResults > 0 && (
        <div className="flex items-center justify-between pt-2 px-2.5">
          <span className={cn(TYPE.label, "text-muted-foreground/45")}>All events</span>
          <span className={cn(TYPE.body, "font-semibold tabular-nums text-foreground/70")}>{fmtNum(totalResults)}</span>
        </div>
      )}
    </div>
  );
}

// ─── Ad account card — with per-account KPI callout ──────────────────────
// Configured accounts surface spend + results + CPA so you can triage at a
// glance. Setup-required accounts are dimmed and show a setup prompt.

function AdAccountCard({
  account,
  onOpen,
  totals,
}: {
  account: AdAccount;
  onOpen: () => void;
  totals?: AccountTotals;
}) {
  const configured = account.status === "configured";
  return (
    <button
      onClick={onOpen}
      className={cn(
        "flex items-start gap-3 p-3.5 rounded-lg border text-left transition-[color,background-color,border-color,box-shadow,opacity,transform] group",
        configured
          ? "border-border/40 bg-white/[0.02] hover:border-border/60 hover:bg-white/[0.04]"
          : "border-border/25 bg-transparent opacity-55 hover:opacity-75",
      )}
    >
      {/* Status icon */}
      <div className={cn(
        "w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 mt-0.5",
        configured ? "border-status-success/25 bg-status-success/10" : "border-border/30 bg-white/[0.02]",
      )}>
        {configured
          ? <CheckCircle2 className="w-3.5 h-3.5 text-status-success" />
          : <Plug className="w-3.5 h-3.5 text-muted-foreground/50" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={cn(TYPE.body, "font-semibold text-foreground truncate leading-tight")}>
            {account.name}
          </span>
          <ArrowRight className={cn(
            "w-3.5 h-3.5 shrink-0 transition-colors",
            configured
              ? "text-muted-foreground/30 group-hover:text-interactive/60"
              : "text-muted-foreground/20",
          )} />
        </div>
        <div className={cn(TYPE.caption, "text-muted-foreground/55 mt-0.5 capitalize")}>
          {configured ? `${account.platform} · Connected` : "Setup required"}
        </div>

        {/* Per-account KPI row — only for configured accounts with data */}
        {configured && totals && (totals.spend > 0 || totals.results > 0) && (
          <div className="flex items-center gap-4 mt-2.5 pt-2 border-t border-border/20">
            <div>
              <div className="text-micro font-mono uppercase tracking-widest text-muted-foreground/35 mb-0.5">Spend</div>
              <div className={cn(TYPE.body, "font-semibold tabular-nums text-foreground/80")}>{fmtUSD(totals.spend, 0)}</div>
            </div>
            <div>
              <div className="text-micro font-mono uppercase tracking-widest text-muted-foreground/35 mb-0.5">Results</div>
              <div className={cn(TYPE.body, "tabular-nums text-foreground/65")}>{fmtNum(totals.results)}</div>
            </div>
            {totals.cpa != null && (
              <div>
                <div className="text-micro font-mono uppercase tracking-widest text-muted-foreground/35 mb-0.5">CPA</div>
                <div className={cn(TYPE.body, "tabular-nums text-foreground/65")}>{fmtUSD(totals.cpa)}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </button>
  );
}

// ─── Account recommendations card — impact-first ─────────────────────────
// Visual hierarchy:
//   1. Badges (account · scope · impact · confidence) — context at a glance
//   2. Insight title — what the signal is, full-weight text
//   3. Action block — always visible, never hidden behind an expand
//   4. Rationale — expandable "Why this?" to keep first-layer scannable
//   5. "Open [account] →" — prominent CTA at bottom

const IMPACT_STYLE: Record<string, { borderLeft: string; accentBg: string }> = {
  high:   { borderLeft: "border-l-[3px] border-l-amber-400/50",   accentBg: "bg-status-warning/[0.03]" },
  medium: { borderLeft: "border-l-[3px] border-l-primary/30",     accentBg: "bg-primary/[0.025]" },
  setup:  { borderLeft: "border-l-[3px] border-l-blue-400/30",    accentBg: "bg-chart-1/[0.025]" },
  low:    { borderLeft: "",                                         accentBg: "" },
};

function RecommendationCardItem({
  card,
  accountLabel,
  onOpen,
}: {
  card: { id: string; account_id: string; scope: string; title: string; rationale: string; impact: string; confidence: string; source_path?: string; recommended_action: string; manager_card_descriptor?: string; };
  accountLabel: string;
  onOpen: () => void;
}) {
  const [rationaleOpen, setRationaleOpen] = useState(false);
  const impact = (card.impact ?? "low").toLowerCase();
  const style = IMPACT_STYLE[impact] ?? IMPACT_STYLE.low;

  return (
    <div className={cn(
      "rounded-xl border border-border/40 p-4 flex flex-col gap-3 transition-colors",
      style.borderLeft,
      style.accentBg || "bg-white/[0.015]",
    )}>
      {/* ① Badge row — context at a glance */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <AccountBadge text={card.manager_card_descriptor ?? accountLabel} />
        <ScopeBadge scope={card.scope} />
        <ImpactBadge impact={card.impact} />
        <ConfidenceBadge value={card.confidence} />
      </div>

      {/* ② Insight — primary text, always fully visible */}
      <div>
        <TokenizedConceptText
          text={card.title}
          className="text-title font-semibold text-foreground leading-snug"
        />
      </div>

      {/* ③ Action block — the most important second thing, never hidden */}
      {card.recommended_action && (
        <div className="rounded-lg border border-border/25 bg-white/[0.04] px-3 py-2.5">
          <div className="text-micro font-mono uppercase tracking-widest text-interactive/55 mb-1.5">
            Recommended action
          </div>
          <TokenizedConceptText
            text={card.recommended_action}
            className={cn(TYPE.body, "text-foreground/80 leading-relaxed")}
          />
        </div>
      )}

      {/* ④ Rationale — expandable to keep first layer scannable */}
      {card.rationale && (
        <div>
          <button
            onClick={() => setRationaleOpen((v) => !v)}
            className="flex items-center gap-1 text-label text-muted-foreground/45 hover:text-foreground/65 transition-colors font-medium"
          >
            {rationaleOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {rationaleOpen ? "Hide rationale" : "Why this?"}
          </button>
          {rationaleOpen && (
            <div className="mt-2 px-1">
              <TokenizedConceptText
                text={card.rationale}
                className={cn(TYPE.body, "text-foreground/65 leading-relaxed")}
              />
            </div>
          )}
        </div>
      )}

      {/* ⑤ Footer: CTA + source trace */}
      <div className="flex items-end justify-between gap-2 mt-auto pt-1">
        <button
          onClick={onOpen}
          className="inline-flex items-center gap-1.5 text-body font-semibold text-interactive hover:text-primary transition-colors"
        >
          Open {accountLabel} <ArrowRight className="w-3.5 h-3.5" />
        </button>
        {card.source_path && (
          <span
            className="text-micro font-mono text-muted-foreground/25 truncate max-w-[130px]"
            title={card.source_path}
          >
            {card.source_path}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────

// Number of tile slots rendered in the metric row.
const TILE_COUNT = 4;

export function ManagerOverview() {
  const [, navigate] = useLocation();
  const { manager, adAccounts, selectAdAccount } = useAccount();
  const seed = useMetrixSeed();
  const isRefetching = useMetrixIsRefetching();
  const [addOpen, setAddOpen] = useState(false);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const data = getManagerOverview(seed);
  const totals = data.bottom_line_totals;
  const events = Object.entries(totals.result_totals_by_event) as [string, { spend: number; reach: number; impressions: number; results: number; clicks_all: number; link_clicks: number }][];

  const accountName = (id: string) => adAccounts.find((a) => a.id === id)?.name ?? id;

  // Per-account KPI totals (spend → results → CPA) from ad account data.
  const accountTotalsMap = useMemo<Map<string, AccountTotals>>(() => {
    const m = new Map<string, AccountTotals>();
    for (const a of adAccounts) {
      if (a.status !== "configured" || !a.iap?.campaign_summary) continue;
      const cs = a.iap.campaign_summary;
      const spend = cs.total_spend_usd ?? 0;
      const results = Object.values(cs.bottom_line_totals).reduce((s, e) => s + (e.results ?? 0), 0);
      const cpa = results > 0 ? spend / results : null;
      m.set(a.id, { id: a.id, name: a.name, spend, results, cpa });
    }
    return m;
  }, [adAccounts]);

  const accountTotals = useMemo(
    () => [...accountTotalsMap.values()].sort((a, b) => b.spend - a.spend),
    [accountTotalsMap],
  );

  // Metric catalog: static delivery metrics + result-event metrics.
  const metricCatalog = useMemo(() => buildMetricCatalog(metricSourceFromManagerTotals(totals)), [totals]);
  const availableMetricIds = useMemo(() => metricCatalog.map((m) => m.id), [metricCatalog]);

  // Per-tile metric selection — persisted per view so picks survive navigation.
  const { tileMetricIds, setTileMetric } = useKpiTileMetrics("manager-overview", availableMetricIds, { tileCount: TILE_COUNT });

  // Progressive disclosure: concise per-account split for the ⓘ hover —
  // replaces the old inline "Bookster $8.0k · skov $4.8k" tile sub-text.
  const perAccountSplit = useMemo(() => {
    if (accountTotals.length === 0) return null;
    return (
      <div className="space-y-0.5">
        <div className="font-semibold text-foreground/85">Per-account split</div>
        {accountTotals.slice(0, 5).map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 tabular-nums">
            <span className="truncate">{r.name}</span>
            <span className="text-muted-foreground/80 shrink-0">{fmtCompactUSD(r.spend)}</span>
          </div>
        ))}
        <div className="text-muted-foreground/70 pt-0.5">Blended across all configured accounts — see "By account" for the full table.</div>
      </div>
    );
  }, [accountTotals]);

  // Diagnostic modal state.
  const [openMetricId, setOpenMetricId] = useState<string | null>(null);
  const openMetric = openMetricId ? metricById(metricCatalog, openMetricId) : null;

  // ── Onboarding: guided first-run wizard ───────────────────────────────
  // Purely a display-state fork on adAccounts.length; nothing is persisted,
  // so the moment an account exists the normal dashboard below renders on
  // its own.

  if (adAccounts.length === 0) {
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
        <ModuleHeader
          section="Agency Overview"
          title={manager.name}
          subtitle="No ad accounts yet. Add your first account to unlock the intelligence platform."
        />
        <OnboardingWizard managerName={manager.name} />
      </div>
    );
  }

  // ── Main dashboard ────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <ModuleHeader
        section="Agency Overview"
        title={manager.name}
        subtitle="Blended performance · all ad accounts"
        right={
          <div className="flex items-center gap-2.5">
            <span className={cn(TYPE.label, "font-mono text-muted-foreground/55 uppercase tracking-widest")}>
              {data.configured_ad_accounts} configured · {data.unconfigured_ad_accounts} to set up
            </span>
            {/* Manager scope has no windowed KPI-tile data source to drive a
                real date-range/vs-prior/Summary control (unlike Account
                Overview) — Export is the one control here with a genuine,
                working destination, so it's the only addition to this header. */}
            <button
              type="button"
              onClick={() => navigate("/app/exports")}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-border/40 text-caption font-medium text-muted-foreground/70 hover:text-foreground hover:bg-white/[0.04] transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
          </div>
        }
      />

      <div className="px-6 py-5 space-y-5 max-w-6xl">
        {/* IAP Loop progress strip */}
        <OverviewLoopSummary />

        {/* ── Bottom-line metric tiles ───────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <h2 className={HEADING.h2}>
              Bottom-line totals
            </h2>
            <button
              onClick={() => setBreakdownOpen((v) => !v)}
              aria-expanded={breakdownOpen}
              className="inline-flex items-center gap-1 text-label font-medium text-muted-foreground/55 hover:text-foreground/75 transition-colors px-2 py-1 rounded border border-border/30 bg-white/[0.02] hover:border-border/50"
            >
              By account
              <ChevronDown className={cn("w-3 h-3 transition-transform duration-150", breakdownOpen && "rotate-180")} />
            </button>
          </div>

          {isRefetching ? (
            <SkeletonTileRow count={TILE_COUNT} />
          ) : (
            <div className="grid grid-cols-dashboard-4 gap-3">
              {tileMetricIds.map((metricId, slotIdx) => (
                <KpiTile
                  key={slotIdx}
                  metricId={metricId}
                  catalog={metricCatalog}
                  isRefetching={isRefetching}
                  onSelect={(id) => setTileMetric(slotIdx, id)}
                  onClick={() => setOpenMetricId(metricId)}
                  disclosure={metricId === "spend" ? perAccountSplit : undefined}
                />
              ))}
            </div>
          )}

          {breakdownOpen && !isRefetching && (
            <div className="mt-3">
              <AccountBreakdownTable rows={accountTotals} />
            </div>
          )}
        </div>

        {/* ── Results by event ────────────────────────────────────────── */}
        <SectionCard
          title="Results by event"
          desc="Ranked by result volume · click an event for the full metric breakdown"
        >
          <ResultsByEventList
            events={events}
            onDiagnose={(key) => setOpenMetricId(resultMetricId(key))}
          />
        </SectionCard>

        {/* ── Ad accounts ─────────────────────────────────────────────── */}
        <SectionCard
          title="Ad accounts"
          desc="Select an account to open it · spend and CPA shown for active accounts"
        >
          <div className="grid grid-cols-dashboard-2 gap-3">
            {/* Configured accounts first (sorted by spend), then unconfigured */}
            {[
              ...adAccounts.filter((a) => a.status === "configured").sort((a, b) => {
                const sa = accountTotalsMap.get(a.id)?.spend ?? 0;
                const sb = accountTotalsMap.get(b.id)?.spend ?? 0;
                return sb - sa;
              }),
              ...adAccounts.filter((a) => a.status !== "configured"),
            ].map((a) => (
              <AdAccountCard
                key={a.id}
                account={a}
                onOpen={() => selectAdAccount(a.id)}
                totals={accountTotalsMap.get(a.id)}
              />
            ))}

            {/* Add / Connect entry point */}
            <button
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-3 p-3.5 rounded-lg border border-dashed border-border/40 bg-transparent hover:border-primary/35 hover:bg-primary/[0.025] transition-colors text-left"
            >
              <div className="w-8 h-8 rounded-lg border border-dashed border-border/40 flex items-center justify-center shrink-0">
                <Plus className="w-3.5 h-3.5 text-muted-foreground/50" />
              </div>
              <div className="flex-1 min-w-0">
                <div className={cn(TYPE.body, "font-medium text-foreground/70 leading-tight")}>
                  Add or connect an ad account
                </div>
                <div className={cn(TYPE.caption, "text-muted-foreground/50 mt-0.5")}>
                  Connect Meta or add a manual import
                </div>
              </div>
            </button>
          </div>
        </SectionCard>

        {/* ── Account recommendations ──────────────────────────────────── */}
        {/* READ-ONLY at manager level — action always lives inside the source account. */}
        <SectionCard
          title="Account recommendations"
          desc="Cross-account signals · read-only · act from the source account"
        >
          {data.recommendation_cards.length === 0 ? (
            <p className={cn(TYPE.body, "text-muted-foreground/55 py-4 text-center")}>
              No account recommendations at the moment.
            </p>
          ) : (
            <div className="grid grid-cols-dashboard-2-lg gap-3">
              {[...data.recommendation_cards]
                .sort((a, b) => {
                  // High impact first, then medium, setup, low.
                  const rank: Record<string, number> = { high: 4, medium: 3, setup: 2, low: 1 };
                  return (rank[b.impact?.toLowerCase()] ?? 0) - (rank[a.impact?.toLowerCase()] ?? 0);
                })
                .map((c) => (
                  <RecommendationCardItem
                    key={c.id}
                    card={c}
                    accountLabel={c.manager_card_descriptor ?? accountName(c.account_id)}
                    onOpen={() => selectAdAccount(c.account_id)}
                  />
                ))}
            </div>
          )}
        </SectionCard>
      </div>

      <AddAccountDialog open={addOpen} onOpenChange={setAddOpen} />
      <KpiDrilldownModal
        open={openMetric != null}
        onClose={() => setOpenMetricId(null)}
        scope="manager"
        metricId={openMetricId}
        catalog={metricCatalog}
        accounts={adAccounts}
      />
    </div>
  );
}
