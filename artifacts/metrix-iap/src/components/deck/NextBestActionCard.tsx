// ─── Next Best Action hero card ───────────────────────────────────────
// Nocturne "Metrix v1" hero treatment for the single top-priority pending
// recommendation: accent-washed card with the card title, rationale,
// impact / confidence / scope badges, Approve → Task Tray and Dismiss
// actions, and a "Why this action" reveal carrying the recommended action.
//
// Shares the deck's decision + tray stores, so a decision made here and a
// swipe in the RecommendationDeck below can never disagree: approving or
// dismissing promotes the next pending card, and once none remain the
// card renders nothing (the deck's own empty state covers that).
//
// Honesty: impact and confidence render the seed's real qualitative
// values ("high", "medium", "directional", …) — never a fabricated
// percentage or countdown.

import { useCallback } from "react";
import { Check, Zap } from "lucide-react";
import { cn } from "@workspace/command-deck/lib/utils";
import { TYPE } from "@/pages/metrix/typography";
import { DetailReveal } from "@/pages/metrix/shared";
import { useDecisions, getDecision, setDecision } from "@/lib/data/decisionStore";
import { addToTray } from "@/lib/data/trayStore";
import { impactRank, type DeckCard } from "./RecommendationDeck";

const IMPACT_BADGE: Record<string, string> = {
  high: "border-status-danger/25 bg-status-danger/10 text-status-danger",
  medium: "border-status-warning/25 bg-status-warning/10 text-status-warning",
  low: "border-border/40 bg-muted text-muted-foreground/75",
  setup: "border-primary/25 bg-primary/10 text-interactive",
};

function HeroBadge({ text, cls }: { text: string; cls: string }) {
  return (
    <span className={cn(TYPE.label, "border px-2 py-0.5 rounded-full font-semibold normal-case tracking-normal", cls)}>
      {text}
    </span>
  );
}

export interface NextBestActionCardProps {
  /** Ad-account (or manager) id the decisions are scoped under. */
  scopeId: string;
  cards: DeckCard[];
}

export function NextBestActionCard({ scopeId, cards }: NextBestActionCardProps) {
  // Subscribing re-renders on every decision, so the hero always shows the
  // top-ranked card that is still pending.
  useDecisions();

  const pending = cards
    .filter((c) => getDecision(scopeId, c.id) === "pending")
    .sort((a, b) => impactRank(b.impact) - impactRank(a.impact));
  const card = pending[0] ?? null;

  const approve = useCallback(() => {
    if (!card) return;
    setDecision(scopeId, card.id, "approved");
    addToTray(scopeId, {
      id: card.id,
      kind: "recommendation",
      title: card.title,
      sub: card.recommendedAction,
      href: "/app/listen/recommendations",
    });
  }, [scopeId, card]);

  const dismiss = useCallback(() => {
    if (!card) return;
    setDecision(scopeId, card.id, "rejected");
  }, [scopeId, card]);

  // Honest empty state — matches the canvas's dashed "no next action" card
  // rather than rendering nothing, and is explicit about *why* it's empty
  // (no recommendations yet vs. everything already reviewed).
  if (!card) {
    return (
      <div
        className="rounded-xl border border-dashed border-border/40 px-5 py-4"
        data-testid="next-best-action-empty"
      >
        <div className="flex items-center gap-1.5 mb-1.5">
          <Zap className="w-3.5 h-3.5 text-muted-foreground/75" />
          <span className={cn(TYPE.label, "font-mono uppercase tracking-widest text-muted-foreground/75")}>
            Next best action
          </span>
        </div>
        <p className={cn(TYPE.body, "text-muted-foreground/75 leading-relaxed")}>
          {cards.length === 0
            ? "No recommendations have been generated for this account yet."
            : "All recommendations have been reviewed — nothing pending right now."}
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-primary/25 bg-gradient-to-br from-primary/[0.09] via-primary/[0.03] to-transparent px-5 py-4"
      data-testid="next-best-action-card"
    >
      <div className="flex items-start justify-between gap-5 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Zap className="w-3.5 h-3.5 text-interactive/80" />
            <span className={cn(TYPE.label, "font-mono uppercase tracking-widest text-interactive/80")}>
              Next best action
            </span>
          </div>
          <p className={cn(TYPE.title, "text-foreground leading-snug mb-1")} data-testid="next-best-action-title">
            {card.title}
          </p>
          <p className={cn(TYPE.body, "text-foreground/75 leading-relaxed max-w-prose")}>
            {card.rationale}
          </p>
          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
            <HeroBadge
              text={`${card.impact} impact`}
              cls={IMPACT_BADGE[card.impact] ?? IMPACT_BADGE.low}
            />
            <HeroBadge
              text={`${card.confidence} confidence`}
              cls="border-border/40 bg-foreground/[0.03] text-muted-foreground/80"
            />
            <HeroBadge
              text={card.scope.replace(/_/g, " ")}
              cls="border-border/40 bg-foreground/[0.03] text-muted-foreground/75"
            />
          </div>
          <div className="mt-2.5">
            <DetailReveal
              label="Why this action"
              labelClassName={cn(TYPE.caption, "font-semibold text-interactive")}
              eyebrow="Next best action"
              sections={[
                { label: "Recommended action", text: card.recommendedAction },
                { label: "Rationale", text: card.rationale },
              ]}
            />
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0" role="group" aria-label="Decide on next best action">
          <button
            type="button"
            onClick={approve}
            data-testid="next-best-action-approve"
            className={cn(
              "pressable", TYPE.caption,
              "inline-flex items-center justify-center gap-1.5 font-semibold rounded-lg border border-primary/50 bg-primary text-primary-foreground px-3.5 py-1.5 hover:bg-primary/90 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            )}
          >
            <Check className="w-3.5 h-3.5" /> Approve
          </button>
          <button
            type="button"
            onClick={dismiss}
            data-testid="next-best-action-dismiss"
            className={cn("pressable", TYPE.caption, "font-medium text-muted-foreground/75 px-1 py-0.5 hover:text-foreground/80 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded")}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
