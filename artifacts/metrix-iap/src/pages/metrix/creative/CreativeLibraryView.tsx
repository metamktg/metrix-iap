// ─── Creative · Library ──────────────────────────────────────────────
// The creative asset register — every mapped concept with its message
// system, variable stack, and the variable library aggregated across the
// account's concepts. Distinct from the IAP Library (Analysis): this is
// the subjective/asset side, the IAP Library is the objective/variable
// side of the same underlying data.

import { Fragment, useState } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getMST, getAnalysisData, getCreativeLinkContext } from "@/lib/data/metrixSeedAdapter";
import { ModuleHeader, ModuleScopeGate, ModuleTabs, CaveatNote, PendingState, readableVariables, CrossLink, InfoTooltip } from "../shared";
import { CreativeCard } from "@/components/creative/CreativeCard";
import { cardFromLibraryCell } from "@/lib/creative-assembly";
import { fmtMetric } from "@/lib/normalize";
import { Library, Tags, LayoutGrid } from "lucide-react";

const SECTION = "Creative · 05";

export function CreativeLibraryView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const [tab, setTab] = useState<string>("library");

  return (
    <ModuleScopeGate section={SECTION} title="Library" account={account}>
      {() => {
        const acct = account!;
        const mst = getMST(seed, adAccountId);

        if (!mst || mst.status !== "active" || !mst.local_book2_library?.length) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Library" />
              <PendingState title="No scanned creatives" message={mst?.render_policy ?? "The creative scan populates once the local library is mapped."} icon={Library} />
            </div>
          );
        }

        const library = mst.local_book2_library;

        const VAR_FAMILIES: { label: string; get: (c: (typeof library)[number]) => string | null | undefined }[] = [
          { label: "Hook", get: (c) => c.hook_variable },
          { label: "Tone", get: (c) => c.tone_variable },
          { label: "Framework", get: (c) => c.framework_variable },
          { label: "Concept", get: (c) => c.concept_variable },
          { label: "Proof", get: (c) => c.proof_variable },
          { label: "CTA", get: (c) => c.cta_variable },
          { label: "Funnel stage", get: (c) => c.funnel_stage_variable },
          { label: "Awareness", get: (c) => c.awareness_variable },
        ];
        const variableGroups = VAR_FAMILIES.map((f) => {
          const counts = new Map<string, number>();
          for (const c of library) {
            const raw = f.get(c);
            if (!raw) continue;
            counts.set(raw, (counts.get(raw) ?? 0) + 1);
          }
          const items = [...counts.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count);
          return { label: f.label, items };
        }).filter((g) => g.items.length > 0);
        const distinctVarCount = variableGroups.reduce((n, g) => n + g.items.length, 0);

        // Concept × funnel-stage cross-map: cost per result for every
        // mapped concept at every real funnel stage this account's
        // analysis actually carries. Stages come from the data itself
        // (CellPerformanceRow.stage), never a hardcoded list, so accounts
        // whose export doesn't populate stage render an honest empty state
        // instead of fabricated columns.
        const perfRows = getAnalysisData(seed, adAccountId)?.performance_by_cell ?? [];
        const crossStages = [...new Set(perfRows.map((r) => r.stage).filter((s): s is string => Boolean(s)))];
        const crossConcepts = [...new Set(library.map((c) => c.book2_concept_name))];
        const crossCell = (concept: string, stage: string) => {
          const rows = perfRows.filter((r) => r.book2_concept_name === concept && r.stage === stage);
          const spend = rows.reduce((n, r) => n + (r["Amount spent (USD)"] || 0), 0);
          const results = rows.reduce((n, r) => n + (r.Results || 0), 0);
          return { cpa: results > 0 ? spend / results : null, spend, results, tested: rows.length > 0 };
        };

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Library"
              subtitle="The scanned creative asset register and the variable library it produces."
              table="local_book2_library"
            />
            <ModuleTabs
              tabs={[
                { id: "library", label: "Concept library", count: library.length, Icon: Library },
                { id: "variables", label: "Variable library", count: distinctVarCount, Icon: Tags },
                { id: "cross", label: "Cross-map", count: crossConcepts.length, Icon: LayoutGrid },
              ]}
              active={tab}
              onChange={setTab}
            />
            <div className="px-6 py-5 space-y-4">
              <CaveatNote text={mst.render_policy} />

              {tab === "library" && (
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                  {library.map((c, i) => (
                    <CreativeCard
                      // local_book2_library carries one row per physical asset format
                      // (Feed/Square/Story, etc.) — the same cell_id legitimately
                      // repeats across rows, so it isn't a unique key on its own.
                      key={`${c.cell_id}-${(c as { asset_format?: string }).asset_format}-${i}`}
                      // cardFromLibraryCell (not cardFromCell) — this card must be
                      // built from THIS row, not re-resolved by cell_id. cardFromCell
                      // re-looks-up "the" library cell by id and returns the first
                      // match every time, which would render every asset-format
                      // variant of a cell as an identical copy of the first one.
                      data={cardFromLibraryCell(c, c.cell_id, {
                        perfRows: getAnalysisData(seed, adAccountId)?.performance_by_cell,
                        mst,
                        ...getCreativeLinkContext(seed, adAccountId),
                      })}
                      expandFooter={
                        <CrossLink to={`/app/analysis/library?focus=${c.cell_id}`} label="Open in IAP Library" />
                      }
                    />
                  ))}
                </div>
              )}

              {tab === "variables" && (
                distinctVarCount === 0 ? (
                  <PendingState title="No variables yet" message="The variable library aggregates from concepts in the local library." icon={Tags} />
                ) : (
                  <div className="space-y-5">
                    <div className="flex items-center gap-1.5">
                      <p className="text-body text-muted-foreground/80">Distinct creative variables in use, grouped by family.</p>
                      <InfoTooltip content="The count shows how many concepts in this account's local library use each variable." />
                    </div>
                    {variableGroups.map((g) => (
                      <div key={g.label}>
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-caption font-mono uppercase tracking-widest text-muted-foreground/70">{g.label}</h3>
                          <span className="text-label font-mono text-muted-foreground/60">{g.items.length}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {g.items.map((it) => (
                            <div key={it.code} className="flex items-center gap-2 rounded-lg border border-border/40 bg-white/[0.02] px-2.5 py-1.5">
                              <div>
                                <div className="text-body font-medium text-foreground/90 leading-tight">{readableVariables(it.code)}</div>
                                <div className="text-label font-mono text-muted-foreground/60 mt-0.5">{it.code}</div>
                              </div>
                              <span className="text-label font-mono text-muted-foreground/75 border border-border/40 rounded px-1.5 py-0.5 leading-none">×{it.count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {tab === "cross" && (
                crossStages.length === 0 || crossConcepts.length === 0 ? (
                  <PendingState
                    title="No cross-map yet"
                    message="This account's analysis doesn't carry funnel-stage labels on its cells yet, so a concept × funnel-stage read isn't available."
                    icon={LayoutGrid}
                  />
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-1.5">
                      <p className="text-body text-muted-foreground/80">Cost per result by concept and funnel stage.</p>
                      <InfoTooltip content="Aggregated from performance_by_cell for every asset mapped to a concept. Empty cells have no measured spend at that stage yet." />
                    </div>
                    <div className="overflow-x-auto">
                      <div
                        className="grid gap-1 min-w-[560px]"
                        style={{ gridTemplateColumns: `minmax(200px,1.6fr) repeat(${crossStages.length}, minmax(120px, 1fr))` }}
                      >
                        <span />
                        {crossStages.map((s) => (
                          <span key={s} className="text-label text-muted-foreground/60 text-center leading-tight pb-1.5">{s}</span>
                        ))}
                        {crossConcepts.map((concept) => (
                          <Fragment key={concept}>
                            <div className="text-body font-medium text-foreground/85 leading-tight py-1.5 pr-2 truncate" title={concept}>
                              {concept}
                            </div>
                            {crossStages.map((s) => {
                              const cell = crossCell(concept, s);
                              return (
                                <div
                                  key={`${concept}-${s}`}
                                  title={cell.tested ? `${fmtMetric("usd_total", cell.spend)} spend · ${cell.results} results` : "Untested — no measured spend at this stage"}
                                  className="rounded-md border border-border/30 bg-white/[0.015] py-1.5 text-center text-body tabular-nums text-foreground/85"
                                >
                                  {cell.tested ? fmtMetric("usd_unit", cell.cpa) : <span className="text-muted-foreground/40">—</span>}
                                </div>
                              );
                            })}
                          </Fragment>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
