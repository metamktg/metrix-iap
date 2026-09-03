// ─── Signal deck ──────────────────────────────────────────────────────
//
// The card grid that carries signals, recommendations and alerts. One
// component behind all three, because they are the same shape — a
// SignalCard — and were being rendered three different ways.
//
// What the card leads with is decided by what the producer actually
// supplied, in this order:
//
//   metric_value  a number and its context     -> the number leads
//   headline      a stated finding             -> the finding leads
//   title         the fallback every card has  -> the title leads
//
// It never derives one from another. A card with no metric_value does not
// get a number parsed out of its prose — that is the structured-fields
// rule (I1): "signal-card structured fields render only when
// producer-supplied, never derived from prose".
//
// Colour encodes PRIORITY and nothing else. The reference decks this is
// modelled on tint each card a different hue for visual variety; here a
// hue is a claim, so the three priorities get the three reserved status
// tones and everything else earns its place through the data — the hero
// number, the delta, the confidence, the evidence trace.

import { useMemo, useState } from "react";
import { ArrowRight, ShieldAlert, CircleDot, Info, TriangleAlert } from "lucide-react";
import type { SignalCard } from "@/lib/data/seedTypes";
import { TYPE, HEADING } from "@/pages/metrix/typography";
import { DenseText } from "@/pages/metrix/shared";
import { fmtDelta } from "@/lib/normalize";

type Priority = "critical" | "important" | "informational";

/**
 * Priority drives the card's tone. `priority` is optional on the type, and
 * a null one is NOT bucketed into a default — the raw `impact` string is
 * shown instead, so a card whose producer did not rank it never borrows a
 * rank it was not given.
 */
const TONE: Record<Priority, { ring: string; tint: string; ink: string; icon: typeof ShieldAlert; label: string }> = {
  critical: {
    ring: "border-status-danger/45",
    tint: "bg-status-danger/[0.07]",
    ink: "text-status-danger",
    icon: ShieldAlert,
    label: "Critical",
  },
  important: {
    ring: "border-status-warning/40",
    tint: "bg-status-warning/[0.06]",
    ink: "text-status-warning",
    icon: TriangleAlert,
    label: "Important",
  },
  informational: {
    ring: "border-border/50",
    tint: "bg-foreground/[0.02]",
    ink: "text-muted-foreground",
    icon: Info,
    label: "Informational",
  },
};

const UNRANKED = {
  ring: "border-border/40",
  tint: "bg-foreground/[0.015]",
  ink: "text-muted-foreground",
  icon: CircleDot,
};

function isPriority(v: unknown): v is Priority {
  return v === "critical" || v === "important" || v === "informational";
}

export interface SignalDeckProps {
  cards: SignalCard[];
  /** Opens the card's own detail. Omit for a read-only deck. */
  onOpen?: (card: SignalCard) => void;
  /** Label for the action button. The deck does not invent verbs. */
  actionLabel?: string;
  emptyLabel?: string;
  /** Cards past this are held back behind a "Show all" control. */
  initialVisible?: number;
}

export function SignalDeck({
  cards,
  onOpen,
  actionLabel = "Open",
  emptyLabel = "No signals yet",
  initialVisible = 6,
}: SignalDeckProps) {
  const [expanded, setExpanded] = useState(false);

  // Ranked cards first, in severity order; unranked keep their given order
  // at the end rather than being sorted into a rank they do not have.
  const ordered = useMemo(() => {
    const weight: Record<Priority, number> = { critical: 0, important: 1, informational: 2 };
    const ranked = cards.filter((c) => isPriority(c.priority));
    const rest = cards.filter((c) => !isPriority(c.priority));
    ranked.sort((a, b) => weight[a.priority as Priority] - weight[b.priority as Priority]);
    return [...ranked, ...rest];
  }, [cards]);

  const visible = expanded ? ordered : ordered.slice(0, initialVisible);
  const hidden = ordered.length - visible.length;

  if (ordered.length === 0) {
    return (
      <p className="text-body font-body text-muted-foreground/75 py-8 text-center">{emptyLabel}</p>
    );
  }

  return (
    <div className="w-full">
      {/* One column on a phone, two on a tablet, three from a laptop up.
          auto-rows-fr keeps every card in a row the same height so the
          action buttons line up instead of stepping. */}
      <div className="grid gap-3 auto-rows-fr grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((c) => {
          const p = isPriority(c.priority) ? TONE[c.priority] : null;
          const tone = p ?? UNRANKED;
          const Icon = tone.icon;
          const delta = fmtDelta(c.delta_pct);
          const lead = c.metric_value ?? null;
          const heading = c.headline ?? c.title;
          const prose = c.implication ?? c.body ?? c.rationale ?? null;
          const act = c.action ?? c.recommended_action ?? null;

          return (
            <article
              key={c.id}
              className={`flex flex-col rounded-xl border ${tone.ring} ${tone.tint} p-3.5
                          transition-[border-color,background-color,transform] duration-150
                          ease-[var(--mx-ease)] hover:border-primary/40`}
            >
              {/* Eyebrow: priority (or the raw impact when unranked) + scope */}
              <div className="flex items-center gap-1.5 mb-2 min-w-0">
                <Icon className={`w-3.5 h-3.5 shrink-0 ${tone.ink}`} aria-hidden="true" />
                <span className={`${HEADING.h6} ${tone.ink}`}>
                  {p ? p.label : c.impact}
                </span>
                {!p && (
                  <span
                    className="text-micro text-muted-foreground/75"
                    title="This card's producer did not rank it. The raw impact value is shown rather than a substituted bucket."
                  >
                    unranked
                  </span>
                )}
                <span className="text-micro text-muted-foreground/75 ml-auto truncate" title={c.scope}>
                  {c.scope}
                </span>
              </div>

              {/* Hero number, only when the producer supplied one. */}
              {lead && (
                <div className="flex items-baseline gap-2 mb-1.5 flex-wrap">
                  <span className="text-h3 font-h3 font-semibold text-foreground tabular-nums leading-none">
                    {lead}
                  </span>
                  {delta && (
                    // Deliberately NOT coloured by sign. SignalCard carries no
                    // field saying which direction is good, and it depends on
                    // the metric: +20% results is a win, +20% cost per result
                    // is not. Painting every rise green would state a verdict
                    // the producer never gave. The sign is shown; the reading
                    // is left to the metric's own context beside it.
                    <span
                      className="text-caption font-body font-medium tabular-nums text-foreground/85"
                      title="Change as reported. This card does not state which direction is favourable for this metric."
                    >
                      {delta}
                    </span>
                  )}
                  {c.metric_context && (
                    <span className="text-caption font-body text-muted-foreground/80">{c.metric_context}</span>
                  )}
                </div>
              )}

              <h3 className={`${lead ? "text-h5 font-h5 font-bold" : "text-h4 font-h4 font-bold"} text-foreground leading-snug mb-1.5`}>
                {heading}
              </h3>

              {/* The finding itself. It is the output the reader came for, so
                  it stays on the face — clamped, not hidden behind a click. */}
              {prose && (
                <div className="mb-3">
                  <DenseText
                    text={prose}
                    className="text-body font-body text-data-body leading-relaxed"
                    clampClass="line-clamp-3"
                  />
                </div>
              )}

              {/* Footer pinned to the bottom so buttons align across a row. */}
              <div className="mt-auto flex items-center gap-2 flex-wrap pt-1">
                {c.confidence_level && (
                  <span
                    className="text-micro uppercase px-1.5 py-0.5 rounded bg-foreground/[0.06] text-muted-foreground"
                    title="Confidence the producer assigned to this signal"
                  >
                    {c.confidence_level}
                  </span>
                )}
                {c.needs_validation && (
                  <span
                    className="text-micro uppercase px-1.5 py-0.5 rounded bg-status-warning/15 text-status-warning"
                    title="Flagged by its producer as needing validation before it is acted on"
                  >
                    validate
                  </span>
                )}
                {c.evidence_ref && (
                  <span
                    className="text-micro text-muted-foreground/75 truncate max-w-[10rem]"
                    title={`Evidence: ${c.evidence_ref}`}
                  >
                    {c.evidence_ref}
                  </span>
                )}
                {onOpen && (
                  <button
                    type="button"
                    onClick={() => onOpen(c)}
                    className="ml-auto h-10 px-2.5 -my-1 inline-flex items-center gap-1 rounded-lg
                               text-caption font-body font-medium text-interactive
                               hover:bg-primary/10 active:scale-[0.96]
                               transition-[background-color,scale] duration-150 ease-[var(--mx-ease)]
                               focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`${actionLabel}: ${heading}`}
                  >
                    <span>{actionLabel}</span>
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>

              {/* The recommended action, when it differs from the button's
                  verb — it is content, not a control. */}
              {act && (
                <p className="text-caption font-body text-muted-foreground/85 leading-relaxed mt-2 pt-2 border-t border-border/30">
                  <span className={HEADING.h6}>Do next</span>{" "}
                  <span className="align-middle">{act}</span>
                </p>
              )}
            </article>
          );
        })}
      </div>

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className={`mt-3 h-10 px-3 -ml-3 ${TYPE.body} text-muted-foreground hover:text-foreground
                      active:scale-[0.96] transition-[color,scale] duration-150 ease-[var(--mx-ease)]`}
        >
          Show all <span className="tabular-nums">{ordered.length}</span>
        </button>
      )}
    </div>
  );
}
