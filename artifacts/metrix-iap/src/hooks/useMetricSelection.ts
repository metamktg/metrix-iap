// ─── Customizable metric-tile selection (per-browser, shared by both
// overview pages) ───────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_METRIC_IDS } from "@/lib/data/metricsCatalog";

const STORAGE_KEY = "metrix.overview.metric_tiles.v1";

function readStored(): string[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) return parsed;
    return null;
  } catch {
    return null;
  }
}

function writeStored(ids: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Best-effort persistence — a full/unavailable localStorage should
    // never break the overview page.
  }
}

/**
 * Manages the ordered set of metric ids selected for the overview tile
 * row. Persists to localStorage so the choice survives across visits and
 * is shared by both overview pages (they render the same tile component).
 * `availableIds` scopes selection/defaults to what's actually pickable in
 * the current catalog (e.g. this account's own result events).
 */
export function useMetricSelection(availableIds: string[]) {
  const [selected, setSelected] = useState<string[]>(() => {
    const stored = readStored();
    const base = stored ?? DEFAULT_METRIC_IDS;
    const filtered = base.filter((id) => availableIds.includes(id));
    return filtered.length ? filtered : DEFAULT_METRIC_IDS.filter((id) => availableIds.includes(id));
  });

  // Re-filter if the available catalog changes (e.g. switching accounts
  // with different result events) so stale ids never linger selected.
  useEffect(() => {
    setSelected((prev) => {
      const filtered = prev.filter((id) => availableIds.includes(id));
      if (filtered.length === prev.length) return prev;
      // A slot the catalog just withdrew (a cost tile under an awareness
      // scope, say) is refilled from the defaults that ARE available, so
      // a scope change never leaves the row short; a reader's own toggle
      // still removes a tile for good.
      const backfill = DEFAULT_METRIC_IDS.filter((id) => availableIds.includes(id) && !filtered.includes(id));
      return [...filtered, ...backfill].slice(0, Math.max(prev.length, filtered.length));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableIds.join(",")]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      writeStored(next);
      return next;
    });
  }, []);

  const move = useCallback((id: string, direction: -1 | 1) => {
    setSelected((prev) => {
      const idx = prev.indexOf(id);
      if (idx === -1) return prev;
      const next = [...prev];
      const swapWith = idx + direction;
      if (swapWith < 0 || swapWith >= next.length) return prev;
      [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
      writeStored(next);
      return next;
    });
  }, []);

  /** Swap one selected metric for another in place (unified tile dropdown). */
  const replace = useCallback((oldId: string, newId: string) => {
    setSelected((prev) => {
      const idx = prev.indexOf(oldId);
      if (idx === -1 || prev.includes(newId)) return prev;
      const next = [...prev];
      next[idx] = newId;
      writeStored(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    const next = DEFAULT_METRIC_IDS.filter((id) => availableIds.includes(id));
    writeStored(next);
    setSelected(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableIds.join(",")]);

  return { selected, toggle, move, replace, reset };
}

/**
 * Generic configurable tile selection hook — same pattern as
 * useMetricSelection but the storage key and default ids are passed in
 * so different surfaces (overview vs library) can each persist
 * independently.
 */
export function useTileSelection(
  availableIds: string[],
  opts: { storageKey: string; defaultIds: string[] }
) {
  const { storageKey, defaultIds } = opts;

  function readStored(): string[] | null {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) return parsed as string[];
      return null;
    } catch {
      return null;
    }
  }

  function writeStored(ids: string[]) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(ids));
    } catch { /* best-effort */ }
  }

  const [selected, setSelected] = useState<string[]>(() => {
    const stored = readStored();
    const base = stored ?? defaultIds;
    const filtered = base.filter((id) => availableIds.includes(id));
    return filtered.length ? filtered : defaultIds.filter((id) => availableIds.includes(id));
  });

  useEffect(() => {
    setSelected((prev) => {
      const filtered = prev.filter((id) => availableIds.includes(id));
      if (filtered.length === prev.length) return prev;
      // A slot the catalog just withdrew (a cost tile under an awareness
      // scope, say) is refilled from the defaults that ARE available, so
      // a scope change never leaves the row short; a reader's own toggle
      // still removes a tile for good.
      const backfill = defaultIds.filter((id) => availableIds.includes(id) && !filtered.includes(id));
      return [...filtered, ...backfill].slice(0, Math.max(prev.length, filtered.length));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableIds.join(",")]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      writeStored(next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const move = useCallback((id: string, direction: -1 | 1) => {
    setSelected((prev) => {
      const idx = prev.indexOf(id);
      if (idx === -1) return prev;
      const next = [...prev];
      const swapWith = idx + direction;
      if (swapWith < 0 || swapWith >= next.length) return prev;
      [next[idx], next[swapWith]] = [next[swapWith]!, next[idx]!];
      writeStored(next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const reset = useCallback(() => {
    const next = defaultIds.filter((id) => availableIds.includes(id));
    writeStored(next);
    setSelected(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableIds.join(","), storageKey]);

  return { selected, toggle, move, reset };
}
