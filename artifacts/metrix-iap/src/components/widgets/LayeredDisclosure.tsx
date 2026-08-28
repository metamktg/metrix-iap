// Disclosure that goes DEEP, not just open.
//
// WHY THE EXISTING DISCLOSURE WAS NOT ENOUGH
// Every disclosure in this app is binary and flat: a row opens, its panel
// appears on the same plane as the row, and that is the end of it. That
// works for one level. It fails the moment the data has three — a creative,
// the variables detected in it, and the copy those variables were read
// from — because the reader gets a wall of revealed content with nothing
// saying which part belongs to which.
//
// The reference (layered-progressive-disclosure) solves it with CONTAINER
// STRUCTURE rather than with labels. Each level of depth is its own nested
// surface, one tone lighter than its parent, with a smaller radius. You can
// see how deep you are without reading anything. Opening the second layer
// reveals a control that opens the third, so depth is a chain the reader
// walks rather than a switch they flip.
//
// THREE THINGS CARRIED OVER FROM THE REFERENCE, AND ONE CHANGED
//
//   · NESTED PLANES.     Each depth gets its own background lift. This is the
//                        same idea as .mx-module-header — the eye resolves
//                        planes pre-attentively — applied recursively.
//
//   · CONCENTRIC RADII.  24 → 16 → 8, each step exactly the parent's radius
//                        minus its padding. Mismatched nested radii is the
//                        single most common thing that makes an interface
//                        feel subtly wrong, and at three levels of nesting
//                        it stops being subtle.
//
//   · BLUR ON REVEAL.    height + opacity + blur + a small travel. The blur
//                        is what makes revealed content read as arriving
//                        rather than as having been there all along.
//
//   · THE TRAVEL IS 8px, NOT 50. The reference moves revealed content 50px
//     because it is animating a settings card the size of a phone. In a
//     dense analytical surface a 50px travel means every line the reader was
//     holding jumps half an inch, and they have to find it again. The
//     purpose of the offset is to signal direction, and 8px signals it just
//     as well as 50 without moving anyone's reading target.
//
// Depth is carried by context, not by a prop each caller sets. A caller that
// has to remember to pass depth={2} is a caller that will eventually pass
// the wrong one, and the whole point of the ladder is that it is consistent.

import React, { createContext, useContext, useId, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@workspace/command-deck/lib/utils";
import { TYPE } from "@/pages/metrix/typography";
import { DUR_MED, EASE, SPRING_SOFT, motionOr } from "@/lib/motion";

/** How deep the current subtree is. 0 at the outermost layer. */
const DepthContext = createContext(0);

/**
 * The plane ladder. Radius steps down by exactly the padding at each level,
 * so every nested corner is concentric with its parent's.
 *
 *   depth 0   rounded-3xl (24px)  p-2 (8px)   →  child corner 16px
 *   depth 1   rounded-2xl (16px)  p-2 (8px)   →  child corner  8px
 *   depth 2   rounded-lg   (8px)              →  leaf
 *
 * Past depth 2 the ladder stops rather than inventing a fourth step: three
 * levels is already at the limit of what a reader can hold, and a surface
 * that needs a fourth needs a different layout, not a smaller radius.
 */
const PLANE = [
  { surface: "bg-foreground/[0.025]", radius: "rounded-3xl", inner: "rounded-2xl" },
  { surface: "bg-foreground/[0.045]", radius: "rounded-2xl", inner: "rounded-lg" },
  { surface: "bg-foreground/[0.065]", radius: "rounded-lg", inner: "rounded-lg" },
] as const;

function plane(depth: number) {
  return PLANE[Math.min(depth, PLANE.length - 1)]!;
}

export interface LayeredDisclosureProps {
  /** The row's face. A label, never a sentence — the sentence is inside. */
  label: React.ReactNode;
  /**
   * Stays visible while the layer is shut. This is what makes a closed stack
   * scannable instead of a row of doors: a count, a status, a metric.
   */
  summary?: React.ReactNode;
  /** Leading icon well, matching the app's `icon: Icon` convention. */
  icon?: React.ComponentType<{ className?: string }>;
  /**
   * What the layer reveals. `null` renders a NON-EXPANDABLE row — a control
   * that opens onto nothing is a promise the data did not keep, so a caller
   * with nothing to show gets a row, not a dead chevron.
   */
  children?: React.ReactNode;
  defaultOpen?: boolean;
  /** Controlled mode. Omit for self-managed state. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  "data-testid"?: string;
}

export function LayeredDisclosure({
  label,
  summary,
  icon: Icon,
  children,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  className,
  "data-testid": testId,
}: LayeredDisclosureProps) {
  const depth = useContext(DepthContext);
  const p = plane(depth);
  const bodyId = useId();
  const reduced = useReducedMotion();
  const [uncontrolled, setUncontrolled] = useState(defaultOpen);

  const expandable = children != null && children !== false;
  const isOpen = expandable && (controlledOpen ?? uncontrolled);

  const toggle = () => {
    const next = !isOpen;
    if (controlledOpen === undefined) setUncontrolled(next);
    onOpenChange?.(next);
  };

  const face = (
    <>
      {Icon && (
        <span
          className={cn(
            "shrink-0 grid place-items-center w-7 h-7 rounded-md bg-foreground/[0.05]",
          )}
        >
          <Icon className="w-4 h-4 text-muted-foreground/90" />
        </span>
      )}
      <span className={cn(TYPE.body, "min-w-0 flex-1 text-left font-medium text-foreground/90 truncate")}>
        {label}
      </span>
      {summary && <span className={cn(TYPE.caption, "shrink-0 text-muted-foreground")}>{summary}</span>}
      {expandable && (
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={motionOr(reduced, SPRING_SOFT)}
          className="shrink-0 grid place-items-center"
        >
          <ChevronDown className="w-4 h-4 text-muted-foreground/75" aria-hidden />
        </motion.span>
      )}
    </>
  );

  return (
    <div className={cn(p.surface, p.radius, "p-2", className)} data-testid={testId} data-depth={depth}>
      {expandable ? (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={isOpen}
          aria-controls={bodyId}
          className={cn(
            // h-11 keeps the whole strip a comfortable target, not just the
            // chevron. The reference makes the entire row the control and
            // that is right — a chevron-sized hit area on a touch screen is
            // a control most people miss.
            "w-full min-h-11 flex items-center gap-2.5 px-3 py-2 text-left",
            p.inner,
            "hover:bg-foreground/[0.03] active:scale-[0.99]",
            "transition-[background-color,scale] duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
          )}
        >
          {face}
        </button>
      ) : (
        <div className={cn("w-full min-h-11 flex items-center gap-2.5 px-3 py-2", p.inner)}>{face}</div>
      )}

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="body"
            id={bodyId}
            initial={{ height: 0, opacity: 0, filter: "blur(4px)", y: -8 }}
            animate={{ height: "auto", opacity: 1, filter: "blur(0px)", y: 0 }}
            exit={{ height: 0, opacity: 0, filter: "blur(4px)", y: -8 }}
            transition={motionOr(reduced, { duration: DUR_MED, ease: EASE })}
            className="overflow-hidden"
          >
            {/* One step deeper for everything inside, so a nested
                LayeredDisclosure picks up the next plane without the caller
                naming it. */}
            <DepthContext.Provider value={depth + 1}>
              <div className="pt-2">{children}</div>
            </DepthContext.Provider>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * A group of peers at the same depth. Only exists so a stack of layers gets
 * consistent spacing without every call site choosing its own gap.
 */
export function LayeredDisclosureGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("flex flex-col gap-2", className)}>{children}</div>;
}

/**
 * A leaf: the plane at the current depth with no control on it. For the
 * bottom of a chain, where there is content but nothing further to open.
 */
export function LayeredDisclosureLeaf({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const depth = useContext(DepthContext);
  const p = plane(depth);
  return <div className={cn(p.surface, p.radius, "px-3 py-2.5", className)}>{children}</div>;
}

/**
 * The reveal signature alone — height + opacity + blur(4px) + y:-8 travel —
 * for surfaces that already own their trigger (a bespoke header row with a
 * stat strip, a table row) and only need the BODY to arrive the way every
 * layered reveal in the product arrives. Composing this instead of copying
 * the values is what keeps "revealed content reads as arriving" one
 * decision rather than five drifting ones.
 *
 * Render it ALWAYS (it holds its own AnimatePresence); drive it with
 * `open`. Content unmounts on close, same as LayeredDisclosure's body.
 */
export function RevealPanel({
  open,
  children,
  className,
}: {
  open: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0, filter: "blur(4px)", y: -8 }}
          animate={{ height: "auto", opacity: 1, filter: "blur(0px)", y: 0 }}
          exit={{ height: 0, opacity: 0, filter: "blur(4px)", y: -8 }}
          transition={motionOr(reduced, { duration: DUR_MED, ease: EASE })}
          className={cn("overflow-hidden", className)}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
