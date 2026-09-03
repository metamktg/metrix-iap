// ─── Panel preferences ───────────────────────────────────────────────────
// One persisted preference record per PANEL KIND — width and whether the
// reader last left it expanded — shared by every slide-over, drawer and
// wide popover so they behave the same way everywhere (owner ask
// 2026-09-03: hover panels and sliders collapsible, expandable, resizable,
// consistent across interfaces). A per-viewer, per-browser convenience in
// localStorage: never shared, never a property of anything on the server.
//
// Widths are validated on load against the kind's own bounds (a stale
// value from a narrower phone never survives into a desktop drawer) and
// fall back to the default; storage failures fall back to memory so the
// panel still works in a private window.

import { useCallback, useSyncExternalStore } from "react";

export interface PanelBounds {
  min: number;
  max: number;
  default: number;
}

export interface PanelPrefs {
  width: number;
  /** True when the reader last left the panel at its expanded (max) width. */
  expanded: boolean;
}

const KEY_PREFIX = "metrix.panel.v1::";
const memory = new Map<string, PanelPrefs>();
const listeners = new Map<string, Set<() => void>>();

export const clampWidth = (w: number, b: PanelBounds): number => Math.min(b.max, Math.max(b.min, Math.round(w)));

function read(kind: string, bounds: PanelBounds): PanelPrefs {
  const cached = memory.get(kind);
  if (cached) return cached;
  let prefs: PanelPrefs = { width: bounds.default, expanded: false };
  try {
    const raw = localStorage.getItem(KEY_PREFIX + kind);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PanelPrefs>;
      const width = typeof parsed.width === "number" && Number.isFinite(parsed.width) ? parsed.width : NaN;
      prefs = {
        width: Number.isNaN(width) || width < bounds.min || width > bounds.max ? bounds.default : Math.round(width),
        expanded: parsed.expanded === true,
      };
    }
  } catch {
    /* storage unavailable: defaults */
  }
  memory.set(kind, prefs);
  return prefs;
}

function write(kind: string, prefs: PanelPrefs): void {
  memory.set(kind, prefs);
  try {
    localStorage.setItem(KEY_PREFIX + kind, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
  for (const cb of listeners.get(kind) ?? []) cb();
}

function subscribe(kind: string, cb: () => void): () => void {
  const set = listeners.get(kind) ?? listeners.set(kind, new Set()).get(kind)!;
  set.add(cb);
  return () => {
    set.delete(cb);
  };
}

/** Read for non-React callers. */
function readPanelPrefs(kind: string, bounds: PanelBounds): PanelPrefs {
  return read(kind, bounds);
}

/** Write for non-React callers; widths clamp to the bounds. */
function writePanelPrefs(kind: string, bounds: PanelBounds, next: Partial<PanelPrefs>): PanelPrefs {
  const cur = read(kind, bounds);
  const width = next.width != null ? clampWidth(next.width, bounds) : cur.width;
  const prefs = { width, expanded: next.expanded ?? (width >= bounds.max) };
  write(kind, prefs);
  return prefs;
}


export interface PanelSizeState extends PanelPrefs {
  bounds: PanelBounds;
  setWidth: (w: number) => void;
  /** Toggle between the expanded (max) width and the last non-expanded width. */
  toggleExpanded: () => void;
  expand: () => void;
  collapse: () => void;
}

/**
 * Live width + expanded state for one panel kind, shared by every mount of
 * that kind on the page. `expanded` is width === max; collapsing returns to
 * the last width the reader chose below max (or the default).
 */
export function usePanelSize(kind: string, bounds: PanelBounds): PanelSizeState {
  const prefs = useSyncExternalStore(
    (cb) => subscribe(kind, cb),
    () => read(kind, bounds),
    () => ({ width: bounds.default, expanded: false }),
  );
  const setWidth = useCallback((w: number) => { writePanelPrefs(kind, bounds, { width: w }); }, [kind, bounds]);
  const expand = useCallback(() => {
    const cur = read(kind, bounds);
    // Remember the width to come back to, under a sibling key.
    try { localStorage.setItem(KEY_PREFIX + kind + "::restore", String(cur.width)); } catch { /* ignore */ }
    write(kind, { width: bounds.max, expanded: true });
  }, [kind, bounds]);
  const collapse = useCallback(() => {
    let restore = bounds.default;
    try {
      const raw = localStorage.getItem(KEY_PREFIX + kind + "::restore");
      const n = raw ? parseInt(raw, 10) : NaN;
      if (!Number.isNaN(n) && n >= bounds.min && n < bounds.max) restore = n;
    } catch { /* ignore */ }
    write(kind, { width: restore, expanded: false });
  }, [kind, bounds]);
  const toggleExpanded = useCallback(() => { (read(kind, bounds).expanded ? collapse : expand)(); }, [kind, bounds, expand, collapse]);
  return { ...prefs, bounds, setWidth, toggleExpanded, expand, collapse };
}
