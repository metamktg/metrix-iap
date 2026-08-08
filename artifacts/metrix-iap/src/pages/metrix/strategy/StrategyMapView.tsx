// ─── Strategy · Strategy Map ──────────────────────────────────────────
// Three-column interactive map: Pillars (left) → Source Cells (centre)
// → Hypotheses (right). Selecting a pillar filters the centre and right
// columns. Next-actions panel below shows priority hypotheses for the
// selected pillar with a local "Queue for test" affordance.

import { useState, useCallback } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getStrategyData, getAnalysisData } from "@/lib/data/metrixSeedAdapter";
import { resolveInlineVariableCodes } from "@/lib/variable-registry";
import {
  ModuleHeader, ModuleScopeGate, PendingState,
  CrossLink, fmtUSD, fmtNum, FlowCrumb, useFromParam, LoopAction,
  DetailReveal, deriveLabel, InfoTooltip, useShowMore, ShowMoreButton,
  SectionInfoIcon,
} from "../shared";
import {
  VariableStackChips, IcpChips, PillarDetailSections, pillarHasDetails,
  HypothesisLabel, HypothesisStatusBadge, HypothesisCodeChipsRow,
  VariableCombinationsGrid, playbookHasContent, ScalingPlaybookLanes,
} from "./strategyShared";
import { splitTitle } from "@/lib/normalize";
import { SegmentGridModal, SegmentDrilldownButton } from "@/components/creative/SegmentGridModal";
import { cn } from "@workspace/command-deck/lib/utils";
import {
  Map, ChevronDown, FlaskConical, CheckSquare,
  Square, Lightbulb,
} from "lucide-react";
import type { MessagePillar, ActiveHypothesis, VariableCombination, ScalingPlaybook } from "@/lib/data/seedTypes";
import { ConceptChip } from "@/components/concept/ConceptChip";
import { useConceptRegistry } from "@/lib/concept-registry-context";
import { TYPE } from "../typography";

const SECTION = "Strategy · 04";

// Accent colors cycle: each pillar gets a stable accent by index.
const PILLAR_ACCENTS = [
  "border-l-emerald-400/60",
  "border-l-blue-400/60",
  "border-l-purple-400/60",
  "border-l-amber-400/60",
  "border-l-cyan-400/60",
  "border-l-rose-400/60",
  "border-l-indigo-400/60",
];

const PILLAR_DOT = [
  "bg-emerald-400/70",
  "bg-chart-1/70",
  "bg-purple-400/70",
  "bg-amber-400/70",
  "bg-cyan-400/70",
  "bg-rose-400/70",
  "bg-indigo-400/70",
];

// Hypothesis priority for the next-actions panel sort.
const PRIORITY_ORDER: Record<string, number> = {
  high: 0, p1: 0,
  medium: 1, p2: 1,
  validation_required: 2,
  low: 3, p3: 3,
  ready_for_brief_builder: 4,
};

function sortByPriority(hyps: ActiveHypothesis[]): ActiveHypothesis[] {
  return [...hyps].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.status.toLowerCase()] ?? 5;
    const pb = PRIORITY_ORDER[b.status.toLowerCase()] ?? 5;
    return pa - pb;
  });
}

// ─── Resizable column handle ─────────────────────────────────────────

function ResizeHandle({ onResize }: { onResize: (dx: number) => void }) {
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      let lastX = e.clientX;
      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - lastX;
        lastX = ev.clientX;
        onResize(dx);
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [onResize]
  );
  return (
    <div
      className="w-1.5 shrink-0 cursor-col-resize hover:bg-primary/30 active:bg-primary/60 transition-colors border-x border-border/20"
      onMouseDown={handleMouseDown}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize column"
    />
  );
}

// ─── Left column: compact pillar list card ────────────────────────────

function PillarListCard({
  pillar,
  index,
  selected,
  onClick,
}: {
  pillar: MessagePillar;
  index: number;
  selected: boolean;
  onClick: () => void;
}) {
  const t = splitTitle(pillar.label);
  const accentBorder = PILLAR_ACCENTS[index % PILLAR_ACCENTS.length];
  const dot = PILLAR_DOT[index % PILLAR_DOT.length];
  return (
    <button
      type="button"
      data-testid={`pillar-list-card-${pillar.id}`}
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "w-full text-left px-3 py-2.5 border-l-2 transition-all flex flex-col gap-1",
        accentBorder,
        selected
          ? "bg-primary/[0.09] border-r border-r-transparent shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.08)]"
          : "bg-transparent hover:bg-white/[0.04]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      )}
    >
      {/* Number + dot + name */}
      <div className="flex items-start gap-1.5">
        <div className="flex items-center gap-1 mt-0.5 shrink-0">
          <span className={cn("w-1.5 h-1.5 rounded-full shrink-0 transition-opacity", dot, selected ? "opacity-100" : "opacity-50")} />
          <span className={cn(TYPE.label, "tabular-nums text-muted-foreground/50 w-3.5 text-right")}>
            {String(index + 1).padStart(2, "0")}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "text-body font-semibold leading-tight line-clamp-2",
              selected ? "text-foreground" : "text-foreground/75"
            )}
            title={pillar.label}
          >
            {t.main}
          </p>
          {/* Descriptor snippet — visible only when selected */}
          {selected && pillar.plain_descriptor && (
            <p className={cn(TYPE.label, "text-muted-foreground/50 leading-snug mt-1 line-clamp-2")}>
              {pillar.plain_descriptor.slice(0, 80)}
              {pillar.plain_descriptor.length > 80 ? "…" : ""}
            </p>
          )}
        </div>
      </div>

      {/* Cell count + hyp count */}
      <div className="pl-4 flex items-center gap-2">
        <span className={cn(TYPE.label, selected ? "text-muted-foreground/60" : "text-muted-foreground/40", "tabular-nums")}>
          {pillar.source_cells.length} cell{pillar.source_cells.length !== 1 ? "s" : ""}
        </span>
      </div>
    </button>
  );
}

// ─── Centre column: source cell card ─────────────────────────────────
// Optical hierarchy: concept name is the primary text (what the creative IS),
// cell code is the identifier below, spend/results are the evidence strip.

function SourceCellCard({
  cellId,
  conceptName,
  spend,
  results,
}: {
  cellId: string;
  conceptName?: string;
  spend?: number;
  results?: number;
}) {
  const { registry } = useConceptRegistry();
  const hasEvidence = (spend ?? 0) > 0 || (results ?? 0) > 0;
  return (
    <div className="rounded-lg border border-border/40 bg-white/[0.025] p-3 flex flex-col gap-2">
      {/* Primary: concept name (if available) */}
      {conceptName && (
        <p className={cn(TYPE.body, "font-semibold text-foreground/85 leading-snug truncate")} title={conceptName}>
          {conceptName}
        </p>
      )}

      {/* Cell code chip — identifier row */}
      <div className="flex items-center gap-2 flex-wrap">
        {registry[cellId] ? (
          <ConceptChip code={cellId} />
        ) : (
          <span className="text-label font-mono font-semibold text-interactive/80 border border-primary/20 bg-primary/[0.04] px-1.5 py-0.5 rounded leading-none">
            {cellId}
          </span>
        )}
      </div>

      {/* Evidence strip — spend + results as secondary KPIs */}
      {hasEvidence && (
        <div className="flex items-center gap-3 pt-1 border-t border-border/15">
          {(spend ?? 0) > 0 && (
            <div className="flex flex-col gap-0.5">
              <span className={cn(TYPE.microLabel, "text-muted-foreground/40")}>Spend</span>
              <span className={cn(TYPE.label, "text-foreground/65 tabular-nums font-semibold")}>{fmtUSD(spend, 0)}</span>
            </div>
          )}
          {(results ?? 0) > 0 && (
            <div className="flex flex-col gap-0.5">
              <span className={cn(TYPE.microLabel, "text-muted-foreground/40")}>Results</span>
              <span className={cn(TYPE.label, "text-foreground/65 tabular-nums font-semibold")}>{fmtNum(results)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Right column: hypothesis card ────────────────────────────────────
// Priority → left-border accent: high/P1 = amber, validation_required = blue,
// ready_for_brief = emerald, everything else = neutral.

function hypPriorityAccent(status: string): string {
  const s = status.toLowerCase();
  if (s === "high" || s === "p1") return "border-l-[3px] border-l-amber-400/60";
  if (s === "medium" || s === "p2") return "border-l-[3px] border-l-amber-400/30";
  if (s === "validation_required") return "border-l-[3px] border-l-accent/40";
  if (s === "ready_for_brief_builder") return "border-l-[3px] border-l-emerald-400/50";
  return "border-l-[3px] border-l-border/25";
}

function HypCard({ h }: { h: ActiveHypothesis }) {
  return (
    <div
      data-testid={`hyp-row-${h.id}`}
      className={cn(
        "rounded-lg border border-border/30 bg-white/[0.015] px-3 py-2 flex flex-col gap-1.5 overflow-hidden",
        hypPriorityAccent(h.status)
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <HypothesisStatusBadge status={h.status} />
        <CrossLink to={`/app/strategy/hypotheses?focus=${h.id}`} label="Open" />
      </div>
      <HypothesisLabel label={h.label} isolated={h.isolated_variable} />
    </div>
  );
}

// ─── Selected-pillar hypotheses list (folded) ─────────────────────────
// Extracted so the show-more hook can be called unconditionally, outside
// the ModuleScopeGate render callback.

function SelectedHypsList({ hyps }: { hyps: ActiveHypothesis[] }) {
  const sorted = sortByPriority(hyps);
  const fold = useShowMore(sorted, 6);
  return (
    <>
      {fold.visible.map((h) => (
        <HypCard key={h.id} h={h} />
      ))}
      <ShowMoreButton
        total={sorted.length}
        hiddenCount={fold.hiddenCount}
        expanded={fold.expanded}
        onToggle={fold.toggle}
        noun="hypotheses"
      />
    </>
  );
}

// ─── Next-actions panel ───────────────────────────────────────────────
// Collapsible panel below the map; shows top pending hypotheses for
// the selected pillar, each with a visual "Queue for test" affordance.

function NextActionsPanel({
  pillar,
  hypotheses,
  queued,
  onToggleQueue,
}: {
  pillar: MessagePillar;
  hypotheses: ActiveHypothesis[];
  queued: Set<string>;
  onToggleQueue: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const pending = sortByPriority(
    hypotheses.filter((h) => !["ready_for_brief_builder"].includes(h.status.toLowerCase()))
  ).slice(0, 4);

  const t = splitTitle(pillar.label);

  if (pending.length === 0) return null;

  return (
    <div className="shrink-0 border-t border-border/30 bg-white/[0.01]">
      {/* Panel header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-4 py-2 hover:bg-white/[0.03] transition-colors text-left"
      >
        <Lightbulb className="w-3.5 h-3.5 text-amber-300/70 shrink-0" />
        <span className={cn(TYPE.caption, "font-semibold text-foreground/80 flex-1 truncate")}>
          Next actions · {t.main}
        </span>
        <span className={cn(TYPE.label, "text-muted-foreground/50 shrink-0")}>
          {pending.length} pending
        </span>
        <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground/40 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="px-4 pb-3 grid grid-cols-2 gap-2">
          {pending.map((h) => {
            const isQueued = queued.has(h.id);
            return (
              <div
                key={h.id}
                className="rounded-lg border border-border/30 bg-white/[0.015] px-3 py-2 flex flex-col gap-1.5"
              >
                <div className="flex items-center gap-1.5">
                  <HypothesisStatusBadge status={h.status} />
                </div>
                {/* Chips-only row inside button context, no nested reveal */}
                <div>
                  <HypothesisCodeChipsRow label={h.label} />
                  <p className={cn(TYPE.label, "text-muted-foreground/60 mt-1 line-clamp-1")} title={h.label}>
                    {deriveLabel(h.label, 55)}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-2 mt-auto pt-1">
                  <button
                    type="button"
                    onClick={() => onToggleQueue(h.id)}
                    aria-pressed={isQueued}
                    className={cn(
                      "inline-flex items-center gap-1.5 text-label font-medium border rounded px-1.5 py-1 transition-colors leading-none",
                      isQueued
                        ? "bg-emerald-400/10 text-emerald-400 border-emerald-400/30"
                        : "bg-white/[0.03] text-muted-foreground/70 border-border/40 hover:text-foreground hover:border-border/70"
                    )}
                  >
                    {isQueued ? (
                      <CheckSquare className="w-3 h-3" />
                    ) : (
                      <Square className="w-3 h-3" />
                    )}
                    {isQueued ? "Queued" : "Queue for test"}
                  </button>
                  <CrossLink to={`/app/strategy/hypotheses?focus=${h.id}`} label="Open" />
                </div>
              </div>
            );
          })}
          {queued.size > 0 && (
            <div className="col-span-2 flex justify-end">
              <CrossLink to="/app/strategy/hypotheses" label="Manage queue →" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Footer: variable combinations + scaling playbook ─────────────────
// Collapsible (default closed) so the three-column map gets full height.

function FooterPanel({
  combinations,
  playbook,
}: {
  combinations: VariableCombination[];
  playbook: ScalingPlaybook | null | undefined;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="shrink-0 border-t border-border/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-6 py-2.5 hover:bg-white/[0.02] transition-colors text-left"
      >
        <span className={cn(TYPE.caption, "font-semibold text-foreground/70 flex-1")}>
          Variable combinations · Scaling playbook
        </span>
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 text-muted-foreground/40 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <div className="px-6 pb-4 space-y-4 max-h-[45vh] overflow-y-auto">
          {combinations.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <h3 className="text-base font-semibold text-foreground">Variable combinations</h3>
                <InfoTooltip content="Validated variable stacks with their real CPA / CVR reads and the engine's recommendation." />
              </div>
              <VariableCombinationsGrid combinations={combinations} />
            </div>
          )}
          {playbookHasContent(playbook) && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <h3 className="text-base font-semibold text-foreground">Scaling playbook</h3>
                <InfoTooltip content="Where the analysis says to push, tune, prove, look next — and what to stay away from." />
              </div>
              <ScalingPlaybookLanes playbook={playbook!} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────

export function StrategyMapView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);

  // Selection + panel state — must be at component top before any hook calls.
  const [selectedPillarId, setSelectedPillarId] = useState<string | null>(null);
  const [leftWidth, setLeftWidth] = useState(210);
  const [rightWidth, setRightWidth] = useState(260);
  const handleLeftResize = useCallback((dx: number) => {
    setLeftWidth((w) => Math.max(140, Math.min(320, w + dx)));
  }, []);
  const handleRightResize = useCallback((dx: number) => {
    setRightWidth((w) => Math.max(180, Math.min(380, w - dx)));
  }, []);
  const [queued, setQueued] = useState<Set<string>>(new Set());
  const [expandedPillarId, setExpandedPillarId] = useState<string | null>(null);
  const [segmentPillar, setSegmentPillar] = useState<MessagePillar | null>(null);

  const fp = useFromParam();

  const toggleQueue = (id: string) =>
    setQueued((q) => {
      const next = new Set(q);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <ModuleScopeGate section={SECTION} title="Strategy Map" account={account}>
      {() => {
        const acct = account!;
        const strategy = getStrategyData(seed, adAccountId);
        const analysis = getAnalysisData(seed, adAccountId);

        if (!strategy || strategy.message_pillars.length === 0) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Strategy Map" tabs="strategy" account={acct} />
              <PendingState
                title="No strategy map"
                message="The map draws from message pillars — none exist for this account yet."
                icon={Map}
                action={<CrossLink to="/app/strategy/overview" label="Go to Strategy Overview" />}
              />
            </div>
          );
        }

        const pillars = strategy.message_pillars;
        const hypotheses = strategy.active_hypotheses;
        const combinations = strategy.variable_combinations ?? [];
        const playbook = strategy.scaling_playbook ?? null;

        // Resolve selected pillar (default: first)
        const selected =
          pillars.find((p) => p.id === selectedPillarId) ?? pillars[0];
        const selectedIdx = pillars.findIndex((p) => p.id === selected.id);

        const pillarIds = new Set(pillars.map((p) => p.id));
        const hypothesesFor = (pillarId: string) =>
          hypotheses.filter((h) => h.pillar_id === pillarId);
        const unattached = hypotheses.filter(
          (h) => !h.pillar_id || !pillarIds.has(h.pillar_id)
        );

        // Source cells for selected pillar, with analysis data
        const cellEvidence = (cellId: string) => {
          const rows = (analysis?.performance_by_cell ?? []).filter(
            (r) => r.cell_id === cellId
          );
          return {
            spend: rows.reduce((n, r) => n + r["Amount spent (USD)"], 0),
            results: rows.reduce((n, r) => n + r.Results, 0),
            conceptName: rows[0]?.book2_concept_name,
          };
        };

        // Rollup evidence across all cells for the selected pillar (for SegmentGridModal)
        const evidenceTotals = selected.source_cells.reduce(
          (acc, c) => {
            const ev = cellEvidence(c);
            return { spend: acc.spend + ev.spend, results: acc.results + ev.results };
          },
          { spend: 0, results: 0 }
        );

        const selectedHyps = hypothesesFor(selected.id);

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <ModuleHeader
              section={SECTION}
              title="Strategy Map"
              subtitle="Select a pillar to explore its source cells and hypotheses"
              tabs="strategy"
              account={acct}
            />
            <FlowCrumb {...fp} />
              <div className="flex-1 flex flex-col min-h-0">
                {/* ── Three-column map ──────────────────────────────────── */}
                <div className="flex-1 flex min-h-0 overflow-hidden border-t border-border/30">

                  {/* Left column — Pillars list (resizable) */}
                  <div style={{ width: leftWidth }} className="shrink-0 overflow-y-auto bg-white/[0.005]">
                    <div className="px-3 py-2 border-b border-border/20 sticky top-0 bg-background/90 backdrop-blur-sm z-10">
                      <div className="flex items-center gap-1 mb-0.5">
                        <p className={cn(TYPE.microLabel, "text-muted-foreground/35")}>Pillars</p>
                        <SectionInfoIcon tip="Validated message pillars from analysis — select one to trace its source cells and the hypotheses it feeds." />
                      </div>
                      <span className={cn(TYPE.caption, "font-semibold text-foreground/65")}>
                        {pillars.length} message pillar{pillars.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {pillars.map((p, i) => (
                      <PillarListCard
                        key={p.id}
                        pillar={p}
                        index={i}
                        selected={p.id === selected.id}
                        onClick={() => setSelectedPillarId(p.id)}
                      />
                    ))}
                  </div>

                  <ResizeHandle onResize={handleLeftResize} />

                  {/* Centre column — Source cells + variable legend */}
                  <div className="flex-1 overflow-y-auto">
                    {/* Sticky header for selected pillar */}
                    <div className="px-4 py-2.5 border-b border-border/20 sticky top-0 bg-background/90 backdrop-blur-sm z-10 space-y-1.5">
                      {/* Eyebrow + pillar name */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-1.5 min-w-0">
                          <span
                            className={cn(
                              "w-1.5 h-1.5 rounded-full shrink-0 mt-1",
                              PILLAR_DOT[selectedIdx % PILLAR_DOT.length]
                            )}
                          />
                          <div className="min-w-0">
                            <p className={cn(TYPE.microLabel, "text-muted-foreground/35 mb-0.5")}>
                              Source cells
                            </p>
                            <span className={cn(TYPE.caption, "font-semibold text-foreground/80 leading-snug line-clamp-1")}>
                              {splitTitle(selected.label).main}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {evidenceTotals.spend > 0 && (
                            <span className={cn(TYPE.label, "text-muted-foreground/50 tabular-nums")} title="Total spend across source cells">
                              {fmtUSD(evidenceTotals.spend, 0)}
                            </span>
                          )}
                          <span className={cn(TYPE.label, "text-muted-foreground/40 tabular-nums")}>
                            {selected.source_cells.length} cell{selected.source_cells.length !== 1 ? "s" : ""}
                          </span>
                          {analysis && selected.source_cells.length > 0 && (
                            <SegmentDrilldownButton onClick={() => setSegmentPillar(selected)} />
                          )}
                        </div>
                      </div>
                      {/* Variable chips */}
                      {Object.keys(selected.variable_stack).length > 0 && (
                        <VariableStackChips stack={selected.variable_stack} maxVisible={6} />
                      )}
                      {/* ICP targets */}
                      {(selected.target_icps?.length ?? 0) > 0 && (
                        <IcpChips ids={selected.target_icps} profiles={strategy.icp_profiles} maxVisible={4} />
                      )}
                    </div>

                    {/* Source cell cards */}
                    <div className="p-3 space-y-2">
                      {selected.source_cells.length === 0 ? (
                        <div className="py-8 text-center">
                          <p className={cn(TYPE.caption, "text-muted-foreground/50")}>
                            No source cells linked to this pillar yet.
                          </p>
                        </div>
                      ) : (
                        selected.source_cells.map((cellId) => {
                          const ev = cellEvidence(cellId);
                          return (
                            <SourceCellCard
                              key={cellId}
                              cellId={cellId}
                              conceptName={ev.conceptName}
                              spend={ev.spend}
                              results={ev.results}
                            />
                          );
                        })
                      )}

                      {/* Pillar execution detail (collapsible) */}
                      {pillarHasDetails(selected) && (
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedPillarId((id) =>
                                id === selected.id ? null : selected.id
                              )
                            }
                            aria-expanded={expandedPillarId === selected.id}
                            className="inline-flex items-center gap-1 text-caption font-semibold text-interactive hover:text-interactive/80 transition-colors"
                          >
                            <ChevronDown
                              className={cn(
                                "w-3.5 h-3.5 transition-transform",
                                expandedPillarId === selected.id && "rotate-180"
                              )}
                            />
                            {expandedPillarId === selected.id
                              ? "Hide execution detail"
                              : "Execution detail"}
                          </button>
                          {expandedPillarId === selected.id && (
                            <div className="mt-3">
                              <PillarDetailSections pillar={selected} profiles={strategy.icp_profiles} />
                            </div>
                          )}
                        </div>
                      )}

                      {/* Descriptor detail */}
                      {selected.plain_descriptor && (
                        <div className="pt-1">
                          <DetailReveal
                            label={deriveLabel(selected.plain_descriptor, 80)}
                            labelClassName={TYPE.caption}
                            eyebrow={selected.label}
                            sections={[
                              { label: "Descriptor", text: selected.plain_descriptor },
                              {
                                label: "Why it matters",
                                text: selected.why_it_matters
                                  ? resolveInlineVariableCodes(selected.why_it_matters)
                                  : undefined,
                              },
                            ]}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <ResizeHandle onResize={handleRightResize} />

                  {/* Right column — Hypotheses (resizable) */}
                  <div style={{ width: rightWidth }} className="shrink-0 overflow-y-auto">
                    <div className="px-3 py-2 border-b border-border/20 sticky top-0 bg-background/90 backdrop-blur-sm z-10">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <FlaskConical className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                          <div>
                            <p className={cn(TYPE.microLabel, "text-muted-foreground/35 mb-0.5")}>Hypotheses</p>
                            <span className={cn(TYPE.caption, "font-semibold text-foreground/65")}>
                              {selectedHyps.length} active
                            </span>
                          </div>
                        </div>
                        {selectedHyps.length > 0 && (
                          <CrossLink to="/app/strategy/hypotheses" label="Queue →" />
                        )}
                      </div>
                    </div>

                    <div className="p-3 space-y-2">
                      {selectedHyps.length === 0 ? (
                        <div className="py-8 text-center">
                          <p className={cn(TYPE.caption, "text-muted-foreground/50")}>
                            No hypotheses linked to this pillar.
                          </p>
                        </div>
                      ) : (
                        <SelectedHypsList hyps={selectedHyps} />
                      )}

                      {/* Unattached hypotheses in right column when applicable */}
                      {unattached.length > 0 && selected.id === pillars[0].id && (
                        <div className="mt-3 border-t border-border/20 pt-3">
                          <p className={cn(TYPE.label, "text-muted-foreground/40 mb-2")}>
                            Unattached ({unattached.length})
                          </p>
                          <div className="space-y-2">
                            {unattached.slice(0, 3).map((h) => (
                              <HypCard key={h.id} h={h} />
                            ))}
                            {unattached.length > 3 && (
                              <CrossLink
                                to="/app/strategy/hypotheses"
                                label={`+${unattached.length - 3} more in queue`}
                              />
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Next-actions panel ────────────────────────────── */}
                {selectedHyps.length > 0 && (
                  <NextActionsPanel
                    pillar={selected}
                    hypotheses={selectedHyps}
                    queued={queued}
                    onToggleQueue={toggleQueue}
                  />
                )}

                {/* ── Footer: variable combinations + scaling playbook (collapsible) ── */}
                {(combinations.length > 0 || playbookHasContent(playbook)) && (
                  <FooterPanel
                    combinations={combinations}
                    playbook={playbook}
                  />
                )}

                <div className="shrink-0 px-6 py-3 border-t border-border/20 flex items-center gap-4 flex-wrap">
                  <CrossLink to="/app/strategy/hypotheses" label="Open the hypothesis queue" />
                  <LoopAction
                    to={fp.fromCell
                      ? `/app/briefs/builder?from=strategy&fromCell=${fp.fromCell}`
                      : "/app/briefs/builder"}
                    label="Draft briefs from pillars"
                    icon="brief"
                    variant="secondary"
                  />
                </div>
              </div>

            {segmentPillar && analysis && (
              <SegmentGridModal
                open
                onClose={() => setSegmentPillar(null)}
                kicker={`Pillar ${String(pillars.findIndex((p) => p.id === segmentPillar.id) + 1).padStart(2, "0")}`}
                title={segmentPillar.label}
                analysis={analysis}
                cellIds={segmentPillar.source_cells}
              />
            )}
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
