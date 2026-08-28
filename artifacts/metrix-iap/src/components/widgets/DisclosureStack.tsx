// A stack of rows that splits open to reveal one thing at a time.
//
// WHAT THIS REPLACES
// The app has one disclosure toggle — AccordionToggle in strategyShared —
// and it is a BUTTON, not a container: it renders a label and a chevron and
// leaves every caller to hold its own `open` state, render its own panel,
// and decide for itself whether the panel animates. Two call sites use it.
// Meanwhile 43 of the 67 page views disclose nothing at all: they either put
// everything on the first layer or drop it into a modal.
//
// That gap is the whole reason a dense product reads as heavy. A modal is a
// context switch — it hides the thing you were comparing against. Putting
// everything on the surface is worse. The middle move is disclosure IN PLACE:
// the row stays where it was, and its detail grows out of it.
//
// THE MECHANIC (from the reference)
// Rows are a single stacked surface. Opening one does not overlay anything —
// the stack SPLITS, the rows below travel down, and the detail occupies the
// space they left. Nothing is covered, so the reader keeps their place.
// That is what makes it different from a modal and from a tooltip, and it is
// the reason the motion has to be a soft spring rather than a snap: a height
// change reflows text, and an energetic spring makes the reader chase the
// line they were on.
//
// WHAT IT IS NOT
// Not a tab strip (tabs REPLACE, this ADDS). Not a popover (popovers cover).
// Not SectionCard (that is a page-level section with its own header, one
// level up). Use this for a list of peers where the reader wants one at a
// time — a set of findings, a checklist with rationale, a group of settings
// with explanations.
//
// HONESTY
// It renders what it is handed and nothing else. An item with no content is
// rendered as a non-expandable row rather than an empty panel that opens onto
// nothing, because a chevron that opens to reveal blank space is a promise
// the data did not keep. Callers pass `content: null` for that case
// deliberately; they do not get a fabricated placeholder.

import React, { useCallback, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@workspace/command-deck/lib/utils";
import { TYPE } from "@/pages/metrix/typography";
import { DUR_FAST, EASE, SPRING_SNAPPY, SPRING_SOFT, motionOr } from "@/lib/motion";

export interface DisclosureItem {
  /** Stable key. Also seeds the aria ids, so it must be unique in the stack. */
  id: string;
  /** The row's face. Kept to a label — the sentence goes in `content`. */
  title: string;
  /**
   * Optional lucide-style icon for the leading well. Same shape the rest of
   * the app uses for icons (`icon: Icon` → `<Icon className=… />`), so a
   * caller never has to construct an element to pass one.
   */
  icon?: React.ComponentType<{ className?: string }>;
  /**
   * Optional right-aligned summary that stays visible while the row is shut —
   * a count, a metric, a status. This is what makes a closed stack scannable
   * instead of a list of doors.
   */
  meta?: React.ReactNode;
  /**
   * The disclosed detail. `null` or `undefined` means there is nothing to
   * disclose, and the row renders as a plain non-interactive line. It does
   * NOT render a chevron that opens onto blank space.
   */
  content?: React.ReactNode;
}

export interface DisclosureStackProps {
  items: DisclosureItem[];
  /**
   * `single` (default) closes the previous row when a new one opens, which is
   * what keeps a long stack from becoming a wall. `multi` lets rows stay open
   * independently — use it when the reader is comparing detail across rows.
   */
  mode?: "single" | "multi";
  /** Ids open on first render. Pass one id to lead with a row already split. */
  defaultOpen?: string[];
  /** Screen-reader name for the group. */
  label?: string;
  className?: string;
  "data-testid"?: string;
}

export function DisclosureStack({
  items,
  mode = "single",
  defaultOpen = [],
  label,
  className,
  "data-testid": testId,
}: DisclosureStackProps) {
  const reduced = useReducedMotion();
  const baseId = useId();
  const [open, setOpen] = useState<Set<string>>(() => {
    // In single mode an over-eager caller passing three defaults would open
    // three rows and then never be able to get back to that state by
    // clicking — the component would be starting in a state it cannot
    // represent. Take the first and drop the rest.
    const seed = mode === "single" ? defaultOpen.slice(0, 1) : defaultOpen;
    return new Set(seed);
  });

  // Roving focus across the row headers. A stack is a list, and arrow keys
  // are how a list is walked — without this a reader tabs through every row
  // to reach the fifth one, and tab order is for moving BETWEEN controls, not
  // within one.
  const headerRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const toggle = useCallback((id: string) => {
    setOpen((prev) => {
      const next = new Set(mode === "single" ? [] : prev);
      if (prev.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [mode]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      const openable = items
        .map((it, i) => (it.content == null ? -1 : i))
        .filter((i) => i >= 0);
      if (openable.length === 0) return;
      const at = openable.indexOf(index);
      let target: number | null = null;
      if (e.key === "ArrowDown") target = openable[(at + 1) % openable.length]!;
      else if (e.key === "ArrowUp") target = openable[(at - 1 + openable.length) % openable.length]!;
      else if (e.key === "Home") target = openable[0]!;
      else if (e.key === "End") target = openable[openable.length - 1]!;
      if (target === null) return;
      e.preventDefault();
      headerRefs.current[target]?.focus();
    },
    [items],
  );

  return (
    <div
      className={cn("mx-card divide-y divide-border/60", className)}
      data-testid={testId}
      role="group"
      aria-label={label}
    >
      {items.map((item, i) => {
        const disclosable = item.content != null;
        const isOpen = disclosable && open.has(item.id);
        const panelId = `${baseId}-panel-${item.id}`;
        const headerId = `${baseId}-header-${item.id}`;
        const Icon = item.icon;

        // The row face. A row with nothing to disclose is a <div>, not a
        // disabled <button>: a control that can never do anything is noise in
        // the tab order and reads to a screen reader as broken rather than
        // absent.
        const face = (
          <>
            {Icon && (
              // Concentric: the stack's radius is --radius-xl (14px) and the
              // row pads 8px, so the well takes 6px. Matching the outer
              // radius here is the commonest way nested surfaces look wrong.
              <span
                className={cn(
                  "shrink-0 grid place-items-center w-7 h-7 rounded-md",
                  "bg-foreground/[0.04] text-muted-foreground",
                  isOpen && "bg-primary/12 text-interactive",
                  "transition-colors",
                )}
                aria-hidden
              >
                <Icon className="w-3.5 h-3.5" />
              </span>
            )}
            <span className={cn(TYPE.title, "min-w-0 flex-1 text-left leading-snug")}>
              {item.title}
            </span>
            {item.meta != null && (
              <span className={cn(TYPE.caption, "shrink-0 tabular-nums")}>{item.meta}</span>
            )}
            {disclosable && (
              <motion.span
                className="shrink-0 text-muted-foreground"
                animate={{ rotate: isOpen ? 180 : 0 }}
                transition={motionOr(reduced, SPRING_SNAPPY)}
                aria-hidden
              >
                <ChevronDown className="w-4 h-4" />
              </motion.span>
            )}
          </>
        );

        return (
          <div key={item.id}>
            {disclosable ? (
              <button
                type="button"
                id={headerId}
                ref={(el) => {
                  headerRefs.current[i] = el;
                }}
                onClick={() => toggle(item.id)}
                onKeyDown={(e) => onKeyDown(e, i)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                className={cn(
                  // min-h-11 = 44px. The interaction gate's floor is the WCAG
                  // 24px target size; 44px is the touch-comfort size, and a
                  // row that spans the card's width has no reason to be
                  // smaller.
                  "pressable w-full min-h-11 px-3 py-2.5 flex items-center gap-2.5",
                  "text-left transition-colors hover:bg-foreground/[0.03]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-inset",
                  isOpen && "bg-foreground/[0.02]",
                )}
              >
                {face}
              </button>
            ) : (
              <div className="w-full min-h-11 px-3 py-2.5 flex items-center gap-2.5">{face}</div>
            )}

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  id={panelId}
                  role="region"
                  aria-labelledby={headerId}
                  key="panel"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  // The exit is faster and does not travel: content leaving
                  // is not information, and an exit that mirrors its enter
                  // reads as the interface arguing about something already
                  // dismissed.
                  exit={{ height: 0, opacity: 0 }}
                  transition={
                    reduced
                      ? { duration: 0 }
                      : { height: SPRING_SOFT, opacity: { duration: DUR_FAST, ease: EASE } }
                  }
                  className="overflow-hidden"
                >
                  {/* Indented to the icon well's right edge so the detail
                      reads as belonging to its row rather than to the stack. */}
                  <div className={cn("px-3 pb-3 pt-0.5", Icon && "pl-[3.125rem]")}>
                    {item.content}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
