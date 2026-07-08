// ─── Listen · Recommendations ─────────────────────────────────────────
// Optimization-loop recommendation deck for the active ad account.
// Approve → manual task tray; reject → dismissed log. Never auto-applies.

import { useScopedAdAccountId } from "@/contexts/AccountContext";
import { useMetrixSeed } from "@/contexts/MetrixDataContext";
import { getAdAccount, getOptimizationLoop } from "@/lib/data/metrixSeedAdapter";
import { RecommendationDeck, actionGroupForScope, type DeckCard } from "@/components/deck/RecommendationDeck";
import {
  ModuleHeader, ScopeBanner, ModuleScopeGate, PendingState, MetricTile, CaveatNote,
} from "../shared";

const SECTION = "Listen · 02";

export function RecommendationsView() {
  const seed = useMetrixSeed();
  const adAccountId = useScopedAdAccountId();
  const account = getAdAccount(seed, adAccountId);

  return (
    <ModuleScopeGate section={SECTION} title="Recommendations" account={account}>
      {() => {
        const acct = account!;
        const loop = getOptimizationLoop(seed, adAccountId);
        const cards: DeckCard[] = (loop?.recommendation_cards ?? []).map((c) => ({
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

            <div className="px-6 pt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
              <MetricTile label="Recommendations" value={String(cards.length)} />
              <MetricTile label="High impact" value={String(highCount)} />
              <MetricTile label="Scopes" value={String(scopes.length)} sub={scopes.join(" · ") || "—"} />
              <MetricTile label="Auto-applied" value="0" sub="manual implementation only" />
            </div>

            <div className="px-6 py-5 max-w-3xl space-y-4">
              {loop?.action_policy && <CaveatNote text={loop.action_policy} />}
              {cards.length ? (
                <RecommendationDeck scopeId={acct.id} cards={cards} emptyLabel="All recommendations reviewed" />
              ) : (
                <PendingState title="No recommendations" message="Optimization-loop recommendations will appear here once generated." />
              )}
            </div>
          </div>
        );
      }}
    </ModuleScopeGate>
  );
}
