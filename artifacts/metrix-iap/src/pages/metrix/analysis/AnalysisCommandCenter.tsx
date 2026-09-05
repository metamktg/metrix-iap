// ─── Analysis · Command Center ──────────────────────────────────────────
// The parent /app/analysis route, on the Execution Layer shell (StageLayout,
// sweep spec §3): header · spine · status hub · execution card · direction
// rail · content · explore. Execution (run analysis on staged uploads) and
// the loop-hub nav; no charts, no analytical tables. Those live only in the
// child pages (Ad Performance, IAP Library, Audience, Placements, Budget,
// History).

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useLocation } from "wouter";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getAnalysisData } from "@/lib/data/metrixSeedAdapter";
import type { AdAccount } from "@/lib/data/seedTypes";
import { useStageStatus } from "@/hooks/useStageStatus";
import { resolveObjectivesMeta } from "@/lib/data/cohortMeta";
import {
  ModuleScopeGate, SectionCard, CrossLink,
  MetricTile, fmtNum, OverviewHeaderControls, type ViewPreset,
  LoopChecklist, firstRunSteps, type HubNavItem,
} from "../shared";
import { StageLayout } from "../StageLayout";
import { ManualImportDialog, ConnectMetaDialog } from "../ConnectAccountDialogs";
import { AnalysisControls, type AnalysisDateRange } from "../ManualAnalysisControls";
import { deriveCreativeNextStep } from "@/components/creative/CreativeNextStepNudge";
import { useDeconstruction } from "@/components/creative/useDeconstruction";
import { buildAnalysisHub } from "@/lib/loop/statusHub";
import {
  useListAnalysisRuns, getListAnalysisRunsQueryKey,
  useListManualImports, getListManualImportsQueryKey,
  type ManualImportKind,
} from "@workspace/api-client-react";
import {
  LayoutDashboard, Library, Dna, Users, LayoutGrid, Wallet, History,
  CheckCircle2, XCircle, Loader2, FileJson, FileText, FileUp,
} from "lucide-react";
import { deriveRecommendations, recommendationsForStage } from "@/lib/data/recommendations";

const SECTION = "Analysis · 03";

// Header window pill → how many days back a run counts as "in window".
// "all" has no cutoff. Distinct from AnalysisControls' own date-range picker
// below (AnalysisDateRange, "7d"/"14d"/"30d"/"all") — that one scopes what
// staged CSV history the NEXT run will ingest; this one just filters which
// past runs the Run History card shows. Different questions, different
// controls, deliberately not merged.
const PRESET_DAYS: Record<Exclude<ViewPreset, "all">, number> = { "7d": 7, "14d": 14, "28d": 28, "90d": 90 };

const WINDOW_TILE_LABEL: Record<AnalysisDateRange, string> = {
  "7d": "7 days", "14d": "14 days", "30d": "30 days", all: "All staged data",
};

const IMPORT_KIND_LABEL: Record<ManualImportKind, string> = {
  performance_demo_csv: "Demographics CSV",
  performance_placement_csv: "Placements CSV",
  performance_ad_summary_csv: "Ad Summary CSV",
  performance_conversion_device_csv: "Conversion Device CSV",
  performance_asset_csv: "Asset breakdown CSV",
  creative_asset: "Creative asset",
};

const HISTORY_TO = "/app/analysis/history";

export function AnalysisCommandCenter() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);

  return (
    <ModuleScopeGate section={SECTION} title="Analysis" account={account} allowUnconfigured>
      {() => <AnalysisStage account={account!} />}
    </ModuleScopeGate>
  );
}

/** The page behind the scope gate; every account-scoped hook lives here. */
function AnalysisStage({ account: acct }: { account: AdAccount }) {
  const [, navigate] = useLocation();
  const seed = useMetrixSeed();
  const status = useStageStatus(acct.id);
  // Polls while a run is in flight so the hub, the Run history card and the
  // stage strip move with the run instead of waiting for it to settle. The
  // global staleTime is Infinity, so without this they never re-read.
  const { data: runsData } = useListAnalysisRuns(acct.id, {
    query: {
      queryKey: getListAnalysisRunsQueryKey(acct.id),
      refetchInterval: (q) => ((q.state.data?.runs ?? []).some((r) => r.status === "running") ? 3000 : false),
    },
  });
  const { data: importsData } = useListManualImports(acct.id, { query: { queryKey: getListManualImportsQueryKey(acct.id) } });
  const runs = runsData?.runs ?? [];
  const imports = importsData?.imports ?? [];
  const runCount = runs.filter((r) => r.status === "success").length;
  const stagedImports = imports.filter((imp) => imp.status === "staged");

  // Header display-window pill — filters which past runs the Run History
  // card shows below. Distinct from AnalysisControls' own "date range to
  // analyze" picker (see PRESET_DAYS comment above).
  const [preset, setPreset] = useState<ViewPreset>("all");
  // Mirrors AnalysisControls' own dateRange state — real value, no second
  // source of truth for what the next run will actually analyze.
  const [runWindow, setRunWindow] = useState<AnalysisDateRange>("30d");
  // Summary/Detailed header toggle. Real backing: it's the same collapsed
  // state that gates the execution card's date-range chooser + warnings —
  // not a decorative pill. Summary = collapsed (tiles + button only).
  const [detailOn, setDetailOn] = useState(false);
  // The setup strip's dialogs (first run only).
  const [importOpen, setImportOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  // From the Run click until the server's run row exists: the hub shows the
  // pre-flight so the click is never followed by nothing (§4.1).
  const [starting, setStarting] = useState(false);
  // The hub's elapsed readout moves once a second while anything is in flight.
  const inFlight = starting || runs.some((r) => r.status === "running");
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!inFlight) return;
    setNowMs(Date.now());
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [inFlight]);
  // The staged-creatives next step is one line in the hub's inputs row on
  // this page (§3.4); the banner form of it renders on Creative only.
  const decon = useDeconstruction(acct.id);
  const latestSuccess = runs.filter((r) => r.status === "success").sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())[0] ?? null;
  const usableDecon = decon.deconstructions.filter((d) => d.status !== "discarded" && d.status !== "unsupported");
  const creativeStep = latestSuccess && !decon.isRunning
    ? deriveCreativeNextStep({
        creativeImportIds: imports.filter((i) => i.kind === "creative_asset").map((i) => i.id),
        deconstructedImportIds: usableDecon.map((d) => d.manual_import_id),
        newestDeconstructionAt: usableDecon.reduce<string | null>((max, d) => (!max || d.created_at > max ? d.created_at : max), null),
        latestSuccessfulRunAt: latestSuccess.finished_at ?? latestSuccess.started_at ?? null,
      })
    : null;

  // The checklist's "Run analysis" step brings the run card into view and
  // hands it focus: the card is on this page, so a link to /app/analysis
  // would land the reader where they already are.
  const runCardRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const revealRunCard = () => {
    const el = runCardRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    el.focus({ preventScroll: true });
  };

  // Before the first successful run the centre is the setup surface: the
  // checklist sits above the run card, and the modules that read a run's
  // output (the export, the explore grid) wait for one. The account's
  // status is the signal (it flips to configured when real analysis data
  // lands), not the runs list, which is empty until its query answers and
  // would flash the strip on a configured account.
  const firstRun = acct.status !== "configured";
  const objectivesMeta = resolveObjectivesMeta(acct.objectives);
  const adsInScope = acct.ads?.length ?? 0;
  const analysis = getAnalysisData(seed, acct.id);

  const hub = buildAnalysisHub({
    runs,
    imports,
    windowLabel: WINDOW_TILE_LABEL[runWindow],
    creativeStep,
    starting,
    nowMs,
    historyTo: HISTORY_TO,
  });

  const recentRuns = preset === "all"
    ? runs.slice(0, 3)
    : runs
        .filter((r) => r.started_at && Date.now() - new Date(r.started_at).getTime() <= PRESET_DAYS[preset] * 86_400_000)
        .slice(0, 3);

  const explore: HubNavItem[] = firstRun ? [] : [
    {
      to: "/app/analysis/performance",
      label: "Ad Performance",
      desc: "Campaign totals, control reads, and the full breakdown once analysis has run.",
      Icon: LayoutDashboard,
      lineage: "analysis.concept_rollup[] · performance_by_cell[]",
    },
    {
      to: "/app/analysis/library",
      label: "IAP Library",
      desc: "Cell and variable performance across the account.",
      Icon: Library,
      lineage: "analysis.performance_by_cell[] · v3_variable_performance[]",
    },
    {
      to: "/app/analysis/dna",
      label: "Creative DNA",
      desc: "Per-variable lift and tested combinations across the account.",
      Icon: Dna,
      lineage: "analysis.v3_variable_performance[] · scaling_playbook",
    },
    {
      to: "/app/analysis/audience",
      label: "Audience",
      desc: "Demographic result signal by age and gender.",
      Icon: Users,
      lineage: "analysis.demographic_registration_signal[]",
    },
    {
      to: "/app/analysis/placements",
      label: "Placements",
      desc: "Where delivery happened and what each placement produced.",
      Icon: LayoutGrid,
      lineage: "analysis.v3_placement_signal[] · c4e_placement_signal[]",
    },
    {
      to: "/app/analysis/budget",
      label: "Budget",
      desc: "Spend allocation by result event, concept, and placement.",
      Icon: Wallet,
      lineage: "campaign_summary · performance_by_cell[]",
    },
    {
      to: HISTORY_TO,
      label: runCount > 0 ? `Run history · ${runCount} run${runCount !== 1 ? "s" : ""}` : "Run history",
      desc: runCount > 0
        ? `${runCount} successful run${runCount !== 1 ? "s" : ""} · each can be selected independently when building strategy in the IAP Loop.`
        : "Full detail on analysis runs for this account, including data-integrity flags.",
      Icon: History,
      lineage: "manual_analysis_runs[]",
    },
  ];

  return (
    <StageLayout
      stage="analysis"
      section={SECTION}
      title="Analysis"
      accountName={acct.name}
      subtitle={firstRun
        ? "Stage this account's exports, then run its first analysis. Never runs automatically."
        : "Analyze this account's staged uploads for a chosen window. Never runs automatically. Every child page reads a different slice of the same result."}
      headerRight={
        <OverviewHeaderControls
          preset={preset}
          onPresetChange={setPreset}
          detailOn={detailOn}
          onToggleDetail={() => setDetailOn((v) => !v)}
          exportTo="/app/exports/analysis"
        />
      }
      status={status}
      hub={hub}
      hubLabel="Analysis status"
      execution={
        <>
          {firstRun && (
            <SectionCard
              title="Set up this account"
              desc="What the first run needs, from what is staged now."
              collapsible={false}
            >
              <div data-testid="first-run-checklist">
                <LoopChecklist
                  steps={firstRunSteps(acct, imports, {
                    openImport: () => setImportOpen(true),
                    openConnect: () => setConnectOpen(true),
                    run: revealRunCard,
                  })}
                />
              </div>
            </SectionCard>
          )}
          {/* Staging happens here, not only in Settings: the Manual import
              card's "Add import" opens the same dialog for every account. */}
          <ManualImportDialog account={acct} open={importOpen} onOpenChange={setImportOpen} />
          <ConnectMetaDialog account={acct} open={connectOpen} onOpenChange={setConnectOpen} />

          <div ref={runCardRef} tabIndex={-1} data-testid="analysis-run-card" className="outline-none scroll-mt-4">
            <SectionCard
              title="Run analysis"
              desc="Pick a date range and explicitly analyze the staged manual uploads. Never runs automatically."
            >
              {/* Pre-run readiness stats, not stale analysis-derived
                  numbers. Every value here still reflects real state
                  even when no analysis has ever run for this account. */}
              <div className="grid grid-cols-dashboard-3 gap-3 mb-2.5">
                <MetricTile label="Staged imports" value={fmtNum(stagedImports.length)} variant="primary" />
                <MetricTile label="Ads in scope" value={fmtNum(adsInScope)} />
                <MetricTile label="Window" value={WINDOW_TILE_LABEL[runWindow]} />
              </div>
              {/* Objectives belong to THIS run (they decide which terminal
                  metric it reads), so they stay on the run card. They are
                  not a headline: as a fourth stat tile, a long text value
                  ("Ecommerce + Lead Generation") rendered at stat size
                  outranked the three real run parameters beside it and read
                  as a standing classification of the account. Demoted to
                  the quiet parameter line it is. */}
              <p className="text-caption text-muted-foreground/75 mb-4" data-testid="run-objectives-line">
                <span className="text-micro-num uppercase tracking-widest text-muted-foreground/75">Objectives · </span>
                {objectivesMeta.label}
              </p>
              {/* The run's progress renders in the status hub above (§4);
                  the card keeps the trigger and its parameters. */}
              <AnalysisControls
                accountId={acct.id}
                onDateRangeChange={setRunWindow}
                detailsOpen={detailOn}
                progressInHub
                onStartingChange={setStarting}
              />
            </SectionCard>
          </div>
        </>
      }
      recommendations={recommendationsForStage(deriveRecommendations(acct), 2)}
      explore={explore}
      exploreLabel="Analysis pages"
      footer={
        // Findings is an Analysis page kept off the menu (navTree
        // `hidden: true`) until its producer runs for real accounts;
        // until now its only inbound path was a legacy redirect.
        <div className="flex items-center gap-3 flex-wrap">
          <CrossLink to="/app/analyze/findings" label="Findings" srNote="verdicts and recommendations from the analysis" />
        </div>
      }
    >
      <SectionCard
        title="Manual import"
        desc={stagedImports.length > 0
          ? `${stagedImports.length} file${stagedImports.length !== 1 ? "s" : ""} staged for the next analysis run.`
          : "No files currently staged."}
        right={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="pressable inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border/50 text-caption font-semibold text-foreground/85 hover:text-foreground hover:bg-foreground/5 transition-colors"
              data-testid="button-add-import"
            >
              <FileUp className="w-3.5 h-3.5" /> Add import
            </button>
            <CrossLink to="/app/settings/general" label="Manage imports" />
          </div>
        }
      >
        {stagedImports.length === 0 ? (
          <p className="text-caption text-muted-foreground/75">
            Add a performance export before running analysis. Settings keeps every staged file.
          </p>
        ) : (
          <div className="flex flex-col">
            {stagedImports.map((imp) => (
              <div key={imp.id} className="flex items-center gap-2.5 py-2 border-t border-border/25 first:border-0 min-w-0">
                <FileText className="w-3.5 h-3.5 text-muted-foreground/75 shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-body text-foreground/85 truncate">{imp.filename}</span>
                  <span className="block text-label text-muted-foreground/75">
                    {IMPORT_KIND_LABEL[imp.kind] ?? imp.kind}
                    {imp.created_at && ` · ${new Date(imp.created_at).toLocaleString()}`}
                  </span>
                </span>
                <span className="mx-inline-badge mx-inline-badge--info shrink-0">Staged</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Run history"
        desc={preset === "all"
          ? "Most recent analysis runs for this account, most recent first."
          : `Analysis runs from the last ${PRESET_DAYS[preset]} days, most recent first.`}
        right={<CrossLink to={HISTORY_TO} label="Full history" />}
      >
        {recentRuns.length === 0 ? (
          <p className="text-caption text-muted-foreground/75">
            {runs.length === 0 ? "No analysis runs yet for this account." : "No analysis runs in the selected window."}
          </p>
        ) : (
          <div className="flex flex-col">
            {recentRuns.map((r) => (
              <div key={r.id} className="flex items-center gap-2.5 py-2 border-t border-border/25 first:border-0 min-w-0">
                {r.status === "running" && <Loader2 className="w-4 h-4 text-status-warning animate-spin shrink-0" />}
                {r.status === "success" && <CheckCircle2 className="w-4 h-4 text-status-success shrink-0" />}
                {r.status === "error" && <XCircle className="w-4 h-4 text-status-danger shrink-0" />}
                <span className="flex-1 min-w-0">
                  <span className="block text-body text-foreground/85 truncate">
                    {r.status === "success" && r.date_start && r.date_end
                      ? `${r.date_start} → ${r.date_end}`
                      : r.date_range ?? "custom range"}
                    {r.rows_ingested != null && ` · ${fmtNum(r.rows_ingested)} rows`}
                  </span>
                  <span className="block text-label text-muted-foreground/75">
                    {r.started_at ? new Date(r.started_at).toLocaleString() : r.id}
                  </span>
                </span>
                <span
                  className={`mx-inline-badge shrink-0 capitalize ${
                    r.status === "success"
                      ? "mx-inline-badge--success"
                      : r.status === "error"
                      ? "mx-inline-badge--danger"
                      : r.status === "running"
                      ? "mx-inline-badge--warning"
                      : ""
                  }`}
                >
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {!firstRun && (
        <SectionCard
          title="JSON export"
          desc="Read-only snapshot of this account's Analysis data. Exports never mutate the loop."
        >
          <button
            type="button"
            onClick={() => navigate("/app/exports/analysis")}
            data-testid="analysis-json-export-row"
            className="pressable-lg w-full flex items-center gap-2.5 rounded-lg border border-border/30 bg-foreground/[0.015] hover:bg-foreground/[0.03] hover:border-primary/25 px-3 py-2.5 text-left transition-colors"
          >
            <FileJson className="w-3.5 h-3.5 text-interactive/80 shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block text-body text-foreground/85 truncate">Analysis export</span>
              <span className="block text-label text-muted-foreground/75">
                {analysis
                  ? `${fmtNum(analysis.performance_by_cell.length)} cell rows · ${fmtNum(analysis.v3_variable_performance.length)} variable rows`
                  : "No analysis data yet"}
              </span>
            </span>
            <span className="text-label font-semibold text-interactive shrink-0">Open</span>
          </button>
        </SectionCard>
      )}
    </StageLayout>
  );
}
