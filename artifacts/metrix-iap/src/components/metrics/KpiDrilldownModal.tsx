// ─── KPI drill-down modal ──────────────────────────────────────────────
// The single modal every unified KPI tile opens (replaces the old
// MetricDiagnosticModal). Two scopes:
//   manager — the selected metric broken down per ad account: ranked bar
//     comparison + sortable table, each account's own reporting window
//     labeled on its row, coverage disclosure, and an optional "common
//     overlap window" mode that re-fetches every account's daterange
//     summary over the shared window (honest empty state when none).
//   account — customizable explorer: metric switcher, breakdown dimension
//     (concepts, cells, variable families, avatar segments, placements,
//     platforms, conversion-basis device/platform/placement), sort
//     direction, chart/table toggle. Conversion-basis dimensions never
//     mix with delivery metrics (tracking-basis rule).
//
// Blended ratios are always summed-numerator ÷ summed-denominator (see
// kpiBreakdown.ts) and unavailable values render "n/a" — never zero.

import { useEffect, useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  ArrowDown, ArrowUp, BarChart3, Info, Table2,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Cell as RechartsCell, LabelList } from "recharts";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@workspace/command-deck/components/ui/dialog";
import { ChartContainer, type ChartConfig } from "@workspace/command-deck/components/ui/chart";
import { Switch } from "@workspace/command-deck/components/ui/switch";
import { cn } from "@workspace/command-deck/lib/utils";
import { getGetAnalysisSummaryByDateRangeQueryOptions } from "@workspace/api-client-react";
import { TYPE } from "@/pages/metrix/typography";
import type { AdAccount, AnalysisData, CellPerformanceRow } from "@/lib/data/seedTypes";
import { metricById, type MetricDef } from "@/lib/data/metricsCatalog";
import {
  buildManagerBreakdown, buildAccountBreakdown, listBreakdownDimensions,
  dimensionMetricRestriction, sortBreakdownRows, computeOverlapWindow,
  accountReportingWindow, metricValueFromTotals, formatBreakdownValue,
  lowerIsBetter, fmtWindowLabel,
  type BreakdownRow,
} from "@/lib/data/kpiBreakdown";
import { fmtUSD, fmtNum } from "@/pages/metrix/shared";

const CHART_CONFIG: ChartConfig = { value: { label: "Value", color: "hsl(var(--interactive))" } };

// ─── Small controls ───────────────────────────────────────────────────

function ControlSelect({
  label, value, onChange, options,
}: {
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

function ViewToggle({ view, onChange }: { view: "chart" | "table"; onChange: (v: "chart" | "table") => void }) {
  return (
    <div role="group" aria-label="View as" className="inline-flex rounded-md border border-border/50 overflow-hidden">
      {([["chart", BarChart3], ["table", Table2]] as const).map(([id, Icon]) => (
        <button
          key={id}
          type="button"
          aria-pressed={view === id}
          aria-label={id === "chart" ? "Chart view" : "Table view"}
          onClick={() => onChange(id)}
          className={cn(
            "px-2 py-1 transition-colors",
            view === id ? "bg-primary/15 text-interactive" : "text-muted-foreground/50 hover:text-foreground/75",
          )}
        >
          <Icon className="w-3.5 h-3.5" />
        </button>
      ))}
    </div>
  );
}

function SortToggle({ dir, onChange }: { dir: "asc" | "desc"; onChange: (d: "asc" | "desc") => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(dir === "desc" ? "asc" : "desc")}
      aria-label={dir === "desc" ? "Sorted descending — switch to ascending" : "Sorted ascending — switch to descending"}
      className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border/50 text-caption text-foreground/75 hover:text-foreground transition-colors"
    >
      {dir === "desc" ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />}
      {dir === "desc" ? "High → low" : "Low → high"}
    </button>
  );
}

// ─── Ranked bar chart ─────────────────────────────────────────────────

function BreakdownBars({ rows }: { rows: BreakdownRow[] }) {
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

// ─── Sortable table ───────────────────────────────────────────────────

function BreakdownTable({ rows, metricLabel, showWindows }: {
  rows: BreakdownRow[];
  metricLabel: string;
  showWindows: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/40 overflow-hidden" data-testid="kpi-drilldown-table">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-border/30">
            <th className={cn(TYPE.label, "px-3 py-1.5 text-muted-foreground/50 uppercase tracking-widest font-medium")}>Segment</th>
            <th className={cn(TYPE.label, "px-3 py-1.5 text-muted-foreground/50 uppercase tracking-widest font-medium text-right")}>{metricLabel}</th>
            <th className={cn(TYPE.label, "px-3 py-1.5 text-muted-foreground/50 uppercase tracking-widest font-medium text-right")}>Spend</th>
            <th className={cn(TYPE.label, "px-3 py-1.5 text-muted-foreground/50 uppercase tracking-widest font-medium text-right")}>Results</th>
            {showWindows && (
              <th className={cn(TYPE.label, "px-3 py-1.5 text-muted-foreground/50 uppercase tracking-widest font-medium text-right")}>Window</th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-border/15 last:border-b-0">
              <td className={cn(TYPE.body, "px-3 py-1.5 text-foreground/85 font-medium max-w-[240px] truncate")} title={r.note ?? r.label}>
                {r.label}
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
              {showWindows && (
                <td className={cn(TYPE.label, "px-3 py-1.5 font-mono tabular-nums text-right text-muted-foreground/55 whitespace-nowrap")}>
                  {r.windowLabel}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Empty / notice states ────────────────────────────────────────────

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="py-8 text-center space-y-1.5" data-testid="kpi-drilldown-empty">
      <p className="text-title font-medium text-foreground/60">{title}</p>
      <p className="text-caption text-muted-foreground/60 max-w-sm mx-auto leading-relaxed">{message}</p>
    </div>
  );
}

function NoticeNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-caption text-muted-foreground/70 leading-relaxed rounded-lg border border-border/30 bg-white/[0.02] p-3">
      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────

export interface KpiDrilldownModalProps {
  open: boolean;
  onClose: () => void;
  scope: "manager" | "account";
  /** Tile metric the modal opened with (switchable inside the modal). */
  metricId: string | null;
  catalog: MetricDef[];
  /** Manager scope: configured + unconfigured accounts (unconfigured are skipped). */
  accounts?: AdAccount[];
  /** Account scope: this account's analysis bundle. */
  analysis?: AnalysisData | null;
  /** Account scope: cell rows pre-scoped by the active window/run selection. */
  scopedCellRows?: CellPerformanceRow[];
  /**
   * Account scope: true when the caller has an active narrowed window,
   * run, or preset selection. Only cell/concept breakdowns honor that
   * scoping (they run off scopedCellRows); every other dimension's rows
   * are account-wide, so while narrowed those dimensions are withheld
   * rather than silently presenting full-flight numbers under a
   * restricted-window label.
   */
  scopeNarrowed?: boolean;
  /** Which data window / analysis run the numbers come from (header indicator). */
  windowLabel?: string;
}

export function KpiDrilldownModal({
  open, onClose, scope, metricId, catalog,
  accounts = [], analysis = null, scopedCellRows, scopeNarrowed = false, windowLabel,
}: KpiDrilldownModalProps) {
  // Metric is switchable inside the modal; re-sync to the opening tile.
  const [activeMetricId, setActiveMetricId] = useState<string | null>(metricId);
  useEffect(() => {
    if (open) setActiveMetricId(metricId);
  }, [open, metricId]);

  // Under a narrowed window/run/preset, only cell/concept rows can be
  // scoped to match the tile (via scopedCellRows). Other dimensions'
  // source rows are account-wide — offering them here would show
  // full-flight numbers under a restricted-window label, so they are
  // withheld until the user returns to the all-data view.
  const allDimensions = useMemo(() => listBreakdownDimensions(analysis), [analysis]);
  const dimensions = useMemo(
    () => (scopeNarrowed ? allDimensions.filter((d) => d.id === "cell" || d.id === "concept") : allDimensions),
    [allDimensions, scopeNarrowed],
  );
  const withheldCount = allDimensions.length - dimensions.length;
  const [dimensionId, setDimensionId] = useState<string>("concept");
  useEffect(() => {
    if (open && dimensions.length > 0 && !dimensions.some((d) => d.id === dimensionId)) {
      setDimensionId(dimensions[0].id);
    }
  }, [open, dimensions, dimensionId]);

  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [view, setView] = useState<"chart" | "table">("chart");
  const [overlapOn, setOverlapOn] = useState(false);
  useEffect(() => {
    if (open && metricId) setSortDir(lowerIsBetter(metricId) ? "asc" : "desc");
  }, [open, metricId]);

  const metric = activeMetricId ? metricById(catalog, activeMetricId) : null;
  const mid = activeMetricId ?? "";

  // ── Manager scope data ──────────────────────────────────────────────
  const configuredAccounts = useMemo(
    () => accounts.filter((a) => a.status === "configured" && a.iap?.campaign_summary),
    [accounts],
  );
  const overlapWindow = useMemo(
    () => computeOverlapWindow(configuredAccounts.map(accountReportingWindow)),
    [configuredAccounts],
  );

  // Common-overlap mode: re-fetch each account's summary over the shared
  // window (daily-grain daterange API). Only while open + toggled + possible.
  const overlapQueries = useQueries({
    queries: configuredAccounts.map((a) => ({
      ...getGetAnalysisSummaryByDateRangeQueryOptions(a.id, overlapWindow?.start ?? "", overlapWindow?.end ?? ""),
      enabled: open && scope === "manager" && overlapOn && overlapWindow != null,
      retry: false,
    })),
  });
  const overlapLoading = overlapOn && overlapWindow != null && overlapQueries.some((q) => q.isLoading && q.fetchStatus !== "idle");

  const managerRows = useMemo<BreakdownRow[]>(() => {
    if (scope !== "manager" || !mid) return [];
    if (!overlapOn || overlapWindow == null) return buildManagerBreakdown(configuredAccounts, mid);
    // Overlap mode: value each account over the SAME window from its
    // daterange summary; accounts with no data there stay honest n/a.
    return configuredAccounts.map((a, i) => {
      const q = overlapQueries[i];
      const totals = q?.data?.totals;
      let value: number | null = null;
      let note: string | undefined;
      let spend: number | null = null;
      let results: number | null = null;
      if (q?.isError) {
        note = "Daily-grain data is not available for this account over the overlap window.";
      } else if (totals) {
        const events = Object.entries(totals.bottom_line_totals ?? {});
        const eventKey = mid.startsWith("result:") ? mid.slice("result:".length) : null;
        const scoped = eventKey ? events.filter(([k]) => k === eventKey) : events;
        const sum = (pick: (e: { reach: number; clicks_all: number; results: number }) => number) =>
          scoped.length > 0 ? scoped.reduce((s, [, e]) => s + pick(e as any), 0) : null;
        results = sum((e) => e.results);
        spend = eventKey ? (scoped.length > 0 ? scoped.reduce((s, [, e]) => s + (e as any).spend, 0) : null) : totals.total_spend_usd;
        value = metricValueFromTotals(mid, {
          spend,
          impressions: eventKey ? sum((e) => (e as any).impressions) : totals.total_impressions,
          reach: sum((e) => e.reach),
          clicksAll: sum((e) => e.clicks_all),
          linkClicks: eventKey ? sum((e) => (e as any).link_clicks) : totals.total_link_clicks,
          results,
        });
        if (value == null) note = "No data for this metric in the overlap window.";
      }
      return {
        key: a.id,
        label: a.name,
        value,
        formatted: formatBreakdownValue(mid, value),
        spend, results,
        windowLabel: fmtWindowLabel(overlapWindow),
        note,
      };
    });
  }, [scope, mid, overlapOn, overlapWindow, configuredAccounts, overlapQueries]);

  // ── Account scope data ──────────────────────────────────────────────
  const restriction = scope === "account" && mid ? dimensionMetricRestriction(dimensionId, mid) : null;
  const accountRows = useMemo<BreakdownRow[]>(
    () => (scope === "account" && analysis && mid && !restriction
      ? buildAccountBreakdown(analysis, dimensionId, mid, scopedCellRows)
      : []),
    [scope, analysis, dimensionId, mid, restriction, scopedCellRows],
  );

  const rows = useMemo(
    () => sortBreakdownRows(scope === "manager" ? managerRows : accountRows, sortDir),
    [scope, managerRows, accountRows, sortDir],
  );

  if (!metric) return null;
  const metricOptions = catalog.map((m) => ({ id: m.id, label: m.label }));
  const dimensionOptions = dimensions.map((d) => ({ id: d.id, label: d.label }));
  const hasValues = rows.some((r) => r.value != null);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="max-w-3xl bg-surface-deep border-border/50 max-h-[85vh] overflow-y-auto"
        data-testid="kpi-drilldown-modal"
      >
        <DialogHeader className="text-left space-y-1">
          <div className="text-label font-mono text-muted-foreground/60 uppercase tracking-widest">
            {scope === "manager" ? "Metric breakdown · by ad account" : "Metric breakdown"}
          </div>
          <DialogTitle className="text-callout font-semibold text-foreground">{metric.label}</DialogTitle>
          <DialogDescription className="text-caption text-muted-foreground/70 leading-relaxed">
            {scope === "manager"
              ? "The selected metric per configured ad account. Blended ratios are computed from summed numerators and denominators — never averaged."
              : "Segmented view of this metric across the account's analysis dimensions."}
          </DialogDescription>
          {/* Window / run indicator */}
          <div className="text-label font-mono text-muted-foreground/55 tracking-wide" data-testid="kpi-drilldown-window">
            {scope === "manager"
              ? overlapOn && overlapWindow != null
                ? `Common overlap window · ${fmtWindowLabel(overlapWindow)}`
                : "Each account's native reporting window (labeled per row)"
              : `Data window · ${windowLabel ?? "full available data"}`}
          </div>
        </DialogHeader>

        {/* ── Controls row ─────────────────────────────────────────── */}
        <div className="flex items-center gap-3 flex-wrap">
          <ControlSelect label="Metric" value={metric.id} onChange={setActiveMetricId} options={metricOptions} />
          {scope === "account" && dimensionOptions.length > 0 && (
            <ControlSelect label="Breakdown" value={dimensionId} onChange={setDimensionId} options={dimensionOptions} />
          )}
          <SortToggle dir={sortDir} onChange={setSortDir} />
          <ViewToggle view={view} onChange={setView} />
          {scope === "manager" && (
            <label className="inline-flex items-center gap-1.5 ml-auto">
              <span className={cn(TYPE.label, "font-mono uppercase tracking-widest text-muted-foreground/50")}>Common overlap window</span>
              <Switch
                aria-label="Restrict all accounts to their common overlap window"
                checked={overlapOn}
                onCheckedChange={setOverlapOn}
              />
            </label>
          )}
        </div>

        {/* ── Manager coverage disclosure ──────────────────────────── */}
        {scope === "manager" && !overlapOn && (
          <NoticeNote>
            <span data-testid="window-coverage-disclosure">
              Window coverage: connected accounts report over different date windows — each row is valued over its
              own window (shown per row). Cross-account totals blend these windows; ratio metrics are summed
              numerators ÷ summed denominators. Use the overlap toggle to restrict every account to the shared range.
            </span>
          </NoticeNote>
        )}
        {scope === "manager" && overlapOn && overlapWindow == null && (
          <EmptyState
            title="No common overlap window"
            message="The connected accounts' reporting windows don't intersect (or no account has a dated window), so an apples-to-apples comparison over one shared range isn't possible. Showing nothing is more honest than silently forcing mismatched windows into one number."
          />
        )}
        {scope === "manager" && overlapOn && overlapWindow != null && overlapLoading && (
          <div className="py-6 text-center text-caption text-muted-foreground/55 animate-pulse" data-testid="kpi-drilldown-loading">
            Loading each account's data over {fmtWindowLabel(overlapWindow)}…
          </div>
        )}

        {/* ── Account tracking-basis restriction ───────────────────── */}
        {scope === "account" && restriction && <NoticeNote>{restriction}</NoticeNote>}
        {scope === "account" && scopeNarrowed && withheldCount > 0 && (
          <NoticeNote>
            <span data-testid="scoped-dimensions-note">
              A narrowed window/run selection is active. Variable, avatar, placement, and conversion breakdowns
              are account-wide in this import and can't be honestly restricted to the selection, so only
              concept and creative-cell breakdowns (which follow the selection) are offered here. Switch back
              to all data to explore every dimension.
            </span>
          </NoticeNote>
        )}

        {/* ── Body ─────────────────────────────────────────────────── */}
        {!(scope === "manager" && overlapOn && (overlapWindow == null || overlapLoading)) && !restriction && (
          rows.length === 0 || !hasValues ? (
            <EmptyState
              title="No segment data for this metric"
              message={
                scope === "manager"
                  ? "No configured account can compute this metric over the selected window."
                  : scopeNarrowed
                    ? "No rows can be honestly scoped to the active window/run/preset selection for this breakdown — switch back to all data for the full segment view. Values that can't be honestly computed show as n/a, never zero."
                    : "No rows back this metric for the selected breakdown in the current import — values that can't be honestly computed show as n/a, never zero."
              }
            />
          ) : (
            <div className="space-y-3">
              {view === "chart" && <BreakdownBars rows={rows} />}
              {view === "table" && (
                <BreakdownTable rows={rows} metricLabel={metric.label} showWindows={scope === "manager"} />
              )}
              {scope === "manager" && view === "chart" && (
                <div className="space-y-0.5">
                  {rows.map((r) => (
                    <div key={r.key} className="flex items-center justify-between gap-3 px-1">
                      <span className={cn(TYPE.label, "text-muted-foreground/55 truncate")}>{r.label}</span>
                      <span className={cn(TYPE.label, "font-mono tabular-nums text-muted-foreground/45 shrink-0")} data-testid="account-window-label">
                        {r.windowLabel}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {rows.some((r) => r.value == null) && (
                <NoticeNote>
                  {rows.filter((r) => r.value == null).map((r) => (
                    <span key={r.key} className="block">
                      <span className="font-medium text-foreground/70">{r.label}</span> — {r.note ?? "n/a for this metric."}
                    </span>
                  ))}
                </NoticeNote>
              )}
            </div>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
