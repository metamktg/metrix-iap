// A stack of cards you decide on one at a time.
//
// WHAT THIS REPLACES
// RecommendationDeck carried its own drag implementation: onPointerDown /
// onPointerMove / onPointerUp, a `dx` React state updated on every pointer
// frame, a fixed 110px threshold, and a `setTimeout(160)` racing the CSS
// transition to fire the commit. Five things were wrong with it, and four of
// them are user-visible:
//
//   1. NO VELOCITY. A fast confident flick that travelled 90px snapped back.
//      That is how people actually dismiss things, and the control ignored
//      them. Fixed here: a release past VELOCITY_THRESHOLD commits whatever
//      distance it covered.
//   2. STATE PER FRAME. `setDx` on every pointermove re-renders the whole
//      card — badges, prose, overlays — sixty times a second. framer's motion
//      values write straight to the DOM, so a drag re-renders nothing.
//   3. THE TIMER. `setTimeout(160, onApprove)` had no cleanup. Unmount the
//      deck mid-flight — navigate away, filter the list — and the callback
//      fires against a component that is gone. Here the commit is the
//      animation's own completion callback, so it cannot outlive the card.
//   4. KEYBOARD IN THE WRONG PLACE. The card had none; the deck had an
//      unguarded `window` keydown listener instead, so while the Deck tab
//      was open ArrowRight ANYWHERE on the page approved the top card. Put
//      the caret in a search box, press ArrowRight to move one character,
//      and a recommendation you never read is in the tray. That is a data
//      defect, not a polish item. The card now handles arrows when it has
//      focus (below); the deck-level listener is still useful for clearing
//      a queue without hunting for focus, but it is guarded at its call
//      site to ignore editable fields and other focused controls.
//   5. CAPTURE ON e.target. `setPointerCapture` went to whatever child was
//      under the finger. Press a badge, drag, and capture belongs to the
//      badge — which is fine until that badge re-renders away mid-drag and
//      the gesture dies silently.
//
// It also had its own threshold (110) and its own rotation divisor (22),
// both picked by hand, so it moved unlike everything else in the product.
// The numbers now come from lib/motion.ts.
//
// HONESTY
// A commit fires ONCE, when the card has actually left. There is no
// optimistic callback and no second firing on the animation's end — a queue
// that double-approves is worse than one that is slow.

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  motion, useMotionValue, useReducedMotion, useTransform,
  type MotionValue, type PanInfo,
} from "framer-motion";
import { cn } from "@workspace/command-deck/lib/utils";
import { TYPE } from "@/pages/metrix/typography";
import { DRAG_BUFFER, DRAG_ELASTIC, SPRING, VELOCITY_THRESHOLD } from "@/lib/motion";

export type SwipeDirection = "left" | "right";

export interface SwipeAction {
  /** Shown on the card as the gesture crosses toward this side. */
  label: string;
  /** Which status token tints the stamp. */
  tone: "success" | "danger" | "warning" | "info";
}

const TONE_CLASS: Record<SwipeAction["tone"], string> = {
  success: "text-status-success border-status-success",
  danger: "text-status-danger border-status-danger",
  warning: "text-status-warning border-status-warning",
  info: "text-status-info border-status-info",
};

export interface SwipeDeckProps<T> {
  items: T[];
  keyOf: (item: T) => string;
  renderCard: (item: T, isTop: boolean) => React.ReactNode;
  /** Fired once, after the card has left. */
  onCommit: (item: T, direction: SwipeDirection) => void;
  /** Optional: a tap that did not travel far enough to be a drag. */
  onTap?: (item: T) => void;
  right: SwipeAction;
  left: SwipeAction;
  /** How many cards render behind the top one. Beyond 3 nothing is visible. */
  depth?: number;
  className?: string;
  "data-testid"?: string;
}

export function SwipeDeck<T>({
  items,
  keyOf,
  renderCard,
  onCommit,
  onTap,
  right,
  left,
  depth = 3,
  className,
  "data-testid": testId,
}: SwipeDeckProps<T>) {
  const visible = items.slice(0, Math.max(1, depth));

  return (
    // h-full: every card is absolutely positioned, so this box has no height
    // of its own. Without it the caller's sized container (the deck gives it
    // 300 px) never reaches the cards, each card box collapses to its border,
    // and three faces overflow onto one another. Measured on 2026-09-04: the
    // card box was 2 px tall on every overview.
    <div className={cn("relative select-none h-full", className)} data-testid={testId}>
      {/* No AnimatePresence here on purpose. Removal is driven by onCommit,
          which fires only once the card has finished flying off-screen — by
          then it is transparent and outside the frame, so an exit animation
          would animate something nobody can see, and wrapping these in
          AnimatePresence would imply one exists. */}
      {visible
        .map((item, i) => (
          <SwipeCard
            key={keyOf(item)}
            item={item}
            index={i}
            isTop={i === 0}
            renderCard={renderCard}
            onCommit={onCommit}
            onTap={onTap}
            right={right}
            left={left}
          />
        ))
        // Painted back-to-front so the top card is last in the DOM and
        // needs no z-index arithmetic to sit above its stack.
        .reverse()}
    </div>
  );
}

function SwipeCard<T>({
  item,
  index,
  isTop,
  renderCard,
  onCommit,
  onTap,
  right,
  left,
}: {
  item: T;
  index: number;
  isTop: boolean;
  renderCard: (item: T, isTop: boolean) => React.ReactNode;
  onCommit: (item: T, direction: SwipeDirection) => void;
  onTap?: (item: T) => void;
  right: SwipeAction;
  left: SwipeAction;
}) {
  const reduced = useReducedMotion();
  const x = useMotionValue(0);
  const [flyingTo, setFlyingTo] = useState<SwipeDirection | null>(null);

  // Guards a double-commit. A drag that crosses the threshold and a keypress
  // arriving in the same frame would otherwise both fire, and approving one
  // recommendation twice is a data defect, not a visual one.
  const committed = useRef(false);
  useEffect(() => {
    committed.current = false;
  }, [item]);

  // Rotation follows displacement, capped: past ±160px the card is leaving
  // anyway and more tilt only makes the text unreadable on the way out.
  const rotate = useTransform(x, [-160, 0, 160], [-9, 0, 9], { clamp: true });
  const rightOpacity = useTransform(x, [0, DRAG_BUFFER * 2], [0, 1], { clamp: true });
  const leftOpacity = useTransform(x, [-DRAG_BUFFER * 2, 0], [1, 0], { clamp: true });

  const commit = useCallback(
    (direction: SwipeDirection) => {
      if (committed.current) return;
      committed.current = true;
      setFlyingTo(direction);
    },
    [],
  );

  const onDragEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      const { offset, velocity } = info;
      // Distance OR speed. The velocity arm is what makes a flick work.
      const far = Math.abs(offset.x) > DRAG_BUFFER;
      const fast = Math.abs(velocity.x) > VELOCITY_THRESHOLD;
      if (far || fast) {
        commit(offset.x > 0 ? "right" : "left");
      }
      // Below both thresholds framer springs x back to 0 on its own — there
      // is no snap-back to write.
    },
    [commit],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isTop) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        commit("right");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        commit("left");
      } else if (onTap && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        onTap(item);
      }
    },
    [isTop, commit, onTap, item],
  );

  // Cards behind the top one sit back and down, and stop taking pointers.
  const restingScale = 1 - index * 0.04;
  const restingY = index * 10;

  return (
    <motion.div
      className={cn("absolute inset-0", !isTop && "pointer-events-none")}
      style={{ x, rotate }}
      drag={isTop && !flyingTo ? "x" : false}
      dragElastic={DRAG_ELASTIC}
      dragMomentum={false}
      onDragEnd={onDragEnd}
      // The tap arm: framer distinguishes a tap from a drag itself, so the
      // old "did the pointer move less than 6px" bookkeeping is gone.
      onTap={isTop && onTap ? () => onTap(item) : undefined}
      initial={false}
      animate={
        flyingTo
          ? { x: flyingTo === "right" ? 640 : -640, opacity: 0, scale: 0.95 }
          : { scale: restingScale, y: restingY, opacity: index > 2 ? 0 : 1 }
      }
      transition={reduced ? { duration: 0 } : SPRING}
      // The commit fires when the card has ACTUALLY left, not on a timer
      // racing it. Unmount mid-flight and this never runs.
      onAnimationComplete={() => {
        if (flyingTo) onCommit(item, flyingTo);
      }}
      tabIndex={isTop ? 0 : -1}
      role={isTop ? "group" : undefined}
      aria-label={
        isTop
          ? `Card ${index + 1}. Left arrow to ${left.label}, right arrow to ${right.label}.`
          : undefined
      }
      onKeyDown={onKeyDown}
    >
      <div
        className={cn(
          "relative h-full rounded-2xl border bg-surface-overlay",
          isTop
            ? "border-border/60 elevation-floating cursor-grab active:cursor-grabbing focus-visible:outline-none"
            : "border-border/40",
        )}
      >
        {isTop && (
          <>
            <Stamp action={right} className="left-4 -rotate-12" opacity={rightOpacity} />
            <Stamp action={left} className="right-4 rotate-12" opacity={leftOpacity} />
          </>
        )}
        {renderCard(item, isTop)}
      </div>
    </motion.div>
  );
}

/** The intent stamp that fades in as the gesture crosses toward a side. */
function Stamp({
  action,
  className,
  opacity,
}: {
  action: SwipeAction;
  className: string;
  opacity: MotionValue<number>;
}) {
  return (
    <motion.div
      style={{ opacity }}
      aria-hidden
      className={cn(
        "absolute top-4 z-10 rounded border-2 px-2 py-1",
        TYPE.microLabel,
        "font-bold tracking-widest",
        TONE_CLASS[action.tone],
        className,
      )}
    >
      {action.label}
    </motion.div>
  );
}
