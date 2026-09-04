// The progress of a run that is actually running.
//
// Three surfaces poll a background job and draw a bar from it — manual
// analysis, strategy/brief generation, and the loop command chain — and all
// three drew the same static bar with the same static label. Two problems,
// both of them about honesty rather than polish:
//
//   1. A STATIC BAR READS AS A STUCK BAR. These runs poll on a 1–2.5s tick
//      and a stage can hold for twenty seconds. In between, the bar does not
//      move and the label does not change, which is indistinguishable from a
//      job that has died. The usual fix is to creep the percentage forward on
//      a timer — inventing progress nobody measured — and this does not do
//      that. A SWEEP runs along the filled part instead: it says "still
//      working" without claiming a number, so the bar only ever moves to a
//      figure the server actually reported.
//
//   2. THE STAGE ADVANCE WAS INVISIBLE. The label swapped instantly, so the
//      one moment worth noticing in a 30–90 second wait — Parse finishing,
//      Aggregate starting — happened between two frames. It animates on
//      change now, keyed on the stage text, so the advance is legible.
//
// The reference for both is Watermelon's labeled-progress-indicator, which
// rotates its labels on a timer because it is a demo with nothing real to
// report. Here the label changes when the STAGE changes and at no other time.
// The mechanic is borrowed; the fabrication is not.
//
// A percentage of null renders as "—", never as 0%. Those are different
// claims: 0% is a measurement, null is the absence of one.

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@workspace/command-deck/lib/utils";
import { TYPE } from "@/pages/metrix/typography";
import { DUR_MED, EASE } from "@/lib/motion";

export type RunPhase = "running" | "success" | "error";

export interface RunProgressProps {
  phase: RunPhase;
  /** The server's own stage text. Not interpolated, not guessed. */
  stage?: string | null;
  /** The server's own percentage. null renders as "—", never as 0. */
  pct?: number | null;
  /** Shown in place of the stage once the run has finished. */
  doneLabel?: string;
  className?: string;
  "data-testid"?: string;
}

const FILL: Record<RunPhase, string> = {
  running: "bg-primary/70",
  success: "bg-status-success/70",
  error: "bg-status-danger/70",
};

export function RunProgress({
  phase,
  stage,
  pct,
  doneLabel = "Complete",
  className,
  "data-testid": testId,
}: RunProgressProps) {
  const reduced = useReducedMotion();
  const running = phase === "running";
  // A finished run is at 100 by definition — that is not an invented number,
  // it is what "finished" means. An unfinished one shows only what was
  // reported.
  const measured = phase === "success" ? 100 : typeof pct === "number" ? pct : null;
  const label = running ? stage || "Starting…" : doneLabel;

  return (
    <div className={cn("space-y-1.5", className)} data-testid={testId}>
      <div className={cn("flex items-center justify-between gap-2", TYPE.label)}>
        {/* mode="wait" so the outgoing stage clears before the incoming one
            arrives. Crossfading two stage names on top of each other for
            140ms is how a reader ends up unsure which one they just saw. */}
        <span className="relative min-w-0 flex-1 truncate">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={label}
              className="block truncate"
              initial={reduced ? false : { opacity: 0, y: 6, filter: "blur(3px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6, filter: "blur(3px)" }}
              transition={reduced ? { duration: 0 } : { duration: DUR_MED, ease: EASE }}
            >
              {label}
            </motion.span>
          </AnimatePresence>
        </span>
        <span className="tabular-nums shrink-0">
          {measured == null ? "–" : `${Math.round(measured)}%`}
        </span>
      </div>

      <div
        className="relative h-1.5 w-full rounded-full bg-foreground/[0.06] overflow-hidden"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        // Omitted when unmeasured: an indeterminate progressbar is precisely
        // what "we have no number yet" means to assistive tech, and reporting
        // 0 there would be the same lie told accessibly.
        aria-valuenow={measured ?? undefined}
      >
        {measured != null && (
          <motion.div
            className={cn("relative h-full rounded-full overflow-hidden", FILL[phase])}
            initial={false}
            animate={{ width: `${Math.max(0, Math.min(100, measured))}%` }}
            transition={reduced ? { duration: 0 } : { duration: 0.7, ease: EASE }}
          >
            {/* The sweep. Only while running, only inside the filled part —
                a sweep over empty track would read as progress that has not
                happened. */}
            {running && !reduced && (
              <motion.span
                className="absolute inset-y-0 w-1/3 bg-foreground/20"
                aria-hidden
                initial={{ x: "-100%" }}
                animate={{ x: "400%" }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
              />
            )}
          </motion.div>
        )}

        {/* Running with no number yet: an indeterminate shuttle rather than an
            empty track, which would read as 0%. */}
        {measured == null && running && !reduced && (
          <motion.span
            className="absolute inset-y-0 w-1/4 rounded-full bg-primary/50"
            aria-hidden
            initial={{ x: "-100%" }}
            animate={{ x: "400%" }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
      </div>
    </div>
  );
}
