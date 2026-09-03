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
import { barScale, type BarScale } from "@/lib/bar-scale";
import { ProgressMeter } from "@/components/metrics/ProgressMeter";
import { RevealPanel } from "@/components/widgets/LayeredDisclosure";
import { resolveVariableDescription, variableFamilyLabel } from "@/lib/variable-registry";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { cn } from "@workspace/command-deck/lib/utils";
import { readableVariables, fmtUSD, fmtNum, fmtPct, eventLabel, SectionInfoIcon, PILL_ACTIVE, PILL_INACTIVE, ConfidenceBadge } from "../shared";
import { TYPE } from "../typography";
import { classifyResultEvent } from "@/lib/resultEvents";
import { spansMultipleRuns } from "@/lib/run-supersede";
import { fmtDayRange } from "@/lib/normalize";
import type { CellPerformanceRow, VariablePerformanceRow, VariableSegmentRow, DemographicRow, PlacementRow, ConversionFunnelRow } from "@/lib/data/seedTypes";

// ─── Scale of a row ───────────────────────────────────────────────────
// Awareness rows are never scored on cost (owner direction 2026-09-03):
// their verdict is communication signals, so the CPA cell reads "—" with
// the reason in its title, and no bar is drawn for it. The stored
// `intent_class` wins when a row carries one; the raw result type is
// classified otherwise.
function isCommunicationRow(r: { "Result type": string; intent_class?: string | null }): boolean {
  if (r.intent_class === "awareness") return true;
  if (r.intent_class === "conversion" || r.intent_class === "consideration") return false;
  return classifyResultEvent(r["Result type"]).scale === "communication";
}
const COMMUNICATION_CPA_TIP = "Awareness event — read on communication signals (CPM, link CTR, frequency), never on cost per result";

/** "Jun 1 – Jun 30" for a run-tagged row's window, else the run id's first segment. */
function runWindowLabel(r: { manual_analysis_run_id?: string | null; date_start?: string | null; date_end?: string | null }): string {
  if (r.date_start && r.date_end) return fmtDayRange(r.date_start, r.date_end);
  return r.manual_analysis_run_id ? r.manual_analysis_run_id.split("-")[0]! : "—";
}

export function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  // Font-size/uppercase/tracking/color/weight/padding all come from the
  // .nc-table CSS on the parent <table> — this only adds alignment.
  return <th className={right ? "text-right" : undefined}>{children}</th>;
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

/**
 * The one thing about these bars a reader cannot work out by looking.
 *
 * Longer-is-more needs no explanation. An INVERTED column does: without this,
 * the cheapest CPA in the account wears the longest bar and reads as the
 * worst performer. It sits on the column header — where the question forms —
 * rather than as a note above the table, which is prose on the first layer
 * and the wrong place besides.
 */
const INVERTED_BAR_TIP =
  "The bar under each CPA is INVERTED: lower is better, so the cheapest CPA draws " +
  "the longest bar and the most expensive draws the shortest. Bars on the other " +
  "columns read the usual way — longer is more. A cell with no bar was not measured.";

export function SortableTh({
  children,
  right,
  sortKey,
  sort,
  onToggle,
  onReset,
  info,
}: {
  children: React.ReactNode;
  right?: boolean;
  sortKey: string;
  sort: { key: string; dir: SortDir } | null;
  onToggle: (key: string) => void;
  onReset?: () => void;
  /**
   * Explanation for a column whose reading is not self-evident. A SIBLING of
   * the sort control, never inside it: an info button nested in the sort
   * button would be invalid HTML and the browser would drop one of them.
   */
  info?: string;
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
            "pressable hit-target-24 inline-flex items-center gap-0.5 text-label uppercase tracking-widest font-semibold transition-colors",
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
        {info && <SectionInfoIcon tip={info} />}
        {active && onReset && (
          <button
            onClick={(e) => { e.stopPropagation(); onReset(); }}
            data-testid={`sort-reset-${sortKey}`}
            title="Clear sort"
            aria-label="Clear sort"
            className="pressable ml-0.5 p-0.5 rounded text-muted-foreground/75 hover:text-foreground/80 hover:bg-foreground/[0.06] transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </th>
  );
}

export function Td({ children, right, className, style }: { children: React.ReactNode; right?: boolean; className?: string; style?: React.CSSProperties }) {
  // Font-size/padding come from the .nc-table CSS on the parent <table>;
  // color/alignment/passthrough stay here since nc-table doesn't set them.
  return <td style={style} className={cn("text-foreground/85 align-top", right && "text-right tabular-nums", className)}>{children}</td>;
}

/** Binary spend/CPA-intensity overlay toggle, shared by CellTable and VariableTable. */
// ─── Magnitude cell — the racing-form row ─────────────────────────────
//
// WHAT CHANGED AND WHY
// These tables encoded magnitude as a BACKGROUND TINT, behind a toggle that
// defaulted to off. Two problems with that, and the toggle is the smaller one.
//
// Colour intensity is close to the weakest way there is to encode a
// quantity. Asked to rank five tinted cells, people get the order wrong;
// asked to rank five bars, they get it right without trying. Length is the
// strongest encoding available and it costs the same pixels — the bar sits
// in the cell the tint used to fill.
//
// And it should not be a mode. A table you have to switch into a readable
// state is a table most people read in the unreadable one. Bars are on.
//
// The number stays right-aligned where numerals belong; the bar grows from
// the left, so every row shares a start edge and lengths are comparable at a
// glance. One accent colour for every bar: length already carries the
// meaning, and a second encoding on top of it is the competing-element
// problem this whole pass exists to remove.
//
// All three honesty rules come from lib/bar-scale: an unmeasured value draws
// NO bar (not a zero-length one), a measured zero keeps a hairline stub, and
// a cost metric inverts so the best CPA has the longest bar rather than the
// worst.

export function MagnitudeCell({
  value,
  display,
  scale,
  label = "value",
}: {
  /** The raw number. Null means not measured — no bar is drawn. */
  value: number | null | undefined;
  /** The formatted string the reader actually sees. */
  display: React.ReactNode;
  scale: BarScale;
  /** Names the measure for the meter widget beneath the figure. */
  label?: string;
}) {
  const share = scale.share(value);
  return (
    <td className="relative text-right align-top tabular-nums text-foreground/85 pb-3.5">
      {share !== null && (
        // Composes the ProgressMeter widget instead of hand-rolling a span.
        // That was the first version's mistake: a bare div with a Tailwind
        // background has no TRACK, no shared radius, no shared transition
        // and no relationship to the meter used everywhere else in the
        // product. Without a track you see the value but not what full
        // would be, which is half the point of a bar.
        //
        // aria-hidden sits on the WRAPPER, which suppresses the meter's own
        // role and label. In a table the cell's text is already the
        // accessible value; role="meter" on all 166 bars would announce
        // every figure twice. The widget is right and its ARIA is right for
        // a standalone bar — it is redundant HERE, and that is a property
        // of the context, not of the widget.
        <span aria-hidden className="absolute bottom-1 left-3 right-3 pointer-events-none">
          <ProgressMeter value={share} total={1} label={label} size="sm" />
        </span>
      )}
      <span className="relative">{display}</span>
    </td>
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
    <div className="rounded-xl border border-border/40 overflow-hidden bg-foreground/[0.015]">
      <div ref={scrollRef} className="overflow-x-auto max-h-[520px] overflow-y-auto">
        <table className="nc-table">{children}</table>
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
    row.funnel_stage_variable,
    row.awareness_variable,
  ].filter((c): c is string => Boolean(c));
  if (!codes.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {codes.map((c) => (
        <span key={c} className="text-label text-muted-foreground/75 border border-border/30 px-1 py-0.5 rounded leading-none" title={readableVariables(c)}>
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

  // Scales are built from the WHOLE row set, not the visible page. With
  // virtualisation on, scaling to what happens to be on screen would make a
  // bar change length as you scroll — the same value drawn two ways.
  const spendScale = useMemo(() => barScale(rows.map((r) => r["Amount spent (USD)"])), [rows]);
  const resultScale = useMemo(() => barScale(rows.map((r) => r.Results)), [rows]);
  // invert: on CPA the best value is the smallest, so it gets the longest bar.
  // Awareness rows contribute nothing to the scale — their cost is not a verdict.
  const cpaScale = useMemo(() => barScale(rows.map((r) => (isCommunicationRow(r) ? null : r.CPA_result)), true), [rows]);

  const renderRow = (r: CellPerformanceRow, _i: number) => {
    return (
      <tr
        key={r.cell_id + r["Result type"]}
        className={cn(onRowClick && "cursor-pointer active:bg-foreground/[0.06] focus-visible:outline focus-visible:outline-1 focus-visible:outline-primary/60")}
        onClick={onRowClick ? () => onRowClick(r) : undefined}
        role={onRowClick ? "button" : undefined}
        tabIndex={onRowClick ? 0 : undefined}
        onKeyDown={onRowClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRowClick(r); } } : undefined}
        aria-label={onRowClick ? `Open details for ${r.book2_concept_name ?? r.cell_id}` : undefined}
      >
        <Td>
          <div className="font-medium text-foreground">{r.book2_concept_name}</div>
          <div className="text-label text-muted-foreground/75 mt-0.5">{r.cell_id}{r.stage ? ` · ${r.stage}` : ""}</div>
          <VariableCodeChips row={r} />
        </Td>
        <Td>{eventLabel(r["Result type"])}</Td>
        <MagnitudeCell value={r["Amount spent (USD)"]} display={fmtUSD(r["Amount spent (USD)"])} scale={spendScale} label="Spend" />
        <MagnitudeCell value={r.Results} display={fmtNum(r.Results)} scale={resultScale} label="Results" />
        {isCommunicationRow(r) ? (
          <Td right><span title={COMMUNICATION_CPA_TIP}>—</span></Td>
        ) : (
          <MagnitudeCell
            value={r.CPA_result}
            display={r.CPA_result != null ? fmtUSD(r.CPA_result) : "—"}
            scale={cpaScale}
            label="CPA"
          />
        )}
        <Td right>{fmtPct(r.CTR_link_pct)}</Td>
        <Td right>{fmtPct(r.Result_per_link_click_pct)}</Td>
      </tr>
    );
  };

  const thead = (
    <thead className="sticky top-0 bg-surface-table z-10">
      <tr>
        <SortableTh sortKey="concept" sort={sort} onToggle={toggle} onReset={reset}>Cell / concept</SortableTh>
        <Th>Result type</Th>
        <SortableTh right sortKey="spend" sort={sort} onToggle={toggle} onReset={reset}>Spend</SortableTh>
        <SortableTh right sortKey="results" sort={sort} onToggle={toggle} onReset={reset}>Results</SortableTh>
        <SortableTh right sortKey="cpa" sort={sort} onToggle={toggle} onReset={reset} info={INVERTED_BAR_TIP}>CPA</SortableTh>
        <SortableTh right sortKey="ctr" sort={sort} onToggle={toggle} onReset={reset}>Link CTR</SortableTh>
        <SortableTh right sortKey="rpc" sort={sort} onToggle={toggle} onReset={reset}>Result/click</SortableTh>
      </tr>
    </thead>
  );

  return (
    <div className="space-y-1.5">
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

/**
 * The evidence-layer row for one variable × result type: the `all`
 * breakdown of `variable_segment_performance` (spec §16). Joined on
 * variable id AND result type — a purchase row's evidence never describes
 * the same token's lead row.
 */
function segmentIndex(segments: readonly VariableSegmentRow[] | undefined): Map<string, VariableSegmentRow> {
  const map = new Map<string, VariableSegmentRow>();
  for (const s of segments ?? []) {
    if (s.breakdown !== "all") continue;
    map.set(`${s.variable_id}\u0001${s.result_type}`, s);
  }
  return map;
}

const EVIDENCE_STATE_LABEL: Record<string, string> = {
  direct_asset: "direct (asset)",
  direct_joint: "direct (joint)",
  ad_context: "ad context",
  observed_reconciled: "observed · reconciled",
  observed_partial: "observed · partial",
  modelled: "modelled",
  overcounted: "overcounted",
  unreconciled: "unreconciled",
  incompatible: "incompatible",
};

export function VariableTable({
  rows,
  onRowClick,
  segments,
  runLabel,
}: {
  rows: VariablePerformanceRow[];
  /** When provided, rows become clickable and open the variable drill-down. */
  onRowClick?: (row: VariablePerformanceRow) => void;
  /**
   * The run's `variable_segment_performance` rows. When given, and a row has
   * an `all` entry for its variable × result type, an Evidence column shows
   * its confidence and observed coverage, and — where the layer computed
   * one — an Adjusted rate beside CPA with the raw rate in its title.
   */
  segments?: VariableSegmentRow[];
  /** Label for a run id (the picker's own label, so both agree); the row's window is the fallback. */
  runLabel?: (runId: string) => string | undefined;
}) {
  // inline-table-control, designed around the virtualizer: this table
  // virtualizes past a threshold, and a row that grows in place gives the
  // virtualizer dynamic heights it cannot do math on. So the quick layer
  // renders as a pinned panel DIRECTLY UNDER the table instead — same
  // function (stay in context, compare against the table; siblings dim
  // while one is selected), row heights untouched. The full drill-down
  // stays one press away as the escalation.
  const [quickKey, setQuickKey] = useState<string | null>(null);
  const { sorted, sort, toggle, reset } = useColumnSort(rows, VARIABLE_COLUMNS);
  const scrollRef = useRef<HTMLDivElement>(null);
  const useVirtual = sorted.length > VIRTUAL_THRESHOLD;

  const spendScale = useMemo(() => barScale(rows.map((r) => r["Amount spent (USD)"])), [rows]);
  const resultScale = useMemo(() => barScale(rows.map((r) => r.Results)), [rows]);
  const cpaScale = useMemo(() => barScale(rows.map((r) => (isCommunicationRow(r) ? null : r.CPA_result)), true), [rows]);
  // Provenance (G1): rows from more than one run get a Run column — the
  // reader can then see two measurements of the same token are two runs,
  // not a doubled variable. One run needs no column; its window is on the
  // picker.
  const multiRun = useMemo(() => spansMultipleRuns(rows), [rows]);
  const segIndex = useMemo(() => segmentIndex(segments), [segments]);
  const segFor = (r: VariablePerformanceRow) => segIndex.get(`${r.variable_id}\u0001${r["Result type"]}`) ?? null;
  const hasEvidence = useMemo(() => segIndex.size > 0 && rows.some((r) => segIndex.has(`${r.variable_id}\u0001${r["Result type"]}`)), [rows, segIndex]);
  // The `all` row's rates are null by construction today (rates live on the
  // segment rows); the column appears only when the layer has one to show,
  // never as a column of dashes.
  const hasAdjustedRate = useMemo(() => rows.some((r) => segFor(r)?.adjusted_rate != null), [rows, segIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const rowKey = (r: VariablePerformanceRow, i: number) => `${r.variable_id}|${r["Result type"]}|${i}`;
  const quickRow = quickKey != null ? sorted.map((r, i) => ({ r, k: rowKey(r, i) })).find((x) => x.k === quickKey)?.r ?? null : null;

  const renderRow = (r: VariablePerformanceRow, i: number) => {
    const k = rowKey(r, i);
    const isQuick = quickKey === k;
    const seg = segFor(r);
    const runId = r.manual_analysis_run_id ?? null;
    const runTitle = runId
      ? `Run ${runId}${r.date_start && r.date_end ? ` · ${r.date_start} – ${r.date_end}` : ""}`
      : "Untagged — measured before runs were recorded";
    return (
      <tr
        key={r.variable_id + r["Result type"] + i}
        className={cn(
          onRowClick && "cursor-pointer active:bg-foreground/[0.06] focus-visible:outline focus-visible:outline-1 focus-visible:outline-primary/60",
          "transition-opacity duration-300",
          quickKey != null && !isQuick && "opacity-40",
          isQuick && "bg-primary/[0.05]",
        )}
        onClick={onRowClick ? () => setQuickKey((prev) => (prev === k ? null : k)) : undefined}
        role={onRowClick ? "button" : undefined}
        tabIndex={onRowClick ? 0 : undefined}
        aria-expanded={onRowClick ? isQuick : undefined}
        onKeyDown={onRowClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setQuickKey((prev) => (prev === k ? null : k)); } } : undefined}
        title={onRowClick ? "Show variable detail" : undefined}
        data-testid={onRowClick ? `row-variable-${r.variable_id}-${i}` : undefined}
      >
        <Td>
          <div className="font-medium text-foreground">{readableVariables(r.variable_id)}</div>
          <div className="text-label text-muted-foreground/75 mt-0.5">{r.variable_id}</div>
        </Td>
        <Td>{variableFamilyLabel(r.variable_family)}</Td>
        <Td>{eventLabel(r["Result type"])}</Td>
        {multiRun && (
          <Td>
            <span className="text-label text-muted-foreground/75 whitespace-nowrap" title={runTitle} data-testid="variable-run-cell">
              {runId ? (runLabel?.(runId) ?? runWindowLabel(r)) : "untagged"}
            </span>
          </Td>
        )}
        <MagnitudeCell value={r["Amount spent (USD)"]} display={fmtUSD(r["Amount spent (USD)"])} scale={spendScale} label="Spend" />
        <Td right>{fmtNum(r.unique_ads)}</Td>
        <MagnitudeCell value={r.Results} display={fmtNum(r.Results)} scale={resultScale} label="Results" />
        {isCommunicationRow(r) ? (
          <Td right><span title={COMMUNICATION_CPA_TIP}>—</span></Td>
        ) : (
          <MagnitudeCell
            value={r.CPA_result}
            display={r.CPA_result != null ? fmtUSD(r.CPA_result) : "—"}
            scale={cpaScale}
            label="CPA"
          />
        )}
        {hasAdjustedRate && (
          <Td right>
            {seg?.adjusted_rate != null ? (
              <span title={`Raw rate ${fmtPct(seg.raw_rate)} · adjusted for ${fmtPct(seg.observed_coverage_pct, 0)} observed coverage`}>{fmtPct(seg.adjusted_rate)}</span>
            ) : "—"}
          </Td>
        )}
        <Td right>{fmtPct(r.CTR_link_pct)}</Td>
        {hasEvidence && (
          <Td>
            {seg ? (
              <span
                className="inline-flex items-center gap-1 whitespace-nowrap"
                title={`${EVIDENCE_STATE_LABEL[seg.evidence_state] ?? seg.evidence_state} · ${seg.contributing_ads} contributing ad${seg.contributing_ads === 1 ? "" : "s"}${seg.observed_coverage_pct != null ? ` · ${fmtPct(seg.observed_coverage_pct, 0)} of spend observed` : " · coverage not reconciled"}`}
                data-testid="variable-evidence-cell"
              >
                <ConfidenceBadge value={seg.confidence.replace(/_/g, " ")} />
                <span className="text-label tabular-nums text-muted-foreground/75">{seg.observed_coverage_pct != null ? fmtPct(seg.observed_coverage_pct, 0) : "—"}</span>
              </span>
            ) : (
              <span className="text-label text-muted-foreground/75" title="No evidence row for this variable under this result type">—</span>
            )}
          </Td>
        )}
      </tr>
    );
  };

  const thead = (
    <thead className="sticky top-0 bg-surface-table z-10">
      <tr>
        <SortableTh sortKey="variable" sort={sort} onToggle={toggle} onReset={reset}>Variable</SortableTh>
        <SortableTh sortKey="family" sort={sort} onToggle={toggle} onReset={reset}>Family</SortableTh>
        <Th>Result type</Th>
        {multiRun && <Th>Run</Th>}
        <SortableTh right sortKey="spend" sort={sort} onToggle={toggle} onReset={reset}>Spend</SortableTh>
        <SortableTh right sortKey="ads" sort={sort} onToggle={toggle} onReset={reset}>Ads</SortableTh>
        <SortableTh right sortKey="results" sort={sort} onToggle={toggle} onReset={reset}>Results</SortableTh>
        <SortableTh right sortKey="cpa" sort={sort} onToggle={toggle} onReset={reset} info={INVERTED_BAR_TIP}>CPA</SortableTh>
        {hasAdjustedRate && <Th right>Adjusted rate</Th>}
        <SortableTh right sortKey="ctr" sort={sort} onToggle={toggle} onReset={reset}>Link CTR</SortableTh>
        {hasEvidence && <Th>Evidence</Th>}
      </tr>
    </thead>
  );

  return (
    <div className="space-y-1.5">
      <TableShellInner scrollRef={scrollRef}>
        {thead}
        {useVirtual
          ? <VirtualTableBody rows={sorted} scrollRef={scrollRef} renderRow={renderRow} />
          : <tbody>{sorted.map((r, i) => renderRow(r, i))}</tbody>
        }
      </TableShellInner>
      <RevealPanel open={quickRow != null}>
        {quickRow && (
          <div className="rounded-lg border border-primary/25 bg-primary/[0.03] px-3.5 py-3 space-y-2" data-testid="variable-quick-layer">
            <div className="flex items-start gap-2 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className={cn(TYPE.title, "leading-snug")}>{readableVariables(quickRow.variable_id)}</div>
                <div className={cn(TYPE.caption, "mt-0.5")}>
                  <span>{variableFamilyLabel(quickRow.variable_family)}</span> · {quickRow.variable_id}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQuickKey(null)}
                aria-label="Close variable detail"
                className={cn("pressable shrink-0", TYPE.caption, "h-7 px-2 rounded-md border border-border/40 text-muted-foreground/75 hover:text-foreground transition-colors")}
              >
                Close
              </button>
            </div>
            {resolveVariableDescription(quickRow.variable_id) && (
              <p className={cn(TYPE.body, "text-foreground/80 leading-relaxed")}>
                {resolveVariableDescription(quickRow.variable_id)}
              </p>
            )}
            {onRowClick && (
              <button
                type="button"
                onClick={() => onRowClick(quickRow)}
                className={cn("pressable", TYPE.caption, "inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-primary/30 bg-primary/10 font-medium text-interactive hover:bg-primary/20 transition-colors")}
              >
                Open full drill-down
              </button>
            )}
          </div>
        )}
      </RevealPanel>
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
}: {
  rows: DemographicRow[];
  /** When provided, rows become clickable and open the segment drill-down. */
  onSegmentClick?: (segment: { age: string; gender: string }) => void;
}) {
  const { sorted, sort, toggle, reset } = useColumnSort(rows, DEMOGRAPHIC_COLUMNS);
  const spendScale = useMemo(() => barScale(rows.map((r) => r["Amount spent (USD)"])), [rows]);
  const resultScale = useMemo(() => barScale(rows.map((r) => r.Results)), [rows]);
  const cpaScale = useMemo(() => barScale(rows.map((r) => r.CPA_result), true), [rows]);
  const cvrScale = useMemo(() => barScale(rows.map((r) => r.Result_per_link_click_pct)), [rows]);
  return (
    <div>
      <TableShell>
        <thead className="sticky top-0 bg-surface-table z-10">
          <tr>
            <SortableTh sortKey="cell" sort={sort} onToggle={toggle} onReset={reset}>Cell</SortableTh>
            <SortableTh sortKey="age" sort={sort} onToggle={toggle} onReset={reset}>Age</SortableTh>
            <SortableTh sortKey="gender" sort={sort} onToggle={toggle} onReset={reset}>Gender</SortableTh>
            <SortableTh right sortKey="spend" sort={sort} onToggle={toggle} onReset={reset}>Spend</SortableTh>
            <SortableTh right sortKey="results" sort={sort} onToggle={toggle} onReset={reset}>Results</SortableTh>
            <SortableTh right sortKey="cpa" sort={sort} onToggle={toggle} onReset={reset} info={INVERTED_BAR_TIP}>CPA</SortableTh>
            <SortableTh right sortKey="rpc" sort={sort} onToggle={toggle} onReset={reset}>Result/click</SortableTh>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => {
            return (
              <tr
                key={r.cell_id + r.Age + r.Gender + i}
                className={cn(onSegmentClick && "cursor-pointer active:bg-foreground/[0.06] focus-visible:outline focus-visible:outline-1 focus-visible:outline-primary/60")}
                onClick={onSegmentClick ? () => onSegmentClick({ age: r.Age, gender: r.Gender }) : undefined}
                role={onSegmentClick ? "button" : undefined}
                tabIndex={onSegmentClick ? 0 : undefined}
                onKeyDown={onSegmentClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSegmentClick({ age: r.Age, gender: r.Gender }); } } : undefined}
                aria-label={onSegmentClick ? `Open segment for ${r.Age}, ${r.Gender}` : undefined}
                data-testid={onSegmentClick ? `row-demographic-${r.Age}-${r.Gender}-${i}` : undefined}
              >
                <Td><span className=" text-label text-muted-foreground/75">{r.cell_id}</span></Td>
                <Td>{r.Age}</Td>
                <Td className="capitalize">{r.Gender}</Td>
                <MagnitudeCell value={r["Amount spent (USD)"]} display={fmtUSD(r["Amount spent (USD)"])} scale={spendScale} label="Spend" />
                <MagnitudeCell value={r.Results} display={fmtNum(r.Results)} scale={resultScale} label="Results" />
                <MagnitudeCell
                  value={r.CPA_result}
                  display={r.CPA_result != null ? fmtUSD(r.CPA_result) : "—"}
                  scale={cpaScale}
                  label="CPA"
                />
                <MagnitudeCell
                  value={r.Result_per_link_click_pct}
                  display={fmtPct(r.Result_per_link_click_pct)}
                  scale={cvrScale}
                  label="Result per click"
                />
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
  const spendScale = useMemo(() => barScale(rows.map((r) => r["Amount spent (USD)"])), [rows]);
  const resultScale = useMemo(() => barScale(rows.map((r) => r.Results)), [rows]);
  const cpaScale = useMemo(() => barScale(rows.map((r) => r.CPA), true), [rows]);
  return (
    <TableShell>
      <thead className="sticky top-0 bg-surface-table z-10">
        <tr>
          <SortableTh sortKey="placement" sort={sort} onToggle={toggle} onReset={reset}>Placement</SortableTh>
          <SortableTh sortKey="platform" sort={sort} onToggle={toggle} onReset={reset}>Platform</SortableTh>
          <SortableTh right sortKey="spend" sort={sort} onToggle={toggle} onReset={reset}>Spend</SortableTh>
          <SortableTh right sortKey="results" sort={sort} onToggle={toggle} onReset={reset}>Results</SortableTh>
          <SortableTh right sortKey="cpa" sort={sort} onToggle={toggle} onReset={reset} info={INVERTED_BAR_TIP}>CPA</SortableTh>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r, i) => (
          <tr key={r.Placement + r.Platform + i}>
            <Td className="font-medium text-foreground">{r.Placement}</Td>
            <Td className="capitalize">{r.Platform}</Td>
            <MagnitudeCell value={r["Amount spent (USD)"]} display={fmtUSD(r["Amount spent (USD)"])} scale={spendScale} label="Spend" />
            <MagnitudeCell value={r.Results} display={fmtNum(r.Results)} scale={resultScale} label="Results" />
            <MagnitudeCell value={r.CPA} display={r.CPA != null ? fmtUSD(r.CPA) : "—"} scale={cpaScale} label="CPA" />
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
  // One scale per stage column. NOT one scale across all four: link clicks
  // outnumber purchases by orders of magnitude, so a shared scale would draw
  // every purchase count as an invisible sliver and hide the column that
  // matters most.
  const clickScale = useMemo(() => barScale(rows.map((r) => r.link_clicks)), [rows]);
  const cartScale = useMemo(() => barScale(rows.map((r) => r.adds_to_cart)), [rows]);
  const checkoutScale = useMemo(() => barScale(rows.map((r) => r.checkouts_initiated)), [rows]);
  const purchaseScale = useMemo(() => barScale(rows.map((r) => r.purchases)), [rows]);
  return (
    <TableShell>
      <thead className="sticky top-0 bg-surface-table z-10">
        <tr>
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
          <tr key={r.label + i}>
            <Td className="font-medium text-foreground capitalize">{r.label}</Td>
            <MagnitudeCell value={r.link_clicks} display={r.link_clicks != null ? fmtNum(r.link_clicks) : "—"} scale={clickScale} label="Link clicks" />
            <MagnitudeCell value={r.adds_to_cart} display={r.adds_to_cart != null ? fmtNum(r.adds_to_cart) : "—"} scale={cartScale} label="Adds to cart" />
            <MagnitudeCell value={r.checkouts_initiated} display={r.checkouts_initiated != null ? fmtNum(r.checkouts_initiated) : "—"} scale={checkoutScale} label="Checkouts initiated" />
            <MagnitudeCell value={r.purchases} display={r.purchases != null ? fmtNum(r.purchases) : "—"} scale={purchaseScale} label="Purchases" />
            <Td>{r.confidence ? <span className="text-label uppercase tracking-wider text-muted-foreground/75">{r.confidence.replace(/_/g, " ")}</span> : "—"}</Td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}
