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
  DenseText, InfoTooltip, useShowMore, ShowMoreButton,
  SectionInfoIcon,
} from "../shared";
import {
  VariableStackChips, IcpChips, PillarDetailSections, pillarHasDetails,
  HypothesisLabel, HypothesisStatusBadge, HypothesisCodeChipsRow,
  VariableCombinationsGrid, playbookHasContent, ScalingPlaybookLanes,
} from "./strategyShared";
import { splitTitle, usableName } from "@/lib/normalize";
import { SegmentGridModal, SegmentDrilldownButton } from "@/components/creative/SegmentGridModal";
import { cn } from "@workspace/command-deck/lib/utils";
import { useResizableColumn, type ResizableColumn } from "@/hooks/useResizableColumn";
import {
  Map, ChevronDown, FlaskConical, CheckSquare,
  Square, Lightbulb, ChevronLeft } from "lucide-react";
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
  "bg-status-success/70",
  "bg-chart-1/70",
  "bg-primary/70",
  "bg-status-warning/70",
  "bg-metrix-cyan/70",
  "bg-status-danger/70",
  "bg-primary/70",
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

/**
 * Column splitter.
 *
 * All behaviour — pointer (not mouse) events, cursor lock, text-selection
 * guard, persistence, snap-to-collapse, arrow-key operation — lives in
 * useResizableColumn, which is the same primitive Sidebar and TaskTray
 * already use. This is only its visual shell.
 */
function ResizeHandle({ handleProps, collapsed }: { handleProps: ResizableColumn["handleProps"]; collapsed?: boolean }) {
  return (
    <div
      {...handleProps}
      className={cn(
        "w-1.5 shrink-0 cursor-col-resize border-x border-border/20 transition-colors",
        "hover:bg-primary/30 active:bg-primary/60",
        // A keyboard user needs to see where focus landed; the strip is
        // 1.5px wide, so the ring is the only visible affordance.
        "focus-visible:outline-none focus-visible:bg-primary/50",
        collapsed && "bg-primary/15",
      )}
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
        "pressable-lg w-full text-left px-3 py-2.5 border-l-2 transition-[color,background-color,border-color,box-shadow,opacity,transform] flex flex-col gap-1",
        accentBorder,
        selected
          ? "bg-primary/[0.09] border-r border-r-transparent shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.08)]"
          : "bg-transparent hover:bg-foreground/[0.04]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      )}
    >
      {/* Number + dot + name */}
      <div className="flex items-start gap-1.5">
        <div className="flex items-center gap-1 mt-0.5 shrink-0">
          <span className={cn("w-1.5 h-1.5 rounded-full shrink-0 transition-opacity", dot, selected ? "opacity-100" : "opacity-50")} />
          <span className={cn(TYPE.label, "tabular-nums text-muted-foreground/75 w-3.5 text-right")}>
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
          {/* No descriptor snippet here. It used to render for the SELECTED
              pillar only — as TYPE.label, which is 12px UPPERCASE, hand-cut
              at 80 characters, inside a line-clamp-2. Three problems in one
              line: uppercase destroys the word shapes that long-form reading
              depends on, the character slice cuts mid-word on top of a clamp
              that already handles overflow, and the whole thing duplicated
              the descriptor the centre column now renders in full at body
              size, four inches to the right. A worse copy of what is already
              on screen is not disclosure. The sidebar's job is navigation:
              index, name, cell count. */}
        </div>
      </div>

      {/* Cell count + hyp count */}
      <div className="pl-4 flex items-center gap-2">
        <span className={cn(TYPE.label, selected ? "text-muted-foreground/75" : "text-muted-foreground/75", "tabular-nums")}>
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
    <div className="rounded-lg border border-border/40 bg-foreground/[0.025] p-3 flex flex-col gap-2">
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
          <span className="text-label font-semibold text-interactive/80 border border-primary/20 bg-primary/[0.04] px-1.5 py-0.5 rounded leading-none">
            {cellId}
          </span>
        )}
      </div>

      {/* Evidence strip — spend + results as secondary KPIs */}
      {hasEvidence && (
        <div className="flex items-center gap-3 pt-1 border-t border-border/15">
          {(spend ?? 0) > 0 && (
            <div className="flex flex-col gap-0.5">
              <span className={cn(TYPE.microLabel, "text-muted-foreground/75")}>Spend</span>
              <span className={cn(TYPE.label, "text-foreground/65 tabular-nums font-semibold")}>{fmtUSD(spend, 0)}</span>
            </div>
          )}
          {(results ?? 0) > 0 && (
            <div className="flex flex-col gap-0.5">
              <span className={cn(TYPE.microLabel, "text-muted-foreground/75")}>Results</span>
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
        "rounded-lg border border-border/30 bg-foreground/[0.015] px-3 py-2 flex flex-col gap-1.5 overflow-hidden",
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
    <div className="shrink-0 border-t border-border/30 bg-foreground/[0.01]">
      {/* Panel header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="pressable-lg w-full flex items-center gap-2 px-4 py-2 hover:bg-foreground/[0.03] transition-colors text-left"
      >
        <Lightbulb className="w-3.5 h-3.5 text-status-warning/70 shrink-0" />
        <span className={cn(TYPE.caption, "font-semibold text-foreground/80 flex-1 truncate")}>
          Next actions · {t.main}
        </span>
        <span className={cn(TYPE.label, "text-muted-foreground/75 shrink-0")}>
          {pending.length} pending
        </span>
        <ChevronDown className={cn("w-3.5 h-3.5 text-muted-foreground/75 shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="px-4 pb-3 grid grid-cols-2 gap-2">
          {pending.map((h) => {
            const isQueued = queued.has(h.id);
            return (
              <div
                key={h.id}
                className="rounded-lg border border-border/30 bg-foreground/[0.015] px-3 py-2 flex flex-col gap-1.5"
              >
                <div className="flex items-center gap-1.5">
                  <HypothesisStatusBadge status={h.status} />
                </div>
                {/* Chips-only row inside button context, no nested reveal */}
                <div>
                  <HypothesisCodeChipsRow label={h.label} />
                  {/* Card face inside a <button>, so no DenseText control
                      here — the full hypothesis lives one click away. It was
                      cut TWICE though (deriveLabel to 55 chars inside a
                      one-line clamp), so the clamp alone now does the work
                      and roughly twice as much of the sentence survives. */}
                  <p className={cn(TYPE.caption, "text-muted-foreground/85 mt-1 line-clamp-2")} title={h.label}>
                    {h.label}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-2 mt-auto pt-1">
                  <button
                    type="button"
                    onClick={() => onToggleQueue(h.id)}
                    aria-pressed={isQueued}
                    className={cn(
                      "pressable inline-flex items-center gap-1.5 text-label font-medium border rounded px-1.5 py-1 transition-colors leading-none",
                      isQueued
                        ? "bg-status-success/10 text-status-success border-status-success/30"
                        : "bg-foreground/[0.03] text-muted-foreground/75 border-border/40 hover:text-foreground hover:border-border/70"
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
              <CrossLink to="/app/strategy/hypotheses" label="Manage queue" />
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
        className="pressable-lg w-full flex items-center gap-2 px-6 py-2.5 hover:bg-foreground/[0.02] transition-colors text-left"
      >
        <span className={cn(TYPE.caption, "font-semibold text-foreground/70 flex-1")}>
          Variable combinations · Scaling playbook
        </span>
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 text-muted-foreground/75 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <div className="px-6 pb-4 space-y-4 max-h-[45vh] overflow-y-auto">
          {combinations.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <h3 className={TYPE.title}>Variable combinations</h3>
                <InfoTooltip content="Validated variable stacks with their real CPA / CVR reads and the engine's recommendation." />
              </div>
              <VariableCombinationsGrid combinations={combinations} />
            </div>
          )}
          {playbookHasContent(playbook) && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <h3 className={TYPE.title}>Scaling playbook</h3>
                <InfoTooltip content="Where the analysis says to push, tune, prove, look next. And what to stay away from." />
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
  // The pillar list is this page's primary navigation, so it resizes but
  // never collapses. The hypothesis rail is supporting context — it snaps
  // shut when dragged narrow, and both widths survive navigation.
  const leftCol = useResizableColumn("Resize pillar list", {
    storageKey: "metrix.strategyMap.leftWidth",
    defaultWidth: 210, minWidth: 140, maxWidth: 320, edge: "right",
  });
  const rightCol = useResizableColumn("Resize hypotheses panel", {
    storageKey: "metrix.strategyMap.rightWidth",
    defaultWidth: 260, minWidth: 180, maxWidth: 380, edge: "left",
    collapseBelow: 150,
  });
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
              <ModuleHeader section={SECTION} title="Strategy Map" accountName={acct.name} tabs="strategy" />
              <PendingState
                title="No strategy map"
                message="The map draws from message pillars. None exist for this account yet."
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
        const selectedTitle = splitTitle(selected.label);

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
            // `book2_concept_name` carries the same generated sentence as the
            // concept descriptor. Rendered as this card's primary line it put
            // "C2 produced $7.0885 CPA on $2332.11 spend (329 results)." above
            // the cell code — a sentence whose entire content is the spend and
            // results the card already shows in its own evidence strip, with
            // worse number formatting. When it is not a name, the cell code
            // leads and nothing is lost.
            conceptName: usableName(rows[0]?.book2_concept_name) ?? undefined,
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
              accountName={acct.name}
              subtitle="Select a pillar to explore its source cells and hypotheses"
              tabs="strategy"
            />
            <FlowCrumb {...fp} />
              <div className="flex-1 flex flex-col min-h-0">
                {/* ── Three-column map ──────────────────────────────────── */}
                {/* Below lg the three panes stack (rail, canvas, hypotheses):
                    482 px of fixed pane width in a 390 px row clipped the rail and
                    pushed the detail pane out of the clip entirely (audit round 6).
                    The inline widths the splitters own apply from lg up. */}
                <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-y-auto lg:overflow-hidden border-t border-border/30">

                  {/* Left column — Pillars list (resizable) */}
                  <div style={{ width: leftCol.width }} className="max-lg:w-full! max-lg:max-h-[38vh] shrink-0 overflow-y-auto bg-foreground/[0.005]">
                    <div className="px-3 py-2 border-b border-border/20 sticky top-0 bg-background/90 backdrop-blur-sm z-10">
                      <div className="flex items-center gap-1 mb-0.5">
                        <p className={cn(TYPE.microLabel, "text-muted-foreground/75")}>Pillars</p>
                        <SectionInfoIcon tip="Validated message pillars from analysis. Select one to trace its source cells and the hypotheses it feeds." />
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

                  <div className="hidden lg:contents"><ResizeHandle handleProps={leftCol.handleProps} /></div>

                  {/* Centre column: source cells + variable legend. Below lg it
                      sizes to its content and the stacked row scrolls: flex-1
                      is a zero flex basis, and overflow-y-auto makes a flex
                      item's automatic minimum size zero, so in the column the
                      pane rendered at 0 px tall on every account (the 390 px
                      probe of audit round 6) while the rail and the hypotheses
                      pane kept their heights. */}
                  <div className="max-lg:flex-none lg:flex-1 min-w-0 max-lg:overflow-visible lg:overflow-y-auto">
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
                            <p className={cn(TYPE.microLabel, "text-muted-foreground/75 mb-0.5")}>
                              Message pillar
                            </p>
                            {/* This is the subject of the whole column, so it
                                carries title rank. It used to be a 13px caption
                                clamped to ONE line under a "Source cells"
                                eyebrow — the header named the evidence rather
                                than the thing, and a compound pillar name was
                                cut before its qualifier ever appeared. */}
                            <h2 className={cn(TYPE.title, "line-clamp-2")} title={selected.label}>
                              {selectedTitle.main}
                            </h2>
                            {selectedTitle.qualifier && (
                              <p className={cn(TYPE.caption, "text-muted-foreground/85 leading-snug mt-0.5")}>
                                {selectedTitle.qualifier}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {evidenceTotals.spend > 0 && (
                            <span className={cn(TYPE.label, "text-muted-foreground/75 tabular-nums")} title="Total spend across source cells">
                              {fmtUSD(evidenceTotals.spend, 0)}
                            </span>
                          )}
                          <span className={cn(TYPE.label, "text-muted-foreground/75 tabular-nums")}>
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

                    {/* ── The pillar's statement ──────────────────────
                        Reading order is what this column is for: WHAT the
                        pillar says, then the evidence it rests on, then how
                        to execute it. This block used to sit at the BOTTOM,
                        under every source cell card and a collapsed
                        execution panel — so the sentence explaining what you
                        were looking at was reached by scrolling past all of
                        it. Disclosure was only half the problem; position
                        was the other half. */}
                    {(selected.plain_descriptor || selected.why_it_matters) && (
                      <div className="px-4 pt-3 pb-1 space-y-2">
                        {selected.plain_descriptor && (
                          <DenseText
                            text={selected.plain_descriptor}
                            className={cn(TYPE.body, "text-foreground/90 leading-relaxed")}
                            clampClass="line-clamp-5"
                          />
                        )}
                        {selected.why_it_matters && (
                          <div className="rounded-lg border border-border/25 bg-foreground/[0.02] p-2.5">
                            <div className="text-label font-semibold uppercase tracking-widest text-muted-foreground/75 mb-1">
                              Why it matters
                            </div>
                            <DenseText
                              text={resolveInlineVariableCodes(selected.why_it_matters)}
                              className={cn(TYPE.caption, "text-foreground/85 leading-relaxed")}
                              clampClass="line-clamp-5"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Source cell cards — the evidence under the statement */}
                    <div className="p-3 space-y-2">
                      <div className="flex items-center gap-1.5">
                        <p className={cn(TYPE.microLabel, "text-muted-foreground/75")}>Source cells</p>
                        <SectionInfoIcon tip="The creative cells this pillar was derived from. Spend and results are the measured evidence behind it." />
                      </div>
                      {selected.source_cells.length === 0 ? (
                        <div className="py-8 text-center">
                          <p className={cn(TYPE.caption, "text-muted-foreground/75")}>
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
                            className="pressable inline-flex items-center gap-1 text-caption font-semibold text-interactive hover:text-interactive/80 transition-colors"
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

                    </div>
                  </div>

                  <div className="hidden lg:contents"><ResizeHandle handleProps={rightCol.handleProps} collapsed={rightCol.collapsed} /></div>

                  {/* Reopen tab. A collapsed panel whose only affordance is a
                      1.5px splitter is a panel the user has lost — the rail
                      needs to advertise itself, and say what is inside it. */}
                  {rightCol.collapsed && (
                    <button
                      type="button"
                      onClick={() => rightCol.setCollapsed(false)}
                      title={`Show hypotheses (${selectedHyps.length} active)`}
                      className="pressable shrink-0 w-7 max-lg:hidden flex flex-col items-center justify-center gap-2 border-l border-border/20 bg-foreground/[0.01] hover:bg-primary/[0.06] transition-colors group/reopen"
                    >
                      <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground/75 group-hover/reopen:text-interactive" />
                      <span
                        className={cn(TYPE.microLabel, "text-muted-foreground/75 group-hover/reopen:text-interactive")}
                        style={{ writingMode: "vertical-rl" }}
                      >
                        Hypotheses
                      </span>
                      {selectedHyps.length > 0 && (
                        <span className={cn(TYPE.microLabel, "text-interactive/70 tabular-nums")}>
                          {selectedHyps.length}
                        </span>
                      )}
                    </button>
                  )}

                  {/* Right column — Hypotheses (resizable) */}
                  <div style={{ width: rightCol.collapsed ? 0 : rightCol.width }} className={cn("max-lg:w-full! shrink-0 overflow-y-auto", rightCol.collapsed && "max-lg:hidden lg:invisible")} aria-hidden={rightCol.collapsed}>
                    <div className="px-3 py-2 border-b border-border/20 sticky top-0 bg-background/90 backdrop-blur-sm z-10">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <FlaskConical className="w-3 h-3 text-muted-foreground/75 shrink-0" />
                          <div>
                            <p className={cn(TYPE.microLabel, "text-muted-foreground/75 mb-0.5")}>Hypotheses</p>
                            <span className={cn(TYPE.caption, "font-semibold text-foreground/65")}>
                              {selectedHyps.length} active
                            </span>
                          </div>
                        </div>
                        {selectedHyps.length > 0 && (
                          <CrossLink to="/app/strategy/hypotheses" label="Queue" />
                        )}
                      </div>
                    </div>

                    <div className="p-3 space-y-2">
                      {selectedHyps.length === 0 ? (
                        <div className="py-8 text-center">
                          <p className={cn(TYPE.caption, "text-muted-foreground/75")}>
                            No hypotheses linked to this pillar.
                          </p>
                        </div>
                      ) : (
                        <SelectedHypsList hyps={selectedHyps} />
                      )}

                      {/* Unattached hypotheses in right column when applicable */}
                      {unattached.length > 0 && selected.id === pillars[0].id && (
                        <div className="mt-3 border-t border-border/20 pt-3">
                          <p className={cn(TYPE.label, "text-muted-foreground/75 mb-2")}>
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
                      ? `/app/creative/builder?from=strategy&fromCell=${fp.fromCell}`
                      : "/app/creative/builder"}
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
