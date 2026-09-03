// ─── Recommendation slider ────────────────────────────────────────────
//
// A rail of direction, one tile per recommendation, on the surfaces a
// reader opens first: the account overview and each command centre.
//
// WHY A RAIL AND NOT A LIST
// These surfaces already carry the account's totals and its loop state. A
// stacked list of fifteen recommendations would push all of that below the
// fold to show the fifteenth card nobody scrolled to. A rail keeps the top
// of the page intact, shows the ranked first three, and makes the rest one
// gesture away — the ranking is the product, so the first tile matters and
// the fifteenth does not have to be free.
//
// WHAT EACH TILE MUST DO
// Face: what to do, the number that says why, and where to check it. The
// prose stays clamped, the source stays in the title attribute, and the
// link goes to the surface that holds the evidence. A tile that cannot be
// checked is an opinion with a border around it.
//
// MECHANICS (Watermelon carousel-navigator, translated)
//  · scroll-snap rail, real overflow — a touch drag works with no JS.
//  · arrows page by a tile width, disabled at each end rather than hidden,
//    so the control never disappears under the reader's cursor.
//  · the rail is keyboard-reachable and its tiles are links, so Tab walks
//    them in order and the arrows are a convenience, never the only path.
//  · reduced motion: smooth scrolling becomes instant.

import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, Zap } from "lucide-react";
import { cn } from "@workspace/command-deck/lib/utils";
import { TYPE } from "@/pages/metrix/typography";
import { deriveLabel, DetailReveal, CrossLink } from "@/pages/metrix/shared";
import type { DerivedRecommendation } from "@/lib/data/recommendations";

const KIND_STYLE: Record<string, string> = {
  avoid: "border-status-danger/25 bg-status-danger/10 text-status-danger",
  scale: "border-status-success/25 bg-status-success/10 text-status-success",
  budget: "border-primary/25 bg-primary/10 text-interactive",
  investigate: "border-status-warning/25 bg-status-warning/10 text-status-warning",
  optimize: "border-status-warning/25 bg-status-warning/10 text-status-warning",
  validate: "border-border/40 bg-muted text-muted-foreground/75",
  test: "border-primary/25 bg-primary/10 text-interactive",
  data: "border-status-warning/25 bg-status-warning/10 text-status-warning",
};

const KIND_LABEL: Record<string, string> = {
  avoid: "Stop",
  scale: "Scale",
  budget: "Budget",
  investigate: "Investigate",
  optimize: "Optimize",
  validate: "Validate",
  test: "Test",
  data: "Data",
};

/** The card's kind, read off the derived id (`derived:<kind>:…`). */
function recommendationKind(rec: DerivedRecommendation): string {
  if (!rec.derived) return "generated";
  return rec.id.split(":")[1] ?? "";
}

function Tile({ rec }: { rec: DerivedRecommendation }) {
  const kind = recommendationKind(rec);
  const kindLabel = KIND_LABEL[kind] ?? "From the loop";
  return (
    <article
      data-testid="recommendation-tile"
      data-kind={kind}
      className={cn(
        "snap-start shrink-0 w-[268px] rounded-xl border border-border/40 bg-foreground/[0.02] p-3.5",
        "flex flex-col gap-2 transition-[border-color,background-color] duration-150",
        "hover:border-primary/30 hover:bg-foreground/[0.04]",
      )}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            TYPE.microLabel,
            "border px-1.5 py-0.5 rounded-full font-semibold normal-case tracking-normal leading-none",
            KIND_STYLE[kind] ?? "border-border/40 bg-muted text-muted-foreground/75",
          )}
        >
          {kindLabel}
        </span>
        {rec.stage != null && (
          <span
            aria-hidden="true"
            title={`IAP loop stage ${rec.stage}`}
            className="text-micro-num tabular-nums w-4 h-4 rounded-full border border-border/50 text-muted-foreground/75 flex items-center justify-center shrink-0"
          >
            {rec.stage}
          </span>
        )}
        {/* Provenance is never decoration: the tile says which part of the
            account's JSON produced it, on hover and to assistive tech. */}
        <span className="ml-auto text-micro text-muted-foreground/75 truncate max-w-[96px]" title={`Source · ${rec.source}`}>
          {rec.source.split(".")[0]}
        </span>
      </div>

      <h4 className={cn(TYPE.body, "font-medium text-foreground/90 leading-snug")} title={rec.title}>
        {deriveLabel(rec.title, 68)}
      </h4>

      {rec.metric ? (
        <div className="flex items-baseline gap-1.5" data-testid="recommendation-metric">
          <span className="text-title text-foreground metric-num tabular-nums leading-none">
            {rec.metric.value}
          </span>
          <span className={cn(TYPE.microLabel, "text-muted-foreground/75")}>{rec.metric.label}</span>
        </div>
      ) : (
        // No number is a fact about the rows, not a gap to paper over.
        <div className={cn(TYPE.caption, "text-muted-foreground/75 leading-snug")} data-testid="recommendation-no-metric">
          No measured figure in this account's rows
        </div>
      )}

      <DetailReveal
        eyebrow="Why this action"
        label={deriveLabel(rec.rationale, 52)}
        labelClassName={cn(TYPE.caption, "text-muted-foreground/75 leading-snug")}
        testId={`recommendation-why-${rec.id}`}
        sections={[
          { label: "What the rows say", text: rec.rationale },
          { label: "Recommended action", text: rec.recommendedAction },
          { label: "Provenance", text: `${rec.source} · confidence ${rec.confidence}` },
        ]}
      />

      {rec.href && (
        <div className="mt-auto pt-1">
          <CrossLink to={rec.href} label={rec.hrefLabel ?? "See the evidence"} />
        </div>
      )}
    </article>
  );
}

export function RecommendationSlider({
  recs,
  title = "What the data says to do next",
  emptyNote,
  className,
}: {
  recs: DerivedRecommendation[];
  title?: string;
  /** Why there is nothing — the account's own loop_status note beats generic copy. */
  emptyNote?: string | null;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const railRef = useRef<HTMLDivElement | null>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const sync = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 2);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    sync();
  }, [sync, recs.length]);

  const page = (dir: -1 | 1) => {
    const el = railRef.current;
    if (!el) return;
    // One tile plus its gap, so a press always lands on a tile edge.
    el.scrollBy({ left: dir * 280, behavior: reduced ? "auto" : "smooth" });
  };

  if (recs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/40 px-5 py-4" data-testid="recommendation-slider-empty">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Zap className="w-3.5 h-3.5 text-muted-foreground/75" />
          <span className={cn(TYPE.label, "uppercase tracking-widest text-muted-foreground/75")}>{title}</span>
        </div>
        <p className={cn(TYPE.body, "text-muted-foreground/75 leading-relaxed")}>
          {emptyNote ?? "This account has no strategy, findings or hypotheses yet — run the analysis to produce them."}
        </p>
      </div>
    );
  }

  return (
    <section
      className={cn("space-y-2", className)}
      aria-label={title}
      data-testid="recommendation-slider"
    >
      <div className="flex items-center gap-2">
        <Zap className="w-3.5 h-3.5 text-interactive/70 shrink-0" />
        <span className={cn(TYPE.label, "uppercase tracking-widest text-muted-foreground/75")}>{title}</span>
        <span className={cn(TYPE.microLabel, "text-muted-foreground/75 tabular-nums")} data-testid="recommendation-count">
          {recs.length}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => page(-1)}
            disabled={atStart}
            aria-label="Previous recommendations"
            className="pressable w-10 h-10 flex items-center justify-center rounded-lg border border-border/40 text-muted-foreground/75 hover:text-foreground hover:bg-foreground/[0.04] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => page(1)}
            disabled={atEnd}
            aria-label="More recommendations"
            className="pressable w-10 h-10 flex items-center justify-center rounded-lg border border-border/40 text-muted-foreground/75 hover:text-foreground hover:bg-foreground/[0.04] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div
        ref={railRef}
        data-testid="recommendation-rail"
        onScroll={sync}
        className="flex gap-3 overflow-x-auto overscroll-x-contain snap-x snap-mandatory pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {recs.map((r) => (
          <Tile key={r.id} rec={r} />
        ))}
      </div>
    </section>
  );
}
