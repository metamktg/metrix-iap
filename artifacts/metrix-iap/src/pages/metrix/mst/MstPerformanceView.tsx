// ─── MST · Performance ──────────────────────────────────────────────
// Full 7-layer MST_TEST_ENGINE_v2.0.md analysis, computed client-side by
// lib/mst-analysis.ts (pure aggregation over historical_matrix_4x4 +
// performance_by_cell — no LLM, nothing fabricated): column/avatar
// winners, cross-avatar row consistency, diagonal isolation, individual
// variable verdicts, pairwise synergy, and the master crossmap
// leaderboard. Terminal metric label/direction resolve through the
// account's cohort (never hardcoded to CPA) so this reads correctly for
// every business-model cohort, not just ecommerce.

import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getMST, getAnalysisData } from "@/lib/data/metrixSeedAdapter";
import { runMstAnalysis, type Verdict } from "@/lib/mst-analysis";
import { resolveCohortMeta } from "@/lib/data/cohortMeta";
import {
  ModuleHeader, ScopeBanner, ModuleScopeGate, PendingState, MetricTile,
  CaveatNote, SectionCard, DetailReveal, readableVariables, fmtUSD, fmtNum,
} from "../shared";
import { cn } from "@/lib/utils";
import { TrendingUp, Users, GitMerge, Sparkles } from "lucide-react";

const SECTION = "MST · 06";

const VERDICT_LABEL: Record<Verdict, string> = {
  universal_winner: "Universal winner",
  avatar_dependent: "Avatar-dependent",
  underperformer: "Underperformer",
  insufficient_data: "Insufficient data",
};

const VERDICT_STYLE: Record<Verdict, string> = {
  universal_winner: "text-emerald-300 border-emerald-500/30 bg-emerald-500/[0.06]",
  avatar_dependent: "text-amber-300 border-amber-500/30 bg-amber-500/[0.06]",
  underperformer: "text-red-300 border-red-500/30 bg-red-500/[0.06]",
  insufficient_data: "text-muted-foreground/70 border-border/40 bg-white/[0.02]",
};

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  return (
    <span className={cn("text-label px-1.5 py-0.5 rounded border leading-none whitespace-nowrap", VERDICT_STYLE[verdict])}>
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

export function MstPerformanceView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);

  return (
    <ModuleScopeGate section={SECTION} title="Performance" account={account}>
      {() => {
        const acct = account!;
        const mst = getMST(seed, adAccountId);
        const analysis = getAnalysisData(seed, adAccountId);
        const cohortMeta = resolveCohortMeta(acct.cohort);
        const analysisResult = analysis ? runMstAnalysis(mst, analysis.performance_by_cell, cohortMeta.terminalMetricDirection) : null;

        if (!mst || mst.status !== "active" || !analysis || !analysisResult) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Performance" />
              <ScopeBanner account={acct} />
              <PendingState title="No test results yet" message={mst?.render_policy ?? "MST performance appears once the matrix and performance data both exist."} icon={TrendingUp} />
            </div>
          );
        }

        const { columnAnalysis, rowAnalysis, diagonalAnalysis, crossmap, combinationSynergy } = analysisResult;
        const goldenFormula = combinationSynergy.find((c) => c.isGoldenFormula);
        const topWinner = crossmap.find((c) => c.verdict === "universal_winner");
        const fmtMetric = (v: number | null) => (v == null ? "—" : fmtUSD(v));

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Performance"
              subtitle={`Universal vs avatar-specific winners, ranked by ${cohortMeta.terminalMetricLabel}.`}
              table="historical_matrix_4x4, performance_by_cell"
            />
            <ScopeBanner account={acct} />
            <div className="px-6 pt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricTile label="Variables ranked" value={String(crossmap.length)} />
              <MetricTile label="Avatars/columns" value={String(columnAnalysis.length)} />
              <MetricTile label={`Top ${cohortMeta.terminalMetricLabel}`} value={topWinner ? fmtMetric(topWinner.agg.terminalMetricValue) : "—"} />
              <MetricTile label="Universal winners" value={String(crossmap.filter((c) => c.verdict === "universal_winner").length)} />
            </div>
            <div className="px-6 py-5 space-y-4 max-w-4xl">
              <CaveatNote text={`Verdicts are computed from observed cells only — rows/variables with fewer than 2 appearances are marked "insufficient data" rather than scored. Ranked by ${cohortMeta.terminalMetricLabel} (${cohortMeta.terminalMetricDirection === "lower_is_better" ? "lower is better" : "higher is better"}).`} />

              {goldenFormula && (
                <SectionCard title="Golden formula" desc="Highest-performing variable combination found across the matrix.">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Sparkles className="w-3.5 h-3.5 text-[hsl(var(--metrix-gold))]" />
                    {goldenFormula.codes.map((c) => (
                      <span key={c} className="text-label font-mono text-foreground/85 border border-border/40 bg-white/[0.03] px-1.5 py-0.5 rounded leading-none">{readableVariables(c)}</span>
                    ))}
                    <span className="text-caption text-muted-foreground/70 tabular-nums ml-1">{fmtMetric(goldenFormula.agg.terminalMetricValue)} · {fmtNum(goldenFormula.appearances)} cells</span>
                  </div>
                </SectionCard>
              )}

              <SectionCard title="Variable leaderboard" desc="Every isolated variable, ranked across all its appearances (layer 5 + 7 crossmap).">
                <div className="space-y-1.5">
                  {crossmap.slice(0, 12).map((v) => (
                    <div key={v.code} className="flex items-center justify-between gap-2 py-1 border-b border-border/20 last:border-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-label font-mono text-muted-foreground/50 w-5 shrink-0">{v.rank}</span>
                        <span className="text-body text-foreground/85 truncate">{readableVariables(v.code)}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-caption text-muted-foreground/60 tabular-nums">{fmtMetric(v.agg.terminalMetricValue)} · {v.appearances}×</span>
                        <VerdictBadge verdict={v.verdict} />
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>

              <SectionCard title="Avatar / column winners" desc="Best-performing concept per avatar — may differ from the universal winner.">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {columnAnalysis.map((col) => {
                    const top = col.variants[0];
                    return (
                      <div key={col.columnId} className="rounded-xl border border-border/40 bg-white/[0.02] p-3">
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Users className="w-3 h-3 text-interactive/60" />
                          <span className="text-caption font-medium text-foreground">{col.columnLabel}</span>
                        </div>
                        <p className="text-body text-foreground/85">{top ? readableVariables(top.conceptCode) : "—"}</p>
                        <p className="text-label text-muted-foreground/60 mt-0.5 tabular-nums">{top ? fmtMetric(top.value) : "—"} · {col.agg.appearances} rows</p>
                        {col.retire.length > 0 && col.retire[0] !== col.scale[0] && (
                          <DetailReveal
                            label="Retire candidate"
                            sections={[{ text: `${col.retire[0]} ranked last in this column's tested variants.` }]}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </SectionCard>

              <SectionCard title="Row consistency" desc="Does this shared variable work the same way across every avatar, or only some?">
                <div className="space-y-2">
                  {rowAnalysis.map((row) => (
                    <div key={row.rowId} className="flex items-center justify-between gap-3 rounded-lg border border-border/30 bg-white/[0.01] px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-body text-foreground/85">{readableVariables(row.sharedVariable)}</p>
                        <p className="text-label text-muted-foreground/60 mt-0.5">{row.byColumn.map((c) => `${c.columnLabel}: ${c.standing}`).join(" · ")}</p>
                      </div>
                      <VerdictBadge verdict={row.verdict} />
                    </div>
                  ))}
                </div>
              </SectionCard>

              <SectionCard title="Diagonal isolation" desc="Maximum-diversity read: the same variable tested against every avatar and context at once.">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {diagonalAnalysis.map((d) => (
                    <div key={d.role} className="rounded-xl border border-border/40 bg-white/[0.02] p-3">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="flex items-center gap-1.5 text-caption font-medium text-foreground"><GitMerge className="w-3 h-3 text-interactive/60" /> {d.label}</span>
                        <VerdictBadge verdict={d.verdict} />
                      </div>
                      <p className="text-label text-muted-foreground/60 tabular-nums">{fmtMetric(d.agg.terminalMetricValue)} · {d.cellIds.join(", ")}</p>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </div>
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
