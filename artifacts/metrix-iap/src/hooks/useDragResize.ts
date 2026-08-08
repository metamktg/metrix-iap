// ─── Drag-to-resize handle ──────────────────────────────────────────────
// Shared pointer-drag primitive for resizable sidebars/panels (left nav,
// right-rail panels). Reports raw horizontal delta from drag start; callers
// decide the sign/clamping since a left-edge handle and a right-edge handle
// grow the panel in opposite directions.
import { useCallback, useRef } from "react";

export function useDragResize(
  onDrag: (deltaX: number) => void,
  onDragEnd?: (wasDragged: boolean) => void
) {
  const startXRef = useRef(0);
  const draggedRef = useRef(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      startXRef.current = e.clientX;
      draggedRef.current = false;

      const handleMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startXRef.current;
        if (Math.abs(dx) > 3) draggedRef.current = true;
        onDrag(dx);
      };
      const handleUp = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        onDragEnd?.(draggedRef.current);
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [onDrag, onDragEnd]
  );

  return onPointerDown;
}
