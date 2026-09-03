// ─── Creative · Command Center ──────────────────────────────────────────
// The parent /app/creative route. Execution card (generate briefs from
// strategy — canvas's Command Center Execution-card pattern) + a run-
// history card + lists every brief for this account — this doubles as
// brief history, so there's no separate history child. Hard-gated on a
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
  MetricTile, CaveatNote, StageLoopHub, buildLoopStages, FlowCrumb, useFromParam, withFrom, HubNavGrid,
  SectionCard, CrossLink,
} from "../shared";
import { CreativeSourceNudge } from "@/components/creative/CreativeSourceNudge";
import { CreativeNextStepNudge } from "@/components/creative/CreativeNextStepNudge";
import {
  useGenerationRun, GenerateButton, ProvenanceBadge, GenerationErrorNote, GenerationProgressBar,
} from "@/components/generation/GenerationControls";
import {
  FileText, Sparkles, Video, Users, Library, ScanLine, ArrowLeftRight, FileEdit,
  CheckCircle2, XCircle, Loader2,
} from "lucide-react";
import { TokenizedConceptText } from "@/components/concept/ConceptChip";
import { briefStatusLabel } from "@/lib/normalize";
import { RecommendationSlider } from "@/components/deck/RecommendationSlider";
import { deriveRecommendations, recommendationsForStage } from "@/lib/data/recommendations";

const SECTION = "Creative · 05";

type FormatTab = "static" | "video" | "ugc";

function formatOf(assetType: string): FormatTab {
  const t = assetType.toLowerCase();
  if (t.includes("ugc")) return "ugc";
  if (t.includes("video")) return "video";
  return "static";
}

const CHILDREN = [
  { to: "/app/creative/library", label: "Library", Icon: Library, desc: "The creative asset register — distinct from the IAP Library's variable stacks.", lineage: "mst.local_book2_library[] · ads[]" },
  { to: "/app/creative/builder", label: "Brief builder", Icon: FileEdit, desc: "Open any generated brief in its own workspace to assign, export, or hand off for production.", lineage: "brief_builder.draft_briefs[]" },
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
        const briefs = bb?.draft_briefs ?? [];
        const strategy = getStrategyData(seed, adAccountId);
        // The prerequisite for generating briefs is PILLARS, not a run.
        // `status.strategy` reports the latest in-app strategy GENERATION
        // RUN, and an account whose strategy arrived through the importer
        // has never had one — so this page told bookster "this account
        // doesn't have a completed strategy run yet" directly beneath a
        // tile reading "Pillars covered 3 of 3" and above a list of its
        // sixteen briefs. The server never agreed: storedPillars() in
        // generationEngine.ts takes "the CURRENT generated set if one
        // exists, else the imported set", so the generation the gate was
        // blocking would have worked. Ask for the input the generator
        // actually consumes.
        const strategyOk =
          status.strategy.status === "success" || (strategy?.message_pillars.length ?? 0) > 0;
        const pillarOf = (id: string) => strategy?.message_pillars.find((p) => p.id === id);
        const byFormat = (f: FormatTab) => briefs.filter((b) => formatOf(b.asset_type) === f);
        const shown = byFormat(tab);
        const pillarsCovered = new Set(briefs.map((b) => b.source_pillar)).size;

        const TABS: { id: FormatTab; label: string; count: number; Icon: React.ComponentType<{ className?: string }> }[] = [
          { id: "static", label: "Static", count: byFormat("static").length, Icon: FileText },
          { id: "video", label: "Video", count: byFormat("video").length, Icon: Video },
          { id: "ugc", label: "UGC", count: byFormat("ugc").length, Icon: Users },
        ];

        const run = generation.lastRun;
        // Every link out of this hub carries the page's own origin, so the
        // cell or hypothesis that led here survives the hop to a child page.
        const children = CHILDREN.map((c) => ({ ...c, to: withFrom(c.to, fp) }));

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Creative"
              accountName={acct.name}
              subtitle="Generate briefs from strategy, then open any brief in its own workspace to assign, export, or hand off for production."
              table="draft_briefs, message_pillars"
              right={<ProvenanceBadge provenance={bb?.provenance} />}
            />
            <FlowCrumb {...fp} />
            <StageLoopHub stages={buildLoopStages(status)} current="creative" />
            {/* At most one nudge per page. Both decide for themselves whether
                they apply (each renders null otherwise), and both can apply at
                once — creatives staged but not deconstructed, and no servable
                visual. Priority is DOM order: the next-step nudge first, and
                any status banner that follows a rendered one is hidden. */}
            <div className="[&>[role=status]~[role=status]]:hidden" data-testid="creative-nudge-slot">
              <CreativeNextStepNudge accountId={acct.id} />
              <CreativeSourceNudge account={acct} />
            </div>

            {/* One column width across all four command centres (MST's, the
                widest content, sets it): a reader walking Listen → Analysis →
                Strategy → Creative → MST saw the content column jump between
                three widths, and the same "Execution card" pattern render
                2-across on one stage and 4-across on the next. */}
            <div className="px-6 py-5 space-y-4 max-w-5xl">
              {/* Direction for this stage, from the account's own rows —
                  each tile carries the number behind it and a link to the
                  surface that proves it. Absent when this stage has none. */}
              {(() => { const stageRecs = recommendationsForStage(deriveRecommendations(acct), 4); return stageRecs.length > 0 ? <RecommendationSlider recs={stageRecs} title="What the data says to do next" /> : null; })()}

              {/* Execution card: verb title + input-metric tiles + primary action —
                  canvas's Command Center Execution-card pattern (COMMAND["creative.cc"]
                  verb: "Generate briefs"). The tile grid stays unconditional on real
                  brief/strategy data, independent of whether generation itself is
                  currently gated — same rule StrategyCommandCenter follows. */}
              <SectionCard
                title="Generate briefs"
                desc="Generates draft creative briefs from this account's strategy message pillars. Generated briefs fully replace the prior generated set for that kind."
              >
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <MetricTile label="Total briefs" value={String(briefs.length)} variant="primary" />
                  <MetricTile label="Pillars covered" value={String(pillarsCovered)} sub={`of ${strategy?.message_pillars.length ?? 0}`} />
                  <MetricTile label="Static" value={String(byFormat("static").length)} />
                  <MetricTile label="Video + UGC" value={String(byFormat("video").length + byFormat("ugc").length)} sub="no source-backed drafts yet" />
                </div>
                <PrerequisiteGate
                  met={strategyOk}
                  title="Generate strategy first"
                  message="Briefs are generated from strategy message pillars, and this account has none yet — imported or generated, either works."
                  ctaLabel="Go to Strategy"
                  ctaTo={withFrom("/app/strategy", fp)}
                >
                  {() => (
                    <>
                      <div className="flex items-center justify-between gap-3">
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
                          elapsedSeconds={generation.elapsedSeconds}
                          typicalSeconds={generation.typicalSeconds}
                          stageLabel={generation.progressStage ?? "Generating briefs from strategy…"}
                        />
                        <GenerationErrorNote message={generation.lastError} />
                      </div>
                    </>
                  )}
                </PrerequisiteGate>
              </SectionCard>

              {/* Run history card: the backend retains only the latest run per
                  account+kind today (no run-list endpoint yet) — one real row,
                  not a fabricated multi-run log. Mirrors StrategyCommandCenter. */}
              <SectionCard
                title="Run history"
                desc="Most recent brief generation run for this account"
                right={<CrossLink to="/app/creative/builder" label="View briefs" />}
              >
                {!run ? (
                  <p className="text-caption text-muted-foreground/75">No generation runs yet for this account.</p>
                ) : (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border/30 bg-foreground/[0.015] px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      {run.status === "running" && <Loader2 className="w-4 h-4 text-status-warning animate-spin shrink-0" />}
                      {run.status === "success" && <CheckCircle2 className="w-4 h-4 text-status-success shrink-0" />}
                      {run.status === "error" && <XCircle className="w-4 h-4 text-status-danger shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-body font-medium text-foreground/90 capitalize truncate">
                          {run.status}
                          <span className="ml-2 text-caption font-normal text-muted-foreground/75 normal-case">{run.id}</span>
                        </p>
                        <p className="text-caption text-muted-foreground/75">
                          {new Date(run.started_at).toLocaleString()}
                          {run.model ? ` · ${run.model}` : ""}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </SectionCard>

              {/* No second PrerequisiteGate here — strategyOk is already
                  enforced by the Execution card above; gating again would
                  just repeat the same "Generate strategy first" lock a
                  second time on the page. Without a strategy there simply
                  are no briefs yet, and the empty state below says so. */}
              <ModuleTabs tabs={TABS} active={tab} onChange={(id) => setTab(id)} />

              {bb?.source_policy && <CaveatNote text={bb.source_policy} />}

              {shown.length === 0 ? (
                <PendingState
                  title={`No ${tab === "ugc" ? "UGC" : tab} briefs yet`}
                  message={
                    !strategyOk
                      ? "Briefs are generated from strategy message pillars, and this account has none yet."
                      : tab === "static"
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
                      className="pressable-lg text-left rounded-xl border border-border/40 bg-foreground/[0.02] p-4 flex flex-col hover:border-border/60 hover:bg-foreground/[0.03] transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="inline-flex items-center gap-1 text-label font-semibold uppercase tracking-wide text-muted-foreground/80 border border-border/50 px-1.5 py-0.5 rounded leading-none">
                          <FileText className="w-2.5 h-2.5" /> {b.asset_type}
                        </span>
                        {/* A brief's status is a stage, not a problem. Every one
                            of these wore the amber warning tint, so "Generated ·
                            High" — the best outcome the engine can report — was
                            painted the same colour as a failure, and a page of
                            them read as a page of warnings. Neutral chip, same
                            as the Brief Builder's. */}
                        <span className="text-label font-medium shrink-0 inline-flex border border-border/40 bg-foreground/[0.04] rounded-full px-2 py-0.5 text-foreground/70 leading-none">
                          {briefStatusLabel(b.status)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Sparkles className="w-3 h-3 text-interactive/60" />
                        <span className="text-caption text-muted-foreground/75">From pillar</span>
                        <span className="text-caption font-medium text-foreground">{pillarOf(b.source_pillar)?.label ?? b.source_pillar}</span>
                      </div>
                      <p className="text-body text-foreground/80 leading-relaxed flex-1"><TokenizedConceptText text={b.human_direction} /></p>
                    </button>
                  ))}
                </div>
              )}

              <div className="pt-2">
                <HubNavGrid items={children} label="Explore Creative" />
              </div>
            </div>
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
