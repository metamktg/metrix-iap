// ─── Analysis · IAP Library ───────────────────────────────────────────
// Creative cell + variable performance for the active ad account, with
// metric selection (result events), inline variable codes, a cell drill-
// down drawer, and cross-links into Strategy and Creative Briefs.

import { useState, useEffect, useMemo } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getAnalysisData, getStrategyData, getCampaignSummary } from "@/lib/data/metrixSeedAdapter";
import { useMetricSelection } from "@/lib/metric-selection";
import {
  ModuleHeader, ScopeBanner, ModuleTabs, ModuleScopeGate, PendingState,
  MetricTile, CaveatNote, MetricSelectionBar, CrossLink, useFocusParam,
  readableVariables, fmtUSD, fmtNum, fmtPct, eventLabel,
} from "../shared";
import { CellTable, VariableTable } from "./tables";
import { InfoDrawer, DrawerField } from "@/components/ui/InfoDrawer";
import type { CellPerformanceRow } from "@/lib/data/seedTypes";

const SECTION = "Analysis · 02";

type Tab = "cells" | "top" | "variables";

const VARIABLE_FIELDS: { key: keyof CellPerformanceRow; label: string }[] = [
  { key: "hook_variable", label: "Hook" },
  { key: "tone_variable", label: "Tone" },
  { key: "framework_variable", label: "Framework" },
  { key: "concept_variable", label: "Concept" },
  { key: "pain_proof_variable", label: "Pain / proof" },
  { key: "proof_variable", label: "Proof" },
  { key: "cta_variable", label: "CTA" },
];

export function IapLibraryView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const [tab, setTab] = useState<Tab>("cells");
  const focus = useFocusParam();
  const [detail, setDetail] = useState<CellPerformanceRow | null>(null);

  const a = getAnalysisData(seed, adAccountId);
  const summary = getCampaignSummary(seed, adAccountId);
  const strategy = getStrategyData(seed, adAccountId);

  const allEvents = useMemo(
    () => Object.keys(summary?.bottom_line_totals ?? {}),
    [summary]
  );
  const { selected, toggle, isSelected } = useMetricSelection(adAccountId ?? "none", allEvents);

  // Deep-link: ?focus=<cell_id> opens the drawer on that cell
  useEffect(() => {
    if (focus && a) {
      const match = a.performance_by_cell.find((r) => r.cell_id === focus);
      if (match) setDetail(match);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, adAccountId]);

  return (
    <ModuleScopeGate section={SECTION} title="IAP Library" account={account}>
      {() => {
        const acct = account!;
        if (!a) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="IAP Library" />
              <ScopeBanner account={acct} />
              <PendingState title="Analysis pending" message="No analysis data available for this account yet." />
            </div>
          );
        }

        const filterRows = <T extends { "Result type": string }>(rows: T[]) =>
          rows.filter((r) => selected.includes(r["Result type"]));

        const cells = filterRows(a.performance_by_cell);
        const variables = filterRows(a.v3_variable_performance);
        const topCells = filterRows(a.top_checkout_cells);
        const topVariables = filterRows(a.top_checkout_variables);

        const totalSpend = cells.reduce((s, r) => s + r["Amount spent (USD)"], 0);
        const totalResults = cells.reduce((s, r) => s + r.Results, 0);
        const uniqueCells = new Set(cells.map((r) => r.cell_id)).size;

        const TABS: { id: Tab; label: string; count: number }[] = [
          { id: "cells", label: "Creative cells", count: cells.length },
          { id: "top", label: "Top performers", count: topCells.length + topVariables.length },
          { id: "variables", label: "Creative DNA", count: variables.length },
        ];

        const pillarsForCell = (cellId: string) =>
          (strategy?.message_pillars ?? []).filter((p) => p.source_cells.includes(cellId));

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="IAP Library"
              subtitle="Creative cell and variable performance, filtered by metric selection."
              table="performance_by_cell, v3_variable_performance"
            />
            <ScopeBanner account={acct} />
            <MetricSelectionBar events={allEvents} isSelected={isSelected} onToggle={toggle} />

            <div className="px-6 pt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricTile label="Creative cells" value={String(uniqueCells)} />
              <MetricTile label="Spend (selected)" value={fmtUSD(totalSpend, 0)} />
              <MetricTile label="Results (selected)" value={fmtNum(totalResults)} />
              <MetricTile label="Avg CPA" value={totalResults > 0 ? fmtUSD(totalSpend / totalResults) : "—"} sub="spend ÷ results across selection" />
            </div>

            <div className="mt-4">
              <ModuleTabs tabs={TABS} active={tab} onChange={(id) => setTab(id)} />
            </div>

            <div className="px-6 py-5 space-y-4">
              <CaveatNote text="V3 checkout results were not populated by age/gender. Demographic checkout claims remain directional based on spend and click quality, not result counts." />

              {tab === "cells" && (
                cells.length ? <CellTable rows={cells} onRowClick={setDetail} /> : <PendingState title="No cells in selection" message="Adjust the metric selection to see cell performance." />
              )}
              {tab === "top" && (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/40 mb-2">Top checkout cells</h3>
                    {topCells.length ? <CellTable rows={topCells} onRowClick={setDetail} /> : <PendingState title="No ranked cells" message="No checkout-ranked cells in the current metric selection." />}
                  </div>
                  <div>
                    <h3 className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/40 mb-2">Top checkout variables</h3>
                    {topVariables.length ? <VariableTable rows={topVariables} /> : <PendingState title="No ranked variables" message="No checkout-ranked variables in the current metric selection." />}
                  </div>
                </div>
              )}
              {tab === "variables" && (
                variables.length ? <VariableTable rows={variables} /> : <PendingState title="No variables in selection" message="Adjust the metric selection to see variable performance." />
              )}
            </div>

            {detail && (
              <InfoDrawer
                kicker={`Creative cell · ${detail.cell_id}`}
                title={detail.book2_concept_name}
                onClose={() => setDetail(null)}
                footer={
                  <div className="flex items-center gap-4">
                    <CrossLink to="/app/strategy/hypotheses" label="Open Hypothesis Queue" />
                    <CrossLink to="/app/briefs/builder" label="Open Brief Builder" />
                    <CrossLink to="/app/mst" label="View in MST" />
                  </div>
                }
              >
                <div className="grid grid-cols-2 gap-3">
                  <MetricTile label="Spend" value={fmtUSD(detail["Amount spent (USD)"], 0)} />
                  <MetricTile label="Results" value={fmtNum(detail.Results)} sub={eventLabel(detail["Result type"])} />
                  <MetricTile label="CPA" value={detail.CPA_result != null ? fmtUSD(detail.CPA_result) : "—"} />
                  <MetricTile label="Link CTR" value={fmtPct(detail.CTR_link_pct)} />
                </div>
                {detail.iap_read && <DrawerField label="IAP read">{detail.iap_read}</DrawerField>}
                <DrawerField label="Variable stack">
                  <div className="space-y-1.5">
                    {VARIABLE_FIELDS.map(({ key, label }) => {
                      const code = detail[key];
                      if (!code || typeof code !== "string") return null;
                      return (
                        <div key={key} className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">{label}</span>
                          <span className="text-[11px] text-foreground/80 text-right">
                            {readableVariables(code)}
                            <span className="block text-[8px] font-mono text-muted-foreground/40">{code}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </DrawerField>
                {pillarsForCell(detail.cell_id).length > 0 && (
                  <DrawerField label="Feeds strategy pillars">
                    <div className="space-y-1">
                      {pillarsForCell(detail.cell_id).map((p) => (
                        <div key={p.id} className="text-[11px] text-foreground/80">{p.label}</div>
                      ))}
                    </div>
                  </DrawerField>
                )}
                {detail.legacy_library_match && (
                  <DrawerField label="Legacy library match">
                    <span className="font-mono text-[10px] text-muted-foreground/60">{detail.legacy_library_match}</span>
                  </DrawerField>
                )}
              </InfoDrawer>
            )}
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
