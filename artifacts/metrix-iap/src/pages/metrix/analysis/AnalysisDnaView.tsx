// ─── Analysis · Creative DNA ────────────────────────────────────────────
// The canvas's analysis.dna screen (nav lineage: analysis.v3_variable_
// performance[] · scaling_playbook). Two of the canvas's three cards have
// real backing and are built here; the third does not and is deliberately
// left out:
//
//  - "Gene loci": real. Each row is one analysis.v3_variable_performance
//    entry; lift is that row's Result_per_link_click_pct against the
//    account's spend-weighted average across every measured variable — a
//    real derivation, never an invented isolation score. Clicking a row
//    opens the existing VariableDrilldownModal (same modal the IAP
//    Library's DNA family cards already use).
//
//  - "Formula sequences": real. strategy.variable_combinations rows,
//    rendered with the exact VariableCombinationsGrid component Strategy
//    Map already uses for the same field — one real renderer, not a
//    parallel copy that could drift from it.
//
//  - "Golden formula": NOT built. No seed field computes an account's
//    winning variable stack, and this account's own loop_status marks
//    optimization_loop — the stage that would produce one — as pending.
//    That capability's honest "not yet automated" page already exists at
//    MST → Direction; this page links to it via a single-line note quoting
//    the seed's own pending reason, rather than fabricating a formula
//    sentence or stat tiles.

import { useState } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getAnalysisData, getStrategyData } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ModuleScopeGate, PendingState, SectionCard, CrossLink,
  fmtUSD, fmtNum, useShowMore, ShowMoreButton, SectionInfoIcon,
} from "../shared";
import { VariableChip, VariableCombinationsGrid, familyLabel } from "../strategy/strategyShared";
import { VariableDrilldownModal } from "@/components/creative/VariableDrilldownModal";
import { Dna } from "lucide-react";
import { TYPE } from "../typography";
import { cn } from "@workspace/command-deck/lib/utils";
import type { VariablePerformanceRow } from "@/lib/data/seedTypes";

const SECTION = "Analysis · 03";
const LOCI_SHOWN = 8;

// ─── Gene loci: per-variable lift vs. the account's spend-weighted average ─

interface LocusRow {
  code: string;
  family: string;
  spend: number;
  results: number;
  uniqueAds: number;
  rate: number;
  /** Percent lift vs. the spend-weighted average rate; null when no spend exists to weight by. */
  lift: number | null;
}

function buildLocusRows(rows: VariablePerformanceRow[]): LocusRow[] {
  const totalSpend = rows.reduce((n, r) => n + r["Amount spent (USD)"], 0);
  const weightedRateSum = rows.reduce(
    (n, r) => n + r.Result_per_link_click_pct * r["Amount spent (USD)"],
    0
  );
  const avgRate = totalSpend > 0 ? weightedRateSum / totalSpend : null;
  return rows
    .map((r) => ({
      code: r.variable_id,
      family: r.variable_family,
      spend: r["Amount spent (USD)"],
      results: r.Results,
      uniqueAds: r.unique_ads,
      rate: r.Result_per_link_click_pct,
      lift:
        avgRate != null && avgRate > 0
          ? ((r.Result_per_link_click_pct - avgRate) / avgRate) * 100
          : null,
    }))
    .sort((a, b) => b.spend - a.spend);
}

const LOCUS_BAR_MAX = 60; // percent lift clamp — outliers still read as "far", never overflow the row

function LocusBar({ lift }: { lift: number | null }) {
  if (lift == null) {
    return (
      <div className="relative h-5 flex items-center justify-center">
        <span className={cn(TYPE.label, "text-muted-foreground/40 normal-case tracking-normal")}>n/a</span>
      </div>
    );
  }
  const positive = lift >= 0;
  const magnitude = Math.min(Math.abs(lift), LOCUS_BAR_MAX);
  const width = (magnitude / LOCUS_BAR_MAX) * 38; // percent of the track, each side maxes at 38%
  return (
    <div className="relative h-5">
      <div className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 bg-border/50" aria-hidden />
      <div
        className={cn(
          "absolute top-0.5 h-4 rounded-sm",
          positive ? "bg-status-success/50" : "bg-status-danger/45"
        )}
        style={
          positive
            ? { left: "50%", width: `${width}%` }
            : { right: "50%", width: `${width}%` }
        }
      />
      <span
        className={cn(
          "absolute top-0 text-label font-semibold tabular-nums whitespace-nowrap",
          positive ? "text-status-success" : "text-status-danger"
        )}
        style={
          positive
            ? { left: `calc(50% + ${width}% + 6px)` }
            : { right: `calc(50% + ${width}% + 6px)` }
        }
      >
        {positive ? "+" : ""}
        {lift.toFixed(0)}%
      </span>
    </div>
  );
}

function GeneLociCard({
  rows,
  onOpenVariable,
}: {
  rows: VariablePerformanceRow[];
  onOpenVariable: (code: string) => void;
}) {
  const locusRows = buildLocusRows(rows);
  const { visible, expanded, toggle, hiddenCount } = useShowMore(locusRows, LOCI_SHOWN);

  return (
    <SectionCard
      title="Gene loci"
      desc="Isolated effect of each measured variable, ranked by spend — each locus is a variable the platform can brief against."
      table="analysis.v3_variable_performance"
      right={
        <SectionInfoIcon tip="Lift is each variable's result rate (results ÷ link clicks) against the account's spend-weighted average across every measured variable. Click a row for the full drill-down." />
      }
    >
      <div className="flex flex-col" data-testid="gene-loci-list">
        {visible.map((v, idx) => (
          <button
            key={v.code}
            type="button"
            onClick={() => onOpenVariable(v.code)}
            data-testid={`locus-row-${v.code}`}
            title={`${v.uniqueAds} ad${v.uniqueAds === 1 ? "" : "s"} · ${fmtUSD(v.spend, 0)} spend · ${fmtNum(v.results)} results`}
            className="grid grid-cols-[30px_minmax(110px,150px)_1fr] items-center gap-3 w-full border-t border-border/25 first:border-t-0 py-2.5 text-left hover:bg-foreground/[0.02] transition-colors rounded-sm"
          >
            <span className={cn(TYPE.microLabel, "flex items-center justify-center w-[22px] h-[22px] rounded-full border border-border/50 tracking-normal")}>
              L{idx + 1}
            </span>
            <div className="flex flex-col gap-0.5 min-w-0">
              <VariableChip code={v.code} className="w-fit" />
              <span className={cn(TYPE.microLabel, "text-muted-foreground/40 normal-case tracking-normal")}>
                {familyLabel(v.family)}
              </span>
            </div>
            <LocusBar lift={v.lift} />
          </button>
        ))}
      </div>
      <ShowMoreButton
        total={locusRows.length}
        hiddenCount={hiddenCount}
        expanded={expanded}
        onToggle={toggle}
        noun="variables"
      />
    </SectionCard>
  );
}

// ─── Main view ────────────────────────────────────────────────────────

export function AnalysisDnaView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const analysis = getAnalysisData(seed, adAccountId);
  const strategy = getStrategyData(seed, adAccountId);
  const [variableCode, setVariableCode] = useState<string | null>(null);

  const variableRows = analysis?.v3_variable_performance ?? [];
  const combinations = strategy?.variable_combinations ?? [];
  const optimizationLoop = account?.iap?.loop_status?.find(
    (s) => s.stage === "optimization_loop"
  );

  return (
    <>
      <ModuleScopeGate section={SECTION} title="Creative DNA" account={account}>
        {() => {
          if (variableRows.length === 0 && combinations.length === 0) {
            return (
              <div className="flex-1 flex flex-col">
                <ModuleHeader section={SECTION} title="Creative DNA" accountName={account!.name} tabs="analysis" />
                <PendingState
                  title="No creative DNA signal"
                  message="Gene loci and formula sequences appear once variable-level performance or tested combinations exist for this account."
                  icon={Dna}
                  action={<CrossLink to="/app/analysis/library" label="Review IAP Library" />}
                />
              </div>
            );
          }

          return (
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
              <ModuleHeader
                section={SECTION}
                title="Creative DNA"
                accountName={account!.name}
                subtitle="Per-variable lift and tested combinations — the account's isolated creative signal."
                tabs="analysis"
              />
              <div className="px-6 py-5 space-y-4 max-w-5xl">
                {variableRows.length > 0 && (
                  <GeneLociCard rows={variableRows} onOpenVariable={setVariableCode} />
                )}

                {combinations.length > 0 && (
                  <SectionCard
                    title="Formula sequences"
                    desc="Each sequence is a stack of variables as it would brief, read left to right — the account's real tested combinations."
                    table="strategy.variable_combinations"
                    right={<CrossLink to="/app/strategy/map" label="Open in Strategy Map" />}
                  >
                    <VariableCombinationsGrid combinations={combinations} />
                  </SectionCard>
                )}

                {/* Golden formula: no real field computes this yet — the seed's
                    own loop_status says so. Point at the honest page instead of
                    fabricating a formula sentence or stat tiles. */}
                <div className="flex items-center justify-between gap-3 flex-wrap rounded-lg border border-border/25 bg-foreground/[0.015] px-3.5 py-2.5">
                  <p className={cn(TYPE.caption, "text-muted-foreground/70")}>
                    <span className="font-semibold text-muted-foreground/85">Golden formula — </span>
                    {optimizationLoop?.note ??
                      "Not yet computed for this account — requires the Optimization Loop stage to run."}
                  </p>
                  <CrossLink to="/app/mst/direction" label="Open MST · Direction" />
                </div>
              </div>
            </div>
          );
        }}
      </ModuleScopeGate>
      {account && analysis && (
        <VariableDrilldownModal
          open={variableCode != null}
          onClose={() => setVariableCode(null)}
          code={variableCode}
          analysis={analysis}
          variableRows={variableRows}
          selectedResultTypes={null}
        />
      )}
    </>
  );
}
