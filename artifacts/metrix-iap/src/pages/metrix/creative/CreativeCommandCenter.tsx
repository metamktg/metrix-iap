// ─── Creative · Command Center ──────────────────────────────────────────
// The parent /app/creative route, on the Execution Layer shell (StageLayout,
// sweep spec §3, slice 3): header · crumb · spine · pages · one notice ·
// status hub · execution card · direction rail · run history · briefs.
// Execution (generate briefs from one strategy run's pillars) + a run-
// history card + every brief for this account, which doubles as brief
// history, so there is no separate history child. Hard-gated on pillars.
// Clicking a brief opens its dedicated workspace (Brief Builder,
// /app/creative/builder) rather than an in-page drawer.
//
// The run is manually executed, never automatic (§5.1): a briefs run
// starts only when the reader presses Generate here, built on the
// strategy run the picker names (the latest successful one by default,
// exactly one, no combining); the run records that strategy run.

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getBriefBuilder, getStrategyData } from "@/lib/data/metrixSeedAdapter";
import type { AdAccount } from "@/lib/data/seedTypes";
import { useStageStatus } from "@/hooks/useStageStatus";
import {
  ModuleTabs, ModuleScopeGate, PrerequisiteGate, PendingState,
  MetricTile, CaveatNote, FlowCrumb, useFromParam, withFrom,
  SectionCard, CrossLink, type HubNavItem,
} from "../shared";
import { StageLayout } from "../StageLayout";
import { CreativeSourceNudge } from "@/components/creative/CreativeSourceNudge";
import { CreativeNextStepNudge } from "@/components/creative/CreativeNextStepNudge";
import { useDeconstruction } from "@/components/creative/useDeconstruction";
import { useGenerationRun, GenerateButton, ProvenanceBadge } from "@/components/generation/GenerationControls";
import { StrategyRunPicker, useSelectedStrategyRun } from "@/components/loop/BaseRunPicker";
import { GenerationRunRow } from "@/components/loop/GenerationRunRow";
import { buildCreativeHub } from "@/lib/loop/statusHub";
import {
  useListGenerationRuns, getListGenerationRunsQueryKey,
  useListManualImports, getListManualImportsQueryKey,
} from "@workspace/api-client-react";
import { FileText, Sparkles, Video, Users, Library, ScanLine, ArrowLeftRight, FileEdit } from "lucide-react";
import { TokenizedConceptText } from "@/components/concept/ConceptChip";
import { briefStatusLabel } from "@/lib/normalize";
import { deriveRecommendations, recommendationsForStage } from "@/lib/data/recommendations";

const SECTION = "Creative · 05";

type FormatTab = "static" | "video" | "ugc";

function formatOf(assetType: string): FormatTab {
  const t = assetType.toLowerCase();
  if (t.includes("ugc")) return "ugc";
  if (t.includes("video")) return "video";
  return "static";
}

const CHILDREN: HubNavItem[] = [
  { to: "/app/creative/library", label: "Library", Icon: Library, desc: "The creative asset register · distinct from the IAP Library's variable stacks.", lineage: "mst.local_book2_library[] · ads[]" },
  { to: "/app/creative/builder", label: "Brief builder", Icon: FileEdit, desc: "Open any generated brief in its own workspace to assign, export, or hand off for production.", lineage: "brief_builder.draft_briefs[]" },
  { to: "/app/creative/scan", label: "Creative Scan", Icon: ScanLine, desc: "Upload your own creative for an IAP-variable confidence pass.", lineage: "loop_status → creative_scan" },
  { to: "/app/creative/import-export", label: "Import & Export", Icon: ArrowLeftRight, desc: "Staged creative asset uploads for this account.", lineage: "manual_imports · creative_asset" },
];

export function CreativeCommandCenter() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);

  return (
    <ModuleScopeGate section={SECTION} title="Creative" account={account}>
      {() => <CreativeStage account={account!} />}
    </ModuleScopeGate>
  );
}

/** The page behind the scope gate; every account-scoped hook lives here. */
function CreativeStage({ account: acct }: { account: AdAccount }) {
  const seed = useMetrixSeed();
  const status = useStageStatus(acct.id);
  const [tab, setTab] = useState<FormatTab>("static");
  const [, navigate] = useLocation();
  const fp = useFromParam();
  const generation = useGenerationRun(acct.id, "briefs");
  const { data: briefRunsData } = useListGenerationRuns(acct.id, "briefs", { query: { queryKey: getListGenerationRunsQueryKey(acct.id, "briefs") } });
  const { data: strategyRunsData } = useListGenerationRuns(acct.id, "strategy", { query: { queryKey: getListGenerationRunsQueryKey(acct.id, "strategy") } });
  const { data: importsData } = useListManualImports(acct.id, { query: { queryKey: getListManualImportsQueryKey(acct.id) } });
  const decon = useDeconstruction(acct.id);
  const briefRuns = briefRunsData?.runs ?? [];
  const strategyRuns = strategyRunsData?.runs ?? [];
  // The strategy run the NEXT briefs run reads (§5.2): the latest
  // successful one unless the reader picks another; null while the
  // account's strategy is imported (nothing to pick).
  const [baseStrategyRun, chooseStrategyRun] = useSelectedStrategyRun(acct.id, strategyRuns);

  const starting = generation.isRunning && generation.lastRun?.status !== "running";
  const inFlight = starting || generation.lastRun?.status === "running";
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!inFlight) return;
    setNowMs(Date.now());
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [inFlight]);

  const bb = getBriefBuilder(seed, acct.id);
  const briefs = bb?.draft_briefs ?? [];
  const strategy = getStrategyData(seed, acct.id);
  // The prerequisite for generating briefs is PILLARS, not a run: an
  // account whose strategy arrived through the importer has never had a
  // strategy generation run, and the server briefs its imported set
  // (see loop-gates-read-data-not-runs.test).
  const strategyOk = status.strategy.status === "success" || (strategy?.message_pillars.length ?? 0) > 0;
  const pillarOf = (id: string) => strategy?.message_pillars.find((p) => p.id === id);
  const byFormat = (f: FormatTab) => briefs.filter((b) => formatOf(b.asset_type) === f);
  const shown = byFormat(tab);
  const pillarsCovered = new Set(briefs.map((b) => b.source_pillar)).size;

  const TABS: { id: FormatTab; label: string; count: number; Icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "static", label: "Static", count: byFormat("static").length, Icon: FileText },
    { id: "video", label: "Video", count: byFormat("video").length, Icon: Video },
    { id: "ugc", label: "UGC", count: byFormat("ugc").length, Icon: Users },
  ];

  const creativeImports = (importsData?.imports ?? []).filter((i) => i.kind === "creative_asset");
  const usableDecon = decon.deconstructions.filter((d) => d.status !== "discarded" && d.status !== "unsupported");
  const hub = buildCreativeHub({
    runs: briefRuns,
    latest: generation.lastRun,
    strategyRuns,
    baseStrategyRun,
    basePillars: strategy?.message_pillars.length ?? 0,
    creatives: {
      staged: creativeImports.length,
      deconstructed: creativeImports.filter((i) => usableDecon.some((d) => d.manual_import_id === i.id)).length,
    },
    briefs: {
      provenance: bb?.provenance,
      total: briefs.length,
      static: byFormat("static").length,
      video: byFormat("video").length,
      ugc: byFormat("ugc").length,
    },
    starting,
    nowMs,
  });

  const recentRuns = (briefRuns.length > 0 ? briefRuns : generation.lastRun ? [generation.lastRun] : [])
    .slice()
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
    .slice(0, 3);

  // Every link out of this hub carries the page's own origin, so the
  // cell or hypothesis that led here survives the hop to a child page.
  const children = CHILDREN.map((c) => ({ ...c, to: withFrom(c.to, fp) }));

  return (
    <StageLayout
      stage="creative"
      section={SECTION}
      title="Creative"
      accountName={acct.name}
      subtitle="Generate briefs from one strategy run, then open any brief in its own workspace to assign, export, or hand off for production. Never runs automatically."
      headerRight={<ProvenanceBadge provenance={bb?.provenance} />}
      crumb={<FlowCrumb {...fp} />}
      status={status}
      notice={
        // The one notice this page carries (§3.4): the staged-creatives next
        // step, else the creative-source suggestion. Both decide for
        // themselves whether they apply and both can apply at once; priority
        // is DOM order, and a status banner after a rendered one is hidden.
        <div className="[&>[role=status]~[role=status]]:hidden" data-testid="creative-nudge-slot">
          <CreativeNextStepNudge accountId={acct.id} className="mx-0 my-0" />
          <CreativeSourceNudge account={acct} className="mx-0 my-0" />
        </div>
      }
      hub={hub}
      hubLabel="Creative status"
      execution={
        <SectionCard
          title="Generate briefs"
          desc="Generates draft creative briefs from the pillars of the strategy run chosen below. Generated briefs fully replace the prior generated set."
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <MetricTile label="Total briefs" value={String(briefs.length)} variant="primary" />
            <MetricTile label="Pillars covered" value={String(pillarsCovered)} sub={`of ${strategy?.message_pillars.length ?? 0}`} />
            <MetricTile label="Static" value={String(byFormat("static").length)} />
            <MetricTile label="Video + UGC" value={String(byFormat("video").length + byFormat("ugc").length)} sub="briefs · none source-backed yet" />
          </div>
          <PrerequisiteGate
            met={strategyOk}
            loading={status.isLoading}
            title="Generate strategy first"
            message="Briefs are generated from strategy message pillars, and this account has none yet. Imported or generated, either works."
            ctaLabel="Go to Strategy"
            ctaTo={withFrom("/app/strategy", fp)}
          >
            {() => (
              <div className="space-y-3">
                <StrategyRunPicker runs={strategyRuns} value={baseStrategyRun?.id ?? null} onChange={chooseStrategyRun} />
                <div className="flex items-center justify-between gap-3">
                  <span className="text-caption text-muted-foreground/75">
                    {briefs.length > 0 ? `${briefs.length} briefs across ${pillarsCovered} pillars.` : "No briefs generated yet."}
                  </span>
                  <GenerateButton
                    onClick={() => generation.start(baseStrategyRun ? { strategy_run_id: baseStrategyRun.id } : undefined)}
                    isRunning={generation.isRunning}
                    label={bb?.provenance === "generated" ? "Regenerate briefs" : "Generate from strategy"}
                    runningLabel="Generating…"
                  />
                </div>
                {/* The run's progress and its failure render in the status
                    hub above (§4); the card keeps the trigger and its base. */}
              </div>
            )}
          </PrerequisiteGate>
        </SectionCard>
      }
      recommendations={recommendationsForStage(deriveRecommendations(acct), 4)}
      explore={children}
      exploreLabel="Creative pages"
    >
      <SectionCard
        title="Run history"
        desc="Most recent brief generation runs for this account, and the strategy run each read."
        right={<CrossLink to="/app/creative/builder" label="View briefs" />}
      >
        {recentRuns.length === 0 ? (
          <p className="text-caption text-muted-foreground/75">No generation runs yet for this account.</p>
        ) : (
          <div className="flex flex-col">
            {recentRuns.map((run) => (
              <GenerationRunRow key={run.id} run={run} kind="briefs" strategyRuns={strategyRuns} />
            ))}
          </div>
        )}
      </SectionCard>

      {/* No second PrerequisiteGate here: strategyOk is already enforced by
          the execution card above. Without a strategy there simply are no
          briefs yet, and the empty state below says so. */}
      <ModuleTabs tabs={TABS} active={tab} onChange={(id) => setTab(id)} />

      {bb?.source_policy && <CaveatNote text={bb.source_policy} />}

      {shown.length === 0 ? (
        <PendingState
          title={`No ${tab === "ugc" ? "UGC" : tab} briefs yet`}
          message={
            !strategyOk
              ? "Briefs are generated from strategy message pillars, and this account has none yet."
              : tab === "static"
                ? "No draft briefs for this account yet. Generate a set from its strategy pillars."
                : `No source-backed ${tab === "ugc" ? "UGC" : "video"} briefs exist for this account yet. Briefs are only generated from validated strategy. Nothing is fabricated.`
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
                {/* A brief's status is a stage, not a problem: a neutral chip,
                    the same as the Brief Builder's. */}
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
    </StageLayout>
  );
}
