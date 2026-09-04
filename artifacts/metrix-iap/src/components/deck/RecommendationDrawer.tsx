// ─── Recommendation drawer ────────────────────────────────────────────
//
// The disclosure behind a recommendation, on every surface that carries
// one: the rail on the overview and the command centres, and the swipe
// deck. One drawer, so a reader who opens a tile in the rail and a card in
// the deck meets the same anatomy in the same place.
//
// WHAT IT CARRIES
// The whole reason (the tile shows one clause), the recommended action,
// the engine's confidence in its own words, the provenance, the number
// when the rows have one, the link to the surface that proves it, and the
// decision. Approving files a manual task in the tray. Nothing here
// touches a live campaign, and the note above the footer says so, because
// that is the product's standing promise (blueprint §1: suggestion-only).
//
// MECHANICS
// A right-hand sheet on Radix Dialog: focus moves in, Escape and the scrim
// close it, focus returns to the control that opened it. It arrives with a
// 16 px slide and a fade in 200 ms on --mx-ease and leaves in 150 ms
// (.mx-drawer in index.css); reduced motion drops the animation.

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, LayoutGrid, X } from "lucide-react";
import { cn } from "@workspace/command-deck/lib/utils";
import { TYPE, HEADING } from "@/pages/metrix/typography";
import { CrossLink } from "@/pages/metrix/shared";
import { TokenizedConceptText } from "@/components/concept/ConceptChip";
import type { DeckCard } from "./RecommendationDeck";
import { IMPACT_STYLE, KIND_LABEL, KIND_STYLE, KIND_STYLE_FALLBACK, recommendationKind } from "./recommendationKind";

/** A deck card, plus whatever the derivation knows about it. */
export type DrawerCard = DeckCard & {
  href?: string | null;
  hrefLabel?: string | null;
  metric?: { label: string; value: string } | null;
  source?: string;
  stage?: number | null;
  derived?: boolean;
};

function Chip({ text, cls, title }: { text: string; cls: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn(TYPE.microLabel, "border px-1.5 py-0.5 rounded-full font-semibold normal-case tracking-normal leading-none", cls)}
    >
      {text}
    </span>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className={HEADING.h6}>{label}</div>
      <div className={cn(TYPE.body, "text-foreground/85 leading-relaxed")}>{children}</div>
    </div>
  );
}

export interface RecommendationDrawerProps {
  rec: DrawerCard;
  open: boolean;
  onClose: () => void;
  /** Both or neither: a drawer that can approve can also dismiss. */
  onApprove?: () => void;
  onDismiss?: () => void;
  /** The deck's avatar × placement drill-down, when the surface offers one. */
  onSegments?: () => void;
  approveLabel?: string;
}

export function RecommendationDrawer({
  rec,
  open,
  onClose,
  onApprove,
  onDismiss,
  onSegments,
  approveLabel = "Add to Tray",
}: RecommendationDrawerProps) {
  const kind = recommendationKind(rec);
  const kindLabel = KIND_LABEL[kind] ?? "From the loop";
  const decidable = Boolean(onApprove && onDismiss);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="mx-scrim fixed inset-0 z-40 bg-background/55 backdrop-blur-sm" />
        <DialogPrimitive.Content
          data-testid="recommendation-drawer"
          className="mx-drawer fixed inset-y-0 right-0 z-50 flex w-full max-w-[440px] flex-col bg-surface-deep border-l border-border/50 elevation-floating outline-none"
        >
          <div className="flex items-start gap-3 px-5 py-4 border-b border-border/40">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Chip text={kindLabel} cls={KIND_STYLE[kind] ?? KIND_STYLE_FALLBACK} />
                <Chip text={`${rec.impact} impact`} cls={IMPACT_STYLE[rec.impact] ?? IMPACT_STYLE.low} />
                <Chip text={rec.scope.replace(/_/g, " ")} cls="border-border/40 bg-foreground/[0.03] text-muted-foreground/75" />
                {rec.stage != null && (
                  <span className={cn(TYPE.microLabel, "tabular-nums")} title={`IAP loop stage ${rec.stage}`}>
                    Stage {rec.stage}
                  </span>
                )}
              </div>
              <DialogPrimitive.Title className={cn(HEADING.h3, "text-pretty")}>{rec.title}</DialogPrimitive.Title>
              {/* Provenance is the description: a recommendation you cannot
                  trace is an opinion with a border around it. */}
              <DialogPrimitive.Description className={cn(TYPE.caption, "text-muted-foreground/75 break-all")}>
                {rec.source ? `Source · ${rec.source}` : "Source · optimization_loop.recommendation_cards"}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              aria-label="Close"
              className="pressable shrink-0 h-10 w-10 -mr-2 -mt-1 inline-flex items-center justify-center rounded-lg text-muted-foreground/75 hover:text-foreground hover:bg-foreground/[0.05] transition-colors duration-150 ease-[var(--mx-ease)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {rec.metric && (
              <div className="flex items-baseline gap-2" data-testid="recommendation-drawer-metric">
                <span className="text-h3 font-h3 font-bold text-foreground metric-num tabular-nums leading-none">{rec.metric.value}</span>
                <span className={TYPE.microLabel}>{rec.metric.label}</span>
              </div>
            )}

            <Section label="What the rows say">
              <TokenizedConceptText text={rec.rationale} />
            </Section>

            <Section label="Recommended action">
              <TokenizedConceptText text={rec.recommendedAction} />
            </Section>

            <Section label="Confidence">
              {/* The engine's own words, first letter raised and nothing else
                  changed: "high for registration, directional for checkout"
                  is a sentence, not a title. */}
              <span className="first-letter:uppercase">{rec.confidence}</span>
            </Section>

            {rec.href && (
              <Section label="Where to check">
                <CrossLink to={rec.href} label={rec.hrefLabel ?? "See the evidence"} />
              </Section>
            )}

            {onSegments && (
              <Section label="Evidence segments">
                <button
                  type="button"
                  onClick={onSegments}
                  className="pressable inline-flex items-center gap-1.5 h-9 px-2.5 rounded-md border border-primary/30 text-caption font-medium text-interactive hover:bg-primary/10 transition-colors duration-150 ease-[var(--mx-ease)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" />
                  Avatar × placement drill-down
                </button>
              </Section>
            )}

            {decidable && (
              <p className={cn(TYPE.caption, "text-muted-foreground/80 leading-relaxed rounded-lg border border-border/40 bg-foreground/[0.02] px-3 py-2")}>
                Approving files a manual task in the tray. Nothing is applied to a live campaign.
              </p>
            )}
          </div>

          {decidable && (
            <div className="px-5 py-4 border-t border-border/40 flex items-center gap-2">
              <button
                type="button"
                data-testid="recommendation-drawer-dismiss"
                onClick={onDismiss}
                className="pressable flex-1 h-10 inline-flex items-center justify-center gap-1.5 rounded-lg border border-border/50 text-body font-medium text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05] transition-colors duration-150 ease-[var(--mx-ease)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" /> Dismiss
              </button>
              <button
                type="button"
                data-testid="recommendation-drawer-approve"
                onClick={onApprove}
                className="pressable flex-1 h-10 inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary/50 bg-primary text-primary-foreground text-body font-semibold hover:bg-primary/90 transition-colors duration-150 ease-[var(--mx-ease)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Check className="w-3.5 h-3.5" aria-hidden="true" /> {approveLabel}
              </button>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
