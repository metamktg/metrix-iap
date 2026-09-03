// ─── Creative · Library ──────────────────────────────────────────────
// The creative asset register — every mapped concept with its message
// system, variable stack, and the variable library aggregated across the
// account's concepts. Distinct from the IAP Library (Analysis): this is
// the subjective/asset side, the IAP Library is the objective/variable
// side of the same underlying data.
//
// "Next moves" (top of page): the account's optimization-loop
// recommendation cards scoped to creative actions (actionGroupForScope
// === "Creative actions" — the same categorization RecommendationDeck and
// ActionQueueView already use), so this never invents a separate queue.
// Each card can open the real evidence cell (when the card's text
// references one) or file a real Task Tray item — never both fabricated.
//
// Variable chips (Variable library tab) and cross-map cells (Cross-map
// tab) are real click targets: chips open the shared VariableDrilldownModal
// (only once real analysis rows exist to drive it); cross-map cells with
// measured spend open that cell's real creative, cells with no measured
// spend file a real "Test <concept> on <stage>" Task Tray item instead of
// a fabricated interaction.

import { useResultScope } from "@/hooks/useResultScope";
import { ResultScopeBar, LandedScopeNote } from "@/components/analysis/ResultScopeBar";
import { Fragment, useState, type ReactNode } from "react";
import { cn } from "@workspace/command-deck/lib/utils";
import { HEADING } from "../typography";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getMST, getAnalysisData, getCreativeLinkContext, getOptimizationLoop, getCreativeComponents } from "@/lib/data/metrixSeedAdapter";
import { CreativeComponentsPanel } from "@/components/creative/CreativeComponentsPanel";
import { CreativeSourceNudge } from "@/components/creative/CreativeSourceNudge";
import { ModuleHeader, ModuleScopeGate, ModuleTabs, CaveatNote, PendingState, readableVariables, CrossLink, InfoTooltip, SectionCard } from "../shared";
import { CreativeCard } from "@/components/creative/CreativeCard";
import { CreativeExpandDialog } from "@/components/creative/CreativeExpandDialog";
import { VariableDrilldownModal } from "@/components/creative/VariableDrilldownModal";
import { AddToTrayButton } from "@/components/tray/AddToTrayButton";
import { actionGroupForScope } from "@/components/deck/RecommendationDeck";
import { addToTray, removeFromTray, isInTray, useTrayItems } from "@/lib/data/trayStore";
import { cardFromLibraryCell, cardFromCell } from "@/lib/creative-assembly";
import { fmtMetric } from "@/lib/normalize";
import { demographicEmptyReasonFor, placementsEmptyReasonFor, funnelEmptyReasonFor } from "@/lib/creative-empty-reasons";
import type { DemographicRow, PlacementRow } from "@/lib/data/seedTypes";
import { TokenizedConceptText } from "@/components/concept/ConceptChip";
import { Library, Tags, LayoutGrid, ClipboardList, Check, AlignLeft } from "lucide-react";
import type { RecommendationCard } from "@/lib/data/seedTypes";
import { scopeToRun } from "@/lib/run-supersede";

const SECTION = "Creative · 05";

// ─── "Next moves" kind tag ──────────────────────────────────────────────
// Same three-way read as ActionQueueView's actionVerb — duplicated locally
// (it isn't exported) rather than importing a page-local helper. Reuses the
// same Tailwind color families as RecommendationDeck's IMPACT_STYLE / QueueCard
// verb chips instead of inventing a new palette.
function kindOf(recommended_action: string): { label: string; cls: string } {
  const a = recommended_action.toLowerCase();
  if (a.includes("scale")) return { label: "Scale", cls: "text-status-success border-status-success/25" };
  if (a.includes("pause") || a.includes("kill") || a.includes("stop")) return { label: "Retire", cls: "text-status-danger border-status-danger/25" };
  return { label: "Fix", cls: "text-status-warning border-status-warning/25" };
}

/** Cell ids (e.g. "C2B") a recommendation references in its own evidence text — same
 *  extraction RecommendationsView uses for its segment drill-down deep link. */
function cellIdsForCard(card: RecommendationCard, knownCells: Set<string>): string[] {
  const text = [card.source_path, card.rationale, card.title, card.recommended_action].filter(Boolean).join(" ");
  const found = new Set<string>();
  for (const m of text.matchAll(/\bC\d+[A-Z]\b/g)) {
    if (knownCells.has(m[0])) found.add(m[0]);
  }
  return Array.from(found);
}

export function CreativeLibraryView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const resultScope = useResultScope(account, adAccountId);
  const [tab, setTab] = useState<string>("library");
  const [variableCode, setVariableCode] = useState<string | null>(null);
  const [openCellId, setOpenCellId] = useState<string | null>(null);
  useTrayItems(); // subscribe so "queued" state on cross-map cells reflects live tray changes

  return (
    <ModuleScopeGate section={SECTION} title="Library" account={account}>
      {() => {
        const acct = account!;
        const mst = getMST(seed, adAccountId);
        const a = getAnalysisData(seed, adAccountId);
        const cardCtx = { perfRows: a?.performance_by_cell, mst, ...getCreativeLinkContext(seed, adAccountId) };

        // Source precedence (owner decision 2026-09-02): when the scanned
        // creative library is absent, the copy-level components the export
        // already carries stand in, named as such. The page is blank only
        // when neither exists.
        const components = getCreativeComponents(seed, adAccountId);
        const hasComponents = Boolean(components && components.coverage.ads_with_copy > 0);
        const hasLibrary = Boolean(mst && mst.status === "active" && mst.local_book2_library?.length);
        // Rollup rows land where THEIR data is before the reader chooses
        // (useResultScope.landRows; pre-split null-typed rows are kept). The
        // scope bar below the header makes the active scope visible — this
        // page scoped its rows silently before.
        const rollupLanding = resultScope.landRows(scopeToRun(a?.concept_rollup ?? [], a?.latest_analysis_run_id ?? null), (r) => r.result_type);
        const rollupScoped = rollupLanding.rows;
        const activeScope = rollupLanding.landed ?? resultScope.scope;

        // ONE render site for the nudge and the scope bar. Each branch below
        // used to render `<CreativeSourceNudge>` itself (three call sites for
        // one suggestion), so a change to where it sits had to be made three
        // times and could drift between them.
        const page = (header: ReactNode, body: ReactNode, opts: { scroll?: boolean; scoped?: boolean } = {}) => (
          <div className={cn("flex-1 flex flex-col", opts.scroll !== false && "min-h-0 overflow-y-auto")}>
            {header}
            {opts.scoped && <ResultScopeBar scope={activeScope} groups={resultScope.groups} onChange={resultScope.setScopeId} />}
            {opts.scoped && <LandedScopeNote landed={rollupLanding.landed} what="Library" />}
            <CreativeSourceNudge account={acct} />
            {body}
          </div>
        );
        const componentCount = components
          ? Object.values(components.families).reduce((n, rows) => n + rows.length, 0)
          : 0;
        const componentsTab = {
          id: "components",
          label: "Copy components",
          count: componentCount,
          Icon: AlignLeft,
          disabledReason: hasComponents ? undefined : "The performance export carried no copy columns for this account",
        };

        if (!hasLibrary && !hasComponents) {
          return page(
            <ModuleHeader section={SECTION} title="Library" accountName={acct.name} />,
            <PendingState title="No scanned creatives" message={mst?.render_policy ?? "The creative scan populates once the local library is mapped."} icon={Library} />,
            { scroll: false },
          );
        }

        if (!hasLibrary || !mst) {
          const noLibrary = "Scan creatives to populate this — the copy components below come from the performance export";
          return page(
            <ModuleHeader
              section={SECTION}
              title="Library"
              accountName={acct.name}
              subtitle="Copy-level components from the performance export · scan creatives for the visual library."
              table="ad_performance.ad_creative_metadata"
            />,
            <>
              <ModuleTabs
                tabs={[
                  { id: "library", label: "Concept library", count: 0, Icon: Library, disabledReason: noLibrary },
                  { id: "variables", label: "Variable library", count: 0, Icon: Tags, disabledReason: noLibrary },
                  { id: "cross", label: "Cross-map", count: 0, Icon: LayoutGrid, disabledReason: noLibrary },
                  componentsTab,
                ]}
                active="components"
                onChange={() => {}}
              />
              <CreativeComponentsPanel components={components!} rollup={rollupScoped} />
            </>,
            { scoped: true },
          );
        }

        const library = mst.local_book2_library!;

        // ── Next moves: optimization-loop recommendation cards scoped to
        // creative actions, sourced from the same categorization RecommendationDeck
        // and ActionQueueView already use — never a separately-invented queue.
        const optLoop = getOptimizationLoop(seed, adAccountId);
        const knownCells = new Set(library.map((c) => c.cell_id));
        const creativeActions = (optLoop?.recommendation_cards ?? []).filter(
          (c) => actionGroupForScope(c.scope) === "Creative actions"
        );

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
        const perfRows = a?.performance_by_cell ?? [];
        const crossStages = [...new Set(perfRows.map((r) => r.stage).filter((s): s is string => Boolean(s)))];
        const crossConcepts = [...new Set(library.map((c) => c.book2_concept_name))];
        const crossCell = (concept: string, stage: string) => {
          const rows = perfRows.filter((r) => r.book2_concept_name === concept && r.stage === stage);
          const spend = rows.reduce((n, r) => n + (r["Amount spent (USD)"] || 0), 0);
          const results = rows.reduce((n, r) => n + (r.Results || 0), 0);
          return { cpa: results > 0 ? spend / results : null, spend, results, tested: rows.length > 0, cellId: rows[0]?.cell_id ?? null };
        };

        return page(
          <ModuleHeader
            section={SECTION}
            title="Library"
            accountName={acct.name}
            subtitle="The scanned creative asset register and the variable library it produces."
            table="local_book2_library"
          />,
          <>
            <div className="px-6 pt-5">
              <SectionCard
                title="Next moves"
                desc="Optimization-loop recommendations scoped to creative actions for this account."
              >
                {creativeActions.length === 0 ? (
                  <p className="text-caption text-muted-foreground/75">
                    No creative-scoped recommendations yet — these appear once the optimization loop has run for this account.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                    {creativeActions.map((c) => {
                      const kind = kindOf(c.recommended_action);
                      const evidenceCells = cellIdsForCard(c, knownCells);
                      const openCell = evidenceCells[0] ?? null;
                      return (
                        <div key={c.id} className="flex flex-col gap-1.5 rounded-lg border border-border/40 bg-foreground/[0.02] p-3">
                          <div className="flex items-center gap-2">
                            <span className="text-label text-interactive/80">{c.id}</span>
                            <span className={`text-micro font-semibold uppercase tracking-wide border rounded px-1.5 py-0.5 leading-none ${kind.cls}`}>
                              {kind.label}
                            </span>
                            {openCell && (
                              <span className="ml-auto text-label text-muted-foreground/75 truncate max-w-[9rem]" title={openCell}>{openCell}</span>
                            )}
                          </div>
                          <p className="text-caption text-foreground/85 leading-relaxed line-clamp-3">
                            <TokenizedConceptText text={c.title} />
                          </p>
                          <div className="flex items-center gap-2 mt-auto pt-1">
                            {openCell ? (
                              <button
                                type="button"
                                onClick={() => setOpenCellId(openCell)}
                                className="pressable inline-flex items-center h-7 px-2.5 rounded-md border border-border/40 text-label font-medium text-foreground/75 hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
                              >
                                Open asset
                              </button>
                            ) : (
                              <span className="text-label text-muted-foreground/75">No evidence cell referenced</span>
                            )}
                            <AddToTrayButton
                              scopeId={acct.id}
                              item={{
                                id: `test-${c.id}`,
                                kind: "recommendation",
                                title: c.title,
                                sub: c.recommended_action,
                                href: "/app/listen/recommendations",
                              }}
                              className="ml-auto"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </SectionCard>
            </div>
            <ModuleTabs
              tabs={[
                { id: "library", label: "Concept library", count: library.length, Icon: Library },
                { id: "variables", label: "Variable library", count: distinctVarCount, Icon: Tags },
                { id: "cross", label: "Cross-map", count: crossConcepts.length, Icon: LayoutGrid },
                componentsTab,
              ]}
              active={tab}
              onChange={setTab}
            />
            {tab === "components" && components && (
              <CreativeComponentsPanel components={components} rollup={rollupScoped} />
            )}
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
                      data={cardFromLibraryCell(c, c.cell_id, cardCtx)}
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
                      <p className="text-body text-muted-foreground/80">Distinct creative variables in use, grouped by family. Tap a variable to drill into its performance.</p>
                      <InfoTooltip content="The count shows how many concepts in this account's local library use each variable." />
                    </div>
                    {variableGroups.map((g) => (
                      <div key={g.label}>
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className={cn(HEADING.h5)}>{g.label}</h3>
                          <span className="text-label text-muted-foreground/75">{g.items.length}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {g.items.map((it) => (
                            <button
                              key={it.code}
                              type="button"
                              disabled={!a}
                              onClick={a ? () => setVariableCode(it.code) : undefined}
                              title={a ? `Open ${readableVariables(it.code)} drill-down` : "Variable drill-down needs analysis data for this account"}
                              data-testid={`chip-library-variable-${it.code}`}
                              className={`flex items-center gap-2 rounded-lg border border-border/40 bg-foreground/[0.02] px-2.5 py-1.5 text-left ${a ? "cursor-pointer hover:border-primary/35 hover:bg-foreground/[0.04] active:bg-foreground/[0.06] transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-primary/60" : "cursor-default"}`}
                            >
                              <div>
                                <div className="text-body font-medium text-foreground/90 leading-tight">{readableVariables(it.code)}</div>
                                <div className="text-label text-muted-foreground/75 mt-0.5">{it.code}</div>
                              </div>
                              <span className="text-label text-muted-foreground/75 border border-border/40 rounded px-1.5 py-0.5 leading-none">×{it.count}</span>
                            </button>
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
                      <p className="text-body text-muted-foreground/80">Cost per result by concept and funnel stage. Tap a tested cell to open its creative; tap an untested cell to queue a test.</p>
                      <InfoTooltip content="Aggregated from performance_by_cell for every asset mapped to a concept. Empty cells have no measured spend at that stage yet — click one to file a real Task Tray item." />
                    </div>
                    <div className="overflow-x-auto">
                      <div
                        className="grid gap-1 min-w-[560px]"
                        style={{ gridTemplateColumns: `minmax(200px,1.6fr) repeat(${crossStages.length}, minmax(120px, 1fr))` }}
                      >
                        <span />
                        {crossStages.map((s) => (
                          <span key={s} className="text-label text-muted-foreground/75 text-center leading-tight pb-1.5">{s}</span>
                        ))}
                        {crossConcepts.map((concept) => (
                          <Fragment key={concept}>
                            <div className="text-body font-medium text-foreground/85 leading-tight py-1.5 pr-2 truncate" title={concept}>
                              {concept}
                            </div>
                            {crossStages.map((s) => {
                              const cell = crossCell(concept, s);
                              const queueId = `cross-test-${concept}-${s}`;
                              const queued = !cell.tested && isInTray(acct.id, queueId);
                              const onClick = cell.tested
                                ? (cell.cellId ? () => setOpenCellId(cell.cellId) : undefined)
                                : () => {
                                    if (queued) removeFromTray(acct.id, queueId);
                                    else
                                      addToTray(acct.id, {
                                        id: queueId,
                                        kind: "custom",
                                        title: `Test ${concept} on ${s}`,
                                        sub: "Queued from the Creative Library cross-map — no measured spend yet.",
                                        href: "/app/creative/library",
                                      });
                                  };
                              return (
                                <button
                                  key={`${concept}-${s}`}
                                  type="button"
                                  onClick={onClick}
                                  disabled={cell.tested && !cell.cellId}
                                  title={
                                    cell.tested
                                      ? `${fmtMetric("usd_total", cell.spend)} spend · ${cell.results} results — click to open the creative`
                                      : queued
                                      ? "Queued in Task Tray — click to remove"
                                      : `Untested — click to queue "Test ${concept} on ${s}"`
                                  }
                                  className={`rounded-md border py-1.5 text-center text-body tabular-nums transition-colors ${
                                    cell.tested
                                      ? "border-border/30 bg-foreground/[0.015] text-foreground/85 hover:border-primary/35 hover:bg-foreground/[0.04] cursor-pointer disabled:cursor-default disabled:hover:border-border/30 disabled:hover:bg-foreground/[0.015]"
                                      : queued
                                      ? "border-status-warning/30 bg-status-warning/[0.06] text-status-warning hover:bg-status-warning/10 cursor-pointer"
                                      : "border-border/20 bg-foreground/[0.008] text-muted-foreground/75 hover:border-border/40 hover:bg-foreground/[0.02] hover:text-muted-foreground/75 cursor-pointer"
                                  }`}
                                >
                                  {cell.tested ? (
                                    fmtMetric("usd_unit", cell.cpa)
                                  ) : queued ? (
                                    <span className="inline-flex items-center gap-1"><Check className="w-3 h-3" /> Queued</span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1"><ClipboardList className="w-3 h-3 opacity-50" /> —</span>
                                  )}
                                </button>
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

            {/* ── Cross-map / Next-moves "open asset" ── */}
            {/* Passes the same account-level data IapLibraryView's cards get —
                this call site previously passed nothing, so every tab rendered
                its empty state regardless of what the account had (the AAFE
                "creative popup empty" bug). Empty states carry cause-specific
                reasons per creative-empty-reasons.ts. */}
            {openCellId && (
              <CreativeExpandDialog
                open={openCellId != null}
                onOpenChange={(v) => { if (!v) setOpenCellId(null); }}
                data={cardFromCell(openCellId, cardCtx)}
                demographic={(a?.demographic_registration_signal ?? []).filter((r: DemographicRow) => r.cell_id === openCellId)}
                placements={([...(a?.v3_placement_signal ?? []), ...(a?.c4e_placement_signal ?? [])]) as PlacementRow[]}
                perfRow={a?.performance_by_cell?.find((r) => r.cell_id === openCellId) ?? null}
                perfRows={a?.performance_by_cell?.filter((r) => r.cell_id === openCellId) ?? []}
                demographicEmptyReason={demographicEmptyReasonFor(a?.demographic_registration_signal ?? [], openCellId)}
                placementsEmptyReason={placementsEmptyReasonFor([...(a?.v3_placement_signal ?? []), ...(a?.c4e_placement_signal ?? [])])}
                funnelEmptyReason={funnelEmptyReasonFor(a?.performance_by_cell, openCellId)}
              />
            )}

            {/* ── Variable drill-down (Variable library chips) ── */}
            {a && (
              <VariableDrilldownModal
                open={variableCode != null}
                onClose={() => setVariableCode(null)}
                code={variableCode}
                analysis={a}
                variableRows={scopeToRun(a.v3_variable_performance, a.latest_analysis_run_id ?? null)}
              />
            )}
          </>,
          { scoped: true },
        );
      }}
    </ModuleScopeGate>
  );
}
