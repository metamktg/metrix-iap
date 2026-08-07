// ─── Shared analysis table primitives ─────────────────────────────────
// Used across IAP Library, Concept Map, Budget, and Strategy Avatars.
// Column headers on the data tables are click-to-sort: first click sorts
// by that KPI (cost metrics ascending — cheapest first — volume/rate
// metrics descending), second click flips direction. A '×' reset button
// on the active column restores the original order. Null values always
// sort last.
//
// Accessibility: sortable column headers expose aria-sort="ascending" |
// "descending" | "none"; clickable rows get role="button" + tabIndex + Enter
// key support; active states are present alongside hover states.
//
// Virtualization: tables with >50 rows use @tanstack/react-virtual to keep
// the DOM small. VirtualTableBody handles the padding approach so column
// widths remain normal table layout (no absolute positioning hacks).

import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { cn } from "@workspace/command-deck/lib/utils";
import { readableVariables, fmtUSD, fmtNum, fmtPct, eventLabel, PILL_ACTIVE, PILL_INACTIVE } from "../shared";
import type { CellPerformanceRow, VariablePerformanceRow, DemographicRow, PlacementRow, ConversionFunnelRow } from "@/lib/data/seedTypes";

export function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={cn("text-label font-mono uppercase tracking-widest text-muted-foreground/70 font-semibold px-2.5 py-2", right ? "text-right" : "text-left")}>{children}</th>;
}

// ─── Column sorting ───────────────────────────────────────────────────
// Sort state is intentionally ephemeral (component memory only).
// It resets on page reload and on navigation away from the table.
// This is a deliberate UX decision: analysis tables always open in their
// default (data) order so users see a consistent baseline on every visit.
// Do NOT lift this state to URL params or sessionStorage — stale sort
// state across different accounts/date ranges would silently confuse the
// displayed data.

type SortDir = "asc" | "desc";
type ColumnAccessor<Row> = { get: (r: Row) => number | string | null; defaultDir: SortDir };
type ColumnAccessors<Row> = Record<string, ColumnAccessor<Row>>;

export function useColumnSort<Row>(rows: Row[], accessors: ColumnAccessors<Row>) {
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = accessors[sort.key];
    if (!col) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = col.get(a);
      const vb = col.get(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "string" || typeof vb === "string") return String(va).localeCompare(String(vb)) * dir;
      return (va - vb) * dir;
    });
    // accessors are module-level constants per table — stable identity.
  }, [rows, sort, accessors]);

  function toggle(key: string) {
    const col = accessors[key];
    if (!col) return;
    setSort((prev) => {
      if (prev?.key !== key) return { key, dir: col.defaultDir };
      // Bi-state: flip direction. Use the × reset button to clear the sort.
      return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
    });
  }

  function reset() {
    setSort(null);
  }

  return { sorted, sort, toggle, reset };
}

export function SortableTh({
  children,
  right,
  sortKey,
  sort,
  onToggle,
  onReset,
}: {
  children: React.ReactNode;
  right?: boolean;
  sortKey: string;
  sort: { key: string; dir: SortDir } | null;
  onToggle: (key: string) => void;
  onReset?: () => void;
}) {
  const active = sort?.key === sortKey;
  const ariaSort: React.AriaAttributes["aria-sort"] = active
    ? sort!.dir === "asc"
      ? "ascending"
      : "descending"
    : "none";
  return (
    <th
      className={cn("px-2.5 py-2", right ? "text-right" : "text-left")}
      aria-sort={ariaSort}
    >
      <div className={cn("inline-flex items-center gap-0.5", right && "flex-row-reverse w-full justify-end")}>
        <button
          onClick={() => onToggle(sortKey)}
          data-testid={`sort-${sortKey}`}
          title={active ? (sort!.dir === "asc" ? "Sorted ascending — click for descending" : "Sorted descending — click for ascending") : "Click to sort"}
          aria-label={`Sort by ${String(children)}${active ? (sort!.dir === "asc" ? ", currently ascending" : ", currently descending") : ""}`}
          className={cn(
            "inline-flex items-center gap-0.5 text-label font-mono uppercase tracking-widest font-semibold transition-colors",
            active ? "text-foreground" : "text-muted-foreground/90 hover:text-foreground",
            right && "flex-row-reverse"
          )}
        >
          {children}
          {active &&
            (sort!.dir === "asc" ? (
              <ArrowUp className="w-3.5 h-3.5 text-interactive/70" />
            ) : (
              <ArrowDown className="w-3.5 h-3.5 text-interactive/70" />
            ))}
        </button>
        {active && onReset && (
          <button
            onClick={(e) => { e.stopPropagation(); onReset(); }}
            data-testid={`sort-reset-${sortKey}`}
            title="Clear sort"
            aria-label="Clear sort"
            className="ml-0.5 p-0.5 rounded text-muted-foreground/35 hover:text-foreground/80 hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </th>
  );
}

export function Td({ children, right, className, style }: { children: React.ReactNode; right?: boolean; className?: string; style?: React.CSSProperties }) {
  return <td style={style} className={cn("px-2.5 py-2 text-body text-foreground/85 align-top", right && "text-right tabular-nums", className)}>{children}</td>;
}

/** Binary spend/CPA-intensity overlay toggle, shared by CellTable and VariableTable. */
export function HeatmapToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-end">
      <button
        onClick={onToggle}
        aria-pressed={on}
        className={cn(
          "h-6 px-2.5 rounded-md border text-label font-mono uppercase tracking-widest transition-colors",
          on ? PILL_ACTIVE : PILL_INACTIVE
        )}
      >
        Heatmap
      </button>
    </div>
  );
}

// ─── Virtual table body ───────────────────────────────────────────────
// Used when row count exceeds VIRTUAL_THRESHOLD. Uses the padding-row
// approach so standard table column layout is preserved (no absolute
// positioning). The scroll container ref comes from TableShell's div.
const VIRTUAL_THRESHOLD = 50;
const ESTIMATED_ROW_PX = 48;

function VirtualTableBody<Row>({
  rows,
  scrollRef,
  renderRow,
}: {
  rows: Row[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  renderRow: (row: Row, index: number) => React.ReactNode;
}) {
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW_PX,
    overscan: 8,
  });
  const items = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const paddingTop = items.length > 0 ? (items[0]?.start ?? 0) : 0;
  const paddingBottom = items.length > 0
    ? totalSize - (items[items.length - 1]?.end ?? 0)
    : 0;

  return (
    <tbody>
      {paddingTop > 0 && <tr aria-hidden="true"><td colSpan={999} style={{ height: paddingTop, padding: 0 }} /></tr>}
      {items.map((item) => renderRow(rows[item.index]!, item.index))}
      {paddingBottom > 0 && <tr aria-hidden="true"><td colSpan={999} style={{ height: paddingBottom, padding: 0 }} /></tr>}
    </tbody>
  );
}

function TableShellInner({ children, scrollRef }: { children: React.ReactNode; scrollRef: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div className="rounded-xl border border-border/40 overflow-hidden bg-white/[0.015]">
      <div ref={scrollRef} className="overflow-x-auto max-h-[520px] overflow-y-auto">
        <table className="w-full border-collapse">{children}</table>
      </div>
    </div>
  );
}

export function TableShell({ children }: { children: React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  return <TableShellInner scrollRef={scrollRef}>{children}</TableShellInner>;
}

/** Compact inline variable-code chips for a cell row. */
export function VariableCodeChips({ row }: { row: CellPerformanceRow }) {
  const codes = [
    row.hook_variable,
    row.tone_variable,
    row.framework_variable,
    row.concept_variable,
    row.pain_proof_variable,
    row.proof_variable,
    row.cta_variable,
  ].filter((c): c is string => Boolean(c));
  if (!codes.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {codes.map((c) => (
        <span key={c} className="text-label font-mono text-muted-foreground/70 border border-border/30 px-1 py-0.5 rounded leading-none" title={readableVariables(c)}>
          {c}
        </span>
      ))}
    </div>
  );
}

const CELL_COLUMNS: ColumnAccessors<CellPerformanceRow> = {
  concept: { get: (r) => r.book2_concept_name ?? r.cell_id, defaultDir: "asc" },
  spend: { get: (r) => r["Amount spent (USD)"], defaultDir: "desc" },
  results: { get: (r) => r.Results, defaultDir: "desc" },
  cpa: { get: (r) => r.CPA_result, defaultDir: "asc" },
  ctr: { get: (r) => r.CTR_link_pct, defaultDir: "desc" },
  rpc: { get: (r) => r.Result_per_link_click_pct, defaultDir: "desc" },
};

export function CellTable({ rows, onRowClick }: { rows: CellPerformanceRow[]; onRowClick?: (row: CellPerformanceRow) => void }) {
  const { sorted, sort, toggle, reset } = useColumnSort(rows, CELL_COLUMNS);
  const scrollRef = useRef<HTMLDivElement>(null);
  const useVirtual = sorted.length > VIRTUAL_THRESHOLD;
  const [heatmapOn, setHeatmapOn] = useState(false);

  // Heatmap precomputation
  const maxSpend = useMemo(
    () => (heatmapOn ? Math.max(...rows.map((r) => r["Amount spent (USD)"]), 0.0001) : 0),
    [rows, heatmapOn]
  );
  const { minCpa: cellMinCpa, maxCpa: cellMaxCpa } = useMemo(() => {
    if (!heatmapOn) return { minCpa: 0, maxCpa: 0 };
    const cpas = rows.map((r) => r.CPA_result).filter((v): v is number => v != null);
    return { minCpa: cpas.length ? Math.min(...cpas) : 0, maxCpa: cpas.length ? Math.max(...cpas) : 0 };
  }, [rows, heatmapOn]);

  const renderRow = (r: CellPerformanceRow, _i: number) => {
    const spendIntensity = heatmapOn && maxSpend > 0 ? r["Amount spent (USD)"] / maxSpend : 0;
    const cpaIntensity =
      heatmapOn && r.CPA_result != null && cellMaxCpa > cellMinCpa
        ? 1 - (r.CPA_result - cellMinCpa) / (cellMaxCpa - cellMinCpa)
        : 0;
    return (
      <tr
        key={r.cell_id + r["Result type"]}
        className={cn(
          "border-b border-border/30 hover:bg-white/[0.04]",
          onRowClick && "cursor-pointer active:bg-white/[0.06] focus-visible:outline focus-visible:outline-1 focus-visible:outline-primary/60"
        )}
        onClick={onRowClick ? () => onRowClick(r) : undefined}
        role={onRowClick ? "button" : undefined}
        tabIndex={onRowClick ? 0 : undefined}
        onKeyDown={onRowClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRowClick(r); } } : undefined}
        aria-label={onRowClick ? `Open details for ${r.book2_concept_name ?? r.cell_id}` : undefined}
      >
        <Td>
          <div className="font-medium text-foreground">{r.book2_concept_name}</div>
          <div className="text-label font-mono text-muted-foreground/60 mt-0.5">{r.cell_id}{r.stage ? ` · ${r.stage}` : ""}</div>
          <VariableCodeChips row={r} />
        </Td>
        <Td>{eventLabel(r["Result type"])}</Td>
        <Td right style={spendIntensity > 0 ? { background: `hsl(var(--chart-1) / ${(spendIntensity * 0.22).toFixed(3)})` } : undefined}>
          {fmtUSD(r["Amount spent (USD)"])}
        </Td>
        <Td right>{fmtNum(r.Results)}</Td>
        <Td right style={cpaIntensity > 0 ? { background: `hsl(var(--chart-3) / ${(cpaIntensity * 0.22).toFixed(3)})` } : undefined}>
          {r.CPA_result != null ? fmtUSD(r.CPA_result) : "—"}
        </Td>
        <Td right>{fmtPct(r.CTR_link_pct)}</Td>
        <Td right>{fmtPct(r.Result_per_link_click_pct)}</Td>
      </tr>
    );
  };

  const thead = (
    <thead className="sticky top-0 bg-surface-table z-10">
      <tr className="border-b border-border/40">
        <SortableTh sortKey="concept" sort={sort} onToggle={toggle} onReset={reset}>Cell / concept</SortableTh>
        <Th>Result type</Th>
        <SortableTh right sortKey="spend" sort={sort} onToggle={toggle} onReset={reset}>Spend</SortableTh>
        <SortableTh right sortKey="results" sort={sort} onToggle={toggle} onReset={reset}>Results</SortableTh>
        <SortableTh right sortKey="cpa" sort={sort} onToggle={toggle} onReset={reset}>CPA</SortableTh>
        <SortableTh right sortKey="ctr" sort={sort} onToggle={toggle} onReset={reset}>Link CTR</SortableTh>
        <SortableTh right sortKey="rpc" sort={sort} onToggle={toggle} onReset={reset}>Result/click</SortableTh>
      </tr>
    </thead>
  );

  return (
    <div className="space-y-1.5">
      <HeatmapToggle on={heatmapOn} onToggle={() => setHeatmapOn((h) => !h)} />
      {heatmapOn && (
        <div className="flex items-center gap-3 px-2 text-label text-muted-foreground/65 font-mono">
          <div className="flex items-center gap-1.5">
            <div className="w-10 h-2 rounded-full" style={{ background: "linear-gradient(90deg, hsl(var(--chart-1) / 0.04) 0%, hsl(var(--chart-1) / 0.22) 100%)" }} />
            <span>Spend intensity</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-10 h-2 rounded-full" style={{ background: "linear-gradient(90deg, hsl(var(--chart-3) / 0.04) 0%, hsl(var(--chart-3) / 0.22) 100%)" }} />
            <span>Low → high CPA efficiency</span>
          </div>
        </div>
      )}
      <TableShellInner scrollRef={scrollRef}>
        {thead}
        {useVirtual
          ? <VirtualTableBody rows={sorted} scrollRef={scrollRef} renderRow={renderRow} />
          : <tbody>{sorted.map((r) => renderRow(r, 0))}</tbody>
        }
      </TableShellInner>
    </div>
  );
}

const VARIABLE_COLUMNS: ColumnAccessors<VariablePerformanceRow> = {
  variable: { get: (r) => readableVariables(r.variable_id), defaultDir: "asc" },
  family: { get: (r) => r.variable_family, defaultDir: "asc" },
  spend: { get: (r) => r["Amount spent (USD)"], defaultDir: "desc" },
  ads: { get: (r) => r.unique_ads, defaultDir: "desc" },
  results: { get: (r) => r.Results, defaultDir: "desc" },
  cpa: { get: (r) => r.CPA_result, defaultDir: "asc" },
  ctr: { get: (r) => r.CTR_link_pct, defaultDir: "desc" },
};

export function VariableTable({
  rows,
  onRowClick,
}: {
  rows: VariablePerformanceRow[];
  /** When provided, rows become clickable and open the variable drill-down. */
  onRowClick?: (row: VariablePerformanceRow) => void;
}) {
  const { sorted, sort, toggle, reset } = useColumnSort(rows, VARIABLE_COLUMNS);
  const scrollRef = useRef<HTMLDivElement>(null);
  const useVirtual = sorted.length > VIRTUAL_THRESHOLD;
  const [heatmapOn, setHeatmapOn] = useState(false);

  // Heatmap precomputation
  const maxSpend = useMemo(
    () => (heatmapOn ? Math.max(...rows.map((r) => r["Amount spent (USD)"]), 0.0001) : 0),
    [rows, heatmapOn]
  );
  const { minCpa: varMinCpa, maxCpa: varMaxCpa } = useMemo(() => {
    if (!heatmapOn) return { minCpa: 0, maxCpa: 0 };
    const cpas = rows.map((r) => r.CPA_result).filter((v): v is number => v != null);
    return { minCpa: cpas.length ? Math.min(...cpas) : 0, maxCpa: cpas.length ? Math.max(...cpas) : 0 };
  }, [rows, heatmapOn]);

  const renderRow = (r: VariablePerformanceRow, i: number) => {
    const spendIntensity = heatmapOn && maxSpend > 0 ? r["Amount spent (USD)"] / maxSpend : 0;
    const cpaIntensity =
      heatmapOn && r.CPA_result != null && varMaxCpa > varMinCpa
        ? 1 - (r.CPA_result - varMinCpa) / (varMaxCpa - varMinCpa)
        : 0;
    return (
      <tr
        key={r.variable_id + r["Result type"] + i}
        className={cn(
          "border-b border-border/30 hover:bg-white/[0.04]",
          onRowClick && "cursor-pointer active:bg-white/[0.06] focus-visible:outline focus-visible:outline-1 focus-visible:outline-primary/60"
        )}
        onClick={onRowClick ? () => onRowClick(r) : undefined}
        role={onRowClick ? "button" : undefined}
        tabIndex={onRowClick ? 0 : undefined}
        onKeyDown={onRowClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRowClick(r); } } : undefined}
        title={onRowClick ? "Open variable drill-down" : undefined}
        data-testid={onRowClick ? `row-variable-${r.variable_id}-${i}` : undefined}
      >
        <Td>
          <div className="font-medium text-foreground">{readableVariables(r.variable_id)}</div>
          <div className="text-label font-mono text-muted-foreground/60 mt-0.5">{r.variable_id}</div>
        </Td>
        <Td className="capitalize">{r.variable_family}</Td>
        <Td>{eventLabel(r["Result type"])}</Td>
        <Td right style={spendIntensity > 0 ? { background: `hsl(var(--chart-1) / ${(spendIntensity * 0.22).toFixed(3)})` } : undefined}>
          <div className="flex flex-col gap-0.5">
            <span>{fmtUSD(r["Amount spent (USD)"])}</span>
            {heatmapOn && maxSpend > 0 && (
              <div className="h-[3px] rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${spendIntensity * 100}%`, background: "hsl(var(--chart-1) / 0.65)" }}
                />
              </div>
            )}
          </div>
        </Td>
        <Td right>{fmtNum(r.unique_ads)}</Td>
        <Td right>{fmtNum(r.Results)}</Td>
        <Td right style={cpaIntensity > 0 ? { background: `hsl(var(--chart-3) / ${(cpaIntensity * 0.22).toFixed(3)})` } : undefined}>
          {r.CPA_result != null ? fmtUSD(r.CPA_result) : "—"}
        </Td>
        <Td right>{fmtPct(r.CTR_link_pct)}</Td>
      </tr>
    );
  };

  const thead = (
    <thead className="sticky top-0 bg-surface-table z-10">
      <tr className="border-b border-border/40">
        <SortableTh sortKey="variable" sort={sort} onToggle={toggle} onReset={reset}>Variable</SortableTh>
        <SortableTh sortKey="family" sort={sort} onToggle={toggle} onReset={reset}>Family</SortableTh>
        <Th>Result type</Th>
        <SortableTh right sortKey="spend" sort={sort} onToggle={toggle} onReset={reset}>Spend</SortableTh>
        <SortableTh right sortKey="ads" sort={sort} onToggle={toggle} onReset={reset}>Ads</SortableTh>
        <SortableTh right sortKey="results" sort={sort} onToggle={toggle} onReset={reset}>Results</SortableTh>
        <SortableTh right sortKey="cpa" sort={sort} onToggle={toggle} onReset={reset}>CPA</SortableTh>
        <SortableTh right sortKey="ctr" sort={sort} onToggle={toggle} onReset={reset}>Link CTR</SortableTh>
      </tr>
    </thead>
  );

  return (
    <div className="space-y-1.5">
      <HeatmapToggle on={heatmapOn} onToggle={() => setHeatmapOn((h) => !h)} />
      {heatmapOn && (
        <div className="flex items-center gap-3 px-2 text-label text-muted-foreground/65 font-mono">
          <div className="flex items-center gap-1.5">
            <div className="w-10 h-2 rounded-full" style={{ background: "linear-gradient(90deg, hsl(var(--chart-1) / 0.04) 0%, hsl(var(--chart-1) / 0.22) 100%)" }} />
            <span>Spend intensity</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-10 h-2 rounded-full" style={{ background: "linear-gradient(90deg, hsl(var(--chart-3) / 0.04) 0%, hsl(var(--chart-3) / 0.22) 100%)" }} />
            <span>Low → high CPA efficiency</span>
          </div>
        </div>
      )}
      <TableShellInner scrollRef={scrollRef}>
        {thead}
        {useVirtual
          ? <VirtualTableBody rows={sorted} scrollRef={scrollRef} renderRow={renderRow} />
          : <tbody>{sorted.map((r, i) => renderRow(r, i))}</tbody>
        }
      </TableShellInner>
    </div>
  );
}

const DEMOGRAPHIC_COLUMNS: ColumnAccessors<DemographicRow> = {
  cell: { get: (r) => r.cell_id, defaultDir: "asc" },
  age: { get: (r) => r.Age, defaultDir: "asc" },
  gender: { get: (r) => r.Gender, defaultDir: "asc" },
  spend: { get: (r) => r["Amount spent (USD)"], defaultDir: "desc" },
  results: { get: (r) => r.Results, defaultDir: "desc" },
  cpa: { get: (r) => r.CPA_result, defaultDir: "asc" },
  rpc: { get: (r) => r.Result_per_link_click_pct, defaultDir: "desc" },
};

export function DemographicTable({
  rows,
  onSegmentClick,
  heatmap = false,
}: {
  rows: DemographicRow[];
  /** When provided, rows become clickable and open the segment drill-down. */
  onSegmentClick?: (segment: { age: string; gender: string }) => void;
  /** When true, tints the Result/click column by CVR intensity with a colour legend. */
  heatmap?: boolean;
}) {
  const { sorted, sort, toggle, reset } = useColumnSort(rows, DEMOGRAPHIC_COLUMNS);
  const maxCvr = heatmap
    ? Math.max(...rows.map((r) => r.Result_per_link_click_pct ?? 0), 0.0001)
    : 0;
  return (
    <div>
      {heatmap && maxCvr > 0 && (
        <div className="flex items-center gap-2 px-3 py-1.5 border border-border/30 border-b-0 rounded-t-xl bg-white/[0.01] text-label text-muted-foreground/65 font-mono">
          <span className="uppercase tracking-widest">CVR</span>
          <span className="text-muted-foreground/65">low</span>
          <div
            className="w-20 h-2 rounded-full"
            style={{ background: "linear-gradient(90deg, rgba(255,255,255,0.04) 0%, hsl(var(--chart-3) / 0.30) 100%)" }}
          />
          <span className="text-muted-foreground/65">high</span>
        </div>
      )}
      <TableShell>
        <thead className="sticky top-0 bg-surface-table z-10">
          <tr className="border-b border-border/40">
            <SortableTh sortKey="cell" sort={sort} onToggle={toggle} onReset={reset}>Cell</SortableTh>
            <SortableTh sortKey="age" sort={sort} onToggle={toggle} onReset={reset}>Age</SortableTh>
            <SortableTh sortKey="gender" sort={sort} onToggle={toggle} onReset={reset}>Gender</SortableTh>
            <SortableTh right sortKey="spend" sort={sort} onToggle={toggle} onReset={reset}>Spend</SortableTh>
            <SortableTh right sortKey="results" sort={sort} onToggle={toggle} onReset={reset}>Results</SortableTh>
            <SortableTh right sortKey="cpa" sort={sort} onToggle={toggle} onReset={reset}>CPA</SortableTh>
            <SortableTh right sortKey="rpc" sort={sort} onToggle={toggle} onReset={reset}>Result/click</SortableTh>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => {
            const cvr = r.Result_per_link_click_pct ?? 0;
            const intensity = heatmap && maxCvr > 0 ? Math.min(cvr / maxCvr, 1) : 0;
            return (
              <tr
                key={r.cell_id + r.Age + r.Gender + i}
                className={cn(
                  "border-b border-border/30 hover:bg-white/[0.04]",
                  onSegmentClick && "cursor-pointer active:bg-white/[0.06] focus-visible:outline focus-visible:outline-1 focus-visible:outline-primary/60"
                )}
                onClick={onSegmentClick ? () => onSegmentClick({ age: r.Age, gender: r.Gender }) : undefined}
                role={onSegmentClick ? "button" : undefined}
                tabIndex={onSegmentClick ? 0 : undefined}
                onKeyDown={onSegmentClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSegmentClick({ age: r.Age, gender: r.Gender }); } } : undefined}
                aria-label={onSegmentClick ? `Open segment for ${r.Age}, ${r.Gender}` : undefined}
                data-testid={onSegmentClick ? `row-demographic-${r.Age}-${r.Gender}-${i}` : undefined}
              >
                <Td><span className="font-mono text-label text-muted-foreground/60">{r.cell_id}</span></Td>
                <Td>{r.Age}</Td>
                <Td className="capitalize">{r.Gender}</Td>
                <Td right>{fmtUSD(r["Amount spent (USD)"])}</Td>
                <Td right>{fmtNum(r.Results)}</Td>
                <Td right>{r.CPA_result != null ? fmtUSD(r.CPA_result) : "—"}</Td>
                <Td
                  right
                  style={intensity > 0 ? { background: `hsl(var(--chart-3) / ${(intensity * 0.28).toFixed(3)})` } : undefined}
                >
                  {fmtPct(r.Result_per_link_click_pct)}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </TableShell>
    </div>
  );
}

const PLACEMENT_COLUMNS: ColumnAccessors<PlacementRow> = {
  placement: { get: (r) => r.Placement, defaultDir: "asc" },
  platform: { get: (r) => r.Platform, defaultDir: "asc" },
  spend: { get: (r) => r["Amount spent (USD)"], defaultDir: "desc" },
  results: { get: (r) => r.Results, defaultDir: "desc" },
  cpa: { get: (r) => r.CPA, defaultDir: "asc" },
};

export function PlacementTable({ rows }: { rows: PlacementRow[] }) {
  const { sorted, sort, toggle, reset } = useColumnSort(rows, PLACEMENT_COLUMNS);
  return (
    <TableShell>
      <thead className="sticky top-0 bg-surface-table z-10">
        <tr className="border-b border-border/40">
          <SortableTh sortKey="placement" sort={sort} onToggle={toggle} onReset={reset}>Placement</SortableTh>
          <SortableTh sortKey="platform" sort={sort} onToggle={toggle} onReset={reset}>Platform</SortableTh>
          <SortableTh right sortKey="spend" sort={sort} onToggle={toggle} onReset={reset}>Spend</SortableTh>
          <SortableTh right sortKey="results" sort={sort} onToggle={toggle} onReset={reset}>Results</SortableTh>
          <SortableTh right sortKey="cpa" sort={sort} onToggle={toggle} onReset={reset}>CPA</SortableTh>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r, i) => (
          <tr key={r.Placement + r.Platform + i} className="border-b border-border/30 hover:bg-white/[0.04] active:bg-white/[0.06]">
            <Td className="font-medium text-foreground">{r.Placement}</Td>
            <Td className="capitalize">{r.Platform}</Td>
            <Td right>{fmtUSD(r["Amount spent (USD)"])}</Td>
            <Td right>{fmtNum(r.Results)}</Td>
            <Td right>{r.CPA != null ? fmtUSD(r.CPA) : "—"}</Td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}

const FUNNEL_COLUMNS: ColumnAccessors<ConversionFunnelRow & { label: string }> = {
  link_clicks:          { get: (r) => r.link_clicks,          defaultDir: "desc" },
  adds_to_cart:         { get: (r) => r.adds_to_cart,         defaultDir: "desc" },
  checkouts_initiated:  { get: (r) => r.checkouts_initiated,  defaultDir: "desc" },
  purchases:            { get: (r) => r.purchases,            defaultDir: "desc" },
};

/**
 * Conversion-attributed funnel table (device/platform/placement pivots).
 * No spend/CPA columns by design — spend is not attributable under
 * conversion-based tracking. Columns are sortable; label column stays
 * in original order (no numeric accessor for strings).
 */
export function ConversionFunnelTable({ rows, labelHeader }: { rows: (ConversionFunnelRow & { label: string })[]; labelHeader: string }) {
  const { sorted, sort, toggle, reset } = useColumnSort(rows, FUNNEL_COLUMNS);
  return (
    <TableShell>
      <thead className="sticky top-0 bg-surface-table z-10">
        <tr className="border-b border-border/40">
          <Th>{labelHeader}</Th>
          <SortableTh right sortKey="link_clicks" sort={sort} onToggle={toggle} onReset={reset}>Link clicks</SortableTh>
          <SortableTh right sortKey="adds_to_cart" sort={sort} onToggle={toggle} onReset={reset}>Adds to cart</SortableTh>
          <SortableTh right sortKey="checkouts_initiated" sort={sort} onToggle={toggle} onReset={reset}>Checkouts initiated</SortableTh>
          <SortableTh right sortKey="purchases" sort={sort} onToggle={toggle} onReset={reset}>Purchases</SortableTh>
          <Th>Confidence</Th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r, i) => (
          <tr key={r.label + i} className="border-b border-border/20 hover:bg-white/[0.02] active:bg-white/[0.04]">
            <Td className="font-medium text-foreground capitalize">{r.label}</Td>
            <Td right>{r.link_clicks != null ? fmtNum(r.link_clicks) : "—"}</Td>
            <Td right>{r.adds_to_cart != null ? fmtNum(r.adds_to_cart) : "—"}</Td>
            <Td right>{r.checkouts_initiated != null ? fmtNum(r.checkouts_initiated) : "—"}</Td>
            <Td right>{r.purchases != null ? fmtNum(r.purchases) : "—"}</Td>
            <Td>{r.confidence ? <span className="text-label font-mono uppercase tracking-wider text-muted-foreground/60">{r.confidence.replace(/_/g, " ")}</span> : "—"}</Td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}
