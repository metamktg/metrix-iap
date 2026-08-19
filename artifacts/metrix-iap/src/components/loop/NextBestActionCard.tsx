// ─── Next best action — hero card ──────────────────────────────────────
// Canvas's single-recommendation spotlight: the top-ranked optimization-loop
// recommendation (real data — `optimization_loop.recommendation_cards`,
// impact-ranked) surfaced as a gradient-bordered hero card with an
// Approve/Dismiss pair, backed by the same decision store the Optimization
// loop deck below reads from — approving/dismissing here and there stay
// in sync. Renders the honest dashed-border empty state (matching the
// platform's empty-state convention) when no recommendation is queued.
//
// This app has no agency/client viewer-role split (unlike the canvas mock,
// which branches Approve/Dismiss vs. "Awaiting agency approval" on that),
// so only the acting (agency) variant is rendered — see PR notes.

import { ArrowRight, Check, X } from "lucide-react";
import { cn } from "@workspace/command-deck/lib/utils";
import { TYPE } from "@/pages/metrix/typography";
import { ImpactBadge, ConfidenceBadge, DetailReveal } from "@/pages/metrix/shared";
import { TokenizedConceptText } from "@/components/concept/ConceptChip";
import { setDecision } from "@/lib/data/decisionStore";
import { addToTray } from "@/lib/data/trayStore";

export interface NextBestActionVM {
  id: string;
  title: string;
  rationale: string;
  recommended_action: string;
  impact: string;
  confidence: string;
  source_path?: string;
}

export function NextBestActionCard({
  scopeId,
  card,
  windowLabel,
  readOnly = false,
  onOpen,
  openLabel,
  emptyMessage,
}: {
  /** Ad account id — decision-store scope, matches RecommendationDeck's scopeId. */
  scopeId: string;
  card: NextBestActionVM | null;
  windowLabel?: string | null;
  /** Manager Overview scope: recommendations are read-only there — action
   *  always lives inside the source account (matches the existing
   *  "Account recommendations" section below it). Renders "Open {openLabel}"
   *  instead of Approve/Dismiss. */
  readOnly?: boolean;
  onOpen?: () => void;
  openLabel?: string;
  emptyMessage?: string;
}) {
  if (!card) {
    return (
      <div className="rounded-2xl border border-dashed border-border/40 px-5 py-4">
        <p className={cn(TYPE.label, "text-muted-foreground/45 mb-1.5")}>Next best action</p>
        <p className={cn(TYPE.body, "text-muted-foreground/60 max-w-xl")}>
          {emptyMessage ?? "No recommendation is queued right now — run an analysis, or check back once the optimization loop has fresh signal to act on."}
        </p>
      </div>
    );
  }

  const approve = () => {
    setDecision(scopeId, card.id, "approved");
    addToTray(scopeId, {
      id: card.id,
      kind: "recommendation",
      title: card.title,
      sub: card.recommended_action,
      href: "/app/listen/recommendations",
    });
  };
  const dismiss = () => setDecision(scopeId, card.id, "rejected");

  return (
    <div
      className="relative overflow-hidden rounded-2xl px-5 py-4"
      style={{
        border: "1px solid hsl(var(--primary) / 0.4)",
        background: "linear-gradient(160deg, hsl(var(--primary) / 0.11), transparent 62%)",
      }}
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className={cn(TYPE.label, "text-interactive/80")}>Next best action</p>
        {windowLabel && (
          <span className={cn(TYPE.caption, "text-muted-foreground/45 shrink-0 tabular-nums")}>{windowLabel}</span>
        )}
      </div>

      <TokenizedConceptText
        text={card.title}
        className="text-title font-bold text-foreground leading-snug block mb-1.5"
      />

      <p className={cn(TYPE.body, "text-foreground/75 mb-3 max-w-2xl")}>
        <TokenizedConceptText text={card.rationale} />
      </p>

      <div className="flex items-center gap-1.5 flex-wrap mb-3.5">
        <ImpactBadge impact={card.impact} />
        <ConfidenceBadge value={card.confidence} />
      </div>

      <DetailReveal
        label="Why this action"
        eyebrow="Evidence"
        labelClassName={cn(TYPE.caption, "font-semibold text-interactive/85")}
        className="mb-4"
        sections={[
          { label: "Recommended action", text: card.recommended_action },
          { label: "Rationale", text: card.rationale },
          ...(card.source_path ? [{ label: "Source", text: card.source_path }] : []),
        ]}
      />

      {readOnly ? (
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex items-center gap-1.5 text-body font-semibold text-interactive hover:text-primary transition-colors"
        >
          Open {openLabel ?? "account"} <ArrowRight className="w-3.5 h-3.5" />
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={approve}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md mx-primary-btn text-caption font-semibold"
          >
            <Check className="w-3.5 h-3.5" /> Approve
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md mx-secondary-btn text-caption font-semibold"
          >
            <X className="w-3.5 h-3.5" /> Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
