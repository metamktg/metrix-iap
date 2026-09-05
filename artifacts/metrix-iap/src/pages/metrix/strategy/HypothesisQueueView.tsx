// ─── Strategy · Hypothesis Queue ──────────────────────────────────────
// Active hypotheses queued from analysis, plus the message pillars they
// build on. Every field the engine produced is surfaced: test variant,
// isolated variable, success criteria, expected impact, status, risk.

import { TYPE } from "../typography";
import { useState, useEffect } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getStrategyData, getBriefBuilder } from "@/lib/data/metrixSeedAdapter";
import {
  ModuleHeader, ModuleTabs, ModuleScopeGate, PendingState,
  MetricTile, CrossLink, useFocusParam, FlowCrumb, useFromParam, LoopAction,
  StaleFocusNotice, DetailReveal, deriveLabel,
  PILL_ACTIVE, PILL_INACTIVE, SectionCard, SectionInfoIcon,
  useShowMore, ShowMoreButton,
  DenseText,
} from "../shared";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@workspace/command-deck/components/ui/tooltip";
import {
  HypothesisStatusBadge, VariableStackChips, pillarHasDetails,
  HypothesisCodeChipsRow, HypothesisLabel, PillarDetailsFold,
} from "./strategyShared";
import { InfoDrawer, DrawerField } from "@/components/ui/InfoDrawer";
import { Layers, FlaskConical, AlertTriangle, ArrowRight, Beaker, Crosshair, Target, TrendingUp, ChevronDown } from "lucide-react";
import type { ActiveHypothesis } from "@/lib/data/seedTypes";
import { TokenizedConceptText } from "@/components/concept/ConceptChip";
import { AddToTrayButton } from "@/components/tray/AddToTrayButton";
import { cn } from "@workspace/command-deck/lib/utils";

const SECTION = "Strategy · 04";

type Tab = "queue" | "pillars";

/** Compact labeled fact inside a hypothesis card — one derived line only;
 *  the full prose lives in the detail drawer. */
function HypFact({
  label, value, Icon,
}: {
  label: string;
  value: string;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1 mb-0.5">
        <Icon className="w-3.5 h-3.5 text-muted-foreground/75" />
        <span className="text-label font-semibold uppercase tracking-widest text-muted-foreground/75">{label}</span>
      </div>
      <p className="text-caption text-foreground/80 leading-snug line-clamp-1">{deriveLabel(value, 56)}</p>
    </div>
  );
}

/** The filtered hypothesis card list, folded to the platform density cap.
 *  Extracted so the show-more hook runs unconditionally (the list lives
 *  inside a ModuleScopeGate render callback in the parent). */
function HypothesisCardList({
  hyps, onSelect,
}: {
  hyps: ActiveHypothesis[];
  onSelect: (h: ActiveHypothesis) => void;
}) {
  const fold = useShowMore(hyps, 8);
  return (
    <div className="space-y-2.5">
      {fold.visible.map((h) => {
        // Show at most 2 facts inline; prioritise isolated variable then test variant.
        const inlineFacts = [
          h.isolated_variable && { label: "Isolates",    value: h.isolated_variable, Icon: Crosshair },
          h.test_variant      && { label: "Test variant", value: h.test_variant,      Icon: Beaker },
        ].filter(Boolean) as { label: string; value: string; Icon: React.ComponentType<{ className?: string }> }[];
        return (
          <button
            key={h.id}
            onClick={() => onSelect(h)}
            className="pressable-lg w-full text-left rounded-xl border border-border/40 bg-foreground/[0.02] p-4 hover:border-border/60 hover:bg-foreground/[0.03] transition-colors"
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                {/* The same label the Strategy Map and Avatars render (chips,
                    then the sentence, clamped): the queue used to cut the
                    sentence to one line as its own title (audit round 7).
                    Isolates is one of the facts below, so it is not repeated. */}
                <HypothesisLabel label={h.label} inButton />
                {h.source && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-caption text-muted-foreground/75">
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/75" />
                    {h.source}
                  </div>
                )}
              </div>
              <span className="shrink-0">
                <HypothesisStatusBadge status={h.status} />
              </span>
            </div>

            {/* Inline fact strip — max 2 key facts, rest in drawer */}
            {inlineFacts.length > 0 && (
              <div className="flex items-center gap-4 mt-2.5 pt-2.5 border-t border-border/20 flex-wrap">
                {inlineFacts.map((f) => (
                  <div key={f.label} className="flex items-center gap-1.5 min-w-0">
                    <f.Icon className="w-3 h-3 text-muted-foreground/75 shrink-0" />
                    <span className="text-label uppercase tracking-widest text-muted-foreground/75 shrink-0">{f.label}</span>
                    <span className="text-caption text-foreground/70 truncate">{deriveLabel(f.value, 48)}</span>
                  </div>
                ))}
              </div>
            )}

            {h.risk && (
              <div className="flex items-start gap-1.5 mt-2.5 pt-2.5 border-t border-border/20">
                <AlertTriangle className="w-3.5 h-3.5 text-status-warning/70 shrink-0 mt-0.5" />
                {/* payload-ok: inside a <button> card. A stated risk was cut TWICE —
                      deriveLabel(90) inside line-clamp-1 — so it could not be
                      read at all. Two lines, cut once. */}
                  <p className="text-caption text-status-warning/80 leading-relaxed line-clamp-2">{h.risk}</p>
              </div>
            )}
          </button>
        );
      })}
      <ShowMoreButton
        total={hyps.length}
        hiddenCount={fold.hiddenCount}
        expanded={fold.expanded}
        onToggle={fold.toggle}
        noun="hypotheses"
      />
    </div>
  );
}

export function HypothesisQueueView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const [tab, setTab] = useState<Tab>("queue");
  const [statusFilter, setStatusFilter] = useState<"all" | "ready" | "validation">("all");
  const focus = useFocusParam();
  const [detail, setDetail] = useState<ActiveHypothesis | null>(null);

  const s = getStrategyData(seed, adAccountId);
  const fp = useFromParam();

  // Deep-link: ?focus=<hypothesis id> opens the drawer
  useEffect(() => {
    if (focus && s) {
      const match = s.active_hypotheses.find((h) => h.id === focus);
      if (match) setDetail(match);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, adAccountId]);

  return (
    <ModuleScopeGate section={SECTION} title="Hypothesis Queue" account={account}>
      {() => {
        const acct = account!;
        if (!s) {
          return (
            <div className="flex-1 flex flex-col">
              <ModuleHeader section={SECTION} title="Hypothesis Queue" accountName={acct.name} tabs="strategy" />
              <PendingState title="Strategy pending" message="No strategy has been derived for this account yet."
                action={<CrossLink to="/app/strategy/overview" label="Go to Strategy Overview" />}
              />
            </div>
          );
        }

        const hyps = s.active_hypotheses;
        const pillars = s.message_pillars;
        const ready = hyps.filter((h) => h.status === "ready_for_brief_builder");
        const validating = hyps.filter((h) => h.status === "validation_required");
        const briefs = getBriefBuilder(seed, adAccountId)?.draft_briefs ?? [];

        const TABS: { id: Tab; label: string; count: number }[] = [
          { id: "queue", label: "Hypothesis queue", count: hyps.length },
          { id: "pillars", label: "Message pillars", count: pillars.length },
        ];

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Hypothesis Queue"
              accountName={acct.name}
              subtitle="Queued for validation or briefing"
              tabs="strategy"
            />
            <FlowCrumb {...fp} />
            {focus && !s.active_hypotheses.some((h) => h.id === focus) && (
              <StaleFocusNotice label="hypothesis" />
            )}
            <div className="px-6 pt-5 grid grid-cols-dashboard-4 gap-3">
              <MetricTile label="In queue" value={String(hyps.length)} variant="primary" />
              <MetricTile label="Ready for briefs" value={String(ready.length)} />
              <MetricTile label="Validation required" value={String(validating.length)} />
              <MetricTile label="Message pillars" value={String(pillars.length)} />
            </div>

            <div className="mt-4">
              <ModuleTabs tabs={TABS} active={tab} onChange={(id) => setTab(id)} />
            </div>

            <div className="px-6 py-5 max-w-4xl">
              {tab === "queue" && (
                hyps.length === 0 ? (
                  <PendingState title="No hypotheses yet" message="Active hypotheses appear once strategy is derived." icon={FlaskConical}
                    action={<CrossLink to="/app/strategy/overview" label="Go to Strategy Overview" />}
                  />
                ) : (
                  <SectionCard
                    title="Hypothesis queue"
                    desc="Tap a card for full prose, criteria, and risk"
                    right={<SectionInfoIcon tip="Active hypotheses derived from analysis, ordered as queued. Chips show the variable codes each hypothesis mentions; the drawer holds the full test design." />}
                  >
                    {/* Status filter strip */}
                    <div className="flex items-center gap-1.5 mb-3 flex-wrap" role="group" aria-label="Filter hypotheses by status">
                      {([
                        { id: "all",        label: `All`,         count: hyps.length },
                        { id: "ready",      label: `Ready`,       count: ready.length },
                        { id: "validation", label: `Validation`,  count: validating.length },
                      ] as const).map(({ id, label, count }) => {
                        const active = statusFilter === id;
                        return (
                          <button
                            key={id}
                            onClick={() => setStatusFilter(id)}
                            aria-pressed={active}
                            className={cn(
                              "pressable inline-flex items-center gap-1 h-6 px-2 rounded-full border text-label font-medium transition-colors",
                              active ? PILL_ACTIVE : PILL_INACTIVE,
                            )}
                          >
                            {label}
                            <span className={cn(
                              "text-label rounded px-0.5",
                              active ? "text-interactive/70" : "text-muted-foreground/75",
                            )}>{count}</span>
                          </button>
                        );
                      })}
                    </div>

                    <HypothesisCardList
                      hyps={hyps.filter((h) =>
                        statusFilter === "all" ? true
                        : statusFilter === "ready" ? h.status === "ready_for_brief_builder"
                        : h.status === "validation_required"
                      )}
                      onSelect={setDetail}
                    />
                  </SectionCard>
                )
              )}

              {tab === "pillars" && (
                pillars.length === 0 ? (
                  <PendingState title="No pillars yet" message="Message pillars appear once analysis is ready." icon={Layers}
                    action={<CrossLink to="/app/analysis/overview" label="Review Analysis" />}
                  />
                ) : (
                  <SectionCard
                    title="Message pillars"
                    desc="The proven messages hypotheses build on"
                    right={<SectionInfoIcon tip="Message pillars are the validated themes from analysis. Each shows its source cells, variable stack, and (behind the details fold) funnel, execution, placement, and scaling guidance." />}
                  >
                  <div className="space-y-3">
                    {pillars.map((p) => {
                      const linkedBriefs = briefs.filter((b) => b.source_pillar === p.id);
                      return (
                        <div key={p.id} className="rounded-xl border border-border/40 bg-foreground/[0.02] p-4">
                          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                            {p.source_cells.map((c) => (
                              <TooltipProvider key={c} delayDuration={150}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex">
                                      <CrossLink to={`/app/analysis/library?focus=${c}`} label={c} srNote={`source matrix cell · opens it in the IAP Library`} />
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="max-w-[240px]">
                                    <p className="text-caption leading-relaxed">
                                      Source matrix cell <span className="">{c}</span>, opens it in the IAP Library.
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ))}
                          </div>
                          <p className={cn(TYPE.title, "leading-tight")}>{p.label}</p>
                          <div className="mt-1">
                            {/* Descriptor and "why it matters" are the two
                                sentences that explain the pillar. Both were
                                behind one click; both are on the page now. */}
                            <div className="space-y-1.5">
                              <DenseText
                                text={p.plain_descriptor}
                                className="text-body text-interactive/80 italic leading-relaxed"
                                clampClass="line-clamp-4"
                              />
                              {p.why_it_matters && (
                                <div>
                                  <div className="text-label font-semibold uppercase tracking-widest text-muted-foreground/75 mb-0.5">
                                    Why it matters
                                  </div>
                                  <DenseText
                                    text={p.why_it_matters}
                                    className="text-caption text-foreground/85 leading-relaxed"
                                    clampClass="line-clamp-4"
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="mt-3">
                            <VariableStackChips stack={p.variable_stack} />
                          </div>
                          {pillarHasDetails(p) && (
                            <div className="mt-3 pt-3 border-t border-border/20">
                              <PillarDetailsFold pillar={p} profiles={s.icp_profiles} />
                            </div>
                          )}
                          {linkedBriefs.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-border/20">
                              <CrossLink to={`/app/creative/builder?focus=${linkedBriefs[0].id}`} label={`${linkedBriefs.length} draft brief${linkedBriefs.length > 1 ? "s" : ""} from this pillar`} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  </SectionCard>
                )
              )}
            </div>

            {detail && (
              <InfoDrawer
                kicker={`Hypothesis · ${detail.id}`}
                title={<TokenizedConceptText text={detail.label} />}
                onClose={() => setDetail(null)}
                footer={
                  <div className="flex items-center gap-4 flex-wrap">
                    <AddToTrayButton
                      scopeId={adAccountId ?? ""}
                      item={{
                        id: detail.id,
                        kind: "hypothesis",
                        // payload-ok: tray item. A tray entry is a bookmark in a
                        // work queue — the title and sub are there to answer "which
                        // one was this", and the card links straight back to the full
                        // hypothesis. Chrome by function, and cut once, not twice.
                        title: deriveLabel(detail.label, 90),
                        sub: detail.test_variant ? deriveLabel(detail.test_variant, 90) : undefined,
                        href: `/app/strategy/hypotheses?focus=${detail.id}`,
                      }}
                    />
                    {detail.status === "ready_for_brief_builder" && (
                      <LoopAction
                        to={`/app/creative/builder?from=strategy&fromHyp=${detail.id}`}
                        label="Create Brief"
                        icon="brief"
                      />
                    )}
                    {fp.fromCell ? (
                      <CrossLink to={`/app/analysis/library?focus=${fp.fromCell}`} label={`Back to cell ${fp.fromCell}`} />
                    ) : (
                      <CrossLink to="/app/analysis/library" label="Open IAP Library" />
                    )}
                  </div>
                }
              >
                <div className="flex items-center gap-1.5 flex-wrap">
                  <HypothesisStatusBadge status={detail.status} />
                </div>
                {detail.source && <DrawerField label="Source / control"><TokenizedConceptText text={detail.source} /></DrawerField>}
                {detail.test_variant && <DrawerField label="Test variant"><TokenizedConceptText text={detail.test_variant} /></DrawerField>}
                {detail.isolated_variable && <DrawerField label="Isolated variable"><TokenizedConceptText text={detail.isolated_variable} /></DrawerField>}
                {detail.success_criteria && <DrawerField label="Success criteria">{detail.success_criteria}</DrawerField>}
                {detail.expected_impact && <DrawerField label="Expected impact">{detail.expected_impact}</DrawerField>}
                {detail.risk && <DrawerField label="Risk">{detail.risk}</DrawerField>}
              </InfoDrawer>
            )}
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
