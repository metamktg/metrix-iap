// ─── MST · Creative Scan ──────────────────────────────────────────────
// Scanned local creative library: every mapped concept with its message
// system, variable stack, mapping confidence, and QA status — segmentable
// down to "needs attention" (unmapped / flagged) — plus the variable
// library aggregated across the account's concepts.

import { useState } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getMST, getAnalysisData, getCreativeLinkContext } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ModuleScopeGate, ModuleTabs, CaveatNote, PendingState, MetricTile,
  readableVariables, CrossLink, InfoTooltip, SegmentedToggle,
} from "../shared";
import { TYPE } from "../typography";
import { CreativeCard } from "@/components/creative/CreativeCard";
import { cardFromCell } from "@/lib/creative-assembly";
import { cn } from "@workspace/command-deck/lib/utils";
import { Library, Tags, AlertTriangle } from "lucide-react";
import type { MSTLibraryCell } from "@/lib/data/seedTypes";

const SECTION = "MST · 06";

/** A cell is "needs attention" when its own QA field says so, or when no
 *  mapping status was ever recorded at all — an absent status is never
 *  silently treated as clean. */
function needsAttention(c: MSTLibraryCell): boolean {
  return !c.qa_mapping_status || c.qa_mapping_status !== "mapped_to_performance";
}

type LibraryFilter = "all" | "attention";

export function CreativeScanView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const [tab, setTab] = useState<string>("library");
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>("all");

  return (
    <ModuleScopeGate section={SECTION} title="Creative Scan" account={account}>
      {() => {
        const acct = account!;
        const mst = getMST(seed, adAccountId);

        if (!mst || mst.status !== "active" || !mst.local_book2_library?.length) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Creative Scan" accountName={acct.name} />
              <PendingState title="No scanned creatives" message={mst?.render_policy ?? "The creative scan populates once the local library is mapped."} icon={Library}
                action={<CrossLink to="/app/mst/matrix" label="Open MST Matrix" />}
              />
            </div>
          );
        }

        // local_book2_library may contain multiple rows per cell_id (aspect
        // variants such as Feed / Square / Story) — deduplicate to one entry
        // per concept so cards render once and keys stay unique.
        const library = mst.local_book2_library.filter(
          (c, i, arr) => arr.findIndex((o) => o.cell_id === c.cell_id) === i
        );
        const attentionCells = library.filter(needsAttention);
        const mappedCells = library.length - attentionCells.length;
        const highConfidenceCells = library.filter((c) => c.mapping_confidence === "high").length;
        const visibleLibrary = libraryFilter === "attention" ? attentionCells : library;

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

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Creative Scan"
              accountName={acct.name}
              subtitle="Scanned creative library · variable library"
              table="mst_creative_scan"
            />
            <ModuleTabs
              tabs={[
                { id: "library", label: "Concept library", count: library.length, Icon: Library },
                { id: "variables", label: "Variable library", count: distinctVarCount, Icon: Tags },
              ]}
              active={tab}
              onChange={setTab}
            />
            <div className="px-6 py-5 space-y-4">
              <CaveatNote text={mst.render_policy} />

              {tab === "library" && (
                <>
                  <div className="grid grid-cols-dashboard-4 gap-3">
                    <MetricTile label="Concepts" value={String(library.length)} />
                    <MetricTile label="Mapped to performance" value={String(mappedCells)} />
                    <MetricTile
                      label="Needs attention"
                      value={String(attentionCells.length)}
                      sub={attentionCells.length > 0 ? "Unmapped or flagged QA" : undefined}
                    />
                    <MetricTile label="High mapping confidence" value={String(highConfidenceCells)} />
                  </div>

                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <SegmentedToggle
                      ariaLabel="Filter concept library by QA status"
                      active={libraryFilter}
                       onChange={(id) => setLibraryFilter(id as LibraryFilter)}
                      options={[
                        { id: "all", label: "All concepts" },
                        { id: "attention", label: "Needs attention", Icon: AlertTriangle },
                      ]}
                    />
                    {libraryFilter === "attention" && attentionCells.length === 0 && (
                      <span className={cn(TYPE.caption, "text-muted-foreground/60")}>Nothing flagged — every concept is mapped to performance.</span>
                    )}
                  </div>

                  {visibleLibrary.length === 0 ? (
                    <p className={cn(TYPE.body, "text-muted-foreground/50 py-6 text-center")}>No concepts match this filter.</p>
                  ) : (
                    <div className="grid grid-cols-dashboard-4-xl gap-3">
                      {visibleLibrary.map((c) => (
                        <CreativeCard
                          key={c.cell_id}
                          data={cardFromCell(c.cell_id, {
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
                </>
              )}

              {tab === "variables" && (
                distinctVarCount === 0 ? (
                  <PendingState title="No variables yet" message="The variable library aggregates from concepts in the local library." icon={Tags}
                    action={<CrossLink to="/app/analysis/library" label="Open IAP Library" />}
                  />
                ) : (
                  <div className="space-y-5">
                    <div className="flex items-center gap-1.5">
                      <p className={cn(TYPE.body, "text-muted-foreground/80")}>Variables in use, grouped by family.</p>
                      <InfoTooltip content="Distinct creative variables in use across this account's concept library, grouped by family. The count shows how many concepts use each variable." />
                    </div>
                    {variableGroups.map((g) => (
                      <div key={g.label}>
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className={cn(TYPE.microLabel, "text-muted-foreground/70")}>{g.label}</h3>
                          <span className={cn(TYPE.label, "font-mono text-muted-foreground/60")}>{g.items.length}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {g.items.map((it) => (
                            <div key={it.code} className="flex items-center gap-2 rounded-lg border border-border/40 bg-foreground/[0.02] px-2.5 py-1.5">
                              <div>
                                <div className={cn(TYPE.body, "font-medium text-foreground/90 leading-tight")}>{readableVariables(it.code)}</div>
                                <div className={cn(TYPE.label, "font-mono text-muted-foreground/60 mt-0.5")}>{it.code}</div>
                              </div>
                              <span className={cn(TYPE.label, "font-mono text-muted-foreground/75 border border-border/40 rounded px-1.5 py-0.5 leading-none")}>×{it.count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
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
