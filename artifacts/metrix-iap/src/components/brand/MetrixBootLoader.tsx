// ─── Metrix boot loader ────────────────────────────────────────────────
// Full-screen loading state: static logo, rotating callout line, and a
// progress-fill bar (see index.css "mx-boot-*") — no framer-motion at boot
// so the loader stays lightweight. Reduced-motion users get static frames
// via the global prefers-reduced-motion override, and the callout rotation
// itself is frozen on its first line via useReducedMotion() below.

import { useEffect, useState } from "react";

import { BrandLogo } from "@/components/brand/BrandMark";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/**
 * Short, punchy Metrix callout lines that cycle while real data loads.
 * Kept under ~48 characters so each line either fits on a single row or
 * wraps into two balanced lines (text-wrap: balance) — never one long line
 * plus a short orphan word.
 */
export const CALLOUTS = [
  "the concept code carries the creative identity.",
  "andromeda rewards diversity, punishes repetition.",
  "every winning ad leaves a variable fingerprint.",
  "metrix runs 51 variables across 9 families.",
  "one variable separates a flop from a hit.",
  "turn subjective patterns into objective reality.",
  "your account gets smarter every time it loses.",
  "stop guessing which ad worked. start knowing.",
  "each creative has its own dna.",
  "your data already has the answer.",
];

// Fully visible for READ_MS, then sequentially fades out, swaps text, and
// fades back in over FADE_MS — never two lines crossfading on top of each
// other, which is what made the old approach hard to track.
const READ_MS = 3800;
const FADE_MS = 420;

/** Fisher–Yates shuffle (non-mutating). */
function shuffle<T>(list: readonly T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function MetrixBootLoader() {
  const reducedMotion = useReducedMotion();
  // Shuffled once per mount so lines play in a fresh random order each load,
  // with no repeats until the whole list has cycled.
  const [order] = useState<string[]>(() => shuffle(CALLOUTS));
  const [calloutIndex, setCalloutIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (reducedMotion) return;
    let swapTimer: number;
    const cycleTimer = window.setInterval(() => {
      setVisible(false);
      swapTimer = window.setTimeout(() => {
        setCalloutIndex((i) => (i + 1) % order.length);
        setVisible(true);
      }, FADE_MS);
    }, READ_MS + FADE_MS);
    return () => {
      window.clearInterval(cycleTimer);
      window.clearTimeout(swapTimer);
    };
  }, [reducedMotion, order]);

  return (
    <div
      className="h-screen w-screen mx-app-bg flex items-center justify-center px-6"
      role="status"
      aria-busy="true"
      aria-label="Loading Metrix data"
    >
      {/* Vertical stack, everything centered on one axis: logo → callout →
          progress bar. The column has a fixed width sized to how wide a
          balanced two-line callout actually renders, so the progress bar
          stays flush with the composition instead of trailing past it.
          Safe-area padding lives on the outer centering wrapper. */}
      <div className="flex flex-col items-center gap-4 w-[19rem] max-w-full">
        {/* Glowing logo core with a 60 BPM breathing pulse — no orbital ring.
            Sized up so it reads as the dominant anchor of the composition;
            the glow scales with it. Tight box (no extra top padding) keeps
            the whole stack optically centered on screen. */}
        <div className="relative w-28 h-28 shrink-0 grid place-items-center">
          <BrandLogo className="w-20 h-20 relative" />
        </div>

        {/* Fixed height, so swapping between one- and two-line callouts can
            never shift the logo or progress bar — no layout jump between
            strings. Centered text, centered within the column, matching the
            logo/progress-bar axis. */}
        <div className="h-10 w-full flex items-center justify-center" aria-hidden="true">
          <span
            className="mx-boot-callout block w-full text-center text-[13px] font-normal leading-snug tracking-normal text-text-secondary"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0)" : "translateY(3px)",
              textWrap: "balance",
            }}
          >
            {order[calloutIndex]}
          </span>
        </div>

        <div className="mx-boot-track" aria-hidden="true">
          <span className="mx-boot-fill" />
        </div>
      </div>
    </div>
  );
}
