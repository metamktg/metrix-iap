// ─── Resize handle ───────────────────────────────────────────────────────
// The one edge handle every resizable panel uses: a WAI-ARIA window
// splitter (focusable separator carrying the width it separates on) that
// moves on the arrow keys, jumps to the bounds on Home / End, toggles
// expanded on Enter / Space, and drags with a pointer. The sidebar's handle
// was the first to get this right; the task tray's had the attributes and
// none of the behaviour. Now they share it.
//
// `edge` says which side of its panel the handle sits on, so dragging away
// from the panel always grows it whichever side it lives on.

import { useCallback } from "react";
import { cn } from "@workspace/command-deck/lib/utils";
import { useDragResize } from "@/hooks/useDragResize";
import { clampWidth, type PanelBounds } from "@/lib/panel-prefs";

const RESIZE_KEY_STEP = 24;

export function ResizeHandle({
  label,
  width,
  bounds,
  edge,
  onWidth,
  onCommit,
  onToggle,
  className,
  testId,
}: {
  /** Accessible name — "Deep dive width", "Task tray width". */
  label: string;
  width: number;
  bounds: PanelBounds;
  /** The panel edge the handle sits on. */
  edge: "left" | "right";
  /** Live width while dragging or stepping. */
  onWidth: (w: number) => void;
  /** Called on pointer release with whether the pointer actually moved. */
  onCommit?: (wasDragged: boolean) => void;
  /** Enter / Space — toggle expanded. */
  onToggle?: () => void;
  className?: string;
  testId?: string;
}) {
  // A handle on the LEFT edge grows its panel when dragged left (negative dx).
  const sign = edge === "left" ? -1 : 1;
  const startWidth = { current: width };
  const onDrag = useCallback((dx: number) => { onWidth(clampWidth(startWidth.current + sign * dx, bounds)); }, [onWidth, bounds, sign, startWidth]);
  const onPointerDown = useDragResize(onDrag, (wasDragged) => onCommit?.(wasDragged));
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={bounds.min}
      aria-valuemax={bounds.max}
      aria-valuenow={width}
      aria-valuetext={width >= bounds.max ? "Expanded" : width <= bounds.min ? "Narrowest" : `${width} pixels`}
      title="Drag to resize · arrows step · Home/End narrowest/widest · Enter toggles"
      data-testid={testId ?? "resize-handle"}
      onPointerDown={(e) => { startWidth.current = width; onPointerDown(e); }}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          const towardGrow = edge === "left" ? e.key === "ArrowLeft" : e.key === "ArrowRight";
          onWidth(clampWidth(width + (towardGrow ? RESIZE_KEY_STEP : -RESIZE_KEY_STEP), bounds));
          onCommit?.(true);
        } else if (e.key === "Home") {
          e.preventDefault();
          onWidth(bounds.min);
          onCommit?.(true);
        } else if (e.key === "End") {
          e.preventDefault();
          onWidth(bounds.max);
          onCommit?.(true);
        } else if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle?.();
        }
      }}
      className={cn(
        "absolute top-0 h-full w-2 z-10 cursor-col-resize group/handle flex items-center justify-center",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        edge === "left" ? "left-0 -ml-1" : "right-0 -mr-1",
        className,
      )}
    >
      <span className="w-px h-full bg-transparent group-hover/handle:bg-primary/40 group-focus-visible/handle:bg-primary/60 transition-colors" />
    </div>
  );
}
