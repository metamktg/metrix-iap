// ─── Shared analysis table primitives ─────────────────────────────────
// Used across IAP Library, Concept Map, Budget, and Strategy Avatars.

import { cn } from "@/lib/utils";
import { readableVariables, fmtUSD, fmtNum, fmtPct, eventLabel } from "../shared";
import type { CellPerformanceRow, VariablePerformanceRow, DemographicRow, PlacementRow, ConversionFunnelRow } from "@/lib/data/seedTypes";

export function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={cn("text-label font-mono uppercase tracking-wider text-muted-foreground/70 font-semibold px-3 py-2.5", right ? "text-right" : "text-left")}>{children}</th>;
}
export function Td({ children, right, className }: { children: React.ReactNode; right?: boolean; className?: string }) {
  return <td className={cn("px-3 py-2.5 text-sm text-foreground/85 align-top", right && "text-right tabular-nums", className)}>{children}</td>;
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
        <span key={c} className="text-label-xs font-mono text-muted-foreground/70 border border-border/30 px-1 py-0.5 rounded leading-none" title={readableVariables(c)}>
          {c}
        </span>
      ))}
    </div>
  );
}

export function CellTable({ rows, onRowClick }: { rows: CellPerformanceRow[]; onRowClick?: (row: CellPerformanceRow) => void }) {
  return (
    <TableShell>
      <thead className="sticky top-0 bg-table-header z-10">
        <tr className="border-b border-border/40">
          <Th>Cell / concept</Th>
          <Th>Result type</Th>
          <Th right>Spend</Th>
          <Th right>Results</Th>
          <Th right>CPA</Th>
          <Th right>Link CTR</Th>
          <Th right>Result/click</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.cell_id + r["Result type"]}
            className={cn("border-b border-border/20 hover:bg-white/[0.02]", onRowClick && "cursor-pointer")}
            onClick={onRowClick ? () => onRowClick(r) : undefined}
          >
            <Td>
              <div className="font-medium text-foreground">{r.book2_concept_name}</div>
              <div className="text-label-xs font-mono text-muted-foreground/60 mt-0.5">{r.cell_id}{r.stage ? ` · ${r.stage}` : ""}</div>
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

export function VariableTable({ rows }: { rows: VariablePerformanceRow[] }) {
  return (
    <TableShell>
      <thead className="sticky top-0 bg-table-header z-10">
        <tr className="border-b border-border/40">
          <Th>Variable</Th>
          <Th>Family</Th>
          <Th>Result type</Th>
          <Th right>Spend</Th>
          <Th right>Ads</Th>
          <Th right>Results</Th>
          <Th right>CPA</Th>
          <Th right>Link CTR</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.variable_id + r["Result type"] + i} className="border-b border-border/20 hover:bg-white/[0.02]">
            <Td>
              <div className="font-medium text-foreground">{readableVariables(r.variable_id)}</div>
              <div className="text-label-xs font-mono text-muted-foreground/60 mt-0.5">{r.variable_id}</div>
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

export function DemographicTable({ rows }: { rows: DemographicRow[] }) {
  return (
    <TableShell>
      <thead className="sticky top-0 bg-table-header z-10">
        <tr className="border-b border-border/40">
          <Th>Cell</Th>
          <Th>Age</Th>
          <Th>Gender</Th>
          <Th right>Spend</Th>
          <Th right>Results</Th>
          <Th right>CPA</Th>
          <Th right>Result/click</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.cell_id + r.Age + r.Gender + i} className="border-b border-border/20 hover:bg-white/[0.02]">
            <Td><span className="font-mono text-label text-muted-foreground/60">{r.cell_id}</span></Td>
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

export function PlacementTable({ rows }: { rows: PlacementRow[] }) {
  return (
    <TableShell>
      <thead className="sticky top-0 bg-table-header z-10">
        <tr className="border-b border-border/40">
          <Th>Placement</Th>
          <Th>Platform</Th>
          <Th right>Spend</Th>
          <Th right>Results</Th>
          <Th right>CPA</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
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
      <thead className="sticky top-0 bg-table-header z-10">
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
            <Td>{r.confidence ? <span className="text-label-xs font-mono uppercase tracking-wider text-muted-foreground/60">{r.confidence.replace(/_/g, " ")}</span> : "—"}</Td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );
}
