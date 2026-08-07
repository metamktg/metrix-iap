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

import { useMemo, useRef, useEffect, useState } from "react";
import {
  CheckCircle2, Plug, Plus, ArrowRight, ChevronDown, ChevronUp,
} from "lucide-react";
import { useAccount } from "@/contexts/AccountContext";
import { useMetrixSeed, useMetrixIsRefetching } from "@/contexts/MetrixDataContext";
import { getManagerOverview } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, SectionCard, ConfidenceBadge, ImpactBadge, ScopeBadge,
  fmtUSD, fmtNum, eventLabel, SkeletonTileRow,
} from "./shared";
import { AddAccountDialog } from "./AddAccountDialog";
import { cn } from "@workspace/command-deck/lib/utils";
import {
  buildMetricCatalog, metricSourceFromManagerTotals, metricById,
  resultMetricId, DEFAULT_METRIC_IDS, type MetricDef,
} from "@/lib/data/metricsCatalog";
import { MetricDiagnosticModal } from "@/components/creative/MetricDiagnosticModal";
import { TokenizedConceptText } from "@/components/concept/ConceptChip";
import { OverviewLoopSummary } from "./OverviewLoopHub";
import { TYPE } from "./typography";
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

// ─── Per-tile metric picker dropdown ─────────────────────────────────────
// Clicking a tile's label opens a categorised metric list. Every tile slot
// independently tracks its own metric; values are shown inline so the user
// can see what they're picking before swapping.

interface MetricPickerDropdownProps {
  catalog: MetricDef[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}

function MetricPickerDropdown({ catalog, activeId, onSelect, onClose }: MetricPickerDropdownProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    // micro-delay so the click that opened the dropdown doesn't immediately close it
    const tid = setTimeout(() => document.addEventListener("mousedown", handler), 50);
    return () => { clearTimeout(tid); document.removeEventListener("mousedown", handler); };
  }, [onClose]);

  const staticMetrics = catalog.filter((m) => !m.isResultEvent);
  const eventMetrics = catalog.filter((m) => m.isResultEvent);

  const Row = ({ m }: { m: MetricDef }) => (
    <button
      key={m.id}
      onClick={() => onSelect(m.id)}
      className={cn(
        "w-full text-left px-3 py-1.5 flex items-center justify-between gap-3 transition-colors",
        m.id === activeId
          ? "bg-primary/10 text-interactive"
          : "text-foreground/75 hover:bg-white/[0.05]",
      )}
    >
      <span className="text-caption truncate">{m.label}</span>
      <span className="text-caption font-mono tabular-nums text-muted-foreground/55 shrink-0">
        {m.value != null ? m.formatted : "—"}
      </span>
    </button>
  );

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 mt-1 z-50 w-56 rounded-lg border border-border/60 bg-[hsl(var(--surface-raised))] shadow-2xl py-1 overflow-hidden"
    >
      <div className="px-2.5 py-1 text-micro font-mono uppercase tracking-widest text-muted-foreground/45">
        Delivery & efficiency
      </div>
      {staticMetrics.map((m) => <Row key={m.id} m={m} />)}

      {eventMetrics.length > 0 && (
        <>
          <div className="mx-2 my-1 border-t border-border/20" />
          <div className="px-2.5 py-1 text-micro font-mono uppercase tracking-widest text-muted-foreground/45">
            Results by event
          </div>
          {eventMetrics.map((m) => <Row key={m.id} m={m} />)}
        </>
      )}
    </div>
  );
}

// ─── Single swappable metric tile ────────────────────────────────────────
// Label row is the dropdown trigger; value area opens the diagnostic modal.

interface MetricSelectTileProps {
  metricId: string;
  catalog: MetricDef[];
  isRefetching: boolean;
  onSelect: (id: string) => void;
  onDiagnose: (id: string) => void;
}

function MetricSelectTile({ metricId, catalog, isRefetching, onSelect, onDiagnose }: MetricSelectTileProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const m = metricById(catalog, metricId);
  if (!m) return null;

  return (
    <div className="relative">
      <div className="mx-kpi-tile py-3 flex flex-col gap-1">
        {/* Label → dropdown trigger */}
        <button
          onClick={(e) => { e.stopPropagation(); setPickerOpen((v) => !v); }}
          className="flex items-center gap-1 group/lbl text-left w-fit"
        >
          <span className={cn(
            TYPE.label,
            "font-semibold uppercase tracking-[0.14em] truncate transition-colors",
            pickerOpen ? "text-interactive" : "text-muted-foreground/65 group-hover/lbl:text-muted-foreground/90",
          )}>
            {m.label}
          </span>
          <ChevronDown className={cn(
            "w-2.5 h-2.5 shrink-0 transition-all",
            pickerOpen ? "rotate-180 text-interactive" : "text-muted-foreground/35 group-hover/lbl:text-muted-foreground/65",
          )} />
        </button>

        {/* Value → diagnostic trigger */}
        <button
          onClick={() => onDiagnose(metricId)}
          className="text-left hover:opacity-75 transition-opacity"
        >
          {isRefetching ? (
            <span className="text-bignum font-bold text-muted-foreground/20 metric-num leading-none">—</span>
          ) : (
            <span className="text-bignum font-bold text-foreground metric-num leading-none tracking-[-0.035em]">
              {m.formatted}
            </span>
          )}
        </button>

        {m.sub && (
          <div className={cn(TYPE.caption, "text-muted-foreground/50 leading-snug line-clamp-1")}>
            {m.sub}
          </div>
        )}
      </div>

      {pickerOpen && (
        <MetricPickerDropdown
          catalog={catalog}
          activeId={metricId}
          onSelect={(id) => { onSelect(id); setPickerOpen(false); }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
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

// ─── Results by event — ranked list with contribution bars + CPA ──────────
// Sorted by result count (most impactful first). Each row shows:
// event name · result count · share of total · bar · spend · CPA

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
  const maxResults = sorted[0]?.[1]?.results ?? 1;

  if (sorted.length === 0) {
    return <p className={cn(TYPE.body, "text-muted-foreground/55 py-3 text-center")}>No result events recorded.</p>;
  }

  return (
    <div className="space-y-0.5">
      {/* Column header row */}
      <div
        className="grid items-center gap-3 px-2 pb-1.5 mb-0.5 border-b border-border/20"
        style={{ gridTemplateColumns: "1fr 5.5rem 3.5rem 1fr 5.5rem 5rem" }}
      >
        {["Event", "Results", "Share", "", "Spend", "CPA"].map((h) => (
          <span key={h} className="text-micro font-mono uppercase tracking-widest text-muted-foreground/35 text-right first:text-left">{h}</span>
        ))}
      </div>

      {sorted.map(([key, e], idx) => {
        const isZero = e.results === 0;
        const isTop = idx === 0 && !isZero;
        const share = totalResults > 0 ? (e.results / totalResults) * 100 : 0;
        const barPct = maxResults > 0 ? (e.results / maxResults) * 100 : 0;
        const cpa = e.results > 0 ? e.spend / e.results : null;

        return (
          <button
            key={key}
            onClick={() => onDiagnose(key)}
            className={cn(
              "w-full grid items-center gap-3 px-2 py-2 rounded-md transition-colors text-left group",
              isZero ? "opacity-40 cursor-default" : "hover:bg-white/[0.04]",
            )}
            style={{ gridTemplateColumns: "1fr 5.5rem 3.5rem 1fr 5.5rem 5rem" }}
            disabled={isZero}
          >
            {/* Event name */}
            <div className="flex items-center gap-2 min-w-0">
              {isTop && (
                <div className="w-1 h-1 rounded-full bg-interactive shrink-0" />
              )}
              <span className={cn(
                TYPE.body,
                "truncate",
                isTop ? "font-semibold text-foreground" : "font-medium text-foreground/80",
                !isTop && "ml-3",
              )}>
                {eventLabel(key)}
              </span>
            </div>

            {/* Result count */}
            <div className={cn(
              "tabular-nums font-semibold text-right text-title",
              isZero ? "text-muted-foreground/30" : isTop ? "text-foreground" : "text-foreground/75",
            )}>
              {fmtNum(e.results)}
            </div>

            {/* Share % */}
            <div className={cn("tabular-nums text-right", TYPE.caption, "text-muted-foreground/50")}>
              {isZero ? "—" : `${share.toFixed(0)}%`}
            </div>

            {/* Contribution bar */}
            <div className="flex items-center px-1">
              <div className="h-1 bg-white/[0.05] rounded-full w-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    isTop ? "bg-interactive/65" : "bg-white/20",
                  )}
                  style={{ width: `${barPct}%` }}
                />
              </div>
            </div>

            {/* Spend */}
            <div className={cn("tabular-nums text-right", TYPE.caption, "text-muted-foreground/60")}>
              {fmtUSD(e.spend, 0)}
            </div>

            {/* CPA */}
            <div className={cn(
              "tabular-nums text-right", TYPE.caption,
              cpa != null ? "text-foreground/65" : "text-muted-foreground/30",
            )}>
              {cpa != null ? fmtUSD(cpa) : "—"}
            </div>
          </button>
        );
      })}

      {/* Total footer */}
      {totalResults > 0 && (
        <div className="flex items-center justify-between pt-1.5 border-t border-border/20 px-2 mt-1">
          <span className={cn(TYPE.label, "text-muted-foreground/35 uppercase tracking-wide font-mono")}>All events</span>
          <span className={cn(TYPE.body, "font-semibold tabular-nums text-foreground/60")}>{fmtNum(totalResults)}</span>
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
        "flex items-start gap-3 p-3.5 rounded-lg border text-left transition-all group",
        configured
          ? "border-border/40 bg-white/[0.02] hover:border-border/60 hover:bg-white/[0.04]"
          : "border-border/25 bg-transparent opacity-55 hover:opacity-75",
      )}
    >
      {/* Status icon */}
      <div className={cn(
        "w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 mt-0.5",
        configured ? "border-emerald-400/25 bg-emerald-400/10" : "border-border/30 bg-white/[0.02]",
      )}>
        {configured
          ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
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
  high:   { borderLeft: "border-l-[3px] border-l-amber-400/50",   accentBg: "bg-amber-400/[0.03]" },
  medium: { borderLeft: "border-l-[3px] border-l-primary/30",     accentBg: "bg-primary/[0.025]" },
  setup:  { borderLeft: "border-l-[3px] border-l-blue-400/30",    accentBg: "bg-blue-400/[0.025]" },
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

  // Top-2 spend contributors for sub-label on the spend tile.
  const spendSub = useMemo(() => {
    const top2 = accountTotals.slice(0, 2);
    if (top2.length === 0) return undefined;
    return top2.map((r) => `${r.name} ${fmtCompactUSD(r.spend)}`).join(" · ");
  }, [accountTotals]);

  // Metric catalog: static delivery metrics + result-event metrics.
  const metricCatalog = useMemo(() => buildMetricCatalog(metricSourceFromManagerTotals(totals)), [totals]);

  // Per-tile metric selection — each of the TILE_COUNT slots tracks its own metric.
  const [tileMetricIds, setTileMetricIds] = useState<string[]>(() => {
    const defaults = DEFAULT_METRIC_IDS.slice(0, TILE_COUNT);
    // Back-fill with any remaining catalog IDs if defaults are short.
    return defaults;
  });
  const setTileMetric = (slotIndex: number, metricId: string) => {
    setTileMetricIds((prev) => {
      const next = [...prev];
      next[slotIndex] = metricId;
      return next;
    });
  };

  // Diagnostic modal state.
  const [openMetricId, setOpenMetricId] = useState<string | null>(null);
  const openMetric = openMetricId ? metricById(metricCatalog, openMetricId) : null;

  // ── Onboarding empty state ────────────────────────────────────────────

  if (adAccounts.length === 0) {
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
        <ModuleHeader
          section="Agency Overview"
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
              <p className={cn(TYPE.body, "text-muted-foreground/70")}>Connect Meta or upload reports.</p>
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

  // ── Main dashboard ────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <ModuleHeader
        section="Agency Overview"
        title={manager.name}
        subtitle="Blended performance · all ad accounts"
        right={
          <span className={cn(TYPE.label, "font-mono text-muted-foreground/55 uppercase tracking-widest")}>
            {data.configured_ad_accounts} configured · {data.unconfigured_ad_accounts} to set up
          </span>
        }
      />

      <div className="px-6 py-5 space-y-5 max-w-6xl">
        {/* IAP Loop progress strip */}
        <OverviewLoopSummary />

        {/* ── Bottom-line metric tiles ───────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <h2 className={cn(TYPE.label, "font-mono uppercase tracking-widest text-muted-foreground/50")}>
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
              {tileMetricIds.map((metricId, slotIdx) => {
                // Inject spend sub-label for the spend tile.
                const m = metricById(metricCatalog, metricId);
                if (m && metricId === "spend" && spendSub) {
                  // We need a patched version with spendSub — clone it to avoid mutation.
                  const patched: MetricDef = { ...m, sub: spendSub };
                  // Temporarily inject into catalog so MetricSelectTile sees it.
                  const patchedCatalog = metricCatalog.map((c) => (c.id === "spend" ? patched : c));
                  return (
                    <MetricSelectTile
                      key={slotIdx}
                      metricId={metricId}
                      catalog={patchedCatalog}
                      isRefetching={isRefetching}
                      onSelect={(id) => setTileMetric(slotIdx, id)}
                      onDiagnose={(id) => setOpenMetricId(id)}
                    />
                  );
                }
                return (
                  <MetricSelectTile
                    key={slotIdx}
                    metricId={metricId}
                    catalog={metricCatalog}
                    isRefetching={isRefetching}
                    onSelect={(id) => setTileMetric(slotIdx, id)}
                    onDiagnose={(id) => setOpenMetricId(id)}
                  />
                );
              })}
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
