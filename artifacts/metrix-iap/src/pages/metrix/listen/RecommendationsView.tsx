// ─── Listen · Recommendations ─────────────────────────────────────────
// Optimization-loop recommendation deck for the active ad account.
// Approve → manual task tray; reject → dismissed log. Never auto-applies.

import { useState } from "react";
import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getOptimizationLoop, getAnalysisData } from "@/lib/data/metrixSeedAdapter";
import { RecommendationDeck, actionGroupForScope, type DeckCard } from "@/components/deck/RecommendationDeck";
import {
  ModuleHeader, ModuleScopeGate, StageNotRunState, MetricTile, CaveatNote,
  CrossLink, ConnectionNudgeBanner, useFocusParam,
} from "../shared";
import { Lightbulb } from "lucide-react";
import { useGetMetaConnection } from "@workspace/api-client-react";
import { SegmentGridModal } from "@/components/creative/SegmentGridModal";
import type { RecommendationCard } from "@/lib/data/seedTypes";
import { deriveRecommendations, toLoopCards } from "@/lib/data/recommendations";

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
  // A manager recommendation links here with `?focus=<id>`; the deck opens
  // that card rather than landing the reader on its first one (N-10).
  const focus = useFocusParam();
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);
  const metaConnection = useGetMetaConnection();
  const hasMetaConnection = metaConnection.data?.connected === true;
  const [segmentCardId, setSegmentCardId] = useState<string | null>(null);

  return (
    <ModuleScopeGate section={SECTION} title="Recommendations" account={account}>
      {() => {
        const acct = account!;
        const loop = getOptimizationLoop(seed, adAccountId);
        const analysis = getAnalysisData(seed, adAccountId);
        // Same derivation the overview and the queue read: the loop's cards
        // when it has run, the account's own rows when it has not. `loop` is
        // still read for its action policy, which is the stage's own words.
        const rawCards = toLoopCards(deriveRecommendations(acct), acct.id);
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
              accountName={acct.name}
              subtitle="Optimization loop · approval adds a manual task"
            />
            <ConnectionNudgeBanner hasMetaConnection={hasMetaConnection} />
            <>
            {/* Tiles only when there is something to count. A row reading
                0 / 0 / — / 0 states that this account was measured and has
                no recommendations; the truth is that the optimization loop
                has never run for any account, so there was nothing to
                measure. A measured zero and an absent stage are different
                claims and the reader cannot tell them apart from a tile. */}
            {cards.length > 0 && (
              <div className="px-6 pt-5 grid grid-cols-dashboard-4 gap-3">
                <MetricTile label="Recommendations" value={String(cards.length)} />
                <MetricTile label="High impact" value={String(highCount)} />
                <MetricTile label="Scopes" value={String(scopes.length)} sub={scopes.join(" · ") || "—"} />
                <MetricTile label="Auto-applied" value="0" sub="manual implementation only" />
              </div>
            )}

            <div className="px-6 py-5 max-w-3xl space-y-4">
              {loop?.action_policy && <CaveatNote text={loop.action_policy} />}
              {cards.length ? (
                <RecommendationDeck
                  scopeId={acct.id}
                  focusId={focus}
                  cards={cards}
                  emptyLabel="All recommendations reviewed"
                  onSegments={analysis ? (card) => setSegmentCardId(card.id) : undefined}
                />
              ) : (
                /* Was a PendingState with a generic "once generated" line and
                   a Review Analysis button. The button pointed at the wrong
                   stage — analysis does not produce these cards — and the
                   sentence was a guess standing in front of the account's own
                   loop_status note, which names the real blocker. */
                <StageNotRunState
                  title="No recommendations"
                  stageLabel="Optimization Loop"
                  stage="optimization_loop"
                  account={acct}
                  icon={Lightbulb}
                  action={
                    <div className="flex items-center gap-4 flex-wrap justify-center">
                      <CrossLink to="/app/strategy/hypotheses" label="Queue a test" />
                      <CrossLink to="/app/creative" label="Draft a brief" />
                    </div>
                  }
                />
              )}
            </div>
            </>

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
