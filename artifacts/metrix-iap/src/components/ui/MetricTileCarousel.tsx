// ─── Metric Tile Carousel ───────────────────────────────────────────
// Horizontally scrollable metric tile strip with left/right chevron
// navigation. Used on overview + analysis pages to show a flexible
// number of metrics without layout shifting.
//
// Implementation: a flex row inside an overflow-x-auto container,
// with chevron buttons that appear when content overflows. Uses
// scrollWidth/clientWidth comparison to show/hide chevrons.

import { useRef, useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CarouselMetric {
  id: string;
  label: string;
  value: string;
  sub?: string;
  onClick?: () => void;
}

interface MetricTileCarouselProps {
  metrics: CarouselMetric[];
  className?: string;
  tileClassName?: string;
  showPicker?: React.ReactNode;
}

export function MetricTileCarousel({ metrics, className, tileClassName, showPicker }: MetricTileCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkOverflow = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    checkOverflow();
    const el = trackRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkOverflow, { passive: true });
    const ro = new ResizeObserver(checkOverflow);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", checkOverflow);
      ro.disconnect();
    };
  }, [checkOverflow, metrics.length]);

  const scroll = useCallback((direction: "left" | "right") => {
    const el = trackRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.75;
    el.scrollBy({ left: direction === "left" ? -amount : amount, behavior: "smooth" });
  }, []);

  return (
    <div className={cn("relative group", className)}>
      {/* Left chevron */}
      <button
        aria-label="Scroll metrics left"
        onClick={() => scroll("left")}
        className={cn(
          "absolute left-1 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-background/80 border border-border/40 backdrop-blur-sm flex items-center justify-center text-muted-foreground hover:text-foreground transition-all",
          canScrollLeft ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
      >
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>

      {/* Right chevron */}
      <button
        aria-label="Scroll metrics right"
        onClick={() => scroll("right")}
        className={cn(
          "absolute right-1 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-background/80 border border-border/40 backdrop-blur-sm flex items-center justify-center text-muted-foreground hover:text-foreground transition-all",
          canScrollRight ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </button>

      <div
        ref={trackRef}
        className="flex gap-3 overflow-x-auto scrollbar-hide scroll-smooth px-6 pt-5 pb-1"
        style={{ scrollbarWidth: "none" }}
      >
        {metrics.map((m) => (
          <button
            key={m.id}
            onClick={m.onClick}
            className={cn(
              "text-left shrink-0 group min-w-0",
              tileClassName ?? "w-[180px] sm:w-[200px]"
            )}
          >
            <div className="mx-card p-4 transition-colors group-hover:border-primary/30 group-hover:bg-primary/[0.02] min-w-0 h-full">
              <div className="relative min-w-0">
                <div className="text-label font-semibold uppercase tracking-[0.14em] text-muted-foreground/70 mb-2">{m.label}</div>
                <div className="text-value font-bold text-foreground tabular-nums leading-none tracking-[-0.035em] break-words">{m.value}</div>
                {m.sub && <div className="text-body text-muted-foreground/70 mt-2 leading-snug">{m.sub}</div>}
              </div>
            </div>
          </button>
        ))}
        {showPicker}
      </div>
    </div>
  );
}
