// The tile BECOMES the panel, instead of a panel appearing over the tile.
//
// STATUS: BUILT AND TESTED, NOT YET WIRED TO A ROUTE.
// Stated here because this repo has a history of widgets that were reported
// as shipped and were only ever files. The MECHANIC this implements IS live:
// CreativeCard and CreativeExpandDialog carry a matching `layoutId`, so the
// creative already morphs from its tile into the expanded panel, and
// smoke:metrix-iap-shared-layout measures it every run. This component is the
// self-contained version of that pattern — its own overlay instead of Radix —
// for card grids that have no dialog yet. Nothing renders it today.
//
// WHAT THIS IS FOR
// Every expand in this product is a cut: a card sits there, you click it, and
// a modal fades in somewhere else at some other size. The reader has to
// re-find the thing they were looking at, because nothing on screen connects
// the small version to the large one. With a wall of creative tiles that
// happens dozens of times a session, and each time costs a beat.
//
// The reference (expandable-profile-card) removes the cut with framer-motion's
// shared layout: the same `layoutId` on the collapsed element and the expanded
// one, so the browser interpolates between the two rectangles. The image
// travels and grows, the title travels and scales, and the reader's eye
// follows one continuous object. Nothing to re-find.
//
// WHY THIS IS NOT BUILT ON THE RADIX DIALOG
// The app's other modals are Radix. Radix runs its own mount/unmount
// animation on DialogContent, which fights a layout animation for control of
// the same box — the result is a morph that stutters or snaps. The reference
// renders its own overlay for exactly this reason, and so does this.
//
// WHAT THE REFERENCE LEAVES OUT, AND THIS DOES NOT
// The reference's expanded state is a plain <div>. It has no dialog role, no
// aria-modal, no Escape handling, no focus move, and no way back for a
// keyboard: you can open it and then you are stuck inside a page you cannot
// see. That is not a nit — an expand a keyboard cannot leave is a trap. So
// this adds role="dialog", aria-modal, a labelled title, Escape-to-close,
// focus moved to the panel on open and returned to the trigger on close, and
// a scroll lock while it is up.

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@workspace/command-deck/lib/utils";
import { TYPE } from "@/pages/metrix/typography";
import { DUR_MED, SPRING_SOFT, motionOr } from "@/lib/motion";

export interface ExpandableMediaCardProps {
  /**
   * Stable identity. The layout animation pairs the collapsed and expanded
   * elements by this, so it MUST be unique on the page — two cards sharing
   * one id animate into each other, which looks like a bug because it is.
   */
  mediaKey: string;
  /** The media itself, rendered in both states. Fills its container. */
  media: React.ReactNode;
  /** Eyebrow above the title — a code, a category. */
  eyebrow?: string;
  title: string;
  /** Detail shown only once expanded. */
  children: React.ReactNode;
  /** Overlays on the collapsed tile — status pills, action bars. */
  overlay?: React.ReactNode;
  /** Aspect of the collapsed tile's media. */
  aspect?: string;
  className?: string;
  "data-testid"?: string;
}

export function ExpandableMediaCard({
  mediaKey,
  media,
  eyebrow,
  title,
  children,
  overlay,
  aspect = "aspect-[4/5]",
  className,
  "data-testid": testId,
}: ExpandableMediaCardProps) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Namespaced so two cards can never collide, and so the ids mean something
  // in a devtools layout inspector.
  const lid = `emc-${mediaKey}`;

  const close = useCallback(() => {
    setOpen(false);
    // Return focus to where it came from. Without this the keyboard lands
    // back at the top of the document and the reader loses their position in
    // a grid that may be hundreds of tiles long.
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, close]);

  return (
    <>
      {/* The collapsed tile is hidden — not unmounted — while expanded. The
          layout animation needs a source rectangle to leave from and a
          destination to return to; unmounting it makes the close animation
          have nowhere to go, and the panel just vanishes. */}
      <motion.button
        ref={triggerRef}
        type="button"
        layoutId={lid}
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-label={`Expand ${title}`}
        data-testid={testId}
        style={{ visibility: open ? "hidden" : "visible" }}
        className={cn(
          "group relative w-full overflow-hidden rounded-xl border border-foreground/[0.09] bg-foreground/[0.02] text-left",
          "hover:border-primary/30 transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          className,
        )}
      >
        <div className={cn("relative w-full overflow-hidden", aspect)}>
          <motion.div
            layoutId={`${lid}-media`}
            className="absolute inset-0"
            // The 1.04 hover lift lives on an inner element so it composes
            // with the layout transform instead of overwriting it.
          >
            <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-[1.04]">
              {media}
            </div>
          </motion.div>
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-background/85 via-background/25 to-transparent"
          />
          <div className="absolute inset-x-0 bottom-0 p-3">
            {eyebrow && (
              <motion.div layoutId={`${lid}-eyebrow`} className={cn(TYPE.microLabel, "mb-0.5")}>
                {eyebrow}
              </motion.div>
            )}
            <motion.div
              layoutId={`${lid}-title`}
              className={cn(TYPE.body, "font-semibold text-foreground leading-tight line-clamp-2")}
            >
              {title}
            </motion.div>
          </div>
          {overlay}
        </div>
      </motion.button>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: DUR_MED }}
              onClick={close}
              className="absolute inset-0 bg-background/80 backdrop-blur-md"
            />
            <motion.div
              layoutId={lid}
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              tabIndex={-1}
              transition={motionOr(reduced, SPRING_SOFT)}
              className={cn(
                "relative z-10 w-full max-w-4xl max-h-[88vh] overflow-hidden rounded-2xl",
                "border border-border/40 bg-surface-deep outline-none",
                "flex flex-col sm:flex-row",
              )}
            >
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className={cn(
                  "absolute top-3 right-3 z-20 grid place-items-center h-8 w-8 rounded-full",
                  "border border-border/50 bg-background/60 backdrop-blur-sm text-foreground",
                  "hover:bg-foreground/[0.08] transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                )}
              >
                <X className="w-4 h-4" />
              </button>

              <div className="relative h-56 w-full shrink-0 overflow-hidden sm:h-auto sm:w-[42%] border-b sm:border-b-0 sm:border-r border-border/30 bg-surface-preview">
                <motion.div layoutId={`${lid}-media`} className="absolute inset-0">
                  {media}
                </motion.div>
              </div>

              <div className="flex min-h-0 w-full flex-col overflow-hidden sm:w-[58%]">
                <div className="shrink-0 border-b border-border/30 px-5 pt-4 pb-3">
                  {eyebrow && (
                    <motion.div layoutId={`${lid}-eyebrow`} className={cn(TYPE.microLabel, "mb-0.5")}>
                      {eyebrow}
                    </motion.div>
                  )}
                  <motion.div
                    layoutId={`${lid}-title`}
                    id={titleId}
                    className={cn(TYPE.title, "pr-10")}
                  >
                    {title}
                  </motion.div>
                </div>
                {/* The body fades in AFTER the morph rather than travelling
                    with it. Interpolating a panel of dense text between two
                    very different widths reflows every line mid-flight, which
                    is unreadable; the morph carries the frame and the media,
                    and the content arrives once the frame has landed. */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: reduced ? 0 : 0.16, duration: DUR_MED }}
                  className="min-h-0 flex-1 overflow-y-auto"
                >
                  {children}
                </motion.div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
