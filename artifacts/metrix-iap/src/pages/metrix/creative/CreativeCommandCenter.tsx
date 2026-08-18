// ─── Creative · Command Center ──────────────────────────────────────────
// The parent /app/creative route. Execution (generate briefs from
// strategy) + lists every brief for this account — this doubles as brief
// history, so there's no separate history child. Hard-gated on a
// successful Strategy run. Clicking a brief opens its dedicated workspace
// (Brief Builder, /app/creative/builder) rather than an in-page drawer.

import { useState } from "react";
import { useLocation } from "wouter";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getBriefBuilder, getStrategyData } from "@/lib/data/metrixSeedAdapter";
import { useStageStatus } from "@/hooks/useStageStatus";
import {
  ModuleHeader, ModuleTabs, ModuleScopeGate, PrerequisiteGate, PendingState,
  MetricTile, CaveatNote, StageLoopHub, buildLoopStages, FlowCrumb, useFromParam, HubNavGrid,
} from "../shared";
import {
  useGenerationRun, GenerateButton, ProvenanceBadge, GenerationErrorNote, GenerationProgressBar,
} from "@/components/generation/GenerationControls";
import { FileText, Sparkles, Video, Users, Library, ScanLine, ArrowLeftRight } from "lucide-react";
import { TokenizedConceptText } from "@/components/concept/ConceptChip";

const SECTION = "Creative · 05";

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

const CHILDREN = [
  { to: "/app/creative/library", label: "Library", Icon: Library, desc: "The creative asset register — distinct from the IAP Library's variable stacks.", lineage: "mst.local_book2_library[] · ads[]" },
  { to: "/app/creative/scan", label: "Creative Scan", Icon: ScanLine, desc: "Upload your own creative for an IAP-variable confidence pass.", lineage: "loop_status → creative_scan" },
  { to: "/app/creative/import-export", label: "Import & Export", Icon: ArrowLeftRight, desc: "Staged creative asset uploads for this account.", lineage: "manual_imports · creative_asset" },
];

export function CreativeCommandCenter() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const status = useStageStatus(account?.id ?? null);
  const [tab, setTab] = useState<FormatTab>("static");
  const [, navigate] = useLocation();
  const fp = useFromParam();
  const generation = useGenerationRun(account?.id ?? null, "briefs");

  const bb = getBriefBuilder(seed, adAccountId);

  return (
    <ModuleScopeGate section={SECTION} title="Creative" account={account}>
      {() => {
        const acct = account!;
        const strategyOk = status.strategy.status === "success";
        const briefs = bb?.draft_briefs ?? [];
        const strategy = getStrategyData(seed, adAccountId);
        const pillarOf = (id: string) => strategy?.message_pillars.find((p) => p.id === id);
        const byFormat = (f: FormatTab) => briefs.filter((b) => formatOf(b.asset_type) === f);
        const shown = byFormat(tab);
        const pillarsCovered = new Set(briefs.map((b) => b.source_pillar)).size;

        const TABS: { id: FormatTab; label: string; count: number; Icon: React.ComponentType<{ className?: string }> }[] = [
          { id: "static", label: "Static", count: byFormat("static").length, Icon: FileText },
          { id: "video", label: "Video", count: byFormat("video").length, Icon: Video },
          { id: "ugc", label: "UGC", count: byFormat("ugc").length, Icon: Users },
        ];

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Creative"
              subtitle="Generate briefs from strategy, then open any brief in its own workspace to assign, export, or hand off for production."
              table="draft_briefs, message_pillars"
              right={<ProvenanceBadge provenance={bb?.provenance} />}
            />
            <FlowCrumb {...fp} />
            <StageLoopHub stages={buildLoopStages(status)} current="creative" />

            <div className="px-6 py-5 space-y-4 max-w-4xl">
              <PrerequisiteGate
                met={strategyOk}
                title="Generate strategy first"
                message="Briefs are generated from strategy message pillars — this account doesn't have a completed strategy run yet."
                ctaLabel="Go to Strategy"
                ctaTo="/app/strategy"
              >
                {() => (
                  <>
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-white/[0.02] p-4">
                      <span className="text-caption text-muted-foreground/75">
                        {briefs.length > 0 ? `${briefs.length} briefs across ${pillarsCovered} pillars.` : "No briefs generated yet."}
                      </span>
                      <GenerateButton
                        onClick={generation.start}
                        isRunning={generation.isRunning}
                        label={bb?.provenance === "generated" ? "Regenerate briefs" : "Generate from strategy"}
                        runningLabel="Generating…"
                      />
                    </div>
                    <div className="mt-3 space-y-3">
                      <GenerationProgressBar
                        isRunning={generation.isRunning}
                        progressPercent={generation.progressPercent}
                        stageLabel={generation.progressStage ?? "Generating briefs from strategy…"}
                      />
                      <GenerationErrorNote message={generation.lastError} />
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <MetricTile label="Total briefs" value={String(briefs.length)} />
                      <MetricTile label="Pillars covered" value={String(pillarsCovered)} sub={`of ${strategy?.message_pillars.length ?? 0}`} />
                      <MetricTile label="Static" value={String(byFormat("static").length)} />
                      <MetricTile label="Video + UGC" value={String(byFormat("video").length + byFormat("ugc").length)} sub="no source-backed drafts yet" />
                    </div>

                    <ModuleTabs tabs={TABS} active={tab} onChange={(id) => setTab(id)} />

                    {bb?.source_policy && <CaveatNote text={bb.source_policy} />}

                    {shown.length === 0 ? (
                      <PendingState
                        title={`No ${tab === "ugc" ? "UGC" : tab} briefs yet`}
                        message={
                          tab === "static"
                            ? "No draft briefs for this account yet — generate a set from its strategy pillars."
                            : `No source-backed ${tab === "ugc" ? "UGC" : "video"} briefs exist for this account yet. Briefs are only generated from validated strategy — nothing is fabricated.`
                        }
                        icon={tab === "video" ? Video : tab === "ugc" ? Users : FileText}
                      />
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {shown.map((b) => (
                          <button
                            key={b.id}
                            onClick={() => navigate(`/app/creative/builder?focus=${b.id}`)}
                            className="text-left rounded-xl border border-border/40 bg-white/[0.02] p-4 flex flex-col hover:border-border/60 hover:bg-white/[0.03] transition-colors"
                          >
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <span className="inline-flex items-center gap-1 text-label font-semibold uppercase tracking-wide text-muted-foreground/80 border border-border/50 px-1.5 py-0.5 rounded leading-none">
                                <FileText className="w-2.5 h-2.5" /> {b.asset_type}
                              </span>
                              <span className="text-label font-semibold uppercase tracking-wide text-amber-200 border border-amber-400/30 bg-amber-400/20 px-1.5 py-0.5 rounded leading-none">
                                {STATUS_LABEL[b.status] ?? b.status}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 mb-2">
                              <Sparkles className="w-3 h-3 text-interactive/60" />
                              <span className="text-caption text-muted-foreground/60">From pillar</span>
                              <span className="text-caption font-medium text-foreground">{pillarOf(b.source_pillar)?.label ?? b.source_pillar}</span>
                            </div>
                            <p className="text-body text-foreground/80 leading-relaxed flex-1"><TokenizedConceptText text={b.human_direction} /></p>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </PrerequisiteGate>

              <div className="pt-2">
                <HubNavGrid items={CHILDREN} label="Explore Creative" />
              </div>
            </div>
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
