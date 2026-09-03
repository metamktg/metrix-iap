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
import { useLocation, useSearch } from "wouter";
import { navTree, resolveNavLocation, sectionLandingRoute, type NavSection } from "./navTree";

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

// ─── The ?from= origin ──────────────────────────────────────────────────
//
// Loop links carry their origin in the URL (`?from=<section id>` plus the
// cell or hypothesis that started the hop) so a copied link still knows
// where it came from — history does not survive a paste. The table below
// turns that origin into a Back target: where to go, what the button says,
// what the crumb reads. Keyed by navTree SECTION ID, so any section can be
// an origin: Analysis and Strategy have a cell/hypothesis-aware hop, every
// other section unwinds to its command center. Before this was a two-branch
// `if` — a link from Creative or MST carried `from=creative` and produced
// no crumb at all.

export interface FromOrigin {
  from: string | null;
  fromCell: string | null;
  fromHyp: string | null;
}

export interface FromTarget {
  /** Where Back goes. */
  to: string;
  /** The Back button's label ("Back to cell C2B"). */
  label: string;
  /** The crumb's origin text ("Strategy Map · C2B"). */
  crumb: string;
}

function parseFromOrigin(search: string): FromOrigin {
  const p = new URLSearchParams(search);
  return { from: p.get("from"), fromCell: p.get("fromCell"), fromHyp: p.get("fromHyp") };
}

type OriginResolver = (fp: FromOrigin, section: NavSection) => FromTarget;

const ORIGIN_RESOLVERS: Record<string, OriginResolver> = {
  analysis: (fp) =>
    fp.fromCell
      ? { to: `/app/analysis/library?focus=${fp.fromCell}`, label: `Back to cell ${fp.fromCell}`, crumb: `Analysis · ${fp.fromCell}` }
      : { to: "/app/analysis/library", label: "Back to Analysis", crumb: "Analysis · IAP Library" },
  strategy: (fp) => {
    if (fp.fromHyp) {
      return { to: `/app/strategy/hypotheses?focus=${fp.fromHyp}`, label: "Back to Hypothesis", crumb: `Strategy · ${fp.fromHyp}` };
    }
    // The chain unwinds one hop at a time. A brief reached from a strategy
    // page that was itself reached from an analysis cell goes back to that
    // strategy page WITH its analysis origin intact, so the next Back still
    // lands on the cell. Dropping the cell here is how a reader ended up on
    // a bare Strategy Map with no way back to the row that started it.
    return fp.fromCell
      ? { to: `/app/strategy/map?from=analysis&fromCell=${fp.fromCell}`, label: "Back to Strategy Map", crumb: `Strategy Map · ${fp.fromCell}` }
      : { to: "/app/strategy/map", label: "Back to Strategy Map", crumb: "Strategy Map" };
  },
};

/** Any other section: back to its command center, named by its label. */
const genericOrigin: OriginResolver = (_fp, section) => {
  const to = sectionLandingRoute(section) ?? section.to ?? "/";
  return { to, label: `Back to ${section.label}`, crumb: section.label };
};

/**
 * The Back target a `?from=` origin resolves to, or null when the param is
 * absent or names no section (so a page without the param is unaffected).
 */
export function fromOriginTarget(fp: FromOrigin): FromTarget | null {
  if (!fp.from) return null;
  const section = navTree.find((s) => s.id === fp.from);
  if (!section) return null;
  return (ORIGIN_RESOLVERS[section.id] ?? genericOrigin)(fp, section);
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
  const search = useSearch();
  const history = useNavigationHistory();
  const previous =
    history.length >= 2 && history[history.length - 1] === location
      ? history[history.length - 2]!
      : null;
  // With nothing recorded behind this page, a `?from=` origin beats the
  // structural parent: a deep-linked brief that says it came from cell C2B
  // goes back to that cell, not to the Creative command center.
  const origin = fromOriginTarget(parseFromOrigin(search));
  const parent = structuralParent(location);
  const to = previous ?? origin?.to ?? parent;
  const viaHistory = previous != null;
  const go = useCallback(() => {
    if (viaHistory) window.history.back();
    else if (to) navigate(to);
  }, [viaHistory, to, navigate]);
  if (!to) return null;
  return { to, viaHistory, go };
}
