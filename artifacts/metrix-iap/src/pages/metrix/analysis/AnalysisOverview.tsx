// ─── Analysis · Overview ──────────────────────────────────────────────
// Multi-format analytics dashboard: spend trendline, result-type donut,
// cell performance bars, variable table, placement bars, demo heatmap,
// then the core control reads and drill-in module cards.

import { useState, useMemo } from "react";
import { TYPE } from "../typography";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed, useMetrixIsRefetching } from "@/contexts/MetrixDataContext";
import {
  getAdAccount, getAnalysisData, getCampaignSummary, getCoreControls, getMST,
} from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ModuleScopeGate, PendingState, MetricTile,
  SectionCard, CrossLink, fmtUSD, fmtNum, fmtPct, resultTerm,
  RangeScopeBar, NoDataInRangeState, DetailReveal, deriveLabel,
  LoopAction, SkeletonTileRow, InfoTooltip, readableVariables, eventLabel,
} from "../shared";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useCellRangeScope, sumInRange } from "@/lib/date-scope";
import { SharePieChart } from "@/components/charts/SharePieChart";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import { cn } from "@/lib/utils";
import {
  LineChart, Library, Users, LayoutGrid, Wallet,
} from "lucide-react";
import type {
  ConceptRollupRow, DemographicRow, PlacementRow, VariablePerformanceRow,
} from "@/lib/data/seedTypes";

const SECTION = "Analysis · 03";

// ─── Monthly trend builder ────────────────────────────────────────────
// Buckets concept-flight data by overlapping month. Since no daily grain
// exists, each concept's spend/results is attributed to every month its
// flight window overlaps — honest aggregation, not interpolation.

interface MonthBucket {
  month: string;
  spend: number;
  results: number;
}

function buildMonthlyTrend(rollup: ConceptRollupRow[]): MonthBucket[] {
  const withDates = rollup.filter((r) => r.date_start && r.date_end);
  if (withDates.length < 2) return [];

  const toDt = (s: string) => new Date(s);
  const allStarts = withDates.map((r) => toDt(r.date_start).getTime());
  const allEnds   = withDates.map((r) => toDt(r.date_end).getTime());
  const minDate   = new Date(Math.min(...allStarts));
  const maxDate   = new Date(Math.max(...allEnds));

  const months: { label: string; start: Date; end: Date }[] = [];
  const cur = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const limit = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 1);
  while (cur < limit) {
    const monthEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
    months.push({
      label: cur.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      start: new Date(cur),
      end: monthEnd,
    });
    cur.setMonth(cur.getMonth() + 1);
  }

  return months
    .map((m) => {
      const overlap = withDates.filter((r) => {
        const rS = toDt(r.date_start);
        const rE = toDt(r.date_end);
        return rS <= m.end && rE >= m.start;
      });
      return {
        month: m.label,
        spend:   overlap.reduce((n, r) => n + (r.spend   ?? 0), 0),
        results: overlap.reduce((n, r) => n + (r.results ?? 0), 0),
      };
    })
    .filter((m) => m.spend > 0 || m.results > 0);
}

// ─── Placement rollup (mirrors PlacementsView) ────────────────────────

interface PlacementRollup {
  placement: string;
  spend: number;
  results: number;
  cpa: number | null;
  ctr: number | null;
}

function rollupPlacements(rows: PlacementRow[]): PlacementRollup[] {
  const map = new Map<string, { spend: number; results: number; impr: number; clicks: number }>();
  for (const r of rows) {
    const s = map.get(r.Placement) ?? { spend: 0, results: 0, impr: 0, clicks: 0 };
    s.spend   += r["Amount spent (USD)"];
    s.results += r.Results;
    s.impr    += r.Impressions;
    s.clicks  += r["Link clicks"];
    map.set(r.Placement, s);
  }
  return [...map.entries()].map(([placement, s]) => ({
    placement,
    spend:   s.spend,
    results: s.results,
    cpa:     s.results > 0 ? s.spend / s.results : null,
    ctr:     s.impr    > 0 ? (s.clicks / s.impr) * 100 : null,
  }));
}

// ─── Demographic heatmap builder ──────────────────────────────────────

interface DemoCell {
  age: string;
  gender: string;
  spend: number;
  results: number;
  cpa: number | null;
}

const AGE_ORDER    = ["13-17","18-24","25-34","35-44","45-54","55-64","65+","Unknown"];
const GENDER_ORDER = ["male","female","unknown"];

function buildDemoHeatmap(rows: DemographicRow[]) {
  const map = new Map<string, { spend: number; results: number }>();
  for (const r of rows) {
    const key = `${r.Age}|${r.Gender.toLowerCase()}`;
    const c = map.get(key) ?? { spend: 0, results: 0 };
    c.spend   += r["Amount spent (USD)"];
    c.results += r.Results;
    map.set(key, c);
  }

  const cells: DemoCell[] = [...map.entries()].map(([key, c]) => {
    const [age, gender] = key.split("|");
    return { age, gender, ...c, cpa: c.results > 0 ? c.spend / c.results : null };
  });

  const ages = [...new Set(cells.map((c) => c.age))].sort(
    (a, b) =>
      (AGE_ORDER.indexOf(a) >= 0 ? AGE_ORDER.indexOf(a) : 99) -
      (AGE_ORDER.indexOf(b) >= 0 ? AGE_ORDER.indexOf(b) : 99),
  );
  const genders = [...new Set(cells.map((c) => c.gender))].sort(
    (a, b) =>
      (GENDER_ORDER.indexOf(a) >= 0 ? GENDER_ORDER.indexOf(a) : 99) -
      (GENDER_ORDER.indexOf(b) >= 0 ? GENDER_ORDER.indexOf(b) : 99),
  );

  const cpas    = cells.map((c) => c.cpa).filter((v): v is number => v != null);
  const maxCpa  = cpas.length ? Math.max(...cpas) : 0;
  const minCpa  = cpas.length ? Math.min(...cpas) : 0;

  return { cells, ages, genders, maxCpa, minCpa };
}

// ─── Shared recharts tooltip card ────────────────────────────────────

function ChartTooltipCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/50 bg-surface-deep px-3 py-2 text-body shadow-lg elevation-floating">
      {children}
    </div>
  );
}

// ─── Spend trendline ─────────────────────────────────────────────────

function SpendTrendChart({ data }: { data: MonthBucket[] }) {
  if (data.length < 2) return null;
  return (
    <div style={{ height: 200 }} aria-label="Monthly spend trendline">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="aov-spend-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="hsl(var(--primary))" stopOpacity={0.28} />
              <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 9, fontFamily: "ui-monospace,monospace" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
            tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 9, fontFamily: "ui-monospace,monospace" }}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <Tooltip
            cursor={{ stroke: "rgba(255,255,255,0.08)", strokeWidth: 1 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0]?.payload as MonthBucket;
              return (
                <ChartTooltipCard>
                  <div className="font-semibold text-foreground mb-1">{label}</div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Spend</span>
                    <span className="font-mono tabular-nums text-foreground">{fmtUSD(d.spend, 0)}</span>
                  </div>
                  {d.results > 0 && (
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Results</span>
                      <span className="font-mono tabular-nums text-foreground">{fmtNum(d.results)}</span>
                    </div>
                  )}
                </ChartTooltipCard>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="spend"
            name="Spend"
            stroke="hsl(var(--primary))"
            strokeWidth={1.5}
            fill="url(#aov-spend-gradient)"
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0, fill: "hsl(var(--primary))" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Cell performance bar chart ───────────────────────────────────────

type CellSort = "spend" | "cpa";

interface CellBarItem {
  name: string;
  spend: number;
  cpa: number | null;
  results: number;
  resultType: string;
}

function CellPerfBars({ items, sortBy, resultNoun }: {
  items: CellBarItem[];
  sortBy: CellSort;
  resultNoun: string;
}) {
  if (items.length === 0) return null;
  const h = Math.min(items.length * 34 + 32, 300);
  return (
    <div style={{ height: h }} aria-label="Cell performance by spend">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={items}
          layout="vertical"
          margin={{ top: 0, right: 56, bottom: 4, left: 4 }}
          barSize={11}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
            tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 9, fontFamily: "ui-monospace,monospace" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={130}
            tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: string) => (v.length > 20 ? v.slice(0, 19) + "…" : v)}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0]?.payload as CellBarItem;
              return (
                <ChartTooltipCard>
                  <div className="font-semibold text-foreground mb-1 max-w-[220px] truncate">{d.name}</div>
                  <div className="space-y-0.5">
                    <div className="flex justify-between gap-4"><span className="text-muted-foreground">Spend</span><span className="font-mono tabular-nums text-foreground">{fmtUSD(d.spend, 0)}</span></div>
                    <div className="flex justify-between gap-4"><span className="text-muted-foreground">{resultNoun}</span><span className="font-mono tabular-nums text-foreground">{fmtNum(d.results)}</span></div>
                    <div className="flex justify-between gap-4"><span className="text-muted-foreground">CPA</span><span className="font-mono tabular-nums text-foreground">{d.cpa != null ? fmtUSD(d.cpa) : "—"}</span></div>
                    <div className="flex justify-between gap-4"><span className="text-muted-foreground">Type</span><span className="font-mono tabular-nums text-foreground">{eventLabel(d.resultType)}</span></div>
                  </div>
                </ChartTooltipCard>
              );
            }}
          />
          <Bar dataKey="spend" fill="hsl(var(--primary))" radius={[0, 3, 3, 0]} opacity={0.75} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Placement bar chart ──────────────────────────────────────────────

function PlacementBars({ placements, resultNoun }: {
  placements: PlacementRollup[];
  resultNoun: string;
}) {
  if (placements.length === 0) return null;
  const h = Math.min(placements.length * 34 + 32, 260);
  return (
    <div style={{ height: h }} aria-label="Spend by placement">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={placements}
          layout="vertical"
          margin={{ top: 0, right: 52, bottom: 4, left: 4 }}
          barSize={10}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
            tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 9, fontFamily: "ui-monospace,monospace" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="placement"
            width={118}
            tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: string) => (v.length > 18 ? v.slice(0, 17) + "…" : v)}
          />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0]?.payload as PlacementRollup;
              return (
                <ChartTooltipCard>
                  <div className="font-semibold text-foreground mb-1 max-w-[220px]">{d.placement}</div>
                  <div className="space-y-0.5">
                    <div className="flex justify-between gap-4"><span className="text-muted-foreground">Spend</span><span className="font-mono tabular-nums text-foreground">{fmtUSD(d.spend, 0)}</span></div>
                    <div className="flex justify-between gap-4"><span className="text-muted-foreground">{resultNoun}</span><span className="font-mono tabular-nums text-foreground">{fmtNum(d.results)}</span></div>
                    {d.cpa != null && <div className="flex justify-between gap-4"><span className="text-muted-foreground">CPA</span><span className="font-mono tabular-nums text-foreground">{fmtUSD(d.cpa)}</span></div>}
                    {d.ctr != null && <div className="flex justify-between gap-4"><span className="text-muted-foreground">Link CTR</span><span className="font-mono tabular-nums text-foreground">{fmtPct(d.ctr)}</span></div>}
                  </div>
                </ChartTooltipCard>
              );
            }}
          />
          <Bar dataKey="spend" fill="hsl(var(--metrix-cyan))" radius={[0, 3, 3, 0]} opacity={0.8} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Demographic heatmap grid ─────────────────────────────────────────
// Age rows × gender columns coloured by CPA intensity.
// Lower CPA = better = more green; higher CPA = worse = more amber.

function DemoHeatmapGrid({
  heatmap,
}: {
  heatmap: ReturnType<typeof buildDemoHeatmap>;
}) {
  const { cells, ages, genders, maxCpa, minCpa } = heatmap;
  if (cells.length === 0) return null;

  const getCell = (age: string, gender: string) =>
    cells.find((c) => c.age === age && c.gender === gender.toLowerCase());

  // 0 = bad (high CPA, amber), 1 = good (low CPA, emerald)
  function intensity(cpa: number | null): number {
    if (cpa == null || maxCpa === minCpa) return 0.5;
    return 1 - (cpa - minCpa) / (maxCpa - minCpa);
  }

  function cellBg(cpa: number | null): string {
    if (cpa == null) return "rgba(255,255,255,0.02)";
    const t = intensity(cpa);
    if (t >= 0.65) return `rgba(52,211,153,${0.08 + t * 0.26})`; // emerald
    if (t >= 0.35) return `rgba(99,102,241,${0.06 + t * 0.14})`; // indigo mid
    return `rgba(251,191,36,${0.06 + (1 - t) * 0.14})`; // amber
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[320px]">
        {/* Header */}
        <div
          className="grid gap-1 mb-1"
          style={{ gridTemplateColumns: `72px repeat(${genders.length}, 1fr)` }}
        >
          <div />
          {genders.map((g) => (
            <div key={g} className={cn(TYPE.label, "text-center capitalize py-1")}>{g}</div>
          ))}
        </div>
        {/* Rows */}
        {ages.map((age) => (
          <div
            key={age}
            className="grid gap-1 mb-1 items-stretch"
            style={{ gridTemplateColumns: `72px repeat(${genders.length}, 1fr)` }}
          >
            <div className={cn(TYPE.caption, "text-muted-foreground/70 flex items-center pr-2 truncate")}>{age}</div>
            {genders.map((gender) => {
              const cell = getCell(age, gender);
              return (
                <div
                  key={gender}
                  className="rounded-md px-1.5 py-2 text-center border border-white/[0.06] min-h-[44px] flex flex-col items-center justify-center"
                  style={{ backgroundColor: cellBg(cell?.cpa ?? null) }}
                  title={
                    cell
                      ? `${age} / ${gender}: ${cell.cpa != null ? fmtUSD(cell.cpa) + " CPA" : "no CPA"} · ${fmtUSD(cell.spend, 0)} spend · ${fmtNum(cell.results)} results`
                      : "No data"
                  }
                >
                  {cell ? (
                    <>
                      <div className="text-[10px] font-mono font-semibold tabular-nums text-foreground/85">
                        {cell.cpa != null ? fmtUSD(cell.cpa, 0) : "—"}
                      </div>
                      <div className="text-[8px] font-mono text-muted-foreground/50 mt-0.5 tabular-nums">
                        {fmtUSD(cell.spend, 0)}
                      </div>
                    </>
                  ) : (
                    <div className="text-[9px] text-muted-foreground/25">—</div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {/* Legend */}
        <div className="flex items-center justify-end gap-2 mt-2">
          <span className={cn(TYPE.label, "text-muted-foreground/45")}>CPA:</span>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: "rgba(251,191,36,0.25)" }} />
            <span className={cn(TYPE.label)}>High</span>
            <div className="w-10 h-1 rounded-full mx-0.5" style={{ background: "linear-gradient(to right, rgba(251,191,36,0.25), rgba(52,211,153,0.35))" }} />
            <span className={cn(TYPE.label)}>Low</span>
            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: "rgba(52,211,153,0.35)" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Compact variable table ───────────────────────────────────────────

type VarSortKey = "spend" | "cpa" | "ctr" | "results";

function CompactVariableTable({ rows }: { rows: VariablePerformanceRow[] }) {
  const [sortKey, setSortKey] = useState<VarSortKey>("spend");

  const sorted = useMemo(() => {
    // Deduplicate by variable_id (take highest-spend row per variable)
    const byId = new Map<string, VariablePerformanceRow>();
    for (const r of rows) {
      const ex = byId.get(r.variable_id);
      if (!ex || r["Amount spent (USD)"] > ex["Amount spent (USD)"]) byId.set(r.variable_id, r);
    }
    const arr = [...byId.values()];
    const asc = sortKey === "cpa";
    return arr
      .sort((a, b) => {
        const va = sortKey === "spend" ? a["Amount spent (USD)"]
                 : sortKey === "results" ? a.Results
                 : sortKey === "ctr" ? a.CTR_link_pct
                 : (a.CPA_result ?? Infinity);
        const vb = sortKey === "spend" ? b["Amount spent (USD)"]
                 : sortKey === "results" ? b.Results
                 : sortKey === "ctr" ? b.CTR_link_pct
                 : (b.CPA_result ?? Infinity);
        return asc ? va - vb : vb - va;
      })
      .slice(0, 8);
  }, [rows, sortKey]);

  if (sorted.length === 0) return null;

  const cols: { key: VarSortKey; label: string }[] = [
    { key: "spend",   label: "Spend" },
    { key: "results", label: "Results" },
    { key: "cpa",     label: "CPA" },
    { key: "ctr",     label: "CTR" },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border/30">
            <th className="text-left px-2 py-1.5 text-label font-mono uppercase tracking-widest text-muted-foreground/60 whitespace-nowrap">Variable</th>
            <th className="text-left px-2 py-1.5 text-label font-mono uppercase tracking-widest text-muted-foreground/60">Family</th>
            {cols.map((c) => (
              <th key={c.key} className="text-right px-2 py-1.5">
                <button
                  onClick={() => setSortKey(c.key)}
                  className={cn(
                    "text-label font-mono uppercase tracking-widest transition-colors whitespace-nowrap",
                    sortKey === c.key
                      ? "text-primary"
                      : "text-muted-foreground/60 hover:text-foreground/80",
                  )}
                >
                  {c.label}
                  {sortKey === c.key && <span className="ml-0.5 opacity-60">↓</span>}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr
              key={r.variable_id + i}
              className="border-b border-border/15 hover:bg-white/[0.02] transition-colors"
            >
              <td className="px-2 py-1.5 text-body font-medium text-foreground/90 whitespace-nowrap">{readableVariables(r.variable_id)}</td>
              <td className="px-2 py-1.5 text-caption text-muted-foreground/70 capitalize">{r.variable_family}</td>
              <td className="px-2 py-1.5 text-right text-body font-mono tabular-nums text-foreground/85">{fmtUSD(r["Amount spent (USD)"], 0)}</td>
              <td className="px-2 py-1.5 text-right text-body font-mono tabular-nums text-foreground/85">{fmtNum(r.Results)}</td>
              <td className="px-2 py-1.5 text-right text-body font-mono tabular-nums text-foreground/85">{r.CPA_result != null ? fmtUSD(r.CPA_result) : "—"}</td>
              <td className="px-2 py-1.5 text-right text-body font-mono tabular-nums text-foreground/85">{fmtPct(r.CTR_link_pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Sort toggle button ───────────────────────────────────────────────

function SortToggle({
  options,
  active,
  onSelect,
}: {
  options: { key: string; label: string }[];
  active: string;
  onSelect: (k: string) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 bg-white/[0.04] rounded-lg p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onSelect(o.key)}
          className={cn(
            "px-2.5 py-1 rounded-md text-label font-medium transition-colors whitespace-nowrap",
            active === o.key
              ? "bg-primary/20 text-primary"
              : "text-muted-foreground/60 hover:text-foreground/80",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────

export function AnalysisOverview() {
  const seed           = useMetrixSeed();
  const isRefetching   = useMetrixIsRefetching();
  const adAccountId    = useScopedAdAccountId();
  const account        = getAdAccount(seed, adAccountId);
  const { rangeHasData } = useDateRange();
  const analysis       = getAnalysisData(seed, adAccountId);
  const { range, narrowed, filterCells } = useCellRangeScope(analysis);

  const [cellSort, setCellSort] = useState<CellSort>("spend");

  return (
    <ModuleScopeGate section={SECTION} title="Analysis Overview" account={account}>
      {() => {
        const acct    = account!;
        const term    = resultTerm(acct);
        const summary = getCampaignSummary(seed, adAccountId);
        const a       = analysis;
        const controls = getCoreControls(seed, adAccountId);

        if (!summary || !a) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Analysis Overview" tabs="analysis" account={acct} />
              <PendingState
                title="No analysis yet"
                message="Analysis appears once performance data is connected or imported."
                icon={LineChart}
                action={<CrossLink to="/app/analysis/library" label="Import data or connect an account" />}
              />
            </div>
          );
        }

        // ── Range-scoped metric tiles ─────────────────────────────────
        const rollup      = a.concept_rollup ?? [];
        const rollupDates = (r: (typeof rollup)[number]) => ({ start: r.date_start, end: r.date_end });
        const scoped = narrowed
          ? {
              spend:      sumInRange(rollup, range, rollupDates, (r) => r.spend),
              linkClicks: sumInRange(rollup, range, rollupDates, (r) => r.link_clicks),
              results:    sumInRange(rollup, range, rollupDates, (r) => r.results),
              concepts:   rollup.filter((r) =>
                range && r.date_start && r.date_end &&
                !(r.date_end < range.start || r.date_start > range.end)
              ).length,
            }
          : null;
        const cellRowsInRange = filterCells(a.performance_by_cell).length;

        // ── MST lookup for control-name resolution ────────────────────
        const mst = getMST(seed, adAccountId);
        const lib = mst?.local_book2_library ?? [];
        const resolveConceptName = (id: string) =>
          lib.find((c) => c.cell_id === id)?.book2_concept_name ?? id;
        const resolveControlText = (text: string, id: string) => {
          const name = resolveConceptName(id);
          return name === id ? text : text.replace(id, name);
        };

        // ── Trend data (memoised inside render fn for simplicity) ─────
        const trendData = buildMonthlyTrend(rollup);

        // ── Result type donut data ────────────────────────────────────
        const resultTypeMap = new Map<string, number>();
        for (const r of a.performance_by_cell) {
          const key = eventLabel(r["Result type"]);
          resultTypeMap.set(key, (resultTypeMap.get(key) ?? 0) + r["Amount spent (USD)"]);
        }
        const resultTypePie = [...resultTypeMap.entries()]
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value);

        // ── Top cells ─────────────────────────────────────────────────
        const cellsInRange = filterCells(a.performance_by_cell);
        const sortedCells: CellBarItem[] = [...cellsInRange]
          .sort((x, y) =>
            cellSort === "spend"
              ? y["Amount spent (USD)"] - x["Amount spent (USD)"]
              : (x.CPA_result ?? Infinity) - (y.CPA_result ?? Infinity)
          )
          .slice(0, 10)
          .map((r) => ({
            name:       r.book2_concept_name ?? r.cell_id,
            spend:      r["Amount spent (USD)"],
            cpa:        r.CPA_result,
            results:    r.Results,
            resultType: r["Result type"],
          }));

        // ── Placements (top 6 by spend) ───────────────────────────────
        const allPlacements = rollupPlacements([
          ...a.v3_placement_signal,
          ...a.c4e_placement_signal,
        ])
          .sort((x, y) => y.spend - x.spend)
          .slice(0, 6);

        // ── Demographic heatmap ───────────────────────────────────────
        const heatmap = buildDemoHeatmap(a.demographic_registration_signal);

        // ── Sub-page jump-off cards ───────────────────────────────────
        const subpages = [
          {
            to: "/app/analysis/library",
            label: "IAP Library",
            Icon: Library,
            desc: "Cell and variable performance across the account.",
            stat: narrowed
              ? `${cellRowsInRange} cell rows in range · ${a.v3_variable_performance.length} variable rows`
              : `${a.performance_by_cell.length} cell rows · ${a.v3_variable_performance.length} variable rows`,
          },
          {
            to: "/app/analysis/audience",
            label: "Audience",
            Icon: Users,
            desc: `Demographic ${term.singular} signal by age and gender.`,
            stat: `${a.demographic_registration_signal.length} demographic rows`,
          },
          {
            to: "/app/analysis/placements",
            label: "Placements",
            Icon: LayoutGrid,
            desc: "Where delivery happened and what each placement produced.",
            stat: `${a.v3_placement_signal.length + a.c4e_placement_signal.length} placement rows`,
          },
          {
            to: "/app/analysis/budget",
            label: "Budget Insight",
            Icon: Wallet,
            desc: "Spend allocation by result event, concept, and placement.",
            stat: `${fmtUSD(summary.total_spend_usd, 0)} analyzed`,
          },
        ];

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Analysis Overview"
              subtitle="Performance reads · drill-in modules"
              table="campaign_summary, performance_by_cell"
              tabs="analysis"
              account={acct}
            />
            <RangeScopeBar grainNote="Campaign totals cover the account's full flight window — this import has no daily grain." />

            {!rangeHasData ? (
              <NoDataInRangeState what="analysis data" />
            ) : (
              <>
                {/* ── Metric tiles ─────────────────────────────────── */}
                {isRefetching ? (
                  <div className="px-6 pt-5">
                    <SkeletonTileRow count={4} />
                  </div>
                ) : (
                  <div className="px-6 pt-5 grid grid-cols-dashboard-4 gap-3">
                    {scoped ? (
                      <>
                        <MetricTile label="Spend (in range)"    value={fmtUSD(scoped.spend, 0)} sub="concept flights overlapping range" />
                        <MetricTile label="Link clicks (in range)" value={fmtNum(scoped.linkClicks)} />
                        <MetricTile label="Results (in range)"  value={fmtNum(scoped.results)} />
                        <MetricTile label="Concept flights"     value={String(scoped.concepts)} sub="overlapping selected range" />
                      </>
                    ) : (
                      <>
                        <MetricTile label="Total spend"   value={fmtUSD(summary.total_spend_usd, 0)} />
                        <MetricTile label="Impressions"   value={fmtNum(summary.total_impressions)} />
                        <MetricTile label="Link clicks"   value={fmtNum(summary.total_link_clicks)} />
                        <MetricTile label="Link CTR"      value={fmtPct(summary.overall_link_ctr_pct)} />
                      </>
                    )}
                  </div>
                )}

                <div className="px-6 py-5 space-y-4 max-w-5xl">
                  {summary.data_caveat && (
                    <div className="flex items-center gap-1">
                      <span className="text-label text-muted-foreground/60">Data window</span>
                      <InfoTooltip content={summary.data_caveat} />
                    </div>
                  )}

                  {/* ── Spend trendline + Result type donut ──────── */}
                  {(trendData.length >= 2 || resultTypePie.length > 0) && (
                    <div className="grid grid-cols-[1fr_220px] gap-3">
                      {trendData.length >= 2 && (
                        <SectionCard
                          title="Spend by month"
                          desc="Flight-window overlap per calendar month — not daily interpolation"
                        >
                          <SpendTrendChart data={trendData} />
                        </SectionCard>
                      )}
                      {resultTypePie.length > 0 && (
                        <SectionCard
                          title="By result type"
                          desc="Spend share across conversion event types"
                        >
                          <SharePieChart
                            data={resultTypePie}
                            unit="usd"
                            height={200}
                            showLegend={resultTypePie.length <= 4}
                          />
                        </SectionCard>
                      )}
                    </div>
                  )}

                  {/* ── Cell performance bar chart ────────────────── */}
                  {sortedCells.length > 0 && (
                    <SectionCard
                      title="Top cells by spend"
                      desc={`${term.Plural} · CPA · ${narrowed ? cellRowsInRange : a.performance_by_cell.length} cells total`}
                      right={
                        <div className="flex items-center gap-2">
                          <SortToggle
                            options={[
                              { key: "spend" as CellSort, label: "Spend" },
                              { key: "cpa"   as CellSort, label: "CPA" },
                            ]}
                            active={cellSort}
                            onSelect={(k) => setCellSort(k as CellSort)}
                          />
                          <CrossLink to="/app/analysis/library" label="All →" />
                        </div>
                      }
                    >
                      <CellPerfBars
                        items={sortedCells}
                        sortBy={cellSort}
                        resultNoun={term.Plural}
                      />
                    </SectionCard>
                  )}

                  {/* ── Variable table + Placement bars ───────────── */}
                  {(a.v3_variable_performance.length > 0 || allPlacements.length > 0) && (
                    <div className="grid grid-cols-2 gap-3">
                      {a.v3_variable_performance.length > 0 && (
                        <SectionCard
                          title="Variable performance"
                          desc="Hook · Tone · Framework · Concept — top 8 · click column to sort"
                          right={<CrossLink to="/app/analysis/library" label="Full →" />}
                        >
                          <CompactVariableTable rows={a.v3_variable_performance} />
                        </SectionCard>
                      )}
                      {allPlacements.length > 0 && (
                        <SectionCard
                          title="Top placements"
                          desc="V3 + C4E combined · spend · top 6"
                          right={<CrossLink to="/app/analysis/placements" label="Full →" />}
                        >
                          <PlacementBars
                            placements={allPlacements}
                            resultNoun={term.Plural}
                          />
                        </SectionCard>
                      )}
                    </div>
                  )}

                  {/* ── Demographic heatmap ───────────────────────── */}
                  {heatmap.cells.length > 0 && (
                    <SectionCard
                      title="Audience heatmap"
                      desc="Age × gender — cell colour = CPA (green = lower = better) · hover for detail"
                      right={<CrossLink to="/app/analysis/audience" label="Full →" />}
                    >
                      <DemoHeatmapGrid heatmap={heatmap} />
                    </SectionCard>
                  )}

                  {/* ── Core control reads ────────────────────────── */}
                  {controls && (
                    <SectionCard title="Core control reads" desc="Control creative · per funnel depth" table="core_reanalysis_read">
                      <div className="grid grid-cols-dashboard-2 gap-3">
                        <div className="rounded-xl border border-border/40 bg-white/[0.02] p-4">
                          <div className="text-label font-semibold uppercase tracking-[0.14em] text-muted-foreground/70 mb-1.5">Primary control</div>
                          <p className="text-title font-semibold text-foreground">{resolveConceptName(controls.primary_control)}</p>
                          <div className="mt-1.5">
                            {(() => {
                              const read = resolveControlText(controls.primary_control_read, controls.primary_control);
                              return (
                                <DetailReveal
                                  label={deriveLabel(read, 72)}
                                  labelClassName={TYPE.caption}
                                  eyebrow="Primary control"
                                  sections={[{ label: "Control read", text: read }]}
                                />
                              );
                            })()}
                          </div>
                          {resolveConceptName(controls.primary_control) !== controls.primary_control && (
                            <p className="text-[9px] font-mono text-muted-foreground/40 mt-1.5">{controls.primary_control}</p>
                          )}
                        </div>
                        {controls.registration_control && (() => {
                          const regId   = controls.registration_control!;
                          const regName = resolveConceptName(regId);
                          return (
                            <div className="rounded-xl border border-border/40 bg-white/[0.02] p-4">
                              <div className="text-label font-semibold uppercase tracking-[0.14em] text-muted-foreground/70 mb-1.5">{term.Singular} control</div>
                              <p className="text-title font-semibold text-foreground">{regName}</p>
                              {controls.registration_control_read && (() => {
                                const read = resolveControlText(controls.registration_control_read, regId);
                                return (
                                  <div className="mt-1.5">
                                    <DetailReveal
                                      label={deriveLabel(read, 72)}
                                      labelClassName={TYPE.caption}
                                      eyebrow={`${term.Singular} control`}
                                      sections={[{ label: "Control read", text: read }]}
                                    />
                                  </div>
                                );
                              })()}
                              {regName !== regId && (
                                <p className="text-[9px] font-mono text-muted-foreground/40 mt-1.5">{regId}</p>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </SectionCard>
                  )}

                  {/* ── Sub-page drill-in cards ───────────────────── */}
                  <SectionCard title="Analysis modules" desc="Same data · different slices">
                    <div className="grid grid-cols-dashboard-2 gap-3">
                      {subpages.map((s) => (
                        <div key={s.to} className="rounded-xl border border-border/40 bg-white/[0.02] p-4 flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <s.Icon className="w-3.5 h-3.5 text-primary" />
                            <span className="text-title font-semibold text-foreground">{s.label}</span>
                          </div>
                          <p className={TYPE.caption}>{s.desc}</p>
                          <div className="flex items-center justify-between mt-auto pt-1">
                            <span className="text-label font-mono text-muted-foreground/70">{s.stat}</span>
                            <CrossLink to={s.to} label="Open" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </SectionCard>

                  <div className="flex items-center gap-3 pt-1">
                    <LoopAction to="/app/strategy/overview" label="Continue to Strategy" icon="strategy" />
                  </div>
                </div>
              </>
            )}
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
