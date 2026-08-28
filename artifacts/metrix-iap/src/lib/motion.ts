// One spring, one set of thresholds, one place to change them.
//
// WHY THIS FILE EXISTS
// framer-motion has been a dependency of this app for its whole life and was
// imported in exactly one file (the boot loader, which then went on to use raw
// CSS anyway). Everything else that moves is hand-rolled: RecommendationDeck
// carries ~600 lines of onPointerDown/onPointerMove/onPointerUp with its own
// drag threshold, its own velocity guess and its own snap-back, and every
// hover/press affordance picks its own duration out of the air. The result is
// that no two moving things in the product move the same way, which reads as
// several products rather than one.
//
// Motion is a brand surface. A spring that is consistent across a swipe, a
// disclosure and a press is the difference between "animated" and "designed".
// So the numbers live here, they are named, and a component that wants
// different ones has to say so explicitly rather than by accident.
//
// THE NUMBERS ARE NOT INVENTED. They are the reference deck's own values —
// stiffness 330 / damping 30, a 50px drag buffer, a 500px/s velocity escape —
// which is what makes a card feel like it has mass without feeling slow. The
// rest of the scale is derived from them so nothing fights: the press scale
// and the hover scale are the reference's, the durations are the app's
// existing --mx-fast/--mx-med (140ms/220ms) so CSS-driven and JS-driven
// motion agree, and the stagger step is the 100ms that keeps a list reading
// as a sequence rather than a flicker.
//
// REDUCED MOTION IS NOT A NICETY HERE. This is a dense analytics product
// people read for long stretches; vestibular triggers are a real accessibility
// failure, not a preference. `useReducedMotion()` from framer-motion reads the
// OS setting reactively — prefer the hook, and use `NO_MOTION` when you need
// the transition object rather than a boolean. Nothing in this file animates
// anything by itself; it only supplies values.

import type { Transition, Variants } from "framer-motion";

// ─── Springs ──────────────────────────────────────────────────────────

/**
 * The default. Everything that moves under a finger — a swiped card, a
 * dragged slider handle, a panel that snaps — uses this unless it has a
 * documented reason not to.
 *
 * stiffness 330 / damping 30 lands just under critical damping: it settles
 * without visible overshoot but still reads as sprung rather than eased,
 * which is what makes a dragged object feel like it has weight.
 */
export const SPRING: Transition = { type: "spring", stiffness: 330, damping: 30 };

/**
 * For layout that RESIZES rather than moves — an accordion opening, a card
 * growing to hold its detail. Softer and slower, because a height change
 * reflows text and an energetic spring makes the reader chase the line
 * they were on.
 */
export const SPRING_SOFT: Transition = { type: "spring", stiffness: 240, damping: 32 };

/**
 * For small chrome that should feel instant — an icon swap, a chevron
 * rotating, a badge appearing. Stiff enough to be over before it is noticed.
 */
export const SPRING_SNAPPY: Transition = { type: "spring", stiffness: 460, damping: 34 };

/**
 * Bounce is ZERO on every spring here, and that is a rule rather than a
 * default. A dashboard that boings is a dashboard nobody trusts with money.
 * Duration-based springs (framer's `duration` + `bounce` form) are the one
 * place bounce can be set, so it is pinned at 0 for the icon-swap case the
 * interface-details reference calls for.
 */
export const SPRING_ICON: Transition = { type: "spring", duration: 0.3, bounce: 0 };

// ─── Drag thresholds ──────────────────────────────────────────────────

/**
 * How far a card must travel before release COMMITS instead of snapping
 * back, in px. Below this the gesture reads as a nudge, not a decision.
 */
export const DRAG_BUFFER = 50;

/**
 * The escape hatch for a fast flick: a release above this speed (px/s)
 * commits even if it never crossed DRAG_BUFFER. Without it, a quick
 * confident flick — which is how people actually dismiss things — snaps
 * back and reads as the control ignoring them.
 */
export const VELOCITY_THRESHOLD = 500;

/**
 * Rubber-banding at the ends of a deck. 0 = a hard wall (the deck simply
 * stops), 1 = no resistance at all. 0.18 gives enough give to say "there is
 * nothing past this" without letting the card drift somewhere meaningless.
 */
export const DRAG_ELASTIC = 0.18;

// ─── Interaction scales ───────────────────────────────────────────────

/**
 * Press feedback. 0.96 exactly — below 0.95 reads as a button collapsing
 * rather than being pressed, and the difference is visible at these card
 * sizes.
 */
export const PRESS_SCALE = 0.96;

/** Lift on hover. Deliberately small: 2% is felt, 5% is a bounce. */
export const HOVER_SCALE = 1.02;

// ─── Durations ────────────────────────────────────────────────────────
//
// Seconds, because that is framer's unit. These mirror --mx-fast (140ms) and
// --mx-med (220ms) in index.css so a CSS transition and a motion transition
// on adjacent elements do not disagree by 60ms — which is exactly the size of
// mismatch that reads as jank without being locatable.

export const DUR_FAST = 0.14;
export const DUR_MED = 0.22;
export const DUR_SLOW = 0.36;

/**
 * The app's easing curve, matching --mx-ease. Used for anything that should
 * NOT be sprung: opacity fades, colour changes, and the enter/exit of things
 * that have no physical metaphor.
 */
export const EASE: [number, number, number, number] = [0.2, 0.8, 0.2, 1];

/** The cross-fade curve for icon swaps and other paired enter/exits. */
export const EASE_SWAP: [number, number, number, number] = [0.2, 0, 0, 1];

// ─── Stagger ──────────────────────────────────────────────────────────

/**
 * Delay between siblings in a staggered enter, in seconds.
 *
 * A container that animates as ONE block reads as a page loading. The same
 * content split into its semantic chunks and staggered reads as a page being
 * composed — the reason to split is that the eye is given an order to follow.
 * 100ms is the step where that order is legible without the list feeling slow.
 */
export const STAGGER_STEP = 0.1;

/**
 * Cap on total stagger, in seconds. A 40-row table staggered at 100ms takes
 * four seconds to finish arriving, which is not a sequence, it is a wait.
 * Compute the per-child delay with `staggerDelay(i, n)` instead of
 * multiplying by hand.
 */
export const STAGGER_MAX = 0.5;

/** Per-child enter delay, clamped so a long list never becomes a wait. */
export function staggerDelay(index: number, count: number): number {
  if (count <= 1) return 0;
  const step = Math.min(STAGGER_STEP, STAGGER_MAX / (count - 1));
  return index * step;
}

// ─── Variants ─────────────────────────────────────────────────────────
//
// The two enter/exit shapes worth sharing. Both follow the same asymmetry:
// the ENTER travels further and takes longer than the EXIT, because an
// element arriving is information and an element leaving is not. An exit
// that mirrors its enter reads as the interface arguing with the user about
// a thing they already dismissed.

/** Content arriving in place — a revealed panel, a loaded card body. */
export const RISE: Variants = {
  hidden: { opacity: 0, y: 8 },
  shown: { opacity: 1, y: 0, transition: { duration: DUR_MED, ease: EASE } },
  // Exit travels a SMALL FIXED distance, never the element's own height:
  // animating height on exit makes a tall card's departure take visibly
  // longer than a short one's, for no reason the reader can see.
  exit: { opacity: 0, y: 4, transition: { duration: DUR_FAST, ease: EASE } },
};

/** An icon or badge swapping for another in the same slot. */
export const ICON_SWAP: Variants = {
  hidden: { opacity: 0, scale: 0.25, filter: "blur(4px)" },
  shown: { opacity: 1, scale: 1, filter: "blur(0px)", transition: SPRING_ICON },
  exit: { opacity: 0, scale: 0.25, filter: "blur(4px)", transition: SPRING_ICON },
};

// ─── Reduced motion ───────────────────────────────────────────────────

/**
 * The transition to substitute when the reader has asked for less motion:
 * a zero-duration tween, so state changes land instantly and correctly
 * rather than being skipped.
 *
 * Prefer framer's `useReducedMotion()` hook at the component boundary and
 * pass this through — do not read the media query by hand, and do not
 * branch on it inside a render loop.
 */
export const NO_MOTION: Transition = { duration: 0 };

/** `transition={motionOr(reduced, SPRING)}` — the whole guard, inline. */
export function motionOr(reduced: boolean | null, transition: Transition): Transition {
  return reduced ? NO_MOTION : transition;
}
