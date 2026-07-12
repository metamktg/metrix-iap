// ─── Shared analysis table primitives ─────────────────────────────────
// Used across IAP Library, Concept Map, Budget, and Strategy Avatars.
// Column headers on the data tables are click-to-sort: first click sorts
// by that KPI (cost metrics ascending — cheapest first — volume/rate
// metrics descending), second click flips direction, third restores the
// original order. Null values always sort last.

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { readableVariables, fmtUSD, fmtNum, fmtPct, eventLabel } from "../shared";
import type { CellPerformanceRow, VariablePerformanceRow, DemographicRow, PlacementRow, ConversionFunnelRow } from "@/lib/data/seedTypes";

export function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={cn("text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70 font-semibold px-2.5 py-2", right ? "text-right" : "text-left")}>{children}</th>;
}

// ─── Column sorting ───────────────────────────────────────────────────

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
      if (prev.dir === col.defaultDir) return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
      return null; // third click restores original order
    });
  }

  return { sorted, sort, toggle };
}

export function SortableTh({
  children,
  right,
  sortKey,
  sort,
  onToggle,
}: {
  children: React.ReactNode;
  right?: boolean;
  sortKey: string;
  sort: { key: string; dir: SortDir } | null;
  onToggle: (key: string) => void;
}) {
  const active = sort?.key === sortKey;
  return (
    <th className={cn("px-2.5 py-2", right ? "text-right" : "text-left")}>
      <button
        onClick={() => onToggle(sortKey)}
        data-testid={`sort-${sortKey}`}
        title="Click to sort"
        className={cn(
          "inline-flex items-center gap-0.5 text-[10px] font-mono uppercase tracking-widest font-semibold transition-colors",
          active ? "text-foreground" : "text-muted-foreground/70 hover:text-foreground",
          right && "flex-row-reverse"
        )}
      >
        {children}
        {active &&
          (sort!.dir === "asc" ? (
            <ArrowUp className="w-2.5 h-2.5 text-primary/70" />
          ) : (
            <ArrowDown className="w-2.5 h-2.5 text-primary/70" />
          ))}
      </button>
    </th>
  );
}
export function Td({ children, right, className }: { children: React.ReactNode; right?: boolean; className?: string }) {
  return <td className={cn("px-2.5 py-2 text-[12px] text-foreground/85 align-top", right && "text-right tabular-nums", className)}>{children}</td>;
}

export function TableShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/40 overflow-hidden bg-white/[0.015]">
      <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
        <table className="w-full border-collapse">{children}</table>
      </div>
    </div>
  );
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
        <span key={c} className="text-[8px] font-mono text-muted-foreground/70 border border-border/30 px-1 py-0.5 rounded leading-none" title={readableVariables(c)}>
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
  const { sorted, sort, toggle } = useColumnSort(rows, CELL_COLUMNS);
  return (
    <TableShell>
      <thead className="sticky top-0 bg-[hsl(222_55%_7%)] z-10">
        <tr className="border-b border-border/40">
          <SortableTh sortKey="concept" sort={sort} onToggle={toggle}>Cell / concept</SortableTh>
          <Th>Result type</Th>
          <SortableTh right sortKey="spend" sort={sort} onToggle={toggle}>Spend</SortableTh>
          <SortableTh right sortKey="results" sort={sort} onToggle={toggle}>Results</SortableTh>
          <SortableTh right sortKey="cpa" sort={sort} onToggle={toggle}>CPA</SortableTh>
          <SortableTh right sortKey="ctr" sort={sort} onToggle={toggle}>Link CTR</SortableTh>
          <SortableTh right sortKey="rpc" sort={sort} onToggle={toggle}>Result/click</SortableTh>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => (
          <tr
            key={r.cell_id + r["Result type"]}
            className={cn("border-b border-border/20 hover:bg-white/[0.02]", onRowClick && "cursor-pointer")}
            onClick={onRowClick ? () => onRowClick(r) : undefined}
          >
            <Td>
              <div className="font-medium text-foreground">{r.book2_concept_name}</div>
              <div className="text-[9px] font-mono text-muted-foreground/60 mt-0.5">{r.cell_id}{r.stage ? ` · ${r.stage}` : ""}</div>
              <VariableCodeChips row={r} />
            </Td>
            <Td>{eventLabel(r["Result type"])}</Td>
            <Td right>{fmtUSD(r["Amount spent (USD)"])}</Td>
            <Td right>{fmtNum(r.Results)}</Td>
            <Td right>{r.CPA_result != null ? fmtUSD(r.CPA_result) : "—"}</Td>
            <Td right>{fmtPct(r.CTR_link_pct)}</Td>
            <Td right>{fmtPct(r.Result_per_link_click_pct)}</Td>
          </tr>
        ))}
      </tbody>
    </TableShell>
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
  const { sorted, sort, toggle } = useColumnSort(rows, VARIABLE_COLUMNS);
  return (
    <TableShell>
      <thead className="sticky top-0 bg-[hsl(222_55%_7%)] z-10">
        <tr className="border-b border-border/40">
          <SortableTh sortKey="variable" sort={sort} onToggle={toggle}>Variable</SortableTh>
          <SortableTh sortKey="family" sort={sort} onToggle={toggle}>Family</SortableTh>
          <Th>Result type</Th>
          <SortableTh right sortKey="spend" sort={sort} onToggle={toggle}>Spend</SortableTh>
          <SortableTh right sortKey="ads" sort={sort} onToggle={toggle}>Ads</SortableTh>
          <SortableTh right sortKey="results" sort={sort} onToggle={toggle}>Results</SortableTh>
          <SortableTh right sortKey="cpa" sort={sort} onToggle={toggle}>CPA</SortableTh>
          <SortableTh right sortKey="ctr" sort={sort} onToggle={toggle}>Link CTR</SortableTh>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r, i) => (
          <tr
            key={r.variable_id + r["Result type"] + i}
            className={cn("border-b border-border/20 hover:bg-white/[0.02]", onRowClick && "cursor-pointer focus-visible:outline focus-visible:outline-1 focus-visible:outline-primary/60")}
            onClick={onRowClick ? () => onRowClick(r) : undefined}
            role={onRowClick ? "button" : undefined}
            tabIndex={onRowClick ? 0 : undefined}
            onKeyDown={onRowClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRowClick(r); } } : undefined}
            title={onRowClick ? "Open variable drill-down" : undefined}
            data-testid={onRowClick ? `row-variable-${r.variable_id}-${i}` : undefined}
          >
            <Td>
              <div className="font-medium text-foreground">{readableVariables(r.variable_id)}</div>
              <div className="text-[9px] font-mono text-muted-foreground/60 mt-0.5">{r.variable_id}</div>
            </Td>
            <Td className="capitalize">{r.variable_family}</Td>
            <Td>{eventLabel(r["Result type"])}</Td>
            <Td right>{fmtUSD(r["Amount spent (USD)"])}</Td>
            <Td right>{fmtNum(r.unique_ads)}</Td>
            <Td right>{fmtNum(r.Results)}</Td>
            <Td right>{r.CPA_result != null ? fmtUSD(r.CPA_result) : "—"}</Td>
            <Td right>{fmtPct(r.CTR_link_pct)}</Td>
          </tr>
        ))}
      </tbody>
    </TableShell>
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
}: {
  rows: DemographicRow[];
  /** When provided, rows become clickable and open the segment drill-down. */
  onSegmentClick?: (segment: { age: string; gender: string }) => void;
}) {
  const { sorted, sort, toggle } = useColumnSort(rows, DEMOGRAPHIC_COLUMNS);
  return (
    <TableShell>
      <thead className="sticky top-0 bg-[hsl(222_55%_7%)] z-10">
        <tr className="border-b border-border/40">
          <SortableTh sortKey="cell" sort={sort} onToggle={toggle}>Cell</SortableTh>
          <SortableTh sortKey="age" sort={sort} onToggle={toggle}>Age</SortableTh>
          <SortableTh sortKey="gender" sort={sort} onToggle={toggle}>Gender</SortableTh>
          <SortableTh right sortKey="spend" sort={sort} onToggle={toggle}>Spend</SortableTh>
          <SortableTh right sortKey="results" sort={sort} onToggle={toggle}>Results</SortableTh>
          <SortableTh right sortKey="cpa" sort={sort} onToggle={toggle}>CPA</SortableTh>
          <SortableTh right sortKey="rpc" sort={sort} onToggle={toggle}>Result/click</SortableTh>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r, i) => (
          <tr
            key={r.cell_id + r.Age + r.Gender + i}
            className={`border-b border-border/20 hover:bg-white/[0.02] ${onSegmentClick ? "cursor-pointer" : ""}`}
            onClick={onSegmentClick ? () => onSegmentClick({ age: r.Age, gender: r.Gender }) : undefined}
            title={onSegmentClick ? "Open segment drill-down" : undefined}
            data-testid={onSegmentClick ? `row-demographic-${r.Age}-${r.Gender}-${i}` : undefined}
          >
            <Td><span className="font-mono text-[10px] text-muted-foreground/60">{r.cell_id}</span></Td>
            <Td>{r.Age}</Td>
            <Td className="capitalize">{r.Gender}</Td>
            <Td right>{fmtUSD(r["Amount spent (USD)"])}</Td>
            <Td right>{fmtNum(r.Results)}</Td>
            <Td right>{r.CPA_result != null ? fmtUSD(r.CPA_result) : "—"}</Td>
            <Td right>{fmtPct(r.Result_per_link_click_pct)}</Td>
          </tr>
        ))}
      </tbody>
    </TableShell>
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
  const { sorted, sort, toggle } = useColumnSort(rows, PLACEMENT_COLUMNS);
  return (
    <TableShell>
      <thead className="sticky top-0 bg-[hsl(222_55%_7%)] z-10">
        <tr className="border-b border-border/40">
          <SortableTh sortKey="placement" sort={sort} onToggle={toggle}>Placement</SortableTh>
          <SortableTh sortKey="platform" sort={sort} onToggle={toggle}>Platform</SortableTh>
          <SortableTh right sortKey="spend" sort={sort} onToggle={toggle}>Spend</SortableTh>
          <SortableTh right sortKey="results" sort={sort} onToggle={toggle}>Results</SortableTh>
          <SortableTh right sortKey="cpa" sort={sort} onToggle={toggle}>CPA</SortableTh>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r, i) => (
          <tr key={r.Placement + r.Platform + i} className="border-b border-border/20 hover:bg-white/[0.02]">
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

/**
 * Conversion-attributed funnel table (device/platform/placement pivots).
 * No spend/CPA columns by design — spend is not attributable under
 * conversion-based tracking.
 */
export function ConversionFunnelTable({ rows, labelHeader }: { rows: (ConversionFunnelRow & { label: string })[]; labelHeader: string }) {
  return (
    <TableShell>
      <thead className="sticky top-0 bg-[hsl(222_55%_7%)] z-10">
        <tr className="border-b border-border/40">
          <Th>{labelHeader}</Th>
          <Th right>Link clicks</Th>
          <Th right>Adds to cart</Th>
          <Th right>Checkouts initiated</Th>
          <Th right>Purchases</Th>
          <Th>Confidence</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.label + i} className="border-b border-border/20 hover:bg-white/[0.02]">
            <Td className="font-medium text-foreground capitalize">{r.label}</Td>
            <Td right>{r.link_clicks != null ? fmtNum(r.link_clicks) : "—"}</Td>
            <Td right>{r.adds_to_cart != null ? fmtNum(r.adds_to_cart) : "—"}</Td>
            <Td right>{r.checkouts_initiated != null ? fmtNum(r.checkouts_initiated) : "—"}</Td>
            <Td right>{r.purchases != null ? fmtNum(r.purchases) : "—"}</Td>
            <Td>{r.confidence ? <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/60">{r.confidence.replace(/_/g, " ")}</span> : "—"}</Td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}
