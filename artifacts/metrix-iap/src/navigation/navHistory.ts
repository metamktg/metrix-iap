// ─── In-app navigation history ─────────────────────────────────────────
//
// The browser knows where you came from; the page does not. A "Back"
// control that only calls history.back() is a lie on a deep link — the
// first in-app page has nothing behind it but the login screen or another
// site — and a control that never uses history sends a reader who arrived
// by six clicks to a page they never visited.
//
// So the shell keeps its own record of the in-app pages visited this
// session, and Back reads it:
//
//   · previous in-app entry exists → history.back(), which is the only way
//     to step back without adding an entry the reader then has to step
//     back over again (the loop the audit was written about);
//   · nothing behind this page → the location's structural parent (its
//     section's command center, or the overview), by navigation.
//
// The stack is deliberately module-level rather than React state: the
// tracker component is mounted once by the shell, the consumers read it
// through a subscription, and the record survives a route chunk remount.

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { useLocation } from "wouter";
import { resolveNavLocation, sectionLandingRoute } from "./navTree";

const MAX = 50;
/** Bottom → top; the last entry is the current location. */
let stack: string[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** The tracker's write path, and the seam tests seed a session with. */
export function recordNavigation(location: string): void {
  const top = stack[stack.length - 1];
  if (top === location) return;
  // Arriving at the page BELOW the top is a step back (the browser's Back
  // button, or ours). Pop rather than push, or every back-and-forth would
  // grow the record and Back would walk it twice.
  if (stack.length >= 2 && stack[stack.length - 2] === location) {
    stack = stack.slice(0, -1);
  } else {
    stack = [...stack.slice(-(MAX - 1)), location];
  }
  emit();
}

export function resetNavigationHistory(): void {
  stack = [];
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function snapshot() {
  return stack;
}

export function useNavigationHistory(): readonly string[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Mounted once by the shell; records every in-app location change. */
export function NavHistoryTracker(): null {
  const [location] = useLocation();
  useEffect(() => {
    recordNavigation(location);
  }, [location]);
  return null;
}

/**
 * The structural parent of a location, for when there is no history to
 * walk: a page → its section's command center; a command center → the
 * overview; the overview → nothing.
 */
function structuralParent(location: string): string | null {
  if (location === "/" || location === "") return null;
  const match = resolveNavLocation(location);
  if (!match) return "/";
  const landing = sectionLandingRoute(match.section) ?? match.section.to ?? "/";
  if (match.atLanding || landing === location) return "/";
  return landing;
}

export type BackTarget = {
  /** Where Back goes — a real path in both modes, so a label can be derived. */
  to: string;
  /** True when Back walks the session record rather than the structure. */
  viaHistory: boolean;
  go: () => void;
};

export function useBackTarget(): BackTarget | null {
  const [location, navigate] = useLocation();
  const history = useNavigationHistory();
  const previous =
    history.length >= 2 && history[history.length - 1] === location
      ? history[history.length - 2]!
      : null;
  const parent = structuralParent(location);
  const to = previous ?? parent;
  const viaHistory = previous != null;
  const go = useCallback(() => {
    if (viaHistory) window.history.back();
    else if (to) navigate(to);
  }, [viaHistory, to, navigate]);
  if (!to) return null;
  return { to, viaHistory, go };
}
