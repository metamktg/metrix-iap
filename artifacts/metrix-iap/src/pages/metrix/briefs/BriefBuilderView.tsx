// ─── Creative Briefs · Brief Builder ──────────────────────────────────
// Draft briefs derived from strategy pillars, organized by asset format
// (Static / Video / UGC). Drill-down drawer with cross-links back into
// Strategy. Video and UGC formats have no source-backed briefs yet.

import { useState, useEffect } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getBriefBuilder, getStrategyData, getAnalysisData, getMST, getCreativeLinkContext } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ModuleTabs, ModuleScopeGate, PendingState,
  MetricTile, CaveatNote, CrossLink, useFocusParam, FlowCrumb, useFromParam,
  RangeScopeBar, NoDataInRangeState, StaleFocusNotice, deriveLabel, SkeletonBlock,
} from "../shared";
import { useDateRange } from "@/contexts/DateRangeContext";
import {
  useGenerationRun, GenerateButton, ProvenanceBadge, GenerationErrorNote,
} from "@/components/generation/GenerationControls";
import { CreativeCard } from "@/components/creative/CreativeCard";
import { cardFromCell } from "@/lib/creative-assembly";
import { InfoDrawer, DrawerField } from "@/components/ui/InfoDrawer";
import { FileText, Sparkles, Video, Users } from "lucide-react";
import type { DraftBrief } from "@/lib/data/seedTypes";
import { TokenizedConceptText } from "@/components/concept/ConceptChip";

const SECTION = "Creative Briefs · 05";

const STATUS_LABEL: Record<string, string> = {
  draft_from_seed: "Draft",
  validation_draft_from_seed: "Validation draft",
  control_refresh_from_seed: "Control refresh",
};

type FormatTab = "static" | "video" | "ugc";

function formatOf(assetType: string): FormatTab {
  const t = assetType.toLowerCase();
  if (t.includes("ugc")) return "ugc";
  if (t.includes("video")) return "video";
  return "static";
}

export function BriefBuilderView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const [tab, setTab] = useState<FormatTab>("static");
  const focus = useFocusParam();
  const [detail, setDetail] = useState<DraftBrief | null>(null);
  const { rangeHasData } = useDateRange();
  const generation = useGenerationRun(adAccountId, "briefs");
  const fp = useFromParam();

  const bb = getBriefBuilder(seed, adAccountId);

  // Deep-link: ?focus=<brief id> opens the drawer
  useEffect(() => {
    if (focus && bb) {
      const match = bb.draft_briefs.find((b) => b.id === focus);
      if (match) {
        setTab(formatOf(match.asset_type));
        setDetail(match);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, adAccountId]);

  return (
    <ModuleScopeGate section={SECTION} title="Brief Builder" account={account}>
      {() => {
        const acct = account!;
        const briefs = bb?.draft_briefs ?? [];
        const strategy = getStrategyData(seed, adAccountId);
        const analysis = getAnalysisData(seed, adAccountId);
        const mst = getMST(seed, adAccountId);
        const pillarOf = (id: string) => strategy?.message_pillars.find((p) => p.id === id);

        const byFormat = (f: FormatTab) => briefs.filter((b) => formatOf(b.asset_type) === f);
        const shown = byFormat(tab);
        const pillarsCovered = new Set(briefs.map((b) => b.source_pillar)).size;
        const hasPillars = (strategy?.message_pillars.length ?? 0) > 0;

        const TABS: { id: FormatTab; label: string; count: number; Icon: React.ComponentType<{ className?: string }> }[] = [
          { id: "static", label: "Static", count: byFormat("static").length, Icon: FileText },
          { id: "video", label: "Video", count: byFormat("video").length, Icon: Video },
          { id: "ugc", label: "UGC", count: byFormat("ugc").length, Icon: Users },
        ];

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Brief Builder"
              subtitle="Briefs from message pillars · by asset format"
              account={acct}
              right={
                <div className="flex items-center gap-2">
                  <ProvenanceBadge provenance={bb?.provenance} />
                  {hasPillars && (
                    <GenerateButton
                      onClick={generation.start}
                      isRunning={generation.isRunning}
                      label="Draft Briefs"
                      runningLabel="Generating…"
                    />
                  )}
                </div>
              }
            />
            <FlowCrumb {...fp} />
            {focus && !briefs.some((b) => b.id === focus) && (
              <StaleFocusNotice label="brief" />
            )}
            <RangeScopeBar grainNote="Briefs derive from the account's full flight window — this import has no daily grain." />
            {generation.lastError && (
              <div className="px-6 pt-4">
                <GenerationErrorNote message={generation.lastError} onRetry={generation.start} />
              </div>
            )}

            {!rangeHasData ? (
              <NoDataInRangeState what="draft briefs" />
            ) : (
            <>
            <div className="px-6 pt-5 grid grid-cols-dashboard-4 gap-3">
              <MetricTile label="Draft briefs" value={String(briefs.length)} />
              <MetricTile label="Pillars covered" value={String(pillarsCovered)} sub={`of ${strategy?.message_pillars.length ?? 0} message pillars`} />
              <MetricTile label="Static" value={String(byFormat("static").length)} />
              <MetricTile label="Video + UGC" value={String(byFormat("video").length + byFormat("ugc").length)} sub="no source-backed drafts yet" />
            </div>

            <div className="mt-4">
              <ModuleTabs tabs={TABS} active={tab} onChange={(id) => setTab(id)} />
            </div>

            <div className="px-6 py-5 space-y-4 max-w-4xl">
              {bb?.source_policy && <CaveatNote text={bb.source_policy} />}

              {shown.length === 0 ? (
                <div className="space-y-4">
                  <PendingState
                    title={`No ${tab === "ugc" ? "UGC" : tab} briefs yet`}
                    message={
                      tab === "static"
                        ? hasPillars
                          ? "No draft briefs for this account yet — generate a set from its strategy pillars."
                          : "Draft briefs appear here once strategy pillars are ready."
                        : `No source-backed ${tab === "ugc" ? "UGC" : "video"} briefs exist for this account yet. Briefs are only generated from validated strategy — nothing is fabricated.`
                    }
                    icon={tab === "video" ? Video : tab === "ugc" ? Users : FileText}
                    action={!hasPillars ? <CrossLink to="/app/strategy/overview" label="Review Strategy first" /> : undefined}
                  />
                  {generation.isRunning && (
                    <div className="space-y-2.5" aria-busy="true">
                      <SkeletonBlock className="h-32 w-full" />
                      <SkeletonBlock className="h-32 w-full" />
                      <SkeletonBlock className="h-32 w-full" />
                    </div>
                  )}
                  {tab === "static" && hasPillars && briefs.length === 0 && (
                    <div className="text-center">
                      <GenerateButton
                        onClick={generation.start}
                        isRunning={generation.isRunning}
                        label="Generate briefs from strategy"
                        runningLabel="Generating briefs…"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-dashboard-2 gap-3">
                  {shown.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => setDetail(b)}
                      className="text-left rounded-xl border border-border/40 bg-white/[0.02] p-4 flex flex-col hover:border-border/60 hover:bg-white/[0.03] transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="inline-flex items-center gap-1 text-label font-semibold uppercase tracking-wide text-muted-foreground/80 border border-border/50 px-1.5 py-0.5 rounded leading-none">
                          <FileText className="w-3.5 h-3.5" /> {b.asset_type}
                        </span>
                        <span className="text-label font-semibold uppercase tracking-wide text-amber-200 border border-amber-400/30 bg-amber-400/20 px-1.5 py-0.5 rounded leading-none">
                          {STATUS_LABEL[b.status] ?? b.status}
                        </span>
                      </div>

                      {/* Pillar anchor + EVP line */}
                      <div className="mb-2">
                        <div className="flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-primary/60 shrink-0" />
                          <span className="text-caption font-semibold text-foreground leading-snug line-clamp-1">
                            {pillarOf(b.source_pillar)?.label ?? b.source_pillar}
                          </span>
                        </div>
                        {pillarOf(b.source_pillar)?.plain_descriptor && (
                          <p className="text-caption italic text-primary/55 leading-snug line-clamp-1 mt-0.5 pl-5">
                            "{deriveLabel(pillarOf(b.source_pillar)!.plain_descriptor, 72)}"
                          </p>
                        )}
                      </div>

                      <p className="text-body text-foreground/80 leading-snug flex-1 line-clamp-2"><TokenizedConceptText text={deriveLabel(b.human_direction, 100)} /></p>

                      <div className="mt-3 pt-3 border-t border-border/20">
                        <div className="text-label font-mono uppercase tracking-widest text-muted-foreground/80 mb-1.5">Creative direction</div>
                        <div className="flex flex-wrap gap-1.5">
                          {b.plain_variable_descriptors.map((d) => (
                            <span key={d} className="text-label text-foreground/75 border border-border/40 bg-white/[0.03] px-1.5 py-0.5 rounded leading-none">{d}</span>
                          ))}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            </>
            )}

            {detail && (
              <InfoDrawer
                kicker={`Brief · ${detail.asset_type}`}
                title={pillarOf(detail.source_pillar)?.label ?? detail.id}
                onClose={() => setDetail(null)}
                footer={
                  <div className="flex items-center gap-4">
                    <CrossLink to="/app/strategy/hypotheses" label="Open Hypothesis Queue" />
                    <CrossLink to="/app/briefs/history" label="View brief history" />
                  </div>
                }
              >
                <DrawerField label="Status">{STATUS_LABEL[detail.status] ?? detail.status}</DrawerField>
                <DrawerField label="Human direction"><TokenizedConceptText text={detail.human_direction} /></DrawerField>
                <DrawerField label="Creative direction">
                  <div className="flex flex-wrap gap-1.5">
                    {detail.plain_variable_descriptors.map((d) => (
                      <span key={d} className="text-label text-foreground/75 border border-border/40 bg-white/[0.03] px-1.5 py-0.5 rounded leading-none">{d}</span>
                    ))}
                  </div>
                </DrawerField>
                {pillarOf(detail.source_pillar) && (
                  <DrawerField label="Source pillar">
                    <p className="font-semibold text-foreground">{pillarOf(detail.source_pillar)!.label}</p>
                    <p className="italic text-primary/80 mt-0.5">"{pillarOf(detail.source_pillar)!.plain_descriptor}"</p>
                    {pillarOf(detail.source_pillar)!.why_it_matters && (
                      <p className="text-body text-foreground/70 mt-2 leading-relaxed">
                        {pillarOf(detail.source_pillar)!.why_it_matters}
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      {pillarOf(detail.source_pillar)!.source_cells.map((c) => (
                        <CrossLink key={c} to={`/app/analysis/library?focus=${c}`} label={`Cell ${c}`} />
                      ))}
                    </div>
                  </DrawerField>
                )}
                {analysis && pillarOf(detail.source_pillar) && pillarOf(detail.source_pillar)!.source_cells.length > 0 && (
                  <DrawerField label="Source creatives">
                    <div className="grid grid-cols-2 gap-2">
                      {pillarOf(detail.source_pillar)!.source_cells.map((c) => (
                        <CreativeCard
                          key={c}
                          data={cardFromCell(c, {
                            perfRows: analysis.performance_by_cell,
                            mst,
                            ...getCreativeLinkContext(seed, adAccountId),
                          })}
                        />
                      ))}
                    </div>
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
