// ─── Recommendation slider ────────────────────────────────────────────
//
// A rail of direction, one tile per recommendation, on the surfaces a
// reader opens first: the account overview and each command centre. On
// the overview it IS the next best action (owner, 2026-09-04): several
// ranked signals to swipe between rather than one hero card, each opening
// into the same drawer, each decidable in place.
//
// WHY A RAIL AND NOT A LIST
// These surfaces already carry the account's totals and its loop state. A
// stacked list of fifteen recommendations would push all of that below the
// fold to show the fifteenth card nobody scrolled to. A rail keeps the top
// of the page intact, shows the ranked first three, and makes the rest one
// gesture away. The ranking is the product, so the first tile matters and
// the fifteenth does not have to be free.
//
// WHAT EACH TILE MUST DO
// Face: what to do, the number that says why, one clause of the reason,
// and where to check it. The title is the way in: it opens the drawer that
// holds the whole reason, the action, the confidence and the provenance.
// When the rail is decidable (a `scopeId` is given) the tile also carries
// Add to Tray and Dismiss, sharing the deck's decision and tray stores so
// a decision here and a swipe in the deck below can never disagree; a
// decided tile leaves the rail, and once none remain the rail says so.
//
// MECHANICS (Watermelon carousel-navigator, translated)
//  · scroll-snap rail, real overflow: a touch drag works with no JS, and a
//    mouse drag on the rail's ground scrolls it too (a drag past 6 px
//    swallows the click that would otherwise land on a tile).
//  · arrows page by one tile, disabled at each end rather than hidden, so
//    the control never disappears under the reader's cursor; the page
//    dots below jump a viewport at a time and say where you are.
//  · the rail is keyboard-reachable (Left / Right / Home / End) and its
//    tiles hold real buttons, so Tab walks them in order and the arrows
//    are a convenience, never the only path.
//  · reduced motion: smooth scrolling becomes instant.

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { useReducedMotion } from "framer-motion";
import { Check, ChevronLeft, ChevronRight, X, Zap } from "lucide-react";
import { cn } from "@workspace/command-deck/lib/utils";
import { TYPE, HEADING } from "@/pages/metrix/typography";
import { deriveLabel, CrossLink, InfoTooltip } from "@/pages/metrix/shared";
import { UNMEASURED_RATIONALE, type DerivedRecommendation } from "@/lib/data/recommendations";
import { useDecisions, getDecision, setDecision } from "@/lib/data/decisionStore";
import { addToTray } from "@/lib/data/trayStore";
import { RecommendationDrawer } from "./RecommendationDrawer";
import { KIND_LABEL, KIND_STYLE, KIND_STYLE_FALLBACK, engineKindNote, recommendationKind } from "./recommendationKind";

/** Tile width and gap, in px. One step is one tile plus its gap, so a page
 *  or a snap always lands on a tile edge. */
const TILE_W = 268;
const TILE_GAP = 12;
const STEP = TILE_W + TILE_GAP;
/** A mouse that moves less than this is a click, not a drag. */
const DRAG_THRESHOLD = 6;
/** Page dots are drawn up to this many pages; beyond it the indicator alone. */
const MAX_DOTS = 8;

function Tile({
  rec,
  onOpen,
  onApprove,
  onDismiss,
}: {
  rec: DerivedRecommendation;
  onOpen: (rec: DerivedRecommendation) => void;
  onApprove?: (rec: DerivedRecommendation) => void;
  onDismiss?: (rec: DerivedRecommendation) => void;
}) {
  const kind = recommendationKind(rec);
  const kindLabel = KIND_LABEL[kind] ?? "From the loop";
  const decidable = Boolean(onApprove && onDismiss);
  return (
    <article
      data-testid="recommendation-tile"
      data-kind={kind}
      className={cn(
        "snap-start shrink-0 w-[268px] max-w-[calc(100vw-3rem)] rounded-xl border border-border/40 bg-foreground/[0.02] p-3.5",
        "flex flex-col gap-2 transition-[border-color,background-color] duration-150 ease-[var(--mx-ease)]",
        "hover:border-primary/30 hover:bg-foreground/[0.04]",
      )}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            TYPE.microLabel,
            "border px-1.5 py-0.5 rounded-full font-semibold normal-case tracking-normal leading-none",
            KIND_STYLE[kind] ?? KIND_STYLE_FALLBACK,
          )}
          {...(engineKindNote(kind) ? { title: engineKindNote(kind)! } : {})}
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

      {/* The title is the way in. A heading may hold a button (phrasing
          content); a button may not hold a heading, which is why the h4 is
          outside. The chevron is at rest, not on hover: a touch screen has
          no hover, and the affordance must exist there too. The title text
          is the button's own text node, not a span: the friction gate reads
          leaf spans as first-layer copy, and a title is a title. */}
      <h4 className={cn(TYPE.body, "font-medium leading-snug min-w-0")} title={rec.title}>
        <button
          type="button"
          data-testid="recommendation-open"
          onClick={() => onOpen(rec)}
          aria-label={`Open details: ${rec.title}`}
          className={cn(
            "pressable group/open block w-full text-left rounded-md -mx-1 px-1 py-0.5",
            "text-foreground/90 hover:text-interactive transition-colors duration-150 ease-[var(--mx-ease)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          {deriveLabel(rec.title, 68)}
          <ChevronRight className="inline-block w-3.5 h-3.5 ml-1 -mt-0.5 align-middle text-muted-foreground/75 group-hover/open:text-interactive" aria-hidden="true" />
        </button>
      </h4>

      {rec.metric ? (
        <div className="flex items-baseline gap-1.5" data-testid="recommendation-metric">
          <span className="text-title text-foreground metric-num tabular-nums leading-none">
            {rec.metric.value}
          </span>
          <span className={cn(TYPE.microLabel, "text-muted-foreground/75")}>{rec.metric.label}</span>
        </div>
      ) : kind === "test" ? null : (
        // No number is a fact about the rows, not a gap to paper over. A
        // hypothesis has a target, not a measurement, so it says nothing here.
        <div className={cn(TYPE.caption, "text-muted-foreground/75 leading-snug")} data-testid="recommendation-no-metric">
          No measured figure in this account's rows
        </div>
      )}

      {/* First layer: one complete clause of the reason. The whole reason,
          the action and the provenance are in the drawer the title opens.
          Never a paragraph on the face (owner, 2026-09-03), and not a CSS
          clamp either, which keeps the paragraph in the DOM where the
          friction gate counts it. */}
      {/* A reference the rows do not measure already says so in the number
          slot above; the same sentence as the reason would be the fact
          twice. The drawer still carries it in full. */}
      {rec.rationale !== UNMEASURED_RATIONALE && (
        <>
          {/* payload-ok: owner (2026-09-03), progressive disclosure: one clause on the face, the whole reason in the drawer the title opens */}
          <p className={cn(TYPE.caption, "text-muted-foreground/75 leading-snug")} title={rec.rationale} data-testid="recommendation-reason">
            {deriveLabel(rec.rationale, 72)}
          </p>
        </>
      )}

      <div className="mt-auto pt-1 flex items-center gap-1 flex-wrap">
        {rec.href && <CrossLink to={rec.href} label={rec.hrefLabel ?? "See the evidence"} />}
        {decidable && (
          <div className="ml-auto flex items-center gap-0.5" role="group" aria-label={`Decide: ${rec.title}`}>
            <button
              type="button"
              data-testid="recommendation-dismiss"
              onClick={() => onDismiss?.(rec)}
              aria-label={`Dismiss: ${rec.title}`}
              className={cn(
                "pressable h-8 px-2 inline-flex items-center gap-1 rounded-md", TYPE.caption,
                "font-medium text-muted-foreground/75 hover:text-foreground hover:bg-foreground/[0.05]",
                "transition-colors duration-150 ease-[var(--mx-ease)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" /> Dismiss
            </button>
            <button
              type="button"
              data-testid="recommendation-approve"
              onClick={() => onApprove?.(rec)}
              aria-label={`Add to Tray: ${rec.title}`}
              className={cn(
                "pressable h-8 px-2 inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10", TYPE.caption,
                "font-semibold text-interactive hover:bg-primary/20",
                "transition-colors duration-150 ease-[var(--mx-ease)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <Check className="w-3.5 h-3.5" aria-hidden="true" /> Add to Tray
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

export function RecommendationSlider({
  recs,
  title = "Next best actions",
  emptyNote,
  className,
  scopeId,
}: {
  recs: DerivedRecommendation[];
  title?: string;
  /** Why there is nothing: the account's own loop_status note beats generic copy. */
  emptyNote?: string | null;
  className?: string;
  /** When given, tiles carry Add to Tray and Dismiss under this scope, and a
   *  decided tile leaves the rail. Omit for a read-only rail. */
  scopeId?: string;
}) {
  const reduced = useReducedMotion();
  // Subscribing re-renders on every decision, so a decided tile leaves the
  // rail at once, here and in the deck below.
  const decisions = useDecisions();
  const visible = useMemo(
    () => (scopeId ? recs.filter((r) => getDecision(scopeId, r.id) === "pending") : recs),
    // `decisions` is the store snapshot: a new object per decision, so the
    // filter re-runs exactly when a tile's state can have changed.
    [recs, scopeId, decisions],
  );

  const railRef = useRef<HTMLDivElement | null>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const perView = useCallback(() => {
    const el = railRef.current;
    if (!el) return 1;
    return Math.max(1, Math.floor((el.clientWidth + TILE_GAP) / STEP));
  }, []);

  const sync = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 2);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
    const n = perView();
    const total = Math.max(1, Math.ceil(visible.length / n));
    setPages(total);
    setPage(Math.max(0, Math.min(total - 1, Math.round(el.scrollLeft / (n * STEP)))));
  }, [perView, visible.length]);

  useEffect(() => {
    sync();
  }, [sync]);

  useEffect(() => {
    const el = railRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => sync());
    ro.observe(el);
    return () => ro.disconnect();
  }, [sync]);

  const behavior: ScrollBehavior = reduced ? "auto" : "smooth";
  const pageBy = (dir: -1 | 1) => {
    // One tile plus its gap, so a press always lands on a tile edge.
    railRef.current?.scrollBy({ left: dir * STEP, behavior });
  };
  const goToPage = (i: number) => {
    railRef.current?.scrollTo({ left: i * perView() * STEP, behavior });
  };

  // Mouse drag on the rail's ground. Touch already scrolls natively; a
  // pointer that lands on a button is a click and is left alone.
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    if ((e.target as Element).closest("button, a, [role='button']")) return;
    const el = railRef.current;
    if (!el) return;
    drag.current = { x: e.clientX, left: el.scrollLeft, moved: false };
    el.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = railRef.current;
    if (!d || !el) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD) return;
    if (!d.moved) {
      d.moved = true;
      setDragging(true);
    }
    el.scrollLeft = d.left - dx;
  };
  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = railRef.current;
    drag.current = null;
    if (!d || !el) return;
    el.releasePointerCapture?.(e.pointerId);
    if (!d.moved) return;
    setDragging(false);
    suppressClick.current = true;
    // Settle on the nearest tile edge, the way the snap would have.
    el.scrollTo({ left: Math.round(el.scrollLeft / STEP) * STEP, behavior });
  };
  const onClickCapture = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    e.preventDefault();
    e.stopPropagation();
  };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    // Only when the rail itself has focus: a tile's button keeps its keys.
    if (e.target !== e.currentTarget) return;
    if (e.key === "ArrowRight") { pageBy(1); e.preventDefault(); }
    else if (e.key === "ArrowLeft") { pageBy(-1); e.preventDefault(); }
    else if (e.key === "Home") { railRef.current?.scrollTo({ left: 0, behavior }); e.preventDefault(); }
    else if (e.key === "End") { railRef.current?.scrollTo({ left: railRef.current.scrollWidth, behavior }); e.preventDefault(); }
  };

  const approve = useCallback(
    (rec: DerivedRecommendation) => {
      if (!scopeId) return;
      setDecision(scopeId, rec.id, "approved");
      addToTray(scopeId, {
        id: rec.id,
        kind: "recommendation",
        title: rec.title,
        sub: rec.recommendedAction,
        href: "/app/listen/recommendations",
      });
      setOpenId((id) => (id === rec.id ? null : id));
    },
    [scopeId],
  );
  const dismiss = useCallback(
    (rec: DerivedRecommendation) => {
      if (!scopeId) return;
      setDecision(scopeId, rec.id, "rejected");
      setOpenId((id) => (id === rec.id ? null : id));
    },
    [scopeId],
  );

  const openRec = openId ? recs.find((r) => r.id === openId) ?? null : null;

  if (visible.length === 0) {
    // Two honest empty states, told apart on purpose: nothing was ever
    // derived (the account's own loop note says why), or everything was
    // reviewed (approved ones are in the tray, dismissed ones in the log).
    const reviewed = Boolean(scopeId) && recs.length > 0;
    return (
      <div
        className={cn("rounded-xl border border-dashed border-border/40 px-5 py-4", className)}
        data-testid="recommendation-slider-empty"
        data-reason={reviewed ? "reviewed" : "none"}
      >
        <div className="flex items-center gap-1.5 mb-1.5">
          <Zap className="w-3.5 h-3.5 text-muted-foreground/75" aria-hidden="true" />
          <span className={cn(TYPE.label, "uppercase tracking-widest text-muted-foreground/75")}>{title}</span>
        </div>
        <p className={cn(TYPE.body, "text-muted-foreground/75 leading-relaxed")}>
          {reviewed
            ? `All ${recs.length} recommendations reviewed. Approved ones are in the tray, dismissed ones in the log below.`
            : emptyNote ?? "This account has no strategy, findings or hypotheses yet. Run the analysis to produce them."}
        </p>
      </div>
    );
  }

  return (
    <section
      className={cn("mx-module", className)}
      aria-label={title}
      data-testid="recommendation-slider"
    >
      {/* The head lives outside the rail, title left and the rail's controls
          right, the same row every module wears (owner, 2026-09-03). */}
      <div className="mx-module-head flex items-center gap-2 flex-wrap">
        <Zap className="w-3.5 h-3.5 text-interactive/70 shrink-0" aria-hidden="true" />
        <h2 className={cn(HEADING.h2, "truncate whitespace-nowrap [text-wrap:nowrap]")} title={title}>{title}</h2>
        <span className={cn(TYPE.microLabel, "tabular-nums")} data-testid="recommendation-count">
          {visible.length}
        </span>
        <InfoTooltip content="Ranked by the money each moves · every tile names its source and where to check it · approving files a task, nothing runs by itself" />
        <div className="ml-auto flex items-center gap-1.5">
          {pages > 1 && (
            <span className={cn(TYPE.microLabel, "tabular-nums")} aria-live="polite" data-testid="recommendation-page">
              {page + 1} / {pages}
            </span>
          )}
          <button
            type="button"
            onClick={() => pageBy(-1)}
            disabled={atStart}
            aria-label="Previous recommendations"
            className="pressable w-10 h-10 flex items-center justify-center rounded-lg border border-border/40 text-muted-foreground/75 hover:text-foreground hover:bg-foreground/[0.04] disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150 ease-[var(--mx-ease)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => pageBy(1)}
            disabled={atEnd}
            aria-label="More recommendations"
            className="pressable w-10 h-10 flex items-center justify-center rounded-lg border border-border/40 text-muted-foreground/75 hover:text-foreground hover:bg-foreground/[0.04] disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150 ease-[var(--mx-ease)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div
        ref={railRef}
        data-testid="recommendation-rail"
        role="group"
        aria-label={`${title}, ${visible.length} tiles. Arrow keys scroll.`}
        tabIndex={0}
        onScroll={sync}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
        onKeyDown={onKeyDown}
        className={cn(
          "flex gap-3 overflow-x-auto overscroll-x-contain pb-1 -mx-0.5 px-0.5 rounded-lg",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          // Snap resumes after a drag; during one it would fight the pointer.
          dragging ? "snap-none select-none cursor-grabbing" : "snap-x snap-mandatory",
          !dragging && !(atStart && atEnd) && "[@media(hover:hover)]:cursor-grab",
        )}
      >
        {visible.map((r) => (
          <Tile
            key={r.id}
            rec={r}
            onOpen={(rec) => setOpenId(rec.id)}
            onApprove={scopeId ? approve : undefined}
            onDismiss={scopeId ? dismiss : undefined}
          />
        ))}
      </div>

      {/* Dots up to eight pages; past that a row of dots is noise on a
          phone (23 tiles is 23 pages at 390 px) and the "n / m" indicator
          in the head already says where you are. */}
      {pages > 1 && pages <= MAX_DOTS && (
        <div className="flex items-center justify-center gap-0.5" role="group" aria-label={`${title} pages`}>
          {Array.from({ length: pages }, (_, i) => (
            <button
              key={i}
              type="button"
              data-testid="recommendation-page-dot"
              aria-label={`Page ${i + 1} of ${pages}`}
              aria-current={i === page ? "true" : undefined}
              onClick={() => goToPage(i)}
              className="h-6 w-6 inline-flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "block h-1.5 rounded-full transition-colors duration-150 ease-[var(--mx-ease)]",
                  i === page ? "w-4 bg-interactive" : "w-1.5 bg-muted-foreground/40",
                )}
              />
            </button>
          ))}
        </div>
      )}

      {openRec && (
        <RecommendationDrawer
          rec={openRec}
          open
          onClose={() => setOpenId(null)}
          onApprove={scopeId ? () => approve(openRec) : undefined}
          onDismiss={scopeId ? () => dismiss(openRec) : undefined}
        />
      )}
    </section>
  );
}
