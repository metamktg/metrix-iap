// ─── Analysis ─────────────────────────────────────────────────────────
// Scoped to the active ad account. Human-readable descriptors first; raw
// variable codes secondary. Renders only source-backed metrics.

import { useState } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { getAdAccount, getAnalysisData } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ScopeBanner, CaveatNote, UnconfiguredState, PendingState,
  readableVariables, fmtUSD, fmtNum, fmtPct, eventLabel,
} from "./shared";
import { cn } from "@/lib/utils";
import type { CellPerformanceRow, VariablePerformanceRow, DemographicRow, PlacementRow } from "@/lib/data/seedTypes";

// ─── Small table primitives ───────────────────────────────────────────

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={cn("text-[9px] font-mono uppercase tracking-widest text-muted-foreground/40 font-semibold px-2.5 py-2", right ? "text-right" : "text-left")}>{children}</th>;
}
function Td({ children, right, className }: { children: React.ReactNode; right?: boolean; className?: string }) {
  return <td className={cn("px-2.5 py-2 text-[11px] text-foreground/80 align-top", right && "text-right tabular-nums", className)}>{children}</td>;
}

function TableShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/40 overflow-hidden bg-white/[0.015]">
      <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
        <table className="w-full border-collapse">{children}</table>
      </div>
    </div>
  );
}

// ─── Tables ───────────────────────────────────────────────────────────

function CellTable({ rows }: { rows: CellPerformanceRow[] }) {
  return (
    <TableShell>
      <thead className="sticky top-0 bg-[hsl(222_55%_7%)] z-10">
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
          <tr key={r.cell_id + r["Result type"]} className="border-b border-border/20 hover:bg-white/[0.02]">
            <Td>
              <div className="font-medium text-foreground">{r.book2_concept_name}</div>
              <div className="text-[9px] font-mono text-muted-foreground/40 mt-0.5">{r.cell_id}{r.stage ? ` · ${r.stage}` : ""}</div>
              {r.iap_read && <div className="text-[10px] text-muted-foreground/55 mt-1 leading-snug max-w-md">{r.iap_read}</div>}
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

function VariableTable({ rows }: { rows: VariablePerformanceRow[] }) {
  return (
    <TableShell>
      <thead className="sticky top-0 bg-[hsl(222_55%_7%)] z-10">
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
              <div className="text-[9px] font-mono text-muted-foreground/40 mt-0.5">{r.variable_id}</div>
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

function DemographicTable({ rows }: { rows: DemographicRow[] }) {
  return (
    <TableShell>
      <thead className="sticky top-0 bg-[hsl(222_55%_7%)] z-10">
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

function PlacementTable({ rows }: { rows: PlacementRow[] }) {
  return (
    <TableShell>
      <thead className="sticky top-0 bg-[hsl(222_55%_7%)] z-10">
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

// ─── Page ─────────────────────────────────────────────────────────────

type Tab = "cells" | "variables" | "demographics" | "placements";

export function AnalysisView() {
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(adAccountId);
  const [tab, setTab] = useState<Tab>("cells");

  if (!account) {
    return (
      <div className="flex-1 flex flex-col">
        <ModuleHeader section="Analysis · 02" title="Analysis" />
        <PendingState title="No ad account selected" message="Choose an ad account to view its analysis." />
      </div>
    );
  }
  if (account.status !== "configured") {
    return (
      <div className="flex-1 flex flex-col">
        <ModuleHeader section="Analysis · 02" title="Analysis" />
        <UnconfiguredState account={account} />
      </div>
    );
  }

  const a = getAnalysisData(adAccountId);
  if (!a) {
    return (
      <div className="flex-1 flex flex-col">
        <ModuleHeader section="Analysis · 02" title="Analysis" />
        <ScopeBanner account={account} />
        <PendingState title="Analysis pending" message="No analysis data available for this account yet." />
      </div>
    );
  }

  const TABS: { id: Tab; label: string; count: number }[] = [
    { id: "cells", label: "Creative cells", count: a.performance_by_cell.length },
    { id: "variables", label: "Variables", count: a.v3_variable_performance.length },
    { id: "demographics", label: "Demographics", count: a.demographic_registration_signal.length },
    { id: "placements", label: "Placements", count: a.v3_placement_signal.length + a.c4e_placement_signal.length },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <ModuleHeader section="Analysis · 02" title="Analysis" subtitle="Creative, variable, demographic, and placement performance for this account." table="performance_by_cell, v3_variable_performance" />
      <ScopeBanner account={account} />

      {/* Tab bar */}
      <div className="px-6 border-b border-border/40 flex items-center gap-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn("flex items-center gap-1.5 h-10 px-3 text-[12px] font-medium border-b-2 transition-colors", tab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground/60 hover:text-foreground")}
          >
            {t.label}
            <span className="text-[9px] font-mono text-muted-foreground/40">{t.count}</span>
          </button>
        ))}
      </div>

      <div className="px-6 py-5 space-y-4">
        <CaveatNote text={a.performance_by_cell[0]?.iap_read ? "V3 checkout results were not populated by age/gender. Demographic checkout claims remain directional based on spend and click quality, not result counts." : "Demographic checkout claims remain directional."} />

        {tab === "cells" && <CellTable rows={a.performance_by_cell} />}
        {tab === "variables" && <VariableTable rows={a.v3_variable_performance} />}
        {tab === "demographics" && <DemographicTable rows={a.demographic_registration_signal} />}
        {tab === "placements" && (
          <div className="space-y-5">
            <div>
              <h3 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/40 mb-2">V3 placement signal</h3>
              <PlacementTable rows={a.v3_placement_signal} />
            </div>
            <div>
              <h3 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/40 mb-2">C4E placement signal</h3>
              <PlacementTable rows={a.c4e_placement_signal} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
