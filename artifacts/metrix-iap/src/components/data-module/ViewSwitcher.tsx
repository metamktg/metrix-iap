// ─── View switcher ────────────────────────────────────────────────────
//
// Phase 3 §02's control: "a view switcher across the shapes that data actually
// supports", with the acceptance line "only offer views their data shape
// actually supports".
//
// The interesting decision is what to do with an unsupported view. Hiding it
// is the obvious move and the wrong one: the reader then cannot tell whether
// Funnel is missing because this data has no stages or because someone forgot
// to build it, and "why can't I see a funnel here?" becomes a support ticket.
//
// So every view is always present, and an unsupported one is disabled with
// the reason attached. The reasons live in lib/data-module/viewSupport.ts
// beside the table itself, which is also what makes them testable — the suite
// asserts that every exclusion carries an explanation, not just a false.

import {
  TrendingUp, BarChart3, Layers, Filter, Grid3x3, Table2,
} from "lucide-react";
import { VIEW_LABEL, whyNot, type DataShape, type DataView } from "@/lib/data-module/viewSupport";

const ICON: Record<DataView, typeof TrendingUp> = {
  trend: TrendingUp,
  compare: BarChart3,
  breakdown: Filter,
  funnel: Layers,
  map: Grid3x3,
  table: Table2,
};

export interface ViewSwitcherProps {
  /** Which shape is on screen — decides what is offered. */
  shape: DataShape;
  /** Views to render, in order. Defaults to all six. */
  views?: DataView[];
  value: DataView;
  onChange: (v: DataView) => void;
  /** Names the thing being viewed, for the group's accessible label. */
  label?: string;
}

export function ViewSwitcher({
  shape,
  views = ["trend", "compare", "breakdown", "funnel", "map", "table"],
  value,
  onChange,
  label = "View",
}: ViewSwitcherProps) {
  return (
    <div
      role="group"
      aria-label={`${label} · chart type`}
      // Outer rail rounded-xl (12px) with p-1 (4px) puts the inner buttons at
      // rounded-lg (8px): concentric, not the same radius as the rail.
      // Scrolls rather than overflowing: six views is 508px, wider than a
      // phone. A segmented control that scrolls is the standard move; one
      // that pushes the page sideways is a bug.
      className="flex items-center gap-0.5 rounded-xl bg-input/30 p-1 max-w-full
                 overflow-x-auto overscroll-x-contain [scrollbar-width:none]
                 [&::-webkit-scrollbar]:hidden"
    >
      {views.map((v) => {
        const reason = whyNot(shape, v);
        const disabled = reason !== null;
        const active = value === v;
        const Icon = ICON[v];
        return (
          <button
            key={v}
            type="button"
            onClick={() => !disabled && onChange(v)}
            disabled={disabled}
            aria-pressed={active}
            // The reason is on the control itself, so it is reachable by
            // hover, by long-press and by a screen reader — not only in a
            // tooltip a keyboard user never opens.
            title={reason ?? undefined}
            aria-describedby={undefined}
            className={`h-10 px-2.5 inline-flex items-center gap-1.5 rounded-lg text-caption shrink-0
                        transition-[background-color,color,scale] duration-150 ease-[var(--mx-ease)]
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                        ${
                          disabled
                            ? "text-muted-foreground/75 cursor-not-allowed"
                            : active
                              ? "bg-primary/20 text-foreground active:scale-[0.96]"
                              : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.04] active:scale-[0.96]"
                        }`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{VIEW_LABEL[v]}</span>
            {disabled && <span className="sr-only">, unavailable: {reason}</span>}
          </button>
        );
      })}
    </div>
  );
}
