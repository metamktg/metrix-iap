// ─── Breakdown explorer (IAP Library → Breakdown tab) ─────────────────
// The Nocturne "Metrix v1" flexible cross-tab: three independent
// selectors — Dimension × Metric × Chart form (ranked bars / donut /
// funnel-shaped ranked view) — plus a ranked table that always mirrors
// the chart (it doubles as the accessible table view). Every segment
// chains into the deep-dive module stack when the provider is mounted.
//
// Data honesty is inherited, not re-implemented: rows come from
// buildAccountBreakdown (summed-numerator ÷ summed-denominator),
// dimension × metric restrictions surface their reason instead of
// rendering zeros, and under a narrowed run selection only cell/concept
// dimensions are offered (the other dimensions' source rows are
// account-wide — same rule as the KPI drill-down modal).
//
// Chart color encodes MAGNITUDE, not identity: one hue (the DS
// interactive token) at stepped opacity, identity carried by direct
// labels — so there is no categorical palette to validate here.

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, BarChart3, ChartPie, Filter, Info } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Cell as RechartsCell, LabelList, PieChart, Pie } from "recharts";
import { ChartContainer, type ChartConfig } from "@workspace/command-deck/components/ui/chart";
import { cn } from "@workspace/command-deck/lib/utils";
import { TYPE } from "@/pages/metrix/typography";
import { fmtUSD, fmtNum } from "@/pages/metrix/shared";
import type { AnalysisData, CellPerformanceRow } from "@/lib/data/seedTypes";
import type { MetricDef } from "@/lib/data/metricsCatalog";
import {
  buildAccountBreakdown, listBreakdownDimensions, dimensionMetricRestriction,
  sortBreakdownRows, lowerIsBetter,
  type BreakdownRow,
} from "@/lib/data/kpiBreakdown";
import { useDeepDive } from "@/contexts/DeepDiveContext";
import { buildSegmentModule } from "@/lib/data/deepDive";
import { SegmentHoverPreview } from "./SegmentHoverPreview";

const CHART_CONFIG: ChartConfig = { value: { label: "Value", color: "hsl(var(--interactive))" } };

type ChartForm = "bar" | "donut" | "funnel";

// ─── Small controls (same idiom as KpiDrilldownModal) ─────────────────

function ControlSelect({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
}) {
  return (
    <label className="flex items-center gap-1.5 min-w-0">
      <span className={cn(TYPE.label, "font-mono uppercase tracking-widest text-muted-foreground/50 shrink-0")}>{label}</span>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 max-w-[220px] truncate rounded-md border border-border/50 bg-[hsl(var(--surface-raised))] px-2 text-caption text-foreground/85 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function ChartFormToggle({ form, onChange }: { form: ChartForm; onChange: (f: ChartForm) => void }) {
  const items = [
    ["bar", "Ranked bars", BarChart3],
    ["donut", "Donut (share)", ChartPie],
    ["funnel", "Funnel-shaped ranking", Filter],
  ] as const;
  return (
    <div role="group" aria-label="Chart form" className="inline-flex rounded-md border border-border/50 overflow-hidden">
      {items.map(([id, label, Icon]) => (
        <button
          key={id}
          type="button"
          aria-pressed={form === id}
          aria-label={label}
          onClick={() => onChange(id)}
          className={cn(
            "px-2 py-1 transition-colors",
            form === id ? "bg-primary/15 text-interactive" : "text-muted-foreground/50 hover:text-foreground/75",
          )}
        >
          <Icon className="w-3.5 h-3.5" aria-hidden />
        </button>
      ))}
    </div>
  );
}

// ─── Chart forms — single hue, stepped opacity (magnitude, not identity) ──

function RankedBars({ rows }: { rows: BreakdownRow[] }) {
  const charted = rows.filter((r) => r.value != null).slice(0, 12);
  const data = charted.map((r) => ({
    name: r.label.length > 22 ? r.label.slice(0, 21) + "…" : r.label,
    value: r.value as number,
    display: r.formatted,
  }));
  if (data.length === 0) return null;
  const h = Math.min(Math.max(data.length * 30 + 16, 90), 340);
  return (
    <ChartContainer config={CHART_CONFIG} className="aspect-auto w-full" style={{ height: h }}>
      <BarChart layout="vertical" data={data} margin={{ top: 0, right: 56, bottom: 0, left: 0 }} barSize={12}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="name"
          width={140}
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontFamily: "inherit", opacity: 0.9 }}
          tickLine={false}
          axisLine={false}
        />
        <Bar dataKey="value" radius={[0, 3, 3, 0]}>
          {data.map((_, i) => (
            <RechartsCell key={i} fill="hsl(var(--interactive))" fillOpacity={Math.max(0.95 - i * 0.06, 0.35)} />
          ))}
          <LabelList
            dataKey="display"
            position="right"
            style={{ fontSize: 10, fill: "hsl(var(--foreground))", opacity: 0.9, fontFamily: "inherit", fontWeight: 500 }}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

const DONUT_MAX_SEGMENTS = 8;

function DonutShare({ rows }: { rows: BreakdownRow[] }) {
  // Donut = share of the metric's total. Only additive metrics make an
  // honest share; the caller gates this form to additive metrics.
  const valued = rows.filter((r) => (r.value ?? 0) > 0);
  const top = valued.slice(0, DONUT_MAX_SEGMENTS);
  const rest = valued.slice(DONUT_MAX_SEGMENTS);
  const data = [
    ...top.map((r) => ({ name: r.label, value: r.value as number, display: r.formatted })),
    ...(rest.length > 0
      ? [{ name: `Other (${rest.length})`, value: rest.reduce((s, r) => s + (r.value as number), 0), display: "" }]
      : []),
  ];
  if (data.length === 0) return null;
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex items-center gap-5 flex-wrap">
      <ChartContainer config={CHART_CONFIG} className="aspect-square w-[180px] shrink-0">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={52}
            outerRadius={82}
            paddingAngle={2}
            stroke="hsl(var(--surface-deep))"
            strokeWidth={2}
          >
            {data.map((_, i) => (
              <RechartsCell key={i} fill="hsl(var(--interactive))" fillOpacity={Math.max(0.95 - i * 0.1, 0.25)} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      {/* Direct-label list — identity never rides on the fill alone. */}
      <ul className="space-y-1 min-w-0 flex-1" data-testid="breakdown-donut-legend">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2 min-w-0">
            <span
              aria-hidden
              className="w-2.5 h-2.5 rounded-sm shrink-0 bg-[hsl(var(--interactive))]"
              style={{ opacity: Math.max(0.95 - i * 0.1, 0.25) }}
            />
            <span className={cn(TYPE.body, "truncate min-w-0 text-foreground/85")}>{d.name}</span>
            <span className={cn(TYPE.body, "tabular-nums ml-auto shrink-0 text-foreground/70")}>
              {total > 0 ? `${((d.value / total) * 100).toFixed(1)}%` : "n/a"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FunnelRanking({ rows }: { rows: BreakdownRow[] }) {
  const valued = rows.filter((r) => r.value != null).slice(0, 12);
  const max = Math.max(...valued.map((r) => r.value as number), 0);
  if (valued.length === 0 || max <= 0) return null;
  return (
    <div className="space-y-1" data-testid="breakdown-funnel">
      {valued.map((r, i) => {
        const pct = Math.max(((r.value as number) / max) * 100, 6);
        return (
          <div key={r.key} className="flex items-center gap-3">
            <span className={cn(TYPE.label, "w-32 shrink-0 truncate text-muted-foreground/70 normal-case tracking-normal text-right")} title={r.label}>
              {r.label}
            </span>
            <div className="flex-1 flex justify-center">
              <div
                className="h-5 rounded-[3px] bg-[hsl(var(--interactive))] flex items-center justify-center min-w-0"
                style={{ width: `${pct}%`, opacity: Math.max(0.95 - i * 0.06, 0.35) }}
              />
            </div>
            <span className={cn(TYPE.body, "w-20 shrink-0 tabular-nums text-foreground/80")}>{r.formatted}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Mirrored ranked table (always rendered — the accessible view) ────

function MirrorTable({ rows, metricLabel, dimensionLabel, onDrillSegment }: {
  rows: BreakdownRow[];
  metricLabel: string;
  dimensionLabel: string;
  onDrillSegment?: (row: BreakdownRow) => void;
}) {
  return (
    <div className="rounded-lg border border-border/40 overflow-hidden" data-testid="breakdown-table">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-border/30">
            <th className={cn(TYPE.label, "px-3 py-1.5 text-muted-foreground/50 uppercase tracking-widest font-medium")}>Segment</th>
            <th className={cn(TYPE.label, "px-3 py-1.5 text-muted-foreground/50 uppercase tracking-widest font-medium text-right")}>{metricLabel}</th>
            <th className={cn(TYPE.label, "px-3 py-1.5 text-muted-foreground/50 uppercase tracking-widest font-medium text-right")}>Spend</th>
            <th className={cn(TYPE.label, "px-3 py-1.5 text-muted-foreground/50 uppercase tracking-widest font-medium text-right")}>Results</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-border/15 last:border-b-0">
              <td className={cn(TYPE.body, "px-3 py-1.5 text-foreground/85 font-medium max-w-[240px] truncate")} title={r.note ?? r.label}>
                <SegmentHoverPreview kicker={dimensionLabel} metricLabel={metricLabel} row={r} drillable={!!onDrillSegment}>
                  {onDrillSegment ? (
                    <button
                      type="button"
                      onClick={() => onDrillSegment(r)}
                      className="text-left truncate max-w-full text-interactive hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded"
                      data-testid={`breakdown-segment-${r.key}`}
                      aria-label={`Open the deep dive for ${r.label}`}
                    >
                      {r.label}
                    </button>
                  ) : (
                    <span>{r.label}</span>
                  )}
                </SegmentHoverPreview>
              </td>
              <td className={cn(TYPE.body, "px-3 py-1.5 tabular-nums text-right", r.value == null ? "text-muted-foreground/40" : "text-foreground font-semibold")}>
                {r.formatted}
              </td>
              <td className={cn(TYPE.body, "px-3 py-1.5 tabular-nums text-right text-foreground/60")}>
                {r.spend != null ? fmtUSD(r.spend, 0) : "n/a"}
              </td>
              <td className={cn(TYPE.body, "px-3 py-1.5 tabular-nums text-right text-foreground/60")}>
                {r.results != null ? fmtNum(r.results) : "n/a"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NoticeNote({ children, testid }: { children: React.ReactNode; testid?: string }) {
  return (
    <div className="flex items-start gap-2 text-caption text-muted-foreground/70 leading-relaxed rounded-lg border border-border/30 bg-white/[0.02] p-3" data-testid={testid}>
      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
      <span>{children}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────

/** Metric ids whose values are additive counts/sums — the only ones a share donut can honestly show. */
function isAdditiveMetric(metricId: string): boolean {
  return (
    metricId === "spend" || metricId === "impressions" || metricId === "reach" ||
    metricId === "clicks_all" || metricId === "link_clicks" || metricId === "results" ||
    metricId.startsWith("result:")
  );
}

export interface BreakdownExplorerProps {
  analysis: AnalysisData;
  catalog: MetricDef[];
  /** Cell rows pre-scoped by the active metric selection + run scope. */
  scopedCellRows?: CellPerformanceRow[];
  /** True when a narrowed run selection is active — non-cell dimensions withheld (modal rule). */
  scopeNarrowed?: boolean;
  windowLabel?: string;
}

export function BreakdownExplorer({
  analysis, catalog, scopedCellRows, scopeNarrowed = false, windowLabel,
}: BreakdownExplorerProps) {
  const allDimensions = useMemo(() => listBreakdownDimensions(analysis), [analysis]);
  const dimensions = useMemo(
    () => (scopeNarrowed ? allDimensions.filter((d) => d.id === "cell" || d.id === "concept") : allDimensions),
    [allDimensions, scopeNarrowed],
  );
  const withheldCount = allDimensions.length - dimensions.length;

  const [dimensionId, setDimensionId] = useState<string>("concept");
  useEffect(() => {
    if (dimensions.length > 0 && !dimensions.some((d) => d.id === dimensionId)) {
      setDimensionId(dimensions[0].id);
    }
  }, [dimensions, dimensionId]);

  const [metricId, setMetricId] = useState<string>(catalog[0]?.id ?? "spend");
  useEffect(() => {
    if (catalog.length > 0 && !catalog.some((m) => m.id === metricId)) {
      setMetricId(catalog[0].id);
    }
  }, [catalog, metricId]);

  const [form, setForm] = useState<ChartForm>("bar");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  useEffect(() => {
    setSortDir(lowerIsBetter(metricId) ? "asc" : "desc");
  }, [metricId]);

  const dimension = dimensions.find((d) => d.id === dimensionId) ?? null;
  const restriction = dimensionMetricRestriction(dimensionId, metricId);
  const rows = useMemo(
    () =>
      dimension && !restriction
        ? sortBreakdownRows(buildAccountBreakdown(analysis, dimensionId, metricId, scopedCellRows), sortDir)
        : [],
    [analysis, dimension, dimensionId, metricId, restriction, scopedCellRows, sortDir],
  );
  const hasValues = rows.some((r) => r.value != null);

  // Donut needs an additive metric to make an honest share-of-total.
  const donutBlocked = form === "donut" && !isAdditiveMetric(metricId);

  // ── Deep-dive chaining ──────────────────────────────────────────────
  const deepDive = useDeepDive();
  const onDrillSegment =
    deepDive.enabled && dimension
      ? (row: BreakdownRow) => {
          deepDive.push(
            buildSegmentModule({
              analysis, dimension, segmentKey: row.key, catalog, scopedCellRows, windowLabel,
            }),
          );
        }
      : undefined;

  const metric = catalog.find((m) => m.id === metricId);
  const metricLabel = metric?.label ?? metricId;

  return (
    <div className="space-y-4" data-testid="breakdown-explorer">
      {/* ── Selector row: Dimension × Metric × Chart form ───────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <ControlSelect
          label="Dimension"
          value={dimensionId}
          onChange={setDimensionId}
          options={dimensions.map((d) => ({ id: d.id, label: d.label }))}
        />
        <ControlSelect
          label="Metric"
          value={metricId}
          onChange={setMetricId}
          options={catalog.map((m) => ({ id: m.id, label: m.label }))}
        />
        <ChartFormToggle form={form} onChange={setForm} />
        <button
          type="button"
          onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
          aria-label={sortDir === "desc" ? "Sorted descending — switch to ascending" : "Sorted ascending — switch to descending"}
          className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border/50 text-caption text-foreground/75 hover:text-foreground transition-colors"
        >
          {sortDir === "desc" ? <ArrowDown className="w-3 h-3" aria-hidden /> : <ArrowUp className="w-3 h-3" aria-hidden />}
          {sortDir === "desc" ? "High → low" : "Low → high"}
        </button>
      </div>

      {/* ── Scoping / restriction notices (modal-rule parity) ───────── */}
      {scopeNarrowed && withheldCount > 0 && (
        <NoticeNote testid="breakdown-scoped-note">
          A narrowed run selection is active. Variable, avatar, placement, and conversion breakdowns are
          account-wide in this import and can't be honestly restricted to the selection, so only concept and
          creative-cell breakdowns are offered here. Switch back to all data to explore every dimension.
        </NoticeNote>
      )}
      {restriction && <NoticeNote testid="breakdown-restriction">{restriction}</NoticeNote>}
      {!restriction && donutBlocked && (
        <NoticeNote testid="breakdown-donut-blocked">
          A share-of-total donut only makes sense for additive metrics (spend, impressions, clicks, results).
          {" "}{metricLabel} is a ratio — its segments don't sum to a meaningful total, so the donut is withheld.
          The ranked bars and table below stay available.
        </NoticeNote>
      )}

      {/* ── Chart + mirrored table ──────────────────────────────────── */}
      {!restriction && (
        rows.length === 0 || !hasValues ? (
          <div className="py-8 text-center space-y-1.5" data-testid="breakdown-empty">
            <p className="text-title font-medium text-foreground/60">No segment data for this selection</p>
            <p className="text-caption text-muted-foreground/60 max-w-sm mx-auto leading-relaxed">
              No rows back this metric for the selected dimension in the current import — values that can't be
              honestly computed show as n/a, never zero.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {form === "bar" && <RankedBars rows={rows} />}
            {form === "donut" && !donutBlocked && <DonutShare rows={rows} />}
            {form === "funnel" && <FunnelRanking rows={rows} />}
            <MirrorTable rows={rows} metricLabel={metricLabel} dimensionLabel={dimension?.label ?? "Segment"} onDrillSegment={onDrillSegment} />
          </div>
        )
      )}
    </div>
  );
}
