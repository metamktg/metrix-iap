// ─── Listen · Recommendations ─────────────────────────────────────────
// Optimization-loop recommendation deck for the active ad account.
// Approve → manual task tray; reject → dismissed log. Never auto-applies.

import { useState } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getOptimizationLoop, getAnalysisData } from "@/lib/data/metrixSeedAdapter";
import { RecommendationDeck, actionGroupForScope, type DeckCard } from "@/components/deck/RecommendationDeck";
import {
  ModuleHeader, ScopeBanner, ModuleScopeGate, PendingState, MetricTile, CaveatNote,
  RangeScopeBar, NoDataInRangeState,
} from "../shared";
import { useDateRange } from "@/contexts/DateRangeContext";
import { SegmentGridModal } from "@/components/creative/SegmentGridModal";
import type { RecommendationCard } from "@/lib/data/seedTypes";

const SECTION = "Listen · 02";

/** Cell ids (e.g. "C2B") a recommendation references in its evidence text. */
function cellIdsForCard(card: RecommendationCard, knownCells: Set<string>): string[] {
  const text = [card.source_path, card.rationale, card.title, card.recommended_action]
    .filter(Boolean)
    .join(" ");
  const found = new Set<string>();
  for (const m of text.matchAll(/\bC\d+[A-Z]\b/g)) {
    if (knownCells.has(m[0])) found.add(m[0]);
  }
  return Array.from(found);
}

export function RecommendationsView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const { rangeHasData } = useDateRange();
  const [segmentCardId, setSegmentCardId] = useState<string | null>(null);

  return (
    <ModuleScopeGate section={SECTION} title="Recommendations" account={account}>
      {() => {
        const acct = account!;
        const loop = getOptimizationLoop(seed, adAccountId);
        const analysis = getAnalysisData(seed, adAccountId);
        const rawCards = loop?.recommendation_cards ?? [];
        const knownCells = new Set((analysis?.performance_by_cell ?? []).map((r) => r.cell_id));
        const cards: DeckCard[] = rawCards.map((c) => ({
          id: c.id,
          title: c.title,
          rationale: c.rationale,
          recommendedAction: c.recommended_action,
          impact: c.impact,
          confidence: c.confidence,
          scope: c.scope,
          descriptor: c.manager_card_descriptor,
          actionGroup: actionGroupForScope(c.scope),
        }));

        const segmentCard = segmentCardId ? rawCards.find((c) => c.id === segmentCardId) ?? null : null;
        const segmentCells = segmentCard ? cellIdsForCard(segmentCard, knownCells) : [];
        const highCount = cards.filter((c) => c.impact === "high").length;
        const scopes = Array.from(new Set(cards.map((c) => c.scope)));

        return (
          <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
            <ModuleHeader
              section={SECTION}
              title="Recommendations"
              subtitle="Optimization-loop recommendations. Approving adds a manual task — nothing is auto-applied."
              table="recommendation_cards"
            />
            <ScopeBanner account={acct} />
            <RangeScopeBar grainNote="Recommendations derive from the account's full flight window — this import has no daily grain." />

            {!rangeHasData ? (
              <NoDataInRangeState what="recommendations" />
            ) : (
            <>
            <div className="px-6 pt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricTile label="Recommendations" value={String(cards.length)} />
              <MetricTile label="High impact" value={String(highCount)} />
              <MetricTile label="Scopes" value={String(scopes.length)} sub={scopes.join(" · ") || "—"} />
              <MetricTile label="Auto-applied" value="0" sub="manual implementation only" />
            </div>

            <div className="px-6 py-5 max-w-3xl space-y-4">
              {loop?.action_policy && <CaveatNote text={loop.action_policy} />}
              {cards.length ? (
                <RecommendationDeck
                  scopeId={acct.id}
                  cards={cards}
                  emptyLabel="All recommendations reviewed"
                  onSegments={analysis ? (card) => setSegmentCardId(card.id) : undefined}
                />
              ) : (
                <PendingState title="No recommendations" message="Optimization-loop recommendations will appear here once generated." />
              )}
            </div>
            </>
            )}

            {segmentCard && analysis && (
              <SegmentGridModal
                open
                onClose={() => setSegmentCardId(null)}
                kicker={
                  segmentCells.length
                    ? `Recommendation evidence · ${segmentCells.join(", ")}`
                    : "Recommendation evidence · account-level"
                }
                title={segmentCard.title}
                analysis={analysis}
                cellIds={segmentCells.length ? segmentCells : null}
              />
            )}
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
