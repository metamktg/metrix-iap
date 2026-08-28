// Slide to confirm — for the actions that cannot be taken back.
//
// WHY A SLIDER AND NOT A BUTTON
// This product has several actions that DESTROY data as a normal part of
// working correctly, and every one of them currently sits behind a plain
// button one click away:
//
//   · Running manual analysis is an idempotent REBUILD, not an upsert. Each
//     rollup table is cleared for the run's [dateStart, dateEnd] window
//     immediately before its insert. Re-running a window replaces the rows
//     that were there. That is the designed behaviour and it is correct —
//     but "correct" and "reversible" are different words.
//   · Generating strategy or briefs REPLACES every generated row of that
//     kind for the account. Not merged, replaced.
//   · Deleting a report removes the document snapshot History reproduces
//     from, and there is no second copy.
//
// A confirmation dialog is the usual answer and it is a bad one: it trains
// people to click through. The second click is in the same place as the
// first, arrives half a second later, and carries no information about what
// is about to happen. Muscle memory defeats it entirely.
//
// A slider cannot be defeated by muscle memory, because the gesture is
// continuous and takes about 400ms of deliberate travel. More importantly it
// has somewhere to put the CONSEQUENCE: the track holds a sentence naming
// exactly what will be replaced, and that sentence is under the reader's
// thumb for the whole gesture rather than flashing past in a dialog.
//
// AUTHORITY
// `consequence` is required and it is not decoration. A slider whose track
// says "Are you sure?" is a dialog with extra steps. It must name the
// specific, counted, scoped thing — "Replaces 1,240 rows for Aug 1–28" —
// which means the CALLER has to know that number, which means somebody had
// to compute it. That requirement is the point. If the count is genuinely
// unknown the caller says so in those words; it does not get to omit it.
//
// WHAT IT IS NOT
// Not for ordinary actions. A slider on "Apply filter" is theatre and it
// devalues the ones that matter — the first time somebody drags one of
// these without reading, the control has failed. Use a button. This is for
// the small set of actions that replace or delete real data.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useReducedMotion, useTransform, type PanInfo } from "framer-motion";
import { ChevronsRight, Check, Loader2 } from "lucide-react";
import { cn } from "@workspace/command-deck/lib/utils";
import { TYPE } from "@/pages/metrix/typography";
import { SPRING } from "@/lib/motion";

/** Travel, as a fraction of the track, that commits the action. */
const COMMIT_AT = 0.9;

/** Thumb size in px. Also the track's inner height, so the two are concentric. */
const THUMB = 36;

export type ActionSliderTone = "danger" | "warning" | "primary";

const TONE: Record<ActionSliderTone, { fill: string; text: string; ring: string }> = {
  danger: { fill: "bg-status-danger/18", text: "text-status-danger", ring: "border-status-danger/40" },
  warning: { fill: "bg-status-warning/18", text: "text-status-warning", ring: "border-status-warning/40" },
  primary: { fill: "bg-primary/18", text: "text-interactive", ring: "border-primary/40" },
};

export interface ActionSliderProps {
  /** The verb, in the imperative. "Run analysis", "Replace briefs". */
  label: string;
  /**
   * What this will do to existing data, counted and scoped. Required.
   * "Replaces 1,240 rows for Aug 1–28". If the count is genuinely not
   * known, say that in those words — do not leave it out.
   */
  consequence: string;
  onConfirm: () => void;
  tone?: ActionSliderTone;
  disabled?: boolean;
  /** True while the action is in flight. The control locks and reports it. */
  busy?: boolean;
  /** Replaces the label once the action has succeeded. */
  doneLabel?: string;
  done?: boolean;
  className?: string;
  "data-testid"?: string;
}

export function ActionSlider({
  label,
  consequence,
  onConfirm,
  tone = "danger",
  disabled = false,
  busy = false,
  doneLabel = "Done",
  done = false,
  className,
  "data-testid": testId,
}: ActionSliderProps) {
  const reduced = useReducedMotion();
  const trackRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const [maxX, setMaxX] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const locked = disabled || busy || done || confirmed;

  // The track's travel is measured, not assumed: this sits in a card whose
  // width changes with the viewport and with the sidebar's state, and a
  // hardcoded travel would either commit early on a narrow screen or be
  // unreachable on a wide one.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => setMaxX(Math.max(0, el.clientWidth - THUMB - 8));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const progress = useTransform(x, [0, Math.max(1, maxX)], [0, 1], { clamp: true });
  // The prompt fades out as the thumb covers it, so the reader is never
  // squinting at text through a moving object.
  const promptOpacity = useTransform(progress, [0, 0.55], [1, 0], { clamp: true });
  // The trail runs from the track's left edge to the thumb's right edge, so
  // it always reads as one filled shape rather than a bar with the thumb
  // floating past its end.
  const trailWidth = useTransform(x, (v) => v + THUMB);

  const fire = useCallback(() => {
    if (locked) return;
    setConfirmed(true);
    onConfirm();
  }, [locked, onConfirm]);

  const onDragEnd = useCallback(
    (_: unknown, _info: PanInfo) => {
      if (maxX <= 0) return;
      // Distance only — no velocity arm, deliberately. A flick is exactly
      // the reflex this control exists to defeat: the whole value of the
      // gesture is that it takes deliberate travel, and letting a fast
      // 60px swipe stand in for it puts the muscle-memory problem straight
      // back. Below the threshold framer springs the thumb home on its own.
      if (x.get() >= maxX * COMMIT_AT) fire();
      else x.set(0);
    },
    [maxX, x, fire],
  );

  // Keyboard parity. A control only a pointer can operate is not a control,
  // and this one gates real work. Arrow keys walk the thumb in visible
  // steps (so the gesture is still deliberate rather than one keypress),
  // End completes it, Home cancels.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (locked || maxX <= 0) return;
      const step = maxX / 6;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        const next = Math.min(maxX, x.get() + step);
        x.set(next);
        if (next >= maxX * COMMIT_AT) fire();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        x.set(Math.max(0, x.get() - step));
      } else if (e.key === "End") {
        e.preventDefault();
        x.set(maxX);
        fire();
      } else if (e.key === "Home" || e.key === "Escape") {
        e.preventDefault();
        x.set(0);
      }
      // Enter and Space are NOT bound. They are the keys muscle memory
      // reaches for, and binding them would make this a button wearing a
      // slider's clothes.
    },
    [locked, maxX, x, fire],
  );

  // A failed action re-arms the control: `busy` going false without `done`
  // means the run errored, and the reader must be able to try again.
  useEffect(() => {
    if (busy || done || !confirmed) return undefined;
    const t = window.setTimeout(() => {
      setConfirmed(false);
      x.set(0);
    }, 400);
    return () => window.clearTimeout(t);
  }, [busy, done, confirmed, x]);

  const t = TONE[tone];

  return (
    <div className={cn("w-full", className)} data-testid={testId}>
      <div
        ref={trackRef}
        className={cn(
          "relative w-full rounded-full border p-1 overflow-hidden",
          // Concentric: track radius is a pill, thumb radius is a pill, and
          // the 4px pad between them is the only gap. Nothing to mismatch.
          "bg-foreground/[0.04]",
          locked ? "border-border/40 opacity-60" : t.ring,
        )}
        style={{ height: THUMB + 8 }}
      >
        {/* The filled trail behind the thumb — the only quantitative channel. */}
        <motion.div
          className={cn("absolute inset-y-1 left-1 rounded-full", t.fill)}
          style={{ width: trailWidth }}
          aria-hidden
        />

        {/* The prompt, centred, fading under the thumb. */}
        <motion.span
          style={{ opacity: reduced ? 1 : promptOpacity }}
          className={cn(
            "absolute inset-0 flex items-center justify-center gap-1.5 pointer-events-none",
            TYPE.label,
            locked ? "text-muted-foreground" : t.text,
          )}
          aria-hidden
        >
          {done ? doneLabel : busy ? "Working…" : `Slide to ${label.toLowerCase()}`}
        </motion.span>

        <motion.div
          drag={locked ? false : "x"}
          dragConstraints={{ left: 0, right: maxX }}
          dragElastic={0}
          dragMomentum={false}
          onDragEnd={onDragEnd}
          style={{ x, width: THUMB, height: THUMB }}
          animate={done || confirmed ? { x: maxX } : undefined}
          transition={reduced ? { duration: 0 } : SPRING}
          onKeyDown={onKeyDown}
          tabIndex={locked ? -1 : 0}
          // A slider role, because that is what it is: the reader is told
          // the travel and how far along they are, not just that a button
          // exists. aria-valuetext carries the consequence so a screen
          // reader hears WHAT is about to happen before it happens.
          role="slider"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={done || confirmed ? 100 : 0}
          aria-valuetext={`${label}. ${consequence}. Right arrow to advance, End to confirm.`}
          aria-disabled={locked}
          className={cn(
            "relative z-10 grid place-items-center rounded-full",
            "bg-surface-overlay border elevation-raised",
            locked ? "border-border/40 cursor-default" : `${t.ring} cursor-grab active:cursor-grabbing`,
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
          )}
        >
          <ThumbIcon busy={busy} done={done || confirmed} tone={t.text} reduced={!!reduced} />
        </motion.div>
      </div>

      {/* The consequence. Always visible, never behind a disclosure — this
          is the one sentence the reader must not have to ask for. */}
      <p className={cn(TYPE.caption, "mt-1.5 text-pretty")}>{consequence}</p>
    </div>
  );
}

function ThumbIcon({
  busy,
  done,
  tone,
  reduced,
}: {
  busy: boolean;
  done: boolean;
  tone: string;
  reduced: boolean;
}) {
  if (busy) return <Loader2 className={cn("w-4 h-4 animate-spin", tone)} aria-hidden />;
  if (done) return <Check className={cn("w-4 h-4", tone)} aria-hidden />;
  return (
    <motion.span
      aria-hidden
      className={tone}
      // A small repeating nudge to the right: the affordance has to say
      // "drag me" without a tooltip, and on touch there is no hover to
      // carry that. Suppressed under reduced motion, where the chevrons
      // alone do the work.
      animate={reduced ? undefined : { x: [0, 2, 0] }}
      transition={reduced ? undefined : { duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
    >
      <ChevronsRight className="w-4 h-4" />
    </motion.span>
  );
}
