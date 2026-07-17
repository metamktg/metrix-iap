// ─── Focus trap hook ──────────────────────────────────────────────────
// Traps keyboard focus within a container element while active.
//
// When the trap is active:
//   - Tab cycles forward through focusable elements (wraps to first after last)
//   - Shift+Tab cycles backward (wraps to last before first)
//   - On mount: saves the previously focused element, moves focus into the container
//   - On unmount: restores focus to the element that was active before the trap
//
// Usage:
//   const panelRef = useRef<HTMLDivElement>(null);
//   useFocusTrap(panelRef, isOpen);

import { useEffect } from "react";

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

export function useFocusTrap(
  containerRef: React.RefObject<HTMLElement | null>,
  active: boolean,
) {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    // Save the element that had focus before the trap activated.
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Move focus into the container (first focusable element, or the container itself).
    const first = container.querySelectorAll<HTMLElement>(FOCUSABLE)[0];
    (first ?? container).focus();

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const focusable = Array.from(container!.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) { e.preventDefault(); return; }
      const firstEl = focusable[0]!;
      const lastEl = focusable[focusable.length - 1]!;

      if (e.shiftKey) {
        if (document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        if (document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    }

    container.addEventListener("keydown", handleKeyDown);
    return () => {
      container.removeEventListener("keydown", handleKeyDown);
      // Return focus on cleanup (drawer close, unmount).
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus();
      }
    };
  }, [active, containerRef]);
}
