// A list that piles: overflow items stack behind a face card that shows
// its real depth, and fan out in place on demand.
//
// THE MECHANIC (from the reference)
// "A queue that reads as a queue." A flat list of N cards in a narrow
// panel is a wall; a count-labelled button is a door. The middle move is
// a PILE: the first items stay fully visible and actionable, and the
// rest compress into a face card with the edges of the hidden cards
// peeking out beneath it — depth you can see, not a number you must
// imagine. Clicking the face fans the hidden items out in place
// (staggered arrival, same signature as the quick-switcher rows);
// clicking it again restacks them.
//
// WHAT IT IS NOT
// Not DisclosureStack — that splits ONE row open to read its detail;
// this folds MANY rows into visible depth. Not useShowMore — that is a
// text button; the pile face is the content's own geometry. Not a place
// for unprocessed signal: a work queue where every item needs eyes does
// NOT belong behind a pile (the run-history rule — signals never fold).
// Pile settled things: history, archives, the tail of an already
// prioritized list.
//
// HONESTY
// The edge strips are presentational (aria-hidden) but never a lie: one
// hidden item shows one edge, two or more show two, zero shows none —
// and the face states the exact count. Collapse unmounts instantly
// rather than exit-animating: the reappearing depth edges are the
// departure cue, and a delayed unmount would leave "hidden" items
// findable in the DOM after the reader stacked them away.

import React, { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronDown, Layers } from "lucide-react";
import { cn } from "@workspace/command-deck/lib/utils";
import { TYPE } from "@/pages/metrix/typography";
import { DUR_MED, EASE, motionOr, staggerDelay } from "@/lib/motion";

export interface ListStackProps<T> {
  items: T[];
  /** Stable per-item key — index is passed for callers whose rows repeat. */
  itemKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => React.ReactNode;
  /**
   * How many leading items stay permanently visible above the pile.
   * 0 (the default) piles the whole list behind the face — the History
   * case; 3 keeps the top of the queue actionable — the My Tray case.
   */
  visible?: number;
  /**
   * The face card's text, given the hidden count — a single string so it
   * stays one findable text node (e.g. `History (${n})`, `${n} more
   * queued`). The count belongs in it: a pile that hides its size is a
   * door, not a pile.
   */
  faceLabel: (hiddenCount: number) => string;
  className?: string;
  "data-testid"?: string;
}

export function ListStack<T>({
  items,
  itemKey,
  renderItem,
  visible = 0,
  faceLabel,
  className,
  "data-testid": testId,
}: ListStackProps<T>) {
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);

  const lead = items.slice(0, visible);
  const overflow = items.slice(visible);

  return (
    <div className={className} data-testid={testId}>
      {lead.map((item, i) => (
        <React.Fragment key={itemKey(item, i)}>{renderItem(item, i)}</React.Fragment>
      ))}

      {overflow.length > 0 && (
        <>
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              data-testid={testId ? `${testId}-face` : undefined}
              className={cn(
                "pressable relative w-full flex items-center gap-2 rounded-lg border border-border/40",
                "bg-foreground/[0.03] px-2.5 py-2 min-h-9 text-left",
                "hover:border-border/60 hover:bg-foreground/[0.05] transition-colors",
              )}
            >
              <Layers className="w-3.5 h-3.5 text-muted-foreground/75 shrink-0" />
              <span className={cn(TYPE.caption, "font-semibold text-foreground/80 flex-1 min-w-0 truncate")}>
                {faceLabel(overflow.length)}
              </span>
              <ChevronDown
                className={cn(
                  "w-3.5 h-3.5 text-muted-foreground/75 shrink-0 transition-transform duration-150",
                  open && "rotate-180",
                )}
              />
            </button>
            {/* The hidden cards' bottom edges, peeking out beneath the face
                while the pile is shut. Count-honest: one hidden item shows
                one strip, two or more show two. Gone while fanned out —
                an open pile has nothing underneath. */}
            {!open && (
              <div aria-hidden className="space-y-0">
                <div className="mx-1.5 h-[6px] rounded-b-lg border-x border-b border-border/55 bg-foreground/[0.05]" />
                {overflow.length >= 2 && (
                  <div className="mx-3 h-[5px] rounded-b-lg border-x border-b border-border/40 bg-foreground/[0.03]" />
                )}
              </div>
            )}
          </div>

          {open &&
            overflow.map((item, i) => (
              <motion.div
                key={itemKey(item, visible + i)}
                initial={reduced ? false : { opacity: 0, y: -6, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{
                  ...motionOr(reduced, { duration: DUR_MED, ease: EASE }),
                  delay: reduced ? 0 : staggerDelay(i, overflow.length),
                }}
              >
                {renderItem(item, visible + i)}
              </motion.div>
            ))}
        </>
      )}
    </div>
  );
}
