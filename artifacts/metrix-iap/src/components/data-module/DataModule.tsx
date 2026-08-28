// One frame for every piece of analysed data: what it is, how you are
// looking at it, and what it is scoped to.
//
// WHAT WAS MISSING
// ViewSwitcher — the Trend / Compare / Breakdown / Funnel / Map / Table
// control, complete with per-shape support reasons — has existed for a while
// and is used in exactly ZERO page views. It appears in the design lab and in
// one test. Every real surface picks a single rendering and hard-codes it, so
// a reader who wants the same numbers as a trend instead of a table has to
// navigate somewhere else, and often cannot.
//
// This is the frame that puts it back in front of them, and it carries the
// three things a data panel has to answer before its numbers mean anything:
//
//   1. WHAT AM I LOOKING AT?     the title, at heading weight, top left
//   2. HOW AM I LOOKING AT IT?   the view tabs, top right
//   3. WHAT IS IT SCOPED TO?     the config chips, under the data
//
// THE CHIPS ARE THE LOAD-BEARING PART
// "$18.40" means nothing on its own. "$18.40 · Metric CPA · Variable Hook
// family · Segment Age 45-54" is a finding. Those three facts are usually
// spread across a filter row above, a tab somewhere else and a date control
// in the page header, so reading a number correctly means reassembling its
// scope from three places — and screenshots, exports and shared links carry
// none of it.
//
// So scope travels WITH the data, on the same card, under the chart. It is
// not a filter control and not behind a disclosure: it is the caption that
// makes the number a fact. A module that cannot state its own scope is
// showing numbers it cannot vouch for, which is why `scope` is required and
// an empty array is rejected in development.
//
// WHY THE TITLE IS AN H3 AND THE CHIPS ARE 13px
// A module title outranks everything inside its card, and the chips are the
// smallest thing that still gets read. That is the whole optical hierarchy of
// this component: one bold 24px heading, one row of 13px chips, and the data
// between them at 15px. Nothing else competes.

import { useId, type ReactNode } from "react";
import { cn } from "@workspace/command-deck/lib/utils";
import { HEADING, TYPE } from "@/pages/metrix/typography";
import { SectionInfoIcon } from "@/pages/metrix/shared";
import { ViewSwitcher } from "./ViewSwitcher";
import type { DataShape, DataView } from "@/lib/data-module/viewSupport";

export interface ScopeChip {
  /** The dimension — "Metric", "Variable", "Segment", "Window". */
  label: string;
  /** The value it is set to — "CPA", "Hook family", "Age 45-54". */
  value: string;
  /** Marks a chip the reader set themselves, rather than a default. */
  active?: boolean;
}

export interface DataModuleProps {
  title: string;
  /** The data's shape, which decides which views are offered vs disabled. */
  shape: DataShape;
  view: DataView;
  onViewChange: (v: DataView) => void;
  /** Restrict the offered views. Defaults to all six. */
  views?: DataView[];
  /**
   * What the numbers below are scoped to. Required, and never empty: a
   * module that cannot state its own scope is showing numbers it cannot
   * vouch for.
   */
  scope: ScopeChip[];
  /**
   * One sentence explaining what the module measures, shown behind the same
   * info affordance SectionCard uses.
   *
   * This is not optional garnish. Converting a SectionCard to a DataModule
   * originally dropped its `right={<SectionInfoIcon tip=… />}` on the floor,
   * which silently removed the only explanation of what "Efficiency by result
   * event" meant. A reface that deletes the help text is a regression wearing
   * a redesign's clothes.
   */
  info?: string;
  /** Optional controls beside the view switcher — a sort, a limit. */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
}

export function DataModule({
  title,
  shape,
  view,
  onViewChange,
  views,
  scope,
  info,
  actions,
  children,
  className,
  "data-testid": testId,
}: DataModuleProps) {
  const titleId = `datamodule-${useId()}`;

  if (import.meta.env.DEV && scope.length === 0) {
    // Loud in development, invisible in production: a missing scope is a
    // correctness problem for the reader, not a crash for the user.
    console.warn(
      `DataModule "${title}" was given an empty scope. Every number under it ` +
        `is unattributed — state at minimum the metric it is measuring.`,
    );
  }

  return (
    <section
      className={cn("mx-card p-4 sm:p-5", className)}
      aria-labelledby={titleId}
      data-testid={testId}
    >
      {/* The header wraps rather than truncating: on a narrow viewport the
          view switcher drops under the title instead of squeezing it, which
          is the failure mode of every header built as a single flex row. */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 mb-4">
        {/* h2, at the section rank — NOT h3.
            A DataModule sits exactly where a SectionCard sits and holds the
            same kind of content, so ranking it a level lower made one panel's
            title visibly smaller than its neighbours' for no reason a reader
            could see, and skipped a level in the document outline. Same role,
            same rank, same size. */}
        <div className="flex items-center gap-1.5 min-w-0">
          <h2 id={titleId} className={cn(HEADING.h2, "min-w-0 truncate")}>
            {title}
          </h2>
          {info && <SectionInfoIcon tip={info} />}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {actions}
          <ViewSwitcher shape={shape} value={view} onChange={onViewChange} views={views} label={title} />
        </div>
      </div>

      {children}

      {scope.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mt-4 pt-3 border-t border-border/30">
          {scope.map((c) => (
            <span
              key={`${c.label}:${c.value}`}
              className={cn(
                TYPE.caption,
                "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border",
                c.active
                  ? "border-primary/30 bg-primary/[0.07] text-interactive"
                  : "border-border/40 bg-foreground/[0.03]",
              )}
            >
              <span className="opacity-70">{c.label}</span>
              <span aria-hidden className="opacity-40">·</span>
              <span className="font-semibold">{c.value}</span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
