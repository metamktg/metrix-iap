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
  MetricTile, CaveatNote, StageLoopHub, buildLoopStages, FlowCrumb, useFromParam, HubNavGrid,
  SectionCard, CrossLink,
} from "../shared";
import {
  useGenerationRun, GenerateButton, ProvenanceBadge, GenerationErrorNote, GenerationProgressBar,
} from "@/components/generation/GenerationControls";
import {
  FileText, Sparkles, Video, Users, Library, ScanLine, ArrowLeftRight, FileEdit,
  CheckCircle2, XCircle, Loader2,
} from "lucide-react";
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

        const run = generation.lastRun;

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

            <div className="px-6 py-5 space-y-4 max-w-4xl">
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
                  message="Briefs are generated from strategy message pillars — this account doesn't have a completed strategy run yet."
                  ctaLabel="Go to Strategy"
                  ctaTo="/app/strategy"
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
                  <p className="text-caption text-muted-foreground/60">No generation runs yet for this account.</p>
                ) : (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border/30 bg-white/[0.015] px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      {run.status === "running" && <Loader2 className="w-4 h-4 text-amber-400 animate-spin shrink-0" />}
                      {run.status === "success" && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                      {run.status === "error" && <XCircle className="w-4 h-4 text-red-400 shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-body font-medium text-foreground/90 capitalize truncate">
                          {run.status}
                          <span className="ml-2 text-caption font-mono font-normal text-muted-foreground/40 normal-case">{run.id}</span>
                        </p>
                        <p className="text-caption text-muted-foreground/60">
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
                      ? "Briefs are generated from strategy message pillars — this account doesn't have a completed strategy run yet."
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
