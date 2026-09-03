// ─── Tab rail ─────────────────────────────────────────────────────────
//
// In-page section switching. There were four of these — ModuleTabs in
// shared.tsx, and inline copies in ActionQueueView, RecommendationDeck and
// CreativeExpandDialog — at three different heights, three different type
// roles, and three different ideas about what a count looks like.
//
// The divergence was not only cosmetic. None of the four was a tablist:
//
//   · No arrow-key navigation. A tab rail is a single stop in the tab order
//     with left/right moving between tabs — that is the pattern every
//     screen reader announces and every keyboard user expects. All four
//     made every tab its own tab stop and gave the arrow keys nothing,
//     so a five-tab rail cost five presses to walk past.
//   · No role. Nothing told assistive tech these were alternatives to each
//     other rather than five unrelated buttons.
//   · Three of the four were 36px tall, under the 40px hit-area floor, and
//     three had no scroll container at all — on a 390px phone a four-tab
//     rail pushed the whole page sideways.
//
// The active tab is marked with aria-selected AND an underline, never colour
// alone.
//
// THE UNDERLINE TRAVELS. It used to be a border on whichever button was
// active, so switching tabs made it vanish from one place and appear in
// another — and the eye has to re-find it, every time, on every rail in the
// product. A shared-layout indicator moves between tabs instead, so the
// reader is led to the new section rather than having to locate it. It is a
// spring rather than a tween because the distance varies with tab width and
// a fixed duration reads slow across a short hop and abrupt across a long
// one.
//
// The layoutId is per-INSTANCE (useId). Two rails on one page sharing an id
// would animate their indicators into each other across the layout — the
// classic shared-layout bug, and this app routinely renders a module rail
// above a panel rail.

import { useId, useRef, type KeyboardEvent, type ComponentType } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { SPRING_SNAPPY } from "@/lib/motion";

export interface TabItem<T extends string> {
  id: T;
  label: string;
  /** Omit when there is nothing to count. 0 renders — it is a real answer. */
  count?: number | null;
  Icon?: ComponentType<{ className?: string }>;
  /** Disables the tab and explains why. A hidden tab is a support ticket. */
  disabledReason?: string;
}

export interface TabRailProps<T extends string> {
  tabs: TabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  /** Names the group for assistive tech — "Queue status", "Report section". */
  label: string;
  /** Full-bleed rails inside a padded module pass their own padding. */
  className?: string;
}

export function TabRail<T extends string>({
  tabs, active, onChange, label, className = "",
}: TabRailProps<T>) {
  const railRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const indicatorId = `tabrail-${useId()}`;

  const move = (e: KeyboardEvent<HTMLDivElement>) => {
    const usable = tabs.filter((t) => !t.disabledReason);
    if (usable.length === 0) return;
    const at = usable.findIndex((t) => t.id === active);
    const step =
      e.key === "ArrowRight" ? 1 :
      e.key === "ArrowLeft" ? -1 :
      e.key === "Home" ? -Infinity :
      e.key === "End" ? Infinity : 0;
    if (step === 0) return;
    e.preventDefault();
    const next =
      step === -Infinity ? 0 :
      step === Infinity ? usable.length - 1 :
      // Wrapping is correct for a tablist — it is a ring, not a list.
      (at + step + usable.length) % usable.length;
    const id = usable[next]!.id;
    onChange(id);
    railRef.current?.querySelector<HTMLElement>(`[data-tab="${id}"]`)?.focus();
  };

  return (
    <div
      ref={railRef}
      role="tablist"
      aria-label={label}
      onKeyDown={move}
      className={`flex items-center gap-0 border-b border-border/40 max-w-full
                  overflow-x-auto overscroll-x-contain [scrollbar-width:none]
                  [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {tabs.map((t) => {
        const on = t.id === active;
        const off = Boolean(t.disabledReason);
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            data-tab={t.id}
            aria-selected={on}
            disabled={off}
            title={t.disabledReason}
            // Roving tabindex: one stop for the whole rail.
            tabIndex={on ? 0 : -1}
            onClick={() => !off && onChange(t.id)}
            className={`flex items-center gap-1.5 h-10 px-3 shrink-0 whitespace-nowrap
                        text-body font-body font-medium border-b-2 -mb-px
                        transition-[color,border-color,scale] duration-150 ease-[var(--ease-out)]
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-t-lg
                        relative border-transparent
                        ${
                          off
                            ? "text-muted-foreground/75 cursor-not-allowed"
                            : on
                              ? "text-foreground active:scale-[0.96]"
                              : "text-muted-foreground/75 hover:text-foreground active:scale-[0.96]"
                        }`}>
            {on && !off && (
              <motion.span
                layoutId={indicatorId}
                // Under reduced motion the indicator still MOVES — it just
                // arrives instantly. Dropping it entirely would take away the
                // only non-colour marker of which tab is active.
                transition={reduced ? { duration: 0 } : SPRING_SNAPPY}
                className="absolute inset-x-0 -bottom-0.5 h-0.5 rounded-full bg-primary"
                aria-hidden
              />
            )}
            {t.Icon && <t.Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
            <span>{t.label}</span>
            {t.count != null && (
              // One count treatment for every rail. It used to be a plain
              // mono number in one place and a status-tinted pill in another,
              // where the tint claimed a verdict on the bucket — a green "3"
              // beside "Dismissed" is not good news.
              <span
                className={`text-micro tabular-nums px-1.5 py-0.5 rounded-full
                            ${on ? "bg-primary/15 text-interactive" : "bg-foreground/[0.06] text-muted-foreground/75"}`}
              >
                {t.count}
              </span>
            )}
            {off && <span className="sr-only"> — unavailable: {t.disabledReason}</span>}
          </button>
        );
      })}
    </div>
  );
}
