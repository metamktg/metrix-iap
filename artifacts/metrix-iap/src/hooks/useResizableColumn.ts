// ─── Resizable, collapsible, remembered column ────────────────────────
//
// The platform already had this behaviour twice — Sidebar and TaskTray both
// build it on `useDragResize` with a base-width ref, a localStorage key and
// a snap-to-collapse threshold. StrategyMapView then hand-rolled a third
// version that had none of it, and was worse in five specific ways:
//
//   · onMouseDown only, so the columns could not be resized by touch or pen
//     at all — the handle was inert on a tablet.
//   · No `document.body.style.cursor` during the drag, so the cursor
//     reverted the moment the pointer left the 1.5px strip, which is
//     immediately.
//   · No `userSelect: none`, so dragging across the panel selected the text
//     underneath it and the drag read as a broken text selection.
//   · Widths in plain `useState`, so every navigation away and back threw
//     the layout away — the one preference on the page that did not
//     survive, while tile metrics, run scope and date range all do.
//   · `role="separator"` with no tabIndex and no key handler: announced to
//     assistive tech as an operable splitter, and not operable.
//
// This hook is that behaviour in one place, so a fourth copy cannot drift
// again. It reports a width, a collapsed flag, the props for the handle,
// and the setters the caller needs.

import { useCallback, useEffect, useRef, useState } from "react";
import { useDragResize } from "./useDragResize";

export interface ResizableColumnOptions {
  /** localStorage key. Widths are a per-browser preference, like tile metrics. */
  storageKey: string;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  /**
   * Which edge the handle sits on, relative to the column it sizes.
   * A handle on the column's LEFT edge grows the column when dragged left,
   * so the delta is inverted. Getting this wrong makes the panel run away
   * from the pointer, which is why it is explicit rather than guessed.
   */
  edge: "left" | "right";
  /**
   * Release below this width to collapse. Omit for a column that cannot be
   * collapsed (the pillar list is the page's primary navigation).
   */
  collapseBelow?: number;
  /** Step for arrow-key resizing. */
  keyStep?: number;
}

export interface ResizableColumn {
  width: number;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  /** Spread onto the handle element. Includes the full splitter a11y contract. */
  handleProps: {
    role: "separator";
    "aria-orientation": "vertical";
    "aria-label": string;
    "aria-valuenow": number;
    "aria-valuemin": number;
    "aria-valuemax": number;
    tabIndex: 0;
    onPointerDown: (e: React.PointerEvent) => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    onDoubleClick: () => void;
  };
}

function readStored(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const n = Number(raw);
    // A stored value outside the current clamps is stale config, not a
    // preference — fall back rather than restoring an unusable layout.
    if (!Number.isFinite(n) || n < min || n > max) return fallback;
    return n;
  } catch {
    return fallback;
  }
}

export function useResizableColumn(
  label: string,
  opts: ResizableColumnOptions,
): ResizableColumn {
  const { storageKey, defaultWidth, minWidth, maxWidth, edge, collapseBelow, keyStep = 16 } = opts;
  const collapseKey = `${storageKey}.collapsed`;

  const [width, setWidth] = useState(() => readStored(storageKey, defaultWidth, minWidth, maxWidth));
  const [collapsed, setCollapsedState] = useState(() => {
    try {
      return localStorage.getItem(collapseKey) === "1";
    } catch {
      return false;
    }
  });

  const baseRef = useRef(width);
  const liveRef = useRef(width);

  const persist = useCallback((w: number) => {
    try {
      localStorage.setItem(storageKey, String(w));
    } catch { /* best-effort */ }
  }, [storageKey]);

  const setCollapsed = useCallback((v: boolean) => {
    setCollapsedState(v);
    try {
      localStorage.setItem(collapseKey, v ? "1" : "0");
    } catch { /* best-effort */ }
  }, [collapseKey]);

  useEffect(() => { liveRef.current = width; }, [width]);

  const clamp = useCallback(
    (w: number) => Math.min(maxWidth, Math.max(minWidth, w)),
    [minWidth, maxWidth],
  );

  const onDrag = useCallback(
    (dx: number) => {
      // A left-edge handle grows its column when the pointer moves LEFT.
      const delta = edge === "left" ? -dx : dx;
      // Allow dragging below minWidth only when a collapse threshold exists,
      // so the snap has somewhere to travel; otherwise hold the floor.
      const floor = collapseBelow != null ? Math.min(minWidth, collapseBelow) - 40 : minWidth;
      const next = Math.min(maxWidth, Math.max(floor, baseRef.current + delta));
      liveRef.current = next;
      setWidth(next);
    },
    [edge, minWidth, maxWidth, collapseBelow],
  );

  const onDragEnd = useCallback(
    (wasDragged: boolean) => {
      if (!wasDragged) return;
      const finished = liveRef.current;
      if (collapseBelow != null && finished < collapseBelow) {
        // Snap shut, but keep the last real width so reopening restores it
        // rather than resetting to the default.
        setCollapsed(true);
        const restore = clamp(baseRef.current);
        setWidth(restore);
        persist(restore);
        return;
      }
      const settled = clamp(finished);
      setWidth(settled);
      persist(settled);
    },
    [collapseBelow, clamp, persist, setCollapsed],
  );

  const pointerDown = useDragResize(onDrag, onDragEnd);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      baseRef.current = width;
      pointerDown(e);
    },
    [pointerDown, width],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // The splitter role promises arrow-key operation. Honour it.
      const grow = edge === "left" ? "ArrowLeft" : "ArrowRight";
      const shrink = edge === "left" ? "ArrowRight" : "ArrowLeft";
      if (e.key === grow || e.key === shrink) {
        e.preventDefault();
        if (collapsed) setCollapsed(false);
        const next = clamp(width + (e.key === grow ? keyStep : -keyStep));
        setWidth(next);
        persist(next);
        return;
      }
      if (collapseBelow != null && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        setCollapsed(!collapsed);
      }
    },
    [edge, keyStep, clamp, width, persist, collapsed, setCollapsed, collapseBelow],
  );

  const onDoubleClick = useCallback(() => {
    if (collapseBelow != null) {
      setCollapsed(!collapsed);
      return;
    }
    setWidth(defaultWidth);
    persist(defaultWidth);
  }, [collapseBelow, collapsed, setCollapsed, defaultWidth, persist]);

  return {
    width,
    collapsed,
    setCollapsed,
    handleProps: {
      role: "separator",
      "aria-orientation": "vertical",
      "aria-label": label,
      "aria-valuenow": collapsed ? 0 : Math.round(width),
      "aria-valuemin": collapseBelow != null ? 0 : minWidth,
      "aria-valuemax": maxWidth,
      tabIndex: 0,
      onPointerDown,
      onKeyDown,
      onDoubleClick,
    },
  };
}
