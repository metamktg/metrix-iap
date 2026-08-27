// ─── Reading a breakpoint from JS ─────────────────────────────────────
//
// CSS handles most responsive work, and should. This is for the cases CSS
// cannot express: whether the sidebar is a drawer that traps focus and
// closes on Escape, or a permanent rail that does neither. That is a
// behavioural difference, not a visual one.
//
// Two details that are easy to get wrong:
//
//   · The initial value is read synchronously during the first render, not
//     in an effect. Reading it in an effect renders the desktop shell for
//     one frame on a phone, which is a visible flash of the wrong layout.
//   · It returns a safe default when matchMedia is absent, which is the
//     case in jsdom. Tests then see the desktop shell, which is what the
//     existing suite was written against.

import { useEffect, useState } from "react";

export function useMediaQuery(query: string, fallback = false): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return fallback;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    // Sync once on mount: the query can have changed between the initial
    // render and the effect (an orientation change during hydration).
    setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/**
 * True below Tailwind's `lg` breakpoint (1024px), where the sidebar stops
 * being a rail beside the content and becomes a drawer over it.
 *
 * 1024px rather than `md`: at 768px the expanded sidebar is 216px of a
 * 768px screen, which leaves 552px for a dashboard whose tables want more.
 * The rail is only worth its width once there is enough beside it.
 */
export function useIsCompactShell(): boolean {
  return useMediaQuery("(max-width: 1023.98px)");
}
