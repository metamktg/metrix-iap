// ─── IAP loop stepper ──────────────────────────────────────────────────
// Canvas-accurate visual for the 5-stage loop (Data → Analysis → Strategy
// → Briefs → Report): a 22px circle per stage (checkmark when done, number
// when not) connected by a 1px line, no stage after the last. Pure/
// presentational — callers derive `done` from real per-account data and
// supply the click handler (LoopCommandChain opens its Command Hub;
// ManagerOverview — which has no single account to hub into — navigates
// to the aggregate loop page instead).
//
// The stage-indicator circle is aria-hidden so a stage button's accessible
// name stays exactly its label ("Analysis", "Strategy", …) — existing
// LoopCommandChain tests query stage buttons by that exact accessible name.

import { Check } from "lucide-react";
import { cn } from "@workspace/command-deck/lib/utils";

export interface LoopStepperStage {
  key: string;
  label: string;
  done: boolean;
  /** Prerequisite unmet — button is genuinely non-interactive (disabled). */
  locked?: boolean;
  /** Most recent run for this stage ended in error and hasn't been
   *  superseded — label swaps to "Failed"; stays clickable (reopen to retry). */
  failed?: boolean;
  /** Generated before the latest upstream data — real signal beyond the
   *  canvas's static mock, kept as a color accent on the stage button. */
  stale?: boolean;
  /** A run is currently in flight for this stage. */
  running?: boolean;
}

export function LoopStepper({
  stages,
  onSelect,
}: {
  stages: LoopStepperStage[];
  onSelect: (key: string) => void;
}) {
  // The first not-done stage is "current" — a linear read of the loop that
  // matches how the product actually gates each stage on the one before it.
  const currentIdx = stages.findIndex((s) => !s.done);

  return (
    <div className="flex items-center">
      {stages.map((s, i) => {
        const { done, locked = false, failed = false, stale = false, running = false } = s;
        const cur = !done && i === currentIdx;

        return (
          <div key={s.key} className="flex items-center">
            <button
              type="button"
              disabled={locked}
              onClick={() => onSelect(s.key)}
              className={cn(
                "flex flex-col items-center gap-1.5 px-1 py-0.5 rounded-lg transition-colors",
                locked ? "opacity-40 cursor-not-allowed" : "hover:bg-white/[0.04]",
                stale && !failed && "border border-orange-400/30",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "w-[22px] h-[22px] rounded-full flex items-center justify-center text-micro font-bold leading-none border transition-colors",
                  failed
                    ? "bg-red-400/15 border-transparent text-red-400"
                    : running
                      ? "bg-amber-400/15 border-transparent text-amber-400"
                      : done
                        ? "bg-primary/20 border-transparent text-interactive"
                        : cur
                          ? "bg-primary border-transparent text-background"
                          : "bg-transparent border-border/50 text-muted-foreground/40",
                )}
              >
                {done ? <Check className="w-3 h-3" /> : i + 1}
              </span>
              <span
                className={cn(
                  "text-micro font-semibold uppercase tracking-wider leading-none whitespace-nowrap transition-colors",
                  failed
                    ? "text-red-400/90"
                    : cur
                      ? "text-foreground"
                      : done
                        ? "text-foreground/60"
                        : "text-muted-foreground/40",
                )}
              >
                {failed ? "Failed" : s.label}
              </span>
            </button>
            {i < stages.length - 1 && (
              <span
                aria-hidden="true"
                className={cn("w-6 h-px mx-1 mb-3.5 shrink-0 transition-colors", done ? "bg-primary/45" : "bg-border/35")}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
