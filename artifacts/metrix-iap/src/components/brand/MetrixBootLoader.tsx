// ─── Metrix boot loader ────────────────────────────────────────────────
// Branded "command deck powering up" full-screen loading state, recreated
// natively in CSS from the motion reference at
// artifacts/metrix-loading-video/src/components/video/.
// Pure CSS for the glow/ring/progress fill (see index.css "mx-boot-*") —
// no framer-motion at boot so the loader stays lightweight. Reduced-motion
// users get static frames via the global prefers-reduced-motion override,
// and the callout rotation itself is frozen on the first line via
// useReducedMotion() below.

import { useEffect, useState } from "react";

import { BrandLogo } from "@/components/brand/BrandMark";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/**
 * Short, punchy Metrix callout lines that cycle while real data loads.
 * Kept under ~48 characters so each line either fits on a single row or
 * wraps into two balanced lines (text-wrap: balance) — never one long line
 * plus a short orphan word.
 */
const CALLOUTS = [
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
const FADE_MS = 380;

export function MetrixBootLoader() {
  const reducedMotion = useReducedMotion();
  const [calloutIndex, setCalloutIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (reducedMotion) return;
    let swapTimer: number;
    const cycleTimer = window.setInterval(() => {
      setVisible(false);
      swapTimer = window.setTimeout(() => {
        setCalloutIndex((i) => (i + 1) % CALLOUTS.length);
        setVisible(true);
      }, FADE_MS);
    }, READ_MS + FADE_MS);
    return () => {
      window.clearInterval(cycleTimer);
      window.clearTimeout(swapTimer);
    };
  }, [reducedMotion]);

  return (
    <div
      className="h-screen w-screen mx-app-bg flex items-center justify-center px-6"
      role="status"
      aria-busy="true"
      aria-label="Loading Metrix data"
    >
      {/* Logo anchors the left edge of the text as one tight module — the
          text column has a fixed width (not flex-fill) sized to match how
          wide a balanced two-line callout actually renders, so the progress
          bar underneath lines up flush with the text's right edge instead
          of trailing off into empty space past it. Safe-area padding lives
          on the outer centering wrapper (not here) so it never eats into
          this row's own fixed width and force the text column to shrink. */}
      <div className="flex flex-col gap-3 w-[19rem] max-w-full">
        <div className="flex items-center gap-4">
          {/* Glowing logo core with a subtle breathing pulse — no orbital ring.
              Sized up relative to the text so it reads as the dominant anchor,
              not a small icon beside the copy. */}
          <div className="relative w-24 h-24 shrink-0 grid place-items-center">
            <span className="mx-boot-core-glow" aria-hidden="true" />
            <BrandLogo className="w-16 h-16 mx-boot-logo-pulse relative" />
          </div>

          {/* Fixed width + height, shrink-0 so a tight viewport can never
              compress this below its intended width (which would force a
              3rd wrapped line) — no layout jump between callouts, and the
              column never grows wider than a callout actually needs, so it
              doesn't leave the progress bar overshooting past the visible
              text. Left-aligned so a wrapped two-line callout keeps one
              steady reading edge, anchored to the logo. Height matches the
              logo box so the text block is vertically centered against it. */}
          <div className="h-24 w-48 shrink-0 flex items-center" aria-hidden="true">
            <span
              className="mx-boot-callout block w-full text-left text-[13px] font-normal leading-snug tracking-normal text-text-secondary"
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? "translateY(0)" : "translateY(4px)",
                textWrap: "balance",
              }}
            >
              {CALLOUTS[calloutIndex]}
            </span>
          </div>
        </div>

        <div className="mx-boot-track" aria-hidden="true">
          <span className="mx-boot-fill" />
        </div>
      </div>
    </div>
  );
}
