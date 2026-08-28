// Filters that take up room only when you are using them.
//
// THE PROBLEM
// A filter row is permanent furniture: it occupies the top of a view whether
// or not anyone is filtering, and on the surfaces that carry one it is the
// first thing between the reader and the data they came for. IapLibraryView
// renders a three-control row twice, above two different tabs, and most
// sessions never touch it.
//
// Collapsing it is the obvious move and the dangerous one, which is why this
// component is more than a wrapper.
//
// THE DANGER, AND THE RULE THAT ANSWERS IT
// A HIDDEN ACTIVE FILTER IS A LIE ABOUT THE DATA. Collapse a row that has
// "min spend $50" set and the reader sees fourteen creatives where the
// account has sixty-two, with nothing on screen to say why. They will draw
// conclusions from the fourteen. That failure is worse than the clutter it
// was meant to fix, and it is the reason most products just leave the row
// open.
//
// So the collapsed state is not a closed door. It STATES what is active, in
// words, as chips — "Min spend $50", "Top tier", "2 concepts" — alongside
// the count it produced ("14 of 62"). Everything needed to distrust the
// numbers on screen is visible without expanding anything. Expanding only
// gets you the controls to CHANGE it.
//
// Two consequences fall out of that rule:
//
//   · `activeSummary` is required, not optional. A caller that cannot say
//     what its filters are doing has no business hiding them.
//   · A filtered view cannot be collapsed to a bare "Filters" chip. When
//     anything is active the trigger renders the chips at full strength;
//     when nothing is, it is a single quiet control.
//
// Clearing is offered from the collapsed state too. The commonest reason to
// open a filter row is to turn it off, and making someone expand a panel to
// reach a reset is a step that exists only because the panel exists.

import { useId, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@workspace/command-deck/lib/utils";
import { TYPE } from "@/pages/metrix/typography";
import { DUR_FAST, EASE, SPRING_SNAPPY, SPRING_SOFT } from "@/lib/motion";

export interface FilterDisclosureProps {
  /**
   * One short phrase per active filter — "Min spend $50", "Top tier",
   * "2 concepts". Empty when nothing is filtering.
   *
   * Required. This is the component's whole safety property: a collapsed
   * filter row that cannot say what it is doing must not be collapsible.
   */
  activeSummary: string[];
  /**
   * What the filters produced, stated against the unfiltered total —
   * "14 of 62 shown". Omit only when the caller genuinely cannot count.
   */
  resultNote?: string;
  /** Clears every filter. Offered from the collapsed state as well. */
  onClear?: () => void;
  /** Names the group for assistive tech. */
  label?: string;
  /** Open on first render — for a view that arrives pre-filtered by a link. */
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
}

export function FilterDisclosure({
  activeSummary,
  resultNote,
  onClear,
  label = "Filters",
  defaultOpen = false,
  children,
  className,
  "data-testid": testId,
}: FilterDisclosureProps) {
  const reduced = useReducedMotion();
  const panelId = `filters-${useId()}`;
  const [open, setOpen] = useState(defaultOpen);
  const active = activeSummary.length > 0;

  return (
    <div className={cn("w-full", className)} data-testid={testId}>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={panelId}
          className={cn(
            // 40px: the touch-comfort target, not the 24px AA floor. This is
            // the control standing between a reader and the data.
            "pressable inline-flex items-center gap-1.5 h-10 px-3 rounded-lg border transition-colors",
            TYPE.caption,
            active
              ? "border-primary/40 bg-primary/[0.08] text-interactive"
              : "border-border/40 text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]",
          )}
        >
          <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" aria-hidden />
          <span>{label}</span>
          {active && (
            <span
              className={cn(
                "text-micro-num font-bold tabular-nums rounded-full px-1.5 py-0.5",
                "bg-primary/20 text-interactive",
              )}
            >
              {activeSummary.length}
            </span>
          )}
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={reduced ? { duration: 0 } : SPRING_SNAPPY}
            aria-hidden
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </motion.span>
        </button>

        {/* The safety property, rendered. These chips are NOT decoration and
            NOT behind the disclosure: they are the reason it is safe to
            collapse the panel at all. Everything a reader needs in order to
            distrust the numbers on screen is here without expanding. */}
        {activeSummary.map((s) => (
          <span
            key={s}
            className={cn(
              TYPE.caption,
              "inline-flex items-center h-7 px-2 rounded-md",
              "border border-primary/25 bg-primary/[0.06] text-interactive",
            )}
          >
            {s}
          </span>
        ))}

        {resultNote && (
          <span className={cn(TYPE.caption, "tabular-nums", active && "text-interactive")}>
            {resultNote}
          </span>
        )}

        {active && onClear && (
          <button
            type="button"
            onClick={onClear}
            className={cn(
              "pressable inline-flex items-center gap-1 h-7 px-2 rounded-md transition-colors",
              TYPE.caption,
              "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04]",
            )}
          >
            <X className="w-3 h-3" aria-hidden />
            Clear
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={panelId}
            role="group"
            aria-label={label}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={
              reduced
                ? { duration: 0 }
                : { height: SPRING_SOFT, opacity: { duration: DUR_FAST, ease: EASE } }
            }
            className="overflow-hidden"
          >
            <div className="pt-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
